import { expect, it, vi, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScannerNotice, TradeLevels } from '../src/components/BlackGalaxyTrade';
import { scannerNoticeBatch } from '../src/services/scanner-notices';
vi.mock('../src/services/api', () => ({ api: { getBlackGalaxyTrade: vi.fn() } }));

it('does not replay old notices on login, duplicates, read notices or another account history', () => {
  const now = Date.now(); const notice = (id, extra = {}) => ({ id, type: 'SCANNER_SIGNAL', createdAt: new Date(now).toISOString(), ...extra });
  const initial = scannerNoticeBatch(null, [notice('old')], 'member', now);
  expect(initial.fresh).toEqual([]);
  const next = scannerNoticeBatch(initial.cursor, [notice('new'), notice('old'), notice('read', { readAt: 'now' }), notice('stale', { createdAt: new Date(now - 180_000).toISOString() })], 'member', now);
  expect(next.fresh.map((item) => item.id)).toEqual(['new']);
  expect(scannerNoticeBatch(next.cursor, [notice('new')], 'member', now).fresh).toEqual([]);
  expect(scannerNoticeBatch(next.cursor, [notice('new')], 'other-member', now).fresh).toEqual([]);
});
it('formats all fixed levels and reached check marks in both the signal and the notice', () => {
  const trade = { entry: 3881.625, sl: 3872.933, tp1: 3886.625, tp2: 3891.625, tp3: 3896.625, hit1: true };
  const html = renderToStaticMarkup(<TradeLevels trade={trade} />);
  for (const value of ['3,881.625', '3,872.933', '3,886.625', '3,891.625', '3,896.625']) expect(html).toContain(value);
  const notice = renderToStaticMarkup(<ScannerNotice notice={{ title: 'BUY XAUUSD · 5m', body: 'Entrada 3881.625 | SL 3872.933 | TP1 3886.625 | TP2 3891.625 | TP3 3896.625' }} />);
  expect(notice).toContain('BLACK GALAXY TRADE'); expect(notice).toContain('3,896.625'); expect(notice).toContain('role="status"');
});

afterEach(() => vi.unstubAllGlobals());
it('plays distinct sounds only after a user enables audio and respects mute', async () => {
  vi.resetModules();
  const storage = new Map(); const frequencies = [];
  vi.stubGlobal('localStorage', { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) });
  class Audio {
    state = 'suspended'; currentTime = 0; destination = {};
    async resume() { this.state = 'running'; }
    createOscillator() { const value = { frequency: {}, connect() {}, disconnect() {}, start() { frequencies.push(value.frequency.value); }, stop() {} }; return value; }
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
  }
  vi.stubGlobal('AudioContext', Audio);
  const module = await import('../src/services/scanner-audio');
  expect(module.playScannerSound()).toBe(false);
  expect(await module.setScannerSound(true)).toBe(true); expect(frequencies).toHaveLength(2);
  module.playScannerSound('TP1'); expect(frequencies).toHaveLength(5);
  await module.setScannerSound(false); expect(module.playScannerSound('SL')).toBe(false); expect(frequencies).toHaveLength(5);
});
