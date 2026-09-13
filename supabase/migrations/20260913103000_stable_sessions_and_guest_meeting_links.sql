begin;

alter table public.profiles add column if not exists is_guest boolean not null default false;
alter table public.meeting_share_links add column if not exists guest_limit integer not null default 1
  check (guest_limit between 1 and 100);
alter table public.meeting_share_links add column if not exists guest_count integer not null default 0
  check (guest_count between 0 and guest_limit);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
  v_username text;
  v_username_base text;
  v_suffix text;
  v_role text := 'USER';
  v_is_guest boolean := coalesce(new.is_anonymous,false);
begin
  if v_is_guest and (
    coalesce(new.raw_user_meta_data->>'meeting_invite_token','') !~ '^[0-9a-f]{64}$'
    or not exists(
      select 1 from public.meeting_share_links link
      join public.meetings meeting on meeting.id=link.meeting_id
      where link.token_hash=extensions.digest(lower(new.raw_user_meta_data->>'meeting_invite_token'),'sha256')
        and link.revoked_at is null and link.expires_at>now() and link.guest_count<link.guest_limit
        and meeting.status='ACTIVE' and (meeting.scheduled_ends_at is null or meeting.scheduled_ends_at>now())
    )
  ) then
    raise exception 'Se requiere un enlace de reunion vigente para crear un invitado.';
  end if;
  v_suffix:=substr(replace(new.id::text,'-',''),1,10);
  v_name:=coalesce(nullif(trim(new.raw_user_meta_data->>'name'),''),nullif(trim(split_part(coalesce(new.email,''),'@',1)),''),'Usuario Galaxy');
  if char_length(v_name)<2 then v_name:='Usuario Galaxy'; end if;
  v_username_base:=lower(coalesce(nullif(trim(new.raw_user_meta_data->>'username'),''),split_part(coalesce(new.email,''),'@',1),''));
  v_username_base:=regexp_replace(v_username_base,'[^a-z0-9_]+','_','g');
  v_username_base:=trim(both '_' from v_username_base);
  if char_length(v_username_base)<3 then v_username_base:='galaxy_'||v_suffix; end if;
  v_username:=left(v_username_base,32);
  if exists(select 1 from public.admin_access_allowlist a where a.email=coalesce(new.email,'')) then v_role:='ADMIN'; end if;
  begin
    insert into public.profiles(id,name,username,role,is_guest) values(new.id,left(v_name,100),v_username,v_role,v_is_guest);
  exception when unique_violation then
    v_username:=left(v_username_base,21)||'_'||v_suffix;
    insert into public.profiles(id,name,username,role,is_guest) values(new.id,left(v_name,100),v_username,v_role,v_is_guest);
  end;
  insert into public.wallets(user_id) values (new.id);
  return new;
end; $$;

create or replace function public.claim_user_session() returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare v_user uuid:=auth.uid(); v_session uuid:=nullif(auth.jwt()->>'session_id','')::uuid; v_profile public.profiles;
begin
  if v_user is null or v_session is null then raise exception 'Inicia sesion para continuar.' using errcode='P0001'; end if;
  select * into v_profile from public.profiles where id=v_user;
  if v_profile.id is null then raise exception 'Tu perfil no esta disponible.' using errcode='P0001'; end if;
  insert into public.user_session_state(user_id,active_session_id,last_seen_at,conflict_until)
  values(v_user,v_session,now(),null)
  on conflict(user_id) do update set active_session_id=excluded.active_session_id,
    last_seen_at=excluded.last_seen_at,conflict_until=null,updated_at=now();
  return jsonb_build_object('status','ACTIVE','accountStatus',v_profile.status);
end; $$;

