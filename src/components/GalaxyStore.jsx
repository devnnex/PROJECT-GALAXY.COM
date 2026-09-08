import { useEffect, useMemo, useState } from 'react';
import {
  Check, ChevronRight, ImagePlus, Minus, PackageOpen, Plus, Save, ShoppingBag,
  ShoppingCart, Sparkles, Trash2, Upload, X,
} from 'lucide-react';
import { api } from '../services/api';
import { manualPayment, PAYMENT_CONTACT_EMAIL, PAYMENT_NETWORKS } from '../payment-config';

const money = (value) => Number(value || 0).toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function ProductArtwork({ product, large = false, onClick }) {
  const content = product.imageUrl
    ? <img src={product.imageUrl} alt={product.title} />
    : <span><PackageOpen /><small>Imagen próximamente</small></span>;
  if (!onClick) return <div className={`galaxy-store-art ${large ? 'large' : ''}`}>{content}</div>;
  return <button className={`galaxy-store-art ${large ? 'large' : ''}`} type="button" onClick={onClick} aria-label={`Ver ${product.title}`}>{content}</button>;
}

function Quantity({ value, onChange, disabled = false }) {
  return <div className="store-quantity" aria-label="Cantidad">
    <button type="button" disabled={disabled || value <= 1} onClick={() => onChange(value - 1)} aria-label="Restar uno"><Minus /></button>
    <strong>{value}</strong>
    <button type="button" disabled={disabled} onClick={() => onChange(value + 1)} aria-label="Agregar uno"><Plus /></button>
  </div>;
}

function StoreProductCard({ product, onOpen, onAdd, onEdit, isAdmin }) {
  return <article className={`galaxy-store-card surface ${product.soldOut ? 'sold-out' : ''}`}>
    <div className="store-card-art-wrap">
      <ProductArtwork product={product} onClick={() => onOpen(product)} />
      <span className={`store-stock ${product.soldOut ? 'empty' : ''}`}>{product.soldOut ? 'AGOTADO' : 'DISPONIBLE'}</span>
      {isAdmin && <button className="store-edit-button" type="button" onClick={() => onEdit(product)}>Editar</button>}
    </div>
    <button className="store-card-copy" type="button" onClick={() => onOpen(product)}>
      <span>GALAXY SELECTION</span>
      <h2>{product.title}</h2>
      <p>{product.description}</p>
    </button>
    <footer><strong>{money(product.priceUsdt)} <small>USDT</small></strong><button type="button" disabled={product.soldOut} onClick={() => onAdd(product)}><ShoppingCart /> {product.soldOut ? 'Agotado' : 'Agregar'}</button></footer>
  </article>;
}

function ProductDetail({ product, quantity, onQuantity, onAdd, onClose }) {
  if (!product) return null;
  return <div className="modal-backdrop store-modal-backdrop" onMouseDown={onClose}>
    <section className="galaxy-product-detail glass" role="dialog" aria-modal="true" aria-labelledby="store-product-title" onMouseDown={(event) => event.stopPropagation()}>
      <button className="icon-button modal-close" type="button" onClick={onClose} aria-label="Cerrar"><X /></button>
      <ProductArtwork product={product} large />
      <div className="galaxy-product-detail-copy">
        <p className="eyebrow">GALAXY STORE · PAGO EN USDT</p>
        <span className={`store-detail-stock ${product.soldOut ? 'empty' : ''}`}>{product.soldOut ? 'Producto agotado' : 'Disponible ahora'}</span>
        <h1 id="store-product-title">{product.title}</h1>
        <p>{product.description}</p>
        <div className="store-detail-price"><span>Precio unitario</span><strong>{money(product.priceUsdt)} <small>USDT</small></strong></div>
        <div className="store-detail-buy">
          <Quantity value={quantity} onChange={onQuantity} disabled={product.soldOut} />
          <button className="primary-button" type="button" disabled={product.soldOut} onClick={onAdd}><ShoppingCart /> {product.soldOut ? 'Agotado' : 'Agregar al carrito'}</button>
        </div>
        <small className="store-detail-note"><Check /> Total calculado automáticamente en USDT al abrir el carrito.</small>
      </div>
    </section>
  </div>;
}

