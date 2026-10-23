import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureAudio, estimateKey } from '../services/musicIntel/dsp.ts';
import { runMusicIntel, type MusicIntelDeps, type IntelAlbum } from '../services/musicIntel/worker.ts';
import { normalizeTrackIntel, looksLikeSoundtrack, filmTitleTokens } from '../services/musicIntel/prompts.ts';
import type { MusicIntelJob, TrackIntel } from '../services/musicIntel/types.ts';

const FS = 22050;

/** Stereo test signal: a kick-ish click every beat over a sustained chord. */
function synth({ bpm = 120, sec = 30, freqs = [261.63, 329.63, 392.0], amp = 0.2, width = 0 }) {
  const n = Math.round(sec * FS);
  const pcm = new Float32Array(n * 2);
  const beat = Math.round((60 / bpm) * FS);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (const f of freqs) v += Math.sin((2 * Math.PI * f * i) / FS) * amp / freqs.length;
    const k = i % beat;
    if (k < 600) v += Math.sin((2 * Math.PI * 60 * k) / FS) * Math.exp(-k / 120) * 0.6;
    pcm[i * 2] = v;
    pcm[i * 2 + 1] = v * (1 - width);
  }
  return pcm;
}

test('tempo: a 120 BPM pulse measures ~120', () => {
  const m = measureAudio(synth({ bpm: 120 }), FS, 2);
  assert.ok(Math.abs(m.tempo.bpm - 120) < 3, `got ${m.tempo.bpm}`);
});

test('tempo: a 92 BPM pulse measures ~92 (not doubled)', () => {
  const m = measureAudio(synth({ bpm: 92 }), FS, 2);
  assert.ok(Math.abs(m.tempo.bpm - 92) < 3, `got ${m.tempo.bpm}`);
});

test('key: C major triad over a pulse → C major (or its relative A minor)', () => {
  const m = measureAudio(synth({}), FS, 2);
  assert.match(m.key.key, /^(C major|A minor)$/);
});

test('key profile: A minor chroma picks A minor', () => {
  const chroma = new Array(12).fill(0.1);
  for (const pc of [9, 0, 4, 9, 2, 5]) chroma[pc] += 1; // A C E, plus D F colour
  assert.equal(estimateKey(chroma).key, 'A minor');
});

test('loudness: a hotter signal measures louder, identical channels are near-mono', () => {
  const quiet = measureAudio(synth({ amp: 0.05 }), FS, 2);
  const loud = measureAudio(synth({ amp: 0.4 }), FS, 2);
  assert.ok(quiet.integratedLufs! < loud.integratedLufs!);
  assert.ok(loud.integratedLufs! < 0 && loud.integratedLufs! > -40);
  assert.ok(quiet.stereo!.width < 0.01);
  assert.ok(quiet.stereo!.correlation > 0.99);
  assert.ok(quiet.energyCurve.length > 0 && quiet.energyCurve.every(v => v >= 0 && v <= 1));
});

test('normaliser drops standout lines that are not in the lyrics (no misquoting)', () => {
  const intel = normalizeTrackIntel({
    summary: 'x',
    lyrics: { hasVocals: true, standoutLines: [{ line: 'under the paper moon', why: 'a' }, { line: 'words never sung', why: 'b' }] },
    hostCards: [{ kind: 'bogus', title: 't', text: 'hello', atSec: 9999 }],
  }, { trackId: 't1', title: 'T', version: 1, analyzedAt: 0, sourceUrl: 'u', measured: null }, 'We danced\nUnder the paper moon');
  assert.deepEqual(intel.lyrics.standoutLines.map(l => l.line), ['under the paper moon']);
  assert.equal(intel.hostCards[0].kind, 'context');
});

test('soundtrack detection + film title tokens', () => {
  assert.ok(looksLikeSoundtrack({ title: 'Moonbreaker (Original Soundtrack)' }));
  assert.ok(!looksLikeSoundtrack({ title: 'Paper Moon', genre: 'Indie Pop' }));
  assert.deepEqual(filmTitleTokens('Moonbreaker (Original Motion Picture Soundtrack)'), ['moonbreaker']);
});

// ─── Pipeline ────────────────────────────────────────────────────────────────

function harness(album: IntelAlbum, opts: { failListen?: Set<string>; stepMs?: number } = {}) {
  let job: (MusicIntelJob & Record<string, any>) | null = null;
  const tracks: Record<string, TrackIntel> = {};
  const clock = { t: 1_000_000 };
  const listened: string[] = [];
  let thoughts = 0;
  const deps: MusicIntelDeps = {
    readAlbum: async () => album,
    readJob: async () => job,
    patchJob: async (_id, patch) => { job = { ...(job || {}), ...patch } as any; },
    readTracks: async () => ({ ...tracks }),
    writeTrack: async (_id, intel) => { tracks[intel.trackId] = intel; },
    decode: async () => ({ pcm: synth({ sec: 8 }), sampleRate: FS, channels: 2 }),
    encodeForListening: async () => ({ base64: 'AA==', mimeType: 'audio/mpeg' }),
    listen: async (prompt) => {
      clock.t += opts.stepMs ?? 1000;
      const id = album.tracks!.find(t => prompt.includes(`"${t.title}"`))!.id;
      listened.push(id);
      if (opts.failListen?.has(id)) throw new Error('model down');
      return JSON.stringify({ summary: `read of ${id}`, hostCards: [{ kind: 'intro', title: 'Hi', text: 'Welcome' }] });
    },
    think: async (prompt) => { thoughts++; return JSON.stringify({ overview: 'album', linerNotes: 'notes', standoutMoments: [{ trackId: 'a', why: 'yes' }] , hasFilm: prompt.includes('FILM CONTEXT') }); },
    findFilm: async () => ({ status: 'LINKED', filmAlbumId: 'film1', filmTitle: 'Moonbreaker', logline: 'A girl breaks the moon', themes: ['loss'] }),
    now: () => clock.t,
  };
  return { deps, get job() { return job!; }, tracks, listened, get thoughts() { return thoughts; } };
}

