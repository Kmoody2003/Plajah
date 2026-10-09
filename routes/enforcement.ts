/**
 * Fair Process — enforcement + appeals (server half). Policy: docs/FAIR_PROCESS_POLICY.md.
 *
 * Firestore REST here runs with the service account (bypasses rules), so every route authorises
 * itself. Collections (rules: subject read, server-only write):
 *   enforcement_actions/{id}  full record of an action (what content, which rule, what's limited, until when)
 *   appeals/{id}              the user's statement/evidence + status timeline + decision
 *   user_sanctions/{uid}      `actions.{id}` summaries consumed by services/enforcement/standingCore.ts
 *                             (legacy `suspendedUntil`, and `criminalReview` from services/safety/*)
 *
 *   GET  /api/enforcement/me                              standing + actions + appeals (any signed-in user)
 *   POST /api/enforcement/appeal       {actionId, statement, evidence?, correctionTaken?}
 *   POST /api/enforcement/correct      {actionId, note?}   "I fixed it" → fast-track review
 *   GET  /api/enforcement/queue                           admin: pending appeals + corrections
 *   POST /api/enforcement/action       admin: create an action (+ sanctions summary + notice)
 *   POST /api/enforcement/appeal/:id/decide   admin {outcome: uphold|modify|overturn, note, level?, durationHours?}
 *   POST /api/enforcement/correction/:actionId/decide  admin {accept: boolean, note}
 *
 * `requireCapability(cap)` — middleware for other server routes (must follow authMiddleware).
 * It FAILS OPEN on a read error: per policy we never lock people out because of our own outage.
 */
import { Router, type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import express from 'express';
import nodeCrypto from 'node:crypto';
import { getAccessToken, adminConfig } from '../services/firebaseAdminRest';
import { dispatchEmailNotification } from '../services/notify/emailNotifyServer';
import {
  capabilitiesFor, allows, normaliseAction, isLevel, restrictionsFor, canDecide, applyOutcome,
  validateAppealInput, appealSlaDueAt, correctionSlaDueAt, needsSecondReviewer, durationLabel, isInForce,
  APPEAL_STATUS_FOR, CAPABILITY_LABEL, LEVEL_RANK, SYNTHETIC_ACTION_IDS,
  type CapabilityKey, type Capabilities, type SanctionsDoc, type StandingLevel, type AppealOutcome, type ContentRef,
} from '../services/enforcement/standingCore';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0665118474';
const DB_ID = process.env.FIREBASE_DB_ID || 'plajah-prod';
const DOC_ROOT = `projects/${PROJECT_ID}/databases/${DB_ID}/documents`;
const FS = `https://firestore.googleapis.com/v1/${DOC_ROOT}`;

// ── Firestore REST (undefined dropped, never written) ─────────────────────────

function enc(v: any): any {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.filter(x => x !== undefined).map(enc) } };
  if (typeof v === 'object') return { mapValue: { fields: encFields(v) } };
  return { stringValue: String(v) };
}
function encFields(o: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, x] of Object.entries(o)) if (x !== undefined) out[k] = enc(x);
  return out;
}
function dec(v: any): any {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
  if ('mapValue' in v) return decFields(v.mapValue.fields || {});
  return null;
}
function decFields(f: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(f)) out[k] = dec(v);
  return out;
}
async function hdrs(): Promise<Record<string, string>> {
  const t = await getAccessToken();
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}

