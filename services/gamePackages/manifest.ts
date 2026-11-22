// Game packages: the signed manifest every native HQ package is described by (docs/GAME_DELIVERY_ARCHITECTURE.md §5).
//
// A package is a set of files keyed by the WEB path the game already asks for ("games/ravencrest/assets/polyhaven/textures/x/diff.jpg").
// The files are packed into content-addressed chunks (the chunk's name is its SHA-256), grouped so the player can start with `core`
// and fetch the rest while playing. A new build reuses every chunk whose hash did not change, so an update downloads only new chunks.
//
// Pure TypeScript with WebCrypto only: the build script (Node), the web layer and the tests share it. The WinUI and Android
// downloaders implement the same verification natively (same canonical bytes, same Ed25519 key).

export type PackageTier = 'native-pc' | 'native-mobile';
export type PackagePlatform = 'win-x64' | 'android-arm64';

export interface ChunkRef { /** "sha256:<hex>" */ id: string; bytes: number }
export interface PackageGroup {
  id: string;                 // "core", "region:otsu", "cast-hq"
  required?: boolean;         // core: the minimum to play the HQ tier
  /** world-space [x0, z0, x1, z1] for region groups: the downloader fetches the region the player is in first */
  bounds?: [number, number, number, number];
  chunks: string[];           // chunk ids, in download order
  bytes: number;
}
/** "sha256:<hex>@<offset>+<length>" */
export type FileRef = string;

export interface PackageManifest {
  schema: 1;
  gameId: string;
  platform: PackagePlatform;
  tier: PackageTier;
  version: string;            // for people
  build: number;              // monotonic
  minApp?: string;
  requires?: { webgpu?: boolean; vramGb?: number; diskGb?: number };
  chunks: ChunkRef[];
  groups: PackageGroup[];
  files: Record<string, FileRef>;
  /** "ed25519:<base64>" over canonicalBytes(manifest without signature) */
  signature?: string;
}

/** What the downloader writes next to the unpacked files once every chunk of the installed groups is verified: the game reads it. */
export interface InstalledIndex {
  gameId: string;
  version: string;
  build: number;
  tier: PackageTier;
  groups: string[];           // installed group ids
  paths: string[];            // web paths present in this install
}

export function parseFileRef(ref: FileRef): { chunk: string; offset: number; length: number } {
  const m = /^(sha256:[0-9a-f]{64})@(\d+)\+(\d+)$/.exec(ref);
  if (!m) throw new Error(`bad file ref ${ref}`);
  return { chunk: m[1], offset: Number(m[2]), length: Number(m[3]) };
}

