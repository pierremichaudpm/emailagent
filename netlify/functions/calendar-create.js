import { getSupabase } from './utils/supabase.js';
import { getAccessToken } from './utils/auth.js';
import { createEvent } from './services/google-calendar.js';

export default async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'POST requis' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { user_id, provider = 'gmail', summary, start, end, description, attendees } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: 'user_id requis' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!summary || !start || !end) {
      return new Response(JSON.stringify({ error: 'summary, start et end requis' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = getSupabase();
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('*')
      .eq('email', user_id)
      .eq('provider', provider)
      .single();

    if (accountError || !account) {
      return new Response(JSON.stringify({ error: 'Compte non trouvé' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const accessToken = await getAccessToken(account);

    const event = await createEvent(accessToken, {
      summary,
      start,
      end,
      description: description || undefined,
      attendees: attendees || undefined,
    });

    return new Response(JSON.stringify({ event }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('calendar-create error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
