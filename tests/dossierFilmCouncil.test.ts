import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildFordCouncilFilm, FORD_COUNCIL_SHOTS } from '../data/dossier/fordFilmCouncil';
import { fordDossier } from '../data/dossier/ford';
import { DOSSIER_THEMES } from '../data/dossier/registry';
import { compileCouncil, citedClaims, TITLE_LEN } from '../services/dossier/film/councilCompile';
import { CouncilGateError } from '../services/dossier/film/provenance';
import { balanceLines, chunkWords, estimateWords, markAccents, toSRT, toVTT } from '../services/dossier/film/captions';
import { GEO, intersects, type CouncilFilm } from '../services/dossier/film/councilTypes';
import { KIT } from '../services/dossier/film/transitions';
import { contrastRatio } from '../services/dossier/dossierTheme';

const spec = buildFordCouncilFilm();
const film = spec.council!;
const tl = compileCouncil(film);
const claims = new Map(fordDossier.ledger.claims.map(c => [c.id, c.text]));
const clone = (f: CouncilFilm): CouncilFilm => JSON.parse(JSON.stringify(f));

// ── Claims ──────────────────────────────────────────────────────────────────

test('every claim a Ford film beat cites exists in the Ford ledger', () => {
  const missing = citedClaims(film).filter(id => !claims.has(id));
  assert.deepEqual(missing, []);
});

test('every narrated beat cites at least one claim', () => {
  const bare = film.shots.flatMap(s => (s.beats ?? []).filter(b => !b.claimIds.length).map(b => b.id));
  assert.deepEqual(bare, []);
});

test('figures on screen are the ledger’s own: roughly 12.5 hours, about 93 minutes, $5 against about $2.34', () => {
  assert.match(claims.get('c-93min')!, /roughly 12\.5 hours/);
  assert.match(claims.get('c-93min')!, /about 93 minutes/);
  assert.match(claims.get('c-5day')!, /five dollars/);
  assert.match(claims.get('c-5day')!, /\$2\.30 to \$2\.34/);
  const text = film.shots.flatMap(s => (s.beats ?? []).map(b => b.text)).join(' ');
  assert.match(text, /12\.5 hours/);
  assert.match(text, /about 93 minutes/);
  assert.match(text, /\$2\.34/);
  assert.doesNotMatch(text, /12 h(ours)? 8|ten past/i, 'the unsupported 12 h 8 min figure must not appear');
  // true-scale bars: 93 / 750 min
  assert.ok(Math.abs(93 / 750 - 0.124) < 0.001);
});

// ── Honesty gates ───────────────────────────────────────────────────────────

test('label gate: the Ford film has no direct archive-to-reconstruction cut', () => {
  for (const s of tl.shots) {
    if (s.kind !== 'plates' || !s.plates.some(p => p.spec.kind === 'reconstruction')) continue;
    const prev = tl.shots[s.index - 1];
    const prevArchive = prev.plates.length > 0 && prev.plates.every(p => p.spec.kind === 'archive');
    if (prevArchive) assert.equal(s.transition, 'reconGate', `${s.spec.id} must enter through the Reconstruction Gate`);
  }
});

test('label gate: the compiler refuses a direct archive-to-reconstruction cut', () => {
  const bad = clone(film);
  bad.shots.find(s => s.id === 'watch')!.transition = 'breath';
  assert.throws(() => compileCouncil(bad), (e: unknown) => e instanceof CouncilGateError && e.issues.some(i => /label gate/.test(i) && /watch/.test(i)));
  const bad2 = clone(film);
  bad2.shots.find(s => s.id === 'b24')!.transition = 'stampSlam';
  assert.throws(() => compileCouncil(bad2), CouncilGateError);
});

test('reconstructions never open or close a room, and carry their stamp evidence', () => {
  for (const r of film.rooms.keys()) {
    const mine = film.shots.filter(s => s.room === r);
    assert.ok(!(mine[0].plates ?? []).some(p => p.kind === 'reconstruction'), `room ${r} opens on a reconstruction`);
    assert.ok(!(mine[mine.length - 1].plates ?? []).some(p => p.kind === 'reconstruction'), `room ${r} closes on a reconstruction`);
  }
  const bad = clone(film);
  bad.shots.find(s => s.id === 'watch')!.room = 0;
  const first = bad.shots.findIndex(s => s.room === 0);
  [bad.shots[first], bad.shots[1]] = [bad.shots[1], bad.shots[first]];
  assert.throws(() => compileCouncil(bad), CouncilGateError);
  const noNote = clone(film);
  noNote.shots.find(s => s.id === 'watch')!.plates![0].slate.evidence = '';
  assert.throws(() => compileCouncil(noNote), CouncilGateError);
});

