import { createClient } from 'npm:@supabase/supabase-js@2';

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server secret: ${name}`);
  return value;
}

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function validSignature(payload: Record<string, unknown>, signature: string, secret: string) {
  const sorted = Object.keys(payload).sort().reduce<Record<string, unknown>>((result, key) => {
    result[key] = payload[key]; return result;
  }, {});
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(JSON.stringify(sorted)));
  return constantTimeEqual(hex(digest), signature.toLowerCase());
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405);
  try {
    const rawBody = await request.text();
    if (!rawBody || rawBody.length > 100_000) return response({ error: 'Invalid payload.' }, 400);
    const payload = JSON.parse(rawBody);
    const signature = request.headers.get('x-nowpayments-sig') || '';
    if (!signature || !await validSignature(payload, signature, requiredEnv('NOWPAYMENTS_IPN_SECRET'))) {
      return response({ error: 'Invalid signature.' }, 401);
    }

    const supabaseUrl = requiredEnv('SUPABASE_URL');
    const serviceKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const providerPaymentId = String(payload.payment_id || '');
    const { data: order, error: orderError } = await admin.from('membership_payment_orders').select('id,provider_payment_id')
      .eq('provider_payment_id', providerPaymentId).single();
    if (orderError || !order || String(payload.order_id || '') !== order.id) return response({ error: 'Unknown payment order.' }, 404);

    const { error } = await admin.rpc('activate_membership_from_payment', {
      p_order_id: order.id,
      p_provider_payment_id: providerPaymentId,
      p_provider_status: String(payload.payment_status || 'waiting'),
      p_actually_paid: Number(payload.actually_paid || 0),
      p_payload: payload,
    });
    if (error) throw error;
    return response({ received: true });
  } catch (error) {
    console.error('nowpayments-webhook', error);
    return response({ error: 'Webhook processing failed.' }, 500);
  }
});
