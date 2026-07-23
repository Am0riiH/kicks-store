# Air Jordan Drop Site

---

## 💳 Stripe Checkout — Setup & Running Locally

This app uses **Stripe Checkout** for real payments. Because the Stripe secret key must
never be exposed in frontend code, a small Express server (`/server`) handles session
creation and the React frontend calls it.

### Step 1 — Get your Stripe test keys

1. Go to **[dashboard.stripe.com](https://dashboard.stripe.com)** and sign in (or create a free account).
2. In the top-left, make sure the **Test Mode** toggle is **ON** — you'll see "Test mode" in the header.
3. Navigate to **Developers → API Keys**.
4. You'll see two keys:
   - **Publishable key** — starts with `pk_test_…` (safe for the frontend, used for display only)
   - **Secret key** — starts with `sk_test_…` (server-only, **never** put this in frontend code)

> ⚠️ **LIVE keys** (starting with `sk_live_…`) make real charges. Switching from test to live
> is a deliberate, separate step before launch — do **not** do it accidentally.

### Step 2 — Configure the server environment

```bash
# From the project root:
cd server
copy .env.example .env      # Windows
# cp .env.example .env      # macOS/Linux
```

Open `server/.env` and paste your keys:

```env
STRIPE_SECRET_KEY=sk_test_YOUR_SECRET_KEY_HERE
STRIPE_WEBHOOK_SECRET=whsec_YOUR_CLI_SECRET_HERE   # added after Step 4b below
PORT=3001
```

The `.env` file is already in `.gitignore` — it will never be committed.

### Step 3 — Install server dependencies

```bash
cd server
npm install
```

### Step 4 — Run both servers (two terminals)

**Terminal 1 — Express backend (port 3001):**
```bash
cd server
npm start
```

You should see:
```
🚀  Air Jordan Store — checkout server running on port 3001
    Stripe key    : sk_test_51… (✅ TEST mode)
    Webhook secret: ⚠️  not set — run: stripe listen --forward-to localhost:3001/api/webhook
    Health        : http://localhost:3001/health
```

> The webhook secret warning is expected at this point — you'll fix it in Step 4b.

**Terminal 2 — Vite frontend (port 5173):**
```bash
# From project root
npm run dev
```

Open **http://localhost:5173**.

### Step 5 — Test a checkout end-to-end

1. Add any product to the cart.
2. Open the cart drawer → click **Checkout**.
3. You'll be redirected to Stripe's hosted payment page.
4. Use Stripe's test card:

   | Field | Value |
   |---|---|
   | Card number | `4242 4242 4242 4242` |
   | Expiry | Any future date (e.g. `12/34`) |
   | CVC | Any 3 digits (e.g. `123`) |
   | Name / ZIP | Anything |

5. Click **Pay** — Stripe will redirect you to `/checkout/success`. ✅
6. To test cancellation, click **← Back** on the Stripe page — you'll land on `/checkout/cancel` with your cart intact.

### Step 4b — Set up Stripe CLI for local webhook testing

Stripe webhooks need a publicly reachable URL. Locally, the **Stripe CLI** acts as a
secure tunnel that forwards Stripe's webhook POSTs to your local server.

#### Install the Stripe CLI (Windows)

**Option A — Scoop (recommended):**
```powershell
scoop bucket add stripe https://github.com/stripe/scoop-stripe-cli.git
scoop install stripe
```

**Option B — Direct download:**
1. Go to https://github.com/stripe/stripe-cli/releases/latest
2. Download `stripe_X.X.X_windows_x86_64.zip`
3. Extract `stripe.exe` and add the folder to your PATH

**Option C — winget:**
```powershell
winget install Stripe.StripeCLI
```

Verify:
```bash
stripe --version
```

#### Log in to your Stripe account via CLI
```bash
stripe login
```
This opens a browser tab — click **Allow access**. You only need to do this once.

#### Terminal 3 — Start the webhook forwarder
```bash
stripe listen --forward-to localhost:3001/api/webhook
```

At startup the CLI prints:
```
> Ready! You are using Stripe API Version [2024-xx-xx].
> Your webhook signing secret is whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  (^^ copy this — it changes every time you restart `stripe listen`)
```

**Copy the `whsec_…` value** and paste it into `server/.env`:
```env
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Then restart the Express server. The startup log should now show:
```
    Webhook secret: ✅ set
```

#### Trigger a test event (no browser needed)

In a **fourth terminal** (or any terminal while the CLI is listening):
```bash
stripe trigger checkout.session.completed
```

Your Express server console should print:
```
✅  checkout.session.completed received
    ─────────────────────────────────────
    Session ID   : cs_test_...
    Payment status: paid
    Amount total : $0.00 USD
    Customer email: (guest)
    Customer name : (guest)
    [v3 hook point] → persist order, send email, decrement stock
```

If you see that output, signature verification passed and the webhook is wired up correctly.

> **Note:** `stripe trigger` sends a synthetic event with zeroed-out amounts. For a real
> test with actual line items and a customer email, complete a checkout flow using the
> test card `4242 4242 4242 4242` — the webhook fires automatically after payment.

### Step 5 — Test a full checkout end-to-end

1. Add any product to the cart.
2. Open the cart drawer → click **Checkout**.
3. You'll be redirected to Stripe's hosted payment page.
4. Use Stripe's test card:

   | Field | Value |
   |---|---|
   | Card number | `4242 4242 4242 4242` |
   | Expiry | Any future date (e.g. `12/34`) |
   | CVC | Any 3 digits (e.g. `123`) |
   | Name / ZIP | Anything |

5. Click **Pay** — Stripe will redirect you to `/checkout/success`. ✅
6. Simultaneously, the `checkout.session.completed` webhook fires to your Express server
   with the real session data (customer email, line items, amount).
7. To test cancellation, click **← Back** on the Stripe page → you'll land on
   `/checkout/cancel` with your cart intact.

### Checkout flow (with webhooks)

```
User clicks Checkout
       ↓
POST /api/create-checkout-session  (Express :3001)
       ↓ (Stripe API call — secret key stays here)
Returns { url: "https://checkout.stripe.com/…" }
       ↓
window.location.href = url  (redirect to Stripe-hosted page)
       ↓
User enters card details on Stripe's servers
       ↓
       ├─── Success redirect → /checkout/success → cart cleared (client UX)
       │
       └─── ALSO: Stripe POSTs to /api/webhook (server-to-server, signed)
                  ↓
                  checkout.session.completed event
                  ↓ (signature verified with STRIPE_WEBHOOK_SECRET)
                  Console log: session ID, amount, customer email
                  [v3] → persist order to DB, send email, decrement inventory

Cancel  → redirect to /checkout/cancel → cart intact, no webhook fired
```

### Understanding what's reliable now vs. what needs a database (v3)

| Concern | v2 (now) | v3 (needs DB) |
|---|---|---|
| Payment confirmed? | ✅ Webhook `checkout.session.completed` is server-authoritative | — |
| Cart clears? | ✅ Client-side on success page redirect (UX nicety) | ✅ Could also gate on order status |
| Order persisted? | ❌ Only console log | ✅ Write to DB in webhook handler |
| Confirmation email? | ❌ Nothing sent | ✅ Trigger via email service in webhook |
| Inventory decremented? | ❌ Nothing decremented | ✅ Call inventory API in webhook |
| User closes tab before redirect? | ⚠️ Cart won't clear (webhook still fired) | ✅ Check order status before showing "confirmed" |
| Duplicate webhook delivery? | ⚠️ `stripe trigger` hits handler twice if sent twice | ✅ Idempotency check on `session.id` in DB |

**The client-side `clearCart()` on the success page is kept intentionally** — it's
immediate, gives instant visual feedback, and works fine for v2. The webhook is now the
*authoritative* source of truth. In v3 you'd store confirmed order IDs server-side and
have the success page query `/api/order-status?session_id=…` before showing "confirmed",
so users who close the tab before the redirect still get a correct order state.

### Production checklist (before going live)

- [ ] Replace `sk_test_…` with `sk_live_…` in production server env (**deliberate step!**)
- [ ] In Stripe Dashboard → Developers → Webhooks → Add endpoint, set your production URL
- [ ] Copy the Dashboard's permanent signing secret into your production env as `STRIPE_WEBHOOK_SECRET`
- [ ] Update `success_url` / `cancel_url` in `server/index.js` to your real domain
- [ ] Update the `ALLOWED_ORIGINS` array in `server/index.js` to your real domain
- [ ] Remove the "🧪 Test mode" notice from `src/pages/CheckoutSuccess.jsx`
- [ ] Add DB persistence + email in the `checkout.session.completed` handler (v3)
- [ ] Add idempotency check (skip if `session.id` already processed) to handle Stripe retries

---


## Setup

```bash
npm install
npm run dev
```

## 3D Model

Drop your `.glb` file at:

```
public/models/air-jordan.glb
```

`ShoeModel.jsx` loads it via `useGLTF('/models/air-jordan.glb')`. If you don't have a shoe
model yet, swap the `<primitive object={scene} />` in `ShoeModel.jsx` for a placeholder
mesh (e.g. `<mesh><boxGeometry /><meshStandardMaterial color="#D7FF3E" /></mesh>`) so the
GSAP choreography is still visible while you source the real asset.

## How the persistent 3D layer works

- `SceneCanvas.jsx` is mounted once in `App.jsx`, **outside** `<Routes>`, fixed to the
  viewport, `pointer-events: none`, `z-index: 0`.
- `SceneContext.jsx` exposes a `shoeGroupRef` so any page (currently just `Home.jsx`) can
  reach into the live Three.js scene and drive it with GSAP — no re-mounting the Canvas
  per route.
- Leaving `Home` docks the shoe into a small idle corner state so it still "exists" while
  browsing `/store`, `/categories`, `/about`.

## Replaying the intro

Clicking the "NIKE." logo dispatches a `replay-intro` window event that `Home.jsx` listens
for and uses to re-run the Phase 0 timeline (giant wordmark → watermark + shoe drop/spin/land).

## Notes

- Product images are Unsplash placeholders — swap `src/data/products.js` with your real
  catalog + CDN URLs.
- Payment marks in the cart drawer are neutral geometric placeholders, not the actual
  Visa/Mastercard/Apple Pay/Google Pay trademarks — swap in official SVG assets before
  shipping to production.