create or replace function public.heartbeat_user_session() returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare v_user uuid:=auth.uid(); v_session uuid:=nullif(auth.jwt()->>'session_id','')::uuid; v_profile public.profiles;
begin
  if v_user is null or v_session is null then raise exception 'Inicia sesion para continuar.' using errcode='P0001'; end if;
  select * into v_profile from public.profiles where id=v_user;
  if v_profile.id is null then raise exception 'Tu perfil no esta disponible.' using errcode='P0001'; end if;
  insert into public.user_session_state(user_id,active_session_id,last_seen_at,conflict_until)
  values(v_user,v_session,now(),null)
  on conflict(user_id) do update set active_session_id=excluded.active_session_id,
    last_seen_at=excluded.last_seen_at,conflict_until=null,updated_at=now();
  return jsonb_build_object('status','ACTIVE','accountStatus',v_profile.status);
end; $$;

create or replace function public.require_user() returns uuid
language plpgsql stable security definer set search_path=public,auth as $$
declare v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'Inicia sesion para continuar.' using errcode='P0001'; end if;
  if not exists(select 1 from public.profiles where id=v_user) then raise exception 'Tu perfil no esta disponible.' using errcode='P0001'; end if;
  return v_user;
end; $$;

create or replace function public.is_current_session_valid() returns boolean
language sql stable security definer set search_path=public,auth as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='ACTIVE');
$$;

create or replace function public.can_access_realtime_topic(p_topic text,p_extension text) returns boolean
language sql stable security definer set search_path=public,auth as $$
  select public.is_current_session_valid() and p_extension in ('broadcast','presence') and (
    p_topic='user:'||(select auth.uid())::text
    or (p_topic='community:online' and p_extension='presence' and public.has_active_membership((select auth.uid()))
      and not exists(select 1 from public.profiles where id=(select auth.uid()) and is_guest))
    or p_topic like 'db:notifications:'||(select auth.uid())::text||':%'
    or p_topic like 'db:wallet:'||(select auth.uid())::text||':%'
    or (public.has_active_membership((select auth.uid())) and exists(
      select 1 from public.meeting_participants p where p.user_id=(select auth.uid()) and (
        (p.status='ADMITTED' and p_topic='meeting:'||p.meeting_id::text)
        or (p.status<>'DENIED' and p_topic like 'db:participants:'||p.meeting_id::text||':%')
      )
    ))
  );
$$;

create or replace function public.get_current_user() returns jsonb
language sql stable security definer set search_path = public, auth as $$
  select jsonb_build_object('id', p.id, 'name', p.name, 'username', p.username, 'email', u.email,
    'avatar',p.avatar,'bio', p.bio, 'role', p.role, 'level', p.level, 'xp', p.xp, 'status', p.status,
    'isGuest',p.is_guest,'createdAt', p.created_at, 'emailVerified', u.email_confirmed_at is not null,
    'membership',public.membership_view(p.id),
    'wallet',coalesce((select jsonb_build_object('availableBalance',w.available_balance,'pendingBalance',w.pending_balance,
      'totalEarned',w.total_earned,'totalSpent',w.total_spent,'currency',w.currency) from public.wallets w where w.user_id=p.id),
      jsonb_build_object('availableBalance',0,'pendingBalance',0,'totalEarned',0,'totalSpent',0,'currency','USDT')))
  from public.profiles p join auth.users u on u.id = p.id where p.id = public.require_user();
$$;

create or replace function public.get_admin_users() returns jsonb
language sql stable security definer set search_path=public,auth as $$
  with admin as (select public.require_admin() id)
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'name',p.name,'username',p.username,'email',u.email,'avatar',p.avatar,'membership',public.membership_view(p.id),'role',p.role,'status',p.status,
    'createdAt',p.created_at,'lastSeenAt',s.last_seen_at,'sessionActive',s.active_session_id is not null and s.last_seen_at>now()-interval '75 seconds'
  ) order by case when p.role='ADMIN' then 0 else 1 end,p.created_at desc),'[]'::jsonb)
  from public.profiles p join auth.users u on u.id=p.id cross join admin
  left join public.user_session_state s on s.user_id=p.id
  where p.status<>'DELETED' and not p.is_guest;
