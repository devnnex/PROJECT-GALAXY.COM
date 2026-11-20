import { lockAppScroll } from '../services/lock-app-scroll';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownRight, ArrowUpRight, CalendarDays, Calculator, ChevronDown, RefreshCw, Sparkles, X } from 'lucide-react';
import { api } from '../services/api';
import { simulateRecordedResults, summarizePeriods, usd } from '../services/scanner-analytics';
import { LiquidLotSlider, ProfitAmount } from './ScannerMotion';

const periodLabel = (value) => value?.day.length === 4 ? value.day : value ? new Date(`${value.day}${value.day.length === 7 ? '-01' : ''}T12:00:00Z`).toLocaleDateString('es-CO', value.day.length === 7
  ? { month: 'long', year: 'numeric', timeZone: 'America/Bogota' } : { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Bogota' }) : 'Sin resultados';

function signalRange(first, last) {
  if (!first) return 'Sin señales en este período';
  const format = (day, year = true) => new Date(`${day}T12:00:00Z`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}), timeZone: 'America/Bogota' });
  return first === last ? format(first) : `${format(first, first.slice(0, 4) !== last.slice(0, 4))} — ${format(last)}`;
}

function PeriodCard({ label, period, positive }) {
  return <article className={`bgt-period-card ${positive ? 'best' : 'worst'}`}>
    <span>{positive ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}{label}</span>
    <strong>{period ? `${period.rate.toFixed(2)}%` : '—'}</strong><p>{periodLabel(period)}</p>
    <small>{period ? `${period.wins} ganadas · ${period.losses} SL · ${period.count} resultados` : 'Se necesitan operaciones cerradas'}</small>
  </article>;
}

