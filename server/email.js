/**
 * server/email.js — Resend email module
 * ======================================
 * Sends transactional emails via Resend (https://resend.com).
 * Zero external CSS — all styles are inline for maximum email client compat.
 *
 * ── Manual setup required (one-time) ─────────────────────────────────────────
 *
 *  1. Sign up at https://resend.com  (free tier: 3,000 emails/month)
 *  2. Go to API Keys → Create API Key → copy the re_… value
 *  3. Paste it into server/.env as:  RESEND_API_KEY=re_YOUR_KEY_HERE
 *
 *  For PRODUCTION (custom sender domain):
 *  4. Go to Domains → Add Domain → follow the DNS verification steps
 *  5. Replace FROM_ADDRESS below with e.g. "orders@yourstore.com"
 *
 * ── Test/sandbox sending ──────────────────────────────────────────────────────
 *  While RESEND_API_KEY is not set, sendOrderConfirmation() logs a warning and
 *  returns safely — the webhook keeps working without crashing.
 *
 *  Resend's sandbox sender "onboarding@resend.dev" can only deliver to the
 *  email address that owns the Resend account. For real end-user delivery you
 *  must verify a custom domain and update FROM_ADDRESS.
 */

'use strict';

const { Resend } = require('resend');

// ─── Sender configuration ─────────────────────────────────────────────────────
// PRODUCTION: replace with your verified domain address, e.g. "orders@yourstore.com"
// TEST:       "onboarding@resend.dev" works immediately but only delivers to your
//             own Resend account's email — useful for smoke-testing the integration.
const FROM_ADDRESS = process.env.EMAIL_FROM || 'Air Jordan Store <hello@amoridev.com>';

// ─── HTML email template ──────────────────────────────────────────────────────
// • All styles are inline — email clients ignore <style> tags and external CSS
// • Light background (#ffffff / #f9f9f9) for compatibility: dark backgrounds
//   are overridden or partially inverted by Gmail, Outlook, Apple Mail dark mode
// • Brand accent = #d7ff3e (volt green) used sparingly on key elements
// • Monospace font for order IDs / amounts matches the site's aesthetic

/**
 * @param {object} opts
 * @param {string}  opts.customerName   — display name or null
 * @param {string}  opts.customerEmail  — recipient address
 * @param {string}  opts.sessionId      — Stripe session ID for reference
 * @param {number}  opts.amountTotal    — in cents
 * @param {string}  opts.currency       — e.g. 'usd'
 * @param {Array}   opts.items          — [{ description, quantity, amount, currency }]
 * @param {boolean} opts.isTest         — true when using test Stripe keys
 */
