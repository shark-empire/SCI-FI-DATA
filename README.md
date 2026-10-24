# SCI-FI DATA

One React site that replaces three separate projects:

| Original project | Now lives at |
| --- | --- |
| Sci-Fi Data static site (guest data checkout, owner lookup, order tracking) | `/data`, `/data/success`, `/track` |
| Babor (WAEC results-checker PIN store) | `/results` |
| Babor-Api (accounts, wallet, orders, developer page) | `/login`, `/signup`, `/account/*`, `/developers` |

Stack: Vite 7, React 19, `react-icons`. No UI framework, plain CSS with design tokens (light and dark themes).

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # outputs ./dist
npm run preview    # serve the production build locally
```

Node 20.19 or newer is required (Vite 7).

## Deploy

The router is hash based (`#/data`) and Vite uses `base: './'`, so the `dist` folder works on any static host, in any sub-folder, with no rewrite rules.

- **GitHub Pages**: push to `main`. `.github/workflows/deploy.yml` builds and publishes. In the repository go to Settings > Pages > Source: GitHub Actions.
- **Netlify**: import the repository. `netlify.toml` already sets the build command and publish folder.
- **Vercel**: import the repository. The Vite preset is detected automatically.
- **Anywhere else**: run `npm run build` and upload `dist/`.

## Configuration

Everything is optional. The defaults in `src/config/env.js` are the values found in your three projects, so the site works as soon as it is built. To override one, copy `.env.example` to `.env` (local) or set the same names in your host's environment settings (or as repository variables for the GitHub Actions workflow).

`VITE_*` values are compiled into the public JavaScript. Only put public or publishable keys there.

| Variable | Used for | Default |
| --- | --- | --- |
| `VITE_PAYSTACK_PUBLIC_KEY` | Data bundles and wallet top-ups | live key from the original projects |
| `VITE_RESULTS_PAYSTACK_KEY` | Results checkers | **test** key from Babor |
| `VITE_DATA_SUPABASE_URL`, `VITE_DATA_SUPABASE_ANON_KEY` | Bundle catalogue (`bundles`) and payment confirmations (`transactions`) | Sci-Fi Data project |
| `VITE_ACCOUNTS_SUPABASE_URL`, `VITE_ACCOUNTS_SUPABASE_ANON_KEY` | Sign-in, `users`, `orders`, `wallet_transactions` | Babor-Api project |
| `VITE_OWNER_LOOKUP_URL` | Recipient name lookup | original Activepieces flow |
| `VITE_ORDER_LOOKUP_URL` | Track order by reference | original Activepieces flow |
| `VITE_WALLET_PURCHASE_URL` | Pay for a bundle from the wallet | placeholder, so wallet payment is hidden |
| `VITE_RESULTS_VERIFY_URL` | Verify a results-checker payment and return PINs | placeholder, so PIN delivery is not live |
| `VITE_DATA_TRANSFER_URL` | `/admin/transfer` tool | empty, so the tool is disabled |
| `VITE_WHATSAPP_NUMBER`, `VITE_SUPPORT_EMAIL` | Contact links | from the original site |

## Things you need to finish before taking real money

1. **Results checkers need a backend.** The original Babor project called `https://your-backend-url.com/api/verify-payment`, which never existed. Point `VITE_RESULTS_VERIFY_URL` at a service that verifies the Paystack reference **server-side** and returns `{ "pins": [{ "pin": "...", "serial": "..." }] }`. The page sends `{ reference, product_id, quantity }`. Until then the page shows a clear error and keeps the payment reference so the customer can contact you. Also set `VITE_RESULTS_PAYSTACK_KEY` to a live key when you go live: the default is a test key.
2. **Wallet payments.** The original wallet-purchase webhook was a `YOUR_WALLET_FLOW_ID` placeholder. Set `VITE_WALLET_PURCHASE_URL` and the "Pay from wallet" option appears automatically. The flow must debit the balance server-side.
3. **Rotate the exposed admin webhook.** The original `api.html` had the Make.com transfer webhook and an admin key in public source. Treat them as compromised and regenerate them. This site does not embed them. To use the admin page, set `VITE_DATA_TRANSFER_URL`; it is sent an `admin_key` that you type in, and it is still only a courtesy gate, so enforce authorisation in the webhook itself.
4. **Use one Supabase project.** The data catalogue and the account/wallet system point at two different Supabase projects. Wallet purchases send the catalogue's `bundle_id`, so the wallet flow has to understand those ids. Moving everything to one project (set both URL/key pairs to the same values) avoids this.
5. **Row-level security.** The anon keys are public by design, so your tables must have RLS policies that only let users read their own `orders`, `wallet_transactions` and `users` rows, and never let the browser change a balance. The original client credited wallets directly from the browser; that was removed, and the wallet balance is now only read, and refreshed after payment.
6. **Brand.** `public/logo.svg` and `public/favicon.svg` are placeholder marks. Replace them with your own.

## What changed from the originals

- Fake or insecure pieces were dropped rather than carried over: client-side wallet crediting, base64 "password" handling, demo-mode fallback data, the embedded admin key, the sample API key on the developer page, invented statistics, and the lookup-by-phone order search (it exposed other people's orders).
- Prices are never made up. If the bundle catalogue cannot be loaded the page shows an error with a retry button.
- Sign-in uses Supabase Auth over its REST API; the session lives in `sessionStorage` and refreshes itself on a 401.
- Paystack metadata and webhook payloads are unchanged, so your existing automations keep working.
- The NEXTSTEP promo flyer in the source archive was not used.

## Project layout

```
src/
  config/       env.js (runtime config), site.js (brand, networks, FAQ, results products)
  lib/          format, phone validation, ids/references, storage, rate limit
  services/     rest.js (Supabase), webhooks.js, paystack.js
  context/      Theme, Toast, Auth
  hooks/        useBundles, usePageTitle
  components/   ui.jsx, Logo, RateCard, layout/ (Header, Footer, TabBar, layouts)
  pages/        public pages, account/ (signed in), admin/
  styles/       tokens, base, components, layout, pages
  router.jsx    small hash router
  App.jsx       providers and route tables
```

To add a page, create it in `src/pages` and add an entry to `PUBLIC_ROUTES` or `ACCOUNT_ROUTES` in `src/App.jsx`.
