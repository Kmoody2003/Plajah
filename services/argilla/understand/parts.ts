/**
 * parts.ts — turns SAM's regions into the named, materialled parts of one subject.
 *
 * SAM finds edges and knows nothing. So: keep its regions that belong to the subject, let the smallest win where they
 * overlap (a badge sits on a shirt), name each from what the vision model sees and what this kind of thing usually has,
 * and record for every part whether its material was seen or only expected. The picture overrules the expectation.
 */

import { Behaviour, MATERIAL_BY_ID } from './materials';
import { KindSheet, SheetLine } from './buildSheets';
import type { LookedPart } from './lookAtParts';

export interface RawRegion { runs: number[]; score: number; stability: number }

export function decodeRuns(runs: number[], width: number, height: number) {
  const out = new Uint8Array(width * height);
  let at = 0, on = 0;
  for (const run of runs) {
    if (on) out.fill(1, at, Math.min(at + run, out.length));
    at += run;
    on ^= 1;
  }
  return out;
}

export interface TidyRegion { id: number; area: number; share: number; score: number; leftover?: boolean; u0: number; v0: number; u1: number; v1: number }
export interface PartMap { width: number; height: number; labels: Uint8Array; regions: TidyRegion[] }

/** A region this much of the subject is the subject, not a part of it. */
const WHOLE_SHARE = 0.9;
/** A region must lie this much on the subject: otherwise it's background reaching over the edge. */
const ON_SUBJECT = 0.8;
const SMALLEST_SHARE = 0.0015;
const SAME_REGION = 0.85;
const MOST_PARTS = 24;

/** The subject's mask, resampled to the size of the part masks. */
export function subjectAt(mask: Float32Array, size: number, width: number, height: number) {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (mask[Math.floor(((y + 0.5) / height) * size) * size + Math.floor(((x + 0.5) / width) * size)] > 0.5) out[x + y * width] = 1;
  }
  return out;
}

export interface Box { u0: number; v0: number; u1: number; v1: number }

/** The subject's mask inside a close-up of the picture. */
export function subjectInBox(mask: Float32Array, size: number, box: Box, width: number, height: number) {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = box.u0 + ((x + 0.5) / width) * (box.u1 - box.u0), v = box.v0 + ((y + 0.5) / height) * (box.v1 - box.v0);
    if (mask[Math.min(size - 1, Math.floor(v * size)) * size + Math.min(size - 1, Math.floor(u * size))] > 0.5) out[x + y * width] = 1;
  }
  return out;
}

/** Puts a part map made on a close-up back over the whole picture, at the close-up's own sharpness. */
export function placeMap(map: PartMap, box: Box): PartMap {
  const width = Math.round(map.width / (box.u1 - box.u0)), height = Math.round(map.height / (box.v1 - box.v0));
  const left = Math.round(box.u0 * width), top = Math.round(box.v0 * height);
  const labels = new Uint8Array(width * height);
  for (let y = 0; y < map.height; y++) {
    const row = y + top;
    if (row >= height) break;
    labels.set(map.labels.subarray(y * map.width, y * map.width + Math.min(map.width, width - left)), left + row * width);
  }
  const su = box.u1 - box.u0, sv = box.v1 - box.v0;
  return { width, height, labels, regions: map.regions.map((r) => ({ ...r, u0: box.u0 + r.u0 * su, u1: box.u0 + r.u1 * su, v0: box.v0 + r.v0 * sv, v1: box.v0 + r.v1 * sv })) };
}

