// AmboVisualizerParamsPanel — parameters for the selected visualizer.
//
//   VisualizerParamsEditor  controlled editor (mode + params → onChange); the
//                           slide inspector uses it for a GENERATOR layer
//   AmboVisualizerParamsPanel  the Visualizers tab's right column: edits the
//                           remembered settings for the selected visualizer and
//                           applies them live to Preview / Program / both
//
// Typographic visualizers also get their word source here — scripture, the
// song or audio playing, live transcription, custom text or a data feed — with
// a live readout of the words they will spell.

import React, { useSyncExternalStore } from 'react';
import { RotateCcw, SlidersHorizontal, Type, Radio, Database, AlertTriangle } from 'lucide-react';
import {
  vizFamily, vizParamDefs, vizParam, getVizParams, setVizParams, resetVizParams, subscribeVizParams, vizParamsVersion,
  getVizApplyTarget, setVizApplyTarget, type VizParams, type VizParamDef, type VizApplyTarget,
} from '../../services/ambo/visualizerParams';
import {
  getTypoTextState, subscribeTypoText, setTypoTextPrefs, resolveTypoText, type TypoTextSource,
} from '../../services/ambo/typoText';

const CYAN = '#00DAF3';
const PINK = '#D40055';

const FAMILY_LABEL: Record<string, string> = {
  typo: 'Typographic', gen: 'Generator', studio: 'Studio GL', flux: 'Flux 3D', milkdrop: 'Milkdrop', shader: 'GLSL shader',
};

const Row: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="flex flex-col gap-1" title={hint}>
    <span className="text-[9.5px] font-semibold text-white/55 flex items-center justify-between gap-2">
      <span>{label}</span>
    </span>
    {children}
  </label>
);

function Control({ def, value, onChange }: { def: VizParamDef; value: number | string; onChange: (v: number | string) => void }) {
  const base = 'w-full bg-black/50 border border-white/12 rounded-md text-[11px] text-white outline-none focus:border-[#00DAF3]';
  switch (def.kind) {
    case 'range':
      return (
        <div className="flex items-center gap-2">
          <input type="range" min={def.min} max={def.max} step={def.step} value={Number(value)}
            onChange={e => onChange(Number(e.target.value))} className="flex-1 accent-[#00DAF3]" />
          <span className="font-mono text-[9.5px] text-white/60 w-9 text-right">{Number(value).toFixed((def.step ?? 1) < 1 ? 2 : 0)}</span>
        </div>
      );
    case 'color':
      return (
        <div className="flex items-center gap-2">
          <input type="color" value={String(value)} onChange={e => onChange(e.target.value)} className="w-8 h-6 rounded border border-white/15 bg-transparent" />
          <span className="font-mono text-[9.5px] text-white/50">{String(value).toUpperCase()}</span>
        </div>
      );
    case 'select':
      return (
        <select value={String(value)} onChange={e => onChange(e.target.value)} className={`${base} px-2 py-1`}>
          {def.options?.map(o => <option key={o.value} value={o.value} className="bg-[#14101e]">{o.label}</option>)}
        </select>
      );
    case 'toggle':
      return (
        <button type="button" onClick={() => onChange(Number(value) >= 0.5 ? 0 : 1)}
          className={`self-start px-2 py-0.5 rounded-md text-[10px] font-bold border ${Number(value) >= 0.5 ? 'text-[#00DAF3] border-[#00DAF3]/40 bg-[#00DAF3]/10' : 'text-white/50 border-white/15'}`}>
          {Number(value) >= 0.5 ? 'On' : 'Off'}
        </button>
      );
    case 'textarea':
      return <textarea value={String(value)} rows={3} onChange={e => onChange(e.target.value)} placeholder={def.hint} className={`${base} p-2 resize-none`} />;
    default:
      return <input value={String(value)} onChange={e => onChange(e.target.value)} className={`${base} px-2 py-1`} />;
  }
}

