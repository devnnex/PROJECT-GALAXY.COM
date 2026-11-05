import { createECDH, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = 'xdsqtuubsptpzwadecha';
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;

export async function activateWebPush({ token, projectRef = PROJECT, request = fetch, log = console.log }) {
  if (!token?.trim() || !/^[a-z]{20}$/.test(projectRef)) throw new Error('Falta un Access Token de Supabase o el proyecto no es valido.');
  const base = `https://api.supabase.com/v1/projects/${projectRef}`;
  const call = async (path, body, multipart = false) => {
    const response = await request(base + path, {
      method: 'POST', headers: { Authorization: `Bearer ${token.trim()}`, ...(multipart ? {} : { 'Content-Type': 'application/json' }) },
      body: multipart ? body : JSON.stringify(body), signal: AbortSignal.timeout(120_000),
    });
    // Responses may include SQL or credentials. Never echo administrative payloads.
    if (!response.ok) throw new Error(`Supabase rechazo el paso ${path.split('?')[0]} (HTTP ${response.status}). Revisa el acceso al proyecto y vuelve a ejecutar.`);
    return response.status === 204 ? null : response.json();
  };
  const sql = (query) => call('/database/query', { query });
  log('1/4 Aplicando permisos de perfiles y cola de notificaciones...');
  const migration = await readFile(new URL('../supabase/migrations/20261105100000_admin_profiles_and_push.sql', import.meta.url), 'utf8');
  await sql(`create extension if not exists pg_cron;\n${migration}`);
  const rows = await sql(`select (select jsonb_object_agg(name,decrypted_secret) from vault.decrypted_secrets where name in ('galaxy_vapid_public_key','galaxy_vapid_private_key','galaxy_push_dispatch_secret')) as existing_push_config,
    coalesce((select value->>'publicKey' from public.app_settings where key='web_push'),'') as configured_public_key;`);
  const existing = rows?.[0]?.existing_push_config || {};
  let publicKey = existing.galaxy_vapid_public_key; let privateKey = existing.galaxy_vapid_private_key;
  if (Boolean(publicKey) !== Boolean(privateKey) || (!publicKey && rows?.[0]?.configured_public_key)) throw new Error('Ya existe una configuracion VAPID incompleta. No se rotaron las claves de los dispositivos existentes.');
  if (!publicKey) {
    const curve = createECDH('prime256v1'); curve.generateKeys();
    publicKey = curve.getPublicKey().toString('base64url');
    privateKey = Buffer.concat([Buffer.alloc(32 - curve.getPrivateKey().length), curve.getPrivateKey()]).toString('base64url');
  }
  const dispatchSecret = existing.galaxy_push_dispatch_secret || randomBytes(32).toString('base64url');
  log('2/4 Guardando claves privadas en el servidor...');
  await call('/secrets', [
    { name: 'VAPID_PUBLIC_KEY', value: publicKey }, { name: 'VAPID_PRIVATE_KEY', value: privateKey }, { name: 'PUSH_DISPATCH_SECRET', value: dispatchSecret },
  ]);
  log('3/4 Desplegando el servicio de envio cifrado...');
  const form = new FormData();
  form.set('metadata', JSON.stringify({ name: 'push-notifications', entrypoint_path: 'index.ts', verify_jwt: false }));
  for (const name of ['index.ts', 'delivery.js']) {
    const source = await readFile(new URL(`../supabase/functions/push-notifications/${name}`, import.meta.url), 'utf8');
    form.append('file', new Blob([source], { type: 'application/typescript' }), name);
  }
  await call('/functions/deploy?slug=push-notifications', form, true);
  const dispatchUrl = `https://${projectRef}.supabase.co/functions/v1/push-notifications`;
  const vaultEntries = { galaxy_vapid_public_key: publicKey, galaxy_vapid_private_key: privateKey, galaxy_push_dispatch_secret: dispatchSecret, galaxy_push_dispatch_url: dispatchUrl };
  const statements = Object.entries(vaultEntries).map(([name, value]) => `do $vault$ declare v_id uuid; begin
    select id into v_id from vault.secrets where name=${literal(name)} limit 1;
    if v_id is null then perform vault.create_secret(${literal(value)},${literal(name)});
    else perform vault.update_secret(v_id,${literal(value)},${literal(name)}); end if; end $vault$;`);
  await sql(`begin;\n${statements.join('\n')}\ninsert into public.app_settings(key,value,is_secret) values('web_push',jsonb_build_object('publicKey',${literal(publicKey)}),false)
    on conflict(key) do update set value=excluded.value,is_secret=false;\nnotify pgrst,'reload schema';\ncommit;`);
  log('4/4 Comprobando configuracion y programacion...');
  const verified = await sql("select exists(select 1 from cron.job where jobname='galaxy-web-push' and active) and exists(select 1 from public.app_settings where key='web_push' and value->>'publicKey'<>'') as push_ready;");
  if (!verified?.[0]?.push_ready) throw new Error('El servicio se guardo, pero falta confirmar la tarea programada. Vuelve a ejecutar para verificar.');
  log('Activacion terminada. El administrador ya puede editar nombres y fotos. Los dispositivos se registraran al permitir las notificaciones dentro de la app.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    let input = ''; for await (const chunk of process.stdin) input += chunk;
    const { token } = JSON.parse(input);
    await activateWebPush({ token });
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'No fue posible completar la activacion.');
    process.exitCode = 1;
  }
}
