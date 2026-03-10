import { useState, useCallback } from 'react';
import { listDecisions, checkDecisions } from '../lib/api';

export function useDecisions(account) {
  const [decisions, setDecisions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listDecisions(account.email);
      setDecisions(data.decisions || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [account]);

  const check = useCallback(async () => {
    if (!account) return;
    setChecking(true);
    setError(null);
    try {
      await checkDecisions(account.email, account.provider);
      // Refresh la liste après vérification
      const data = await listDecisions(account.email);
      setDecisions(data.decisions || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setChecking(false);
    }
  }, [account]);

  const pending = decisions.filter((d) => d.status === 'waiting_response');
  const resolved = decisions.filter((d) => d.status === 'resolved');

  return { decisions, pending, resolved, loading, checking, error, refresh, check };
}
