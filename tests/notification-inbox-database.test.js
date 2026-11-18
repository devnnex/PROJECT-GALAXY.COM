import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';

const member = '00000000-0000-4000-8000-000000000001', other = '00000000-0000-4000-8000-000000000002';
const room = '00000000-0000-4000-8000-000000000010';
let db;
const q = (sql, args = []) => db.query(sql, args);
const open = async () => (await q('select mark_all_notifications_read() as result')).rows[0].result;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create function public.require_user() returns uuid language plpgsql as $$begin if auth.uid() is null then raise exception 'Forbidden';end if;return auth.uid();end$$;
    create table public.meetings(id uuid primary key,title text,room_code text,status text);
    create table public.meeting_participants(id uuid primary key,meeting_id uuid,user_id uuid);
    create table public.meeting_invitations(id uuid primary key,meeting_id uuid,invitee_id uuid,status text);
    create table public.direct_messages(id uuid primary key,body text);
    create table public.scanner_events(id uuid primary key,payload jsonb);
    create table public.notifications(id uuid primary key default gen_random_uuid(),user_id uuid,actor_id uuid,type text,title text,body text,resource_id uuid,resource_type text,read_at timestamptz,created_at timestamptz default now(),direct_message_id uuid references direct_messages(id) on delete cascade);
    create table public.push_delivery_jobs(id uuid primary key default gen_random_uuid(),notification_id uuid references notifications(id) on delete cascade);
    insert into meetings values('${room}','Room','ABCD-1234','ACTIVE');
    insert into meeting_invitations values('${room}','${room}','${member}','PENDING');
    insert into direct_messages values('${room}','Retain this message');
    insert into scanner_events values('${room}','{"hit1":true}');`);
  await db.exec(readFileSync(new URL('../supabase/migrations/20261118190000_notification_inbox_read_and_clear.sql', import.meta.url), 'utf8'));
}, 20000);
beforeEach(async () => {
  await db.exec(`reset role;truncate notifications,push_delivery_jobs cascade;select set_config('test.user','${member}',false);`);
});
afterAll(async () => db?.close());

it('returns a readable snapshot, clears only the caller envelopes and cascades only their push jobs', async () => {
  await db.exec(`insert into notifications(user_id,type,title,resource_id,resource_type) values('${member}','SCANNER_SIGNAL','TP1','${room}','ScannerEvent'),('${other}','SCANNER_SIGNAL','Other','${room}','ScannerEvent');insert into push_delivery_jobs(notification_id) select id from notifications;`);
  const result = await open();
  expect(result).toMatchObject({ updated: 1, cleared: 1, notifications: [{ title: 'TP1', userId: member, readAt: expect.any(String) }] });
  expect((await q('select user_id from notifications')).rows).toEqual([{ user_id: other }]);
  expect((await q('select count(*)::int as n from push_delivery_jobs')).rows[0].n).toBe(1);
  expect((await q('select count(*)::int as n from scanner_events')).rows[0].n).toBe(1);
});
it('retains actionable invitation metadata and the original message/meeting/invitation records', async () => {
  await db.exec(`insert into notifications(user_id,type,title,resource_id,resource_type) values('${member}','MEETING_INVITE','Invitation','${room}','Meeting');insert into notifications(user_id,type,title,direct_message_id) values('${member}','DIRECT_MESSAGE','Message','${room}');`);
  const result = await open(), invitation = result.notifications.find((row) => row.type === 'MEETING_INVITE');
  expect(invitation).toMatchObject({ meetingId: room, roomCode: 'ABCD-1234', meetingStatus: 'ACTIVE', invitationId: room, invitationStatus: 'PENDING' });
  for (const table of ['meetings','meeting_invitations','direct_messages']) expect((await q(`select count(*)::int as n from ${table}`)).rows[0].n).toBe(1);
});
it('clears all old read/unread records with a bounded 100-item response and remains idempotent', async () => {
  await q("insert into notifications(user_id,type,title,read_at,created_at) select $1,'SCANNER_SIGNAL',n::text,case when n%2=0 then now() end,now()-make_interval(mins=>n) from generate_series(1,150) n", [member]);
  const result = await open(); expect(result.cleared).toBe(150); expect(result.updated).toBe(75); expect(result.notifications).toHaveLength(100); expect(result.notifications[0].title).toBe('1');
  expect(await open()).toMatchObject({ updated: 0, cleared: 0, notifications: [] });
});
it('preserves a notification inserted after the acknowledged snapshot', async () => {
  await q("insert into notifications(user_id,type,title) values($1,'SCANNER_SIGNAL','Old')", [member]); await open();
  await q("insert into notifications(user_id,type,title) values($1,'SCANNER_SIGNAL','New')", [member]);
  expect((await q('select title,read_at from notifications')).rows).toEqual([{ title: 'New', read_at: null }]);
});

it('returns acknowledgement IDs for recent scanner Push outside the bounded display snapshot', async () => {
  await q("insert into notifications(user_id,type,title) select $1,'SCANNER_SIGNAL',n::text from generate_series(1,101) n", [member]);
  const result = await open(); expect(result.notifications).toHaveLength(100); expect(result.clearedScannerIds).toHaveLength(101);
  const visible = new Set(result.notifications.map((row) => row.id));
  expect(result.clearedScannerIds.filter((id) => !visible.has(id))).toHaveLength(1);
});
it('rejects anonymous/unauthenticated execution and scopes authenticated clearing to auth.uid()', async () => {
  await db.exec(`insert into notifications(user_id,title) values('${member}','Mine'),('${other}','Other');set role anon;`);
  await expect(open()).rejects.toThrow(); await db.exec('reset role;set role authenticated');
  const result = await open(); expect(result.cleared).toBe(1);
  await q("select set_config('test.user','',false)"); await expect(open()).rejects.toThrow('Forbidden');
  await db.exec('reset role'); expect((await q('select user_id from notifications')).rows).toEqual([{ user_id: other }]);
});
