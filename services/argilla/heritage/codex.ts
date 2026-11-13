/**
 * codex.ts — the Heritage Codex: what the Forge knows about the people it builds and the things they carry.
 *
 * A character is never "a mesh with a sword". It is a kind of person (an archetype: warrior, scholar, labourer…) from a
 * tradition (a culture in an era), and those two settle a great deal before a single vertex is placed: how the body is
 * built and how it stands, which arms belong with which, how each is made, what it is made of, how it is worn on the
 * body, and how it moves when the body moves. The Forge's context stage (scripts/eraclash3d/forgeContext.ts) recognises
 * the archetype and tradition from the character's art and kit, reads them here, and joins live museum objects and the
 * Combat Atlas (data/combatAtlasData.ts) to them, so every asset it builds is anchored in the real world.
 *
 * Entries are researched, not invented: each carries its sources. Dimensions are [least, typical, most] in metres and
 * bound what the art may ask for: the Forge measures the art first and reports when it falls outside the record.
 *
 * Adding a tradition or a weapon here teaches every creator's Forge at once (docs/character-forge.md §7).
 */

export type Range = [number, number, number];

// ---- Archetypes ----------------------------------------------------------------------------------------------------

export interface Archetype {
  id: string;
  label: string;
  /** Evidence words: kit pieces, flat-lay ids, spec words that point to this archetype, and how strongly. */
  cues: Record<string, number>;
  /** Bounds for the anatomy's sliders (forge fit-body searches inside them, and starts at the middle when unset). */
  body: { build: Range; musculature: Range; weight: Range };
  /** How the person carries themself: the rest pose and idle lean on it. Angles in degrees, + is extension. */
  bearing: { label: string; chest: number; chin: number; shoulders: number; stanceWidth: number; knees: number; notes: string[] };
  /** What a creator should study for how this person moves: Combat Atlas forms. */
  studies: string[];
}

export const ARCHETYPES: Archetype[] = [
  {
    id: 'warrior',
    label: 'Warrior / fighter',
    cues: { katana: 3, wakizashi: 2, tachi: 3, yari: 3, sword: 3, spear: 3, shield: 3, do: 2, kusazuri: 2, sode: 2, kote: 2, suneate: 2, kabuto: 2, armour: 2, armor: 2, mail: 2, gauntlet: 2, warrior: 4, fighter: 4, soldier: 4, samurai: 4, knight: 4 },
    body: { build: [1.0, 1.06, 1.18], musculature: [0.62, 0.8, 0.96], weight: [0.04, 0.14, 0.32] },
    bearing: {
      label: 'commanding',
      chest: 4, chin: 0, shoulders: -3, stanceWidth: 1.12, knees: 4,
      notes: [
        'Chest open and the shoulders settled down and back: armour is carried from the hips, not hunched under.',
        'Weight low and centred over the hips (koshi), knees soft, so the body can move off either foot.',
        'Chin level, gaze to the horizon: enzan no metsuke, "looking at the far mountain", as kendo teaches it.',
      ],
    },
    studies: ['kendo', 'judo', 'sumo', 'armizare', 'kunstdesfechtens', 'eskrima', 'silat'],
  },
  {
    id: 'civilian',
    label: 'Civilian',
    cues: { kosode: 1, hakama: 1, robe: 1, apron: 1, scholar: 3, merchant: 3, farmer: 3 },
    body: { build: [0.92, 1.0, 1.08], musculature: [0.2, 0.45, 0.7], weight: [0.1, 0.3, 0.6] },
    bearing: { label: 'at ease', chest: 0, chin: 0, shoulders: 0, stanceWidth: 1, knees: 2, notes: ['Relaxed upright posture; no guard held.'] },
    studies: [],
  },
];

// ---- Traditions ----------------------------------------------------------------------------------------------------

