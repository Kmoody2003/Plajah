// templateShare router — the only way a template reaches the platform shelf (docTemplates tier 'platform').
//
//   POST /   { bundleJson, name, category, description?, ownerName?, fromOrgId? }  → { record }
//
// Firestore rules refuse client writes of platform templates, so the decision is made here, where the
// person's roles can be resolved properly (rules can only see admin/staff arrays on the org doc):
//   1. Which orgs is the document from? Its orgOrigin tag, the org the client named, and any org the
//      person belongs to whose name appears in its text (services/templates/templateSharePolicy.ts).
//   2. For each, the person's roles there — admin/staff from the org doc, teacher from the classes they
//      teach (churchPrograms) or their seat, volunteer/member from orgMemberships — against that org's
//      orgTemplatePolicies doc (sharing is off until an admin turns it on).
//   3. Anything from an org is stripped here (stripOrgContent), whatever the client sent.
// Limit that remains: someone who can read an org document can always retype it into a fresh one.
//
// Mounted in server.ts as:  app.use('/api/templates/share', express.json({ limit: '1mb' }), templateShareRouter)

import { Router, Request, Response } from 'express';
import { verifyIdTokenDetailed, fsGet, fsSet, fsQuery } from '../services/firebaseAdminRest';
import { stripOrgContent } from '../services/templates/stripOrgContent';
import { defaultPolicy, orgsInDocument, resolveShareRoles, sharingBlockedForRoles, type OrgTemplatePolicy } from '../services/templates/templateSharePolicy';
import type { TelaDoc } from '../types';


const MAX_BYTES = 700_000;
const CATEGORIES = new Set(['LESSON', 'WORKSHEET', 'QUIZ', 'FLYER', 'POSTER', 'NEWSLETTER', 'ANNOUNCEMENT', 'DOCUMENT', 'PRESENTATION', 'SOCIAL', 'PUBLICATION', 'OTHER']);
const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.trim().slice(0, n) : '');
const strip = <T,>(o: T): T => JSON.parse(JSON.stringify(o));

export interface TemplateShareDeps {
  verify: typeof verifyIdTokenDetailed;
  get: typeof fsGet;
  set: typeof fsSet;
  query: typeof fsQuery;
}
const live: TemplateShareDeps = { verify: verifyIdTokenDetailed, get: fsGet, set: fsSet, query: fsQuery };

export function createTemplateShareRouter({ verify, get, set, query }: TemplateShareDeps = live) {
  const router = Router();

  /** The person's orgs: seats they hold, plus orgs they created (a founder may have no seat). */
  async function myOrgs(uid: string) {
    const seats = await query('orgMemberships', [{ field: 'userId', value: uid }], 100);
    const created = await query('organizations', [{ field: 'creatorId', value: uid }], 25);
    const ids = new Set([...seats.map(s => String(s.data.orgId || '')), ...created.map(c => c.id)].filter(Boolean));
    return { ids: [...ids].slice(0, 40), seats };
  }

  async function rolesIn(uid: string, orgId: string, seats: Array<{ data: Record<string, any> }>) {
    const org = await get(`organizations/${orgId}`);
    const classes = await query('churchPrograms', [{ field: 'orgId', value: orgId }], 200);
    return {
      org,
      roles: resolveShareRoles(uid, {
        org,
        memberships: seats.filter(s => s.data.orgId === orgId).map(s => s.data),
        teachesAClass: classes.some(c => (c.data.teacherUids || []).includes(uid)),
      }),
    };
  }

  router.post('/', async (req: Request, res: Response) => {
    const auth = req.headers.authorization;
    const who = auth?.startsWith('Bearer ') ? await verify(auth.slice(7)) : null;
    if (!who || who.isAnonymous) return res.status(401).json({ error: 'Sign in to share templates.' });
    const uid = who.uid;

    const { bundleJson, name, category, description, ownerName, fromOrgId } = req.body || {};
    if (typeof bundleJson !== 'string' || bundleJson.length > 1_000_000) return res.status(400).json({ error: 'Missing or oversized document.' });
    let d: TelaDoc;
    try { d = JSON.parse(bundleJson); } catch { return res.status(400).json({ error: 'That document couldn’t be read.' }); }
    if (!d || !Array.isArray(d.frames) || !d.frames.length || !d.devices || typeof d.devices !== 'object') return res.status(400).json({ error: 'That isn’t a Tela document.' });
    const title = clip(name, 120) || clip(d.title, 120) || 'Untitled template';
    const cat = CATEGORIES.has(category) ? category : 'OTHER';

    // 1. Which orgs is it from?
    const mine = await myOrgs(uid);
    const named = await Promise.all(mine.ids.map(async id => ({ id, name: (await get(`organizations/${id}`))?.name as string | undefined })));
    const from = new Set(orgsInDocument(d, named));
    if (typeof fromOrgId === 'string' && fromOrgId) from.add(fromOrgId);

    // 2. Each org's policy against the roles the person really holds there.
    for (const orgId of from) {
      const { org, roles } = await rolesIn(uid, orgId, mine.seats);
      const saved = await get(`orgTemplatePolicies/${orgId}`);
      const policy: OrgTemplatePolicy = saved ? { ...defaultPolicy(orgId), ...(saved as OrgTemplatePolicy) } : defaultPolicy(orgId);
      const why = sharingBlockedForRoles(policy, roles);
      if (why) return res.status(403).json({ error: org?.name ? why.replace('This organization', String(org.name)) : why });
    }

    // 3. Strip anything that came from an org; personal creations go up as they are.
    const fromOrg = [...from][0];
    const bundle: TelaDoc = from.size ? stripOrgContent(d, { title }) : { ...d, orgOrigin: undefined };
    const json = JSON.stringify(strip({ ...bundle, locked: false, currentVersionId: undefined }));
    if (Buffer.byteLength(json) > MAX_BYTES) return res.status(413).json({ error: 'This document is too large to share as a template. Swap embedded photos for image slots.' });

    const now = Date.now();
    const id = `tpl_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const f = bundle.frames[0] as { w?: number; h?: number } | undefined;
    const record = strip({
      id, tier: 'platform', ownerUid: uid, ownerName: clip(ownerName, 80) || undefined,
      fromOrgId: fromOrg, stripped: from.size > 0,
      name: title, description: clip(description, 500) || undefined, category: cat,
      width: f?.w || 816, height: f?.h || 1056, pageCount: bundle.frames.length,
      bundleJson: json, uses: 0, createdAt: now, updatedAt: now,
    });
    if (!(await set(`docTemplates/${id}`, record))) return res.status(502).json({ error: 'Couldn’t save the template. Try again.' });
    res.json({ record });
  });

  return router;
}

export const templateShareRouter = createTemplateShareRouter();
