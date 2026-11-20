export function signalMediaKey(job) {
 const side=job.payload.trade?.side;
 if(!['BUY','SELL'].includes(side))throw new Error('Invalid signal side');
 return job.payload.strategy==='RANGE777'?'AURUM':side;
}
export async function telegramMedia(job, client, renderReport) {
 if(job.kind==='PHOTO') {
  if(!/^scheduled\/[a-f0-9-]+\.png$/.test(job.payload.path||''))throw new Error('Invalid evidence path');
  const {data,error}=await client.storage.from('telegram-evidence').download(job.payload.path);if(error||!data)throw new Error('Evidence unavailable');return data;
 }
 if(['WEEKLY','MONTHLY'].includes(job.kind))return renderReport(job);
 if(job.kind==='EVENT'&&job.payload.type==='SIGNAL') {
  const key=signalMediaKey(job);
  const {data,error}=await client.from('scanner_telegram_media').select('path,file_id').eq('key',key).single();
  const expected=key==='AURUM'?'reusable/galaxy-aurum.png':`reusable/galaxy-${key.toLowerCase()}.png`;
  if(error||!data||data.path!==expected)throw new Error('Signal artwork unavailable');
  if(data.file_id)return data.file_id;
  const photo=await client.storage.from('telegram-evidence').download(data.path);if(photo.error||!photo.data)throw new Error('Signal artwork unavailable');return photo.data;
 }
 return null;
}
