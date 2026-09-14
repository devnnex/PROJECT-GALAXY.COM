begin;

create table if not exists public.platform_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  category text not null default 'PLATFORM' check (category in ('PLATFORM','MEETING','AUDIO','ACCOUNT','PAYMENT','OTHER')),
  subject text not null check (char_length(subject) between 4 and 140),
  details text not null check (char_length(details) between 10 and 3000),
  priority text not null default 'NORMAL' check (priority in ('LOW','NORMAL','HIGH','CRITICAL')),
  status text not null default 'OPEN' check (status in ('OPEN','IN_REVIEW','RESOLVED')),
  admin_notes text not null default '' check (char_length(admin_notes) <= 2000),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender_id <> recipient_id)
);

create index if not exists platform_reports_reporter_created_idx on public.platform_reports(reporter_id,created_at desc);
create index if not exists platform_reports_status_priority_idx on public.platform_reports(status,priority,created_at desc);
create index if not exists direct_messages_pair_created_idx on public.direct_messages(sender_id,recipient_id,created_at desc);
create index if not exists direct_messages_recipient_unread_idx on public.direct_messages(recipient_id,created_at desc) where read_at is null;

drop trigger if exists platform_reports_touch_updated_at on public.platform_reports;
create trigger platform_reports_touch_updated_at before update on public.platform_reports
for each row execute function public.touch_updated_at();

create or replace function public.is_platform_reports_controller() returns boolean
language sql stable security definer set search_path=public,auth as $$
  select exists(
    select 1 from auth.users account join public.profiles profile on profile.id=account.id
    where account.id=auth.uid() and lower(account.email)='elkin56ty@gmail.com' and profile.status='ACTIVE'
  );
$$;

create or replace function public.require_registered_member() returns uuid
language plpgsql stable security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_active_membership();
begin
  if exists(select 1 from public.profiles where id=v_user and is_guest) then raise exception 'Esta función requiere una cuenta registrada.' using errcode='P0001'; end if;
  return v_user;
end; $$;

create or replace function public.platform_report_view(p_report public.platform_reports) returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'id',p_report.id,'reporterId',p_report.reporter_id,'reporterName',profile.name,
    'reporterUsername',profile.username,'reporterAvatar',profile.avatar,
    'reporterMembership',public.membership_view(profile.id),'category',p_report.category,
    'subject',p_report.subject,'details',p_report.details,'priority',p_report.priority,
    'status',p_report.status,'adminNotes',p_report.admin_notes,'resolvedAt',p_report.resolved_at,
    'createdAt',p_report.created_at,'updatedAt',p_report.updated_at
  ) from public.profiles profile where profile.id=p_report.reporter_id;
$$;

create or replace function public.create_platform_report(p_category text,p_subject text,p_details text) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_registered_member(); v_report public.platform_reports;
begin
  if coalesce(p_category,'') not in ('PLATFORM','MEETING','AUDIO','ACCOUNT','PAYMENT','OTHER') then
    raise exception 'Selecciona una categoría válida.' using errcode='P0001';
  end if;
  if char_length(trim(coalesce(p_subject,''))) not between 4 and 140 then
    raise exception 'El asunto debe tener entre 4 y 140 caracteres.' using errcode='P0001';
  end if;
  if char_length(trim(coalesce(p_details,''))) not between 10 and 3000 then
    raise exception 'Los detalles deben tener entre 10 y 3000 caracteres.' using errcode='P0001';
  end if;
  if (select count(*) from public.platform_reports where reporter_id=v_user and created_at>now()-interval '1 hour')>=10 then
    raise exception 'Alcanzaste el límite temporal de reportes. Intenta nuevamente más tarde.' using errcode='P0001';
  end if;
  insert into public.platform_reports(reporter_id,category,subject,details)
  values(v_user,p_category,trim(p_subject),trim(p_details)) returning * into v_report;
  return public.platform_report_view(v_report);
