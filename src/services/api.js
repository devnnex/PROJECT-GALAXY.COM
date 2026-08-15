import { CONFIG } from '../config';

const SESSION_KEY = 'galaxy_session';
const pendingRequests = new Map();
const readCache = new Map();

function clearReadCache() { readCache.clear(); }

async function remote(action, payload = {}, method = 'POST', options = {}) {
  if (!CONFIG.API_URL) throw new Error('La URL del Web App de Apps Script no está configurada.');
  const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  const key = `${method}:${action}:${session?.user?.id || 'anonymous'}:${JSON.stringify(payload)}`; const now = Date.now(); const cached = readCache.get(key);
  if (options.ttl && cached && cached.expiresAt > now) return cached.data;
  if (pendingRequests.has(key)) return pendingRequests.get(key);
  const operation = (async () => {
    const request = method === 'GET'
      ? fetch(`${CONFIG.API_URL}?action=${encodeURIComponent(action)}${session?.token ? `&sessionToken=${encodeURIComponent(session.token)}` : ''}`)
      : fetch(CONFIG.API_URL, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, ...payload, ...(session?.token ? { sessionToken: session.token } : {}) }),
      });
    const response = await request; const result = await response.json();
    if (!result.ok) throw new Error(result.error?.message || 'La solicitud no pudo completarse.');
    if (options.ttl) readCache.set(key, { data: result.data, expiresAt: Date.now() + options.ttl });
    return result.data;
  })();
  pendingRequests.set(key, operation);
  try { return await operation; } finally { pendingRequests.delete(key); }
}

export const api = {
  mode: 'remote',
  login: async (payload) => { clearReadCache(); return remote('login', payload); },
  register: async (payload) => { clearReadCache(); return remote('register', payload); },
  logout: async () => { clearReadCache(); return remote('logout'); },
  bootstrap: (modules = ['user']) => remote('getBootstrapData', { modules }, 'POST', { ttl: 10_000 }),
  me: () => remote('getBootstrapData', { modules: ['user'] }, 'POST', { ttl: 10_000 }).then((data) => data.user),
  createMeeting: (payload) => remote('createMeeting', payload),
  joinMeeting: (payload) => remote('joinMeeting', payload),
  getMyMeetings: () => remote('getMyMeetings'),
  getMeetingState: (payload) => remote('getMeetingState', payload),
  admitMeetingParticipant: (payload) => remote('admitMeetingParticipant', payload),
  denyMeetingParticipant: (payload) => remote('denyMeetingParticipant', payload),
  setMeetingLocked: (payload) => remote('setMeetingLocked', payload),
  endMeeting: (payload) => remote('endMeeting', payload),
  getCommunityMembers: (query = '') => remote('getCommunityMembers', { query }),
  inviteToMeeting: (payload) => remote('inviteToMeeting', payload),
  getMeetingMessages: (payload) => remote('getMeetingMessages', payload),
  postMeetingMessage: (payload) => remote('postMeetingMessage', payload),
  reactToMeetingMessage: (payload) => remote('reactToMeetingMessage', payload),
  pollMeetingRealtime: (payload) => remote('pollMeetingRealtime', payload),
  postMeetingSignals: (payload) => remote('postMeetingSignals', payload),
  leaveMeetingRealtime: (payload) => remote('leaveMeetingRealtime', payload),
};

export function getStoredSession() {
  return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
}

export function storeRemoteSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}
