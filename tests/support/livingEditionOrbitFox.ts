// Extra checks for the Orbit Party! and Little Fox, Big Trees living editions, on top of the shared registerEditionChecks (livingEditionChecks.ts):
// groups of ids, scores that expand and play, behaviours that run through the interpreter with the REAL audio mock (unknown ids, sound before unlock),
// and read-aloud order. Everything runs in node, against the real built Tela doc; nothing here needs a browser or an audio device.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { LivingBook } from '../../services/living/contracts';
import { buildShowcaseTelaDoc } from '../../services/showcase/livingDoc';
import { showcaseById } from '../../data/showcase';
import { frameObjects, narrationObjects, objectInfos } from '../../services/living/runtime/objects';
import { ActionInterpreter } from '../../services/living/runtime/interpreter';
import { resolveTarget } from '../../services/living/runtime/targets';
import { ALL_PRESETS } from '../../services/living/runtime/anim';
import { INSTRUMENTS, createMockAudio } from '../../services/living/audio';
import { expandScore } from '../../services/living/audio/sequencer';
import { noteToMidi } from '../../services/living/audio/notes';
import { MockHost } from '../livingMocks';
import { allActions } from './livingEditionChecks';

const INSTRUMENT_IDS = [...INSTRUMENTS.map(i => i.id), 'piano', 'music-box', 'xylophone', 'thread-hum', 'whale-song', 'drums'];

export interface OrbitFoxSpec {
  bookId: string;
  living: LivingBook;
  /** pages where the visible text objects do not split into the same number of words as the narration (a headline drawn letter by letter): no word highlight, audio only */
  noHighlight: number[];
  /** pages whose word COUNT matches the visible text but whose ORDER does not (captions sit above the story): the runtime would highlight the wrong words there. A known runtime gap, listed so it cannot grow. */
  orderMismatch?: number[];
  maxKB?: number;
}

