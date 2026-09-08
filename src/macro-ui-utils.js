export function countdown(target, now) {
  const milliseconds = new Date(target).getTime() - now;
  if (!Number.isFinite(milliseconds)) return '--:--:--';
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  return [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60].map((value) => String(value).padStart(2, '0')).join(':');
}

export function timeAt(value, timeZone) {
  if (!value) return '—';
  const date = new Date(value); if (!Number.isFinite(date.getTime())) return '—';
  const formatted = new Intl.DateTimeFormat('es-CO', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone, hour12: false }).format(date);
  return `${formatted}.${String(date.getUTCMilliseconds()).padStart(3, '0')}`;
}
