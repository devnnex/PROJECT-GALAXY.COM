begin;

-- Incremental, shared daily totals. Visitors never scan the full trade ledger.
create table if not exists public.scanner_daily_statistics (
  day date primary key,
  totals numeric[] not null,
  updated_at timestamptz not null default now(),
  check (array_length(totals,1)=11)
);
alter table public.scanner_daily_statistics enable row level security;
revoke all on public.scanner_daily_statistics from public,anon,authenticated;
grant all on public.scanner_daily_statistics to service_role;

-- signals,wins,losses,ignored,open,sumTP,initialSL,hit1,hit2,hit3,highestTP.
-- Distances are USD/oz, before lot size and contract size. Include observed
-- targets on open trades; effectiveness still uses closed WIN/SL only.
create or replace function public.scanner_trade_metrics(p_status text,p_outcome text,p_payload jsonb) returns numeric[]
language sql immutable set search_path=public as $$
  with distances as (select
    case when coalesce((p_payload->>'hit1')::boolean,false) then abs((p_payload->>'tp1')::numeric-(p_payload->>'entry')::numeric) else 0 end as tp1,
    case when coalesce((p_payload->>'hit2')::boolean,false) then abs((p_payload->>'tp2')::numeric-(p_payload->>'entry')::numeric) else 0 end as tp2,
    case when coalesce((p_payload->>'hit3')::boolean,false) then abs((p_payload->>'tp3')::numeric-(p_payload->>'entry')::numeric) else 0 end as tp3)
  select array[1::numeric,
    case when p_status='CLOSED' and p_outcome='WIN' then 1 else 0 end,
    case when p_status='CLOSED' and p_outcome='SL' then 1 else 0 end,
    case when p_outcome='IGNORED' then 1 else 0 end,
    case when p_status='OPEN' then 1 else 0 end,
    coalesce(tp1+tp2+tp3,0),
    case when p_status='CLOSED' and p_outcome='SL' then abs((p_payload->>'entry')::numeric-(p_payload->>'sl')::numeric) else 0 end,
    case when coalesce((p_payload->>'hit1')::boolean,false) then 1 else 0 end,
    case when coalesce((p_payload->>'hit2')::boolean,false) then 1 else 0 end,
    case when coalesce((p_payload->>'hit3')::boolean,false) then 1 else 0 end,
    coalesce(greatest(tp1,tp2,tp3),0)] from distances;
$$;

create or replace function public.sync_scanner_daily_statistics() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_day date; v_totals numeric[];
begin
  if tg_op='UPDATE' and old.payload is not distinct from new.payload
    and old.status=new.status and old.outcome is not distinct from new.outcome and old.bar_at=new.bar_at then return new; end if;
  if tg_op in ('UPDATE','DELETE') then
    v_day:=(old.bar_at at time zone 'America/Bogota')::date;
    v_totals:=public.scanner_trade_metrics(old.status,old.outcome,old.payload);
    update public.scanner_daily_statistics d set totals=array(select d.totals[i]-v_totals[i] from generate_series(1,11) i),updated_at=now() where day=v_day;
  end if;
  if tg_op in ('INSERT','UPDATE') then
    v_day:=(new.bar_at at time zone 'America/Bogota')::date;
    v_totals:=public.scanner_trade_metrics(new.status,new.outcome,new.payload);
    insert into public.scanner_daily_statistics as d(day,totals) values(v_day,v_totals)
      on conflict(day) do update set totals=array(select d.totals[i]+excluded.totals[i] from generate_series(1,11) i),updated_at=now();
    return new;
  end if;
  return old;
end; $$;

-- Idempotent backfill, including already recorded TP hits; no synthetic trades.
lock table public.scanner_trades in share row exclusive mode;
insert into public.scanner_daily_statistics(day,totals)
select day,array[sum(m[1]),sum(m[2]),sum(m[3]),sum(m[4]),sum(m[5]),sum(m[6]),sum(m[7]),sum(m[8]),sum(m[9]),sum(m[10]),sum(m[11])]
from (select (bar_at at time zone 'America/Bogota')::date as day,public.scanner_trade_metrics(status,outcome,payload) as m from public.scanner_trades) t group by day
on conflict(day) do update set totals=excluded.totals,updated_at=now();
drop trigger if exists scanner_daily_statistics_update on public.scanner_trades;
create trigger scanner_daily_statistics_update after insert or update or delete on public.scanner_trades for each row execute function public.sync_scanner_daily_statistics();
create index if not exists scanner_trades_recent_idx on public.scanner_trades(bar_at desc);
create index if not exists scanner_events_recent_idx on public.scanner_events(occurred_at desc);
create index if not exists push_delivery_pending_idx on public.push_delivery_jobs(leased_until,created_at) where sent_at is null and attempts<5;

create or replace function public.get_scanner_analytics() returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_registered_member();
begin
  return jsonb_build_object('timezone','America/Bogota','updatedAt',(select max(updated_at) from public.scanner_daily_statistics),
    'days',coalesce((select jsonb_agg(jsonb_build_object('day',day,'signals',totals[1],'wins',totals[2],'losses',totals[3],
      'ignored',totals[4],'open',totals[5],'gain',totals[6],'loss',totals[7],'hits',jsonb_build_array(totals[8],totals[9],totals[10]),'peakGain',totals[11]) order by day)
      from public.scanner_daily_statistics where totals[1]>0),'[]'::jsonb));
end; $$;

