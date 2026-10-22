// studentDesk — the Student Newsroom's pure engine: story model, band-tuned coach, minor-safety
// review, editorial workflow and the distribution gate. No I/O; the store and the UI call in.
//
// The coach REUSES the pro Journalist Desk's linters (styleChecker, factCheck, headlineTester) and
// turns their volume to fit the reporter's band: a PreK reporter sees two friendly prompts, a
// university reporter sees every AP-style and claim flag the professional desk shows.
//
// Safety posture (taught in jr-notice-5 and enforced here):
//   - Minors' stories reach any audience beyond the classroom only after a teacher or guardian
//     signs off, and reporting about other people uses first names only, with recorded consent.
//   - Contact details (phones, emails, street addresses) never leave the desk in a minor's story.
//   - Child accounts cannot post to the public feed from here at all; they distribute by print
//     and by the teacher-sent family newsletter. Adults can graduate to the Journalist Desk.

import type { DepthLevel } from '../dossier/dossierTypes';
import { checkStyle, type StyleIssue } from '../journalist/styleChecker';
import { scoreHeadline } from '../journalist/headlineTester';
import { detectCheckableClaims } from '../journalist/factCheck';
import { kitById, type StoryKit } from './storyKits';

// ── Model ─────────────────────────────────────────────────────────────────────
export type StoryStage = 'DRAFT' | 'EDITING' | 'REVIEW' | 'APPROVED' | 'PUBLISHED';
export const STAGE_ORDER: StoryStage[] = ['DRAFT', 'EDITING', 'REVIEW', 'APPROVED', 'PUBLISHED'];
export const STAGE_LABEL: Record<StoryStage, string> = {
  DRAFT: 'Drafting', EDITING: 'Peer edit', REVIEW: 'Teacher review', APPROVED: 'Approved', PUBLISHED: 'Published',
};

export interface StorySource {
  id: string;
  name: string;
  role: string;
  /** How the reporter knows what this source said. */
  how: 'saw' | 'interview' | 'document' | 'told' | 'online';
  /** The source agreed to be in the story. Required for every person in a minor's story. */
  consent: boolean;
  primary: boolean;
  /** A minor in the story: first name only, always. */
  isMinor?: boolean;
}

export interface StoryQuote { id: string; text: string; speakerId: string; readBack: boolean }

export interface FiveWs { who: string; what: string; when: string; where: string; why: string; how: string }

export interface StudentStory {
  id: string;
  kitId: string;
  band: DepthLevel;
  authorId: string;
  authorName: string;
  headline: string;
  dek: string;
  lede: string;
  body: string;
  caption: string;
  /** Data URL of a drawing or photo (picture news, features). Kept small by the UI. */
  picture?: string;
  pictureEdited?: boolean;
  aiUsed?: boolean;
  fiveWs: FiveWs;
  counterpoint: string;
  sources: StorySource[];
  quotes: StoryQuote[];
  checklist: Record<string, boolean>;
  stage: StoryStage;
  /** Editor and teacher notes, newest last. */
  notes: { by: string; text: string; at: number }[];
  /**
   * Sign-off. Required for minors before anything leaves the classroom. `byUid` is present only
   * when the approval came from the teacher's own account through an Academia assignment
   * (applyTeacherReview); a sign-off typed at the reporter's desk has no uid.
   */
  approval?: { by: string; role: 'teacher' | 'guardian' | 'editor'; at: number; byUid?: string };
  /** Hint from the lesson or assignment that opened this story, so turn-in preselects it. */
  assignmentId?: string;
  /** The latest turn-in to an Academia assignment (templateSubmissions). */
  submission?: { id: string; assignmentId: string; title: string; className: string; at: number; decision?: 'approved' | 'changes'; reviewAt?: number };
  /** Corrections filed after publication. Never deleted. */
  corrections: { text: string; at: number }[];
  /** Where it has gone. */
  distributed: Partial<Record<Channel, number>>;
  createdAt: number;
  updatedAt: number;
}

export type Channel = 'print' | 'newsletter' | 'classWall' | 'broadcast' | 'journalistDesk';

export const CHANNEL_META: Record<Channel, { label: string; blurb: string; emoji: string }> = {
  print: { label: 'Print edition', blurb: 'Lay out a front page and print it or save a PDF.', emoji: '🖨️' },
  newsletter: { label: 'Family / reader newsletter', blurb: 'A ready-to-send email issue, sent by the teacher or your publication.', emoji: '✉️' },
  classWall: { label: 'Student wall (#journalismschool)', blurb: 'Post to the School of Journalism wall in the Plajah feed.', emoji: '📌' },
  broadcast: { label: 'Broadcast in Fabula', blurb: 'Record the script as a newscast or podcast.', emoji: '📻' },
  journalistDesk: { label: 'Journalist Desk', blurb: 'Move the story to the professional desk to publish under your byline with full syndication.', emoji: '🏛️' },
};

