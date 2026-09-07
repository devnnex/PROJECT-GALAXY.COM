import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, EyeOff, MailPlus, Orbit, PartyPopper, Send, Sparkles, Trash2, X } from 'lucide-react';
import { api } from '../services/api';
import { MEMBERSHIP_EMOJI } from '../membership-badges';

const amount = value => Number(value || 0).toFixed(2);
const date = value => new Date(value).toLocaleString('es-CO');
const entryLabel = kind => kind === 'MEMBERSHIP_PURCHASE' ? 'Tu membresía' : kind === 'REFERRAL_COMMISSION' ? 'Comisión por referido · 10%' : 'Ingreso de membresía';
const walletTier = balance => balance <= 0 ? 'zero' : balance <= 200 ? 'violet' : balance < 400 ? 'indigo' : balance < 600 ? 'cyan' : balance < 800 ? 'aqua' : 'emerald';
const CONFETTI = Array.from({ length: 42 }, (_, index) => ({
  id: index,
  x: `${(index * 37) % 100}%`,
  delay: `${(index % 9) * 0.08}s`,
  duration: `${2.5 + (index % 7) * 0.18}s`,
  spin: `${180 + (index % 6) * 90}deg`,
  color: ['#b879ff', '#52f7dc', '#ffe66d', '#ff6fae', '#74a7ff'][index % 5],
}));

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
      <p>Al enviarse: {referrerId ? `${amount(Number(plan?.priceUsd || 0) * 0.1)} USDT de comisión inmediata al referente. ` : 'No se genera comisión por referido. '}El ingreso restante se acredita al completar el registro.</p>
      <footer className="invitation-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Cerrar</button><button className="primary-button" disabled={busy || !planCode}><Send size={16} />{busy ? 'Enviando…' : 'Enviar invitación'}</button></footer>
    </form>{sent && <p role="status">Enviada a {sent.email}. {Number(sent.commissionAmount || 0) > 0 && `Comisión de ${amount(sent.commissionAmount)} USDT acreditada. `}Vence el {date(sent.expiresAt)}.</p>}
  </section></dialog>, document.body);
}

