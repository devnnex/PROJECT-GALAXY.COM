import { useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowRight, Bell, Bookmark, Boxes, Check, ChevronDown, CircleDollarSign,
  Clock3, Compass, Copy, CreditCard, Eye, Heart, Home, KeyRound, LayoutGrid, LockKeyhole,
  LogOut, Menu, MessageCircle, Mic2, MoreHorizontal, Orbit, Package, Play, Plus, Radio,
  Search, Send, Settings, ShieldCheck, ShoppingBag, Sparkles, Star, TrendingUp, User,
  Users, Video, WalletCards, X, Zap,
} from 'lucide-react';
import { CONFIG } from './config';
import { api } from './services/api';
import { feed, notifications, products } from './data';
import NeuralCanvas from './components/NeuralCanvas';
import AuthGate from './components/AuthGate';
import MeetingStudio from './components/MeetingStudio';
import ConstellationAvatar from './components/ConstellationAvatar';

const navigation = [
  ['dashboard', 'Inicio', Home], ['discover', 'Descubrir', Compass], ['marketplace', 'Marketplace', ShoppingBag],
  ['live', 'En vivo', Radio], ['meetings', 'Reuniones', Video], ['messages', 'Mensajes', MessageCircle],
  ['wallet', 'Wallet', WalletCards], ['orders', 'Órdenes', Package], ['profile', 'Perfil', User],
];

function Brand() { return <div className="brand"><span className="brand-mark"><Orbit /></span><span>{CONFIG.APP_NAME}</span></div>; }

function Toast({ item }) { return item && <div className={`toast ${item.kind || ''}`} role="status"><span className="toast-orbit"><Check /></span><div><strong>{item.kind === 'error' ? 'Revisa esta acción' : 'Sistema actualizado'}</strong><p>{item.message}</p></div></div>; }

function Landing({ onEnter }) {
  return <main className="landing">
    <NeuralCanvas />
    <nav className="landing-nav"><Brand /><div className="landing-links"><a href="#ecosystem">Ecosistema</a><a href="#principles">Principios</a><button className="nav-enter" onClick={onEnter}>Entrar <ArrowRight /></button></div></nav>
    <section className="hero">
      <div className="hero-kicker"><span /> PRIVATE DIGITAL INFRASTRUCTURE</div>
      <h1>YOUR UNIVERSE.<br /><em>ONE ECOSYSTEM.</em></h1>
      <p>Conecta ideas, crea valor y construye tu próxima frontera digital en un solo espacio privado.</p>
      <div className="hero-actions"><button className="primary-button" onClick={onEnter}>Entrar a la plataforma <ArrowRight /></button><a className="secondary-button" href="#ecosystem">Explorar ecosistema</a></div>
      <div className="hero-orbit" aria-hidden="true"><div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><span className="orbit-core"><Orbit /></span><span className="satellite s1" /><span className="satellite s2" /></div>
      <div className="hero-proof"><span>01</span><p>Una identidad.<br />Todo tu mundo digital.</p><span className="proof-line" /><div><b>06</b><small>SISTEMAS<br />CONECTADOS</small></div></div>
    </section>
    <section className="ecosystem-section" id="ecosystem"><p className="eyebrow">THE CONNECTED LAYER</p><h2>Todo fluye desde un mismo núcleo.</h2><div className="ecosystem-grid">{[['CONNECT', Users, 'Comunidades y conversaciones privadas.'], ['CREATE', Sparkles, 'Publica, enseña y construye audiencia.'], ['STREAM', Radio, 'Experiencias en vivo con intención.'], ['MEET', Video, 'Salas seguras para trabajar juntos.'], ['EARN', TrendingUp, 'Comercio digital con reglas claras.'], ['TRADE', CircleDollarSign, 'Pagos verificables, no promesas.']].map(([name, Icon, text], i) => <article key={name}><span>0{i + 1}</span><Icon /><h3>{name}</h3><p>{text}</p></article>)}</div></section>
    <section className="principles" id="principles"><div><p className="eyebrow">DESIGNED FOR TRUST</p><h2>Ambición visual.<br />Realidad técnica.</h2></div><p>La experiencia distingue con claridad lo disponible, lo local y lo que requiere infraestructura externa. Ningún pago, conexión o permiso se declara exitoso sin verificación real.</p></section>
    <footer><Brand /><p>Una infraestructura digital privada del futuro.</p><span>© 2026 · PREVIEW 0.1</span></footer>
  </main>;
}

