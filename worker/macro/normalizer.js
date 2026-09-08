import { createHash } from 'node:crypto';

const NULL_VALUES = new Set(['', 'null', 'none', 'n/a', 'na', '-', '--']);

export function normalizeKey(key) {
  return String(key ?? '').trim().toLowerCase();
}

export function normalizeKeys(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [normalizeKey(key), value]));
}

export function normalizeName(value) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function parseProviderNumber(rawValue) {
  if (rawValue === null || rawValue === undefined || NULL_VALUES.has(String(rawValue).trim().toLowerCase())) return null;
  if (typeof rawValue === 'number') return Number.isFinite(rawValue) ? rawValue : null;
  const compact = String(rawValue).trim().replace(/,/g, '').replace(/\s+/g, '');
  const negativeParentheses = compact.startsWith('(') && /\)(?:%|[KMBT])?$/i.test(compact);
  const numericText = negativeParentheses ? compact.replace(/^\(/, '').replace(/\)(?=(?:%|[KMBT])?$)/i, '') : compact;
  const match = numericText.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(%|[KMBT])?$/i);
  if (!match) return null;
  const multiplier = ({ k: 1e3, m: 1e6, b: 1e9, t: 1e12 })[(match[2] || '').toLowerCase()] || 1;
  const value = Number(match[1]) * multiplier * (negativeParentheses ? -1 : 1);
  return Number.isFinite(value) ? value : null;
}

function parseTimestamp(value) {
  if (!value || NULL_VALUES.has(String(value).trim().toLowerCase())) return null;
  const raw = String(value).trim();
  const explicitUtc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(raw) ? `${raw}Z` : raw;
  const date = new Date(explicitUtc);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function rawField(payload, key) {
  const value = payload[key];
  return value === undefined || value === null || NULL_VALUES.has(String(value).trim().toLowerCase()) ? null : String(value).trim();
}

export function normalizeCalendarEvent(originalPayload, { receivedAt = new Date(), source = 'STREAM' } = {}) {
  if (!originalPayload || typeof originalPayload !== 'object' || Array.isArray(originalPayload)) throw new TypeError('Calendar payload must be an object.');
  const payload = normalizeKeys(originalPayload);
  const actualRaw = rawField(payload, 'actual');
  const forecastRaw = rawField(payload, 'forecast');
  const previousRaw = rawField(payload, 'previous');
  const revisedRaw = rawField(payload, 'revised');
  const teForecastRaw = rawField(payload, 'teforecast');
  const scheduledAt = parseTimestamp(payload.date);
  const providerUpdatedAt = parseTimestamp(payload.lastupdate || payload.updated_at || payload.provider_updated_at);
  const calendarId = rawField(payload, 'calendarid');
  const normalized = {
    provider: 'TRADING_ECONOMICS', source, calendarId,
    event: rawField(payload, 'event'), country: rawField(payload, 'country'), category: rawField(payload, 'category'),
    ticker: rawField(payload, 'ticker'), symbol: rawField(payload, 'symbol'), topic: rawField(payload, 'topic'),
    reference: rawField(payload, 'reference'), referenceDate: parseTimestamp(payload.referencedate),
    importance: parseProviderNumber(payload.importance), unit: rawField(payload, 'unit'),
    scheduledAt, providerUpdatedAt, receivedAt: new Date(receivedAt).toISOString(),
    values: {
      actual: { rawValue: actualRaw, numericValue: parseProviderNumber(payload.actualvalue ?? actualRaw), unit: rawField(payload, 'unit') },
      forecast: { rawValue: forecastRaw, numericValue: parseProviderNumber(payload.forecastvalue ?? forecastRaw), unit: rawField(payload, 'unit') },
      previous: { rawValue: previousRaw, numericValue: parseProviderNumber(payload.previousvalue ?? previousRaw), unit: rawField(payload, 'unit') },
      revised: { rawValue: revisedRaw, numericValue: parseProviderNumber(revisedRaw), unit: rawField(payload, 'unit') },
      teForecast: { rawValue: teForecastRaw, numericValue: parseProviderNumber(payload.teforecastvalue ?? teForecastRaw), unit: rawField(payload, 'unit') },
    },
    originalPayload,
  };
  normalized.payloadHash = createHash('sha256').update(JSON.stringify(normalizeForHash(normalized))).digest('hex');
  return normalized;
}

function normalizeForHash(event) {
  return {
    calendarId: event.calendarId, event: event.event, country: event.country, category: event.category,
    ticker: event.ticker, symbol: event.symbol, scheduledAt: event.scheduledAt,
    providerUpdatedAt: event.providerUpdatedAt, values: event.values,
  };
}

export function isValidUnit(event) {
  if (!event?.unit) return event?.values?.actual?.numericValue !== null;
  return ['%', 'percent', 'percentage points', 'k', 'm', 'b', 't', 'index', 'points', ''].includes(event.unit.trim().toLowerCase());
}