function StoreCart({ products, quantities, onQuantity, onRemove, onClose, toast }) {
  const [network, setNetwork] = useState('');
  const [payment, setPayment] = useState(null);
  const total = products.reduce((sum, product) => sum + Number(product.priceUsdt) * quantities[product.id], 0);
  const checkout = () => {
    if (!network) return toast('Selecciona una red antes de continuar.', 'error');
    setPayment(manualPayment({ network, amount: total, item: `${products.length} producto(s) de Galaxy Store` }));
  };
  return <div className="modal-backdrop store-modal-backdrop" onMouseDown={onClose}>
    <section className="galaxy-cart glass" role="dialog" aria-modal="true" aria-labelledby="store-cart-title" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><p className="eyebrow">TU SELECCIÓN</p><h2 id="store-cart-title">Carrito Galaxy</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Cerrar"><X /></button></header>
      <div className="galaxy-cart-items">{products.map((product) => <article key={product.id}>
        <ProductArtwork product={product} />
        <div><strong>{product.title}</strong><small>{money(product.priceUsdt)} USDT c/u</small><Quantity value={quantities[product.id]} onChange={(value) => onQuantity(product.id, value)} /></div>
        <span>{money(Number(product.priceUsdt) * quantities[product.id])} USDT</span>
        <button className="store-remove" type="button" onClick={() => onRemove(product.id)} aria-label={`Quitar ${product.title}`}><Trash2 /></button>
      </article>)}</div>
      <div className="galaxy-cart-summary"><span>Total</span><strong>{money(total)} <small>USDT</small></strong></div>
      {!payment ? <div className="galaxy-cart-checkout">
        <p>Selecciona la red para ver la wallet de pago.</p>
        <div className="network-options">{Object.entries(PAYMENT_NETWORKS).map(([key, item]) => <button className={network === key ? 'selected' : ''} type="button" onClick={() => setNetwork(key)} key={key}><span>{item.label}</span><small>{item.note}</small></button>)}</div>
        <div className="network-warning">Envía únicamente USDT por la red seleccionada. Una red incorrecta puede provocar pérdida de fondos.</div>
        <button className="primary-button" type="button" onClick={checkout}>Continuar con {money(total)} USDT <ChevronRight /></button>
      </div> : <div className="galaxy-cart-payment">
        <p className="eyebrow">{payment.label}</p><h3>Datos para transferencia</h3>
        <img src={payment.qr} alt={`QR USDT ${payment.network}`} />
        <span>WALLET · {payment.network}</span><code>{payment.payAddress}</code>
        <button className="secondary-button" type="button" onClick={() => navigator.clipboard.writeText(payment.payAddress).then(() => toast('Dirección copiada.'))}>Copiar dirección</button>
        <div className="network-warning">Envía el comprobante y hash a {PAYMENT_CONTACT_EMAIL}. La confirmación es manual.</div>
        <button className="text-button" type="button" onClick={() => setPayment(null)}>Elegir otra red</button>
      </div>}
    </section>
  </div>;
}

function ProductEditor({ product, busy, onSave, onClose }) {
  const [form, setForm] = useState(() => ({
    title: product?.title || '', description: product?.description || '', priceUsdt: product?.priceUsdt || '', soldOut: Boolean(product?.soldOut), image: null,
  }));
  const [preview, setPreview] = useState(product?.imageUrl || '');
  useEffect(() => () => { if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview); }, [preview]);
  const chooseImage = (event) => {
    const image = event.target.files?.[0] || null;
    if (!image) return;
    if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
    setForm((current) => ({ ...current, image }));
    setPreview(URL.createObjectURL(image));
  };
  return <div className="modal-backdrop store-modal-backdrop" onMouseDown={onClose}>
    <section className="galaxy-product-editor glass" role="dialog" aria-modal="true" aria-labelledby="store-editor-title" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><p className="eyebrow">CONTROL ADMINISTRATIVO</p><h2 id="store-editor-title">{product ? 'Editar producto' : 'Agregar producto'}</h2></div><button className="icon-button" type="button" onClick={onClose}><X /></button></header>
      <form onSubmit={(event) => { event.preventDefault(); onSave({ ...form, id: product?.id, imagePath: product?.imagePath || '' }); }}>
        <label className="store-image-field">
          <span>{preview ? <img src={preview} alt="Vista previa" /> : <><ImagePlus /><strong>Sube la imagen del producto</strong><small>JPG, PNG o WebP · máximo 8 MB</small></>}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" required={!product?.imagePath} onChange={chooseImage} />
          <em><Upload /> {preview ? 'Cambiar imagen' : 'Seleccionar imagen'}</em>
        </label>
        <label>Título<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} minLength="2" maxLength="120" required placeholder="Nombre del producto" /></label>
        <label>Descripción<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} maxLength="1500" rows="5" required placeholder="Describe sus características, contenido y entrega." /></label>
        <label>Precio en USDT<input value={form.priceUsdt} onChange={(event) => setForm({ ...form, priceUsdt: event.target.value })} type="number" min="0.01" max="1000000" step="0.01" required placeholder="0.00" /></label>
        <label className="store-sold-toggle"><input type="checkbox" checked={form.soldOut} onChange={(event) => setForm({ ...form, soldOut: event.target.checked })} /><span /><div><strong>Marcar como agotado</strong><small>Los clientes podrán verlo, pero no agregarlo al carrito.</small></div></label>
        <footer><button className="secondary-button" type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy}><Save /> {busy ? 'Guardando…' : 'Guardar producto'}</button></footer>
      </form>
    </section>
  </div>;
}

