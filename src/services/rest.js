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

  async function request(method, path, { token, body, prefer, signal, extraHeaders, raw } = {}) {
    const res = await fetch(`${url}${path}`, {
      method,
      headers: headers(token, { ...(prefer ? { Prefer: prefer } : {}), ...extraHeaders }),
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
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
    /** Call a Postgres function (`select * from fn(args)`). */
    rpc: (fn, args, token) => request('POST', `/rest/v1/rpc/${fn}`, { token, body: args || {} }),
    /** Upload a file to a storage bucket and return its public URL. */
    upload: async (bucket, path, file, token) => {
      await request('POST', `/storage/v1/object/${bucket}/${path}`, {
        token,
        body: file,
        raw: true,
        extraHeaders: { 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'true' },
      });
      return `${url}/storage/v1/object/public/${bucket}/${path}`;
    },

    auth: {
      signIn: (email, password) =>
        request('POST', '/auth/v1/token?grant_type=password', { body: { email, password } }),
      // `data` becomes the user's metadata (for example a full name).
      signUp: (email, password, data) =>
        request('POST', '/auth/v1/signup', { body: { email, password, ...(data ? { data } : {}) } }),
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
/** Reseller stores, store bundles and store orders (the Store project). */
export const storesApi = createClient(config.stores);
