/**
 * The Post Man — letter stationery.
 *
 * A Plajah letter is a Tela document, not an email. Writing one should still
 * feel like picking up a pen, so the writer types plain words and this module
 * sets them onto paper: one frame, one VECTOR device holding the stationery art
 * and the text as real, editable Tela objects. The recipient sees it through
 * TelaEmbed (the same renderer as the canvas), and either side can open it in
 * the full Tela editor to make it as expressive as they like — the composer is
 * the on-ramp, Tela is the ceiling.
 *
 * Tela docs live on-device (OPFS), so the letter carries its own snapshot. That
 * is why the builder keeps documents small: vector art only, no raster paper
 * textures; a full letter is a few KB of JSON.
 */

import type { TelaDoc, TelaVectorObject } from '../../types';
import { circle, ellipse, hr, line, path, rect, text, vr } from '../tela/templateKit';
import { ensureFontsLoaded, type FontKey } from '../tela/telaFonts';

export type StationeryId =
  | 'cream' | 'airmail' | 'midnight' | 'garden' | 'ledger' | 'telegram' | 'kraft' | 'plajah';
export type HandId = 'script' | 'neat' | 'serif' | 'typewriter' | 'marker';
export type InkId = 'iron' | 'navy' | 'oxblood' | 'forest' | 'violet' | 'sepia' | 'silver';

export interface Stationery {
  id: StationeryId;
  label: string;
  note: string;
  paper: string;
  /** Default ink when the writer has not picked one. */
  ink: InkId;
  /** Accent for letterhead, rules and ornaments. */
  accent: string;
  /** Paper is dark — ink colours are lifted to stay legible. */
  dark?: boolean;
}

export const STATIONERY: Stationery[] = [
  { id: 'cream',    label: 'Cream laid',  note: 'Heavy laid paper with a deckle edge.',     paper: '#f6efe1', ink: 'iron',    accent: '#b08a5a' },
  { id: 'airmail',  label: 'Par avion',   note: 'Onionskin with the red-and-blue border.',  paper: '#f4f6fb', ink: 'navy',    accent: '#c8323b' },
  { id: 'midnight', label: 'Midnight',    note: 'Deep blue card, silver ink.',              paper: '#141b33', ink: 'silver',  accent: '#9fb3ff', dark: true },
  { id: 'garden',   label: 'Garden',      note: 'Pressed-leaf corners, soft sage.',         paper: '#eef2e6', ink: 'forest',  accent: '#6f8f5b' },
  { id: 'ledger',   label: 'Ruled',       note: 'Ruled lines and a margin, like a notebook.', paper: '#fbfbf7', ink: 'navy',  accent: '#d9534f' },
  { id: 'telegram', label: 'Telegram',    note: 'Yellow form paper. Short and urgent.',     paper: '#f7e9a8', ink: 'iron',    accent: '#3a3320' },
  { id: 'kraft',    label: 'Kraft',       note: 'Brown paper, rough and warm.',             paper: '#c9a77c', ink: 'iron',    accent: '#6b4a2b' },
  { id: 'plajah',   label: 'Plajah',      note: 'The house sheet — warm white, orange rule.', paper: '#fffaf5', ink: 'iron',  accent: '#ff6b1a' },
];

export const HANDS: Record<HandId, { label: string; body: FontKey; size: number; leading: number; signature: FontKey }> = {
  script:     { label: 'Script',     body: 'caveat',       size: 25, leading: 1.38, signature: 'greatVibes' },
  neat:       { label: 'Neat hand',  body: 'patrickHand',  size: 21, leading: 1.5,  signature: 'dancing' },
  serif:      { label: 'Serif',      body: 'ebGaramond',   size: 19, leading: 1.62, signature: 'greatVibes' },
  typewriter: { label: 'Typewriter', body: 'specialElite', size: 16, leading: 1.75, signature: 'caveat' },
  marker:     { label: 'Marker',     body: 'kalam',        size: 20, leading: 1.5,  signature: 'permanentMarker' },
};

const INKS: Record<InkId, { label: string; light: string; dark: string }> = {
  iron:    { label: 'Iron gall', light: '#1f1b16', dark: '#efe9dc' },
  navy:    { label: 'Navy',      light: '#1d2c5a', dark: '#b9c8ff' },
  oxblood: { label: 'Oxblood',   light: '#6e1a22', dark: '#ffb3ba' },
  forest:  { label: 'Forest',    light: '#23452c', dark: '#b9e3c1' },
  violet:  { label: 'Violet',    light: '#47286e', dark: '#d9c2ff' },
  sepia:   { label: 'Sepia',     light: '#5b3a1e', dark: '#f0cfa8' },
  silver:  { label: 'Silver',    light: '#4a4f5c', dark: '#dfe5f2' },
};
export const INK_IDS = Object.keys(INKS) as InkId[];
export const inkLabel = (id: InkId) => INKS[id].label;
export const inkColor = (id: InkId, dark = false) => (dark ? INKS[id].dark : INKS[id].light);

