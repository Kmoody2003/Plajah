import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decideSafety, combineDecisions, maxScores, moderationStatusFor, moderationVisibility, isModerationHiddenFor,
  escalateMinorSafetyReport, GORE_EXTREME, GORE_GRAPHIC, SEXUAL_EXPLICIT, MINOR_REPORTS_TO_HIDE,
  type GeminiSignal, type SafetyContext,
} from '../services/safety/safetyPolicy';
import {
  preserveUntilMs, buildCyberTipXml, parseCyberTipResponse, caseMetadataView, PRESERVE_DAYS, type CsamCase,
} from '../services/safety/csamCaseCore';
import { parseGeminiSignal, geminiSafetyPrompt } from '../services/safety/mediaSafetyServer';
import { storagePathFromUrl } from '../services/safety/safetyServerIo';

const post: SafetyContext = { surface: 'post' };
const g = (o: Partial<GeminiSignal>): GeminiSignal => ({ verdict: 'safe', isArtistic: false, minorsPresent: 'none', realVsFictional: 'unclear', reason: '', ...o });

// ── CSAM ──────────────────────────────────────────────────────────────────────

test('hash match alone → csam_block_and_report, regardless of classifiers', () => {
  const d = decideSafety({ hashMatch: { source: 'photodna', matched: true }, gemini: g({ verdict: 'safe', isArtistic: true }) }, post);
  assert.equal(d.action, 'csam_block_and_report');
  assert.equal(d.display, 'hidden');
  assert.equal(d.reviewQueue, 'csam');
});

test('non-matching hash does not trigger anything', () => {
  const d = decideSafety({ hashMatch: [{ source: 'photodna', matched: false }], openai: { sexual: 0.01 } }, post);
  assert.equal(d.action, 'allow');
});

test('gemini sexualized_minor + openai sexual agreement (non-fictional) → csam_block_and_report', () => {
  const d = decideSafety({ gemini: g({ verdict: 'sexualized_minor', minorsPresent: 'likely', realVsFictional: 'real' }), openai: { sexual: 0.7 } }, post);
  assert.equal(d.action, 'csam_block_and_report');
});

test('gemini sexualized_minor alone → hidden human review in csam queue, NOT a report', () => {
  const d = decideSafety({ gemini: g({ verdict: 'sexualized_minor', minorsPresent: 'likely' }), openai: { sexual: 0.1 } }, post);
  assert.equal(d.action, 'human_review');
  assert.equal(d.display, 'hidden');
  assert.equal(d.reviewQueue, 'csam');
});

test('fictional sexualized minor with agreement → hidden csam review (human decides reportability)', () => {
  const d = decideSafety({ gemini: g({ verdict: 'sexualized_minor', realVsFictional: 'fictional' }), openai: { sexual: 0.9 } }, post);
  assert.equal(d.action, 'human_review');
  assert.equal(d.display, 'hidden');
});

test('openai sexual alone never produces a CSAM action', () => {
  const d = decideSafety({ openai: { sexual: 0.99 } }, post);
  assert.notEqual(d.action, 'csam_block_and_report');
  assert.notEqual(d.action, 'block');
});

test('gemini PROHIBITED_CONTENT refusal → hidden csam review, never auto-report', () => {
  const d = decideSafety({ geminiRefused: 'prohibited', openai: { sexual: 0.2 } }, post);
  assert.equal(d.action, 'human_review');
  assert.equal(d.display, 'hidden');
  assert.equal(d.reviewQueue, 'csam');
});

test('family photo: minors present but nothing sexual → allow', () => {
  const d = decideSafety({ gemini: g({ minorsPresent: 'likely', realVsFictional: 'real' }), openai: { sexual: 0.02 } }, post);
  assert.equal(d.action, 'allow');
});

// ── Gore vs art ──────────────────────────────────────────────────────────────

