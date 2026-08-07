import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ProductCard from '../components/ProductCard.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { API_BASE } from '../lib/api.js';

export default function Store() {
  const [searchParams] = useSearchParams();
  // ?tag=New / ?tag=Limited — the footer's "New drops" and "Limited" links.
  // Matched case-insensitively; an unknown or absent tag falls back to the
  // full catalog, so a bad URL degrades to the default view rather than an
  // empty page.
  const activeTag = (searchParams.get('tag') || '').trim();

  useDocumentTitle(activeTag ? `${activeTag} | Drop Site` : 'Shop All Sneakers | Drop Site');
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

  const visibleProducts = activeTag
    ? products.filter((p) => (p.tag || '').toLowerCase() === activeTag.toLowerCase())
    : products;

  return (
    <div className="mx-auto max-w-7xl px-6 py-16 sm:px-10">
      <div className="mb-12 flex flex-col gap-2 border-b border-white/10 pb-8">
        <span className="font-mono text-xs uppercase tracking-widest text-volt">
          {activeTag ? `Tagged “${activeTag}”` : 'Full Catalog'}
        </span>
        <h1 className="font-display text-5xl uppercase leading-none text-bone sm:text-7xl">
          {activeTag || 'The Store'}
        </h1>
        <p className="max-w-xl text-smoke">
          Every silhouette currently in rotation. New drops land weekly — check back or turn on
          restock alerts.
        </p>
        {activeTag && (
          <Link
            to="/store"
            className="mt-2 self-start font-mono text-xs uppercase tracking-widest text-volt hover:underline"
          >
            ← Clear filter
          </Link>
        )}
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
          visibleProducts.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))
        )}
      </div>

      {!loading && visibleProducts.length === 0 && (
        <p className="py-20 text-center font-mono text-sm uppercase tracking-widest text-smoke">
          {activeTag ? `Nothing tagged “${activeTag}” right now.` : 'No products yet.'}
        </p>
      )}
    </div>
  );
}
