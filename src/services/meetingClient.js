import { CONFIG } from '../config';
import { api } from './api';

function signalingUrl() {
  if (CONFIG.SIGNALING_URL) return CONFIG.SIGNALING_URL.replace(/\/$/, '');
  return '';
}

export async function getMeetingAccess({ roomCode, password }) {
  const access = await api.joinMeeting({ roomCode, password });
  const url = access.signalingUrl || signalingUrl();
  if (access.status !== 'ADMITTED') return { ...access, signalingUrl: url };
  if (url && !access.meetingToken) throw new Error('El backend no emitió un token de reunión.');
  return { ...access, token: access.meetingToken, roomId: access.meetingId, signalingUrl: url, transport: url ? 'websocket' : 'apps-script', iceServers: access.iceServers || [] };
}

function defaultIceServers() { return [{ urls: 'stun:stun.l.google.com:19302' }]; }

export class MeetingConnection {
  constructor(callbacks = {}) {
    this.callbacks = callbacks; this.socket = null; this.peers = new Map(); this.participants = new Map(); this.localStream = new MediaStream(); this.selfId = '';
  }

  async connect({ url, roomId, token, stream, iceServers = [] }) {
    this.localStream = stream || new MediaStream();
    this.iceServers = iceServers.length ? iceServers : defaultIceServers();
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
          this.sendPresence(); this.callbacks.onStatus?.('connected');
          if (!settled) { settled = true; clearTimeout(timeout); resolve(); } return;
        }
        if (message.type === 'peer-joined') { this.participants.set(message.peer.peerId, message.peer); this.emitParticipants(); return; }
        if (message.type === 'offer') { const pc = await this.createPeer(message.source, false); await pc.setRemoteDescription(message.data); await this.attachLocalTracks(pc); await this.flushIce(message.source); await pc.setLocalDescription(await pc.createAnswer()); this.send({ type: 'answer', target: message.source, data: pc.localDescription }); return; }
        if (message.type === 'answer') { const pc = this.peers.get(message.source)?.pc; if (pc) { await pc.setRemoteDescription(message.data); await this.flushIce(message.source); } return; }
        if (message.type === 'ice') { const peer = this.peers.get(message.source); if (!peer || !message.data) return; if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(message.data).catch(() => {}); else peer.pendingIce.push(message.data); return; }
        if (message.type === 'presence') { this.participants.set(message.peer.peerId, message.peer); this.emitParticipants(); return; }
        if (message.type === 'reaction') { this.callbacks.onReaction?.({ peerId: message.peerId, emoji: message.emoji }); return; }
        if (message.type === 'chat') { this.callbacks.onChat?.(message.message); return; }
        if (message.type === 'chat-reaction') { this.callbacks.onChatReaction?.(message.update); return; }
        if (message.type === 'force-mute') { this.callbacks.onForceMute?.(message); return; }
        if (message.type === 'meeting-ended') { this.callbacks.onMeetingEnded?.(message); return; }
        if (message.type === 'peer-left') { this.peers.get(message.peerId)?.pc.close(); this.peers.delete(message.peerId); this.participants.delete(message.peerId); this.callbacks.onRemoteStream?.(message.peerId, null); this.emitParticipants(); }
      };
    });
  }

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
    this.peers.set(peerId, { pc, remoteStream, pendingIce: [] });
    if (initiator) { await pc.setLocalDescription(await pc.createOffer()); this.send({ type: 'offer', target: peerId, data: pc.localDescription }); }
    return pc;
  }

  async flushIce(peerId) { const peer = this.peers.get(peerId); if (!peer) return; for (const candidate of peer.pendingIce.splice(0)) await peer.pc.addIceCandidate(candidate).catch(() => {}); }

  async attachLocalTracks(pc) {
    for (const kind of ['audio', 'video']) {
      const transceiver = pc.getTransceivers().find((item) => item.receiver.track.kind === kind);
      if (transceiver) { transceiver.direction = 'sendrecv'; await transceiver.sender.replaceTrack(this.localStream.getTracks().find((track) => track.kind === kind) || null); }
    }
  }

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

export class AppsScriptMeetingConnection extends MeetingConnection {
  constructor(callbacks = {}) { super(callbacks); this.active = false; this.outbox = []; this.pollTimer = null; this.flushTimer = null; this.lastMessagesAt = 0; }

