import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { anchorViewportBottom } from '../services/viewport-bottom';

export default function MobileNavigation({ items, page, navigate }) {
  const ref = useRef(null);
  useEffect(() => anchorViewportBottom(ref.current), []);
  return createPortal(<nav ref={ref} className="bottom-nav" aria-label="Navegación principal">{items.slice(0, 5).map(([id, label, Icon]) => <button className={page === id ? 'active' : ''} onClick={() => navigate(id)} key={id}><Icon /><span>{label === 'Marketplace' ? 'Market' : label}</span></button>)}</nav>, document.body);
}
