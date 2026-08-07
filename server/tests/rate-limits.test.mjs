/**
 * Rate limiting.
 *
 * This is the ONE server test file that leaves the limiters switched on: it
 * deletes the DISABLE_RATE_LIMIT opt-in that setup.mjs sets, so the `skip`
 * hook in index.js returns false and every limiter behaves as it does in
 * production. Vitest isolates modules per file, so this file has its own fresh
 * counters and cannot affect the others.
 *
 * Test order matters here — the limiters are shared, in-memory and keyed by IP,
 * and every request in this file comes from the same address. The H2 regression
 * runs first, while the admin login budget is still untouched.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { loadApp, adminHeader, TEST_ADMIN_USER } from './helpers.mjs';

let app;

beforeAll(async () => {
  delete process.env.DISABLE_RATE_LIMIT;
  ({ app } = await loadApp());
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

/** Sends requests until one is rate limited, up to `cap`. */
async function untilLimited(send, cap = 150) {
  const statuses = [];
  for (let i = 0; i < cap; i += 1) {
    const res = await send(i);
    statuses.push(res.status);
    if (res.status === 429) return { statuses, limitedAt: i + 1, body: res.body };
  }
  return { statuses, limitedAt: null, body: null };
}

describe('the skip hook is off in this file', () => {
  it('has DISABLE_RATE_LIMIT unset so limiters are live', () => {
    expect(process.env.DISABLE_RATE_LIMIT).toBeUndefined();
    expect(process.env.NODE_ENV).toBe('test');
  });
});

describe('H2 regression — validation errors do not cause an admin lockout', () => {
  it('keeps the login budget intact across repeated 400s', async () => {
    // Before H2, skipSuccessfulRequests alone counted every >=400 response as a
    // failed login, so five typos in the product form locked the admin out for
    // 15 minutes. requestWasSuccessful narrows "failure" to exactly the 401
    // that adminAuth emits.
    for (let i = 0; i < 8; i += 1) {
      const res = await request(app)
        .post('/api/admin/products')
        .set('Authorization', adminHeader())
        .send({ id: '', name: '' });          // fails productSchema

      expect(res.status).toBe(400);
    }

    // Well past the 5-strike budget: a correct request must still work.
    const ok = await request(app).get('/api/admin/orders').set('Authorization', adminHeader());
    expect(ok.status).toBe(200);

    // And a genuine bad password must still get 401, not a 429 lockout.
    const bad = await request(app)
      .get('/api/admin/orders')
      .set('Authorization', adminHeader(TEST_ADMIN_USER, 'wrong'));
    expect(bad.status).toBe(401);
  });

  it('does not count successful admin requests', async () => {
    for (let i = 0; i < 10; i += 1) {
      const res = await request(app).get('/api/admin/orders').set('Authorization', adminHeader());
      expect(res.status).toBe(200);
    }
  });
});

describe('admin login limiter', () => {
  it('locks out after 5 failed authentications', async () => {
    // One 401 was already spent by the H2 test above, so the budget is at 4.
    const { limitedAt, body } = await untilLimited(
      () => request(app)
        .get('/api/admin/orders')
        .set('Authorization', adminHeader(TEST_ADMIN_USER, 'still-wrong')),
      10
    );

    expect(limitedAt).not.toBeNull();
    expect(limitedAt).toBeLessThanOrEqual(5);
    expect(body).toEqual({ error: 'Too many failed login attempts, please try again later.' });
  });

  it('locks out correct credentials too, once tripped', async () => {
    // The limiter is keyed by IP, not by account, so a locked-out address stays
    // locked even with the right password.
    const res = await request(app).get('/api/admin/orders').set('Authorization', adminHeader());

    expect(res.status).toBe(429);
  });
});

describe('newsletter limiter', () => {
  it('429s after 5 signups from one address', async () => {
    const { limitedAt, body } = await untilLimited(
      (i) => request(app)
        .post('/api/newsletter/subscribe')
        .send({ email: `rl-${Date.now()}-${i}@example.com` }),
      12
    );

    expect(limitedAt).toBe(6);
    expect(body).toEqual({ error: 'Too many signup attempts, please try again later.' });
  });
});

describe('checkout limiter', () => {
  it('429s after 10 attempts, counting failed ones', async () => {
    // checkoutLimiter runs BEFORE validate(), so rejected attempts consume the
    // budget as well — a scraper cannot probe for free.
    const { limitedAt, body } = await untilLimited(
      () => request(app)
        .post('/api/create-checkout-session')
        .send({ items: [{ name: 'Ghost', quantity: 1, variant_id: 99999999 }] }),
      14
    );

    expect(limitedAt).toBe(11);
    expect(body).toEqual({ error: 'Too many checkout attempts, please try again later.' });
  });
});

describe('general API limiter', () => {
  it('exposes standard rate-limit headers', async () => {
    const res = await request(app).get('/api/products');

    expect(res.headers['x-ratelimit-limit']).toBe('100');
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
  });

  it('429s once 100 requests in the window are used up', async () => {
    const { limitedAt, body } = await untilLimited(
      () => request(app).get('/api/products'),
      130
    );

    expect(limitedAt).not.toBeNull();
    expect(body).toEqual({ error: 'Too many requests, please try again later.' });
  });
});

describe('routes outside the limiters', () => {
  it('/health is never rate limited', async () => {
    // Mounted outside /api/, so uptime probes cannot exhaust the budget — and
    // still responds after the general limiter above has tripped.
    for (let i = 0; i < 20; i += 1) {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
    }
  });
});
