import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownRight, ArrowUpRight, Calculator, RefreshCw, Sparkles, X } from 'lucide-react';
import { api } from '../services/api';
import { simulateRecordedResults, summarizePeriods, usd } from '../services/scanner-analytics';

const periodLabel = (value) => value?.day.length === 4 ? value.day : value ? new Date(`${value.day}${value.day.length === 7 ? '-01' : ''}T12:00:00Z`).toLocaleDateString('es-CO', value.day.length === 7
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
  const [target, setTarget] = useState('all'), [lotRange, setLotRange] = useState('1');
  const [year, setYear] = useState(''), [periodView, setPeriodView] = useState('monthly');
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
  const years = useMemo(() => [...new Set((analytics?.days || []).map((day) => day.day.slice(0, 4)))].sort().reverse(), [analytics]);
  const summary = useMemo(() => summarizePeriods((analytics?.days || []).filter((day) => !year || day.day.startsWith(`${year}-`)), from, to, target), [analytics, from, to, target, year]);
  const result = simulateRecordedResults(summary, { lots, contractSize, allocation: target === 'all' ? allocation : 'single', costPerLot: cost });
  const periodRows = summary[periodView];
  const scenarioName = target === 'all' ? allocation === 'single' ? 'Mejor TP por señal' : allocation === 'per-target' ? 'Una posición por TP' : 'Cierres en tres partes' : `Salida en ${target.toUpperCase()}`;
  return createPortal(<div className="bgt-simulator-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} tabIndex={-1} className="bgt-simulator" role="dialog" aria-modal="true" aria-labelledby="bgt-simulator-title">
      <header><div><p className="bgt-eyebrow"><Sparkles size={12} /> INTELIGENCIA DE RESULTADOS</p><h2 id="bgt-simulator-title">Tu escenario <em>Galaxy</em></h2><p>Explora el valor teórico de las señales registradas.</p></div><button className="icon-button" onClick={onClose} aria-label="Cerrar simulador"><X /></button></header>
      <div className="bgt-simulator-body">
        {error ? <div className="bgt-empty" role="alert"><p>{error}</p><button className="bgt-sound" onClick={() => setRetry((n) => n + 1)}><RefreshCw size={16} /> Reintentar</button></div> : !analytics ? <div className="bgt-empty" role="status">Consultando todo el historial…</div> : <>
          <fieldset className="bgt-exit-options"><legend>¿Dónde habrías salido?</legend><p>Aplica la misma salida a todas las señales del período.</p><div>{[['all', 'Todos los TP', 'Mejor alcanzado'], ['tp1', 'Salir en TP1', 'Primer objetivo'], ['tp2', 'Salir en TP2', 'Segundo objetivo'], ['tp3', 'Salir en TP3', 'Tercer objetivo']].map(([value, label, detail]) => <label key={value} className={target === value ? 'selected' : ''}><input type="radio" name="scanner-exit-target" value={value} checked={target === value} onChange={() => setTarget(value)} /><span className="bgt-radio-dot" /><span><strong>{label}</strong><small>{detail}</small></span></label>)}</div></fieldset>
          <div className="bgt-lot-workbench"><div className="bgt-lot-heading"><label>Lotaje<input autoComplete="off" type="number" min="0.001" max="100" step="0.01" value={lots} onChange={(e) => setLots(e.target.value)} /></label><label>Rango de la barra<select aria-label="Rango de la barra" value={lotRange} onChange={(e) => setLotRange(e.target.value)}>{[1, 5, 10, 100].map((n) => <option value={n} key={n}>Hasta {n} {n === 1 ? 'lote' : 'lotes'}</option>)}</select></label></div>
            <input className="bgt-lot-slider" type="range" min="0.001" max={lotRange} step="0.001" value={Math.min(Number(lotRange), Math.max(0.001, Number(lots) || 0.001))} aria-label="Ajustar lotaje" aria-valuetext={`${lots} lotes`} style={{ '--lot-progress': `${Math.min(100, Math.max(0, (Number(lots) - 0.001) / (Number(lotRange) - 0.001) * 100)) || 0}%` }} onChange={(e) => setLots(e.target.value)} />
            <div className="bgt-lot-scale"><span>0,001 lotes</span><span>Arrastra para simular</span><span>{lotRange} {Number(lotRange) === 1 ? 'lote' : 'lotes'}</span></div><div className="bgt-lot-preview"><span>{scenarioName}</span><output aria-label="Resultado con este lotaje" aria-live="off">{invalidDates || !result ? '—' : usd(result.net)}</output></div><p>{result ? <><strong>{usd(Number(lots) * Number(contractSize) * 5)}</strong> por cada $5 de movimiento · contrato de {Number(contractSize).toLocaleString('es-CO')} oz/lote</> : 'Introduce un lotaje y un contrato válidos para calcular.'}</p>
          </div>
          <div className="bgt-sim-controls bgt-period-controls"><label>Año<select value={year} onChange={(e) => setYear(e.target.value)}><option value="">Todos los años</option>{years.map((value) => <option key={value}>{value}</option>)}</select></label><label>Desde<input type="date" max={to || undefined} value={from} onChange={(e) => setFrom(e.target.value)} /></label><label>Hasta<input type="date" min={from || undefined} value={to} onChange={(e) => setTo(e.target.value)} /></label>{(year || from || to) && <button className="bgt-clear-filters" onClick={() => { setYear(''); setFrom(''); setTo(''); }}>Todo el historial</button>}</div>
          <details className="bgt-sim-advanced"><summary>Ajustes de contrato y costes</summary><div className="bgt-sim-controls"><label>Onzas por lote<input type="number" min="0.001" max="10000" step="any" value={contractSize} onChange={(e) => setContractSize(e.target.value)} /></label><label>Coste USD / lote<input type="number" min="0" max="10000" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} /></label>{target === 'all' && <label className="bgt-allocation">Cálculo de objetivos<select value={allocation} onChange={(e) => setAllocation(e.target.value)}><option value="single">Una posición · TP más alto</option><option value="per-target">Una posición por cada TP</option><option value="split">Lotaje total ÷ 3 objetivos</option></select></label>}</div></details>
          {invalidDates ? <p className="bgt-sim-error" role="alert">La fecha inicial debe ser anterior o igual a la final.</p> : !summary.available ? <p className="bgt-sim-error" role="alert">Los escenarios por TP todavía no están disponibles en el servidor. Reintenta cuando finalice la actualización.</p> : !result ? <p className="bgt-sim-error" role="alert">Introduce un lotaje y contrato positivos, y costes válidos.</p> : <>
            <div className={`bgt-sim-result ${result.net < 0 ? 'negative' : ''}`} aria-live="polite" aria-atomic="true"><span><Calculator size={17} /> {scenarioName.toUpperCase()} · RESULTADO TEÓRICO</span><strong key={target}>{usd(result.net)}</strong><p>{summary.hits.reduce((sum, n) => sum + n, 0)} objetivos acreditados · {result.exposure.toLocaleString('es-CO', { maximumFractionDigits: 4 })} lotes por señal · {summary.signals} señales analizadas</p><div><span>Objetivos alcanzados <b>{usd(result.gross)}</b></span><span>SL descontados <b>−{usd(result.losses)}</b></span><span>Costes estimados <b>−{usd(result.costs)}</b></span></div></div>
            <div className="bgt-sim-summary"><span>{target === 'all' ? 'Efectividad del registro' : `Acierto en ${target.toUpperCase()}`} <b>{summary.rate == null ? '—' : `${summary.rate.toFixed(2)}%`}</b></span><span>{target === 'all' ? 'Ganadas cerradas' : 'Salidas al objetivo'} <b>{summary.wins}</b></span><span>SL iniciales <b>{summary.losses}</b></span><span>Pendientes / excluidas <b>{summary.open + summary.ignored}</b></span></div>
          </>}
          <p className="bgt-model-note">{target !== 'all' ? `Una posición cierra en ${target.toUpperCase()} únicamente si ese objetivo fue registrado. Si no llegó, no se inventa ese beneficio. Un SL sin TP previo se descuenta; un SL después de otro TP se excluye de este escenario sin descuento, según la regla del scanner. Las señales abiertas que aún no llegan quedan pendientes; las cerradas sin llegar ni tocar SL se excluyen.` : allocation === 'single' ? 'Una posición: acredita solo el TP más alto por señal, sin duplicar objetivos anteriores. A 0,10 lotes y 100 oz/lote, +$5 de precio = $50; TP3 a +$15 = $150. El acierto del registro usa solo ganadas y SL de operaciones cerradas.' : allocation === 'per-target' ? 'Tres posiciones: cada TP recibe el lotaje elegido. A 0,10 lotes y 100 oz/lote, +$5/10/15 suman $300, con 0,30 lotes expuestos.' : 'El lotaje total se divide en tres partes iguales. A 0,10 lotes y 100 oz/lote, +$5/10/15 suman $100; el paso mínimo del broker puede requerir redondeo.'} Se conserva «SL tras TP sin descuento». Es una simulación del registro, no el saldo real de una cuenta ni una garantía futura. El contrato y los costes son editables; no se incluyen automáticamente spread, swap ni deslizamiento.</p>
          <div className="bgt-period-heading"><div><p className="bgt-eyebrow">LECTURA DEL HISTORIAL</p><h3>Cuándo acertamos más</h3></div><small>Fecha de entrada · hora de Colombia</small></div>
          {!invalidDates && summary.available && <><p className="bgt-scenario-caption">{scenarioName} · mismos filtros del simulador</p><div className="bgt-period-grid"><PeriodCard label="Mejor año" period={summary.bestYear} positive /><PeriodCard label="Año con menor acierto" period={summary.worstYear} /><PeriodCard label="Mejor mes" period={summary.bestMonth} positive /><PeriodCard label="Mes con menor acierto" period={summary.worstMonth} /><PeriodCard label="Mejor día" period={summary.bestDay} positive /><PeriodCard label="Día con menor acierto" period={summary.worstDay} /></div>
            <p className="bgt-model-note">Se comparan solo períodos con ganadas o SL. En empates se prioriza la muestra más grande y después la fecha más antigua. Un 100% con una operación tiene menos evidencia que un período con muchas operaciones.</p>
            <label className="bgt-period-grouping">Comparar por<select aria-label="Agrupar estadísticas" value={periodView} onChange={(e) => setPeriodView(e.target.value)}><option value="monthly">Mes</option><option value="yearly">Año</option></select></label>
            <div className="bgt-month-table" tabIndex={0} aria-label={`Efectividad por ${periodView === 'yearly' ? 'año' : 'mes'}`}><table><thead><tr><th>{periodView === 'yearly' ? 'Año' : 'Mes'}</th><th>{target === 'all' ? 'Ganadas' : 'Objetivos'}</th><th>SL</th><th>Efectividad</th></tr></thead><tbody>{periodRows.map((period) => <tr key={period.day}><th>{periodLabel(period)}</th><td>{period.wins}</td><td>{period.losses}</td><td><div className="bgt-rate-bar"><i style={{ width: `${period.rate}%` }} /><span>{period.rate.toFixed(2)}%</span></div></td></tr>)}</tbody></table>{!periodRows.length && <p className="bgt-no-history">Aún no hay resultados evaluables en este período.</p>}</div>
          </>}
          <footer className="bgt-model-note">Registro completo del servidor · actualizado {analytics.updatedAt ? new Date(analytics.updatedAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : '—'}. Cambiar lotaje y fechas se calcula en tu dispositivo, sin nuevas consultas.</footer>
        </>}
      </div>
    </section>
  </div>, document.body);
}
