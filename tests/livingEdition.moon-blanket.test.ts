// The LIVING edition of Moon Blanket against the real built Tela doc. `npx tsx --test tests/livingEdition.moon-blanket.test.ts`
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import living from '../data/showcase/living/moon-blanket';
import { buildShowcaseTelaDoc } from '../services/showcase/livingDoc';
import { resolveSfx } from '../services/living/audio';
import { PAGE_ID } from '../services/living/runtime/targets';
import { PageSim, allActions, registerPictureEditionChecks } from './support/livingEditionPicture';

registerPictureEditionChecks('moon-blanket', living);
const doc = buildShowcaseTelaDoc('moon-blanket', living);
const page = (n: number) => living.pages.find(p => p.page === n)!;

describe('moon-blanket: gentle for ages 2-4', () => {
  it('no startle: no loud/startle sounds, quiet gains, no confetti, no drums, nothing faster than a lullaby', () => {
    for (const p of living.pages) for (const b of p.behaviors) for (const a of allActions(b)) {
      if (a.do === 'sfx') { assert.ok(!resolveSfx(a.sound)?.loud, `${b.id} ${a.sound} is not a loud sound`); assert.ok(!['honk', 'pop-balloon', 'rumble', 'pop', 'boing', 'whoosh'].includes(a.sound), `${b.id} uses ${a.sound}`); assert.ok((a.params?.gain ?? 1) <= 0.7, `${b.id} sfx gain ${a.params?.gain}`); }
      if (a.do === 'note') assert.ok((a.gain ?? 1) <= 0.6, `${b.id} note gain`);
      if (a.do === 'burst') assert.notEqual(a.kind, 'confetti');
      assert.notEqual(a.do, 'celebrate', `${b.id} avoids the loud celebrate action`);
    }
    for (const s of Object.values(living.scores)) { assert.ok(s.tempo <= 72); assert.ok(!s.tracks.some(t => /drum|kick|snare|hat/.test(t.instrument))); }
  });

  it('the lullaby slows page by page: musicTempo drops on every page of the story', () => {
    const scales = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => { const a = page(n).behaviors.find(b => b.id === `p${n}-tempo`)!.do[0]; assert.equal(a.do, 'musicTempo'); return (a as { scale: number }).scale; });
    for (let i = 1; i < scales.length; i++) assert.ok(scales[i] < scales[i - 1], `page ${i + 1} is slower than page ${i}`);
    assert.ok(scales[8] <= 0.7);
    assert.deepEqual(living.pages.slice(0, 9).map(p => p.music?.cue), Array(9).fill('lullaby'), 'one continuing cue so the tune only slows');
    assert.equal(page(10).music?.cue, 'goodnight');
  });

  it('the moon\'s smile grows through the book', () => {
    const grow = (n: number) => { const b = page(n).behaviors.find(x => x.id === `p${n}-smile`); const a = b?.do[0]; return a && a.do === 'set' ? a.props.scale! : 1; };
    const s = [1, 3, 5, 9, 10].map(grow);
    for (let i = 1; i < s.length; i++) assert.ok(s[i] > s[i - 1], `smile at page ${[1, 3, 5, 9, 10][i]}`);
  });
});

