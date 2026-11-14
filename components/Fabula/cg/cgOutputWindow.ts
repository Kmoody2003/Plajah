// cgOutputWindow — open a clean full-screen CG output (fill or key) in a popup,
// for a hardware keyer, a capture card, OBS window capture or a second display.
// The popup is same-origin and drawn from this window's playout, so it costs one
// canvas and no extra state.
import { createCgOverlayCanvas, type CgOutputMode } from '../../../services/fabula/cg/cgOutput';
import type { CgPlayout } from '../../../services/fabula/cg/cgPlayout';

export function openCgOutputWindow(playout: CgPlayout, mode: CgOutputMode = 'fill', ground: 'transparent' | 'black' | 'green' = mode === 'key' ? 'black' : 'black'): Window | null {
  const w = window.open('', `fabula-cg-${mode}`, 'width=960,height=540');
  if (!w) return null;
  w.document.title = `Fabula CG · ${mode === 'key' ? 'KEY' : 'FILL'} output`;
  w.document.body.innerHTML = '';
  const bg = ground === 'green' ? '#00b140' : ground === 'black' ? '#000' : 'transparent';
  Object.assign(w.document.body.style, { margin: '0', background: bg, overflow: 'hidden', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' });
  const canvas = w.document.createElement('canvas');
  Object.assign(canvas.style, { width: '100vw', height: '56.25vw', maxHeight: '100vh', maxWidth: '177.78vh', display: 'block' });
  w.document.body.appendChild(canvas);
  const hint = w.document.createElement('div');
  hint.textContent = 'Double-click for full screen';
  Object.assign(hint.style, { position: 'fixed', bottom: '8px', right: '12px', color: '#666', font: '11px system-ui', pointerEvents: 'none' });
  w.document.body.appendChild(hint);
  setTimeout(() => hint.remove(), 4000);
  canvas.ondblclick = () => { canvas.requestFullscreen?.().catch(() => undefined); };
  const handle = createCgOverlayCanvas(playout, { canvas, mode });
  w.addEventListener('beforeunload', () => handle.stop());
  return w;
}
