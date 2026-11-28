import React, { useEffect, useMemo, useRef, useState } from 'react';
import { setPreviewThemeSpec } from '../../services/themeRuntime';
import { Check, Loader2, Lock, Unlock, Palette, Image as ImageIcon, Smile, Plus, Trash2, Wand2, Upload } from 'lucide-react';
import type { ThemePack, ThemePackItem, ThemeSpec, ThemeType } from '../../types';
import { THEME_OPTIONS } from './themeOptions';
import {
  SCHEME_LABELS, THEME_SURFACE, TEXT_ROLES, autoTextRoles, contrast, generateAllPalettes, generatePalette, hexToRgb, paletteVars, resolveTextRoles,
  type PaletteScheme, type TextRole, type ThemePalette,
} from '../../services/themePalette';
import {
  GRADIENT_PRESETS, PATTERN_LIST, DEFAULT_PATTERN, backgroundCss, gradientFromPalette,
  type GradientKind, type GradientSpec, type PatternId, type ThemeBackground,
} from '../../services/themeBackground';
import { uploadFile } from '../../services/backendService';

/**
 * Theme Studio — one editor for personal themes (Settings → Appearance) and org themes
 * (Elevate → Manage → Theme). It authors a ThemeSpec: base look, four accent levels with
 * colour-theory palette generation, a background (solid / gradient / pattern / photo-video
 * slideshow) and an emoji / sticker / GIF pack. Tela is one click away for anything drawn or
 * generated; drop the exported image or clip back in under Background → Media.
 */
interface Props {
  value?: ThemeSpec;
  scope: 'user' | 'org';
  /** Storage folder for uploads, e.g. `themes/<uid>` or `orgs/<id>/theme`. */
  uploadPath: string;
  canEdit?: boolean;
  onSave: (spec: ThemeSpec) => Promise<void>;
  /** Org scope only: lets the editor tell the viewer their page theme is on/off. */
  footer?: React.ReactNode;
  /** User scope: picking a main theme here also switches the live platform theme. */
  onBaseChange?: (base: ThemeType) => void;
}

const TABS = [
  { id: 'colors', label: 'Colours', icon: Palette },
  { id: 'background', label: 'Background', icon: ImageIcon },
  { id: 'pack', label: 'Emoji · Stickers · GIFs', icon: Smile },
] as const;
type Tab = typeof TABS[number]['id'];

const newId = () => Math.random().toString(36).slice(2, 10);
const safeHex = (v: string, fallback: string) => (hexToRgb(v) ? (v.startsWith('#') ? v : `#${v}`) : fallback);
const EMPTY_PACK: ThemePack = { emojis: [], stickers: [], gifs: [] };

const Swatch: React.FC<{ color: string; label: string; ink?: string; size?: number }> = ({ color, label, size = 36 }) => (
  <div className="flex flex-col items-center gap-1" title={`${label} ${color}`}>
    <div className="rounded-xl border border-white/20 shadow-inner" style={{ width: size, height: size, background: color }} />
    <span className="text-[10px] font-semibold opacity-70">{label}</span>
  </div>
);

