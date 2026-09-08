import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, expect, it } from 'vitest';

let db;
beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create extension pgcrypto; create schema auth;
    create role anon; create role authenticated; create role service_role;
    create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
    create table public.profiles(id uuid primary key,role text,status text);
    create table public.meeting_participants(meeting_id uuid,user_id uuid,status text);
    create function public.touch_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;
    create function public.has_active_membership(uuid) returns boolean language sql stable as $$select true$$;
    create function public.is_current_session_valid() returns boolean language sql stable as $$select true$$;
    create function public.require_active_membership() returns uuid language sql stable as $$select '00000000-0000-4000-8000-000000000001'::uuid$$;
    create function public.require_admin() returns uuid language sql stable as $$select '00000000-0000-4000-8000-000000000001'::uuid$$;
    create publication supabase_realtime;
  `);
  const migration = readFileSync(new URL('../supabase/migrations/202609070001_galaxy_macro_live.sql', import.meta.url), 'utf8');
  await db.exec(migration);
}, 30000);

afterAll(async () => db?.close());

it('applies the complete macro migration and seeds all six engines', async () => {
  const result = await db.query('select count(distinct engine)::int engines,count(*)::int components from public.macro_engine_config');
  expect(result.rows[0]).toEqual({ engines: 6, components: 19 });
});
