import { useState, useEffect, useCallback } from 'react';
import { getConfig, saveConfig } from '../lib/api';

export function useConfig(account) {
  const [config, setConfig] = useState(undefined); // undefined = loading, null = pas de config
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!account) {
      setConfig(undefined);
      setLoading(false);
      return;
    }
    setLoading(true);
    getConfig(account.email)
      .then((data) => setConfig(data.config))
      .catch((err) => {
        console.error('Config load error:', err);
        setConfig(null);
      })
      .finally(() => setLoading(false));
  }, [account]);

  const save = useCallback(
    async (newConfig) => {
      if (!account) return;
      await saveConfig(account.email, newConfig);
      // Re-fetch to get the full config with server-side fields (updated_at, etc.)
      const fresh = await getConfig(account.email);
      setConfig(fresh.config || newConfig);
    },
    [account]
  );

  return { config, configLoading: loading, saveConfig: save };
}
