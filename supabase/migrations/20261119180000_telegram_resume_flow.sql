begin;
alter table public.telegram_memberships add column if not exists link_issue text;
alter table public.scanner_telegram_jobs drop constraint if exists scanner_telegram_jobs_kind_check;
alter table public.scanner_telegram_jobs add constraint scanner_telegram_jobs_kind_check check(kind in ('EVENT','WEEKLY','MONTHLY','WELCOME','LINK','LINK_ERROR'));

create or replace function public.telegram_access_view(p_row public.telegram_memberships) returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object('enabled',coalesce((select enabled from public.telegram_community_config where id),false),
    'state',case when p_row.confirmed_at is not null then case when p_row.member_state='MEMBER' then 'JOINED' else 'LINKED' end
      when p_row.token_expires_at>now() and p_row.telegram_id is not null then 'PROPOSED'
      when p_row.token_expires_at>now() then 'WAITING' else 'UNLINKED' end,
    'username',p_row.username,'firstName',p_row.first_name,'linkIssue',case when p_row.confirmed_at is null then p_row.link_issue end,
    'inviteUrl',case when p_row.confirmed_at is not null and p_row.invite_expires_at>now() then p_row.invite_link end,
    'expiresAt',p_row.invite_expires_at);
$$;

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
  update public.telegram_memberships set telegram_id=null,username=null,first_name=null,link_issue=null,
    start_token=v_token,token_hash=encode(sha256(convert_to(v_token,'UTF8')),'hex'),token_expires_at=now()+interval '15 minutes' where user_id=v_user returning * into v_row;
  return public.telegram_access_view(v_row)||jsonb_build_object('botUrl','https://t.me/'||v_bot||'?start=galaxy_'||v_token);
end; $$;
create or replace function public.reset_telegram_proposal() returns void
language plpgsql security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_registered_member();
begin
  update public.telegram_memberships set telegram_id=null,username=null,first_name=null,token_hash=null,start_token=null,token_expires_at=null,link_issue=null where user_id=v_user and confirmed_at is null;
end; $$;

create or replace function public.propose_telegram_account_v2(p_token text,p_telegram_id bigint,p_username text,p_first_name text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_row public.telegram_memberships; v_previous public.telegram_memberships; v_issue text;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{32}$' or p_telegram_id is null or p_telegram_id<=0
    or not exists(select 1 from public.telegram_community_config where id and enabled) then return jsonb_build_object('accepted',false,'reason','INVALID_LINK'); end if;
  -- Serialize proposals from one Telegram identity, including cross-account starts.
  perform pg_advisory_xact_lock(hashtextextended('galaxy:telegram:'||p_telegram_id,0));
  select * into v_row from public.telegram_memberships where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and token_expires_at>now() and confirmed_at is null for update;
  if not found then return jsonb_build_object('accepted',false,'reason','INVALID_LINK'); end if;
  if not public.telegram_user_eligible(v_row.user_id) then return jsonb_build_object('accepted',false,'reason','ACCESS_UNAVAILABLE'); end if;
  if v_row.telegram_id is not null and v_row.telegram_id<>p_telegram_id then v_issue:='DIFFERENT_TELEGRAM'; end if;
  select * into v_previous from public.telegram_memberships where telegram_id=p_telegram_id and user_id<>v_row.user_id for update;
  if found and v_previous.confirmed_at is not null then v_issue:='ALREADY_LINKED'; end if;
  if v_issue is not null then
    update public.telegram_memberships set link_issue=v_issue where user_id=v_row.user_id;
    insert into public.scanner_telegram_jobs(dedupe_key,kind,payload,recipient_id,expires_at)
      values('link-error:'||v_row.token_hash||':'||v_issue,'LINK_ERROR',jsonb_build_object('reason',v_issue),p_telegram_id,now()+interval '15 minutes') on conflict do nothing;
    perform public.dispatch_scanner_telegram(); return jsonb_build_object('accepted',false,'reason',v_issue);
  end if;
  -- A new /start from the Telegram owner can move an UNCONFIRMED proposal.
  -- Confirmed bindings are immutable here and still require their original Galaxy account.
  if v_previous.user_id is not null then
    update public.telegram_memberships set telegram_id=null,username=null,first_name=null,link_issue='REOPENED_ELSEWHERE'
      where user_id=v_previous.user_id and confirmed_at is null;
  end if;
  update public.telegram_memberships set telegram_id=p_telegram_id,username=left(p_username,64),first_name=left(p_first_name,80),link_issue=null where user_id=v_row.user_id;
  insert into public.scanner_telegram_jobs(dedupe_key,kind,payload,recipient_id,expires_at)
    values('link:'||v_row.token_hash,'LINK','{}',p_telegram_id,now()+interval '15 minutes') on conflict do nothing;
  perform public.dispatch_scanner_telegram(); return jsonb_build_object('accepted',true);
end; $$;

-- Preserve the old RPC signature for in-flight updates and existing integrations.
create or replace function public.propose_telegram_account(p_token text,p_telegram_id bigint,p_username text,p_first_name text) returns boolean
language sql security definer set search_path=public as $$
  select (public.propose_telegram_account_v2(p_token,p_telegram_id,p_username,p_first_name)->>'accepted')::boolean;
$$;
revoke execute on function public.propose_telegram_account_v2(text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.propose_telegram_account_v2(text,bigint,text,text) to service_role;
notify pgrst,'reload schema';
commit;