/** Stamps are glyph + colour; drawn as vector, so they stay crisp and tiny. */
export const STAMPS: { id: string; glyph: string; tint: string; label: string }[] = [
  { id: 'heart',   glyph: '♥',  tint: '#d6455d', label: 'Heart' },
  { id: 'sun',     glyph: '☀',  tint: '#f2a23a', label: 'Sun' },
  { id: 'moon',    glyph: '☾',  tint: '#5a6bd6', label: 'Moon' },
  { id: 'note',    glyph: '♪',  tint: '#ff6b1a', label: 'Music' },
  { id: 'star',    glyph: '★',  tint: '#e0b228', label: 'Star' },
  { id: 'leaf',    glyph: '❦',  tint: '#4f8a52', label: 'Leaf' },
  { id: 'wave',    glyph: '≈',  tint: '#2c86b8', label: 'Sea' },
  { id: 'flower',  glyph: '✿',  tint: '#c75aa0', label: 'Flower' },
];

export interface LetterContent {
  stationery: StationeryId;
  hand: HandId;
  ink?: InkId;
  stampId?: string;
  salutation: string;
  body: string;
  signoff: string;
  signature: string;
  /** Letterhead line, e.g. the writer's name. */
  fromName: string;
  /** Free text — "Lagos", "On the train to Kyoto". Optional and never inferred. */
  place?: string;
  /** Epoch ms the letter is dated. */
  dated: number;
}

export const DEFAULT_LETTER: Omit<LetterContent, 'fromName' | 'dated'> = {
  stationery: 'cream',
  hand: 'script',
  salutation: 'Dear friend,',
  body: '',
  signoff: 'Yours,',
  signature: '',
};

const W = 640;
const M = 64;

const stationeryById = (id: StationeryId) => STATIONERY.find((s) => s.id === id) ?? STATIONERY[0];

/** Stationery art behind the words. Everything is RULE/ORNAMENT role so Tela treats it as furniture. */
function paperArt(s: Stationery, h: number): TelaVectorObject[] {
  const o: TelaVectorObject[] = [rect(0, 0, W, h, s.paper, { label: 'Paper', role: 'GROUND' })];
  switch (s.id) {
    case 'cream':
      // Deckle edge: a soft irregular inner rule plus laid-paper chain lines.
      for (let x = 40; x < W; x += 52) o.push(vr(x, 0, h, s.accent, 0.6, { opacity: 0.08, label: 'Chain line' }));
      o.push(rect(14, 14, W - 28, h - 28, 'none', { stroke: s.accent, strokeWidth: 1, opacity: 0.35, rx: 3, label: 'Deckle' }));
      break;
    case 'airmail': {
      // Chevron border — alternating red and blue parallelograms.
      const band = 12;
      const seg = 28;
      for (let x = -seg; x < W + seg; x += seg) {
        const c = Math.round(x / seg) % 2 === 0 ? '#c8323b' : '#2b4c9b';
        o.push(path(x, 0, seg, band, 'M 0 100 L 50 0 L 100 0 L 50 100 Z', c, { label: 'Border' }));
        o.push(path(x, h - band, seg, band, 'M 0 100 L 50 0 L 100 0 L 50 100 Z', c, { label: 'Border' }));
      }
      o.push(text(M, 26, 220, 'PAR AVION · BY AIR MAIL', { size: 10, font: 'archivo', weight: 800, tracking: 2.4, color: '#2b4c9b', label: 'Airmail label' }));
      break;
    }
    case 'midnight':
      for (let i = 0; i < 26; i++) {
        const x = (i * 97) % (W - 20) + 10;
        const y = (i * 151) % Math.max(200, h - 20) + 10;
        o.push(circle(x, y, i % 5 === 0 ? 1.6 : 0.9, '#dfe5ff', { opacity: 0.55, label: 'Star' }));
      }
      o.push(rect(20, 20, W - 40, h - 40, 'none', { stroke: s.accent, strokeWidth: 0.8, opacity: 0.4, rx: 10, label: 'Frame' }));
      break;
    case 'garden': {
      const leaf = 'M 50 0 C 85 20 95 60 50 100 C 5 60 15 20 50 0 Z';
      const corners: Array<[number, number, number]> = [[18, 18, -30], [W - 70, 18, 30], [18, h - 80, -150], [W - 70, h - 80, 150]];
      for (const [x, y, r] of corners) {
        o.push(path(x, y, 34, 52, leaf, '#8fb27a', { opacity: 0.55, rotation: r, label: 'Leaf' }));
        o.push(path(x + 22, y + 10, 24, 38, leaf, '#6f8f5b', { opacity: 0.45, rotation: r + 40, label: 'Leaf' }));
      }
      break;
    }
    case 'ledger':
      o.push(vr(M - 16, 0, h, s.accent, 1.2, { opacity: 0.55, label: 'Margin' }));
      for (const y of [h * 0.18, h * 0.5, h * 0.82]) o.push(circle(26, y, 7, '#e6e6df', { label: 'Punch hole' }));
      break;
    case 'telegram':
      o.push(rect(0, 0, W, 54, s.accent, { label: 'Telegram band' }));
      o.push(text(M, 18, W - M * 2, 'TELEGRAM', { size: 18, font: 'archivo', weight: 900, tracking: 8, color: s.paper, label: 'Telegram head' }));
      break;
    case 'kraft':
      for (let i = 0; i < 40; i++) {
        const x = (i * 131) % W;
        const y = (i * 89) % h;
        o.push(line(x, y, x + 18, y + 3, '#7a5634', 0.6, { opacity: 0.18, label: 'Fibre' }));
      }
      break;
    case 'plajah':
      o.push(rect(0, 0, 6, h, s.accent, { label: 'Spine' }));
      o.push(circle(W - M + 8, M - 8, 6, s.accent, { label: 'Mark' }));
      break;
  }
  return o;
}

