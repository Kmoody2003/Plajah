/**
 * compileCouncil: CouncilFilm (authored data) -> CouncilTimeline (deterministic, gated).
 *
 * Pure and node-testable: no canvas, no fonts. The narration's word timing is the master clock; shots are laid end to
 * end, never overlapping, with each cut landing 3 frames after the last phoneme of a beat (in a gap of at least
 * 0.5 s between beats), so no transition begins inside a spoken word.
 */
import type {
  Box, CouncilFilm, CouncilShot, CouncilTheme, CouncilTimeline, FoleyEvent, LaidPlate, PlateSpec, TBeat, TShot, TransitionName,
} from './councilTypes';
import { DH, DW, GEO, intersects } from './councilTypes';
import { buildCues, estimateWords, markAccents, MAX_CAPTION_CHARS } from './captions';
import { CouncilGateError, labelGate } from './provenance';
import { GATE, KIT } from './transitions';

export const FPS = 30;
export const TITLE_LEN = 6.5;
export const CARD_LEN = 45 / FPS;
export const END_LEN = 12;
/** Gap between a beat's last phoneme and the cut (3 frames), and between beats inside one shot. */
export const CUT_AFTER = 3 / FPS;
export const BEAT_GAP = 0.38;
export const DEFAULT_PAD_IN = 0.45;
/** Titles hold: a lower third lasts at least this long and retracts in 6 frames. */
export const LT_HOLD = 3.2;
export const LT_MIN_SPACING = 25;

/** Council theme from an exhibit theme (services/dossier/dossierTheme.ts) plus the shared body faces. */
export function councilTheme(base: { display: string; accent: string; bg: string; upper: boolean }, over: Partial<CouncilTheme> = {}): CouncilTheme {
  return {
    display: base.display, upper: base.upper, accent: base.accent, bg: base.bg,
    serif: "'Source Serif 4', Georgia, 'Times New Roman', serif",
    sans: "'Inter Tight', 'Inter', system-ui, sans-serif",
    ink: '#f1e9da', stamp: '#ff6b57', titleGesture: 'set', ...over,
  };
}

