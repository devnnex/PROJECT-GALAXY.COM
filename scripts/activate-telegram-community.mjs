import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const root = resolve(fileURLToPath(new URL('..', import.meta.url))), project = 'xdsqtuubsptpzwadecha';
const cli = process.env.SUPABASE_CLI || (process.platform === 'win32' ? join(process.env.LOCALAPPDATA || '', 'GALAXY-Tools/supabase/supabase.exe') : 'supabase');
const execute = promisify(execFile);
const token = (await readFile(resolve(root, '../.tools/telegram-bot-token.txt'), 'utf8')).trim();
const chatId = process.argv[process.argv.indexOf('--chat-id') + 1];
if (!process.argv.includes('--chat-id') || !/^-\d+$/.test(chatId)) throw new Error('Indica el ID del grupo privado con --chat-id.');
const api = async (method, body = {}) => {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(15_000) });
    const data = await response.json(); if (!response.ok || !data.ok) throw new Error(); return data.result;
  } catch { throw new Error(`Telegram no completó ${method}. No se muestran credenciales.`); }
};
const temporary = await mkdtemp(join(tmpdir(), 'galaxy-community-')), files = [];
const call = async (args) => {
  try { return await execute(cli, [...args, `--remote=${project}`, '--yes', '--output', 'json'], { cwd: root, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }); }
  catch { throw new Error(`No se completó ${args.slice(0, 2).join(' ')} en Supabase.`); }
};
const privateFile = async (name, contents) => { const path = join(temporary, name); files.push(path); await writeFile(path, contents, { mode: 0o600 }); return path; };
try {
  const bot = await api('getMe'), chat = await api('getChat', { chat_id: chatId });
  const rights = await api('getChatMember', { chat_id: chatId, user_id: bot.id });
  if (!['group', 'supergroup'].includes(chat.type) || chat.username) throw new Error('El destino debe ser el grupo privado, sin nombre público.');
  if (rights.status !== 'administrator' || !rights.can_invite_users || !rights.can_restrict_members || !chat.permissions) throw new Error('Faltan permisos de invitación/moderación o no se pudieron leer los permisos actuales.');
  console.log('Grupo privado y permisos validados. Se conservan los miembros y las conversaciones existentes.');
  await call(['db', 'query', '--file', resolve(root, 'supabase/migrations/20261119150000_telegram_private_membership.sql')]);
  await call(['db', 'query', '--file', resolve(root, 'supabase/migrations/20261119180000_telegram_resume_flow.sql')]);
  await call(['db', 'query', '--file', resolve(root, 'supabase/migrations/20261119193000_telegram_scheduled_photo.sql')]);
  const secret = randomBytes(32).toString('hex');
  await call(['secrets', 'set', '--env-file', await privateFile('community.env', `TELEGRAM_WEBHOOK_SECRET=${secret}\n`)]);
  for (const name of ['scanner-telegram', 'telegram-access', 'telegram-community']) await call(['functions', 'deploy', name, '--use-api', '--no-verify-jwt']);
  await api('setChatPermissions', { chat_id: chatId, permissions: { ...chat.permissions, can_invite_users: false, can_change_info: false }, use_independent_chat_permissions: true });
  const config = `update public.telegram_community_config set enabled=true,chat_id=${chatId},bot_username='${bot.username}',started_at=coalesce(started_at,now()) where id;`;
  await call(['db', 'query', '--file', await privateFile('enable.sql', config)]);
  await api('setWebhook', { url: `https://${project}.supabase.co/functions/v1/telegram-community`, secret_token: secret, max_connections: 4, allowed_updates: ['message', 'chat_member', 'chat_join_request'], drop_pending_updates: false });
  const webhook = await api('getWebhookInfo');
  if (!webhook.url.endsWith('/telegram-community')) throw new Error('No se pudo confirmar el webhook privado.');
  console.log('Bienvenida y registro privado activados. Los miembros no administradores ya no pueden invitar directamente. No se enviaron mensajes de prueba.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'No se pudo activar la comunidad.'); process.exitCode = 1;
} finally {
  if (resolve(temporary).startsWith(resolve(tmpdir()) + sep)) { for (const file of files) await unlink(file).catch(() => {}); await rmdir(temporary).catch(() => {}); }
}
