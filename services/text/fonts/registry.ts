// registry — resolve (family, weight, style, axes, size) to an engine font instance.
//
// Sources: (a) the open-font manifest (google/fonts OFL/Apache/UFL files over jsDelivr, real
// filenames from scripts/genTextFontManifest.mjs), (b) user uploads (TTF/OTF/TTC/WOFF), (c) raw
// bytes. Bytes are cached (Cache API in the browser, `.cache/text-fonts` in node) and, in the
// browser, the SAME bytes are registered as a DOM FontFace under an engine-private family name, so
// any DOM text drawn with `cssFamily(...)` uses exactly the outlines and metrics the engine laid
// out with. Matching follows CSS Fonts 4 §5.2 (style first, then weight by the 400/500 rule);
// variable faces get exact coordinates (wght from weight, wdth from stretch, opsz from size).

import manifestJson from './manifest.json';
import { TextEngine, type FontInfo } from '../engine/wasm';
import { defaultByteCache, type ByteCache } from './cache';
import { toSfnt } from './woff';

export interface ManifestFile { file: string; style: 'normal' | 'italic'; weight?: number; axes?: string[] }
export interface ManifestFamily { dir: string; license: string; fallback?: boolean; files: ManifestFile[] }
export interface FontManifest { base: string; families: Record<string, ManifestFamily> }
export const FONT_MANIFEST = manifestJson as unknown as FontManifest;

export interface FontRequest {
  family: string;
  weight?: number;
  style?: 'normal' | 'italic';
  /** CSS font-stretch percentage (maps to wdth). */
  stretch?: number;
  /** Explicit axis coordinates; win over weight/stretch/opsz. */
  axes?: Record<string, number>;
  /** 'auto' tracks the font size (CSS font-optical-sizing: auto); a number pins opsz. */
  opticalSize?: 'auto' | 'none' | number;
}

export interface FaceRecord {
  /** Stable id: family|style|file. */
  key: string;
  family: string;
  style: 'normal' | 'italic';
  weightRange: [number, number];
  blob: number;
  index: number;
  info: FontInfo;
  source: 'manifest' | 'upload' | 'bytes';
  url?: string;
  file?: string;
  bytes: Uint8Array;
  /** Engine-private CSS family the DOM FontFace was registered under (browser only). */
  cssFamily?: string;
}

/** Per-script fallback families (all in the manifest). */
export const SCRIPT_FALLBACKS: Record<string, { sans: string[]; serif: string[] }> = {
  Latn: { sans: ['Noto Sans'], serif: ['Noto Serif'] },
  Cyrl: { sans: ['Noto Sans'], serif: ['Noto Serif'] },
  Grek: { sans: ['Noto Sans'], serif: ['Noto Serif'] },
  Arab: { sans: ['Noto Sans Arabic', 'Noto Naskh Arabic'], serif: ['Noto Naskh Arabic', 'Noto Sans Arabic'] },
  Hebr: { sans: ['Noto Sans Hebrew'], serif: ['Noto Serif Hebrew', 'Noto Sans Hebrew'] },
  Deva: { sans: ['Noto Sans Devanagari'], serif: ['Noto Serif Devanagari', 'Noto Sans Devanagari'] },
  Beng: { sans: ['Noto Sans Bengali'], serif: ['Noto Sans Bengali'] },
  Taml: { sans: ['Noto Sans Tamil'], serif: ['Noto Sans Tamil'] },
  Thai: { sans: ['Noto Sans Thai'], serif: ['Noto Sans Thai'] },
  Armn: { sans: ['Noto Sans Armenian'], serif: ['Noto Sans Armenian'] },
  Geor: { sans: ['Noto Sans Georgian'], serif: ['Noto Sans Georgian'] },
  Ethi: { sans: ['Noto Sans Ethiopic'], serif: ['Noto Sans Ethiopic'] },
  Hani: { sans: ['Noto Sans SC'], serif: ['Noto Sans SC'] },
  Hira: { sans: ['Noto Sans JP'], serif: ['Noto Serif JP', 'Noto Sans JP'] },
  Kana: { sans: ['Noto Sans JP'], serif: ['Noto Serif JP', 'Noto Sans JP'] },
  Hang: { sans: ['Noto Sans KR'], serif: ['Noto Sans KR'] },
  Zsym: { sans: ['Noto Sans Symbols 2', 'Noto Sans Symbols', 'Noto Sans Math'], serif: ['Noto Sans Symbols 2', 'Noto Sans Symbols', 'Noto Sans Math'] },
};

