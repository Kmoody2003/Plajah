// Issue logic — the editorial side of putting out an issue. Pure; tested in tests/publicationIssue.test.ts.
//
//   fromStudentStory / fromArticle   bring approved work from either newsroom into the issue
//   autoFlatplan                     a first page plan: front page, sections in order, jumps, house pages
//   issueReadiness                   what must be true before the issue goes out (student and pro rules)
//   buildIssueTelaDoc                the issue laid out as a Tela document with its print spec attached,
//                                    ready to refine in Tela, preflight, print and publish to Lorea
// Layout is a sensible newspaper/magazine starting point — nameplate, folio, lead story with deck and
// columns, secondary stories with jump lines, inside pages by section, a staff box — not a final design.

import type { TelaBlock, TelaDevice, TelaDoc, TelaFrame, TelaVectorObject } from '../../types';
import type { StudentStory } from '../journalismSchool/studentDesk';
import { defaultSpecFor, productById } from '../print/products';
import type { DocPrintSpec } from '../print/types';
import type { FlatSlot, FlatSlotKind, IssueStory, Periodical, PeriodicalIssue, ReadinessCheck } from './types';
import { STAFF_ROLE_LABEL } from './types';

const SECTION_ORDER = ['News', 'Opinion', 'Features', 'Arts', 'Sports'];
const SECTION_KIND: Record<string, FlatSlotKind> = { News: 'news', Opinion: 'opinion', Features: 'feature', Arts: 'arts', Sports: 'sports' };

export const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

// ── ISSN ─────────────────────────────────────────────────────────────────────
/** Validate an ISSN (NNNN-NNNC) including its mod-11 check digit. */
export function validIssn(issn: string): boolean {
  const m = issn.trim().toUpperCase().match(/^(\d{4})-?(\d{3})([\dX])$/);
  if (!m) return false;
  const digits = (m[1] + m[2]).split('').map(Number);
  const sum = digits.reduce((s, d, i) => s + d * (8 - i), 0);
  const check = (11 - (sum % 11)) % 11;
  return m[3] === (check === 10 ? 'X' : String(check));
}

// ── Sources ──────────────────────────────────────────────────────────────────
export function fromStudentStory(s: StudentStory, section = 'News'): IssueStory {
  const body = [s.lede, s.body].filter(t => t.trim()).join('\n\n');
  return {
    id: `st:${s.id}`, source: 'student', headline: s.headline || s.caption || 'Untitled', dek: s.dek || undefined,
    byline: s.authorName, body: s.counterpoint.trim() ? `${body}\n\n${s.counterpoint}` : body, section,
    // Only an approval recorded from a teacher's account (Academia review) counts for a publication.
    approved: !!s.approval?.byUid, approvedBy: s.approval?.by, aiUsed: !!s.aiUsed,
    corrections: s.corrections.map(c => c.text),
  };
}

/** Minimal shape of a journalist Article (types.ts Article) the issue needs. */
export interface ArticleForIssue { id: string; title: string; subtitle?: string; authorName?: string; bodyText?: string; section?: string; status?: string; coverImage?: string; coverCredit?: string; disclosures?: { aiAssisted?: boolean }; notices?: Array<{ label: string; text: string }> }

export function fromArticle(a: ArticleForIssue): IssueStory {
  return {
    id: `ar:${a.id}`, source: 'article', headline: a.title || 'Untitled', dek: a.subtitle, byline: a.authorName || 'Staff',
    body: a.bodyText || '', section: a.section || 'News', approved: a.status === 'PUBLISHED' || a.status === 'SCHEDULED',
    aiUsed: !!a.disclosures?.aiAssisted, imageUrl: a.coverImage, imageCredit: a.coverCredit,
    corrections: (a.notices || []).filter(n => n.label === 'CORRECTION').map(n => n.text),
  };
}

// ── Flatplan ─────────────────────────────────────────────────────────────────
/** Rough words of body copy a page holds (text only), from its area. */
export const pageWordCapacity = (trimIn: [number, number]) => Math.round(trimIn[0] * trimIn[1] * 6.5);

