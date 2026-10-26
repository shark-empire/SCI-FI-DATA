# SCI-FI DATA

One React site that replaces four separate projects:

| Original project | Now lives at |
| --- | --- |
| Sci-Fi Data static site (guest data checkout, owner lookup, order tracking) | `/data`, `/data/success`, `/track` |
| Babor (WAEC results-checker PIN store) | `/results` |
| Babor-Api (accounts, wallet, orders, developer page) | `/login`, `/signup`, `/account/*`, `/developers` |
| Store (reseller marketplace: stores, store builder, seller dashboard) | `/marketplace`, `/stores`, `/store/:slug`, `/bundle/:id`, `/store-builder`, `/seller/*` |

Stack: Vite 7, React 19, `react-icons`. No UI framework, plain CSS with design tokens (dark and light themes).

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
| `VITE_STORES_SUPABASE_URL`, `VITE_STORES_SUPABASE_ANON_KEY` | Reseller stores: `stores`, `bundles`, `orders`, sellers' sign-in | URL from the Store project; **no key**, so stores stay off until you set it |
| `VITE_STORES_PAYSTACK_PUBLIC_KEY` | Customers paying a store | same as `VITE_PAYSTACK_PUBLIC_KEY` |
| `VITE_OWNER_LOOKUP_URL` | Recipient name lookup | original Activepieces flow |
| `VITE_ORDER_LOOKUP_URL` | Track order by reference | original Activepieces flow |
| `VITE_WALLET_PURCHASE_URL` | Pay for a bundle from the wallet | placeholder, so wallet payment is hidden |
| `VITE_RESULTS_VERIFY_URL` | Verify a results-checker payment and return PINs | placeholder, so PIN delivery is not live |
| `VITE_DATA_TRANSFER_URL` | `/admin/transfer` tool | empty, so the tool is disabled |
| `VITE_WALLET_FEE_PERCENT` | Paystack fee added when someone adds money to their wallet (0 turns it off) | `3` |
| `VITE_WHATSAPP_NUMBER`, `VITE_SUPPORT_EMAIL` | Contact links | from the original site |

## Stores (the Store project)

Anyone can open a store, set their own prices and share one link; customers pay by Mobile Money or card and the store delivers the data.

**Switching it on.** The Store project kept its Supabase key in a `.env` that was not in the upload, so there is no default. Set `VITE_STORES_SUPABASE_ANON_KEY` (and `VITE_STORES_SUPABASE_URL` if it is not the project in `src/config/env.js`) and rebuild. Until then the marketplace, the store builder and the seller area are hidden from the menus and their pages say they are not switched on. The rest of the site is unaffected.

**What the pages do**

| Page | What it is |
| --- | --- |
| `#/marketplace` | Every live bundle from every open store, with network filter, search and sort |
| `#/stores` | Directory of open stores |
| `#/store/<slug>` | A store's own page. It takes the store's accent colour and has the checkout. This is the link a seller shares |
| `#/bundle/<id>` | One bundle, with checkout |
| `#/store-builder` | Four steps: seller account, store details (name, description, WhatsApp, logo), colour, launch |
| `#/seller`, `/seller/orders`, `/seller/bundles` | Seller dashboard: sales, orders, add bundles, hide or show a bundle |
| `#/seller/login` | Seller sign-in and sign-up |

Sellers sign in to the Store project, which is a different Supabase project from customer accounts. The two sessions are kept apart, so signing in as a seller never signs a customer out.

**Tables and rules the backend needs** (taken from the Store code)

