begin;

-- Remove only the caller's notification envelopes and their FK-linked push
-- jobs. Trades, events, messages, invitations and membership records stay put.
create or replace function public.mark_all_notifications_read() returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_user(); v_result jsonb;
begin
  with cleared as (
    delete from public.notifications n where n.user_id=v_user returning n.*
  ), recent as (
    select * from cleared order by created_at desc,id desc limit 100
  ), notices as (
    select n.*,m.id meeting_id,m.title meeting_title,m.room_code,m.status meeting_status,
      mp.id participant_id,mi.id invitation_id,mi.status invitation_status
    from recent n
    left join public.meetings m on m.id=n.resource_id and n.resource_type='Meeting'
    left join public.meeting_participants mp on n.type='MEETING_JOIN_REQUEST' and mp.meeting_id=n.resource_id and mp.user_id=n.actor_id
    left join public.meeting_invitations mi on n.type='MEETING_INVITE' and mi.meeting_id=n.resource_id and mi.invitee_id=n.user_id
  ) select jsonb_build_object('updated',(select count(*) from cleared where read_at is null),
    'cleared',(select count(*) from cleared),'readAt',now(),
    'clearedScannerIds',coalesce((select jsonb_agg(id) from cleared where type='SCANNER_SIGNAL' and created_at>now()-interval '5 minutes'),'[]'::jsonb),
    'notifications',coalesce((select jsonb_agg(jsonb_build_object(
      'id',n.id,'userId',n.user_id,'type',n.type,'title',n.title,'body',n.body,'resourceId',n.resource_id,'actorId',n.actor_id,
      'readAt',coalesce(n.read_at,now()),'createdAt',n.created_at,'meetingId',n.meeting_id,'meetingTitle',n.meeting_title,
      'roomCode',n.room_code,'meetingStatus',n.meeting_status,'participantId',n.participant_id,
      'invitationId',n.invitation_id,'invitationStatus',n.invitation_status) order by n.created_at desc,n.id desc) from notices n),'[]'::jsonb)) into v_result;
  return v_result;
end; $$;

revoke execute on function public.mark_all_notifications_read() from public,anon;
grant execute on function public.mark_all_notifications_read() to authenticated;
notify pgrst,'reload schema';
commit;
