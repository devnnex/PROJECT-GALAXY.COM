import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Clock3, Copy, Crown, LockKeyhole, Orbit, RefreshCw, ShieldCheck, Sparkles, WalletCards, X } from 'lucide-react';
import { api } from '../services/api';

const TERMINAL_PAYMENT_STATES = new Set(['FINISHED', 'FAILED', 'REFUNDED', 'EXPIRED']);
const money = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(value || 0));

function remainingParts(expiresAt) {
  const total = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  return { total, days: Math.floor(total / 86400), hours: Math.floor(total % 86400 / 3600), minutes: Math.floor(total % 3600 / 60), seconds: total % 60 };
}

function MembershipCountdown({ expiresAt, compact = false }) {
  const [remaining, setRemaining] = useState(() => remainingParts(expiresAt));
  useEffect(() => {
    const update = () => setRemaining(remainingParts(expiresAt)); update();
    const timer = setInterval(update, 1000); return () => clearInterval(timer);
  }, [expiresAt]);
  if (!expiresAt || remaining.total <= 0) return <span className="membership-expired">Membresía vencida</span>;
  return <div className={`membership-countdown ${compact ? 'compact' : ''}`} aria-label="Tiempo restante de membresía">
    {[['DÍAS', remaining.days], ['HORAS', remaining.hours], ['MIN', remaining.minutes], ['SEG', remaining.seconds]].map(([label, value]) => <span key={label}><strong>{String(value).padStart(2, '0')}</strong><small>{label}</small></span>)}
  </div>;
}

export function MembershipGate({ section, onChoosePlan }) {
  return <section className="membership-gate surface">
    <div className="membership-gate-orbit"><span /><Orbit /></div>
    <p className="eyebrow">GALAXY MEMBERSHIP</p>
    <h1>{section} es un espacio para miembros.</h1>
    <p>Activa tu cuenta para acceder a reuniones privadas, sesiones LIVE, chat y pantalla compartida.</p>
    <div className="membership-gate-features"><span><ShieldCheck /> Acceso validado por Supabase</span><span><Clock3 /> Vigencia exacta por plan</span><span><WalletCards /> USDT TRC20 o ERC20</span></div>
    <button className="primary-button" onClick={onChoosePlan}>Ver membresías <ArrowRight /></button>
  </section>;
}

export function MembershipProfileCard({ membership, onRenew }) {
  const active = Boolean(membership?.isActive);
  const permanent = Boolean(membership?.isLifetime || membership?.status === 'ADMIN');
  const tone = String(membership?.badgeTone || 'VIOLET').toLowerCase();
  return <section className={`membership-profile-card surface tone-${tone} ${active ? 'active' : 'inactive'}`}>
    <div className="membership-profile-heading"><span className="membership-crown"><Crown /></span><div><p className="eyebrow">GALAXY ACCESS</p><h2>{active ? membership.planName : 'Acceso sin activar'}</h2></div><span className="membership-plan-badge">{active ? membership.planCode : 'FREE'}</span></div>
    {active ? permanent ? <><p>Esta cuenta cuenta con acceso administrativo a toda la plataforma.</p><div className="membership-expiry-line"><ShieldCheck /> Acceso permanente: no requiere pago ni renovación.</div></> : <><p>Tu acceso premium permanece habilitado hasta el vencimiento indicado.</p><MembershipCountdown expiresAt={membership.expiresAt} /><div className="membership-expiry-line"><ShieldCheck /> Vence el {new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(membership.expiresAt))}</div></> : <p>Activa una membresía para entrar a reuniones y sesiones en vivo.</p>}
    {!permanent && <button className={active ? 'secondary-button' : 'primary-button'} onClick={onRenew}>{active ? 'Renovar o cambiar plan' : 'Activar membresía'} <ArrowRight /></button>}
  </section>;
}

