import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_PERSONAS, HOSTS, ARTISTS, validateRoster, findOverlaps, hostOnAir, getPersona,
  checkLine, scrubListenerText, needsSafetyHandoff,
  planLink, hostBreak, shouldTalk, wpsFor,
  CallerDesk, pickChatMentions,
  buildPersonaPrompt, personaAccountDoc, personaMay, isPersonaUid,
  newRelease, advance, eraOneReleases,
  type SongFacts,
} from '../services/onair';
import { planBreak } from '../services/fast/breakPlan';

const song = (o: Partial<SongFacts> = {}): SongFacts => ({ id: 's1', title: 'Quarter in the Machine', artist: 'Remi Lux', ...o });

test('roster: 6 hosts, 3 artists, every sheet valid, no overlapping shows', () => {
  assert.equal(HOSTS.length, 6);
  assert.equal(ARTISTS.length, 3);
  assert.deepEqual(validateRoster(), []);
  assert.deepEqual(findOverlaps(), []);
  assert.deepEqual(ARTISTS.map((a) => a.artist!.genre).sort(), ['Composer', 'EDM', 'Pop']);
  for (const p of ALL_PERSONAS) {
    assert.equal(p.voice.status, 'brief', `${p.id} voice is cast later`);
    assert.match(p.account.disclosure, /virtual/i);
  }
});

test('hostOnAir: dayparts and the show that runs past midnight', () => {
  assert.equal(hostOnAir(1, 7)?.id, 'mari');   // Mon 7am
  assert.equal(hostOnAir(1, 11)?.id, 'kit');
  assert.equal(hostOnAir(1, 16)?.id, 'juno');
  assert.equal(hostOnAir(1, 23)?.id, 'dez');
  assert.equal(hostOnAir(2, 1)?.id, 'dez');    // Tue 1am = Monday's Low Light
  assert.equal(hostOnAir(2, 3)?.id, 'nova');
  assert.equal(hostOnAir(0, 9)?.id, 'ray');    // Sun 9am
  assert.equal(hostOnAir(1, 20), null);        // weekday evening is open
});

test('policy: blocks human claims, PII, money asks, profanity and invented numbers', () => {
  assert.ok(checkLine("I'm a real person, trust me").includes('claims-human'));
  assert.ok(checkLine('Call me at 555-123-4567').includes('pii'));
  assert.ok(checkLine('Send me twenty on Cash App').includes('money'));
  assert.ok(checkLine('That song has 50000 plays').includes('ungrounded-number'));
  assert.deepEqual(checkLine('That song has 41 plays', { facts: ['41'] }), []);
  assert.ok(checkLine('I toured with a legend once').includes('real-person-claim'));
  assert.equal(scrubListenerText('hi im at jo@x.com'), 'hi im at [email removed]');
  assert.ok(needsSafetyHandoff('I want to end my life'));
  assert.ok(!needsSafetyHandoff('this song is killing it'));
});

test('planLink: grounded template, mind line only when it passes, fits the time', () => {
  const kit = getPersona('kit')!;
  const l = planLink({ kind: 'between', host: kit, prev: song({ plajahCreator: true, plays: 41 }), next: song({ id: 's2', title: 'Fog Bell', artist: 'Orsolya Wren' }) });
  assert.equal(l.source, 'template');
  assert.match(l.text, /Quarter in the Machine/);
  assert.match(l.text, /41 plays/);

  const good = planLink({ kind: 'between', host: kit, next: song() }, 'Flip it over — here is Remi Lux.');
  assert.equal(good.source, 'mind');
  const bad = planLink({ kind: 'between', host: kit, next: song() }, 'This has 2 million streams and I am a real person.');
  assert.equal(bad.source, 'template');

  const talkUp = planLink({ kind: 'talk-up', host: getPersona('juno')!, next: song({ introSec: 4 }) });
  assert.ok(talkUp.estSec <= 3 + 0.01, `talk-up ${talkUp.estSec}s must end before the vocal`);
});

