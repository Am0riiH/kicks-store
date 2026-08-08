import { useCallback, useEffect, useState } from 'react';
import { API_BASE } from '../lib/api.js';

/**
 * HTTP Basic auth for the admin pages.
 *
 * There is no login endpoint and no token: the header is built in the browser
 * and validated by *probing* a protected endpoint. A 200 means the credentials
 * are good, so they are kept in sessionStorage for the rest of the tab session.
 *
 * AdminOrders and AdminProducts each carried their own copy of this — the same
 * state, the same probe, the same silent-logout-on-401 — differing only in
 * which endpoint they probed and which key they read off the response.
 */
const ADMIN_AUTH_KEY = 'adminAuth';

/**
 * Normalises an admin API response into "parsed body" or a throw.
 *
 * The literal '401' message is what distinguishes an expired session (log the
 * user out silently) from a server fault (show the error). Callers switch on it.
 *
 * @param {Response} res
 * @returns {Promise<object>}
 */
export function readAdminResponse(res) {
  if (res.status === 401) throw new Error('401');
  if (!res.ok) throw new Error('Server error');
  return res.json();
}

/** True when an error from readAdminResponse means "session no longer valid". */
export const isUnauthorized = (err) => err.message === '401';

/**
 * Keeps admin pages out of search results for as long as they are mounted.
 *
 * Restores 'index, follow' on unmount so navigating back to the storefront
 * does not leave the whole SPA marked noindex.
 */
export function useNoIndex() {
  useEffect(() => {
    let meta = document.querySelector('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'robots';
      document.head.appendChild(meta);
    }
    meta.content = 'noindex, nofollow';
    return () => { meta.content = 'index, follow'; };
  }, []);
}

/**
 * @param {string} probePath endpoint used to validate credentials,
 *   e.g. '/api/admin/orders'. Its parsed body is handed back from login() so
 *   the caller can seed its list without a second round trip.
 */
export function useAdminAuth(probePath) {
  const [authHeader, setAuthHeader] = useState(() => sessionStorage.getItem(ADMIN_AUTH_KEY));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const logout = useCallback(() => {
    sessionStorage.removeItem(ADMIN_AUTH_KEY);
    setAuthHeader(null);
  }, []);

  /**
   * @returns {Promise<object|null>} the probe response body on success, null on
   *   failure — so callers can do `const data = await login(e); if (data) …`
   *   without needing to know how the failure was reported.
   */
  const login = useCallback((event) => {
    event?.preventDefault();
    setLoginError(null);
    setLoggingIn(true);

    const header = `Basic ${btoa(`${username}:${password}`)}`;

    return fetch(`${API_BASE}${probePath}`, { headers: { Authorization: header } })
      .then(readAdminResponse)
      .then((data) => {
        sessionStorage.setItem(ADMIN_AUTH_KEY, header);
        setAuthHeader(header);
        setUsername('');
        setPassword('');
        setLoggingIn(false);
        return data;
      })
      .catch((err) => {
        setLoginError(isUnauthorized(err) ? 'Invalid credentials' : `Server error: ${err.message}`);
        setLoggingIn(false);
        return null;
      });
  }, [username, password, probePath]);

  return {
    authHeader,
    username,
    setUsername,
    password,
    setPassword,
    loginError,
    loggingIn,
    login,
    logout,
  };
}
