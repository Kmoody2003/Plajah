/**
 * Builds a Tela document (vector infographic) from a Dossier's dated ledger claims.
 * Milestones sit on a true year scale; cards go to whichever tier has horizontal room, so nothing
 * overlaps. Every milestone keeps the claim ids it came from, so the picture stays auditable.
 */
import type { TelaDoc, TelaFrame, TelaVectorDevice, TelaVectorObject } from '../../types';
import type { Dossier } from './dossierTypes';

export interface Milestone { year: number; label: string; claimId: string; extraClaimIds?: string[] }

export const W = 1920;
export const H = 1080;
export const CARD_W = 240;
const GAP = 12;
const AXIS_Y = 540;
const TIERS = [
  { y: 404, dir: -1 }, // above, near
  { y: 612, dir: 1 },  // below, near
  { y: 288, dir: -1 }, // above, middle
  { y: 728, dir: 1 },  // below, middle
  { y: 172, dir: -1 }, // above, far
  { y: 844, dir: 1 },  // below, far
];
const CARD_H = 104;

const FONT = 'Georgia, "Times New Roman", serif';
let seq = 0;
const oid = (p: string) => `${p}_${++seq}`;

const base = (): Omit<TelaVectorObject, 'id' | 'kind' | 'x' | 'y' | 'w' | 'h'> => ({
  fill: 'none', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1,
});

const rect = (x: number, y: number, w: number, h: number, fill: string, extra: Partial<TelaVectorObject> = {}): TelaVectorObject =>
  ({ ...base(), id: oid('rect'), kind: 'RECT', x, y, w, h, fill, ...extra });
const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, strokeWidth = 2, extra: Partial<TelaVectorObject> = {}): TelaVectorObject =>
  ({ ...base(), id: oid('line'), kind: 'LINE', x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), points: [x1, y1, x2, y2], stroke, strokeWidth, ...extra });
const dot = (cx: number, cy: number, r: number, fill: string): TelaVectorObject =>
  ({ ...base(), id: oid('dot'), kind: 'ELLIPSE', x: cx - r, y: cy - r, w: r * 2, h: r * 2, fill });
const text = (x: number, y: number, w: number, h: number, t: string, size: number, fill: string, extra: Partial<TelaVectorObject> = {}): TelaVectorObject =>
  ({ ...base(), id: oid('text'), kind: 'TEXT', x, y, w, h, text: t, fontSize: size, fontFamily: FONT, fill, wrap: true, textAlign: 'left', ...extra });

/**
 * Greedy tier placement. For each milestone (by year) try tiers in order; within a tier allow the card
 * to shift sideways while still covering its own marker. First position with no overlap wins.
 */
export function placeMilestones(ms: Milestone[], x0: number, x1: number, y0: number, y1: number) {
  const ends = TIERS.map(() => -Infinity);
  const shifts = [0, -40, 40, -80, 80];
  return [...ms].sort((a, b) => a.year - b.year).map(m => {
    const cx = x0 + ((m.year - y0) / (y1 - y0)) * (x1 - x0);
    for (let tier = 0; tier < TIERS.length; tier++) {
      for (const sh of shifts) {
        const left = Math.min(Math.max(cx - CARD_W / 2 + sh, 40), W - 40 - CARD_W);
        if (cx < left + 16 || cx > left + CARD_W - 16) continue; // card must cover its marker
        if (left >= ends[tier] + GAP) {
          ends[tier] = left + CARD_W;
          return { ...m, cx, left, tier };
        }
      }
    }
    throw new Error(`No room on the timeline for ${m.year} "${m.label}"; merge or shorten milestones`);
  });
}

