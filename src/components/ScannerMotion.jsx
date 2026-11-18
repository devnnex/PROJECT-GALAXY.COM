import { useCallback, useEffect, useRef, useState } from 'react';
import { usd } from '../services/scanner-analytics';

const adjustmentKeys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

export function LiquidLotSlider({ value, max, onChange }) {
  const [phase, setPhase] = useState('idle');
  const active = useRef(false), releaseTimer = useRef();
  const finish = useCallback(() => {
    if (!active.current) return;
    active.current = false;
    setPhase('release');
    clearTimeout(releaseTimer.current);
    releaseTimer.current = setTimeout(() => setPhase('idle'), 650);
  }, []);
  useEffect(() => {
    const hide = () => { if (document.hidden) { active.current = false; clearTimeout(releaseTimer.current); setPhase('idle'); } };
    window.addEventListener('pointerup', finish); window.addEventListener('pointercancel', finish); window.addEventListener('blur', finish);
    document.addEventListener('visibilitychange', hide);
    return () => {
      clearTimeout(releaseTimer.current);
      window.removeEventListener('pointerup', finish); window.removeEventListener('pointercancel', finish); window.removeEventListener('blur', finish);
      document.removeEventListener('visibilitychange', hide);
    };
  }, [finish]);
  const start = () => { clearTimeout(releaseTimer.current); active.current = true; setPhase('active'); };
  const progress = Math.min(100, Math.max(0, (Number(value) - 0.001) / (Number(max) - 0.001) * 100)) || 0;
  return <div className="bgt-liquid-control" data-phase={phase} style={{ '--lot-progress': `${progress}%` }}>
    <div className="bgt-liquid-track" aria-hidden="true"><span className="bgt-liquid-energy"><i className="bgt-liquid-aura" /><i className="bgt-liquid-core" /><i className="bgt-liquid-ring" />{[-1, 1, -1, 1, -1, 1].map((direction, index) => <i className="bgt-liquid-drop" key={index} style={{ '--jet-x': `${direction * (14 + index * 5)}px`, '--jet-y': `${-(17 + index % 3 * 8)}px`, '--jet-delay': `${index * 90}ms`, '--jet-tilt': `${direction * 28}deg` }} />)}</span></div>
    <input className="bgt-lot-slider" type="range" min="0.001" max={max} step="0.001" value={Math.min(Number(max), Math.max(0.001, Number(value) || 0.001))}
      aria-label="Ajustar lotaje" aria-valuetext={`${value} lotes`} onChange={(event) => onChange(event.target.value)}
      onPointerDown={start} onKeyDown={(event) => { if (adjustmentKeys.has(event.key)) start(); }}
      onKeyUp={(event) => { if (adjustmentKeys.has(event.key)) finish(); }} onBlur={finish} />
  </div>;
}

// The displayed amount is always the current calculation. Only its highlight
// animates, once input settles, rather than counting through fictitious values.
export function ProfitAmount({ value, ...props }) {
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (!(value > 0) || document.hidden || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setTimeout(() => { if (!document.hidden) setPulse((current) => current + 1); }, 160);
    return () => clearTimeout(timer);
  }, [value]);
  return <strong {...props} className="bgt-profit-number" data-tone={value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral'} data-flash={value > 0 && pulse ? pulse % 2 ? 'a' : 'b' : undefined}>{usd(value)}</strong>;
}
