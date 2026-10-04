// autoServer - Express routes for the AUTO REPAIR layer on top of the generic ticket engine:
//   vehicle records, NHTSA VIN decode + recalls (server-side proxy with cache), digital vehicle inspection,
//   AI service-advisor draft, service reminders, and the customer-owned Vehicle Passport ("My Garage").
// Registered from server.ts with ONE call; all server helpers are injected. Rules live in the pure, tested cores:
//   vehicleCore, nhtsaCore, inspectionCore, advisorCore, serviceReminderCore, passportCore.
//
//  Staff   POST /api/auto/{vin/decode, vin/recalls, vehicle/list, vehicle/get, vehicle/save, inspection/get, inspection/save,
//                          inspection/share, advisor/draft, passport/publish, passport/viewShared, reminders/send}
//          auth = Firebase auth + owner OR register PIN session (same as /api/tickets/*)
//  Customer POST /api/garage/{list, claim, entries, share}      auth = Firebase user; reads ONLY their own passports
//  Public  GET /v/:token  printable history (short-lived HMAC share token)
// Collections (all SERVER-WRITE-ONLY, see firestore.rules): vehicles, vinCache, recallCache, inspections, passports,
// passportEntries, serviceReminders. Object arrays are JSON-stringified (the REST writer cannot store them).
import nodeCrypto from 'node:crypto';
import { casUpdate } from './casCore';
import { parseTicket, type Ticket } from './ticketCore';
import { cfgForTicket, sendSms } from './ticketServer';
import {
  validateVin, vehicleKey, cleanVehicleInput, addMileage, serializeVehicle, parseVehicle, describeVehicle, normalizePlate, normalizeState, latestMileage,
  type Vehicle, type ServiceDone,
} from './vehicleCore';
import {
  decodeUrl, recallsUrl, recallCacheKey, parseDecodeVin, parseRecalls, fetchJsonWithRetry, isFresh, RECALL_TTL_MS, NEGATIVE_TTL_MS, NHTSA_DOWN_MESSAGE, RECALL_DISCLAIMER,
} from './nhtsaCore';
import { ticketPageExtras } from './ticketPageHooks';
import { renderInspectionSection } from './inspectionPublicHtml';
import { toPublicInspection, sanitizeInspection, serializeInspection, parseInspection, newInspection, summarize, templateById } from './inspectionCore';
import { buildAdvisorPrompt, buildFindings, validateAdvisorResponse, fallbackDraft, type AdvisorVehicle } from './advisorCore';
import { predictNextService, resolveIntervals, classifyLine, reminderMessage } from './serviceReminderCore';
import {
  buildEntry, canReadEntries, visibleToShop, makeClaimCode, normalizeClaimCode, formatShareToken, parseShareToken, renderPassportHtml, SHARE_TTL_MS, type PassportEntry,
} from './passportCore';

export interface AutoDeps {
  app: any; express: any; rateLimit: any; authMiddleware: any;
  resolveActor: (req: any, businessUid: string, perm: string) => Promise<any>;
  managerApproval: (businessUid: string, pin: any) => Promise<{ id: string; name: string } | null>;
  restCas: (collectionPath: string) => any;
  fsQueryDocs: (c: string, f: Array<{ field: string; op: string; value: any }>, n?: number) => Promise<Array<{ id: string; data: Record<string, any> }>>;
  firestoreRead: (c: string, id: string) => Promise<Record<string, any> | null>;
  firestoreGetDeep: (c: string, id: string) => Promise<Record<string, any> | null>;
  firestoreCreate: (c: string, data: object) => Promise<any>;
  sendFcmMulticast: (tokens: string[], opts: any) => Promise<any>;
  /** Test seam: replace network fetch (NHTSA + images). Defaults to global fetch. */
  fetchImpl?: (url: string, init?: any) => Promise<any>;
  /** Test seam: model call. Gets {system,user,images} and returns the raw text, or throws. Defaults to Gemini. */
  callModel?: (a: { system: string; user: string; images: { mimeType: string; data: string }[] }) => Promise<string>;
}

const secret = (): string =>
  process.env.TICKET_LINK_SECRET || process.env.REGISTER_SESSION_SECRET
  || nodeCrypto.createHash('sha256').update(String(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.STRIPE_SECRET_KEY || 'plajah-dev-ticket-secret')).digest('hex');
const shareMac = (body: string): string => nodeCrypto.createHmac('sha256', secret()).update(`passport|${body}`).digest('base64url').slice(0, 24);
const rid = (p: string) => `${p}_${Date.now().toString(36)}${nodeCrypto.randomBytes(4).toString('hex')}`;
const vehicleDocId = (businessUid: string, key: string): string => `vh_${nodeCrypto.createHash('sha1').update(`${businessUid}|${key}`).digest('hex').slice(0, 24)}`;
const safeEq = (a: string, b: string): boolean => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && nodeCrypto.timingSafeEqual(x, y); };
const jp = (s: any, d: any) => { try { const v = typeof s === 'string' ? JSON.parse(s) : s; return v ?? d; } catch { return d; } };
const IMG_HOSTS = /^https:\/\/(firebasestorage\.googleapis\.com|storage\.googleapis\.com)\//;
const MAX_GARAGE = 10;

