// Tela PDF reader — server side. Mounted at /api/tela/pdf.
//
//   GET  /profile           the caller's Smart Fill profile (synced across devices)
//   PUT  /profile {profile} merge and save (sanitised: no IDs, no card/bank numbers, ever)
//   POST /map  {fields, keys}  Aria places fields the rules could not — questions only, no values
//   POST /ask  {question, pages, title}  answer a question about the open PDF from its text (opt-in)
//
// Stored server-only as pdfFillProfiles/{uid} via the service account, so no Firestore rule changes.
// Neither /map nor /ask stores what it is sent.

import { Router, type Request, type Response } from 'express';
import { verifyIdToken, fsGet, fsSet } from '../services/firebaseAdminRest';
import { geminiConfigured, geminiGenerate, laneModel } from '../services/ai/geminiLane';
import { cleanAiMap, emptyFillProfile, mergeFillProfiles, sanitizeFillProfile, PROFILE_KEYS, type MapRequest } from '../services/tela/pdf/smartFill';

export const telaPdfRouter = Router();

async function uidOf(req: Request): Promise<string | null> { const a = req.headers.authorization; return a?.startsWith('Bearer ') ? verifyIdToken(a.slice(7)) : null; }
const s = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').trim().slice(0, max);

const hits = new Map<string, { start: number; n: number }>();
function allowed(uid: string, per: number, now = Date.now()): boolean {
  const h = hits.get(uid);
  if (!h || now - h.start > 3_600_000) { hits.set(uid, { start: now, n: 1 }); if (hits.size > 5000) hits.delete(hits.keys().next().value as string); return true; }
  if (h.n >= per) return false; h.n += 1; return true;
}

async function readProfile(uid: string) {
  const d = await fsGet(`pdfFillProfiles/${uid}`);
  try { return typeof d?.json === 'string' ? sanitizeFillProfile(JSON.parse(d.json)) : emptyFillProfile(); } catch { return emptyFillProfile(); }
}

telaPdfRouter.get('/profile', async (req: Request, res: Response) => {
  const uid = await uidOf(req); if (!uid) { res.status(401).json({ error: 'Sign in to sync your fill profile' }); return; }
  res.json({ profile: await readProfile(uid) });
});

telaPdfRouter.put('/profile', async (req: Request, res: Response) => {
  const uid = await uidOf(req); if (!uid) { res.status(401).json({ error: 'Sign in to sync your fill profile' }); return; }
  const incoming = sanitizeFillProfile(req.body?.profile);
  // A deliberate clear (the person removed answers) must win over the stored copy, so "replace" skips the merge.
  const profile = req.body?.replace === true ? incoming : mergeFillProfiles(await readProfile(uid), incoming);
  const json = JSON.stringify(profile); if (json.length > 80_000) { res.status(413).json({ error: 'Profile too large' }); return; }
  if (!(await fsSet(`pdfFillProfiles/${uid}`, { json, updatedAt: profile.updatedAt }))) { res.status(502).json({ error: 'Could not save your fill profile' }); return; }
  res.json({ profile });
});

const MAP_SYSTEM = `You match PDF form questions to profile keys. You see each question's printed label and type, and the list of keys.
Return JSON {"map": {"<field id>": "<key>"}} with ONLY the fields you are confident about. Leave a field out when unsure, when it asks about
someone else (a spouse, child, doctor, employer's address), or when it asks for an identifier, signature, certification or yes/no fact.
Use only keys from the list. Never invent keys.`;

telaPdfRouter.post('/map', async (req: Request, res: Response) => {
  const uid = await uidOf(req); if (!uid) { res.status(401).json({ error: 'Sign in so Aria can help place fields' }); return; }
  if (!geminiConfigured()) { res.status(503).json({ error: 'Aria is not available right now; the fields Smart Fill already placed are unaffected.' }); return; }
  if (!allowed(uid, 60)) { res.status(429).json({ error: 'Aria has helped with a lot of forms this hour. Try again later.' }); return; }
  const body = req.body ?? {};
  const fields = (Array.isArray(body.fields) ? body.fields : []).slice(0, 120).map((f: any) => ({
    id: s(f?.id, 200), question: s(f?.question, 140), type: ['text', 'dropdown', 'list'].includes(f?.type) ? f.type : 'text',
    options: Array.isArray(f?.options) ? f.options.slice(0, 12).map((o: unknown) => s(o, 40)) : undefined,
  })).filter((f: { id: string; question: string }) => f.id && f.question);
  if (!fields.length) { res.json({ map: {} }); return; }
  const keys = (Array.isArray(body.keys) ? body.keys : []).map((k: any) => ({ key: s(k?.key, 40), label: s(k?.label, 60) })).filter((k: { key: string }) => PROFILE_KEYS.has(k.key) || k.key === 'today');
  const reqShape: MapRequest = { fields, keys };
  try {
    const { text } = await geminiGenerate({ model: laneModel('TELA_PDF_MODEL'), system: MAP_SYSTEM, json: true, temperature: 0, maxTokens: 1500, timeoutMs: 20_000,
      contents: JSON.stringify({ keys, fields }) });
    let parsed: unknown = {}; try { parsed = JSON.parse(text); } catch { /* empty map */ }
    res.json({ map: cleanAiMap(parsed, reqShape) });
  } catch { res.status(502).json({ error: 'Aria could not read this form just now.' }); }
});

const ASK_SYSTEM = `You answer questions about one PDF using only the page text you are given. Cite pages like (p. 3).
If the text does not contain the answer, say so plainly. Never invent facts, numbers or quotes. Keep answers short and clear.
For "summarize", give 4–7 bullet points with page citations.`;

telaPdfRouter.post('/ask', async (req: Request, res: Response) => {
  const uid = await uidOf(req); if (!uid) { res.status(401).json({ error: 'Sign in to ask about this PDF' }); return; }
  if (req.body?.consent !== true) { res.status(428).json({ error: 'Asking sends this PDF’s text to the cloud assistant. Turn it on in the panel first.' }); return; }
  if (!geminiConfigured()) { res.status(503).json({ error: 'The assistant is not available right now.' }); return; }
  if (!allowed(`ask:${uid}`, 40)) { res.status(429).json({ error: 'Lots of questions this hour. Try again a little later.' }); return; }
  const question = s(req.body?.question, 600); if (question.length < 2) { res.status(400).json({ error: 'Ask a question' }); return; }
  let budget = 220_000;
  const pages = (Array.isArray(req.body?.pages) ? req.body.pages : []).slice(0, 600).map((t: unknown, i: number) => {
    const txt = s(t, 20_000); const take = txt.slice(0, Math.max(0, budget)); budget -= take.length; return take ? `[p. ${i + 1}]\n${take}` : '';
  }).filter(Boolean).join('\n\n');
  if (!pages) { res.status(400).json({ error: 'This PDF has no readable text. If it is a scan, run Recognize text first.' }); return; }
  try {
    const { text } = await geminiGenerate({ model: laneModel('TELA_PDF_MODEL'), system: ASK_SYSTEM, temperature: 0.2, maxTokens: 900, timeoutMs: 45_000,
      contents: `Document: ${s(req.body?.title, 160) || 'Untitled PDF'}\n\n${pages}\n\nQuestion: ${question}` });
    res.json({ answer: s(text, 6000), truncated: budget < 0 });
  } catch { res.status(502).json({ error: 'The assistant could not answer just now.' }); }
});
