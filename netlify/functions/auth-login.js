import { getProvider } from './providers/index.js';

export default async (req) => {
  try {
    const url = new URL(req.url);
    const provider = url.searchParams.get('provider') || 'gmail';

    const emailProvider = getProvider(provider);
    const state = JSON.stringify({ provider });
    const authUrl = emailProvider.getAuthUrl(state);

    return new Response(JSON.stringify({ url: authUrl }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
