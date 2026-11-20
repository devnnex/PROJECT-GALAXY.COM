import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Calculator, Crosshair, RefreshCw, Send, ShieldCheck, Volume2, VolumeX, X } from 'lucide-react';
import TelegramAccess from './TelegramAccess';
import TradeStrategyControls from './TradeStrategyControls';
import { api } from '../services/api';
import { scannerAudioReady, scannerSoundEnabled, setScannerSound } from '../services/scanner-audio';
import { levelSymbol, parseScannerNotice, quotePresentation, scannerNoticeTitle } from '../services/scanner-presentation';
import { eventTone } from '../services/scanner-analytics';
import { watchVisibleResource } from '../services/visible-refresh';
import { availableTradeStrategy, useTradeStrategyAccess } from '../services/trade-strategy-access';
import '../black-galaxy-trade.css';
import '../range-galaxy-trade.css';
const ScannerSimulator = lazy(() => import('./ScannerSimulator'));
const RangeGalaxyTrade = lazy(() => import('./RangeGalaxyTrade'));

export const tradePrice = (value) => Number.isFinite(Number(value)) && value != null ? Number(value).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : '—';
const moment = (value) => value ? new Date(value).toLocaleString('es-CO', { timeZone: 'America/Bogota', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
export function TradeLevels({ trade }) {
  return <div className="bgt-levels">{(trade.strategy === 'RANGE777' ? [['Entrada', trade.entry], ['SL actual', trade.sl]] : [['Entrada', trade.entry], ['SL', trade.sl], ['TP1', trade.tp1], ['TP2', trade.tp2], ['TP3', trade.tp3]]).map(([name, value], index) => <div className={index === 1 ? 'risk' : index > 1 ? 'target' : 'entry'} key={name}><span><span className="bgt-level-symbol" aria-hidden="true">{levelSymbol(index === 0 ? 'entry' : index === 1 ? 'sl' : name, Boolean(trade[`hit${index - 1}`]))}</span>{name}{index > 1 && <span className="bgt-sr-only">{trade[`hit${index - 1}`] ? ' alcanzado' : ' pendiente'}</span>}</span><strong>{tradePrice(value)}</strong></div>)}</div>;
}
export function ScannerNotice({ notice, onOpen, onClose }) {
  const { trade: levels } = parseScannerNotice(notice);
  return <aside className="bgt-notice" role="status" aria-live="polite"><div className="bgt-notice-head"><img className="bgt-notice-logo" src={`${import.meta.env.BASE_URL}galaxy-notification.png`} alt="Galaxy" /><div><small>BLACK GALAXY TRADE</small><strong>{scannerNoticeTitle(notice)}</strong></div><button className="icon-button" onClick={onClose} aria-label="Cerrar aviso"><X /></button></div><TradeLevels trade={levels} /><button className="bgt-open" onClick={onOpen}>Ver señal e historial <ArrowUpRight size={16} /></button></aside>;
}
export function ScannerNotificationLabel({ notice }) {
  const { event } = parseScannerNotice(notice);
  if (!event) return scannerNoticeTitle(notice);
  return <><span className={`bgt-badge ${eventTone(event)}`}>{event}</span> {String(scannerNoticeTitle(notice)).replace(/^(?:🔵|🔴|✅)?\s*(?:BUY|SELL|TP[123]|SL)\s*(?:·\s*)?/u, '')}</>;
}

function QuoteStatus({ data, loading, unavailable }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const update = () => { if (!document.hidden) setNow(Date.now()); };
    const timer = setInterval(update, 1000); document.addEventListener('visibilitychange', update);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, []);
  const quote = quotePresentation(data, now), fresh = quote.recent && !unavailable;
  return <><div className="bgt-status"><span className={fresh ? 'live' : ''}><i />{loading ? 'Conectando' : unavailable ? 'Sin conexión' : quote.status}</span><span>XAUUSD · 5 minutos</span>{data?.price != null && <strong>{tradePrice(data.price)} <small>cotización</small></strong>}</div>
    <div className={`bgt-quote-details ${fresh ? '' : 'delayed'}`}><span>{quote.source}</span><span>{quote.ageSeconds == null ? 'Sin actualización recibida' : `Actualización hace ${quote.ageSeconds} s · ${new Date(Number(data.lastQuoteAt)).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}</span><small>Feed distinto de OANDA. La hora corresponde a la actualización informada por Gold API.</small></div></>;
}

export default function BlackGalaxyTrade({ toast, user }) {
  const [strategy,setStrategy]=useState(()=>['aurum','range777'].includes(new URLSearchParams(location.search).get('strategy'))?'RANGE777':'OPUS');
  const { access, error: accessError } = useTradeStrategyAccess();
  const selectedStrategy = availableTradeStrategy(strategy, access);
  const [data, setData] = useState(null); const [loading, setLoading] = useState(true); const [unavailable, setUnavailable] = useState(false);
  const [sound, setSound] = useState(scannerSoundEnabled); const [filter, setFilter] = useState('ALL');
  const [audioReady, setAudioReady] = useState(scannerAudioReady), [simulator, setSimulator] = useState(false);
  const [eventFilter, setEventFilter] = useState('ALL'), [sideFilter, setSideFilter] = useState('ALL');
  const [eventDay, setEventDay] = useState(''), [eventCount, setEventCount] = useState(12);
  const closeSimulator = useCallback(() => setSimulator(false), []);
  useEffect(()=>{const select=(event)=>{setStrategy(event.detail==='RANGE777'?'RANGE777':'OPUS');setSimulator(false);};window.addEventListener('galaxy:scanner-strategy',select);return()=>window.removeEventListener('galaxy:scanner-strategy',select);},[]);
  const [telegram, setTelegram] = useState(() => new URLSearchParams(location.search).get('telegram') === '1');
  const closeTelegram = useCallback(() => { setTelegram(false); const url = new URL(location.href); if (url.searchParams.has('telegram')) { url.searchParams.delete('telegram'); window.history.replaceState(null, '', url); } }, []);
  useEffect(() => {
    if(selectedStrategy!=='OPUS')return;
    const watcher = watchVisibleResource({ load: () => api.getBlackGalaxyTrade(),
      onData: (result) => { setData(result); setUnavailable(false); setLoading(false); },
      onError: () => { setUnavailable(true); setLoading(false); } });
    window.addEventListener('galaxy:scanner-update', watcher.refresh);
    return () => { watcher.stop(); window.removeEventListener('galaxy:scanner-update', watcher.refresh); };
  }, [selectedStrategy]);
  useEffect(() => {
    if (!access) return;
    setSimulator(false);
    if (!selectedStrategy) return;
    setStrategy(selectedStrategy);
    const url = new URL(location.href);
    if (selectedStrategy === 'RANGE777') url.searchParams.set('strategy', 'aurum'); else url.searchParams.delete('strategy');
    window.history.replaceState(null, '', url);
  }, [selectedStrategy, access?.OPUS, access?.RANGE777]);
  useEffect(() => {
    const update = () => { setSound(scannerSoundEnabled()); setAudioReady(scannerAudioReady()); };
    window.addEventListener('galaxy:scanner-audio', update); window.addEventListener('storage', update);
    return () => { window.removeEventListener('galaxy:scanner-audio', update); window.removeEventListener('storage', update); };
  }, []);
  const toggleSound = async () => { try { setSound(await setScannerSound(!sound || !audioReady)); setAudioReady(scannerAudioReady()); } catch (error) { toast(error.message, 'error'); } };
  const wins = Number(data?.wins || 0), losses = Number(data?.losses || 0);
  const rate = wins + losses ? wins * 100 / (wins + losses) : null;
  const recent = data?.trades || []; const latest = recent[0];
  const history = recent.filter((trade) => filter === 'ALL' || trade.outcome === filter);
  const events = (data?.events || []).filter((event) => {
    const kind = event.type === 'SIGNAL' ? event.payload.side : event.type;
    const day = new Date(event.at).toLocaleDateString('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' });
    return (eventFilter === 'ALL' || kind === eventFilter) && (sideFilter === 'ALL' || event.payload.side === sideFilter) && (!eventDay || day === eventDay);
  });
  useEffect(() => setEventCount(12), [eventFilter, sideFilter, eventDay]);
  return <section className="bgt-page">
    <header className="bgt-header"><div><p className="bgt-eyebrow">POWER ELITE · XAUUSD</p><h1>Black Galaxy <em>Trade</em></h1><p>Señales, objetivos y resultados en un solo lugar.</p></div><div className="bgt-audio-controls"><button className="bgt-telegram-link" onClick={() => setTelegram(true)}><Send size={16} />Telegram privado</button><button className={`bgt-sound ${sound && audioReady ? 'enabled' : ''}`} onClick={toggleSound} aria-label={sound && audioReady ? 'Silenciar avisos' : 'Activar y probar sonido'}>{sound ? <Volume2 size={18} /> : <VolumeX size={18} />}{sound && audioReady ? 'Sonido activado' : 'Activar sonido'}</button>{sound && audioReady && <button className="bgt-audio-test" onClick={() => setScannerSound(true).catch((error) => toast(error.message, 'error'))}>Probar sonido</button>}</div></header>
    {user?.role === 'ADMIN' && user.email?.toLowerCase() === 'elkin56ty@gmail.com' && <TradeStrategyControls toast={toast} />}
    <div className="bgt-strategy-tabs" role="tablist" aria-label="Estrategia de Black Galaxy Trade">{[['OPUS','💎 Opus 5.5','Objetivos TP1 · TP2 · TP3'],['RANGE777','💠 Galaxy Aurum Bot','Precisión del oro · Gestión dinámica']].map(([key,label,detail])=><button role="tab" aria-selected={selectedStrategy===key} disabled={access?.[key]!==true} key={key} onClick={()=>{if(access?.[key]!==true)return;setStrategy(key);setSimulator(false);}}><strong>{label}<span>M5</span></strong><small>{!access?'Verificando acceso…':access[key]?detail:'🔒 Desactivada temporalmente'}</small></button>)}</div>
    {!selectedStrategy?<div className="bgt-empty" role="status"><ShieldCheck size={32}/><h2>{accessError?'No se pudo verificar el acceso':!access?'Verificando estrategias':'Estrategias temporalmente desactivadas'}</h2><p>{accessError?'Comprueba tu conexión. El acceso se volverá a verificar automáticamente.':!access?'Un momento, estamos consultando las herramientas disponibles.':'La información estará disponible cuando se active una estrategia.'}</p></div>:selectedStrategy==='RANGE777'?<Suspense fallback={<p role="status">Preparando Galaxy Aurum Bot…</p>}><RangeGalaxyTrade QuoteStatus={QuoteStatus}/></Suspense>:<>
    <QuoteStatus data={data} loading={loading} unavailable={unavailable} />
    <div className="bgt-stats"><div className="bgt-effectiveness"><span>Efectividad</span><button className="bgt-sim-launch" onClick={() => setSimulator(true)} aria-label="Abrir simulador de resultados" title="Simular ganancias y explorar mejores períodos"><Calculator size={16} /><span>Simular</span></button><strong>{rate == null ? '—' : `${rate.toFixed(2)}%`}</strong><small>{wins + losses} señales con resultado</small></div><div className="profit"><span>Ganadas</span><strong>{wins}</strong><small>Al menos un TP antes de cerrar</small></div><div className="risk"><span>SL</span><strong>{losses}</strong><small>Stop inicial sin TP previo</small></div><div><span>Señales</span><strong>{data?.signals || 0}</strong><small>{data?.ignored || 0} sin resultado · excluidas</small></div></div>
    {latest ? <article className={`bgt-current ${latest.side === 'SELL' ? 'sell' : 'buy'}`}><div className="bgt-current-head"><div className="bgt-direction">{latest.side === 'BUY' ? <ArrowUpRight /> : <ArrowDownRight />}<div><small>ÚLTIMA SEÑAL · {moment(latest.detectedAt)}</small><h2>{latest.side} <span>XAUUSD</span></h2></div></div><span className={`bgt-outcome bgt-badge ${latest.outcome === 'WIN' ? 'win' : latest.outcome === 'SL' ? 'loss' : latest.outcome === 'IGNORED' ? 'neutral' : 'pending'}`}>{latest.status === 'OPEN' ? 'En seguimiento' : latest.outcome === 'WIN' ? 'Ganada' : latest.outcome === 'SL' ? 'SL tocado' : 'Sin resultado'}</span></div><TradeLevels trade={latest} /><footer><span><ShieldCheck size={14} /> Entrada y niveles fijos</span><span>R:R hasta TP3 <strong>{latest.rewardRatio ? `1:${latest.rewardRatio.toFixed(2)}` : '—'}</strong></span></footer></article> : <div className="bgt-empty"><Crosshair size={32} /><h2>{loading ? 'Cargando señales' : 'Esperando la primera señal'}</h2><p>{unavailable || !data?.enabled ? 'La recepción de señales todavía no está activada.' : 'El scanner analiza XAUUSD. La próxima señal aparecerá aquí.'}</p></div>}
    <div className="bgt-history-head"><div><p className="bgt-eyebrow">TU REGISTRO</p><h2>Historial de operaciones</h2><small className="bgt-history-scope">Últimas {recent.length} operaciones · totales globales arriba</small></div><div className="bgt-filters" role="group" aria-label="Filtrar operaciones">{[['ALL', 'Todas'], ['WIN', 'Ganadas'], ['SL', 'SL'], ['IGNORED', 'Excluidas']].map(([value, label]) => <button aria-pressed={filter === value} className={filter === value ? 'active' : ''} key={value} onClick={() => setFilter(value)}>{label}</button>)}</div></div>
    <div className="bgt-history">{history.map((trade) => <article className={`bgt-trade-${trade.outcome === 'WIN' ? 'win' : trade.outcome === 'SL' ? 'loss' : trade.outcome === 'IGNORED' ? 'neutral' : 'open'}`} key={trade.key}><div className="bgt-history-title"><strong className={`bgt-badge ${eventTone(trade.side)}`}>{trade.side} XAUUSD</strong><time>{moment(trade.detectedAt)}</time><span className={`bgt-badge ${trade.outcome === 'WIN' ? 'win' : trade.outcome === 'SL' ? 'loss' : trade.outcome === 'IGNORED' ? 'neutral' : 'pending'}`}>{trade.status === 'OPEN' ? 'En seguimiento' : trade.outcome === 'WIN' ? 'Ganada' : trade.outcome === 'SL' ? 'SL' : 'Sin resultado'}</span></div><TradeLevels trade={trade} /></article>)}{!history.length && <p className="bgt-no-history">Aún no hay operaciones en esta categoría.</p>}</div>
    <div className="bgt-events"><div className="bgt-history-head"><div><p className="bgt-eyebrow">CENTRO DE AVISOS</p><h2>Historial de notificaciones</h2><small className="bgt-history-scope">Filtra los últimos {data?.events?.length || 0} eventos registrados</small></div><span className="bgt-event-count">{events.length} avisos</span></div>
      <div className="bgt-event-filters"><div className="bgt-filters" role="group" aria-label="Tipo de aviso">{['ALL', 'BUY', 'SELL', 'TP1', 'TP2', 'TP3', 'SL'].map((value) => <button key={value} aria-pressed={eventFilter === value} className={eventFilter === value ? 'active' : ''} onClick={() => setEventFilter(value)}>{value === 'ALL' ? 'Todos' : value}</button>)}</div><label>Dirección<select value={sideFilter} onChange={(e) => setSideFilter(e.target.value)}><option value="ALL">BUY + SELL</option><option>BUY</option><option>SELL</option></select></label><label>Día en Colombia<input type="date" value={eventDay} onChange={(e) => setEventDay(e.target.value)} /></label>{(eventFilter !== 'ALL' || sideFilter !== 'ALL' || eventDay) && <button className="bgt-clear-filters" onClick={() => { setEventFilter('ALL'); setSideFilter('ALL'); setEventDay(''); }}>Limpiar</button>}</div>
      <div className="bgt-event-list">{events.slice(0, eventCount).map((event) => { const kind = event.type === 'SIGNAL' ? event.payload.side : event.type; return <div key={event.id}><span className={`bgt-badge ${eventTone(kind)}`}>{kind}</span><strong>XAUUSD <small>{event.payload.side}</small></strong><span>{tradePrice(event.payload.eventPrice ?? event.payload.entry)}</span><time>{moment(event.at)}</time>{event.type === 'SL' && event.payload.outcome === 'WIN' && <small className="bgt-protected">Tras TP · sin descuento</small>}</div>; })}</div>
      {!events.length && <p className="bgt-no-history">No hay avisos que coincidan con estos filtros.</p>}{events.length > eventCount && <button className="bgt-load-more" onClick={() => setEventCount((n) => n + 12)}>Ver más avisos ({events.length - eventCount})</button>}
    </div>
    <p className="bgt-footnote"><RefreshCw size={13} /> Registro desde {moment(data?.startedAt)}. La efectividad usa ganadas ÷ (ganadas + SL); las señales abiertas y sin resultado quedan excluidas. Los precios se actualizan cada 30 segundos y pueden diferir de tu broker. El sonido con la app cerrada depende del dispositivo.</p>
    </>}
    {simulator && selectedStrategy==='OPUS' && <Suspense fallback={<div className="bgt-loading-simulator" role="status">Preparando simulador…</div>}><ScannerSimulator onClose={closeSimulator} revision={data?.statisticsVersion} /></Suspense>}
    {telegram && <TelegramAccess onClose={closeTelegram} />}
  </section>;
}
