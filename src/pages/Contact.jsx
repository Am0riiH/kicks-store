import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

/* PLACEHOLDER COPY — demo content for a portfolio build.
   Replace the support address, hours, and response times with real values
   before launch. No contact form here on purpose: there is no backend
   endpoint to receive one, and a form that silently discards messages is
   worse than a plain mailto link. */

const CHANNELS = [
  {
    heading: 'Order support',
    body: 'Questions about an existing order, shipping status, or a return.',
    action: 'support@example.com',
  },
  {
    heading: 'Authentication',
    body: 'Ask about the verification process or request paperwork for a pair.',
    action: 'verify@example.com',
  },
  {
    heading: 'Press and partnerships',
    body: 'Collabs, wholesale, and everything commercial.',
    action: 'press@example.com',
  },
];

export default function Contact() {
  useDocumentTitle('Contact | Drop Site');

  return (
    <div className="mx-auto max-w-5xl px-6 py-20 sm:px-10">
      <span className="font-mono text-xs uppercase tracking-widest text-volt">Get in touch</span>
      <h1 className="mt-2 font-display text-5xl uppercase leading-[0.95] text-bone sm:text-7xl">
        Contact
        <br />
        Us
      </h1>

      <p className="mt-8 max-w-2xl text-lg leading-relaxed text-smoke">
        Real people read every message. We answer within one business day, Monday to Friday,
        09:00–18:00 CET. Include your order reference if you have one — it gets you a faster
        answer.
      </p>

      <div className="mt-14 grid grid-cols-1 gap-8 border-y border-white/10 py-10 sm:grid-cols-3">
        {CHANNELS.map((c) => (
          <div key={c.heading} className="flex flex-col gap-2">
            <h2 className="font-display text-xl uppercase text-bone">{c.heading}</h2>
            <p className="text-sm leading-relaxed text-smoke">{c.body}</p>
            <a
              href={`mailto:${c.action}`}
              className="mt-1 font-mono text-xs uppercase tracking-widest text-volt hover:underline"
            >
              {c.action}
            </a>
          </div>
        ))}
      </div>

      <div className="mt-14">
        <h2 className="font-display text-2xl uppercase text-bone">Before you write</h2>
        <p className="mt-3 max-w-2xl text-smoke">
          Most questions about delivery windows, return eligibility, and authenticity are already
          answered on the{' '}
          <a href="/faq" className="text-volt underline underline-offset-2 decoration-volt/40 hover:decoration-volt">
            FAQ
          </a>{' '}
          and{' '}
          <a href="/shipping-returns" className="text-volt underline underline-offset-2 decoration-volt/40 hover:decoration-volt">
            Shipping and returns
          </a>{' '}
          pages.
        </p>
      </div>
    </div>
  );
}
