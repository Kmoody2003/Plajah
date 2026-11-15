// D-pad / arrow-key / gamepad steering for the game's menus (story card, pause, end, controls): the way a television
// remote, a console pad, or a keyboard with no mouse reaches every button. Up/Down also scroll the tale.
// It only acts while one of those overlays is open, so it never touches the fight's own controls.

const OVERLAYS = ['#binds', '#pause', '#end', '#story'];   // topmost first
const visible = (el: Element) => (el as HTMLElement).offsetParent !== null || getComputedStyle(el as HTMLElement).position === 'fixed';
const focusables = (root: Element) => Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]')).filter((e) => visible(e) && e.offsetWidth > 0);

function openOverlay(): HTMLElement | null {
  for (const sel of OVERLAYS) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el && (el.classList.contains('on') || getComputedStyle(el).display !== 'none')) return el;
  }
  return null;
}

/** Nearest focusable in a direction, by screen geometry. */
function neighbour(from: HTMLElement, all: HTMLElement[], dir: 'up' | 'down' | 'left' | 'right'): HTMLElement | null {
  const a = from.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best: HTMLElement | null = null, bestScore = Infinity;
  for (const el of all) {
    if (el === from) continue;
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const dx = x - ax, dy = y - ay;
    const along = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx;
    if (along <= 2) continue;
    const across = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
    const score = along + across * 2.2;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  return best;
}

function step(dir: 'up' | 'down' | 'left' | 'right'): boolean {
  const ov = openOverlay(); if (!ov) return false;
  const all = focusables(ov); if (!all.length) return false;
  let cur = document.activeElement as HTMLElement | null;
  if (!cur || !ov.contains(cur)) { (all.find((e) => e.id === 'stGo' || e.id === 'pResume' || e.id === 'endAgain') ?? all[all.length - 1]).focus(); return true; }
  // the tale: Up/Down scroll it first, and only leave it at its ends
  if (cur.id === 'stBody') {
    const max = cur.scrollHeight - cur.clientHeight;
    if (dir === 'down' && cur.scrollTop < max - 2) { cur.scrollBy({ top: Math.round(cur.clientHeight * 0.6), behavior: 'smooth' }); return true; }
    if (dir === 'up' && cur.scrollTop > 2) { cur.scrollBy({ top: -Math.round(cur.clientHeight * 0.6), behavior: 'smooth' }); return true; }
  }
  const next = neighbour(cur, all, dir);
  if (next) { next.focus(); next.scrollIntoView({ block: 'nearest' }); }
  return true;
}

export function mountMenuNav() {
  addEventListener('keydown', (e) => {
    const dir = ({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' } as const)[e.key as 'ArrowUp'];
    if (dir && !(e.target as HTMLElement)?.matches?.('input, textarea, select') && step(dir)) { e.preventDefault(); e.stopPropagation(); }
    else if ((e.key === 'Enter' || e.key === ' ') && openOverlay()) {
      const cur = document.activeElement as HTMLElement | null;
      if (cur && cur.tagName === 'BUTTON' && openOverlay()!.contains(cur)) { e.preventDefault(); e.stopPropagation(); cur.click(); }
    }
  }, true);

  // gamepad: D-pad and left stick steer, A / Cross activates, B backs out of the controls editor
  const prev: Record<string, boolean> = {};
  let last = 0;
  const poll = () => {
    requestAnimationFrame(poll);
    const pad = navigator.getGamepads?.().find((p) => p);
    if (!pad || !openOverlay()) { for (const k in prev) prev[k] = false; return; }
    const now = performance.now();
    const ax = pad.axes[0] ?? 0, ay = pad.axes[1] ?? 0;
    const held: Record<string, boolean> = {
      up: !!pad.buttons[12]?.pressed || ay < -0.6, down: !!pad.buttons[13]?.pressed || ay > 0.6,
      left: !!pad.buttons[14]?.pressed || ax < -0.6, right: !!pad.buttons[15]?.pressed || ax > 0.6,
      ok: !!pad.buttons[0]?.pressed,
    };
    for (const k of ['up', 'down', 'left', 'right'] as const) {
      if (held[k] && (!prev[k] || now - last > 220)) { step(k); last = now; }
    }
    if (held.ok && !prev.ok) { const cur = document.activeElement as HTMLElement | null; if (cur?.tagName === 'BUTTON') cur.click(); else step('down'); }
    Object.assign(prev, held);
  };
  requestAnimationFrame(poll);

  // when an overlay opens, put focus on its primary button so the D-pad has somewhere to start
  let lastOv: HTMLElement | null = null;
  setInterval(() => {
    const ov = openOverlay();
    if (ov === lastOv) return;
    lastOv = ov;
    if (!ov) return;
    const all = focusables(ov);
    (all.find((e) => e.id === 'stGo' || e.id === 'pResume' || e.id === 'endAgain') ?? all[0])?.focus({ preventScroll: true });
  }, 250);
}
