begin;

create table if not exists public.scanner_streams (
  id text primary key check (id='xauusd-5m'),
  enabled boolean not null default false,
  provider text check (provider='gold-api'),
  settings jsonb not null default '{"symbol":"XAUUSD","timeframeMinutes":5,"atrPeriod":10,"multiplier":3,"useRma":true,"pipSize":0.01,"tpStepPips":500}',
  runtime jsonb not null default '{}',
  lease_id uuid,
  lease_until timestamptz,
  next_poll_at timestamptz not null default now(),
  last_error text,
  tracking_started_at timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.scanner_streams(id) values('xauusd-5m') on conflict do nothing;
create table if not exists public.scanner_trades (
  id uuid primary key default gen_random_uuid(),
  stream_id text not null references public.scanner_streams(id),
  trade_key text not null unique,
  bar_at timestamptz not null,
  side text not null check (side in ('BUY','SELL')),
  status text not null check (status in ('OPEN','CLOSED')),
  outcome text check (outcome in ('WIN','SL','IGNORED')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique(stream_id,bar_at)
);
create table if not exists public.scanner_events (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.scanner_trades(id) on delete cascade,
  type text not null check (type in ('SIGNAL','TP1','TP2','TP3','SL')),
  occurred_at timestamptz not null,
  payload jsonb not null,
  unique(trade_id,type)
);
alter table public.scanner_streams enable row level security;
alter table public.scanner_trades enable row level security;
alter table public.scanner_events enable row level security;
revoke all on public.scanner_streams,public.scanner_trades,public.scanner_events from public,anon,authenticated;
grant all on public.scanner_streams,public.scanner_trades,public.scanner_events to service_role;

-- A lease prevents concurrent invocations from fetching or publishing twice.
create or replace function public.claim_scanner_tick() returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_stream public.scanner_streams; v_lease uuid:=gen_random_uuid();
begin
  select * into v_stream from public.scanner_streams where id='xauusd-5m' and enabled and provider is not null
    and next_poll_at<=now() and coalesce(lease_until,'-infinity')<=now() for update skip locked;
  if not found then return null; end if;
  update public.scanner_streams set lease_id=v_lease,lease_until=now()+interval '90 seconds',
    next_poll_at=now()+interval '29 seconds' where id=v_stream.id;
  return jsonb_build_object('lease',v_lease,'provider',v_stream.provider,'settings',v_stream.settings,'runtime',v_stream.runtime);
end; $$;

create or replace function public.complete_scanner_tick(p_lease uuid,p_provider text,p_settings jsonb,p_runtime jsonb,p_trades jsonb default '[]',p_events jsonb default '[]') returns boolean
language plpgsql security definer set search_path=public as $$
declare v_stream public.scanner_streams; v_trade jsonb; v_event jsonb; v_trade_id uuid; v_event_id uuid;
  v_payload jsonb; v_detected timestamptz; v_bar timestamptz; v_body text; v_title text;
begin
  select * into v_stream from public.scanner_streams where id='xauusd-5m' for update;
  if not found or not v_stream.enabled or v_stream.lease_id is distinct from p_lease
    or v_stream.provider is distinct from p_provider or v_stream.settings is distinct from p_settings then return false; end if;
  if jsonb_typeof(p_runtime) is distinct from 'object' or octet_length(p_runtime::text)>65536 then raise exception 'Invalid scanner state'; end if;
  if jsonb_typeof(p_trades) is distinct from 'array' or jsonb_array_length(p_trades)>2
    or jsonb_typeof(p_events) is distinct from 'array' or jsonb_array_length(p_events)>5 then raise exception 'Invalid scanner batch'; end if;
  for v_trade in select value from jsonb_array_elements(p_trades) loop
    v_detected:=(v_trade->>'detectedAt')::timestamptz; v_bar:=(v_trade->>'barAt')::timestamptz;
    if v_trade->>'symbol' is distinct from 'XAUUSD' or v_trade->>'source' is distinct from p_provider
      or coalesce(v_trade->>'side','') not in ('BUY','SELL') or coalesce(v_trade->>'status','') not in ('OPEN','CLOSED')
      or v_trade->>'key' is null or v_detected is null or v_bar is null
      or (v_trade->>'timeframeMinutes')::integer is distinct from 5
      or jsonb_typeof(v_trade->'entry') is distinct from 'number' or jsonb_typeof(v_trade->'sl') is distinct from 'number'
      or jsonb_typeof(v_trade->'tp1') is distinct from 'number' or jsonb_typeof(v_trade->'tp2') is distinct from 'number'
      or jsonb_typeof(v_trade->'tp3') is distinct from 'number' then raise exception 'Invalid scanner trade'; end if;
    insert into public.scanner_trades(stream_id,trade_key,bar_at,side,status,outcome,payload)
      values(v_stream.id,v_trade->>'key',v_bar,v_trade->>'side',v_trade->>'status',v_trade->>'outcome',v_trade)
      on conflict(trade_key) do update set status=excluded.status,outcome=excluded.outcome,payload=excluded.payload;
  end loop;
  for v_event in select value from jsonb_array_elements(p_events) loop
    v_payload:=v_event->'payload'; v_detected:=(v_event->>'occurredAt')::timestamptz;
    if coalesce(v_event->>'type','') not in ('SIGNAL','TP1','TP2','TP3','SL') or v_detected is null
      or v_detected<now()-interval '2 minutes' or v_detected>now()+interval '15 seconds' then raise exception 'Invalid scanner event'; end if;
    select id into v_trade_id from public.scanner_trades where stream_id=v_stream.id and trade_key=v_event->>'tradeKey';
    if v_trade_id is null then raise exception 'Missing scanner trade'; end if;
    insert into public.scanner_events(trade_id,type,occurred_at,payload) values(v_trade_id,v_event->>'type',v_detected,v_payload)
      on conflict(trade_id,type) do nothing returning id into v_event_id;
    if v_event_id is not null then
      v_body:='Entrada '||round((v_payload->>'entry')::numeric,3)||' | SL '||round((v_payload->>'sl')::numeric,3)
        ||' | TP1 '||round((v_payload->>'tp1')::numeric,3)||' | TP2 '||round((v_payload->>'tp2')::numeric,3)||' | TP3 '||round((v_payload->>'tp3')::numeric,3);
      v_title:=(case when v_event->>'type'='SIGNAL' then v_payload->>'side' when v_event->>'type'='SL' and v_payload->>'outcome'='WIN' then 'SL tras TP · sin descuento' else v_event->>'type' end)||' XAUUSD · 5m';
      insert into public.notifications(user_id,type,title,body,resource_type,resource_id)
        select p.id,'SCANNER_SIGNAL',v_title,v_body,'ScannerEvent',v_event_id
        from public.profiles p where p.status='ACTIVE' and not p.is_guest and public.has_active_membership(p.id);
    end if;
  end loop;
  if jsonb_array_length(p_events)>0 then perform public.dispatch_pending_push(); end if;
  update public.scanner_streams set runtime=p_runtime,lease_id=null,lease_until=null,last_error=null,updated_at=now() where id=v_stream.id;
  return true;
end; $$;

create or replace function public.checkpoint_scanner_history(p_lease uuid,p_cache jsonb) returns boolean
language plpgsql security definer set search_path=public as $$
begin
  if jsonb_typeof(p_cache) is distinct from 'object' or octet_length(p_cache::text)>32768 then raise exception 'Invalid history cache'; end if;
  update public.scanner_streams set runtime=jsonb_set(runtime,'{bootstrap}',p_cache),updated_at=now()
    where id='xauusd-5m' and lease_id=p_lease and enabled;
  return found;
end; $$;

create or replace function public.fail_scanner_tick(p_lease uuid,p_code text) returns void
language sql security definer set search_path=public as $$
  update public.scanner_streams set lease_id=null,lease_until=null,last_error=left(p_code,80),updated_at=now()
  where id='xauusd-5m' and lease_id=p_lease;
$$;

-- Existing message/meeting triggers remain unchanged. Only scanner notices use
-- this additional queue hook; the publisher dispatches once after the fan-out.
create or replace function public.queue_scanner_signal_push() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.type='SCANNER_SIGNAL' then
    insert into public.push_delivery_jobs(notification_id,subscription_id)
      select new.id,s.id from public.push_subscriptions s join public.profiles p on p.id=s.user_id
      where s.user_id=new.user_id and p.status='ACTIVE' and not p.is_guest and public.has_active_membership(p.id)
      on conflict do nothing;
  end if;
  return new;
end; $$;
drop trigger if exists scanner_signal_web_push on public.notifications;
create trigger scanner_signal_web_push after insert on public.notifications for each row execute function public.queue_scanner_signal_push();

-- Preserve existing delivery rules; scanner events additionally expire after
-- five minutes and recheck membership before a queued job is actually sent.
create or replace function public.claim_push_delivery_jobs() returns table(job_id uuid,subscription_id uuid,subscription jsonb,notification jsonb)
language sql security definer set search_path=public as $$
  with candidates as (
    select j.id from public.push_delivery_jobs j
    join public.push_subscriptions s on s.id=j.subscription_id
    join public.notifications n on n.id=j.notification_id and n.user_id=s.user_id
    join public.profiles p on p.id=s.user_id
    left join public.meetings m on m.id=n.resource_id and n.resource_type='Meeting'
    where j.sent_at is null and j.attempts<5 and j.leased_until<=now()
    and n.read_at is null and n.created_at>now()-interval '24 hours' and p.status='ACTIVE' and not p.is_guest
    and (n.resource_type<>'Meeting' or (m.status='ACTIVE' and not m.locked and (m.scheduled_ends_at is null or m.scheduled_ends_at>now())))
    and (n.type<>'SCANNER_SIGNAL' or (public.has_active_membership(p.id) and exists(
      select 1 from public.scanner_events event where event.id=n.resource_id and event.occurred_at>now()-interval '5 minutes')))
    order by j.created_at limit 50 for update of j skip locked
  ), claimed as (
    update public.push_delivery_jobs j set attempts=j.attempts+1,leased_until=now()+interval '2 minutes'
    from candidates c where j.id=c.id returning j.*
  ) select c.id,s.id,s.subscription,jsonb_build_object('id',n.id,'type',n.type,'title',n.title,'body',n.body,'actorId',n.actor_id,
    'meetingId',m.id,'roomCode',m.room_code,'userId',n.user_id)
  from claimed c join public.push_subscriptions s on s.id=c.subscription_id
  join public.notifications n on n.id=c.notification_id left join public.meetings m on m.id=n.resource_id and n.resource_type='Meeting';
$$;

create or replace function public.dispatch_scanner_tick() returns void
language plpgsql security definer set search_path=public,vault,net as $$
declare v_url text; v_secret text;
begin
  if not exists(select 1 from public.scanner_streams where id='xauusd-5m' and enabled and provider is not null) then return; end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name='galaxy_scanner_dispatch_url' limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='galaxy_scanner_dispatch_secret' limit 1;
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(url:=v_url,headers:=jsonb_build_object('Content-Type','application/json','x-galaxy-scanner-secret',v_secret),body:='{}'::jsonb,timeout_milliseconds:=100000);
end; $$;

create or replace function public.get_black_galaxy_trade(p_limit integer default 40) returns jsonb
language plpgsql stable security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_registered_member(); v_result jsonb;
begin
  select jsonb_build_object('enabled',stream.enabled,'startedAt',stream.tracking_started_at,
    'lastQuoteAt',stream.runtime->'lastQuoteAt','price',stream.runtime#>'{bar,close}',
    'ready',coalesce((stream.runtime#>>'{previous,count}')::integer,0)>=9,
    'signals',(select count(*) from public.scanner_trades),
    'wins',(select count(*) from public.scanner_trades where status='CLOSED' and outcome='WIN'),
    'losses',(select count(*) from public.scanner_trades where status='CLOSED' and outcome='SL'),
    'ignored',(select count(*) from public.scanner_trades where outcome='IGNORED'),
    'trades',coalesce((select jsonb_agg(item.payload order by item.bar_at desc) from
      (select payload,bar_at from public.scanner_trades order by bar_at desc limit greatest(1,least(coalesce(p_limit,40),100))) item),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(jsonb_build_object('id',event.id,'type',event.type,'at',event.occurred_at,'tradeKey',trade.trade_key,'payload',event.payload) order by event.occurred_at desc)
      from (select * from public.scanner_events order by occurred_at desc limit 40) event join public.scanner_trades trade on trade.id=event.trade_id),'[]'::jsonb))
  into v_result from public.scanner_streams stream where id='xauusd-5m';
  return v_result;
end; $$;

revoke execute on function public.claim_scanner_tick(),public.complete_scanner_tick(uuid,text,jsonb,jsonb,jsonb,jsonb),public.checkpoint_scanner_history(uuid,jsonb),public.fail_scanner_tick(uuid,text),public.queue_scanner_signal_push(),public.dispatch_scanner_tick(),public.claim_push_delivery_jobs(),public.get_black_galaxy_trade(integer) from public,anon,authenticated;
grant execute on function public.claim_scanner_tick(),public.complete_scanner_tick(uuid,text,jsonb,jsonb,jsonb,jsonb),public.checkpoint_scanner_history(uuid,jsonb),public.fail_scanner_tick(uuid,text),public.claim_push_delivery_jobs() to service_role;
grant execute on function public.get_black_galaxy_trade(integer) to authenticated;

do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    if exists(select 1 from cron.job where jobname='galaxy-scanner-signals') then perform cron.unschedule('galaxy-scanner-signals'); end if;
    perform cron.schedule('galaxy-scanner-signals','30 seconds','select public.dispatch_scanner_tick();');
  end if;
end $$;
notify pgrst,'reload schema';
commit;
