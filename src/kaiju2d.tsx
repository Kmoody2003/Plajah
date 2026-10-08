// Dev-only: the 2D Kaiju disco (Lorik & Lumi, canvas sprites, mocap dances, camera + stage directors).
//
//   /kaiju-2d.html                    the 2D director stage with a demo synth (?quality=low|medium|high &section=quiet|groove|peak &hud=0)
//   /kaiju-2d.html?parity=1           the sprite/canvas figure next to the SVG original + per-frame cost
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import KaijuStage2D from '../components/kaiju/stage2d/KaijuStage2D';
import type { KaijuStyle, VocalMode } from '../components/kaiju/kaijuAudio';
import { Synth, type Section } from './kaijuDemoSynth';
import { KaijuFigure, type KaijuRig } from '../components/kaiju/KaijuFigure';
import { bakeKaijuSprites, KaijuCanvasFigure } from '../components/kaiju/stage2d/kaijuCanvasFigure';
import { pose, type Pose } from '../components/kaiju/kaijuPose';
import { EXPRESSIONS, type Expr } from '../components/kaiju/stage3d/kaijuFace';
import { applyExpression } from '../components/kaiju/stage2d/kaijuExpression2D';
import { KaijuAvatarDriver, type KaijuCharacter } from '../services/vtuber/kaijuAvatar';

const wobble = (t: number, kind: 'lorik' | 'lumi'): Pose => pose({
  x: Math.sin(t * 2) * 14, y: -Math.abs(Math.sin(t * 3)) * 40, rot: Math.sin(t * 2) * 8, headRot: Math.sin(t * 3) * 10,
  armL: 90 + Math.sin(t * 4) * 70, armR: 90 + Math.cos(t * 4) * 70, legL: Math.sin(t * 3) * 25, legR: -Math.sin(t * 3) * 25,
  liftL: Math.min(0, Math.sin(t * 3)) * 18, liftR: Math.min(0, -Math.sin(t * 3)) * 18, tail: Math.sin(t * 5) * 25, mane: Math.abs(Math.sin(t * 2)),
  happy: Math.sin(t) > 0.3 ? 1 : 0, mouth: Math.max(0, Math.sin(t * 6)), glow: Math.abs(Math.sin(t)), blush: 0.6,
  mic: kind === 'lorik' ? 1 : 0, book: kind === 'lorik' ? 0.8 : 0, camUp: kind === 'lumi' ? Math.max(0, Math.sin(t * 1.5)) : 0, shades: kind === 'lumi' && Math.sin(t * 0.7) > 0.6 ? 1 : 0,
});

