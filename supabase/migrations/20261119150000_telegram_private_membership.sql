begin;
create table if not exists public.telegram_community_config (
  id boolean primary key default true check(id), enabled boolean not null default false,
  chat_id bigint, bot_username text not null default 'PowereliteBot', started_at timestamptz
);
insert into public.telegram_community_config(id) values(true) on conflict do nothing;
create table if not exists public.telegram_memberships (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  telegram_id bigint unique check(telegram_id>0), username text, first_name text,
  token_hash text unique, start_token text, token_expires_at timestamptz, confirmed_at timestamptz,
  joined_at timestamptz, member_state text check(member_state in ('MEMBER','LEFT')),
  invite_link text, invite_expires_at timestamptz, invite_lease uuid, invite_lease_until timestamptz
);
create table if not exists public.telegram_webhook_updates (
  update_id bigint primary key, lease uuid not null, leased_until timestamptz not null,
  completed_at timestamptz, created_at timestamptz not null default now()
);
alter table public.telegram_community_config enable row level security;
alter table public.telegram_memberships enable row level security;
alter table public.telegram_webhook_updates enable row level security;
revoke all on public.telegram_community_config,public.telegram_memberships,public.telegram_webhook_updates from public,anon,authenticated;
grant all on public.telegram_community_config,public.telegram_memberships,public.telegram_webhook_updates to service_role;
alter table public.scanner_telegram_jobs drop constraint if exists scanner_telegram_jobs_kind_check;
alter table public.scanner_telegram_jobs add constraint scanner_telegram_jobs_kind_check check(kind in ('EVENT','WEEKLY','MONTHLY','WELCOME','LINK'));
alter table public.scanner_telegram_jobs add column if not exists recipient_id bigint;

create or replace function public.telegram_user_eligible(p_user uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id=p_user and status='ACTIVE' and not is_guest and public.has_active_membership(id));
$$;
create or replace function public.telegram_access_view(p_row public.telegram_memberships) returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object('enabled',coalesce((select enabled from public.telegram_community_config where id),false),
    'state',case when p_row.confirmed_at is not null then case when p_row.member_state='MEMBER' then 'JOINED' else 'LINKED' end
      when p_row.token_expires_at>now() and p_row.telegram_id is not null then 'PROPOSED'
      when p_row.token_expires_at>now() then 'WAITING' else 'UNLINKED' end,
    'username',p_row.username,'firstName',p_row.first_name,
    'inviteUrl',case when p_row.confirmed_at is not null and p_row.invite_expires_at>now() then p_row.invite_link end,
    'expiresAt',p_row.invite_expires_at);
$$;
create or replace function public.get_telegram_access() returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_registered_member(); v_row public.telegram_memberships;
begin
  select * into v_row from public.telegram_memberships where user_id=v_user;
  return public.telegram_access_view(v_row);
end; $$;
create or replace function public.begin_telegram_access() returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_registered_member(); v_row public.telegram_memberships; v_token text:=replace(gen_random_uuid()::text,'-',''); v_bot text;
begin
  select bot_username into v_bot from public.telegram_community_config where id and enabled;
  if not found then raise exception 'El acceso a Telegram todavía no está disponible.'; end if;
  insert into public.telegram_memberships(user_id) values(v_user) on conflict do nothing;
  select * into v_row from public.telegram_memberships where user_id=v_user for update;
  if v_row.confirmed_at is not null or (v_row.telegram_id is not null and v_row.token_expires_at>now()) then return public.telegram_access_view(v_row); end if;
  if v_row.token_expires_at>now() and v_row.start_token is not null then return public.telegram_access_view(v_row)||jsonb_build_object('botUrl','https://t.me/'||v_bot||'?start=galaxy_'||v_row.start_token); end if;
  update public.telegram_memberships set telegram_id=null,username=null,first_name=null,
    start_token=v_token,token_hash=encode(sha256(convert_to(v_token,'UTF8')),'hex'),token_expires_at=now()+interval '15 minutes' where user_id=v_user returning * into v_row;
  return public.telegram_access_view(v_row)||jsonb_build_object('botUrl','https://t.me/'||v_bot||'?start=galaxy_'||v_token);
end; $$;
create or replace function public.confirm_telegram_access() returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_registered_member(); v_row public.telegram_memberships;
begin
  select * into v_row from public.telegram_memberships where user_id=v_user for update;
  if v_row.confirmed_at is null then
    if v_row.telegram_id is null or coalesce(v_row.token_expires_at,'-infinity')<=now() then raise exception 'Abre el bot desde Galaxy antes de confirmar tu cuenta.'; end if;
    update public.telegram_memberships set confirmed_at=now(),token_hash=null,start_token=null where user_id=v_user returning * into v_row;
  end if;
  return public.telegram_access_view(v_row);
