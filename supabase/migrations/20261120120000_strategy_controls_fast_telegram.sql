begin;
-- Pause entries independently while keeping the shared feed and open trades live.
alter table public.scanner_streams add column if not exists signals_enabled boolean not null default true;
alter table public.range_scanner_state add column if not exists signals_enabled boolean not null default true;
alter table public.scanner_telegram_media drop constraint if exists scanner_telegram_media_key_check;
alter table public.scanner_telegram_media add constraint scanner_telegram_media_key_check check(key in ('BUY','SELL','AURUM'));

create or replace function public.get_trade_strategies() returns jsonb
language plpgsql stable security definer set search_path=public,auth as $$
declare u uuid:=public.require_admin();
begin
 if not exists(select 1 from auth.users where id=u and lower(email)='elkin56ty@gmail.com') then raise exception 'Acceso reservado.' using errcode='42501';end if;
 return jsonb_build_object('OPUS',(select signals_enabled from public.scanner_streams where id='xauusd-5m'),
 'RANGE777',(select signals_enabled from public.range_scanner_state where id));
end;$$;
create or replace function public.set_trade_strategy(p_strategy text,p_enabled boolean) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare u uuid:=public.require_admin();
begin
 if not exists(select 1 from auth.users where id=u and lower(email)='elkin56ty@gmail.com') then raise exception 'Acceso reservado.' using errcode='42501';end if;
 if p_enabled is null or p_strategy is null or p_strategy not in ('OPUS','RANGE777') then raise exception 'Estrategia no válida.';end if;
 if p_strategy='OPUS' then update public.scanner_streams set signals_enabled=p_enabled where id='xauusd-5m';
 else update public.range_scanner_state set signals_enabled=p_enabled where id;end if;
 return public.get_trade_strategies();
end;$$;
revoke execute on function public.get_trade_strategies(),public.set_trade_strategy(text,boolean) from public,anon,authenticated;
grant execute on function public.get_trade_strategies(),public.set_trade_strategy(text,boolean) to authenticated;

create or replace function public.claim_scanner_tick() returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_stream public.scanner_streams; v_lease uuid:=gen_random_uuid();
begin
  select * into v_stream from public.scanner_streams where id='xauusd-5m' and enabled and provider is not null
    and next_poll_at<=now() and coalesce(lease_until,'-infinity')<=now() for update skip locked;
  if not found then return null; end if;
  update public.scanner_streams set lease_id=v_lease,lease_until=now()+interval '90 seconds',next_poll_at=now()+interval '14 seconds' where id=v_stream.id;
  return jsonb_build_object('lease',v_lease,'provider',v_stream.provider,'settings',v_stream.settings,'runtime',v_stream.runtime,'signalsEnabled',v_stream.signals_enabled);
end; $$;

create or replace function public.claim_range_tick() returns jsonb
language plpgsql security definer set search_path=public as $$
declare s public.range_scanner_state;l uuid:=gen_random_uuid();
begin
 select * into s from public.range_scanner_state where id and enabled and coalesce(lease_until,'-infinity')<=now() for update skip locked;
 if not found then return null;end if;
 update public.range_scanner_state set lease=l,lease_until=now()+interval '30 seconds' where id;
 return jsonb_build_object('lease',l,'runtime',s.runtime,'signalsEnabled',s.signals_enabled);
end;$$;

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
  -- Serialize entry publication with the administrator's pause switch.
  if not v_stream.signals_enabled and exists(select 1 from jsonb_array_elements(p_events) as incoming(value) where incoming.value->>'type'='SIGNAL') then
    update public.scanner_streams set lease_id=null,lease_until=null,next_poll_at=now() where id=v_stream.id;
    return false;
  end if;
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
      v_body:='🔵 Entrada '||round((v_payload->>'entry')::numeric,3)||' | 🔴 SL '||round((v_payload->>'sl')::numeric,3)
        ||' | '||(case when coalesce((v_payload->>'hit1')::boolean,false) then '✅' else '🎯' end)||' TP1 '||round((v_payload->>'tp1')::numeric,3)
        ||' | '||(case when coalesce((v_payload->>'hit2')::boolean,false) then '✅' else '🎯' end)||' TP2 '||round((v_payload->>'tp2')::numeric,3)
        ||' | '||(case when coalesce((v_payload->>'hit3')::boolean,false) then '✅' else '🎯' end)||' TP3 '||round((v_payload->>'tp3')::numeric,3);
      v_title:=(case when v_event->>'type'='SIGNAL' then '🔵 '||(v_payload->>'side')||' · Entrada'
        when v_event->>'type'='SL' and v_payload->>'outcome'='WIN' then '🔴 SL · Salida tras TP · sin descuento'
        when v_event->>'type'='SL' then '🔴 SL · Salida'
        else '✅ '||(v_event->>'type')||' alcanzado' end)||' · XAUUSD · 5m';
      insert into public.notifications(user_id,type,title,body,resource_type,resource_id)
        select p.id,'SCANNER_SIGNAL',v_title,v_body,'ScannerEvent',v_event_id
        from public.profiles p where p.status='ACTIVE' and not p.is_guest and public.has_active_membership(p.id);
    end if;
  end loop;
  if jsonb_array_length(p_events)>0 then perform public.dispatch_pending_push(); end if;
  update public.scanner_streams set runtime=p_runtime,lease_id=null,lease_until=null,last_error=null,updated_at=now() where id=v_stream.id;
  return true;