export async function defaultCallModel(a: { system: string; user: string; images: { mimeType: string; data: string }[] }): Promise<string> {
  const key = process.env.GOOGLE_AI_API_KEY || process.env.VITE_GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
  if (!key) throw new Error('NO_KEY');
  const { GoogleGenAI } = await import('@google/genai');
  const genai = new GoogleGenAI({ apiKey: key });
  const parts: any[] = [{ text: a.user }, ...a.images.map(i => ({ inlineData: i }))];
  const r = await genai.models.generateContent({
    model: 'gemini-3.6-flash',
    contents: [{ role: 'user', parts }],
    config: { systemInstruction: a.system, responseMimeType: 'application/json', temperature: 0.3, thinkingConfig: { thinkingLevel: 'minimal' } } as any,
  });
  return String((r as any).text || '');
}

export function registerAutoRoutes(d: AutoDeps): void {
  const { app, express } = d;
  const fetcher = d.fetchImpl || ((u: string, i?: any) => fetch(u, i));
  const callModel = d.callModel || defaultCallModel;
  const jsonBody = express.json({ limit: '256kb' });
  const negative = new Map<string, number>();       // vin -> failedAt (in-memory; a restart just retries)

  const actorFor = async (req: any, res: any, perm = 'RING_SALES') => {
    const businessUid = String(req.body?.businessUid || '');
    if (!businessUid) { res.status(400).json({ error: 'businessUid required.' }); return null; }
    const a = await d.resolveActor(req, businessUid, perm);
    if (a.ok === false) { res.status(a.status).json({ error: a.error, code: a.code }); return null; }
    return { businessUid, actor: a };
  };
  const wrap = (name: string, fn: (req: any, res: any, a: { businessUid: string; actor: any }) => Promise<any>, perm = 'RING_SALES', limiter?: any) =>
    app.post(`/api/auto/${name}`, ...(limiter ? [limiter] : []), d.authMiddleware, jsonBody, async (req: any, res: any) => {
      try { const a = await actorFor(req, res, perm); if (a) await fn(req, res, a); }
      catch (err: any) { console.error(`/api/auto/${name}`, err?.message || err); res.status(500).json({ error: 'Request failed.' }); }
    });
  const aiLimit = d.rateLimit({ windowMs: 5 * 60_000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'AI request limit reached. Please wait a few minutes.' } });
  const garageLimit = d.rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests.' } });

  const businessName = async (uid: string): Promise<string> => {
    try { const r = await d.fsQueryDocs('businessPages', [{ field: 'ownerId', op: 'EQUAL', value: uid }], 1); return String(r[0]?.data?.businessName || 'Your shop'); } catch { return 'Your shop'; }
  };
  const loadTicket = async (id: string, businessUid: string): Promise<Ticket | null> => {
    const cur = await d.restCas('tickets').get(String(id || ''));
    if (!cur || String(cur.data.businessUid) !== businessUid) return null;
    return parseTicket(cur.data);
  };
  const loadVehicle = async (id: string, businessUid: string): Promise<Vehicle | null> => {
    const cur = await d.restCas('vehicles').get(String(id || ''));
    return cur && String(cur.data.businessUid) === businessUid ? parseVehicle(cur.data) : null;
  };

  // Customer ticket page plug-in: the inspection report, shown only after the advisor pressed "Share with customer".
  ticketPageExtras.push(async (t, cfg) => {
    if (!cfg.panels?.includes('auto_inspection')) return '';
    const cur = await d.restCas('inspections').get(t.id);
    if (!cur || cur.data.businessUid !== t.businessUid || !Number(cur.data.sharedAt)) return '';
    return renderInspectionSection(toPublicInspection(parseInspection(cur.data)), { shopName: await businessName(t.businessUid) });
  });

  // ── VIN decode (cached forever per VIN) ─────────────────────────────────────────────────────────
  wrap('vin/decode', async (req, res) => {
    const c = validateVin(String(req.body?.vin || ''));
    if (!c.valid) return res.status(400).json({ error: c.errors[0] });
    const vin = c.vin;
    const cached = await d.restCas('vinCache').get(vin).catch(() => null);
    if (cached?.data?.ok === true && cached.data.data) {
      return res.json({ ok: true, vehicle: jp(cached.data.data, null), warnings: c.warnings, cached: true, source: 'NHTSA' });
    }
    const failedAt = negative.get(vin);
    if (failedAt && Date.now() - failedAt < NEGATIVE_TTL_MS) return res.json({ ok: false, manual: true, error: NHTSA_DOWN_MESSAGE, warnings: c.warnings });
    const r = await fetchJsonWithRetry(decodeUrl(vin), fetcher as any, { timeoutMs: 8000, retries: 2 });
    if (r.ok === false) { negative.set(vin, Date.now()); return res.json({ ok: false, manual: true, error: NHTSA_DOWN_MESSAGE, warnings: c.warnings }); }
    const p = parseDecodeVin(r.json, vin);
    if (!p.ok || !p.vehicle) return res.json({ ok: false, manual: true, error: p.error || NHTSA_DOWN_MESSAGE, warnings: c.warnings });
    await casUpdate(d.restCas('vinCache'), vin, () => ({ patch: { vin, ok: true, data: JSON.stringify(p.vehicle), fetchedAt: Date.now() }, result: null })).catch(() => {});
    res.json({ ok: true, vehicle: p.vehicle, warnings: [...c.warnings, ...p.warnings], cached: false, source: 'NHTSA' });
  });

  // ── Recalls (cached 24h; stale cache beats an error) ────────────────────────────────────────────
  wrap('vin/recalls', async (req, res, { businessUid }) => {
    const make = String(req.body?.make || '').trim().slice(0, 60), model = String(req.body?.model || '').trim().slice(0, 80), year = Math.round(Number(req.body?.year));
    if (!make || !model || !(year >= 1950 && year <= new Date().getFullYear() + 2)) return res.status(400).json({ error: 'Year, make and model are needed to check recalls.' });
    const key = recallCacheKey(make, model, year);
    const cached = await d.restCas('recallCache').get(key).catch(() => null);
    const fetchedAt = Number(cached?.data?.fetchedAt) || 0;
    let recalls: any[] | null = cached?.data?.recalls ? jp(cached.data.recalls, null) : null;
    let stale = false, error: string | undefined;
    if (!(recalls && isFresh(fetchedAt, RECALL_TTL_MS))) {
      const r = await fetchJsonWithRetry(recallsUrl(make, model, year), fetcher as any, { timeoutMs: 8000, retries: 2 });
      const p = r.ok ? parseRecalls(r.json) : null;
      if (p?.ok) {
        recalls = p.recalls;
        await casUpdate(d.restCas('recallCache'), key, () => ({ patch: { key, recalls: JSON.stringify(p.recalls), fetchedAt: Date.now() }, result: null })).catch(() => {});
      } else if (recalls) { stale = true; error = 'Showing the last saved recall list; NHTSA could not be reached just now.'; }
      else return res.json({ ok: false, manual: true, error: NHTSA_DOWN_MESSAGE });
    }
    const out = { ok: true, recalls: recalls || [], disclaimer: RECALL_DISCLAIMER, cached: !!cached && !stale && isFresh(fetchedAt, RECALL_TTL_MS), stale, ...(error ? { error } : {}), checkedAt: stale ? fetchedAt : Date.now() };
    const vid = String(req.body?.vehicleId || '');
    if (vid) await casUpdate(d.restCas('vehicles'), vid, cur => (cur && cur.businessUid === businessUid ? { patch: { recalls: JSON.stringify({ checkedAt: out.checkedAt, open: out.recalls }), updatedAt: Date.now() }, result: null } : { abort: true, result: null })).catch(() => {});
    res.json(out);
  });

  // ── Vehicle records ─────────────────────────────────────────────────────────────────────────────
  wrap('vehicle/list', async (req, res, { businessUid }) => {
    const q = String(req.body?.q || '').toLowerCase().trim().slice(0, 60);
    const rows = (await d.fsQueryDocs('vehicles', [{ field: 'businessUid', op: 'EQUAL', value: businessUid }], 800)).map(r => parseVehicle(r.data));
    const out = rows.filter(v => !q || [v.vin, v.plate, v.make, v.model, v.ownerCustomerName].filter(Boolean).join(' ').toLowerCase().includes(q)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 400);
    res.json({ vehicles: out });
  });
  wrap('vehicle/get', async (req, res, { businessUid }) => {
    let v = await loadVehicle(String(req.body?.vehicleId || ''), businessUid);
    if (!v && req.body?.vin) { const c = validateVin(String(req.body.vin)); if (c.valid) v = await loadVehicle(vehicleDocId(businessUid, `vin_${c.vin}`), businessUid); }
    if (!v) return res.status(404).json({ error: 'Vehicle not found.' });
    res.json({ vehicle: v });
  });
  wrap('vehicle/save', async (req, res, { businessUid, actor }) => {
    const b = req.body || {};
    const cv = cleanVehicleInput(b.vehicle);
    if (cv.errors.length) return res.status(400).json({ error: cv.errors[0] });
    const input = cv.value;
    const key = vehicleKey({ vin: input.vin, plate: input.plate, state: input.state });
    const id = String(b.vehicleId || '') || (key ? vehicleDocId(businessUid, key) : rid('vh'));
    const by = String(actor.staffName || 'staff').slice(0, 60);
    // Odometer override: owner (DISCOUNT_OVERRIDE) or a manager PIN, never plain staff.
    let overrideOk = false;
    if (b.odometerOverride) {
      if (actor.perms?.has?.('DISCOUNT_OVERRIDE')) overrideOk = true;
      else { const m = await d.managerApproval(businessUid, b.managerPin); if (!m) return res.status(403).json({ error: 'Changing an odometer backwards needs a manager PIN.', code: 'MANAGER_PIN' }); overrideOk = true; }
    }
    let fail: { status: number; error: string; code?: string } | null = null; let warnings: string[] = [...cv.warnings];
    const out = await casUpdate<Vehicle | null>(d.restCas('vehicles'), id, cur => {
      const now = Date.now();
      let v: Vehicle = cur ? parseVehicle(cur) : { id, businessUid, key: key || '', mileage: [], services: [], notes: [], photos: [], createdAt: now, updatedAt: now };
      if (cur && v.businessUid !== businessUid) { fail = { status: 404, error: 'Vehicle not found.' }; return { abort: true, result: null }; }
      v = { ...v, ...input, key: key || v.key, id, businessUid, updatedAt: now };
      if (b.odometer !== undefined && b.odometer !== null && b.odometer !== '') {
        const r = addMileage(v.mileage, { odometer: Number(b.odometer), at: now, source: String(b.source || by).slice(0, 40), ...(b.ticketId ? { ticketId: String(b.ticketId).slice(0, 60) } : {}) }, { override: overrideOk });
        if (!r.check.ok) { fail = { status: 409, error: r.check.error || 'Odometer rejected.', code: 'ODOMETER_LOWER' }; return { abort: true, result: null }; }
        if (r.check.warning) warnings.push(r.check.warning);
        v.mileage = r.history;
      }
      if (b.note?.text) v.notes = [...v.notes, { id: rid('n'), text: String(b.note.text).trim().slice(0, 500), by, at: now }].slice(-40);
      if (b.photoUrl && /^https:\/\//i.test(String(b.photoUrl))) v.photos = [...v.photos, { url: String(b.photoUrl).slice(0, 1000), at: now }].slice(-12);
      if (b.intervalOverrides && typeof b.intervalOverrides === 'object') {
        const o: Record<string, { miles?: number; months?: number }> = {};
        for (const [k, val] of Object.entries<any>(b.intervalOverrides).slice(0, 20)) o[String(k).slice(0, 30)] = { ...(Number(val?.miles) >= 0 ? { miles: Math.round(Number(val.miles)) } : {}), ...(Number(val?.months) >= 0 ? { months: Math.round(Number(val.months)) } : {}) };
        v.intervalOverrides = o;
      }
      return { patch: serializeVehicle(v), result: v };
    });
    if (out.ok === false) {
      if (fail) return res.status((fail as any).status).json({ error: (fail as any).error, code: (fail as any).code });
      return res.status(out.reason === 'CONFLICT' ? 409 : 500).json({ error: 'Could not save the vehicle.' });
    }
    res.json({ vehicle: out.result, warnings });
  });

  // ── Inspection ──────────────────────────────────────────────────────────────────────────────────
  wrap('inspection/get', async (req, res, { businessUid }) => {
    const t = await loadTicket(String(req.body?.ticketId || ''), businessUid); if (!t) return res.status(404).json({ error: 'Ticket not found.' });
    const cur = await d.restCas('inspections').get(t.id);
    res.json({ inspection: cur && cur.data.businessUid === businessUid ? parseInspection(cur.data) : null });
  });
  wrap('inspection/save', async (req, res, { businessUid, actor }) => {
    const t = await loadTicket(String(req.body?.ticketId || ''), businessUid); if (!t) return res.status(404).json({ error: 'Ticket not found.' });
    const templateId = templateById(String(req.body?.templateId || '')).id;
    const out = await casUpdate<any>(d.restCas('inspections'), t.id, cur => {
      const base = cur && cur.businessUid === businessUid ? parseInspection(cur) : newInspection(t.id, templateId, String(actor.staffName || ''));
      const next = sanitizeInspection(req.body?.inspection, base);
      next.sharedAt = base.sharedAt;                      // sharing is its own action
      if (next.sharedAt === undefined) delete next.sharedAt;
      return { patch: serializeInspection(next, businessUid), result: next };
    });
    if (out.ok === false) return res.status(out.reason === 'CONFLICT' ? 409 : 500).json({ error: 'Could not save the inspection.' });
    res.json({ inspection: out.result, summary: summarize(out.result) });
  });
  // The human advisor presses "Share with customer": only then does the report appear on the customer link.
  wrap('inspection/share', async (req, res, { businessUid }) => {
    const t = await loadTicket(String(req.body?.ticketId || ''), businessUid); if (!t) return res.status(404).json({ error: 'Ticket not found.' });
    const on = req.body?.share !== false;
    const out = await casUpdate<any>(d.restCas('inspections'), t.id, cur => (cur && cur.businessUid === businessUid ? { patch: { sharedAt: on ? Date.now() : 0 }, result: true } : { abort: true, result: false }));
    if (out.ok === false) return res.status(404).json({ error: 'Save the inspection first.' });
    res.json({ shared: on });
  });

  // ── AI service advisor (DRAFT only) ─────────────────────────────────────────────────────────────
  wrap('advisor/draft', async (req, res, { businessUid }) => {
    const t = await loadTicket(String(req.body?.ticketId || ''), businessUid); if (!t) return res.status(404).json({ error: 'Ticket not found.' });
    const cur = await d.restCas('inspections').get(t.id);
    if (!cur || cur.data.businessUid !== businessUid) return res.status(400).json({ error: 'Save the inspection first.' });
    const insp = parseInspection(cur.data);
    const names = [t.customer.name, t.assignedTo?.name || '', String(insp.techName || '')].filter(Boolean);
    const findings = buildFindings(insp, names);
    if (!findings.length) return res.status(400).json({ error: 'Nothing to explain: no WATCH or FAIL items.' });
    const s = t.subject as Record<string, any>;
    const vehicle: AdvisorVehicle = { year: Number(s.year) || undefined, make: s.make ? String(s.make) : undefined, model: s.model ? String(s.model) : undefined, trim: s.trim ? String(s.trim) : undefined, engine: s.engine ? String(s.engine) : undefined, mileage: Number(s.mileage_in) || undefined };
    const prompt = buildAdvisorPrompt({ vehicle, findings, techNotes: insp.techNotes, knownNames: names });
    // Photos are OPT-IN (they can show plates / people) and only from our own storage hosts.
    const images: { mimeType: string; data: string }[] = [];
    if (req.body?.includePhotos === true) {
      const urls = [...new Set(findings.flatMap(f => insp.items[f.itemId]?.attachments.filter(a => a.kind === 'image').map(a => a.url) || []))].filter(u => IMG_HOSTS.test(u)).slice(0, 3);
      for (const u of urls) {
        try { const r = await fetcher(u, {}); if (!r.ok) continue; const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 4_000_000) continue; images.push({ mimeType: String(r.headers?.get?.('content-type') || 'image/jpeg').split(';')[0], data: buf.toString('base64') }); } catch { /* skip */ }
      }
    }
    try {
      const raw = await callModel({ system: prompt.system, user: prompt.user, images });
      const v = validateAdvisorResponse(raw, findings);
      if (v.ok === true) return res.json({ source: 'AI', draft: v.draft, photosUsed: images.length, label: 'AI draft. Review and edit before anything is sent.' });
      console.warn('[auto] advisor reply rejected:', (v as any).error);
      return res.json({ source: 'TEMPLATE', draft: { ...fallbackDraft(findings), issues: [`The AI reply was rejected (${(v as any).error}) so standard wording is shown. Edit before sending.`] }, photosUsed: 0, label: 'Standard wording. Review and edit before anything is sent.' });
    } catch (e: any) {
      const noKey = String(e?.message) === 'NO_KEY';
      if (!noKey) console.error('[auto] advisor model failed', e?.message || e);
      return res.json({ source: 'TEMPLATE', draft: fallbackDraft(findings), photosUsed: 0, unavailable: true, label: 'AI is unavailable right now. Standard wording shown; edit before sending.' });
    }
  }, 'RING_SALES', aiLimit);

  // ── Passport: shop publishes a verified entry from a closed ticket ───────────────────────────────
  wrap('passport/publish', async (req, res, { businessUid, actor }) => {
    const t = await loadTicket(String(req.body?.ticketId || ''), businessUid); if (!t) return res.status(404).json({ error: 'Ticket not found.' });
    const cfg = cfgForTicket(t.packId); if (!cfg) return res.status(400).json({ error: 'Not an auto ticket.' });
    const st = cfg.stages.find(x => x.id === t.stage);
    if (!(st?.kind === 'DONE' || t.saleOrderId)) return res.status(409).json({ error: 'Publish history after the vehicle is picked up or paid.' });
    const s = t.subject as Record<string, any>;
    const key = vehicleKey({ vin: String(s.vin || ''), plate: String(s.plate || ''), state: String(s.state || '') });
    if (!key) return res.status(400).json({ error: 'Add a valid VIN (or plate and state) to the ticket first.' });
    const shop = await businessName(businessUid);
    const insp = await d.restCas('inspections').get(t.id).then((c: any) => (c && c.data.businessUid === businessUid ? parseInspection(c.data) : null)).catch(() => null);
    const odo = Number(s.mileage_in) || undefined;
    const intervals = resolveIntervals();
    const serviceKeys = [...new Set(t.lines.filter(l => l.approval === 'APPROVED').flatMap(l => classifyLine(l.description, intervals)))];
    const built = buildEntry({
      id: t.id, passportKey: key, shopUid: businessUid, shopName: shop, ticketId: t.id, ticketNumber: t.number, at: t.paidAt || Date.now(), odometer: odo,
      lines: t.lines, serviceKeys, ...(insp ? { inspection: (({ pass, watch, fail }) => ({ pass, watch, fail }))(summarize(insp)) } : {}),
    });
    if (!built.entry) return res.status(400).json({ error: built.error });
    // passport doc (create if first entry). Owner = the ticket's Plajah customer when linked; otherwise a claim code is issued.
    let claimCode = '';
    const pp = await casUpdate<{ ownerUid: string; claimCode: string }>(d.restCas('passports'), key, cur => {
      if (cur) return { patch: { updatedAt: Date.now(), ...(!cur.ownerUid && t.customer.uid ? { ownerUid: t.customer.uid } : {}) }, result: { ownerUid: String(cur.ownerUid || t.customer.uid || ''), claimCode: String(cur.claimCode || '') } };
      const code = t.customer.uid ? '' : makeClaimCode(nodeCrypto.randomBytes(8));
      return { patch: {
        key, vin: String(s.vin || ''), plate: normalizePlate(String(s.plate || '')), state: normalizeState(String(s.state || '')),
        year: Number(s.year) || 0, make: String(s.make || ''), model: String(s.model || ''), trim: String(s.trim || ''),
        ownerUid: t.customer.uid || '', claimCode: code, createdAt: Date.now(), updatedAt: Date.now(),
      }, result: { ownerUid: t.customer.uid || '', claimCode: code } };
    });
    if (pp.ok === false) return res.status(500).json({ error: 'Could not write the vehicle passport.' });
    const owner = pp.result.ownerUid; claimCode = pp.result.ownerUid ? '' : pp.result.claimCode;
    const w = await casUpdate<string>(d.restCas('passportEntries'), t.id, cur => (cur ? { abort: true, result: 'EXISTS' } : { patch: { id: t.id, passportKey: key, shopUid: businessUid, ownerUid: owner, at: built.entry!.at, entry: JSON.stringify(built.entry) }, result: 'OK' }));
    if (w.ok === false && w.reason !== 'ABORT') return res.status(500).json({ error: 'Could not save the history entry.' });
    // Feed the shop's own vehicle record (mileage + services done) so reminders work.
    const vid = vehicleDocId(businessUid, key);
    await casUpdate(d.restCas('vehicles'), vid, cur => {
      const now = Date.now();
      let v: Vehicle = cur ? parseVehicle(cur) : { id: vid, businessUid, key, vin: String(s.vin || '') || undefined, plate: normalizePlate(String(s.plate || '')) || undefined, state: normalizeState(String(s.state || '')) || undefined, year: Number(s.year) || undefined, make: s.make ? String(s.make) : undefined, model: s.model ? String(s.model) : undefined, ownerCustomerName: t.customer.name, ownerUid: t.customer.uid, ownerEmail: t.customer.email, ownerPhone: t.customer.phone, mileage: [], services: [], notes: [], photos: [], createdAt: now, updatedAt: now };
      if (odo !== undefined) v.mileage = addMileage(v.mileage, { odometer: odo, at: built.entry!.at, source: `RO ${t.number}`, ticketId: t.id }, { override: false }).history;
      const done: ServiceDone[] = serviceKeys.filter(k => !v.services.some(x => x.ticketId === t.id && x.key === k)).map(k => ({ key: k, at: built.entry!.at, ticketId: t.id, ...(odo !== undefined ? { odometer: odo } : {}) }));
      v = { ...v, services: [...v.services, ...done].slice(-120), updatedAt: now };
      return { patch: serializeVehicle(v), result: null };
    }).catch(() => {});
    res.json({ ok: true, alreadyPublished: w.ok === false, passportKey: key, claimCode, ownerLinked: !!owner, recordedServices: serviceKeys, by: String(actor.staffName || '') });
  });

  // A shop reads another shop's entries ONLY through a token the vehicle owner created.
  wrap('passport/viewShared', async (req, res, { businessUid }) => {
    const p = parseShareToken(String(req.body?.token || ''), shareMac);
    if ('error' in p) return res.status(p.error === 'EXPIRED' ? 410 : 400).json({ error: p.error === 'EXPIRED' ? 'That share code has expired. Ask the owner for a new one.' : 'That share code is not valid.' });
    const rows = (await d.fsQueryDocs('passportEntries', [{ field: 'passportKey', op: 'EQUAL', value: p.key }], 200)).map(r => jp(r.data.entry, null) as PassportEntry | null).filter(Boolean) as PassportEntry[];
    const meta = await d.restCas('passports').get(p.key);
    res.json({ meta: meta ? { vin: meta.data.vin, year: meta.data.year, make: meta.data.make, model: meta.data.model } : null, entries: visibleToShop(rows, businessUid, true), expiresAt: p.exp });
  });

  // ── Service reminders: push / email (SMS stays a no-op seam) ────────────────────────────────────
  wrap('reminders/send', async (req, res, { businessUid }) => {
    const v = await loadVehicle(String(req.body?.vehicleId || ''), businessUid); if (!v) return res.status(404).json({ error: 'Vehicle not found.' });
    const serviceKey = String(req.body?.serviceKey || '');
    const pred = predictNextService({ mileage: v.mileage, services: v.services, intervals: resolveIntervals(undefined, v.intervalOverrides) }).find(x => x.key === serviceKey);
    if (!pred || (pred.status !== 'OVERDUE' && pred.status !== 'DUE_SOON')) return res.status(400).json({ error: 'That service is not due.' });
    const rkey = `${v.id}_${serviceKey}`;
    const recent = await d.restCas('serviceReminders').get(rkey).catch(() => null);
    if (recent && Date.now() - Number(recent.data.sentAt || 0) < 30 * 86_400_000 && !req.body?.force) return res.status(409).json({ error: 'A reminder for this was already sent in the last 30 days.', code: 'RECENT' });
    const shop = await businessName(businessUid);
    const msg = reminderMessage(shop, describeVehicle(v), pred);
    const out = { push: false, email: false, sms: false };
    try {
      if (v.ownerUid) {
        const sub = await d.firestoreRead(`businesses/${businessUid}/subscribers`, v.ownerUid).catch(() => null);
        if (!(sub && sub.transactional === false)) {
          await d.firestoreCreate('notifications', { userId: v.ownerUid, senderId: businessUid, senderName: shop, senderPhoto: '', type: 'BUSINESS_UPDATE', title: msg.title, message: msg.body, link: 'PROFILE', targetId: businessUid, isRead: false, timestamp: Date.now() });
          const u = await d.firestoreGetDeep('users', v.ownerUid);
          const tokens: string[] = [...(Array.isArray(u?.fcmTokens) ? u!.fcmTokens : []), ...(u?.fcmToken ? [u.fcmToken] : [])].filter(Boolean);
          if (tokens.length) d.sendFcmMulticast([...new Set(tokens)], { title: msg.title, body: msg.body.slice(0, 180), channelId: 'system', data: { type: 'BUSINESS_UPDATE', targetId: businessUid, senderName: shop } }).catch(() => {});
          out.push = true;
        }
      }
    } catch (e: any) { console.error('[auto] reminder push failed', e?.message); }
    try {
      if (v.ownerEmail && process.env.RESEND_API_KEY) {
        const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]);
        const r = await fetcher('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: process.env.RESEND_FROM || 'Plajah <onboarding@resend.dev>', to: v.ownerEmail, subject: msg.title, html: `<p>${esc(msg.body)}</p>` }) });
        out.email = !!r.ok;
      }
    } catch (e: any) { console.error('[auto] reminder email failed', e?.message); }
    if (v.ownerPhone) out.sms = (await sendSms(v.ownerPhone, msg.body)).sent;
    if (out.push || out.email) await casUpdate(d.restCas('serviceReminders'), rkey, () => ({ patch: { vehicleId: v.id, businessUid, serviceKey, sentAt: Date.now() }, result: null })).catch(() => {});
    res.json({ sent: out, reachable: out.push || out.email });
  });

  // ══ Customer garage (Plajah users) ════════════════════════════════════════════════════════════════
  const garage = (name: string, fn: (req: any, res: any, uid: string) => Promise<any>) =>
    app.post(`/api/garage/${name}`, garageLimit, d.authMiddleware, jsonBody, async (req: any, res: any) => {
      try { const uid = String(req.uid || ''); if (!uid) return res.status(401).json({ error: 'Sign in first.' }); await fn(req, res, uid); }
      catch (err: any) { console.error(`/api/garage/${name}`, err?.message || err); res.status(500).json({ error: 'Request failed.' }); }
    });
  const publicMeta = (id: string, x: Record<string, any>) => ({ key: id, vin: x.vin || '', plate: x.plate || '', state: x.state || '', year: Number(x.year) || undefined, make: x.make || '', model: x.model || '', trim: x.trim || '' });
  const entriesFor = async (key: string): Promise<PassportEntry[]> =>
    (await d.fsQueryDocs('passportEntries', [{ field: 'passportKey', op: 'EQUAL', value: key }], 200)).map(r => jp(r.data.entry, null) as PassportEntry | null).filter(Boolean) as PassportEntry[];

  garage('list', async (_req, res, uid) => {
    const rows = await d.fsQueryDocs('passports', [{ field: 'ownerUid', op: 'EQUAL', value: uid }], MAX_GARAGE + 5);
    const vehicles = await Promise.all(rows.map(async r => {
      const entries = await entriesFor(r.id);
      return { ...publicMeta(r.id, r.data), entryCount: entries.length, lastServiceAt: entries.reduce((m, e) => Math.max(m, e.at), 0) || undefined, lastOdometer: entries.filter(e => e.odometer !== undefined).sort((a, b) => b.at - a.at)[0]?.odometer };
    }));
    res.json({ vehicles });
  });

  garage('claim', async (req, res, uid) => {
    const c = validateVin(String(req.body?.vin || ''));
    let key = c.valid ? `vin_${c.vin}` : vehicleKey({ plate: String(req.body?.plate || ''), state: String(req.body?.state || '') });
    if (!key) return res.status(400).json({ error: c.valid ? 'Could not identify the vehicle.' : 'Enter a valid 17-character VIN, or a plate and state.' });
    const mine = await d.fsQueryDocs('passports', [{ field: 'ownerUid', op: 'EQUAL', value: uid }], MAX_GARAGE + 5);
    if (mine.length >= MAX_GARAGE && !mine.some(r => r.id === key)) return res.status(400).json({ error: `A garage holds up to ${MAX_GARAGE} vehicles in this version.` });
    const code = normalizeClaimCode(String(req.body?.code || ''));
    let fail: { status: number; error: string } | null = null;
    const out = await casUpdate<string>(d.restCas('passports'), key, cur => {
      const now = Date.now();
      if (!cur) return { patch: { key, vin: c.valid ? c.vin : '', plate: normalizePlate(String(req.body?.plate || '')), state: normalizeState(String(req.body?.state || '')), year: Number(req.body?.year) || 0, make: String(req.body?.make || '').slice(0, 60), model: String(req.body?.model || '').slice(0, 80), trim: '', ownerUid: uid, claimCode: '', createdAt: now, updatedAt: now }, result: 'CREATED' };
      if (cur.ownerUid === uid) return { abort: true, result: 'MINE' };
      if (cur.ownerUid) { fail = { status: 409, error: 'This vehicle is already in another Plajah garage. Ownership transfer is not available yet; contact support if this is yours.' }; return { abort: true, result: '' }; }
      if (!cur.claimCode || !code || !safeEq(normalizeClaimCode(String(cur.claimCode)), code)) { fail = { status: 403, error: 'This vehicle already has service history. Enter the claim code your shop gave you.' }; return { abort: true, result: '' }; }
      return { patch: { ownerUid: uid, claimCode: '', updatedAt: now }, result: 'CLAIMED' };
    });
    if (out.ok === false && !fail && out.reason !== 'ABORT') return res.status(500).json({ error: 'Could not add the vehicle.' });
    if (fail) return res.status((fail as any).status).json({ error: (fail as any).error });
    // Entries written before the claim carry ownerUid '' - keep the denormalised owner current.
    if (out.ok && out.result === 'CLAIMED') for (const e of await d.fsQueryDocs('passportEntries', [{ field: 'passportKey', op: 'EQUAL', value: key }], 200)) await casUpdate(d.restCas('passportEntries'), e.id, () => ({ patch: { ownerUid: uid }, result: null })).catch(() => {});
    res.json({ ok: true, key, status: out.ok ? out.result : 'MINE' });
  });

  garage('entries', async (req, res, uid) => {
    const key = String(req.body?.key || '');
    const p = await d.restCas('passports').get(key);
    if (!p || !canReadEntries({ ownerUid: String(p.data.ownerUid || ''), viewerUid: uid })) return res.status(404).json({ error: 'Vehicle not found in your garage.' });
    res.json({ meta: publicMeta(key, p.data), entries: (await entriesFor(key)).sort((a, b) => b.at - a.at) });
  });

  garage('share', async (req, res, uid) => {
    const key = String(req.body?.key || '');
    const p = await d.restCas('passports').get(key);
    if (!p || !canReadEntries({ ownerUid: String(p.data.ownerUid || ''), viewerUid: uid })) return res.status(404).json({ error: 'Vehicle not found in your garage.' });
    const scope = req.body?.scope === 'shop' ? 'shop' : 'view';
    const exp = Date.now() + SHARE_TTL_MS;
    const token = formatShareToken({ key, scope, exp }, shareMac);
    const base = (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    res.json({ token, scope, expiresAt: exp, url: scope === 'view' ? `${base}/v/${token}` : undefined });
  });

  // Public printable history for resale / handing to a buyer. Token = HMAC, 48h, read-only.
  app.get('/v/:token', d.rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false, message: 'Too many requests.' }), async (req: any, res: any) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex, nofollow'); res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const p = parseShareToken(String(req.params.token), shareMac);
      if ('error' in p) return res.status(p.error === 'EXPIRED' ? 410 : 404).type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link expired</title><body style="font:16px system-ui;padding:24px"><h1>${p.error === 'EXPIRED' ? 'This link has expired' : 'Link not found'}</h1><p>Ask the owner to share a new one.</p>`);
      const meta = await d.restCas('passports').get(p.key);
      if (!meta) return res.status(404).type('html').send('<!doctype html><title>Not found</title><p>Not found.</p>');
      res.type('html').send(renderPassportHtml({ vin: meta.data.vin || undefined, year: Number(meta.data.year) || undefined, make: meta.data.make || undefined, model: meta.data.model || undefined, trim: meta.data.trim || undefined }, await entriesFor(p.key)));
    } catch (err: any) { console.error('/v/:token', err?.message || err); res.status(500).type('html').send('<!doctype html><title>Error</title><p>Something went wrong.</p>'); }
  });
}
