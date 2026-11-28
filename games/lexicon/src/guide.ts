// The guide: always shows the next goal, gold beacon, and key tips from live save state across all 6 regions.
import { INFECTED_ZONES, SIGILS, VILLAGERS, WILD_WORDS, type LevelId } from './content';
import type { PadGlyphs } from './gamepad';

export interface GuideState {
  level: LevelId;
  words: Set<string>;
  starting: string[];
  freed: string[];
  met: string[];
  sigils: string[];
  gates: string[];
  reclaimed: string[];
  puzzles: string[];
  lassoedFirst: boolean;
  elkUnlocked: boolean;
  templeDone: boolean;
  songs: { w: string; power: string }[];
  enemies: { kind: string; x: number; z: number }[];
  player: [number, number];
}

export interface GuideStep {
  id: string;
  goal: string;
  at?: [number, number];
  tip: string;
}

const WATERFALL_LADDER: [number, number] = [-59.5, -25.5];
const CIPHER_AT: [number, number] = [0, -59];
const TEMPLE_DOOR: [number, number] = [0, -77];
const ARENA: [number, number] = [0, -86];

export function nextStep(s: GuideState): GuideStep | null {
  const near = (kind?: string) => s.enemies.find((e) => !kind || e.kind === kind);

  if (s.level === 'minecart') {
    return {
      id: 'minecart',
      goal: 'Ride the Archive Cart through the Deep Cavern!',
      tip: 'Press [A] or [D] to choose the right Word/Math rail switch, [Space] to jump molten lava chasms, and [C] to lasso floating words.',
    };
  }
  if (s.level === 'rapids') {
    return {
      id: 'rapids',
      goal: 'Survive the Forest Rapids Run!',
      tip: 'Steer with [A]/[D] around boulders, [Space] to ramp fallen logs, [S] to duck low trunks, and [J] or [C] to repel Hushlings!',
    };
  }
  if (s.level === 'cavern') {
    if (!s.puzzles.includes('cavern-tiles')) {
      return { id: 'cavern-tiles', goal: 'Solve the Sunken Rune-Tile Seal', at: [0, -24], tip: 'Press [E] at the stone tile dais to align letters whose values match the vault equation.' };
    }
    if (!s.puzzles.includes('cavern-wheel')) {
      return { id: 'cavern-wheel', goal: 'Turn the Great Waterwheel Sluice', at: [0, -56], tip: 'Press [E] at the sluice wheel (or sing RAIN with [Q]) and match the gear ratio to drain the tunnel.' };
    }
    if (!s.puzzles.includes('cavern-mirrors')) {
      return { id: 'cavern-mirrors', goal: 'Align the Bronze Mirrors in the Hall of Reflections', at: [0, -90], tip: 'Rotate each bronze mirror with [E] or your Lasso [C] until the golden sunbeam hits the Vault Door!' };
    }
    if (!s.puzzles.includes('cavern-weights')) {
      return { id: 'cavern-weights', goal: 'Balance the Hanging Word-Weight Pulley', at: [0, -124], tip: 'Press [E] at the crane hoist and match torque (mass × distance) using your saved words.' };
    }
    return {
      id: 'cavern-cart',
      goal: 'Cross the Lava Pendulum Bridge & Board the Mine-Cart',
      at: [0, -172],
      tip: 'Sing TIME with [Q] to slow the swinging pendulum blades over the lava pit, then press [E] at the wooden cart!',
    };
  }
  if (s.level === 'wilds') {
    if (!s.elkUnlocked) {
      return {
        id: 'wilds-elk',
        goal: 'Survive the Riverbank Ambush & Wake the Great Forest Elk',
        at: [-18, 92],
        tip: 'Fight back or sing LIGHT ([Q] → LIGHT) in the white-paper clearing to summon the Antlered Word-Keeper, then press [E] to bond!',
      };
    }
    const blight = INFECTED_ZONES.find((z) => z.level === 'wilds' && !s.reclaimed.includes(z.id));
    if (blight) {
      return {
        id: `wilds-${blight.id}`,
        goal: `Ride the Great Elk to Reclaim ${blight.name}`,
        at: blight.pos,
        tip: 'Press [V] to mount/call the Great Forest Elk ([Space] leap logs, [J] Antler Surge, [C] Lasso fleeing wild words). Clear all enemies to restore colour!',
      };
    }
    return {
      id: 'wilds-shrine',
      goal: 'Visit the Root-Tree Word Shrine or Return to Glossa Valley',
      at: [-54, -84],
      tip: 'Sing MEND at the Root-Tree Shrine or step through the glowing Glossa Archway to bring your new words & Elk home.',
    };
  }
  if (s.level === 'temple') {
    if (s.templeDone) return { id: 'done', goal: 'Return to Glossa Hollow', at: [0, 2], tip: 'The Redactor is gone. Walk back out the way you came.' };
    const e = near();
    if (e) return { id: 'temple-fight', goal: 'Break the Numerals’ bonds', at: [e.x, e.z], tip: 'Hold [Shift] to lock on, strike with [J]. When one cracks, answer its sum with [1]–[4].' };
    return { id: 'temple-hall', goal: 'Face the Redactor in the far hall', at: ARENA, tip: 'Strike the pillar whose word weighs what he asks (A = 1 … Z = 26).' };
  }

  // ── Glossa Hollow Valley guided progression ──
  const elder = VILLAGERS[0];
  if (!s.met.includes('elder')) {
    return { id: 'elder', goal: `Talk to ${elder.name}`, at: elder.pos, tip: 'Walk with [W][A][S][D], turn camera with mouse/arrows. Follow the gold light, then press [E].' };
  }
  // Step 2: Guided first Word Lasso (combat triggers right AFTER they lasso this word!)
  if (!s.lassoedFirst) {
    const first = WILD_WORDS.find((w) => w.isFirstTutorial)!;
    return {
      id: 'first-lasso',
      goal: `Cast your Word Lasso to catch “${first.word}” on the bridge`,
      at: first.pos,
      tip: 'Walk near the floating golden word above the stone creek bridge and press [C] (or [L]) to cast your Word Lasso!',
    };
  }
  // Step 3: Return HOME to Mira if still carrying it
  const carry = VILLAGERS.find((v) => !s.freed.includes(v.id) && s.words.has(v.word));
  if (carry) {
    return { id: `give-${carry.id}`, goal: `Bring ${carry.word} to ${carry.name}`, at: carry.pos, tip: `Talk to ${carry.name.split(' ')[0]} with [E] and choose “Give ${carry.word}”.` };
  }
  // Step 4: Reclaim the first Infected Zone in Glossa Hollow (black-ink / white-paper combat zone!)
  const firstBlight = INFECTED_ZONES.find((z) => z.level === 'glossa' && !s.reclaimed.includes(z.id));
  if (firstBlight && s.reclaimed.length === 0) {
    return {
      id: `reclaim-${firstBlight.id}`,
      goal: `Reclaim the ${firstBlight.name} (Infected Zone)`,
      at: firstBlight.pos,
      tip: 'Where the Unwritten gather, the land turns white paper. Strike with [J], answer [1]–[4] to rescue words, and clear the pack to restore colour!',
    };
  }
  // Step 5: Head up the creek to the Roaring Waterfall & behind-the-veil Crystal Grotto!
  if (!s.puzzles.includes('cavern-cart-done')) {
    return {
      id: 'visit-waterfall',
      goal: 'Explore behind the Grand Waterfall (Veil Crystal Grotto)',
      at: WATERFALL_LADDER,
      tip: 'Follow the cobbled creek west past the waterwheel cottages to the roaring triple waterfall, then press [E] at the ladder behind the water!',
    };
  }
  // Step 6: Play a song at any remaining sigil
  for (const song of s.songs) {
    const sig = SIGILS.find((g) => g.level === 'glossa' && g.power === song.power && !s.sigils.includes(g.id));
    if (sig) {
      return {
        id: `sigil-${sig.id}`,
        goal: `Play ${song.w} at ${sig.label.replace(/^An? /, 'the ').toLowerCase()}`,
        at: sig.pos,
        tip: `Stand by it, press [Q] to raise the Lyre, then type ${[...song.w].map((c) => `[${c}]`).join('')}.`,
      };
    }
  }
  // Step 7: Cipher Gate & Temple of Numerals
  if (!s.gates.includes('cipher')) {
    if (s.words.size >= 4) return { id: 'cipher', goal: 'Weigh your words at the Cipher Gate', at: CIPHER_AT, tip: 'Press [E] at the gate. Pick words whose A=1…Z=26 weights sum to the gate number.' };
  } else if (!s.templeDone) {
    return { id: 'temple', goal: 'Enter the Temple of Numerals', at: TEMPLE_DOOR, tip: 'The gate is open. Walk north through it to face the Redactor.' };
  }
  // Open-world cleanup: remaining Infected Zones or lost villagers
  if (firstBlight) {
    return { id: `reclaim-${firstBlight.id}`, goal: `Reclaim ${firstBlight.name}`, at: firstBlight.pos, tip: 'Clear the Unwritten pack inside the white-paper field to restore the valley.' };
  }
  const e = near();
  return e ? { id: 'rescue-more', goal: 'Rescue every lost word across Glossa & the Wilds', at: [e.x, e.z], tip: 'Open the Archive with [Tab] or press [V] to ride the Great Forest Elk.' } : null;
}

