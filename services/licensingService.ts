/**
 * licensingService — creator-chosen content licenses (built but gated behind the
 * CONTENT_LICENSING feature flag; OFF by default, slow-walked).
 *
 * Default is All Rights Reserved. A creator may OPT IN to a Creative Commons
 * license. The platform is the intelligent gatekeeper: it understands the
 * relationship between a license and how the work is monetized (paywall /
 * exclusivity) and only offers combinations that don't contradict each other —
 * e.g. you can't sell exclusive access to something you've also licensed for
 * free commercial reuse.
 *
 * Nothing here changes behavior until the flag is enabled; it's pure data +
 * helpers plus a provenance record builder (the on-chain inscription is wired
 * through the existing Web3 services when WEB3_* flags are on).
 */

export type ContentLicenseId =
  | 'ALL_RIGHTS_RESERVED'
  | 'CC_BY'
  | 'CC_BY_SA'
  | 'CC_BY_ND'
  | 'CC_BY_NC'
  | 'CC_BY_NC_SA'
  | 'CC_BY_NC_ND'
  | 'CC0';

export interface LicenseDef {
  id: ContentLicenseId;
  /** Short code, e.g. "CC BY-NC". */
  label: string;
  /** Full name, e.g. "Attribution-NonCommercial". */
  name: string;
  /** Plain-language, creator-facing one-liner (no legalese). */
  human: string;
  /** Canonical license deed URL. */
  url: string;
  allowsCommercial: boolean;
  allowsDerivatives: boolean;
  requiresAttribution: boolean;
  shareAlike: boolean;
  /** Any Creative Commons option (i.e. not All Rights Reserved). */
  isOpen: boolean;
  /** CC grants are irrevocable for copies already distributed. */
  irrevocable: boolean;
}

export const DEFAULT_LICENSE: ContentLicenseId = 'ALL_RIGHTS_RESERVED';

const CC = 'https://creativecommons.org';

export const LICENSES: Record<ContentLicenseId, LicenseDef> = {
  ALL_RIGHTS_RESERVED: {
    id: 'ALL_RIGHTS_RESERVED', label: 'All Rights Reserved', name: 'All Rights Reserved',
    human: 'You keep every right. Nobody may reuse, remix, or redistribute without your permission. Required for paywalled or exclusive work.',
    url: '', allowsCommercial: false, allowsDerivatives: false, requiresAttribution: false,
    shareAlike: false, isOpen: false, irrevocable: false,
  },
  CC_BY: {
    id: 'CC_BY', label: 'CC BY', name: 'Attribution',
    human: 'Anyone may use, remix, and even sell your work, as long as they credit you. Most permissive after CC0.',
    url: `${CC}/licenses/by/4.0/`, allowsCommercial: true, allowsDerivatives: true, requiresAttribution: true,
    shareAlike: false, isOpen: true, irrevocable: true,
  },
  CC_BY_SA: {
    id: 'CC_BY_SA', label: 'CC BY-SA', name: 'Attribution-ShareAlike',
    human: 'Reuse and remix freely (commercial OK) with credit — but anything built on it must share the same license.',
    url: `${CC}/licenses/by-sa/4.0/`, allowsCommercial: true, allowsDerivatives: true, requiresAttribution: true,
    shareAlike: true, isOpen: true, irrevocable: true,
  },
  CC_BY_ND: {
    id: 'CC_BY_ND', label: 'CC BY-ND', name: 'Attribution-NoDerivatives',
    human: 'Anyone may share or sell the work as-is with credit, but no remixes or edits.',
    url: `${CC}/licenses/by-nd/4.0/`, allowsCommercial: true, allowsDerivatives: false, requiresAttribution: true,
    shareAlike: false, isOpen: true, irrevocable: true,
  },
  CC_BY_NC: {
    id: 'CC_BY_NC', label: 'CC BY-NC', name: 'Attribution-NonCommercial',
    human: 'Fans may use and remix it for free with credit, but NOT commercially — you keep commercial rights, so you can still sell it.',
    url: `${CC}/licenses/by-nc/4.0/`, allowsCommercial: false, allowsDerivatives: true, requiresAttribution: true,
    shareAlike: false, isOpen: true, irrevocable: true,
  },
  CC_BY_NC_SA: {
    id: 'CC_BY_NC_SA', label: 'CC BY-NC-SA', name: 'Attribution-NonCommercial-ShareAlike',
    human: 'Non-commercial reuse and remix with credit; remixes must share the same license. You keep commercial rights.',
    url: `${CC}/licenses/by-nc-sa/4.0/`, allowsCommercial: false, allowsDerivatives: true, requiresAttribution: true,
    shareAlike: true, isOpen: true, irrevocable: true,
  },
  CC_BY_NC_ND: {
    id: 'CC_BY_NC_ND', label: 'CC BY-NC-ND', name: 'Attribution-NonCommercial-NoDerivatives',
    human: 'The most restrictive CC option: free non-commercial sharing as-is with credit, no remixes. You keep commercial rights.',
    url: `${CC}/licenses/by-nc-nd/4.0/`, allowsCommercial: false, allowsDerivatives: false, requiresAttribution: true,
    shareAlike: false, isOpen: true, irrevocable: true,
  },
  CC0: {
    id: 'CC0', label: 'CC0', name: 'Public Domain Dedication',
    human: 'You give up all rights — anyone may do anything, no credit needed. You cannot monetize or make it exclusive after this.',
    url: `${CC}/publicdomain/zero/1.0/`, allowsCommercial: true, allowsDerivatives: true, requiresAttribution: false,
    shareAlike: false, isOpen: true, irrevocable: true,
  },
};

