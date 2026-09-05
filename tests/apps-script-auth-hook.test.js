import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const code = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../apps-script/appsscript.json', import.meta.url), 'utf8'));

function hookRuntime() {
  const sent = [];
  const cache = new Map();
  const properties = new Map([
    ['GALAXY_HOOK_KEY', 'test-hook-key-with-at-least-32-characters'],
    ['SUPABASE_URL', 'https://project-ref.supabase.co'],
    ['APP_REDIRECT_URL', 'https://example.com/dist/index.html'],
  ]);
  const output = (text) => ({ text, setMimeType() { return this; } });
  const context = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => properties.get(key) }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      computeDigest: (_algorithm, value) => [...createHash('sha256').update(String(value)).digest()],
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: (key) => cache.get(key), put: (key, value) => cache.set(key, value) }) },
    MailApp: { getRemainingDailyQuota: () => 100, sendEmail: (message) => sent.push(message) },
    ContentService: { MimeType: { JSON: 'JSON' }, createTextOutput: output },
    console,
  };
  vm.runInNewContext(code, context);
  return { context, sent };
}

describe('Apps Script Supabase Auth mail hook', () => {
  it('keeps account confirmation in Supabase without privileged credentials', () => {
    expect(code).toContain("supabaseUrl + '/auth/v1/verify?token='");
    expect(code).toContain("'&type=' + encodeURIComponent(action)");
    expect(code).not.toMatch(/service[_-]?role|sb_secret_|SUPABASE_SERVICE/i);
  });

  it('validates the shared secret and immutable Auth fields before sending', () => {
    expect(code).toContain("requireProperty_(properties, 'GALAXY_HOOK_KEY')");
    expect(code).toContain('expectedKey.length < 32');
    expect(code).toContain('constantTimeEqual_');
    expect(code).toContain("requireHttpsUrl_(requireProperty_(properties, 'SUPABASE_URL'), 'SUPABASE_URL')");
    expect(code).toContain('normalizeUrl_(payloadSiteUrl) !== normalizeUrl_(redirectUrl)');
    expect(code).toContain('isUuid_(user.id)');
    expect(code).toContain('isTokenHash_');
  });

  it('limits mail scope, duplicates and quota consumption', () => {
    expect(manifest.oauthScopes).toEqual(['https://www.googleapis.com/auth/script.send_mail']);
    expect(code).toContain('CacheService.getScriptCache()');
    expect(code).toContain('lock.tryLock(500)');
    expect(code).toContain('MailApp.getRemainingDailyQuota()');
    expect(code).toContain('MailApp.sendEmail({');
    expect(code).not.toMatch(/GmailApp|service[_-]?role/i);
    expect(code).toContain("'/rest/v1/rpc/get_registration_invitation'");
  });

  it('turns a valid signup hook into a Supabase-owned confirmation link', () => {
    const { context, sent } = hookRuntime();
    const payload = {
      user: { id: '8484b834-f29e-4af2-bf42-80644d154f76', email: 'person@example.com' },
      email_data: {
        token: '305805',
        token_hash: '7d5b7b1964cf5d388340a7f04f1dbb5eeb6c7b52ef8270e1737a58d0',
        redirect_to: 'https://example.com/dist/index.html',
        email_action_type: 'signup',
        site_url: 'https://example.com/dist/index.html',
      },
    };

    context.doPost({
      parameter: { hook_key: 'test-hook-key-with-at-least-32-characters' },
      postData: { contents: JSON.stringify(payload) },
    });

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('person@example.com');
    expect(sent[0].htmlBody).toContain('https://project-ref.supabase.co/auth/v1/verify?token=');
    expect(sent[0].htmlBody).toContain('&amp;type=signup&amp;redirect_to=');
  });

  it('rejects requests that do not know the independent hook key', () => {
    const { context, sent } = hookRuntime();
    expect(() => context.doPost({ parameter: { hook_key: 'wrong' }, postData: { contents: '{}' } }))
      .toThrow('Solicitud de hook no autorizada.');
    expect(sent).toHaveLength(0);
  });
});