/** Which part each pixel of the subject belongs to. Label 0 is off the subject. */
export function tidyParts(raw: RawRegion[], subject: Uint8Array, width: number, height: number): PartMap {
  let subjectArea = 0;
  for (let i = 0; i < subject.length; i++) subjectArea += subject[i];
  const labels = new Uint8Array(width * height);
  if (!subjectArea) return { width, height, labels, regions: [] };
  const kept: { mask: Uint8Array; area: number; score: number }[] = [];
  const ranked = raw.map((r) => {
    const mask = decodeRuns(r.runs, width, height);
    let area = 0, on = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i]) { area++; if (subject[i]) on++; }
    return { mask, area, on, score: r.score * r.stability };
  }).filter((r) => r.area && r.on / r.area >= ON_SUBJECT && r.on / subjectArea < WHOLE_SHARE && r.on / subjectArea >= SMALLEST_SHARE)
    .sort((a, b) => b.score - a.score);
  for (const r of ranked) {
    const same = kept.some((k) => {
      let both = 0;
      for (let i = 0; i < r.mask.length; i++) if (r.mask[i] && k.mask[i]) both++;
      return both / (r.area + k.area - both) >= SAME_REGION;
    });
    if (!same) kept.push(r);
    if (kept.length >= MOST_PARTS) break;
  }
  // Biggest first, so anything smaller lying on it stays visible.
  kept.sort((a, b) => b.area - a.area);
  kept.forEach((k, n) => {
    for (let i = 0; i < k.mask.length; i++) if (k.mask[i] && subject[i]) labels[i] = n + 1;
  });
  // SAM rarely outlines the main mass of a thing: it has no hard edge against what sits on it. What's left over is that mass.
  const rest = kept.length + 1;
  for (let i = 0; i < labels.length; i++) if (subject[i] && !labels[i]) labels[i] = rest;
  const regions: TidyRegion[] = [];
  for (let n = 0; n < rest; n++) {
    let area = 0, x0 = width, y0 = height, x1 = 0, y1 = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (labels[x + y * width] !== n + 1) continue;
      area++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    // Everything on top of it may have left too little of it to count.
    if (area / subjectArea < SMALLEST_SHARE) {
      for (let i = 0; i < labels.length; i++) if (labels[i] === n + 1) labels[i] = 0;
      continue;
    }
    regions.push({ id: n + 1, area, share: area / subjectArea, score: kept[n]?.score ?? 1, leftover: n === kept.length || undefined, u0: x0 / width, v0: y0 / height, u1: (x1 + 1) / width, v1: (y1 + 1) / height });
  }
  return { width, height, labels, regions };
}

/** What the vision model saw in one region: a probability per name and per material. */
export interface RegionReading {
  parts: Record<string, number>;
  materials: Record<string, number>;
  /** Names phrased for this kind of thing, as in "the medal of a police officer". Keyed "kind|name". */
  inKind?: Record<string, number>;
}

export type Evidence = 'seen' | 'expected' | 'yours';

export interface PartLine {
  id: number;
  name: string;
  material: string;
  behaviour: Behaviour;
  /** Seen: the picture showed it. Expected: it's what this kind of thing is normally made of. Yours: you chose it. */
  evidence: Evidence;
  share: number;
  /** Named by the model that saw the whole picture, not from a crop. */
  looked?: boolean;
}

export interface BuildSheet {
  kind: string | null;
  /** Where the kind came from. */
  from: 'words' | 'vision' | 'on-device model' | 'none';
  parts: PartLine[];
  /** What this kind normally has that the picture didn't show. Never built on a guess; only listed. */
  notSeen: SheetLine[];
  map: PartMap;
  fallback: string;
  /** What the vision model saw in each region, kept so a sheet can be re-read without running it again. */
  readings?: Map<number, RegionReading>;
  /** What the model shown the whole picture answered, and how long it took. */
  look?: { seconds: number; answer: string };
}

