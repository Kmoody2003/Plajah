// Book editions + update policy. Pure, shared by the server (routes/bookVault.ts), the Tela reader
// (services/bookTela/upgrade.ts) and the Lorea UI, so every surface answers "which version does this
// reader see?" the same way.
//
// Policy (chosen 2026-10-21):
//  - A buyer's licence covers one or more EDITIONS of a work, not a frozen file.
//  - Within an edition the author publishes CORRECTION / MINOR updates; buyers follow them automatically.
//  - A NEW_EDITION is FREE (every licence holder gets it) or PAID (holders buy an upgrade) — author's choice.
//  - Published versions are immutable; a reader may always roll back to any version they are entitled to,
//    including the one they bought.
//  - The author and readers of free books follow the newest version of any edition.
//  - Licences minted before editions existed carry no `editions` list: they cover edition 1.

export type UpdateKind = 'INITIAL' | 'CORRECTION' | 'MINOR' | 'NEW_EDITION';
export const UPDATE_KINDS: ReadonlyArray<UpdateKind> = ['INITIAL', 'CORRECTION', 'MINOR', 'NEW_EDITION'];

export interface EditionInfo {
  number: number;
  label?: string;
  publishedAt: number;
  /** How holders of earlier editions get this one. Edition 1 is always 'FREE' (it is what was sold). */
  upgrade: 'FREE' | 'PAID';
  /** Dollars, PAID only. */
  upgradePrice?: number;
}

/** Lives on the album as `bookEditions`. `freeEditions` is denormalised for firestore.rules. */
export interface EditionRegistry {
  current: number;
  list: EditionInfo[];
  freeEditions: number[];
}

export interface BookVersionStamp {
  versionId: string;
  createdAt: number;
  /** Missing on stamps written before editions existed: edition 1. */
  edition?: number;
  kind?: UpdateKind;
  /** The author's "what changed" note. */
  notes?: string;
}

export interface EditionLicense {
  issuedAt: number;
  editions?: number[];
  /** The newest version that existed at purchase — the "version you bought" for rollback. */
  versionAtPurchase?: string;
  expiresAt?: number | null;
  revokedAt?: number | null;
}

export interface PublishUpdate {
  kind: Exclude<UpdateKind, 'INITIAL'>;
  notes?: string;
  /** NEW_EDITION only. */
  editionLabel?: string;
  upgrade?: 'FREE' | 'PAID';
  upgradePrice?: number;
}

export const editionOf = (v: Pick<BookVersionStamp, 'edition'>) => (Number.isInteger(v.edition) && v.edition! > 0 ? v.edition! : 1);
const newestFirst = <T extends { createdAt: number }>(xs: ReadonlyArray<T>) => [...xs].sort((a, b) => b.createdAt - a.createdAt);

export function emptyRegistry(now = 0): EditionRegistry {
  return { current: 1, list: [{ number: 1, publishedAt: now, upgrade: 'FREE' }], freeEditions: [1] };
}

/** Normalise whatever is stored on the album (missing, partial, or legacy) into a registry. */
export function readRegistry(raw: unknown): EditionRegistry {
  const r = raw && typeof raw === 'object' ? raw as Partial<EditionRegistry> : {};
  const list = Array.isArray(r.list) ? r.list.filter(e => e && Number.isInteger(e.number) && e.number > 0) : [];
  if (!list.some(e => e.number === 1)) list.unshift({ number: 1, publishedAt: 0, upgrade: 'FREE' });
  list.sort((a, b) => a.number - b.number);
  const current = Math.max(...list.map(e => e.number));
  return { current, list, freeEditions: list.filter(e => e.upgrade === 'FREE').map(e => e.number) };
}

export function licenceActive(l: EditionLicense | null | undefined, now = Date.now()): l is EditionLicense {
  return !!l && !l.revokedAt && (l.expiresAt == null || l.expiresAt > now);
}

/** Editions a licence opens: the ones bought, plus every edition the author released as a free upgrade. */
export function entitledEditions(license: EditionLicense | null | undefined, registry: EditionRegistry, now = Date.now()): Set<number> {
  if (!licenceActive(license, now)) return new Set();
  const bought = license.editions?.length ? license.editions : [1];
  return new Set([...bought, ...registry.freeEditions]);
}

/** Which edition a stamp-less buyer of `issuedAt` bought: the newest edition published by then. */
export function editionAt(registry: EditionRegistry, at: number): number {
  return [...registry.list].filter(e => e.publishedAt <= at).sort((a, b) => b.number - a.number)[0]?.number ?? 1;
}

