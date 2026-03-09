import { useState, useCallback } from 'react';
import { syncEmails } from '../lib/api';

export function useEmails(account) {
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    setError(null);
    try {
      const data = await syncEmails(account.email, account.provider);
      setEmails(data.emails);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [account]);

  return { emails, loading, error, refresh };
}
