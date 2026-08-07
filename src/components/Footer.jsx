import { useState } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE, describeApiError } from '../lib/api.js';

/* TODO: PLACEHOLDER SOCIAL LINKS — every href below is "#".
   Replace with the real profile URLs before launch, and add
   target="_blank" rel="noopener noreferrer" once they point off-site. */
const SOCIALS = [
  {
    name: 'Instagram',
    href: '#',
    path: (
      <>
        <rect x="2" y="2" width="20" height="20" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <line x1="17.5" y1="6.5" x2="17.5" y2="6.5" />
      </>
    ),
  },
  {
    name: 'X',
    href: '#',
    path: <path d="M4 4l16 16M20 4L4 20" />,
  },
  {
    name: 'TikTok',
    href: '#',
    path: (
      <>
        <path d="M15 4v10.5a3.5 3.5 0 1 1-3.5-3.5" />
        <path d="M15 4a5 5 0 0 0 5 5" />
      </>
    ),
  },
];

const SHOP_LINKS = [
  { label: 'All sneakers', to: '/store' },
  { label: 'Categories', to: '/categories' },
  { label: 'New drops', to: '/store?tag=New' },
  { label: 'Limited', to: '/store?tag=Limited' },
];

const COMPANY_LINKS = [
  { label: 'About', to: '/about' },
  { label: 'Contact', to: '/contact' },
  { label: 'FAQ', to: '/faq' },
];

const LEGAL_LINKS = [
  { label: 'Privacy policy', to: '/privacy' },
  { label: 'Terms of service', to: '/terms' },
  { label: 'Shipping and returns', to: '/shipping-returns' },
];

function ColumnHeading({ children }) {
  return (
    <h2 className="mb-4 font-mono text-xs uppercase tracking-widest text-smoke">{children}</h2>
  );
}

function LinkList({ links }) {
  return (
    <ul className="flex flex-col gap-3">
      {links.map((l) => (
        <li key={l.to}>
          <Link to={l.to} className="text-sm text-smoke transition-colors hover:text-bone">
            {l.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* Decorative payment marks — wordmarks rather than brand logos, so nothing
   here misrepresents a partnership. aria-hidden: they convey no information a
   screen-reader user needs at this point in the page. */
function PaymentMarks() {
  return (
    <div aria-hidden="true" className="flex items-center gap-2">
      {['VISA', 'MC', 'PAYPAL'].map((label) => (
        <span
          key={label}
          className="rounded border border-white/15 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-white/40"
        >
          {label}
        </span>
      ))}
    </div>
  );
}

function NewsletterForm() {
  const [emailValue, setEmailValue] = useState('');
  const [status, setStatus] = useState('idle'); // idle | submitting | success | error
  const [message, setMessage] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('submitting');
    setMessage(null);

    try {
      const res = await fetch(`${API_BASE}/api/newsletter/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailValue }),
      });
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        setStatus('error');
        setMessage(describeApiError(body, res.status));
        return;
      }

      setStatus('success');
      setMessage(
        body?.alreadySubscribed
          ? "You're already on the list — nothing to do."
          : "You're in. Watch your inbox for the next drop."
      );
      setEmailValue('');
    } catch {
      setStatus('error');
      setMessage('Could not reach the server. Check your connection and try again.');
    }
  };

  const busy = status === 'submitting';

  return (
    <div>
      <ColumnHeading>Newsletter</ColumnHeading>
      <p className="mb-4 text-sm leading-relaxed text-smoke">
        Drop alerts and restocks. No spam, unsubscribe anytime.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:gap-2">
        <label htmlFor="newsletter-email" className="sr-only">
          Email address
        </label>
        <input
          id="newsletter-email"
          type="email"
          required
          value={emailValue}
          onChange={(e) => setEmailValue(e.target.value)}
          placeholder="you@example.com"
          disabled={busy}
          className="min-w-0 flex-1 rounded border border-white/15 bg-white/5 px-3 py-2 text-sm text-bone placeholder:text-white/25 focus:border-volt focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-volt px-4 py-2 font-display text-sm uppercase tracking-wide text-ink transition-colors hover:bg-volt/90 disabled:opacity-50 disabled:hover:bg-volt"
        >
          {busy ? 'Joining…' : 'Join'}
        </button>
      </form>

      {message && (
        <p
          role="alert"
          className={`mt-3 text-xs leading-relaxed ${
            status === 'error' ? 'text-red-400' : 'text-volt'
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}

export default function Footer() {
  return (
    <footer className="relative z-10 border-t border-white/10 bg-ink">
      <div className="mx-auto max-w-7xl px-6 py-16 sm:px-10">
        <div className="grid grid-cols-2 gap-x-8 gap-y-12 lg:grid-cols-5">
          {/* Brand */}
          <div className="col-span-2 lg:col-span-2">
            <Link to="/" className="font-display text-2xl uppercase tracking-tight text-bone">
              NIKE<span className="text-volt">.</span>
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-smoke">
              Authenticated pairs, limited releases, and the archive — shipped worldwide.
            </p>
            <div className="mt-6 flex items-center gap-3">
              {SOCIALS.map((s) => (
                <a
                  key={s.name}
                  href={s.href}
                  aria-label={s.name}
                  className="rounded-full border border-white/15 p-2 text-smoke transition-colors hover:border-volt hover:text-volt"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="h-4 w-4"
                  >
                    {s.path}
                  </svg>
                </a>
              ))}
            </div>
          </div>

          <div>
            <ColumnHeading>Shop</ColumnHeading>
            <LinkList links={SHOP_LINKS} />
          </div>

          <div>
            <ColumnHeading>Company</ColumnHeading>
            <LinkList links={COMPANY_LINKS} />
          </div>

          <div className="col-span-2 lg:col-span-1">
            <ColumnHeading>Legal</ColumnHeading>
            <LinkList links={LEGAL_LINKS} />
          </div>

          <div className="col-span-2 lg:col-span-5 lg:max-w-md">
            <NewsletterForm />
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-14 flex flex-col gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-xs text-white/40">
            © {new Date().getFullYear()} Air Jordan Drop Site. All rights reserved.
          </p>
          <PaymentMarks />
        </div>
      </div>
    </footer>
  );
}
