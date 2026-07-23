import { createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react';

const CartContext = createContext(null);

const TAX_RATE = 0.08;

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try {
      const saved = localStorage.getItem('cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(items));
  }, [items]);
  const [isCartOpen, setCartOpen] = useState(false);
  const [isSearchOpen, setSearchOpen] = useState(false);

  const addItem = useCallback((product, qtyToAdd = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.variant_id === product.variant_id);
      if (existing) {
        return prev.map((i) => {
          if (i.variant_id === product.variant_id) {
            const max = i.max_qty || Infinity;
            return { ...i, qty: Math.min(i.qty + qtyToAdd, max) };
          }
          return i;
        });
      }
      return [...prev, { ...product, qty: Math.min(qtyToAdd, product.max_qty || Infinity) }];
    });
    setCartOpen(true);
  }, []);

  const removeItem = useCallback((variantId) => {
    setItems((prev) => prev.filter((i) => i.variant_id !== variantId));
  }, []);

  const updateQty = useCallback((variantId, qty) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.variant_id === variantId) {
          const max = i.max_qty || Infinity;
          return { ...i, qty: Math.min(Math.max(1, qty), max) };
        }
        return i;
      })
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const subtotal = useMemo(
    () => items.reduce((sum, i) => sum + i.price * i.qty, 0),
    [items]
  );
  const tax = useMemo(() => subtotal * TAX_RATE, [subtotal]);
  const total = useMemo(() => subtotal + tax, [subtotal, tax]);
  const count = useMemo(() => items.reduce((sum, i) => sum + i.qty, 0), [items]);

  const value = {
    items,
    addItem,
    removeItem,
    updateQty,
    clearCart,
    subtotal,
    tax,
    total,
    count,
    isCartOpen,
    setCartOpen,
    isSearchOpen,
    setSearchOpen,
    TAX_RATE,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
