/**
 * hoverPreview — the platform's shared hover-unmute audio singleton.
 * One preview audible at a time, volume ramped in/out. Used by the Global
 * Archive panorama wall and the Chora Next hero; adopt anywhere a pane
 * plays a sample on hover (never fork a second audio element).
 * The element is also registered as the kaiju's "side audio" (sideAudioSignal) so Lorik & Lumi nod to it.
 */
import { attachSideAudio, createSideAudio, detachSideAudio } from './sideAudioSignal';

let el: HTMLAudioElement | null = null;
let fade: number | null = null;

export const stopHoverPreview = () => {
  if (fade) { window.clearInterval(fade); fade = null; }
  const a = el;
  el = null;
  if (!a) return;
  detachSideAudio(a); // cut: the kaiju hand back to the main player immediately, not after the fade
  const down = window.setInterval(() => {
    a.volume = Math.max(0, a.volume - 0.12);
    if (a.volume <= 0.01) { window.clearInterval(down); a.pause(); a.src = ''; }
  }, 40);
};

export const playHoverPreview = (url: string, targetVol = 0.65) => {
  stopHoverPreview();
  const a = createSideAudio(url);
  a.loop = true;
  a.volume = 0;
  el = a;
  attachSideAudio(a);
  a.play().then(() => {
    if (el !== a) { a.pause(); detachSideAudio(a); return; }
    fade = window.setInterval(() => {
      a.volume = Math.min(targetVol, a.volume + 0.08);
      if (a.volume >= targetVol && fade) { window.clearInterval(fade); fade = null; }
    }, 40);
  }).catch(() => { /* autoplay blocked without gesture — visual hover still works */ detachSideAudio(a); });
};
