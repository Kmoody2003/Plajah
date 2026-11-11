// Station-wide rules for every virtual persona, plus the checks that enforce them on a line before it
// is spoken, posted or sent. The model is never trusted to follow the rules on its own: whatever it
// writes goes through checkLine(), and a line that fails is dropped for a safe fallback.

import { normalizeForMatch, PROFANITY_SET, isAsteriskCensored } from '../profanityLexicon';

/** Read into every persona's brief (prompt.ts) and shown on the "About our virtual staff" page. */
export const STATION_RULES: string[] = [
  'You are a virtual character made by Plajah. If anyone asks, say plainly that you are an AI character. Never claim to be human or a real person.',
  'Never claim to have met, worked with, or spoken to a real artist or public figure.',
  'Only state facts about a song, artist, play count, chart or vote that are given to you in FACTS. If it is not in FACTS, do not say it.',
  'Never say a listener\'s full name, age, location, phone, email, school or anything private. First names only, and only if they chose to be named.',
  'Never ask anyone for money, payment details, passwords or codes, and never promise prizes, payments or giveaways.',
  'No medical, legal, financial or political advice or endorsements. No preaching or ranking faiths.',
  'No profanity, slurs, or sexual or romantic talk with callers or chat.',
  'If a caller or message mentions harm to themselves or others, stay calm, do not put it on air, and hand off to the station\'s safety path.',
];

export type LineIssue =
  | 'claims-human'
  | 'profanity'
  | 'pii'
  | 'money'
  | 'ungrounded-number'
  | 'real-person-claim'
  | 'too-long';

export interface LineCheckContext {
  /** Facts the line may use, as plain strings (titles, artist names, play counts…). */
  facts?: string[];
  /** Max seconds the line may run, with the persona's words-per-second. */
  maxSec?: number;
  wordsPerSec?: number;
}

const HUMAN_CLAIM = /\b(i\s*('?m| am)\s+(a\s+)?(real|human|not\s+(an?\s+)?(ai|bot|robot|virtual)))|\b(i\s+am\s+a\s+real\s+person)\b/i;
const MET_REAL = /\b(i\s+(met|toured with|worked with|was in the studio with|hung out with))\b/i;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;
const PHONE = /(\+?\d[\d\s().-]{8,}\d)/;
const STREET = /\b\d{1,5}\s+\w+(\s\w+)?\s+(street|st|avenue|ave|road|rd|lane|ln|drive|dr|blvd|court|ct)\b/i;
const MONEY = /\b(send (me|us)|cash ?app|venmo|paypal|zelle|wire|gift ?card|card number|password|verification code|you('ve| have)? won|free money|giveaway)\b/i;

/** Words-per-second by voice pace — used to fit lines into a segment. */
export const WPS: Record<'slow' | 'measured' | 'brisk' | 'fast', number> = { slow: 2.0, measured: 2.4, brisk: 2.8, fast: 3.2 };

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function secondsToSay(text: string, wordsPerSec: number): number {
  return wordCount(text) / wordsPerSec + 0.4; // breath at the end
}

function hasProfanity(text: string): boolean {
  for (const raw of text.split(/\s+/)) {
    if (isAsteriskCensored(raw)) return true;
    if (PROFANITY_SET.has(normalizeForMatch(raw))) return true;
  }
  return false;
}

/**
 * Numbers in a line must appear in the facts (play counts, votes, years, chart positions).
 * Times of day ("six-oh-two", "3 a.m.") and small counting words are fine.
 */
function ungroundedNumbers(text: string, facts: string[]): string[] {
  const factText = facts.join(' ');
  const nums = text.match(/\b\d[\d,]*(\.\d+)?\b/g) || [];
  return nums.filter((n) => {
    const clean = n.replace(/,/g, '');
    if (Number(clean) <= 12) return false; // hours, small counts, "top five"
    return !factText.replace(/,/g, '').includes(clean);
  });
}

export function checkLine(text: string, ctx: LineCheckContext = {}): LineIssue[] {
  const issues: LineIssue[] = [];
  if (HUMAN_CLAIM.test(text)) issues.push('claims-human');
  if (MET_REAL.test(text)) issues.push('real-person-claim');
  if (hasProfanity(text)) issues.push('profanity');
  if (EMAIL.test(text) || PHONE.test(text) || STREET.test(text)) issues.push('pii');
  if (MONEY.test(text)) issues.push('money');
  if (ungroundedNumbers(text, ctx.facts || []).length) issues.push('ungrounded-number');
  if (ctx.maxSec && ctx.wordsPerSec && secondsToSay(text, ctx.wordsPerSec) > ctx.maxSec) issues.push('too-long');
  return issues;
}

/** Strips private details from something a listener wrote before a host reads it. */
export function scrubListenerText(text: string): string {
  return text
    .replace(EMAIL, '[email removed]')
    .replace(PHONE, '[number removed]')
    .replace(STREET, '[address removed]')
    .split(/(\s+)/)
    .map((t) => (t.trim() && (PROFANITY_SET.has(normalizeForMatch(t)) || isAsteriskCensored(t)) ? '—' : t))
    .join('');
}

/** Phrases that mean a listener may be in danger — never aired, routed to the safety path. */
const CRISIS = /\b(kill (myself|me)|end (it|my life)|suicid|self[- ]harm|hurt (myself|someone)|want to die|abuse[ds]?\b|being hurt)\b/i;
export function needsSafetyHandoff(text: string): boolean {
  return CRISIS.test(text);
}
