import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownRight, ArrowUpRight, Calculator, RefreshCw, Sparkles, X } from 'lucide-react';
import { api } from '../services/api';
import { simulateRecordedResults, summarizePeriods, usd } from '../services/scanner-analytics';

const periodLabel = (value) => value ? new Date(`${value.day}${value.day.length === 7 ? '-01' : ''}T12:00:00Z`).toLocaleDateString('es-CO', value.day.length === 7
  ? { month: 'long', year: 'numeric', timeZone: 'America/Bogota' } : { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Bogota' }) : 'Sin resultados';

function PeriodCard({ label, period, positive }) {
  return <article className={`bgt-period-card ${positive ? 'best' : 'worst'}`}>
    <span>{positive ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}{label}</span>
    <strong>{period ? `${period.rate.toFixed(2)}%` : '—'}</strong><p>{periodLabel(period)}</p>
    <small>{period ? `${period.wins} ganadas · ${period.losses} SL · ${period.count} resultados` : 'Se necesitan operaciones cerradas'}</small>
  </article>;
}

export default function ScannerSimulator({ onClose, revision }) {
  const [analytics, setAnalytics] = useState(null), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [lots, setLots] = useState('0.10'), [contractSize, setContractSize] = useState('100');
  const [allocation, setAllocation] = useState('single'), [cost, setCost] = useState('0');
  const [from, setFrom] = useState(''), [to, setTo] = useState('');
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; dialog.current?.focus();
    const key = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const controls = [...dialog.current.querySelectorAll('button:not(:disabled),input,select,[tabindex="0"]')];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', key); previous?.focus(); };
  }, [onClose]);
  useEffect(() => {
    let active = true;
    setError('');
    api.getScannerAnalytics().then((value) => { if (active) setAnalytics(value); })
      .catch(() => { if (active) setError('No pudimos consultar el registro completo. Reintenta en unos segundos.'); });
    return () => { active = false; };
  }, [retry, revision]);
  const invalidDates = Boolean(from && to && from > to);
  const summary = useMemo(() => summarizePeriods(analytics?.days || [], from, to), [analytics, from, to]);
  const result = simulateRecordedResults(summary, { lots, contractSize, allocation, costPerLot: cost });
  return createPortal(<div className="bgt-simulator-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} tabIndex={-1} className="bgt-simulator" role="dialog" aria-modal="true" aria-labelledby="bgt-simulator-title">
      <header><div><p className="bgt-eyebrow"><Sparkles size={12} /> INTELIGENCIA DE RESULTADOS</p><h2 id="bgt-simulator-title">Tu escenario <em>Galaxy</em></h2><p>Explora el valor teórico de las señales registradas.</p></div><button className="icon-button" onClick={onClose} aria-label="Cerrar simulador"><X /></button></header>
      <div className="bgt-simulator-body">
        {error ? <div className="bgt-empty" role="alert"><p>{error}</p><button className="bgt-sound" onClick={() => setRetry((n) => n + 1)}><RefreshCw size={16} /> Reintentar</button></div> : !analytics ? <div className="bgt-empty" role="status">Consultando todo el historial…</div> : <>
          <div className="bgt-sim-controls"><label>Lotaje<input autoComplete="off" type="number" min="0.001" max="100" step="0.01" value={lots} onChange={(e) => setLots(e.target.value)} /></label><label>Onzas por lote<input type="number" min="0.001" max="10000" step="any" value={contractSize} onChange={(e) => setContractSize(e.target.value)} /></label>
            <label className="bgt-allocation">Cálculo de objetivos<select value={allocation} onChange={(e) => setAllocation(e.target.value)}><option value="single">Una posición · TP más alto</option><option value="per-target">Una posición por cada TP</option><option value="split">Lotaje total ÷ 3 objetivos</option></select></label>
            <label>Coste USD / lote<input type="number" min="0" max="10000" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} /></label><label>Desde<input type="date" max={to || undefined} value={from} onChange={(e) => setFrom(e.target.value)} /></label><label>Hasta<input type="date" min={from || undefined} value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
          {invalidDates ? <p className="bgt-sim-error" role="alert">La fecha inicial debe ser anterior o igual a la final.</p> : !result ? <p className="bgt-sim-error" role="alert">Introduce un lotaje y contrato positivos, y costes válidos.</p> : <>
            <div className={`bgt-sim-result ${result.net < 0 ? 'negative' : ''}`} aria-live="polite"><span><Calculator size={17} /> RESULTADO TEÓRICO DEL REGISTRO</span><strong key={result.net}>{usd(result.net)}</strong><p>{summary.hits.reduce((sum, n) => sum + n, 0)} TP registrados · {result.exposure.toLocaleString('es-CO', { maximumFractionDigits: 4 })} lotes de exposición por señal</p><div><span>TP registrados <b>{usd(result.gross)}</b></span><span>SL iniciales <b>−{usd(result.losses)}</b></span><span>Costes estimados <b>−{usd(result.costs)}</b></span></div></div>
            <div className="bgt-sim-summary"><span>Efectividad <b>{summary.rate == null ? '—' : `${summary.rate.toFixed(2)}%`}</b></span><span>Ganadas <b>{summary.wins}</b></span><span>SL <b>{summary.losses}</b></span><span>Abiertas / excluidas <b>{summary.open + summary.ignored}</b></span></div>
          </>}
          <p className="bgt-model-note">{allocation === 'single' ? 'Una posición: acredita solo la distancia al TP más alto de cada señal, sin volver a sumar TP anteriores. A 0,10 lotes y 100 oz/lote: +$5 de precio = $50; TP3 a +$15 = $150.' : allocation === 'per-target' ? 'Tres posiciones: cada objetivo recibe el lotaje elegido. A 0,10 y 100 oz/lote, TP1/2/3 a +$5/10/15 suman $50 + $100 + $150 = $300, con 0,30 lotes expuestos.' : 'Reparte el lotaje total en tres partes iguales. A 0,10 y 100 oz/lote, TP1/2/3 a +$5/10/15 suman $100. El paso mínimo de tu broker puede requerir redondeo.'} Usa los TP alcanzados, incluidos los de señales aún abiertas, y descuenta SL iniciales sin TP previo. Conserva la regla de la herramienta: «SL tras TP sin descuento»; por eso no equivale al saldo real de una cuenta. Sin resultado no aporta beneficio ni pérdida. Las estadísticas de acierto solo usan operaciones cerradas. Los 100 oz/lote son editables. No incluye spread, swap ni deslizamiento; puedes estimar costes por lote. Es una simulación histórica, no una garantía futura.</p>
          <div className="bgt-period-heading"><div><p className="bgt-eyebrow">LECTURA DEL HISTORIAL</p><h3>Cuándo acertamos más</h3></div><small>Fecha de entrada · hora de Colombia</small></div>
          {!invalidDates && <><div className="bgt-period-grid"><PeriodCard label="Mejor mes" period={summary.bestMonth} positive /><PeriodCard label="Mes con menor acierto" period={summary.worstMonth} /><PeriodCard label="Mejor día" period={summary.bestDay} positive /><PeriodCard label="Día con menor acierto" period={summary.worstDay} /></div>
            <p className="bgt-model-note">Se comparan solo períodos con ganadas o SL. En empates se prioriza la muestra más grande y después la fecha más antigua. Un 100% con una operación tiene menos evidencia que un período con muchas operaciones.</p>
            <div className="bgt-month-table" tabIndex={0} aria-label="Efectividad por mes"><table><thead><tr><th>Mes</th><th>Ganadas</th><th>SL</th><th>Efectividad</th></tr></thead><tbody>{summary.monthly.map((month) => <tr key={month.day}><th>{periodLabel(month)}</th><td>{month.wins}</td><td>{month.losses}</td><td><div className="bgt-rate-bar"><i style={{ width: `${month.rate}%` }} /><span>{month.rate.toFixed(2)}%</span></div></td></tr>)}</tbody></table>{!summary.monthly.length && <p className="bgt-no-history">Aún no hay resultados cerrados en este período.</p>}</div>
          </>}
          <footer className="bgt-model-note">Registro completo del servidor · actualizado {analytics.updatedAt ? new Date(analytics.updatedAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : '—'}. Cambiar lotaje y fechas se calcula en tu dispositivo, sin nuevas consultas.</footer>
        </>}
      </div>
    </section>
  </div>, document.body);
}
