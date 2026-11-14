/**
 * lookAtParts.ts — names a subject's parts by showing a vision-language model the whole picture with every part
 * outlined and numbered, and asking once what each number is.
 *
 * CLIP on a crop sees a scrap of colour; a medal alone is a brass blob. With the whole picture in view the model sees
 * the medal on the officer's chest. One question per picture, not one per part, so the GPU is busy for seconds.
 */

import { MATERIAL_BY_ID, MATERIALS } from './materials';
import type { KindSheet } from './buildSheets';
import type { Box, PartMap } from './parts';
import { isWindowsApp, nativeLlmLook } from '../../windowsBridgeService';

/** The longest side of the picture the model is shown. Past this its image tokens are spread too thin anyway. */
const LOOK_SIDE = 1024;
/** The answer is started for the model, so it can't open with an empty reply or a chain of thought. */
const PREFILL = '{"parts":[';

export interface LookedPart { name: string | null; material: string | null }

/** Strong, distinct colours for outlines, so neighbouring parts never look like one. */
const OUTLINE = ['#ff3b30', '#34c759', '#007aff', '#ffcc00', '#af52de', '#ff9500', '#00c7be', '#ff2d55', '#5ac8fa', '#a2845e', '#30d158', '#bf5af2'];

/**
 * Where each part's number goes: the pixel of it farthest from any other label, so the number sits inside it and
 * not on an edge it shares. Chamfer distance, two passes over the whole map.
 */
export function labelSpots(map: PartMap) {
  const { width, height, labels } = map;
  const dist = new Float32Array(width * height);
  for (let i = 0; i < dist.length; i++) dist[i] = labels[i] ? Infinity : 0;
  const at = (x: number, y: number) => x + y * width;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = at(x, y), l = labels[i];
    if (!l) continue;
    if (x === 0 || y === 0 || labels[i - 1] !== l || labels[i - width] !== l) { dist[i] = 1; continue; }
    dist[i] = Math.min(dist[i], dist[i - 1] + 1, dist[i - width] + 1, dist[i - width - 1] + 1.414, x + 1 < width ? dist[i - width + 1] + 1.414 : Infinity);
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const i = at(x, y), l = labels[i];
    if (!l) continue;
    if (x === width - 1 || y === height - 1 || labels[i + 1] !== l || labels[i + width] !== l) { dist[i] = 1; continue; }
    dist[i] = Math.min(dist[i], dist[i + 1] + 1, dist[i + width] + 1, dist[i + width + 1] + 1.414, x > 0 ? dist[i + width - 1] + 1.414 : Infinity);
  }
  const spots = new Map<number, { x: number; y: number; room: number }>();
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i];
    if (!l) continue;
    const seen = spots.get(l);
    if (!seen || dist[i] > seen.room) spots.set(l, { x: (i % width + 0.5) / width, y: (Math.floor(i / width) + 0.5) / height, room: dist[i] });
  }
  return spots;
}