const SCRIPT_TESTS: [string, RegExp][] = [
  ['Arab', /\p{Script=Arabic}/u], ['Hebr', /\p{Script=Hebrew}/u], ['Deva', /\p{Script=Devanagari}/u], ['Beng', /\p{Script=Bengali}/u],
  ['Taml', /\p{Script=Tamil}/u], ['Thai', /\p{Script=Thai}/u], ['Armn', /\p{Script=Armenian}/u], ['Geor', /\p{Script=Georgian}/u],
  ['Ethi', /\p{Script=Ethiopic}/u], ['Hira', /\p{Script=Hiragana}/u], ['Kana', /\p{Script=Katakana}/u], ['Hang', /\p{Script=Hangul}/u],
  ['Hani', /\p{Script=Han}/u], ['Cyrl', /\p{Script=Cyrillic}/u], ['Grek', /\p{Script=Greek}/u], ['Latn', /\p{Script=Latin}/u],
  ['Zsym', /[←-⏿☀-➿⤀-⯿]/u],
];
/** Scripts present in `text` (ISO 15924), in a stable order. */
export function scriptsIn(text: string): string[] {
  return SCRIPT_TESTS.filter(([, re]) => re.test(text)).map(([s]) => s);
}

function weightDistance(want: number, [lo, hi]: [number, number]): number {
  if (want >= lo && want <= hi) return 0;
  // CSS: 400–500 search up to 500 first, then down, then up; <400 down then up; >500 up then down.
  const nearest = want < lo ? lo : hi;
  const d = Math.abs(nearest - want);
  const up = nearest > want;
  if (want >= 400 && want <= 500) return up ? (nearest <= 500 ? d : 1000 + d) : 500 + d;
  if (want < 400) return up ? 1000 + d : d;
  return up ? d : 1000 + d;
}

export class FontRegistry {
  readonly faces: FaceRecord[] = [];
  /** Bumps whenever a face is registered, so memoised font resolution can invalidate. */
  generation = 0;
  private instances = new Map<string, number>();
  private instanceFace = new Map<number, FaceRecord>();
  private inflight = new Map<string, Promise<FaceRecord | null>>();
  private cssCounter = 0;
  constructor(readonly engine: TextEngine, private opts: { manifest?: FontManifest; cache?: ByteCache; fetcher?: (url: string) => Promise<Uint8Array>; registerDom?: boolean } = {}) {}

  get manifest(): FontManifest { return this.opts.manifest ?? FONT_MANIFEST; }
  private get cache(): ByteCache { return (this.opts.cache ??= defaultByteCache()); }

  private async fetchBytes(url: string, file: string): Promise<Uint8Array> {
    const hit = await this.cache.get(url, file);
    if (hit) return hit;
    const bytes = this.opts.fetcher ? await this.opts.fetcher(url) : new Uint8Array(await (await fetch(url).then(r => { if (!r.ok) throw new Error(`font ${url}: HTTP ${r.status}`); return r; })).arrayBuffer());
    await this.cache.put(url, file, bytes);
    return bytes;
  }

  /** Families the manifest knows (canonical names). */
  knownFamilies(): string[] { return Object.keys(this.manifest.families); }

  hasFamily(family: string): boolean { return this.faces.some(f => f.family.toLowerCase() === family.toLowerCase()); }

