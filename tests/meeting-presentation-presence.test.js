import { expect, it, vi } from 'vitest';

vi.mock('../src/services/api.js', () => ({ api: {} }));
vi.mock('../src/services/supabase.js', () => ({ primeRealtime: vi.fn(), subscribeRealtimeChannel: vi.fn(), supabase: {} }));

import { SupabaseMeetingConnection } from '../src/services/meetingClient.js';

it('announces screen sharing without retracking presence and disturbing connected peers', () => {
  const client = Object.create(SupabaseMeetingConnection.prototype);
  client.sharingRevision = 1;
  client.identity = { peerId: 'presenter', sharing: false };
  client.presence = { sharing: false };
  client.active = true;
  client.channel = { track: vi.fn().mockResolvedValue('ok') };
  client.sendPresence = vi.fn();

  client.setPresence({ sharing: true });
  expect(client.identity).toMatchObject({ sharing: true, sharingRevision: 2 });
  expect(client.channel.track).not.toHaveBeenCalled();

  client.setPresence({ speaking: true });
  expect(client.identity.sharingRevision).toBe(2);

  client.setPresence({ sharing: false });
  expect(client.identity).toMatchObject({ sharing: false, sharingRevision: 3 });
  expect(client.sendPresence).toHaveBeenCalledTimes(3);
});

it('sends the current sharing state when another participant joins late', async () => {
  const client = Object.create(SupabaseMeetingConnection.prototype);
  client.active = true;
  client.channel = {};
  client.selfId = 'presenter';
  client.identity = { sharing: true };
  client.callbacks = { onParticipants: vi.fn() };
  client.pendingRemovals = new Map();
  client.pendingSignals = new Map();
  client.peers = new Map();
  client.participants = new Map();
  client.canonicalPresence = () => new Map([['student-user', { peerId: 'student', userId: 'student-user' }]]);
  client.sendPresence = vi.fn();

  await client.syncPresence();
  expect(client.sendPresence).toHaveBeenCalledOnce();
});

it('keeps a shared screen active when a third participant triggers a stale presence sync', async () => {
  const client = Object.create(SupabaseMeetingConnection.prototype);
  client.active = true;
  client.channel = {};
  client.selfId = 'a';
  client.identity = { sharing: false };
  client.callbacks = { onParticipants: vi.fn(), onRemoteStream: vi.fn() };
  client.pendingRemovals = new Map();
  client.pendingSignals = new Map();
  client.peers = new Map([['host', {}]]);
  client.participants = new Map([['host', { peerId: 'host', userId: 'host-user', sharing: true, sharingRevision: 2, _sharingFromBroadcast: true }]]);
  client.canonicalPresence = () => new Map([
    ['host-user', { peerId: 'host', userId: 'host-user', sharing: false, sharingRevision: 1 }],
    ['new-user', { peerId: 'new-student', userId: 'new-user', sharing: false }],
  ]);

  await client.syncPresence();
  expect(client.participants.get('host').sharing).toBe(true);
  expect(client.peers.has('host')).toBe(true);
  expect(client.callbacks.onRemoteStream).not.toHaveBeenCalled();

  await client.handleParticipantState({ source: 'host', userId: 'host-user', data: { sharing: false, sharingRevision: 1 } });
  expect(client.participants.get('host').sharing).toBe(true);
  await client.handleParticipantState({ source: 'host', userId: 'host-user', data: { sharing: false, sharingRevision: 3 } });
  expect(client.participants.get('host').sharing).toBe(false);
});