function Metric({ icon: Icon, label, value, note, tone }) { return <article className={`metric-card ${tone || ''}`}><div className="metric-head"><span>{label}</span><Icon /></div><strong>{value}</strong><small>{note}</small></article>; }

function Dashboard({ user, navigate, openProduct }) {
  const wallet = user.wallet || {}; const currency = wallet.currency || 'USDT'; const level = Number(user.level || 1); const xp = Number(user.xp || 0);
  return <div className="page-stack">
    <header className="page-header"><div><p className="eyebrow">PERSONAL COMMAND CENTER</p><h1>Bienvenido de vuelta, {user.name.split(' ')[0]}.</h1><p>Tu universo digital está en movimiento.</p></div><button className="primary-button compact" onClick={() => navigate('discover')}><Plus /> Crear</button></header>
    <div className="metrics"><Metric icon={WalletCards} label="Balance disponible" value={`${Number(wallet.availableBalance || 0).toFixed(2)} ${currency}`} note="Saldo registrado en Supabase" /><Metric icon={Activity} label="Nivel actual" value={level} note="Progreso verificado" tone="blue" /><Metric icon={Sparkles} label="XP acumulados" value={xp} note="Sin estimaciones locales" tone="rose" /></div>
    <div className="dashboard-grid"><section className="surface activity-panel"><div className="section-title"><div><p className="eyebrow">SIGNAL</p><h2>Actividad reciente</h2></div></div><EmptyState icon={Activity} title="Sin actividad registrada" text="Aquí aparecerán únicamente eventos persistidos y verificables de tu cuenta." /></section><section className="surface next-meeting"><div className="section-title"><div><p className="eyebrow">MEET</p><h2>Centro de reuniones</h2></div><Video /></div><div className="meeting-art"><span className="pulse-ring" /><Orbit /></div><h3>Reuniones privadas</h3><p>Crea una sala o continúa una reunión real desde tu historial.</p><button className="primary-button" onClick={() => navigate('meetings')}>Abrir reuniones <ArrowRight /></button></section></div>
    <section><div className="section-title"><div><p className="eyebrow">CURATED FOR YOU</p><h2>Descubre nuevas herramientas</h2></div><button className="text-button" onClick={() => navigate('marketplace')}>Marketplace <ArrowRight /></button></div><ProductGrid items={products.slice(0, 3)} onOpen={openProduct} /></section>
  </div>;
}

function FeedPage({ toast }) {
  const [items, setItems] = useState(feed.map((item) => ({ ...item, liked: false, saved: false, reply: false })));
  const toggle = (id, key) => setItems(items.map((item) => item.id === id ? { ...item, [key]: !item[key], ...(key === 'liked' ? { likes: item.likes + (item.liked ? -1 : 1) } : {}) } : item));
  return <div className="feed-layout"><section><header className="page-header"><div><p className="eyebrow">COMMUNITY SIGNAL</p><h1>Descubrir</h1><p>Ideas, lanzamientos y personas en tu órbita.</p></div></header><div className="composer surface"><div className="avatar">AM</div><button onClick={() => toast('El editor completo se habilitará con el módulo de almacenamiento configurado.', 'info')}>Comparte una idea con tu red…</button><button className="icon-button" onClick={() => toast('El editor completo se habilitará con el módulo de almacenamiento configurado.', 'info')}><Plus /></button></div>{items.map((post) => <article className="post surface" key={post.id}><div className="post-head"><div className="avatar">{post.initials}</div><div><strong>{post.author}</strong><p>{post.handle} · {post.time}</p></div><button className="icon-button" onClick={() => toast('Las acciones de moderación se habilitan al conectar el backend.', 'info')}><MoreHorizontal /></button></div><span className="post-tag">{post.tag}</span><p className="post-copy">{post.text}</p><div className="post-visual"><div className="visual-grid" /><div className="visual-orbit"><Orbit /></div><span>{post.id === 1 ? 'MAKE SPACE' : 'ATLAS / 2.0'}</span></div><div className="post-actions"><button className={post.liked ? 'liked' : ''} onClick={() => toggle(post.id, 'liked')}><Heart /> {post.likes}</button><button onClick={() => toggle(post.id, 'reply')}><MessageCircle /> {post.comments}</button><button onClick={() => navigator.clipboard?.writeText(location.href).then(() => toast('Enlace copiado.'))}><Send /> Compartir</button><button className={post.saved ? 'saved' : ''} onClick={() => toggle(post.id, 'saved')}><Bookmark /></button></div>{post.reply && <form className="reply-box" onSubmit={(event) => { event.preventDefault(); event.currentTarget.reset(); toast('Comentario guardado en esta sesión local.'); }}><input required placeholder="Escribe una respuesta…" /><button className="icon-button"><Send /></button></form>}</article>)}</section><aside className="discover-side"><div className="surface"><p className="eyebrow">TRENDING SIGNALS</p>{['#FutureOfWork', '#CreatorSystems', '#DigitalOwnership', '#SpatialDesign'].map((tag, i) => <button key={tag} onClick={() => toast(`Filtro ${tag} preparado para esta vista.`, 'info')}><span>0{i + 1}</span><div><strong>{tag}</strong><small>{4.8 - i}.k señales</small></div></button>)}</div><div className="surface people-card"><p className="eyebrow">PEOPLE TO KNOW</p>{['Noa Williams', 'Iris Laurent', 'Rafael Soto'].map((name) => <div className="person" key={name}><div className="avatar avatar-sm">{name.slice(0, 2)}</div><span>{name}</span><button onClick={(e) => { e.currentTarget.textContent = e.currentTarget.textContent === 'Seguir' ? 'Siguiendo' : 'Seguir'; }}>Seguir</button></div>)}</div></aside></div>;
}

