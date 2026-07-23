import { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCart } from '../context/CartContext.jsx';

/**
 * /checkout/success
 *
 * Stripe redirects here after payment with ?session_id=cs_… in the URL.
 *
 * Flow
 * ────
 * 1. Read session_id from the URL query params.
 * 2. Poll GET /api/order-status?session_id=… (up to MAX_ATTEMPTS times,
 *    1.5 s apart) — the webhook may not have landed yet since the browser
 *    redirect often arrives faster than Stripe's webhook POST.
 * 3. On confirmed "paid":
 *    • Call clearCart() — now the authoritative signal, not the redirect alone
 *    • Show the "Order Confirmed" success UI with order details
 * 4. If polling exhausts all retries without finding the order:
 *    • Show a "We're confirming your order" pending state — NOT an error,
 *      just a race between redirect and webhook
 * 5. If no session_id in URL (user navigated here directly):
 *    • Show a generic fallback
 */

const API_BASE      = 'http://localhost:3001';
const MAX_ATTEMPTS  = 4;    // total tries: 0 ms, 1500 ms, 3000 ms, 4500 ms
const RETRY_DELAY   = 1500; // ms between retries

// Spinner SVG — inline, no import needed
function Spinner({ className = 'h-6 w-6' }) {
  return (
    <svg
      className={`${className} animate-spin`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      aria-hidden="true"
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

export default function CheckoutSuccess() {
  const { clearCart }      = useCart();
  const [searchParams]     = useSearchParams();
  const sessionId          = searchParams.get('session_id');

  // 'loading' | 'confirmed' | 'pending' | 'no-session'
  const [state, setState]  = useState('loading');
  const [order, setOrder]  = useState(null);
  const cartClearedRef     = useRef(false);   // guard: clearCart only once

  const confirmOrder = useCallback(async () => {
    if (!sessionId) {
      setState('no-session');
      return;
    }

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      // Wait before retries (not before the first attempt)
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, RETRY_DELAY));
      }

      try {
        const res  = await fetch(`${API_BASE}/api/order-status?session_id=${sessionId}`);
        const data = await res.json();

        if (res.ok && data.found) {
          // ✅ Order confirmed in DB — clear the cart (once) and show success
          if (!cartClearedRef.current) {
            clearCart();
            cartClearedRef.current = true;
          }
          setOrder(data);
          setState('confirmed');
          return;
        }
        // 404 means webhook hasn't arrived yet — retry
      } catch {
        // Network error — keep retrying
      }
    }

    // All retries exhausted — show pending state.
    // The order will eventually confirm via the webhook; we just can't show it yet.
    setState('pending');
  }, [sessionId, clearCart]);

  useEffect(() => {
    confirmOrder();
  }, [confirmOrder]);

  // ─── Background glow (shared) ──────────────────────────────────────────────
  const Glow = ({ color = 'volt' }) => (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
      <div className={`h-[480px] w-[480px] rounded-full ${color === 'volt' ? 'bg-volt/10' : 'bg-white/5'} blur-[120px]`} />
    </div>
  );

  // ─── Loading state ────────────────────────────────────────────────────────
  if (state === 'loading') {
    return (
      <div className="relative min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <Glow />
        <div className="relative z-10 flex flex-col items-center gap-4">
          <Spinner className="h-10 w-10 text-volt" />
          <p className="font-mono text-sm uppercase tracking-widest text-smoke">
            Confirming your order…
          </p>
          <p className="font-mono text-xs text-white/30 max-w-xs">
            Checking with the server — this only takes a moment.
          </p>
        </div>
      </div>
    );
  }

  // ─── Pending (webhook hasn't arrived yet) ──────────────────────────────────
  if (state === 'pending') {
    return (
      <div className="relative min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <Glow color="muted" />
        <div className="relative z-10 flex flex-col items-center gap-6 max-w-lg">
          <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-white/20 bg-white/5">
            <svg viewBox="0 0 24 24" fill="none" stroke="#d7ff3e" strokeWidth="2" className="h-10 w-10" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-4xl uppercase tracking-tight text-bone">
              Payment Received
            </h1>
            <p className="font-mono text-sm uppercase tracking-widest text-volt">
              Confirming your order…
            </p>
          </div>
          <p className="font-mono text-sm leading-relaxed text-smoke max-w-sm">
            Your payment went through, but our server is still processing the
            confirmation. Check your email for a receipt from Stripe — your order
            is safe. You can safely close this page.
          </p>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/store"
              id="pending-back-to-store"
              className="inline-flex items-center gap-2 rounded-full bg-volt px-8 py-3
                font-display text-sm uppercase tracking-wide text-ink
                transition-transform duration-200 hover:scale-[1.02] active:scale-95"
            >
              Continue Shopping
            </Link>
          </div>
          <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-white/20">
            🧪 Test mode — no real charge was made
          </p>
        </div>
      </div>
    );
  }

  // ─── No session_id in URL ──────────────────────────────────────────────────
  if (state === 'no-session') {
    return (
      <div className="relative min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <Glow color="muted" />
        <div className="relative z-10 flex flex-col items-center gap-6">
          <h1 className="font-display text-4xl uppercase tracking-tight text-bone">Nothing to confirm</h1>
          <p className="font-mono text-sm text-smoke">No checkout session was found in this URL.</p>
          <Link to="/store" className="inline-flex items-center gap-2 rounded-full bg-volt px-8 py-3 font-display text-sm uppercase tracking-wide text-ink">
            Browse Store
          </Link>
        </div>
      </div>
    );
  }

  // ─── Confirmed ─────────────────────────────────────────────────────────────
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <Glow />
      <div className="relative z-10 flex flex-col items-center gap-6 max-w-lg">

        {/* Checkmark */}
        <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-volt bg-volt/10">
          <svg
            viewBox="0 0 24 24" fill="none" stroke="#d7ff3e"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className="h-10 w-10" aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="font-display text-5xl uppercase tracking-tight text-bone">
            Order Confirmed
          </h1>
          <p className="font-mono text-sm uppercase tracking-widest text-volt">
            Thanks for your purchase
          </p>
        </div>

        {/* Order details card — populated from the real DB record */}
        {order && (
          <div className="w-full rounded-2xl border border-white/10 bg-white/5 px-6 py-5 text-left backdrop-blur-sm">
            <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-white/40">
              Order details
            </p>
            <div className="flex flex-col gap-2 font-mono text-sm">
              {order.customer_name && (
                <div className="flex justify-between">
                  <span className="text-smoke">Name</span>
                  <span className="text-bone">{order.customer_name}</span>
                </div>
              )}
              {order.customer_email && (
                <div className="flex justify-between">
                  <span className="text-smoke">Email</span>
                  <span className="text-bone">{order.customer_email}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-smoke">Total</span>
                <span className="text-volt font-bold">
                  ${(order.amount_total / 100).toFixed(2)} {order.currency?.toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-smoke">Order ID</span>
                <span className="truncate max-w-[180px] text-white/50 text-[11px]">
                  {order.id}
                </span>
              </div>
            </div>

            {/* Line items */}
            {Array.isArray(order.items) && order.items.length > 0 && (
              <div className="mt-4 border-t border-white/10 pt-4">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-white/40">Items</p>
                <ul className="flex flex-col gap-1">
                  {order.items.map((item, i) => (
                    <li key={i} className="flex justify-between font-mono text-xs">
                      <span className="text-smoke">{item.description} × {item.quantity}</span>
                      <span className="text-bone">${(item.amount / 100).toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <p className="font-mono text-sm leading-relaxed text-smoke max-w-sm">
          Your payment was confirmed by our server. Your kicks are on their way. 🔥
        </p>

        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <Link
            to="/store"
            id="success-back-to-store"
            className="inline-flex items-center gap-2 rounded-full bg-volt px-8 py-3
              font-display text-sm uppercase tracking-wide text-ink
              transition-transform duration-200 hover:scale-[1.02] active:scale-95"
          >
            Continue Shopping
          </Link>
          <Link
            to="/"
            id="success-back-home"
            className="inline-flex items-center gap-2 rounded-full border border-white/20 px-8 py-3
              font-display text-sm uppercase tracking-wide text-bone
              transition-transform duration-200 hover:scale-[1.02] active:scale-95"
          >
            Back to Home
          </Link>
        </div>

        <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-white/20">
          🧪 Test mode — no real charge was made
        </p>
      </div>
    </div>
  );
}
