/**
 * The global error handler (index.js:743) and the 404 fallback.
 *
 * These paths exist because the admin UI parses every response as JSON. Before
 * the handler was added, a body-parser failure escaped to Express's default
 * handler and returned an HTML error page, which the frontend could not read —
 * the bug surfaced as an opaque "Failed to save product" alert.
 */
import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import request from 'supertest';
import { loadApp, adminHeader } from './helpers.mjs';

let app;

beforeAll(async () => {
  ({ app } = await loadApp());
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('malformed JSON', () => {
  it('400s with a JSON body, not an HTML error page', async () => {
    const res = await request(app)
      .post('/api/newsletter/subscribe')
      .set('Content-Type', 'application/json')
      .send('{"email": "broken", }');

    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ error: 'Malformed JSON in request body.' });
  });

  it('400s on truncated JSON', async () => {
    const res = await request(app)
      .post('/api/create-checkout-session')
      .set('Content-Type', 'application/json')
      .send('{"items": [{"name"');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Malformed JSON in request body.' });
  });

  it('400s on a completely non-JSON body sent as JSON', async () => {
    const res = await request(app)
      .post('/api/newsletter/subscribe')
      .set('Content-Type', 'application/json')
      .send('<html>nope</html>');

    expect(res.status).toBe(400);
  });
});

describe('oversized payloads', () => {
  it('413s when the body exceeds the 100kb limit', async () => {
    // express.json() defaults to a 100kb cap.
    const huge = 'x'.repeat(200 * 1024);

    const res = await request(app)
      .post('/api/admin/products')
      .set('Authorization', adminHeader())
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ id: 'big', name: huge }));

    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: 'Request body is too large.' });
  });

  it('accepts a body comfortably under the limit', async () => {
    const res = await request(app)
      .post('/api/newsletter/subscribe')
      .send({ email: `ok-${Date.now()}@example.com`, padding: 'y'.repeat(1024) });

    expect(res.status).toBe(200);
  });
});

describe('CORS', () => {
  it('allows the local dev origin', async () => {
    const res = await request(app)
      .get('/api/products')
      .set('Origin', 'http://localhost:5173');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('allows the 127.0.0.1 dev origin', async () => {
    const res = await request(app)
      .get('/api/products')
      .set('Origin', 'http://127.0.0.1:5173');

    expect(res.status).toBe(200);
  });

  it('allows any Vercel preview deployment', async () => {
    const res = await request(app)
      .get('/api/products')
      .set('Origin', 'https://kicks-store-git-feature-branch.vercel.app');

    expect(res.status).toBe(200);
  });

  it('403s a disallowed origin with JSON, not an HTML 500', async () => {
    const res = await request(app)
      .get('/api/products')
      .set('Origin', 'https://evil.example.com');

    expect(res.status).toBe(403);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ error: 'Origin not allowed.' });
  });

  it('403s a lookalike domain that merely ends with the allowed host', async () => {
    const res = await request(app)
      .get('/api/products')
      .set('Origin', 'https://vercel.app.evil.com');

    expect(res.status).toBe(403);
  });

  it('403s http (not https) Vercel origins', async () => {
    const res = await request(app)
      .get('/api/products')
      .set('Origin', 'http://preview.vercel.app');

    expect(res.status).toBe(403);
  });

  it('allows requests with no Origin header — curl, Postman, the Stripe CLI', async () => {
    const res = await request(app).get('/api/products');

    expect(res.status).toBe(200);
  });
});

describe('404 fallback', () => {
  it.each([
    '/api/does-not-exist',
    '/not-an-api-path',
    '/api/admin/no-such-route',
  ])('404s with JSON for %s', async (path) => {
    const res = await request(app).get(path).set('Authorization', adminHeader());

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  it('checks auth before routing, so unknown admin paths 401 rather than 404', async () => {
    // app.use('/api/admin/', …) also matches the bare '/api/admin'. Answering
    // 401 instead of 404 is the right call: it keeps an unauthenticated caller
    // from mapping which admin routes exist.
    for (const path of ['/api/admin', '/api/admin/no-such-route']) {
      const res = await request(app).get(path);
      expect(res.status).toBe(401);
    }
  });

  it('404s an unmatched method on a real path', async () => {
    const res = await request(app).delete('/api/products');

    expect(res.status).toBe(404);
  });
});

describe('error responses never leak internals', () => {
  it('returns a generic message with no stack trace on an unexpected failure', async () => {
    // PUT /api/admin/variants/:id has no try/catch, so a driver error reaches
    // the global handler — the cleanest way to exercise the 500 branch.
    const res = await request(app)
      .put('/api/admin/variants/1')
      .set('Authorization', adminHeader())
      .send({ quantity: 1 });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error.' });
    expect(res.text).not.toMatch(/at \w+.*\(/);
    expect(res.text).not.toContain('db.js');
    expect(res.text).not.toContain(process.cwd());
  });

  it('never exposes the admin password hash or Stripe key in any error', async () => {
    const res = await request(app)
      .post('/api/admin/products')
      .set('Authorization', adminHeader())
      .set('Content-Type', 'application/json')
      .send('{ bad json');

    expect(res.text).not.toContain(process.env.ADMIN_PASSWORD_HASH);
    expect(res.text).not.toContain(process.env.STRIPE_SECRET_KEY);
    expect(res.text).not.toContain(process.env.STRIPE_WEBHOOK_SECRET);
  });
});

describe('security headers', () => {
  it('applies helmet defaults', async () => {
    const res = await request(app).get('/api/products');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-dns-prefetch-control']).toBe('off');
    // Explicitly relaxed so the frontend on another origin can read responses.
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  it('does not advertise Express', async () => {
    const res = await request(app).get('/api/products');

    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