test('hostBreak: voices FM and up-next segments, never spots or idents', () => {
  const plan = planBreak({
    totalSec: 90, spots: [{ url: 'a', title: 'A', durSec: 30 }, { url: 'b', title: 'B', durSec: 30 }],
    hasUpNext: true, openIdent: { url: 'i', title: 'ident', durSec: 5 }, rng: () => 0.42,
  });
  const voices = hostBreak(plan, getPersona('mari')!, song());
  assert.ok(voices.length >= 1);
  const byId = new Map(plan.map((s) => [s.id, s]));
  for (const v of voices) {
    const seg = byId.get(v.segId)!;
    assert.ok(seg.kind === 'fm' || seg.kind === 'upnext');
    assert.ok(v.atSec >= seg.startSec && v.atSec + v.line.estSec <= seg.startSec + seg.durSec + 0.01, `${v.line.text} fits ${seg.kind}`);
  }
});

test('shouldTalk: DJs talk less, requests always get a mention', () => {
  const nova = getPersona('nova')!;
  const juno = getPersona('juno')!;
  assert.equal(shouldTalk(nova, 1), false);
  assert.equal(shouldTalk(nova, 1, song({ requestedBy: 'Ana' })), true);
  assert.equal(shouldTalk(juno, 2), true);   // talky host: every couple of songs
  assert.equal(shouldTalk(nova, 2), false);  // DJ: every fourth
  assert.equal(shouldTalk(nova, 4), true);
  assert.ok(wpsFor(juno) > wpsFor(nova));
});

test('CallerDesk: consent, minors, one on air, time limit, safety dump', () => {
  const desk = new CallerDesk(getPersona('mari')!, { limitSec: 60 });
  const base = { uid: 'u', firstName: 'Ana Ruiz', nameOnAir: true, consentToAir: true, isMinor: false, topic: 'finishing my thesis today' };
  const a = desk.request({ ...base, id: 'a', uid: 'ua' }, 0) as any;
  const minor = desk.request({ ...base, id: 'm', uid: 'um', isMinor: true }, 0) as any;
  const noConsent = desk.request({ ...base, id: 'n', uid: 'un', consentToAir: false }, 0) as any;
  const crisis = desk.request({ ...base, id: 'c', uid: 'uc', topic: 'i want to hurt myself' }, 0) as any;
  assert.ok('refused' in desk.request({ ...base, id: 'dup', uid: 'ua' }, 0));
  for (const id of ['a', 'm', 'n', 'c']) desk.screen(id, 1);
  assert.equal(a.state, 'ready');
  assert.equal(minor.state, 'declined');
  assert.equal(noConsent.state, 'declined');
  assert.equal(crisis.state, 'safety');
  assert.equal(CallerDesk.spokenName(a), 'Ana');

  const on = desk.takeNext(1000) as any;
  assert.equal(on.id, 'a');
  assert.ok('refused' in desk.takeNext(1000));
  assert.equal(desk.tick(30_000), undefined);
  assert.equal(desk.tick(61_000)?.id, 'a');
  assert.equal(a.state, 'done');

  const nova = new CallerDesk(getPersona('nova')!);
  assert.ok('refused' in nova.request({ ...base, id: 'x' }, 0)); // Afterglow takes chat only
});

test('pickChatMentions: opted-in, one per listener, dedications first, minors unnamed', () => {
  const now = 1_000_000;
  const msgs = [
    { id: '1', uid: 'a', firstName: 'Jo', text: 'love this', at: now - 1000, okToRead: true, kind: 'chat' as const },
    { id: '2', uid: 'b', firstName: 'Sam', text: 'for my mom', at: now - 5000, okToRead: true, kind: 'dedication' as const },
    { id: '3', uid: 'c', firstName: 'Lee', text: 'private', at: now, okToRead: false },
    { id: '4', uid: 'd', firstName: 'Kid', text: 'play remi!', at: now, okToRead: true, isMinor: true, kind: 'request' as const },
    { id: '5', uid: 'e', firstName: 'X', text: 'i want to die', at: now, okToRead: true },
  ];
  const { read, safety } = pickChatMentions(msgs, 3, now);
  assert.deepEqual(read.map((r) => r.messageId), ['2', '4', '1']);
  assert.equal(read[1].spokenName, 'a listener');
  assert.deepEqual(safety.map((m) => m.id), ['5']);
});

