import { describe, expect, it } from 'vitest';
import { getMeetingMusicPlaybackPlan, isMeetingMusicStateContinuous, MEETING_MUSIC_SYNC } from '../src/meeting-music-playback';

describe('professional meeting music playback', () => {
  it('leaves synchronized audio at its native speed', () => {
    const plan = getMeetingMusicPlaybackPlan(42, 42.05);
    expect(plan.seekTo).toBeNull();
    expect(plan.playbackRate).toBe(1);
    expect(plan.drift).toBeCloseTo(0.05);
  });

  it('corrects normal network drift gently without seeking', () => {
    const late = getMeetingMusicPlaybackPlan(20, 20.5);
    const early = getMeetingMusicPlaybackPlan(20.5, 20);
    expect(late.seekTo).toBeNull();
    expect(late.playbackRate).toBeGreaterThan(1);
    expect(late.playbackRate).toBeLessThanOrEqual(MEETING_MUSIC_SYNC.maximumRate);
    expect(early.seekTo).toBeNull();
    expect(early.playbackRate).toBeLessThan(1);
    expect(early.playbackRate).toBeGreaterThanOrEqual(MEETING_MUSIC_SYNC.minimumRate);
  });

  it('seeks only for a real jump or an explicit transport command', () => {
    expect(getMeetingMusicPlaybackPlan(10, 12).seekTo).toBe(12);
    expect(getMeetingMusicPlaybackPlan(10, 10.1, true).seekTo).toBe(10.1);
  });

  it('recognizes periodic state snapshots as continuous playback', () => {
    const positionAt = (value) => value.position;
    expect(isMeetingMusicStateContinuous(
      { trackId: 'pump-it-up', playing: true, position: 20 },
      { trackId: 'pump-it-up', playing: true, position: 20.1 },
      positionAt,
    )).toBe(true);
    expect(isMeetingMusicStateContinuous(
      { trackId: 'pump-it-up', playing: true, position: 20 },
      { trackId: 'dont-you-cry', playing: true, position: 20 },
      positionAt,
    )).toBe(false);
  });
});
