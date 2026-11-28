// Graphics flags — what was SAID that deserves a graphic, pre-placed on the timeline as suggestions.
//
//   scripture   Stage's scripture listener (the same detector that fires verses live in Ambo) runs over the
//               whole transcript; each settled reference becomes a lower third at the moment it was called,
//               and a reading of several verses also gets a full-page suggestion.
//   names       introductions ("please welcome Pastor James Carter", "my name is…") → name lower thirds.
//   full pages  giving details (text-to-give, Cash App tags), web addresses, phone numbers and announcements
//               with dates → full-page suggestions.
//   sections    the start of each program section can carry a title lower third (off by default for church
//               worship, on for conferences).
//
// Nothing is placed for real until the editor accepts it; rejected flags stay rejected on a re-run.

import { detectSpoken } from '../../ambo/scriptureListener';
import { formatRef } from '../../scriptureRef';
import type { GraphicFlag, ProgramSection, ProgramType, TimedWord } from './types';

/** Join words into text, remembering where each word starts so a character hit maps back to a time. */
export function textWithTimes(words: TimedWord[]): { text: string; at: (charIdx: number) => number } {
  let text = ''; const starts: number[] = [];
  for (const w of words) { if (text) text += ' '; starts.push(text.length); text += w.text; }
  const at = (ci: number) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= ci) lo = mid; else hi = mid - 1; }
    return words[lo]?.t ?? 0;
  };
  return { text, at };
}

