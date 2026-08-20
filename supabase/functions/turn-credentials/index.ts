import { createClient } from 'npm:@supabase/supabase-js@2';

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server secret: ${name}`);
  return value;
}

async function loadTurnProviderConfig() {
  try {
    return {
      keyId: requiredEnv('CLOUDFLARE_TURN_KEY_ID'),
      apiToken: requiredEnv('CLOUDFLARE_TURN_API_TOKEN'),
      ttlSeconds: Number(Deno.env.get('TURN_CREDENTIAL_TTL_SECONDS') || 43_200),
    };
  } catch {
    const admin = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin.rpc('get_turn_provider_config');
    if (error || !data?.keyId || !data?.apiToken) {
      throw new Error('Missing server secret: Cloudflare TURN configuration');
    }
    return {
      keyId: String(data.keyId).trim(),
      apiToken: String(data.apiToken).trim(),
      ttlSeconds: Number(data.ttlSeconds || 43_200),
    };
  }
}

function corsHeaders(request: Request) {
  const origin = request.headers.get('origin') || '';
  const allowed = (Deno.env.get('APP_ALLOWED_ORIGINS') || 'https://devnnex.github.io,http://localhost:5173')
    .split(',').map((item) => item.trim()).filter(Boolean);
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin',
  };
}

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(request), 'Content-Type': 'application/json' } });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed.' }, 405);
  try {
    const authorization = request.headers.get('authorization') || '';
    if (!authorization.startsWith('Bearer ')) return json(request, { error: 'Authentication required.' }, 401);
    const supabase = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
    });
    const input = await request.json();
    const meetingId = String(input?.meetingId || '');
    if (!/^[0-9a-f-]{36}$/i.test(meetingId)) return json(request, { error: 'Invalid meeting.' }, 400);
    const { data: state, error: accessError } = await supabase.rpc('get_meeting_state', { p_meeting_id: meetingId });
    if (accessError || !state || state.status !== 'ACTIVE' || state.participantStatus !== 'ADMITTED') {
      return json(request, { error: 'Meeting access denied.' }, 403);
    }

    const turn = await loadTurnProviderConfig();
    const keyId = turn.keyId;
    const token = turn.apiToken;
    const ttl = Math.min(86_400, Math.max(3_600, turn.ttlSeconds));
    const response = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(body.iceServers)) throw new Error('TURN provider rejected the credential request.');
    const iceServers = body.iceServers.map((server: any) => ({ ...server,
      urls: (Array.isArray(server.urls) ? server.urls : [server.urls]).filter((url: string) => !/:53(?:\?|$)/.test(url)),
    })).filter((server: any) => server.urls.length);
    return json(request, { iceServers, relayReady: iceServers.some((server: any) => server.username && server.credential), expiresIn: ttl });
  } catch (error) {
    console.error('turn-credentials', error);
    const missing = String((error as Error)?.message || '').startsWith('Missing server secret:');
    return json(request, { error: missing ? 'TURN is not configured on the server.' : 'TURN credentials are temporarily unavailable.' }, 503);
  }
});