$$;

drop function if exists public.create_meeting_share_link(uuid);
create or replace function public.create_meeting_share_link(p_meeting_id uuid,p_guest_limit integer default 1) returns jsonb
language plpgsql security definer set search_path=public,auth,extensions as $$
declare v_admin uuid:=public.require_admin(); v_token text; v_meeting public.meetings;
begin
  if coalesce(p_guest_limit,0) not between 1 and 100 then raise exception 'La cantidad de invitados debe estar entre 1 y 100.' using errcode='P0001'; end if;
  select * into v_meeting from public.meetings where id=p_meeting_id and host_id=v_admin and status='ACTIVE';
  if v_meeting.id is null then raise exception 'Solo puedes compartir una reunion activa que hayas creado.' using errcode='P0001'; end if;
  delete from public.meeting_share_links where expires_at<=now() or revoked_at is not null;
  v_token:=encode(gen_random_bytes(32),'hex');
  insert into public.meeting_share_links(meeting_id,created_by,token_hash,expires_at,guest_limit)
  values(v_meeting.id,v_admin,digest(v_token,'sha256'),least(now()+interval '7 days',coalesce(v_meeting.scheduled_ends_at,now()+interval '7 days')),p_guest_limit);
  return jsonb_build_object('token',v_token,'expiresAt',least(now()+interval '7 days',coalesce(v_meeting.scheduled_ends_at,now()+interval '7 days')),'guestLimit',p_guest_limit);
end; $$;

create or replace function public.inspect_meeting_share_link(p_token text) returns jsonb
language plpgsql stable security definer set search_path=public,extensions as $$
declare v_link public.meeting_share_links; v_meeting public.meetings;
begin
  if coalesce(p_token,'') !~ '^[0-9a-f]{64}$' then raise exception 'El enlace de invitacion no es valido.' using errcode='P0001'; end if;
  select l.* into v_link from public.meeting_share_links l where l.token_hash=digest(lower(p_token),'sha256') and l.revoked_at is null and l.expires_at>now();
  if v_link.id is null then raise exception 'El enlace de invitacion expiro o fue revocado.' using errcode='P0001'; end if;
  select * into v_meeting from public.meetings where id=v_link.meeting_id and status='ACTIVE';
  if v_meeting.id is null or (v_meeting.scheduled_ends_at is not null and v_meeting.scheduled_ends_at<=now()) then raise exception 'La reunion ya no esta disponible.' using errcode='P0001'; end if;
  if v_link.guest_count>=v_link.guest_limit then raise exception 'Este enlace ya completo su cantidad de invitados.' using errcode='P0001'; end if;
  return jsonb_build_object('title',v_meeting.title,'expiresAt',v_link.expires_at,'guestLimit',v_link.guest_limit,'guestsRemaining',v_link.guest_limit-v_link.guest_count);
end; $$;

