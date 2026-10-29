import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { accountsApi } from '../services/rest';
import { cleanPhone, phoneToEmail, toE164 } from '../lib/phone';
import { session } from '../lib/storage';
import { codeError, isBadCredentials, isUnconfirmed, loginError, signupError } from '../lib/authErrors';
import { phoneCodesEnabled } from '../services/phoneCodes';

const AuthContext = createContext(null);

const TOKEN_KEY = 'sf_token'; // same key the original Babor-Api app used
const REFRESH_KEY = 'sf_refresh';

// An account made with a verified phone number has no email. Payments still need one, so give it the same stand-in
// address that older phone accounts sign in with.
const emailOf = (authUser) => authUser.email || (authUser.phone ? phoneToEmail(cleanPhone(authUser.phone)) : '');

const toUser = (authUser, profile, token) => ({
  id: authUser.id,
  email: emailOf(authUser),
  first_name: profile?.first_name || '',
  last_name: profile?.last_name || '',
  phone: profile?.phone || '',
  wallet_balance: Number(profile?.wallet_balance || 0),
  token,
});

/** A readable error that keeps the server's status and code for callers that need them. */
const friendly = (message, cause) => Object.assign(new Error(message), { status: cause?.status, code: cause?.code });

/** The profile row, `null` when the account has none yet, `undefined` when we could not ask. */
async function fetchProfile(authUser, token) {
  try {
    const rows = await accountsApi.select('users', `?id=eq.${authUser.id}&select=*&limit=1`, token);
    return rows?.[0] || null;
  } catch {
    return undefined;
  }
}

/**
 * Create the profile row for a new account. Databases differ in what they accept for a missing phone
 * (NULL, empty text, a unique rule), so try the sensible shapes in turn. Never throws: the account itself
 * already exists, and a missing profile is repaired the next time the person logs in.
 */
