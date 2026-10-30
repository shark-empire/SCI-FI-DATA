import { useCallback, useEffect, useState } from 'react';
import { dataApi } from '../services/rest';
import { RESULTS_BULK_PRICE, RESULTS_BULK_THRESHOLD, RESULTS_PRODUCTS, RESULTS_REGULAR_PRICE } from '../config/site';

// Results checker prices live in the `results_products` table of the data project, so they can be changed from the
// Supabase dashboard without deploying the site. The numbers in config/site.js are only a safety net for a project
// where that table has not been created yet.
let cache = null;
let inflight = null;

const num = (v) => {
  const n = Number(v);
  return v !== null && v !== '' && Number.isFinite(n) ? n : null;
};

/** The built-in products, used only when the table does not exist or is empty. */
const builtIn = () =>
  RESULTS_PRODUCTS.map((p) => ({
    ...p,
    price: RESULTS_REGULAR_PRICE,
    bulkPrice: RESULTS_BULK_PRICE,
    bulkThreshold: RESULTS_BULK_THRESHOLD,
    available: true,
  }));

function normalize(row) {
  const meta = RESULTS_PRODUCTS.find((p) => p.id === row.id);
  const price = num(row.price);
  if (!row.id || price == null || price <= 0) return null; // a row with no usable price is ignored, never guessed
  const bulk = num(row.bulk_price);
  const name = row.name || meta?.name || String(row.id);
  return {
    id: String(row.id),
    name,
    full: row.name ? `${row.name} results checker` : meta?.full || `${name} results checker`,
    desc: row.description ?? meta?.desc ?? '',
    price,
    // A bulk price only counts when it really is lower.
    bulkPrice: bulk != null && bulk > 0 && bulk < price ? bulk : null,
    bulkThreshold: Math.max(1, parseInt(row.bulk_threshold, 10) || RESULTS_BULK_THRESHOLD),
    available: row.is_active !== false,
    sort: num(row.sort_order) ?? 0,
  };
}

/** What one checker costs when `quantity` are bought together. */
export const unitPrice = (product, quantity) =>
  product.bulkPrice != null && quantity > product.bulkThreshold ? product.bulkPrice : product.price;

/**
 * Read the live price list. Resolves { products, live }, where `live` says the prices came from the table.
 * A missing table (404) or an empty one gives the built-in list; any other failure rejects, so a payment is never
 * started against a price that could not be confirmed.
 */
export function loadResultsProducts({ force = false } = {}) {
  if (cache && !force) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = dataApi
    .select('results_products', '?select=*')
    .then((rows) => {
      const products = (rows || []).map(normalize).filter(Boolean).sort((a, b) => a.sort - b.sort || a.price - b.price);
      if (!products.length) {
        console.warn('results_products has no usable rows, so the built-in checker prices are being shown.');
        cache = { products: builtIn(), live: false };
      } else {
        cache = { products, live: true };
      }
      return cache;
    })
    .catch((err) => {
      if (err?.status === 404) {
        cache = { products: builtIn(), live: false };
        return cache;
      }
      throw err;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** { products, live, status: 'loading' | 'ready' | 'error', reload } */
export function useResultsProducts() {
  const [state, setState] = useState(() =>
    cache ? { ...cache, status: 'ready' } : { products: [], live: false, status: 'loading' },
  );

  const load = useCallback((force = false) => {
    setState((s) => (s.status === 'ready' && !force ? s : { ...s, status: 'loading' }));
    return loadResultsProducts({ force }).then(
      (data) => {
        setState({ ...data, status: 'ready' });
        return data;
      },
      (err) => {
        setState({ products: [], live: false, status: 'error' });
        throw err;
      },
    );
  }, []);

  useEffect(() => {
    if (!cache) load().catch(() => {});
  }, [load]);

  return { ...state, reload: () => load(true) };
}
