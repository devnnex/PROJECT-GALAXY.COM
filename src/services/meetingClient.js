import { api } from './api';
import { primeRealtime, subscribeRealtimeChannel, supabase } from './supabase';

export async function getMeetingAccess({ roomCode, password }) {
  const access = await api.joinMeeting({ roomCode, password });
  return { ...access, roomId: access.meetingId, transport: 'supabase', iceServers: access.iceServers || [] };
}

function defaultIceServers() { return [{ urls: 'stun:stun.l.google.com:19302' }]; }

export class MeetingConnection {
  constructor(callbacks = {}) { this.callbacks = callbacks; this.socket = null; this.peers = new Map(); this.participants = new Map(); this.orphanIce = new Map(); this.localStream = new MediaStream(); this.selfId = ''; }

  async connect({ url, roomId, token, stream, iceServers = [] }) {
    this.localStream = stream || new MediaStream(); this.iceServers = iceServers.length ? iceServers : defaultIceServers();
    const endpoint = `${url}?roomId=${encodeURIComponent(roomId)}&token=${encodeURIComponent(token)}`;
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(endpoint); this.socket = socket; let settled = false;
      const timeout = setTimeout(() => { if (!settled) { settled = true; socket.close(); reject(new Error('El servidor de reunión no respondió a tiempo.')); } }, 10_000);
      socket.onopen = () => this.callbacks.onStatus?.('signaling');
      socket.onerror = () => { if (!settled) { settled = true; clearTimeout(timeout); reject(new Error('No fue posible conectar con el servidor de señalización.')); } };
      socket.onclose = (event) => { this.callbacks.onStatus?.('disconnected'); if (!settled) { settled = true; clearTimeout(timeout); reject(new Error(event.reason || 'El servidor rechazó el acceso a la sala.')); } };
      socket.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'welcome') {
          this.selfId = message.peerId; this.role = message.role; message.peers.forEach((peer) => this.participants.set(peer.peerId, peer)); this.emitParticipants(); this.callbacks.onChatHistory?.(message.chatHistory || []);
          for (const peer of message.peers) await this.createPeer(peer.peerId, true);
          this.sendPresence(); this.callbacks.onStatus?.('connected'); if (!settled) { settled = true; clearTimeout(timeout); resolve(); } return;
        }
        if (message.type === 'peer-joined') { this.participants.set(message.peer.peerId, message.peer); this.emitParticipants(); return; }
        if (message.type === 'offer') { await this.acceptOffer(message); return; }
        if (message.type === 'answer') { await this.acceptAnswer(message); return; }
        if (message.type === 'ice') { await this.acceptIce(message); return; }
        if (message.type === 'presence') { this.participants.set(message.peer.peerId, message.peer); this.emitParticipants(); return; }
        if (message.type === 'reaction') { this.callbacks.onReaction?.({ peerId: message.peerId, emoji: message.emoji }); return; }
        if (message.type === 'chat') { this.callbacks.onChat?.(message.message); return; }
        if (message.type === 'chat-reaction') { this.callbacks.onChatReaction?.(message.update); return; }
        if (message.type === 'force-mute') { this.callbacks.onForceMute?.(message); return; }
        if (message.type === 'meeting-ended') { this.callbacks.onMeetingEnded?.(message); return; }
        if (message.type === 'peer-left') { this.removePeer(message.peerId); }
      };
    });
  }

  async acceptOffer(message) { const pc = await this.createPeer(message.source, false); await pc.setRemoteDescription(message.data); await this.attachLocalTracks(pc); await this.flushIce(message.source); await pc.setLocalDescription(await pc.createAnswer()); this.send({ type: 'answer', target: message.source, data: pc.localDescription }); }
  async acceptAnswer(message) { const pc = this.peers.get(message.source)?.pc; if (pc && !pc.currentRemoteDescription) { await pc.setRemoteDescription(message.data); await this.flushIce(message.source); } }
  async acceptIce(message) { if (!message.data) return; const peer = this.peers.get(message.source); if (!peer) { const pending = this.orphanIce.get(message.source) || []; pending.push(message.data); this.orphanIce.set(message.source, pending.slice(-50)); return; } if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(message.data).catch(() => {}); else peer.pendingIce.push(message.data); }
  removePeer(peerId) { this.peers.get(peerId)?.pc.close(); this.peers.delete(peerId); this.participants.delete(peerId); this.callbacks.onRemoteStream?.(peerId, null); this.emitParticipants(); }

  async createPeer(peerId, initiator) {
    if (this.peers.has(peerId)) return this.peers.get(peerId).pc;
    const pc = new RTCPeerConnection({ iceServers: this.iceServers }); const remoteStream = new MediaStream();
    if (initiator) {
      const audio = pc.addTransceiver('audio', { direction: 'sendrecv' }); const video = pc.addTransceiver('video', { direction: 'sendrecv' });
      await audio.sender.replaceTrack(this.localStream.getAudioTracks()[0] || null); await video.sender.replaceTrack(this.localStream.getVideoTracks()[0] || null);
    }
    pc.onicecandidate = (event) => { if (event.candidate) this.send({ type: 'ice', target: peerId, data: event.candidate }); };
    pc.ontrack = (event) => { if (!remoteStream.getTracks().some((track) => track.id === event.track.id)) remoteStream.addTrack(event.track); this.callbacks.onRemoteStream?.(peerId, remoteStream); };
    pc.onconnectionstatechange = () => this.callbacks.onPeerState?.(peerId, pc.connectionState);
    this.peers.set(peerId, { pc, remoteStream, pendingIce: this.orphanIce.get(peerId) || [] }); this.orphanIce.delete(peerId);
    if (initiator) { await pc.setLocalDescription(await pc.createOffer()); this.send({ type: 'offer', target: peerId, data: pc.localDescription }); }
    return pc;
  }

  async flushIce(peerId) { const peer = this.peers.get(peerId); if (!peer) return; for (const candidate of peer.pendingIce.splice(0)) await peer.pc.addIceCandidate(candidate).catch(() => {}); }
  async attachLocalTracks(pc) { for (const kind of ['audio', 'video']) { const transceiver = pc.getTransceivers().find((item) => item.receiver.track.kind === kind); if (transceiver) { transceiver.direction = 'sendrecv'; await transceiver.sender.replaceTrack(this.localStream.getTracks().find((track) => track.kind === kind) || null); } } }
  async setLocalStream(stream) {
    this.localStream = stream || new MediaStream();
    for (const { pc } of this.peers.values()) {
      const audioSender = pc.getSenders().find((sender) => sender.track?.kind === 'audio') || pc.getTransceivers().find((item) => item.receiver.track.kind === 'audio')?.sender;
      const videoSender = pc.getSenders().find((sender) => sender.track?.kind === 'video') || pc.getTransceivers().find((item) => item.receiver.track.kind === 'video')?.sender;
      await audioSender?.replaceTrack(this.localStream.getAudioTracks()[0] || null); await videoSender?.replaceTrack(this.localStream.getVideoTracks()[0] || null);
    }
  }
  setPresence(data) { this.presence = { ...this.presence, ...data }; this.sendPresence(); }
  sendPresence() { this.send({ type: 'presence', data: this.presence || {} }); }
  react(emoji) { this.send({ type: 'reaction', emoji }); }
  chat(message) { this.send({ type: 'chat', message }); }
  reactToChat(update) { this.send({ type: 'chat-reaction', update }); }
  mutePeer(peerId) { if (this.role === 'HOST') this.send({ type: 'moderation', action: 'mute', target: peerId }); }
  endMeeting() { if (this.role === 'HOST') this.send({ type: 'end-meeting' }); }
  send(message) { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message)); }
  emitParticipants() { this.callbacks.onParticipants?.([...this.participants.values()]); }
  disconnect() { this.peers.forEach(({ pc, remoteStream }) => { pc.close(); remoteStream.getTracks().forEach((track) => track.stop()); }); this.peers.clear(); this.socket?.close(1000, 'Participant left'); this.socket = null; }
}

