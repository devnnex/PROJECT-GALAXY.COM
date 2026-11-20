import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
let db;
const a = '00000000-0000-0000-0000-000000000001', b = '00000000-0000-0000-0000-000000000002';
const query = async (sql) => (await db.query(sql)).rows;
const rpc = async (sql) => (await query(`select ${sql} as value`))[0].value;
const who = async (id) => db.exec(`select set_config('test.user','${id}',false)`);
const begin = async () => rpc('public.begin_telegram_access()');
const token = (value) => value.botUrl.split('galaxy_')[1];
const propose = async (value, id = 123) => rpc(`public.propose_telegram_account('${token(value)}',${id},'galaxy_trader','Ana')`);
async function linked() { const link = await begin(); await propose(link); await rpc('public.confirm_telegram_access()'); return link; }
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text);
    create table profiles(id uuid primary key,status text default 'ACTIVE',is_guest boolean default false,paid boolean default true);
    insert into profiles(id) values('${a}'),('${b}');
    create function public.has_active_membership(p_user uuid) returns boolean language sql as $$select paid from profiles where id=p_user$$;
    create function public.require_registered_member() returns uuid language plpgsql as $$declare v_id uuid:=current_setting('test.user',true)::uuid;begin
      if not exists(select 1 from profiles where id=v_id and status='ACTIVE' and paid and not is_guest) then raise exception 'Access denied';end if;return v_id;end;$$;
    create table scanner_events(id uuid primary key default gen_random_uuid(),trade_id uuid,type text,occurred_at timestamptz,payload jsonb);
    create table scanner_daily_statistics(day date primary key,totals numeric[],targets jsonb);`);
  for (const file of ['20261119120000_scanner_telegram.sql','20261119150000_telegram_private_membership.sql','20261119180000_telegram_resume_flow.sql','20261119193000_telegram_scheduled_photo.sql']) await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
}, 30_000);
beforeEach(async () => {
  await db.exec(`reset role;truncate telegram_memberships,telegram_webhook_updates,scanner_telegram_jobs;update profiles set status='ACTIVE',paid=true,is_guest=false;
    update telegram_community_config set enabled=true,chat_id=-123,started_at=now() where id;
    update scanner_telegram_settings set enabled=true,next_send_at='-infinity',dispatch_until='-infinity';`); await who(a);
});
afterAll(async () => db?.close());

it('issues stable, short-lived personal links and returns only the caller’s status', async () => {
  const first = await begin(); expect(first.state).toBe('WAITING'); expect(token(first)).toMatch(/^[a-f0-9]{32}$/);
  expect((await begin()).botUrl).toBe(first.botUrl);
  expect(JSON.stringify(await rpc('public.get_telegram_access()'))).not.toContain(token(first));
  await propose(first); await who(b); expect((await rpc('public.get_telegram_access()')).state).toBe('UNLINKED');
});
it('requires confirmation in Galaxy and keeps one Telegram identity per Galaxy account', async () => {
  const first = await begin(); await propose(first);
  expect(await rpc('public.authorize_telegram_member(123,null)')).toBe(false);
  expect((await rpc('public.confirm_telegram_access()')).state).toBe('LINKED');
  expect(await propose(first,999)).toBe(false);
  await rpc('public.reset_telegram_proposal()'); expect((await begin()).state).toBe('LINKED');
  await who(b); const other = await begin(); expect(await propose(other,123)).toBe(false);
});
it('rejects expired starts, suspended/nonmember accounts and unconfirmed invitations', async () => {
  const first = await begin(); await db.exec(`update telegram_memberships set token_expires_at=now()-interval '1 second'`);
  expect(await propose(first)).toBe(false); await expect(rpc('public.confirm_telegram_access()')).rejects.toThrow();
  await expect(rpc(`public.claim_telegram_invite('${a}')`)).rejects.toThrow();
  await db.exec(`update profiles set paid=false where id='${a}'`); await expect(begin()).rejects.toThrow('Access denied');
});
it('leases invitation creation and approves only its verified owner, never a forwarded link', async () => {
  await linked(); const claim = await rpc(`public.claim_telegram_invite('${a}')`);
  expect((await rpc(`public.claim_telegram_invite('${a}')`)).busy).toBe(true);
  expect(await rpc(`public.complete_telegram_invite('${a}','00000000-0000-0000-0000-000000000000','https://t.me/+personal',now()+interval '10 minutes')`)).toBe(false);
  expect(await rpc(`public.complete_telegram_invite('${a}','${claim.lease}','https://t.me/+personal',now()+interval '10 minutes')`)).toBe(true);
  expect(await rpc("public.authorize_telegram_member(123,'https://t.me/+personal')")).toBe(true);
  expect(await rpc("public.authorize_telegram_member(999,'https://t.me/+personal')")).toBe(false);
  expect(await rpc("public.authorize_telegram_member(123,'https://t.me/+other')")).toBe(false);
  await db.exec(`update profiles set status='SUSPENDED' where id='${a}'`); expect(await rpc("public.authorize_telegram_member(123,'https://t.me/+personal')")).toBe(false);
});
it('welcomes a verified member once and prioritizes trading events over welcome bursts', async () => {
  await linked(); await rpc("public.mark_telegram_member(123,'MEMBER')"); await rpc("public.mark_telegram_member(123,'MEMBER')");
  expect(await query("select id from scanner_telegram_jobs where kind='WELCOME'")).toHaveLength(1);
  await db.exec("insert into scanner_telegram_jobs(dedupe_key,kind,payload,expires_at) values('event:test','EVENT','{}',now()+interval '1 minute')");
  const job = (await rpc('public.claim_scanner_telegram_job()')).job; expect(job.kind).toBe('EVENT'); expect(job.chatId).toBe(-123);
  await rpc("public.mark_telegram_member(123,'LEFT')"); expect((await rpc('public.get_telegram_access()')).state).toBe('LINKED');
  expect((await query('select invite_link from telegram_memberships'))[0].invite_link).toBe(null);
});
it('deduplicates webhook deliveries with exclusive leases and rejects a stale completion', async () => {
  const claim = await rpc('public.claim_telegram_webhook_update(50)'); expect((await rpc('public.claim_telegram_webhook_update(50)')).busy).toBe(true);
  expect(await rpc("public.complete_telegram_webhook_update(50,'00000000-0000-0000-0000-000000000000')")).toBe(false);
  expect(await rpc(`public.complete_telegram_webhook_update(50,'${claim.lease}')`)).toBe(true);
  expect((await rpc('public.claim_telegram_webhook_update(50)')).done).toBe(true);
});
it('keeps binding records, admin controls and delivery jobs private', async () => {
  await linked();
  await db.exec('set role authenticated');
  expect((await rpc('public.get_telegram_access()')).state).toBe('LINKED');
  await expect(query('select * from telegram_memberships')).rejects.toThrow(/permission denied/);
  await expect(rpc(`public.claim_telegram_invite('${b}')`)).rejects.toThrow(/permission denied/);
  await expect(rpc('public.claim_telegram_webhook_update(1)')).rejects.toThrow(/permission denied/);
  await db.exec('reset role;set role anon'); await expect(rpc('public.begin_telegram_access()')).rejects.toThrow(/permission denied/); await db.exec('reset role');
});

it('lets the Telegram owner move an unconfirmed proposal to the Galaxy account they reopen, but never a confirmed binding', async () => {
  const first = await begin(); await propose(first,123);
  await who(b); const second = await begin(); expect(await propose(second,123)).toBe(true);
  await who(a); const previous = await rpc('public.get_telegram_access()'); expect(previous).toMatchObject({ state:'WAITING',linkIssue:'REOPENED_ELSEWHERE' });
  await expect(rpc('public.confirm_telegram_access()')).rejects.toThrow();
  await who(b); await rpc('public.confirm_telegram_access()');
  await who(a); const blocked = await rpc(`public.propose_telegram_account_v2('${token(first)}',123,'same','Same')`);
  expect(blocked).toMatchObject({accepted:false,reason:'ALREADY_LINKED'});
  expect((await rpc('public.get_telegram_access()')).linkIssue).toBe('ALREADY_LINKED');
  expect(await query("select id from scanner_telegram_jobs where kind='LINK_ERROR' and recipient_id=123")).toHaveLength(1);
  expect((await query('select count(*)::int count from telegram_memberships where confirmed_at is not null and telegram_id=123'))[0].count).toBe(1);
});

it('reports a conflicting proposed identity and clears that issue only through an explicit restart', async () => {
  const first = await begin(); await propose(first,123);
  const result = await rpc(`public.propose_telegram_account_v2('${token(first)}',456,null,'Other')`);
  expect(result.reason).toBe('DIFFERENT_TELEGRAM'); expect((await rpc('public.get_telegram_access()')).linkIssue).toBe('DIFFERENT_TELEGRAM');
  await rpc('public.reset_telegram_proposal()'); const fresh = await begin(); expect(fresh.linkIssue).toBe(null); expect(token(fresh)).not.toBe(token(first));
  expect(await propose(first,456)).toBe(false); expect(await propose(fresh,456)).toBe(true);
});

it('releases an expired unconfirmed reservation when its Telegram owner starts a fresh account flow', async () => {
  const first = await begin(); await propose(first,123); await db.exec("update telegram_memberships set token_expires_at=now()-interval '2 hours'");
  await who(b); expect(await propose(await begin(),123)).toBe(true);
});

it('holds scheduled photos until due and gives trading events priority', async () => {
 await db.exec("insert into scanner_telegram_jobs(dedupe_key,kind,payload,next_attempt_at,expires_at) values('photo:test','PHOTO','{}',now()+interval '1 hour',now()+interval '2 hours')");
 expect(await rpc('public.claim_scanner_telegram_job()')).toBe(null);
 await db.exec("update scanner_telegram_jobs set next_attempt_at=now();insert into scanner_telegram_jobs(dedupe_key,kind,payload,expires_at) values('event:test','EVENT','{}',now()+interval '1 minute')");
 expect((await rpc('public.claim_scanner_telegram_job()')).job.kind).toBe('EVENT');
 await db.exec("update scanner_telegram_settings set next_send_at='-infinity'");
 expect((await rpc('public.claim_scanner_telegram_job()')).job.kind).toBe('PHOTO');
});
