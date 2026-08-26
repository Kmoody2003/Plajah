import test from 'node:test';
import assert from 'node:assert/strict';
import { PROGRESSIONS, chordNotes } from '../services/melos/composition/harmony';
import { composeProducer } from '../services/ora/stillness/autonomousProducer';
import type { SessionState } from '../services/ora/stillness/emotionalEngine';

const stateAt = (t: number): SessionState => ({
  t, phase: t < 120 ? 'settling' : 'depth', phaseProgress: 0.5, depth: t < 120 ? 0.35 : 0.8,
  breathPhase: 0, breathRate: 10, arousal: 0.45, openness: 0.5, bloom: 0, bloomPan: 0,
  turned: false, pacing: true,
});

test('Melos ships a reusable progression and chord vocabulary', () => {
  assert.ok(PROGRESSIONS.length >= 6);
  for (const p of PROGRESSIONS) assert.ok(p.chords.length >= 4, `${p.id} is not a usable progression`);
  assert.deepEqual(chordNotes({ degree: 1, quality: 'add9' }, 0, 48), [48, 52, 55, 62]);
});

test('the autonomous producer writes a deterministic synchronized arrangement', () => {
  const a = composeProducer(42, 300, stateAt);
  const b = composeProducer(42, 300, stateAt);
  assert.equal(a.progressionId, b.progressionId);
  assert.deepEqual(a.events, b.events);
  for (const part of ['chord', 'bass', 'arp', 'kick'] as const) {
    assert.ok(a.events.some((e) => e.part === part), `score has no ${part}`);
  }
  for (let i = 1; i < a.events.length; i++) assert.ok(a.events[i].at >= a.events[i - 1].at);
});

test('Depth thins the arp while retaining harmonic and rhythmic intent', () => {
  const score = composeProducer(7, 300, stateAt);
  const early = score.events.filter((e) => e.part === 'arp' && e.at < 120).length / 120;
  const deep = score.events.filter((e) => e.part === 'arp' && e.at >= 120).length / 180;
  assert.ok(deep < early, `deep arp density ${deep} must be below settling ${early}`);
});