function buildOrderEmailHtml(opts) {
  const {
    customerName,
    sessionId,
    amountTotal,
    currency,
    items,
    isTest,
  } = opts;

  const greeting     = customerName ? `Hey ${customerName.split(' ')[0]},` : 'Hey there,';
  const totalDisplay = `$${(amountTotal / 100).toFixed(2)} ${currency.toUpperCase()}`;
  const shortId      = sessionId.slice(-12).toUpperCase();

  const itemRows = items.length
    ? items.map(item => `
        <tr>
          <td style="padding: 12px 0; border-bottom: 1px solid #eeeeee; font-size: 14px; color: #333333;">
            ${item.description ?? 'Item'}
          </td>
          <td style="padding: 12px 0; border-bottom: 1px solid #eeeeee; font-size: 14px; color: #555555; text-align: center;">
            × ${item.quantity}
          </td>
          <td style="padding: 12px 0; border-bottom: 1px solid #eeeeee; font-size: 14px; color: #333333; text-align: right; font-family: 'Courier New', monospace;">
            $${(item.amount / 100).toFixed(2)}
          </td>
        </tr>`).join('')
    : `<tr><td colspan="3" style="padding: 12px 0; font-size: 14px; color: #888888; text-align: center;">
         (Item details not available)
       </td></tr>`;

  const testBanner = isTest ? `
    <div style="background-color: #fffbe6; border: 1px solid #ffe58f; border-radius: 6px;
                padding: 10px 16px; margin-bottom: 24px; font-size: 12px; color: #7d6608;
                font-family: 'Courier New', monospace; text-align: center; text-transform: uppercase;
                letter-spacing: 0.08em;">
      🧪 Test mode — no real charge was made
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Order Confirmed — Air Jordan Store</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">

  <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
         style="background-color: #f4f4f5; padding: 40px 16px;">
    <tr>
      <td align="center">

        <!-- Card -->
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
               style="max-width: 560px; background-color: #ffffff; border-radius: 12px;
                      overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header strip with volt-green accent -->
          <tr>
            <td style="background-color: #111111; padding: 32px 40px; text-align: center;">
              <p style="margin: 0; font-size: 26px; font-weight: 800; color: #ffffff;
                        letter-spacing: -0.02em; text-transform: uppercase;">
                NIKE<span style="color: #d7ff3e;">.</span>
              </p>
              <p style="margin: 8px 0 0; font-size: 11px; font-weight: 600; color: #aaaaaa;
                        letter-spacing: 0.14em; text-transform: uppercase;">
                Air Jordan Store
              </p>
            </td>
          </tr>

          <!-- Checkmark + title -->
          <tr>
            <td style="padding: 40px 40px 0; text-align: center;">
              <!-- Checkmark circle -->
              <div style="display: inline-block; width: 64px; height: 64px;
                          border-radius: 50%; background-color: #f0ffd0;
                          border: 2px solid #d7ff3e; line-height: 64px;
                          font-size: 28px; text-align: center; margin-bottom: 20px;">
                ✓
              </div>
              <h1 style="margin: 0; font-size: 26px; font-weight: 800; color: #111111;
                         letter-spacing: -0.02em; text-transform: uppercase;">
                Order Confirmed
              </h1>
              <p style="margin: 8px 0 0; font-size: 13px; color: #888888;
                        text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600;">
                Thanks for your purchase
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px 40px;">

              ${testBanner}

              <p style="margin: 0 0 24px; font-size: 16px; color: #333333; line-height: 1.6;">
                ${greeting}
              </p>
              <p style="margin: 0 0 28px; font-size: 15px; color: #555555; line-height: 1.7;">
                Your order has been confirmed and your payment was processed successfully.
                Your kicks are on their way. 🔥
              </p>

              <!-- Order reference pill -->
              <div style="background-color: #f9f9f9; border: 1px solid #eeeeee;
                          border-radius: 8px; padding: 14px 20px; margin-bottom: 28px;
                          text-align: center;">
                <p style="margin: 0; font-size: 11px; color: #999999; text-transform: uppercase;
                           letter-spacing: 0.1em; font-weight: 600;">Order Reference</p>
                <p style="margin: 6px 0 0; font-family: 'Courier New', monospace;
                           font-size: 15px; color: #111111; font-weight: 700;
                           letter-spacing: 0.05em;">
                  #${shortId}
                </p>
              </div>

              <!-- Items table -->
              <p style="margin: 0 0 10px; font-size: 11px; font-weight: 700; color: #999999;
                        text-transform: uppercase; letter-spacing: 0.1em;">
                Your Items
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <thead>
                  <tr>
                    <th style="font-size: 11px; color: #bbbbbb; font-weight: 600; text-align: left;
                               text-transform: uppercase; letter-spacing: 0.08em;
                               padding-bottom: 8px; border-bottom: 2px solid #eeeeee;">Item</th>
                    <th style="font-size: 11px; color: #bbbbbb; font-weight: 600; text-align: center;
                               text-transform: uppercase; letter-spacing: 0.08em;
                               padding-bottom: 8px; border-bottom: 2px solid #eeeeee;">Qty</th>
                    <th style="font-size: 11px; color: #bbbbbb; font-weight: 600; text-align: right;
                               text-transform: uppercase; letter-spacing: 0.08em;
                               padding-bottom: 8px; border-bottom: 2px solid #eeeeee;">Price</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemRows}
                </tbody>
              </table>

              <!-- Total -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
                     style="margin-top: 16px;">
                <tr>
                  <td style="font-size: 15px; font-weight: 700; color: #111111;
                             text-transform: uppercase; letter-spacing: 0.04em;">
                    Total
                  </td>
                  <td style="font-size: 18px; font-weight: 800; color: #111111;
                             text-align: right; font-family: 'Courier New', monospace;">
                    ${totalDisplay}
                  </td>
                </tr>
              </table>

              <!-- Closing note -->
              <p style="margin: 32px 0 0; font-size: 14px; color: #777777; line-height: 1.7;
                        padding-top: 24px; border-top: 1px solid #eeeeee;">
                If you have any questions about your order, reply to this email and we'll
                sort it out. Keep an eye on your inbox — shipping updates are on their way.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #111111; padding: 24px 40px; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #666666;
                        letter-spacing: 0.08em; text-transform: uppercase;">
                Air Jordan Store · Your kicks, delivered.
              </p>
              <p style="margin: 8px 0 0; font-size: 10px; color: #444444;
                        font-family: 'Courier New', monospace;">
                Session ID: ${sessionId}
              </p>
            </td>
          </tr>

        </table>
        <!-- End card -->

      </td>
    </tr>
  </table>

</body>
</html>`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Send an order confirmation email.
 *
 * Fire-and-forget design: this function is intentionally NOT awaited in the
 * webhook handler (see the tradeoff comment in index.js). If Resend's API is
 * slow or fails, Stripe does NOT retry the webhook because we've already
 * responded 200. The order is safe in the DB; the email failure is logged.
 *
 * @param {object} opts  — same shape as buildOrderEmailHtml
 * @returns {Promise<void>}
 */
async function sendOrderConfirmation(opts) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn('    ⚠️  RESEND_API_KEY not set — skipping confirmation email.');
    console.warn('       Sign up at https://resend.com, get an API key,');
    console.warn('       and add it to server/.env as RESEND_API_KEY=re_…');
    return;
  }

  if (!opts.customerEmail) {
    console.warn('    ⚠️  No customer email on session — skipping confirmation email.');
    return;
  }

  const resend = new Resend(apiKey);
  const isTest = process.env.STRIPE_SECRET_KEY?.includes('_test_') ?? true;
  const html   = buildOrderEmailHtml({ ...opts, isTest });

  const subject = isTest
    ? '[TEST] Your Air Jordan Store order is confirmed 🎉'
    : 'Your Air Jordan Store order is confirmed 🎉';

  const { data, error } = await resend.emails.send({
    from:    FROM_ADDRESS,
    to:      opts.customerEmail,
    subject,
    html,
  });

  if (error) {
    console.error('\n    =========================================');
    console.error('    ❌ RESEND API ERROR DETECTED');
    console.error('    =========================================');
    console.error('    ' + JSON.stringify(error, null, 2).replace(/\n/g, '\n    '));
    console.error('    =========================================\n');
    // Log the error but DO NOT throw — the caller handles this in a try/catch
    throw new Error(`Resend API error: ${error.message || JSON.stringify(error)}`);
  }

  console.log(`    📧  Confirmation email sent → ${opts.customerEmail} (id: ${data?.id})`);
}

module.exports = { sendOrderConfirmation };
