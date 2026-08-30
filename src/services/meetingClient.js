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
        if (message.type?.startsWith('collab-')) { this.callbacks.onCollaboration?.(message); return; }
        if (message.type === 'peer-left') { this.removePeer(message.peerId); }
      };
    });
  }

  async acceptOffer(message) { const pc = await this.createPeer(message.source, false); await pc.setRemoteDescription(message.data); await this.attachLocalTracks(pc); await this.flushIce(message.source); await pc.setLocalDescription(await pc.createAnswer()); this.send({ type: 'answer', target: message.source, data: pc.localDescription }); }
  async acceptAnswer(message) { const pc = this.peers.get(message.source)?.pc; if (pc?.signalingState === 'have-local-offer') { await pc.setRemoteDescription(message.data); await this.flushIce(message.source); } }
  async acceptIce(message) { if (!message.data) return; const peer = this.peers.get(message.source); if (!peer) { const pending = this.orphanIce.get(message.source) || []; pending.push(message.data); this.orphanIce.set(message.source, pending.slice(-50)); return; } if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(message.data).catch(() => {}); else peer.pendingIce.push(message.data); }
  removePeer(peerId) { const peer = this.peers.get(peerId); if (peer?.reconnectTimer) clearTimeout(peer.reconnectTimer); peer?.pc.close(); this.peers.delete(peerId); this.participants.delete(peerId); this.callbacks.onRemoteStream?.(peerId, null); this.emitParticipants(); }

  async createPeer(peerId, initiator) {
    if (this.peers.has(peerId)) return this.peers.get(peerId).pc;
    const pc = new RTCPeerConnection({ iceServers: this.iceServers, iceCandidatePoolSize: 10, bundlePolicy: 'max-bundle' }); const remoteStream = new MediaStream();
    if (initiator) {
      const audio = pc.addTransceiver('audio', { direction: 'sendrecv' }); const video = pc.addTransceiver('video', { direction: 'sendrecv' });
      await audio.sender.replaceTrack(this.localStream.getAudioTracks()[0] || null); await video.sender.replaceTrack(this.localStream.getVideoTracks()[0] || null);
    }
    pc.onicecandidate = (event) => { if (event.candidate) this.send({ type: 'ice', target: peerId, data: event.candidate }); };
    pc.ontrack = (event) => { if (!remoteStream.getTracks().some((track) => track.id === event.track.id)) remoteStream.addTrack(event.track); this.callbacks.onRemoteStream?.(peerId, remoteStream); };
    pc.onconnectionstatechange = () => {
      this.callbacks.onPeerState?.(peerId, pc.connectionState);
      const peer = this.peers.get(peerId); if (!peer) return;
      if (pc.connectionState === 'connected') { if (peer.reconnectTimer) clearTimeout(peer.reconnectTimer); peer.reconnectTimer = null; peer.restarting = false; return; }
      if (!initiator || !['disconnected', 'failed'].includes(pc.connectionState) || peer.reconnectTimer) return;
      peer.reconnectTimer = setTimeout(() => { peer.reconnectTimer = null; if (['disconnected', 'failed'].includes(pc.connectionState)) this.restartPeer(peerId).catch(() => {}); }, pc.connectionState === 'failed' ? 300 : 3000);
    };
    this.peers.set(peerId, { pc, remoteStream, pendingIce: this.orphanIce.get(peerId) || [], initiator, reconnectTimer: null, restarting: false }); this.orphanIce.delete(peerId);
    if (initiator) { await pc.setLocalDescription(await pc.createOffer()); this.send({ type: 'offer', target: peerId, data: pc.localDescription }); }
    return pc;
  }

  async flushIce(peerId) { const peer = this.peers.get(peerId); if (!peer) return; for (const candidate of peer.pendingIce.splice(0)) await peer.pc.addIceCandidate(candidate).catch(() => {}); }
  async restartPeer(peerId) {
    const peer = this.peers.get(peerId);
    if (!peer?.initiator || peer.restarting || peer.pc.signalingState !== 'stable' || peer.pc.connectionState === 'closed') return;
    peer.restarting = true;
    try { await peer.pc.setLocalDescription(await peer.pc.createOffer({ iceRestart: true })); this.send({ type: 'offer', target: peerId, data: peer.pc.localDescription }); }
    finally { setTimeout(() => { const current = this.peers.get(peerId); if (current === peer) current.restarting = false; }, 2500); }
  }
  async attachLocalTracks(pc) { for (const kind of ['audio', 'video']) { const transceiver = pc.getTransceivers().find((item) => item.receiver.track.kind === kind); if (transceiver) { transceiver.direction = 'sendrecv'; await transceiver.sender.replaceTrack(this.localStream.getTracks().find((track) => track.kind === kind) || null); } } }
  async setLocalStream(stream) {
    this.localStream = stream || new MediaStream();
    for (const { pc } of this.peers.values()) {
      const audioSender = pc.getSenders().find((sender) => sender.track?.kind === 'audio') || pc.getTransceivers().find((item) => item.receiver.track.kind === 'audio')?.sender;
      const videoSender = pc.getSenders().find((sender) => sender.track?.kind === 'video') || pc.getTransceivers().find((item) => item.receiver.track.kind === 'video')?.sender;
      await audioSender?.replaceTrack(this.localStream.getAudioTracks()[0] || null); await videoSender?.replaceTrack(this.localStream.getVideoTracks()[0] || null);
    }
  }
  updateIceServers(iceServers) {
    if (!iceServers?.length) return;
    this.iceServers = iceServers;
    for (const { pc } of this.peers.values()) pc.setConfiguration({ ...pc.getConfiguration(), iceServers });
  }
  setPresence(data) { this.presence = { ...this.presence, ...data }; this.sendPresence(); }
  sendPresence() { this.send({ type: 'presence', data: this.presence || {} }); }
  react(emoji) { this.send({ type: 'reaction', emoji }); }
  chat(message) { this.send({ type: 'chat', message }); }
  reactToChat(update) { this.send({ type: 'chat-reaction', update }); }
  collaborate(type, payload = {}, target = null) { this.send({ type, target, ...payload }); }
  mutePeer(peerId) { if (this.role === 'HOST') this.send({ type: 'moderation', action: 'mute', target: peerId }); }
  endMeeting() { if (this.role === 'HOST') this.send({ type: 'end-meeting' }); }
  send(message) { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message)); }
  emitParticipants() { this.callbacks.onParticipants?.([...this.participants.values()]); }
  disconnect() { this.peers.forEach(({ pc, remoteStream, reconnectTimer }) => { if (reconnectTimer) clearTimeout(reconnectTimer); pc.close(); remoteStream.getTracks().forEach((track) => track.stop()); }); this.peers.clear(); this.socket?.close(1000, 'Participant left'); this.socket = null; }
}