/** The close-up of the picture with every part outlined in its own colour and numbered by its id. */
export async function markParts(picture: OffscreenCanvas, map: PartMap, box: Box) {
  const bw = (box.u1 - box.u0) * picture.width, bh = (box.v1 - box.v0) * picture.height;
  const k = Math.min(1, LOOK_SIDE / Math.max(bw, bh));
  const width = Math.max(16, Math.round(bw * k)), height = Math.max(16, Math.round(bh * k));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.imageSmoothingQuality = 'high';
  context.drawImage(picture, box.u0 * picture.width, box.v0 * picture.height, bw, bh, 0, 0, width, height);
  // Outlines: a pixel whose label differs from a neighbour's, in the part's colour, two pixels wide.
  const pixels = context.getImageData(0, 0, width, height);
  const labelAt = (x: number, y: number) => {
    const u = box.u0 + ((x + 0.5) / width) * (box.u1 - box.u0), v = box.v0 + ((y + 0.5) / height) * (box.v1 - box.v0);
    return map.labels[Math.min(map.height - 1, Math.floor(v * map.height)) * map.width + Math.min(map.width - 1, Math.floor(u * map.width))];
  };
  const here = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) here[x + y * width] = labelAt(x, y);
  const rgb = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const l = here[x + y * width];
    if (!l) continue;
    let edge = false;
    for (let dy = -2; dy <= 2 && !edge; dy++) for (let dx = -2; dx <= 2 && !edge; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || here[nx + ny * width] !== l) edge = Math.abs(dx) + Math.abs(dy) <= 2;
    }
    if (!edge) continue;
    const [r, g, b] = rgb(OUTLINE[(l - 1) % OUTLINE.length]);
    const o = (x + y * width) * 4;
    pixels.data[o] = r; pixels.data[o + 1] = g; pixels.data[o + 2] = b;
  }
  context.putImageData(pixels, 0, 0);
  // Numbers on a dark chip, readable over any colour.
  const font = Math.max(12, Math.round(Math.max(width, height) / 48));
  context.font = `bold ${font}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  for (const [id, spot] of labelSpots(map)) {
    const x = ((spot.x - box.u0) / (box.u1 - box.u0)) * width, y = ((spot.y - box.v0) / (box.v1 - box.v0)) * height;
    const text = String(id), w = context.measureText(text).width + font * 0.5;
    context.fillStyle = 'rgba(0,0,0,0.75)';
    context.fillRect(x - w / 2, y - font * 0.6, w, font * 1.2);
    context.fillStyle = OUTLINE[(id - 1) % OUTLINE.length];
    context.fillText(text, x, y);
  }
  return canvas.convertToBlob({ type: 'image/png' });
}

export function lookPrompt(kind: string | null, sheet: KindSheet | null, ids: number[]) {
  const names = sheet?.lines.map((l) => l.name) ?? [];
  return `This is a photo of ${kind ? `a ${kind}` : 'an object'}. Coloured outlines split it into pieces, and each piece has a number on it.
For each number, say what that piece of the ${kind ?? 'object'} is, in one to three lowercase words, and what it is made of.
${names.length ? `Use one of these names when one fits: ${names.join(', ')}. Otherwise name it yourself.\n` : ''}Material must be exactly one of: ${MATERIALS.map((m) => m.id).join(', ')}.
If a piece is only a scrap of a bigger part, name that bigger part. If you really can't tell what a piece is, use null for its name.
Numbers: ${ids.join(', ')}.
Answer with JSON only: {"parts":[{"n":1,"name":"...","material":"..."}]}`;
}

/** The model's answer, one entry per number it was asked about. Anything else in it is dropped. */
export function parseLookAnswer(text: string, ids: number[]) {
  const out = new Map<number, LookedPart>();
  // Each entry is read on its own: the runtime can leave stray control characters between them, and an answer cut
  // short at the token limit still has every entry before the cut.
  const parts: { n?: unknown; name?: unknown; material?: unknown }[] = [];
  for (const entry of text.replace(/[\u0000-\u001f]/g, ' ').match(/\{[^{}]*\}/g) ?? []) {
    try { parts.push(JSON.parse(entry)); } catch { /* a broken entry stays unnamed */ }
  }
  const asked = new Set(ids);
  for (const raw of parts) {
    const n = Number(raw?.n);
    if (!asked.has(n) || out.has(n)) continue;
    const name = typeof raw?.name === 'string' && raw.name.trim() && raw.name.trim().toLowerCase() !== 'null' ? raw.name.trim().toLowerCase().slice(0, 40) : null;
    const material = typeof raw?.material === 'string' && MATERIAL_BY_ID.has(raw.material) ? raw.material : null;
    out.set(n, { name, material });
  }
  return out;
}

/**
 * Asks the desktop app's vision model. Null outside the app, when no Gemma 4 vision model is installed, or when
 * it fails, so the crops still name things. Its memory is freed straight after: SAM and the 3D generator come next.
 */
export async function lookAtParts(marked: Blob, prompt: string) {
  if (!isWindowsApp()) return null;
  try {
    const bytes = new Uint8Array(await marked.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const reply = await nativeLlmLook(btoa(binary), prompt, { prefill: PREFILL, maxTokens: 900, unloadAfter: true });
    return reply.success ? { text: reply.text, seconds: reply.seconds } : null;
  } catch {
    return null;
  }
}