export interface ReaderChoice {
  /** The version to render, or null when the reader is entitled to nothing (purchase screen). */
  version: BookVersionStamp | null;
  /** True while the reader follows the newest version they're entitled to (no rollback chosen). */
  followLatest: boolean;
  /** Every version this reader may open, newest first (the rollback list). */
  readable: BookVersionStamp[];
  /** The version they bought (buyers only), for "go back to the version I bought". */
  purchased: BookVersionStamp | null;
  /** A newer PAID edition this buyer doesn't have yet. */
  upgradeOffer: EditionInfo | null;
}

/**
 * The one policy. `preferredVersionId` is the reader's rollback choice (stored per device); it is honoured
 * only if it is a version they may read.
 */
export function chooseVersion(i: {
  versions: ReadonlyArray<BookVersionStamp>;
  registry: EditionRegistry;
  isOwner: boolean;
  isPaid: boolean;
  license?: EditionLicense | null;
  preferredVersionId?: string | null;
  now?: number;
}): ReaderChoice {
  const now = i.now ?? Date.now();
  const all = newestFirst(i.versions);
  const open = i.isOwner || !i.isPaid;
  const ent = open ? null : entitledEditions(i.license, i.registry, now);
  const readable = open ? all : all.filter(v => ent!.has(editionOf(v)));
  const purchased = open || !licenceActive(i.license, now) ? null
    : readable.find(v => v.versionId === i.license!.versionAtPurchase)
      ?? readable.filter(v => v.createdAt <= i.license!.issuedAt)[0] ?? null;
  const preferred = i.preferredVersionId ? readable.find(v => v.versionId === i.preferredVersionId) : undefined;
  const top = ent && ent.size ? Math.max(...ent) : 0;
  const upgradeOffer = open || !ent?.size ? null
    : [...i.registry.list].filter(e => e.number > top && e.upgrade === 'PAID' && (e.upgradePrice ?? 0) > 0).sort((a, b) => b.number - a.number)[0] ?? null;
  return { version: preferred ?? readable[0] ?? null, followLatest: !preferred, readable, purchased, upgradeOffer };
}

/**
 * Register a newly published version. Returns the stamp (with its edition) and the next registry.
 * The first version of a book is INITIAL / edition 1 whatever was asked; a NEW_EDITION bumps the edition.
 */
export function stampVersion(registry: EditionRegistry, existing: ReadonlyArray<BookVersionStamp>, versionId: string, createdAt: number, update?: PublishUpdate | null): { stamp: BookVersionStamp; registry: EditionRegistry } {
  const notes = update?.notes?.trim().slice(0, 600) || undefined;
  if (!existing.length) {
    return { stamp: { versionId, createdAt, edition: registry.current, kind: 'INITIAL', ...(notes ? { notes } : {}) }, registry };
  }
  if (update?.kind === 'NEW_EDITION') {
    const number = registry.current + 1;
    const paid = update.upgrade === 'PAID' && (Number(update.upgradePrice) || 0) > 0;
    const info: EditionInfo = {
      number, publishedAt: createdAt, upgrade: paid ? 'PAID' : 'FREE',
      ...(update.editionLabel?.trim() ? { label: update.editionLabel.trim().slice(0, 80) } : {}),
      ...(paid ? { upgradePrice: Math.round(Number(update.upgradePrice) * 100) / 100 } : {}),
    };
    const list = [...registry.list, info];
    return {
      stamp: { versionId, createdAt, edition: number, kind: 'NEW_EDITION', ...(notes ? { notes } : {}) },
      registry: { current: number, list, freeEditions: list.filter(e => e.upgrade === 'FREE').map(e => e.number) },
    };
  }
  const kind: UpdateKind = update?.kind === 'CORRECTION' ? 'CORRECTION' : 'MINOR';
  return { stamp: { versionId, createdAt, edition: registry.current, kind, ...(notes ? { notes } : {}) }, registry };
}

/** Plain-language label for a stamp, e.g. "Edition 2 · correction". */
export function describeVersion(v: BookVersionStamp, registry?: EditionRegistry): string {
  const e = editionOf(v);
  const label = registry?.list.find(x => x.number === e)?.label;
  const kind = v.kind === 'CORRECTION' ? 'correction' : v.kind === 'MINOR' ? 'update' : v.kind === 'NEW_EDITION' ? 'new edition' : 'first release';
  return `${label || `Edition ${e}`} · ${kind}`;
}
