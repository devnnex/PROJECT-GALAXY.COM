import { mkdtemp, writeFile, readFile, access, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { activateScannerTelegram } from '../scripts/activate-scanner-telegram.mjs';

it('validates the group before configuring server-only credentials, sends no test message, and removes temporary secrets', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'galaxy-telegram-test-'));
  const tokenFile = join(temporary, 'token.txt'); const token = '123456789:abcdefghijklmnopqrstuvwxyz0123456789';
  await writeFile(tokenFile, token); const files = [], calls = [], methods = [], log = vi.fn(); let dispatch;
  try {
    const execute = vi.fn(async (_cli, args) => {
      calls.push(args);
      for (const flag of ['--env-file', '--file']) {
        const index = args.indexOf(flag);
        if (index >= 0 && !args[index + 1].includes('migrations')) {
          const path = args[index + 1]; files.push(path); const content = await readFile(path, 'utf8');
          if (flag === '--env-file') { expect(content).toContain(`TELEGRAM_BOT_TOKEN=${token}`); expect(content).toContain('TELEGRAM_CHAT_ID=-100123'); dispatch = content.match(/TELEGRAM_DISPATCH_SECRET=(\S+)/)[1]; }
          else { expect(content).toContain('enabled=true'); expect(content).not.toContain('scanner_streams'); }
        }
      }
      return { stdout: '{}' };
    });
    const request = vi.fn(async (url) => {
      const method = url.split('/').at(-1); methods.push(method);
      const data = { getMe: { id: 1, is_bot: true, username: 'ExampleBot' }, getUpdates: [{ message: { chat: { id: -100123, title: 'Galaxy', type: 'supergroup' } } }], getChat: { id: -100123, title: 'Galaxy', type: 'supergroup' }, getChatMember: { status: 'administrator' } };
      return { ok: true, json: async () => ({ ok: true, result: data[method] }) };
    });
    await activateScannerTelegram({ enable: true, tokenFile, request, execute, log });
    expect(methods).toEqual(['getMe', 'getUpdates', 'getChat', 'getChatMember']);
    expect(calls.find((args) => args[0] === 'functions')).toContain('scanner-telegram');
    for (const value of [token, dispatch]) { expect(JSON.stringify(calls)).not.toContain(value); expect(JSON.stringify(log.mock.calls)).not.toContain(value); }
    for (const path of files) await expect(access(path)).rejects.toThrow();
  } finally { await unlink(tokenFile); await rmdir(temporary); }
});

it('does not configure Supabase or publish to an ambiguous group', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'galaxy-telegram-test-')); const tokenFile = join(temporary, 'token.txt');
  await writeFile(tokenFile, '123456789:abcdefghijklmnopqrstuvwxyz0123456789'); const execute = vi.fn();
  try {
    const request = async (url) => ({ ok: true, json: async () => ({ ok: true, result: url.endsWith('getMe') ? { id: 1, is_bot: true, username: 'ExampleBot' } : [] }) });
    await expect(activateScannerTelegram({ tokenFile, request, execute })).rejects.toThrow('Añade @ExampleBot');
    expect(execute).not.toHaveBeenCalled();
  } finally { await unlink(tokenFile); await rmdir(temporary); }
});
