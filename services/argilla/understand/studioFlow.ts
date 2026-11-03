/**
 * studioFlow.ts — the steps the studio runs: understand a picture, build it, check it, finish it, and make scenes.
 */

import { nativeLlmChat, isWindowsApp } from '../../windowsBridgeService';
import { findRegions, imageToModel } from '../../tela/tela3dService';
import { KindSheet, parseSheetAnswer, sheetFromWords, sheetPrompt, SHEET_BY_KIND } from './buildSheets';
import { BuildSheet, lightByLabel, PartMap, placeMap, RegionReading, subjectAt, subjectInBox, tidyParts, writeSheet } from './parts';
import { lookAtParts, lookPrompt, markParts, parseLookAnswer } from './lookAtParts';
import { glbToTriangles } from '../document';
import type { ClayFieldSnapshot } from '../engine';
import { largestShape } from '../pictureClay';
import { PictureReading, readFrame, readKind, readPart, readPicture } from '../npuLane';
import { buildInWorker } from './run';
import { Alignment, placeOnStage } from './alignShape';
import { BuildResult, Check, judge, measure, planFor, readStage, stageBounds } from './reconstruct';
import { ObjectPrior, ObjectReading, priorFromWords, rankReadings, VOCABULARY_BY_LABEL } from './vocabulary';
import type { FinishedObject } from '../scene/finishObject';
import { finishInWorker } from '../scene/finishRun';
import { blockoutMesh, checkScene, layoutScene, parsePrompt, parseSceneAnswer, Scene, SceneObject, sceneSystemPrompt, settleScene } from '../scene/sceneModel';
import { buildBackdrop, checkImageScene, distanceMap, findSubjects, PlacedSubject, placeSubject, solveScale } from '../scene/sceneFromImage';

export interface Understanding {
  prior: ObjectPrior | null;
  readings: ObjectReading[];
  /** Where the name came from. */
  source: 'words' | 'vision' | 'none';
  confidence: number;
}

/** Words win. Otherwise the vision model's names, checked against the picture's proportions. */
export function understand(reading: PictureReading | null, words: string): Understanding {
  const typed = words.trim() ? priorFromWords(words) : null;
  const shape = reading ? largestShape(reading.mask, reading.maskSize) : null;
  const aspect = shape && reading ? ((shape.u1 - shape.u0) * reading.aspect) / Math.max(shape.v1 - shape.v0, 1e-3) : 1;
  let readings = reading?.objects ? rankReadings(reading.objects, aspect) : [];
  // The creature codex was scored separately. When it's sure, it speaks for that family of names.
  const codex = reading?.scores ? Object.entries(reading.scores).filter(([id]) => id !== 'other').sort((a, b) => b[1] - a[1])[0] : null;
  if (codex && codex[1] >= 0.6 && readings[0]?.score < codex[1]) {
    const name = [...VOCABULARY_BY_LABEL.values()].find((p) => p.plan === codex[0] && p.label === codex[0]) ?? [...VOCABULARY_BY_LABEL.values()].find((p) => p.plan === codex[0]);
    if (name && (VOCABULARY_BY_LABEL.get(readings[0]?.label ?? '')?.structure === 'figure' || !readings.length)) {
      readings = [{ label: name.label, score: codex[1] }, ...readings.filter((r) => r.label !== name.label)];
    }
  }
  if (typed) return { prior: typed, readings, source: 'words', confidence: 1 };
  const top = readings[0];
  if (top && top.score >= 0.25) return { prior: VOCABULARY_BY_LABEL.get(top.label) ?? null, readings, source: 'vision', confidence: top.score };
  return { prior: null, readings, source: 'none', confidence: top?.score ?? 0 };
}

/**
 * The subject alone on transparency, which is what a shape generator needs to see. Any haze left in the alpha is read
 * as solid: faint background became a great flat sheet behind a plane. So the edge is smooth but nothing stays half there.
 */
