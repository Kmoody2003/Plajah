// oerLicenseGate — the second face of the Integrity Wall.
//
// The same boundary that separates the District and Independent personas also decides which
// content may cross into commercial (paid) use. CC-BY-NC and CC-BY-NC-SA material — CK-12,
// EngageNY/Eureka — lives in the FREE tier only, or as an outbound link. It may never sit
// behind a paid Plajah Academia offering without a separate agreement with the rights holder.
//
// Getting this wrong is real legal exposure. This module exists so it cannot be got wrong
// silently: the gate runs in the editor UI (instant, explains itself), again on the server
// before `commercialUse` can be set (services can't be trusted to have run the UI), and the
// firestore rules refuse a commercial template that isn't server-validated.

export type License = 'PD' | 'CC-BY' | 'CC-BY-SA' | 'CC-BY-NC' | 'CC-BY-NC-SA';

/** Ordered least → most restrictive. Index is the comparison key. */
export const LICENSE_RANK: License[] = ['PD', 'CC-BY', 'CC-BY-SA', 'CC-BY-NC', 'CC-BY-NC-SA'];

export const LICENSE_LABEL: Record<License, string> = {
  'PD': 'Public domain',
  'CC-BY': 'CC BY',
  'CC-BY-SA': 'CC BY-SA',
  'CC-BY-NC': 'CC BY-NC',
  'CC-BY-NC-SA': 'CC BY-NC-SA',
};

export const LICENSE_NOTE: Record<License, string> = {
  'PD': 'No restrictions. Usable anywhere, including paid courses.',
  'CC-BY': 'Commercial use allowed with attribution.',
  'CC-BY-SA': 'Commercial use allowed with attribution; derivatives must stay CC BY-SA.',
  'CC-BY-NC': 'Non-commercial only — free tier or outbound link.',
  'CC-BY-NC-SA': 'Non-commercial only, share-alike — free tier or outbound link.',
};

export function commercialOk(license: License): boolean {
  return license === 'PD' || license === 'CC-BY' || license === 'CC-BY-SA';
}

export function requiresShareAlike(license: License): boolean {
  return license === 'CC-BY-SA' || license === 'CC-BY-NC-SA';
}

/** The most restrictive licence in a bundle wins — a template inherits its worst material. */
export function mostRestrictive(licenses: License[]): License {
  return licenses.reduce<License>(
    (worst, l) => (LICENSE_RANK.indexOf(l) > LICENSE_RANK.indexOf(worst) ? l : worst),
    'PD',
  );
}

export interface GateBlocker {
  itemId: string;
  title: string;
  license: License;
  reason: string;
}

export interface GateResult {
  allowed: boolean;
  effectiveLicense: License;
  blocking: GateBlocker[];
  shareAlikeRequired: boolean;
  attributions: string[];
}

export interface GateableItem {
  id: string;
  title: string;
  license: License;
  attribution: string;
}

/** Evaluate whether a set of materials may be packaged into a paid offering. */
export function gateForCommercialUse(items: GateableItem[]): GateResult {
  const blocking = items
    .filter(i => !commercialOk(i.license))
    .map(i => ({
      itemId: i.id,
      title: i.title,
      license: i.license,
      reason: `${LICENSE_LABEL[i.license]} — free tier only`,
    }));
  const effectiveLicense = mostRestrictive(items.map(i => i.license));
  return {
    allowed: blocking.length === 0,
    effectiveLicense,
    blocking,
    shareAlikeRequired: requiresShareAlike(effectiveLicense),
    attributions: items.map(i => i.attribution),
  };
}

/** Pre-composed attribution, written once at ingest and rendered wherever the item appears. */
export function composeAttribution(source: string, title: string, license: License, url: string): string {
  if (license === 'PD') return `"${title}" (${source}) — public domain. ${url}`;
  return `"${title}" by ${source}, licensed under ${LICENSE_LABEL[license]}. ${url}`;
}