/** Stress A/B: N figure pairs animated flat out, either as SVG nodes or as canvas sprites; reports real rAF fps. */
function Parity() {
  const q = new URLSearchParams(location.search);
  const mode = q.get('parity') === 'canvas' ? 'canvas' : 'svg', N = Number(q.get('n') || 6);
  const refs = useRef<(KaijuRig | null)[]>([]);
  const cv = useRef<HTMLCanvasElement>(null);
  const [info, setInfo] = useState('starting…');
  useEffect(() => {
    let raf = 0, alive = true;
    (async () => {
      let A: KaijuCanvasFigure | null = null, B: KaijuCanvasFigure | null = null;
      if (mode === 'canvas') { const [sa, sb] = await Promise.all([bakeKaijuSprites('lorik', false, 3), bakeKaijuSprites('lumi', true, 3)]); A = new KaijuCanvasFigure('lorik', sa); B = new KaijuCanvasFigure('lumi', sb); }
      let frames = 0, t0 = performance.now();
      const frame = () => {
        if (!alive) return; raf = requestAnimationFrame(frame);
        const t = performance.now() / 1000;
        if (mode === 'svg') { for (let i = 0; i < N * 2; i++) refs.current[i]?.apply(wobble(t + i * 0.3, i % 2 ? 'lumi' : 'lorik')); }
        else {
          const c = cv.current!, ctx = c.getContext('2d')!;
          ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
          for (let i = 0; i < N * 2; i++) { ctx.setTransform(0.9, 0, 0, 0.9, 80 + (i % 6) * 150, 230 + Math.floor(i / 6) * 230); (i % 2 ? B! : A!).draw(ctx, wobble(t + i * 0.3, i % 2 ? 'lumi' : 'lorik'), { flash: 0 }); }
        }
        frames++;
        if (performance.now() - t0 > 4000) { setInfo(`${mode.toUpperCase()} × ${N * 2} figures: ${(frames / ((performance.now() - t0) / 1000)).toFixed(1)} fps`); frames = 0; t0 = performance.now(); }
      };
      frame();
    })().catch(e => setInfo('ERR ' + e));
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, []);
  return (
    <div style={{ background: '#fff', padding: 12, fontFamily: 'system-ui' }}>
      <div id="info" style={{ fontSize: 14, marginBottom: 8 }}>{info}</div>
      {mode === 'svg'
        ? <svg width={1000} height={560} viewBox="0 -300 1000 560">{Array.from({ length: N * 2 }, (_, i) => (
          <g key={i} transform={`translate(${80 + (i % 6) * 150} ${(Math.floor(i / 6)) * 230 - 40}) scale(0.9)`}><KaijuFigure ref={(r: any) => { refs.current[i] = r; }} kind={i % 2 ? 'lumi' : 'lorik'} flipTail={i % 2 === 1} /></g>))}</svg>
        : <canvas ref={cv} width={1000} height={560} />}
    </div>
  );
}

/** Contact sheet: every expression on both characters (static pose). */
function Expressions() {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    (async () => {
      const [sa, sb] = await Promise.all([bakeKaijuSprites('lorik', false, 4), bakeKaijuSprites('lumi', true, 4)]);
      const figs = [new KaijuCanvasFigure('lorik', sa), new KaijuCanvasFigure('lumi', sb)];
      const q = new URLSearchParams(location.search), from = Number(q.get('from') || 0), n = Number(q.get('n') || 16), sc = Number(q.get('sc') || 0.72);
      const names = (Object.keys(EXPRESSIONS) as Expr[]).slice(from, from + n), c = cv.current!, ctx = c.getContext('2d')!;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.font = '600 13px system-ui'; ctx.fillStyle = '#3B1A5C';
      const cols = n <= 4 ? 2 : 8, cw = 230 * (sc / 0.72), ch = 260 * (sc / 0.72);
      c.width = cols * cw; c.height = Math.ceil(names.length / cols) * ch; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.font = '600 13px system-ui'; ctx.fillStyle = '#3B1A5C';
      names.forEach((e, k) => {
        for (const w of [0, 1]) {
          const p = { ...pose({}) }; applyExpression(p, { expr: e, blink: 0, gazeX: 0.2 * (w ? -1 : 1), gazeY: 0, browLift: 0, mouth: 0 });
          const x = (k % cols) * cw + (w ? cw / 2 : 0) + cw / 4, y = Math.floor(k / cols) * ch + 228 * (sc / 0.72);
          ctx.setTransform(sc, 0, 0, sc, x, y); figs[w].draw(ctx, p, {}); ctx.setTransform(1, 0, 0, 1, 0, 0);
          if (!w) ctx.fillText(e, (k % cols) * cw + 8, Math.floor(k / cols) * ch + 18);
        }
      });
    })();
  }, []);
  return <canvas ref={cv} width={1840} height={520} style={{ background: '#fff' }} />;
}

