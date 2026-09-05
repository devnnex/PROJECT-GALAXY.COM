import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { beforeAll, afterAll, expect, it } from 'vitest';

let db;
const owner = '00000000-0000-4000-8000-000000000001';
const referrer = '00000000-0000-4000-8000-000000000002';
const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0];
beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`create extension pgcrypto; create schema auth;
    create role anon; create role authenticated; create role service_role;
    create table auth.users(id uuid primary key default gen_random_uuid(), email text unique, raw_app_meta_data jsonb default '{}');
    create table public.profiles(id uuid primary key references auth.users on delete cascade, name text, status text default 'ACTIVE',role text default 'USER');
    create table public.wallets(user_id uuid primary key references public.profiles on delete cascade, available_balance numeric default 0,total_earned numeric default 0,total_spent numeric default 0);
    create table public.membership_plans(code text primary key,name text,price_usd numeric,duration_months integer,active boolean default true);
    create table public.memberships(user_id uuid primary key references public.profiles on delete cascade,plan_code text,status text,starts_at timestamptz,expires_at timestamptz);
    create table public.calendar_events(created_by uuid references public.profiles);
    create table public.meeting_messages(sender_id uuid references public.profiles);
    create table public.meetings(host_id uuid references public.profiles);
    create function public.require_user() returns uuid language sql as $$select current_setting('test.user_id')::uuid$$;
    create function public.require_admin() returns uuid language plpgsql as $$begin if public.require_user()<>'${owner}'::uuid then raise exception 'Forbidden'; end if; return public.require_user(); end$$;
    create function public.get_current_user() returns jsonb language sql as $$select jsonb_build_object('wallet',to_jsonb(w)) from public.wallets w where user_id=public.require_user()$$;
    create function public.test_profile() returns trigger language plpgsql as $$begin insert into public.profiles(id,name) values(new.id,new.email); insert into public.wallets(user_id) values(new.id); return new; end$$;
    create trigger on_auth_user_created after insert on auth.users for each row execute function public.test_profile();
    insert into auth.users(id,email) values('${owner}','elkin56ty@gmail.com'),('${referrer}','referrer@example.com');
    update public.profiles set role='ADMIN' where id='${owner}';
    insert into public.membership_plans values('MONTHLY','Monthly',80,1,true);
    set test.user_id='${owner}';`);
  const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  const marker = '-- Migration: invitation-only registration and membership ledger.';
  expect(schema).toContain(marker);
  await db.exec('begin;\n' + schema.slice(schema.indexOf(marker)));
}, 30000);
afterAll(async () => { await db?.close(); });
const invite = async (email, refer = null) => (await scalar('select public.create_registration_invitation($1,$2,$3) result', [email, 'MONTHLY', refer])).result;
const register = (email, token) => scalar('insert into auth.users(email,raw_app_meta_data) values($1,$2) returning id', [email, JSON.stringify({ registration_token: token })]);

it('blocks public signup and forged/wrong-email invitations atomically', async () => {
  await expect(register('public@example.com', '')).rejects.toThrow('invitación');
  const i = await invite('invited@example.com');
  await expect(register('wrong@example.com', i.token)).rejects.toThrow('invitación');
  expect((await scalar('select count(*)::int n from public.profiles')).n).toBe(2);
});
it('expires invitations after seven minutes and revokes replaced links', async () => {
  const i = await invite('expired@example.com');
  expect((await scalar('select extract(epoch from expires_at-created_at)::int seconds from public.registration_invitations where id=$1',[i.id])).seconds).toBe(420);
  await db.query("update public.registration_invitations set expires_at=now()-interval '1 second' where id=$1",[i.id]);
  await expect(register('expired@example.com',i.token)).rejects.toThrow('invitación');
  const old = await invite('replaced@example.com'); await invite('replaced@example.com');
  await expect(register('replaced@example.com',old.token)).rejects.toThrow('invitación');
});
it('credits 100% once, activates the selected membership and rejects replay', async () => {
  const i = await invite('solo@example.com'); const user = await register('solo@example.com',i.token);
  expect(Number((await scalar('select available_balance from public.wallets where user_id=$1',[owner])).available_balance)).toBe(80);
  expect((await scalar('select plan_code from public.memberships where user_id=$1',[user.id])).plan_code).toBe('MONTHLY');
  await expect(register('solo@example.com',i.token)).rejects.toThrow();
  expect((await scalar('select count(*)::int n from public.membership_ledger')).n).toBe(2);
});
it('splits 90/10 using the invitation price and isolates wallet history', async () => {
  const i = await invite('referred@example.com',referrer);
  await db.exec("update public.membership_plans set price_usd=999 where code='MONTHLY'");
  await register('referred@example.com',i.token);
  expect(Number((await scalar('select available_balance from public.wallets where user_id=$1',[owner])).available_balance)).toBe(152);
  expect(Number((await scalar('select available_balance from public.wallets where user_id=$1',[referrer])).available_balance)).toBe(8);
  await db.exec(`set test.user_id='${referrer}'`);
  const activity = (await scalar('select public.get_wallet_activity() result')).result;
  expect(activity.entries).toHaveLength(1); expect(activity.entries[0].kind).toBe('REFERRAL_COMMISSION');
  await expect(invite('forbidden@example.com')).rejects.toThrow('Forbidden');
  await db.exec(`set test.user_id='${owner}'`);
});
it('protects admins and deletes the account while preserving anonymized beneficiary balances', async () => {
  await expect(db.query('select public.delete_registered_user($1)',[owner])).rejects.toThrow('administradora');
  const user = await scalar("select id from auth.users where email='referred@example.com'");
  await db.query('select public.delete_registered_user($1)',[user.id]);
  expect((await scalar('select count(*)::int n from public.profiles where id=$1',[user.id])).n).toBe(0);
  expect((await scalar('select count(*)::int n from public.memberships where user_id=$1',[user.id])).n).toBe(0);
  expect(Number((await scalar('select available_balance from public.wallets where user_id=$1',[referrer])).available_balance)).toBe(8);
  expect((await scalar("select count(*)::int n from public.membership_ledger where member_id is null")).n).toBe(2);
});
