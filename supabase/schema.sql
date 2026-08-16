-- PROJECT GALAXY · Supabase/PostgreSQL schema
-- Ejecutar completo en Supabase Dashboard > SQL Editor después de cada actualización del esquema.
-- Es idempotente para objetos y políticas; no borra datos existentes.

begin;

create extension if not exists pgcrypto;
create extension if not exists citext;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  username citext not null unique check (username::text ~ '^[a-z0-9_]{3,32}$'),
  avatar text not null default '',
  cover text not null default '',
  bio text not null default '' check (char_length(bio) <= 500),
  role text not null default 'USER' check (role in ('USER','CREATOR','SELLER','MODERATOR','ADMIN')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','SUSPENDED','DELETED')),
  level integer not null default 1 check (level >= 1),
  xp bigint not null default 0 check (xp >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  available_balance numeric(20,8) not null default 0 check (available_balance >= 0),
  pending_balance numeric(20,8) not null default 0 check (pending_balance >= 0),
  total_earned numeric(20,8) not null default 0 check (total_earned >= 0),
  total_spent numeric(20,8) not null default 0 check (total_spent >= 0),
  currency text not null default 'USDT',
  updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  is_secret boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.app_settings(key, value, is_secret) values
  ('ice_servers', '[{"urls":"stun:stun.l.google.com:19302"}]'::jsonb, false)
on conflict (key) do nothing;

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete restrict,
  room_code text not null unique check (room_code ~ '^[A-F0-9]{4}-[A-F0-9]{4}$'),
  password_hash text,
  title text not null check (char_length(title) between 1 and 140),
  waiting_room boolean not null default true,
  locked boolean not null default false,
  permissions jsonb not null default '{"screenShare":"ALL","chat":true,"reactions":true,"hostCanMute":true}'::jsonb,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ENDED')),
  starts_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meeting_participants (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'PARTICIPANT' check (role in ('HOST','PARTICIPANT')),
  status text not null default 'WAITING' check (status in ('INVITED','WAITING','ADMITTED','DENIED')),
  joined_at timestamptz,
  left_at timestamptz,
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(meeting_id, user_id)
);

create table if not exists public.meeting_invitations (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','DECLINED')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique(meeting_id, invitee_id)
);

create table if not exists public.meeting_messages (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (char_length(body) between 1 and 2000),
  reply_to_id uuid references public.meeting_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create table if not exists public.meeting_message_reactions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  message_id uuid not null references public.meeting_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('👍','👏','❤️','😂','🎉','🔥')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(message_id, user_id, emoji)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null default '',
  resource_type text not null default '',
  resource_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.meeting_commands (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  issuer_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  command text not null check (command in ('MUTE')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 seconds'),
  consumed_at timestamptz
);

create index if not exists meetings_host_created_idx on public.meetings(host_id, created_at desc);
create index if not exists participants_user_status_idx on public.meeting_participants(user_id, status, meeting_id);
create index if not exists participants_meeting_status_idx on public.meeting_participants(meeting_id, status);
create index if not exists messages_meeting_created_idx on public.meeting_messages(meeting_id, created_at desc);
create index if not exists messages_sender_created_idx on public.meeting_messages(sender_id, created_at desc);
create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc) where read_at is null;
create index if not exists meeting_commands_target_idx on public.meeting_commands(target_user_id, created_at desc) where consumed_at is null;

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles for each row execute function public.touch_updated_at();
drop trigger if exists meetings_touch_updated_at on public.meetings;
create trigger meetings_touch_updated_at before update on public.meetings for each row execute function public.touch_updated_at();
drop trigger if exists participants_touch_updated_at on public.meeting_participants;
create trigger participants_touch_updated_at before update on public.meeting_participants for each row execute function public.touch_updated_at();
drop trigger if exists reactions_touch_updated_at on public.meeting_message_reactions;
create trigger reactions_touch_updated_at before update on public.meeting_message_reactions for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, auth as $$
declare v_name text; v_username text;
begin
  v_name := trim(coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)));
  v_username := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1))));
  if v_username !~ '^[a-z0-9_]{3,32}$' then v_username := 'user_' || substr(replace(new.id::text, '-', ''), 1, 10); end if;
  if exists(select 1 from public.profiles where username = v_username) then v_username := left(v_username, 20) || '_' || substr(replace(new.id::text, '-', ''), 1, 6); end if;
  insert into public.profiles(id, name, username) values (new.id, left(v_name, 100), v_username);
  insert into public.wallets(user_id) values (new.id);
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.require_user() returns uuid
language plpgsql stable security definer set search_path = public, auth as $$
declare v_user uuid := auth.uid();
begin if v_user is null then raise exception 'Inicia sesión para continuar.' using errcode = 'P0001'; end if; return v_user; end; $$;

