import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, CircleDollarSign, Scale, ShieldCheck, Trash2, TrendingUp, Users, X } from 'lucide-react';
import { api } from '../services/api';
import { parsePnlAmount } from '../pnl-amount';

const WEEKDAYS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];
const pad = (value) => String(value).padStart(2, '0');
const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const monthKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-01`;
const parseDateKey = (value) => { const [year, month, day] = String(value).split('-').map(Number); return new Date(year, month - 1, day); };
const money = (value, sign = false) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, signDisplay: sign ? 'always' : 'auto' }).format(Number(value || 0));
const monthLabel = (date) => new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(date);
const shortDate = (date) => new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' }).format(date);

function calendarDays(month) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => { const day = new Date(first); day.setDate(first.getDate() + index); return day; });
}

function EntryModal({ date, entry, busy, onClose, onSave, onDelete }) {
  const [amount, setAmount] = useState(entry ? String(Number(entry.amountUsd)) : '');
  const [invalid, setInvalid] = useState(false);
  const day = parseDateKey(date);
  const submit = (event) => { event.preventDefault(); const parsed = parsePnlAmount(amount); if (parsed === null) { setInvalid(true); return; } onSave(parsed); };
  return <div className="modal-backdrop pnl-modal-backdrop" onMouseDown={onClose}><form className="pnl-entry-modal glass" role="dialog" aria-modal="true" aria-labelledby="pnl-entry-title" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
    <header><span className="pnl-entry-icon"><CircleDollarSign /></span><button className="icon-button" type="button" aria-label="Cerrar" onClick={onClose}><X /></button></header>
    <p className="eyebrow">RESULTADO REAL DEL DÍA</p>
    <h2 id="pnl-entry-title">{new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }).format(day)}</h2>
    <label>Profit o pérdida en USD<div className="pnl-amount-field"><span>$</span><input autoFocus required type="text" inputMode="decimal" value={amount} onChange={(event) => { setAmount(event.target.value); setInvalid(false); }} placeholder="Ej. 125.50, 125,50 o -48,00" /></div><small>{invalid ? 'Escribe un importe válido con hasta dos decimales (punto o coma).' : 'Usa un valor positivo para ganancia y negativo para pérdida.'}</small></label>
    <div className="pnl-honesty-note"><ShieldCheck /><p><strong>Registro honesto</strong>Escribe el resultado real. Este calendario es privado y solo será útil si también registras cada pérdida.</p></div>
    <footer>{entry ? <button className="pnl-delete-button" type="button" disabled={busy} onClick={onDelete}><Trash2 /> Eliminar</button> : <span />}<div><button className="secondary-button" type="button" disabled={busy} onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy || amount === ''}><Check /> {busy ? 'Guardando…' : 'Guardar resultado'}</button></div></footer>
  </form></div>;
}

export default function ProfitCalendarPage({ user, toast }) {
  const now = new Date(); const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1); const today = dateKey(now);
  const [month, setMonth] = useState(currentMonth); const [entries, setEntries] = useState([]); const [history, setHistory] = useState([]);
  const [targetUserId, setTargetUserId] = useState(user.id); const [reviewUsers, setReviewUsers] = useState([]); const [canReview, setCanReview] = useState(false);
  const [viewingUser, setViewingUser] = useState({ id: user.id, name: user.name, username: user.username, isSelf: true });
  const [selectedDate, setSelectedDate] = useState(''); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const loadVersion = useRef(0);
  const days = useMemo(() => calendarDays(month), [month]);
  const byDate = useMemo(() => Object.fromEntries(entries.map((entry) => [entry.date, entry])), [entries]);
  const monthTotal = entries.reduce((sum, entry) => sum + Number(entry.amountUsd || 0), 0);
  const wins = entries.filter((entry) => Number(entry.amountUsd) > 0).length; const losses = entries.filter((entry) => Number(entry.amountUsd) < 0).length;
  const load = async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    try {
      const data = await api.getTradingPnl(monthKey(month), targetUserId);
      if (version !== loadVersion.current) return;
      setEntries(data.entries || []); setHistory(data.history || []); setReviewUsers(data.users || []); setCanReview(Boolean(data.canReview));
      setViewingUser(data.viewingUser || { id: user.id, name: user.name, username: user.username, isSelf: true });
    } catch (error) { if (version === loadVersion.current) toast(error.message, 'error'); }
    finally { if (version === loadVersion.current) setLoading(false); }
  };
  useEffect(() => { load(); }, [month.getFullYear(), month.getMonth(), targetUserId]);
  const weeks = useMemo(() => Array.from({ length: 6 }, (_, index) => {
    const weekDays = days.slice(index * 7, index * 7 + 7); const weekdays = weekDays.slice(0, 5);
    const values = weekdays.filter((day) => day.getMonth() === month.getMonth()).map((day) => Number(byDate[dateKey(day)]?.amountUsd || 0));
    return { start: weekdays[0], end: weekdays[4], total: values.reduce((sum, value) => sum + value, 0) };
  }).filter((week) => week.start.getMonth() === month.getMonth() || week.end.getMonth() === month.getMonth()), [days, byDate, month]);
  const previousMonth = new Date(month.getFullYear(), month.getMonth() - 1, 1); const previousSummary = history.find((item) => item.month === monthKey(previousMonth));
  const comparison = monthTotal - Number(previousSummary?.totalUsd || 0); const selectedEntry = selectedDate ? byDate[selectedDate] : null;
  const canAdvance = month < currentMonth; const readOnly = targetUserId !== user.id || viewingUser.isSelf === false;
  const save = async (amountUsd) => {
    if (readOnly) return;
    setBusy(true);
    try {
      const saved = await api.saveTradingPnl({ tradingDate: selectedDate, amountUsd });
      loadVersion.current += 1;
      setEntries((current) => [...current.filter((entry) => entry.date !== saved.date), saved].sort((a, b) => a.date.localeCompare(b.date)));
      setSelectedDate(''); toast('Resultado PNL guardado.'); await load();
    }
    catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (readOnly) return;
    setBusy(true);
    try { await api.deleteTradingPnl(selectedDate); toast('Resultado eliminado.'); setSelectedDate(''); await load(); }
    catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };
  const openDay = (day) => {
    const key = dateKey(day); const weekday = day.getDay();
    if (readOnly || day.getMonth() !== month.getMonth() || weekday === 0 || weekday === 6 || key > today) return;
    setSelectedDate(key);
  };
  return <div className="pnl-page">
    <header className="pnl-page-head"><div><p className="eyebrow">DIARIO PERSONAL DE TRADING</p><h1>PNL / Profit</h1><p>{readOnly ? `Revisión privada del historial de ${viewingUser.name}. Esta vista no permite modificar sus registros.` : 'Registra con honestidad cada ganancia y cada pérdida. Tus resultados son privados y pertenecen únicamente a tu cuenta.'}</p></div><span className="pnl-private-pill"><ShieldCheck /> {readOnly ? 'Solo lectura' : 'Privado'}</span></header>
    {canReview && <section className="pnl-reviewer surface"><span><Users /></span><div><p className="eyebrow">REVISIÓN ADMINISTRATIVA PRIVADA</p><strong>Consultar PNL por usuario</strong><small>Solo la cuenta elkin56ty@gmail.com puede abrir estos historiales.</small></div><label>Usuario registrado<select value={targetUserId} onChange={(event) => { setSelectedDate(''); setTargetUserId(event.target.value); }}>{reviewUsers.map((account) => <option value={account.id} key={account.id}>{account.name} (@{account.username}){account.status !== 'ACTIVE' ? ` · ${account.status}` : ''}</option>)}</select></label></section>}
    <section className="pnl-honesty-banner"><Scale /><div><strong>{readOnly ? `Historial honesto de ${viewingUser.name}` : 'La precisión importa más que una cifra bonita.'}</strong><p>{readOnly ? 'Consulta mensual y semanal en modo de solo lectura. El usuario conserva el control exclusivo de sus anotaciones.' : 'Anota el resultado real de cada jornada, incluida toda pérdida. Solo así podrás medir tu progreso de lunes a viernes.'}</p></div></section>
    <div className="pnl-metrics">
      <article className={monthTotal > 0 ? 'profit' : monthTotal < 0 ? 'loss' : ''}><span>RESULTADO DEL MES</span><strong>{money(monthTotal, true)}</strong><small>{entries.length} {entries.length === 1 ? 'día registrado' : 'días registrados'}</small></article>
      <article><span>DÍAS POSITIVOS</span><strong>{wins}</strong><small>de {entries.length} jornadas anotadas</small></article>
      <article><span>DÍAS NEGATIVOS</span><strong>{losses}</strong><small>también construyen el historial real</small></article>
      <article className={comparison > 0 ? 'profit' : comparison < 0 ? 'loss' : ''}><span>VS. MES ANTERIOR</span><strong>{money(comparison, true)}</strong><small>Mes anterior: {money(previousSummary?.totalUsd || 0)}</small></article>
    </div>
    <div className="pnl-toolbar"><div><button className="icon-button" aria-label="Mes anterior" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft /></button><button className="pnl-current-month" onClick={() => setMonth(currentMonth)}>Este mes</button><button className="icon-button" aria-label="Mes siguiente" disabled={!canAdvance} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight /></button></div><h2>{monthLabel(month)}</h2>{loading && <span>Actualizando…</span>}</div>
    <div className="pnl-layout">
      <section className="pnl-calendar surface">
        <div className="pnl-weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
        <div className="pnl-calendar-grid">{days.map((day) => { const key = dateKey(day); const entry = byDate[key]; const amount = Number(entry?.amountUsd || 0); const outside = day.getMonth() !== month.getMonth(); const weekend = day.getDay() === 0 || day.getDay() === 6; const future = key > today; const disabled = outside || weekend || future || readOnly; return <button type="button" className={`pnl-day ${outside ? 'outside' : ''} ${weekend ? 'weekend' : ''} ${future ? 'future' : ''} ${readOnly ? 'read-only' : ''} ${entry ? amount > 0 ? 'profit' : amount < 0 ? 'loss' : 'flat' : ''}`} disabled={disabled} key={key} onClick={() => openDay(day)} aria-label={`${shortDate(day)}${entry ? `: ${money(amount)}` : ''}`}><span className={key === today ? 'today' : ''}>{day.getDate()}</span>{entry ? <strong>{money(amount, true)}</strong> : !outside && !weekend && !future && !readOnly ? <small>+ Anotar</small> : weekend && !outside ? <small>Cerrado</small> : null}</button>; })}</div>
      </section>
      <aside className="pnl-side">
        <section className="surface pnl-weeks"><header><div><p className="eyebrow">LUNES A VIERNES</p><h3>Resultado semanal</h3></div><CalendarDays /></header>{weeks.map((week, index) => <article className={week.total > 0 ? 'profit' : week.total < 0 ? 'loss' : ''} key={dateKey(week.start)}><span><strong>Semana {index + 1}</strong><small>{shortDate(week.start)} – {shortDate(week.end)}</small></span><b>{money(week.total, true)}</b></article>)}</section>
        <section className="surface pnl-history"><header><p className="eyebrow">COMPARAR RESULTADOS</p><h3>Meses anteriores</h3></header>{history.length ? history.map((item) => { const value = Number(item.totalUsd || 0); return <button type="button" className={value > 0 ? 'profit' : value < 0 ? 'loss' : ''} key={item.month} onClick={() => setMonth(parseDateKey(item.month))}><span><strong>{monthLabel(parseDateKey(item.month))}</strong><small>{item.tradingDays} días · {item.winningDays} positivos · {item.losingDays} negativos</small></span><b>{money(value, true)}</b></button>; }) : <div className="pnl-empty-history"><TrendingUp /><p>{readOnly ? `${viewingUser.name} aún no registra resultados.` : 'Tu comparación aparecerá cuando registres el primer resultado.'}</p></div>}</section>
      </aside>
    </div>
    {selectedDate && !readOnly && <EntryModal date={selectedDate} entry={selectedEntry} busy={busy} onClose={() => !busy && setSelectedDate('')} onSave={save} onDelete={remove} />}
  </div>;
}
