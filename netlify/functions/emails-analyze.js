import { getProvider } from './providers/index.js';
import { getSupabase } from './utils/supabase.js';
import { getAccessToken } from './utils/auth.js';
import { analyzeEmails } from './utils/claude.js';
import { computePriority } from './utils/prioritize.js';

const BATCH_SIZE = 5;

export default async (req) => {
  try {
    const url = new URL(req.url);
    const email = url.searchParams.get('email');
    const providerName = url.searchParams.get('provider') || 'gmail';
    const maxResults = parseInt(url.searchParams.get('maxResults') || '20', 10);
    const forceRefresh = url.searchParams.get('refresh') === 'true';

    if (!email) {
      return new Response(JSON.stringify({ error: 'Paramètre email requis' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = getSupabase();

    // 1. Récupérer le compte et la config en parallèle
    const [accountResult, configResult] = await Promise.all([
      supabase
        .from('accounts')
        .select('*')
        .eq('email', email)
        .eq('provider', providerName)
        .single(),
      supabase
        .from('user_configs')
        .select('*')
        .eq('user_id', email)
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

    // 2. Récupérer les emails via le provider
    const accessToken = await getAccessToken(account);
    const provider = getProvider(providerName);
    const emails = await provider.fetchEmails(accessToken, {
      maxResults,
      query: 'in:inbox',
    });

    if (!emails.length) {
      return new Response(JSON.stringify({ analyses: [], count: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. Filtrer les emails déjà analysés (sauf si refresh forcé)
    const emailIds = emails.map((e) => e.id);
    let existingIds = new Set();
    let newEmails;

    if (forceRefresh) {
      // Reset les champs d'analyse IA sans toucher dismissed, draft_id, user_replied, is_automatic
      await supabase
        .from('email_metadata')
        .update({
          summary: null,
          category: null,
          priority_level: null,
          priority_score: null,
          decision_required: false,
          detected_deadline: null,
          detected_amounts: [],
          detected_people: [],
          suggested_action: null,
          analyzed_at: null,
        })
        .eq('user_id', email)
        .eq('provider', providerName)
        .in('email_id', emailIds);
      newEmails = emails;
    } else {
      const { data: existing } = await supabase
        .from('email_metadata')
        .select('email_id')
        .eq('user_id', email)
        .eq('provider', providerName)
        .in('email_id', emailIds);

      existingIds = new Set((existing || []).map((e) => e.email_id));
      newEmails = emails.filter((e) => !existingIds.has(e.id));
    }

    // Note: orphan cleanup is handled during the thread check phase (step 8)
    // where we verify each thread actually exists in Gmail before returning it

    // Récupérer les analyses existantes pour les retourner aussi
    let existingAnalyses = [];
    if (existingIds.size > 0) {
      const { data } = await supabase
        .from('email_metadata')
        .select('*')
        .eq('user_id', email)
        .eq('provider', providerName)
        .in('email_id', [...existingIds]);
      existingAnalyses = data || [];
    }

    if (!newEmails.length) {
      // Filtrer les dismissed même sans nouvelles analyses
      const filtered = existingAnalyses.filter((a) => !a.dismissed);
      return new Response(
        JSON.stringify({ analyses: filtered, count: filtered.length, newCount: 0 }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 4. Analyser par batch avec Claude (en parallèle)
    const batches = [];
    for (let i = 0; i < newEmails.length; i += BATCH_SIZE) {
      batches.push(newEmails.slice(i, i + BATCH_SIZE));
    }

    const batchResults = await Promise.all(
      batches.map((batch) => analyzeEmails(batch, config))
    );

    // 5. Combiner avec le scoring de priorité
    const allAnalyses = [];
    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b];
      const claudeResults = batchResults[b];

      for (const analysis of claudeResults) {
        const matchingEmail = batch.find((e) => e.id === analysis.email_id);
        if (!matchingEmail) continue;

        const { priority_level, priority_score } = computePriority(
          analysis,
          matchingEmail,
          config
        );

        const record = {
          user_id: email,
          email_id: analysis.email_id,
          thread_id: matchingEmail.threadId,
          provider: providerName,
          subject: matchingEmail.subject,
          sender_email: matchingEmail.from.email,
          sender_name: matchingEmail.from.name,
          received_at: new Date(matchingEmail.date).toISOString(),
          summary: analysis.summary,
          category: analysis.category,
          priority_level,
          priority_score,
          decision_required: analysis.decision_required || false,
          detected_deadline: analysis.deadline || null,
          detected_amounts: analysis.amounts || [],
          detected_people: analysis.people || [],
          suggested_action: analysis.suggested_action || null,
          analyzed_at: new Date().toISOString(),
        };

        allAnalyses.push(record);
      }
    }

    // 6. Upsert dans email_metadata
    if (allAnalyses.length > 0) {
      const { error: upsertError } = await supabase
        .from('email_metadata')
        .upsert(allAnalyses, { onConflict: 'user_id,email_id,provider' });

      if (upsertError) {
        console.error('Erreur upsert email_metadata:', upsertError);
      }
    }

    // 7. Créer les entrées de décisions pour les emails qui en requièrent
    const decisionsToInsert = allAnalyses
      .filter((a) => a.decision_required)
      .map((a) => ({
        user_id: email,
        email_id: a.email_id,
        provider: providerName,
        summary: a.summary,
        detected_deadline: a.detected_deadline,
        status: 'waiting_response',
      }));

    if (decisionsToInsert.length > 0) {
      await supabase.from('decisions').upsert(decisionsToInsert, {
        onConflict: 'user_id,email_id,provider',
        ignoreDuplicates: true,
      });
    }

    // 8. Vérifier si l'utilisateur a déjà ENVOYÉ une réponse (pas brouillon)
    const combined = [...allAnalyses, ...existingAnalyses];
    const replyChecks = await Promise.all(
      combined.map(async (a) => {
        try {
          const tid = a.thread_id || a.email_id;
          // Fetch thread metadata via fetch natif (pas googleapis qui peut inclure brouillons)
          const res = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/threads/${tid}?format=metadata&metadataHeaders=From`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (!res.ok) return { ...a, thread_missing: true };
          const threadData = await res.json();
          const messages = threadData.messages || [];
          if (!messages.length) return { ...a, thread_missing: true };

          // Trouver le dernier message ENVOYÉ (pas brouillon = a le label SENT ou pas DRAFT)
          const sentMessages = messages.filter(
            (m) => (m.labelIds || []).includes('SENT') && !(m.labelIds || []).includes('DRAFT')
          );
          const receivedMessages = messages.filter(
            (m) => !(m.labelIds || []).includes('SENT') && !(m.labelIds || []).includes('DRAFT')
          );

          // L'utilisateur a répondu si le dernier message envoyé est APRÈS le dernier message reçu
          let userReplied = false;
          if (sentMessages.length > 0 && receivedMessages.length > 0) {
            const lastSent = parseInt(sentMessages[sentMessages.length - 1].internalDate);
            const lastReceived = parseInt(receivedMessages[receivedMessages.length - 1].internalDate);
            userReplied = lastSent > lastReceived;
          }

          // Déterminer si c'est un email automatique
          const senderEmail = (a.sender_email || '').toLowerCase();
          const senderDomain = senderEmail.split('@')[1] || '';

          // Check par expéditeur (patterns clairement automatiques)
          const autoSenderPatterns = /^(noreply|no-reply|no_reply|donotreply|do-not-reply|mailer-daemon|bounce|postmaster)@|calendar-notification/;
          const isAutoSender = autoSenderPatterns.test(senderEmail);

          // Check par domaine (notifications de plateformes — seulement celles qui n'envoient JAMAIS d'emails humains)
          const autoDomains = /payments\.interac\.ca|interac\.ca|calendar\.google\.com|mailchimp\.com|sendgrid\.net|constantcontact\.com|eventbrite\.com|meetup\.com/;
          const isAutoDomain = autoDomains.test(senderDomain);

          // Check par labels Gmail (seulement PROMOTIONS — les UPDATES/SOCIAL peuvent contenir des vrais emails)
          const firstMsg = messages[0];
          const labels = firstMsg?.labelIds || [];
          const isAutoLabel = labels.some((l) =>
            ['CATEGORY_PROMOTIONS'].includes(l)
          );

          const isAutomatic = isAutoSender || isAutoDomain || isAutoLabel;

          return { ...a, user_replied: userReplied, is_automatic: isAutomatic };
        } catch {
          return { ...a, thread_missing: true };
        }
      })
    );

    // Exclure les threads manquants et les emails ignorés
    const valid = replyChecks.filter((a) => !a.thread_missing && !a.dismissed);

    // Persister user_replied et is_automatic en DB
    const updates = valid
      .filter((a) => a.user_replied !== undefined || a.is_automatic !== undefined)
      .map((a) => ({
        user_id: a.user_id,
        email_id: a.email_id,
        provider: a.provider,
        user_replied: a.user_replied || false,
        is_automatic: a.is_automatic || false,
      }));
    if (updates.length > 0) {
      await supabase
        .from('email_metadata')
        .upsert(updates, { onConflict: 'user_id,email_id,provider', ignoreDuplicates: false });
    }

    // Supprimer les analyses orphelines (threads manquants)
    // Soft delete les threads manquants
    const orphanFromCheck = replyChecks.filter((a) => a.thread_missing).map((a) => a.email_id);
    if (orphanFromCheck.length > 0) {
      await supabase
        .from('email_metadata')
        .update({ dismissed: true })
        .eq('user_id', email)
        .eq('provider', providerName)
        .in('email_id', orphanFromCheck);
    }

    // Dédupliquer par thread_id (garder le plus prioritaire)
    const byThread = new Map();
    for (const a of valid) {
      const tid = a.thread_id || a.email_id;
      const existing = byThread.get(tid);
      if (!existing || (a.priority_score || 0) > (existing.priority_score || 0)) {
        byThread.set(tid, a);
      }
    }
    const filtered = [...byThread.values()];
    filtered.sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0));

    return new Response(
      JSON.stringify({
        analyses: filtered,
        count: filtered.length,
        newCount: allAnalyses.length,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('emails-analyze error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
