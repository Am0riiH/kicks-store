import { useState, useEffect, useMemo } from 'react';

const API_BASE = 'http://localhost:3001';

export function useProductVariants(productId) {
  const [variants, setVariants] = useState([]);
  const [selectedColor, setSelectedColor] = useState('');
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch variants for this product
  useEffect(() => {
    if (!productId) return;
    
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
  }, [productId]);

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
