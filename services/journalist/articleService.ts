// Article engine service: publishes articles as Tela documents, issues corrections, archives,
// and resolves what the reader's ArticleView should render. Client-side (Firebase + Tela store).
//
// Storage model (important, because Tela bundles are local-first):
//   - The AUTHOR's working Tela doc lives on their device (telaStore: OPFS/localStorage) so they
//     can open it in Tela and tune the layout.
//   - Every PUBLISH freezes a version (telaStore.publishTelaVersion) AND copies that bundle to
//     Firestore at  articles/{articleId}/versions/{versionId}  as `bundleJson`, because readers on
//     other devices cannot reach the author's OPFS. Version docs are write-once.
//   - ArticleView renders the Firestore bundle through TelaEmbed's read-only `snapshot` mode.
//     "follow-latest" = the article's current tela.versionId; "pinned/archived" = tela.pinnedVersionId.
//   - Embeds that point at the author's own docId (same device) keep using telaStore directly.

import { collection, doc as fsDoc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { auth, db, createArticle, updateArticle, postToFeed } from '../backendService';
import { loadTelaDoc, publishTelaVersion, saveTelaDoc } from '../telaStore';
import type { Article, ArticleBlock, TelaDoc } from '../../types';
import {
  buildArticleTelaDoc, legacyArticleSnapshot, templatesForKind, articlePlainText, articleBodyHtml, wordCount, readMinutes, telaDocPlainText,
  type TemplateLike, type ArticleTemplateKind,
} from './articleTela';
import { appendNotice, classifyEdit } from './correctionLog';
import { evaluatePublishGate, type GateResult } from './publishGate';
import { isEmbargoed, effectiveStatus } from './embargo';
import type { ArticleDisclosures, ArticleNotice, Claim, ImageRights, NoticeLabel } from './types';

export const MAX_BUNDLE_BYTES = 900_000; // Firestore doc limit is 1 MiB; leave headroom

/** Readers can see this article right now (legacy block articles count: a missing status means published). */
export const isLiveArticle = (a?: Pick<Article, 'isPublic' | 'status' | 'embargoUntil'> | null): boolean =>
  !!a && a.isPublic !== false && a.status !== 'DRAFT' && !isEmbargoed(a);

export const EMPTY_DISCLOSURES: ArticleDisclosures = { aiAssisted: false, sponsored: false, affiliateLinks: false, conflictOfInterest: false };

const removeUndef = (o: Record<string, any>): Record<string, any> => {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out;
};

// ── templates (feature-detected) ──────────────────────────────────────────────

export interface ArticleTemplateCatalog { ARTICLE: TemplateLike[]; MAGAZINE: TemplateLike[]; CATALOG: TemplateLike[] }

/**
 * Reads the Tela gallery lazily and returns whatever ARTICLE / MAGAZINE / CATALOG templates exist
 * RIGHT NOW. Until the template workstream lands them, ARTICLE and CATALOG are empty and the UI
 * falls back to the built-in masthead.
 */
export async function loadArticleTemplates(): Promise<ArticleTemplateCatalog> {
  try {
    const { TELA_TEMPLATE_GALLERY } = await import('../tela/telaTemplateRegistry');
    const g = TELA_TEMPLATE_GALLERY as unknown as TemplateLike[];
    const kinds: ArticleTemplateKind[] = ['ARTICLE', 'MAGAZINE', 'CATALOG'];
    return Object.fromEntries(kinds.map(k => [k, templatesForKind(g, k)])) as unknown as ArticleTemplateCatalog;
  } catch (e) {
    console.warn('[articleService] template registry unavailable', e);
    return { ARTICLE: [], MAGAZINE: [], CATALOG: [] };
  }
}

export async function findTemplateById(id?: string): Promise<TemplateLike | null> {
  if (!id) return null;
  try {
    const { findTemplate } = await import('../tela/telaTemplateRegistry');
    return (findTemplate(id) as unknown as TemplateLike) || null;
  } catch { return null; }
}

// ── publish ───────────────────────────────────────────────────────────────────

export interface PublishInput {
  articleId?: string;
  title: string; subtitle?: string; coverImage?: string; category?: string; tags?: string[];
  blocks: ArticleBlock[];
  templateId?: string;
  disclosures: ArticleDisclosures;
  rights: ImageRights[];
  claims: Claim[];
  embargoUntil?: number;
  /** Creator's choice for the release-time announcement (feed post + follower notice). Default: announce, platform wording. */
  releaseAnnouncement?: { enabled?: boolean; message?: string };
  publicationId?: string; section?: string;
  access?: 'FREE' | 'SUBSCRIBERS' | 'PAID';
  aiUsedInEditor?: boolean;
  /** 'blocks' rebuilds the Tela doc from the block editor; 'tela' publishes the author's hand-tuned doc as is. */
  source?: 'blocks' | 'tela';
  /** For a notice that goes out with this publish (required when re-publishing changed text). */
  notice?: { label: NoticeLabel; text: string };
}

export interface PublishResult { ok: boolean; articleId?: string; versionId?: string; status?: Article['status']; gate: GateResult; error?: string }

export async function publishArticle(input: PublishInput, existing?: Article | null): Promise<PublishResult> {
  const user = auth.currentUser;
  const emptyGate: GateResult = { canPublish: false, action: 'PUBLISH', blockers: [], warnings: [] };
  if (!user) return { ok: false, gate: { ...emptyGate, blockers: ['Sign in to publish.'] }, error: 'not signed in' };

  const source = input.source || 'blocks';
  const articleId = input.articleId || existing?.id;
  const docId = existing?.tela?.docId || `article:${articleId || `new_${Date.now().toString(36)}`}`;
  const template = await findTemplateById(input.templateId || existing?.tela?.templateId);

  // 1. Build / load the Tela doc and derive the plain body from whichever side is the source of truth.
  let telaDoc: TelaDoc;
  let blocksForText: ArticleBlock[] = input.blocks;
  let bodyText: string; let bodyHtml: string;
  if (source === 'tela') {
    const live = await loadTelaDoc(docId);
    if (!live) return { ok: false, gate: { ...emptyGate, blockers: ['The Tela document for this article was not found on this device.'] }, error: 'tela doc missing' };
    telaDoc = live; bodyText = telaDocPlainText(live);
    bodyHtml = bodyText.split(/\n{2,}/).map(p => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`).join('\n');
  } else {
    telaDoc = buildArticleTelaDoc({
      id: articleId, title: input.title, subtitle: input.subtitle, authorName: user.displayName || 'Author', category: input.category,
      coverImage: input.coverImage, blocks: input.blocks, timestamp: existing?.publishedAt || (typeof existing?.timestamp === 'number' ? existing.timestamp : Date.now()),
    }, { docId, ownerId: user.uid, template });
    bodyText = articlePlainText(input.blocks); bodyHtml = articleBodyHtml(input.blocks);
  }

  // 2. Notices: an already-published article cannot change text silently.
  const prior: ArticleNotice[] = (existing?.notices as ArticleNotice[] | undefined) || [];
  const wasPublished = isLiveArticle(existing);
  let notices = prior;
  const publishedText = existing ? (existing.bodyText ?? articlePlainText(existing.blocks || [])) : undefined;
  const changed = wasPublished && publishedText !== undefined && classifyEdit(publishedText, bodyText).changed;
  if (input.notice && (changed || input.notice.label === 'EDITORS_NOTE')) {
    try { notices = appendNotice(prior, { ...input.notice, byUid: user.uid, byName: user.displayName || 'Editor' }); }
    catch (e) { return { ok: false, gate: { ...emptyGate, blockers: [(e as Error).message] }, error: (e as Error).message }; }
  }

  // 3. Gate.
  const imageRefs = [
    ...(input.coverImage ? ['cover'] : []),
    ...input.blocks.filter(b => b.type === 'IMAGE' && b.content).map(b => b.id),
  ];
  const gate = evaluatePublishGate({
    title: input.title, bodyText, imageRefs, rights: input.rights, disclosures: input.disclosures, aiUsedInEditor: input.aiUsedInEditor,
    claims: input.claims, embargoUntil: input.embargoUntil,
    ...(wasPublished ? { publishedText, priorNotices: prior, nextNotices: notices } : {}),
  });
  if (!gate.canPublish) return { ok: false, gate, error: gate.blockers[0] };

  // 4. Freeze a Tela version (local) and size-check the bundle we will copy to Firestore.
  const label = input.notice ? NOTICE_VERSION_LABEL[input.notice.label] : wasPublished ? 'Republished' : 'First publication';
  const { ok: vOk, version } = await publishTelaVersion({ ...telaDoc, title: input.title, updatedAt: Date.now() }, label);
  if (!vOk) return { ok: false, gate, error: 'Could not store the Tela version on this device.' };
  const bundleJson = JSON.stringify(version.bundle);
  if (bundleJson.length > MAX_BUNDLE_BYTES) return { ok: false, gate: { ...gate, canPublish: false, blockers: ['This article is too large to publish (embedded images?). Use uploaded image links instead of pasted image data.'] }, error: 'bundle too large' };

  // The notice records which version it created and which it replaced. Stamped in memory BEFORE the single
  // write, because the correction log is append-only (rules reject any later rewrite of an existing entry).
  if (notices.length > prior.length) {
    const last = notices[notices.length - 1];
    notices = notices.map(n => (n.id === last.id ? (removeUndef({ ...n, versionId: version.versionId, previousVersionId: existing?.tela?.versionId }) as ArticleNotice) : n));
  }

  // 5. Write the article doc, then the immutable version doc.
  const now = Date.now();
  const scheduled = gate.action === 'SCHEDULE';
  const status: Article['status'] = scheduled ? 'SCHEDULED' : notices.some(n => n.label === 'RETRACTION') ? 'RETRACTED' : 'PUBLISHED';
  const fields = removeUndef({
    title: input.title, subtitle: input.subtitle || '', coverImage: input.coverImage || '', category: input.category || 'Article', tags: input.tags || [],
    blocks: input.blocks, bodyText, bodyHtml, wordCount: wordCount(bodyText), readTime: readMinutes(wordCount(bodyText)),
    tela: removeUndef({ docId, versionId: version.versionId, templateId: input.templateId || existing?.tela?.templateId, mode: existing?.tela?.mode === 'archived' ? 'archived' : 'live', pinnedVersionId: existing?.tela?.pinnedVersionId }),
    draft: null, status, isPublic: true, publishedAt: existing?.publishedAt || (wasPublished && typeof existing?.timestamp === 'number' ? existing.timestamp : undefined) || (scheduled ? input.embargoUntil : now),
    notices, disclosures: input.disclosures, imageRights: input.rights, embargoUntil: input.embargoUntil, releaseAnnouncement: scheduled ? input.releaseAnnouncement : undefined, publicationId: input.publicationId, section: input.section, access: input.access || 'FREE',
  });

  let id = articleId;
  try {
    if (id) {
      await updateArticle(id, fields as Partial<Article>);
      // A draft going public for the first time announces itself the way createArticle does for direct publishes.
      if (!wasPublished && !scheduled) {
        await postToFeed({ authorId: user.uid, authorName: user.displayName || 'Author', authorPhoto: user.photoURL || '', type: 'NEWS', content: `Just published a new article: ${input.title}`, imageUrl: input.coverImage, url: id, shareCount: 0 } as any).catch(() => undefined);
      }
    } else id = await createArticle(fields as Partial<Article>);
    if (!id) return { ok: false, gate, error: 'The article could not be saved.' };
    await setDoc(fsDoc(db, 'articles', id, 'versions', version.versionId), removeUndef({
      versionId: version.versionId, articleId: id, authorId: user.uid, createdAt: now, label, bundleJson,
      noticeId: input.notice && notices.length > prior.length ? notices[notices.length - 1].id : undefined, previousVersionId: existing?.tela?.versionId,
    }));
    await saveTelaDoc({ ...version.bundle, id: docId });
  } catch (e) {
    return { ok: false, gate, error: e instanceof Error ? e.message : 'Publish failed.' };
  }
  return { ok: true, articleId: id, versionId: version.versionId, status, gate };
}

const NOTICE_VERSION_LABEL: Record<NoticeLabel, string> = {
  CORRECTION: 'Correction', CLARIFICATION: 'Clarification', UPDATE: 'Update', EDITORS_NOTE: "Editor's note", RETRACTION: 'Retraction',
};

/** Note-only notice (e.g. an editor's note) that does not touch the text. */
export async function addNoticeOnly(article: Article, label: NoticeLabel, text: string): Promise<{ ok: boolean; error?: string }> {
  const user = auth.currentUser;
  if (!user) return { ok: false, error: 'Sign in first.' };
  try {
    const next = appendNotice((article.notices as ArticleNotice[]) || [], { label, text, byUid: user.uid, byName: user.displayName || 'Editor' });
    await updateArticle(article.id, { notices: next as Article['notices'], ...(label === 'RETRACTION' ? { status: 'RETRACTED' as const } : {}) });
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Could not add the notice.' }; }
}

/** Pin the article to its current version: it stops following new versions (archive state). */
export async function archiveArticle(article: Article): Promise<void> {
  if (!article.tela) return;
  await updateArticle(article.id, { tela: removeUndef({ ...article.tela, mode: 'archived', pinnedVersionId: article.tela.versionId }) as Article['tela'] });
}

// ── drafts ────────────────────────────────────────────────────────────────────

export interface DraftInput { title: string; subtitle?: string; coverImage?: string; category?: string; tags?: string[]; blocks: ArticleBlock[] }

/**
 * Save work in progress WITHOUT publishing. An article that already has a frozen Tela version
 * (published or scheduled) keeps its live fields untouched and stores edits in `draft`, so a save
 * can never change what readers see and can never skip the correction-notice rule.
 */
export async function saveDraft(input: DraftInput, existing?: Article | null): Promise<{ ok: boolean; articleId?: string; error?: string }> {
  if (!auth.currentUser) return { ok: false, error: 'Sign in to save.' };
  try {
    if (existing?.tela?.versionId || isLiveArticle(existing)) {
      await updateArticle(existing!.id, { draft: removeUndef({ ...input, savedAt: Date.now() }) as Article['draft'] });
      return { ok: true, articleId: existing.id };
    }
    const fields = removeUndef({ ...input, category: input.category || 'Article', isPublic: false, status: 'DRAFT' as const });
    if (existing?.id) { await updateArticle(existing.id, fields as Partial<Article>); return { ok: true, articleId: existing.id }; }
    const id = await createArticle(fields as Partial<Article>);
    return id ? { ok: true, articleId: id } : { ok: false, error: 'The draft could not be saved.' };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Save failed.' }; }
}

/** What the editor should open with: the unpublished working copy if there is one. */
export function workingCopy(a: Article): DraftInput {
  const d = a.draft;
  return d ? { title: d.title, subtitle: d.subtitle, coverImage: d.coverImage, category: d.category, tags: d.tags, blocks: d.blocks }
           : { title: a.title, subtitle: a.subtitle, coverImage: a.coverImage, category: a.category, tags: a.tags, blocks: a.blocks };
}

// ── reading ───────────────────────────────────────────────────────────────────

export async function fetchVersionBundle(articleId: string, versionId: string): Promise<TelaDoc | null> {
  try {
    const s = await getDoc(fsDoc(db, 'articles', articleId, 'versions', versionId));
    if (!s.exists()) return null;
    const json = s.data().bundleJson;
    return typeof json === 'string' ? (JSON.parse(json) as TelaDoc) : null;
  } catch (e) { console.warn('[articleService] version fetch failed', e); return null; }
}

export interface ResolvedArticleDoc { doc: TelaDoc; versionId: string | null; legacy: boolean; pinned: boolean }

/** What ArticleView renders: archived -> pinned version; live -> newest version; legacy -> bridge snapshot. */
export async function resolveArticleDoc(article: Article, versionOverride?: string): Promise<ResolvedArticleDoc> {
  const t = article.tela;
  if (t) {
    const vid = versionOverride || (t.mode === 'archived' ? t.pinnedVersionId || t.versionId : t.versionId);
    const doc = await fetchVersionBundle(article.id, vid);
    if (doc) return { doc, versionId: vid, legacy: false, pinned: !!versionOverride || t.mode === 'archived' };
  }
  return { doc: legacyArticleSnapshot({ ...article, authorName: article.authorName, timestamp: typeof article.timestamp === 'number' ? article.timestamp : Date.now() } as any), versionId: null, legacy: true, pinned: false };
}

// ── lists (Creator Hub, Writers Desk) ─────────────────────────────────────────

export interface MyArticleRow { id: string; title: string; status: NonNullable<Article['status']>; updatedAt: number; legacy: boolean; notices: number; embargoUntil?: number }

export async function listMyArticles(uid: string): Promise<MyArticleRow[]> {
  const snap = await getDocs(query(collection(db, 'articles'), where('authorId', '==', uid)));
  const ms = (v: any) => (typeof v === 'number' ? v : v?.toMillis?.() ?? 0);
  return snap.docs.map(d => {
    const a = d.data() as any;
    return {
      id: d.id, title: a.title || 'Untitled', status: effectiveStatus({ ...a, status: a.status || (a.isPublic === false ? 'DRAFT' : 'PUBLISHED') }) as MyArticleRow['status'],
      updatedAt: ms(a.modifiedAt) || ms(a.timestamp), legacy: !a.tela, notices: Array.isArray(a.notices) ? a.notices.length : 0, embargoUntil: a.embargoUntil,
    };
  }).sort((a, b) => b.updatedAt - a.updatedAt);
}



/** Build the article's Tela doc, store it on this device and return its id, so the author can open it in Tela. */
export async function prepareTelaDoc(input: DraftInput, existing: Article | null | undefined, templateId?: string): Promise<string> {
  const user = auth.currentUser;
  const docId = existing?.tela?.docId || `article:${existing?.id || `draft_${Date.now().toString(36)}`}`;
  const template = await findTemplateById(templateId || existing?.tela?.templateId);
  const doc = buildArticleTelaDoc({
    id: existing?.id, title: input.title, subtitle: input.subtitle, authorName: user?.displayName || 'Author', category: input.category,
    coverImage: input.coverImage, blocks: input.blocks, timestamp: Date.now(),
  }, { docId, ownerId: user?.uid || '', template });
  await saveTelaDoc(doc);
  return docId;
}
