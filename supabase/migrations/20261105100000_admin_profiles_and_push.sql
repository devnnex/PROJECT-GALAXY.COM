begin;

create extension if not exists pg_net with schema extensions;

create or replace function public.is_profile_owner_admin() returns boolean
language sql stable security definer set search_path=public,auth as $$
  select public.is_current_session_valid() and exists(
    select 1 from auth.users u join public.profiles p on p.id=u.id
    where u.id=auth.uid() and lower(u.email)='elkin56ty@gmail.com' and p.role='ADMIN' and p.status='ACTIVE'
  );
$$;

create or replace function public.admin_update_user_profile(p_user_id uuid,p_name text,p_avatar text default null) returns jsonb
language plpgsql security definer set search_path=public,auth,storage as $$
declare v_admin uuid:=public.require_admin(); v_profile public.profiles; v_name text:=trim(coalesce(p_name,''));
begin
  if not public.is_profile_owner_admin() then raise exception 'Solo Elkin puede editar usuarios.' using errcode='42501'; end if;
  if char_length(v_name) not between 2 and 100 then raise exception 'El nombre debe tener entre 2 y 100 caracteres.' using errcode='P0001'; end if;
  select * into v_profile from public.profiles where id=p_user_id and status<>'DELETED' and not is_guest for update;
  if not found then raise exception 'No encontramos ese usuario.' using errcode='P0001'; end if;
  if p_avatar is not null and p_avatar<>'' then
    if p_avatar !~ ('^'||p_user_id::text||'/admin-[0-9a-f-]{36}\?v=[0-9]{13}$') or not exists(
      select 1 from storage.objects where bucket_id='profile-avatars' and name=split_part(p_avatar,'?',1)
    ) then raise exception 'Primero debes subir una foto valida para este usuario.' using errcode='P0001'; end if;
  end if;
  update public.profiles set name=v_name,avatar=coalesce(p_avatar,avatar) where id=p_user_id returning * into v_profile;
  return jsonb_build_object('id',v_profile.id,'name',v_profile.name,'avatar',v_profile.avatar);
end; $$;

create or replace function public.can_upload_admin_avatar(p_path text) returns boolean
language sql stable security definer set search_path=public,auth as $$
  select public.is_profile_owner_admin() and p_path ~ '^[0-9a-f-]{36}/admin-[0-9a-f-]{36}$'
    and exists(select 1 from public.profiles p where p.id::text=split_part(p_path,'/',1) and p.status<>'DELETED' and not p.is_guest);
