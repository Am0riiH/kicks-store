import '@testing-library/jest-dom';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * jsdom omits a handful of browser APIs that components in this app call on
 * every render. Only genuinely universal gaps are polyfilled here — anything
 * specific to one component (canvas, createImageBitmap, window.confirm) is
 * stubbed inside that component's own test, where the stub is visible.
 */

// useImageUpload creates and revokes object URLs for the image preview.
if (!URL.createObjectURL) {
  URL.createObjectURL = vi.fn(() => `blob:mock/${Math.random().toString(36).slice(2)}`);
}
if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = vi.fn();
}

// Not implemented in jsdom at all.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
}

if (!global.ResizeObserver) {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

beforeEach(() => {
  // Both admin pages read sessionStorage in a lazy useState initialiser, so a
  // leaked 'adminAuth' key from a previous test would silently render the
  // authenticated branch instead of the login form.
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
