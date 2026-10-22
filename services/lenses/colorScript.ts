// colorScript — the per-film colour decisions the Colorize lens follows, the way a restoration house keeps a
// colour bible: what the sky, walls and curtains of each set were, what each character wears in each scene,
// what the actors actually looked like (hair, eyes, complexion from colour publicity stills and records),
// and which print look the film gets. A film is fixed, so this is worked out AHEAD of the playhead
// (colorScriptBuilder.ts — shots, subtitles, the desktop vision model) and only APPLIED in real time.
//
// Hues are Oklab degrees, chroma Oklab C (0 … ~.15): [hue, chroma]. Everything is optional; whatever is
// missing falls back to the segmenter's material ramps and then to the shader's own heuristics.
import { DEFAULT_RAMPS, packPalette, type Ramp } from './colorPalette';
import { MAT } from './sceneSegment';
import type { FilmStock } from './lensEngine';

export type HC = [number, number];
export type MaterialName = keyof typeof MAT;

export interface CastMember {
  name: string;
  /** complexion / hair / eye colour (from colour stills, Wikidata P1884 hair colour, P1340 eye colour) */
  skin?: HC; hair?: HC; eyes?: HC;
  source?: string;
}
export interface ShotPerson {
  /** cast name, when the builder could tell who it is */
  who?: string;
  top?: HC; bottom?: HC;
}
export interface ColorShot {
  /** seconds */
  t0: number; t1: number;
  /** set / location colours for this shot: material → colour at mid grey (the ramp keeps its shading) */
  materials?: Partial<Record<MaterialName, HC>>;
  /** on-screen people, left to right */
  people?: ShotPerson[];
  /** where each decision came from: 'subtitle 00:41:07 "your red dress"', 'vision: keyframe 1312' … */
  evidence?: string[];
}
export interface ColorScript {
  filmId: string;
  title?: string;
  year?: number;
  stock?: FilmStock;
  /** 0 = natural colour, 1 = full Technicolor 3-strip dye-transfer print */
  grade?: number;
  materials?: Partial<Record<MaterialName, HC>>;
  cast?: CastMember[];
  shots?: ColorShot[];
  version?: number;
}

/** Re-centre a material's ramp on a requested colour, keeping its grey range and dark/bright shading. */
function retint(r: Ramp, [h, c]: HC): Ramp {
  return { ...r, dark: [h, c * 1.1, r.dark[2]], bright: [h, c * 0.75, r.bright[2]], trust: Math.max(r.trust, 0.85) };
}

/** Looks a film's colour script up by playback time; hands the engine a palette and wardrobe per shot. */
export class ColorScriptPlayer {
  private script: ColorScript | null = null;
  private shotIdx = -2;
  private palette = packPalette();
  /** bumped whenever palette() changes (the engine re-uploads) */
  stamp = 0;

  set(script: ColorScript | null) { this.script = script; this.shotIdx = -2; this.rebuild(null); }
  get(): ColorScript | null { return this.script; }

  private shotAt(t: number): number {
    const s = this.script?.shots; if (!s?.length) return -1;
    let lo = 0, hi = s.length - 1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (t < s[m].t0) hi = m - 1; else if (t >= s[m].t1) lo = m + 1; else return m; }
    return -1;
  }

  private rebuild(shot: ColorShot | null) {
    const ramps: Partial<Record<number, Ramp>> = { ...DEFAULT_RAMPS };
    const apply = (m?: Partial<Record<MaterialName, HC>>) => {
      for (const [name, hc] of Object.entries(m || {})) {
        const id = MAT[name as MaterialName]; const r = ramps[id];
        if (hc && r) ramps[id] = retint(r, hc as HC);
      }
    };
    apply(this.script?.materials);
    apply(shot?.materials);
    this.palette = packPalette(ramps);
    this.stamp++;
  }

  /** Call per frame with the video's currentTime; true when the palette changed. */
  update(t: number): boolean {
    const i = this.shotAt(t);
    if (i === this.shotIdx) return false;
    this.shotIdx = i;
    this.rebuild(i >= 0 ? this.script!.shots![i] : null);
    return true;
  }

  palettePixels() { return this.palette; }

  /** How many on-screen people this shot's script describes (1 = the shot's focal character). */
  peopleCount(): number { return this.shotIdx >= 0 ? this.script?.shots?.[this.shotIdx]?.people?.length ?? 0 : 0; }

  /** Wardrobe for the n-th face from the left in this shot: [topHue, topC, bottomHue, bottomC] (C 0 = unknown). */
  wardrobe(n: number): [number, number, number, number] {
    const p = n < 0 ? undefined : this.shotIdx >= 0 ? this.script?.shots?.[this.shotIdx]?.people?.[n] : undefined;
    return [p?.top?.[0] ?? 0, p?.top?.[1] ?? 0, p?.bottom?.[0] ?? 0, p?.bottom?.[1] ?? 0];
  }

  /** That face's actor, as known: [skinHue, skinC, hairHue, hairC] (C 0 = unknown). */
  look(n: number): [number, number, number, number] {
    const who = n < 0 ? undefined : this.shotIdx >= 0 ? this.script?.shots?.[this.shotIdx]?.people?.[n]?.who : undefined;
    const c = who ? this.script?.cast?.find(m => m.name === who) : undefined;
    return [c?.skin?.[0] ?? 0, c?.skin?.[1] ?? 0, c?.hair?.[0] ?? 0, c?.hair?.[1] ?? 0];
  }

  stock(): FilmStock | undefined { return this.script?.stock; }
  grade(): number { return this.script?.grade ?? 0; }
}
