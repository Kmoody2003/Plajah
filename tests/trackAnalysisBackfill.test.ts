import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runBackfill, needsBackfill, audioTracks, type BackfillDeps } from '../services/musicIntel/backfill.ts';
import { ANALYSIS_VERSION } from '../services/trackAnalysisCore.ts';

const FS = 22050;

/** Mono 120 BPM song: quiet pads until `dropAt`, then full kicks + loud chord. */
function song(sec = 50, dropAt = 30) {
  const n = Math.round(sec * FS), pcm = new Float32Array(n), beat = Math.round(0.5 * FS);
  for (let i = 0; i < n; i++) {
    const loud = i / FS >= dropAt;
    let v = Math.sin((2 * Math.PI * 220 * i) / FS) * (loud ? 0.25 : 0.04);
    const k = i % beat;
    if (k < 600) v += Math.sin((2 * Math.PI * 60 * k) / FS) * Math.exp(-k / 120) * (loud ? 0.7 : 0.15);
    pcm[i] = v;
  }
  return pcm;
}

function fakes(over: Partial<BackfillDeps> = {}) {
  const written: Record<string, any> = {}, attached: string[] = [];
  const albums: Record<string, any> = {
    a1: { type: 'MUSIC', tracks: [{ id: 't1', url: 'u1' }, { id: 't2', url: 'u2' }, { id: 'v1', url: 'v', mediaKind: 'video' }] },
    a2: { type: 'MUSIC', tracks: [{ id: 't3', url: 'u3' }] },
    f1: { type: 'FILM', tracks: [{ id: 'm1', url: 'm' }] },
  };
  const stored: Record<string, any> = { t2: { version: ANALYSIS_VERSION, peaks: [1], songMap: { sections: [] } } };
  let decodes = 0;
  const deps: BackfillDeps = {
    listAlbumIds: async () => Object.keys(albums),
    readAlbum: async id => albums[id] ? { id, ...albums[id] } : null,
    readAnalysis: async id => written[id] || stored[id] || null,
    decode: async () => { decodes++; return { pcm: song(), sampleRate: FS, channels: 1 }; },
    writeAnalysis: async (id, a) => { written[id] = a; },
    attachSongMap: async (_a, id) => { attached.push(id); },
    ...over,
  };
  return { deps, written, attached, decodes: () => decodes };
}

test('needsBackfill: missing, stale, or no song map', () => {
  assert.equal(needsBackfill(null), true);
  assert.equal(needsBackfill({ version: ANALYSIS_VERSION, peaks: [1] }), true);
  assert.equal(needsBackfill({ version: 1, peaks: [1], songMap: {} as any }), true);
  assert.equal(needsBackfill({ version: ANALYSIS_VERSION, peaks: [1], songMap: {} as any }), false);
});

test('audioTracks: music only, skips video and url-less tracks', () => {
  assert.deepEqual(audioTracks({ id: 'x', type: 'MUSIC', tracks: [{ id: 'a', url: 'u' }, { id: 'b' }, { id: 'c', url: 'u', mediaKind: 'video' }] }).map(t => t.id), ['a']);
  assert.deepEqual(audioTracks({ id: 'x', type: 'FILM', tracks: [{ id: 'a', url: 'u' }] }), []);
});

test('backfill: analyses what is missing, skips what is done, finds the drop', async () => {
  const f = fakes();
  const r = await runBackfill(f.deps, { budgetMs: 600_000 });
  assert.equal(r.done, true);
  assert.equal(r.next, null);
  assert.equal(r.analyzed, 2);           // t1, t3
  assert.equal(r.skipped, 1);            // t2 already current
  assert.equal(r.failed, 0);
  assert.deepEqual(Object.keys(f.written).sort(), ['t1', 't3']);
  assert.deepEqual(f.attached.sort(), ['t1', 't3']);
  const a = f.written.t1;
  assert.equal(a.version, ANALYSIS_VERSION);
  assert.ok(Math.abs(a.bpm - 120) < 2, `bpm ${a.bpm}`);
  assert.equal(a.peaks.length, 1024);
  assert.ok(a.songMap?.drops?.length, 'song map has a drop');
  assert.ok(a.songMap.drops.some((d: number) => Math.abs(d - 30) < 1.1), `drops ${JSON.stringify(a.songMap.drops)}`);
  // A second pass has nothing to do and decodes nothing.
  const before = f.decodes();
  const again = await runBackfill(f.deps, { budgetMs: 600_000 });
  assert.equal(again.analyzed, 0);
  assert.equal(f.decodes(), before);
});

test('backfill: out of budget stops on an album boundary and resumes from the cursor', async () => {
  let t = 0;
  const f = fakes({ now: () => t, decode: async () => { t += 1000; return { pcm: song(), sampleRate: FS, channels: 1 }; } });
  const first = await runBackfill(f.deps, { budgetMs: 1000 });   // one song, then out of time
  assert.equal(first.done, false);
  assert.equal(first.analyzed, 1);
  assert.equal(first.next, 'a1');
  const second = await runBackfill(f.deps, { cursor: first.next, budgetMs: 600_000 });
  assert.equal(second.done, true);
  assert.deepEqual(Object.keys(f.written).sort(), ['t1', 't3']);
});

test('backfill: a song too long to read whole is left alone, an undecodable one is reported', async () => {
  const f = fakes({
    decode: async url => url === 'u1' ? null : { pcm: new Float32Array(FS * 20 * 60), sampleRate: FS, channels: 1 },
  });
  const r = await runBackfill(f.deps, { budgetMs: 600_000 });
  assert.equal(r.analyzed, 0);
  assert.equal(r.failed, 1);
  assert.match(r.errors[0], /t1/);
  assert.equal(Object.keys(f.written).length, 0);
});
