const container = document.querySelector<HTMLElement>('.page-container');
const button = document.querySelector<HTMLButtonElement>('.sidebar-button');
const sidebar = document.querySelector<HTMLElement>('.sidebar');
const mask = document.querySelector<HTMLElement>('.sidebar-mask');
const mobile = window.matchMedia('(max-width: 1199px)');
let focusTimer: number | undefined;

function setOpen(open: boolean, restoreFocus = false) {
  if (!container || !button || !sidebar) return;
  window.clearTimeout(focusTimer);
  focusTimer = undefined;

  const isOpen = mobile.matches && open;
  container.classList.toggle('sidebar-open', isOpen);
  document.body.classList.toggle('body--sidebar-open', isOpen);
  button.setAttribute('aria-expanded', String(isOpen));
  button.setAttribute(
    'aria-label',
    isOpen ? 'Fechar navegação da cadeira' : 'Abrir navegação da cadeira'
  );
  sidebar.inert = mobile.matches && !isOpen;

  if (isOpen) {
    focusTimer = window.setTimeout(() => {
      const target =
        sidebar.querySelector<HTMLElement>('[aria-current="page"]') ??
        sidebar.querySelector<HTMLElement>('a');
      target?.scrollIntoView({ block: 'center' });
      target?.focus();
    }, 50);
  } else if (restoreFocus) {
    button.focus();
  }
}

button?.addEventListener('click', () => {
  setOpen(!container?.classList.contains('sidebar-open'), true);
});
mask?.addEventListener('click', () => setOpen(false, true));
sidebar?.addEventListener('click', (event) => {
  if (event.target instanceof Element && event.target.closest('a')) setOpen(false);
});
document.addEventListener('keydown', (event) => {
  if (!container?.classList.contains('sidebar-open') || !button || !sidebar) return;

  if (event.key === 'Escape') {
    event.preventDefault();
    setOpen(false, true);
    return;
  }

  if (event.key === 'Tab') {
    const focusable = [button, ...sidebar.querySelectorAll<HTMLElement>('a[href]')];
    const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
    const nextIndex =
      currentIndex === -1
        ? event.shiftKey
          ? focusable.length - 1
          : 0
        : (currentIndex + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
    event.preventDefault();
    focusable[nextIndex]?.focus();
  }
});
mobile.addEventListener('change', () => setOpen(false));
window.addEventListener('pagehide', () => window.clearTimeout(focusTimer));
window.addEventListener('pageshow', () => setOpen(false));
setOpen(false);
