import { loadWorkerConfig } from './config.js';
import { log } from './logger.js';
import { MacroRepository } from './repository.js';
import { TradingEconomicsClient } from './trading-economics.js';
import { ReleaseAggregator } from './macro/aggregator.js';
import { matchMacroComponent } from './macro/matcher.js';
import { isValidUnit, normalizeCalendarEvent } from './macro/normalizer.js';

const config = loadWorkerConfig();
const repository = new MacroRepository({ url: config.supabaseUrl, serviceRoleKey: config.supabaseServiceRoleKey });
let runtime = await repository.runtimeConfig().catch(() => ({ aggregationWindowMs: config.aggregationWindowMs, lateUpdateWindowMs: config.lateUpdateWindowMs }));
let processing = Promise.resolve(); let feedConnected = false; let lastSyncAt = 0;
const preReleaseTimers = new Map();

const aggregator = new ReleaseAggregator({ ...runtime, onEvaluate: async (releaseKey) => {
  const { data, error } = await repository.client.from('macro_releases').select('id').eq('release_key', releaseKey).single();
  if (error) throw error;
  const signal = await repository.evaluate(data.id, { connected: feedConnected, stale: false });
  log('info', 'Macro signal generated.', { releaseId: data.id, engine: signal.engine, signal: signal.signal,
    score: signal.galaxy_score, status: signal.status, processingMs: signal.processing_ms, version: signal.version });
}});

async function processCalendarPayload(payload, source = 'STREAM') {
  const event = normalizeCalendarEvent(payload, { source });
  const configs = await repository.configs(); const { match, reason } = matchMacroComponent(event, configs);
  const raw = await repository.recordRaw(event);
  if (raw.duplicate) { log('info', 'Duplicate macro payload ignored.', { calendarId: event.calendarId }); return { duplicate: true }; }
  if (!match) { log('info', 'Calendar event is outside the macro registry.', { calendarId: event.calendarId, reason }); return { ignored: true, reason }; }
  if (!event.scheduledAt || !isValidUnit(event)) { log('warn', 'Macro payload failed data validation.', { calendarId: event.calendarId, reason: 'INVALID_VALUE' }); return { ignored: true, reason: 'INVALID_VALUE' }; }
  const ageMs = new Date(event.receivedAt).getTime() - new Date(event.scheduledAt).getTime();
  const allowedAgeMs = 36 * 60 * 60 * 1000;
  if (event.values.actual.numericValue !== null && ageMs > allowedAgeMs) {
    log('warn', 'Macro release is outside its valid processing window.', { calendarId: event.calendarId, reason: 'STALE_DATA', ageMs });
    return { ignored: true, reason: 'STALE_DATA' };
  }
  const release = await repository.upsertRelease(event, match);
  const component = await repository.upsertComponent(release, event, match, raw.id);
  await repository.discoverIdentifier(match, event);
  if (event.values.actual.numericValue !== null) aggregator.ingest(release.release_key, { indicator: match.indicator, releaseId: release.id, component });
  return { releaseId: release.id };
}

function utcDate(offsetDays = 0) {
  const date = new Date(); date.setUTCDate(date.getUTCDate() + offsetDays); return date.toISOString().slice(0, 10);
}

async function schedulePreReleaseSyncs(events) {
  const configs = await repository.configs(); const wanted = new Set();
  for (const payload of events) {
    let event; try { event = normalizeCalendarEvent(payload, { source: 'REST_SYNC' }); } catch { continue; }
    if (!event.scheduledAt || Number(event.importance || 0) < 2 || !matchMacroComponent(event, configs).match) continue;
    for (const leadMs of [5 * 60 * 1000, 30 * 1000]) {
      const key = `${event.calendarId || event.payloadHash}:${leadMs}`; const dueIn = new Date(event.scheduledAt).getTime() - leadMs - Date.now();
      if (dueIn <= 0 || dueIn > 8 * 24 * 60 * 60 * 1000) continue;
      wanted.add(key);
      if (!preReleaseTimers.has(key)) preReleaseTimers.set(key, setTimeout(() => {
        preReleaseTimers.delete(key); syncCalendar(leadMs === 30000 ? 'pre-release-30s' : 'pre-release-5m');
      }, dueIn));
    }
  }
  for (const [key, timer] of preReleaseTimers) if (!wanted.has(key)) { clearTimeout(timer); preReleaseTimers.delete(key); }
}

async function syncCalendar(reason) {
  if (Date.now() - lastSyncAt < 15000) return;
  lastSyncAt = Date.now(); log('info', 'Starting Trading Economics REST calendar synchronization.', { reason });
  try {
    runtime = await repository.runtimeConfig();
    aggregator.aggregationWindowMs = runtime.aggregationWindowMs;
    aggregator.lateUpdateWindowMs = runtime.lateUpdateWindowMs;
    const events = await client.fetchCalendar(utcDate(-1), utcDate(7));
    await schedulePreReleaseSyncs(events);
    for (const event of events) {
      const actual = event.Actual ?? event.actual;
      await processCalendarPayload(event, actual !== null && actual !== undefined && String(actual).trim() !== '' ? 'RECONCILIATION' : 'REST_SYNC');
    }
    log('info', 'Trading Economics REST calendar synchronization completed.', { reason, events: events.length });
  } catch (error) {
    log('error', 'Trading Economics REST calendar synchronization failed.', { reason, error });
    await repository.setHealth({ last_error: error.message.slice(0, 500) }).catch(() => {});
  }
}

const client = new TradingEconomicsClient(config, {
  onOpen: async () => {
    feedConnected = true;
    await repository.setHealth({ connected: true, connected_at: new Date().toISOString(), last_heartbeat_at: new Date().toISOString(), last_error: null });
    await syncCalendar('reconnect');
  },
  onHeartbeat: () => repository.setHealth({ connected: true, last_heartbeat_at: new Date().toISOString() }),
  onMessage: (message) => {
    processing = processing.then(async () => {
      await repository.setHealth({ connected: true, last_message_at: new Date().toISOString(), last_heartbeat_at: new Date().toISOString() });
      return processCalendarPayload(message, 'STREAM');
    }).catch((error) => log('error', 'Macro calendar message processing failed.', { error }));
    return processing;
  },
  onStale: () => repository.setHealth({ connected: false, last_error: 'STALE_DATA' }).catch(() => {}),
  onClose: () => {
    feedConnected = false;
    repository.markReconnect({ connected: false, last_reconnect_at: new Date().toISOString(), last_error: 'FEED_DISCONNECTED' }).catch(() => {});
  },
});

client.start();
const syncTimer = setInterval(() => syncCalendar('scheduled'), config.restSyncIntervalMs);
const shutdown = async (signal) => {
  log('info', 'Stopping Galaxy Macro worker.', { signal }); clearInterval(syncTimer); for (const timer of preReleaseTimers.values()) clearTimeout(timer); preReleaseTimers.clear(); aggregator.close(); client.stop();
  await repository.setHealth({ connected: false, last_error: 'WORKER_STOPPED' }).catch(() => {}); process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT')); process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (error) => log('error', 'Unhandled worker rejection.', { error }));
