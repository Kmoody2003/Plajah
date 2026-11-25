/**
 * Pure deterministic pedagogy engine for Plajah Academia & Elevate Phase 0.
 *
 * Supplies standards-aligned, intrinsically integrated quests across all 4 core Academia pillars
 * (Reading, Math, Science, History), High-School Flux Studio, and Phase 2 Elevate Church preview.
 * All math, science, and reading evaluators return rich physical-world feedback rather than
 * harsh right/wrong buzzers.
 */

import type {
  FluxStudioQuest,
  GradeBand,
  HistoryDispatchQuest,
  MathWaterwheelQuest,
  ReadingQuest,
  ScienceBenchQuest,
  WorldId,
  WorldMeta,
} from './contracts';

export const WORLD_CATALOG: WorldMeta[] = [
  {
    id: 'reading',
    simpleTitle: 'Lantern · Reading',
    subtitle: 'PreK–2 Woodland Brook & Reading Nook',
    defaultBand: 'prek2',
    plateUrl: '/academia-games/plates/prek2-reading.jpg',
    accentHex: '#C96846',
    paperBg: '#F6EFE2',
    inkHex: '#3B2A1E',
    plajahEngines: ['Voca Speech Alignment', 'Lorea Living Books', 'childrensSpeech', 'Chora Acoustics'],
  },
  {
    id: 'math',
    simpleTitle: 'Mill · Math',
    subtitle: 'Grades 3–5 Hillside Aqueduct & Field Journal',
    defaultBand: 'g35',
    plateUrl: '/academia-games/plates/g35-math.jpg',
    accentHex: '#4E8A7E',
    paperBg: '#F3E9D6',
    inkHex: '#2B3A55',
    plajahEngines: ['YearCurriculum Math', 'Singapore CPA Bar Models', 'mathInContext', 'InkMath'],
  },
  {
    id: 'science',
    simpleTitle: 'Grove · Science',
    subtitle: 'Grades 6–8 Dusk Conservatory & Galvanic Bench',
    defaultBand: 'g68',
    plateUrl: '/academia-games/plates/g68-science.jpg',
    accentHex: '#2E7D63',
    paperBg: '#EAE0CC',
    inkHex: '#241D18',
    plajahEngines: ['Museion TreeGrower', 'services/bio', 'services/elec SPICE', 'HumanBodyExperience'],
  },
  {
    id: 'studio',
    simpleTitle: 'Press · 9–12 Studio',
    subtitle: 'Grades 9–12 Archival Folio & Flux Vitrine',
    defaultBand: 'g912',
    plateUrl: '/academia-games/plates/g912-studio.jpg',
    accentHex: '#C59B4E',
    paperBg: '#ECE6DA',
    inkHex: '#181C22',
    plajahEngines: ['Flux Mathematics GPU Manifolds', 'OpenStax CC-BY', 'Lorea Publishing'],
  },
  {
    id: 'history',
    simpleTitle: 'Atlas · History',
    subtitle: 'Living Watercolor Map & Primary-Source Diorama',
    defaultBand: 'g68',
    plateUrl: '/academia-games/plates/history-atlas.jpg',
    accentHex: '#B86246',
    paperBg: '#F2E7D2',
    inkHex: '#35271D',
    plajahEngines: ['ErasAtlas', 'worldHistoryData', 'TONOS Regional Acoustics', 'Debate Aria'],
  },
  {
    id: 'elevate',
    simpleTitle: 'Parables · Elevate',
    subtitle: 'Phase 2 Church Preview · Olive-Grove Living Story',
    defaultBand: 'prek2',
    plateUrl: '/academia-games/plates/elevate-parable.jpg',
    accentHex: '#C4933B',
    paperBg: '#F4ECDC',
    inkHex: '#392A1E',
    plajahEngines: ['Same Reading + Voca Spine', 'bibleCanon', 'Lectio Lexicon', 'Ambo Stage'],
  },
];

