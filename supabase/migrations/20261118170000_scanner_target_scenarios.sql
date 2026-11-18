begin;

-- Cached, shared target scenarios. Readers never scan the raw trade ledger.
alter table public.scanner_daily_statistics add column if not exists targets jsonb not null default '[]'::jsonb;

create or replace function public.refresh_scanner_target_statistics(p_day date) returns void
language sql security definer set search_path=public as $$
  with facts as (
    select level,t.id,t.status,coalesce((t.payload->>('hit'||level))::boolean,false) as hit,
      coalesce((t.payload->>'hit1')::boolean,false) as previous_tp,
      (coalesce(t.outcome='SL',false) or exists(select 1 from public.scanner_events e where e.trade_id=t.id and e.type='SL')) as stopped,
      abs((t.payload->>('tp'||level))::numeric-(t.payload->>'entry')::numeric) as gain,
      abs((t.payload->>'sl')::numeric-(t.payload->>'entry')::numeric) as loss
    from generate_series(1,3) level left join public.scanner_trades t
      on t.bar_at>=p_day::timestamp at time zone 'America/Bogota'
      and t.bar_at<(p_day+1)::timestamp at time zone 'America/Bogota'
  ), grouped as (
    select level,count(*) filter(where hit) as wins,coalesce(sum(gain) filter(where hit),0) as gain,
      count(*) filter(where stopped and not hit) as losses,coalesce(sum(loss) filter(where stopped and not hit),0) as loss,
      count(*) filter(where stopped and not hit and previous_tp) as protected_stops,
      coalesce(sum(loss) filter(where stopped and not hit and previous_tp),0) as protected_loss,
      count(*) filter(where status='OPEN' and not hit and not stopped) as pending,
      count(*) filter(where status='CLOSED' and not hit and not stopped) as excluded
    from facts group by level
  ) update public.scanner_daily_statistics set targets=(select jsonb_agg(jsonb_build_object(
    'level',level,'wins',wins,'gain',gain,'losses',losses,'loss',loss,'protectedStops',protected_stops,
    'protectedLoss',protected_loss,'pending',pending,'excluded',excluded) order by level) from grouped),updated_at=now()
    where day=p_day;
$$;

create or replace function public.sync_scanner_target_statistics() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_day date; v_old_day date; v_trade uuid;
begin
  if tg_table_name='scanner_trades' then
    if tg_op='UPDATE' and old.payload is not distinct from new.payload and old.status=new.status
      and old.outcome is not distinct from new.outcome and old.bar_at=new.bar_at then return new; end if;
    if tg_op<>'INSERT' then v_old_day:=(old.bar_at at time zone 'America/Bogota')::date; end if;
    if tg_op<>'DELETE' then v_day:=(new.bar_at at time zone 'America/Bogota')::date; end if;
    if v_old_day is not null and v_old_day is distinct from v_day then perform public.refresh_scanner_target_statistics(v_old_day); end if;
  else
    if tg_op='DELETE' then
      if old.type<>'SL' then return old; end if;
      v_trade:=old.trade_id;
    else
      if new.type<>'SL' then return new; end if;
      v_trade:=new.trade_id;
    end if;
    select (bar_at at time zone 'America/Bogota')::date into v_day from public.scanner_trades where id=v_trade;
  end if;
  if v_day is not null then perform public.refresh_scanner_target_statistics(v_day); end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;

lock table public.scanner_trades,public.scanner_events in share row exclusive mode;
-- Run after the existing daily-total trigger, so newly inserted dates exist.
drop trigger if exists zz_scanner_target_statistics on public.scanner_trades;
create trigger zz_scanner_target_statistics after insert or update or delete on public.scanner_trades
  for each row execute function public.sync_scanner_target_statistics();
drop trigger if exists scanner_stop_target_statistics on public.scanner_events;
create trigger scanner_stop_target_statistics after insert or delete on public.scanner_events
  for each row execute function public.sync_scanner_target_statistics();
do $$ declare v_day date; begin
  for v_day in select day from public.scanner_daily_statistics loop perform public.refresh_scanner_target_statistics(v_day); end loop;
end $$;

create or replace function public.get_scanner_analytics() returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_registered_member();
begin
  return jsonb_build_object('timezone','America/Bogota','updatedAt',(select max(updated_at) from public.scanner_daily_statistics),
    'days',coalesce((select jsonb_agg(jsonb_build_object('day',day,'signals',totals[1],'wins',totals[2],'losses',totals[3],
      'ignored',totals[4],'open',totals[5],'gain',totals[6],'loss',totals[7],'hits',jsonb_build_array(totals[8],totals[9],totals[10]),
      'peakGain',totals[11],'targets',targets) order by day)
      from public.scanner_daily_statistics where totals[1]>0),'[]'::jsonb));
end; $$;

-- Check the expiry of the shared provider cache every five seconds. Only a
-- due, unlocked stream invokes the Edge Function; clients add no sampler load.
create or replace function public.claim_scanner_tick() returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_stream public.scanner_streams; v_lease uuid:=gen_random_uuid();
begin
  select * into v_stream from public.scanner_streams where id='xauusd-5m' and enabled and provider is not null
    and next_poll_at<=now() and coalesce(lease_until,'-infinity')<=now() for update skip locked;
  if not found then return null; end if;
  update public.scanner_streams set lease_id=v_lease,lease_until=now()+interval '90 seconds',next_poll_at=now()+interval '4 seconds' where id=v_stream.id;
  return jsonb_build_object('lease',v_lease,'provider',v_stream.provider,'settings',v_stream.settings,'runtime',v_stream.runtime);
end; $$;

-- An unavailable provider must not turn the faster scheduler into a hot retry
-- loop. Keep the saved state/history and back off only on actual failures.
create or replace function public.fail_scanner_tick(p_lease uuid,p_code text) returns void
language sql security definer set search_path=public as $$
  update public.scanner_streams set lease_id=null,lease_until=null,last_error=left(p_code,80),updated_at=now(),
    next_poll_at=greatest(next_poll_at,now()+interval '30 seconds') where id='xauusd-5m' and lease_id=p_lease;
$$;

revoke execute on function public.refresh_scanner_target_statistics(date),public.sync_scanner_target_statistics() from public,anon,authenticated;
grant execute on function public.refresh_scanner_target_statistics(date) to service_role;
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    if exists(select 1 from cron.job where jobname='galaxy-scanner-signals') then perform cron.unschedule('galaxy-scanner-signals'); end if;
    perform cron.schedule('galaxy-scanner-signals','5 seconds','select public.dispatch_scanner_tick();');
  end if;
end $$;
notify pgrst,'reload schema';
commit;
