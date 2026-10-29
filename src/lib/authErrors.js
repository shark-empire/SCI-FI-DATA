// Turn a sign-in / sign-up failure into a message a customer can act on.
// GoTrue (Supabase auth) sends a machine code and an English message; we match on both because
// older projects only send the message.

const has = (err, ...needles) => {
  const hay = `${err?.code || ''} ${err?.message || ''}`.toLowerCase();
  return needles.some((n) => hay.includes(n));
};

/** True when the server refused a login because the sign-up email was never confirmed. */
export const isUnconfirmed = (err) => has(err, 'email_not_confirmed', 'email not confirmed');

/** True when the server said the sign-in details do not match an account (as opposed to a problem on our side). */
export const isBadCredentials = (err) => has(err, 'invalid_credentials', 'invalid login', 'invalid_grant', 'invalid credentials');

/** The server's own words in brackets, added to failures that are not the customer's doing so the cause can be read off a screenshot. */
const detail = (err) => {
  const m = String(err?.message || '').replace(/\s+/g, ' ').trim();
  return m && m.length <= 220 ? ` (${m})` : '';
};

/** Reasons that have nothing to do with what the person typed. */
function commonProblem(err) {
  if (!err) return null;
  if (err.code === 'network' || err.name === 'TypeError') {
    return 'We can’t reach the server. Check your internet connection and try again.';
  }
  if (err.status === 429 || has(err, 'rate limit', 'over_request_rate', 'too many')) {
    return 'Too many attempts. Wait a few minutes and try again.';
  }
  if (has(err, 'api key', 'apikey')) {
    return 'The site’s connection key was rejected. Please contact support.';
  }
  if (err.status >= 500) return `The server had a problem. Try again in a moment.${detail(err)}`;
  return null;
}

/**
 * @param {Error & {status?: number, code?: string}} err
 * @param {'email'|'phone'} kind  how the person identified themselves
 * @param {string} [email]        the address, so we can name it in the message
 */
export function loginError(err, kind = 'email', email = '') {
  const common = commonProblem(err);
  if (common) return common;

  if (has(err, 'phone_not_confirmed', 'phone not confirmed')) {
    return 'This number hasn’t been verified yet. Choose “Create an account”, enter the same details again, and we will text you a new code.';
  }
  if (isUnconfirmed(err)) {
    return kind === 'phone'
      ? 'This account has not been activated yet. Contact support and we will activate it.'
      : `Your email isn’t confirmed yet. Open the confirmation link we sent${email ? ` to ${email}` : ''}, then log in.`;
  }
  if (isBadCredentials(err)) {
    return kind === 'phone' ? 'Wrong phone number or password.' : 'Wrong email or password.';
  }
  if (has(err, 'user_banned', 'banned')) return 'This account has been suspended. Contact support.';
  return err?.message ? `We couldn’t log you in: ${err.message}` : 'We couldn’t log you in. Try again.';
}

/** Failures while texting a sign-up code, or while checking the code the person typed. */
export function codeError(err) {
  if (has(err, 'otp_expired', 'token has expired', 'expired or is invalid', 'invalid token')) {
    return 'That code is wrong or has expired. Check it and try again, or ask for a new one.';
  }
  if (has(err, 'over_sms_send_rate_limit', 'sms rate limit')) {
    return 'Too many codes have been sent. Wait a few minutes and try again.';
  }
  if (has(err, 'over_request_rate_limit', 'only request this after', 'for security purposes')) {
    return 'Please wait a minute before asking for another code.';
  }
  const common = commonProblem(err);
  if (common) return common;
  return err?.message ? `We couldn’t check that code: ${err.message}` : 'We couldn’t check that code. Try again.';
}

export function signupError(err, kind = 'email') {
  if (has(err, 'sms_send_failed', 'sending confirmation sms', 'error sending sms', 'sms provider')) {
    return `We couldn’t text a code to that number. Check the number and try again. If it keeps failing, contact support.${detail(err)}`;
  }
  if (has(err, 'phone_provider_disabled', 'phone signups are disabled', 'unsupported phone provider')) {
    return 'Phone sign-up is switched off right now. Contact support.';
  }
  if (has(err, 'user_already_exists', 'already registered', 'already been registered', 'already exists')) {
    return kind === 'phone'
      ? 'This phone number already has an account. Log in instead.'
      : 'This email already has an account. Log in instead.';
  }
  if (has(err, 'over_email_send_rate_limit', 'email rate limit')) {
    return 'Too many sign-up emails have been sent for now. Wait about an hour, or sign up with your phone number instead.';
  }
  const common = commonProblem(err);
  if (common) return common;

  if (has(err, 'email_address_invalid', 'email address') && has(err, 'invalid')) {
    return 'That email address was not accepted. Check the spelling, or try a different address.';
  }
  if (has(err, 'email_address_not_authorized', 'not authorized')) {
    return 'Emails can’t be sent to that address yet. Try another address or sign up with your phone number.';
  }
  if (has(err, 'signup_disabled', 'signups not allowed', 'signup is disabled')) {
    return 'New sign-ups are switched off right now. Contact support.';
  }
  if (has(err, 'weak_password', 'password should')) {
    return 'Choose a stronger password (at least 8 characters, with a capital letter and a number).';
  }
  return err?.message ? `We couldn’t create your account: ${err.message}` : 'We couldn’t create your account. Try again.';
}