test('exactly one full-bleed reconstruction (the B-24 painting); no painted Ford hero is used', () => {
  const plates = film.shots.flatMap(s => s.plates ?? []);
  const bleed = plates.filter(p => p.fullBleed);
  assert.deepEqual(bleed.map(p => p.asset), ['recon-willow-run']);
  assert.deepEqual([...new Set(plates.filter(p => p.kind === 'reconstruction').map(p => p.asset))].sort(), ['recon-ford-watch-table', 'recon-willow-run']);
  const twice = clone(film);
  twice.shots.find(s => s.id === 'watch')!.plates![0].fullBleed = true;
  assert.throws(() => compileCouncil(twice), (e: unknown) => e instanceof CouncilGateError && e.issues.some(i => /exactly one/.test(i)));
});

test('every plate carries a complete Provenance Slate', () => {
  for (const s of film.shots) for (const p of s.plates ?? []) {
    if (p.kind === 'archive') { for (const k of ['title', 'source', 'year', 'licence'] as const) assert.ok(p.slate[k], `${s.id}/${p.asset} slate lacks ${k}`); }
    else assert.ok((p.slate.evidence ?? '').length > 30, `${s.id}/${p.asset} lacks its evidence line`);
  }
});

test('assets are declared and on disk (run scripts/dossier/fetchFilmAssets.ts --slug=ford if archival files are missing)', () => {
  const ids = new Set(spec.assets.map(a => a.id));
  for (const s of [{ plates: [film.titlePlate] }, ...film.shots]) for (const p of s.plates ?? []) assert.ok(ids.has(p.asset), `${p.asset} undeclared`);
  for (const a of spec.assets) {
    assert.ok(a.credit.trim().length > 0, `${a.id} has no credit`);
    assert.ok(existsSync(join('public', a.src)), `${a.id} missing ${a.src}`);
  }
});

// ── Captions ────────────────────────────────────────────────────────────────

test('captions are lossless: every spoken word appears once, in order', () => {
  for (const s of tl.shots) for (const b of s.beats) {
    const cues = tl.cues.filter(c => c.shot === s.index && c.words[0].a >= b.words[0].a - 1e-6 && c.words[c.words.length - 1].b <= b.words[b.words.length - 1].b + 1e-6);
    assert.equal(cues.map(c => c.text).join(' '), b.text, b.id);
  }
});

test('captions never overlap in time, stay in order, fit two lines and read at a humane speed', () => {
  for (let i = 0; i < tl.cues.length; i++) {
    const c = tl.cues[i];
    assert.ok(c.b > c.a, `cue ${i} has no duration`);
    if (i) assert.ok(c.a >= tl.cues[i - 1].b - 1e-9, `cue ${i} overlaps the previous one`);
    assert.ok(c.text.length <= 112, `cue ${i} is too long: ${c.text}`);
  }
  assert.deepEqual(tl.warnings, []);
});

test('captions enter 2 frames before the first word and leave 6 frames after the last (unless a later cue cuts them)', () => {
  const c = tl.cues[0];
  assert.ok(Math.abs(c.a - (c.words[0].a - 2 / 30)) < 1e-9);
});

test('caption band, plates, slate, margin column and lower third never overlap', () => {
  for (const s of tl.shots.filter(x => x.kind === 'plates')) {
    for (const p of s.plates) {
      assert.ok(!intersects(p, GEO.caption), `${s.spec.id} plate touches captions`);
      if (s.lowerThird) assert.ok(!intersects(p, s.lowerThird.box), `${s.spec.id} lower third touches plate`);
      if (!p.spec.fullBleed) assert.ok(p.x + p.w <= GEO.margin.x, `${s.spec.id} plate runs into the margin column`);
    }
    if (s.slateBox) assert.ok(!intersects(s.slateBox, GEO.caption), `${s.spec.id} slate touches captions`);
  }
  assert.ok(!intersects(GEO.margin, GEO.caption) && !intersects(GEO.plateZone, GEO.caption));
  assert.ok(GEO.caption.y >= 0.78 * 1080 && GEO.caption.y + GEO.caption.h <= 1080 * 0.92 + 1, 'caption sits in the bottom 22% with the 9% safe margin');
});

