import { createClient } from '@supabase/supabase-js';
import { CONFIG } from '../config';

if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
  throw new Error('Supabase no está configurado. Define SUPABASE_URL y SUPABASE_ANON_KEY.');
}

export const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storageKey: 'galaxy_supabase_auth',
  },
  realtime: { params: { eventsPerSecond: 30 } },
});

const realtimeRetryDelays = [0, 250, 700, 1500];
let realtimePrime = null;

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const errorText = (error) => [error?.message, error?.code, error?.reason, String(error || '')].filter(Boolean).join(' ');

export function isTransientRealtimeError(error) {
  return /MissingPartition|expected messages partition|no partition|timeout|timed_out|temporar|503|connection/i.test(errorText(error));
}

const isPartitionError = (error) => /MissingPartition|expected messages partition|no partition/i.test(errorText(error));

function publicRealtimeError(error) {
  if (isPartitionError(error)) {
    return new Error('Estamos preparando el canal seguro de la reunión. Intenta nuevamente en unos segundos.');
  }
  return new Error('No fue posible abrir el canal seguro de la reunión. Comprueba tu conexión e inténtalo nuevamente.');
}

export async function authorizeRealtime() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
  await supabase.realtime.setAuth(data.session.access_token);
  return data.session;
}

function subscribeOnce(channel, timeoutMs, onSubscribed) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => finish(reject, Object.assign(new Error('Realtime subscription timed out'), { code: 'TIMED_OUT' })), timeoutMs);
    channel.subscribe((status, error) => {
      if (status === 'SUBSCRIBED') {
        Promise.resolve(onSubscribed?.(channel)).then(() => finish(resolve, channel), (cause) => finish(reject, cause));
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        finish(reject, error || Object.assign(new Error(`Realtime ${status}`), { code: status }));
      }
    });
  });
}

export async function subscribeRealtimeChannel(createChannel, { timeoutMs = 4500, onSubscribed } = {}) {
  await authorizeRealtime();
  let lastError;
  for (let attempt = 0; attempt < realtimeRetryDelays.length; attempt += 1) {
    if (realtimeRetryDelays[attempt]) await wait(realtimeRetryDelays[attempt]);
    const channel = createChannel();
    try {
      await subscribeOnce(channel, timeoutMs, onSubscribed);
      return channel;
    } catch (error) {
      lastError = error;
      await supabase.removeChannel(channel).catch(() => {});
      if (!isTransientRealtimeError(error) || (!isPartitionError(error) && attempt >= 1)) break;
    }
  }
  throw publicRealtimeError(lastError);
}

export function primeRealtime(userId) {
  if (!userId) return Promise.resolve(null);
  if (realtimePrime?.userId === userId) return realtimePrime.promise;
  if (realtimePrime?.channel) supabase.removeChannel(realtimePrime.channel).catch(() => {});
  const state = { userId, channel: null, closed: false, promise: null };
  state.promise = subscribeRealtimeChannel(
    () => supabase.channel(`user:${userId}`, { config: { private: true, broadcast: { self: false, ack: false } } }),
    { timeoutMs: 3500 },
  ).then(async (channel) => {
    state.channel = channel;
    if (state.closed) { await supabase.removeChannel(channel).catch(() => {}); return null; }
    return channel;
  }).catch((error) => {
    if (realtimePrime === state) realtimePrime = null;
    throw error;
  });
  realtimePrime = state;
  return state.promise;
}

export function releaseRealtimePrime(userId) {
  if (!realtimePrime || realtimePrime.userId !== userId) return;
  realtimePrime.closed = true;
  if (realtimePrime.channel) supabase.removeChannel(realtimePrime.channel).catch(() => {});
  realtimePrime = null;
}
