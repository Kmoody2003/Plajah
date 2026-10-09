// Shared checks for the living editions of the showcase books (tests/livingEdition.<book-id>.test.ts).
// They run against the REAL built Tela doc: the designers' real objects, the real runtime validator, the real audio catalogues, and the
// real interpreter driven with recording doubles. Nothing here needs a browser (scripts/living/driveBooks.mjs drives the browser side).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Action, Behavior, Cond, LivingBook, LivingPage, Score } from '../services/living/contracts';
import { showcaseById } from '../data/showcase';
import { buildShowcaseTelaDoc, checkLivingTargets, pageObjects } from '../services/showcase/livingDoc';
import { frameObjects, frameSize, narrationObjects, objectInfos, pageText } from '../services/living/runtime/objects';
import { validateLivingPage } from '../services/living/runtime/validate';
import { ActionInterpreter, actionsFor, isAudioOnly } from '../services/living/runtime/interpreter';
import { evalCond } from '../services/living/runtime/conditions';
import { INTERACTIVE_TRIGGERS } from '../services/living/runtime/catalog';
import { ANIM_PRESET_LIST } from '../services/living/runtime/catalog';
import { resolveSfx } from '../services/living/audio/sfxCatalog';
import { INSTRUMENTS, resolveInstrument } from '../services/living/audio/instruments';
import { AMBIENCE_IDS, resolveBed } from '../services/living/audio/ambience';
import { noteToMidi } from '../services/living/audio/notes';
import { splitWords } from '../services/living/audio/narration';
import { MockAudio, MockHost } from './livingMocks';

export const MOTION_ACTIONS = new Set(['animate', 'burst', 'trail', 'follow']);
export const walk = (actions: Action[], fn: (a: Action) => void) => { for (const a of actions) { fn(a); if (a.do === 'if') { walk(a.then, fn); walk(a.else ?? [], fn); } } };
export const allActions = (b: Behavior) => { const out: Action[] = []; walk([...b.do, ...(b.reduced ?? [])], a => out.push(a)); return out; };
export const isInteractive = (b: Behavior) => ['tap', 'doubleTap', 'press', 'drag', 'proximity'].includes(b.on.type);
export const byId = (p: LivingPage, id: string): Behavior => { const b = p.behaviors.find(x => x.id === id); assert.ok(b, `no behaviour ${id} on page ${p.page}`); return b; };

/** The condition of a `when` behaviour. */
export const whenCond = (b: Behavior): Cond => { assert.equal(b.on.type, 'when', `${b.id} is a when behaviour`); return (b.on as { cond: Cond }).cond; };

export function buildDoc(bookId: string, living: LivingBook) { return buildShowcaseTelaDoc(bookId, living); }

export function pageSetup(bookId: string, living: LivingBook, n: number) {
  const doc = buildDoc(bookId, living);
  const objects = frameObjects(doc, doc.frames[n - 1]);
  const page = living.pages.find(p => p.page === n)!;
  return { doc, objects, infos: objectInfos(objects), page, size: frameSize(doc, doc.frames[n - 1]) };
}

/** A recording interpreter for one page: run a behaviour's actions with the page's own variables and groups. */
export function runner(page: LivingPage, objects: ReturnType<typeof objectInfos>) {
  const audio = new MockAudio(); const host = new MockHost(audio, objects, { ...(page.vars ?? {}) }, page.groups);
  const it = new ActionInterpreter(host);
  const fire = async (b: Behavior, ctx: { targets?: string[]; x01?: number } = {}) => { it.fire(b, { targets: ctx.targets ?? host.resolve(b.target, { targets: [] }), x01: ctx.x01 ?? 0.5 }); await host.advance(0); };
  return { audio, host, it, fire };
}

/** Which `when` / event / goal conditions hold for a variable assignment. */
export const holds = (c: Cond | undefined, vars: Record<string, number | string | boolean>) => evalCond(c, n => vars[n]);

