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

    const {
      user_id,
      draft_id,
      email_id,
      provider: providerName = 'gmail',
      body,
      subject,
      to,
      thread_id,
      in_reply_to,
      references,
    } = await req.json();

    if (!user_id || !draft_id || !body) {
      return new Response(JSON.stringify({ error: 'user_id, draft_id et body requis' }), {
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

    // Créer le nouveau brouillon AVANT de supprimer l'ancien (opération atomique)
    const { draftId } = await provider.createDraft(accessToken, {
      to,
      subject,
      body,
      threadId: thread_id,
      inReplyTo: in_reply_to,
      references,
      from: user_id,
    });

    // Supprimer l'ancien brouillon (après la création réussie du nouveau)
    try { await provider.deleteDraft(accessToken, draft_id); } catch {}

    // Persister le nouveau draftId + contenu en DB
    if (email_id) {
      await supabase
        .from('email_metadata')
        .update({ draft_id: draftId, draft_body: body, draft_subject: subject })
        .eq('user_id', user_id)
        .eq('email_id', email_id)
        .eq('provider', providerName);
    }

    return new Response(
      JSON.stringify({ draftId }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('draft-update error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
