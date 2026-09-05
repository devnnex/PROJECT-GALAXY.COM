import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MailPlus, Send, Trash2, X } from 'lucide-react';
import { api } from '../services/api';
import { MEMBERSHIP_EMOJI } from '../membership-badges';

const amount = value => Number(value || 0).toFixed(2);
const date = value => new Date(value).toLocaleString('es-CO');
const entryLabel = kind => kind === 'MEMBERSHIP_PURCHASE' ? 'Tu membresía' : kind === 'REFERRAL_COMMISSION' ? 'Comisión por referido · 10%' : 'Ingreso de membresía';

export function DeleteUserDialog({ account, onClose, onDeleted }) {
  const dialog = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const previous = document.activeElement;
    const modal = dialog.current;
    modal.showModal();
    return () => { modal.close(); previous?.focus(); };
  }, []);
  const remove = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try { await api.deleteUser(account.id); onDeleted(account); }
    catch (err) { setError(err.message); setBusy(false); }
  };
  return createPortal(<dialog ref={dialog} className="invitation-dialog delete-user-dialog" aria-labelledby="delete-user-title" aria-describedby="delete-user-description" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <section className="registration-panel invitation-glass"><header className="invitation-heading"><span className="invitation-symbol"><Trash2 size={24} /></span><button className="invitation-close" aria-label="Cerrar" disabled={busy} onClick={onClose}><X size={20} /></button></header>
      <p className="eyebrow">GESTIÓN DE USUARIOS</p><h2 id="delete-user-title">Eliminar cuenta</h2>
      <div className="delete-user-identity"><strong>{account.name}</strong><span>{account.email}</span></div>
      <p id="delete-user-description">Se eliminarán permanentemente esta cuenta, su perfil, foto y datos asociados. Los movimientos de otros usuarios se conservarán sin su identidad. Esta acción no se puede deshacer.</p>
      {error && <p className="delete-user-error" role="alert">{error}</p>}
      <footer className="invitation-actions"><button autoFocus className="secondary-button" disabled={busy} onClick={onClose}>Cancelar</button><button className="primary-button delete-user-submit" disabled={busy} onClick={remove}><Trash2 size={16} />{busy ? 'Eliminando…' : 'Eliminar cuenta'}</button></footer>
    </section></dialog>, document.body);
}

export function InvitationForm({ users, toast, onClose }) {
  const dialog = useRef(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const modal = dialog.current;
    modal.showModal();
    return () => { modal.close(); previousFocus?.focus(); };
  }, []);
  const [plans, setPlans] = useState([]); const [email, setEmail] = useState('');
  const [planCode, setPlanCode] = useState(''); const [referrerId, setReferrerId] = useState('');
  const [busy, setBusy] = useState(false); const [sent, setSent] = useState(null);
  useEffect(() => { api.getMembershipCenter().then(data => { setPlans(data.plans); setPlanCode(data.plans[0]?.code || ''); }).catch(error => toast(error.message, 'error')); }, []);
  const plan = plans.find(item => item.code === planCode);
  const submit = async event => {
    event.preventDefault(); setBusy(true); setSent(null);
    try { const result = await api.inviteUser({ email, planCode, referrerId }); setSent({ email, ...result }); setEmail(''); toast('Invitación enviada.'); }
    catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };
  return createPortal(<dialog ref={dialog} className="invitation-dialog" aria-labelledby="invitation-title" aria-describedby="invitation-description" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onClick={event => { if (event.target === dialog.current && !busy) { const bounds = dialog.current.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose(); } }}>
    <section className="registration-panel invitation-glass"><header className="invitation-heading"><span className="invitation-symbol"><MailPlus size={24} /></span><button type="button" className="invitation-close" disabled={busy} onClick={onClose} aria-label="Cerrar invitación"><X size={20} /></button></header><p className="eyebrow">ACCESO A GALAXY</p><h2 id="invitation-title">Una nueva conexión.</h2><p id="invitation-description">Invita a un miembro y personaliza su acceso. Su enlace será válido durante 7 minutos.</p>
    <form onSubmit={submit}><label>Correo electrónico<input autoFocus required type="email" placeholder="nombre@correo.com" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>Membresía y badge<select required value={planCode} onChange={e => setPlanCode(e.target.value)}>{plans.map(item => <option value={item.code} key={item.code}>{MEMBERSHIP_EMOJI[item.code]} {item.name} · {amount(item.priceUsd)} USDT · {item.durationMonths} meses</option>)}</select></label>
      <label>Referido por<select value={referrerId} onChange={e => setReferrerId(e.target.value)}><option value="">Sin referido</option>{users.filter(item => item.status === 'ACTIVE').map(item => <option key={item.id} value={item.id}>{item.name} · {item.email}</option>)}</select></label>
      <p>Al registrarse: {amount(Number(plan?.priceUsd || 0) * (referrerId ? 0.9 : 1))} USDT para elkin56ty@gmail.com{referrerId && ` + ${amount(Number(plan?.priceUsd || 0) * 0.1)} USDT de comisión al referente`}.</p>
      <footer className="invitation-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Cerrar</button><button className="primary-button" disabled={busy || !planCode}><Send size={16} />{busy ? 'Enviando…' : 'Enviar invitación'}</button></footer>
    </form>{sent && <p role="status">Enviada a {sent.email}. Vence el {date(sent.expiresAt)}.</p>}
  </section></dialog>, document.body);
}

