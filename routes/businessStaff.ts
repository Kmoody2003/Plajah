// businessStaff router — team members work a business from their OWN Plajah account (services/businessStaffCore.ts).
//
//   POST /invite  {pageId, role, roleKey?, roleLabel?, perms?, staffMemberId?}  owner → {code, expiresAt, inviteId}
//   POST /lookup  {code}                                                         any signed-in → StaffInviteSummary
//   POST /redeem  {code}                                                         signed-in, not owner → {pageId}
//   POST /update  {pageId, uid, role?, perms?, roleLabel?}                       owner → {seat}
//   POST /remove  {pageId, uid}                                                  owner, or the seat holder (leave) → {ok}
//   GET  /invites?pageId=                                                        owner → {invites:[{id, role, roleLabel, perms, expiresAt, createdAt}]}
//   POST /revoke  {inviteId}                                                     owner → {ok}
//
// Seats (businessPages.staffUids/staffSeats), the private owner index (businessStaffIndex/{owner} = {staffUids, staffPerms, updatedAt}) and the
// invites (businessStaffInvites/{sha256(code)}) are written ONLY here, with service-account REST (bypasses rules;
// firestore.rules forbids clients from touching those keys). Single-doc writes go through compare-and-swap
// (`cas`, backed by server.ts restCas) so concurrent redeems / edits cannot lose a seat or double-use a code.
//
// Mounted in server.ts as:  app.use('/api/business/staff', express.json({ limit: '8kb' }), createBusinessStaffRouter({...}))
// with authLimiter on /lookup and /redeem.

import { Router, Request, Response } from 'express';
import * as nodeCrypto from 'node:crypto';
import { verifyIdTokenDetailed, fsGet, fsPatch, fsQuery, adminConfig } from '../services/firebaseAdminRest';
import { casUpdate, type CasStore } from '../services/casCore';
import { makeInviteCode, normalizeInviteCode, INVITE_TTL_MS, type StaffSeat } from '../services/businessStaffCore';
import {
  inviteDocId, asSeatRole, seatPerms, validateInvite, INVITE_STATE_HTTP, inviteSummary, withSeat, withoutSeat,
  ownerStaffIndex, isSeated, cleanLabel, validId, type StaffInviteDoc, type SeatPageShape,
} from '../services/businessStaffServerCore';

export interface BusinessStaffDeps {
  /** Compare-and-swap store over a top-level collection (server.ts restCas). */
  cas: (collectionPath: string) => CasStore;
  /** Called after an owner's seats change so server-side permission caches drop that owner. */
  onStaffChanged?: (ownerUid: string) => void;
}

const INVITES = 'businessStaffInvites';
const MAX_PAGES_PER_OWNER = 50;

async function caller(req: Request) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  const t = await verifyIdTokenDetailed(auth.slice(7));
  return t && !t.isAnonymous ? t : null;
}

/** Drop undefined/null optional fields so Firestore never stores them as nulls inside the seat map. */
const compact = <T extends Record<string, any>>(o: T): T => {
  const out: any = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null) out[k] = v;
  return out;
};