export function buildTimelineDoc(
  dossier: Dossier,
  milestones: Milestone[],
  portraits: Array<{ assetId: string; caption: string; w: number; h: number }>,
  ownerId = 'local',
): TelaDoc {
  seq = 0;
  const claim = new Map(dossier.ledger.claims.map(c => [c.id, c]));
  for (const m of milestones) for (const id of [m.claimId, ...(m.extraClaimIds ?? [])]) if (!claim.has(id)) throw new Error(`unknown claim ${id}`);
  const years = milestones.map(m => m.year);
  const y0 = Math.floor(Math.min(...years) / 10) * 10;
  const y1 = Math.ceil(Math.max(...years) / 10) * 10;
  const AX0 = 120, AX1 = W - 120;
  const placed = placeMilestones(milestones, AX0, AX1, y0, y1);

  const o1: TelaVectorObject[] = [
    rect(0, 0, W, H, '#0d0b10', { templateRole: 'GROUND' }),
    text(80, 44, 1200, 70, dossier.subject, 56, '#f2ecf6', { fontWeight: 700, templateRole: 'HEADLINE' }),
    text(80, 118, 1500, 36, 'A life on a true timescale · every card traces to the evidence ledger', 22, 'rgba(242,236,246,0.62)', { templateRole: 'DECK' }),
    line(AX0, AXIS_Y, AX1, AXIS_Y, '#D0BCFF', 3),
  ];
  for (let y = y0; y <= y1; y += 10) {
    const x = AX0 + ((y - y0) / (y1 - y0)) * (AX1 - AX0);
    o1.push(line(x, AXIS_Y - 9, x, AXIS_Y + 9, '#D0BCFF', 2));
    o1.push(text(x - 40, AXIS_Y + 14, 80, 24, String(y), 18, 'rgba(242,236,246,0.55)', { textAlign: 'center', wrap: false }));
  }
  for (const p of placed) {
    const t = TIERS[p.tier];
    const top = t.y;
    const cardEdgeY = t.dir < 0 ? top + CARD_H : top;
    o1.push(line(p.cx, AXIS_Y, p.cx, cardEdgeY, 'rgba(255,140,0,0.55)', 1.5));
    o1.push(dot(p.cx, AXIS_Y, 7, '#FF8C00'));
    o1.push(rect(p.left, top, CARD_W, CARD_H, '#16121b', { stroke: 'rgba(255,255,255,0.14)', strokeWidth: 1, rx: 10 }));
    o1.push(text(p.left + 14, top + 10, CARD_W - 28, 30, String(p.year), 24, '#FF8C00', { fontWeight: 700, wrap: false }));
    o1.push(text(p.left + 14, top + 44, CARD_W - 28, CARD_H - 52, p.label, 18, '#f2ecf6', { lineHeight: 1.25 }));
  }
  o1.push(text(80, H - 54, 1760, 28, 'Evidence: ' + [...new Set(milestones.flatMap(m => [m.claimId, ...(m.extraClaimIds ?? [])]))].join(' · '), 14, 'rgba(242,236,246,0.4)', { wrap: true }));

  const vec1: TelaVectorDevice = { id: 'dev_timeline', type: 'VECTOR', name: 'Timeline', width: W, height: H, objects: o1 };

  const o2: TelaVectorObject[] = [
    rect(0, 0, W, H, '#0d0b10', { templateRole: 'GROUND' }),
    text(80, 44, 1400, 70, 'Faces across a life', 56, '#f2ecf6', { fontWeight: 700, templateRole: 'HEADLINE' }),
    text(80, 118, 1600, 36, 'Real photographs and engravings only. Each is credited below it.', 22, 'rgba(242,236,246,0.62)', { templateRole: 'DECK' }),
  ];
  const assetById = new Map(dossier.assets.map(a => [a.id, a]));
  const n = portraits.length;
  const slot = (W - 160) / n;
  portraits.forEach((p, i) => {
    const a = assetById.get(p.assetId);
    if (!a) throw new Error(`unknown asset ${p.assetId}`);
    const bw = slot - 30, bh = 560;
    const x = 80 + i * slot + 15, y = 220;
    const sw = p.w, sh = p.h;
    o2.push(rect(x, y, bw, bh, '#16121b', { stroke: 'rgba(255,255,255,0.14)', strokeWidth: 1, rx: 8 }));
    o2.push({ ...base(), id: oid('img'), kind: 'IMAGE', x: x + 8, y: y + 8, w: bw - 16, h: bh - 16, imageFit: 'cover',
      sourceImageSrc: a.url, sourceCrop: { x: 0, y: 0, width: sw, height: sh, sourceWidth: sw, sourceHeight: sh }, objectLabel: a.title });
    o2.push(text(x, y + bh + 14, bw, 60, p.caption, 18, '#f2ecf6', { fontWeight: 700 }));
    o2.push(text(x, y + bh + 78, bw, 80, a.rights.credit.replace(/\s+/g, ' ').slice(0, 110), 13, 'rgba(242,236,246,0.5)'));
  });
  const vec2: TelaVectorDevice = { id: 'dev_faces', type: 'VECTOR', name: 'Faces', width: W, height: H, objects: o2 };

  const frames: TelaFrame[] = [
    { id: 'frame_timeline', kind: 'BOARD', preset: 'FREE', x: 0, y: 0, w: W, h: H, deviceIds: [vec1.id], label: 'Timeline' },
    { id: 'frame_faces', kind: 'BOARD', preset: 'FREE', x: W + 96, y: 0, w: W, h: H, deviceIds: [vec2.id], label: 'Faces across a life' },
  ];
  const now = Date.now();
  return {
    id: `tela_dossier_${dossier.id}_timeline`,
    ownerId,
    title: `${dossier.subject} — timeline`,
    frames,
    devices: { [vec1.id]: vec1, [vec2.id]: vec2 },
    bindings: [],
    createdAt: now,
    updatedAt: now,
  } as TelaDoc;
}
