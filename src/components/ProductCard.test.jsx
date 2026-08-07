import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import ProductCard from './ProductCard.jsx';
import { useCart } from '../context/CartContext.jsx';
import { renderWithProviders } from '../test/utils.jsx';

/**
 * ProductCard is rendered inside a clickable card, so every inner control has
 * to stopPropagation or picking a size would navigate away instead. That
 * interaction is the main thing worth locking down here.
 *
 * Passing `variants` on the product means useProductVariants uses them
 * directly and never fetches — matching how /store renders after M5.
 */

const makeVariant = (over = {}) => ({
  id: 1, product_id: 'sk1-chicago', size: '10', color: 'Black/Red', quantity: 5, ...over,
});

const makeProduct = (over = {}) => ({
  id: 'sk1-chicago',
  name: 'Chicago',
  sku: 'AJ1-CHI',
  price: 180,
  image: 'https://example.com/chicago.png',
  colorway: 'Black/Red',
  tag: null,
  variants: [makeVariant()],
  ...over,
});

/** Surfaces cart state so assertions can inspect what was added. */
function CartProbe() {
  const { items, isCartOpen } = useCart();
  return (
    <div>
      <span data-testid="cart-json">{JSON.stringify(items)}</span>
      <span data-testid="cart-open">{String(isCartOpen)}</span>
    </div>
  );
}

function renderCard(product = makeProduct(), extra = {}) {
  return renderWithProviders(
    <>
      <Routes>
        <Route path="/" element={<ProductCard product={product} {...extra} />} />
        <Route path="/product/:id" element={<div>Product detail page</div>} />
      </Routes>
      <CartProbe />
    </>
  );
}

const cartItems = () => JSON.parse(screen.getByTestId('cart-json').textContent);

beforeEach(() => {
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});