const strip = (w: string) => w.replace(/^[“"'(]+|[.,;:!?”"')—]+$/g, '');

/** Lay plates out on the evidence field. Integer boxes so plate pixels are scaled once, identically, everywhere. */
export function layoutPlates(plates: PlateSpec[]): { laid: LaidPlate[]; slateBox: Box } {
  const bottom = GEO.plateZone.y + GEO.plateZone.h;
  if (plates.length === 1 && plates[0].fullBleed) {
    const p = plates[0], b = GEO.bleed;
    const scale = Math.max(b.w / p.size.w, b.h / p.size.h);
    const cw = b.w / scale, ch = b.h / scale;
    const crop: Box = { x: (p.size.w - cw) / 2, y: (p.size.h - ch) * (p.focusY ?? 0.5), w: cw, h: ch };
    return { laid: [{ ...b, spec: p, crop }], slateBox: { x: 96, y: b.y + b.h + 12, w: DW - 192, h: 62 } };
  }
  const zone = plates.every(p => p.kind === 'reconstruction') ? GEO.reconZone : GEO.plateZone;
  const gap = 48;
  const aspects = plates.map(p => p.size.w / p.size.h);
  const sum = aspects.reduce((a, b) => a + b, 0);
  const h = Math.floor(Math.min(zone.h, (GEO.plateZone.w - gap * (plates.length - 1)) / sum, ...plates.map(p => (zone.w) / (p.size.w / p.size.h))));
  const widths = aspects.map(a => Math.floor(a * h));
  const total = widths.reduce((a, b) => a + b, 0) + gap * (plates.length - 1);
  let x = GEO.plateZone.x;   // plates hang on the left of the field; the slate sits under the plate's left edge
  const laid = plates.map((p, i) => { const l: LaidPlate = { x, y: bottom - h, w: widths[i], h, spec: p }; x += widths[i] + gap; return l; });
  return { laid, slateBox: { x: laid[0].x, y: bottom + 16, w: GEO.plateZone.x + GEO.plateZone.w - laid[0].x, h: GEO.slateH } };
}

const wordIndex = (words: Array<{ text: string }>, anchor: string) => words.findIndex(w => strip(w.text).toLowerCase() === anchor.toLowerCase());

export function compileCouncil(film: CouncilFilm): CouncilTimeline {
  const issues: string[] = labelGate(film);
  const warnings: string[] = [];
  const shots: TShot[] = [];
  const cues: CouncilTimeline['cues'] = [];
  const foley: FoleyEvent[] = [];

  // Title sequence.
  const titleLaid = layoutPlates([film.titlePlate]);
  shots.push({
    spec: { id: 'title', room: -1, plates: [film.titlePlate] }, index: 0, start: 0, end: TITLE_LEN, kind: 'title', transition: 'breath', trDur: 0,
    voiceAt: TITLE_LEN, beats: [], plates: titleLaid.laid, slateBox: titleLaid.slateBox, anchors: {}, room: -1,
  });
  foley.push({ at: 2.2, kind: 'tap' }, { at: 2.2 + 8 / FPS, kind: 'tap' });

  let t = TITLE_LEN;
  film.shots.forEach((spec, k) => {
    const index = shots.length;
    const tr: TransitionName = spec.transition ?? 'breath';
    const kit = KIT[tr];
    const start = t;
    if (spec.kind === 'card') {
      const end = start + CARD_LEN;
      shots.push({ spec, index, start, end, kind: 'card', transition: tr, trDur: 0, voiceAt: start, beats: [], plates: [], anchors: {}, room: spec.room });
      t = end; return;
    }
    const plates = layoutPlates(spec.plates ?? []);
    // Beats: clock the narration. First beat starts after padIn; later beats follow after a gap.
    const timed = (spec.beats ?? []).map(b => ({ b, ...estimateWords(b.text, b.duration) }));
    let padIn = DEFAULT_PAD_IN;
    if (tr === 'stampSlam' && spec.stamp && timed.length) {
      // The slam's impact frame lands on the spoken year: the beat's own word for it starts at the impact.
      const i = wordIndex(timed[0].words, spec.stamp);
      // (never less than 30 ms: the cut still lands in a gap of at least 120 ms, 3 frames + 30 ms after the last phoneme)
      padIn = i >= 0 && kit.foley ? Math.max(0.03, kit.foley.at - timed[0].words[i].a) : 0.03;
      if (i < 0) issues.push(`${spec.id}: stamp "${spec.stamp}" is not a word of the first beat`);
    } else if (tr === 'reconGate') padIn = GATE.fadeFrom + 0.25;
    else if (tr !== 'breath') padIn = Math.max(DEFAULT_PAD_IN, kit.dur * 0.6);
    const voiceAt = start + padIn;
    let at = voiceAt;
    const beats: TBeat[] = timed.map(({ b, words, total }, bi) => {
      const flags = markAccents(words.map(w => w.text), film.accentTerms);
      const a = at;
      const tw = words.map((w, i) => ({ text: w.text, a: a + w.a, b: a + w.b, accent: flags[i] }));
      at = a + total + BEAT_GAP;
      return { id: b.id, text: b.text, claimIds: b.claimIds, a, b: a + total, words: tw, audio: b.audio, voiced: !!b.audio };
    });
    const voiceEnd = beats.length ? beats[beats.length - 1].b : start;
    const holds = [kit.dur + (spec.minHold ?? 0), ...(spec.plates ?? []).map(p => kit.dur + (p.minHold ?? 0))];
    let end = Math.max(beats.length ? voiceEnd + CUT_AFTER : 0, start + Math.max(...holds, 1.5));

    // Anchors for graphics and lower thirds.
    const anchors: Record<string, number> = {};
    const allWords = beats.flatMap(b => b.words);
    const findAnchor = (key: string) => {
      const i = wordIndex(allWords, key);
      if (i < 0) { issues.push(`${spec.id}: graphic anchor "${key}" is not a spoken word`); return; }
      anchors[key] = allWords[i].a;
    };
    const g = spec.graphic;
    if (g?.kind === 'dateStack') g.items.forEach(it => findAnchor(it.anchor)); else if (g) { findAnchor(g.anchor); if (g.kind === 'wage') findAnchor(g.anchor2); }
    if (g?.kind === 'counter' && anchors[g.anchor] !== undefined) end = Math.max(end, anchors[g.anchor] + 2.6);
    if (g?.kind === 'clock' && anchors[g.anchor] !== undefined) end = Math.max(end, anchors[g.anchor] + 2.4);   // 93 held 2 s
    if (g?.kind === 'clock' && anchors[g.anchor] !== undefined) {
      // Ratchet ticks while the numeral counts (15 frames up to the spoken word).
      for (let f = 15; f >= 3; f -= 3) foley.push({ at: anchors[g.anchor] - f / FPS, kind: 'tick' });
    }

    let lowerThird: TShot['lowerThird'];
    if (spec.lowerThird) {
      const a = Math.max(start + kit.dur, voiceAt + (spec.lowerThird.at ?? 0.6));
      if (end < a + LT_HOLD + 0.2) end = a + LT_HOLD + 0.2;
      lowerThird = { a, b: a + LT_HOLD, box: GEO.lowerThird };
    }
    if (kit.foley) foley.push({ at: start + kit.foley.at, kind: kit.foley.kind });

    const shot: TShot = { spec, index, start, end, kind: 'plates', transition: tr, trDur: kit.dur, voiceAt, beats, plates: plates.laid, slateBox: plates.slateBox, lowerThird, anchors, room: spec.room };
    shots.push(shot);
    beats.forEach(b => cues.push(...buildCues(index, b.words, FPS)));
    t = end;
  });

  // End card.
  const endStart = t;
  shots.push({ spec: { id: 'end', room: -1 }, index: shots.length, start: endStart, end: endStart + END_LEN, kind: 'end', transition: 'groundDip', trDur: KIT.groundDip.dur, voiceAt: endStart, beats: [], plates: [], anchors: {}, room: -1 });
  const duration = endStart + END_LEN;

  // Rooms.
  const rooms = film.rooms.map((r, index) => {
    const mine = shots.filter(s => s.room === index);
    const [a, b] = r.exhibitRooms;
    return {
      index, title: r.title, exhibitRooms: r.exhibitRooms, start: mine.length ? mine[0].start : 0, end: mine.length ? mine[mine.length - 1].end : 0,
      label: a === b ? `Room ${a} of ${film.exhibitRoomCount}` : `Rooms ${a}–${b} of ${film.exhibitRoomCount}`,
    };
  });

  // Skips and silences.
  const skips: CouncilTimeline['skips'] = [{ from: 0, to: TITLE_LEN, label: 'Skip the title' }];
  const silences: CouncilTimeline['silences'] = [];
  for (const s of shots) {
    if (s.kind !== 'card' || s.transition !== 'silenceHold') continue;
    const room = rooms[s.room];
    skips.push({ from: s.start, to: room.end, label: 'Skip this section' });
    silences.push({ from: Math.max(0, s.start - 30 / FPS), to: room.end });
  }

  // ── Gates that need timing ──
  const cap: Box = GEO.caption;
  shots.forEach(s => {
    if (s.kind === 'plates') {
      const full = s.plates.some(p => p.spec.fullBleed);
      for (const p of s.plates) {
        if (intersects(p, cap)) issues.push(`${s.spec.id}: caption band overlaps plate ${p.spec.asset}`);
        if (s.lowerThird && intersects(p, s.lowerThird.box)) issues.push(`${s.spec.id}: lower third overlaps plate ${p.spec.asset}`);
        if (!full && p.x + p.w > GEO.margin.x) issues.push(`${s.spec.id}: plate ${p.spec.asset} runs into the margin column`);
        if (p.x < 0 || p.y < 0 || p.x + p.w > DW || p.y + p.h > DH) issues.push(`${s.spec.id}: plate ${p.spec.asset} leaves the frame`);
        if (p.spec.minHold && s.end - s.start - s.trDur < p.spec.minHold - 1e-6) issues.push(`${s.spec.id}: ${p.spec.asset} is held ${(s.end - s.start - s.trDur).toFixed(1)}s, needs ${p.spec.minHold}s`);
      }
      if (s.slateBox && intersects(s.slateBox, cap)) issues.push(`${s.spec.id}: provenance slate overlaps the caption band`);
      if (s.lowerThird && s.plates.some(p => p.spec.distressing)) issues.push(`${s.spec.id}: lower third on a distressing plate`);
      if (s.lowerThird && full) issues.push(`${s.spec.id}: lower third on a full-bleed painting`);
      if (s.spec.graphic && full) issues.push(`${s.spec.id}: graphic on a full-bleed painting`);
      for (const b of s.beats) {
        if (!b.claimIds.length) issues.push(`${s.spec.id}/${b.id}: factual narration cites no claim`);
      }
    }
  });
  const lts = shots.filter(s => s.lowerThird);
  for (let i = 1; i < lts.length; i++) {
    if (lts[i].lowerThird!.a - lts[i - 1].lowerThird!.a < LT_MIN_SPACING) issues.push(`lower thirds ${lts[i - 1].spec.id} and ${lts[i].spec.id} are ${(lts[i].lowerThird!.a - lts[i - 1].lowerThird!.a).toFixed(1)}s apart; the rule is one per ${LT_MIN_SPACING}s`);
  }
  // Captions: two lines at most (by characters here; the painter re-checks with real font metrics), reading speed.
  for (const c of cues) {
    if (c.text.length > MAX_CAPTION_CHARS) issues.push(`caption too long (${c.text.length} chars): ${c.text}`);
    const cps = c.text.length / Math.max(0.2, c.b - c.a);
    if (cps > 15.5) warnings.push(`caption reads at ${cps.toFixed(1)} chars/s: ${c.text.slice(0, 50)}`);
  }
  // Captions never overlap in time: a cue that starts early (a slam lands on the first word) hard-swaps the previous one.
  for (let i = 1; i < cues.length; i++) if (cues[i].a < cues[i - 1].b) cues[i - 1].b = cues[i].a;
  for (let i = 0; i < cues.length; i++) if (cues[i].b <= cues[i].a) issues.push(`caption ${i} has no duration`);

  if (issues.length) throw new CouncilGateError(issues);

  const beatsAll = shots.flatMap(s => s.beats);
  const voiced = beatsAll.filter(b => b.voiced).length;
  return {
    film, fps: FPS, duration, titleEnd: TITLE_LEN, shots, rooms, cues, skips, silences, foley: foley.sort((a, b) => a.at - b.at),
    timing: voiced === 0 ? 'estimated' : voiced === beatsAll.length ? 'voiced' : 'mixed', warnings,
  };
}

/** Every claim id the film's narration cites. */
export const citedClaims = (film: CouncilFilm): string[] => [...new Set(film.shots.flatMap(s => (s.beats ?? []).flatMap(b => b.claimIds)))];

export const shotAt = (tl: CouncilTimeline, t: number): TShot => {
  const i = tl.shots.findIndex(s => t >= s.start && t < s.end);
  return tl.shots[i < 0 ? tl.shots.length - 1 : i];
};

export type { CouncilShot };
