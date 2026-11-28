// The Editor Council — master editors from every tradition of cinema and broadcast, each with a craft
// philosophy AND the numbers that philosophy implies (how long a shot may hold, when to go wide, how often
// to cut away to a reaction). They shape the pre-cut and argue its story; they never override the editor:
// a user lock is enforced in code here, not left to a prompt.
//
// Members are archetypes, not impersonations of real people.

import type { AngleLook, CouncilResult, CutSegment, GraphicFlag, ProgramSection, ProgramType, SectionKind, ShotSize, SyncAngle, UserLock } from './types';
import { covers, snapFrame } from './fuse';

export interface EditorMember {
  id: string;
  name: string;
  tradition: string;
  epithet: string;
  conviction: string;
  protects: string;
  challenges: string;
  voice: string;
  /** Programs this member leads by default. */
  leads: ProgramType[];
  pacing: { min: number; target: number; max: number };
  /** Share of cuts that go to a reaction / audience / alternate angle instead of the speaker. */
  reaction: number;
  /** Open each section on the widest angle. */
  establish: boolean;
  /** Shot-size preference per section kind (first = most wanted). */
  prefer: Partial<Record<SectionKind | 'default', ShotSize[]>>;
}

export const EDITOR_COUNCIL: EditorMember[] = [
  {
    id: 'FEATURE', name: 'The Feature Cutter', tradition: 'Hollywood feature film', epithet: 'Cut for the emotion, not the line',
    conviction: 'The audience watches faces. A cut is earned by a change in feeling; the reaction is often the scene.',
    protects: 'Performance, held moments, the breath after a line.', challenges: 'Coverage-for-coverage cutting and cutting on every sentence.',
    voice: 'Quiet, precise, talks in beats and intentions.', leads: ['drama', 'documentary'],
    pacing: { min: 2.5, target: 6, max: 14 }, reaction: 0.3, establish: true,
    prefer: { default: ['close', 'medium', 'wide'], scene: ['close', 'medium', 'wide'], sermon: ['close', 'medium', 'crowd'] },
  },
  {
    id: 'LIVE_TV', name: 'The Live Switcher', tradition: 'Multicam broadcast television', epithet: 'Never cut mid-word, never miss the moment',
    conviction: 'Follow who is talking, reset wide when the room changes, keep the viewer oriented.',
    protects: 'Orientation, the speaker, clean audio-led cuts.', challenges: 'Self-indulgent cutaways and graphics that fight the shot.',
    voice: 'Fast, calls shots like a director in a truck: "ready two… take two".', leads: ['conference', 'interview', 'general'],
    pacing: { min: 2, target: 5, max: 10 }, reaction: 0.15, establish: true,
    prefer: { default: ['medium', 'close', 'wide'], qa: ['wide', 'medium', 'crowd'], intro: ['wide', 'medium'], talk: ['medium', 'close', 'screen'] },
  },
  {
    id: 'NEWS', name: 'The Newsroom Editor', tradition: 'TV news', epithet: 'Clarity first, then credibility',
    conviction: 'Who is speaking and why it matters must be obvious in two seconds. Name them. Show the evidence.',
    protects: 'Accuracy, identification, lower-third discipline.', challenges: 'Ambiguous speakers and decorative cutting.',
    voice: 'Blunt, deadline-minded.', leads: ['news'],
    pacing: { min: 2, target: 4.5, max: 9 }, reaction: 0.1, establish: false,
    prefer: { default: ['medium', 'close', 'wide'], report: ['medium', 'screen', 'wide'] },
  },
  {
    id: 'WORSHIP', name: 'The Worship Broadcaster', tradition: 'Religious broadcast', epithet: 'Serve the moment, never perform over it',
    conviction: 'The edit should help the viewer worship, not watch. Hold during prayer, open wide for congregational song, stay close on the preacher when the Word lands.',
    protects: 'Prayer, altar moments, scripture on screen, the congregation\'s response.', challenges: 'Fast cutting in sacred moments and graphics over faces.',
    voice: 'Warm, pastoral, specific about moments.', leads: ['church'],
    pacing: { min: 3, target: 7, max: 16 }, reaction: 0.2, establish: true,
    prefer: {
      default: ['medium', 'close', 'wide'], worship: ['wide', 'crowd', 'medium', 'close'], prayer: ['medium', 'wide', 'close'],
      scripture: ['close', 'medium', 'screen'], sermon: ['close', 'medium', 'crowd', 'wide'], announcements: ['medium', 'screen'],
      offering: ['wide', 'medium', 'crowd'], altar: ['wide', 'crowd', 'medium'], benediction: ['wide', 'medium'], welcome: ['wide', 'medium'],
    },
  },
  {
    id: 'SPORTS', name: 'The Sports Director', tradition: 'Live sports', epithet: 'Follow the ball, then the face',
    conviction: 'Action is wide and clean; emotion is tight and immediate. Never lose the play.',
    protects: 'The live action, the replay, the reaction after a score.', challenges: 'Tight shots during play.',
    voice: 'High energy, decisive.', leads: ['sports'],
    pacing: { min: 1.5, target: 4, max: 12 }, reaction: 0.25, establish: true,
    prefer: { default: ['wide', 'medium', 'close'], action: ['wide', 'medium'], break: ['close', 'crowd', 'medium'] },
  },
  {
    id: 'DRAMA', name: 'The Series Editor', tradition: 'Episodic TV drama', epithet: 'Escalate the coverage with the stakes',
    conviction: 'Start wide, move in as the scene tightens, save the closest shot for the turn.',
    protects: 'Eyelines, geography, the scene\'s turn.', challenges: 'Flat coverage that never escalates.',
    voice: 'Structural, talks about acts and turns.', leads: [],
    pacing: { min: 2, target: 5, max: 11 }, reaction: 0.35, establish: true,
    prefer: { default: ['medium', 'close', 'wide'], scene: ['medium', 'close', 'wide'] },
  },
  {
    id: 'DOC', name: 'The Documentarian', tradition: 'Documentary', epithet: 'Let it breathe — the truth is in the pause',
    conviction: 'Don\'t cut away from a real moment to make it more interesting. Trust the footage.',
    protects: 'Authenticity, silence, unscripted reactions.', challenges: 'Over-cutting and manufactured energy.',
    voice: 'Patient, curious.', leads: [],
    pacing: { min: 4, target: 9, max: 22 }, reaction: 0.15, establish: true,
    prefer: { default: ['medium', 'close', 'wide'], interview: ['medium', 'close'] },
  },
  {
    id: 'MUSIC', name: 'The Concert Cutter', tradition: 'Concert film & music TV', epithet: 'Cut on the phrase, ride the build',
    conviction: 'The song tells you where to cut: phrase ends, downbeats, the lift into the chorus. Wide for the room on the big moments.',
    protects: 'Musical phrasing, the band, the crowd on the peak.', challenges: 'Cuts that land against the music.',
    voice: 'Rhythmic, counts bars.', leads: ['concert'],
    pacing: { min: 1.8, target: 4, max: 10 }, reaction: 0.25, establish: true,
    prefer: { default: ['medium', 'wide', 'close', 'crowd'], performance: ['medium', 'close', 'wide', 'crowd'], worship: ['wide', 'medium', 'close', 'crowd'] },
  },
  {
    id: 'COMEDY', name: 'The Talk-Show Editor', tradition: 'Late night & comedy', epithet: 'Timing is the joke',
    conviction: 'Hold for the laugh, cut to the reaction on the punchline, never step on a beat.',
    protects: 'Comic timing, audience laughter, the host-guest dynamic.', challenges: 'Cutting before the reaction lands.',
    voice: 'Wry, talks in setups and payoffs.', leads: [],
    pacing: { min: 1.8, target: 4, max: 9 }, reaction: 0.35, establish: false,
    prefer: { default: ['medium', 'close', 'wide', 'crowd'], interview: ['medium', 'close', 'wide'] },
  },
  {
    id: 'PROMO', name: 'The Trailer & Promo Editor', tradition: 'Trailers, promos, social cutdowns', epithet: 'Every second sells',
    conviction: 'Find the three best lines and the strongest images; structure to a peak.',
    protects: 'Hooks, the peak line, a clear call to action.', challenges: 'Slow openings and buried highlights.',
    voice: 'Punchy, thinks in hooks.', leads: [],
    pacing: { min: 1.2, target: 3, max: 6 }, reaction: 0.2, establish: false,
    prefer: { default: ['close', 'medium', 'wide'] },
  },
];