end; $$;

create or replace function public.get_platform_reports() returns jsonb
language plpgsql stable security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_registered_member(); v_controller boolean:=public.is_platform_reports_controller(); v_result jsonb;
begin
  select coalesce(jsonb_agg(public.platform_report_view(report) order by
    case report.status when 'OPEN' then 0 when 'IN_REVIEW' then 1 else 2 end,
    case report.priority when 'CRITICAL' then 0 when 'HIGH' then 1 when 'NORMAL' then 2 else 3 end,
    report.created_at desc),'[]'::jsonb) into v_result
  from public.platform_reports report where v_controller or report.reporter_id=v_user;
  return v_result;
end; $$;

create or replace function public.update_platform_report(p_report_id uuid,p_priority text,p_status text,p_admin_notes text default '') returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare v_report public.platform_reports;
begin
  perform public.require_registered_member();
  if not public.is_platform_reports_controller() then raise exception 'Solo Elkin puede administrar los reportes.' using errcode='P0001'; end if;
  if coalesce(p_priority,'') not in ('LOW','NORMAL','HIGH','CRITICAL') or coalesce(p_status,'') not in ('OPEN','IN_REVIEW','RESOLVED') then
    raise exception 'La clasificación del reporte no es válida.' using errcode='P0001';
  end if;
  if char_length(trim(coalesce(p_admin_notes,'')))>2000 then raise exception 'El seguimiento supera el límite permitido.' using errcode='P0001'; end if;
  update public.platform_reports set priority=p_priority,status=p_status,admin_notes=trim(coalesce(p_admin_notes,'')),
    resolved_at=case when p_status='RESOLVED' then coalesce(resolved_at,now()) else null end
  where id=p_report_id returning * into v_report;
  if v_report.id is null then raise exception 'El reporte ya no está disponible.' using errcode='P0001'; end if;
  return public.platform_report_view(v_report);
end; $$;

create or replace function public.delete_platform_report(p_report_id uuid) returns boolean
language plpgsql security definer set search_path=public,auth as $$
begin
  perform public.require_registered_member();
  if not public.is_platform_reports_controller() then raise exception 'Solo Elkin puede eliminar reportes.' using errcode='P0001'; end if;
  delete from public.platform_reports where id=p_report_id;
  return found;
end; $$;

create or replace function public.clear_platform_reports() returns integer
language plpgsql security definer set search_path=public,auth as $$
declare v_count integer;
begin
  perform public.require_registered_member();
  if not public.is_platform_reports_controller() then raise exception 'Solo Elkin puede vaciar los reportes.' using errcode='P0001'; end if;
  delete from public.platform_reports; get diagnostics v_count=row_count; return v_count;
end; $$;

create or replace function public.direct_message_view(p_message public.direct_messages) returns jsonb
language sql immutable set search_path=public as $$
  select jsonb_build_object('id',p_message.id,'senderId',p_message.sender_id,'recipientId',p_message.recipient_id,
    'body',p_message.body,'createdAt',p_message.created_at,'readAt',p_message.read_at);
$$;

create or replace function public.get_direct_message_contacts() returns jsonb
language plpgsql stable security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_registered_member(); v_result jsonb;
begin
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
  where contact.id<>v_user and contact.status='ACTIVE' and not contact.is_guest and public.has_active_membership(contact.id);
  return v_result;
end; $$;

create or replace function public.get_direct_messages(p_user_id uuid,p_limit integer default 200) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_registered_member(); v_result jsonb;
begin
  if p_user_id=v_user or not exists(select 1 from public.profiles where id=p_user_id and status='ACTIVE' and not is_guest and public.has_active_membership(id)) then
    raise exception 'La conversación no está disponible.' using errcode='P0001';
  end if;
  update public.direct_messages set read_at=coalesce(read_at,now()) where sender_id=p_user_id and recipient_id=v_user and read_at is null;
  select coalesce(jsonb_agg(public.direct_message_view(message) order by message.created_at),'[]'::jsonb) into v_result from (
    select * from public.direct_messages where (sender_id=v_user and recipient_id=p_user_id) or (sender_id=p_user_id and recipient_id=v_user)
    order by created_at desc limit least(greatest(coalesce(p_limit,200),1),500)
  ) message;
  return v_result;
