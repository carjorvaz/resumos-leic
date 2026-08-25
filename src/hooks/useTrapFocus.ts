import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';

interface UseTrapFocusOptions {
  containerRef: RefObject<HTMLElement | null>;
  active: boolean;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function isVisible(element: HTMLElement): boolean {
  if (!element.isConnected) {
    return false;
  }

  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    if (
      current.hidden ||
      current.hasAttribute('inert') ||
      current.getAttribute('aria-hidden') === 'true'
    ) {
      return false;
    }

    const style = window.getComputedStyle(current);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.visibility === 'collapse'
    ) {
      return false;
    }
  }

  return true;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => {
      if (element.hasAttribute('disabled')) {
        return false;
      }
      if (element.closest('fieldset[disabled]')) {
        return false;
      }
      return element.tabIndex >= 0 && isVisible(element);
    }
  );
}

function focusAndVerify(element: HTMLElement): boolean {
  element.focus();
  return document.activeElement === element;
}

export function useTrapFocus({ containerRef, active }: UseTrapFocusOptions): void {
  useLayoutEffect(() => {
    if (!active || !containerRef.current) {
      return undefined;
    }

    const container = containerRef.current;
    const focusTimer = window.setTimeout(() => {
      const initialTarget = getFocusableElements(container)[0] ?? container;
      focusAndVerify(initialTarget);
    }, 50);

    function trapFocus(event: KeyboardEvent): void {
      if (event.key !== 'Tab') {
        return;
      }

      const focusableElements = getFocusableElements(container);
      if (focusableElements.length === 0) {
        event.preventDefault();
        focusAndVerify(container);
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;
      const activeInside =
        activeElement instanceof HTMLElement && container.contains(activeElement);

      if (event.shiftKey) {
        if (!activeInside || activeElement === container || activeElement === firstElement) {
          event.preventDefault();
          focusAndVerify(lastElement);
        }
      } else if (!activeInside || activeElement === container || activeElement === lastElement) {
        event.preventDefault();
        focusAndVerify(firstElement);
      }
    }

    container.addEventListener('keydown', trapFocus);

    return () => {
      window.clearTimeout(focusTimer);
      container.removeEventListener('keydown', trapFocus);
    };
  }, [active, containerRef]);
}
