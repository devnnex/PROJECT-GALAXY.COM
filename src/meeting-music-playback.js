export const MEETING_MUSIC_SYNC = Object.freeze({
  settledDrift: 0.15,
  hardDrift: 2.5,
  minimumRate: 1,
  maximumRate: 1,
  rateGain: 0,
});

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
  return { seekTo: null, playbackRate: 1, drift };
}

export function isMeetingMusicStateContinuous(previous, next, positionAt) {
  if (!previous || !next || previous.trackId !== next.trackId || previous.playing !== next.playing) return false;
  if (!previous.playing) return Math.abs((Number(previous.position) || 0) - (Number(next.position) || 0)) <= MEETING_MUSIC_SYNC.settledDrift;
  return Math.abs(positionAt(previous) - positionAt(next)) < MEETING_MUSIC_SYNC.hardDrift;
}
