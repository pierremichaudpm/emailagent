import { useState } from 'react';
import { getAuthUrl } from '../lib/api';

export default function AuthButton() {
  const [loading, setLoading] = useState(false);

  async function handleConnect() {
    setLoading(true);
    try {
      const data = await getAuthUrl('gmail');
      window.location.href = data.url;
    } catch (err) {
      alert(`Erreur: ${err.message}`);
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleConnect}
      disabled={loading}
      className="inline-flex items-center gap-3 rounded-2xl bg-brand-500 px-8 py-4 text-white font-semibold hover:bg-brand-600 disabled:opacity-50 transition-colors shadow-lg text-base"
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20 18h-2V10l-6 4-6-4v8H4V6h1.2l6.8 4.5L18.8 6H20v12zM20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z" />
      </svg>
      {loading ? 'Connexion...' : 'Connecter Gmail'}
    </button>
  );
}
