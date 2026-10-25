// Central runtime configuration.
// Every value can be overridden with a VITE_* environment variable (see .env.example).
// The fallbacks are the public values found in the original three projects.
// Only public/publishable keys belong here: this file is compiled into the browser bundle.

const raw = import.meta.env ?? {};

const val = (key, fallback = '') => {
  const v = raw[key];
  return typeof v === 'string' && v.trim() ? v.trim() : fallback;
};

/** True when a URL is empty or still one of the "YOUR_..." placeholders from the source projects. */
export const isPlaceholder = (v) => !v || /YOUR_|your-backend-url|example\.com/i.test(v);

export const config = {
  paystack: {
    // Data bundles and wallet top-ups (live key in the original Sci-Fi Data projects).
    dataKey: val('VITE_PAYSTACK_PUBLIC_KEY', 'pk_live_68410a36c97591a8e61aa8fc998b9e39cf51b92f'),
    // Results checkers (test key in the original Babor project).
    resultsKey: val('VITE_RESULTS_PAYSTACK_KEY', 'pk_test_cc8cf710bcbf876df9102c2a9b307407ba7d1b11'),
  },

  // Bundle catalogue and payment confirmations (the static Sci-Fi Data site's project).
  dataBackend: {
    url: val('VITE_DATA_SUPABASE_URL', 'https://zhinkuoqxsmotnbsjdue.supabase.co'),
    anon: val(
      'VITE_DATA_SUPABASE_ANON_KEY',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoaW5rdW9xeHNtb3RuYnNqZHVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTc1MzIsImV4cCI6MjA4Nzk3MzUzMn0.Kw5BDJDH9WOAiE3a-P6ylQiseErYG-mHCFi5fgamnUY',
    ),
  },

  // Accounts, wallet and account orders (the Babor-Api React project).
  accountsBackend: {
    url: val('VITE_ACCOUNTS_SUPABASE_URL', 'https://zhinkuoqxsmotnbsjdue.supabase.co'),
    anon: val(
      'VITE_ACCOUNTS_SUPABASE_ANON_KEY',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoaW5rdW9xeHNtb3RuYnNqZHVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTc1MzIsImV4cCI6MjA4Nzk3MzUzMn0.Kw5BDJDH9WOAiE3a-P6ylQiseErYG-mHCFi5fgamnUY',
    ),
  },

  hooks: {
    ownerLookup: val(
      'VITE_OWNER_LOOKUP_URL',
      'https://cloud.activepieces.com/api/v1/webhooks/52c9FefTQeztOkvcgzPwP/sync',
    ),
    orderLookup: val(
      'VITE_ORDER_LOOKUP_URL',
      'https://cloud.activepieces.com/api/v1/webhooks/ndWxkw35jrCn2zSlUU4NB/sync',
    ),
    // Still a placeholder in the source project: wallet payment stays hidden until this is set.
    walletPurchase: val(
      'VITE_WALLET_PURCHASE_URL',
      'https://cloud.activepieces.com/api/v1/webhooks/YOUR_WALLET_FLOW_ID',
    ),
    // Still a placeholder in the source project: PIN delivery needs this backend.
    resultsVerify: val('VITE_RESULTS_VERIFY_URL', 'https://your-backend-url.com/api/verify-payment'),
    // Deliberately empty: the original admin webhook was publicly embedded in api.html.
    dataTransfer: val('VITE_DATA_TRANSFER_URL', ''),
  },

  contact: {
    whatsapp: val('VITE_WHATSAPP_NUMBER', '233540753328'),
    supportEmail: val('VITE_SUPPORT_EMAIL', 'support@sci-fidata.com'),
    privacyEmail: 'privacy@sci-fidata.com',
  },
};
