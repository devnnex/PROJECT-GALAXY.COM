import { createClient } from '@supabase/supabase-js';
import { evaluateMacroRelease } from './macro/engine.js';

const snakeConfig = (row) => ({
  engine: row.engine, indicator: row.indicator, label: row.label, aliases: row.aliases || [], ticker: row.ticker, symbol: row.symbol,
  weight: Number(row.weight), directionForGold: Number(row.direction_for_gold), surpriseThreshold: Number(row.surprise_threshold),
  required: row.required, priority: row.priority, enabled: row.enabled,
});

export class MacroRepository {
  constructor({ url, serviceRoleKey }) {
    this.client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    this.configCache = null; this.configCachedAt = 0;
  }

  async configs(force = false) {
    if (!force && this.configCache && Date.now() - this.configCachedAt < 30000) return this.configCache;
    const { data, error } = await this.client.from('macro_engine_config').select('*').order('engine').order('priority');
    if (error) throw error;
    this.configCache = data.map(snakeConfig); this.configCachedAt = Date.now(); return this.configCache;
  }

  async runtimeConfig() {
    const { data, error } = await this.client.from('macro_runtime_config').select('*').eq('id', true).single();
    if (error) throw error;
    return { aggregationWindowMs: data.aggregation_window_ms, lateUpdateWindowMs: data.late_update_window_ms, allowTeForecastFallback: data.allow_te_forecast_fallback };
  }

  async recordRaw(event) {
    const row = { provider: event.provider, source: event.source, calendar_id: event.calendarId, payload: event.originalPayload,
      normalized_payload: event, scheduled_at: event.scheduledAt, provider_updated_at: event.providerUpdatedAt,
      received_at: event.receivedAt, payload_hash: event.payloadHash };
    const { data, error } = await this.client.from('macro_raw_events').insert(row).select('id').single();
    if (error?.code === '23505') return { duplicate: true, id: null };
    if (error) throw error;
    return { duplicate: false, id: data.id };
  }

  async upsertRelease(event, match) {
    const scheduledAt = event.scheduledAt || event.receivedAt;
    const releaseKey = `${match.engine}:${scheduledAt}`;
    const finalAt = new Date(new Date(event.receivedAt).getTime() + 3000).toISOString();
    const { data: existing, error: existingError } = await this.client.from('macro_releases').select('*').eq('release_key', releaseKey).maybeSingle();
    if (existingError) throw existingError;
    if (existing) return existing;
    const row = { engine: match.engine, release_key: releaseKey, release_date: scheduledAt.slice(0, 10),
      reference_period: event.reference, country: event.country, scheduled_at: scheduledAt,
      status: event.values.actual.numericValue === null ? 'WAITING' : 'PRELIMINARY', late_update_deadline: finalAt };
    const { data, error } = await this.client.from('macro_releases').insert(row).select('*').single();
    if (error?.code === '23505') {
      const { data: raced, error: raceError } = await this.client.from('macro_releases').select('*').eq('release_key', releaseKey).single();
      if (raceError) throw raceError;
      return raced;
    }
    if (error) throw error;
    return data;
  }

  async upsertComponent(release, event, match, rawEventId) {
    const isLive = event.source === 'STREAM' || event.source === 'RECONCILIATION';
    const values = event.values;
    const row = { release_id: release.id, raw_event_id: rawEventId, calendar_id: event.calendarId, indicator: match.indicator,
      label: match.label, actual_raw: values.actual.rawValue, actual: values.actual.numericValue,
      forecast_raw: values.forecast.rawValue, forecast: values.forecast.numericValue,
      previous_raw: values.previous.rawValue, previous: values.previous.numericValue,
      revised_raw: values.revised.rawValue, revised: values.revised.numericValue,
      te_forecast_raw: values.teForecast.rawValue, te_forecast: values.teForecast.numericValue,
      unit: event.unit || '', weight: match.weight, direction_for_gold: match.directionForGold,
      surprise_threshold: match.surpriseThreshold, required: match.required, provider_timestamp: event.providerUpdatedAt,
      received_at: event.receivedAt, ticker: event.ticker, symbol: event.symbol,
      ...(isLive ? { forecast_live: values.forecast.numericValue } : { forecast_pre_release: values.forecast.numericValue }),
    };
    const { data, error } = await this.client.from('macro_release_components').upsert(row, { onConflict: 'release_id,indicator' }).select('*').single();
    if (error) throw error;
    await this.client.from('macro_releases').update({ updated_at: new Date().toISOString() }).eq('id', release.id);
    return data;
  }

