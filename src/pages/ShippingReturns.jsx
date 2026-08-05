import LegalPage from '../components/LegalPage.jsx';

/* PLACEHOLDER COPY — demo content for a portfolio build.
   Every timeframe, price, and threshold below is illustrative. Replace with
   the real carrier rates, cut-off times, and return window before launch. */

const SECTIONS = [
  {
    heading: 'Dispatch times',
    body: 'Orders placed before 14:00 CET on a business day are dispatched the same day. Anything later goes out the next business day. During a limited release, dispatch can take up to two business days while each pair is inspected.',
  },
  {
    heading: 'Delivery and cost',
    body: 'Domestic delivery takes 2–4 business days and is free on orders over $150, otherwise a flat $9. International delivery takes 5–10 business days and is calculated at checkout. Import duties and taxes, where they apply, are the responsibility of the recipient.',
  },
  {
    heading: 'Tracking',
    body: 'A tracking link is emailed as soon as the carrier scans your parcel. If tracking has not updated for two business days, contact support with your order reference and we will open a trace with the carrier.',
  },
  {
    heading: 'Return window',
    body: 'You have 30 days from delivery to start a return. Pairs must be unworn and returned in the original box with all inserts, tags, and any authentication paperwork included. Try them on indoors, on a clean surface — outsole wear is the most common reason a return is refused.',
  },
  {
    heading: 'How to start a return',
    body: 'Email support with your order reference and the reason for the return. We reply with a return label and instructions. Pack the shoe box inside an outer shipping box: a shipping label applied directly to the shoe box makes the pair unsellable and the return may be refused.',
  },
  {
    heading: 'Refunds and exchanges',
    body: 'Refunds are issued to the original payment method within five business days of the return passing inspection. Card refunds can take a further few days to appear depending on your bank. For a different size, place a new order and return the original — it is faster than an exchange and secures the size before it sells out.',
  },
  {
    heading: 'Faulty or incorrect items',
    body: 'If a pair arrives damaged, faulty, or is not what you ordered, contact us within 14 days of delivery with photographs. We cover return shipping in these cases and will replace or refund in full.',
  },
];

export default function ShippingReturns() {
  return (
    <LegalPage
      title="Shipping and Returns | Drop Site"
      eyebrow="Support"
      heading={['Shipping', 'and Returns']}
      intro="How long delivery takes, what it costs, and how to send something back."
      updated="August 2026"
      sections={SECTIONS}
    />
  );
}