export class SupabaseMeetingConnection extends MeetingConnection {
  constructor(callbacks = {}) {
    super(callbacks);
    this.active = false;
    this.channel = null;
    this.endValidation = null;
    this.connectVersion = 0;
    this.pendingRemovals = new Map();
    this.iceRefreshTimer = null;
  }

  async connect({ roomId, stream, iceServers = [], role = 'PARTICIPANT', user }) {
    const version = ++this.connectVersion;
    this.roomId = roomId; this.role = role; this.selfId = crypto.randomUUID(); this.localStream = stream || new MediaStream(); this.iceServers = iceServers.length ? iceServers : defaultIceServers(); this.active = true; this.callbacks.onStatus?.('signaling');
    const identity = user || await api.me();
    this.identity = { peerId: this.selfId, userId: identity.id, name: identity.name, avatar: identity.avatar || '', role, connectedAt: Date.now(), ...(this.presence || {}) };
    primeRealtime(identity.id).catch(() => {});
    const channel = await subscribeRealtimeChannel(() => {
      if (!this.active || version !== this.connectVersion) throw Object.assign(new Error('Conexión reemplazada.'), { name: 'AbortError' });
      const channel = supabase.channel(`meeting:${roomId}`, { config: { private: true, broadcast: { self: false, ack: false }, presence: { key: this.selfId } } });
      channel.on('broadcast', { event: 'signal' }, ({ payload }) => this.handleSignal(payload).catch(() => {}));
      channel.on('broadcast', { event: 'participant-state' }, ({ payload }) => this.handleParticipantState(payload).catch(() => {}));
      channel.on('broadcast', { event: 'chat' }, ({ payload }) => this.handlePersistedMessage(payload?.messageId));
      channel.on('broadcast', { event: 'chat-reaction' }, ({ payload }) => this.handlePersistedMessage(payload?.messageId));
      channel.on('broadcast', { event: 'meeting-ended' }, ({ payload }) => this.handleMeetingEnded(payload));
      channel.on('presence', { event: 'sync' }, () => this.syncPresence());
      return channel;
    }, { onSubscribed: (subscribedChannel) => {
      if (!this.active || version !== this.connectVersion) throw Object.assign(new Error('Conexión reemplazada.'), { name: 'AbortError' });
      return subscribedChannel.track(this.identity);
    } });
    if (!this.active || version !== this.connectVersion) {
      channel.untrack().catch(() => {}); supabase.removeChannel(channel);
      throw Object.assign(new Error('Conexión reemplazada.'), { name: 'AbortError' });
    }
    this.channel = channel; await this.syncPresence(); this.sendPresence();
    this.callbacks.onStatus?.('connected');
  }

