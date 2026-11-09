// Capacity planner — how much video bitrate each title gets on the chosen medium.
import type { DiscProject, DiscTitle } from './project';
import { effectiveRates, FS_OVERHEAD, mediumById, MUX_OVERHEAD } from './spec';

export const SUB_KBPS = 60;            // PGS stream average
export const MENU_RESERVE_BYTES = 150e6; // per motion menu (background loop + IG)
export const STILL_MENU_BYTES = 8e6;

export type Grade = 'excellent' | 'good' | 'fair' | 'poor';
export interface TitleBudget { titleId: string; name: string; durationSec: number; videoKbps: number; audioKbps: number; subKbps: number; peakKbps: number; bpp: number; grade: Grade; pinned: boolean; capped: boolean }
export interface Budget {
  mediumBytes: number; usableBytes: number; menuBytes: number; usedBytes: number; fill: number;
  fits: boolean; titles: TitleBudget[]; maxVideoKbps: number; maxSystemKbps: number; notes: string[];
}

const weight = (t: DiscTitle) => (t.kind === 'FEATURE' || t.kind === 'EPISODE' ? 1 : t.kind === 'INTRO' ? 0.8 : 0.55);

export function gradeFor(codec: string, bpp: number): Grade {
  const [ex, gd, fr] = codec === 'hevc' ? [0.16, 0.09, 0.05] : [0.3, 0.18, 0.1];
  return bpp >= ex ? 'excellent' : bpp >= gd ? 'good' : bpp >= fr ? 'fair' : 'poor';
}

export function planBudget(p: DiscProject): Budget {
  const m = mediumById(p.mediumId);
  if (!m) throw new Error(`Unknown medium ${p.mediumId}`);
  const rates = effectiveRates(p.format, m);
  const maxVideoKbps = rates.videoMbps * 1000;
  const maxSystemKbps = rates.systemMbps * 1000;
  const notes: string[] = [];
  const menuBytes = p.menus.reduce((s, mn) => s + (mn.background.kind === 'video' || mn.background.kind === 'title' ? MENU_RESERVE_BYTES : STILL_MENU_BYTES), 0);
  const usableBytes = m.bytes * (1 - FS_OVERHEAD) - menuBytes;
  const pps = p.video.w * p.video.h * p.video.fps;

  const base = p.titles.map(t => {
    const audioKbps = t.audio.reduce((s, a) => s + a.kbps, 0);
    const subKbps = t.subtitles.length * SUB_KBPS;
    return { t, audioKbps, subKbps };
  });
  // Bits left for video after audio/subs and mux overhead.
  const elemBudgetKbits = (usableBytes * 8) / 1000 / (1 + MUX_OVERHEAD);
  const fixedKbits = base.reduce((s, b) => s + (b.audioKbps + b.subKbps) * b.t.source.durationSec, 0);
  let videoKbits = elemBudgetKbits - fixedKbits;
  // Pinned titles take theirs first.
  for (const b of base) if (b.t.videoKbps) videoKbits -= b.t.videoKbps * b.t.source.durationSec;
  const floating = base.filter(b => !b.t.videoKbps);
  const wsum = floating.reduce((s, b) => s + weight(b.t) * b.t.source.durationSec, 0);
  const perWeightKbps = wsum > 0 ? videoKbits / wsum : 0;

  const titles: TitleBudget[] = base.map(({ t, audioKbps, subKbps }) => {
    const capFromSystem = maxSystemKbps / (1 + MUX_OVERHEAD) - audioKbps - subKbps;
    const cap = Math.min(maxVideoKbps, capFromSystem);
    // VBR average sits below the cap so peaks (1.25× avg) still clear the ceiling.
    let v = t.videoKbps ?? perWeightKbps * weight(t);
    let capped = false;
    if (v * 1.25 > cap) { v = cap / 1.25; capped = true; }
    v = Math.max(0, Math.floor(v));
    const bpp = pps > 0 ? (v * 1000) / pps : 0;
    return { titleId: t.id, name: t.name, durationSec: t.source.durationSec, videoKbps: v, audioKbps, subKbps, peakKbps: Math.round(v * 1.25), bpp, grade: gradeFor(p.video.codec, bpp), pinned: !!t.videoKbps, capped };
  });

  const usedBytes = menuBytes + titles.reduce((s, t) => s + ((t.videoKbps + t.audioKbps + t.subKbps) * 1000 * t.durationSec * (1 + MUX_OVERHEAD)) / 8, 0);
  const fits = usedBytes <= m.bytes * (1 - FS_OVERHEAD) && titles.every(t => t.videoKbps > 0);
  if (titles.some(t => t.capped)) notes.push('Some titles hit the player read-rate ceiling — there is room left on the disc.');
  if (titles.some(t => t.grade === 'poor')) notes.push('Picture will be soft at this bitrate — move to a bigger disc or split across discs.');
  if (!fits) notes.push('Content does not fit this disc.');
  return { mediumBytes: m.bytes, usableBytes, menuBytes, usedBytes, fill: usedBytes / m.bytes, fits, titles, maxVideoKbps, maxSystemKbps, notes };
}

/** Smallest medium in the destination's list the content fits on at ≥ good quality. */
export function suggestMedium(p: DiscProject, mediaIds: string[]): string | undefined {
  for (const id of mediaIds) {
    const m = mediumById(id);
    if (!m || !m.format.includes(p.format)) continue;
    const b = planBudget({ ...p, mediumId: id });
    if (b.fits && b.titles.every(t => t.grade === 'excellent' || t.grade === 'good')) return id;
  }
  return undefined;
}
