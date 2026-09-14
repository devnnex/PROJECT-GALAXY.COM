begin;

create or replace function public.cleanup_expired_direct_messages() returns integer
language plpgsql security definer set search_path=public as $$
declare v_count integer;
begin
  delete from public.direct_messages where created_at<=now()-interval '24 hours';
  get diagnostics v_count=row_count;
  return v_count;
end; $$;

create or replace function public.get_direct_message_contacts() returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare
  v_user uuid:=public.require_registered_member();
  v_controller uuid:=public.direct_messages_controller_id();
  v_result jsonb;
begin
  perform public.cleanup_expired_direct_messages();
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
    where ((message.sender_id=v_user and message.recipient_id=contact.id) or (message.sender_id=contact.id and message.recipient_id=v_user))
      and message.created_at>now()-interval '24 hours'
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
  perform public.cleanup_expired_direct_messages();
  if not public.can_direct_message(v_user,p_user_id) then raise exception 'La conversación no está disponible.' using errcode='P0001'; end if;
  update public.direct_messages set delivered_at=coalesce(delivered_at,now()),read_at=coalesce(read_at,now())
  where sender_id=p_user_id and recipient_id=v_user and read_at is null and created_at>now()-interval '24 hours';
  select coalesce(jsonb_agg(public.direct_message_view(message) order by message.created_at),'[]'::jsonb) into v_result from (
    select * from public.direct_messages
    where ((sender_id=v_user and recipient_id=p_user_id) or (sender_id=p_user_id and recipient_id=v_user))
      and created_at>now()-interval '24 hours'
    order by created_at desc limit least(greatest(coalesce(p_limit,200),1),500)
  ) message;
  return v_result;
end; $$;

drop policy if exists direct_messages_participant_read on public.direct_messages;
create policy direct_messages_participant_read on public.direct_messages for select to authenticated
using (public.is_current_session_valid() and auth.uid() in (sender_id,recipient_id)
  and public.can_direct_message(sender_id,recipient_id) and created_at>now()-interval '24 hours');

-- pg_cron removes expired rows even when nobody opens Mensajes. The RPC cleanup
-- above remains as a safe fallback on projects where this extension is disabled.
do $$ begin
  create extension if not exists pg_cron;
exception when insufficient_privilege or feature_not_supported or undefined_file then null;
end $$;

do $$
declare v_job record;
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    for v_job in execute 'select jobid from cron.job where jobname=''galaxy-direct-messages-retention''' loop
      execute format('select cron.unschedule(%s)',v_job.jobid);
    end loop;
    execute 'select cron.schedule(''galaxy-direct-messages-retention'',''*/15 * * * *'',''select public.cleanup_expired_direct_messages();'')';
  end if;
exception when others then
  raise notice 'pg_cron no está disponible; la limpieza se ejecutará al abrir Mensajes.';
end $$;

revoke all on function public.cleanup_expired_direct_messages() from public,anon,authenticated;

commit;
