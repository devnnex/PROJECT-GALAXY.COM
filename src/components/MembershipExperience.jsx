import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Clock3, Copy, Crown, LockKeyhole, Orbit, RefreshCw, ShieldCheck, Sparkles, WalletCards, X } from 'lucide-react';
import { api } from '../services/api';
import { manualPayment, PAYMENT_CONTACT_EMAIL, PAYMENT_NETWORKS } from '../payment-config';

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

export function MembershipProfileCard({ membership, onRenew }) {
  const active = Boolean(membership?.isActive);
  const permanent = Boolean(membership?.isLifetime || membership?.status === 'ADMIN');
  const tone = String(membership?.badgeTone || 'VIOLET').toLowerCase();
  return <section className={`membership-profile-card surface tone-${tone} ${active ? 'active' : 'inactive'}`}>
    <div className="membership-profile-heading"><span className="membership-crown"><Crown /></span><div><p className="eyebrow">GALAXY ACCESS</p><h2>{active ? membership.planName : 'Acceso sin activar'}</h2></div><span className="membership-plan-badge">{active ? membership.planCode : 'FREE'}</span></div>
    {active ? permanent ? <><p>Esta cuenta cuenta con acceso administrativo a todo el trading desk.</p><div className="membership-expiry-line"><ShieldCheck /> Acceso permanente: no requiere pago ni renovación.</div></> : <><p>Tu membresía registrada permanece vigente hasta el vencimiento indicado.</p><MembershipCountdown expiresAt={membership.expiresAt} /><div className="membership-expiry-line"><ShieldCheck /> Vence el {new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(membership.expiresAt))}</div></> : <p>El acceso a reuniones y LIVE está abierto para toda cuenta activa. Los planes se gestionan mediante confirmación manual.</p>}
    {!permanent && <button className={active ? 'secondary-button' : 'primary-button'} onClick={onRenew}>{active ? 'Ver planes' : 'Apoyar con una membresía'} <ArrowRight /></button>}
  </section>;
}

export function MembershipCheckoutModal({ plans = [], membership, initialPlanCode = '', onClose, toast }) {
  const [selectedCode, setSelectedCode] = useState(initialPlanCode || plans[0]?.code || ''); const [network, setNetwork] = useState('TRC20');
  const [order, setOrder] = useState(null);
  const selectedPlan = useMemo(() => plans.find((plan) => plan.code === selectedCode) || plans[0], [plans, selectedCode]);

  useEffect(() => {
    if (!order && plans.some((plan) => plan.code === initialPlanCode)) setSelectedCode(initialPlanCode);
  }, [initialPlanCode, order, plans]);

  const createPayment = () => {
    if (!selectedPlan) return toast('Los planes todavía no están disponibles en Supabase.', 'error');
    setOrder(manualPayment({ network, amount: selectedPlan.priceUsd, item: selectedPlan.name }));
  };

  const copy = async (value, label) => { await navigator.clipboard.writeText(String(value)); toast(`${label} copiado.`); };
  const isAdministrator = Boolean(membership?.isLifetime || membership?.status === 'ADMIN');
  if (isAdministrator) return <div className="modal-backdrop membership-modal-backdrop" onMouseDown={onClose}><section className="membership-checkout glass" role="dialog" aria-modal="true" aria-labelledby="membership-checkout-title" onMouseDown={(event) => event.stopPropagation()}>
    <button className="icon-button modal-close" onClick={onClose} aria-label="Cerrar"><X /></button>
    <header><span className="membership-checkout-mark"><Crown /></span><div><p className="eyebrow">PROJECT GALAXY ADMINISTRATION</p><h1 id="membership-checkout-title">Acceso permanente habilitado</h1><p>Tu cuenta administradora tiene acceso completo y no requiere membresía ni pago.</p></div></header>
    <div className="membership-payment-request"><div className="payment-warning"><ShieldCheck /><p>Las operativas XAUUSD de lunes a viernes, análisis LIVE, chat y pantalla compartida están disponibles para esta cuenta.</p></div><button className="primary-button" onClick={onClose}>Continuar <ArrowRight /></button></div>
  </section></div>;
  return <div className="modal-backdrop membership-modal-backdrop" onMouseDown={onClose}><section className="membership-checkout glass" role="dialog" aria-modal="true" aria-labelledby="membership-checkout-title" onMouseDown={(event) => event.stopPropagation()}>
    <button className="icon-button modal-close" onClick={onClose} aria-label="Cerrar"><X /></button>
    <header><span className="membership-checkout-mark"><Orbit /></span><div><p className="eyebrow">PROJECT GALAXY XAUUSD MEMBERSHIP</p><h1 id="membership-checkout-title">{order ? 'Datos para pago manual' : membership?.isActive ? 'Elige otro plan' : 'Apoya la comunidad'}</h1><p>{order ? 'Realiza la transferencia y envía el comprobante al administrador.' : 'Las reuniones están abiertas; estos planes se confirman manualmente.'}</p></div></header>
    {!order ? <>
      <div className="membership-plan-grid">{plans.map((plan) => <button className={`membership-plan-option tone-${String(plan.badgeTone).toLowerCase()} ${selectedPlan?.code === plan.code ? 'selected' : ''}`} onClick={() => setSelectedCode(plan.code)} key={plan.code}><span>{plan.name}</span><strong>{money(plan.priceUsd)}</strong><small>{plan.durationMonths === 1 ? '1 mes' : `${plan.durationMonths} meses`}</small>{selectedPlan?.code === plan.code && <Check />}</button>)}</div>
      <div className="membership-network"><div><p className="eyebrow">RED DE PAGO</p><h3>Selecciona dónde enviarás USDT</h3></div><div>{Object.entries(PAYMENT_NETWORKS).map(([code, item]) => <button className={network === code ? 'selected' : ''} onClick={() => setNetwork(code)} key={code}><span>{item.label}</span><small>{item.note}</small>{network === code && <Check />}</button>)}</div></div>
      <div className="membership-total"><span>Total del plan</span><strong>{money(selectedPlan?.priceUsd)} <small>USD pagaderos en USDT</small></strong></div>
      <button className="primary-button membership-create-payment" disabled={!plans.length} onClick={createPayment}>Mostrar wallet y QR <ArrowRight /></button>
      <p className="membership-provider-note"><LockKeyhole /> Pago directo y confirmación manual. Nunca solicitamos tu frase semilla.</p>
    </> : <div className="membership-payment-request">
      <div className="payment-network-badge"><span>{order.network}</span><small>{order.payCurrency?.toUpperCase()}</small></div>
      <img className="payment-wallet-qr" src={order.qr} alt={`QR de la wallet USDT ${order.network}`} />
      <div className="payment-amount"><span>IMPORTE</span><strong>{order.payAmount} <small>USDT</small></strong><button onClick={() => copy(order.payAmount, 'Importe')}><Copy /> Copiar</button></div>
      <div className="payment-address"><span>DIRECCIÓN DE DEPÓSITO · {order.network}</span><code>{order.payAddress}</code><button onClick={() => copy(order.payAddress, 'Dirección')}><Copy /> Copiar dirección</button></div>
      <div className="payment-warning"><ShieldCheck /><p>Envía únicamente USDT por <strong>{order.network}</strong>. Usar otra red puede provocar una pérdida irreversible.</p></div>
      <div className="payment-status"><span className="payment-status-dot awaiting_payment" /><div><strong>Confirmación manual</strong><small>Después de pagar, envía el comprobante y hash de la transacción a {PAYMENT_CONTACT_EMAIL}.</small></div></div>
      <button className="text-button" onClick={() => setOrder(null)}>Elegir otro plan o red</button>
    </div>}
  </section></div>;
}

