// colorPalette — the Colorize lens's colour for each scene MATERIAL (sceneSegment.ts), as a grey→colour
// ramp rather than one swatch. That is how the 1980s colorization houses worked a region: an artist mask
// plus a lookup from the region's grey level to a colour, so the shading inside it stays the film's own.
// The ramps also encode what panchromatic film did to colour: a red flower photographs dark and a yellow
// one bright, so the flower ramp runs red → yellow with grey; a deep sky is bluer than a hazy bright one.
//
// GPU layout (32×2 RGBA8, row-major, row 0 then row 1):
//   row 0: r,g = Oklab a,b at the dark end (×2 + .5), b = that end's grey L, a = trust (0..1)
//   row 1: r,g = Oklab a,b at the bright end,         b = that end's grey L, a = flags (1 = person, .5 = clothing,
//          .25 = tree: leaves where textured, bark where smooth)
// A film's colour script (colorScript.ts) overrides entries per shot — "the sky here is overcast",
// "the curtains are green" — by handing a patched palette to the engine.
import { MAT, type MaterialId } from './sceneSegment';

export interface Ramp {
  /** dark end: hue (degrees, Oklab), chroma, grey L where it applies */
  dark: [number, number, number];
  bright: [number, number, number];
  /** how far to trust the segmenter over the colorizer's own heuristics */
  trust: number;
  flag?: number;
}

export const DEFAULT_RAMPS: Partial<Record<MaterialId, Ramp>> = {
  [MAT.sky]:      { dark: [240, .075, .45], bright: [252, .03, .92], trust: .9 },    // zenith blue → haze / cloud
  [MAT.foliage]:  { dark: [165, .05, .15], bright: [120, .085, .55], trust: .85, flag: .25 },   // shade blue-green → sunlit yellow-green; flag: bark where smooth
  [MAT.grass]:    { dark: [145, .06, .15], bright: [115, .1, .6], trust: .85 },
  [MAT.earth]:    { dark: [58, .035, .15], bright: [75, .045, .7], trust: .7 },
  [MAT.rock]:     { dark: [70, .012, .2], bright: [82, .02, .8], trust: .6 },
  [MAT.water]:    { dark: [232, .045, .2], bright: [205, .03, .8], trust: .8 },      // deep blue → sky-reflecting teal
  [MAT.building]: { dark: [62, .022, .2], bright: [80, .028, .8], trust: .6 },
  [MAT.plaster]:  { dark: [75, .02, .3], bright: [86, .028, .85], trust: .6 },
  [MAT.floor]:    { dark: [52, .045, .15], bright: [70, .04, .6], trust: .6 },
  [MAT.wood]:     { dark: [50, .06, .1], bright: [66, .05, .6], trust: .7 },         // darker wood runs redder (mahogany)
  [MAT.fabric]:   { dark: [22, .055, .15], bright: [45, .035, .7], trust: .5 },      // period upholstery: burgundy → rose-beige
  [MAT.metal]:    { dark: [250, .01, .1], bright: [240, .008, .9], trust: .6 },
  [MAT.person]:   { dark: [42, .085, .35], bright: [58, .06, .8], trust: .0, flag: 1 },   // routed to the skin/hair/wardrobe logic
  [MAT.road]:     { dark: [75, .006, .2], bright: [82, .01, .8], trust: .7 },
  [MAT.flower]:   { dark: [18, .12, .2], bright: [92, .1, .8], trust: .7 },           // red (dark on pan film) → yellow (bright)
  [MAT.light]:    { dark: [70, .09, .5], bright: [88, .04, .98], trust: .8 },         // tungsten ~2700 K, white-hot core
  [MAT.fire]:     { dark: [42, .14, .35], bright: [82, .09, .95], trust: .9 },        // blackbody: orange rim → yellow core
  [MAT.paper]:    { dark: [80, .02, .3], bright: [90, .016, .9], trust: .5 },
  [MAT.animal]:   { dark: [58, .04, .15], bright: [70, .035, .75], trust: .6 },
  [MAT.food]:     { dark: [55, .06, .2], bright: [82, .06, .8], trust: .6 },
  [MAT.glass]:    { dark: [230, .015, .2], bright: [220, .01, .9], trust: .5 },
  [MAT.apparel]:  { dark: [255, .03, .1], bright: [80, .02, .85], trust: .4, flag: .5 },
};

const enc = (v: number) => Math.max(0, Math.min(255, Math.round((v * 2 + 0.5) * 255)));
const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));

/** Pack ramps into the 32×2 RGBA8 palette the analysis shader reads. */
export function packPalette(ramps: Partial<Record<number, Ramp>> = DEFAULT_RAMPS): Uint8Array {
  const d = new Uint8Array(32 * 2 * 4);
  for (const [k, r] of Object.entries(ramps)) {
    const i = Number(k); if (!r || i < 0 || i >= 32) continue;
    const ends: [number, number, number][] = [r.dark, r.bright];
    ends.forEach(([h, c, L], row) => {
      const o = (row * 32 + i) * 4, rad = h * Math.PI / 180;
      d[o] = enc(Math.cos(rad) * c); d[o + 1] = enc(Math.sin(rad) * c); d[o + 2] = byte(L);
      d[o + 3] = byte(row === 0 ? r.trust : (r.flag ?? 0));
    });
  }
  return d;
}
