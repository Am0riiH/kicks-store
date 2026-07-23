import { useState, useEffect } from 'react';
import ProductCard from '../components/ProductCard.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function Store() {
  useDocumentTitle('Shop All Sneakers | Drop Site');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/products`)
      .then(res => res.json())
      .then(data => {
        setProducts(data.products || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching products:', err);
        setLoading(false);
      });
  }, []);
  return (
    <div className="mx-auto max-w-7xl px-6 py-16 sm:px-10">
      <div className="mb-12 flex flex-col gap-2 border-b border-white/10 pb-8">
        <span className="font-mono text-xs uppercase tracking-widest text-volt">Full Catalog</span>
        <h1 className="font-display text-5xl uppercase leading-none text-bone sm:text-7xl">
          The Store
        </h1>
        <p className="max-w-xl text-smoke">
          Every silhouette currently in rotation. New drops land weekly — check back or turn on
          restock alerts.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          // Skeleton loaders
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse flex flex-col gap-4 border border-white/10 bg-white/5 p-6 rounded-xl h-[400px]">
              <div className="bg-white/10 h-48 w-full rounded-xl"></div>
              <div className="bg-white/10 h-6 w-3/4 rounded mt-4"></div>
              <div className="bg-white/10 h-4 w-1/2 rounded"></div>
            </div>
          ))
        ) : (
          products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))
        )}
      </div>
    </div>
  );
}
