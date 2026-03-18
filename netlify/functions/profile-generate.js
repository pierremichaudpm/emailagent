import { getSupabase } from './utils/supabase.js';

export default async (req) => {
  try {
    const url = new URL(req.url);

    // GET = poll status
    if (req.method === 'GET') {
      const email = url.searchParams.get('email');
      if (!email) {
        return new Response(JSON.stringify({ error: 'email requis' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const supabase = getSupabase();
      const { data } = await supabase
        .from('user_configs')
        .select('context, profile_status, profile_progress')
        .eq('user_id', email)
        .single();

      return new Response(
        JSON.stringify({
          status: data?.profile_status || 'idle',
          progress: data?.profile_progress || '',
          context: data?.context || '',
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // POST = lancer la génération (déclenche la background function)
    if (req.method === 'POST') {
      const { user_id, provider = 'gmail' } = await req.json();

      if (!user_id) {
        return new Response(JSON.stringify({ error: 'user_id requis' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Marquer comme "pending" dans Supabase
      const supabase = getSupabase();
      await supabase
        .from('user_configs')
        .update({ profile_status: 'pending', profile_progress: 'Démarrage...' })
        .eq('user_id', user_id);

      // Appeler la background function
      const bgUrl = `${url.origin}/.netlify/functions/profile-generate-background`;
      fetch(bgUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id, provider }),
      }).catch(() => {});

      return new Response(
        JSON.stringify({ status: 'pending', message: 'Génération lancée' }),
        { status: 202, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ error: 'GET ou POST requis' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('profile-generate error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
