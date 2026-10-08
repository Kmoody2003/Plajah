// shaderLookSchema — the contract for a ShaderLook, and the ONE validator every look passes through
// before it can render, be saved, or be shown as a council proposal.
//
// Grounded in shaderCatalog.generated.ts (generated from the installed `shaders` package's own registry),
// so a look can only name components and props the library really has, with the library's own ranges.
// Anything a model invents is dropped or clamped, and every drop/clamp is reported in `issues` so the
// council can be asked to repair it. The validator never throws on bad input.
//
// Hard policy, enforced here rather than trusted to a prompt:
//  - NO network or device input from a look: WebcamTexture / VideoTexture / HTMLInCanvas / Text (fetches
//    Google fonts) are denied, and ImageTexture is allowed ONLY with url === '$cover' (the playing track's
//    own art, resolved by the host). Its default url points at shaders.com — it must never be reachable.
//  - NO pointer-only components (a visualizer has no cursor): they would render as nothing.
//  - fallbackCss is always DERIVED from the look's own colours — never accepted from input — so it can
//    carry no url() or CSS injection.
//  - A GPU budget (node count, depth, weighted cost) keeps council output inside what an Arc iGPU can hold.

import { SHADER_CATALOG, type CatalogEntry } from './shaderCatalog.generated';
import { AUDIO_FEATURES, type AudioFeature, type ShaderLook, type ShaderNode, type ShaderDrive } from './shaderLooks';

export const COUNCIL_DIRECTOR_LOOK_IDS = ['CLASSICAL', 'REBEL', 'FUTURIST', 'WORLD_ECLECTIC', 'BAROQUE', 'RADICAL_MINIMAL'] as const;

/** Categories a council look may draw from (verified to paint on their own at defaults, or to filter a child). */
const ALLOWED_CATEGORIES = new Set(['Textures', 'Stylize', 'Adjustments', 'Distortions', 'Blurs']);
/** Autonomous simulations from the otherwise pointer-driven "Interactive" category. */
const ALLOWED_EXTRA = new Set(['Boids', 'ReactionDiffusion', 'Smoke', 'Fog']);
/** Denied even though their category is allowed: external input, network fetches, or no-op without a host. */
const DENIED = new Set([
  'WebcamTexture', 'VideoTexture', 'HTMLInCanvas', 'Text', 'ObjectTracker', 'KeyFrames', 'ImageTexture',
  'StudioBackground', 'Form3D', 'Surface3D', 'ParticleField', 'TimeTrail', 'ReflectivePlane', 'DropShadow',
]);
/** ImageTexture is the one denied entry with a controlled way back in. */
export const COVER_TOKEN = '$cover';

/** Rendered BLANK over an image-based child in the 2026-10-07 spike (shaders@4.0.0, in-app browser — frame-throttled,
 *  so possibly a throttling artifact). Kept out of council looks until confirmed on a visible tab; every other
 *  cover effect used by a house look (Halftone, Watercolor, Kaleidoscope, Dither, Pixelate, GlassTiles, Glitch) was seen rendering. */
const BLANK_OVER_IMAGE = new Set(['FlutedGlass', 'VHS']);
const hasImage = (n: unknown): boolean => isObj(n) && (n.type === 'ImageTexture' || (Array.isArray(n.children) && n.children.some(hasImage)));

export const LOOK_LIMITS = { maxNodes: 10, maxDepth: 4, maxCost: 10, maxDrivesPerNode: 3 } as const;
const COST: Record<string, number> = { Boids: 4, ReactionDiffusion: 4, Smoke: 4, Fog: 2, Aurora: 2, Godrays: 2, Marble: 1, Nebula: 2 };

export function isCouncilComponent(name: string): boolean {
  const e = SHADER_CATALOG[name];
  if (!e || DENIED.has(name)) return false;
  return ALLOWED_CATEGORIES.has(e.c) || ALLOWED_EXTRA.has(name);
}
/** Components the council may use, as [name, entry] — what the prompt digest is built from. */
export function councilCatalog(): [string, CatalogEntry][] {
  return Object.entries(SHADER_CATALOG).filter(([n]) => isCouncilComponent(n));
}

