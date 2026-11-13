import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../supabase/functions/scanner-signals/engine.js';
import { openTrade, updateTrade } from '../supabase/functions/scanner-signals/trade-accounting.js';

const member = '00000000-0000-4000-8000-000000000001';
const admin = '00000000-0000-4000-8000-000000000002';
const guest = '00000000-0000-4000-8000-000000000003';
const suspended = '00000000-0000-4000-8000-000000000004';
let db;
const q = (sql, args = []) => db.query(sql, args);
const j = JSON.stringify;
const makeTrade = (key = 'XAUUSD:5:initial', offset = 0) => {
  const now = Date.now() - offset; const bucket = Math.floor(now / 300_000) * 300_000;
  return openTrade({ key, side: 'BUY', symbol: 'XAUUSD', timeframeMinutes: 5, entry: 100, sl: 90, tp1: 105, tp2: 110, tp3: 115,
    rewardRatio: 1.5, source: 'gold-api', barAt: new Date(bucket).toISOString(), detectedAt: new Date(now).toISOString() }, DEFAULT_SETTINGS);
};
const claim = async () => (await q('select public.claim_scanner_tick() as value')).rows[0].value;
const complete = async (lease, trades = [], events = [], runtime = {}) => (await q('select public.complete_scanner_tick($1,$2,$3,$4,$5,$6) as value', [lease, 'gold-api', j(DEFAULT_SETTINGS), j(runtime), j(trades), j(events)])).rows[0].value;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema vault; create schema net;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create table profiles(id uuid primary key,name text,status text default 'ACTIVE',is_guest boolean default false);
    create function public.has_active_membership(p_user_id uuid) returns boolean language sql as $$select exists(select 1 from profiles where id=p_user_id and status='ACTIVE')$$;
    create function public.require_registered_member() returns uuid language plpgsql as $$begin if not exists(select 1 from profiles where id=auth.uid() and status='ACTIVE' and not is_guest) then raise exception 'Forbidden'; end if; return auth.uid(); end$$;
    create table notifications(id uuid primary key default gen_random_uuid(),user_id uuid references profiles,actor_id uuid,type text,title text,body text,resource_type text,resource_id uuid,read_at timestamptz,created_at timestamptz default now());
    create table push_subscriptions(id uuid primary key default gen_random_uuid(),user_id uuid references profiles,subscription jsonb);
    create table push_delivery_jobs(id uuid primary key default gen_random_uuid(),notification_id uuid references notifications,subscription_id uuid references push_subscriptions,attempts integer default 0,leased_until timestamptz default now(),sent_at timestamptz,created_at timestamptz default now(),unique(notification_id,subscription_id));
    create table meetings(id uuid primary key,status text,locked boolean,scheduled_ends_at timestamptz,room_code text);
    create table push_dispatches(id uuid default gen_random_uuid());
    create function public.dispatch_pending_push() returns void language sql as $$insert into push_dispatches default values$$;
    create table vault.decrypted_secrets(name text,decrypted_secret text);
    create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$select 1::bigint$$;
    insert into profiles(id,name,status,is_guest) values('${member}','Member','ACTIVE',false),('${admin}','Admin','ACTIVE',false),('${guest}','Guest','ACTIVE',true),('${suspended}','Suspended','SUSPENDED',false);`);
  await db.exec(readFileSync(new URL('../supabase/migrations/20261113010000_server_scanner_signals.sql', import.meta.url), 'utf8'));
  await db.exec(readFileSync(new URL('../supabase/migrations/20261113131000_scanner_notice_symbols.sql', import.meta.url), 'utf8'));
}, 20000);
beforeEach(async () => {
  await db.exec(`reset role;truncate scanner_events,scanner_trades,notifications,push_subscriptions,push_delivery_jobs,push_dispatches cascade;
    update scanner_streams set enabled=true,provider='gold-api',runtime='{}',lease_id=null,lease_until=null,next_poll_at=now(),tracking_started_at=now();
    update profiles set status=case when id='${suspended}' then 'SUSPENDED' else 'ACTIVE' end;
    insert into push_subscriptions(user_id,subscription) values('${member}','{}'),('${admin}','{}'),('${guest}','{}'),('${suspended}','{}');
    select set_config('test.user','${member}',false);`);
});
afterAll(async () => db?.close());

it('leases once, publishes to active registered members and queues only their devices', async () => {
  const tick = await claim(); expect(tick).toBeTruthy(); expect(await claim()).toBeNull();
  const trade = makeTrade(); const event = { tradeKey: trade.key, type: 'SIGNAL', occurredAt: new Date().toISOString(), payload: trade };
  expect(await complete(tick.lease, [trade], [event])).toBe(true);
  const recipients = (await q('select user_id from notifications order by user_id')).rows.map((row) => row.user_id);
  expect(recipients).toEqual([member, admin]);
  const notice = (await q('select title,body from notifications limit 1')).rows[0];
  expect(notice.title).toBe('🔵 BUY · Entrada · XAUUSD · 5m');
  expect(notice.body).toBe('🔵 Entrada 100.000 | 🔴 SL 90.000 | 🎯 TP1 105.000 | 🎯 TP2 110.000 | 🎯 TP3 115.000');
  expect((await q('select count(*)::int as count from push_delivery_jobs')).rows[0].count).toBe(2);
  expect((await q('select count(*)::int as count from push_dispatches')).rows[0].count).toBe(1);
  expect(await complete(tick.lease, [trade], [event])).toBe(false);
  await q('update scanner_streams set next_poll_at=now()');
  const retry = await claim(); expect(await complete(retry.lease, [trade], [event])).toBe(true);
  expect((await q('select count(*)::int as count from notifications')).rows[0].count).toBe(2);
});
it('records TP1/2/3 once and the completed winner atomically with delivery jobs', async () => {
  const trade = makeTrade(); const reached = updateTrade(trade, 115, Date.now());
  const tick = await claim();
  expect(await complete(tick.lease, [reached.trade], reached.events)).toBe(true);
  const result = (await q('select get_black_galaxy_trade() as value')).rows[0].value;
  expect(result).toMatchObject({ signals: 1, wins: 1, losses: 0, ignored: 0 });
  expect(result.trades[0]).toMatchObject({ hit1: true, hit2: true, hit3: true, grossPips: 3000 });
  expect((await q('select count(*)::int as count from notifications')).rows[0].count).toBe(6);
  const notices = (await q('select title,body from notifications')).rows;
  const first = notices.find((item) => item.title.startsWith('✅ TP1'));
  expect(first.title).toBe('✅ TP1 alcanzado · XAUUSD · 5m');
  expect(first.body).toContain('✅ TP1'); expect(first.body).toContain('🎯 TP2');
  const third = notices.find((item) => item.title.startsWith('✅ TP3'));
  for (const level of [1, 2, 3]) expect(third.body).toContain(`✅ TP${level}`);
});
it('distinguishes red SL exits after a TP without changing the protected winning outcome', async () => {
  const first = updateTrade(makeTrade(), 105, Date.now());
  const stopped = updateTrade(first.trade, 90, Date.now());
  const tick = await claim(); await complete(tick.lease, [stopped.trade], stopped.events);
  const notice = (await q('select title,body from notifications limit 1')).rows[0];
  expect(notice.title).toBe('🔴 SL · Salida tras TP · sin descuento · XAUUSD · 5m');
  expect(notice.body).toContain('✅ TP1');
  const result = (await q('select get_black_galaxy_trade() as value')).rows[0].value;
  expect(result.wins).toBe(1); expect(result.losses).toBe(0);
});
it('excludes an ignored trade from wins and losses, retaining both real wins and SL', async () => {
  const win = updateTrade(makeTrade('win', 900_000), 115, Date.now()).trade;
  const loss = updateTrade(makeTrade('loss', 600_000), 90, Date.now()).trade;
  const ignored = updateTrade(makeTrade('ignored', 300_000), 98, Date.now(), true).trade;
  for (const trade of [win, loss, ignored]) await q('insert into scanner_trades(stream_id,trade_key,bar_at,side,status,outcome,payload) values($1,$2,$3,$4,$5,$6,$7)', ['xauusd-5m', trade.key, trade.barAt, trade.side, trade.status, trade.outcome, j(trade)]);
  const result = (await q('select get_black_galaxy_trade() as value')).rows[0].value;
  expect(result).toMatchObject({ signals: 3, wins: 1, losses: 1, ignored: 1 });
  expect(result.wins * 100 / (result.wins + result.losses)).toBe(50);
});
it('does not send stale scanner events, suspended accounts, read notices or cross-account jobs', async () => {
  const trade = makeTrade(); const tick = await claim();
  await complete(tick.lease, [trade], [{ tradeKey: trade.key, type: 'SIGNAL', occurredAt: new Date().toISOString(), payload: trade }]);
  await q('update scanner_events set occurred_at=now()-interval \'6 minutes\'');
  expect((await q('select * from claim_push_delivery_jobs()')).rows).toEqual([]);
  await q('update scanner_events set occurred_at=now()');
  await q('update profiles set status=$1 where id=$2', ['SUSPENDED', member]);
  const jobs = (await q('select * from claim_push_delivery_jobs()')).rows;
  expect(jobs).toHaveLength(1); expect(jobs[0].notification.userId).toBe(admin);
});
it('rolls back the whole batch if its notification is malformed', async () => {
  const trade = makeTrade(); const tick = await claim();
  await expect(complete(tick.lease, [trade], [{ tradeKey: trade.key, type: 'INVALID', occurredAt: new Date().toISOString(), payload: trade }])).rejects.toThrow();
  expect((await q('select count(*)::int as count from scanner_trades')).rows[0].count).toBe(0);
  expect((await q('select runtime from scanner_streams')).rows[0].runtime).toEqual({});
});
it('retains history quota on a failed worker without publishing or enabling anything', async () => {
  const tick = await claim();
  await q('select checkpoint_scanner_history($1,$2)', [tick.lease, j({ calls: [Date.now()], bars: [] })]);
  await q('select fail_scanner_tick($1,$2)', [tick.lease, 'PROVIDER_UNAVAILABLE']);
  const row = (await q('select runtime,last_error,lease_id from scanner_streams')).rows[0];
  expect(row.runtime.bootstrap.calls).toHaveLength(1); expect(row.lease_id).toBeNull(); expect(row.last_error).toBe('PROVIDER_UNAVAILABLE');
});
it('prevents clients from forging signals or reading private runtime, while exposing the member summary', async () => {
  await db.exec('set role authenticated');
  await expect(q('select claim_scanner_tick()')).rejects.toThrow();
  await expect(q('select * from scanner_streams')).rejects.toThrow();
  expect((await q('select get_black_galaxy_trade() as value')).rows[0].value.signals).toBe(0);
  await q("select set_config('test.user',$1,false)", [guest]);
  await expect(q('select get_black_galaxy_trade()')).rejects.toThrow('Forbidden');
});
