import { useEffect, useRef } from 'react';

export default function NeuralCanvas({ compact = false }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = 0; let height = 0; let raf = 0;
    let points = [];
    const resize = () => {
      const box = canvas.getBoundingClientRect();
      width = box.width; height = box.height;
      const dpr = Math.min(devicePixelRatio, 2);
      canvas.width = width * dpr; canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(compact ? 30 : 65, Math.floor(width / 18));
      points = Array.from({ length: count }, (_, i) => ({
        x: Math.random() * width, y: Math.random() * height,
        vx: (Math.random() - .5) * .13, vy: (Math.random() - .5) * .13,
        r: i % 8 === 0 ? 1.8 : .8,
      }));
    };
    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const glow = ctx.createRadialGradient(width * .62, height * .44, 0, width * .62, height * .44, Math.max(width, height) * .58);
      glow.addColorStop(0, 'rgba(118, 63, 255, .13)'); glow.addColorStop(.45, 'rgba(65, 30, 130, .04)'); glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
      points.forEach((p, i) => {
        if (!reduced) { p.x += p.vx; p.y += p.vy; }
        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;
        for (let j = i + 1; j < points.length; j += 1) {
          const q = points[j]; const distance = Math.hypot(p.x - q.x, p.y - q.y);
          if (distance < 135) {
            ctx.strokeStyle = `rgba(147, 105, 255, ${.13 * (1 - distance / 135)})`;
            ctx.lineWidth = .6; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
          }
        }
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.r > 1 ? 'rgba(190,159,255,.72)' : 'rgba(139,93,246,.38)'; ctx.fill();
      });
      if (!reduced) raf = requestAnimationFrame(draw);
    };
    resize(); draw();
    addEventListener('resize', resize);
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize); };
  }, [compact]);
  return <canvas className="neural-canvas" ref={canvasRef} aria-hidden="true" />;
}
