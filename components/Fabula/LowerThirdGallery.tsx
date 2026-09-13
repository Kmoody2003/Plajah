// LowerThirdGallery — choose a motion lower third. Every card is a live loop of
// the real renderer (not a poster frame), grouped by genre / design era, with
// the template's lesson on hover-select.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Search, Clapperboard, BookOpen, Sparkles } from 'lucide-react';
import { LOWER_THIRDS, LOWER_THIRD_GROUPS } from '../../services/fabula/lowerThirdRegistry';
import { evaluateLowerThird, type LowerThirdSpec } from '../../services/fabula/lowerThirds';
import { drawLowerThird } from '../plajahPixels/engine/core/lowerThirdLayer';
import { ensureFontsLoaded } from '../../services/tela/telaFonts';
import ShaderLayer from '../plajahPixels/components/ShaderLayer';
import { materialShaderSource } from '../plajahPixels/engine/presets/materialShaders';

const LoopPreview: React.FC<{ spec: LowerThirdSpec; playing: boolean }> = ({ spec, playing }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const started = useRef(performance.now());
  const fusionSource = spec.shaderFusion ? materialShaderSource(spec.shaderFusion.shaderId) : undefined;
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const W = c.width, H = c.height;
    let raf = 0; const t0 = performance.now(); const D = Math.min(spec.duration, 4.5);
    const frame = () => {
      const t = playing ? ((performance.now() - t0) / 1000) % (D + .6) : D / 2;
      ctx.clearRect(0, 0, W, H);
      // A quiet footage ground for ordinary templates. Shader-fusion cards let
      // their live GPU layer show through this transparent canvas.
      if (!fusionSource || !playing) {
        const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#2b2733'); g.addColorStop(1, '#151219'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.beginPath(); ctx.ellipse(W * .68, H * .42, W * .16, H * .34, 0, 0, Math.PI * 2); ctx.fill();
      }
      drawLowerThird(ctx, evaluateLowerThird(spec, Math.min(t, D), D, spec.defaults), W, H);
      if (playing) raf = requestAnimationFrame(frame);
    };
    frame();
    return () => cancelAnimationFrame(raf);
  }, [spec, playing, fusionSource]);
  return <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 10, aspectRatio: '16 / 9', background: '#100b18' }}>
    {playing && fusionSource && spec.shaderFusion && <div style={{ position: 'absolute', inset: 0, opacity: spec.shaderFusion.opacity, mixBlendMode: spec.shaderFusion.blend as any }}>
      <ShaderLayer source={fusionSource} startTimeMs={started.current} params={spec.shaderFusion.params} fpsCap={30} renderScale={.5} />
    </div>}
    <canvas ref={ref} width={640} height={360} style={{ position: 'relative', zIndex: 1, width: '100%', height: 'auto', display: 'block' }} />
  </div>;
};

