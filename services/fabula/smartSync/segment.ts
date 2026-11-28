// Segmentation — the program's shape (welcome · worship · scripture · sermon · offering …) from what was said,
// plus the visual cuts inside each angle (from the vision pass's motion curves). Sections become timeline
// markers, drive the cutter's pacing, and give post a map: colour the sermon, export the worship set, etc.

import type { ProgramSection, ProgramType, SectionKind, ShotChange, TimedWord } from './types';
import { normWord } from './transcriptAlign';

type Lexicon = Partial<Record<SectionKind, Array<string | RegExp>>>;

const CHURCH: Lexicon = {
  welcome: ['good morning', 'welcome', 'visitors', 'first time', 'glad you', 'online family', 'church family'],
  worship: ['sing', 'praise', 'hallelujah', 'worship', 'lift your hands', 'glory', 'clap', 'oh oh', 'hosanna', 'holy holy', 'on your feet', 'make a joyful'],
  prayer: ['let us pray', "let's pray", 'bow your heads', 'heavenly father', 'in jesus name', "in jesus' name", 'father we', 'lord we thank', 'father god'],
  scripture: ['turn with me', 'turn in your bibles', 'the word of the lord', 'verse', 'chapter', 'it reads', 'read with me', 'scripture'],
  sermon: ['the text says', 'my point', 'church', 'god wants', 'brothers and sisters', 'some of you', 'turn to your neighbor', 'can i get an amen', "y'all", 'the bible says', 'jesus'],
  announcements: ['announcement', 'this week', 'this sunday', 'wednesday', 'register', 'sign up', 'next week', 'calendar', 'meeting', 'retreat', 'conference', 'deadline'],
  offering: ['tithe', 'tithes', 'offering', 'give', 'giving', 'cash app', 'text to give', 'generosity', 'sow', 'seed'],
  altar: ['come forward', 'accept christ', 'salvation', 'altar', 'give your life', 'pray this prayer', 'every head bowed'],
  benediction: ['may the lord bless you', 'benediction', 'go in peace', 'keep you', 'grace of our lord', 'until we meet again', 'dismissed'],
};
const CONFERENCE: Lexicon = {
  intro: ['please welcome', 'introduce', 'our next speaker', 'give it up', 'round of applause'],
  talk: ['today i want', 'let me show', 'next slide', 'the key', 'first', 'second', 'finally', 'in summary'],
  qa: ['question', 'microphone', 'great question', 'thank you for asking', 'q and a', 'anyone else'],
  break: ['break', 'lunch', 'we will be back', 'be right back'],
  outro: ['thank you all', 'thanks for coming', 'see you next', 'that is all'],
};
const INTERVIEW: Lexicon = {
  intro: ['welcome to', 'my guest', 'joining me', 'thanks for having', "today we're"],
  interview: ['tell me', 'how did', 'what was', 'why did', 'when you', 'do you think'],
  outro: ['where can people', 'thanks for coming on', 'that is our show', 'see you next time'],
};
const NEWS: Lexicon = {
  intro: ['good evening', 'tonight', 'top story', 'breaking'],
  report: ['reporting', 'live from', 'sources say', 'officials', 'according to', 'police'],
  interview: ['joining us', 'thank you for joining'],
  outro: ['that is the news', 'good night', 'stay with us'],
};
const SPORTS: Lexicon = {
  intro: ['welcome to', 'tip off', 'kickoff', 'starting lineup'],
  action: ['shoots', 'scores', 'goal', 'touchdown', 'three pointer', 'foul', 'pass', 'drives'],
  break: ['timeout', 'halftime', 'commercial'],
  outro: ['final score', 'that will do it', 'final buzzer'],
};
const CONCERT: Lexicon = { performance: ['oh', 'yeah', 'sing', 'everybody', 'hands up', 'one more time'], break: ['thank you so much', 'this next song', 'how are you doing'] };

const LEX: Record<ProgramType, Lexicon> = {
  church: CHURCH, conference: CONFERENCE, interview: INTERVIEW, news: NEWS, sports: SPORTS, concert: CONCERT,
  drama: { scene: [] }, documentary: { interview: INTERVIEW.interview!, other: [] }, general: { talk: [], qa: CONFERENCE.qa! },
};
const FALLBACK: Record<ProgramType, SectionKind> = {
  church: 'sermon', conference: 'talk', interview: 'interview', news: 'report', sports: 'action', concert: 'performance', drama: 'scene', documentary: 'interview', general: 'talk',
};
const LABEL: Record<SectionKind, string> = {
  welcome: 'Welcome', worship: 'Worship', prayer: 'Prayer', scripture: 'Scripture reading', sermon: 'Sermon', announcements: 'Announcements',
  offering: 'Offering', altar: 'Altar call', benediction: 'Benediction', intro: 'Intro', talk: 'Talk', qa: 'Q&A', interview: 'Interview',
  performance: 'Performance', report: 'Report', action: 'Action', scene: 'Scene', break: 'Break', outro: 'Outro', other: 'Other',
};
export const sectionLabel = (k: SectionKind) => LABEL[k];

/** Sing-like stretch: few distinct words, lots of repetition — a song, whatever the words. */
function repetition(words: string[]): number {
  if (words.length < 12) return 0;
  return 1 - new Set(words).size / words.length;
}

/**
 * Sections over [0, duration] of master time from the master transcript. Windows of `win` seconds score
 * each section's lexicon; the best label per window is smoothed (a section must hold ≥ minLen) and merged.
 */
