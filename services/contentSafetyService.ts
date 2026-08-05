// Plajah Content Safety — policy, labeling, filtering, and user controls.
//
// What this powers:
//  1. COMMUNITY GUIDELINES — single source of truth for prohibited content
//     (non-consensual likeness, doxxing, pornography, real-world gore) and the
//     self-labeling requirement for artistic mature work.
//  2. SENSITIVE CONTENT GATES — creator-applied labels (graphic / 18+ /
//     artistic nudity) that blur content until the viewer consents, with
//     per-user defaults in Safety Settings.
//  3. CLEAN SPEECH FILTER — opt-in auto-blur of profanity in any rendered text.
//  4. MUTED WORDS & TOPICS — viewer-defined; matching posts stay in the feed
//     but the CONTENT is blurred (author still visible) with a brief
//     description and a one-tap unmute for that post.
//  5. REPORTING — user reports flow into `content_reports` for review.
//  6. AI SCREENING — Gemini-assisted classification at post time to suggest
//     labels and flag likely-prohibited content before it publishes.

import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, auth } from './firebase';

// ─── Content labels ──────────────────────────────────────────────────────────

export type ContentLabel =
  | 'GRAPHIC_VIOLENCE'   // fictional/artistic gore, injury depictions
  | 'MATURE_18'          // 18+ themes (non-pornographic)
  | 'ARTISTIC_NUDITY'    // artistic nudity — NOT pornography (which is banned)
  | 'SENSITIVE_OTHER';   // anything else a viewer may want warned about

export const CONTENT_LABELS: { id: ContentLabel; name: string; description: string }[] = [
  { id: 'GRAPHIC_VIOLENCE', name: 'Graphic / Violence', description: 'Fictional or artistic depictions of violence, injury, or gore. Real-world gruesome footage is not allowed at all.' },
  { id: 'MATURE_18', name: 'Mature (18+)', description: 'Adult themes intended for viewers 18 and over.' },
  { id: 'ARTISTIC_NUDITY', name: 'Artistic Nudity', description: 'Nudity in an artistic context. Pornography is not allowed on Plajah.' },
  { id: 'SENSITIVE_OTHER', name: 'Sensitive', description: 'Other content some viewers may prefer to be warned about.' },
];

// ─── Community guidelines (single source of truth) ───────────────────────────

export const PROHIBITED_CONTENT = [
  {
    id: 'likeness',
    title: 'Likeness without consent',
    rule: 'Posting another person’s likeness — photos, videos, voice, or AI-generated depictions — without their consent is a violation.',
  },
  {
    id: 'doxing',
    title: 'Doxxing / private information',
    rule: 'Revealing someone’s private information (home address, phone number, IDs, financial or medical details) is a violation.',
  },
  {
    id: 'pornography',
    title: 'Pornography',
    rule: 'Pornographic content is not allowed. Artistic nudity is permitted only when labeled "Artistic Nudity" so viewers can filter it.',
  },
  {
    id: 'real_gore',
    title: 'Real-world gore',
    rule: 'Footage or images of real-life gruesome deaths, murders, or serious injuries are not allowed. Artistic/fictional depictions are permitted only when labeled "Graphic / Violence".',
  },
] as const;

export const GUIDELINES_SUMMARY =
  'Plajah is a home for creators. Never post someone’s likeness without consent, reveal private information (doxxing), ' +
  'post pornography, or share real-world gruesome violence. Artistic expression is welcome — mark mature or graphic work ' +
  'with a content label so every viewer stays in control of what they see.';

// ─── Safety settings (per user) ──────────────────────────────────────────────

export interface SafetySettings {
  blurGraphic: boolean;        // blur + ask before showing GRAPHIC_VIOLENCE
  blurAdult: boolean;          // blur + ask before showing MATURE_18 / ARTISTIC_NUDITY
  cleanSpeech: boolean;        // auto-blur profanity in text
  mutedWords: string[];        // viewer-muted words
  mutedTopics: string[];       // viewer-muted topics/phrases
}

export const DEFAULT_SAFETY_SETTINGS: SafetySettings = {
  blurGraphic: true,
  blurAdult: true,
  cleanSpeech: false,
  mutedWords: [],
  mutedTopics: [],
};

const LS_KEY = 'plajah_safety_settings_v1';
let _cache: SafetySettings | null = null;
const _listeners = new Set<(s: SafetySettings) => void>();

