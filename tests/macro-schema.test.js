import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(new URL('../supabase/migrations/202609070001_galaxy_macro_live.sql', import.meta.url), 'utf8');

describe('Galaxy Macro Supabase contract', () => {
  it('stores raw payloads, four timestamps, rule snapshots and versioned signals', () => {
    for (const table of ['macro_raw_events', 'macro_releases', 'macro_release_components', 'macro_signals', 'macro_engine_config', 'macro_feed_health']) expect(schema).toContain(`public.${table}`);
    for (const field of ['scheduled_at', 'provider_updated_at', 'received_at', 'generated_at', 'rules_snapshot', 'component_scores', 'payload_hash', 'version']) expect(schema).toContain(field);
  });

  it('makes client macro data read-only and raw/config backend-only', () => {
    expect(schema).toContain('revoke all on public.macro_raw_events');
    expect(schema).toContain('grant all on public.macro_raw_events');
    expect(schema).toContain('to service_role');
    expect(schema).not.toMatch(/grant (?:insert|update|delete|all) on public\.macro_(?:raw_events|signals|releases|release_components) to authenticated/i);
  });

  it('publishes signal, release and health changes through Supabase Realtime', () => {
    for (const table of ['macro_releases', 'macro_signals', 'macro_feed_health']) expect(schema).toContain(`alter publication supabase_realtime add table public.${table}`);
  });
});