end; $$;

create or replace function public.send_direct_message(p_recipient_id uuid,p_body text) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_registered_member(); v_message public.direct_messages;
begin
  if p_recipient_id=v_user or not exists(select 1 from public.profiles where id=p_recipient_id and status='ACTIVE' and not is_guest and public.has_active_membership(id)) then
    raise exception 'No puedes enviar mensajes a esta cuenta.' using errcode='P0001';
  end if;
  if char_length(trim(coalesce(p_body,''))) not between 1 and 2000 then raise exception 'El mensaje debe tener entre 1 y 2000 caracteres.' using errcode='P0001'; end if;
  if (select count(*) from public.direct_messages where sender_id=v_user and created_at>now()-interval '10 seconds')>=20 then
    raise exception 'Estás enviando mensajes demasiado rápido.' using errcode='P0001';
  end if;
  insert into public.direct_messages(sender_id,recipient_id,body) values(v_user,p_recipient_id,trim(p_body)) returning * into v_message;
  return public.direct_message_view(v_message);
end; $$;

create or replace function public.mark_direct_messages_read(p_sender_id uuid) returns integer
language plpgsql security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_registered_member(); v_count integer;
begin
  update public.direct_messages set read_at=coalesce(read_at,now()) where sender_id=p_sender_id and recipient_id=v_user and read_at is null;
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
    or (public.has_active_membership((select auth.uid())) and exists(
      select 1 from public.meeting_participants participant where participant.user_id=(select auth.uid()) and (
        (participant.status='ADMITTED' and p_topic='meeting:'||participant.meeting_id::text)
        or (participant.status<>'DENIED' and p_topic like 'db:participants:'||participant.meeting_id::text||':%')
      )
    ))
  );
$$;

alter table public.platform_reports enable row level security;
alter table public.direct_messages enable row level security;

drop policy if exists platform_reports_member_read on public.platform_reports;
create policy platform_reports_member_read on public.platform_reports for select to authenticated
using (public.is_current_session_valid() and (reporter_id=auth.uid() or public.is_platform_reports_controller()));

drop policy if exists direct_messages_participant_read on public.direct_messages;
create policy direct_messages_participant_read on public.direct_messages for select to authenticated
using (public.is_current_session_valid() and auth.uid() in (sender_id,recipient_id));

do $$ begin
  alter publication supabase_realtime add table public.direct_messages;
exception when duplicate_object then null; end $$;

revoke all on table public.platform_reports,public.direct_messages from anon;
grant select on table public.platform_reports,public.direct_messages to authenticated;
revoke all on function public.is_platform_reports_controller(),public.require_registered_member(),public.platform_report_view(public.platform_reports),
  public.create_platform_report(text,text,text),public.get_platform_reports(),
  public.update_platform_report(uuid,text,text,text),public.delete_platform_report(uuid),public.clear_platform_reports(),
  public.direct_message_view(public.direct_messages),public.get_direct_message_contacts(),public.get_direct_messages(uuid,integer),
  public.send_direct_message(uuid,text),public.mark_direct_messages_read(uuid) from public,anon,authenticated;
grant execute on function public.is_platform_reports_controller(),public.create_platform_report(text,text,text),public.get_platform_reports(),
  public.update_platform_report(uuid,text,text,text),public.delete_platform_report(uuid),public.clear_platform_reports(),
  public.get_direct_message_contacts(),public.get_direct_messages(uuid,integer),public.send_direct_message(uuid,text),
  public.mark_direct_messages_read(uuid) to authenticated;

commit;