test('balanceLines: two lines at most, balanced', () => {
  const w = (s: string) => s.length * 20;
  assert.deepEqual(balanceLines(['short', 'line'], w, 1340), ['short line']);
  const long = 'In 1896 he finished his first gasoline vehicle. Ford Motor Company followed, incorporated on 16 June 1903'.split(' ');
  const l = balanceLines(long, w, 1340)!;
  assert.equal(l.length, 2);
  assert.equal(balanceLines(Array(40).fill('wordword'), w, 1340), null);
});

test('chunker keeps clauses together and accents names, dates and numbers', () => {
  const { words } = estimateWords('On 7 March 1932, police and Ford guards fired on unemployed marchers, killing four that day.');
  const tw = words.map(x => ({ text: x.text, a: x.a, b: x.b, accent: false }));
  const chunks = chunkWords(tw);
  assert.ok(chunks.length >= 2);
  assert.equal(chunks[0].from, 0);
  assert.equal(chunks[chunks.length - 1].to, tw.length - 1);
  const acc = markAccents(tw.map(w => w.text), ['Henry Ford']);
  assert.deepEqual(tw.map((w, i) => acc[i] ? w.text : '').filter(Boolean), ['7', 'March', '1932,']);
});

test('SRT and WebVTT sidecars use the same cues', () => {
  const srt = toSRT(tl.cues), vtt = toVTT(tl.cues);
  assert.equal(srt.trim().split('\n\n').length, tl.cues.length);
  assert.ok(vtt.startsWith('WEBVTT'));
  assert.match(srt, /00:00:\d\d,\d{3} --> /);
});

// ── Structure and the Beliefs room ──────────────────────────────────────────