function ProductCard({ product, onOpen }) { const [saved, setSaved] = useState(false); return <article className="product-card surface" onClick={() => onOpen(product)}><div className={`product-art ${product.tone}`}><span className="product-mark">{product.mark}</span><button className={`icon-button ${saved ? 'saved' : ''}`} aria-label={saved ? 'Quitar de guardados' : 'Guardar'} onClick={(e) => { e.stopPropagation(); setSaved(!saved); }}><Bookmark fill={saved ? 'currentColor' : 'none'} /></button><div className="orb-art" /></div><div className="product-info"><span>{product.category}</span><h3>{product.title}</h3><p>por {product.seller}</p><div><strong>{product.price} USDT</strong><small><Star /> {product.rating} ({product.reviews})</small></div></div></article>; }
function ProductGrid({ items, onOpen }) { return <div className="product-grid">{items.map((p) => <ProductCard key={p.id} product={p} onOpen={onOpen} />)}</div>; }

function Marketplace({ onOpen }) {
  const [query, setQuery] = useState(''); const [category, setCategory] = useState('Todos'); const [sort, setSort] = useState('rating');
  const visible = products.filter((p) => (category === 'Todos' || p.category === category) && `${p.title} ${p.seller}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === 'rating' ? b.rating - a.rating : a.price - b.price);
  return <div className="page-stack"><header className="market-hero"><div><p className="eyebrow">THE EXCHANGE LAYER</p><h1>Ideas que puedes<br /><em>llevar contigo.</em></h1><p>Herramientas, conocimiento y experiencias creadas por personas excepcionales.</p></div><div className="market-orbit"><Orbit /></div></header><div className="market-controls"><label className="search-field"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar productos, creadores…" /></label><button className="secondary-button" onClick={() => setSort(sort === 'rating' ? 'price' : 'rating')}>{sort === 'rating' ? 'Más relevantes' : 'Menor precio'} <ChevronDown /></button></div><div className="category-row">{['Todos', ...new Set(products.map((p) => p.category))].map((item) => <button className={category === item ? 'active' : ''} onClick={() => setCategory(item)} key={item}>{item}</button>)}</div><div className="section-title"><div><p className="eyebrow">FEATURED</p><h2>{visible.length} objetos seleccionados</h2></div></div>{visible.length ? <ProductGrid items={visible} onOpen={onOpen} /> : <EmptyState icon={Search} title="Sin coincidencias" text="Prueba con otra palabra o categoría." />}</div>;
}

function ProductModal({ product, onClose, toast }) {
  const [checkout, setCheckout] = useState(false); const [network, setNetwork] = useState('');
  if (!product) return null;
  const createPayment = () => {
    if (!network) return toast('Selecciona una red antes de continuar.', 'error');
    toast('Los pagos están desactivados hasta configurar un proveedor verificable en el backend.', 'error');
  };
  return <div className="modal-backdrop"><div className="product-modal glass" role="dialog" aria-modal="true"><button className="icon-button modal-close" onClick={onClose}><X /></button><div className={`product-modal-art ${product.tone}`}><div className="orb-art large" /><span>{product.mark}</span></div><div className="product-modal-copy"><p className="eyebrow">{product.category}</p><h1>{product.title}</h1><p className="seller-line">Creado por <strong>{product.seller}</strong> · <Star /> {product.rating}</p><p>{product.description}</p><ul><li><Check /> Acceso desde tu biblioteca</li><li><Check /> Actualizaciones incluidas</li><li><Check /> Soporte del creador</li></ul>{!checkout ? <div className="purchase-row"><div><strong>{product.price} USDT</strong><span>Pago único</span></div><button className="primary-button" onClick={() => setCheckout(true)}>Adquirir <ArrowRight /></button></div> : <div className="checkout-box"><div className="checkout-head"><div><p className="eyebrow">SECURE CHECKOUT</p><h3>Selecciona la red</h3></div><LockKeyhole /></div><div className="network-options">{Object.entries(CONFIG.CRYPTO_NETWORKS).map(([key, item]) => <button className={network === key ? 'selected' : ''} onClick={() => setNetwork(key)} key={key}><span>{item.label}</span><small>{item.enabled ? 'Disponible' : 'Requiere configuración'}</small></button>)}</div><div className="network-warning">Enviar USDT utilizando una red diferente puede provocar pérdida de fondos.</div><div className="checkout-total"><span>Total</span><strong>{product.price} USDT</strong></div><button className="primary-button" onClick={createPayment}>Crear solicitud de pago</button></div>}</div></div></div>;
}

function LivePage({ toast }) { const [following, setFollowing] = useState(false); return <div className="page-stack"><header className="page-header"><div><p className="eyebrow">LIVE TRANSMISSIONS</p><h1>Programación LIVE</h1><p>Vista editorial; no hay una transmisión conectada en este entorno.</p></div><button className="primary-button compact" onClick={() => toast('Para transmitir a una audiencia configura el servicio SFU, TURN y señalización.', 'info')}><Radio /> Iniciar transmisión</button></header><div className="live-feature surface"><div className="live-art"><div className="live-badge">VISTA PREVIA</div><button className="play-button" onClick={() => toast('Esta pieza visual no representa una transmisión conectada.', 'info')}><Play /></button></div><div><span className="post-tag">Future & technology</span><h2>Designing Systems for Human Possibility</h2><p>Mira Chen explora cómo crear tecnología que amplía la intención humana.</p><div className="person"><div className="avatar">MC</div><span>Mira Chen</span><button onClick={() => setFollowing(!following)}>{following ? 'Siguiendo' : 'Seguir'}</button></div></div></div><div className="product-grid">{products.slice(0, 3).map((p, i) => <article className="stream-card surface" key={p.id}><div className={`stream-art ${p.tone}`}><span className="live-badge">PROGRAMADO</span><Radio /></div><span>Mañana · {14 + i}:00</span><h3>{['Building a Creator OS', 'Quiet Brands, Loud Impact', 'AI Without the Noise'][i]}</h3><p>{p.seller}</p></article>)}</div></div>; }

function MessagesPage({ toast }) { const [active, setActive] = useState(0); const chats = ['Mira Chen', 'Nova Atelier', 'Rafael Soto']; return <div className="messages-shell surface"><aside className="conversation-list"><div className="panel-heading"><h2>Mensajes</h2><button className="icon-button" onClick={() => toast('Selecciona un contacto para abrir una conversación existente.')}><Plus /></button></div><label className="search-field"><Search /><input placeholder="Buscar" /></label>{chats.map((name, i) => <button className={active === i ? 'active' : ''} onClick={() => setActive(i)} key={name}><div className="avatar">{name.slice(0, 2)}</div><div><strong>{name}</strong><span>{i ? 'Compartió un recurso contigo' : 'Nos vemos en la sala ✦'}</span></div><time>{i + 2}m</time></button>)}</aside><section className="conversation"><div className="conversation-head"><div className="avatar">{chats[active].slice(0, 2)}</div><div><strong>{chats[active]}</strong><span>Presencia no conectada</span></div></div><div className="message-space"><span className="date-chip">HOY</span><div className="bubble incoming">¿Listo para revisar el nuevo sistema visual?<time>10:34</time></div><div className="bubble outgoing">Sí. Llevo algunas notas para la sesión.<time>10:36</time></div><p className="realtime-note"><Zap /> Los mensajes remotos requieren el servicio realtime configurado.</p></div><form className="message-input" onSubmit={(e) => { e.preventDefault(); e.currentTarget.reset(); toast('Mensaje conservado solo en esta vista; el transporte realtime no está configurado.', 'info'); }}><button type="button" className="icon-button" onClick={() => toast('Los adjuntos requieren configurar el almacenamiento de archivos.', 'info')}><Plus /></button><input required placeholder="Escribe un mensaje…" /><button className="icon-button"><Send /></button></form></section></div>; }

function WalletPage({ user }) { const wallet = user.wallet || {}; const currency = wallet.currency || 'USDT'; const amount = (value) => Number(value || 0).toFixed(2); return <div className="page-stack"><header className="page-header"><div><p className="eyebrow">VALUE LAYER</p><h1>Wallet</h1><p>Una vista auditable de tu actividad económica.</p></div></header><section className="wallet-hero"><div><p>BALANCE DISPONIBLE</p><h2>{amount(wallet.availableBalance)} <span>{currency}</span></h2><small>Saldo verificado en tu cuenta</small></div><div className="wallet-mark"><WalletCards /></div></section><div className="metrics wallet-metrics"><Metric icon={Clock3} label="Pendiente" value={amount(wallet.pendingBalance)} note={currency} /><Metric icon={TrendingUp} label="Total ganado" value={amount(wallet.totalEarned)} note={currency} /><Metric icon={ShoppingBag} label="Total gastado" value={amount(wallet.totalSpent)} note={currency} /></div><section className="surface transactions"><div className="section-title"><div><p className="eyebrow">LEDGER</p><h2>Transacciones</h2></div></div><EmptyState icon={CreditCard} title="Aún no hay movimientos" text="Los pagos aparecerán después de ser verificados por el backend." /></section></div>; }
function OrdersPage() { return <div className="page-stack"><header className="page-header"><div><p className="eyebrow">PURCHASES</p><h1>Mis órdenes</h1><p>Estado verificable de cada compra.</p></div></header><section className="surface"><div className="table-head"><span>ORDEN</span><span>PRODUCTO</span><span>RED</span><span>IMPORTE</span><span>ESTADO</span></div><EmptyState icon={Package} title="No hay órdenes" text="Una orden aparecerá aquí después de crear una solicitud real de compra." /></section></div>; }
function ProfileEditor({ user, onClose, onSaved }) {
  const [form, setForm] = useState({ name: user.name || '', username: user.username || '', bio: user.bio || '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.name === 'username' ? event.target.value.toLowerCase() : event.target.value }));
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await onSaved(form); onClose(); } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  };
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="profile-editor glass" role="dialog" aria-modal="true" aria-labelledby="profile-editor-title" onMouseDown={(event) => event.stopPropagation()}>
    <div className="modal-title"><div><p className="eyebrow">IDENTIDAD</p><h2 id="profile-editor-title">Editar información</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Cerrar"><X /></button></div>
    <div className="profile-editor-avatar"><ConstellationAvatar seed={user.id} name={form.name || user.name} /><p>Tu avatar constelación se genera automáticamente y no requiere subir fotografías.</p></div>
    <form onSubmit={submit}>
      <label>Nombre<input required minLength="2" maxLength="100" name="name" value={form.name} onChange={update} autoComplete="name" /></label>
      <label>Usuario<div className="username-field"><span>@</span><input required minLength="3" maxLength="32" pattern="[a-z0-9_]+" name="username" value={form.username} onChange={update} autoCapitalize="none" spellCheck="false" /></div></label>
      <label>Biografía<textarea maxLength="500" name="bio" value={form.bio} onChange={update} rows="5" placeholder="Cuéntale a la comunidad quién eres." /><small>{form.bio.length}/500</small></label>
      {error && <div className="inline-error" role="alert">{error}</div>}
      <div className="modal-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</button></div>
    </form>
  </section></div>;
}

function ProfilePage({ user, toast, onUserChange }) {
  const [editing, setEditing] = useState(false);
  const level = Number(user.level || 1); const xp = Number(user.xp || 0);
  const memberSince = user.createdAt ? new Intl.DateTimeFormat('es-CO', { month: 'short', year: 'numeric' }).format(new Date(user.createdAt)) : 'Sin fecha';
  const save = async (values) => { const updated = await api.updateProfile(values); onUserChange(updated); toast('Tu perfil se actualizó correctamente.'); };
  return <div className="page-stack"><div className="profile-cover"><NeuralCanvas compact /><ConstellationAvatar className="profile-avatar" seed={user.id} name={user.name} /></div><header className="profile-head"><div><h1>{user.name}</h1><p>@{user.username} · Nivel {level}</p><p className={`profile-bio ${user.bio ? '' : 'muted'}`}>{user.bio || 'Aún no has agregado una biografía.'}</p></div><button className="secondary-button" onClick={() => setEditing(true)}><Settings /> Editar perfil</button></header><div className="profile-stats"><div><strong>{level}</strong><span>Nivel real</span></div><div><strong>{xp}</strong><span>XP acumulados</span></div><div><strong>{memberSince}</strong><span>Miembro desde</span></div><div><strong>{user.status === 'ACTIVE' ? 'Activa' : user.status}</strong><span>Estado de cuenta</span></div></div><div className="dashboard-grid profile-data-grid"><section className="surface"><div className="section-title"><div><p className="eyebrow">PROGRESO REAL</p><h2>Trayectoria</h2></div></div><div className="profile-level-value"><span>NIVEL</span><strong>{level}</strong></div><p>{xp} XP registrados en tu cuenta.</p>{xp === 0 && <p className="muted">Tu trayectoria comienza aquí. El progreso aparecerá cuando existan acciones verificadas que otorguen XP.</p>}</section><section className="surface constellation-card"><div className="section-title"><div><p className="eyebrow">IDENTIDAD VISUAL</p><h2>Tu constelación</h2></div></div><ConstellationAvatar seed={user.id} name={user.name} /><p>Esta constelación se deriva de tu identidad y permanece diferente para cada usuario, sin almacenar fotografías.</p></section></div>{editing && <ProfileEditor user={user} onClose={() => setEditing(false)} onSaved={save} />}</div>;
}
function EmptyState({ icon: Icon, title, text }) { return <div className="empty-state"><span><Icon /></span><h3>{title}</h3><p>{text}</p></div>; }

function CommandPalette({ onClose, navigate }) { const [query, setQuery] = useState(''); const options = navigation.filter(([, label]) => label.toLowerCase().includes(query.toLowerCase())); return <div className="modal-backdrop command-backdrop" onMouseDown={onClose}><div className="command-palette glass" onMouseDown={(e) => e.stopPropagation()}><label><Search /><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="¿A dónde quieres ir?" /><kbd>ESC</kbd></label><p className="eyebrow">NAVEGACIÓN</p>{options.map(([id, label, Icon]) => <button key={id} onClick={() => { navigate(id); onClose(); }}><Icon /><span>{label}</span><ArrowRight /></button>)}</div></div>; }

function AppShell({ user, onUserChange, onLogout }) {
  const [page, setPage] = useState(() => new URLSearchParams(location.search).has('meeting') || localStorage.getItem(`galaxy_active_meeting_${user.id}`) ? 'meetings' : 'dashboard'); const [menu, setMenu] = useState(false); const [notices, setNotices] = useState(false); const [unread, setUnread] = useState(3); const [command, setCommand] = useState(false); const [selectedProduct, setSelectedProduct] = useState(null); const [toastItem, setToastItem] = useState(null);
  const toast = (message, kind = '') => { setToastItem({ message, kind, id: Date.now() }); setTimeout(() => setToastItem(null), 4200); };
  useEffect(() => { const key = (event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setCommand(true); } if (event.key === 'Escape') { setCommand(false); setSelectedProduct(null); } }; addEventListener('keydown', key); return () => removeEventListener('keydown', key); }, []);
  const navigate = (id) => { setPage(id); setMenu(false); scrollTo({ top: 0, behavior: 'smooth' }); };
  const activeLabel = navigation.find(([id]) => id === page)?.[1] || 'Inicio';
  let content;
  if (page === 'dashboard') content = <Dashboard user={user} navigate={navigate} openProduct={setSelectedProduct} />;
  else if (page === 'discover') content = <FeedPage toast={toast} />;
  else if (page === 'marketplace') content = <Marketplace onOpen={setSelectedProduct} />;
  else if (page === 'live') content = <LivePage toast={toast} />;
  else if (page === 'meetings') content = <MeetingStudio toast={toast} user={user} />;
  else if (page === 'messages') content = <MessagesPage toast={toast} />;
  else if (page === 'wallet') content = <WalletPage user={user} />;
  else if (page === 'orders') content = <OrdersPage />;
  else content = <ProfilePage user={user} toast={toast} onUserChange={onUserChange} />;
  return <div className="app-shell">
    <aside className={`sidebar ${menu ? 'open' : ''}`}><div className="sidebar-top"><Brand /><button className="mobile-close icon-button" onClick={() => setMenu(false)}><X /></button></div><nav>{navigation.map(([id, label, Icon]) => <button className={page === id ? 'active' : ''} onClick={() => navigate(id)} key={id}><Icon /><span>{label}</span>{label === 'Mensajes' && <i>3</i>}</button>)}</nav><div className="sidebar-bottom"><button onClick={() => navigate('profile')}><ConstellationAvatar className="avatar" seed={user.id} name={user.name} /><div><strong>{user.name}</strong><span>{user.role} · LVL {user.level}</span></div><MoreHorizontal /></button><button className="logout-button" onClick={onLogout}><LogOut /> Cerrar sesión</button></div></aside>
    {menu && <button className="sidebar-scrim" aria-label="Cerrar menú" onClick={() => setMenu(false)} />}
    <main className="app-main"><header className="topbar"><button className="mobile-menu icon-button" onClick={() => setMenu(true)}><Menu /></button><span className="mobile-title">{activeLabel}</span><button className="command-trigger" onClick={() => setCommand(true)}><Search /><span>Buscar en Galaxy</span><kbd>Ctrl K</kbd></button><div className="top-actions"><button className="icon-button notification-button" onClick={() => setNotices(!notices)}><Bell />{unread > 0 && <i>{unread}</i>}</button><button className="avatar-button" onClick={() => navigate('profile')}><ConstellationAvatar className="avatar" seed={user.id} name={user.name} /><ChevronDown /></button></div>{notices && <div className="notifications-popover glass"><div className="panel-heading"><h3>Notificaciones</h3><span>{unread} nuevas</span></div>{notifications.map((n) => <button key={n.id} onClick={() => toast(n.text, 'info')}><span className={`notice-icon ${n.type}`}><Bell /></span><div><strong>{n.text}</strong><small>{n.time}</small></div></button>)}<button className="view-all" onClick={() => { setUnread(0); setNotices(false); }}>Marcar como revisadas</button></div>}</header><div className="page-content">{content}</div></main>
    <nav className="bottom-nav">{navigation.slice(0, 5).map(([id, label, Icon]) => <button className={page === id ? 'active' : ''} onClick={() => navigate(id)} key={id}><Icon /><span>{label === 'Marketplace' ? 'Market' : label}</span></button>)}</nav>
    {command && <CommandPalette onClose={() => setCommand(false)} navigate={navigate} />}
    <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} toast={toast} />
    <Toast item={toastItem} />
  </div>;
}

export default function App() {
  const [view, setView] = useState('landing'); const [user, setUser] = useState(null); const [ready, setReady] = useState(false);
  useEffect(() => { api.me().then((found) => { if (found) { setUser(found); setView('app'); } }).finally(() => setReady(true)); }, []);
  const logout = async () => { await api.logout(); setUser(null); setView('landing'); };
  if (!ready) return <div className="boot-screen"><span className="neural-loader"><i /><i /><i /></span><p>ALINEANDO SISTEMAS</p></div>;
  if (view === 'landing') return <Landing onEnter={() => setView('auth')} />;
  if (view === 'auth' && !user) return <AuthGate onBack={() => setView('landing')} onAuthenticated={(current) => { setUser(current); setView('app'); }} />;
  return <AppShell user={user} onUserChange={setUser} onLogout={logout} />;
}
