import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CartProvider, useCart } from './CartContext.jsx';

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

  it('starts with an empty cart and 0 total', () => {
    const { result } = renderCartHook();
    expect(result.current.items).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(result.current.count).toBe(0);
  });

  it('adds a new item with quantity 1', () => {
    const { result } = renderCartHook();
    const product = { id: 'p1', name: 'Shoe 1', price: 100, size: 'US 10' };
    
    act(() => {
      result.current.addItem(product);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]).toEqual(expect.objectContaining({
      ...product,
      qty: 1
    }));
  });

  it('increments quantity when adding the same item twice', () => {
    const { result } = renderCartHook();
    const product = { id: 'p1', name: 'Shoe 1', price: 100, size: 'US 10' };
    
    act(() => {
      result.current.addItem(product);
      result.current.addItem(product);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].qty).toBe(2);
  });

  it('removes an item entirely', () => {
    const { result } = renderCartHook();
    const product = { id: 'p1', name: 'Shoe 1', price: 100, size: 'US 10' };
    
    act(() => {
      result.current.addItem(product);
    });
    
    expect(result.current.items).toHaveLength(1);

    act(() => {
      result.current.removeItem('p1', 'US 10');
    });

    expect(result.current.items).toHaveLength(0);
  });

  it('increases and decreases quantity correctly, flooring at 1', () => {
    const { result } = renderCartHook();
    const product = { id: 'p1', name: 'Shoe 1', price: 100, size: 'US 10' };
    
    act(() => {
      result.current.addItem(product); // qty: 1
    });

    act(() => {
      result.current.updateQty('p1', 'US 10', 5);
    });
    expect(result.current.items[0].qty).toBe(5);

    act(() => {
      result.current.updateQty('p1', 'US 10', 0); // User asks to decrease to 0
    });
    // Expected boundary case behavior: floors at 1
    expect(result.current.items[0].qty).toBe(1);
  });

  it('calculates total correctly across multiple items', () => {
    const { result } = renderCartHook();
    
    act(() => {
      result.current.addItem({ id: 'p1', price: 100, size: 'US 10' });
      result.current.updateQty('p1', 'US 10', 2); // $200
      result.current.addItem({ id: 'p2', price: 50, size: 'US 9' }); // $50
    });

    // Subtotal: 250
    // Tax: 250 * 0.08 = 20
    // Total: 270
    expect(result.current.subtotal).toBe(250);
    expect(result.current.tax).toBe(20);
    expect(result.current.total).toBe(270);
  });

  it('persists state to localStorage and restores it on mount', () => {
    // 1. Render hook and add an item
    const { result: firstResult, unmount } = renderCartHook();
    
    act(() => {
      firstResult.current.addItem({ id: 'p1', price: 100, size: 'US 10' });
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
