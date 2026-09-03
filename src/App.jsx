import { useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowRight, Bell, Bookmark, Boxes, CalendarDays, Check, ChevronDown, CircleDollarSign,
  Clock3, Compass, Copy, CreditCard, Eye, Heart, Home, KeyRound, LayoutGrid, LockKeyhole,
  ImagePlus, LogOut, Menu, MessageCircle, Mic2, MoreHorizontal, Orbit, Package, Play, Plus, Radio,
  Search, Send, Settings, ShieldCheck, ShoppingBag, Sparkles, Star, TrendingUp, User,
  Users, Video, Volume2, WalletCards, X, Zap, Trash2,
} from 'lucide-react';
import { CONFIG } from './config';
import { api } from './services/api';
import { feed, products } from './data';
import { manualPayment, PAYMENT_CONTACT_EMAIL, PAYMENT_NETWORKS } from './payment-config';
import NeuralCanvas from './components/NeuralCanvas';
import AuthGate from './components/AuthGate';
import MeetingStudio from './components/MeetingStudio';
import CalendarPage from './components/CalendarPage';
import ConstellationAvatar from './components/ConstellationAvatar';
import { MembershipCheckoutModal, MembershipOrdersPage, MembershipProfileCard, ScannerCheckoutModal } from './components/MembershipExperience';

const SCANNER_OWNER_EMAIL = 'elkin56ty@gmail.com';
const isScannerOwner = (user) => String(user?.email || '').trim().toLowerCase() === SCANNER_OWNER_EMAIL;
const catalogFor = () => products;

const navigation = [
  ['dashboard', 'Inicio', Home], ['discover', 'Descubrir', Compass], ['marketplace', 'Marketplace', ShoppingBag],
  ['live', 'En vivo', Radio], ['meetings', 'Reuniones', Video], ['calendar', 'Calendario', CalendarDays], ['messages', 'Mensajes', MessageCircle],
  ['wallet', 'Wallet', WalletCards], ['orders', 'Órdenes', Package], ['users', 'Usuarios', Users], ['profile', 'Perfil', User],
];
const memberNavigation = navigation.filter(([id]) => ['marketplace', 'meetings', 'calendar', 'messages', 'wallet', 'orders', 'profile'].includes(id));

const membershipMarketplacePlans = [
  { code: 'MONTHLY', name: 'Órbita mensual', duration: '1 mes', price: 80, tone: 'violet', note: 'Acceso flexible' },
  { code: 'QUARTERLY', name: 'Nexo trimestral', duration: '3 meses', price: 250, tone: 'cyan', note: 'Ritmo continuo' },
  { code: 'SEMESTER', name: 'Horizonte semestral', duration: '6 meses', price: 499, tone: 'amber', note: 'Mayor continuidad' },
  { code: 'ANNUAL', name: 'Constelación anual', duration: '12 meses', price: 999, tone: 'platinum', note: 'Acceso anual' },
];

function Brand() { return <div className="brand"><span className="brand-mark"><Orbit /></span><span>{CONFIG.APP_NAME}</span></div>; }

function Toast({ item }) { return item && <div className={`toast ${item.kind || ''}`} role="status"><span className="toast-orbit"><Check /></span><div><strong>{item.kind === 'error' ? 'Revisa esta acción' : 'Sistema actualizado'}</strong><p>{item.message}</p></div></div>; }

function Landing({ onEnter }) {
  return <main className="landing">
    <NeuralCanvas />
    <nav className="landing-nav"><Brand /><div className="landing-links"><a href="#ecosystem">Metodología</a><a href="#principles">Disciplina</a><button className="nav-enter" onClick={onEnter}>Entrar <ArrowRight /></button></div></nav>
    <section className="hero">
      <div className="hero-kicker"><span /> XAUUSD · LIQUIDITY INTELLIGENCE</div>
      <h1>READ LIQUIDITY.<br /><em>TRADE THE KILL ZONE.</em></h1>
      <p>Operativas en vivo de lunes a viernes para estudiar el oro digital (XAUUSD), leer liquidez y preparar cada sesión con contexto profesional.</p>
      <div className="hero-actions"><button className="primary-button" onClick={onEnter}>Entrar al trading desk <ArrowRight /></button><a className="secondary-button" href="#ecosystem">Explorar metodología</a></div>
      <div className="hero-orbit" aria-hidden="true"><div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><span className="orbit-core"><Orbit /></span><span className="satellite s1" /><span className="satellite s2" /></div>
      <div className="hero-proof"><span>01</span><p>Un plan.<br />Una ejecución consciente.</p><span className="proof-line" /><div><b>XAU</b><small>LIQUIDEZ<br />Y SESIONES</small></div></div>
    </section>
    <section className="ecosystem-section" id="ecosystem"><p className="eyebrow">THE XAUUSD WORKFLOW</p><h2>Operativa acompañada, lectura y disciplina en una misma sala.</h2><div className="ecosystem-grid">{[['SCAN', Users, 'Observa estructura, sesiones y contexto de XAUUSD de lunes a viernes.'], ['MAP', Sparkles, 'Marca pools de liquidez, rangos y niveles de interés con explicación.'], ['REPLAY', Radio, 'Revisa la narrativa del precio antes y después de cada operativa.'], ['MEET', Video, 'Participa en acompañamientos de London y New York en tiempo real.'], ['JOURNAL', TrendingUp, 'Documenta hipótesis, ejecución y aprendizaje operativo.'], ['EXECUTE', CircleDollarSign, 'Decisiones con gestión de riesgo; nunca promesas de rentabilidad.']].map(([name, Icon, text], i) => <article key={name}><span>0{i + 1}</span><Icon /><h3>{name}</h3><p>{text}</p></article>)}</div></section>
    <section className="principles" id="principles"><div><p className="eyebrow">BUILT FOR DISCIPLINE</p><h2>Liquidez primero.<br />Ejecución después.</h2></div><p>PROJECT GALAXY es un entorno educativo y colaborativo para análisis de XAUUSD. No ofrece asesoría financiera ni garantiza resultados; cada operación exige criterio y gestión de riesgo.</p></section>
    <footer><Brand /><p>Inteligencia de liquidez para XAUUSD.</p><span>© 2026 · XAUUSD EDITION</span></footer>
  </main>;
}

function Metric({ icon: Icon, label, value, note, tone }) { return <article className={`metric-card ${tone || ''}`}><div className="metric-head"><span>{label}</span><Icon /></div><strong>{value}</strong><small>{note}</small></article>; }

