import { expect, it } from 'vitest';
import { claimMeetingAudioSession, meetingTransportStream } from '../src/services/meeting-audio-continuity';

class Stream {
  constructor(tracks) { this.tracks = tracks; }
  getAudioTracks() { return this.tracks.filter((track) => track.kind === 'audio'); }
  getVideoTracks() { return this.tracks.filter((track) => track.kind === 'video'); }
}
const setup = () => {
  const processed = { kind: 'audio', enabled: true, readyState: 'live' };
  const nativeTrack = { kind: 'audio', enabled: true, readyState: 'live' };
  const video = { kind: 'video', enabled: true, readyState: 'live' };
  return { processed, nativeTrack, video, stream: new Stream([processed, video]) };
};

it('keeps enhanced speech in the foreground and native capture in a background tab', () => {
  const { stream, nativeTrack, video } = setup();
  expect(meetingTransportStream(stream, { nativeTrack, hidden: false, contextState: 'running', Stream })).toBe(stream);
  const background = meetingTransportStream(stream, { nativeTrack, hidden: true, contextState: 'running', Stream });
  expect(background.tracks).toEqual([nativeTrack, video]);
  expect(meetingTransportStream(stream, { nativeTrack, hidden: false, contextState: 'running', Stream })).toBe(stream);
});

it.each(['suspended', 'interrupted', 'closed'])('uses live capture when the audio processor is %s, even before visibility changes', (contextState) => {
  const { stream, nativeTrack } = setup();
  expect(meetingTransportStream(stream, { nativeTrack, hidden: false, contextState, Stream }).getAudioTracks()).toEqual([nativeTrack]);
});

it('preserves user and moderator mute across fallback and foreground recovery', () => {
  const { stream, processed, nativeTrack } = setup();
  processed.enabled = false;
  const fallback = meetingTransportStream(stream, { nativeTrack, hidden: true, contextState: 'interrupted', Stream });
  expect(fallback.getAudioTracks()[0].enabled).toBe(false);
  expect(meetingTransportStream(stream, { nativeTrack, hidden: false, contextState: 'running', Stream }).getAudioTracks()[0].enabled).toBe(false);
});

it('does not replace working capture with a stopped fallback', () => {
  const { stream, nativeTrack } = setup(); nativeTrack.readyState = 'ended';
  expect(meetingTransportStream(stream, { nativeTrack, hidden: true, contextState: 'suspended', Stream })).toBe(stream);
});

it('claims a communication session only during a meeting and respects later ownership changes', () => {
  const agent = { audioSession: { type: 'auto' } };
  const release = claimMeetingAudioSession(agent);
  expect(agent.audioSession.type).toBe('play-and-record');
  release(); expect(agent.audioSession.type).toBe('auto');
  const again = claimMeetingAudioSession(agent); agent.audioSession.type = 'playback';
  again(); expect(agent.audioSession.type).toBe('playback');
  expect(() => claimMeetingAudioSession({})()).not.toThrow();
});