create or replace function public.is_admitted_to_meeting(p_meeting_id uuid) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists(select 1 from public.meeting_participants where meeting_id = p_meeting_id and user_id = auth.uid() and status = 'ADMITTED');
$$;

create or replace function public.meeting_summary(p_meeting public.meetings, p_user uuid) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('id', p_meeting.id, 'meetingId', p_meeting.id, 'title', p_meeting.title,
    'roomCode', p_meeting.room_code, 'status', p_meeting.status, 'waitingRoom', p_meeting.waiting_room,
    'locked', p_meeting.locked, 'host', p_meeting.host_id = p_user, 'hostId', p_meeting.host_id,
    'startsAt', p_meeting.starts_at, 'endedAt', p_meeting.ended_at);
$$;

create or replace function public.get_current_user() returns jsonb
language sql stable security definer set search_path = public, auth as $$
  select jsonb_build_object('id', p.id, 'name', p.name, 'username', p.username, 'email', u.email,
    'avatar', p.avatar, 'role', p.role, 'level', p.level, 'status', p.status,
    'createdAt', p.created_at, 'emailVerified', u.email_confirmed_at is not null)
  from public.profiles p join auth.users u on u.id = p.id where p.id = public.require_user();
$$;

create or replace function public.get_bootstrap_data(p_modules text[] default array['user']) returns jsonb
language sql stable security definer set search_path = public, auth as $$
  select jsonb_build_object('generatedAt', now(), 'user', public.get_current_user());
$$;

create or replace function public.create_meeting(p_title text, p_password text default '', p_waiting_room boolean default true) returns jsonb
language plpgsql security definer set search_path = public, auth, extensions as $$
declare v_user uuid := public.require_user(); v_meeting public.meetings; v_code text;
begin
  if char_length(trim(p_title)) not between 1 and 140 then raise exception 'Ingresa un título válido.' using errcode = 'P0001'; end if;
  if coalesce(p_password, '') <> '' and char_length(p_password) < 6 then raise exception 'La contraseña debe tener al menos 6 caracteres.' using errcode = 'P0001'; end if;
  loop v_code := upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 4) || '-' || substr(encode(gen_random_bytes(4), 'hex'), 1, 4)); exit when not exists(select 1 from public.meetings where room_code = v_code); end loop;
  insert into public.meetings(host_id, room_code, password_hash, title, waiting_room)
  values(v_user, v_code, case when coalesce(p_password, '') = '' then null else crypt(p_password, gen_salt('bf', 10)) end, trim(p_title), coalesce(p_waiting_room, true)) returning * into v_meeting;
  insert into public.meeting_participants(meeting_id, user_id, role, status, joined_at) values(v_meeting.id, v_user, 'HOST', 'ADMITTED', now());
  return public.meeting_summary(v_meeting, v_user);
end; $$;

