import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Check, Copy, Eraser, Hand, Lock, LogIn, MessageCircle, Mic, MicOff, MonitorUp, MousePointer2, Pencil, PhoneOff, PictureInPicture2, Plus, Reply, RotateCcw, Send, ShieldCheck, SmilePlus, Trash2, Unlock, UserPlus, Users, Volume2, VolumeX, X } from 'lucide-react';
import { api } from '../services/api';
import { getMeetingAccess, SupabaseMeetingConnection } from '../services/meetingClient';
import { onOnlineUsersChange, primeRealtime, releaseRealtimePrime } from '../services/supabase';
import ConstellationAvatar from './ConstellationAvatar';

const EMOJIS = ['👍', '👏', '❤️', '😂', '🎉', '🔥'];
const MESSAGE_EMOJIS = [...EMOJIS, '😊', '🙏', '🤔', '✅', '🚀', '💡'];
const MONEY_ROCKET_REACTION = 'MONEY_ROCKET';
const MONEY_ROCKET_ASSET = `${import.meta.env.BASE_URL}assets/money-rocket-reaction.png`;
const MONEY_CHARACTER_ASSET = `${import.meta.env.BASE_URL}assets/money-character-reaction.png`;
const MONEY_ALIEN_ASSET = `${import.meta.env.BASE_URL}assets/money-alien-reaction.png`;
const MONEY_PHOENIX_ASSET = `${import.meta.env.BASE_URL}assets/money-phoenix-reaction.png`;
const PHOENIX_TRANSFORM_REACTION = 'PHOENIX_TRANSFORM';
const PHOENIX_BASE_ASSET = `${import.meta.env.BASE_URL}assets/phoenix-base-reaction.png`;
const PHOENIX_SUPER_ASSET = `${import.meta.env.BASE_URL}assets/phoenix-super-reaction.png`;
const PHOENIX_LIGHTNING_ASSET = `${import.meta.env.BASE_URL}assets/phoenix-lightning.webm`;
const COSMIC_REACTIONS = [
  { id: MONEY_ROCKET_REACTION, label: 'Cohete de dinero', asset: MONEY_ROCKET_ASSET },
  { id: 'MONEY_CHARACTER', label: 'Personaje millonario', asset: MONEY_CHARACTER_ASSET },
  { id: 'MONEY_ALIEN', label: 'Portal alien de dinero', asset: MONEY_ALIEN_ASSET },
  { id: 'MONEY_PHOENIX', label: 'Fénix de poder', asset: MONEY_PHOENIX_ASSET },
  { id: PHOENIX_TRANSFORM_REACTION, label: 'Transformación del fénix', asset: PHOENIX_BASE_ASSET },
  { id: 'UFO', label: 'Lanzar UFO', icon: '🛸' },
  { id: 'ALIEN', label: 'Enviar alien', icon: '👽' },
  { id: 'ALIEN_BIRTHDAY', label: 'Alien de cumpleaños', icon: '🎂' },
];

function PhoenixTransformReaction({ senderName }) {
  const videoRef = useRef(null);
  useEffect(() => {
    const video = videoRef.current; if (!video) return undefined;
    video.volume = .72; video.currentTime = 0;
    const play = () => video.play().catch(() => {});
    play(); window.addEventListener('galaxy:resume-meeting-audio', play); window.addEventListener('pointerdown', play, true);
    return () => { window.removeEventListener('galaxy:resume-meeting-audio', play); window.removeEventListener('pointerdown', play, true); video.pause(); };
  }, []);
  return <span className="phoenix-transform-reaction" role="img" aria-label="Fénix transformándose con un estallido y rayos"><video ref={videoRef} src={PHOENIX_LIGHTNING_ASSET} autoPlay playsInline preload="auto" controls={false} disablePictureInPicture /><img className="phoenix-base-form" src={PHOENIX_BASE_ASSET} alt="" /><i aria-hidden="true" /><b aria-hidden="true" /><img className="phoenix-super-form" src={PHOENIX_SUPER_ASSET} alt="" /><small className="reaction-sender">{senderName}</small></span>;
}

function voiceCaptureConstraints() {
  return {
    echoCancellation: { ideal: true },
    noiseSuppression: { ideal: true },
    autoGainControl: { ideal: true },
    channelCount: { ideal: 1 },
  };
}

let sharedMeetingAudioContext = null;

function meetingAudioContext() {
  const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Context) return null;
  if (!sharedMeetingAudioContext || sharedMeetingAudioContext.state === 'closed') sharedMeetingAudioContext = new Context();
  return sharedMeetingAudioContext;
}

function primeMeetingAudio() {
  const context = meetingAudioContext();
  if (context?.state === 'suspended') context.resume().catch(() => {});
  window.dispatchEvent(new Event('galaxy:resume-meeting-audio'));
}

function CosmicReaction({ reaction, senderName }) {
  const sender = <small className="reaction-sender">{senderName || 'Participante'}</small>;
  if (reaction === MONEY_ROCKET_REACTION) return <span className="money-rocket-reaction"><img src={MONEY_ROCKET_ASSET} alt="" />{sender}</span>;
  if (reaction === 'MONEY_CHARACTER') return <span className="money-character-reaction" role="img" aria-label="Personaje rodeado de dinero"><img src={MONEY_CHARACTER_ASSET} alt="" />{sender}</span>;
  if (reaction === 'MONEY_ALIEN') return <span className="money-alien-reaction" role="img" aria-label="Alien en un portal de dinero"><img src={MONEY_ALIEN_ASSET} alt="" />{sender}</span>;
  if (reaction === 'MONEY_PHOENIX') return <span className="money-phoenix-reaction" role="img" aria-label="Fénix poderoso ascendiendo entre dinero y destellos"><i aria-hidden="true" /><img src={MONEY_PHOENIX_ASSET} alt="" /><b aria-hidden="true">$ ✦ $ ✦ $</b>{sender}</span>;
  if (reaction === PHOENIX_TRANSFORM_REACTION) return <PhoenixTransformReaction senderName={senderName || 'Participante'} />;
  if (reaction === 'UFO') return <span className="ufo-reaction" role="img" aria-label="UFO"><i className="ufo-dome" /><i className="ufo-body"><b /><b /><b /></i><i className="ufo-beam" />{sender}</span>;
  if (reaction === 'ALIEN') return <span className="alien-reaction" role="img" aria-label="Alien"><i>👽</i><b>¡Saludos, terrícola!</b>{sender}</span>;
  if (reaction === 'ALIEN_BIRTHDAY') return <span className="alien-birthday-reaction" role="img" aria-label="Alien deseando feliz cumpleaños"><i>👽</i><b>Happy Birthday!</b><em>🎉</em><em>🎂</em>{sender}</span>;
  return <span><i className="reaction-symbol">{reaction}</i>{sender}</span>;
}

function createMeetingPipPlaceholder(title) {
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
  const context = canvas.getContext('2d');
  if (!context || typeof canvas.captureStream !== 'function') return null;
  const stars = Array.from({ length: 36 }, (_, index) => ({ x: (index * 97) % canvas.width, y: (index * 53) % canvas.height, r: 1 + index % 3 }));
  const draw = () => {
    const glow = context.createRadialGradient(320, 155, 18, 320, 155, 300);
    glow.addColorStop(0, '#3a2162'); glow.addColorStop(.48, '#171021'); glow.addColorStop(1, '#070509');
    context.fillStyle = glow; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'rgba(210,190,255,.72)'; stars.forEach((star) => { context.beginPath(); context.arc(star.x, star.y, star.r, 0, Math.PI * 2); context.fill(); });
    context.beginPath(); context.arc(320, 145, 58, 0, Math.PI * 2); context.strokeStyle = '#9b70ed'; context.lineWidth = 2; context.shadowBlur = 28; context.shadowColor = '#8b58e0'; context.stroke(); context.shadowBlur = 0;
    context.fillStyle = '#eee6fa'; context.textAlign = 'center'; context.font = '600 25px Manrope, sans-serif'; context.fillText(String(title || 'Reunión activa').slice(0, 38), 320, 250);
    context.fillStyle = '#72d69f'; context.font = '600 15px DM Sans, sans-serif'; context.fillText('●  Audio conectado', 320, 282);
  };
  draw(); const timer = setInterval(draw, 1000); const stream = canvas.captureStream(4);
  return { stream, close() { clearInterval(timer); stream.getTracks().forEach((track) => track.stop()); } };
}

function announceRaisedHand(name) {
  const synthesis = globalThis.speechSynthesis; const Utterance = globalThis.SpeechSynthesisUtterance;
  if (!synthesis || typeof Utterance !== 'function') return;
  const participantName = String(name || 'Un participante').replace(/\s+/g, ' ').trim().slice(0, 100) || 'Un participante';
  const announcement = new Utterance(`${participantName} tiene una pregunta.`);
  announcement.lang = 'es-CO'; announcement.rate = .96; announcement.pitch = 1; announcement.volume = .9;
  const spanishVoice = synthesis.getVoices?.().find((voice) => /^es(?:-|_)/i.test(voice.lang));
  if (spanishVoice) announcement.voice = spanishVoice;
  synthesis.speak(announcement);
}

function AudioMeter({ stream, enabled = true, onSpeakingChange, label = 'Nivel de voz' }) {
  const [level, setLevel] = useState(0); const speakingRef = useRef(false);
  useEffect(() => {
    if (!stream || !enabled || !stream.getAudioTracks().length) { setLevel(0); if (speakingRef.current) onSpeakingChange?.(false); speakingRef.current = false; return undefined; }
    const context = meetingAudioContext(); if (!context) return undefined;
    const analyser = context.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = .72;
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
    read(); return () => { cancelAnimationFrame(frame); source.disconnect(); analyser.disconnect(); if (speakingRef.current) onSpeakingChange?.(false); };
  }, [stream, enabled, onSpeakingChange]);
  return <span className={`voice-meter ${level ? 'detecting' : ''}`} role="meter" aria-label={label} aria-valuenow={level} aria-valuemin="0" aria-valuemax="5">{[1, 2, 3, 4, 5].map((bar) => <i className={bar <= level ? 'on' : ''} key={bar} />)}</span>;
}

