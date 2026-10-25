// Party polls, auto song poll, tallies, energy — and the audience rollup/cards built on them.
//
//   npx tsx --test tests/partyEngagement.test.ts

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTO_POLL_KEEP_SEC, autoPollDue, autoPollId, bucketEnergy, buildAutoPoll, energyPeak, formatMoment,
  normalizePollDraft, pollVisible, tallyPoll, validVote, type PartyPoll,
} from '../services/partyEngagement';
import {
  buildAudienceCards, mergeAudience, publicAudience, publicCommentText, summarizeParty, type PartyAudienceInput,
} from '../services/musicIntel/audience';

const poll = (over: Partial<PartyPoll> = {}): PartyPoll => ({ id: 'p', kind: 'rating', question: 'q', createdBy: 'h', createdAt: 0, ...over });

test('autoPollDue: only in the closing stretch of a song that has been heard', () => {
  assert.equal(autoPollDue(10, 200), false);
  assert.equal(autoPollDue(140, 200), false);         // past 70%, but the closing 25s starts at 175
  assert.equal(autoPollDue(150, 200), false);
  assert.equal(autoPollDue(176, 200), true);
  assert.equal(autoPollDue(176, 0), false);
  assert.equal(autoPollDue(NaN, 200), false);
  assert.equal(autoPollDue(22, 30), true);            // short interlude
});

test('buildAutoPoll: rotates flavour, links the next song, last song gets a wall-clock expiry', () => {
  const a = buildAutoPoll({ id: 't0', title: 'One' }, 0, { id: 't1' }, 'host', 180, 1_000);
  const b = buildAutoPoll({ id: 't1', title: 'Two' }, 1, { id: 't2' }, 'host', 180, 1_000);
  const c = buildAutoPoll({ id: 't2', title: 'Three' }, 2, null, 'host', 180, 1_000);
  assert.equal(a.kind, 'rating'); assert.equal(b.kind, 'choice'); assert.match(b.question, /feel/);
  assert.equal(c.kind, 'choice'); assert.ok(c.expiresAt && c.expiresAt > 1_000);
  assert.equal(a.nextTrackId, 't1'); assert.equal(a.expiresAt, undefined);
  assert.equal(a.id, autoPollId('t0'));
  assert.equal(a.fromSec, 178);
});

test('pollVisible: auto poll shows on its song, then into the next one, then goes away', () => {
  const p = poll({ auto: true, trackId: 't0', nextTrackId: 't1', fromSec: 178, keepSec: AUTO_POLL_KEEP_SEC });
  assert.equal(pollVisible(p, { contentId: 't0', positionSec: 100 }), false);   // not yet
  assert.equal(pollVisible(p, { contentId: 't0', positionSec: 185 }), true);
  assert.equal(pollVisible(p, { contentId: 't1', positionSec: 10 }), true);     // carried into the next song
  assert.equal(pollVisible(p, { contentId: 't1', positionSec: 60 }), false);    // …but not for long
  assert.equal(pollVisible(p, { contentId: 't2', positionSec: 1 }), false);
  assert.equal(pollVisible({ ...p, closed: true }, { contentId: 't0', positionSec: 185 }), false);
});

test('pollVisible: host polls stay until closed or expired', () => {
  const p = poll({ trackId: 't0' });
  assert.equal(pollVisible(p, { contentId: 't9', positionSec: 500 }), true);
  assert.equal(pollVisible({ ...p, expiresAt: 100 }, { contentId: 't9', positionSec: 0 }, 200), false);
});

test('normalizePollDraft: needs a question and two distinct options', () => {
  assert.equal(normalizePollDraft({ kind: 'choice', question: '  ', options: ['a', 'b'] }), null);
  assert.equal(normalizePollDraft({ kind: 'choice', question: 'Next?', options: ['a', 'a', ' '] }), null);
  const ok = normalizePollDraft({ kind: 'choice', question: 'Next?', options: ['Rock', 'Jazz', 'Rock', 'Soul'] })!;
  assert.deepEqual(ok.options!.map(o => o.label), ['Rock', 'Jazz', 'Soul']);
  assert.equal(normalizePollDraft({ kind: 'rating', question: 'Rate it' })!.kind, 'rating');
});

