/**
 * Shared helpers for component tests.
 *
 * Deliberately small: no msw is installed, and a hand-rolled fetch router keeps
 * the mocking visible at the call site rather than hidden in a service worker.
 */
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { CartProvider } from '../context/CartContext.jsx';

/** Matches the API_BASE fallback every component uses when VITE_API_URL is unset. */
export const API = 'http://localhost:3001';

/**
 * Renders with the providers the app supplies in production.
 *
 * ProductCard needs both (useNavigate + useCart); the admin pages need the
 * router because AdminNav uses Link/useLocation. Passing `cart: false` skips
 * CartProvider for components that do not consume it.
 */
export function renderWithProviders(ui, { route = '/', cart = true, ...options } = {}) {
  const Wrapper = ({ children }) => {
    const routed = <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>;
    return cart ? <CartProvider>{routed}</CartProvider> : routed;
  };

  return render(ui, { wrapper: Wrapper, ...options });
}

/** Builds a Response-like object good enough for the code under test. */
export function jsonResponse(body, { status = 200, ok } = {}) {
  return {
    ok: ok ?? (status >= 200 && status < 300),
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/**
 * Installs a global fetch stub that routes on `METHOD /path`.
 *
 * Node 18+ has a real global fetch, so an unmocked call is a live request to
 * localhost:3001 — a hanging test rather than a clear failure. Anything not in
 * the route map rejects loudly instead.
 *
 *   const fetchMock = mockFetch({
 *     'GET /api/admin/orders': jsonResponse({ orders: [] }),
 *     'PATCH /api/admin/orders/cs_1/status': jsonResponse({ success: true }),
 *   });
 *
 * A value may be a response object, or a function receiving (url, init).
 */
export function mockFetch(routes = {}) {
  const fetchMock = vi.fn(async (url, init = {}) => {
    const method = (init.method || 'GET').toUpperCase();
    const path = String(url).replace(API, '');
    const key = `${method} ${path}`;

    const handler = routes[key] ?? routes[String(url)] ?? routes[path];

    if (handler === undefined) {
      throw new Error(
        `Unstubbed fetch: ${key}\nStubbed routes:\n  ${Object.keys(routes).join('\n  ') || '(none)'}`
      );
    }

    return typeof handler === 'function' ? handler(url, init) : handler;
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Reads the Authorization header off a recorded fetch call. */
export function authHeaderOf(fetchMock, callIndex = 0) {
  const [, init] = fetchMock.mock.calls[callIndex];
  return init?.headers?.Authorization ?? init?.headers?.authorization;
}
