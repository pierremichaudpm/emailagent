import { getProvider } from './providers/index.js';
import { getSupabase } from './utils/supabase.js';
import { getAccessToken } from './utils/auth.js';
import { refineDraftReply } from './utils/claude.js';

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
      email_id,
      draft_id,
      instruction,
      current_body,
      current_subject,
      current_tone,
      provider: providerName = 'gmail',
    } = await req.json();

    if (!user_id || !email_id || !instruction) {
      return new Response(JSON.stringify({ error: 'user_id, email_id et instruction requis' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = getSupabase();

    const [accountResult, configResult, metaResult] = await Promise.all([
      supabase.from('accounts').select('*').eq('email', user_id).eq('provider', providerName).single(),
      supabase.from('user_configs').select('*').eq('user_id', user_id).single(),
      supabase.from('email_metadata').select('*').eq('user_id', user_id).eq('email_id', email_id).eq('provider', providerName).single(),
    ]);

    if (accountResult.error || !accountResult.data) {
      return new Response(JSON.stringify({ error: 'Compte non trouvé' }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }

    const account = accountResult.data;
    const config = configResult.data || {};
    const analysis = metaResult.data;

    // Récupérer le thread pour le contexte
    const accessToken = await getAccessToken(account);
    const provider = getProvider(providerName);
    let thread = [];
    try {
      const tid = analysis?.thread_id || email_id;
      thread = await provider.getThread(accessToken, tid);
    } catch {}

    // Raffiner le brouillon
    const currentDraft = {
      body: current_body,
      subject: current_subject,
      tone: current_tone,
    };

    const refined = await refineDraftReply(currentDraft, instruction, thread, config, user_id);

    // Mettre à jour le brouillon dans Gmail (créer nouveau, supprimer ancien)
    const lastMsg = thread[thread.length - 1];
    const to = lastMsg?.from?.email || analysis?.sender_email;

    const { draftId } = await provider.createDraft(accessToken, {
      to,
      subject: refined.subject,
      body: refined.body,
      threadId: analysis?.thread_id,
      inReplyTo: `<${email_id}>`,
      references: `<${email_id}>`,
      from: user_id,
    });

    // Supprimer l'ancien brouillon
    if (draft_id) {
      try { await provider.deleteDraft(accessToken, draft_id); } catch {}
    }

    // Persister en DB
    await supabase
      .from('email_metadata')
      .update({ draft_id: draftId, draft_body: refined.body, draft_subject: refined.subject, draft_to: to })
      .eq('user_id', user_id)
      .eq('email_id', email_id)
      .eq('provider', providerName);

    return new Response(
      JSON.stringify({
        draftId,
        body: refined.body,
        subject: refined.subject,
        tone: refined.tone,
        to,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('draft-refine error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
