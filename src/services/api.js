import { supabase } from './supabase';

const parameterNames = Object.freeze({
  modules: 'p_modules', title: 'p_title', password: 'p_password', waitingRoom: 'p_waiting_room',
  roomCode: 'p_room_code', meetingId: 'p_meeting_id', participantId: 'p_participant_id',
  locked: 'p_locked', query: 'p_query', userId: 'p_user_id', limit: 'p_limit',
  body: 'p_body', replyToId: 'p_reply_to_id', messageId: 'p_message_id', emoji: 'p_emoji',
});

function friendlyError(error) {
  if (!error) return new Error('La solicitud no pudo completarse.');
  const known = {
    'Invalid login credentials': 'El correo o la contraseña no coinciden.',
    'Email not confirmed': 'Confirma tu correo antes de iniciar sesión.',
    'User already registered': 'Ya existe una cuenta con este correo.',
    'JWT expired': 'Tu sesión expiró. Inicia sesión nuevamente.',
  };
  return new Error(known[error.message] || error.message || 'La solicitud no pudo completarse.');
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

export const api = {
  mode: 'supabase',
  async login({ email, password }) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw friendlyError(error);
    return { user: await currentUser(), session: data.session };
  },
  async register({ name, username, email, password }) {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(), password,
      options: { data: { name: name.trim(), username: username.trim().toLowerCase() } },
    });
    if (error) throw friendlyError(error);
    if (!data.session) throw new Error('Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.');
    return { user: await currentUser(), session: data.session };
  },
  async logout() {
    const { error } = await supabase.auth.signOut();
    if (error) throw friendlyError(error);
    return { loggedOut: true };
  },
  bootstrap: (modules = ['user']) => rpc('get_bootstrap_data', { modules }),
  me: currentUser,
  createMeeting: (payload) => rpc('create_meeting', payload),
  joinMeeting: (payload) => rpc('join_meeting', payload),
  getMyMeetings: () => rpc('get_my_meetings'),
  getMeetingState: (payload) => rpc('get_meeting_state', payload),
  admitMeetingParticipant: (payload) => rpc('admit_meeting_participant', payload),
  denyMeetingParticipant: (payload) => rpc('deny_meeting_participant', payload),
  setMeetingLocked: (payload) => rpc('set_meeting_locked', payload),
  endMeeting: (payload) => rpc('end_meeting', payload),
  getCommunityMembers: (query = '') => rpc('get_community_members', { query }),
  inviteToMeeting: (payload) => rpc('invite_to_meeting', payload),
  getMeetingMessages: (payload) => rpc('get_meeting_messages', payload),
  postMeetingMessage: (payload) => rpc('post_meeting_message', { ...payload, replyToId: payload.replyToId || null }),
  reactToMeetingMessage: (payload) => rpc('react_to_meeting_message', payload),
  onMeetingParticipantChange(meetingId, callback) {
    const channel = supabase.channel(`db:participants:${meetingId}:${crypto.randomUUID()}`, { config: { private: true } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meeting_participants', filter: `meeting_id=eq.${meetingId}` }, callback)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  },
};
