import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { timingSafeEqual } from 'node:crypto';
import { telegramApi } from '../_shared/telegram.ts';
import { handleCommunityUpdate, relevantTelegramUpdate } from './handler.js';
const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const expected = new TextEncoder().encode(Deno.env.get('TELEGRAM_WEBHOOK_SECRET') || '');
  const actual = new TextEncoder().encode(request.headers.get('x-telegram-bot-api-secret-token') || '');
  if (!expected.length || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return json({ error: 'Unauthorized' }, 401);
  try {
    if (Number(request.headers.get('content-length')) > 65_536) return json({ error: 'Too large' }, 413);
    const raw = await request.text(); if (raw.length > 65_536) return json({ error: 'Too large' }, 413);
    const update = JSON.parse(raw);
    // Group conversations never hit the database or store message contents.
    if (!relevantTelegramUpdate(update)) return json({ ok: true });
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: config, error } = await client.from('telegram_community_config').select('enabled,chat_id,started_at').eq('id', true).single();
    if (error) throw new Error('Configuration unavailable');
    const rpc = async (name: string, args: object) => { const { data, error } = await client.rpc(name, args); if (error) throw new Error('Community state unavailable'); return data; };
    await handleCommunityUpdate(update, { config, rpc, telegram: telegramApi });
    return json({ ok: true });
  } catch {
    console.error('Telegram community update pending retry.');
    return json({ error: 'Temporarily unavailable' }, 503);
  }
});
