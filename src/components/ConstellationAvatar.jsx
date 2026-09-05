import { useEffect, useId, useMemo, useState } from 'react';
import { CONFIG } from '../config';
import { MEMBERSHIP_EMOJI } from '../membership-badges';

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
  return {
    points,
    palette: PALETTES[hashSeed(seed) % PALETTES.length],
    portrait: {
      haloTilt: Number((-14 + random() * 28).toFixed(2)),
      faceShift: Number((-2.5 + random() * 5).toFixed(2)),
      shoulderLift: Number((1 + random() * 5).toFixed(2)),
    },
  };
}

function profileAvatarUrl(value) {
  const avatar = String(value || '').trim();
  if (!avatar) return '';
  if (avatar.startsWith('blob:')) return avatar;
  const [path, version = ''] = avatar.split('?');
  if (!CONFIG.SUPABASE_URL || !/^[0-9a-f-]{36}\/profile$/i.test(path)) return '';
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return `${CONFIG.SUPABASE_URL}/storage/v1/object/public/profile-avatars/${encodedPath}${version ? `?${version}` : ''}`;
}

export default function ConstellationAvatar({ seed, name = 'Usuario', className = '', src = '', membership }) {
  const badge = membership?.isActive && MEMBERSHIP_EMOJI[membership.planCode] ? <span className="avatar-membership-badge" title={membership.planName} aria-label={membership.planName}>{MEMBERSHIP_EMOJI[membership.planCode]}</span> : null;
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const constellation = useMemo(() => createConstellation(seed || name), [seed, name]);
  const imageUrl = useMemo(() => profileAvatarUrl(src), [src]); const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => { setImageFailed(false); }, [imageUrl]);
  const lines = constellation.points.map((point) => `${point.x},${point.y}`).join(' ');
  const gradientId = `galaxy-avatar-${instanceId}`;
  const glowId = `galaxy-glow-${instanceId}`;
  if (imageUrl && !imageFailed) return <span className={`constellation-avatar profile-photo ${className}`.trim()} role="img" aria-label={`Foto de perfil de ${name}`}>
    <img src={imageUrl} alt="" onError={() => setImageFailed(true)} draggable="false" />{badge}
  </span>;
  return <span
    className={`constellation-avatar ${className}`.trim()}
    style={{ '--constellation-light': constellation.palette[0], '--constellation-deep': constellation.palette[1] }}
    role="img"
    aria-label={`Constelación de ${name}`}
  >
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" focusable="false" aria-hidden="true">
      <defs>
        <radialGradient id={gradientId} cx="32%" cy="24%" r="78%">
          <stop offset="0" stopColor="var(--constellation-light)" stopOpacity=".48" />
          <stop offset=".48" stopColor="var(--constellation-deep)" stopOpacity=".28" />
          <stop offset="1" stopColor="#08060c" stopOpacity=".96" />
        </radialGradient>
        <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.1" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <circle className="constellation-backdrop" cx="50" cy="50" r="49" fill={`url(#${gradientId})`} />
      <ellipse className="constellation-halo" cx="50" cy="39" rx="27" ry="10" transform={`rotate(${constellation.portrait.haloTilt} 50 39)`} />
      <path className="constellation-shoulders" d={`M18 91 C22 ${72 - constellation.portrait.shoulderLift}, 35 66, 50 66 C65 66, 78 ${72 - constellation.portrait.shoulderLift}, 82 91 Z`} />
      <circle className="constellation-face" cx={50 + constellation.portrait.faceShift} cy="42" r="17" />
      <path className="constellation-face-light" d="M39 42c1-10 7-16 15-16 5 0 9 2 12 6-5-2-10-1-14 2-4 3-6 8-6 14 0 4 1 8 3 11-7-2-11-8-10-17Z" />
      <g className="constellation-map" filter={`url(#${glowId})`}>
        <polyline points={lines} />
        {constellation.points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={point.radius} />)}
        <circle className="constellation-core" cx="50" cy="50" r="2.8" />
      </g>
      <circle className="constellation-rim" cx="50" cy="50" r="48.5" />
    </svg>{badge}
  </span>;
}