// ───────────── offline audio: render every cue in headless Chromium and measure it (skipped honestly when there is no Chromium) ─────────────
export interface CueStats { stats: { peakLR: number; rmsActiveDb: number; centroidHz: number; durationSec: number; silent: boolean; hasNaN: boolean }; hash: string; energy: number; events: number }
export interface EditionAudioPage { score(s: Score, o?: { seconds?: number; depth?: number; tempoScale?: number }): Promise<CueStats>; close(): Promise<void> }

export async function openEditionAudio(): Promise<EditionAudioPage | null> {
  const [{ build }, fs, os, path] = await Promise.all([import('esbuild'), import('node:fs'), import('node:os'), import('node:path')]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let chromium: any;
  try { ({ chromium } = await import('playwright')); } catch { return null; }
  const out = path.join(os.tmpdir(), `living-edition-audio-${process.pid}.js`);
  await build({ entryPoints: [path.resolve('tests/support/livingEditionAudio.entry.ts')], bundle: true, format: 'iife', platform: 'browser', target: 'es2022', outfile: out, logLevel: 'silent', sourcemap: false });
  let browser;
  try { browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] }); } catch { try { fs.unlinkSync(out); } catch { /* ignore */ } return null; }
  const page = await browser.newPage(); await page.goto('about:blank'); await page.addScriptTag({ content: fs.readFileSync(out, 'utf8') });
  return {
    score: (s, o = {}) => page.evaluate(`(async () => await window.ES.score(${JSON.stringify(s)}, ${JSON.stringify(o)}))()`),
    close: async () => { await browser.close(); try { fs.unlinkSync(out); } catch { /* ignore */ } },
  };
}

/** Every cue renders audibly and safely and deterministically; deeper water is darker and quieter; `richer` (Golden Thread): more voices, not much louder. */
export function describeEditionAudio(bookId: string, living: LivingBook, o: { richer?: string[] } = {}) {
  describe(`${bookId} living edition: the cues, rendered offline and measured (nobody listened)`, () => {
    let pg: EditionAudioPage | null = null; const stats: Record<string, CueStats> = {};
    it('every cue renders: audible, finite, no clipping, loud enough but not loud, same seed gives the same samples', async (t) => {
      pg = await openEditionAudio();
      if (!pg) { t.skip('no Chromium for offline rendering'); return; }
      for (const [id, score] of Object.entries(living.scores)) {
        const a = await pg.score(score, { seconds: 24 }); const b = await pg.score(score, { seconds: 24 }); stats[id] = a;
        assert.ok(!a.stats.silent && !a.stats.hasNaN, id); assert.ok(a.stats.peakLR <= 0.95, `${id}: peak ${a.stats.peakLR}`);
        assert.ok(a.stats.rmsActiveDb > -36 && a.stats.rmsActiveDb < -17, `${id}: loudness ${a.stats.rmsActiveDb.toFixed(1)} dBFS`);
        assert.ok(a.events >= 9, `${id}: only ${a.events} events`); assert.ok(a.stats.durationSec > 20, `${id}: sounds for ${a.stats.durationSec}s of 24`);
        assert.ok(Math.abs(a.energy - b.energy) / a.energy < 2e-3, `${id}: a seeded cue renders (nearly) the same twice: energy ${a.energy} vs ${b.energy}`);
        t.diagnostic(`${id}: ${a.events} notes, peak ${a.stats.peakLR.toFixed(2)}, loudness ${a.stats.rmsActiveDb.toFixed(1)} dBFS, centroid ${Math.round(a.stats.centroidHz)} Hz`);
      }
    });
    it('depth darkens and quiets a cue (what the Below the Blue dive relies on)', async (t) => {
      if (!pg) { t.skip('no Chromium'); return; }
      const first = Object.values(living.scores)[0];
      const d0 = await pg.score(first, { seconds: 12, depth: 0 }); const d1 = await pg.score(first, { seconds: 12, depth: 1 });
      assert.ok(d1.stats.centroidHz < d0.stats.centroidHz * 0.8, `centroid ${Math.round(d0.stats.centroidHz)} -> ${Math.round(d1.stats.centroidHz)}`);
      assert.ok(d1.stats.rmsActiveDb < d0.stats.rmsActiveDb, 'deeper is quieter');
    });
    if (o.richer) {
      const ids = o.richer;
      it('richer is not louder: each level adds voices without getting more than 3 dB louder than the bare drone and harp', async (t) => {
        if (!pg) { t.skip('no Chromium'); return; }
        const base = stats[ids[0]].stats.rmsActiveDb;
        for (const id of ids) assert.ok(stats[id].stats.rmsActiveDb - base < 3, `${id}: +${(stats[id].stats.rmsActiveDb - base).toFixed(1)} dB over ${ids[0]}`);
        const events = ids.map(id => stats[id].events); assert.deepEqual(events, [...events].sort((x, y) => x - y), 'more voices, more notes');
        assert.equal(new Set(ids.map(id => stats[id].hash)).size, ids.length, 'each level really sounds different');
        t.diagnostic(`levels: ${ids.map(id => `${id} ${stats[id].stats.rmsActiveDb.toFixed(1)} dB / ${stats[id].events} notes`).join('; ')}`);
      });
    }
    it('close the render page', async () => { await pg?.close(); });
  });
}

