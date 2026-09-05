import { authorizeRealtime, supabase } from './supabase';

const APPS_SCRIPT_MAIL_URL = 'https://script.google.com/macros/s/AKfycbwZCcsDhGpWpDcix4A1NNg7UYX_DuzuiyOu4Zlhe3kQZPumAmZt5nsu42sODPI77Uvv/exec';

const parameterNames = Object.freeze({
  modules: 'p_modules', title: 'p_title', password: 'p_password', waitingRoom: 'p_waiting_room',
  roomCode: 'p_room_code', meetingId: 'p_meeting_id', participantId: 'p_participant_id',
  locked: 'p_locked', query: 'p_query', userId: 'p_user_id', limit: 'p_limit',
  body: 'p_body', replyToId: 'p_reply_to_id', messageId: 'p_message_id', emoji: 'p_emoji',
  commandId: 'p_command_id', notificationId: 'p_notification_id', invitationId: 'p_invitation_id',
  status: 'p_status', token: 'p_token', active: 'p_active', from: 'p_from', to: 'p_to',
  description: 'p_description', kind: 'p_kind', startsAt: 'p_starts_at', endsAt: 'p_ends_at',
  recurrence: 'p_recurrence', repeatUntil: 'p_repeat_until', avatar: 'p_avatar',
});

const PROFILE_AVATAR_BUCKET = 'profile-avatars';
const PROFILE_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PROFILE_AVATAR_MAX_BYTES = 5 * 1024 * 1024;

function friendlyError(error) {
  if (!error) return new Error('La solicitud no pudo completarse.');
  const message = String(error.message || '');
  const code = String(error.code || '');
  const known = new Map([
    ['Invalid login credentials', 'El correo o la contraseña no coinciden.'],
    ['Email not confirmed', 'Confirma tu correo antes de iniciar sesión.'],
    ['User already registered', 'Ya existe una cuenta con este correo.'],
    ['JWT expired', 'Tu sesión expiró. Inicia sesión nuevamente.'],
  ]);
  if (known.has(message)) return new Error(known.get(message));
  if (code === 'email_address_not_authorized' || /email address not authorized/i.test(message)) {
    return new Error('Este correo aún no puede recibir confirmaciones. El administrador debe activar el correo transaccional de PROJECT GALAXY.');
  }
  if (code === 'over_email_send_rate_limit' || /email rate limit|rate limit.*email/i.test(message)) {
    return new Error('Se alcanzó temporalmente el límite de correos de confirmación. Espera unos minutos o contacta al administrador.');
  }
  if (code === 'email_send_failed' || /(?:send|sending).*confirmation email|confirmation email.*failed/i.test(message)) {
    return new Error('No fue posible enviar el correo de confirmación. Intenta nuevamente en unos minutos o contacta al administrador.');
  }
  if (code === 'email_address_invalid' || /invalid email|email.*invalid/i.test(message)) {
    return new Error('Ingresa un correo electrónico válido.');
  }
  if (code === 'weak_password' || /password.*(weak|characters)/i.test(message)) {
    return new Error('La contraseña no cumple los requisitos de seguridad.');
  }
  if (code === 'signup_disabled' || /signups?.*disabled/i.test(message)) {
    return new Error('El registro de nuevas cuentas está temporalmente deshabilitado.');
  }
  if (code === 'unexpected_failure' || /database error.*(saving|creating).*user/i.test(message)) {
    return new Error('No pudimos crear el perfil en este momento. El administrador debe revisar el registro de Auth.');
  }
  if (message === 'GALAXY_DUPLICATE_SESSION') {
    return new Error('Esta cuenta se abrió en más de un navegador o dispositivo. Cerramos ambas sesiones por seguridad.');
  }
  if (error.code === 'P0001') return new Error(error.message);
  return new Error('No fue posible completar la solicitud. Intenta nuevamente.');
}

function toParams(payload = {}) {
  return Object.fromEntries(Object.entries(payload)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => [parameterNames[key] || `p_${key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}`, value]));
}

async function rpc(name, payload = {}) {
  const { data, error } = await supabase.rpc(name, toParams(payload));
  if (error) throw friendlyError(error);
  return data;
}