export function WalletActivity({ user }) {
  const [data, setData] = useState(null); const [error, setError] = useState(''); const [celebration, setCelebration] = useState(null);
  const balanceVisibilityKey = `galaxy_wallet_balance_hidden_${user.id}`;
  const celebratedCommissionKey = `galaxy_wallet_celebrated_commission_${user.id}`;
  const celebratedCommission = useRef((() => { try { return localStorage.getItem(celebratedCommissionKey) || ''; } catch { return ''; } })());
  const celebrationTimer = useRef(null);
  const [balanceHidden, setBalanceHidden] = useState(() => { try { return localStorage.getItem(balanceVisibilityKey) === 'true'; } catch { return false; } });
  useEffect(() => {
    let active = true;
    const load = () => api.getWalletActivity().then(result => {
      if (!active) return;
      setData(result); setError('');
      const commissions = (result.entries || []).filter(entry => entry.kind === 'REFERRAL_COMMISSION');
      const latest = commissions[0];
      if (!latest || latest.id === celebratedCommission.current) return;
      const previousIndex = commissions.findIndex(entry => entry.id === celebratedCommission.current);
      const unseen = celebratedCommission.current && previousIndex > 0 ? commissions.slice(0, previousIndex) : [latest];
      celebratedCommission.current = latest.id;
      try { localStorage.setItem(celebratedCommissionKey, latest.id); } catch {}
      clearTimeout(celebrationTimer.current);
      setCelebration({
        id: latest.id,
        amount: unseen.reduce((total, entry) => total + Number(entry.amount || 0), 0),
        count: unseen.length,
        invitationEmail: latest.invitationEmail,
        memberName: latest.memberName,
      });
      celebrationTimer.current = setTimeout(() => setCelebration(null), 7200);
    }).catch(err => { if (active) setError(err.message); });
    load(); const unsubscribe = api.onWalletChange(user.id, load); const timer = setInterval(load, 60000);
    return () => { active = false; unsubscribe(); clearInterval(timer); clearTimeout(celebrationTimer.current); };
  }, [user.id]);
  const wallet = data?.wallet || user.wallet || {};
  const language = user.language === 'en' ? 'en' : 'es'; const english = language === 'en';
  const availableBalance = Number(wallet.availableBalance || 0); const tier = walletTier(availableBalance); const currency = wallet.currency || 'USDT';
  const toggleBalance = () => setBalanceHidden(current => { const next = !current; try { localStorage.setItem(balanceVisibilityKey, String(next)); } catch {} return next; });
  const privateAmount = value => balanceHidden ? '****' : amount(value);
  const displayedBalance = balanceHidden ? '****' : amount(availableBalance);
  return <div className={`page-stack wallet-page ${celebration ? 'is-celebrating' : ''}`}><header className="page-header"><div><p className="eyebrow">WALLET</p><h1>Wallet</h1><p>{english ? 'Membership income and referral commissions, updated in real time.' : 'Ingresos de membresías y comisiones por referidos, actualizados en tiempo real.'}</p></div></header>
    {celebration && <div className="wallet-celebration" role="status" aria-live="polite">
      <div className="wallet-confetti" aria-hidden="true">{CONFETTI.map(piece => <i key={piece.id} style={{ '--confetti-x': piece.x, '--confetti-delay': piece.delay, '--confetti-duration': piece.duration, '--confetti-spin': piece.spin, '--confetti-color': piece.color }} />)}</div>
      <div className="wallet-celebration-message"><span className="wallet-celebration-icon"><PartyPopper /></span><div><span><Sparkles /> {english ? 'NEW COMMISSION' : 'NUEVA COMISIÓN'}</span><strong>{english ? 'Congratulations!' : '¡Felicitaciones!'}</strong><p>{english ? `You earned +${amount(celebration.amount)} ${currency}${celebration.count > 1 ? ` across ${celebration.count} invitations` : ''}.` : `Ganaste +${amount(celebration.amount)} ${currency}${celebration.count > 1 ? ` en ${celebration.count} invitaciones` : ` por invitar a ${celebration.memberName || celebration.invitationEmail || 'un nuevo miembro'}`}.`}</p></div><button type="button" onClick={() => setCelebration(null)} aria-label={english ? 'Close celebration' : 'Cerrar celebración'}><X /></button></div>
    </div>}
    {tier === 'zero' ? <section className="wallet-hero wallet-zero"><div><p>{english ? 'AVAILABLE BALANCE' : 'BALANCE DISPONIBLE'}</p><h2>{displayedBalance} <span>{currency}</span></h2><small>{english ? 'Verified balance in your account.' : 'Saldo verificado en tu cuenta.'}</small></div><button className="wallet-visibility" type="button" onClick={toggleBalance} aria-label={balanceHidden ? (english ? 'Show balance' : 'Mostrar balance') : (english ? 'Hide balance' : 'Ocultar balance')}>{balanceHidden ? <Eye /> : <EyeOff />}</button></section> : <section className={`wallet-hero earning-wallet tone-${tier}`}>
      <div className="earning-wallet-glow" aria-hidden="true" /><div className="earning-wallet-grid" aria-hidden="true" />
      <div className="earning-wallet-main">
        <div className="earning-wallet-brand"><span className="earning-wallet-emblem"><Orbit /></span><span><strong>PROJECT GALAXY</strong><small>{english ? 'DIGITAL EARNINGS' : 'INGRESOS DIGITALES'}</small></span></div>
        <div className="earning-wallet-balance"><p>{english ? 'TOTAL BALANCE' : 'BALANCE TOTAL'}</p><h2><span className="earning-wallet-amount">{displayedBalance}</span><span className="earning-wallet-unit">{currency}</span></h2><small><i />{english ? 'Available funds' : 'Fondos disponibles'}</small></div>
        <div className="earning-wallet-holder"><span>{english ? 'ACCOUNT HOLDER' : 'TITULAR'}</span><strong>{user.name}</strong></div>
      </div>
      <div className="earning-wallet-side">
        <div className="earning-wallet-side-top"><span className="earning-wallet-status"><i />{english ? 'ACTIVE' : 'ACTIVA'}</span><button className="wallet-visibility" type="button" onClick={toggleBalance} aria-label={balanceHidden ? (english ? 'Show balance' : 'Mostrar balance') : (english ? 'Hide balance' : 'Ocultar balance')}>{balanceHidden ? <Eye /> : <EyeOff />}</button></div>
        <span className="earning-wallet-chip" aria-hidden="true"><i /><i /><i /><i /></span>
        <div className="earning-wallet-title"><small>GALAXY WALLET</small><strong>{english ? 'EARNINGS' : 'GANANCIAS'}</strong><span>{currency} · DIGITAL ASSET</span></div>
      </div>
    </section>}
    <section className="surface registration-panel wallet-summary"><p>{english ? 'Pending' : 'Pendiente'}: {privateAmount(wallet.pendingBalance)} · {english ? 'Total earned' : 'Total ganado'}: {privateAmount(wallet.totalEarned)} · {english ? 'Total spent' : 'Total gastado'}: {privateAmount(wallet.totalSpent)} {currency}</p></section>
    <section className="surface registration-panel"><h2>{english ? 'Transactions and expirations' : 'Movimientos y vencimientos'}</h2>{error && <p role="alert">{error}</p>}{!data && !error && <p>{english ? 'Loading…' : 'Cargando…'}</p>}{data?.entries.length === 0 && <p>{english ? 'There are no membership transactions yet.' : 'Aún no hay movimientos de membresías.'}</p>}
      {data?.entries.map(entry => { const purchase = entry.kind === 'MEMBERSHIP_PURCHASE'; const displayedAmount = purchase ? Math.abs(Number(entry.grossAmount ?? entry.amount)) : Number(entry.amount); return <article className={`membership-ledger-row ${purchase ? 'membership-payment' : displayedAmount >= 0 ? 'membership-income' : ''}`} key={entry.id}><div><strong>{english ? (purchase ? 'Your membership' : entry.kind === 'REFERRAL_COMMISSION' ? 'Referral commission · 10%' : 'Membership income') : entryLabel(entry.kind)}</strong><p>{entry.registrationPending ? entry.invitationEmail : entry.memberName} · {MEMBERSHIP_EMOJI[entry.planCode]} {entry.planCode}</p><small>{new Date(entry.createdAt).toLocaleString(english ? 'en-US' : 'es-CO')} · {english ? 'Membership value' : 'Valor de membresía'}: {privateAmount(entry.grossAmount)} USDT</small><p>{entry.registrationPending ? (english ? 'Commission credited when the invitation was sent.' : 'Comisión acreditada al enviar la invitación.') : <>{english ? (entry.memberDeleted ? 'Deleted account · historical expiration: ' : new Date(entry.expiresAt) <= new Date() ? 'Expired membership: ' : 'Membership active until: ') : (entry.memberDeleted ? 'Cuenta eliminada · vencimiento histórico: ' : new Date(entry.expiresAt) <= new Date() ? 'Membresía vencida: ' : 'Membresía vigente hasta: ')}{new Date(entry.expiresAt).toLocaleString(english ? 'en-US' : 'es-CO')}</>}</p></div><div className="membership-ledger-amount"><small>{english ? (purchase ? 'CONFIRMED PAYMENT' : displayedAmount >= 0 ? 'PAYMENT RECEIVED' : 'TRANSACTION') : (purchase ? 'PAGO CONFIRMADO' : displayedAmount >= 0 ? 'ABONO RECIBIDO' : 'MOVIMIENTO')}</small><strong>{purchase ? '✓ ' : displayedAmount >= 0 ? '+' : ''}{privateAmount(displayedAmount)} USDT</strong></div></article>; })}
    </section></div>;
}