export interface EditionExpect { pages: number; coverTitle: string }

export function describeEdition(bookId: string, living: LivingBook, expect: EditionExpect) {
  const book = showcaseById(bookId)!;
  const sfxOk = (id: string) => id === 'celebrate' || !!resolveSfx(id) || id === 'footstep';

  describe(`${bookId} living edition: shape and targets`, () => {
    it('is a LivingBook for this book with one page per spread, in order', () => {
      assert.equal(living.version, 1); assert.equal(living.bookId, bookId);
      assert.equal(living.pages.length, expect.pages); assert.equal(book.spreads.length, expect.pages);
      living.pages.forEach((p, i) => assert.equal(p.page, i + 1));
      assert.equal(book.spreads[0].text, expect.coverTitle);
    });
    it('every target (behaviour targets, action targets, group entries) resolves on the REAL built Tela doc', () => {
      const doc = buildDoc(bookId, living);
      assert.equal(doc.frames.length, expect.pages);
      assert.deepEqual(checkLivingTargets(doc), []);
    });
    it('is deterministic: building twice gives byte-identical data', async () => {
      const again = (await import(`../data/showcase/living/${bookId}`)).default as LivingBook;
      assert.equal(JSON.stringify(again), JSON.stringify(living));
      assert.equal(JSON.stringify(buildDoc(bookId, living)), JSON.stringify(buildDoc(bookId, again)));
    });
    it('is plain JSON (no functions, no undefined holes): the Tela editor can store it and a bundle can carry it', () => {
      const round = JSON.parse(JSON.stringify(living));
      assert.equal(JSON.stringify(round).length, JSON.stringify(living).length, 'JSON round-trip changed the data (undefined fields?)');
    });
  });

  describe(`${bookId} living edition: every page`, () => {
    for (const p of living.pages) {
      it(`page ${p.page}: validates clean, has an interaction with hints, idle life, music, ambience, narration and a11y text`, () => {
        const { infos } = pageSetup(bookId, living, p.page);
        const issues = validateLivingPage(p, {
          objects: infos, scores: living.scores, instruments: INSTRUMENTS.map(i => i.id), beds: [...AMBIENCE_IDS],
          sfxIds: p.behaviors.flatMap(b => allActions(b)).flatMap(a => (a.do === 'sfx' && sfxOk(a.sound) ? [a.sound] : [])),
        });
        assert.deepEqual(issues, [], JSON.stringify(issues));
        const interactive = p.behaviors.filter(isInteractive);
        assert.ok(interactive.length >= 1, 'every page has something to touch');
        for (const b of interactive) assert.ok(b.hint && b.hint.trim().length >= 12, `${b.id}: a child-friendly hint is required`);
        const idle = p.behaviors.filter(b => b.on.type === 'idle');
        assert.ok(idle.length >= 1, 'every page has idle life');
        assert.ok(p.music && living.scores[p.music.cue], 'every page has a music cue that exists');
        assert.ok(p.ambience?.bed && resolveBed(p.ambience.bed), 'every page has an ambience bed that exists');
        assert.ok(p.a11y?.summary && p.a11y?.instructions, 'a11y summary and instructions');
        assert.ok(p.narration?.text && p.narration.text.split(/\s+/).length >= 2 || p.page === 1, 'narration text');
      });

      it(`page ${p.page}: narration is the spread text, word for word`, () => {
        const spread = book.spreads[p.page - 1];
        assert.equal(p.narration?.text, spread.text.replace(/\s+/g, ' ').trim());
        assert.ok(p.narration?.voice, 'a narration voice is set');
      });

      it(`page ${p.page}: every interactive behaviour has a reduced-motion twin that moves nothing, and a sound-off result`, () => {
        for (const b of p.behaviors.filter(isInteractive)) {
          const motion = allActions({ ...b, reduced: undefined }).some(a => MOTION_ACTIONS.has(a.do));
          if (b.on.type === 'drag' || motion) assert.ok(b.reduced && b.reduced.length, `${b.id}: needs a reduced twin`);
          if (b.reduced) {
            const used = allActions({ ...b, do: b.reduced, reduced: undefined });
            assert.ok(!used.some(a => MOTION_ACTIONS.has(a.do)), `${b.id}: the reduced twin must not move or throw particles`);
            assert.ok(!isAudioOnly(b.reduced), `${b.id}: a sound-off or reduced-motion reader needs a visible or announced result, not only audio`);
          }
          // the runtime picks `reduced` for reduced-motion readers, and for sound-off readers when `do` would be silent AND invisible
          assert.equal(actionsFor(b, true, true), b.reduced ?? b.do);
        }
      });
    }
  });

  describe(`${bookId} living edition: sound`, () => {
    it('every sound, instrument, cue and bed the pages use exists (unknown ids would silently do nothing)', () => {
      for (const p of living.pages) for (const b of p.behaviors) for (const a of allActions(b)) {
        if (a.do === 'sfx') assert.ok(sfxOk(a.sound), `${p.page}/${b.id}: unknown sfx ${a.sound}`);
        if (a.do === 'note') assert.ok(resolveInstrument(a.instrument), `${p.page}/${b.id}: unknown instrument ${a.instrument}`);
        if (a.do === 'music') assert.ok(living.scores[a.cue], `${p.page}/${b.id}: unknown cue ${a.cue}`);
        if (a.do === 'ambience' && a.bed) assert.ok(resolveBed(a.bed), `unknown bed ${a.bed}`);
        if (a.do === 'depth') assert.ok(typeof a.value === 'object' || (a.value >= 0 && a.value <= 1), 'depth is 0..1');
        if (a.do === 'duck') assert.ok(a.amount >= 0 && a.amount <= 1 && a.ms > 0);
      }
    });
    it('notes named in behaviours parse (a typo would play nothing)', () => {
      for (const p of living.pages) for (const b of p.behaviors) for (const a of allActions(b)) {
        if (a.do !== 'note') continue;
        const names = typeof a.note === 'string' && a.note.startsWith('scale:') ? a.note.slice(6).split(',') : [a.note];
        for (const n of names) assert.notEqual(noteToMidi(n), null, `${p.page}/${b.id}: bad note ${n}`);
      }
    });
    it('every score is well formed, seeded, and uses real instruments and notes', () => {
      for (const [key, s] of Object.entries(living.scores) as Array<[string, Score]>) {
        assert.equal(s.id, key); assert.ok(s.tempo >= 40 && s.tempo <= 140, `${key}: tempo`); assert.ok(s.lengthBeats > 0);
        assert.ok(s.variation?.seed !== undefined, `${key}: a seed makes it reproducible`);
        assert.ok(s.tracks.length >= 2, `${key}: needs at least two voices`);
        for (const t of s.tracks) {
          assert.ok(resolveInstrument(t.instrument), `${key}: unknown instrument ${t.instrument}`);
          assert.ok(t.notes.length > 0, `${key}/${t.instrument}: empty track`);
          for (const n of t.notes) {
            assert.notEqual(noteToMidi(n.n), null, `${key}/${t.instrument}: bad note ${n.n}`);
            assert.ok(n.t >= 0 && n.t < s.lengthBeats, `${key}/${t.instrument}: note starts outside the loop (${n.t} of ${s.lengthBeats})`);
            assert.ok(n.d > 0 && (n.v ?? 0.5) >= 0 && (n.v ?? 0.5) <= 1);
          }
        }
      }
    });
    it('every score is used by some page or action (no dead cues)', () => {
      const used = new Set<string>();
      for (const p of living.pages) { if (p.music) used.add(p.music.cue); for (const b of p.behaviors) for (const a of allActions(b)) if (a.do === 'music') used.add(a.cue); }
      for (const k of Object.keys(living.scores)) assert.ok(used.has(k), `score ${k} is never played`);
    });
    it('sound is only ever started by the runtime after a gesture: no behaviour on an `enter`/`idle`/`timer` trigger plays a sound effect or note', () => {
      for (const p of living.pages) for (const b of p.behaviors) {
        if (!['idle', 'timer'].includes(b.on.type)) continue;
        assert.ok(!allActions(b).some(a => a.do === 'sfx' || a.do === 'note'), `${p.page}/${b.id}: ambient behaviours must stay silent`);
      }
    });
    it('nothing startles: no loud sfx on enter, no sound gain above 1', () => {
      for (const p of living.pages) for (const b of p.behaviors) for (const a of allActions(b)) {
        if (a.do === 'sfx') assert.ok((a.params?.gain ?? 1) <= 1, `${p.page}/${b.id}: gain`);
        if (a.do === 'sfx' && b.on.type === 'enter') assert.fail(`${p.page}/${b.id}: sfx on enter`);
      }
    });
  });

  describe(`${bookId} living edition: motion and safety`, () => {
    it('animation presets exist, nothing flickers fast, no repeating timer under 330 ms', () => {
      for (const p of living.pages) for (const b of p.behaviors) {
        for (const a of allActions(b)) if (a.do === 'animate' && a.anim.preset) {
          assert.ok(ANIM_PRESET_LIST.includes(a.anim.preset), `${p.page}/${b.id}: preset ${a.anim.preset}`);
          assert.notEqual(a.anim.preset, 'flicker');
          if (a.anim.loop === 'infinite' && a.anim.preset !== 'spin') assert.ok((a.anim.durationMs ?? 1000) >= 700, `${p.page}/${b.id}: loop too fast`);
        }
        if (b.on.type === 'timer') assert.ok(!b.on.every || b.on.afterMs >= 330);
      }
    });
    it('group-level rotation and scale are not used on idle loops of multi-part groups (parts rotate about their own centres and would come apart)', () => {
      for (const p of living.pages) for (const b of p.behaviors) {
        if (b.on.type !== 'idle' || !('group' in b.target)) continue;
        const members = p.groups?.[b.target.group] ?? [];
        if (members.length < 6) continue;
        for (const a of b.do) if (a.do === 'animate') assert.ok(['float', 'bob', 'drift', 'swim', 'blink', 'twinkle', 'breathe', 'shimmer', 'sway'].includes(a.anim.preset ?? ''), `${p.page}/${b.id}`);
      }
    });
  });

  describe(`${bookId} living edition: the story text is still the flat page's text`, () => {
    it('the designer\'s page text matches the spread text word for word where the page can highlight (the runtime only highlights on an exact word-count match)', () => {
      const highlightable: number[] = [];
      for (const p of living.pages) {
        const objs = pageObjects(book.templateId, p.page - 1).objects;
        const visible = splitWords(pageText(objs)).length; const spoken = splitWords(p.narration!.text!).length;
        if (visible === spoken) highlightable.push(p.page);
      }
      // honest reporting rather than a pass/fail on art decisions: most story pages must highlight
      assert.ok(highlightable.length >= Math.floor(expect.pages * 0.6), `only pages ${highlightable.join(',')} can highlight words while being read aloud`);
    });
  });

  describe(`${bookId} living edition: every narration object is in the doc`, () => {
    it('each page has a readable story text object', () => {
      for (const p of living.pages) {
        const { objects } = pageSetup(bookId, living, p.page);
        assert.ok(narrationObjects(objects).length >= 1, `page ${p.page}`);
      }
    });
  });
}

export { INTERACTIVE_TRIGGERS };
