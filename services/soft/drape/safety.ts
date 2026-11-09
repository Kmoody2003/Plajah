// Fit findings that become hazards. The soft-goods hazards (services/safety/softHazards.ts) still
// apply in full; these add what only the drape can see: a child's neckline that will not pass the
// head or presses on the neck, loose or long children's sleepwear (the federal tight-fitting
// dimensions exist because loose cotton sleepwear burns), compression past comfort, and plush
// seams strained by stuffing (an opened seam releases fill a child can choke on).

import type { Hazard } from '../../safety/hazards';
import { CHILD_SIZES, type Audience, type Pattern } from '../patterns';
import type { FitReport } from './fit';
import type { DrapeSetup } from './drape';

export function fitHazards(p: Pattern, audience: Audience, r: FitReport, s: DrapeSetup | null): Hazard[] {
  const out: Hazard[] = []; const child = audience !== 'adult' || (!!p.size && CHILD_SIZES.includes(p.size)); const body = s?.body;
  if (p.kind === 'apparel' && body) {
    const pullover = p.template === 'hoodie' || p.template === 'tee' || !p.features.zip;
    if (child && r.neckPressure != null && r.neckPressure > 0.8) out.push({ id: 'fit-neck-tight', stage: 'idea', severity: 'critical', ack: true, block: r.neckPressure > 2, title: 'Tight at a child\'s neck', why: `The drape presses ${r.neckPressure.toFixed(1)} kPa on the neck. Anything snug round a child's neck can restrict breathing or blood flow, and catches if pulled.`, mitigate: ['Lower or widen the neckline, or use a more stretchy rib band.', 'Check on the avatar again: the neck should show no pressure.'], cite: 'ASTM F1816 (neck and hood); CPSC guidance on children\'s neckwear' });
    if (pullover && r.neckOpening != null && r.neckOpening < body.m.head * 1.02) out.push({ id: 'fit-head-opening', stage: 'idea', severity: child ? 'high' : 'medium', ack: true, title: 'Neck opening may not pass over the head', why: `Even stretched, the neckline opens to about ${Math.round(r.neckOpening / 10)} cm; this head measures ${Math.round(body.m.head / 10)} cm round. Forcing a tight neckline over a child's head scrapes the face and strains the seam.`, mitigate: ['Widen or deepen the neckline, add a placket, snaps or a zip.', 'Use a rib band with more stretch.'] });
    if (child && p.features.sleepwear) {
      if (r.loosePct > 20 || (r.poms.find(x => x.name === 'Chest')?.ease ?? 0) > 60) out.push({ id: 'fit-sleepwear-loose', stage: 'idea', severity: 'critical', ack: true, block: true, title: 'Loose-fitting children\'s sleepwear', why: 'On the avatar this garment stands away from the body. Children\'s sleepwear that is not flame-resistant must be tight-fitting to the federal maximum dimensions; loose fabric catches fire and burns close to the skin.', mitigate: ['Draft it snug (fitted, little or no ease at chest, waist, seat, wrists and ankles), or', 'use fabric certified to pass the children\'s sleepwear flammability test.'], cite: '16 CFR 1615; 16 CFR 1616 (tight-fitting dimensions)' });
      if (r.sleeveEnd != null && r.sleeveEnd > 25) out.push({ id: 'fit-sleepwear-long', stage: 'idea', severity: 'high', ack: true, title: 'Long sleeves or hems on children\'s sleepwear', why: `Sleeves reach ${Math.round(r.sleeveEnd / 10)} cm past the wrist on this body. Trailing sleeves and long hems reach candles and stove flames and trip small children.`, mitigate: ['Shorten to the wrist, or use a snug cuff.', 'Tight-fitting sleepwear must not exceed the wrist and ankle dimensions in 16 CFR 1615/1616.'], cite: '16 CFR 1615; 16 CFR 1616' });
    }
    if (r.maxPressure > 4) out.push({ id: 'fit-pressure', stage: 'build', severity: child ? 'high' : 'medium', title: 'Pressure past comfort', why: `Peak contact pressure ${r.maxPressure.toFixed(1)} kPa. Over about 4 kPa (30 mmHg) is medical-compression territory and can restrict circulation, especially for children.`, mitigate: ['Add ease where the pressure map is red, or choose a stretchier fabric.'] });
  }
  if (p.kind === 'plush' && r.plush) {
    if ((r.plush.seamLoad ?? r.plush.seamStrain / 0.25) > 1.2 || r.seamGap > 10) out.push({ id: 'fit-plush-seams', stage: 'build', severity: audience === 'adult' ? 'medium' : 'high', ack: audience !== 'adult', title: 'Stuffed seams under strain', why: `Stuffed to the planned fill, the seams stretch ${Math.round(r.plush.seamStrain * 100)}%. A seam that opens releases stuffing (and any pellets), a choking hazard for small children.`, mitigate: ['Stitch length 2 mm or shorter, strong polyester thread, double-stitch curves and the base.', 'Stuff a little softer, or widen the narrowest parts.'], cite: 'ASTM F963 seam tension test; EN 71-1' });
  }
  return out;
}
