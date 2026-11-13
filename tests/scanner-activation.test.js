import { access, readFile } from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
import { activateScanner } from '../scripts/activate-scanner.mjs';

it('deploys only the scanner, removes private files, and keeps its dispatch credential out of arguments and logs', async () => {
  const files = []; const calls = []; let credential;
  const execute = vi.fn(async (_cli, args) => {
    calls.push(args);
    for (const flag of ['--env-file', '--file']) {
      const index = args.indexOf(flag);
      if (index >= 0 && !args[index + 1].includes('migrations')) {
        const path = args[index + 1]; files.push(path);
        const contents = await readFile(path, 'utf8');
        if (flag === '--env-file') credential = contents.match(/SCANNER_DISPATCH_SECRET=(\S+)/)[1];
      }
    }
    return { stdout: '{}' };
  });
  const request = vi.fn(async (_url, options) => {
    expect(options.headers['x-galaxy-scanner-secret']).toBe(credential);
    return { ok: true, json: async () => ({ quote: { price: 3880, at: Date.now() } }) };
  });
  const log = vi.fn();
  await activateScanner({ request, execute, log });
  expect(calls.find((args) => args[0] === 'functions')).toContain('scanner-signals');
  expect(calls.some((args) => args.some((value) => value.endsWith('20261113131000_scanner_notice_symbols.sql')))).toBe(true);
  expect(JSON.stringify(calls)).not.toContain(credential); expect(JSON.stringify(log.mock.calls)).not.toContain(credential);
  expect(calls.flat()).not.toContain('--prune');
  expect(calls.some((args) => args.some((value) => value.endsWith('enable.sql')))).toBe(false);
  for (const file of files) await expect(access(file)).rejects.toThrow();
});