- `stores` (`owner_id`, `name`, `slug`, `description`, `logo_url`, `accent_color`, `whatsapp`, `is_active`), `bundles` (`store_id`, `name`, `network`, `size_gb`, `price`, `validity`, `is_active`, with a foreign key to `stores`), `orders` (`bundle_id`, `store_id`, `customer_phone`, `amount`, `paystack_reference`, `payment_method`, `status`), and a storage bucket `assets` for logos. The optional function `get_store_stats(p_store_id)` feeds the dashboard totals; without it they are worked out from the latest 200 orders.
- The network is stored as `MTN`, `Telecel` or `AT`. The site shows `AT` as AirtelTigo and writes it back as `AT`.
- **Row-level security.** Visitors must be able to read live stores and bundles and insert an order; owners must be able to read their own orders and insert or update their own store and bundles; nobody should be able to edit another store.
- **A customer's browser creates the order row, so it is not proof of payment.** The row is saved as `pending` with the Paystack reference. Whatever delivers the data must verify the reference with Paystack, check that the amount paid matches `bundles.price` for that `bundle_id`, and only then deliver and mark the order `completed`. The Paystack metadata (`type: 'bundle_purchase'`, `phone`, `network`, `bundle_id`, `store_id`, `bundle_size`) is sent so a webhook can do this on its own, without relying on the browser.

**What was left out or changed from the Store project**