export const LowerThirdGallery: React.FC<{ onChoose: (spec: LowerThirdSpec) => void; onClose: () => void }> = ({ onChoose, onClose }) => {
  const [group, setGroup] = useState<string>('ALL');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<LowerThirdSpec | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => { ensureFontsLoaded(LOWER_THIRDS.flatMap(s => [s.title.font, s.subtitle.font, s.tag?.font].filter(Boolean) as string[])); }, []);
  const rows = useMemo(() => LOWER_THIRDS.filter(s => (group === 'ALL' || s.group === group) && (!q || `${s.name} ${s.tagline} ${s.tags.join(' ')} ${s.group} ${s.family || ''}`.toLowerCase().includes(q.toLowerCase()))), [group, q]);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(4,3,8,.86)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: '100%', maxWidth: 1180, maxHeight: '90vh', display: 'flex', flexDirection: 'column', borderRadius: 20, overflow: 'hidden', background: 'linear-gradient(160deg,#1a1422,#0d0a12)', border: '1px solid rgba(255,255,255,.14)', boxShadow: '0 30px 90px rgba(0,0,0,.7)', color: '#fff', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,.1)' }}>
          <span style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 12, background: 'linear-gradient(135deg,#6B0099,#D40055)' }}><Clapperboard size={17} /></span>
          <div><div style={{ fontSize: 15, fontWeight: 800 }}>Motion graphics templates</div><div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.45)' }}>{LOWER_THIRDS.length} lower thirds + full pages · shader, layer, motion and type stay editable</div></div>
          <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 10px', borderRadius: 9, background: 'rgba(0,0,0,.3)', border: '1px solid rgba(255,255,255,.1)' }}><Search size={13} style={{ opacity: .5 }} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search news, Bauhaus, sports…" style={{ background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 12, width: 200 }} /></label>
          <button onClick={onClose} style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 9, background: 'rgba(255,255,255,.06)', border: 'none', color: '#fff', cursor: 'pointer' }}><X size={15} /></button>
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '10px 18px', overflowX: 'auto', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
          {['ALL', ...LOWER_THIRD_GROUPS].map(g => <button key={g} onClick={() => setGroup(g)} style={{ flexShrink: 0, height: 26, padding: '0 11px', borderRadius: 999, fontSize: 9, fontWeight: 800, letterSpacing: '.08em', cursor: 'pointer', border: '1px solid rgba(255,255,255,.08)', color: group === g ? '#fff' : 'rgba(255,255,255,.5)', background: group === g ? 'linear-gradient(135deg,#6B0099,#D40055)' : 'rgba(255,255,255,.05)' }}>{g}</button>)}
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14, alignContent: 'start' }}>
          {rows.map(s => {
            const active = sel?.id === s.id;
            return <button key={s.id} onClick={() => setSel(active ? null : s)} onDoubleClick={() => onChoose(s)} onMouseEnter={() => setHover(s.id)} onMouseLeave={() => setHover(null)} style={{ textAlign: 'left', padding: 10, borderRadius: 14, cursor: 'pointer', background: 'rgba(0,0,0,.25)', border: `1px solid ${active ? 'rgba(216,93,255,.8)' : 'rgba(255,255,255,.1)'}`, boxShadow: active ? '0 0 0 2px rgba(140,44,183,.25)' : undefined, color: '#fff' }}>
              <LoopPreview spec={s} playing={active || hover === s.id} />
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}><strong style={{ fontSize: 12.5 }}>{s.name}</strong><span style={{ fontSize: 8.5, letterSpacing: '.12em', color: 'rgba(255,255,255,.4)' }}>{s.group}</span>{s.shaderFusion && <span style={{ fontSize: 8, color: '#7FDBFF' }}>GPU FUSION</span>}<span style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>{Object.values(s.colors).map((c, i) => <i key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: c, border: '1px solid rgba(255,255,255,.2)' }} />)}</span></div>
              <p style={{ margin: '4px 0 0', fontSize: 10.5, lineHeight: 1.4, color: 'rgba(255,255,255,.5)' }}>{s.tagline}</p>
            </button>;
          })}
          {!rows.length && <div style={{ gridColumn: '1/-1', padding: 40, textAlign: 'center', color: 'rgba(255,255,255,.4)' }}>No motion template matches. Try a genre, an era or a mood.</div>}
        </div>
        {sel && <div style={{ padding: 14, borderTop: '1px solid rgba(255,255,255,.12)', background: 'rgba(18,12,24,.95)', display: 'flex', gap: 14, alignItems: 'center' }}>
          <span style={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: `linear-gradient(135deg,${sel.colors.accent},${sel.colors.secondary})` }}><BookOpen size={17} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>{sel.name} <span style={{ fontSize: 9, letterSpacing: '.12em', color: 'rgba(255,255,255,.4)', marginLeft: 6 }}>{Math.round(sel.duration)}s · {sel.layers.length} layers</span></div>
            <p style={{ margin: '3px 0 0', fontSize: 10.5, lineHeight: 1.45, color: 'rgba(255,255,255,.6)' }}><b style={{ color: '#f0c3ff' }}>Design lesson · </b>{sel.lesson.principle} <span style={{ color: 'rgba(255,255,255,.4)' }}>{sel.lesson.history}</span></p>
          </div>
          <button onClick={() => onChoose(sel)} style={{ flexShrink: 0, height: 38, padding: '0 18px', borderRadius: 10, border: 'none', cursor: 'pointer', color: '#fff', fontSize: 11, fontWeight: 900, letterSpacing: '.06em', background: 'linear-gradient(135deg,#6B0099,#D40055)' }}><Sparkles size={12} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />ADD AT PLAYHEAD</button>
        </div>}
      </div>
    </div>
  );
};

export default LowerThirdGallery;