create or replace function public.redeem_meeting_share_link(p_token text) returns jsonb
language plpgsql security definer set search_path=public,auth,extensions as $$
declare v_user uuid:=public.require_user(); v_link public.meeting_share_links; v_meeting public.meetings; v_profile public.profiles; v_ice jsonb;
begin
  if coalesce(p_token,'') !~ '^[0-9a-f]{64}$' then raise exception 'El enlace de invitacion no es valido.' using errcode='P0001'; end if;
  select l.* into v_link from public.meeting_share_links l where l.token_hash=digest(lower(p_token),'sha256') and l.revoked_at is null and l.expires_at>now() for update;
  if v_link.id is null then raise exception 'El enlace de invitacion expiro o fue revocado.' using errcode='P0001'; end if;
  select * into v_meeting from public.meetings where id=v_link.meeting_id and status='ACTIVE';
  if v_meeting.id is null or (v_meeting.scheduled_ends_at is not null and v_meeting.scheduled_ends_at<=now()) then raise exception 'La reunion ya no esta disponible.' using errcode='P0001'; end if;
  select * into v_profile from public.profiles where id=v_user and status='ACTIVE';
  if v_profile.id is null then raise exception 'Tu perfil no esta disponible.' using errcode='P0001'; end if;
  if v_profile.is_guest and char_length(trim(v_profile.name)) not between 2 and 60 then raise exception 'Escribe tu nombre antes de entrar.' using errcode='P0001'; end if;
  if v_profile.is_guest and not exists(select 1 from public.meeting_participants where meeting_id=v_meeting.id and user_id=v_user) then
    if v_link.guest_count>=v_link.guest_limit then raise exception 'Este enlace ya completo su cantidad de invitados.' using errcode='P0001'; end if;
    update public.meeting_share_links set guest_count=guest_count+1 where id=v_link.id;
  end if;
  insert into public.meeting_participants(meeting_id,user_id,role,status,joined_at,left_at)
  values(v_meeting.id,v_user,'PARTICIPANT','ADMITTED',now(),null)
  on conflict(meeting_id,user_id) do update set status='ADMITTED',joined_at=coalesce(public.meeting_participants.joined_at,now()),left_at=null;
  select value into v_ice from public.app_settings where key='ice_servers';
  return public.meeting_summary(v_meeting,v_user)||jsonb_build_object('role','PARTICIPANT','participantStatus','ADMITTED',
    'iceServers',coalesce(v_ice,'[]'::jsonb),'messages',public.get_meeting_messages(v_meeting.id,100),'guest',v_profile.is_guest);
end; $$;

create or replace function public.join_meeting(p_room_code text, p_password text default '') returns jsonb
language plpgsql security definer set search_path = public, auth, extensions as $$
declare v_user uuid := public.require_active_membership(); v_meeting public.meetings; v_member public.meeting_participants; v_status text; v_role text; v_ice jsonb;
begin
  select * into v_meeting from public.meetings where room_code = upper(trim(p_room_code));
  if v_meeting.scheduled_ends_at is not null and (v_meeting.starts_at>now() or v_meeting.scheduled_ends_at<=now()) then
    raise exception 'La reunion programada no esta disponible en este momento.' using errcode='P0001';
  end if;
  if v_meeting.id is null or v_meeting.status = 'ENDED' then raise exception 'La sala no existe o ya termino.' using errcode = 'P0001'; end if;
  select * into v_member from public.meeting_participants where meeting_id = v_meeting.id and user_id = v_user;
  if exists(select 1 from public.profiles where id=v_user and is_guest) and v_member.id is null then
    raise exception 'Este invitado solo puede entrar mediante su enlace autorizado.' using errcode='42501';
  end if;
  if v_meeting.host_id <> v_user and v_meeting.locked then raise exception 'La sala esta bloqueada por el anfitrion.' using errcode = 'P0001'; end if;
  if v_meeting.host_id <> v_user and v_member.id is null and v_meeting.password_hash is not null and crypt(coalesce(p_password,''), v_meeting.password_hash) <> v_meeting.password_hash then raise exception 'La contrasena de la sala no coincide.' using errcode = 'P0001'; end if;
  v_role := case when v_meeting.host_id = v_user then 'HOST' else 'PARTICIPANT' end;
  v_status := case when v_meeting.host_id = v_user then 'ADMITTED' when v_member.status = 'DENIED' then 'DENIED' when v_member.status = 'ADMITTED' then 'ADMITTED' when v_meeting.waiting_room then 'WAITING' else 'ADMITTED' end;
  if v_status = 'DENIED' then raise exception 'El anfitrion no autorizo tu ingreso.' using errcode = 'P0001'; end if;
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
      v_meeting.title||' - '||v_meeting.room_code,'Meeting',v_meeting.id
    from public.profiles p where p.id=v_user;
  end if;
  select value into v_ice from public.app_settings where key = 'ice_servers';
  return public.meeting_summary(v_meeting,v_user) || jsonb_build_object('role',v_role,'participantStatus',v_status,
    'iceServers',coalesce(v_ice,'[]'::jsonb),'messages',case when v_status='ADMITTED' then public.get_meeting_messages(v_meeting.id,100) else '[]'::jsonb end);
