// MEKA's control area — the strip above the pads, laid out like Maschine's: MASTER / GROUP /
// SOUND tabs, the sound's plug-in slot (Sampler or the instrument, with its preset and ◀ ▶
// browse arrows), the page bar, and eight knobs under a display. Knob N here IS knob N on a
// Maschine (controlPages.ts), so the hardware lands on whatever the screen shows.
//
// The display tile shows the sound itself: a sample pad draws its waveform with the start and
// hold markers; an instrument pad shows the instrument's face and preset. "Plug-in" opens the
// instrument's own panel inline under the strip, the way Maschine swaps in a plug-in's GUI.

import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AudioWaveform, ChevronLeft, ChevronRight, ExternalLink, LayoutPanelTop, Plus } from 'lucide-react';
import type { GrooveDoc, InstrumentType } from '../../../../services/melos/beats/grooveDoc';
import { BANK_LETTERS } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import {
  focusedPage, fromUnit, getControlFocus, setControlFocus, subscribeControlFocus, toUnit, type ControlParam, type ControlTab,
} from '../../../../services/melos/beats/controlPages';
import { applyPresetToDoc, listPresets, pushTrackPatch } from '../../../../services/melos/beats/presetHub';
import { instrumentColor, instrumentLabel } from '../../../../services/melos/beats/instrumentFactory';
import { groupLabel } from '../../../../services/melos/beats/kits/applyKit';
import { classifySample, CATEGORY_LABEL } from '../../../../services/melos/beats/kits/drumClassify';
import { loadKitIndex, loadRoots, readLibrarySample } from '../../../../services/melos/beats/kits/kitLibrary';
import { ENGINE_LABEL, MODELS, drumSynthFromLegacy, drumSynthLength, setPadDrumSynth, type DrumSynthPatch } from '../../../../services/melos/beats/drumSynth';
import { playDrumSynth } from '../../../../services/melos/beats/engine/drumSynthVoice';
import { Knob } from '../shared/Knob';
import { SamplerPanel } from './SamplerPanel';
import { SURFACE_RAISED } from '../theme';

interface Props {
  doc: GrooveDoc;
  selectedPad: number;
  groupTint: string;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  onLoadSampleFile: (padIdx: number, file: File) => void;
  onPickInstrumentForPad?: (padIdx: number) => void;
  onEditPadInstrument?: (padIdx: number) => void;
  /** The instrument's own panel body (the same one its window shows), for the inline plug-in view. */
  renderInstrument?: (trackId: string) => React.ReactNode;
  /** The pattern being edited (the Sampler's "slices + pattern" writes into it). */
  patternId?: string;
  onSelectPad: (i: number) => void;
}

const TABS: { id: ControlTab; label: string }[] = [
  { id: 'master', label: 'Master' }, { id: 'group', label: 'Group' }, { id: 'sound', label: 'Sound' },
];

