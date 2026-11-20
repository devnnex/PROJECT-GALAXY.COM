import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { watchVisibleResource } from '../services/visible-refresh';

export default function TradeStrategyControls({ toast }) {
  const [settings, setSettings] = useState(null), [pending, setPending] = useState(null), [error, setError] = useState(false);
  useEffect(() => {
    const watcher = watchVisibleResource({ load: () => api.getTradeStrategies(), onData: (data) => { setSettings(data); setError(false); }, onError: () => setError(true) });
    const refresh = () => watcher.refresh();
    window.addEventListener('galaxy:strategies-updated', refresh);
    return () => { watcher.stop(); window.removeEventListener('galaxy:strategies-updated', refresh); };
  }, []);
  const toggle = async (key) => {
    if (pending || !settings || error) return;
    setPending(key);
    try {
      setSettings(await api.setTradeStrategy(key, !settings[key]));
      window.dispatchEvent(new Event('galaxy:strategies-updated'));
      window.dispatchEvent(new Event('galaxy:scanner-update'));
    } catch (error) { toast(error.message || 'No se pudo cambiar la estrategia.', 'error'); }
    finally { setPending(null); }
  };
  return <section className="bgt-strategy-controls" aria-label="Administrar estrategias">
    <div><strong>Control de estrategias</strong><small>Al pausar se detienen nuevas entradas. Las operaciones abiertas siguen en seguimiento.</small></div>
    <div className="bgt-strategy-switches">{[['OPUS', 'Opus 5.5'], ['RANGE777', 'Galaxy Aurum Bot']].map(([key, label]) => <label key={key} className="access-toggle">
      <input type="checkbox" role="switch" aria-label={label} checked={settings?.[key] === true} disabled={!settings || Boolean(pending) || error} onChange={() => toggle(key)} />
      <span aria-hidden="true" /><strong>{label}</strong><em>{pending === key ? 'Guardando…' : settings ? settings[key] ? 'Activada' : 'Pausada' : 'Cargando…'}</em>
    </label>)}</div>
    {error && <p role="alert">No se pudo verificar el estado. <button onClick={() => window.dispatchEvent(new Event('galaxy:strategies-updated'))}>Reintentar</button></p>}
  </section>;
}
