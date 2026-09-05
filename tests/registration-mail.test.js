import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { expect, it } from 'vitest';

it('sends only invitations validated by Supabase, once per token', () => {
  const sent = []; const cache = new Map();
  let invitationValid = true;
  const context = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => props[key] }) },
    Utilities: { DigestAlgorithm: { SHA_256: 'SHA_256' }, computeDigest: (_, value) => [...createHash('sha256').update(value).digest()] },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: key => cache.get(key), put: (key,value) => cache.set(key,value) }) },
    ContentService: { MimeType: { JSON: 'JSON' }, createTextOutput: text => ({ text, setMimeType() { return this; } }) },
    MailApp: { getRemainingDailyQuota: () => 10, sendEmail: message => sent.push(message) },
    UrlFetchApp: { fetch: () => ({
      getResponseCode: () => invitationValid ? 200 : 400,
      getContentText: () => invitationValid ? JSON.stringify({ email: 'invited@example.com', planName: 'Monthly', expires_at: new Date(Date.now() + 420000).toISOString() }) : JSON.stringify({ message: 'Invitación inválida.' }),
    }) },
  };
  vm.runInNewContext(readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8'),context);
  const payload = { token: 'a'.repeat(64) };
  expect(() => context.sendRegistrationInvitation_({ token: 'invalid' })).toThrow();
  invitationValid = false;
  expect(() => context.sendRegistrationInvitation_(payload)).toThrow('Invitación inválida');
  invitationValid = true;
  context.sendRegistrationInvitation_(payload); context.sendRegistrationInvitation_(payload);
  expect(sent).toHaveLength(1); expect(sent[0].to).toBe('invited@example.com'); expect(sent[0].body).toContain('#registration=' + payload.token);
});