async function createProfile(id, { first_name, last_name, phone }, token) {
  const base = { id, first_name, last_name };
  const attempts = phone ? [{ ...base, phone }, base] : [base, { ...base, phone: '' }];
  for (const row of attempts) {
    try {
      await accountsApi.insert('users', row, token);
      return true;
    } catch {
      /* try the next shape */
    }
  }
  return false;
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
        let profile = await fetchProfile(authUser, token);
        if (profile === null && authUser.user_metadata?.first_name) {
          // Someone who has just opened the confirmation email's link has a session but no profile row yet:
          // the sign-up could not save one before the email was confirmed. Build it from the sign-up details.
          const m = authUser.user_metadata;
          const fresh = { first_name: m.first_name, last_name: m.last_name || '', phone: m.phone || '' };
          if (await createProfile(authUser.id, fresh, token)) profile = fresh;
        }
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
      // A phone number has no "@" and is made of digits (also "+233 54 123 4567"); anything else is an email.
      const isPhone = !trimmed.includes('@') && /^\+?[\d\s().-]{9,}$/.test(trimmed);
      const legacyEmail = isPhone ? phoneToEmail(cleanPhone(trimmed)) : trimmed;
      const byPhone = () => accountsApi.auth.signInPhone(toE164(trimmed), password);
      const byEmail = () => accountsApi.auth.signIn(legacyEmail, password);
      // A phone number can belong to either kind of account: a verified phone account, or an older one that signs
      // in through a stand-in email. Try the likelier kind first and the other only when the details did not match.
      const attempts = !isPhone ? [byEmail] : (await phoneCodesEnabled()) ? [byPhone, byEmail] : [byEmail, byPhone];
      let d;
      let failure;
      for (const attempt of attempts) {
        try {
          d = await attempt();
          break;
        } catch (err) {
          failure = err;
          if (!isBadCredentials(err)) break;
        }
      }
      if (!d) {
        throw Object.assign(friendly(loginError(failure, isPhone ? 'phone' : 'email', legacyEmail), failure), {
          unconfirmed: isUnconfirmed(failure),
          email: legacyEmail,
        });
      }
      storeSession(d.access_token, d.refresh_token);
      let profile = await fetchProfile(d.user, d.access_token);
      if (profile === null) {
        // The account exists but its profile row was never saved (an interrupted sign-up): rebuild it
        // from the details given at sign-up, when we have them.
        const meta = d.user?.user_metadata || {};
        if (meta.first_name) {
          const fresh = { first_name: meta.first_name, last_name: meta.last_name || '', phone: meta.phone || '' };
          if (await createProfile(d.user.id, fresh, d.access_token)) profile = fresh;
        }
      }
      const next = toUser(d.user, profile, d.access_token);
      setUser(next);
      return next;
    },
    [storeSession],
  );

  const signUp = useCallback(
    async ({ firstName, lastName, phone, email, password, method }) => {
      // When the project texts a code to confirm phone numbers, a phone account is created on the real number and is
      // activated by the code. Otherwise the older way is used: a stand-in email, no code.
      const withCode = method === 'phone' && (await phoneCodesEnabled());
      const loginEmail = method === 'phone' ? phoneToEmail(phone) : email.trim();
      const details = { first_name: firstName, last_name: lastName, phone: phone || '' };
      let d;
      try {
        d = withCode
          ? await accountsApi.auth.signUpPhone(toE164(phone), password, details)
          : await accountsApi.auth.signUp(loginEmail, password, details);
      } catch (err) {
        throw friendly(signupError(err, method), err);
      }
      if (!d.access_token) {
        // With confirmation on, Supabase answers with the bare user object (no session). A number or address that is
        // already registered comes back looking like a new user, but with no identities.
        const created = d.user || d;
        if (Array.isArray(created.identities) && created.identities.length === 0) {
          throw friendly(signupError({ code: 'user_already_exists' }, method));
        }
        // The code has been texted; the person types it on the next screen.
        if (withCode) return { needsCode: true, phone };
        // The project requires email confirmation before a session exists.
        return { needsConfirmation: true, email: loginEmail, method };
      }
      storeSession(d.access_token, d.refresh_token);
      const uid = d.user?.id;
      if (uid) await createProfile(uid, { first_name: firstName, last_name: lastName, phone: phone || '' }, d.access_token);
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

  /** Check the code texted to a new phone account. On success the person is signed in. */
  const verifyPhone = useCallback(
    async ({ phone, code }) => {
      let d;
      try {
        d = await accountsApi.auth.verifyPhone(toE164(phone), String(code).trim());
      } catch (err) {
        throw friendly(codeError(err), err);
      }
      storeSession(d.access_token, d.refresh_token);
      // The names were saved with the sign-up, so a page reload between the two steps loses nothing.
      const meta = d.user?.user_metadata || {};
      const details = { first_name: meta.first_name || '', last_name: meta.last_name || '', phone: meta.phone || cleanPhone(phone) };
      if (d.user?.id) await createProfile(d.user.id, details, d.access_token);
      const next = {
        id: d.user?.id,
        email: emailOf(d.user || { phone }),
        ...details,
        wallet_balance: 0,
        token: d.access_token,
      };
      setUser(next);
      return next;
    },
    [storeSession],
  );

  /** Text the sign-up code again. */
  const resendCode = useCallback(async (phone) => {
    try {
      await accountsApi.auth.resendSms(toE164(phone));
    } catch (err) {
      throw friendly(codeError(err), err);
    }
  }, []);

  const resendConfirmation = useCallback(async (email) => {
    try {
      await accountsApi.auth.resend(email);
    } catch (err) {
      throw friendly(signupError(err, 'email'), err);
    }
  }, []);

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
    () => ({ user, ready, signIn, signUp, verifyPhone, resendCode, resendConfirmation, signOut: clearSession, authed, reloadProfile, updateProfile }),
    [user, ready, signIn, signUp, verifyPhone, resendCode, resendConfirmation, clearSession, authed, reloadProfile, updateProfile],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