function Dashboard({ user, navigate, openProduct }) {
  const wallet = user.wallet || {}; const currency = wallet.currency || 'USDT'; const level = Number(user.level || 1); const xp = Number(user.xp || 0);
  return <div className="page-stack">
    <header className="page-header"><div><p className="eyebrow">XAUUSD COMMAND CENTER</p><h1>Bienvenido de vuelta, {user.name.split(' ')[0]}.</h1><p>Prepárate para las operativas en vivo y la próxima Kill Zone.</p></div><button className="primary-button compact" onClick={() => navigate('discover')}><Plus /> Analizar</button></header>
    <div className="metrics"><Metric icon={WalletCards} label="Balance disponible" value={`${Number(wallet.availableBalance || 0).toFixed(2)} ${currency}`} note="Saldo registrado en Supabase" /><Metric icon={Activity} label="Nivel actual" value={level} note="Progreso verificado" tone="blue" /><Metric icon={Sparkles} label="XP acumulados" value={xp} note="Sin estimaciones locales" tone="rose" /></div>
    <div className="dashboard-grid"><section className="surface activity-panel"><div className="section-title"><div><p className="eyebrow">MARKET CONTEXT</p><h2>Bitácora de sesión</h2></div></div><EmptyState icon={Activity} title="Sin análisis registrados" text="Aquí aparecerán tus lecturas de estructura, liquidez y operativas de XAUUSD." /></section><section className="surface next-meeting"><div className="section-title"><div><p className="eyebrow">KILL ZONE</p><h2>Sala de análisis</h2></div><Video /></div><div className="meeting-art"><span className="pulse-ring" /><Orbit /></div><h3>Operativas en vivo</h3><p>Acompañamiento de lunes a viernes para estudiar XAUUSD antes de London o New York.</p><button className="primary-button" onClick={() => navigate('meetings')}>Abrir sesiones <ArrowRight /></button></section></div>
    <section><div className="section-title"><div><p className="eyebrow">TRADING TOOLKIT</p><h2>Herramientas para XAUUSD</h2></div><button className="text-button" onClick={() => navigate('marketplace')}>Marketplace <ArrowRight /></button></div><ProductGrid items={catalogFor(user).slice(0, 3)} onOpen={openProduct} /></section>
  </div>;
}

function FeedPage({ toast }) {
  const [items, setItems] = useState(feed.map((item) => ({ ...item, liked: false, saved: false, reply: false })));
  const toggle = (id, key) => setItems(items.map((item) => item.id === id ? { ...item, [key]: !item[key], ...(key === 'liked' ? { likes: item.likes + (item.liked ? -1 : 1) } : {}) } : item));
  return <div className="feed-layout"><section><header className="page-header"><div><p className="eyebrow">XAUUSD MARKET PULSE</p><h1>Descubrir</h1><p>Contexto, sesiones y lecturas de liquidez compartidas por el desk.</p></div></header><div className="composer surface"><div className="avatar">XAU</div><button onClick={() => toast('El editor completo se habilitará con el módulo de almacenamiento configurado.', 'info')}>Comparte tu lectura de liquidez…</button><button className="icon-button" onClick={() => toast('El editor completo se habilitará con el módulo de almacenamiento configurado.', 'info')}><Plus /></button></div>{items.map((post) => <article className="post surface" key={post.id}><div className="post-head"><div className="avatar">{post.initials}</div><div><strong>{post.author}</strong><p>{post.handle} · {post.time}</p></div><button className="icon-button" onClick={() => toast('Las acciones de moderación se habilitan al conectar el backend.', 'info')}><MoreHorizontal /></button></div><span className="post-tag">{post.tag}</span><p className="post-copy">{post.text}</p><div className="post-visual"><div className="visual-grid" /><div className="visual-orbit"><Orbit /></div><span>{post.id === 1 ? 'XAUUSD / LIQUIDITY' : 'KILL ZONE / LONDON'}</span></div><div className="post-actions"><button className={post.liked ? 'liked' : ''} onClick={() => toggle(post.id, 'liked')}><Heart /> {post.likes}</button><button onClick={() => toggle(post.id, 'reply')}><MessageCircle /> {post.comments}</button><button onClick={() => navigator.clipboard?.writeText(location.href).then(() => toast('Enlace copiado.'))}><Send /> Compartir</button><button className={post.saved ? 'saved' : ''} onClick={() => toggle(post.id, 'saved')}><Bookmark /></button></div>{post.reply && <form className="reply-box" onSubmit={(event) => { event.preventDefault(); event.currentTarget.reset(); toast('Comentario guardado en esta sesión local.'); }}><input required placeholder="Responde con contexto de mercado…" /><button className="icon-button"><Send /></button></form>}</article>)}</section><aside className="discover-side"><div className="surface"><p className="eyebrow">MARKET SIGNALS</p>{['#XAUUSD', '#LiquiditySweep', '#LondonKillZone', '#NewYorkSession'].map((tag, i) => <button key={tag} onClick={() => toast(`Filtro ${tag} preparado para esta vista.`, 'info')}><span>0{i + 1}</span><div><strong>{tag}</strong><small>{4.8 - i}.k señales</small></div></button>)}</div><div className="surface people-card"><p className="eyebrow">TRADING DESKS</p>{['London Desk', 'New York Desk', 'Liquidity Lab'].map((name) => <div className="person" key={name}><div className="avatar avatar-sm">{name.slice(0, 2)}</div><span>{name}</span><button onClick={(e) => { e.currentTarget.textContent = e.currentTarget.textContent === 'Seguir' ? 'Siguiendo' : 'Seguir'; }}>Seguir</button></div>)}</div></aside></div>;
}

const PROMOTION_CYCLE_MS = 24 * 60 * 60 * 1000;
function PromotionCountdown({ compact = false }) {
  const remainingNow = () => PROMOTION_CYCLE_MS - (Date.now() % PROMOTION_CYCLE_MS);
  const [remaining, setRemaining] = useState(remainingNow);
  useEffect(() => { const timer = setInterval(() => setRemaining(remainingNow()), 1000); return () => clearInterval(timer); }, []);
  const totalSeconds = Math.max(0, Math.floor(remaining / 1000));
  const pad = (value) => String(value).padStart(2, '0');
  const time = `${pad(Math.floor(totalSeconds / 3600))}:${pad(Math.floor((totalSeconds % 3600) / 60))}:${pad(totalSeconds % 60)}`;
  return <div className={`promotion-countdown ${compact ? 'compact' : ''}`}><Clock3 /><span><strong>{time}</strong><small>Se renueva cada 24 horas</small></span></div>;
}

