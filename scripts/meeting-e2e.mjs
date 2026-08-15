import { chromium } from 'playwright';

const baseUrl = process.env.VISUAL_BASE_URL || 'http://127.0.0.1:4174';
const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const errors = []; const room = { id: 'e2e-room', roomCode: 'TEST-ROOM', title: 'Prueba Galaxy', status: 'ACTIVE', waitingRoom: false, locked: false, hostId: 'e2e_alex' }; const messages = []; const presence = new Map(); const mailboxes = new Map();
function deliver(target, signal) { const current = mailboxes.get(target) || []; current.push(signal); mailboxes.set(target, current); }

async function account(user) {
  const context = await browser.newContext({ permissions: ['microphone', 'camera'] }); const page = await context.newPage();
  await page.route('https://script.google.com/**', async (route) => {
    const request = route.request(); let body = {}; try { body = JSON.parse(request.postData() || '{}'); } catch {}
    let data;
    if (body.action === 'getBootstrapData') data = { user };
    else if (body.action === 'getMyMeetings') data = [];
    else if (body.action === 'createMeeting') data = { ...room, host: true };
    else if (body.action === 'joinMeeting') data = { meetingId: room.id, title: room.title, roomCode: room.roomCode, hostId: room.hostId, role: user.id === room.hostId ? 'HOST' : 'PARTICIPANT', status: 'ADMITTED', waitingRoom: false, locked: false, signalingUrl: null, meetingToken: null, iceServers: [], messages };
    else if (body.action === 'getMeetingState') data = { ...room, host: user.id === room.hostId, role: user.id === room.hostId ? 'HOST' : 'PARTICIPANT', participantStatus: 'ADMITTED', waitingParticipants: [], messages };
    else if (body.action === 'postMeetingMessage') { data = { id: `msg_${messages.length + 1}`, meetingId: room.id, senderId: user.id, senderName: user.name, body: body.body, replyToId: body.replyToId || '', createdAt: new Date().toISOString(), reactions: [] }; messages.push(data); }
    else if (body.action === 'reactToMeetingMessage') data = { messageId: body.messageId, emoji: body.emoji, active: true, userId: user.id };
    else if (body.action === 'pollMeetingRealtime') { presence.set(body.connectionId, { peerId: body.connectionId, userId: user.id, name: user.name, role: user.id === room.hostId ? 'HOST' : 'PARTICIPANT', ...body.presence, lastSeen: Date.now() }); data = { meetingId: room.id, status: room.status, peers: [...presence.values()].filter((peer) => peer.peerId !== body.connectionId), signals: mailboxes.get(body.connectionId) || [], messages: body.includeMessages ? messages : [] }; mailboxes.set(body.connectionId, []); }
    else if (body.action === 'postMeetingSignals') { for (const signal of body.signals || []) { const targets = signal.type === 'reaction' ? [...presence.keys()].filter((id) => id !== body.connectionId) : [signal.target]; for (const target of targets) if (target) deliver(target, { id: crypto.randomUUID(), type: signal.type, source: body.connectionId, data: signal.data, emoji: signal.emoji, by: user.name }); } data = { delivered: 1 }; }
    else if (body.action === 'leaveMeetingRealtime') { presence.delete(body.connectionId); mailboxes.delete(body.connectionId); data = { left: true }; }
    else if (body.action === 'endMeeting') { room.status = 'ENDED'; data = { meetingId: room.id, status: 'ENDED' }; }
    else data = {};
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data, requestId: 'e2e' }) });
  });
  await page.addInitScript(() => {
    const nativeGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (constraints.audio && !constraints.video) { const Audio = window.AudioContext || window.webkitAudioContext; const audio = new Audio(); const oscillator = audio.createOscillator(); const gain = audio.createGain(); const destination = audio.createMediaStreamDestination(); oscillator.frequency.value = 220; gain.gain.value = .16; oscillator.connect(gain).connect(destination); oscillator.start(); window.__meetingTestAudio = { audio, oscillator, gain, destination }; return destination.stream; }
      return nativeGetUserMedia(constraints);
    };
  });
  page.on('pageerror', (error) => errors.push(`${user.name}: ${error.message}`));
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.evaluate((current) => localStorage.setItem('galaxy_session', JSON.stringify({ token: crypto.randomUUID(), user: current, expiresAt: Date.now() + 3600000 })), user);
  await page.reload({ waitUntil: 'networkidle' }); await page.locator('.sidebar nav button').filter({ hasText: 'Reuniones' }).click();
  return { context, page };
}