/** VTuber face-rig tester: fake tracker sliders (ARKit-style) drive the kaiju avatar exactly like the webcam would. */
const SLIDERS = ['jawOpen', 'mouthSmileLeft', 'mouthSmileRight', 'mouthFrownLeft', 'mouthFrownRight', 'mouthPucker', 'mouthFunnel', 'mouthStretchLeft', 'mouthStretchRight', 'tongueOut', 'browInnerUp', 'browDownLeft', 'browDownRight', 'browOuterUpLeft', 'browOuterUpRight', 'eyeWideLeft', 'eyeWideRight', 'eyeSquintLeft', 'eyeSquintRight', 'cheekSquintLeft', 'cheekSquintRight', 'cheekPuff', 'blinkLeft', 'blinkRight', 'lookLeft', 'lookRight', 'lookUp', 'lookDown'] as const;
const PRESETS: Record<string, Record<string, number>> = {
  neutral: {}, wink: { blinkLeft: 1, mouthSmileLeft: 0.5, mouthSmileRight: 0.5 }, laugh: { jawOpen: 0.7, mouthSmileLeft: 0.9, mouthSmileRight: 0.9, cheekSquintLeft: 0.8, cheekSquintRight: 0.8, eyeSquintLeft: 0.6, eyeSquintRight: 0.6, browOuterUpLeft: 0.4, browOuterUpRight: 0.4 },
  joy: { mouthSmileLeft: 0.9, mouthSmileRight: 0.9, cheekSquintLeft: 0.8, cheekSquintRight: 0.8, eyeSquintLeft: 0.6, eyeSquintRight: 0.6 }, surprised: { jawOpen: 0.5, eyeWideLeft: 1, eyeWideRight: 1, browInnerUp: 0.9, browOuterUpLeft: 0.8, browOuterUpRight: 0.8 },
  kiss: { mouthPucker: 0.9, mouthFunnel: 0.4, jawOpen: 0.12 }, tongue: { tongueOut: 0.9, jawOpen: 0.3, mouthSmileLeft: 0.4, mouthSmileRight: 0.4 }, skeptical: { browOuterUpRight: 1, browDownLeft: 0.7, mouthFrownLeft: 0.3 },
  sad: { browInnerUp: 0.9, mouthFrownLeft: 0.8, mouthFrownRight: 0.8 }, angry: { browDownLeft: 0.9, browDownRight: 0.9, mouthFrownLeft: 0.5, mouthFrownRight: 0.5, jawOpen: 0.2 }, 'ee (smile wide)': { mouthSmileLeft: 0.6, mouthSmileRight: 0.6, mouthStretchLeft: 0.8, mouthStretchRight: 0.8, jawOpen: 0.15 },
};
/** Contact sheet of the face rig: every preset on both characters, drawn from the same tracker→Pose mapping the webcam uses. */
function VTuberSheet() {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    (async () => {
      const [lo, lu] = await Promise.all((['lorik', 'lumi'] as KaijuCharacter[]).map(c => KaijuAvatarDriver.create(c, { size: 360 })));
      const names = Object.keys(PRESETS), cols = 5, cell = 360, c = cv.current!, ctx = c.getContext('2d')!;
      c.width = cols * cell * 2; c.height = Math.ceil(names.length / cols) * (cell + 34);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.font = '700 22px system-ui'; ctx.fillStyle = '#3B1A5C';
      names.forEach((n, k) => {
        const b = PRESETS[n], e = { blinkLeft: b.blinkLeft ?? 0, blinkRight: b.blinkRight ?? 0 };
        const x0 = (k % cols) * cell * 2, y0 = Math.floor(k / cols) * (cell + 34);
        ctx.fillText(n, x0 + 12, y0 + 24);
        [lo, lu].forEach((d, i) => { for (let f = 0; f < 3; f++) d.render({ expressions: e, blend: b, head: { x: 0, y: 0, z: 0 } }, true); ctx.drawImage(d.canvas, x0 + i * cell, y0 + 30, cell, cell); });
      });
      c.setAttribute('data-ready', '1');
    })();
  }, []);
  return <canvas ref={cv} id="sheet" />;
}

