import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Info, Plus, Repeat2, Video, X } from 'lucide-react';
import { api } from '../services/api';

const WEEKDAYS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const pad = (value) => String(value).padStart(2, '0');
const localInputValue = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

function firstGridDay(month) {
  const value = new Date(month.getFullYear(), month.getMonth(), 1);
  value.setDate(value.getDate() - ((value.getDay() + 6) % 7));
  value.setHours(0, 0, 0, 0);
  return value;
}

function calendarDays(month) {
  const first = firstGridDay(month); const lastOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const rows = Math.ceil((((lastOfMonth.getDay() + 6) % 7) + lastOfMonth.getDate()) / 7);
  return Array.from({ length: Math.max(35, rows * 7) }, (_, index) => {
    const day = new Date(first); day.setDate(first.getDate() + index); return day;
  });
}

function eventState(event, now) {
  if (event.status === 'FINISHED' || new Date(event.endsAt).getTime() <= now) return 'FINISHED';
  if (new Date(event.startsAt).getTime() <= now) return 'LIVE';
  return 'UPCOMING';
}

function dateLabel(value, options) { return new Intl.DateTimeFormat('es-CO', options).format(new Date(value)); }

function CreateEventModal({ onClose, onCreated, toast }) {
  const defaultStart = new Date(Date.now() + 60 * 60 * 1000); defaultStart.setMinutes(0, 0, 0);
  const defaultEnd = new Date(defaultStart.getTime() + 90 * 60 * 1000);
  const [form, setForm] = useState({ title: '', description: '', kind: 'MEETING', startsAt: localInputValue(defaultStart), endsAt: localInputValue(defaultEnd), recurrence: 'NONE', repeatUntil: '' });
  const [busy, setBusy] = useState(false);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      const result = await api.createCalendarEvent({
        title: form.title, description: form.description, kind: form.kind,
        startsAt: new Date(form.startsAt).toISOString(), endsAt: new Date(form.endsAt).toISOString(),
        recurrence: form.recurrence, repeatUntil: form.recurrence === 'WEEKLY' ? form.repeatUntil : null,
      });
      toast(result.created === 1 ? 'Evento agregado al calendario.' : `${result.created} sesiones semanales agregadas.`);
      onCreated(); onClose();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };
  return <div className="modal-backdrop calendar-modal-backdrop" onMouseDown={onClose}><section className="calendar-create-modal glass" role="dialog" aria-modal="true" aria-labelledby="calendar-create-title" onMouseDown={(event) => event.stopPropagation()}>
    <header><div><p className="eyebrow">PROGRAMACIÓN</p><h2 id="calendar-create-title">Nuevo evento</h2></div><button className="icon-button" type="button" aria-label="Cerrar" onClick={onClose}><X /></button></header>
    <form onSubmit={submit}>
      <label>Título<input required maxLength="140" value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="Sesión de análisis XAUUSD" /></label>
      <label>Descripción<textarea maxLength="800" rows="3" value={form.description} onChange={(event) => update('description', event.target.value)} placeholder="Contexto o indicaciones para los asistentes" /></label>
      <div className="calendar-form-row">
        <label>Tipo<select value={form.kind} onChange={(event) => update('kind', event.target.value)}><option value="MEETING">Reunión</option><option value="EVENT">Evento informativo</option></select></label>
        <label>Repetición<select value={form.recurrence} onChange={(event) => update('recurrence', event.target.value)}><option value="NONE">No se repite</option><option value="WEEKLY">Cada semana</option></select></label>
      </div>
      <div className="calendar-form-row">
        <label>Inicio<input required type="datetime-local" value={form.startsAt} onChange={(event) => update('startsAt', event.target.value)} /></label>
        <label>Final<input required type="datetime-local" value={form.endsAt} onChange={(event) => update('endsAt', event.target.value)} /></label>
      </div>
      {form.recurrence === 'WEEKLY' && <label>Repetir hasta<input required type="date" min={form.startsAt.slice(0, 10)} value={form.repeatUntil} onChange={(event) => update('repeatUntil', event.target.value)} /></label>}
      <div className="calendar-auto-access"><Check /><span><strong>Ingreso automático durante la sesión</strong><small>Las reuniones del calendario no solicitan invitación ni aprobación. Las reuniones manuales no cambian.</small></span></div>
      <footer><button className="secondary-button" type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy}><CalendarDays /> {busy ? 'Programando…' : 'Agregar al calendario'}</button></footer>
    </form>
  </section></div>;
}

