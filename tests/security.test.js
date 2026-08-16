import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const html = read('../app.html');
const runtime = read('../src/runtime-config.js');
const meeting = read('../src/components/MeetingStudio.jsx');
const schema = read('../supabase/schema.sql');
const workflow = read('../.github/workflows/deploy-pages.yml');
const confirmationEmail = read('../supabase/templates/confirmation.html');

describe('Production security guardrails', () => {
  it('enforces a restrictive browser content policy', () => {
    expect(html).toContain("default-src 'self'");
    expect(html).toContain("script-src 'self'");
    expect(html).toContain("object-src 'none'");
    expect(html).toContain('https://xdsqtuubsptpzwadecha.supabase.co');
    expect(html).not.toContain("'unsafe-eval'");
  });

  it('contains only an anonymous browser key', () => {
    expect(runtime).toContain('SUPABASE_ANON_KEY');
    expect(runtime).not.toMatch(/SERVICE_ROLE|SUPABASE_SECRET|sb_secret_/i);
    const token = runtime.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)?.[1];
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    expect(payload.role).toBe('anon');
  });

  it('never stores a meeting password in browser storage', () => {
    expect(meeting).not.toMatch(/passwordKey|sessionStorage/);
    expect(schema).toContain('v_member.id is null and v_meeting.password_hash is not null');
  });

  it('uses least-privilege database defaults and immutable action references', () => {
    expect(schema).toContain('revoke usage on schema public from anon;');
    expect(schema).toContain('alter default privileges in schema public revoke execute on functions from public, anon;');
    for (const reference of workflow.matchAll(/uses:\s+([^\s#]+)/g)) {
      expect(reference[1]).toMatch(/@[a-f0-9]{40}$/);
    }
  });

  it('ships a branded confirmation template without privileged data', () => {
    expect(confirmationEmail).toContain('{{ .ConfirmationURL }}');
    expect(confirmationEmail).toContain('PROJECT GALAXY');
    expect(confirmationEmail).not.toMatch(/supabase|service_role|sb_secret_/i);
    expect(confirmationEmail).not.toMatch(/<script|https?:\/\/[^"']+\.(?:js|png|jpg|svg)/i);
  });
});