const ThemeStudio: React.FC<Props> = ({ value, scope, uploadPath, canEdit = true, onSave, footer, onBaseChange }) => {
  const [tab, setTab] = useState<Tab>('colors');
  const [spec, setSpec] = useState<ThemeSpec>(() => ({ base: 'DARK', ...(value || {}) } as ThemeSpec));
  const [busy, setBusy] = useState(false);
  const [cleared, setCleared] = useState(false); // Reset pressed: save WITHOUT a palette
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const packFileRef = useRef<HTMLInputElement>(null);
  const [packKind, setPackKind] = useState<keyof ThemePack>('emojis');

  const [touched, setTouched] = useState(false);
  const set = (patch: Partial<ThemeSpec>) => { setSpec(s => ({ ...s, ...patch })); setCleared(false); setMsg(null); setTouched(true); };
  const surface = THEME_SURFACE[spec.base] ?? THEME_SURFACE.DARK;
  const palette: ThemePalette = spec.palette ?? generatePalette('#6b0099', 'analogous');
  const bg: ThemeBackground = spec.background ?? { kind: 'default' };
  const pack = spec.pack ?? EMPTY_PACK;

  const setPalette = (p: ThemePalette) => set({ palette: p });
  const setLevel = (k: 'accent1' | 'accent2' | 'accent3' | 'accent4', v: string) =>
    setPalette({ ...palette, [k]: safeHex(v, palette[k]), locked: { ...palette.locked, [k]: true } });
  const toggleLock = (k: 'accent1' | 'accent2' | 'accent3' | 'accent4') =>
    setPalette({ ...palette, locked: { ...palette.locked, [k]: !palette.locked?.[k] } });
  const regenerate = (scheme: PaletteScheme, secondary = palette.accent2) =>
    setPalette(generatePalette(secondary, scheme, palette.accent1, palette));
  // Text roles: the colour that actually reaches the page is always contrast-solved; a role with no
  // custom value is generated from the palette.
  const roles = useMemo(() => resolveTextRoles(palette, surface), [palette, surface]);
  const autoRoles = useMemo(() => autoTextRoles(palette, surface), [palette, surface]);
  const setRole = (k: TextRole, hex: string) => setPalette({ ...palette, text: { ...palette.text, [k]: safeHex(hex, roles[k]) } });
  const autoRole = (k: TextRole) => { const next = { ...palette.text }; delete next[k]; setPalette({ ...palette, text: next }); };
  const generated = useMemo(() => generateAllPalettes(palette.accent2, palette.accent1), [palette.accent2, palette.accent1]);

  // Real-time: every edit is applied to the whole platform immediately. Save only locks it in.
  useEffect(() => {
    if (!touched) return;
    setPreviewThemeSpec({ ...spec, palette: cleared ? undefined : (spec.palette ?? palette) } as ThemeSpec);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, cleared, touched]);
  useEffect(() => () => setPreviewThemeSpec(null), []);

  const previewCss = backgroundCss(bg) || undefined;
  const vars = useMemo(() => paletteVars(palette, surface), [palette, surface]);
  const previewVars = vars as React.CSSProperties;

  // ── uploads ────────────────────────────────────────────────────────────────
  const uploadMedia = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const added: NonNullable<ThemeSpec['mediaAssets']> = [];
      for (const f of Array.from(files).slice(0, 40)) {
        const isVideo = f.type.startsWith('video/');
        if (!isVideo && !f.type.startsWith('image/')) continue;
        const url = await uploadFile(`${uploadPath}/bg_${Date.now()}_${f.name}`, f);
        added.push({ id: newId(), url, type: isVideo ? 'VIDEO' : 'PHOTO' });
      }
      set({ mediaAssets: [...(spec.mediaAssets ?? []), ...added], background: { kind: 'media' } });
    } catch (e) { setMsg('Upload failed — try again.'); console.error(e); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const uploadPack = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const items: ThemePackItem[] = [];
      for (const f of Array.from(files).slice(0, 60)) {
        if (!f.type.startsWith('image/')) continue;
        const url = await uploadFile(`${uploadPath}/pack_${packKind}_${Date.now()}_${f.name}`, f);
        items.push({ id: newId(), name: f.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_]+/g, '_'), url });
      }
      set({ pack: { ...pack, [packKind]: [...pack[packKind], ...items] } });
    } catch (e) { setMsg('Upload failed — try again.'); console.error(e); }
    finally { setUploading(false); if (packFileRef.current) packFileRef.current.value = ''; }
  };

  const save = async () => {
    setBusy(true); setMsg(null);
    // JSON round-trip drops `undefined` (Firestore throws on it).
    try { await onSave(JSON.parse(JSON.stringify({ ...spec, palette: cleared ? undefined : (spec.palette ?? palette), id: spec.id || newId(), updatedAt: Date.now() })) as ThemeSpec); setMsg('Saved.'); setTouched(false); setPreviewThemeSpec(null); }
    catch (e) { setMsg('Could not save — try again.'); console.error(e); }
    finally { setBusy(false); }
  };

  // ── gradient helpers ───────────────────────────────────────────────────────
  const grad: GradientSpec = bg.kind === 'gradient' ? bg.gradient : GRADIENT_PRESETS[0].gradient;
  const setGrad = (g: GradientSpec) => set({ background: { kind: 'gradient', gradient: g } });
  const pat = bg.kind === 'pattern' ? bg.pattern : DEFAULT_PATTERN;
  const setPat = (p: typeof pat) => set({ background: { kind: 'pattern', pattern: p } });

  const field = 'bg-white/[0.06] border border-white/15 rounded-lg px-2 py-1 text-sm text-white outline-none focus:border-[#FF8C00]';
  const chip = (on: boolean) => `px-3 py-1.5 rounded-full text-xs font-bold border transition ${on ? 'bg-[#FF8C00] text-black border-transparent' : 'border-white/20 text-white/80 hover:border-white/50'}`;
  const card = 'rounded-2xl border border-white/10 bg-white/[0.04] p-4';

  const levelRow = (k: 'accent1' | 'accent2' | 'accent3' | 'accent4', name: string, role: string) => {
    const ink = vars[`--pj-a${k.slice(-1)}-ink`];
    return (
      <div key={k} className="flex items-center gap-3">
        <input type="color" value={palette[k]} disabled={!canEdit} onChange={e => setLevel(k, e.target.value)}
          className="w-10 h-10 rounded-lg bg-transparent border border-white/20 cursor-pointer" aria-label={`${name} colour`} />
        <input className={`${field} w-24 font-mono`} value={palette[k]} disabled={!canEdit}
          onChange={e => /^#?[0-9a-fA-F]{0,6}$/.test(e.target.value) && e.target.value.length >= 4 && setLevel(k, e.target.value)} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-white">{name}</div>
          <div className="text-[11px] text-white/55">{role}</div>
        </div>
        <span className="text-xs font-bold px-2 py-1 rounded-md" style={{ color: ink, background: 'rgba(127,127,127,.15)' }} title="This accent used as text on the page">
          Aa {contrast(ink, surface).toFixed(1)}:1
        </span>
        <button type="button" onClick={() => toggleLock(k)} disabled={!canEdit}
          title={palette.locked?.[k] ? 'Locked — regenerating keeps this colour' : 'Unlocked — regenerating may change it'}
          className="p-2 rounded-lg border border-white/15 text-white/80 hover:border-white/50">
          {palette.locked?.[k] ? <Lock size={14} /> : <Unlock size={14} />}
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex flex-wrap gap-2" role="tablist">
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={chip(tab === t.id) + ' inline-flex items-center gap-1.5'}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {/* Live preview — rendered with the real palette maths, so what you see is what ships. */}
      <div className="rounded-3xl overflow-hidden border border-white/15 relative" style={{ ...previewVars, background: surface }}>
        <div className="absolute inset-0" style={previewCss as React.CSSProperties} />
        {bg.kind === 'media' && spec.mediaAssets?.[0] && spec.mediaAssets[0].type === 'PHOTO' && (
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${spec.mediaAssets[0].url})` }} />
        )}
        <div className="relative p-5 flex flex-wrap items-center gap-4" style={{ background: 'rgba(0,0,0,.12)' }}>
          <div className="rounded-2xl p-4 min-w-[220px]" style={{ background: 'rgba(255,255,255,.12)', backdropFilter: 'blur(14px)', color: vars['--pj-a1-on'] ? undefined : undefined }}>
            <div className="text-base font-black" style={{ color: roles.heading }}>Welcome home</div>
            <div className="text-xs mt-0.5" style={{ color: roles.sub }}>Sunday service · 10:00 AM</div>
            <div className="flex gap-2 mt-3 flex-wrap">
              {([1, 2, 3, 4] as const).map(n => (
                <span key={n} className="px-3 py-1 rounded-full text-xs font-bold" style={{ background: vars[`--pj-a${n}`], color: vars[`--pj-a${n}-on`] }}>Level {n}</span>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            {([1, 2, 3, 4] as const).map(n => <Swatch key={n} color={vars[`--pj-a${n}`]} label={`A${n}`} />)}
          </div>
        </div>
      </div>

      {tab === 'colors' && (
        <div className="space-y-4">
          <div className={card}>
            <div className="text-sm font-black text-white mb-2">{scope === 'org' ? 'Preview on' : 'Main theme'}</div>
            <p className="text-xs text-white/55 mb-3">{scope === 'org'
              ? 'Visitors keep their own Light / Dark / Pastel choice on your page — your theme adds your colours, background and pack on top. This only changes the preview.'
              : 'The surface everything sits on. Text colour is chosen automatically to contrast it — you never pick text by hand.'}</p>
            <div className="flex flex-wrap gap-2">
              {THEME_OPTIONS.map(t => (
                <button key={t.id} type="button" disabled={!canEdit} onClick={() => { set({ base: t.id as ThemeType }); if (scope === 'user') onBaseChange?.(t.id as ThemeType); }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold text-white ${spec.base === t.id ? 'border-[#FF8C00]' : 'border-white/20 hover:border-white/50'}`}>
                  <span className="w-4 h-4 rounded-full border border-white/30" style={{ background: t.bg }} />{t.label}{spec.base === t.id && <Check size={12} />}
                </button>
              ))}
            </div>
          </div>

          <div className={card + ' space-y-3'}>
            <div className="text-sm font-black text-white">Accent levels</div>
            {levelRow('accent1', 'Primary accent', 'Buttons, active tabs, links')}
            {levelRow('accent2', 'Secondary', 'Chips and secondary buttons — your pick drives the generator')}
            {levelRow('accent3', 'Third', 'Highlights, tags, charts')}
            {levelRow('accent4', 'Fourth', 'Badges and decoration')}
            <p className="text-[11px] text-white/50">“Aa” shows each accent used as text on this theme; it is auto-adjusted to stay at 4.5:1 or better. Lock a level to keep it when you regenerate.</p>
          </div>

          <div className={card + ' space-y-3'}>
            <div className="text-sm font-black text-white">Text colours</div>
            <p className="text-xs text-white/55">Your palette tints the text on every page. Pick a colour for each kind of text — whatever you choose is nudged just enough to stay easy to read on this theme, so it can colour text but never sink it. Leave a role on Auto and it follows your palette.</p>
            <div className="rounded-xl border border-white/10 p-4 space-y-1" style={{ background: surface }}>
              <div className="text-lg font-black" style={{ color: roles.heading }}>Sunday gathering</div>
              <div className="text-sm font-bold" style={{ color: roles.primary }}>Great Faith Ministries · 10:00 AM</div>
              <div className="text-xs font-semibold" style={{ color: roles.sub }}>Pastor Dave Ellison · Sanctuary</div>
              <div className="text-xs" style={{ color: roles.desc }}>Doors open at 9:30. Childcare is available for ages 0–5.</div>
              <div className="text-xs font-bold underline" style={{ color: roles.link }}>Plan your visit →</div>
            </div>
            {TEXT_ROLES.map(r => {
              const custom = !!palette.text?.[r.key];
              return (
                <div key={r.key} className="flex items-center gap-3">
                  <input type="color" value={custom ? safeHex(palette.text![r.key]!, roles[r.key]) : autoRoles[r.key]} disabled={!canEdit}
                    onChange={e => setRole(r.key, e.target.value)}
                    className="w-10 h-10 rounded-lg bg-transparent border border-white/20 cursor-pointer" aria-label={`${r.label} colour`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-white">{r.label}</div>
                    <div className="text-[11px] text-white/55">{r.hint}</div>
                  </div>
                  <span className="text-xs font-bold px-2 py-1 rounded-md" style={{ color: roles[r.key], background: surface }} title="Contrast on this theme">
                    Aa {contrast(roles[r.key], surface).toFixed(1)}:1
                  </span>
                  <button type="button" disabled={!canEdit || !custom} onClick={() => autoRole(r.key)}
                    className={chip(!custom)} title="Follow the palette automatically">Auto</button>
                </div>
              );
            })}
          </div>

          <div className={card + ' space-y-3'}>
            <div className="flex items-center gap-2 text-sm font-black text-white"><Wand2 size={15} /> Generate a palette from your secondary colour</div>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(SCHEME_LABELS) as PaletteScheme[]).map(s => (
                <button key={s} type="button" disabled={!canEdit} onClick={() => regenerate(s)} title={SCHEME_LABELS[s].hint} className={chip(palette.scheme === s)}>{SCHEME_LABELS[s].label}</button>
              ))}
            </div>
            <p className="text-[11px] text-white/55">{SCHEME_LABELS[palette.scheme].hint}</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {generated.map(p => (
                <button key={p.scheme} type="button" disabled={!canEdit} onClick={() => setPalette({ ...p, locked: palette.locked })}
                  className={`flex items-center gap-3 p-2 rounded-xl border text-left ${palette.scheme === p.scheme ? 'border-[#FF8C00]' : 'border-white/10 hover:border-white/40'}`}>
                  <div className="flex">{[p.accent1, p.accent2, p.accent3, p.accent4].map((c, i) => <span key={i} className="w-7 h-7 first:rounded-l-lg last:rounded-r-lg" style={{ background: c }} />)}</div>
                  <span className="text-xs font-bold text-white">{SCHEME_LABELS[p.scheme].label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'background' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {([['default', 'Theme default'], ['solid', 'Solid'], ['gradient', 'Gradient'], ['pattern', 'Pattern'], ['media', 'Photos · Video · Slideshow']] as const).map(([k, l]) => (
              <button key={k} type="button" disabled={!canEdit} className={chip(bg.kind === k)} onClick={() => {
                if (k === 'default') set({ background: { kind: 'default' } });
                else if (k === 'solid') set({ background: { kind: 'solid', color: bg.kind === 'solid' ? bg.color : palette.accent2 } });
                else if (k === 'gradient') setGrad(grad);
                else if (k === 'pattern') setPat(pat);
                else set({ background: { kind: 'media' } });
              }}>{l}</button>
            ))}
          </div>

          {bg.kind === 'solid' && (
            <div className={card + ' flex items-center gap-3'}>
              <input type="color" value={bg.color} onChange={e => set({ background: { kind: 'solid', color: e.target.value } })} className="w-12 h-12 rounded-lg bg-transparent border border-white/20" />
              <div className="flex flex-wrap gap-2">
                {[palette.accent1, palette.accent2, palette.accent3, palette.accent4, '#0b0b0e', '#dde3ea', '#fdf6e3'].map(c => (
                  <button key={c} type="button" onClick={() => set({ background: { kind: 'solid', color: c } })} className="w-8 h-8 rounded-lg border border-white/25" style={{ background: c }} aria-label={c} />
                ))}
              </div>
            </div>
          )}

          {bg.kind === 'gradient' && (
            <div className={card + ' space-y-3'}>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {GRADIENT_PRESETS.map(p => (
                  <button key={p.id} type="button" onClick={() => setGrad(p.gradient)} className="rounded-xl overflow-hidden border border-white/15 hover:border-white/50" title={p.name}>
                    <div className="h-14" style={backgroundCss({ kind: 'gradient', gradient: p.gradient }) as React.CSSProperties} />
                    <div className="text-[10px] font-bold text-white py-1 text-center">{p.name}</div>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(['linear', 'radial', 'conic', 'mesh', 'aurora'] as GradientKind[]).map(k => (
                  <button key={k} type="button" className={chip(grad.kind === k)} onClick={() => setGrad({ ...grad, kind: k })}>{k}</button>
                ))}
                {(grad.kind === 'linear' || grad.kind === 'conic') && (
                  <label className="flex items-center gap-2 text-xs text-white/80">Angle
                    <input type="range" min={0} max={360} value={grad.angle} onChange={e => setGrad({ ...grad, angle: +e.target.value })} /> {grad.angle}°
                  </label>
                )}
              </div>
              <div className="space-y-2">
                {grad.stops.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="color" value={s.color} onChange={e => setGrad({ ...grad, stops: grad.stops.map((x, j) => j === i ? { ...x, color: e.target.value } : x) })} className="w-9 h-9 rounded bg-transparent border border-white/20" />
                    <input type="range" min={0} max={100} value={s.pos} onChange={e => setGrad({ ...grad, stops: grad.stops.map((x, j) => j === i ? { ...x, pos: +e.target.value } : x) })} className="flex-1" />
                    <span className="text-xs text-white/70 w-9">{s.pos}%</span>
                    <button type="button" disabled={grad.stops.length <= 2} onClick={() => setGrad({ ...grad, stops: grad.stops.filter((_, j) => j !== i) })} className="p-1.5 text-white/70 hover:text-white disabled:opacity-30"><Trash2 size={14} /></button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <button type="button" disabled={grad.stops.length >= 5} className={chip(false) + ' inline-flex items-center gap-1'} onClick={() => setGrad({ ...grad, stops: [...grad.stops, { color: palette.accent3, pos: 100 }] })}><Plus size={12} /> Colour stop</button>
                  <button type="button" className={chip(false) + ' inline-flex items-center gap-1'} onClick={() => setGrad(gradientFromPalette(palette.accent1, palette.accent2, palette.accent3))}><Wand2 size={12} /> Match my palette</button>
                </div>
              </div>
            </div>
          )}

          {bg.kind === 'pattern' && (
            <div className={card + ' space-y-3'}>
              <div className="flex flex-wrap gap-2">
                {PATTERN_LIST.map(p => <button key={p.id} type="button" className={chip(pat.id === p.id)} onClick={() => setPat({ ...pat, id: p.id as PatternId })}>{p.name}</button>)}
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs text-white/80">
                <label className="flex items-center gap-2">Background <input type="color" value={pat.bg} onChange={e => setPat({ ...pat, bg: e.target.value })} className="w-9 h-9 rounded bg-transparent border border-white/20" /></label>
                <label className="flex items-center gap-2">Pattern <input type="color" value={pat.fg} onChange={e => setPat({ ...pat, fg: e.target.value })} className="w-9 h-9 rounded bg-transparent border border-white/20" /></label>
                <label className="flex items-center gap-2">Size <input type="range" min={12} max={80} value={pat.scale} onChange={e => setPat({ ...pat, scale: +e.target.value })} /></label>
                <label className="flex items-center gap-2">Strength <input type="range" min={3} max={60} value={Math.round(pat.opacity * 100)} onChange={e => setPat({ ...pat, opacity: +e.target.value / 100 })} /></label>
              </div>
            </div>
          )}

          {bg.kind === 'media' && (
            <div className={card + ' space-y-3'}>
              <div className="flex flex-wrap gap-2 items-center">
                <button type="button" disabled={uploading || !canEdit} onClick={() => fileRef.current?.click()} className={chip(true) + ' inline-flex items-center gap-1.5'}>
                  {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Add photos or videos
                </button>
                <button type="button" className={chip(false)} onClick={() => window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { brief: 'theme-background' } }))}>
                  Create in Tela
                </button>
                <label className="flex items-center gap-2 text-xs text-white/80 ml-auto">Seconds per photo
                  <input type="number" min={4} max={120} value={spec.slideSeconds ?? 12} onChange={e => set({ slideSeconds: +e.target.value })} className={field + ' w-16'} />
                </label>
                <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={e => uploadMedia(e.target.files)} />
              </div>
              <p className="text-[11px] text-white/55">Photos play as a slideshow and videos play to their end, in this order. Make backgrounds in Tela, export, and add them here.</p>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {(spec.mediaAssets ?? []).map(a => (
                  <div key={a.id} className="relative rounded-lg overflow-hidden border border-white/15 aspect-video bg-black/40">
                    {a.type === 'VIDEO' ? <video src={a.url} muted className="w-full h-full object-cover" /> : <img src={a.url} alt="" className="w-full h-full object-cover" />}
                    <button type="button" aria-label="Remove" onClick={() => set({ mediaAssets: (spec.mediaAssets ?? []).filter(x => x.id !== a.id) })} className="absolute top-1 right-1 p-1 rounded-md bg-black/60 text-white"><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="text-[11px] text-white/50">Whatever you pick, a theme-matched frosted layer sits between it and the page so text stays readable.</p>
        </div>
      )}

      {tab === 'pack' && (
        <div className="space-y-4">
          <p className="text-xs text-white/60">
            {scope === 'org' ? 'Visitors on your page get these in the emoji, sticker and GIF pickers while they are here.' : 'These appear in your own pickers everywhere.'} Use PNG, WebP or GIF; emojis are typed as <span className="font-mono">:name:</span>.
          </p>
          <div className="flex gap-2">
            {(['emojis', 'stickers', 'gifs'] as const).map(k => <button key={k} type="button" className={chip(packKind === k)} onClick={() => setPackKind(k)}>{k} ({pack[k].length})</button>)}
            <button type="button" disabled={uploading || !canEdit} onClick={() => packFileRef.current?.click()} className={chip(true) + ' inline-flex items-center gap-1.5 ml-auto'}>
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Add {packKind}
            </button>
            <input ref={packFileRef} type="file" accept="image/*" multiple hidden onChange={e => uploadPack(e.target.files)} />
          </div>
          <div className={card + ' grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3'}>
            {pack[packKind].length === 0 && <div className="col-span-full text-sm text-white/55">Nothing here yet.</div>}
            {pack[packKind].map(it => (
              <div key={it.id} className="relative flex flex-col items-center gap-1">
                <img src={it.url} alt={it.name} className={packKind === 'emojis' ? 'w-10 h-10 object-contain' : 'w-20 h-20 object-contain rounded-lg'} />
                <input value={it.name} onChange={e => set({ pack: { ...pack, [packKind]: pack[packKind].map(x => x.id === it.id ? { ...x, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]+/g, '_') } : x) } })} className={field + ' w-full text-[11px] text-center'} />
                <button type="button" aria-label="Remove" onClick={() => set({ pack: { ...pack, [packKind]: pack[packKind].filter(x => x.id !== it.id) } })} className="absolute -top-1 -right-1 p-1 rounded-full bg-black/70 text-white"><Trash2 size={11} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" onClick={save} disabled={busy || !canEdit} className="px-5 py-2.5 rounded-xl font-black text-sm bg-[#FF8C00] text-black disabled:opacity-50 inline-flex items-center gap-2">
          {busy && <Loader2 size={14} className="animate-spin" />} {scope === 'org' ? 'Save org theme' : 'Save my theme'}
        </button>
        <button type="button" disabled={busy || !canEdit} onClick={() => { setSpec({ base: spec.base }); setCleared(true); setTouched(true); setMsg('Cleared — save to keep it.'); }} className="px-4 py-2.5 rounded-xl text-sm font-bold border border-white/20 text-white/80">Reset</button>
        {msg && <span className="text-sm text-white/80" role="status">{msg}</span>}
      </div>
      {footer}
    </div>
  );
};

export default ThemeStudio;