test('horror art / SFX makeup with high gore score → blur interstitial, never removed', () => {
  const d = decideSafety({ openai: { 'violence/graphic': 0.97 }, gemini: g({ verdict: 'graphic_fictional', isArtistic: true, realVsFictional: 'fictional' }) }, post);
  assert.equal(d.action, 'blur_interstitial');
  assert.deepEqual(d.labels, ['GRAPHIC_VIOLENCE']);
  assert.equal(d.reviewQueue, 'none');
});

test('creator-labelled gore art → label only (existing viewer gate handles it)', () => {
  const d = decideSafety({ openai: { 'violence/graphic': 0.95 }, gemini: g({ verdict: 'graphic_fictional', isArtistic: true, realVsFictional: 'fictional' }) },
    { surface: 'post', creatorLabels: ['GRAPHIC_VIOLENCE'] });
  assert.equal(d.action, 'label');
});

test('single gore classifier score (no gemini) → blurred + review, NOT removed', () => {
  const d = decideSafety({ openai: { 'violence/graphic': 0.99 } }, post);
  assert.equal(d.action, 'human_review');
  assert.equal(d.display, 'blur');
});

test('real-world extreme gore with two-signal agreement → block', () => {
  const d = decideSafety({ openai: { 'violence/graphic': GORE_EXTREME + 0.05 }, gemini: g({ verdict: 'graphic_real', realVsFictional: 'real' }) }, post);
  assert.equal(d.action, 'block');
  assert.equal(moderationStatusFor(d), 'blocked');
});

test('gemini says real but openai below extreme → review with blur, priority', () => {
  const d = decideSafety({ openai: { 'violence/graphic': GORE_GRAPHIC }, gemini: g({ verdict: 'graphic_real', realVsFictional: 'real' }) }, post);
  assert.equal(d.action, 'human_review');
  assert.equal(d.display, 'blur');
  assert.equal(d.reviewQueue, 'priority');
});

test('anatomy / medical education is not blocked', () => {
  const d = decideSafety({ openai: { 'violence/graphic': 0.92 }, gemini: g({ verdict: 'sensitive_artistic', isArtistic: true, realVsFictional: 'real' }) }, post);
  assert.equal(d.action, 'blur_interstitial');
});

test('action film / boxing (non-graphic violence) → label only', () => {
  const d = decideSafety({ openai: { violence: 0.8, 'violence/graphic': 0.1 } }, post);
  assert.equal(d.action, 'label');
});

// ── Sexual / nudity ──────────────────────────────────────────────────────────

test('figure drawing → artistic nudity interstitial, not blocked', () => {
  const d = decideSafety({ openai: { sexual: 0.9 }, gemini: g({ verdict: 'sensitive_artistic', isArtistic: true, realVsFictional: 'fictional' }) }, post);
  assert.equal(d.action, 'blur_interstitial');
  assert.deepEqual(d.labels, ['ARTISTIC_NUDITY']);
});

test('fashion / swimwear (moderate sexual score) → MATURE_18 label only', () => {
  const d = decideSafety({ openai: { sexual: 0.65 }, gemini: g({ verdict: 'safe' }) }, post);
  assert.equal(d.action, 'label');
  assert.deepEqual(d.labels, ['MATURE_18']);
});

test('explicit adult porn with two signals → block', () => {
  const d = decideSafety({ openai: { sexual: SEXUAL_EXPLICIT + 0.1 }, gemini: g({ verdict: 'sexual_adult', realVsFictional: 'real' }) }, post);
  assert.equal(d.action, 'block');
});

test('explicit score but one signal → review behind blur', () => {
  const d = decideSafety({ openai: { sexual: 0.95 } }, post);
  assert.equal(d.action, 'human_review');
  assert.equal(d.display, 'blur');
});

test('avatar surface cannot host an interstitial → hidden review instead', () => {
  const d = decideSafety({ openai: { sexual: 0.9 }, gemini: g({ verdict: 'sensitive_artistic', isArtistic: true }) }, { surface: 'avatar' });
  assert.equal(d.action, 'human_review');
  assert.equal(d.display, 'hidden');
});

