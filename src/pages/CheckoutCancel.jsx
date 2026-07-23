import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext.jsx';

/**
 * /checkout/cancel
 *
 * Stripe redirects here when the user clicks "Back" on the hosted checkout page,
 * or if the payment fails. The cart is intentionally NOT cleared — the user's
 * items are still waiting for them.
 */
export default function CheckoutCancel() {
  const { setCartOpen } = useCart();

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-6 text-center">
      {/* Background glow — muted amber tint to signal "paused, not failed" */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        aria-hidden="true"
      >
        <div className="h-[400px] w-[400px] rounded-full bg-yellow-400/5 blur-[100px]" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-6 max-w-lg">
        {/* Icon */}
        <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-white/20 bg-white/5">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-10 w-10 text-smoke"
            aria-hidden="true"
          >
            {/* Shopping bag with a pause indicator */}
            <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 01-8 0" />
          </svg>
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="font-display text-5xl uppercase tracking-tight text-bone">
            Payment Cancelled
          </h1>
          <p className="font-mono text-sm uppercase tracking-widest text-smoke">
            Your cart is still waiting
          </p>
        </div>

        <p className="font-mono text-sm leading-relaxed text-smoke max-w-sm">
          No charge was made. Your selected items are still in your cart —
          head back whenever you're ready to complete your order.
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          {/* Re-open cart so they can pick up right where they left off */}
          <button
            id="cancel-reopen-cart"
            onClick={() => setCartOpen(true)}
            className="inline-flex items-center gap-2 rounded-full bg-volt px-8 py-3
              font-display text-sm uppercase tracking-wide text-ink
              transition-transform duration-200 hover:scale-[1.02] active:scale-95"
          >
            Return to Cart
          </button>
          <Link
            to="/store"
            id="cancel-back-to-store"
            className="inline-flex items-center gap-2 rounded-full border border-white/20 px-8 py-3
              font-display text-sm uppercase tracking-wide text-bone
              transition-transform duration-200 hover:scale-[1.02] active:scale-95"
          >
            Browse Store
          </Link>
        </div>
      </div>
    </div>
  );
}