export function autoFlatplan(stories: IssueStory[], trimIn: [number, number], pageMultiple = 4): FlatSlot[] {
  const ranked = [...stories].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  const front = ranked.slice(0, 3);
  const slots: FlatSlot[] = [{ page: 1, kind: 'front', section: 'Front', storyIds: front.map(s => s.id) }];
  const cap = pageWordCapacity(trimIn);
  // Front-page stories jump inside; everything else flows by section order.
  const order = (s: IssueStory) => { const i = SECTION_ORDER.indexOf(s.section); return i < 0 ? SECTION_ORDER.length : i; };
  const inside = [...front.map(s => ({ s, jump: true })), ...ranked.slice(3).map(s => ({ s, jump: false }))]
    .sort((a, b) => order(a.s) - order(b.s));
  let cur: FlatSlot | null = null; let used = 0;
  for (const { s } of inside) {
    const need = Math.max(150, words(s.body));
    if (!cur || cur.section !== s.section || used + need > cap) {
      cur = { page: slots.length + 1, kind: SECTION_KIND[s.section] || 'feature', section: s.section, storyIds: [] };
      slots.push(cur); used = 0;
    }
    cur.storyIds.push(s.id); used += need;
  }
  // Staff box and corrections policy live on a house page; pad to the press multiple with house pages.
  slots.push({ page: slots.length + 1, kind: 'house', section: 'Staff', storyIds: [], note: 'Staff box, corrections and ethics policy' });
  while (slots.length % pageMultiple !== 0) slots.push({ page: slots.length + 1, kind: 'house', section: 'House', storyIds: [], note: 'House ad: join the staff / tips line' });
  return slots;
}

// ── Readiness ────────────────────────────────────────────────────────────────
export function issueReadiness(pub: Periodical, issue: PeriodicalIssue): ReadinessCheck[] {
  const checks: ReadinessCheck[] = [];
  const add = (id: string, label: string, ok: boolean, level: ReadinessCheck['level'] = 'required', detail?: string) => checks.push({ id, label, ok, level, detail });
  const tier = issue.tier;
  const unapproved = issue.stories.filter(s => !s.approved);
  const placed = new Set(issue.flatplan.flatMap(f => f.storyIds));

  add('masthead', 'Masthead: name, volume, number and date', !!pub.name && issue.volume > 0 && issue.number > 0 && /^\d{4}-\d{2}-\d{2}$/.test(issue.date));
  add('stories', 'At least one story', issue.stories.length > 0);
  add('approved', tier === 'student' ? 'Every story approved by a teacher account' : 'Every story cleared by the publish gate', unapproved.length === 0, 'required', unapproved.length ? `Not yet: ${unapproved.map(s => s.headline).slice(0, 4).join('; ')}` : undefined);
  add('placed', 'Every story is placed in the flatplan', issue.stories.every(s => placed.has(s.id)), 'required');
  add('lead', 'Front page has a lead story', (issue.flatplan.find(f => f.kind === 'front')?.storyIds.length || 0) > 0);
  const product = productById(issue.printSpec?.productId || pub.printProductId || '');
  if (product && product.pageMultiple > 1) add('pages', `Page count is a multiple of ${product.pageMultiple} for print`, issue.flatplan.length % product.pageMultiple === 0);
  add('corrections', 'Corrections policy published', !!pub.correctionsPolicy?.trim(), tier === 'pro' ? 'required' : 'recommended');
  add('ethics', 'Ethics / editorial policy linked', !!pub.ethicsUrl?.trim(), 'recommended');
  add('staffbox', 'Staff box lists the editor-in-chief', !!pub.staff?.some(m => m.role === 'editor-in-chief'), 'recommended');
  if (issue.stories.some(s => s.aiUsed)) add('ai', 'AI-assisted stories carry a disclosure', true, 'recommended', 'Disclosures print with each story automatically.');

  if (tier === 'student') {
    add('adviser', 'Faculty adviser assigned', !!pub.adviserUid);
    add('adviser-approval', 'Adviser approved this issue from their account', !!pub.adviserUid && issue.adviserApproval?.uid === pub.adviserUid);
  } else {
    add('publisher', 'Publisher legal name in the imprint', !!pub.publisherLegalName?.trim());
    add('address', 'Postal address and contact in the imprint', !!pub.postalAddress?.trim() && !!pub.contactEmail?.trim());
    add('copyright', 'Copyright holder named', !!pub.copyrightHolder?.trim(), 'recommended');
    add('issn', pub.issn ? 'ISSN is valid' : 'ISSN (optional: libraries, distributors and postal periodicals use it)', pub.issn ? validIssn(pub.issn) : false, pub.issn ? 'required' : 'recommended');
    add('eic-approval', 'Editor-in-chief signed off the issue', issue.approvals.some(a => a.role === 'editor-in-chief' || a.role === 'publisher'));
  }
  return checks;
}

