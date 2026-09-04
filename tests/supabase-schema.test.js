import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/services/api.js', import.meta.url), 'utf8');
const meetingStudio = readFileSync(new URL('../src/components/MeetingStudio.jsx', import.meta.url), 'utf8');
const meetingClient = readFileSync(new URL('../src/services/meetingClient.js', import.meta.url), 'utf8');
const supabaseClient = readFileSync(new URL('../src/services/supabase.js', import.meta.url), 'utf8');
const meetingStyles = readFileSync(new URL('../src/meeting-live.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const avatar = readFileSync(new URL('../src/components/ConstellationAvatar.jsx', import.meta.url), 'utf8');
const appHtml = readFileSync(new URL('../app.html', import.meta.url), 'utf8');

const publicRpc = [
  'get_current_user', 'update_profile', 'update_profile_avatar', 'get_bootstrap_data', 'create_meeting', 'join_meeting', 'get_my_meetings',
  'get_meeting_state', 'admit_meeting_participant', 'deny_meeting_participant', 'set_meeting_locked', 'set_participant_mics_locked',
  'restart_meeting', 'remove_ended_meeting',
  'end_meeting', 'get_community_members', 'get_meeting_invite_candidates', 'mark_meeting_invitation_seen',
  'invite_to_meeting', 'get_meeting_messages',
  'post_meeting_message', 'react_to_meeting_message',
  'get_meeting_message', 'request_meeting_mute', 'consume_meeting_command',
  'get_my_notifications', 'mark_notification_read', 'mark_all_notifications_read', 'respond_to_meeting_invitation',
  'get_membership_center',
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
    expect(schema).toContain("p_topic='community:online' and p_extension='presence'");
    expect(schema).toContain('public.can_access_realtime_topic((select realtime.topic()),realtime.messages.extension)');
    expect(api).toContain("config: { private: true }");
  });

  it('shows true online presence and supports secure batch invitations', () => {
    expect(supabaseClient).toContain("supabase.channel('community:online'");
    expect(supabaseClient).toContain('presence: { key: userId }');
    expect(supabaseClient).toContain("channel.track({ userId, onlineAt:");
    expect(supabaseClient).toContain('export function onOnlineUsersChange(callback)');
    expect(meetingStudio).toContain('onlineUserIds.has(member.id)');
    expect(meetingStudio).toContain('Promise.allSettled(selectedMembers.map');
    expect(meetingStudio).toContain('onInviteMany={inviteMany}');
    expect(meetingStudio).toContain('className="invite-online-dot"');
    expect(meetingStyles).toContain('.invite-avatar-shell.online:before');
    expect(meetingStyles).toContain('flex: 0 0 48px!important');
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
    expect(app).toContain('setActiveNotice(null)');
    expect(schema).toContain("if v_invite.status=p_status then");
    expect(schema).toContain("and v_invite.status='PENDING'");
  });

  it('prevents duplicate connections and duplicate presence for one user', () => {
    expect(meetingStudio).toContain('const lifecycleEpoch = useRef(0)');
    expect(meetingStudio).toContain('const connectSequence = useRef(0)');
    expect(meetingStudio).toContain('entryInFlight.current?.key === key');
    expect(meetingClient).toContain('this.connectVersion = 0');
    expect(meetingClient).toContain('peer.userId === this.identity?.userId');
    expect(meetingClient).toContain('const canonicalUsers = new Map()');
    expect(meetingClient).toContain("['offer', 'answer', 'ice'].includes(message.type)");
  });

  it('keeps microphone changes from looking like participant departures', () => {
    expect(meetingClient).toContain("event: 'participant-state'");
    expect(meetingClient).toContain('this.pendingRemovals = new Map()');
    expect(meetingClient).toContain('this.schedulePeerRemoval(peerId)');
    expect(meetingClient).toContain("this.broadcast('participant-state'");
    expect(meetingClient).not.toMatch(/setPresence\(data\)[^{]*\{[^}]*channel\?\.track/s);
    expect(meetingClient).toContain("createOffer({ iceRestart: true })");
    expect(meetingClient).toContain("pc?.signalingState === 'have-local-offer'");
  });

  it('uses a dedicated remote-audio path with an iOS playback recovery control', () => {
    expect(meetingStudio).toContain('<audio className="remote-audio"');
    expect(meetingStudio).toContain('muted controls={false}');
    expect(meetingStudio).toContain("window.addEventListener('pointerdown', unlock, true)");
    expect(meetingStudio).toContain('className="resume-audio-button"');
    expect(meetingStyles).toContain('.video-surface video::-webkit-media-controls');
    expect(meetingStyles).toContain('.video-surface.audio-only-surface');
  });

  it('fails open to direct meeting audio when Web Audio is suspended', () => {
    expect(meetingStudio).toContain("target.context.state === 'running'");
    expect(meetingStudio).toContain('enhanced ? target.destination.stream : directStream');
    expect(meetingStudio).toContain("context.addEventListener?.('statechange', stateChanged)");
    expect(meetingStudio).toContain("window.addEventListener('pageshow', resume)");
    expect(meetingStudio).toContain("document.addEventListener('visibilitychange', visible)");
  });

  it('queues early WebRTC signals and primes one shared audio engine before joining', () => {
    expect(meetingClient).toContain('this.pendingSignals = new Map()');
    expect(meetingClient).toContain('this.queueSignal(message)');
    expect(meetingClient).toContain('await this.flushPendingSignals(peer.peerId)');
    expect(meetingClient).toContain("this.selfId > peer.peerId && !this.peers.has(peer.peerId)");
    expect(meetingStudio).toContain('let sharedMeetingAudioContext = null');
    expect(meetingStudio).toContain('const context = meetingAudioContext(); if (!context) return undefined;');
    expect(meetingStudio).toContain('primeMeetingAudio();');
    expect(meetingStudio).toContain("context.addEventListener?.('statechange', stateChanged)");
  });

  it('lets the presenter mute only the captured screen sound', () => {
    expect(meetingStudio).toContain('const toggleSharedAudio = () =>');
    expect(meetingStudio).toContain('sourceStream.current?.getAudioTracks()');
    expect(meetingStudio).toContain('track.enabled = next');
    expect(meetingStudio).toContain('className={`presentation-audio-toggle');
    expect(meetingStudio).toContain("setShareHasAudio(stream.getAudioTracks().length > 0)");
    expect(meetingStyles).toContain('.presentation-audio-toggle');
  });

  it('enhances distant voices safely and synchronizes cosmic reactions', () => {
    expect(meetingStudio).toContain('autoGainControl: { ideal: true }');
    expect(meetingStudio).toContain('noiseSuppression: { ideal: true }');
    expect(meetingStudio).toContain('createDynamicsCompressor()');
    expect(meetingStudio).toContain('preamp.gain.value = 2.4');
    expect(meetingStudio).toContain("{ id: 'UFO'");
    expect(meetingStudio).toContain("{ id: 'ALIEN_BIRTHDAY'");
    expect(meetingStudio).toContain('Happy Birthday!');
    expect(meetingClient).toContain("'UFO', 'ALIEN', 'ALIEN_BIRTHDAY'");
    expect(meetingStyles).toContain('@keyframes ufoFlight');
    expect(meetingStyles).toContain('@keyframes birthdayArrival');
    expect(meetingStyles).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('ships the two animated money sticker reactions to every participant', () => {
    expect(meetingStudio).toContain("{ id: 'MONEY_CHARACTER'");
    expect(meetingStudio).toContain("{ id: 'MONEY_ALIEN'");
    expect(meetingStudio).toContain('assets/money-character-reaction.png');
    expect(meetingStudio).toContain('assets/money-alien-reaction.png');
    expect(meetingClient).toContain("'MONEY_CHARACTER', 'MONEY_ALIEN'");
    expect(meetingStyles).toContain('@keyframes moneyCharacterBounce');
    expect(meetingStyles).toContain('@keyframes moneyAlienWarp');
  });

  it('ships the animated money phoenix reaction to every participant', () => {
    expect(meetingStudio).toContain("{ id: 'MONEY_PHOENIX'");
    expect(meetingStudio).toContain('assets/money-phoenix-reaction.png');
    expect(meetingClient).toContain("'MONEY_PHOENIX'");
    expect(meetingStyles).toContain('@keyframes phoenixAscension');
    expect(meetingStyles).toContain('@keyframes phoenixWingbeat');
    expect(meetingStyles).toContain('@keyframes phoenixMoneyShower');
    expect(meetingStyles).toContain('width: clamp(170px, 29vw, 285px); height: clamp(170px, 29vw, 285px)');
  });

  it('ships the synchronized phoenix transformation with transparent lightning sound', () => {
    expect(meetingStudio).toContain("PHOENIX_TRANSFORM_REACTION = 'PHOENIX_TRANSFORM'");
    expect(meetingStudio).toContain('assets/phoenix-lightning.webm');
    expect(meetingStudio).toContain('assets/phoenix-base-reaction.png');
    expect(meetingStudio).toContain('assets/phoenix-super-reaction.png');
    expect(meetingStudio).toContain('video.volume = .72');
    expect(meetingStudio).toContain("lightning.preload = 'auto'");
    expect(meetingStudio).toContain("emoji === PHOENIX_TRANSFORM_REACTION ? 11_300");
    expect(meetingClient).toContain("'PHOENIX_TRANSFORM'");
    expect(meetingStyles).toContain('@keyframes phoenixTransformExplosion');
    expect(meetingStyles).toContain('@keyframes phoenixSuperArrival');
  });

  it('uses the one-RPC meeting creation path and resilient realtime startup', () => {
    expect(schema).toContain("'participantStatus','ADMITTED'");
    expect(meetingStudio).toMatch(/const created = await api\.createMeeting\(form\);[\s\S]*await connectAccess\(created\)/);
    expect(meetingStudio).not.toMatch(/const created = await api\.createMeeting\(form\);[\s\S]{0,180}enterMeeting/);
    expect(meetingClient).toContain('ack: false');
    expect(meetingStudio).toContain('const relay = await api.getTurnCredentials(normalized.meetingId)');
    expect(meetingStudio).toContain('iceServers, user });');
    expect(meetingStudio).toContain("(access.participantStatus || access.status) === 'ADMITTED'");
    expect(supabaseClient).toContain('MissingPartition');
    expect(supabaseClient).toContain('subscribeRealtimeChannel');
    expect(supabaseClient).toContain('supabase.realtime.setAuth');
  });

  it('renders local and remote screen shares on a full-size stage', () => {
    expect(meetingStyles).toMatch(/\.video-surface\.presentation\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;[^}]*width:\s*100%;[^}]*height:\s*100%/);
    expect(meetingStudio).toContain('await waitForVideoMetadata(video)');
    expect(meetingStudio).toContain('const remotePresentation = remotePresentationEntry');
    expect(meetingStudio).toContain('<VideoSurface presentation stream={presentationStream}');
  });

  it('captures and mixes shared audio with the presenter microphone', () => {
    expect(meetingStudio).toContain('async function createSharedAudioMixer(displayStream, microphoneStream)');
    expect(meetingStudio).toContain('context.createMediaStreamDestination()');
    expect(meetingStudio).toContain('getDisplayMedia({ video: true, audio:');
    expect(meetingStudio).toContain('sharedLocalStream(stream)');
    expect(meetingStudio).toContain('Pantalla, micrófono y audio disponible mezclados correctamente.');
    expect(meetingStudio).toContain('<RemoteAudioLayer streams={remoteStreams}');
    expect(meetingStudio).toContain('playAudio={false}');
    expect(meetingStudio).toContain('suppressLocalAudioPlayback: false');
    expect(meetingStudio).toContain("selfBrowserSurface: 'exclude'");
    expect(meetingStudio).toContain('const context = meetingAudioContext()');
  });

  it('persists host microphone lock and attributes floating chat and reactions', () => {
    expect(schema).toContain('function public.set_participant_mics_locked');
    expect(schema).toContain("'{participantMicsLocked}'");
    expect(schema).toContain("'participantMicsLocked'");
    expect(api).toContain("setParticipantMicsLocked: (payload) => rpc('set_participant_mics_locked', payload)");
    expect(meetingClient).toContain("type: 'participant-mics-lock'");
    expect(meetingClient).toContain('handleParticipantMicsLock');
    expect(meetingStudio).toContain('Silenciar a todos');
    expect(meetingStudio).toContain('Micrófono bloqueado por el anfitrión');
    expect(meetingStudio).toContain('className="floating-chat-layer"');
    expect(meetingStudio).toContain('senderName={item.senderName}');
    expect(meetingStyles).toContain('.floating-chat-message');
    expect(meetingStyles).toContain('.reaction-sender');
  });

  it('keeps presenter voice alive while the shared-audio context changes state', () => {
    expect(meetingStudio).toContain('microphoneTracks.find((track) => track.enabled)');
    expect(meetingStudio).toContain('mixer.setStateHandler?.((running)');
    expect(meetingStudio).toContain('running && mixer.mixedTrack ? mixer.mixedTrack : mixer.fallbackTrack');
    expect(meetingClient).toContain('this.mediaUpdate = Promise.resolve()');
    expect(meetingClient).toContain('version !== this.localStreamVersion');
  });

  it('keeps meeting media alive across internal navigation', () => {
    expect(app).toContain("meeting-route ${page === 'meetings' ? 'active' : 'background'}");
    expect(app).toContain('onSessionChange={setMeetingSession}');
    expect(app).toContain('Audio y conexión activos en segundo plano');
    expect(meetingStyles).toContain('.meeting-route.background { display: none; }');
  });

  it('supports floating meetings, mobile chat, natural self preview and the shared money rocket', () => {
    expect(meetingStudio).toContain('video.requestPictureInPicture');
    expect(meetingStudio).toContain("document.addEventListener('visibilitychange'");
    expect(meetingStudio).toContain("video.webkitSetPresentationMode('picture-in-picture')");
    expect(meetingStudio).toContain('createMeetingPipPlaceholder');
    expect(meetingStudio).toContain('className={`mobile-chat-fab');
    expect(meetingStyles).toContain('.meeting-page.mobile-panel-open .meeting-side');
    expect(meetingStudio).toContain('muted mirrored speaking={localSpeaking}');
    expect(meetingStyles).toContain('.video-surface.mirrored video:not(.audio-only)');
    expect(meetingStudio).toContain("MONEY_ROCKET_REACTION = 'MONEY_ROCKET'");
    expect(meetingClient).toContain("'MONEY_ROCKET'");
    expect(meetingClient).toContain('isLiveReaction(message.emoji)');
    expect(meetingStyles).toContain('@keyframes moneyRocketFlight');
  });

  it('restores an active meeting and its safe collaboration state after a reload', () => {
    expect(meetingStudio).toContain('galaxy_active_meeting_');
    expect(meetingStudio).toContain('galaxy_meeting_media_');
    expect(meetingStudio).toContain('restoreMediaPreferences');
    expect(meetingStudio).toContain('restoreMedia: true');
    expect(meetingStudio).toContain("collaborate('collab-state-request'");
    expect(meetingStudio).toContain("collaborate('collab-state'");
    expect(meetingStudio).toContain('Por seguridad del navegador, debes autorizar nuevamente la pantalla compartida.');
  });

  it('tracks invitation visibility, rejection and repeat invitations', () => {
    expect(schema).toContain('add column if not exists seen_at timestamptz');
    expect(schema).toContain('add column if not exists invite_count integer not null default 1');
    expect(schema).toContain('responded_at=null,seen_at=null');
    expect(schema).toContain('invite_count=public.meeting_invitations.invite_count+1');
    expect(schema).toContain("'MEETING_INVITE_'||p_status");
    expect(app).toContain('api.markMeetingInvitationSeen(activeNotice.invitationId)');
    expect(meetingStudio).toContain('Vio el modal · aún no responde');
    expect(meetingStudio).toContain('Rechazó la invitación');
    expect(meetingStudio).toContain('Reinvitar');
  });

  it('supports permissioned collaborative annotations and guided pointers', () => {
    expect(meetingClient).toContain("message.type?.startsWith('collab-')");
    expect(meetingStudio).toContain("collaborate('collab-request'");
    expect(meetingStudio).toContain("collaborate('collab-grant'");
    expect(meetingStudio).toContain('<CollaborationRequestModal');
    expect(meetingStudio).toContain('<CollaborationOverlay');
    expect(meetingStudio).toContain('Control guiado');
  });

  it('uses capability detection and a mobile presentation fallback', () => {
    expect(meetingStudio).toContain('navigator.mediaDevices?.getDisplayMedia');
    expect(meetingStudio).toContain('facingMode: { ideal: \'environment\' }');
    expect(meetingStudio).toContain('Cámara trasera o documento');
    expect(meetingStyles).toContain('.reaction-menu { position: fixed;');
  });

  it('deletes persisted meeting chat when the host ends a meeting', () => {
    expect(schema).toMatch(/function public\.end_meeting[\s\S]*delete from public\.meeting_messages where meeting_id=p_meeting_id/);
    expect(schema).toContain("'messagesDeleted',v_deleted_messages");
    expect(schema).toContain('message_id uuid not null references public.meeting_messages(id) on delete cascade');
    expect(schema).toContain("where id=p_meeting_id and status='ACTIVE' for update");
    expect(schema).toMatch(/delete from public\.meeting_messages msg\s+using public\.meetings meeting\s+where msg\.meeting_id=meeting\.id and meeting\.status='ENDED'/);
  });

  it('announces newly raised hands and lets emojis become part of chat messages', () => {
    expect(meetingStudio).toContain('SpeechSynthesisUtterance');
    expect(meetingStudio).toContain('tiene una pregunta.');
    expect(meetingStudio).toContain('participantHandStates.current.get(peer.peerId) === false');
    expect(meetingStudio).toContain('insertEmoji');
    expect(meetingStudio).toContain('message-emoji-picker');
    expect(meetingStyles).toContain('.message-emoji-picker');
  });

  it('lets only the creator restart and safely remove ended meeting history', () => {
    expect(schema).toMatch(/function public\.restart_meeting[\s\S]*v_meeting\.host_id<>v_user[\s\S]*Solo quien creó la reunión puede reiniciarla/);
    expect(schema).toMatch(/function public\.restart_meeting[\s\S]*v_meeting\.status<>'ENDED'/);
    expect(schema).toMatch(/function public\.restart_meeting[\s\S]*delete from public\.meeting_participants where meeting_id=p_meeting_id and user_id<>v_user/);
    expect(schema).toMatch(/function public\.remove_ended_meeting[\s\S]*if v_meeting\.host_id=v_user[\s\S]*delete from public\.meetings/);
    expect(schema).toMatch(/function public\.remove_ended_meeting[\s\S]*delete from public\.meeting_participants where meeting_id=p_meeting_id and user_id=v_user/);
    expect(meetingStudio).toContain('<RotateCcw />');
    expect(meetingStudio).toContain('<Trash2 />');
    expect(meetingStudio).toContain('item.host &&');
    expect(meetingStudio).toContain('api.restartMeeting');
    expect(meetingStudio).toContain('api.removeEndedMeeting');
  });

  it('persists editable profile information and secures user-owned avatar uploads', () => {
    expect(schema).toContain('function public.update_profile(p_name text,p_username text,p_bio text');
    expect(schema).toContain('function public.update_profile_avatar(p_avatar text)');
    expect(schema).toContain("values('profile-avatars','profile-avatars',true,5242880");
    expect(schema).toContain("name=auth.uid()::text||'/profile'");
    expect(schema).toContain("bucket_id='profile-avatars'");
    expect(schema).toContain("'avatar',p.avatar");
    expect(schema).toContain("'bio', p.bio");
    expect(schema).toContain("'xp', p.xp");
    expect(schema).toContain("'wallet',coalesce");
    expect(api).toContain("updateProfile: (payload) => rpc('update_profile', payload)");
    expect(api).toContain("rpc('update_profile_avatar'");
    expect(api).toContain("PROFILE_AVATAR_MAX_BYTES = 5 * 1024 * 1024");
    expect(api).toContain("upsert: true");
    expect(app).toContain('api.updateProfile(values)');
    expect(app).toMatch(/type=["']file["']/i);
    expect(app).toContain('api.uploadProfileAvatar');
    expect(app).toContain('api.removeProfileAvatar');
    expect(avatar).toContain('/storage/v1/object/public/profile-avatars/');
    expect(avatar).toContain('onError={() => setImageFailed(true)}');
    expect(appHtml).toContain("img-src 'self' data: blob: https://xdsqtuubsptpzwadecha.supabase.co");
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
