-- PROJECT GALAXY · Supabase/PostgreSQL schema
-- Ejecutar completo en Supabase Dashboard > SQL Editor después de cada actualización del esquema.
-- Es idempotente para objetos y políticas; conserva los datos de negocio y limpia
-- únicamente chats de reuniones finalizadas, según la política de retención.

begin;

create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists supabase_vault with schema vault;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  username citext not null unique check (username::text ~ '^[a-z0-9_]{3,32}$'),
  avatar text not null default '',
  cover text not null default '',
  bio text not null default '' check (char_length(bio) <= 500),
  role text not null default 'USER' check (role in ('USER','CREATOR','SELLER','MODERATOR','ADMIN')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','SUSPENDED','DELETED')),
  level integer not null default 1 check (level >= 1),
  xp bigint not null default 0 check (xp >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  available_balance numeric(20,8) not null default 0 check (available_balance >= 0),
  pending_balance numeric(20,8) not null default 0 check (pending_balance >= 0),
  total_earned numeric(20,8) not null default 0 check (total_earned >= 0),
  total_spent numeric(20,8) not null default 0 check (total_spent >= 0),
  currency text not null default 'USDT',
  updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  is_secret boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.app_settings(key, value, is_secret) values
  ('ice_servers', '[{"urls":"stun:stun.l.google.com:19302"}]'::jsonb, false)
on conflict (key) do nothing;

create table if not exists public.membership_plans (
  code text primary key check (code in ('MONTHLY','QUARTERLY','SEMESTER','ANNUAL')),
  name text not null,
  duration_months integer not null check (duration_months in (1,3,6,12)),
  price_usd numeric(12,2) not null check (price_usd > 0),
  badge_tone text not null check (badge_tone in ('VIOLET','CYAN','AMBER','PLATINUM')),
  features jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.membership_plans(code,name,duration_months,price_usd,badge_tone,features,sort_order) values
  ('MONTHLY','Órbita mensual',1,80,'VIOLET','["Reuniones privadas","Sesiones LIVE","Chat y pantalla compartida"]'::jsonb,1),
  ('QUARTERLY','Nexo trimestral',3,250,'CYAN','["Reuniones privadas","Sesiones LIVE","Chat y pantalla compartida"]'::jsonb,2),
  ('SEMESTER','Horizonte semestral',6,499,'AMBER','["Reuniones privadas","Sesiones LIVE","Chat y pantalla compartida"]'::jsonb,3),
  ('ANNUAL','Constelación anual',12,999,'PLATINUM','["Reuniones privadas","Sesiones LIVE","Chat y pantalla compartida"]'::jsonb,4)
on conflict (code) do update set name=excluded.name,duration_months=excluded.duration_months,
  price_usd=excluded.price_usd,badge_tone=excluded.badge_tone,features=excluded.features,
  active=excluded.active,sort_order=excluded.sort_order,updated_at=now();

-- Server-controlled allowlist. It is never readable or writable by clients.
create table if not exists public.admin_access_allowlist (
  email citext primary key,
  created_at timestamptz not null default now()
);

insert into public.admin_access_allowlist(email) values ('elkin56ty@gmail.com')
on conflict (email) do nothing;

create table if not exists public.membership_payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_code text not null references public.membership_plans(code) on delete restrict,
  network text not null check (network in ('TRC20','ERC20')),
  provider text not null default 'NOWPAYMENTS' check (provider='NOWPAYMENTS'),
  provider_payment_id text unique,
  price_usd numeric(12,2) not null check (price_usd > 0),
  pay_amount numeric(36,18),
  actually_paid numeric(36,18) not null default 0,
  pay_currency text,
  pay_address text,
  status text not null default 'CREATING' check (status in ('CREATING','WAITING','CONFIRMING','CONFIRMED','SENDING','FINISHED','PARTIALLY_PAID','FAILED','REFUNDED','EXPIRED')),
  expires_at timestamptz,
  confirmed_at timestamptz,
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.memberships (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  plan_code text not null references public.membership_plans(code) on delete restrict,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','CANCELED','EXPIRED')),
  starts_at timestamptz not null,
  expires_at timestamptz not null check (expires_at > starts_at),
  source_order_id uuid references public.membership_payment_orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Direct, on-chain USDT commerce. The browser can read only its own orders;
-- creation and confirmation are reserved for the crypto-payments Edge Function.
create table if not exists public.digital_products (
  code text primary key check (code ~ '^[A-Z0-9_]{3,64}$'),
  name text not null,
  description text not null default '',
  price_usd numeric(12,2) not null check (price_usd > 0),
  storage_bucket text not null,
  storage_path text not null,
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.digital_products(code,name,description,price_usd,storage_bucket,storage_path,sort_order) values
  ('SCANNER_POWER_ELITE','Scanner Power Elite','Indicador privado para TradingView entregado como archivo Pine Script.',1000,'premium-downloads','SCANNER-POWER-ELITE.pine',1)
on conflict (code) do update set name=excluded.name,description=excluded.description,price_usd=excluded.price_usd,
  storage_bucket=excluded.storage_bucket,storage_path=excluded.storage_path,active=true,sort_order=excluded.sort_order,updated_at=now();

create table if not exists public.crypto_payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_type text not null check (item_type in ('MEMBERSHIP','PRODUCT')),
  plan_code text references public.membership_plans(code) on delete restrict,
  product_code text references public.digital_products(code) on delete restrict,
  network text not null check (network in ('TRC20','ERC20')),
  destination_address text not null,
  price_usd numeric(12,2) not null check (price_usd > 0),
  expected_amount numeric(20,6) not null check (expected_amount > 0),
  tx_hash text,
  status text not null default 'AWAITING_PAYMENT' check (status in ('AWAITING_PAYMENT','VERIFYING','CONFIRMED','FAILED','EXPIRED')),
  confirmations integer not null default 0 check (confirmations >= 0),
  verified_amount numeric(20,6),
  chain_payload jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null default (now() + interval '45 minutes'),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((item_type='MEMBERSHIP' and plan_code is not null and product_code is null)
    or (item_type='PRODUCT' and product_code is not null and plan_code is null))
);

create unique index if not exists crypto_payment_tx_unique on public.crypto_payment_orders(network,lower(tx_hash)) where tx_hash is not null;
create unique index if not exists crypto_payment_open_amount_unique on public.crypto_payment_orders(network,destination_address,expected_amount)
  where status in ('AWAITING_PAYMENT','VERIFYING');
create index if not exists crypto_payment_user_created_idx on public.crypto_payment_orders(user_id,created_at desc);

create table if not exists public.product_entitlements (
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_code text not null references public.digital_products(code) on delete restrict,
  source_order_id uuid not null references public.crypto_payment_orders(id) on delete restrict,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key(user_id,product_code)
);

create table if not exists public.product_download_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_code text not null references public.digital_products(code) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.memberships add column if not exists source_crypto_order_id uuid references public.crypto_payment_orders(id) on delete set null;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('premium-downloads','premium-downloads',false,1048576,array['text/plain','application/octet-stream'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete restrict,
  room_code text not null unique check (room_code ~ '^[A-F0-9]{4}-[A-F0-9]{4}$'),
  password_hash text,
  title text not null check (char_length(title) between 1 and 140),
  waiting_room boolean not null default true,
  locked boolean not null default false,
  permissions jsonb not null default '{"screenShare":"ALL","chat":true,"reactions":true,"hostCanMute":true}'::jsonb,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ENDED')),
  starts_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meeting_participants (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'PARTICIPANT' check (role in ('HOST','PARTICIPANT')),
  status text not null default 'WAITING' check (status in ('INVITED','WAITING','ADMITTED','DENIED')),
  joined_at timestamptz,
  left_at timestamptz,
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(meeting_id, user_id)
);

create table if not exists public.meeting_invitations (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','DECLINED')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique(meeting_id, invitee_id)
);

create table if not exists public.meeting_messages (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (char_length(body) between 1 and 2000),
  reply_to_id uuid references public.meeting_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create table if not exists public.meeting_message_reactions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  message_id uuid not null references public.meeting_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('👍','👏','❤️','😂','🎉','🔥')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(message_id, user_id, emoji)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null default '',
  resource_type text not null default '',
  resource_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.notifications add column if not exists actor_id uuid references public.profiles(id) on delete cascade;

create table if not exists public.meeting_commands (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  issuer_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  command text not null check (command in ('MUTE')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 seconds'),
  consumed_at timestamptz
);

create index if not exists meetings_host_created_idx on public.meetings(host_id, created_at desc);
create index if not exists participants_user_status_idx on public.meeting_participants(user_id, status, meeting_id);
create index if not exists participants_meeting_status_idx on public.meeting_participants(meeting_id, status);
create index if not exists messages_meeting_created_idx on public.meeting_messages(meeting_id, created_at desc);
create index if not exists messages_sender_created_idx on public.meeting_messages(sender_id, created_at desc);
create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc) where read_at is null;
create index if not exists notifications_user_type_idx on public.notifications(user_id, type, created_at desc);
create index if not exists meeting_commands_target_idx on public.meeting_commands(target_user_id, created_at desc) where consumed_at is null;
create index if not exists membership_orders_user_created_idx on public.membership_payment_orders(user_id, created_at desc);
create index if not exists membership_orders_provider_idx on public.membership_payment_orders(provider_payment_id) where provider_payment_id is not null;
create index if not exists memberships_expiry_idx on public.memberships(expires_at) where status='ACTIVE';

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles for each row execute function public.touch_updated_at();
drop trigger if exists meetings_touch_updated_at on public.meetings;
create trigger meetings_touch_updated_at before update on public.meetings for each row execute function public.touch_updated_at();
drop trigger if exists participants_touch_updated_at on public.meeting_participants;
create trigger participants_touch_updated_at before update on public.meeting_participants for each row execute function public.touch_updated_at();
drop trigger if exists reactions_touch_updated_at on public.meeting_message_reactions;
create trigger reactions_touch_updated_at before update on public.meeting_message_reactions for each row execute function public.touch_updated_at();
drop trigger if exists membership_plans_touch_updated_at on public.membership_plans;
create trigger membership_plans_touch_updated_at before update on public.membership_plans for each row execute function public.touch_updated_at();
drop trigger if exists membership_orders_touch_updated_at on public.membership_payment_orders;
create trigger membership_orders_touch_updated_at before update on public.membership_payment_orders for each row execute function public.touch_updated_at();
drop trigger if exists memberships_touch_updated_at on public.memberships;
create trigger memberships_touch_updated_at before update on public.memberships for each row execute function public.touch_updated_at();
drop trigger if exists digital_products_touch_updated_at on public.digital_products;
create trigger digital_products_touch_updated_at before update on public.digital_products for each row execute function public.touch_updated_at();
drop trigger if exists crypto_payment_orders_touch_updated_at on public.crypto_payment_orders;
create trigger crypto_payment_orders_touch_updated_at before update on public.crypto_payment_orders for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
  v_username text;
  v_username_base text;
  v_suffix text;
  v_role text := 'USER';
begin
  v_suffix:=substr(replace(new.id::text,'-',''),1,10);
  v_name:=coalesce(nullif(trim(new.raw_user_meta_data->>'name'),''),nullif(trim(split_part(coalesce(new.email,''),'@',1)),''),'Usuario Galaxy');
  if char_length(v_name)<2 then v_name:='Usuario Galaxy'; end if;

  v_username_base:=lower(coalesce(nullif(trim(new.raw_user_meta_data->>'username'),''),split_part(coalesce(new.email,''),'@',1),''));
  v_username_base:=regexp_replace(v_username_base,'[^a-z0-9_]+','_','g');
  v_username_base:=trim(both '_' from v_username_base);
  if char_length(v_username_base)<3 then v_username_base:='galaxy_'||v_suffix; end if;
  v_username:=left(v_username_base,32);
  if exists(select 1 from public.admin_access_allowlist a where a.email=coalesce(new.email,'')) then
    v_role:='ADMIN';
  end if;
  begin
    insert into public.profiles(id,name,username,role) values(new.id,left(v_name,100),v_username,v_role);
  exception when unique_violation then
    v_username:=left(v_username_base,21)||'_'||v_suffix;
    insert into public.profiles(id,name,username,role) values(new.id,left(v_name,100),v_username,v_role);
  end;
  insert into public.wallets(user_id) values (new.id);
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Applies the same protected administrator role to the existing account.
update public.profiles profile
set role='ADMIN'
from auth.users account
join public.admin_access_allowlist admin on admin.email=account.email
where profile.id=account.id and profile.role<>'ADMIN';

create or replace function public.require_user() returns uuid
language plpgsql stable security definer set search_path = public, auth as $$
declare v_user uuid := auth.uid();
begin if v_user is null then raise exception 'Inicia sesión para continuar.' using errcode = 'P0001'; end if; return v_user; end; $$;

-- Server-only bridge between encrypted Supabase Vault values and the TURN Edge
-- Function. Execution is granted exclusively to service_role at the end.
create or replace function public.get_turn_provider_config() returns jsonb
language sql stable security definer set search_path=public,vault as $$
  select jsonb_build_object(
    'keyId',max(decrypted_secret) filter(where name='cloudflare_turn_key_id'),
    'apiToken',max(decrypted_secret) filter(where name='cloudflare_turn_api_token'),
    'ttlSeconds',coalesce(
      nullif(max(decrypted_secret) filter(where name='turn_credential_ttl_seconds'),'')::integer,
      43200
    )
  )
  from vault.decrypted_secrets
  where name in ('cloudflare_turn_key_id','cloudflare_turn_api_token','turn_credential_ttl_seconds');
$$;

create or replace function public.membership_view(p_user_id uuid) returns jsonb
language sql stable security definer set search_path=public as $$
  select case when account.role='ADMIN' and account.status='ACTIVE' then jsonb_build_object(
    'isActive',true,'isLifetime',true,'status','ADMIN','planCode','ADMIN',
    'planName','Acceso administrativo','badgeTone','PLATINUM','remainingSeconds',null
  ) when m.user_id is null then jsonb_build_object('isActive',false) else jsonb_build_object(
    'isActive',m.status='ACTIVE' and m.expires_at>now(),'status',case when m.status='ACTIVE' and m.expires_at<=now() then 'EXPIRED' else m.status end,
    'planCode',m.plan_code,'planName',p.name,'badgeTone',p.badge_tone,'startsAt',m.starts_at,
    'expiresAt',m.expires_at,'remainingSeconds',greatest(0,floor(extract(epoch from m.expires_at-now())))::bigint
  ) end
  from (select p_user_id user_id) requested
  left join public.profiles account on account.id=requested.user_id
  left join public.memberships m on m.user_id=requested.user_id
  left join public.membership_plans p on p.code=m.plan_code;
$$;

create or replace function public.has_active_membership(p_user_id uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=public,auth as $$
  -- Temporary community-open mode: every registered, active account can use
  -- meetings and LIVE. The legacy function name is retained for RPC compatibility.
  select exists(select 1 from public.profiles where id=p_user_id and status='ACTIVE');
$$;

create or replace function public.require_active_membership() returns uuid
language plpgsql stable security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_user();
begin
  if not public.has_active_membership(v_user) then
    raise exception 'Tu cuenta debe estar activa para acceder a reuniones y sesiones LIVE.' using errcode='P0001';
  end if;
  return v_user;
end; $$;

create or replace function public.get_membership_center() returns jsonb
language sql stable security definer set search_path=public,auth as $$
  with me as (select public.require_user() id)
  select jsonb_build_object(
    'membership',public.membership_view(me.id),
    'plans',coalesce((select jsonb_agg(jsonb_build_object(
      'code',p.code,'name',p.name,'durationMonths',p.duration_months,'priceUsd',p.price_usd,
      'badgeTone',p.badge_tone,'features',p.features
    ) order by p.sort_order) from public.membership_plans p where p.active),'[]'::jsonb),
    'orders',coalesce((select jsonb_agg(jsonb_build_object(
      'id',o.id,'planCode',o.plan_code,'network',o.network,'providerPaymentId',o.provider_payment_id,
      'priceUsd',o.price_usd,'payAmount',o.pay_amount,'actuallyPaid',o.actually_paid,
      'payCurrency',o.pay_currency,'payAddress',o.pay_address,'status',o.status,
      'expiresAt',o.expires_at,'confirmedAt',o.confirmed_at,'createdAt',o.created_at
    ) order by o.created_at desc) from (select * from public.membership_payment_orders where user_id=me.id order by created_at desc limit 20) o),'[]'::jsonb)
  ) from me;
$$;

create or replace function public.activate_membership_from_payment(
  p_order_id uuid,p_provider_payment_id text,p_provider_status text,p_actually_paid numeric,p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare
  v_order public.membership_payment_orders; v_plan public.membership_plans; v_existing public.memberships;
  v_status text:=upper(trim(coalesce(p_provider_status,''))); v_currency text; v_start timestamptz; v_expires timestamptz;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Operación reservada al procesador de pagos.' using errcode='42501'; end if;
  select * into v_order from public.membership_payment_orders where id=p_order_id for update;
  if v_order.id is null or v_order.provider_payment_id is distinct from p_provider_payment_id then raise exception 'La orden de pago no coincide.' using errcode='P0001'; end if;
  select * into v_plan from public.membership_plans where code=v_order.plan_code and active;
  if v_plan.code is null then raise exception 'El plan ya no está disponible.' using errcode='P0001'; end if;
  v_currency:=case when v_order.network='TRC20' then 'usdttrc20' else 'usdterc20' end;

  if v_status='FINISHED' then
    if lower(coalesce(p_payload->>'pay_currency',''))<>v_currency
      or coalesce(p_payload->>'order_id','')<>v_order.id::text
      or nullif(p_payload->>'parent_payment_id','') is not null
      or coalesce(p_actually_paid,0)<coalesce(v_order.pay_amount,0) then
      raise exception 'El activo, la red o el importe recibido no coincide con la orden.' using errcode='P0001';
    end if;
    if v_order.status='FINISHED' then return public.membership_view(v_order.user_id); end if;
    select * into v_existing from public.memberships where user_id=v_order.user_id for update;
    v_start:=case when v_existing.status='ACTIVE' and v_existing.expires_at>now() then v_existing.expires_at else now() end;
    v_expires:=v_start+make_interval(months=>v_plan.duration_months);
    insert into public.memberships(user_id,plan_code,status,starts_at,expires_at,source_order_id)
    values(v_order.user_id,v_plan.code,'ACTIVE',case when v_existing.user_id is null or v_existing.expires_at<=now() then now() else v_existing.starts_at end,v_expires,v_order.id)
    on conflict(user_id) do update set plan_code=excluded.plan_code,status='ACTIVE',
      starts_at=case when public.memberships.expires_at>now() then public.memberships.starts_at else now() end,
      expires_at=excluded.expires_at,source_order_id=excluded.source_order_id;
    update public.membership_payment_orders set status='FINISHED',actually_paid=coalesce(p_actually_paid,0),
      confirmed_at=coalesce(confirmed_at,now()),provider_payload=coalesce(p_payload,'{}'::jsonb) where id=v_order.id;
    update public.wallets set total_spent=total_spent+v_order.price_usd where user_id=v_order.user_id;
    insert into public.notifications(user_id,type,title,body,resource_type,resource_id)
    values(v_order.user_id,'MEMBERSHIP_ACTIVATED','Tu membresía está activa',v_plan.name||' · acceso hasta '||to_char(v_expires,'YYYY-MM-DD'),'Membership',v_order.id);
  else
    update public.membership_payment_orders set status=case when v_status in ('WAITING','CONFIRMING','CONFIRMED','SENDING','PARTIALLY_PAID','FAILED','REFUNDED','EXPIRED') then v_status else status end,
      actually_paid=greatest(actually_paid,coalesce(p_actually_paid,0)),provider_payload=coalesce(p_payload,'{}'::jsonb) where id=v_order.id;
  end if;
  return public.membership_view(v_order.user_id);
end; $$;

create or replace function public.get_crypto_store() returns jsonb
language sql stable security definer set search_path=public,auth as $$
  with me as (select public.require_user() id)
  select jsonb_build_object(
    'products',coalesce((select jsonb_agg(jsonb_build_object(
      'code',p.code,'name',p.name,'description',p.description,'priceUsd',p.price_usd,
      'owned',exists(select 1 from public.product_entitlements e where e.user_id=me.id and e.product_code=p.code and e.revoked_at is null)
    ) order by p.sort_order) from public.digital_products p
      where p.active and exists(select 1 from public.profiles viewer where viewer.id=me.id and viewer.role='ADMIN' and viewer.status='ACTIVE')),'[]'::jsonb),
    'orders',coalesce((select jsonb_agg(jsonb_build_object(
      'id',o.id,'itemType',o.item_type,'itemCode',coalesce(o.plan_code,o.product_code),'network',o.network,
      'priceUsd',o.price_usd,'payAmount',o.expected_amount,'payCurrency','USDT','payAddress',o.destination_address,
      'txHash',o.tx_hash,'status',o.status,'confirmations',o.confirmations,'expiresAt',o.expires_at,
      'confirmedAt',o.confirmed_at,'createdAt',o.created_at
    ) order by o.created_at desc) from (select * from public.crypto_payment_orders where user_id=me.id order by created_at desc limit 30) o),'[]'::jsonb)
  ) from me;
$$;

create or replace function public.confirm_crypto_payment(
  p_order_id uuid,p_tx_hash text,p_confirmations integer,p_verified_amount numeric,p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare
  v_order public.crypto_payment_orders; v_plan public.membership_plans; v_existing public.memberships;
  v_start timestamptz; v_expires timestamptz;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Operación reservada al verificador blockchain.' using errcode='42501'; end if;
  select * into v_order from public.crypto_payment_orders where id=p_order_id for update;
  if v_order.id is null then raise exception 'La orden no existe.' using errcode='P0001'; end if;
  if v_order.status='CONFIRMED' then
    return jsonb_build_object('orderId',v_order.id,'status','CONFIRMED','membership',public.membership_view(v_order.user_id),
      'productCode',v_order.product_code,'downloadReady',v_order.product_code is not null);
  end if;
  if v_order.expires_at<now() then
    update public.crypto_payment_orders set status='EXPIRED',chain_payload=coalesce(p_payload,'{}'::jsonb) where id=v_order.id;
    raise exception 'La orden expiró; crea una nueva antes de pagar.' using errcode='P0001';
  end if;
  if coalesce(p_verified_amount,0)<>v_order.expected_amount then raise exception 'El importe recibido no coincide exactamente con la orden.' using errcode='P0001'; end if;
  if nullif(trim(coalesce(p_tx_hash,'')),'') is null then raise exception 'Falta el hash de la transacción.' using errcode='P0001'; end if;

  update public.crypto_payment_orders set tx_hash=lower(trim(p_tx_hash)),status='CONFIRMED',confirmations=greatest(0,coalesce(p_confirmations,0)),
    verified_amount=p_verified_amount,confirmed_at=now(),chain_payload=coalesce(p_payload,'{}'::jsonb) where id=v_order.id;

  if v_order.item_type='MEMBERSHIP' then
    select * into v_plan from public.membership_plans where code=v_order.plan_code and active;
    if v_plan.code is null then raise exception 'El plan ya no está disponible.' using errcode='P0001'; end if;
    select * into v_existing from public.memberships where user_id=v_order.user_id for update;
    v_start:=case when v_existing.status='ACTIVE' and v_existing.expires_at>now() then v_existing.expires_at else now() end;
    v_expires:=v_start+make_interval(months=>v_plan.duration_months);
    insert into public.memberships(user_id,plan_code,status,starts_at,expires_at,source_crypto_order_id)
    values(v_order.user_id,v_plan.code,'ACTIVE',case when v_existing.user_id is null or v_existing.expires_at<=now() then now() else v_existing.starts_at end,v_expires,v_order.id)
    on conflict(user_id) do update set plan_code=excluded.plan_code,status='ACTIVE',
      starts_at=case when public.memberships.expires_at>now() then public.memberships.starts_at else now() end,
      expires_at=excluded.expires_at,source_crypto_order_id=excluded.source_crypto_order_id;
    insert into public.notifications(user_id,type,title,body,resource_type,resource_id)
    values(v_order.user_id,'MEMBERSHIP_ACTIVATED','Tu membresía está activa',v_plan.name||' · acceso hasta '||to_char(v_expires,'YYYY-MM-DD'),'CryptoPayment',v_order.id);
  else
    insert into public.product_entitlements(user_id,product_code,source_order_id)
    values(v_order.user_id,v_order.product_code,v_order.id)
    on conflict(user_id,product_code) do update set source_order_id=excluded.source_order_id,granted_at=now(),revoked_at=null;
    insert into public.notifications(user_id,type,title,body,resource_type,resource_id)
    values(v_order.user_id,'PRODUCT_ACTIVATED','Tu Scanner está listo','La descarga privada de Scanner Power Elite fue habilitada.','CryptoPayment',v_order.id);
  end if;
  update public.wallets set total_spent=total_spent+v_order.price_usd where user_id=v_order.user_id;
  return jsonb_build_object('orderId',v_order.id,'status','CONFIRMED','membership',public.membership_view(v_order.user_id),
    'productCode',v_order.product_code,'downloadReady',v_order.product_code is not null);
exception when unique_violation then
  raise exception 'Esta transacción ya fue utilizada en otra orden.' using errcode='P0001';
end; $$;

create or replace function public.is_admitted_to_meeting(p_meeting_id uuid) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select public.has_active_membership(auth.uid()) and exists(select 1 from public.meeting_participants where meeting_id = p_meeting_id and user_id = auth.uid() and status = 'ADMITTED');
$$;

-- Mantiene la autorización de canales privados rápida y aislada de las políticas
-- RLS de las tablas de negocio. También permite precalentar el WebSocket por usuario.
create or replace function public.can_access_realtime_topic(p_topic text,p_extension text) returns boolean
language sql stable security definer set search_path=public,auth as $$
  select p_extension in ('broadcast','presence') and (
    p_topic='user:'||(select auth.uid())::text
    or p_topic like 'db:notifications:'||(select auth.uid())::text||':%'
    or (public.has_active_membership((select auth.uid())) and exists(
      select 1 from public.meeting_participants p
      where p.user_id=(select auth.uid()) and (
        (p.status='ADMITTED' and p_topic='meeting:'||p.meeting_id::text)
        or (p.status<>'DENIED' and p_topic like 'db:participants:'||p.meeting_id::text||':%')
      )
    ))
  );
$$;

create or replace function public.meeting_summary(p_meeting public.meetings, p_user uuid) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('id', p_meeting.id, 'meetingId', p_meeting.id, 'title', p_meeting.title,
    'roomCode', p_meeting.room_code, 'status', p_meeting.status, 'waitingRoom', p_meeting.waiting_room,
    'locked', p_meeting.locked, 'host', p_meeting.host_id = p_user, 'hostId', p_meeting.host_id,
    'startsAt', p_meeting.starts_at, 'endedAt', p_meeting.ended_at);
$$;

create or replace function public.get_current_user() returns jsonb
language sql stable security definer set search_path = public, auth as $$
  select jsonb_build_object('id', p.id, 'name', p.name, 'username', p.username, 'email', u.email,
    'bio', p.bio, 'role', p.role, 'level', p.level, 'xp', p.xp, 'status', p.status,
    'createdAt', p.created_at, 'emailVerified', u.email_confirmed_at is not null,
    'membership',public.membership_view(p.id),
    'wallet',coalesce((select jsonb_build_object('availableBalance',w.available_balance,'pendingBalance',w.pending_balance,
      'totalEarned',w.total_earned,'totalSpent',w.total_spent,'currency',w.currency) from public.wallets w where w.user_id=p.id),
      jsonb_build_object('availableBalance',0,'pendingBalance',0,'totalEarned',0,'totalSpent',0,'currency','USDT')))
  from public.profiles p join auth.users u on u.id = p.id where p.id = public.require_user();
$$;

create or replace function public.update_profile(p_name text,p_username text,p_bio text default '') returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_user(); v_name text:=trim(coalesce(p_name,'')); v_username text:=lower(trim(coalesce(p_username,''))); v_bio text:=trim(coalesce(p_bio,''));
begin
  if char_length(v_name) not between 2 and 100 then raise exception 'El nombre debe tener entre 2 y 100 caracteres.' using errcode='P0001'; end if;
  if v_username !~ '^[a-z0-9_]{3,32}$' then raise exception 'El usuario debe tener entre 3 y 32 caracteres: letras minúsculas, números o guion bajo.' using errcode='P0001'; end if;
  if char_length(v_bio)>500 then raise exception 'La biografía no puede superar los 500 caracteres.' using errcode='P0001'; end if;
  begin
    update public.profiles set name=v_name,username=v_username,bio=v_bio where id=v_user and status='ACTIVE';
  exception when unique_violation then
    raise exception 'Ese nombre de usuario ya está en uso.' using errcode='P0001';
  end;
  if not found then raise exception 'Tu perfil no está disponible para edición.' using errcode='P0001'; end if;
  return public.get_current_user();
end; $$;

create or replace function public.get_bootstrap_data(p_modules text[] default array['user']) returns jsonb
language sql stable security definer set search_path = public, auth as $$
  select jsonb_build_object('generatedAt', now(), 'user', public.get_current_user());
$$;

create or replace function public.get_my_notifications(p_limit integer default 30) returns jsonb
language sql stable security definer set search_path=public,auth as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',notice.id,'type',notice.type,'title',notice.title,'body',notice.body,
    'resourceId',notice.resource_id,'actorId',notice.actor_id,'readAt',notice.read_at,
    'createdAt',notice.created_at,'meetingId',notice.meeting_id,'meetingTitle',notice.meeting_title,
    'roomCode',notice.room_code,'meetingStatus',notice.meeting_status,
    'participantId',notice.participant_id,'invitationId',notice.invitation_id,
    'invitationStatus',notice.invitation_status
  ) order by notice.created_at desc),'[]'::jsonb)
  from (
    select n.*,m.id meeting_id,m.title meeting_title,m.room_code,m.status meeting_status,
      mp.id participant_id,mi.id invitation_id,mi.status invitation_status
    from public.notifications n
    left join public.meetings m on m.id=n.resource_id and n.resource_type='Meeting'
    left join public.meeting_participants mp on n.type='MEETING_JOIN_REQUEST'
      and mp.meeting_id=n.resource_id and mp.user_id=n.actor_id
    left join public.meeting_invitations mi on n.type='MEETING_INVITE'
      and mi.meeting_id=n.resource_id and mi.invitee_id=n.user_id
    where n.user_id=public.require_user()
    order by n.created_at desc
    limit greatest(1,least(coalesce(p_limit,30),100))
  ) notice;
$$;

create or replace function public.mark_notification_read(p_notification_id uuid) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_user();
begin
  update public.notifications set read_at=coalesce(read_at,now()) where id=p_notification_id and user_id=v_user;
  if not found then raise exception 'No encontramos esa notificación.' using errcode='P0001'; end if;
  return jsonb_build_object('id',p_notification_id,'read',true);
end; $$;

create or replace function public.mark_all_notifications_read() returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_user(); v_count integer:=0;
begin
  update public.notifications set read_at=now() where user_id=v_user and read_at is null;
  get diagnostics v_count=row_count;
  return jsonb_build_object('updated',v_count);
end; $$;

create or replace function public.create_meeting(p_title text, p_password text default '', p_waiting_room boolean default true) returns jsonb
language plpgsql security definer set search_path = public, auth, extensions as $$
declare v_user uuid := public.require_active_membership(); v_meeting public.meetings; v_code text; v_ice jsonb;
begin
  if char_length(trim(p_title)) not between 1 and 140 then raise exception 'Ingresa un título válido.' using errcode = 'P0001'; end if;
  if coalesce(p_password, '') <> '' and char_length(p_password) < 6 then raise exception 'La contraseña debe tener al menos 6 caracteres.' using errcode = 'P0001'; end if;
  loop v_code := upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 4) || '-' || substr(encode(gen_random_bytes(4), 'hex'), 1, 4)); exit when not exists(select 1 from public.meetings where room_code = v_code); end loop;
  insert into public.meetings(host_id, room_code, password_hash, title, waiting_room)
  values(v_user, v_code, case when coalesce(p_password, '') = '' then null else crypt(p_password, gen_salt('bf', 10)) end, trim(p_title), coalesce(p_waiting_room, true)) returning * into v_meeting;
  insert into public.meeting_participants(meeting_id, user_id, role, status, joined_at) values(v_meeting.id, v_user, 'HOST', 'ADMITTED', now());
  select value into v_ice from public.app_settings where key='ice_servers';
  return public.meeting_summary(v_meeting,v_user)||jsonb_build_object(
    'role','HOST','participantStatus','ADMITTED','iceServers',coalesce(v_ice,'[]'::jsonb),'messages','[]'::jsonb
  );
end; $$;

create or replace function public.message_view(p_message public.meeting_messages, p_viewer uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', p_message.id, 'meetingId', p_message.meeting_id, 'senderId', p_message.sender_id,
    'senderName', p.name, 'senderUsername', p.username, 'body', case when p_message.deleted_at is null then p_message.body else 'Mensaje eliminado' end,
    'replyToId', p_message.reply_to_id, 'createdAt', p_message.created_at,
    'reactions', coalesce((select jsonb_agg(x order by x->>'emoji') from (
      select jsonb_build_object('emoji', r.emoji, 'count', count(*), 'mine', bool_or(r.user_id = p_viewer)) x
      from public.meeting_message_reactions r where r.message_id = p_message.id and r.active group by r.emoji
    ) q), '[]'::jsonb)) from public.profiles p where p.id = p_message.sender_id;
$$;

create or replace function public.get_meeting_messages(p_meeting_id uuid, p_limit integer default 100) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare v_user uuid := public.require_user(); v_result jsonb;
begin
  if not public.is_admitted_to_meeting(p_meeting_id) then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(public.message_view(m, v_user) order by m.created_at), '[]'::jsonb) into v_result
  from (select * from public.meeting_messages where meeting_id = p_meeting_id order by created_at desc limit greatest(1, least(coalesce(p_limit,100),100))) m;
  return v_result;
end; $$;

create or replace function public.get_meeting_message(p_meeting_id uuid,p_message_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_user(); v_message public.meeting_messages;
begin
  if not public.is_admitted_to_meeting(p_meeting_id) then return null; end if;
  select * into v_message from public.meeting_messages where id=p_message_id and meeting_id=p_meeting_id;
  if v_message.id is null then return null; end if;
  return public.message_view(v_message,v_user);
end; $$;

create or replace function public.join_meeting(p_room_code text, p_password text default '') returns jsonb
language plpgsql security definer set search_path = public, auth, extensions as $$
declare v_user uuid := public.require_active_membership(); v_meeting public.meetings; v_member public.meeting_participants; v_status text; v_role text; v_ice jsonb;
begin
  select * into v_meeting from public.meetings where room_code = upper(trim(p_room_code));
  if v_meeting.id is null or v_meeting.status = 'ENDED' then raise exception 'La sala no existe o ya terminó.' using errcode = 'P0001'; end if;
  select * into v_member from public.meeting_participants where meeting_id = v_meeting.id and user_id = v_user;
  if v_meeting.host_id <> v_user and v_meeting.locked then raise exception 'La sala está bloqueada por el anfitrión.' using errcode = 'P0001'; end if;
  if v_meeting.host_id <> v_user and v_member.id is null and v_meeting.password_hash is not null and crypt(coalesce(p_password,''), v_meeting.password_hash) <> v_meeting.password_hash then raise exception 'La contraseña de la sala no coincide.' using errcode = 'P0001'; end if;
  v_role := case when v_meeting.host_id = v_user then 'HOST' else 'PARTICIPANT' end;
  v_status := case when v_meeting.host_id = v_user then 'ADMITTED' when v_member.status = 'DENIED' then 'DENIED' when v_member.status = 'ADMITTED' then 'ADMITTED' when v_meeting.waiting_room then 'WAITING' else 'ADMITTED' end;
  if v_status = 'DENIED' then raise exception 'El anfitrión no autorizó tu ingreso.' using errcode = 'P0001'; end if;
  insert into public.meeting_participants(meeting_id,user_id,role,status,joined_at,left_at)
  values(v_meeting.id,v_user,v_role,v_status,case when v_status='ADMITTED' then now() end,null)
  on conflict(meeting_id,user_id) do update set status=excluded.status, joined_at=coalesce(public.meeting_participants.joined_at,excluded.joined_at), left_at=null
  returning * into v_member;
  if v_status='WAITING' and not exists(
    select 1 from public.notifications where user_id=v_meeting.host_id and actor_id=v_user
      and type='MEETING_JOIN_REQUEST' and resource_id=v_meeting.id and read_at is null
  ) then
    insert into public.notifications(user_id,actor_id,type,title,body,resource_type,resource_id)
    select v_meeting.host_id,v_user,'MEETING_JOIN_REQUEST',p.name||' solicita entrar',
      v_meeting.title||' · '||v_meeting.room_code,'Meeting',v_meeting.id
    from public.profiles p where p.id=v_user;
  end if;
  select value into v_ice from public.app_settings where key = 'ice_servers';
  return public.meeting_summary(v_meeting,v_user) || jsonb_build_object('role',v_role,'participantStatus',v_status,
    'iceServers',coalesce(v_ice,'[]'::jsonb),'messages',case when v_status='ADMITTED' then public.get_meeting_messages(v_meeting.id,100) else '[]'::jsonb end);
end; $$;

create or replace function public.get_my_meetings() returns jsonb
language sql stable security definer set search_path = public, auth as $$
  with me as (select public.require_active_membership() id), visible as (
    select m as meeting, m.created_at, me.id as user_id from public.meetings m cross join me
    left join public.meeting_participants p on p.meeting_id=m.id and p.user_id=me.id
    where m.host_id=me.id or (p.user_id=me.id and p.status<>'DENIED') order by m.created_at desc limit 40)
  select coalesce(jsonb_agg(public.meeting_summary(meeting, user_id) order by created_at desc),'[]'::jsonb) from visible;
$$;

create or replace function public.get_meeting_state(p_meeting_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare v_user uuid:=public.require_active_membership(); v_meeting public.meetings; v_member public.meeting_participants; v_waiting jsonb:='[]'::jsonb;
begin
  select * into v_meeting from public.meetings where id=p_meeting_id; select * into v_member from public.meeting_participants where meeting_id=p_meeting_id and user_id=v_user and status<>'DENIED';
  if v_meeting.id is null or (v_meeting.host_id<>v_user and v_member.id is null) then raise exception 'No perteneces a esta reunión.' using errcode='P0001'; end if;
  if v_meeting.host_id=v_user then select coalesce(jsonb_agg(jsonb_build_object('id',mp.id,'userId',mp.user_id,'name',p.name,'username',p.username,'avatar',p.avatar)),'[]'::jsonb) into v_waiting from public.meeting_participants mp join public.profiles p on p.id=mp.user_id where mp.meeting_id=p_meeting_id and mp.status='WAITING'; end if;
  return public.meeting_summary(v_meeting,v_user)||jsonb_build_object('role',case when v_meeting.host_id=v_user then 'HOST' else v_member.role end,'participantStatus',coalesce(v_member.status,'ADMITTED'),'waitingParticipants',v_waiting);
end; $$;

create or replace function public.update_admission(p_meeting_id uuid,p_participant_id uuid,p_status text) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_active_membership(); v_participant public.meeting_participants;
begin
  if p_status not in ('ADMITTED','DENIED') then raise exception 'Estado de admisión inválido.' using errcode='P0001'; end if;
  if not exists(select 1 from public.meetings where id=p_meeting_id and host_id=v_user and status='ACTIVE') then raise exception 'Solo el anfitrión puede realizar esta acción.' using errcode='P0001'; end if;
  if p_status='ADMITTED' and not exists(select 1 from public.meeting_participants where id=p_participant_id and meeting_id=p_meeting_id and public.has_active_membership(user_id)) then raise exception 'La cuenta de ese participante no está activa.' using errcode='P0001'; end if;
  update public.meeting_participants set status=p_status,joined_at=case when p_status='ADMITTED' then now() else joined_at end,left_at=case when p_status='DENIED' then now() else null end where id=p_participant_id and meeting_id=p_meeting_id returning * into v_participant;
  if v_participant.id is null then raise exception 'No encontramos a ese participante.' using errcode='P0001'; end if;
  update public.notifications set read_at=coalesce(read_at,now()) where user_id=v_user and actor_id=v_participant.user_id
    and type='MEETING_JOIN_REQUEST' and resource_id=p_meeting_id and read_at is null;
  insert into public.notifications(user_id,actor_id,type,title,body,resource_type,resource_id)
  values(v_participant.user_id,v_user,'MEETING_'||p_status,case when p_status='ADMITTED' then 'Ingreso autorizado' else 'Ingreso rechazado' end,'La solicitud de ingreso cambió de estado.','Meeting',p_meeting_id);
  return jsonb_build_object('participantId',v_participant.id,'status',p_status);
end; $$;

create or replace function public.admit_meeting_participant(p_meeting_id uuid,p_participant_id uuid) returns jsonb language sql security definer set search_path=public as $$ select public.update_admission(p_meeting_id,p_participant_id,'ADMITTED'); $$;
create or replace function public.deny_meeting_participant(p_meeting_id uuid,p_participant_id uuid) returns jsonb language sql security definer set search_path=public as $$ select public.update_admission(p_meeting_id,p_participant_id,'DENIED'); $$;

create or replace function public.set_meeting_locked(p_meeting_id uuid,p_locked boolean) returns jsonb language plpgsql security definer set search_path=public,auth as $$
begin if not exists(select 1 from public.meetings where id=p_meeting_id and host_id=public.require_active_membership()) then raise exception 'Solo el anfitrión puede realizar esta acción.' using errcode='P0001'; end if; update public.meetings set locked=coalesce(p_locked,false) where id=p_meeting_id; return jsonb_build_object('locked',coalesce(p_locked,false)); end; $$;

create or replace function public.end_meeting(p_meeting_id uuid) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_deleted_messages integer:=0;
begin
  if not exists(select 1 from public.meetings where id=p_meeting_id and host_id=public.require_active_membership()) then raise exception 'Solo el anfitrión puede realizar esta acción.' using errcode='P0001'; end if;
  update public.meetings set status='ENDED',ended_at=coalesce(ended_at,now()) where id=p_meeting_id;
  delete from public.meeting_messages where meeting_id=p_meeting_id;
  get diagnostics v_deleted_messages=row_count;
  return jsonb_build_object('meetingId',p_meeting_id,'status','ENDED','messagesDeleted',v_deleted_messages);
end; $$;

-- Aplica la misma política de retención a reuniones finalizadas anteriormente.
-- Las reacciones asociadas se eliminan por su clave foránea ON DELETE CASCADE.
delete from public.meeting_messages msg
using public.meetings meeting
where msg.meeting_id=meeting.id and meeting.status='ENDED';

create or replace function public.get_community_members(p_query text default '') returns jsonb language sql stable security definer set search_path=public,auth as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'username',p.username,'avatar',p.avatar) order by p.name),'[]'::jsonb) from (select * from public.profiles where id<>public.require_active_membership() and status='ACTIVE' and public.has_active_membership(id) and (coalesce(trim(p_query),'')='' or name ilike '%'||trim(p_query)||'%' or username::text ilike '%'||trim(p_query)||'%') order by name limit 100) p;
$$;

create or replace function public.invite_to_meeting(p_meeting_id uuid,p_user_id uuid) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_host uuid:=public.require_active_membership(); v_profile public.profiles; v_invite public.meeting_invitations;
begin
  if not exists(select 1 from public.meetings where id=p_meeting_id and host_id=v_host and status='ACTIVE') then raise exception 'Solo el anfitrión puede invitar.' using errcode='P0001'; end if;
  select * into v_profile from public.profiles where id=p_user_id and status='ACTIVE'; if v_profile.id is null or p_user_id=v_host then raise exception 'No encontramos a ese usuario activo.' using errcode='P0001'; end if;
  if not public.has_active_membership(p_user_id) then raise exception 'Ese usuario necesita una cuenta activa para recibir invitaciones.' using errcode='P0001'; end if;
  if exists(select 1 from public.meeting_participants where meeting_id=p_meeting_id and user_id=p_user_id and status='ADMITTED') then
    raise exception 'Ese usuario ya se encuentra dentro de la reunión.' using errcode='P0001';
  end if;
  select * into v_invite from public.meeting_invitations where meeting_id=p_meeting_id and invitee_id=p_user_id;
  if v_invite.id is not null and v_invite.status='PENDING' then
    return jsonb_build_object('id',v_invite.id,'userId',p_user_id,'name',v_profile.name,'status','PENDING');
  end if;
  insert into public.meeting_invitations(meeting_id,inviter_id,invitee_id) values(p_meeting_id,v_host,p_user_id) on conflict(meeting_id,invitee_id) do update set inviter_id=excluded.inviter_id,status='PENDING',created_at=now(),responded_at=null returning * into v_invite;
  insert into public.meeting_participants(meeting_id,user_id,role,status) values(p_meeting_id,p_user_id,'PARTICIPANT','INVITED')
  on conflict(meeting_id,user_id) do update set status=case when public.meeting_participants.status='ADMITTED' then 'ADMITTED' else 'INVITED' end,left_at=null;
  update public.notifications set read_at=coalesce(read_at,now()) where user_id=p_user_id and type='MEETING_INVITE' and resource_id=p_meeting_id and read_at is null;
  insert into public.notifications(user_id,actor_id,type,title,body,resource_type,resource_id) select p_user_id,v_host,'MEETING_INVITE',p.name||' te invitó a una reunión',m.title||' · '||m.room_code,'Meeting',m.id from public.meetings m join public.profiles p on p.id=v_host where m.id=p_meeting_id;
  return jsonb_build_object('id',v_invite.id,'userId',p_user_id,'name',v_profile.name,'status','PENDING');
end; $$;

create or replace function public.respond_to_meeting_invitation(p_invitation_id uuid,p_status text) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_active_membership(); v_invite public.meeting_invitations; v_meeting public.meetings;
begin
  if p_status not in ('ACCEPTED','DECLINED') then raise exception 'Respuesta de invitación inválida.' using errcode='P0001'; end if;
  select * into v_invite from public.meeting_invitations where id=p_invitation_id and invitee_id=v_user for update;
  if v_invite.id is null then raise exception 'No encontramos esa invitación.' using errcode='P0001'; end if;
  select * into v_meeting from public.meetings where id=v_invite.meeting_id;
  if v_meeting.id is null or v_meeting.status<>'ACTIVE' then raise exception 'La reunión ya no está disponible.' using errcode='P0001'; end if;
  if v_invite.status<>'PENDING' then
    if v_invite.status=p_status then
      return jsonb_build_object('invitationId',v_invite.id,'status',v_invite.status,'meetingId',v_meeting.id,
        'title',v_meeting.title,'roomCode',v_meeting.room_code);
    end if;
    raise exception 'Esta invitación ya fue respondida.' using errcode='P0001';
  end if;
  update public.meeting_invitations set status=p_status,responded_at=now() where id=v_invite.id;
  update public.meeting_participants set status=case when p_status='ACCEPTED' then 'ADMITTED' else 'DENIED' end,
    left_at=case when p_status='DECLINED' then now() else null end
  where meeting_id=v_invite.meeting_id and user_id=v_user;
  update public.notifications set read_at=coalesce(read_at,now()) where user_id=v_user and type='MEETING_INVITE'
    and resource_id=v_invite.meeting_id and read_at is null;
  update public.notifications set read_at=coalesce(read_at,now()) where user_id=v_invite.inviter_id and actor_id=v_user
    and type='MEETING_JOIN_REQUEST' and resource_id=v_invite.meeting_id and read_at is null;
  return jsonb_build_object('invitationId',v_invite.id,'status',p_status,'meetingId',v_meeting.id,
    'title',v_meeting.title,'roomCode',v_meeting.room_code);
end; $$;

create or replace function public.post_meeting_message(p_meeting_id uuid,p_body text,p_reply_to_id uuid default null) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_active_membership(); v_message public.meeting_messages;
begin
  if not public.is_admitted_to_meeting(p_meeting_id) then raise exception 'Aún no has sido admitido.' using errcode='P0001'; end if;
  perform 1 from public.meetings where id=p_meeting_id and status='ACTIVE' for update;
  if not found then raise exception 'La reunión ya terminó.' using errcode='P0001'; end if;
  if char_length(trim(coalesce(p_body,''))) not between 1 and 2000 then raise exception 'Escribe un mensaje válido.' using errcode='P0001'; end if;
  if p_reply_to_id is not null and not exists(select 1 from public.meeting_messages where id=p_reply_to_id and meeting_id=p_meeting_id) then raise exception 'El mensaje respondido no pertenece a esta reunión.' using errcode='P0001'; end if;
  if (select count(*)>=20 from public.meeting_messages where sender_id=v_user and created_at>now()-interval '10 seconds') then raise exception 'Has enviado demasiados mensajes. Espera unos segundos.' using errcode='P0001'; end if;
  insert into public.meeting_messages(meeting_id,sender_id,body,reply_to_id) values(p_meeting_id,v_user,trim(p_body),p_reply_to_id) returning * into v_message; return public.message_view(v_message,v_user);
end; $$;

create or replace function public.react_to_meeting_message(p_meeting_id uuid,p_message_id uuid,p_emoji text) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_active_membership(); v_active boolean;
begin
  if not public.is_admitted_to_meeting(p_meeting_id) then raise exception 'Aún no has sido admitido.' using errcode='P0001'; end if;
  if p_emoji not in ('👍','👏','❤️','😂','🎉','🔥') then raise exception 'Reacción no permitida.' using errcode='P0001'; end if;
  if not exists(select 1 from public.meeting_messages where id=p_message_id and meeting_id=p_meeting_id) then raise exception 'No encontramos ese mensaje.' using errcode='P0001'; end if;
  select not active into v_active from public.meeting_message_reactions where message_id=p_message_id and user_id=v_user and emoji=p_emoji;
  v_active:=coalesce(v_active,true);
  insert into public.meeting_message_reactions(meeting_id,message_id,user_id,emoji,active) values(p_meeting_id,p_message_id,v_user,p_emoji,v_active) on conflict(message_id,user_id,emoji) do update set active=excluded.active;
  return jsonb_build_object('messageId',p_message_id,'emoji',p_emoji,'active',v_active,'userId',v_user);
end; $$;

create or replace function public.request_meeting_mute(p_meeting_id uuid,p_user_id uuid) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare v_host uuid:=public.require_active_membership(); v_command public.meeting_commands;
begin
  if not exists(select 1 from public.meetings where id=p_meeting_id and host_id=v_host and status='ACTIVE') then raise exception 'Solo el anfitrión puede silenciar participantes.' using errcode='P0001'; end if;
  if not exists(select 1 from public.meeting_participants where meeting_id=p_meeting_id and user_id=p_user_id and role='PARTICIPANT' and status='ADMITTED') then raise exception 'El participante ya no está disponible.' using errcode='P0001'; end if;
  insert into public.meeting_commands(meeting_id,issuer_id,target_user_id,command) values(p_meeting_id,v_host,p_user_id,'MUTE') returning * into v_command;
  return jsonb_build_object('id',v_command.id,'meetingId',v_command.meeting_id,'targetUserId',v_command.target_user_id,'command',v_command.command,'expiresAt',v_command.expires_at);
end; $$;

create or replace function public.consume_meeting_command(p_command_id uuid) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_active_membership(); v_command public.meeting_commands;
begin
  update public.meeting_commands set consumed_at=now()
  where id=p_command_id and target_user_id=v_user and consumed_at is null and expires_at>now()
  returning * into v_command;
  if v_command.id is null then return null; end if;
  return jsonb_build_object('id',v_command.id,'meetingId',v_command.meeting_id,'command',v_command.command,'issuerId',v_command.issuer_id);
end; $$;

alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.app_settings enable row level security;
alter table public.admin_access_allowlist enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_participants enable row level security;
alter table public.meeting_invitations enable row level security;
alter table public.meeting_messages enable row level security;
alter table public.meeting_message_reactions enable row level security;
alter table public.notifications enable row level security;
alter table public.meeting_commands enable row level security;
alter table public.membership_plans enable row level security;
alter table public.membership_payment_orders enable row level security;
alter table public.memberships enable row level security;
alter table public.digital_products enable row level security;
alter table public.crypto_payment_orders enable row level security;
alter table public.product_entitlements enable row level security;
alter table public.product_download_audit enable row level security;

drop policy if exists profiles_authenticated_read on public.profiles;
create policy profiles_authenticated_read on public.profiles for select to authenticated using (status='ACTIVE');
drop policy if exists wallets_owner_read on public.wallets;
create policy wallets_owner_read on public.wallets for select to authenticated using (user_id=auth.uid());
drop policy if exists meetings_member_read on public.meetings;
create policy meetings_member_read on public.meetings for select to authenticated using (host_id=auth.uid() or public.is_admitted_to_meeting(id));
drop policy if exists participants_related_read on public.meeting_participants;
create policy participants_related_read on public.meeting_participants for select to authenticated using (user_id=auth.uid() or exists(select 1 from public.meetings m where m.id=meeting_id and m.host_id=auth.uid()));
drop policy if exists messages_member_read on public.meeting_messages;
create policy messages_member_read on public.meeting_messages for select to authenticated using (public.is_admitted_to_meeting(meeting_id));
drop policy if exists reactions_member_read on public.meeting_message_reactions;
create policy reactions_member_read on public.meeting_message_reactions for select to authenticated using (public.is_admitted_to_meeting(meeting_id));
drop policy if exists notifications_owner_read on public.notifications;
create policy notifications_owner_read on public.notifications for select to authenticated using (user_id=auth.uid());
drop policy if exists membership_plans_authenticated_read on public.membership_plans;
create policy membership_plans_authenticated_read on public.membership_plans for select to authenticated using (active);
drop policy if exists membership_orders_owner_read on public.membership_payment_orders;
create policy membership_orders_owner_read on public.membership_payment_orders for select to authenticated using (user_id=auth.uid());
drop policy if exists memberships_owner_read on public.memberships;
create policy memberships_owner_read on public.memberships for select to authenticated using (user_id=auth.uid());
drop policy if exists digital_products_authenticated_read on public.digital_products;
create policy digital_products_authenticated_read on public.digital_products for select to authenticated using (
  active and exists(select 1 from public.profiles viewer where viewer.id=auth.uid() and viewer.role='ADMIN' and viewer.status='ACTIVE')
);
drop policy if exists crypto_orders_owner_read on public.crypto_payment_orders;
create policy crypto_orders_owner_read on public.crypto_payment_orders for select to authenticated using (user_id=auth.uid());
drop policy if exists product_entitlements_owner_read on public.product_entitlements;
create policy product_entitlements_owner_read on public.product_entitlements for select to authenticated using (user_id=auth.uid() and revoked_at is null);

-- Autoriza canales privados Realtime solo a miembros admitidos de meeting:<uuid>.
drop policy if exists galaxy_meeting_realtime_read on realtime.messages;
create policy galaxy_meeting_realtime_read on realtime.messages for select to authenticated using (
  public.can_access_realtime_topic((select realtime.topic()),realtime.messages.extension)
);
drop policy if exists galaxy_meeting_realtime_write on realtime.messages;
create policy galaxy_meeting_realtime_write on realtime.messages for insert to authenticated with check (
  public.can_access_realtime_topic((select realtime.topic()),realtime.messages.extension)
);

do $$ begin
  alter publication supabase_realtime add table public.meeting_participants;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; end $$;

revoke all on all tables in schema public from anon;
revoke usage on schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from public, anon;
revoke execute on function public.touch_updated_at(),public.handle_new_user(),public.require_user(),public.get_turn_provider_config(),public.membership_view(uuid),public.has_active_membership(uuid),public.require_active_membership(),public.get_membership_center(),public.get_crypto_store(),public.activate_membership_from_payment(uuid,text,text,numeric,jsonb),public.confirm_crypto_payment(uuid,text,integer,numeric,jsonb),public.is_admitted_to_meeting(uuid),public.can_access_realtime_topic(text,text),public.meeting_summary(public.meetings,uuid),public.get_current_user(),public.update_profile(text,text,text),public.get_bootstrap_data(text[]),public.get_my_notifications(integer),public.mark_notification_read(uuid),public.mark_all_notifications_read(),public.create_meeting(text,text,boolean),public.message_view(public.meeting_messages,uuid),public.get_meeting_messages(uuid,integer),public.get_meeting_message(uuid,uuid),public.join_meeting(text,text),public.get_my_meetings(),public.get_meeting_state(uuid),public.update_admission(uuid,uuid,text),public.admit_meeting_participant(uuid,uuid),public.deny_meeting_participant(uuid,uuid),public.set_meeting_locked(uuid,boolean),public.end_meeting(uuid),public.get_community_members(text),public.invite_to_meeting(uuid,uuid),public.respond_to_meeting_invitation(uuid,text),public.post_meeting_message(uuid,text,uuid),public.react_to_meeting_message(uuid,uuid,text),public.request_meeting_mute(uuid,uuid),public.consume_meeting_command(uuid) from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.profiles,public.wallets,public.meetings,public.meeting_participants,public.meeting_messages,public.meeting_message_reactions,public.notifications,public.membership_plans,public.membership_payment_orders,public.memberships,public.digital_products,public.crypto_payment_orders,public.product_entitlements to authenticated;
grant execute on function public.get_current_user(),public.update_profile(text,text,text),public.get_bootstrap_data(text[]),public.get_membership_center(),public.get_crypto_store(),public.get_my_notifications(integer),public.mark_notification_read(uuid),public.mark_all_notifications_read(),public.create_meeting(text,text,boolean),public.join_meeting(text,text),public.get_my_meetings(),public.get_meeting_state(uuid),public.admit_meeting_participant(uuid,uuid),public.deny_meeting_participant(uuid,uuid),public.set_meeting_locked(uuid,boolean),public.end_meeting(uuid),public.get_community_members(text),public.invite_to_meeting(uuid,uuid),public.respond_to_meeting_invitation(uuid,text),public.get_meeting_messages(uuid,integer),public.get_meeting_message(uuid,uuid),public.post_meeting_message(uuid,text,uuid),public.react_to_meeting_message(uuid,uuid,text),public.request_meeting_mute(uuid,uuid),public.consume_meeting_command(uuid) to authenticated;
grant execute on function public.is_admitted_to_meeting(uuid),public.can_access_realtime_topic(text,text) to authenticated;
grant execute on function public.activate_membership_from_payment(uuid,text,text,numeric,jsonb) to service_role;
grant execute on function public.confirm_crypto_payment(uuid,text,integer,numeric,jsonb) to service_role;
grant execute on function public.get_turn_provider_config() to service_role;

commit;