function VTuber() {
  const q = new URLSearchParams(location.search); const who = (q.get('who') as KaijuCharacter) || 'lorik';
  const host = useRef<HTMLDivElement>(null); const state = useRef<Record<string, number>>({}); const head = useRef({ x: 0, y: 0, z: 0 });
  const [vals, setVals] = useState<Record<string, number>>({}); const [h, setH] = useState({ x: 0, y: 0, z: 0 });
  useEffect(() => { state.current = vals; head.current = h; }, [vals, h]);
  useEffect(() => {
    let alive = true, raf = 0; const mount = host.current!;
    (async () => {
      const drivers = await Promise.all((['lorik', 'lumi'] as KaijuCharacter[]).map(c => KaijuAvatarDriver.create(c, { size: 420 })));
      if (!alive) return; drivers.forEach(d => { d.canvas.style.cssText = 'width:420px;height:420px;background:repeating-conic-gradient(#e8e4ee 0 25%,#fff 0 50%) 0 0/24px 24px;border-radius:16px'; mount.appendChild(d.canvas); });
      const frame = () => { if (!alive) return; raf = requestAnimationFrame(frame);
        const b = state.current, e = { blinkLeft: b.blinkLeft ?? 0, blinkRight: b.blinkRight ?? 0, lookLeft: b.lookLeft ?? 0, lookRight: b.lookRight ?? 0, lookUp: b.lookUp ?? 0, lookDown: b.lookDown ?? 0 };
        for (const d of drivers) d.render({ expressions: e, blend: b, head: head.current }, true); };
      frame();
    })();
    return () => { alive = false; cancelAnimationFrame(raf); mount.innerHTML = ''; };
  }, []);
  void who;
  const set = (k: string, v: number) => setVals(o => ({ ...o, [k]: v }));
  return (
    <div style={{ fontFamily: 'system-ui', padding: 12, background: '#fff' }}>
      <div ref={host} style={{ display: 'flex', gap: 16 }} />
      <div style={{ margin: '10px 0', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {Object.keys(PRESETS).map(n => <button key={n} onClick={() => setVals(PRESETS[n])} style={{ padding: '4px 10px', borderRadius: 99, border: '1px solid #6B0099', background: '#fff', fontSize: 12, cursor: 'pointer' }}>{n}</button>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2px 14px', fontSize: 11 }}>
        {SLIDERS.map(k => <label key={k}>{k} <input type="range" min={0} max={1} step={0.01} value={vals[k] ?? 0} onChange={e => set(k, Number(e.target.value))} style={{ width: '100%' }} /></label>)}
        {(['x', 'y', 'z'] as const).map(k => <label key={k}>head {k === 'x' ? 'pitch' : k === 'y' ? 'yaw' : 'roll'} <input type="range" min={-0.6} max={0.6} step={0.01} value={h[k]} onChange={e => setH(o => ({ ...o, [k]: Number(e.target.value) }))} style={{ width: '100%' }} /></label>)}
      </div>
    </div>
  );
}

function Stage() {
  const q = new URLSearchParams(location.search);
  const synth = useMemo(() => new Synth(), []);
  (window as any).__synth = synth;
  const [playing, setPlaying] = useState(false);
  const [section, setSection] = useState<Section>('groove');
  const [auto, setAuto] = useState(!q.get('section'));
  const [style, setStyle] = useState<KaijuStyle | 'auto'>('auto');
  const [vocal, setVocal] = useState<VocalMode | null>(null);
  const [tier, setTier] = useState<'auto' | 'quiet' | 'groove' | 'peak'>('auto');
  const quality = (q.get('quality') as 'low' | 'medium' | 'high') || 'high';
  const fileEl = useRef<HTMLAudioElement>(null);
  useEffect(() => { synth.onSection = setSection; return () => synth.stop(); }, [synth]);
  useEffect(() => { synth.auto = auto; }, [auto, synth]);
  useEffect(() => { const s = q.get('section') as Section | null; if (s) { synth.section = s; setSection(s); } }, [synth]);   // eslint-disable-line react-hooks/exhaustive-deps
  const btn = (on: boolean) => ({ padding: '6px 12px', borderRadius: 999, border: '1px solid #4a3a66', background: on ? '#6B0099' : '#150d22', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' } as React.CSSProperties);
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: "'Outfit',system-ui,sans-serif", color: '#fff' }}>
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <KaijuStage2D analyser={synth.an} isPlaying={playing} getTime={() => synth.time} style={style} forceVocal={vocal} quality={quality} forceTier={tier} showHud={q.get('hud') !== '0'} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: 10, background: '#0b0713', alignItems: 'center' }}>
        <button style={btn(playing)} onClick={() => { if (playing) { synth.stop(); setPlaying(false); } else { synth.start(); setPlaying(true); } }}>{playing ? '■ Stop' : '▶ Play'}</button>
        <span style={{ fontSize: 11, opacity: .6 }}>arrangement:</span>
        <button style={btn(auto)} onClick={() => setAuto(a => !a)}>auto</button>
        {(['quiet', 'groove', 'peak'] as Section[]).map(s => <button key={s} style={btn(!auto && section === s)} onClick={() => { setAuto(false); synth.section = s; setSection(s); }}>{s}</button>)}
        <span style={{ fontSize: 11, opacity: .6 }}>now: {section}</span>
        <span style={{ fontSize: 11, opacity: .6, marginLeft: 8 }}>style:</span>
        {(['auto', 'zen', 'edm', 'rock', 'ballet'] as const).map(s => <button key={s} style={btn(style === s)} onClick={() => setStyle(s)}>{s}</button>)}
        <span style={{ fontSize: 11, opacity: .6, marginLeft: 8 }}>vocal:</span>
        {([null, 'sing', 'rap'] as (VocalMode | null)[]).map(v => <button key={String(v)} style={btn(vocal === v)} onClick={() => setVocal(v)}>{v ?? 'detect'}</button>)}
        <span style={{ fontSize: 11, opacity: .6, marginLeft: 8 }}>force tier:</span>
        {(['auto', 'quiet', 'groove', 'peak'] as const).map(t => <button key={t} style={btn(tier === t)} onClick={() => setTier(t)}>{t}</button>)}
        <label style={{ ...btn(false), marginLeft: 8 }}>⬆ Your song…<input type="file" accept="audio/*" style={{ display: 'none' }} onChange={e => {
          const fl = e.target.files?.[0]; if (!fl || !fileEl.current) return; synth.stop(); fileEl.current.src = URL.createObjectURL(fl);
          const media = synth.ctx.createMediaElementSource(fileEl.current); media.connect(synth.out); synth.ctx.resume(); fileEl.current.play(); setPlaying(true);
        }} /></label>
        <audio ref={fileEl} />
      </div>
    </div>
  );
}

const qs = new URLSearchParams(location.search);
createRoot(document.getElementById('root')!).render(qs.get('vtuber') === 'sheet' ? <VTuberSheet /> : qs.has('vtuber') ? <VTuber /> : qs.has('expressions') ? <Expressions /> : qs.has('parity') ? <Parity /> : <Stage />);