  /** Fetch + register the manifest files of a family (both styles by default). */
  async loadFamily(family: string, styles: ('normal' | 'italic')[] = ['normal', 'italic']): Promise<FaceRecord[]> {
    const fam = this.manifestFamily(family);
    if (!fam) return [];
    const [name, entry] = fam;
    const files = entry.files.filter(f => styles.includes(f.style));
    const recs = await Promise.all(files.map(f => this.loadManifestFile(name, entry, f)));
    return recs.filter((r): r is FaceRecord => !!r);
  }

  private manifestFamily(family: string): [string, ManifestFamily] | undefined {
    const want = family.replace(/["']/g, '').trim().toLowerCase();
    for (const [k, v] of Object.entries(this.manifest.families)) if (k.toLowerCase() === want) return [k, v];
    return undefined;
  }

  private loadManifestFile(family: string, entry: ManifestFamily, f: ManifestFile): Promise<FaceRecord | null> {
    const url = this.manifest.base + entry.dir + '/' + f.file.replace(/\[/g, '%5B').replace(/\]/g, '%5D');
    const existing = this.faces.find(r => r.url === url);
    if (existing) return Promise.resolve(existing);
    let p = this.inflight.get(url);
    if (!p) {
      p = (async () => {
        try {
          const bytes = await this.fetchBytes(url, f.file);
          return this.register(bytes, { family, style: f.style, source: 'manifest', url, file: f.file });
        } catch (e) {
          console.warn('[text] font load failed', url, e);
          return null;
        }
      })();
      this.inflight.set(url, p);
    }
    return p;
  }

  /** Register uploaded bytes (TTF/OTF/TTC/WOFF). Every face of a collection is registered. */
  async addFontBytes(raw: Uint8Array, opts: { family?: string; style?: 'normal' | 'italic'; source?: 'upload' | 'bytes'; file?: string } = {}): Promise<FaceRecord[]> {
    const bytes = toSfnt(raw);
    const first = this.register(bytes, { family: opts.family, style: opts.style, source: opts.source ?? 'upload', file: opts.file });
    const out = [first];
    for (let i = 1; i < first.info.faces; i++) out.push(this.register(bytes, { family: opts.family, style: opts.style, source: opts.source ?? 'upload', file: opts.file, index: i, blob: first.blob }));
    return out;
  }

  private register(bytes: Uint8Array, o: { family?: string; style?: 'normal' | 'italic'; source: FaceRecord['source']; url?: string; file?: string; index?: number; blob?: number }): FaceRecord {
    const blob = o.blob ?? this.engine.loadFont(bytes);
    const index = o.index ?? 0;
    const info = this.engine.fontInfo(blob, index);
    const wght = info.axes.find(a => a.tag === 'wght');
    const ital = info.axes.find(a => a.tag === 'ital');
    const style = o.style ?? (info.italic || (ital && ital.default >= 1) ? 'italic' : 'normal');
    const family = o.family ?? info.family;
    const rec: FaceRecord = {
      key: `${family}|${style}|${o.file ?? info.postscriptName}|${index}`,
      family, style,
      weightRange: wght ? [wght.min, wght.max] : [info.weight, info.weight],
      blob, index, info, source: o.source, url: o.url, file: o.file, bytes,
    };
    this.faces.push(rec);
    this.generation++;
    if (this.opts.registerDom !== false) this.registerDomFace(rec);
    return rec;
  }

  /** Register the engine's bytes as a DOM FontFace so DOM text matches engine metrics. */
  private registerDomFace(rec: FaceRecord) {
    if (typeof document === 'undefined' || typeof FontFace === 'undefined') return;
    try {
      rec.cssFamily = `PlajahText-${++this.cssCounter}-${rec.family.replace(/[^A-Za-z0-9]/g, '')}`;
      const weight = rec.weightRange[0] === rec.weightRange[1] ? String(rec.weightRange[0]) : `${rec.weightRange[0]} ${rec.weightRange[1]}`;
      const ff = new FontFace(rec.cssFamily, rec.bytes.slice().buffer, { style: rec.style, weight });
      (document.fonts as unknown as { add(f: FontFace): void }).add(ff);
      void ff.load().catch(() => undefined);
    } catch { rec.cssFamily = undefined; }
  }

  /** Best face for a request (CSS matching). Null when the family is not loaded. */
  matchFace(req: FontRequest): FaceRecord | null {
    const fam = req.family.replace(/["']/g, '').trim().toLowerCase();
    const cands = this.faces.filter(f => f.family.toLowerCase() === fam);
    if (!cands.length) return null;
    const style = req.style ?? 'normal';
    const sameStyle = cands.filter(f => f.style === style);
    const pool = sameStyle.length ? sameStyle : cands;
    const weight = req.weight ?? 400;
    return pool.slice().sort((a, b) => weightDistance(weight, a.weightRange) - weightDistance(weight, b.weightRange))[0];
  }

  /** Engine instance for a request at a size (px). Synchronous: the family must be loaded. */
  resolve(req: FontRequest, size = 16): number | null {
    const face = this.matchFace(req);
    if (!face) return null;
    const axes: Record<string, number> = {};
    const tags = new Set(face.info.axes.map(a => a.tag));
    if (tags.has('wght')) axes.wght = req.weight ?? 400;
    if (tags.has('wdth') && req.stretch) axes.wdth = req.stretch;
    if (tags.has('ital') && req.style === 'italic' && face.style !== 'italic') axes.ital = 1;
    if (tags.has('slnt') && req.style === 'italic' && face.style !== 'italic') { const s = face.info.axes.find(a => a.tag === 'slnt')!; axes.slnt = s.min; }
    if (tags.has('opsz')) {
      const os = req.opticalSize ?? 'auto';
      if (os === 'auto') axes.opsz = size;
      else if (typeof os === 'number') axes.opsz = os;
    }
    for (const [t, v] of Object.entries(req.axes ?? {})) if (tags.has(t)) axes[t] = v;
    // Quantise so near-identical requests share an instance (opsz to 0.5, others to 1).
    for (const t of Object.keys(axes)) axes[t] = t === 'opsz' ? Math.round(axes[t] * 2) / 2 : Math.round(axes[t]);
    const k = face.key + JSON.stringify(Object.entries(axes).sort());
    let inst = this.instances.get(k);
    if (inst === undefined) {
      inst = this.engine.createInstance(face.blob, face.index, axes);
      this.instances.set(k, inst);
      this.instanceFace.set(inst, face);
    }
    return inst;
  }

  faceOf(inst: number): FaceRecord | undefined { return this.instanceFace.get(inst); }

  /** Loaded fallback instances for the scripts in `text` (primary excluded). */
  fallbackChain(text: string, req: FontRequest, size: number, serif = false): number[] {
    const out: number[] = [];
    for (const s of scriptsIn(text)) {
      const fams = SCRIPT_FALLBACKS[s]?.[serif ? 'serif' : 'sans'] ?? [];
      for (const fam of fams) {
        const inst = this.resolve({ ...req, family: fam, axes: undefined, opticalSize: 'auto' }, size);
        if (inst !== null && !out.includes(inst)) out.push(inst);
      }
    }
    return out;
  }

  /** Load the primary family plus any script fallbacks `text` needs. */
  async ensure(families: Iterable<string>, text = '', serif = false): Promise<void> {
    const want = new Set<string>();
    for (const f of families) want.add(f);
    for (const s of scriptsIn(text)) {
      if (s === 'Latn') continue;
      const fams = SCRIPT_FALLBACKS[s]?.[serif ? 'serif' : 'sans'] ?? [];
      if (fams[0]) want.add(fams[0]);
    }
    await Promise.all([...want].filter(f => !this.hasFamily(f)).map(f => this.loadFamily(f)));
  }

  /** CSS font-family for DOM text that must match engine metrics. */
  cssFamily(req: FontRequest): string | undefined { return this.matchFace(req)?.cssFamily; }
}
