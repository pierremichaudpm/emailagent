import { createClient } from '@supabase/supabase-js';

let client;

export function getSupabase() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis');
    }
    client = createClient(url, key);
  }
  return client;
}