const uid = () => Math.random().toString(36).slice(2, 10);

export function newStory(kit: StoryKit, band: DepthLevel, author: { id: string; name: string }, now = Date.now()): StudentStory {
  return {
    id: `st_${now.toString(36)}_${uid()}`, kitId: kit.id, band, authorId: author.id, authorName: author.name,
    headline: '', dek: '', lede: '', body: '', caption: '', counterpoint: '',
    fiveWs: { who: '', what: '', when: '', where: '', why: '', how: '' },
    sources: [], quotes: [], checklist: {}, stage: 'DRAFT', notes: [], corrections: [], distributed: {},
    createdAt: now, updatedAt: now,
  };
}

export const newSource = (): StorySource => ({ id: uid(), name: '', role: '', how: 'interview', consent: false, primary: true });
export const newQuote = (speakerId = ''): StoryQuote => ({ id: uid(), text: '', speakerId, readBack: false });

/** All prose in a story, in reading order. */
export function storyText(s: StudentStory): string {
  return [s.lede, s.body, s.counterpoint, s.caption].filter(t => t.trim()).join('\n\n');
}
export const wordCount = (t: string): number => t.trim().split(/\s+/).filter(Boolean).length;

// ── Coach ─────────────────────────────────────────────────────────────────────
export type CoachTone = 'praise' | 'nudge' | 'fix';
export interface CoachNote { tone: CoachTone; text: string; rule?: string; match?: string }

const BAND_RANK: Record<DepthLevel, number> = { early: 0, elementary: 1, middle: 2, high: 3, university: 4 };

/** How much of the pro desk's linting this band sees. */
const LINT_FOR_BAND: Record<DepthLevel, { style: boolean; claims: boolean; maxNotes: number }> = {
  early: { style: false, claims: false, maxNotes: 3 },
  elementary: { style: false, claims: true, maxNotes: 5 },
  middle: { style: true, claims: true, maxNotes: 8 },
  high: { style: true, claims: true, maxNotes: 14 },
  university: { style: true, claims: true, maxNotes: 30 },
};

const styleNote = (i: StyleIssue): CoachNote => ({ tone: i.severity === 'error' ? 'fix' : 'nudge', text: i.suggestion ? `${i.message} Try: “${i.suggestion}”.` : i.message, rule: i.rule, match: i.match });

