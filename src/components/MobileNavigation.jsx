import { createPortal } from 'react-dom';

export default function MobileNavigation({ items, page, navigate }) {
  return createPortal(<nav className="bottom-nav" aria-label="Navegación principal">{items.slice(0, 5).map(([id, label, Icon]) => <button className={page === id ? 'active' : ''} onClick={() => navigate(id)} key={id}><Icon /><span>{label === 'Marketplace' ? 'Market' : label}</span></button>)}</nav>, document.body);
}
