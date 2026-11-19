import { expect, it, vi } from 'vitest';
import { anchorViewportBottom } from '../src/services/viewport-bottom';

function fixture() {
  const host = new EventTarget(), viewport = new EventTarget();
  Object.assign(viewport, { scale: 1, height: 760, offsetTop: 0 });
  let bottom = 844, frame, applied = 0, mobile = true;
  Object.assign(host, { visualViewport: viewport, matchMedia: () => ({ matches: mobile }), requestAnimationFrame: vi.fn((fn) => { frame = fn; return 1; }), cancelAnimationFrame: vi.fn() });
  const element = { getBoundingClientRect: () => ({ height: mobile ? 64 : 0, bottom: bottom + applied }), style: {
    setProperty: vi.fn((_key, value) => { applied = parseFloat(value); }), removeProperty: vi.fn(() => { applied = 0; }),
  } };
  return { host, viewport, element, run: () => { const fn = frame; frame = null; fn?.(); }, bottom: (value) => { bottom = value; }, desktop: () => { mobile = false; }, shift: () => applied };
}

it('anchors through dynamic toolbar movement without accumulating corrections', () => {
  const f = fixture(); const stop = anchorViewportBottom(f.element, f.host); f.run();
  expect(f.shift()).toBe(-84);
  f.viewport.dispatchEvent(new Event('scroll')); f.run(); expect(f.shift()).toBe(-84);
  f.viewport.height = 844; f.viewport.dispatchEvent(new Event('resize')); f.run(); expect(f.shift()).toBe(0);
  f.viewport.height = 760; f.bottom(760); f.host.dispatchEvent(new Event('scroll')); f.run(); expect(f.shift()).toBe(0);
  f.viewport.offsetTop = 8; f.viewport.dispatchEvent(new Event('scroll')); f.run(); expect(f.shift()).toBe(8);
  stop();
});

it('coalesces scroll bursts into one animation frame and releases all listeners', () => {
  const f = fixture(); const stop = anchorViewportBottom(f.element, f.host);
  for (let i = 0; i < 100; i++) { f.viewport.dispatchEvent(new Event('scroll')); f.host.dispatchEvent(new Event('scroll')); }
  expect(f.host.requestAnimationFrame).toHaveBeenCalledOnce();
  stop(); expect(f.host.cancelAnimationFrame).toHaveBeenCalledOnce();
  f.run(); expect(f.element.style.setProperty).not.toHaveBeenCalled();
  f.host.dispatchEvent(new Event('resize')); expect(f.host.requestAnimationFrame).toHaveBeenCalledOnce();
});

it('leaves pinch zoom and desktop navigation to native browser layout', () => {
  const f = fixture(); const stop = anchorViewportBottom(f.element, f.host); f.run();
  f.viewport.scale = 2; f.viewport.dispatchEvent(new Event('resize')); f.run(); expect(f.shift()).toBe(0);
  f.viewport.scale = 1; f.desktop(); f.host.dispatchEvent(new Event('resize')); f.run(); expect(f.shift()).toBe(0);
  stop(); expect(() => anchorViewportBottom({}, {})()).not.toThrow();
});