export const worldMetaById = (id: WorldId): WorldMeta =>
  WORLD_CATALOG.find(w => w.id === id) ?? WORLD_CATALOG[0];

// ── 1. READING QUESTS (PreK–2 Woodland Brook + Phase 2 Elevate Parable Pack) ────────────────────────

export const READING_QUESTS: ReadingQuest[] = [
  {
    id: 'read-sun',
    world: 'reading',
    band: 'prek2',
    word: 'SUN',
    tiles: ['S', 'U', 'N'],
    distractors: ['B', 'T'],
    syllables: ['sun'],
    storyLine: 'Warm morning sun pours through the willow leaves across the mossy bridge.',
    cognateHint: 'Bright star in our sky (Spanish: sol).',
    standards: [
      { framework: 'CCSS', code: 'RF.K.2.D', label: 'Isolate & blend CVC phonemes' },
      { framework: 'CCSS', code: 'RF.K.3.A', label: 'Primary consonant & short vowel sounds' },
    ],
    license: 'ORIGINAL',
  },
  {
    id: 'read-fox',
    world: 'reading',
    band: 'prek2',
    word: 'FOX',
    tiles: ['F', 'O', 'X'],
    distractors: ['M', 'A'],
    syllables: ['fox'],
    storyLine: 'A curious little fox with a stitched linen satchel listens beside the brook.',
    cognateHint: 'Small woodland animal with a bushy tail.',
    standards: [
      { framework: 'CCSS', code: 'RF.K.2.D', label: 'Blend onset, medial vowel & final sound' },
    ],
    license: 'ORIGINAL',
  },
  {
    id: 'read-moss',
    world: 'reading',
    band: 'prek2',
    word: 'MOSS',
    tiles: ['M', 'O', 'SS'],
    distractors: ['L', 'P'],
    syllables: ['moss'],
    storyLine: 'Soft green moss cushions every cobblestone along the little creek.',
    cognateHint: 'Velvety green plant growing on damp stones (Spanish: musgo).',
    standards: [
      { framework: 'CCSS', code: 'RF.1.3.B', label: 'Decode regularly spelled one-syllable words with doubled consonants' },
    ],
    license: 'ORIGINAL',
  },
  {
    id: 'read-lantern',
    world: 'reading',
    band: 'g35',
    word: 'LANTERN',
    tiles: ['LAN', 'TERN'],
    distractors: ['TOR', 'RIN'],
    syllables: ['lan', 'tern'],
    storyLine: 'Each mulberry-paper lantern sways in the breeze and lights the path home.',
    cognateHint: 'Portable lamp with a warm handle (Spanish: linterna).',
    standards: [
      { framework: 'CCSS', code: 'RF.3.3.C', label: 'Decode multisyllable words using syllable division' },
    ],
    license: 'ORIGINAL',
  },
];

