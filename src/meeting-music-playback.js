export const MEETING_MUSIC_SYNC = Object.freeze({
  settledDrift: 0.08,
  hardDrift: 1.5,
  minimumRate: 0.9925,
  maximumRate: 1.0075,
  rateGain: 0.018,
});

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function getMeetingMusicPlaybackPlan(currentTime, expectedTime, forceSeek = false) {
  const current = Math.max(0, Number(currentTime) || 0);
  const expected = Math.max(0, Number(expectedTime) || 0);
  const drift = expected - current;
  const absoluteDrift = Math.abs(drift);

  if (forceSeek || absoluteDrift >= MEETING_MUSIC_SYNC.hardDrift) {
    return { seekTo: expected, playbackRate: 1, drift };
  }
  if (absoluteDrift <= MEETING_MUSIC_SYNC.settledDrift) {
    return { seekTo: null, playbackRate: 1, drift };
  }
  return {
    seekTo: null,
    playbackRate: clamp(1 + drift * MEETING_MUSIC_SYNC.rateGain, MEETING_MUSIC_SYNC.minimumRate, MEETING_MUSIC_SYNC.maximumRate),
    drift,
  };
}

export function isMeetingMusicStateContinuous(previous, next, positionAt) {
  if (!previous || !next || previous.trackId !== next.trackId || previous.playing !== next.playing) return false;
  if (!previous.playing) return Math.abs((Number(previous.position) || 0) - (Number(next.position) || 0)) <= MEETING_MUSIC_SYNC.settledDrift;
  return Math.abs(positionAt(previous) - positionAt(next)) < MEETING_MUSIC_SYNC.hardDrift;
}
