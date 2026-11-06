-- SCI-FI DATA wallet backend.
-- Run this once in the SQL Editor of the Supabase project that holds `users`, `wallet_transactions`, `orders` and `bundles`.
-- Supabase may warn about "destructive operations" (it sees the `drop` lines). They only remove objects this file recreates.
--
-- What it does
--   1. Stores money in cedis AND pesewas (the old columns were whole numbers, so 50.50 could not be saved).
--   2. Adds the columns the wallet needs (an order number, a reference on every wallet line).
--   3. Adds the functions your automations call to add money, take money for an order, and refund an order. Each one
--      works in a single step, so two requests at once can never spend the same money twice, and the same payment can
--      never be credited twice.
--   4. Locks the tables so the browser can READ its own rows but can never change a balance, an order or a wallet line.

-- 1. Money with pesewas -----------------------------------------------------------------------------------------------
alter table public.users               alter column wallet_balance type numeric(12,2);
alter table public.wallet_transactions alter column amount         type numeric(12,2);
alter table public.orders              alter column amount         type numeric(12,2);

update public.users set wallet_balance = 0 where wallet_balance is null;
alter table public.users alter column wallet_balance set default 0;
alter table public.users alter column wallet_balance set not null;

-- A balance can never go below zero. ("not valid" leaves any old rows alone and checks every new change.)
alter table public.users drop constraint if exists users_wallet_balance_not_negative;
alter table public.users add constraint users_wallet_balance_not_negative check (wallet_balance >= 0) not valid;

-- 2. Columns the wallet needs ----------------------------------------------------------------------------------------
-- The order number the site looks orders up by (/data/success?order=...).
alter table public.orders add column if not exists order_id text;
create unique index if not exists orders_order_id_key on public.orders (order_id) where order_id is not null;
-- The catalogue bundle that was bought. (`orders.bundle_id` is a uuid, the catalogue ids are numbers, so a new column.)
alter table public.orders add column if not exists catalog_bundle_id bigint;
-- How the order was paid for (the "Paid with" column on the My orders page).
alter table public.orders add column if not exists payment_method text;
-- The data provider's own reference for the order, so the automation can ask it later whether the data really arrived.
alter table public.orders add column if not exists provider_reference text;

-- One reference per wallet line: the Paystack reference for a top-up, the order number for a purchase,
-- "refund-" plus the order number for a refund. The unique index is what stops a line being written twice.
alter table public.wallet_transactions add column if not exists reference text;
alter table public.wallet_transactions add column if not exists balance_after numeric(12,2);
create unique index if not exists wallet_transactions_reference_key on public.wallet_transactions (reference) where reference is not null;

-- 3. Functions -------------------------------------------------------------------------------------------------------

-- Add money to a wallet after a Paystack payment.
-- `p_paid_pesewas` is what Paystack says was paid (pesewas). The customer pays the amount plus the fee, and the wallet
-- gets only the amount, so the credit is worked out from what was really paid, never from what the browser claimed.
drop function if exists public.credit_wallet_from_payment(uuid, bigint, text, numeric);
create function public.credit_wallet_from_payment(
  p_user_id uuid, p_paid_pesewas bigint, p_reference text, p_fee_percent numeric default 3
)
returns table (credited boolean, credit numeric, balance numeric)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_guess   bigint;
  v_credit  bigint;
  v_c       bigint;
  v_rows    integer;
  v_balance numeric;