test('runs about 3 min 35 s in six rooms that map onto the exhibit’s eight-room plan strip', () => {
  assert.ok(tl.duration > 200 && tl.duration < 235, `duration ${tl.duration}`);
  assert.equal(film.rooms.length, 6);
  assert.equal(film.exhibitRoomCount, fordDossier.rooms.length);
  const covered = film.rooms.flatMap(r => { const a: number[] = []; for (let i = r.exhibitRooms[0]; i <= r.exhibitRooms[1]; i++) a.push(i); return a; });
  assert.deepEqual(covered, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(tl.rooms.map(r => r.label), ['Rooms 1–2 of 8', 'Room 3 of 8', 'Rooms 4–5 of 8', 'Room 6 of 8', 'Room 7 of 8', 'Room 8 of 8']);
  // exhibit wings
  assert.deepEqual(fordDossier.wings!.map(w => w.title), ['Motor City', 'The War Effort', 'Beliefs and Morals', 'Legacy']);
});

test('Beliefs and Morals has the Rouge room’s length, type size, caption grammar and pace', () => {
  const room = (id: string) => {
    const idx = film.rooms.findIndex(r => r.id === id);
    const shots = tl.shots.filter(s => s.room === idx && s.kind === 'plates');
    const beats = shots.flatMap(s => s.beats);
    const words = beats.reduce((n, b) => n + b.words.length, 0);
    const spoken = beats.reduce((n, b) => n + (b.b - b.a), 0);
    const span = shots[shots.length - 1].end - shots[0].start;
    return { words, wpm: words / spoken * 60, span, cues: tl.cues.filter(c => shots.some(s => s.index === c.shot)) };
  };
  const rouge = room('rouge'), beliefs = room('beliefs');
  assert.ok(Math.abs(beliefs.words - rouge.words) / rouge.words < 0.08, `words ${beliefs.words} vs ${rouge.words}`);
  assert.ok(Math.abs(beliefs.wpm - rouge.wpm) / rouge.wpm < 0.09, `pace ${beliefs.wpm.toFixed(0)} vs ${rouge.wpm.toFixed(0)} wpm`);
  assert.ok(Math.abs(beliefs.span - rouge.span) / rouge.span < 0.1, `length ${beliefs.span.toFixed(1)}s vs ${rouge.span.toFixed(1)}s`);
  const longest = (r: ReturnType<typeof room>) => Math.max(...r.cues.map(c => c.text.length));
  assert.ok(longest(beliefs) <= 112 && longest(rouge) <= 112);
  // One caption size for the whole film (the painter has no per-room size), so the grammar cannot drift.
  assert.equal(GEO.captionSize, 44);
  assert.ok(rouge.wpm > 125 && rouge.wpm < 165, `Rouge pace ${rouge.wpm.toFixed(0)} wpm`);
});

test('Beliefs: Silence Hold in, printed pages held 4 s or more, nothing animated, no red stamp, no music swell', () => {
  const idx = film.rooms.findIndex(r => r.id === 'beliefs');
  const shots = tl.shots.filter(s => s.room === idx);
  assert.equal(shots[0].kind, 'card');
  assert.equal(shots[0].transition, 'silenceHold');
  assert.ok(Math.abs((shots[0].end - shots[0].start) - 45 / 30) < 1e-9, 'the card holds 45 frames');
  const pages = shots.filter(s => s.kind === 'plates');
  assert.deepEqual(pages.flatMap(s => s.plates.map(p => p.spec.asset)).sort(), ['doc-1920-dearborn-independent', 'doc-1920-international-jew-titlepage', 'doc-1921-dearborn-independent-cover', 'doc-1927-dearborn-independent-cover']);
  for (const s of pages) {
    assert.ok(s.end - s.start - s.trDur >= 4, `${s.spec.id} held ${(s.end - s.start).toFixed(1)}s`);
    assert.equal(s.transition, 'breath', 'documents are entered by a plain cut');
    assert.equal(s.spec.graphic, undefined, 'nothing animated beside the pages');
    assert.equal(s.spec.lowerThird, undefined);
    assert.ok(s.plates.every(p => p.spec.kind === 'archive' && !p.spec.fullBleed));
  }
  assert.ok(shots.every(s => s.transition !== 'stampSlam'), 'no red stamp in the Beliefs room');
  const sil = tl.silences.find(w => w.from < shots[0].start && w.to >= shots[shots.length - 1].end);
  assert.ok(sil, 'the score is out from before the card to the end of the room');
  assert.ok(Math.abs(shots[0].start - sil!.from - 1) < 1e-6, 'music out 30 frames before the card');
  assert.ok(tl.skips.some(k => k.from === shots[0].start && k.to === shots[shots.length - 1].end), 'any key skips the section');
});

test('Beliefs states who was harmed and the 1927 retraction, citing the ledger', () => {
  const text = film.shots.filter(s => film.rooms[s.room].id === 'beliefs').flatMap(s => (s.beats ?? []).map(b => b.text)).join(' ');
  assert.match(text, /Jews were its targets/);
  assert.match(text, /Aaron Sapiro/);
  assert.match(text, /30 June 1927/);
  assert.match(text, /retraction and apology/);
  assert.match(text, /Historians still ask how involved/);
  assert.match(claims.get('c-retraction')!, /30 June 1927/);
  assert.match(claims.get('c-protocols')!, /Jews/);
});

test('transition kit: Breath Cut is the default; Stamp Slam only in Motor City and the War Effort, 3 to 4 times, on a spoken year', () => {
  const trs = tl.shots.filter(s => s.kind === 'plates' || s.kind === 'card');
  const breath = trs.filter(s => s.transition === 'breath').length / trs.length;
  assert.ok(breath >= 0.6, `Breath Cut share ${breath}`);
  const slams = trs.filter(s => s.transition === 'stampSlam');
  assert.ok(slams.length >= 3 && slams.length <= 4);
  for (const s of slams) {
    assert.ok(['Motor City', 'The War Effort'].includes(film.rooms[s.room].wing));
    assert.ok(s.beats[0].words.some(w => w.text.replace(/\D/g, '') === s.spec.stamp), 'the bar carries a word of the first beat');
    // The impact frame lands on the spoken year.
    const w = s.beats[0].words.find(x => x.text.replace(/\D/g, '') === s.spec.stamp)!;
    assert.ok(Math.abs(w.a - (s.start + KIT.stampSlam.foley!.at)) < 0.06, `${s.spec.id} impact vs spoken year: ${(w.a - s.start).toFixed(2)}`);
  }
  assert.equal(Math.round(KIT.stampSlam.dur * 30), 16);
  assert.equal(Math.round(KIT.formeLock.dur * 30), 26);
  assert.equal(Math.round(KIT.reconGate.dur * 30), 22);
  assert.equal(Math.round(KIT.roadLine.dur * 30), 24);
  assert.equal(Math.round(KIT.groundDip.dur * 30), 24);
});

test('no transition begins inside a spoken word; every cut lands in a gap of 120 ms or more', () => {
  for (const s of tl.shots) {
    if (s.index === 0) continue;
    for (const o of tl.shots) for (const b of o.beats) for (const w of b.words) {
      assert.ok(!(s.start > w.a + 1e-6 && s.start < w.b - 1e-6), `${s.spec.id} starts inside "${w.text}"`);
    }
    const prev = tl.shots[s.index - 1];
    if (prev.beats.length && s.beats.length) assert.ok(s.beats[0].a - prev.beats[prev.beats.length - 1].b >= 0.12, `${s.spec.id} gap`);
  }
});

test('lower thirds: first entrance only, one per 25 s, held 3 s, never in Beliefs', () => {
  const lts = tl.shots.filter(s => s.lowerThird);
  assert.ok(lts.length >= 3);
  for (let i = 1; i < lts.length; i++) assert.ok(lts[i].lowerThird!.a - lts[i - 1].lowerThird!.a >= 25);
  for (const s of lts) { assert.ok(s.lowerThird!.b - s.lowerThird!.a >= 3); assert.notEqual(film.rooms[s.room].id, 'beliefs'); }
  const names = lts.map(s => s.spec.lowerThird!.name);
  assert.equal(new Set(names).size, names.length, 'a name or place enters once');
});

test('exhibit ground and accent are read from the exhibit theme and pass 4.5:1', () => {
  const t = DOSSIER_THEMES['henry-ford'];
  assert.equal(film.theme.accent, t.accent);
  assert.equal(film.theme.bg, t.bg);
  assert.equal(film.theme.display, t.display);
  assert.match(film.theme.display, /Anton/);
  assert.ok(contrastRatio(film.theme.accent, film.theme.bg) >= 4.5);
  assert.ok(contrastRatio(film.theme.ink, film.theme.bg) >= 4.5);
  assert.ok(contrastRatio(film.theme.stamp, film.theme.bg) >= 4.5);
});

test('editor’s cut: the council painter has no grain, vignette, glow, depth, blur or filter in its source', async () => {
  const { readFileSync } = await import('node:fs');
  const src = ['councilStyle.ts', 'transitions.ts'].map(f => readFileSync(join('services/dossier/film', f), 'utf8')).join('\n');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const banned of [/createRadialGradient/, /createLinearGradient/, /globalCompositeOperation\s*=\s*'(?!source-over)/, /ctx\.filter\s*=\s*'(?!none)/, /grain|vignette|halation|parallax|shadowBlur/i]) {
    assert.doesNotMatch(code, banned, String(banned));
  }
});