export const ControlArea: React.FC<Props> = ({ doc, selectedPad, groupTint, onMutate, onLoadSampleFile, onPickInstrumentForPad, onEditPadInstrument, renderInstrument, patternId, onSelectPad }) => {
  const focus = useSyncExternalStore(subscribeControlFocus, getControlFocus);
  const { pages, index, page } = focusedPage(doc, selectedPad);
  const pad = doc.kit[selectedPad];
  const bank = Math.floor(selectedPad / 16);
  const track = pad?.source === 'instrument' ? doc.arrangement.find((t) => t.id === pad.instrumentTrackId) : undefined;
  const insType = track?.instrument?.type as InstrumentType | undefined;
  // presetName is set when a preset is picked; a fresh instrument carries its patch's own name.
  const patchName = track ? (track.instrument?.presetName || (track.instrument?.patch?.name as string | undefined) || 'Init') : undefined;
  const [pluginOpen, setPluginOpen] = useState(false);
  const [samplerOpen, setSamplerOpen] = useState(false);
  // Maschine's SAMPLING button (MIDI-learnable as a nav action) toggles the Sampler.
  useEffect(() => {
    const t = () => setSamplerOpen((v) => !v);
    window.addEventListener('meka:sampler', t);
    return () => window.removeEventListener('meka:sampler', t);
  }, []);
  const [note, setNote] = useState('');
  useEffect(() => { setNote(''); }, [selectedPad]);

  const setParam = (prm: ControlParam, u: number) => {
    onMutate((d) => prm.set(d, fromUnit(prm, u)));
    if (page?.instrumentTrackId) {
      const k = page.params.indexOf(prm);
      const tid = page.instrumentTrackId;
      if (Array.isArray(track?.instrument?.patch?.macros)) BeatsEngine.get().getInstrument(tid)?.setMacro(k, u);
      else pushTrackPatch(tid);
    }
  };

  // ◀ ▶ on the slot browse presets of the instrument, or same-category sounds from the Library.
  const presets = useMemo(() => (insType ? listPresets(insType) : []), [insType]);
  const stepPreset = async (dir: -1 | 1) => {
    if (track && insType) {
      if (!presets.length) { setNote('No presets for this instrument'); return; }
      const cur = presets.findIndex((x) => x.name === patchName);
      const next = presets[(cur + dir + presets.length) % presets.length];
      onMutate((d) => { applyPresetToDoc(d, track.id, next.id); });
      pushTrackPatch(track.id);
      return;
    }
    if (pad?.source === 'synth') {
      // Drum Synth: ◀ ▶ steps through the engine's models, keeping the knob settings.
      const cur = pad.drumSynth ?? drumSynthFromLegacy(pad.synthVoice);
      const ms = MODELS[cur.engine];
      const next = ms[(ms.findIndex((m) => m.id === cur.model) + dir + ms.length) % ms.length];
      onMutate((d) => { const p = d.kit[selectedPad]; if (p) setPadDrumSynth(p, { ...cur, model: next.id }); });
      setNote(next.blurb);
      return;
    }
    if (!pad || pad.source !== 'sample') return;
    const [index, roots] = await Promise.all([loadKitIndex(), loadRoots()]);
    if (!index?.samples.length || !roots.length) { setNote('Add a Library folder to browse sounds'); return; }
    const here = index.samples.findIndex((s) => s.name.toLowerCase().startsWith(pad.name.toLowerCase()));
    const cat = here >= 0 ? index.samples[here].category : classifySample(pad.name);
    const same = index.samples.filter((s) => s.category === cat);
    if (!same.length) { setNote(`No ${CATEGORY_LABEL[cat]} sounds in the Library`); return; }
    const at = here >= 0 ? same.indexOf(index.samples[here]) : -1;
    const next = same[(at + dir + same.length) % same.length];
    const f = await readLibrarySample(roots, next).catch(() => null);
    if (!f) { setNote('Reconnect the Library folder (Library tab) to load sounds'); return; }
    onLoadSampleFile(selectedPad, f);
    setNote(`${CATEGORY_LABEL[cat]} · ${(at + dir + same.length) % same.length + 1}/${same.length}`);
  };

  const synth: DrumSynthPatch | undefined = pad && !pad.empty && pad.source === 'synth' ? pad.drumSynth ?? drumSynthFromLegacy(pad.synthVoice) : undefined;
  const synthModel = synth ? MODELS[synth.engine].find((m) => m.id === synth.model)?.label ?? synth.model : undefined;
  const slotName = !pad || pad.empty ? 'Empty' : track ? instrumentLabel(insType ?? 'onda') : synth ? 'Drum Synth' : 'Sampler';
  const slotColor = insType ? instrumentColor(insType) : groupTint;
  const where = focus.tab === 'master' ? 'Master' : focus.tab === 'group' ? `${BANK_LETTERS[bank]} · ${groupLabel(doc, bank)}` : `${BANK_LETTERS[bank]}${(selectedPad % 16) + 1} · ${pad?.name ?? ''}`;

  return (
    <div className="w-full max-w-[720px] mx-auto mb-3 shrink-0 rounded-2xl border border-white/[0.09] overflow-hidden" style={{ background: SURFACE_RAISED }}>
      {/* Header: tabs · where you are · the plug-in slot */}
      <div className="flex items-center gap-2 px-2.5 h-9 border-b border-white/[0.07]">
        <div className="flex gap-0.5 bg-black/30 rounded-lg p-0.5">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setControlFocus({ tab: t.id })}
              className="h-6 px-2 rounded-md text-[9px] uppercase tracking-wide font-semibold"
              style={focus.tab === t.id ? { color: '#fff', background: `${groupTint}33` } : { color: 'rgba(255,255,255,0.4)' }}
            >{t.label}</button>
          ))}
        </div>
        <span className="text-[10.5px] text-white/60 truncate min-w-0 flex-1" title={where}>{where}</span>
        {focus.tab === 'sound' && pad && (
          <div className="flex items-center gap-1 shrink-0">
            <span className="h-6 px-2 rounded-md text-[10px] font-semibold flex items-center gap-1.5 border" style={{ color: slotColor, borderColor: `${slotColor}55`, background: `${slotColor}14` }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: slotColor }} />{slotName}
            </span>
            {!pad.empty && (track || synth || pad.source === 'sample') && (
              <>
                <button aria-label="Previous preset" title={track ? 'Previous preset' : synth ? 'Previous model' : 'Previous sound of this type in your Library'} onClick={() => void stepPreset(-1)} className="w-6 h-6 grid place-items-center rounded-md text-white/45 hover:text-white hover:bg-white/5"><ChevronLeft size={13} /></button>
                <span className="text-[10.5px] text-white/80 max-w-[150px] truncate" title={synth?.from ?? patchName ?? pad.sample?.name ?? pad.name}>{synth ? `${ENGINE_LABEL[synth.engine]} · ${synthModel}` : patchName ?? pad.name}</span>
                <button aria-label="Next preset" title={track ? 'Next preset' : synth ? 'Next model' : 'Next sound of this type in your Library'} onClick={() => void stepPreset(1)} className="w-6 h-6 grid place-items-center rounded-md text-white/45 hover:text-white hover:bg-white/5"><ChevronRight size={13} /></button>
              </>
            )}
            {track && renderInstrument && (
              <button onClick={() => setPluginOpen((v) => !v)} title="Show the instrument's own panel here"
                className="h-6 px-1.5 rounded-md text-[9px] uppercase tracking-wide border flex items-center gap-1"
                style={pluginOpen ? { color: '#fff', borderColor: `${slotColor}88`, background: `${slotColor}22` } : { color: 'rgba(255,255,255,0.45)', borderColor: 'rgba(255,255,255,0.12)' }}
              ><LayoutPanelTop size={11} /> Plug-in</button>
            )}
            {!track && (
              <button onClick={() => setSamplerOpen((v) => !v)} title="Sampler — record, edit and slice this pad’s sample"
                className="h-6 px-1.5 rounded-md text-[9px] uppercase tracking-wide border flex items-center gap-1"
                style={samplerOpen ? { color: '#fff', borderColor: `${slotColor}88`, background: `${slotColor}22` } : { color: 'rgba(255,255,255,0.45)', borderColor: 'rgba(255,255,255,0.12)' }}
              ><AudioWaveform size={11} /> Sampling</button>
            )}
            {track && onEditPadInstrument && (
              <button aria-label="Open instrument window" title="Open in its own window" onClick={() => onEditPadInstrument(selectedPad)} className="w-6 h-6 grid place-items-center rounded-md text-white/45 hover:text-white hover:bg-white/5"><ExternalLink size={12} /></button>
            )}
            {(pad.empty || pad.source !== 'instrument') && onPickInstrumentForPad && (
              <button title="Put an instrument on this pad" onClick={() => onPickInstrumentForPad(selectedPad)} className="h-6 px-1.5 rounded-md text-[9px] uppercase tracking-wide border border-white/12 text-white/45 hover:text-white flex items-center gap-0.5"><Plus size={10} /> Inst</button>
            )}
          </div>
        )}
      </div>

      {/* Page bar */}
      <div className="flex items-center gap-1 px-2.5 h-7 border-b border-white/[0.05]">
        <button aria-label="Previous page" onClick={() => pages.length && setControlFocus({ page: (index - 1 + pages.length) % pages.length })} className="w-5 h-5 grid place-items-center text-white/40 hover:text-white"><ChevronLeft size={12} /></button>
        <div className="flex gap-0.5 overflow-x-auto flex-1 min-w-0" style={{ scrollbarWidth: 'none' }}>
          {pages.map((pg, i) => (
            <button key={pg.id} onClick={() => setControlFocus({ page: i })}
              className="h-5 px-2 rounded text-[9.5px] whitespace-nowrap"
              style={i === index ? { color: '#fff', background: 'rgba(255,255,255,0.1)' } : { color: 'rgba(255,255,255,0.4)' }}
            >{pg.label}</button>
          ))}
          {!pages.length && <span className="text-[9.5px] text-white/30 leading-5">Empty pad — load a sound or instrument</span>}
        </div>
        <button aria-label="Next page" onClick={() => pages.length && setControlFocus({ page: (index + 1) % pages.length })} className="w-5 h-5 grid place-items-center text-white/40 hover:text-white"><ChevronRight size={12} /></button>
        <span className="text-[9px] font-mono text-white/30 w-8 text-right">{pages.length ? `${index + 1}/${pages.length}` : ''}</span>
      </div>

      {/* Display + eight knobs */}
      <div className="flex items-stretch gap-2.5 px-2.5 py-2.5">
        <SoundDisplay doc={doc} selectedPad={selectedPad} tab={focus.tab} color={slotColor} insType={insType} presetName={patchName} synth={synth} synthModel={synthModel} />
        <div className="grid grid-cols-8 gap-1 flex-1 min-w-0">
          {(page?.params ?? Array(8).fill(null)).map((prm, k) => (
            <div key={prm?.id ?? `e${k}`} className="flex flex-col items-center justify-start rounded-lg py-1" style={{ background: prm ? 'rgba(255,255,255,0.025)' : 'transparent' }}>
              {prm ? (
                <Knob
                  label={prm.label}
                  value={toUnit(prm, prm.get(doc))}
                  min={0} max={1}
                  defaultValue={prm.defaultValue !== undefined ? toUnit(prm, prm.defaultValue) : undefined}
                  color={slotColor}
                  size={36}
                  format={(u) => prm.format(fromUnit(prm, u))}
                  onChange={(u) => setParam(prm, u)}
                />
              ) : <span className="mt-3 w-9 h-9 rounded-full border border-dashed border-white/[0.07]" aria-hidden />}
            </div>
          ))}
        </div>
      </div>
      {note && <p className="px-3 pb-2 -mt-1 text-[9.5px] text-white/40">{note}</p>}

      {samplerOpen && !track && (
        <SamplerPanel doc={doc} selectedPad={selectedPad} color={slotColor} patternId={patternId} onMutate={onMutate} onSelectPad={onSelectPad} />
      )}
      {pluginOpen && track && renderInstrument && (
        <div className="border-t border-white/[0.07] max-h-[560px] overflow-auto bg-black/20">{renderInstrument(track.id)}</div>
      )}
    </div>
  );
};