function stampArt(stampId: string | undefined, x: number, y: number): TelaVectorObject[] {
  const st = STAMPS.find((s) => s.id === stampId);
  if (!st) return [];
  return [
    rect(x, y, 70, 84, '#fffdf8', { stroke: '#cfc7b8', strokeWidth: 2, dash: [3, 3], rotation: 4, label: 'Stamp' }),
    rect(x + 7, y + 7, 56, 70, st.tint, { opacity: 0.9, rotation: 4, label: 'Stamp face' }),
    text(x + 7, y + 22, 56, st.glyph, { size: 30, font: 'inter', align: 'center', color: '#fffdf8', rotation: 4, label: 'Stamp glyph' }),
    text(x + 7, y + 62, 56, 'PLAJAH', { size: 7, font: 'archivo', weight: 800, tracking: 1.6, align: 'center', color: '#fffdf8', rotation: 4, label: 'Stamp text' }),
  ];
}

/** Postmark cancel — concentric ring with the date, wavy lines trailing off the stamp. */
function postmarkArt(x: number, y: number, dated: number, place: string | undefined, color: string): TelaVectorObject[] {
  const d = new Date(dated);
  const top = (place || 'Plajah Post').toUpperCase().slice(0, 18);
  const bottom = d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
  const out: TelaVectorObject[] = [
    ellipse(x, y, 92, 92, 'none', { stroke: color, strokeWidth: 1.6, opacity: 0.55, label: 'Postmark' }),
    ellipse(x + 8, y + 8, 76, 76, 'none', { stroke: color, strokeWidth: 0.8, opacity: 0.45, label: 'Postmark' }),
    text(x + 4, y + 30, 84, top, { size: 8, font: 'archivo', weight: 800, tracking: 1.2, align: 'center', color, opacity: 0.6, label: 'Postmark place' }),
    text(x + 4, y + 48, 84, bottom, { size: 8, font: 'archivo', weight: 700, tracking: 0.8, align: 'center', color, opacity: 0.6, label: 'Postmark date' }),
  ];
  for (let i = 0; i < 4; i++) {
    out.push(path(x - 96, y + 26 + i * 12, 96, 10, 'M 0 50 C 12 0 25 0 37 50 C 50 100 62 100 75 50 C 87 0 100 0 100 50', 'none', { stroke: color, strokeWidth: 1.2, opacity: 0.4, open: true, label: 'Cancel' }));
  }
  return out;
}

const dateLine = (t: number) =>
  new Date(t).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/**
 * Sets a letter onto stationery. Pure apart from font loading, so the writer can
 * call it on every keystroke for the live preview.
 */