create or replace function public.message_view(p_message public.meeting_messages, p_viewer uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', p_message.id, 'meetingId', p_message.meeting_id, 'senderId', p_message.sender_id,
    'senderName', p.name, 'senderUsername', p.username, 'body', case when p_message.deleted_at is null then p_message.body else 'Mensaje eliminado' end,
    'replyToId', p_message.reply_to_id, 'createdAt', p_message.created_at,
    'reactions', coalesce((select jsonb_agg(x order by x->>'emoji') from (
      select jsonb_build_object('emoji', r.emoji, 'count', count(*), 'mine', bool_or(r.user_id = p_viewer)) x
      from public.meeting_message_reactions r where r.message_id = p_message.id and r.active group by r.emoji
    ) q), '[]'::jsonb)) from public.profiles p where p.id = p_message.sender_id;
$$;

create or replace function public.get_meeting_messages(p_meeting_id uuid, p_limit integer default 100) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare v_user uuid := public.require_user(); v_result jsonb;
begin
  if not public.is_admitted_to_meeting(p_meeting_id) then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(public.message_view(m, v_user) order by m.created_at), '[]'::jsonb) into v_result
  from (select * from public.meeting_messages where meeting_id = p_meeting_id order by created_at desc limit greatest(1, least(coalesce(p_limit,100),100))) m;
  return v_result;
end; $$;

