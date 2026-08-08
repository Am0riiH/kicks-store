import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Navbar from './Navbar.jsx';
import { useCart } from '../context/CartContext.jsx';
import { renderWithProviders, mockFetch, jsonResponse, API } from '../test/utils.jsx';

/**
 * Navbar owns the cart drawer and the checkout button — the handoff to Stripe
 * and the last place the cart is read before money moves. Those are the parts
 * covered here; the marketing links are not.
 */

const CHECKOUT = 'POST /api/create-checkout-session';

const item = (over = {}) => ({
  id: 'sk1-chicago',
  variant_id: 1,
  name: 'Chicago',
  price: 180,
  qty: 1,
  size: '10',
  image: 'https://example.com/chicago.png',
  max_qty: 5,
  ...over,
});

/** Seeds the cart via localStorage, which CartProvider reads on mount. */
const seedCart = (items) => localStorage.setItem('cart', JSON.stringify(items));

/** Opens the drawer so its contents are interactive. */
function OpenCart() {
  const { setCartOpen } = useCart();
  return <button onClick={() => setCartOpen(true)}>open-cart-probe</button>;
}

const renderNavbar = () =>
  renderWithProviders(<><Navbar /><OpenCart /></>);

const openDrawer = async (user) => {
  await user.click(screen.getByText('open-cart-probe'));
  return screen.getByRole('complementary');
};

beforeEach(() => {
  // window.location.href assignment is how checkout hands off to Stripe.
  delete window.location;
  window.location = { href: '' };
});

describe('cart drawer', () => {
  it('shows the empty state when there is nothing in the cart', async () => {
    const user = userEvent.setup();
    mockFetch({});
    renderNavbar();

    await openDrawer(user);

    expect(screen.getByText('Your cart is empty. Go start a drop.')).toBeInTheDocument();
  });

  it('lists the cart contents with a receipt heading', async () => {
    const user = userEvent.setup();
    seedCart([item()]);
    mockFetch({});
    renderNavbar();

    await openDrawer(user);

    expect(screen.getByText('Order Receipt')).toBeInTheDocument();
    expect(screen.getByText('Chicago')).toBeInTheDocument();
  });

  it('shows subtotal, tax and total', async () => {
    const user = userEvent.setup();
    seedCart([item({ price: 100, qty: 2 })]);
    mockFetch({});
    renderNavbar();

    await openDrawer(user);

    expect(screen.getByText('Subtotal')).toBeInTheDocument();
    expect(screen.getByText('Tax (8%)')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
    // $200.00 appears twice: the line total (100 × 2) and the subtotal.
    expect(screen.getAllByText('$200.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('$16.00')).toBeInTheDocument();   // 8% tax
    expect(screen.getByText('$216.00')).toBeInTheDocument();  // total
  });

  it('removes an item', async () => {
    const user = userEvent.setup();
    seedCart([item()]);
    mockFetch({});
    renderNavbar();
    await openDrawer(user);

    await user.click(screen.getByLabelText('Remove Chicago from cart'));

    expect(screen.getByText('Your cart is empty. Go start a drop.')).toBeInTheDocument();
  });

  it('increases and decreases quantity', async () => {
    const user = userEvent.setup();
    seedCart([item({ qty: 2 })]);
    mockFetch({});
    renderNavbar();
    await openDrawer(user);

    await user.click(screen.getByLabelText('Increase quantity for Chicago'));
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('cart'))[0].qty).toBe(3)
    );

    await user.click(screen.getByLabelText('Decrease quantity for Chicago'));
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('cart'))[0].qty).toBe(2)
    );
  });

  it('keeps the decorative receipt number stable across re-renders', async () => {
    const user = userEvent.setup();
    seedCart([item()]);
    mockFetch({});
    renderNavbar();
    await openDrawer(user);

    const readReceipt = () =>
      screen.getByText(/^\w{3} \d{1,2}, \d{4} · #\d{6}$/).textContent;

    const before = readReceipt();

    // Any cart mutation re-renders the drawer. The number is generated with
    // Math.random(), which used to run inline in the JSX — so it changed on
    // every render and the customer watched their receipt renumber itself.
    await user.click(screen.getByLabelText('Increase quantity for Chicago'));
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('cart'))[0].qty).toBe(2)
    );

    expect(readReceipt()).toBe(before);
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    mockFetch({});
    renderNavbar();

    const drawer = await openDrawer(user);
    expect(drawer.className).toContain('translate-x-0');

    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.getByRole('complementary').className).toContain('translate-x-full')
    );
  });

  it('closes via the close button', async () => {
    const user = userEvent.setup();
    mockFetch({});
    renderNavbar();
    await openDrawer(user);

    await user.click(screen.getByLabelText('Close cart'));

    await waitFor(() =>
      expect(screen.getByRole('complementary').className).toContain('translate-x-full')
    );
  });
});

