import { getProvider } from './providers/index.js';
import { getSupabase } from './utils/supabase.js';
import { decrypt, encrypt } from './utils/tokens.js';

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

    if (!email) {
      return new Response(JSON.stringify({ error: 'Paramètre email requis' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = getSupabase();

    // 1. Récupérer les décisions en attente
    const { data: pendingDecisions, error: dbError } = await supabase
      .from('decisions')
      .select('*')
      .eq('user_id', email)
      .eq('provider', providerName)
      .eq('status', 'waiting_response');

    if (dbError) throw new Error(dbError.message);
    if (!pendingDecisions || pendingDecisions.length === 0) {
      return new Response(JSON.stringify({ checked: 0, resolved: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Récupérer le compte pour accéder à l'API email
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('*')
      .eq('email', email)
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

    // 3. Vérifier chaque décision
    let resolved = 0;
    const now = new Date();

    for (const decision of pendingDecisions) {
      const hasReply = await provider.checkReplyExists(accessToken, decision.email_id);

      if (hasReply) {
        // Marquer comme résolu
        await supabase
          .from('decisions')
          .update({
            status: 'resolved',
            resolved_at: now.toISOString(),
            last_checked: now.toISOString(),
            days_waiting: Math.floor((now - new Date(decision.created_at)) / (1000 * 60 * 60 * 24)),
          })
          .eq('id', decision.id);
        resolved++;
      } else {
        // Mettre à jour days_waiting et last_checked
        await supabase
          .from('decisions')
          .update({
            last_checked: now.toISOString(),
            days_waiting: Math.floor((now - new Date(decision.created_at)) / (1000 * 60 * 60 * 24)),
          })
          .eq('id', decision.id);
      }
    }

    return new Response(
      JSON.stringify({
        checked: pendingDecisions.length,
        resolved,
        pending: pendingDecisions.length - resolved,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('decisions-check error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
