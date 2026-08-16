import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Check, Copy, Hand, Lock, LogIn, MessageCircle, Mic, MicOff, MonitorUp, PhoneOff, Plus, Reply, Send, ShieldCheck, SmilePlus, Unlock, UserPlus, Users, Volume2, X } from 'lucide-react';
import { api } from '../services/api';
import { getMeetingAccess, SupabaseMeetingConnection } from '../services/meetingClient';
import { primeRealtime, releaseRealtimePrime } from '../services/supabase';
import ConstellationAvatar from './ConstellationAvatar';

const EMOJIS = ['👍', '👏', '❤️', '😂', '🎉', '🔥'];

function AudioMeter({ stream, enabled = true, onSpeakingChange, label = 'Nivel de voz' }) {
  const [level, setLevel] = useState(0); const speakingRef = useRef(false);
  useEffect(() => {
    if (!stream || !enabled || !stream.getAudioTracks().length) { setLevel(0); if (speakingRef.current) onSpeakingChange?.(false); speakingRef.current = false; return undefined; }
    const Context = window.AudioContext || window.webkitAudioContext; if (!Context) return undefined;
    const context = new Context(); const analyser = context.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = .72;
    const source = context.createMediaStreamSource(new MediaStream(stream.getAudioTracks())); source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize); let frame = 0;
    const read = () => {
      analyser.getByteTimeDomainData(samples); let sum = 0;
      for (const value of samples) { const normalized = (value - 128) / 128; sum += normalized * normalized; }
      const rms = Math.sqrt(sum / samples.length); const next = Math.min(5, Math.max(0, Math.ceil((rms - .018) * 45)));
      setLevel(next); const speaking = rms > .045;
      if (speaking !== speakingRef.current) { speakingRef.current = speaking; onSpeakingChange?.(speaking); }
      frame = requestAnimationFrame(read);
    };
    read(); return () => { cancelAnimationFrame(frame); source.disconnect(); context.close(); if (speakingRef.current) onSpeakingChange?.(false); };
  }, [stream, enabled, onSpeakingChange]);
  return <span className={`voice-meter ${level ? 'detecting' : ''}`} role="meter" aria-label={label} aria-valuenow={level} aria-valuemin="0" aria-valuemax="5">{[1, 2, 3, 4, 5].map((bar) => <i className={bar <= level ? 'on' : ''} key={bar} />)}</span>;
}

function VideoSurface({ stream, name, avatarSeed, muted = false, speaking = false, handRaised = false, presentation = false }) {
  const videoRef = useRef(null); const audioRef = useRef(null); const resumePlayback = useRef(null);
  const [playbackBlocked, setPlaybackBlocked] = useState(false); const [, refreshMedia] = useState(0);
  useEffect(() => {
    const video = videoRef.current; const audio = audioRef.current;
    if (!video || !audio) return undefined;
    let disposed = false;
    const attemptPlayback = async () => {
      if (disposed) return;
      await video.play().catch(() => {});
      const hasRemoteAudio = !muted && Boolean(audio.srcObject?.getAudioTracks().some((track) => track.readyState === 'live'));
      if (!hasRemoteAudio) { setPlaybackBlocked(false); return; }
      try { await audio.play(); if (!disposed) setPlaybackBlocked(false); }
      catch { if (!disposed) setPlaybackBlocked(true); }
    };
    const syncMedia = () => {
      if (disposed) return;
      video.srcObject = stream || null;
      const audioTracks = muted ? [] : (stream?.getAudioTracks() || []).filter((track) => track.readyState === 'live');
      audio.srcObject = audioTracks.length ? new MediaStream(audioTracks) : null;
      refreshMedia((version) => version + 1);
      attemptPlayback();
    };
    resumePlayback.current = attemptPlayback;
    const tracks = stream?.getTracks() || [];
    const trackChanged = () => { syncMedia(); };
    stream?.addEventListener('addtrack', trackChanged); stream?.addEventListener('removetrack', trackChanged);
    tracks.forEach((track) => { track.addEventListener('unmute', trackChanged); track.addEventListener('mute', trackChanged); track.addEventListener('ended', trackChanged); });
    syncMedia();
    return () => {
      disposed = true; resumePlayback.current = null;
      stream?.removeEventListener('addtrack', trackChanged); stream?.removeEventListener('removetrack', trackChanged);
      tracks.forEach((track) => { track.removeEventListener('unmute', trackChanged); track.removeEventListener('mute', trackChanged); track.removeEventListener('ended', trackChanged); });
      video.pause(); audio.pause(); video.srcObject = null; audio.srcObject = null;
    };
  }, [stream, muted]);
  useEffect(() => {
    if (!playbackBlocked) return undefined;
    const unlock = () => { resumePlayback.current?.(); };
    window.addEventListener('pointerdown', unlock, true);
    return () => window.removeEventListener('pointerdown', unlock, true);
  }, [playbackBlocked]);
  const hasVideo = Boolean(stream?.getVideoTracks().some((track) => track.enabled && track.readyState === 'live'));
  return <div className={`video-surface ${presentation ? 'presentation' : ''} ${speaking ? 'speaking' : ''} ${hasVideo ? 'has-video' : 'audio-only-surface'}`}>
    <video className={hasVideo ? '' : 'audio-only'} ref={videoRef} autoPlay playsInline muted controls={false} disablePictureInPicture controlsList="nodownload noplaybackrate noremoteplayback" />
    <audio className="remote-audio" ref={audioRef} autoPlay controls={false} preload="auto" />
    {!hasVideo && <ConstellationAvatar className="video-avatar" seed={avatarSeed || name} name={name} />}
    {!muted && playbackBlocked && <button className="resume-audio-button" type="button" onClick={() => resumePlayback.current?.()}><Volume2 /> Activar sonido</button>}
    <span className="video-name">{handRaised && <Hand />} {name}</span>
  </div>;
}

