import { lockAppScroll } from '../services/lock-app-scroll';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, CheckCheck, LoaderCircle, LockKeyhole, Send, ShieldCheck, X } from 'lucide-react';
import { api } from '../services/api';
import { watchVisibleResource } from '../services/visible-refresh';
import '../telegram-access.css';

export default function TelegramAccess({ onClose }) {
  const [state, setState] = useState(null), [busy, setBusy] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const panel = useRef(null), alive = useRef(false), pending = useRef(false), watcher = useRef(null), version = useRef(0);
  const merge = (next) => setState((previous) => ({ ...next, botUrl: next.state === 'WAITING' ? next.botUrl || previous?.botUrl : null }));
  useEffect(() => {
    alive.current = true; let stopped = false; const previous = document.activeElement, releaseScroll = lockAppScroll();
    panel.current?.focus();
    const key = (event) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
      if (event.key !== 'Tab') return;
      const controls = [...panel.current.querySelectorAll('button:not(:disabled),a[href]')].filter((item) => item.getClientRects().length);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key);
    api.telegramAccess('begin').then((value) => {
      if (stopped) return; merge(value);
    }).catch((cause) => { if (!stopped) setError(cause.message); }).finally(() => { if (!stopped) setBusy(false); });
    return () => { stopped = true; alive.current = false; releaseScroll(); document.removeEventListener('keydown', key); previous?.focus(); };
  }, [onClose]);
  useEffect(() => {
    if (!state?.enabled || !['WAITING', 'PROPOSED', 'LINKED'].includes(state.state)) return undefined;
    const resource = watchVisibleResource({ interval: 4000,
      load: async () => { const revision = version.current; return { next: await api.telegramAccess(), revision }; },
      onData: ({ next, revision }) => { if (revision === version.current) { merge(next); if (next.state === 'PROPOSED') setNotice('Cuenta detectada. Confirma que es tuya para continuar.'); } },
      onError: () => setNotice('Estamos reconectando. Tus pasos se conservan; puedes volver a verificar.') });
    watcher.current = resource;
    return () => resource.stop();
  }, [state?.state, state?.enabled]);
  const act = async (action) => {
    if (pending.current) return; pending.current = true; version.current++; setBusy(true); setError(''); setNotice('');
    try {
      let next = await api.telegramAccess(action);
      if (action === 'status' && next.state === 'LINKED' && !next.inviteUrl) next = await api.telegramAccess('confirm');
      if (alive.current) {
        merge(next);
        if (action === 'status') setNotice(next.state === 'WAITING' ? 'Aún no recibimos el inicio del bot. Ábrelo desde este enlace, pulsa Iniciar y vuelve aquí.' : next.state === 'UNLINKED' ? 'El enlace venció. Pulsa Preparar enlace privado para retomarlo.' : next.state === 'PROPOSED' ? 'Cuenta detectada. Confirma que es tuya para continuar.' : 'Verificación completada.');
      }
    }
    catch (cause) { if (alive.current) setError(cause.message); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  };
  const waiting = !state || ['WAITING', 'UNLINKED'].includes(state.state), proposed = state?.state === 'PROPOSED', joined = state?.state === 'JOINED';
  const issue = ({ ALREADY_LINKED: 'Esta cuenta de Telegram ya está vinculada a otra cuenta Galaxy. Inicia sesión con esa cuenta Galaxy o abre el bot con otra cuenta de Telegram.', DIFFERENT_TELEGRAM: 'Este enlace ya detectó otra cuenta de Telegram. Usa «No es mi cuenta» si necesitas corregirla.', REOPENED_ELSEWHERE: 'El inicio del bot continuó desde otra cuenta Galaxy. Abre de nuevo el bot desde la cuenta Galaxy que quieres vincular.' })[state?.linkIssue];
  const expire = state?.expiresAt ? new Date(state.expiresAt).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' }) : '';
  return createPortal(<div className="tg-access-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="tg-access glass" role="dialog" aria-modal="true" aria-labelledby="tg-access-title" ref={panel} tabIndex={-1}>
      <header><span className="tg-access-symbol"><Send size={23} /></span><div><small>BLACK GALAXY TRADE</small><h2 id="tg-access-title">Tu acceso a Telegram</h2></div><button className="icon-button" aria-label="Cerrar acceso a Telegram" onClick={onClose}><X size={19} /></button></header>
      <div className="tg-access-content">
        <div className="tg-access-steps" aria-label="Pasos de acceso">{['Abre el bot', 'Confirma tu cuenta', 'Solicita ingreso'].map((label, index) => <span key={label} className={(joined || index < (waiting ? 0 : proposed ? 1 : 2)) ? 'done' : ''}><i>{index + 1}</i>{label}</span>)}</div>
        {busy && !state && <p className="tg-access-status" role="status"><LoaderCircle size={18} /> Preparando tu acceso privado…</p>}
        {(error || issue) && <div className="tg-access-error" role="alert">{error || issue}<button disabled={busy} onClick={() => act(state?.state === 'LINKED' ? 'confirm' : 'begin')}>Reintentar</button></div>}
        {notice && !issue && <p className="tg-access-feedback" role="status">{notice}</p>}
        {state?.enabled === false ? <p>El acceso a Telegram todavía no está disponible. Vuelve a intentarlo más tarde.</p> : state && <>
          {joined ? <div className="tg-access-ready"><CheckCheck size={34} /><h3>Ya formas parte de PROJECT GALAXY</h3><p>Tu cuenta está vinculada. Encontrarás el grupo en tus chats de Telegram.</p></div> : waiting ? <><h3>Primero, saluda a PowerEliteBot</h3><p>Abre el bot y pulsa <strong>Iniciar</strong>. Después vuelve aquí para confirmar que la cuenta es tuya.</p>{state.botUrl ? <a className="tg-access-primary" href={state.botUrl} target="_blank" rel="noopener noreferrer">Abrir bot en Telegram <ArrowUpRight size={17} /></a> : <button className="tg-access-primary" disabled={busy} onClick={() => act('begin')}>Preparar enlace privado</button>}<button className="tg-access-refresh" disabled={busy} onClick={() => act('status')}>{busy ? 'Verificando...' : 'Ya abrí el bot · Verificar'}</button></> : proposed ? <><h3>¿Esta es tu cuenta de Telegram?</h3><div className="tg-access-identity"><ShieldCheck size={23} /><span><strong>{state.firstName || 'Tu cuenta de Telegram'}</strong><small>{state.username ? `@${state.username}` : 'Cuenta identificada por el bot'}</small></span></div><p>Vincularemos esta cuenta a tu usuario Galaxy. Cada usuario tiene un solo registro.</p><button className="tg-access-primary" disabled={busy} onClick={() => act('confirm')}>{busy ? 'Confirmando…' : 'Confirmar mi cuenta'}<CheckCheck size={17} /></button><button className="tg-access-refresh" disabled={busy} onClick={() => act('restart')}>No es mi cuenta</button></> : <><h3>Tu invitación está lista</h3><p>Solicita el ingreso con la cuenta que confirmaste. El bot comprobará tu acceso automáticamente.</p>{state.inviteUrl ? <><a className="tg-access-primary" href={state.inviteUrl} target="_blank" rel="noopener noreferrer">Solicitar ingreso al grupo <ArrowUpRight size={17} /></a><small className="tg-access-expiry">Invitación personal · válida hasta {expire}, hora de Bogotá</small></> : <button className="tg-access-primary" disabled={busy} onClick={() => act('confirm')}>{busy ? 'Preparando invitación…' : 'Obtener mi invitación'}</button>}</>}
        </>}
      </div>
      <footer><LockKeyhole size={14} /><span>Grupo privado · Una cuenta de Telegram por usuario Galaxy</span></footer>
    </section>
  </div>, document.body);
}
