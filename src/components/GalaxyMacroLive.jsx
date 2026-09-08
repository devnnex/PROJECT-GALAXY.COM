import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, BarChart3, ChevronRight, Clock3, Radio, Settings2, ShieldCheck, WifiOff, X } from 'lucide-react';
import { api } from '../services/api';
import { countdown, timeAt } from '../macro-ui-utils';

const SIGNAL_LABEL = { WAITING: 'WAITING', LIVE: 'LIVE', STRONG_BUY: 'STRONG BUY', BUY: 'BUY', WAIT: 'WAIT', NEUTRAL: 'NEUTRAL', MIXED: 'MIXED', SELL: 'SELL', STRONG_SELL: 'STRONG SELL', NO_SIGNAL: 'NO SIGNAL' };
const SIGNAL_ICON = { STRONG_BUY: '🟢', BUY: '🟢', WAITING: '⚪', WAIT: '🟡', NEUTRAL: '⚪', MIXED: '🟠', SELL: '🔴', STRONG_SELL: '🔴', NO_SIGNAL: '⚪', LIVE: '●' };
const REASON_LABEL = {
  MISSING_FORECAST: 'CONSENSUS UNAVAILABLE', INVALID_VALUE: 'INVALID VALUE', UNEXPECTED_EVENT: 'UNEXPECTED EVENT',
  STALE_DATA: 'STALE DATA', FEED_DISCONNECTED: 'FEED DISCONNECTED', DUPLICATE: 'DUPLICATE', INSUFFICIENT_COMPONENTS: 'INSUFFICIENT COMPONENTS',
  RATE_AS_EXPECTED: 'RATE AS EXPECTED',
};

function formatValue(component, field) {
  if (!component) return '—';
  const raw = component[`${field}Raw`]; if (raw !== null && raw !== undefined && raw !== '') return raw;
  const value = component[field]; if (value === null || value === undefined) return '—';
  return `${value}${component.unit === '%' ? '%' : ''}`;
}

function dateBadge(value) {
  const date = new Date(value); if (!Number.isFinite(date.getTime())) return { day: '--', month: '---' };
  return { day: new Intl.DateTimeFormat('es-CO', { day: '2-digit' }).format(date), month: new Intl.DateTimeFormat('es-CO', { month: 'short' }).format(date).replace('.', '').toUpperCase() };
}

function releaseStatus(release, health, now) {
  if (!health?.connected) return 'DISCONNECTED';
  if (health?.stale) return 'STALE_DATA';
  if (!release) return 'WAITING';
  if (release.signal?.signal === 'NO_SIGNAL') return release.signal.reason || 'WAIT';
  if (release.signal?.signal) return release.signal.signal;
  const scheduled = new Date(release.scheduledAt).getTime();
  return scheduled <= now && now - scheduled < 120000 && release.components?.some((item) => item.actual !== null) ? 'LIVE' : 'WAITING';
}

function SignalPill({ signal }) {
  const key = signal || 'WAIT';
  return <span className={`macro-signal-pill ${key.toLowerCase()}`}><i aria-hidden="true">{SIGNAL_ICON[key] || '⚪'}</i>{SIGNAL_LABEL[key] || REASON_LABEL[key] || key.replaceAll('_', ' ')}</span>;
}

function ComponentValues({ component }) {
  return <div className="macro-values">
    <span><small>PREVIOUS</small><strong>{formatValue(component, 'previous')}</strong></span>
    <span><small>CONSENSO</small><strong>{formatValue(component, 'forecast')}</strong></span>
    <span className="actual"><small>REAL</small><strong>{formatValue(component, 'actual')}</strong></span>
  </div>;
}

