/**
 * sceneModel.ts — a 3D scene from words or a picture, in real metres.
 *
 * Whatever it starts from, a scene is objects with a size, a place and a mesh, standing on a ground. Because the
 * vocabulary knows real sizes, a chair comes out chair-sized beside a table. layoutScene places things by the
 * relations in the words, and checkScene then holds the result to common sense: nothing floating, nothing inside
 * anything else, nothing the wrong size. settleScene fixes what it can.
 */

import { compileRecipe, recipeDistance, type ClayPart } from '../bake';
import { surfaceNets, type SurfaceMesh } from '../surfaceNets';
import { buildAnatomy } from '../creature/anatomy';
import { CODEX_BY_ID } from '../creature/codex';
import type { Vec3 } from '../engine';
import { ObjectPrior, priorFromWords, VOCABULARY } from '../understand/vocabulary';

export interface SceneObject {
  id: string;
  label: string;
  prior: ObjectPrior | null;
  /** Width, height, depth in metres. */
  size: Vec3;
  /** Middle of its footprint, on whatever it stands on. */
  position: Vec3;
  rotationY: number;
  color: string;
  /** Standing on another object rather than the ground. */
  on?: string;
  /** What it's made from, part by part. The ids match its finished triangles. */
  parts?: { id: number; name: string; material: string; behaviour: string; evidence: string }[];
  mesh?: SurfaceMesh;
  /** Where each vertex lands on the scene's picture, when built from one. */
  uvs?: Float32Array;
}

