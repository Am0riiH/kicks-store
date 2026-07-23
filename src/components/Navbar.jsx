import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext.jsx';
import ProductCard from './ProductCard.jsx';

const API_BASE = 'http://localhost:3001';

/* ---------------------------------------------------------
   Small inline icon set (no external icon lib needed)
--------------------------------------------------------- */
function SearchIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}
function CartIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M3 3h2l.4 2M7 13h10l3-8H5.4M7 13L5.4 5M7 13l-1.5 6h11" />
      <circle cx="9" cy="21" r="1" />
      <circle cx="18" cy="21" r="1" />
    </svg>
  );
}
function CloseIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
function MenuIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

/* ---------------------------------------------------------
   Mobile full-screen nav drawer
--------------------------------------------------------- */
function MobileNavDrawer({ isOpen, onClose }) {
  const navigate = useNavigate ? undefined : undefined; // Link handles routing
  const { setCartOpen, setSearchOpen } = useCart();

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const NAV_LINKS = [
    { to: '/store',      label: 'Store'      },
    { to: '/categories', label: 'Categories' },
    { to: '/about',      label: 'About'      },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-ink/98 backdrop-blur-xl sm:hidden mobile-nav-open"
      role="dialog"
      aria-modal="true"
      aria-label="Mobile navigation"
    >
      {/* Top bar mirrors the real header */}
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <span className="font-display text-3xl uppercase tracking-wide text-bone">
          NIKE<span className="text-volt">.</span>
        </span>
        <button
          onClick={onClose}
          className="rounded-full p-3 text-bone transition hover:bg-white/10 min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Close menu"
        >
          <CloseIcon className="h-6 w-6" />
        </button>
      </div>

      {/* Primary nav links */}
      <nav className="flex flex-1 flex-col px-6 pt-8 gap-1">
        {NAV_LINKS.map(({ to, label }) => (
          <Link
            key={to}
            to={to}
            onClick={onClose}
            className="mobile-nav-link font-display text-4xl uppercase text-bone border-b border-white/10 hover:text-volt transition-colors duration-150 pr-2"
          >
            {label}
          </Link>
        ))}
      </nav>

      {/* Bottom action row: Search + Cart */}
      <div className="flex items-center gap-3 border-t border-white/10 px-6 py-6">
        <button
          onClick={() => { setSearchOpen(true); onClose(); }}
          className="flex items-center gap-2 rounded-full border border-white/20 px-5 py-3 font-mono text-xs uppercase tracking-widest text-bone hover:bg-white/10 transition min-h-[44px]"
        >
          <SearchIcon className="h-4 w-4" />
          Search
        </button>
        <button
          onClick={() => { setCartOpen(true); onClose(); }}
          className="flex items-center gap-2 rounded-full border border-white/20 px-5 py-3 font-mono text-xs uppercase tracking-widest text-bone hover:bg-white/10 transition min-h-[44px]"
        >
          <CartIcon className="h-4 w-4" />
          Cart
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Payment mark placeholders — clean geometric SVGs, no
   trademarked artwork, just recognizable shapes + wordmarks
--------------------------------------------------------- */
function PaymentIcons() {
  const marks = [
    { label: 'Visa', bg: '#1A1F71' },
    { label: 'Mastercard', bg: '#000000', dual: true },
    { label: 'Apple Pay', bg: '#000000' },
    { label: 'G Pay', bg: '#1f1f1f' },
  ];
  return (
    <div className="flex items-center gap-2">
      {marks.map((m) => (
        <div
          key={m.label}
          className="flex h-8 flex-1 items-center justify-center rounded-md border border-white/10 text-[10px] font-bold uppercase tracking-wide text-bone"
          style={{ background: m.bg }}
        >
          {m.dual ? (
            <span className="flex items-center">
              <span className="-mr-2 h-4 w-4 rounded-full bg-red-500/90" />
              <span className="h-4 w-4 rounded-full bg-yellow-400/90" />
            </span>
          ) : (
            m.label
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------
   Fullscreen Search Modal
--------------------------------------------------------- */
function SearchModal() {
  const { isSearchOpen, setSearchOpen, addItem } = useCart();
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isSearchOpen && products.length === 0) {
      setLoading(true);
      fetch(`${API_BASE}/api/products`)
        .then(res => res.json())
        .then(data => {
          setProducts(data.products || []);
          setLoading(false);
        })
        .catch(err => {
          console.error('Failed to fetch products for search', err);
          setLoading(false);
        });
    }
  }, [isSearchOpen, products.length]);

  // Fix 3a: Escape key closes the search modal
  useEffect(() => {
    if (!isSearchOpen) return;
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setQuery('');
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isSearchOpen, setSearchOpen]);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.colorway && p.colorway.toLowerCase().includes(q)) ||
        p.category.toLowerCase().includes(q)
    );
  }, [query, products]);

  if (!isSearchOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-ink/98 backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-label="Search"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-5 sm:px-12">
        <span className="font-display text-lg uppercase tracking-wide text-smoke">Search the drop</span>
        <button
          onClick={() => {
            setSearchOpen(false);
            setQuery('');
          }}
          className="rounded-full p-2 text-bone transition hover:bg-white/10"
          aria-label="Close search"
        >
          <CloseIcon className="h-6 w-6" />
        </button>
      </div>

      <div className="px-6 pt-10 sm:px-12">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="TYPE A SILHOUETTE, COLORWAY, OR CATEGORY..."
          className="w-full border-b-2 border-white/20 bg-transparent pb-4 font-display text-4xl uppercase
            tracking-tight text-bone placeholder:text-white/20 focus:border-volt focus:outline-none sm:text-6xl"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-10 sm:px-12">
        {query.trim() === '' && (
          <p className="font-mono text-sm uppercase tracking-widest text-smoke">
            {loading ? 'Loading catalog...' : 'Start typing to filter the catalog in real time.'}
          </p>
        )}
        {query.trim() !== '' && results.length === 0 && !loading && (
          <p className="font-mono text-sm uppercase tracking-widest text-smoke">
            No matches for "{query}".
          </p>
        )}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {results.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Checkout button — calls the Express backend, redirects to Stripe
--------------------------------------------------------- */
function CheckoutButton({ items }) {
  const [loading, setLoading]     = useState(false);
  const [error,   setError]       = useState(null);

  const handleCheckout = async () => {
    if (items.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('http://localhost:3001/api/create-checkout-session', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((item) => ({
            name:       item.name,
            price:      item.price,
            quantity:   item.qty,
            variant_id: item.variant_id, // Ensure variant_id is passed to backend!
            // Only pass image if it starts with http (Stripe requires absolute URLs)
            ...(item.image && /^https?:\/\//.test(item.image) ? { image: item.image } : {}),
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Server error ${response.status}`);
      }

      if (!data.url) {
        throw new Error('No checkout URL returned from server.');
      }

      // Hand off to Stripe's hosted checkout page
      window.location.href = data.url;
    } catch (err) {
      console.error('Checkout error:', err);
      setError(
        err.message === 'Failed to fetch'
          ? 'Cannot reach the checkout server. Make sure it\'s running on port 3001.'
          : err.message || 'Something went wrong. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-5 flex flex-col gap-2">
      <button
        id="checkout-btn"
        onClick={handleCheckout}
        disabled={items.length === 0 || loading}
        aria-busy={loading}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-ink py-4
          font-display text-base uppercase tracking-wide text-volt
          transition-transform duration-200 hover:scale-[1.02] active:scale-95
          disabled:opacity-30 disabled:hover:scale-100 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            {/* Spinner SVG — no external dependency */}
            <svg
              className="h-4 w-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden="true"
            >
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            Processing…
          </>
        ) : (
          'Checkout'
        )}
      </button>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-400/40 bg-red-50 px-4 py-2 font-mono
            text-xs text-red-700 leading-snug"
        >
          ⚠ {error}
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   Invoice-style Cart Drawer
--------------------------------------------------------- */
function CartDrawer() {
  const { items, isCartOpen, setCartOpen, removeItem, updateQty, subtotal, tax, total, TAX_RATE } =
    useCart();

  // Fix 3b: Escape key closes the cart drawer
  useEffect(() => {
    if (!isCartOpen) return;
    const handleEscape = (e) => {
      if (e.key === 'Escape') setCartOpen(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isCartOpen, setCartOpen]);

  return (
    <>
      {/* backdrop */}
      <div
        onClick={() => setCartOpen(false)}
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-300 ${isCartOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
          }`}
      />

      {/* drawer */}
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col
          bg-bone text-ink shadow-2xl transition-transform duration-500 ease-out
          ${isCartOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* receipt header */}
        <div className="border-b-2 border-dashed border-ink/20 px-8 pb-6 pt-8">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-display text-2xl uppercase tracking-tight">Order Receipt</p>
              <p className="font-mono text-xs text-ink/50">
                {new Date().toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}{' '}
                · #{Math.floor(100000 + Math.random() * 900000)}
              </p>
            </div>
            <button
              onClick={() => setCartOpen(false)}
              className="rounded-full p-2 transition hover:bg-ink/5"
              aria-label="Close cart"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* line items */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {items.length === 0 ? (
            <p className="font-mono text-sm text-ink/50">Your cart is empty. Go start a drop.</p>
          ) : (
            <ul className="flex flex-col gap-5">
              {items.map((item) => (
                <li key={item.variant_id || item.id} className="flex gap-4 border-b border-ink/10 pb-5">
                  <img
                    src={`${item.image}&w=80`}
                    alt={item.name}
                    className="h-16 w-16 rounded-lg object-cover"
                  />
                  <div className="flex flex-1 flex-col">
                    <div className="flex items-start justify-between">
                      <p className="font-display text-sm uppercase leading-tight">{item.name}</p>
                      <button
                        onClick={() => removeItem(item.variant_id)}
                        className="font-mono text-[11px] uppercase text-ink/40 hover:text-ink"
                        aria-label={`Remove ${item.name} from cart`}
                      >
                        remove
                      </button>
                    </div>
                    <p className="font-mono text-xs text-ink/50">
                      {item.colorway} · {item.size}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateQty(item.variant_id, item.qty - 1)}
                          className="h-6 w-6 rounded-full border border-ink/20 font-mono text-xs"
                          aria-label={`Decrease quantity for ${item.name}`}
                        >
                          −
                        </button>
                        <span className="font-mono text-xs" aria-live="polite" aria-label={`Quantity: ${item.qty}`}>{item.qty}</span>
                        <button
                          onClick={() => updateQty(item.variant_id, item.qty + 1)}
                          className="h-6 w-6 rounded-full border border-ink/20 font-mono text-xs"
                          aria-label={`Increase quantity for ${item.name}`}
                        >
                          +
                        </button>
                      </div>
                      <span className="font-mono text-sm font-bold">
                        ${(item.price * item.qty).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* invoice totals */}
        <div className="border-t-2 border-dashed border-ink/20 px-8 py-6">
          <div className="flex flex-col gap-2 font-mono text-sm">
            <div className="flex justify-between text-ink/60">
              <span>Subtotal</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-ink/60">
              <span>Tax ({(TAX_RATE * 100).toFixed(0)}%)</span>
              <span>${tax.toFixed(2)}</span>
            </div>
            <div className="mt-2 flex justify-between border-t border-ink/20 pt-2 font-display text-lg uppercase tracking-tight text-ink">
              <span>Total</span>
              <span>${total.toFixed(2)}</span>
            </div>
          </div>

          <CheckoutButton items={items} />

          <div className="mt-4">
            <PaymentIcons />
          </div>
        </div>
      </aside>
    </>
  );
}

/* ---------------------------------------------------------
   Navbar
--------------------------------------------------------- */
export default function Navbar() {
  const navigate = useNavigate();
  const { count, setCartOpen, isSearchOpen, setSearchOpen } = useCart();
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);

  // ── Feature 3: Logo Easter Egg ──────────────────────────────────────────
  // Track rapid clicks: 5 within 1.5s triggers the animation.
  const eggClicksRef = useRef(0);
  const eggTimerRef  = useRef(null);

  const VOLT_COLORS = ['#d7ff3e', '#ffffff', '#ff3e6c', '#3effcd', '#ffe03e'];

  const fireParticles = useCallback((anchorEl) => {
    const rect = anchorEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top  + rect.height / 2;
    const count = 18;

    for (let i = 0; i < count; i++) {
      const angle = (2 * Math.PI * i) / count + Math.random() * 0.4;
      const dist  = 55 + Math.random() * 55;
      const tx    = Math.cos(angle) * dist;
      const ty    = Math.sin(angle) * dist - 20;
      const color = VOLT_COLORS[Math.floor(Math.random() * VOLT_COLORS.length)];

      const p = document.createElement('div');
      p.className = 'easter-particle';
      p.style.left    = `${cx - 4}px`;
      p.style.top     = `${cy - 4}px`;
      p.style.background = color;
      p.style.setProperty('--tx', `${tx}px`);
      p.style.setProperty('--ty', `${ty}px`);
      document.body.appendChild(p);
      // Remove after animation ends
      p.addEventListener('animationend', () => p.remove(), { once: true });
    }
  }, []);

  const handleLogoEasterEgg = useCallback((e) => {
    // Always reset the debounce timer
    clearTimeout(eggTimerRef.current);
    eggClicksRef.current += 1;

    if (eggClicksRef.current >= 5) {
      eggClicksRef.current = 0;
      // Animate the logo span
      const logoSpan = document.getElementById('logo-text');
      if (logoSpan) {
        logoSpan.classList.remove('logo-easter-egg');
        // Force reflow so re-adding the class re-triggers the animation
        void logoSpan.offsetWidth;
        logoSpan.classList.add('logo-easter-egg');
        logoSpan.addEventListener('animationend', () => {
          logoSpan.classList.remove('logo-easter-egg');
        }, { once: true });
        // Fire particle burst from the logo element
        fireParticles(logoSpan);
      }
    } else {
      // Reset counter if user stops clicking for 1.5 s
      eggTimerRef.current = setTimeout(() => {
        eggClicksRef.current = 0;
      }, 1500);
    }
  }, [fireParticles]);

  const handleLogoClick = (e) => {
    e.preventDefault();
    navigate('/');
    // Tell Home.jsx to strictly re-run Phase 0 (the 360 drop) even if
    // we're already on "/". CustomEvent works whether or not the route
    // actually changes, since react-router won't remount on same path.
    window.dispatchEvent(new CustomEvent('replay-intro'));
  };

  // Combined logo click: navigation first, then easter egg check
  const onLogoClick = (e) => {
    handleLogoClick(e);
    handleLogoEasterEgg(e);
  };

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-ink/70 px-6 py-4 backdrop-blur-md sm:px-10">
        <a href="/" onClick={onLogoClick} className="font-display text-3xl uppercase tracking-wide text-bone">
          <span id="logo-text">NIKE<span className="text-volt">.</span></span>
        </a>

        <nav className="hidden gap-8 font-mono text-xs uppercase tracking-widest text-smoke sm:flex">
          <Link to="/store" className="transition hover:text-volt">
            Store
          </Link>
          <Link to="/categories" className="transition hover:text-volt">
            Categories
          </Link>
          <Link to="/about" className="transition hover:text-volt">
            About
          </Link>
        </nav>

        <div className="flex items-center gap-2 sm:gap-4">
          <button
            onClick={() => setSearchOpen(!isSearchOpen)}
            className="rounded-full p-2.5 text-bone transition hover:bg-white/10 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Open search"
          >
            <SearchIcon className="h-5 w-5" />
          </button>
          <button
            onClick={() => setCartOpen(true)}
            className="relative rounded-full p-2.5 text-bone transition hover:bg-white/10 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Open cart"
          >
            <CartIcon className="h-5 w-5" />
            {count > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-volt font-mono text-[9px] font-bold text-ink">
                {count}
              </span>
            )}
          </button>
          {/* Hamburger — only visible below sm breakpoint */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="sm:hidden rounded-full p-2.5 text-bone transition hover:bg-white/10 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Open menu"
            aria-expanded={isMobileMenuOpen}
          >
            <MenuIcon className="h-5 w-5" />
          </button>
        </div>
      </header>

      <SearchModal />
      <CartDrawer />
      <MobileNavDrawer isOpen={isMobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
    </>
  );
}
