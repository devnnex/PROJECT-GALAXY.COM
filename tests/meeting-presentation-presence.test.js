import { expect, it, vi } from 'vitest';

vi.mock('../src/services/api.js', () => ({ api: {} }));
vi.mock('../src/services/supabase.js', () => ({ primeRealtime: vi.fn(), subscribeRealtimeChannel: vi.fn(), supabase: {} }));

import { SupabaseMeetingConnection } from '../src/services/meetingClient.js';

it('keeps connected WebRTC media when background signaling presence disappears, then removes a disconnected peer', async () => {
  vi.useFakeTimers();
  try {
    const client = Object.assign(Object.create(SupabaseMeetingConnection.prototype), { active: true, participants: new Map(), peers: new Map(), pendingRemovals: new Map() });
    client.participants.set('speaker', { peerId: 'speaker' });
    const pc = { connectionState: 'connected', iceConnectionState: 'completed' };
    client.peers.set('speaker', { pc }); client.canonicalPresence = () => new Map(); client.removePeer = vi.fn();
    client.schedulePeerRemoval('speaker'); client.schedulePeerRemoval('speaker');
    await vi.advanceTimersByTimeAsync(4500);
    expect(client.removePeer).not.toHaveBeenCalled(); expect(client.pendingRemovals.size).toBe(1);
    await vi.advanceTimersByTimeAsync(30_000); expect(client.removePeer).not.toHaveBeenCalled();
    pc.connectionState = 'disconnected'; pc.iceConnectionState = 'disconnected';
    await vi.advanceTimersByTimeAsync(15_000);
    expect(client.removePeer).toHaveBeenCalledExactlyOnceWith('speaker'); expect(client.pendingRemovals.size).toBe(0);
  } finally { vi.useRealTimers(); }
});

it('removes a departed peer without established media and cancels removal when presence returns', async () => {
  vi.useFakeTimers();
  try {
    const client = Object.assign(Object.create(SupabaseMeetingConnection.prototype), { active: true, participants: new Map(), peers: new Map(), pendingRemovals: new Map() });
    client.participants.set('gone', { peerId: 'gone' }); client.participants.set('returning', { peerId: 'returning' });
    client.canonicalPresence = () => new Map([['user', { peerId: 'returning' }]]);
    client.removePeer = vi.fn(); client.syncPresence = vi.fn().mockResolvedValue();
    client.schedulePeerRemoval('gone'); client.schedulePeerRemoval('returning');
    await vi.advanceTimersByTimeAsync(4500);
    expect(client.removePeer).toHaveBeenCalledExactlyOnceWith('gone'); expect(client.syncPresence).toHaveBeenCalledOnce();
  } finally { vi.useRealTimers(); }
});

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
