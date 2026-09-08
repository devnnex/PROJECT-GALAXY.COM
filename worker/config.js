function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function positiveInteger(name, fallback) {
  const parsed = Number(process.env[name] || fallback);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadWorkerConfig({ requireTradingEconomics = true } = {}) {
  const clientKey = requireTradingEconomics ? required('TRADING_ECONOMICS_CLIENT_KEY') : process.env.TRADING_ECONOMICS_CLIENT_KEY?.trim();
  const clientSecret = requireTradingEconomics ? required('TRADING_ECONOMICS_CLIENT_SECRET') : process.env.TRADING_ECONOMICS_CLIENT_SECRET?.trim();
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY?.trim()
    || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseSecretKey) {
    throw new Error('Missing required environment variable: SUPABASE_SECRET_KEY');
  }
  return Object.freeze({
    supabaseUrl: required('SUPABASE_URL'),
    // Keep the internal property name stable while accepting Supabase's current
    // sb_secret_* key format and the legacy service_role environment variable.
    supabaseServiceRoleKey: supabaseSecretKey,
    clientKey, clientSecret,
    websocketUrl: process.env.TRADING_ECONOMICS_WEBSOCKET_URL || 'wss://stream.tradingeconomics.com/',
    restUrl: process.env.TRADING_ECONOMICS_REST_URL || 'https://api.tradingeconomics.com',
    aggregationWindowMs: positiveInteger('MACRO_AGGREGATION_WINDOW_MS', 350),
    lateUpdateWindowMs: positiveInteger('MACRO_LATE_UPDATE_WINDOW_MS', 3000),
    staleAfterMs: positiveInteger('MACRO_STALE_AFTER_MS', 130000),
    restSyncIntervalMs: positiveInteger('MACRO_REST_SYNC_INTERVAL_MS', 300000),
    connectionTimeoutMs: positiveInteger('MACRO_CONNECTION_TIMEOUT_MS', 20000),
  });
}
