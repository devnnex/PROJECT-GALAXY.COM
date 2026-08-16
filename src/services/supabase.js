import { createClient } from '@supabase/supabase-js';
import { CONFIG } from '../config';

if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
  throw new Error('Supabase no está configurado. Define SUPABASE_URL y SUPABASE_ANON_KEY.');
}

export const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'galaxy_supabase_auth',
  },
  realtime: { params: { eventsPerSecond: 30 } },
});