export default function GalaxyStore({ isAdmin, toast }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detailQuantity, setDetailQuantity] = useState(1);
  const [cart, setCart] = useState({});
  const [cartOpen, setCartOpen] = useState(false);
  const [editing, setEditing] = useState(undefined);
  const [saving, setSaving] = useState(false);
  const load = async () => { try { setProducts(await api.getGalaxyStore()); } catch (error) { toast(error.message, 'error'); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const cartProducts = useMemo(() => products.filter((product) => cart[product.id] > 0 && !product.soldOut), [products, cart]);
  const cartCount = cartProducts.reduce((sum, product) => sum + cart[product.id], 0);
  const add = (product, quantity = 1) => {
    if (product.soldOut) return;
    setCart((current) => ({ ...current, [product.id]: (current[product.id] || 0) + quantity }));
    toast(`${product.title} fue agregado al carrito.`);
  };
  const save = async (payload) => {
    setSaving(true);
    try {
      await api.saveGalaxyStoreProduct(payload);
      await load(); setEditing(undefined); toast('Producto guardado en Galaxy Store.');
    } catch (error) { toast(error.message, 'error'); } finally { setSaving(false); }
  };
  return <div className="page-stack galaxy-store-page">
    <header className="galaxy-store-hero">
      <div><p className="eyebrow">CURATED BY PROJECT GALAXY</p><h1>Galaxy <em>Store</em></h1><p>Productos seleccionados para la comunidad. Explora cada pieza, elige la cantidad y paga directamente en USDT.</p></div>
      <span className="store-hero-orbit"><ShoppingBag /></span>
      <div className="store-hero-actions">{isAdmin && <button className="secondary-button" type="button" onClick={() => setEditing(null)}><Plus /> Agregar producto</button>}<button className="primary-button store-cart-trigger" type="button" disabled={!cartCount} onClick={() => setCartOpen(true)}><ShoppingCart /> Carrito <i>{cartCount}</i></button></div>
    </header>
    <div className="store-section-heading"><div><Sparkles /><span><strong>Selección Galaxy</strong><small>{products.length} {products.length === 1 ? 'producto' : 'productos'} · precios en USDT</small></span></div>{isAdmin && <p>Haz clic en “Editar” para actualizar información o disponibilidad.</p>}</div>
    {loading ? <div className="store-loading surface"><span /><p>Cargando Galaxy Store…</p></div> : products.length ? <div className="galaxy-store-grid">{products.map((product) => <StoreProductCard key={product.id} product={product} isAdmin={isAdmin} onOpen={(item) => { setSelected(item); setDetailQuantity(1); }} onAdd={add} onEdit={setEditing} />)}</div> : <div className="store-empty surface"><PackageOpen /><h2>La próxima colección está en órbita.</h2><p>{isAdmin ? 'Agrega el primer producto para abrir Galaxy Store.' : 'Vuelve pronto para descubrir nuevos productos.'}</p>{isAdmin && <button className="primary-button" type="button" onClick={() => setEditing(null)}><Plus /> Agregar producto</button>}</div>}
    <ProductDetail product={selected} quantity={detailQuantity} onQuantity={setDetailQuantity} onAdd={() => { add(selected, detailQuantity); setSelected(null); }} onClose={() => setSelected(null)} />
    {cartOpen && cartProducts.length > 0 && <StoreCart products={cartProducts} quantities={cart} onQuantity={(id, quantity) => setCart((current) => ({ ...current, [id]: Math.max(1, quantity) }))} onRemove={(id) => setCart((current) => ({ ...current, [id]: 0 }))} onClose={() => setCartOpen(false)} toast={toast} />}
    {editing !== undefined && <ProductEditor product={editing} busy={saving} onSave={save} onClose={() => setEditing(undefined)} />}
  </div>;
}