function EventDetail({ event, now, onClose, onJoin }) {
  if (!event) return null;
  const state = eventState(event, now); const isMeeting = event.kind === 'MEETING';
  return <div className="modal-backdrop calendar-modal-backdrop" onMouseDown={onClose}><section className="calendar-event-detail glass" role="dialog" aria-modal="true" aria-labelledby="calendar-event-title" onMouseDown={(click) => click.stopPropagation()}>
    <header><span className={`calendar-detail-icon ${state.toLowerCase()}`}>{isMeeting ? <Video /> : <Info />}</span><button className="icon-button" type="button" aria-label="Cerrar" onClick={onClose}><X /></button></header>
    <p className="eyebrow">{state === 'LIVE' ? 'EN VIVO AHORA' : state === 'FINISHED' ? 'FINALIZADO' : isMeeting ? 'PRÓXIMA REUNIÓN' : 'PRÓXIMO EVENTO'}</p>
    <h2 id="calendar-event-title">{event.title}</h2>
    {event.description && <p className="calendar-detail-description">{event.description}</p>}
    <div className="calendar-detail-meta"><span><CalendarDays /> {dateLabel(event.startsAt, { weekday: 'long', day: 'numeric', month: 'long' })}</span><span><Clock3 /> {dateLabel(event.startsAt, { hour: '2-digit', minute: '2-digit' })} – {dateLabel(event.endsAt, { hour: '2-digit', minute: '2-digit' })}</span>{event.recurring && <span><Repeat2 /> Sesión semanal</span>}</div>
    {isMeeting && <div className={`calendar-access-note ${state.toLowerCase()}`}>{state === 'LIVE' ? 'La sala está habilitada. Entrarás directamente, sin sala de espera.' : state === 'UPCOMING' ? `La sala se habilita ${dateLabel(event.startsAt, { weekday: 'long', hour: '2-digit', minute: '2-digit' })}.` : 'La franja programada para esta reunión ya terminó.'}</div>}
    <footer><button className="secondary-button" type="button" onClick={onClose}>Cerrar</button>{isMeeting && <button className="primary-button" type="button" disabled={state !== 'LIVE'} onClick={() => onJoin(event)}><Video /> {state === 'LIVE' ? 'Unirse a la reunión' : state === 'UPCOMING' ? 'Aún no disponible' : 'Reunión finalizada'}</button>}</footer>
  </section></div>;
}