/** The words a TYPO visualizer with these params would spell right now. */
const WordsReadout: React.FC<{ params?: VizParams }> = ({ params }) => {
  const st = useSyncExternalStore(subscribeTypoText, getTypoTextState);
  const src = (typeof params?.textSource === 'string' ? params.textSource : 'auto') as TypoTextSource;
  const words = resolveTypoText(src, typeof params?.customText === 'string' ? params.customText : undefined, st);
  const lyricsAdlib = (src === 'lyrics' || src === 'auto') && st.lyrics.adlib && words === st.lyrics.text;
  return (
    <div className="rounded-md border border-white/10 bg-black/40 px-2 py-1.5">
      <div className="text-[8.5px] font-black uppercase tracking-wider text-white/35 mb-0.5">Spelling now</div>
      <div className="text-[11px] leading-snug" style={{ color: lyricsAdlib ? '#4FA8FF' : 'rgba(255,255,255,0.85)' }}>
        {words || <span className="text-white/35">Nothing yet — the visualizer shows its placeholder words.</span>}
      </div>
    </div>
  );
};

/** Shared word-source settings (custom text, data feed, playback transcription). */
const TypoSourceSettings: React.FC<{ source: string }> = ({ source }) => {
  const st = useSyncExternalStore(subscribeTypoText, getTypoTextState);
  const p = st.prefs;
  const inp = 'w-full bg-black/50 border border-white/12 rounded-md px-2 py-1 text-[10.5px] text-white outline-none focus:border-[#00DAF3]';
  return (
    <div className="flex flex-col gap-2">
      {(source === 'auto' || source === 'scripture') && (
        <label className="flex items-center gap-2 text-[10px] text-white/70">
          <input type="checkbox" checked={p.sendScripture} onChange={e => setTypoTextPrefs({ sendScripture: e.target.checked })} className="accent-[#E3C57E]" />
          Scripture drives Auto visualizers <span className="text-white/35">(same as the Scripture tab box)</span>
        </label>
      )}
      {(source === 'auto' || source === 'lyrics') && (
        <>
          <label className="flex items-center gap-2 text-[10px] text-white/70">
            <input type="checkbox" checked={p.sendLyrics} onChange={e => setTypoTextPrefs({ sendLyrics: e.target.checked })} className="accent-[#D0BCFF]" />
            Song lyrics drive Auto visualizers
          </label>
          <label className="flex items-center gap-2 text-[10px] text-white/70" title="A song with no lyric file: Ambo transcribes the program mix to get its words">
            <input type="checkbox" checked={p.autoTranscribePlayback} onChange={e => setTypoTextPrefs({ autoTranscribePlayback: e.target.checked })} className="accent-[#2BE0A8]" />
            <Radio size={10} className="text-[#2BE0A8]" /> Auto-pull lyrics of anything playing (live transcription)
          </label>
        </>
      )}
      {(source === 'custom' || source === 'auto') && (
        <Row label="Shared custom text" hint="Used by any typographic visualizer without its own text">
          <input value={p.customText} onChange={e => setTypoTextPrefs({ customText: e.target.value })} placeholder="Welcome · Grace · Peace" className={inp} />
        </Row>
      )}
      {source === 'data' && (
        <div className="flex flex-col gap-1.5 rounded-md border border-white/10 p-2">
          <div className="flex items-center gap-1.5 text-[9.5px] font-bold text-white/60"><Database size={10} /> Data source</div>
          <input value={p.dataUrl} onChange={e => setTypoTextPrefs({ dataUrl: e.target.value })} placeholder="https://…/feed.json" className={inp} />
          <div className="flex gap-1.5">
            <input value={p.dataPath} onChange={e => setTypoTextPrefs({ dataPath: e.target.value })} placeholder="path e.g. items[].title" className={inp} />
            <input type="number" min={5} value={p.dataIntervalSec} onChange={e => setTypoTextPrefs({ dataIntervalSec: Math.max(5, Number(e.target.value) || 30) })}
              title="Refresh every N seconds" className={`${inp} w-16`} />
          </div>
          {st.data.error && <div className="text-[9.5px] text-[#F5C542] flex items-center gap-1"><AlertTriangle size={9} /> {st.data.error}</div>}
        </div>
      )}
    </div>
  );
};

