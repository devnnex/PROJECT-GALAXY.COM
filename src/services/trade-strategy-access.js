import { useEffect, useState } from 'react';
import { api } from './api';
import { watchVisibleResource } from './visible-refresh';

export function availableTradeStrategy(requested, access) {
  return access?.[requested] === true ? requested : access?.OPUS === true ? 'OPUS' : access?.RANGE777 === true ? 'RANGE777' : null;
}

export function useTradeStrategyAccess() {
  const [access, setAccess] = useState(null), [error, setError] = useState(false);
  useEffect(() => {
    const watcher = watchVisibleResource({ load: () => api.getTradeStrategyAccess(), interval: 5000,
      onData: (data) => { setAccess(current => Date.parse(current?.updatedAt) > Date.parse(data?.updatedAt) ? current : data); setError(false); },
      onError: () => { setAccess(null); setError(true); } });
    const unsubscribe = api.onTradeStrategyAccess((event) => {
      const row = event?.new;
      if (['OPUS', 'RANGE777'].includes(row?.strategy) && row.enabled === false) {
        setAccess(current => !current ? null : Date.parse(current.updatedAt) > Date.parse(row.updated_at) ? current : { ...current, [row.strategy]: false, updatedAt: row.updated_at });
      }
      watcher.refresh();
    });
    window.addEventListener('galaxy:strategies-updated', watcher.refresh);
    return () => { watcher.stop(); unsubscribe(); window.removeEventListener('galaxy:strategies-updated', watcher.refresh); };
  }, []);
  return { access, error };
}
