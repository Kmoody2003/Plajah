/**
 * The Douglass, Persia and Partition films in the Motion Council's style: claims exist, honesty gates, captions, the
 * non-Latin allow-list, the rooms-to-plan-strip mapping, content notes and Silence Holds, and the Douglass ledger fix.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDouglassCouncilFilm, DOUGLASS_COUNCIL_SHOTS } from '../data/dossier/douglassFilmCouncil';
import { buildPersiaCouncilFilm, PERSIA_COUNCIL_SHOTS, PERSIA_SCRIPTS } from '../data/dossier/persiaFilmCouncil';
import { buildPartitionCouncilFilm, PARTITION_COUNCIL_SHOTS, PARTITION_SCRIPTS } from '../data/dossier/partitionFilmCouncil';
import { douglassDossier } from '../data/dossier/douglass';
import { persiaDossier } from '../data/dossier/persia';
import { partitionDossier } from '../data/dossier/partition';
import { buildDouglassFilm } from '../data/dossier/douglassFilm';
import { DOSSIERS, DOSSIER_THEMES } from '../data/dossier/registry';
import { compileCouncil, citedClaims } from '../services/dossier/film/councilCompile';
import { CouncilGateError } from '../services/dossier/film/provenance';
import { toSRT, toVTT } from '../services/dossier/film/captions';
import { GEO, intersects, type CouncilFilm, type CouncilShot } from '../services/dossier/film/councilTypes';
import { validateDossier } from '../services/dossier/dossierTypes';
import { contrastRatio } from '../services/dossier/dossierTheme';

const clone = (f: CouncilFilm): CouncilFilm => JSON.parse(JSON.stringify(f));
const read = (f: string) => readFileSync(f, 'utf8');

const FILMS = [
  { slug: 'douglass', name: 'Douglass', id: 'frederick-douglass', theme: 'frederick-douglass', gesture: 'composing', dossier: douglassDossier, spec: buildDouglassCouncilFilm(), shots: DOUGLASS_COUNCIL_SHOTS, rooms: 5, bleed: 'recon-shipyard' },
  { slug: 'persia', name: 'Persia', id: 'christianity-in-persia', theme: 'christianity-in-persia', gesture: 'road', dossier: persiaDossier, spec: buildPersiaCouncilFilm(), shots: PERSIA_COUNCIL_SHOTS, rooms: 9, bleed: 'recon-ctesiphon-vault' },
  { slug: 'partition', name: 'Partition', id: 'partition-1947', theme: 'partition-1947', gesture: 'line', dossier: partitionDossier, spec: buildPartitionCouncilFilm(), shots: PARTITION_COUNCIL_SHOTS, rooms: 12, bleed: 'recon-radcliffe-desk' },
] as const;

for (const F of FILMS) {
  const film = F.spec.council!;
  const tl = compileCouncil(film);
  const claims = new Map(F.dossier.ledger.claims.map(c => [c.id, c.text]));

  test(`${F.name}: every claim a beat cites exists in the ledger, and every narrated beat cites at least one`, () => {
    assert.deepEqual(citedClaims(film).filter(id => !claims.has(id)), []);
    assert.deepEqual(film.shots.flatMap(s => (s.beats ?? []).filter(b => !b.claimIds.length).map(b => b.id)), []);
    assert.deepEqual(validateDossier(F.dossier).filter(i => i.severity === 'error'), []);
  });

  test(`${F.name}: label gate refuses a direct archive-to-reconstruction cut`, () => {
    const gated = film.shots.filter(s => s.transition === 'reconGate');
    assert.ok(gated.length >= 1);
    for (const g of gated) {
      const bad = clone(film);
      bad.shots.find(s => s.id === g.id)!.transition = 'breath';
      const prev = film.shots[film.shots.findIndex(s => s.id === g.id) - 1];
      const prevArchive = (prev.plates ?? []).length > 0 && (prev.plates ?? []).every(p => p.kind === 'archive');
      if (prevArchive) assert.throws(() => compileCouncil(bad), (e: unknown) => e instanceof CouncilGateError && e.issues.some(i => /label gate/.test(i)), g.id);
    }
    for (const s of tl.shots) {
      if (s.kind !== 'plates' || !s.plates.some(p => p.spec.kind === 'reconstruction')) continue;
      const prev = tl.shots[s.index - 1];
      if (prev.plates.length && prev.plates.every(p => p.spec.kind === 'archive')) assert.equal(s.transition, 'reconGate', s.spec.id);
    }
  });

  test(`${F.name}: reconstructions never open or close a room and carry an evidence line; exactly one is full-bleed (${F.bleed})`, () => {
    for (const r of film.rooms.keys()) {
      const mine = film.shots.filter(s => s.room === r);
      assert.ok(!(mine[0].plates ?? []).some(p => p.kind === 'reconstruction'), `room ${r} opens on a reconstruction`);
      assert.ok(!(mine[mine.length - 1].plates ?? []).some(p => p.kind === 'reconstruction'), `room ${r} closes on a reconstruction`);
    }
    const plates = film.shots.flatMap(s => s.plates ?? []);
    assert.deepEqual(plates.filter(p => p.fullBleed).map(p => p.asset), [F.bleed]);
    for (const p of plates.filter(x => x.kind === 'reconstruction')) assert.ok((p.slate.evidence ?? '').length > 30, `${p.asset} lacks its evidence line`);
    const noNote = clone(film);
    noNote.shots.find(s => (s.plates ?? []).some(p => p.kind === 'reconstruction'))!.plates!.find(p => p.kind === 'reconstruction')!.slate.evidence = '';
    assert.throws(() => compileCouncil(noNote), CouncilGateError);
    const twice = clone(film);
    twice.shots.find(s => (s.plates ?? []).some(p => p.kind === 'reconstruction' && !p.fullBleed))!.plates!.find(p => p.kind === 'reconstruction' && !p.fullBleed)!.fullBleed = true;
    assert.throws(() => compileCouncil(twice), (e: unknown) => e instanceof CouncilGateError && e.issues.some(i => /exactly one/.test(i)));
  });

  test(`${F.name}: every plate has a complete Provenance Slate and every file is declared, credited and on disk`, () => {
    const ids = new Set(F.spec.assets.map(a => a.id));
    for (const s of [{ id: 'title', plates: [film.titlePlate] } as CouncilShot, ...film.shots]) for (const p of s.plates ?? []) {
      assert.ok(ids.has(p.asset), `${p.asset} undeclared`);
      if (p.kind === 'archive') for (const k of ['title', 'source', 'year', 'licence'] as const) assert.ok(p.slate[k], `${s.id}/${p.asset} slate lacks ${k}`);
    }
    for (const a of F.spec.assets) {
      assert.ok(a.credit.trim().length > 0, `${a.id} has no credit`);
      assert.ok(existsSync(join('public', a.src)), `${a.id} missing ${a.src} (run scripts/dossier/fetchFilmAssets.ts --slug=${F.slug})`);
    }
  });

  test(`${F.name}: captions are lossless, ordered, fit two lines, and the SRT and VTT sidecars use the same cues`, () => {
    for (const s of tl.shots) for (const b of s.beats) {
      const cues = tl.cues.filter(c => c.shot === s.index && c.words[0].a >= b.words[0].a - 1e-6 && c.words[c.words.length - 1].b <= b.words[b.words.length - 1].b + 1e-6);
      assert.equal(cues.map(c => c.text).join(' '), b.text, b.id);
    }
    for (let i = 0; i < tl.cues.length; i++) {
      assert.ok(tl.cues[i].b > tl.cues[i].a);
      if (i) assert.ok(tl.cues[i].a >= tl.cues[i - 1].b - 1e-9, `cue ${i} overlaps`);
      assert.ok(tl.cues[i].text.length <= 112);
    }
    assert.deepEqual(tl.warnings, []);
    assert.equal(toSRT(tl.cues).trim().split('\n\n').length, tl.cues.length);
    assert.ok(toVTT(tl.cues).startsWith('WEBVTT'));
  });

  test(`${F.name}: runs about 3 min 35 s in ${F.rooms === 5 ? 'five' : 'six'} film rooms that cover the exhibit's ${F.rooms}-room plan strip, in order`, () => {
    assert.ok(tl.duration > 195 && tl.duration < 235, `duration ${tl.duration}`);
    assert.equal(film.exhibitRoomCount, F.dossier.rooms.length);
    assert.equal(film.exhibitRoomCount, F.rooms);
    assert.equal(film.rooms.length, F.rooms === 5 ? 5 : 6);
    const covered = film.rooms.flatMap(r => { const a: number[] = []; for (let i = r.exhibitRooms[0]; i <= r.exhibitRooms[1]; i++) a.push(i); return a; });
    assert.deepEqual(covered, Array.from({ length: F.rooms }, (_, i) => i + 1));
    for (const r of tl.rooms) assert.match(r.label, /^Rooms? \d+(–\d+)? of \d+$/);
  });

  test(`${F.name}: caption band, plates, slate, margin column and lower third never overlap`, () => {
    for (const s of tl.shots.filter(x => x.kind === 'plates' || x.kind === 'graphic')) {
      for (const p of s.plates) {
        assert.ok(!intersects(p, GEO.caption), `${s.spec.id} plate touches captions`);
        if (s.lowerThird) assert.ok(!intersects(p, s.lowerThird.box), `${s.spec.id} lower third touches plate`);
        if (!p.spec.fullBleed) assert.ok(p.x + p.w <= GEO.margin.x, `${s.spec.id} plate runs into the margin column`);
      }
      if (s.slateBox) assert.ok(!intersects(s.slateBox, GEO.caption), `${s.spec.id} slate touches captions`);
    }
  });

  test(`${F.name}: a Silence Hold card enters the heavy material; the score is out and any key skips the section`, () => {
    const cards = tl.shots.filter(s => s.kind === 'card' && s.transition === 'silenceHold');
    assert.ok(cards.length >= 1);
    for (const c of cards) {
      assert.ok(c.end - c.start >= 45 / 30 - 1e-9, 'the card holds 45 frames or more');
      assert.ok(tl.skips.some(k => k.from === c.start && k.to > c.end), 'any key skips the section');
      assert.ok(tl.silences.some(w => Math.abs(w.from - (c.start - 1)) < 1e-6 && w.to > c.end), 'music out 30 frames before the card');
    }
    // Every distressing plate sits inside a silence window.
    for (const s of tl.shots) if (s.plates.some(p => p.spec.distressing)) assert.ok(tl.silences.some(w => s.start >= w.from && s.end <= w.to + 1e-6), `${s.spec.id} is distressing and not behind a Silence Hold`);
    // Heavy material is never animated: no lower third, no graphic on a distressing plate.
    for (const s of tl.shots) if (s.plates.some(p => p.spec.distressing)) assert.equal(s.spec.lowerThird, undefined);
  });

  test(`${F.name}: no transition begins inside a spoken word; lower thirds are rare and never on a face-bearing plate flagged distressing`, () => {
    for (const s of tl.shots) {
      if (s.index === 0) continue;
      for (const o of tl.shots) for (const b of o.beats) for (const w of b.words) assert.ok(!(s.start > w.a + 1e-6 && s.start < w.b - 1e-6), `${s.spec.id} starts inside "${w.text}"`);
    }
    const lts = tl.shots.filter(s => s.lowerThird);
    for (let i = 1; i < lts.length; i++) assert.ok(lts[i].lowerThird!.a - lts[i - 1].lowerThird!.a >= 25);
    assert.equal(new Set(lts.map(s => s.spec.lowerThird!.name)).size, lts.length);
  });

  test(`${F.name}: ground and accent come from the exhibit theme and pass 4.5:1; the title gesture is ${F.gesture}`, () => {
    const t = DOSSIER_THEMES[F.theme];
    assert.equal(film.theme.accent, t.accent); assert.equal(film.theme.bg, t.bg); assert.equal(film.theme.display, t.display);
    assert.equal(film.theme.titleGesture, F.gesture);
    assert.ok(contrastRatio(film.theme.accent, film.theme.bg) >= 4.5);
    assert.ok(contrastRatio(film.theme.ink, film.theme.bg) >= 4.5);
    assert.ok(contrastRatio(film.theme.stamp, film.theme.bg) >= 4.5);
  });

  test(`${F.name}: the exhibit's registry entry opens this film in the player`, () => {
    const entry = DOSSIERS.find(d => d.id === F.id)!;
    assert.equal(typeof entry.film, 'function');
  });

  test(`${F.name}: without audio timing is estimated; adding narration durations re-times the film`, () => {
    assert.equal(tl.timing, 'estimated');
    const timings = Object.fromEntries(F.shots.flatMap(s => (s.beats ?? []).map(b => [b.id, { audio: `/x/${b.id}.m4a`, duration: 1 + b.text.split(' ').length / 2 }])));
    const build = { douglass: buildDouglassCouncilFilm, persia: buildPersiaCouncilFilm, partition: buildPartitionCouncilFilm }[F.slug];
    const voiced = compileCouncil(build({ narration: timings }).council!);
    assert.equal(voiced.timing, 'voiced');
    assert.notEqual(Math.round(voiced.duration), Math.round(tl.duration));
    for (let i = 1; i < voiced.cues.length; i++) assert.ok(voiced.cues[i].a >= voiced.cues[i - 1].b - 1e-9);
  });
}

// ── Non-Latin allow-list ─────────────────────────────────────────────────────

const NON_LATIN = /[֐-ࣿऀ-෿⺀-鿿ꀀ-﷿ﹰ-﻿]+/g;
const strings = (v: unknown, out: string[] = []): string[] => {
  if (typeof v === 'string') out.push(v); else if (Array.isArray(v)) v.forEach(x => strings(x, out)); else if (v && typeof v === 'object') Object.values(v as object).forEach(x => strings(x, out));
  return out;
};

test('non-Latin strings: each film carries only strings the exhibit data or theme already holds, and no others', () => {
  const sources = [read('data/dossier/registry.ts'), read('data/dossier/persiaRoad.ts')].join('\n');
  for (const F of FILMS) {
    const film = F.spec.council!;
    const allowed = (film.allowedScripts ?? []).map(a => a.text);
    for (const a of film.allowedScripts ?? []) assert.ok(sources.includes(a.text), `${F.name}: "${a.text}" is not in the exhibit's own data (${a.source})`);
    const runs = strings({ ...film, theme: undefined, allowedScripts: undefined, titleScripts: undefined }).flatMap(s => s.match(NON_LATIN) ?? []);
    for (const r of runs) assert.ok(allowed.some(a => a.includes(r)), `${F.name}: stray non-Latin run "${r}"`);
  }
  // Douglass carries none at all.
  assert.deepEqual(buildDouglassCouncilFilm().council!.allowedScripts ?? [], []);
  assert.deepEqual(strings(buildDouglassCouncilFilm().council).flatMap(s => s.match(NON_LATIN) ?? []), []);
  assert.deepEqual(PERSIA_SCRIPTS.map(s => s.lang), ['syriac', 'han']);
});

test('non-Latin gate: the compiler refuses a Hindi, Punjabi or other unproofed string anywhere in the film', () => {
  const part = buildPartitionCouncilFilm().council!;
  for (const stray of ['विभाजन', 'ਪੰਜਾਬ', 'ਵੰਡ', 'विभाजन']) {
    const caption = clone(part); caption.shots[0].beats![0].text += ` ${stray}`;
    assert.throws(() => compileCouncil(caption), (e: unknown) => e instanceof CouncilGateError && e.issues.some(i => /non-Latin gate/.test(i)), stray);
    const endCard = clone(part); endCard.endCard[0].lines.push(stray);
    assert.throws(() => compileCouncil(endCard), CouncilGateError);
    const title = clone(part); title.titleScripts = [...(title.titleScripts ?? []), { text: stray, lang: 'devanagari', reading: 'x', source: 'x' }];
    assert.throws(() => compileCouncil(title), CouncilGateError);
  }
  const persia = buildPersiaCouncilFilm().council!;
  const stray = clone(persia); stray.shots[0].margin!.place = 'القدس';
  assert.throws(() => compileCouncil(stray), CouncilGateError);
});

test('Partition: the Urdu title is the exhibit’s own string; no Hindi or Punjabi title is set, and the end card says so and marks the Urdu as awaiting a native reader', () => {
  const film = buildPartitionCouncilFilm().council!;
  assert.deepEqual(PARTITION_SCRIPTS.map(s => s.lang), ['urdu']);
  assert.deepEqual(film.titleScripts!.map(s => s.text), [DOSSIER_THEMES['partition-1947'].script!.word]);
  assert.equal(strings(film).filter(s => /[ऀ-ॿ਀-੿]/.test(s)).length, 0, 'no Devanagari or Gurmukhi anywhere');
  const end = film.endCard.flatMap(b => b.lines).join(' ');
  assert.match(end, /pending native-reader proofing/i);
  assert.match(end, /No Hindi or Punjabi title is shown/);
});

test('Persia: Syriac and Chinese appear only as the exhibit’s own strings, the end card marks them pending a native reader', () => {
  const film = buildPersiaCouncilFilm().council!;
  assert.deepEqual(film.titleScripts!.map(s => s.text), [DOSSIER_THEMES['christianity-in-persia'].script!.word]);
  assert.match(film.endCard.flatMap(b => b.lines).join(' '), /Pending native-reader proofing/);
  assert.equal(film.contentNote, 'Content note: martyrdom and war');
});

// ── Per-exhibit honesty ──────────────────────────────────────────────────────

test('Douglass: no faced painting is used; the four paintings are faceless and the earlier faced ones are absent', () => {
  const film = buildDouglassCouncilFilm().council!;
  const used = [...new Set(film.shots.flatMap(s => s.plates ?? []).filter(p => p.kind === 'reconstruction').map(p => p.asset))].sort();
  assert.deepEqual(used, ['recon-covey-field', 'recon-lectern-empty', 'recon-shipyard', 'recon-study-desk']);
  for (const faced of ['recon-nantucket', 'recon-cedarhill', 'recon-printing-office', 'recon-fourth', 'recon-anteroom', 'recon-escape']) assert.ok(!used.includes(faced));
  const text = JSON.stringify(film.shots.flatMap(s => s.plates ?? []).filter(p => p.kind === 'reconstruction').map(p => p.slate.evidence));
  assert.doesNotMatch(text, /Douglass’s face|his face/);
});

test('Douglass: the Narrative title page carries one gold underline under WRITTEN BY HIMSELF and one flat crop-in; the North Star masthead is cropped flat; the checks are on real pixels', () => {
  const film = buildDouglassCouncilFilm().council!;
  const page = film.shots.find(s => s.id === 'narrative')!;
  assert.deepEqual((page.marks ?? []).map(m => m.kind), ['underline', 'detail']);
  const u = page.marks!.find(m => m.kind === 'underline') as Extract<NonNullable<CouncilShot['marks']>[number], { kind: 'underline' }>;
  assert.equal(u.anchor, 'himself');
  assert.ok(u.at.y > 0.6 && u.at.y < 0.66, 'the underline sits under the line WRITTEN BY HIMSELF on the page');
  assert.equal(page.plates![0].asset, 'film-1845-title-page');
  const detail = (s: CouncilShot) => (s.marks ?? []).filter(m => m.kind === 'detail');
  const nStar = film.shots.find(s => s.id === 'northstar')!;
  assert.equal(detail(nStar).length, 1);
  assert.equal(film.shots.reduce((n, s) => n + detail(s).length, 0), 2, 'at most two flat detail moves in the film');
  // The crop is the same aspect as the plate, so pixels are scaled, never stretched.
  for (const m of [...detail(page), ...detail(nStar)]) { const r = (m as { rect: { w: number; h: number } }).rect; assert.equal(r.w, r.h); }
  const tl = compileCouncil(film);
  const s = tl.shots.find(x => x.spec.id === 'narrative')!;
  const ul = s.marks.find(m => m.mark.kind === 'underline')!, dt = s.marks.find(m => m.mark.kind === 'detail')!;
  assert.ok(ul.at < dt.at, 'the underline is drawn before the crop-in');
});

test('Douglass: handbill dates, forme locks (about four), three kinetic-type moments at most, gold only on type and rules', () => {
  const film = buildDouglassCouncilFilm().council!;
  const tl = compileCouncil(film);
  const locks = tl.shots.filter(s => s.transition === 'formeLock').length;
  assert.ok(locks >= 3 && locks <= 4, `forme locks ${locks}`);
  const handbill = film.shots.find(s => s.graphic?.kind === 'handbill')!.graphic as Extract<NonNullable<CouncilShot['graphic']>, { kind: 'handbill' }>;
  assert.deepEqual(handbill.items.map(i => i.big), ['1818', '1838', '1845']);
  assert.equal(handbill.items[0].blank, true, 'the last digit of the birth year is an empty quad: he never knew his birthday');
  assert.equal(handbill.items[0].about, true);
  const kinetic = film.shots.filter(s => ['handbill', 'pullQuote'].includes(s.graphic?.kind ?? '')).length + 1;   // + the title
  assert.ok(kinetic <= 3, `kinetic type moments ${kinetic}`);
  assert.equal(film.theme.faces!.slab!.split(',')[0], "'Alfa Slab One'");
  assert.match(film.theme.display, /Abril Fatface/);
  assert.equal(film.theme.accent.toLowerCase(), '#d9b36a');
});

test('Douglass ledger: c-census and c-struggle exist with real sources, the film cites them, and their figures match what is on screen', () => {
  const claims = new Map(douglassDossier.ledger.claims.map(c => [c.id, c]));
  const sources = new Map(douglassDossier.ledger.sources.map(s => [s.id, s]));
  const census = claims.get('c-census')!, struggle = claims.get('c-struggle')!;
  assert.ok(census && struggle);
  for (const c of [census, struggle]) { assert.ok(c.sourceIds.length >= 1); for (const id of c.sourceIds) assert.ok(sources.has(id), id); assert.ok(['established', 'probable', 'contested', 'tradition'].includes(c.confidence)); }
  for (const n of ['3,204,313', '434,495', '3,953,760', '488,070', '2,487,355']) assert.match(census.text, new RegExp(n));
  assert.match(struggle.text, /If there is no struggle there is no progress/);
  assert.match(struggle.text, /3 August 1857/);
  assert.match(sources.get('s-census')!.citation, /Working Paper No\. 56/);
  assert.match(sources.get('s-twospeeches')!.citation, /Canandaigua/);
  // the film's census graphic shows exactly the ledger's enslaved counts
  const stack = buildDouglassCouncilFilm().council!.shots.find(s => s.id === 'census')!.graphic as { items: Array<{ label: string }> };
  assert.deepEqual(stack.items.map(i => i.label), ['2,487,355 enslaved', '3,204,313 enslaved', '3,953,760 enslaved']);
  // the pull-quote on screen is the ledger's wording
  const pq = buildDouglassCouncilFilm().council!.shots.find(s => s.id === 'struggle')!.graphic as { text: string };
  assert.equal(pq.text, 'If there is no struggle there is no progress.');
  // and the earlier scene-keyed film points back at the same claims (no more stand-ins)
  const legacy = buildDouglassFilm();
  assert.ok(legacy.scenes.find(s => s.id === 'census')!.claimIds!.includes('c-census'));
  assert.deepEqual(legacy.scenes.find(s => s.id === 'q-struggle')!.claimIds, ['c-struggle']);
  const legacyIds = new Set(legacy.scenes.flatMap(s => s.claimIds ?? []));
  for (const id of legacyIds) assert.ok(claims.has(id), id);
});

test('Persia: no person is painted; the paintings are places only, the road map is schematic, and the Silence Hold precedes the martyrdom account', () => {
  const film = buildPersiaCouncilFilm().council!;
  const recon = [...new Set(film.shots.flatMap(s => s.plates ?? []).filter(p => p.kind === 'reconstruction').map(p => p.asset))].sort();
  assert.deepEqual(recon, ['recon-ctesiphon-vault', 'recon-urmia-press']);
  for (const p of film.shots.flatMap(s => s.plates ?? []).filter(x => x.kind === 'reconstruction')) assert.match(p.slate.evidence!, /no one is shown/);
  const road = film.shots.find(s => s.id === 'road')!;
  assert.equal(road.graphic!.kind, 'roadMap');
  assert.match((road.graphic as { note: string }).note, /Schematic route/);
  assert.ok(Object.keys(film.basemaps!).includes('persia') && film.basemaps!.persia.layers.land!.length > 10);
  assert.match(film.basemaps!.persia.attribution, /Natural Earth/);
  const i = film.shots.findIndex(s => s.id === 'note'), j = film.shots.findIndex(s => s.id === 'simeon');
  assert.equal(film.shots[i].transition, 'silenceHold');
  assert.ok(i < j);
  assert.match(film.shots[i].card!.lines.join(' '), /Historians debate/);
  assert.equal(compileCouncil(film).shots.filter(s => s.transition === 'roadLine').length, 3);
  // the stops the map names are in the ledger text or the stele's own notice
  const stops = (road.graphic as { stops: Array<{ label: string }> }).stops.map(s => s.label);
  assert.deepEqual(stops, ['Seleucia-Ctesiphon', 'Balkh', 'Qocho', 'Chang’an']);
  assert.match(persiaDossier.ledger.claims.find(c => c.id === 'c-stele781')!.text, /Balkh/);
  assert.match(persiaDossier.ledger.claims.find(c => c.id === 'c-qocho')!.text, /Qocho/);
});

test('Persia: the bundled basemap is small public-domain geometry', () => {
  const f = 'data/dossier/persiaBasemap.json';
  assert.ok(existsSync(f));
  assert.ok(read(f).length < 150_000);
  const bm = JSON.parse(read(f));
  assert.equal(bm.license, 'public-domain');
  assert.ok(bm.bbox[0] < 45 && bm.bbox[2] > 109, 'covers Ctesiphon to Chang’an');
});

test('Partition: deaths and displacement are shown only as contested ranges taken from the ledger, never a single number', () => {
  const film = buildPartitionCouncilFilm().council!;
  const claims = new Map(partitionDossier.ledger.claims.map(c => [c.id, c.text]));
  const shot = film.shots.find(s => s.graphic?.kind === 'rangeBar')!;
  const g = shot.graphic as Extract<NonNullable<CouncilShot['graphic']>, { kind: 'rangeBar' }>;
  const [deaths, moved] = g.rows;
  assert.ok(deaths.lo < deaths.hi && moved.lo < moved.hi);
  assert.match(claims.get('c-deaths')!, /200,000/); assert.match(claims.get('c-deaths')!, /two million|2,000,000|as high as two million/i);
  assert.equal(deaths.lo, 200_000); assert.equal(deaths.hi, 2_000_000);
  assert.match(claims.get('c-displaced')!, /10 million and 20 million/);
  assert.equal(moved.lo, 10_000_000); assert.equal(moved.hi, 20_000_000);
  const text = film.shots.flatMap(s => (s.beats ?? []).map(b => b.text)).join(' ');
  assert.match(text, /from about 200,000 to two million/);
  assert.match(text, /Between about ten and twenty million/);
  // no single toll anywhere in the narration
  assert.doesNotMatch(text, /(\bkilled|died|dead)\b[^.]{0,40}\b(one million|a million|500,000|three million)\b/i);
  for (const s of film.shots.filter(x => x.graphic?.kind === 'rangeBar')) assert.ok((s.plates ?? []).every(p => p.distressing || true));
  assert.match(g.rows.map(r => r.source).join(' '), /Published estimates/);
});

test('Partition: the line is the Foreign Office map’s own printed red line, isolated with the exhibit page’s own colour matrix, never redrawn', () => {
  const film = buildPartitionCouncilFilm().council!;
  const iso = film.shots.find(s => s.id === 'line')!;
  assert.equal(iso.plates![0].treatment!.kind, 'isolate');
  assert.equal(iso.plates![0].asset, 'a-radcliffe-punjab-map');
  assert.match(iso.plates![0].slate.title!, /isolated by colour/);
  assert.match(iso.plates![0].slate.title!, /not redrawn/);
  // the unaltered map is shown first, in its own shot
  const before = film.shots[film.shots.findIndex(s => s.id === 'line') - 1];
  assert.equal(before.plates![0].asset, 'a-radcliffe-punjab-map');
  assert.equal(before.plates![0].treatment, undefined);
  // same matrix as public/dossier/partition-map.html (#fRed): R 1.7, G -0.9, B -0.9, offset -0.12
  const page = read('public/dossier/partition-map.html');
  assert.match(page, /1\.7 -\.9 -\.9 0 -\.12/);
  const code = read('services/dossier/film/isolate.ts').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(code, /1\.7 \* d\[i\] \/ 255 - 0\.9 \* d\[i \+ 1\] \/ 255 - 0\.9 \* d\[i \+ 2\] \/ 255 - 0\.12/);
  assert.doesNotMatch(code, /lineTo|bezier|arc\(/, 'the isolation never draws a line of its own');
  assert.ok(existsSync('public/dossier/partition/maps/punjab-fo-1948.jpg'));
});

test('Partition: Madder Rule only on places and the Radcliffe line (two or three), never on a face or refugee photograph; the rule persists and thickens', () => {
  const film = buildPartitionCouncilFilm().council!;
  const tl = compileCouncil(film);
  const rules = tl.shots.filter(s => s.transition === 'madderRule');
  assert.ok(rules.length >= 2 && rules.length <= 3, `madder rules ${rules.length}`);
  for (const r of rules) {
    const prev = tl.shots[r.index - 1];
    for (const s of [prev, r]) assert.ok(!s.plates.some(p => p.spec.distressing), `${r.spec.id} touches a refugee photograph`);
    assert.deepEqual(['radcliffe', 'cabinet', 'dad', 'dates', 'lahore', 'raj', 'mountbatten'].filter(id => id === prev.spec.id || id === r.spec.id), [], 'not on the portrait or crowd photographs');
  }
  assert.equal(film.marginLine, true);
  assert.equal(film.theme.titleGesture, 'line');
  assert.equal(film.score, undefined);
  assert.match(film.theme.display, /Fraunces/);
});

test('Partition: even-handed and without violence imagery: no photograph of killing, only the cleared archive plates, and refugee photographs behind content notes', () => {
  const film = buildPartitionCouncilFilm().council!;
  assert.equal(film.contentNote, 'Content note: violence and displacement');
  const distressing = film.shots.filter(s => (s.plates ?? []).some(p => p.distressing));
  assert.deepEqual(distressing.map(s => s.id), ['displaced', 'toll']);
  for (const s of distressing) { assert.equal(s.transition ?? 'breath', 'breath'); assert.equal(s.lowerThird, undefined); assert.equal((s.marks ?? []).length, 0); }
  const cards = film.shots.filter(s => s.kind === 'card');
  assert.equal(cards.length, 2);
  assert.match(cards[1].card!.lines.join(' '), /Photographs of refugees follow/);
  const text = film.shots.flatMap(s => (s.beats ?? []).map(b => b.text)).join(' ');
  assert.doesNotMatch(text, /\bmassacre|slaughter|butcher|rape\b/i);
  assert.match(text, /Muslim League|Calcutta|Gandhi/);   // names more than one community's story
  const recon = film.shots.flatMap(s => s.plates ?? []).filter(p => p.kind === 'reconstruction').map(p => p.asset).sort();
  assert.deepEqual(recon, ['recon-camp-tents', 'recon-empty-platform', 'recon-radcliffe-desk']);
});

test('the entry.film field opens the council films; Partition stays artPending (its tests require it)', () => {
  const by = (id: string) => DOSSIERS.find(d => d.id === id)!;
  for (const id of ['frederick-douglass', 'christianity-in-persia', 'partition-1947']) assert.equal(typeof by(id).film, 'function', id);
  assert.equal(by('partition-1947').artPending, true);
});