export default function CalendarPage({ toast, onJoin }) {
  const [month, setMonth] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });
  const [events, setEvents] = useState([]); const [canManage, setCanManage] = useState(false); const [loading, setLoading] = useState(true); const [createOpen, setCreateOpen] = useState(false); const [selected, setSelected] = useState(null); const [clock, setClock] = useState(Date.now()); const [serverOffset, setServerOffset] = useState(0);
  const days = useMemo(() => calendarDays(month), [month]);
  const range = useMemo(() => { const last = days[days.length - 1]; return { from: days[0].toISOString(), to: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1).toISOString() }; }, [days]);
  const load = async () => {
    setLoading(true);
    try { const result = await api.getCalendarEvents(range); const serverTime = new Date(result.serverNow || Date.now()).getTime(); setEvents(result.events || []); setCanManage(Boolean(result.canManage)); setServerOffset(serverTime - Date.now()); setClock(serverTime); }
    catch (error) { toast(error.message, 'error'); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [range.from, range.to]);
  useEffect(() => { const timer = setInterval(() => setClock(Date.now() + serverOffset), 5_000); return () => clearInterval(timer); }, [serverOffset]);
  const byDay = useMemo(() => events.reduce((map, item) => { const key = dateKey(new Date(item.startsAt)); if (!map[key]) map[key] = []; map[key].push(item); return map; }, {}), [events]);
  const upcoming = useMemo(() => events.filter((event) => new Date(event.endsAt).getTime() > clock).sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)).slice(0, 8), [events, clock]);
  const moveMonth = (amount) => setMonth(new Date(month.getFullYear(), month.getMonth() + amount, 1));
  const today = () => { const value = new Date(); setMonth(new Date(value.getFullYear(), value.getMonth(), 1)); };
  const join = (event) => { setSelected(null); onJoin({ roomCode: event.roomCode, id: `calendar-${event.id}-${Date.now()}` }); };
  return <div className="calendar-page">
    <header className="calendar-page-head"><div><p className="eyebrow">AGENDA DE LA COMUNIDAD</p><h1>{MONTHS[month.getMonth()]} de {month.getFullYear()}</h1><p>Consulta las sesiones programadas y entra directamente cuando estén en vivo.</p></div>{canManage && <button className="primary-button compact" onClick={() => setCreateOpen(true)}><Plus /> Nuevo evento</button>}</header>
    <div className="calendar-toolbar"><div><button className="icon-button" aria-label="Mes anterior" onClick={() => moveMonth(-1)}><ChevronLeft /></button><button className="calendar-today" onClick={today}>Hoy</button><button className="icon-button" aria-label="Mes siguiente" onClick={() => moveMonth(1)}><ChevronRight /></button></div>{loading && <span>Actualizando calendario…</span>}</div>
    <div className="calendar-layout">
      <section className="calendar-board surface">
        <div className="calendar-weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
        <div className="calendar-grid">{days.map((day) => { const key = dateKey(day); const items = byDay[key] || []; const isToday = key === dateKey(new Date()); const outside = day.getMonth() !== month.getMonth(); return <div className={`calendar-cell ${outside ? 'outside' : ''}`} key={key}><span className={isToday ? 'today' : ''}>{day.getDate()}</span><div>{items.slice(0, 3).map((event) => { const state = eventState(event, clock); return <button className={`calendar-event-chip ${state.toLowerCase()} ${event.kind.toLowerCase()}`} key={event.id} onClick={() => setSelected(event)} title={event.title}><i />{dateLabel(event.startsAt, { hour: '2-digit', minute: '2-digit' })} {event.title}</button>; })}{items.length > 3 && <button className="calendar-more" onClick={() => setSelected(items[3])}>+{items.length - 3} más</button>}</div></div>; })}</div>
      </section>
      <aside className="calendar-upcoming"><div className="calendar-upcoming-title"><h2>Próximos eventos</h2><span>{upcoming.length}</span></div>{upcoming.length ? upcoming.map((event) => { const state = eventState(event, clock); return <article className={state.toLowerCase()} key={event.id} onClick={() => setSelected(event)}><div className="calendar-upcoming-state"><span>{state === 'LIVE' ? 'AHORA' : dateLabel(event.startsAt, { day: 'numeric', month: 'short' }).toUpperCase()}</span><i>{state === 'LIVE' ? 'LIVE' : event.kind === 'MEETING' ? 'REUNIÓN' : 'EVENTO'}</i></div><h3>{event.title}</h3><p><Clock3 /> {dateLabel(event.startsAt, { hour: '2-digit', minute: '2-digit' })} – {dateLabel(event.endsAt, { hour: '2-digit', minute: '2-digit' })}</p><small>{event.description || (event.kind === 'MEETING' ? 'Ingreso automático durante la franja programada.' : 'Evento de la comunidad.')}</small>{state === 'LIVE' && event.kind === 'MEETING' && <button className="primary-button" onClick={(click) => { click.stopPropagation(); join(event); }}><Video /> Unirse ahora</button>}</article>; }) : <div className="calendar-empty"><CalendarDays /><strong>Agenda despejada</strong><p>No hay eventos próximos en este mes.</p></div>}</aside>
    </div>
    {createOpen && <CreateEventModal toast={toast} onClose={() => setCreateOpen(false)} onCreated={load} />}
    {selected && <EventDetail event={selected} now={clock} onClose={() => setSelected(null)} onJoin={join} />}
  </div>;
}
