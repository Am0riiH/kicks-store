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
