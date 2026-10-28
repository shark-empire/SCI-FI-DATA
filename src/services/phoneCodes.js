import { accountsApi } from './rest';

let asked = null;

/**
 * Does the accounts project text a 6-digit code to confirm new phone numbers?
 * Supabase publishes this: the Phone sign-in method must be on, and "Enable phone confirmations" must be on
 * (the settings call reports that as phone_autoconfirm being false).
 *
 * Asked once per visit. Any doubt (offline, slow, an unexpected answer) means "no", and the site keeps using the
 * older phone sign-up that needs no code, so a hiccup never blocks anyone from signing up.
 */
export function phoneCodesEnabled() {
  if (!asked) {
    asked = (async () => {
      const stop = new AbortController();
      const timer = setTimeout(() => stop.abort(), 4000);
      try {
        const s = await accountsApi.auth.settings(stop.signal);
        return s?.external?.phone === true && s?.phone_autoconfirm !== true;
      } catch {
        asked = null; // ask again next time instead of remembering a failure
        return false;
      } finally {
        clearTimeout(timer);
      }
    })();
  }
  return asked;
}
