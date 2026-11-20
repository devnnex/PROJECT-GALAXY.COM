import { expect, it, vi } from 'vitest';
import { updateBlackGalaxy } from '../scripts/update-black-galaxy.mjs';

it('updates only the new migration and the two scanner delivery functions without rotating secrets or resetting the stream', async () => {
  const execute = vi.fn(async () => ({ stdout: '{}' }));
  await updateBlackGalaxy({ execute, log: vi.fn() });
  const calls = execute.mock.calls.map((call) => call[1]);
  expect(calls).toHaveLength(7);
  expect(calls[0].join(' ')).toContain('20261118010000_scanner_speed_and_analytics.sql');
  expect(calls[1].join(' ')).toContain('20261118170000_scanner_target_scenarios.sql');
  expect(calls[2].join(' ')).toContain('20261119210000_range777_strategy.sql');
  expect(calls[3].join(' ')).toContain('20261120120000_strategy_controls_fast_telegram.sql');
  expect(calls[4].join(' ')).toContain('20261120160000_strategy_access_and_instant_delivery.sql');
  expect(calls[5]).toContain('scanner-signals'); expect(calls[6]).toContain('push-notifications');
  expect(calls.flat()).not.toContain('secrets'); expect(calls.flat()).not.toContain('--prune');
  expect(calls.flat()).not.toContain('--enable');
});
it('stops on a failed server update rather than reporting it as deployed', async () => {
  const execute = vi.fn(async () => { throw new Error('private response'); });
  await expect(updateBlackGalaxy({ execute, log: vi.fn() })).rejects.toThrow('No publiques el frontend');
  expect(execute).toHaveBeenCalledTimes(1);
});
