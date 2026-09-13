// LowerThirdInspector — full editability for a motion lower third inside
// Fabula's inspector: palette, every layer (visibility, colour, IN/OUT motion,
// timing, ease), every text role (font, size, weight, tracking, case, animator)
// and the anchor. Writes clip.tGraphic overrides; the spec itself is never
// mutated, so "Reset" always works and the template stays a template.
import React, { useState } from 'react';
import { Eye, EyeOff, RotateCcw, ExternalLink, Layers, Type as TypeIcon, Palette } from 'lucide-react';
import { applyGraphicRef, type LTGraphicRef, type LTLayer, type LTMotionType, type LTEase, type LTTextRole } from '../../services/fabula/lowerThirds';
import { findLowerThird } from '../../services/fabula/lowerThirdRegistry';
import { TITLE_ANIMS } from '../../services/fabula/titleAnimators';
import { FONTS, ensureFontsLoaded, type FontKey } from '../../services/tela/telaFonts';

const MOTIONS: Array<{ id: LTMotionType; label: string }> = [
  { id: 'none', label: 'None' }, { id: 'slideL', label: 'Slide from right' }, { id: 'slideR', label: 'Slide from left' }, { id: 'slideU', label: 'Slide up' }, { id: 'slideD', label: 'Slide down' },
  { id: 'wipeR', label: 'Wipe →' }, { id: 'wipeL', label: 'Wipe ←' }, { id: 'wipeU', label: 'Wipe ↑' }, { id: 'wipeD', label: 'Wipe ↓' },
  { id: 'growX', label: 'Grow width' }, { id: 'growY', label: 'Grow height' }, { id: 'fade', label: 'Fade' }, { id: 'pop', label: 'Pop' }, { id: 'spin', label: 'Spin' }, { id: 'drop', label: 'Drop' },
];
const EASES: LTEase[] = ['out', 'inOut', 'expo', 'back', 'bounce', 'linear'];
const FONT_KEYS = Object.keys(FONTS) as FontKey[];

export interface LTInspectorProps {
  clip: { id: string; text?: string; subtitle?: string; tag?: string; tx?: number; ty?: number; tGraphic?: LTGraphicRef };
  onPatch: (patch: Record<string, unknown>) => void;
  onOpenInTela?: () => void;
  onSwap?: () => void;
}

const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 };
const lbl: React.CSSProperties = { fontSize: 9, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,.45)', minWidth: 46 };
const num: React.CSSProperties = { width: 54, height: 24, padding: '0 6px', borderRadius: 6, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)', color: '#fff', fontSize: 11, outline: 'none' };
const sel: React.CSSProperties = { ...num, width: 'auto', flex: 1 };
const chip = (on: boolean): React.CSSProperties => ({ height: 22, padding: '0 8px', borderRadius: 6, fontSize: 9, fontWeight: 800, cursor: 'pointer', border: '1px solid rgba(255,255,255,.12)', color: on ? '#fff' : 'rgba(255,255,255,.55)', background: on ? 'rgba(107,0,153,.6)' : 'rgba(255,255,255,.05)' });

