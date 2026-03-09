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
      .catch(() => setConfig(null))
      .finally(() => setLoading(false));
  }, [account]);

  const save = useCallback(
    async (newConfig) => {
      if (!account) return;
      await saveConfig(account.email, newConfig);
      setConfig(newConfig);
    },
    [account]
  );

  return { config, configLoading: loading, saveConfig: save };
}
