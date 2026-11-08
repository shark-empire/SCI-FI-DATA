// Calls to the Activepieces / Make automation endpoints.
import { config, isPlaceholder } from '../config/env';
import { NETWORKS } from '../config/site';

async function postJson(url, body, { signal } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new Error('Could not reach the service. Check your connection and try again.');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (res.status === 429) throw new Error('Too many requests. Wait a few seconds and try again.');
  if (!res.ok) throw new Error(data?.error || data?.message || `The service returned an error (${res.status}).`);
  return data ?? {};
}

export const walletPaymentsEnabled = !isPlaceholder(config.hooks.walletPurchase);
export const resultsDeliveryConfigured = !isPlaceholder(config.hooks.resultsVerify);
export const dataTransferEnabled = !isPlaceholder(config.hooks.dataTransfer);

/** Who is the registered owner of this number on this network? */
export async function lookupOwner({ phone, network, signal }) {
  const lookupCode = NETWORKS.find((n) => n.id === network)?.lookupCode;
  return postJson(config.hooks.ownerLookup, { phoneNumber: String(phone), networkCode: lookupCode }, { signal });
}

/** Find orders by payment reference. */
export async function findOrdersByReference(reference) {
  return postJson(config.hooks.orderLookup, { type: 'reference', reference });
}

export async function purchaseWithWallet({ token, userId, bundleId, recipientPhone }) {
  return postJson(config.hooks.walletPurchase, {
    user_jwt: token,
    user_id: userId,
    bundle_id: bundleId,
    recipient_phone: recipientPhone,
  });
}

const NUDGE_GAP_MS = 55 * 1000;
let lastNudge = 0;

/**
 * Asks the "Wallet delivery check" automation to look at wallet orders that are still on their way.
 * Fire and forget: nothing is awaited and nothing is shown. At most once every ~minute per visitor (also across
 * refreshes and tabs), because each run uses one automation task. Does nothing until the address is set in env.js.
 */
export function nudgeDeliveryCheck() {
  const url = config.hooks.walletDeliveryCheck;
  if (!url || isPlaceholder(url)) return;
  const now = Date.now();
  if (now - lastNudge < NUDGE_GAP_MS) return;
  try {
    const stored = Number(sessionStorage.getItem('sf_delivery_nudge') || 0);
    if (now - stored < NUDGE_GAP_MS) return;
    sessionStorage.setItem('sf_delivery_nudge', String(now));
  } catch {
    /* storage unavailable: the in-memory gap above still applies */
  }
  lastNudge = now;
  // no-cors: the answer is not needed, and this avoids a CORS pre-check on every call.
  fetch(url, { method: 'POST', mode: 'no-cors', body: '{}', keepalive: true }).catch(() => {});
}

/** Exchange a paid Paystack reference for results checker PINs. */
export async function fetchResultsPins({ reference, productId, quantity, delivery, deliveryTo, email, phone }) {
  return postJson(config.hooks.resultsVerify, {
    reference,
    product_id: productId,
    quantity,
    // How the customer wants the PIN sent ("sms" or "email") and where, so the webhook can route it.
    delivery,
    delivery_to: deliveryTo,
    email: email || '',
    phone: phone || '',
  });
}

export async function sendDataTransfer(payload) {
  return postJson(config.hooks.dataTransfer, payload);
}
