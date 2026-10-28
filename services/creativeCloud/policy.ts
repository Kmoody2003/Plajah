// services/creativeCloud/policy.ts — who pays storage for which creative work.
//
// Every project made on the platform (Tela documents, comics, Anima, Fabula edits, Melos music
// projects, scripts, designs…) autosaves to the cloud and counts toward the owner's creative
// storage. Free accounts get 5 GB; Plajah+ subscribers get their tier's storage. Releases never
// count: music, film and books uploaded to Chora, Taleo, Reello or Lorea live outside the
// measured prefixes. Enforcement ships OFF: usage is measured and shown, nothing is
// blocked, until Kenne turns on `enforceCreativeQuota` in Firestore `config/storagePolicy`.
//
// Pure module (no Firebase) so the client, the server recount and tests share one answer.

export const GiB = 1024 ** 3;

/** Free (non-Plajah+) creative storage allowance. */
export const FREE_CREATIVE_STORAGE_BYTES = 5 * GiB;

/** Plajah+ tier storage in GB (mirrors TIER_STORAGE in server.ts / subscriptionService). */
export const PLUS_TIER_STORAGE_GB: Record<number, number> = { 1: 50, 2: 75, 3: 100 };

export type CreativeKind =
  | 'tela'
  | 'comic'
  | 'anima'
  | 'storybook'
  | 'lorea-draft'
  | 'script'
  | 'design'
  | 'presentation'
  | 'podcast'
  | 'melos'
  | 'fabula'
  | 'newsroom'
  | 'merch'
  | 'pixels'
  | 'beats'
  | 'other';

export type QuotaClass = 'counted' | 'exempt';

/**
 * Everything made in a Plajah creative tool counts, including Fabula film edits and Melos music
 * projects. Releases are exempt by never being measured (see creativePrefixes), not by kind.
 * Unknown kinds count (fail toward measuring, never toward blocking — enforcement is separate).
 */
export const KIND_QUOTA_CLASS: Record<CreativeKind, QuotaClass> = {
  tela: 'counted',
  comic: 'counted',
  anima: 'counted',
  storybook: 'counted',
  'lorea-draft': 'counted',
  script: 'counted',
  design: 'counted',
  presentation: 'counted',
  podcast: 'counted',
  melos: 'counted',
  fabula: 'counted',
  newsroom: 'counted',
  merch: 'counted',
  pixels: 'counted',
  beats: 'counted',
  other: 'counted',
};

export function quotaClassOf(kind: string): QuotaClass {
  return KIND_QUOTA_CLASS[kind as CreativeKind] ?? 'counted';
}

/**
 * Storage paths and whether they count. Releases (albums, videos/Mux, published books)
 * live outside these prefixes, so they are never measured at all.
 */
export function creativePrefixes(uid: string): { prefix: string; kindFromPath: (path: string) => string }[] {
  return [
    {
      // personal/{uid}/creative/{kind}/{projectId}/…  (cloud copies + version history)
      prefix: `personal/${uid}/creative/`,
      kindFromPath: (p) => p.slice(`personal/${uid}/creative/`.length).split('/')[0] || 'other',
    },
    {
      // users/{uid}/tela/…  (images and media placed in Tela documents)
      prefix: `users/${uid}/tela/`,
      kindFromPath: () => 'tela',
    },
  ];
}

export interface PlusStatus {
  active: boolean;
  tier?: number;
  storageLimitGb?: number;
}

/** Creative storage allowance for an account. */
export function creativeLimitBytes(plus: PlusStatus | null | undefined): number {
  if (plus?.active) {
    const gb = plus.storageLimitGb || (plus.tier ? PLUS_TIER_STORAGE_GB[plus.tier] : 0) || PLUS_TIER_STORAGE_GB[1];
    return gb * GiB;
  }
  return FREE_CREATIVE_STORAGE_BYTES;
}

/** Subscription statuses that count as an active Plajah+ (matches contentHqEntitlements). */
export function isPlusStatusActive(status: string | undefined): boolean {
  return status === 'active' || status === 'trialing' || status === 'past_due';
}

export interface UsageByKind {
  [kind: string]: number;
}

export interface CreativeUsage {
  countedBytes: number;
  exemptBytes: number;
  byKind: UsageByKind;
  limitBytes: number;
  plus: boolean;
  enforced: boolean;
  measuredAt: number;
}

/** Sums object sizes into counted / exempt totals. */
export function tallyUsage(objects: { kind: string; size: number }[]): Pick<CreativeUsage, 'countedBytes' | 'exemptBytes' | 'byKind'> {
  const byKind: UsageByKind = {};
  let countedBytes = 0;
  let exemptBytes = 0;
  for (const o of objects) {
    const size = Math.max(0, Number(o.size) || 0);
    byKind[o.kind] = (byKind[o.kind] ?? 0) + size;
    if (quotaClassOf(o.kind) === 'counted') countedBytes += size;
    else exemptBytes += size;
  }
  return { countedBytes, exemptBytes, byKind };
}

export interface QuotaDecision {
  /** May this save go to the cloud? Always true while enforcement is off. */
  allowed: boolean;
  /** Would this save exceed the allowance (shown as a warning even while not enforced). */
  wouldExceed: boolean;
  usedAfterBytes: number;
  limitBytes: number;
  percentAfter: number;
}

export function evaluateCreativeQuota(input: {
  kind: string;
  usedBytes: number;
  incomingBytes: number;
  limitBytes: number;
  enforced: boolean;
}): QuotaDecision {
  const counted = quotaClassOf(input.kind) === 'counted';
  const usedAfterBytes = input.usedBytes + (counted ? Math.max(0, input.incomingBytes) : 0);
  const wouldExceed = counted && usedAfterBytes > input.limitBytes;
  return {
    allowed: !(input.enforced && wouldExceed),
    wouldExceed,
    usedAfterBytes,
    limitBytes: input.limitBytes,
    percentAfter: input.limitBytes > 0 ? Math.min(999, (usedAfterBytes / input.limitBytes) * 100) : 0,
  };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < GiB) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / GiB).toFixed(2)} GB`;
}
