import { useState, useEffect, useMemo } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * @param {string} productId
 * @param {Array|null} [preloadedVariants]  variants already embedded in the
 *   product payload. Three-state on purpose:
 *     undefined → nothing is coming, fetch them ourselves (legacy callers)
 *     null      → a caller IS supplying them but hasn't loaded yet — wait,
 *                 do NOT fire a request that would immediately be redundant
 *     Array     → use these, never fetch
 *   This is what stops the store page firing one request per product card.
 */
export function useProductVariants(productId, preloadedVariants) {
  const hasPreloaded = Array.isArray(preloadedVariants);
  const awaitingPreload = preloadedVariants === null;

  const [variants, setVariants] = useState(hasPreloaded ? preloadedVariants : []);
  const [selectedColor, setSelectedColor] = useState(
    hasPreloaded && preloadedVariants.length ? preloadedVariants[0].color : ''
  );
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [loading, setLoading] = useState(!hasPreloaded);

  // Fetch variants for this product — only when nobody else is supplying them.
  useEffect(() => {
    if (!productId || hasPreloaded || awaitingPreload) return;

    setLoading(true);
    fetch(`${API_BASE}/api/products/${productId}/variants`)
      .then(res => res.json())
      .then(data => {
        const vars = data.variants || [];
        setVariants(vars);
        if (vars.length > 0) {
          // Setup defaults
          const colors = Array.from(new Set(vars.map(v => v.color)));
          setSelectedColor(colors[0]);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch variants:', err);
        setLoading(false);
      });
  }, [productId, hasPreloaded, awaitingPreload]);

  // Keep state in step if the embedded variants arrive/change after mount
  // (the store page renders cards before its fetch resolves).
  useEffect(() => {
    if (!hasPreloaded) return;
    setVariants(preloadedVariants);
    setLoading(false);
    if (preloadedVariants.length) {
      const colors = Array.from(new Set(preloadedVariants.map(v => v.color)));
      setSelectedColor((prev) => (colors.includes(prev) ? prev : colors[0]));
    }
  }, [hasPreloaded, preloadedVariants]);

  const availableColors = useMemo(() => Array.from(new Set(variants.map(v => v.color))), [variants]);
  const sizesForColor = useMemo(() => variants.filter(v => v.color === selectedColor), [variants, selectedColor]);

  // Auto-select a size when color changes
  useEffect(() => {
    if (sizesForColor.length > 0) {
      if (!selectedVariant || selectedVariant.color !== selectedColor) {
        const inStock = sizesForColor.find(v => v.quantity > 0);
        setSelectedVariant(inStock || sizesForColor[0]);
      }
    }
  }, [sizesForColor, selectedColor, selectedVariant]);

  const isSoldOut = variants.length > 0 && variants.every(v => v.quantity === 0);
  const isSelectedVariantOut = selectedVariant ? selectedVariant.quantity === 0 : false;

  return {
    variants,
    selectedColor,
    setSelectedColor,
    selectedVariant,
    setSelectedVariant,
    availableColors,
    sizesForColor,
    isSoldOut,
    isSelectedVariantOut,
    loading
  };
}
