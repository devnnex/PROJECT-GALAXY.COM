import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Flag, Send, ShieldCheck, Trash2, X } from 'lucide-react';
import { api } from '../services/api';
import ConstellationAvatar from './ConstellationAvatar';

const REPORTS_CONTROLLER = 'elkin56ty@gmail.com';
const categories = [
  ['PLATFORM', 'Plataforma'], ['MEETING', 'Reuniones'], ['AUDIO', 'Audio'],
  ['ACCOUNT', 'Cuenta'], ['PAYMENT', 'Pagos'], ['OTHER', 'Otro'],
];
const priorities = [['LOW', 'Baja'], ['NORMAL', 'Normal'], ['HIGH', 'Alta'], ['CRITICAL', 'Crítica']];
const statuses = [['OPEN', 'Abierto'], ['IN_REVIEW', 'En seguimiento'], ['RESOLVED', 'Resuelto']];
const labelFor = (items, value) => items.find(([key]) => key === value)?.[1] || value;

function ReportDeleteDialog({ target, busy, onClose, onConfirm }) {
  if (!target) return null;
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="report-delete-dialog glass" role="dialog" aria-modal="true" aria-labelledby="report-delete-title" onMouseDown={(event) => event.stopPropagation()}>
    <button className="icon-button modal-close" type="button" onClick={onClose} aria-label="Cerrar"><X /></button>
    <span className="report-dialog-icon"><Trash2 /></span>
    <h2 id="report-delete-title">{target === 'ALL' ? 'Vaciar todos los reportes' : 'Eliminar este reporte'}</h2>
    <p>{target === 'ALL' ? 'Se eliminará permanentemente todo el historial de reportes.' : 'Este reporte y su seguimiento se eliminarán permanentemente.'}</p>
    <div className="modal-actions"><button className="secondary-button" disabled={busy} onClick={onClose}>Cancelar</button><button className="primary-button report-danger" disabled={busy} onClick={onConfirm}><Trash2 /> {busy ? 'Eliminando…' : 'Eliminar'}</button></div>
  </section></div>;
}

