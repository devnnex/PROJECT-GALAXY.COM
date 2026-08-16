import { createClient } from 'npm:@supabase/supabase-js@2';

const NETWORKS = Object.freeze({ TRC20: 'usdttrc20', ERC20: 'usdterc20' });
const OPEN_STATUSES = ['CREATING', 'WAITING', 'CONFIRMING', 'CONFIRMED', 'SENDING'];

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server secret: ${name}`);
  return value;
}

function corsHeaders(request: Request) {
  const origin = request.headers.get('origin') || '';
  const allowed = (Deno.env.get('APP_ALLOWED_ORIGINS') || 'https://devnnex.github.io,http://localhost:5173')
    .split(',').map((item) => item.trim()).filter(Boolean);
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(request), 'Content-Type': 'application/json' } });
}

function publicOrder(order: any) {
  return {
    id: order.id, planCode: order.plan_code, network: order.network, priceUsd: order.price_usd,
    payAmount: order.pay_amount, actuallyPaid: order.actually_paid, payCurrency: order.pay_currency,
    payAddress: order.pay_address, status: order.status, expiresAt: order.expires_at,
    confirmedAt: order.confirmed_at, createdAt: order.created_at,
  };
}

async function nowPayments(path: string, apiKey: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.nowpayments.io/v1${path}`, {
    ...init,
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(payload?.message || payload?.error || 'NOWPayments rejected the request.'));
  return payload;
}

async function recordProviderState(admin: ReturnType<typeof createClient>, order: any, payment: any) {
  const { data, error } = await admin.rpc('activate_membership_from_payment', {
    p_order_id: order.id,
    p_provider_payment_id: String(payment.payment_id),
    p_provider_status: String(payment.payment_status || 'waiting'),
    p_actually_paid: Number(payment.actually_paid || 0),
    p_payload: payment,
  });
  if (error) throw error;
  return data;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed.' }, 405);

  try {
    const supabaseUrl = requiredEnv('SUPABASE_URL');
    const anonKey = requiredEnv('SUPABASE_ANON_KEY');
    const serviceKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
    const apiKey = requiredEnv('NOWPAYMENTS_API_KEY');
    const authorization = request.headers.get('authorization') || '';
    if (!authorization.startsWith('Bearer ')) return json(request, { error: 'Authentication required.' }, 401);

    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: authData, error: authError } = await authClient.auth.getUser();
    if (authError || !authData.user) return json(request, { error: 'Invalid session.' }, 401);
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const input = await request.json();

    if (input?.action === 'refresh') {
      const { data: order, error } = await admin.from('membership_payment_orders').select('*')
        .eq('id', String(input.orderId || '')).eq('user_id', authData.user.id).single();
      if (error || !order?.provider_payment_id) return json(request, { error: 'Payment order not found.' }, 404);
      const payment = await nowPayments(`/payment/${encodeURIComponent(order.provider_payment_id)}`, apiKey);
      const membership = await recordProviderState(admin, order, payment);
      return json(request, { orderId: order.id, status: String(payment.payment_status || '').toUpperCase(), membership });
    }

    if (input?.action !== 'create') return json(request, { error: 'Unsupported payment action.' }, 400);
    const planCode = String(input.planCode || '').toUpperCase();
    const network = String(input.network || '').toUpperCase() as keyof typeof NETWORKS;
    if (!NETWORKS[network]) return json(request, { error: 'Select TRC20 or ERC20.' }, 400);

    const { data: plan, error: planError } = await admin.from('membership_plans').select('*').eq('code', planCode).eq('active', true).single();
    if (planError || !plan) return json(request, { error: 'Membership plan not found.' }, 404);

    const rateWindow = new Date(Date.now() - 60_000).toISOString();
    const { count: recentOrders } = await admin.from('membership_payment_orders').select('id', { count: 'exact', head: true })
      .eq('user_id', authData.user.id).gte('created_at', rateWindow);
    if (Number(recentOrders || 0) >= 3) return json(request, { error: 'Too many payment requests. Try again in one minute.' }, 429);

    const reuseAfter = new Date(Date.now() - 25 * 60_000).toISOString();
    const { data: existing } = await admin.from('membership_payment_orders').select('*')
      .eq('user_id', authData.user.id).eq('plan_code', planCode).eq('network', network)
      .in('status', OPEN_STATUSES).gte('created_at', reuseAfter).not('pay_address', 'is', null)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (existing) return json(request, { order: publicOrder(existing), reused: true });

    const orderId = crypto.randomUUID();
    const { data: order, error: insertError } = await admin.from('membership_payment_orders').insert({
      id: orderId, user_id: authData.user.id, plan_code: planCode, network,
      price_usd: plan.price_usd, status: 'CREATING',
    }).select().single();
    if (insertError) throw insertError;

    try {
      const payment = await nowPayments('/payment', apiKey, {
        method: 'POST',
        body: JSON.stringify({
          price_amount: Number(plan.price_usd), price_currency: 'usd', pay_currency: NETWORKS[network],
          order_id: orderId, order_description: `PROJECT GALAXY · ${plan.name}`,
          ipn_callback_url: `${supabaseUrl}/functions/v1/nowpayments-webhook`,
          is_fixed_rate: true, is_fee_paid_by_user: true,
        }),
      });
      const expiresAt = payment.expiration_estimate_date || new Date(Date.now() + 30 * 60_000).toISOString();
      const { data: updated, error: updateError } = await admin.from('membership_payment_orders').update({
        provider_payment_id: String(payment.payment_id), pay_amount: payment.pay_amount,
        pay_currency: String(payment.pay_currency || NETWORKS[network]).toLowerCase(), pay_address: payment.pay_address,
        status: String(payment.payment_status || 'waiting').toUpperCase(), expires_at: expiresAt, provider_payload: payment,
      }).eq('id', orderId).select().single();
      if (updateError) throw updateError;
      return json(request, { order: publicOrder(updated), reused: false });
    } catch (providerError) {
      await admin.from('membership_payment_orders').update({ status: 'FAILED' }).eq('id', orderId);
      throw providerError;
    }
  } catch (error) {
    console.error('membership-payments', error);
    return json(request, { error: 'The secure payment service could not complete the request.' }, 502);
  }
});