end; $$;
create or replace function public.reset_telegram_proposal() returns void
language plpgsql security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_registered_member();
begin
  update public.telegram_memberships set telegram_id=null,username=null,first_name=null,token_hash=null,start_token=null,token_expires_at=null where user_id=v_user and confirmed_at is null;
end; $$;

create or replace function public.propose_telegram_account(p_token text,p_telegram_id bigint,p_username text,p_first_name text) returns boolean
language plpgsql security definer set search_path=public as $$
declare v_row public.telegram_memberships;
begin
  if p_token !~ '^[a-f0-9]{32}$' or p_telegram_id<=0 or not exists(select 1 from public.telegram_community_config where id and enabled) then return false; end if;
  select * into v_row from public.telegram_memberships where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and token_expires_at>now() and confirmed_at is null for update;
  if not found or not public.telegram_user_eligible(v_row.user_id) or (v_row.telegram_id is not null and v_row.telegram_id<>p_telegram_id) then return false; end if;
  update public.telegram_memberships set telegram_id=p_telegram_id,username=left(p_username,64),first_name=left(p_first_name,80) where user_id=v_row.user_id;
  insert into public.scanner_telegram_jobs(dedupe_key,kind,payload,recipient_id,expires_at)
    values('link:'||v_row.token_hash,'LINK','{}',p_telegram_id,now()+interval '15 minutes') on conflict do nothing;
  perform public.dispatch_scanner_telegram(); return true;
exception when unique_violation then return false;
end; $$;
create or replace function public.claim_telegram_invite(p_user uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_row public.telegram_memberships; v_chat bigint; v_lease uuid:=gen_random_uuid();
begin
  select chat_id into v_chat from public.telegram_community_config where id and enabled;
  if v_chat is null or not public.telegram_user_eligible(p_user) then raise exception 'Acceso no disponible.'; end if;
  select * into v_row from public.telegram_memberships where user_id=p_user and confirmed_at is not null for update;
  if not found then raise exception 'Confirma primero tu cuenta de Telegram.'; end if;
  if v_row.invite_expires_at>now()+interval '30 seconds' then return jsonb_build_object('inviteUrl',v_row.invite_link,'expiresAt',v_row.invite_expires_at); end if;
  if v_row.invite_lease_until>now() then return jsonb_build_object('busy',true); end if;
  update public.telegram_memberships set invite_lease=v_lease,invite_lease_until=now()+interval '60 seconds' where user_id=p_user;
  return jsonb_build_object('lease',v_lease,'chatId',v_chat,'telegramId',v_row.telegram_id);
end; $$;
create or replace function public.complete_telegram_invite(p_user uuid,p_lease uuid,p_link text,p_expires timestamptz) returns boolean
language plpgsql security definer set search_path=public as $$
begin
  if p_link !~ '^https://t[.]me/[+][A-Za-z0-9_-]+$' or p_expires<=now() or p_expires>now()+interval '15 minutes' then raise exception 'Invitación inválida.'; end if;
  update public.telegram_memberships set invite_link=p_link,invite_expires_at=p_expires,invite_lease=null,invite_lease_until=null
    where user_id=p_user and invite_lease=p_lease and invite_lease_until>now(); return found;
end; $$;
create or replace function public.authorize_telegram_member(p_telegram_id bigint,p_link text default null) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.telegram_memberships where telegram_id=p_telegram_id and confirmed_at is not null and public.telegram_user_eligible(user_id)
    and (p_link is null or (invite_link=p_link and invite_expires_at>now())));
$$;
create or replace function public.mark_telegram_member(p_telegram_id bigint,p_state text) returns void
language plpgsql security definer set search_path=public as $$
declare v_row public.telegram_memberships;
begin
  if p_state not in ('MEMBER','LEFT') then raise exception 'Estado inválido'; end if;
  select * into v_row from public.telegram_memberships where telegram_id=p_telegram_id and confirmed_at is not null for update;
  if not found then return; end if;
  if p_state='MEMBER' and not public.telegram_user_eligible(v_row.user_id) then return; end if;
  update public.telegram_memberships set member_state=p_state,joined_at=case when p_state='MEMBER' then coalesce(joined_at,now()) else joined_at end,
    invite_link=case when p_state='LEFT' then null else invite_link end,invite_expires_at=case when p_state='LEFT' then null else invite_expires_at end where user_id=v_row.user_id;
  if p_state='MEMBER' then
    insert into public.scanner_telegram_jobs(dedupe_key,kind,payload,expires_at)
      values('welcome:'||p_telegram_id,'WELCOME','{}',now()+interval '1 day') on conflict do nothing;
    perform public.dispatch_scanner_telegram();
  end if;