export const readyToPublish = (checks: ReadinessCheck[]) => checks.every(c => c.ok || c.level === 'recommended');

// ── Layout ───────────────────────────────────────────────────────────────────
const esc = (t: string) => t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
const paras = (t: string) => t.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
const excerpt = (t: string, n: number) => { const w = t.trim().split(/\s+/); return w.length <= n ? t.trim() : `${w.slice(0, n).join(' ')}…`; };

function text(id: string, x: number, y: number, w: number, h: number, value: string, o: Partial<TelaVectorObject> = {}): TelaVectorObject {
  return { id, kind: 'TEXT', x, y, w, h, text: value, fontSize: 12, fontFamily: 'Source Serif 4', fontWeight: 400, fill: '#111111', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, wrap: true, lineHeight: 1.3, textAlign: 'left', ...o };
}
const rule = (id: string, x: number, y: number, w: number, h = 2): TelaVectorObject => ({ id, kind: 'RECT', x, y, w, h, fill: '#111111', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, templateRole: 'RULE' });

export function formatIssueDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

/** Staff box + imprint + policies, as writer blocks. */
export function staffBoxBlocks(pub: Periodical, issue: PeriodicalIssue): TelaBlock[] {
  const b: TelaBlock[] = [{ id: 'staff:h', kind: 'h2', text: esc(pub.name) }];
  for (const m of pub.staff || []) b.push({ id: `staff:${m.role}:${m.name}`, kind: 'p', text: `<strong>${esc(STAFF_ROLE_LABEL[m.role])}${m.section ? ` (${esc(m.section)})` : ''}:</strong> ${esc(m.name)}` });
  if (pub.adviserName) b.push({ id: 'staff:adviser', kind: 'p', text: `<strong>Faculty adviser:</strong> ${esc(pub.adviserName)}` });
  const imprint = [pub.publisherLegalName && `Published by ${pub.publisherLegalName}`, pub.schoolName, pub.postalAddress, pub.contactEmail, pub.issn && `ISSN ${pub.issn}`].filter(Boolean) as string[];
  if (imprint.length) b.push({ id: 'staff:imprint', kind: 'p', text: esc(imprint.join(' · ')) });
  b.push({ id: 'staff:issue', kind: 'p', text: esc(`Volume ${issue.volume}, Number ${issue.number} · ${formatIssueDate(issue.date)}`) });
  if (pub.correctionsPolicy) b.push({ id: 'staff:corr', kind: 'p', text: `<strong>Corrections:</strong> ${esc(pub.correctionsPolicy)}` });
  if (pub.ethicsUrl) b.push({ id: 'staff:ethics', kind: 'p', text: `<strong>Ethics policy:</strong> ${esc(pub.ethicsUrl)}` });
  if (pub.copyrightHolder) b.push({ id: 'staff:copy', kind: 'p', text: esc(`© ${issue.date.slice(0, 4)} ${pub.copyrightHolder}. All rights reserved.`) });
  return b;
}