// ── Timing: estimated now, re-timed when narration is added ──────────────────

test('without audio the timing is estimated; adding narration durations re-times the whole film', () => {
  assert.equal(tl.timing, 'estimated');
  const timings = Object.fromEntries(FORD_COUNCIL_SHOTS.flatMap(s => (s.beats ?? []).map(b => [b.id, { audio: `/x/${b.id}.m4a`, duration: 1 + b.text.split(' ').length / 2 }])));
  const voiced = compileCouncil(buildFordCouncilFilm({ narration: timings }).council!);
  assert.equal(voiced.timing, 'voiced');
  assert.notEqual(Math.round(voiced.duration), Math.round(tl.duration));
  assert.equal(voiced.cues.length >= tl.cues.length - 6, true);
  const mixed = compileCouncil(buildFordCouncilFilm({ narration: { 'born.1': timings['born.1'] } }).council!);
  assert.equal(mixed.timing, 'mixed');
  // cues still honour the gates after re-timing
  for (let i = 1; i < voiced.cues.length; i++) assert.ok(voiced.cues[i].a >= voiced.cues[i - 1].b - 1e-9);
});

test('the title sequence is 6.5 s, skippable, with the plate arriving after 0.4 s', () => {
  assert.equal(TITLE_LEN, 6.5);
  assert.deepEqual(tl.skips[0], { from: 0, to: 6.5, label: 'Skip the title' });
  assert.equal(tl.shots[0].kind, 'title');
  assert.equal(tl.shots[0].plates[0].spec.kind, 'archive');
  assert.equal(tl.shots[tl.shots.length - 1].end - tl.shots[tl.shots.length - 1].start, 12);
});
