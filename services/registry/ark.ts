/**
 * ARK (Archival Resource Key) minting — the free, on-platform persistent identifier.
 *
 * WHY ARK AND NOT AN INVENTED NUMBER
 * ──────────────────────────────────
 * An ARK is the one persistent identifier a platform can issue itself, for free, that
 * libraries and archives already recognise. Any stable organisation can request a NAAN
 * (Name Assigning Authority Number) from the ARK Alliance at no cost, and then mint
 * unlimited ARKs with no per-identifier fee and no central approval:
 *
 *     ark:/12345/w7fx3k2qb
 *     └───┘ └───┘ └──────┘
 *      label NAAN  shoulder + blade + check character
 *
 * WHAT IT IS NOT
 * ──────────────
 * An ARK is NOT an ISBN/ISRC/UPC substitute. It does not route a sale. A bookshop, DSP or
 * distributor cannot use it to stock or sell the work. It identifies, cites and resolves —
 * that is the whole job. UI copy must never imply otherwise.
 *
 * UNTIL A NAAN IS GRANTED
 * ───────────────────────
 * `VITE_ARK_NAAN` is unset, `arkAvailable()` is false, and `mintArk()` returns null. Every
 * caller must handle null; nothing fabricates a NAAN. Requesting one takes about two business
 * days (arks.org) and costs nothing.
 */

/**
 * The "betanumeric" repertoire used by NOID: digits plus consonants, with vowels removed so
 * minted names cannot accidentally spell words. 29 characters — the check-character modulus.
 */
const BETANUMERIC = '0123456789bcdfghjkmnpqrstvwxz';

/** NAAN assigned to Plajah by the ARK Alliance. Unset until the request is granted. */
export function arkNaan(): string | null {
  const naan = (import.meta as any)?.env?.VITE_ARK_NAAN;
  return typeof naan === 'string' && /^\d{5,9}$/.test(naan) ? naan : null;
}

/** True when ARKs can actually be minted. Gate any ARK affordance on this. */
export function arkAvailable(): boolean {
  return arkNaan() !== null;
}

/**
 * Per-layer shoulder, so an ARK's own text says what kind of thing it names and the three
 * layers can never collide: w = work, m = manifestation, p = product, a = party.
 */
export type ArkShoulder = 'w' | 'm' | 'p' | 'a';

/**
 * NOID-style check character: Σ (ordinal × 1-based position) mod 29, indexed back into the
 * repertoire. Characters outside the repertoire (including '/') count as ordinal 0 but still
 * occupy a position, so a transposition or a dropped character changes the result.
 */
export function noidCheckChar(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const ord = BETANUMERIC.indexOf(body[i]);
    sum += (ord < 0 ? 0 : ord) * (i + 1);
  }
  return BETANUMERIC[sum % BETANUMERIC.length];
}

/** Random blade from the betanumeric repertoire, using the platform CSPRNG. */
function randomBlade(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += BETANUMERIC[b % BETANUMERIC.length];
  return out;
}

/**
 * Mint a new ARK for one registry layer. Returns null when no NAAN is configured — callers
 * show "not yet available" rather than inventing one.
 *
 * Collision risk is negligible (29^8 ≈ 5×10^11 per shoulder), but the registry service still
 * writes ARKs with a uniqueness guard, because "negligible" is not "impossible".
 */
export function mintArk(shoulder: ArkShoulder, bladeLength = 8): string | null {
  const naan = arkNaan();
  if (!naan) return null;
  const body = `${naan}/${shoulder}${randomBlade(bladeLength)}`;
  return `ark:/${body}${noidCheckChar(body)}`;
}

/** Verify an ARK's check character. Returns false for ARKs minted by other authorities. */
export function verifyArk(ark: string): boolean {
  const m = /^ark:\/?(\d{5,9})\/(.+)$/.exec((ark || '').trim().toLowerCase());
  if (!m) return false;
  const body = `${m[1]}/${m[2]}`;
  const check = body[body.length - 1];
  return noidCheckChar(body.slice(0, -1)) === check;
}

/** Split an ARK into its parts. Returns null when the shape is wrong. */
export function parseArk(ark: string): { naan: string; name: string; shoulder: string } | null {
  const m = /^ark:\/?(\d{5,9})\/(.+)$/.exec((ark || '').trim().toLowerCase());
  if (!m) return null;
  return { naan: m[1], name: m[2], shoulder: m[2][0] || '' };
}

/**
 * Global resolver URL. ARKs may also be resolved by the assigning organisation's own server;
 * `localArkPath` is the in-app route Plajah should serve for its own ARKs.
 */
export function arkResolverUrl(ark: string): string {
  const clean = (ark || '').trim().toLowerCase().replace(/^ark:\/?/, 'ark:/');
  return `https://n2t.net/${clean}`;
}

export function localArkPath(ark: string): string {
  const parsed = parseArk(ark);
  return parsed ? `/id/${parsed.naan}/${parsed.name}` : '/id';
}
