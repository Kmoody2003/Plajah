// Gritty urban punk kit for Machine Soul: concrete + brick walls, xerox grain, halftone, wheat-paste
// posters, gaffer tape, stencil and spray type. Everything is CSS/SVG; no image assets.
import React, { useEffect } from 'react';

const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Anton&family=Big+Shoulders+Stencil+Display:wght@700;900&family=IBM+Plex+Mono:wght@400;600&family=Special+Elite&display=swap';

const grain = `url("data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>')}")`;
const concrete = `url("data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><filter id="c"><feTurbulence type="fractalNoise" baseFrequency=".012" numOctaves="5" seed="7" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 .5 0"/></filter><rect width="100%" height="100%" filter="url(#c)"/></svg>')}")`;

export const GRIT_CSS = `
.tx{--tx-black:#0b0b0c;--tx-ash:#1a1a1c;--tx-concrete:#2a2a2d;--tx-paper:#e9e4d6;--tx-paper-dim:#cfc8b4;--tx-ink:#111;--tx-hazard:#ffd400;--tx-orange:#ff5a1f;--tx-red:#ff2d55;--tx-cyan:#00e5ff;--tx-acid:#b8ff00;--tx-muted:rgba(233,228,214,.68);
  position:relative;height:100%;overflow-y:auto;overflow-x:hidden;background:var(--tx-black);color:var(--tx-paper);font-family:'IBM Plex Mono',ui-monospace,monospace;scroll-behavior:smooth;-webkit-font-smoothing:antialiased}
.tx *{box-sizing:border-box}
.tx::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:60;background-image:${grain};opacity:.13;mix-blend-mode:overlay;animation:tx-grain 1.2s steps(6) infinite}
@keyframes tx-grain{0%{transform:translate(0,0)}20%{transform:translate(-3%,2%)}40%{transform:translate(2%,-3%)}60%{transform:translate(-2%,-1%)}80%{transform:translate(3%,3%)}100%{transform:translate(0,0)}}
.tx-wall{position:relative;background-color:var(--tx-ash);background-image:${concrete},radial-gradient(ellipse at 20% 0%,rgba(255,255,255,.05),transparent 60%),radial-gradient(ellipse at 90% 100%,rgba(0,0,0,.6),transparent 60%)}
.tx-brick{background-color:#241614;background-image:${concrete},linear-gradient(rgba(0,0,0,.55) 2px,transparent 2px),linear-gradient(90deg,rgba(0,0,0,.55) 2px,transparent 2px),linear-gradient(90deg,rgba(0,0,0,.55) 2px,transparent 2px);background-size:600px 600px,100% 34px,68px 68px,68px 68px;background-position:0 0,0 0,0 0,34px 34px}
.tx-halftone{background-image:radial-gradient(rgba(0,0,0,.55) 1.2px,transparent 1.4px);background-size:6px 6px}
.tx-stencil{font-family:'Big Shoulders Stencil Display','Anton',Impact,sans-serif;font-weight:900;letter-spacing:.02em;text-transform:uppercase;line-height:.86}
.tx-poster{font-family:'Anton',Impact,sans-serif;text-transform:uppercase;letter-spacing:.01em;line-height:.92}
.tx-type{font-family:'Special Elite','Courier New',monospace}
.tx-spray{text-shadow:0 0 1px currentColor,0 0 14px color-mix(in srgb,currentColor 55%,transparent),2px 2px 0 rgba(0,0,0,.6)}
.tx-drip{position:relative}
.tx-drip::after{content:'';position:absolute;left:12%;right:12%;top:92%;height:28px;background:linear-gradient(currentColor,transparent);opacity:.35;-webkit-mask:repeating-linear-gradient(90deg,#000 0 3px,transparent 3px 19px,#000 19px 21px,transparent 21px 47px);mask:repeating-linear-gradient(90deg,#000 0 3px,transparent 3px 19px,#000 19px 21px,transparent 21px 47px)}
.tx-paste{position:relative;background:var(--tx-paper);color:var(--tx-ink);box-shadow:0 1px 0 rgba(255,255,255,.2) inset,0 14px 30px -12px rgba(0,0,0,.8);clip-path:polygon(0 2%,6% 0,15% 1.5%,31% .2%,48% 1.8%,63% 0,81% 1.2%,100% 0,99% 22%,100% 47%,98.6% 71%,100% 100%,84% 98.4%,66% 100%,47% 98.2%,29% 100%,12% 98.6%,0 100%,1.2% 76%,0 51%,1.4% 27%)}
.tx-paste::after{content:'';position:absolute;inset:0;pointer-events:none;background-image:${grain},linear-gradient(115deg,rgba(255,255,255,.18),transparent 40%,rgba(0,0,0,.12) 70%,transparent);mix-blend-mode:multiply;opacity:.55}
.tx-tape{position:absolute;width:86px;height:24px;background:rgba(230,215,160,.62);box-shadow:0 1px 3px rgba(0,0,0,.35);z-index:2;clip-path:polygon(3% 0,97% 4%,100% 50%,96% 100%,2% 96%,0 46%)}
.tx-gaffer{background:#1d1d1f;color:var(--tx-paper);padding:.1em .5em;display:inline-block;transform:rotate(-1.2deg);box-shadow:0 2px 0 rgba(0,0,0,.6)}
.tx-hazard{background:repeating-linear-gradient(-45deg,var(--tx-hazard) 0 14px,#111 14px 28px)}
.tx-chip{border:2px solid currentColor;padding:.35em .8em;font:600 11px/1 'IBM Plex Mono',monospace;letter-spacing:.14em;text-transform:uppercase;background:transparent;color:var(--tx-paper);cursor:pointer;transition:transform .12s,background .12s}
.tx-chip:hover{transform:rotate(-2deg) scale(1.04)}
.tx-chip[aria-pressed="true"]{background:var(--tx-paper);color:var(--tx-ink);border-color:var(--tx-paper)}
.tx-btn{display:inline-flex;align-items:center;gap:.5em;border:0;cursor:pointer;font:600 12px/1 'IBM Plex Mono',monospace;letter-spacing:.12em;text-transform:uppercase;padding:.8em 1.1em;background:var(--tx-hazard);color:#111;box-shadow:4px 4px 0 #000;transition:transform .1s,box-shadow .1s}
.tx-btn:hover{transform:translate(-1px,-1px);box-shadow:5px 5px 0 #000}
.tx-btn:active{transform:translate(3px,3px);box-shadow:1px 1px 0 #000}
.tx-btn.ghost{background:transparent;color:var(--tx-paper);box-shadow:none;border:2px solid var(--tx-paper)}
.tx-btn:focus-visible,.tx-chip:focus-visible{outline:3px solid var(--tx-cyan);outline-offset:2px}
.tx-reveal{opacity:0;transform:translateY(40px) rotate(var(--tx-rot,0deg)) scale(.96);transition:opacity .6s cubic-bezier(.2,.8,.2,1),transform .7s cubic-bezier(.2,1.4,.3,1)}
.tx-reveal.in{opacity:1;transform:translateY(0) rotate(var(--tx-rot,0deg)) scale(1)}
.tx-slam{animation:tx-slam .5s cubic-bezier(.2,1.6,.3,1) both}
@keyframes tx-slam{0%{opacity:0;transform:scale(1.9) rotate(-6deg)}60%{opacity:1}100%{transform:scale(1) rotate(var(--tx-rot,0deg))}}
.tx-flicker{animation:tx-flicker 4s infinite}
@keyframes tx-flicker{0%,19%,21%,62%,64%,100%{opacity:1}20%,63%{opacity:.35}}
.tx-scan{background-image:repeating-linear-gradient(0deg,rgba(0,0,0,.25) 0 1px,transparent 1px 3px)}
@media (prefers-reduced-motion:reduce){.tx::before,.tx-flicker{animation:none}.tx-reveal{transition:none;opacity:1;transform:none}.tx-slam{animation:none}.tx{scroll-behavior:auto}}
`;

