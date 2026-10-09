// Lorea page-turn lab: every transition, single page and spread, LTR and RTL, drag and tap, on a 240-page book.
// No login, no app shell. Delete this + page-turn-lab.html + page-turn-lab.vite.config.mjs any time.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import PageTurn, { type PageTurnHandle } from './components/lorea/PageTurn';
import { usePageTurn } from './components/lorea/usePageTurn';
import { PAGE_TURNS, isPageTurnId, type PageTurnDir, type PageTurnId } from './services/lorea/pageTransitions';

const PAGES = 240;
const Q = new URLSearchParams(location.search);
const W = 400, H = 560;

const WORDS = 'the lantern swung over the harbour while gulls argued about nothing and the tide kept its slow appointments with the stones along the quay'.split(' ');
function para(seed: number, n: number) { let s = ''; for (let i = 0; i < n; i++) s += WORDS[(seed * 7 + i * 3 + (i * i) % 5) % WORDS.length] + ' '; return s.trim() + '.'; }

function SamplePage({ n, tone }: { n: number; tone: 'paper' | 'dark' }) {
  const hue = (n * 47) % 360;
  const art = n % 5 === 0;
  const dark = tone === 'dark';
  return (
    <div style={{ width: '100%', height: '100%', boxSizing: 'border-box', padding: '34px 32px', background: dark ? `hsl(${hue} 18% ${n % 2 ? 13 : 17}%)` : `hsl(${hue} ${n % 2 ? 55 : 40}% ${n % 2 ? 90 : 94}%)`, color: dark ? '#e8e4da' : '#2a2620', fontFamily: 'Georgia, serif', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden', borderRadius: 6, position: 'relative' }}>
      <div style={{ fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', opacity: .55 }}>Chapter {Math.floor(n / 12) + 1}</div>
      <h2 style={{ margin: 0, fontSize: 26, lineHeight: 1.1 }}>Page {n + 1}</h2>
      <div style={{ position: 'absolute', right: 26, top: 18, fontSize: 64, fontWeight: 700, opacity: .12 }}>{n + 1}</div>
      {art && <div style={{ height: 170, borderRadius: 4, background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 60) % 360} 70% 35%))`, display: 'grid', placeItems: 'center', fontSize: 54 }}>{'❦'}</div>}
      {[0, 1, 2, 3].map(i => <p key={i} style={{ margin: 0, fontSize: 15, lineHeight: 1.55 }}>{para(n * 3 + i, art ? 14 : 24)}</p>)}
      <div style={{ marginTop: 'auto', textAlign: 'center', fontSize: 12, opacity: .5 }}>{n + 1}</div>
    </div>
  );
}

function Spread({ v, rtl, tone }: { v: number; rtl: boolean; tone: 'paper' | 'dark' }) {
  const a = v * 2, b = v * 2 + 1;
  const [l, r] = rtl ? [b, a] : [a, b];
  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', position: 'relative' }}>
      <div style={{ flex: 1 }}>{l < PAGES ? <SamplePage n={l} tone={tone} /> : null}</div>
      <div style={{ flex: 1 }}>{r < PAGES ? <SamplePage n={r} tone={tone} /> : null}</div>
      <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 36, marginLeft: -18, background: 'linear-gradient(90deg, transparent, rgba(0,0,0,.18), transparent)', pointerEvents: 'none' }} />
    </div>
  );
}

function Lab() {
  const [style, setStyle] = useState<PageTurnId>(isPageTurnId(Q.get('style')) ? (Q.get('style') as PageTurnId) : 'curl');
  const [rtl, setRtl] = useState(Q.get('rtl') === '1');
  const [spread, setSpread] = useState(Q.get('spread') === '1');
  const [reduced, setReduced] = useState(Q.get('reduced') === '1');
  const [tone, setTone] = useState<'paper' | 'dark'>(Q.get('tone') === 'dark' ? 'dark' : 'paper');
  const [idx, setIdx] = useState(Number(Q.get('start') || 3));
  const [sound, setSound] = useState(false);
  const [perf, setPerf] = useState('');
  const handle = useRef<PageTurnHandle>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const total = spread ? Math.ceil(PAGES / 2) : PAGES;
  const { turn } = usePageTurn({ kind: 'novel', prefOverride: style, reducedOverride: reduced });
  const go = useCallback((d: PageTurnDir) => setIdx(i => Math.max(0, Math.min(total - 1, i + d))), [total]);

  const render = useCallback((i: number) => spread ? <Spread v={i} rtl={rtl} tone={tone} /> : <SamplePage n={i} tone={tone} />, [spread, rtl, tone]);

  // keyboard: same RTL mapping the reader uses
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'ArrowRight') go(rtl ? -1 : 1); if (e.key === 'ArrowLeft') go(rtl ? 1 : -1); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [go, rtl]);

  // programmatic control for scripts/lorea/capturePageTurns.mjs (one page load for the whole run)
  useEffect(() => {
    (window as any).__lab = {
      set: (o: { style?: PageTurnId; rtl?: boolean; spread?: boolean; tone?: 'paper' | 'dark' }) => {
        if (o.style) setStyle(o.style); if (o.rtl !== undefined) setRtl(o.rtl); if (o.spread !== undefined) setSpread(o.spread); if (o.tone) setTone(o.tone);
      },
      scrub: (dir: PageTurnDir, p: number, oy = 0.62) => handle.current?.scrub(dir, p, oy),
      end: () => handle.current?.endScrub(),
    };
  }, []);

  // frozen frame for captures
  const scrub = Q.get('scrub');
  useEffect(() => {
    if (scrub === null) return;
    const t = setTimeout(() => handle.current?.scrub((Number(Q.get('dir') || 1) as PageTurnDir), Number(scrub), 0.62), 150);
    return () => clearTimeout(t);
  }, [scrub, style, rtl, spread, tone]);

  // perf: auto-turn through the book, measure frame gaps
  useEffect(() => {
    if (Q.get('perf') !== '1') return;
    let alive = true;
    const dur = PAGE_TURNS.find(t => t.id === style)?.durationMs ?? 400;
    (async () => {
      const gaps: number[] = []; let last = performance.now(); let raf = 0;
      const loop = (now: number) => { gaps.push(now - last); last = now; raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
      for (let i = 0; i < 40 && alive; i++) { go(1); await new Promise(r => setTimeout(r, dur + 60)); }
      cancelAnimationFrame(raf);
      const g = gaps.slice(5).sort((a, b) => a - b);
      const p = (q: number) => g[Math.min(g.length - 1, Math.floor(g.length * q))]?.toFixed(1);
      const res = `style=${style} frames=${g.length} p50=${p(0.5)}ms p95=${p(0.95)}ms p99=${p(0.99)}ms max=${g[g.length - 1]?.toFixed(1)}ms over20ms=${g.filter(x => x > 20).length}`;
      setPerf(res); (window as any).__perf = res;
    })();
    return () => { alive = false; };
  }, [style, go]);

  const btn = (on: boolean): React.CSSProperties => ({ border: 0, borderRadius: 10, padding: '8px 12px', font: '600 13px system-ui', color: on ? '#000' : '#fff', background: on ? '#ff8c00' : '#2a2833', cursor: 'pointer' });
  const stageW = spread ? W * 2 : W;
  const neighbor = useCallback((d: PageTurnDir) => { const j = idx + d; return j < 0 || j >= total ? null : render(j); }, [idx, total, render]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 16 }}>
      <h1 style={{ margin: 0, fontSize: 15, letterSpacing: '.1em', textTransform: 'uppercase', opacity: .7 }}>Lorea · Page Turn Lab</h1>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', maxWidth: 900 }}>
        {PAGE_TURNS.map(t => <button key={t.id} style={btn(style === t.id)} onClick={() => setStyle(t.id)}>{t.label}</button>)}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button style={btn(rtl)} onClick={() => setRtl(v => !v)}>RTL</button>
        <button style={btn(spread)} onClick={() => { setSpread(v => !v); setIdx(i => spread ? i * 2 : Math.floor(i / 2)); }}>Two-page spread</button>
        <button style={btn(reduced)} onClick={() => setReduced(v => !v)}>Reduced motion</button>
        <button style={btn(tone === 'dark')} onClick={() => setTone(t => t === 'dark' ? 'paper' : 'dark')}>Dark</button>
        <button style={btn(sound)} onClick={() => setSound(v => !v)}>Sound</button>
        <button style={btn(false)} onClick={() => go(-1)}>Back</button>
        <button style={btn(false)} onClick={() => go(1)}>Next</button>
      </div>
      <div ref={stageRef} style={{ position: 'relative', padding: '0 40px' }}>
        <PageTurn ref={handle} pageKey={`${spread}:${idx}`} order={idx} turn={turn} rtl={rtl} spread={spread}
          renderNeighbor={neighbor} canTurn={d => idx + d >= 0 && idx + d < total} onTurn={go}
          gestureRef={stageRef} paper={tone === 'dark' ? '#25242b' : '#f1ebdc'} radius="6px" sound={sound}
          style={{ width: stageW, height: H, boxShadow: '0 20px 60px rgba(0,0,0,.55)', borderRadius: 6 }}>
          {render(idx)}
        </PageTurn>
      </div>
      <div style={{ fontSize: 12, opacity: .6 }}>{spread ? `spread ${idx + 1}/${total}` : `page ${idx + 1}/${total}`} · resolved: {turn.id} ({turn.reason}, {turn.durationMs}ms) · drag from a page edge, or use the arrow keys</div>
      <div id="perf" style={{ fontFamily: 'ui-monospace,monospace', fontSize: 12, opacity: .8 }}>{perf}</div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Lab />);