export function createBusinessStaffRouter(deps: BusinessStaffDeps): Router {
  const r = Router();
  const pagesCas = deps.cas('businessPages');
  const indexCas = deps.cas('businessStaffIndex');
  const invitesCas = deps.cas(INVITES);

  const ready = (res: Response) => {
    if (adminConfig.hasCredentials()) return true;
    res.status(503).json({ error: 'Server not configured for staff accounts.' });
    return false;
  };

  const ownedPage = async (pageId: unknown, uid: string): Promise<{ id: string; data: Record<string, any> } | null | 'forbidden'> => {
    if (!validId(pageId)) return null;
    const page = await fsGet(`businessPages/${pageId}`);
    if (!page) return null;
    return page.ownerId === uid ? { id: pageId, data: page } : 'forbidden';
  };

  /** Rebuild businessStaffIndex/{owner} (staffPerms + staffUids) from all of the owner's pages (CAS on the index doc). */
  const reindexOwner = async (ownerUid: string): Promise<boolean> => {
    const out = await casUpdate(indexCas, ownerUid, async () => {
      const pages = await fsQuery('businessPages', [{ field: 'ownerId', value: ownerUid }], MAX_PAGES_PER_OWNER);
      const idx = ownerStaffIndex(pages.map(p => ({ id: p.id, ...p.data }) as SeatPageShape));
      return { patch: { staffPerms: idx.staffPerms, staffUids: idx.staffUids, updatedAt: Date.now() }, result: true };
    }).catch(() => ({ ok: false as const }));
    deps.onStaffChanged?.(ownerUid);
    return out.ok;
  };

  /** Point (or un-point) the roster record at an account. Only touches a staff doc that exists. */
  const linkStaff = async (ownerUid: string, staffMemberId: string | undefined, uid: string | null, onlyIfLinkedTo?: string) => {
    if (!staffMemberId || !validId(staffMemberId)) return;
    const doc = await fsGet(`businesses/${ownerUid}/staff/${staffMemberId}`);
    if (!doc) return;
    if (onlyIfLinkedTo && doc.linkedUid !== onlyIfLinkedTo) return;
    await fsPatch(`businesses/${ownerUid}/staff/${staffMemberId}`, { linkedUid: uid, updatedAt: Date.now() });
  };

  // ── POST /invite ───────────────────────────────────────────────────────────
  r.post('/invite', async (req: Request, res: Response) => {
    if (!ready(res)) return;
    const who = await caller(req);
    if (!who) return res.status(401).json({ error: 'Sign in first.' });
    const b = req.body || {};
    const page = await ownedPage(b.pageId, who.uid);
    if (!page) return res.status(404).json({ error: 'Business not found.' });
    if (page === 'forbidden') return res.status(403).json({ error: 'Only the business owner can invite staff.' });
    const role = asSeatRole(b.role);
    const staffMemberId = b.staffMemberId == null || b.staffMemberId === '' ? undefined : (validId(b.staffMemberId) ? b.staffMemberId : null);
    if (staffMemberId === null) return res.status(400).json({ error: 'Bad staff record id.' });
    if (staffMemberId && !(await fsGet(`businesses/${who.uid}/staff/${staffMemberId}`))) return res.status(404).json({ error: 'That roster record was not found.' });
    const now = Date.now();
    const expiresAt = now + INVITE_TTL_MS;
    const inv: StaffInviteDoc = compact({
      pageId: page.id, ownerUid: who.uid,
      businessName: String(page.data.businessName || page.data.name || 'Business').slice(0, 120),
      role, roleKey: cleanLabel(b.roleKey, 40), roleLabel: cleanLabel(b.roleLabel),
      perms: seatPerms(role, b.perms), staffMemberId,
      createdBy: who.uid, createdAt: now, expiresAt,
    });
    // Create-if-absent: a (vanishingly unlikely) hash collision just draws a new code.
    for (let i = 0; i < 4; i++) {
      const code = makeInviteCode(n => new Uint8Array(nodeCrypto.randomBytes(n)));
      const id = inviteDocId(code);
      let put: 'ok' | 'conflict' | 'error';
      try { put = await invitesCas.put(id, inv as any, null); } catch { put = 'error'; }
      if (put === 'ok') return res.json({ code, expiresAt, inviteId: id });
      if (put === 'error') break;
    }
    return res.status(500).json({ error: 'Could not create the invite. Try again.' });
  });

  // ── POST /lookup ───────────────────────────────────────────────────────────
  r.post('/lookup', async (req: Request, res: Response) => {
    if (!ready(res)) return;
    const who = await caller(req);
    if (!who) return res.status(401).json({ error: 'Sign in to join a team.' });
    const code = normalizeInviteCode(String(req.body?.code || ''));
    if (code.length !== 10) return res.status(404).json(INVITE_STATE_HTTP.missing);
    const inv = await fsGet(`${INVITES}/${inviteDocId(code)}`) as StaffInviteDoc | null;
    const state = validateInvite(inv, Date.now(), who.uid);
    if (state !== 'ok' && state !== 'owner') return res.status(INVITE_STATE_HTTP[state].status).json(INVITE_STATE_HTTP[state]);
    return res.json({ ...inviteSummary(inv!), isOwner: state === 'owner' });
  });

  // ── POST /redeem ───────────────────────────────────────────────────────────
  r.post('/redeem', async (req: Request, res: Response) => {
    if (!ready(res)) return;
    const who = await caller(req);
    if (!who) return res.status(401).json({ error: 'Sign in to join a team.' });
    const uid = who.uid;
    const code = normalizeInviteCode(String(req.body?.code || ''));
    if (code.length !== 10) return res.status(404).json(INVITE_STATE_HTTP.missing);
    const inviteId = inviteDocId(code);
    const now = Date.now();

    // 1) Claim the invite (CAS: only one account can flip usedBy).
    const claim = await casUpdate<{ inv?: StaffInviteDoc; state: string }>(invitesCas, inviteId, cur => {
      const state = validateInvite(cur as StaffInviteDoc | null, Date.now(), uid);
      if (state !== 'ok') return { abort: true, result: { state } };
      const inv = cur as StaffInviteDoc;
      if (inv.usedBy === uid) return { abort: true, result: { state: 'ok', inv } }; // already ours: repair below
      return { patch: { usedBy: uid, usedAt: now }, result: { state: 'ok', inv } };
    }).catch(() => ({ ok: false as const, reason: 'ERROR' as const, result: undefined }));
    const st = claim.result?.state;
    if (st && st !== 'ok') { const e = INVITE_STATE_HTTP[st as keyof typeof INVITE_STATE_HTTP]; return res.status(e.status).json(e); }
    const inv = claim.result?.inv;
    if (!inv) return res.status(503).json({ error: 'Busy — please try again.' });

    // 2) Seat the account on the page.
    const profile = await fsGet(`users/${uid}`);
    const seat: StaffSeat = compact({
      uid, name: String(profile?.displayName || 'Team member').slice(0, 80),
      role: asSeatRole(inv.role), roleKey: inv.roleKey || undefined, roleLabel: inv.roleLabel || undefined,
      perms: seatPerms(asSeatRole(inv.role), inv.perms), staffMemberId: inv.staffMemberId || undefined,
      addedAt: now, addedBy: inv.createdBy,
    });
    const seated = await casUpdate<string>(pagesCas, inv.pageId, cur => {
      if (!cur) return { abort: true, result: 'missing' };
      if (cur.ownerId !== inv.ownerUid) return { abort: true, result: 'moved' };
      return { patch: withSeat(cur as SeatPageShape, seat), result: 'ok' };
    }).catch(() => ({ ok: false as const, reason: 'ERROR' as const, result: undefined }));
    if (!seated.ok) {
      // Release the claim so the code can be retried (unless the business is gone).
      if (seated.result !== 'missing' && seated.result !== 'moved') {
        await casUpdate(invitesCas, inviteId, cur => (cur?.usedBy === uid ? { patch: { usedBy: null, usedAt: null }, result: 0 } : { abort: true, result: 0 })).catch(() => null);
      }
      return res.status(seated.result === 'missing' || seated.result === 'moved' ? 410 : 503).json({ error: seated.result ? 'That business is no longer available.' : 'Could not join right now — try again.' });
    }

    // 3) Owner index + roster link.
    await reindexOwner(inv.ownerUid);
    await linkStaff(inv.ownerUid, inv.staffMemberId || undefined, uid);
    return res.json({ pageId: inv.pageId });
  });

  // ── POST /update ───────────────────────────────────────────────────────────
  r.post('/update', async (req: Request, res: Response) => {
    if (!ready(res)) return;
    const who = await caller(req);
    if (!who) return res.status(401).json({ error: 'Sign in first.' });
    const b = req.body || {};
    const page = await ownedPage(b.pageId, who.uid);
    if (!page) return res.status(404).json({ error: 'Business not found.' });
    if (page === 'forbidden') return res.status(403).json({ error: 'Only the business owner can change staff access.' });
    if (!validId(b.uid)) return res.status(400).json({ error: 'Bad member.' });
    const out = await casUpdate<StaffSeat | null>(pagesCas, page.id, cur => {
      if (!cur || cur.ownerId !== who.uid || !isSeated(cur as SeatPageShape, b.uid)) return { abort: true, result: null };
      const prev = (cur.staffSeats as Record<string, StaffSeat>)[b.uid];
      const role = b.role === undefined ? prev.role : asSeatRole(b.role);
      const perms = b.perms !== undefined ? seatPerms(role, b.perms) : (b.role !== undefined && role !== prev.role ? seatPerms(role) : seatPerms(role, prev.perms));
      const next: StaffSeat = compact({ ...prev, role, perms, roleLabel: b.roleLabel === undefined ? prev.roleLabel : cleanLabel(b.roleLabel) });
      return { patch: withSeat(cur as SeatPageShape, next), result: next };
    }).catch(() => ({ ok: false as const, reason: 'ERROR' as const, result: undefined }));
    if (!out.ok) return res.status(out.result === null ? 404 : 503).json({ error: out.result === null ? 'That person is not on this team.' : 'Busy — please try again.' });
    await reindexOwner(who.uid);
    return res.json({ seat: out.result });
  });

  // ── POST /remove ───────────────────────────────────────────────────────────
  r.post('/remove', async (req: Request, res: Response) => {
    if (!ready(res)) return;
    const who = await caller(req);
    if (!who) return res.status(401).json({ error: 'Sign in first.' });
    const b = req.body || {};
    if (!validId(b.pageId) || !validId(b.uid)) return res.status(400).json({ error: 'Bad request.' });
    const page = await fsGet(`businessPages/${b.pageId}`);
    if (!page) return res.status(404).json({ error: 'Business not found.' });
    const ownerUid = String(page.ownerId || '');
    if (who.uid !== ownerUid && who.uid !== b.uid) return res.status(403).json({ error: 'Only the owner can remove other team members.' });
    const out = await casUpdate<StaffSeat | null>(pagesCas, b.pageId, cur => {
      if (!cur || String(cur.ownerId || '') !== ownerUid) return { abort: true, result: null };
      const prev = (cur.staffSeats || {})[b.uid] as StaffSeat | undefined;
      if (!prev && !(cur.staffUids || []).includes(b.uid)) return { abort: true, result: null };
      return { patch: withoutSeat(cur as SeatPageShape, b.uid), result: prev || null };
    }).catch(() => ({ ok: false as const, reason: 'ERROR' as const, result: undefined }));
    if (!out.ok && out.result === undefined) return res.status(503).json({ error: 'Busy — please try again.' });
    if (!out.ok) return res.status(404).json({ error: 'That person is not on this team.' });
    await reindexOwner(ownerUid);
    // Unlink the roster record only if no other page of this owner still seats them with the same link.
    if (out.result?.staffMemberId) {
      const pages = await fsQuery('businessPages', [{ field: 'ownerId', value: ownerUid }], MAX_PAGES_PER_OWNER);
      const stillLinked = pages.some(p => isSeated(p.data as SeatPageShape, b.uid) && (p.data.staffSeats as any)[b.uid]?.staffMemberId === out.result!.staffMemberId);
      if (!stillLinked) await linkStaff(ownerUid, out.result.staffMemberId, null, b.uid);
    }
    return res.json({ ok: true });
  });

  // ── GET /invites?pageId= ───────────────────────────────────────────────────
  r.get('/invites', async (req: Request, res: Response) => {
    if (!ready(res)) return;
    const who = await caller(req);
    if (!who) return res.status(401).json({ error: 'Sign in first.' });
    const page = await ownedPage(String(req.query.pageId || ''), who.uid);
    if (!page) return res.status(404).json({ error: 'Business not found.' });
    if (page === 'forbidden') return res.status(403).json({ error: 'Owner only.' });
    const rows = await fsQuery(INVITES, [{ field: 'pageId', value: page.id }, { field: 'ownerUid', value: who.uid }], 100);
    const now = Date.now();
    const invites = rows
      .filter(x => validateInvite(x.data as StaffInviteDoc, now) === 'ok' && !x.data.usedBy)
      .map(x => ({ id: x.id, role: asSeatRole(x.data.role), roleLabel: x.data.roleLabel || undefined, perms: seatPerms(asSeatRole(x.data.role), x.data.perms), staffMemberId: x.data.staffMemberId || undefined, createdAt: Number(x.data.createdAt), expiresAt: Number(x.data.expiresAt) }))
      .sort((a, b2) => b2.createdAt - a.createdAt);
    return res.json({ invites });
  });

  // ── POST /revoke ───────────────────────────────────────────────────────────
  r.post('/revoke', async (req: Request, res: Response) => {
    if (!ready(res)) return;
    const who = await caller(req);
    if (!who) return res.status(401).json({ error: 'Sign in first.' });
    const id = String(req.body?.inviteId || '');
    if (!/^[0-9a-f]{64}$/.test(id)) return res.status(400).json({ error: 'Bad invite id.' });
    const out = await casUpdate<number>(invitesCas, id, cur => {
      if (!cur) return { abort: true, result: 404 };
      if (cur.ownerUid !== who.uid) return { abort: true, result: 403 };
      if (cur.usedBy) return { abort: true, result: 409 };
      return { patch: { revoked: true, revokedAt: Date.now() }, result: 200 };
    }).catch(() => ({ ok: false as const, reason: 'ERROR' as const, result: 503 }));
    if (out.ok) return res.json({ ok: true });
    const status = out.result ?? 503;
    return res.status(status).json({ error: status === 404 ? 'Invite not found.' : status === 403 ? 'Owner only.' : status === 409 ? 'That invite was already used.' : 'Busy — please try again.' });
  });

  return r;
}
