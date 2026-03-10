import { getSupabase } from './utils/supabase.js';

export default async (req) => {
  try {
    const url = new URL(req.url);
    const email = url.searchParams.get('email');
    const status = url.searchParams.get('status'); // 'waiting_response' | 'resolved' | null (all)

    if (!email) {
      return new Response(JSON.stringify({ error: 'Paramètre email requis' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = getSupabase();
    let query = supabase
      .from('decisions')
      .select('*')
      .eq('user_id', email)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    // Calculer days_waiting pour chaque décision en attente
    const now = new Date();
    const decisions = (data || []).map((d) => {
      if (d.status === 'waiting_response') {
        const created = new Date(d.created_at);
        d.days_waiting = Math.floor((now - created) / (1000 * 60 * 60 * 24));
      }
      return d;
    });

    return new Response(JSON.stringify({ decisions, count: decisions.length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