  canonicalPresence() {
    const canonicalUsers = new Map();
    if (!this.channel) return canonicalUsers;
    for (const entries of Object.values(this.channel.presenceState())) for (const peer of entries) {
      if (!peer.peerId || peer.peerId === this.selfId || (peer.userId && peer.userId === this.identity?.userId)) continue;
      const key = peer.userId || peer.peerId; const current = canonicalUsers.get(key);
      const peerRank = `${String(Number(peer.connectedAt) || 0).padStart(16, '0')}:${peer.peerId}`;
      const currentRank = current ? `${String(Number(current.connectedAt) || 0).padStart(16, '0')}:${current.peerId}` : '';
      if (!current || peerRank > currentRank) canonicalUsers.set(key, peer);
    }
    return canonicalUsers;
  }

  cancelPeerRemoval(peerId) {
    const timer = this.pendingRemovals.get(peerId);
    if (timer) clearTimeout(timer);
    this.pendingRemovals.delete(peerId);
  }

  schedulePeerRemoval(peerId) {
    if (this.pendingRemovals.has(peerId)) return;
    const timer = setTimeout(() => {
      this.pendingRemovals.delete(peerId);
      if (!this.active || !this.participants.has(peerId)) return;
      const stillCanonical = [...this.canonicalPresence().values()].some((peer) => peer.peerId === peerId);
      if (stillCanonical) { this.syncPresence().catch(() => {}); return; }
      this.removePeer(peerId);
    }, 4500);
    this.pendingRemovals.set(peerId, timer);
  }

  removePeer(peerId) {
    this.cancelPeerRemoval(peerId);
    super.removePeer(peerId);
  }

  async syncPresence() {
    if (!this.active || !this.channel) return; const online = new Set(); const canonicalUsers = this.canonicalPresence();
    for (const peer of canonicalUsers.values()) {
      online.add(peer.peerId); this.cancelPeerRemoval(peer.peerId);
      const isNew = !this.participants.has(peer.peerId); this.participants.set(peer.peerId, { ...this.participants.get(peer.peerId), ...peer });
      if (isNew && this.selfId > peer.peerId) await this.createPeer(peer.peerId, true).catch(() => {});
    }
    for (const [peerId, peer] of [...this.participants.entries()]) if (!online.has(peerId)) {
      const replacement = peer.userId && canonicalUsers.get(peer.userId);
      if (replacement) this.removePeer(peerId); else this.schedulePeerRemoval(peerId);
    }
    this.emitParticipants();
  }