export class SupabaseMeetingConnection extends MeetingConnection {
  constructor(callbacks = {}) { super(callbacks); this.active = false; this.channel = null; this.endValidation = null; }

  async connect({ roomId, stream, iceServers = [], role = 'PARTICIPANT', user }) {
    this.roomId = roomId; this.role = role; this.selfId = crypto.randomUUID(); this.localStream = stream || new MediaStream(); this.iceServers = iceServers.length ? iceServers : defaultIceServers(); this.active = true; this.callbacks.onStatus?.('signaling');
    const identity = user || await api.me();
    this.identity = { peerId: this.selfId, userId: identity.id, name: identity.name, role, ...(this.presence || {}) };
    primeRealtime(identity.id).catch(() => {});
    this.channel = await subscribeRealtimeChannel(() => {
      const channel = supabase.channel(`meeting:${roomId}`, { config: { private: true, broadcast: { self: false, ack: false }, presence: { key: this.selfId } } });
      this.channel = channel;
      channel.on('broadcast', { event: 'signal' }, ({ payload }) => this.handleSignal(payload).catch(() => {}));
      channel.on('broadcast', { event: 'chat' }, ({ payload }) => this.handlePersistedMessage(payload?.messageId));
      channel.on('broadcast', { event: 'chat-reaction' }, ({ payload }) => this.handlePersistedMessage(payload?.messageId));
      channel.on('broadcast', { event: 'meeting-ended' }, ({ payload }) => this.handleMeetingEnded(payload));
      channel.on('presence', { event: 'sync' }, () => this.syncPresence());
      return channel;
    }, { onSubscribed: (channel) => channel.track(this.identity) });
    this.callbacks.onStatus?.('connected');
  }

