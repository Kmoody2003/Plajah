import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { allLibraryGraphics, libraryGraphic, findCgGraphic, searchCg, cgDragPayload, CG_LIBRARY_SIZE } from '../services/fabula/cg/cgLibrary';
import { CG_PACKAGES } from '../services/fabula/cg/cgPackages';
import { CG_ARCHETYPES } from '../services/fabula/cg/cgArchetypes';
import { evaluateCg, cgSafeAreaViolations, cgDefaultDuration, parseDuration, formatClock, clockText, fillTemplate } from '../services/fabula/cg/cgEvaluate';
import { CgPlayout, drawListAt, defaultSlotFor, runCommand } from '../services/fabula/cg/cgPlayout';
import { CG_COUNCILS, cgMember } from '../services/fabula/cg/cgCouncil';
import { CG_CATEGORIES, CG_DRAG_MIME } from '../services/fabula/cg/cgTypes';
import { FONTS } from '../services/tela/telaFonts';

describe('Fabula CG library', () => {
  it('builds every package × archetype with unique ids', () => {
    const all = allLibraryGraphics();
    assert.equal(all.length, CG_PACKAGES.length * CG_ARCHETYPES.length);
    assert.equal(all.length, CG_LIBRARY_SIZE);
    assert.ok(all.length >= 900, `library has ${all.length}`);
    assert.equal(new Set(all.map(g => g.id)).size, all.length);
  });

  it('covers every category and gives each package a full kit', () => {
    const cats = new Set(allLibraryGraphics().map(g => g.category));
    for (const c of CG_CATEGORIES) assert.ok(cats.has(c.id), `no graphic in ${c.id}`);
    for (const pk of CG_PACKAGES) {
      const mine = allLibraryGraphics().filter(g => g.packageId === pk.id);
      for (const need of ['lower-third', 'full-page', 'transition', 'bug', 'ticker', 'scoreboard']) assert.ok(mine.some(g => g.category === need), `${pk.id} lacks ${need}`);
    }
  });

  it('uses only Tela fonts and credits real council members', () => {
    for (const pk of CG_PACKAGES) {
      for (const f of Object.values(pk.fonts)) assert.ok(f in FONTS, `${pk.id}: font ${f} is not a Tela font`);
      assert.ok(cgMember('art', pk.art), `${pk.id}: unknown art director ${pk.art}`);
      assert.ok(cgMember('motion', pk.motionLead), `${pk.id}: unknown motion director ${pk.motionLead}`);
      assert.ok(cgMember('roster', pk.hand), `${pk.id}: unknown roster member ${pk.hand}`);
    }
    for (const g of allLibraryGraphics()) for (const l of g.layers) if (l.style) assert.ok(l.style.font in FONTS, `${g.id}/${l.id}: ${l.style.font}`);
  });

  it('mirrors council ids from the source rosters', () => {
    const art = readFileSync(new URL('../services/council/councilTypes.ts', import.meta.url), 'utf8');
    for (const m of CG_COUNCILS.art.members) assert.ok(art.includes(`'${m.id}'`), `art council has no ${m.id}`);
    const motion = readFileSync(new URL('../services/motion/council/motionCouncilTypes.ts', import.meta.url), 'utf8');
    for (const m of CG_COUNCILS.motion.members) assert.ok(motion.includes(`'${m.id}'`), `motion council has no ${m.id}`);
    const roster = readFileSync(new URL('../services/motion/council/motionRoster.ts', import.meta.url), 'utf8');
    for (const m of CG_COUNCILS.roster.members) assert.ok(roster.includes(`id: '${m.id}', name: '${m.name}'`), `roster has no ${m.id} (${m.name})`);
    const music = readFileSync(new URL('../services/melos/council/musicCouncilTypes.ts', import.meta.url), 'utf8');
    for (const m of CG_COUNCILS.music.members) assert.ok(music.includes(`'${m.id}'`), `music council has no ${m.id}`);
  });

  it('keeps keyed graphics inside title-safe', () => {
    const bad = allLibraryGraphics().flatMap(g => cgSafeAreaViolations(g).map(id => `${g.id}/${id}`));
    assert.deepEqual(bad, []);
  });

  it('has a resting frame, a clean exit, and fields every text placeholder can resolve', () => {
    for (const g of allLibraryGraphics()) {
      const rest = evaluateCg(g, g.timing.in + .5, Infinity, null, { now: 0 });
      assert.ok(rest.layers.length > 0, `${g.id} draws nothing at rest`);
      if (g.live !== 'transition') assert.equal(rest.phase, 'hold', `${g.id} not holding after its IN`);
      const D = cgDefaultDuration(g);
      assert.equal(evaluateCg(g, D, D).phase, 'done');
      const keys = new Set(g.fields.map(f => f.key));
      for (const l of g.layers) for (const m of (l.text || '').matchAll(/\{(\w+)\}/g)) assert.ok(keys.has(m[1]), `${g.id}/${l.id} uses {${m[1]}} with no field`);
      for (const l of g.layers) if (l.ticker) assert.ok(keys.has(l.ticker.field), `${g.id}/${l.id} ticker field`);
    }
  });

  it('fully covers the frame at a transition cut point', () => {
    for (const g of allLibraryGraphics().filter(x => x.live === 'transition')) {
      assert.ok(g.timing.cutPoint != null && g.timing.cutPoint > 0, `${g.id} has no cut point`);
      const f = evaluateCg(g, g.timing.cutPoint!, g.timing.in + g.timing.out);
      const covering = f.layers.some(r => r.opacity > .95 && r.x <= 0 && r.y <= 0 && r.x + r.w * r.sx >= 1920 && r.y + r.h * r.sy >= 1080 && !r.clip)
        || (g.archetype === 'tr-shutter' && f.layers.filter(r => r.opacity > .95).length === 8)
        || (g.archetype === 'tr-slash' && f.layers.filter(r => r.layer.kind === 'rect' && r.opacity > .95).length === 2)
        || (g.archetype === 'tr-logo' && f.layers.some(r => r.layer.kind === 'rect' && r.w >= 1920 && r.opacity > .95));
      assert.ok(covering, `${g.id} does not cover the frame at its cut`);
    }
  });

  it('evaluates fast enough for real-time playout', () => {
    const g = libraryGraphic('apex.lt-breaking')!;
    const t0 = performance.now();
    for (let i = 0; i < 2000; i++) evaluateCg(g, (i % 300) / 60, 10, null, { now: 0 });
    const perFrame = (performance.now() - t0) / 2000;
    assert.ok(perFrame < 1, `evaluate took ${perFrame.toFixed(3)} ms/frame`);
  });

  it('substitutes fields, palette overrides and offsets from a ref', () => {
    const g = libraryGraphic('meridian.lt-strap')!;
    const f = evaluateCg(g, 5, Infinity, { graphicId: g.id, fields: { name: 'Ada Lovelace' }, palette: { accent: '#00ff00' }, offset: { x: 10, y: -20, scale: .9 } });
    assert.ok(f.layers.some(l => l.text === 'ADA LOVELACE'), 'upper-cased name field');
    assert.equal(f.palette.accent, '#00ff00');
    assert.deepEqual(f.offset, { x: 10, y: -20, scale: .9 });
    assert.equal(fillTemplate('{a} · {b}', { a: 'x' }), 'x · ');
  });

  it('runs clocks and countdowns from the clock, not wall time', () => {
    assert.equal(parseDuration('1:30'), 90);
    assert.equal(parseDuration('01:02:03'), 3723);
    assert.equal(formatClock(65), '01:05');
    assert.equal(clockText('countdown', '05:00', 10.2, 0), '04:50');
    assert.equal(clockText('countup', '45:00', 61, 0), '46:01');
  });

  it('searches by text, category and package; resolves inline user graphics', () => {
    assert.ok(searchCg({ text: 'breaking' }).every(g => `${g.name} ${g.tags.join(' ')}`.toLowerCase().includes('breaking')));
    assert.equal(searchCg({ category: 'ticker', includeUser: false }).length, CG_PACKAGES.length);
    assert.equal(searchCg({ packageId: 'sanctuary', includeUser: false }).length, CG_ARCHETYPES.length);
    const custom = { ...libraryGraphic('swiss.lt-minimal')!, id: 'user.test', custom: true };
    assert.equal(findCgGraphic({ graphicId: 'user.test', inline: custom }), custom);
    const p = cgDragPayload(custom);
    assert.equal(p.kind, 'cg-graphic'); assert.equal(p.ref.inline, custom);
    assert.equal(CG_DRAG_MIME, 'application/x-fabula-cg+json');
  });
});

