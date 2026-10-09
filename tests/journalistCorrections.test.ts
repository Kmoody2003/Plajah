import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendNotice, isAppendOnly, classifyEdit, silentEditProblem, sortForDisplay, isRetracted, noticesToHtml, noticeToPlainText, NoticeError, NOTICE_LABELS,
} from '../services/journalist/correctionLog';
import { evaluatePublishGate } from '../services/journalist/publishGate';
import { setClaimStatus, newClaim, addSource, detectCheckableClaims, isTrulyVerified, ClaimError, wayback, claimSummary } from '../services/journalist/factCheck';
import { extractQuotes, verifyQuote, quoteBlocked, formatTimestamp, attributionLine } from '../services/journalist/quotes';
import { seal, open, passphraseProblem } from '../services/journalist/vaultCrypto';
import type { ArticleDisclosures, ArticleNotice } from '../services/journalist/types';

const who = { byUid: 'u1', byName: 'Ada Editor' };

test('appendNotice returns a new log, never mutates, preserves order', () => {
  const a = appendNotice([], { label: 'CORRECTION', text: 'The mayor is Lee, not Li.', ...who, at: 1000, id: 'n1' });
  const frozen = Object.freeze([...a]);
  const b = appendNotice(frozen, { label: 'UPDATE', text: 'Added the council response.', ...who, at: 2000, id: 'n2' });
  assert.equal(a.length, 1); assert.equal(b.length, 2);
  assert.deepEqual(b.map(n => n.id), ['n1', 'n2']);
  assert.notEqual(a, b);
});

test('appendNotice validates label, text and author', () => {
  assert.throws(() => appendNotice([], { label: 'NOPE' as any, text: 'a long enough note', ...who }), NoticeError);
  assert.throws(() => appendNotice([], { label: 'UPDATE', text: 'hi', ...who }), NoticeError);
  assert.throws(() => appendNotice([], { label: 'UPDATE', text: 'a long enough note', byUid: '', byName: '' }), NoticeError);
  assert.throws(() => appendNotice([], { label: 'UPDATE', text: 'x'.repeat(2001), ...who }), NoticeError);
});

test('standard labels exist with reader-facing headings', () => {
  assert.equal(NOTICE_LABELS.CORRECTION.heading, 'Correction');
  assert.equal(NOTICE_LABELS.EDITORS_NOTE.heading, 'Editor’s note');
  assert.equal(NOTICE_LABELS.UPDATE.heading, 'Update');
});

test('isAppendOnly rejects edits, removals and reordering', () => {
  const l1 = appendNotice([], { label: 'CORRECTION', text: 'First correction text.', ...who, at: 1, id: 'a' });
  const l2 = appendNotice(l1, { label: 'UPDATE', text: 'Second note text here.', ...who, at: 2, id: 'b' });
  assert.ok(isAppendOnly(l1, l2));
  assert.ok(isAppendOnly(undefined, l1));
  assert.ok(isAppendOnly(l2, l2));
  assert.equal(isAppendOnly(l2, l1), false);                                  // removal
  assert.equal(isAppendOnly(l2, [{ ...l2[0], text: 'Silently rewritten.' }, l2[1]]), false); // edit
  assert.equal(isAppendOnly(l2, [l2[1], l2[0]]), false);                       // reorder
});

test('classifyEdit: whitespace is no change; one word is minor; rewrite is substantive', () => {
  assert.equal(classifyEdit('The mayor spoke.', 'The  mayor   spoke. ').level, 'none');
  assert.equal(classifyEdit('The mayor spoke on Tuesday at the hall downtown with many people present today.', 'The mayor spoke on Wednesday at the hall downtown with many people present today.').level, 'minor');
  assert.equal(classifyEdit('The mayor spoke.', 'The mayor resigned amid a scandal involving contracts.').level, 'substantive');
});

test('silent edits are blocked; a notice unlocks them; the log cannot be rewritten', () => {
  const published = 'The mayor, Li, spoke on Tuesday about the budget and several other issues at length.';
  const edited = 'The mayor, Lee, spoke on Tuesday about the budget and several other issues at length.';
  assert.match(silentEditProblem(published, edited, [], []) || '', /public notice|CORRECTION/);
  const log = appendNotice([], { label: 'CORRECTION', text: 'The mayor’s name is Lee, not Li.', ...who });
  assert.equal(silentEditProblem(published, edited, [], log), null);
  assert.equal(silentEditProblem(published, published, [], []), null);   // unchanged text needs nothing
  assert.match(silentEditProblem(published, edited, log, []) || '', /append-only/);
});

