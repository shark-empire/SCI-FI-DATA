// Read the vouchers out of whatever the results-checker webhook answered with.
//
// The page asks for  { "pins": [ { "pin": "...", "serial": "..." } ] }  but an automation tool is easy to set up with
// slightly different names (cards, vouchers, serial_number, ...). Rather than showing nothing, accept the usual
// spellings. Names are compared without caring about capitals, spaces, dashes or underscores.

const LIST_KEYS = ['pins', 'vouchers', 'voucher', 'cards', 'checkers', 'results', 'items', 'data'];
const PIN_KEYS = ['pin', 'pincode', 'voucherpin', 'cardpin', 'checkerpin', 'accesscode', 'voucher'];
const SERIAL_KEYS = ['serial', 'serialnumber', 'serialno', 'serialnum', 'cardserial', 'voucherserial', 'sn', 'cardnumber'];

const squash = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');

/** Lower-cased, squashed key -> value, for one object. */
function keyed(obj) {
  const out = {};
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) out[squash(k)] = v;
  }
  return out;
}

const text = (v) => (v === null || v === undefined || typeof v === 'object' ? '' : String(v).trim());

function pick(obj, names) {
  const map = keyed(obj);
  for (const n of names) {
    const t = text(map[n]);
    if (t) return t;
  }
  return '';
}

/** Find the list of vouchers inside a reply (which may nest it, or send a JSON string). */
function findList(value, depth = 0) {
  let v = value;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  if (Array.isArray(v)) return v;
  if (!v || typeof v !== 'object' || depth > 3) return [];
  const map = keyed(v);
  for (const name of LIST_KEYS) {
    if (name in map) {
      const inner = findList(map[name], depth + 1);
      if (inner.length) return inner;
    }
  }
  // A single voucher sent on its own.
  return pick(v, PIN_KEYS) ? [v] : [];
}

/** @returns {{pin: string, serial: string}[]} only entries that have a PIN */
export function readPins(reply) {
  return findList(reply)
    .map((item) => ({ pin: pick(item, PIN_KEYS), serial: pick(item, SERIAL_KEYS) }))
    .filter((p) => p.pin);
}

/** Field names (never values) in a reply, so a failure message can say what arrived without printing a PIN. */
export function describeReply(reply) {
  if (Array.isArray(reply)) return reply.length ? 'a list with no PIN in it' : '';
  if (!reply || typeof reply !== 'object') return '';
  const names = Object.keys(reply).slice(0, 8);
  return names.length ? `It contained: ${names.join(', ')}.` : '';
}