function waitForVideoMetadata(video) {
  if (video.videoWidth && video.videoHeight) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { cleanup(); reject(new Error('La pantalla seleccionada no entregó imagen. Intenta compartirla nuevamente.')); }, 5000);
    const ready = () => { if (!video.videoWidth || !video.videoHeight) return; cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error('No fue posible leer la pantalla seleccionada.')); };
    const cleanup = () => { clearTimeout(timeout); video.removeEventListener('loadedmetadata', ready); video.removeEventListener('resize', ready); video.removeEventListener('error', failed); };
    video.addEventListener('loadedmetadata', ready); video.addEventListener('resize', ready); video.addEventListener('error', failed); ready();
  });
}

async function createSharedAudioMixer(displayStream, microphoneStream) {
  const tracks = [...(displayStream?.getAudioTracks() || []), ...(microphoneStream?.getAudioTracks() || [])]
    .filter((track, index, items) => track.readyState === 'live' && items.findIndex((item) => item.id === track.id) === index);
  if (!tracks.length) return { track: null, close() {} };
  if (tracks.length === 1) return { track: tracks[0], close() {} };
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return { track: tracks[0], close() {} };

  const context = new Context(); const destination = context.createMediaStreamDestination(); const sources = [];
  tracks.forEach((track) => {
    const source = context.createMediaStreamSource(new MediaStream([track])); source.connect(destination); sources.push(source);
  });
  await context.resume?.().catch(() => {});
  if (context.state !== 'running') {
    sources.forEach((source) => source.disconnect()); destination.stream.getTracks().forEach((track) => track.stop()); context.close().catch(() => {});
    return { track: tracks[0], close() {} };
  }
  return {
    track: destination.stream.getAudioTracks()[0] || tracks[0],
    close() {
      sources.forEach((source) => source.disconnect());
      destination.stream.getTracks().forEach((track) => track.stop());
      context.close().catch(() => {});
    },
  };
}

function CropEditor({ stream, initialCrop, onConfirm, onCancel }) {
  const videoRef = useRef(null); const stageRef = useRef(null); const drag = useRef(null);
  const [crop, setCrop] = useState(initialCrop || { x: 12, y: 12, w: 64, h: 62 });
  useEffect(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, [stream]);
  const start = (event, mode = 'move') => { const r = stageRef.current.getBoundingClientRect(); drag.current = { mode, x: event.clientX, y: event.clientY, w: crop.w, h: crop.h, left: crop.x, top: crop.y, rw: r.width, rh: r.height }; event.currentTarget.setPointerCapture(event.pointerId); };
  const move = (event) => { if (!drag.current) return; const d = drag.current; const dx = (event.clientX - d.x) / d.rw * 100; const dy = (event.clientY - d.y) / d.rh * 100; if (d.mode === 'resize') setCrop((current) => ({ ...current, w: Math.max(12, Math.min(100 - d.left, d.w + dx)), h: Math.max(12, Math.min(100 - d.top, d.h + dy)) })); else setCrop((current) => ({ ...current, x: Math.max(0, Math.min(100 - current.w, d.left + dx)), y: Math.max(0, Math.min(100 - current.h, d.top + dy)) })); };
  return <div className="modal-backdrop"><div className="crop-modal glass" role="dialog" aria-modal="true">
    <div className="modal-title"><div><p className="eyebrow">ÁREA PERSONALIZADA</p><h2>Encuadra lo que quieres compartir</h2></div><button className="icon-button" onClick={onCancel}><X /></button></div>
    <p className="muted">El recorte se guardará en este navegador. Después de recargar solo tendrás que autorizar nuevamente la pantalla.</p>
    <div className="crop-stage" ref={stageRef}><video ref={videoRef} autoPlay muted playsInline /><div className="crop-shade" /><div className="crop-box" style={{ left: `${crop.x}%`, top: `${crop.y}%`, width: `${crop.w}%`, height: `${crop.h}%` }} onPointerDown={(event) => start(event, 'move')} onPointerMove={move} onPointerUp={() => { drag.current = null; }}><span className="crop-size">{Math.round(crop.w)}% × {Math.round(crop.h)}%</span><span className="crop-handle" onPointerDown={(event) => { event.stopPropagation(); start(event, 'resize'); }} onPointerMove={move} onPointerUp={() => { drag.current = null; }} /></div></div>
    <div className="modal-actions"><button className="secondary-button" onClick={onCancel}>Cancelar</button><button className="primary-button" onClick={() => onConfirm(crop)}>Compartir esta área</button></div>
  </div></div>;
}

