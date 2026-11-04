// Chora label accounts: team, artist roster, release deals, distributor income and royalty statements.
// Pure rules live in services/label/labelCore.ts.
//
// labels, labelInvites, labelCatalog, labelImports, labelRecoupables and labelStatements are server-only (no
// firestore.rules match, so clients are denied by default); every read and write goes through this router.
//
// Consent: an album only joins a label when its owner links it, and a deal change needs both sides. The album
// stays owned by its artist. A finalized statement is never edited: paying it only records the payment, and
// nothing here moves money.
//
// Mounted in server.ts as:  app.use('/api/labels', express.json({ limit: '10mb' }), createLabelRouter({ cas: restCas }))

import { Router, Request, Response } from 'express';
import * as nodeCrypto from 'node:crypto';
import { verifyIdTokenDetailed, fsGetStrict, fsSet, fsPatch, fsQueryStrict, fsDelete, adminConfig } from '../services/firebaseAdminRest';
import { casUpdate, type CasStore } from '../services/casCore';
import { makeInviteCode, INVITE_TTL_MS } from '../services/businessStaffCore';
import { inviteDocId } from '../services/businessStaffServerCore';
import { isValidIsrc, isValidUpc, normIsrc } from '../services/melos/beats/releaseDesk';
import {
  roleCan, asInvitableRole, dealProblem, parseDistributorCsv, buildStatement, statementForParty, releaseReadiness,
  isMonth, LABEL_PARTY, BPS_TOTAL, type LabelPerm, type LabelRole, type DealParty, type CatalogEntry, type DirectEarning,
  type PriorStatement, type StoredImport, type Recoupable,
} from '../services/label/labelCore';

export interface LabelStore {
  get(path: string): Promise<Record<string, any> | null>;
  set(path: string, data: Record<string, unknown>): Promise<boolean>;
  patch(path: string, data: Record<string, unknown>): Promise<boolean>;
  del(path: string): Promise<boolean>;
  query(collection: string, filters: { field: string; value: string | number | boolean; op?: 'EQUAL' | 'ARRAY_CONTAINS' }[], limit: number): Promise<{ id: string; data: Record<string, any> }[]>;
}
export interface LabelDeps {
  cas: (collection: string) => CasStore;
  store?: LabelStore;
  verify?: (bearer: string) => Promise<{ uid: string } | null>;
  now?: () => number;
}

// Strict reads: a failed read must abort the request, not look like an empty catalog on a statement that can't be edited.
const restStore: LabelStore = { get: fsGetStrict, set: fsSet, patch: fsPatch, del: fsDelete, query: fsQueryStrict };
const restVerify = async (t: string) => {
  const d = await verifyIdTokenDetailed(t);
  return d && !d.isAnonymous ? { uid: d.uid } : null;
};

const MAX_LABELS_PER_USER = 10;
const MAX_MEMBERS = 50;
const MAX_ARTISTS = 500;
const MAX_CATALOG = 500;
const MAX_IMPORT_ROWS = 5000;
const EARNINGS_SCAN_LIMIT = 5000;

const validId = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(s);
const clean = (s: unknown, max = 120) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const currentMonth = (ms: number) => new Date(ms).toISOString().slice(0, 7);

