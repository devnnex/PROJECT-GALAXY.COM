import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

let db;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema vault; create table vault.decrypted_secrets(name text,decrypted_secret text);
    create table public.scanner_events(id uuid primary key default gen_random_uuid(),trade_id uuid not null,type text not null,occurred_at timestamptz not null,payload jsonb not null);
    create table public.scanner_daily_statistics(day date primary key,totals numeric[] not null,targets jsonb not null default '[]');`);
  await db.exec(readFileSync(new URL('../supabase/migrations/20261119120000_scanner_telegram.sql', import.meta.url), 'utf8'));
}, 30_000);
beforeEach(async () => { await db.exec(`reset role; truncate public.scanner_events,public.scanner_telegram_jobs,public.scanner_daily_statistics; update public.scanner_telegram_settings set enabled=false,activated_at=null,next_send_at='-infinity',dispatch_until='-infinity';`); });
afterAll(async () => db?.close());
const sql = async (statement) => (await db.query(statement)).rows;
const enable = async () => db.exec(`update public.scanner_telegram_settings set enabled=true,activated_at=now()-interval '1 minute';`);
const insert = async (when = 'now()') => db.exec(`insert into public.scanner_events(trade_id,type,occurred_at,payload) values('00000000-0000-0000-0000-000000000001','TP1',${when},'{}');`);
const claim = async () => (await sql('select public.claim_scanner_telegram_job() result'))[0].result;

it('installs disabled, queues once per new canonical event and never replays history on activation', async () => {
  await insert(); expect(await sql('select id from public.scanner_telegram_jobs')).toHaveLength(0);
  await enable(); expect(await sql('select id from public.scanner_telegram_jobs')).toHaveLength(0);
  await insert(); expect(await sql('select id from public.scanner_telegram_jobs')).toHaveLength(1);
  await insert("now()-interval '2 hours'"); expect(await sql('select id from public.scanner_telegram_jobs')).toHaveLength(1);
  expect(await sql('select id from public.scanner_events')).toHaveLength(3);
});
it('leases deliveries exclusively, globally paces bursts and rejects stale acknowledgements', async () => {
  await enable(); await insert(); await insert();
  const first = (await claim()).job; expect(first.id).toBeDefined();
  const second = await claim(); expect(second.waitMs).toBeGreaterThan(0);
  expect((await sql(`select public.finish_scanner_telegram_job(${first.id},'00000000-0000-0000-0000-000000000000','sent') ok`))[0].ok).toBe(false);
  expect((await sql(`select public.finish_scanner_telegram_job(${first.id},'${first.lease}','sent',123) ok`))[0].ok).toBe(true);
  await db.exec(`update public.scanner_telegram_settings set next_send_at='-infinity';`);
  expect((await claim()).job.id).not.toBe(first.id);
});
it('backs off rate limits and expires old alerts without sending late entries', async () => {
  await enable(); await insert(); const job = (await claim()).job;
  await sql(`select public.finish_scanner_telegram_job(${job.id},'${job.lease}','retry',null,60,'telegram_429')`);
  expect(await claim()).toBe(null);
  const rows = await sql(`select next_attempt_at>now()+interval '59 seconds' backed_off from public.scanner_telegram_jobs`); expect(rows[0].backed_off).toBe(true);
  await db.exec(`update public.scanner_telegram_jobs set expires_at=now()-interval '1 second';`);
  expect(await claim()).toBe(null); expect((await sql('select state from public.scanner_telegram_jobs'))[0].state).toBe('expired');
});
it('reports cached cohorts, excludes ignored trades from accuracy and protects SL after TP', async () => {
  await db.exec(`insert into public.scanner_daily_statistics values
    ('2026-11-16',array[4,2,1,1,0,35,5,2,1,1,15],'[{"gain":10,"loss":5,"protectedLoss":0},{"gain":10,"loss":10,"protectedLoss":5},{"gain":15,"loss":10,"protectedLoss":5}]'),
    ('2026-11-17',array[1,0,1,0,0,0,5,0,0,0,0],'[{"gain":0,"loss":5},{"gain":0,"loss":5},{"gain":0,"loss":5}]'),
    ('2026-10-01',array[99,99,0,0,0,0,0,0,0,0,0],'[]');`);
  const report = (await sql(`select public.scanner_telegram_report('2026-11-16','2026-11-22') report`))[0].report;
  expect(report).toMatchObject({ signals: 5, wins: 2, losses: 2, ignored: 1, signalDays: 2, hits: [2, 1, 1] });
  expect(report.bestDay.day).toBe('2026-11-16'); expect(report.worstDay.day).toBe('2026-11-17');
  expect(report.targets.map((target) => target.net)).toEqual([0, 0, 50]);
});
it('creates each weekly/monthly report once, at 08:00 Bogotá, with correct year and month boundaries', async () => {
  await db.exec(`update public.scanner_telegram_settings set enabled=true,activated_at='2026-11-19T13:00Z';`);
  await sql(`select public.enqueue_scanner_telegram_reports('2026-11-23T12:59Z')`); expect(await sql('select id from public.scanner_telegram_jobs')).toHaveLength(0);
  await sql(`select public.enqueue_scanner_telegram_reports('2026-11-23T13:00Z')`);
  await sql(`select public.enqueue_scanner_telegram_reports('2026-11-23T14:00Z')`);
  expect((await sql('select kind,payload from public.scanner_telegram_jobs'))[0]).toMatchObject({ kind: 'WEEKLY', payload: { from: '2026-11-16', to: '2026-11-22' } });
  await sql(`select public.enqueue_scanner_telegram_reports('2027-01-01T13:00Z')`);
  const monthly = await sql("select payload from public.scanner_telegram_jobs where dedupe_key='monthly:2027-01-01'");
  expect(monthly[0].payload).toMatchObject({ from: '2026-12-01', to: '2026-12-31' });
});
it('keeps credentials and delivery/report controls inaccessible to app users', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await expect(sql('select public.claim_scanner_telegram_job()')).rejects.toThrow(/permission denied/);
    await expect(sql("select public.scanner_telegram_report('2026-11-01','2026-11-30')")).rejects.toThrow(/permission denied/);
    await expect(sql('select * from public.scanner_telegram_settings')).rejects.toThrow(/permission denied/);
    await db.exec('reset role');
  }
});
