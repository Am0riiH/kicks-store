#!/usr/bin/env node
/**
 * E2E: the full purchase journey in a real browser, through a real Stripe
 * test-mode payment.
 *
 *   npm run test:e2e            # headless
 *   npm run test:e2e -- --headed  # watch it happen
 *
 * browse /store → add to cart → checkout → pay on checkout.stripe.com →
 * land on /checkout/success → webhook fires → order verified in the admin API,
 * with the inventory decrement checked against the variant that was bought.
 *
 * Requires all three terminals from tests/e2e/README.md, including
 * `stripe listen` — without the forwarder the success page never leaves its
 * "Payment Received / Confirming your order…" state and this script fails on
 * the order lookup.
 *
 * NOTE: the checkout.stripe.com step drives a third-party page. Stripe can
 * change that DOM at any time; if only the card-entry step fails, check the
 * selectors in payOnStripe() first.
 */
import puppeteer from 'puppeteer-core';
import {
  FRONTEND_URL, API_URL, HEADED, adminHeader, findBrowser, assert, log, waitFor,
} from './lib/env.mjs';
import { preflight } from './lib/preflight.mjs';

const TEST_CARD = '4242424242424242';

/** Clicks the first element whose trimmed text matches exactly. */
async function clickByText(page, selector, text) {
  const handle = await page.evaluateHandle(
    (sel, wanted) => [...document.querySelectorAll(sel)]
      .find((el) => el.textContent.trim() === wanted) || null,
    selector, text
  );
  const element = handle.asElement();
  if (!element) throw new Error(`No <${selector}> with text "${text}"`);
  await element.click();
  return element;
}

async function typeIfPresent(page, selector, value) {
  const el = await page.$(selector);
  if (!el) return false;
  await el.type(value, { delay: 20 });
  return true;
}

// ─── Steps ───────────────────────────────────────────────────────────────────

async function addToCart(page) {
  // Never navigate to '/': the home page mounts a Three.js scene that needs
  // WebGL headless does not have. /store onward is plain DOM.
  log.step(`Opening ${FRONTEND_URL}/store`);
  await page.goto(`${FRONTEND_URL}/store`, { waitUntil: 'domcontentloaded' });

  await page.waitForFunction(
    () => document.querySelectorAll('.animate-pulse').length === 0
       && document.querySelectorAll('h3').length > 0,
    { timeout: 20000 }
  );
  log.ok('Store loaded with products');

  const { name, sku } = await page.evaluate(() => {
    const card = document.querySelector('h3')?.closest('.rounded-3xl');
    return {
      name: card?.querySelector('h3')?.textContent.trim(),
      sku: card?.querySelector('.font-mono')?.textContent.trim(),
    };
  });
  log.info(`First product: ${name} (${sku})`);

  // A size is auto-selected by useProductVariants, so Buy Now is enough.
  await clickByText(page, 'button', 'Buy Now');
  log.ok('Clicked Buy Now');

  // addItem() calls setCartOpen(true), so the drawer opens without another click.
  await page.waitForSelector('aside.translate-x-0', { timeout: 5000 });
  log.ok('Cart drawer opened automatically');

  const cart = await page.evaluate(() => JSON.parse(localStorage.getItem('cart') || '[]'));
  if (!cart.length) throw new Error('Cart is empty after Buy Now');
  log.info(`Cart holds variant_id=${cart[0].variant_id}, qty=${cart[0].qty}`);

  return cart[0];
}

async function startCheckout(page) {
  log.step('Starting checkout');

  await page.waitForSelector('#checkout-btn:not([disabled])', { timeout: 5000 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }),
    page.click('#checkout-btn'),
  ]);

  const url = page.url();
  if (!url.includes('checkout.stripe.com')) {
    const alert = await page.$eval('[role="alert"]', (el) => el.textContent).catch(() => null);
    throw new Error(
      `Expected a redirect to Stripe, got ${url}` + (alert ? `\n  Page said: ${alert}` : '')
    );
  }
  log.ok('Redirected to Stripe Checkout');
}

async function payOnStripe(page) {
  log.step('Paying with the Stripe test card');

  await page.waitForSelector('#cardNumber', { timeout: 45000 });

  await page.type('#cardNumber', TEST_CARD, { delay: 20 });
  await page.type('#cardExpiry', '1234', { delay: 20 });
  await page.type('#cardCvc', '123', { delay: 20 });
  await typeIfPresent(page, '#billingName', 'E2E Buyer');

  // The session enables shipping address + phone collection, so these appear.
  await typeIfPresent(page, '#billingAddressLine1', '1 Test Street');
  await typeIfPresent(page, '#billingLocality', 'San Francisco');
  await typeIfPresent(page, '#billingPostalCode', '94103');
  await typeIfPresent(page, '#billingPhoneNumber', '5550001111');

  const state = await page.$('#billingAdministrativeArea');
  if (state) await page.select('#billingAdministrativeArea', 'CA').catch(() => {});

  log.info('Card details entered');

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
    page.click('.SubmitButton, button[type="submit"]'),
  ]);

  const url = page.url();
  if (!url.includes('/checkout/success')) {
    throw new Error(`Expected /checkout/success after paying, got ${url}`);
  }

  const sessionId = new URL(url).searchParams.get('session_id');
  assert(!!sessionId, `Returned to the success page with session_id=${sessionId}`);
  return sessionId;
}