end; $$;

create or replace function public.complete_range_tick(p_lease uuid,p_runtime jsonb,p_trades jsonb,p_events jsonb) returns boolean
language plpgsql security definer set search_path=public as $$
declare s public.range_scanner_state;t jsonb;e jsonb;tid uuid;eid uuid;at_time timestamptz;p jsonb;title text;body text;
begin
 select * into s from public.range_scanner_state where id for update;
 if not found or not s.enabled or p_lease is null or s.lease is distinct from p_lease or s.lease_until is null or s.lease_until<now() then return false;end if;
 if jsonb_typeof(p_runtime) is distinct from 'object' or octet_length(p_runtime::text)>32768 or jsonb_typeof(p_trades) is distinct from 'array' or jsonb_array_length(p_trades)>2
 or jsonb_typeof(p_events) is distinct from 'array' or jsonb_array_length(p_events)>3 then raise exception 'Invalid range batch';end if;
 if not s.signals_enabled and exists(select 1 from jsonb_array_elements(p_events) as incoming(value) where incoming.value->>'type'='SIGNAL') then
  update public.range_scanner_state set lease=null,lease_until=null where id;return false;
 end if;
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
  if eid is not null and (e->>'type'<>'BE' or ((p->>'sl')::numeric-(p->>'entry')::numeric)*case when p->>'side'='BUY' then 1 else -1 end>0) and not(e->>'type'='CLOSED' and p->>'outcome'='BE') then
   title:=(case when e->>'type'='SIGNAL' then '🔵 '||(p->>'side') when e->>'type'='BE' then '🛡 Beneficio protegido' when p->>'outcome'='WIN' then '🏆 SL Profit · Ganada' else '🔴 SL' end)||' · Galaxy Aurum Bot · XAUUSD · 5m';
   body:='🔵 Entrada '||round((p->>'entry')::numeric,3)||' | 🔴 SL '||round((p->>'sl')::numeric,3)||' | SL positivo desde +$10 · Trailing $5';
   if e->>'type'='CLOSED' then body:=body||case when p->>'accountingBasis'='STOP_LEVEL' then ' | SL Profit de la señal ' else ' | Salida observada ' end||round((p->>'exit')::numeric,3);end if;
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
 ranked as (select day,totals[2] wins,totals[3] losses,totals[4] breakevens,totals[2]*100/(totals[2]+totals[3]) rate from days where totals[2]+totals[3]>0)
 select jsonb_build_object('strategy','RANGE777','from',p_from,'to',p_to,'asOf',now(),'signals',coalesce(sum(totals[1]),0),'wins',coalesce(sum(totals[2]),0),
 'losses',coalesce(sum(totals[3]),0),'breakevens',coalesce(sum(totals[4]),0),'open',coalesce(sum(totals[5]),0),'net',coalesce(sum(totals[6]),0),
 'gain',coalesce(sum(totals[7]),0),'loss',coalesce(sum(totals[8]),0),'protected',coalesce(sum(totals[9]),0),'signalDays',count(*),
 'bestDay',(select to_jsonb(r) from ranked r order by rate desc,wins+losses desc,day limit 1)) from days;
$$;

create or replace function public.dispatch_scanner_telegram() returns void
language plpgsql security definer set search_path=public,vault,net as $$
declare v_url text; v_secret text;
begin
  if not exists(select 1 from public.scanner_telegram_jobs where state='pending' and attempts<8 and expires_at>now() and next_attempt_at<=now() and leased_until<=now()) then return; end if;
  update public.scanner_telegram_settings set dispatch_until=now()+interval '1 second'
    where id and enabled and dispatch_until<=now();
  if not found then return; end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name='galaxy_telegram_dispatch_url' limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='galaxy_telegram_dispatch_secret' limit 1;
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(url:=v_url,headers:=jsonb_build_object('Content-Type','application/json','x-galaxy-telegram-secret',v_secret),body:='{}'::jsonb,timeout_milliseconds:=30000);
exception when others then
  -- Telegram/pg_net availability must never roll back a live scanner result.
  return;
