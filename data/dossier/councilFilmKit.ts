/**
 * Shared builders for the council-style Dossier films (douglassFilmCouncil, persiaFilmCouncil, partitionFilmCouncil).
 * The slate of every archive plate is built from its asset record (credit, year, licence), never typed twice.
 */
import type { FilmAsset } from '../../services/dossier/film/filmTypes';
import type { CouncilBeat, PlateSpec, Slate } from '../../services/dossier/film/councilTypes';

export interface RawAsset { id: string; date?: string; width: number; height: number; rights: { status: string; credit: string } }

const LICENCE: Record<string, string> = { 'public-domain': 'Public domain', cc0: 'CC0', 'cc-by': 'CC BY', 'cc-by-sa': 'CC BY-SA' };

/** "between 1932 and 1933" -> "1932–1933"; "circa 1866" -> "c. 1866"; "2014-11-13 16:22:13" -> "2014". */
export function yearOf(d: string | undefined): string {
  if (!d) return '';
  const years = d.match(/\d{4}/g) ?? [];
  if (/between/i.test(d) && years.length >= 2) return years[0] === years[1] ? years[0] : `${years[0]}–${years[1]}`;
  if (/c(irca|\.)?\s?\d{4}/i.test(d)) return `c. ${years[0]}`;
  return years[0] ?? d;
}

/** The licence line as the record states it ("CC BY-SA 4.0"), else the plain status. */
export function licenceOf(a: RawAsset): string {
  const m = a.rights.credit.match(/\((CC BY(?:-SA)? [\d.]+|CC0)\)/);
  return m ? m[1] : LICENCE[a.rights.status] ?? a.rights.status;
}

export type PlateOpts = Partial<Slate> & { minHold?: number; distressing?: boolean; treatment?: PlateSpec['treatment']; size?: { w: number; h: number } };

export function createKit(root: string, assets: RawAsset[], reconSizes: Record<string, { w: number; h: number }>, reconCredit: string) {
  /** Archive plate. `source` is the short credit that goes on the slate (institution or author, then the host). */
  const arch = (id: string, title: string, source: string, o: PlateOpts = {}): PlateSpec => {
    const a = assets.find(x => x.id === id);
    if (!a) throw new Error(`council film: unknown archive asset ${id}`);
    const { minHold, distressing, treatment, size, ...slate } = o;
    return {
      asset: id, kind: 'archive', size: size ?? { w: a.width, h: a.height }, minHold, distressing, treatment,
      slate: { title, source, year: yearOf(a.date), licence: licenceOf(a), ...slate },
    };
  };
  const recon = (id: string, evidence: string, o: { fullBleed?: boolean; focusY?: number } = {}): PlateSpec => {
    if (!reconSizes[id]) throw new Error(`council film: unknown reconstruction ${id}`);
    return { asset: id, kind: 'reconstruction', size: reconSizes[id], slate: { evidence }, ...o };
  };
  const beat = (id: string, text: string, claimIds: string[]): CouncilBeat => ({ id, text, claimIds });
  const credit = (id: string) => { const a = assets.find(x => x.id === id)!; return `${a.rights.credit} · ${yearOf(a.date)}`; };
  const assetList = (archiveIds: string[], ext: string, srcDir = 'archival'): FilmAsset[] => [
    ...archiveIds.map(id => ({ id, src: `${root}/${srcDir}/${id}.${ext}`, credit: credit(id) })),
  ];
  const reconList = (ext: string): FilmAsset[] => Object.keys(reconSizes).map(id => ({ id, src: `${root}/recon/${id}.${ext}`, credit: reconCredit }));
  return { arch, recon, beat, credit, assetList, reconList };
}

export interface BeatTimings { [beatId: string]: { audio: string; duration: number } }

/** Merge measured narration timings into the shots (a beat with a voiced line takes its audio and duration). */
export function withNarration<T extends { beats?: CouncilBeat[] }>(shots: T[], n?: BeatTimings): T[] {
  return shots.map(s => !s.beats ? s : { ...s, beats: s.beats.map(b => n?.[b.id] ? { ...b, audio: n[b.id].audio, duration: n[b.id].duration } : b) });
}

/** Browser loader: beat timings from public/ when narration has been produced; silent estimated timing otherwise. */
export async function fetchNarration(url: string): Promise<BeatTimings | undefined> {
  try { const r = await fetch(url); if (r.ok) return await r.json(); } catch { /* silent cut */ }
  return undefined;
}
