import { authorizeRealtime, supabase } from './supabase';

const parameterNames = Object.freeze({
  modules: 'p_modules', title: 'p_title', password: 'p_password', waitingRoom: 'p_waiting_room',
  roomCode: 'p_room_code', meetingId: 'p_meeting_id', participantId: 'p_participant_id',
  locked: 'p_locked', query: 'p_query', userId: 'p_user_id', limit: 'p_limit',
  body: 'p_body', replyToId: 'p_reply_to_id', messageId: 'p_message_id', emoji: 'p_emoji',
  commandId: 'p_command_id', notificationId: 'p_notification_id', invitationId: 'p_invitation_id',
  status: 'p_status',
});

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
  return rpc('get_current_user');
}

async function membershipPayment(payload) {
  const { data, error } = await supabase.functions.invoke('membership-payments', { body: payload });
  if (error || data?.error) throw new Error('No fue posible conectar con la pasarela segura de pagos. Intenta nuevamente.');
  return data;
}

export const api = {
  mode: 'supabase',
  async login({ email, password }) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw friendlyError(error);
    return { user: await currentUser(), session: data.session };
  },
  async register({ name, username, email, password }) {
    const appUrl = new URL('index.html', new URL(import.meta.env.BASE_URL, globalThis.location.origin)).href;
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(), password,
      options: { emailRedirectTo: appUrl, data: { name: name.trim(), username: username.trim().toLowerCase() } },
    });
    if (error) throw friendlyError(error);
    if (!data.session) return { user: null, session: null, requiresConfirmation: true, email: email.trim() };
    return { user: await currentUser(), session: data.session };
  },
  async logout() {
    const { error } = await supabase.auth.signOut();
    if (error) throw friendlyError(error);
    return { loggedOut: true };
  },
  bootstrap: (modules = ['user']) => rpc('get_bootstrap_data', { modules }),
  me: currentUser,
  updateProfile: (payload) => rpc('update_profile', payload),
  getMembershipCenter: () => rpc('get_membership_center'),
  createMembershipPayment: ({ planCode, network }) => membershipPayment({ action: 'create', planCode, network }),
  refreshMembershipPayment: (orderId) => membershipPayment({ action: 'refresh', orderId }),
  createMeeting: (payload) => rpc('create_meeting', payload),
  joinMeeting: (payload) => rpc('join_meeting', payload),
  getMyMeetings: () => rpc('get_my_meetings'),
  getMyNotifications: (limit = 30) => rpc('get_my_notifications', { limit }),
  markNotificationRead: (notificationId) => rpc('mark_notification_read', { notificationId }),
  markAllNotificationsRead: () => rpc('mark_all_notifications_read'),
  getMeetingState: (payload) => rpc('get_meeting_state', payload),
  admitMeetingParticipant: (payload) => rpc('admit_meeting_participant', payload),
  denyMeetingParticipant: (payload) => rpc('deny_meeting_participant', payload),
  setMeetingLocked: (payload) => rpc('set_meeting_locked', payload),
  endMeeting: (payload) => rpc('end_meeting', payload),
  getCommunityMembers: (query = '') => rpc('get_community_members', { query }),
  inviteToMeeting: (payload) => rpc('invite_to_meeting', payload),
  respondToMeetingInvitation: (payload) => rpc('respond_to_meeting_invitation', payload),
  getMeetingMessages: (payload) => rpc('get_meeting_messages', payload),
  getMeetingMessage: (payload) => rpc('get_meeting_message', payload),
  postMeetingMessage: (payload) => rpc('post_meeting_message', { ...payload, replyToId: payload.replyToId || null }),
  reactToMeetingMessage: (payload) => rpc('react_to_meeting_message', payload),
  requestMeetingMute: (payload) => rpc('request_meeting_mute', payload),
  consumeMeetingCommand: (payload) => rpc('consume_meeting_command', payload),
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
