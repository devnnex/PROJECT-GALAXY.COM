const runtime = globalThis.GALAXY_RUNTIME_CONFIG || {};

export const CONFIG = Object.freeze({
  APP_NAME: import.meta.env.VITE_APP_NAME || 'PROJECT GALAXY',
  APP_VERSION: '0.1.0',
  SUPABASE_URL: runtime.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || '',
  SUPABASE_ANON_KEY: runtime.SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  SESSION_DURATION_MINUTES: 60 * 24 * 7,
  PAYMENT_TIMEOUT_MINUTES: 30,
  MAX_UPLOAD_SIZE_MB: 25,
  COMMISSION_RATE: null,
  CRYPTO_NETWORKS: {
    TRC20: { enabled: false, label: 'TRON · TRC20' },
    ERC20: { enabled: false, label: 'Ethereum · ERC20' },
  },
});
