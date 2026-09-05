// councilRoutes — the Council of Art Directors as a running team, server side.
//
// A deliberation is four rounds of model calls, each director an independent agent with its own
// system prompt and evolving profile:
//   1. PROPOSE   every director proposes in parallel, having been told who else is in the room
//   2. DISPUTE   every director names the one proposal they most disagree with, and concedes one thing
//   3. SYNTHESISE Aria chooses lead / counterpoint / editor without averaging and speaks to the user
//   4. REFLECT   every director writes a note to their own style notes — this is how the team's
//                taste moves over time; the notes are read back into the next brief's prompt
// Research is a separate lane: a director takes a topic to Gemini with search grounding and
// brings back attributable influences. Profiles are global (one team for the platform);
// deliberations belong to the user who convened them. Claude is the persona lane, as everywhere
// else on Plajah; keys never leave this process.
//
// Registered from server.ts with the same auth middleware and limiter the other AI routes use.
import { COUNCIL_DIRECTORS, COUNCIL_LIST, emptyProfile } from './councilDirectors';
import { COUNCIL_DIRECTOR_IDS, type CouncilBrief, type CouncilDirectorId, type Deliberation, type DeliberationDepth, type DirectorProfile, type DirectorProposal, type Dispute, type Influence, type Reflection } from './councilTypes';
import { directorSystem, disputeUser, parseJson, proposalUser, readDispute, readProposal, readSynthesis, reflectionUser, researchUser, synthesisSystem, synthesisUser } from './councilPrompts';

export interface CouncilDeps {
  authMiddleware: any;
  apiLimiter: any;
  firestoreAuthHeaders: () => Promise<Record<string, string>>;
  /** optional: shipped libraries so a director's portfolio reads from what exists */
  libraries?: { packs?: Array<{ id: string; name: string; councilStyle: string }> };
  /** injectable lanes and store, so the four-round protocol can run under test without a network */
  model?: (system: string, user: string, maxTokens?: number) => Promise<string>;
  grounded?: (prompt: string) => Promise<string>;
  store?: CouncilStore;
}
export interface CouncilStore {
  get: (path: string) => Promise<Record<string, any> | null>;
  set: (path: string, obj: Record<string, any>) => Promise<boolean>;
  list: (collection: string, limit?: number) => Promise<Record<string, any>[]>;
}

const PROJECT = 'gen-lang-client-0665118474', DB = 'plajah-prod';
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DB}/documents`;
const CLAUDE_MODEL = 'claude-sonnet-4-6';
const DAILY_CAP: Record<string, number> = { FREE: 3, CREATOR: 8, PLAJAH_PLUS: 20, PRO: 50 };

/* ─── Firestore REST, JSON in and out ───────────────────────────────────────────────────── */
const toValue = (v: any): any => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === 'object') return { mapValue: { fields: toFields(v) } };
  return { stringValue: String(v) };
};
const toFields = (o: Record<string, any>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, toValue(v)]));
const fromValue = (v: any): any => {
  if (!v || typeof v !== 'object') return undefined;
  if ('stringValue' in v) return v.stringValue; if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue); if ('doubleValue' in v) return v.doubleValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
  return undefined;
};
const fromFields = (f: Record<string, any>) => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, fromValue(v)]));

function makeStore(headers: () => Promise<Record<string, string>>): CouncilStore {
  const get = async (path: string) => { const r = await fetch(`${FS}/${path}`, { headers: await headers() }); if (!r.ok) return null; return fromFields((await r.json()).fields || {}); };
  const set = async (path: string, obj: Record<string, any>) => { const r = await fetch(`${FS}/${path}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await headers()) }, body: JSON.stringify({ fields: toFields(obj) }) }); return r.ok; };
  const list = async (collection: string, limit = 20) => { const r = await fetch(`${FS}/${collection}?pageSize=${limit}&orderBy=createdAt%20desc`, { headers: await headers() }); if (!r.ok) return []; const j = await r.json(); return (j.documents || []).map((d: any) => fromFields(d.fields || {})); };
  return { get, set, list };
}