export const tipHtml = (tip: string, pad?: PadGlyphs | null) => {
  if (!pad) return tip.replace(/\[([^\]]+)\]/g, '<span class="key">$1</span>');
  // Translate keyboard tips live into the active Xbox / PlayStation / Nintendo controller glyphs!
  const map: Record<string, string> = {
    E: pad.confirm,
    C: pad.rb,
    L: pad.rt,
    J: pad.strike,
    Q: pad.lyre,
    V: `D-Pad ${pad.dpadUp}`,
    Space: pad.confirm,
    Shift: pad.lt,
    Tab: pad.select,
    A: pad.lb,
    D: pad.rb,
    S: `${pad.cancel} / ${pad.dpadDown}`,
  };
  let out = tip
    .replace(/\[W\]\[A\]\[S\]\[D\]/g, `<span class="key">${pad.move}</span>`)
    .replace(/\[1\]–\[4\]/g, `<span class="key">D-Pad ${pad.dpadUp}${pad.dpadRight}${pad.dpadDown}${pad.dpadLeft}</span>`)
    .replace(/\[A\]\/\[D\]/g, `<span class="key">${pad.move} / ${pad.lb}·${pad.rb}</span>`)
    .replace(/mouse\/arrows/g, `<span class="key">${pad.look}</span>`);
  out = out.replace(/\[([^\]]+)\]/g, (_m, k: string) => `<span class="key">${map[k] ?? k}</span>`);
  return out;
};