/** The display tile — what the sound IS: waveform for a sample, the instrument's face for a plug-in. */
const SoundDisplay: React.FC<{ doc: GrooveDoc; selectedPad: number; tab: ControlTab; color: string; insType?: InstrumentType; presetName?: string; synth?: DrumSynthPatch; synthModel?: string }> = ({ doc, selectedPad, tab, color, insType, presetName, synth, synthModel }) => {
  const pad = doc.kit[selectedPad];
  const canvas = useRef<HTMLCanvasElement>(null);
  const key = pad?.source === 'sample' ? pad.sample?.key : undefined;
  const dur = pad?.sample?.durationSec ?? 0;

  useEffect(() => {
    const c = canvas.current;
    if (!c || tab !== 'sound' || !key) return;
    const g = c.getContext('2d');
    if (!g) return;
    const W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    const buf = BeatsEngine.get().getSampleEntries().find(([k]) => k === key)?.[1];
    if (!buf) { g.fillStyle = 'rgba(255,255,255,0.25)'; g.font = '10px sans-serif'; g.fillText('play the pad to load', 8, H / 2); return; }
    const data = buf.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / W));
    g.fillStyle = `${color}cc`;
    for (let x = 0; x < W; x++) {
      let lo = 1, hi = -1;
      for (let i = x * step, e = Math.min(data.length, i + step); i < e; i++) { const v = data[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
      if (hi < lo) continue;
      g.fillRect(x, (1 - hi) * H / 2, 1, Math.max(1, (hi - lo) * H / 2));
    }
    const total = buf.duration || dur || 1;
    const sx = Math.min(W, (pad.startSec / total) * W);
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, 0, sx, H);
    g.fillStyle = '#fff'; g.fillRect(sx, 0, 1, H);
    if (pad.env.holdMs > 0) { const hx = Math.min(W, sx + (pad.env.holdMs / 1000 / total) * W); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(hx, 0, 1, H); }
  }, [key, tab, color, pad?.startSec, pad?.env.holdMs, dur, selectedPad]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wider for a drum synth: its waveform is the thing you're shaping.
  const box = `${synth && tab === 'sound' ? 'w-[208px]' : 'w-[132px]'} shrink-0 rounded-xl border border-white/[0.08] overflow-hidden relative`;
  if (tab === 'master' || tab === 'group') {
    const bank = Math.floor(selectedPad / 16);
    const filled = doc.kit.slice(bank * 16, bank * 16 + 16);
    return (
      <div className={`${box} p-1.5 grid grid-cols-4 gap-[3px] content-center`} style={{ background: 'rgba(0,0,0,0.35)' }} aria-hidden>
        {tab === 'group'
          ? [12, 13, 14, 15, 8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3].map((i) => <span key={i} className="h-[18px] rounded-[4px]" style={{ background: filled[i] && !filled[i].empty ? `${filled[i].color}aa` : 'rgba(255,255,255,0.05)' }} />)
          : <span className="col-span-4 text-center text-[10px] text-white/50 leading-tight">{doc.bpm.toFixed(1)} BPM<br />{doc.kit.filter((p) => !p.empty).length} sounds · {Math.ceil(doc.kit.length / 16)} groups</span>}
      </div>
    );
  }
  if (synth && pad) {
    return (
      <div className={box} style={{ background: 'rgba(0,0,0,0.35)' }} title={synth.from ? `from ${synth.from}` : undefined}>
        <SynthScope patch={synth} semis={pad.pitchSemis || 0} env={pad.env} color={color} />
        <span className="absolute top-1 left-1.5 text-[8.5px] font-bold uppercase tracking-[0.12em]" style={{ color }}>{ENGINE_LABEL[synth.engine]}</span>
        <span className="absolute top-1 right-1.5 text-[8.5px] text-white/50">{synthModel}</span>
      </div>
    );
  }
  if (insType) {
    return (
      <div className={`${box} p-2 flex flex-col justify-end`} style={{ background: `radial-gradient(120% 90% at 20% 10%, ${color}55, transparent 60%), linear-gradient(160deg, ${color}22, #0b0b10 70%)` }}>
        <span className="absolute top-1.5 right-2 text-[8px] uppercase tracking-[0.2em] text-white/40">Plug-in</span>
        <span className="text-[15px] font-black tracking-[0.12em]" style={{ color }}>{instrumentLabel(insType)}</span>
        <span className="text-[10px] text-white/75 truncate">{presetName || 'Init'}</span>
      </div>
    );
  }
  return (
    <div className={box} style={{ background: 'rgba(0,0,0,0.35)' }}>
      {key ? <canvas ref={canvas} width={132} height={64} className="w-full h-full block" /> : (
        <span className="absolute inset-0 grid place-items-center text-[10px] text-white/30 px-2 text-center">{pad?.empty ? 'Empty pad' : pad?.source === 'synth' ? 'Drum synth' : 'No sample'}</span>
      )}
      {key && dur > 0 && <span className="absolute bottom-1 right-1.5 text-[8.5px] font-mono text-white/45">{dur.toFixed(2)}s</span>}
    </div>
  );
};