end; $$;

create or replace function public.claim_telegram_webhook_update(p_update bigint) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_lease uuid:=gen_random_uuid(); v_row public.telegram_webhook_updates;
begin
  insert into public.telegram_webhook_updates(update_id,lease,leased_until) values(p_update,v_lease,now()+interval '60 seconds') on conflict do nothing;
  select * into v_row from public.telegram_webhook_updates where update_id=p_update for update;
  if v_row.completed_at is not null then return jsonb_build_object('done',true); end if;
  if v_row.lease<>v_lease and v_row.leased_until>now() then return jsonb_build_object('busy',true); end if;
  update public.telegram_webhook_updates set lease=v_lease,leased_until=now()+interval '60 seconds' where update_id=p_update;
  return jsonb_build_object('lease',v_lease);
end; $$;
create or replace function public.complete_telegram_webhook_update(p_update bigint,p_lease uuid) returns boolean
language plpgsql security definer set search_path=public as $$
begin
  update public.telegram_webhook_updates set completed_at=now() where update_id=p_update and lease=p_lease; return found;
end; $$;

-- Reuse the delivery queue. Trading events retain priority during join bursts.
create or replace function public.claim_scanner_telegram_job() returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_settings public.scanner_telegram_settings; v_job public.scanner_telegram_jobs; v_lease uuid:=gen_random_uuid(); v_chat bigint;
begin
  select * into v_settings from public.scanner_telegram_settings where id and enabled for update skip locked;
  if not found then return null; end if;
  update public.scanner_telegram_jobs set state='expired',lease_token=null where state='pending' and expires_at<=now() and leased_until<=now();
  select * into v_job from public.scanner_telegram_jobs where state='pending' and attempts<8 and expires_at>now() and next_attempt_at<=now() and leased_until<=now()
    order by case kind when 'EVENT' then 0 when 'WEEKLY' then 1 when 'MONTHLY' then 1 when 'LINK' then 2 else 3 end,id limit 1 for update skip locked;
  if not found then return null; end if;
  if v_settings.next_send_at>now() then return jsonb_build_object('waitMs',ceil(extract(epoch from (v_settings.next_send_at-now()))*1000)); end if;
  select chat_id into v_chat from public.telegram_community_config where id;
  update public.scanner_telegram_settings set next_send_at=now()+interval '3.1 seconds' where id;
  update public.scanner_telegram_jobs set attempts=attempts+1,leased_until=now()+interval '60 seconds',lease_token=v_lease where id=v_job.id;
  return jsonb_build_object('job',jsonb_build_object('id',v_job.id,'lease',v_lease,'kind',v_job.kind,'payload',v_job.payload,'chatId',coalesce(v_job.recipient_id,v_chat)));
end; $$;
create or replace function public.maintain_telegram_memberships() returns void
language plpgsql security definer set search_path=public as $$
begin
  delete from public.telegram_webhook_updates where created_at<now()-interval '7 days' and (completed_at is not null or leased_until<now());
  delete from public.telegram_memberships where confirmed_at is null and token_expires_at<now()-interval '1 day';
end; $$;

revoke execute on function public.telegram_user_eligible(uuid),public.telegram_access_view(public.telegram_memberships),public.get_telegram_access(),public.begin_telegram_access(),public.confirm_telegram_access(),public.reset_telegram_proposal(),public.propose_telegram_account(text,bigint,text,text),public.claim_telegram_invite(uuid),public.complete_telegram_invite(uuid,uuid,text,timestamptz),public.authorize_telegram_member(bigint,text),public.mark_telegram_member(bigint,text),public.claim_telegram_webhook_update(bigint),public.complete_telegram_webhook_update(bigint,uuid),public.maintain_telegram_memberships() from public,anon,authenticated;
grant execute on function public.get_telegram_access(),public.begin_telegram_access(),public.confirm_telegram_access(),public.reset_telegram_proposal() to authenticated;
grant execute on function public.propose_telegram_account(text,bigint,text,text),public.claim_telegram_invite(uuid),public.complete_telegram_invite(uuid,uuid,text,timestamptz),public.authorize_telegram_member(bigint,text),public.mark_telegram_member(bigint,text),public.claim_telegram_webhook_update(bigint),public.complete_telegram_webhook_update(bigint,uuid),public.maintain_telegram_memberships() to service_role;
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    if exists(select 1 from cron.job where jobname='galaxy-telegram-memberships') then perform cron.unschedule('galaxy-telegram-memberships'); end if;
    perform cron.schedule('galaxy-telegram-memberships','17 * * * *','select public.maintain_telegram_memberships();');
  end if;
end $$;
notify pgrst,'reload schema';
commit;
