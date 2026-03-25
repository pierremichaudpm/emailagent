import { getSupabase } from './utils/supabase.js';
import { getAccessToken } from './utils/auth.js';
import { listEvents } from './services/google-calendar.js';

export default async (req) => {
  try {
    const url = new URL(req.url);
    const email = url.searchParams.get('email');
    const providerName = url.searchParams.get('provider') || 'gmail';
    const days = Math.min(parseInt(url.searchParams.get('days') || '7', 10), 30);
    const calendarId = url.searchParams.get('calendarId') || 'primary';

    if (!email) {
      return new Response(JSON.stringify({ error: 'Paramètre email requis' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = getSupabase();
    const { data: account, error: dbError } = await supabase
      .from('accounts')
      .select('*')
      .eq('email', email)
      .eq('provider', providerName)
      .single();

    if (dbError || !account) {
      return new Response(JSON.stringify({ error: 'Compte non trouvé' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const accessToken = await getAccessToken(account);

    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

    const events = await listEvents(accessToken, {
      timeMin,
      timeMax,
      calendarId,
      timeZone: 'America/Montreal',
    });

    return new Response(JSON.stringify({ events, count: events.length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
