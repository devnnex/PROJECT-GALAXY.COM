import { createClient } from 'npm:@supabase/supabase-js@2';

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
    const supabaseUrl = requiredEnv('SUPABASE_URL');
    const authorization = request.headers.get('authorization') || '';
    if (!authorization.startsWith('Bearer ')) return json(request, { error: 'Authentication required.' }, 401);
    const authClient = createClient(supabaseUrl, requiredEnv('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: authorization } } });
    const { data: authData, error: authError } = await authClient.auth.getUser();
    if (authError || !authData.user) return json(request, { error: 'Invalid session.' }, 401);
    if (String(authData.user.email || '').trim().toLowerCase() !== 'elkin56ty@gmail.com') {
      return json(request, { error: 'The requested resource was not found.' }, 404);
    }
    const admin = createClient(supabaseUrl, requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
    const productCode = 'SCANNER_POWER_ELITE';
    const { data: product, error: productError } = await admin.from('digital_products').select('storage_bucket,storage_path,active')
      .eq('code', productCode).single();
    if (productError || !product?.active) return json(request, { error: 'The Scanner download is unavailable.' }, 404);
    const { data: signed, error: signedError } = await admin.storage.from(product.storage_bucket)
      .createSignedUrl(product.storage_path, 60, { download: 'SCANNER-POWER-ELITE.pine' });
    if (signedError || !signed?.signedUrl) throw signedError || new Error('Signed URL was not generated.');
    await admin.from('product_download_audit').insert({ user_id: authData.user.id, product_code: productCode });
    return json(request, { downloadUrl: signed.signedUrl, expiresIn: 60 });
  } catch (error) {
    console.error('scanner-download', error);
    return json(request, { error: 'The private download could not be prepared.' }, 502);
  }
});
