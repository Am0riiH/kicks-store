import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CartProvider, useCart } from './CartContext.jsx';

/* Cart identity is `variant_id`, not `id` — a product is only in the cart as a
   specific size/colour. removeItem and updateQty therefore take a variant id:
     removeItem(variantId)
     updateQty(variantId, qty)
   These tests previously called a two-argument ('p1', 'US 10') API that no
   longer exists, which made them fail against a cart that works correctly. */

describe('CartContext', () => {
  beforeEach(() => {
    // Clear localStorage before each test so tests don't leak state
    localStorage.clear();
    vi.restoreAllMocks();
  });

  const renderCartHook = () => {
    return renderHook(() => useCart(), {
      wrapper: ({ children }) => <CartProvider>{children}</CartProvider>,
    });
  };

  // Mirrors what ProductCard/ProductDetail actually put in the cart.
  const makeProduct = (over = {}) => ({
    id: 'p1',
    variant_id: 1,
    name: 'Shoe 1',
    price: 100,
    size: 'US 10',
    ...over,
  });

  it('starts with an empty cart and 0 total', () => {
    const { result } = renderCartHook();
    expect(result.current.items).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(result.current.count).toBe(0);
  });

  it('adds a new item with quantity 1', () => {
    const { result } = renderCartHook();
    const product = makeProduct();

    act(() => {
      result.current.addItem(product);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]).toEqual(expect.objectContaining({
      ...product,
      qty: 1
    }));
  });

  it('increments quantity when adding the same variant twice', () => {
    const { result } = renderCartHook();
    const product = makeProduct();

    act(() => {
      result.current.addItem(product);
      result.current.addItem(product);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].qty).toBe(2);
  });

  it('treats different sizes of the same product as separate lines', () => {
    const { result } = renderCartHook();

    act(() => {
      result.current.addItem(makeProduct({ variant_id: 1, size: 'US 10' }));
      result.current.addItem(makeProduct({ variant_id: 2, size: 'US 11' }));
    });

    expect(result.current.items).toHaveLength(2);
    expect(result.current.count).toBe(2);
  });

  it('removes an item entirely', () => {
    const { result } = renderCartHook();

    act(() => {
      result.current.addItem(makeProduct({ variant_id: 7 }));
    });
    expect(result.current.items).toHaveLength(1);

    act(() => {
      result.current.removeItem(7);
    });

    expect(result.current.items).toHaveLength(0);
  });

  it('increases and decreases quantity correctly, flooring at 1', () => {
    const { result } = renderCartHook();

    act(() => {
      result.current.addItem(makeProduct({ variant_id: 1 })); // qty: 1
    });

    act(() => {
      result.current.updateQty(1, 5);
    });
    expect(result.current.items[0].qty).toBe(5);

    act(() => {
      result.current.updateQty(1, 0); // User asks to decrease to 0
    });
    // Expected boundary case behavior: floors at 1
    expect(result.current.items[0].qty).toBe(1);
  });

  it('clamps quantity to max_qty so the cart cannot oversell', () => {
    const { result } = renderCartHook();

    act(() => {
      result.current.addItem(makeProduct({ variant_id: 3, max_qty: 2 }));
    });

    // Asking for more than stock allows is capped, not rejected.
    act(() => {
      result.current.updateQty(3, 99);
    });
    expect(result.current.items[0].qty).toBe(2);

    // Adding again cannot push past the cap either.
    act(() => {
      result.current.addItem(makeProduct({ variant_id: 3, max_qty: 2 }));
    });
    expect(result.current.items[0].qty).toBe(2);
  });

  it('calculates total correctly across multiple items', () => {
    const { result } = renderCartHook();

    act(() => {
      result.current.addItem(makeProduct({ variant_id: 1, price: 100 }));
      result.current.updateQty(1, 2);                                    // $200
      result.current.addItem(makeProduct({ variant_id: 2, price: 50 })); // $50
    });

    // Subtotal: 250
    // Tax: 250 * 0.08 = 20
    // Total: 270
    expect(result.current.subtotal).toBe(250);
    expect(result.current.tax).toBe(20);
    expect(result.current.total).toBe(270);
  });

  it('clearCart empties the cart', () => {
    const { result } = renderCartHook();

    act(() => {
      result.current.addItem(makeProduct({ variant_id: 1 }));
      result.current.addItem(makeProduct({ variant_id: 2 }));
    });
    expect(result.current.items).toHaveLength(2);

    act(() => {
      result.current.clearCart();
    });

    expect(result.current.items).toHaveLength(0);
    expect(result.current.total).toBe(0);
  });

  it('opens the cart drawer when an item is added', () => {
    const { result } = renderCartHook();
    expect(result.current.isCartOpen).toBe(false);

    act(() => {
      result.current.addItem(makeProduct());
    });

    // The drawer opening is the only feedback that an add succeeded — ProductCard
    // has no toast of its own.
    expect(result.current.isCartOpen).toBe(true);
  });

  it('honours an explicit quantity on addItem', () => {
    const { result } = renderCartHook();

    act(() => {
      result.current.addItem(makeProduct({ variant_id: 1 }), 3);
    });

    expect(result.current.items[0].qty).toBe(3);
  });

  it('clamps an explicit quantity to max_qty on a first add', () => {
    const { result } = renderCartHook();

    act(() => {
      result.current.addItem(makeProduct({ variant_id: 1, max_qty: 2 }), 10);
    });

    expect(result.current.items[0].qty).toBe(2);
  });

  it('exposes the tax rate used for the displayed total', () => {
    const { result } = renderCartHook();

    expect(result.current.TAX_RATE).toBe(0.08);
  });

  it('tracks the search overlay independently of the cart drawer', () => {
    const { result } = renderCartHook();
    expect(result.current.isSearchOpen).toBe(false);

    act(() => {
      result.current.setSearchOpen(true);
    });

    expect(result.current.isSearchOpen).toBe(true);
    expect(result.current.isCartOpen).toBe(false);
  });

  it('throws a clear error when useCart is called outside the provider', () => {
    // React logs the thrown error; silence it so the run stays readable.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => renderHook(() => useCart())).toThrow(
      'useCart must be used inside CartProvider'
    );

    spy.mockRestore();
  });

  it('recovers from corrupt localStorage instead of crashing on mount', () => {
    localStorage.setItem('cart', '{not valid json');

    const { result } = renderCartHook();

    expect(result.current.items).toEqual([]);
    expect(result.current.total).toBe(0);
  });

  it('persists state to localStorage and restores it on mount', () => {
    // 1. Render hook and add an item
    const { result: firstResult, unmount } = renderCartHook();

    act(() => {
      firstResult.current.addItem(makeProduct({ variant_id: 1, price: 100 }));
    });

    // Verify localStorage has the data
    const savedData = JSON.parse(localStorage.getItem('cart'));
    expect(savedData).toHaveLength(1);
    expect(savedData[0].id).toBe('p1');

    // Unmount to simulate page reload
    unmount();

    // 2. Render hook again, it should initialize from localStorage
    const { result: secondResult } = renderCartHook();

    expect(secondResult.current.items).toHaveLength(1);
    expect(secondResult.current.items[0].id).toBe('p1');
    expect(secondResult.current.items[0].qty).toBe(1);
  });
});
