export async function telegramApi(method: string, body: object) {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!token) throw new Error('Telegram unavailable');
  let response, result;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    result = await response.json();
  } catch { throw new Error('Telegram transport unavailable'); }
  if (!response.ok || result.ok !== true) throw Object.assign(new Error('Telegram request unavailable'), { status: response.status });
  return result.result;
}
