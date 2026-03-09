import { getProvider } from './providers/index.js';
import { getSupabase } from './utils/supabase.js';
import { decrypt, encrypt } from './utils/tokens.js';

async function getAccessToken(account) {
  const provider = getProvider(account.provider);
  const now = new Date();
  const expiresAt = new Date(account.token_expires_at);

  // Si le token n'est pas expiré, le retourner directement
  if (expiresAt > now) {
    return decrypt(account.access_token);
  }

  // Sinon, rafraîchir le token
  if (!account.refresh_token) {
    throw new Error('Token expiré et aucun refresh token disponible');
  }

  const refreshToken = decrypt(account.refresh_token);
  const newTokens = await provider.refreshToken(refreshToken);

  // Mettre à jour le token dans Supabase
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
    const query = url.searchParams.get('query') || 'in:inbox';

    if (!email) {
      return new Response(JSON.stringify({ error: 'Paramètre email requis' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = getSupabase();
    const { data: account, error: dbError } = await supabase
      .from('accounts')
      .select('*')
      .eq('email', email)
      .eq('provider', providerName)
      .single();

    if (dbError || !account) {
      return new Response(JSON.stringify({ error: 'Compte non trouvé' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const accessToken = await getAccessToken(account);
    const provider = getProvider(providerName);
    const emails = await provider.fetchEmails(accessToken, { maxResults, query });

    return new Response(JSON.stringify({ emails, count: emails.length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
