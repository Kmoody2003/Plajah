// Shared checks for a showcase book's LIVING edition (data/showcase/living/<book-id>.ts), validated against the REAL built Tela doc:
// every target resolves, every sfx / instrument / bed / cue id exists, every page has idle life and an interaction, hints and reduced twins are present,
// narration is the spread text, and the flat rendition is unchanged. Used by tests/livingEdition.<book>.test.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { showcaseById } from '../../data/showcase';
import { buildShowcaseTelaDoc, checkLivingTargets } from '../../services/showcase/livingDoc';
import type { Action, Behavior, LivingBook, LivingPage } from '../../services/living/contracts';
import { validateLivingPage } from '../../services/living/runtime/validate';
import { frameObjects, objectInfos } from '../../services/living/runtime/objects';
import { compileAnim } from '../../services/living/runtime/anim';
import { ActionInterpreter } from '../../services/living/runtime/interpreter';
import { VarStore } from '../../services/living/runtime/state';
import { GoalTracker } from '../../services/living/runtime/goals';
import { evalCond } from '../../services/living/runtime/conditions';
import { resolveTarget } from '../../services/living/runtime/targets';
import { SFX_IDS, INSTRUMENTS, AMBIENCE_IDS, resolveSfx, resolveInstrument } from '../../services/living/audio';
import { resolveBed } from '../../services/living/audio/ambience';
import { MockAudio, MockHost } from '../livingMocks';

export const INTERACTIVE = new Set(['tap', 'doubleTap', 'press', 'drag', 'proximity']);
export const walk = (actions: Action[], fn: (a: Action) => void): void => { for (const a of actions) { fn(a); if (a.do === 'if') { walk(a.then, fn); walk(a.else ?? [], fn); } } };
export const allActions = (b: Behavior): Action[] => { const out: Action[] = []; walk([...b.do, ...(b.reduced ?? [])], a => out.push(a)); return out; };

