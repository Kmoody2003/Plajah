// Below the Blue: the living edition against the real built Tela doc. `npx tsx --test tests/livingEdition.below-the-blue.test.ts`
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import living from '../data/showcase/living/below-the-blue';
import { byId, describeEdition, describeEditionAudio, holds, pageSetup, runner, walk } from './livingEditionKit';
import type { Action } from '../services/living/contracts';

describeEdition('below-the-blue', living, { pages: 13, coverTitle: 'Below the Blue' });
describeEditionAudio('below-the-blue', living);

const P = (n: number) => living.pages.find(p => p.page === n)!;
const lbl = (n: number, label: string) => pageSetup('below-the-blue', living, n).objects.filter(o => o.objectLabel === label);

describe('Below the Blue: depth drives the water, the dots, the jellies AND the audio', () => {
  it('p4: dragging Coral writes the depth variable, and the page asks the audio engine to follow that variable', async () => {
    const { page, infos } = pageSetup('below-the-blue', living, 4);
    const drag = byId(page, 'p4-dive');
    assert.equal(drag.on.type, 'drag'); assert.equal((drag.on as { progressVar?: string }).progressVar, 'depth');
    assert.deepEqual((drag.on as { axis?: string }).axis, 'y');
    const r = runner(page, infos);
    await r.fire(drag);
    assert.deepEqual(r.audio.of('setDepth').at(-1), ['setDepth', 0], 'depth starts at the surface');
    r.host.vars.set('depth', 0.4); r.host.vars.set('depth', 0.9);
    assert.deepEqual(r.audio.of('setDepth').map(c => c[1]), [0, 0.4, 0.9], 'audio depth follows the variable, live');
    assert.ok(r.audio.of('sfx').some(c => c[1] === 'bubble'));
  });

  it('p4: the water darkens through light zones: exactly one zone holds at every depth, and tint only ever gets darker with depth', () => {
    for (const [n, v, prefix] of [[4, 'depth', 'p4-zone-'], [7, 'dive', 'p7-zone-']] as const) {
      const p = P(n); const zones = p.behaviors.filter(b => b.id.startsWith(prefix));
      assert.ok(zones.length >= 4, `p${n}: at least four zones`);
      let last = -1;
      for (let i = 0; i <= 100; i++) {
        const d = i / 100; const on = zones.filter(z => z.on.type === 'when' && holds(z.on.cond, { [v]: d }));
        assert.equal(on.length, 1, `p${n}: depth ${d} is in ${on.length} zones`);
        const tint = (on[0].do.find(a => a.do === 'set' && 'page' in (a.target ?? {})) as Extract<Action, { do: 'set' }>).props.opacity as number;
        assert.ok(tint >= last - 1e-9, `p${n}: tint falls at depth ${d}`); last = tint;
      }
      assert.ok(last <= 0.4, `p${n}: the deepest tint stays readable (text sits under the overlay)`);
    }
  });

  it('p4: the bioluminescent dots appear only in deep water, driven by the same variable', () => {
    const b = byId(P(4), 'p4-dots-scrub'); const a = b.do[0] as Extract<Action, { do: 'animate' }>;
    assert.equal(a.anim.easing, 'var:depth');
    const kf = a.anim.keyframes!; assert.equal(kf[0].opacity, 0); assert.equal(kf.at(-1)!.opacity, 1);
    assert.ok(kf.find(k => k.at === 0.4)!.opacity === 0, 'still dark at 40%');
  });

  it('p4: Coral rides down to where the third painted Coral sits; her ghosts mark the way', () => {
    const { objects, page } = pageSetup('below-the-blue', living, 4);
    const drag = byId(page, 'p4-dive').on as { bounds?: { maxY?: number } };
    const top = objects.filter(o => o.objectLabel === 'Lifted paper under fish');
    const travel = top[2].y - top[0].y;
    assert.ok(Math.abs((drag.bounds!.maxY ?? 0) - travel) <= 8, `${drag.bounds!.maxY} vs ${travel}`);
    assert.equal(page.groups!.coralEcho.length > 20, true);
  });

  it('p4: tap and keyboard alternatives reach every depth the drag can', async () => {
    const { page, infos } = pageSetup('below-the-blue', living, 4);
    const tap = byId(page, 'p4-dive-tap'); const r = runner(page, infos);
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) { await r.fire(tap); seen.push(r.host.vars.num('depth')); }
    assert.deepEqual(seen, [0.34, 0.67, 1, 1], 'three taps reach the bottom');
    assert.equal(r.audio.of('setDepth').at(-1)![1], 1);
    assert.ok(r.host.of('setProps').some(c => (c[2] as { y?: number }).y! > 400), 'Coral is moved down with the variable');
  });

  it('p7: the jellies are dim at the surface and light up as the dive variable rises; each plays its own chime pitch', async () => {
    const p = P(7);
    const scrub = byId(p, 'p7-glows-scrub').do[0] as Extract<Action, { do: 'animate' }>;
    assert.equal(scrub.anim.easing, 'var:dive'); assert.ok(scrub.anim.keyframes![0].opacity! < 0.5 && scrub.anim.keyframes!.at(-1)!.opacity === 1);
    const { infos } = pageSetup('below-the-blue', living, 7);
    const pitches: number[] = [];
    for (let i = 1; i <= 5; i++) {
      const r = runner(p, infos); await r.fire(byId(p, `p7-tap-jelly${i}`));
      const sfx = r.audio.of('sfx').find(c => c[1] === 'glass-chime'); assert.ok(sfx, `jelly ${i} chimes`);
      pitches.push((sfx![2] as { pitch: number }).pitch);
      assert.ok(r.audio.of('note').some(c => c[1] === 'glass'));
    }
    assert.deepEqual(pitches, [...pitches].sort((a, b) => a - b), 'each jelly a higher chime');
    assert.equal(new Set(pitches).size, 5);
  });

  it('p7: the audio depth steps up through the bands from a deep baseline (it does not jump to the surface)', async () => {
    const p = P(7); const { infos } = pageSetup('below-the-blue', living, 7);
    const r = runner(p, infos); await r.fire(byId(p, 'p7-enter'));
    assert.equal(r.audio.of('setDepth').at(-1)![1], 0.45);
    for (const z of p.behaviors.filter(b => b.id.startsWith('p7-zone-'))) { const set = z.do.find(a => a.do === 'var') as Extract<Action, { do: 'var' }>; r.host.vars.set(set.name, set.value as number); }
    assert.equal(r.audio.of('setDepth').at(-1)![1], 0.92);
  });

  it('every page sets the audio depth on entry (the story sinks, then rises)', () => {
    const depths = living.pages.map(p => p.behaviors.flatMap(b => b.do).flatMap(a => (a.do === 'depth' ? [a] : [])).find(a => typeof a.value === 'number' || a.value.fromVar));
    assert.ok(depths.every(Boolean), 'each page sets depth');
    const num = depths.map(a => (typeof a!.value === 'number' ? a!.value : -1));
    assert.ok(num[5 - 1] > num[2 - 1] && num[10 - 1] < num[5 - 1] && num[11 - 1] <= 0.1, `${num.join(',')}`);
  });
});