function ProductCard({ product, onOpen }) { const [saved, setSaved] = useState(false); return <article className="product-card surface" onClick={() => onOpen(product)}><div className={`product-art ${product.tone} ${product.image ? 'has-product-image' : ''}`}>{product.image ? <img className="product-image" src={product.image} alt={product.title} /> : <><span className="product-mark">{product.mark}</span><div className="orb-art" /></>}{product.kind !== 'membership' && <button className={`icon-button ${saved ? 'saved' : ''}`} aria-label={saved ? 'Quitar de guardados' : 'Guardar'} onClick={(e) => { e.stopPropagation(); setSaved(!saved); }}><Bookmark fill={saved ? 'currentColor' : 'none'} /></button>}{product.originalPrice && <span className="promotion-ribbon">PROMOCIÓN</span>}{product.kind === 'automation-service' && <span className="automation-disclaimer">Resultados no garantizados</span>}</div><div className="product-info"><span>{product.category}</span><h3>{product.title}</h3><p>por {product.seller}</p><div className="product-price-row"><span className="promotional-price">{product.originalPrice && <s>{product.originalPrice} USDT</s>}<strong>{product.kind === 'membership' ? `Desde ${product.price}` : product.price} USDT</strong></span><small>{product.kind === 'membership' ? <><ShieldCheck /> Confirmación manual</> : <><Star /> {product.rating} ({product.reviews})</>}</small></div>{product.promotionCycleHours && <PromotionCountdown compact />}</div></article>; }
function ProductGrid({ items, onOpen }) { return <div className="product-grid">{items.map((p) => <ProductCard key={p.id} product={p} onOpen={onOpen} />)}</div>; }

function MembershipMarketplaceCards({ product, onOpen }) {
  return <section className="membership-marketplace surface">
    <header><div><p className="eyebrow">PROJECT GALAXY XAUUSD SUPPORT</p><h2>Apoya las sesiones de la comunidad.</h2><p>El acceso está abierto para cuentas activas. Si eliges un plan, el pago se realiza directamente y se confirma manualmente.</p></div><span><ShieldCheck /> USDT · TRC20 / ERC20</span></header>
    <div className="membership-marketplace-grid">{membershipMarketplacePlans.map((plan) => <button key={plan.code} className={`membership-marketplace-card tone-${plan.tone}`} onClick={() => onOpen({ ...product, planCode: plan.code })}>
      <div><span>{plan.duration}</span><ShieldCheck /></div><strong>{plan.name}</strong><b>US$ {plan.price}</b><small>{plan.note}</small><em>Elegir plan <ArrowRight /></em>
    </button>)}</div>
  </section>;
}