async function cutOut(file: Blob, reading: PictureReading) {
  const image = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(image.width, image.height);
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, image.width, image.height);
  const S = reading.maskSize;
  for (let y = 0; y < image.height; y++) {
    const fy = Math.max(0, Math.min(S - 1.001, ((y + 0.5) / image.height) * S - 0.5)), y0 = Math.floor(fy), ty = fy - y0;
    for (let x = 0; x < image.width; x++) {
      const fx = Math.max(0, Math.min(S - 1.001, ((x + 0.5) / image.width) * S - 0.5)), x0 = Math.floor(fx), tx = fx - x0;
      const at = (a: number, b: number) => reading.mask[a + b * S];
      const m = (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
      const k = Math.max(0, Math.min(1, (m - 0.35) / 0.3));
      data.data[(x + y * image.width) * 4 + 3] = k * k * (3 - 2 * k) * 255;
    }
  }
  context.putImageData(data, 0, 0);
  image.close();
  return canvas.convertToBlob({ type: 'image/png' });
}

/** One heavy step on a generated shape, in its own worker. The arrays are copied, so the caller keeps its mesh. */
function shapeWork<T>(job: object, read: (data: { alignment?: Alignment; field?: ClayFieldSnapshot }) => T | undefined) {
  return new Promise<T>((resolve, reject) => {
    const worker = new Worker(new URL('./shapeWork.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      worker.terminate();
      const answer = read(data);
      if (answer !== undefined) resolve(answer);
      else reject(new Error(data.error || 'Could not work on this shape.'));
    };
    worker.onerror = (event) => { worker.terminate(); reject(new Error(event.message || 'Could not work on this shape.')); };
    worker.postMessage(job);
  });
}

export interface GeneratedShape { field: ClayFieldSnapshot; checks: Check[]; seconds: number; matches: boolean; attempts: number; yaw: number }

/** Attempts are cheap once the model is loaded. A good first one ends the search. */
const MAX_ATTEMPTS = 3;
const GOOD_ENOUGH = 0.72;

/**
 * Real geometry from the local generator, then held to the same checks as anything else. It takes more than one try
 * when a try is poor, turns each to the picture's angle, and keeps the one that matches best.
 */
export async function generateShape(file: Blob, reading: PictureReading, understanding: Understanding, grid: number, onStage?: (label: string) => void): Promise<GeneratedShape> {
  const started = performance.now();
  onStage?.('Getting your picture ready');
  const input = await cutOut(file, reading);
  const target = { mask: reading.mask, maskSize: reading.maskSize, aspect: reading.aspect, depth: reading.depth, depthSize: reading.depthSize, box: reading.depthBox };
  let best: { positions: Float32Array; indices: Uint32Array | Uint16Array; alignment: Alignment } | null = null;
  let attempts = 0;
  while (attempts < MAX_ATTEMPTS && (!best || best.alignment.score < GOOD_ENOUGH)) {
    attempts++;
    onStage?.(attempts === 1 ? 'Building real geometry on your GPU, up to a minute the first time' : `That one was a poor match. Trying again (${attempts} of ${MAX_ATTEMPTS})`);
    const made = await imageToModel(input, 'hunyuan_mini', { quality: 'detail', seed: 1 + Math.floor(Math.random() * 2_000_000_000) });
    onStage?.('Turning it to your picture\'s angle');
    const { positions, indices } = await glbToTriangles(made.glb);
    const alignment = await shapeWork<Alignment>({ kind: 'align', positions, indices, target }, (data) => data.alignment);
    if (!best || alignment.score > best.alignment.score) best = { positions, indices, alignment };
  }
  onStage?.('Turning it into clay');
  const stage = readStage(reading);
  const placed = placeOnStage(best!.positions, best!.alignment.yaw, stageBounds(stage));
  const field = await shapeWork<ClayFieldSnapshot>({ kind: 'voxelize', positions: placed, indices: best!.indices, grid }, (data) => data.field);
  onStage?.('Checking it against your picture');
  const measured = measure(field, stage, reading);
  const plan = planFor(understanding.prior, stage);
  // A generator finishes what the frame cut off, so running off the frame doesn't count against it.
  const checks = judge(measured, plan, understanding.prior, stage).filter((c) => c.id !== 'proportion' && c.id !== 'crop');
  // Paint is projected flat, so it needs the flat match. The shape itself is judged through the picture's perspective.
  const matches = measured.iou >= 0.6;
  const outline = checks.find((c) => c.id === 'outline')!;
  outline.pass = best!.alignment.iou >= 0.6;
  outline.detail = `${Math.round(best!.alignment.iou * 100)}% overlap, through the picture's perspective`;
  return { field, checks, seconds: Math.round((performance.now() - started) / 1000), matches, attempts, yaw: Math.round((best!.alignment.yaw * 180) / Math.PI) };
}

export { buildInWorker };

/** Below this the vision model is guessing at the kind, and a wrong sheet is worse than none. */
const KIND_SURE = 0.5;
const SHEET_CACHE = 'argilla.buildSheets';

/** What the on-device model says this is built from, remembered so the same thing never asks twice. */
async function sheetFromModel(what: string): Promise<KindSheet | null> {
  const key = what.toLowerCase();
  try {
    const known = JSON.parse(localStorage.getItem(SHEET_CACHE) ?? '{}');
    if (known[key]) return known[key];
  } catch { /* Nothing remembered. */ }
  if (!isWindowsApp()) return null;
  try {
    const reply = await nativeLlmChat([{ role: 'user', content: sheetPrompt(what) }], { maxTokens: 500, temperature: 0.2, timeoutMs: 90_000 });
    const sheet = parseSheetAnswer(what, reply.text ?? '');
    if (sheet) {
      try {
        const known = JSON.parse(localStorage.getItem(SHEET_CACHE) ?? '{}');
        localStorage.setItem(SHEET_CACHE, JSON.stringify({ ...known, [key]: sheet }));
      } catch { /* It just asks again next time. */ }
    }
    return sheet;
  } catch {
    return null;
  }
}

/** The picture kept sharp, because a part may be a small piece of a small subject. */
async function forRegions(file: Blob) {
  const image = await createImageBitmap(file);
  const k = Math.min(1, 3000 / Math.max(image.width, image.height));
  const canvas = new OffscreenCanvas(Math.round(image.width * k), Math.round(image.height * k));
  canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  return canvas;
}

/** One part alone on grey and close up, or the subject alone when no label is given. */
function isolate(picture: OffscreenCanvas, map: PartMap, label: number | null, box: { u0: number; v0: number; u1: number; v1: number }, keep: Uint8Array) {
  const pad = 0.15;
  const w = box.u1 - box.u0, h = box.v1 - box.v0;
  const u0 = Math.max(0, box.u0 - w * pad), v0 = Math.max(0, box.v0 - h * pad), u1 = Math.min(1, box.u1 + w * pad), v1 = Math.min(1, box.v1 + h * pad);
  const cw = Math.max(16, Math.round((u1 - u0) * picture.width)), ch = Math.max(16, Math.round((v1 - v0) * picture.height));
  const canvas = new OffscreenCanvas(cw, ch);
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(picture, -u0 * picture.width, -v0 * picture.height);
  const pixels = context.getImageData(0, 0, cw, ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const mx = Math.min(map.width - 1, Math.floor((u0 + ((x + 0.5) / cw) * (u1 - u0)) * map.width));
    const my = Math.min(map.height - 1, Math.floor((v0 + ((y + 0.5) / ch) * (v1 - v0)) * map.height));
    const i = mx + my * map.width;
    if (label === null ? keep[i] : map.labels[i] === label) continue;
    const o = (x + y * cw) * 4;
    pixels.data[o] = pixels.data[o + 1] = pixels.data[o + 2] = 128;
  }
  context.putImageData(pixels, 0, 0);
  return canvas.transferToImageBitmap();
}

/** A part with room around it, as it sits in the picture. */
function surroundings(picture: OffscreenCanvas, box: { u0: number; v0: number; u1: number; v1: number }) {
  const side = Math.max((box.u1 - box.u0) * picture.width, (box.v1 - box.v0) * picture.height) * 2.2;
  const cx = ((box.u0 + box.u1) / 2) * picture.width, cy = ((box.v0 + box.v1) / 2) * picture.height;
  const canvas = new OffscreenCanvas(Math.max(16, Math.round(side)), Math.max(16, Math.round(side)));
  canvas.getContext('2d')!.drawImage(picture, side / 2 - cx, side / 2 - cy);
  return canvas.transferToImageBitmap();
}

const meanScores = (a: Record<string, number>, b: Record<string, number>) => Object.fromEntries(Object.keys(a).map((k) => [k, (a[k] + (b[k] ?? 0)) / 2]));

/**
 * Finds a subject's parts and what each is made of. Words say what it is when there are any; otherwise the vision
 * model does, and the on-device model covers what no sheet lists. Nothing here touches the shape.
 */
export async function readBuildSheet(file: Blob, reading: PictureReading, understanding: Understanding, words: string, onStage?: (label: string) => void): Promise<BuildSheet> {
  onStage?.('Finding every part of your picture');
  const picture = await forRegions(file);
  // SAM samples a grid over what it's given. On the whole frame a small subject gets a handful of points, so it looks close up.
  const whole = largestShape(reading.mask, reading.maskSize) ?? { u0: 0, v0: 0, u1: 1, v1: 1 };
  const pad = 0.03;
  const box = { u0: Math.max(0, whole.u0 - pad), v0: Math.max(0, whole.v0 - pad), u1: Math.min(1, whole.u1 + pad), v1: Math.min(1, whole.v1 + pad) };
  const closeUp = new OffscreenCanvas(Math.max(16, Math.round((box.u1 - box.u0) * picture.width)), Math.max(16, Math.round((box.v1 - box.v0) * picture.height)));
  closeUp.getContext('2d')!.drawImage(picture, -box.u0 * picture.width, -box.v0 * picture.height);
  const found = await findRegions(await closeUp.convertToBlob({ type: 'image/png' }));
  const map = placeMap(tidyParts(found.parts, subjectInBox(reading.mask, reading.maskSize, box, found.width, found.height), found.width, found.height), box);
  const subject = subjectAt(reading.mask, reading.maskSize, map.width, map.height);

  onStage?.('Working out what it is made of');
  const kept = isolate(picture, map, null, whole, subject);
  const kinds = await readKind(kept);
  kept.close();
  const [topKind, topScore] = Object.entries(kinds).reduce<[string, number]>((top, row) => (row[1] > top[1] ? row : top), ['', 0]);
  let sheet = words.trim() ? sheetFromWords(words) : null;
  let from: BuildSheet['from'] = sheet ? 'words' : 'none';
  if (!sheet && topScore >= KIND_SURE) { sheet = SHEET_BY_KIND.get(topKind) ?? null; from = sheet ? 'vision' : 'none'; }
  if (!sheet) {
    const name = words.trim() || understanding.prior?.label;
    if (name) { sheet = await sheetFromModel(name); from = sheet ? 'on-device model' : 'none'; }
  }

  const readings = new Map<number, RegionReading>();
  for (const region of map.regions) {
    // Alone it's a scrap of colour. A window is only a window in a row along a fuselage, so it's read in place as well.
    const crop = isolate(picture, map, region.id, region, subject);
    const inPlace = surroundings(picture, region);
    const [alone, around] = [await readPart(crop), await readPart(inPlace)];
    crop.close();
    inPlace.close();
    readings.set(region.id, { parts: meanScores(alone.parts, around.parts), materials: alone.materials, inKind: alone.inKind && around.inKind ? meanScores(alone.inKind, around.inKind) : undefined });
  }

  // Crops can't tell a mirror from a lever. A model shown the whole picture, every part numbered, mostly can.
  onStage?.('Looking at each part in place');
  const ids = map.regions.map((r) => r.id);
  const kind = sheet?.kind ?? (words.trim() || understanding.prior?.label || null);
  const seen = await lookAtParts(await markParts(picture, map, box), lookPrompt(kind, sheet, ids));
  const looked = seen ? parseLookAnswer(seen.text, ids) : undefined;
  const written = writeSheet(map, readings, sheet, from, looked?.size ? looked : undefined);
  return seen ? { ...written, look: { seconds: seen.seconds, answer: seen.text } } : written;
}

/** Where a picture's pixels land on clay built from it, as straight lines the worker can carry. */
export function pictureMapping(reading: PictureReading) {
  const stage = readStage(reading);
  return { u0: stage.toU(0), uk: stage.toU(1) - stage.toU(0), v0: stage.toV(0), vk: stage.toV(1) - stage.toV(0) };
}

export async function pictureSource(file: Blob, maxSide = 1024) {
  const image = await createImageBitmap(file);
  const k = Math.min(1, maxSide / Math.max(image.width, image.height));
  const width = Math.round(image.width * k), height = Math.round(image.height * k);
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(image, 0, 0, width, height);
  image.close();
  return { rgba: context.getImageData(0, 0, width, height).data, width, height };
}

const fieldHeight = (mesh: { positions: Float32Array }) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < mesh.positions.length; v += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], mesh.positions[v + k]); hi[k] = Math.max(hi[k], mesh.positions[v + k]); }
  return { lo, hi };
};

