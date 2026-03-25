import { getProvider } from './providers/index.js';
import { getSupabase } from './utils/supabase.js';
import { getAccessToken } from './utils/auth.js';
import { generateDraftReply, buildCalendarContext } from './utils/claude.js';
import { listEvents } from './services/google-calendar.js';

export default async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'POST requis' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { user_id, email_id, provider: providerName = 'gmail' } = await req.json();

    if (!user_id || !email_id) {
      return new Response(JSON.stringify({ error: 'user_id et email_id requis' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = getSupabase();

    // Récupérer compte, config et analyse en parallèle
    const [accountResult, configResult, analysisResult] = await Promise.all([
      supabase
        .from('accounts')
        .select('*')
        .eq('email', user_id)
        .eq('provider', providerName)
        .single(),
      supabase
        .from('user_configs')
        .select('*')
        .eq('user_id', user_id)
        .single(),
      supabase
        .from('email_metadata')
        .select('*')
        .eq('user_id', user_id)
        .eq('email_id', email_id)
        .eq('provider', providerName)
        .single(),
    ]);

    if (accountResult.error || !accountResult.data) {
      return new Response(JSON.stringify({ error: 'Compte non trouvé' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const account = accountResult.data;
    const config = configResult.data || {};
    const analysis = analysisResult.data || null;

    // Récupérer le token et les événements calendrier
    const accessToken = await getAccessToken(account);
    const provider = getProvider(providerName);

    // Fetch calendar events (graceful failure)
    let calendarContext = '';
    try {
      const now = new Date();
      const timeMin = now.toISOString();
      const timeMax = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const calendarEvents = await listEvents(accessToken, { timeMin, timeMax, timeZone: 'America/Montreal' });
      calendarContext = buildCalendarContext(calendarEvents);
    } catch (err) {
      console.warn('Calendar fetch failed (continuing without):', err.message);
    }

    const threadId = analysis?.thread_id || email_id;
    let thread;
    try {
      thread = await provider.getThread(accessToken, threadId);
    } catch (err) {
      return new Response(JSON.stringify({ error: `Fil de discussion introuvable: ${err.message}` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!thread || !thread.length) {
      return new Response(JSON.stringify({ error: 'Fil de discussion vide' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Filtrer les brouillons du thread — ne garder que les vrais messages
    const realMessages = thread.filter((m) => !m.labels?.includes('DRAFT'));
    const messagesForReply = realMessages.length > 0 ? realMessages : thread;

    // Trouver le dernier message reçu (pas envoyé par l'utilisateur)
    const lastReceived = [...messagesForReply]
      .reverse()
      .find((m) => m.from.email.toLowerCase() !== user_id.toLowerCase());

    if (!lastReceived) {
      return new Response(
        JSON.stringify({ error: 'Aucun message reçu dans ce fil nécessitant une réponse.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Générer le brouillon via Claude (envoyer tout le thread + calendrier pour le contexte)
    const draft = await generateDraftReply(messagesForReply, analysis, config, user_id, calendarContext);

    const replyTo = lastReceived.from.email;
    // Utiliser le vrai Message-ID du header pour In-Reply-To et References
    const realMessageId = lastReceived.messageId || `<${lastReceived.id}@mail.gmail.com>`;

    // Créer le brouillon dans Gmail
    const { draftId } = await provider.createDraft(accessToken, {
      to: replyTo,
      subject: draft.subject,
      body: draft.body,
      threadId,
      inReplyTo: realMessageId,
      references: realMessageId,
      from: user_id,
    });

    // Persister le brouillon complet dans email_metadata
    await supabase
      .from('email_metadata')
      .update({
        draft_id: draftId,
        draft_body: draft.body,
        draft_subject: draft.subject,
        draft_to: replyTo,
      })
      .eq('user_id', user_id)
      .eq('email_id', email_id)
      .eq('provider', providerName);

    return new Response(
      JSON.stringify({
        draftId,
        subject: draft.subject,
        body: draft.body,
        tone: draft.tone,
        to: replyTo,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('draft-generate error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