export function ScannerCheckoutModal({ onClose, toast }) {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try { const result = await api.getScannerDownload(); globalThis.location.assign(result.downloadUrl); }
    catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };
  return <div className="modal-backdrop membership-modal-backdrop" onMouseDown={onClose}><section className="membership-checkout glass" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
    <button className="icon-button modal-close" onClick={onClose} aria-label="Cerrar"><X /></button>
    <header><span className="membership-checkout-mark"><Sparkles /></span><div><p className="eyebrow">PRIVATE OWNER TOOL</p><h1>Scanner Power Elite</h1><p>Este recurso privado está disponible únicamente para la cuenta propietaria.</p></div></header>
    <div className="membership-payment-request"><div className="payment-warning"><ShieldCheck /><p>El enlace de descarga es privado, se valida nuevamente en el servidor y expira en 60 segundos.</p></div><button className="primary-button" disabled={busy} onClick={download}>{busy ? 'Preparando…' : 'Descargar SCANNER-POWER-ELITE.pine'} <ArrowRight /></button></div>
  </section></div>;
}

export function MembershipOrdersPage({ orders = [], onRefresh }) {
  return <div className="page-stack"><header className="page-header"><div><p className="eyebrow">PURCHASES</p><h1>Mis órdenes</h1><p>El checkout actual utiliza comprobación manual; aquí solo permanecen registros históricos.</p></div><button className="secondary-button" onClick={onRefresh}><RefreshCw /> Actualizar</button></header>
    <section className="surface membership-orders"><div className="table-head"><span>ORDEN</span><span>PRODUCTO / PLAN</span><span>RED</span><span>IMPORTE</span><span>ESTADO</span></div>{orders.length ? orders.map((order) => <article key={order.id}><code>{order.id.slice(0, 8).toUpperCase()}</code><strong>{order.itemCode || order.planCode}</strong><span>{order.network}</span><span>{order.payAmount ? `${order.payAmount} USDT` : money(order.priceUsd)}</span><span className={`order-status ${String(order.status).toLowerCase()}`}>{order.status}</span></article>) : <div className="membership-orders-empty"><WalletCards /><h3>No hay órdenes automáticas</h3><p>Envía tu comprobante directamente al administrador después de realizar el pago manual.</p></div>}</section>
  </div>;
}
