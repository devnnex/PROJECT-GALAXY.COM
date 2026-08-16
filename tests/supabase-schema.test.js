import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/services/api.js', import.meta.url), 'utf8');
const meetingStudio = readFileSync(new URL('../src/components/MeetingStudio.jsx', import.meta.url), 'utf8');
const meetingClient = readFileSync(new URL('../src/services/meetingClient.js', import.meta.url), 'utf8');
const supabaseClient = readFileSync(new URL('../src/services/supabase.js', import.meta.url), 'utf8');
const meetingStyles = readFileSync(new URL('../src/meeting-live.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

const publicRpc = [
  'get_current_user', 'update_profile', 'get_bootstrap_data', 'create_meeting', 'join_meeting', 'get_my_meetings',
  'get_meeting_state', 'admit_meeting_participant', 'deny_meeting_participant', 'set_meeting_locked',
  'end_meeting', 'get_community_members', 'invite_to_meeting', 'get_meeting_messages',
  'post_meeting_message', 'react_to_meeting_message',
  'get_meeting_message', 'request_meeting_mute', 'consume_meeting_command',
  'get_my_notifications', 'mark_notification_read', 'mark_all_notifications_read', 'respond_to_meeting_invitation',
];

describe('Supabase contract', () => {
  it.each(publicRpc)('defines and grants the %s RPC used by the client', (name) => {
    expect(schema).toMatch(new RegExp(`create or replace function public\\.${name}\\(`, 'i'));
    expect(schema).toMatch(new RegExp(`grant execute[\\s\\S]*public\\.${name}\\(`, 'i'));
    expect(api).toContain(`'${name}'`);
  });

  it('protects operational tables and private realtime topics', () => {
    for (const table of ['profiles', 'wallets', 'meetings', 'meeting_participants', 'meeting_messages', 'meeting_message_reactions']) {
      expect(schema).toContain(`alter table public.${table} enable row level security;`);
    }
    expect(schema).toContain('function public.can_access_realtime_topic');
    expect(schema).toContain("p_extension in ('broadcast','presence')");
    expect(schema).toContain("p_topic='user:'||(select auth.uid())::text");
    expect(schema).toContain('public.can_access_realtime_topic((select realtime.topic()),realtime.messages.extension)');
    expect(api).toContain("config: { private: true }");
  });

  it('delivers actionable meeting notifications to both sides', () => {
    expect(schema).toContain("'MEETING_JOIN_REQUEST'");
    expect(schema).toContain("'MEETING_INVITE'");
    expect(schema).toContain("p_topic like 'db:notifications:'||(select auth.uid())::text||':%'");
    expect(schema).toContain('alter publication supabase_realtime add table public.notifications');
    expect(api).toContain('onNotificationChange(userId, callback)');
    expect(app).toContain('<NotificationActionModal');
    expect(app).toContain("status: accepted ? 'ACCEPTED' : 'DECLINED'");
    expect(app).toContain("accepted ? 'admitMeetingParticipant' : 'denyMeetingParticipant'");
  });

  it('uses the one-RPC meeting creation path and resilient realtime startup', () => {
    expect(schema).toContain("'participantStatus','ADMITTED'");
    expect(meetingStudio).toMatch(/const created = await api\.createMeeting\(form\);[\s\S]*await connectAccess\(created\)/);
    expect(meetingStudio).not.toMatch(/const created = await api\.createMeeting\(form\);[\s\S]{0,180}enterMeeting/);
    expect(meetingClient).toContain('ack: false');
    expect(meetingStudio).toContain('iceServers: normalized.iceServers, user });');
    expect(meetingStudio).toContain("(access.participantStatus || access.status) === 'ADMITTED'");
    expect(supabaseClient).toContain('MissingPartition');
    expect(supabaseClient).toContain('subscribeRealtimeChannel');
    expect(supabaseClient).toContain('supabase.realtime.setAuth');
  });

  it('renders local and remote screen shares on a full-size stage', () => {
    expect(meetingStyles).toMatch(/\.video-surface\.presentation\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;[^}]*width:\s*100%;[^}]*height:\s*100%/);
    expect(meetingStudio).toContain('await waitForVideoMetadata(video)');
    expect(meetingStudio).toContain('const remotePresentation = remoteEntries.find');
    expect(meetingStudio).toContain('<VideoSurface presentation stream={presentationStream}');
  });

  it('captures and mixes shared audio with the presenter microphone', () => {
    expect(meetingStudio).toContain('async function createSharedAudioMixer(displayStream, microphoneStream)');
    expect(meetingStudio).toContain('context.createMediaStreamDestination()');
    expect(meetingStudio).toContain('audio: true');
    expect(meetingStudio).toContain('sharedLocalStream(stream)');
    expect(meetingStudio).toContain('Pantalla y sonido compartidos por WebRTC.');
  });

  it('deletes persisted meeting chat when the host ends a meeting', () => {
    expect(schema).toMatch(/function public\.end_meeting[\s\S]*delete from public\.meeting_messages where meeting_id=p_meeting_id/);
    expect(schema).toContain("'messagesDeleted',v_deleted_messages");
    expect(schema).toContain('message_id uuid not null references public.meeting_messages(id) on delete cascade');
    expect(schema).toContain("where id=p_meeting_id and status='ACTIVE' for update");
    expect(schema).toMatch(/delete from public\.meeting_messages msg\s+using public\.meetings meeting\s+where msg\.meeting_id=meeting\.id and meeting\.status='ENDED'/);
  });

  it('persists editable profile information without accepting an avatar upload', () => {
    expect(schema).toContain('function public.update_profile(p_name text,p_username text,p_bio text');
    expect(schema).toContain("'bio', p.bio");
    expect(schema).toContain("'xp', p.xp");
    expect(schema).toContain("'wallet',coalesce");
    expect(api).toContain("updateProfile: (payload) => rpc('update_profile', payload)");
    expect(app).toContain('api.updateProfile(values)');
    expect(app).not.toMatch(/type=["']file["']/i);
    expect(app).not.toContain('1,840 XP');
    expect(app).not.toContain('Nivel 12');
  });

  it('keeps account creation resilient and reports actionable Auth failures', () => {
    expect(schema).toMatch(/function public\.handle_new_user\(\)[\s\S]*security definer set search_path = ''/i);
    expect(schema).toContain("nullif(trim(new.raw_user_meta_data->>'name'),'')");
    expect(schema).toContain("v_username_base:=regexp_replace");
    expect(schema).toMatch(/exception when unique_violation[\s\S]*insert into public\.profiles/);
    expect(api).toContain("code === 'email_address_not_authorized'");
    expect(api).toContain("code === 'over_email_send_rate_limit'");
    expect(api).toContain("code === 'email_send_failed'");
    expect(api).toContain("code === 'unexpected_failure'");
  });

  it('contains no Apps Script transport in the browser API', () => {
    expect(api).not.toMatch(/script\.google|pollMeetingRealtime|postMeetingSignals/);
  });
});
