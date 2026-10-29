// What happens when someone opens the confirmation link in a sign-up email.
//
// Supabase confirms the account and sends the person back to the site with their new session in the address after
// the "#", for example  https://scifidata.store/#access_token=...&refresh_token=...&type=signup . This site keeps
// its page routes after the "#" too, so without this step that visit looked like an unknown page ("We can't find that
// page") and the person was not signed in. An expired or reused link comes back as  #error=access_denied&error_code=otp_expired.
//
// Call takeAuthRedirect() once, before the app draws. It moves the session into the same storage the sign-in code
// uses, cleans the address, and points it at the page the person should see.
import { config } from '../config/env';
import { session } from './storage';

// The same keys as context/Auth.jsx (customers) and context/Seller.jsx (store owners).
const KEYS = {
  accounts: { token: 'sf_token', refresh: 'sf_refresh', home: '/account', login: '/login?notice=link' },
  stores: { token: 'sf_seller_token', refresh: 'sf_seller_refresh', home: '/seller', login: '/seller/login' },
};

const hostOf = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
};

/** The address of the Supabase project that issued this token (read from the token itself; nothing is verified here). */
function issuerHost(jwt) {
  try {
    const b64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    return hostOf(JSON.parse(json).iss);
  } catch {
    return '';
  }
}

export function takeAuthRedirect() {
  if (typeof window === 'undefined') return;
  const raw = window.location.hash.replace(/^#/, '');
  // Page routes always start with "/", so this only matches a hash that came from Supabase.
  if (!/^(access_token|error|error_code)=/.test(raw)) return;

  const params = new URLSearchParams(raw);
  const base = `${window.location.pathname}${window.location.search}`;
  const go = (to) => window.history.replaceState(null, '', `${base}#${to}`);

  const token = params.get('access_token');
  const kind = params.get('type');
  const which =
    config.stores.enabled && issuerHost(token || '') && issuerHost(token) === hostOf(config.stores.url) ? 'stores' : 'accounts';
  const target = KEYS[which];

  // Only a sign-up confirmation signs the person in. (A password-reset link also carries a session, but this site has
  // no screen for choosing a new password, so it is not used.)
  if (token && kind === 'signup') {
    session.set(target.token, token);
    const refresh = params.get('refresh_token');
    if (refresh) session.set(target.refresh, refresh);
    go(target.home);
    return;
  }
  go(token ? target.login.split('?')[0] : target.login);
}