// ── Self-harm, failure modes ─────────────────────────────────────────────────

test('self-harm instructions → hidden priority review', () => {
  const d = decideSafety({ openai: { 'self-harm/instructions': 0.8 } }, post);
  assert.equal(d.display, 'hidden');
  assert.equal(d.reviewQueue, 'priority');
});

test('no provider signal → allow but scanComplete=false (sweep retries), never "approved" silently', () => {
  const d = decideSafety({ providerErrors: ['openai:http_500', 'gemini:timeout'] }, post);
  assert.equal(d.action, 'allow');
  assert.equal(d.scanComplete, false);
});

test('partial scan (one provider failed) → scanComplete=false', () => {
  const d = decideSafety({ openai: { sexual: 0.01 }, providerErrors: ['photodna:http_503'] }, post);
  assert.equal(d.action, 'allow');
  assert.equal(d.scanComplete, false);
});

test('gemini uncertain → stays up, standard review', () => {
  const d = decideSafety({ gemini: g({ verdict: 'uncertain', reason: 'low light' }) }, post);
  assert.equal(d.action, 'human_review');
  assert.equal(d.display, 'normal');
});

// ── Combining + visibility ───────────────────────────────────────────────────

test('combineDecisions: worst action wins, labels union, completeness ANDed', () => {
  const a = decideSafety({ openai: { sexual: 0.65 } }, post);
  const b = decideSafety({ openai: { 'violence/graphic': 0.95 }, gemini: g({ verdict: 'graphic_fictional', isArtistic: true }) }, post);
  const c = decideSafety({ providerErrors: ['x'] }, post);
  const m = combineDecisions([a, b, c]);
  assert.equal(m.action, 'blur_interstitial');
  assert.deepEqual(new Set(m.labels), new Set(['MATURE_18', 'GRAPHIC_VIOLENCE']));
  assert.equal(m.scanComplete, false);
  assert.equal(combineDecisions([]).action, 'allow');
});

test('maxScores takes the worst frame per category', () => {
  assert.deepEqual(maxScores([{ sexual: 0.1, violence: 0.9 }, undefined, { sexual: 0.4 }]), { sexual: 0.4, violence: 0.9 });
  assert.equal(maxScores([undefined]), undefined);
});

test('public status never reveals a CSAM case', () => {
  const d = decideSafety({ hashMatch: { source: 'photodna', matched: true } }, post);
  assert.equal(moderationStatusFor(d), 'blocked');
});

test('visibility mapping + author exception', () => {
  assert.equal(moderationVisibility('blur_interstitial'), 'interstitial');
  assert.equal(moderationVisibility('label'), 'label');
  assert.equal(moderationVisibility('removed'), 'hidden');
  assert.equal(moderationVisibility(undefined), 'show');
  assert.equal(moderationVisibility('pending_review'), 'show');
  assert.equal(isModerationHiddenFor('blocked', false), true);
  assert.equal(isModerationHiddenFor('blocked', true), false);
});

test('report escalation: reports alone never file a case; enough reporters hide pending review', () => {
  assert.deepEqual(escalateMinorSafetyReport({ distinctReporters: 1 }), { hide: false, queue: 'csam', fileCase: false });
  assert.equal(escalateMinorSafetyReport({ distinctReporters: MINOR_REPORTS_TO_HIDE }).hide, true);
  const scan = decideSafety({ gemini: g({ verdict: 'sexualized_minor' }) }, post);
  assert.deepEqual(escalateMinorSafetyReport({ distinctReporters: 1, scan }), { hide: true, queue: 'csam', fileCase: false });
  const hit = decideSafety({ hashMatch: { source: 'photodna', matched: true } }, post);
  assert.equal(escalateMinorSafetyReport({ distinctReporters: 1, scan: hit }).fileCase, true);
});

// ── CSAM case core ───────────────────────────────────────────────────────────