export function onSafetySettingsChange(fn: (s: SafetySettings) => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

function notify(s: SafetySettings) { _listeners.forEach(fn => fn(s)); }

export async function loadSafetySettings(): Promise<SafetySettings> {
  if (_cache) return _cache;
  // local first (works signed-out, instant)
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) _cache = { ...DEFAULT_SAFETY_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  // then the user doc (authoritative across devices)
  const uid = auth.currentUser?.uid;
  if (uid) {
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      const remote = snap.data()?.safetySettings;
      if (remote) _cache = { ...DEFAULT_SAFETY_SETTINGS, ...remote };
    } catch { /* offline — local copy stands */ }
  }
  if (!_cache) _cache = { ...DEFAULT_SAFETY_SETTINGS };
  return _cache;
}

export async function saveSafetySettings(settings: SafetySettings): Promise<void> {
  _cache = settings;
  try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch { /* quota */ }
  notify(settings);
  const uid = auth.currentUser?.uid;
  if (uid) {
    try { await setDoc(doc(db, 'users', uid), { safetySettings: settings }, { merge: true }); }
    catch { /* offline — local copy persists */ }
  }
}

export function getCachedSafetySettings(): SafetySettings {
  return _cache ?? DEFAULT_SAFETY_SETTINGS;
}

// ─── Clean speech filter ─────────────────────────────────────────────────────
// Wordlist kept intentionally moderate: slurs + strong profanity. Leetspeak
// and separator-evasion are normalized before matching. Matching is
// whole-word so "class", "assist", "Scunthorpe" are never flagged.

const PROFANITY = [
  'fuck', 'fucking', 'fucked', 'fucker', 'motherfucker', 'shit', 'shitty', 'bullshit',
  'bitch', 'bitches', 'asshole', 'assholes', 'dick', 'dickhead', 'cunt', 'cock',
  'pussy', 'bastard', 'douchebag', 'whore', 'slut', 'nigger', 'nigga', 'faggot',
  'fag', 'retard', 'retarded', 'kike', 'spic', 'chink', 'tranny', 'wetback',
];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };

function normalizeForMatch(word: string): string {
  return word.toLowerCase().split('').map(c => LEET[c] ?? c).join('').replace(/[^a-z]/g, '');
}

const PROFANITY_SET = new Set(PROFANITY);

export interface ProfanitySpan { start: number; end: number; word: string }

/** Find profanity spans in text (indices into the original string). */
export function findProfanity(text: string): ProfanitySpan[] {
  const spans: ProfanitySpan[] = [];
  const re = /[\w@$!]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (PROFANITY_SET.has(normalizeForMatch(m[0]))) {
      spans.push({ start: m.index, end: m.index + m[0].length, word: m[0] });
    }
  }
  return spans;
}

export function containsProfanity(text: string): boolean {
  return findProfanity(text).length > 0;
}

/** Replace profanity with ★ masks (for plain-text surfaces like notifications). */
export function maskProfanity(text: string): string {
  const spans = findProfanity(text);
  if (!spans.length) return text;
  let out = '';
  let cursor = 0;
  for (const s of spans) {
    out += text.slice(cursor, s.start) + s.word[0] + '★'.repeat(Math.max(1, s.word.length - 1));
    cursor = s.end;
  }
  return out + text.slice(cursor);
}

/**
 * Split text into segments for rendering: clean runs and profane runs.
 * The UI blurs profane segments (reveal on tap) when cleanSpeech is on.
 */
export function segmentProfanity(text: string): { text: string; profane: boolean }[] {
  const spans = findProfanity(text);
  if (!spans.length) return [{ text, profane: false }];
  const segs: { text: string; profane: boolean }[] = [];
  let cursor = 0;
  for (const s of spans) {
    if (s.start > cursor) segs.push({ text: text.slice(cursor, s.start), profane: false });
    segs.push({ text: text.slice(s.start, s.end), profane: true });
    cursor = s.end;
  }
  if (cursor < text.length) segs.push({ text: text.slice(cursor), profane: false });
  return segs;
}

// ─── Muted words & topics ────────────────────────────────────────────────────

export interface MuteMatch {
  matched: string[];       // which muted words/topics hit
  /** Brief, spoiler-safe description for the muted-post cover */
  description: string;
}

