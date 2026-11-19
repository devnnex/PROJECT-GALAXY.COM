import { expect, it, vi } from 'vitest';
import { handleCommunityUpdate, relevantTelegramUpdate } from '../supabase/functions/telegram-community/handler';
import { telegramMessage } from '../supabase/functions/scanner-telegram/messages';
const config = { enabled:true,chat_id:-123,started_at:'2026-11-19T10:00:00Z' };
const date = Date.parse('2026-11-19T15:00:00Z')/1000;
const join = { update_id:1,chat_join_request:{chat:{id:-123,type:'group'},from:{id:456},invite_link:{invite_link:'https://t.me/+personal'},date} };
function deps(authorized=true) { return {config,rpc:vi.fn(async(name)=>name==='claim_telegram_webhook_update'?{lease:'lease'}:name==='authorize_telegram_member'?authorized:true),telegram:vi.fn(async(name)=>name==='getChatMember'?{status:'left'}:true)}; }
it('ignores normal conversations, other groups and updates older than activation',async()=>{
  expect(relevantTelegramUpdate({message:{chat:{type:'group'},text:'Hola'}})).toBe(false);
  const d=deps();await handleCommunityUpdate({...join,chat_join_request:{...join.chat_join_request,chat:{id:-999,type:'group'}}},d);expect(d.rpc).not.toHaveBeenCalled();
  await handleCommunityUpdate({...join,chat_join_request:{...join.chat_join_request,date:1}},d);expect(d.rpc).not.toHaveBeenCalled();
});
it('proposes a private bot identity without approving it before Galaxy confirmation',async()=>{
  const d=deps();await handleCommunityUpdate({update_id:2,message:{date,chat:{id:456,type:'private'},from:{id:456,first_name:'Ana'},text:'/start galaxy_'+'a'.repeat(32)}},d);
  expect(d.rpc).toHaveBeenCalledWith('propose_telegram_account',expect.objectContaining({p_telegram_id:456,p_token:'a'.repeat(32)}));expect(d.telegram).not.toHaveBeenCalled();
});
it('approves the matching registered identity, records membership and revokes its invitation',async()=>{
  const d=deps();await handleCommunityUpdate(join,d);
  expect(d.rpc).toHaveBeenCalledWith('authorize_telegram_member',{p_telegram_id:456,p_link:'https://t.me/+personal'});
  expect(d.telegram).toHaveBeenCalledWith('approveChatJoinRequest',{chat_id:-123,user_id:456});
  expect(d.rpc).toHaveBeenCalledWith('mark_telegram_member',{p_telegram_id:456,p_state:'MEMBER'});
  expect(d.telegram).toHaveBeenCalledWith('revokeChatInviteLink',expect.objectContaining({chat_id:-123}));
});
it('declines unverified or forwarded invitations and never welcomes them',async()=>{
  const d=deps(false);await handleCommunityUpdate(join,d);expect(d.telegram).toHaveBeenCalledExactlyOnceWith('declineChatJoinRequest',{chat_id:-123,user_id:456});
  expect(d.rpc.mock.calls.some(([name])=>name==='mark_telegram_member')).toBe(false);
});
it('removes new unregistered arrivals through legacy links while preserving administrators',async()=>{
  const update={update_id:3,message:{date,chat:{id:-123,type:'group'},new_chat_members:[{id:456,is_bot:false}]}};
  const d=deps(false);d.telegram.mockImplementation(async name=>name==='getChatMember'?{status:'member'}:true);
  await handleCommunityUpdate(update,d);expect(d.telegram).toHaveBeenCalledWith('banChatMember',expect.objectContaining({user_id:456}));
  const safe=deps(false);safe.telegram.mockResolvedValue({status:'administrator'});await handleCommunityUpdate(update,safe);expect(safe.telegram).toHaveBeenCalledOnce();
});
it('does not repeat a completed update and retries incomplete Telegram actions',async()=>{
  const d=deps();d.rpc.mockResolvedValue({done:true});await handleCommunityUpdate(join,d);expect(d.telegram).not.toHaveBeenCalled();
  const unavailable=deps();unavailable.telegram.mockRejectedValue(new Error('offline'));await expect(handleCommunityUpdate(join,unavailable)).rejects.toThrow('offline');
  expect(unavailable.rpc.mock.calls.some(([name])=>name==='complete_telegram_webhook_update')).toBe(false);
});
it('welcomes briefly without exposing a new member’s Telegram profile',()=>{
  const text=telegramMessage({kind:'WELCOME',payload:{}});expect(text).toContain('Soy <b>PowerEliteBot</b>');expect(text.length).toBeLessThan(250);expect(text).not.toContain('tg://user');
  expect(telegramMessage({kind:'LINK',payload:{}})).toContain('confirma');
});