/** Moves a finished mesh into metres, centred on its footprint with its base at y = 0. */
function toMetres(made: FinishedObject, height: number) {
  const { lo, hi } = fieldHeight(made.mesh);
  const k = height / Math.max(hi[1] - lo[1], 1e-4);
  const cx = (lo[0] + hi[0]) / 2, cz = (lo[2] + hi[2]) / 2;
  for (let v = 0; v < made.mesh.positions.length; v += 3) {
    made.mesh.positions[v] = (made.mesh.positions[v] - cx) * k;
    made.mesh.positions[v + 1] = (made.mesh.positions[v + 1] - lo[1]) * k;
    made.mesh.positions[v + 2] = (made.mesh.positions[v + 2] - cz) * k;
  }
  return [(hi[0] - lo[0]) * k, height, (hi[2] - lo[2]) * k] as [number, number, number];
}

/** One finished object, shown as a scene of one so it gets the same room, checks and export. */
export async function finishToScene(field: ClayFieldSnapshot, file: Blob | null, reading: PictureReading | null, understanding: Understanding, checks: Check[], corrections: string[], title: string, paintSharp = true, fine = false, sheet: BuildSheet | null = null) {
  const source = file && reading ? await pictureSource(file) : null;
  // Parts are drawn on the picture, so they only land right when the shape lines up with it. Otherwise it's one material.
  const light = sheet ? lightByLabel(sheet) : null;
  if (light && !paintSharp) { light.roughness.fill(light.roughness[0]); light.metalness.fill(light.metalness[0]); }
  const parts = sheet && light ? { labels: paintSharp ? sheet.map.labels : new Uint8Array(sheet.map.labels.length), width: sheet.map.width, height: sheet.map.height, ...light } : undefined;
  // Clay built from the picture's depth agrees with it by construction. A generated shape has to be checked against it.
  const depth = fine && reading?.depth && reading.depthSize && reading.depthBox ? { values: reading.depth, size: reading.depthSize, box: reading.depthBox } : undefined;
  const made = await finishInWorker(field, source && reading ? { ...source, mask: reading.mask, maskSize: reading.maskSize, ...pictureMapping(reading), sharp: paintSharp, parts, depth } : null, 2048, fine);
  const height = understanding.prior?.size[1] ?? 1;
  const size = toMetres(made, height);
  // The build sheet read the picture more closely than the first guess: a police officer, not the nearest prior, a soldier.
  const label = sheet?.kind ? sheet.kind[0].toUpperCase() + sheet.kind.slice(1) : understanding.prior?.label ?? title;
  const object: SceneObject = { id: 'object', label, prior: understanding.prior, size, position: [0, 0, 0], rotationY: 0, color: '#9a958c', parts: sheet && paintSharp ? sheet.parts.map(({ id, name, material, behaviour, evidence }) => ({ id, name, material, behaviour, evidence })) : undefined };
  const scene: Scene = { title, objects: [object], extent: Math.max(size[0], size[1], size[2]) * 2.4, groundColor: '#26252b', checks, corrections, source: understanding.source === 'none' && !sheet?.kind ? 'Built without a name to go on.' : `Understood as ${sheet?.kind ?? understanding.prior?.label ?? title} from your ${understanding.source === 'words' ? 'words' : 'picture'}.` };
  return { scene, finished: { object: made } as Record<string, FinishedObject> };
}

