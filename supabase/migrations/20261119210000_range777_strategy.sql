begin;
-- Deliberately independent: the existing scanner, its ledger and daily totals
-- retain their original rules. Both engines consume the same provider sample.
create table if not exists public.range_scanner_state (
 id boolean primary key default true check(id), enabled boolean not null default false,
 runtime jsonb not null default '{}',lease uuid,lease_until timestamptz,started_at timestamptz,
 updated_at timestamptz not null default now(),last_error text
);
alter table public.range_scanner_state add column if not exists totals numeric[] not null default array[0,0,0,0,0,0,0,0,0]::numeric[];
alter table public.range_scanner_state add column if not exists statistics_version timestamptz not null default now();
insert into public.range_scanner_state(id) values(true) on conflict do nothing;
create table if not exists public.range_scanner_trades (
 id uuid primary key default gen_random_uuid(),trade_key text unique not null,bar_at timestamptz not null unique,
 status text not null check(status in ('OPEN','CLOSED')),outcome text check(outcome in ('WIN','SL','BE')),
 payload jsonb not null
);
create unique index if not exists range_one_open_idx on public.range_scanner_trades(status) where status='OPEN';
create index if not exists range_recent_idx on public.range_scanner_trades(bar_at desc);
create table if not exists public.range_scanner_events (
 id uuid primary key default gen_random_uuid(),trade_id uuid not null references public.range_scanner_trades(id),
 type text not null check(type in ('SIGNAL','BE','CLOSED')),occurred_at timestamptz not null,payload jsonb not null,unique(trade_id,type)
);
create index if not exists range_events_recent_idx on public.range_scanner_events(occurred_at desc);
create table if not exists public.range_daily_statistics(day date primary key,totals numeric[] not null check(array_length(totals,1)=9),updated_at timestamptz not null default now());
create table if not exists public.scanner_telegram_media(key text primary key check(key in ('BUY','SELL')),path text not null,file_id text,sha256 text);
alter table public.range_scanner_state enable row level security;
alter table public.range_scanner_trades enable row level security;
alter table public.range_scanner_events enable row level security;
alter table public.range_daily_statistics enable row level security;
alter table public.scanner_telegram_media enable row level security;
revoke all on public.range_scanner_state,public.range_scanner_trades,public.range_scanner_events,public.range_daily_statistics,public.scanner_telegram_media from public,anon,authenticated;
grant all on public.range_scanner_state,public.range_scanner_trades,public.range_scanner_events,public.range_daily_statistics,public.scanner_telegram_media to service_role;

-- signals,wins,losses,breakevens,open,net,gross gains,gross losses,BE activated.
create or replace function public.range_trade_metrics(p_status text,p_outcome text,p jsonb) returns numeric[]
language sql immutable set search_path=public as $$
 select array[1::numeric,case when p_outcome='WIN' then 1 else 0 end,case when p_outcome='SL' then 1 else 0 end,
 case when p_outcome='BE' then 1 else 0 end,case when p_status='OPEN' then 1 else 0 end,
 case when p_status='CLOSED' then coalesce((p->>'net')::numeric,0) else 0 end,
 case when p_status='CLOSED' then greatest(coalesce((p->>'net')::numeric,0),0) else 0 end,
 case when p_status='CLOSED' then greatest(-coalesce((p->>'net')::numeric,0),0) else 0 end,
 case when p->>'beAt' is not null then 1 else 0 end];
$$;
create or replace function public.sync_range_statistics() returns trigger
language plpgsql security definer set search_path=public as $$
declare d date; m numeric[];
begin
 if tg_op='UPDATE' and old.bar_at=new.bar_at and public.range_trade_metrics(old.status,old.outcome,old.payload)=public.range_trade_metrics(new.status,new.outcome,new.payload) then return new; end if;
 if tg_op in ('UPDATE','DELETE') then
  d:=(old.bar_at at time zone 'America/Bogota')::date;m:=public.range_trade_metrics(old.status,old.outcome,old.payload);
  update public.range_daily_statistics s set totals=array(select s.totals[i]-m[i] from generate_series(1,9) i),updated_at=now() where day=d;
  update public.range_scanner_state s set totals=array(select s.totals[i]-m[i] from generate_series(1,9) i),statistics_version=now() where id;
 end if;
 if tg_op in ('INSERT','UPDATE') then
  d:=(new.bar_at at time zone 'America/Bogota')::date;m:=public.range_trade_metrics(new.status,new.outcome,new.payload);
  insert into public.range_daily_statistics as s(day,totals) values(d,m) on conflict(day) do update set totals=array(select s.totals[i]+excluded.totals[i] from generate_series(1,9) i),updated_at=now();
  update public.range_scanner_state s set totals=array(select s.totals[i]+m[i] from generate_series(1,9) i),statistics_version=now() where id;return new;
 end if;return old;
