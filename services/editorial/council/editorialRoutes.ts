// editorialRoutes — the Editorial & Copyright Council as a running team, server side.
//
// A review is four rounds, mirroring services/council/councilRoutes:
//   0. MAP        (long books) chunk the manuscript and summarise each chunk, so 100k words fit through a model
//   1. PROPOSE    every editor reads in parallel and returns: what is working (quoted), verdicts, notes with options
//   2. DISPUTE    every editor names the read they most disagree with (FULL depth; QUICK uses the proposals' arguesWith)
//   3. SYNTHESISE Aria chooses lead / counterpoint / editor WITHOUT averaging and speaks to the author
//   4. REFLECT    each editor writes a working note (kept on the session, quietly)
// The deterministic localAdvice always runs first and is merged in, so there is a useful read even when the
// model is unavailable, and so the numbers an editor cites are real counts. Sessions live at
// users/{uid}/editorial_sessions/{id}; the declined-notes list at users/{uid}/editorial_prefs/main. Both are
// owner-only (firestore.rules, undeployed); this server writes with the service account. Keys never leave here.
import { EDITOR_IDS, type Decision, type Depth, type EditorId, type EditorialReport, type EditorialSession, type ManuscriptInput, type ManuscriptKind, type Note, type Scope, type Verdict } from './editorialTypes';
import { EDITORS, EDITOR_LIST, castEditors } from './editorialEditors';
import { MANUSCRIPT_KINDS, isJournalistic } from './editorialTypes';
import { applyScope, localAdvice } from './editorialLocal';
import { buildMaterial, chunkManuscript, mapChunks } from './editorialChunker';
import { computeMetrics, flatten, wordCount } from './editorialMetrics';
import { briefText, disputeUser, editorSystem, parseJson, readDispute, readEditorRead, readReply, readSynthesis, reflectionUser, replySystem, replyUser, synthesisSystem, synthesisUser, readUser, type EditorRead } from './editorialPrompts';
import { applyReconsideration, applyToPrefs, declinedSet, emptyPrefs, filterDeclined, recordDecision, DecisionError, type EditorialPrefs } from './editorialDecisions';

export interface EditorialStore {
  get: (path: string) => Promise<Record<string, any> | null>;
  set: (path: string, obj: Record<string, any>) => Promise<boolean>;
  list: (collection: string, limit?: number) => Promise<Record<string, any>[]>;
}
export interface EditorialDeps {
  authMiddleware: any; apiLimiter: any;
  /** body parser for the (large) manuscript payload, e.g. express.json({ limit: '8mb' }) */
  jsonParser?: any;
  firestoreAuthHeaders: () => Promise<Record<string, string>>;
  /** Server-verified entitlement. The caller's tier is NEVER read from the body. */
  resolveTier?: (req: any) => Promise<string>;
  model?: (system: string, user: string, maxTokens?: number) => Promise<string>;
  store?: EditorialStore;
}

const PROJECT = 'gen-lang-client-0665118474', DB = 'plajah-prod';
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DB}/documents`;
const CLAUDE_MODEL = 'claude-sonnet-4-6';
/** Reviews per day by tier (a FULL review is several model calls). */
export const EDITORIAL_DAILY_CAP: Record<string, number> = { FREE: 2, CREATOR: 6, PLAJAH_PLUS: 15, PRO: 40 };
export const MAX_WORDS = 400_000;

/* ─── Firestore REST (JSON in and out) ──────────────────────────────────────────────────────── */
const toValue = (v: any): any => {
  if (v === null || v === undefined) return { nullValue: null }; if (typeof v === 'string') return { stringValue: v }; if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } }; if (typeof v === 'object') return { mapValue: { fields: toFields(v) } }; return { stringValue: String(v) };
};
const toFields = (o: Record<string, any>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, toValue(v)]));
const fromValue = (v: any): any => {
  if (!v || typeof v !== 'object') return undefined; if ('stringValue' in v) return v.stringValue; if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue); if ('doubleValue' in v) return v.doubleValue; if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue); if ('mapValue' in v) return fromFields(v.mapValue.fields || {}); return undefined;
};
const fromFields = (f: Record<string, any>) => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, fromValue(v)]));
function makeStore(headers: () => Promise<Record<string, string>>): EditorialStore {
  return {
    get: async p => { const r = await fetch(`${FS}/${p}`, { headers: await headers() }); if (!r.ok) return null; return fromFields((await r.json()).fields || {}); },
    set: async (p, obj) => { const r = await fetch(`${FS}/${p}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await headers()) }, body: JSON.stringify({ fields: toFields(obj) }) }); return r.ok; },
    list: async (c, limit = 20) => { const r = await fetch(`${FS}/${c}?pageSize=${limit}&orderBy=createdAt%20desc`, { headers: await headers() }); if (!r.ok) return []; const j = await r.json(); return (j.documents || []).map((d: any) => fromFields(d.fields || {})); },
  };
}

