import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { CartProvider } from '../context/CartContext.jsx';

export const API = 'http://localhost:3001';

export function renderWithProviders(ui, { route = '/', cart = true, ...options } = {}) {
  const Wrapper = ({ children }) => {
    const routed = <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>;
    return cart ? <CartProvider>{routed}</CartProvider> : routed;
  };

  return render(ui, { wrapper: Wrapper, ...options });
}

export function jsonResponse(body, { status = 200, ok } = {}) {
  return {
    ok: ok ?? (status >= 200 && status < 300),
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

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

export function authHeaderOf(fetchMock, callIndex = 0) {
  const [, init] = fetchMock.mock.calls[callIndex];
  return init?.headers?.Authorization ?? init?.headers?.authorization;
}