/** null = missing; throws on transport/HTTP errors (so callers can fail open deliberately). */
async function getDoc(path: string): Promise<Record<string, any> | null> {
  const res = await fetch(`${FS}/${path}`, { headers: await hdrs() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`get ${path} HTTP ${res.status}`);
  const j = await res.json() as any;
  return decFields(j.fields || {});
}

/** Merge-patch: `data` is a (possibly nested) object; `mask` lists dotted field paths to write. */
async function patchMask(path: string, data: Record<string, any>, mask: string[]): Promise<boolean> {
  const qs = mask.map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  try {
    const res = await fetch(`${FS}/${path}?${qs}`, { method: 'PATCH', headers: await hdrs(), body: JSON.stringify({ fields: encFields(data) }) });
    if (!res.ok) console.error(`[enforcement] patch ${path} HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.ok;
  } catch (e: any) { console.error(`[enforcement] patch ${path}`, e?.message); return false; }
}
const patchTop = (path: string, data: Record<string, any>) => patchMask(path, data, Object.keys(data).filter(k => data[k] !== undefined));

async function createWithId(collection: string, id: string, data: Record<string, any>): Promise<boolean> {
  try {
    const res = await fetch(`${FS}/${collection}?documentId=${encodeURIComponent(id)}`, { method: 'POST', headers: await hdrs(), body: JSON.stringify({ fields: encFields(data) }) });
    if (!res.ok) console.error(`[enforcement] create ${collection}/${id} HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.ok;
  } catch { return false; }
}
async function createAuto(collection: string, data: Record<string, any>): Promise<void> {
  try { await fetch(`${FS}/${collection}`, { method: 'POST', headers: await hdrs(), body: JSON.stringify({ fields: encFields(data) }) }); } catch { /* best effort */ }
}

/** Single-field equality query (no composite index needed); sorted in memory by the caller. */
async function queryEq(collectionId: string, field: string, value: any, limit = 200): Promise<Array<Record<string, any> & { id: string }>> {
  const body = { structuredQuery: { from: [{ collectionId }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: enc(value) } }, limit } };
  const res = await fetch(`${FS}:runQuery`, { method: 'POST', headers: await hdrs(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`query ${collectionId} HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const rows = await res.json() as any[];
  return (Array.isArray(rows) ? rows : []).filter(r => r.document).map(r => ({ ...decFields(r.document.fields || {}), id: String(r.document.name).split('/').pop() as string }));
}

const newId = (prefix: string) => `${prefix}_${nodeCrypto.randomBytes(9).toString('hex')}`;
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// ── Standing cache + requireCapability ────────────────────────────────────────

const STANDING_TTL_MS = 30_000;
const standingCache = new Map<string, { at: number; doc: SanctionsDoc | null }>();

export function invalidateStanding(uid: string): void { standingCache.delete(uid); }

async function sanctionsFor(uid: string, fresh = false): Promise<SanctionsDoc | null> {
  const hit = standingCache.get(uid);
  if (!fresh && hit && Date.now() - hit.at < STANDING_TTL_MS) return hit.doc;
  const doc = await getDoc(`user_sanctions/${uid}`) as SanctionsDoc | null;
  standingCache.set(uid, { at: Date.now(), doc });
  if (standingCache.size > 5000) standingCache.delete(standingCache.keys().next().value as string);
  return doc;
}

/** Server-side standing for a uid. Throws on read failure. */
export async function getStanding(uid: string): Promise<Capabilities> {
  return capabilitiesFor(await sanctionsFor(uid), Date.now());
}

function restrictedBody(cap: CapabilityKey, c: Capabilities) {
  return {
    error: `Your account can't ${CAPABILITY_LABEL[cap]} right now (${durationLabel(c.expiresAt, Date.now())}). You can still sign in, read and message, and you can fix the content or appeal.`,
    code: 'STANDING_RESTRICTED', capability: cap, level: c.level, expiresAt: c.expiresAt,
    reasons: c.reasons.map(r => ({ actionId: r.actionId, rule: r.rule, ruleText: r.ruleText, expiresAt: r.expiresAt })),
    appealCenter: '/api/enforcement/me',
  };
}

/** Express gate. Must follow authMiddleware (reads req.uid). Fails OPEN on infrastructure errors. */
export function requireCapability(cap: CapabilityKey): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const uid = (req as any).uid as string | undefined;
    if (!uid || !adminConfig.hasCredentials()) return next();
    let c: Capabilities;
    try { c = await getStanding(uid); } catch (e: any) { console.warn('[enforcement] standing read failed, failing open:', e?.message); return next(); }
    if (allows(c, cap)) { (req as any).standing = c; return next(); }
    res.status(403).json(restrictedBody(cap, c));
  };
}

// ── Notices ───────────────────────────────────────────────────────────────────

async function notify(uid: string, title: string, message: string): Promise<void> {
  await createAuto('notifications', {
    userId: uid, senderId: 'plajah-trust', senderName: 'Plajah Trust & Safety', senderPhoto: '', type: 'SYSTEM',
    title: title.slice(0, 190), message: message.slice(0, 990), targetId: 'ACCOUNT_STANDING', isRead: false, timestamp: Date.now(),
  });
  // SECURITY-type email: always delivered to the verified address, can't be unsubscribed — Fair Process
  // notices must always reach the user. Plain text, no links. Non-blocking.
  dispatchEmailNotification({ toUid: uid, type: 'SECURITY', title, body: message }).catch(() => {});
}

function contentLabel(ref: ContentRef | null | undefined): string {
  if (!ref) return 'your account activity';
  return `your ${ref.kind || 'content'}${ref.snapshot ? ` ("${ref.snapshot.slice(0, 80)}${ref.snapshot.length > 80 ? '…' : ''}")` : ''}`;
}

// ── Router ────────────────────────────────────────────────────────────────────

type Mw = (req: any, res: any, next: any) => any;
export interface EnforcementDeps { authMiddleware: Mw; requireVerifiedAdmin: Mw }

const appealRate = new Map<string, number[]>(); // uid → timestamps (anti-flood only; generous)
const APPEALS_PER_DAY = 20;

function sanctionsSummary(a: { id: string; level: StandingLevel; rule: string; ruleText: string; contentRef: ContentRef | null; expiresAt: number | null; status: string; createdAt: number; csam?: boolean }) {
  return { id: a.id, level: a.level, rule: a.rule, ruleText: a.ruleText, contentRef: a.contentRef ?? null, expiresAt: a.expiresAt ?? null, status: a.status, createdAt: a.createdAt, csam: a.csam === true };
}

/** Patch one `actions.{id}` summary on user_sanctions/{uid} (ids are [A-Za-z0-9_] so no quoting needed). */
async function writeSummary(uid: string, summary: ReturnType<typeof sanctionsSummary>): Promise<boolean> {
  const ok = await patchMask(`user_sanctions/${uid}`, { actions: { [summary.id]: summary }, standingUpdatedAt: Date.now() }, [`actions.${summary.id}`, 'standingUpdatedAt']);
  invalidateStanding(uid);
  return ok;
}

function parseContentRef(raw: any): ContentRef | null {
  if (!raw || typeof raw !== 'object') return null;
  const kind = str(raw.kind, 40), id = str(raw.id, 200);
  if (!kind || !id) return null;
  const out: ContentRef = { kind, id };
  const path = str(raw.path, 300); if (path) out.path = path;
  const snap = str(raw.snapshot, 500); if (snap) out.snapshot = snap;
  return out;
}

/** Appeals against reasons with no enforcement_actions doc (legacy suspension / criminal review). */
async function decideSynthetic(req: any, res: Response, appealId: string, appeal: Record<string, any>, outcome: AppealOutcome, note: string) {
  const level: StandingLevel = isLevel(appeal.level) ? appeal.level : 'RESTRICTED_PUBLIC';
  const gate = canDecide(level, String(appeal.actionCreatedBy || ''), req.uid);
  if ('error' in gate) return res.status(403).json({ error: gate.error, code: 'SECOND_REVIEWER_REQUIRED' });
  const uid = String(appeal.uid);
  const now = Date.now();
  let userMsg = '';
  if (appeal.actionId === 'legacy-suspension') {
    if (outcome === 'overturn') { await patchTop(`user_sanctions/${uid}`, { suspendedUntil: null, standingUpdatedAt: now }); userMsg = 'We lifted the posting limit.'; }
    else if (outcome === 'modify') {
      const h = req.body?.durationHours == null ? null : Number(req.body.durationHours);
      if (h == null || !Number.isFinite(h) || h <= 0 || h > 24 * 365) return res.status(400).json({ error: 'modify needs durationHours (1..8760) for a legacy suspension' });
      await patchTop(`user_sanctions/${uid}`, { suspendedUntil: now + Math.round(h * 3_600_000), standingUpdatedAt: now });
      userMsg = `We shortened the limit: it now ends ${durationLabel(now + h * 3_600_000, now).replace(/^for /, 'in ')}.`;
    } else userMsg = 'We kept the limit in place.';
    invalidateStanding(uid);
  } else {
    // criminal-review: owned by services/safety/* (legal holds). The reviewer's decision is recorded and
    // routed to that team; this route never clears criminalReview itself.
    userMsg = outcome === 'overturn'
      ? 'A reviewer agreed with your appeal and has asked the safety team to close the review. Your limits lift as soon as it closes.'
      : 'A reviewer looked at your appeal. The review stays open for now.';
  }
  const appealStatus = APPEAL_STATUS_FOR[outcome];
  const timeline = [...(Array.isArray(appeal.timeline) ? appeal.timeline : []), { at: now, kind: appealStatus, note }];
  await patchTop(`appeals/${appealId}`, { status: appealStatus, outcome, decidedBy: req.uid, decidedAt: now, decisionNote: note, timeline,
    needsSafetyTeam: appeal.actionId === 'criminal-review' && outcome !== 'uphold' });
  await notify(uid, 'Your appeal was decided', `${userMsg} Reviewer note: ${note}`);
  return res.json({ ok: true, outcome });
}

export function createEnforcementRouter({ authMiddleware, requireVerifiedAdmin }: EnforcementDeps): Router {
  const r = Router();
  const json = express.json({ limit: '32kb' });
  const ready = (_req: any, res: any, next: any) => (adminConfig.hasCredentials() ? next() : res.status(503).json({ error: 'Server not configured.' }));

  // ── User: my standing ──
  r.get('/me', ready, authMiddleware, async (req: any, res) => {
    try {
      const doc = await sanctionsFor(req.uid, true);
      const now = Date.now();
      const standing = capabilitiesFor(doc, now);
      const [actions, appeals] = await Promise.all([
        queryEq('enforcement_actions', 'uid', req.uid).catch(() => []),
        queryEq('appeals', 'uid', req.uid).catch(() => []),
      ]);
      actions.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      appeals.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      // CSAM: specifics may be withheld — never echo the snapshot/path back.
      const safeActions = actions.map(a => (a.csam ? { ...a, contentRef: a.contentRef ? { kind: a.contentRef.kind, id: a.contentRef.id } : null, withheld: true } : a));
      res.json({ standing, actions: safeActions, appeals, now });
    } catch (e: any) {
      console.error('[enforcement] me', e?.message);
      res.status(500).json({ error: 'Could not load your account standing.' });
    }
  });

  // ── User: appeal ──
  r.post('/appeal', ready, authMiddleware, json, async (req: any, res) => {
    const v = validateAppealInput(req.body);
    if ('error' in v) return res.status(400).json({ error: v.error });
    const uid = req.uid as string;
    const now = Date.now();
    const recent = (appealRate.get(uid) || []).filter(t => now - t < 86_400_000);
    if (recent.length >= APPEALS_PER_DAY) return res.status(429).json({ error: 'You have sent a lot of appeals today. Your open appeals are still being reviewed.' });
    try {
      // Synthetic reasons (legacy suspension, criminal review from services/safety/*) have no action doc
      // but are still appealable — "users can always make their case".
      const synthetic = SYNTHETIC_ACTION_IDS.has(v.actionId);
      let action: Record<string, any> | null = null;
      let level: StandingLevel = 'LIMITED_REACH';
      let actionCreatedBy = '';
      if (synthetic) {
        const sanc = await sanctionsFor(uid, true);
        const reason = capabilitiesFor(sanc, now).reasons.find(x => x.actionId === v.actionId);
        if (!reason) return res.status(404).json({ error: 'Nothing to appeal here any more.' });
        level = reason.level;
        actionCreatedBy = v.actionId === 'legacy-suspension' ? String((sanc as any)?.updatedBy || '') : 'safety-pipeline';
      } else {
        action = await getDoc(`enforcement_actions/${v.actionId}`);
        if (!action || action.uid !== uid) return res.status(404).json({ error: 'Action not found.' });
        level = isLevel(action.level) ? action.level : 'LIMITED_REACH';
        actionCreatedBy = String(action.createdBy || '');
      }
      const mine = await queryEq('appeals', 'uid', uid);
      if (mine.some(a => a.actionId === v.actionId && a.status === 'PENDING')) return res.status(409).json({ error: 'You already have an open appeal for this action. It is being reviewed.' });
      const id = newId('ap');
      const appeal = {
        id, uid, actionId: v.actionId, level, statement: v.statement, evidence: v.evidence, correctionTaken: v.correctionTaken,
        status: 'PENDING', createdAt: now, slaDueAt: appealSlaDueAt(level, now),
        requiresSecondReviewer: needsSecondReviewer(level), actionCreatedBy, synthetic,
        timeline: [{ at: now, kind: 'SUBMITTED', note: 'Appeal received.' }],
        decidedBy: null, decidedAt: null, decisionNote: null, outcome: null,
      };
      if (!(await createWithId('appeals', id, appeal))) return res.status(500).json({ error: 'Could not file the appeal. Please try again.' });
      recent.push(now); appealRate.set(uid, recent);
      if (!action) return res.json({ ok: true, appeal });
      const status = action.status === 'CORRECTION_PENDING' ? 'CORRECTION_PENDING' : (isInForce({ status: action.status, expiresAt: action.expiresAt ?? null }, now) ? 'APPEALED' : action.status);
      await patchTop(`enforcement_actions/${v.actionId}`, { status, lastAppealId: id, updatedAt: now });
      const summary = normaliseAction(v.actionId, action);
      if (summary) await writeSummary(uid, sanctionsSummary({ ...summary, contentRef: summary.contentRef ?? null, status }));
      res.json({ ok: true, appeal });
    } catch (e: any) {
      console.error('[enforcement] appeal', e?.message);
      res.status(500).json({ error: 'Could not file the appeal. Please try again.' });
    }
  });

  // ── User: "I fixed it" ──
  r.post('/correct', ready, authMiddleware, json, async (req: any, res) => {
    const actionId = str(req.body?.actionId, 80);
    if (!/^[A-Za-z0-9_-]{4,80}$/.test(actionId)) return res.status(400).json({ error: 'actionId required' });
    const note = str(req.body?.note, 1000);
    const uid = req.uid as string;
    try {
      const action = await getDoc(`enforcement_actions/${actionId}`);
      if (!action || action.uid !== uid) return res.status(404).json({ error: 'Action not found.' });
      if (action.csam === true) return res.status(409).json({ error: 'This action can\'t be cleared by editing the content, but you can still appeal it.' });
      const now = Date.now();
      if (!isInForce({ status: action.status, expiresAt: action.expiresAt ?? null }, now)) return res.status(409).json({ error: 'This action is no longer in force.' });
      const correction = { at: now, note: note || null, slaDueAt: correctionSlaDueAt(now) };
      await patchTop(`enforcement_actions/${actionId}`, { status: 'CORRECTION_PENDING', correction, updatedAt: now });
      const summary = normaliseAction(actionId, action);
      if (summary) await writeSummary(uid, sanctionsSummary({ ...summary, contentRef: summary.contentRef ?? null, status: 'CORRECTION_PENDING' }));
      res.json({ ok: true, correction });
    } catch (e: any) {
      console.error('[enforcement] correct', e?.message);
      res.status(500).json({ error: 'Could not record your correction. Please try again.' });
    }
  });

  // ── Admin: queue ──
  r.get('/queue', ready, authMiddleware, requireVerifiedAdmin, async (_req: any, res) => {
    try {
      const [appeals, corrections] = await Promise.all([
        queryEq('appeals', 'status', 'PENDING', 300),
        queryEq('enforcement_actions', 'status', 'CORRECTION_PENDING', 300),
      ]);
      const actionIds = [...new Set(appeals.map(a => a.actionId).filter(Boolean))].slice(0, 100);
      const actions: Record<string, any> = {};
      await Promise.all(actionIds.map(async id => { try { const d = await getDoc(`enforcement_actions/${id}`); if (d) actions[id] = { ...d, id }; } catch { /* skip */ } }));
      appeals.sort((a, b) => (a.slaDueAt || 0) - (b.slaDueAt || 0));
      corrections.sort((a, b) => (a.correction?.slaDueAt || 0) - (b.correction?.slaDueAt || 0));
      res.json({ appeals, corrections, actions, now: Date.now() });
    } catch (e: any) {
      console.error('[enforcement] queue', e?.message);
      res.status(500).json({ error: 'Could not load the queue.' });
    }
  });

  // ── Admin: create an action ──
  r.post('/action', ready, authMiddleware, requireVerifiedAdmin, json, async (req: any, res) => {
    const b = req.body || {};
    const uid = str(b.uid, 128);
    if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid)) return res.status(400).json({ error: 'uid required' });
    if (uid === req.uid) return res.status(400).json({ error: 'You can\'t action your own account.' });
    if (!isLevel(b.level) || b.level === 'GOOD') return res.status(400).json({ error: 'level must be LIMITED_REACH | RESTRICTED_PUBLIC | RESTRICTED_MEDIA | CRIMINAL_REVIEW' });
    const level = b.level as StandingLevel;
    const rule = str(b.rule, 60).replace(/[^a-z0-9_]/gi, '_').toLowerCase();
    const ruleText = str(b.ruleText, 600);
    if (!rule || !ruleText) return res.status(400).json({ error: 'rule and ruleText are required — the user must be told exactly which rule.' });
    const contentRef = parseContentRef(b.contentRef);
    const hours = b.durationHours == null ? null : Number(b.durationHours);
    if (hours != null && (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 365)) return res.status(400).json({ error: 'durationHours must be 1..8760 or null (until reviewed)' });
    if (hours == null && LEVEL_RANK[level] < LEVEL_RANK.CRIMINAL_REVIEW && b.indefinite !== true) {
      return res.status(400).json({ error: 'Give a duration, or pass indefinite:true to make it last until reviewed.' });
    }
    const now = Date.now();
    const expiresAt = hours == null ? null : now + Math.round(hours * 3_600_000);
    const id = newId('ea');
    const reportIds = (Array.isArray(b.reportIds) ? b.reportIds : []).filter((x: unknown) => typeof x === 'string').slice(0, 50);
    const restrictions = restrictionsFor(level);
    const action = {
      id, uid, contentRef, rule, ruleText, level, restrictions, expiresAt, durationHours: hours,
      createdBy: req.uid as string, createdAt: now, status: 'ACTIVE', reportIds, csam: false,
      reviewerNote: str(b.note, 1000) || null, correction: null, lastAppealId: null, updatedAt: now,
      history: [{ at: now, kind: 'CREATED', by: req.uid as string, level, expiresAt }],
    };
    if (!(await createWithId('enforcement_actions', id, action))) return res.status(500).json({ error: 'Could not record the action.' });
    await writeSummary(uid, sanctionsSummary({ ...action }));
    await notify(uid,
      'A limit was placed on your account',
      `What: ${contentLabel(contentRef)}. Rule: ${ruleText} Limited: ${restrictions.join(' ')} How long: ${durationLabel(expiresAt, now)}. You can still sign in, read and message. You can fix the content or appeal from the banner at the top of Plajah.`,
    );
    res.json({ ok: true, action });
  });

  // ── Admin: decide an appeal ──
  r.post('/appeal/:id/decide', ready, authMiddleware, requireVerifiedAdmin, json, async (req: any, res) => {
    const appealId = str(req.params.id, 80);
    const outcome = req.body?.outcome as AppealOutcome;
    if (!['uphold', 'modify', 'overturn'].includes(outcome)) return res.status(400).json({ error: 'outcome must be uphold | modify | overturn' });
    const note = str(req.body?.note, 2000);
    if (!note) return res.status(400).json({ error: 'A decision note is required — the user is shown why.' });
    try {
      const appeal = await getDoc(`appeals/${appealId}`);
      if (!appeal) return res.status(404).json({ error: 'Appeal not found.' });
      if (appeal.status !== 'PENDING') return res.status(409).json({ error: `Appeal already ${appeal.status}.` });
      if (SYNTHETIC_ACTION_IDS.has(String(appeal.actionId))) return decideSynthetic(req, res, appealId, appeal, outcome, note);
      const action = await getDoc(`enforcement_actions/${appeal.actionId}`);
      if (!action) return res.status(404).json({ error: 'Action not found.' });
      const level: StandingLevel = isLevel(action.level) ? action.level : 'LIMITED_REACH';
      const gate = canDecide(level, String(action.createdBy || ''), req.uid);
      if ('error' in gate) return res.status(403).json({ error: gate.error, code: 'SECOND_REVIEWER_REQUIRED' });

      const now = Date.now();
      const mod: { level?: StandingLevel; expiresAt?: number | null } = {};
      if (outcome === 'modify') {
        if (req.body?.level != null) { if (!isLevel(req.body.level)) return res.status(400).json({ error: 'bad level' }); mod.level = req.body.level; }
        if (req.body?.durationHours !== undefined) {
          const h = req.body.durationHours == null ? null : Number(req.body.durationHours);
          if (h != null && (!Number.isFinite(h) || h <= 0 || h > 24 * 365)) return res.status(400).json({ error: 'bad durationHours' });
          mod.expiresAt = h == null ? null : now + Math.round(h * 3_600_000);
        }
        if (mod.level && LEVEL_RANK[mod.level] > LEVEL_RANK[level]) return res.status(400).json({ error: 'An appeal can\'t make an action harsher. Create a new action instead.' });
      }
      const result = applyOutcome({ level, expiresAt: action.expiresAt ?? null, csam: action.csam === true }, outcome, mod);
      const appealStatus = APPEAL_STATUS_FOR[outcome];
      const timeline = [...(Array.isArray(appeal.timeline) ? appeal.timeline : []), { at: now, kind: appealStatus, note }];
      await patchTop(`appeals/${appealId}`, { status: appealStatus, outcome, decidedBy: req.uid, decidedAt: now, decisionNote: note, timeline, contentRestorable: result.contentRestorable });
      const history = [...(Array.isArray(action.history) ? action.history : []), { at: now, kind: `APPEAL_${appealStatus}`, by: req.uid, level: result.level, expiresAt: result.expiresAt }];
      await patchTop(`enforcement_actions/${appeal.actionId}`, {
        status: result.status, level: result.level, expiresAt: result.expiresAt, restrictions: restrictionsFor(result.level), history, updatedAt: now,
      });
      await writeSummary(String(action.uid), sanctionsSummary({
        id: String(appeal.actionId), level: result.level, rule: String(action.rule || ''), ruleText: String(action.ruleText || ''),
        contentRef: action.contentRef ?? null, expiresAt: result.expiresAt, status: result.status, createdAt: Number(action.createdAt) || now, csam: action.csam === true,
      }));
      const what = outcome === 'overturn'
        ? `We reversed the action.${result.contentRestorable ? ' Any limits from it are lifted; removed content will be restored where we can.' : ' Limits from it are lifted. The content itself can\'t be restored.'}`
        : outcome === 'modify' ? `We changed the action: now ${restrictionsFor(result.level).join(' ') || 'no limits'} (${durationLabel(result.expiresAt, now)}).`
        : `We kept the action in place (${durationLabel(result.expiresAt, now)}).`;
      await notify(String(action.uid), 'Your appeal was decided', `${what} Reviewer note: ${note}`);
      res.json({ ok: true, outcome, result });
    } catch (e: any) {
      console.error('[enforcement] decide', e?.message);
      res.status(500).json({ error: 'Could not record the decision.' });
    }
  });

  // ── Admin: decide a correction (fast track) ──
  r.post('/correction/:actionId/decide', ready, authMiddleware, requireVerifiedAdmin, json, async (req: any, res) => {
    const actionId = str(req.params.actionId, 80);
    const accept = req.body?.accept === true;
    const note = str(req.body?.note, 2000) || (accept ? 'Thanks for fixing it.' : '');
    if (!note) return res.status(400).json({ error: 'A note is required when declining a correction.' });
    try {
      const action = await getDoc(`enforcement_actions/${actionId}`);
      if (!action) return res.status(404).json({ error: 'Action not found.' });
      if (action.status !== 'CORRECTION_PENDING') return res.status(409).json({ error: 'No correction pending.' });
      const now = Date.now();
      const level: StandingLevel = isLevel(action.level) ? action.level : 'LIMITED_REACH';
      // Was there an appeal still pending? Then it stays APPEALED.
      let status = accept ? 'RESTORED' : 'ACTIVE';
      if (!accept && action.lastAppealId) {
        try { const ap = await getDoc(`appeals/${action.lastAppealId}`); if (ap?.status === 'PENDING') status = 'APPEALED'; } catch { /* keep ACTIVE */ }
      }
      const history = [...(Array.isArray(action.history) ? action.history : []), { at: now, kind: accept ? 'CORRECTION_ACCEPTED' : 'CORRECTION_DECLINED', by: req.uid, note }];
      await patchTop(`enforcement_actions/${actionId}`, { status, correction: { ...(action.correction || {}), decidedAt: now, decidedBy: req.uid, accepted: accept, note }, history, updatedAt: now });
      await writeSummary(String(action.uid), sanctionsSummary({
        id: actionId, level, rule: String(action.rule || ''), ruleText: String(action.ruleText || ''), contentRef: action.contentRef ?? null,
        expiresAt: action.expiresAt ?? null, status, createdAt: Number(action.createdAt) || now, csam: action.csam === true,
      }));
      await notify(String(action.uid), accept ? 'Your fix was accepted' : 'Your fix needs another look',
        accept ? `The limit from this action is lifted. ${note}` : `The limit stays for now (${durationLabel(action.expiresAt ?? null, now)}). ${note} You can still appeal.`);
      res.json({ ok: true, status });
    } catch (e: any) {
      console.error('[enforcement] correction decide', e?.message);
      res.status(500).json({ error: 'Could not record the decision.' });
    }
  });

  return r;
}