export function MembershipCheckoutModal({ plans = [], membership, initialPlanCode = '', onClose, onActivated, toast }) {
  const [selectedCode, setSelectedCode] = useState(initialPlanCode || plans[0]?.code || ''); const [network, setNetwork] = useState('TRC20');
  const [order, setOrder] = useState(null); const [busy, setBusy] = useState(false); const [checking, setChecking] = useState(false);
  const selectedPlan = useMemo(() => plans.find((plan) => plan.code === selectedCode) || plans[0], [plans, selectedCode]);
  const status = String(order?.status || '').toUpperCase();

  const refreshPayment = async (silent = false) => {
    if (!order?.id || checking) return;
    setChecking(true);
    try {
      const result = await api.refreshMembershipPayment(order.id);
      setOrder((current) => ({ ...current, status: result.status }));
      if (result.status === 'FINISHED' && result.membership?.isActive) onActivated(result.membership);
      else if (!silent) toast(result.status === 'PARTIALLY_PAID' ? 'El importe recibido aún está incompleto.' : 'El pago todavía está siendo confirmado.', 'info');
    } catch (error) { if (!silent) toast(error.message, 'error'); }
    finally { setChecking(false); }
  };

  useEffect(() => {
    if (!order?.id || TERMINAL_PAYMENT_STATES.has(status)) return undefined;
    const timer = setInterval(() => refreshPayment(true), 8000); return () => clearInterval(timer);
  }, [order?.id, status]);

  useEffect(() => {
    if (!order && plans.some((plan) => plan.code === initialPlanCode)) setSelectedCode(initialPlanCode);
  }, [initialPlanCode, order, plans]);

  const createPayment = async () => {
    if (!selectedPlan) return toast('Los planes todavía no están disponibles en Supabase.', 'error');
    setBusy(true);
    try { const result = await api.createMembershipPayment({ planCode: selectedPlan.code, network }); setOrder(result.order); }
    catch (error) { toast(error.message, 'error'); }
    finally { setBusy(false); }
  };

  const copy = async (value, label) => { await navigator.clipboard.writeText(String(value)); toast(`${label} copiado.`); };
  const isAdministrator = Boolean(membership?.isLifetime || membership?.status === 'ADMIN');
  if (isAdministrator) return <div className="modal-backdrop membership-modal-backdrop" onMouseDown={onClose}><section className="membership-checkout glass" role="dialog" aria-modal="true" aria-labelledby="membership-checkout-title" onMouseDown={(event) => event.stopPropagation()}>
    <button className="icon-button modal-close" onClick={onClose} aria-label="Cerrar"><X /></button>
    <header><span className="membership-checkout-mark"><Crown /></span><div><p className="eyebrow">PROJECT GALAXY ADMINISTRATION</p><h1 id="membership-checkout-title">Acceso permanente habilitado</h1><p>Tu cuenta administradora tiene acceso completo y no requiere membresía ni pago.</p></div></header>
    <div className="membership-payment-request"><div className="payment-warning"><ShieldCheck /><p>Las reuniones, sesiones LIVE, chat y pantalla compartida están disponibles para esta cuenta.</p></div><button className="primary-button" onClick={onClose}>Continuar <ArrowRight /></button></div>
  </section></div>;
  return <div className="modal-backdrop membership-modal-backdrop" onMouseDown={onClose}><section className="membership-checkout glass" role="dialog" aria-modal="true" aria-labelledby="membership-checkout-title" onMouseDown={(event) => event.stopPropagation()}>
    <button className="icon-button modal-close" onClick={onClose} aria-label="Cerrar"><X /></button>
    <header><span className="membership-checkout-mark"><Orbit /></span><div><p className="eyebrow">PROJECT GALAXY MEMBERSHIP</p><h1 id="membership-checkout-title">{order ? 'Completa tu pago' : membership?.isActive ? 'Extiende tu acceso' : 'Activa tu cuenta'}</h1><p>{order ? 'Envía exactamente el importe indicado por la red seleccionada.' : 'Elige la duración que mejor se adapte a tus sesiones.'}</p></div></header>
    {!order ? <>
      <div className="membership-plan-grid">{plans.map((plan) => <button className={`membership-plan-option tone-${String(plan.badgeTone).toLowerCase()} ${selectedPlan?.code === plan.code ? 'selected' : ''}`} onClick={() => setSelectedCode(plan.code)} key={plan.code}><span>{plan.name}</span><strong>{money(plan.priceUsd)}</strong><small>{plan.durationMonths === 1 ? '1 mes' : `${plan.durationMonths} meses`}</small>{selectedPlan?.code === plan.code && <Check />}</button>)}</div>
      <div className="membership-network"><div><p className="eyebrow">RED DE PAGO</p><h3>Selecciona dónde enviarás USDT</h3></div><div>{[['TRC20', 'TRON · TRC20', 'Comisión usualmente menor'], ['ERC20', 'Ethereum · ERC20', 'Revisa la comisión de gas']].map(([code, label, note]) => <button className={network === code ? 'selected' : ''} onClick={() => setNetwork(code)} key={code}><span>{label}</span><small>{note}</small>{network === code && <Check />}</button>)}</div></div>
      <div className="membership-total"><span>Total del plan</span><strong>{money(selectedPlan?.priceUsd)} <small>USD pagaderos en USDT</small></strong></div>
      <button className="primary-button membership-create-payment" disabled={busy || !plans.length} onClick={createPayment}>{busy ? 'Creando orden segura…' : 'Continuar a la pasarela'} <ArrowRight /></button>
      <p className="membership-provider-note"><LockKeyhole /> Procesado por NOWPayments. PROJECT GALAXY nunca solicita tu frase semilla ni tu clave privada.</p>
    </> : <div className="membership-payment-request">
      <div className="payment-network-badge"><span>{order.network}</span><small>{order.payCurrency?.toUpperCase()}</small></div>
      <div className="payment-amount"><span>IMPORTE EXACTO</span><strong>{order.payAmount} <small>USDT</small></strong><button onClick={() => copy(order.payAmount, 'Importe')}><Copy /> Copiar</button></div>
      <div className="payment-address"><span>DIRECCIÓN DE DEPÓSITO · {order.network}</span><code>{order.payAddress}</code><button onClick={() => copy(order.payAddress, 'Dirección')}><Copy /> Copiar dirección</button></div>
      <div className="payment-warning"><ShieldCheck /><p>Envía únicamente USDT por <strong>{order.network}</strong>. Usar otra red puede provocar una pérdida irreversible.</p></div>
      <div className="payment-status"><span className={`payment-status-dot ${status.toLowerCase()}`} /><div><strong>{status === 'WAITING' ? 'Esperando el pago' : status === 'PARTIALLY_PAID' ? 'Pago incompleto' : 'Confirmando en blockchain'}</strong><small>La membresía se activará únicamente después de la verificación final.</small></div>{order.expiresAt && <MembershipCountdown compact expiresAt={order.expiresAt} />}</div>
      <button className="primary-button" disabled={checking} onClick={() => refreshPayment(false)}>{checking ? <RefreshCw className="spin" /> : <RefreshCw />} {checking ? 'Verificando…' : 'Ya realicé el pago'}</button>
      <button className="text-button" onClick={() => setOrder(null)}>Elegir otro plan o red</button>
    </div>}
  </section></div>;
}

