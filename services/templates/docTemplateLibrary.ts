// docTemplateLibrary — one template library for lessons, worksheets, flyers, newsletters and documents.
//
// Three shelves, one shape:
//   Platform  every user sees it: Tela's built-in gallery, the announcement flyer presets, and
//             templates people chose to share with everyone.
//   Org       the org's own templates, served from Content HQ (staff, leaders and admins).
//   Mine      the user's private templates.
// Records live in the ops DB beside Content HQ:
//   docTemplates/{id}            tier 'platform' | 'org' | 'user'; the Tela bundle inline (JSON)
//   orgTemplatePolicies/{orgId}  may this org's people share its documents to the platform, and who
// Sharing an org document to the platform is off until an admin turns it on. When it is allowed the
// shared copy is stripped first: every word becomes placeholder Latin, photos become empty image
// slots, and lesson/answer data, links and narration are removed — only the design travels.
import { collection, deleteDoc, doc, getDoc, getDocs, increment, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { opsDb, auth } from '../firebase';
import type { TelaDoc, TelaDevice, TelaFrame } from '../../types';
import { TELA_TEMPLATE_GALLERY, type TelaDesignTemplate } from '../tela/telaTemplateRegistry';
import { FLYER_PRESETS, flyerToTelaDoc, type FlyerPreset } from '../announcements/flyerPresets';
import { newTelaId } from '../telaStore';
import { stripOrgContent } from './stripOrgContent';
import { defaultPolicy, sharingBlockedReason, type OrgShareRole, type OrgTemplatePolicy } from './templateSharePolicy';
export { ORG_SHARE_ROLES, defaultPolicy, sharingBlockedReason, type OrgShareRole, type OrgTemplatePolicy } from './templateSharePolicy';

export type TemplateShelf = 'platform' | 'org' | 'mine';
export type DocTemplateCategory = 'LESSON' | 'WORKSHEET' | 'QUIZ' | 'FLYER' | 'POSTER' | 'NEWSLETTER' | 'ANNOUNCEMENT' | 'DOCUMENT' | 'PRESENTATION' | 'SOCIAL' | 'PUBLICATION' | 'OTHER';
export const CATEGORY_LABEL: Record<DocTemplateCategory, string> = {
  LESSON: 'Lessons', WORKSHEET: 'Worksheets', QUIZ: 'Quizzes', FLYER: 'Flyers', POSTER: 'Posters', NEWSLETTER: 'Newsletters',
  ANNOUNCEMENT: 'Announcements', DOCUMENT: 'Documents', PRESENTATION: 'Slides', SOCIAL: 'Social', PUBLICATION: 'Publications', OTHER: 'Other',
};

export interface DocTemplateRecord {
  id: string;
  tier: 'platform' | 'org' | 'user';
  ownerUid: string;
  ownerName?: string;
  /** tier 'org': whose library. */
  orgId?: string;
  orgName?: string;
  /** tier 'platform': the org the original came from (policy-checked, stripped). */
  fromOrgId?: string;
  stripped?: boolean;
  name: string;
  description?: string;
  category: DocTemplateCategory;
  tags?: string[];
  width: number;
  height: number;
  pageCount: number;
  bundleJson: string;
  uses?: number;
  createdAt: number;
  updatedAt: number;
}

/** One tile in the library UI, whatever its source. */
export interface LibraryTemplate {
  key: string;
  shelf: TemplateShelf;
  source: 'design' | 'flyer' | 'record';
  name: string;
  category: DocTemplateCategory;
  group: string;
  description: string;
  palette: string[];
  width: number;
  height: number;
  pages: number;
  by?: string;
  design?: TelaDesignTemplate;
  flyer?: FlyerPreset;
  record?: DocTemplateRecord;
}

const COL = 'docTemplates';
const POL = 'orgTemplatePolicies';
const LOCAL = 'plajah:docTemplates:v1';
const LOCAL_POL = 'plajah:orgTemplatePolicies:v1';
export const TEMPLATE_MAX_BYTES = 700_000;
export const TEMPLATES_CHANGED = 'plajah:docTemplatesChanged';

const strip = <T,>(o: T): T => JSON.parse(JSON.stringify(o));
const readLocal = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const writeLocal = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota */ } };
const changed = () => { try { window.dispatchEvent(new Event(TEMPLATES_CHANGED)); } catch { /* */ } };
const cloud = () => !!auth.currentUser;

