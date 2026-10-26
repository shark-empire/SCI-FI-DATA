/** A link a customer can open, built from wherever the site is hosted (works in a sub-folder and with hash routing). */
export const siteUrl = (path) => {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#${path}`;
};

export const storeUrl = (slug) => siteUrl(`/store/${encodeURIComponent(slug)}`);

/** WhatsApp chat link from a number stored as digits. Returns '' when there is no usable number. */
export const whatsappLink = (digits, text) => {
  const n = String(digits ?? '').replace(/\D/g, '');
  if (n.length < 9) return '';
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
};