export const VisualizerParamsEditor: React.FC<{
  mode: string;
  kind?: string;
  params?: VizParams;
  onChange: (patch: VizParams) => void;
  compact?: boolean;
}> = ({ mode, kind, params, onChange, compact }) => {
  const fam = vizFamily(mode, kind);
  const defs = vizParamDefs(fam, mode);
  if (!defs.length) {
    return <div className="text-[10px] text-white/40 leading-snug">This {FAMILY_LABEL[fam]} has no adjustable parameters — it draws exactly as written.</div>;
  }
  const groups: string[] = [];
  for (const d of defs) if (!groups.includes(d.group || '')) groups.push(d.group || '');
  const visible = (d: VizParamDef) => !d.showIf || d.showIf.in.includes(vizParam(params, defs.find(x => x.key === d.showIf!.key)!));
  return (
    <div className={`flex flex-col ${compact ? 'gap-2' : 'gap-3'}`}>
      {fam === 'typo' && <WordsReadout params={params} />}
      {groups.map(g => (
        <div key={g} className="flex flex-col gap-2">
          {g && <div className="text-[8.5px] font-black uppercase tracking-[0.14em] text-white/35">{g}</div>}
          {defs.filter(d => (d.group || '') === g && visible(d)).map(d => (
            <Row key={d.key} label={d.label} hint={d.hint}>
              <Control def={d} value={vizParam(params, d)} onChange={v => onChange({ [d.key]: v })} />
            </Row>
          ))}
          {g === 'Words' && fam === 'typo' && <TypoSourceSettings source={String(vizParam(params, defs[0]))} />}
        </div>
      ))}
    </div>
  );
};

/** Visualizers tab: the selected visualizer's remembered settings, applied live. */
const AmboVisualizerParamsPanel: React.FC<{
  item: { name: string; mode?: string; kind?: string; sub?: string } | null;
  liveMode?: string | null;
  previewMode?: string | null;
}> = ({ item, liveMode, previewMode }) => {
  useSyncExternalStore(subscribeVizParams, vizParamsVersion);
  const target = getVizApplyTarget();
  if (!item || !item.mode) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-4 text-white/35">
        <SlidersHorizontal size={22} className="mb-2 text-white/20" />
        <div className="text-[11px] font-semibold">No visualizer selected</div>
        <div className="text-[10px] mt-1">Click a visualizer to adjust its parameters.</div>
      </div>
    );
  }
  const mode = item.mode;
  const fam = vizFamily(mode, item.kind);
  const params = getVizParams(mode);
  const onLive = liveMode === mode, onPrev = previewMode === mode;
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-3 py-2 border-b border-white/10 flex-none">
        <div className="flex items-center gap-1.5">
          {fam === 'typo' ? <Type size={12} style={{ color: PINK }} /> : <SlidersHorizontal size={12} style={{ color: CYAN }} />}
          <span className="text-[11.5px] font-bold text-white truncate flex-1">{item.name}</span>
          <button onClick={() => resetVizParams(mode)} title="Back to defaults" className="p-1 rounded text-white/45 hover:text-white hover:bg-white/10"><RotateCcw size={11} /></button>
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-[9px] font-mono text-white/40">{FAMILY_LABEL[fam]}</span>
          {onLive && <span className="px-1 rounded text-[8px] font-black bg-[#FF8C00] text-black">PROGRAM</span>}
          {onPrev && <span className="px-1 rounded text-[8px] font-black bg-[#00DAF3] text-black">PREVIEW</span>}
        </div>
        <div className="mt-1.5 inline-flex rounded-md border border-white/12 p-0.5" title="Where changes go live as you make them">
          {(['preview', 'both', 'program'] as VizApplyTarget[]).map(t => (
            <button key={t} onClick={() => setVizApplyTarget(t)}
              className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold ${target === t ? (t === 'program' ? 'bg-[#FF8C00] text-black' : t === 'preview' ? 'bg-[#00DAF3] text-black' : 'bg-white/20 text-white') : 'text-white/55 hover:text-white'}`}>
              {t === 'both' ? 'Preview + Program' : t === 'preview' ? 'Preview' : 'Program'}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3 custom-scrollbar">
        <VisualizerParamsEditor mode={mode} kind={item.kind} params={params} onChange={patch => setVizParams(mode, patch)} />
        {!onLive && !onPrev && (
          <div className="mt-3 text-[9.5px] text-white/35 leading-snug">Settings are remembered — they apply when this visualizer is cued or taken.</div>
        )}
      </div>
    </div>
  );
};

export default AmboVisualizerParamsPanel;