describe('checkout button', () => {
  const clickCheckout = async (user) => {
    await openDrawer(user);
    await user.click(document.querySelector('#checkout-btn'));
  };

  it('is disabled with an empty cart', async () => {
    const user = userEvent.setup();
    mockFetch({});
    renderNavbar();
    await openDrawer(user);

    expect(document.querySelector('#checkout-btn')).toBeDisabled();
  });

  it('posts the cart and redirects to the Stripe URL', async () => {
    const user = userEvent.setup();
    seedCart([item()]);
    const fetchMock = mockFetch({
      [CHECKOUT]: jsonResponse({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' }),
    });
    renderNavbar();
    await clickCheckout(user);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API}/api/create-checkout-session`);
    expect(init.method).toBe('POST');

    await waitFor(() =>
      expect(window.location.href).toBe('https://checkout.stripe.com/c/pay/cs_test_1')
    );
  });

  it('always sends variant_id — the server cannot price an item without it', async () => {
    const user = userEvent.setup();
    seedCart([item({ variant_id: 42 })]);
    const fetchMock = mockFetch({
      [CHECKOUT]: jsonResponse({ url: 'https://checkout.stripe.com/x' }),
    });
    renderNavbar();
    await clickCheckout(user);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.items[0].variant_id).toBe(42);
    expect(body.items[0].quantity).toBe(1);
    expect(body.items[0].name).toBe('Chicago');
  });

  it('omits a non-absolute image, which Stripe would reject', async () => {
    const user = userEvent.setup();
    seedCart([item({ image: 'data:image/png;base64,iVBORw0KGgo=' })]);
    const fetchMock = mockFetch({
      [CHECKOUT]: jsonResponse({ url: 'https://checkout.stripe.com/x' }),
    });
    renderNavbar();
    await clickCheckout(user);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.items[0]).not.toHaveProperty('image');
  });

  it('shows Processing… and disables the button while in flight', async () => {
    const user = userEvent.setup();
    seedCart([item()]);
    let release;
    mockFetch({
      [CHECKOUT]: () => new Promise((resolve) => {
        release = () => resolve(jsonResponse({ url: 'https://checkout.stripe.com/x' }));
      }),
    });
    renderNavbar();
    await clickCheckout(user);

    const button = document.querySelector('#checkout-btn');
    await waitFor(() => expect(button).toHaveAttribute('aria-busy', 'true'));
    expect(button).toBeDisabled();
    expect(button.textContent).toContain('Processing');

    release();
  });

  it('surfaces a server error instead of redirecting', async () => {
    const user = userEvent.setup();
    seedCart([item()]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch({
      [CHECKOUT]: jsonResponse(
        { error: 'Only 2 units of Chicago (10) are available.' },
        { status: 400 }
      ),
    });
    renderNavbar();
    await clickCheckout(user);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Only 2 units of Chicago (10) are available.');
    expect(window.location.href).toBe('');
  });

  it('explains a dead backend in plain language', async () => {
    const user = userEvent.setup();
    seedCart([item()]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch({ [CHECKOUT]: () => Promise.reject(new Error('Failed to fetch')) });
    renderNavbar();
    await clickCheckout(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Cannot reach the checkout server. Make sure it's running on port 3001."
    );
  });

  it('errors when the server returns no URL', async () => {
    const user = userEvent.setup();
    seedCart([item()]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch({ [CHECKOUT]: jsonResponse({}) });
    renderNavbar();
    await clickCheckout(user);

    expect(await screen.findByRole('alert'))
      .toHaveTextContent('No checkout URL returned from server.');
    expect(window.location.href).toBe('');
  });

  it('re-enables the button after a failure so the user can retry', async () => {
    const user = userEvent.setup();
    seedCart([item()]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch({ [CHECKOUT]: jsonResponse({ error: 'nope' }, { status: 500 }) });
    renderNavbar();
    await clickCheckout(user);

    await screen.findByRole('alert');
    expect(document.querySelector('#checkout-btn')).toBeEnabled();
  });
});

describe('cart badge', () => {
  it('reflects the total quantity, not the number of lines', async () => {
    seedCart([item({ variant_id: 1, qty: 2 }), item({ variant_id: 2, qty: 3 })]);
    mockFetch({});
    renderNavbar();

    const cartButton = screen.getByLabelText('Open cart');
    await waitFor(() => expect(within(cartButton).getByText('5')).toBeInTheDocument());
  });
});
