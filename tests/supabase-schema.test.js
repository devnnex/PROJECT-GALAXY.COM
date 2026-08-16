import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/services/api.js', import.meta.url), 'utf8');

const publicRpc = [
  'get_current_user', 'get_bootstrap_data', 'create_meeting', 'join_meeting', 'get_my_meetings',
  'get_meeting_state', 'admit_meeting_participant', 'deny_meeting_participant', 'set_meeting_locked',
  'end_meeting', 'get_community_members', 'invite_to_meeting', 'get_meeting_messages',
  'post_meeting_message', 'react_to_meeting_message',
  'get_meeting_message', 'request_meeting_mute', 'consume_meeting_command',
];

describe('Supabase contract', () => {
  it.each(publicRpc)('defines and grants the %s RPC used by the client', (name) => {
    expect(schema).toMatch(new RegExp(`create or replace function public\\.${name}\\(`, 'i'));
    expect(schema).toMatch(new RegExp(`grant execute[\\s\\S]*public\\.${name}\\(`, 'i'));
    expect(api).toContain(`'${name}'`);
  });

  it('protects operational tables and private realtime topics', () => {
    for (const table of ['profiles', 'wallets', 'meetings', 'meeting_participants', 'meeting_messages', 'meeting_message_reactions']) {
      expect(schema).toContain(`alter table public.${table} enable row level security;`);
    }
    expect(schema).toContain("realtime.messages.extension in ('broadcast','presence')");
    expect(schema).toContain("realtime.topic())='meeting:'||p.meeting_id::text");
    expect(api).toContain("config: { private: true }");
  });

  it('contains no Apps Script transport in the browser API', () => {
    expect(api).not.toMatch(/script\.google|pollMeetingRealtime|postMeetingSignals/);
  });
});