/** A scene from words. On the desktop a local model can imagine what belongs; everywhere, words name what's there. */
export async function sceneFromWords(text: string): Promise<Scene | null> {
  let requests = parsePrompt(text);
  let source = 'Read directly from your words.';
  if (isWindowsApp()) {
    try {
      const reply = await nativeLlmChat([{ role: 'system', content: sceneSystemPrompt() }, { role: 'user', content: text }], { maxTokens: 500, temperature: 0.3, timeoutMs: 90_000 });
      const answer = parseSceneAnswer(reply.text ?? '');
      if (answer && answer.length >= requests.length) { requests = answer; source = 'Imagined by the on-device model from your words.'; }
    } catch { /* The words themselves still work. */ }
  }
  if (!requests.length) return null;
  const scene = settleScene(layoutScene(requests, text.trim().slice(0, 90)));
  for (const object of scene.objects) object.mesh = blockoutMesh(object) ?? undefined;
  return { ...scene, source: `${source} Block-out shapes at real sizes: build any of them from a picture for real detail.`, checks: checkScene(scene) };
}

/** A scene from one picture: a depth backdrop, plus each subject built as its own object. */
export async function sceneFromPicture(file: File, grid: number, band: number, onStage?: (label: string) => void) {
  onStage?.('Reading the whole picture');
  const frame = await readFrame(file);
  const { subjects } = findSubjects(frame.mask, frame.maskSize);
  const image = await createImageBitmap(file);
  const distance = distanceMap(frame.depth);
  const S = frame.depthSize;
  const crops: { placed: PlacedSubject; reading: PictureReading; blob: Blob; understanding: Understanding }[] = [];
  for (let n = 0; n < subjects.length; n++) {
    const s = subjects[n];
    onStage?.(`Looking at subject ${n + 1} of ${subjects.length}`);
    const pad = 0.015;
    const u0 = Math.max(0, s.u0 - pad), u1 = Math.min(1, s.u1 + pad), v0 = Math.max(0, s.v0 - pad), v1 = Math.min(1, s.v1 + pad);
    const crop = new OffscreenCanvas(Math.max(8, Math.round((u1 - u0) * image.width)), Math.max(8, Math.round((v1 - v0) * image.height)));
    crop.getContext('2d')!.drawImage(image, -u0 * image.width, -v0 * image.height);
    const blob = await crop.convertToBlob({ type: 'image/png' });
    const reading = await readPicture(blob);
    const understanding = understand(reading, '');
    // Distance at the subject's base, where it meets what it stands on.
    let sum = 0, count = 0;
    for (let y = Math.floor(s.v0 * S); y < Math.ceil(s.v1 * S); y++) for (let x = Math.floor(s.u0 * S); x < Math.ceil(s.u1 * S); x++) {
      const m = frame.mask[Math.floor((y / S) * frame.maskSize) * frame.maskSize + Math.floor((x / S) * frame.maskSize)];
      if (m > 0.5) { sum += distance[x + y * S]; count++; }
    }
    crops.push({
      blob, reading, understanding,
      placed: { label: understanding.prior?.label ?? 'object', prior: understanding.prior, distance: count ? sum / count : 3, frameHeight: s.v1 - s.v0, frameWidth: (s.u1 - s.u0) * frame.aspect, u: (s.u0 + s.u1) / 2, v: s.v1 },
    });
  }
  const scale = solveScale(crops.map((c) => c.placed));

  // What's behind each subject: its depth and colours filled in from around it, so moving it leaves no ghost.
  const filled = distance.slice();
  const hole = new Uint8Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (frame.mask[Math.floor((y / S) * frame.maskSize) * frame.maskSize + Math.floor((x / S) * frame.maskSize)] > 0.3) hole[x + y * S] = 1;
  }
  const keep = hole.slice();
  for (let pass = 0; pass < S; pass++) {
    let any = false;
    const was = keep.slice();
    for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
      const i = x + y * S;
      if (!was[i]) continue;
      let sum = 0, n = 0;
      for (const j of [i - 1, i + 1, i - S, i + S]) if (!was[j]) { sum += filled[j]; n++; }
      if (n) { filled[i] = sum / n; keep[i] = 0; any = true; }
    }
    if (!any) break;
  }
  const paint = new OffscreenCanvas(1536, Math.round(1536 / frame.aspect));
  const ctx = paint.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, paint.width, paint.height);
  const pixels = ctx.getImageData(0, 0, paint.width, paint.height);
  const W = paint.width, H = paint.height;
  const empty = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (hole[Math.floor((x / W) * S) + Math.floor((y / H) * S) * S]) empty[x + y * W] = 1;
  }
  for (let pass = 0; pass < 300; pass++) {
    let any = false;
    const was = empty.slice();
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = x + y * W;
      if (!was[i]) continue;
      const sum = [0, 0, 0];
      let n = 0;
      for (const j of [i - 1, i + 1, i - W, i + W]) if (!was[j]) { for (let k = 0; k < 3; k++) sum[k] += pixels.data[j * 4 + k]; n++; }
      if (n) { for (let k = 0; k < 3; k++) pixels.data[i * 4 + k] = sum[k] / n; empty[i] = 0; any = true; }
    }
    if (!any) break;
  }
  ctx.putImageData(pixels, 0, 0);
  const pictureUrl = URL.createObjectURL(await paint.convertToBlob({ type: 'image/jpeg', quality: 0.92 }));
  const backdrop = buildBackdrop(filled, S, frame.aspect, scale);

  const objects: SceneObject[] = [];
  const finished: Record<string, FinishedObject> = {};
  for (let n = 0; n < crops.length; n++) {
    const c = crops[n];
    onStage?.(`Building the ${c.placed.label}`);
    const built: BuildResult = await buildInWorker(c.reading, { grid: Math.max(48, grid >> 1), band: band * 2, prior: c.understanding.prior });
    let field = built.field, lined = true;
    // Depth can't capture thin parts. Where the generator is available it builds those; where it isn't, depth stands.
    if (built.needsGenerated) {
      try {
        const generated = await generateShape(c.blob, c.reading, c.understanding, Math.max(48, grid >> 1), onStage);
        field = generated.field;
        lined = generated.matches;
      } catch { /* No GPU engine, or no room on it. */ }
    }
    const source = await pictureSource(c.blob, 512);
    const made = await finishInWorker(field, lined ? { ...source, mask: c.reading.mask, maskSize: c.reading.maskSize, ...pictureMapping(c.reading), sharp: true } : null, 1024);
    const where = placeSubject({ ...c.placed, u: c.placed.u }, scale);
    where.position[0] *= frame.aspect > 0 ? frame.aspect : 1;
    const size = toMetres(made, where.height);
    const id = `subject-${n}`;
    finished[id] = made;
    objects.push({ id, label: c.placed.label, prior: c.placed.prior, size, position: where.position, rotationY: 0, color: '#9a958c' });
  }
  image.close();
  const reach = Math.max(...Array.from({ length: Math.floor(backdrop.positions.length / 3) }, (_, i) => Math.abs(backdrop.positions[i * 3 + 2]))) * 0.5;
  const scene: Scene = {
    title: file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 80) || 'Scene from a picture', objects, extent: Math.max(reach, 2), groundColor: '#26252b', backdrop, pictureUrl,
    checks: checkImageScene(objects, backdrop), corrections: [],
    source: 'From one picture. The backdrop is one view deep: step far off the camera\'s position and it comes apart.',
  };
  return { scene, finished };
}