describe('Fabula CG playout', () => {
  const mk = () => { let now = 1_000_000; const p = new CgPlayout(undefined, () => now); return { p, tick: (ms: number) => { now += ms; }, now: () => now }; };

  it('routes graphics to broadcast slots', () => {
    assert.equal(defaultSlotFor(libraryGraphic('meridian.lt-strap')!), 'L1');
    assert.equal(defaultSlotFor(libraryGraphic('meridian.tk-crawl')!), 'TICKER');
    assert.equal(defaultSlotFor(libraryGraphic('meridian.bug-live')!), 'BUG');
    assert.equal(defaultSlotFor(libraryGraphic('meridian.fp-headline')!), 'FULL');
    assert.equal(defaultSlotFor(libraryGraphic('meridian.tr-panels')!), 'STINGER');
  });

  it('takes, holds, replaces and outs a slot', () => {
    const { p, tick, now } = mk();
    const a = p.take({ graphicId: 'meridian.lt-strap' })!;
    tick(3000);
    let list = drawListAt(p.state, now());
    assert.equal(list.length, 1); assert.equal(list[0].D, Infinity); assert.ok(Math.abs(list[0].t - 3) < 1e-9);
    // Taking into the same slot animates the old one out while the new one comes in.
    p.take({ graphicId: 'apex.lt-strap' });
    list = drawListAt(p.state, now());
    assert.equal(list.length, 2);
    const old = p.state.onAir.find(x => x.uid === a.uid)!;
    assert.equal(old.outAt, now());
    tick(5000);
    assert.equal(drawListAt(p.state, now()).length, 1, 'old graphic finished its OUT');
    p.out('L1');
    tick(3000);
    assert.equal(drawListAt(p.state, now()).length, 0);
  });

  it('runs a rundown with cue / take-preview / live field updates', () => {
    const { p } = mk();
    p.addToRundown({ graphicId: 'stadium.sb-strip' });
    p.addToRundown({ graphicId: 'stadium.lt-kicker', fields: { name: 'Coach Reyes' } });
    assert.equal(p.preview?.ref.graphicId, 'stadium.sb-strip');
    p.takePreview();
    assert.equal(p.state.cursor, 1, 'cursor advanced');
    p.updateFields('stadium.sb-strip', { hs: '3' });
    assert.equal(p.state.onAir[0].ref.fields?.hs, '3');
    runCommand(p, { op: 'takePreview' });
    assert.equal(p.state.onAir.filter(a => a.outAt == null).length, 2);
    runCommand(p, { op: 'clear' });
    assert.equal(p.state.onAir.length, 0);
  });

  it('auto-outs transitions after the cut and fires the cut callback', async () => {
    const p = new CgPlayout();
    let cuts = 0; p.onCut(() => { cuts++; });
    const r = p.take({ graphicId: 'neon-grid.tr-iris' })!;
    assert.ok(r.cutAt! > Date.now());
    const item = p.state.onAir[0];
    assert.ok(item.outAt != null, 'transition schedules its own OUT');
    await new Promise(res => setTimeout(res, (r.graphic.timing.cutPoint! * 1000) + 80));
    assert.equal(cuts, 1);
    p.dispose();
  });
});
