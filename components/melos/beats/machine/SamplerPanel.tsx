// MEKA Sampler — Maschine's sampling workflow on the selected pad, opened from the control area:
//   Record — from any audio input or MEKA's own output (resample); threshold / immediate / sync
//            to the transport; a take history to audition and drop onto the pad.
//   Edit   — select on the waveform; truncate, normalize, reverse, fades, silence, gain; undo.
//   Slice  — cut by transients, the tempo grid, equal parts or by hand; slices → pads (Maschine
//            order, from the selected pad), optionally with a pattern that replays the loop.
// Every edit writes a NEW content-addressed sample (the old one stays for undo / other pads).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Square, Play, Undo2, Scissors } from 'lucide-react';
import type { GrooveDoc, SampleRef } from '../../../../services/melos/beats/grooveDoc';
import { BANK_LETTERS, PAD_BANK } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { backupToLocker, hydrateSample, ingestSample } from '../../../../services/melos/beats/sampleStore';
import { bufferToWav, crop, fadeIn, fadeOut, gain, normalize, peaks, reverse, silence, type Range } from '../../../../services/melos/beats/audio/audioEdit';
import { gridSlices, loopBpm, normalizeCuts, regions, slicesToPads, slicesToPattern, splitSlices, transientSlices, type SliceMode } from '../../../../services/melos/beats/sampler/slices';
import { trimSilence, type RecordMode, type Take } from '../../../../services/melos/beats/sampler/takeRecorder';
import { listInputs, startCapture, type Capture } from '../../../../services/melos/beats/sampler/inputCapture';
import { PLAYHEAD, SELECT } from '../theme';

type Tab = 'record' | 'edit' | 'slice';

interface Props {
  doc: GrooveDoc;
  selectedPad: number;
  color: string;
  /** The pattern being edited — "slices + pattern" writes into it. */
  patternId?: string;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  onSelectPad: (i: number) => void;
}

const GRID = [{ label: '1/4', beats: 1 }, { label: '1/8', beats: 0.5 }, { label: '1/16', beats: 0.25 }, { label: '1/32', beats: 0.125 }];

/** A take or a slice as an AudioBuffer in the engine's context. */
function toBuffer(ctx: BaseAudioContext, t: Take, range?: { start: number; end: number }): AudioBuffer {
  const s = range?.start ?? 0, e = range?.end ?? t.length;
  const b = ctx.createBuffer(t.channels.length, Math.max(1, e - s), t.sampleRate);
  t.channels.forEach((c, i) => b.getChannelData(i).set(c.subarray(s, e)));
  return b;
}

/** Write a buffer as a new sample (OPFS now, locker copy in the background). */
async function storeBuffer(buf: AudioBuffer, name: string): Promise<{ ref: SampleRef; buffer: AudioBuffer } | null> {
  const engine = BeatsEngine.get();
  const ctx = engine.getContext();
  if (!ctx) return null;
  const res = await ingestSample(await bufferToWav(buf), name, ctx);
  if (res) engine.setSampleBuffer(res.ref.key, res.buffer);
  return res;
}