export const ELEVATE_QUESTS: ReadingQuest[] = [
  {
    id: 'elev-flock',
    world: 'elevate',
    band: 'prek2',
    word: 'FLOCK',
    tiles: ['FL', 'O', 'CK'],
    distractors: ['SH', 'A'],
    syllables: ['flock'],
    storyLine: 'The good shepherd knows every lamb in the flock by name along the quiet olive hills.',
    cognateHint: 'A family of sheep cared for together by a shepherd.',
    scriptureRef: 'John 10:11–14',
    standards: [
      { framework: 'LECTIO', code: 'JOHN.10.14', label: 'The Good Shepherd · Knowing & care' },
      { framework: 'CCSS', code: 'RF.1.3.A', label: 'Initial consonant blends & final -ck digraph' },
    ],
    license: 'ORIGINAL',
  },
  {
    id: 'elev-peace',
    world: 'elevate',
    band: 'prek2',
    word: 'PEACE',
    tiles: ['P', 'EA', 'CE'],
    distractors: ['T', 'O'],
    syllables: ['peace'],
    storyLine: 'Oil lamps glow softly beneath the linen awning as evening peace settles over Galilee.',
    cognateHint: 'Hebrew: Shalom — wholeness, calm, and wellbeing (Spanish: paz).',
    scriptureRef: 'John 14:27',
    standards: [
      { framework: 'LECTIO', code: 'LEX.SHALOM', label: 'Shalom / Eirēnē — wholeness & calm' },
      { framework: 'CCSS', code: 'RF.2.3.B', label: 'Long vowel teams (ea) & soft c' },
    ],
    license: 'ORIGINAL',
  },
  {
    id: 'elev-light',
    world: 'elevate',
    band: 'g35',
    word: 'LIGHT',
    tiles: ['L', 'IGH', 'T'],
    distractors: ['N', 'OU'],
    syllables: ['light'],
    storyLine: 'A single lamp placed on a stand warms the whole stone courtyard at dusk.',
    cognateHint: 'Bright guidance in the dark (Spanish: luz).',
    scriptureRef: 'Matthew 5:14–16',
    standards: [
      { framework: 'LECTIO', code: 'MATT.5.15', label: 'Lamp on a stand — living kindness' },
      { framework: 'CCSS', code: 'RF.2.3.E', label: 'Decode -igh vowel patterns' },
    ],
    license: 'ORIGINAL',
  },
];

export interface ReadingEval {
  assembled: string;
  complete: boolean;
  exactMatch: boolean;
  progressRatio: number;
  feedback: string;
}

export function evaluateReadingSelection(quest: ReadingQuest, chosenIndices: number[], tray: string[]): ReadingEval {
  const assembled = chosenIndices.map(i => tray[i] ?? '').join('');
  const target = quest.word;
  const complete = chosenIndices.length === quest.tiles.length;
  const exactMatch = assembled === target;
  let matchingPrefix = 0;
  while (matchingPrefix < assembled.length && matchingPrefix < target.length && assembled[matchingPrefix] === target[matchingPrefix]) {
    matchingPrefix++;
  }
  const progressRatio = target.length ? matchingPrefix / target.length : 0;

  if (exactMatch) {
    return { assembled, complete: true, exactMatch: true, progressRatio: 1, feedback: `“${quest.word}” shines warm across the brook!` };
  }
  if (!complete) {
    return {
      assembled,
      complete: false,
      exactMatch: false,
      progressRatio,
      feedback: assembled.length === 0 ? 'Tap carved tiles—or speak aloud—to light the lanterns.' : `Listening to “${assembled}…” — choose the next wooden block.`,
    };
  }
  return {
    assembled,
    complete: true,
    exactMatch: false,
    progressRatio,
    feedback: `“${assembled}” sounds a little different from our lantern word. Tap a block to swap it calmly.`,
  };
}