export function coach(s: StudentStory): CoachNote[] {
  const kit = kitById(s.kitId);
  const lint = LINT_FOR_BAND[s.band];
  const notes: CoachNote[] = [];
  const text = storyText(s);
  const words = wordCount(text);
  const young = BAND_RANK[s.band] <= 1;

  // Shape and completeness — every band.
  if (kit?.fields.includes('fiveWs')) {
    const missing = (Object.keys(s.fiveWs) as (keyof FiveWs)[]).filter(k => !s.fiveWs[k].trim());
    if (missing.length && missing.length < 6) notes.push({ tone: 'nudge', text: `Still to answer: ${missing.join(', ')}. “I don’t know yet” is an honest answer.` });
    else if (!missing.length) notes.push({ tone: 'praise', text: 'All six questions answered.' });
  }
  if (kit?.fields.includes('caption')) {
    if (!s.caption.trim()) notes.push({ tone: 'nudge', text: young ? 'Write one sentence: who is in the picture and what are they doing?' : 'Add a caption: who and what, left to right.' });
    else if (!/\b(is|are|was|were|has|have|did|does|\w+ed|\w+s)\b/i.test(s.caption)) notes.push({ tone: 'nudge', text: 'Does your caption say what is happening? Add an action word.' });
  }
  if (kit?.fields.includes('lede') || kit?.fields.includes('fiveWs')) {
    const lw = wordCount(s.lede);
    if (!lw) notes.push({ tone: 'nudge', text: young ? 'Write your first sentence. Start with the most important thing.' : 'Write the lede: the most important news, first.' });
    else if (lw > (young ? 30 : 35)) notes.push({ tone: 'fix', text: `Your lede is ${lw} words. Try to get it under ${young ? 30 : 35}.` });
    else if (/^(on|this|there (is|was|were)|today|yesterday|in)\b/i.test(s.lede.trim())) notes.push({ tone: 'nudge', text: 'Your lede warms up before the news. Can it start with who or what?' });
    else notes.push({ tone: 'praise', text: 'Strong, short lede.' });
  }
  if (kit && words && words < kit.words[0]) notes.push({ tone: 'nudge', text: `About ${kit.words[0] - words} more words would round this out.` });
  if (kit && words > kit.words[1]) notes.push({ tone: 'nudge', text: `This is ${words - kit.words[1]} words over the kit’s target. What could an editor cut from the bottom?` });

  // Headline — reuses the pro headline scorer.
  if (s.headline.trim()) {
    const h = scoreHeadline(s.headline);
    if (/\?\s*$/.test(s.headline)) notes.push({ tone: 'nudge', text: 'A question headline promises an answer. Does the story give one?' });
    const bait = /\b(you won.?t believe|shocking|insane|must see)\b/i.test(s.headline);
    if (bait) notes.push({ tone: 'fix', text: 'That sounds like clickbait. Promise only what the story delivers.' });
    // The pro checker has its own clickbait rule; skip it when ours already spoke.
    const proIssues = h.issues.filter(i => !(bait && /clickbait/i.test(i.message)));
    if (BAND_RANK[s.band] >= 2) proIssues.slice(0, 2).forEach(i => notes.push(styleNote(i)));
    if (BAND_RANK[s.band] >= 2 && h.score >= 80 && !bait && !proIssues.length) notes.push({ tone: 'praise', text: `Headline scores ${h.score}/100 and fits search results.` });
  } else if (kit?.form !== 'picture-news') notes.push({ tone: 'nudge', text: 'Add a headline.' });

  // Sources and quotes.
  if (kit?.fields.includes('sources') && BAND_RANK[s.band] >= 1) {
    if (!s.sources.length) notes.push({ tone: 'nudge', text: young ? 'Who told you, or how do you know? Add a source.' : 'Add your sources: who said or showed you each fact?' });
    else if (BAND_RANK[s.band] >= 2 && s.sources.filter(x => x.primary).length < 2 && kit.form !== 'opinion') notes.push({ tone: 'nudge', text: 'Find a second independent primary source for your most important fact.' });
  }
  const unread = s.quotes.filter(q => q.text.trim() && !q.readBack).length;
  if (unread) notes.push({ tone: 'fix', text: `${unread} quote${unread > 1 ? 's' : ''} not read back to the speaker yet.` });
  if (/\b(claimed|admitted|confessed)\b/i.test(text) && BAND_RANK[s.band] >= 2) notes.push({ tone: 'nudge', text: '“Claimed” and “admitted” add your opinion. “Said” is the neutral attribution.', rule: 'attribution' });
  if (kit?.form === 'opinion' && !s.counterpoint.trim()) notes.push({ tone: 'fix', text: 'State the strongest counterargument, fairly, then answer it.' });

  // Claims worth checking — reuses the pro desk's detector.
  if (lint.claims && text) {
    const claims = detectCheckableClaims(text).slice(0, BAND_RANK[s.band] >= 3 ? 6 : 3);
    for (const cl of claims) notes.push({ tone: 'nudge', text: `Check this: “${cl.text.slice(0, 90)}${cl.text.length > 90 ? '…' : ''}” (${cl.reasons.join(', ')}).`, rule: 'claim', match: cl.text });
  }

  // AP-style basics.
  if (lint.style && text) {
    const rep = checkStyle(text);
    rep.issues.filter(i => BAND_RANK[s.band] >= 3 || i.severity !== 'info').forEach(i => notes.push(styleNote(i)));
    if (BAND_RANK[s.band] >= 3 && rep.stats.avgSentenceWords > 25) notes.push({ tone: 'nudge', text: `Average sentence is ${Math.round(rep.stats.avgSentenceWords)} words. Readers do better under about 20.` });
  }

  const fixes = notes.filter(n => n.tone === 'fix');
  const rest = notes.filter(n => n.tone !== 'fix');
  return [...fixes, ...rest].slice(0, lint.maxNotes);
}

// ── Minor safety ──────────────────────────────────────────────────────────────
export interface SafetyFinding { severity: 'block' | 'warn'; text: string }

