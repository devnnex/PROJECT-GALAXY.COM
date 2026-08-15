# Realtime meetings

## Default deployment: GitHub Pages + Apps Script

`SIGNALING_URL` may remain empty. In that mode, authenticated WebRTC presence, offers, answers, ICE candidates, reactions and host moderation travel through short Apps Script requests backed by `CacheService`. Audio and video still travel directly between browsers; they are never routed through Google Sheets.

This removes the mandatory Node/WebSocket deployment and is intended for small rooms. Polling has more signaling latency and consumes Apps Script quotas, so it is not a replacement for Zoom infrastructure at high concurrency.

## What is implemented

- Authenticated room presence over Apps Script polling or optional WebSocket signaling.
- WebRTC offer, answer and ICE exchange for each participant pair.
- Bidirectional microphone tracks and optional camera tracks.
- Real audio-level meters calculated from each `MediaStream` with Web Audio RMS analysis.
- Active-speaker borders, microphone bars, raised-hand state and emoji reactions.
- Meeting creation, invitation links, registered-member invitations and waiting-room admission.
- Host-only remote mute, room locking and explicit end-for-everyone controls.
- Persistent meeting chat with replies and message reactions.
- Screen and custom-area tracks replace the published video track while sharing.
- Active-meeting recovery after reload and persistent custom crop coordinates.
- Disconnect cleanup and participant removal. Leaving does not end the room; only the host's explicit finalization does.

The current transport is a WebRTC mesh capped at eight signaling participants by default. Use an SFU for larger production meetings.

## Local two-account test

Open two terminals:

```bash
npm run signaling
npm run serve-root
```

The automated test provides two isolated authenticated API fixtures. Run `npm run test:meeting` while the static and signaling servers are active.

Verify all of the following:

1. Both headers say `WebRTC conectado`.
2. Each account appears in the other participant list.
3. Each remote participant reaches `Audio P2P conectado`.
4. Speaking illuminates the five microphone bars and the active-speaker border.
5. Muting stops the outgoing track and meter.
6. Raising a hand shows `✋` on the other account.
7. Emoji reactions float on both screens.
8. Chat, replies, host mute and reload recovery work across both accounts.

The automated test launches two isolated accounts with browser media devices and verifies creation/join, remote media, bidirectional microphone toggles, host-only mute/end, voice meters, hand state, reactions, chat replies and reload recovery.

## Optional WebSocket deployment

For lower latency or more concurrent rooms, `server/signaling.mjs` can still be deployed on an HTTPS Node service with WebSocket support. The client selects it only when `SIGNALING_URL` is configured.

Required signaling environment variables:

```text
NODE_ENV=production
PORT=8787
MEETING_TOKEN_SECRET=<copy the generated value from Apps Script PropertiesService>
ALLOWED_ORIGINS=https://your-account.github.io
MAX_ROOM_SIZE=8
```

Configure the client in `src/runtime-config.js` and rebuild:

```js
window.GALAXY_RUNTIME_CONFIG = {
  SIGNALING_URL: 'wss://your-signaling-service.example.com',
};
```

Also configure these Apps Script properties:

```text
SIGNALING_URL=wss://your-signaling-service.example.com
MEETING_TOKEN_SECRET=<same secret as signaling>
ICE_SERVERS_JSON=[{"urls":"turns:turn.example.com:5349","username":"short-lived-user","credential":"short-lived-password"}]
```

Use short-lived TURN credentials issued to authenticated meeting participants. Do not put permanent TURN credentials in GitHub or `runtime-config.js`.

## How to know it works over the internet

A same-computer test proves signaling, negotiation, UI state and media-track exchange. Before production, perform a network test with one participant on Wi-Fi and another on cellular data. Direct P2P works on many networks with STUN, but restrictive or symmetric NAT networks require TURN; Apps Script cannot act as a TURN media relay.

No UI label is treated as proof by itself: `WebRTC conectado` comes from signaling admission, while `Audio P2P conectado` comes from the actual `RTCPeerConnection.connectionState`.
