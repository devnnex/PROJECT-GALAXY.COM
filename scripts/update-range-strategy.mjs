import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {createClient} from '@supabase/supabase-js';
const root=resolve(fileURLToPath(new URL('..',import.meta.url))),ref='xdsqtuubsptpzwadecha';
const cli=process.env.SUPABASE_CLI||(process.platform==='win32'?join(process.env.LOCALAPPDATA||'','GALAXY-Tools/supabase/supabase.exe'):'supabase');
async function call(args){try{const result=await promisify(execFile)(cli,args,{cwd:root,windowsHide:true,maxBuffer:4*1024*1024});return args[0]==='functions'?{}:JSON.parse(result.stdout);}catch{throw new Error(`No se pudo completar ${args.slice(0,2).join(' ')} de Galaxy Aurum Bot. No se muestran credenciales.`);}}
const db=(args)=>call(['db','query',...args,`--remote=${ref}`,'--yes','--output','json']);
try {
 await db(['--file',resolve(root,'supabase/migrations/20261119210000_range777_strategy.sql')]);
 await db(['--file',resolve(root,'supabase/migrations/20261119220000_aurum_bot_branding.sql')]);
 await db(['--file',resolve(root,'supabase/migrations/20261120120000_strategy_controls_fast_telegram.sql')]);
 await db(['--file',resolve(root,'supabase/migrations/20261120160000_strategy_access_and_instant_delivery.sql')]);
 const keys=await call(['projects','api-keys','--project-ref',ref,'--output','json']);
 const key=(Array.isArray(keys)?keys:keys.api_keys||keys.data||[]).find(k=>k.name==='service_role')?.api_key;
 if(!key)throw new Error('Falta el acceso privado al proyecto configurado.');
 const client=createClient(`https://${ref}.supabase.co`,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const bucket='telegram-evidence';const existing=await client.storage.getBucket(bucket);
 if(existing.error){const result=await client.storage.createBucket(bucket,{public:false,fileSizeLimit:3*1024*1024,allowedMimeTypes:['image/png']});if(result.error)throw new Error('No fue posible preparar las imágenes privadas.');}
 else if(existing.data.public)throw new Error('El bucket de Telegram debe ser privado.');
 for(const side of ['BUY','SELL','AURUM']){
  const bytes=await readFile(resolve(root,`assets/telegram/galaxy-${side.toLowerCase()}.png`));
  const hash=createHash('sha256').update(bytes).digest('hex'),path=`reusable/galaxy-${side.toLowerCase()}.png`;
  const previous=await client.from('scanner_telegram_media').select('sha256').eq('key',side).maybeSingle();
  if(previous.error)throw new Error('No se pudo validar la caché de imágenes.');
  if(previous.data?.sha256===hash)continue;
  const uploaded=await client.storage.from(bucket).upload(path,bytes,{contentType:'image/png',upsert:true});
  if(uploaded.error)throw new Error('No se pudo guardar una imagen de señal.');
  const result=await client.from('scanner_telegram_media').upsert({key:side,path,file_id:null,sha256:hash});if(result.error)throw new Error('No se pudo actualizar la caché de imágenes.');
 }
 for(const name of ['scanner-telegram','scanner-signals']){console.log(`Actualizando ${name}…`);await call(['functions','deploy',name,`--remote=${ref}`,'--use-api','--no-verify-jwt','--yes']);}
 // Let the database attach its own secret. It never leaves Vault for this
 // diagnostic, even in local process memory or CLI output.
 const queued=await db([`select net.http_post(url:='https://${ref}.supabase.co/functions/v1/scanner-telegram',headers:=jsonb_build_object('Content-Type','application/json','x-galaxy-telegram-secret',(select decrypted_secret from vault.decrypted_secrets where name='galaxy_telegram_dispatch_secret' limit 1)),body:='{"action":"check-report-renderer"}'::jsonb,timeout_milliseconds:=25000) as id`]);
 const id=Number(queued.rows?.[0]?.id);if(!Number.isSafeInteger(id))throw new Error('No se pudo preparar la comprobación privada de reportes.');
 let received;
 for(let attempt=0;attempt<10&&!received;attempt++){await new Promise(r=>setTimeout(r,1000));received=(await db(['--read-only',`select status_code,content from net._http_response where id=${id}`])).rows?.[0];}
 const proof=JSON.parse(received?.content||'{}');if(received?.status_code!==200||!proof.rendered||proof.bytes<1000)throw new Error(`El generador de reportes no pasó la comprobación en el servidor (HTTP ${received?.status_code||'sin respuesta'}). La estrategia no se activa.`);
 if(process.argv.includes('--enable'))await db(["update public.range_scanner_state set enabled=true,started_at=coalesce(started_at,now()) where id"]);
 console.log(JSON.stringify({updated:true,activationRequested:process.argv.includes('--enable'),reportImageBytes:proof.bytes,syntheticSignalsSent:0}));
}catch(error){console.error(error instanceof Error?error.message:'No se pudo actualizar Galaxy Aurum Bot.');process.exitCode=1;}
