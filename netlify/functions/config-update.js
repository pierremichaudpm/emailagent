import { getSupabase } from './utils/supabase.js';

export default async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'POST requis' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { email, config } = body;

    if (!email || !config) {
      return new Response(JSON.stringify({ error: 'email et config requis' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase.from('user_configs').upsert(
      {
        user_id: email,
        sender_priorities: config.sender_priorities || {},
        keyword_flags: config.keyword_flags || [],
        amount_threshold: config.amount_threshold ?? 5000,
        stale_days: config.stale_days ?? 5,
        context: config.context || '',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