test('display order: retraction first, then newest first; helpers', () => {
  let log: ArticleNotice[] = [];
  log = appendNotice(log, { label: 'UPDATE', text: 'Older update text.', ...who, at: 100, id: 'u' });
  log = appendNotice(log, { label: 'RETRACTION', text: 'Retracted because the source recanted.', ...who, at: 50, id: 'r' });
  log = appendNotice(log, { label: 'CORRECTION', text: 'Newer correction text.', ...who, at: 200, id: 'c' });
  assert.deepEqual(sortForDisplay(log).map(n => n.id), ['r', 'c', 'u']);
  assert.ok(isRetracted(log));
  const html = noticesToHtml(log);
  assert.match(html, /Corrections and updates/);
  assert.equal(noticesToHtml([]), '');
  assert.match(noticeToPlainText(log[0]), /^UPDATE/);
});

test('notice html escapes reader-facing text', () => {
  const log = appendNotice([], { label: 'CORRECTION', text: 'Fixed <script>alert(1)</script> typo', ...who });
  assert.ok(!noticesToHtml(log).includes('<script>'));
});

// ── publish gate ────────────────────────────────────────────────────────────

const disc: ArticleDisclosures = { aiAssisted: false, sponsored: false, affiliateLinks: false, conflictOfInterest: false };
const body = 'word '.repeat(60);
const base = { title: 'Council votes to close Eastside library branch', bodyText: body, imageRefs: [], rights: [], disclosures: disc, claims: [] };

test('gate: clean article publishes; embargo schedules instead', () => {
  assert.equal(evaluatePublishGate(base).canPublish, true);
  const e = evaluatePublishGate({ ...base, embargoUntil: 5000, now: 1000 });
  assert.equal(e.action, 'SCHEDULE'); assert.equal(e.canPublish, true);
  assert.equal(evaluatePublishGate({ ...base, embargoUntil: 500, now: 1000 }).action, 'PUBLISH');
});

test('gate: images need credit + license before publish', () => {
  const r = evaluatePublishGate({ ...base, imageRefs: ['cover'], rights: [] });
  assert.equal(r.canPublish, false); assert.match(r.blockers[0], /credit/);
  const r2 = evaluatePublishGate({ ...base, imageRefs: ['cover'], rights: [{ ref: 'cover', credit: 'Jo Smith / AP', license: 'LICENSED', sourceUrl: 'https://x.test/l' }] });
  assert.equal(r2.canPublish, true);
});

test('gate: disclosures and disputed claims block; unverified claims only warn', () => {
  assert.equal(evaluatePublishGate({ ...base, disclosures: { ...disc, aiAssisted: true } }).canPublish, false);
  assert.equal(evaluatePublishGate({ ...base, disclosures: { ...disc, sponsored: true } }).canPublish, false);
  assert.equal(evaluatePublishGate({ ...base, disclosures: { ...disc, conflictOfInterest: true } }).canPublish, false);
  assert.equal(evaluatePublishGate({ ...base, aiUsedInEditor: true }).warnings.some(w => /disclosure is off/.test(w)), true);
  const c = newClaim({ id: 'c1', ownerId: 'u1', articleId: 'a', text: 'The budget is $4 million.' });
  const g = evaluatePublishGate({ ...base, claims: [c] });
  assert.equal(g.canPublish, true); assert.ok(g.warnings.some(w => /not yet verified/.test(w)));
  const d = { ...c, status: 'DISPUTED' as const };
  assert.equal(evaluatePublishGate({ ...base, claims: [d] }).canPublish, false);
});

test('gate: republishing a changed article without a notice is blocked', () => {
  const g = evaluatePublishGate({ ...base, publishedText: 'Totally different original text for the story that was out.', priorNotices: [], nextNotices: [] });
  assert.equal(g.canPublish, false);
});

// ── fact check ──────────────────────────────────────────────────────────────

test('AI and heuristics can never verify; humans need a source', () => {
  const c = newClaim({ id: 'c', ownerId: 'u1', articleId: 'a', text: 'Unemployment fell 3 percent in 2025.', suggestedBy: 'ai' });
  assert.equal(c.status, 'UNVERIFIED');
  assert.throws(() => setClaimStatus(c, 'VERIFIED', { kind: 'ai', label: 'gemini' }), ClaimError);
  assert.throws(() => setClaimStatus(c, 'VERIFIED', { kind: 'heuristic' }), ClaimError);
  assert.throws(() => setClaimStatus(c, 'VERIFIED', { kind: 'human', uid: 'u1' }), /source/);
  const withSrc = addSource(c, { url: 'https://bls.gov/x', label: 'BLS' });
  const v = setClaimStatus(withSrc, 'VERIFIED', { kind: 'human', uid: 'u1' });
  assert.equal(v.status, 'VERIFIED'); assert.equal(v.statusBy, 'human:u1'); assert.ok(isTrulyVerified(v));
  assert.throws(() => setClaimStatus(withSrc, 'DISPUTED', { kind: 'human', uid: 'u1' }), /disputed/i);
  assert.equal(setClaimStatus(withSrc, 'DISPUTED', { kind: 'human', uid: 'u1' }, { note: 'City says 2.1%' }).status, 'DISPUTED');
  // tamper: a record that says VERIFIED but was not set by a human is not treated as verified
  assert.equal(isTrulyVerified({ ...v, statusBy: 'ai:gemini' }), false);
  assert.equal(isTrulyVerified({ ...v, sources: [] }), false);
  assert.deepEqual(claimSummary([v, c]), { total: 2, verified: 1, disputed: 0, unverified: 1 });
});

