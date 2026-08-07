import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Footer from './Footer.jsx';
import { renderWithProviders, mockFetch, jsonResponse, API } from '../test/utils.jsx';

const SUBSCRIBE = 'POST /api/newsletter/subscribe';

const renderFooter = () => renderWithProviders(<Footer />, { cart: false });

const emailInput = () => screen.getByLabelText('Email address');
const joinButton = () => screen.getByRole('button', { name: /join/i });

describe('static content', () => {
  it('renders the shop, company and legal link columns', () => {
    renderFooter();

    expect(screen.getByRole('link', { name: 'All sneakers' })).toHaveAttribute('href', '/store');
    expect(screen.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', '/contact');
    expect(screen.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('link', { name: 'Terms of service' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Shipping and returns' })).toBeInTheDocument();
  });

  it('shows the current year in the copyright', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2031-03-04T00:00:00Z'));

    try {
      renderFooter();
      expect(screen.getByText(/2031/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('hides decorative payment marks from assistive tech', () => {
    const { container } = renderFooter();

    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });
});

describe('newsletter form — idle', () => {
  it('starts empty with an enabled Join button and no message', () => {
    renderFooter();

    expect(emailInput()).toHaveValue('');
    expect(joinButton()).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('marks the email field as required', () => {
    renderFooter();

    expect(emailInput()).toBeRequired();
    expect(emailInput()).toHaveAttribute('type', 'email');
  });
});

describe('newsletter form — submitting', () => {
  it('disables both controls and relabels the button while in flight', async () => {
    const user = userEvent.setup();
    let release;
    mockFetch({
      [SUBSCRIBE]: () => new Promise((resolve) => { release = () => resolve(jsonResponse({ ok: true })); }),
    });

    renderFooter();
    await user.type(emailInput(), 'a@b.com');
    await user.click(joinButton());

    expect(screen.getByRole('button', { name: 'Joining…' })).toBeDisabled();
    expect(emailInput()).toBeDisabled();

    release();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Join' })).toBeEnabled());
  });

  it('posts the typed address to the subscribe endpoint', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch({ [SUBSCRIBE]: jsonResponse({ ok: true }) });

    renderFooter();
    await user.type(emailInput(), 'reader@example.com');
    await user.click(joinButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API}/api/newsletter/subscribe`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ email: 'reader@example.com' });
  });
});

describe('newsletter form — success', () => {
  it('confirms a new signup and clears the field', async () => {
    const user = userEvent.setup();
    mockFetch({ [SUBSCRIBE]: jsonResponse({ ok: true, alreadySubscribed: false }) });

    renderFooter();
    await user.type(emailInput(), 'new@example.com');
    await user.click(joinButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("You're in. Watch your inbox for the next drop.");
    expect(alert.className).toContain('text-volt');
    expect(emailInput()).toHaveValue('');
  });

  it('gives a distinct message for an address already on the list', async () => {
    const user = userEvent.setup();
    mockFetch({ [SUBSCRIBE]: jsonResponse({ ok: true, alreadySubscribed: true }) });

    renderFooter();
    await user.type(emailInput(), 'again@example.com');
    await user.click(joinButton());

    expect(await screen.findByRole('alert'))
      .toHaveTextContent("You're already on the list — nothing to do.");
  });
});

describe('newsletter form — errors', () => {
  it('names the offending field from a Zod validation response', async () => {
    const user = userEvent.setup();
    mockFetch({
      [SUBSCRIBE]: jsonResponse(
        {
          error: 'Validation Error',
          details: [{ path: ['email'], message: 'Invalid email address' }],
        },
        { status: 400 }
      ),
    });

    renderFooter();
    await user.type(emailInput(), 'bad@example.com');
    await user.click(joinButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('email: Invalid email address');
    expect(alert.className).toContain('text-red-400');
  });

  it('joins multiple validation issues', async () => {
    const user = userEvent.setup();
    mockFetch({
      [SUBSCRIBE]: jsonResponse(
        {
          error: 'Validation Error',
          details: [
            { path: ['email'], message: 'Required' },
            { path: ['email'], message: 'Too short' },
          ],
        },
        { status: 400 }
      ),
    });

    renderFooter();
    await user.type(emailInput(), 'x@y.com');
    await user.click(joinButton());

    expect(await screen.findByRole('alert'))
      .toHaveTextContent('email: Required; email: Too short');
  });

  it('falls back to the plain error message when there are no details', async () => {
    const user = userEvent.setup();
    mockFetch({
      [SUBSCRIBE]: jsonResponse({ error: 'Too many signup attempts, please try again later.' }, { status: 429 }),
    });

    renderFooter();
    await user.type(emailInput(), 'x@y.com');
    await user.click(joinButton());

    expect(await screen.findByRole('alert'))
      .toHaveTextContent('Too many signup attempts, please try again later.');
  });

  it('falls back to the HTTP status when the body is unreadable', async () => {
    const user = userEvent.setup();
    mockFetch({
      [SUBSCRIBE]: {
        ok: false,
        status: 502,
        json: async () => { throw new Error('not json'); },
      },
    });

    renderFooter();
    await user.type(emailInput(), 'x@y.com');
    await user.click(joinButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Request failed (HTTP 502).');
  });

  it('reports a connection failure without crashing', async () => {
    const user = userEvent.setup();
    mockFetch({ [SUBSCRIBE]: () => Promise.reject(new Error('network down')) });

    renderFooter();
    await user.type(emailInput(), 'x@y.com');
    await user.click(joinButton());

    expect(await screen.findByRole('alert'))
      .toHaveTextContent('Could not reach the server. Check your connection and try again.');
  });

  it('keeps the typed value so the user can retry', async () => {
    const user = userEvent.setup();
    mockFetch({ [SUBSCRIBE]: jsonResponse({ error: 'nope' }, { status: 500 }) });

    renderFooter();
    await user.type(emailInput(), 'keepme@example.com');
    await user.click(joinButton());

    await screen.findByRole('alert');
    expect(emailInput()).toHaveValue('keepme@example.com');
  });

  it('re-enables the form after a failure', async () => {
    const user = userEvent.setup();
    mockFetch({ [SUBSCRIBE]: jsonResponse({ error: 'nope' }, { status: 500 }) });

    renderFooter();
    await user.type(emailInput(), 'x@y.com');
    await user.click(joinButton());

    await screen.findByRole('alert');
    expect(joinButton()).toBeEnabled();
    expect(emailInput()).toBeEnabled();
  });

  it('clears the previous message when resubmitting', async () => {
    const user = userEvent.setup();
    let resolveSecond;
    let call = 0;
    mockFetch({
      [SUBSCRIBE]: () => {
        call += 1;
        if (call === 1) return Promise.resolve(jsonResponse({ error: 'first failure' }, { status: 500 }));
        return new Promise((resolve) => { resolveSecond = () => resolve(jsonResponse({ ok: true })); });
      },
    });

    renderFooter();
    await user.type(emailInput(), 'x@y.com');
    await user.click(joinButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('first failure');

    await user.click(joinButton());
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());

    resolveSecond();
    await screen.findByRole('alert');
  });
});