/** Deterministic shuffled tray so tests and classroom screens always agree. */
export function buildTileTray(quest: ReadingQuest): string[] {
  const all = [...quest.tiles, ...quest.distractors];
  let seed = 0;
  for (let i = 0; i < quest.id.length; i++) seed = (seed * 31 + quest.id.charCodeAt(i)) >>> 0;
  const out = [...all];
  for (let i = out.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── 2. MATH WATERWHEEL QUESTS (Singapore CPA Fractions & Equivalence) ───────────────────────────────

export const MATH_QUESTS: MathWaterwheelQuest[] = [
  {
    id: 'math-whole-quarters',
    band: 'g35',
    title: 'Balance the Mill Stream',
    storyPrompt: 'The main trough carries 1/2 (4/8) and the outer trough carries 1/4 (2/8). Set the middle brass gate so the waterwheel receives exactly 1 whole stream (8/8).',
    denom: 8,
    targetTotal: 8,
    fixedA: 4,
    fixedC: 2,
    initialB: 1,
    minB: 0,
    maxB: 6,
    standards: [
      { framework: 'CCSS', code: '4.NF.B.3', label: 'Decompose a fraction into a sum of fractions with the same denominator' },
      { framework: 'SINGAPORE', code: 'P4.FRAC', label: 'Part-whole bar model equivalence to 1 whole' },
    ],
    license: 'ORIGINAL',
  },
  {
    id: 'math-three-quarters',
    band: 'g35',
    title: 'Terrace Irrigation Flow',
    storyPrompt: 'The hillside herb boxes need exactly 3/4 of a full stream (6/8) so they do not flood. Channel A already sends 3/8—set Brass Gate B to reach 6/8 cleanly.',
    denom: 8,
    targetTotal: 6,
    fixedA: 3,
    fixedC: 0,
    initialB: 5,
    minB: 0,
    maxB: 6,
    standards: [
      { framework: 'CCSS', code: '3.NF.A.3', label: 'Recognize & generate simple equivalent fractions (6/8 = 3/4)' },
      { framework: 'SINGAPORE', code: 'P3.FRAC', label: 'Equivalent fractions on a concrete strip' },
    ],
    license: 'ORIGINAL',
  },
  {
    id: 'math-dual-gates',
    band: 'g35',
    title: 'Two-Gate Bakery Wheel',
    storyPrompt: 'Morning flour milling needs a full 12/12 stream. Channel C brings 1/3 (4/12). Balance both Gate A and Gate B so all three channels total 12/12 without spilling.',
    denom: 12,
    targetTotal: 12,
    fixedA: 3,
    fixedC: 4,
    initialB: 2,
    minB: 1,
    maxB: 8,
    adjustableA: true,
    standards: [
      { framework: 'CCSS', code: '5.NF.A.1', label: 'Add fractions with unlike denominators via common twelfths' },
      { framework: 'PISA', code: 'MATH.L3', label: 'Execute multi-step proportional adjustments' },
    ],
    license: 'ORIGINAL',
  },
];

export function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a)), y = Math.abs(Math.round(b));
  while (y !== 0) { const t = y; y = x % y; x = t; }
  return x || 1;
}

export function formatFraction(num: number, den: number): string {
  if (num === 0) return '0';
  if (num === den) return '1';
  const g = gcd(num, den);
  return `${num / g}/${den / g}`;
}

export interface WaterwheelEval {
  total: number;
  target: number;
  delta: number; // <0 underflow, 0 balanced, >0 overflow
  balanced: boolean;
  wheelRpm: number; // Physical wheel speed visual cue
  feedback: string;
}

export function evaluateWaterwheel(quest: MathWaterwheelQuest, a: number, b: number): WaterwheelEval {
  const total = a + b + quest.fixedC;
  const delta = total - quest.targetTotal;
  const balanced = delta === 0;
  // Physical feedback: balanced spins smoothly; underflow runs sluggish; overflow splashes unevenly
  const wheelRpm = balanced ? 1.0 : delta < 0 ? Math.max(0.2, 0.25 + (total / quest.targetTotal) * 0.45) : 0.48;
  const feedback = balanced
    ? `Harmony! ${a}/${quest.denom} + ${b}/${quest.denom}${quest.fixedC ? ` + ${quest.fixedC}/${quest.denom}` : ''} = ${total}/${quest.denom} (${formatFraction(total, quest.denom)}). The cedar mill runs smooth and steady.`
    : delta < 0
      ? `The trough is ${Math.abs(delta)}/${quest.denom} short of ${quest.targetTotal}/${quest.denom}—the wheel turns slowly. Open the brass gate a touch more.`
      : `Water is cresting ${delta}/${quest.denom} above ${quest.targetTotal}/${quest.denom}—ease the brass gate back so the terraced garden stays balanced.`;
  return { total, target: quest.targetTotal, delta, balanced, wheelRpm, feedback };
}

// ── 3. SCIENCE CONSERVATORY BENCH QUESTS (Museion TreeGrower + Bio/Elec) ────────────────────────────