begin
  if p_user_id is null or p_reference is null or length(p_reference) < 4 then raise exception 'bad_request'; end if;
  if p_fee_percent is null or p_fee_percent < 0 or p_fee_percent > 10 then raise exception 'bad_fee'; end if;
  if p_paid_pesewas is null or p_paid_pesewas < 100 or p_paid_pesewas > 100000000 then raise exception 'bad_amount'; end if;

  -- The site charges credit + round(credit * fee%). Find the credit that adds up to what was paid.
  v_guess := round(p_paid_pesewas * 100.0 / (100 + p_fee_percent));
  v_credit := null;
  foreach v_c in array array[v_guess, v_guess - 1, v_guess + 1] loop
    if v_c + round(v_c * p_fee_percent / 100.0) = p_paid_pesewas then
      v_credit := v_c;
      exit;
    end if;
  end loop;
  -- Paid an amount the site would never charge: credit the nearest whole pesewa below, never more than was paid for.
  if v_credit is null then v_credit := floor(p_paid_pesewas * 100.0 / (100 + p_fee_percent)); end if;

  perform 1 from public.users where id = p_user_id for update;
  if not found then raise exception 'user_not_found'; end if;

  insert into public.wallet_transactions (user_id, amount, type, description, reference)
  values (p_user_id, v_credit / 100.0, 'credit', 'Wallet top-up', p_reference)
  on conflict (reference) where reference is not null do nothing;
  get diagnostics v_rows = row_count;

  if v_rows = 1 then
    update public.users set wallet_balance = wallet_balance + v_credit / 100.0
      where id = p_user_id returning wallet_balance into v_balance;
    update public.wallet_transactions set balance_after = v_balance where reference = p_reference;
    return query select true, v_credit / 100.0, v_balance;
    return;
  end if;

  -- This payment was already credited: change nothing, report the current balance.
  select wallet_balance into v_balance from public.users where id = p_user_id;
  return query select false, 0::numeric, v_balance;
end;
$$;

-- Take the price of a bundle from the wallet and create the order, in one step.
-- The price comes from the `bundles` table here, never from the request. Calling it again with the same reference
-- returns the same order and takes nothing more.
-- It never "fails" for an ordinary reason (not enough money, bundle switched off, ...): it answers with ok = false and an
-- error_code instead, so the automation can read the answer and show the customer a message. Codes: bad_request,
-- bad_phone, user_not_found, bundle_unavailable, duplicate_order, insufficient_balance.
drop function if exists public.place_wallet_order(uuid, bigint, text, text);
create function public.place_wallet_order(p_user_id uuid, p_bundle_id bigint, p_phone text, p_reference text)
returns table (ok boolean, error_code text, order_id text, network text, size text, amount numeric, balance numeric, already_exists boolean)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_bundle   public.bundles%rowtype;
  v_order    public.orders%rowtype;
  v_phone    text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_price    numeric;
  v_balance  numeric;