async function claude(system: string, user: string, maxTokens = 1800): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY; if (!key) throw new Error('ANTHROPIC_API_KEY not configured');
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: maxTokens, temperature: 0.6, system, messages: [{ role: 'user', content: user }] }), signal: AbortSignal.timeout(90000) });
  const data: any = await r.json(); if (!r.ok) throw new Error(data?.error?.message || `Claude ${r.status}`);
  return data?.content?.[0]?.text || '';
}

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const clean = (s: string) => String(s).replace(/[^a-z0-9]/gi, '');

/** Validate and trim an untrusted manuscript payload. */
export function sanitizeManuscript(raw: any): ManuscriptInput | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'manuscript required' };
  const kind: ManuscriptKind = MANUSCRIPT_KINDS.includes(raw.kind) ? raw.kind : 'FICTION';
  const chapters = (Array.isArray(raw.chapters) ? raw.chapters : []).slice(0, 400).map((c: any, i: number) => ({ id: String(c?.id ?? `c${i}`).slice(0, 80), title: String(c?.title ?? `Chapter ${i + 1}`).slice(0, 200), text: String(c?.text ?? ''), kind: ['chapter', 'front', 'back', 'toc'].includes(c?.kind) ? c.kind : 'chapter' }));
  const words = chapters.reduce((a: number, c: any) => a + wordCount(c.text), 0);
  if (!words) return { error: 'There is no text to read.' };
  if (words > MAX_WORDS) return { error: `That is over ${MAX_WORDS.toLocaleString()} words. Review a few chapters at a time.` };
  const m = raw.meta && typeof raw.meta === 'object' ? raw.meta : undefined; const a = raw.article && typeof raw.article === 'object' ? raw.article : undefined;
  return { title: String(raw.title ?? '').slice(0, 200), kind, genre: raw.genre ? String(raw.genre).slice(0, 60) : undefined, chapters, meta: m, article: a ? { ...a, claims: Array.isArray(a.claims) ? a.claims.slice(0, 200).map((c: any) => ({ text: String(c?.text ?? '').slice(0, 400), status: ['VERIFIED', 'DISPUTED'].includes(c?.status) ? c.status : 'UNVERIFIED', sources: Number(c?.sources) || 0, humanVerified: !!c?.humanVerified })) : undefined } : undefined };
}

