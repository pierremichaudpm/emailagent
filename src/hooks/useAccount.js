import { useState, useEffect } from 'react';

export function useAccount() {
  const [account, setAccount] = useState(null);

  useEffect(() => {
    // Vérifier si on revient du callback OAuth
    const params = new URLSearchParams(window.location.search);
    const email = params.get('account');
    const provider = params.get('provider');

    if (email && provider) {
      const acct = { email, provider };
      setAccount(acct);
      localStorage.setItem('account', JSON.stringify(acct));
      // Nettoyer l'URL
      window.history.replaceState({}, '', '/');
    } else {
      // Charger depuis localStorage
      const saved = localStorage.getItem('account');
      if (saved) setAccount(JSON.parse(saved));
    }
  }, []);

  function disconnect() {
    localStorage.removeItem('account');
    setAccount(null);
  }

  return { account, disconnect };
}