begin
  if p_user_id is null or p_bundle_id is null or p_reference is null or length(p_reference) < 4 then
    return query select false, 'bad_request', null::text, null::text, null::text, null::numeric, null::numeric, false;
    return;
  end if;
  if v_phone !~ '^(0[0-9]{9}|233[0-9]{9})$' then
    return query select false, 'bad_phone', null::text, null::text, null::text, null::numeric, null::numeric, false;
    return;
  end if;

  -- Everything for one customer happens one request at a time.
  perform 1 from public.users where id = p_user_id for update;
  if not found then
    return query select false, 'user_not_found', null::text, null::text, null::text, null::numeric, null::numeric, false;
    return;
  end if;

  -- The same request again: hand back the order that already exists.
  select * into v_order from public.orders o where o.order_id = p_reference;
  if found then
    if v_order.user_id is distinct from p_user_id then
      return query select false, 'bad_request', null::text, null::text, null::text, null::numeric, null::numeric, false;
      return;
    end if;
    select wallet_balance into v_balance from public.users where id = p_user_id;
    return query select true, null::text, v_order.order_id, v_order.network, v_order.size, v_order.amount, v_balance, true;
    return;
  end if;

  select * into v_bundle from public.bundles b where b.id = p_bundle_id and coalesce(b.is_active, true);
  if not found then
    return query select false, 'bundle_unavailable', null::text, null::text, null::text, null::numeric, null::numeric, false;
    return;
  end if;
  v_price := round(v_bundle.price, 2);

  -- A double tap or a retry sends the same purchase twice within seconds: refuse the second.
  if exists (
    select 1 from public.orders o
    where o.user_id = p_user_id and o.recipient_phone = v_phone and o.catalog_bundle_id = p_bundle_id
      and o.created_at > now() - interval '20 seconds' and o.status in ('processing', 'pending', 'completed')
  ) then
    return query select false, 'duplicate_order', null::text, null::text, null::text, null::numeric, null::numeric, false;
    return;
  end if;

  select wallet_balance into v_balance from public.users where id = p_user_id;
  if v_balance < v_price then
    return query select false, 'insufficient_balance', null::text, null::text, null::text, v_price, v_balance, false;
    return;
  end if;

  update public.users set wallet_balance = wallet_balance - v_price
    where id = p_user_id returning wallet_balance into v_balance;

  insert into public.wallet_transactions (user_id, amount, type, description, reference, balance_after)
  values (p_user_id, v_price, 'debit',
          initcap(v_bundle.network) || ' ' || v_bundle.size || ' data for ' || v_phone, p_reference, v_balance);

  insert into public.orders (user_id, reference, order_id, phone, recipient_phone, catalog_bundle_id, size, network, amount, status, payment_method)
  values (p_user_id, p_reference, p_reference, v_phone, v_phone, v_bundle.id, v_bundle.size, v_bundle.network, v_price, 'processing', 'wallet');

  return query select true, null::text, p_reference, v_bundle.network, v_bundle.size, v_price, v_balance, false;
end;
$$;

