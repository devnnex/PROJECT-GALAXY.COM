begin;

create or replace function public.message_view(p_message public.meeting_messages, p_viewer uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', p_message.id, 'meetingId', p_message.meeting_id, 'senderId', p_message.sender_id,
    'senderName', p.name, 'senderUsername', p.username, 'senderAvatar',p.avatar,'senderMembership',public.membership_view(p.id),
    'body', case when p_message.deleted_at is null then p_message.body else 'Mensaje eliminado' end,
    'replyToId', p_message.reply_to_id, 'createdAt', p_message.created_at,
    'reactions', coalesce((select jsonb_agg(x order by x->>'emoji') from (
      select jsonb_build_object('emoji', r.emoji, 'count', count(*), 'mine', bool_or(r.user_id = p_viewer)) x
      from public.meeting_message_reactions r where r.message_id = p_message.id and r.active group by r.emoji
    ) q), '[]'::jsonb)) from public.profiles p where p.id = p_message.sender_id;
$$;

commit;