  async handleParticipantState(message) {
    if (!message?.source || message.source === this.selfId) return;
    if (!this.participants.has(message.source)) await this.syncPresence();
    const participant = this.participants.get(message.source);
    if (!participant || (message.userId && participant.userId !== message.userId)) return;
    const state = {};
    for (const key of ['mic', 'camera', 'sharing', 'handRaised', 'speaking']) {
      if (typeof message.data?.[key] === 'boolean') state[key] = message.data[key];
    }
    this.participants.set(message.source, { ...participant, ...state });
    this.emitParticipants();
  }

  async handleSignal(message) {
    if (!message || (message.target && message.target !== this.selfId)) return;
    if (['offer', 'answer', 'ice'].includes(message.type) && message.source && !this.participants.has(message.source)) {
      await this.syncPresence(); if (!this.participants.has(message.source)) return;
    }
    if (message.type === 'offer') return this.acceptOffer(message);
    if (message.type === 'answer') return this.acceptAnswer(message);
    if (message.type === 'ice') return this.acceptIce(message);
    if (message.type === 'reaction') { this.callbacks.onReaction?.({ peerId: message.source, emoji: message.emoji }); return; }
    if (message.type?.startsWith('collab-')) {
      if (!message.source || !this.participants.has(message.source)) return;
      this.callbacks.onCollaboration?.(message); return;
    }
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
  scheduleIceRefresh(expiresIn = 43_200) {
    clearTimeout(this.iceRefreshTimer);
    const delay = Math.max(15 * 60_000, (Number(expiresIn) - 600) * 1000);
    this.iceRefreshTimer = setTimeout(async () => {
      if (!this.active) return;
      try { const relay = await api.getTurnCredentials(this.roomId); this.updateIceServers(relay.iceServers); this.scheduleIceRefresh(relay.expiresIn); }
      catch { this.scheduleIceRefresh(1_500); }
    }, delay);
  }
  setPresence(data) {
    this.presence = { ...this.presence, ...data };
    this.identity = { ...this.identity, ...this.presence };
    this.sendPresence();
  }
  sendPresence() {
    if (!this.active || !this.identity) return;
    const data = {};
    for (const key of ['mic', 'camera', 'sharing', 'handRaised', 'speaking']) {
      if (typeof this.identity[key] === 'boolean') data[key] = this.identity[key];
    }
    this.broadcast('participant-state', { source: this.selfId, userId: this.identity.userId, data }).catch(() => {});
  }
  send(message) {
    if (['offer', 'answer', 'ice'].includes(message.type)) this.broadcast('signal', { ...message, source: this.selfId });
    else if (message.type === 'reaction') this.broadcast('signal', { type: 'reaction', source: this.selfId, emoji: message.emoji });
    else if (message.type?.startsWith('collab-')) this.broadcast('signal', { ...message, source: this.selfId });
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
    this.active = false; this.connectVersion += 1; clearTimeout(this.iceRefreshTimer); this.iceRefreshTimer = null; this.pendingRemovals.forEach((timer) => clearTimeout(timer)); this.pendingRemovals.clear(); this.peers.forEach(({ pc, remoteStream, reconnectTimer }) => { if (reconnectTimer) clearTimeout(reconnectTimer); pc.close(); remoteStream.getTracks().forEach((track) => track.stop()); }); this.peers.clear(); this.participants.clear();
    if (this.channel) { this.channel.untrack(); supabase.removeChannel(this.channel); } this.channel = null; this.callbacks.onStatus?.('disconnected');
  }
}
