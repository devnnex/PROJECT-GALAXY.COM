// Keep the enhanced voice in the foreground, but bypass a suspended Web Audio
// graph with the original capture track. Never enable a muted microphone.
export function meetingTransportStream(stream, { nativeTrack, hidden, contextState, Stream = MediaStream }) {
  const processed = stream?.getAudioTracks()[0];
  if (!processed || !nativeTrack || nativeTrack.readyState !== 'live') return stream;
  nativeTrack.enabled = processed.enabled;
  const fallback = hidden || contextState !== 'running' || processed.readyState !== 'live';
  return fallback ? new Stream([nativeTrack, ...stream.getVideoTracks()]) : stream;
}

// Safari supports an explicit communication audio session. Other browsers keep
// their normal WebRTC behavior. Restore the former session when the call ends.
export function claimMeetingAudioSession(agent = navigator) {
  const session = agent.audioSession;
  if (!session) return () => {};
  let previous;
  try { previous = session.type; session.type = 'play-and-record'; } catch { return () => {}; }
  return () => { try { if (session.type === 'play-and-record') session.type = previous; } catch {} };
}
