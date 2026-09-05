const APPS_SCRIPT_MAIL_URL = 'https://script.google.com/macros/s/AKfycbx4KKDbcz1iYk8kbBoI7fEiXG48SlTnI6Q-_XrIq4ROoH0MOvlipcqWEm-hTcASNeF1/exec';
import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (name: string) => { const value = Deno.env.get(name); if (!value) throw new Error('Configuración del servidor incompleta.'); return value; };
Deno.serve(async (request) => {
  const origin = request.headers.get('origin') || '';
  const allowed = (Deno.env.get('APP_ALLOWED_ORIGINS') || '').split(',').map(value => value.trim());
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0] || '', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' };
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (request.method === 'OPTIONS') return respond({});
  if (request.method !== 'POST') return respond({ error: 'Método inválido.' }, 405);
  try {
    const body = await request.json();
    const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
    if (body.action === 'inspect' || body.action === 'register') {
      if (!/^[a-f0-9]{64}$/.test(body.token || '')) return respond({ error: 'Invitación inválida o vencida.' }, 400);
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.token)))).map(byte => byte.toString(16).padStart(2, '0')).join('');
      const { data: invitation, error } = await admin.from('registration_invitations').select('email,plan_code,expires_at').eq('token_hash', hash).is('consumed_at', null).is('revoked_at', null).gt('expires_at', new Date().toISOString()).maybeSingle();
      if (error || !invitation) return respond({ error: 'Invitación inválida, utilizada o vencida. Solicita una nueva.' }, 400);
      if (body.action === 'inspect') return respond(invitation);
      const name = String(body.name || '').trim(); const username = String(body.username || '').trim().toLowerCase();
      if (name.length < 2 || name.length > 100 || !/^[a-z0-9_]{3,32}$/.test(username) || typeof body.password !== 'string' || body.password.length < 10 || body.password.length > 128) return respond({ error: 'Revisa nombre, usuario (3–32 letras, números o _) y contraseña (10–128 caracteres).' }, 400);
      const { error: createError } = await admin.auth.admin.createUser({ email: invitation.email, password: body.password, email_confirm: true, user_metadata: { name, username }, app_metadata: { registration_token: body.token } });
      if (createError) return respond({ error: 'No se pudo registrar. La invitación puede haber vencido o el correo ya tiene cuenta.' }, 400);
      return respond({ email: invitation.email });
    }
    const client = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: request.headers.get('authorization') || '' } }, auth: { persistSession: false } });
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) return respond({ error: 'Inicia sesión.' }, 401);
    const { data: current, error: profileError } = await client.rpc('get_current_user');
    if (profileError || current?.role !== 'ADMIN' || current?.status !== 'ACTIVE') return respond({ error: 'Acceso restringido.' }, 403);
    if (body.action === 'invite') {
      const mailUrl = new URL(APPS_SCRIPT_MAIL_URL); const key = env('APPS_SCRIPT_MAIL_KEY');
      if (mailUrl.protocol !== 'https:' || mailUrl.hostname !== 'script.google.com' || key.length < 32) throw new Error('Configuración de correo inválida.');
      const link = new URL(env('APP_REGISTRATION_URL'));
      const { data, error } = await client.rpc('create_registration_invitation', { p_email: body.email, p_plan_code: body.planCode, p_referrer_id: body.referrerId || null });
      if (error) return respond({ error: error.message }, 400);
      link.hash = new URLSearchParams({ registration: data.token }).toString();
      try {
        const response = await fetch(mailUrl, { method: 'POST', body: JSON.stringify({ action: 'registration_invitation', key, email: data.email, link: link.href, expiresAt: data.expiresAt, planName: data.planName }), signal: AbortSignal.timeout(20000) });
        const result = await response.json();
        if (!response.ok || result.ok !== true) throw new Error('Mail failed');
      } catch {
        await admin.from('registration_invitations').update({ revoked_at: new Date().toISOString() }).eq('id', data.id).is('consumed_at', null);
        return respond({ error: 'No se confirmó el envío. La invitación fue anulada; revisa Apps Script y vuelve a enviarla.' }, 502);
      }
      return respond({ expiresAt: data.expiresAt });
    }
    if (body.action === 'delete') {
      const { data: target, error } = await admin.from('profiles').select('id,role').eq('id', body.userId).single();
      if (error || !target || target.role === 'ADMIN' || target.id === auth.user.id) return respond({ error: 'No puedes eliminar esta cuenta.' }, 400);
      // Delete physical storage through the Storage API before deleting Auth.
      const { error: storageError } = await admin.storage.from('profile-avatars').remove([`${target.id}/profile`]);
      if (storageError) return respond({ error: 'No se pudo eliminar la foto. Reintenta la eliminación.' }, 502);
      const { error: deleteError } = await client.rpc('delete_registered_user', { p_user_id: target.id });
      if (deleteError) return respond({ error: 'No se pudo eliminar la cuenta y sus datos. Reintenta.' }, 400);
      return respond({ deleted: true });
    }
    return respond({ error: 'Acción inválida.' }, 400);
  } catch { return respond({ error: 'No se pudo completar la solicitud. Revisa la configuración del servidor.' }, 500); }
});