end;$$;
drop trigger if exists range_statistics on public.range_scanner_trades;
create trigger range_statistics after insert or update or delete on public.range_scanner_trades for each row execute function public.sync_range_statistics();

create or replace function public.claim_range_tick() returns jsonb
language plpgsql security definer set search_path=public as $$
declare s public.range_scanner_state;l uuid:=gen_random_uuid();
begin
 select * into s from public.range_scanner_state where id and enabled and coalesce(lease_until,'-infinity')<=now() for update skip locked;
 if not found then return null;end if;
 update public.range_scanner_state set lease=l,lease_until=now()+interval '30 seconds' where id;
 return jsonb_build_object('lease',l,'runtime',s.runtime);
end;$$;
create or replace function public.fail_range_tick(p_lease uuid) returns void
language sql security definer set search_path=public as $$
 update public.range_scanner_state set lease=null,lease_until=null,last_error='RANGE_UNAVAILABLE',updated_at=now() where id and lease=p_lease;
$$;
create or replace function public.complete_range_tick(p_lease uuid,p_runtime jsonb,p_trades jsonb,p_events jsonb) returns boolean
language plpgsql security definer set search_path=public as $$
declare s public.range_scanner_state;t jsonb;e jsonb;tid uuid;eid uuid;at_time timestamptz;p jsonb;title text;body text;
begin
 select * into s from public.range_scanner_state where id for update;
 if not found or not s.enabled or p_lease is null or s.lease is distinct from p_lease or s.lease_until is null or s.lease_until<now() then return false;end if;
 if jsonb_typeof(p_runtime) is distinct from 'object' or octet_length(p_runtime::text)>32768 or jsonb_typeof(p_trades) is distinct from 'array' or jsonb_array_length(p_trades)>2
 or jsonb_typeof(p_events) is distinct from 'array' or jsonb_array_length(p_events)>3 then raise exception 'Invalid range batch';end if;
 for t in select value from jsonb_array_elements(p_trades) loop
  if t->>'strategy' is distinct from 'RANGE777' or t->>'source' is distinct from 'gold-api' or t->>'symbol' is distinct from 'XAUUSD'
   or coalesce(t->>'side','') not in ('BUY','SELL') or coalesce(t->>'status','') not in ('OPEN','CLOSED') or (t->>'timeframeMinutes')::integer is distinct from 5
   or jsonb_typeof(t->'entry') is distinct from 'number' or jsonb_typeof(t->'sl') is distinct from 'number'
   or t->>'key' is null or t->>'barAt' is null then raise exception 'Invalid range trade';end if;
  insert into public.range_scanner_trades(trade_key,bar_at,status,outcome,payload) values(t->>'key',(t->>'barAt')::timestamptz,t->>'status',t->>'outcome',t)
   on conflict(trade_key) do update set status=excluded.status,outcome=excluded.outcome,payload=excluded.payload;
 end loop;
 for e in select value from jsonb_array_elements(p_events) loop
  p:=e->'payload';at_time:=(e->>'occurredAt')::timestamptz;
  if coalesce(e->>'type','') not in ('SIGNAL','BE','CLOSED') or at_time is null or at_time<now()-interval '2 minutes' or at_time>now()+interval '15 seconds' then raise exception 'Invalid range event';end if;
  select id into tid from public.range_scanner_trades where trade_key=e->>'tradeKey';
  if tid is null then raise exception 'Missing range trade';end if;
  insert into public.range_scanner_events(trade_id,type,occurred_at,payload) values(tid,e->>'type',at_time,p) on conflict(trade_id,type) do nothing returning id into eid;
  if eid is not null then
   title:=(case when e->>'type'='SIGNAL' then '🔵 '||(p->>'side') when e->>'type'='BE' then '✅ BE activado' when p->>'outcome'='WIN' then '✅ CIERRE positivo' when p->>'outcome'='BE' then '✅ BE · Cierre' else '🔴 SL' end)||' · Galaxy Aurum Bot · XAUUSD · 5m';
   body:='🔵 Entrada '||round((p->>'entry')::numeric,3)||' | 🔴 SL '||round((p->>'sl')::numeric,3)||' | BE desde +$5 · Trailing $5';
   if e->>'type'='CLOSED' then body:=body||' | Salida observada '||round((p->>'exit')::numeric,3);end if;
   insert into public.notifications(user_id,type,title,body,resource_type,resource_id) select id,'SCANNER_SIGNAL',title,body,'RangeEvent',eid from public.profiles where status='ACTIVE' and not is_guest and public.has_active_membership(id);
   if exists(select 1 from public.scanner_telegram_settings where id and enabled and at_time>=activated_at) then
    insert into public.scanner_telegram_jobs(dedupe_key,kind,payload,expires_at) values('range:'||eid,'EVENT',jsonb_build_object('strategy','RANGE777','type',e->>'type','tradeId',tid,'trade',p,'occurredAt',at_time),now()+interval '5 minutes') on conflict(dedupe_key) do nothing;
   end if;
  end if;
 end loop;
 update public.range_scanner_state set runtime=p_runtime,lease=null,lease_until=null,updated_at=now(),last_error=null where id;
 if jsonb_array_length(p_events)>0 then perform public.dispatch_pending_push();perform public.dispatch_scanner_telegram();end if;
 return true;