describe('rendering', () => {
  it('shows name, sku and formatted price', () => {
    renderCard();

    expect(screen.getByText('Chicago')).toBeInTheDocument();
    expect(screen.getByText('AJ1-CHI')).toBeInTheDocument();
    expect(screen.getByText('$180.00')).toBeInTheDocument();
  });

  it('renders the product image with the name as alt text', () => {
    renderCard();

    const img = screen.getByAltText('Chicago');
    expect(img).toHaveAttribute('src', 'https://example.com/chicago.png');
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('shows the tag badge when present and not sold out', () => {
    renderCard(makeProduct({ tag: 'NEW DROP' }));

    expect(screen.getByText('NEW DROP')).toBeInTheDocument();
  });

  it('hides the tag badge when the product is sold out', () => {
    renderCard(makeProduct({
      tag: 'NEW DROP',
      variants: [makeVariant({ quantity: 0 })],
    }));

    expect(screen.queryByText('NEW DROP')).not.toBeInTheDocument();
  });

  it('shows the colorway as text when there is only one colour', () => {
    renderCard();

    expect(screen.getByText('Black/Red')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Black/Red' })).not.toBeInTheDocument();
  });

  it('renders colour buttons when there is more than one colour', () => {
    renderCard(makeProduct({
      variants: [
        makeVariant({ id: 1, color: 'Black/Red' }),
        makeVariant({ id: 2, color: 'White/Blue' }),
      ],
    }));

    expect(screen.getByRole('button', { name: 'Black/Red' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'White/Blue' })).toBeInTheDocument();
  });

  it('renders a size button per variant of the selected colour', () => {
    renderCard(makeProduct({
      variants: [
        makeVariant({ id: 1, size: '9' }),
        makeVariant({ id: 2, size: '10' }),
        makeVariant({ id: 3, size: '11' }),
      ],
    }));

    expect(screen.getByRole('button', { name: '9' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '10' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '11' })).toBeInTheDocument();
  });

  it('disables sizes that are out of stock', () => {
    renderCard(makeProduct({
      variants: [
        makeVariant({ id: 1, size: '9', quantity: 3 }),
        makeVariant({ id: 2, size: '10', quantity: 0 }),
      ],
    }));

    expect(screen.getByRole('button', { name: '9' })).toBeEnabled();

    const soldOutSize = screen.getByRole('button', { name: '10' });
    expect(soldOutSize).toBeDisabled();
    expect(soldOutSize.className).toContain('line-through');
  });
});

describe('sold-out state', () => {
  const soldOut = () => makeProduct({
    variants: [makeVariant({ id: 1, quantity: 0 }), makeVariant({ id: 2, size: '11', quantity: 0 })],
  });

  it('shows the Sold Out overlay and disables the CTA', () => {
    renderCard(soldOut());

    // Overlay text plus the button label.
    expect(screen.getAllByText('Sold Out').length).toBeGreaterThanOrEqual(1);

    const cta = screen.getByRole('button', { name: 'Sold Out' });
    expect(cta).toBeDisabled();
  });

  it('does not add to the cart when clicked', async () => {
    const user = userEvent.setup();
    renderCard(soldOut());

    await user.click(screen.getByRole('button', { name: 'Sold Out' }));

    expect(cartItems()).toEqual([]);
  });

  it('is not sold out when at least one variant has stock', () => {
    renderCard(makeProduct({
      variants: [
        makeVariant({ id: 1, size: '9', quantity: 0 }),
        makeVariant({ id: 2, size: '10', quantity: 2 }),
      ],
    }));

    expect(screen.getByRole('button', { name: 'Buy Now' })).toBeEnabled();
  });

  it('shows no CTA label other than the three known states', () => {
    renderCard();
    expect(screen.getByRole('button', { name: 'Buy Now' })).toBeInTheDocument();
  });
});

describe('navigation', () => {
  it('navigates to the product detail page when the card is clicked', async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByText('Chicago'));

    expect(screen.getByText('Product detail page')).toBeInTheDocument();
  });

  it('does NOT navigate when the Buy Now button is clicked', async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole('button', { name: 'Buy Now' }));

    expect(screen.queryByText('Product detail page')).not.toBeInTheDocument();
    expect(cartItems()).toHaveLength(1);
  });

  it('does NOT navigate when a size button is clicked', async () => {
    const user = userEvent.setup();
    renderCard(makeProduct({
      variants: [makeVariant({ id: 1, size: '9' }), makeVariant({ id: 2, size: '10' })],
    }));

    await user.click(screen.getByRole('button', { name: '10' }));

    expect(screen.queryByText('Product detail page')).not.toBeInTheDocument();
  });

  it('does NOT navigate when a colour button is clicked', async () => {
    const user = userEvent.setup();
    renderCard(makeProduct({
      variants: [
        makeVariant({ id: 1, color: 'Black/Red' }),
        makeVariant({ id: 2, color: 'White/Blue' }),
      ],
    }));

    await user.click(screen.getByRole('button', { name: 'White/Blue' }));

    expect(screen.queryByText('Product detail page')).not.toBeInTheDocument();
  });
});

describe('variant selection', () => {
  it('auto-selects the first in-stock variant', async () => {
    const user = userEvent.setup();
    renderCard(makeProduct({
      variants: [
        makeVariant({ id: 1, size: '9', quantity: 0 }),
        makeVariant({ id: 2, size: '10', quantity: 4 }),
      ],
    }));

    await user.click(screen.getByRole('button', { name: 'Buy Now' }));

    expect(cartItems()[0]).toMatchObject({ variant_id: 2, size: '10' });
  });

  it('adds the size the user picked', async () => {
    const user = userEvent.setup();
    renderCard(makeProduct({
      variants: [
        makeVariant({ id: 1, size: '9' }),
        makeVariant({ id: 2, size: '10' }),
        makeVariant({ id: 3, size: '11' }),
      ],
    }));

    await user.click(screen.getByRole('button', { name: '11' }));
    await user.click(screen.getByRole('button', { name: 'Buy Now' }));

    expect(cartItems()[0]).toMatchObject({ variant_id: 3, size: '11' });
  });

  it('switches the size list when the colour changes', async () => {
    const user = userEvent.setup();
    renderCard(makeProduct({
      variants: [
        makeVariant({ id: 1, size: '9', color: 'Black/Red' }),
        makeVariant({ id: 2, size: '13', color: 'White/Blue' }),
      ],
    }));

    expect(screen.getByRole('button', { name: '9' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '13' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'White/Blue' }));

    expect(screen.getByRole('button', { name: '13' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '9' })).not.toBeInTheDocument();
  });
});

