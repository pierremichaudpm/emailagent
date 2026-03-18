import { getSupabase } from './utils/supabase.js';
import { getAccessToken } from './utils/auth.js';
import { analyzeEmailPatterns, generateProfile } from './utils/claude.js';

const TOTAL_EMAILS = 2000;
const ANALYSIS_BATCH = 200;

export default async (req) => {
  let user_id_saved = null;
  try {
    const { user_id, provider: providerName = 'gmail' } = await req.json();
    user_id_saved = user_id;

    if (!user_id) return;

    const supabase = getSupabase();

    // Marquer le début dans user_configs
    await supabase
      .from('user_configs')
      .update({ profile_status: 'generating', profile_progress: 'Récupération des courriels...' })
      .eq('user_id', user_id);

    // Récupérer le compte
    const { data: account } = await supabase
      .from('accounts')
      .select('*')
      .eq('email', user_id)
      .eq('provider', providerName)
      .single();

    if (!account) {
      await supabase
        .from('user_configs')
        .update({ profile_status: 'error', profile_progress: 'Compte non trouvé' })
        .eq('user_id', user_id);
      return;
    }

    const accessToken = await getAccessToken(account);

    // 1. Fetch toutes les metadata emails (2000 max)
    const allMetas = [];
    let pageToken = null;
    let page = 0;

    while (allMetas.length < TOTAL_EMAILS) {
      page++;
      await supabase
        .from('user_configs')
        .update({ profile_progress: `Récupération des courriels... (page ${page}, ${allMetas.length} récupérés)` })
        .eq('user_id', user_id);

      const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
      url.searchParams.set('maxResults', '500');
      url.searchParams.set('q', 'in:inbox OR in:sent');
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const listRes = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!listRes.ok) break;
      const listData = await listRes.json();
      if (!listData.messages || !listData.messages.length) break;

      // Fetch metadata en parallèle par chunks de 100
      const msgIds = listData.messages.map((m) => m.id);
      for (let i = 0; i < msgIds.length; i += 100) {
        const chunk = msgIds.slice(i, i + 100);
        const metaResults = await Promise.all(
          chunk.map((id) =>
            fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            ).then((r) => (r.ok ? r.json() : null))
          )
        );

        for (const msg of metaResults) {
          if (!msg) continue;
          const headers = msg.payload?.headers || [];
          allMetas.push({
            from: headers.find((h) => h.name === 'From')?.value || '',
            to: headers.find((h) => h.name === 'To')?.value || '',
            subject: headers.find((h) => h.name === 'Subject')?.value || '',
            date: new Date(parseInt(msg.internalDate)).toISOString().split('T')[0],
            snippet: (msg.snippet || '').slice(0, 100),
          });
        }
      }

      pageToken = listData.nextPageToken;
      if (!pageToken) break;
    }

    if (!allMetas.length) {
      await supabase
        .from('user_configs')
        .update({ profile_status: 'error', profile_progress: 'Aucun courriel trouvé' })
        .eq('user_id', user_id);
      return;
    }

    // 2. Analyser par batches avec Claude Sonnet
    const allPatterns = [];
    const totalBatches = Math.ceil(allMetas.length / ANALYSIS_BATCH);

    for (let i = 0; i < allMetas.length; i += ANALYSIS_BATCH) {
      const batchNum = Math.floor(i / ANALYSIS_BATCH) + 1;
      await supabase
        .from('user_configs')
        .update({ profile_progress: `Analyse IA... (batch ${batchNum}/${totalBatches}, ${allMetas.length} courriels)` })
        .eq('user_id', user_id);

      const batch = allMetas.slice(i, i + ANALYSIS_BATCH);
      const patterns = await analyzeEmailPatterns(batch);
      allPatterns.push(patterns);
    }

    // 3. Fusionner en profil final
    await supabase
      .from('user_configs')
      .update({ profile_progress: 'Génération du profil final...' })
      .eq('user_id', user_id);

    const profile = await generateProfile(allPatterns, user_id);

    // 4. Sauvegarder le profil dans la config
    await supabase
      .from('user_configs')
      .update({
        context: profile,
        profile_status: 'done',
        profile_progress: `Profil généré à partir de ${allMetas.length} courriels.`,
      })
      .eq('user_id', user_id);

    console.log(`Profile generated for ${user_id}: ${allMetas.length} emails analyzed`);
  } catch (error) {
    console.error('profile-generate-background error:', error);
    if (user_id_saved) {
      const supabase = getSupabase();
      await supabase
        .from('user_configs')
        .update({ profile_status: 'error', profile_progress: error.message })
        .eq('user_id', user_id_saved);
    }
  }
};
