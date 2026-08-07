import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import ProductDetail from './ProductDetail.jsx';
import { useCart } from '../context/CartContext.jsx';
import { renderWithProviders, mockFetch, jsonResponse, API } from '../test/utils.jsx';

/**
 * The detail page is the second route into the cart (ProductCard is the first),
 * and the only one with a quantity selector — so the stock ceiling is enforced
 * in two places here: the + button and handleAdd.
 */

const ID = 'sk1-chicago';
const DETAIL = `GET /api/products/${ID}`;

const variant = (over = {}) => ({
  id: 1, product_id: ID, size: '10', color: 'Black/Red', quantity: 5, ...over,
});

const makeProduct = (over = {}) => ({
  id: ID,
  name: 'Chicago',
  sku: 'AJ1-CHI',
  price: 180,
  image: 'https://example.com/chicago.png',
  colorway: 'Black/Red',
  description: 'A classic.',
  tag: null,
  variants: [variant()],
  ...over,
});

function CartProbe() {
  const { items } = useCart();
  return <span data-testid="cart-json">{JSON.stringify(items)}</span>;
}

const renderDetail = () =>
  renderWithProviders(
    <>
      <Routes>
        <Route path="/product/:id" element={<ProductDetail />} />
      </Routes>
      <CartProbe />
    </>,
    { route: `/product/${ID}` }
  );

const cartItems = () => JSON.parse(screen.getByTestId('cart-json').textContent);

beforeEach(() => {
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});

describe('loading and errors', () => {
  it('shows a loading state first', () => {
    mockFetch({ [DETAIL]: () => new Promise(() => {}) });
    renderDetail();

    expect(screen.getByText(/loading product details/i)).toBeInTheDocument();
  });

  // ── BUG (documented, not fixed) ────────────────────────────────────────────
  // A failed product fetch spins forever instead of showing "Product Not Found",
  // and that whole branch (ProductDetail.jsx:66-76) is unreachable.
  //
  // Why: the page passes `product ? (product.variants || []) : null` to
  // useProductVariants. When the fetch fails, `product` stays null, so the hook
  // gets the "wait for the parent" sentinel — its effect returns early and never
  // clears `loading`. loadingVariants therefore stays true forever, and
  // `if (loadingProduct || loadingVariants)` returns the spinner before the
  // error branch below it is ever evaluated.
  //
  // Introduced by the M5 three-state change; the sentinel has no path out when
  // the parent's own fetch fails.
  //
  // Fix would be to track the failure explicitly, e.g. pass `[]` rather than
  // `null` once `error` is set, or gate the spinner on `!error`.
  it.each([
    ['a 404', () => jsonResponse({ error: 'Product not found' }, { status: 404 })],
    ['a network failure', () => Promise.reject(new Error('offline'))],
  ])('BUG: stays on the loading spinner after %s', async (_label, response) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch({ [DETAIL]: response });
    renderDetail();

    // Current behaviour: the spinner never clears.
    await waitFor(() =>
      expect(screen.getByText(/loading product details/i)).toBeInTheDocument()
    );
    expect(screen.queryByRole('heading', { name: /product not found/i })).not.toBeInTheDocument();
  });
});

describe('rendering', () => {
  it('shows name, sku, price and description', async () => {
    mockFetch({ [DETAIL]: jsonResponse({ product: makeProduct() }) });
    renderDetail();

    expect(await screen.findByRole('heading', { name: 'Chicago' })).toBeInTheDocument();
    expect(screen.getByText('AJ1-CHI')).toBeInTheDocument();
    expect(screen.getByText('$180.00')).toBeInTheDocument();
    expect(screen.getByText('A classic.')).toBeInTheDocument();
  });

  it('falls back to boilerplate copy when there is no description', async () => {
    mockFetch({ [DETAIL]: jsonResponse({ product: makeProduct({ description: null }) }) });
    renderDetail();

    await screen.findByRole('heading', { name: 'Chicago' });
    expect(screen.getByText(/Experience the perfect blend/i)).toBeInTheDocument();
  });

  it('fetches the product exactly once (variants come embedded)', async () => {
    const fetchMock = mockFetch({ [DETAIL]: jsonResponse({ product: makeProduct() }) });
    renderDetail();

    await screen.findByRole('heading', { name: 'Chicago' });

    // M5: passing product.variants means the hook never fires its own request.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`${API}/api/products/${ID}`);
  });

  it('shows stock for the selected size', async () => {
    mockFetch({ [DETAIL]: jsonResponse({ product: makeProduct() }) });
    renderDetail();

    expect(await screen.findByText('5 in stock')).toBeInTheDocument();
  });

  it('shows the sold-out overlay when nothing is in stock', async () => {
    mockFetch({
      [DETAIL]: jsonResponse({
        product: makeProduct({
          variants: [variant({ id: 1, quantity: 0 }), variant({ id: 2, size: '11', quantity: 0 })],
        }),
      }),
    });
    renderDetail();

    await screen.findByRole('heading', { name: 'Chicago' });
    expect(screen.getAllByText('Sold Out').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: 'Sold Out' })).toBeDisabled();
  });
});