function MacroCard({ item, health, now, onOpen }) {
  const release = item.nextRelease || item.latestRelease; const component = release?.components?.[0]; const status = releaseStatus(release, health, now);
  const badge = dateBadge(release?.scheduledAt); const signal = release?.signal;
  return <button type="button" className={`macro-engine-card ${status.toLowerCase()}`} onClick={() => release && onOpen(release)} disabled={!release}>
    <header><span className="macro-date-badge"><strong>{badge.day}</strong><small>{badge.month}</small></span><span><small>{item.enabled ? 'ENGINE ACTIVO' : 'ENGINE PAUSADO'}{component?.importance ? ` · IMPACTO ${component.importance}/3` : ''}</small><strong>{item.label} · USA</strong></span><ChevronRight /></header>
    <div className="macro-card-time"><Clock3 />{release ? timeAt(release.scheduledAt, 'America/New_York') : 'Sin release programado'}<em> ET</em></div>
    <div className="macro-countdown"><small>{status === 'LIVE' ? 'LIVE' : 'LIVE IN'}</small><strong>{release ? countdown(release.scheduledAt, now) : '--:--:--'}</strong></div>
    <ComponentValues component={component} />
    <footer><SignalPill signal={status === 'WAITING' ? 'WAITING' : signal?.signal || status} /><span><small>SCORE</small><strong>{signal ? `${signal.galaxyScore > 0 ? '+' : ''}${signal.galaxyScore}` : '—'}</strong></span><span><small>CONF.</small><strong>{signal?.confidence || '—'}</strong></span></footer>
  </button>;
}

function MacroDetail({ release, health, now, onClose }) {
  const signal = release.signal; const status = releaseStatus(release, health, now);
  return <div className="modal-backdrop macro-modal-backdrop"><section className="macro-detail glass" role="dialog" aria-modal="true" aria-labelledby="macro-detail-title">
    <header><div><p className="eyebrow">GALAXY MACRO ANALYSIS</p><h2 id="macro-detail-title">{release.engine.replace('_', ' ')} · XAUUSD</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X /></button></header>
    <div className="macro-detail-signal"><SignalPill signal={signal?.signal || status} /><strong>{signal ? `${signal.galaxyScore > 0 ? '+' : ''}${signal.galaxyScore} / 100` : 'Sin score'}</strong><small>Confidence {signal?.confidence || '—'} · {signal?.engineVersion || `${release.engine} ENGINE v1`}</small></div>
    <div className="macro-audit-grid"><article><small>DATO</small><strong>{timeAt(release.scheduledAt, Intl.DateTimeFormat().resolvedOptions().timeZone)} local</strong><span>{timeAt(release.scheduledAt, 'America/New_York')} ET</span></article><article><small>INTERPRETACIÓN</small><strong>{signal?.reason ? REASON_LABEL[signal.reason] || signal.reason : signal?.status || release.status}</strong><span>Reglas deterministas · versión {signal?.version || '—'}</span></article><article><small>SEÑAL</small><strong>{SIGNAL_LABEL[signal?.signal] || 'WAIT'}</strong><span>{signal?.galaxyScore > 0 ? 'USD ↓ · XAUUSD ↑' : signal?.galaxyScore < 0 ? 'USD ↑ · XAUUSD ↓' : 'Sin sesgo direccional'}</span></article></div>
    <div className="macro-component-table"><div className="table-head"><span>INDICADOR</span><span>PREVIOUS</span><span>CONSENSO</span><span>ACTUAL</span><span>LECTURA ORO</span></div>{release.components?.map((component) => {
      const scored = signal?.componentScores?.find((item) => item.indicator === component.indicator); const tone = scored?.goldScore > 0 ? 'bullish' : scored?.goldScore < 0 ? 'bearish' : 'neutral';
      return <div className="macro-component-row" key={component.indicator}><strong>{component.label}</strong><span>{formatValue(component, 'previous')}</span><span>{formatValue(component, 'forecast')}</span><span>{formatValue(component, 'actual')}</span><em className={tone}>{tone === 'bullish' ? 'BULLISH GOLD' : tone === 'bearish' ? 'BEARISH GOLD' : 'NEUTRAL'}</em></div>;
    })}</div>
    <div className="macro-explanation"><h3>Motivos verificables</h3>{signal?.explanation?.map((line, index) => <p key={`${line}-${index}`}><ShieldCheck />{line}</p>) || <p>Esperando los datos necesarios para evaluar el release.</p>}</div>
    <div className="macro-latency"><span><small>FEED RECEIVED</small><strong>{timeAt(signal?.receivedAt, 'America/New_York')} ET</strong></span><span><small>SIGNAL</small><strong>{timeAt(signal?.generatedAt, 'America/New_York')} ET</strong></span><span><small>PROCESSING</small><strong>{signal?.processingMs === 0 ? '<1 ms' : signal?.processingMs != null ? `${signal.processingMs} ms` : '—'}</strong></span></div>
  </section></div>;
}