-- The data was delivered: mark the order completed.
drop function if exists public.complete_wallet_order(text);
create function public.complete_wallet_order(p_reference text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_rows integer;
begin
  update public.orders set status = 'completed' where order_id = p_reference and status in ('processing', 'pending');
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

-- The data could not be delivered: give the money back once, and mark the order failed.
drop function if exists public.refund_wallet_order(text);
create function public.refund_wallet_order(p_reference text)
returns table (refunded boolean, balance numeric)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_user    uuid;
  v_order   public.orders%rowtype;
  v_rows    integer;
  v_balance numeric;
begin
  select user_id into v_user from public.orders where order_id = p_reference;
  if v_user is null then raise exception 'order_not_found'; end if;

  perform 1 from public.users where id = v_user for update;
  select * into v_order from public.orders where order_id = p_reference for update;

  if v_order.status = 'completed' then raise exception 'order_already_completed'; end if;

  insert into public.wallet_transactions (user_id, amount, type, description, reference)
  values (v_user, v_order.amount, 'credit', 'Refund: ' || coalesce(v_order.size, '') || ' data order', 'refund-' || p_reference)
  on conflict (reference) where reference is not null do nothing;
  get diagnostics v_rows = row_count;

  if v_rows = 1 then
    update public.users set wallet_balance = wallet_balance + v_order.amount
      where id = v_user returning wallet_balance into v_balance;
    update public.wallet_transactions set balance_after = v_balance where reference = 'refund-' || p_reference;
  else
    select wallet_balance into v_balance from public.users where id = v_user;
  end if;

  update public.orders set status = 'failed' where order_id = p_reference;
  return query select v_rows = 1, v_balance;
end;
$$;

-- The data provider accepted the order: remember its reference. The order stays "processing" until the provider
-- confirms the data arrived (see settle_wallet_orders).
drop function if exists public.set_wallet_order_provider_ref(text, text);
create function public.set_wallet_order_provider_ref(p_reference text, p_provider_reference text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_rows integer;
begin
  if coalesce(p_provider_reference, '') = '' then return false; end if;
  update public.orders set provider_reference = p_provider_reference
    where order_id = p_reference and status = 'processing' and provider_reference is null;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

-- Settle many orders in one call, from what the data provider says: complete the delivered ones, refund the failed ones.
-- One bad item never stops the others. Running it again with the same lists changes nothing more.
drop function if exists public.settle_wallet_orders(text[], text[]);
create function public.settle_wallet_orders(p_complete text[], p_refund text[])
returns table (completed_count integer, refunded_count integer, skipped_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  r       text;
  v_c     integer := 0;
  v_r     integer := 0;
  v_s     integer := 0;
  v_done  boolean;
  v_paid  boolean;
begin
  foreach r in array coalesce(p_complete, '{}'::text[]) loop
    select public.complete_wallet_order(r) into v_done;
    if v_done then v_c := v_c + 1; else v_s := v_s + 1; end if;
  end loop;

  foreach r in array coalesce(p_refund, '{}'::text[]) loop
    begin
      select f.refunded into v_paid from public.refund_wallet_order(r) f;
      if v_paid then v_r := v_r + 1; else v_s := v_s + 1; end if;
    exception when others then
      v_s := v_s + 1;
    end;
  end loop;

  return query select v_c, v_r, v_s;
end;
$$;

-- Only your automations (they use the service key) may run these. The browser's public key cannot.
revoke all on function public.credit_wallet_from_payment(uuid, bigint, text, numeric) from public, anon, authenticated;
revoke all on function public.place_wallet_order(uuid, bigint, text, text)            from public, anon, authenticated;
revoke all on function public.complete_wallet_order(text)                             from public, anon, authenticated;
revoke all on function public.refund_wallet_order(text)                               from public, anon, authenticated;
revoke all on function public.set_wallet_order_provider_ref(text, text)               from public, anon, authenticated;
revoke all on function public.settle_wallet_orders(text[], text[])                    from public, anon, authenticated;
grant execute on function public.credit_wallet_from_payment(uuid, bigint, text, numeric) to service_role;
grant execute on function public.place_wallet_order(uuid, bigint, text, text)            to service_role;
grant execute on function public.complete_wallet_order(text)                             to service_role;
grant execute on function public.refund_wallet_order(text)                               to service_role;
grant execute on function public.set_wallet_order_provider_ref(text, text)               to service_role;
grant execute on function public.settle_wallet_orders(text[], text[])                    to service_role;

-- 4. Lock the tables --------------------------------------------------------------------------------------------------
-- A signed-in customer can create their own profile row and change their details, but whatever the browser sends,
-- the balance stays as the database has it.
create or replace function public.users_guard_balance()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.wallet_balance := 0;
    else
      new.wallet_balance := old.wallet_balance;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists users_guard_balance on public.users;
create trigger users_guard_balance before insert or update on public.users
  for each row execute function public.users_guard_balance();

-- Orders and wallet lines can be read (by their owner, below) but never written from the browser.
alter table public.wallet_transactions enable row level security;
alter table public.orders              enable row level security;
alter table public.users               enable row level security;

revoke all on public.wallet_transactions from anon;
revoke all on public.orders              from anon;
revoke all on public.users               from anon;
revoke insert, update, delete, truncate on public.wallet_transactions from authenticated;
revoke insert, update, delete, truncate on public.orders              from authenticated;
revoke delete, truncate                  on public.users               from authenticated;
grant select on public.wallet_transactions to authenticated;
grant select on public.orders              to authenticated;

drop policy if exists "Customers read their own wallet lines" on public.wallet_transactions;
create policy "Customers read their own wallet lines" on public.wallet_transactions
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "Customers read their own orders" on public.orders;
create policy "Customers read their own orders" on public.orders
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "Customers read their own profile" on public.users;
create policy "Customers read their own profile" on public.users
  for select to authenticated using (id = auth.uid());

-- 5. Check: every policy on these tables. None of them should let `anon` or `public` read users, orders or wallet lines.
select tablename, policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public' and tablename in ('users', 'orders', 'wallet_transactions')
order by tablename, policyname;
