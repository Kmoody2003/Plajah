// Soft-goods safety: plush toys, clothing and home textiles. Warnings follow the pattern from the
// first design choice (who it is for, eyes, fill, cords, sleepwear) to selling it (testing,
// certificates, labels). Some combinations are blocked outright: the design has to change.
// Plain-language summaries citing the rule; not legal advice.

import type { Hazard } from './hazards';
import type { Audience, Pattern } from '../soft/patterns';
import { CHILD_SIZES } from '../soft/patterns';

export const AUDIENCE_LABEL: Record<Audience, string> = { adult: 'Adults / teens (decor, collectors)', child: 'Children 3 and up', under3: 'Children under 3', infant: 'Babies under 12 months' };

export function softHazards(p: Pattern, audience: Audience, selling = false): Hazard[] {
  const out: Hazard[] = []; const add = (h: Hazard) => out.push(h); const f = p.features;
  const young = audience === 'under3' || audience === 'infant'; const kid = audience !== 'adult';
  const childSize = !!p.size && CHILD_SIZES.includes(p.size);

  if (p.kind === 'plush') {
    if (young && (f.safetyEyes || f.buttons || f.beads)) add({ id: 'plush-small-parts', stage: 'idea', severity: 'critical', block: true, title: 'Small parts on a toy for under-3s', why: 'Plastic eyes, buttons and beads that come off are choking hazards. Toys for children under 3 must not have parts that fit the small-parts cylinder, even after abuse testing.', mitigate: ['Embroider or appliqué the eyes and nose instead.', 'Pellets only inside a double-stitched inner pouch, and preferably not at all for under-3s.'], cite: '16 CFR 1501; ASTM F963 (16 CFR 1250); EN 71-1' });
    else if (f.safetyEyes) add({ id: 'plush-eyes', stage: 'build', severity: 'high', ack: true, title: 'Safety eyes must not pull out', why: 'Eyes are the most common part to come off a plush toy; a loose eye is a choking hazard for any small child in the house.', mitigate: ['Use eyes with locking washers pressed fully home; pull-test every one.', 'Label the toy "not for children under 3" if it keeps plastic eyes, and consider embroidery anyway.'], cite: 'ASTM F963 torque and tension tests' });
    if (kid) add({ id: 'plush-seams', stage: 'build', severity: 'high', title: 'Seams that open release stuffing and parts', why: 'A child can pull stuffing (or pellets) out through a weak seam and choke on it.', mitigate: ['Short stitch length (2 mm), strong polyester thread, backstitch every end.', 'Ladder-stitch closures with the thread end buried; pull-test every finished toy.'], cite: 'ASTM F963 seam tension test' });
    if (f.sound) add({ id: 'plush-battery', stage: 'idea', severity: 'critical', ack: true, block: young, title: 'Button and coin batteries', why: 'A swallowed button battery burns through the oesophagus in about two hours.', mitigate: ['Sound modules only with a screw-secured battery compartment, sealed in a sewn pocket.', ...(young ? ['For under-3s, leave the sound module out or use a squeaker with no battery.'] : []), 'Warning labels on the product and packaging if it has a button or coin cell.'], cite: "16 CFR 1263 (Reese's Law); ASTM F963" });
    if (young && (f.cords || f.longPile)) add({ id: 'plush-cords', stage: 'idea', severity: 'medium', title: 'Cords, ribbons and long pile', why: 'Ribbons and loops can strangle; long fur sheds fibres a baby can inhale or swallow.', mitigate: ['No ribbons, cords or loops on toys for babies; short-pile minky instead of long faux fur.'], cite: 'ASTM F963 cords and elastics' });
    add({ id: 'plush-fill', stage: 'source', severity: 'low', title: 'Use new, clean fill', why: 'Used or unknown fill can carry contamination and pests, and several US states require stuffed toys to contain only new material.', mitigate: ['Buy toy-grade polyester fibre fill labelled new material.', 'Never fill with beans, rice or loose pellets.'] });
  }

  if (p.kind === 'apparel') {
    if (f.drawstring && (childSize || kid)) add({ id: 'drawstring-child', stage: 'idea', severity: 'critical', block: true, title: 'Drawstrings on children\'s hoods and necks', why: 'Hood and neck drawstrings on children\'s upper outerwear catch on playground slides, bus doors and cribs and have strangled children. US regulators treat them as a substantial product hazard in sizes 2T to 12.', mitigate: ['Remove the drawstring: use elastic, snaps or a fixed hood.', 'Waist or bottom drawstrings (sizes 2T-16): no toggles or knots, no more than 7.5 cm (3″) out when the garment is expanded flat, and bartacked at the midpoint.'], cite: '16 CFR 1120; ASTM F1816; EN 14682' });
    else if (f.drawstring) add({ id: 'drawstring', stage: 'build', severity: 'low', title: 'Drawstring ends', why: 'Long cords can catch in machinery or doors.', mitigate: ['Bartack the cord at the centre back so it cannot pull out; keep the ends short.'] });
    if (f.sleepwear && (childSize || kid)) add({ id: 'sleepwear', stage: 'idea', severity: 'critical', ack: true, title: 'Children\'s sleepwear flammability', why: 'Loose cotton sleepwear ignites easily and has caused serious burns. Children\'s sleepwear (sizes 9 months to 14) must be flame-resistant or tight-fitting to the federal dimensions.', mitigate: ['Either use a fabric certified to pass the sleepwear flammability test, or draft it tight-fitting (snug at chest, waist, seat, wrists and ankles) and label it "wear snug-fitting, not flame resistant".', 'Do not market loose cotton loungewear as sleepwear for children.'], cite: '16 CFR 1615; 16 CFR 1616' });
    add({ id: 'apparel-flam', stage: 'source', severity: selling ? 'medium' : 'low', title: 'Fabric flammability', why: 'Some fabrics (sheer synthetics, brushed or raised surfaces such as some fleeces) burn fast. All clothing sold in the US must meet the general flammability standard.', mitigate: ['Plain cotton, wool and most knits pass; ask the supplier for 16 CFR 1610 results on brushed, napped or sheer fabrics.'], cite: '16 CFR 1610' });
    if (childSize || kid) add({ id: 'apparel-child-trims', stage: 'build', severity: 'high', title: 'Trims on children\'s clothes', why: 'Buttons, snaps, rhinestones and appliqués that come off are choking hazards; snaps and zips must not have sharp points.', mitigate: ['Sew buttons with a shank and strong thread; use set-pressure snaps from a reputable supplier.', 'No decorative cords or loops longer than 7.5 cm at the neck.'], cite: 'CPSIA; 16 CFR 1501 (under 3)' });
  }

  if (p.kind === 'home') {
    if (audience === 'infant') add({ id: 'infant-bedding', stage: 'idea', severity: 'critical', block: p.template !== 'fitted-sheet', ack: true, title: 'Soft bedding and babies', why: 'Pillows, quilts, duvets, bumpers and loose blankets in a baby\'s sleep space are linked to suffocation. Padded crib bumpers are banned in the US.', mitigate: p.template === 'fitted-sheet' ? ['A fitted crib sheet is the only bedding a baby needs: it must fit the mattress tightly with no slack.', 'Test on the real mattress; the elastic must hold every corner down.'] : ['Do not make or market this for babies under 12 months. Design it for older children or adults.', 'Nothing in the crib but a fitted sheet.'], cite: 'Safe Sleep for Babies Act (2022); AAP safe sleep guidance' });
    if (f.weighted) add({ id: 'weighted', stage: 'idea', severity: 'critical', block: audience === 'infant' || audience === 'under3', ack: true, title: 'Weighted blankets', why: 'A weighted blanket can trap a small child who cannot lift it off; deaths have been reported. Regulators warn against weighted sleep products for babies.', mitigate: ['Never for babies or toddlers; for older children only with a size guide (about 10% of body weight) and supervision.', 'Beads double-contained in sewn pockets so they cannot spill.'], cite: 'CPSC weighted infant sleep product warnings' });
    if (kid && p.template === 'throw') add({ id: 'throw-kids', stage: 'idea', severity: 'medium', title: 'Blankets for children', why: 'Loose blankets and fringe can wrap round a small child.', mitigate: ['No fringe, tassels or loops; securely bound edges.'] });
  }

  if (p.kind === 'bag' && kid) add({ id: 'bag-strap', stage: 'idea', severity: 'medium', title: 'Straps and children', why: 'Long straps can catch and strangle.', mitigate: ['Use a breakaway buckle on long straps for children\'s bags.'] });

  if (kid && selling) add({ id: 'cpsia', stage: 'sell', severity: 'high', ack: true, title: 'Children\'s products: testing, certificate, tracking label', why: 'Anything designed mainly for children 12 and under needs third-party testing at a CPSC-accepted lab, a Children\'s Product Certificate, and a permanent tracking label on the product and packaging. Lead (100 ppm substrate, 90 ppm paint) and phthalate limits apply.', mitigate: ['Register as a Small Batch Manufacturer if you qualify: some tests drop away (not all).', 'Keep test reports and the certificate on file; batch and date on the tracking label.', 'EU/UK: EN 71 testing, CE/UKCA marking, technical file, importer details.'], cite: 'CPSIA; 16 CFR 1107, 1110; 16 CFR 1303; 16 CFR 1307; EU 2009/48/EC' });
  if (selling) add({ id: 'labels', stage: 'sell', severity: 'medium', title: 'Required labels', why: 'Textile products sold in the US need fibre content, country of origin and the maker\'s name or RN; clothing needs care instructions. Stuffed toys need a law label in some states.', mitigate: softLabels(p, audience, true), cite: '16 CFR 303; 16 CFR 423' });
  add({ id: 'ip-soft', stage: 'idea', severity: 'low', title: 'Characters, logos and prints', why: 'A plush or print that copies a known character, logo or brand pattern can infringe copyright and trademarks, even hand-made.', mitigate: ['Design your own characters and prints; only use artwork you own or have licensed.'] });
  return out;
}