function ScenarioExplanation({ target, allocation }) {
  return <p className="bgt-model-note">
    {target !== 'all' ? `Una posición cierra en ${target.toUpperCase()} únicamente si ese objetivo fue registrado. Un SL sin TP previo se descuenta; un SL después de otro TP se excluye de este escenario sin descuento. Las señales abiertas que aún no llegan quedan pendientes; las cerradas sin llegar ni tocar SL se excluyen.`
      : allocation === 'single' ? 'Una posición: acredita solo el TP más alto por señal, sin duplicar objetivos anteriores. A 0,10 lotes y 100 oz/lote, +$5 de precio = $50; TP3 a +$15 = $150. El acierto del registro usa solo operaciones cerradas.'
        : allocation === 'per-target' ? 'Tres posiciones: cada TP recibe el lotaje elegido. A 0,10 lotes y 100 oz/lote, +$5/10/15 suman $300, con 0,30 lotes expuestos.'
          : 'El lotaje total se divide en tres partes iguales. A 0,10 lotes y 100 oz/lote, +$5/10/15 suman $100; el paso mínimo del broker puede requerir redondeo.'}
    {' '}Se conserva «SL tras TP sin descuento». Los días con señales cuentan fechas con actividad; no son necesariamente consecutivos. El contrato y los costes son editables; no se incluyen automáticamente spread, swap ni deslizamiento.
  </p>;
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
    const previous = document.activeElement, releaseScroll = lockAppScroll();
    dialog.current?.focus();
    const key = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const controls = [...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]')]
        .filter((element) => {
          if (!element.getClientRects().length) return false;
          for (let parent = element.parentElement; parent && parent !== dialog.current; parent = parent.parentElement) {
            if (parent.tagName === 'DETAILS' && !parent.open && parent.firstElementChild !== element) return false;
          }
          return true;
        });
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { releaseScroll(); document.removeEventListener('keydown', key); previous?.focus(); };
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
  const rangeLabel = useMemo(() => signalRange(summary.firstSignalDay, summary.lastSignalDay), [summary.firstSignalDay, summary.lastSignalDay]);
  const result = simulateRecordedResults(summary, { lots, contractSize, allocation: target === 'all' ? allocation : 'single', costPerLot: cost });
  const periodRows = summary[periodView];
  const scenarioName = target === 'all' ? allocation === 'single' ? 'Mejor TP por señal' : allocation === 'per-target' ? 'Una posición por TP' : 'Cierres en tres partes' : `Salida en ${target.toUpperCase()}`;

  const resultPanel = invalidDates ? <p className="bgt-sim-error" role="alert">La fecha inicial debe ser anterior o igual a la final.</p>
    : !summary.available ? <p className="bgt-sim-error" role="alert">Los escenarios por TP todavía no están disponibles en el servidor. Reintenta cuando finalice la actualización.</p>
      : !result ? <p className="bgt-sim-error" role="alert">Introduce un lotaje y contrato positivos, y costes válidos.</p>
        : <div className={`bgt-sim-result bgt-profit-hero ${result.net < 0 ? 'negative' : ''}`} aria-live="polite" aria-atomic="true">
          <span className="bgt-profit-state">{result.net > 0 ? <Sparkles size={13} /> : <Calculator size={13} />}{result.net > 0 ? 'PROFIT SIMULADO' : result.net < 0 ? 'RESULTADO NEGATIVO' : 'SIN VARIACIÓN'}</span>
          <ProfitAmount value={result.net} aria-label="Resultado con este lotaje" />
          <p className="bgt-profit-context"><span className="bgt-profit-days"><CalendarDays size={14} /><b>{summary.signalDays}</b> {summary.signalDays === 1 ? 'día con señales' : 'días con señales'}</span><span><b>{summary.signals}</b> {summary.signals === 1 ? 'operación analizada' : 'operaciones analizadas'}</span></p>
          <p className="bgt-profit-dates">{rangeLabel}</p>
          <p className="bgt-profit-scenario">{scenarioName} <i /> {result.exposure.toLocaleString('es-CO', { maximumFractionDigits: 4 })} lotes por señal</p>
          <details className="bgt-profit-detail"><summary>Ver TP, SL y costes <ChevronDown size={13} /></summary><div className="bgt-profit-breakdown"><span>TP registrados <b>{usd(result.gross)}</b></span><span>SL descontados <b>−{usd(result.losses)}</b></span><span>Costes estimados <b>−{usd(result.costs)}</b></span></div></details>
        </div>;

  return createPortal(<div className="bgt-simulator-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} tabIndex={-1} className="bgt-simulator" role="dialog" aria-modal="true" aria-labelledby="bgt-simulator-title">
      <header><div><p className="bgt-eyebrow"><Sparkles size={12} /> INTELIGENCIA DE RESULTADOS</p><h2 id="bgt-simulator-title">Tu escenario <em>Galaxy</em></h2><p>Elige tu salida. Explora tu escenario.</p></div><button className="icon-button" onClick={onClose} aria-label="Cerrar simulador"><X /></button></header>
      <div className="bgt-simulator-body">
        {error ? <div className="bgt-empty" role="alert"><p>{error}</p><button className="bgt-sound" onClick={() => setRetry((value) => value + 1)}><RefreshCw size={16} /> Reintentar</button></div> : !analytics ? <div className="bgt-empty" role="status">Consultando todo el historial…</div> : <>
          <fieldset className="bgt-exit-options"><legend>¿Dónde habrías salido?</legend><div>{[['all', 'Todos los TP', 'Mejor alcanzado'], ['tp1', 'Salir en TP1', 'Primer objetivo'], ['tp2', 'Salir en TP2', 'Segundo objetivo'], ['tp3', 'Salir en TP3', 'Tercer objetivo']].map(([value, label, detail]) => <label key={value} className={target === value ? 'selected' : ''}><input type="radio" name="scanner-exit-target" value={value} checked={target === value} onChange={() => setTarget(value)} /><span className="bgt-radio-dot" /><span><strong>{label}</strong><small>{detail}</small></span></label>)}</div></fieldset>

          <div className="bgt-lot-workbench bgt-profit-workbench">
            <div className="bgt-lot-heading"><label>Lotaje<input autoComplete="off" type="number" min="0.001" max="100" step="0.01" value={lots} onChange={(event) => setLots(event.target.value)} /></label><label>Rango de la barra<select aria-label="Rango de la barra" value={lotRange} onChange={(event) => setLotRange(event.target.value)}>{[1, 5, 10, 100].map((value) => <option value={value} key={value}>Hasta {value} {value === 1 ? 'lote' : 'lotes'}</option>)}</select></label></div>
            <LiquidLotSlider value={lots} max={lotRange} onChange={setLots} />
            <div className="bgt-lot-scale"><span>0,001 lotes</span><span>Arrastra para explorar</span><span>{lotRange} {Number(lotRange) === 1 ? 'lote' : 'lotes'}</span></div>
            {resultPanel}
            <p className="bgt-profit-assumption">Histórico simulado · SL tras TP sin descuento · no es saldo real ni garantía futura.</p>
          </div>

          {!invalidDates && result && <div className="bgt-sim-summary bgt-compact-summary"><span>{target === 'all' ? 'Efectividad' : `Acierto en ${target.toUpperCase()}`} <b>{summary.rate == null ? '—' : `${summary.rate.toFixed(2)}%`}</b></span><span>{target === 'all' ? 'Ganadas' : 'Salidas al TP'} <b>{summary.wins}</b></span><span>SL iniciales <b>{summary.losses}</b></span><span>Pendientes / excluidas <b>{summary.open + summary.ignored}</b></span></div>}

          <details className="bgt-sim-disclosure bgt-period-picker"><summary><span><CalendarDays size={15} /> Cambiar período</span><small>{from || to ? 'Fechas seleccionadas' : year || 'Todo el historial'}</small><ChevronDown size={15} /></summary><div className="bgt-sim-controls bgt-period-controls"><label>Año<select value={year} onChange={(event) => setYear(event.target.value)}><option value="">Todos los años</option>{years.map((value) => <option key={value}>{value}</option>)}</select></label><label>Desde<input type="date" max={to || undefined} value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>Hasta<input type="date" min={from || undefined} value={to} onChange={(event) => setTo(event.target.value)} /></label>{(year || from || to) && <button className="bgt-clear-filters" onClick={() => { setYear(''); setFrom(''); setTo(''); }}>Todo el historial</button>}</div></details>

          <details className="bgt-sim-disclosure bgt-sim-advanced"><summary><span><Calculator size={15} /> Cálculo y ajustes</span><small>Contrato · costes · reglas</small><ChevronDown size={15} /></summary><div className="bgt-sim-controls"><label>Onzas por lote<input type="number" min="0.001" max="10000" step="any" value={contractSize} onChange={(event) => setContractSize(event.target.value)} /></label><label>Coste USD / lote<input type="number" min="0" max="10000" step="0.01" value={cost} onChange={(event) => setCost(event.target.value)} /></label>{target === 'all' && <label className="bgt-allocation">Cálculo de objetivos<select value={allocation} onChange={(event) => setAllocation(event.target.value)}><option value="single">Una posición · TP más alto</option><option value="per-target">Una posición por cada TP</option><option value="split">Lotaje total ÷ 3 objetivos</option></select></label>}</div><ScenarioExplanation target={target} allocation={allocation} /></details>

          {!invalidDates && summary.available && <details className="bgt-sim-disclosure bgt-statistics-disclosure"><summary><span><Sparkles size={15} /> Estadísticas de acierto</span><small>Año · mes · día</small><ChevronDown size={15} /></summary><div className="bgt-statistics-content">
            <div className="bgt-period-heading"><div><p className="bgt-eyebrow">LECTURA DEL HISTORIAL</p><h3>Cuándo acertamos más</h3></div><small>Fecha de entrada · hora de Colombia</small></div>
            <p className="bgt-scenario-caption">{scenarioName} · mismos filtros del simulador</p><div className="bgt-period-grid"><PeriodCard label="Mejor año" period={summary.bestYear} positive /><PeriodCard label="Año con menor acierto" period={summary.worstYear} /><PeriodCard label="Mejor mes" period={summary.bestMonth} positive /><PeriodCard label="Mes con menor acierto" period={summary.worstMonth} /><PeriodCard label="Mejor día" period={summary.bestDay} positive /><PeriodCard label="Día con menor acierto" period={summary.worstDay} /></div>
            <p className="bgt-model-note">Solo se comparan períodos con resultados. En empates se prioriza la muestra más grande y después la fecha más antigua. Un 100% con una operación tiene menos evidencia que un período con muchas operaciones.</p>
            <label className="bgt-period-grouping">Comparar por<select aria-label="Agrupar estadísticas" value={periodView} onChange={(event) => setPeriodView(event.target.value)}><option value="monthly">Mes</option><option value="yearly">Año</option></select></label>
            <div className="bgt-month-table" tabIndex={0} aria-label={`Efectividad por ${periodView === 'yearly' ? 'año' : 'mes'}`}><table><thead><tr><th>{periodView === 'yearly' ? 'Año' : 'Mes'}</th><th>{target === 'all' ? 'Ganadas' : 'Objetivos'}</th><th>SL</th><th>Efectividad</th></tr></thead><tbody>{periodRows.map((period) => <tr key={period.day}><th>{periodLabel(period)}</th><td>{period.wins}</td><td>{period.losses}</td><td><div className="bgt-rate-bar"><i style={{ width: `${period.rate}%` }} /><span>{period.rate.toFixed(2)}%</span></div></td></tr>)}</tbody></table>{!periodRows.length && <p className="bgt-no-history">Aún no hay resultados evaluables en este período.</p>}</div>
          </div></details>}
          <footer className="bgt-model-note bgt-analysis-footer">Registro actualizado {analytics.updatedAt ? new Date(analytics.updatedAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : '—'}.</footer>
        </>}
      </div>
    </section>
  </div>, document.body);
}