end; $$;

create or replace function public.get_community_members(p_query text default '') returns jsonb
language sql stable security definer set search_path=public,auth as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'username',p.username,'avatar',p.avatar,'membership',public.membership_view(p.id)) order by p.name),'[]'::jsonb)
  from (select * from public.profiles where id<>public.require_active_membership() and status='ACTIVE' and not is_guest
    and public.has_active_membership(id) and (coalesce(trim(p_query),'')='' or name ilike '%'||trim(p_query)||'%' or username::text ilike '%'||trim(p_query)||'%') order by name limit 100) p;
$$;

create or replace function public.get_meeting_invite_candidates(p_meeting_id uuid,p_query text default '') returns jsonb
language plpgsql stable security definer set search_path=public,auth as $$
declare v_host uuid:=public.require_active_membership(); v_result jsonb;
begin
  if not exists(select 1 from public.meetings where id=p_meeting_id and host_id=v_host and status='ACTIVE') then raise exception 'Solo el anfitrion puede consultar las invitaciones.' using errcode='P0001'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',candidate.id,'name',candidate.name,'username',candidate.username,'avatar',candidate.avatar,'membership',public.membership_view(candidate.id),
    'invitationId',candidate.invitation_id,'invitationStatus',candidate.invitation_status,'invitationSeenAt',candidate.seen_at,
    'invitationRespondedAt',candidate.responded_at,'invitationCreatedAt',candidate.invitation_created_at,'inviteCount',candidate.invite_count,
    'participantStatus',candidate.participant_status) order by candidate.name),'[]'::jsonb) into v_result
  from (
    select p.id,p.name,p.username,p.avatar,mi.id invitation_id,mi.status invitation_status,mi.seen_at,mi.responded_at,
      mi.created_at invitation_created_at,coalesce(mi.invite_count,0) invite_count,mp.status participant_status
    from public.profiles p
    left join public.meeting_invitations mi on mi.meeting_id=p_meeting_id and mi.invitee_id=p.id
    left join public.meeting_participants mp on mp.meeting_id=p_meeting_id and mp.user_id=p.id
    where p.id<>v_host and p.status='ACTIVE' and not p.is_guest and public.has_active_membership(p.id)
      and (coalesce(trim(p_query),'')='' or p.name ilike '%'||trim(p_query)||'%' or p.username::text ilike '%'||trim(p_query)||'%')
    order by p.name limit 100
  ) candidate;
  return v_result;
end; $$;

-- Anonymous Auth users bypass only the paid registration invitation trigger.
-- Their meeting access is still enforced by the one-way link and its quota.
drop trigger if exists zz_accept_registration_invitation on auth.users;
create trigger zz_accept_registration_invitation after insert on auth.users
for each row when (not new.is_anonymous) execute function public.accept_registration_invitation();

drop policy if exists profiles_authenticated_read on public.profiles;
create policy profiles_authenticated_read on public.profiles for select to authenticated using (
  status='ACTIVE' and public.is_current_session_valid() and (
    coalesce((auth.jwt()->>'is_anonymous')::boolean,false)=false or id=auth.uid()
  )
);

revoke all on function public.inspect_meeting_share_link(text) from public,anon,authenticated;
revoke all on function public.create_meeting_share_link(uuid,integer) from public,anon,authenticated;
revoke all on function public.redeem_meeting_share_link(text) from public,anon,authenticated;
grant usage on schema public to anon,authenticated;
grant execute on function public.inspect_meeting_share_link(text) to anon,authenticated;
grant execute on function public.create_meeting_share_link(uuid,integer),public.redeem_meeting_share_link(text) to authenticated;

commit;
