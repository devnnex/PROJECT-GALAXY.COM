import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, expect, it } from 'vitest';

const owner = '00000000-0000-4000-8000-000000000001';
const member = '00000000-0000-4000-8000-000000000002';
const other = '00000000-0000-4000-8000-000000000003';
const room = '00000000-0000-4000-8000-000000000010';
let db;
const query = (sql, args = []) => db.query(sql, args);
const as = (id) => query("select set_config('test.user', $1, false)", [id]);
const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/test-device', keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } };
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema storage; create schema vault; create schema net;
    create table auth.users(id uuid primary key, email text);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create table public.profiles(id uuid primary key, name text, avatar text default '', role text default 'USER',status text default 'ACTIVE',is_guest boolean default false);
    create table storage.objects(bucket_id text,name text);
    create table public.app_settings(key text primary key,value jsonb,is_secret boolean default false);
    create table public.meetings(id uuid primary key,host_id uuid,title text,room_code text,status text default 'ACTIVE',starts_at timestamptz default now(),scheduled_ends_at timestamptz,locked boolean default false);
    create table public.notifications(id uuid primary key default gen_random_uuid(),user_id uuid references profiles,actor_id uuid,type text,title text,body text,resource_type text,resource_id uuid,read_at timestamptz,created_at timestamptz default now());
    create table public.direct_messages(id uuid primary key default gen_random_uuid(),sender_id uuid,recipient_id uuid,body text,read_at timestamptz);
    create table vault.decrypted_secrets(name text,decrypted_secret text);
    create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$select 1::bigint$$;
    create function public.is_current_session_valid() returns boolean language sql as $$select exists(select 1 from profiles where id=auth.uid() and status='ACTIVE')$$;
    create function public.require_registered_member() returns uuid language plpgsql as $$begin if not exists(select 1 from profiles where id=auth.uid() and status='ACTIVE' and not is_guest) then raise exception 'Forbidden'; end if; return auth.uid(); end$$;
    create function public.require_admin() returns uuid language plpgsql as $$begin if not exists(select 1 from profiles where id=auth.uid() and role='ADMIN' and status='ACTIVE') then raise exception 'Forbidden'; end if; return auth.uid(); end$$;
    insert into auth.users values ('${owner}','elkin56ty@gmail.com'),('${member}','member@example.com'),('${other}','other@example.com');
    insert into profiles(id,name,role) values('${owner}','Elkin','ADMIN'),('${member}','Member','USER'),('${other}','Other','USER');`);
  const migration = readFileSync(new URL('../supabase/migrations/20261105100000_admin_profiles_and_push.sql', import.meta.url), 'utf8');
  await db.exec(migration.replace(/create extension if not exists pg_net[^;]*;/g, ''));
}, 20000);
afterAll(async () => db?.close());

it('allows only the exact owner to update names and preserves unmodified photos and access', async () => {
  await as(member);
  await expect(query('select public.admin_update_user_profile($1,$2)', [other, 'Changed'])).rejects.toThrow();
  await query("update profiles set role='ADMIN' where id=$1", [other]);
  await as(other);
  await expect(query('select public.admin_update_user_profile($1,$2)', [member, 'Changed'])).rejects.toThrow();
  await as(owner);
  const result = await query('select public.admin_update_user_profile($1,$2) as result', [member, 'New name']);
  expect(result.rows[0].result).toMatchObject({ id: member, name: 'New name', avatar: '' });
  expect((await query('select role,status from profiles where id=$1', [member])).rows[0]).toEqual({ role: 'USER', status: 'ACTIVE' });
  await expect(query('select public.admin_update_user_profile($1,$2)', [member, 'x'])).rejects.toThrow();
});

it('validates the target photo path and stored file, including suspended accounts', async () => {
  await as(owner);
  const avatar = `${member}/admin-00000000-0000-4000-8000-000000000099?v=1793870000000`;
  await expect(query('select public.admin_update_user_profile($1,$2,$3)', [member, 'Member', avatar])).rejects.toThrow();
  await query("insert into storage.objects values ('profile-avatars',$1)", [avatar.split('?')[0]]);
  await query("update profiles set status='SUSPENDED' where id=$1", [member]);
  expect((await query('select public.can_upload_admin_avatar($1) as allowed', [avatar.split('?')[0]])).rows[0].allowed).toBe(true);
  expect((await query('select public.admin_update_user_profile($1,$2,$3) as result', [member, 'Member', avatar])).rows[0].result.avatar).toBe(avatar);
  await expect(query('select public.admin_update_user_profile($1,$2,$3)', [other, 'Other', avatar])).rejects.toThrow();
  await query('select public.admin_update_user_profile($1,$2,$3)', [member, 'Member', '']);
  await query("update profiles set status='ACTIVE' where id=$1", [member]);
});

it('keeps old queued notifications from following a device to another account', async () => {
  await as(member); await query('select public.save_push_subscription($1)', [subscription]);
  const message = (await query("insert into direct_messages(sender_id,recipient_id,body) values($1,$2,'Private to member') returning id", [owner, member])).rows[0].id;
  await as(other); await query('select public.save_push_subscription($1)', [subscription]);
  expect((await query('select * from public.claim_push_delivery_jobs()')).rows).toEqual([]);
  await as(member); await query('select public.save_push_subscription($1)', [subscription]);
  await query('delete from direct_messages where id=$1', [message]);
});

it('registers devices for the authenticated member and rejects arbitrary URLs and invalid keys', async () => {
  await as(member);
  await query('select public.save_push_subscription($1)', [subscription]);
  await query('select public.save_push_subscription($1)', [subscription]);
  expect((await query('select user_id from push_subscriptions')).rows).toEqual([{ user_id: member }]);
  for (const endpoint of ['http://fcm.googleapis.com/test', 'https://127.0.0.1/test', 'https://fcm.googleapis.com.evil.test/x', 'https://user@fcm.googleapis.com/x']) {
    await expect(query('select public.save_push_subscription($1)', [{ ...subscription, endpoint }])).rejects.toThrow();
  }
  await expect(query('select public.save_push_subscription($1)', [{ ...subscription, keys: {} }])).rejects.toThrow();
  await query("update profiles set is_guest=true where id=$1", [member]);
  await expect(query('select public.save_push_subscription($1)', [subscription])).rejects.toThrow();
  await query("update profiles set is_guest=false where id=$1", [member]);
});

it('creates a targeted notification for owner messages and queues only the recipient device', async () => {
  await query('insert into direct_messages(sender_id,recipient_id,body) values($1,$2,$3)', [owner, member, 'Meeting soon']);
  await query('insert into direct_messages(sender_id,recipient_id,body) values($1,$2,$3)', [member, owner, 'Thanks']);
  const notices = (await query("select user_id,actor_id,body from notifications where type='DIRECT_MESSAGE'")).rows;
  expect(notices).toEqual([{ user_id: member, actor_id: owner, body: 'Meeting soon' }]);
  expect((await query('select count(*)::int as count from push_delivery_jobs')).rows[0].count).toBe(1);
});

it('announces available rooms exactly once, waits for scheduled rooms, and announces a restarted session', async () => {
  await query("insert into meetings(id,host_id,title,room_code,starts_at) values($1,$2,'Session','ABCD-1234',now()+interval '1 hour')", [room, owner]);
  expect((await query("select count(*)::int as count from notifications where type='MEETING_AVAILABLE'")).rows[0].count).toBe(0);
  await query("update meetings set starts_at=now()-interval '1 minute' where id=$1", [room]);
  await query('select public.announce_available_meetings()');
  expect((await query("select count(*)::int as count from notifications where type='MEETING_AVAILABLE' and user_id=$1", [member])).rows[0].count).toBe(1);
  await query("update meetings set status='ENDED' where id=$1", [room]);
  await query("update meetings set status='ACTIVE',starts_at=now() where id=$1", [room]);
  expect((await query("select count(*)::int as count from notifications where type='MEETING_AVAILABLE' and user_id=$1", [member])).rows[0].count).toBe(2);
});

it('leases jobs once and excludes suspended recipients and read notifications', async () => {
  const first = await query('select * from public.claim_push_delivery_jobs()');
  expect(first.rows.length).toBeGreaterThan(0);
  expect((await query('select * from public.claim_push_delivery_jobs()')).rows).toEqual([]);
  await query("update push_delivery_jobs set leased_until=now()-interval '1 second'");
  await query("update profiles set status='SUSPENDED' where id=$1", [member]);
  expect((await query('select * from public.claim_push_delivery_jobs()')).rows).toEqual([]);
  await query("update profiles set status='ACTIVE' where id=$1", [member]);
  await query('update notifications set read_at=now()');
  expect((await query('select * from public.claim_push_delivery_jobs()')).rows).toEqual([]);
});

it('removes only the current user device and restricts worker operations to service_role', async () => {
  await as(other);
  await query('select public.remove_push_subscription($1)', [subscription.endpoint]);
  expect((await query('select count(*)::int as count from push_subscriptions')).rows[0].count).toBe(1);
  await as(member);
  await query('select public.remove_push_subscription($1)', [subscription.endpoint]);
  expect((await query('select count(*)::int as count from push_subscriptions')).rows[0].count).toBe(0);
  expect((await query("select has_function_privilege('authenticated','public.claim_push_delivery_jobs()','EXECUTE') as allowed")).rows[0].allowed).toBe(false);
  expect((await query("select has_function_privilege('service_role','public.claim_push_delivery_jobs()','EXECUTE') as allowed")).rows[0].allowed).toBe(true);
});

it('keeps direct message previews within the existing retention and read receipts', async () => {
  const message = (await query("insert into direct_messages(sender_id,recipient_id,body) values($1,$2,'Temporary') returning id", [owner, member])).rows[0].id;
  await query('update direct_messages set read_at=now() where id=$1', [message]);
  expect((await query("select read_at is not null as read from notifications where resource_id=$1", [message])).rows[0].read).toBe(true);
  await query('delete from direct_messages where id=$1', [message]);
  expect((await query('select count(*)::int as count from notifications where resource_id=$1', [message])).rows[0].count).toBe(0);
});
