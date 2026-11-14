// generatedGallery — one home for everything a generator makes.
//
// Generated images and clips used to exist only where they were made: in a Fabula project's media
// pool. That makes every tool its own island. This puts them where the rest of a creator's files
// already live — Content HQ's asset manager (services/orgAssets) — under a `Generated / <production>`
// folder, each file carrying its provenance: which model, which production and shot, which attempt,
// what review said. Content HQ is the single source of truth; every other surface is a VIEW of it.
//
// A `GalleryStore` is that view's engine. There is one per owner scope, shared by every UI on the
// page: the Generate panel shows the takes for the shot in front of you, Fabula can show a
// production's, Content HQ shows all of them — the same records, filtered. A take appears in the
// store the moment it is generated (so the UI never waits on an upload), is saved to Content HQ in
// the background, and says plainly if that save didn't happen.
//
// The data layer here is pure plus an injected backend, so it runs under test and in tools that have
// no Content HQ connection.

import type { OrgAsset, OwnerScope } from './orgAssets';

export interface GenerationMeta {
  provider: string;
  providerName?: string;
  kind: 'image' | 'video' | 'audio';
  /** The prompt as sent. Private to the owner — never copied into a share. */
  prompt?: string;
  productionId?: string;
  productionTitle?: string;
  sceneId?: string;
  shotId?: string;
  slug?: string;
  /** Character-sheet output: whose, and which view. */
  castId?: string;
  sheetView?: string;
  /** A storyboard frame rather than final picture. */
  board?: boolean;
  attempt?: number;
  /** Generated on the owner's own GPU. */
  local?: boolean;
  jobId?: string;
  review?: { verdict: 'pass' | 'retry' | 'review'; score: number; summary?: string };
  /** An unlisted, link-readable copy made when the owner chose to share. */
  public?: { url: string; photoId?: string; at: number };
  createdAt: number;
}

export type SaveState = 'hq' | 'saving' | 'local' | 'failed';

export interface GalleryItem {
  /** Stable for the life of the page: the Content HQ asset id once saved, a temporary id before. */
  id: string;
  hqAssetId?: string;
  name: string;
  kind: 'image' | 'video' | 'audio';
  mime: string;
  folder: string;
  createdAt: number;
  generation: GenerationMeta;
  saved: SaveState;
  /** Why it isn't in Content HQ, when it isn't. */
  saveNote?: string;
  /** Something to show right now — a blob URL for a fresh take, resolved lazily for saved ones. */
  previewUrl?: string;
  asset?: OrgAsset;
}

export const GENERATED_ROOT = 'Generated';

/** The Content HQ folder a production's generated work is filed under. */
export function generatedFolder(productionTitle?: string): string {
  const t = (productionTitle || '').replace(/[\\/]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return t ? `${GENERATED_ROOT} / ${t}` : GENERATED_ROOT;
}
export const isGeneratedFolder = (folder?: string | null): boolean => !!folder && (folder === GENERATED_ROOT || folder.startsWith(`${GENERATED_ROOT} / `));

export interface GalleryFilter {
  productionId?: string;
  shotId?: string;
  castId?: string;
  kind?: 'image' | 'video' | 'audio';
  provider?: string;
  verdict?: 'pass' | 'retry' | 'review' | 'unreviewed';
  /** A Content HQ folder: the generated root matches everything under it. */
  folder?: string;
  /** Hide storyboards / show only storyboards. */
  board?: boolean;
  text?: string;
}

export function matchesGalleryFilter(item: GalleryItem, f: GalleryFilter = {}): boolean {
  const g = item.generation;
  if (f.productionId && g.productionId !== f.productionId) return false;
  if (f.shotId && g.shotId !== f.shotId) return false;
  if (f.castId && g.castId !== f.castId) return false;
  if (f.kind && item.kind !== f.kind) return false;
  if (f.provider && g.provider !== f.provider) return false;
  if (f.verdict && (f.verdict === 'unreviewed' ? !!g.review : g.review?.verdict !== f.verdict)) return false;
  if (f.folder && f.folder !== GENERATED_ROOT && item.folder !== f.folder) return false;
  if (f.board !== undefined && !!g.board !== f.board) return false;
  if (f.text) {
    const hay = `${item.name} ${g.slug || ''} ${g.productionTitle || ''} ${g.providerName || g.provider} ${g.prompt || ''}`.toLowerCase();
    if (!f.text.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w))) return false;
  }
  return true;
}

