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
import type { TelaDoc, TelaDevice, TelaFrame, TelaVectorObject } from '../../types';
import type { Action } from '../living/contracts';
import { TELA_TEMPLATE_GALLERY, type TelaDesignTemplate } from '../tela/telaTemplateRegistry';
import { FLYER_PRESETS, flyerToTelaDoc, type FlyerPreset } from '../announcements/flyerPresets';
import { newTelaId } from '../telaStore';

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

export type OrgShareRole = 'admin' | 'staff' | 'teacher' | 'volunteer' | 'member';
export const ORG_SHARE_ROLES: Array<{ id: OrgShareRole; label: string }> = [
  { id: 'admin', label: 'Admins' }, { id: 'staff', label: 'Staff & leaders' }, { id: 'teacher', label: 'Teachers' },
  { id: 'volunteer', label: 'Volunteers' }, { id: 'member', label: 'Members' },
];

export interface OrgTemplatePolicy {
  orgId: string;
  /** Off by default: nothing leaves the org until an admin allows it. */
  allowPlatformSharing: boolean;
  roles: Record<OrgShareRole, boolean>;
  updatedBy?: string;
  updatedAt?: number;
}
export const defaultPolicy = (orgId: string): OrgTemplatePolicy => ({ orgId, allowPlatformSharing: false, roles: { admin: true, staff: true, teacher: true, volunteer: false, member: false } });

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
  const me = auth.currentUser?.uid || 'local';
  const now = Date.now();
  const record: DocTemplateRecord = strip({
    id: uid('tpl'), tier: 'platform', ownerUid: me, ownerName: o.ownerName, fromOrgId: o.fromOrg?.orgId, stripped: !!o.fromOrg,
    name: o.name.trim() || bundle.title, description: o.description?.trim() || undefined, category: o.category, ...measure(bundle), bundleJson: encodeBundle(bundle), uses: 0, createdAt: now, updatedAt: now,
  });
  return { record, synced: await put(record) };
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

export function sharingBlockedReason(p: OrgTemplatePolicy, role: OrgShareRole): string | null {
  if (!p.allowPlatformSharing) return 'This organization doesn’t allow its documents to be shared as public templates. An admin can turn it on in Content HQ › Template sharing.';
  if (!p.roles[role]) return `This organization doesn’t let ${ORG_SHARE_ROLES.find(r => r.id === role)?.label.toLowerCase() || 'your role'} share its documents as public templates.`;
  return null;
}

// ── stripping ─────────────────────────────────────────────────────────────────
const LOREM = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum'.split(' ');

/** Placeholder Latin shaped like the original: same lines, about the same length, same capitalisation. */
export function loremLike(src: string, seed = 0): string {
  let w = seed % LOREM.length;
  return src.split('\n').map(line => {
    const t = line.trim(); if (!t) return line;
    const words: string[] = []; let len = 0;
    while (len < Math.max(3, t.length - 2)) { const x = LOREM[w++ % LOREM.length]; words.push(x); len += x.length + 1; }
    let out = words.join(' ');
    if (t === t.toUpperCase() && /[A-Z]/.test(t)) out = out.toUpperCase();
    else out = out.charAt(0).toUpperCase() + out.slice(1);
    if (/[.!?]$/.test(t)) out += '.';
    return out;
  }).join('\n');
}

const CONTENT_KEYS = new Set(['text', 'title', 'subtitle', 'prompt', 'question', 'answer', 'correctAnswer', 'caption', 'alt', 'description', 'body', 'content', 'hint', 'summary', 'instructions', 'placeholder', 'credit', 'note', 'notes', 'label', 'value', 'explanation', 'rubric', 'feedback', 'name', 'expected', 'acceptedAnswers', 'teacherNote']);
const DROP_KEYS = new Set(['src', 'url', 'sourceUrl', 'sourceImageSrc', 'storagePath', 'href', 'link', 'ctaUrl', 'textMaskUrl', 'posterSrc', 'story', 'document', 'raster', 'rasterPreview', 'domainBinding', 'assignment', 'answerKey', 'words']);