export function MembershipActivationModal({ membership, onClose, onOpenSessions }) {
  if (!membership?.isActive) return null;
  return <div className="modal-backdrop membership-success-backdrop"><section className={`membership-success glass tone-${String(membership.badgeTone || 'VIOLET').toLowerCase()}`} role="dialog" aria-modal="true">
    <button className="icon-button modal-close" onClick={onClose}><X /></button><div className="membership-success-orbit"><span /><Sparkles /></div>
    <p className="eyebrow">PAYMENT VERIFIED</p><h1>Tu membresía está activa.</h1><p>{membership.planName} ya forma parte de tu cuenta. Reuniones y sesiones LIVE han sido habilitadas.</p>
    <span className="membership-plan-badge">{membership.planCode}</span><MembershipCountdown expiresAt={membership.expiresAt} />
    <button className="primary-button" onClick={onOpenSessions}>Entrar a reuniones <ArrowRight /></button>
  </section></div>;
}

export function MembershipOrdersPage({ orders = [], onRefresh }) {
  return <div className="page-stack"><header className="page-header"><div><p className="eyebrow">PURCHASES</p><h1>Mis órdenes</h1><p>Pagos de membresía registrados y verificados por el backend.</p></div><button className="secondary-button" onClick={onRefresh}><RefreshCw /> Actualizar</button></header>
    <section className="surface membership-orders"><div className="table-head"><span>ORDEN</span><span>PLAN</span><span>RED</span><span>IMPORTE</span><span>ESTADO</span></div>{orders.length ? orders.map((order) => <article key={order.id}><code>{order.id.slice(0, 8).toUpperCase()}</code><strong>{order.planCode}</strong><span>{order.network}</span><span>{order.payAmount ? `${order.payAmount} USDT` : money(order.priceUsd)}</span><span className={`order-status ${String(order.status).toLowerCase()}`}>{order.status}</span></article>) : <div className="membership-orders-empty"><WalletCards /><h3>No hay órdenes de membresía</h3><p>Tu primera solicitud aparecerá aquí al entrar a la pasarela.</p></div>}</section>
  </div>;
}