// ── built-in shelf ────────────────────────────────────────────────────────────
const DESIGN_CATEGORY: Record<string, DocTemplateCategory> = {
  DESIGN_HISTORY: 'POSTER', PUBLICATION: 'PUBLICATION', DOCUMENT: 'DOCUMENT', POSTER: 'POSTER', SOCIAL: 'SOCIAL',
  PRESENTATION: 'PRESENTATION', WEB: 'OTHER', MENU: 'OTHER', LOWER_THIRD: 'OTHER',
};
const FLYER_CATEGORY: Record<FlyerPreset['kind'], DocTemplateCategory> = { FLYER: 'FLYER', POSTER: 'POSTER', NEWSLETTER: 'NEWSLETTER', ANNOUNCEMENT: 'ANNOUNCEMENT' };

let builtinsMemo: LibraryTemplate[] | null = null;
export function builtinTemplates(): LibraryTemplate[] {
  if (builtinsMemo) return builtinsMemo;
  const flyers: LibraryTemplate[] = FLYER_PRESETS.map(p => ({
    key: `flyer:${p.id}`, shelf: 'platform', source: 'flyer', name: p.name, category: FLYER_CATEGORY[p.kind], group: 'Announcements',
    description: p.blurb, palette: [...p.swatch], width: p.width, height: p.height, pages: 1, by: 'Plajah', flyer: p,
  }));
  const designs: LibraryTemplate[] = TELA_TEMPLATE_GALLERY.filter(t => t.collection !== 'LOWER_THIRD').map(t => ({
    key: `design:${t.id}`, shelf: 'platform', source: 'design', name: t.name,
    category: t.collection === 'PUBLICATION' && /NEWSLETTER/i.test(t.group) ? 'NEWSLETTER' : DESIGN_CATEGORY[t.collection] || 'OTHER',
    group: t.group, description: t.tagline, palette: t.palette, width: t.width, height: t.height, pages: t.pages.length, by: 'Plajah', design: t,
  }));
  builtinsMemo = [...flyers, ...designs];
  return builtinsMemo;
}

const recordTile = (r: DocTemplateRecord, shelf: TemplateShelf): LibraryTemplate => ({
  key: `rec:${r.id}`, shelf, source: 'record', name: r.name, category: r.category, group: shelf === 'org' ? (r.orgName || 'Org') : shelf === 'mine' ? 'Mine' : 'Community',
  description: r.description || '', palette: [], width: r.width, height: r.height, pages: r.pageCount, by: r.ownerName, record: r,
});