export const LowerThirdInspector: React.FC<LTInspectorProps> = ({ clip, onPatch, onOpenInTela, onSwap }) => {
  const ref = clip.tGraphic; const base = ref ? findLowerThird(ref.specId) : undefined;
  const [tab, setTab] = useState<'layers' | 'type' | 'colors'>('layers');
  const [openLayer, setOpenLayer] = useState<string | null>(null);
  if (!ref || !base) return null;
  const spec = applyGraphicRef(base, ref);
  const setRef = (patch: Partial<LTGraphicRef>) => onPatch({ tGraphic: { ...ref, ...patch } });
  const patchLayer = (id: string, p: Partial<LTLayer>) => setRef({ layers: { ...(ref.layers || {}), [id]: { ...(ref.layers?.[id] || {}), ...p } } });
  const patchMotion = (l: LTLayer, which: 'in' | 'out', p: Partial<LTLayer['in']>) => patchLayer(l.id, { [which]: { ...(which === 'in' ? l.in : (l.out || l.in)), ...p } } as Partial<LTLayer>);
  const patchRole = (role: 'title' | 'subtitle' | 'tag', p: Partial<LTTextRole>) => { if (p.font) ensureFontsLoaded([p.font]); setRef({ [role]: { ...(ref[role] || {}), ...p } }); };
  const hidden = new Set(ref.removedLayers || []);

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ display: 'grid', placeItems: 'center', width: 22, height: 22, borderRadius: 6, background: `linear-gradient(135deg,${spec.colors.accent},${spec.colors.secondary})` }}><Layers size={11} /></span>
        <div style={{ fontSize: 11.5, fontWeight: 800, flex: 1 }}>{spec.name}<div style={{ fontSize: 8.5, fontWeight: 600, letterSpacing: '.1em', color: 'rgba(255,255,255,.4)' }}>{spec.group} · LOWER THIRD</div></div>
        {onSwap && <button className="minibtn" onClick={onSwap} title="Choose a different lower third">SWAP</button>}
        <button className="minibtn" title="Reset every override to the template" onClick={() => onPatch({ tGraphic: { specId: ref.specId }, tx: undefined, ty: undefined })}><RotateCcw size={10} /></button>
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
        {(['layers', 'type', 'colors'] as const).map(t => <button key={t} style={chip(tab === t)} onClick={() => setTab(t)}>{t === 'layers' ? <><Layers size={9} style={{ display: 'inline', marginRight: 4 }} />LAYERS · {spec.layers.length}</> : t === 'type' ? <><TypeIcon size={9} style={{ display: 'inline', marginRight: 4 }} />TYPE</> : <><Palette size={9} style={{ display: 'inline', marginRight: 4 }} />COLORS</>}</button>)}
      </div>

      {tab === 'layers' && <div style={{ marginTop: 6 }}>
        {base.layers.map(bl => {
          const l = spec.layers.find(x => x.id === bl.id) || bl; const off = hidden.has(bl.id); const open = openLayer === bl.id;
          return <div key={bl.id} style={{ marginTop: 4, padding: '5px 6px', borderRadius: 7, background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', opacity: off ? .45 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button title={off ? 'Show layer' : 'Hide layer'} onClick={() => setRef({ removedLayers: off ? (ref.removedLayers || []).filter(x => x !== bl.id) : [...(ref.removedLayers || []), bl.id] })} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, display: 'grid' }}>{off ? <EyeOff size={12} /> : <Eye size={12} />}</button>
              <i style={{ width: 10, height: 10, borderRadius: 3, background: (spec.colors as any)[l.fill] || l.fill, border: '1px solid rgba(255,255,255,.25)' }} />
              <button onClick={() => setOpenLayer(open ? null : bl.id)} style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 700, padding: 0 }}>{l.label} <span style={{ fontSize: 8.5, color: 'rgba(255,255,255,.4)', fontWeight: 600 }}>{l.kind} · {MOTIONS.find(m => m.id === l.in.type)?.label} {l.in.duration.toFixed(2)}s</span></button>
            </div>
            {open && !off && <div style={{ marginTop: 6 }}>
              <div style={row}><span style={lbl}>Fill</span>
                {(['accent', 'ink', 'paper', 'secondary'] as const).map(k => <button key={k} title={k} onClick={() => patchLayer(bl.id, { fill: k })} style={{ width: 18, height: 18, borderRadius: 5, cursor: 'pointer', background: spec.colors[k], border: l.fill === k ? '2px solid #fff' : '1px solid rgba(255,255,255,.25)' }} />)}
                <input type="color" value={/^#/.test(l.fill) ? l.fill : '#ffffff'} onChange={e => patchLayer(bl.id, { fill: e.target.value })} title="Custom colour" style={{ width: 24, height: 20, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }} />
                <span style={{ ...lbl, minWidth: 0, marginLeft: 6 }}>Op</span><input type="range" min={0} max={1} step={.02} value={l.opacity ?? 1} onChange={e => patchLayer(bl.id, { opacity: +e.target.value })} style={{ flex: 1 }} />
              </div>
              {(['in', 'out'] as const).map(which => { const m = which === 'in' ? l.in : (l.out || { ...l.in, delay: 0 }); return <div key={which}>
                <div style={row}><span style={lbl}>{which}</span>
                  <select style={sel} value={m.type} onChange={e => patchMotion(l, which, { type: e.target.value as LTMotionType })}>{MOTIONS.map(mm => <option key={mm.id} value={mm.id}>{mm.label}</option>)}</select>
                  <select style={{ ...num, width: 70 }} value={m.ease || 'out'} onChange={e => patchMotion(l, which, { ease: e.target.value as LTEase })}>{EASES.map(e => <option key={e} value={e}>{e}</option>)}</select>
                </div>
                <div style={row}><span style={lbl}>time</span><input type="range" min={.05} max={2.5} step={.05} value={m.duration} onChange={e => patchMotion(l, which, { duration: +e.target.value })} style={{ flex: 1 }} /><span style={{ fontSize: 10, fontFamily: 'monospace', width: 40 }}>{m.duration.toFixed(2)}s</span>
                  <span style={{ ...lbl, minWidth: 0 }}>delay</span><input type="range" min={0} max={3} step={.05} value={m.delay || 0} onChange={e => patchMotion(l, which, { delay: +e.target.value })} style={{ flex: 1 }} /><span style={{ fontSize: 10, fontFamily: 'monospace', width: 40 }}>{(m.delay || 0).toFixed(2)}s</span></div>
              </div>; })}
              <div style={row}><span style={lbl}>Offset</span>
                <input type="number" style={num} value={Math.round(l.x)} onChange={e => patchLayer(bl.id, { x: +e.target.value || 0 })} title="X (design px)" />
                <input type="number" style={num} value={Math.round(l.y)} onChange={e => patchLayer(bl.id, { y: +e.target.value || 0 })} title="Y (design px)" />
                <span style={{ ...lbl, minWidth: 0 }}>Size</span>
                <input type="number" style={num} value={Math.round(l.w)} onChange={e => patchLayer(bl.id, { w: Math.max(0, +e.target.value || 0) })} title="Width" />
                <input type="number" style={num} value={Math.round(l.h)} onChange={e => patchLayer(bl.id, { h: Math.max(0, +e.target.value || 0) })} title="Height" />
              </div>
            </div>}
          </div>;
        })}
        <div className="dim small" style={{ marginTop: 6 }}>Layers list back → front. The dashed circle in the monitor is the anchor — drag it to re-place the whole graphic; positions above are relative to it.</div>
      </div>}

      {tab === 'type' && <div style={{ marginTop: 6 }}>
        {(['tag', 'title', 'subtitle'] as const).map(role => { const r = spec[role]; if (!r) return null; return <div key={role} style={{ marginTop: 4, padding: '5px 6px', borderRadius: 7, background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)' }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.12em', color: 'rgba(255,255,255,.55)' }}>{role.toUpperCase()}</div>
          <div style={row}>
            <select style={sel} value={r.font} onChange={e => patchRole(role, { font: e.target.value as FontKey })}>{FONT_KEYS.map(k => <option key={k} value={k}>{FONTS[k].family}</option>)}</select>
            <select style={{ ...num, width: 58 }} value={r.weight} onChange={e => patchRole(role, { weight: +e.target.value })}>{[100, 200, 300, 400, 500, 600, 700, 800, 900].map(w => <option key={w} value={w}>{w}</option>)}</select>
          </div>
          <div style={row}><span style={lbl}>Size</span><input type="range" min={12} max={140} step={1} value={r.size} onChange={e => patchRole(role, { size: +e.target.value })} style={{ flex: 1 }} /><span style={{ fontSize: 10, fontFamily: 'monospace', width: 34 }}>{Math.round(r.size)}</span>
            <span style={{ ...lbl, minWidth: 0 }}>Track</span><input type="range" min={-.05} max={.4} step={.01} value={r.tracking || 0} onChange={e => patchRole(role, { tracking: +e.target.value })} style={{ flex: 1 }} />
            <span style={{ ...lbl, minWidth: 0 }} title="Rotate the text about its left baseline (vertical labels, tilted titles)">Tilt</span><input type="range" min={-90} max={90} step={1} value={r.rotation || 0} onChange={e => patchRole(role, { rotation: +e.target.value || undefined })} style={{ width: 70 }} /><span style={{ fontSize: 10, fontFamily: 'monospace', width: 30 }}>{Math.round(r.rotation || 0)}°</span></div>
          <div style={row}>
            <button style={chip(!!r.upper)} onClick={() => patchRole(role, { upper: !r.upper })}>AA</button>
            <button style={{ ...chip(!!r.italic), fontStyle: 'italic' }} onClick={() => patchRole(role, { italic: !r.italic })}>It</button>
            <button style={chip(!!r.shadow)} onClick={() => patchRole(role, { shadow: !r.shadow })}>Shadow</button>
            {(['left', 'center', 'right'] as const).map(a => <button key={a} style={chip(r.align === a)} onClick={() => patchRole(role, { align: a })}>{a[0].toUpperCase()}</button>)}
            {(['accent', 'ink', 'paper', 'secondary'] as const).map(k => <button key={k} title={k} onClick={() => patchRole(role, { color: k })} style={{ width: 16, height: 16, borderRadius: 4, cursor: 'pointer', background: spec.colors[k], border: r.color === k ? '2px solid #fff' : '1px solid rgba(255,255,255,.25)' }} />)}
          </div>
          <div style={row}><span style={lbl}>Anim</span>
            <select style={sel} value={r.anim.type} onChange={e => patchRole(role, { anim: { ...r.anim, type: e.target.value as any } })}>{TITLE_ANIMS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select>
            <span style={{ ...lbl, minWidth: 0 }}>in</span><input type="range" min={.1} max={2.5} step={.05} value={r.anim.duration} onChange={e => patchRole(role, { anim: { ...r.anim, duration: +e.target.value } })} style={{ width: 60 }} />
            <span style={{ ...lbl, minWidth: 0 }}>delay</span><input type="range" min={0} max={3} step={.05} value={r.delay || 0} onChange={e => patchRole(role, { delay: +e.target.value })} style={{ width: 60 }} />
          </div>
        </div>; })}
        <div className="dim small" style={{ marginTop: 6 }}>Text content lives in the TITLE / SUBTITLE fields above; TAG uses the small kicker field. Long names shrink to fit their line count automatically.</div>
      </div>}

      {tab === 'colors' && <div style={{ marginTop: 6 }}>
        {(['accent', 'ink', 'paper', 'secondary'] as const).map(k => <div key={k} style={row}><span style={lbl}>{k}</span><input type="color" value={spec.colors[k]} onChange={e => setRef({ colors: { ...(ref.colors || {}), [k]: e.target.value } })} style={{ width: 34, height: 22, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }} /><span style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,.6)' }}>{spec.colors[k]}</span>{ref.colors?.[k] && <button className="minibtn" onClick={() => { const c = { ...(ref.colors || {}) }; delete c[k]; setRef({ colors: c }); }}>RESET</button>}</div>)}
        <div className="dim small" style={{ marginTop: 6 }}>Layers and type reference these four tokens, so recolouring the template is four edits — a brand system, not a one-off.</div>
      </div>}

      <div style={{ ...row, marginTop: 10 }}>
        <span style={lbl}>Anchor</span><span style={{ fontSize: 10, fontFamily: 'monospace' }}>{(clip.tx ?? spec.origin.x).toFixed(0)}% · {(clip.ty ?? spec.origin.y).toFixed(0)}%</span>
        <button className="minibtn" onClick={() => onPatch({ tx: undefined, ty: undefined })}>RESET</button>
        {onOpenInTela && <button className="minibtn blue" style={{ marginLeft: 'auto' }} onClick={onOpenInTela} title="Open this design as an editable Tela page (1920×1080)"><ExternalLink size={10} /> OPEN IN TELA</button>}
      </div>
      <div className="dim small" style={{ marginTop: 6 }}><b style={{ color: '#f0c3ff' }}>Lesson · </b>{spec.lesson.principle}</div>
    </div>
  );
};

export default LowerThirdInspector;
