import test from 'node:test';
import assert from 'node:assert/strict';
import { AriaVoiceService, DEFAULT_PROFILES } from '../services/voice/aria/ariaVoice';
import { splitSentences, estimateMarks } from '../services/voice/aria/text';
import { AudioCache, createMemoryStore, hashKey } from '../services/voice/aria/cache';
import { createKokoroProvider } from '../services/voice/aria/providers/kokoro';
import { createServerTtsProvider } from '../services/voice/aria/providers/serverTts';
import { chooseVoice } from '../services/voice/aria/providers/webSpeech';
import type { VoiceProvider } from '../services/voice/aria/types';

const tick = (ms = 5) => new Promise(r => setTimeout(r, ms));

function fake(id: string, o: { avail?: boolean; fail?: boolean; kind?: 'device' | 'server'; ms?: number; log?: string[] } = {}): VoiceProvider & { pending: Array<() => void> } {
  const pending: Array<() => void> = [];
  return {
    id, label: id, kind: o.kind ?? 'device', pending,
    async available() { return o.avail ?? true; },
    async speak(text) {
      if (o.fail) throw new Error('boom');
      o.log?.push(`${id}:${text}`);
      await new Promise<void>(r => { pending.push(r); setTimeout(r, o.ms ?? 1); });
    },
    cancel() { pending.splice(0).forEach(r => r()); },
  };
}
const svc = (providers: VoiceProvider[], order?: string[]) => {
  const s = new AriaVoiceService({ providers, cache: null });
  s.setProfile({ ...DEFAULT_PROFILES.aria, fallbackOrder: order ?? providers.map(p => p.id) });
  return s;
};

test('cascade falls through on failure and on unavailable, reports the provider that spoke', async () => {
  const log: string[] = [];
  const s = svc([fake('a', { avail: false, log }), fake('b', { fail: true, log }), fake('c', { log })]);
  await s.speak('hello');
  assert.deepEqual(log, ['c:hello']);
  assert.equal(s.lastProvider, 'c');
  assert.equal(s.getState().provider, 'c');
});

test('onDeviceOnly profile never uses server providers', async () => {
  const log: string[] = [];
  const s = new AriaVoiceService({ providers: [fake('srv', { kind: 'server', log }), fake('dev', { log })], cache: null });
  s.setProfile({ ...DEFAULT_PROFILES.buddy, fallbackOrder: ['srv', 'dev'] });
  await s.speak('hi');
  assert.deepEqual(log, ['dev:hi']);
});

test('speak never rejects, even when every provider fails or none exist', async () => {
  await svc([fake('a', { fail: true })]).speak('x');
  await svc([]).speak('x');
  await svc([fake('a')]).speak('');
  assert.ok(true);
});

test('cancel stops mid-queue and resolves; external cancellers fire', async () => {
  const log: string[] = [];
  const s = svc([fake('a', { log, ms: 200 })]);
  let ext = 0;
  const off = s.registerExternalCanceller(() => ext++);
  const p = s.speakSentences(['one', 'two', 'three']);
  await tick(20);
  assert.equal(s.isSpeaking, true);
  s.cancel();
  await p;
  assert.deepEqual(log, ['a:one']);
  assert.equal(s.isSpeaking, false);
  assert.ok(ext >= 1);
  off();
});

test('a new speak cancels the previous one (no overlap)', async () => {
  const log: string[] = [];
  const s = svc([fake('a', { log, ms: 300 })]);
  const first = s.speak('first');
  await tick(10);
  const second = s.speak('second');
  await Promise.all([first, second]);
  assert.deepEqual(log, ['a:first', 'a:second']);
});

test('speakSentences starts speaking before the iterable finishes', async () => {
  const log: string[] = [];
  const s = svc([fake('a', { log })]);
  let release!: () => void;
  const gate = new Promise<void>(r => { release = r; });
  let sourceDone = false;
  async function* src() { yield 'Hello there.'; await gate; yield 'Second one.'; sourceDone = true; }
  const p = s.speakSentences(src());
  await tick(30);
  assert.deepEqual(log, ['a:Hello there.']);
  assert.equal(sourceDone, false);
  release();
  await p;
  assert.deepEqual(log, ['a:Hello there.', 'a:Second one.']);
});