  async syncPresence() {
    if (!this.active || !this.channel) return; const online = new Set();
    for (const entries of Object.values(this.channel.presenceState())) for (const peer of entries) {
      if (!peer.peerId || peer.peerId === this.selfId) continue;
      online.add(peer.peerId); const isNew = !this.participants.has(peer.peerId); this.participants.set(peer.peerId, peer);
      if (isNew && this.selfId > peer.peerId) await this.createPeer(peer.peerId, true).catch(() => {});
    }
    for (const peerId of [...this.participants.keys()]) if (!online.has(peerId)) this.removePeer(peerId);
    this.emitParticipants();
  }

  async handleSignal(message) {
    if (!message || (message.target && message.target !== this.selfId)) return;
    if (message.type === 'offer') return this.acceptOffer(message);
    if (message.type === 'answer') return this.acceptAnswer(message);
    if (message.type === 'ice') return this.acceptIce(message);
    if (message.type === 'reaction') { this.callbacks.onReaction?.({ peerId: message.source, emoji: message.emoji }); return; }
    if (message.type === 'force-mute' && message.commandId) {
      const command = await api.consumeMeetingCommand({ commandId: message.commandId });
      if (command?.meetingId === this.roomId && command.command === 'MUTE') this.callbacks.onForceMute?.({ by: message.by });
    }
  }

  async handlePersistedMessage(messageId) {
    if (!messageId) return;
    const message = await api.getMeetingMessage({ meetingId: this.roomId, messageId }).catch(() => null);
    if (message) this.callbacks.onChat?.(message);
  }

  async handleMeetingEnded(payload) {
    if (this.endValidation) return this.endValidation;
    this.endValidation = api.getMeetingState({ meetingId: this.roomId })
      .then((state) => { if (state?.status === 'ENDED') this.callbacks.onMeetingEnded?.(payload || {}); })
      .catch(() => {})
      .finally(() => { setTimeout(() => { this.endValidation = null; }, 1500); });
    return this.endValidation;
  }

  async broadcast(event, payload) { if (this.active && this.channel) await this.channel.send({ type: 'broadcast', event, payload }); }
  setPresence(data) { this.presence = { ...this.presence, ...data }; this.identity = { ...this.identity, ...this.presence }; if (this.active) this.channel?.track(this.identity); }
  sendPresence() { if (this.active) this.channel?.track(this.identity); }
  send(message) {
    if (['offer', 'answer', 'ice'].includes(message.type)) this.broadcast('signal', { ...message, source: this.selfId });
    else if (message.type === 'reaction') this.broadcast('signal', { type: 'reaction', source: this.selfId, emoji: message.emoji });
    else if (message.type === 'moderation' && message.action === 'mute' && this.role === 'HOST') this.mutePeer(message.target);
  }
  chat(message) { return this.broadcast('chat', { messageId: message.id }); }
  reactToChat(update) { return this.broadcast('chat-reaction', { messageId: update.messageId }); }
  async mutePeer(peerId) {
    if (this.role !== 'HOST') return;
    const peer = this.participants.get(peerId);
    if (!peer?.userId) return;
    const command = await api.requestMeetingMute({ meetingId: this.roomId, userId: peer.userId });
    await this.broadcast('signal', { type: 'force-mute', source: this.selfId, target: peerId, commandId: command.id, by: this.identity.name });
  }
  endMeeting() { if (this.role === 'HOST') return this.broadcast('meeting-ended', { by: this.identity.name }); return undefined; }
  disconnect() {
    this.active = false; this.peers.forEach(({ pc, remoteStream }) => { pc.close(); remoteStream.getTracks().forEach((track) => track.stop()); }); this.peers.clear(); this.participants.clear();
    if (this.channel) { this.channel.untrack(); supabase.removeChannel(this.channel); } this.channel = null; this.callbacks.onStatus?.('disconnected');
  }
}
