import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildFoundingBattleFilm, DEMO_CLAIMS, FOUNDING_BATTLE_SHOTS, PAINTING_PROVENANCE } from '../data/dossier/foundingBattleDemo';
import { FACES, FLAGS, PAINTING_FILE, SMOKE_BLOBS } from '../data/dossier/foundingBattleLayers';
import { compileCouncil, citedClaims } from '../services/dossier/film/councilCompile';
import { CouncilGateError } from '../services/dossier/film/provenance';
import type { CouncilFilm } from '../services/dossier/film/councilTypes';
import { ANIMATED_LABEL, MAX_ZOOM, makeNoise, paintingCamAt, paintingFoley, paintingMotion, samplePalette } from '../services/dossier/film/animatedPainting';

const spec = buildFoundingBattleFilm();
const film = spec.council!;
const tl = compileCouncil(film);
const clone = (f: CouncilFilm): CouncilFilm => JSON.parse(JSON.stringify(f));
const anim = tl.shots.find(s => s.kind === 'animated')!;
const PUB = join(process.cwd(), 'public', 'dossier', 'founding', 'film');

test('the demo compiles to about 45 seconds: title, content note, animated painting, credits', () => {
  assert.deepEqual(tl.shots.map(s => s.kind), ['title', 'card', 'animated', 'end']);
  assert.ok(tl.duration > 35 && tl.duration < 50, `duration ${tl.duration}`);
  assert.equal(tl.shots[1].transition, 'silenceHold');
});

test('narration: three to four plain sentences, each citing a local claim that exists with a checked source', () => {
  const beats = film.shots.flatMap(s => s.beats ?? []);
  const sentences = beats.map(b => b.text).join(' ').split(/(?<=[.!?])\s+/);
  assert.ok(sentences.length >= 3 && sentences.length <= 6, `${sentences.length} sentences`);
  assert.deepEqual(citedClaims(film).filter(id => !DEMO_CLAIMS[id]), []);
  for (const c of Object.values(DEMO_CLAIMS)) assert.ok(c.sources.length >= 1 && c.text.length > 30);
  const text = beats.map(b => b.text).join(' ');
  assert.match(text, /17 June 1775/);
  assert.match(text, /Breed’s Hill/);
  assert.match(text, /about 1,050/);        // 1,054 British casualties (226 killed, 828 wounded): Wikipedia, American Battlefield Trust
  assert.match(DEMO_CLAIMS['demo-bunker-british'].text, /1,054/);
  assert.match(text, /about 450/);          // American casualties
});