- Left out: wallet top-up and pay-from-wallet (the site already has one wallet, and the Store's `deduct_wallet_balance` function took a user id from the browser), the phone-OTP login (it never created a session), the fabricated testimonials, and the "pretend the payment worked" fallback when Paystack could not load. Also dropped: Tailwind, framer-motion, three, lucide, the Supabase SDK and the debug console (eruda). The pages that used them were rebuilt in the site's own style.
- Fixed: the bundle validity typo (`validit`) that made every bundle `90DAYS`; the dashboard calling a function that did not exist; sellers' totals being worked out from only the last 50 orders; store links that would not have worked on a static host (they are now `#/store/<slug>` and are built from wherever the site is hosted).
- A store's accent colour is checked (`#rrggbb` only) before it reaches the page, and uploaded logos must be a PNG, JPG, WebP or GIF under 2 MB.

## Things you need to finish before taking real money

1. **Results checkers need a backend.** The original Babor project called `https://your-backend-url.com/api/verify-payment`, which never existed. Point `VITE_RESULTS_VERIFY_URL` at a service that verifies the Paystack reference **server-side** and returns `{ "pins": [{ "pin": "...", "serial": "..." }] }`. The page sends `{ reference, product_id, quantity }`. Until then the page shows a clear error and keeps the payment reference so the customer can contact you. Also set `VITE_RESULTS_PAYSTACK_KEY` to a live key when you go live: the default is a test key.
2. **Wallet top-ups carry a 3% fee.** On *Add money* the customer pays the amount plus 3% (Paystack's processing fee) and the wallet should receive only the amount they typed: pay GH₵ 51.50, get GH₵ 50.00. The Paystack charge is the total; the metadata sent with it is `{ type: 'wallet_funding', user_id, wallet_credit: 50, fee: 1.5, fee_percent: 3 }`. **Whatever credits the balance (your Paystack webhook or automation) must credit `wallet_credit`, not the amount Paystack reports**, or customers will be credited the fee as well. Change the rate with `VITE_WALLET_FEE_PERCENT`.
3. **Wallet payments.** The original wallet-purchase webhook was a `YOUR_WALLET_FLOW_ID` placeholder. Set `VITE_WALLET_PURCHASE_URL` and the "Pay from wallet" option appears automatically. The flow must debit the balance server-side.
4. **Rotate the exposed admin webhook.** The original `api.html` had the Make.com transfer webhook and an admin key in public source. Treat them as compromised and regenerate them. This site does not embed them. To use the admin page, set `VITE_DATA_TRANSFER_URL`; it is sent an `admin_key` that you type in, and it is still only a courtesy gate, so enforce authorisation in the webhook itself.
5. **Use one Supabase project.** The data catalogue and the account/wallet system point at two different Supabase projects. Wallet purchases send the catalogue's `bundle_id`, so the wallet flow has to understand those ids. Moving everything to one project (set both URL/key pairs to the same values) avoids this.
6. **Row-level security.** The anon keys are public by design, so your tables must have RLS policies that only let users read their own `orders`, `wallet_transactions` and `users` rows, and never let the browser change a balance. The original client credited wallets directly from the browser; that was removed, and the wallet balance is now only read, and refreshed after payment.
7. **Store orders need a verifying backend** (see Stores above). Without it, a paid store order stays `pending` forever.
8. **Brand.** `public/logo.svg` and `public/favicon.svg` are placeholder marks. Replace them with your own.

## What changed from the originals

- Fake or insecure pieces were dropped rather than carried over: client-side wallet crediting, base64 "password" handling, demo-mode fallback data, the embedded admin key, the sample API key on the developer page, invented statistics, and the lookup-by-phone order search (it exposed other people's orders).
- Prices are never made up. If the bundle catalogue cannot be loaded the page shows an error with a retry button.
- Sign-in uses Supabase Auth over its REST API; the session lives in `sessionStorage` and refreshes itself on a 401.
- Paystack metadata and webhook payloads are unchanged, so your existing automations keep working.
- The NEXTSTEP promo flyer in the source archive was not used.

## Look and feel

The design is dark-first with a light theme (the toggle is in the header; a saved choice wins, and so does a light system setting).

- **Tinted liquid glass.** Panels, the header, the footer, the phone tab bar and the toasts are translucent glass: a blurred backdrop, a lit top-left edge and a tint. The tint is the colour of the glass and it follows what the visitor is looking at: the home headline cycles MTN, Telecel and AirtelTigo once and re-colours the whole page, Buy data takes the colour of the chosen network, and Results checkers is violet. Change the colours in `src/styles/tokens.css` (`[data-tint='mtn']` and friends).
- **Live layer** (`src/lib/live.js`, mounted by `src/components/LiveFX.jsx`): the backdrop orbs drift toward the pointer, a soft spotlight follows it, the glass under the pointer catches a highlight, cards lean toward it, the main buttons lean toward a nearby cursor, and every click sends out a ring with a few sparks, a ripple inside the pressed control and a small spring through the backdrop. It is one animation loop that sleeps when nothing moves. It is switched off for visitors who ask for reduced motion, and hover effects are skipped on touch screens (taps still get the click effects). To remove the whole layer, delete `<LiveFX />` from `src/App.jsx`.
- **Type and shape.** Large light-weight display type, pill buttons and chips, and corners that get softer as surfaces get bigger. Fonts load from Google Fonts (Bricolage Grotesque and Instrument Sans); the page still works without them.
- **Where things are:** `tokens.css` (colours, radii, the glass recipe numbers), `glass.css` (the backdrop, the glass surfaces and the click and highlight effects), `home.css` (the home page), `components.css` and `layout.css` (everything shared).

The look takes its ideas from the structure and public design language of shopify.com and nas.com (big light display type, pill buttons, a rotating hero word, short lowercase step headings, a stat band, chip rows). No logos, images, copy or brand assets from either site are used.

## Project layout

```
src/
  config/       env.js (runtime config), site.js (brand, networks, FAQ, results products)
  lib/          format, phone validation, ids/references, storage, rate limit, live (pointer and click effects)
  services/     rest.js (Supabase), webhooks.js, paystack.js, stores.js (reseller stores)
  context/      Theme, Toast, Auth, Seller (store owners' own sign-in)
  hooks/        useBundles, usePageTitle, useTint (sets the colour of the glass)
  components/   ui.jsx, Logo, RateCard, LiveFX (backdrop + click layer), layout/ (Header, Footer, TabBar, layouts)
  pages/        public pages, account/ (signed in), admin/, stores/ (marketplace, store pages, builder), seller/ (dashboard)
  styles/       tokens, base, components, layout, pages, home, stores, glass
  router.jsx    small hash router
  App.jsx       providers and route tables
```

To add a page, create it in `src/pages` and add an entry to `PUBLIC_ROUTES`, `ACCOUNT_ROUTES` or `SELLER_ROUTES` in `src/App.jsx`. An address with one variable part (`/store/<slug>`) goes in `PARAM_ROUTES` and the page receives the value as the `param` prop.