function VideoSurface({ stream, name, avatarSeed, avatar = '', muted = false, playAudio = true, speaking = false, handRaised = false, presentation = false, mirrored = false }) {
  const videoRef = useRef(null); const audioRef = useRef(null); const resumePlayback = useRef(null);
  const [playbackBlocked, setPlaybackBlocked] = useState(false); const [, refreshMedia] = useState(0);
  useEffect(() => {
    const video = videoRef.current; const audio = audioRef.current;
    if (!video || !audio) return undefined;
    let disposed = false;
    const attemptPlayback = async () => {
      if (disposed) return;
      await video.play().catch(() => {});
      const hasRemoteAudio = !muted && playAudio && Boolean(audio.srcObject?.getAudioTracks().some((track) => track.readyState === 'live'));
      if (!hasRemoteAudio) { setPlaybackBlocked(false); return; }
      try { await audio.play(); if (!disposed) setPlaybackBlocked(false); }
      catch { if (!disposed) setPlaybackBlocked(true); }
    };
    const syncMedia = () => {
      if (disposed) return;
      video.srcObject = stream || null;
      const audioTracks = muted || !playAudio ? [] : (stream?.getAudioTracks() || []).filter((track) => track.readyState === 'live');
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
  }, [stream, muted, playAudio]);
  useEffect(() => {
    if (!playbackBlocked) return undefined;
    const unlock = () => { resumePlayback.current?.(); };
    window.addEventListener('pointerdown', unlock, true);
    return () => window.removeEventListener('pointerdown', unlock, true);
  }, [playbackBlocked]);
  const hasVideo = Boolean(stream?.getVideoTracks().some((track) => track.enabled && track.readyState === 'live'));
  return <div className={`video-surface ${presentation ? 'presentation' : ''} ${mirrored ? 'mirrored' : ''} ${speaking ? 'speaking' : ''} ${hasVideo ? 'has-video' : 'audio-only-surface'}`}>
    <video className={hasVideo ? '' : 'audio-only'} ref={videoRef} autoPlay playsInline muted controls={false} disablePictureInPicture controlsList="nodownload noplaybackrate noremoteplayback" />
    <audio className="remote-audio" ref={audioRef} autoPlay controls={false} preload="auto" />
    {!hasVideo && <ConstellationAvatar className="video-avatar" seed={avatarSeed || name} name={name} src={avatar} />}
    {!muted && playbackBlocked && <button className="resume-audio-button" type="button" onClick={() => resumePlayback.current?.()}><Volume2 /> Activar sonido</button>}
    <span className="video-name">{handRaised && <Hand />} {name}</span>
  </div>;
}

function RemoteAudioTrack({ stream, peerId, onBlocked }) {
  const ref = useRef(null);
  useEffect(() => {
    const audio = ref.current; if (!audio) return undefined;
    let disposed = false;
    const play = async () => {
      if (disposed || !audio.srcObject) return;
      audio.defaultMuted = false; audio.muted = false; audio.volume = 1;
      try { await audio.play(); if (!disposed) onBlocked(peerId, false); }
      catch { if (!disposed) onBlocked(peerId, true); }
    };
    const syncTracks = () => {
      if (disposed) return;
      const tracks = (stream?.getAudioTracks() || []).filter((track) => track.readyState === 'live');
      const attached = audio.srcObject?.getAudioTracks?.() || [];
      const unchanged = tracks.length === attached.length && tracks.every((track) => attached.includes(track));
      if (!unchanged) audio.srcObject = tracks.length ? new MediaStream(tracks) : null;
      if (!tracks.length) { onBlocked(peerId, false); return; }
      play();
    };
    const resume = () => { play(); };
    const changed = () => { syncTracks(); };
    const visible = () => { if (!document.hidden) resume(); };
    stream?.addEventListener('addtrack', changed); stream?.addEventListener('removetrack', changed);
    window.addEventListener('galaxy:resume-meeting-audio', resume); window.addEventListener('focus', resume); window.addEventListener('pageshow', resume);
    window.addEventListener('pointerdown', resume, true); window.addEventListener('keydown', resume, true); document.addEventListener('visibilitychange', visible);
    (stream?.getAudioTracks() || []).forEach((track) => { track.addEventListener('unmute', resume); track.addEventListener('ended', changed); });
    syncTracks();
    return () => {
      disposed = true; onBlocked(peerId, false); window.removeEventListener('galaxy:resume-meeting-audio', resume); window.removeEventListener('focus', resume); window.removeEventListener('pageshow', resume);
      window.removeEventListener('pointerdown', resume, true); window.removeEventListener('keydown', resume, true); document.removeEventListener('visibilitychange', visible);
      stream?.removeEventListener('addtrack', changed); stream?.removeEventListener('removetrack', changed);
      (stream?.getAudioTracks() || []).forEach((track) => { track.removeEventListener('unmute', resume); track.removeEventListener('ended', changed); });
      audio.pause(); audio.srcObject = null;
    };
  }, [stream, peerId, onBlocked]);
  return <audio ref={ref} className="remote-audio" autoPlay playsInline preload="auto" />;
}

function RemoteAudioLayer({ streams, onBlockedChange }) {
  const blocked = useRef(new Set());
  const update = useCallback((peerId, isBlocked) => {
    if (isBlocked) blocked.current.add(peerId); else blocked.current.delete(peerId);
    onBlockedChange?.(blocked.current.size > 0);
  }, [onBlockedChange]);
  return <div className="remote-audio-layer" aria-hidden="true">{Object.entries(streams).map(([peerId, stream]) => <RemoteAudioTrack key={peerId} peerId={peerId} stream={stream} onBlocked={update} />)}</div>;
}

function CollaborationOverlay({ active, mode, color, strokes, cursors, onPoint, onFinish }) {
  const ref = useRef(null); const drawing = useRef(null); const lastSent = useRef(0);
  const pointFor = (event) => { const rect = ref.current.getBoundingClientRect(); return { x: Math.max(0, Math.min(1000, (event.clientX - rect.left) / rect.width * 1000)), y: Math.max(0, Math.min(1000, (event.clientY - rect.top) / rect.height * 1000)) }; };
  const down = (event) => {
    if (!active) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFor(event); const id = crypto.randomUUID(); drawing.current = mode === 'draw' ? id : null;
    onPoint({ mode, strokeId: id, point, start: true, color });
  };
  const move = (event) => {
    if (!active) return; if (mode === 'draw' && !drawing.current) return;
    const now = performance.now(); if (now - lastSent.current < 24) return; lastSent.current = now;
    onPoint({ mode, strokeId: drawing.current, point: pointFor(event), start: false, color });
  };
  const up = (event) => { if (drawing.current) onFinish?.(drawing.current); drawing.current = null; event.currentTarget.releasePointerCapture?.(event.pointerId); };
  return <svg ref={ref} className={`collaboration-overlay ${active ? 'active' : ''}`} viewBox="0 0 1000 1000" preserveAspectRatio="none" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
    {strokes.map((stroke) => <polyline key={stroke.id} points={stroke.points.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke={stroke.color} strokeWidth={stroke.width || 5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}
    {Object.entries(cursors).map(([peerId, cursor]) => <g className="remote-cursor" key={peerId} transform={`translate(${cursor.x} ${cursor.y})`}><path d="M0 0L0 25L7 18L13 31L19 28L13 16L23 15Z" fill={cursor.color || '#b98cff'} stroke="#08070a" strokeWidth="2" /><text x="20" y="31">{cursor.name || 'Participante'}</text></g>)}
  </svg>;
}

function CollaborationRequestModal({ request, onRespond }) {
  if (!request) return null;
  return <div className="modal-backdrop"><section className="collaboration-request glass" role="dialog" aria-modal="true" aria-labelledby="collaboration-request-title">
    <span className="collaboration-request-icon">{request.mode === 'draw' ? <Pencil /> : <MousePointer2 />}</span>
    <p className="eyebrow">PERMISO DE COLABORACIÓN</p><h2 id="collaboration-request-title">{request.name} solicita {request.mode === 'draw' ? 'dibujar' : 'control guiado'}</h2>
    <p>{request.mode === 'draw' ? 'Podrá anotar sobre tu pantalla compartida.' : 'Podrá señalar con un puntero sobre tu pantalla. El navegador no le permite pulsar ni escribir dentro de tus aplicaciones.'}</p>
    <div className="modal-actions"><button className="secondary-button" onClick={() => onRespond(false)}>Rechazar</button><button className="primary-button" onClick={() => onRespond(true)}><Check /> Permitir durante esta presentación</button></div>
  </section></div>;
}

function sanitizeAnnotationStrokes(strokes) {
  if (!Array.isArray(strokes)) return [];
  return strokes.slice(-200).flatMap((stroke) => {
    if (!/^[0-9a-f-]{16,64}$/i.test(stroke?.id || '') || !Array.isArray(stroke.points)) return [];
    const points = stroke.points.slice(-2000).filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y) && point.x >= 0 && point.x <= 1000 && point.y >= 0 && point.y <= 1000);
    if (!points.length) return [];
    return [{ id: stroke.id, color: /^#[0-9a-f]{6}$/i.test(stroke.color || '') ? stroke.color : '#ffcf5a', width: 5, points }];
  });
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
  const displayTracks = (displayStream?.getAudioTracks() || []).filter((track) => track.readyState === 'live');
  const microphoneTracks = (microphoneStream?.getAudioTracks() || []).filter((track) => track.readyState === 'live');
  const tracks = [...displayTracks, ...microphoneTracks]
    .filter((track, index, items) => track.readyState === 'live' && items.findIndex((item) => item.id === track.id) === index);
  const fallbackTrack = microphoneTracks.find((track) => track.enabled) || displayTracks.find((track) => track.enabled) || microphoneTracks[0] || displayTracks[0] || null;
  if (!tracks.length) return { track: null, close() {} };
  if (tracks.length === 1) return { track: fallbackTrack, fallbackTrack, close() {} };
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return { track: fallbackTrack, fallbackTrack, close() {} };

  const context = meetingAudioContext();
  if (!context) return { track: fallbackTrack, fallbackTrack, close() {} };
  const destination = context.createMediaStreamDestination(); const sources = []; let stateHandler = null; let closed = false;
  tracks.forEach((track) => {
    const source = context.createMediaStreamSource(new MediaStream([track])); source.connect(destination); sources.push(source);
  });
  const mixedTrack = destination.stream.getAudioTracks()[0] || null;
  const notifyState = () => { if (!closed) stateHandler?.(context.state === 'running'); };
  const resume = async () => { if (closed || context.state === 'running') return; await context.resume?.().catch(() => {}); notifyState(); };
  const visible = () => { if (!document.hidden) resume(); };
  context.onstatechange = notifyState;
  window.addEventListener('focus', resume); window.addEventListener('pageshow', resume); window.addEventListener('pointerdown', resume, true); window.addEventListener('keydown', resume, true); document.addEventListener('visibilitychange', visible);
  await resume();
  return {
    track: context.state === 'running' && mixedTrack ? mixedTrack : fallbackTrack,
    mixedTrack,
    fallbackTrack,
    setStateHandler(handler) { stateHandler = typeof handler === 'function' ? handler : null; },
    close() {
      closed = true; stateHandler = null; context.onstatechange = null;
      window.removeEventListener('focus', resume); window.removeEventListener('pageshow', resume); window.removeEventListener('pointerdown', resume, true); window.removeEventListener('keydown', resume, true); document.removeEventListener('visibilitychange', visible);
      sources.forEach((source) => source.disconnect());
      destination.stream.getTracks().forEach((track) => track.stop());
    },
  };
}

function PrivacyMaskEditor({ stream, initialMasks, onConfirm, onCancel }) {
  const videoRef = useRef(null); const stageRef = useRef(null); const drag = useRef(null);
  const defaultMasks = [{ id: 'names-bottom', x: 0, y: 86, w: 100, h: 14 }];
  const [masks, setMasks] = useState(Array.isArray(initialMasks) && initialMasks.length ? initialMasks : defaultMasks);
  useEffect(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, [stream]);
  const start = (event, id, mode) => { const rect = stageRef.current.getBoundingClientRect(); const mask = masks.find((item) => item.id === id); drag.current = { id, mode, clientX: event.clientX, clientY: event.clientY, rect, ...mask }; event.currentTarget.setPointerCapture(event.pointerId); };
  const move = (event) => {
    const state = drag.current; if (!state) return; const dx = (event.clientX - state.clientX) / state.rect.width * 100; const dy = (event.clientY - state.clientY) / state.rect.height * 100;
    setMasks((items) => items.map((item) => item.id !== state.id ? item : state.mode === 'resize'
      ? { ...item, w: Math.max(8, Math.min(100 - state.x, state.w + dx)), h: Math.max(4, Math.min(100 - state.y, state.h + dy)) }
      : { ...item, x: Math.max(0, Math.min(100 - state.w, state.x + dx)), y: Math.max(0, Math.min(100 - state.h, state.y + dy)) }));
  };
  const addMask = () => setMasks((items) => items.length >= 8 ? items : [...items, { id: crypto.randomUUID(), x: 25, y: 40, w: 50, h: 10 }]);
  return <div className="modal-backdrop"><div className="crop-modal privacy-mask-modal glass" role="dialog" aria-modal="true">
    <div className="modal-title"><div><p className="eyebrow">PRIVACIDAD OPCIONAL</p><h2>Cubre nombres y datos privados</h2></div><button className="icon-button" onClick={onCancel}><X /></button></div>
    <p className="muted">Las franjas se integran en los píxeles del video antes de transmitir. Los participantes no pueden ocultarlas ni retirarlas.</p>
    <div className="crop-stage privacy-mask-stage" ref={stageRef}><video ref={videoRef} autoPlay muted playsInline />{masks.map((mask) => <div className="privacy-redaction" key={mask.id} style={{ left: `${mask.x}%`, top: `${mask.y}%`, width: `${mask.w}%`, height: `${mask.h}%` }} onPointerDown={(event) => start(event, mask.id, 'move')} onPointerMove={move} onPointerUp={() => { drag.current = null; }}><span>DATOS PROTEGIDOS</span><i onPointerDown={(event) => { event.stopPropagation(); start(event, mask.id, 'resize'); }} onPointerMove={move} onPointerUp={() => { drag.current = null; }} /></div>)}</div>
    <div className="privacy-mask-actions"><button className="secondary-button" onClick={addMask} disabled={masks.length >= 8}><Plus /> Agregar cobertura</button><small>{masks.length} zona{masks.length === 1 ? '' : 's'} permanente{masks.length === 1 ? '' : 's'} en esta transmisión</small></div>
    <div className="modal-actions"><button className="secondary-button" onClick={onCancel}>Cancelar</button><button className="primary-button" onClick={() => onConfirm(masks)}><ShieldCheck /> Compartir con privacidad</button></div>
  </div></div>;
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

function MeetingLobby({ busy, meetings, initialCode, onCreate, onJoin, onResume, onRestart, onRemove, canCreate }) {
  const [tab, setTab] = useState(initialCode || !canCreate ? 'join' : 'create');
  const [create, setCreate] = useState({ title: '', password: '', waitingRoom: true });
  const [join, setJoin] = useState({ roomCode: initialCode, password: '' });
  return <div className="meeting-lobby">
    <section className="meeting-lobby-card surface"><p className="eyebrow">MEETING CENTER</p><h1>Reuniones privadas para tu comunidad</h1><p>{canCreate ? 'Crea una sala persistente o entra con el código de una invitación.' : 'Entra con el código o abre un enlace de invitación compartido por el administrador.'}</p><div className="meeting-lobby-tabs">{canCreate && <button className={tab === 'create' ? 'active' : ''} onClick={() => setTab('create')}><Plus /> Crear reunión</button>}<button className={tab === 'join' ? 'active' : ''} onClick={() => setTab('join')}><LogIn /> Unirse</button></div>
      {tab === 'create' ? <form onSubmit={(event) => { event.preventDefault(); onCreate(create); }}><label>Título<input required value={create.title} onChange={(event) => setCreate({ ...create, title: event.target.value })} placeholder="Reunión de equipo" /></label><label>Contraseña opcional<input type="password" minLength="6" value={create.password} onChange={(event) => setCreate({ ...create, password: event.target.value })} placeholder="Mínimo 6 caracteres" /></label><label className="meeting-check"><input type="checkbox" checked={create.waitingRoom} onChange={(event) => setCreate({ ...create, waitingRoom: event.target.checked })} /><span><strong>Sala de espera</strong><small>El anfitrión admite a cada participante.</small></span></label><button className="primary-button" disabled={busy}><VideoSurfaceIcon /> {busy ? 'Creando…' : 'Crear e iniciar'}</button></form>
        : <form onSubmit={(event) => { event.preventDefault(); onJoin(join); }}><label>Código de reunión<input required value={join.roomCode} onChange={(event) => setJoin({ ...join, roomCode: event.target.value.toUpperCase() })} placeholder="ABCD-1234" /></label><label>Contraseña, si aplica<input type="password" value={join.password} onChange={(event) => setJoin({ ...join, password: event.target.value })} /></label><button className="primary-button" disabled={busy}><LogIn /> {busy ? 'Conectando…' : 'Entrar a la reunión'}</button></form>}
    </section>
    <aside className="meeting-history surface"><div className="panel-heading"><span>Mis reuniones</span><span className="count-pill">{meetings.length}</span></div>{meetings.length ? meetings.map((item) => {
      const ended = item.status === 'ENDED';
      return <div className={`meeting-history-item ${ended ? 'ended' : ''}`} key={item.id}>
        <button className="meeting-history-main" disabled={!item.roomCode || ended} onClick={() => onResume(item)}><span className={`meeting-status-dot ${item.status.toLowerCase()}`} /><span><strong>{item.title}</strong><small>{ended ? `Finalizada · ${item.host ? 'Tú la creaste' : 'Participaste'}` : `${item.host ? 'Anfitrión' : 'Participante'} · ${item.roomCode || 'Código anterior no disponible'}`}</small></span><LogIn /></button>
        {ended && <div className="meeting-history-actions">{item.host && <button disabled={busy} title="Reiniciar reunión" aria-label={`Reiniciar ${item.title}`} onClick={() => onRestart(item)}><RotateCcw /></button>}<button className="history-delete" disabled={busy} title={item.host ? 'Eliminar reunión definitivamente' : 'Quitar de mi historial'} aria-label={`${item.host ? 'Eliminar' : 'Quitar'} ${item.title}`} onClick={() => onRemove(item)}><Trash2 /></button></div>}
      </div>;
    }) : <p className="muted">Tus reuniones aparecerán aquí.</p>}</aside>
  </div>;
}

function VideoSurfaceIcon() { return <Users />; }

function ChatPanel({ messages, user, replyTo, setReplyTo, onSend, onReact }) {
  const [body, setBody] = useState(''); const [emojiOpen, setEmojiOpen] = useState(false); const endRef = useRef(null); const inputRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);
  const byId = Object.fromEntries(messages.map((item) => [item.id, item]));
  const insertEmoji = (emoji) => {
    const input = inputRef.current; const start = input?.selectionStart ?? body.length; const end = input?.selectionEnd ?? start;
    const next = `${body.slice(0, start)}${emoji}${body.slice(end)}`.slice(0, 2000); const caret = Math.min(start + emoji.length, next.length);
    setBody(next); setEmojiOpen(false);
    requestAnimationFrame(() => { input?.focus(); input?.setSelectionRange(caret, caret); });
  };
  return <div className="meeting-chat-panel"><div className="meeting-chat-scroll">{messages.length ? messages.map((message) => { const reply = byId[message.replyToId]; return <article className={`meeting-message ${message.senderId === user.id ? 'mine' : ''}`} key={message.id}>{reply && <div className="message-reply-preview"><Reply /> <span><strong>{reply.senderName}</strong>{reply.body}</span></div>}<header><strong>{message.senderId === user.id ? 'Tú' : message.senderName}</strong><time>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></header><p>{message.body}</p><div className="message-actions"><button onClick={() => setReplyTo(message)}><Reply /> Responder</button>{EMOJIS.slice(0, 3).map((emoji) => <button className="quick-reaction" key={emoji} onClick={() => onReact(message, emoji)}>{emoji}</button>)}</div>{Boolean(message.reactions?.length) && <div className="message-reactions">{message.reactions.map((reaction) => <button className={reaction.mine ? 'mine' : ''} key={reaction.emoji} onClick={() => onReact(message, reaction.emoji)}>{reaction.emoji} {reaction.count}</button>)}</div>}</article>; }) : <div className="chat-empty"><MessageCircle /><p>El chat comienza aquí.</p></div>}<div ref={endRef} /></div>{replyTo && <div className="replying"><Reply /><span>Respondiendo a <strong>{replyTo.senderName}</strong></span><button onClick={() => setReplyTo(null)}><X /></button></div>}<form className="meeting-message-form" onSubmit={async (event) => { event.preventDefault(); const sent = body.trim(); if (!sent) return; setBody(''); setEmojiOpen(false); await onSend(sent); }}><div className="message-compose-field"><input ref={inputRef} value={body} onChange={(event) => setBody(event.target.value)} maxLength="2000" placeholder="Escribe un mensaje…" /><button className={`message-emoji-trigger ${emojiOpen ? 'active' : ''}`} type="button" aria-label="Agregar emoji al mensaje" aria-expanded={emojiOpen} onClick={() => setEmojiOpen((open) => !open)}><SmilePlus /></button>{emojiOpen && <div className="message-emoji-picker" role="group" aria-label="Emojis para el mensaje">{MESSAGE_EMOJIS.map((emoji) => <button type="button" aria-label={`Agregar ${emoji}`} key={emoji} onClick={() => insertEmoji(emoji)}>{emoji}</button>)}</div>}</div><button className="icon-button" aria-label="Enviar"><Send /></button></form></div>;
}

function InvitePanel({ members, onlineUserIds, onInviteMany, onClose }) {
  const [selectedIds, setSelectedIds] = useState(() => new Set()); const [sending, setSending] = useState(false);
  const orderedMembers = [...members].sort((left, right) => Number(onlineUserIds.has(right.id)) - Number(onlineUserIds.has(left.id)) || left.name.localeCompare(right.name, 'es'));
  const isSelectable = (member) => onlineUserIds.has(member.id) && member.participantStatus !== 'ADMITTED' && member.invitationStatus !== 'ACCEPTED' && member.invitationStatus !== 'PENDING';
  const availableOnline = orderedMembers.filter(isSelectable); const selectedMembers = availableOnline.filter((member) => selectedIds.has(member.id));
  useEffect(() => {
    setSelectedIds((current) => new Set([...current].filter((id) => members.some((member) => member.id === id && isSelectable(member)))));
  }, [members, onlineUserIds]);
  const toggle = (member) => setSelectedIds((current) => { const next = new Set(current); if (next.has(member.id)) next.delete(member.id); else next.add(member.id); return next; });
  const allOnlineSelected = availableOnline.length > 0 && availableOnline.every((member) => selectedIds.has(member.id));
  const toggleAll = () => setSelectedIds(allOnlineSelected ? new Set() : new Set(availableOnline.map((member) => member.id)));
  const submit = async () => {
    if (!selectedMembers.length || sending) return;
    setSending(true); try { const result = await onInviteMany(selectedMembers); setSelectedIds(new Set(result?.failedIds || [])); } finally { setSending(false); }
  };
  const onlineCount = members.filter((member) => onlineUserIds.has(member.id)).length;
  return <div className="modal-backdrop"><div className="invite-modal glass"><div className="modal-title"><div><p className="eyebrow">COMUNIDAD</p><h2>Invitar usuarios conectados</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X /></button></div>
    <div className="invite-presence-summary"><span className="invite-online-dot" /> <strong>{onlineCount}</strong> {onlineCount === 1 ? 'persona en línea' : 'personas en línea'}<button type="button" disabled={!availableOnline.length} onClick={toggleAll}>{allOnlineSelected ? 'Quitar selección' : 'Seleccionar conectados'}</button></div>
    <div className="invite-list">{orderedMembers.map((member) => {
      const online = onlineUserIds.has(member.id); const accepted = member.participantStatus === 'ADMITTED' || member.invitationStatus === 'ACCEPTED';
      const pending = member.invitationStatus === 'PENDING'; const declined = member.invitationStatus === 'DECLINED'; const selectable = isSelectable(member); const selected = selectedIds.has(member.id);
      const statusText = accepted ? 'Aceptó la invitación' : pending ? member.invitationSeenAt ? 'Vio el modal · aún no responde' : 'Modal pendiente de ver' : declined ? online ? 'Rechazó la invitación · En línea para Reinvitar' : 'Rechazó la invitación · sin conexión' : online ? 'En línea · disponible para invitar' : 'Sin conexión · invitación desactivada';
      return <div className={`person invite-person ${online ? 'online' : 'offline'} ${selected ? 'selected' : ''}`} key={member.id}><span className={`invite-avatar-shell ${online ? 'online' : ''}`}><ConstellationAvatar className="avatar avatar-sm" seed={member.id} name={member.name} src={member.avatar} membership={member.membership} />{online && <i className="invite-online-dot" title="En línea" />}</span><span className="invite-person-copy"><strong>{member.name}</strong><small>@{member.username}</small><em className={`invite-state ${accepted ? 'accepted' : pending ? 'pending' : declined ? 'declined' : online ? 'online' : 'offline'}`}>{statusText}</em></span><button type="button" className="invite-selector" role="checkbox" aria-checked={selected} aria-label={selectable ? `${selected ? 'Quitar' : 'Seleccionar'} a ${member.name}` : statusText} disabled={!selectable || sending} onClick={() => toggle(member)}>{accepted || pending ? <Check /> : selected ? <Check /> : <Plus />}</button></div>;
    })}{!members.length && <p className="muted">No hay otros usuarios registrados todavía.</p>}</div>
    <div className="invite-batch-actions"><span>{selectedMembers.length ? `${selectedMembers.length} seleccionada${selectedMembers.length === 1 ? '' : 's'}` : 'Selecciona una o varias personas en línea'}</span><button className="primary-button" type="button" disabled={!selectedMembers.length || sending} onClick={submit}><UserPlus /> {sending ? 'Enviando…' : `Invitar${selectedMembers.length ? ` (${selectedMembers.length})` : ''}`}</button></div>
  </div></div>;
}

export default function MeetingStudio({ toast, user, joinRequest, onSessionChange, canCreate = false }) {
  const activeKey = `galaxy_active_meeting_${user.id}`; const cropKey = `galaxy_share_crop_${user.id}`; const mediaKey = `galaxy_meeting_media_${user.id}`; const maskKey = `galaxy_privacy_masks_${user.id}`;
  const sourceStream = useRef(null); const sharingRef = useRef(null); const sharedAudio = useRef(null); const renderLoop = useRef(null); const connection = useRef(null); const mediaRef = useRef(new MediaStream()); const resumed = useRef(0); const resumeMediaRequested = useRef(false); const handledJoinRequest = useRef(null); const lifecycleEpoch = useRef(0); const connectSequence = useRef(0); const entrySequence = useRef(0); const entryInFlight = useRef(null);
  const pipVideoRef = useRef(null); const pipPlaceholderRef = useRef(null);
  const collaborationGrants = useRef(new Map()); const collaborationRequestTimes = useRef(new Map()); const presentationOwner = useRef(null); const cursorTimer = useRef(null); const requestTimer = useRef(null);
  const participantHandStates = useRef(new Map()); const participantSnapshotReady = useRef(false);
  const annotationStrokesRef = useRef([]);
  const queryCode = new URLSearchParams(location.search).get('meeting')?.toUpperCase() || '';
  const [meetings, setMeetings] = useState([]); const [meeting, setMeeting] = useState(null); const [waiting, setWaiting] = useState(false); const [waitingParticipants, setWaitingParticipants] = useState([]); const [busy, setBusy] = useState(false);
  const [media, setMedia] = useState(null); const [sharing, setSharing] = useState(null); const [cropSource, setCropSource] = useState(null); const [privacySource, setPrivacySource] = useState(null); const [savedCrop, setSavedCrop] = useState(() => { try { return JSON.parse(localStorage.getItem(cropKey) || 'null'); } catch { return null; } }); const [savedMasks, setSavedMasks] = useState(() => { try { return JSON.parse(localStorage.getItem(maskKey) || 'null'); } catch { return null; } });
  const [mic, setMic] = useState(false); const [camera, setCamera] = useState(false); const [joined, setJoined] = useState(false); const [status, setStatus] = useState('offline'); const [relayReady, setRelayReady] = useState(null);
  const [participants, setParticipants] = useState([]); const [remoteStreams, setRemoteStreams] = useState({}); const [peerStates, setPeerStates] = useState({});
  const [handRaised, setHandRaised] = useState(false); const [reactionMenu, setReactionMenu] = useState(false); const [reactions, setReactions] = useState([]); const [shareMenu, setShareMenu] = useState(false); const [localSpeaking, setLocalSpeaking] = useState(false);
  const [sideTab, setSideTab] = useState('people'); const [mobilePanelOpen, setMobilePanelOpen] = useState(false); const [messages, setMessages] = useState([]); const [floatingMessages, setFloatingMessages] = useState([]); const [replyTo, setReplyTo] = useState(null); const [inviteOpen, setInviteOpen] = useState(false); const [members, setMembers] = useState([]); const [onlineUserIds, setOnlineUserIds] = useState(() => new Set());
  const [pipActive, setPipActive] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false); const [shareHasAudio, setShareHasAudio] = useState(false); const [shareAudioEnabled, setShareAudioEnabled] = useState(true); const [participantMicsLocked, setParticipantMicsLocked] = useState(false); const [collaborationMode, setCollaborationMode] = useState(null); const [collaborationColor, setCollaborationColor] = useState('#ffcf5a');
  const [collaborationRequest, setCollaborationRequest] = useState(null); const [requestedCollaboration, setRequestedCollaboration] = useState(null); const [collaborationPermission, setCollaborationPermission] = useState(null);
  const [annotationStrokes, setAnnotationStrokes] = useState([]); const [remoteCursors, setRemoteCursors] = useState({});

  useEffect(() => { annotationStrokesRef.current = annotationStrokes; }, [annotationStrokes]);
  useEffect(() => {
    const finalForm = new Image(); finalForm.src = PHOENIX_SUPER_ASSET;
    const lightning = document.createElement('video'); lightning.preload = 'auto'; lightning.src = PHOENIX_LIGHTNING_ASSET; lightning.load();
    return () => { lightning.pause(); lightning.removeAttribute('src'); lightning.load(); };
  }, []);

  const rememberMeeting = (value) => { localStorage.setItem(activeKey, JSON.stringify({ roomCode: value.roomCode, title: value.title, role: value.role || (value.host ? 'HOST' : 'PARTICIPANT') })); };
  const forgetMeeting = () => { localStorage.removeItem(activeKey); };
  const readMediaPreferences = () => { try { return JSON.parse(localStorage.getItem(mediaKey) || '{}'); } catch { return {}; } };
  const saveMediaPreferences = (changes) => { const current = readMediaPreferences(); localStorage.setItem(mediaKey, JSON.stringify({ mic: Boolean(current.mic), camera: Boolean(current.camera), sharing: Boolean(current.sharing), ...changes })); };
  const restoreMediaPreferences = async () => {
    const preferences = readMediaPreferences(); let restoredMic = false; let restoredCamera = false;
    if ((preferences.mic || preferences.camera) && navigator.mediaDevices?.getUserMedia) {
      try {
        const restored = await navigator.mediaDevices.getUserMedia({ audio: preferences.mic ? voiceCaptureConstraints() : false, video: Boolean(preferences.camera) });
        mediaRef.current.getTracks().forEach((track) => track.stop()); mediaRef.current = restored; setMedia(restored);
        restoredMic = restored.getAudioTracks().some((track) => track.readyState === 'live'); restoredCamera = restored.getVideoTracks().some((track) => track.readyState === 'live');
        setMic(restoredMic); setCamera(restoredCamera);
      } catch { toast('La reunión se reanudó. El navegador requiere que vuelvas a activar cámara o micrófono manualmente.', 'info'); }
    }
    if (preferences.sharing) { saveMediaPreferences({ sharing: false }); toast('La reunión se reanudó. Por seguridad del navegador, debes autorizar nuevamente la pantalla compartida.', 'info'); }
    return { mic: restoredMic, camera: restoredCamera };
  };
  const mergeMessage = useCallback((message) => setMessages((items) => items.some((item) => item.id === message.id) ? items.map((item) => item.id === message.id ? { ...item, ...message } : item) : [...items, message]), []);
  const applyChatReaction = useCallback((update) => { if (!update.emoji) return; setMessages((items) => items.map((item) => { if (item.id !== update.messageId) return item; const reactions = [...(item.reactions || [])]; const index = reactions.findIndex((entry) => entry.emoji === update.emoji); if (index < 0 && update.active) reactions.push({ emoji: update.emoji, count: 1, mine: update.userId === user.id }); else if (index >= 0) { const current = reactions[index]; const count = Math.max(0, current.count + (update.active ? 1 : -1)); if (!count) reactions.splice(index, 1); else reactions[index] = { ...current, count, ...(update.userId === user.id ? { mine: update.active } : {}) }; } return { ...item, reactions }; })); }, [user.id]);
  const showFloatingMessage = (message) => { if (!message?.body) return; const id = crypto.randomUUID(); const notice = { id, senderName: String(message.senderName || 'Participante').slice(0, 100), body: String(message.body).slice(0, 240) }; setFloatingMessages((items) => [...items.slice(-3), notice]); setTimeout(() => setFloatingMessages((items) => items.filter((item) => item.id !== id)), 5200); };
  const showReaction = ({ emoji, peerId, senderName }) => { if (![...EMOJIS, ...COSMIC_REACTIONS.map((item) => item.id)].includes(emoji)) return; const id = crypto.randomUUID(); const name = String(senderName || connection.current?.participants.get(peerId)?.name || 'Participante').slice(0, 100); setReactions((items) => [...items, { id, emoji, senderName: name }]); const cosmic = COSMIC_REACTIONS.some((item) => item.id === emoji); const lifetime = emoji === PHOENIX_TRANSFORM_REACTION ? 11_300 : cosmic ? 4200 : 2400; setTimeout(() => setReactions((items) => items.filter((item) => item.id !== id)), lifetime); };
  const enforceParticipantMicLock = (locked, role, by = '', notify = false) => {
    const active = Boolean(locked); setParticipantMicsLocked(active);
    if (role !== 'HOST' && active) { const track = mediaRef.current.getAudioTracks()[0]; if (track) track.enabled = false; setMic(false); setLocalSpeaking(false); saveMediaPreferences({ mic: false }); connection.current?.setPresence({ mic: false, speaking: false }); }
    if (notify && role !== 'HOST') toast(active ? `${by || 'El anfitrión'} silenció y bloqueó los micrófonos.` : `${by || 'El anfitrión'} permitió activar los micrófonos.`, 'info');
  };
  const resetCollaboration = () => { collaborationGrants.current.clear(); collaborationRequestTimes.current.clear(); clearTimeout(requestTimer.current); setCollaborationMode(null); setCollaborationRequest(null); setRequestedCollaboration(null); setCollaborationPermission(null); setAnnotationStrokes([]); setRemoteCursors({}); };
  const mergeAnnotationPoint = (message) => {
    const { strokeId, point, start, color } = message; if (!/^[0-9a-f-]{16,64}$/i.test(strokeId || '') || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1000 || point.y < 0 || point.y > 1000) return;
    const safeColor = /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#ffcf5a';
    setAnnotationStrokes((items) => {
      const index = items.findIndex((item) => item.id === strokeId);
      if (index < 0) return [...items.slice(-199), { id: strokeId, color: safeColor, width: 5, points: [point] }];
      const next = [...items]; next[index] = { ...next[index], points: start ? [point] : [...next[index].points.slice(-1999), point] }; return next;
    });
  };
  const handleCollaboration = (message) => {
    const client = connection.current; if (!client || !message?.source) return;
    if (message.type === 'collab-state-request') {
      if (!sharingRef.current || message.target !== client.selfId || message.presenterPeerId !== client.selfId) return;
      client.collaborate('collab-state', { presenterPeerId: client.selfId, strokes: sanitizeAnnotationStrokes(annotationStrokesRef.current) }, message.source); return;
    }
    if (message.type === 'collab-state') {
      const owner = presentationOwner.current;
      if (!owner || message.target !== client.selfId || message.source !== owner || message.presenterPeerId !== owner) return;
      setAnnotationStrokes(sanitizeAnnotationStrokes(message.strokes)); return;
    }
    if (message.type === 'collab-request') {
      if (!sharingRef.current || message.target !== client.selfId || !['draw', 'pointer'].includes(message.mode)) return;
      const peer = client.participants.get(message.source); if (!peer) return;
      const lastRequest = collaborationRequestTimes.current.get(message.source) || 0; if (Date.now() - lastRequest < 5000) return;
      collaborationRequestTimes.current.set(message.source, Date.now());
      setCollaborationRequest({ requestId: message.requestId, peerId: message.source, mode: message.mode, name: peer.name || 'Un participante' }); return;
    }
    if (message.type === 'collab-grant') {
      if (message.presenterPeerId !== presentationOwner.current || message.source !== message.presenterPeerId || !['draw', 'pointer'].includes(message.mode)) return;
      if (message.approved) collaborationGrants.current.set(message.grantee, message.mode); else collaborationGrants.current.delete(message.grantee);
      if (message.grantee === client.selfId) {
        clearTimeout(requestTimer.current); setRequestedCollaboration(null);
        if (message.approved) { setCollaborationPermission({ presenterPeerId: message.presenterPeerId, mode: message.mode }); setCollaborationMode(message.mode); toast(message.mode === 'draw' ? 'Puedes dibujar sobre la presentación.' : 'Control guiado activado: usa el puntero para orientar al presentador.'); }
        else { setCollaborationPermission(null); setCollaborationMode(null); toast('El presentador no concedió el permiso.', 'info'); }
      }
      return;
    }
    const owner = presentationOwner.current;
    if (!owner || message.presenterPeerId !== owner) return;
    if (['collab-clear', 'collab-reset'].includes(message.type)) {
      if (message.source !== owner) return;
      if (message.type === 'collab-clear') setAnnotationStrokes([]); else resetCollaboration();
      return;
    }
    const authorized = message.source === owner || collaborationGrants.current.get(message.source) === message.mode;
    if (!authorized) return;
    if (message.type === 'collab-point' && message.mode === 'draw') mergeAnnotationPoint(message);
    if (message.type === 'collab-point' && message.mode === 'pointer') {
      if (!message.point || !Number.isFinite(message.point.x) || !Number.isFinite(message.point.y) || message.point.x < 0 || message.point.x > 1000 || message.point.y < 0 || message.point.y > 1000) return;
      const peer = client.participants.get(message.source);
      const color = /^#[0-9a-f]{6}$/i.test(message.color || '') ? message.color : '#b98cff';
      setRemoteCursors((items) => ({ ...items, [message.source]: { ...message.point, color, name: peer?.name } }));
      clearTimeout(cursorTimer.current); cursorTimer.current = setTimeout(() => setRemoteCursors({}), 1800);
    }
  };

  const stopMedia = () => { mediaRef.current.getTracks().forEach((track) => track.stop()); mediaRef.current = new MediaStream(); setMedia(null); setMic(false); setCamera(false); };
  const disconnect = useCallback((clearMeeting = false) => { entrySequence.current += 1; connectSequence.current += 1; connection.current?.disconnect(); connection.current = null; if (document.pictureInPictureElement === pipVideoRef.current) document.exitPictureInPicture?.().catch(() => {}); if (pipVideoRef.current?.webkitPresentationMode === 'picture-in-picture') pipVideoRef.current.webkitSetPresentationMode('inline'); pipPlaceholderRef.current?.close(); pipPlaceholderRef.current = null; setPipActive(false); participantHandStates.current.clear(); participantSnapshotReady.current = false; setJoined(false); setWaiting(false); setParticipants([]); setRemoteStreams({}); setPeerStates({}); setStatus('offline'); setRelayReady(null); setHandRaised(false); setParticipantMicsLocked(false); setFloatingMessages([]); setMobilePanelOpen(false); resetCollaboration(); if (clearMeeting) { setMeeting(null); setMessages([]); forgetMeeting(); } }, []);
  useEffect(() => {
    const epoch = ++lifecycleEpoch.current;
    return () => { if (lifecycleEpoch.current === epoch) lifecycleEpoch.current += 1; entrySequence.current += 1; connectSequence.current += 1; connection.current?.disconnect(); connection.current = null; sharedAudio.current?.close(); pipPlaceholderRef.current?.close(); pipPlaceholderRef.current = null; if (document.pictureInPictureElement === pipVideoRef.current) document.exitPictureInPicture?.().catch(() => {}); mediaRef.current.getTracks().forEach((track) => track.stop()); sourceStream.current?.getTracks().forEach((track) => track.stop()); sharingRef.current?.getTracks().forEach((track) => track.stop()); cancelAnimationFrame(renderLoop.current); clearTimeout(cursorTimer.current); clearTimeout(requestTimer.current); };
  }, []);
  useEffect(() => { onSessionChange?.({ active: joined || waiting, joined, waiting, title: meeting?.title || '', roomCode: meeting?.roomCode || '', mic, camera, sharing: Boolean(sharing), audioBlocked }); }, [joined, waiting, meeting?.title, meeting?.roomCode, mic, camera, sharing, audioBlocked, onSessionChange]);
  useEffect(() => {
    const unsubscribe = onOnlineUsersChange((userIds) => setOnlineUserIds(userIds));
    primeRealtime(user.id).catch(() => {});
    return () => { unsubscribe(); releaseRealtimePrime(user.id); };
  }, [user.id]);
  useEffect(() => { api.getMyMeetings().then(setMeetings).catch((error) => toast(error.message, 'error')); }, []);

  const connectAccess = async (access, expectedEpoch = lifecycleEpoch.current, { restoreMedia = false } = {}) => {
    if (expectedEpoch !== lifecycleEpoch.current) return false;
    const sequence = ++connectSequence.current;
    const legacyParticipantStatus = ['ADMITTED', 'WAITING', 'INVITED', 'DENIED'].includes(access.status) ? access.status : null;
    const normalized = { ...access, role: access.role || (access.host ? 'HOST' : 'PARTICIPANT'), participantStatus: access.participantStatus || legacyParticipantStatus || (access.host ? 'ADMITTED' : null) };
    setMeeting(normalized); setMessages(normalized.messages || []); setParticipantMicsLocked(Boolean(normalized.participantMicsLocked)); rememberMeeting(normalized);
    if (normalized.participantStatus !== 'ADMITTED') { resumeMediaRequested.current = resumeMediaRequested.current || restoreMedia; setWaiting(true); setStatus('waiting'); return true; }
    let activeMedia = { mic, camera };
    if (restoreMedia || resumeMediaRequested.current) { activeMedia = await restoreMediaPreferences(); resumeMediaRequested.current = false; }
    if (normalized.role !== 'HOST' && normalized.participantMicsLocked) { const track = mediaRef.current.getAudioTracks()[0]; if (track) track.enabled = false; activeMedia.mic = false; setMic(false); saveMediaPreferences({ mic: false }); }
    setWaiting(false); setJoined(true); setStatus('signaling'); connection.current?.disconnect(); participantHandStates.current.clear(); participantSnapshotReady.current = false;
    const isCurrent = (client) => expectedEpoch === lifecycleEpoch.current && sequence === connectSequence.current && connection.current === client;
    let client;
    client = new SupabaseMeetingConnection({
      onStatus: (value) => { if (isCurrent(client)) setStatus(value); }, onParticipants: (value) => {
        if (!isCurrent(client)) return;
        if (participantSnapshotReady.current) for (const peer of value) {
          if (peer.handRaised && participantHandStates.current.get(peer.peerId) === false) announceRaisedHand(peer.name);
        }
        participantHandStates.current = new Map(value.map((peer) => [peer.peerId, Boolean(peer.handRaised)])); participantSnapshotReady.current = true; setParticipants(value);
      },
      onRemoteStream: (peerId, stream) => { if (isCurrent(client)) setRemoteStreams((current) => { const next = { ...current }; if (stream) next[peerId] = stream; else delete next[peerId]; return next; }); },
      onPeerState: (peerId, state) => { if (isCurrent(client)) setPeerStates((current) => ({ ...current, [peerId]: state })); }, onReaction: (value) => { if (isCurrent(client)) showReaction(value); }, onChat: (value, options) => { if (isCurrent(client)) { mergeMessage(value); if (options?.announce !== false) showFloatingMessage(value); } },
      onChatHistory: (history) => { if (isCurrent(client)) history.forEach(mergeMessage); }, onChatReaction: (value) => { if (isCurrent(client)) applyChatReaction(value); },
      onCollaboration: (value) => { if (isCurrent(client)) handleCollaboration(value); },
      onForceMute: ({ by }) => { if (!isCurrent(client)) return; const track = mediaRef.current.getAudioTracks()[0]; if (track) track.enabled = false; setMic(false); saveMediaPreferences({ mic: false }); client.setPresence({ mic: false, speaking: false }); toast(`${by || 'El anfitrión'} silenció tu micrófono.`, 'info'); },
      onParticipantMicsLock: ({ locked, by }) => { if (isCurrent(client)) enforceParticipantMicLock(locked, normalized.role, by, true); },
      onMeetingEnded: async ({ by }) => { if (!isCurrent(client)) return; await stopShare(); saveMediaPreferences({ mic: false, camera: false, sharing: false }); disconnect(true); stopMedia(); toast(`${by || 'El anfitrión'} finalizó la reunión.`, 'info'); },
    });
    client.setPresence({ mic: activeMedia.mic, camera: activeMedia.camera, sharing: false, handRaised, speaking: false }); connection.current = client;
    try {
      let iceServers = normalized.iceServers; let relayInfo = null;
      try {
        const relay = await api.getTurnCredentials(normalized.meetingId);
        relayInfo = relay;
        if (relay?.iceServers?.length) iceServers = relay.iceServers;
        setRelayReady(Boolean(relay?.relayReady));
      } catch { setRelayReady(false); }
      const usingTurn = iceServers?.some((server) => server.username && server.credential);
      await client.connect({ roomId: normalized.meetingId, role: normalized.role, stream: mediaRef.current, iceServers, user });
      if (!isCurrent(client)) { client.disconnect(); return false; }
      if (usingTurn) client.scheduleIceRefresh(relayInfo?.expiresIn);
      toast(`Conectado a ${normalized.title}${usingTurn ? ' con relay TURN.' : '; TURN aún no está configurado.'}`, usingTurn ? undefined : 'info');
      return true;
    } catch (error) { client.disconnect(); if (!isCurrent(client) || error.name === 'AbortError') return false; connection.current = null; setJoined(false); throw error; }
  };

  const enterMeeting = ({ roomCode, password = '', restoreMedia = false }) => {
    primeMeetingAudio();
    const epoch = lifecycleEpoch.current; const key = `${epoch}:${String(roomCode).toUpperCase()}:${password}`;
    if (entryInFlight.current?.key === key) return entryInFlight.current.promise;
    resumeMediaRequested.current = resumeMediaRequested.current || restoreMedia;
    const requestId = ++entrySequence.current;
    const promise = (async () => { setBusy(true); try { const access = await getMeetingAccess({ roomCode, password }); if (epoch !== lifecycleEpoch.current || requestId !== entrySequence.current) return false; return await connectAccess(access, epoch, { restoreMedia }); } catch (error) { if (epoch === lifecycleEpoch.current && requestId === entrySequence.current) { disconnect(!restoreMedia); toast(error.message, 'error'); } return false; } finally { const ownsEntry = entryInFlight.current?.promise === promise; if (ownsEntry) entryInFlight.current = null; if (ownsEntry && epoch === lifecycleEpoch.current) setBusy(false); } })();
    entryInFlight.current = { key, promise }; return promise;
  };
  useEffect(() => { const epoch = lifecycleEpoch.current; if (resumed.current === epoch) return; resumed.current = epoch; if (joinRequest?.roomCode) return; try { const saved = JSON.parse(localStorage.getItem(activeKey) || 'null'); if (saved?.roomCode) enterMeeting({ roomCode: saved.roomCode, restoreMedia: true }); } catch { forgetMeeting(); } }, []);
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
    if (!joined || !meeting?.meetingId) return undefined;
    const refresh = async () => { try { const state = await api.getMeetingState({ meetingId: meeting.meetingId }); if (meeting.role === 'HOST') setWaitingParticipants(state.waitingParticipants || []); setMeeting((current) => ({ ...current, locked: state.locked, participantMicsLocked: Boolean(state.participantMicsLocked) })); if (meeting.role !== 'HOST') enforceParticipantMicLock(state.participantMicsLocked, meeting.role); else setParticipantMicsLocked(Boolean(state.participantMicsLocked)); if (state.status === 'ENDED') disconnect(true); } catch {} };
    refresh(); const unsubscribe = api.onMeetingParticipantChange(meeting.meetingId, refresh); const timer = setInterval(refresh, 10_000);
    return () => { unsubscribe(); clearInterval(timer); };
  }, [joined, meeting?.meetingId, meeting?.role]);
  useEffect(() => {
    if (!inviteOpen || meeting?.role !== 'HOST' || !meeting?.meetingId) return undefined;
    let active = true;
    const refresh = async () => { try { const candidates = await api.getMeetingInviteCandidates(meeting.meetingId); if (active) setMembers(candidates); } catch {} };
    const timer = setInterval(refresh, 3000); refresh();
    return () => { active = false; clearInterval(timer); };
  }, [inviteOpen, meeting?.meetingId, meeting?.role]);

  const createMeeting = async (form) => { primeMeetingAudio(); setBusy(true); try { const created = await api.createMeeting(form); setMeetings((items) => [created, ...items]); await connectAccess(created); } catch (error) { disconnect(true); toast(error.message, 'error'); } finally { setBusy(false); } };
  const sharedLocalStream = async (screen, microphone = mediaRef.current) => {
    sharedAudio.current?.close();
    const mixer = await createSharedAudioMixer(sourceStream.current, microphone); sharedAudio.current = mixer;
    mixer.setStateHandler?.((running) => {
      if (sharedAudio.current !== mixer || sharingRef.current !== screen || !connection.current) return;
      const reliableTrack = running && mixer.mixedTrack ? mixer.mixedTrack : mixer.fallbackTrack;
      connection.current.setLocalStream(new MediaStream([...(reliableTrack ? [reliableTrack] : []), ...screen.getVideoTracks()])).catch(() => {});
    });
    return new MediaStream([...(mixer.track ? [mixer.track] : []), ...screen.getVideoTracks()]);
  };
  const publishMedia = async (next) => { mediaRef.current = next; setMedia(next); await connection.current?.setLocalStream(sharing ? await sharedLocalStream(sharing, next) : next); };
  const acquireTrack = async (kind) => { if (!navigator.mediaDevices?.getUserMedia) throw new Error('Tu navegador no ofrece captura de cámara y micrófono.'); const captured = await navigator.mediaDevices.getUserMedia({ audio: kind === 'audio' ? voiceCaptureConstraints() : false, video: kind === 'video' }); const track = captured.getTracks()[0]; const retained = mediaRef.current.getTracks().filter((item) => item.kind !== kind); await publishMedia(new MediaStream([...retained, track])); return track; };
  const toggleTrack = async (kind) => { try { const isAudio = kind === 'audio'; if (isAudio && meeting?.role !== 'HOST' && participantMicsLocked) { toast('El anfitrión bloqueó temporalmente los micrófonos.', 'info'); return; } const active = isAudio ? mic : camera; let track = mediaRef.current.getTracks().find((item) => item.kind === kind && item.readyState === 'live'); if (!track) track = await acquireTrack(kind); else track.enabled = !active; const enabled = track.enabled; if (isAudio) setMic(enabled); else setCamera(enabled); saveMediaPreferences(isAudio ? { mic: enabled } : { camera: enabled }); connection.current?.setPresence({ mic: isAudio ? enabled : mic, camera: isAudio ? camera : enabled, sharing: Boolean(sharing), handRaised, speaking: isAudio ? localSpeaking && enabled : localSpeaking }); } catch (error) { toast(error.message || 'No fue posible acceder al dispositivo.', 'error'); } };
  const stopShare = async () => {
    const owner = connection.current?.selfId;
    if (sharingRef.current && owner) connection.current?.collaborate('collab-reset', { presenterPeerId: owner });
    sharedAudio.current?.close(); sharedAudio.current = null; sourceStream.current?.getTracks().forEach((track) => track.stop()); sharingRef.current?.getTracks().forEach((track) => track.stop()); cancelAnimationFrame(renderLoop.current); sourceStream.current = null; sharingRef.current = null; presentationOwner.current = null; setSharing(null); setShareHasAudio(false); setShareAudioEnabled(true); setCropSource(null); setPrivacySource(null); saveMediaPreferences({ sharing: false }); resetCollaboration(); await connection.current?.setLocalStream(mediaRef.current); connection.current?.setPresence({ sharing: false });
  };
  const publishShare = async (stream) => { sharingRef.current = stream; presentationOwner.current = connection.current?.selfId || null; resetCollaboration(); setSharing(stream); saveMediaPreferences({ sharing: true }); await connection.current?.setLocalStream(await sharedLocalStream(stream)); connection.current?.setPresence({ sharing: true }); primeMeetingAudio(); requestAnimationFrame(primeMeetingAudio); };
  const toggleSharedAudio = () => {
    const tracks = sourceStream.current?.getAudioTracks() || [];
    if (!tracks.length) { toast('La fuente compartida no entregó sonido al navegador.', 'info'); return; }
    const next = !shareAudioEnabled; tracks.forEach((track) => { track.enabled = next; }); setShareAudioEnabled(next);
    toast(next ? 'Sonido de la pantalla compartida activado.' : 'Sonido de la pantalla compartida silenciado.', 'info');
  };
  const capture = async (custom = false, protectedMode = false) => {
    setShareMenu(false); if (!joined) return;
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Este navegador móvil no expone captura de pantalla a páginas web. Usa Chrome/Edge/Firefox de escritorio o comparte con la cámara trasera.');
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: { suppressLocalAudioPlayback: false }, selfBrowserSurface: 'exclude', preferCurrentTab: false, surfaceSwitching: 'include', systemAudio: 'include' });
      stream.getVideoTracks()[0]?.applyConstraints({ frameRate: { ideal: 20, max: 30 } }).catch(() => {});
      stream.getAudioTracks().forEach((track) => track.applyConstraints?.({ suppressLocalAudioPlayback: false }).catch(() => {}));
      sourceStream.current = stream; setShareHasAudio(stream.getAudioTracks().length > 0); setShareAudioEnabled(true); stream.getVideoTracks()[0].addEventListener('ended', stopShare, { once: true });
      if (protectedMode && user.role === 'ADMIN') setPrivacySource(stream);
      else if (custom) setCropSource(stream); else { await publishShare(stream); toast(stream.getAudioTracks().length ? 'Pantalla, micrófono y audio disponible mezclados correctamente.' : 'Pantalla y micrófono compartidos. El audio interno depende de la fuente y del navegador.', 'info'); }
    } catch (error) { if (error.name !== 'NotAllowedError' && error.name !== 'AbortError') toast(error.message, 'error'); }
  };
  const shareRearCamera = async () => {
    setShareMenu(false); if (!joined) return;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Tu navegador no permite capturar la cámara.');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      sourceStream.current = stream; setShareHasAudio(false); setShareAudioEnabled(true); stream.getVideoTracks()[0]?.addEventListener('ended', stopShare, { once: true }); await publishShare(stream);
      toast('Cámara trasera compartida como presentación. Úsala para documentos, pizarras o una segunda pantalla.');
    } catch (error) { if (error.name !== 'NotAllowedError') toast(error.message || 'No fue posible abrir la cámara trasera.', 'error'); }
  };
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
  const confirmPrivacyMasks = async (masks) => {
    try {
      localStorage.setItem(maskKey, JSON.stringify(masks)); setSavedMasks(masks);
      const video = document.createElement('video'); video.srcObject = privacySource; video.muted = true; video.playsInline = true;
      await video.play(); await waitForVideoMetadata(video);
      const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx || typeof canvas.captureStream !== 'function') throw new Error('Tu navegador no permite aplicar la protección visual antes de compartir.');
      const draw = () => {
        const scale = Math.min(1, 1280 / video.videoWidth); const width = Math.max(2, Math.round(video.videoWidth * scale)); const height = Math.max(2, Math.round(video.videoHeight * scale));
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        for (const mask of masks) {
          const x = canvas.width * mask.x / 100; const y = canvas.height * mask.y / 100; const w = canvas.width * mask.w / 100; const h = canvas.height * mask.h / 100;
          ctx.fillStyle = '#05040a'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = '#7f52c8'; ctx.lineWidth = Math.max(2, canvas.width / 640); ctx.strokeRect(x, y, w, h);
        }
        renderLoop.current = requestAnimationFrame(draw);
      };
      draw(); const protectedStream = canvas.captureStream(24); setPrivacySource(null); await publishShare(protectedStream);
      toast('Pantalla compartida con las zonas privadas integradas en el video.', 'info');
    } catch (error) { await stopShare(); toast(error.message || 'No fue posible aplicar la protección visual.', 'error'); }
  };
  const toggleHand = () => { const next = !handRaised; setHandRaised(next); if (next) announceRaisedHand(user.name); connection.current?.setPresence({ mic, camera, sharing: Boolean(sharing), handRaised: next, speaking: localSpeaking }); };
  const react = (emoji) => { connection.current?.react(emoji); showReaction({ emoji, senderName: user.name }); setReactionMenu(false); };
  const requestCollaboration = (mode, presenterPeerId) => {
    if (!presenterPeerId || requestedCollaboration) return;
    const requestId = crypto.randomUUID(); setRequestedCollaboration({ requestId, mode, presenterPeerId });
    connection.current?.collaborate('collab-request', { requestId, mode }, presenterPeerId);
    clearTimeout(requestTimer.current); requestTimer.current = setTimeout(() => setRequestedCollaboration((current) => current?.requestId === requestId ? null : current), 20000);
    toast(mode === 'draw' ? 'Solicitud de dibujo enviada al presentador.' : 'Solicitud de control guiado enviada al presentador.', 'info');
  };
  const respondCollaboration = (approved) => {
    const request = collaborationRequest; const client = connection.current; if (!request || !client?.selfId) return;
    if (approved) collaborationGrants.current.set(request.peerId, request.mode); else collaborationGrants.current.delete(request.peerId);
    client.collaborate('collab-grant', { requestId: request.requestId, grantee: request.peerId, presenterPeerId: client.selfId, mode: request.mode, approved });
    setCollaborationRequest(null); toast(approved ? `Permiso concedido a ${request.name}.` : `Solicitud de ${request.name} rechazada.`, 'info');
  };
  const selectCollaborationMode = (mode, presenterPeerId) => {
    if (sharing) { setCollaborationMode((current) => current === mode ? null : mode); return; }
    if (collaborationPermission?.presenterPeerId === presenterPeerId && collaborationPermission.mode === mode) { setCollaborationMode((current) => current === mode ? null : mode); return; }
    requestCollaboration(mode, presenterPeerId);
  };
  const sendCollaborationPoint = (payload) => {
    const owner = presentationOwner.current; if (!owner) return;
    const message = { ...payload, presenterPeerId: owner };
    if (payload.mode === 'draw') mergeAnnotationPoint(message);
    else setRemoteCursors((items) => ({ ...items, [connection.current.selfId]: { ...payload.point, color: collaborationColor, name: user.name } }));
    connection.current?.collaborate('collab-point', message);
  };
  const clearAnnotations = () => { const owner = presentationOwner.current; if (!sharing || !owner) return; setAnnotationStrokes([]); connection.current?.collaborate('collab-clear', { presenterPeerId: owner, mode: 'draw' }); };
  const speakingChanged = useCallback((speaking) => { setLocalSpeaking(speaking); connection.current?.setPresence({ mic, camera, sharing: Boolean(sharing), handRaised, speaking }); }, [mic, camera, sharing, handRaised]);
  const sendChat = async (body) => { try { const message = await api.postMeetingMessage({ meetingId: meeting.meetingId, body, replyToId: replyTo?.id || '' }); mergeMessage(message); showFloatingMessage(message); connection.current?.chat(message); setReplyTo(null); } catch (error) { toast(error.message, 'error'); } };
  const reactToMessage = async (message, emoji) => { try { const update = await api.reactToMeetingMessage({ meetingId: meeting.meetingId, messageId: message.id, emoji }); applyChatReaction(update); connection.current?.reactToChat(update); } catch (error) { toast(error.message, 'error'); } };
  const copyInvite = async () => {
    try {
      const link = await api.createMeetingShareLink(meeting.meetingId); const url = new URL(location.href);
      url.pathname = url.pathname.replace(/\/dist\/index\.html$/, '/'); url.search = ''; url.hash = ''; url.searchParams.set('invite', link.token);
      await navigator.clipboard.writeText(`${meeting.title}\n${url.href}`);
      toast('Enlace seguro copiado. El invitado deberá usar su propia cuenta.');
    } catch (error) { toast(error.message, 'error'); }
  };
  const openInvites = async () => { setInviteOpen(true); try { setMembers(await api.getMeetingInviteCandidates(meeting.meetingId)); } catch (error) { toast(error.message, 'error'); } };
  const inviteMany = async (selectedMembers) => {
    const outcomes = await Promise.allSettled(selectedMembers.map(async (member) => {
      try { return { member, result: await api.inviteToMeeting({ meetingId: meeting.meetingId, userId: member.id }) }; }
      catch (error) { const failure = new Error(error?.message || 'No fue posible enviar la invitación.'); failure.member = member; throw failure; }
    }));
    const delivered = outcomes.filter((outcome) => outcome.status === 'fulfilled').map((outcome) => outcome.value); const failed = outcomes.filter((outcome) => outcome.status === 'rejected');
    if (delivered.length) {
      const updates = new Map(delivered.map(({ member, result }) => [member.id, result]));
      setMembers((items) => items.map((item) => { const result = updates.get(item.id); return result ? { ...item, invitationId: result.id, invitationStatus: result.status, invitationSeenAt: result.seenAt || null, invitationRespondedAt: null, inviteCount: result.inviteCount } : item; }));
      toast(delivered.length === 1 ? `${delivered[0].member.name} recibió la invitación.` : `${delivered.length} invitaciones fueron enviadas.`);
    }
    if (failed.length) toast(`${failed.length === 1 ? 'Una invitación no pudo enviarse' : `${failed.length} invitaciones no pudieron enviarse`}. ${failed[0].reason?.message || 'Intenta nuevamente.'}`, 'error');
    return { deliveredIds: delivered.map(({ member }) => member.id), failedIds: failed.map((outcome) => outcome.reason?.member?.id).filter(Boolean) };
  };
  const admission = async (participant, admit) => { try { await api[admit ? 'admitMeetingParticipant' : 'denyMeetingParticipant']({ meetingId: meeting.meetingId, participantId: participant.id }); setWaitingParticipants((items) => items.filter((item) => item.id !== participant.id)); toast(admit ? `${participant.name} puede entrar.` : `${participant.name} fue rechazado.`); } catch (error) { toast(error.message, 'error'); } };
  const toggleLock = async () => { try { const result = await api.setMeetingLocked({ meetingId: meeting.meetingId, locked: !meeting.locked }); setMeeting({ ...meeting, locked: result.locked }); toast(result.locked ? 'Sala bloqueada.' : 'Sala desbloqueada.'); } catch (error) { toast(error.message, 'error'); } };
  const toggleParticipantMics = async () => { try { const result = await connection.current?.setParticipantMicsLocked(!participantMicsLocked); if (!result) return; setParticipantMicsLocked(Boolean(result.participantMicsLocked)); setMeeting((current) => ({ ...current, participantMicsLocked: Boolean(result.participantMicsLocked) })); toast(result.participantMicsLocked ? 'Todos los participantes fueron silenciados y no podrán activar el micrófono.' : 'Los participantes ya pueden activar sus micrófonos.'); } catch (error) { toast(error.message, 'error'); } };
  const endMeeting = async () => { if (!confirm('¿Finalizar la reunión para todos? Esta acción no se puede deshacer.')) return; try { await api.endMeeting({ meetingId: meeting.meetingId }); await connection.current?.endMeeting(); await stopShare(); saveMediaPreferences({ mic: false, camera: false, sharing: false }); disconnect(true); stopMedia(); toast('Reunión finalizada para todos.'); } catch (error) { toast(error.message, 'error'); } };
  const leave = async () => { await stopShare(); saveMediaPreferences({ mic: false, camera: false, sharing: false }); disconnect(true); stopMedia(); toast(meeting?.role === 'HOST' ? 'Saliste; la reunión seguirá activa hasta que la finalices.' : 'Saliste de la reunión.'); api.getMyMeetings().then(setMeetings).catch(() => {}); };
  const restartMeeting = async (item) => { if (!confirm(`¿Reiniciar “${item.title}”? Los participantes anteriores tendrán que volver a ser invitados o admitidos.`)) return; setBusy(true); try { const restarted = await api.restartMeeting({ meetingId: item.meetingId || item.id }); setMeetings((items) => [restarted, ...items.filter((current) => current.id !== item.id)]); await connectAccess(restarted); toast('Reunión reiniciada. Solo tú conservaste el acceso de anfitrión.'); } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); } };
  const removeEndedMeeting = async (item) => { const warning = item.host ? `¿Eliminar definitivamente “${item.title}” y todos sus registros de reunión?` : `¿Quitar “${item.title}” de tu historial?`; if (!confirm(warning)) return; setBusy(true); try { const result = await api.removeEndedMeeting({ meetingId: item.meetingId || item.id }); setMeetings((items) => items.filter((current) => current.id !== item.id)); toast(result.scope === 'GLOBAL' ? 'Reunión eliminada definitivamente.' : 'Reunión retirada de tu historial.'); } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); } };

  useEffect(() => {
    if (!joined || !meeting?.scheduledEndsAt) return undefined;
    const remaining = new Date(meeting.scheduledEndsAt).getTime() - Date.now();
    const closeScheduledSession = async () => { await stopShare(); saveMediaPreferences({ mic: false, camera: false, sharing: false }); disconnect(true); stopMedia(); toast('La franja programada de esta reunión terminó.', 'info'); };
    if (remaining <= 0) { closeScheduledSession(); return undefined; }
    const timer = setTimeout(closeScheduledSession, Math.min(remaining, 2_147_000_000));
    return () => clearTimeout(timer);
  }, [joined, meeting?.scheduledEndsAt]);

  const remotePresentationEntry = Object.entries(remoteStreams).find(([peerId, stream]) => participants.find((item) => item.peerId === peerId)?.sharing && stream.getVideoTracks().some((track) => track.readyState === 'live'));
  const currentPresentationOwner = sharing ? connection.current?.selfId || null : remotePresentationEntry?.[0] || null;
  const firstRemoteVideo = Object.values(remoteStreams).find((stream) => stream.getVideoTracks().some((track) => track.enabled && track.readyState === 'live'));
  const preferredPipStream = sharing || firstRemoteVideo || (camera && media?.getVideoTracks().some((track) => track.enabled && track.readyState === 'live') ? media : null);
  const pipMirrored = preferredPipStream === media;
  const syncPipSource = async () => {
    const video = pipVideoRef.current; if (!video) return false;
    let stream = preferredPipStream;
    if (stream && pipPlaceholderRef.current) { pipPlaceholderRef.current.close(); pipPlaceholderRef.current = null; }
    if (!stream) {
      if (!pipPlaceholderRef.current) pipPlaceholderRef.current = createMeetingPipPlaceholder(meeting?.title);
      stream = pipPlaceholderRef.current?.stream || null;
    }
    if (!stream) return false;
    if (video.srcObject !== stream) video.srcObject = stream;
    await video.play();
    if (!video.videoWidth || !video.videoHeight) await waitForVideoMetadata(video);
    return true;
  };
  const enterPictureInPicture = async (silent = false) => {
    const video = pipVideoRef.current;
    if (!joined || !video) return;
    try {
      if (document.pictureInPictureElement === video) { await document.exitPictureInPicture(); return; }
      if (video.webkitPresentationMode === 'picture-in-picture') { video.webkitSetPresentationMode('inline'); return; }
      if (!await syncPipSource()) throw new Error('Tu navegador necesita una cámara o pantalla activa para abrir la ventana flotante.');
      if (typeof video.requestPictureInPicture === 'function' && document.pictureInPictureEnabled !== false) await video.requestPictureInPicture();
      else if (typeof video.webkitSetPresentationMode === 'function' && video.webkitSupportsPresentationMode?.('picture-in-picture')) video.webkitSetPresentationMode('picture-in-picture');
      else throw new Error('Tu navegador no admite la ventana flotante de reuniones.');
    } catch (error) { if (!silent && !['NotAllowedError', 'AbortError'].includes(error.name)) toast(error.message, 'info'); }
  };
  useEffect(() => {
    if (presentationOwner.current === currentPresentationOwner) return;
    presentationOwner.current = currentPresentationOwner; resetCollaboration();
    if (!currentPresentationOwner || sharing) return;
    const timer = setTimeout(() => connection.current?.collaborate('collab-state-request', { presenterPeerId: currentPresentationOwner }, currentPresentationOwner), 250);
    return () => clearTimeout(timer);
  }, [currentPresentationOwner]);
  useEffect(() => {
    const video = pipVideoRef.current; if (!video) return undefined;
    const entered = () => setPipActive(true); const left = () => setPipActive(false);
    const webkitChanged = () => setPipActive(video.webkitPresentationMode === 'picture-in-picture');
    video.addEventListener('enterpictureinpicture', entered); video.addEventListener('leavepictureinpicture', left); video.addEventListener('webkitpresentationmodechanged', webkitChanged);
    return () => { video.removeEventListener('enterpictureinpicture', entered); video.removeEventListener('leavepictureinpicture', left); video.removeEventListener('webkitpresentationmodechanged', webkitChanged); };
  }, [meeting?.meetingId]);
  useEffect(() => { if (joined) syncPipSource().catch(() => {}); }, [joined, preferredPipStream, meeting?.meetingId]);
  useEffect(() => {
    const continueOutside = () => { if (document.hidden && joined && !pipActive) enterPictureInPicture(true); };
    document.addEventListener('visibilitychange', continueOutside);
    return () => document.removeEventListener('visibilitychange', continueOutside);
  }, [joined, pipActive, preferredPipStream]);
  useEffect(() => {
    if (joined) return;
    if (document.pictureInPictureElement === pipVideoRef.current) document.exitPictureInPicture?.().catch(() => {});
    if (pipVideoRef.current?.webkitPresentationMode === 'picture-in-picture') pipVideoRef.current.webkitSetPresentationMode('inline');
    if (pipVideoRef.current) { pipVideoRef.current.pause(); pipVideoRef.current.srcObject = null; }
    pipPlaceholderRef.current?.close(); pipPlaceholderRef.current = null;
  }, [joined]);

  if (!meeting) return <MeetingLobby busy={busy} meetings={meetings} initialCode={queryCode} onCreate={createMeeting} onJoin={enterMeeting} onResume={(item) => enterMeeting({ roomCode: item.roomCode })} onRestart={restartMeeting} onRemove={removeEndedMeeting} canCreate={canCreate} />;
  if (waiting) return <div className="meeting-waiting surface"><span className="waiting-orbit" /><p className="eyebrow">SALA DE ESPERA</p><h1>{meeting.title}</h1><p>El anfitrión recibió tu solicitud. Esta pantalla entrará automáticamente cuando te admita.</p><strong>{meeting.roomCode}</strong><button className="secondary-button" onClick={() => disconnect(true)}>Cancelar</button></div>;

  const remoteEntries = Object.entries(remoteStreams); const isHost = meeting.role === 'HOST';
  const remotePresentation = remotePresentationEntry;
  const presentationStream = sharing || remotePresentation?.[1];
  const presentationPeer = remotePresentation && participants.find((item) => item.peerId === remotePresentation[0]);
  const canCollaborate = Boolean(sharing) || collaborationPermission?.presenterPeerId === currentPresentationOwner;
  return <section className={`meeting-page ${mobilePanelOpen ? 'mobile-panel-open' : ''}`}>
    {mobilePanelOpen && <button className="meeting-mobile-scrim" type="button" aria-label="Cerrar chat" onClick={() => setMobilePanelOpen(false)} />}
    <button className={`mobile-chat-fab ${mobilePanelOpen ? 'active' : ''}`} type="button" disabled={!joined} onClick={() => { setSideTab('chat'); setMobilePanelOpen((open) => !open); }}><MessageCircle /><span>{mobilePanelOpen ? 'Cerrar chat' : 'Abrir chat'}</span>{messages.length > 0 && <i>{messages.length}</i>}</button>
    <div className="meeting-top"><div><p className="eyebrow">REUNIÓN ACTIVA</p><h1>{meeting.title}</h1></div><div className="meeting-top-actions"><button className={`secondary-button ${pipActive ? 'active' : ''}`} disabled={!joined} onClick={() => enterPictureInPicture()} title="Mantener la reunión visible al cambiar de aplicación"><PictureInPicture2 /> {pipActive ? 'Cerrar ventana' : 'Ventana flotante'}</button><button className="secondary-button" onClick={copyInvite}><Copy /> {meeting.roomCode}</button>{isHost && <button className="secondary-button" onClick={openInvites}><UserPlus /> Invitar</button>}{isHost && <button className={`secondary-button participant-mic-lock ${participantMicsLocked ? 'active' : ''}`} onClick={toggleParticipantMics}>{participantMicsLocked ? <Mic /> : <MicOff />} {participantMicsLocked ? 'Permitir micrófonos' : 'Silenciar a todos'}</button>}<div className={`secure-pill ${status} ${relayReady === false ? 'relay-missing' : ''}`}><ShieldCheck /> {status === 'connected' ? relayReady ? 'WebRTC + TURN' : 'WebRTC sin relay' : status === 'signaling' ? 'Conectando…' : 'Fuera de línea'}</div></div></div>
    <div className="meeting-grid">
      <div className="meeting-stage">
        {presentationStream ? <><VideoSurface presentation stream={presentationStream} name={sharing ? 'Tu pantalla' : `${presentationPeer?.name || 'Participante'} · pantalla`} avatarSeed={sharing ? user.id : presentationPeer?.userId} avatar={sharing ? user.avatar : presentationPeer?.avatar} muted playAudio={false} /><span className="presenter-label">{sharing ? 'Tu pantalla · compartiendo por WebRTC' : `${presentationPeer?.name || 'Participante'} está compartiendo`}</span>{sharing && shareHasAudio && <button className={`presentation-audio-toggle ${shareAudioEnabled ? 'active' : ''}`} type="button" aria-pressed={shareAudioEnabled} title={shareAudioEnabled ? 'Silenciar sonido de la pantalla compartida' : 'Activar sonido de la pantalla compartida'} onClick={toggleSharedAudio}>{shareAudioEnabled ? <Volume2 /> : <VolumeX />}<span>{shareAudioEnabled ? 'Sonido compartido' : 'Sonido silenciado'}</span></button>}<CollaborationOverlay active={canCollaborate && Boolean(collaborationMode)} mode={collaborationMode} color={collaborationColor} strokes={annotationStrokes} cursors={remoteCursors} onPoint={sendCollaborationPoint} /></> : <div className="video-grid"><VideoSurface stream={media} name={`${user.name} · Tú`} avatarSeed={user.id} avatar={user.avatar} muted mirrored speaking={localSpeaking} handRaised={handRaised} />{remoteEntries.map(([peerId, stream]) => { const peer = participants.find((item) => item.peerId === peerId); return <VideoSurface key={peerId} stream={stream} name={peer?.name || 'Participante'} avatarSeed={peer?.userId || peerId} avatar={peer?.avatar} playAudio={false} speaking={peer?.speaking} handRaised={peer?.handRaised} />; })}</div>}
        <RemoteAudioLayer streams={remoteStreams} onBlockedChange={setAudioBlocked} />
        {audioBlocked && <button className="meeting-audio-unlock" onClick={() => window.dispatchEvent(new Event('galaxy:resume-meeting-audio'))}><Volume2 /> Activar sonido de la reunión</button>}
        <div className="floating-chat-layer" aria-live="polite">{floatingMessages.map((item) => <article className="floating-chat-message" key={item.id}><MessageCircle /><span><strong>{item.senderName}</strong><p>{item.body}</p></span></article>)}</div>
        {presentationStream && <div className="collaboration-toolbar glass"><button className={collaborationMode === 'draw' ? 'active' : ''} disabled={Boolean(requestedCollaboration)} onClick={() => selectCollaborationMode('draw', remotePresentation?.[0])}><Pencil /> {requestedCollaboration?.mode === 'draw' ? 'Esperando permiso' : 'Dibujar'}</button><button className={collaborationMode === 'pointer' ? 'active' : ''} disabled={Boolean(requestedCollaboration)} onClick={() => selectCollaborationMode('pointer', remotePresentation?.[0])}><MousePointer2 /> {requestedCollaboration?.mode === 'pointer' ? 'Esperando permiso' : 'Control guiado'}</button>{sharing && <><label className="annotation-color" title="Color de anotación"><input type="color" value={collaborationColor} onChange={(event) => setCollaborationColor(event.target.value)} /></label><button onClick={clearAnnotations}><Eraser /> Limpiar</button></>}</div>}
        <div className="reaction-layer">{reactions.map((item) => <CosmicReaction reaction={item.emoji} senderName={item.senderName} key={item.id} />)}</div>
        <div className="cosmic-reaction-launcher" role="group" aria-label="Reacciones cósmicas">{COSMIC_REACTIONS.map((item) => <button type="button" disabled={!joined} title={`${item.label} para todos`} aria-label={`${item.label} para todos`} key={item.id} onClick={() => react(item.id)}>{item.asset ? <img src={item.asset} alt="" /> : <span>{item.icon}</span>}</button>)}</div>
        <video className={`meeting-pip-source ${pipMirrored ? 'mirrored' : ''}`} ref={pipVideoRef} muted playsInline autoPlay aria-hidden="true" />
      </div>
      <aside className="meeting-side"><div className="meeting-side-tabs"><button className={sideTab === 'people' ? 'active' : ''} onClick={() => setSideTab('people')}><Users /> Personas <span>{participants.length + 1}</span></button><button className={sideTab === 'chat' ? 'active' : ''} onClick={() => setSideTab('chat')}><MessageCircle /> Chat <span>{messages.length}</span></button></div>{sideTab === 'people' ? <><div className="people-list"><div className={`person ${localSpeaking ? 'speaking' : ''}`}><ConstellationAvatar className="avatar avatar-sm" seed={user.id} name={user.name} src={user.avatar} membership={user.membership} /><span>{user.name} · Tú {isHost && <small>Anfitrión</small>} {handRaised && '✋'}</span><AudioMeter stream={media} enabled={mic} onSpeakingChange={speakingChanged} />{mic ? <Mic /> : <MicOff />}</div>{participants.map((peer) => <div className={`person ${peer.speaking ? 'speaking' : ''}`} key={peer.peerId}><ConstellationAvatar className="avatar avatar-sm" seed={peer.userId || peer.peerId} name={peer.name} src={peer.avatar} membership={peer.membership} /><span>{peer.name} {peer.handRaised && '✋'}<small>{peer.role === 'HOST' ? 'Anfitrión' : peerStates[peer.peerId] === 'connected' ? 'Audio P2P conectado' : 'Enlazando medios'}</small></span><AudioMeter stream={remoteStreams[peer.peerId]} enabled={peer.mic} />{isHost && peer.role !== 'HOST' && peer.mic ? <button className="host-mute" title="Silenciar participante" onClick={() => connection.current?.mutePeer(peer.peerId)}><MicOff /></button> : peer.mic ? <Mic /> : <MicOff />}</div>)}</div>{isHost && waitingParticipants.length > 0 && <div className="waiting-list"><p className="eyebrow">ESPERANDO ({waitingParticipants.length})</p>{waitingParticipants.map((item) => <div className="person" key={item.id}><ConstellationAvatar className="avatar avatar-sm" seed={item.userId} name={item.name} src={item.avatar} membership={item.membership} /><span>{item.name}<small>@{item.username}</small></span><button title="Admitir" onClick={() => admission(item, true)}><Check /></button><button title="Rechazar" onClick={() => admission(item, false)}><X /></button></div>)}</div>}<div className="meeting-side-footer"><button className="secondary-button" onClick={copyInvite}><Copy /> Copiar invitación</button>{isHost && <button className="secondary-button" onClick={toggleLock}>{meeting.locked ? <Unlock /> : <Lock />} {meeting.locked ? 'Desbloquear' : 'Bloquear sala'}</button>}</div></> : <ChatPanel messages={messages} user={user} replyTo={replyTo} setReplyTo={setReplyTo} onSend={sendChat} onReact={reactToMessage} />}</aside>
    </div>
    <div className="control-dock glass"><button className={mic ? 'active' : ''} disabled={!joined || (meeting.role !== 'HOST' && participantMicsLocked)} title={meeting.role !== 'HOST' && participantMicsLocked ? 'Micrófono bloqueado por el anfitrión' : ''} onClick={() => toggleTrack('audio')}>{mic ? <Mic /> : <MicOff />}<AudioMeter stream={media} enabled={mic} /><span>{meeting.role !== 'HOST' && participantMicsLocked ? 'Bloqueado' : mic ? 'Silenciar' : 'Activar audio'}</span></button><button className={camera ? 'active' : ''} disabled={!joined} onClick={() => toggleTrack('video')}>{camera ? <Camera /> : <CameraOff />}<span>{camera ? 'Apagar cámara' : 'Iniciar video'}</span></button><div className="share-wrap"><button className={sharing ? 'active' : ''} disabled={!joined} onClick={() => sharing ? stopShare() : setShareMenu(!shareMenu)}><MonitorUp /><span>{sharing ? 'Detener' : 'Compartir'}</span></button>{shareMenu && <div className="share-menu glass"><button onClick={() => capture(false)}><MonitorUp />Pantalla, ventana o pestaña<span>{navigator.mediaDevices?.getDisplayMedia ? 'Selector seguro del navegador' : 'No disponible en este navegador móvil'}</span></button><button onClick={() => capture(true)} disabled={!navigator.mediaDevices?.getDisplayMedia}><span className="crop-icon" />Área personalizada<span>{savedCrop ? 'Reutilizar el recorte guardado' : 'Captura autorizada + recorte local'}</span></button>{user.role === 'ADMIN' && <button onClick={() => capture(false, true)} disabled={!navigator.mediaDevices?.getDisplayMedia}><ShieldCheck />Pantalla con cobertura de datos<span>Opcional · cubre nombres antes de transmitir</span></button>}<button onClick={shareRearCamera}><Camera />Cámara trasera o documento<span>Alternativa compatible con móviles y tablets</span></button></div>}</div><button className={handRaised ? 'active' : ''} disabled={!joined} onClick={toggleHand}><Hand /><span>{handRaised ? 'Bajar mano' : 'Alzar mano'}</span></button><div className="reaction-wrap"><button disabled={!joined} onClick={() => setReactionMenu(!reactionMenu)}><SmilePlus /><span>Reaccionar</span></button>{reactionMenu && <div className="reaction-menu glass">{EMOJIS.map((emoji) => <button key={emoji} onClick={() => react(emoji)}>{emoji}</button>)}</div>}</div><button className="leave-control" onClick={leave}><PhoneOff /><span>Salir</span></button>{isHost && <button className="end-control" onClick={endMeeting}><X /><span>Finalizar</span></button>}</div>
    {cropSource && <CropEditor stream={cropSource} initialCrop={savedCrop} onConfirm={confirmCrop} onCancel={stopShare} />}{privacySource && <PrivacyMaskEditor stream={privacySource} initialMasks={savedMasks} onConfirm={confirmPrivacyMasks} onCancel={stopShare} />}{inviteOpen && <InvitePanel members={members} onlineUserIds={onlineUserIds} onInviteMany={inviteMany} onClose={() => setInviteOpen(false)} />}<CollaborationRequestModal request={collaborationRequest} onRespond={respondCollaboration} />
  </section>;
}
