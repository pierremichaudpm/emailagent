import { getSupabase } from './utils/supabase.js';
import { generateDailyQuestion, buildCalendarContext } from './utils/claude.js';
import { getAccessToken } from './utils/auth.js';
import { listEvents } from './services/google-calendar.js';

export default async (req) => {
  try {
    const url = new URL(req.url);
    const email = url.searchParams.get('email');
    const providerName = url.searchParams.get('provider') || 'gmail';

    if (!email) {
      return new Response(JSON.stringify({ error: 'Paramètre email requis' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = getSupabase();

    const [configResult, analysesResult, accountResult] = await Promise.all([
      supabase.from('user_configs').select('*').eq('user_id', email).single(),
      supabase.from('email_metadata')
        .select('sender_name, sender_email, subject, priority_level, priority_score')
        .eq('user_id', email)
        .eq('dismissed', false)
        .order('analyzed_at', { ascending: false })
        .limit(20),
      supabase.from('accounts').select('*').eq('email', email).eq('provider', providerName).single(),
    ]);

    const config = configResult.data || {};
    const analyses = analysesResult.data || [];

    if (analyses.length === 0) {
      return new Response(JSON.stringify({ question: null }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fetch calendar events for cross-referencing
    let calendarContext = '';
    let calendarEvents = [];
    if (accountResult.data) {
      try {
        const accessToken = await getAccessToken(accountResult.data);
        const now = new Date();
        const timeMin = now.toISOString();
        const timeMax = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
        calendarEvents = await listEvents(accessToken, { timeMin, timeMax, timeZone: 'America/Montreal' });
        calendarContext = buildCalendarContext(calendarEvents);
      } catch (err) {
        console.warn('Calendar fetch for daily question failed (continuing without):', err.message);
      }
    }

    const question = await generateDailyQuestion(analyses, config, calendarContext, calendarEvents);

    return new Response(JSON.stringify({ question }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('daily-question error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
