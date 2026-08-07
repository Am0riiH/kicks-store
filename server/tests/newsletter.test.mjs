import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { loadApp } from './helpers.mjs';

let app;
let db;

beforeAll(async () => {
  ({ app, db } = await loadApp());
  // addNewsletterContact warns on every call while RESEND_API_KEY is unset.
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

const uniqueEmail = () => `sub-${Math.random().toString(36).slice(2, 10)}@example.com`;

const subscribe = (email) =>
  request(app).post('/api/newsletter/subscribe').send({ email });

describe('POST /api/newsletter/subscribe', () => {
  it('records a new subscriber', async () => {
    const email = uniqueEmail();

    const res = await subscribe(email);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.alreadySubscribed).toBe(false);
    expect(db.getSubscribers().some((s) => s.email === email)).toBe(true);
  });

  it('reports a repeat signup as alreadySubscribed rather than an error', async () => {
    const email = uniqueEmail();
    await subscribe(email);

    const res = await subscribe(email);

    expect(res.status).toBe(200);
    expect(res.body.alreadySubscribed).toBe(true);
  });

  it('treats a different-case address as the same subscriber', async () => {
    const email = uniqueEmail();
    await subscribe(email.toLowerCase());

    const res = await subscribe(email.toUpperCase());

    expect(res.status).toBe(200);
    expect(res.body.alreadySubscribed).toBe(true);
  });

  it('trims surrounding whitespace before storing', async () => {
    const email = uniqueEmail();

    const res = await subscribe(`   ${email}   `);

    expect(res.status).toBe(200);
    expect(db.getSubscribers().some((s) => s.email === email)).toBe(true);
  });

  it.each([
    ['a missing email', undefined],
    ['an empty string', ''],
    ['whitespace only', '   '],
    ['no @ sign', 'not-an-email'],
    ['no domain', 'user@'],
    ['no local part', '@example.com'],
    ['a number', 12345],
  ])('400s on %s', async (_label, email) => {
    const res = await request(app).post('/api/newsletter/subscribe').send({ email });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it('still succeeds, reporting synced:false, when Resend is not configured', async () => {
    const res = await subscribe(uniqueEmail());

    // RESEND_API_KEY is unset in tests, so the contact is stored locally only.
    // The request must still succeed — a mailing-list sync failure must never
    // lose a signup that is already safely in the database.
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, alreadySubscribed: false, synced: false });
  });

  it('reports synced:false for a duplicate without attempting a sync', async () => {
    const email = uniqueEmail();
    await subscribe(email);

    const res = await subscribe(email);

    expect(res.body).toEqual({ ok: true, alreadySubscribed: true, synced: false });
  });

  it('still returns 200 when the Resend sync throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const emailModule = (await import('../email.js')).default ?? (await import('../email.js'));
    vi.spyOn(emailModule, 'addNewsletterContact').mockRejectedValue(new Error('resend down'));

    const address = uniqueEmail();
    const res = await subscribe(address);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // The subscriber is persisted regardless.
    expect(db.getSubscribers().some((s) => s.email === address)).toBe(true);
  });

  it('500s with JSON if the database write fails', async () => {
    vi.spyOn(db, 'addSubscriber').mockImplementation(() => {
      throw new Error('disk on fire');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await subscribe(uniqueEmail());

    expect(res.status).toBe(500);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.error).toMatch(/^Could not save subscription:/);
  });
});
