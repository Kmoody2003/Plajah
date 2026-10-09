import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Action, Behavior } from '../services/living/contracts';
import { ActionInterpreter, actionsFor, isAudioOnly, pickNote } from '../services/living/runtime/interpreter';
import { MockAudio, MockHost, OBJS } from './livingMocks';

const setup = (vars: Record<string, number | string | boolean> = {}) => {
  const audio = new MockAudio(); const host = new MockHost(audio, OBJS, vars, { eyes: ['label:Bo eye*'] });
  return { audio, host, it: new ActionInterpreter(host) };
};
const ctx = { targets: ['bo-body'], x01: 0.25, point: { x: 120, y: 240 } };

describe('action interpreter: visuals and state', () => {
  it('animate / stop / set / show / hide / toggle go to the host with resolved targets', async () => {
    const { host, it: i } = setup();
    await i.run([
      { do: 'animate', anim: { preset: 'wiggle' } },                         // defaults to the behaviour's own target
      { do: 'animate', target: { group: 'eyes' }, anim: { preset: 'blink' } },
      { do: 'stop', target: { label: 'Window*' } },
      { do: 'set', props: { opacity: 0.4, text: 'Hello' } },
      { do: 'show', target: { id: 'win-1' }, anim: { preset: 'pop-in' } }, { do: 'hide', target: { id: 'win-2' } }, { do: 'toggle', target: { id: 'title' } },
    ], ctx);
    assert.deepEqual(host.of('animate').map(a => a[1]), [['bo-body'], ['bo-eye-l', 'bo-eye-r']]);
    assert.deepEqual(host.of('stopAnim')[0][1], ['win-1', 'win-2']);
    assert.deepEqual(host.of('setProps')[0][2], { opacity: 0.4, text: 'Hello' });
    assert.deepEqual(host.of('announce').map(a => a[1]), ['Hello'], 'set text is announced to screen readers');
    assert.deepEqual(host.of('visibility').map(v => [v[1], v[2]]), [[['win-1'], 'show'], [['win-2'], 'hide'], [['title'], 'toggle']]);
  });

  it('var ops, goto, emit, haptic, follow, narrate, trail, celebrate', async () => {
    const { audio, host, it: i } = setup({ n: 0 });
    await i.run([
      { do: 'var', name: 'n', op: 'inc' }, { do: 'var', name: 'n', op: 'inc', value: 4 }, { do: 'var', name: 'flag', op: 'toggle' },
      { do: 'goto', page: 'next' }, { do: 'emit', name: 'ping', payload: { a: 1 } }, { do: 'haptic', pattern: 'tug' },
      { do: 'follow', target: { label: 'Bo eye*' }, to: 'pointer', lookAt: true, maxOffset: 5 },
      { do: 'narrate', from: 2, to: 5 }, { do: 'trail', kind: 'sparkles', whileVar: 'flag' }, { do: 'celebrate' },
    ], ctx);
    assert.equal(host.vars.num('n'), 5); assert.equal(host.vars.get('flag'), true);
    assert.deepEqual(host.of('goto')[0].slice(1), ['next']); assert.deepEqual(host.of('emit')[0].slice(1), ['ping', { a: 1 }]);
    assert.deepEqual(host.of('haptic').map(h => h[1]), ['tug', 'success'], 'celebrate adds a success haptic');
    assert.deepEqual(host.of('follow')[0][1], ['bo-eye-l', 'bo-eye-r']); assert.deepEqual(host.of('narrate')[0].slice(1), [2, 5]);
    assert.deepEqual(host.of('trail')[0].slice(1), ['sparkles', 'flag']); assert.equal(host.of('celebrate').length, 1);
    assert.deepEqual(audio.of('sfx').map(s => s[1]), ['success-jingle']);
  });

  it('burst: explicit point, target centre, or the tap point; skipped under reduced motion', async () => {
    const { host, it: i } = setup();
    await i.run([{ do: 'burst', at: { x: 5, y: 6 }, kind: 'confetti', count: 9 }, { do: 'burst', at: { id: 'win-1' }, kind: 'stars' }, { do: 'burst', kind: 'hearts' }], ctx);
    assert.deepEqual(host.of('burst').map(b => [b[1], b[2], b[3]]), [[{ x: 5, y: 6 }, 'confetti', 9], [{ x: 40, y: 40 }, 'stars', undefined], [{ x: 120, y: 240 }, 'hearts', undefined]]);
    host.log.length = 0; host._reduced = true;
    await i.run([{ do: 'burst', kind: 'hearts' }, { do: 'trail', kind: 'sparkles' }], ctx);
    assert.equal(host.of('burst').length + host.of('trail').length, 0, 'no particles for reduced motion');
  });

  it('if / else evaluates conditions at run time', async () => {
    const { host, it: i } = setup({ n: 2 });
    const a: Action = { do: 'if', cond: { var: 'n', op: '>=', value: 3 }, then: [{ do: 'emit', name: 'big' }], else: [{ do: 'emit', name: 'small' }] };
    await i.run([a], ctx); host.vars.set('n', 3); await i.run([a], ctx);
    assert.deepEqual(host.of('emit').map(e => e[1]), ['small', 'big']);
  });

  it('wait suspends only the rest of the list, and a page change cancels it', async () => {
    const { host, it: i } = setup();
    const p = i.run([{ do: 'emit', name: 'a' }, { do: 'wait', ms: 500 }, { do: 'emit', name: 'b' }], ctx);
    assert.deepEqual(host.of('emit').map(e => e[1]), ['a'], 'first action ran synchronously');
    await host.advance(499); assert.equal(host.of('emit').length, 1);
    await host.advance(1); await p; assert.deepEqual(host.of('emit').map(e => e[1]), ['a', 'b']);
    host.log.length = 0;
    const q = i.run([{ do: 'wait', ms: 100 }, { do: 'emit', name: 'late' }], ctx);
    i.cancel(); await host.advance(200); await q;
    assert.equal(host.of('emit').length, 0, 'cancelled before the wait finished');
  });

  it('one failing action never stops the list', async () => {
    const { audio, host, it: i } = setup();
    audio.sfx = () => { throw new Error('boom'); };
    const warn = console.warn; console.warn = () => {};
    try { await i.run([{ do: 'sfx', sound: 'x' }, { do: 'emit', name: 'after' }], ctx); } finally { console.warn = warn; }
    assert.equal(host.of('emit').length, 1);
  });
});