export const member = (id: string) => EDITOR_COUNCIL.find((m) => m.id === id) || EDITOR_COUNCIL[1];
export const leadFor = (t: ProgramType) => (EDITOR_COUNCIL.find((m) => m.leads.includes(t)) || EDITOR_COUNCIL[1]).id;

// ── Pre-cut engine ───────────────────────────────────────────────────────────────────────────────────────

export interface PrecutInput {
  angles: SyncAngle[];
  offsets: Record<string, number>;
  looks: AngleLook[];
  sections: ProgramSection[];
  /** Cut points the edit prefers (sentence breaks), multicam time. */
  breaks: number[];
  flags: GraphicFlag[];
  locks: UserLock[];
  duration: number;
  lead: string;
  council?: CouncilResult;
  fps: number;
}

const rank = (prefs: ShotSize[], s: ShotSize) => { const i = prefs.indexOf(s); return i < 0 ? prefs.length + (s === 'unknown' ? 0 : 1) : i; };

/**
 * Deterministic pre-cut: walk the program, at each decision pick the angle the lead's grammar wants for this
 * section, within pacing, with variety, only from angles that have picture there, landing cuts on sentence
 * breaks and away from graphic ins/outs. User locks are copied verbatim and never cut into.
 */
export function precut(inp: PrecutInput): CutSegment[] {
  const lead = member(inp.lead);
  const vids = inp.angles.map((a, i) => ({ a, i })).filter(({ a }) => a.kind === 'video');
  if (!vids.length || inp.duration <= 0) return [];
  const lookOf = (id: string) => inp.looks.find((l) => l.assetId === id) || { assetId: id, size: 'unknown' as ShotSize, subject: '', tags: [] };
  const sectionAt = (t: number) => inp.sections.find((s) => t >= s.start && t < s.end);
  const adjAt = (t: number, sec?: ProgramSection) => (inp.council?.adjustments || []).filter((a) =>
    (a.sectionId && sec && a.sectionId === sec.id) || (a.start !== undefined && a.end !== undefined && t >= a.start && t < a.end));
  const flagEdges = inp.flags.filter((f) => f.status !== 'rejected').flatMap((f) => [f.at, f.at + f.duration]);
  const locks = [...inp.locks].sort((a, b) => a.start - b.start);
  const lockAt = (t: number) => locks.find((l) => t >= l.start && t < l.end);
  const nextLockAfter = (t: number) => locks.find((l) => l.start > t);
  const breaks = [...inp.breaks].sort((a, b) => a - b);

  const out: CutSegment[] = [];
  let t = 0, last = -1, prev = -1, sinceReaction = 0;
  let guard = 0;
  while (t < inp.duration - 0.05 && guard++ < 20000) {
    const lk = lockAt(t);
    if (lk) {
      out.push({ start: t, end: Math.min(lk.end, inp.duration), angle: lk.angle, reason: 'Your lock', by: 'YOU', locked: true });
      prev = last; last = lk.angle; t = Math.min(lk.end, inp.duration); continue;
    }
    const sec = sectionAt(t);
    const adj = adjAt(t, sec);
    const pace = adj.reduce((p, a) => p * (a.pace || 1), 1);
    const kind = sec?.kind;
    const prefs = adj.find((a) => a.prefer?.length)?.prefer || (kind && lead.prefer[kind]) || lead.prefer.default || ['medium', 'close', 'wide'];
    const avoid = new Set(adj.flatMap((a) => a.avoidAngles || []));
    const sectionStart = !!sec && t - sec.start < 0.5;
    const pool = vids.filter(({ a, i }) => covers(a, inp.offsets[a.assetId] ?? 0, t + 0.5) && !avoid.has(i));
    const candidates = pool.length ? pool : vids.filter(({ a }) => covers(a, inp.offsets[a.assetId] ?? 0, t + 0.5));
    if (!candidates.length) {
      // Nobody has picture here (sound started before any camera, or a gap between cards): run up to the
      // first moment a camera has picture, parked on that camera — the editor decides whether to trim it.
      const firstIn = (x: { a: SyncAngle }) => Math.max(t, -(inp.offsets[x.a.assetId] ?? 0));
      const next = vids.filter((x) => firstIn(x) + 0.5 < (x.a.duration || 0) - (inp.offsets[x.a.assetId] ?? 0) + 0.5).sort((x, y) => firstIn(x) - firstIn(y))[0] || vids[0];
      const until = Math.max(t + 1 / inp.fps, firstIn(next) > t ? firstIn(next) : t + lead.pacing.max);
      const end = snapFrame(Math.min(inp.duration, nextLockAfter(t)?.start ?? inp.duration, until), inp.fps);
      out.push({ start: t, end, angle: next.i, reason: 'No picture yet on any camera — trim or cover this', by: lead.id });
      prev = last; last = next.i; t = end; continue;
    }
    // Score candidates.
    let reaction = false;
    const wantReaction = lead.reaction > 0 && sinceReaction >= Math.round(1 / lead.reaction);
    const scored = candidates.map(({ a, i }) => {
      const lk2 = lookOf(a.assetId);
      let s = 10 - rank(prefs, lk2.size) * 2.2;
      if (sectionStart && lead.establish) s += lk2.size === 'wide' ? 6 : lk2.size === 'crowd' ? 2 : 0;
      if (i === last) s -= 8;            // a cut should change the picture
      if (i === prev) s -= 1.5;          // and not ping-pong
      if (wantReaction && (lk2.size === 'crowd' || lk2.tags.includes('audience'))) s += 4;
      if (lk2.size === 'screen') s -= kind === 'announcements' || kind === 'talk' || kind === 'report' ? 0 : 4;
      // A lower third needs a clean, close-ish frame under it.
      const ltHere = inp.flags.some((f) => f.status !== 'rejected' && f.kind === 'lowerThird' && t >= f.at - 1 && t < f.at + f.duration);
      if (ltHere && (lk2.size === 'close' || lk2.size === 'medium')) s += 2;
      return { i, s, size: lk2.size };
    }).sort((x, y) => y.s - x.s);
    const pick = scored[0];
    reaction = wantReaction && (pick.size === 'crowd');
    // Length: target by lead × council pace, then land on a sentence break, away from graphic edges.
    const min = lead.pacing.min * pace, max = lead.pacing.max * pace, target = lead.pacing.target * pace * (kind === 'prayer' || kind === 'altar' ? 1.6 : kind === 'worship' ? 0.9 : 1);
    const hardEnd = Math.min(inp.duration, nextLockAfter(t)?.start ?? inp.duration, sec && sec.end - t > min ? sec.end : inp.duration);
    let end = t + target;
    const near = breaks.filter((b) => b >= t + min && b <= t + max);
    if (near.length) end = near.reduce((best, b) => (Math.abs(b - (t + target)) < Math.abs(best - (t + target)) ? b : best), near[0]);
    for (const e of flagEdges) if (Math.abs(end - e) < 0.8) end = e + 1.0;
    end = Math.min(hardEnd, Math.max(t + Math.min(min, hardEnd - t), end));
    if (inp.duration - end < min) end = Math.min(hardEnd, inp.duration);
    end = snapFrame(end, inp.fps);
    if (end <= t) end = Math.min(inp.duration, t + 1 / inp.fps);
    const why = [
      sectionStart && lead.establish && pick.size === 'wide' ? `opens ${sec?.label || 'section'} wide` : '',
      reaction ? 'cutaway to the room' : '',
      !sectionStart && !reaction ? `${pick.size} for ${sec?.label?.toLowerCase() || 'this stretch'}` : '',
      near.length ? 'cut on the sentence' : '',
    ].filter(Boolean).join(' · ');
    out.push({ start: snapFrame(t, inp.fps), end, angle: pick.i, reason: why || `${pick.size}`, by: lead.id });
    sinceReaction = reaction ? 0 : sinceReaction + 1;
    prev = last; last = pick.i; t = end;
  }
  // Merge neighbours on the same angle (a lock next to the same pick stays separate so it stays locked).
  const merged: CutSegment[] = [];
  for (const c of out) {
    const m = merged[merged.length - 1];
    if (m && m.angle === c.angle && !m.locked && !c.locked) { m.end = c.end; if (!m.reason.includes(c.reason)) m.reason += ' · ' + c.reason; }
    else merged.push({ ...c });
  }
  return merged;
}