export function createEditorialCouncil(deps: EditorialDeps) {
  const store = deps.store ?? makeStore(deps.firestoreAuthHeaders);
  const ask = deps.model ?? claude;

  async function prefs(userId: string): Promise<EditorialPrefs> { const raw = await store.get(`users/${userId}/editorial_prefs/main`); return raw ? { declined: raw.declined || {}, updatedAt: raw.updatedAt } : emptyPrefs(); }
  async function checkCap(userId: string, tier: string) {
    const day = new Date().toISOString().slice(0, 10); const usage = (await store.get(`users/${userId}/muse_usage/${day}`)) || {};
    const runs = Number(usage.editorialRuns || 0); const cap = EDITORIAL_DAILY_CAP[tier] ?? EDITORIAL_DAILY_CAP.FREE;
    if (runs >= cap) return { ok: false as const, runs, cap };
    await store.set(`users/${userId}/muse_usage/${day}`, { ...usage, editorialRuns: runs + 1, resetDate: day });
    return { ok: true as const, runs: runs + 1, cap };
  }

  /** Merge the model's reads with the deterministic read. Praise must be quoted; verdicts are never averaged. */
  function merge(local: EditorialReport, reads: EditorRead[], syn: ReturnType<typeof readSynthesis>, disputes: EditorialReport['disagreements'], journalism: boolean): EditorialReport {
    const aiNotes: Note[] = reads.flatMap(r => r.notes); const working = [...reads.flatMap(r => r.working), ...local.working.filter(w => !reads.some(r => r.working.some(x => x.anchor?.start === w.anchor?.start)))].slice(0, 10);
    // local notes whose editor is also reading keep their metric explanations; duplicates by headline are dropped.
    const seen = new Set(aiNotes.map(n => n.headline.toLowerCase())); const localNotes = local.notes.filter(n => !seen.has(n.headline.toLowerCase()));
    const notes = [...aiNotes.sort((a, b) => sevRank(b.severity) - sevRank(a.severity)), ...localNotes];
    const aiDims = new Map<string, Verdict>(); for (const v of syn?.verdicts ?? []) aiDims.set(v.dimension, v);
    if (!syn) for (const r of reads) for (const v of r.verdicts) if (!aiDims.has(v.dimension)) aiDims.set(v.dimension, v);
    const verdicts: Verdict[] = []; const dims = new Set([...local.verdicts.map(v => v.dimension), ...aiDims.keys()]);
    for (const d of dims) { const ai = aiDims.get(d); const lv = local.verdicts.find(v => v.dimension === d); verdicts.push(ai ?? lv!); }
    const live = [...(syn?.disagreements ?? []), ...disputes].filter((d, i, a) => a.findIndex(x => x.between.join() === d.between.join()) === i).slice(0, 5);
    const limits = [...local.limits.filter(l => !/used no model/.test(l))];
    if (reads.length >= 3 && reads.every(r => r.notes.length === 0)) limits.push('Every editor came back with praise and no notes. That is possible, but be sceptical: ask again with a single editor you trust to be tough.');
    const dropped = reads.reduce((a, r) => a + r.droppedQuotes, 0); if (dropped) limits.push(`${dropped} quotation${dropped > 1 ? 's' : ''} from the AI could not be found in your text and ${dropped > 1 ? 'were' : 'was'} dropped, so nothing in this report points at words you did not write.`);
    return { ...local, working, verdicts, notes, disagreements: live.length ? live : local.disagreements, synthesis: syn ? { lead: syn.lead, counterpoint: syn.counterpoint, editor: syn.editor, keepFromCounterpoint: syn.keepFromCounterpoint } : local.synthesis, ariaSummary: syn?.ariaSummary ?? local.ariaSummary, source: 'mixed', limits };
  }
  const sevRank = (s: string) => (s === 'Risk' ? 3 : s === 'Clarity' ? 2 : 1);

  async function review(userId: string, input: ManuscriptInput, opts: { depth?: Depth; editors?: EditorId[]; scope?: Scope } = {}): Promise<EditorialSession> {
    const depth: Depth = opts.depth ?? 'FULL'; const scope = opts.scope ?? { kind: 'BOOK' as const };
    const room = (opts.editors?.length ? opts.editors.filter(i => i in EDITORS) : castEditors(input.kind, { genre: input.genre, size: depth === 'QUICK' ? 4 : 6 })) as EditorId[];
    const m = applyScope(input, scope); const flat = flatten(m.chapters); const words = wordCount(flat.text);
    const s: EditorialSession = { id: uid(), uid: userId, createdAt: Date.now(), depth, status: 'RUNNING', kind: input.kind, title: input.title || 'Untitled', scope, editors: room, wordCount: words, decisions: [], replies: [], reconsiderations: 0 };
    const path = `users/${userId}/editorial_sessions/${s.id}`; const pf = await prefs(userId); const declined = declinedSet(pf);
    await store.set(path, s);
    const journalism = isJournalistic(m.kind) || m.kind === 'NONFICTION';
    const local = filterDeclined(localAdvice(m, { editors: room, scope: { kind: 'BOOK' }, declinedFingerprints: declined }), declined);
    try {
      const metrics = computeMetrics(m, flat);
      let summaries; if (words > 7000) summaries = await mapChunks(chunkManuscript(flat), m.kind.toLowerCase(), ask, parseJson);
      const { material, mode } = buildMaterial(m, flat, summaries); s.mode = mode;
      const brief = briefText(m, material, mode, words, metrics);
      // 1. Propose
      const reads = (await Promise.all(room.map(async id => {
        try { return readEditorRead(id, parseJson(await ask(editorSystem(id, { journalism: journalism && id.startsWith('JOURNALISM') }), readUser(brief, room.filter(o => o !== id), depth, isJournalistic(m.kind)), 2600)), flat, depth === 'QUICK' ? 4 : 7); }
        catch (e) { console.warn('[editorial] read failed', id, (e as Error).message); return null; }
      }))).filter(Boolean) as EditorRead[];
      if (reads.length < 1) throw new Error('No editor could read this just now');
      // 2. Dispute
      const present = reads.map(r => r.editorId); let disputes: EditorialReport['disagreements'] = [];
      if (reads.length > 1) {
        if (depth === 'FULL') {
          const digest = reads.map(r => ({ editorId: r.editorId, summary: `${r.notes.map(n => n.headline).join('; ') || 'no notes'}. Verdicts: ${r.verdicts.map(v => `${v.dimension}=${v.band}`).join(', ')}` }));
          disputes = (await Promise.all(present.map(async id => { try { return readDispute(id, parseJson(await ask(editorSystem(id), disputeUser(id, digest), 700)), present); } catch { return null; } }))).filter(Boolean) as EditorialReport['disagreements'];
        } else disputes = reads.filter(r => r.arguesWith && present.includes(r.arguesWith.editorId)).map(r => ({ between: [r.editorId, r.arguesWith!.editorId] as [EditorId, EditorId], about: r.arguesWith!.about, sideA: r.notes[0]?.observation ?? '', sideB: '' }));
      }
      // 3. Synthesise
      let syn = null;
      try { syn = readSynthesis(parseJson(await ask(synthesisSystem(), synthesisUser(brief, reads, disputes), 2600)), present); } catch (e) { console.warn('[editorial] synthesis failed', (e as Error).message); }
      s.report = filterDeclined(merge(local, reads, syn, disputes, journalism), declined);
      if (!syn) s.report.limits.push('Aria could not reach a synthesis this time, so the summary above is the offline one and the editors\' own verdicts are shown unmerged.');
      s.status = 'DONE'; await store.set(path, s);
      // 4. Reflect — quiet, after the answer is available
      void (async () => {
        const refl: Array<{ editorId: EditorId; note: string }> = [];
        await Promise.all(present.map(async id => { try { const r = parseJson<{ note: string }>(await ask(editorSystem(id), reflectionUser(id, s.report!.ariaSummary), 250)); const note = String(r?.note || '').trim().slice(0, 400); if (note) refl.push({ editorId: id, note }); } catch { /* quiet */ } }));
        s.reflections = refl; await store.set(path, s);
      })();
      return s;
    } catch (e) {
      // The offline read is still a real read. Say clearly that the AI editors were unavailable.
      s.report = { ...local, limits: [`The AI editors were unavailable (${(e as Error).message}). This is the offline read: counted patterns only.`, ...local.limits] };
      s.status = 'DONE'; s.error = (e as Error).message; await store.set(path, s); return s;
    }
  }

  async function decide(userId: string, id: string, noteId: string, choice: any, note?: string) {
    const path = `users/${userId}/editorial_sessions/${clean(id)}`; const raw = await store.get(path) as EditorialSession | null; if (!raw) return null;
    const s = recordDecision({ ...raw, decisions: raw.decisions || [], replies: raw.replies || [] }, noteId, choice, note);
    await store.set(path, s);
    const d = s.decisions.find(x => x.noteId === noteId) as Decision; await store.set(`users/${userId}/editorial_prefs/main`, applyToPrefs(await prefs(userId), d) as any);
    return s;
  }

  async function reply(userId: string, id: string, text: string, noteId?: string) {
    const path = `users/${userId}/editorial_sessions/${clean(id)}`; const raw = await store.get(path) as EditorialSession | null; if (!raw) return null;
    const s: EditorialSession = { ...raw, decisions: raw.decisions || [], replies: raw.replies || [], reconsiderations: raw.reconsiderations || 0 };
    const note = s.report?.notes.find(n => n.id === noteId) ?? s.report?.notes[0]; if (!note) throw new DecisionError('There is no note to reconsider.');
    let out = null; try { out = readReply(parseJson(await ask(replySystem(note.editorId), replyUser(note, text), 700))); } catch { /* fall through to honest offline answer */ }
    const r = out ?? { stance: 'HOLDS' as const, reconsideration: 'The council could not reconsider this just now (the AI editors are unavailable). Your reply is saved, the note stands as written, and the decision is still yours: accept, adapt or decline it.' };
    const next = applyReconsideration(s, { noteId: note.id, text, stance: r.stance, reconsideration: r.reconsideration, revisedOptions: (r as any).revisedOptions, editorId: note.editorId });
    await store.set(path, next); return next;
  }

  function register(app: any) {
    const { authMiddleware, apiLimiter } = deps; const json = deps.jsonParser ? [deps.jsonParser] : [];
    app.get('/api/editorial/editors', apiLimiter, authMiddleware, (_req: any, res: any) => res.json({ editors: EDITOR_LIST }));
    app.post('/api/editorial/review', apiLimiter, authMiddleware, ...json, async (req: any, res: any) => {
      const { manuscript, depth, editors, scope } = req.body || {};
      const m = sanitizeManuscript(manuscript); if ('error' in m) return res.status(400).json({ error: m.error });
      const tier = deps.resolveTier ? await deps.resolveTier(req).catch(() => 'FREE') : 'FREE';
      const cap = await checkCap(req.uid, String(tier));
      if (!cap.ok) return res.status(429).json({ error: `The editors have read ${cap.cap} manuscripts for you today. The offline read is always free in your browser; upgrade for more AI reads.` });
      const sc: Scope = scope?.kind === 'CHAPTER' && typeof scope.chapterId === 'string' ? { kind: 'CHAPTER', chapterId: scope.chapterId } : scope?.kind === 'SELECTION' && Number.isFinite(scope.start) && Number.isFinite(scope.end) ? { kind: 'SELECTION', start: Math.max(0, scope.start | 0), end: Math.max(0, scope.end | 0) } : { kind: 'BOOK' };
      try { res.json(await review(req.uid, m, { depth: depth === 'QUICK' ? 'QUICK' : 'FULL', editors: Array.isArray(editors) ? editors.filter((e: any) => EDITOR_IDS.includes(e)).slice(0, 10) : undefined, scope: sc })); }
      catch (e: any) { res.status(502).json({ error: e?.message || 'Review failed' }); }
    });
    app.get('/api/editorial/sessions', apiLimiter, authMiddleware, async (req: any, res: any) => { try { res.json({ sessions: await store.list(`users/${req.uid}/editorial_sessions`, 20) }); } catch (e: any) { res.status(502).json({ error: e?.message }); } });
    app.get('/api/editorial/sessions/:id', apiLimiter, authMiddleware, async (req: any, res: any) => { const d = await store.get(`users/${req.uid}/editorial_sessions/${clean(req.params.id)}`); if (!d) return res.status(404).json({ error: 'Not found' }); res.json(d); });
    app.post('/api/editorial/sessions/:id/decision', apiLimiter, authMiddleware, ...json, async (req: any, res: any) => {
      const { noteId, choice, note } = req.body || {};
      try { const s = await decide(req.uid, req.params.id, String(noteId || ''), choice, typeof note === 'string' ? note : undefined); if (!s) return res.status(404).json({ error: 'Not found' }); res.json(s); }
      catch (e: any) { res.status(e instanceof DecisionError ? 400 : 502).json({ error: e?.message || 'Could not save' }); }
    });
    app.post('/api/editorial/sessions/:id/reply', apiLimiter, authMiddleware, ...json, async (req: any, res: any) => {
      const { text, noteId } = req.body || {}; if (typeof text !== 'string' || text.trim().length < 3) return res.status(400).json({ error: 'text required' });
      try { const s = await reply(req.uid, req.params.id, text.trim(), typeof noteId === 'string' ? noteId : undefined); if (!s) return res.status(404).json({ error: 'Not found' }); res.json(s); }
      catch (e: any) { res.status(e instanceof DecisionError ? 400 : 502).json({ error: e?.message || 'Could not reply' }); }
    });
    app.get('/api/editorial/prefs', apiLimiter, authMiddleware, async (req: any, res: any) => { try { res.json(await prefs(req.uid)); } catch (e: any) { res.status(502).json({ error: e?.message }); } });
  }

  return { register, review, decide, reply, prefs };
}
