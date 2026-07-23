import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useCart } from '../context/CartContext.jsx';
import { useProductVariants } from '../hooks/useProductVariants.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function ProductDetail() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [loadingProduct, setLoadingProduct] = useState(true);
  const [error, setError] = useState(null);
  const [quantity, setQuantity] = useState(1);

  const { items, addItem } = useCart();
  const {
    variants,
    selectedColor,
    setSelectedColor,
    selectedVariant,
    setSelectedVariant,
    availableColors,
    sizesForColor,
    isSoldOut,
    isSelectedVariantOut,
    loading: loadingVariants
  } = useProductVariants(id);

  useEffect(() => {
    setLoadingProduct(true);
    fetch(`${API_BASE}/api/products/${id}`)
      .then(res => {
        if (!res.ok) throw new Error('Product not found');
        return res.json();
      })
      .then(data => {
        setProduct(data.product);
        setLoadingProduct(false);
      })
      .catch(err => {
        console.error(err);
        setError(err.message);
        setLoadingProduct(false);
      });
  }, [id]);

  useDocumentTitle(product ? `${product.name} | Sneakers` : 'Loading... | Sneakers');

  // Reset quantity when variant changes
  useEffect(() => {
    setQuantity(1);
  }, [selectedVariant]);

  if (loadingProduct || loadingVariants) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="font-mono text-volt animate-pulse">Loading product details...</div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4 text-center px-4">
        <h2 className="font-display text-4xl text-bone">Product Not Found</h2>
        <p className="font-mono text-smoke">The product you're looking for doesn't exist or has been removed.</p>
        <Link to="/store" className="mt-4 px-6 py-2 bg-volt text-ink font-display uppercase tracking-wider rounded-full hover:scale-105 transition-transform">
          Back to Store
        </Link>
      </div>
    );
  }

  const handleAdd = () => {
    if (isSoldOut || !selectedVariant || isSelectedVariantOut) return;
    
    // Check if adding exceeds available stock
    const cartItem = items.find(i => i.variant_id === selectedVariant.id);
    const currentCartQty = cartItem ? cartItem.qty : 0;
    
    if (currentCartQty + quantity > selectedVariant.quantity) {
      alert(`Only ${selectedVariant.quantity} left in stock. You already have ${currentCartQty} in cart.`);
      return;
    }

    addItem({ 
      ...product, 
      variant_id: selectedVariant.id, 
      size: selectedVariant.size, 
      colorway: selectedVariant.color,
      max_qty: selectedVariant.quantity
    }, quantity);
  };

  const handleQtyChange = (delta) => {
    const newQty = quantity + delta;
    if (newQty < 1) return;
    if (selectedVariant && newQty > selectedVariant.quantity) return;
    setQuantity(newQty);
  };

  return (
    <div className="container mx-auto px-4 py-12 md:py-24 max-w-6xl">
      <div className="mb-8">
        <Link to="/store" className="font-mono text-sm text-smoke hover:text-volt transition-colors">
          ← Back to Store
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-24">
        {/* Left: Image Gallery */}
        <div className="relative aspect-square w-full rounded-3xl overflow-hidden bg-ink border border-white/10">
          <img
            src={product.image}
            alt={product.name}
            className={`h-full w-full object-cover ${isSoldOut ? 'opacity-80 grayscale' : ''}`}
          />
          {product.tag && !isSoldOut && (
            <div className="absolute left-6 top-6 z-10 rounded-full bg-volt px-4 py-1.5 font-mono text-xs font-bold uppercase tracking-wider text-ink shadow-lg">
              {product.tag}
            </div>
          )}
          {isSoldOut && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-20">
              <span className="font-display text-5xl text-red-500 border-4 border-red-500 px-8 py-3 -rotate-12 uppercase tracking-widest shadow-2xl">
                Sold Out
              </span>
            </div>
          )}
        </div>

        {/* Right: Product Details */}
        <div className="flex flex-col justify-center">
          <div className="mb-2 font-mono text-sm text-smoke uppercase tracking-widest">
            {product.sku || 'N/A'}
          </div>
          <h1 className="font-display text-5xl md:text-6xl text-bone uppercase leading-none tracking-tight mb-4">
            {product.name}
          </h1>
          
          <div className="font-mono text-3xl font-bold text-volt mb-8">
            ${product.price.toFixed(2)}
          </div>

          <div className="prose prose-invert prose-p:text-smoke mb-10 max-w-none">
            <p>
              {product.description || 
               "Experience the perfect blend of heritage design and modern comfort. These sneakers feature premium materials, responsive cushioning, and the iconic styling that has defined sneaker culture for decades. Whether on the court or the streets, they deliver unmatched performance and bold aesthetics."}
            </p>
          </div>

          {/* Configuration */}
          <div className="space-y-8 bg-graphite/30 p-6 rounded-2xl border border-white/5">
            {/* Color Selection */}
            {availableColors.length > 0 && (
              <div>
                <h3 className="font-mono text-sm text-bone mb-3 uppercase tracking-wider">
                  Color: <span className="text-smoke normal-case">{selectedColor}</span>
                </h3>
                <div className="flex flex-wrap gap-3">
                  {availableColors.map(color => (
                    <button
                      key={color}
                      onClick={() => setSelectedColor(color)}
                      disabled={isSoldOut}
                      className={`text-sm px-4 py-2 rounded border font-mono transition-colors
                        ${selectedColor === color 
                          ? 'bg-volt text-ink border-volt font-bold shadow-[0_0_15px_rgba(215,255,62,0.3)]' 
                          : 'bg-black/50 text-smoke border-white/20 hover:border-white/50 hover:text-bone'}`}
                    >
                      {color}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Size Selection */}
            {sizesForColor.length > 0 && (
              <div>
                <h3 className="font-mono text-sm text-bone mb-3 uppercase tracking-wider flex justify-between">
                  <span>Size</span>
                  {selectedVariant && (
                    <span className="text-smoke normal-case">
                      {selectedVariant.quantity > 0 
                        ? `${selectedVariant.quantity} in stock` 
                        : 'Out of stock'}
                    </span>
                  )}
                </h3>
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                  {sizesForColor.map(v => (
                    <button
                      key={v.id}
                      disabled={v.quantity === 0 || isSoldOut}
                      onClick={() => setSelectedVariant(v)}
                      className={`font-mono py-3 rounded transition-all duration-200
                        ${v.quantity === 0 
                          ? 'opacity-30 line-through cursor-not-allowed border border-white/10 text-smoke bg-black/20' 
                          : selectedVariant?.id === v.id 
                            ? 'bg-white text-ink font-bold shadow-lg scale-105' 
                            : 'bg-black/40 text-bone border border-white/10 hover:bg-white/10 hover:border-white/30'}
                      `}
                    >
                      {v.size}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Add to Cart Actions */}
            <div className="pt-4 flex flex-col sm:flex-row gap-4 items-end">
              {/* Quantity Selector */}
              <div className="flex flex-col gap-2 w-full sm:w-auto">
                <label className="font-mono text-xs text-smoke uppercase tracking-wider">Quantity</label>
                <div className="flex items-center bg-black/50 border border-white/20 rounded-full p-1 w-full sm:w-32 justify-between">
                  <button 
                    onClick={() => handleQtyChange(-1)} 
                    disabled={quantity <= 1 || isSoldOut}
                    className="w-10 h-10 rounded-full flex items-center justify-center text-smoke hover:bg-white/10 hover:text-bone disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    -
                  </button>
                  <span className="font-mono text-bone font-bold">{quantity}</span>
                  <button 
                    onClick={() => handleQtyChange(1)} 
                    disabled={!selectedVariant || quantity >= selectedVariant.quantity || isSoldOut}
                    className="w-10 h-10 rounded-full flex items-center justify-center text-smoke hover:bg-white/10 hover:text-bone disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Add Button */}
              <button
                onClick={handleAdd}
                disabled={isSoldOut || isSelectedVariantOut}
                className="flex-1 rounded-full bg-volt px-8 py-4 font-display text-xl uppercase tracking-wider text-ink
                  transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]
                  disabled:opacity-30 disabled:hover:scale-100 disabled:cursor-not-allowed
                  shadow-[0_0_20px_rgba(215,255,62,0.2)] hover:shadow-[0_0_30px_rgba(215,255,62,0.4)]"
              >
                {isSoldOut ? 'Sold Out' : (isSelectedVariantOut ? 'Select Size' : 'Add to Cart')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
