begin;

create or replace function public.get_calendar_events(p_from timestamptz,p_to timestamptz) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_active_membership(); v_events jsonb;
begin
  perform public.cleanup_old_calendar_events();
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'title',e.title,'description',e.description,'kind',e.kind,
    'startsAt',e.starts_at,'endsAt',e.ends_at,'recurring',e.series_id is not null,
    'roomCode',m.room_code,'status',case when e.ends_at<=now() then 'FINISHED' else 'ACTIVE' end
  ) order by e.starts_at),'[]'::jsonb) into v_events
  from public.calendar_events e left join public.meetings m on m.id=e.meeting_id
  where e.starts_at<least(p_to,p_from+interval '62 days') and e.ends_at>p_from
    and e.ends_at>=now()-interval '7 days';
  return jsonb_build_object('events',v_events,'serverNow',now(),
    'canManage',exists(select 1 from public.profiles where id=v_user and role='ADMIN' and status='ACTIVE'),
    'canDelete',exists(select 1 from auth.users account where account.id=v_user and lower(account.email)='elkin56ty@gmail.com'));
end; $$;

create or replace function public.delete_calendar_meeting(p_event_id uuid) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare
  v_user uuid:=public.require_active_membership();
  v_event public.calendar_events;
begin
  if not exists(
    select 1 from auth.users account
    where account.id=v_user and lower(account.email)='elkin56ty@gmail.com'
  ) then
    raise exception 'Solo la cuenta propietaria puede eliminar reuniones del calendario.' using errcode='42501';
  end if;
  select * into v_event from public.calendar_events where id=p_event_id for update;
  if v_event.id is null then raise exception 'No encontramos esa reunión en el calendario.' using errcode='P0001'; end if;
  if v_event.kind<>'MEETING' then raise exception 'Solo se pueden eliminar reuniones con esta opción.' using errcode='P0001'; end if;
  if v_event.meeting_id is not null then
    delete from public.notifications where resource_type='Meeting' and resource_id=v_event.meeting_id;
    delete from public.meetings where id=v_event.meeting_id;
  end if;
  delete from public.calendar_events where id=v_event.id;
  return jsonb_build_object('eventId',v_event.id,'deleted',true);
end; $$;

revoke all on function public.delete_calendar_meeting(uuid) from public,anon,authenticated;
grant execute on function public.delete_calendar_meeting(uuid) to authenticated;

commit;
