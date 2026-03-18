import { getProvider } from './providers/index.js';
import { getSupabase } from './utils/supabase.js';
import { getAccessToken } from './utils/auth.js';

export default async (req) => {
  try {
    const url = new URL(req.url);
    const email = url.searchParams.get('email');
    const threadId = url.searchParams.get('threadId');
    const providerName = url.searchParams.get('provider') || 'gmail';

    if (!email || !threadId) {
      return new Response(JSON.stringify({ error: 'email et threadId requis' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = getSupabase();
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('*')
      .eq('email', email)
      .eq('provider', providerName)
      .single();

    if (accountError || !account) {
      return new Response(JSON.stringify({ error: 'Compte non trouvé' }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }

    const accessToken = await getAccessToken(account);
    const provider = getProvider(providerName);
    const messages = await provider.getThread(accessToken, threadId);

    return new Response(JSON.stringify({ messages }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('email-thread error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
