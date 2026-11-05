import { expect, it, vi } from 'vitest';
import { activateWebPush } from '../scripts/activate-web-push.mjs';

function management(existing = {}) {
  const calls = [];
  const request = vi.fn(async (url, options) => {
    const body = options?.body instanceof FormData ? options.body : JSON.parse(options?.body || '{}');
    calls.push({ url, options, body });
    const result = String(url).endsWith('/database/query') && body.query?.includes('existing_push_config') ? [{ existing_push_config: existing, configured_public_key: existing.galaxy_vapid_public_key || '' }] : body.query?.includes('as push_ready') ? [{ push_ready: true }] : [];
    return { ok: true, status: 200, json: async () => result };
  });
  return { calls, request };
}
it('prepares SQL, private server secrets and the exact sender sources without printing credentials', async () => {
  const { calls, request } = management(); const log = vi.fn();
  await activateWebPush({ token: 'sbp_TEST', request, log });
  const secrets = calls.find((call) => String(call.url).endsWith('/secrets')).body;
  expect(secrets.map((secret) => secret.name)).toEqual(['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'PUSH_DISPATCH_SECRET']);
  expect(secrets[0].value).toHaveLength(87); expect(secrets[1].value).toHaveLength(43);
  const deploy = calls.find((call) => String(call.url).includes('/functions/deploy'));
  expect(JSON.parse(deploy.body.get('metadata'))).toMatchObject({ entrypoint_path: 'index.ts', verify_jwt: false });
  expect(deploy.body.getAll('file').map((file) => file.name)).toEqual(['index.ts', 'delivery.js']);
  const logs = JSON.stringify(log.mock.calls); expect(logs).not.toContain('sbp_TEST');
  for (const secret of secrets) expect(logs).not.toContain(secret.value);
});
it('preserves existing VAPID keys so installed devices keep working', async () => {
  const existing = { galaxy_vapid_public_key: 'B'.repeat(87), galaxy_vapid_private_key: 'x'.repeat(43), galaxy_push_dispatch_secret: 'existing-dispatch-secret' };
  const { calls, request } = management(existing);
  await activateWebPush({ token: 'sbp_TEST', request, log: vi.fn() });
  expect(calls.find((call) => String(call.url).endsWith('/secrets')).body[0].value).toBe(existing.galaxy_vapid_public_key);
});
it('does not continue after a rejected administrative request or missing token', async () => {
  const request = vi.fn(async () => ({ ok: false, status: 403 }));
  await expect(activateWebPush({ token: '', request, log: vi.fn() })).rejects.toThrow(); expect(request).not.toHaveBeenCalled();
  await expect(activateWebPush({ token: 'sbp_TEST', request, log: vi.fn() })).rejects.toThrow('403'); expect(request).toHaveBeenCalledOnce();
});
