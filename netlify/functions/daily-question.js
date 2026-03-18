import { getSupabase } from './utils/supabase.js';
import { generateDailyQuestion } from './utils/claude.js';

export default async (req) => {
  try {
    const url = new URL(req.url);
    const email = url.searchParams.get('email');

    if (!email) {
      return new Response(JSON.stringify({ error: 'Paramètre email requis' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = getSupabase();

    const [configResult, analysesResult] = await Promise.all([
      supabase.from('user_configs').select('*').eq('user_id', email).single(),
      supabase.from('email_metadata')
        .select('sender_name, sender_email, subject, priority_level, priority_score')
        .eq('user_id', email)
        .eq('dismissed', false)
        .order('analyzed_at', { ascending: false })
        .limit(20),
    ]);

    const config = configResult.data || {};
    const analyses = analysesResult.data || [];

    if (analyses.length === 0) {
      return new Response(JSON.stringify({ question: null }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const question = await generateDailyQuestion(analyses, config);

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
