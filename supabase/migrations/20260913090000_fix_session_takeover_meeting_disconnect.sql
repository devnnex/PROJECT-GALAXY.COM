begin;

-- Some existing projects predate session coordination. Install its storage
-- first so this migration can be executed independently from schema.sql.
create table if not exists public.user_session_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  active_session_id uuid,
  last_seen_at timestamptz,
  conflict_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.user_session_state enable row level security;
revoke all on public.user_session_state from anon,authenticated;

-- Remove conflict windows left by the previous implementation. They revoked
-- Realtime access from both browsers, including the participant entering.
update public.user_session_state
set conflict_until=null,updated_at=now()
where conflict_until is not null;

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

create or replace function public.heartbeat_user_session() returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare
  v_user uuid:=auth.uid(); v_session uuid:=nullif(auth.jwt()->>'session_id','')::uuid;
  v_state public.user_session_state; v_profile public.profiles;
begin
  if v_user is null or v_session is null then raise exception 'Inicia sesion para continuar.' using errcode='P0001'; end if;
  select * into v_profile from public.profiles where id=v_user;
  if v_profile.id is null then raise exception 'Tu perfil no esta disponible.' using errcode='P0001'; end if;
  if v_profile.role='ADMIN' then return jsonb_build_object('status','ACTIVE','accountStatus',v_profile.status); end if;

  select * into v_state from public.user_session_state where user_id=v_user for update;
  if v_state.user_id is null or v_state.active_session_id is distinct from v_session then
    return jsonb_build_object('status','DUPLICATE','accountStatus',v_profile.status);
  end if;

  update public.user_session_state set last_seen_at=now(),conflict_until=null,updated_at=now()
  where user_id=v_user;
  return jsonb_build_object('status','ACTIVE','accountStatus',v_profile.status);
end; $$;

create or replace function public.release_user_session() returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare v_user uuid:=auth.uid(); v_session uuid:=nullif(auth.jwt()->>'session_id','')::uuid;
begin
  update public.user_session_state set active_session_id=null,last_seen_at=null,
    conflict_until=null,updated_at=now()
  where user_id=v_user and active_session_id=v_session;
  return jsonb_build_object('released',found);
end; $$;

create or replace function public.is_current_session_valid() returns boolean
language sql stable security definer set search_path=public,auth as $$
  select exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='ADMIN' and p.status='ACTIVE'
  ) or exists(
    select 1 from public.user_session_state s
    where s.user_id=auth.uid()
      and s.active_session_id=nullif(auth.jwt()->>'session_id','')::uuid
  );
$$;

revoke execute on function public.claim_user_session(),public.heartbeat_user_session(),
  public.release_user_session(),public.is_current_session_valid()
from public,anon,authenticated;
grant execute on function public.claim_user_session(),public.heartbeat_user_session(),
  public.release_user_session(),public.is_current_session_valid()
to authenticated;

commit;
