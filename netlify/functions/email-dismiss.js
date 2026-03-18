import { getSupabase } from './utils/supabase.js';

export default async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'POST requis' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { user_id, email_id, provider = 'gmail' } = await req.json();

    if (!user_id || !email_id) {
      return new Response(JSON.stringify({ error: 'user_id et email_id requis' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = getSupabase();

    await supabase
      .from('email_metadata')
      .update({ dismissed: true })
      .eq('user_id', user_id)
      .eq('email_id', email_id)
      .eq('provider', provider);

    return new Response(JSON.stringify({ dismissed: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('email-dismiss error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
