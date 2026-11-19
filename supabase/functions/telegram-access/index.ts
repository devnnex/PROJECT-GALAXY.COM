import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { telegramApi } from '../_shared/telegram.ts';
function headers(request: Request) {
  const allowed = (Deno.env.get('APP_ALLOWED_ORIGINS') || 'https://devnnex.github.io,http://localhost:5173').split(',').map((s) => s.trim());
  const origin = request.headers.get('origin') || '';
  return { 'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0], 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin', 'Content-Type': 'application/json' };
}
Deno.serve(async (request) => {
  const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: headers(request) });
  if (request.method === 'OPTIONS') return new Response('ok', { headers: headers(request) });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const authorization = request.headers.get('authorization') || '';
    if (!authorization.startsWith('Bearer ')) return json({ error: 'Inicia sesión para vincular tu cuenta.' }, 401);
    const url = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: identity, error: authError } = await userClient.auth.getUser(authorization.slice(7));
    if (authError || !identity.user) return json({ error: 'Vuelve a la pestaña o app donde iniciaste sesión en Galaxy, o inicia sesión aquí con la misma cuenta para continuar.' }, 401);
    const input = await request.json();
    const action = input?.action || 'status';
    if (!['begin', 'status', 'confirm', 'restart'].includes(action)) return json({ error: 'Solicitud inválida.' }, 400);
    if (action === 'restart') { const { error } = await userClient.rpc('reset_telegram_proposal'); if (error) return json({ error: 'No fue posible preparar tu acceso.' }, 403); }
    const method = action === 'confirm' ? 'confirm_telegram_access' : action === 'begin' || action === 'restart' ? 'begin_telegram_access' : 'get_telegram_access';
    const { data: state, error: accessError } = await userClient.rpc(method);
    if (accessError) return json({ error: 'Necesitas una cuenta Galaxy activa. Abre el bot desde este panel antes de confirmar.' }, 403);
    if (state.state !== 'LINKED' || action === 'status') return json(state);
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: claim, error } = await admin.rpc('claim_telegram_invite', { p_user: identity.user.id });
    if (error) throw new Error('Invite unavailable');
    if (claim.busy) return json({ ...state, preparing: true });
    if (claim.inviteUrl) return json({ ...state, ...claim });
    const expires = Math.floor(Date.now() / 1000) + 600;
    const invitation = await telegramApi('createChatInviteLink', { chat_id: claim.chatId, name: `Galaxy ${identity.user.id.slice(0, 8)}`, expire_date: expires, creates_join_request: true });
    const { data: saved, error: saveError } = await admin.rpc('complete_telegram_invite', { p_user: identity.user.id, p_lease: claim.lease, p_link: invitation.invite_link, p_expires: new Date(expires * 1000).toISOString() });
    if (saveError || !saved) { await telegramApi('revokeChatInviteLink', { chat_id: claim.chatId, invite_link: invitation.invite_link }).catch(() => {}); throw new Error('Invite not retained'); }
    return json({ ...state, inviteUrl: invitation.invite_link, expiresAt: new Date(expires * 1000).toISOString() });
  } catch { return json({ error: 'No pudimos preparar tu acceso a Telegram. Intenta de nuevo.' }, 503); }
});
