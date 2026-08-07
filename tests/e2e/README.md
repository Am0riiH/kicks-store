# End-to-end tests

Two runnable scripts. Both exit non-zero on failure, so they can gate a deploy.

| Script | Command | Browser? | Real payment? |
|---|---|---|---|
| `webhook-flow.mjs` | `npm run test:e2e:webhook` | no | no |
| `purchase-flow.mjs` | `npm run test:e2e` | yes | yes (Stripe test mode) |

Start with `test:e2e:webhook` — it is fast and deterministic, and it covers the
order lifecycle end to end without touching a third-party UI. Use `test:e2e`
when you need the real thing: the browser journey and an actual Stripe payment.

---

## Setup

You need **three terminals**. There is no single command that starts everything.

### Terminal 1 — frontend (port 5173)

```bash
npm run dev
```

> Not needed for `test:e2e:webhook`.

### Terminal 2 — API (port 3001)

```bash
cd server
npm start
```

### Terminal 3 — Stripe webhook forwarder

```bash
stripe listen --forward-to localhost:3001/api/webhook
```

The CLI prints a signing secret at startup:

```
> Your webhook signing secret is whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

Copy it into `server/.env` as `STRIPE_WEBHOOK_SECRET=whsec_…` and **restart the
API**. The secret rotates every time you restart `stripe listen`.

> **This step is not optional.** With no secret the webhook route returns 200
> and does nothing — orders are silently never stored, and the success page sits
> on "Payment Received / Confirming your order…" forever. Both scripts check
> `/health` for `webhookSecretSet` up front and refuse to run without it.

Install the Stripe CLI if you do not have it:

```powershell
scoop bucket add stripe https://github.com/stripe/scoop-stripe-cli.git
scoop install stripe
stripe login
```

### Environment variables

```powershell
# Required by both scripts — must match server/.env
$env:E2E_ADMIN_USER     = "your_admin_username"
$env:E2E_ADMIN_PASSWORD = "your_admin_password"

# Required by test:e2e:webhook — the same whsec_ the server is using
$env:E2E_WEBHOOK_SECRET = "whsec_…"
```

Optional overrides:

| Variable | Default |
|---|---|
| `E2E_FRONTEND_URL` | `http://localhost:5173` |
| `E2E_API_URL` | `http://localhost:3001` |
| `E2E_BROWSER_PATH` | Edge, then Chrome, at the usual Windows paths |

`puppeteer-core` ships **no** bundled browser, so a Chromium-based executable
must be findable. Set `E2E_BROWSER_PATH` if the probe fails.

---

## Running

```bash
npm run test:e2e:webhook       # no browser, no payment
npm run test:e2e               # headless browser + real test payment
npm run test:e2e -- --headed   # same, but watch it
```

Test card on the Stripe page: **4242 4242 4242 4242**, any future expiry
(`12/34`), any CVC.

---

## What each script asserts

### `webhook-flow.mjs`

- A correctly signed `checkout.session.completed` is accepted (200)
- A delivery with **no** signature is rejected (400)
- A **tampered** payload with a valid signature is rejected (400)
- The order is persisted and readable
- `/api/order-status` returns **exactly** its 7 whitelisted fields, and leaks no
  postcode, phone or street address (this endpoint needs no auth, so its shape
  is a security boundary)
- The admin API *does* return the full record, including shipping
- Fulfilment status transitions work, and an unknown status is rejected (400)
- A **replayed** event does not duplicate the order or reset its status
- Unauthenticated admin requests are rejected (401)

### `purchase-flow.mjs`

- `/store` loads products
- Buy Now adds to the cart, and the drawer opens by itself
- `#checkout-btn` redirects to `checkout.stripe.com`
- The test card completes a real test-mode payment
- The return lands on `/checkout/success` with a `session_id`
- The page reaches **Order Confirmed** (not the "Payment Received" fallback)
- The cart is cleared
- The order appears in `/api/admin/orders` with line items and a shipping address
- **Stock is decremented** by exactly the quantity purchased

---

## Gotchas

**Rate limits.** Repeat runs hit real ceilings:

| Limiter | Budget |
|---|---|
| Checkout sessions | 10 per 15 min per IP |
| Failed admin logins | 5 per 15 min per IP (only 401s count) |
| General `/api/*` | 100 per 15 min per IP |

Admin verification goes through the API with a correct header rather than
driving the login form, so a passing run never spends the login budget. A wrong
`E2E_ADMIN_PASSWORD` does — preflight catches that before the browser starts.

**Never load `/`.** The home page mounts a Three.js scene needing WebGL that
headless Chrome does not provide. `purchase-flow.mjs` goes straight to `/store`.

**Stripe's page can change.** `payOnStripe()` types into `#cardNumber`,
`#cardExpiry`, `#cardCvc` and the `#billing*` fields on `checkout.stripe.com`.
That DOM is Stripe's, not ours. If *only* the card-entry step fails, check those
selectors first — run with `--headed` to see where it stops.

**The scripts write real data.** Every `test:e2e` run creates a real Stripe
test-mode payment and a real order row, and decrements real stock in
`server/data.db`. That is deliberate — it is what makes the test meaningful —
but it is not idempotent. Reseed by deleting `server/data.db` and restarting the
API.

**Port 4173 will not work.** The CORS allow-list covers `localhost:5173` and
`127.0.0.1:5173` only, so `npm run preview` fails every API call.

---

## Relationship to the other suites

```
npm run test:server   212 tests   Express + sql.js, in-process, no network
npm run test:client   169 tests   React components and hooks under jsdom
npm run test:e2e      the real browser, the real Stripe, the real database
```

The unit suites are hermetic: `nock` blocks all outbound connections and the
server tests run against a throwaway `DB_PATH` under the OS temp directory, so
`server/data.db` is never touched. These E2E scripts are the opposite by
design — they exist to catch what mocks cannot.