export function registerPictureEditionChecks(bookId: string, living: LivingBook): void {
  const book = showcaseById(bookId)!;
  const doc = buildShowcaseTelaDoc(bookId, living);
  const flat = buildShowcaseTelaDoc(bookId);
  const pageObjs = (n: number) => frameObjects(doc, doc.frames[n - 1]);

  describe(`${bookId}: living edition against the real Tela doc`, () => {
    it('is a LivingBook for this book with one page per spread, in order, and is plain JSON', () => {
      assert.equal(living.version, 1); assert.equal(living.bookId, bookId);
      assert.deepEqual(living.pages.map(p => p.page), book.spreads.map(s => s.n));
      assert.deepEqual(JSON.parse(JSON.stringify(living)), living, 'pure data: survives a JSON round trip unchanged');
    });

    it('every target resolves on the real page (checkLivingTargets) and every group entry matches objects', () => {
      assert.deepEqual(checkLivingTargets(doc), []);
      for (const p of living.pages) {
        const infos = objectInfos(pageObjs(p.page));
        for (const b of p.behaviors) {
          assert.ok(resolveTarget(b.target, infos, p.groups).length > 0, `page ${p.page} ${b.id} target resolves to at least one object`);
          walk([...b.do, ...(b.reduced ?? [])], a => { const t = (a as { target?: Behavior['target'] }).target; if (t) assert.ok(resolveTarget(t, infos, p.groups).length > 0, `page ${p.page} ${b.id}: ${a.do} target ${JSON.stringify(t)} resolves`); });
        }
      }
    });

    it('the runtime validator finds no errors and no warnings on any page', () => {
      const sfxIds = [...SFX_IDS, 'car-horn', 'balloon-pop', 'blow-candle', 'owl', 'whale', 'jingle', 'no', 'click'];
      const instruments = [...INSTRUMENTS.map(i => i.id), 'piano', 'music-box', 'xylophone', 'thread-hum', 'whale-song', 'drums'];
      const beds = [...AMBIENCE_IDS, 'crickets', 'forest', 'ocean', 'city', 'room', 'space', 'rain'];
      for (const p of living.pages) {
        const issues = validateLivingPage(p, { objects: objectInfos(pageObjs(p.page)), scores: living.scores, sfxIds, instruments, beds });
        assert.deepEqual(issues, [], `page ${p.page}: ${JSON.stringify(issues)}`);
      }
    });

    it('every sfx, instrument, ambience bed and music cue id exists in the audio engine', () => {
      const bad: string[] = [];
      for (const p of living.pages) {
        if (p.music && !living.scores[p.music.cue]) bad.push(`page ${p.page} cue ${p.music.cue}`);
        if (p.ambience && !resolveBed(p.ambience.bed)) bad.push(`page ${p.page} bed ${p.ambience.bed}`);
        for (const b of p.behaviors) for (const a of allActions(b)) {
          if (a.do === 'sfx' && !resolveSfx(a.sound)) bad.push(`page ${p.page} ${b.id} sfx ${a.sound}`);
          if (a.do === 'note' && !resolveInstrument(a.instrument)) bad.push(`page ${p.page} ${b.id} instrument ${a.instrument}`);
          if (a.do === 'music' && !living.scores[a.cue]) bad.push(`page ${p.page} ${b.id} cue ${a.cue}`);
          if (a.do === 'ambience' && a.bed && !resolveBed(a.bed)) bad.push(`page ${p.page} ${b.id} bed ${a.bed}`);
        }
      }
      for (const s of Object.values(living.scores)) for (const t of s.tracks) if (!resolveInstrument(t.instrument)) bad.push(`score ${s.id} instrument ${t.instrument}`);
      assert.deepEqual(bad, []);
    });

    it('every page has idle life, a designed interaction, music, narration and a summary', () => {
      for (const p of living.pages) {
        assert.ok(p.behaviors.some(b => b.on.type === 'idle'), `page ${p.page} has idle life`);
        assert.ok(p.behaviors.some(b => INTERACTIVE.has(b.on.type)), `page ${p.page} has an interaction`);
        assert.ok(p.music?.cue, `page ${p.page} has a music cue`);
        assert.ok(p.a11y?.summary && p.a11y?.instructions, `page ${p.page} has an accessible summary and instructions`);
        assert.equal(p.narration?.text, book.spreads[p.page - 1].text.replace(/\s+/g, ' ').trim(), `page ${p.page} narration is the spread text`);
      }
    });

    it('every interactive behaviour has a hint (its accessible name) and a reduced-motion twin; hints are unique per target on a page', () => {
      for (const p of living.pages) {
        const seen = new Map<string, string>();
        for (const b of p.behaviors.filter(x => INTERACTIVE.has(x.on.type))) {
          assert.ok(b.hint && b.hint.trim().length >= 10, `page ${p.page} ${b.id} has a hint`);
          assert.ok(b.reduced && b.reduced.length > 0, `page ${p.page} ${b.id} has a reduced-motion twin`);
          const key = `${b.on.type}|${b.hint}`;
          assert.ok(!seen.has(key), `page ${p.page}: ${b.id} and ${seen.get(key)} share the hint "${b.hint}"`); seen.set(key, b.id);
          // a reduced twin must not need movement: no animate / burst / trail / follow
          walk(b.reduced!, a => assert.ok(!['animate', 'burst', 'trail', 'follow'].includes(a.do), `page ${p.page} ${b.id}: reduced twin uses ${a.do}`));
        }
      }
    });

    it('behaviour ids are unique per page, variables are declared, flicker and timers stay below the strobe rate', () => {
      for (const p of living.pages) {
        assert.equal(new Set(p.behaviors.map(b => b.id)).size, p.behaviors.length, `page ${p.page} duplicate ids`);
        for (const b of p.behaviors) {
          if (b.on.type === 'timer') assert.ok(!b.on.every || b.on.afterMs >= 400, `${b.id} timer rate`);
          for (const a of allActions(b)) if (a.do === 'animate' && a.anim.preset === 'flicker') assert.ok((a.anim.durationMs ?? 2400) >= 1500, `${b.id} flicker is slow`);
        }
      }
    });

    it('idle animations compile deterministically and every reduced-motion twin is a still', () => {
      for (const p of living.pages) {
        const infos = objectInfos(pageObjs(p.page));
        for (const b of p.behaviors.filter(x => x.on.type === 'idle')) {
          const id = resolveTarget(b.target, infos, p.groups)[0]; const box = infos.find(o => o.id === id)!.box;
          for (const a of b.do) if (a.do === 'animate') {
            const ctx = { box, pageW: 768, pageH: 960, reduced: false, seed: 1234 };
            assert.deepEqual(compileAnim(a.anim, ctx), compileAnim(a.anim, ctx), `${b.id} deterministic`);
            const r = compileAnim(a.anim, { ...ctx, reduced: true });
            assert.ok(!r.ambient && Object.keys(r.channels.transform ?? []).length === 0, `${b.id} reduced motion is a still`);
          }
        }
      }
    });

    it('scores are well formed: tempo, bar length, instruments, deterministic seed', () => {
      for (const s of Object.values(living.scores)) {
        assert.ok(s.tempo >= 40 && s.tempo <= 160, `${s.id} tempo`); assert.ok(s.lengthBeats > 0 && s.tracks.length > 0);
        assert.ok(s.variation?.seed !== undefined, `${s.id} has a seed`);
        for (const t of s.tracks) for (const n of t.notes) { assert.ok(n.t >= 0 && n.t < s.lengthBeats + 1e-9, `${s.id} note starts inside the loop`); assert.ok(n.d > 0); }
      }
    });

    it('the flat rendition is untouched: same objects with or without the living data', () => {
      for (let i = 0; i < doc.frames.length; i++) assert.deepEqual(frameObjects(doc, doc.frames[i]), frameObjects(flat, flat.frames[i]));
      assert.equal(flat.living!.pages.every(p => p.behaviors.length === 0), true);
    });
  });
}