test('state subscription fires speaking true then false', async () => {
  const s = svc([fake('a')]);
  const seen: boolean[] = [];
  const off = s.onState(st => seen.push(st.speaking));
  await s.speak('hi');
  off();
  assert.equal(seen[0], true);
  assert.equal(seen[seen.length - 1], false);
});

test('synth providers are played through the player and cached (cache hit skips synth)', async () => {
  let synths = 0;
  const played: string[] = [];
  const p: VoiceProvider = {
    id: 'syn', label: 'syn', kind: 'device', available: async () => true, cancel() {},
    async synth(text) { synths++; return { audio: new Blob([text]), marks: [], durationMs: 10, provider: 'syn', cached: false }; },
  };
  const cache = new AudioCache(createMemoryStore());
  const s = new AriaVoiceService({ providers: [p], cache, player: async (a) => { played.push(await (a as Blob).text()); } });
  s.setProfile({ ...DEFAULT_PROFILES.aria, fallbackOrder: ['syn'] });
  await s.speak('cache me');
  await tick(10);
  await s.speak('cache me');
  assert.equal(synths, 1);
  assert.deepEqual(played, ['cache me', 'cache me']);
});

// ------------------------------------------------------------------ text helpers
test('splitSentences handles abbreviations, decimals, quotes and ellipses', () => {
  assert.deepEqual(splitSentences('Dr. Smith went home. He slept.'), ['Dr. Smith went home.', 'He slept.']);
  assert.deepEqual(splitSentences('It costs 3.50 dollars. Fine.'), ['It costs 3.50 dollars.', 'Fine.']);
  assert.deepEqual(splitSentences('Bring fruit, e.g. apples. Then go.'), ['Bring fruit, e.g. apples.', 'Then go.']);
  assert.deepEqual(splitSentences('She said "Stop." Then she left.'), ['She said "Stop."', 'Then she left.']);
  assert.deepEqual(splitSentences('Wait... what? Really! Yes.'), ['Wait... what?', 'Really!', 'Yes.']);
  assert.deepEqual(splitSentences('He paused... Then he spoke.'), ['He paused...', 'Then he spoke.']);
  assert.deepEqual(splitSentences('Mr. J. Brown arrived. Hi.'), ['Mr. J. Brown arrived.', 'Hi.']);
  assert.deepEqual(splitSentences('One line\nwrapped here. Next.'), ['One line wrapped here.', 'Next.']);
  assert.deepEqual(splitSentences('Para one.\n\nPara two'), ['Para one.', 'Para two']);
  assert.deepEqual(splitSentences('   '), []);
  assert.deepEqual(splitSentences('No punctuation at all'), ['No punctuation at all']);
});

test('estimateMarks is monotonic, covers the full duration and numbers words', () => {
  const text = 'The quick brown fox, jumped over the lazy dog.';
  for (const dur of [0, 1, 999, 4321]) {
    const m = estimateMarks(text, dur);
    assert.equal(m.length, 9);
    assert.equal(m[0].startMs, 0);
    assert.equal(m[m.length - 1].endMs, dur);
    m.forEach((x, i) => { assert.equal(x.i, i); assert.ok(x.endMs >= x.startMs); if (i) assert.equal(x.startMs, m[i - 1].endMs); });
  }
  assert.deepEqual(estimateMarks('', 100), []);
  const off = estimateMarks('a b', 100, 1000, 5);
  assert.equal(off[0].i, 5); assert.equal(off[0].startMs, 1000); assert.equal(off[1].endMs, 1100);
});

// ------------------------------------------------------------------ cache
test('hashKey is stable, sha-256 hex, and sensitive to every field', async () => {
  const a = await hashKey('kokoro', 'af_heart', 1, 'hello');
  assert.equal(a, await hashKey('kokoro', 'af_heart', 1, 'hello'));
  assert.match(a, /^[0-9a-f]{64}$/);
  for (const b of [await hashKey('x', 'af_heart', 1, 'hello'), await hashKey('kokoro', 'v', 1, 'hello'), await hashKey('kokoro', 'af_heart', 1.1, 'hello'), await hashKey('kokoro', 'af_heart', 1, 'hellp')]) assert.notEqual(a, b);
});

