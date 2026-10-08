// AmboTemplateStylePanel — customise a slide template's theme for one slide:
// palette, faces and entrance / exit motion. The result is a ThemeOverrides
// object; the gallery writes it into the reserved `__theme` field, so the
// preview, the inserted slide and every output resolve the same customised
// theme (registry.resolveTheme) with no other plumbing.
import React from 'react';
import { RotateCcw, Play, Palette } from 'lucide-react';
import type { SlideTheme, ThemeOverrides, EnterStyle, ExitStyle } from '../../services/ambo/slideTemplates/types';
import { FONTS, type FontKey, type FontClass } from '../../services/tela/telaFonts';

const LILAC = '#D0BCFF', CYAN = '#00DAF3';

export const ENTER_STYLES: EnterStyle[] = ['rise', 'fade', 'slam', 'wipe', 'glow', 'reveal', 'float', 'drop', 'pop', 'tilt', 'glitch', 'flicker', 'scan', 'stamp', 'stretch'];
export const EXIT_STYLES: ExitStyle[] = ['fade-up', 'fade', 'slide', 'wipe-out', 'zoom-fade', 'float-up', 'drop', 'shrink', 'slide-right', 'glitch-out', 'flicker-out', 'scan-out'];

const SWATCHES: Array<{ key: 'accent' | 'accent2' | 'ground' | 'ink' | 'panel'; label: string }> = [
  { key: 'accent', label: 'Accent' }, { key: 'accent2', label: 'Accent 2' }, { key: 'ground', label: 'Ground' },
  { key: 'ink', label: 'Ink' }, { key: 'panel', label: 'Panel' },
];

const CLASS_LABEL: Record<FontClass, string> = {
  sans: 'Sans', serif: 'Serif', display: 'Display', slab: 'Slab', mono: 'Mono', script: 'Script & hand',
  blackletter: 'Blackletter', cjk: 'Japanese', arabic: 'Arabic', indic: 'Indic',
};
const FONT_GROUPS: Array<{ cls: FontClass; keys: FontKey[] }> = (() => {
  const by = new Map<FontClass, FontKey[]>();
  for (const k of Object.keys(FONTS) as FontKey[]) { const c = FONTS[k].class; if (!by.has(c)) by.set(c, []); by.get(c)!.push(k); }
  return [...by.entries()].map(([cls, keys]) => ({ cls, keys }));
})();

/** True when an overrides object changes nothing. */
export function overridesEmpty(o: ThemeOverrides | undefined): boolean {
  return !o || !Object.values(o).some(v => v !== undefined && v !== '');
}
/** Drop undefined keys (so the serialised __theme stays stable and minimal). */
export function cleanOverrides(o: ThemeOverrides): ThemeOverrides {
  const r: any = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '') r[k] = v;
  return r;
}

/** `<input type=color>` needs #rrggbb — expand #rgb and drop alpha. */
function toHex6(c: string): string {
  const m = /^#([0-9a-f]{3,8})$/i.exec(c || '');
  if (!m) return '#000000';
  const h = m[1];
  if (h.length === 3 || h.length === 4) return '#' + h.slice(0, 3).split('').map(x => x + x).join('');
  return '#' + h.slice(0, 6);
}

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="block text-[9.5px] font-extrabold uppercase tracking-wider text-white/40 mb-1">{children}</span>
);

export interface AmboTemplateStylePanelProps {
  /** The platform theme (un-customised) — source of the defaults shown. */
  base: SlideTheme;
  value: ThemeOverrides;
  onChange: (next: ThemeOverrides) => void;
  onReplay: () => void;
}

