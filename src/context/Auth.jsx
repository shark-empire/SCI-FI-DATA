import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { accountsApi } from '../services/rest';
import { phoneToEmail } from '../lib/phone';
import { session } from '../lib/storage';

const AuthContext = createContext(null);

const TOKEN_KEY = 'sf_token'; // same key the original Babor-Api app used
const REFRESH_KEY = 'sf_refresh';

const toUser = (authUser, profile, token) => ({
  id: authUser.id,
  email: authUser.email,
  first_name: profile?.first_name || '',
  last_name: profile?.last_name || '',
  phone: profile?.phone || '',
  wallet_balance: Number(profile?.wallet_balance || 0),
  token,
});

async function fetchProfile(authUser, token) {
  const rows = await accountsApi
    .select('users', `?id=eq.${authUser.id}&select=*&limit=1`, token)
    .catch(() => []);
  return rows?.[0] || null;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const tokenRef = useRef(null);

  const storeSession = useCallback((token, refreshToken) => {
    tokenRef.current = token;
    session.set(TOKEN_KEY, token);
    if (refreshToken) session.set(REFRESH_KEY, refreshToken);
  }, []);

  const clearSession = useCallback(() => {
    tokenRef.current = null;
    session.remove(TOKEN_KEY);
    session.remove(REFRESH_KEY);
    setUser(null);
  }, []);

  const refreshSession = useCallback(async () => {
    const refresh = session.get(REFRESH_KEY);
    if (!refresh) return null;
    try {
      const d = await accountsApi.auth.refresh(refresh);
      storeSession(d.access_token, d.refresh_token);
      return d.access_token;
    } catch {
      return null;
    }
  }, [storeSession]);

  // Restore a session when the tab reloads.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let token = session.get(TOKEN_KEY);
      if (!token) return;
      try {
        let authUser;
        try {
          authUser = await accountsApi.auth.user(token);
        } catch (err) {
          if (err.status !== 401 && err.status !== 403) throw err;
          token = await refreshSession();
          if (!token) throw err;
          authUser = await accountsApi.auth.user(token);
        }
        const profile = await fetchProfile(authUser, token);
        if (!cancelled) {
          tokenRef.current = token;
          setUser(toUser(authUser, profile, token));
        }
      } catch {
        if (!cancelled) clearSession();
      }
    })().finally(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshSession, clearSession]);

  const signIn = useCallback(
    async (identifier, password) => {
      const trimmed = identifier.trim();
      const isPhone = /^\d/.test(trimmed.replace(/\s/g, ''));
      const email = isPhone ? phoneToEmail(trimmed) : trimmed;
      const d = await accountsApi.auth.signIn(email, password).catch(() => {
        throw new Error('Wrong email, phone number or password.');
      });
      storeSession(d.access_token, d.refresh_token);
      const profile = await fetchProfile(d.user, d.access_token);
      const next = toUser(d.user, profile, d.access_token);
      setUser(next);
      return next;
    },
    [storeSession],
  );

  const signUp = useCallback(
    async ({ firstName, lastName, phone, email, password, method }) => {
      const loginEmail = method === 'phone' ? phoneToEmail(phone) : email.trim();
      const d = await accountsApi.auth.signUp(loginEmail, password);
      if (!d.access_token) {
        // The project requires email confirmation before a session exists.
        return { needsConfirmation: true };
      }
      storeSession(d.access_token, d.refresh_token);
      const uid = d.user?.id;
      if (uid) {
        await accountsApi.insert(
          'users',
          { id: uid, first_name: firstName, last_name: lastName, phone: phone || '' },
          d.access_token,
        );
      }
      const next = {
        id: uid,
        email: loginEmail,
        first_name: firstName,
        last_name: lastName,
        phone: phone || '',
        wallet_balance: 0,
        token: d.access_token,
      };
      setUser(next);
      return { user: next };
    },
    [storeSession],
  );

  /** Run an authenticated call; on an expired token refresh once, then sign out. */
  const authed = useCallback(
    async (fn) => {
      try {
        return await fn(tokenRef.current);
      } catch (err) {
        if (err.status === 401) {
          const fresh = await refreshSession();
          if (fresh) return fn(fresh);
          clearSession();
        }
        throw err;
      }
    },
    [refreshSession, clearSession],
  );

  const reloadProfile = useCallback(async () => {
    if (!user) return null;
    const profile = await authed((t) =>
      accountsApi.select('users', `?id=eq.${user.id}&select=*&limit=1`, t).then((r) => r?.[0]),
    );
    if (profile) setUser((u) => (u ? { ...u, ...toUser({ id: u.id, email: u.email }, profile, u.token) } : u));
    return profile;
  }, [user, authed]);

  const updateProfile = useCallback(
    async ({ first_name, last_name, phone }) => {
      await authed((t) =>
        accountsApi.update('users', `?id=eq.${user.id}`, { first_name, last_name, phone }, t),
      );
      setUser((u) => ({ ...u, first_name, last_name, phone }));
    },
    [user, authed],
  );

  const value = useMemo(
    () => ({ user, ready, signIn, signUp, signOut: clearSession, authed, reloadProfile, updateProfile }),
    [user, ready, signIn, signUp, clearSession, authed, reloadProfile, updateProfile],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