test('source links must be http(s); wayback helper builds links', () => {
  const c = newClaim({ id: 'c', ownerId: 'u1', articleId: 'a', text: 'x' });
  assert.throws(() => addSource(c, { url: 'javascript:alert(1)' }), ClaimError);
  assert.throws(() => addSource(c, { url: 'https://ok.test', archiveUrl: 'file:///etc/passwd' }), ClaimError);
  const w = wayback('https://example.com/a?b=1');
  assert.equal(w.latest, 'https://web.archive.org/web/2/https://example.com/a?b=1');
  assert.match(w.saveNow, /web\.archive\.org\/save\//);
  assert.match(w.availability, /archive\.org\/wayback\/available\?url=https%3A%2F%2Fexample\.com/);
  assert.throws(() => wayback('ftp://x'), ClaimError);
});

test('claim detector suggests figure/causal/study sentences, ignores fluff', () => {
  const text = 'It was a lovely afternoon in the park. Unemployment fell 3 percent in 2025 because the factory reopened. A study found that 40% of residents commute. Everyone smiled.';
  const found = detectCheckableClaims(text).map(c => c.text);
  assert.ok(found.some(t => /Unemployment fell/.test(t)));
  assert.ok(found.some(t => /study found/.test(t)));
  assert.ok(!found.some(t => /lovely afternoon/.test(t)));
});

// ── quotes ──────────────────────────────────────────────────────────────────

const segs = [
  { start: 0, end: 4, text: 'So, thanks for joining us today.', speaker: 'Reporter' },
  { start: 4, end: 12, text: 'Honestly, I think the city never listened to the people who use that library every day.', speaker: 'Lee' },
  { start: 12, end: 15, text: 'Why did you decide to speak out now after so many years of silence?', speaker: 'Reporter' },
  { start: 65, end: 80, text: 'We will not stop until the branch is reopened and the funding of 4 million dollars is restored.', speaker: 'Lee' },
];

test('quote extraction links quote -> timestamp -> source and skips questions/filler', () => {
  const q = extractQuotes(segs, { sourceId: 's1', interviewId: 'i1' });
  assert.equal(q.length, 2);
  assert.ok(q.every(x => x.speaker === 'Lee' && x.sourceId === 's1' && x.interviewId === 'i1'));
  assert.deepEqual(q.map(x => x.startSec), [4, 65]);
  assert.equal(formatTimestamp(65), '1:05'); assert.equal(formatTimestamp(3725), '1:02:05');
});

test('off-record speakers produce blocked quotes; attribution lines follow the agreement', () => {
  const q = extractQuotes(segs, { speakerAttribution: { Lee: 'OFF_RECORD' } });
  assert.ok(q.length > 0 && q.every(x => quoteBlocked(x)));
  const bg = extractQuotes(segs, { speakerAttribution: { Lee: 'BACKGROUND' } })[0];
  assert.equal(quoteBlocked(bg), null);
  assert.match(attributionLine(bg), /familiar with the matter/);
  assert.equal(attributionLine({ ...bg, attribution: 'ON_RECORD' }, 'Pat Lee', 'a library patron'), 'Pat Lee, a library patron, said');
});

test('verifyQuote detects altered quotes', () => {
  assert.equal(verifyQuote('the city never listened to the people who use that library every day', segs).exact, true);
  const altered = verifyQuote('the city always ignored the people who use that library every day', segs);
  assert.equal(altered.exact, false); assert.ok(altered.score < 1 && altered.score > 0.5);
  assert.equal(verifyQuote('', segs).best, null);
});

// ── vault crypto ────────────────────────────────────────────────────────────

test('vault: seal/open round trip, wrong passphrase and tampering fail, ciphertext hides plaintext', async () => {
  const data = { contact: 'signal:+1-555-0100', notes: 'works in the planning office' };
  const env = await seal(data, 'correct horse battery staple', 2000);
  assert.ok(!JSON.stringify(env).includes('planning office'));
  assert.deepEqual(await open(env, 'correct horse battery staple'), data);
  await assert.rejects(open(env, 'wrong wrong wrong wrong'), /Wrong passphrase/);
  const bytes = Buffer.from(env.ct, 'base64'); bytes[0] ^= 1;
  await assert.rejects(open({ ...env, ct: bytes.toString('base64') }, 'correct horse battery staple'), /altered/);
  const env2 = await seal(data, 'correct horse battery staple', 2000);
  assert.notEqual(env.salt, env2.salt); assert.notEqual(env.ct, env2.ct);   // fresh salt + IV every time
  assert.ok(passphraseProblem('short')); assert.equal(passphraseProblem('a decent passphrase here'), null);
  await assert.rejects(seal(data, 'short', 2000), /12 characters/);
});

import { parseTranscript } from '../services/journalist/quotes';
import { deadlineState, canMoveTo, nextStage, canTransitionPitch, storyFromPitch, stalePitches } from '../services/journalist/deskLogic';

test('parseTranscript: timed lines with speakers, and untimed lines get estimated times', () => {
  const t = parseTranscript('[00:05] Reporter: How are you?\n[01:10] Lee: Honestly I think the city never listened.\n1:02:03 Last line');
  assert.equal(t.estimated, false);
  assert.deepEqual(t.segments.map(s => s.start), [5, 70, 3723]);
  assert.equal(t.segments[1].speaker, 'Lee');
  assert.equal(t.segments[0].end, 70);
  const u = parseTranscript('one\ntwo\nthree\nfour', 40);
  assert.equal(u.estimated, true);
  assert.deepEqual(u.segments.map(s => s.start), [0, 10, 20, 30]);
});

test('desk: deadlines, stage moves, publish is gated, pitch flow', () => {
  const now = 1_000_000_000;
  assert.equal(deadlineState(undefined, 'DRAFT', now), 'none');
  assert.equal(deadlineState(now - 1, 'DRAFT', now), 'overdue');
  assert.equal(deadlineState(now + 3_600_000, 'DRAFT', now), 'soon');
  assert.equal(deadlineState(now + 3 * 86_400_000, 'DRAFT', now), 'ok');
  assert.equal(deadlineState(now - 1, 'PUBLISHED', now), 'done');
  assert.equal(nextStage('PITCH', -1), null); assert.equal(nextStage('LEGAL', 1), 'SCHEDULED');
  assert.equal(canMoveTo('EDIT', 'LEGAL').ok, true);
  assert.equal(canMoveTo('LEGAL', 'SCHEDULED').ok, false);
  assert.equal(canMoveTo('LEGAL', 'PUBLISHED').ok, false);
  assert.equal(canMoveTo('PUBLISHED', 'EDIT').ok, false);
  assert.ok(canTransitionPitch('DRAFT', 'SUBMITTED') && canTransitionPitch('SUBMITTED', 'ACCEPTED'));
  assert.ok(!canTransitionPitch('DRAFT', 'ACCEPTED') && !canTransitionPitch('KILLED', 'ACCEPTED'));
  const p = { id: 'p1', ownerId: 'u', headline: 'Why the Eastside branch closed!', angle: 'Budget math', status: 'ACCEPTED' as const, createdAt: 1, updatedAt: 1, responseDue: now - 5 };
  const s = storyFromPitch(p, { id: 's1', now: 5, assigneeId: 'u2' });
  assert.equal(s.slug, 'why-the-eastside-branch-closed'); assert.equal(s.stage, 'ASSIGNED'); assert.equal(s.pitchId, 'p1');
  assert.equal(storyFromPitch(p, { id: 's2', now: 5 }).stage, 'PITCH');
  assert.equal(stalePitches([{ ...p, status: 'SUBMITTED' }, p], now).length, 1);
});

import { parseJsonStringList, groundInText } from '../services/journalist/aiAssist';

test('AI output is parsed defensively and grounded in the copy', () => {
  assert.deepEqual(parseJsonStringList('```json\n["The budget is $4 million this year.", "short"]\n```'), ['The budget is $4 million this year.']);
  assert.deepEqual(parseJsonStringList('Sure! Here you go: nope'), []);
  assert.deepEqual(parseJsonStringList('[1, 2, {"a":1}]'), []);
  assert.deepEqual(parseJsonStringList(null), []);
  const text = 'The budget is $4 million this year. Residents were upset.';
  assert.deepEqual(groundInText(['The budget is $4 million this year.', 'The budget is $9 million this year.'], text), ['The budget is $4 million this year.']);
});
