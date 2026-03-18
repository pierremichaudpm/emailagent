import { getProvider } from '../providers/index.js';
import { getSupabase } from './supabase.js';
import { decrypt, encrypt } from './tokens.js';

/**
 * Vérifie qu'un user_id correspond à un compte valide avec un token.
 * Retourne le compte ou throw une erreur.
 */
export async function authenticateUser(userId, providerName = 'gmail') {
  if (!userId) {
    throw new Error('Authentification requise');
  }

  const supabase = getSupabase();
  const { data: account, error } = await supabase
    .from('accounts')
    .select('id, email, provider, access_token, token_expires_at')
    .eq('email', userId)
    .eq('provider', providerName)
    .single();

  if (error || !account || !account.access_token) {
    throw new Error('Compte non trouvé ou non autorisé');
  }

  return account;
}

/**
 * Récupère un access token valide pour un compte.
 * Déchiffre le token stocké, le rafraîchit si expiré, et met à jour Supabase.
 */
export async function getAccessToken(account) {
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
  let newTokens;
  try {
    newTokens = await provider.refreshToken(refreshToken);
  } catch (err) {
    throw new Error('Session expirée — veuillez vous reconnecter.');
  }

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