async function currentUser() {
  const { data: authData, error: authError } = await supabase.auth.getSession();
  if (authError || !authData.session) return null;
  const sessionState = await rpc('claim_user_session');
  if (sessionState?.status === 'DUPLICATE') {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    throw new Error('Esta cuenta se abriÃ³ en mÃ¡s de un navegador o dispositivo. Cerramos ambas sesiones por seguridad.');
  }
  return rpc('get_current_user');
}

async function invokeSecure(name, payload, fallback) {
  const { data, error } = await supabase.functions.invoke(name, { body: payload });
  if (data?.error) throw new Error(data.error);
  if (error && name === 'registration' && error.context?.json) {
    const detail = await error.context.json().catch(() => null);
    if (detail?.error) throw new Error(detail.error);
  }
  if (error) throw new Error(fallback);
  return data;
}

export const api = {
  mode: 'supabase',
  async login({ email, password }) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw friendlyError(error);
    return { user: await currentUser(), session: data.session };
  },
  inspectInvitation: (token) => rpc('get_registration_invitation', { token }),
  async inviteUser(payload) {
    const invitation = await rpc('create_registration_invitation', {
      ...payload,
      referrerId: payload.referrerId || null,
    });
    try {
      const response = await fetch(APPS_SCRIPT_MAIL_URL, {
        method: 'POST', redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ action: 'registration_invitation', token: invitation.token }),
      });
      const result = await response.json();
      if (!response.ok || result?.ok !== true) throw new Error(result?.error || 'Apps Script no confirmó el envío.');
      return { expiresAt: invitation.expiresAt };
    } catch (error) {
      await rpc('revoke_registration_invitation', { token: invitation.token }).catch(() => {});
      throw new Error(error?.message || 'No fue posible enviar el correo de invitación.');
    }
  },
  async deleteUser(userId) {
    const { error: storageError } = await supabase.storage.from(PROFILE_AVATAR_BUCKET).remove([`${userId}/profile`]);
    if (storageError && !/not found|does not exist/i.test(storageError.message || '')) throw friendlyError(storageError);
    await rpc('delete_registered_user', { userId });
    return { deleted: true };
  },
  getWalletActivity: () => rpc('get_wallet_activity'),
  async register({ name, username, password, token }) {
    const invitation = await rpc('get_registration_invitation', { token });
    const redirect = new URL('index.html', new URL(import.meta.env.BASE_URL, globalThis.location.origin));
    const { data, error } = await supabase.auth.signUp({
      email: invitation.email, password,
      options: { emailRedirectTo: redirect.href, data: { name: name.trim(), username: username.trim().toLowerCase(), registration_token: token } },
    });
    if (error) throw friendlyError(error);
    history.replaceState(null, '', location.pathname + location.search);
    if (!data.session) return { user: null, session: null, requiresConfirmation: true, email: invitation.email };
    return { user: await currentUser(), session: data.session };
  },
  async logout() {
    await rpc('release_user_session').catch(() => {});
    const { error } = await supabase.auth.signOut();
    if (error) throw friendlyError(error);
    return { loggedOut: true };
  },
  bootstrap: (modules = ['user']) => rpc('get_bootstrap_data', { modules }),
  me: currentUser,
  updateProfile: (payload) => rpc('update_profile', payload),
  async uploadProfileAvatar(file) {
    if (!globalThis.File || !(file instanceof globalThis.File) || !PROFILE_AVATAR_TYPES.has(file.type)) throw new Error('Selecciona una imagen JPG, PNG o WebP.');
    if (!file.size || file.size > PROFILE_AVATAR_MAX_BYTES) throw new Error('La foto de perfil debe pesar como máximo 5 MB.');
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !data.session?.user?.id) throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
    const objectPath = `${data.session.user.id}/profile`;
    const { error } = await supabase.storage.from(PROFILE_AVATAR_BUCKET).upload(objectPath, file, {
      upsert: true, contentType: file.type, cacheControl: '60',
    });
    if (error) throw new Error('No fue posible subir la foto. Verifica el formato, el tamaño y vuelve a intentarlo.');
    return rpc('update_profile_avatar', { avatar: `${objectPath}?v=${Date.now()}` });
  },
  async removeProfileAvatar() {
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !data.session?.user?.id) throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
    const objectPath = `${data.session.user.id}/profile`;
    const { error } = await supabase.storage.from(PROFILE_AVATAR_BUCKET).remove([objectPath]);
    if (error) throw new Error('No fue posible eliminar la foto de perfil. Intenta nuevamente.');
    return rpc('update_profile_avatar', { avatar: '' });
  },
  async getMembershipCenter() {
    const [membership, commerce] = await Promise.all([rpc('get_membership_center'), rpc('get_crypto_store')]);
    return { ...membership, products: commerce?.products || [], orders: [...(commerce?.orders || []), ...(membership?.orders || [])]
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)) };
  },
  getTurnCredentials: (meetingId) => invokeSecure('turn-credentials', { meetingId }, 'El relay TURN no está disponible.'),
  getScannerDownload: () => invokeSecure('scanner-download', {}, 'No fue posible preparar la descarga privada.'),
  createMeeting: (payload) => rpc('create_meeting', payload),
  createMeetingShareLink: (meetingId) => rpc('create_meeting_share_link', { meetingId }),
  redeemMeetingShareLink: (token) => rpc('redeem_meeting_share_link', { token }),
  getCalendarEvents: (payload) => rpc('get_calendar_events', payload),
  createCalendarEvent: (payload) => rpc('create_calendar_event', payload),
  joinMeeting: (payload) => rpc('join_meeting', payload),
  getMyMeetings: () => rpc('get_my_meetings'),
  getMyNotifications: (limit = 30) => rpc('get_my_notifications', { limit }),
  markNotificationRead: (notificationId) => rpc('mark_notification_read', { notificationId }),
  markAllNotificationsRead: () => rpc('mark_all_notifications_read'),
  getMeetingState: (payload) => rpc('get_meeting_state', payload),
  admitMeetingParticipant: (payload) => rpc('admit_meeting_participant', payload),
  denyMeetingParticipant: (payload) => rpc('deny_meeting_participant', payload),
  setMeetingLocked: (payload) => rpc('set_meeting_locked', payload),
  setParticipantMicsLocked: (payload) => rpc('set_participant_mics_locked', payload),
  endMeeting: (payload) => rpc('end_meeting', payload),
  restartMeeting: (payload) => rpc('restart_meeting', payload),
  removeEndedMeeting: (payload) => rpc('remove_ended_meeting', payload),
  getAdminUsers: () => rpc('get_admin_users'),
  setUserAccess: (payload) => rpc('set_user_access', payload),
  getCommunityMembers: (query = '') => rpc('get_community_members', { query }),
  getMeetingInviteCandidates: (meetingId, query = '') => rpc('get_meeting_invite_candidates', { meetingId, query }),
  markMeetingInvitationSeen: (invitationId) => rpc('mark_meeting_invitation_seen', { invitationId }),
  inviteToMeeting: (payload) => rpc('invite_to_meeting', payload),
  respondToMeetingInvitation: (payload) => rpc('respond_to_meeting_invitation', payload),
  getMeetingMessages: (payload) => rpc('get_meeting_messages', payload),
  getMeetingMessage: (payload) => rpc('get_meeting_message', payload),
  postMeetingMessage: (payload) => rpc('post_meeting_message', { ...payload, replyToId: payload.replyToId || null }),
  reactToMeetingMessage: (payload) => rpc('react_to_meeting_message', payload),
  requestMeetingMute: (payload) => rpc('request_meeting_mute', payload),
  consumeMeetingCommand: (payload) => rpc('consume_meeting_command', payload),
  async heartbeatSession() {
    const state = await rpc('heartbeat_user_session');
    if (state?.status === 'DUPLICATE') {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      throw new Error('Esta cuenta se abriÃ³ en mÃ¡s de un navegador o dispositivo. Cerramos ambas sesiones por seguridad.');
    }
    return state;
  },
  onMeetingParticipantChange(meetingId, callback) {
    let active = true; let channel = null;
    authorizeRealtime().then(() => {
      if (!active) return;
      channel = supabase.channel(`db:participants:${meetingId}:${crypto.randomUUID()}`, { config: { private: true } })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'meeting_participants', filter: `meeting_id=eq.${meetingId}` }, callback)
        .subscribe();
    }).catch(() => {});
    return () => { active = false; if (channel) supabase.removeChannel(channel); };
  },
  onNotificationChange(userId, callback) {
    let active = true; let channel = null;
    authorizeRealtime().then(() => {
      if (!active) return;
      channel = supabase.channel(`db:notifications:${userId}:${crypto.randomUUID()}`, { config: { private: true } })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, callback)
        .subscribe();
    }).catch(() => {});
    return () => { active = false; if (channel) supabase.removeChannel(channel); };
  },
};
