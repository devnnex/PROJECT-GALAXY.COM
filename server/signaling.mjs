import { createServer } from 'node:http';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.PORT || 8787);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const SECRET = process.env.MEETING_TOKEN_SECRET || (IS_PRODUCTION ? '' : 'galaxy-local-signaling-secret');
const ALLOWED_ORIGINS = new Set((process.env.ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean));
const MAX_ROOM_SIZE = Number(process.env.MAX_ROOM_SIZE || 8);
const rooms = new Map();
const REACTIONS = ['👍', '👏', '❤️', '😂', '🎉', '🔥'];

if (!SECRET) throw new Error('MEETING_TOKEN_SECRET is required in production.');
if (IS_PRODUCTION && !ALLOWED_ORIGINS.size) throw new Error('ALLOWED_ORIGINS is required in production.');

function base64url(value) { return Buffer.from(value).toString('base64url'); }
function sign(payload) { const encoded = base64url(JSON.stringify(payload)); return `${encoded}.${createHmac('sha256', SECRET).update(encoded).digest('base64url')}`; }
function verify(token) {
  const [encoded, signature] = String(token || '').split('.');
  if (!encoded || !signature) throw new Error('Malformed token');
  const expected = createHmac('sha256', SECRET).update(encoded).digest('base64url');
  const a = Buffer.from(signature); const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('Invalid signature');
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  if (!payload.meetingId || !payload.userId || Number(payload.expiresAt) <= Date.now()) throw new Error('Expired token');
  if (payload.status !== 'ADMITTED') throw new Error('Participant is not admitted');
  return payload;
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, { peers: new Map(), chatHistory: [], startedAt: Date.now() });
  return rooms.get(roomId);
}
function send(socket, message) { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); }
function broadcast(room, message, exceptPeerId = '') { room.peers.forEach((peer, id) => { if (id !== exceptPeerId) send(peer.socket, message); }); }
function publicPeer(peer) { return { peerId: peer.peerId, userId: peer.userId, name: peer.name, role: peer.role, mic: peer.mic, camera: peer.camera, sharing: peer.sharing, handRaised: peer.handRaised, speaking: peer.speaking }; }
function text(value, max = 2000) { return String(value || '').trim().slice(0, max); }

const server = createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const allowedOrigin = !IS_PRODUCTION || ALLOWED_ORIGINS.has(request.headers.origin) ? (request.headers.origin || '*') : '';
  if (allowedOrigin) response.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  response.setHeader('Cache-Control', 'no-store');
  if (url.pathname === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ ok: true, rooms: rooms.size, participants: [...rooms.values()].reduce((sum, room) => sum + room.peers.size, 0), timestamp: new Date().toISOString() })); return;
  }
  if (url.pathname === '/dev-token' && !IS_PRODUCTION) {
    const meetingId = text(url.searchParams.get('meetingId') || 'future-systems', 100);
    const userId = text(url.searchParams.get('userId') || randomUUID(), 100);
    const name = text(url.searchParams.get('name') || 'Invitado', 80);
    const role = url.searchParams.get('role') === 'HOST' ? 'HOST' : 'PARTICIPANT';
    const token = sign({ meetingId, userId, name, role, status: 'ADMITTED', expiresAt: Date.now() + 60 * 60_000, nonce: randomUUID() });
    response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ ok: true, token })); return;
  }
  response.writeHead(404, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ ok: false, error: 'Not found' }));
});