export function WalletActivity({ user }) {
  const [data, setData] = useState(null); const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const load = () => api.getWalletActivity().then(result => { if (active) { setData(result); setError(''); } }).catch(err => { if (active) setError(err.message); });
    load(); const timer = setInterval(load, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [user.id]);
  const wallet = data?.wallet || user.wallet || {};
  return <div className="page-stack"><header className="page-header"><div><p className="eyebrow">WALLET</p><h1>Wallet</h1><p>Ingresos de membresías y comisiones por referidos. Se actualiza cada 15 segundos.</p></div></header>
    <section className="wallet-hero"><div><p>BALANCE DISPONIBLE</p><h2>{amount(wallet.availableBalance)} <span>{wallet.currency || 'USDT'}</span></h2><small>Saldo contable de membresías confirmadas por el administrador.</small></div></section>
    <section className="surface registration-panel"><p>Pendiente: {amount(wallet.pendingBalance)} · Total ganado: {amount(wallet.totalEarned)} · Total gastado: {amount(wallet.totalSpent)} {wallet.currency || 'USDT'}</p></section>
    <section className="surface registration-panel"><h2>Movimientos y vencimientos</h2>{error && <p role="alert">{error}</p>}{!data && !error && <p>Cargando…</p>}{data?.entries.length === 0 && <p>Aún no hay movimientos de membresías.</p>}
      {data?.entries.map(entry => { const purchase = entry.kind === 'MEMBERSHIP_PURCHASE'; const displayedAmount = purchase ? Math.abs(Number(entry.grossAmount ?? entry.amount)) : Number(entry.amount); return <article className={`membership-ledger-row ${purchase ? 'membership-payment' : displayedAmount >= 0 ? 'membership-income' : ''}`} key={entry.id}><div><strong>{entryLabel(entry.kind)}</strong><p>{entry.memberName} · {MEMBERSHIP_EMOJI[entry.planCode]} {entry.planCode}</p><small>{date(entry.createdAt)} · Valor de membresía: {amount(entry.grossAmount)} USDT</small><p>{entry.memberDeleted ? 'Cuenta eliminada · vencimiento histórico: ' : new Date(entry.expiresAt) <= new Date() ? 'Membresía vencida: ' : 'Membresía vigente hasta: '}{date(entry.expiresAt)}</p></div><div className="membership-ledger-amount"><small>{purchase ? 'PAGO CONFIRMADO' : displayedAmount >= 0 ? 'ABONO RECIBIDO' : 'MOVIMIENTO'}</small><strong>{purchase ? '✓ ' : displayedAmount >= 0 ? '+' : ''}{amount(displayedAmount)} USDT</strong></div></article>; })}
    </section></div>;
}