  async connect({ roomId, stream, iceServers = [], role = 'PARTICIPANT' }) {
    this.roomId = roomId; this.role = role; this.selfId = crypto.randomUUID().replaceAll('-', '_'); this.localStream = stream || new MediaStream(); this.iceServers = iceServers.length ? iceServers : defaultIceServers(); this.active = true;
    this.callbacks.onStatus?.('signaling'); await this.poll(); this.callbacks.onStatus?.('connected'); this.schedulePoll(900); return undefined;
  }

  schedulePoll(delay = 1600) { clearTimeout(this.pollTimer); if (this.active) this.pollTimer = setTimeout(() => this.poll(), delay); }

  async poll() {
    if (!this.active || this.polling) return;
    this.polling = true;
    try {
      const includeMessages = Date.now() - this.lastMessagesAt > 3500;
      const state = await api.pollMeetingRealtime({ meetingId: this.roomId, connectionId: this.selfId, presence: this.presence || {}, includeMessages });
      if (!this.active) return;
      if (state.status === 'ENDED') { this.callbacks.onMeetingEnded?.({ by: 'El anfitrión' }); return; }
      if (includeMessages) { this.lastMessagesAt = Date.now(); (state.messages || []).forEach((message) => this.callbacks.onChat?.(message)); }
      for (const signal of state.signals || []) await this.handleSignal(signal);
      const online = new Set();
      for (const peer of state.peers || []) {
        online.add(peer.peerId); const isNew = !this.participants.has(peer.peerId); this.participants.set(peer.peerId, peer);
        if (isNew && this.selfId > peer.peerId) await this.createPeer(peer.peerId, true);
      }
      for (const peerId of [...this.participants.keys()]) if (!online.has(peerId)) { this.peers.get(peerId)?.pc.close(); this.peers.delete(peerId); this.participants.delete(peerId); this.callbacks.onRemoteStream?.(peerId, null); }
      this.emitParticipants(); this.callbacks.onStatus?.('connected');
    } catch (error) { if (this.active) this.callbacks.onStatus?.('disconnected'); }
    finally { this.polling = false; this.schedulePoll(this.peers.size ? 1300 : 1900); }
  }

  async handleSignal(message) {
    if (message.type === 'offer') { const pc = await this.createPeer(message.source, false); await pc.setRemoteDescription(message.data); await this.attachLocalTracks(pc); await this.flushIce(message.source); await pc.setLocalDescription(await pc.createAnswer()); this.send({ type: 'answer', target: message.source, data: pc.localDescription }); return; }
    if (message.type === 'answer') { const pc = this.peers.get(message.source)?.pc; if (pc && !pc.currentRemoteDescription) { await pc.setRemoteDescription(message.data); await this.flushIce(message.source); } return; }
    if (message.type === 'ice') { const peer = this.peers.get(message.source); if (!peer || !message.data) return; if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(message.data).catch(() => {}); else peer.pendingIce.push(message.data); return; }
    if (message.type === 'reaction') { this.callbacks.onReaction?.({ peerId: message.source, emoji: message.emoji }); return; }
    if (message.type === 'force-mute') this.callbacks.onForceMute?.({ by: message.by });
  }

  queueSignal(signal) { this.outbox.push(signal); clearTimeout(this.flushTimer); this.flushTimer = setTimeout(() => this.flushSignals(), 120); }
  async flushSignals() { if (!this.active || !this.outbox.length) return; const signals = this.outbox.splice(0, 30); try { await api.postMeetingSignals({ meetingId: this.roomId, connectionId: this.selfId, signals }); } catch { this.outbox.unshift(...signals); } if (this.outbox.length) this.flushTimer = setTimeout(() => this.flushSignals(), 350); }
  setPresence(data) { this.presence = { ...this.presence, ...data }; if (this.active) this.schedulePoll(0); }
  sendPresence() { if (this.active) this.schedulePoll(0); }
  send(message) {
    if (['offer', 'answer', 'ice'].includes(message.type)) this.queueSignal({ type: message.type, target: message.target, data: message.data });
    else if (message.type === 'reaction') this.queueSignal({ type: 'reaction', emoji: message.emoji });
    else if (message.type === 'moderation' && message.action === 'mute') this.queueSignal({ type: 'force-mute', target: message.target });
  }
  chat() { this.schedulePoll(0); }
  reactToChat() { this.schedulePoll(0); }
  endMeeting() { this.schedulePoll(0); }
  disconnect() { const roomId = this.roomId; const connectionId = this.selfId; this.active = false; clearTimeout(this.pollTimer); clearTimeout(this.flushTimer); super.disconnect(); if (roomId && connectionId) api.leaveMeetingRealtime({ meetingId: roomId, connectionId }).catch(() => {}); this.callbacks.onStatus?.('disconnected'); }
}