test('AudioCache evicts least-recently-used entries past the cap, keeping marks', async () => {
  let t = 0;
  const cache = new AudioCache(createMemoryStore(), 100, () => ++t);
  const blob = (n: number) => new Blob([new Uint8Array(n)]);
  const marks = [{ i: 0, startMs: 0, endMs: 5, text: 'a' }];
  await cache.put('a', { blob: blob(40), marks, durationMs: 5 });
  await cache.put('b', { blob: blob(40), marks, durationMs: 5 });
  assert.ok(await cache.get('a'));                                // touch a => b is now LRU
  await cache.put('c', { blob: blob(40), marks, durationMs: 5 }); // 120 > 100 => evict b
  assert.equal(await cache.get('b'), null);
  const a = await cache.get('a');
  assert.deepEqual(a?.marks, marks);
  assert.ok(await cache.get('c'));
  assert.ok((await cache.totalBytes()) <= 100);
  await cache.put('huge', { blob: blob(500), marks: [], durationMs: 1 });   // bigger than cap: refused
  assert.equal(await cache.get('huge'), null);
});

test('AudioCache degrades to misses when the store throws', async () => {
  const bad: any = { getMeta: async () => { throw new Error('x'); }, getData: async () => { throw new Error('x'); }, put: async () => { throw new Error('x'); }, setMeta: async () => { throw new Error('x'); }, del: async () => { throw new Error('x'); } };
  const c = new AudioCache(bad);
  assert.equal(await c.get('k'), null);
  await c.put('k', { blob: new Blob(['x']), marks: [], durationMs: 1 });
  assert.equal(await c.totalBytes(), 0);
});

// ------------------------------------------------------------------ providers
test('kokoro: lazy, unavailable until it has produced audio; failed load is not "loaded"', async () => {
  let loads = 0, fail = true;
  const k = createKokoroProvider(async () => {
    loads++;
    if (fail) throw new Error('offline');
    return { generate: async (t: string) => ({ audio: new Float32Array(2400 * t.length), sampling_rate: 24000 }) };
  });
  assert.equal(loads, 0);                       // creating the provider loads nothing
  assert.equal(await k.available(), false);
  assert.equal(await (k as any).warmUp(), false);
  assert.equal(await k.available(), false);     // failed load does not flip availability
  fail = false;
  assert.equal(await (k as any).warmUp(), true);
  assert.equal(await k.available(), true);
  const r = await k.synth!('Hello world. Second one here.', DEFAULT_PROFILES.aria, {});
  assert.equal(r.provider, 'kokoro');
  assert.ok(r.audio instanceof Blob);
  assert.equal(r.marks.length, 5);
  assert.equal(r.marks[r.marks.length - 1].endMs, r.durationMs);
});

test('serverTts: 404/501 makes it unavailable for a cool-down and throws so the cascade falls through', async () => {
  let calls = 0, now = 0;
  const f: any = async () => { calls++; return { ok: false, status: 501, json: async () => ({}) }; };
  const p = createServerTtsProvider(f, '/api/voice/speak', () => now);
  assert.equal(await p.available(), true);
  await assert.rejects(p.synth!('hi', DEFAULT_PROFILES.aria, {}));
  assert.equal(await p.available(), false);
  now += 11 * 60 * 1000;
  assert.equal(await p.available(), true);
  const ok: any = async () => ({ ok: true, status: 200, json: async () => ({ audioUrl: '/a.mp3', marks: [{ i: 0, startMs: 0, endMs: 100, text: 'hi' }] }) });
  const r = await createServerTtsProvider(ok).synth!('hi', DEFAULT_PROFILES.aria, {});
  assert.equal(r.audio, '/a.mp3');
  assert.equal(calls, 1);
});

test('webSpeech chooseVoice never picks a non-English voice for English text', () => {
  const vs = [{ name: 'Monica', lang: 'es-ES' }, { name: 'Thomas', lang: 'fr-FR' }];
  assert.equal(chooseVoice(vs, 'en-US'), null);
  const mixed = [...vs, { name: 'Zira', lang: 'en-US' }, { name: 'Microsoft Aria Online (Natural)', lang: 'en-US' }];
  assert.equal(chooseVoice(mixed, 'en-US')?.name, 'Microsoft Aria Online (Natural)');
  assert.equal(chooseVoice(mixed, 'en-US', 'Zira')?.name, 'Zira');
});