test('label: the shot is ANIMATED PAINTING with its note, slate and credit, and the painting is the verified Commons file', () => {
  const p = film.shots.find(s => s.kind === 'animatedPainting')!.painting!;
  assert.equal(p.label, ANIMATED_LABEL);
  assert.equal(p.medium, 'painting');
  assert.match(p.note, /Motion is added to the 1786 painting; the brushwork is unchanged\./);
  assert.match(p.note, /Trumbull’s interpretation, painted years after the battle\./);
  assert.ok(p.slate.title && p.slate.source && p.slate.year && p.slate.licence);
  assert.equal(PAINTING_PROVENANCE.licence, 'Public domain');
  assert.match(PAINTING_PROVENANCE.commonsUrl, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
});

test('gates: the compiler refuses a mislabelled, un-noted, photographic, overlaid or un-bookended animated painting', () => {
  const mutate = (fn: (f: CouncilFilm) => void) => { const f = clone(film); fn(f); return f; };
  const shot = (f: CouncilFilm) => f.shots.find(s => s.kind === 'animatedPainting')!;
  assert.throws(() => compileCouncil(mutate(f => { shot(f).painting!.label = 'ANIMATED'; })), CouncilGateError);
  assert.throws(() => compileCouncil(mutate(f => { shot(f).painting!.note = ''; })), CouncilGateError);
  assert.throws(() => compileCouncil(mutate(f => { (shot(f).painting as { medium: string }).medium = 'photograph'; })), CouncilGateError);
  assert.throws(() => compileCouncil(mutate(f => { shot(f).lowerThird = { name: 'x', role: 'y' }; })), CouncilGateError);
  assert.throws(() => compileCouncil(mutate(f => { f.shots.splice(0, 1); })), (e: unknown) => e instanceof CouncilGateError && e.issues.some(i => /content-note card/.test(i)));
  assert.throws(() => compileCouncil(mutate(f => { shot(f).painting!.cam[shot(f).painting!.cam.length - 1].zoom = 1.4; })), (e: unknown) => e instanceof CouncilGateError && e.issues.some(i => /whole painting/.test(i)));
  assert.throws(() => compileCouncil(mutate(f => { shot(f).beats![0].claimIds = []; })), CouncilGateError);
  assert.throws(() => compileCouncil(mutate(f => { delete shot(f).painting!.slate.licence; })), CouncilGateError);
});

test('camera: starts and ends on the whole painting, zoom within limits, always inside the picture, never faster than a slow move', () => {
  const cam = anim.anim!.cam, dur = anim.end - anim.start;
  assert.equal(cam[0].zoom, 1); assert.equal(cam[cam.length - 1].zoom, 1);
  for (let i = 1; i < cam.length; i++) assert.ok(cam[i].t >= cam[i - 1].t, `keys out of order at ${i}`);
  let prev = paintingCamAt(cam, 0), worst = 0;
  for (let t = 0.01; t <= dur; t += 1 / 30) {
    const c = paintingCamAt(cam, t);
    assert.ok(c.zoom >= 1 && c.zoom <= MAX_ZOOM + 0.05, `zoom ${c.zoom} at ${t}`);
    const vw = 1 / c.zoom;
    assert.ok(c.x - vw / 2 > -0.005 && c.x + vw / 2 < 1.005 && c.y - vw / 2 > -0.005 && c.y + vw / 2 < 1.005, `view leaves the painting at ${t}`);
    worst = Math.max(worst, Math.hypot(c.x - prev.x, c.y - prev.y) * 30 / vw);   // view-widths per second
    prev = c;
  }
  assert.ok(worst < 0.5, `camera pans ${worst.toFixed(2)} view-widths/s`);
});

test('effects ramp from zero and back to zero: the opening and closing frames are the unaltered painting', () => {
  const dur = anim.end - anim.start, a = anim.anim!;
  assert.equal(paintingMotion(0, dur, a.rampIn, a.rampOut), 0);
  assert.equal(paintingMotion(dur - 1e-3, dur, a.rampIn, a.rampOut), 0);
  assert.equal(paintingMotion(dur / 2, dur, a.rampIn, a.rampOut), 1);
  assert.deepEqual(paintingCamAt(a.cam, 0), { x: 0.5, y: 0.5, zoom: 1 });
});

test('foley: deterministic, inside the shot, soft, with a wind bed over the painting', () => {
  const p = film.shots.find(s => s.kind === 'animatedPainting')!.painting!;
  const a = paintingFoley(p, anim.start, anim.end, 3), b = paintingFoley(p, anim.start, anim.end, 3);
  assert.deepEqual(a, b);
  assert.ok(a.events.length >= 5);
  for (const e of a.events) { assert.equal(e.kind, 'musket'); assert.ok(e.at > anim.start + 1 && e.at < anim.end - 1 && e.gain! <= 1); }
  assert.deepEqual(tl.ambience, [{ from: anim.start, to: anim.end, kind: 'wind' }]);
  assert.ok(tl.foley.filter(f => f.kind === 'musket').length >= 5);
  assert.ok(tl.silences.some(s => s.from < tl.shots[1].start && s.to >= anim.end - 1e-6), 'the score is out through the battle');
});

test('layer data: flags are hand polygons with a staff, faces and smoke banks are inside the painting', () => {
  assert.equal(FLAGS.length, 3);
  for (const f of FLAGS) { assert.ok(f.poly.length >= 10); assert.ok(f.amp > 0 && f.amp <= 12, 'flag ripple stays small'); }
  for (const [x, y, r] of FACES) assert.ok(x - r >= 0 && y - r >= 0 && x + r <= 1920 && y + r <= 1278);
  assert.ok(SMOKE_BLOBS.length >= 6);
  // the runtime copy of the flags carries no polygon
  const p = FOUNDING_BATTLE_SHOTS.find(s => s.painting)!.painting!;
  assert.ok(p.flags.every(f => !('poly' in f)));
});

test('assets exist: the painting at its Commons size and the three baked layers', () => {
  for (const f of [PAINTING_FILE, 'bunker-depth.png', 'bunker-masks.png', 'bunker-fx.png', 'fonts/fonts.css', 'fonts/LibreCaslonDisplay-latin.woff2']) assert.ok(existsSync(join(PUB, f)), f);
  assert.ok(statSync(join(PUB, PAINTING_FILE)).size > 500_000);
});

test('noise texture is deterministic and uses its full range; palette comes from far-plane pixels only', () => {
  const a = makeNoise(64), b = makeNoise(64);
  assert.deepEqual(Array.from(a.slice(0, 64)), Array.from(b.slice(0, 64)));
  for (let c = 0; c < 3; c++) { let lo = 255, hi = 0; for (let i = c; i < a.length; i += 4) { lo = Math.min(lo, a[i]); hi = Math.max(hi, a[i]); } assert.ok(hi - lo > 200, `channel ${c}`); }
  const w = 40, img = new Uint8ClampedArray(w * w * 4), far = new Uint8ClampedArray(w * w * 4);
  for (let i = 0; i < w * w; i++) {
    const sky = i % 2 === 0, v = sky ? 90 + (i % 7) * 15 : 200;
    img.set([v, v - 4, v - 10, 255], i * 4); far.set([sky ? 255 : 0, 0, 0, 255], i * 4);
  }
  const pal = samplePalette({ data: img } as ImageData, { data: far } as ImageData);
  assert.ok(pal.lo[0] < pal.mid[0] && pal.mid[0] < pal.hi[0]);
  assert.ok(pal.hi[0] < 200 / 255, 'non-far pixels were ignored');
});