/** Re-cut while keeping what the editor already approved or locked: those become locks for the new pass. */
export function locksFromCut(cut: CutSegment[], userLocks: UserLock[]): UserLock[] {
  const fromCut = cut.filter((c) => c.locked || c.approved).map((c) => ({ start: c.start, end: c.end, angle: c.angle }));
  const all = [...userLocks, ...fromCut].sort((a, b) => a.start - b.start);
  const out: UserLock[] = [];
  for (const l of all) { const m = out[out.length - 1]; if (m && l.start < m.end - 1e-3) continue; out.push(l); }
  return out;
}

// ── Council deliberation (LLM) ──────────────────────────────────────────────────────────────────────────

export function councilPrompt(o: {
  type: ProgramType; lead: string; members: string[]; intent: string; sections: ProgramSection[]; looks: Array<AngleLook & { index: number; name: string }>;
  cut: CutSegment[]; flags: GraphicFlag[]; transcriptDigest: string;
}): { system: string; user: string } {
  const lead = member(o.lead);
  const seats = o.members.map(member);
  const system = `You are THE EDITOR COUNCIL — master editors who shape a multicam pre-cut. Seats:
${seats.map((m) => `- ${m.id} · ${m.name} (${m.tradition}): ${m.conviction} Protects: ${m.protects} Challenges: ${m.challenges}`).join('\n')}
LEAD for this program: ${lead.id} (${lead.name}).
ABSOLUTE RULE: the human editor has final say. Never contradict the editor's stated intent; locked segments are untouchable.
Give each seat at most one sharp, specific note (reference times as m:ss and section names). Then the lead synthesises concrete adjustments the cutting engine can apply.
STRICT JSON only, no fences:
{"notes":[{"member":"ID","note":"under 30 words"}],"adjustments":[{"sectionId":"sec3","pace":0.8,"prefer":["wide","crowd"],"avoidAngles":[2],"note":"why, under 15 words"}],"summary":"2 sentences: the story shape of this cut"}
pace < 1 = faster cutting, > 1 = longer holds (0.6–1.8). prefer uses: wide, medium, close, screen, crowd, insert.`;
  const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const stats = o.sections.map((s) => {
    const cs = o.cut.filter((c) => c.start >= s.start && c.start < s.end);
    const avg = cs.length ? (cs.reduce((a, c) => a + (c.end - c.start), 0) / cs.length).toFixed(1) : '-';
    const used = [...new Set(cs.map((c) => c.angle + 1))].join(',');
    return `${s.id} ${s.label} ${mmss(s.start)}–${mmss(s.end)}: ${cs.length} shots, avg ${avg}s, angles ${used || '-'}`;
  }).join('\n');
  const user = `PROGRAM: ${o.type}
EDITOR'S INTENT: ${o.intent || '(none given — serve the program)'}
ANGLES:
${o.looks.map((l) => `${l.index + 1}. ${l.name} — ${l.size}${l.subject ? `, ${l.subject}` : ''}${l.tags.length ? ` [${l.tags.join(', ')}]` : ''}`).join('\n')}
SECTIONS + CURRENT PRE-CUT:
${stats}
LOCKED BY EDITOR: ${o.cut.filter((c) => c.locked).map((c) => `${mmss(c.start)}–${mmss(c.end)} angle ${c.angle + 1}`).join('; ') || 'none'}
GRAPHICS FLAGGED: ${o.flags.filter((f) => f.status !== 'rejected').slice(0, 20).map((f) => `${mmss(f.at)} ${f.kind} ${f.category} "${f.title}"`).join('; ') || 'none'}
TRANSCRIPT DIGEST:
${o.transcriptDigest}`;
  return { system, user };
}

