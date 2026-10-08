/**
 * Persia: "The Road". A schematic route east with tappable stops. Each stop sets a giant faded word in
 * the script used there (Syriac, then Chinese), crossfades a faded reconstruction painting with a slow
 * drift, and opens a card with the same word at full size beside its reading. Haze, a dust canvas and
 * pointer parallax sit behind; all of it is switched off under reduced motion. Lazy-loaded by DossierHall.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ROAD_BG_NOTE, ROAD_DISCLAIMER, ROAD_PATH, ROAD_STOPS } from '../../../data/dossier/persiaRoad';

const CSS = `
.pr{container-type:inline-size;color:#f4efe6;font-family:'Inter',system-ui,sans-serif}
.pr-box{position:relative;isolation:isolate;border:1px solid rgba(255,255,255,.14);border-radius:16px;background:radial-gradient(1200px 400px at 20% 0%,#162049 0,#0c1020 70%);padding:clamp(14px,3cqw,28px);overflow:hidden;--px:0;--py:0}
.pr-art{position:absolute;z-index:-3;background-size:cover;background-position:center;opacity:0;filter:saturate(.7) blur(1px);inset:-6%;will-change:transform;
  -webkit-mask-image:linear-gradient(90deg,transparent 0,#000 25%,#000 75%,transparent 100%);mask-image:linear-gradient(90deg,transparent 0,#000 25%,#000 75%,transparent 100%);
  transform:translate3d(calc(var(--px) * -18px),calc(var(--py) * -12px),0) scale(1.12);transition:opacity 1.2s ease}
.pr-art.on{opacity:.34;animation:prKen 22s ease-in-out infinite alternate}
@keyframes prKen{from{transform:translate3d(calc(var(--px) * -18px + var(--x0,0%)),calc(var(--py) * -12px + var(--y0,0%)),0) scale(1.1)}to{transform:translate3d(calc(var(--px) * -18px + var(--x1,0%)),calc(var(--py) * -12px + var(--y1,0%)),0) scale(1.24)}}
.pr-haze{position:absolute;inset:-20% -30%;z-index:-2;pointer-events:none;background:radial-gradient(40% 50% at 30% 40%,rgba(159,184,255,.14),transparent 70%),radial-gradient(35% 45% at 70% 60%,rgba(255,220,170,.08),transparent 70%);animation:prHaze 18s ease-in-out infinite alternate}
@keyframes prHaze{from{transform:translateX(-8%)}to{transform:translateX(8%) translateY(4%)}}
.pr-dust{position:absolute;inset:0;width:100%;height:100%;z-index:-2;pointer-events:none}
.pr-word{position:absolute;inset:0;z-index:-1;display:grid;place-items:center;pointer-events:none;overflow:hidden}
.pr-word span{display:block;font-size:clamp(130px,36cqw,400px);line-height:1.15;white-space:nowrap;color:#9fb8ff;opacity:.15;text-shadow:0 0 60px rgba(79,124,255,.35);translate:calc(var(--px) * 10px) calc(var(--py) * 6px);animation:prWord 1.1s cubic-bezier(.2,.8,.2,1) both}
.pr-word span.zh{letter-spacing:.04em}
@keyframes prWord{from{opacity:0;transform:translateY(40px) scale(.94);filter:blur(14px)}to{opacity:.15;transform:none;filter:blur(0)}}
.pr-cap{position:absolute;left:clamp(14px,3cqw,28px);bottom:10px;font-size:14px;color:#9fb0e0}
.pr-tag{position:absolute;top:12px;right:12px;font:700 12px/1 'Inter',system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;padding:5px 9px;border:1.5px solid #ff6b57;color:#ff8a78;background:rgba(10,8,8,.7)}
.pr svg{width:100%;height:auto;display:block;margin-top:14px}
.pr-pin{cursor:pointer;outline:none}
.pr-pin circle.pt{transition:fill .2s}
.pr-pin:hover circle.pt,.pr-pin.on circle.pt{fill:#9fb8ff}
.pr-pin:focus-visible circle.ring{stroke:#fff;stroke-width:2}
.pr-pin text{fill:#d3dbf6;font:500 16px 'Inter',system-ui,sans-serif}
@container (max-width:560px){.pr-pin text{display:none}}
.pr-stops{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.pr-stop{border:1.5px solid rgba(159,184,255,.4);background:rgba(10,14,32,.55);color:#dbe3fb;border-radius:999px;padding:8px 16px;font-size:15px;font-weight:600;cursor:pointer}
.pr-stop:hover,.pr-stop:focus-visible{border-color:#9fb8ff;outline:none}
.pr-stop[aria-pressed=true]{background:#4f7cff;border-color:#4f7cff;color:#fff}
.pr-card{display:grid;grid-template-columns:minmax(120px,210px) 1fr;gap:clamp(14px,3cqw,28px);align-items:center;margin-top:18px;padding:clamp(14px,2.4cqw,24px);border:1px solid rgba(255,255,255,.14);border-radius:12px;background:rgba(8,11,26,.55);backdrop-filter:blur(6px)}
@container (max-width:560px){.pr-card{grid-template-columns:1fr}}
.pr-glyph{font-size:clamp(64px,12cqw,100px);line-height:1.2;text-align:center;color:#9fb8ff}
.pr-era{font-size:15px;font-weight:600;color:#9fb8ff}
.pr-card h4{margin:2px 0 6px;font:700 clamp(28px,4cqw,38px)/1.1 var(--dh-font-d,'Cormorant Garamond'),Georgia,serif}
.pr-card p{margin:0;font:400 18px/1.6 var(--dh-font-b,'Source Serif 4'),Georgia,serif;color:#d6dcf1}
.pr-note{margin:12px 2px 0;font-size:15px;line-height:1.55;color:#a9b3d6;max-width:72ch}
@media(prefers-reduced-motion:reduce){.pr-art.on,.pr-haze,.pr-word span{animation:none}.pr-art{transition:opacity .2s}.pr-word span{opacity:.15}.pr-pin circle.pt{transition:none}}
`;

interface Layer { url: string; pan: [number, number, number, number] }

export default function PersiaRoad() {
  const [i, setI] = useState(0);
  const [layers, setLayers] = useState<[Layer | null, Layer | null]>([null, null]);
  const [hot, setHot] = useState<0 | 1>(0);
  const hotRef = useRef<0 | 1>(1);
  const box = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const stop = ROAD_STOPS[i];

  // Crossfade the faded painting: write the new image into the cold layer, then make it the hot one.
  useEffect(() => {
    const s = ROAD_STOPS[i];
    const img = new Image();
    let live = true;
    const apply = () => {
      if (!live) return;
      const cold: 0 | 1 = hotRef.current === 0 ? 1 : 0;
      hotRef.current = cold;
      setLayers(l => { const n: [Layer | null, Layer | null] = [l[0], l[1]]; n[cold] = { url: s.art, pan: s.pan }; return n; });
      setHot(cold);
    };
    img.onload = apply; img.onerror = apply; img.src = s.art;
    return () => { live = false; };
  }, [i]);

  // Pointer parallax and the dust canvas: only when motion is allowed, and only while the box is on screen.
  useEffect(() => {
    const el = box.current, c = canvas.current;
    if (!el || !c || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--px', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
      el.style.setProperty('--py', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
    };
    el.addEventListener('pointermove', move);
    const ctx = c.getContext('2d');
    let W = 0, H = 0, P: Array<{ x: number; y: number; r: number; v: number; a: number; p: number }> = [];
    const size = () => {
      W = c.width = c.clientWidth; H = c.height = c.clientHeight;
      P = Array.from({ length: 46 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.8 + 0.4, v: Math.random() * 0.25 + 0.05, a: Math.random() * 0.5 + 0.15, p: Math.random() * 6 }));
    };
    size();
    const ro = new ResizeObserver(size); ro.observe(el);
    let visible = true, raf = 0;
    const io = new IntersectionObserver(es => { visible = es[0]?.isIntersecting ?? true; }, { threshold: 0 });
    io.observe(el);
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || !ctx || document.hidden) return;
      ctx.clearRect(0, 0, W, H);
      for (const q of P) {
        q.x += q.v; q.y += Math.sin(t / 2000 + q.p) * 0.15; if (q.x > W + 4) q.x = -4;
        ctx.fillStyle = `rgba(200,215,255,${q.a * (0.6 + 0.4 * Math.sin(t / 1500 + q.p))})`;
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 6.3); ctx.fill();
      }
    };
    raf = requestAnimationFrame(frame);
    return () => { el.removeEventListener('pointermove', move); cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
  }, []);

  const pins = ROAD_STOPS.map((s, j) => (
    <g key={s.id} className={`pr-pin${j === i ? ' on' : ''}`} tabIndex={0} role="button" aria-label={`${s.name}: ${s.cap}`} aria-pressed={j === i}
      onClick={() => setI(j)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setI(j); } }}>
      <circle className="ring" cx={s.x} cy={s.y} r={17} fill="transparent" stroke="transparent" />
      <circle className="pt" cx={s.x} cy={s.y} r={9} fill="#4f7cff" stroke="#0c1020" strokeWidth={3} />
      <text x={j === 0 ? s.x - 8 : j === ROAD_STOPS.length - 1 ? s.x + 8 : s.x} y={s.y + (j % 2 ? -18 : 30)} textAnchor={j === 0 ? 'start' : j === ROAD_STOPS.length - 1 ? 'end' : 'middle'}>{s.name}</text>
    </g>
  ));

  return (
    <div className="pr">
      <style>{CSS}</style>
      <div className="pr-box" ref={box}>
        {[0, 1].map(k => {
          const l = layers[k];
          return <div key={k} className={`pr-art${hot === k && l ? ' on' : ''}`} aria-hidden
            style={l ? { backgroundImage: `url(${l.url})`, ['--x0' as string]: `${l.pan[0]}%`, ['--y0' as string]: `${l.pan[1]}%`, ['--x1' as string]: `${l.pan[2]}%`, ['--y1' as string]: `${l.pan[3]}%` } as React.CSSProperties : undefined} />;
        })}
        <div className="pr-haze" aria-hidden />
        <canvas className="pr-dust" ref={canvas} aria-hidden />
        <div className="pr-word" aria-hidden><span key={stop.id} className={stop.zh ? 'zh' : ''} dir="auto" style={{ fontFamily: stop.wordFont }}>{stop.word}</span></div>
        <span className="pr-tag">Reconstruction</span>

        <svg viewBox="0 0 900 260" role="group" aria-label="Schematic route from Mesopotamia to Chang'an">
          <path d={ROAD_PATH} fill="none" stroke="#2c3b78" strokeWidth={3} strokeDasharray="3 7" />
          <path d={ROAD_PATH} fill="none" stroke="#9fb8ff" strokeWidth={3} pathLength={100} strokeDasharray={100}
            style={{ strokeDashoffset: 100 - stop.progress, transition: 'stroke-dashoffset .8s cubic-bezier(.3,.7,.2,1)' }} />
          <g>{pins}</g>
        </svg>

        <div className="pr-stops" role="group" aria-label="Stops on the road">
          {ROAD_STOPS.map((s, j) => <button key={s.id} className="pr-stop" aria-pressed={j === i} onClick={() => setI(j)}>{s.name}</button>)}
        </div>

        <div className="pr-card" aria-live="polite">
          <div className="pr-glyph" dir="auto" lang="und" style={{ fontFamily: stop.wordFont }}>{stop.glyph}</div>
          <div>
            <div className="pr-era">{stop.era}</div>
            <h4>{stop.name}</h4>
            <p>{stop.text}</p>
          </div>
        </div>
        <div className="pr-cap" aria-hidden style={{ position: 'static', marginTop: 12 }}>{stop.cap}</div>
      </div>
      <p className="pr-note">{ROAD_DISCLAIMER} {ROAD_BG_NOTE} The short captions are summaries written for this route and are not yet tied claim by claim to the evidence list below.</p>
    </div>
  );
}