create or replace function public.get_meeting_message(p_meeting_id uuid,p_message_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_user(); v_message public.meeting_messages;
begin
  if not public.is_admitted_to_meeting(p_meeting_id) then return null; end if;
  select * into v_message from public.meeting_messages where id=p_message_id and meeting_id=p_meeting_id;
  if v_message.id is null then return null; end if;
  return public.message_view(v_message,v_user);
end; $$;

create or replace function public.join_meeting(p_room_code text, p_password text default '') returns jsonb
language plpgsql security definer set search_path = public, auth, extensions as $$
declare v_user uuid := public.require_user(); v_meeting public.meetings; v_member public.meeting_participants; v_status text; v_role text; v_ice jsonb;
begin
  select * into v_meeting from public.meetings where room_code = upper(trim(p_room_code));
  if v_meeting.id is null or v_meeting.status = 'ENDED' then raise exception 'La sala no existe o ya terminó.' using errcode = 'P0001'; end if;
  select * into v_member from public.meeting_participants where meeting_id = v_meeting.id and user_id = v_user;
  if v_meeting.host_id <> v_user and v_meeting.locked then raise exception 'La sala está bloqueada por el anfitrión.' using errcode = 'P0001'; end if;
  if v_meeting.host_id <> v_user and v_member.id is null and v_meeting.password_hash is not null and crypt(coalesce(p_password,''), v_meeting.password_hash) <> v_meeting.password_hash then raise exception 'La contraseña de la sala no coincide.' using errcode = 'P0001'; end if;
  v_role := case when v_meeting.host_id = v_user then 'HOST' else 'PARTICIPANT' end;
  v_status := case when v_meeting.host_id = v_user then 'ADMITTED' when v_member.status = 'DENIED' then 'DENIED' when v_member.status = 'ADMITTED' then 'ADMITTED' when v_meeting.waiting_room then 'WAITING' else 'ADMITTED' end;
  if v_status = 'DENIED' then raise exception 'El anfitrión no autorizó tu ingreso.' using errcode = 'P0001'; end if;
  insert into public.meeting_participants(meeting_id,user_id,role,status,joined_at,left_at)
  values(v_meeting.id,v_user,v_role,v_status,case when v_status='ADMITTED' then now() end,null)
  on conflict(meeting_id,user_id) do update set status=excluded.status, joined_at=coalesce(public.meeting_participants.joined_at,excluded.joined_at), left_at=null;
  select value into v_ice from public.app_settings where key = 'ice_servers';
  return public.meeting_summary(v_meeting,v_user) || jsonb_build_object('role',v_role,'status',v_status,
    'iceServers',coalesce(v_ice,'[]'::jsonb),'messages',case when v_status='ADMITTED' then public.get_meeting_messages(v_meeting.id,100) else '[]'::jsonb end);
end; $$;

create or replace function public.get_my_meetings() returns jsonb
language sql stable security definer set search_path = public, auth as $$
  with me as (select public.require_user() id), visible as (
    select m as meeting, m.created_at, me.id as user_id from public.meetings m cross join me
    left join public.meeting_participants p on p.meeting_id=m.id and p.user_id=me.id
    where m.host_id=me.id or (p.user_id=me.id and p.status<>'DENIED') order by m.created_at desc limit 40)
  select coalesce(jsonb_agg(public.meeting_summary(meeting, user_id) order by created_at desc),'[]'::jsonb) from visible;
$$;

create or replace function public.get_meeting_state(p_meeting_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare v_user uuid:=public.require_user(); v_meeting public.meetings; v_member public.meeting_participants; v_waiting jsonb:='[]'::jsonb;
begin
  select * into v_meeting from public.meetings where id=p_meeting_id; select * into v_member from public.meeting_participants where meeting_id=p_meeting_id and user_id=v_user and status<>'DENIED';
  if v_meeting.id is null or (v_meeting.host_id<>v_user and v_member.id is null) then raise exception 'No perteneces a esta reunión.' using errcode='P0001'; end if;
  if v_meeting.host_id=v_user then select coalesce(jsonb_agg(jsonb_build_object('id',mp.id,'userId',mp.user_id,'name',p.name,'username',p.username,'avatar',p.avatar)),'[]'::jsonb) into v_waiting from public.meeting_participants mp join public.profiles p on p.id=mp.user_id where mp.meeting_id=p_meeting_id and mp.status='WAITING'; end if;
  return public.meeting_summary(v_meeting,v_user)||jsonb_build_object('role',case when v_meeting.host_id=v_user then 'HOST' else v_member.role end,'participantStatus',coalesce(v_member.status,'ADMITTED'),'waitingParticipants',v_waiting);
end; $$;

create or replace function public.update_admission(p_meeting_id uuid,p_participant_id uuid,p_status text) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_user(); v_participant public.meeting_participants;
begin
  if p_status not in ('ADMITTED','DENIED') then raise exception 'Estado de admisión inválido.' using errcode='P0001'; end if;
  if not exists(select 1 from public.meetings where id=p_meeting_id and host_id=v_user and status='ACTIVE') then raise exception 'Solo el anfitrión puede realizar esta acción.' using errcode='P0001'; end if;
  update public.meeting_participants set status=p_status,joined_at=case when p_status='ADMITTED' then now() else joined_at end,left_at=case when p_status='DENIED' then now() else null end where id=p_participant_id and meeting_id=p_meeting_id returning * into v_participant;
  if v_participant.id is null then raise exception 'No encontramos a ese participante.' using errcode='P0001'; end if;
  insert into public.notifications(user_id,type,title,body,resource_type,resource_id) values(v_participant.user_id,'MEETING_'||p_status,case when p_status='ADMITTED' then 'Ingreso autorizado' else 'Ingreso rechazado' end,'La solicitud de ingreso cambió de estado.','Meeting',p_meeting_id);
  return jsonb_build_object('participantId',v_participant.id,'status',p_status);
end; $$;

create or replace function public.admit_meeting_participant(p_meeting_id uuid,p_participant_id uuid) returns jsonb language sql security definer set search_path=public as $$ select public.update_admission(p_meeting_id,p_participant_id,'ADMITTED'); $$;
create or replace function public.deny_meeting_participant(p_meeting_id uuid,p_participant_id uuid) returns jsonb language sql security definer set search_path=public as $$ select public.update_admission(p_meeting_id,p_participant_id,'DENIED'); $$;

create or replace function public.set_meeting_locked(p_meeting_id uuid,p_locked boolean) returns jsonb language plpgsql security definer set search_path=public,auth as $$
begin if not exists(select 1 from public.meetings where id=p_meeting_id and host_id=public.require_user()) then raise exception 'Solo el anfitrión puede realizar esta acción.' using errcode='P0001'; end if; update public.meetings set locked=coalesce(p_locked,false) where id=p_meeting_id; return jsonb_build_object('locked',coalesce(p_locked,false)); end; $$;

create or replace function public.end_meeting(p_meeting_id uuid) returns jsonb language plpgsql security definer set search_path=public,auth as $$
begin if not exists(select 1 from public.meetings where id=p_meeting_id and host_id=public.require_user()) then raise exception 'Solo el anfitrión puede realizar esta acción.' using errcode='P0001'; end if; update public.meetings set status='ENDED',ended_at=now() where id=p_meeting_id and status<>'ENDED'; return jsonb_build_object('meetingId',p_meeting_id,'status','ENDED'); end; $$;

create or replace function public.get_community_members(p_query text default '') returns jsonb language sql stable security definer set search_path=public,auth as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'username',p.username,'avatar',p.avatar) order by p.name),'[]'::jsonb) from (select * from public.profiles where id<>public.require_user() and status='ACTIVE' and (coalesce(trim(p_query),'')='' or name ilike '%'||trim(p_query)||'%' or username::text ilike '%'||trim(p_query)||'%') order by name limit 100) p;
$$;

