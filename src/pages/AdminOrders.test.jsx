import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminOrders from './AdminOrders.jsx';
import { renderWithProviders, mockFetch, jsonResponse, API } from '../test/utils.jsx';

/**
 * Auth is HTTP Basic held in sessionStorage under 'adminAuth' — there is no
 * token and no auth context. Both branches (login form vs dashboard) are chosen
 * by a lazy useState initialiser, so the key must be seeded BEFORE render.
 */

const ORDERS = 'GET /api/admin/orders';
const AUTH = `Basic ${btoa('admin:secret')}`;

const makeOrder = (over = {}) => ({
  id: 'cs_test_abc123',
  created_at: '2026-05-01T10:30:00.000Z',
  customer_name: 'Ada Lovelace',
  customer_email: 'ada@example.com',
  amount_total: 18000,
  currency: 'usd',
  fulfillment_status: 'pending',
  items: [{ description: 'Chicago', quantity: 1 }],
  shipping_name: 'Ada Lovelace',
  shipping_line1: '1 Analytical Way',
  shipping_city: 'London',
  shipping_state: null,
  shipping_postal_code: 'E1 6AN',
  shipping_country: 'GB',
  shipping_phone: '+445550001111',
  ...over,
});

const signedIn = () => sessionStorage.setItem('adminAuth', AUTH);

const renderPage = () => renderWithProviders(<AdminOrders />, { cart: false });

/**
 * The status FILTER buttons are labelled 'all' / 'pending' / 'completed' /
 * 'rejected' — exactly the same words as the status BADGES in each row. Queries
 * for a status must be scoped to the table or they match both.
 */
const inTable = () => within(screen.getByRole('table'));

beforeEach(() => {
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});

