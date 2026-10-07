export function parsePnlAmount(value) {
  const normalized = String(value).trim().replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && Math.abs(amount) <= 99999999.99 ? amount : null;
}