function Marketplace({ onOpen, user }) {
  const [query, setQuery] = useState(''); const [category, setCategory] = useState('Todos'); const [sort, setSort] = useState('rating');
  const catalog = catalogFor(user);
  const visible = catalog.filter((p) => (category === 'Todos' || p.category === category) && `${p.title} ${p.seller}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === 'rating' ? b.rating - a.rating : a.price - b.price);
  const membershipProduct = visible.find((product) => product.kind === 'membership'); const regularProducts = visible.filter((product) => product.kind !== 'membership');
  const visibleCount = regularProducts.length + (membershipProduct ? membershipMarketplacePlans.length : 0);
  return <div className="page-stack"><header className="market-hero"><div><p className="eyebrow">XAUUSD TRADING DESK</p><h1>Herramientas para<br /><em>leer la liquidez.</em></h1><p>Recursos educativos para preparar Kill Zones, estructura y contexto de XAUUSD.</p></div><div className="market-orbit"><Orbit /></div></header><div className="market-controls"><label className="search-field"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar análisis, herramientas o sesiones…" /></label><button className="secondary-button" onClick={() => setSort(sort === 'rating' ? 'price' : 'rating')}>{sort === 'rating' ? 'Más relevantes' : 'Menor precio'} <ChevronDown /></button></div><div className="category-row">{['Todos', ...new Set(catalog.map((p) => p.category))].map((item) => <button className={category === item ? 'active' : ''} onClick={() => setCategory(item)} key={item}>{item}</button>)}</div><div className="section-title"><div><p className="eyebrow">SELECTED FOR XAUUSD</p><h2>{visibleCount} recursos seleccionados</h2></div></div>{membershipProduct && <MembershipMarketplaceCards product={membershipProduct} onOpen={onOpen} />}{regularProducts.length ? <ProductGrid items={regularProducts} onOpen={onOpen} /> : !membershipProduct && <EmptyState icon={Search} title="Sin coincidencias" text="Prueba con otra palabra o categoría." />}</div>;
}

function ProductModal({ product, onClose, toast, membershipCenter, user }) {
  const [checkout, setCheckout] = useState(false); const [network, setNetwork] = useState(''); const [payment, setPayment] = useState(null);
  if (!product) return null;
  if (product.kind === 'membership') return <MembershipCheckoutModal plans={membershipCenter?.plans || []} membership={membershipCenter?.membership} initialPlanCode={product.planCode} onClose={onClose} toast={toast} />;
  if (product.kind === 'scanner' && isScannerOwner(user)) return <ScannerCheckoutModal product={product} onClose={onClose} toast={toast} />;
  const createPayment = () => {
    if (!network) return toast('Selecciona una red antes de continuar.', 'error');
    setPayment(manualPayment({ network, amount: product.price, item: product.title }));
  };
  return <div className="modal-backdrop"><div className="product-modal glass" role="dialog" aria-modal="true"><button className="icon-button modal-close" onClick={onClose}><X /></button><div className={`product-modal-art ${product.tone} ${product.image ? 'has-product-image' : ''}`}>{product.image ? <img className="product-modal-image" src={product.image} alt={product.title} /> : <><div className="orb-art large" /><span>{product.mark}</span></>}{product.kind === 'automation-service' && <span className="automation-disclaimer modal">Resultados no garantizados</span>}</div><div className="product-modal-copy"><p className="eyebrow">{product.category}</p><h1>{product.title}</h1><p className="seller-line">Creado por <strong>{product.seller}</strong> · <Star /> {product.rating}</p><p>{product.description}</p>{product.promotionCycleHours && <div className="promotion-panel"><div><span>PRECIO PROMOCIONAL</span><s>{product.originalPrice} USDT</s><strong>{product.price} USDT</strong></div><PromotionCountdown /></div>}<ul><li><Check /> Confirmación manual</li><li><Check /> Pago directo en USDT</li><li><Check /> Soporte del creador</li></ul>{!checkout ? <div className="purchase-row"><div>{product.originalPrice && <s>{product.originalPrice} USDT</s>}<strong>{product.price} USDT</strong><span>Pago único</span></div><button className="primary-button" onClick={() => setCheckout(true)}>Adquirir <ArrowRight /></button></div> : !payment ? <div className="checkout-box"><div className="checkout-head"><div><p className="eyebrow">PAGO MANUAL</p><h3>Selecciona la red</h3></div><LockKeyhole /></div><div className="network-options">{Object.entries(PAYMENT_NETWORKS).map(([key, item]) => <button className={network === key ? 'selected' : ''} onClick={() => setNetwork(key)} key={key}><span>{item.label}</span><small>{item.note}</small></button>)}</div><div className="network-warning">Enviar USDT utilizando una red diferente puede provocar pérdida de fondos.</div><div className="checkout-total"><span>Total promocional</span><strong>{product.price} USDT</strong></div><button className="primary-button" onClick={createPayment}>Mostrar wallet y QR</button></div> : <div className="checkout-box"><div className="checkout-head"><div><p className="eyebrow">{payment.label}</p><h3>Datos para transferencia</h3></div><LockKeyhole /></div><img className="payment-wallet-qr" src={payment.qr} alt={`QR USDT ${payment.network}`} /><div className="payment-address"><span>WALLET · {payment.network}</span><code>{payment.payAddress}</code><button onClick={() => navigator.clipboard.writeText(payment.payAddress).then(() => toast('Dirección copiada.'))}><Copy /> Copiar dirección</button></div><div className="checkout-total"><span>Importe promocional</span><strong>{payment.payAmount} USDT</strong></div><div className="network-warning">Envía el comprobante y hash a {PAYMENT_CONTACT_EMAIL}. La confirmación no es automática.</div><button className="text-button" onClick={() => setPayment(null)}>Elegir otra red</button></div>}</div></div></div>;
}

function LivePage({ toast }) { const [following, setFollowing] = useState(false); return <div className="page-stack"><header className="page-header"><div><p className="eyebrow">XAUUSD LIVE DESK</p><h1>Operativas en vivo</h1><p>Acompañamiento profesional de lunes a viernes sobre Kill Zones, estructura y liquidez.</p></div><button className="primary-button compact" onClick={() => toast('Para transmitir a una audiencia configura el servicio SFU, TURN y señalización.', 'info')}><Radio /> Iniciar sesión</button></header><div className="live-feature surface"><div className="live-art"><div className="live-badge">LUNES A VIERNES</div><button className="play-button" onClick={() => toast('Esta pieza visual no representa una transmisión conectada.', 'info')}><Play /></button></div><div><span className="post-tag">XAUUSD · LIQUIDEZ</span><h2>Operativa acompañada para la Kill Zone de New York</h2><p>Estudia el oro digital con explicación de rango asiático, barridos de liquidez y apertura de sesión.</p><div className="person"><div className="avatar">MC</div><span>Galaxy Trading Desk</span><button onClick={() => setFollowing(!following)}>{following ? 'Siguiendo' : 'Seguir'}</button></div></div></div><div className="product-grid">{products.slice(0, 3).map((p, i) => <article className="stream-card surface" key={p.id}><div className={`stream-art ${p.tone}`}><span className="live-badge">LUNES A VIERNES</span><Radio /></div><span>Próxima sesión · {14 + i}:00</span><h3>{['Contexto de Asia y Londres', 'Liquidez y barridos en XAUUSD', 'Plan de ejecución para New York'][i]}</h3><p>{p.seller}</p></article>)}</div></div>; }

function MessagesPage({ toast }) { const [active, setActive] = useState(0); const chats = ['London Desk', 'New York Desk', 'Liquidity Lab']; return <div className="messages-shell surface"><aside className="conversation-list"><div className="panel-heading"><h2>Mensajes</h2><button className="icon-button" onClick={() => toast('Selecciona un contacto para abrir una conversación existente.')}><Plus /></button></div><label className="search-field"><Search /><input placeholder="Buscar" /></label>{chats.map((name, i) => <button className={active === i ? 'active' : ''} onClick={() => setActive(i)} key={name}><div className="avatar">{name.slice(0, 2)}</div><div><strong>{name}</strong><span>{i ? 'Compartió una lectura de mercado' : 'Nos vemos en la Kill Zone ✦'}</span></div><time>{i + 2}m</time></button>)}</aside><section className="conversation"><div className="conversation-head"><div className="avatar">{chats[active].slice(0, 2)}</div><div><strong>{chats[active]}</strong><span>Presencia no conectada</span></div></div><div className="message-space"><span className="date-chip">HOY</span><div className="bubble incoming">¿Listo para revisar la liquidez de XAUUSD?<time>10:34</time></div><div className="bubble outgoing">Sí. Llevo el contexto de Asia para la sesión.<time>10:36</time></div><p className="realtime-note"><Zap /> Los mensajes remotos requieren el servicio realtime configurado.</p></div><form className="message-input" onSubmit={(e) => { e.preventDefault(); e.currentTarget.reset(); toast('Mensaje conservado solo en esta vista; el transporte realtime no está configurado.', 'info'); }}><button type="button" className="icon-button" onClick={() => toast('Los adjuntos requieren configurar el almacenamiento de archivos.', 'info')}><Plus /></button><input required placeholder="Comparte tu lectura de mercado…" /><button className="icon-button"><Send /></button></form></section></div>; }

function WalletPage({ user }) { const wallet = user.wallet || {}; const currency = wallet.currency || 'USDT'; const amount = (value) => Number(value || 0).toFixed(2); return <div className="page-stack"><header className="page-header"><div><p className="eyebrow">VALUE LAYER</p><h1>Wallet</h1><p>Una vista auditable de tu actividad económica.</p></div></header><section className="wallet-hero"><div><p>BALANCE DISPONIBLE</p><h2>{amount(wallet.availableBalance)} <span>{currency}</span></h2><small>Saldo verificado en tu cuenta</small></div><div className="wallet-mark"><WalletCards /></div></section><div className="metrics wallet-metrics"><Metric icon={Clock3} label="Pendiente" value={amount(wallet.pendingBalance)} note={currency} /><Metric icon={TrendingUp} label="Total ganado" value={amount(wallet.totalEarned)} note={currency} /><Metric icon={ShoppingBag} label="Total gastado" value={amount(wallet.totalSpent)} note={currency} /></div><section className="surface transactions"><div className="section-title"><div><p className="eyebrow">LEDGER</p><h2>Transacciones</h2></div></div><EmptyState icon={CreditCard} title="Aún no hay movimientos" text="Los pagos aparecerán después de ser verificados por el backend." /></section></div>; }
function OrdersPage() { return <div className="page-stack"><header className="page-header"><div><p className="eyebrow">PURCHASES</p><h1>Mis órdenes</h1><p>Estado verificable de cada compra.</p></div></header><section className="surface"><div className="table-head"><span>ORDEN</span><span>PRODUCTO</span><span>RED</span><span>IMPORTE</span><span>ESTADO</span></div><EmptyState icon={Package} title="No hay órdenes" text="Una orden aparecerá aquí después de crear una solicitud real de compra." /></section></div>; }
function ProfileEditor({ user, onClose, onSaved }) {
  const [form, setForm] = useState({ name: user.name || '', username: user.username || '', bio: user.bio || '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [avatarFile, setAvatarFile] = useState(null); const [avatarPreview, setAvatarPreview] = useState(''); const [removeAvatar, setRemoveAvatar] = useState(false);
  useEffect(() => () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview); }, [avatarPreview]);
  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.name === 'username' ? event.target.value.toLowerCase() : event.target.value }));
  const selectAvatar = (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Selecciona una imagen JPG, PNG o WebP.'); event.target.value = ''; return; }
    if (file.size > 5 * 1024 * 1024) { setError('La foto de perfil debe pesar como máximo 5 MB.'); event.target.value = ''; return; }
    setError(''); setAvatarFile(file); setRemoveAvatar(false); setAvatarPreview(URL.createObjectURL(file));
  };
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await onSaved(form, { file: avatarFile, remove: removeAvatar }); onClose(); } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  };
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="profile-editor glass" role="dialog" aria-modal="true" aria-labelledby="profile-editor-title" onMouseDown={(event) => event.stopPropagation()}>
    <div className="modal-title"><div><p className="eyebrow">IDENTIDAD</p><h2 id="profile-editor-title">Editar información</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Cerrar"><X /></button></div>
    <div className="profile-editor-avatar"><ConstellationAvatar seed={user.id} name={form.name || user.name} src={avatarPreview || (removeAvatar ? '' : user.avatar)} /><div className="profile-avatar-choice"><p>Elige una foto que te represente. Si la eliminas, volverá a mostrarse tu constelación.</p><div><label className="secondary-button avatar-upload-button"><ImagePlus /> Elegir imagen<input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectAvatar} /></label>{(user.avatar || avatarFile) && !removeAvatar && <button className="secondary-button avatar-remove-button" type="button" onClick={() => { setAvatarFile(null); setAvatarPreview(''); setRemoveAvatar(true); }}><Trash2 /> Eliminar</button>}</div><small>JPG, PNG o WebP · máximo 5 MB</small></div></div>
    <form onSubmit={submit}>
      <label>Nombre<input required minLength="2" maxLength="100" name="name" value={form.name} onChange={update} autoComplete="name" /></label>
      <label>Usuario<div className="username-field"><span>@</span><input required minLength="3" maxLength="32" pattern="[a-z0-9_]+" name="username" value={form.username} onChange={update} autoCapitalize="none" spellCheck="false" /></div></label>
      <label>Biografía<textarea maxLength="500" name="bio" value={form.bio} onChange={update} rows="5" placeholder="Cuéntale a la comunidad quién eres." /><small>{form.bio.length}/500</small></label>
      {error && <div className="inline-error" role="alert">{error}</div>}
      <div className="modal-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</button></div>
    </form>
  </section></div>;
}

function ProfilePage({ user, toast, onUserChange, navigate, membership }) {
  const [editing, setEditing] = useState(false);
  const level = Number(user.level || 1); const xp = Number(user.xp || 0);
  const memberSince = user.createdAt ? new Intl.DateTimeFormat('es-CO', { month: 'short', year: 'numeric' }).format(new Date(user.createdAt)) : 'Sin fecha';
  const save = async (values, avatarChange) => { let updated = await api.updateProfile(values); if (avatarChange.file) updated = await api.uploadProfileAvatar(avatarChange.file); else if (avatarChange.remove && user.avatar) updated = await api.removeProfileAvatar(); onUserChange(updated); toast('Tu perfil se actualizó correctamente.'); };
  return <div className="page-stack"><div className="profile-cover"><NeuralCanvas compact /><ConstellationAvatar className="profile-avatar" seed={user.id} name={user.name} src={user.avatar} /></div><header className="profile-head"><div><h1>{user.name}</h1><p>@{user.username} · Nivel {level}</p><p className={`profile-bio ${user.bio ? '' : 'muted'}`}>{user.bio || 'Aún no has agregado una biografía.'}</p></div><button className="secondary-button" onClick={() => setEditing(true)}><Settings /> Editar perfil</button></header><MembershipProfileCard membership={membership || user.membership} onRenew={() => navigate('marketplace')} /><div className="profile-stats"><div><strong>{level}</strong><span>Nivel real</span></div><div><strong>{xp}</strong><span>XP acumulados</span></div><div><strong>{memberSince}</strong><span>Miembro desde</span></div><div><strong>{user.status === 'ACTIVE' ? 'Activa' : user.status}</strong><span>Estado de cuenta</span></div></div><div className="dashboard-grid profile-data-grid"><section className="surface"><div className="section-title"><div><p className="eyebrow">PROGRESO REAL</p><h2>Trayectoria</h2></div></div><div className="profile-level-value"><span>NIVEL</span><strong>{level}</strong></div><p>{xp} XP registrados en tu cuenta.</p>{xp === 0 && <p className="muted">Tu trayectoria comienza aquí. El progreso aparecerá cuando existan acciones verificadas que otorguen XP.</p>}</section><section className="surface constellation-card"><div className="section-title"><div><p className="eyebrow">IDENTIDAD VISUAL</p><h2>{user.avatar ? 'Tu foto de perfil' : 'Tu constelación'}</h2></div></div><ConstellationAvatar seed={user.id} name={user.name} src={user.avatar} /><p>{user.avatar ? 'Tu imagen elegida identifica tu cuenta dentro de la comunidad.' : 'Tu constelación se muestra como identidad visual hasta que elijas una foto de perfil.'}</p></section></div>{editing && <ProfileEditor user={user} onClose={() => setEditing(false)} onSaved={save} />}</div>;
}

function AdminUsersPage({ toast }) {
  const [users, setUsers] = useState([]); const [loading, setLoading] = useState(true); const [busyId, setBusyId] = useState('');
  const load = async () => { setLoading(true); try { setUsers(await api.getAdminUsers()); } catch (error) { toast(error.message, 'error'); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const toggle = async (account) => {
    const active = account.status !== 'ACTIVE'; setBusyId(account.id);
    try {
      const result = await api.setUserAccess({ userId: account.id, active });
      setUsers((items) => items.map((item) => item.id === account.id ? { ...item, status: result.status } : item));
      toast(active ? `${account.name} ya puede acceder.` : `Acceso suspendido para ${account.name}.`);
    } catch (error) { toast(error.message, 'error'); } finally { setBusyId(''); }
  };
  return <div className="page-stack admin-users-page"><header className="page-header"><div><p className="eyebrow">CONTROL DE ACCESO</p><h1>Usuarios</h1><p>Activa o suspende cuentas y revisa si mantienen una sesión vigente.</p></div><button className="secondary-button" onClick={load} disabled={loading}>Actualizar</button></header>
    <section className="surface admin-users-table"><div className="table-head"><span>USUARIO</span><span>ROL</span><span>SESIÓN</span><span>ACCESO</span><span>CONTROL</span></div>
      {users.map((account) => <div className={`admin-user-row ${account.status !== 'ACTIVE' ? 'suspended' : ''}`} key={account.id}><span className="admin-user-identity"><ConstellationAvatar className="avatar avatar-sm" seed={account.id} name={account.name} src={account.avatar} /><span><strong>{account.name}</strong><small>{account.email}</small></span></span><span>{account.role === 'ADMIN' ? 'Administrador' : 'Miembro'}</span><span>{account.role === 'ADMIN' ? 'Sin límite' : account.sessionActive ? 'Activa' : 'Cerrada'}</span><span className={`account-state ${account.status.toLowerCase()}`}>{account.status === 'ACTIVE' ? 'Permitido' : 'Suspendido'}</span><label className="access-toggle"><input type="checkbox" checked={account.status === 'ACTIVE'} disabled={account.role === 'ADMIN' || busyId === account.id} onChange={() => toggle(account)} /><span /><em>{account.role === 'ADMIN' ? 'Protegido' : account.status === 'ACTIVE' ? 'Quitar acceso' : 'Dar acceso'}</em></label></div>)}
      {!loading && !users.length && <EmptyState icon={Users} title="No hay usuarios" text="Las cuentas registradas aparecerán aquí." />}
    </section></div>;
}

function BlockedAccess({ user, onLogout }) {
  return <main className="blocked-access"><div className="blocked-interface" aria-hidden="true"><aside><Brand /><span /><span /><span /></aside><section><header /><div /><div /><div /></section></div><section className="blocked-card glass" role="alert"><span className="blocked-icon"><LockKeyhole /></span><p className="eyebrow">ACCESO SUSPENDIDO</p><h1>No puedes acceder a PROJECT GALAXY.</h1><p>Tu cuenta <strong>{user.email}</strong> está temporalmente bloqueada. Por favor, comunícate con nosotros en la comunidad para revisar tu acceso.</p><button className="secondary-button" onClick={onLogout}><LogOut /> Cerrar sesión</button></section></main>;
}
function EmptyState({ icon: Icon, title, text }) { return <div className="empty-state"><span><Icon /></span><h3>{title}</h3><p>{text}</p></div>; }

function CommandPalette({ onClose, navigate, items }) { const [query, setQuery] = useState(''); const options = items.filter(([, label]) => label.toLowerCase().includes(query.toLowerCase())); return <div className="modal-backdrop command-backdrop" onMouseDown={onClose}><div className="command-palette glass" onMouseDown={(e) => e.stopPropagation()}><label><Search /><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="¿A dónde quieres ir?" /><kbd>ESC</kbd></label><p className="eyebrow">NAVEGACIÓN</p>{options.map(([id, label, Icon]) => <button key={id} onClick={() => { navigate(id); onClose(); }}><Icon /><span>{label}</span><ArrowRight /></button>)}</div></div>; }

function NotificationActionModal({ notice, busy, onAccept, onDecline, onClose }) {
  if (!notice) return null;
  const joinRequest = notice.type === 'MEETING_JOIN_REQUEST';
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="notification-action-modal glass" role="dialog" aria-modal="true" aria-labelledby="notification-action-title" onMouseDown={(event) => event.stopPropagation()}>
    <button className="icon-button modal-close" type="button" onClick={onClose} aria-label="Cerrar"><X /></button>
    <span className="notification-action-icon"><Video /></span>
    <p className="eyebrow">{joinRequest ? 'SALA DE ESPERA' : 'INVITACIÓN A REUNIÓN'}</p>
    <h2 id="notification-action-title">{notice.title}</h2>
    <p>{notice.body || notice.meetingTitle}</p>
    {notice.roomCode && <strong className="notification-room-code">{notice.roomCode}</strong>}
    <div className="modal-actions">
      <button className="secondary-button" type="button" disabled={busy} onClick={onDecline}>{joinRequest ? 'Rechazar' : 'Declinar'}</button>
      <button className="primary-button" type="button" disabled={busy} onClick={onAccept}><Check /> {busy ? 'Procesando…' : joinRequest ? 'Aceptar ingreso' : 'Aceptar y entrar'}</button>
    </div>
  </section></div>;
}

function AppShell({ user, onUserChange, onLogout }) {
  const isAdmin = user.role === 'ADMIN'; const availableNavigation = isAdmin ? navigation : memberNavigation;
  const inviteToken = new URLSearchParams(location.search).get('invite') || '';
  const [page, setPage] = useState(() => inviteToken || new URLSearchParams(location.search).has('meeting') || localStorage.getItem(`galaxy_active_meeting_${user.id}`) ? 'meetings' : isAdmin ? 'dashboard' : 'meetings'); const [menu, setMenu] = useState(false); const [notices, setNotices] = useState(false); const [command, setCommand] = useState(false); const [selectedProduct, setSelectedProduct] = useState(null); const [toastItem, setToastItem] = useState(null);
  const [meetingSession, setMeetingSession] = useState({ active: false, joined: false, title: '', audioBlocked: false });
  const [notificationItems, setNotificationItems] = useState([]); const [activeNotice, setActiveNotice] = useState(null); const [noticeBusy, setNoticeBusy] = useState(false); const [dismissedNotices, setDismissedNotices] = useState(() => new Set()); const [joinRequest, setJoinRequest] = useState(null);
  const [membershipCenter, setMembershipCenter] = useState({ membership: user.membership || { isActive: false }, plans: [], orders: [] });
  const toast = (message, kind = '') => { setToastItem({ message, kind, id: Date.now() }); setTimeout(() => setToastItem(null), 4200); };
  useEffect(() => { const key = (event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setCommand(true); } if (event.key === 'Escape') { setCommand(false); setSelectedProduct(null); } }; addEventListener('keydown', key); return () => removeEventListener('keydown', key); }, []);
  const navigate = (id) => { const target = availableNavigation.some(([allowed]) => allowed === id) ? id : isAdmin ? 'dashboard' : 'meetings'; setPage(target); setMenu(false); scrollTo({ top: 0, behavior: 'smooth' }); };
  const reloadMembership = async () => { const center = await api.getMembershipCenter(); setMembershipCenter(center); return center; };
  useEffect(() => { reloadMembership().catch(() => {}); }, [user.id]);
  const membership = membershipCenter.membership || user.membership || { isActive: false };
  useEffect(() => {
    if (!inviteToken) return;
    let active = true;
    api.redeemMeetingShareLink(inviteToken).then((access) => {
      if (!active) return;
      setJoinRequest({ roomCode: access.roomCode, id: `invite-${Date.now()}` }); setPage('meetings');
      const clean = new URL(location.href); clean.searchParams.delete('invite'); history.replaceState({}, '', clean.href);
      toast('Invitación validada. Entrando a la reunión…');
    }).catch((error) => { if (active) toast(error.message, 'error'); });
    return () => { active = false; };
  }, [inviteToken]);
  const actionableNotice = (notice) => notice?.meetingStatus === 'ACTIVE' && ((notice.type === 'MEETING_JOIN_REQUEST' && notice.participantId) || (notice.type === 'MEETING_INVITE' && notice.invitationId && notice.invitationStatus === 'PENDING'));
  const reloadNotifications = async () => { try { setNotificationItems(await api.getMyNotifications()); } catch {} };
  useEffect(() => {
    let active = true;
    const refresh = async () => { try { const items = await api.getMyNotifications(); if (active) setNotificationItems(items); } catch {} };
    refresh(); const unsubscribe = api.onNotificationChange(user.id, refresh); const timer = setInterval(refresh, 15_000);
    return () => { active = false; unsubscribe(); clearInterval(timer); };
  }, [user.id]);
  useEffect(() => {
    if (activeNotice) return;
    const pending = notificationItems.find((notice) => !notice.readAt && actionableNotice(notice) && !dismissedNotices.has(notice.id));
    if (pending) setActiveNotice(pending);
  }, [notificationItems, activeNotice, dismissedNotices]);
  useEffect(() => {
    if (activeNotice?.type !== 'MEETING_INVITE' || activeNotice.invitationStatus !== 'PENDING' || !activeNotice.invitationId) return;
    api.markMeetingInvitationSeen(activeNotice.invitationId).catch(() => {});
  }, [activeNotice?.id, activeNotice?.type, activeNotice?.invitationId, activeNotice?.invitationStatus]);
  const unread = notificationItems.filter((notice) => !notice.readAt).length;
  const openNotice = async (notice) => {
    setNotices(false);
    if (actionableNotice(notice)) { setActiveNotice(notice); return; }
    if (!notice.readAt) {
      setNotificationItems((items) => items.map((item) => item.id === notice.id ? { ...item, readAt: new Date().toISOString() } : item));
      api.markNotificationRead(notice.id).catch(() => reloadNotifications());
    }
    if (notice.type === 'MEETING_ADMITTED' && notice.roomCode) setJoinRequest({ roomCode: notice.roomCode, id: Date.now() });
    if (notice.meetingId) navigate('meetings'); else toast(notice.title, 'info');
  };
  const closeNotice = () => { if (activeNotice) setDismissedNotices((items) => new Set(items).add(activeNotice.id)); setActiveNotice(null); };
  const resolveNotice = async (accepted) => {
    if (!activeNotice || noticeBusy) return;
    const notice = activeNotice; const resolvedAt = new Date().toISOString();
    setNoticeBusy(true);
    setActiveNotice(null);
    setDismissedNotices((items) => new Set(items).add(notice.id));
    setNotificationItems((items) => items.map((item) => item.id === notice.id ? {
      ...item, readAt: item.readAt || resolvedAt,
      ...(item.type === 'MEETING_INVITE' ? { invitationStatus: accepted ? 'ACCEPTED' : 'DECLINED' } : {}),
    } : item));
    try {
      if (notice.type === 'MEETING_JOIN_REQUEST') {
        await api[accepted ? 'admitMeetingParticipant' : 'denyMeetingParticipant']({ meetingId: notice.meetingId, participantId: notice.participantId });
        toast(accepted ? 'Participante admitido en la reunión.' : 'Solicitud de ingreso rechazada.');
      } else {
        const result = await api.respondToMeetingInvitation({ invitationId: notice.invitationId, status: accepted ? 'ACCEPTED' : 'DECLINED' });
        if (accepted) { setJoinRequest({ roomCode: result.roomCode, id: Date.now() }); navigate('meetings'); }
        toast(accepted ? 'Invitación aceptada. Entrando a la reunión…' : 'Invitación declinada.');
      }
      await reloadNotifications();
    } catch (error) { toast(error.message, 'error'); await reloadNotifications(); } finally { setNoticeBusy(false); }
  };
  const markAllRead = async () => {
    setNotificationItems((items) => items.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() })));
    setNotices(false);
    try { await api.markAllNotificationsRead(); } catch (error) { toast(error.message, 'error'); reloadNotifications(); }
  };
  const activeLabel = availableNavigation.find(([id]) => id === page)?.[1] || 'Reuniones';
  let content;
  if (page === 'dashboard') content = <Dashboard user={user} navigate={navigate} openProduct={setSelectedProduct} />;
  else if (page === 'discover') content = <FeedPage toast={toast} />;
  else if (page === 'marketplace') content = <Marketplace onOpen={setSelectedProduct} user={user} />;
  else if (page === 'live') content = <LivePage toast={toast} />;
  else if (page === 'meetings') content = null;
  else if (page === 'calendar') content = <CalendarPage toast={toast} onJoin={(request) => { setJoinRequest(request); navigate('meetings'); }} />;
  else if (page === 'messages') content = <MessagesPage toast={toast} />;
  else if (page === 'wallet') content = <WalletPage user={user} />;
  else if (page === 'orders') content = <MembershipOrdersPage orders={membershipCenter.orders} onRefresh={() => reloadMembership().catch((error) => toast(error.message, 'error'))} />;
  else if (page === 'users' && isAdmin) content = <AdminUsersPage toast={toast} />;
  else content = <ProfilePage user={user} toast={toast} onUserChange={onUserChange} navigate={navigate} membership={membership} />;
  return <div className="app-shell">
    <aside className={`sidebar ${menu ? 'open' : ''}`}><div className="sidebar-top"><Brand /><button className="mobile-close icon-button" onClick={() => setMenu(false)}><X /></button></div><nav>{availableNavigation.map(([id, label, Icon]) => <button className={page === id ? 'active' : ''} onClick={() => navigate(id)} key={id}><Icon /><span>{label}</span>{label === 'Mensajes' && <i>3</i>}</button>)}</nav><div className="sidebar-bottom"><button onClick={() => navigate('profile')}><ConstellationAvatar className="avatar" seed={user.id} name={user.name} src={user.avatar} /><div><strong>{user.name}</strong><span>{isAdmin ? 'ADMIN' : 'COMUNIDAD'} · LVL {user.level}</span></div><MoreHorizontal /></button><button className="logout-button" onClick={onLogout}><LogOut /> Cerrar sesión</button></div></aside>
    {menu && <button className="sidebar-scrim" aria-label="Cerrar menú" onClick={() => setMenu(false)} />}
    <main className="app-main"><header className="topbar"><button className="mobile-menu icon-button" onClick={() => setMenu(true)}><Menu /></button><span className="mobile-title">{activeLabel}</span><button className="command-trigger" onClick={() => setCommand(true)}><Search /><span>Buscar en Galaxy</span><kbd>Ctrl K</kbd></button><div className="top-actions"><button className="icon-button notification-button" onClick={() => setNotices(!notices)}><Bell />{unread > 0 && <i>{Math.min(unread, 99)}</i>}</button><button className="avatar-button" onClick={() => navigate('profile')}><ConstellationAvatar className="avatar" seed={user.id} name={user.name} src={user.avatar} /><ChevronDown /></button></div>{notices && <div className="notifications-popover glass"><div className="panel-heading"><h3>Notificaciones</h3><span>{unread} nuevas</span></div>{notificationItems.map((notice) => <button className={notice.readAt ? 'read' : ''} key={notice.id} onClick={() => openNotice(notice)}><span className={`notice-icon ${notice.type.toLowerCase()}`}><Bell /></span><div><strong>{notice.title}</strong><small>{notice.body || notice.meetingTitle || 'Actividad de tu cuenta'}</small></div></button>)}{!notificationItems.length && <p className="notifications-empty">No tienes notificaciones nuevas.</p>}<button className="view-all" disabled={!unread} onClick={markAllRead}>Marcar como revisadas</button></div>}</header><div className="page-content"><div className={`meeting-route ${page === 'meetings' ? 'active' : 'background'}`}><MeetingStudio toast={toast} user={user} joinRequest={joinRequest} onSessionChange={setMeetingSession} canCreate={isAdmin} /></div>{page !== 'meetings' && <div className="standard-route">{content}</div>}</div></main>
    {meetingSession.active && page !== 'meetings' && <div className="background-meeting-bar glass"><button className="background-meeting-main" onClick={() => navigate('meetings')}><span className="meeting-live-dot" /><span><strong>{meetingSession.title || 'Reunión en curso'}</strong><small>{meetingSession.waiting ? 'Esperando admisión' : 'Audio y conexión activos en segundo plano'}</small></span></button>{meetingSession.audioBlocked && <button className="background-audio-button" title="Activar sonido" onClick={() => window.dispatchEvent(new Event('galaxy:resume-meeting-audio'))}><Volume2 /></button>}<button className="secondary-button" onClick={() => navigate('meetings')}>Volver</button></div>}
    <nav className="bottom-nav">{availableNavigation.slice(0, 5).map(([id, label, Icon]) => <button className={page === id ? 'active' : ''} onClick={() => navigate(id)} key={id}><Icon /><span>{label === 'Marketplace' ? 'Market' : label}</span></button>)}</nav>
    {command && <CommandPalette onClose={() => setCommand(false)} navigate={navigate} items={availableNavigation} />}
    <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} toast={toast} membershipCenter={membershipCenter} user={user} />
    <NotificationActionModal notice={activeNotice} busy={noticeBusy} onAccept={() => resolveNotice(true)} onDecline={() => resolveNotice(false)} onClose={closeNotice} />
    <Toast item={toastItem} />
  </div>;
}

export default function App() {
  const sharedIntent = useMemo(() => { const params = new URLSearchParams(location.search); return params.has('invite') || params.has('meeting'); }, []);
  const [view, setView] = useState(sharedIntent ? 'auth' : 'landing'); const [user, setUser] = useState(null); const [ready, setReady] = useState(false); const [sessionError, setSessionError] = useState('');
  useEffect(() => {
    api.me().then(async (found) => {
      if (!found) return;
      if (sharedIntent && isScannerOwner(found)) {
        await api.logout().catch(() => {}); setSessionError('Por seguridad, el enlace compartido requiere que el invitado inicie sesión con su propia cuenta.'); setView('auth'); return;
      }
      setUser(found); setView('app');
    }).catch((error) => { setSessionError(error.message); setView('auth'); }).finally(() => setReady(true));
  }, [sharedIntent]);
  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    const check = async () => {
      try {
        const state = await api.heartbeatSession();
        if (active && state?.accountStatus && state.accountStatus !== user.status) setUser((current) => current ? { ...current, status: state.accountStatus } : current);
      } catch (error) {
        if (!active) return; setUser(null); setSessionError(error.message); setView('auth');
      }
    };
    const timer = setInterval(check, 15_000); return () => { active = false; clearInterval(timer); };
  }, [user?.id, user?.status]);
  const logout = async () => { await api.logout(); setUser(null); setSessionError(''); setView(sharedIntent ? 'auth' : 'landing'); };
  if (!ready) return <div className="boot-screen"><span className="neural-loader"><i /><i /><i /></span><p>ALINEANDO SISTEMAS</p></div>;
  if (view === 'landing') return <Landing onEnter={() => setView('auth')} />;
  if (view === 'auth' && !user) return <><AuthGate onBack={() => setView(sharedIntent ? 'auth' : 'landing')} onAuthenticated={(current) => { setSessionError(''); setUser(current); setView('app'); }} />{sessionError && <div className="auth-session-alert" role="alert">{sessionError}</div>}</>;
  if (user?.status !== 'ACTIVE') return <BlockedAccess user={user} onLogout={logout} />;
  return <AppShell user={user} onUserChange={setUser} onLogout={logout} />;
}
