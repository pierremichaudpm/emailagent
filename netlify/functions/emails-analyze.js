import { getProvider } from './providers/index.js';
import { getSupabase } from './utils/supabase.js';
import { decrypt, encrypt } from './utils/tokens.js';
import { analyzeEmails } from './utils/claude.js';
import { computePriority } from './utils/prioritize.js';

const BATCH_SIZE = 10;

async function getAccessToken(account) {
  const provider = getProvider(account.provider);
  const now = new Date();
  const expiresAt = new Date(account.token_expires_at);

  if (expiresAt > now) {
    return decrypt(account.access_token);
  }

  if (!account.refresh_token) {
    throw new Error('Token expiré et aucun refresh token disponible');
  }

  const refreshToken = decrypt(account.refresh_token);
  const newTokens = await provider.refreshToken(refreshToken);

  const supabase = getSupabase();
  await supabase
    .from('accounts')
    .update({
      access_token: encrypt(newTokens.accessToken),
      token_expires_at: newTokens.expiresAt,
    })
    .eq('id', account.id);

  return newTokens.accessToken;
}

export default async (req) => {
  try {
    const url = new URL(req.url);
    const email = url.searchParams.get('email');
    const providerName = url.searchParams.get('provider') || 'gmail';
    const maxResults = parseInt(url.searchParams.get('maxResults') || '20', 10);

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

    // 3. Filtrer les emails déjà analysés
    const emailIds = emails.map((e) => e.id);
    const { data: existing } = await supabase
      .from('email_metadata')
      .select('email_id')
      .eq('user_id', email)
      .eq('provider', providerName)
      .in('email_id', emailIds);

    const existingIds = new Set((existing || []).map((e) => e.email_id));
    const newEmails = emails.filter((e) => !existingIds.has(e.id));

    // Récupérer les analyses existantes pour les retourner aussi
    let existingAnalyses = [];
    if (existing && existing.length > 0) {
      const { data } = await supabase
        .from('email_metadata')
        .select('*')
        .eq('user_id', email)
        .eq('provider', providerName)
        .in('email_id', [...existingIds]);
      existingAnalyses = data || [];
    }

    if (!newEmails.length) {
      return new Response(
        JSON.stringify({ analyses: existingAnalyses, count: existingAnalyses.length, newCount: 0 }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 4. Analyser par batch avec Claude
    const allAnalyses = [];
    for (let i = 0; i < newEmails.length; i += BATCH_SIZE) {
      const batch = newEmails.slice(i, i + BATCH_SIZE);
      const claudeResults = await analyzeEmails(batch, config);

      // 5. Combiner avec le scoring de priorité
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
          received_at: matchingEmail.date,
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

    // 8. Retourner toutes les analyses (nouvelles + existantes)
    const combined = [...allAnalyses, ...existingAnalyses];
    combined.sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0));

    return new Response(
      JSON.stringify({
        analyses: combined,
        count: combined.length,
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
