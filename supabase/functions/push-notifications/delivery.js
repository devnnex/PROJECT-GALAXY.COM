export function isPushEndpoint(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && /^(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|web\.push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)$/.test(url.hostname);
  } catch { return false; }
}

export async function deliverPushBatch(jobs, { send, complete, remove }) {
  const result = { sent: 0, expired: 0, retry: 0 };
  await Promise.all(jobs.map(async (job) => {
    try {
      if (!isPushEndpoint(job.subscription?.endpoint)) { await remove(job.subscription_id); result.expired++; return; }
      const response = await send(job);
      if (response.status >= 200 && response.status < 300) { await complete(job.job_id); result.sent++; }
      else if ([404, 410].includes(response.status)) { await remove(job.subscription_id); result.expired++; }
      else result.retry++;
    } catch { result.retry++; }
  }));
  return result;
}