describe('action interpreter: audio', () => {
  it('sfx / note / music / musicStop / musicTempo / duck / ambience / depth call the audio API with the gesture position', async () => {
    const { audio, it: i } = setup({ depthVar: 0.5 });
    await i.run([
      { do: 'sfx', sound: 'beep', params: { pitch: 3, gain: 0.5 } },
      { do: 'note', instrument: 'marimba', note: 'C5', durationMs: 300, gain: 0.7 },
      { do: 'note', instrument: 'kalimba', note: 'scale:C4,D4,E4,G4', pan: 'auto' },
      { do: 'music', cue: 'lullaby', fadeMs: 800 }, { do: 'musicTempo', scale: 0.7, rampMs: 2000 }, { do: 'duck', amount: 0.6, ms: 1500 },
      { do: 'ambience', bed: 'night-crickets', gain: 0.4, fadeMs: 1000 }, { do: 'ambience', bed: null }, { do: 'musicStop', fadeMs: 400 },
      { do: 'depth', value: 0.9 },
    ], ctx);
    assert.deepEqual(audio.of('sfx')[0].slice(1), ['beep', { pitch: 3, gain: 0.5, x01: 0.25 }], 'x01 flows through for auto-pan');
    assert.deepEqual(audio.of('note')[0].slice(1), ['marimba', 'C5', { durationMs: 300, gain: 0.7, pan: -0.5 }]);
    assert.equal(audio.of('note')[1][2], 'D4', 'scale: picks by where you tapped (x01 .25 of 4 notes)');
    assert.deepEqual(audio.of('playCue')[0].slice(1), ['lullaby', { fadeMs: 800 }]);
    assert.deepEqual(audio.of('setTempoScale')[0].slice(1), [0.7, 2000]); assert.deepEqual(audio.of('duck')[0].slice(1), [0.6, 1500]);
    assert.deepEqual(audio.of('setAmbience').map(a => a[1]), ['night-crickets', null]); assert.equal(audio.of('stopMusic').length, 1);
    assert.deepEqual(audio.of('setDepth')[0].slice(1), [0.9]);
  });

  it('depth {fromVar} follows the variable as it changes, and clamps', async () => {
    const { audio, host, it: i } = setup({ d: 0.2 });
    await i.run([{ do: 'depth', value: { fromVar: 'd' } }], ctx);
    host.vars.set('d', 0.6); host.vars.set('d', 4);
    assert.deepEqual(audio.of('setDepth').map(c => c[1]), [0.2, 0.6, 1]);
    await i.run([{ do: 'depth', value: 0.1 }], ctx); host.vars.set('d', 0.9);
    assert.equal(audio.of('setDepth').length, 4, 'a fixed depth detaches from the variable');
  });

  it('a note under press-and-hold becomes a held voice that the host can stop', async () => {
    const { audio, it: i } = setup();
    const hold = { voices: [] as never[] };
    await i.run([{ do: 'note', instrument: 'kazoo', note: 'C4' }], { ...ctx, hold: hold as never });
    assert.equal(audio.of('voice').length, 1); assert.equal(audio.of('note').length, 0); assert.equal(hold.voices.length, 1);
    (hold.voices[0] as { stop(): void }).stop(); assert.equal(audio.voices[0].stopped, true);
  });

  it('nothing sounds while sound is off (no gesture yet / muted)', async () => {
    const { audio, host, it: i } = setup();
    host._sound = false;
    await i.run([{ do: 'sfx', sound: 'beep' }, { do: 'note', instrument: 'x', note: 'C4' }, { do: 'music', cue: 'c' }, { do: 'ambience', bed: 'wind' }, { do: 'duck', amount: 1, ms: 1 }, { do: 'celebrate' }], ctx);
    assert.equal(audio.calls.length, 0);
    const none = new ActionInterpreter(new MockHost(null, OBJS)); await none.run([{ do: 'sfx', sound: 'x' }], ctx);   // no audio engine at all: still fine
  });

  it('pickNote passes ordinary notes through', () => {
    assert.equal(pickNote('C4', 0.9), 'C4'); assert.equal(pickNote(60, 0.1), 60);
    assert.equal(pickNote('scale:C4,E4,G4', 0), 'C4'); assert.equal(pickNote('scale:C4,E4,G4', 0.99), 'G4'); assert.equal(pickNote('scale:C4,E4,G4', 1), 'G4');
  });
});