export interface Tradition {
  id: string;
  culture: string;
  era: string;
  years: [number, number];
  /** Evidence: kit presets, pieces, flat-lay ids that place a character here. */
  cues: Record<string, number>;
  /** The arms that belong to this tradition, most usual first (ids in ARMS). */
  arms: string[];
  /** Companions: carrying one arm implies another usually went with it (what, when, why). */
  companions: { with: string; adds: string; note: string }[];
  /** How the arms are worn over this tradition's dress. */
  wear: string[];
  /** Museum searches that find period objects for this tradition (services/museum). */
  museum: string[];
  /** Combat Atlas accessions that teach how these people fought (data/combatAtlasData.ts ids). */
  atlas: string[];
  sources: string[];
}

export const TRADITIONS: Tradition[] = [
  {
    id: 'jp-sengoku',
    culture: 'Japanese (samurai)',
    era: 'Sengoku to early Edo',
    years: [1467, 1615],
    cues: { 'tosei-gusoku': 5, 'kosode-hakama': 2, katana: 3, wakizashi: 3, do: 1, kusazuri: 2, sode: 2, kote: 1, suneate: 1, haidate: 2, hachimaki: 2, watagami: 3, eri: 1, hakama: 2, kosode: 2, obi: 1, tabi: 2, waraji: 2, kabuto: 1, samurai: 5 },
    arms: ['uchigatana', 'wakizashi', 'tanto', 'tachi', 'yari'],
    companions: [
      { with: 'uchigatana', adds: 'wakizashi', note: 'A samurai of the period carried a shorter companion blade with the uchigatana; the pairing became the formal daishō in the Edo period.' },
      { with: 'uchigatana', adds: 'sageo', note: 'Every saya has its sageo, a flat braided silk cord through the kurikata, tied to the obi or hakama himo so the scabbard cannot slip out on the draw.' },
    ],
    wear: [
      'Over armour the swords are thrust through the uwa-obi, an outer sash tied over the dō (tosei-gusoku); without armour, through the obi over the kosode.',
      'Uchigatana edge-up at the left hip, hilt forward and across the belly, the saya angled down and back past the hip.',
      'The wakizashi rides inside the katana, closer to the body, at a steeper angle.',
      'The tachi, older and for mounted warriors, hangs edge-down from the belt on two hangers (ashi): never confuse the two.',
    ],
    museum: ['Japanese sword Muromachi', 'uchigatana koshirae', 'katana blade Momoyama', 'tsuba Momoyama iron', 'wakizashi koshirae', 'tosei gusoku armor'],
    atlas: ['kendo', 'judo', 'sumo'],
    sources: [
      'Kōkan Nagayama, The Connoisseur\'s Book of Japanese Swords (Kodansha, 1997)',
      'Thomas D. Conlan, Weapons and Fighting Techniques of the Samurai Warrior 1200–1877 (Amber, 2008)',
      'Anthony J. Bryant, Samurai 1550–1600 (Osprey Warrior 7, 1994)',
      'Morihiro Ogawa, Art of the Samurai: Japanese Arms and Armor, 1156–1868 (The Metropolitan Museum of Art, 2009)',
    ],
  },
  {
    id: 'eu-late-medieval',
    culture: 'Western European',
    era: 'Late Middle Ages',
    years: [1350, 1500],
    cues: { longsword: 4, 'arming-sword': 4, mail: 3, gambeson: 3, brigandine: 3, gauntlet: 2, sabaton: 3, bascinet: 3, knight: 4 },
    arms: ['longsword', 'arming-sword', 'rondel-dagger'],
    companions: [{ with: 'longsword', adds: 'rondel-dagger', note: 'A dagger at the right hip went with the sword on the left: the fight-books teach both.' }],
    wear: ['The sword hangs in its scabbard from a sword belt at the left hip, slung so the hilt sits forward of the hip and the chape trails behind.'],
    museum: ['longsword 15th century', 'sword European 14th century', 'rondel dagger', 'scabbard medieval'],
    atlas: ['armizare', 'kunstdesfechtens'],
    sources: ['Ewart Oakeshott, The Sword in the Age of Chivalry (1964)', 'Fiore dei Liberi, Il Fior di Battaglia (c. 1410)'],
  },
];