export function softLabels(p: Pattern, audience: Audience, selling: boolean): string[] {
  const l: string[] = ['Fibre content by % (e.g. "100% polyester") (16 CFR 303)', 'Country of origin ("Made in USA" only if all significant processing is US)', 'Your business name or RN number'];
  if (p.kind === 'apparel') l.push('Care instructions: wash, dry, iron, bleach, dry-clean (16 CFR 423)', 'Size');
  else l.push('Care instructions (recommended)');
  if (p.kind === 'plush') l.push('Stuffed-article law label where required (some US states, e.g. Pennsylvania, Ohio, Massachusetts): "ALL NEW MATERIAL", filling content, registration number');
  if (audience !== 'adult' && selling) l.push('Permanent tracking label: maker, location, date, batch (CPSIA)', 'Age grade (e.g. "3+") and any warning statements');
  if (p.kind === 'plush' && p.features.safetyEyes) l.push('"Not for children under 3 years" if any part could become a small part');
  if (p.features.sound) l.push('Button/coin battery warnings on product and packaging (16 CFR 1263)');
  if (p.features.sleepwear) l.push('Children\'s sleepwear: "Wear snug-fitting, not flame resistant" hangtag and label, if tight-fitting');
  return l;
}

export function softRecallQueries(p: Pattern, audience: Audience): string[] {
  const q: string[] = [];
  if (p.kind === 'plush') q.push('plush toy', 'stuffed animal');
  if (p.template === 'hoodie') q.push(p.features.drawstring ? 'hooded sweatshirt drawstring' : 'hooded sweatshirt');
  if (p.features.sleepwear) q.push('children\'s pajamas');
  if (p.features.weighted) q.push('weighted blanket');
  if (p.template === 'fitted-sheet' && audience === 'infant') q.push('crib sheet');
  if (p.template === 'pillow-envelope' && audience !== 'adult') q.push('pillow');
  if (p.template === 'throw' && audience !== 'adult') q.push('blanket');
  return q.slice(0, 3);
}
