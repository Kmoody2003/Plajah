// Kith Quest score lab — bounces each Kith Quest Chora project (services/melos/kithQuestChoraProjects.ts) with
// Chora's own offline renderer (renderGroove: the same instruments, ARP devices, note FX, sends and modulators as
// Chora Studio) and posts the mix to the lab server, which writes it for scripts/games/buildKithQuestAudio.ts.
//
//   npx vite --config kithquest-score-lab.vite.config.mjs  ->  http://127.0.0.1:3255/kithquest-score-lab.html
//   ?auto=1 bounce on load   ?cues=title,battle only these   ?studio=kithquest-title open that project in Chora Studio
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { buildKithQuestGrooveDoc, kithQuestProjects, KITH_QUEST_PREFIX as KITH_PREFIX } from './services/melos/kithQuestChoraProjects';
import { renderGroove } from './services/melos/beats/render';

/** Float32 interleaved stereo, no header: the build script knows the rate and channel count. */
function interleave(buf: AudioBuffer): ArrayBuffer {
  const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const out = new Float32Array(L.length * 2);
  for (let i = 0; i < L.length; i++) { out[2 * i] = L[i]; out[2 * i + 1] = R[i]; }
  return out.buffer;
}

interface Row { cue: string; status: string; sec?: number; peak?: number; rms?: number; skipped?: number }
declare global { interface Window { kithQuestLab?: { rows: Row[]; done: boolean; run: (cues?: string[]) => Promise<void>; stems: (cue: string) => Promise<string[]> } } }

function App() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const all = kithQuestProjects();

  const run = async (cues?: string[]) => {
    setBusy(true);
    const list: Row[] = [];
    window.kithQuestLab!.done = false;
    for (const p of all.filter((x) => !cues?.length || cues.includes(x.cueId))) {
      const r: Row = { cue: p.cueId, status: 'rendering' };
      list.push(r); setRows([...list]); window.kithQuestLab!.rows = list;
      const t0 = performance.now();
      try {
        const res = await renderGroove(buildKithQuestGrooveDoc(p.id, 'kithquest-lab'), [], { range: 'song', bitDepth: 24 });
        if (!res) throw new Error('nothing to render');
        const b = res.buffer;
        let pk = 0, ss = 0;
        for (let c = 0; c < b.numberOfChannels; c++) { const x = b.getChannelData(c); for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > pk) pk = a; ss += x[i] * x[i]; } }
        const resp = await fetch(`/__kithquest/save?name=${encodeURIComponent(p.cueId)}&sr=${b.sampleRate}`, { method: 'POST', body: interleave(b) });
        if (!resp.ok) throw new Error(`save failed ${resp.status}`);
        Object.assign(r, { status: 'saved', sec: +((performance.now() - t0) / 1000).toFixed(1), peak: +pk.toFixed(3), rms: +Math.sqrt(ss / (b.length * b.numberOfChannels)).toFixed(4), skipped: res.skippedInstruments });
      } catch (e) {
        r.status = `error: ${String((e as Error)?.message ?? e)}`;
      }
      setRows([...list]);
    }
    window.kithQuestLab!.done = true;
    setBusy(false);
  };

  /** Diagnostics: the cue with no sends ("dry"), only the returns ("verb" = full minus dry is done offline), and every track solo, dry. */
  const stems = async (cueId: string) => {
    const doc = buildKithQuestGrooveDoc(KITH_PREFIX + cueId, 'kithquest-lab');
    const variants: [string, (d: typeof doc) => void][] = [
      ['dry', (d) => d.arrangement.forEach((t) => { t.sends = [0, 0]; })],
      ...doc.arrangement.map((t) => [`solo-${t.id.split('_trk_')[1]}`, (d: typeof doc) => d.arrangement.forEach((u) => { u.sends = [0, 0]; u.mute = u.id !== t.id; })] as [string, (d: typeof doc) => void]),
    ];
    const out: string[] = [];
    for (const [name, mut] of variants) {
      const d = JSON.parse(JSON.stringify(doc)); mut(d);
      const res = await renderGroove(d, [], { range: 'song', bitDepth: 24 });
      if (!res) continue;
      await fetch(`/__kithquest/save?name=${encodeURIComponent(`${cueId}--${name}`)}&sr=${res.buffer.sampleRate}`, { method: 'POST', body: interleave(res.buffer) });
      out.push(name);
    }
    return out;
  };

  useEffect(() => {
    window.kithQuestLab = { rows: [], done: false, run, stems };
    const q = new URLSearchParams(location.search);
    if (q.get('auto') === '1') void run(q.get('cues')?.split(',').filter(Boolean));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ padding: 20, maxWidth: 900 }}>
      <h1 style={{ fontSize: 20, margin: '0 0 6px' }}>Kith Quest · Chora bounce lab</h1>
      <p style={{ opacity: 0.6, fontSize: 13, margin: '0 0 14px' }}>Each cue is a Chora Studio project; this page bounces it with renderGroove for the game build.</p>
      <button disabled={busy} onClick={() => void run()} style={{ padding: '6px 14px', marginBottom: 14 }}>{busy ? 'Bouncing…' : 'Bounce all cues'}</button>
      <table style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr>{['cue', 'status', 'secs', 'peak', 'rms', 'skipped'].map((h) => <th key={h} style={{ textAlign: 'left', padding: 4, borderBottom: '1px solid #333' }}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{[r.cue, r.status, r.sec, r.peak, r.rms, r.skipped].map((v, j) => <td key={j} style={{ padding: 4 }}>{v ?? ''}</td>)}</tr>)}</tbody>
      </table>
      <h2 style={{ fontSize: 14, marginTop: 20 }}>Projects</h2>
      <ul style={{ fontSize: 12, opacity: 0.8 }}>{all.map((p) => <li key={p.id}><b>{p.title}</b> — {p.bpm} bpm, {p.key}, {p.bars} bars</li>)}</ul>
    </div>
  );
}

const BeatsRoom = React.lazy(() => import('./components/melos/beats/BeatsRoom'));
const studio = new URLSearchParams(location.search).get('studio');

createRoot(document.getElementById('root')!).render(studio
  ? <React.Suspense fallback={<div style={{ padding: 24 }}>Loading Chora Studio…</div>}><BeatsRoom onClose={() => { /* lab */ }} payload={{ templateProjectId: studio }} /></React.Suspense>
  : <App />);