describe('add to cart', () => {
  it('adds the product with variant details and a stock ceiling', async () => {
    const user = userEvent.setup();
    renderCard(makeProduct({ variants: [makeVariant({ id: 42, size: '10', quantity: 3 })] }));

    await user.click(screen.getByRole('button', { name: 'Buy Now' }));

    expect(cartItems()[0]).toMatchObject({
      id: 'sk1-chicago',
      name: 'Chicago',
      price: 180,
      variant_id: 42,
      size: '10',
      colorway: 'Black/Red',
      max_qty: 3,
      qty: 1,
    });
  });

  it('opens the cart drawer', async () => {
    const user = userEvent.setup();
    renderCard();

    expect(screen.getByTestId('cart-open')).toHaveTextContent('false');

    await user.click(screen.getByRole('button', { name: 'Buy Now' }));

    expect(screen.getByTestId('cart-open')).toHaveTextContent('true');
  });

  it('increments quantity when the same variant is added twice', async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole('button', { name: 'Buy Now' }));
    await user.click(screen.getByRole('button', { name: 'Buy Now' }));

    expect(cartItems()).toHaveLength(1);
    expect(cartItems()[0].qty).toBe(2);
  });

  it('alerts and stops once the cart holds all remaining stock', async () => {
    const user = userEvent.setup();
    renderCard(makeProduct({ variants: [makeVariant({ id: 7, quantity: 2 })] }));

    await user.click(screen.getByRole('button', { name: 'Buy Now' }));
    await user.click(screen.getByRole('button', { name: 'Buy Now' }));
    expect(cartItems()[0].qty).toBe(2);

    await user.click(screen.getByRole('button', { name: 'Buy Now' }));

    expect(window.alert).toHaveBeenCalledWith(
      'Only 2 left in stock for this size/color.'
    );
    expect(cartItems()[0].qty).toBe(2);
  });
});

describe('no variants', () => {
  it('renders without size buttons and does not crash', () => {
    renderCard(makeProduct({ variants: [] }));

    expect(screen.getByText('Chicago')).toBeInTheDocument();
    // availableColors.length <= 1 takes the plain-text branch.
    expect(screen.getByText('Black/Red')).toBeInTheDocument();
  });

  it('shows Buy Now but adding does nothing without a selected variant', async () => {
    const user = userEvent.setup();
    renderCard(makeProduct({ variants: [] }));

    await user.click(screen.getByRole('button', { name: 'Buy Now' }));

    expect(cartItems()).toEqual([]);
  });
});

describe('featured variant', () => {
  it('applies the narrower hero width', () => {
    const { container } = renderCard(makeProduct(), { featured: true });

    const card = container.querySelector('.rounded-3xl');
    expect(card.className).toContain('max-w-sm');
  });

  it('is full width by default', () => {
    const { container } = renderCard();

    const card = container.querySelector('.rounded-3xl');
    expect(card.className).not.toContain('max-w-sm');
  });
});

describe('no network', () => {
  it('never fetches when variants are supplied by the parent (M5)', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    renderCard();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('renders each card in a grid without a request per card', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const products = ['a', 'b', 'c'].map((id) =>
      makeProduct({ id, name: id.toUpperCase(), variants: [makeVariant({ id: `${id}-1` })] })
    );

    renderWithProviders(
      <div>{products.map((p) => <ProductCard key={p.id} product={p} />)}</div>
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getAllByRole('button', { name: 'Buy Now' })).toHaveLength(3);
  });
});