async function confirmSuccessPage(page) {
  log.step('Checking the success page');

  // CheckoutSuccess polls order-status 4 times, 1.5s apart, before settling.
  await page.waitForFunction(
    () => {
      const h1 = document.querySelector('h1')?.textContent ?? '';
      return h1.includes('Order Confirmed') || h1.includes('Payment Received');
    },
    { timeout: 30000 }
  );

  const heading = await page.$eval('h1', (el) => el.textContent.trim());

  if (heading.includes('Payment Received')) {
    throw new Error(
      'Success page is stuck on "Payment Received" — the webhook never landed.\n' +
      '  Is `stripe listen --forward-to localhost:3001/api/webhook` running, and\n' +
      '  does server/.env hold the whsec_ it printed?'
    );
  }

  assert(heading.includes('Order Confirmed'), 'Success page shows "Order Confirmed"');

  const body = await page.evaluate(() => document.body.innerText);
  assert(body.includes('Total'), 'Order total rendered');
  assert(body.includes('Order ID'), 'Order ID rendered');

  const cart = await page.evaluate(() => JSON.parse(localStorage.getItem('cart') || '[]'));
  assert(cart.length === 0, 'Cart cleared after a confirmed order');
}

async function verifyInAdmin(sessionId, cartItem, stockBefore) {
  log.step('Verifying the order in the admin API');

  // Going through the API rather than the login form on purpose: repeated form
  // logins would burn the 5-failures-per-15-minutes budget on a typo.
  const order = await waitFor(async () => {
    const res = await fetch(`${API_URL}/api/admin/orders`, {
      headers: { Authorization: adminHeader() },
    });
    if (!res.ok) return null;
    const { orders } = await res.json();
    return orders.find((o) => o.id === sessionId) || null;
  }, { label: 'the order to appear in the admin list', timeout: 30000 });

  assert(!!order, `Order ${sessionId} present in /api/admin/orders`);
  assert(order.amount_total > 0, `Amount recorded: $${(order.amount_total / 100).toFixed(2)}`);
  assert(order.fulfillment_status === 'pending', 'Fulfilment status starts as pending');
  assert(Array.isArray(order.items) && order.items.length > 0, 'Line items stored');
  assert(!!order.shipping_line1, 'Shipping address captured');

  log.step('Checking inventory');
  const variant = await (await fetch(`${API_URL}/api/products/${cartItem.id}/variants`)).json();
  const bought = variant.variants.find((v) => v.id === cartItem.variant_id);

  if (!bought) {
    log.warn(`Variant ${cartItem.variant_id} no longer present — skipping stock check`);
    return order;
  }

  assert(
    bought.quantity === stockBefore - cartItem.qty,
    `Stock decremented ${stockBefore} → ${bought.quantity} (bought ${cartItem.qty})`
  );

  return order;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  await preflight({ needsFrontend: true, needsWebhook: true });

  const executablePath = findBrowser();
  log.step(`Launching ${HEADED ? 'headed' : 'headless'} browser`);
  log.info(executablePath);

  const browser = await puppeteer.launch({
    executablePath,
    headless: !HEADED,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1440, height: 900 },
  });

  try {
    const page = await browser.newPage();
    page.on('pageerror', (err) => log.warn(`Page error: ${err.message}`));

    const cartItem = await addToCart(page);

    // Read stock AFTER adding but BEFORE paying — the webhook is what moves it.
    const before = await (await fetch(`${API_URL}/api/products/${cartItem.id}/variants`)).json();
    const stockBefore = before.variants.find((v) => v.id === cartItem.variant_id)?.quantity ?? 0;
    log.info(`Stock before payment: ${stockBefore}`);

    await startCheckout(page);
    const sessionId = await payOnStripe(page);
    await confirmSuccessPage(page);
    const order = await verifyInAdmin(sessionId, cartItem, stockBefore);

    console.log('\n✅  Purchase flow passed.');
    console.log(`    Order ${order.id} — $${(order.amount_total / 100).toFixed(2)} ${order.currency.toUpperCase()}\n`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(`\n❌  Purchase flow failed: ${err.message}\n`);
  process.exitCode = 1;
});
