import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

/* PLACEHOLDER COPY — demo content for a portfolio build.
   Every timeframe, fee, and policy below is illustrative. Replace with the
   real operational answers before launch. */

const FAQS = [
  {
    q: 'How do you authenticate pairs?',
    a: 'Every pair is inspected against factory records, box and label data, stitching, and materials before it is listed. Anything that fails a single check is rejected outright rather than discounted. Authentication paperwork ships with the order.',
  },
  {
    q: 'How long does shipping take?',
    a: 'Orders leave the warehouse within one business day. Domestic delivery lands in 2–4 business days, and international in 5–10 depending on customs. You receive a tracking link as soon as the label is created.',
  },
  {
    q: 'What is your return policy?',
    a: 'Unworn pairs can be returned within 30 days of delivery, in the original box with all inserts included. Refunds are issued to the original payment method once the pair passes an inspection on arrival.',
  },
  {
    q: 'Can I track my order?',
    a: 'Yes. The confirmation email contains your order reference, and a tracking link follows once the parcel is scanned by the carrier. If the tracking has not moved after two business days, contact support and we will chase it.',
  },
  {
    q: 'Do you restock sold-out sizes?',
    a: 'Sometimes. Limited releases are one-and-done, but core colorways are restocked when we source them. Join the newsletter in the footer to hear about restocks before they go live.',
  },
];

export default function FAQ() {
  useDocumentTitle('FAQ | Drop Site');

  return (
    <div className="mx-auto max-w-5xl px-6 py-20 sm:px-10">
      <span className="font-mono text-xs uppercase tracking-widest text-volt">Answers</span>
      <h1 className="mt-2 font-display text-5xl uppercase leading-[0.95] text-bone sm:text-7xl">
        Frequently
        <br />
        Asked
      </h1>

      <p className="mt-8 max-w-2xl text-lg leading-relaxed text-smoke">
        The questions we get most. If yours is not here, support answers within one business day.
      </p>

      <dl className="mt-14 flex flex-col divide-y divide-white/10 border-y border-white/10">
        {FAQS.map((item) => (
          <div key={item.q} className="py-8">
            <dt className="font-display text-xl uppercase leading-tight text-bone sm:text-2xl">
              {item.q}
            </dt>
            <dd className="mt-3 max-w-3xl leading-relaxed text-smoke">{item.a}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-10 text-smoke">
        Still stuck?{' '}
        <a href="/contact" className="text-volt hover:underline">
          Contact us
        </a>
        .
      </p>
    </div>
  );
}