end; $$;
-- Retain Telegram's documented group limit (20/minute) and event priority.
-- Retry transient transport errors promptly; honour Telegram retry_after fully.

create or replace function public.finish_scanner_telegram_job(p_id bigint,p_lease uuid,p_status text,p_message_id bigint default null,p_retry_after integer default 0,p_code text default null) returns boolean
language plpgsql security definer set search_path=public as $$
declare v_attempts integer; v_delay integer;
begin
  if p_status not in ('sent','retry','failed') then raise exception 'Invalid delivery status'; end if;
  select attempts into v_attempts from public.scanner_telegram_jobs where id=p_id and lease_token=p_lease and state='pending' for update;
  if not found then return false; end if;
  v_delay:=least(86400,greatest(2*power(2,least(v_attempts-1,7))::integer,coalesce(p_retry_after,0)));
  update public.scanner_telegram_jobs set state=case when p_status='retry' and attempts<8 then 'pending' when p_status='retry' then 'failed' else p_status end,
    next_attempt_at=now()+make_interval(secs=>v_delay),leased_until='-infinity',lease_token=null,
    sent_at=case when p_status='sent' then now() end,telegram_message_id=p_message_id,last_code=left(p_code,32) where id=p_id;
  if p_retry_after>0 then update public.scanner_telegram_settings set next_send_at=greatest(next_send_at,now()+make_interval(secs=>least(p_retry_after,86400))) where id; end if;
  return true;
end; $$;
update public.range_scanner_trades set outcome='WIN',payload=payload||jsonb_build_object(
 'outcome','WIN','exitReason','SL_PROFIT','accountingBasis','STOP_LEVEL',
 'observedExit',coalesce(payload->'observedExit',payload->'exit'),
 'observedNet',coalesce(payload->'observedNet',payload->'net'),
 'exit',(payload->>'sl')::numeric,
 'net',round(((payload->>'sl')::numeric-(payload->>'entry')::numeric)*case when payload->>'side'='BUY' then 1 else -1 end,6))
where status='CLOSED' and ((payload->>'sl')::numeric-(payload->>'entry')::numeric)*case when payload->>'side'='BUY' then 1 else -1 end>0
and payload->>'accountingBasis' is distinct from 'STOP_LEVEL';
update public.range_scanner_events e set payload=t.payload from public.range_scanner_trades t
where e.trade_id=t.id and e.type='CLOSED' and t.payload->>'accountingBasis'='STOP_LEVEL' and e.payload is distinct from t.payload;
update public.scanner_telegram_jobs j set payload=j.payload||jsonb_build_object('trade',t.payload,'historicalSlProfitCorrection',true)
from public.range_scanner_trades t where j.kind='EVENT' and j.payload->>'strategy'='RANGE777'
and j.payload->>'type'='CLOSED' and j.payload->>'tradeId'=t.id::text and t.payload->>'accountingBasis'='STOP_LEVEL'
and j.payload->'trade' is distinct from t.payload;
update public.notifications n set title='🏆 SL Profit · Ganada · Galaxy Aurum Bot · XAUUSD · 5m',
body='Entrada '||(e.payload->>'entry')||' | SL '||(e.payload->>'sl')||' | SL Profit de la señal '||(e.payload->>'exit')
from public.range_scanner_events e where n.resource_type='RangeEvent' and n.resource_id=e.id
and e.type='CLOSED' and e.payload->>'accountingBasis'='STOP_LEVEL';
update public.range_scanner_state s set runtime=jsonb_set(s.runtime,'{trade}',t.payload)
from public.range_scanner_trades t where s.runtime#>>'{trade,key}'=t.trade_key and t.payload->>'accountingBasis'='STOP_LEVEL';

-- Do not deliver obsolete protection-only messages left in the old queue.
update public.scanner_telegram_jobs set state='expired',lease_token=null
where state='pending' and leased_until<=now() and payload->>'strategy'='RANGE777'
and ((payload->>'type'='BE' and ((payload#>>'{trade,sl}')::numeric-(payload#>>'{trade,entry}')::numeric)*case when payload#>>'{trade,side}'='BUY' then 1 else -1 end<=0) or (payload->>'type'='CLOSED' and payload#>>'{trade,outcome}'='BE'));
do $$begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  if exists(select 1 from cron.job where jobname='galaxy-scanner-telegram') then perform cron.unschedule('galaxy-scanner-telegram');end if;
  perform cron.schedule('galaxy-scanner-telegram','1 second','select public.dispatch_scanner_telegram();');
 end if;
end;$$;
notify pgrst,'reload schema';
commit;
