// editorialService — the client's door to the Editorial & Copyright Council.
//
// `review` asks the server (AI editors, daily cap, persisted sessions). If the server or the model is not
// available, it falls back to the deterministic localAdvice IN THE BROWSER, so the author always gets a real,
// honest read. Local sessions and declined notes live in localStorage (wrapped in try/catch: private windows
// and blocked storage must not break the page). Decisions go to the server for server sessions and to local
// storage for local ones; either way a declined note is never raised again.
import { auth } from '../../firebase';
import { EDITORS, EDITOR_LIST, castEditors } from './editorialEditors';
import { localAdvice } from './editorialLocal';
import { applyReconsideration, applyToPrefs, declinedSet, emptyPrefs, filterDeclined, recordDecision, type EditorialPrefs } from './editorialDecisions';
import type { DecisionChoice, Depth, EditorId, EditorialSession, ManuscriptInput, Scope } from './editorialTypes';

export { EDITORS, EDITOR_LIST, castEditors };

const KEY = 'plajah_editorial_council_v1';
interface LocalStore { sessions: EditorialSession[]; prefs: EditorialPrefs }
function load(): LocalStore { try { const s = JSON.parse(localStorage.getItem(KEY) || ''); if (s && Array.isArray(s.sessions)) return { sessions: s.sessions, prefs: s.prefs || emptyPrefs() }; } catch { /* storage unavailable */ } return { sessions: [], prefs: emptyPrefs() }; }
function save(s: LocalStore) { try { localStorage.setItem(KEY, JSON.stringify({ sessions: s.sessions.slice(0, 20), prefs: s.prefs })); } catch { /* ignore */ } }

async function token(): Promise<string | null> { const u = auth?.currentUser; if (!u) return null; try { return await u.getIdToken(); } catch { return null; } }
async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const t = await token(); if (!t) throw new Error('Not signed in');
  const r = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}`, ...(init.headers || {}) } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error((data as any)?.error || `Editorial council request failed (${r.status})`), { status: r.status });
  return data as T;
}
const isLocal = (id: string) => id.startsWith('L');

export interface ReviewOptions { depth?: Depth; editors?: EditorId[]; scope?: Scope; offline?: boolean }

export const editorialService = {
  /** Always resolves with a session. `session.error` explains when the AI editors were unavailable. */
  async review(input: ManuscriptInput, opts: ReviewOptions = {}): Promise<EditorialSession> {
    if (!opts.offline) {
      try { return await call<EditorialSession>('/api/editorial/review', { method: 'POST', body: JSON.stringify({ manuscript: input, depth: opts.depth, editors: opts.editors, scope: opts.scope }) }); }
      catch (e: any) { if (e?.status === 429 || e?.status === 400) throw e; /* otherwise fall through to the offline read */ }
    }
    return editorialService.reviewOffline(input, opts, opts.offline ? undefined : 'The server could not be reached, so this is the offline read.');
  },
  reviewOffline(input: ManuscriptInput, opts: ReviewOptions = {}, why?: string): EditorialSession {
    const store = load(); const room = opts.editors?.length ? opts.editors : castEditors(input.kind, { genre: input.genre });
    const report = localAdvice(input, { editors: room, scope: opts.scope, declinedFingerprints: declinedSet(store.prefs) });
    if (why) report.limits.unshift(why);
    const words = input.chapters.reduce((a, c) => a + (c.text.match(/\S+/g)?.length ?? 0), 0);
    const s: EditorialSession = { id: `L${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, uid: auth?.currentUser?.uid ?? 'local', createdAt: Date.now(), depth: opts.depth ?? 'FULL', status: 'DONE', kind: input.kind, title: input.title || 'Untitled', scope: opts.scope ?? { kind: 'BOOK' }, editors: room, wordCount: words, report, decisions: [], replies: [], reconsiderations: 0 };
    store.sessions.unshift(s); save(store); return s;
  },
  async sessions(): Promise<EditorialSession[]> {
    const local = load().sessions; let remote: EditorialSession[] = [];
    try { remote = (await call<{ sessions: EditorialSession[] }>('/api/editorial/sessions')).sessions; } catch { /* offline */ }
    return [...remote, ...local].sort((a, b) => b.createdAt - a.createdAt);
  },
  async decide(session: EditorialSession, noteId: string, choice: DecisionChoice, note?: string): Promise<EditorialSession> {
    if (isLocal(session.id)) {
      const store = load(); const next = recordDecision(session, noteId, choice, note); const d = next.decisions.find(x => x.noteId === noteId)!;
      store.prefs = applyToPrefs(store.prefs, d); store.sessions = store.sessions.map(x => (x.id === next.id ? next : x)); save(store); return next;
    }
    return call<EditorialSession>(`/api/editorial/sessions/${encodeURIComponent(session.id)}/decision`, { method: 'POST', body: JSON.stringify({ noteId, choice, note }) });
  },
  async reply(session: EditorialSession, text: string, noteId?: string): Promise<EditorialSession> {
    if (isLocal(session.id)) {
      const note = session.report?.notes.find(n => n.id === noteId) ?? session.report?.notes[0];
      const next = applyReconsideration(session, { noteId: note?.id, text, stance: 'HOLDS', reconsideration: 'The AI editors are not part of an offline read, so nothing was reconsidered. Your reply is saved with the note, and the decision is yours.', editorId: note?.editorId });
      const store = load(); store.sessions = store.sessions.map(x => (x.id === next.id ? next : x)); save(store); return next;
    }
    return call<EditorialSession>(`/api/editorial/sessions/${encodeURIComponent(session.id)}/reply`, { method: 'POST', body: JSON.stringify({ text, noteId }) });
  },
  declinedFilter: filterDeclined,
};