create or replace function public.get_black_galaxy_trade(p_limit integer default 40) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_registered_member(); v_result jsonb;
begin
  select jsonb_build_object('enabled',stream.enabled,'startedAt',stream.tracking_started_at,
    'lastQuoteAt',stream.runtime->'lastQuoteAt','price',stream.runtime#>'{bar,close}',
    'ready',coalesce((stream.runtime#>>'{previous,count}')::integer,0)>=9,
    'signals',coalesce(stats.signals,0),'wins',coalesce(stats.wins,0),'losses',coalesce(stats.losses,0),'ignored',coalesce(stats.ignored,0),
    'statisticsVersion',stats.version,
    'trades',coalesce((select jsonb_agg(item.payload order by item.bar_at desc) from
      (select payload,bar_at from public.scanner_trades order by bar_at desc limit greatest(1,least(coalesce(p_limit,40),100))) item),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(jsonb_build_object('id',event.id,'type',event.type,'at',event.occurred_at,'tradeKey',trade.trade_key,'payload',event.payload) order by event.occurred_at desc)
      from (select * from public.scanner_events order by occurred_at desc limit 100) event join public.scanner_trades trade on trade.id=event.trade_id),'[]'::jsonb))
  into v_result from public.scanner_streams stream cross join
    (select sum(totals[1]) signals,sum(totals[2]) wins,sum(totals[3]) losses,sum(totals[4]) ignored,max(updated_at) version from public.scanner_daily_statistics) stats
  where stream.id='xauusd-5m';
  return v_result;
end; $$;

-- A single global sampler, independent of connected visitors. Check twice per
-- source sample to reduce phase delay; provider OHLC quota is unchanged.
create or replace function public.claim_scanner_tick() returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_stream public.scanner_streams; v_lease uuid:=gen_random_uuid();
begin
  select * into v_stream from public.scanner_streams where id='xauusd-5m' and enabled and provider is not null
    and next_poll_at<=now() and coalesce(lease_until,'-infinity')<=now() for update skip locked;
  if not found then return null; end if;
  update public.scanner_streams set lease_id=v_lease,lease_until=now()+interval '90 seconds',next_poll_at=now()+interval '14 seconds' where id=v_stream.id;
  return jsonb_build_object('lease',v_lease,'provider',v_stream.provider,'settings',v_stream.settings,'runtime',v_stream.runtime);
end; $$;

-- Avoid Edge Function and provider calls while the source response is cached.
create or replace function public.dispatch_scanner_tick() returns void
language plpgsql security definer set search_path=public,vault,net as $$
declare v_url text; v_secret text;
begin
  if not exists(select 1 from public.scanner_streams where id='xauusd-5m' and enabled and provider is not null
    and next_poll_at<=now() and coalesce(lease_until,'-infinity')<=now()
    and coalesce((runtime->>'nextQuoteFetchAt')::numeric,0)<=extract(epoch from now())*1000) then return; end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name='galaxy_scanner_dispatch_url' limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='galaxy_scanner_dispatch_secret' limit 1;
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(url:=v_url,headers:=jsonb_build_object('Content-Type','application/json','x-galaxy-scanner-secret',v_secret),body:='{}'::jsonb,timeout_milliseconds:=100000);
end; $$;

-- Preserve eligibility/read/expiry rules. A scanner delivery lease covers the
-- bounded send, without imposing the old two-minute retry delay on trading.
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
    order by (n.type='SCANNER_SIGNAL') desc,j.created_at limit 50 for update of j skip locked
  ), claimed as (
    update public.push_delivery_jobs j set attempts=j.attempts+1,leased_until=now()+
      case when n.type='SCANNER_SIGNAL' then interval '20 seconds' else interval '2 minutes' end
    from candidates c,public.notifications n where j.id=c.id and n.id=j.notification_id returning j.*
  ) select c.id,s.id,s.subscription,jsonb_build_object('id',n.id,'type',n.type,'title',n.title,'body',n.body,'actorId',n.actor_id,
    'meetingId',m.id,'roomCode',m.room_code,'userId',n.user_id,'createdAt',n.created_at)
  from claimed c join public.push_subscriptions s on s.id=c.subscription_id
  join public.notifications n on n.id=c.notification_id left join public.meetings m on m.id=n.resource_id and n.resource_type='Meeting';
$$;

-- Fast retry only when trading jobs exist. The existing meeting/message cron
-- keeps its schedule and behavior; no Edge Function call for an empty queue.
create or replace function public.retry_scanner_push() returns void
language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.push_delivery_jobs j join public.notifications n on n.id=j.notification_id
    where j.sent_at is null and j.attempts<5 and j.leased_until<=now() and n.type='SCANNER_SIGNAL'
    and n.read_at is null and n.created_at>now()-interval '5 minutes') then perform public.dispatch_pending_push(); end if;
end; $$;

revoke execute on function public.scanner_trade_metrics(text,text,jsonb),public.sync_scanner_daily_statistics(),public.get_scanner_analytics(),public.retry_scanner_push() from public,anon,authenticated;
grant execute on function public.get_scanner_analytics() to authenticated;
grant execute on function public.scanner_trade_metrics(text,text,jsonb) to service_role;
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    if exists(select 1 from cron.job where jobname='galaxy-scanner-signals') then perform cron.unschedule('galaxy-scanner-signals'); end if;
    perform cron.schedule('galaxy-scanner-signals','15 seconds','select public.dispatch_scanner_tick();');
    if exists(select 1 from cron.job where jobname='galaxy-scanner-push-retry') then perform cron.unschedule('galaxy-scanner-push-retry'); end if;
    perform cron.schedule('galaxy-scanner-push-retry','15 seconds','select public.retry_scanner_push();');
  end if;
end $$;
notify pgrst,'reload schema';
commit;