  async discoverIdentifier(match, event) {
    if ((!event.ticker && !event.symbol) || (match.ticker && match.symbol)) return;
    const { error } = await this.client.from('macro_engine_config').update({ ticker: event.ticker || match.ticker, symbol: event.symbol || match.symbol,
      provider_mapping_verified_at: new Date().toISOString() }).eq('engine', match.engine).eq('indicator', match.indicator);
    if (error) throw error;
    this.configCachedAt = 0;
  }

  async evaluate(releaseId, feedHealth, generatedAt = new Date()) {
    const [{ data: release, error: releaseError }, { data: rows, error: componentError }, configs] = await Promise.all([
      this.client.from('macro_releases').select('*').eq('id', releaseId).single(),
      this.client.from('macro_release_components').select('*').eq('release_id', releaseId), this.configs(),
    ]);
    if (releaseError) throw releaseError; if (componentError) throw componentError;
    const components = rows.filter((row) => row.actual !== null).map((row) => ({
      indicator: row.indicator, actual: Number(row.actual), forecast: row.forecast === null ? null : Number(row.forecast),
      previous: row.previous === null ? null : Number(row.previous), revised: row.revised === null ? null : Number(row.revised),
      unit: row.unit, receivedAt: row.received_at,
    }));
    const releaseAgeMs = new Date(generatedAt).getTime() - new Date(release.scheduled_at).getTime();
    const result = evaluateMacroRelease({ engine: release.engine, country: release.country, components }, configs,
      { feedHealth: { ...feedHealth, stale: feedHealth.stale || releaseAgeMs > 5 * 60 * 1000 }, generatedAt });
    const { data: latest } = await this.client.from('macro_signals').select('version').eq('release_id', releaseId).order('version', { ascending: false }).limit(1).maybeSingle();
    const version = (latest?.version || 0) + 1;
    const row = { release_id: releaseId, engine: release.engine, signal: result.signal, galaxy_score: result.galaxyScore,
      confidence: result.confidence, status: result.status, reason: result.reason, explanation: result.explanation,
      component_scores: result.componentScores, rules_snapshot: configs.filter((item) => item.engine === release.engine),
      received_at: result.receivedAt, generated_at: result.generatedAt,
      network_release_latency_ms: result.receivedAt ? new Date(result.receivedAt).getTime() - new Date(release.scheduled_at).getTime() : null,
      processing_ms: result.processingMs, version,
      engine_version: result.engineVersion };
    const { data: signal, error } = await this.client.from('macro_signals').insert(row).select('*').single();
    if (error) throw error;
    await this.client.from('macro_releases').update({ status: result.status, received_components: result.componentScores,
      updated_at: result.generatedAt }).eq('id', releaseId);
    return signal;
  }

  async setHealth(patch) {
    const { error } = await this.client.from('macro_feed_health').upsert({ provider: 'TRADING_ECONOMICS', ...patch }, { onConflict: 'provider' });
    if (error) throw error;
  }

  async markReconnect(patch = {}) {
    const { data, error } = await this.client.from('macro_feed_health').select('reconnect_count').eq('provider', 'TRADING_ECONOMICS').single();
    if (error) throw error;
    return this.setHealth({ ...patch, reconnect_count: Number(data.reconnect_count || 0) + 1 });
  }
}