/** Check a post's text against the viewer's muted words/topics. */
export function checkMuted(text: string, settings: SafetySettings): MuteMatch | null {
  const haystack = ` ${text.toLowerCase()} `;
  const all = [...settings.mutedWords, ...settings.mutedTopics].map(w => w.trim().toLowerCase()).filter(Boolean);
  if (!all.length) return null;
  const matched = all.filter(w =>
    w.includes(' ')
      ? haystack.includes(w)                                  // phrases: substring
      : new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text) // words: whole-word
  );
  if (!matched.length) return null;
  return { matched, description: describeBriefly(text, matched) };
}

/** A short description of muted content that avoids echoing the muted terms. */
export function describeBriefly(text: string, hideTerms: string[] = []): string {
  let safe = text;
  for (const term of hideTerms) {
    safe = safe.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '…');
  }
  const words = safe.replace(/\s+/g, ' ').trim().split(' ');
  const brief = words.slice(0, 18).join(' ');
  return brief.length < safe.trim().length ? `${brief}…` : brief;
}

// ─── Viewer gating decision ──────────────────────────────────────────────────

export interface GateDecision {
  gated: boolean;
  reasons: ContentLabel[];
}

export function shouldGate(labels: ContentLabel[] | undefined, settings: SafetySettings): GateDecision {
  if (!labels?.length) return { gated: false, reasons: [] };
  const reasons = labels.filter(l =>
    (l === 'GRAPHIC_VIOLENCE' && settings.blurGraphic) ||
    ((l === 'MATURE_18' || l === 'ARTISTIC_NUDITY') && settings.blurAdult) ||
    (l === 'SENSITIVE_OTHER' && (settings.blurGraphic || settings.blurAdult))
  );
  return { gated: reasons.length > 0, reasons };
}

export function labelName(l: ContentLabel): string {
  return CONTENT_LABELS.find(c => c.id === l)?.name ?? 'Sensitive';
}

// ─── AI screening (post-time assist) ─────────────────────────────────────────
// Suggests labels the creator forgot and flags likely-prohibited content.
// Advisory: the creator confirms labels; prohibited flags block publish and
// file a report for human review.

export interface ScreeningResult {
  suggestedLabels: ContentLabel[];
  prohibited: { id: string; reason: string }[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export async function aiScreenContent(text: string, mediaDescriptions: string[] = []): Promise<ScreeningResult | null> {
  try {
    const { callGemini } = await import('./geminiService');
    const out = await callGemini(
      `You are Plajah's content-safety screener. Analyze this post for policy issues.
POST TEXT: """${text.slice(0, 4000)}"""
MEDIA: ${mediaDescriptions.join('; ') || 'none described'}

PROHIBITED (block + report): pornography/sexually explicit content; real-world gore (actual deaths/serious injuries); doxxing (real person's private info: address, phone, IDs, financials); a real person's likeness clearly used without consent (e.g. revenge content, deepfakes of private individuals).
LABELS (allowed but must be marked): GRAPHIC_VIOLENCE (fictional/artistic violence or gore), MATURE_18 (adult themes), ARTISTIC_NUDITY (artistic nudity), SENSITIVE_OTHER.

Return JSON only: { "suggestedLabels": ContentLabel[], "prohibited": [{"id": "pornography|real_gore|doxing|likeness", "reason": string}], "confidence": "HIGH"|"MEDIUM"|"LOW" }`,
      { responseMimeType: 'application/json' },
      'gemini-3-flash-preview',
    );
    const parsed = JSON.parse(out || '{}');
    return {
      suggestedLabels: (parsed.suggestedLabels ?? []).filter((l: string) => CONTENT_LABELS.some(c => c.id === l)),
      prohibited: parsed.prohibited ?? [],
      confidence: parsed.confidence ?? 'LOW',
    };
  } catch {
    return null; // screening unavailable — never block posting on AI downtime
  }
}

// ─── Reporting ───────────────────────────────────────────────────────────────

export type ReportReason = 'likeness' | 'doxing' | 'pornography' | 'real_gore' | 'unlabeled_sensitive' | 'harassment' | 'spam' | 'other';

export async function reportContent(input: {
  contentId: string;
  contentType: 'post' | 'comment' | 'video' | 'image' | 'profile' | 'note';
  reason: ReportReason;
  details?: string;
  authorId?: string;
}): Promise<void> {
  await addDoc(collection(db, 'content_reports'), {
    ...input,
    reporterId: auth.currentUser?.uid ?? 'anonymous',
    status: 'OPEN',
    createdAt: serverTimestamp(),
  });
}
