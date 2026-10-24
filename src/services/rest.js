// Minimal Supabase client over fetch: PostgREST (tables) and GoTrue (auth).
// No SDK is needed for what this app does, which keeps the bundle small.
import { config } from '../config/env';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Pull the human message out of a PostgREST / GoTrue error body. */
async function readError(res) {
  const text = await res.text().catch(() => '');
  try {
    const j = JSON.parse(text);
    return j.msg || j.message || j.error_description || j.error || text || `Request failed (${res.status})`;
  } catch {
    return text || `Request failed (${res.status})`;
  }
}

export function createClient({ url, anon }) {
  const headers = (token, extra) => ({
    apikey: anon,
    Authorization: `Bearer ${token || anon}`,
    'Content-Type': 'application/json',
    ...extra,
  });

  async function request(method, path, { token, body, prefer, signal } = {}) {
    const res = await fetch(`${url}${path}`, {
      method,
      headers: headers(token, prefer ? { Prefer: prefer } : undefined),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw new ApiError(await readError(res), res.status);
    if (res.status === 204 || prefer === 'return=minimal') return null;
    return res.json();
  }

  return {
    select: (table, query = '', token, signal) => request('GET', `/rest/v1/${table}${query}`, { token, signal }),
    insert: (table, body, token) => request('POST', `/rest/v1/${table}`, { token, body, prefer: 'return=minimal' }),
    update: (table, query, body, token) =>
      request('PATCH', `/rest/v1/${table}${query}`, { token, body, prefer: 'return=minimal' }),

    auth: {
      signIn: (email, password) =>
        request('POST', '/auth/v1/token?grant_type=password', { body: { email, password } }),
      signUp: (email, password) => request('POST', '/auth/v1/signup', { body: { email, password } }),
      refresh: (refreshToken) =>
        request('POST', '/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: refreshToken } }),
      user: (token) => request('GET', '/auth/v1/user', { token }),
    },
  };
}

/** Bundle catalogue + payment confirmations. */
export const dataApi = createClient(config.dataBackend);
/** Sign-in, profiles, wallet and account orders. */
export const accountsApi = createClient(config.accountsBackend);