export const SCIENCE_QUESTS: ScienceBenchQuest[] = [
  {
    id: 'sci-quercus-symbiosis',
    band: 'g68',
    specimenLatin: 'Quercus alba',
    specimenTitle: 'Root Symbiosis',
    assayTitle: 'Galvanic Soil Assay · No. IV',
    prompt: 'Restore active mycorrhizal nutrient exchange beneath the oak sapling: bring Canopy PAR into dappled sun (55–78%), Soil Moisture into living loam (58–76%), and Galvanic Bench excitation to a safe reading (45–68%).',
    targetLight: [55, 78],
    targetMoisture: [58, 76],
    targetVoltage: [45, 68],
    explanation: 'Balanced dappled light feeds sugars down the phloem to symbiotic mycorrhizal fungi, while moist aerated loam lets fungal hyphae return phosphorus and water without suffocating the roots.',
    standards: [
      { framework: 'NGSS', code: 'MS-LS1-6', label: 'Photosynthesis & matter cycling in plants' },
      { framework: 'NGSS', code: 'MS-LS2-3', label: 'Matter & energy flow across symbiotic organisms' },
      { framework: 'PISA', code: 'SCI.L4', label: 'Explain multi-variable biological system equilibrium' },
    ],
    license: 'ORIGINAL',
  },
  {
    id: 'sci-dusk-dormancy',
    band: 'g68',
    specimenLatin: 'Quercus alba',
    specimenTitle: 'Autumn Acclimation',
    assayTitle: 'Low-Current Signal · No. VII',
    prompt: 'Prepare the glasshouse sapling for crisp autumn twilight: soften Canopy PAR (28–45%), keep cool moderate Soil Moisture (40–56%), and tune the Edison bench lamp low (25–42%) so respiration stays calm.',
    targetLight: [28, 45],
    targetMoisture: [40, 56],
    targetVoltage: [25, 42],
    explanation: 'Shorter, gentler light signals deciduous trees to draw chlorophyll back and slow sap flow—conserving energy through winter while roots stay protected.',
    standards: [
      { framework: 'NGSS', code: 'MS-LS1-5', label: 'Environmental factors influencing organism growth' },
      { framework: 'NGSS', code: 'MS-PS3-3', label: 'Minimize energy transfer in controlled thermal/electrical setups' },
    ],
    license: 'ORIGINAL',
  },
];

export interface ScienceEval {
  lightOk: boolean;
  moistureOk: boolean;
  voltageOk: boolean;
  equilibrium: boolean;
  photosynthesisRate: number;
  mycorrhizalFluxPct: number;
  filamentVolts: number;
  feedback: string;
}

export function evaluateScienceBench(
  quest: ScienceBenchQuest,
  light: number,
  moisture: number,
  voltage: number,
): ScienceEval {
  const inRange = (v: number, [lo, hi]: [number, number]) => v >= lo && v <= hi;
  const lightOk = inRange(light, quest.targetLight);
  const moistureOk = inRange(moisture, quest.targetMoisture);
  const voltageOk = inRange(voltage, quest.targetVoltage);
  const equilibrium = lightOk && moistureOk && voltageOk;

  const dist = (v: number, [lo, hi]: [number, number]) => (v < lo ? lo - v : v > hi ? v - hi : 0);
  const avgErr = (dist(light, quest.targetLight) + dist(moisture, quest.targetMoisture) + dist(voltage, quest.targetVoltage)) / 3;
  const mycorrhizalFluxPct = Math.max(12, Math.min(100, Math.round(100 - avgErr * 1.9)));
  const photosynthesisRate = Math.round(((light * 0.6 + moisture * 0.4) * 0.16) * 10) / 10;
  const filamentVolts = Math.round((voltage * 0.12) * 10) / 10;

  let feedback = quest.explanation;
  if (!equilibrium) {
    const hints: string[] = [];
    if (!lightOk) hints.push(light < quest.targetLight[0] ? 'Canopy light is too dim for steady sugar flow' : 'Canopy light is scorching the young leaves');
    if (!moistureOk) hints.push(moisture < quest.targetMoisture[0] ? 'Soil loam is parched' : 'Soil is waterlogged, starving root oxygen');
    if (!voltageOk) hints.push(voltage < quest.targetVoltage[0] ? 'Galvanometer signal is below threshold' : 'Filament voltage is running hot');
    feedback = `${hints[0]}. Adjust the knurled brass dials and watch the roots & meter respond.`;
  }

  return { lightOk, moistureOk, voltageOk, equilibrium, photosynthesisRate, mycorrhizalFluxPct, filamentVolts, feedback };
}