/** The drum synth's actual hit, rendered offline the same way the engine plays it (with the pad's
 *  tuning and amp envelope) and redrawn shortly after every knob move — so you SEE what Decay,
 *  Pitch, Click or Drive did to the waveform. */
const SynthScope: React.FC<{ patch: DrumSynthPatch; semis: number; env: { attackMs: number; holdMs: number; decayMs: number; sustain: number }; color: string }> = ({ patch, semis, env, color }) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [len, setLen] = useState(0);
  const key = JSON.stringify(patch) + semis + JSON.stringify(env);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      const sr = 22050;
      const sec = Math.min(2.5, Math.max(0.08, drumSynthLength(patch) * (patch.engine === 'hat' ? 3.5 : 1.15) + 0.05));
      const ctx = new OfflineAudioContext(1, Math.ceil(sr * sec), sr);
      try { playDrumSynth(ctx, ctx.destination, patch, 0, 1, semis, 1); } catch { return; }
      const d = (await ctx.startRendering()).getChannelData(0);
      // The pad's outer envelope (one-shot: attack, hold, then decay) shapes the hit too.
      const a = env.attackMs / 1000, h = env.holdMs / 1000, dc = Math.max(0.005, env.decayMs / 1000);
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const g = t < a ? t / a : t < a + h ? 1 : env.sustain > 0 ? Math.max(env.sustain, Math.exp(-(t - a - h) / (dc / 4.6))) : Math.exp(-(t - a - h) / (dc / 4.6));
        d[i] *= g;
      }
      const c = canvas.current;
      const g = c?.getContext('2d');
      if (!live || !c || !g) return;
      const W = c.width, H = c.height, mid = H / 2 + 5;
      let peak = 1e-6; for (const v of d) peak = Math.max(peak, Math.abs(v));
      const scale = (H / 2 - 9) / Math.max(0.25, peak);
      g.clearRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(0, mid, W, 1);
      g.fillStyle = color;
      const per = d.length / W;
      for (let x = 0; x < W; x++) {
        let lo = 0, hi = 0;
        for (let i = Math.floor(x * per), e = Math.min(d.length, Math.floor((x + 1) * per) + 1); i < e; i++) { if (d[i] < lo) lo = d[i]; if (d[i] > hi) hi = d[i]; }
        g.fillRect(x, mid - hi * scale, 1, Math.max(1, (hi - lo) * scale));
      }
      // Find where the hit dies away (−50 dB) for the length readout.
      let last = 0; for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > peak * 0.003) last = i;
      setLen(last / sr);
    }, 60);
    return () => { live = false; clearTimeout(timer); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <canvas ref={canvas} width={416} height={128} className="w-full h-full block" aria-label="Drum synth waveform" />
      {len > 0 && <span className="absolute bottom-1 right-1.5 text-[8.5px] font-mono text-white/45">{len >= 1 ? `${len.toFixed(2)}s` : `${Math.round(len * 1000)}ms`}</span>}
    </>
  );
};
