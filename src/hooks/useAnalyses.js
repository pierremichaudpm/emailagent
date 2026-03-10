import { useState, useCallback } from 'react';
import { analyzeEmails } from '../lib/api';

export function useAnalyses(account) {
  const [analyses, setAnalyses] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({ total: 0, newCount: 0 });

  const analyze = useCallback(async () => {
    if (!account) return;
    setAnalyzing(true);
    setError(null);
    try {
      const data = await analyzeEmails(account.email, account.provider);
      setAnalyses(data.analyses || []);
      setStats({ total: data.count || 0, newCount: data.newCount || 0 });
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  }, [account]);

  return { analyses, analyzing, error, stats, analyze };
}