function MacroAdmin({ onClose, toast }) {
  const [data, setData] = useState(null); const [busy, setBusy] = useState('');
  useEffect(() => { api.getMacroAdminConfig().then(setData).catch((error) => toast(error.message, 'error')); }, []);
  const change = (index, patch) => setData((current) => ({ ...current, components: current.components.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }));
  const toggleEngine = async (engine) => { const enabled = !data.components.some((item) => item.engine === engine && item.enabled); setBusy(engine); try { await api.setMacroEngineEnabled({ engine, enabled }); setData((current) => ({ ...current, components: current.components.map((item) => item.engine === engine ? { ...item, enabled } : item) })); toast(`${engine.replace('_', ' ')} ${enabled ? 'habilitado' : 'pausado'}.`); } catch (error) { toast(error.message, 'error'); } finally { setBusy(''); } };
  const save = async (item) => { setBusy(item.indicator); try { await api.updateMacroEngineConfig({ engine: item.engine, indicator: item.indicator, enabled: item.enabled, weight: Number(item.weight), surpriseThreshold: Number(item.surpriseThreshold), required: item.required, aliases: item.aliases }); toast(`${item.label} actualizado.`); } catch (error) { toast(error.message, 'error'); } finally { setBusy(''); } };
  const saveRuntime = async () => { setBusy('runtime'); try { await api.updateMacroRuntimeConfig(data.runtime); toast('Ventanas de agregación actualizadas.'); } catch (error) { toast(error.message, 'error'); } finally { setBusy(''); } };
  return <div className="modal-backdrop macro-modal-backdrop"><section className="macro-admin glass" role="dialog" aria-modal="true"><header><div><p className="eyebrow">ADMIN CONFIG</p><h2>Galaxy Macro Engine Registry</h2></div><button className="icon-button" onClick={onClose}><X /></button></header>{!data ? <p className="muted">Cargando configuración…</p> : <>
    <div className="macro-admin-health"><span className={`macro-feed-state ${data.health?.connected ? 'connected' : 'disconnected'}`}>{data.health?.connected ? <Activity /> : <WifiOff />}{data.health?.connected ? 'TRADING ECONOMICS CONNECTED' : 'TRADING ECONOMICS DISCONNECTED'}</span><small>Último mensaje: {timeAt(data.health?.lastMessageAt, 'America/New_York')} ET · Reconexiones: {data.health?.reconnectCount || 0}{data.health?.lastError ? ` · ${data.health.lastError}` : ''}</small></div>
    <div className="macro-engine-switches">{[...new Set(data.components.map((item) => item.engine))].map((engine) => { const enabled = data.components.some((item) => item.engine === engine && item.enabled); return <button type="button" className={enabled ? 'active' : ''} disabled={busy === engine} onClick={() => toggleEngine(engine)} key={engine}>{engine.replace('_', ' ')} · {enabled ? 'ON' : 'OFF'}</button>; })}</div>
    <div className="macro-runtime-config"><label>Aggregation window (ms)<input type="number" min="100" max="2000" value={data.runtime.aggregationWindowMs} onChange={(event) => setData({ ...data, runtime: { ...data.runtime, aggregationWindowMs: Number(event.target.value) } })} /></label><label>Late update window (ms)<input type="number" min="500" max="15000" value={data.runtime.lateUpdateWindowMs} onChange={(event) => setData({ ...data, runtime: { ...data.runtime, lateUpdateWindowMs: Number(event.target.value) } })} /></label><button className="secondary-button" disabled={busy === 'runtime'} onClick={saveRuntime}>Guardar ventanas</button></div>
    <div className="macro-admin-list">{data.components.map((item, index) => <article key={`${item.engine}-${item.indicator}`}><header><strong>{item.engine} · {item.label}</strong><label className="macro-enable"><input type="checkbox" checked={item.enabled} onChange={(event) => change(index, { enabled: event.target.checked })} /> Activo</label></header><div><label>Peso<input type="number" min="0.01" max="1" step="0.01" value={item.weight} onChange={(event) => change(index, { weight: event.target.value })} /></label><label>Surprise threshold<input type="number" min="0.0001" step="0.01" value={item.surpriseThreshold} onChange={(event) => change(index, { surpriseThreshold: event.target.value })} /></label><label className="macro-enable"><input type="checkbox" checked={item.required} onChange={(event) => change(index, { required: event.target.checked })} /> Requerido</label></div><label>Aliases<textarea value={item.aliases.join('\n')} onChange={(event) => change(index, { aliases: event.target.value.split('\n').map((value) => value.trim()).filter(Boolean) })} /></label><small>Provider: {item.symbol || item.ticker || 'se descubrirá por REST'}{item.mappingVerifiedAt ? ' · verificado' : ''}</small><button className="text-button" disabled={busy === item.indicator} onClick={() => save(item)}>Guardar indicador</button></article>)}</div>
  </>}</section></div>;
}