create or replace function public.invite_to_meeting(p_meeting_id uuid,p_user_id uuid) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_host uuid:=public.require_user(); v_profile public.profiles; v_invite public.meeting_invitations;
begin
  if not exists(select 1 from public.meetings where id=p_meeting_id and host_id=v_host and status='ACTIVE') then raise exception 'Solo el anfitrión puede invitar.' using errcode='P0001'; end if;
  select * into v_profile from public.profiles where id=p_user_id and status='ACTIVE'; if v_profile.id is null or p_user_id=v_host then raise exception 'No encontramos a ese usuario activo.' using errcode='P0001'; end if;
  insert into public.meeting_invitations(meeting_id,inviter_id,invitee_id) values(p_meeting_id,v_host,p_user_id) on conflict(meeting_id,invitee_id) do update set inviter_id=excluded.inviter_id,status='PENDING',created_at=now(),responded_at=null returning * into v_invite;
  insert into public.meeting_participants(meeting_id,user_id,role,status) values(p_meeting_id,p_user_id,'PARTICIPANT','INVITED') on conflict(meeting_id,user_id) do nothing;
  insert into public.notifications(user_id,type,title,body,resource_type,resource_id) select p_user_id,'MEETING_INVITE',p.name||' te invitó a una reunión',m.title||' · '||m.room_code,'Meeting',m.id from public.meetings m join public.profiles p on p.id=v_host where m.id=p_meeting_id;
  return jsonb_build_object('id',v_invite.id,'userId',p_user_id,'name',v_profile.name,'status','PENDING');
end; $$;

create or replace function public.post_meeting_message(p_meeting_id uuid,p_body text,p_reply_to_id uuid default null) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_user(); v_message public.meeting_messages;
begin
  if not public.is_admitted_to_meeting(p_meeting_id) then raise exception 'Aún no has sido admitido.' using errcode='P0001'; end if;
  if not exists(select 1 from public.meetings where id=p_meeting_id and status='ACTIVE') then raise exception 'La reunión ya terminó.' using errcode='P0001'; end if;
  if char_length(trim(coalesce(p_body,''))) not between 1 and 2000 then raise exception 'Escribe un mensaje válido.' using errcode='P0001'; end if;
  if p_reply_to_id is not null and not exists(select 1 from public.meeting_messages where id=p_reply_to_id and meeting_id=p_meeting_id) then raise exception 'El mensaje respondido no pertenece a esta reunión.' using errcode='P0001'; end if;
  if (select count(*)>=20 from public.meeting_messages where sender_id=v_user and created_at>now()-interval '10 seconds') then raise exception 'Has enviado demasiados mensajes. Espera unos segundos.' using errcode='P0001'; end if;
  insert into public.meeting_messages(meeting_id,sender_id,body,reply_to_id) values(p_meeting_id,v_user,trim(p_body),p_reply_to_id) returning * into v_message; return public.message_view(v_message,v_user);
