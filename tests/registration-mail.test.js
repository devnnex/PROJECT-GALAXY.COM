import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { expect, it } from 'vitest';

it('sends invitations only for the configured origin and secret, once per token', () => {
  const sent = []; const cache = new Map();
  const secret = 'a-secret-with-more-than-thirty-two-characters';
  const props = { GALAXY_INVITATION_KEY: secret, APP_REGISTRATION_URL: 'https://example.com/app.html' };
  const context = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => props[key] }) },
    Utilities: { DigestAlgorithm: { SHA_256: 'SHA_256' }, computeDigest: (_, value) => [...createHash('sha256').update(value).digest()] },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: key => cache.get(key), put: (key,value) => cache.set(key,value) }) },
    ContentService: { MimeType: { JSON: 'JSON' }, createTextOutput: text => ({ text, setMimeType() { return this; } }) },
    MailApp: { getRemainingDailyQuota: () => 10, sendEmail: message => sent.push(message) },
  };
  vm.runInNewContext(readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8'),context);
  const payload = { key: secret, email: 'invited@example.com', link: props.APP_REGISTRATION_URL + '#registration=' + 'a'.repeat(64), expiresAt: new Date(Date.now()+420000).toISOString(), planName: 'Monthly' };
  expect(() => context.sendRegistrationInvitation_({ ...payload, key: 'wrong' })).toThrow();
  expect(() => context.sendRegistrationInvitation_({ ...payload, link: payload.link.replace('example.com','attacker.com') })).toThrow();
  expect(() => context.sendRegistrationInvitation_({ ...payload, expiresAt: 'invalid' })).toThrow();
  context.sendRegistrationInvitation_(payload); context.sendRegistrationInvitation_(payload);
  expect(sent).toHaveLength(1); expect(sent[0].to).toBe(payload.email); expect(sent[0].body).toContain(payload.link);
});
