const SECRET_PATTERN = /(client=|authorization|apikey|api[_-]?key|secret|service[_-]?role)/i;

function sanitized(value) {
  if (value instanceof Error) return { name: value.name, message: value.message, code: value.code };
  if (!value || typeof value !== 'object') return SECRET_PATTERN.test(String(value)) ? '[REDACTED]' : value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SECRET_PATTERN.test(key) ? '[REDACTED]' : sanitized(item)]));
}

export function log(level, message, context = {}) {
  const entry = { timestamp: new Date().toISOString(), level, service: 'galaxy-macro-worker', message, ...sanitized(context) };
  const output = JSON.stringify(entry);
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(output);
}
