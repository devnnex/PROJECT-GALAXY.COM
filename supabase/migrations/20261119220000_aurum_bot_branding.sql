begin;
-- Display-name change only. Keep strategy identifiers, state and ledgers.
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
notify pgrst,'reload schema';
commit;
