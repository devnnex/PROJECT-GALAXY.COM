import { useMemo } from 'react';

const PALETTES = [
  ['#c8adff', '#6f46c7'], ['#9ed8ff', '#3d68c8'], ['#ffb8df', '#9a437d'],
  ['#a8f0d0', '#347d70'], ['#ffd69b', '#a45f40'], ['#b9b5ff', '#554ab5'],
];

function hashSeed(value) {
  let hash = 2166136261;
  for (const character of String(value || 'galaxy')) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createConstellation(seed) {
  let state = hashSeed(seed);
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const points = Array.from({ length: 7 }, () => ({
    x: Number((16 + random() * 68).toFixed(2)),
    y: Number((16 + random() * 68).toFixed(2)),
    radius: Number((1.5 + random() * 2.2).toFixed(2)),
  }));
  return { points, palette: PALETTES[hashSeed(seed) % PALETTES.length] };
}

export default function ConstellationAvatar({ seed, name = 'Usuario', className = '' }) {
  const constellation = useMemo(() => createConstellation(seed || name), [seed, name]);
  const lines = constellation.points.map((point) => `${point.x},${point.y}`).join(' ');
  return <span
    className={`constellation-avatar ${className}`.trim()}
    style={{ '--constellation-light': constellation.palette[0], '--constellation-deep': constellation.palette[1] }}
    role="img"
    aria-label={`Constelación de ${name}`}
  >
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle className="constellation-orbit" cx="50" cy="50" r="35" />
      <polyline points={lines} />
      {constellation.points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={point.radius} />)}
      <circle className="constellation-core" cx="50" cy="50" r="3.2" />
    </svg>
  </span>;
}
