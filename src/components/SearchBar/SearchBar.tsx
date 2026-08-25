import type { Meilisearch } from 'meilisearch';
import type * as MeilisearchModule from 'meilisearch';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { siteConfig } from '../../config';
import Dialog from '../Dialog/Dialog';
import Search from '../icons/Search';
import type { HomepageYear } from './autocomplete';
import './SearchBar.css';
import type * as SearchModalModule from './SearchModal';
type LoadedSearch = {
  searchClient: Meilisearch;
  SearchModal: typeof SearchModalModule.default;
};
type SearchModules = [typeof MeilisearchModule, typeof SearchModalModule];
interface SearchBarProps {
  section?: string;
  years?: HomepageYear[];
}
const SearchBar = ({ section, years }: SearchBarProps) => {
  const [open, setOpen] = useState(false);
  const [filterBySection, setFilterBySection] = useState(true);
  const searchResourcesPromiseRef = useRef<Promise<SearchModules> | null>(null);
  const searchTriggerRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const returnDialogRef = useRef<HTMLElement | null>(null);
  const returnFocusTimeoutRef = useRef<number | null>(null);
  const cancelPendingFocusReturn = useCallback(() => {
    if (returnFocusTimeoutRef.current !== null) {
      window.clearTimeout(returnFocusTimeoutRef.current);
      returnFocusTimeoutRef.current = null;
    }
  }, []);
  const handleOpenSearch = useCallback(
    (event?: React.MouseEvent<HTMLButtonElement>) => {
      if (open) {
        return;
      }
      cancelPendingFocusReturn();
      const focusTarget = event?.currentTarget ?? document.activeElement;
      returnFocusRef.current = focusTarget instanceof HTMLElement ? focusTarget : null;
      returnDialogRef.current =
        focusTarget instanceof HTMLElement
          ? focusTarget.closest<HTMLElement>('[role="dialog"][aria-modal="true"]')
          : null;
      setOpen(true);
    },
    [cancelPendingFocusReturn, open]
  );
  const handleCloseSearch = useCallback(() => {
    if (!open) {
      return;
    }
    setOpen(false);
    cancelPendingFocusReturn();
    returnFocusTimeoutRef.current = window.setTimeout(() => {
      returnFocusTimeoutRef.current = null;
      const focusTarget = returnFocusRef.current;
      const dialog = returnDialogRef.current;
      returnFocusRef.current = null;
      returnDialogRef.current = null;
      const isDocumentRoot =
        focusTarget === document.body || focusTarget === document.documentElement;
      if (focusTarget?.isConnected && !isDocumentRoot) {
        focusTarget.focus();
        if (document.activeElement === focusTarget) {
          return;
        }
      }
      if (dialog?.isConnected && !dialog.hidden && dialog.getAttribute('aria-hidden') !== 'true') {
        dialog.focus();
        if (document.activeElement === dialog) {
          return;
        }
      }
      const trigger = searchTriggerRef.current;
      if (trigger?.isConnected) {
        trigger.focus();
      }
    }, 0);
  }, [cancelPendingFocusReturn, open]);
  const handleToggleFilterBySection = useCallback(() => {
    setFilterBySection((value) => !value);
  }, []);
  const { host, apiKey, indexName } = siteConfig.search;
  const [searchResources, setSearchResources] = useState<LoadedSearch | null>(null);
  useEffect(() => () => cancelPendingFocusReturn(), [cancelPendingFocusReturn]);
  useEffect(() => {
    if (!open || searchResources) {
      return;
    }
    let cancelled = false;
    const searchResourcesPromise =
      searchResourcesPromiseRef.current ??
      (searchResourcesPromiseRef.current = Promise.all([
        import('meilisearch'),
        import('./SearchModal'),
      ]));
    void searchResourcesPromise
      .then(([{ Meilisearch }, { default: SearchModal }]) => {
        if (cancelled) {
          return;
        }
        setSearchResources({
          searchClient: new Meilisearch({ host, apiKey }),
          SearchModal,
        });
      })
      .catch(() => {
        if (searchResourcesPromiseRef.current === searchResourcesPromise)
          searchResourcesPromiseRef.current = null;
        if (!cancelled) handleCloseSearch();
      });
    return () => {
      cancelled = true;
    };
  }, [open, searchResources, host, apiKey, handleCloseSearch]);
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        const nextFilterBySection = !event.shiftKey;
        if (!open) {
          setFilterBySection(nextFilterBySection);
          handleOpenSearch();
        } else if (filterBySection !== nextFilterBySection) {
          setFilterBySection(nextFilterBySection);
        } else {
          handleCloseSearch();
        }
      }
      if (
        event.key === 'Escape' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey &&
        open
      ) {
        handleCloseSearch();
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [filterBySection, handleCloseSearch, handleOpenSearch, open]);
  const searchClient = searchResources?.searchClient;
  const SearchModal = searchResources?.SearchModal;
  return (
    <>
      <button
        ref={searchTriggerRef}
        className='search-button'
        aria-label='Search'
        onClick={handleOpenSearch}
      >
        <Search className='search-button--icon' />
        <span className='search-button--label'>Search</span>
        <span className='search-button--keybinds'>
          <kbd>CTRL</kbd>
          <kbd>K</kbd>
        </span>
      </button>
      <Dialog open={open} onClose={handleCloseSearch} label='Search'>
        {searchClient && SearchModal && (
          <SearchModal
            searchClient={searchClient}
            indexName={indexName}
            onClose={handleCloseSearch}
            section={section}
            years={years}
            filterBySection={filterBySection}
            handleToggleFilterBySection={handleToggleFilterBySection}
          />
        )}
      </Dialog>
    </>
  );
};
export default SearchBar;
