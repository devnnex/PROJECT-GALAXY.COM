import { expect, it, vi } from 'vitest';

vi.mock('../src/services/api.js', () => ({ api: {} }));
vi.mock('../src/services/supabase.js', () => ({ primeRealtime: vi.fn(), subscribeRealtimeChannel: vi.fn(), supabase: {} }));

import { SupabaseMeetingConnection } from '../src/services/meetingClient.js';

it('publishes screen sharing in room presence for desktop viewers who join later', async () => {
  const client = Object.create(SupabaseMeetingConnection.prototype);
  client.identity = { peerId: 'presenter', sharing: false };
  client.presence = { sharing: false };
  client.active = true;
  client.channel = { track: vi.fn().mockResolvedValue('ok') };
  client.sendPresence = vi.fn();

  client.setPresence({ sharing: true });
  expect(client.channel.track).toHaveBeenCalledWith(expect.objectContaining({ peerId: 'presenter', sharing: true }));

  client.setPresence({ speaking: true });
  expect(client.channel.track).toHaveBeenCalledTimes(1);

  client.setPresence({ sharing: false });
  expect(client.channel.track).toHaveBeenLastCalledWith(expect.objectContaining({ sharing: false }));
});
