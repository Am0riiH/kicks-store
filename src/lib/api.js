export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function apiUrl(path = '') {
  if (!path) return API_BASE;
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

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