test('validVote + tallyPoll', () => {
  const rating = poll({ kind: 'rating' });
  assert.equal(validVote(rating, 5), true); assert.equal(validVote(rating, 6), false); assert.equal(validVote(rating, '5'), false);
  const choice = poll({ kind: 'choice', options: [{ id: 'o1', label: 'A' }, { id: 'o2', label: 'B' }] });
  assert.equal(validVote(choice, 'o2'), true); assert.equal(validVote(choice, 'o3'), false);
  const t = tallyPoll(rating, [{ value: 5 }, { value: 4 }, { value: 4 }, { value: 9 }]);
  assert.equal(t.total, 3); assert.equal(t.counts['4'], 2); assert.equal(t.avg, 4.33);
  const c = tallyPoll(choice, [{ value: 'o1' }, { value: 'o1' }, { value: 'zzz' }]);
  assert.deepEqual(c.counts, { o1: 2, o2: 0 }); assert.equal(c.total, 2);
  const txt = tallyPoll(poll({ kind: 'text' }), [{ value: 'first' }, { value: 'second' }, { value: '  ' }]);
  assert.deepEqual(txt.answers, ['second', 'first']);
});

test('bucketEnergy: places by playhead, ignores other songs / bad times, peak finds the burst', () => {
  const ev = [
    { trackId: 't0', atSec: 12, w: 1 }, { trackId: 't0', atSec: 13, w: 1 }, { trackId: 't0', atSec: 14, w: 1 },
    { trackId: 't1', atSec: 12, w: 5 }, { trackId: 't0', atSec: -3, w: 5 }, { trackId: 't0', atSec: undefined, w: 5 },
  ];
  const s = bucketEnergy(ev, 't0', 60);
  assert.equal(s.length, 12);
  const pk = energyPeak(s)!;
  assert.equal(pk.atSec, 10);                          // bucket 2 = 10–15s
  assert.equal(energyPeak(bucketEnergy([], 't0', 60)), null);
  assert.equal(formatMoment(134), '2:14');
});

// ── audience rollup ───────────────────────────────────────────────────────────────────────────────

const base = (over: Partial<PartyAudienceInput> = {}): PartyAudienceInput => ({
  partyId: 'party1', albumId: 'alb', hostId: 'h', startedAt: 1, endedAt: 2,
  tracks: [{ id: 't0', title: 'One', durationSec: 200 }, { id: 't1', title: 'Two', durationSec: 180 }],
  chat: [
    { uid: 'a', name: 'Ana Ruiz', text: 'this chorus 🔥 https://spam.example', kind: 'text', atSec: 61, trackId: 't0' },
    { uid: 'b', name: 'Ben', text: 'wow', atSec: 62, trackId: 't0' },
    { uid: 'b', name: 'Ben', kind: 'emote', emoteId: 'fire', text: ':fire:', atSec: 63, trackId: 't0' },
    { uid: 'c', name: 'Cy', kind: 'gif', gifUrl: 'https://media.giphy.com/media/x/giphy.gif', text: 'GIF', atSec: 64, trackId: 't0' },
    { uid: 'c', name: 'Cy', kind: 'gif', gifUrl: 'https://evil.example/x.gif', text: 'GIF', atSec: 65, trackId: 't0' },
  ],
  reactions: [{ uid: 'a', emoji: '🔥', atSec: 61, trackId: 't0' }, { uid: 'b', emoji: '🔥', atSec: 62, trackId: 't0' }],
  polls: [
    { id: 'auto_t0', kind: 'rating', question: 'Rate One', auto: true, trackId: 't0', createdBy: 'h', createdAt: 0 },
    { id: 'auto_t1', kind: 'choice', question: 'How did Two make you feel?', auto: true, trackId: 't1', createdBy: 'h', createdAt: 0, options: [{ id: 'hyped', label: '🔥 Hyped' }, { id: 'calm', label: '🌙 Calm' }] },
  ],
  votes: {
    auto_t0: [{ uid: 'a', value: 5, atSec: 190, trackId: 't0' }, { uid: 'b', value: 4, atSec: 5, trackId: 't1' }],
    auto_t1: [{ uid: 'a', value: 'hyped' }, { uid: 'b', value: 'hyped' }, { uid: 'c', value: 'calm' }],
  },
  ...over,
});

test('summarizeParty: ratings, moods, energy, public comments', () => {
  const r = summarizeParty(base(), 99);
  const t0 = r.tracks.t0;
  assert.equal(t0.ratingCount, 2); assert.equal(t0.ratingSum, 9);
  assert.equal(r.listeners, 3);
  assert.equal(t0.peak!.atSec, 60);
  assert.deepEqual(t0.reactions.map(r => r.key).sort(), ['fire', '🔥']);
  // links stripped, mentions stripped, hostile gif host dropped, emotes aren't comments
  assert.deepEqual(t0.comments.map(c => c.text), ['this chorus 🔥', 'wow', '']);
  assert.equal(t0.comments[2].gifUrl, 'https://media.giphy.com/media/x/giphy.gif');
  assert.equal(t0.comments[0].name, 'Ana');
  // a vote cast on the next song's playhead doesn't land on t0's energy timeline
  assert.ok(t0.energy[1] === undefined || t0.energy[1] >= 0);
  assert.equal(r.tracks.t1.moodTop!.label, '🔥 Hyped');
  assert.equal(r.tracks.t1.moodTop!.total, 3);
});