/** What there is to filter by, with counts — for the gallery's filter chips. */
export function galleryFacets(items: GalleryItem[]): { providers: [string, string, number][]; verdicts: Record<string, number>; kinds: Record<string, number> } {
  const providers = new Map<string, [string, string, number]>();
  const verdicts: Record<string, number> = {}, kinds: Record<string, number> = {};
  for (const it of items) {
    const p = providers.get(it.generation.provider) || [it.generation.provider, it.generation.providerName || it.generation.provider, 0];
    p[2]++; providers.set(p[0], p);
    const v = it.generation.review?.verdict || 'unreviewed';
    verdicts[v] = (verdicts[v] || 0) + 1;
    kinds[it.kind] = (kinds[it.kind] || 0) + 1;
  }
  return { providers: [...providers.values()].sort((a, b) => b[2] - a[2]), verdicts, kinds };
}

const kindOf = (mime: string): 'image' | 'video' | 'audio' => (mime.startsWith('video') ? 'video' : mime.startsWith('audio') ? 'audio' : 'image');

/** A Content HQ record as a gallery item — or null if it isn't generated work. */
export function itemFromHqAsset(asset: OrgAsset): GalleryItem | null {
  if (!asset.generation || asset.deletedAt) return null;
  return {
    id: asset.id, hqAssetId: asset.id, name: asset.name, kind: asset.generation.kind || kindOf(asset.mimeType || ''),
    mime: asset.mimeType, folder: asset.folder || GENERATED_ROOT, createdAt: asset.generation.createdAt || asset.uploadedAt,
    generation: asset.generation, saved: 'hq', asset,
  };
}

/** What a share starts with: a title, and nothing else. The prompt, the production's name and the
 *  shot it belongs to are the owner's working material — they add those to a post if they choose. */
export function shareSeed(item: GalleryItem): { title: string; text: string } {
  const title = item.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim() || 'Generated image';
  return { title, text: '' };
}

/** Where the gallery reads and writes. The default is Content HQ; tests and offline tools inject their own. */
export interface GalleryBackend {
  list(): Promise<OrgAsset[]>;
  add(file: File, folder: string, generation: GenerationMeta): Promise<OrgAsset>;
  update(assetId: string, generation: GenerationMeta): Promise<void>;
  remove(asset: OrgAsset): Promise<void>;
  /** The bytes of a saved asset (Content HQ downloads are authenticated). */
  blob(asset: OrgAsset): Promise<Blob>;
}

type Listener = (items: GalleryItem[]) => void;

export class GalleryStore {
  private items: GalleryItem[] = [];
  private listeners = new Set<Listener>();
  private loaded = false;
  private seq = 0;
  /** Bytes of takes not (yet) in Content HQ, so they can still be shared, downloaded or used. */
  private held = new Map<string, Blob>();
  /** Why Content HQ isn't being used, when it isn't (signed out, no backend). */
  offlineReason?: string;

  constructor(private backend: GalleryBackend | null, offlineReason?: string) {
    this.offlineReason = backend ? undefined : (offlineReason || 'Sign in to keep generated work in Content HQ.');
  }

