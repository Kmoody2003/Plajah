// Smart Sync lab — three synthetic angles of one "church service" (a board feed and two cameras that started
// at different times), a scripted recogniser and a canned council, driving the real panel and pipeline.
import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import SmartSyncPanel from '../../components/Fabula/smartSync/SmartSyncPanel';
import { browserIO } from '../../services/fabula/smartSync/browserIO';
import { buildTimeline } from '../../services/fabula/smartSync/timeline';
import type { TimedWord } from '../../services/fabula/smartSync/types';

const RATE = 8000;
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function world(sec: number) {
  const r = rng(11), out = new Float32Array(sec * RATE); let i = 0;
  while (i < out.length) { const on = Math.floor((0.15 + r() * 0.6) * RATE), off = Math.floor((0.05 + r() * 0.5) * RATE), amp = 0.05 + r() * 0.5; for (let k = 0; k < on && i < out.length; k++, i++) out[i] = (r() * 2 - 1) * amp; i += off; }
  return out;
}
function wav(pcm: Float32Array) {
  const b = new ArrayBuffer(44 + pcm.length * 2), v = new DataView(b);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 32767, true);
  return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
}

const W = world(260);
const ANGLES = [
  { assetId: 'board', name: 'Board feed.wav', kind: 'audio', start: 5, duration: 240 },
  { assetId: 'wide', name: 'WIDE cam A.mp4', kind: 'video', start: 15, duration: 220 },
  { assetId: 'cu', name: 'Pulpit CU cam B.mp4', kind: 'video', start: 40.5, duration: 200 },
  { assetId: 'crowd', name: 'Crowd reverse cam C.mp4', kind: 'video', start: 22, duration: 150 },
].map((a) => ({ ...a, url: wav(W.subarray(a.start * RATE, (a.start + a.duration) * RATE)), tcStart: null as number | null }));

// What was said, on the board feed's clock.
const SCRIPT: Array<[number, string]> = [
  [2, 'good morning church welcome welcome to all our visitors and our online family we are so glad you are here'],
  [20, 'praise the lord hallelujah hallelujah sing it again hallelujah lift your hands hallelujah glory glory hallelujah'],
  [60, 'hallelujah hallelujah sing hallelujah praise him praise him hallelujah glory'],
  [95, 'please help me welcome pastor james carter to the pulpit'],
  [105, 'turn with me in your bibles to romans 8:28 through 30 and we know that all things work together for good'],
  [130, 'the bible says church some of you are carrying weight god wants you free brothers and sisters can i get an amen'],
  [170, 'the bible says church jesus is enough some of you need to hear this today brothers and sisters'],
  [205, 'you can give tonight text the word give to 77977 or cash app $gracechurch thank you for your generosity'],
];
const words: TimedWord[] = SCRIPT.flatMap(([t0, text], i) => {
  const until = SCRIPT[i + 1]?.[0] ?? 240, out: TimedWord[] = [];
  for (let at = t0; at < until - 3; at += text.split(' ').length * 0.4 + 0.8) text.split(' ').forEach((w, k) => out.push({ t: at + k * 0.4, end: at + k * 0.4 + 0.3, text: w }));
  return out.filter((w) => w.t < until);
});

function Lab() {
  const [built, setBuilt] = useState<any>(null);
  const [log, setLog] = useState<string[]>([]);
  const say = (m: string) => setLog((l) => [m, ...l].slice(0, 12));
  const makeIO = useMemo(() => (o: any) => {
    const base = browserIO(o);
    let masterCalls = 0;
    const masterWindows = Math.ceil(240 / 30);
    return {
      ...base,
      // Scripted recogniser: the master's 30 s windows in order, then the probes (left empty — audio places them).
      async transcribe(pcm: Float32Array) {
        await new Promise((r) => setTimeout(r, 60));
        if (masterCalls < masterWindows) { const t0 = masterCalls++ * 30; return words.filter((w) => w.t >= t0 && w.t < t0 + pcm.length / 16000).map((w) => ({ ...w, t: w.t - t0, end: w.end - t0 })); }
        return [];
      },
      async llm() {
        await new Promise((r) => setTimeout(r, 400));
        return {
          notes: [
            { member: 'WORSHIP', note: 'Hold the wide through the worship set; the room is the story there.' },
            { member: 'LIVE_TV', note: 'At 1:35 the introduction needs the pastor on the CU before the lower third lands.' },
            { member: 'FEATURE', note: 'Give the sermon a cutaway to the congregation after each big line.' },
          ],
          adjustments: [{ sectionId: 'sec2', pace: 1.3, prefer: ['wide', 'crowd'], note: 'Longer, wider holds in worship' }],
          summary: 'A warm open, a congregational worship set held wide, and a sermon that lives on the pulpit close-up with the room answering.',
        };
      },
    };
  }, []);
  return (
    <main>
      <h2>Smart Sync lab</h2>
      <p>Board feed + 3 cameras that started 10 s, 35.5 s and 17 s after it. Expected multicam offsets: wide −10, CU −35.5, crowd −17 (board at 0).</p>
      <pre>{log.join('\n')}</pre>
      {built && <pre data-testid="built">{JSON.stringify({ offsets: built.offsets, duration: built.duration, shots: built.clips.filter((c: any) => c.kind === 'multicam').length, graphics: built.clips.filter((c: any) => c.kind === 'title').map((c: any) => `${c.start.toFixed(1)}s ${c.label} | ${c.subtitle}`), markers: built.markers }, null, 2)}</pre>}
      <SmartSyncPanel
        angles={ANGLES as any} mcAsset={null} fps={30} makeIO={makeIO}
        vision={null} llm={null}
        onSave={() => {}} onSeek={(t: number) => say(`seek ${t.toFixed(2)}`)} ping={say} onClose={() => say('close')}
        onApply={(st: any, o: any) => { let n = 0; setBuilt(buildTimeline(st, { mcAssetId: 'MC', at: 0, videoTrack: 'v1', audioTrack: 'a1', gfxTrack: 'v2', uid: () => `c${n++}`, fps: 30, ltSpec: o.ltSpec, verseText: o.verseText, includeSuggested: o.includeSuggested, titleFx: {} })); say('applied'); }}
      />
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Lab />);
