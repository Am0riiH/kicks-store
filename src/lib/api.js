/**
 * Where the backend lives.
 *
 * This was previously declared identically in ten modules, which meant the
 * localhost fallback had to be kept in sync by hand and there was no single
 * place to look when pointing the frontend at a different environment.
 *
 * VITE_API_URL is read at build time by Vite, so the value is baked into the
 * bundle — the fallback is what runs during local development, where no root
 * .env exists.
 */
export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Joins a path onto the API base without doubling or dropping the slash.
 *
 * @param {string} path e.g. '/api/products' or 'api/products'
 * @returns {string} absolute URL
 */
export function apiUrl(path = '') {
  if (!path) return API_BASE;
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

/**
 * Turns an API error body into something a human can act on.
 *
 * The server answers a failed validation with
 * `{ error: 'Validation Error', details: [{ path, message }] }`, so naming the
 * offending field beats showing a bare "Validation Error". Anything else falls
 * back to the server's own message, then to the status code.
 *
 * This existed twice — in Footer and AdminProducts — differing only in whether
 * the summary line was prefixed to the field list. That difference is real and
 * asserted by tests, so it is a parameter rather than something to unify away:
 * the newsletter form has no room for "Validation Error — ", the admin form
 * wants it.
 *
 * @param {object|null} body       parsed JSON body, or null if unparseable
 * @param {number} status          HTTP status, used for the last-resort message
 * @param {{ withSummary?: boolean }} [options]
 * @returns {string}
 */
export function describeApiError(body, status, { withSummary = false } = {}) {
  const fallback = `Request failed (HTTP ${status}).`;
  if (!body) return fallback;

  const issues = body.details;
  if (Array.isArray(issues) && issues.length) {
    const detail = issues
      .map((issue) => {
        const field = Array.isArray(issue.path) ? issue.path.join('.') : issue.path;
        return field ? `${field}: ${issue.message}` : issue.message;
      })
      .join('; ');

    return withSummary ? `${body.error || 'Validation error'} — ${detail}` : detail;
  }

  return body.error || fallback;
}