function scrub(v: any, seed: { n: number }, key?: string): any {
  if (typeof v === 'string') return key && CONTENT_KEYS.has(key) && v.trim() ? loremLike(v, seed.n++) : v;
  if (Array.isArray(v)) return key === 'options' || key === 'choices' ? v.map(x => (typeof x === 'string' ? loremLike(x, seed.n++) : scrub(x, seed))) : v.map(x => scrub(x, seed));
  if (v && typeof v === 'object') {
    const o: any = {};
    for (const [k, x] of Object.entries(v)) {
      if (DROP_KEYS.has(k)) continue;
      if (k === 'values' && x && typeof x === 'object' && !Array.isArray(x)) { o[k] = Object.fromEntries(Object.entries(x as Record<string, unknown>).map(([c, s]) => [c, typeof s === 'string' && s ? loremLike(s, seed.n++) : s])); continue; }
      if (k === 'cells' && x && typeof x === 'object') { o[k] = Object.fromEntries(Object.entries(x as Record<string, string>).map(([c, s]) => [c, typeof s === 'string' && s && !s.startsWith('=') ? loremLike(s, seed.n++).split(' ')[0] : s])); continue; }
      o[k] = scrub(x, seed, k);
    }
    return o;
  }
  return v;
}

function scrubVector(o: TelaVectorObject, seed: { n: number }): TelaVectorObject {
  if (o.kind === 'IMAGE') {
    const { sourceImageSrc: _s, sourceCrop: _c, ...rest } = o as any;
    return { ...rest, kind: 'RECT', fill: '#d9d5e2', opacity: .7, stroke: '#b8b2c6', strokeWidth: 1, objectLabel: 'Image slot', templateRole: 'IMAGE_SLOT', semanticRole: undefined } as TelaVectorObject;
  }
  const keepLabel = o.objectLabel; const keepRole = o.templateRole;
  const out = scrub(o, seed) as TelaVectorObject;
  out.objectLabel = keepLabel; out.templateRole = keepRole; // labels drive behaviours and editing, not content
  return out;
}

/** The design without the org: lorem text, empty image slots, no lesson data, links, media or narration. */
export function stripOrgContent(d: TelaDoc, o: { title: string }): TelaDoc {
  const seed = { n: 0 };
  const devices: Record<string, TelaDevice> = {};
  for (const [id, dev] of Object.entries(d.devices)) {
    if (dev.type === 'VECTOR') devices[id] = { ...dev, name: dev.name ? loremLike(dev.name, seed.n++) : dev.name, objects: dev.objects.map(x => scrubVector(x, seed)) };
    else if (dev.type === 'IMAGE') devices[id] = { ...dev, layers: [], raster: undefined, rasterPreview: undefined, rasterRev: undefined } as TelaDevice;
    else if (dev.type === 'MEDIA') devices[id] = { ...dev, src: '', name: 'Media slot', storagePath: undefined, size: 0 };
    else if (dev.type === 'FIGURE') continue;
    else devices[id] = scrub(dev, seed) as TelaDevice;
  }
  const frames = d.frames.map(f => ({ ...f, label: f.label ? loremLike(f.label, seed.n++) : f.label, deviceIds: f.deviceIds.filter(id => devices[id]) }));
  // Behaviours keep their motion; anything carrying words or links (emit payloads, set text) is cleared, nested branches included.
  const cleanActions = (as?: Action[]): Action[] | undefined => as?.map(a =>
    a.do === 'emit' ? { ...a, payload: undefined }
      : a.do === 'set' && a.props.text !== undefined ? { ...a, props: { ...a.props, text: loremLike(a.props.text, seed.n++) } }
        : a.do === 'if' ? { ...a, then: cleanActions(a.then)!, else: cleanActions(a.else) }
          : a);
  const living = d.living ? { ...d.living, authorNotes: undefined, pages: d.living.pages.map(p => ({ ...p, narration: undefined, a11y: undefined, behaviors: p.behaviors.map(b => ({ ...b, label: undefined, hint: b.hint ? 'Try it' : undefined, do: cleanActions(b.do)!, reduced: cleanActions(b.reduced) })) })) } : undefined;
  const { lesson: _l, publication: _p, issue: _i, assignmentFormat: _a, orgOrigin: _o, ...rest } = d;
  return strip({ ...rest, title: o.title, devices, frames, living, bindings: (d.bindings || []).filter(b => devices[b.sourceDeviceId] && devices[b.targetDeviceId]) });
}
