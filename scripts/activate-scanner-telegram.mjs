import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const project = 'xdsqtuubsptpzwadecha';
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const cli = process.env.SUPABASE_CLI || (process.platform === 'win32' ? join(process.env.LOCALAPPDATA || '', 'GALAXY-Tools', 'supabase', 'supabase.exe') : 'supabase');

export async function activateScannerTelegram({ enable = false, tokenFile = resolve(root, '../.tools/telegram-bot-token.txt'), chatId, request = fetch, execute = promisify(execFile), log = console.log } = {}) {
  const token = (await readFile(tokenFile, 'utf8').catch(() => '')).trim();
  if (!/^\d+:[A-Za-z0-9_-]{25,}$/.test(token)) throw new Error('Falta un token válido en el archivo privado de Telegram. Crea el bot con @BotFather; no guardes el token en el repositorio.');
  const api = async (method, body = {}) => {
    try {
      const response = await request(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(15_000) });
      const data = await response.json(); if (!response.ok || !data.ok) throw new Error(); return data.result;
    } catch { throw new Error(`No se pudo validar Telegram (${method}). Revisa el bot y sus permisos. No se activó el envío.`); }
  };
  const bot = await api('getMe');
  if (!bot.is_bot) throw new Error('La credencial no pertenece a un bot.');
  if (!chatId) {
    const updates = await api('getUpdates', { timeout: 0, limit: 100 });
    const groups = new Map();
    for (const update of updates) {
      const chat = update.my_chat_member?.chat || update.message?.chat || update.channel_post?.chat;
      if (chat && ['group', 'supergroup', 'channel'].includes(chat.type)) groups.set(String(chat.id), chat);
    }
    if (groups.size !== 1) throw new Error(groups.size ? 'Se encontraron varios grupos. Ejecuta con --chat-id y el ID del destino elegido.' : `Añade @${bot.username} al grupo y envía /start@${bot.username} allí; después repite la activación.`);
    chatId = groups.keys().next().value;
  }
  const chat = await api('getChat', { chat_id: chatId });
  if (!['group', 'supergroup', 'channel'].includes(chat.type)) throw new Error('El destino debe ser tu grupo o canal, no un chat privado.');
  const member = await api('getChatMember', { chat_id: chat.id, user_id: bot.id });
  const admin = ['administrator', 'creator'].includes(member.status);
  if (['left', 'kicked'].includes(member.status) || (chat.type === 'channel' && (!admin || member.can_post_messages === false))
    || (!admin && (member.status === 'restricted' ? member.can_send_messages === false : chat.permissions?.can_send_messages === false))) throw new Error('El bot necesita permiso para publicar en ese destino.');
  const temporary = await mkdtemp(join(tmpdir(), 'galaxy-telegram-'));
  const files = [];
  const call = async (args) => {
    try { return await execute(cli, [...args, `--remote=${project}`, '--yes', '--output', 'json'], { cwd: root, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }); }
    catch { throw new Error(`No se completó ${args.slice(0, 2).join(' ')} en Supabase. El token no se muestra en registros.`); }
  };
  const privateFile = async (name, content) => { const path = join(temporary, name); files.push(path); await writeFile(path, content, { mode: 0o600 }); return path; };
  try {
    log(`Destino validado: ${chat.title} · bot @${bot.username}. No se envían mensajes de prueba.`);
    await call(['db', 'query', '--file', resolve(root, 'supabase/migrations/20261119120000_scanner_telegram.sql')]);
    await call(['db', 'query', '--file', resolve(root, 'supabase/migrations/20261119150000_telegram_private_membership.sql')]);
    await call(['db', 'query', '--file', resolve(root, 'supabase/migrations/20261119180000_telegram_resume_flow.sql')]);
    await call(['db', 'query', '--file', resolve(root, 'supabase/migrations/20261119193000_telegram_scheduled_photo.sql')]);
    await call(['db', 'query', '--file', resolve(root, 'supabase/migrations/20261119210000_range777_strategy.sql')]);
    const secret = randomBytes(32).toString('base64url');
    await call(['secrets', 'set', '--env-file', await privateFile('telegram.env', `TELEGRAM_BOT_TOKEN=${token}\nTELEGRAM_CHAT_ID=${chat.id}\nTELEGRAM_DISPATCH_SECRET=${secret}\n`)]);
    await call(['functions', 'deploy', 'scanner-telegram', '--use-api', '--no-verify-jwt']);
    const values = { galaxy_telegram_dispatch_url: `https://${project}.supabase.co/functions/v1/scanner-telegram`, galaxy_telegram_dispatch_secret: secret };
    const sql = `begin;\n${Object.entries(values).map(([name, value]) => `do $vault$ declare v_id uuid; begin
      select id into v_id from vault.secrets where name=${literal(name)} limit 1;
      if v_id is null then perform vault.create_secret(${literal(value)},${literal(name)});
      else perform vault.update_secret(v_id,${literal(value)},${literal(name)}); end if; end $vault$;`).join('\n')}
      ${enable ? "update public.scanner_telegram_settings set enabled=true,activated_at=coalesce(activated_at,now()),dispatch_until='-infinity' where id;" : ''}\ncommit;`;
    await call(['db', 'query', '--file', await privateFile('configure.sql', sql)]);
    log(enable ? 'Telegram activado para eventos nuevos y reportes. No se reenvía el historial anterior.' : 'Preparado. Ejecuta con --enable para activar los mensajes automáticos.');
  } finally {
    if (resolve(temporary).startsWith(resolve(tmpdir()) + sep)) {
      for (const file of files) await unlink(file).catch(() => {});
      await rmdir(temporary).catch(() => {});
    }
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const arg = (name) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
  try { await activateScannerTelegram({ enable: process.argv.includes('--enable'), tokenFile: arg('--token-file'), chatId: arg('--chat-id') }); }
  catch (error) { console.error(error instanceof Error ? error.message : 'No se pudo activar Telegram.'); process.exitCode = 1; }
}