describe('login form', () => {
  it('renders when there is no stored credential', () => {
    mockFetch({});
    renderPage();

    expect(screen.getByRole('heading', { name: 'Admin Login' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('sends a Basic header built from the typed credentials', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch({ [ORDERS]: jsonResponse({ orders: [] }) });
    const { container } = renderPage();

    await user.type(container.querySelector('input[type="text"]'), 'admin');
    await user.type(container.querySelector('input[type="password"]'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API}/api/admin/orders`);
    expect(init.headers.Authorization).toBe(`Basic ${btoa('admin:secret')}`);
  });

  it('stores the credential and shows the dashboard on success', async () => {
    const user = userEvent.setup();
    mockFetch({ [ORDERS]: jsonResponse({ orders: [makeOrder()] }) });
    const { container } = renderPage();

    await user.type(container.querySelector('input[type="text"]'), 'admin');
    await user.type(container.querySelector('input[type="password"]'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(sessionStorage.getItem('adminAuth')).toBe(AUTH);
  });

  it('reports invalid credentials on a 401 and stores nothing', async () => {
    const user = userEvent.setup();
    mockFetch({ [ORDERS]: jsonResponse({ error: 'Authentication required.' }, { status: 401 }) });
    const { container } = renderPage();

    await user.type(container.querySelector('input[type="text"]'), 'admin');
    await user.type(container.querySelector('input[type="password"]'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
    expect(sessionStorage.getItem('adminAuth')).toBeNull();
  });

  it('reports a server error distinctly from bad credentials', async () => {
    const user = userEvent.setup();
    mockFetch({ [ORDERS]: jsonResponse({ error: 'boom' }, { status: 500 }) });
    const { container } = renderPage();

    await user.type(container.querySelector('input[type="text"]'), 'admin');
    await user.type(container.querySelector('input[type="password"]'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(await screen.findByText(/Server error/)).toBeInTheDocument();
  });
});

describe('session restore', () => {
  it('loads orders straight away when a credential is stored', async () => {
    signedIn();
    const fetchMock = mockFetch({ [ORDERS]: jsonResponse({ orders: [makeOrder()] }) });

    renderPage();

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(AUTH);
  });

  it('shows the loading state on the very first paint, not an empty dashboard', () => {
    signedIn();
    mockFetch({ [ORDERS]: () => new Promise(() => {}) });

    renderPage();

    // `loading` is seeded from sessionStorage rather than flipped on inside the
    // mount effect. Setting it in the effect meant the first render painted the
    // dashboard with zero orders — a flash of "No orders found" on every reload
    // — before a second render corrected it. Asserted synchronously, with no
    // waiting, so it fails if that regresses.
    expect(screen.getByText(/loading orders/i)).toBeInTheDocument();
    expect(screen.queryByText('No orders found')).not.toBeInTheDocument();
  });

  it('silently logs out when the stored credential is rejected', async () => {
    signedIn();
    mockFetch({ [ORDERS]: jsonResponse({ error: 'nope' }, { status: 401 }) });

    renderPage();

    // Dropped back to the login form, with the stale key cleared.
    expect(await screen.findByRole('heading', { name: 'Admin Login' })).toBeInTheDocument();
    expect(sessionStorage.getItem('adminAuth')).toBeNull();
  });

  it('shows a dashboard error with a retry button on a 500', async () => {
    signedIn();
    mockFetch({ [ORDERS]: jsonResponse({ error: 'boom' }, { status: 500 }) });

    renderPage();

    expect(await screen.findByText('Dashboard Error')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
  });
});

describe('order table', () => {
  beforeEach(signedIn);

  it('shows an empty state when there are no orders', async () => {
    mockFetch({ [ORDERS]: jsonResponse({ orders: [] }) });
    renderPage();

    expect(await screen.findByText('No orders found')).toBeInTheDocument();
  });

  it('renders customer, items, total and status', async () => {
    mockFetch({ [ORDERS]: jsonResponse({ orders: [makeOrder()] }) });
    renderPage();

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByText('Chicago')).toBeInTheDocument();
    expect(screen.getByText('× 1')).toBeInTheDocument();
    // amount_total is in cents.
    expect(screen.getByText('$180.00 USD')).toBeInTheDocument();
    expect(inTable().getByText('pending')).toBeInTheDocument();
  });

  it('falls back for a guest checkout with no name or email', async () => {
    mockFetch({
      [ORDERS]: jsonResponse({
        orders: [makeOrder({ customer_name: null, customer_email: null })],
      }),
    });
    renderPage();

    expect(await screen.findByText('(Guest)')).toBeInTheDocument();
    expect(screen.getByText('No email provided')).toBeInTheDocument();
  });

  it('treats a missing fulfillment_status as pending', async () => {
    mockFetch({
      [ORDERS]: jsonResponse({ orders: [makeOrder({ fulfillment_status: null })] }),
    });
    renderPage();

    await screen.findByRole('table');
    expect(inTable().getByText('pending')).toBeInTheDocument();
  });
});

describe('row expansion', () => {
  beforeEach(signedIn);

  it('reveals shipping details when a row is clicked', async () => {
    const user = userEvent.setup();
    mockFetch({ [ORDERS]: jsonResponse({ orders: [makeOrder()] }) });
    renderPage();

    await screen.findByText('Ada Lovelace');
    expect(screen.queryByText('Shipping Details')).not.toBeInTheDocument();

    await user.click(screen.getByText('ada@example.com'));

    expect(screen.getByText('Shipping Details')).toBeInTheDocument();
    expect(screen.getByText('1 Analytical Way')).toBeInTheDocument();
    expect(screen.getByText('Contact Phone')).toBeInTheDocument();
    expect(screen.getByText('+445550001111')).toBeInTheDocument();
  });

  it('collapses again on a second click', async () => {
    const user = userEvent.setup();
    mockFetch({ [ORDERS]: jsonResponse({ orders: [makeOrder()] }) });
    renderPage();

    await screen.findByText('Ada Lovelace');
    await user.click(screen.getByText('ada@example.com'));
    expect(screen.getByText('Shipping Details')).toBeInTheDocument();

    await user.click(screen.getByText('ada@example.com'));
    expect(screen.queryByText('Shipping Details')).not.toBeInTheDocument();
  });

  it('says so when there is no shipping information', async () => {
    const user = userEvent.setup();
    mockFetch({
      [ORDERS]: jsonResponse({
        orders: [makeOrder({ shipping_name: null, shipping_phone: null })],
      }),
    });
    renderPage();

    await screen.findByText('Ada Lovelace');
    await user.click(screen.getByText('ada@example.com'));

    expect(screen.getByText('No shipping information provided.')).toBeInTheDocument();
    expect(screen.queryByText('Contact Phone')).not.toBeInTheDocument();
  });

  it('expands only the clicked order', async () => {
    const user = userEvent.setup();
    mockFetch({
      [ORDERS]: jsonResponse({
        orders: [
          makeOrder({ id: 'cs_1', customer_email: 'one@example.com' }),
          makeOrder({ id: 'cs_2', customer_email: 'two@example.com', shipping_line1: '2 Other Road' }),
        ],
      }),
    });
    renderPage();

    await screen.findByText('one@example.com');
    await user.click(screen.getByText('two@example.com'));

    expect(screen.getByText('2 Other Road')).toBeInTheDocument();
    expect(screen.queryByText('1 Analytical Way')).not.toBeInTheDocument();
  });
});

describe('status changes', () => {
  beforeEach(signedIn);

  const withOrder = (over = {}) => mockFetch({
    [ORDERS]: jsonResponse({ orders: [makeOrder(over)] }),
    'PATCH /api/admin/orders/cs_test_abc123/status': jsonResponse({ success: true }),
  });

  it('PATCHes the new status with the auth header', async () => {
    const user = userEvent.setup();
    const fetchMock = withOrder();
    renderPage();

    await screen.findByText('Ada Lovelace');
    await user.click(screen.getByRole('button', { name: 'Complete' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe(`${API}/api/admin/orders/cs_test_abc123/status`);
    expect(init.method).toBe('PATCH');
    expect(init.headers.Authorization).toBe(AUTH);
    expect(JSON.parse(init.body)).toEqual({ status: 'completed' });
  });

  it('updates the badge optimistically', async () => {
    const user = userEvent.setup();
    withOrder();
    renderPage();

    await screen.findByText('Ada Lovelace');
    await user.click(screen.getByRole('button', { name: 'Complete' }));

    await waitFor(() => expect(inTable().getByText('completed')).toBeInTheDocument());
  });

  it('reverts and alerts when the request fails', async () => {
    const user = userEvent.setup();
    mockFetch({
      [ORDERS]: jsonResponse({ orders: [makeOrder()] }),
      'PATCH /api/admin/orders/cs_test_abc123/status': jsonResponse({ error: 'nope' }, { status: 500 }),
    });
    renderPage();

    await screen.findByText('Ada Lovelace');
    await user.click(screen.getByRole('button', { name: 'Complete' }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(
      'Error updating status: Failed to update status'
    ));
    // Optimistic update rolled back.
    expect(inTable().getByText('pending')).toBeInTheDocument();
    expect(inTable().queryByText('completed')).not.toBeInTheDocument();
  });

  it('hides the action matching the current status', async () => {
    mockFetch({ [ORDERS]: jsonResponse({ orders: [makeOrder({ fulfillment_status: 'completed' })] }) });
    renderPage();

    await screen.findByText('Ada Lovelace');
    expect(screen.queryByRole('button', { name: 'Complete' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument();
  });

  it('does not expand the row when an action button is clicked', async () => {
    const user = userEvent.setup();
    withOrder();
    renderPage();

    await screen.findByText('Ada Lovelace');
    await user.click(screen.getByRole('button', { name: 'Complete' }));

    expect(screen.queryByText('Shipping Details')).not.toBeInTheDocument();
  });
});

describe('search and filters', () => {
  beforeEach(signedIn);

  const twoOrders = () => mockFetch({
    [ORDERS]: jsonResponse({
      orders: [
        makeOrder({ id: 'cs_ada', customer_name: 'Ada Lovelace', customer_email: 'ada@example.com' }),
        makeOrder({
          id: 'cs_grace', customer_name: 'Grace Hopper',
          customer_email: 'grace@example.com', fulfillment_status: 'completed',
        }),
      ],
    }),
  });

  const searchBox = () => screen.getByPlaceholderText('Search name, email, or ID...');

  it('filters by name', async () => {
    const user = userEvent.setup();
    twoOrders();
    renderPage();

    await screen.findByText('Ada Lovelace');
    await user.type(searchBox(), 'grace');

    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
  });

  it('filters by email, case-insensitively', async () => {
    const user = userEvent.setup();
    twoOrders();
    renderPage();

    await screen.findByText('Ada Lovelace');
    await user.type(searchBox(), 'ADA@EXAMPLE');

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.queryByText('Grace Hopper')).not.toBeInTheDocument();
  });

  it('filters by order id', async () => {
    const user = userEvent.setup();
    twoOrders();
    renderPage();

    await screen.findByText('Ada Lovelace');
    await user.type(searchBox(), 'cs_grace');

    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
  });

  it('shows the empty state when nothing matches', async () => {
    const user = userEvent.setup();
    twoOrders();
    renderPage();

    await screen.findByText('Ada Lovelace');
    await user.type(searchBox(), 'nobody');

    expect(screen.getByText('No orders found')).toBeInTheDocument();
  });

  it('filters by status', async () => {
    const user = userEvent.setup();
    twoOrders();
    renderPage();

    await screen.findByText('Ada Lovelace');
    await user.click(screen.getByRole('button', { name: 'completed' }));

    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
  });

  it('restores everything with the all filter', async () => {
    const user = userEvent.setup();
    twoOrders();
    renderPage();

    await screen.findByText('Ada Lovelace');
    await user.click(screen.getByRole('button', { name: 'rejected' }));
    expect(screen.getByText('No orders found')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'all' }));
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
  });
});

describe('search engine exclusion', () => {
  it('marks the admin area noindex', async () => {
    signedIn();
    mockFetch({ [ORDERS]: jsonResponse({ orders: [] }) });
    renderPage();

    await waitFor(() => {
      const meta = document.querySelector('meta[name="robots"]');
      expect(meta).not.toBeNull();
      expect(meta.getAttribute('content')).toBe('noindex, nofollow');
    });
  });
});

describe('logout', () => {
  it('clears the stored credential and returns to the login form', async () => {
    const user = userEvent.setup();
    signedIn();
    mockFetch({ [ORDERS]: jsonResponse({ orders: [makeOrder()] }) });
    renderPage();

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: /log ?out/i }));

    expect(sessionStorage.getItem('adminAuth')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Admin Login' })).toBeInTheDocument();
  });
});