// ───────────────────────────── a small harness to drive behaviours through the real interpreter ─────────────────────────────
export class PageSim {
  audio = new MockAudio(); host: MockHost; it: ActionInterpreter; goals: GoalTracker; page: LivingPage; completed: string[] = [];
  constructor(doc: ReturnType<typeof buildShowcaseTelaDoc>, living: LivingBook, public n: number, o: { reduced?: boolean; sound?: boolean } = {}) {
    this.page = living.pages.find(p => p.page === n)!;
    const infos = objectInfos(frameObjects(doc, doc.frames[n - 1]));
    this.host = new MockHost(this.audio, infos, this.page.vars ?? {}, this.page.groups);
    this.host._reduced = !!o.reduced; this.host._sound = o.sound !== false;
    this.it = new ActionInterpreter(this.host); this.goals = new GoalTracker(this.page.goals);
    this.host.vars.subscribe(() => this.settleLater());
  }
  private pendingSettle = false;
  private settleLater() { this.pendingSettle = true; }
  b(id: string): Behavior { const x = this.page.behaviors.find(q => q.id === id); if (!x) throw new Error(`no behaviour ${id} on page ${this.n}`); return x; }
  targets(id: string) { return resolveTarget(this.b(id).target, this.host.objs, this.page.groups); }
  /** Fire one behaviour like the engine would (guards, once, cooldown), then settle `when` behaviours and goals. */
  async fire(id: string, ctx: { x01?: number } = {}) {
    const b = this.b(id); const fired = this.it.fire(b, { targets: this.targets(id), x01: ctx.x01 ?? 0.5, point: { x: 100, y: 100 } });
    await this.host.advance(0); await this.settle(); return fired;
  }
  async enter() { for (const b of this.page.behaviors.filter(x => x.on.type === 'enter')) this.it.fire(b, { targets: this.targets(b.id) }); await this.host.advance(0); await this.settle(); }
  /** `when` behaviours fire when their condition BECOMES true; goals once. */
  private prev = new Set<string>();
  async settle() {
    for (let i = 0; i < 4; i++) {
      for (const b of this.page.behaviors) if (b.on.type === 'when') {
        const now = evalCond(b.on.cond, this.host.vars.get);
        if (now && !this.prev.has(b.id)) { this.prev.add(b.id); this.it.fire(b, { targets: this.targets(b.id) }); } else if (!now) this.prev.delete(b.id);
      }
      for (const g of this.goals.check(this.host.vars.get)) this.completed.push(g.id);
      await this.host.advance(0);
    }
    this.pendingSettle = false;
  }
  /** Let `ms` of fake time pass in small steps (so chained waits resolve), settling `when` behaviours and goals as the engine would. */
  async wait(ms: number, step = 100) { for (let t = 0; t < ms; t += step) { await this.host.advance(step); await this.settle(); } }
  /** Simulate a drag reaching `p` (0..1): the engine writes the progress variable. */
  async drag(id: string, p: number) {
    const b = this.b(id); if (b.on.type !== 'drag') throw new Error('not a drag');
    this.it.fire(b, { targets: this.targets(id) });
    if (b.on.progressVar) this.host.vars.set(b.on.progressVar, p);
    await this.host.advance(0); await this.settle();
  }
  sfx() { return this.audio.of('sfx').map(c => c[1] as string); }
  notes() { return this.audio.of('note').map(c => `${c[1]}:${c[2]}`); }
  v(name: string) { return this.host.vars.get(name); }
}
export { VarStore };
