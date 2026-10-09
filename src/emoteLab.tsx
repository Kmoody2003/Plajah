// Emote lab — standalone preview for the Reello Live emote library.
//   npx vite --config emotes.vite.config.mjs  →  http://127.0.0.1:3111/emotes.html
//   ?pack=core|kaiju|neon|…   only one pack       ?bg=dark|light|stream   tile backdrop
//   ?size=96                  tile size            ?view=gallery|live      (live = stream simulator)
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EMOTE_PACKS } from '../services/emotes/emoteLibrary';
import type { EmoteDef } from '../services/emotes/emoteTypes';
import { emoteSrc, getEmoteAsset, frameAt, onEmoteAssetsChanged } from '../services/emotes/emoteAssets';
import { EmoteGlyph } from '../components/emotes/EmoteGlyph';

const qs = new URLSearchParams(location.search);
const BGS: Record<string, string> = {
  dark: '#120a1c',
  light: '#f4f1f8',
  stream: 'linear-gradient(135deg,#2b4a6b 0%,#c9a27a 35%,#5a3b2e 60%,#1d2a3a 100%)',
};

function Tile({ e, size, anim }: { e: EmoteDef; size: number; anim: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [, bump] = useState(0);
  useEffect(() => onEmoteAssetsChanged(() => bump(x => x + 1)), []);
  useEffect(() => {
    if (e.art.kind !== 'kaiju') return;
    let raf = 0, alive = true;
    const t0 = performance.now();
    getEmoteAsset(e, size).then(a => {
      if (!a || !alive) return;
      const tick = () => {
        const c = ref.current; if (!c) return;
        const g = c.getContext('2d')!;
        g.clearRect(0, 0, c.width, c.height);
        g.drawImage(frameAt(a, (performance.now() - t0) / 1000), 0, 0, c.width, c.height);
        raf = requestAnimationFrame(tick);
      };
      tick();
    });
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [e, size]);
  const src = e.art.kind === 'kaiju' ? null : emoteSrc(e);
  if (anim && e.art.kind === 'svg' && e.anim) return (
    <div title={`:${e.code}: — ${e.anim}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: size + 12 }}>
      <EmoteGlyph def={e} size={size} animate />
      <code style={{ fontSize: 10, opacity: 0.7 }}>:{e.code}: · {e.anim}</code>
    </div>
  );
  return (
    <div title={`:${e.code}: — ${e.name}\nmotion ${e.motion} · gel ${e.gel}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: size + 12 }}>
      {src ? <img src={src} width={size} height={size} alt={e.name} />
        : <canvas ref={ref} width={size * 2} height={size * 2} style={{ width: size, height: size }} />}
      <code style={{ fontSize: 10, opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: size + 12 }}>:{e.code}:</code>
      <span style={{ width: 10, height: 4, borderRadius: 2, background: e.gel }} />
    </div>
  );
}

function Gallery() {
  const [bg, setBg] = useState(qs.get('bg') ?? 'dark');
  const [anim, setAnim] = useState(qs.get('anim') === '1');
  const size = Number(qs.get('size')) || 96;
  const only = qs.get('pack');
  const packs = useMemo(() => EMOTE_PACKS.filter(p => !only || p.id === only), [only]);
  const total = packs.reduce((n, p) => n + p.emotes.length, 0);
  const fg = bg === 'light' ? '#1d1426' : '#f3eefa';
  return (
    <div style={{ minHeight: '100vh', background: BGS[bg], color: fg, fontFamily: 'system-ui,sans-serif', padding: 16 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <b style={{ fontSize: 18 }}>Reello Live emotes</b><span style={{ opacity: 0.6 }}>{total} emotes · {packs.length} packs</span>
        {Object.keys(BGS).map(k => <button key={k} onClick={() => setBg(k)} style={{ padding: '4px 10px', borderRadius: 99, border: '1px solid #8886', background: k === bg ? '#8a2be2' : 'transparent', color: fg }}>{k}</button>)}
        <button onClick={() => setAnim(a => !a)} style={{ padding: '4px 10px', borderRadius: 99, border: '1px solid #8886', background: anim ? '#d40055' : 'transparent', color: fg }}>{anim ? 'animating' : 'animate'}</button>
        <a href="?view=live" style={{ color: fg }}>live sim →</a>
      </div>
      {packs.map(p => (
        <section key={p.id} id={`pack-${p.id}`} style={{ marginBottom: 28 }}>
          <h2 style={{ margin: '8px 0 2px', fontSize: 16 }}>{p.name} <small style={{ opacity: 0.55, fontWeight: 400 }}>· {p.id}{p.director ? ` · ${p.director}` : ''} · {p.emotes.length}</small></h2>
          <p style={{ margin: '0 0 10px', opacity: 0.7, fontSize: 13 }}>{p.blurb}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>{p.emotes.map(e => <Tile key={e.id} e={e} size={size} anim={anim} />)}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 10, alignItems: 'center', fontSize: 14 }}>
            <span style={{ opacity: 0.6, marginRight: 6 }}>chat size →</span>
            {p.emotes.map(e => { const s = emoteSrc(e); return s ? <img key={e.id} src={s} width={28} height={28} alt="" /> : null; })}
          </div>
        </section>
      ))}
    </div>
  );
}

function App() {
  const view = qs.get('view') ?? 'gallery';
  if (view === 'live') {
    const Live = React.lazy(() => import('./emoteLabLive'));
    return <React.Suspense fallback={null}><Live /></React.Suspense>;
  }
  return <Gallery />;
}

// HMR re-runs this module; reuse the root instead of creating a second one.
const w = window as unknown as { __emoteLabRoot?: ReturnType<typeof createRoot> };
(w.__emoteLabRoot ??= createRoot(document.getElementById('root')!)).render(<App />);
