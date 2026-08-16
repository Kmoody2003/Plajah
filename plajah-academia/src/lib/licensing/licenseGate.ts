import type { License, LibraryItem } from "../../types/schema";

/**
 * License gate — the second face of the Integrity Wall.
 * The same boundary that separates District/Independent personas also
 * controls which content may cross into commercial (paid) use.
 *
 * CC-BY-NC and CC-BY-NC-SA (CK-12, EngageNY/Eureka) live in the free
 * tier ONLY, or as outbound links. Getting this wrong is real legal
 * exposure; this module makes it impossible to get wrong silently.
 */

const RESTRICTIVENESS: License[] = ["PD", "CC-BY", "CC-BY-SA", "CC-BY-NC", "CC-BY-NC-SA"];

export function commercialOk(license: License): boolean {
  return license === "PD" || license === "CC-BY" || license === "CC-BY-SA";
}

export function requiresShareAlike(license: License): boolean {
  return license === "CC-BY-SA" || license === "CC-BY-NC-SA";
}

/** Most restrictive license wins for a bundle of materials. */
export function mostRestrictive(licenses: License[]): License {
  return licenses.reduce(
    (worst, l) => (RESTRICTIVENESS.indexOf(l) > RESTRICTIVENESS.indexOf(worst) ? l : worst),
    "PD" as License
  );
}

export interface GateResult {
  allowed: boolean;
  effectiveLicense: License;
  blocking: Array<{ itemId: string; license: License }>;
  shareAlikeRequired: boolean;
  attributions: string[];
}

/** Evaluate whether a set of materials may be used in a paid offering. */
export function gateForCommercialUse(
  items: Array<{ id: string; item: Pick<LibraryItem, "license" | "attribution"> }>
): GateResult {
  const blocking = items
    .filter(({ item }) => !commercialOk(item.license))
    .map(({ id, item }) => ({ itemId: id, license: item.license }));
  const effectiveLicense = mostRestrictive(items.map(i => i.item.license));
  return {
    allowed: blocking.length === 0,
    effectiveLicense,
    blocking,
    shareAlikeRequired: requiresShareAlike(effectiveLicense),
    attributions: items.map(i => i.item.attribution),
  };
}

/** Pre-composed attribution strings for the ingest pipeline. */
export function composeAttribution(source: string, title: string, license: License, url: string) {
  if (license === "PD") return `"${title}" (${source}) — public domain. ${url}`;
  return `"${title}" by ${source}, licensed under ${license}. ${url}`;
}