const sampleCase: CsamCase = {
  id: 'case_abc', status: 'pending_report', detectedAt: Date.UTC(2026, 9, 8), preserveUntil: 0,
  detection: { source: 'hash:photodna', reason: 'hash match (photodna)' },
  uploaderUid: 'uid<1>', uploaderIp: '203.0.113.9', surface: 'post', target: { collection: 'posts', id: 'p1' },
  original: { storagePath: 'posts/uid/x.jpg', url: null, contentType: 'image/jpeg', size: 10 },
  quarantine: { storagePath: 'safety_quarantine/case_abc/x.jpg', state: 'moved', note: '' },
  hashes: { md5: 'deadbeef', sha256: 'cafe', photodnaTrackingId: 't1' },
  ncmec: { env: 'manual', reportId: null, submittedAt: null, lastError: null },
};

test('preservation is one year (REPORT Act)', () => {
  assert.equal(preserveUntilMs(0), PRESERVE_DAYS * 86_400_000);
  assert.equal(PRESERVE_DAYS, 365);
});

test('CyberTip XML escapes values and carries the uploader + IP', () => {
  const xml = buildCyberTipXml(sampleCase, { email: 'safety@plajah.com' });
  assert.match(xml, /<espIdentifier>uid&lt;1&gt;<\/espIdentifier>/);
  assert.match(xml, /<ipAddress>203\.0\.113\.9<\/ipAddress>/);
  assert.match(xml, /<incidentDateTime>2026-10-08T00:00:00\.000Z<\/incidentDateTime>/);
  assert.doesNotMatch(xml, /safety_quarantine/);
});

test('CyberTip response parsing', () => {
  const r = parseCyberTipResponse('<reportResponse><responseCode>0</responseCode><responseDescription>Success</responseDescription><reportId>4564654</reportId></reportResponse>');
  assert.deepEqual(r, { responseCode: 0, reportId: '4564654', fileId: null, description: 'Success' });
});

test('admin case view exposes no media locators', () => {
  const v = JSON.stringify(caseMetadataView(sampleCase));
  for (const s of ['posts/uid/x.jpg', 'safety_quarantine', 'deadbeef', 'cafe', '203.0.113.9']) assert.ok(!v.includes(s), s);
});

// ── Provider parsing ─────────────────────────────────────────────────────────

test('gemini JSON parsing is strict on verdict, lenient elsewhere', () => {
  assert.equal(parseGeminiSignal('{"verdict":"nope"}'), null);
  assert.equal(parseGeminiSignal('not json'), null);
  const s = parseGeminiSignal('{"verdict":"graphic_fictional","isArtistic":true,"minorsPresent":"x","realVsFictional":"fictional","reason":"sfx"}');
  assert.equal(s?.verdict, 'graphic_fictional');
  assert.equal(s?.minorsPresent, 'possible'); // unknown → cautious
});

test('gemini prompt protects creative work and never asks for descriptions', () => {
  const p = geminiSafetyPrompt({ surface: 'post' }, 1);
  assert.match(p, /special-effects makeup/);
  assert.match(p, /figure drawing/);
  assert.match(p, /Never describe/);
});

test('storagePathFromUrl handles Firebase + GCS forms and rejects other buckets/hosts', () => {
  const b = 'gen-lang-client-0665118474.firebasestorage.app';
  assert.equal(storagePathFromUrl(`https://firebasestorage.googleapis.com/v0/b/${b}/o/posts%2Fu1%2Fa.jpg?alt=media&token=t`, b), 'posts/u1/a.jpg');
  assert.equal(storagePathFromUrl(`https://storage.googleapis.com/${b}/posts/u1/a.jpg`, b), 'posts/u1/a.jpg');
  assert.equal(storagePathFromUrl(`https://firebasestorage.googleapis.com/v0/b/other/o/x.jpg`, b), null);
  assert.equal(storagePathFromUrl('https://evil.example/x.jpg', b), null);
  assert.equal(storagePathFromUrl('not a url', b), null);
});