end;$$;

create or replace function public.range_report(p_from date,p_to date) returns jsonb
language sql stable security definer set search_path=public as $$
 with days as (select * from public.range_daily_statistics where day between p_from and p_to and totals[1]>0),
 ranked as (select day,totals[2] wins,totals[3] losses,totals[4] breakevens,totals[2]*100/(totals[2]+totals[3]+totals[4]) rate from days where totals[2]+totals[3]+totals[4]>0)
 select jsonb_build_object('strategy','RANGE777','from',p_from,'to',p_to,'asOf',now(),'signals',coalesce(sum(totals[1]),0),'wins',coalesce(sum(totals[2]),0),
 'losses',coalesce(sum(totals[3]),0),'breakevens',coalesce(sum(totals[4]),0),'open',coalesce(sum(totals[5]),0),'net',coalesce(sum(totals[6]),0),
 'gain',coalesce(sum(totals[7]),0),'loss',coalesce(sum(totals[8]),0),'protected',coalesce(sum(totals[9]),0),'signalDays',count(*),
 'bestDay',(select to_jsonb(r) from ranked r order by rate desc,wins+losses+breakevens desc,day limit 1)) from days;
$$;
create or replace function public.get_range_trade(p_limit integer default 40) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare u uuid:=public.require_registered_member();
begin
 return (select jsonb_build_object('strategy','RANGE777','signals',s.totals[1],'wins',s.totals[2],'losses',s.totals[3],'breakevens',s.totals[4],'open',s.totals[5],'protected',s.totals[9],'enabled',s.enabled,'startedAt',s.started_at,'lastQuoteAt',s.runtime->'lastQuoteAt',
 'ready',coalesce(jsonb_array_length(s.runtime->'bars'),0)>=21,'completedBars',coalesce(jsonb_array_length(s.runtime->'bars'),0),'requiredBars',21,
 'price',s.runtime#>'{bar,close}','updatedAt',s.updated_at,'statisticsVersion',s.statistics_version,
 'trades',coalesce((select jsonb_agg(t.payload order by t.bar_at desc) from (select payload,bar_at from public.range_scanner_trades order by bar_at desc limit greatest(1,least(coalesce(p_limit,40),100))) t),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(jsonb_build_object('id',id,'type',type,'at',occurred_at,'payload',payload) order by occurred_at desc) from (select * from public.range_scanner_events order by occurred_at desc limit 100) e),'[]'::jsonb)) from public.range_scanner_state s where id);