/** Lay out the issue as a Tela document (one PAPER frame per flatplan page) with its print spec. */
export function buildIssueTelaDoc(pub: Periodical, issue: PeriodicalIssue, opts: { ownerId: string; now?: number } ): TelaDoc {
  const now = opts.now ?? Date.now();
  const spec: DocPrintSpec = issue.printSpec || defaultSpecFor(pub.printProductId || (issue.kind === 'magazine' ? 'magazine-letter-saddle' : 'newspaper-tabloid'));
  const W = Math.round(spec.trimIn[0] * 96), H = Math.round(spec.trimIn[1] * 96), M = Math.round(Math.max(spec.safeIn, 0.375) * 96);
  const docId = `issue:${issue.id}`;
  const byId = new Map(issue.stories.map(s => [s.id, s]));
  const jumpPage = new Map<string, number>();
  for (const slot of issue.flatplan) if (slot.kind !== 'front') for (const id of slot.storyIds) if (!jumpPage.has(id)) jumpPage.set(id, slot.page);

  const frames: TelaFrame[] = []; const devices: Record<string, TelaDevice> = {};
  issue.flatplan.forEach((slot, i) => {
    const fid = `${docId}:p${slot.page}`, did = `${docId}:d${slot.page}`;
    frames.push({ id: fid, kind: 'PAPER', preset: 'FREE', x: (i % 2) * (W + 48), y: Math.floor(i / 2) * (H + 72), w: W, h: H, deviceIds: [did], label: `${slot.page} · ${slot.section}`, orientation: W > H ? 'LANDSCAPE' : 'PORTRAIT' });

    if (slot.kind === 'front') {
      const objs: TelaVectorObject[] = [];
      const inner = W - 2 * M;
      const folio = [`Vol. ${issue.volume} · No. ${issue.number}`, formatIssueDate(issue.date), pub.schoolName || pub.tagline || ''].filter(Boolean).join('   ·   ');
      objs.push(text('folio', M, M, inner, 18, folio.toUpperCase(), { fontFamily: 'Inter', fontSize: 9, fontWeight: 700, letterSpacing: 0.12, textAlign: 'center', templateRole: 'FOLIO' }));
      const nameSize = Math.min(Math.round(H * 0.07), Math.round(inner / Math.max(6, pub.name.length * 0.56)));
      objs.push(text('nameplate', M, M + 22, inner, nameSize * 1.15, pub.name, { fontFamily: 'Playfair Display', fontSize: nameSize, fontWeight: 900, textAlign: 'center', lineHeight: 1, wrap: false, templateRole: 'LOGO' }));
      let y = M + 22 + nameSize * 1.15 + 6;
      objs.push(rule('rule1', M, y, inner, 3)); y += 8;
      if (issue.coverLine || pub.tagline) { objs.push(text('tagline', M, y, inner, 18, issue.coverLine || pub.tagline || '', { fontStyle: 'italic', fontSize: 12, textAlign: 'center' })); y += 22; }
      objs.push(rule('rule2', M, y, inner, 1)); y += 18;
      const [lead, ...rest] = slot.storyIds.map(id => byId.get(id)).filter((s): s is IssueStory => !!s);
      if (lead) {
        objs.push(text('lead:h', M, y, inner, 120, lead.headline, { fontFamily: 'Playfair Display', fontSize: Math.round(W / 22), fontWeight: 800, lineHeight: 1.05, templateRole: 'HEADLINE' }));
        y += Math.round(W / 22) * 2.4;
        if (lead.dek) { objs.push(text('lead:dek', M, y, inner, 44, lead.dek, { fontStyle: 'italic', fontSize: 16, templateRole: 'DECK' })); y += 48; }
        objs.push(text('lead:by', M, y, inner, 16, `By ${lead.byline}`.toUpperCase(), { fontFamily: 'Inter', fontSize: 9, fontWeight: 700, letterSpacing: 0.1, templateRole: 'BYLINE' })); y += 22;
        const leadH = Math.round(H * (rest.length ? 0.36 : 0.62));
        const jp = jumpPage.get(lead.id);
        objs.push(text('lead:body', M, y, inner, leadH, `${excerpt(lead.body, rest.length ? 260 : 600)}${jp ? `\n\nContinued on page ${jp}` : ''}`, { fontSize: 11, lineHeight: 1.38, columns: W > 700 ? 3 : 2, templateRole: 'BODY' }));
        y += leadH + 14;
      }
      if (rest.length) {
        objs.push(rule('rule3', M, y, inner, 1)); y += 14;
        const colW = (inner - (rest.length - 1) * 18) / rest.length;
        rest.forEach((s, k) => {
          const x = M + k * (colW + 18);
          const jp = jumpPage.get(s.id);
          objs.push(text(`s${k}:h`, x, y, colW, 70, s.headline, { fontFamily: 'Playfair Display', fontSize: 20, fontWeight: 700, lineHeight: 1.1, templateRole: 'HEADLINE' }));
          objs.push(text(`s${k}:by`, x, y + 76, colW, 14, `By ${s.byline}`.toUpperCase(), { fontFamily: 'Inter', fontSize: 8, fontWeight: 700, letterSpacing: 0.1, templateRole: 'BYLINE' }));
          objs.push(text(`s${k}:b`, x, y + 96, colW, Math.max(80, H - M - (y + 96)), `${excerpt(s.body, 90)}${jp ? `\n\nContinued on page ${jp}` : ''}`, { fontSize: 10.5, lineHeight: 1.35, templateRole: 'BODY' }));
        });
      }
      devices[did] = { id: did, type: 'VECTOR', name: 'Front page', width: W, height: H, objects: objs } as TelaDevice;
      return;
    }

    const blocks: TelaBlock[] = [{ id: `${fid}:sec`, kind: 'h1', text: esc(slot.section) }];
    for (const id of slot.storyIds) {
      const s = byId.get(id); if (!s) continue;
      const fromFront = issue.flatplan[0]?.storyIds.includes(id);
      blocks.push({ id: `${id}:h`, kind: 'h2', text: esc(s.headline) });
      if (s.dek) blocks.push({ id: `${id}:dek`, kind: 'p', text: `<em>${esc(s.dek)}</em>` });
      blocks.push({ id: `${id}:by`, kind: 'p', text: `<strong>By ${esc(s.byline)}</strong>${fromFront ? ' · <em>continued from page 1</em>' : ''}` });
      paras(s.body).forEach((p, n) => blocks.push({ id: `${id}:p${n}`, kind: 'p', text: esc(p) }));
      for (const c of s.corrections || []) blocks.push({ id: `${id}:c${blocks.length}`, kind: 'p', text: `<em>Correction: ${esc(c)}</em>` });
      if (s.aiUsed) blocks.push({ id: `${id}:ai`, kind: 'p', text: '<em>AI tools assisted with this story; a human reporter checked every fact.</em>' });
    }
    if (slot.kind === 'house') {
      if (slot.section === 'Staff') blocks.splice(0, 1, ...staffBoxBlocks(pub, issue));
      else blocks.push({ id: `${fid}:house`, kind: 'p', text: esc(pub.tier === 'student' ? `Write for ${pub.name}. Reporters, photographers, designers and copy editors wanted — talk to the editors or your adviser.` : `Got a tip? Contact ${pub.contactEmail || 'the newsroom'}.`) });
    }
    devices[did] = { id: did, type: 'WRITER', mode: 'DOCUMENT', blocks } as TelaDevice;
  });

  return {
    id: docId, ownerId: opts.ownerId, title: `${pub.name} — Vol. ${issue.volume}, No. ${issue.number}`, frames, devices,
    print: { ...spec, pageFrameIds: frames.map(f => f.id) },
    issue: { publicationId: pub.id, issueId: issue.id, volume: issue.volume, number: issue.number, date: issue.date },
    createdAt: now, updatedAt: now,
  };
}

export function newIssue(pub: Periodical, ownerId: string, prev?: Pick<PeriodicalIssue, 'volume' | 'number'> | null, now = Date.now()): PeriodicalIssue {
  const spec = defaultSpecFor(pub.printProductId || (pub.kind === 'magazine' ? 'magazine-letter-saddle' : 'newspaper-tabloid'));
  return {
    id: `iss_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`, ownerId, publicationId: pub.id, publicationName: pub.name,
    tier: pub.tier || 'pro', kind: pub.kind || 'newspaper', volume: prev?.volume || 1, number: (prev?.number || 0) + 1,
    date: new Date(now).toISOString().slice(0, 10), status: 'planning', stories: [], flatplan: [], printSpec: spec,
    approvals: [], adviserUid: pub.adviserUid, adviserApproval: null, staffUids: [...new Set([ownerId, ...(pub.staff || []).map(m => m.uid).filter((u): u is string => !!u)])],
    isPublic: true, createdAt: now, updatedAt: now,
  };
}