/** A material match multiplies a name, but a bad one doesn't rule it out: the vision model misreads materials too. */
const MATERIAL_FLOOR = 0.1;
/** A piece in the wrong place or of the wrong size counts for this much of its look. */
const MISPLACED = 0.2;
/** The belief a listed name needs among every name the vision model knows. */
const LISTED_BELIEF = 0.05;
/** A name from outside this kind's list must be this sure, and this many times surer than the listed one. */
const OUTSIDE_SURE = 0.4;
const OUTSIDE_LEAD = 3;
const LEFTOVER_MAIN = 0.3;
/** Below this share of its bounding box a piece is a sliver. */
const THIN_FILL = 0.3;
/** The belief a name from this kind's own short list needs, after place and material are weighed in. */
const SHEET_NAME_SURE = 0.02;
/** How much of the vision model's belief a name needs, out of all the names it knows. */
const NAME_SURE = 0.08;
const MAIN_MASS = 0.4;
/** The picture overrules the expectation only when it's this sure, and the expected material has this little support. */
const PICTURE_OVERRULES = 0.55;
const EXPECTATION_FAILS = 0.05;

const best = (scores: Record<string, number>) => Object.entries(scores).reduce<[string, number]>((top, row) => (row[1] > top[1] ? row : top), ['', -1]);

/** Each name's share of belief among the names this kind can have. */
function shareAmong(names: string[], scores: Record<string, number>) {
  let total = 0;
  for (const name of names) total += scores[name] ?? 0;
  const out: Record<string, number> = {};
  if (total > 0) for (const name of names) out[name] = (scores[name] ?? 0) / total;
  return out;
}

/** 1 when a piece sits where this part normally does and is about its size, less for each that doesn't fit. */
function placeFit(line: SheetLine, region: TidyRegion, frame: { v0: number; v1: number }, map: PartMap) {
  let fit = 1;
  const box = (region.u1 - region.u0) * map.width * (region.v1 - region.v0) * map.height;
  if ((region.area / Math.max(box, 1) < THIN_FILL) !== !!line.thin) fit *= MISPLACED;
  if (line.at) {
    const v = ((region.v0 + region.v1) / 2 - frame.v0) / Math.max(frame.v1 - frame.v0, 1e-6);
    const where = v < 1 / 3 ? 'top' : v < 2 / 3 ? 'middle' : 'bottom';
    if (where !== line.at) fit *= MISPLACED;
  }
  if (line.size === 'tiny' && region.share > 0.01) fit *= MISPLACED;
  if (line.size === 'small' && (region.share > 0.06 || region.share < 0.007)) fit *= MISPLACED;
  if (line.size === 'large' && region.share < 0.05) fit *= MISPLACED;
  return fit;
}