function MeetingLobby({ busy, meetings, initialCode, onCreate, onJoin, onResume }) {
  const [tab, setTab] = useState(initialCode ? 'join' : 'create');
  const [create, setCreate] = useState({ title: '', password: '', waitingRoom: true });
  const [join, setJoin] = useState({ roomCode: initialCode, password: '' });
  return <div className="meeting-lobby">
    <section className="meeting-lobby-card surface"><p className="eyebrow">MEETING CENTER</p><h1>Reuniones privadas para tu comunidad</h1><p>Crea una sala persistente o entra con el código de una invitación.</p><div className="meeting-lobby-tabs"><button className={tab === 'create' ? 'active' : ''} onClick={() => setTab('create')}><Plus /> Crear reunión</button><button className={tab === 'join' ? 'active' : ''} onClick={() => setTab('join')}><LogIn /> Unirse</button></div>
      {tab === 'create' ? <form onSubmit={(event) => { event.preventDefault(); onCreate(create); }}><label>Título<input required value={create.title} onChange={(event) => setCreate({ ...create, title: event.target.value })} placeholder="Reunión de equipo" /></label><label>Contraseña opcional<input type="password" minLength="6" value={create.password} onChange={(event) => setCreate({ ...create, password: event.target.value })} placeholder="Mínimo 6 caracteres" /></label><label className="meeting-check"><input type="checkbox" checked={create.waitingRoom} onChange={(event) => setCreate({ ...create, waitingRoom: event.target.checked })} /><span><strong>Sala de espera</strong><small>El anfitrión admite a cada participante.</small></span></label><button className="primary-button" disabled={busy}><VideoSurfaceIcon /> {busy ? 'Creando…' : 'Crear e iniciar'}</button></form>
        : <form onSubmit={(event) => { event.preventDefault(); onJoin(join); }}><label>Código de reunión<input required value={join.roomCode} onChange={(event) => setJoin({ ...join, roomCode: event.target.value.toUpperCase() })} placeholder="ABCD-1234" /></label><label>Contraseña, si aplica<input type="password" value={join.password} onChange={(event) => setJoin({ ...join, password: event.target.value })} /></label><button className="primary-button" disabled={busy}><LogIn /> {busy ? 'Conectando…' : 'Entrar a la reunión'}</button></form>}
    </section>
    <aside className="meeting-history surface"><div className="panel-heading"><span>Mis reuniones</span><span className="count-pill">{meetings.length}</span></div>{meetings.length ? meetings.map((item) => <button key={item.id} disabled={!item.roomCode || item.status === 'ENDED'} onClick={() => onResume(item)}><span className={`meeting-status-dot ${item.status.toLowerCase()}`} /><div><strong>{item.title}</strong><small>{item.status === 'ENDED' ? 'Finalizada' : `${item.host ? 'Anfitrión' : 'Participante'} · ${item.roomCode || 'Código anterior no disponible'}`}</small></div><LogIn /></button>) : <p className="muted">Tus reuniones aparecerán aquí.</p>}</aside>
  </div>;
}

function VideoSurfaceIcon() { return <Users />; }

function ChatPanel({ messages, user, replyTo, setReplyTo, onSend, onReact }) {
  const [body, setBody] = useState(''); const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);
  const byId = Object.fromEntries(messages.map((item) => [item.id, item]));
  return <div className="meeting-chat-panel"><div className="meeting-chat-scroll">{messages.length ? messages.map((message) => { const reply = byId[message.replyToId]; return <article className={`meeting-message ${message.senderId === user.id ? 'mine' : ''}`} key={message.id}>{reply && <div className="message-reply-preview"><Reply /> <span><strong>{reply.senderName}</strong>{reply.body}</span></div>}<header><strong>{message.senderId === user.id ? 'Tú' : message.senderName}</strong><time>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></header><p>{message.body}</p><div className="message-actions"><button onClick={() => setReplyTo(message)}><Reply /> Responder</button>{EMOJIS.slice(0, 3).map((emoji) => <button className="quick-reaction" key={emoji} onClick={() => onReact(message, emoji)}>{emoji}</button>)}</div>{Boolean(message.reactions?.length) && <div className="message-reactions">{message.reactions.map((reaction) => <button className={reaction.mine ? 'mine' : ''} key={reaction.emoji} onClick={() => onReact(message, reaction.emoji)}>{reaction.emoji} {reaction.count}</button>)}</div>}</article>; }) : <div className="chat-empty"><MessageCircle /><p>El chat comienza aquí.</p></div>}<div ref={endRef} /></div>{replyTo && <div className="replying"><Reply /><span>Respondiendo a <strong>{replyTo.senderName}</strong></span><button onClick={() => setReplyTo(null)}><X /></button></div>}<form className="meeting-message-form" onSubmit={async (event) => { event.preventDefault(); const sent = body.trim(); if (!sent) return; setBody(''); await onSend(sent); }}><input value={body} onChange={(event) => setBody(event.target.value)} maxLength="2000" placeholder="Escribe un mensaje…" /><button className="icon-button" aria-label="Enviar"><Send /></button></form></div>;
}

function InvitePanel({ members, invited, onInvite, onClose }) {
  return <div className="modal-backdrop"><div className="invite-modal glass"><div className="modal-title"><div><p className="eyebrow">COMUNIDAD</p><h2>Invitar usuarios registrados</h2></div><button className="icon-button" onClick={onClose}><X /></button></div><div className="invite-list">{members.map((member) => <div className="person" key={member.id}><ConstellationAvatar className="avatar avatar-sm" seed={member.id} name={member.name} /><span><strong>{member.name}</strong><small>@{member.username}</small></span><button className="secondary-button" disabled={invited.includes(member.id)} onClick={() => onInvite(member)}>{invited.includes(member.id) ? <><Check /> Invitado</> : <><UserPlus /> Invitar</>}</button></div>)}{!members.length && <p className="muted">No hay otros usuarios registrados todavía.</p>}</div></div></div>;
}