export async function listLibrary(opts: { uid?: string; orgId?: string }): Promise<Record<TemplateShelf, LibraryTemplate[]>> {
  const local = readLocal<DocTemplateRecord[]>(LOCAL, []);
  let remote: DocTemplateRecord[] = [];
  if (cloud()) {
    const base = collection(opsDb, COL);
    const qs = [query(base, where('tier', '==', 'platform'))];
    if (opts.orgId) qs.push(query(base, where('tier', '==', 'org'), where('orgId', '==', opts.orgId)));
    if (opts.uid) qs.push(query(base, where('tier', '==', 'user'), where('ownerUid', '==', opts.uid)));
    for (const q of qs) { try { remote.push(...(await getDocs(q)).docs.map(d => d.data() as DocTemplateRecord)); } catch { /* not staff of this org, or offline */ } }
  }
  const all = new Map<string, DocTemplateRecord>(); for (const r of [...local, ...remote]) all.set(r.id, r);
  const recs = [...all.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  return {
    platform: [...recs.filter(r => r.tier === 'platform').map(r => recordTile(r, 'platform')), ...builtinTemplates()],
    org: recs.filter(r => r.tier === 'org' && r.orgId === opts.orgId).map(r => recordTile(r, 'org')),
    mine: recs.filter(r => r.tier === 'user' && (!opts.uid || r.ownerUid === opts.uid)).map(r => recordTile(r, 'mine')),
  };
}

// ── instantiate (customize a template = an editable copy in your own Tela) ────
const uid = (p: string) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export function designToTelaDoc(t: TelaDesignTemplate, ownerId: string): TelaDoc {
  const devices: Record<string, TelaDevice> = {};
  const frames: TelaFrame[] = t.pages.map((page, i) => {
    const id = uid('dev');
    devices[id] = { id, type: 'VECTOR', name: `${t.name} · ${page.label}`, width: t.width, height: t.height, objects: page.build() };
    return { id: uid('frame'), kind: t.frameKind, preset: 'FREE', x: i * (t.width + 96), y: 0, w: t.width, h: t.height, deviceIds: [id], label: `${i + 1} · ${page.label}` };
  });
  const now = Date.now();
  return { id: newTelaId(), ownerId, title: t.name, frames, devices, bindings: [], createdAt: now, updatedAt: now };
}

/** A fresh, editable TelaDoc from any library tile. */
export function instantiateTemplate(t: LibraryTemplate, ownerId: string, flyerFields?: Parameters<typeof flyerToTelaDoc>[1]): TelaDoc {
  if (t.flyer) return flyerToTelaDoc(t.flyer, flyerFields || { headline: '', ...t.flyer.defaults } as any, ownerId);
  if (t.design) return designToTelaDoc(t.design, ownerId);
  const src = JSON.parse(t.record!.bundleJson) as TelaDoc;
  const now = Date.now();
  if (cloud() && t.record) { void updateDoc(doc(opsDb, COL, t.record.id), { uses: increment(1) }).catch(() => {}); }
  return { ...src, id: newTelaId(), ownerId, title: t.name, locked: false, currentVersionId: undefined, createdAt: now, updatedAt: now };
}

// ── save / share ──────────────────────────────────────────────────────────────
function measure(d: TelaDoc) {
  const f = d.frames[0];
  return { width: f?.w || 816, height: f?.h || 1056, pageCount: d.frames.length };
}

function encodeBundle(d: TelaDoc): string {
  const clean: TelaDoc = { ...d, locked: false, currentVersionId: undefined };
  const json = JSON.stringify(clean);
  if (new TextEncoder().encode(json).length > TEMPLATE_MAX_BYTES) throw new Error('This document is too large to save as a template. Swap embedded photos for linked ones or image slots.');
  return json;
}

export async function saveDocAsTemplate(d: TelaDoc, o: { tier: 'user' | 'org'; name: string; category: DocTemplateCategory; description?: string; orgId?: string; orgName?: string; ownerName?: string }): Promise<{ record: DocTemplateRecord; synced: boolean }> {
  const me = auth.currentUser?.uid || 'local';
  if (o.tier === 'org' && !o.orgId) throw new Error('Pick the organization whose library this goes in.');
  const now = Date.now();
  const record: DocTemplateRecord = strip({
    id: uid('tpl'), tier: o.tier, ownerUid: me, ownerName: o.ownerName, orgId: o.tier === 'org' ? o.orgId : undefined, orgName: o.tier === 'org' ? o.orgName : undefined,
    name: o.name.trim() || d.title, description: o.description?.trim() || undefined, category: o.category, ...measure(d), bundleJson: encodeBundle(d), uses: 0, createdAt: now, updatedAt: now,
  });
  return { record, synced: await put(record) };
}

/**
 * Share a document to everyone on Plajah. A document from an org goes only when that org's policy
 * lets this person's role share, and always leaves stripped of the org's content.
 */
export async function shareDocToPlatform(d: TelaDoc, o: { name: string; category: DocTemplateCategory; description?: string; ownerName?: string; fromOrg?: { orgId: string; orgName?: string; role: OrgShareRole; policy?: OrgTemplatePolicy } }): Promise<{ record: DocTemplateRecord; synced: boolean }> {
  let bundle = d;
  if (o.fromOrg) {
    const policy = o.fromOrg.policy || await getOrgTemplatePolicy(o.fromOrg.orgId);
    const why = sharingBlockedReason(policy, o.fromOrg.role);
    if (why) throw new Error(why);
    bundle = stripOrgContent(d, { title: o.name });
  }
  // Signed in, the server makes the real decision: it resolves the person's roles in every org the
  // document comes from (its tag, or an org name in its text), checks each org's policy, strips it
  // itself and writes the platform record. Clients can't write platform templates directly.
  const u = auth.currentUser;
  if (u) {
    const token = await u.getIdToken();
    const res = await fetch('/api/templates/share', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ bundleJson: JSON.stringify(d), name: o.name, category: o.category, description: o.description, ownerName: o.ownerName, fromOrgId: o.fromOrg?.orgId }),
    });
    const out = await res.json().catch(() => ({})) as { record?: DocTemplateRecord; error?: string };
    if (!res.ok || !out.record) throw new Error(out.error || 'Couldn’t share this template right now.');
    writeLocal(LOCAL, [...readLocal<DocTemplateRecord[]>(LOCAL, []).filter(x => x.id !== out.record!.id), out.record].slice(-120));
    changed();
    return { record: out.record, synced: true };
  }
  // Signed out (labs): kept on this device only.
  const now = Date.now();
  const record: DocTemplateRecord = strip({
    id: uid('tpl'), tier: 'platform', ownerUid: 'local', ownerName: o.ownerName, fromOrgId: o.fromOrg?.orgId, stripped: !!o.fromOrg,
    name: o.name.trim() || bundle.title, description: o.description?.trim() || undefined, category: o.category, ...measure(bundle), bundleJson: encodeBundle(bundle), uses: 0, createdAt: now, updatedAt: now,
  });
  writeLocal(LOCAL, [...readLocal<DocTemplateRecord[]>(LOCAL, []).filter(x => x.id !== record.id), record].slice(-120));
  changed();
  return { record, synced: false };
}