  get connected(): boolean { return !!this.backend; }
  getItems(): GalleryItem[] { return this.items; }
  find(id: string): GalleryItem | undefined { return this.items.find((i) => i.id === id || i.hqAssetId === id); }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.items);
    if (!this.loaded) void this.refresh();
    return () => { this.listeners.delete(fn); };
  }
  private emit() { this.items = [...this.items].sort((a, b) => b.createdAt - a.createdAt); for (const l of this.listeners) l(this.items); }

  /** Re-read Content HQ. Takes that haven't finished saving are kept. */
  async refresh(): Promise<void> {
    this.loaded = true;
    if (!this.backend) return;
    try {
      const saved = (await this.backend.list()).map(itemFromHqAsset).filter(Boolean) as GalleryItem[];
      const pending = this.items.filter((i) => i.saved !== 'hq');
      const previews = new Map(this.items.filter((i) => i.previewUrl && i.hqAssetId).map((i) => [i.hqAssetId!, i.previewUrl!]));
      this.items = [...pending, ...saved.map((s) => ({ ...s, previewUrl: previews.get(s.id) }))];
      this.emit();
    } catch { /* keep what we have; the next refresh will try again */ }
  }

  /** Add a fresh take. It shows immediately and is saved to Content HQ in the background; the
   *  returned id stays valid afterwards (lookups accept either the temporary or the saved id). */
  add(input: { blob: Blob; name: string; generation: Omit<GenerationMeta, 'createdAt'> & { createdAt?: number }; previewUrl?: string }): GalleryItem {
    const generation: GenerationMeta = { ...input.generation, createdAt: input.generation.createdAt ?? Date.now() };
    const item: GalleryItem = {
      id: `tmp_${Date.now().toString(36)}_${++this.seq}`, name: input.name, kind: generation.kind, mime: input.blob.type || 'application/octet-stream',
      folder: generatedFolder(generation.productionTitle), createdAt: generation.createdAt, generation,
      saved: this.backend ? 'saving' : 'local', saveNote: this.backend ? undefined : this.offlineReason, previewUrl: input.previewUrl,
    };
    this.items = [item, ...this.items];
    this.held.set(item.id, input.blob);
    this.emit();
    if (this.backend) void this.persist(item, input.blob);
    return item;
  }

  private async persist(item: GalleryItem, blob: Blob): Promise<void> {
    try {
      const file = new File([blob], item.name, { type: item.mime });
      const asset = await this.backend!.add(file, item.folder, item.generation);
      this.patch(item.id, { hqAssetId: asset.id, asset: { ...asset, generation: this.find(item.id)?.generation || item.generation }, saved: 'hq', saveNote: undefined });
      // A review or a share may have landed while the upload was in flight — write the latest.
      const now = this.find(item.id);
      if (now && now.generation !== item.generation) await this.backend!.update(asset.id, now.generation).catch(() => {});
      this.held.delete(item.id);
      announce();
    } catch (e: any) {
      this.patch(item.id, { saved: 'failed', saveNote: e?.message || 'Could not save to Content HQ.' });
    }
  }

  private patch(id: string, patch: Partial<GalleryItem>) {
    this.items = this.items.map((i) => (i.id === id || i.hqAssetId === id ? { ...i, ...patch } : i));
    this.emit();
  }

  /** Change an item's provenance (a review verdict, a public copy) and write it through. */
  async updateGeneration(id: string, change: Partial<GenerationMeta>): Promise<void> {
    const item = this.find(id);
    if (!item) return;
    const generation = { ...item.generation, ...change };
    this.patch(id, { generation, asset: item.asset ? { ...item.asset, generation } : item.asset });
    if (this.backend && item.hqAssetId) await this.backend.update(item.hqAssetId, generation).catch(() => {});
  }

  async remove(id: string): Promise<void> {
    const item = this.find(id);
    if (!item) return;
    if (this.backend && item.asset) await this.backend.remove(item.asset);
    this.items = this.items.filter((i) => i !== item && i.id !== item.id);
    this.held.delete(item.id);
    this.emit();
    announce();
  }

  /** The bytes of an item — for a download, a public copy, or laying it into a cut. */
  async blob(id: string): Promise<Blob> {
    const item = this.find(id);
    if (!item) throw new Error('That item is no longer in the gallery.');
    const held = this.held.get(item.id);
    if (held) return held;
    if (item.previewUrl) { try { const r = await fetch(item.previewUrl); if (r.ok) return await r.blob(); } catch { /* an expired preview — fall through to Content HQ */ } }
    if (this.backend && item.asset) return this.backend.blob(item.asset);
    throw new Error('This take was not saved, and its preview has expired.');
  }

  /** A displayable address for an item, fetched once and remembered. */
  async preview(id: string): Promise<string | undefined> {
    const item = this.find(id);
    if (!item) return undefined;
    if (item.previewUrl) return item.previewUrl;
    if (!this.backend || !item.asset || typeof URL === 'undefined' || !URL.createObjectURL) return undefined;
    try {
      const url = URL.createObjectURL(await this.backend.blob(item.asset));
      this.patch(id, { previewUrl: url });
      return url;
    } catch { return undefined; }
  }
}

