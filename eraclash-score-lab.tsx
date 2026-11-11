// Era Clash score lab — bounces each Era Clash Chora project with Chora's own offline renderer
// (renderGroove: the same graph, instruments, pads, note FX and modulators as Chora Studio) and posts
// the stems to the lab server, which writes them for scripts/games/buildEraClashAudio.ts to master.
//
//   npx vite --config eraclash-score-lab.vite.config.mjs  ->  http://127.0.0.1:3243/eraclash-score-lab.html
//   ?cues=title,japan   only these cues        ?auto=1   start bouncing on load     ?stems=soma   only these stems
//   ?studio=eraclash-japan   open that project in Chora Studio (BeatsRoom, signed out) the way the game does
//
// Stems per cue: music (instrument tracks), kit (MEKA Group A house kit), soma (MEKA Group B SOMA drums).
// The game mix is their sum (plus the kick side-chain on the music), so the balance can be checked per stem.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { buildEraClashGrooveDoc, eraClashProjects } from './services/melos/eraClashChoraProjects';
import { renderGroove } from './services/melos/beats/render';
import type { GrooveDoc } from './services/melos/beats/grooveDoc';
import { playDrumSynthHit } from './services/melos/beats/engine/drumSynthVoice';
import { hitCacheStats } from './services/melos/beats/engine/hitCache';

/**
 * Fill Chora's drum-synth hit cache before a bounce. Live playback renders each synth drum once per
 * velocity level and replays it; an offline bounce can't wait for that, so it builds every hit as a
 * live node graph (thousands of hits = minutes). Warming the cache from a (suspended) 48 kHz context
 * makes the bounce play the same cached takes the live room would.
 */
async function warmDrumHits(doc: GrooveDoc): Promise<void> {
  const ac = new AudioContext({ sampleRate: 48000 });
  const sink = ac.createGain();
  for (const pad of doc.kit) {
    if (pad.empty || pad.source !== 'synth' || !pad.drumSynth) continue;
    for (const v of [0.25, 0.5, 0.75, 1]) for (let take = 0; take < 2; take++) playDrumSynthHit(ac, sink, pad.drumSynth, ac.currentTime + 5, v, 0, 1);
  }
  for (let i = 0; i < 600 && hitCacheStats().pending > 0; i++) await new Promise((r) => setTimeout(r, 50));
  void ac.close();
}

type Stem = 'music' | 'kit' | 'soma';
const STEMS: Stem[] = ['music', 'kit', 'soma'];

/** A copy of the project with only one stem's tracks audible. */
function stemDoc(doc: GrooveDoc, stem: Stem): GrooveDoc {
  const d: GrooveDoc = JSON.parse(JSON.stringify(doc));
  for (const t of d.arrangement) {
    if (t.songGroup !== undefined) t.mute = !(stem === 'kit' ? t.songGroup === 0 : stem === 'soma' ? t.songGroup === 1 : false);
    else if (t.kind === 'instrument' && !t.padOwned) t.mute = stem !== 'music';
  }
  return d;
}

/** Float32 interleaved stereo, no header: the build script knows the rate (48 kHz) and channel count. */
function interleave(buf: AudioBuffer): ArrayBuffer {
  const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const out = new Float32Array(L.length * 2);
  for (let i = 0; i < L.length; i++) { out[2 * i] = L[i]; out[2 * i + 1] = R[i]; }
  return out.buffer;
}

interface Row { cue: string; stem: Stem; status: string; sec?: number; peak?: number; rms?: number; skipped?: number }

declare global { interface Window { eraClashLab?: { rows: Row[]; done: boolean; run: (cues?: string[], only?: Stem[]) => Promise<void> } } }

function App() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const all = eraClashProjects();

  const run = async (cues?: string[], only?: Stem[]) => {
    setBusy(true);
    const list: Row[] = [];
    const push = (r: Row) => { list.push(r); setRows([...list]); window.eraClashLab!.rows = list; };
    window.eraClashLab!.done = false;
    for (const p of all.filter((x) => !cues?.length || cues.includes(x.cueId))) {
      const doc = buildEraClashGrooveDoc(p.id, 'eraclash-lab');
      await warmDrumHits(doc);
      for (const stem of STEMS.filter((s) => !only?.length || only.includes(s))) {
        const r: Row = { cue: p.cueId, stem, status: 'rendering' };
        push(r);
        const t0 = performance.now();
        try {
          const res = await renderGroove(stemDoc(doc, stem), [], { range: 'song', bitDepth: 24 });
          if (!res) throw new Error('nothing to render');
          const b = res.buffer;
          let pk = 0, ss = 0;
          for (let c = 0; c < b.numberOfChannels; c++) { const x = b.getChannelData(c); for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > pk) pk = a; ss += x[i] * x[i]; } }
          const resp = await fetch(`/__eraclash/save?name=${encodeURIComponent(`${p.cueId}-${stem}`)}&sr=${b.sampleRate}`, { method: 'POST', body: interleave(b) });
          if (!resp.ok) throw new Error(`save failed ${resp.status}`);
          Object.assign(r, { status: 'saved', sec: +((performance.now() - t0) / 1000).toFixed(1), peak: +pk.toFixed(3), rms: +Math.sqrt(ss / (b.length * b.numberOfChannels)).toFixed(4), skipped: res.skippedInstruments });
        } catch (e) {
          r.status = `error: ${String((e as Error)?.message ?? e)}`;
        }
        setRows([...list]);
      }
    }
    window.eraClashLab!.done = true;
    setBusy(false);
  };

  useEffect(() => {
    window.eraClashLab = { rows: [], done: false, run };
    const q = new URLSearchParams(location.search);
    if (q.get('auto') === '1') void run(q.get('cues')?.split(',').filter(Boolean), q.get('stems')?.split(',').filter(Boolean) as Stem[] | undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ padding: 20, maxWidth: 900 }}>
      <h1 style={{ fontSize: 20, margin: '0 0 6px' }}>Era Clash · Chora bounce lab</h1>
      <p style={{ opacity: 0.6, fontSize: 13, margin: '0 0 14px' }}>Each cue is a Chora Studio project; this page bounces it with renderGroove (music / kit / SOMA stems) for the game build.</p>
      <button disabled={busy} onClick={() => void run()} style={{ padding: '6px 14px', marginBottom: 14 }}>{busy ? 'Bouncing…' : 'Bounce all cues'}</button>
      <table style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr>{['cue', 'stem', 'status', 'secs', 'peak', 'rms', 'skipped'].map((h) => <th key={h} style={{ textAlign: 'left', padding: 4, borderBottom: '1px solid #333' }}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{[r.cue, r.stem, r.status, r.sec, r.peak, r.rms, r.skipped].map((v, j) => <td key={j} style={{ padding: 4 }}>{v ?? ''}</td>)}</tr>)}</tbody>
      </table>
      <h2 style={{ fontSize: 14, marginTop: 20 }}>Projects</h2>
      <ul style={{ fontSize: 12, opacity: 0.8 }}>{all.map((p) => <li key={p.id}><b>{p.title}</b> — {p.bpm} bpm, {p.key}: {p.soma.join(', ')}</li>)}</ul>
    </div>
  );
}

const BeatsRoom = React.lazy(() => import('./components/melos/beats/BeatsRoom'));
const studio = new URLSearchParams(location.search).get('studio');

createRoot(document.getElementById('root')!).render(studio
  ? <React.Suspense fallback={<div style={{ padding: 24 }}>Loading Chora Studio…</div>}><BeatsRoom onClose={() => { /* lab */ }} payload={{ templateProjectId: studio }} /></React.Suspense>
  : <App />);