// ── 4. HIGH-SCHOOL FLUX STUDIO QUESTS (Grades 9–12 Topology & Parametric Equations) ─────────────────

export const FLUX_QUESTS: FluxStudioQuest[] = [
  {
    id: 'flux-linked-pair',
    band: 'g912',
    folioTitle: 'Harmonic Knot Study · Plate I',
    prompt: 'The golden manifold starts as a single unbroken (3, 5) torus knot. Adjust the milled-brass Vernier scales (p, q) until the manifold splits into exactly 2 interlocking rings (gcd(p, q) = 2).',
    goalKind: 'linked-rings',
    targetLinks: 2,
    insight: 'A torus curve (p, q) traces exactly gcd(p, q) separate closed components. Whenever p and q share a common factor of 2 (such as (4, 6) or (2, 8)), the ribbon splits cleanly into two linked rings.',
    standards: [
      { framework: 'CCSS', code: 'HSF-TF.B.5', label: 'Model periodic phenomena with trigonometric parameters' },
      { framework: 'PISA', code: 'MATH.L6', label: 'Formulate & generalize mathematical structure from visual models' },
    ],
    license: 'ORIGINAL',
  },
  {
    id: 'flux-high-knot',
    band: 'g912',
    folioTitle: 'Coprime Braiding · Plate II',
    prompt: 'Construct a higher-order unbroken knot where p ≥ 5, q ≥ 7, and gcd(p, q) = 1 so the entire braided sculpture stays a single continuous filament.',
    goalKind: 'high-order-knot',
    minP: 5,
    minQ: 7,
    insight: 'Because p and q are coprime (gcd = 1), the angular velocity ratio p/q visits every lobe before returning to the origin—weaving one intricate continuous closed curve.',
    standards: [
      { framework: 'CCSS', code: 'HSN-RN.A', label: 'Number-theoretic coprimality in geometric structures' },
      { framework: 'PISA', code: 'MATH.L6', label: 'Connect algebraic invariants to 3D spatial topology' },
    ],
    license: 'ORIGINAL',
  },
];

export interface FluxEval {
  links: number;
  solved: boolean;
  topologyLabel: string;
  feedback: string;
}

export function evaluateFluxStudio(quest: FluxStudioQuest, p: number, q: number): FluxEval {
  const links = gcd(p, q);
  let solved = false;
  if (quest.goalKind === 'linked-rings') {
    solved = links === (quest.targetLinks ?? 2);
  } else if (quest.goalKind === 'high-order-knot') {
    solved = links === 1 && p >= (quest.minP ?? 5) && q >= (quest.minQ ?? 7);
  } else {
    solved = links === 1;
  }
  const topologyLabel = links === 1 ? `Single Unbroken (${p}, ${q}) Knot · gcd = 1` : `${links} Interlocking Rings · gcd(${p}, ${q}) = ${links}`;
  const feedback = solved
    ? quest.insight
    : quest.goalKind === 'linked-rings'
      ? `Currently gcd(${p}, ${q}) = ${links}. Seek a pair (p, q) whose greatest common divisor is ${quest.targetLinks ?? 2}.`
      : `Currently (${p}, ${q}) has gcd = ${links}. Raise both scales (p ≥ ${quest.minP ?? 5}, q ≥ ${quest.minQ ?? 7}) with no shared divisor above 1.`;
  return { links, solved, topologyLabel, feedback };
}

