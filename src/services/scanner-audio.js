const preferenceKey = 'galaxy_scanner_sound';
let audio;
let preference;
export function scannerSoundEnabled() {
  if (typeof preference === 'boolean') return preference;
  try { return localStorage.getItem(preferenceKey) === 'on'; } catch { return false; }
}
export async function setScannerSound(enabled) {
  if (!enabled) { preference = false; try { localStorage.setItem(preferenceKey, 'off'); } catch {} return false; }
  const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Audio) throw new Error('Este navegador no permite activar el sonido.');
  audio ||= new Audio();
  await audio.resume();
  if (audio.state !== 'running') throw new Error('Toca de nuevo para habilitar el sonido.');
  preference = true;
  try { localStorage.setItem(preferenceKey, 'on'); } catch {}
  playScannerSound('SIGNAL');
  return true;
}
export function resumeScannerSound() {
  if (!scannerSoundEnabled()) return;
  const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Audio) return;
  audio ||= new Audio();
  audio.resume().catch(() => {});
}
export function playScannerSound(type = 'SIGNAL') {
  if (!scannerSoundEnabled() || !audio || audio.state !== 'running') return false;
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
