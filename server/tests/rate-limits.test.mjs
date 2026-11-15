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
    for (let i = 0; i < 8; i += 1) {
      const res = await request(app)
        .post('/api/admin/products')
        .set('Authorization', adminHeader())
        .send({ id: '', name: '' });

      expect(res.status).toBe(400);
    }

    const ok = await request(app)
      .get('/api/admin/orders')
      .set('Authorization', adminHeader());
    expect(ok.status).toBe(200);

    const bad = await request(app)
      .get('/api/admin/orders')
      .set('Authorization', adminHeader(TEST_ADMIN_USER, 'wrong'));
    expect(bad.status).toBe(401);
  });

  it('does not count successful admin requests', async () => {
    for (let i = 0; i < 10; i += 1) {
      const res = await request(app)
        .get('/api/admin/orders')
        .set('Authorization', adminHeader());
      expect(res.status).toBe(200);
    }
  });
});

describe('admin login limiter', () => {
  it('locks out after 5 failed authentications', async () => {
    const { limitedAt, body } = await untilLimited(
      () =>
        request(app)
          .get('/api/admin/orders')
          .set('Authorization', adminHeader(TEST_ADMIN_USER, 'still-wrong')),
      10
    );

    expect(limitedAt).not.toBeNull();
    expect(limitedAt).toBeLessThanOrEqual(5);
    expect(body).toEqual({
      error: 'Too many failed login attempts, please try again later.',
    });
  });

  it('locks out correct credentials too, once tripped', async () => {
    const res = await request(app)
      .get('/api/admin/orders')
      .set('Authorization', adminHeader());

    expect(res.status).toBe(429);
  });
});

describe('newsletter limiter', () => {
  it('429s after 5 signups from one address', async () => {
    const { limitedAt, body } = await untilLimited(
      (i) =>
        request(app)
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
    const { limitedAt, body } = await untilLimited(
      () =>
        request(app)
          .post('/api/create-checkout-session')
          .send({ items: [{ name: 'Ghost', quantity: 1, variant_id: 99999999 }] }),
      14
    );

    expect(limitedAt).toBe(11);
    expect(body).toEqual({
      error: 'Too many checkout attempts, please try again later.',
    });
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
    for (let i = 0; i < 20; i += 1) {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
    }
  });
});