end; $$;

create or replace function public.react_to_meeting_message(p_meeting_id uuid,p_message_id uuid,p_emoji text) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_user(); v_active boolean;
begin
  if not public.is_admitted_to_meeting(p_meeting_id) then raise exception 'Aún no has sido admitido.' using errcode='P0001'; end if;
  if p_emoji not in ('👍','👏','❤️','😂','🎉','🔥') then raise exception 'Reacción no permitida.' using errcode='P0001'; end if;
  if not exists(select 1 from public.meeting_messages where id=p_message_id and meeting_id=p_meeting_id) then raise exception 'No encontramos ese mensaje.' using errcode='P0001'; end if;
  select not active into v_active from public.meeting_message_reactions where message_id=p_message_id and user_id=v_user and emoji=p_emoji;
  v_active:=coalesce(v_active,true);
  insert into public.meeting_message_reactions(meeting_id,message_id,user_id,emoji,active) values(p_meeting_id,p_message_id,v_user,p_emoji,v_active) on conflict(message_id,user_id,emoji) do update set active=excluded.active;
  return jsonb_build_object('messageId',p_message_id,'emoji',p_emoji,'active',v_active,'userId',v_user);
end; $$;

create or replace function public.request_meeting_mute(p_meeting_id uuid,p_user_id uuid) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare v_host uuid:=public.require_user(); v_command public.meeting_commands;
begin
  if not exists(select 1 from public.meetings where id=p_meeting_id and host_id=v_host and status='ACTIVE') then raise exception 'Solo el anfitrión puede silenciar participantes.' using errcode='P0001'; end if;
  if not exists(select 1 from public.meeting_participants where meeting_id=p_meeting_id and user_id=p_user_id and role='PARTICIPANT' and status='ADMITTED') then raise exception 'El participante ya no está disponible.' using errcode='P0001'; end if;
  insert into public.meeting_commands(meeting_id,issuer_id,target_user_id,command) values(p_meeting_id,v_host,p_user_id,'MUTE') returning * into v_command;
  return jsonb_build_object('id',v_command.id,'meetingId',v_command.meeting_id,'targetUserId',v_command.target_user_id,'command',v_command.command,'expiresAt',v_command.expires_at);
end; $$;

create or replace function public.consume_meeting_command(p_command_id uuid) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_user(); v_command public.meeting_commands;
begin
  update public.meeting_commands set consumed_at=now()
  where id=p_command_id and target_user_id=v_user and consumed_at is null and expires_at>now()
  returning * into v_command;
  if v_command.id is null then return null; end if;
  return jsonb_build_object('id',v_command.id,'meetingId',v_command.meeting_id,'command',v_command.command,'issuerId',v_command.issuer_id);
end; $$;

alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.app_settings enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_participants enable row level security;
alter table public.meeting_invitations enable row level security;
alter table public.meeting_messages enable row level security;
alter table public.meeting_message_reactions enable row level security;
alter table public.notifications enable row level security;
alter table public.meeting_commands enable row level security;

drop policy if exists profiles_authenticated_read on public.profiles;
create policy profiles_authenticated_read on public.profiles for select to authenticated using (status='ACTIVE');
drop policy if exists wallets_owner_read on public.wallets;
create policy wallets_owner_read on public.wallets for select to authenticated using (user_id=auth.uid());
drop policy if exists meetings_member_read on public.meetings;
create policy meetings_member_read on public.meetings for select to authenticated using (host_id=auth.uid() or public.is_admitted_to_meeting(id));
drop policy if exists participants_related_read on public.meeting_participants;
create policy participants_related_read on public.meeting_participants for select to authenticated using (user_id=auth.uid() or exists(select 1 from public.meetings m where m.id=meeting_id and m.host_id=auth.uid()));
drop policy if exists messages_member_read on public.meeting_messages;
create policy messages_member_read on public.meeting_messages for select to authenticated using (public.is_admitted_to_meeting(meeting_id));
drop policy if exists reactions_member_read on public.meeting_message_reactions;
create policy reactions_member_read on public.meeting_message_reactions for select to authenticated using (public.is_admitted_to_meeting(meeting_id));
drop policy if exists notifications_owner_read on public.notifications;
create policy notifications_owner_read on public.notifications for select to authenticated using (user_id=auth.uid());