const PHONE = /\b(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;
const EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/;
const STREET = /\b\d{1,5}\s+(?:[A-Z][a-z]+\s){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Drive|Dr|Court|Ct|Boulevard|Blvd|Way)\b\.?/;

export function safetyReview(s: StudentStory, ctx: { authorIsMinor: boolean }): SafetyFinding[] {
  const out: SafetyFinding[] = [];
  const text = [s.headline, s.dek, storyText(s), ...s.quotes.map(q => q.text)].join('\n');
  if (ctx.authorIsMinor) {
    if (PHONE.test(text)) out.push({ severity: 'block', text: 'Remove the phone number. Contact details stay out of student stories.' });
    if (EMAIL.test(text)) out.push({ severity: 'block', text: 'Remove the email address.' });
    if (STREET.test(text)) out.push({ severity: 'block', text: 'Remove the street address. Say the neighbourhood or “near school” instead.' });
  }
  for (const src of s.sources) {
    if (!src.name.trim()) continue;
    if (!src.consent && (ctx.authorIsMinor || src.isMinor)) out.push({ severity: 'block', text: `Ask ${src.name.split(' ')[0]} “Can I put you in the news?” and tick consent.` });
    if (src.isMinor && /\s\S/.test(src.name.trim())) out.push({ severity: 'block', text: `Use first names only for students: “${src.name.trim().split(/\s+/)[0]}”.` });
  }
  if (s.pictureEdited) out.push({ severity: 'warn', text: 'You said the picture was edited. If the edit changes what happened, label it as an illustration.' });
  if (s.aiUsed) out.push({ severity: 'warn', text: 'AI helped with this story. It will carry an AI-use note when published.' });
  return out;
}

// ── Workflow ──────────────────────────────────────────────────────────────────
export interface StageCheck { ok: boolean; reasons: string[] }

/** Can the story advance from its current stage? Pure; the UI explains the reasons. */
export function canAdvance(s: StudentStory, ctx: { authorIsMinor: boolean }): StageCheck {
  const kit = kitById(s.kitId);
  const reasons: string[] = [];
  if (s.stage === 'DRAFT') {
    if (!storyText(s).trim() && !s.picture) reasons.push('Write something first.');
    if (kit?.form !== 'picture-news' && !s.headline.trim()) reasons.push('Add a headline.');
  }
  if (s.stage === 'EDITING' && kit) {
    const open = kit.checklist.filter(item => !s.checklist[item]);
    if (open.length) reasons.push(`Tick the editor’s checklist (${open.length} left).`);
  }
  if (s.stage === 'REVIEW' && !s.approval) reasons.push('Waiting for a teacher, guardian or editor to sign off.');
  if (s.stage === 'APPROVED' || s.stage === 'PUBLISHED') reasons.push('Distribute from the Press Room.');
  for (const f of safetyReview(s, ctx)) if (f.severity === 'block') reasons.push(f.text);
  return { ok: reasons.length === 0, reasons };
}

export function advance(s: StudentStory, ctx: { authorIsMinor: boolean }, now = Date.now()): StudentStory {
  if (!canAdvance(s, ctx).ok) return s;
  const i = STAGE_ORDER.indexOf(s.stage);
  return { ...s, stage: STAGE_ORDER[Math.min(i + 1, STAGE_ORDER.indexOf('APPROVED'))], updatedAt: now };
}

export function sendBack(s: StudentStory, note: { by: string; text: string }, now = Date.now()): StudentStory {
  return { ...s, stage: 'DRAFT', approval: undefined, notes: [...s.notes, { ...note, at: now }], updatedAt: now };
}

/**
 * Sign-off. The signer must not be the author: a reporter cannot approve their own story. In this
 * build the signer is the signed-in account on the device the teacher or guardian is using.
 */
export function signOff(s: StudentStory, by: { id: string; name: string; role: 'teacher' | 'guardian' | 'editor' }, now = Date.now()): StudentStory {
  if (by.id === s.authorId) return s;
  if (s.stage !== 'REVIEW') return s;
  return { ...s, approval: { by: by.name, role: by.role, at: now }, stage: 'APPROVED', updatedAt: now };
}

// ── Academia review ───────────────────────────────────────────────────────────
/** What a teacher sees: the story frozen at turn-in. Pictures over ~300 KB are left out. */
export interface NewsroomSnapshot {
  storyId: string; kitId: string; band: DepthLevel;
  headline: string; dek: string; lede: string; body: string; caption: string; counterpoint: string;
  fiveWs: FiveWs; sources: StorySource[]; quotes: StoryQuote[];
  aiUsed: boolean; pictureEdited: boolean; picture: string | null;
}
export interface NewsroomReview { decision: 'approved' | 'changes'; note: string; byUid: string; byName: string; at: number }

export function toSnapshot(s: StudentStory): NewsroomSnapshot {
  return {
    storyId: s.id, kitId: s.kitId, band: s.band,
    headline: s.headline, dek: s.dek, lede: s.lede, body: s.body, caption: s.caption, counterpoint: s.counterpoint,
    fiveWs: s.fiveWs, sources: s.sources, quotes: s.quotes,
    aiUsed: !!s.aiUsed, pictureEdited: !!s.pictureEdited,
    picture: s.picture && s.picture.length < 300_000 ? s.picture : null,
  };
}

/** Rebuild a readable story from a snapshot (teacher preview; reuses storyText/safetyReview/coach). */
export function fromSnapshot(snap: NewsroomSnapshot, author: { id: string; name: string }): StudentStory {
  return {
    ...newStory(kitById(snap.kitId) || { id: snap.kitId } as StoryKit, snap.band, author, 0),
    ...snap, id: snap.storyId, picture: snap.picture || undefined, stage: 'REVIEW',
  };
}

/** The story now waits on the teacher's account. */
export function markTurnedIn(s: StudentStory, sub: { id: string; assignmentId: string; title: string; className: string }, now = Date.now()): StudentStory {
  return { ...s, stage: 'REVIEW', approval: undefined, submission: { ...sub, at: now }, updatedAt: now };
}

/**
 * Apply the teacher's decision from their account to the reporter's local story. Idempotent: a
 * decision already applied (same submission and timestamp) is ignored, as is one for a
 * submission this story no longer points at.
 */
export function applyTeacherReview(s: StudentStory, sub: { id: string; review?: NewsroomReview | null }, now = Date.now()): StudentStory {
  const r = sub.review;
  if (!r || !s.submission || s.submission.id !== sub.id || s.submission.reviewAt === r.at) return s;
  const submission = { ...s.submission, decision: r.decision, reviewAt: r.at };
  if (r.decision === 'approved') {
    if (s.stage === 'PUBLISHED') return { ...s, submission };
    return { ...s, submission, stage: 'APPROVED', approval: { by: r.byName, role: 'teacher', at: r.at, byUid: r.byUid }, updatedAt: now };
  }
  // Sent back: the story returns to drafting and is turned in again as a fresh submission.
  return { ...s, submission: undefined, assignmentId: s.submission.assignmentId, stage: 'DRAFT', approval: undefined, notes: [...s.notes, { by: r.byName, text: r.note || 'Please revise and turn it in again.', at: r.at }], updatedAt: now };
}

export function fileCorrection(s: StudentStory, text: string, now = Date.now()): StudentStory {
  if (!text.trim()) return s;
  return { ...s, corrections: [...s.corrections, { text: text.trim(), at: now }], updatedAt: now };
}

// ── Distribution gate ─────────────────────────────────────────────────────────
export interface ChannelGate { allowed: boolean; reason?: string }

export function channelGate(s: StudentStory, channel: Channel, ctx: { authorIsMinor: boolean; isChildAccount: boolean }): ChannelGate {
  if (s.stage !== 'APPROVED' && s.stage !== 'PUBLISHED') return { allowed: false, reason: 'Finish the editing workflow first.' };
  if (safetyReview(s, ctx).some(f => f.severity === 'block')) return { allowed: false, reason: 'Fix the safety items first.' };
  if (ctx.authorIsMinor && !s.approval?.byUid) return { allowed: false, reason: 'Your teacher approves this from their account — turn it in to your School of Journalism assignment.' };
  switch (channel) {
    case 'classWall':
      if (ctx.isChildAccount) return { allowed: false, reason: 'Child accounts share by print and the family newsletter. A teacher can post the class paper.' };
      return { allowed: true };
    case 'journalistDesk':
      if (ctx.authorIsMinor) return { allowed: false, reason: 'The professional desk is for adult reporters.' };
      return { allowed: true };
    case 'broadcast':
      return kitById(s.kitId)?.form === 'broadcast' || s.band !== 'early' ? { allowed: true } : { allowed: false, reason: 'Broadcast starts in Grades 3–5.' };
    default:
      return { allowed: true };
  }
}

export function markDistributed(s: StudentStory, channel: Channel, now = Date.now()): StudentStory {
  return { ...s, stage: 'PUBLISHED', distributed: { ...s.distributed, [channel]: now }, updatedAt: now };
}

// ── Rendering for distribution ────────────────────────────────────────────────
const esc = (t: string) => t.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
const paras = (t: string) => t.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);

