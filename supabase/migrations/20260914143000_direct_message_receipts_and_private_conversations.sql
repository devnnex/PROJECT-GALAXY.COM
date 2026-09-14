begin;

alter table public.direct_messages add column if not exists delivered_at timestamptz;

create or replace function public.direct_messages_controller_id() returns uuid
language sql stable security definer set search_path=public,auth as $$
  select account.id
  from auth.users account
  join public.profiles profile on profile.id=account.id
  where lower(account.email)='elkin56ty@gmail.com' and profile.status='ACTIVE' and not profile.is_guest
  limit 1;
$$;

create or replace function public.can_direct_message(p_user_id uuid,p_peer_id uuid) returns boolean
language sql stable security definer set search_path=public,auth as $$
  select coalesce(p_user_id is not null and p_peer_id is not null and p_user_id<>p_peer_id
    and public.direct_messages_controller_id() in (p_user_id,p_peer_id)
    and exists(select 1 from public.profiles profile where profile.id=p_user_id and profile.status='ACTIVE' and not profile.is_guest and public.has_active_membership(profile.id))
    and exists(select 1 from public.profiles profile where profile.id=p_peer_id and profile.status='ACTIVE' and not profile.is_guest and public.has_active_membership(profile.id)),false);
$$;

create or replace function public.can_access_direct_message_topic(p_topic text) returns boolean
language plpgsql stable security definer set search_path=public,auth as $$
declare
  v_user uuid:=auth.uid();
  v_left_text text:=split_part(coalesce(p_topic,''),':',2);
  v_right_text text:=split_part(coalesce(p_topic,''),':',3);
  v_left uuid;
  v_right uuid;
begin
  if coalesce(p_topic,'') !~ '^direct:[0-9a-f-]{36}:[0-9a-f-]{36}$'
    or split_part(p_topic,':',4)<>'' then return false; end if;
  begin
    v_left:=v_left_text::uuid;
    v_right:=v_right_text::uuid;
  exception when invalid_text_representation then return false;
  end;
  return v_user in (v_left,v_right)
    and v_left_text<v_right_text
    and public.can_direct_message(v_left,v_right);
end; $$;

create or replace function public.direct_message_view(p_message public.direct_messages) returns jsonb
language sql immutable set search_path=public as $$
  select jsonb_build_object('id',p_message.id,'senderId',p_message.sender_id,'recipientId',p_message.recipient_id,
    'body',p_message.body,'createdAt',p_message.created_at,'deliveredAt',p_message.delivered_at,'readAt',p_message.read_at);
$$;

create or replace function public.get_direct_message_contacts() returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare
  v_user uuid:=public.require_registered_member();
  v_controller uuid:=public.direct_messages_controller_id();
  v_result jsonb;
begin
  if v_controller is null then raise exception 'La cuenta de mensajería no está disponible.' using errcode='P0001'; end if;
  update public.direct_messages set delivered_at=coalesce(delivered_at,now())
  where recipient_id=v_user and delivered_at is null;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',contact.id,'name',contact.name,'username',contact.username,'avatar',contact.avatar,
    'membership',public.membership_view(contact.id),'lastMessage',case when latest.id is null then null else public.direct_message_view(latest) end,
    'unreadCount',(select count(*) from public.direct_messages unread where unread.sender_id=contact.id and unread.recipient_id=v_user and unread.read_at is null)
  ) order by latest.created_at desc nulls last,contact.name),'[]'::jsonb) into v_result
  from public.profiles contact
  left join lateral (
    select message.* from public.direct_messages message
    where (message.sender_id=v_user and message.recipient_id=contact.id) or (message.sender_id=contact.id and message.recipient_id=v_user)
    order by message.created_at desc limit 1
  ) latest on true
  where contact.id<>v_user and contact.status='ACTIVE' and not contact.is_guest and public.has_active_membership(contact.id)
    and (v_user=v_controller or contact.id=v_controller);
  return v_result;
end; $$;