// ---- Arms ----------------------------------------------------------------------------------------------------------

export interface Fitting { id: string; label: string; material: string; note: string }
export interface ArmsEntry {
  id: string;
  label: string;
  kind: 'sword' | 'dagger' | 'polearm' | 'shield';
  tradition: string;
  period: string;
  /** Builder the Forge uses (services/argilla/creature/weapons.ts). */
  builder: 'nihonto' | 'none';
  dims: Record<string, Range>;
  construction: Record<string, string>;
  fittings: Fitting[];
  /** Physical materials, for the PBR look: base colour (linear), metalness, roughness, and what the surface shows. */
  materials: Record<string, { color: [number, number, number]; metallic: number; roughness: number; surface: string }>;
  carry: { how: string; side: 'left' | 'right' | 'back' | 'hand'; edge: 'up' | 'down' | 'none'; downDeg: Range; tie?: string };
  /** How it behaves on a moving body and in use: the rig and the animation read these. */
  behaviour: { scabbard?: string; cord?: string; draw?: string; sheathe?: string; physics: { swingDeg: number; stiffness: number; drag: number } };
  sources: string[];
}

const NIHONTO_MATERIALS: ArmsEntry['materials'] = {
  steel: { color: [0.62, 0.64, 0.67], metallic: 1, roughness: 0.12, surface: 'tamahagane, polished to a mirror ji; the hamon a frosted white band of nioi and nie along the edge; the hada grain like wood showing through the polish' },
  hamon: { color: [0.86, 0.87, 0.88], metallic: 0.5, roughness: 0.36, surface: 'the hardened edge: crystalline, misty, frosted by the polish; milky white against the dark mirror of the ji' },
  same: { color: [0.86, 0.83, 0.75], metallic: 0, roughness: 0.55, surface: 'ray skin: a field of small hard nodules, ivory-white, showing through the diamonds of the wrap' },
  ito: { color: [0.03, 0.035, 0.09], metallic: 0, roughness: 0.62, surface: 'flat braided silk, wrapped in crossing turns over hishigami paper folds' },
  fittings: { color: [0.9, 0.68, 0.3], metallic: 1, roughness: 0.32, surface: 'gilt copper or shakudō: fuchi, kashira, menuki and habaki' },
  tsuba: { color: [0.08, 0.075, 0.07], metallic: 1, roughness: 0.55, surface: 'forged iron, dark patina, a raised rim (mimi) and relief or openwork' },
  seppa: { color: [0.75, 0.42, 0.25], metallic: 1, roughness: 0.3, surface: 'copper washers either side of the tsuba' },
  saya: { color: [0.025, 0.03, 0.06], metallic: 0, roughness: 0.18, surface: 'honoki (magnolia) wood under many coats of urushi lacquer, deep and glassy' },
  sageo: { color: [0.03, 0.04, 0.1], metallic: 0, roughness: 0.7, surface: 'flat braided silk cord' },
  horn: { color: [0.02, 0.018, 0.016], metallic: 0, roughness: 0.25, surface: 'buffalo horn: koiguchi, kurikata and kojiri' },
};

