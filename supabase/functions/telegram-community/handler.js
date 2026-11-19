const member = (value) => ['member', 'administrator', 'creator'].includes(value?.status) || (value?.status === 'restricted' && value.is_member === true);
const admin = (value) => ['administrator', 'creator'].includes(value?.status);
export function relevantTelegramUpdate(update) {
  return Boolean(update?.chat_join_request || update?.chat_member || update?.message?.new_chat_members
    || (update?.message?.chat?.type === 'private' && /^\/start(?:@\w+)? galaxy_[a-f0-9]{32}$/.test(update.message.text || '')));
}

export async function handleCommunityUpdate(update, { config, rpc, telegram }) {
  if (!config?.enabled || !relevantTelegramUpdate(update) || !Number.isSafeInteger(update.update_id)) return 'ignored';
  const message = update.message, request = update.chat_join_request, change = update.chat_member;
  const event = request || change || message;
  if (event.date * 1000 + 1000 < Date.parse(config.started_at)) return 'old';
  if (event.chat?.type !== 'private' && String(event.chat?.id) !== String(config.chat_id)) return 'ignored';
  if (message?.chat?.type === 'private' && (message.from?.is_bot || message.from?.id !== message.chat.id)) return 'ignored';
  const claim = await rpc('claim_telegram_webhook_update', { p_update: update.update_id });
  if (claim.done) return 'duplicate';
  if (!claim.lease) throw new Error('Webhook already processing');
  if (message?.chat?.type === 'private') {
    const token = message.text.split('galaxy_')[1];
    await rpc('propose_telegram_account', { p_token: token, p_telegram_id: message.from.id, p_username: message.from.username || null, p_first_name: message.from.first_name || null });
  } else if (request) {
    const allowed = typeof request.invite_link?.invite_link === 'string' && await rpc('authorize_telegram_member', { p_telegram_id: request.from.id, p_link: request.invite_link.invite_link });
    if (!allowed) {
      try { await telegram('declineChatJoinRequest', { chat_id: config.chat_id, user_id: request.from.id }); }
      catch (error) { if (error.status !== 400) throw error; }
    }
    else {
      const current = await telegram('getChatMember', { chat_id: config.chat_id, user_id: request.from.id });
      if (!member(current)) {
        try { await telegram('approveChatJoinRequest', { chat_id: config.chat_id, user_id: request.from.id }); }
        catch (error) { if (!member(await telegram('getChatMember', { chat_id: config.chat_id, user_id: request.from.id }))) throw error; }
      }
      await rpc('mark_telegram_member', { p_telegram_id: request.from.id, p_state: 'MEMBER' });
      try { await telegram('revokeChatInviteLink', { chat_id: config.chat_id, invite_link: request.invite_link.invite_link }); }
      catch (error) { if (error.status !== 400) throw error; }
    }
  } else {
    const entrants = change ? member(change.new_chat_member) && !member(change.old_chat_member) ? [change.new_chat_member.user] : [] : message.new_chat_members || [];
    if (change && !member(change.new_chat_member)) await rpc('mark_telegram_member', { p_telegram_id: change.new_chat_member.user.id, p_state: 'LEFT' });
    for (const person of entrants) {
      if (person.is_bot || (change && admin(change.new_chat_member))) continue;
      const state = await telegram('getChatMember', { chat_id: config.chat_id, user_id: person.id });
      if (admin(state)) continue;
      if (!member(state)) continue;
      const allowed = await rpc('authorize_telegram_member', { p_telegram_id: person.id, p_link: null });
      if (allowed) await rpc('mark_telegram_member', { p_telegram_id: person.id, p_state: 'MEMBER' });
      else {
        // Enforce registration on new arrivals via older/manual invitations too.
        // Existing members are never swept or removed by activation.
        await telegram('banChatMember', { chat_id: config.chat_id, user_id: person.id, until_date: Math.floor(Date.now() / 1000) + 60 });
        if (event.chat.type !== 'group') await telegram('unbanChatMember', { chat_id: config.chat_id, user_id: person.id, only_if_banned: true });
      }
    }
  }
  if (!await rpc('complete_telegram_webhook_update', { p_update: update.update_id, p_lease: claim.lease })) throw new Error('Webhook lease changed');
  return 'processed';
}