export interface Backdrop {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

export interface SceneCheck { id: string; label: string; pass: boolean; detail: string }

export interface Scene {
  title: string;
  objects: SceneObject[];
  /** Metres across the ground. */
  extent: number;
  groundColor: string;
  /** A picture scene keeps what it couldn't separate as a displaced backdrop. */
  backdrop?: Backdrop;
  /** Blob URL of the source picture. */
  pictureUrl?: string;
  checks: SceneCheck[];
  corrections: string[];
  source: string;
}

export interface SceneRequest { label: string; count: number; color?: string; on?: string; beside?: string; words: string }

const COLORS: Record<string, string> = {
  red: '#a8332c', orange: '#c56a26', yellow: '#cfa52e', green: '#4c7a3d', blue: '#30557f', purple: '#5f3d80', pink: '#c77c97',
  black: '#26252a', white: '#d9d6cf', grey: '#85837f', gray: '#85837f', brown: '#6b4a2f', wooden: '#7d5a38', wood: '#7d5a38',
  stone: '#7f7c74', metal: '#8d9299', golden: '#b8933a', gold: '#b8933a', silver: '#b5b9bf', dark: '#37343a',
};
const DEFAULT_COLOR: Record<string, string> = {
  round: '#a58c6c', slab: '#7d6a55', sheet: '#9a9488', mirrored: '#6f7379', organic: '#8a8074', figure: '#8d7a68', branching: '#4d6b3c',
};
const COUNTS: Record<string, number> = { a: 1, an: 1, one: 1, the: 1, two: 2, three: 3, four: 4, five: 5, six: 6, couple: 2, pair: 2, several: 3, few: 3 };
const GROUND: [RegExp, string][] = [[/\b(forest|garden|park|field|meadow|lawn|graveyard|cemetery)\b/i, '#3f5230'], [/\b(desert|beach|sand)\b/i, '#b39a6c'], [/\b(snow|ice|winter)\b/i, '#c9d1d6'], [/\b(street|city|road|parking)\b/i, '#3c3c40'], [/\b(room|kitchen|bedroom|office|hall|library|studio|cabin|church|house)\b/i, '#5e4c3b']];

/** Reads a description without any model: what's in it, how many, and what stands on or beside what. */
export function parsePrompt(text: string): SceneRequest[] {
  const clean = text.toLowerCase().replace(/[^a-z' ,.-]+/g, ' ');
  const labels = [...VOCABULARY].sort((a, b) => b.label.length - a.label.length);
  const found: { at: number; end: number; prior: ObjectPrior }[] = [];
  for (const prior of labels) {
    const re = new RegExp(`\\b${prior.label.replace(/ /g, ' ')}(s|es)?\\b`, 'g');
    for (const hit of clean.matchAll(re)) {
      const at = hit.index ?? 0, end = at + hit[0].length;
      if (!found.some((f) => at < f.end && f.at < end)) found.push({ at, end, prior });
    }
  }
  found.sort((a, b) => a.at - b.at);
  const out: SceneRequest[] = [];
  found.forEach((f, i) => {
    const before = clean.slice(i ? found[i - 1].end : 0, f.at).trim().split(/\s+/).filter(Boolean);
    const words = before.slice(-4);
    let count = 1;
    for (const w of words) if (COUNTS[w] && (COUNTS[w] > 1 || count === 1)) count = COUNTS[w];
    if (clean.slice(f.at, f.end).match(/s$/) && count === 1 && !f.prior.label.endsWith('s')) count = 2;
    const color = words.find((w) => COLORS[w]);
    const req: SceneRequest = { label: f.prior.label, count: Math.min(count, 8), color: color ? COLORS[color] : undefined, words: words.join(' ') };
    const between = i ? clean.slice(found[i - 1].end, f.at) : '';
    // "A lamp on a table": the thing named first stands on the thing named after it.
    if (/\b(on|on top of|upon|atop)\b/.test(between) && !/\b(on|upon|atop)\s+(it|top|that)\b/.test(between) && i > 0) out[out.length - 1].on = f.prior.label;
    else if (/\b(next to|beside|by|near)\b/.test(between) && i > 0) out[out.length - 1].beside = f.prior.label;
    // "A table with a lamp on it": here the thing it stands on was named first.
    const after = clean.slice(f.end, found[i + 1]?.at ?? clean.length);
    if (i > 0 && /^\s*(on|on top of|upon|atop)\s+(it|top|that)\b/.test(after)) req.on = found[i - 1].prior.label;
    out.push(req);
  });
  return out;
}

const SYSTEM = (names: string) => `You turn a scene description into a list of objects. Reply with JSON only:
{"objects":[{"label":"table","count":1,"on":null,"beside":null,"color":null}]}
"label" must be one of: ${names}. Use the nearest one. "on" and "beside" name another label in the list or are null.
"color" is a word like red or wooden, or null. List every object a person would expect in this scene, 3 to 12 kinds.`;

/** A model's answer is untrusted text: keep only what names something real. */
export function parseSceneAnswer(text: string): SceneRequest[] | null {
  const open = text.indexOf('{'), close = text.lastIndexOf('}');
  if (open < 0 || close <= open) return null;
  let raw: any;
  try { raw = JSON.parse(text.slice(open, close + 1)); } catch { return null; }
  if (!Array.isArray(raw?.objects)) return null;
  const known = new Set(VOCABULARY.map((p) => p.label));
  const out: SceneRequest[] = [];
  for (const o of raw.objects.slice(0, 16)) {
    const label = String(o?.label ?? '').toLowerCase();
    const prior = known.has(label) ? label : priorFromWords(label)?.label;
    if (!prior) continue;
    const color = String(o?.color ?? '').toLowerCase();
    out.push({
      label: prior, count: Math.max(1, Math.min(8, Math.round(Number(o?.count) || 1))), color: COLORS[color],
      on: o?.on && known.has(String(o.on).toLowerCase()) ? String(o.on).toLowerCase() : undefined,
      beside: o?.beside && known.has(String(o.beside).toLowerCase()) ? String(o.beside).toLowerCase() : undefined, words: '',
    });
  }
  return out.length ? out : null;
}

export const sceneSystemPrompt = () => SYSTEM(VOCABULARY.map((p) => p.label).join(', '));

/** Puts things on the ground in a loose arc facing the viewer, biggest behind, with what stands on what on top. */
export function layoutScene(requests: SceneRequest[], title: string): Scene {
  const byLabel = new Map(VOCABULARY.map((p) => [p.label, p]));
  const objects: SceneObject[] = [];
  requests.forEach((req) => {
    const prior = byLabel.get(req.label) ?? null;
    for (let n = 0; n < req.count; n++) {
      const size: Vec3 = prior ? [...prior.size] : [1, 1, 1];
      objects.push({ id: `${req.label}-${objects.length}`, label: req.label, prior, size, position: [0, 0, 0], rotationY: 0, color: req.color ?? DEFAULT_COLOR[prior?.structure ?? 'organic'], on: req.on });
    }
  });
  const standing = objects.filter((o) => !o.on || !objects.some((p) => p.label === o.on));
  standing.forEach((o) => { o.on = undefined; });
  const ordered = [...standing].sort((a, b) => b.size[1] - a.size[1]);
  // Rows back to front. Each row is spaced by what's actually in it.
  const gap = (o: SceneObject) => Math.max(o.size[0], o.size[2]) * 0.6 + 0.3;
  let z = 0, i = 0;
  const rowLimit = Math.max(4, Math.ceil(Math.sqrt(ordered.length) + 1));
  while (i < ordered.length) {
    const row = ordered.slice(i, i + rowLimit);
    const total = row.reduce((sum, o) => sum + gap(o) * 2, 0);
    let x = -total / 2;
    for (const o of row) {
      x += gap(o);
      o.position = [x, 0, z];
      o.rotationY = Math.atan2(-x, 6) * 0.35;
      x += gap(o);
    }
    z += Math.max(...row.map((o) => o.size[2])) + 1;
    i += row.length;
  }
  // Rows run front to back from the first: shift so the middle row is at the origin.
  const mid = z / 2;
  for (const o of ordered) o.position[2] -= mid;
  // Things "on" something share its top, spread across it.
  for (const o of objects) {
    if (!o.on) continue;
    const support = objects.find((p) => p.label === o.on && !p.on);
    if (!support) continue;
    const peers = objects.filter((p) => p.on === o.on);
    const slot = peers.indexOf(o) - (peers.length - 1) / 2;
    o.position = [support.position[0] + slot * Math.min(support.size[0] / Math.max(peers.length, 1), o.size[0] * 1.3), support.size[1], support.position[2]];
  }
  const reach = objects.reduce((max, o) => Math.max(max, Math.hypot(o.position[0], o.position[2]) + Math.max(o.size[0], o.size[2])), 3);
  const ground = GROUND.find(([re]) => re.test(title))?.[1] ?? '#3b3a40';
  return { title, objects, extent: reach * 2.6, groundColor: ground, checks: [], corrections: [], source: 'words' };
}

const footprint = (o: SceneObject) => Math.max(o.size[0], o.size[2]) / 2;

/** Common sense, measured. */
export function checkScene(scene: Scene): SceneCheck[] {
  const { objects } = scene;
  const standingOn = (o: SceneObject) => (o.on ? objects.find((p) => p.label === o.on && !p.on) : null);
  let floating = 0, sunk = 0, overlaps = 0, unbalanced = 0, tooBig = 0;
  for (const o of objects) {
    const support = standingOn(o);
    const base = support ? support.position[1] + support.size[1] : 0;
    if (o.position[1] > base + 0.02) floating++;
    if (o.position[1] < base - 0.02) sunk++;
    if (support) {
      if (Math.abs(o.position[0] - support.position[0]) > support.size[0] / 2 || Math.abs(o.position[2] - support.position[2]) > support.size[2] / 2) unbalanced++;
      if (o.size[0] * o.size[2] > support.size[0] * support.size[2] * 1.05) tooBig++;
    }
  }
  const ground = objects.filter((o) => !o.on);
  for (let a = 0; a < ground.length; a++) for (let b = a + 1; b < ground.length; b++) {
    if (Math.hypot(ground[a].position[0] - ground[b].position[0], ground[a].position[2] - ground[b].position[2]) < (footprint(ground[a]) + footprint(ground[b])) * 0.8) overlaps++;
  }
  return [
    { id: 'count', label: 'Everything named is in the scene', pass: objects.length > 0, detail: `${objects.length} objects` },
    { id: 'float', label: 'Nothing floats', pass: floating === 0, detail: floating ? `${floating} off the ground` : 'all standing on something' },
    { id: 'sink', label: 'Nothing sinks through what holds it', pass: sunk === 0, detail: sunk ? `${sunk} below their support` : 'all on top' },
    { id: 'overlap', label: 'Nothing stands inside anything else', pass: overlaps === 0, detail: overlaps ? `${overlaps} overlapping pairs` : 'clear of each other' },
    { id: 'support', label: 'What stands on something fits on it', pass: unbalanced + tooBig === 0, detail: unbalanced + tooBig ? `${unbalanced} off the edge, ${tooBig} too big for their support` : 'all supported' },
  ];
}

/** Fixes what it can by moving things, and says so. */
export function settleScene(scene: Scene): Scene {
  const corrections = [...scene.corrections];
  const { objects } = scene;
  for (let pass = 0; pass < 12; pass++) {
    let moved = false;
    const ground = objects.filter((o) => !o.on);
    for (let a = 0; a < ground.length; a++) for (let b = a + 1; b < ground.length; b++) {
      const p = ground[a].position, q = ground[b].position;
      // Two things in exactly the same place have no direction apart, so they're given one.
      const same = Math.hypot(q[0] - p[0], q[2] - p[2]) < 1e-4;
      const dx = same ? 1e-3 : q[0] - p[0], dz = same ? 0 : q[2] - p[2];
      const d = Math.hypot(dx, dz);
      const want = (footprint(ground[a]) + footprint(ground[b])) * 0.85;
      if (d < want) {
        const push = (want - d) / 2 + 0.01;
        p[0] -= (dx / d) * push; p[2] -= (dz / d) * push;
        q[0] += (dx / d) * push; q[2] += (dz / d) * push;
        moved = true;
      }
    }
    if (!moved) break;
    if (pass === 0) corrections.push('Some things stood inside each other: moved them apart.');
  }
  for (const o of objects) {
    const support = o.on ? objects.find((p) => p.label === o.on && !p.on) : null;
    const want = support ? support.position[1] + support.size[1] : 0;
    if (Math.abs(o.position[1] - want) > 0.02) { corrections.push(`Set the ${o.label} down on ${support ? `the ${support.label}` : 'the ground'}.`); o.position[1] = want; }
    if (support) {
      const hx = support.size[0] / 2 * 0.85, hz = support.size[2] / 2 * 0.85;
      o.position[0] = Math.max(support.position[0] - hx, Math.min(support.position[0] + hx, o.position[0]));
      o.position[2] = Math.max(support.position[2] - hz, Math.min(support.position[2] + hz, o.position[2]));
      if (o.size[0] * o.size[2] > support.size[0] * support.size[2] * 1.05) {
        corrections.push(`The ${o.label} was bigger than the ${support.label} under it: moved it to the ground.`);
        o.on = undefined;
        o.position = [support.position[0] + support.size[0] + footprint(o), 0, support.position[2]];
      }
    }
  }
  const settled = { ...scene, corrections: [...new Set(corrections)] };
  return { ...settled, checks: checkScene(settled) };
}

// ---- Block-out geometry ----------------------------------------------------------------------------

const add = (a: Vec3, ra: number, b?: Vec3, rb?: number, blend = 0.015): ClayPart => ({ op: 'add', a, ra, b, rb, blend });

/** Named shapes for the things people ask for most, in a unit box: x and z in -0.5..0.5, y in 0..1. */
function archetype(prior: ObjectPrior): ClayPart[] {
  const l = prior.label;
  const legs = (x: number, z: number, top: number, r = 0.035) => [[x, z], [-x, z], [x, -z], [-x, -z]].map(([a, b]) => add([a, 0.02, b], r, [a, top, b], r, 0.004));
  const slabTop = (y: number, x: number, z: number, t: number) => {
    const out: ClayPart[] = [];
    // Rows close enough to merge into one flat surface: a round part can't be a slab by itself.
    const n = Math.max(3, Math.ceil((z * 2) / Math.max(t, 0.01)) + 1);
    for (let i = 0; i < n; i++) out.push(add([-x, y, (i / (n - 1) - 0.5) * 2 * z], t, [x, y, (i / (n - 1) - 0.5) * 2 * z], t, t));
    return out;
  };
  if (/table|desk/.test(l)) return [...slabTop(0.95, 0.46, 0.44, 0.04), ...legs(0.42, 0.4, 0.92, 0.035)];
  if (/stool/.test(l)) return [add([0, 0.95, 0], 0.32, undefined, undefined), ...legs(0.28, 0.28, 0.9, 0.05)];
  if (/throne|armchair|chair/.test(l)) return [...slabTop(0.52, 0.42, 0.42, 0.05), ...legs(0.38, 0.38, 0.5, 0.04), ...slabTop(0.97, 0.42, 0.04, 0.05).map((p) => ({ ...p, a: [p.a[0], p.a[1], -0.42] as Vec3, b: [p.b![0], p.b![1], -0.42] as Vec3 })), add([-0.38, 0.5, -0.42], 0.05, [-0.38, 0.97, -0.42], 0.05, 0.01), add([0.38, 0.5, -0.42], 0.05, [0.38, 0.97, -0.42], 0.05, 0.01)];
  if (/sofa|bench/.test(l)) return [...slabTop(0.42, 0.44, 0.4, 0.09), add([-0.44, 0.45, -0.38], 0.09, [0.44, 0.45, -0.38], 0.09), add([-0.44, 0.95, -0.38], 0.08, [0.44, 0.95, -0.38], 0.08), add([-0.46, 0.2, 0], 0.05, [-0.46, 0.65, 0], 0.05), add([0.46, 0.2, 0], 0.05, [0.46, 0.65, 0], 0.05)];
  if (/\bbed\b/.test(l)) return [...slabTop(0.45, 0.46, 0.46, 0.13), add([-0.46, 0.95, -0.47], 0.04, [0.46, 0.95, -0.47], 0.04), ...legs(0.42, 0.42, 0.3)];
  if (/lamp|lantern/.test(l)) return [add([0, 0.02, 0], 0.2, [0, 0.05, 0], 0.2), add([0, 0.05, 0], 0.03, [0, 0.72, 0], 0.03), add([0, 0.72, 0], 0.38, [0, 0.98, 0], 0.2, 0.01)];
  if (/pine/.test(l)) return [add([0, 0, 0], 0.08, [0, 0.3, 0], 0.06), add([0, 0.2, 0], 0.45, [0, 0.5, 0], 0.26, 0.02), add([0, 0.45, 0], 0.33, [0, 0.75, 0], 0.15, 0.02), add([0, 0.68, 0], 0.2, [0, 0.99, 0], 0.01, 0.02)];
  if (/palm/.test(l)) return [add([0, 0, 0], 0.07, [0.05, 0.85, 0], 0.035), ...[[0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.45], [0.32, 0.32], [-0.32, -0.32]].map(([x, z]) => add([0.05, 0.85, 0], 0.05, [x, 0.72, z], 0.005, 0.01))];
  if (/tree|bonsai/.test(l)) return [add([0, 0, 0], 0.1, [0, 0.45, 0], 0.07), add([0, 0.65, 0], 0.32, undefined, undefined, 0.08), add([0.22, 0.56, 0.08], 0.2, undefined, undefined, 0.08), add([-0.2, 0.58, -0.1], 0.22, undefined, undefined, 0.08), add([0.02, 0.82, 0.05], 0.17, undefined, undefined, 0.08)];
  if (/bush|cloud|coral/.test(l)) return [add([0, 0.42, 0], 0.4, undefined, undefined, 0.08), add([0.25, 0.32, 0.1], 0.25, undefined, undefined, 0.08), add([-0.22, 0.35, -0.1], 0.27, undefined, undefined, 0.08)];
  if (/\b(car|sports car|van|pickup truck|truck|bus|tractor|early automobile|tank vehicle)\b/.test(l)) {
    // Length runs along x, as in the vocabulary's sizes. The unit box gets stretched to real size, so wheels and cabin
    // are drawn thin along x here.
    const body = [-0.3, -0.15, 0, 0.15, 0.3].flatMap((z) => [add([-0.46, 0.34, z], 0.13, [0.46, 0.34, z], 0.13, 0.06)]);
    const cabin = [-0.24, -0.08, 0.08, 0.24].flatMap((z) => [add([-0.26, 0.62, z], 0.11, [0.14, 0.62, z], 0.11, 0.05)]);
    const wheels = [[-0.3, 0.42], [0.3, 0.42], [-0.3, -0.42], [0.3, -0.42]].map(([x, z]) => add([x, 0.13, z * 0.9], 0.13, [x, 0.13, z * 1.15], 0.13, 0.002));
    return [...body, ...cabin, ...wheels];
  }
  if (/guitar|violin/.test(l)) return [add([0, 0.15, 0], 0.28, undefined, undefined, 0.05), add([0, 0.38, 0], 0.2, undefined, undefined, 0.05), add([0, 0.45, 0], 0.05, [0, 0.95, 0], 0.035)];
  if (/house|church|castle|building|skyscraper/.test(l)) return [...slabTop(0.35, 0.46, 0.44, 0.3).map((p) => ({ ...p, blend: 0.01 })), add([-0.46, 0.68, 0], 0.04, [0.46, 0.68, 0], 0.04), add([-0.46, 0.68, -0.25], 0.15, [0.46, 0.68, -0.25], 0.15, 0.01), add([-0.46, 0.68, 0.25], 0.15, [0.46, 0.68, 0.25], 0.15, 0.01), add([-0.46, 0.84, 0], 0.08, [0.46, 0.84, 0], 0.08)];
  if (/mushroom/.test(l)) return [add([0, 0, 0], 0.13, [0, 0.55, 0], 0.09), add([0, 0.72, 0], 0.42, [0, 0.8, 0], 0.2, 0.03)];
  if (/cactus/.test(l)) return [add([0, 0, 0], 0.16, [0, 0.95, 0], 0.13), add([0.28, 0.45, 0], 0.08, [0.3, 0.72, 0], 0.07), add([0, 0.42, 0], 0.08, [0.28, 0.45, 0], 0.08), add([-0.28, 0.55, 0], 0.07, [-0.3, 0.8, 0], 0.06), add([0, 0.52, 0], 0.07, [-0.28, 0.55, 0], 0.07)];
  switch (prior.structure) {
    case 'round': return [add([0, 0.08, 0], 0.42, [0, 0.55, 0], 0.46, 0.03), add([0, 0.55, 0], 0.46, [0, 0.82, 0], 0.26, 0.04), add([0, 0.82, 0], 0.22, [0, 0.97, 0], 0.26, 0.02)];
    case 'slab': case 'sheet': return slabTop(0.5, 0.42, 0.34, 0.42).map((p) => ({ ...p, ra: 0.42, rb: 0.42 }));
    case 'branching': return [add([0, 0, 0], 0.07, [0, 0.5, 0], 0.05), add([0, 0.65, 0], 0.32, undefined, undefined, 0.06)];
    case 'organic': return [add([0, 0.42, 0], 0.42, undefined, undefined, 0.08), add([0.12, 0.3, 0.1], 0.28, undefined, undefined, 0.08)];
    default: return [add([0, 0.3, 0], 0.32, [0, 0.72, 0], 0.26, 0.06)];
  }
}

/** A mesh for an object from its words alone, sized in metres with its feet at y = 0. */
export function blockoutMesh(object: SceneObject): SurfaceMesh | null {
  if (!object.prior) return null;
  const plan = object.prior.plan && CODEX_BY_ID[object.prior.plan];
  const parts = plan ? buildAnatomy(plan.tune).parts : archetype(object.prior);
  const prims = compileRecipe(parts);
  const resolution = 72;
  const lo = plan ? -1 : -0.75, span = plan ? 2 : 1.75;
  const toWorld = (v: number) => lo + (v / resolution) * span;
  const blocks: [number, number, number][] = [];
  const blockSize = 8;
  const cell = (blockSize / resolution) * span;
  for (let z = 0; z < resolution; z += blockSize) for (let y = 0; y < resolution; y += blockSize) for (let x = 0; x < resolution; x += blockSize) {
    const mid = (v: number) => toWorld(v + blockSize / 2);
    if (Math.abs(recipeDistance(prims, mid(x), mid(y), mid(z))) < cell * 1.2) blocks.push([x, y, z]);
  }
  const mesh = surfaceNets({ resolution, blockSize, blocks, sample: (x, y, z) => recipeDistance(prims, toWorld(x), toWorld(y), toWorld(z)), toWorld });
  if (!mesh.indices.length) return null;
  // Fit it to the object's real size, feet on the ground.
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < mesh.positions.length; v += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], mesh.positions[v + k]); max[k] = Math.max(max[k], mesh.positions[v + k]); }
  for (let v = 0; v < mesh.positions.length; v += 3) {
    mesh.positions[v] = ((mesh.positions[v] - (min[0] + max[0]) / 2) / Math.max(max[0] - min[0], 1e-4)) * object.size[0];
    mesh.positions[v + 1] = ((mesh.positions[v + 1] - min[1]) / Math.max(max[1] - min[1], 1e-4)) * object.size[1];
    mesh.positions[v + 2] = ((mesh.positions[v + 2] - (min[2] + max[2]) / 2) / Math.max(max[2] - min[2], 1e-4)) * object.size[2];
  }
  return mesh;
}
