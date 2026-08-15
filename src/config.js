const runtime = globalThis.GALAXY_RUNTIME_CONFIG || {};

export const CONFIG = Object.freeze({
  APP_NAME: import.meta.env.VITE_APP_NAME || 'PROJECT GALAXY',
  APP_VERSION: '0.1.0',
  API_URL: runtime.API_URL || import.meta.env.VITE_API_URL || '',
  SIGNALING_URL: runtime.SIGNALING_URL || import.meta.env.VITE_SIGNALING_URL || '',
  SESSION_DURATION_MINUTES: 60 * 24 * 7,
  PAYMENT_TIMEOUT_MINUTES: 30,
  MAX_UPLOAD_SIZE_MB: 25,
  COMMISSION_RATE: null,
  CRYPTO_NETWORKS: {
    TRC20: { enabled: false, label: 'TRON · TRC20' },
    ERC20: { enabled: false, label: 'Ethereum · ERC20' },
  },
});
