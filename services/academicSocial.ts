// ─── Academic social layer ────────────────────────────────────────────────────
// Lets any item across the academic experiences (artifacts, figures, styles,
// sites, civilizations, eras…) be saved to the user's research notebook, added to
// their interests, shared to the Plajah social timeline, and shared out to
// external networks (X, Facebook, WhatsApp, LinkedIn, Reddit) or the native sheet.
// One normalized shape (AcademicAsset) powers the shared <AssetActions> control.

import { db, auth } from './firebase';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { createPost } from './backendService';
import { shareOrigin } from './deepLinkService';
import { putEntry as syncNotebookEntry } from './notebookService';

export interface AcademicAsset {
  kind: string;            // 'artifact' | 'figure' | 'style' | 'site' | 'civilization' | 'era'
  title: string;
  subtitle?: string;       // role/era/culture line
  description?: string;
  imageUrl?: string;
  model3dUrl?: string;     // interactive 3D scan (embeds as a live viewer in the post)
  sourceUrl?: string;      // canonical external page (museum / Wikipedia)
  discipline?: string;     // 'Archaeology' | 'World History' | 'Architecture' | 'Cinema' | 'Music' …
  interests?: string[];    // extra interest topics; defaults derive from discipline + title
}

// Prefilled, editable post body for the Universal Post Composer share flow.
export function academicPrefillText(asset: AcademicAsset): string {
  const tagline = asset.discipline ? `#${asset.discipline.replace(/\s+/g, '')}` : '';
  return [
    asset.subtitle ? `${asset.title} — ${asset.subtitle}` : asset.title,
    asset.description || '',
    asset.sourceUrl || '',
    tagline,
  ].filter(Boolean).join('\n\n');
}

// Media the composer embeds: the interactive 3D viewer when a scan exists,
// otherwise the artifact image. Empty when the asset has neither.
export function academicPrefillAttachments(
  asset: AcademicAsset
): Array<{ type: 'MODEL3D' | 'PHOTO'; url: string; title?: string; thumbnail?: string }> {
  if (asset.model3dUrl) {
    return [{ type: 'MODEL3D', url: asset.model3dUrl, title: asset.title, thumbnail: asset.imageUrl }];
  }
  if (asset.imageUrl) {
    return [{ type: 'PHOTO', url: asset.imageUrl, title: asset.title }];
  }
  return [];
}

function shortId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── Notebook (localStorage — same store as the Labs research notebook) ─────────
export function saveToNotebook(asset: AcademicAsset): boolean {
  try {
    const uid = auth.currentUser?.uid ?? 'guest';
    const key = `labsNotebook_${uid}`;
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    const now = Date.now();
    const entry = {
      id: shortId(),
      type: 'LINK',
      title: asset.title,
      content: [asset.subtitle, asset.description].filter(Boolean).join('\n\n'),
      tags: [asset.discipline, asset.kind].filter(Boolean) as string[],
      bookmarkSource: { url: asset.sourceUrl || '', thumbnail: asset.imageUrl || '', name: asset.title },
      createdAt: now,
      updatedAt: now,
    };
    localStorage.setItem(key, JSON.stringify([entry, ...existing].slice(0, 500)));
    // Sync to the account so saved items follow the user across devices.
    void syncNotebookEntry(key, entry);
    return true;
  } catch { return false; }
}

// ── Interests (profile) ────────────────────────────────────────────────────────
export function interestTopics(asset: AcademicAsset): string[] {
  const t = new Set<string>();
  (asset.interests || []).forEach(x => x && t.add(x));
  if (asset.discipline) t.add(asset.discipline);
  if (asset.title) t.add(asset.title);
  return [...t].slice(0, 6);
}

export async function addToInterests(asset: AcademicAsset): Promise<'added' | 'signin' | 'failed'> {
  const u = auth.currentUser;
  if (!u || u.isAnonymous) return 'signin';
  try {
    await updateDoc(doc(db, 'users', u.uid), { interests: arrayUnion(...interestTopics(asset)) });
    return 'added';
  } catch { return 'failed'; }
}

// ── Share to the Plajah social timeline ────────────────────────────────────────
export async function shareToPlajah(asset: AcademicAsset): Promise<'posted' | 'signin' | 'failed'> {
  const u = auth.currentUser;
  if (!u) return 'signin';
  try {
    const tagline = asset.discipline ? `#${asset.discipline.replace(/\s+/g, '')}` : '';
    const text = [
      asset.subtitle ? `${asset.title} — ${asset.subtitle}` : asset.title,
      asset.description || '',
      asset.sourceUrl || '',
      tagline,
    ].filter(Boolean).join('\n\n');
    await createPost({
      text,
      isPublic: true,
      tags: [asset.discipline, asset.kind].filter(Boolean) as string[],
      ...(asset.imageUrl ? { media: [{ type: 'PHOTO', url: asset.imageUrl, title: asset.title }] } : {}),
    } as any);
    return 'posted';
  } catch { return 'failed'; }
}

// ── External networks ──────────────────────────────────────────────────────────
export interface ShareTarget { id: string; label: string; url: string; }

function shareText(asset: AcademicAsset): string {
  return [asset.subtitle ? `${asset.title} — ${asset.subtitle}` : asset.title, 'via Plajah'].join(' · ');
}

/** Intent URLs for the common networks. `url` is the item's own source page
 *  (a rich museum/Wikipedia page) or the Plajah app if none. */
export function externalShareTargets(asset: AcademicAsset): ShareTarget[] {
  const url = asset.sourceUrl || shareOrigin();
  const text = shareText(asset);
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(text);
  return [
    { id: 'x',        label: 'X / Twitter', url: `https://twitter.com/intent/tweet?text=${t}&url=${u}` },
    { id: 'facebook', label: 'Facebook',    url: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { id: 'whatsapp', label: 'WhatsApp',    url: `https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}` },
    { id: 'linkedin', label: 'LinkedIn',    url: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
    { id: 'reddit',   label: 'Reddit',      url: `https://www.reddit.com/submit?url=${u}&title=${t}` },
  ];
}

export function openExternalShare(target: ShareTarget): void {
  try { window.open(target.url, '_blank', 'noopener,noreferrer'); } catch { /* popup blocked */ }
}

/** Native share sheet with clipboard fallback. */
export async function nativeShareOrCopy(asset: AcademicAsset): Promise<'shared' | 'copied' | 'failed'> {
  const url = asset.sourceUrl || shareOrigin();
  const nav = navigator as any;
  if (nav.share) {
    try { await nav.share({ title: asset.title, text: shareText(asset), url }); return 'shared'; }
    catch (e: any) { if (e?.name === 'AbortError') return 'failed'; }
  }
  try { await navigator.clipboard.writeText(`${shareText(asset)} ${url}`); return 'copied'; }
  catch { return 'failed'; }
}