export function storyHtml(s: StudentStory): string {
  const parts = [s.lede, s.body].flatMap(paras).map(p => `<p>${esc(p)}</p>`);
  if (s.counterpoint.trim()) parts.push(`<h2>The other side</h2>`, ...paras(s.counterpoint).map(p => `<p>${esc(p)}</p>`));
  for (const q of s.quotes.filter(q => q.text.trim())) {
    const sp = s.sources.find(x => x.id === q.speakerId);
    parts.push(`<blockquote>“${esc(q.text.trim())}”${sp ? ` — ${esc(sp.isMinor ? sp.name.trim().split(/\s+/)[0] : sp.name)}${sp.role ? `, ${esc(sp.role)}` : ''}` : ''}</blockquote>`);
  }
  if (s.corrections.length) parts.push(`<p><em>${s.corrections.map(c => `Correction: ${esc(c.text)}`).join('<br>')}</em></p>`);
  if (s.aiUsed) parts.push(`<p><em>AI tools assisted with this story; a human reporter checked every fact.</em></p>`);
  return parts.join('\n');
}

export function storyPlain(s: StudentStory): string {
  return [s.headline, s.dek, `By ${s.authorName}`, '', s.lede, s.body, s.counterpoint, ...s.corrections.map(c => `Correction: ${c.text}`)].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n\n').trim();
}

