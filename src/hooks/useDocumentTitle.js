import { useEffect } from 'react';

/**
 * useDocumentTitle
 * Sets document.title on mount and whenever `title` changes.
 * No cleanup on unmount — each page component sets its own title,
 * so the last-rendered page's title naturally persists until the
 * next route's component runs its own effect.
 *
 * Usage:
 *   useDocumentTitle('Shop All Sneakers | Drop Site');
 *
 * Chosen over react-helmet-async because:
 * - This is a pure SPA (no SSR) — document.title is enough
 * - OG/meta tags are global defaults in index.html and don't
 *   need per-page overrides for the current scope
 * - Zero extra bundle cost, zero config
 */
export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