create or replace function public.get_direct_messages(p_user_id uuid,p_limit integer default 200) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_registered_member(); v_result jsonb;
begin
  if not public.can_direct_message(v_user,p_user_id) then raise exception 'La conversación no está disponible.' using errcode='P0001'; end if;
  update public.direct_messages set delivered_at=coalesce(delivered_at,now()),read_at=coalesce(read_at,now())
  where sender_id=p_user_id and recipient_id=v_user and read_at is null;
  select coalesce(jsonb_agg(public.direct_message_view(message) order by message.created_at),'[]'::jsonb) into v_result from (
    select * from public.direct_messages
    where (sender_id=v_user and recipient_id=p_user_id) or (sender_id=p_user_id and recipient_id=v_user)
    order by created_at desc limit least(greatest(coalesce(p_limit,200),1),500)
  ) message;
  return v_result;
end; $$;

create or replace function public.send_direct_message(p_recipient_id uuid,p_body text) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_registered_member(); v_message public.direct_messages;
begin
  if not public.can_direct_message(v_user,p_recipient_id) then raise exception 'No puedes enviar mensajes a esta cuenta.' using errcode='P0001'; end if;
  if char_length(trim(coalesce(p_body,''))) not between 1 and 2000 then raise exception 'El mensaje debe tener entre 1 y 2000 caracteres.' using errcode='P0001'; end if;
  if (select count(*) from public.direct_messages where sender_id=v_user and created_at>now()-interval '10 seconds')>=20 then
    raise exception 'Estás enviando mensajes demasiado rápido.' using errcode='P0001';
  end if;
  insert into public.direct_messages(sender_id,recipient_id,body)
  values(v_user,p_recipient_id,trim(p_body)) returning * into v_message;
  return public.direct_message_view(v_message);
end; $$;

create or replace function public.mark_direct_messages_read(p_sender_id uuid) returns integer
language plpgsql security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_registered_member(); v_count integer;
begin
  if not public.can_direct_message(v_user,p_sender_id) then raise exception 'La conversación no está disponible.' using errcode='P0001'; end if;
  update public.direct_messages set delivered_at=coalesce(delivered_at,now()),read_at=coalesce(read_at,now())
  where sender_id=p_sender_id and recipient_id=v_user and read_at is null;
  get diagnostics v_count=row_count; return v_count;
end; $$;

create or replace function public.mark_direct_messages_delivered() returns integer
language plpgsql security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_registered_member(); v_count integer;
begin
  update public.direct_messages set delivered_at=now()
  where recipient_id=v_user and delivered_at is null;
  get diagnostics v_count=row_count; return v_count;
end; $$;

create or replace function public.can_access_realtime_topic(p_topic text,p_extension text) returns boolean
language sql stable security definer set search_path=public,auth as $$
  select public.is_current_session_valid() and p_extension in ('broadcast','presence') and (
    p_topic='user:'||(select auth.uid())::text
    or (p_topic='community:online' and p_extension='presence' and public.has_active_membership((select auth.uid()))
      and not exists(select 1 from public.profiles where id=(select auth.uid()) and is_guest))
    or p_topic like 'db:notifications:'||(select auth.uid())::text||':%'
    or p_topic like 'db:wallet:'||(select auth.uid())::text||':%'
    or p_topic like 'db:direct-messages:'||(select auth.uid())::text||':%'
    or (p_extension='broadcast' and public.can_access_direct_message_topic(p_topic))
    or (public.has_active_membership((select auth.uid())) and exists(
      select 1 from public.meeting_participants participant where participant.user_id=(select auth.uid()) and (
        (participant.status='ADMITTED' and p_topic='meeting:'||participant.meeting_id::text)
        or (participant.status<>'DENIED' and p_topic like 'db:participants:'||participant.meeting_id::text||':%')
      )
    ))
  );
$$;

drop policy if exists direct_messages_participant_read on public.direct_messages;
create policy direct_messages_participant_read on public.direct_messages for select to authenticated
using (public.is_current_session_valid() and auth.uid() in (sender_id,recipient_id)
  and public.can_direct_message(sender_id,recipient_id));

revoke all on function public.direct_messages_controller_id(),public.can_direct_message(uuid,uuid),
  public.can_access_direct_message_topic(text),public.mark_direct_messages_delivered() from public,anon,authenticated;
grant execute on function public.can_direct_message(uuid,uuid),public.mark_direct_messages_delivered() to authenticated;

commit;