/** Names each region and settles its material. Each part's name is used once unless it really repeats. */
export function writeSheet(map: PartMap, readings: Map<number, RegionReading>, sheet: KindSheet | null, from: BuildSheet['from'], looked?: Map<number, LookedPart>): BuildSheet {
  const lines = new Map((sheet?.lines ?? []).map((l) => [l.name, l]));
  const parts: PartLine[] = [];
  const frame = { v0: Math.min(...map.regions.map((r) => r.v0)), v1: Math.max(...map.regions.map((r) => r.v1)) };
  for (const region of map.regions) {
    const reading = readings.get(region.id);
    if (!reading) continue;
    // A model that saw the whole picture outranks crops. Its null is an honest "can't tell" and stays unnamed.
    const saw = looked?.get(region.id);
    if (saw) {
      const line = saw.name ? lines.get(saw.name) : undefined;
      const [seenMaterial, seenScore] = best(reading.materials);
      let material = saw.material ?? seenMaterial, evidence: Evidence = 'seen';
      if (line && !(seenScore >= PICTURE_OVERRULES && (reading.materials[line.material] ?? 0) <= EXPECTATION_FAILS) && !saw.material) { material = line.material; evidence = 'expected'; }
      parts.push({ id: region.id, name: saw.name || 'unnamed part', material, behaviour: MATERIAL_BY_ID.get(material)?.behaviour ?? 'rigid', evidence, share: region.share, looked: true });
      continue;
    }
    const boosted: Record<string, number> = {};
    // Knowing what this is rules out another object's parts: a plane has no cape, whatever a blurry crop resembles.
    // What it looks like is then weighed against where it sits, how big it is and what it's made of.
    const inKind = sheet && reading.inKind ? shareAmong(sheet.lines.map((l) => `${sheet.kind}|${l.name}`), reading.inKind) : null;
    const among = sheet ? shareAmong(sheet.lines.map((l) => l.name), reading.parts) : null;
    for (const [name, score] of Object.entries(reading.parts)) {
      const known = lines.get(name);
      if (known) {
        const look = ((among?.[name] ?? 0) + (inKind?.[`${sheet!.kind}|${name}`] ?? among?.[name] ?? 0)) / 2;
        boosted[name] = look * placeFit(known, region, frame, map) * (MATERIAL_FLOOR + (reading.materials[known.material] ?? 0));
      } else if (!lines.size) boosted[name] = score;
    }
    const [bestName, bestScore] = best(boosted);
    // A name is a claim. When nothing stands out it stays unnamed, and it's still a part with a material.
    // Most of the subject has no one look to read, but a sheet starts with its main part.
    const main = region.share >= MAIN_MASS ? sheet?.lines[0]?.name : undefined;
    const believed = reading.parts[bestName] ?? 0;
    const [outside, outsideScore] = best(reading.parts);
    // A list of parts can't be allowed to force a name: with no "none of these", a mirror becomes the nearest thing listed.
    // So a listed name needs some belief among everything the model knows, and a clear winner from outside the list stands.
    const clearOutside = lines.size && !lines.has(outside) && outsideScore >= OUTSIDE_SURE && outsideScore >= believed * OUTSIDE_LEAD;
    const name = main ?? (clearOutside ? outside : bestScore >= (lines.has(bestName) ? SHEET_NAME_SURE : NAME_SURE) && (!lines.size || believed >= LISTED_BELIEF) ? bestName : '');
    const line = lines.get(name);
    const [seenMaterial, seenScore] = best(reading.materials);
    let material = seenMaterial, evidence: Evidence = 'seen';
    if (line) {
      const support = reading.materials[line.material] ?? 0;
      if (!(seenScore >= PICTURE_OVERRULES && support <= EXPECTATION_FAILS)) { material = line.material; evidence = 'expected'; }
    }
    parts.push({ id: region.id, name: name || 'unnamed part', material, behaviour: MATERIAL_BY_ID.get(material)?.behaviour ?? 'rigid', evidence, share: region.share });
  }
  // What's left after the pieces is usually scraps of the main part, not a thing with a look of its own.
  const largest = parts.filter((p) => !map.regions.find((r) => r.id === p.id)?.leftover).sort((a, b) => b.share - a.share)[0];
  // Only a real main part can claim them. Otherwise they're a mix of things and stay unnamed.
  if (largest && largest.share >= LEFTOVER_MAIN) for (const part of parts) {
    if (map.regions.find((r) => r.id === part.id)?.leftover && part.share < MAIN_MASS && !part.looked) Object.assign(part, { name: largest.name, material: largest.material, behaviour: largest.behaviour, evidence: largest.evidence });
  }
  const shown = new Set(parts.map((p) => p.name));
  const notSeen = (sheet?.lines ?? []).filter((l) => l.usual && !shown.has(l.name));
  // Whatever no part claimed takes the largest part's material.
  const fallback = parts.slice().sort((a, b) => b.share - a.share)[0]?.material ?? sheet?.lines[0]?.material ?? 'plastic';
  return { kind: sheet?.kind ?? null, from, parts, notSeen, map, fallback, readings };
}

/** Light response per label, ready for painting into a texture. Anything unlabelled takes the largest part's. */
export function lightByLabel(sheet: BuildSheet) {
  const roughness = new Float32Array(256), metalness = new Float32Array(256);
  const base = MATERIAL_BY_ID.get(sheet.fallback);
  roughness.fill(base?.roughness ?? 0.7);
  metalness.fill(base?.metalness ?? 0);
  for (const part of sheet.parts) {
    const m = MATERIAL_BY_ID.get(part.material);
    if (m) { roughness[part.id] = m.roughness; metalness[part.id] = m.metalness; }
  }
  return { roughness, metalness };
}