export default function GalaxyMacroLive({ toast, canManage = false }) {
  const [dashboard, setDashboard] = useState(null); const [now, setNow] = useState(Date.now()); const [detail, setDetail] = useState(null); const [admin, setAdmin] = useState(false); const refreshTimer = useRef(null);
  const load = () => api.getMacroDashboard().then(setDashboard).catch((error) => toast(error.message, 'error'));
  useEffect(() => { load(); const clock = setInterval(() => setNow(Date.now()), 250); const unsubscribe = api.onMacroChange(() => { clearTimeout(refreshTimer.current); refreshTimer.current = setTimeout(load, 100); }); return () => { clearInterval(clock); clearTimeout(refreshTimer.current); unsubscribe(); }; }, []);
  const next = useMemo(() => dashboard?.engines?.map((item) => item.nextRelease).filter(Boolean).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))[0], [dashboard]);
  const health = dashboard?.health || { connected: false, stale: true }; const nextStatus = releaseStatus(next, health, now);
  return <section className="galaxy-macro-live surface">
    <header className="macro-heading"><div><p className="eyebrow"><Radio /> GALAXY MACRO LIVE</p><h2>Análisis macroeconómico en tiempo real para XAUUSD</h2><p>Datos de Trading Economics · interpretación matemática · señal de sesgo, sin ejecución de órdenes.</p></div><div className="macro-heading-actions"><span className={`macro-feed-state ${health.connected && !health.stale ? 'connected' : 'disconnected'}`}>{health.connected && !health.stale ? <Activity /> : <WifiOff />}{health.connected && !health.stale ? 'FEED CONNECTED' : health.stale && health.connected ? 'STALE DATA' : 'DISCONNECTED'}</span>{canManage && <button className="secondary-button" onClick={() => setAdmin(true)}><Settings2 /> Configurar</button>}</div></header>
    <div className="macro-hero"><div><small>PRÓXIMO EVENTO</small><strong>{next ? `${next.engine.replace('_', ' ')} USA` : 'Calendario pendiente'}</strong><span>{next ? `${dateBadge(next.scheduledAt).day} ${dateBadge(next.scheduledAt).month} · ${timeAt(next.scheduledAt, 'America/New_York')} ET` : 'El worker cargará el próximo release por REST.'}</span></div><div className="macro-hero-countdown"><small>{nextStatus === 'LIVE' ? 'LIVE' : 'LIVE IN'}</small><strong>{next ? countdown(next.scheduledAt, now) : '--:--:--'}</strong><SignalPill signal={nextStatus === 'WAITING' ? 'WAITING' : next?.signal?.signal || nextStatus} /></div><BarChart3 /></div>
    <div className="macro-engine-grid">{dashboard?.engines?.map((item) => <MacroCard key={item.engine} item={item} health={health} now={now} onOpen={setDetail} />) || Array.from({ length: 6 }, (_, index) => <div className="macro-engine-card loading" key={index} />)}</div>
    <footer className="macro-disclaimer"><ShieldCheck /> El módulo distingue datos del proveedor, interpretación determinista y señal macro. Datos incompletos o conexión no saludable producen WAIT / NO SIGNAL.</footer>
    {detail && <MacroDetail release={detail} health={health} now={now} onClose={() => setDetail(null)} />}{admin && <MacroAdmin onClose={() => setAdmin(false)} toast={toast} />}
  </section>;
}
