// Chora contribution ledger: classification, credit derivation and the hash chain.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGrooveDoc, type GrooveDoc } from '../services/melos/beats/grooveDoc';
import { diffFingerprints, fingerprint } from '../services/chora/contrib/fingerprint';
import { mergeCredits, suggestCredits, summarizeByPerson } from '../services/chora/contrib/derive';
import { GENESIS, makeContrib, sanitizeEvent, verifyContribChain } from '../services/chora/contrib/chain';
import type { ContribEntry, ContribEvent } from '../services/chora/contrib/types';

const SHA = 'a'.repeat(64);
const clone = (d: GrooveDoc): GrooveDoc => JSON.parse(JSON.stringify(d));

function vocalDoc(): GrooveDoc {
  const d = newGrooveDoc('u1');
  d.arrangement.push({ id: 'tv', kind: 'audio', name: 'Lead Vocal', color: '#fff', mute: false, solo: false, gainDb: 0, pan: 0, clips: [] });
  return d;
}

test('a recorded take is classified as recorded, with its input and content hash', () => {
  const a = vocalDoc();
  const b = clone(a);
  b.arrangement[0].clips.push({ id: 'c1', startBeats: 0, lengthBeats: 8, audio: { sampleKey: `melos/beats/samples/${SHA}`, name: 'Verse', offsetSec: 0, gainDb: 0, durationSec: 4, origin: { how: 'recorded', input: 'StudioLive · in 7' } } });
  const evs = diffFingerprints(fingerprint(a), fingerprint(b), { clientAt: 1 });
  assert.equal(evs.length, 1, JSON.stringify(evs));
  assert.equal(evs[0].kind, 'recorded');
  assert.equal(evs[0].origin?.input, 'StudioLive · in 7');
  assert.deepEqual(evs[0].sha256, [SHA]);
});

test('an imported file, lyrics and a mix move are each their own kind of work', () => {
  const a = vocalDoc();
  const b = clone(a);
  b.arrangement[0].clips.push({ id: 'c2', startBeats: 0, lengthBeats: 8, audio: { sampleKey: 'k2', name: 'Loop', offsetSec: 0, gainDb: 0, durationSec: 4, origin: { how: 'imported', file: 'loop.wav' } } });
  b.lyrics = [{ id: 'l1', bar: 0, text: 'first line' }];
  b.arrangement[0].gainDb = -3;
  const kinds = diffFingerprints(fingerprint(a), fingerprint(b), { clientAt: 1 }).map((e) => e.kind).sort();
  assert.deepEqual(kinds, ['imported', 'lyrics', 'mixed']);
});

test('no change, no event; deleting is not a contribution', () => {
  const a = vocalDoc();
  a.lyrics = [{ id: 'l1', bar: 0, text: 'x' }];
  assert.equal(diffFingerprints(fingerprint(a), fingerprint(clone(a)), { clientAt: 1 }).length, 0);
  const b = clone(a); b.lyrics = [];
  assert.equal(diffFingerprints(fingerprint(a), fingerprint(b), { clientAt: 1 }).length, 0);
});

const entry = (uid: string, name: string, ev: Partial<ContribEvent> & Pick<ContribEvent, 'kind'>, seq = 1): ContribEntry =>
  ({ target: 't', count: 1, clientAt: 0, ...ev, projectId: 'beats__g', uid, name, at: seq, seq, prevHash: '', hash: '' });

test('credits follow the ledger, carry no split, and a remote performer gets the performer credit', () => {
  const es = [
    entry('u1', 'Kai', { kind: 'recorded', track: 'Lead Vocal' }),
    entry('u1', 'Kai', { kind: 'lyrics', count: 3 }),
    entry('u2', 'Ren', { kind: 'mixed', count: 12 }),
    entry('u1', 'Kai', { kind: 'recorded', track: 'Guitar', origin: { performer: 'u3', performerName: 'Mo' } }),
  ];
  const credits = suggestCredits(es);
  const has = (name: string, role: string) => credits.some((c) => c.name === name && c.role === role);
  assert.ok(has('Kai', 'Lead Vocals'));
  assert.ok(has('Kai', 'Lyricist'));
  assert.ok(has('Kai', 'Recording Engineer'));
  assert.ok(has('Ren', 'Mixing Engineer'));
  assert.ok(has('Mo', 'Guitar'), JSON.stringify(credits));
  assert.ok(!has('Kai', 'Guitar'));
  assert.ok(credits.every((c) => c.splitPct === undefined));
  assert.equal(summarizeByPerson(es).length, 2);
});

test('merging suggestions never overwrites or duplicates hand-entered credits', () => {
  const existing = [{ id: 'x', name: 'Kai', role: 'Lyricist', category: 'writer' as const, splitPct: 50 }];
  const merged = mergeCredits(existing, suggestCredits([entry('u1', 'Kai', { kind: 'lyrics' })]));
  assert.equal(merged.length, 1);
  assert.equal(merged[0].splitPct, 50);
});

test('the chain detects edits, gaps and reorders', () => {
  const base = { projectId: 'beats__g', uid: 'u1', name: 'Kai', at: 1, kind: 'notes' as const, target: 'Bass', count: 2, clientAt: 1 };
  const e1 = makeContrib(base, 1, GENESIS);
  const e2 = makeContrib({ ...base, at: 2 }, 2, e1.hash);
  assert.equal(verifyContribChain([e2, e1]).ok, true);
  assert.equal(verifyContribChain([e1, { ...e2, uid: 'u9' }]).ok, false);
  assert.equal(verifyContribChain([e2]).ok, false);
});

test('the server ignores client-chosen identity and seals', () => {
  assert.equal(sanitizeEvent({ kind: 'sealed', target: 'x' }), null);
  const s = sanitizeEvent({ kind: 'mixed', target: 'Bus', uid: 'evil', at: 5, seq: 9, origin: { performer: 'bad uid!' } })!;
  assert.equal((s as any).uid, undefined);
  assert.equal((s as any).seq, undefined);
  assert.equal(s.origin?.performer, undefined);
});
