// Fixed elements can temporarily follow the layout viewport while mobile browser
// chrome moves the visual viewport. Correct the measured difference once/frame.
export function anchorViewportBottom(element, host = window) {
  const viewport = host.visualViewport;
  if (!viewport) return () => {};
  let frame = null, shift = 0, stopped = false;
  const update = () => {
    frame = null;
    if (stopped) return;
    const box = element.getBoundingClientRect();
    const mobile = host.matchMedia('(max-width: 700px)').matches;
    const next = mobile && box.height && Math.abs(viewport.scale - 1) < .01
      ? Math.round(viewport.offsetTop + viewport.height - (box.bottom - shift)) : 0;
    if (next === shift) return;
    shift = next;
    element.style.setProperty('--bottom-nav-offset', `${shift}px`);
  };
  const schedule = () => { if (frame == null && !stopped) frame = host.requestAnimationFrame(update); };
  const events = [[viewport, 'scroll'], [viewport, 'resize'], [host, 'scroll'], [host, 'resize'], [host, 'orientationchange'], [host, 'pageshow']];
  for (const [target, type] of events) target.addEventListener(type, schedule, { passive: true });
  schedule();
  return () => {
    stopped = true;
    if (frame != null) host.cancelAnimationFrame(frame);
    for (const [target, type] of events) target.removeEventListener(type, schedule);
    element.style.removeProperty('--bottom-nav-offset');
  };
}
