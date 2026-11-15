import { useCallback, useEffect, useState } from 'react';
import { API_BASE } from '../lib/api.js';

const ADMIN_AUTH_KEY = 'adminAuth';

export function readAdminResponse(res) {
  if (res.status === 401) throw new Error('401');
  if (!res.ok) throw new Error('Server error');
  return res.json();
}

export const isUnauthorized = (err) => err.message === '401';

export function useNoIndex() {
  useEffect(() => {
    let meta = document.querySelector('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'robots';
      document.head.appendChild(meta);
    }
    meta.content = 'noindex, nofollow';
    return () => {
      meta.content = 'index, follow';
    };
  }, []);
}

export function useAdminAuth(probePath) {
  const [authHeader, setAuthHeader] = useState(() =>
    sessionStorage.getItem(ADMIN_AUTH_KEY)
  );
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const logout = useCallback(() => {
    sessionStorage.removeItem(ADMIN_AUTH_KEY);
    setAuthHeader(null);
  }, []);

  const login = useCallback(
    (event) => {
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
          setLoginError(
            isUnauthorized(err) ? 'Invalid credentials' : `Server error: ${err.message}`
          );
          setLoggingIn(false);
          return null;
        });
    },
    [username, password, probePath]
  );

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