export function normalizeCouncil(raw: unknown, lead: string, sections: ProgramSection[]): CouncilResult {
  const r = (raw || {}) as Record<string, any>;
  const ids = new Set(EDITOR_COUNCIL.map((m) => m.id));
  const sizes = new Set(['wide', 'medium', 'close', 'screen', 'crowd', 'insert']);
  const secIds = new Set(sections.map((s) => s.id));
  return {
    lead,
    notes: (Array.isArray(r.notes) ? r.notes : []).filter((n: any) => n && ids.has(n.member)).map((n: any) => ({ member: n.member, note: String(n.note || '').slice(0, 240) })).slice(0, 12),
    adjustments: (Array.isArray(r.adjustments) ? r.adjustments : []).map((a: any) => ({
      sectionId: secIds.has(a?.sectionId) ? a.sectionId : undefined,
      start: Number.isFinite(a?.start) ? a.start : undefined, end: Number.isFinite(a?.end) ? a.end : undefined,
      pace: Number.isFinite(a?.pace) ? Math.max(0.6, Math.min(1.8, a.pace)) : undefined,
      prefer: Array.isArray(a?.prefer) ? a.prefer.filter((s: string) => sizes.has(s)) : undefined,
      avoidAngles: Array.isArray(a?.avoidAngles) ? a.avoidAngles.map((x: number) => (x | 0) - 1).filter((x: number) => x >= 0) : undefined,
      note: a?.note ? String(a.note).slice(0, 120) : undefined,
    })).filter((a: any) => a.sectionId || (a.start !== undefined && a.end !== undefined)).slice(0, 20),
    summary: String(r.summary || '').slice(0, 400),
  };
}

/** A few lines per section so the council reads the story without the whole transcript. */
export function transcriptDigest(words: Array<{ t: number; text: string }>, sections: ProgramSection[], perSection = 40): string {
  return sections.map((s) => {
    const ws = words.filter((w) => w.t >= s.start && w.t < s.end);
    const take = ws.slice(0, perSection).map((w) => w.text).join(' ');
    return `[${s.id} ${s.label}] ${take}${ws.length > perSection ? ' …' : ''}`;
  }).join('\n').slice(0, 6000);
}