describe('Below the Blue: the rest of the toys', () => {
  it('p5: Lumi\'s glow follows the pointer (follow action, bounded so it drifts rather than chases)', () => {
    const f = byId(P(5), 'p5-lumi-follow').do[0] as Extract<Action, { do: 'follow' }>;
    assert.equal(f.to, 'pointer'); assert.ok(f.maxOffset! <= 90 && f.maxOffset! >= 40); assert.ok(f.lagMs! >= 250);
  });

  it('p10: tap = a long whale call; press-and-hold = a held voice (no duration), so the runtime bends it with the finger', async () => {
    const p = P(10); const { infos } = pageSetup('below-the-blue', living, 10);
    const tap = byId(p, 'p10-tap-eye'); const hold = byId(p, 'p10-hold-eye');
    assert.ok(tap.do.some(a => a.do === 'sfx' && a.sound === 'whale-call')); assert.equal(hold.on.type, 'press');
    const note = hold.do.find(a => a.do === 'note') as Extract<Action, { do: 'note' }>;
    assert.equal(note.instrument, 'whale'); assert.equal(note.durationMs, undefined, 'no duration = held voice');
    const r = runner(p, infos); const held: unknown[] = []; r.it.fire(hold, { targets: [], hold: { voices: held as never } }); await r.host.advance(0);
    assert.equal(r.audio.voices.length, 1); assert.ok(r.audio.of('duck').length >= 1, 'the music ducks under the song');
  });

  it('p12: Spot Lumi is a real game: 5 hidden Lumis (lights start dark), each counts once, 5 completes it, jellies counted separately', async () => {
    const p = P(12); const { infos, objects } = pageSetup('below-the-blue', living, 12);
    assert.equal(objects.filter(o => o.objectLabel === 'Lumi glow').length, 5);
    assert.equal(p.vars!.found, 0);
    const r = runner(p, infos);
    for (let i = 1; i <= 5; i++) { await r.fire(byId(p, `p12-find-lumi${i}`)); await r.fire(byId(p, `p12-find-lumi${i}`)); }
    assert.equal(r.host.vars.num('found'), 5, 'a second tap on the same Lumi counts nothing (once)');
    const goal = p.goals!.find(g => g.id === 'found-all-lumis')!;
    assert.equal(holds(goal.when, { found: 4 }), false); assert.equal(holds(goal.when, { found: 5 }), true); assert.equal(goal.celebrate, true);
    for (let i = 1; i <= 4; i++) await r.fire(byId(p, `p12-count-jelly${i}`));
    assert.equal(r.host.vars.num('jellies'), 4);
    assert.equal(holds(p.goals!.find(g => g.id === 'counted-jellies')!.when, { jellies: 4 }), true);
    const said = r.host.of('announce').map(a => a[1]).join(' | ');
    assert.match(said, /Found a Lumi: 5 of 5/); assert.match(said, /Jellies counted: 4 of 4/);
    const hide = byId(p, 'p12-hide-lights');
    assert.deepEqual(hide.do, [{ do: 'set', props: { opacity: 0 } }]);
  });

  it('p12: each hidden Lumi is its own group and lights only its own lights', () => {
    const p = P(12);
    for (let i = 1; i <= 5; i++) {
      const lights = p.groups![`lights${i}`]; const body = p.groups![`lumi${i}`];
      assert.equal(lights.length, 4); assert.ok(lights.every(id => body.includes(id)));
      const b = byId(p, `p12-find-lumi${i}`); assert.deepEqual(b.target, { group: `lumi${i}` });
      assert.ok(b.do.some(a => a.do === 'set' && 'group' in (a.target ?? {}) && (a.target as { group: string }).group === `lights${i}`));
    }
  });

  it('p3: the cloud drag is the whole cloud, goes left and snaps back, scrubbing the hidden sun', () => {
    const p = P(3); const d = byId(p, 'p3-cloud-drag').on as { bounds: { minX: number; maxX: number }; snapBack: boolean; progressVar: string };
    assert.ok(d.bounds.minX <= -200 && d.bounds.maxX === 0 && d.snapBack && d.progressVar === 'peek');
    assert.ok(p.groups!.cloud.length > 25, 'the papers and the grey washes, not only the pale highlights');
    assert.equal((byId(p, 'p3-sun-scrub').do[0] as Extract<Action, { do: 'animate' }>).anim.easing, 'var:peek');
  });

  it('p8: Lumi rises with Coral (scrubbed by the same variable) and the water lightens in stages as you rise', async () => {
    const p = P(8); const { infos } = pageSetup('below-the-blue', living, 8);
    const stages = p.behaviors.filter(b => b.id.startsWith('p8-stage-'));
    const depthOf = (b: typeof stages[number]) => (b.do.find(a => a.do === 'depth') as Extract<Action, { do: 'depth' }>).value as number;
    const ds = stages.map(depthOf); assert.deepEqual(ds, [...ds].sort((a, b) => b - a), 'depth falls as you rise');
    for (let i = 0; i <= 100; i++) assert.equal(stages.filter(s => s.on.type === 'when' && holds(s.on.cond, { rise: i / 100 })).length, 1);
    assert.equal((byId(p, 'p8-lumi-rides').do[0] as Extract<Action, { do: 'animate' }>).anim.easing, 'var:rise');
    const r = runner(p, infos); await r.fire(byId(p, 'p8-rise-tap')); assert.equal(r.host.vars.num('rise'), 0.5);
  });

  it('every drag has a tap alternative on the same target, and every drag writes a progress variable the page declares or reads', () => {
    for (const p of living.pages) for (const d of p.behaviors.filter(b => b.on.type === 'drag')) {
      const t = JSON.stringify(d.target);
      assert.ok(p.behaviors.some(b => b.on.type === 'tap' && JSON.stringify(b.target) === t), `${p.page}/${d.id}: tap alternative`);
      assert.ok((d.on as { progressVar?: string }).progressVar, `${p.page}/${d.id}: progressVar`);
    }
  });

  it('page tint and the live-region announcements use real objects (set on a decorative object is only an announcement)', () => {
    for (const p of living.pages) for (const b of p.behaviors) walk([...b.do, ...(b.reduced ?? [])], a => {
      if (a.do === 'set' && typeof a.props.text === 'string') assert.deepEqual(a.target, { label: 'Paper edge warmth' });
    });
  });
});