export const HQ_UPDATED_EVENT = 'plajah:orgAssetsUpdated';
function announce() {
  try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(HQ_UPDATED_EVENT)); } catch { /* not in a browser */ }
}

// One store per owner scope for the whole page — that is what makes every surface show the same thing.
const stores = new Map<string, GalleryStore>();

/** The shared store for a scope. `makeBackend` is only called the first time a scope is seen. */
export function getGalleryStore(scopeKey: string, makeBackend: () => GalleryBackend | null, offlineReason?: string): GalleryStore {
  let store = stores.get(scopeKey);
  if (!store) {
    store = new GalleryStore(makeBackend(), offlineReason);
    stores.set(scopeKey, store);
    const s = store;
    try { if (typeof window !== 'undefined') window.addEventListener(HQ_UPDATED_EVENT, () => { void s.refresh(); }); } catch { /* not in a browser */ }
  }
  return store;
}

/** Content HQ as the gallery's backend, for one owner scope. Content HQ's own module (and Firebase)
 *  is loaded on first use, so tools that only read the store's types stay light. */
export function hqGalleryBackend(scope: OwnerScope): GalleryBackend {
  const hq = () => import('./orgAssets');
  return {
    list: async () => (await hq()).listHqAssets(scope),
    add: async (file, folder, generation) => {
      const m = await hq();
      const asset = await m.addHqAsset(scope, file, folder);
      await m.updateHqAssetGeneration(asset.id, generation);
      return { ...asset, generation };
    },
    update: async (assetId, generation) => (await hq()).updateHqAssetGeneration(assetId, generation),
    remove: async (asset) => (await hq()).deleteHqAsset(asset),
    blob: async (asset) => {
      const { auth } = await import('./firebase');
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(asset.url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error(asset.scanStatus === 'PENDING' ? 'This file is still being scanned — try again in a moment.' : `Content HQ refused the download (${res.status}).`);
      return res.blob();
    },
  };
}

/** The shared gallery for a signed-in owner, or a session-only one when nobody is signed in. */
export function galleryForUser(uid: string | null | undefined): GalleryStore {
  return uid
    ? getGalleryStore(`user:${uid}`, () => hqGalleryBackend({ kind: 'user', id: uid }))
    : getGalleryStore('session', () => null);
}

/** Make the unlisted public copy a share needs (Content HQ files are private), once per item.
 *  `publish` uploads the bytes somewhere link-readable and returns the address. */
export async function ensurePublicCopy(
  store: GalleryStore, id: string,
  publish: (file: File, title: string) => Promise<{ url: string; photoId?: string } | undefined>,
): Promise<string> {
  const item = store.find(id);
  if (!item) throw new Error('That item is no longer in the gallery.');
  if (item.generation.public?.url) return item.generation.public.url;
  const blob = await store.blob(id);
  const made = await publish(new File([blob], item.name, { type: item.mime }), shareSeed(item).title);
  if (!made?.url) throw new Error('Sign in to share — a shareable copy could not be made.');
  await store.updateGeneration(id, { public: { url: made.url, photoId: made.photoId, at: Date.now() } });
  return made.url;
}