export const ARMS: ArmsEntry[] = [
  {
    id: 'uchigatana',
    label: 'Uchigatana (katana)',
    kind: 'sword', tradition: 'jp-sengoku', period: 'Muromachi to early Edo (c. 1400–1615)', builder: 'nihonto',
    dims: {
      nagasa: [0.6, 0.7, 0.78],        // blade, munemachi to tip, along the chord
      sori: [0.008, 0.016, 0.024],      // curvature: greatest gap between the mune and the chord
      motohaba: [0.028, 0.031, 0.034],  // width at the base
      sakihaba: [0.019, 0.022, 0.025],  // width at the yokote
      kasane: [0.0065, 0.0072, 0.008],  // thickness at the base
      kissaki: [0.028, 0.036, 0.05],    // the point section, yokote to tip
      tsuka: [0.2, 0.25, 0.29],         // hilt
      tsuba: [0.07, 0.078, 0.085],      // guard diameter
      saya: [0.66, 0.76, 0.84],         // scabbard
    },
    construction: {
      section: 'shinogi-zukuri: edge (ha), flat (hira-ji) up to the ridge line (shinogi), then the shinogi-ji to the back (mune), iori-mune (peaked)',
      curve: 'koshi-zori or torii-zori: the edge on the outside of the curve, deepest just below the middle',
      hi: 'often a bo-hi groove along the shinogi-ji, lightening the blade',
      hamon: 'midare (irregular) or notare (wavy) in the period; the art decides',
      tsuka: 'wood core in ray skin, menuki ornaments under the wrap, bamboo mekugi peg through the tang, fuchi collar and kashira cap',
      wrap: 'hishi-maki: two flat braids crossing over and under, folded paper hishigami under each crossing make the diamonds (about 7–9 a side)',
    },
    fittings: [
      { id: 'habaki', label: 'Habaki', material: 'fittings', note: 'blade collar: holds the sword in the saya by friction at the koiguchi' },
      { id: 'seppa', label: 'Seppa', material: 'seppa', note: 'a washer either side of the tsuba' },
      { id: 'tsuba', label: 'Tsuba', material: 'tsuba', note: 'the guard; balances the blade and stops the hand' },
      { id: 'fuchi', label: 'Fuchi', material: 'fittings', note: 'collar at the guard end of the hilt' },
      { id: 'kashira', label: 'Kashira', material: 'fittings', note: 'pommel cap; the wrap passes through its shitodome' },
      { id: 'menuki', label: 'Menuki', material: 'fittings', note: 'ornaments under the wrap, one each side, filling the palm' },
      { id: 'mekugi', label: 'Mekugi', material: 'horn', note: 'bamboo peg through tsuka and tang' },
      { id: 'koiguchi', label: 'Koiguchi', material: 'horn', note: 'the scabbard mouth' },
      { id: 'kurikata', label: 'Kurikata', material: 'horn', note: 'knob on the omote side of the saya for the sageo, a hand below the mouth' },
      { id: 'kojiri', label: 'Kojiri', material: 'horn', note: 'end cap of the saya' },
      { id: 'sageo', label: 'Sageo', material: 'sageo', note: 'flat silk cord through the kurikata; tied to the obi or hakama himo' },
    ],
    materials: NIHONTO_MATERIALS,
    carry: { how: 'thrust through the obi (over armour, the uwa-obi), hilt forward', side: 'left', edge: 'up', downDeg: [20, 32, 45], tie: 'the sageo wraps the saya below the kurikata and its ends tie off at the obi' },
    behaviour: {
      scabbard: 'Rigid. Pinned where it passes through the obi: it turns with the hips, not the legs, and the kojiri trails, rising when the hips rotate and the stride opens.',
      cord: 'The sageo\'s free ends hang and swing with every step; they are cloth on the move, not part of the saya.',
      draw: 'Left hand at the koiguchi, thumb pushes the tsuba to free the habaki (koiguchi o kiru); the saya is drawn back (saya-biki) as the blade leaves, edge-up, straight into the first cut (nukitsuke).',
      sheathe: 'Noto: the blade\'s back slides across the left hand to the koiguchi, tip in, the saya pushed forward to meet it.',
      physics: { swingDeg: 7, stiffness: 40, drag: 0.35 },
    },
    sources: ['Kōkan Nagayama (1997) ch. 1–3', 'Morihiro Ogawa, Art of the Samurai (Met, 2009)', 'Conlan (2008)'],
  },
  {
    id: 'wakizashi',
    label: 'Wakizashi',
    kind: 'sword', tradition: 'jp-sengoku', period: 'Muromachi to Edo', builder: 'nihonto',
    dims: {
      nagasa: [0.3, 0.45, 0.6], sori: [0.005, 0.011, 0.016], motohaba: [0.026, 0.029, 0.032], sakihaba: [0.018, 0.021, 0.024],
      kasane: [0.006, 0.0068, 0.0075], kissaki: [0.025, 0.032, 0.04], tsuka: [0.14, 0.17, 0.2], tsuba: [0.06, 0.068, 0.075], saya: [0.36, 0.52, 0.68],
    },
    construction: { section: 'shinogi-zukuri', curve: 'shallow', hi: 'sometimes', hamon: 'matches the katana when made as a pair', tsuka: 'as the katana', wrap: 'hishi-maki' },
    fittings: [],
    materials: NIHONTO_MATERIALS,
    carry: { how: 'thrust through the obi inside the katana', side: 'left', edge: 'up', downDeg: [30, 42, 55], tie: 'sageo knotted round the saya' },
    behaviour: { scabbard: 'Rigid, rides the obi closer to the body than the katana.', cord: 'Short free ends.', physics: { swingDeg: 5, stiffness: 46, drag: 0.35 } },
    sources: ['Kōkan Nagayama (1997)'],
  },
  {
    id: 'tachi',
    label: 'Tachi',
    kind: 'sword', tradition: 'jp-sengoku', period: 'Heian to Muromachi', builder: 'nihonto',
    dims: { nagasa: [0.7, 0.78, 0.9], sori: [0.02, 0.027, 0.035], motohaba: [0.03, 0.032, 0.035], sakihaba: [0.017, 0.02, 0.023], kasane: [0.0065, 0.0072, 0.008], kissaki: [0.025, 0.03, 0.04], tsuka: [0.22, 0.26, 0.3], tsuba: [0.07, 0.08, 0.09], saya: [0.78, 0.86, 0.98] },
    construction: { section: 'shinogi-zukuri', curve: 'deep koshi-zori', hi: 'often', hamon: 'choji and suguha', tsuka: 'as the katana', wrap: 'hishi-maki' },
    fittings: [{ id: 'ashi', label: 'Ashi', material: 'fittings', note: 'two hangers on the saya by which it is slung' }],
    materials: NIHONTO_MATERIALS,
    carry: { how: 'slung edge-down from the belt on two hangers', side: 'left', edge: 'down', downDeg: [15, 25, 35] },
    behaviour: { scabbard: 'Hangs and swings from its two ashi.', physics: { swingDeg: 18, stiffness: 18, drag: 0.25 } },
    sources: ['Kōkan Nagayama (1997)'],
  },
];