/* ─── Model lanes ────────────────────────────────────────────────────────────────────────── */
async function claude(system: string, user: string, maxTokens = 1200): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not configured');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: maxTokens, temperature: 0.9, system, messages: [{ role: 'user', content: user }] }),
    signal: AbortSignal.timeout(60000),
  });
  const data: any = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || `Claude ${r.status}`);
  return data?.content?.[0]?.text || '';
}
async function geminiGrounded(prompt: string): Promise<string> {
  const key = process.env.GOOGLE_AI_API_KEY || process.env.VITE_GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
  if (!key) throw new Error('Gemini not configured');
  const { GoogleGenAI } = await import('@google/genai');
  const genai = new GoogleGenAI({ apiKey: key });
  const response: any = await genai.models.generateContent({ model: 'gemini-3.6-flash', contents: prompt, config: { tools: [{ googleSearch: {} }], thinkingConfig: { thinkingLevel: 'minimal' }, temperature: 0.4 } });
  return response?.text || '';
}

/* ─── The team at work ───────────────────────────────────────────────────────────────────── */
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function createCouncil(deps: CouncilDeps) {
  const store = deps.store ?? makeStore(deps.firestoreAuthHeaders);
  const ask = deps.model ?? claude;
  const look = deps.grounded ?? geminiGrounded;

  async function profile(id: CouncilDirectorId): Promise<DirectorProfile> {
    const raw = await store.get(`council_directors/${id}`);
    const base = emptyProfile(id, (deps.libraries?.packs ?? []).filter(p => p.councilStyle === COUNCIL_DIRECTORS[id].councilStyle).map(p => ({ kind: 'BROADCAST_PACK' as const, id: p.id, name: p.name })));
    if (!raw) return base;
    return { ...base, ...raw, styleNotes: raw.styleNotes || [], influences: raw.influences || [], stances: raw.stances || [], portfolio: raw.portfolio?.length ? raw.portfolio : base.portfolio };
  }
  async function saveProfile(p: DirectorProfile) {
    // Keep the profile a readable size: the most recent forty notes, thirty influences, sixty stances.
    const trim = <T extends { at: number }>(a: T[], n: number) => [...a].sort((x, y) => y.at - x.at).slice(0, n);
    await store.set(`council_directors/${p.id}`, { ...p, styleNotes: trim(p.styleNotes, 40), influences: trim(p.influences, 30), stances: trim(p.stances, 60), updatedAt: Date.now() });
  }
  async function allProfiles() { return Promise.all(COUNCIL_DIRECTOR_IDS.map(profile)); }

  async function checkCap(userId: string, tier: string) {
    const day = new Date().toISOString().slice(0, 10);
    const usage = (await store.get(`users/${userId}/muse_usage/${day}`)) || {};
    const runs = Number(usage.councilRuns || 0);
    const cap = DAILY_CAP[tier] ?? DAILY_CAP.FREE;
    if (runs >= cap) return { ok: false as const, runs, cap };
    await store.set(`users/${userId}/muse_usage/${day}`, { ...usage, councilRuns: runs + 1, resetDate: day });
    return { ok: true as const, runs: runs + 1, cap };
  }

  /** Run a whole deliberation. Persists as it goes so a client can watch the rounds land. */
  async function deliberate(userId: string, brief: CouncilBrief, opts: { depth?: DeliberationDepth; directors?: CouncilDirectorId[] } = {}): Promise<Deliberation> {
    const ids = (opts.directors?.length ? opts.directors.filter(i => i in COUNCIL_DIRECTORS) : COUNCIL_DIRECTOR_IDS) as CouncilDirectorId[];
    const depth = opts.depth ?? 'FULL';
    const d: Deliberation = { id: uid(), uid: userId, createdAt: Date.now(), depth, status: 'RUNNING', brief, directors: ids, proposals: [], disputes: [], reflections: [] };
    const path = `users/${userId}/council_sessions/${d.id}`;
    await store.set(path, d);
    const profiles = Object.fromEntries(await Promise.all(ids.map(async i => [i, await profile(i)] as const))) as Record<CouncilDirectorId, DirectorProfile>;
    try {
      // 1. Propose — in parallel; each director knows who else is at the table.
      const proposals = (await Promise.all(ids.map(async i => {
        try { return readProposal(i, parseJson(await ask(directorSystem(i, profiles[i]), proposalUser(brief, ids.filter(o => o !== i)), 1100))); }
        catch (e) { console.warn('[council] proposal failed', i, (e as Error).message); return null; }
      }))).filter(Boolean) as DirectorProposal[];
      if (proposals.length < 2) throw new Error('Fewer than two directors answered');
      d.proposals = proposals; await store.set(path, d);

      // 2. Dispute — said out loud. QUICK depth lets the proposals' own arguesWith stand in.
      const present = proposals.map(p => p.directorId);
      if (depth === 'FULL') {
        d.disputes = (await Promise.all(present.map(async i => {
          try { return readDispute(i, parseJson(await ask(directorSystem(i, profiles[i]), disputeUser(i, proposals), 500)), present); }
          catch { return null; }
        }))).filter(Boolean) as Dispute[];
      } else {
        d.disputes = proposals.filter(p => p.arguesWith && present.includes(p.arguesWith.directorId)).map(p => ({ from: p.directorId, against: p.arguesWith!.directorId, objection: p.arguesWith!.why }));
      }
      await store.set(path, d);

      // 3. Synthesise — Aria decides. Without averaging.
      const synthesis = readSynthesis(parseJson(await ask(synthesisSystem(), synthesisUser(brief, proposals, d.disputes), 1600)), present);
      if (!synthesis) throw new Error('Aria could not reach a synthesis');
      d.synthesis = synthesis; d.status = 'DONE'; await store.set(path, d);

      // 4. Reflect — the team's taste moves. Done after the answer is available; failures are quiet.
      void (async () => {
        const reflections: Reflection[] = [];
        await Promise.all(present.map(async i => {
          try {
            const r = parseJson<{ note: string }>(await ask(directorSystem(i, profiles[i]), reflectionUser(i, d), 300));
            const note = String(r?.note || '').trim().slice(0, 400);
            const p = profiles[i];
            const outcome = synthesis.lead === i ? 'LEAD' : synthesis.counterpoint === i ? 'COUNTERPOINT' : synthesis.editor === i ? 'EDITOR' : 'HEARD';
            const mine = proposals.find(x => x.directorId === i)!;
            const disputed = d.disputes.find(x => x.from === i)?.against;
            if (note) { p.styleNotes.push({ at: Date.now(), text: note, sessionId: d.id }); reflections.push({ directorId: i, note }); }
            p.stances.push({ at: Date.now(), sessionId: d.id, brief: brief.ask.slice(0, 200), position: mine.idea.slice(0, 300), disagreedWith: disputed, outcome });
            if (outcome === 'LEAD') p.ledCount++; if (outcome === 'COUNTERPOINT') p.counterpointCount++; if (outcome === 'EDITOR') p.editorCount++;
            await saveProfile(p);
          } catch (e) { console.warn('[council] reflection failed', i, (e as Error).message); }
        }));
        d.reflections = reflections; await store.set(path, d);
      })();
      return d;
    } catch (e) {
      d.status = 'FAILED'; d.error = (e as Error).message; await store.set(path, d);
      return d;
    }
  }

  /** A director goes and looks something up, and comes back changed. */
  async function research(id: CouncilDirectorId, topic: string) {
    const raw = parseJson<{ influences: any[]; note: string }>(await look(researchUser(id, topic)));
    const influences: Influence[] = (raw?.influences || []).slice(0, 5).map((i: any) => ({
      at: Date.now(), topic: String(i.topic || topic).slice(0, 120), finding: String(i.finding || '').slice(0, 600),
      source: i.source?.title ? { title: String(i.source.title).slice(0, 160), url: typeof i.source.url === 'string' && /^https?:\/\//.test(i.source.url) ? i.source.url.slice(0, 400) : undefined } : undefined,
      note: '',
    })).filter((i: Influence) => i.finding);
    if (!influences.length) throw new Error('Research came back empty');
    // The director says what it changes, in their own voice.
    let note = String(raw?.note || '').slice(0, 500);
    try {
      const r = parseJson<{ note: string }>(await ask(directorSystem(id, await profile(id)), `You researched "${topic}" and found:\n${influences.map(i => `- ${i.finding}${i.source ? ` (${i.source.title})` : ''}`).join('\n')}\n\nIn two sentences to the team, in your voice: what this changes for you. JSON: {"note":"…"}`, 300));
      if (r?.note) note = r.note.slice(0, 500);
    } catch { /* the grounded note stands */ }
    const p = await profile(id);
    for (const i of influences) { i.note = note; p.influences.push(i); }
    p.styleNotes.push({ at: Date.now(), text: `After looking into ${topic}: ${note}` });
    await saveProfile(p);
    return { directorId: id, topic, influences, note };
  }

  /* ─── Routes ─────────────────────────────────────────────────────────────────────────── */
  function register(app: any) {
    const { authMiddleware, apiLimiter } = deps;
    app.get('/api/council/directors', apiLimiter, authMiddleware, async (_req: any, res: any) => {
      try { const profiles = await allProfiles(); res.json({ directors: COUNCIL_LIST, profiles }); }
      catch (e: any) { res.status(502).json({ error: e?.message || 'Council unavailable' }); }
    });
    app.post('/api/council/deliberate', apiLimiter, authMiddleware, async (req: any, res: any) => {
      const { brief, depth, directors, tier = 'FREE' } = req.body || {};
      if (!brief || typeof brief.ask !== 'string' || brief.ask.trim().length < 8) return res.status(400).json({ error: 'brief.ask required' });
      const cap = await checkCap(req.uid, String(tier));
      if (!cap.ok) return res.status(429).json({ error: `The council has met ${cap.cap} times for you today. Upgrade for more sessions.` });
      const clean: CouncilBrief = { ask: String(brief.ask).slice(0, 2000), surface: brief.surface ? String(brief.surface).slice(0, 80) : undefined, domain: brief.domain ? String(brief.domain).slice(0, 40) : undefined, audience: brief.audience ? String(brief.audience).slice(0, 300) : undefined, feeling: brief.feeling ? String(brief.feeling).slice(0, 300) : undefined, constraints: Array.isArray(brief.constraints) ? brief.constraints.slice(0, 8).map((c: any) => String(c).slice(0, 200)) : undefined, references: Array.isArray(brief.references) ? brief.references.slice(0, 8).map((c: any) => String(c).slice(0, 200)) : undefined };
      try { res.json(await deliberate(req.uid, clean, { depth: depth === 'QUICK' ? 'QUICK' : 'FULL', directors })); }
      catch (e: any) { res.status(502).json({ error: e?.message || 'Deliberation failed' }); }
    });
    app.post('/api/council/research', apiLimiter, authMiddleware, async (req: any, res: any) => {
      const { directorId, topic } = req.body || {};
      if (!(directorId in COUNCIL_DIRECTORS) || typeof topic !== 'string' || topic.trim().length < 3) return res.status(400).json({ error: 'directorId and topic required' });
      try { res.json(await research(directorId, topic.trim().slice(0, 200))); }
      catch (e: any) { res.status(502).json({ error: e?.message || 'Research failed' }); }
    });
    app.get('/api/council/sessions', apiLimiter, authMiddleware, async (req: any, res: any) => {
      try { res.json({ sessions: await store.list(`users/${req.uid}/council_sessions`, 20) }); } catch (e: any) { res.status(502).json({ error: e?.message }); }
    });
    app.get('/api/council/sessions/:id', apiLimiter, authMiddleware, async (req: any, res: any) => {
      const d = await store.get(`users/${req.uid}/council_sessions/${String(req.params.id).replace(/[^a-z0-9]/gi, '')}`);
      if (!d) return res.status(404).json({ error: 'Not found' }); res.json(d);
    });
    app.post('/api/council/sessions/:id/decision', apiLimiter, authMiddleware, async (req: any, res: any) => {
      const id = String(req.params.id).replace(/[^a-z0-9]/gi, ''); const { choice, note } = req.body || {};
      if (!['LEAD', 'COUNTERPOINT', 'AGAIN', 'OWN'].includes(choice)) return res.status(400).json({ error: 'choice required' });
      const d = await store.get(`users/${req.uid}/council_sessions/${id}`); if (!d) return res.status(404).json({ error: 'Not found' });
      d.userDecision = { choice, note: note ? String(note).slice(0, 500) : undefined, at: Date.now() };
      await store.set(`users/${req.uid}/council_sessions/${id}`, d); res.json(d);
    });
  }

  return { register, deliberate, research, profile, allProfiles };
}
