export function isTelegramReturn(search) {
  return new URLSearchParams(search).get('telegram') === '1';
}

export function initialSection(search, allowed, fallback) {
  const params = new URLSearchParams(search);
  const requested = isTelegramReturn(search) ? 'black-trade' : params.get('section');
  return allowed.includes(requested) ? requested : fallback;
}
