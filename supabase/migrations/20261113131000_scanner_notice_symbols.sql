begin;

-- Formatting only: keep trade outcomes, deduplication and recipients unchanged.
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

notify pgrst,'reload schema';
commit;
