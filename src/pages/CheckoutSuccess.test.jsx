import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CheckoutSuccess from './CheckoutSuccess.jsx';
import { CartProvider } from '../context/CartContext.jsx';
import { mockFetch, jsonResponse, API } from '../test/utils.jsx';

/**
 * The success page is the only thing standing between "Stripe redirected me"
 * and "my order actually exists". It polls /api/order-status up to 4 times,
 * 1.5s apart, because the redirect routinely beats the webhook.
 *
 * Fake timers drive the retry schedule so the tests do not wait 4.5 real
 * seconds; `shouldAdvanceTime` keeps userEvent-free awaits from deadlocking.
 */

const ORDER_STATUS = (sessionId) => `GET /api/order-status?session_id=${sessionId}`;
const SESSION = 'cs_test_123';

const renderAt = (search = `?session_id=${SESSION}`) =>
  render(
    <CartProvider>
      <MemoryRouter initialEntries={[`/checkout/success${search}`]}>
        <CheckoutSuccess />
      </MemoryRouter>
    </CartProvider>
  );

const confirmedOrder = (over = {}) => ({
  found: true,
  id: SESSION,
  amount_total: 18000,
  currency: 'usd',
  customer_name: 'Ada Lovelace',
  customer_email: 'ada@example.com',
  items: [{ description: 'Chicago', quantity: 1, amount: 18000 }],
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('no session_id', () => {
  it('shows the generic fallback without calling the API', async () => {
    const fetchMock = mockFetch({});
    renderAt('');

    expect(await screen.findByRole('heading', { name: /nothing to confirm/i })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('confirmed order', () => {
  it('renders the order details', async () => {
    mockFetch({ [ORDER_STATUS(SESSION)]: jsonResponse(confirmedOrder()) });
    renderAt();

    expect(await screen.findByRole('heading', { name: /order confirmed/i })).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    // Description and quantity share one span: "Chicago × 1".
    expect(screen.getByText(/Chicago\s*×\s*1/)).toBeInTheDocument();
  });

  it('formats the total from cents', async () => {
    mockFetch({ [ORDER_STATUS(SESSION)]: jsonResponse(confirmedOrder({ amount_total: 21550 })) });
    renderAt();

    await screen.findByRole('heading', { name: /order confirmed/i });
    expect(screen.getByText(/215\.50/)).toBeInTheDocument();
  });

  it('queries the endpoint with the session id from the URL', async () => {
    const fetchMock = mockFetch({ [ORDER_STATUS(SESSION)]: jsonResponse(confirmedOrder()) });
    renderAt();

    await screen.findByRole('heading', { name: /order confirmed/i });
    expect(fetchMock).toHaveBeenCalledWith(`${API}/api/order-status?session_id=${SESSION}`);
  });

  it('clears the cart exactly once', async () => {
    localStorage.setItem('cart', JSON.stringify([
      { id: 'p1', variant_id: 1, name: 'Chicago', price: 180, qty: 1 },
    ]));
    mockFetch({ [ORDER_STATUS(SESSION)]: jsonResponse(confirmedOrder()) });
    renderAt();

    await screen.findByRole('heading', { name: /order confirmed/i });
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('cart'))).toEqual([])
    );
  });

  it('offers a route back to the store', async () => {
    mockFetch({ [ORDER_STATUS(SESSION)]: jsonResponse(confirmedOrder()) });
    const { container } = renderAt();

    await screen.findByRole('heading', { name: /order confirmed/i });
    expect(container.querySelector('#success-back-to-store')).not.toBeNull();
  });
});

describe('retry behaviour', () => {
  it('shows the loading state before the first response resolves', () => {
    mockFetch({ [ORDER_STATUS(SESSION)]: () => new Promise(() => {}) });
    renderAt();

    expect(screen.getByText(/confirming your order/i)).toBeInTheDocument();
  });

  it('retries a 404 and confirms once the webhook lands', async () => {
    let calls = 0;
    const fetchMock = mockFetch({
      [ORDER_STATUS(SESSION)]: () => {
        calls += 1;
        // The redirect beat the webhook on the first two attempts.
        return Promise.resolve(
          calls < 3
            ? jsonResponse({ found: false }, { status: 404 })
            : jsonResponse(confirmedOrder())
        );
      },
    });
    renderAt();

    await vi.advanceTimersByTimeAsync(5000);

    expect(await screen.findByRole('heading', { name: /order confirmed/i })).toBeInTheDocument();
    expect(fetchMock.mock.calls.length).toBe(3);
  });

  it('falls back to the pending state after 4 failed attempts', async () => {
    const fetchMock = mockFetch({
      [ORDER_STATUS(SESSION)]: jsonResponse({ found: false }, { status: 404 }),
    });
    renderAt();

    await vi.advanceTimersByTimeAsync(6000);

    // Deliberately NOT an error: the payment succeeded, the webhook is just late.
    expect(await screen.findByRole('heading', { name: /payment received/i })).toBeInTheDocument();
    expect(fetchMock.mock.calls.length).toBe(4);
  });

  it('keeps retrying through network errors', async () => {
    let calls = 0;
    mockFetch({
      [ORDER_STATUS(SESSION)]: () => {
        calls += 1;
        if (calls < 3) return Promise.reject(new Error('offline'));
        return Promise.resolve(jsonResponse(confirmedOrder()));
      },
    });
    renderAt();

    await vi.advanceTimersByTimeAsync(5000);

    expect(await screen.findByRole('heading', { name: /order confirmed/i })).toBeInTheDocument();
  });

  it('does not clear the cart while the order is unconfirmed', async () => {
    const cart = [{ id: 'p1', variant_id: 1, name: 'Chicago', price: 180, qty: 1 }];
    localStorage.setItem('cart', JSON.stringify(cart));
    mockFetch({ [ORDER_STATUS(SESSION)]: jsonResponse({ found: false }, { status: 404 }) });
    renderAt();

    await vi.advanceTimersByTimeAsync(6000);
    await screen.findByRole('heading', { name: /payment received/i });

    // The customer must keep their cart if we cannot prove the order exists.
    expect(JSON.parse(localStorage.getItem('cart'))).toHaveLength(1);
  });
});
