/**
 * Figures for the Medicine courses (med-*). Every figure restates a standard textbook structure that the lesson text itself
 * describes. Computed curves are labelled models (first-order decay, positive predictive value from stated sensitivity and
 * specificity); schematics carry no values. No diagnostic or dosing advice and no reference ranges beyond those in the lesson.
 */
import type { Figure } from '../../components/learn/lesson/figures';

const range = (a: number, b: number, step: number) => { const o: number[] = []; for (let v = a; v <= b + 1e-9; v += step) o.push(+v.toFixed(6)); return o; };
const pts = (xs: number[], f: (x: number) => number) => xs.map(x => [x, +f(x).toFixed(3)] as [number, number]);

/** First-order elimination: fraction of the starting amount left after t hours, C = C0 * 0.5^(t / t_half). */
const remaining = (t: number, tHalf: number) => 100 * Math.pow(0.5, t / tHalf);

const HALF_LIVES = range(0, 5, 1);
const HOURS_48 = range(0, 48, 6);
const HOURS_24 = range(0, 24, 6);
const FPR = range(0, 1, 0.1);

export const FIGURES: Record<string, Figure[]> = {
  'med-g912.l02': [
    {
      id: 'double-pump', type: 'diagram', after: 0, layout: 'wide', title: 'Blood through the double pump',
      nodes: [
        { id: 'body', label: 'Body tissues', col: 0, row: 0 }, { id: 'ra', label: 'Right atrium', col: 1, row: 0 },
        { id: 'rv', label: 'Right ventricle', col: 2, row: 0 }, { id: 'lungs', label: 'Lungs', col: 3, row: 0 },
        { id: 'la', label: 'Left atrium', col: 3, row: 1 }, { id: 'lv', label: 'Left ventricle', col: 2, row: 1 },
      ],
      edges: [['body', 'ra'], ['ra', 'rv'], ['rv', 'lungs'], ['lungs', 'la'], ['la', 'lv'], ['lv', 'body']],
      caption: 'Oxygen-poor blood returns from the body to the right side, which pumps it through the pulmonary circuit to the lungs; oxygen-rich blood returns to the left side, which pumps it through the systemic circuit to the body.',
      alt: 'A loop diagram. Body tissues to right atrium, to right ventricle, to lungs (the pulmonary circuit), to left atrium, to left ventricle, and back to body tissues (the systemic circuit). The tricuspid valve lies between right atrium and ventricle, the mitral valve between left atrium and ventricle, and the pulmonary and aortic valves at the exits.',
    },
    {
      id: 'co-bp', type: 'diagram', after: 3, layout: 'inline', title: 'What sets cardiac output and blood pressure',
      nodes: [
        { id: 'hr', label: 'Heart rate', col: 0, row: 0 }, { id: 'sv', label: 'Stroke volume', col: 0, row: 1 },
        { id: 'co', label: 'Cardiac output', col: 1, row: 0 }, { id: 'bp', label: 'Blood pressure', col: 2, row: 0 },
        { id: 'res', label: 'Resistance', col: 2, row: 1 },
      ],
      edges: [['hr', 'co', 'x'], ['sv', 'co', 'x'], ['co', 'bp'], ['res', 'bp']],
      caption: 'Cardiac output is heart rate multiplied by stroke volume. Blood pressure depends on cardiac output and on resistance, which is set mainly by the width of small arteries.',
      alt: 'Heart rate and stroke volume are multiplied to give cardiac output. Cardiac output and resistance together determine blood pressure.',
    },
  ],

  'med-physiology.l05': [
    {
      id: 'conduction-path', type: 'diagram', after: 3, layout: 'wide', title: 'The cardiac conduction pathway',
      nodes: [
        { id: 'sa', label: 'SA node', col: 0, row: 0 }, { id: 'atria', label: 'Atrial muscle', col: 1, row: 0 },
        { id: 'av', label: 'AV node', col: 2, row: 0 }, { id: 'his', label: 'Bundle of His', col: 3, row: 0 },
        { id: 'bb', label: 'Bundle branches', col: 3, row: 1 }, { id: 'pur', label: 'Purkinje fibres', col: 2, row: 1 },
        { id: 'vent', label: 'Ventricles', col: 1, row: 1 },
      ],
      edges: [['sa', 'atria'], ['atria', 'av'], ['av', 'his'], ['his', 'bb'], ['bb', 'pur'], ['pur', 'vent']],
      caption: 'The impulse starts in the sinoatrial node and spreads through the atria to the AV node, where slow conduction adds a delay of about 0.1 second so the ventricles can fill. It then travels down the bundle of His and the left and right bundle branches to the fast-conducting Purkinje fibres, so the ventricles contract nearly together.',
      alt: 'Sequence: sinoatrial node, atrial muscle, atrioventricular node (a delay of about 0.1 second), bundle of His, left and right bundle branches, Purkinje fibres, ventricular muscle.',
    },
    {
      id: 'ecg-waves', type: 'timeline', after: 4, layout: 'inline', title: 'Reading one beat on the ECG',
      events: [
        { when: 'P wave', label: 'Atrial depolarization' },
        { when: 'PR interval', label: 'AV conduction' },
        { when: 'QRS complex', label: 'Ventricular depolarization (atrial repolarization is hidden within it)' },
        { when: 'ST segment', label: 'Corresponds to the plateau of the ventricular action potential' },
        { when: 'T wave', label: 'Ventricular repolarization' },
      ],
      caption: 'Each part of the surface ECG, in order of occurrence, matches an electrical event in the heart.',
      alt: 'In order across one beat: P wave is atrial depolarization; PR interval is AV conduction; QRS complex is ventricular depolarization; ST segment is the plateau; T wave is ventricular repolarization.',
    },
    {
      id: 'ecg-rate-rule', type: 'graph', after: 6, layout: 'inline', title: 'The 300 rule for heart rate',
      fn: boxes => 300 / boxes, domain: [2, 6], x: { label: 'Large boxes between successive R waves' }, y: { label: 'Heart rate (beats per minute)' },
      marks: [{ x: 3, label: '3 boxes: 100' }, { x: 4, label: '4 boxes: 75' }, { x: 5, label: '5 boxes: 60' }],
      caption: 'For a regular rhythm, heart rate is estimated as 300 divided by the number of large boxes between R waves; the lesson example of 4 boxes gives 75 beats per minute.',
      alt: 'A falling curve of heart rate against large boxes between R waves, rate = 300 divided by boxes. Three boxes gives 100, four boxes gives 75, five boxes gives 60 beats per minute.',
    },
  ],

  'med-physiology.l06': [{
    id: 'cardiac-cycle-phases', type: 'timeline', after: 0, layout: 'inline', title: 'Phases of the cardiac cycle',
    events: [
      { when: 'Atrial systole', label: 'Atria contract and add the last part of ventricular filling' },
      { when: 'Isovolumetric contraction', label: 'AV valve closes (S1); ventricular pressure is above atrial but below aortic, so volume is constant' },
      { when: 'Rapid ejection', label: 'Ventricular pressure exceeds aortic pressure, the aortic valve opens and most of the stroke volume leaves' },
      { when: 'Reduced ejection', label: 'Flow continues more slowly as pressures equalize' },
      { when: 'Isovolumetric relaxation', label: 'All valves closed; the aortic valve closes (S2), producing the dicrotic notch' },
      { when: 'Rapid filling', label: 'Ventricular pressure falls below atrial pressure, the mitral valve opens and blood flows in passively' },
      { when: 'Diastasis', label: 'Filling slows before the next atrial systole' },
    ],
    caption: 'The valves open and close passively with pressure gradients, which is what drives the order of the phases and the two heart sounds.',
    alt: 'Seven phases in order: atrial systole, isovolumetric contraction, rapid ejection, reduced ejection, isovolumetric relaxation, rapid filling, diastasis. S1 marks AV valve closure at the start of contraction and S2 marks aortic valve closure at the start of relaxation.',
  }],

  'med-physiology.l07': [
    {
      id: 'co-determinants', type: 'diagram', after: 0, layout: 'wide', title: 'What determines cardiac output',
      nodes: [
        { id: 'pre', label: 'Preload', col: 0, row: 0 }, { id: 'aft', label: 'Afterload', col: 0, row: 1 }, { id: 'con', label: 'Contractility', col: 0, row: 2 },
        { id: 'sv', label: 'Stroke volume', col: 1, row: 1 }, { id: 'hr', label: 'Heart rate', col: 2, row: 0 }, { id: 'co', label: 'Cardiac output', col: 2, row: 1 },
      ],
      edges: [['pre', 'sv'], ['aft', 'sv'], ['con', 'sv'], ['sv', 'co', 'x'], ['hr', 'co', 'x']],
      caption: 'Cardiac output is stroke volume times heart rate. Stroke volume depends on preload, afterload and contractility: more preload or contractility raises it, and more afterload lowers it.',
      alt: 'Preload, afterload and contractility feed into stroke volume. Stroke volume and heart rate are multiplied to give cardiac output.',
    },
    {
      id: 'frank-starling-schematic', type: 'graph', after: 1, layout: 'inline', title: 'The Frank-Starling idea (schematic)',
      fn: x => 1 - Math.exp(-3 * x), domain: [0, 1], x: { label: 'Preload: filling at end of diastole (arbitrary units)' }, y: { label: 'Stroke volume (arbitrary units)' },
      caption: 'A labelled schematic with no real values: within limits, greater filling gives a stronger contraction and so a larger stroke volume.',
      alt: 'A schematic rising curve that levels off, showing stroke volume increasing as preload increases, within limits. Axes are in arbitrary units.',
    },
  ],

  'med-physiology.l14': [{
    id: 'creatinine-gfr', type: 'graph', after: 5, layout: 'inline', title: 'Steady-state plasma creatinine against GFR (model)',
    fn: g => 1 / g, domain: [0.1, 1.2], x: { label: 'GFR (fraction of normal)' }, y: { label: 'Plasma creatinine (fraction of normal)' },
    marks: [{ x: 1, label: 'normal: 1' }, { x: 0.5, label: 'half the GFR: double the creatinine' }],
    caption: 'A model of the lesson statement: at steady state production equals excretion, so plasma creatinine varies inversely with GFR and halving GFR doubles it. After a sudden fall in GFR the rise lags behind.',
    alt: 'A falling curve, plasma creatinine equals one divided by GFR (both as fractions of normal). At normal GFR of 1 creatinine is 1; at a GFR of 0.5 creatinine is 2.',
  }],

  'med-physiology.l15': [
    {
      id: 'nephron-path', type: 'diagram', after: 0, layout: 'wide', title: 'Fluid path along the nephron',
      nodes: [
        { id: 'glom', label: 'Glomerulus', col: 0, row: 0 }, { id: 'pct', label: 'Proximal tubule', col: 1, row: 0 },
        { id: 'dtl', label: 'Descending limb', col: 2, row: 0 }, { id: 'tal', label: 'Thick ascending', col: 3, row: 0 },
        { id: 'dct', label: 'Distal tubule', col: 3, row: 1 }, { id: 'cd', label: 'Collecting duct', col: 2, row: 1 },
        { id: 'urine', label: 'Urine', col: 1, row: 1 },
      ],
      edges: [['glom', 'pct'], ['pct', 'dtl'], ['dtl', 'tal'], ['tal', 'dct'], ['dct', 'cd'], ['cd', 'urine']],
      caption: 'The proximal tubule reclaims about two thirds of filtered sodium and water and nearly all glucose. The descending limb is permeable to water; the thick ascending limb reabsorbs sodium through NKCC2 but not water; the distal tubule uses the thiazide-sensitive NCC; the collecting duct uses ENaC under aldosterone, with water permeability set by ADH.',
      alt: 'Filtrate flows from the glomerulus through the proximal tubule, descending limb of the loop of Henle, thick ascending limb, distal convoluted tubule and collecting duct to urine.',
    },
    {
      id: 'diuretic-sites', type: 'diagram', after: 3, layout: 'inline', title: 'Where diuretics act',
      nodes: [
        { id: 'loop', label: 'Loop diuretic', col: 0, row: 0 }, { id: 'nkcc', label: 'NKCC2', col: 1, row: 0 }, { id: 'tal', label: 'Thick ascending', col: 2, row: 0 },
        { id: 'thz', label: 'Thiazide', col: 0, row: 1 }, { id: 'ncc', label: 'NCC', col: 1, row: 1 }, { id: 'dct', label: 'Distal tubule', col: 2, row: 1 },
        { id: 'ami', label: 'Amiloride', col: 0, row: 2 }, { id: 'enac', label: 'ENaC', col: 1, row: 2 }, { id: 'cd', label: 'Collecting duct', col: 2, row: 2 },
      ],
      edges: [['loop', 'nkcc', 'blocks'], ['nkcc', 'tal', 'in'], ['thz', 'ncc', 'blocks'], ['ncc', 'dct', 'in'], ['ami', 'enac', 'blocks'], ['enac', 'cd', 'in']],
      caption: 'Each class works on a named transporter or channel at a particular segment. Spironolactone acts at the same segment as amiloride but blocks the mineralocorticoid receptor instead of ENaC.',
      alt: 'Three rows. Loop diuretics block NKCC2 in the thick ascending limb. Thiazides block NCC in the distal tubule. Amiloride blocks ENaC in the collecting duct.',
    },
  ],

  'med-physiology.l19': [{
    id: 'gastric-acid-control', type: 'diagram', after: 0, layout: 'wide', title: 'Signals controlling gastric acid',
    nodes: [
      { id: 'ach', label: 'Acetylcholine', col: 0, row: 0 }, { id: 'gas', label: 'Gastrin', col: 0, row: 1 }, { id: 'his', label: 'Histamine', col: 0, row: 2 },
      { id: 'som', label: 'Somatostatin', col: 1, row: 0 }, { id: 'pc', label: 'Parietal cell', col: 1, row: 1 }, { id: 'acid', label: 'Gastric acid', col: 2, row: 1 },
    ],
    edges: [['ach', 'pc'], ['gas', 'pc'], ['his', 'pc'], ['som', 'pc', 'inhibits'], ['pc', 'acid']],
    caption: 'Acetylcholine (M3 receptors), gastrin (CCK-B receptors) and histamine (H2 receptors) stimulate parietal cells to secrete acid through the H+/K+-ATPase; somatostatin inhibits. Gastrin and acetylcholine also act partly by releasing histamine.',
    alt: 'Acetylcholine, gastrin and histamine each stimulate the parietal cell, which secretes gastric acid. Somatostatin inhibits the parietal cell.',
  }],

  'med-physiology.l20': [
    {
      id: 'thyroid-axis', type: 'diagram', after: 2, layout: 'inline', title: 'The thyroid axis',
      nodes: [
        { id: 'hyp', label: 'Hypothalamus', col: 0, row: 0 }, { id: 'pit', label: 'Pituitary', col: 1, row: 0 }, { id: 'thy', label: 'Thyroid', col: 2, row: 0 },
        { id: 'th', label: 'T4 and T3', col: 1, row: 1 },
      ],
      edges: [['hyp', 'pit', 'TRH'], ['pit', 'thy', 'TSH'], ['thy', 'th'], ['th', 'pit', 'inhibits'], ['th', 'hyp', 'inhibits']],
      caption: 'TRH drives pituitary TSH, and TSH stimulates the thyroid. The thyroid hormones feed back negatively on the pituitary and hypothalamus, so a high level shuts off the releasing signals.',
      alt: 'Hypothalamus releases TRH to the pituitary, which releases TSH to the thyroid. Thyroid hormones T4 and T3 inhibit the pituitary and hypothalamus by negative feedback.',
    },
    {
      id: 'adrenal-axis', type: 'diagram', after: 4, layout: 'inline', title: 'The cortisol axis',
      nodes: [
        { id: 'hyp', label: 'Hypothalamus', col: 0, row: 0 }, { id: 'pit', label: 'Pituitary', col: 1, row: 0 }, { id: 'adr', label: 'Adrenal cortex', col: 2, row: 0 },
        { id: 'cort', label: 'Cortisol', col: 1, row: 1 },
      ],
      edges: [['hyp', 'pit', 'CRH'], ['pit', 'adr', 'ACTH'], ['adr', 'cort'], ['cort', 'pit', 'inhibits'], ['cort', 'hyp', 'inhibits']],
      caption: 'CRH drives pituitary ACTH, and ACTH drives cortisol from the adrenal cortex. Cortisol suppresses CRH and ACTH, which is why high cortisol with low ACTH is consistent with an adrenal or exogenous source.',
      alt: 'Hypothalamus releases CRH to the pituitary, which releases ACTH to the adrenal cortex. Cortisol inhibits the pituitary and hypothalamus by negative feedback.',
    },
  ],

  'med-biochem-genetics.l14': [{
    id: 'rna-processing', type: 'diagram', after: 2, layout: 'wide', title: 'Processing the primary transcript in the nucleus',
    nodes: [
      { id: 'dna', label: 'DNA template', col: 0, row: 1 }, { id: 'pre', label: 'Pre-mRNA', col: 1, row: 1 },
      { id: 'cap', label: "5' cap", col: 2, row: 0 }, { id: 'spl', label: 'Splicing', col: 2, row: 1 }, { id: 'pa', label: 'Poly-A tail', col: 2, row: 2 },
      { id: 'mrna', label: 'Mature mRNA', col: 3, row: 1 },
    ],
    edges: [['dna', 'pre'], ['pre', 'cap'], ['pre', 'spl'], ['pre', 'pa'], ['cap', 'mrna'], ['spl', 'mrna'], ['pa', 'mrna']],
    caption: "RNA polymerase II copies the template into a primary transcript. A 7-methylguanosine cap is added at the 5' end, a poly-A tail at the 3' end, and the spliceosome removes introns and joins exons. The cap and tail belong to the RNA, not the DNA.",
    alt: "DNA is transcribed to pre-mRNA, which undergoes three processing steps: addition of a 7-methylguanosine 5' cap, splicing out of introns, and addition of a poly-A tail. These produce mature mRNA.",
  }],

  'med-biochem-genetics.l15': [{
    id: 'mutation-types', type: 'diagram', after: 2, layout: 'wide', title: 'Types of mutation and their effect',
    nodes: [
      { id: 'pm', label: 'Point mutation', col: 0, row: 1 }, { id: 'indel', label: 'Indel not x3', col: 0, row: 3 },
      { id: 'sil', label: 'Silent', col: 1, row: 0 }, { id: 'mis', label: 'Missense', col: 1, row: 1 }, { id: 'non', label: 'Nonsense', col: 1, row: 2 }, { id: 'fs', label: 'Frameshift', col: 1, row: 3 },
      { id: 'o1', label: 'Same protein', col: 2, row: 0 }, { id: 'o2', label: 'New amino acid', col: 2, row: 1 }, { id: 'o3', label: 'Premature stop', col: 2, row: 2 }, { id: 'o4', label: 'Frame altered', col: 2, row: 3 },
    ],
    edges: [['pm', 'sil'], ['pm', 'mis'], ['pm', 'non'], ['indel', 'fs'], ['sil', 'o1'], ['mis', 'o2'], ['non', 'o3'], ['fs', 'o4']],
    caption: 'A point mutation can be silent (synonymous codon), missense (as in sickle cell disease, GAG to GTG, glutamate to valine) or nonsense (as CAG to UAG). An insertion or deletion that is not a multiple of three alters every downstream codon.',
    alt: 'A point mutation is silent (same protein), missense (a different amino acid) or nonsense (a premature stop codon). An insertion or deletion that is not a multiple of three is a frameshift, which alters every downstream codon.',
  }],

  'med-premed-biochem.l15': [
    {
      id: 'central-dogma-vertical', type: 'diagram', after: 0, layout: 'inline', title: 'From gene to protein',
      nodes: [{ id: 'dna', label: 'DNA', col: 0, row: 0 }, { id: 'mrna', label: 'Messenger RNA', col: 0, row: 1 }, { id: 'prot', label: 'Protein', col: 0, row: 2 }],
      edges: [['dna', 'mrna', 'transcription'], ['mrna', 'prot', 'translation']],
      caption: 'Transcription copies a template DNA strand into RNA, built 5-prime to 3-prime; translation reads the mRNA in codons to build a protein.',
      alt: 'DNA is transcribed into messenger RNA, which is translated into protein.',
    },
    {
      id: 'worked-codons', type: 'diagram', after: 2, layout: 'inline', title: 'Worked example: reading a sequence',
      nodes: [
        { id: 'l1', label: 'Template DNA', col: 0, row: 0 }, { id: 'l2', label: 'mRNA', col: 0, row: 1 }, { id: 'l3', label: 'Protein', col: 0, row: 2 },
        { id: 's1', label: 'TACGGATTT', col: 1, row: 0 }, { id: 's2', label: 'AUGCCUAAA', col: 1, row: 1 }, { id: 's3', label: 'Met-Pro-Lys', col: 1, row: 2 },
      ],
      edges: [['s1', 's2', 'transcription'], ['s2', 's3', 'translation']],
      caption: "The template strand read 3-prime to 5-prime as TACGGATTT gives mRNA 5-prime AUGCCUAAA 3-prime, whose codons AUG, CCU and AAA code for Met-Pro-Lys.",
      alt: "Template DNA strand 3 prime TACGGATTT 5 prime is transcribed to mRNA 5 prime AUGCCUAAA 3 prime, which is translated in codons AUG, CCU, AAA to methionine, proline, lysine.",
    },
  ],

  'med-pharm-principles.l05': [
    {
      id: 'half-life-decay', type: 'chart', kind: 'line', after: 3, layout: 'inline', title: 'First-order elimination: what is left after each half-life',
      x: { label: 'Time', unit: 'half-lives' }, y: { label: 'Dose remaining', unit: '%' },
      series: [{ name: 'Remaining', points: pts(HALF_LIVES, n => remaining(n, 1)) }],
      caption: 'A model, C = C0 x 0.5^(t / t-half): 50 percent is left after one half-life, 25 after two, 12.5 after three, about 6 after four and about 3 after five, so a drug is effectively eliminated in roughly four to five half-lives.',
      alt: 'A falling curve of percent of dose remaining against time in half-lives: 100 at 0, 50 at 1, 25 at 2, 12.5 at 3, 6.25 at 4 and 3.1 at 5.',
    },
    {
      id: 'half-life-clearance', type: 'chart', kind: 'line', after: 5, layout: 'inline', title: 'Halving clearance doubles the half-life (worked example)',
      x: { label: 'Time', unit: 'hours' }, y: { label: 'Starting amount remaining', unit: '%' },
      series: [
        { name: 'CL 7 L/h (half-life 6.9 h)', points: pts(HOURS_48, t => remaining(t, 0.693 * 70 / 7)) },
        { name: 'CL 3.5 L/h (half-life 13.9 h)', points: pts(HOURS_48, t => remaining(t, 0.693 * 70 / 3.5)) },
      ],
      caption: 'A model of the lesson example: Vd is 70 L in both cases and half-life is 0.693 x Vd / CL, so halving clearance doubles the half-life and the amount falls more slowly.',
      alt: 'Two falling curves of percent of starting amount remaining over 48 hours. With clearance 7 litres per hour the half-life is 6.9 hours and about 0.8 percent remains at 48 hours; with clearance 3.5 litres per hour the half-life is 13.9 hours and about 9 percent remains.',
    },
  ],

  'med-premed-chem.l05': [{
    id: 'first-vs-zero-order', type: 'chart', kind: 'line', after: 2, layout: 'inline', title: 'First-order and zero-order elimination compared',
    x: { label: 'Time', unit: 'hours' }, y: { label: 'Amount remaining', unit: '% of start' },
    series: [
      { name: 'First order, half-life 6 h', points: pts(HOURS_24, t => remaining(t, 6)) },
      { name: 'Zero order (illustrative rate)', points: pts(HOURS_24, t => 100 - (12.5 / 6) * t) },
    ],
    caption: 'A model. The first-order curve is the lesson example with a 6-hour half-life: 6.25 percent (one sixteenth) remains at 24 hours. The zero-order line removes a constant amount per hour, with an arbitrary rate chosen only to show the straight-line shape.',
    alt: 'Two curves over 24 hours. The first-order curve falls from 100 to 50, 25, 12.5 and 6.25 percent at 6, 12, 18 and 24 hours. The zero-order line falls in a straight line from 100 to 50 percent over the same 24 hours at an arbitrary illustrative rate.',
  }],

  'med-epi-biostats.l10': [{
    id: 'two-by-two', type: 'diagram', after: 4, layout: 'inline', title: 'The two-by-two table for the worked example',
    nodes: [
      { id: 'h1', label: 'Disease present', col: 1, row: 0 }, { id: 'h2', label: 'Disease absent', col: 2, row: 0 },
      { id: 'r1', label: 'Test positive', col: 0, row: 1 }, { id: 'tp', label: 'TP = 180', col: 1, row: 1 }, { id: 'fp', label: 'FP = 80', col: 2, row: 1 },
      { id: 'r2', label: 'Test negative', col: 0, row: 2 }, { id: 'fn', label: 'FN = 20', col: 1, row: 2 }, { id: 'tn', label: 'TN = 720', col: 2, row: 2 },
    ],
    edges: [],
    caption: 'Using the lesson numbers (200 diseased, 800 non-diseased): sensitivity = TP / (TP + FN) = 180 / 200 = 90 percent, and specificity = TN / (TN + FP) = 720 / 800 = 90 percent.',
    alt: 'A two-by-two table. Among 200 people with disease, 180 test positive (true positives) and 20 test negative (false negatives). Among 800 without disease, 80 test positive (false positives) and 720 test negative (true negatives).',
  }],

  'med-epi-biostats.l11': [
    {
      id: 'ppv-flow', type: 'diagram', after: 1, layout: 'wide', title: 'The base-rate example: 10,000 people tested',
      nodes: [
        { id: 'all', label: '10,000 tested', col: 0, row: 1 },
        { id: 'dis', label: '100 diseased', col: 1, row: 0 }, { id: 'hea', label: '9,900 healthy', col: 1, row: 3 },
        { id: 'tp', label: 'TP 90', col: 2, row: 0 }, { id: 'fn', label: 'FN 10', col: 2, row: 1 }, { id: 'fp', label: 'FP 495', col: 2, row: 2 }, { id: 'tn', label: 'TN 9,405', col: 2, row: 3 },
      ],
      edges: [['all', 'dis'], ['all', 'hea'], ['dis', 'tp'], ['dis', 'fn'], ['hea', 'fp'], ['hea', 'tn']],
      caption: 'At 1 percent prevalence with 90 percent sensitivity and 95 percent specificity, positives are 90 + 495 = 585, so PPV = 90 / 585 = 15.4 percent; negatives are 9,415, so NPV = 9,405 / 9,415 = 99.9 percent.',
      alt: 'Of 10,000 people, 100 have disease and 9,900 do not. Of the diseased, 90 test positive and 10 test negative. Of the healthy, 495 test positive and 9,405 test negative.',
    },
    {
      id: 'ppv-prevalence', type: 'graph', after: 3, layout: 'inline', title: 'Positive predictive value against prevalence (model)',
      fn: p => { const q = p / 100; return (100 * 0.9 * q) / (0.9 * q + 0.05 * (1 - q)); }, domain: [0.5, 50], x: { label: 'Prevalence (%)' }, y: { label: 'Positive predictive value (%)' },
      marks: [{ x: 1, label: '1%: 15.4%' }, { x: 10, label: '10%: 66.7%' }, { x: 20, label: '20%: 81.8%' }],
      caption: 'A model, separate from the lesson example: computed for a test with 90 percent sensitivity and 95 percent specificity: the same test has a much lower PPV when the disease is rare, which is why a published PPV should not be applied to a population with a different prevalence.',
      alt: 'A rising curve of positive predictive value against prevalence for sensitivity 90 percent and specificity 95 percent: 15.4 percent at 1 percent prevalence, 66.7 percent at 10 percent and 81.8 percent at 20 percent.',
    },
  ],

  'med-epi-biostats.l12': [
    {
      id: 'roc-schematic', type: 'chart', kind: 'line', after: 0, layout: 'inline', title: 'ROC curves (schematic)',
      x: { label: '1 - specificity (false positive rate)' }, y: { label: 'Sensitivity (true positive rate)' },
      series: [
        { name: 'No better than chance (AUC 0.5)', points: pts(FPR, x => x) },
        { name: 'A better test (illustrative, AUC about 0.77)', points: pts(FPR, x => Math.pow(x, 0.3)) },
      ],
      caption: 'A schematic, not data: a useless test follows the diagonal, and a better test bows toward the top left corner. The illustrative curve y = x^0.3 has an area of about 0.77.',
      alt: 'Two curves of sensitivity against 1 minus specificity from 0 to 1. The diagonal is a test no better than chance. The upper curve bows toward the top left, an illustrative better test with an area under the curve of about 0.77.',
    },
    {
      id: 'lead-time', type: 'timeline', after: 3, layout: 'inline', title: 'Lead-time bias in the worked example',
      events: [
        { when: 'Age 60', label: 'With screening, the cancer is found' },
        { when: 'Age 63', label: 'Without screening, it is diagnosed at this age' },
        { when: 'Age 65', label: 'The patient dies, with or without screening' },
      ],
      caption: 'Survival from diagnosis rises from 2 years to 5 years, yet the date of death is unchanged: earlier diagnosis alone creates the apparent gain.',
      alt: 'Timeline: age 60 screening finds the cancer; age 63 diagnosis without screening; age 65 death in both cases. Survival from diagnosis is 5 years with screening and 2 years without.',
    },
  ],

  'med-path.l05': [
    {
      id: 'hemostasis-steps', type: 'diagram', after: 3, layout: 'wide', title: 'Stages of hemostasis',
      nodes: [
        { id: 'inj', label: 'Vessel injury', col: 0, row: 0 }, { id: 'col', label: 'Collagen + vWF', col: 1, row: 0 }, { id: 'adh', label: 'Adhesion (GPIb)', col: 2, row: 0 },
        { id: 'agg', label: 'Aggregation', col: 2, row: 1 }, { id: 'plug', label: 'Primary plug', col: 1, row: 1 }, { id: 'casc', label: 'Coagulation', col: 0, row: 1 },
        { id: 'thr', label: 'Thrombin', col: 0, row: 2 }, { id: 'fib', label: 'Fibrin', col: 1, row: 2 }, { id: 'stab', label: 'Stable plug', col: 2, row: 2 },
      ],
      edges: [['inj', 'col'], ['col', 'adh'], ['adh', 'agg'], ['agg', 'plug'], ['plug', 'casc'], ['casc', 'thr'], ['thr', 'fib'], ['fib', 'stab']],
      caption: 'Injury exposes collagen and von Willebrand factor, platelets adhere through glycoprotein Ib, are activated and aggregate through glycoprotein IIb/IIIa cross-linked by fibrinogen (the primary plug). The cascade then generates thrombin, which converts fibrinogen to fibrin and stabilises the plug.',
      alt: 'Vessel injury exposes collagen and von Willebrand factor; platelets adhere through GPIb, aggregate through GPIIb/IIIa to form the primary plug; the coagulation cascade generates thrombin, which makes fibrin and a stable plug.',
    },
    {
      id: 'coag-pathways', type: 'diagram', after: 3, layout: 'inline', title: 'Coagulation, as the lab tests see it',
      nodes: [
        { id: 'tf', label: 'Tissue factor', col: 0, row: 0 }, { id: 'ext', label: 'Extrinsic: PT', col: 1, row: 0 }, { id: 'thr', label: 'Thrombin', col: 2, row: 0 },
        { id: 'int', label: 'Intrinsic: aPTT', col: 1, row: 1 }, { id: 'fib', label: 'Fibrin', col: 2, row: 1 },
      ],
      edges: [['tf', 'ext'], ['ext', 'thr'], ['int', 'thr'], ['thr', 'fib']],
      caption: 'At a high level, tissue factor from damaged tissue starts the extrinsic pathway, measured by the prothrombin time, while the intrinsic pathway is measured by the activated partial thromboplastin time; both lead to thrombin and fibrin.',
      alt: 'Tissue factor starts the extrinsic pathway (prothrombin time). The intrinsic pathway is measured by the activated partial thromboplastin time. Both lead to thrombin, which makes fibrin.',
    },
  ],

  'med-g35.l03': [{
    id: 'blood-loop', type: 'diagram', after: 2, layout: 'inline', title: 'Where blood goes',
    nodes: [
      { id: 'heart', label: 'Heart', col: 0, row: 0 }, { id: 'art', label: 'Arteries', col: 1, row: 0 }, { id: 'cap', label: 'Capillaries', col: 2, row: 0 },
      { id: 'vein', label: 'Veins', col: 2, row: 1 },
    ],
    edges: [['heart', 'art'], ['art', 'cap'], ['cap', 'vein'], ['vein', 'heart']],
    caption: 'Arteries carry blood away from the heart, capillaries are where oxygen and food pass into the cells, and veins carry blood back to the heart.',
    alt: 'A loop: heart, arteries, capillaries, veins, and back to the heart.',
  }],

  'med-g35.l05': [{
    id: 'digestion-path', type: 'diagram', after: 2, layout: 'wide', title: 'The path of food through the body',
    nodes: [
      { id: 'mouth', label: 'Mouth', col: 0, row: 0 }, { id: 'eso', label: 'Esophagus', col: 1, row: 0 }, { id: 'stom', label: 'Stomach', col: 2, row: 0 },
      { id: 'small', label: 'Small intestine', col: 2, row: 1 }, { id: 'large', label: 'Large intestine', col: 1, row: 1 }, { id: 'waste', label: 'Solid waste', col: 0, row: 1 },
      { id: 'help', label: 'Liver, pancreas', col: 2, row: 2 }, { id: 'blood', label: 'Blood', col: 1, row: 2 },
    ],
    edges: [['mouth', 'eso'], ['eso', 'stom'], ['stom', 'small'], ['small', 'large'], ['large', 'waste'], ['help', 'small'], ['small', 'blood']],
    caption: 'Food is chewed in the mouth, pushed down the esophagus, mixed in the stomach, and mostly digested in the small intestine, where the liver and pancreas add juices and nutrients pass into the blood. The large intestine soaks up water and the rest leaves as solid waste.',
    alt: 'Food moves from mouth to esophagus to stomach to small intestine to large intestine to solid waste. The liver and pancreas add juices to the small intestine, and nutrients pass from the small intestine into the blood.',
  }],
};