export function defineOrbitFoxChecks(spec: OrbitFoxSpec) {
  const { bookId, living } = spec;
  const book = showcaseById(bookId)!;
  const doc = buildShowcaseTelaDoc(bookId, living);
  const objectsOf = (page: number) => frameObjects(doc, doc.frames[page - 1]);
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

  describe(`${bookId}: groups, scores, behaviours, read-aloud`, () => {
    it('every group is a set of unique, existing object ids (no label patterns, no strays) and every used group is declared on its page', () => {
      for (const p of doc.living!.pages) {
        const ids = new Set(objectsOf(p.page).map(o => o.id));
        for (const [g, entries] of Object.entries(p.groups ?? {})) {
          assert.equal(new Set(entries).size, entries.length, `page ${p.page} group ${g}: repeated ids`);
          for (const e of entries) assert.ok(ids.has(e), `page ${p.page} group ${g}: ${e} is not an object of this page`);
        }
        const used = new Set([...JSON.stringify(p.behaviors).matchAll(/"group":"([^"]+)"/g)].map(m => m[1]));
        for (const g of used) assert.ok(p.groups?.[g], `page ${p.page}: group ${g} is used but not declared`);
        for (const g of Object.keys(p.groups ?? {})) assert.ok(used.has(g), `page ${p.page}: group ${g} is declared but never used`);
      }
    });

    it('uses only runtime presets and never the silent `celebrate` action (its sfx id is not in the catalogue)', () => {
      for (const p of living.pages) {
        for (const b of p.behaviors) for (const a of allActions(b)) {
          if (a.do === 'animate' && a.anim.preset) assert.ok(ALL_PRESETS.includes(a.anim.preset), `unknown preset ${a.anim.preset}`);
          assert.notEqual(a.do, 'celebrate', `page ${p.page} ${b.id}`);
        }
        for (const g of p.goals ?? []) assert.ok(!g.celebrate, `page ${p.page} goal ${g.id}: celebrate:true plays an unknown sfx`);
      }
    });

    it('building twice gives identical JSON, and the living data stays small', () => {
      assert.equal(JSON.stringify(buildShowcaseTelaDoc(bookId, living).living), JSON.stringify(doc.living));
      const kb = JSON.stringify(doc.living).length / 1024;
      assert.ok(kb < (spec.maxKB ?? 160), `living data is ${kb.toFixed(1)} KB`);
    });

    for (const [id, s] of Object.entries(living.scores)) {
      it(`cue "${id}": whole bars, finite notes inside the loop, known instruments, and it schedules the same notes every time`, () => {
        assert.equal(s.id, id);
        assert.ok(s.lengthBeats % (s.beatsPerBar ?? 4) === 0, 'whole bars');
        for (const t of s.tracks) {
          assert.ok(INSTRUMENT_IDS.includes(t.instrument), `instrument ${t.instrument}`);
          assert.ok(t.notes.length > 0, `track ${t.instrument} is empty`);
          for (const n of t.notes) {
            assert.ok(Number.isFinite(n.t) && n.t >= 0 && n.t < s.lengthBeats, `${t.instrument}: note starts outside the loop (${n.t})`);
            assert.ok(Number.isFinite(n.d) && n.d > 0, `${t.instrument}: bad length`);
            assert.ok(n.n === 'x' || noteToMidi(n.n) !== null, `${t.instrument}: unreadable note ${n.n}`);
            if (n.v !== undefined) assert.ok(n.v >= 0 && n.v <= 1, `${t.instrument}: velocity ${n.v}`);
          }
        }
        const span = (s.lengthBeats / s.tempo) * 60 * 2;
        const ev = expandScore(s, span);
        assert.ok(ev.length > 8 && ev.every(e => Number.isFinite(e.time)), 'schedules finite notes over two passes');
        assert.equal(JSON.stringify(expandScore(s, span)), JSON.stringify(ev), 'seeded variation is deterministic');
      });
    }

    for (const p of living.pages) {
      it(`page ${p.page}: every behaviour (and its reduced twin) runs through the interpreter with the real audio mock: no unknown id, no sound before unlock, no throw`, async () => {
        const audio = createMockAudio(); audio.registerScores(living.scores); await audio.unlock();
        const dp = doc.living!.pages.find(q => q.page === p.page)!;
        const objs = objectInfos(objectsOf(p.page));
        for (const reduced of [false, true]) {
          const host = new MockHost(audio as never, objs, dp.vars ?? {}, dp.groups);
          host._reduced = reduced;
          const interp = new ActionInterpreter(host);
          for (const b of dp.behaviors) {
            interp.fire({ ...b, when: undefined, once: false, cooldownMs: 0 }, { targets: resolveTarget(b.target, objs, dp.groups), x01: 0.5, point: { x: 500, y: 380 }, hold: { voices: [] } });
            for (let i = 0; i < 12; i++) await host.advance(6000);
          }
          interp.dispose();
        }
        assert.deepEqual(audio.problems, [], audio.problems.join('; '));
      });
    }

    it('read-aloud: narration is the spread text; the pages that cannot highlight are the headline-by-letter pages; word highlighting lands on the right words everywhere except the listed order mismatches', () => {
      const noHl: number[] = []; const wrongOrder: number[] = [];
      for (const p of living.pages) {
        const visible = narrationObjects(objectsOf(p.page)).flatMap(o => (o.text ?? '').split(/\s+/).filter(Boolean));
        const said = norm(p.narration?.text ?? '').split(' ').filter(Boolean);
        const spread = norm(book.spreads[p.page - 1].text).split(' ').filter(Boolean);
        assert.deepEqual(said, spread, `page ${p.page}: narration is not the spread text`);
        if (visible.length !== said.length) noHl.push(p.page);
        else if (visible.some((w, i) => w !== said[i])) wrongOrder.push(p.page);
      }
      assert.deepEqual(noHl, spec.noHighlight, `pages that cannot highlight: ${noHl.join(', ')}`);
      assert.deepEqual(wrongOrder, spec.orderMismatch ?? [], `pages whose highlight would land on the wrong words: ${wrongOrder.join(', ')}`);
    });
  });
}