export function segmentProgram(words: TimedWord[], duration: number, type: ProgramType, o: { win?: number; minLen?: number } = {}): ProgramSection[] {
  const win = o.win ?? 30, minLen = o.minLen ?? 60;
  const lex = LEX[type] || LEX.general, fb = FALLBACK[type] || 'talk';
  const nWin = Math.max(1, Math.ceil(duration / win));
  const labels: Array<{ kind: SectionKind; score: number }> = [];
  for (let w = 0; w < nWin; w++) {
    const t0 = w * win, t1 = t0 + win;
    const ws = words.filter((x) => x.t >= t0 && x.t < t1);
    const text = ' ' + ws.map((x) => normWord(x.text)).join(' ') + ' ';
    const scores = new Map<SectionKind, number>();
    for (const [kind, cues] of Object.entries(lex) as Array<[SectionKind, Array<string | RegExp>]>) {
      let s = 0;
      for (const c of cues) {
        if (typeof c === 'string') { const k = ' ' + c.replace(/'/g, '') + ' '; let i = text.indexOf(k); while (i >= 0) { s += c.includes(' ') ? 2 : 1; i = text.indexOf(k, i + 1); } }
        else s += (text.match(c) || []).length;
      }
      if (s) scores.set(kind, s);
    }
    // Music: sparse or highly repetitive words.
    const density = ws.length / win;
    const rep = repetition(ws.map((x) => normWord(x.text)));
    if (type === 'church' || type === 'concert') {
      const song: SectionKind = type === 'church' ? 'worship' : 'performance';
      const spoken = [...scores.entries()].filter(([k]) => k !== song).reduce((a, [, v]) => a + v, 0);
      if (rep > 0.55 || (density < 0.6 && spoken < 3)) scores.set(song, (scores.get(song) || 0) + 3 + rep * 4);
    }
    // No words: instrumental music or a pause — it belongs to whatever was going on.
    if (!ws.length) { labels.push({ kind: labels[labels.length - 1]?.kind || (type === 'church' ? 'worship' : 'intro'), score: 0.3 }); continue; }
    const best = [...scores.entries()].sort((a, b) => b[1] - a[1])[0];
    labels.push(best && best[1] >= 2 ? { kind: best[0], score: best[1] } : { kind: fb, score: 1 });
  }
  // Smooth: a label must survive a 3-window majority unless strongly scored.
  const sm = labels.map((l, i) => {
    if (l.score >= 6) return l.kind;
    const nb = [labels[i - 1], l, labels[i + 1]].filter(Boolean).map((x) => x!.kind);
    const c = new Map<SectionKind, number>(); nb.forEach((k) => c.set(k, (c.get(k) || 0) + 1));
    const top = [...c.entries()].sort((a, b) => b[1] - a[1])[0];
    return top[1] >= 2 ? top[0] : l.kind;
  });
  // Merge runs, then absorb runs shorter than minLen into a neighbour.
  let runs: Array<{ kind: SectionKind; start: number; end: number; score: number }> = [];
  sm.forEach((k, i) => {
    const t0 = i * win, t1 = Math.min(duration, t0 + win);
    const last = runs[runs.length - 1];
    if (last && last.kind === k) { last.end = t1; last.score += labels[i].score; } else runs.push({ kind: k, start: t0, end: t1, score: labels[i].score });
  });
  for (let pass = 0; pass < 3; pass++) {
    const out: typeof runs = [];
    for (const r of runs) {
      const last = out[out.length - 1];
      if (last && (r.end - r.start < minLen || last.kind === r.kind)) { last.end = r.end; last.score += r.score * 0.5; }
      else out.push({ ...r });
    }
    if (out.length > 1 && out[0].end - out[0].start < minLen) { out[1].start = out[0].start; out.shift(); }
    runs = out;
  }
  return runs.map((r, i) => ({
    id: `sec${i + 1}`, kind: r.kind, start: r.start, end: r.end, label: LABEL[r.kind],
    confidence: Math.max(0.2, Math.min(1, r.score / ((r.end - r.start) / win) / 6)),
  }));
}

/** Visual cuts in one angle from a motion-energy curve (sampled at dt, starting at t0). */
export function detectShotChanges(assetId: string, energy: number[], dt: number, t0 = 0): ShotChange[] {
  if (energy.length < 5) return [];
  const sorted = [...energy].sort((a, b) => a - b);
  const med = sorted[sorted.length >> 1], mad = sorted.map((v) => Math.abs(v - med)).sort((a, b) => a - b)[sorted.length >> 1] || 1;
  const thr = med + 6 * mad;
  const out: ShotChange[] = [];
  for (let i = 1; i < energy.length - 1; i++) {
    if (energy[i] > thr && energy[i] >= energy[i - 1] && energy[i] >= energy[i + 1]) {
      const t = t0 + (i + 1) * dt;
      if (!out.length || t - out[out.length - 1].t > 0.5) out.push({ assetId, t, strength: Math.min(1, (energy[i] - med) / (thr * 2)) });
    }
  }
  return out;
}

/** Sentence ends (pauses ≥ gap or final punctuation) — the places a good editor cuts. */
export function sentenceBreaks(words: TimedWord[], gap = 0.35): number[] {
  const out: number[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i], nx = words[i + 1];
    if (/[.!?]$/.test(w.text) || (nx && nx.t - w.end >= gap)) out.push(nx ? (w.end + nx.t) / 2 : w.end);
  }
  return out;
}