export interface LookValidation { look: ShaderLook | null; issues: string[] }

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'look';
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function validateLook(raw: unknown): LookValidation {
  const issues: string[] = [];
  if (!isObj(raw)) return { look: null, issues: ['look is not an object'] };

  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 48) : 'Untitled Look';
  const director = (COUNCIL_DIRECTOR_LOOK_IDS as readonly string[]).includes(raw.director as string) ? String(raw.director) : undefined;
  const rootIn = Array.isArray(raw.root) ? raw.root : isObj(raw.root) ? [raw.root] : null;
  if (!rootIn) return { look: null, issues: ['look has no root nodes'] };

  let nodes = 0, cost = 0, paints = false, usesCover = false;
  const colors: string[] = [];

  const clean = (n: unknown, depth: number, where: string): ShaderNode | null => {
    if (!isObj(n)) { issues.push(`${where}: node is not an object`); return null; }
    const type = typeof n.type === 'string' ? n.type : '';
    const props0 = isObj(n.props) ? n.props : {};
    const isCover = type === 'ImageTexture' && props0.url === COVER_TOKEN;
    if (!isCover && !isCouncilComponent(type)) {
      issues.push(`${where}: "${type}" is not an available component${type === 'ImageTexture' ? ' (ImageTexture only with url "$cover")' : ''}`);
      return null;
    }
    if (BLANK_OVER_IMAGE.has(type) && Array.isArray(n.children) && n.children.some(hasImage)) {
      issues.push(`${where}: "${type}" over the cover renders blank — use Halftone, Watercolor, Kaleidoscope, Dither, Pixelate, GlassTiles or Glitch`);
      return null;
    }
    if (depth > LOOK_LIMITS.maxDepth) { issues.push(`${where}: nested deeper than ${LOOK_LIMITS.maxDepth}`); return null; }
    if (nodes >= LOOK_LIMITS.maxNodes) { issues.push(`${where}: more than ${LOOK_LIMITS.maxNodes} nodes`); return null; }
    const c = cost + (COST[type] ?? 1);
    if (c > LOOK_LIMITS.maxCost) { issues.push(`${where}: "${type}" exceeds the GPU budget`); return null; }
    nodes++; cost = c;
    const entry = SHADER_CATALOG[type];

    // props
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props0)) {
      if (isCover && k === 'url') { props.url = COVER_TOKEN; continue; }
      const spec = entry.p[k];
      if (!spec) { issues.push(`${where}.${k}: "${type}" has no prop "${k}"`); continue; }
      if (spec.k === 'n') {
        if (typeof v !== 'number' || !Number.isFinite(v)) { issues.push(`${where}.${k}: expected a number`); continue; }
        const lo = spec.min ?? -Infinity, hi = spec.max ?? Infinity;
        const cl = Math.min(hi, Math.max(lo, v));
        if (cl !== v) issues.push(`${where}.${k}: ${v} clamped to ${cl} (range ${lo}..${hi})`);
        props[k] = cl;
      } else if (spec.k === 'c') {
        if (typeof v !== 'string' || !HEX.test(v)) { issues.push(`${where}.${k}: expected a #hex colour`); continue; }
        props[k] = v; colors.push(v);
      } else if (spec.k === 's') {
        if (typeof v !== 'string' || !spec.o?.includes(v)) { issues.push(`${where}.${k}: must be one of ${spec.o?.join('|')}`); continue; }
        props[k] = v;
      } else if (spec.k === 'b') {
        if (typeof v !== 'boolean') { issues.push(`${where}.${k}: expected true/false`); continue; }
        props[k] = v;
      } else issues.push(`${where}.${k}: "${k}" cannot be set from a look`);
    }

    // drives
    const drive: ShaderDrive[] = [];
    const dIn = Array.isArray(n.drive) ? n.drive : [];
    for (const d of dIn.slice(0, LOOK_LIMITS.maxDrivesPerNode)) {
      if (!isObj(d)) continue;
      const spec = entry.p[String(d.prop)];
      if (!spec || spec.k !== 'n' || spec.min === undefined || spec.max === undefined) { issues.push(`${where}: cannot drive "${String(d.prop)}"`); continue; }
      if (!(AUDIO_FEATURES as readonly string[]).includes(d.from as string)) { issues.push(`${where}: unknown audio feature "${String(d.from)}"`); continue; }
      const lo = Math.min(spec.max, Math.max(spec.min, Number(d.min)));
      const hi = Math.min(spec.max, Math.max(spec.min, Number(d.max)));
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) { issues.push(`${where}: drive range for "${String(d.prop)}" is not numeric`); continue; }
      const smooth = d.smooth === undefined ? undefined : Math.min(1, Math.max(0.02, Number(d.smooth) || 0.35));
      drive.push({ prop: String(d.prop), from: d.from as AudioFeature, min: lo, max: hi, ...(smooth !== undefined ? { smooth } : {}) });
    }

    // children
    const kidsIn = Array.isArray(n.children) ? n.children : [];
    let children: ShaderNode[] | undefined;
    if (entry.rc) {
      const kept = kidsIn.map((k, i) => clean(k, depth + 1, `${where}/${i}`)).filter((k): k is ShaderNode => !!k);
      if (!kept.length) { issues.push(`${where}: "${type}" filters its children but has none`); nodes--; cost -= COST[type] ?? 1; return null; }
      children = kept;
    } else {
      if (kidsIn.length) issues.push(`${where}: "${type}" paints on its own — its children were dropped`);
      if (isCover) usesCover = true; else paints = true;
    }
    if (isCover) paints = true;
    return { type, ...(Object.keys(props).length ? { props } : {}), ...(drive.length ? { drive } : {}), ...(children ? { children } : {}) };
  };

  const root = rootIn.map((n, i) => clean(n, 1, `/${i}`)).filter((n): n is ShaderNode => !!n);
  if (!root.length) return { look: null, issues: [...issues, 'nothing renderable survived validation'] };
  if (!paints) return { look: null, issues: [...issues, 'look has no generator — every node only filters'] };

  const look: ShaderLook = {
    id: typeof raw.id === 'string' && raw.id ? slug(raw.id) : slug(name),
    name, ...(director ? { director } : {}),
    fallbackCss: fallbackFromColors(colors),
    ...(usesCover ? { needsCover: true } : {}),
    root,
  };
  return { look, issues };
}

/** Derived, injection-proof fallback gradient from the look's own hex colours. */
export function fallbackFromColors(colors: string[]): string {
  const uniq = [...new Set(colors.map(c => c.toLowerCase()))].slice(0, 4);
  if (uniq.length >= 2) return `linear-gradient(160deg,${uniq.join(',')})`;
  if (uniq.length === 1) return `linear-gradient(160deg,#0b0b12,${uniq[0]})`;
  return 'linear-gradient(160deg,#0b0b12,#2a1b4a)';
}
