import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

function RemoteAudioTrack({ stream, peerId, onBlocked, onKeepAlive }) {
  const ref = useRef(null);
  useEffect(() => {
    const audio = ref.current; if (!audio) return undefined;
    let disposed = false, playVersion = 0;
    const observed = new Set();
    const play = async () => {
      if (disposed || !audio.srcObject) return;
      const attempt = ++playVersion;
      audio.defaultMuted = false; audio.muted = false; audio.volume = 1;
      if (!audio.paused && !audio.ended) { onBlocked(peerId, false); return; }
      try { await audio.play(); if (!disposed && attempt === playVersion) onBlocked(peerId, false); }
      catch { if (!disposed && attempt === playVersion) onBlocked(peerId, true); }
    };
    const syncTracks = () => {
      if (disposed) return;
      const tracks = (stream?.getAudioTracks() || []).filter((track) => track.readyState === 'live');
      for (const track of observed) if (!tracks.includes(track)) { track.removeEventListener('unmute', resume); track.removeEventListener('ended', changed); observed.delete(track); }
      for (const track of tracks) if (!observed.has(track)) { track.addEventListener('unmute', resume); track.addEventListener('ended', changed); observed.add(track); }
      const attached = audio.srcObject?.getAudioTracks?.() || [];
      const unchanged = tracks.length === attached.length && tracks.every((track) => attached.includes(track));
      if (!unchanged) audio.srcObject = tracks.length ? new MediaStream(tracks) : null;
      if (!tracks.length) { onBlocked(peerId, false); return; }
      play();
    };
    const resume = () => { play(); };
    const changed = () => { syncTracks(); };
    const visibilityChanged = () => { play(); onKeepAlive?.(); };
    const background = () => { play(); onKeepAlive?.(); };
    stream?.addEventListener('addtrack', changed); stream?.addEventListener('removetrack', changed);
    window.addEventListener('galaxy:resume-meeting-audio', resume); window.addEventListener('focus', resume); window.addEventListener('pageshow', resume);
    window.addEventListener('pagehide', background); window.addEventListener('pointerdown', resume, true); window.addEventListener('keydown', resume, true); document.addEventListener('visibilitychange', visibilityChanged);
    audio.addEventListener('pause', resume);
    syncTracks();
    return () => {
      disposed = true; onBlocked(peerId, false); window.removeEventListener('galaxy:resume-meeting-audio', resume); window.removeEventListener('focus', resume); window.removeEventListener('pageshow', resume);
      window.removeEventListener('pagehide', background); window.removeEventListener('pointerdown', resume, true); window.removeEventListener('keydown', resume, true); document.removeEventListener('visibilitychange', visibilityChanged);
      stream?.removeEventListener('addtrack', changed); stream?.removeEventListener('removetrack', changed);
      audio.removeEventListener('pause', resume);
      observed.forEach((track) => { track.removeEventListener('unmute', resume); track.removeEventListener('ended', changed); });
      audio.pause(); audio.srcObject = null;
    };
  }, [stream, peerId, onBlocked, onKeepAlive]);
  return <audio ref={ref} className="remote-audio" autoPlay playsInline preload="auto" />;
}

export default function MeetingAudioLayer({ streams, onBlockedChange, onKeepAlive }) {
  const blocked = useRef(new Set());
  const update = useCallback((peerId, isBlocked) => {
    if (isBlocked) blocked.current.add(peerId); else blocked.current.delete(peerId);
    onBlockedChange?.(blocked.current.size > 0);
  }, [onBlockedChange]);
  return createPortal(<div className="remote-audio-layer" aria-hidden="true">{Object.entries(streams).map(([peerId, stream]) => <RemoteAudioTrack key={peerId} peerId={peerId} stream={stream} onBlocked={update} onKeepAlive={onKeepAlive} />)}</div>, document.body);
}