describe('quantity selector', () => {
  const setup = async (product = makeProduct()) => {
    const user = userEvent.setup();
    mockFetch({ [DETAIL]: jsonResponse({ product }) });
    renderDetail();
    await screen.findByRole('heading', { name: 'Chicago' });
    return user;
  };

  it('starts at 1 and will not go below it', async () => {
    await setup();

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '-' })).toBeDisabled();
  });

  it('increments up to the available stock, then stops', async () => {
    const user = await setup(makeProduct({ variants: [variant({ quantity: 2 })] }));

    const plus = screen.getByRole('button', { name: '+' });
    await user.click(plus);
    expect(screen.getByText('2')).toBeInTheDocument();

    // Cannot exceed stock.
    expect(plus).toBeDisabled();
  });

  it('decrements back down', async () => {
    const user = await setup();

    await user.click(screen.getByRole('button', { name: '+' }));
    expect(screen.getByText('2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '-' }));
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('resets to 1 when the size changes', async () => {
    const user = await setup(makeProduct({
      variants: [variant({ id: 1, size: '10' }), variant({ id: 2, size: '11' })],
    }));

    await user.click(screen.getByRole('button', { name: '+' }));
    expect(screen.getByText('2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '11' }));

    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
  });
});

describe('add to cart', () => {
  const setup = async (product = makeProduct()) => {
    const user = userEvent.setup();
    mockFetch({ [DETAIL]: jsonResponse({ product }) });
    renderDetail();
    await screen.findByRole('heading', { name: 'Chicago' });
    return user;
  };

  it('adds the selected variant with the chosen quantity', async () => {
    const user = await setup();

    await user.click(screen.getByRole('button', { name: '+' }));
    await user.click(screen.getByRole('button', { name: 'Add to Cart' }));

    expect(cartItems()[0]).toMatchObject({
      id: ID, name: 'Chicago', price: 180,
      variant_id: 1, size: '10', colorway: 'Black/Red', max_qty: 5, qty: 2,
    });
  });

  it('adds the size the user picked', async () => {
    const user = await setup(makeProduct({
      variants: [variant({ id: 1, size: '10' }), variant({ id: 2, size: '12' })],
    }));

    await user.click(screen.getByRole('button', { name: '12' }));
    await user.click(screen.getByRole('button', { name: 'Add to Cart' }));

    expect(cartItems()[0]).toMatchObject({ variant_id: 2, size: '12' });
  });

  it('refuses to exceed stock already held in the cart', async () => {
    const user = await setup(makeProduct({ variants: [variant({ quantity: 2 })] }));

    await user.click(screen.getByRole('button', { name: '+' }));
    await user.click(screen.getByRole('button', { name: 'Add to Cart' }));
    expect(cartItems()[0].qty).toBe(2);

    await user.click(screen.getByRole('button', { name: 'Add to Cart' }));

    expect(window.alert).toHaveBeenCalledWith(
      'Only 2 left in stock. You already have 2 in cart.'
    );
    expect(cartItems()[0].qty).toBe(2);
  });

  it('does nothing when the product is sold out', async () => {
    const user = await setup(makeProduct({ variants: [variant({ quantity: 0 })] }));

    await user.click(screen.getByRole('button', { name: 'Sold Out' }));

    expect(cartItems()).toEqual([]);
  });
});

describe('colour selection', () => {
  it('switches the size list when the colour changes', async () => {
    const user = userEvent.setup();
    mockFetch({
      [DETAIL]: jsonResponse({
        product: makeProduct({
          variants: [
            variant({ id: 1, size: '9', color: 'Black/Red' }),
            variant({ id: 2, size: '13', color: 'White/Blue' }),
          ],
        }),
      }),
    });
    renderDetail();
    await screen.findByRole('heading', { name: 'Chicago' });

    expect(screen.getByRole('button', { name: '9' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'White/Blue' }));

    expect(await screen.findByRole('button', { name: '13' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '9' })).not.toBeInTheDocument();
  });
});