const album = (): IntelAlbum => ({
  id: 'alb', ownerId: 'u1', type: 'MUSIC', title: 'Paper Moon', artist: 'Ada',
  tracks: [
    { id: 'a', title: 'One', url: 'https://x/a.wav', lyrics: 'Under the paper moon' },
    { id: 'b', title: 'Two', url: 'https://x/b.wav' },
    { id: 'v', title: 'Clip', url: 'https://x/v.mp4', mediaKind: 'VIDEO' },
  ],
});

test('pipeline: hears every song once, then writes the album read', async () => {
  const h = harness(album());
  const out = await runMusicIntel(h.deps, 'alb', { ownerId: 'u1' });
  assert.equal(out.status, 'READY');
  assert.deepEqual(h.listened, ['a', 'b']); // the video track is not music
  assert.equal(h.job.album!.linerNotes, 'notes');
  assert.equal(h.job.leaseUntil, 0);
  assert.ok(h.tracks.a.measured && h.tracks.a.measured.tempo.bpm > 0);
  // A re-save with nothing changed hears nothing new.
  const again = await runMusicIntel(h.deps, 'alb');
  assert.equal(again.heard, 0);
});

test('pipeline: budget stops mid-album and the next run resumes where it left off', async () => {
  const h = harness(album(), { stepMs: 10_000 });
  const first = await runMusicIntel(h.deps, 'alb', { budgetMs: 5_000 });
  assert.equal(first.status, 'LISTENING');
  assert.equal(first.remaining, 1);
  const second = await runMusicIntel(h.deps, 'alb', { budgetMs: 60_000 });
  assert.equal(second.status, 'READY');
  assert.deepEqual(h.listened, ['a', 'b']);
});

test('pipeline: a live lease means another run is already on it', async () => {
  const h = harness(album());
  await h.deps.patchJob('alb', { leaseUntil: 2_000_000 } as any);
  const out = await runMusicIntel(h.deps, 'alb');
  assert.equal(out.status, 'BUSY');
  assert.equal(h.listened.length, 0);
});

test('pipeline: a re-uploaded song is heard again; a failing song gives up after 3 tries', async () => {
  const a = album();
  const h = harness(a, { failListen: new Set(['b']) });
  for (let i = 0; i < 3; i++) await runMusicIntel(h.deps, 'alb');
  assert.equal(h.listened.filter(x => x === 'b').length, 3);
  assert.equal(h.job.status, 'PARTIAL'); // album read written from the songs that were heard
  const before = h.listened.length;
  a.tracks![0].url = 'https://x/a-v2.wav';
  await runMusicIntel(h.deps, 'alb');
  assert.deepEqual(h.listened.slice(before), ['a']);
});

test('pipeline: a soundtrack is heard with its film\'s Story Intelligence as context', async () => {
  const a = { ...album(), title: 'Moonbreaker (Original Soundtrack)' };
  const h = harness(a);
  let sawFilm = false;
  const listen = h.deps.listen;
  h.deps.listen = async (p, au) => { if (p.includes('FILM CONTEXT') && p.includes('Moonbreaker')) sawFilm = true; return listen(p, au); };
  await runMusicIntel(h.deps, 'alb');
  assert.ok(sawFilm);
  assert.equal(h.job.isSoundtrack, true);
  assert.equal(h.job.film!.status, 'LINKED');
});

// ─── Route smoke: the real router, mounted locally (no credentials, no production calls) ───
test('route: analyze needs sign-in; bad ids are rejected', async () => {
  const express = (await import('express')).default;
  const { createMusicIntelRouter } = await import('../routes/musicIntel.ts');
  const app = express();
  app.use('/api/music-intel', express.json(), createMusicIntelRouter());
  const server = app.listen(0);
  const port = (server.address() as any).port;
  try {
    const base = `http://127.0.0.1:${port}/api/music-intel`;
    const analyze = await fetch(`${base}/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ albumId: 'x' }) });
    assert.ok([401, 503].includes(analyze.status), `analyze → ${analyze.status}`);
    const badGet = await fetch(`${base}/bad%20id!`);
    assert.equal(badGet.status, 400);
    const badContinue = await fetch(`${base}/continue`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ albumId: '../x' }) });
    assert.equal(badContinue.status, 400);
    const cron = await fetch(`${base}/cron`, { method: 'POST' });
    assert.equal(cron.status, 401);
  } finally { server.close(); }
});