export interface FrontPage { masthead: string; edition: string; audience: string; stories: StudentStory[] }

/** A printable newspaper front page. Self-contained HTML; open it and print or save as PDF. */
export function frontPageHtml(fp: FrontPage): string {
  const [lead, ...rest] = fp.stories;
  const story = (s: StudentStory, isLead: boolean) => `
  <article class="${isLead ? 'lead' : 'brief'}">
    <h2>${esc(s.headline || s.caption || 'Picture News')}</h2>
    ${s.dek ? `<p class="dek">${esc(s.dek)}</p>` : ''}
    <p class="by">By ${esc(s.authorName)}</p>
    ${s.picture && /^data:image\/(png|jpeg|webp);base64,/.test(s.picture) ? `<figure><img src="${s.picture}" alt="${esc(s.caption)}"><figcaption>${esc(s.caption)}</figcaption></figure>` : ''}
    ${storyHtml(s)}
  </article>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(fp.masthead)} — ${esc(fp.edition)}</title>
<style>
  @page{size:letter;margin:0.5in}
  body{margin:0;background:#f4efe3;color:#1a1612;font:15px/1.5 Georgia,'Times New Roman',serif}
  .sheet{max-width:8in;margin:0 auto;padding:24px 28px;background:#fbf8f0}
  header{text-align:center;border-bottom:3px double #1a1612;padding-bottom:8px;margin-bottom:12px}
  header h1{font:900 46px/1 'Times New Roman',serif;letter-spacing:-.01em;margin:0}
  header p{font:600 11px system-ui;letter-spacing:.14em;text-transform:uppercase;margin:6px 0 0;color:#6b6258}
  .grid{display:grid;grid-template-columns:2fr 1fr;gap:18px}
  .grid .rest{border-left:1px solid #c9bfae;padding-left:16px}
  h2{font:800 26px/1.15 Georgia,serif;margin:0 0 6px}
  .brief h2{font-size:18px}
  .dek{font-style:italic;color:#4a4238;margin:0 0 6px}
  .by{font:600 11px system-ui;letter-spacing:.08em;text-transform:uppercase;color:#8a3324;margin:0 0 8px}
  article{margin-bottom:16px;break-inside:avoid}
  figure{margin:0 0 8px}
  img{max-width:100%;border:1px solid #c9bfae}
  figcaption{font:12px/1.4 system-ui;color:#4a4238;margin-top:4px}
  blockquote{margin:8px 0;padding-left:10px;border-left:3px solid #b3261e;font-style:italic}
  footer{border-top:1px solid #c9bfae;margin-top:10px;padding-top:6px;font:11px system-ui;color:#6b6258;text-align:center}
</style></head><body><div class="sheet">
<header><h1>${esc(fp.masthead)}</h1><p>${esc(fp.edition)} · For ${esc(fp.audience)} · A Plajah School of Journalism paper</p></header>
<div class="grid"><div>${lead ? story(lead, true) : '<p>No approved stories yet.</p>'}</div><div class="rest">${rest.map(s => story(s, false)).join('')}</div></div>
<footer>Found a mistake? Tell the editors — we print corrections.</footer>
</div></body></html>`;
}