export default function ReportsPage({ user, toast }) {
  const controller = String(user?.email || '').trim().toLowerCase() === REPORTS_CONTROLLER;
  const [reports, setReports] = useState([]); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('ALL'); const [deleteTarget, setDeleteTarget] = useState(null); const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({ category: 'PLATFORM', subject: '', details: '' });
  const load = async (showLoading = false) => { if (showLoading) setLoading(true); try { setReports(await api.getPlatformReports()); } catch (error) { toast(error.message, 'error'); } finally { if (showLoading) setLoading(false); } };
  useEffect(() => { let active = true; const refresh = async () => { try { const items = await api.getPlatformReports(); if (active) setReports(items); } catch {} finally { if (active) setLoading(false); } }; refresh(); const timer = setInterval(refresh, 15_000); return () => { active = false; clearInterval(timer); }; }, []);

  const visible = useMemo(() => reports.filter((report) => filter === 'ALL' || report.status === filter), [reports, filter]);
  const totals = useMemo(() => ({ open: reports.filter((item) => item.status === 'OPEN').length, review: reports.filter((item) => item.status === 'IN_REVIEW').length, resolved: reports.filter((item) => item.status === 'RESOLVED').length }), [reports]);
  const submit = async (event) => {
    event.preventDefault(); setSaving(true);
    try { await api.createPlatformReport(form); setForm({ category: 'PLATFORM', subject: '', details: '' }); await load(); toast('Reporte enviado. Podrás seguir su estado desde aquí.'); }
    catch (error) { toast(error.message, 'error'); } finally { setSaving(false); }
  };
  const update = async (report, patch) => {
    const optimistic = { ...report, ...patch }; setReports((items) => items.map((item) => item.id === report.id ? optimistic : item));
    try { const saved = await api.updatePlatformReport({ reportId: report.id, priority: optimistic.priority, status: optimistic.status, adminNotes: optimistic.adminNotes || '' }); setReports((items) => items.map((item) => item.id === saved.id ? saved : item)); toast('Seguimiento actualizado.'); }
    catch (error) { await load(); toast(error.message, 'error'); }
  };
  const remove = async () => {
    setDeleting(true);
    try { if (deleteTarget === 'ALL') await api.clearPlatformReports(); else await api.deletePlatformReport(deleteTarget); setDeleteTarget(null); await load(); toast(deleteTarget === 'ALL' ? 'Se vaciaron todos los reportes.' : 'Reporte eliminado.'); }
    catch (error) { toast(error.message, 'error'); } finally { setDeleting(false); }
  };

  return <div className="reports-page page-stack">
    <header className="page-header reports-header"><div><p className="eyebrow">CENTRO DE SOPORTE</p><h1>Reportes</h1><p>{controller ? 'Clasifica incidencias, documenta el seguimiento y cierra cada caso.' : 'Cuéntanos qué sucede para poder revisarlo y darle seguimiento.'}</p></div>{controller && reports.length > 0 && <button className="secondary-button report-clear" onClick={() => setDeleteTarget('ALL')}><Trash2 /> Vaciar reportes</button>}</header>
    {controller && <section className="report-metrics"><article><AlertTriangle /><span><strong>{totals.open}</strong><small>Abiertos</small></span></article><article><Clock3 /><span><strong>{totals.review}</strong><small>En seguimiento</small></span></article><article><CheckCircle2 /><span><strong>{totals.resolved}</strong><small>Resueltos</small></span></article></section>}
    {!controller && <form className="report-composer surface" onSubmit={submit}><div className="section-title"><div><p className="eyebrow">NUEVO REPORTE</p><h2>¿Qué necesitas reportar?</h2></div><Flag /></div><div className="report-form-grid"><label><span>Categoría</span><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{categories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label><span>Asunto</span><input value={form.subject} minLength="4" maxLength="140" required placeholder="Resume el problema" onChange={(event) => setForm({ ...form, subject: event.target.value })} /></label></div><label><span>Detalles</span><textarea value={form.details} minLength="10" maxLength="3000" required placeholder="Describe qué ocurrió, dónde lo viste y qué esperabas que sucediera…" onChange={(event) => setForm({ ...form, details: event.target.value })} /></label><footer><small><ShieldCheck /> Tu reporte queda asociado de forma segura a tu cuenta.</small><button className="primary-button" disabled={saving}><Send /> {saving ? 'Enviando…' : 'Enviar reporte'}</button></footer></form>}
    <section className="reports-workspace surface"><header><div><p className="eyebrow">{controller ? 'BANDEJA DE SEGUIMIENTO' : 'MIS REPORTES'}</p><h2>{reports.length} reporte{reports.length === 1 ? '' : 's'}</h2></div><div className="report-filters">{[['ALL', 'Todos'], ...statuses].map(([value, label]) => <button type="button" className={filter === value ? 'active' : ''} key={value} onClick={() => setFilter(value)}>{label}</button>)}</div></header>
      <div className="report-list">{visible.map((report) => <article className={`report-card priority-${report.priority.toLowerCase()}`} key={report.id}><div className="report-card-head"><span className={`report-status ${report.status.toLowerCase()}`}>{labelFor(statuses, report.status)}</span><span className="report-category">{labelFor(categories, report.category)}</span><time>{new Date(report.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</time></div><h3>{report.subject}</h3><p>{report.details}</p>{controller && <div className="reporter"><ConstellationAvatar className="avatar avatar-sm" seed={report.reporterId} name={report.reporterName} src={report.reporterAvatar} membership={report.reporterMembership} /><span><strong>{report.reporterName}</strong><small>@{report.reporterUsername}</small></span></div>}
        {controller ? <div className="report-admin-controls"><label><span>Prioridad</span><select value={report.priority} onChange={(event) => update(report, { priority: event.target.value })}>{priorities.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label><span>Estado</span><select value={report.status} onChange={(event) => update(report, { status: event.target.value })}>{statuses.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="report-notes"><span>Seguimiento</span><textarea defaultValue={report.adminNotes || ''} maxLength="2000" placeholder="Notas internas de seguimiento…" onBlur={(event) => { if (event.target.value !== (report.adminNotes || '')) update(report, { adminNotes: event.target.value }); }} /></label><button className="icon-button report-delete" type="button" title="Eliminar reporte" onClick={() => setDeleteTarget(report.id)}><Trash2 /></button></div> : <footer><span className={`report-priority ${report.priority.toLowerCase()}`}>Prioridad {labelFor(priorities, report.priority).toLowerCase()}</span>{report.adminNotes && <p><strong>Seguimiento:</strong> {report.adminNotes}</p>}{report.resolvedAt && <time>Resuelto el {new Date(report.resolvedAt).toLocaleDateString()}</time>}</footer>}
      </article>)}{!loading && !visible.length && <div className="reports-empty"><Flag /><h3>{reports.length ? 'No hay reportes con este estado' : 'Todavía no hay reportes'}</h3><p>{controller ? 'Los nuevos reportes de la comunidad aparecerán aquí.' : 'Cuando envíes uno podrás consultar aquí su seguimiento.'}</p></div>}{loading && <div className="reports-empty"><span className="loading-spinner" /><p>Cargando reportes…</p></div>}</div>
    </section><ReportDeleteDialog target={deleteTarget} busy={deleting} onClose={() => !deleting && setDeleteTarget(null)} onConfirm={remove} />
  </div>;
}
