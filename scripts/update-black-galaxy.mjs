// Updates an already configured scanner without rotating secrets or enabling a
// disabled stream. SQL backfills shared summaries from existing real trades.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const project = 'xdsqtuubsptpzwadecha';
const cli = process.env.SUPABASE_CLI || (process.platform === 'win32' ? join(process.env.LOCALAPPDATA || '', 'GALAXY-Tools', 'supabase', 'supabase.exe') : 'supabase');
export async function updateBlackGalaxy({ execute = promisify(execFile), log = console.log } = {}) {
  const call = async (args) => {
    try { return await execute(cli, [...args, `--remote=${project}`, '--yes', '--output', 'json'], { cwd: root, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }); }
    catch { throw new Error(`No se completó ${args.slice(0, 2).join(' ')}. Revisa el acceso a Supabase. No publiques el frontend hasta completar la actualización.`); }
  };
  log('1/3 Preparando estadísticas y entrega rápida a partir del historial existente…');
  await call(['db', 'query', '--file', resolve(root, 'supabase/migrations/20261118010000_scanner_speed_and_analytics.sql')]);
  log('2/3 Actualizando el muestreo con caché del proveedor…');
  await call(['functions', 'deploy', 'scanner-signals', '--use-api', '--no-verify-jwt']);
  log('3/3 Actualizando la entrega de avisos…');
  await call(['functions', 'deploy', 'push-notifications', '--use-api', '--no-verify-jwt']);
  log('Servidor actualizado. Puedes publicar el frontend con el workflow de GitHub Pages existente.');
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { await updateBlackGalaxy(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