// ── 5. HISTORY LIVING ATLAS QUESTS (Primary-Source Inquiry over ErasAtlas) ──────────────────────────

export const HISTORY_QUESTS: HistoryDispatchQuest[] = [
  {
    id: 'hist-timbuktu-1324',
    band: 'g68',
    era: 'crossroads',
    eraLabel: 'Crossroads · Post-Classical Trade',
    ledgerTitle: 'Harbor Ledger · 1324',
    yearLabel: '1324 CE',
    place: 'Niger River · Timbuktu & Djenné',
    scenario: 'Caravans from across the Sahara meet riverboats loaded with grain, salt slabs, and astronomical manuscripts. Two harbor records disagree on what mattered most to the city’s lasting fame.',
    sources: [
      { id: 's1', speaker: 'Amina, Manuscript Copyist', role: 'Sankore Workshop', excerpt: '“Merchants pay more gold for a clean astronomy treatise than for bolts of silk—scholars travel months just to copy one margin note.”' },
      { id: 's2', speaker: 'Ibrahim, Salt Caravan Guide', role: 'Taghaza Route', excerpt: '“Without our salt slabs and river grain boats, no scholar could eat—trade routes keep the libraries standing.”' },
    ],
    question: 'Corroborating both dispatches, what best explains how Timbuktu flourished?',
    choices: [
      { id: 'a', text: 'Only gold mining mattered; books arrived centuries later.', outcome: 'Amina’s workshop ledger shows manuscripts were already prized trade goods right alongside gold and salt.', accurate: false },
      { id: 'b', text: 'Caravan-and-river trade wealth and scholarly bookcraft sustained each other.', outcome: 'Corroborated! Material trade routes fed the city while manuscripts made Timbuktu a magnetic intellectual crossroads across Africa and the Mediterranean.', accurate: true },
      { id: 'c', text: 'The harbor closed off outside travelers to protect its grain.', outcome: 'Both Ibrahim and Amina describe active travelers, riverboats, and caravan exchanges from afar.', accurate: false },
    ],
    standards: [
      { framework: 'C3', code: 'D2.His.16.6-8', label: 'Organize & corroborate multiple historical sources' },
      { framework: 'C3', code: 'D2.Eco.14.6-8', label: 'Explain how trade networks exchange goods and knowledge' },
    ],
    license: 'ORIGINAL',
  },
  {
    id: 'hist-ancient-canal',
    band: 'g35',
    era: 'ancient',
    eraLabel: 'Ancient · River Valleys',
    ledgerTitle: 'Clay Tablet · c. 2100 BCE',
    yearLabel: 'c. 2100 BCE',
    place: 'Euphrates Valley',
    scenario: 'Spring snowmelt swells the river. Villages upriver and downriver share a single woven network of irrigation canals.',
    sources: [
      { id: 's1', speaker: 'Ninsun, Canal Steward', role: 'Downriver Barley Fields', excerpt: '“If the upper sluice holds all the silt and water, our lower fields crack dry before harvest.”' },
      { id: 's2', speaker: 'Enki-bani, Brickmaker', role: 'Upriver Kiln', excerpt: '“We must clear the reed-choked channels together before the flood hits, or both towns lose the wall.”' },
    ],
    question: 'Why did shared irrigation canals lead early river towns to write shared laws and calendars?',
    choices: [
      { id: 'a', text: 'Coordinating flood timing, canal repair, and fair water-sharing required community rules.', outcome: 'Exact historical link! Managing shared water fostered record-keeping, civic agreements, and early writing systems.', accurate: true },
      { id: 'b', text: 'Each family dug a private ocean so neighbors never met.', outcome: 'Both clay dispatches show upriver and downriver neighbors depended directly on one shared canal system.', accurate: false },
    ],
    standards: [
      { framework: 'C3', code: 'D2.Geo.4.3-5', label: 'Explain how human cooperation adapts to river environments' },
    ],
    license: 'ORIGINAL',
  },
];
