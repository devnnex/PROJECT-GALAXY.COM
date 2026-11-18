import { afterEach, expect, it, vi } from 'vitest';
import { watchVisibleResource } from '../src/services/visible-refresh';

afterEach(() => vi.useRealTimers());
it('coalesces Realtime bursts, stops hidden-tab polling and refreshes immediately on return', async () => {
  vi.useFakeTimers();
  const target = new EventTarget(); target.hidden = false; const host = new EventTarget();
  const load = vi.fn(async () => 'data'), onData = vi.fn();
  const watcher = watchVisibleResource({ load, onData, target, host });
  await vi.advanceTimersByTimeAsync(0); expect(load).toHaveBeenCalledTimes(1);
  watcher.refresh(); watcher.refresh(); watcher.refresh();
  await vi.advanceTimersByTimeAsync(150); expect(load).toHaveBeenCalledTimes(2);
  target.hidden = true; target.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(60_000); expect(load).toHaveBeenCalledTimes(2);
  target.hidden = false; target.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(0); expect(load).toHaveBeenCalledTimes(3);
  watcher.stop(); host.dispatchEvent(new Event('online')); await vi.advanceTimersByTimeAsync(60_000);
  expect(load).toHaveBeenCalledTimes(3);
});
it('prevents overlapping requests and ignores late responses after leaving a page', async () => {
  vi.useFakeTimers(); const target = new EventTarget(); const host = new EventTarget();
  let finish; const load = vi.fn(() => new Promise((resolve) => { finish = resolve; })); const onData = vi.fn();
  const watcher = watchVisibleResource({ load, onData, target, host });
  watcher.refresh(); await vi.advanceTimersByTimeAsync(150); expect(load).toHaveBeenCalledTimes(1);
  watcher.stop(); finish('late'); await vi.advanceTimersByTimeAsync(1000);
  expect(onData).not.toHaveBeenCalled(); expect(load).toHaveBeenCalledTimes(1);
});
