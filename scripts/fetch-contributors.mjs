import { graphql } from '@octokit/graphql';
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getDefaultContributors } from '../src/data/contributors.default.mjs';

// Owner/repo, single-sourced from package.json (importing src/config.ts would
// require Node's TS type-stripping, unavailable on older CI runners).
const { repository } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
);
const [, owner, repositoryName] = /github\.com\/([^/]+)\/([^/]+)/.exec(repository);
const { owner: githubOwner, repository: githubRepository } = {
  owner,
  repository: repositoryName,
};

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const cachePath = join(repoRoot, 'data/.contributors-cache.json');
const contributorsPath = join(repoRoot, 'src/data/contributors.json');

function writeJsonFile(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  // Write atomically (temp file + rename) so an interrupted run never leaves
  // a truncated file that would trip the guarded fallback reads below.
  const tmpPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`);
    renameSync(tmpPath, filePath);
  } finally {
    try {
      unlinkSync(tmpPath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
}

function readCache() {
  if (!existsSync(cachePath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(cachePath, 'utf8'));
  } catch {
    return null;
  }
}

function isContributor(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  if (typeof value.username !== 'string' || value.username.length === 0) {
    return false;
  }

  if (value.name !== undefined && typeof value.name !== 'string') {
    return false;
  }

  return ['labels', 'additionalLabels', 'boldLabels'].every(
    (field) =>
      value[field] === undefined ||
      (Array.isArray(value[field]) && value[field].every((label) => typeof label === 'string'))
  );
}

function readContributors() {
  if (!existsSync(contributorsPath)) {
    return null;
  }

  try {
    const contributors = JSON.parse(readFileSync(contributorsPath, 'utf8'));
    return Array.isArray(contributors) && contributors.every(isContributor) ? contributors : null;
  } catch {
    return null;
  }
}

// mutates `contributors`
function mergeContributors(contributors, pullRequests) {
  pullRequests
    .filter(({ author }) => !!author?.login)
    .forEach(({ author, labels }) => {
      const { name, login } = author;
      const contributor = contributors[login] || (contributors[login] = {});
      const labelSet = contributor.labels || (contributor.labels = new Set());

      labels.nodes.filter((label) => !!label.name).forEach((label) => labelSet.add(label.name));

      if (!contributor.name) {
        contributor.name = name;
      }
    });
}

// mutates `contributors`
function mergeContributorsFromCache(contributors, cachedContributors) {
  cachedContributors.forEach(({ name, username, labels }) => {
    const contributor = contributors[username] || (contributors[username] = {});
    const labelSet = contributor.labels || (contributor.labels = new Set());

    labels?.forEach((label) => labelSet.add(label));

    if (!contributor.name) {
      contributor.name = name;
    }
  });
}

function toContributorData(contributors) {
  return Object.entries(contributors).map(([username, contributor]) => ({
    username,
    ...contributor,
    name: contributor.name || username,
    labels: [...(contributor.labels || [])],
  }));
}

const githubToken = process.env.GITHUB_TOKEN;
if (!githubToken) {
  console.info('No GitHub token found (GITHUB_TOKEN env var), skipping contributors list');

  // Never overwrite a valid existing contributors file without a token: it may
  // hold real data fetched in a previous run. Bootstrap defaults when the file
  // is missing, unreadable, or malformed.
  if (readContributors() === null) {
    writeJsonFile(contributorsPath, toContributorData(getDefaultContributors()));
  } else {
    console.info(`Keeping existing ${contributorsPath}`);
  }
} else {
  const graphqlGh = graphql.defaults({
    headers: {
      authorization: `bearer ${githubToken}`,
    },
  });

  const contributors = getDefaultContributors();
  const owner = githubOwner;
  const repoName = githubRepository;

  const cache = readCache();
  const lastUpdated =
    Array.isArray(cache?.contributors) && cache.contributors.every(isContributor)
      ? (cache.lastUpdated ?? null)
      : null;
  const cachedContributors = Array.isArray(cache?.contributors)
    ? cache.contributors.filter(isContributor)
    : [];
  mergeContributorsFromCache(contributors, cachedContributors);
  const newLastUpdated = Date.now();

  const getPullRequests = async (cursor) => {
    const { repository } = await graphqlGh(
      `
      query fetchPullRequests($cursor: String, $owner: String!, $repository: String!) {
        repository(owner: $owner, name: $repository) {
          pullRequests(
            first: 100
            after: $cursor
            states: [MERGED]
            orderBy: {field: UPDATED_AT, direction: DESC}
          ) {
            pageInfo {
              endCursor
              hasNextPage
            }
            nodes {
              updatedAt
              labels(first: 50) {
                nodes {
                  name
                }
              }
              author {
                ... on User {
                  name
                  login
                }
              }
            }
          }
        }
      }`,
      {
        cursor,
        owner,
        repository: repoName,
      }
    );

    return repository?.pullRequests;
  };

  let lastResponse = null;
  try {
    do {
      lastResponse = await getPullRequests(lastResponse?.pageInfo?.endCursor ?? null);
      mergeContributors(contributors, lastResponse.nodes);
    } while (
      lastResponse.pageInfo?.hasNextPage &&
      (!lastUpdated || lastUpdated <= new Date(lastResponse.nodes.at(-1)?.updatedAt))
    );
  } catch (error) {
    // A GitHub API failure must not block dev or build: keep the previously
    // fetched data (or bootstrap the defaults) and continue.
    console.warn('Failed to fetch contributors from GitHub, using existing data:', error.message);
    if (readContributors() === null) {
      writeJsonFile(contributorsPath, toContributorData(getDefaultContributors()));
    }
    process.exit(0);
  }

  const contributorsData = toContributorData(contributors);
  writeJsonFile(cachePath, { lastUpdated: newLastUpdated, contributors: contributorsData });
  writeJsonFile(contributorsPath, contributorsData);
}
