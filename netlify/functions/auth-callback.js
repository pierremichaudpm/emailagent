import { getProvider } from './providers/index.js';
import { getSupabase } from './utils/supabase.js';
import { encrypt } from './utils/tokens.js';

export default async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const stateRaw = url.searchParams.get('state');

    if (!code) {
      return new Response(JSON.stringify({ error: 'Code manquant' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const state = stateRaw ? JSON.parse(stateRaw) : { provider: 'gmail' };
    const provider = getProvider(state.provider);
    const tokens = await provider.authenticate(code);

    const supabase = getSupabase();

    const { error } = await supabase.from('accounts').upsert(
      {
        provider: state.provider,
        email: tokens.email,
        access_token: encrypt(tokens.accessToken),
        refresh_token: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
        token_expires_at: tokens.expiresAt,
      },
      { onConflict: 'provider,email' }
    );

    if (error) throw error;

    // Rediriger vers le dashboard avec l'email en paramètre
    return new Response(null, {
      status: 302,
      headers: {
        Location: `/?account=${encodeURIComponent(tokens.email)}&provider=${state.provider}`,
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
