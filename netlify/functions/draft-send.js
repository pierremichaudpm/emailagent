import { getProvider } from './providers/index.js';
import { getSupabase } from './utils/supabase.js';
import { getAccessToken } from './utils/auth.js';

export default async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'POST requis' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { user_id, draft_id, email_id, provider: providerName = 'gmail' } = await req.json();

    if (!user_id || !draft_id) {
      return new Response(JSON.stringify({ error: 'user_id et draft_id requis' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = getSupabase();

    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('*')
      .eq('email', user_id)
      .eq('provider', providerName)
      .single();

    if (accountError || !account) {
      return new Response(JSON.stringify({ error: 'Compte non trouvé' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const accessToken = await getAccessToken(account);
    const provider = getProvider(providerName);

    const { messageId, threadId } = await provider.sendDraft(accessToken, draft_id);

    // Marquer l'email comme répondu + vider le draft_id
    if (email_id) {
      await Promise.all([
        supabase
          .from('email_metadata')
          .update({ user_replied: true, draft_id: null })
          .eq('user_id', user_id)
          .eq('email_id', email_id)
          .eq('provider', providerName),
        supabase
          .from('decisions')
          .update({
            status: 'resolved',
            resolved_at: new Date().toISOString(),
          })
          .eq('user_id', user_id)
          .eq('email_id', email_id)
          .eq('provider', providerName)
          .eq('status', 'waiting_response'),
      ]);
    }

    return new Response(
      JSON.stringify({ messageId, threadId, sent: true }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('draft-send error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