let injected = false;
export function GritStyles() {
  useEffect(() => {
    if (injected || typeof document === 'undefined') return;
    injected = true;
    if (!document.querySelector(`link[href="${FONT_HREF}"]`)) {
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = FONT_HREF; document.head.appendChild(l);
    }
  }, []);
  return <style>{GRIT_CSS}</style>;
}

/** Adds .in when the element scrolls into its scroll container's view. */
export function useReveal<T extends HTMLElement>(): React.RefObject<T> {
  const ref = React.useRef<T>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { el.classList.add('in'); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { el.classList.add('in'); io.disconnect(); } }), { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

export function Reveal({ children, className = '', rot = 0, style, as: Tag = 'div', ...rest }: { children: React.ReactNode; className?: string; rot?: number; style?: React.CSSProperties; as?: keyof React.JSX.IntrinsicElements } & React.HTMLAttributes<HTMLElement>) {
  const ref = useReveal<HTMLElement>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const T: any = Tag;
  return <T ref={ref} className={`tx-reveal ${className}`} style={{ ...style, ['--tx-rot' as string]: `${rot}deg` }} {...rest}>{children}</T>;
}

export function Tape({ style }: { style?: React.CSSProperties }) {
  return <span aria-hidden className="tx-tape" style={style} />;
}

/** Deterministic small rotation from a string, so posters look hand-hung but stable. */
export const tilt = (s: string, max = 2.4) => {
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 1000) / 1000 - 0.5) * 2 * max;
};
