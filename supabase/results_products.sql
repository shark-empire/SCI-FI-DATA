-- Results checker prices, kept in Supabase so they can be changed without deploying the site.
-- Run this once in the SQL Editor of the DATA project (the one that holds your `bundles` table).

create table if not exists public.results_products (
  id             text primary key,                      -- must match the product ids the site uses (below)
  name           text,                                  -- shown on the buttons, for example WASSCE
  description    text,                                  -- the line under the name
  price          numeric(10,2) not null check (price > 0),  -- one checker, in cedis
  bulk_price     numeric(10,2) check (bulk_price is null or bulk_price > 0),  -- each, when buying MORE than bulk_threshold (empty = no bulk price)
  bulk_threshold integer not null default 5,
  is_active      boolean not null default true,         -- false = shown as "Unavailable" and cannot be bought
  sort_order     integer not null default 0             -- smaller numbers come first
);

-- Anyone may READ the prices (the site does it with the public key). Nobody can change them from the browser:
-- you edit the rows in the Supabase dashboard (Table Editor), which is not affected by these rules.
alter table public.results_products enable row level security;
drop policy if exists "Anyone can read checker prices" on public.results_products;
create policy "Anyone can read checker prices"
  on public.results_products for select
  to anon, authenticated
  using (true);
grant select on public.results_products to anon, authenticated;

insert into public.results_products (id, name, description, price, bulk_price, bulk_threshold, sort_order) values
  ('wassce_checker', 'WASSCE', 'For school candidates sitting the WASSCE.', 20, 17, 5, 1),
  ('novdec_checker', 'NOVDEC', 'For private candidates sitting the November/December WASSCE.', 20, 17, 5, 2),
  ('bece_checker',   'BECE',   'For Junior High School candidates sitting the BECE.', 20, 17, 5, 3)
on conflict (id) do nothing;