describe('moon-blanket: the designed interactions run through the real interpreter', () => {
  it('candle: tap blows it out (flame hidden, room tinted, soft sound), tap again relights', async () => {
    const s = new PageSim(doc, living, 1); await s.enter();
    await s.fire('p1-candle');
    assert.equal(s.v('candleOut'), true); assert.deepEqual(s.sfx(), ['candle-blow']);
    const tint = s.host.of('setProps').find(c => (c[1] as string[]).includes(PAGE_ID))!;
    assert.deepEqual(tint[2], { fill: '#0a0d2e', opacity: 0.38 }, 'dims the room, but not to black (the text stays readable)');
    assert.ok(s.host.of('visibility').some(v => v[2] === 'hide'));
    await s.host.advance(600); await s.fire('p1-candle');
    assert.equal(s.v('candleOut'), false); assert.deepEqual(s.sfx(), ['candle-blow', 'candle-flicker']);
    assert.ok(s.host.of('setProps').some(c => (c[1] as string[]).includes(PAGE_ID) && (c[2] as { opacity: number }).opacity === 0), 'tint removed');
  });

  it('page 3: the blanket can be dragged up to the chin; the refrain is read when it gets there', async () => {
    const s = new PageSim(doc, living, 3); await s.enter();
    await s.drag('p3-tuck', 0.5); assert.deepEqual(s.host.of('narrate'), []);
    await s.drag('p3-tuck', 0.85);
    assert.deepEqual(s.host.of('narrate')[0].slice(1), [9, 12], 'narrates "Snug as a stitch."'); assert.ok(s.completed.includes('snug'));
    assert.deepEqual(page(3).narration!.text!.split(' ').slice(9, 13), ['Snug', 'as', 'a', 'stitch.']);
  });

  it('page 5 guessing game: the mouse, the cat and the moon each answer "No!" with a different soft sound; all three completes the goal', async () => {
    const s = new PageSim(doc, living, 5); await s.enter();
    const pitches: number[] = []; const insts: string[] = [];
    for (const id of ['p5-mouse', 'p5-cat', 'p5-moon']) {
      assert.ok(s.targets(id).length > 8, `${id} covers the whole character`);
      await s.fire(id);
      const sfx = s.audio.of('sfx').filter(c => c[1] === 'gentle-no').at(-1)!; pitches.push((sfx[2] as { pitch: number }).pitch); insts.push(String(s.audio.of('note').at(-1)![1]));
    }
    assert.equal(new Set(pitches).size, 3, 'a different pitch for each'); assert.equal(new Set(insts).size, 3, 'a different instrument for each');
    assert.ok(s.completed.includes('three-nos'));
    await s.host.advance(1000); assert.ok(s.sfx().includes('twinkle'), 'a gentle reward after the third no');
  });

  it('the mouse is a character, not just a label: both its button eyes and whiskers are part of the tap target', () => {
    const s = new PageSim(doc, living, 5);
    const ids = new Set(s.targets('p5-mouse')), cat = new Set(s.targets('p5-cat'));
    for (const id of ['p05_button_1', 'p05_button_2', 'p05_whisker_1', 'p05_whisker_4']) assert.ok(ids.has(id), id);
    for (const id of ['p05_button_3', 'p05_button_4', 'p05_whisker_5']) assert.ok(cat.has(id) && !ids.has(id), id);
  });

  it('page 8: lifting the blanket corner lets the light out and Flit flutters in (once)', async () => {
    const s = new PageSim(doc, living, 8); await s.enter();
    await s.drag('p8-lift', 0.3); assert.equal(s.v('arrived'), false);
    await s.drag('p8-lift', 0.7); assert.ok(s.sfx().includes('harp-gliss'));
    assert.ok(s.host.of('burst').some(b => b[2] === 'fireflies'));
    await s.host.advance(2500); await s.settle();
    assert.equal(s.v('arrived'), true); assert.ok(s.completed.includes('come-in'));
    const fly = s.host.of('animate').find(a => JSON.stringify(a[2]).includes('"keyframes"') && JSON.stringify(a[2]).includes('-150'))!; assert.ok(fly);
  });

  it('page 9, the tuck-in finale: dragging the blanket up dims the lights, slows the lullaby, grows the smile, hums and completes the goal', async () => {
    const s = new PageSim(doc, living, 9); await s.enter();
    await s.drag('p9-tuck', 0.4); assert.equal(s.v('tucked'), false);
    await s.drag('p9-tuck', 0.9);
    assert.equal(s.v('tucked'), true); assert.ok(s.completed.includes('tucked-in'));
    assert.deepEqual(s.audio.of('setTempoScale').at(-1)!.slice(1), [0.55, 5000], 'the lullaby slows right down');
    assert.ok(s.host.of('setProps').some(c => (c[1] as string[]).includes(PAGE_ID) && (c[2] as { opacity: number }).opacity === 0.34), 'lights dim');
    assert.ok(s.host.of('setProps').some(c => (c[2] as { scale?: number }).scale === 1.9), 'the moon smiles wide');
    assert.ok(s.host.of('haptic').some(h => h[1] === 'soft') && s.sfx().includes('hum'));
    assert.deepEqual(s.host.of('narrate').at(-1)!.slice(1), [10, 17]);
  });

  it('page 10: say goodnight to Bramble, Flit and the moon; then the lights go out and the music fades away', async () => {
    const s = new PageSim(doc, living, 10); await s.enter();
    await s.fire('p10-bramble'); await s.fire('p10-flit-tap'); assert.deepEqual(s.audio.of('stopMusic'), []);
    await s.host.advance(1000); await s.fire('p10-moon-tap');
    assert.deepEqual(s.host.of('narrate').map(n => n.slice(1)), [[0, 1], [2, 3], [4, 5]]);
    await s.host.advance(2600); await s.settle();
    assert.ok(s.completed.includes('goodnights')); assert.deepEqual(s.audio.of('stopMusic')[0].slice(1), [{ fadeMs: 9000 }]);
  });

  it('page 7: comforting Flit stops the shiver and warms her; page 4: both taps are needed for the goal', async () => {
    const s = new PageSim(doc, living, 7); await s.enter();
    await s.fire('p7-comfort'); assert.ok(s.host.of('stopAnim').length >= 1 && s.completed.includes('warm'));
    const t = new PageSim(doc, living, 4); await t.fire('p4-hole'); assert.deepEqual(t.completed, []); await t.fire('p4-eye'); assert.deepEqual(t.completed, ['hello']);
  });
});

describe('moon-blanket: reduced motion and sound off', () => {
  it('reduced motion: the tap still sounds and changes state, with no animation, burst or trail', async () => {
    for (const [n, id] of [[1, 'p1-moon-tap'], [2, 'p2-bear-tap'], [5, 'p5-cat'], [6, 'p6-antennae-tap'], [9, 'p9-flit-tap']] as const) {
      const s = new PageSim(doc, living, n, { reduced: true }); await s.fire(id); await s.host.advance(1000);
      assert.deepEqual(s.host.of('animate').concat(s.host.of('burst'), s.host.of('trail')), [], `${id} is still`);
      assert.ok(s.audio.of('sfx').length + s.audio.of('note').length > 0 || s.host.of('setProps').length > 0, `${id} still does something`);
    }
  });
  it('sound off: the visual response stays; sound off AND reduced motion: a still acknowledgement', async () => {
    const t = new PageSim(doc, living, 5, { sound: false }); await t.fire('p5-mouse'); await t.host.advance(600);
    assert.deepEqual(t.audio.calls.filter(c => c[0] === 'sfx' || c[0] === 'note'), [], 'nothing reaches the audio engine');
    assert.equal(t.v('mouse'), true, 'the answer is still recorded'); assert.ok(t.host.of('animate').length >= 2, 'the head shake and the text pulse still play');
    const u = new PageSim(doc, living, 5, { sound: false, reduced: true }); await u.fire('p5-mouse'); await u.host.advance(600);
    assert.deepEqual(u.host.of('animate'), []); assert.ok(u.host.of('setProps').length >= 2, 'the text line dims and comes back');
  });
});
