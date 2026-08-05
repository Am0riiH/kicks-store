import LegalPage from '../components/LegalPage.jsx';

/* PLACEHOLDER COPY — demo content for a portfolio build.
   This is NOT legal advice and has not been reviewed by a lawyer. Replace the
   whole document with a policy that reflects what the business actually does
   with personal data before launch, and check it against the regimes that
   apply to you (GDPR, CCPA, and so on). */

const SECTIONS = [
  {
    heading: 'Information we collect',
    body: 'We collect the details you give us at checkout — name, email address, shipping address, and phone number — along with the contents of your order. Payment card details are entered directly with our payment processor and never reach our servers. We also collect basic technical data such as your browser type, device, and pages visited.',
  },
  {
    heading: 'How we use it',
    body: 'Your information is used to process orders, arrange delivery, handle returns, send order confirmations and shipping updates, and answer support requests. If you opt in to the newsletter, we use your email address to send drop announcements and restock alerts until you unsubscribe.',
  },
  {
    heading: 'Cookies and analytics',
    body: 'We use a small number of cookies to keep your cart contents between visits and to understand which pages are used. You can clear or block cookies in your browser settings; the cart and some preferences will stop persisting if you do.',
  },
  {
    heading: 'Third-party services',
    body: 'We share the minimum necessary data with the providers that run the store on our behalf: a payment processor for charges, an email provider for transactional and marketing email, an image host for product photography, and a carrier for delivery. We do not sell your personal information.',
  },
  {
    heading: 'Data retention',
    body: 'Order records are kept for as long as we are required to for tax and accounting purposes. Newsletter subscriptions are kept until you unsubscribe. Support correspondence is kept while it is useful for resolving your case.',
  },
  {
    heading: 'Your rights',
    body: 'You can ask for a copy of the personal data we hold about you, ask us to correct it, or ask us to delete it. You can unsubscribe from marketing email at any time using the link in any newsletter, without affecting order-related email. Contact us to make any of these requests.',
  },
];

export default function PrivacyPolicy() {
  return (
    <LegalPage
      title="Privacy Policy | Drop Site"
      eyebrow="Legal"
      heading={['Privacy', 'Policy']}
      intro="How we collect, use, and protect your personal information when you shop with us."
      updated="August 2026"
      sections={SECTIONS}
    />
  );
}
