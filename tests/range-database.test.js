import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {beforeAll,beforeEach,afterAll,expect,it} from 'vitest';
let db;
const user='00000000-0000-4000-8000-000000000001';
const q=(sql,args=[])=>db.query(sql,args);
const value=async(sql,args=[])=>(await q(sql,args)).rows[0].value;
const claim=()=>value('select public.claim_range_tick() value');
const trade=(suffix='one')=>({key:`RANGE777:${suffix}`,strategy:'RANGE777',side:'BUY',symbol:'XAUUSD',source:'gold-api',timeframeMinutes:5,barAt:new Date().toISOString(),detectedAt:new Date().toISOString(),entry:100,initialSl:90,sl:90,status:'OPEN',outcome:null,beAt:null});
const complete=(lease,trades=[],events=[])=>value('select public.complete_range_tick($1,$2,$3,$4) value',[lease,'{}',JSON.stringify(trades),JSON.stringify(events)]);
beforeAll(async()=>{
 db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema vault;create schema net;
 create table profiles(id uuid primary key,status text,is_guest boolean);insert into profiles values('${user}','ACTIVE',false),('00000000-0000-4000-8000-000000000002','ACTIVE',true);
 create function public.has_active_membership(p uuid) returns boolean language sql as $$select true$$;
 create function public.require_registered_member() returns uuid language sql as $$select '${user}'::uuid$$;
 create table notifications(id uuid primary key default gen_random_uuid(),user_id uuid,actor_id uuid,type text,title text,body text,resource_type text,resource_id uuid,read_at timestamptz,created_at timestamptz default now());
 create table push_subscriptions(id uuid primary key,user_id uuid,subscription jsonb);create table push_delivery_jobs(id uuid primary key,notification_id uuid,subscription_id uuid,attempts integer,sent_at timestamptz,leased_until timestamptz,created_at timestamptz);
 create table meetings(id uuid,status text,locked boolean,scheduled_ends_at timestamptz,room_code text);
 create function public.dispatch_pending_push() returns void language sql as $$select$$;
 create table vault.decrypted_secrets(name text,decrypted_secret text);create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$select 1::bigint$$;
 create table scanner_trades(id uuid);create table scanner_events(id uuid primary key,trade_id uuid,type text,occurred_at timestamptz,payload jsonb);
 create table scanner_daily_statistics(day date,totals numeric[],targets jsonb);
 create table telegram_community_config(id boolean,chat_id bigint);insert into telegram_community_config values(true,-123);`);
 for(const name of ['20261119120000_scanner_telegram.sql','20261119193000_telegram_scheduled_photo.sql','20261119210000_range777_strategy.sql','20261119220000_aurum_bot_branding.sql'])await db.exec(readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8'));
},30000);
beforeEach(async()=>{await db.exec(`reset role;truncate range_scanner_events,range_scanner_trades,range_daily_statistics,notifications,scanner_telegram_jobs;
 update range_scanner_state set enabled=true,started_at=now()-interval '90 days',runtime='{}',lease=null,lease_until=null,totals=array[0,0,0,0,0,0,0,0,0]::numeric[];
 update scanner_telegram_settings set enabled=true,activated_at=now()-interval '90 days',next_send_at='-infinity',dispatch_until='-infinity';`);});
afterAll(async()=>db?.close());
it('leases exclusively and atomically records notifications, private Telegram jobs and independent statistics',async()=>{
 const lease=await claim();expect(await claim()).toBe(null);const t=trade();const e={type:'SIGNAL',tradeKey:t.key,occurredAt:t.detectedAt,payload:t};
 expect(await complete(lease.lease,[t],[e])).toBe(true);expect(await complete(lease.lease,[t],[e])).toBe(false);
 expect((await q('select * from notifications')).rows).toHaveLength(1);expect((await q('select resource_type from notifications')).rows[0].resource_type).toBe('RangeEvent');
 const job=(await q('select payload from scanner_telegram_jobs')).rows[0].payload;expect(job.strategy).toBe('RANGE777');
 expect((await value("select public.range_report('2000-01-01','2200-01-01') value")).signals).toBe(1);
 expect((await q('select * from scanner_daily_statistics')).rows).toHaveLength(0);
 const again=await claim();await complete(again.lease,[t],[e]);expect((await q('select * from scanner_telegram_jobs')).rows).toHaveLength(1);
});
it('moves the daily ledger from open to BE without treating a prior +$5 as a winning close',async()=>{
 const t=trade();let c=await claim();await complete(c.lease,[t]);t.sl=100;t.beAt=new Date().toISOString();c=await claim();await complete(c.lease,[t]);
 let report=await value("select public.range_report('2000-01-01','2200-01-01') value");expect(report).toMatchObject({signals:1,open:1,protected:1,wins:0});
 t.status='CLOSED';t.outcome='BE';t.net=0;t.exit=100;c=await claim();await complete(c.lease,[t]);
 report=await value("select public.range_report('2000-01-01','2200-01-01') value");expect(report).toMatchObject({signals:1,open:0,breakevens:1,wins:0});
});
it('serves global counters without rescanning trades and keeps statistics unchanged for a stop-only update',async()=>{
 expect(await complete(null)).toBe(false);
 const t=trade();let c=await claim();await complete(c.lease,[t]);
 const before=await value('select public.get_range_trade() value');expect(before).toMatchObject({signals:1,wins:0,open:1});
 t.sl=95;c=await claim();await complete(c.lease,[t]);
 const after=await value('select public.get_range_trade() value');expect(after.statisticsVersion).toEqual(before.statisticsVersion);expect(after.trades[0].sl).toBe(95);expect(after.signals).toBe(1);
});
it('rejects a second open position and rolls the whole batch back',async()=>{
 const c=await claim();await complete(c.lease,[trade()]);const another=trade('two');another.barAt=new Date(Date.now()+300000).toISOString();const second=await claim();
 await expect(complete(second.lease,[another])).rejects.toThrow(/unique constraint/);expect((await q('select * from range_scanner_trades')).rows).toHaveLength(1);
});
it('queues separately deduplicated reports for both strategies at the same boundary',async()=>{
 await q("select public.enqueue_scanner_telegram_reports('2026-11-23T13:00:00Z')");await q("select public.enqueue_scanner_telegram_reports('2026-11-23T13:00:00Z')");
 const rows=(await q("select payload->>'strategy' strategy from scanner_telegram_jobs where kind='WEEKLY'")).rows;expect(rows).toHaveLength(2);expect(rows.some(r=>r.strategy==='RANGE777')).toBe(true);
});
it('keeps service state, identity caches and publication RPCs inaccessible to members',async()=>{
 await db.exec('set role authenticated');expect(await value('select public.get_range_trade() value')).toMatchObject({signals:0});
 await expect(q('select * from range_scanner_trades')).rejects.toThrow(/permission denied/);await expect(claim()).rejects.toThrow(/permission denied/);await expect(q('select * from scanner_telegram_media')).rejects.toThrow(/permission denied/);
});