const alex = await account({ id: 'e2e_alex', name: 'Alex Morgan', username: 'alex', email: 'alex@test.local', role: 'CREATOR', level: 12 });
const noa = await account({ id: 'e2e_noa', name: 'Noa Williams', username: 'noa', email: 'noa@test.local', role: 'USER', level: 4 });

await alex.page.getByLabel('Título').fill(room.title); await alex.page.getByRole('button', { name: 'Crear e iniciar' }).click(); await alex.page.getByText('WebRTC conectado').waitFor({ timeout: 15_000 }).catch(async (error) => { console.error(await alex.page.locator('body').innerText()); throw error; });
await noa.page.getByRole('button', { name: 'Unirse' }).click(); await noa.page.getByLabel('Código de reunión').fill(room.roomCode); await noa.page.getByRole('button', { name: 'Entrar a la reunión' }).click(); await noa.page.getByText('WebRTC conectado').waitFor({ timeout: 15_000 });
await alex.page.locator('.people-list').getByText(/Noa Williams/).waitFor({ timeout: 15_000 }); await noa.page.locator('.people-list').getByText(/Alex Morgan/).waitFor({ timeout: 15_000 });

await noa.page.getByRole('button', { name: 'Activar audio' }).click(); await noa.page.getByRole('button', { name: 'Silenciar' }).waitFor(); await noa.page.getByRole('button', { name: 'Silenciar' }).click(); await noa.page.getByRole('button', { name: 'Activar audio' }).waitFor(); await noa.page.getByRole('button', { name: 'Activar audio' }).click();
await noa.page.locator('.control-dock .voice-meter i.on').first().waitFor({ timeout: 10_000 }); await alex.page.getByTitle('Silenciar participante').waitFor(); await alex.page.getByTitle('Silenciar participante').click(); await noa.page.getByRole('button', { name: 'Activar audio' }).waitFor();

await noa.page.getByRole('button', { name: 'Alzar mano' }).click(); await alex.page.locator('.people-list').getByText(/Noa Williams.*✋/).waitFor(); await noa.page.getByRole('button', { name: 'Reaccionar' }).click(); await noa.page.locator('.reaction-menu button').filter({ hasText: '👏' }).click(); await alex.page.locator('.reaction-layer').getByText('👏').waitFor();

await noa.page.getByRole('button', { name: /Chat/ }).click(); await noa.page.getByPlaceholder('Escribe un mensaje…').fill('Hola equipo'); await noa.page.getByRole('button', { name: 'Enviar' }).click(); await alex.page.getByRole('button', { name: /Chat/ }).click(); await alex.page.getByText('Hola equipo', { exact: true }).waitFor(); await alex.page.getByRole('button', { name: 'Responder' }).click(); await alex.page.getByPlaceholder('Escribe un mensaje…').fill('Recibido'); await alex.page.getByRole('button', { name: 'Enviar' }).click(); await noa.page.getByText('Recibido', { exact: true }).waitFor();

await noa.page.reload({ waitUntil: 'networkidle' }); await noa.page.getByText('WebRTC conectado').waitFor({ timeout: 15_000 }); await noa.page.getByRole('button', { name: /Chat/ }).click(); await noa.page.getByText('Hola equipo', { exact: true }).waitFor(); await noa.page.getByText('Recibido', { exact: true }).waitFor();

await alex.page.screenshot({ path: 'artifacts/meeting-two-accounts.png', fullPage: true });
if (await noa.page.getByRole('button', { name: 'Finalizar' }).count()) throw new Error('A participant received the host-only end control.');
alex.page.once('dialog', (dialog) => dialog.accept()); await alex.page.getByRole('button', { name: 'Finalizar' }).click(); await alex.page.getByText('Reuniones privadas para tu comunidad').waitFor(); await noa.page.getByText('Reuniones privadas para tu comunidad').waitFor({ timeout: 10_000 });
await alex.context.close(); await noa.context.close(); await browser.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('Create/join, bidirectional audio controls, host-only mute/end, voice meter, hand, reactions, reload recovery, persistent chat and replies passed with two accounts.');