describe('behaviours: guards and the reduced rules', () => {
  const b = (o: Partial<Behavior> = {}): Behavior => ({ id: 'b', target: { id: 'bo-body' }, on: { type: 'tap' }, hint: 'Tap Bo', do: [{ do: 'emit', name: 'did' }], ...o });

  it('when / once / cooldown', async () => {
    const { host, it: i } = setup({ ok: false });
    assert.equal(i.fire(b({ when: { var: 'ok', op: '==', value: true } }), ctx), false);
    host.vars.set('ok', true); assert.equal(i.fire(b({ when: { var: 'ok', op: '==', value: true } }), ctx), true);
    assert.equal(i.fire(b({ id: 'o', once: true }), ctx), true); assert.equal(i.fire(b({ id: 'o', once: true }), ctx), false);
    assert.equal(i.fire(b({ id: 'c', cooldownMs: 500 }), ctx), true); host.t = 200; assert.equal(i.fire(b({ id: 'c', cooldownMs: 500 }), ctx), false);
    host.t = 700; assert.equal(i.fire(b({ id: 'c', cooldownMs: 500 }), ctx), true);
    i.resetCounters(); assert.equal(i.fire(b({ id: 'o', once: true }), ctx), true, 'a replay starts fresh');
  });

  it('reduced motion uses the behaviour\'s `reduced` actions; sound off uses them only when `do` would show nothing', () => {
    const wiggle: Action[] = [{ do: 'animate', anim: { preset: 'wiggle' } }, { do: 'sfx', sound: 'beep' }];
    const beepOnly: Action[] = [{ do: 'sfx', sound: 'beep' }, { do: 'haptic', pattern: 'tap' }];
    const text: Action[] = [{ do: 'set', props: { text: 'Beep!' } }];
    assert.equal(actionsFor(b({ do: wiggle, reduced: text }), true, true), text);
    assert.equal(actionsFor(b({ do: wiggle, reduced: text }), false, false), wiggle, 'sound off but visuals exist: keep the visuals');
    assert.equal(actionsFor(b({ do: beepOnly, reduced: text }), false, false), text, 'sound-only behaviour with sound off: show the text instead');
    assert.equal(actionsFor(b({ do: beepOnly, reduced: text }), false, true), beepOnly);
    assert.equal(actionsFor(b({ do: wiggle }), true, true), wiggle, 'no reduced actions: run `do` (the host strips the motion)');
    assert.equal(isAudioOnly([{ do: 'if', cond: { var: 'a', op: '==', value: 1 }, then: [{ do: 'sfx', sound: 'x' }] }]), true);
    assert.equal(isAudioOnly([{ do: 'burst', kind: 'stars' }]), false);
  });

  it('fire() runs `reduced` when reduced motion is on', async () => {
    const { host, it: i } = setup();
    host._reduced = true;
    i.fire(b({ do: [{ do: 'animate', anim: { preset: 'spin' } }], reduced: [{ do: 'set', props: { text: 'Spun' } }] }), ctx);
    assert.equal(host.of('animate').length, 0); assert.equal(host.of('setProps').length, 1);
  });
});