$$;
drop policy if exists profile_avatars_owner_admin_insert on storage.objects;
create policy profile_avatars_owner_admin_insert on storage.objects for insert to authenticated with check (
  bucket_id='profile-avatars' and public.can_upload_admin_avatar(name)
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public,anon,authenticated;
grant all on public.push_subscriptions to service_role;

create or replace function public.get_push_config() returns jsonb
language plpgsql stable security definer set search_path=public,auth as $$
begin
  perform public.require_registered_member();
  return jsonb_build_object('publicKey',coalesce((select value->>'publicKey' from public.app_settings where key='web_push'),'') );
end; $$;

create or replace function public.save_push_subscription(p_subscription jsonb) returns void
language plpgsql security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_registered_member(); v_endpoint text:=p_subscription->>'endpoint';
begin
  if v_endpoint is null or char_length(v_endpoint)>2048 or v_endpoint !~ '^https://(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|web\.push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)/[^[:space:]]+$'
    or coalesce(p_subscription#>>'{keys,p256dh}','') !~ '^[A-Za-z0-9_-]{87}=?$'
    or coalesce(p_subscription#>>'{keys,auth}','') !~ '^[A-Za-z0-9_-]{22}(==)?$' then
    raise exception 'La suscripcion de notificaciones no es valida.' using errcode='P0001';
  end if;
  -- A shared device belongs only to the account currently using it.
  insert into public.push_subscriptions(user_id,endpoint,subscription)
  values(v_user,v_endpoint,jsonb_build_object('endpoint',v_endpoint,'keys',p_subscription->'keys'))
  on conflict(endpoint) do update set user_id=excluded.user_id,subscription=excluded.subscription,updated_at=now();
end; $$;

create or replace function public.remove_push_subscription(p_endpoint text) returns void
language plpgsql security definer set search_path=public,auth as $$
begin delete from public.push_subscriptions where user_id=auth.uid() and endpoint=p_endpoint; end; $$;

create table if not exists public.push_delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  attempts integer not null default 0,
  leased_until timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique(notification_id,subscription_id)
);
create index if not exists push_delivery_jobs_pending_idx on public.push_delivery_jobs(leased_until) where sent_at is null and attempts<5;
alter table public.push_delivery_jobs enable row level security;
revoke all on public.push_delivery_jobs from public,anon,authenticated;
grant all on public.push_delivery_jobs to service_role;

create or replace function public.dispatch_pending_push() returns void
language plpgsql security definer set search_path=public,vault,net as $$
declare v_secret text; v_url text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='galaxy_push_dispatch_secret' limit 1;
  select decrypted_secret into v_url from vault.decrypted_secrets where name='galaxy_push_dispatch_url' limit 1;
  if v_secret is null or v_url is null then return; end if;
  if not exists(select 1 from public.push_delivery_jobs where sent_at is null and attempts<5 and leased_until<=now()) then return; end if;
  perform net.http_post(url:=v_url,headers:=jsonb_build_object('Content-Type','application/json','x-galaxy-push-secret',v_secret),body:='{}'::jsonb,timeout_milliseconds:=10000);
end; $$;

create or replace function public.queue_notification_push() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.type in ('DIRECT_MESSAGE','MEETING_AVAILABLE','MEETING_INVITE','MEETING_ADMITTED') then
    insert into public.push_delivery_jobs(notification_id,subscription_id)
    select new.id,s.id from public.push_subscriptions s join public.profiles p on p.id=s.user_id
    where s.user_id=new.user_id and p.status='ACTIVE' and not p.is_guest on conflict do nothing;
    perform public.dispatch_pending_push();
  end if;
  return new;
end; $$;
drop trigger if exists notification_web_push on public.notifications;
create trigger notification_web_push after insert on public.notifications for each row execute function public.queue_notification_push();

create or replace function public.notify_owner_direct_message() returns trigger
language plpgsql security definer set search_path=public,auth as $$
begin
  if exists(select 1 from auth.users where id=new.sender_id and lower(email)='elkin56ty@gmail.com') then
    insert into public.notifications(user_id,actor_id,type,title,body,resource_type,resource_id,direct_message_id)
    values(new.recipient_id,new.sender_id,'DIRECT_MESSAGE','Nuevo mensaje de Elkin',left(new.body,180),'DirectMessage',new.id,new.id);
  end if;
  return new;
end; $$;
alter table public.notifications add column if not exists direct_message_id uuid references public.direct_messages(id) on delete cascade;
drop trigger if exists owner_direct_message_notification on public.direct_messages;
create trigger owner_direct_message_notification after insert on public.direct_messages for each row execute function public.notify_owner_direct_message();

create or replace function public.sync_direct_message_notification_read() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.read_at is not null then update public.notifications set read_at=new.read_at where direct_message_id=new.id and read_at is null; end if;
  return new;
end; $$;
drop trigger if exists direct_message_notification_read on public.direct_messages;
create trigger direct_message_notification_read after update of read_at on public.direct_messages for each row execute function public.sync_direct_message_notification_read();

create table if not exists public.meeting_push_announcements (
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  starts_at timestamptz not null,
  primary key(meeting_id,starts_at)
);
alter table public.meeting_push_announcements enable row level security;
revoke all on public.meeting_push_announcements from public,anon,authenticated;

-- Do not broadcast old rooms when installing this update.
insert into public.meeting_push_announcements(meeting_id,starts_at)
select id,starts_at from public.meetings where starts_at<=now()
and not exists(select 1 from public.app_settings where key='web_push_installed') on conflict do nothing;
insert into public.app_settings(key,value,is_secret) values('web_push_installed','true'::jsonb,true) on conflict do nothing;

create or replace function public.announce_available_meetings(p_meeting_id uuid default null) returns void
language plpgsql security definer set search_path=public,auth as $$
declare v_meeting public.meetings;
begin
  for v_meeting in select m.* from public.meetings m join auth.users u on u.id=m.host_id
    where lower(u.email)='elkin56ty@gmail.com' and m.status='ACTIVE' and not m.locked and m.starts_at<=now()
    and (m.scheduled_ends_at is null or m.scheduled_ends_at>now()) and (p_meeting_id is null or m.id=p_meeting_id)
    and not exists(select 1 from public.meeting_push_announcements a where a.meeting_id=m.id and a.starts_at=m.starts_at)
  loop
    insert into public.meeting_push_announcements(meeting_id,starts_at) values(v_meeting.id,v_meeting.starts_at) on conflict do nothing;
    if found then
      insert into public.notifications(user_id,actor_id,type,title,body,resource_type,resource_id)
      select p.id,v_meeting.host_id,'MEETING_AVAILABLE','Tu reunion ya esta disponible',v_meeting.title,'Meeting',v_meeting.id
      from public.profiles p where p.status='ACTIVE' and not p.is_guest and p.id<>v_meeting.host_id;
    end if;
  end loop;
end; $$;
create or replace function public.notify_available_meeting() returns trigger
language plpgsql security definer set search_path=public as $$
begin perform public.announce_available_meetings(new.id); return new; end; $$;
drop trigger if exists meeting_available_notification on public.meetings;
create trigger meeting_available_notification after insert or update of status,starts_at,locked on public.meetings for each row execute function public.notify_available_meeting();

create or replace function public.claim_push_delivery_jobs() returns table(job_id uuid,subscription_id uuid,subscription jsonb,notification jsonb)
language sql security definer set search_path=public as $$
  with candidates as (
    select j.id from public.push_delivery_jobs j
    join public.push_subscriptions s on s.id=j.subscription_id
    join public.notifications n on n.id=j.notification_id and n.user_id=s.user_id
    join public.profiles p on p.id=s.user_id
    left join public.meetings m on m.id=n.resource_id and n.resource_type='Meeting'
    where j.sent_at is null and j.attempts<5 and j.leased_until<=now()
    and n.read_at is null and n.created_at>now()-interval '24 hours' and p.status='ACTIVE' and not p.is_guest
    and (n.resource_type<>'Meeting' or (m.status='ACTIVE' and not m.locked and (m.scheduled_ends_at is null or m.scheduled_ends_at>now())))
    order by j.created_at limit 50 for update of j skip locked
  ), claimed as (
    update public.push_delivery_jobs j set attempts=j.attempts+1,leased_until=now()+interval '2 minutes'
    from candidates c where j.id=c.id returning j.*
  ) select c.id,s.id,s.subscription,jsonb_build_object('id',n.id,'type',n.type,'title',n.title,'body',n.body,'actorId',n.actor_id,
    'meetingId',m.id,'roomCode',m.room_code,'userId',n.user_id)
  from claimed c join public.push_subscriptions s on s.id=c.subscription_id
  join public.notifications n on n.id=c.notification_id left join public.meetings m on m.id=n.resource_id and n.resource_type='Meeting';
$$;

revoke execute on function public.is_profile_owner_admin(),public.can_upload_admin_avatar(text),public.admin_update_user_profile(uuid,text,text),public.get_push_config(),public.save_push_subscription(jsonb),public.remove_push_subscription(text),public.dispatch_pending_push(),public.queue_notification_push(),public.notify_owner_direct_message(),public.announce_available_meetings(uuid),public.notify_available_meeting(),public.claim_push_delivery_jobs() from public,anon,authenticated;
revoke execute on function public.sync_direct_message_notification_read() from public,anon,authenticated;
grant execute on function public.is_profile_owner_admin(),public.can_upload_admin_avatar(text),public.admin_update_user_profile(uuid,text,text),public.get_push_config(),public.save_push_subscription(jsonb),public.remove_push_subscription(text) to authenticated;
grant execute on function public.claim_push_delivery_jobs() to service_role;

do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    if exists(select 1 from cron.job where jobname='galaxy-web-push') then perform cron.unschedule('galaxy-web-push'); end if;
    perform cron.schedule('galaxy-web-push','* * * * *','select public.announce_available_meetings(); select public.dispatch_pending_push(); delete from public.push_delivery_jobs where created_at<now()-interval ''2 days'';');
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