export const ALL_LICENSE_IDS = Object.keys(LICENSES) as ContentLicenseId[];

export const getLicense = (id?: ContentLicenseId | null): LicenseDef =>
  LICENSES[id ?? DEFAULT_LICENSE] ?? LICENSES[DEFAULT_LICENSE];

/**
 * A license is paywall-compatible only if it does NOT grant others the right to
 * reuse the work commercially for free — otherwise selling it is meaningless.
 * (All Rights Reserved + every NonCommercial CC variant qualify.)
 */
export const isPaywallCompatible = (id: ContentLicenseId): boolean =>
  !LICENSES[id].allowsCommercial;

export const isExclusivityCompatible = (id: ContentLicenseId): boolean =>
  id === 'ALL_RIGHTS_RESERVED';

export interface MonetizationContext {
  isPaywalled?: boolean;
  isExclusive?: boolean;
}

/**
 * Intelligent gatekeeping: which licenses may a creator pick given how this work
 * is monetized?  Exclusive work must stay All Rights Reserved; paid work may use
 * ARR or any NonCommercial license; free work may pick anything.
 */
export function allowedLicenses(ctx: MonetizationContext): ContentLicenseId[] {
  if (ctx.isExclusive) return ['ALL_RIGHTS_RESERVED'];
  if (ctx.isPaywalled) return ALL_LICENSE_IDS.filter(isPaywallCompatible);
  return ALL_LICENSE_IDS;
}

/** Returns a human reason if the license conflicts with the monetization, else null. */
export function licenseConflict(id: ContentLicenseId, ctx: MonetizationContext): string | null {
  if (ctx.isExclusive && !isExclusivityCompatible(id)) {
    return 'Exclusive content must be All Rights Reserved — an open license lets anyone host it elsewhere, so the exclusivity (and any deal paying for it) would be worthless.';
  }
  if (ctx.isPaywalled && !isPaywallCompatible(id)) {
    return 'This license lets anyone reuse the work commercially for free, so a paywall can’t hold. Use a NonCommercial license to keep selling rights, or turn the paywall off.';
  }
  return null;
}

// ─── On-chain provenance (record builder; inscription wired via Web3 services) ──

export interface LicenseProvenance {
  contentId: string;
  license: ContentLicenseId;
  /** IPFS CID / content hash if available (Plajah already stores clipIpfsCid etc.). */
  contentHash?: string;
  /** Creator wallet address, when custodial/connected wallets are active. */
  wallet?: string;
  creatorUid: string;
  timestamp: number;
  /** 'pending' until actually inscribed on-chain by a WEB3_* flow. */
  chainStatus: 'pending' | 'inscribed';
}

/**
 * Build the immutable provenance record for a licensed work. The actual on-chain
 * inscription happens through the existing Web3 services when those flags are on;
 * until then this is the off-chain record of intent (what was licensed, by whom,
 * when, under which terms).
 */
export function buildLicenseProvenance(args: {
  contentId: string;
  license: ContentLicenseId;
  creatorUid: string;
  timestamp: number;
  contentHash?: string;
  wallet?: string;
}): LicenseProvenance | null {
  // Provenance only matters for actual grants (CC). ARR needs no public record.
  if (!LICENSES[args.license].isOpen) return null;
  return {
    contentId: args.contentId,
    license: args.license,
    contentHash: args.contentHash,
    wallet: args.wallet,
    creatorUid: args.creatorUid,
    timestamp: args.timestamp,
    chainStatus: 'pending',
  };
}