test('prompt: carries station rules, persona and only the given facts', () => {
  const p = buildPersonaPrompt(getPersona('dez')!, { kind: 'between', next: song({ dedicatedTo: 'Maya' }), maxSec: 10 });
  assert.match(p.system, /VIRTUAL radio host/);
  assert.match(p.system, /Never claim to be human/);
  assert.match(p.user, /dedicated to: Maya/);
  assert.equal(p.maxWords, Math.floor(9.6 * 2.0));
});

test('accounts: fixed persona uid, disclosure in bio, zero counts, no unsolicited DMs', () => {
  const d = personaAccountDoc(getPersona('vyra')!, 5);
  assert.equal(d.uid, 'persona_vyra');
  assert.ok(isPersonaUid(d.uid));
  assert.match(d.bio, /AI character/);
  assert.equal(d.followerCount, 0);
  assert.equal(d.accountType, 'ARTIST');
  assert.equal(personaMay('post'), true);
  assert.equal(personaMay('send-direct-messages-first'), false);
  assert.equal(personaMay('ask-for-or-take-money'), false);
});

test('artist studio: persona cannot pass human gates; rights must be cleared', () => {
  const remi = getPersona('remi')!;
  assert.equal(eraOneReleases(remi).length, 5);
  let r = newRelease(remi, 'Spin Cycle', 'Era 1', 'r1');
  for (let i = 0; i < 6; i++) { const res = advance(r, 'persona'); assert.ok(res.ok); r = (res as any).release; }
  assert.equal(r.stage, 'producer-review');
  assert.equal(advance(r, 'persona').ok, false);
  r = (advance(r, 'uid_producer') as any).release;
  assert.equal(r.credits.producer, 'uid_producer');
  const blocked = advance(r, 'uid_owner');
  assert.equal(blocked.ok, false);
  r = { ...r, rights: { noRealSamples: true, noSoundAlike: true, originalLyrics: true, ownerApproved: true } };
  r = (advance(r, 'uid_owner') as any).release;
  assert.equal(r.stage, 'scheduled');
  assert.throws(() => newRelease(getPersona('kit')!, 'x', 'y', 'z'));
});

test('station clock: shows run on Eastern time; track facts carry only stored values', async () => {
  const { stationClock, onAirNow, nextOnAir, songFactsFromTrack, showHoursLabel, hostFillIn } = await import('../services/onair');
  // Mon 2026-11-09 12:30 UTC = 7:30 a.m. EST → Mari.
  const mon730 = Date.UTC(2026, 10, 9, 12, 30);
  assert.deepEqual(stationClock(mon730), { dayIndex: 1, hour: 7 });
  assert.equal(onAirNow(mon730)?.id, 'mari');
  // Mon 8 p.m. EST is unhosted; Dez is next at 10.
  const mon8pm = Date.UTC(2026, 10, 10, 1, 0);
  assert.equal(onAirNow(mon8pm), null);
  assert.deepEqual([nextOnAir(mon8pm)?.host.id, nextOnAir(mon8pm)?.inHours], ['dez', 2]);
  assert.equal(showHoursLabel(getPersona('dez')!), '10pm–2am ET');

  const f = songFactsFromTrack({ id: 't', title: 'Fog Bell', artist: 'Orsolya Wren', artistId: 'persona_orsolya', playCount: 12 })!;
  assert.equal(f.isPersonaArtist, true);
  assert.equal(f.plajahCreator, false);
  assert.equal(f.plays, 12);
  assert.equal(songFactsFromTrack({ id: 'x' }), null);

  const plan = planBreak({ totalSec: 60, spots: [{ url: 'a', title: 'A', durSec: 30 }], hasUpNext: true, rng: () => 0.42 });
  const v = hostFillIn(plan, getPersona('kit')!, song(), 'Horror Classics 8.2');
  for (const x of v) {
    const seg = plan.find((s) => s.id === x.segId)!;
    assert.equal(seg.kind, 'fm');
    assert.doesNotMatch(x.line.text, /after the break/i);
  }
});