export const SamplerPanel: React.FC<Props> = ({ doc, selectedPad, color, patternId, onMutate, onSelectPad }) => {
  const [tab, setTab] = useState<Tab>('record');
  const pad = doc.kit[selectedPad];
  const bank = Math.floor(selectedPad / PAD_BANK);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  // ── The pad's sample, decoded ──
  const [buf, setBuf] = useState<AudioBuffer | null>(null);
  const key = pad?.source === 'sample' ? pad.sample?.key : undefined;
  useEffect(() => {
    let live = true;
    setBuf(null);
    if (!pad?.sample || pad.source !== 'sample') return;
    const engine = BeatsEngine.get();
    const hit = engine.getSampleEntries().find(([k]) => k === pad.sample!.key)?.[1];
    if (hit) { setBuf(hit); return; }
    void engine.init().then(async () => {
      const ctx = engine.getContext();
      const b = ctx && pad.sample ? await hydrateSample(pad.sample, ctx) : null;
      if (b && live) { engine.setSampleBuffer(pad.sample!.key, b); setBuf(b); }
    });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Selection + slice cuts (in samples) ──
  const [sel, setSel] = useState<Range | null>(null);
  const [cuts, setCuts] = useState<number[]>([]);
  const [manualCuts, setManualCuts] = useState<number[]>([]);
  useEffect(() => { setSel(null); setManualCuts([]); }, [key]);

  // Undo stack of the pad's previous samples (this panel's edits only).
  const undo = useRef<{ pad: number; ref: SampleRef }[]>([]);

  const replaceSample = useCallback(async (next: AudioBuffer, label: string) => {
    if (!pad?.sample) return;
    setBusy(true);
    try {
      const prev = pad.sample;
      const res = await storeBuffer(next, pad.name);
      if (!res) { setStatus('Couldn’t store the edited sample.'); return; }
      undo.current.push({ pad: selectedPad, ref: prev });
      onMutate((d) => {
        const p = d.kit[selectedPad];
        if (!p) return;
        const wasOneShot = p.env.sustain === 0 && p.env.holdMs >= prev.durationSec * 900;
        p.sample = res.ref;
        p.startSec = Math.min(p.startSec, Math.max(0, res.ref.durationSec - 0.01));
        if (wasOneShot) p.env.holdMs = Math.round(res.ref.durationSec * 1000);
      });
      setBuf(res.buffer);
      setSel(null);
      setStatus(`${label} · ${res.ref.durationSec.toFixed(2)}s`);
      void backupToLocker(res.ref).then((url) => { if (url) onMutate((d) => { const p = d.kit[selectedPad]; if (p?.sample?.key === res.ref.key) p.sample.lockerUrl = url; }); });
    } finally { setBusy(false); }
  }, [pad, selectedPad, onMutate]);

  const audition = useCallback((b: AudioBuffer, range?: Range | null) => {
    const engine = BeatsEngine.get();
    void engine.init().then(() => {
      const ctx = engine.getContext();
      if (!ctx) return;
      const src = ctx.createBufferSource();
      src.buffer = b;
      src.connect(ctx.destination);
      const s = (range?.start ?? 0) / b.sampleRate, e = (range?.end ?? b.length) / b.sampleRate;
      src.start(ctx.currentTime, s, Math.max(0.01, e - s));
    });
  }, []);

  // ── Record ──
  const [inputs, setInputs] = useState<{ id: string; label: string }[]>([]);
  const [source, setSource] = useState<string>('default');
  const [mode, setMode] = useState<RecordMode>('threshold');
  const [thresholdDb, setThresholdDb] = useState(-30);
  const [maxSec, setMaxSec] = useState(30);
  const [syncBars, setSyncBars] = useState(1);
  const cap = useRef<Capture | null>(null);
  const [rec, setRec] = useState<{ state: string; levelDb: number; sec: number } | null>(null);
  const [takes, setTakes] = useState<{ id: number; take: Take; name: string }[]>([]);
  useEffect(() => { if (tab === 'record') void listInputs().then(setInputs); }, [tab]);
  useEffect(() => () => cap.current?.stop(), []);

  const finishTake = useCallback(() => {
    const c = cap.current;
    cap.current = null;
    setRec(null);
    if (!c) return;
    c.stop();
    const t = c.recorder.result();
    if (!t) { setStatus('Nothing was recorded.'); return; }
    // Trim silence off the ends (threshold takes start on the attack already).
    const r = trimSilence(t);
    const trimmed: Take = { sampleRate: t.sampleRate, length: r.end - r.start, channels: t.channels.map((ch) => ch.slice(r.start, r.end)) };
    setTakes((ts) => [{ id: Date.now(), take: trimmed, name: `Take ${ts.length + 1}` }, ...ts].slice(0, 12));
    setStatus(`Recorded ${(trimmed.length / t.sampleRate).toFixed(2)}s`);
  }, []);

  const startRec = useCallback(async () => {
    setStatus('');
    try {
      const lengthSec = mode === 'sync' ? (syncBars * 4 * 60) / Math.max(20, doc.bpm) : undefined;
      const c = await startCapture(
        source === 'internal' ? { kind: 'internal' } : { kind: 'input', deviceId: source === 'default' ? undefined : source },
        { mode, thresholdDb, maxSec, lengthSec },
        (r) => {
          setRec({ state: r.state, levelDb: r.levelDb, sec: r.seconds });
          if (r.state === 'done') queueMicrotask(finishTake);
        },
      );
      cap.current = c;
      setRec({ state: c.recorder.state, levelDb: -100, sec: 0 });
      if (source !== 'internal') void listInputs().then(setInputs); // labels appear after permission
    } catch (e) { setStatus((e as Error).message); }
  }, [source, mode, thresholdDb, maxSec, syncBars, doc.bpm, finishTake]);

  const useTake = useCallback(async (t: { take: Take; name: string }) => {
    const engine = BeatsEngine.get();
    await engine.init();
    const ctx = engine.getContext();
    if (!ctx) return;
    setBusy(true);
    try {
      const res = await storeBuffer(toBuffer(ctx, t.take), t.name);
      if (!res) return;
      onMutate((d) => {
        const p = d.kit[selectedPad];
        if (!p) return;
        p.source = 'sample'; p.sample = res.ref; p.drumSynth = undefined; p.instrumentTrackId = undefined; p.empty = false;
        p.name = t.name.slice(0, 18); p.startSec = 0;
        p.env = { attackMs: 0, holdMs: Math.round(res.ref.durationSec * 1000), decayMs: 30, sustain: 0, releaseMs: 30 };
      });
      setBuf(res.buffer);
      setTab('edit');
      setStatus(`${t.name} → pad ${BANK_LETTERS[bank]}${(selectedPad % 16) + 1}`);
      void backupToLocker(res.ref);
    } finally { setBusy(false); }
  }, [onMutate, selectedPad, bank]);

  // ── Slice ──
  const [sliceMode, setSliceMode] = useState<SliceMode>('detect');
  const [sens, setSens] = useState(0.5);
  const [gridIdx, setGridIdx] = useState(2);
  const [splitN, setSplitN] = useState(8);
  const [sliceBpm, setSliceBpm] = useState<number | null>(null);
  const [withPattern, setWithPattern] = useState(true);
  const bpm = sliceBpm ?? doc.bpm;
  useEffect(() => {
    if (!buf || tab !== 'slice') { setCuts([]); return; }
    const mono = buf.getChannelData(0);
    const c = sliceMode === 'detect' ? transientSlices(mono, buf.sampleRate, sens)
      : sliceMode === 'grid' ? gridSlices(buf.length, buf.sampleRate, bpm, GRID[gridIdx].beats)
      : sliceMode === 'split' ? splitSlices(buf.length, splitN)
      : normalizeCuts(manualCuts, buf.length);
    setCuts(c.slice(0, 64));
  }, [buf, tab, sliceMode, sens, gridIdx, splitN, bpm, manualCuts]);

  const startLocal = selectedPad % PAD_BANK;
  const fits = Math.min(cuts.length, PAD_BANK - startLocal);
  const doSlice = useCallback(async () => {
    if (!buf || !cuts.length) return;
    setBusy(true);
    try {
      const regs = regions(cuts, buf.length).slice(0, PAD_BANK - startLocal);
      const refs: SampleRef[] = [];
      for (let k = 0; k < regs.length; k++) {
        setStatus(`Slicing ${k + 1}/${regs.length}…`);
        const res = await storeBuffer(fadeOut(crop(buf, regs[k]), { start: Math.max(0, regs[k].end - regs[k].start - 64), end: regs[k].end - regs[k].start }), `${pad?.name ?? 'Slice'} ${k + 1}`);
        if (res) refs.push(res.ref);
      }
      const base = (pad?.name ?? 'Slice').replace(/\s+\d+$/, '');
      onMutate((d) => {
        const written = slicesToPads(d, bank, startLocal, refs, base, color);
        if (withPattern && patternId) {
          const pat = d.patterns.find((x) => x.id === patternId);
          if (pat) slicesToPattern(pat, written, regs.slice(0, written.length).map((r) => r.start / buf.sampleRate), bpm);
        }
      });
      for (const r of refs) void backupToLocker(r);
      BeatsEngine.get().syncInstruments();
      onSelectPad(bank * PAD_BANK + startLocal);
      setStatus(`${refs.length} slices → pads ${startLocal + 1}–${startLocal + refs.length} of Group ${BANK_LETTERS[bank]}${withPattern && patternId ? ' + pattern' : ''}${cuts.length > refs.length ? ` (${cuts.length - refs.length} didn’t fit)` : ''}`);
    } finally { setBusy(false); }
  }, [buf, cuts, startLocal, pad, onMutate, bank, color, withPattern, patternId, bpm, onSelectPad]);

  const btn = 'h-6 px-2 rounded-md text-[9.5px] border border-white/12 text-white/60 hover:text-white disabled:opacity-30';
  const chip = (on: boolean) => ({ className: 'h-6 px-2 rounded-md text-[9.5px] border', style: on ? { color: '#fff', borderColor: `${color}88`, background: `${color}22` } : { color: 'rgba(255,255,255,0.45)', borderColor: 'rgba(255,255,255,0.12)' } });
  const hasSample = !!buf;

  return (
    <div className="border-t border-white/[0.07] bg-black/20 px-2.5 py-2 flex flex-col gap-2">
      <div className="flex items-center gap-1">
        {(['record', 'edit', 'slice'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} {...chip(tab === t)} className={`${chip(tab === t).className} uppercase tracking-wide`}>{t}</button>
        ))}
        <span className="flex-1 text-right text-[9.5px] text-white/40 truncate">{busy ? 'Working…' : status}</span>
      </div>

      {tab !== 'record' && (
        hasSample
          ? <Waveform buf={buf!} color={color} sel={tab === 'edit' ? sel : null} onSel={tab === 'edit' ? setSel : undefined}
              cuts={tab === 'slice' ? cuts : []} startSec={pad?.startSec ?? 0}
              onClickAt={tab === 'slice' && sliceMode === 'manual' ? (at) => setManualCuts((m) => {
                const near = m.findIndex((c) => Math.abs(c - at) < buf!.length / 200);
                return near >= 0 ? m.filter((_, i) => i !== near) : [...m, at];
              }) : undefined} />
          : <p className="text-[10px] text-white/35 py-4 text-center">Put a sample on this pad (record one, load one, or drop a file) to {tab} it.</p>
      )}

      {tab === 'record' && (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1">
            <select value={source} onChange={(e) => setSource(e.target.value)} disabled={!!rec} aria-label="Record source"
              className="h-6 max-w-[200px] rounded-md bg-black/40 border border-white/10 text-[10px] text-white/70 px-1 outline-none">
              <option value="default">Default input</option>
              {inputs.filter((i) => i.id && i.id !== 'default').map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
              <option value="internal">MEKA output (resample)</option>
            </select>
            {(['threshold', 'immediate', 'sync'] as const).map((m) => (
              <button key={m} disabled={!!rec} onClick={() => setMode(m)} {...chip(mode === m)}
                title={m === 'threshold' ? 'Starts when the input gets louder than the threshold' : m === 'sync' ? 'Starts with the transport, records the set number of bars' : 'Starts now'}
              >{m === 'threshold' ? 'Threshold' : m === 'sync' ? 'Sync' : 'Now'}</button>
            ))}
            {mode === 'threshold' && (
              <label className="flex items-center gap-1 text-[9px] text-white/45">
                <input type="range" min={-60} max={-6} value={thresholdDb} onChange={(e) => setThresholdDb(Number(e.target.value))} className="w-20 accent-current" style={{ color }} aria-label="Threshold" />
                {thresholdDb} dB
              </label>
            )}
            {mode === 'sync'
              ? <label className="flex items-center gap-1 text-[9px] text-white/45">bars <input type="number" min={1} max={16} value={syncBars} onChange={(e) => setSyncBars(Math.max(1, Math.min(16, Number(e.target.value) || 1)))} className="w-10 h-6 rounded bg-black/40 border border-white/10 px-1 text-white/80" /></label>
              : <label className="flex items-center gap-1 text-[9px] text-white/45">max <input type="number" min={1} max={300} value={maxSec} onChange={(e) => setMaxSec(Math.max(1, Math.min(300, Number(e.target.value) || 30)))} className="w-11 h-6 rounded bg-black/40 border border-white/10 px-1 text-white/80" />s</label>}
          </div>
          <div className="flex items-center gap-2">
            {!rec
              ? <button onClick={() => void startRec()} className="h-7 px-3 rounded-lg text-[10px] font-semibold flex items-center gap-1.5 border" style={{ color: '#FF4D6D', borderColor: 'rgba(255,77,109,0.5)' }}><Circle size={10} fill="currentColor" /> Record</button>
              : <button onClick={finishTake} className="h-7 px-3 rounded-lg text-[10px] font-semibold flex items-center gap-1.5 bg-[#FF4D6D] text-white"><Square size={9} fill="currentColor" /> Stop</button>}
            {rec && (
              <span className="text-[9.5px] font-mono text-white/60">
                {rec.state === 'armed' ? (mode === 'sync' ? 'waiting for play…' : 'waiting for signal…') : `● ${rec.sec.toFixed(1)}s`}
              </span>
            )}
            {/* Input meter, with the threshold marked. */}
            <div className="relative flex-1 h-2 rounded bg-white/[0.06] overflow-hidden" aria-hidden>
              <div className="absolute inset-y-0 left-0" style={{ width: `${Math.max(0, Math.min(100, ((rec?.levelDb ?? -100) + 60) / 60 * 100))}%`, background: (rec?.levelDb ?? -100) > -3 ? '#FF4D6D' : color }} />
              {mode === 'threshold' && <div className="absolute inset-y-0 w-px bg-white/70" style={{ left: `${((thresholdDb + 60) / 60) * 100}%` }} />}
            </div>
          </div>
          {takes.length > 0 && (
            <div className="flex flex-col gap-0.5 max-h-28 overflow-y-auto">
              {takes.map((t) => (
                <div key={t.id} className="flex items-center gap-1.5 text-[10px] text-white/65">
                  <button aria-label={`Play ${t.name}`} onClick={() => { const ctx = BeatsEngine.get().getContext(); if (ctx) audition(toBuffer(ctx, t.take)); }} className="w-5 h-5 grid place-items-center text-white/50 hover:text-white"><Play size={10} /></button>
                  <span className="flex-1 truncate">{t.name} · {(t.take.length / t.take.sampleRate).toFixed(2)}s</span>
                  <button disabled={busy} onClick={() => void useTake(t)} className={btn}>To pad {(selectedPad % 16) + 1}</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'edit' && hasSample && (
        <div className="flex flex-wrap items-center gap-1">
          <button onClick={() => audition(buf!, sel)} className={btn} title="Play the selection (or the whole sample)"><Play size={9} className="inline -mt-px" /> Play</button>
          <span className="text-[9px] text-white/35 mx-1">{sel ? `${((sel.end - sel.start) / buf!.sampleRate).toFixed(3)}s selected` : 'drag to select'}</span>
          <button disabled={busy || !sel} onClick={() => void replaceSample(crop(buf!, sel!), 'Truncated')} className={btn}>Truncate</button>
          <button disabled={busy} onClick={() => void replaceSample(normalize(buf!, sel ?? undefined), 'Normalized')} className={btn}>Normalize</button>
          <button disabled={busy} onClick={() => void replaceSample(reverse(buf!, sel ?? undefined), 'Reversed')} className={btn}>Reverse</button>
          <button disabled={busy} onClick={() => void replaceSample(fadeIn(buf!, sel ?? { start: 0, end: Math.round(buf!.length * 0.1) }), 'Faded in')} className={btn}>Fade in</button>
          <button disabled={busy} onClick={() => void replaceSample(fadeOut(buf!, sel ?? { start: Math.round(buf!.length * 0.9), end: buf!.length }), 'Faded out')} className={btn}>Fade out</button>
          <button disabled={busy || !sel} onClick={() => void replaceSample(silence(buf!, sel!), 'Silenced')} className={btn}>Silence</button>
          <button disabled={busy} onClick={() => void replaceSample(gain(buf!, -3, sel ?? undefined), '−3 dB')} className={btn}>−3 dB</button>
          <button disabled={busy} onClick={() => void replaceSample(gain(buf!, 3, sel ?? undefined), '+3 dB')} className={btn}>+3 dB</button>
          <button disabled={busy || !undo.current.some((u) => u.pad === selectedPad)} title="Put back the sample from before the last edit"
            onClick={() => {
              const i = undo.current.map((u) => u.pad).lastIndexOf(selectedPad);
              if (i < 0) return;
              const [u] = undo.current.splice(i, 1);
              onMutate((d) => { const p = d.kit[u.pad]; if (p) { p.sample = u.ref; } });
              setStatus('Undone');
            }} className={btn}><Undo2 size={9} className="inline -mt-px" /> Undo</button>
        </div>
      )}

      {tab === 'slice' && hasSample && (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1">
            {(['detect', 'grid', 'split', 'manual'] as const).map((m) => (
              <button key={m} onClick={() => setSliceMode(m)} {...chip(sliceMode === m)}>{m === 'detect' ? 'Detect' : m === 'grid' ? 'Grid' : m === 'split' ? 'Split' : 'Manual'}</button>
            ))}
            {sliceMode === 'detect' && (
              <label className="flex items-center gap-1 text-[9px] text-white/45">sensitivity
                <input type="range" min={0} max={1} step={0.01} value={sens} onChange={(e) => setSens(Number(e.target.value))} className="w-24" aria-label="Sensitivity" />
              </label>
            )}
            {sliceMode === 'grid' && (
              <>
                {GRID.map((g, i) => <button key={g.label} onClick={() => setGridIdx(i)} {...chip(gridIdx === i)}>{g.label}</button>)}
                <label className="flex items-center gap-1 text-[9px] text-white/45">at
                  <input type="number" min={40} max={240} step={0.1} value={bpm} onChange={(e) => setSliceBpm(Number(e.target.value) || null)} className="w-14 h-6 rounded bg-black/40 border border-white/10 px-1 text-white/80" /> bpm
                </label>
                <button onClick={() => setSliceBpm(loopBpm(buf!.length, buf!.sampleRate, 1))} className={btn} title="Treat the sample as a 1-bar loop and use its tempo">1-bar loop</button>
                <button onClick={() => setSliceBpm(loopBpm(buf!.length, buf!.sampleRate, 2))} className={btn}>2-bar loop</button>
              </>
            )}
            {sliceMode === 'split' && (
              <label className="flex items-center gap-1 text-[9px] text-white/45">parts
                <input type="number" min={2} max={64} value={splitN} onChange={(e) => setSplitN(Math.max(2, Math.min(64, Number(e.target.value) || 8)))} className="w-12 h-6 rounded bg-black/40 border border-white/10 px-1 text-white/80" />
              </label>
            )}
            {sliceMode === 'manual' && <span className="text-[9px] text-white/40">click the waveform to add a cut, click a cut to remove it</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] text-white/60">{cuts.length} slice{cuts.length !== 1 ? 's' : ''}</span>
            <label className="flex items-center gap-1 text-[9.5px] text-white/50">
              <input type="checkbox" checked={withPattern} onChange={(e) => setWithPattern(e.target.checked)} disabled={!patternId} /> + pattern that replays it
            </label>
            <span className="flex-1" />
            <button disabled={busy || !cuts.length} onClick={() => void doSlice()} className="h-7 px-3 rounded-lg text-[10px] font-semibold border flex items-center gap-1.5 disabled:opacity-30" style={{ color: PLAYHEAD, borderColor: `${PLAYHEAD}66` }}>
              <Scissors size={11} /> Slice to pads {startLocal + 1}–{startLocal + fits}{cuts.length > fits ? ` (${fits} of ${cuts.length})` : ''}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/** The waveform: peaks, the pad's start marker, a draggable selection, slice cuts. */
const Waveform: React.FC<{
  buf: AudioBuffer; color: string; sel: Range | null; onSel?: (r: Range | null) => void; cuts: number[]; startSec: number; onClickAt?: (sample: number) => void;
}> = ({ buf, color, sel, onSel, cuts, startSec, onClickAt }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = 680, H = 84;
  const pk = useMemo(() => peaks(buf, W), [buf]);
  const drag = useRef<number | null>(null);
  useEffect(() => {
    const g = ref.current?.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, W, H);
    g.fillStyle = `${color}cc`;
    for (let x = 0; x < W; x++) { const h = Math.max(1, pk[x] * (H - 4)); g.fillRect(x, (H - h) / 2, 1, h); }
    const px = (s: number) => (s / buf.length) * W;
    if (sel) { g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(px(sel.start), 0, Math.max(1, px(sel.end) - px(sel.start)), H); }
    g.fillStyle = PLAYHEAD;
    cuts.forEach((c, i) => { const x = px(c); g.fillRect(x, 0, 1, H); g.font = '9px monospace'; g.fillText(String(i + 1), x + 2, 10); });
    if (startSec > 0) { g.fillStyle = SELECT; g.fillRect(px(startSec * buf.sampleRate), 0, 2, H); }
  }, [pk, sel, cuts, startSec, color, buf]);
  const at = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    return Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * buf.length);
  };
  return (
    <canvas ref={ref} width={W} height={H} className="w-full h-[84px] rounded-lg bg-black/40 cursor-crosshair touch-none"
      onPointerDown={(e) => {
        if (onClickAt) { onClickAt(at(e)); return; }
        if (!onSel) return;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        drag.current = at(e); onSel(null);
      }}
      onPointerMove={(e) => { if (drag.current === null || !onSel) return; const a = drag.current, b = at(e); if (Math.abs(b - a) > buf.length / 400) onSel({ start: Math.min(a, b), end: Math.max(a, b) }); }}
      onPointerUp={() => { drag.current = null; }}
      aria-label="Sample waveform" />
  );
};