export const AmboTemplateStylePanel: React.FC<AmboTemplateStylePanelProps> = ({ base, value, onChange, onReplay }) => {
  const set = (patch: Partial<ThemeOverrides>) => onChange(cleanOverrides({ ...value, ...patch }));
  const customised = !overridesEmpty(value);
  const enterSec = value.enterSec ?? base.motion.enterSec;
  const exitSec = value.exitSec ?? base.motion.exitSec;
  const fontSelect = (which: 'display' | 'text', label: string) => (
    <label className="block min-w-0">
      <Label>{label}</Label>
      <div className="flex items-center gap-1">
        <select value={value[which] || ''} data-style={`font-${which}`}
          onChange={e => set({ [which]: (e.target.value || undefined) as FontKey | undefined })}
          className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-md px-1.5 py-1 text-[10.5px] text-white/85"
          style={{ fontFamily: value[which] ? `'${FONTS[value[which]!].family}', ${FONTS[value[which]!].fallback}` : undefined }}>
          <option value="">Theme · {FONTS[base.t[which]]?.family || base.t[which]}</option>
          {FONT_GROUPS.map(g => (
            <optgroup key={g.cls} label={CLASS_LABEL[g.cls] || g.cls}>
              {g.keys.map(k => <option key={k} value={k}>{FONTS[k].family}</option>)}
            </optgroup>
          ))}
        </select>
        {value[which] && <button onClick={() => set({ [which]: undefined })} title="Use the theme's face" className="w-6 h-6 grid place-items-center rounded hover:bg-white/10 text-white/50"><RotateCcw size={11} /></button>}
      </div>
    </label>
  );

  return (
    <div className="rounded-xl p-2.5 space-y-2.5" data-style-panel style={{ background: 'rgba(208,188,255,.05)', border: '1px solid rgba(208,188,255,.14)' }}>
      <div className="flex items-center gap-1.5">
        <Palette size={12} style={{ color: LILAC }} />
        <span className="text-[11px] font-extrabold" style={{ color: LILAC }}>Style</span>
        <span className="text-[9.5px] text-white/40 truncate">{customised ? `Customised from ${base.name}` : `${base.name} as designed`}</span>
        <button onClick={() => onChange({})} disabled={!customised} data-style="reset-all"
          className="ml-auto text-[9.5px] font-bold px-1.5 py-0.5 rounded text-white/55 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent">Reset all</button>
      </div>

      <div>
        <Label>Palette</Label>
        <div className="grid grid-cols-5 gap-1.5">
          {SWATCHES.map(s => {
            const cur = value[s.key] || base.c[s.key];
            const changed = !!value[s.key];
            return (
              <div key={s.key} className="flex flex-col items-center gap-0.5 min-w-0">
                <label className="relative w-full h-8 rounded-md cursor-pointer overflow-hidden" title={`${s.label}: ${cur}`}
                  style={{ background: cur, border: `1px solid ${changed ? CYAN : 'rgba(255,255,255,.18)'}`, boxShadow: changed ? '0 0 0 1px rgba(0,218,243,.35)' : 'none' }}>
                  <input type="color" value={toHex6(cur)} data-swatch={s.key} onChange={e => set({ [s.key]: e.target.value })}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" aria-label={`${s.label} colour`} />
                </label>
                <span className="text-[8.5px] text-white/50 truncate max-w-full">{s.label}</span>
                <button onClick={() => set({ [s.key]: undefined })} disabled={!changed} title={`Reset ${s.label.toLowerCase()}`}
                  className="text-[8px] font-bold text-white/40 hover:text-white disabled:opacity-0 leading-none">reset</button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {fontSelect('display', 'Display face')}
        {fontSelect('text', 'Text face')}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="min-w-0">
          <Label>Entrance</Label>
          <select value={value.enter || ''} data-style="enter" onChange={e => set({ enter: (e.target.value || undefined) as EnterStyle | undefined })}
            className="w-full bg-white/5 border border-white/10 rounded-md px-1.5 py-1 text-[10.5px] text-white/85">
            <option value="">Theme · {base.motion.enter}</option>
            {ENTER_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-[9.5px] text-white/50 mt-1">
            <input type="range" min={0.1} max={6} step={0.05} value={enterSec} data-style="enterSec"
              onChange={e => set({ enterSec: Number(e.target.value) })} className="flex-1 accent-[#D0BCFF] h-1" />
            <span className="font-mono w-8">{enterSec.toFixed(2)}s</span>
          </label>
        </div>
        <div className="min-w-0">
          <Label>Exit</Label>
          <select value={value.exit || ''} data-style="exit" onChange={e => set({ exit: (e.target.value || undefined) as ExitStyle | undefined })}
            className="w-full bg-white/5 border border-white/10 rounded-md px-1.5 py-1 text-[10.5px] text-white/85">
            <option value="">Theme · {base.motion.exit}</option>
            {EXIT_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-[9.5px] text-white/50 mt-1">
            <input type="range" min={0.1} max={4} step={0.05} value={exitSec} data-style="exitSec"
              onChange={e => set({ exitSec: Number(e.target.value) })} className="flex-1 accent-[#D0BCFF] h-1" />
            <span className="font-mono w-8">{exitSec.toFixed(2)}s</span>
          </label>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onReplay} data-style="replay" className="h-7 px-2 rounded-md text-[10.5px] font-bold flex items-center gap-1 bg-white/5 hover:bg-white/10" style={{ color: CYAN }}>
          <Play size={11} />Replay motion
        </button>
        {(value.enterSec !== undefined || value.exitSec !== undefined) && (
          <button onClick={() => set({ enterSec: undefined, exitSec: undefined })} className="text-[9.5px] font-bold text-white/45 hover:text-white">Reset timing</button>
        )}
        <span className="ml-auto text-[9px] text-white/35">Saved with the slide · every output draws it</span>
      </div>
    </div>
  );
};

export default AmboTemplateStylePanel;