export function buildLetterDoc(c: LetterContent, ids: { docId: string; ownerId: string }): TelaDoc {
  const s = stationeryById(c.stationery);
  const hand = HANDS[c.hand] ?? HANDS.script;
  const ink = inkColor(c.ink ?? s.ink, !!s.dark);
  const soft = s.dark ? 'rgba(223,229,242,0.62)' : 'rgba(40,32,24,0.55)';
  ensureFontsLoaded([hand.body, hand.signature, 'archivo', 'cormorant']);

  const words: TelaVectorObject[] = [];
  let y = s.id === 'telegram' ? 92 : 76;
  const textW = W - M * 2 - (c.stampId ? 92 : 0);

  // Letterhead — sender name and the date. Small, quiet, the paper does the talking.
  words.push(text(M, y, textW, c.fromName.toUpperCase(), { size: 11, font: 'archivo', weight: 800, tracking: 3, color: s.accent, label: 'Letterhead', role: 'KICKER' }));
  y += 22;
  const dl = [c.place?.trim(), dateLine(c.dated)].filter(Boolean).join(' · ');
  words.push(text(M, y, textW, dl, { size: 13, font: 'cormorant', italic: true, color: soft, label: 'Date line', role: 'DATELINE' }));
  y += 58;

  const sal = text(M, y, W - M * 2, c.salutation || ' ', { size: Math.round(hand.size * 1.15), font: hand.body, color: ink, leading: hand.leading, label: 'Salutation', role: 'HEADLINE' });
  words.push(sal);
  y += sal.h + hand.size * 0.9;

  const bodyTop = y;
  const paragraphs = (c.body || ' ').replace(/\r/g, '').split(/\n{2,}/);
  for (const para of paragraphs) {
    const p = text(M, y, W - M * 2, para.trim() || ' ', { size: hand.size, font: hand.body, color: ink, leading: hand.leading, label: 'Paragraph', role: 'BODY' });
    words.push(p);
    y += p.h + hand.size * hand.leading * 0.6;
  }
  const bodyBottom = y;

  y += hand.size * 0.6;
  const off = text(M + (W - M * 2) * 0.45, y, (W - M * 2) * 0.55, c.signoff || ' ', { size: hand.size, font: hand.body, color: ink, leading: hand.leading, label: 'Sign-off' });
  words.push(off);
  y += off.h + 8;
  const sig = text(M + (W - M * 2) * 0.45, y, (W - M * 2) * 0.55, c.signature || c.fromName, { size: Math.round(hand.size * 1.75), font: hand.signature, color: ink, leading: 1.1, label: 'Signature' });
  words.push(sig);
  y += sig.h + M;

  const h = Math.max(820, Math.ceil(y));
  const art = paperArt(s, h);

  // Ruled stationery gets lines under the body text, aligned to its leading.
  if (s.id === 'ledger') {
    const step = hand.size * hand.leading;
    for (let ly = bodyTop + hand.size + 4; ly < bodyBottom + step; ly += step) art.push(hr(M - 8, ly, W - M * 2 + 16, '#9cb6d8', 0.8, { opacity: 0.5, label: 'Rule' }));
  }

  const furniture = [
    ...stampArt(c.stampId, W - M - 54, 40),
    ...(c.stampId ? postmarkArt(W - M - 150, 52, c.dated, c.place, s.dark ? '#cfd6ea' : '#2a2a2a') : []),
  ];

  const deviceId = `${ids.docId}-sheet`;
  const now = Date.now();
  return {
    id: ids.docId,
    ownerId: ids.ownerId,
    title: `Letter — ${c.salutation.replace(/[,.!]+$/, '') || 'untitled'}`,
    createdAt: now,
    updatedAt: now,
    frames: [{ id: `${ids.docId}-frame`, kind: 'BOARD', preset: 'FREE', x: 0, y: 0, w: W, h, deviceIds: [deviceId], label: 'Letter' }],
    devices: { [deviceId]: { id: deviceId, type: 'VECTOR', name: 'Letter', width: W, height: h, objects: [...art, ...furniture, ...words] } },
    bindings: [],
  };
}

/** Plain text of a letter for search, notifications and the envelope excerpt. */
export function letterPlainText(c: Pick<LetterContent, 'salutation' | 'body' | 'signoff' | 'signature'>): string {
  return [c.salutation, c.body, c.signoff, c.signature].filter(Boolean).join('\n\n').trim();
}

/** Text of any Tela doc — used when the letter was finished in the full editor. */
export function telaDocPlainText(doc: TelaDoc): string {
  const out: string[] = [];
  for (const d of Object.values(doc.devices ?? {})) {
    if (d.type === 'VECTOR') for (const o of d.objects) if (o.kind === 'TEXT' && o.text && o.templateRole !== 'CAPTION') out.push(o.text);
    if (d.type === 'WRITER') for (const b of d.blocks) out.push((b as { text?: string }).text ?? '');
  }
  return out.join('\n').trim();
}

/** Fonts a doc references, so the reader can load them before painting. */
export function ensureLetterFonts(): void {
  const keys = new Set<FontKey>(['archivo', 'cormorant']);
  for (const h of Object.values(HANDS)) { keys.add(h.body); keys.add(h.signature); }
  ensureFontsLoaded(keys);
}