end;$$;
create or replace function public.get_range_analytics() returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare u uuid:=public.require_registered_member();
begin
 return jsonb_build_object('timezone','America/Bogota','days',coalesce((select jsonb_agg(jsonb_build_object('day',day,'signals',totals[1],'wins',totals[2],'losses',totals[3],'breakevens',totals[4],'open',totals[5],'net',totals[6],'gain',totals[7],'loss',totals[8],'protected',totals[9]) order by day) from public.range_daily_statistics where totals[1]>0),'[]'::jsonb));
end;$$;

revoke execute on function public.range_trade_metrics(text,text,jsonb),public.sync_range_statistics(),public.claim_range_tick(),public.fail_range_tick(uuid),public.complete_range_tick(uuid,jsonb,jsonb,jsonb),public.range_report(date,date),public.get_range_trade(integer),public.get_range_analytics() from public,anon,authenticated;
grant execute on function public.range_trade_metrics(text,text,jsonb),public.claim_range_tick(),public.fail_range_tick(uuid),public.complete_range_tick(uuid,jsonb,jsonb,jsonb),public.range_report(date,date) to service_role;
grant execute on function public.get_range_trade(integer),public.get_range_analytics() to authenticated;
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
      select 1 from public.scanner_events event where n.resource_type='ScannerEvent' and event.id=n.resource_id and event.occurred_at>now()-interval '5 minutes' union all select 1 from public.range_scanner_events event where n.resource_type='RangeEvent' and event.id=n.resource_id and event.occurred_at>now()-interval '5 minutes')))
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
create or replace function public.enqueue_scanner_telegram_reports(p_now timestamptz default now()) returns void
language plpgsql security definer set search_path=public as $$
declare v_active timestamptz; v_local timestamp:=p_now at time zone 'America/Bogota'; v_start date; v_due timestamptz; v_kind text; v_key text;
begin
  select activated_at into v_active from public.scanner_telegram_settings where id and enabled;
  if not found or v_active is null then return; end if;
  update public.scanner_telegram_jobs set state=case when expires_at<=now() then 'expired' else 'failed' end,lease_token=null
    where state='pending' and leased_until<=now() and (expires_at<=now() or attempts>=8);
  foreach v_kind in array array['WEEKLY','MONTHLY'] loop
    v_start:=date_trunc(case when v_kind='WEEKLY' then 'week' else 'month' end,v_local)::date;
    v_due:=(v_start::timestamp+interval '8 hours') at time zone 'America/Bogota';
    if p_now<v_due or v_due<v_active then continue; end if;
    v_key:=lower(v_kind)||':'||v_start;
    insert into public.scanner_telegram_jobs(dedupe_key,kind,payload,expires_at)
      values(v_key,v_kind,public.scanner_telegram_report((v_start-case when v_kind='WEEKLY' then interval '7 days' else interval '1 month' end)::date,v_start-1),p_now+interval '2 days')
      on conflict(dedupe_key) do nothing;
    if exists(select 1 from public.range_scanner_state where id and enabled and started_at<=v_due) then
      insert into public.scanner_telegram_jobs(dedupe_key,kind,payload,expires_at)
        values('range:'||v_key,v_kind,public.range_report((v_start-case when v_kind='WEEKLY' then interval '7 days' else interval '1 month' end)::date,v_start-1),p_now+interval '2 days') on conflict(dedupe_key) do nothing;
    end if;
  end loop;
  -- Bounded delivery metadata retention; never touch the scanner's ledger.
  delete from public.scanner_telegram_jobs where (state='sent' and sent_at<now()-interval '45 days') or (state in ('failed','expired') and created_at<now()-interval '45 days');
  perform public.dispatch_scanner_telegram();
end; $$;
revoke execute on function public.claim_push_delivery_jobs(),public.enqueue_scanner_telegram_reports(timestamptz) from public,anon,authenticated;
grant execute on function public.claim_push_delivery_jobs(),public.enqueue_scanner_telegram_reports(timestamptz) to service_role;
notify pgrst,'reload schema';
commit;