test('publicCommentText: strips links/mentions, masks profanity, drops empties', () => {
  assert.equal(publicCommentText('check www.x.com now @bob'), 'check now');
  assert.equal(publicCommentText('   '), null);
  assert.equal(publicCommentText('a'), null);
  assert.ok(!/shit/i.test(publicCommentText('this is shit good')!));
});

test('mergeAudience + buildAudienceCards: facts, favourite, hottest moment, comments', () => {
  const merged = mergeAudience([summarizeParty(base(), 1), summarizeParty(base({ partyId: 'party2' }), 2)]);
  assert.equal(merged.sessions, 2);
  assert.equal(merged.tracks.t0.ratingCount, 4);
  assert.equal(merged.tracks.t0.ratingAvg, 4.5);
  assert.equal(merged.tracks.t0.sessions, 2);
  const cards = buildAudienceCards(merged, ['t0', 't1']);
  assert.equal(cards[0].id, 'album-sessions'); assert.equal(cards[0].stat, '2 parties');
  assert.ok(cards.some(c => c.id === 'album-favorite' && c.stat === '4.5★'));
  assert.ok(cards.some(c => c.id === 't0-peak' && c.atSec === 60));
  assert.ok(cards.some(c => c.kind === 'comment' && c.title === 'Ana'));
  assert.ok(cards.some(c => c.id === 't1-mood' && c.stat === '67%'));
});

test('buildAudienceCards: nothing for an album no party touched', () => {
  assert.deepEqual(buildAudienceCards(mergeAudience([]), ['t0']), []);
});

test('buildAudienceCards: a single stray tap is not a song card', () => {
  const quiet = summarizeParty(base({ chat: [], polls: [], votes: {}, reactions: [{ uid: 'a', emoji: '🔥', atSec: 3, trackId: 't0' }] }));
  const cards = buildAudienceCards(mergeAudience([quiet]), ['t0', 't1']);
  assert.ok(cards.every(c => c.scope === 'album'));
});

test('creator analytics keep open answers + the full comment log; the public read strips them', () => {
  const inp = base({
    polls: [...base().polls, { id: 'ask1', kind: 'text', question: 'Favourite lyric?', trackId: 't0', createdBy: 'h', createdAt: 0 }],
    votes: { ...base().votes, ask1: [{ uid: 'a', value: 'the bridge, call me at 555 shit', trackId: 't0' }, { uid: 'b', value: 'ok' }] },
  });
  const r = summarizeParty(inp, 5);
  const ask = r.tracks.t0.polls.find(p => p.kind === 'text')!;
  assert.equal(ask.partyId, 'party1'); assert.equal(ask.pollId, 'ask1');
  assert.equal(ask.answers!.length, 2);
  assert.ok(!/shit/i.test(ask.answers!.join(' ')));                       // masked even for the creator's copy
  assert.equal(r.tracks.t0.allComments.length, 3);                        // two lines + the safe gif; emote + unsafe gif dropped
  assert.deepEqual(r.tracks.t0.allComments.map(c => c.atSec), [61, 62, 64]); // playhead order

  const merged = mergeAudience([r, summarizeParty({ ...inp, partyId: 'party2' }, 6)]);
  assert.equal(merged.tracks.t0.allComments.length, 6);
  const pub = publicAudience(merged);
  assert.equal(pub.tracks.t0.allComments.length, 0);
  assert.ok(pub.tracks.t0.polls.every(p => p.answers === undefined && p.partyId === undefined));
  assert.equal(merged.tracks.t0.allComments.length, 6);                   // the stored/merged copy is untouched
  assert.equal(pub.tracks.t0.ratingCount, merged.tracks.t0.ratingCount);  // the numbers the cards use survive
});

test('recaps stored before allComments existed still merge', () => {
  const old: any = summarizeParty(base(), 1);
  for (const t of Object.values(old.tracks) as any[]) delete t.allComments;
  const m = mergeAudience([old, old]);
  assert.deepEqual(m.tracks.t0.allComments, []);
});
