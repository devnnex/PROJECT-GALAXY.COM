begin;
alter table public.scanner_telegram_jobs drop constraint if exists scanner_telegram_jobs_kind_check;
alter table public.scanner_telegram_jobs add constraint scanner_telegram_jobs_kind_check check(kind in ('EVENT','WEEKLY','MONTHLY','WELCOME','LINK','LINK_ERROR','PHOTO'));
-- PHOTO uses the existing next_attempt_at timestamp and private ten-second
-- dispatcher. No extra polling loop, cron job or automatic historical replay.
create or replace function public.claim_scanner_telegram_job() returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_settings public.scanner_telegram_settings; v_job public.scanner_telegram_jobs; v_lease uuid:=gen_random_uuid(); v_chat bigint;
begin
  select * into v_settings from public.scanner_telegram_settings where id and enabled for update skip locked;
  if not found then return null; end if;
  update public.scanner_telegram_jobs set state='expired',lease_token=null where state='pending' and expires_at<=now() and leased_until<=now();
  select * into v_job from public.scanner_telegram_jobs where state='pending' and attempts<8 and expires_at>now() and next_attempt_at<=now() and leased_until<=now()
    order by case kind when 'EVENT' then 0 when 'WEEKLY' then 1 when 'MONTHLY' then 1 when 'PHOTO' then 1 when 'LINK' then 2 else 3 end,id limit 1 for update skip locked;
  if not found then return null; end if;
  if v_settings.next_send_at>now() then return jsonb_build_object('waitMs',ceil(extract(epoch from (v_settings.next_send_at-now()))*1000)); end if;
  select chat_id into v_chat from public.telegram_community_config where id;
  update public.scanner_telegram_settings set next_send_at=now()+interval '3.1 seconds' where id;
  update public.scanner_telegram_jobs set attempts=attempts+1,leased_until=now()+interval '60 seconds',lease_token=v_lease where id=v_job.id;
  return jsonb_build_object('job',jsonb_build_object('id',v_job.id,'lease',v_lease,'kind',v_job.kind,'payload',v_job.payload,'chatId',coalesce(v_job.recipient_id,v_chat)));
end; $$;
notify pgrst,'reload schema';
commit;
