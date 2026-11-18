const preferenceKey = 'galaxy_scanner_sound';
let audio;
let preference;
export function scannerSoundEnabled() {
  if (typeof preference === 'boolean') return preference;
  try { return localStorage.getItem(preferenceKey) !== 'off'; } catch { return true; }
}
export function scannerAudioReady() { return scannerSoundEnabled() && audio?.state === 'running'; }
function notifyAudio() { globalThis.window?.dispatchEvent(new Event('galaxy:scanner-audio')); }
function context(Audio) {
  if (!audio || audio.state === 'closed') {
    audio = new Audio();
    audio.addEventListener?.('statechange', notifyAudio);
  }
  return audio;
}
export async function setScannerSound(enabled) {
  if (!enabled) { preference = false; try { localStorage.setItem(preferenceKey, 'off'); } catch {} notifyAudio(); return false; }
  const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Audio) throw new Error('Este navegador no permite activar el sonido.');
  context(Audio);
  await audio.resume();
  if (audio.state !== 'running') throw new Error('Toca de nuevo para habilitar el sonido.');
  preference = true;
  try { localStorage.setItem(preferenceKey, 'on'); } catch {}
  playScannerSound('SIGNAL');
  notifyAudio();
  return true;
}
export async function resumeScannerSound() {
  if (!scannerSoundEnabled()) return false;
  const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Audio) return false;
  try {
    context(Audio);
    if (audio.state !== 'running') await audio.resume();
    notifyAudio(); return audio.state === 'running';
  } catch { return false; }
}
export function playScannerSound(type = 'SIGNAL') {
  if (!scannerSoundEnabled() || !audio) return false;
  if (audio.state !== 'running') {
    const requested = Date.now();
    resumeScannerSound().then((ready) => { if (ready && Date.now() - requested < 3000) playScannerSound(type); });
    return false;
  }
  const start = audio.currentTime;
  const notes = type === 'SL' ? [440, 330] : type.startsWith('TP') ? [880, 1174.66, 1396.91] : [659.25, 987.77];
  notes.forEach((frequency, index) => {
    const oscillator = audio.createOscillator(); const gain = audio.createGain();
    const at = start + index * 0.12;
    oscillator.type = 'sine'; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(0.16, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.28);
    oscillator.connect(gain); gain.connect(audio.destination);
    oscillator.start(at); oscillator.stop(at + 0.3);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  });
  return true;
}