export function createLabelRouter(deps: LabelDeps): Router {
  const r = Router();
  // Express 4 doesn't catch async handlers, and strict reads throw.
  for (const method of ['get', 'post', 'patch', 'delete'] as const) {
    const add = (r[method] as any).bind(r);
    (r as any)[method] = (path: string, handler: (req: Request, res: Response) => Promise<unknown>) => add(path, (req: Request, res: Response) => {
      handler(req, res).catch(err => {
        console.error('[labels]', req.method, req.path, err?.message);
        if (!res.headersSent) res.status(503).json({ error: 'Could not reach the database. Nothing was changed. Try again.' });
      });
    });
  }
  const store = deps.store || restStore;
  const verify = deps.verify || restVerify;
  const now = deps.now || Date.now;
  const labelsCas = deps.cas('labels');
  const invitesCas = deps.cas('labelInvites');
  const catalogCas = deps.cas('labelCatalog');
  const statementsCas = deps.cas('labelStatements');
  const albumsCas = deps.cas('albums');

  const signedIn = async (req: Request, res: Response) => {
    if (!deps.store && !adminConfig.hasCredentials()) { res.status(503).json({ error: 'Server not configured for label accounts.' }); return null; }
    const auth = req.headers.authorization;
    const who = auth?.startsWith('Bearer ') ? await verify(auth.slice(7)) : null;
    if (!who) res.status(401).json({ error: 'Sign in first.' });
    return who;
  };

  type Ctx = { uid: string; id: string; label: Record<string, any>; role: LabelRole | null; isArtist: boolean };
  /** Loads the label and the caller's place in it. Anyone with no place gets a 404, so ids reveal nothing. */
  const access = async (req: Request, res: Response): Promise<Ctx | null> => {
    const who = await signedIn(req, res);
    if (!who) return null;
    const id = String(req.params.id);
    const label = validId(id) ? await store.get(`labels/${id}`) : null;
    const role: LabelRole | null = label?.members?.[who.uid]?.role || null;
    const isArtist = !!label?.artists?.[who.uid];
    if (!label || (!role && !isArtist)) { res.status(404).json({ error: 'Label not found.' }); return null; }
    return { uid: who.uid, id, label, role, isArtist };
  };
  const need = (ctx: Ctx, res: Response, perm: LabelPerm) => {
    if (roleCan(ctx.role, perm)) return true;
    res.status(403).json({ error: 'Your role on this label does not allow that.' });
    return false;
  };

  const catalogOf = async (labelId: string) => (await store.query('labelCatalog', [{ field: 'labelId', value: labelId }], MAX_CATALOG)).map(d => d.data);
  const statementsOf = async (labelId: string) => (await store.query('labelStatements', [{ field: 'labelId', value: labelId }], 500)).map(d => ({ id: d.id, ...d.data }));

  const publicLabel = (ctx: Ctx) => {
    const { label } = ctx;
    if (roleCan(ctx.role, 'view')) return { id: ctx.id, ...label, myRole: ctx.role, isArtist: ctx.isArtist };
    return { id: ctx.id, name: label.name, myRole: null, isArtist: true, artists: { [ctx.uid]: label.artists[ctx.uid] } };
  };

  // ── Labels ─────────────────────────────────────────────────────────────────

  r.get('/', async (req, res) => {
    const who = await signedIn(req, res);
    if (!who) return;
    const [teams, rosters] = await Promise.all([
      store.query('labels', [{ field: 'memberUids', value: who.uid, op: 'ARRAY_CONTAINS' }], MAX_LABELS_PER_USER * 3),
      store.query('labels', [{ field: 'artistUids', value: who.uid, op: 'ARRAY_CONTAINS' }], 50),
    ]);
    const seen = new Map<string, { id: string; name: string; myRole: string | null; isArtist: boolean }>();
    for (const d of [...teams, ...rosters]) {
      seen.set(d.id, { id: d.id, name: d.data.name, myRole: d.data.members?.[who.uid]?.role || null, isArtist: !!d.data.artists?.[who.uid] });
    }
    res.json({ labels: [...seen.values()] });
  });

  r.post('/', async (req, res) => {
    const who = await signedIn(req, res);
    if (!who) return;
    const name = clean(req.body?.name);
    if (name.length < 2) return res.status(400).json({ error: 'Give the label a name.' });
    const owned = await store.query('labels', [{ field: 'ownerUid', value: who.uid }], MAX_LABELS_PER_USER);
    if (owned.length >= MAX_LABELS_PER_USER) return res.status(400).json({ error: 'You have reached the limit of labels on one account.' });
    const user = await store.get(`users/${who.uid}`);
    const t = now();
    const id = `lbl_${nodeCrypto.randomBytes(9).toString('hex')}`;
    const put = await labelsCas.put(id, {
      name, ownerUid: who.uid, memberUids: [who.uid], artistUids: [],
      members: { [who.uid]: { role: 'owner', name: clean(user?.displayName || user?.username || 'Owner'), addedAt: t } },
      artists: {}, createdAt: t,
    }, null);
    if (put !== 'ok') return res.status(500).json({ error: 'Could not create the label. Try again.' });
    res.json({ id });
  });

  r.get('/:id', async (req, res) => {
    const ctx = await access(req, res);
    if (ctx) res.json({ label: publicLabel(ctx) });
  });

  r.patch('/:id', async (req, res) => {
    const ctx = await access(req, res);
    if (!ctx || !need(ctx, res, 'team')) return;
    const name = clean(req.body?.name);
    if (name.length < 2) return res.status(400).json({ error: 'Give the label a name.' });
    const ok = await store.patch(`labels/${ctx.id}`, { name });
    res.status(ok ? 200 : 500).json(ok ? { ok: true } : { error: 'Could not rename the label.' });
  });

  // ── Invites ────────────────────────────────────────────────────────────────

  r.post('/:id/invites', async (req, res) => {
    const ctx = await access(req, res);
    if (!ctx) return;
    const b = req.body || {};
    const base = { labelId: ctx.id, labelName: ctx.label.name, createdBy: ctx.uid, createdAt: now(), expiresAt: now() + INVITE_TTL_MS };
    let doc: Record<string, unknown>;
    if (b.kind === 'team') {
      if (!need(ctx, res, 'team')) return;
      const role = asInvitableRole(b.role);
      if (!role) return res.status(400).json({ error: 'Pick a role for this person.' });
      doc = { ...base, kind: 'team', role };
    } else if (b.kind === 'artist') {
      if (!need(ctx, res, 'roster')) return;
      const artistBps = Number(b.artistBps);
      if (!Number.isInteger(artistBps) || artistBps < 0 || artistBps > BPS_TOTAL) return res.status(400).json({ error: 'The artist share must be between 0% and 100%.' });
      doc = { ...base, kind: 'artist', artistBps };
    } else return res.status(400).json({ error: 'Unknown invite type.' });
    for (let i = 0; i < 4; i++) {
      const code = makeInviteCode(n => new Uint8Array(nodeCrypto.randomBytes(n)));
      const put = await invitesCas.put(inviteDocId(code), doc as any, null).catch(() => 'error' as const);
      if (put === 'ok') return res.json({ code, expiresAt: base.expiresAt });
      if (put === 'error') break;
    }
    res.status(500).json({ error: 'Could not create the invite. Try again.' });
  });

  const inviteState = (inv: Record<string, any> | null) =>
    !inv ? 'That code is not valid.' : inv.usedBy ? 'That code has already been used.' : inv.revoked ? 'That code was cancelled.' : inv.expiresAt < now() ? 'That code has expired.' : null;

  r.post('/invites/lookup', async (req, res) => {
    const who = await signedIn(req, res);
    if (!who) return;
    const inv = await store.get(`labelInvites/${inviteDocId(String(req.body?.code || ''))}`);
    const problem = inviteState(inv);
    if (problem) return res.status(404).json({ error: problem });
    res.json({ labelName: inv!.labelName, kind: inv!.kind, role: inv!.role || null, artistBps: inv!.artistBps ?? null, expiresAt: inv!.expiresAt });
  });

  r.post('/invites/accept', async (req, res) => {
    const who = await signedIn(req, res);
    if (!who) return;
    const inviteId = inviteDocId(String(req.body?.code || ''));
    const user = await store.get(`users/${who.uid}`);
    const name = clean(user?.displayName || user?.username || 'Member');
    // Claim the code first: if two people race, only one gets the seat.
    const claim = await casUpdate<{ error?: string; inv?: Record<string, any> }>(invitesCas, inviteId, cur => {
      const problem = inviteState(cur);
      return problem ? { abort: true, result: { error: problem } } : { patch: { usedBy: who.uid, usedAt: now() }, result: { inv: cur! } };
    });
    if (!claim.ok || !claim.result?.inv) return res.status(404).json({ error: claim.result?.error || 'Could not use that code. Try again.' });
    const inv = claim.result.inv;
    const seat = await casUpdate<{ error?: string }>(labelsCas, inv.labelId, cur => {
      if (!cur) return { abort: true, result: { error: 'That label no longer exists.' } };
      if (inv.kind === 'team') {
        if (cur.members?.[who.uid]) return { abort: true, result: { error: 'You are already on this team.' } };
        if ((cur.memberUids || []).length >= MAX_MEMBERS) return { abort: true, result: { error: 'This team is full.' } };
        return { patch: { memberUids: [...cur.memberUids, who.uid], members: { ...cur.members, [who.uid]: { role: inv.role, name, addedAt: now() } } }, result: {} };
      }
      if (cur.artists?.[who.uid]) return { abort: true, result: { error: 'You are already on this roster.' } };
      if ((cur.artistUids || []).length >= MAX_ARTISTS) return { abort: true, result: { error: 'This roster is full.' } };
      return { patch: { artistUids: [...cur.artistUids, who.uid], artists: { ...cur.artists, [who.uid]: { name, artistBps: inv.artistBps, joinedAt: now(), termsAcceptedAt: now() } } }, result: {} };
    });
    if (!seat.ok) {
      // Give the code back so a failed seat doesn't burn it.
      await store.patch(`labelInvites/${inviteId}`, { usedBy: null, usedAt: null });
      return res.status(409).json({ error: seat.result?.error || 'Could not join. Try again.' });
    }
    res.json({ labelId: inv.labelId });
  });

  // ── Team and roster ────────────────────────────────────────────────────────

  r.patch('/:id/members/:uid', async (req, res) => {
    const ctx = await access(req, res);
    if (!ctx || !need(ctx, res, 'team')) return;
    const role = asInvitableRole(req.body?.role);
    if (!role) return res.status(400).json({ error: 'Pick a role.' });
    const out = await casUpdate<string>(labelsCas, ctx.id, cur => {
      const m = cur?.members?.[req.params.uid];
      if (!m) return { abort: true, result: 'That person is not on this team.' };
      if (m.role === 'owner') return { abort: true, result: "The owner's role can't be changed." };
      return { patch: { members: { ...cur!.members, [req.params.uid]: { ...m, role } } }, result: '' };
    });
    res.status(out.ok ? 200 : 400).json(out.ok ? { ok: true } : { error: out.result || 'Try again.' });
  });

  r.delete('/:id/members/:uid', async (req, res) => {
    const ctx = await access(req, res);
    if (!ctx) return;
    if (req.params.uid !== ctx.uid && !need(ctx, res, 'team')) return;
    const out = await casUpdate<string>(labelsCas, ctx.id, cur => {
      const m = cur?.members?.[req.params.uid];
      if (!m) return { abort: true, result: 'That person is not on this team.' };
      if (m.role === 'owner') return { abort: true, result: 'The owner cannot be removed.' };
      const members = { ...cur!.members };
      delete members[req.params.uid];
      return { patch: { members, memberUids: cur!.memberUids.filter((u: string) => u !== req.params.uid) }, result: '' };
    });
    res.status(out.ok ? 200 : 400).json(out.ok ? { ok: true } : { error: out.result || 'Try again.' });
  });

  r.delete('/:id/artists/:uid', async (req, res) => {
    const ctx = await access(req, res);
    if (!ctx) return;
    if (req.params.uid !== ctx.uid && !need(ctx, res, 'roster')) return;
    const linked = (await catalogOf(ctx.id)).some(c => c.ownerUid === req.params.uid);
    if (linked) return res.status(409).json({ error: 'End this artist’s release deals first. Earlier statements stay on record.' });
    const out = await casUpdate<string>(labelsCas, ctx.id, cur => {
      if (!cur?.artists?.[req.params.uid]) return { abort: true, result: 'That artist is not on this roster.' };
      const artists = { ...cur.artists };
      delete artists[req.params.uid];
      return { patch: { artists, artistUids: cur.artistUids.filter((u: string) => u !== req.params.uid) }, result: '' };
    });
    res.status(out.ok ? 200 : 400).json(out.ok ? { ok: true } : { error: out.result || 'Try again.' });
  });

  // ── Catalog ────────────────────────────────────────────────────────────────

  const catalogView = async (entry: Record<string, any>) => {
    const album = await store.get(`albums/${entry.albumId}`);
    const tracks: any[] = Array.isArray(album?.tracks) ? album!.tracks : [];
    return {
      ...entry,
      title: album?.title || entry.title,
      artist: album?.artist || '',
      coverUrl: album?.coverUrl || album?.coverImage || album?.coverArt || '',
      upc: album?.releaseMeta?.upc || '',
      tracks: tracks.map(t => ({ id: t.id, title: t.title, isrc: t.trackMeta?.isrc || '' })),
      problems: album ? releaseReadiness(album) : [{ level: 'error', text: 'This album no longer exists.' }],
    };
  };

  r.get('/:id/catalog', async (req, res) => {
    const ctx = await access(req, res);
    if (!ctx) return;
    let rows = await catalogOf(ctx.id);
    if (!roleCan(ctx.role, 'view')) rows = rows.filter(c => c.ownerUid === ctx.uid);
    res.json({ catalog: await Promise.all(rows.map(catalogView)) });
  });

  /** The caller's own albums that could be linked to a label. */
  r.get('/:id/linkable', async (req, res) => {
    const ctx = await access(req, res);
    if (!ctx) return;
    const [albums, mine] = await Promise.all([
      store.query('albums', [{ field: 'ownerId', value: ctx.uid }], 200),
      store.query('labelCatalog', [{ field: 'ownerUid', value: ctx.uid }], 500),
    ]);
    const taken = new Set(mine.map(m => m.id));
    res.json({ albums: albums.filter(a => !taken.has(a.id) && !a.data.isDraft).map(a => ({ id: a.id, title: a.data.title, artist: a.data.artist })) });
  });

  r.post('/:id/catalog', async (req, res) => {
    const ctx = await access(req, res);
    if (!ctx) return;
    const albumId = req.body?.albumId;
    if (!validId(albumId)) return res.status(400).json({ error: 'Pick an album.' });
    const album = await store.get(`albums/${albumId}`);
    if (!album) return res.status(404).json({ error: 'Album not found.' });
    if (album.ownerId !== ctx.uid) return res.status(403).json({ error: 'Only the album’s owner can add it to a label.' });
    if (!ctx.isArtist && !roleCan(ctx.role, 'catalog')) return res.status(403).json({ error: 'Your role on this label does not allow that.' });
    if ((await catalogOf(ctx.id)).length >= MAX_CATALOG) return res.status(400).json({ error: 'This label’s catalog is full.' });
    // A roster artist links on the terms they accepted; the label's own team member links a label-owned release.
    const artistBps: number = ctx.isArtist ? ctx.label.artists[ctx.uid].artistBps : 0;
    const parties: DealParty[] = [{ id: LABEL_PARTY, name: ctx.label.name, uid: ctx.label.ownerUid, bps: BPS_TOTAL - artistBps }];
    if (artistBps > 0 && ctx.uid !== ctx.label.ownerUid) parties.push({ id: ctx.uid, name: clean(album.artist || ctx.label.artists[ctx.uid].name), uid: ctx.uid, bps: artistBps });
    else parties[0].bps = BPS_TOTAL;
    const put = await catalogCas.put(albumId, { labelId: ctx.id, albumId, ownerUid: ctx.uid, title: clean(album.title), parties, linkedAt: now() }, null);
    if (put === 'conflict') return res.status(409).json({ error: 'This album is already with a label.' });
    if (put !== 'ok') return res.status(500).json({ error: 'Could not add the album. Try again.' });
    res.json({ ok: true });
  });

  const catalogEntry = async (ctx: Ctx, albumId: string, res: Response) => {
    const entry = validId(albumId) ? await store.get(`labelCatalog/${albumId}`) : null;
    if (!entry || entry.labelId !== ctx.id || (!roleCan(ctx.role, 'view') && entry.ownerUid !== ctx.uid)) { res.status(404).json({ error: 'That release is not in this catalog.' }); return null; }
    return entry;
  };

  /** Either side proposes; the other side must accept. Someone who is both sides applies it straight away. */
  r.post('/:id/catalog/:albumId/deal', async (req, res) => {
    const ctx = await access(req, res);
    if (!ctx) return;
    const entry = await catalogEntry(ctx, req.params.albumId, res);
    if (!entry) return;
    const isOwner = entry.ownerUid === ctx.uid, isLabel = roleCan(ctx.role, 'catalog');
    if (!isOwner && !isLabel) return res.status(403).json({ error: 'Your role on this label does not allow that.' });
    const parties: DealParty[] = (Array.isArray(req.body?.parties) ? req.body.parties : []).map((p: any) => ({
      id: clean(p?.id, 128), name: clean(p?.name), bps: Number(p?.bps), ...(typeof p?.uid === 'string' && p.uid ? { uid: clean(p.uid, 128) } : {}),
    }));
    const problem = dealProblem(parties);
    if (problem) return res.status(400).json({ error: problem });
    for (const p of parties) if (p.id === LABEL_PARTY) { p.name = ctx.label.name; p.uid = ctx.label.ownerUid; }
    const out = isOwner && isLabel
      ? await casUpdate<string>(catalogCas, entry.albumId, () => ({ patch: { parties, pendingDeal: null }, result: '' }))
      : await casUpdate<string>(catalogCas, entry.albumId, () => ({ patch: { pendingDeal: { parties, side: isOwner ? 'artist' : 'label', by: ctx.uid, at: now() } }, result: '' }));
    res.status(out.ok ? 200 : 500).json(out.ok ? { ok: true, applied: isOwner && isLabel } : { error: 'Try again.' });
  });

  const answerDeal = (accept: boolean) => async (req: Request, res: Response) => {
    const ctx = await access(req, res);
    if (!ctx) return;
    const entry = await catalogEntry(ctx, String(req.params.albumId), res);
    if (!entry) return;
    const isOwner = entry.ownerUid === ctx.uid, isLabel = roleCan(ctx.role, 'catalog');
    const out = await casUpdate<string>(catalogCas, entry.albumId, cur => {
      const p = cur?.pendingDeal;
      if (!p) return { abort: true, result: 'There is no proposed change to answer.' };
      const proposer = (p.side === 'artist' && isOwner) || (p.side === 'label' && isLabel);
      const other = p.side === 'artist' ? isLabel : isOwner;
      // A proposer may withdraw their own proposal, but only the other side can accept it.
      if (accept ? !other : !(other || proposer)) return { abort: true, result: 'The other side has to answer this.' };
      return { patch: accept ? { parties: p.parties, pendingDeal: null, dealAcceptedAt: now(), dealAcceptedBy: ctx.uid } : { pendingDeal: null }, result: '' };
    });
    res.status(out.ok ? 200 : 400).json(out.ok ? { ok: true } : { error: out.result || 'Try again.' });
  };
  r.post('/:id/catalog/:albumId/deal/accept', answerDeal(true));
  r.post('/:id/catalog/:albumId/deal/decline', answerDeal(false));

  r.delete('/:id/catalog/:albumId', async (req, res) => {
    const ctx = await access(req, res);
    if (!ctx) return;
    const entry = await catalogEntry(ctx, req.params.albumId, res);
    if (!entry) return;
    if (entry.ownerUid !== ctx.uid && !roleCan(ctx.role, 'catalog')) return res.status(403).json({ error: 'Your role on this label does not allow that.' });
    const ok = await store.del(`labelCatalog/${entry.albumId}`);
    res.status(ok ? 200 : 500).json(ok ? { ok: true } : { error: 'Try again.' });
  });

  r.post('/:id/catalog/:albumId/identifiers', async (req, res) => {
    const ctx = await access(req, res);
    if (!ctx) return;
    const entry = await catalogEntry(ctx, req.params.albumId, res);
    if (!entry) return;
    if (entry.ownerUid !== ctx.uid && !roleCan(ctx.role, 'catalog')) return res.status(403).json({ error: 'Your role on this label does not allow that.' });
    const upc = req.body?.upc === undefined ? undefined : String(req.body.upc).replace(/\D/g, '');
    if (upc && !isValidUpc(upc)) return res.status(400).json({ error: 'That UPC has the wrong check digit.' });
    const isrcs: Record<string, string> = req.body?.isrcs && typeof req.body.isrcs === 'object' ? req.body.isrcs : {};
    for (const v of Object.values(isrcs)) if (v && !isValidIsrc(String(v))) return res.status(400).json({ error: `${v} is not a valid ISRC.` });
    const out = await casUpdate<string>(albumsCas, entry.albumId, cur => {
      if (!cur) return { abort: true, result: 'Album not found.' };
      const tracks = (Array.isArray(cur.tracks) ? cur.tracks : []).map((t: any) =>
        t.id in isrcs ? { ...t, trackMeta: { ...(t.trackMeta || {}), isrc: normIsrc(String(isrcs[t.id])) } } : t);
      const seen = new Set<string>();
      for (const t of tracks) {
        const i = t.trackMeta?.isrc;
        if (i && seen.has(normIsrc(i))) return { abort: true, result: `${i} is used on two tracks.` };
        if (i) seen.add(normIsrc(i));
      }
      const patch: Record<string, unknown> = { tracks };
      if (upc !== undefined) patch.releaseMeta = { ...(cur.releaseMeta || {}), upc };
      return { patch, result: '' };
    });
    res.status(out.ok ? 200 : 400).json(out.ok ? { ok: true } : { error: out.result || 'Try again.' });
  });

  // ── Distributor income ─────────────────────────────────────────────────────

  r.get('/:id/imports', async (req, res) => {
    const ctx = await access(req, res);
    if (!ctx || !need(ctx, res, 'finance')) return;
    const docs = await store.query('labelImports', [{ field: 'labelId', value: ctx.id }], 500);
    res.json({ imports: docs.map(d => { const { rows, ...rest } = d.data; return { id: d.id, ...rest, rowCount: (rows || []).length }; }) });
  });

  r.post('/:id/imports', async (req, res) => {
    const ctx = await access(req, res);
    if (!ctx || !need(ctx, res, 'finance')) return;
    const csv = String(req.body?.csv || '');
    const source = clean(req.body?.source, 60);
    const fallbackMonth = isMonth(req.body?.month) ? req.body.month : null;
    if (!csv) return res.status(400).json({ error: 'Choose a CSV file.' });
    if (!source) return res.status(400).json({ error: 'Say which distributor this report came from.' });
    const parsed = parseDistributorCsv(csv, fallbackMonth);
    if ('error' in parsed) return res.status(400).json({ error: parsed.error });
    if (!parsed.rows.length) return res.status(400).json({ error: 'No usable lines in that file.', skipped: parsed.skipped });
    if (parsed.rows.length > MAX_IMPORT_ROWS) return res.status(400).json({ error: `That report has over ${MAX_IMPORT_ROWS} recording-months. Split it into smaller files.` });
    // Same file twice is the classic way to pay someone double, so the file's hash is its id.
    const id = `${ctx.id}_${nodeCrypto.createHash('sha256').update(csv).digest('hex').slice(0, 40)}`;
    const put = await deps.cas('labelImports').put(id, {
      labelId: ctx.id, source, filename: clean(req.body?.filename), rows: parsed.rows, lineCount: parsed.lineCount, skipped: parsed.skipped,
      totalMicros: parsed.rows.reduce((s, x) => s + x.micros, 0), createdBy: ctx.uid, createdAt: now(),
    }, null);
    if (put === 'conflict') return res.status(409).json({ error: 'That exact file has already been imported.' });
    if (put !== 'ok') return res.status(500).json({ error: 'Could not save the report. Try again.' });
    res.json({ id, rowCount: parsed.rows.length, lineCount: parsed.lineCount, skipped: parsed.skipped });
  });

  r.delete('/:id/imports/:importId', async (req, res) => {
    const ctx = await access(req, res);
    if (!ctx || !need(ctx, res, 'finance')) return;
    const { importId } = req.params;
    const doc = validId(importId) ? await store.get(`labelImports/${importId}`) : null;
    if (!doc || doc.labelId !== ctx.id) return res.status(404).json({ error: 'Report not found.' });
    const used = (await statementsOf(ctx.id)).some((s: any) => (s.appliedImportMonths || []).some((k: string) => k.startsWith(`${importId}:`)));
    if (used) return res.status(409).json({ error: 'This report is on a finalized statement, so it has to stay.' });
    const ok = await store.del(`labelImports/${importId}`);
    res.status(ok ? 200 : 500).json(ok ? { ok: true } : { error: 'Try again.' });
  });

  // ── Advances and expenses ──────────────────────────────────────────────────

  r.get('/:id/recoupables', async (req, res) => {
    const ctx = await access(req, res);
    if (!ctx) return;
    const docs = await store.query('labelRecoupables', [{ field: 'labelId', value: ctx.id }], 2000);
    const rows = docs.map(d => ({ id: d.id, ...d.data }));
    res.json({ recoupables: roleCan(ctx.role, 'finance') ? rows : rows.filter((x: any) => x.partyId === ctx.uid) });
  });

  r.post('/:id/recoupables', async (req, res) => {
    const ctx = await access(req, res);
    if (!ctx || !need(ctx, res, 'finance')) return;
    const b = req.body || {};
    const amountCents = Number(b.amountCents);
    if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > 1e11) return res.status(400).json({ error: 'Enter an amount above zero.' });
    if (typeof b.date !== 'string' || !isMonth(b.date.slice(0, 7))) return res.status(400).json({ error: 'Enter a date.' });
    if (!validId(b.partyId) || b.partyId === LABEL_PARTY) return res.status(400).json({ error: 'Pick who this is recouped from.' });
    const id = `rc_${nodeCrypto.randomBytes(9).toString('hex')}`;
    const ok = await store.set(`labelRecoupables/${id}`, {
      labelId: ctx.id, partyId: b.partyId, amountCents, date: b.date.slice(0, 10), kind: b.kind === 'advance' ? 'advance' : 'expense', note: clean(b.note, 200), createdBy: ctx.uid, createdAt: now(),
    });
    res.status(ok ? 200 : 500).json(ok ? { id } : { error: 'Try again.' });
  });

  r.delete('/:id/recoupables/:rid', async (req, res) => {
    const ctx = await access(req, res);
    if (!ctx || !need(ctx, res, 'finance')) return;
    const { rid } = req.params;
    const doc = validId(rid) ? await store.get(`labelRecoupables/${rid}`) : null;
    if (!doc || doc.labelId !== ctx.id) return res.status(404).json({ error: 'Not found.' });
    if ((await statementsOf(ctx.id)).some((s: any) => (s.appliedRecoupableIds || []).includes(rid))) return res.status(409).json({ error: 'This is on a finalized statement, so it has to stay.' });
    const ok = await store.del(`labelRecoupables/${rid}`);
    res.status(ok ? 200 : 500).json(ok ? { ok: true } : { error: 'Try again.' });
  });

  // ── Statements ─────────────────────────────────────────────────────────────

  /** Plajah sales already paid out, per album. Rows from before sales carried a release id can't be attributed. */
  const directEarnings = async (entries: Record<string, any>[]): Promise<{ rows: DirectEarning[]; truncated: boolean }> => {
    const albums = new Set(entries.map(e => e.albumId));
    const uids = new Set<string>();
    for (const e of entries) { uids.add(e.ownerUid); for (const p of e.parties) if (p.uid) uids.add(p.uid); }
    const rows: DirectEarning[] = [];
    let truncated = false;
    await Promise.all([...uids].map(async uid => {
      const docs = await store.query('creatorEarnings', [{ field: 'creatorUid', value: uid }], EARNINGS_SCAN_LIMIT);
      if (docs.length >= EARNINGS_SCAN_LIMIT) truncated = true;
      for (const d of docs) {
        const albumId = String(d.data.workId || d.data.albumId || '').split('__')[0];
        if (!albumId || !albums.has(albumId) || d.data.status === 'refunded') continue;
        rows.push({ id: d.id, albumId, uid, netCents: Number(d.data.creatorNetCents) || 0, at: Number(d.data.timestamp) || 0 });
      }
    }));
    return { rows, truncated };
  };

  const buildDraft = async (labelId: string, through: string) => {
    const entries = await catalogOf(labelId);
    const catalog: CatalogEntry[] = await Promise.all(entries.map(async e => {
      const album = await store.get(`albums/${e.albumId}`);
      const tracks: any[] = Array.isArray(album?.tracks) ? album!.tracks : [];
      return { albumId: e.albumId, title: album?.title || e.title, upc: album?.releaseMeta?.upc || '', isrcs: tracks.map(t => t.trackMeta?.isrc).filter(Boolean), parties: e.parties };
    }));
    const [imports, recoupables, prior, earnings] = await Promise.all([
      store.query('labelImports', [{ field: 'labelId', value: labelId }], 500),
      store.query('labelRecoupables', [{ field: 'labelId', value: labelId }], 2000),
      statementsOf(labelId),
      directEarnings(entries),
    ]);
    const draft = buildStatement({
      periodEnd: through, catalog,
      imports: imports.map(d => ({ id: d.id, source: d.data.source, rows: d.data.rows || [] }) as StoredImport),
      recoupables: recoupables.map(d => ({ id: d.id, ...d.data }) as unknown as Recoupable),
      earnings: earnings.rows,
      prior: prior as unknown as PriorStatement[],
    });
    if (earnings.truncated) draft.warnings.push('An account has too many sales to read in one go, so Plajah sales may be incomplete. Contact support before finalizing.');
    return { draft, prior: prior as (PriorStatement & { id: string })[] };
  };

  const throughProblem = (through: unknown, prior: PriorStatement[]) => {
    if (!isMonth(through)) return 'Pick a month.';
    if (through >= currentMonth(now())) return 'Statements can only cover months that have ended.';
    if (prior.some(p => p.periodEnd >= through)) return 'There is already a finalized statement for this month or a later one.';
    return null;
  };

  r.get('/:id/statements/preview', async (req, res) => {
    const ctx = await access(req, res);
    if (!ctx || !need(ctx, res, 'finance')) return;
    const through = req.query.through;
    if (!isMonth(through)) return res.status(400).json({ error: 'Pick a month.' });
    const { draft, prior } = await buildDraft(ctx.id, through);
    const problem = throughProblem(through, prior);
    res.json({ draft, blocked: problem });
  });

  r.post('/:id/statements', async (req, res) => {
    const ctx = await access(req, res);
    if (!ctx || !need(ctx, res, 'finance')) return;
    const through = req.body?.through;
    const { draft, prior } = await buildDraft(ctx.id, isMonth(through) ? through : '0000-00');
    const problem = throughProblem(through, prior);
    if (problem) return res.status(400).json({ error: problem });
    const closing: PriorStatement['closing'] = {};
    for (const p of draft.parties) closing[p.id] = { balanceCents: p.closingCents, unrecoupedCents: p.unrecoupedCents, paidCents: 0 };
    const id = `${ctx.id}_${through}`;
    const put = await statementsCas.put(id, {
      ...draft, labelId: ctx.id, labelName: ctx.label.name, closing, payments: [], partyUids: draft.parties.map(p => p.uid).filter(Boolean), closedAt: now(), closedBy: ctx.uid,
    }, null);
    if (put === 'conflict') return res.status(409).json({ error: 'This statement was just finalized by someone else.' });
    if (put !== 'ok') return res.status(500).json({ error: 'Could not finalize. Try again.' });
    res.json({ id });
  });

  r.get('/:id/statements', async (req, res) => {
    const ctx = await access(req, res);
    if (!ctx) return;
    const all: any[] = await statementsOf(ctx.id);
    all.sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
    const visible = roleCan(ctx.role, 'finance')
      ? all
      : all.map(s => {
        const mine = s.parties.filter((p: any) => p.uid === ctx.uid && p.id !== LABEL_PARTY).map((p: any) => p.id);
        return mine.length ? { ...statementForParty(s, mine), closing: undefined, payments: (s.payments || []).filter((x: any) => mine.includes(x.partyId)) } : null;
      }).filter(Boolean);
    res.json({ statements: visible });
  });

  /** Records a payment made outside Plajah. It reduces what the next statement carries forward. */
  r.post('/:id/statements/:sid/payments', async (req, res) => {
    const ctx = await access(req, res);
    if (!ctx || !need(ctx, res, 'finance')) return;
    const { sid } = req.params;
    const amountCents = Number(req.body?.amountCents);
    const partyId = req.body?.partyId;
    if (!Number.isInteger(amountCents) || amountCents <= 0) return res.status(400).json({ error: 'Enter an amount above zero.' });
    const out = await casUpdate<string>(statementsCas, sid, cur => {
      if (!cur || cur.labelId !== ctx.id) return { abort: true, result: 'Statement not found.' };
      const c = cur.closing?.[partyId];
      if (!c || partyId === LABEL_PARTY) return { abort: true, result: 'That party is not on this statement.' };
      const remaining = c.balanceCents - (c.paidCents || 0);
      if (amountCents > remaining) return { abort: true, result: 'That is more than this statement shows as owed.' };
      return {
        patch: {
          closing: { ...cur.closing, [partyId]: { ...c, paidCents: (c.paidCents || 0) + amountCents } },
          payments: [...(cur.payments || []), { partyId, amountCents, reference: clean(req.body?.reference, 120), at: now(), by: ctx.uid }],
        },
        result: '',
      };
    });
    res.status(out.ok ? 200 : 400).json(out.ok ? { ok: true } : { error: out.result || 'Try again.' });
  });

  return r;
}
