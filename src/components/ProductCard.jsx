import { useCart } from '../context/CartContext.jsx';
import { useNavigate } from 'react-router-dom';
import { useProductVariants } from '../hooks/useProductVariants.js';

/**
 * ProductCard
 * Bold, youthful card used in Store, Categories, Search results, and the
 * Home "Scroll 3" reveal. Pass `featured` for the larger hero treatment
 * used on the Home page.
 */
export default function ProductCard({ product, featured = false }) {
  const { items, addItem } = useCart();
  const navigate = useNavigate();
  const {
    variants,
    selectedColor,
    setSelectedColor,
    selectedVariant,
    setSelectedVariant,
    availableColors,
    sizesForColor,
    isSoldOut,
    isSelectedVariantOut
  } = useProductVariants(product.id);

  const handleAdd = (e) => {
    e.stopPropagation();
    if (isSoldOut || !selectedVariant || isSelectedVariantOut) return;
    
    // Check if adding one more exceeds available stock
    const cartItem = items.find(i => i.variant_id === selectedVariant.id);
    if (cartItem && cartItem.qty >= selectedVariant.quantity) {
      alert(`Only ${selectedVariant.quantity} left in stock for this size/color.`);
      return;
    }

    addItem({ 
      ...product, 
      variant_id: selectedVariant.id, 
      size: selectedVariant.size, 
      colorway: selectedVariant.color,
      max_qty: selectedVariant.quantity
    });
  };

  const handleCardClick = () => {
    navigate(`/product/${product.id}`);
  };

  return (
    <div
      onClick={handleCardClick}
      className={`group relative flex flex-col overflow-hidden rounded-3xl border border-white/10
        bg-graphite/80 backdrop-blur-md transition-all duration-300 cursor-pointer
        hover:border-volt/60 hover:-translate-y-1 hover:shadow-[0_0_40px_rgba(215,255,62,0.15)]
        ${featured ? 'w-full max-w-sm' : 'w-full'}
        ${isSoldOut ? 'opacity-80 grayscale' : ''}`}
    >
      {/* tag */}
      {product.tag && !isSoldOut && (
        <div className="absolute left-4 top-4 z-10 rounded-full bg-volt px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-ink">
          {product.tag}
        </div>
      )}

      {/* image */}
      <div className="relative aspect-square w-full overflow-hidden bg-ink">
        <img
          src={product.image}
          alt={product.name}
          className="h-full w-full object-cover opacity-90 transition-transform duration-500 group-hover:scale-110"
          loading="lazy"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-graphite via-transparent to-transparent" />
        
        {/* SOLD OUT OVERLAY */}
        {isSoldOut && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-20">
            <span className="font-display text-4xl text-red-500 border-4 border-red-500 px-6 py-2 -rotate-12 uppercase tracking-widest">
              Sold Out
            </span>
          </div>
        )}
      </div>

      {/* body */}
      <div className="flex flex-1 flex-col gap-1 p-5">
        <span className="font-mono text-[11px] uppercase tracking-widest text-smoke">
          {product.sku}
        </span>
        <h3 className="font-display text-xl uppercase leading-none tracking-tight text-bone">
          {product.name}
        </h3>
        
        {availableColors.length <= 1 ? (
          <p className="text-sm text-smoke">{product.colorway}</p>
        ) : (
          <div className="flex flex-wrap gap-2 mt-2">
            {availableColors.map(color => (
              <button
                key={color}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedColor(color);
                }}
                disabled={isSoldOut}
                className={`text-xs px-2 py-1 rounded border font-mono ${selectedColor === color ? 'bg-volt text-ink border-volt' : 'bg-transparent text-smoke border-white/20'}`}
              >
                {color}
              </button>
            ))}
          </div>
        )}

        {/* Size Selector */}
        {sizesForColor.length > 0 && (
          <div className="mt-3 grid grid-cols-4 gap-1">
            {sizesForColor.map(v => (
              <button
                key={v.id}
                disabled={v.quantity === 0 || isSoldOut}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedVariant(v);
                }}
                className={`font-mono text-xs py-1.5 rounded transition-colors
                  ${v.quantity === 0 ? 'opacity-30 line-through cursor-not-allowed border border-white/10 text-smoke' : 
                    selectedVariant?.id === v.id ? 'bg-white text-ink font-bold' : 'bg-white/5 text-bone hover:bg-white/10'}
                `}
              >
                {v.size}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <span className="font-mono text-lg font-bold text-volt">
            ${product.price.toFixed(2)}
          </span>
          <button
            onClick={handleAdd}
            disabled={isSoldOut || isSelectedVariantOut}
            className="rounded-full bg-volt px-5 py-2 font-display text-sm uppercase tracking-wide text-ink
              transition-transform duration-200 hover:scale-105 active:scale-95 min-h-[44px]
              disabled:opacity-30 disabled:hover:scale-100 disabled:cursor-not-allowed"
          >
            {isSoldOut ? 'Sold Out' : (isSelectedVariantOut ? 'Select Size' : 'Buy Now')}
          </button>
        </div>
      </div>
    </div>
  );
}