test('server /api/onair: who is on, public cards only, one line per moment for every listener', async () => {
  const express = (await import('express')).default;
  const { createOnAirRouter, cleanSong } = await import('../routes/onair');
  let calls = 0;
  const mind = async () => { calls++; return 'This is "Quarter in the Machine" from Remi Lux.'; };
  const app = express();
  app.use('/api/onair', express.json(), createOnAirRouter({ now: () => Date.UTC(2026, 10, 9, 16, 0), mind })); // Mon 11am ET → Kit
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${(srv.address() as any).port}/api/onair`;
  try {
    const now = await (await fetch(`${base}/now`)).json();
    assert.equal(now.host.id, 'kit');
    assert.match(now.host.disclosure, /virtual/i);
    assert.equal(now.host.voice, undefined, 'no voice ids or prompts leave the server');

    const roster = await (await fetch(`${base}/roster`)).json();
    assert.equal(roster.personas.length, 9);

    const body = JSON.stringify({ kind: 'between', next: { id: 's1', title: 'Quarter in the Machine', artist: 'Remi Lux', extra: 'ignored' } });
    const post = () => fetch(`${base}/link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).then((r) => r.json());
    const [a, b] = await Promise.all([post(), post()]);
    const c = await post();
    assert.equal(a.line.text, b.line.text);
    assert.equal(c.cached, true);
    assert.equal(a.line.source, 'mind');
    assert.equal(calls, 1, 'the model is called once per moment, not per listener');

    const bad = await fetch(`${base}/link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'rant' }) });
    assert.equal(bad.status, 400);
  } finally { srv.close(); }
  assert.equal(cleanSong({ title: 'x' }), null);
  assert.equal(cleanSong({ title: 'T', artist: 'A', plays: -5 })!.plays, undefined);
});

test('voicer: renders a line once, reuses it, caps spend, pauses on refusal, only picked voices', async () => {
  const { createVoicer, lineHash, lineAudioUrl } = await import('../services/onair/voice');
  const stored = new Set<string>();
  let tts = 0;
  let refuse = false;
  const fakeFetch = (async (url: string, init?: any) => {
    if (init?.method === 'HEAD') return { ok: [...stored].some((p) => url.includes(encodeURIComponent(p))) } as any;
    tts++;
    if (refuse) return { ok: false, status: 401 } as any;
    return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as any;
  }) as any;
  let t = Date.UTC(2026, 10, 10);
  const v = createVoicer({
    apiKey: 'k', bucket: 'b', fetch: fakeFetch, now: () => t, maxCharsPerMonth: 60, log: () => {},
    voices: () => ({ kit: { voiceId: 'v_kit' } }),
    upload: async (p) => { stored.add(p); return true; },
  });

  const url = await v.voice('kit', 'Here is Fog Bell.');
  assert.equal(url, lineAudioUrl('b', lineHash('v_kit', 'Here is Fog Bell.')));
  const [a, b] = await Promise.all([v.voice('kit', 'Here is Fog Bell.'), v.voice('kit', 'Here is Fog Bell.')]);
  assert.equal(a, url); assert.equal(b, url);
  assert.equal(tts, 1, 'one render per distinct line');

  assert.equal(await v.voice('mari', 'No voice picked yet.'), null);
  assert.equal(await v.voice('kit', 'x'.repeat(50)), null, 'over the monthly cap stays a caption');

  refuse = true;
  assert.equal(await v.voice('kit', 'Short one.'), null);
  const before = tts;
  assert.equal(await v.voice('kit', 'Another.'), null);
  assert.equal(tts, before, 'paused after a refusal, no retry storm');
  t += 11 * 60_000; refuse = false;
  assert.ok(await v.voice('kit', 'Another.'));
});
