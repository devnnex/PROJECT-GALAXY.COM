begin;

-- Keep the one-session rule without invalidating both browsers. A fresh login
-- takes ownership immediately; the older browser is closed by its heartbeat.
create or replace function public.claim_user_session() returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare
  v_user uuid:=auth.uid(); v_session uuid:=nullif(auth.jwt()->>'session_id','')::uuid;
  v_state public.user_session_state; v_profile public.profiles;
begin
  if v_user is null or v_session is null then raise exception 'Inicia sesion para continuar.' using errcode='P0001'; end if;
  select * into v_profile from public.profiles where id=v_user;
  if v_profile.id is null then raise exception 'Tu perfil no esta disponible.' using errcode='P0001'; end if;
  if v_profile.role='ADMIN' then
    return jsonb_build_object('status','ACTIVE','accountStatus',v_profile.status,'singleSessionExempt',true);
  end if;

  insert into public.user_session_state(user_id) values(v_user) on conflict(user_id) do nothing;
  select * into v_state from public.user_session_state where user_id=v_user for update;

  if v_state.active_session_id is null or v_state.active_session_id=v_session
    or v_state.last_seen_at is null or v_state.last_seen_at<now()-interval '75 seconds' then
    update public.user_session_state
    set active_session_id=v_session,last_seen_at=now(),conflict_until=null,updated_at=now()
    where user_id=v_user;
    return jsonb_build_object('status','ACTIVE','accountStatus',v_profile.status,'singleSessionExempt',false);
  end if;

  update public.user_session_state
  set active_session_id=v_session,last_seen_at=now(),conflict_until=null,updated_at=now()
  where user_id=v_user;
  return jsonb_build_object('status','ACTIVE','accountStatus',v_profile.status,
    'singleSessionExempt',false,'replacedPreviousSession',true);
end; $$;

revoke execute on function public.claim_user_session() from public,anon,authenticated;
grant execute on function public.claim_user_session() to authenticated;

commit;