/** Web path normalisation shared by builder, index and resolver: no origin, no query, no leading slash, forward slashes. */
export function normPath(p: string): string {
  let s = p.replace(/\\/g, '/');
  const q = s.search(/[?#]/); if (q >= 0) s = s.slice(0, q);
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, '');
  return decodeURIComponent(s).replace(/^\/+/, '');
}

/** Stable JSON: object keys sorted at every level, no whitespace. The bytes that are signed and hashed. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
}

export function canonicalBytes(m: PackageManifest): Uint8Array {
  const { signature: _s, ...rest } = m;
  return new TextEncoder().encode(canonicalJson(rest));
}

/** Structural checks the downloader runs before trusting anything in a manifest (after the signature check). */
export function validateManifest(m: PackageManifest): string[] {
  const errs: string[] = [];
  if (m.schema !== 1) errs.push('schema');
  if (!/^[a-z0-9-]+$/.test(m.gameId ?? '')) errs.push('gameId');
  if (!Number.isInteger(m.build) || m.build < 1) errs.push('build');
  const chunkBytes = new Map(m.chunks.map((c) => [c.id, c.bytes]));
  for (const c of m.chunks) if (!/^sha256:[0-9a-f]{64}$/.test(c.id) || !(c.bytes > 0)) errs.push(`chunk ${c.id}`);
  if (!m.groups.some((g) => g.id === 'core' && g.required)) errs.push('no required core group');
  for (const g of m.groups) for (const c of g.chunks) if (!chunkBytes.has(c)) errs.push(`group ${g.id} names unknown chunk ${c}`);
  for (const [path, ref] of Object.entries(m.files)) {
    // a path is written to disk under the install folder: it must not climb out of it
    if (path !== normPath(path) || path.split('/').some((s) => s === '..' || s === '.' || s === '') || /^[a-z]:/i.test(path)) { errs.push(`unsafe path ${path}`); continue; }
    try {
      const r = parseFileRef(ref), cb = chunkBytes.get(r.chunk);
      if (cb === undefined) errs.push(`file ${path} in unknown chunk`);
      else if (r.offset + r.length > cb) errs.push(`file ${path} runs past its chunk`);
    } catch { errs.push(`file ${path} bad ref`); }
  }
  return errs;
}

// ── Signatures (Ed25519 via WebCrypto: Node 20+, Chrome 137+, and the native apps verify the same bytes) ──────────────
// btoa/atob exist in browsers and Node 16+ (a signature is 64 bytes, so the spread is safe)
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function signManifest(m: PackageManifest, privateKey: CryptoKey): Promise<PackageManifest> {
  const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', privateKey, canonicalBytes(m)));
  return { ...m, signature: `ed25519:${b64(sig)}` };
}

export async function verifyManifest(m: PackageManifest, publicKey: CryptoKey): Promise<boolean> {
  if (!m.signature?.startsWith('ed25519:')) return false;
  try { return await crypto.subtle.verify('Ed25519', publicKey, unb64(m.signature.slice(8)), canonicalBytes(m)); } catch { return false; }
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ── Install planning ───────────────────────────────────────────────────────────────────────────────────────────────
export interface InstallPlan {
  groups: string[];           // groups that will be installed, in order
  fetch: ChunkRef[];          // chunks to download, in priority order
  reuse: string[];            // chunks already on disk from the previous build
  downloadBytes: number;
  installBytes: number;       // total size of the chunks this install keeps
}

/**
 * Which chunks to download for the wanted groups. `have` = chunk ids already verified on disk (the previous build's),
 * so an update fetches only the chunks whose hash changed. Core always comes first; the remaining groups follow `want`'s
 * order, with region groups containing `at` (the player's position) moved to the front.
 */
export function planInstall(m: PackageManifest, opts: { want?: string[]; have?: Iterable<string>; at?: [number, number] } = {}): InstallPlan {
  const have = new Set(opts.have ?? []);
  const byId = new Map(m.groups.map((g) => [g.id, g]));
  const wanted = (opts.want ?? m.groups.map((g) => g.id)).filter((id) => byId.has(id));
  const rest = wanted.filter((id) => !byId.get(id)!.required);
  const inside = (g: PackageGroup) => !!(opts.at && g.bounds && opts.at[0] >= g.bounds[0] && opts.at[0] <= g.bounds[2] && opts.at[1] >= g.bounds[1] && opts.at[1] <= g.bounds[3]);
  rest.sort((a, b) => Number(inside(byId.get(b)!)) - Number(inside(byId.get(a)!)));
  const groups = [...m.groups.filter((g) => g.required).map((g) => g.id), ...rest];
  const sizes = new Map(m.chunks.map((c) => [c.id, c.bytes]));
  const seen = new Set<string>(), fetch: ChunkRef[] = [], reuse: string[] = [];
  let downloadBytes = 0, installBytes = 0;
  for (const gid of groups) for (const c of byId.get(gid)!.chunks) {
    if (seen.has(c)) continue;
    seen.add(c);
    const bytes = sizes.get(c) ?? 0;
    installBytes += bytes;
    if (have.has(c)) reuse.push(c); else { fetch.push({ id: c, bytes }); downloadBytes += bytes; }
  }
  return { groups, fetch, reuse, downloadBytes, installBytes };
}

/** The index the game reads once the given groups are installed: every file whose chunk belongs to one of them. */
export function installedIndex(m: PackageManifest, groups: string[]): InstalledIndex {
  const chunks = new Set(m.groups.filter((g) => groups.includes(g.id)).flatMap((g) => g.chunks));
  const paths = Object.entries(m.files).filter(([, ref]) => chunks.has(parseFileRef(ref).chunk)).map(([p]) => p).sort();
  return { gameId: m.gameId, version: m.version, build: m.build, tier: m.tier, groups: [...groups], paths };
}