-- Autoriza canales privados Realtime solo a miembros admitidos de meeting:<uuid>.
drop policy if exists galaxy_meeting_realtime_read on realtime.messages;
create policy galaxy_meeting_realtime_read on realtime.messages for select to authenticated using (
  exists(select 1 from public.meeting_participants p where p.user_id=(select auth.uid())
    and realtime.messages.extension in ('broadcast','presence') and (
      (p.status='ADMITTED' and (select realtime.topic())='meeting:'||p.meeting_id::text)
      or (p.status<>'DENIED' and (select realtime.topic()) like 'db:participants:'||p.meeting_id::text||':%')
    ))
);
drop policy if exists galaxy_meeting_realtime_write on realtime.messages;
create policy galaxy_meeting_realtime_write on realtime.messages for insert to authenticated with check (
  exists(select 1 from public.meeting_participants p where p.user_id=(select auth.uid())
    and realtime.messages.extension in ('broadcast','presence') and (
      (p.status='ADMITTED' and (select realtime.topic())='meeting:'||p.meeting_id::text)
      or (p.status<>'DENIED' and (select realtime.topic()) like 'db:participants:'||p.meeting_id::text||':%')
    ))
);

do $$ begin
  alter publication supabase_realtime add table public.meeting_participants;
exception when duplicate_object then null; end $$;

revoke all on all tables in schema public from anon;
revoke usage on schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from public, anon;
revoke execute on function public.touch_updated_at(),public.handle_new_user(),public.require_user(),public.is_admitted_to_meeting(uuid),public.meeting_summary(public.meetings,uuid),public.get_current_user(),public.get_bootstrap_data(text[]),public.create_meeting(text,text,boolean),public.message_view(public.meeting_messages,uuid),public.get_meeting_messages(uuid,integer),public.get_meeting_message(uuid,uuid),public.join_meeting(text,text),public.get_my_meetings(),public.get_meeting_state(uuid),public.update_admission(uuid,uuid,text),public.admit_meeting_participant(uuid,uuid),public.deny_meeting_participant(uuid,uuid),public.set_meeting_locked(uuid,boolean),public.end_meeting(uuid),public.get_community_members(text),public.invite_to_meeting(uuid,uuid),public.post_meeting_message(uuid,text,uuid),public.react_to_meeting_message(uuid,uuid,text),public.request_meeting_mute(uuid,uuid),public.consume_meeting_command(uuid) from public, anon;
grant usage on schema public to authenticated;
grant select on public.profiles,public.wallets,public.meetings,public.meeting_participants,public.meeting_messages,public.meeting_message_reactions,public.notifications to authenticated;
grant execute on function public.get_current_user(),public.get_bootstrap_data(text[]),public.create_meeting(text,text,boolean),public.join_meeting(text,text),public.get_my_meetings(),public.get_meeting_state(uuid),public.admit_meeting_participant(uuid,uuid),public.deny_meeting_participant(uuid,uuid),public.set_meeting_locked(uuid,boolean),public.end_meeting(uuid),public.get_community_members(text),public.invite_to_meeting(uuid,uuid),public.get_meeting_messages(uuid,integer),public.get_meeting_message(uuid,uuid),public.post_meeting_message(uuid,text,uuid),public.react_to_meeting_message(uuid,uuid,text),public.request_meeting_mute(uuid,uuid),public.consume_meeting_command(uuid) to authenticated;
grant execute on function public.is_admitted_to_meeting(uuid) to authenticated;

commit;
