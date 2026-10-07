// Tiny imperative toast for the global player. The player lives above every screen's React tree
// and has no toast host of its own, so this draws one DOM node straight onto <body> — no state, no
// provider, nothing to mount — and removes it again. Used for the rare "we had to skip a track"
// and "can't reach the network" notices so a failure is never silent.

let current: HTMLDivElement | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

export function showPlayerToast(message: string, ms = 4500): void {
  if (typeof document === 'undefined' || !document.body) return;
  try {
    if (!current) {
      const el = document.createElement('div');
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.style.cssText = [
        'position:fixed', 'left:50%', 'transform:translateX(-50%)',
        'bottom:calc(env(safe-area-inset-bottom, 0px) + 96px)',
        'max-width:min(92vw,420px)', 'padding:10px 16px', 'border-radius:12px',
        'background:rgba(18,16,28,0.94)', 'color:#fff', 'font:500 13px/1.35 system-ui,sans-serif',
        'box-shadow:0 8px 28px rgba(0,0,0,0.45)', 'border:1px solid rgba(255,255,255,0.12)',
        'z-index:2147483000', 'pointer-events:none', 'text-align:center',
      ].join(';');
      document.body.appendChild(el);
      current = el;
    }
    current.textContent = message;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      try { current?.remove(); } catch { /* */ }
      current = null; timer = null;
    }, ms);
  } catch { /* a toast must never break playback */ }
}
