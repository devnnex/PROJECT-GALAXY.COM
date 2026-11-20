import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { telegramMessage } from '../supabase/functions/scanner-telegram/messages.js';

const root=resolve(fileURLToPath(new URL('..',import.meta.url))), ref='xdsqtuubsptpzwadecha';
const historyOnly=process.argv.includes('--history-only');
const cli=process.env.SUPABASE_CLI||(process.platform==='win32'?join(process.env.LOCALAPPDATA||'','GALAXY-Tools/supabase/supabase.exe'):'supabase');
async function call(args){
 try {const result=await promisify(execFile)(cli,args,{cwd:root,windowsHide:true,maxBuffer:4*1024*1024});return args[0]==='functions'?{}:JSON.parse(result.stdout);}
 catch {throw new Error(`No se pudo completar ${args.slice(0,2).join(' ')}. No se muestran credenciales.`);}
}
try {
 if(!historyOnly)await call(['db','query','--file',resolve(root,'supabase/migrations/20261120120000_strategy_controls_fast_telegram.sql'),`--remote=${ref}`,'--yes','--output','json']);
 const keys=await call(['projects','api-keys','--project-ref',ref,'--output','json']);
 const key=(Array.isArray(keys)?keys:keys.api_keys||keys.data||[]).find(k=>k.name==='service_role')?.api_key;
 if(!key)throw new Error('No se obtuvo acceso al proyecto configurado.');
 const client=createClient(`https://${ref}.supabase.co`,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const bytes=await readFile(resolve(root,'assets/telegram/galaxy-aurum.png'));
 const hash=createHash('sha256').update(bytes).digest('hex'),path='reusable/galaxy-aurum.png';
 const previous=await client.from('scanner_telegram_media').select('sha256').eq('key','AURUM').maybeSingle();
 if(previous.error)throw new Error('No se pudo verificar la imagen privada.');
 if(previous.data?.sha256!==hash){
  const uploaded=await client.storage.from('telegram-evidence').upload(path,bytes,{contentType:'image/png',upsert:true});
  if(uploaded.error)throw new Error('No se pudo preparar la imagen de Aurum.');
  const stored=await client.from('scanner_telegram_media').upsert({key:'AURUM',path,file_id:null,sha256:hash});
  if(stored.error)throw new Error('No se pudo guardar la caché de Aurum.');
 }
 for(const name of historyOnly?[]:['scanner-telegram','scanner-signals']){
  console.log(`Actualizando ${name}…`);
  await call(['functions','deploy',name,`--remote=${ref}`,'--use-api','--no-verify-jwt','--yes']);
 }
 let corrected=0,unavailable=0;
 if(process.argv.includes('--correct-history')){
  const token=(await readFile(resolve(root,'../.tools/telegram-bot-token.txt'),'utf8')).trim();
  const config=await client.from('telegram_community_config').select('chat_id').eq('id',true).single();
  const jobs=await client.from('scanner_telegram_jobs').select('id,kind,payload,telegram_message_id,recipient_id').eq('state','sent').contains('payload',{historicalSlProfitCorrection:true});
  if(config.error||jobs.error||!config.data.chat_id)throw new Error('No se pudo verificar el historial de Telegram.');
  for(const job of jobs.data){
   // Correct existing bot messages only. Never replay or send a new notification.
   const response=await fetch(`https://api.telegram.org/bot${token}/editMessageText`,{method:'POST',headers:{'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(10000),body:JSON.stringify({chat_id:job.recipient_id??config.data.chat_id,message_id:job.telegram_message_id,text:telegramMessage(job),parse_mode:'HTML',link_preview_options:{is_disabled:true},reply_markup:{inline_keyboard:[[{text:'Ver Galaxy Aurum Bot',url:'https://devnnex.github.io/PROJECT-GALAXY.COM/dist/index.html?section=black-trade&strategy=aurum'}]]}})});
   const result=await response.json().catch(()=>({}));
   const missing=!result.ok&&String(result.description).includes('message to edit not found');
   if(!result.ok&&!missing&&!String(result.description).includes('message is not modified'))throw new Error(`No se pudo corregir un mensaje histórico (HTTP ${response.status}): ${String(result.description).replaceAll(token,'[privado]').slice(0,160)}`);
   const payload={...job.payload};delete payload.historicalSlProfitCorrection;
   if(missing){payload.historyCorrectionUnavailable=true;unavailable++;}else corrected++;
   const marked=await client.from('scanner_telegram_jobs').update({payload}).eq('id',job.id);
   if(marked.error)throw new Error('No se pudo confirmar una corrección histórica.');
   await new Promise(r=>setTimeout(r,1100));
  }
 }
 console.log(JSON.stringify({updated:true,historicalMessagesCorrected:corrected,historicalMessagesUnavailable:unavailable,newMessagesSent:0}));
}catch(error){console.error(error instanceof Error?error.message:'No se pudo actualizar la entrega de señales.');process.exitCode=1;}
