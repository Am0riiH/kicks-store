import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

const categories = [
  { id: 'high-top', name: 'High-Top', desc: 'Court heritage, ankle-locked silhouettes.', count: 12 },
  { id: 'mid-top', name: 'Mid-Top', desc: 'The all-rounder cut. Balanced and bold.', count: 18 },
  { id: 'low-top', name: 'Low-Top', desc: 'Street-first, low-profile speed.', count: 9 },
  { id: 'retro', name: 'Retro Vault', desc: 'Archive colorways, re-released.', count: 14 },
];

export default function Categories() {
  useDocumentTitle('Browse by Silhouette | Sneakers');
  return (
    <div className="mx-auto max-w-7xl px-6 py-16 sm:px-10">
      <div className="mb-12">
        <span className="font-mono text-xs uppercase tracking-widest text-volt">Browse by cut</span>
        <h1 className="mt-2 font-display text-5xl uppercase leading-none text-bone sm:text-7xl">
          Categories
        </h1>
      </div>

      <div className="flex flex-col gap-6">
        {categories.map((cat, i) => (
          <Link
            to="/store"
            key={cat.id}
            className="diagonal-tick group relative flex items-center justify-between overflow-hidden
              border border-white/10 bg-graphite/70 px-8 py-10 transition-all duration-300
              hover:border-volt/50 hover:bg-graphite sm:px-14"
          >
            <span className="absolute -right-4 top-1/2 -translate-y-1/2 font-display text-[10rem] leading-none text-white/5 transition-colors duration-300 group-hover:text-volt/10">
              {String(i + 1).padStart(2, '0')}
            </span>

            <div className="relative z-10">
              <h2 className="font-display text-4xl uppercase tracking-tight text-bone transition-colors group-hover:text-volt sm:text-6xl">
                {cat.name}
              </h2>
              <p className="mt-2 max-w-md text-smoke">{cat.desc}</p>
            </div>

            <div className="relative z-10 flex flex-col items-end gap-2">
              <span className="font-mono text-xs uppercase tracking-widest text-smoke">
                {cat.count} styles
              </span>
              <span className="font-mono text-2xl text-volt transition-transform duration-300 group-hover:translate-x-2">
                →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