const titleCase = (s: string) => s.replace(/\b([a-z])([a-z']*)/g, (_, a: string, b: string) => a.toUpperCase() + b);
const ROLES = 'pastor|bishop|elder|minister|deacon|deaconess|reverend|rev|evangelist|apostle|prophet|prophetess|doctor|dr|brother|sister|mother|father|first lady|mr|mrs|ms|coach|professor|senator|mayor|judge|chief|officer|captain|superintendent';
const NAME = "([a-z][a-z'\\-]+(?:\\s+[a-z][a-z'\\-]+){0,2})";
const STOPNAME = /^(the|our|my|a|an|you|your|all|everybody|everyone|us|them|him|her|this|that|back|in|to|up)\b/;
const INTRO = [
  new RegExp(`\\b(?:please\\s+)?(?:help\\s+me\\s+)?(?:welcome|give\\s+it\\s+up\\s+for|put\\s+your\\s+hands\\s+together\\s+for|introduce(?:\\s+to\\s+you)?)\\s+(?:to\\s+the\\s+(?:stage|pulpit|podium)\\s+)?(?:our\\s+(?:very\\s+own\\s+)?)?(?:(${ROLES})\\.?\\s+)?${NAME}`, 'gi'),
  new RegExp(`\\bmy\\s+name\\s+is\\s+(?:(${ROLES})\\.?\\s+)?${NAME}`, 'gi'),
  new RegExp(`\\b(?:i'?m|i\\s+am)\\s+(${ROLES})\\.?\\s+${NAME}`, 'gi'),
];
const NAME_TAIL = /\s+(?:and|to|who|from|with|as|is|for|on|at|here|today|this|the)\b.*$/;

const GIVING = /\b(?:text\s+(?:the\s+word\s+)?["']?(\w+)["']?\s+to\s+([\d\s-]{5,12})|cash\s*app\s+(?:is\s+)?\$?\s*([a-z0-9_]+)|\$([a-z][a-z0-9_]{2,})|(?:give|giving)\s+(?:online\s+)?at\s+([a-z0-9.-]+\s*(?:dot|\.)\s*(?:com|org|net|church)(?:\s*(?:slash|\/)\s*\w+)?))/gi;
const URL = /\b((?:www\s*(?:dot|\.)\s*)?[a-z0-9-]{3,}\s*(?:dot|\.)\s*(?:com|org|net|church|tv|co|io)(?:\s*(?:slash|\/)\s*[a-z0-9-]+)?)\b/gi;
const PHONE = /\b(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})\b/g;
const DATE_CUE = /\b(?:this|next)\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|week|month)\b|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?\b|\bat\s+\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)/gi;

const cleanUrl = (s: string) => s.replace(/\s*dot\s*/gi, '.').replace(/\s*slash\s*/gi, '/').replace(/\s+/g, '').toLowerCase();

let n = 0;
const fid = (p: string) => `${p}${Date.now().toString(36)}${(n++).toString(36)}`;

export interface FlagOptions { sectionTitles?: boolean; scriptureLtSec?: number; nameLtSec?: number }

export function detectFlags(words: TimedWord[], sections: ProgramSection[], type: ProgramType, o: FlagOptions = {}): GraphicFlag[] {
  const flags: GraphicFlag[] = [];
  if (!words.length) return flags;
  const { text, at } = textWithTimes(words);
  const ltSec = o.scriptureLtSec ?? 7, nameSec = o.nameLtSec ?? 5;

  // ── Scripture ──
  const seen = new Map<string, number>();
  for (const hit of detectSpoken(text, 0.7, true)) {
    const startChar = Math.max(0, hit.end - hit.heard.length);
    const t = at(startChar);
    const label = formatRef(hit.ref);
    const last = seen.get(label);
    if (last !== undefined && t - last < 90) continue;
    seen.set(label, t);
    const r = hit.ref as GraphicFlag['ref'] & { endVerse?: number };
    flags.push({ id: fid('sc'), kind: 'lowerThird', category: 'scripture', at: t, duration: ltSec, title: label, subtitle: '', ref: r, heard: hit.heard, confidence: hit.confidence, status: 'suggested' });
    const v0 = r?.verse;
    const multi = r && v0 !== undefined && ((r.endVerse && r.endVerse > v0) || r.endChapter);
    if (r && v0 !== undefined && multi) flags.push({ id: fid('sf'), kind: 'fullPage', category: 'scripture', at: t + 2, duration: Math.min(40, 10 + ((r.endVerse || v0) - v0) * 6), title: label, subtitle: 'Full-page reading', ref: r, heard: hit.heard, confidence: hit.confidence * 0.8, status: 'suggested' });
  }

  // ── Names ──
  const lower = text.toLowerCase();
  const named = new Set<string>();
  for (const re of INTRO) {
    re.lastIndex = 0;
    for (let m: RegExpExecArray | null; (m = re.exec(lower));) {
      const role = m[1] ? titleCase(m[1].replace(/^dr$/, 'Dr.').replace(/^rev$/, 'Rev.')) : '';
      let name = (m[2] || '').replace(NAME_TAIL, '').trim();
      if (!name || STOPNAME.test(name) || name.split(/\s+/).length < (role ? 1 : 2)) continue;
      name = titleCase(name);
      const key = (role + ' ' + name).toLowerCase();
      if (named.has(key)) continue;
      named.add(key);
      // Lower third lands a beat after the introduction, when the person is on camera.
      const t = at(m.index + m[0].length) + 1.5;
      flags.push({ id: fid('nm'), kind: 'lowerThird', category: 'name', at: t, duration: nameSec, title: role ? `${role} ${name}` : name, subtitle: '', heard: m[0], confidence: role ? 0.8 : 0.6, status: 'suggested' });
    }
  }

  // ── Giving / contact / announcements ──
  const near = (t: number, cat: string, win = 30) => flags.some((f) => f.category === cat && Math.abs(f.at - t) < win);
  GIVING.lastIndex = 0;
  for (let m: RegExpExecArray | null; (m = GIVING.exec(lower));) {
    const t = at(m.index);
    if (near(t, 'giving')) continue;
    const line = m[1] ? `Text ${m[1].toUpperCase()} to ${m[2].replace(/\s+/g, '')}` : m[3] ? `Cash App $${m[3]}` : m[4] ? `$${m[4]}` : `Give at ${cleanUrl(m[5] || '')}`;
    flags.push({ id: fid('gv'), kind: 'fullPage', category: 'giving', at: t, duration: 12, title: 'Give', subtitle: line, heard: m[0], confidence: 0.75, status: 'suggested' });
  }
  URL.lastIndex = 0;
  for (let m: RegExpExecArray | null; (m = URL.exec(lower));) {
    const t = at(m.index), url = cleanUrl(m[1]);
    if (near(t, 'contact', 45) || near(t, 'giving', 15) || /^(that|what|there|it)\./.test(url)) continue;
    flags.push({ id: fid('ct'), kind: 'lowerThird', category: 'contact', at: t, duration: 8, title: url, subtitle: '', heard: m[0], confidence: 0.6, status: 'suggested' });
  }
  PHONE.lastIndex = 0;
  for (let m: RegExpExecArray | null; (m = PHONE.exec(text));) {
    const t = at(m.index);
    if (near(t, 'contact', 45)) continue;
    flags.push({ id: fid('ph'), kind: 'lowerThird', category: 'contact', at: t, duration: 8, title: m[1], subtitle: 'Call or text', heard: m[0], confidence: 0.55, status: 'suggested' });
  }
  for (const s of sections.filter((x) => x.kind === 'announcements')) {
    const span = words.filter((w) => w.t >= s.start && w.t < s.end);
    const sub = textWithTimes(span);
    DATE_CUE.lastIndex = 0;
    let count = 0;
    for (let m: RegExpExecArray | null; (m = DATE_CUE.exec(sub.text.toLowerCase())) && count < 6;) {
      const t = sub.at(m.index);
      if (near(t, 'announcement', 25)) continue;
      // The sentence around the date is the announcement.
      const from = Math.max(0, sub.text.lastIndexOf('.', m.index) + 1), to = sub.text.indexOf('.', m.index + m[0].length);
      const sentence = sub.text.slice(Math.max(from, m.index - 80), to > 0 ? Math.min(to, m.index + 100) : m.index + 100).trim();
      flags.push({ id: fid('an'), kind: 'fullPage', category: 'announcement', at: Math.max(s.start, t - 2), duration: 10, title: 'Announcement', subtitle: sentence.charAt(0).toUpperCase() + sentence.slice(1), heard: m[0], confidence: 0.5, status: 'suggested' });
      count++;
    }
  }

  // ── Section titles ──
  const wantSections = o.sectionTitles ?? (type === 'conference' || type === 'news');
  if (wantSections) for (const s of sections) flags.push({ id: fid('se'), kind: 'lowerThird', category: 'section', at: s.start + 3, duration: 5, title: s.label, subtitle: '', heard: '', confidence: s.confidence * 0.7, status: 'suggested' });

  return flags.sort((a, b) => a.at - b.at);
}

/** Keep the editor's earlier decisions when flags are recomputed: same category + title within 10 s inherits status. */
export function carryDecisions(next: GraphicFlag[], prev: GraphicFlag[]): GraphicFlag[] {
  return next.map((f) => {
    const old = prev.find((p) => p.category === f.category && p.title === f.title && Math.abs(p.at - f.at) < 10);
    return old ? { ...f, id: old.id, status: old.status, title: old.title, subtitle: old.subtitle || f.subtitle, at: old.status === 'accepted' ? old.at : f.at, duration: old.duration } : f;
  });
}
