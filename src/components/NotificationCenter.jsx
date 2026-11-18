import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Check, CheckCheck, ChevronRight, RefreshCw, X } from 'lucide-react';
import { ScannerNotificationLabel } from './BlackGalaxyTrade';
import '../notification-center.css';

export default function NotificationCenter({ items, unread, busy, error, cleared, english, onClose, onOpen, onReadAll }) {
  const [filter, setFilter] = useState('ALL');
  const panel = useRef(null);
  useEffect(() => {
    const previous = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; panel.current?.focus();
    const key = (event) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
      if (event.key !== 'Tab') return;
      const controls = [...panel.current.querySelectorAll('button:not(:disabled),[tabindex="0"]')].filter((element) => element.getClientRects().length);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', key); previous?.focus(); };
  }, [onClose]);
  const visible = filter === 'UNREAD' ? items.filter((item) => !item.readAt) : items;
  const time = (value) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString(english ? 'en-US' : 'es-CO', { timeZone: 'America/Bogota', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  return createPortal(<div className="notification-center-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="notification-center glass" id="galaxy-notification-center" ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="notification-center-title">
      <header><span className="notification-center-orbit"><Bell size={21} /></span><div><small>PROJECT GALAXY</small><h2 id="notification-center-title">{english ? 'Notifications' : 'Notificaciones'}</h2></div><button className="icon-button" onClick={onClose} aria-label={english ? 'Close notifications' : 'Cerrar notificaciones'}><X size={20} /></button></header>
      <div className="notification-center-status" role="status">{busy ? <><RefreshCw size={14} className="inbox-sync" />{english ? 'Confirming your reading…' : 'Confirmando lectura…'}</> : error ? <><Bell size={14} />{english ? 'Reading pending' : 'Lectura pendiente'}</> : unread ? <><Bell size={14} />{unread} {english ? unread === 1 ? 'new arrival' : 'new arrivals' : unread === 1 ? 'aviso nuevo' : 'avisos nuevos'}</> : <><CheckCheck size={15} />{english ? 'All caught up' : 'Todo leído y al día'}</>}</div>
      <p className="notification-center-intro">{english ? 'Opening this panel marks your notifications as read and clears your inbox.' : 'Al abrir este panel, tus avisos se marcan como leídos y se limpia el buzón.'}</p>
      {error && <div className="notification-center-error" role="alert"><p>{english ? 'We could not confirm the reading. Try again to sync your notifications.' : error}</p><button disabled={busy} onClick={() => { panel.current?.focus(); onReadAll(); }}>{english ? 'Try again' : 'Reintentar'}</button></div>}
      <div className="notification-center-filters" role="group" aria-label={english ? 'Notification filter' : 'Filtro de notificaciones'}>{[['ALL', english ? 'This reading' : 'Esta lectura'], ['UNREAD', english ? 'New arrivals' : 'Nuevas']].map(([value, label]) => <button key={value} aria-pressed={filter === value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}<span>{value === 'ALL' ? items.length : unread}</span></button>)}</div>
      <div className="notification-center-list" tabIndex={0} aria-label={english ? 'Notification list' : 'Lista de notificaciones'}>
        {visible.map((notice) => <button key={notice.id} className={`notification-center-row ${notice.readAt ? 'read' : 'unread'}`} onClick={() => onOpen(notice)}>
          <span className="notification-center-icon">{notice.type === 'SCANNER_SIGNAL' ? <img src={`${import.meta.env.BASE_URL}galaxy-notification.png`} alt="Galaxy" /> : <Bell size={17} />}</span>
          <span className="notification-center-copy"><strong>{notice.type === 'SCANNER_SIGNAL' ? <ScannerNotificationLabel notice={notice} /> : notice.title}</strong><span className="notification-center-body">{String(notice.body || notice.meetingTitle || (english ? 'Account activity' : 'Actividad de tu cuenta')).split('|').map((part, index) => <span key={index}>{part.trim()}</span>)}</span><span className="notification-center-meta"><time dateTime={notice.createdAt}>{time(notice.createdAt)}</time><span>{notice.readAt ? <><Check size={12} />{english ? 'Read' : 'Leída'}</> : english ? 'New' : 'Nueva'}</span></span></span>
          <ChevronRight className="notification-center-arrow" size={15} />
        </button>)}
        {!visible.length && <div className="notification-center-empty"><span><CheckCheck size={28} /></span><h3>{busy ? english ? 'Loading your reading' : 'Preparando tu lectura' : english ? 'You are all caught up' : 'Estás al día'}</h3><p>{english ? 'New notifications will appear here as they arrive.' : 'Los avisos nuevos aparecerán aquí cuando lleguen.'}</p></div>}
      </div>
      <footer><p>{cleared > items.length ? english ? `${cleared} notifications cleared. Showing the latest ${items.length}.` : `${cleared} avisos limpiados. Mostramos los últimos ${items.length}.` : english ? 'This reading is cleared from view when you close the panel.' : 'Esta lectura se quita de la vista al cerrar el panel.'}</p><button className="notification-center-done" disabled={busy && unread > 0} onClick={unread ? onReadAll : onClose}>{unread ? english ? 'Read new arrivals' : 'Leer novedades' : english ? 'Done' : 'Listo'}<CheckCheck size={15} /></button></footer>
    </section>
  </div>, document.body);
}
