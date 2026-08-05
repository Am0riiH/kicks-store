import LegalPage from '../components/LegalPage.jsx';

/* PLACEHOLDER COPY — demo content for a portfolio build.
   This is NOT legal advice and has not been reviewed by a lawyer. Replace with
   terms drafted for the actual business, jurisdiction, and payment flow before
   taking real orders. */

const SECTIONS = [
  {
    heading: 'Acceptance of terms',
    body: 'By browsing this site or placing an order you agree to these terms. If you do not agree with them, please do not use the store. We may update these terms from time to time; the version published here at the moment you order is the one that applies.',
  },
  {
    heading: 'Orders and pricing',
    body: 'All prices are shown in US dollars and exclude any import duties that may apply in your country. Placing an order is an offer to buy; the contract forms when we confirm dispatch. We reserve the right to cancel an order and refund it in full if an item is mispriced, out of stock, or if we cannot verify the payment.',
  },
  {
    heading: 'Authenticity',
    body: 'Every pair sold is inspected before listing. If a pair you receive is found not to be authentic, we will refund it in full including return shipping. This is in addition to, and does not limit, your statutory rights.',
  },
  {
    heading: 'Shipping',
    body: 'Delivery estimates are estimates, not guarantees. Risk passes to you on delivery. If a parcel is lost in transit we will work with the carrier to trace it and will replace or refund the order where the carrier confirms the loss.',
  },
  {
    heading: 'Returns and refunds',
    body: 'Unworn pairs may be returned within 30 days of delivery in their original packaging. Refunds are issued to the original payment method after inspection. Items returned worn, damaged, or incomplete may be refused or refunded in part.',
  },
  {
    heading: 'Acceptable use',
    body: 'Do not use this site to break the law, to scrape or resell our content, to interfere with its operation, or to attempt unauthorised access to any part of it. We may suspend access where we reasonably believe any of that is happening.',
  },
  {
    heading: 'Limitation of liability',
    body: 'To the fullest extent permitted by law, our liability arising out of any order is limited to the amount you paid for that order. Nothing in these terms excludes liability that cannot lawfully be excluded.',
  },
];

export default function TermsOfService() {
  return (
    <LegalPage
      title="Terms of Service | Drop Site"
      eyebrow="Legal"
      heading={['Terms of', 'Service']}
      intro="The rules that apply when you browse this store and when you buy from it."
      updated="August 2026"
      sections={SECTIONS}
    />
  );
}