async function put(r: DocTemplateRecord): Promise<boolean> {
  writeLocal(LOCAL, [...readLocal<DocTemplateRecord[]>(LOCAL, []).filter(x => x.id !== r.id), r].slice(-120));
  let synced = false;
  if (cloud()) { try { await setDoc(doc(opsDb, COL, r.id), r); synced = true; } catch { /* rules or offline: kept on this device */ } }
  changed();
  return synced;
}

export async function deleteTemplateRecord(r: DocTemplateRecord): Promise<void> {
  writeLocal(LOCAL, readLocal<DocTemplateRecord[]>(LOCAL, []).filter(x => x.id !== r.id));
  if (cloud()) { try { await deleteDoc(doc(opsDb, COL, r.id)); } catch { /* */ } }
  changed();
}

// ── org policy ────────────────────────────────────────────────────────────────
export async function getOrgTemplatePolicy(orgId: string): Promise<OrgTemplatePolicy> {
  const local = readLocal<Record<string, OrgTemplatePolicy>>(LOCAL_POL, {})[orgId];
  if (cloud()) { try { const s = await getDoc(doc(opsDb, POL, orgId)); if (s.exists()) return { ...defaultPolicy(orgId), ...(s.data() as OrgTemplatePolicy) }; } catch { /* */ } }
  return local ? { ...defaultPolicy(orgId), ...local } : defaultPolicy(orgId);
}

export async function setOrgTemplatePolicy(p: OrgTemplatePolicy): Promise<{ synced: boolean }> {
  const rec = strip({ ...p, updatedBy: auth.currentUser?.uid, updatedAt: Date.now() });
  const all = readLocal<Record<string, OrgTemplatePolicy>>(LOCAL_POL, {}); all[p.orgId] = rec; writeLocal(LOCAL_POL, all);
  let synced = false;
  if (cloud()) { try { await setDoc(doc(opsDb, POL, p.orgId), rec); synced = true; } catch { /* not an admin */ } }
  changed();
  return { synced };
}

export { loremLike, stripOrgContent } from './stripOrgContent';