export const ARMS_BY_ID = Object.fromEntries(ARMS.map((a) => [a.id, a])) as Record<string, ArmsEntry>;
export const TRADITIONS_BY_ID = Object.fromEntries(TRADITIONS.map((t) => [t.id, t])) as Record<string, Tradition>;

/** Which arms entry a kit or flat-lay word means within a tradition (katana → uchigatana in Sengoku Japan). */
export const ARMS_ALIASES: Record<string, string> = { katana: 'uchigatana', katana_saya: 'uchigatana', uchigatana: 'uchigatana', wakizashi: 'wakizashi', tachi: 'tachi', tanto: 'tanto', yari: 'yari', longsword: 'longsword' };

/** Score evidence against a set of cue tables: [best id, confidence 0..1, the cues that matched]. */
export function recognise<T extends { id: string; cues: Record<string, number> }>(items: T[], evidence: string[]): { id: string; confidence: number; matched: string[] }[] {
  const ev = new Set(evidence.map((e) => e.toLowerCase()));
  return items.map((it) => {
    const matched = Object.keys(it.cues).filter((c) => ev.has(c));
    const got = matched.reduce((s, c) => s + it.cues[c], 0);
    const total = Object.values(it.cues).reduce((s, w) => s + w, 0);
    // confidence: how much evidence there is, saturating; a strong cue (a named preset) alone gets far
    return { id: it.id, confidence: +(1 - Math.exp(-got / 6)).toFixed(3), matched, share: got / total };
  }).sort((a, b) => b.confidence - a.confidence);
}
