import { describe, expect, it } from 'vitest';
import { normalizeCalendarEvent, normalizeKeys, parseProviderNumber } from '../worker/macro/normalizer.js';

describe('Trading Economics normalization', () => {
  it.each([
    ['0.4%', .4], ['-0.2%', -.2], ['162K', 162000], ['1.2M', 1200000], ['(1.5K)', -1500], [null, null], ['null', null], ['', null],
  ])('parses %s as %s', (raw, expected) => expect(parseProviderNumber(raw)).toBe(expected));

  it('normalizes trimmed case-insensitive provider keys and keeps raw values', () => {
    const event = normalizeCalendarEvent({ Event: 'CPI MoM', Country: 'United States', ' Forecast ': '0.4%', ACTUAL: '0.2%', Previous: '0.1%', Date: '2026-09-11T12:30:00Z', CalendarId: '42', Unit: '%' });
    expect(event.values.forecast).toEqual({ rawValue: '0.4%', numericValue: .4, unit: '%' });
    expect(event.values.actual.numericValue).toBe(.2);
    expect(event.originalPayload[' Forecast ']).toBe('0.4%');
    expect(event.scheduledAt).toBe('2026-09-11T12:30:00.000Z');
  });

  it('uses REST numeric value fields without losing formatted raw values', () => {
    const event = normalizeCalendarEvent({ Event: 'Non Farm Payrolls', Country: 'United States', Actual: '162', ActualValue: 162000, Forecast: '150', ForecastValue: 150000, Date: '2026-09-04T12:30:00', Unit: 'K' });
    expect(event.values.actual).toMatchObject({ rawValue: '162', numericValue: 162000, unit: 'K' });
    expect(event.values.forecast.numericValue).toBe(150000);
  });

  it('maps Forecast, forecast and forecast-with-space to one key', () => {
    expect(normalizeKeys({ Forecast: 1 })?.forecast).toBe(1);
    expect(normalizeKeys({ 'forecast ': 2 })?.forecast).toBe(2);
    expect(normalizeKeys({ forecast: 3 })?.forecast).toBe(3);
  });

  it('creates the same idempotency hash for equivalent replay payloads', () => {
    const base = { CalendarId: '99', Event: 'CPI MoM', Country: 'United States', Actual: '0.2%', Forecast: '0.3%', Date: '2026-09-11T12:30:00Z' };
    const first = normalizeCalendarEvent(base, { receivedAt: '2026-09-11T12:30:01Z' });
    const replay = normalizeCalendarEvent({ ...base, ' Forecast ': base.Forecast, Forecast: undefined }, { receivedAt: '2026-09-11T12:31:01Z' });
    expect(replay.payloadHash).toBe(first.payloadHash);
  });
});
