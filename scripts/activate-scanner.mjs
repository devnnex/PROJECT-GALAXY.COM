import { randomBytes } from 'node:crypto';
import { mkdtemp, writeFile, unlink, rmdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const projectRef = 'xdsqtuubsptpzwadecha';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const cli = process.env.SUPABASE_CLI || (process.platform === 'win32' ? join(process.env.LOCALAPPDATA || '', 'GALAXY-Tools', 'supabase', 'supabase.exe') : 'supabase');

// All credentials stay out of process arguments and logs. CLI authentication
// uses its normal OS keyring; private one-use files are removed in finally.
export async function activateScanner({ enable = false, request = fetch, log = console.log, execute = run } = {}) {
  const temporary = await mkdtemp(join(tmpdir(), 'galaxy-scanner-activation-'));
  const privateFiles = [];
  const call = async (args) => {
    try { return await execute(cli, [...args, `--remote=${projectRef}`, '--yes', '--output', 'json'], { cwd: root, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }); }
    catch { throw new Error(`No se completó el paso ${args.slice(0, 2).join(' ')}. Revisa la sesión de Supabase para el proyecto Galaxy.`); }
  };
  const privateSql = async (name, sql) => {
    const path = join(temporary, name); privateFiles.push(path);
    await writeFile(path, sql, { mode: 0o600 });
    return call(['db', 'query', '--file', path]);
  };
  try {
    log('1/5 Instalando el registro privado, los permisos y la programación del scanner...');
    await call(['db', 'query', '--file', resolve(root, 'supabase/migrations/20261113010000_server_scanner_signals.sql')]);
    const dispatchSecret = randomBytes(32).toString('base64url');
    const envFile = join(temporary, 'scanner.env'); privateFiles.push(envFile);
    await writeFile(envFile, `SCANNER_DISPATCH_SECRET=${dispatchSecret}\n`, { mode: 0o600 });
    log('2/5 Configurando el acceso exclusivo del servidor...');
    await call(['secrets', 'set', '--env-file', envFile]);
    log('3/5 Desplegando únicamente scanner-signals...');
    await call(['functions', 'deploy', 'scanner-signals', '--use-api', '--no-verify-jwt']);
    const url = `https://${projectRef}.supabase.co/functions/v1/scanner-signals`;
    const entries = { galaxy_scanner_dispatch_secret: dispatchSecret, galaxy_scanner_dispatch_url: url };
    await privateSql('vault.sql', `begin;\n${Object.entries(entries).map(([name, value]) => `do $vault$ declare v_id uuid; begin
      select id into v_id from vault.secrets where name=${literal(name)} limit 1;
      if v_id is null then perform vault.create_secret(${literal(value)},${literal(name)});
      else perform vault.update_secret(v_id,${literal(value)},${literal(name)}); end if; end $vault$;`).join('\n')}\ncommit;`);
    log('4/5 Comprobando precios reales desde Supabase, sin enviar notificaciones de prueba...');
    const response = await request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-galaxy-scanner-secret': dispatchSecret },
      body: JSON.stringify({ action: 'check-provider' }), signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error('El servidor quedó preparado, pero el proveedor no respondió con precios frescos. No se habilitaron nuevas señales.');
    const value = await response.json();
    if (!Number.isFinite(value?.quote?.price)) throw new Error('El proveedor no devolvió un precio válido.');
    log(`Fuente validada: XAUUSD, actualización ${new Date(value.quote.at).toISOString()}.`);
    if (enable) {
      log('5/5 Activando XAUUSD · 5m y el registro desde este momento...');
      await privateSql('enable.sql', `update public.scanner_streams set enabled=true,provider='gold-api',tracking_started_at=coalesce(tracking_started_at,now()),next_poll_at=now() where id='xauusd-5m';`);
      // The initial OHLC load is bounded to ten free calls and checkpointed.
      const first = await request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-galaxy-scanner-secret': dispatchSecret }, body: '{}', signal: AbortSignal.timeout(120_000) });
      if (!first.ok) throw new Error('La activación requiere revisar el estado del proveedor: el primer cálculo no pudo terminar. El historial parcial y su cuota se conservan.');
      const result = await first.json();
      log(`Scanner activado. Estado del primer cálculo: ${result.status}.`);
    } else log('5/5 Preparación verificada. El scanner permanece sin activar hasta ejecutar con --enable.');
  } finally {
    if (resolve(temporary).startsWith(resolve(tmpdir()) + sep)) {
      for (const file of privateFiles) await unlink(file).catch(() => {});
      await rmdir(temporary).catch(() => {});
    }
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { await activateScanner({ enable: process.argv.includes('--enable') }); }
  catch (error) { console.error(error instanceof Error ? error.message : 'No se pudo preparar el scanner.'); process.exitCode = 1; }
}
