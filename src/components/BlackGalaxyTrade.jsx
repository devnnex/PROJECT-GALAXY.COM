import { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, BellRing, Check, Crosshair, RefreshCw, ShieldCheck, Volume2, VolumeX, X } from 'lucide-react';
import { api } from '../services/api';
import { scannerSoundEnabled, setScannerSound } from '../services/scanner-audio';
import '../black-galaxy-trade.css';

export const tradePrice = (value) => Number.isFinite(Number(value)) && value != null ? Number(value).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : '—';
const moment = (value) => value ? new Date(value).toLocaleString('es-CO', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
export function TradeLevels({ trade }) {
  return <div className="bgt-levels">{[['Entrada', trade.entry], ['SL', trade.sl], ['TP1', trade.tp1], ['TP2', trade.tp2], ['TP3', trade.tp3]].map(([name, value], index) => <div className={index === 1 ? 'risk' : index > 1 ? 'target' : 'entry'} key={name}><span>{name}{index > 1 && trade[`hit${index - 1}`] && <Check size={12} />}</span><strong>{tradePrice(value)}</strong></div>)}</div>;
}
export function ScannerNotice({ notice, onOpen, onClose }) {
  const levels = Object.fromEntries(String(notice.body || '').split('|').map((part) => part.trim().match(/^(Entrada|SL|TP1|TP2|TP3)\s+([\d.]+)$/)).filter(Boolean).map(([, label, value]) => [label === 'Entrada' ? 'entry' : label.toLowerCase(), Number(value)]));
  return <aside className="bgt-notice" role="status" aria-live="polite"><div className="bgt-notice-head"><BellRing size={19} /><div><small>BLACK GALAXY TRADE</small><strong>{notice.title}</strong></div><button className="icon-button" onClick={onClose} aria-label="Cerrar aviso"><X /></button></div><TradeLevels trade={levels} /><button className="bgt-open" onClick={onOpen}>Ver señal e historial <ArrowUpRight size={16} /></button></aside>;
}

export default function BlackGalaxyTrade({ toast }) {
  const [data, setData] = useState(null); const [loading, setLoading] = useState(true); const [unavailable, setUnavailable] = useState(false);
  const [sound, setSound] = useState(scannerSoundEnabled); const [filter, setFilter] = useState('ALL');
  useEffect(() => {
    let active = true; let busy = false;
    const refresh = async () => {
      if (busy) return; busy = true;
      try { const result = await api.getBlackGalaxyTrade(); if (active) { setData(result); setUnavailable(false); } }
      catch { if (active) setUnavailable(true); }
      finally { busy = false; if (active) setLoading(false); }
    };
    refresh(); const timer = setInterval(refresh, 15_000);
    const wake = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', wake);
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', wake); };
  }, []);
  const toggleSound = async () => { try { setSound(await setScannerSound(!sound)); } catch (error) { toast(error.message, 'error'); } };
  const wins = Number(data?.wins || 0), losses = Number(data?.losses || 0);
  const rate = wins + losses ? wins * 100 / (wins + losses) : null;
  const recent = data?.trades || []; const latest = recent[0];
  const fresh = data?.enabled && data?.lastQuoteAt && Date.now() - Number(data.lastQuoteAt) < 120_000;
  const status = loading ? 'Conectando' : unavailable || !data?.enabled ? 'Pendiente de activación' : !fresh ? 'Sin precios recientes' : data.ready ? 'En vivo' : 'Preparando histórico';
  const history = recent.filter((trade) => filter === 'ALL' || trade.outcome === filter);
  return <section className="bgt-page">
    <header className="bgt-header"><div><p className="bgt-eyebrow">POWER ELITE · XAUUSD</p><h1>Black Galaxy <em>Trade</em></h1><p>Señales, objetivos y resultados en un solo lugar.</p></div><button className={`bgt-sound ${sound ? 'enabled' : ''}`} onClick={toggleSound}>{sound ? <Volume2 size={18} /> : <VolumeX size={18} />}{sound ? 'Sonido activado' : 'Activar sonido'}</button></header>
    <div className="bgt-status"><span className={fresh ? 'live' : ''}><i />{status}</span><span>XAUUSD · 5 minutos</span>{fresh && <strong>{tradePrice(data.price)}</strong>}</div>
    <div className="bgt-stats"><div><span>Efectividad</span><strong>{rate == null ? '—' : `${rate.toFixed(2)}%`}</strong><small>{wins + losses} señales con resultado</small></div><div className="profit"><span>Ganadas</span><strong>{wins}</strong><small>Al menos un TP antes de cerrar</small></div><div className="risk"><span>SL</span><strong>{losses}</strong><small>Stop inicial sin TP previo</small></div><div><span>Señales</span><strong>{data?.signals || 0}</strong><small>{data?.ignored || 0} sin resultado · excluidas</small></div></div>
    {latest ? <article className={`bgt-current ${latest.side === 'SELL' ? 'sell' : 'buy'}`}><div className="bgt-current-head"><div className="bgt-direction">{latest.side === 'BUY' ? <ArrowUpRight /> : <ArrowDownRight />}<div><small>ÚLTIMA SEÑAL · {moment(latest.detectedAt)}</small><h2>{latest.side} <span>XAUUSD</span></h2></div></div><span className="bgt-outcome">{latest.status === 'OPEN' ? 'En seguimiento' : latest.outcome === 'WIN' ? 'Ganada' : latest.outcome === 'SL' ? 'SL tocado' : 'Sin resultado'}</span></div><TradeLevels trade={latest} /><footer><span><ShieldCheck size={14} /> Entrada y niveles fijos</span><span>R:R hasta TP3 <strong>{latest.rewardRatio ? `1:${latest.rewardRatio.toFixed(2)}` : '—'}</strong></span></footer></article> : <div className="bgt-empty"><Crosshair size={32} /><h2>{loading ? 'Cargando señales' : 'Esperando la primera señal'}</h2><p>{unavailable || !data?.enabled ? 'La recepción de señales todavía no está activada.' : 'El scanner analiza XAUUSD. La próxima señal aparecerá aquí.'}</p></div>}
    <div className="bgt-history-head"><div><p className="bgt-eyebrow">TU REGISTRO</p><h2>Historial de operaciones</h2></div><div className="bgt-filters">{[['ALL', 'Todas'], ['WIN', 'Ganadas'], ['SL', 'SL']].map(([value, label]) => <button className={filter === value ? 'active' : ''} key={value} onClick={() => setFilter(value)}>{label}</button>)}</div></div>
    <div className="bgt-history">{history.map((trade) => <article key={trade.key}><div className="bgt-history-title"><strong className={trade.side === 'BUY' ? 'profit' : 'risk'}>{trade.side} XAUUSD</strong><time>{moment(trade.detectedAt)}</time><span className={trade.outcome === 'WIN' ? 'profit' : trade.outcome === 'SL' ? 'risk' : ''}>{trade.status === 'OPEN' ? 'En seguimiento' : trade.outcome === 'WIN' ? 'Ganada' : trade.outcome === 'SL' ? 'SL' : 'Sin resultado'}</span></div><TradeLevels trade={trade} /></article>)}{!history.length && <p className="bgt-no-history">Aún no hay operaciones en esta categoría.</p>}</div>
    {data?.events?.length > 0 && <div className="bgt-events"><h2>Últimos avisos</h2>{data.events.slice(0, 12).map((event) => <div key={event.id}><span className={event.type === 'SL' ? 'risk' : 'profit'}>{event.type === 'SIGNAL' ? event.payload.side : event.type}</span><strong>XAUUSD</strong><span>{tradePrice(event.payload.eventPrice ?? event.payload.entry)}</span><time>{moment(event.at)}</time></div>)}</div>}
    <p className="bgt-footnote"><RefreshCw size={13} /> Registro desde {moment(data?.startedAt)}. La efectividad usa ganadas ÷ (ganadas + SL); las señales abiertas y sin resultado quedan excluidas. Los precios se actualizan cada 30 segundos y pueden diferir de tu broker. El sonido con la app cerrada depende del dispositivo.</p>
  </section>;
}
