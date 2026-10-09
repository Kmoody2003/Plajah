// editorialDecisions — the author's decisions are the only thing that ever settles a note.
//
// Accept / adapt / decline is recorded per note, with the author's own words if they give any. A declined note's
// fingerprint goes into a durable per-user list, and every future read filters it out: the council never nags
// about something you have already decided. Pure functions so the route, the client store and the tests share them.
import type { Decision, DecisionChoice, EditorialReport, EditorialSession, Note } from './editorialTypes';

export interface EditorialPrefs { declined: Record<string, number>; updatedAt?: number }
export const emptyPrefs = (): EditorialPrefs => ({ declined: {} });

export class DecisionError extends Error {}

export function recordDecision(s: EditorialSession, noteId: string, choice: DecisionChoice, note?: string, now = Date.now()): EditorialSession {
  if (!['ACCEPT', 'ADAPT', 'DECLINE'].includes(choice)) throw new DecisionError('Choose accept, adapt or decline.');
  const n = s.report?.notes.find(x => x.id === noteId);
  const r = s.report?.rights.find(x => `r-${x.fingerprint}` === noteId || x.fingerprint === noteId);
  const fingerprint = n?.fingerprint ?? r?.fingerprint;
  if (!fingerprint) throw new DecisionError('That note is not part of this reading.');
  const d: Decision = { noteId, fingerprint, choice, at: now, ...(note?.trim() ? { note: note.trim().slice(0, 600) } : {}) };
  return { ...s, decisions: [...s.decisions.filter(x => x.noteId !== noteId), d] };
}
export function applyToPrefs(prefs: EditorialPrefs, d: Decision): EditorialPrefs {
  const declined = { ...prefs.declined };
  if (d.choice === 'DECLINE') declined[d.fingerprint] = d.at; else delete declined[d.fingerprint];   // changing your mind un-declines
  return { declined, updatedAt: d.at };
}
export const declinedSet = (prefs?: EditorialPrefs | null): Set<string> => new Set(Object.keys(prefs?.declined ?? {}));

/** Remove everything the author already declined. Also drops declined items from the verdict-driving notes. */
export function filterDeclined(report: EditorialReport, declined: ReadonlySet<string>): EditorialReport {
  if (!declined.size) return report;
  return { ...report, notes: report.notes.filter(n => !declined.has(n.fingerprint)), rights: report.rights.filter(r => !declined.has(r.fingerprint)) };
}
export function decisionFor(s: EditorialSession, noteId: string): Decision | undefined { return s.decisions.find(d => d.noteId === noteId); }
export function openNotes(s: EditorialSession): Note[] { return (s.report?.notes ?? []).filter(n => !s.decisions.some(d => d.noteId === n.id) && n.stance !== 'WITHDRAWS'); }

/** Record the author's pushback and the council's answer. A withdrawn note leaves the open list; a softened one keeps the new options. */
export function applyReconsideration(s: EditorialSession, args: { noteId?: string; text: string; stance: 'HOLDS' | 'SOFTENS' | 'WITHDRAWS'; reconsideration: string; revisedOptions?: string[]; editorId?: Note['editorId'] }, now = Date.now()): EditorialSession {
  const notes = (s.report?.notes ?? []).map(n => (n.id === args.noteId ? { ...n, stance: args.stance, ...(args.stance === 'SOFTENS' && args.revisedOptions?.length ? { options: args.revisedOptions } : {}) } : n));
  return { ...s, report: s.report ? { ...s.report, notes } : s.report, replies: [...s.replies, { at: now, noteId: args.noteId, text: args.text.slice(0, 1200), reconsideration: args.reconsideration, stance: args.stance, editorId: args.editorId }], reconsiderations: s.reconsiderations + 1 };
}