export default function MeetingStudio({ toast, user, joinRequest }) {
  const activeKey = `galaxy_active_meeting_${user.id}`; const cropKey = `galaxy_share_crop_${user.id}`;
  const sourceStream = useRef(null); const sharingRef = useRef(null); const sharedAudio = useRef(null); const renderLoop = useRef(null); const connection = useRef(null); const mediaRef = useRef(new MediaStream()); const resumed = useRef(0); const handledJoinRequest = useRef(null); const lifecycleEpoch = useRef(0); const connectSequence = useRef(0); const entrySequence = useRef(0); const entryInFlight = useRef(null);
  const queryCode = new URLSearchParams(location.search).get('meeting')?.toUpperCase() || '';
  const [meetings, setMeetings] = useState([]); const [meeting, setMeeting] = useState(null); const [waiting, setWaiting] = useState(false); const [waitingParticipants, setWaitingParticipants] = useState([]); const [busy, setBusy] = useState(false);
  const [media, setMedia] = useState(null); const [sharing, setSharing] = useState(null); const [cropSource, setCropSource] = useState(null); const [savedCrop, setSavedCrop] = useState(() => { try { return JSON.parse(localStorage.getItem(cropKey) || 'null'); } catch { return null; } });
  const [mic, setMic] = useState(false); const [camera, setCamera] = useState(false); const [joined, setJoined] = useState(false); const [status, setStatus] = useState('offline');
  const [participants, setParticipants] = useState([]); const [remoteStreams, setRemoteStreams] = useState({}); const [peerStates, setPeerStates] = useState({});
  const [handRaised, setHandRaised] = useState(false); const [reactionMenu, setReactionMenu] = useState(false); const [reactions, setReactions] = useState([]); const [shareMenu, setShareMenu] = useState(false); const [localSpeaking, setLocalSpeaking] = useState(false);
  const [sideTab, setSideTab] = useState('people'); const [messages, setMessages] = useState([]); const [replyTo, setReplyTo] = useState(null); const [inviteOpen, setInviteOpen] = useState(false); const [members, setMembers] = useState([]); const [invited, setInvited] = useState([]);

  const rememberMeeting = (value) => { localStorage.setItem(activeKey, JSON.stringify({ roomCode: value.roomCode, title: value.title, role: value.role || (value.host ? 'HOST' : 'PARTICIPANT') })); };
  const forgetMeeting = () => { localStorage.removeItem(activeKey); };
  const mergeMessage = useCallback((message) => setMessages((items) => items.some((item) => item.id === message.id) ? items.map((item) => item.id === message.id ? { ...item, ...message } : item) : [...items, message]), []);
  const applyChatReaction = useCallback((update) => { if (!update.emoji) return; setMessages((items) => items.map((item) => { if (item.id !== update.messageId) return item; const reactions = [...(item.reactions || [])]; const index = reactions.findIndex((entry) => entry.emoji === update.emoji); if (index < 0 && update.active) reactions.push({ emoji: update.emoji, count: 1, mine: update.userId === user.id }); else if (index >= 0) { const current = reactions[index]; const count = Math.max(0, current.count + (update.active ? 1 : -1)); if (!count) reactions.splice(index, 1); else reactions[index] = { ...current, count, ...(update.userId === user.id ? { mine: update.active } : {}) }; } return { ...item, reactions }; })); }, [user.id]);
  const showReaction = ({ emoji }) => { const id = crypto.randomUUID(); setReactions((items) => [...items, { id, emoji }]); setTimeout(() => setReactions((items) => items.filter((item) => item.id !== id)), 2400); };

  const stopMedia = () => { mediaRef.current.getTracks().forEach((track) => track.stop()); mediaRef.current = new MediaStream(); setMedia(null); setMic(false); setCamera(false); };
  const disconnect = useCallback((clearMeeting = false) => { entrySequence.current += 1; connectSequence.current += 1; connection.current?.disconnect(); connection.current = null; setJoined(false); setWaiting(false); setParticipants([]); setRemoteStreams({}); setPeerStates({}); setStatus('offline'); setHandRaised(false); if (clearMeeting) { setMeeting(null); setMessages([]); forgetMeeting(); } }, []);
  useEffect(() => {
    const epoch = ++lifecycleEpoch.current;
    return () => { if (lifecycleEpoch.current === epoch) lifecycleEpoch.current += 1; entrySequence.current += 1; connectSequence.current += 1; connection.current?.disconnect(); connection.current = null; sharedAudio.current?.close(); mediaRef.current.getTracks().forEach((track) => track.stop()); sourceStream.current?.getTracks().forEach((track) => track.stop()); sharingRef.current?.getTracks().forEach((track) => track.stop()); cancelAnimationFrame(renderLoop.current); };
  }, []);
  useEffect(() => { primeRealtime(user.id).catch(() => {}); return () => releaseRealtimePrime(user.id); }, [user.id]);
  useEffect(() => { api.getMyMeetings().then(setMeetings).catch((error) => toast(error.message, 'error')); }, []);

  const connectAccess = async (access, expectedEpoch = lifecycleEpoch.current) => {
    if (expectedEpoch !== lifecycleEpoch.current) return false;
    const sequence = ++connectSequence.current;
    const legacyParticipantStatus = ['ADMITTED', 'WAITING', 'INVITED', 'DENIED'].includes(access.status) ? access.status : null;
    const normalized = { ...access, role: access.role || (access.host ? 'HOST' : 'PARTICIPANT'), participantStatus: access.participantStatus || legacyParticipantStatus || (access.host ? 'ADMITTED' : null) };
    setMeeting(normalized); setMessages(normalized.messages || []); rememberMeeting(normalized);
    if (normalized.participantStatus !== 'ADMITTED') { setWaiting(true); setStatus('waiting'); return true; }
    setWaiting(false); setJoined(true); setStatus('signaling'); connection.current?.disconnect();
    const isCurrent = (client) => expectedEpoch === lifecycleEpoch.current && sequence === connectSequence.current && connection.current === client;
    let client;
    client = new SupabaseMeetingConnection({
      onStatus: (value) => { if (isCurrent(client)) setStatus(value); }, onParticipants: (value) => { if (isCurrent(client)) setParticipants(value); },
      onRemoteStream: (peerId, stream) => { if (isCurrent(client)) setRemoteStreams((current) => { const next = { ...current }; if (stream) next[peerId] = stream; else delete next[peerId]; return next; }); },
      onPeerState: (peerId, state) => { if (isCurrent(client)) setPeerStates((current) => ({ ...current, [peerId]: state })); }, onReaction: (value) => { if (isCurrent(client)) showReaction(value); }, onChat: (value) => { if (isCurrent(client)) mergeMessage(value); },
      onChatHistory: (history) => { if (isCurrent(client)) history.forEach(mergeMessage); }, onChatReaction: (value) => { if (isCurrent(client)) applyChatReaction(value); },
      onForceMute: ({ by }) => { if (!isCurrent(client)) return; const track = mediaRef.current.getAudioTracks()[0]; if (track) track.enabled = false; setMic(false); client.setPresence({ mic: false, speaking: false }); toast(`${by || 'El anfitrión'} silenció tu micrófono.`, 'info'); },
      onMeetingEnded: async ({ by }) => { if (!isCurrent(client)) return; await stopShare(); disconnect(true); stopMedia(); toast(`${by || 'El anfitrión'} finalizó la reunión.`, 'info'); },
    });
    client.setPresence({ mic, camera, sharing: false, handRaised, speaking: false }); connection.current = client;
    try {
      await client.connect({ roomId: normalized.meetingId, role: normalized.role, stream: mediaRef.current, iceServers: normalized.iceServers, user });
      if (!isCurrent(client)) { client.disconnect(); return false; }
      toast(`Conectado a ${normalized.title}.`);
      return true;
    } catch (error) { client.disconnect(); if (!isCurrent(client) || error.name === 'AbortError') return false; connection.current = null; setJoined(false); throw error; }
  };

  const enterMeeting = ({ roomCode, password = '' }) => {
    const epoch = lifecycleEpoch.current; const key = `${epoch}:${String(roomCode).toUpperCase()}:${password}`;
    if (entryInFlight.current?.key === key) return entryInFlight.current.promise;
    const requestId = ++entrySequence.current;
    const promise = (async () => { setBusy(true); try { const access = await getMeetingAccess({ roomCode, password }); if (epoch !== lifecycleEpoch.current || requestId !== entrySequence.current) return false; return await connectAccess(access, epoch); } catch (error) { if (epoch === lifecycleEpoch.current && requestId === entrySequence.current) { disconnect(true); toast(error.message, 'error'); } return false; } finally { const ownsEntry = entryInFlight.current?.promise === promise; if (ownsEntry) entryInFlight.current = null; if (ownsEntry && epoch === lifecycleEpoch.current) setBusy(false); } })();
    entryInFlight.current = { key, promise }; return promise;
  };
  useEffect(() => { const epoch = lifecycleEpoch.current; if (resumed.current === epoch) return; resumed.current = epoch; if (joinRequest?.roomCode) return; try { const saved = JSON.parse(localStorage.getItem(activeKey) || 'null'); if (saved?.roomCode) enterMeeting({ roomCode: saved.roomCode }); } catch { forgetMeeting(); } }, []);
  useEffect(() => {
    const epoch = lifecycleEpoch.current; if (!joinRequest?.roomCode || (handledJoinRequest.current?.id === joinRequest.id && handledJoinRequest.current?.epoch === epoch)) return;
    handledJoinRequest.current = { id: joinRequest.id, epoch }; enterMeeting({ roomCode: joinRequest.roomCode });
  }, [joinRequest?.id, joinRequest?.roomCode]);

  useEffect(() => {
    if (!waiting || !meeting?.roomCode || !meeting?.meetingId) return undefined;
    let connecting = false;
    const refresh = async () => { if (connecting) return; connecting = true; try { const access = await getMeetingAccess({ roomCode: meeting.roomCode }); if ((access.participantStatus || access.status) === 'ADMITTED') await connectAccess(access); } catch (error) { if (/no autorizó|terminó/.test(error.message)) { disconnect(true); toast(error.message, 'error'); } } finally { connecting = false; } };
    const unsubscribe = api.onMeetingParticipantChange(meeting.meetingId, refresh); const timer = setInterval(refresh, 5_000);
    return () => { unsubscribe(); clearInterval(timer); };
  }, [waiting, meeting?.roomCode, meeting?.meetingId]);
  useEffect(() => {
    if (!joined || meeting?.role !== 'HOST') return undefined;
    const refresh = async () => { try { const state = await api.getMeetingState({ meetingId: meeting.meetingId }); setWaitingParticipants(state.waitingParticipants || []); setMeeting((current) => ({ ...current, locked: state.locked })); if (state.status === 'ENDED') disconnect(true); } catch {} };
    refresh(); const unsubscribe = api.onMeetingParticipantChange(meeting.meetingId, refresh); const timer = setInterval(refresh, 10_000);
    return () => { unsubscribe(); clearInterval(timer); };
  }, [joined, meeting?.meetingId, meeting?.role]);

  const createMeeting = async (form) => { setBusy(true); try { const created = await api.createMeeting(form); setMeetings((items) => [created, ...items]); await connectAccess(created); } catch (error) { disconnect(true); toast(error.message, 'error'); } finally { setBusy(false); } };
  const sharedLocalStream = async (screen, microphone = mediaRef.current) => {
    sharedAudio.current?.close();
    sharedAudio.current = await createSharedAudioMixer(sourceStream.current, microphone);
    return new MediaStream([...(sharedAudio.current.track ? [sharedAudio.current.track] : []), ...screen.getVideoTracks()]);
  };
  const publishMedia = async (next) => { mediaRef.current = next; setMedia(next); await connection.current?.setLocalStream(sharing ? await sharedLocalStream(sharing, next) : next); };
  const acquireTrack = async (kind) => { if (!navigator.mediaDevices?.getUserMedia) throw new Error('Tu navegador no ofrece captura de cámara y micrófono.'); const captured = await navigator.mediaDevices.getUserMedia({ audio: kind === 'audio', video: kind === 'video' }); const track = captured.getTracks()[0]; const retained = mediaRef.current.getTracks().filter((item) => item.kind !== kind); await publishMedia(new MediaStream([...retained, track])); return track; };
  const toggleTrack = async (kind) => { try { const isAudio = kind === 'audio'; const active = isAudio ? mic : camera; let track = mediaRef.current.getTracks().find((item) => item.kind === kind && item.readyState === 'live'); if (!track) track = await acquireTrack(kind); else track.enabled = !active; const enabled = track.enabled; if (isAudio) setMic(enabled); else setCamera(enabled); connection.current?.setPresence({ mic: isAudio ? enabled : mic, camera: isAudio ? camera : enabled, sharing: Boolean(sharing), handRaised, speaking: isAudio ? localSpeaking && enabled : localSpeaking }); } catch (error) { toast(error.message || 'No fue posible acceder al dispositivo.', 'error'); } };
  const stopShare = async () => { sharedAudio.current?.close(); sharedAudio.current = null; sourceStream.current?.getTracks().forEach((track) => track.stop()); sharingRef.current?.getTracks().forEach((track) => track.stop()); cancelAnimationFrame(renderLoop.current); sourceStream.current = null; sharingRef.current = null; setSharing(null); setCropSource(null); await connection.current?.setLocalStream(mediaRef.current); connection.current?.setPresence({ sharing: false }); };
  const publishShare = async (stream) => { sharingRef.current = stream; setSharing(stream); await connection.current?.setLocalStream(await sharedLocalStream(stream)); connection.current?.setPresence({ sharing: true }); };
  const capture = async (custom = false) => { setShareMenu(false); if (!joined) return; try { if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('La captura de pantalla no está disponible en este navegador.'); const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 24, max: 30 } }, audio: true }); sourceStream.current = stream; stream.getVideoTracks()[0].addEventListener('ended', stopShare, { once: true }); if (custom) setCropSource(stream); else { await publishShare(stream); toast(stream.getAudioTracks().length ? 'Pantalla y sonido compartidos por WebRTC.' : 'Pantalla compartida sin sonido. Selecciona una pestaña y activa Compartir audio cuando el navegador lo ofrezca.', 'info'); } } catch (error) { if (error.name !== 'NotAllowedError') toast(error.message, 'error'); } };
  const confirmCrop = async (crop) => {
    try {
      localStorage.setItem(cropKey, JSON.stringify(crop)); setSavedCrop(crop);
      const video = document.createElement('video'); video.srcObject = cropSource; video.muted = true; video.playsInline = true;
      await video.play(); await waitForVideoMetadata(video);
      const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx || typeof canvas.captureStream !== 'function') throw new Error('Tu navegador no permite compartir un área procesada.');
      const draw = () => {
        const sx = video.videoWidth * crop.x / 100; const sy = video.videoHeight * crop.y / 100;
        const sw = video.videoWidth * crop.w / 100; const sh = video.videoHeight * crop.h / 100; const scale = Math.min(1, 1280 / sw);
        if (canvas.width !== Math.round(sw * scale) || canvas.height !== Math.round(sh * scale)) { canvas.width = Math.max(2, Math.round(sw * scale)); canvas.height = Math.max(2, Math.round(sh * scale)); }
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height); renderLoop.current = requestAnimationFrame(draw);
      };
      draw(); const processed = canvas.captureStream(24); setCropSource(null); await publishShare(processed); toast(sourceStream.current?.getAudioTracks().length ? 'Área y sonido compartidos por WebRTC.' : 'Área compartida sin sonido. El navegador no entregó audio de la fuente seleccionada.', 'info');
    } catch (error) { await stopShare(); toast(error.message || 'No fue posible compartir el área seleccionada.', 'error'); }
  };
  const toggleHand = () => { const next = !handRaised; setHandRaised(next); connection.current?.setPresence({ mic, camera, sharing: Boolean(sharing), handRaised: next, speaking: localSpeaking }); };
  const react = (emoji) => { connection.current?.react(emoji); showReaction({ emoji }); setReactionMenu(false); };
  const speakingChanged = useCallback((speaking) => { setLocalSpeaking(speaking); connection.current?.setPresence({ mic, camera, sharing: Boolean(sharing), handRaised, speaking }); }, [mic, camera, sharing, handRaised]);
  const sendChat = async (body) => { try { const message = await api.postMeetingMessage({ meetingId: meeting.meetingId, body, replyToId: replyTo?.id || '' }); mergeMessage(message); connection.current?.chat(message); setReplyTo(null); } catch (error) { toast(error.message, 'error'); } };
  const reactToMessage = async (message, emoji) => { try { const update = await api.reactToMeetingMessage({ meetingId: meeting.meetingId, messageId: message.id, emoji }); applyChatReaction(update); connection.current?.reactToChat(update); } catch (error) { toast(error.message, 'error'); } };
  const copyInvite = async () => { const url = new URL(location.href); url.pathname = url.pathname.replace(/\/dist\/index\.html$/, '/'); url.search = ''; url.hash = ''; url.searchParams.set('meeting', meeting.roomCode); await navigator.clipboard.writeText(`${meeting.title}\nCódigo: ${meeting.roomCode}\n${url.href}`); toast('Invitación copiada.'); };
  const openInvites = async () => { setInviteOpen(true); try { setMembers(await api.getCommunityMembers()); } catch (error) { toast(error.message, 'error'); } };
  const invite = async (member) => { try { await api.inviteToMeeting({ meetingId: meeting.meetingId, userId: member.id }); setInvited((items) => [...items, member.id]); toast(`${member.name} recibió la invitación.`); } catch (error) { toast(error.message, 'error'); } };
  const admission = async (participant, admit) => { try { await api[admit ? 'admitMeetingParticipant' : 'denyMeetingParticipant']({ meetingId: meeting.meetingId, participantId: participant.id }); setWaitingParticipants((items) => items.filter((item) => item.id !== participant.id)); toast(admit ? `${participant.name} puede entrar.` : `${participant.name} fue rechazado.`); } catch (error) { toast(error.message, 'error'); } };
  const toggleLock = async () => { try { const result = await api.setMeetingLocked({ meetingId: meeting.meetingId, locked: !meeting.locked }); setMeeting({ ...meeting, locked: result.locked }); toast(result.locked ? 'Sala bloqueada.' : 'Sala desbloqueada.'); } catch (error) { toast(error.message, 'error'); } };
  const endMeeting = async () => { if (!confirm('¿Finalizar la reunión para todos? Esta acción no se puede deshacer.')) return; try { await api.endMeeting({ meetingId: meeting.meetingId }); await connection.current?.endMeeting(); await stopShare(); disconnect(true); stopMedia(); toast('Reunión finalizada para todos.'); } catch (error) { toast(error.message, 'error'); } };
  const leave = async () => { await stopShare(); disconnect(true); stopMedia(); toast(meeting?.role === 'HOST' ? 'Saliste; la reunión seguirá activa hasta que la finalices.' : 'Saliste de la reunión.'); api.getMyMeetings().then(setMeetings).catch(() => {}); };

  if (!meeting) return <MeetingLobby busy={busy} meetings={meetings} initialCode={queryCode} onCreate={createMeeting} onJoin={enterMeeting} onResume={(item) => enterMeeting({ roomCode: item.roomCode })} />;
  if (waiting) return <div className="meeting-waiting surface"><span className="waiting-orbit" /><p className="eyebrow">SALA DE ESPERA</p><h1>{meeting.title}</h1><p>El anfitrión recibió tu solicitud. Esta pantalla entrará automáticamente cuando te admita.</p><strong>{meeting.roomCode}</strong><button className="secondary-button" onClick={() => disconnect(true)}>Cancelar</button></div>;

  const remoteEntries = Object.entries(remoteStreams); const isHost = meeting.role === 'HOST';
  const remotePresentation = remoteEntries.find(([peerId, stream]) => participants.find((item) => item.peerId === peerId)?.sharing && stream.getVideoTracks().some((track) => track.readyState === 'live'));
  const presentationStream = sharing || remotePresentation?.[1];
  const presentationPeer = remotePresentation && participants.find((item) => item.peerId === remotePresentation[0]);
  return <section className="meeting-page">
    <div className="meeting-top"><div><p className="eyebrow">REUNIÓN ACTIVA</p><h1>{meeting.title}</h1></div><div className="meeting-top-actions"><button className="secondary-button" onClick={copyInvite}><Copy /> {meeting.roomCode}</button>{isHost && <button className="secondary-button" onClick={openInvites}><UserPlus /> Invitar</button>}<div className={`secure-pill ${status}`}><ShieldCheck /> {status === 'connected' ? 'WebRTC conectado' : status === 'signaling' ? 'Conectando…' : 'Fuera de línea'}</div></div></div>
    <div className="meeting-grid">
      <div className="meeting-stage">{presentationStream ? <><VideoSurface presentation stream={presentationStream} name={sharing ? 'Tu pantalla' : `${presentationPeer?.name || 'Participante'} · pantalla`} avatarSeed={sharing ? user.id : presentationPeer?.userId} muted={Boolean(sharing)} /><span className="presenter-label">{sharing ? 'Tu pantalla · compartiendo por WebRTC' : `${presentationPeer?.name || 'Participante'} está compartiendo`}</span></> : <div className="video-grid"><VideoSurface stream={media} name={`${user.name} · Tú`} avatarSeed={user.id} muted speaking={localSpeaking} handRaised={handRaised} />{remoteEntries.map(([peerId, stream]) => { const peer = participants.find((item) => item.peerId === peerId); return <VideoSurface key={peerId} stream={stream} name={peer?.name || 'Participante'} avatarSeed={peer?.userId || peerId} speaking={peer?.speaking} handRaised={peer?.handRaised} />; })}</div>}<div className="reaction-layer">{reactions.map((item) => <span key={item.id}>{item.emoji}</span>)}</div></div>
      <aside className="meeting-side"><div className="meeting-side-tabs"><button className={sideTab === 'people' ? 'active' : ''} onClick={() => setSideTab('people')}><Users /> Personas <span>{participants.length + 1}</span></button><button className={sideTab === 'chat' ? 'active' : ''} onClick={() => setSideTab('chat')}><MessageCircle /> Chat <span>{messages.length}</span></button></div>{sideTab === 'people' ? <><div className="people-list"><div className={`person ${localSpeaking ? 'speaking' : ''}`}><ConstellationAvatar className="avatar avatar-sm" seed={user.id} name={user.name} /><span>{user.name} · Tú {isHost && <small>Anfitrión</small>} {handRaised && '✋'}</span><AudioMeter stream={media} enabled={mic} onSpeakingChange={speakingChanged} />{mic ? <Mic /> : <MicOff />}</div>{participants.map((peer) => <div className={`person ${peer.speaking ? 'speaking' : ''}`} key={peer.peerId}><ConstellationAvatar className="avatar avatar-sm" seed={peer.userId || peer.peerId} name={peer.name} /><span>{peer.name} {peer.handRaised && '✋'}<small>{peer.role === 'HOST' ? 'Anfitrión' : peerStates[peer.peerId] === 'connected' ? 'Audio P2P conectado' : 'Enlazando medios'}</small></span><AudioMeter stream={remoteStreams[peer.peerId]} enabled={peer.mic} />{isHost && peer.role !== 'HOST' && peer.mic ? <button className="host-mute" title="Silenciar participante" onClick={() => connection.current?.mutePeer(peer.peerId)}><MicOff /></button> : peer.mic ? <Mic /> : <MicOff />}</div>)}</div>{isHost && waitingParticipants.length > 0 && <div className="waiting-list"><p className="eyebrow">ESPERANDO ({waitingParticipants.length})</p>{waitingParticipants.map((item) => <div className="person" key={item.id}><ConstellationAvatar className="avatar avatar-sm" seed={item.userId} name={item.name} /><span>{item.name}<small>@{item.username}</small></span><button title="Admitir" onClick={() => admission(item, true)}><Check /></button><button title="Rechazar" onClick={() => admission(item, false)}><X /></button></div>)}</div>}<div className="meeting-side-footer"><button className="secondary-button" onClick={copyInvite}><Copy /> Copiar invitación</button>{isHost && <button className="secondary-button" onClick={toggleLock}>{meeting.locked ? <Unlock /> : <Lock />} {meeting.locked ? 'Desbloquear' : 'Bloquear sala'}</button>}</div></> : <ChatPanel messages={messages} user={user} replyTo={replyTo} setReplyTo={setReplyTo} onSend={sendChat} onReact={reactToMessage} />}</aside>
    </div>
    <div className="control-dock glass"><button className={mic ? 'active' : ''} disabled={!joined} onClick={() => toggleTrack('audio')}>{mic ? <Mic /> : <MicOff />}<AudioMeter stream={media} enabled={mic} /><span>{mic ? 'Silenciar' : 'Activar audio'}</span></button><button className={camera ? 'active' : ''} disabled={!joined} onClick={() => toggleTrack('video')}>{camera ? <Camera /> : <CameraOff />}<span>{camera ? 'Apagar cámara' : 'Iniciar video'}</span></button><div className="share-wrap"><button className={sharing ? 'active' : ''} disabled={!joined} onClick={() => sharing ? stopShare() : setShareMenu(!shareMenu)}><MonitorUp /><span>{sharing ? 'Detener' : 'Compartir'}</span></button>{shareMenu && <div className="share-menu glass"><button onClick={() => capture(false)}><MonitorUp />Pantalla, ventana o pestaña<span>Selector seguro del navegador</span></button><button onClick={() => capture(true)}><span className="crop-icon" />Área personalizada<span>{savedCrop ? 'Reutilizar el recorte guardado' : 'Captura autorizada + recorte local'}</span></button></div>}</div><button className={handRaised ? 'active' : ''} disabled={!joined} onClick={toggleHand}><Hand /><span>{handRaised ? 'Bajar mano' : 'Alzar mano'}</span></button><div className="reaction-wrap"><button disabled={!joined} onClick={() => setReactionMenu(!reactionMenu)}><SmilePlus /><span>Reaccionar</span></button>{reactionMenu && <div className="reaction-menu glass">{EMOJIS.map((emoji) => <button key={emoji} onClick={() => react(emoji)}>{emoji}</button>)}</div>}</div><button className="leave-control" onClick={leave}><PhoneOff /><span>Salir</span></button>{isHost && <button className="end-control" onClick={endMeeting}><X /><span>Finalizar</span></button>}</div>
    {cropSource && <CropEditor stream={cropSource} initialCrop={savedCrop} onConfirm={confirmCrop} onCancel={stopShare} />}{inviteOpen && <InvitePanel members={members} invited={invited} onInvite={invite} onClose={() => setInviteOpen(false)} />}
  </section>;
}