const websocket = new WebSocketServer({ server, maxPayload: 64 * 1024 });
websocket.on('connection', (socket, request) => {
  try {
    if (IS_PRODUCTION && !ALLOWED_ORIGINS.has(request.headers.origin)) throw new Error('Origin not allowed');
    const url = new URL(request.url, `http://${request.headers.host}`); const payload = verify(url.searchParams.get('token'));
    const roomId = text(url.searchParams.get('roomId'), 100); if (payload.meetingId !== roomId) throw new Error('Room mismatch');
    const room = getRoom(roomId); if (room.peers.size >= MAX_ROOM_SIZE) throw new Error('Room capacity reached');
    for (const existing of room.peers.values()) if (existing.userId === payload.userId) existing.socket.close(4001, 'Reconnected from another tab');
    const peer = { socket, peerId: randomUUID(), userId: payload.userId, name: text(payload.name || payload.userId, 80), role: payload.role === 'HOST' ? 'HOST' : 'PARTICIPANT', mic: false, camera: false, sharing: false, handRaised: false, speaking: false, messages: 0, windowStarted: Date.now(), alive: true };
    room.peers.set(peer.peerId, peer); socket.peer = peer; socket.roomId = roomId;
    send(socket, { type: 'welcome', peerId: peer.peerId, role: peer.role, peers: [...room.peers.values()].filter((item) => item.peerId !== peer.peerId).map(publicPeer), chatHistory: room.chatHistory.slice(-100) });
    broadcast(room, { type: 'peer-joined', peer: publicPeer(peer) }, peer.peerId);
    socket.on('pong', () => { peer.alive = true; });
    socket.on('message', (raw) => {
      if (Date.now() - peer.windowStarted > 10_000) { peer.windowStarted = Date.now(); peer.messages = 0; }
      if (++peer.messages > 180) return socket.close(1008, 'Rate limit');
      let message; try { message = JSON.parse(raw.toString()); } catch { return; }
      if (['offer', 'answer', 'ice'].includes(message.type)) {
        const target = room.peers.get(text(message.target, 100)); if (target) send(target.socket, { type: message.type, source: peer.peerId, data: message.data }); return;
      }
      if (message.type === 'presence') {
        peer.mic = Boolean(message.data?.mic); peer.camera = Boolean(message.data?.camera); peer.sharing = Boolean(message.data?.sharing); peer.handRaised = Boolean(message.data?.handRaised); peer.speaking = peer.mic && Boolean(message.data?.speaking);
        broadcast(room, { type: 'presence', peer: publicPeer(peer) }, peer.peerId); return;
      }
      if (message.type === 'reaction' && REACTIONS.includes(message.emoji)) { broadcast(room, { type: 'reaction', peerId: peer.peerId, name: peer.name, emoji: message.emoji }); return; }
      if (message.type === 'chat') {
        const incoming = message.message || {}; const body = text(incoming.body); if (!body) return;
        const chat = { id: text(incoming.id, 100) || randomUUID(), senderId: peer.userId, senderName: peer.name, body, replyToId: text(incoming.replyToId, 100), createdAt: incoming.createdAt || new Date().toISOString(), reactions: Array.isArray(incoming.reactions) ? incoming.reactions.slice(0, 12) : [] };
        if (!room.chatHistory.some((item) => item.id === chat.id)) room.chatHistory.push(chat); room.chatHistory = room.chatHistory.slice(-100);
        broadcast(room, { type: 'chat', message: chat }); return;
      }
      if (message.type === 'chat-reaction') { const update = message.update || {}; broadcast(room, { type: 'chat-reaction', update: { messageId: text(update.messageId, 100), emoji: REACTIONS.includes(update.emoji) ? update.emoji : '', active: Boolean(update.active), userId: peer.userId } }, peer.peerId); return; }
      if (message.type === 'moderation' && peer.role === 'HOST' && message.action === 'mute') {
        const target = room.peers.get(text(message.target, 100)); if (!target || target.role === 'HOST') return; target.mic = false; target.speaking = false; send(target.socket, { type: 'force-mute', by: peer.name }); broadcast(room, { type: 'presence', peer: publicPeer(target) }); return;
      }
      if (message.type === 'end-meeting' && peer.role === 'HOST') {
        broadcast(room, { type: 'meeting-ended', by: peer.name }); setTimeout(() => room.peers.forEach((item) => item.socket.close(4000, 'Meeting ended by host')), 150); rooms.delete(roomId);
      }
    });
    socket.on('close', () => { if (room.peers.get(peer.peerId) !== peer) return; room.peers.delete(peer.peerId); broadcast(room, { type: 'peer-left', peerId: peer.peerId }); if (!room.peers.size) rooms.delete(roomId); });
  } catch (error) { socket.close(1008, error.message); }
});

const heartbeat = setInterval(() => websocket.clients.forEach((socket) => { if (!socket.peer?.alive) return socket.terminate(); socket.peer.alive = false; socket.ping(); }), 30_000);
websocket.on('close', () => clearInterval(heartbeat));
server.listen(PORT, '0.0.0.0', () => console.log(`Galaxy signaling listening on :${PORT} (${IS_PRODUCTION ? 'production' : 'development'})`));
