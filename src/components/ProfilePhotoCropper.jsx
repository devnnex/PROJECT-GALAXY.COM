import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Move, X, ZoomIn } from 'lucide-react';

const FRAME_SIZE = 280;
const OUTPUT_SIZE = 512;

function boundedOffset(dimensions, zoom, offset, frameSize) {
  if (!dimensions.width || !dimensions.height) return { x: 0, y: 0 };
  const scale = Math.max(frameSize / dimensions.width, frameSize / dimensions.height) * zoom;
  const maxX = Math.max(0, (dimensions.width * scale - frameSize) / 2);
  const maxY = Math.max(0, (dimensions.height * scale - frameSize) / 2);
  return {
    x: Math.max(-maxX, Math.min(maxX, offset.x)),
    y: Math.max(-maxY, Math.min(maxY, offset.y)),
  };
}

export default function ProfilePhotoCropper({ file, onCancel, onApply }) {
  const imageRef = useRef(null);
  const frameRef = useRef(null);
  const dragRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [frameSize, setFrameSize] = useState(FRAME_SIZE);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const source = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(source), [source]);
  useEffect(() => {
    const frame = frameRef.current; if (!frame) return undefined;
    const measure = () => setFrameSize(frame.clientWidth || FRAME_SIZE); measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure); observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const baseScale = dimensions.width && dimensions.height ? Math.max(frameSize / dimensions.width, frameSize / dimensions.height) : 1;
  const renderedWidth = dimensions.width * baseScale * zoom;
  const renderedHeight = dimensions.height * baseScale * zoom;
  const changeZoom = (event) => {
    const next = Number(event.target.value); setZoom(next);
    setOffset((current) => boundedOffset(dimensions, next, current, frameSize));
  };
  const pointerDown = (event) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, offset };
  };
  const pointerMove = (event) => {
    if (!dragRef.current) return;
    const next = { x: dragRef.current.offset.x + event.clientX - dragRef.current.x, y: dragRef.current.offset.y + event.clientY - dragRef.current.y };
    setOffset(boundedOffset(dimensions, zoom, next, frameSize));
  };
  const pointerUp = (event) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const apply = async () => {
    const image = imageRef.current;
    if (!image || !dimensions.width || busy) return;
    setBusy(true); setError('');
    try {
      const canvas = document.createElement('canvas'); canvas.width = OUTPUT_SIZE; canvas.height = OUTPUT_SIZE;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('No fue posible preparar el recorte.');
      const outputScale = OUTPUT_SIZE / frameSize;
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
      context.drawImage(image,
        ((frameSize - renderedWidth) / 2 + offset.x) * outputScale,
        ((frameSize - renderedHeight) / 2 + offset.y) * outputScale,
        renderedWidth * outputScale, renderedHeight * outputScale);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', .92));
      if (!blob) throw new Error('No fue posible preparar el recorte.');
      const name = `${String(file.name || 'perfil').replace(/\.[^.]+$/, '')}.webp`;
      onApply(new File([blob], name, { type: 'image/webp', lastModified: Date.now() }));
    } catch (cause) { setError(cause.message || 'No fue posible preparar el recorte.'); }
    finally { setBusy(false); }
  };

  return <div className="profile-crop-backdrop" onMouseDown={(event) => event.stopPropagation()}>
    <section className="profile-crop-dialog glass" role="dialog" aria-modal="true" aria-labelledby="profile-crop-title">
      <header><div><p className="eyebrow">FOTO DE PERFIL</p><h2 id="profile-crop-title">Ajusta tu foto</h2></div><button className="icon-button" type="button" onClick={onCancel} aria-label="Cerrar recorte"><X /></button></header>
      <p>Arrastra la imagen y elige exactamente qué quedará dentro del círculo.</p>
      <div ref={frameRef} className="profile-crop-frame" role="img" aria-label="Vista previa circular de la foto" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
        <img ref={imageRef} src={source} alt="" draggable="false" onLoad={(event) => { setDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }); setOffset({ x: 0, y: 0 }); }} style={{ width: renderedWidth || frameSize, height: renderedHeight || frameSize, transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))` }} />
        <span className="profile-crop-guide"><Move /></span>
      </div>
      <label className="profile-crop-zoom"><ZoomIn /><span>Acercar</span><input type="range" min="1" max="3" step="0.01" value={zoom} onChange={changeZoom} /></label>
      {error && <div className="inline-error" role="alert">{error}</div>}
      <footer><button className="secondary-button" type="button" onClick={onCancel}>Cancelar</button><button className="primary-button" type="button" disabled={busy || !dimensions.width} onClick={apply}><Check /> {busy ? 'Preparando…' : 'Usar esta foto'}</button></footer>
    </section>
  </div>;
}
