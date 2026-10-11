// vizEnergy — the temperament of a visualizer, for the library's energy filter.
//
// Scale, quietest → loudest:  tranquil · calm · medium · high · chaotic
//
// Works that declare one (Series VIII · Sanctuary Light) are taken at their
// word. Everything else is read from what we know about it: its family
// (Milkdrop runs hot, studio Atmosphere runs calm), its tags (calm / slow /
// fast / dark), and words in its name ("Storm", "Supernova", "Moonmilk").

export type VizEnergy = 'tranquil' | 'calm' | 'medium' | 'high' | 'chaotic';

export const VIZ_ENERGIES: Array<{ id: VizEnergy; label: string; color: string; hint: string }> = [
  { id: 'tranquil', label: 'Tranquil', color: '#7DD3FC', hint: 'Near-still — prayer, communion, scripture' },
  { id: 'calm', label: 'Calm', color: '#86EFAC', hint: 'Slow, gentle motion — worship, reflection' },
  { id: 'medium', label: 'Medium', color: '#FDE68A', hint: 'Steady movement — mid-tempo songs, walk-in' },
  { id: 'high', label: 'High energy', color: '#FDBA74', hint: 'Driving — praise, celebration, youth' },
  { id: 'chaotic', label: 'Chaotic', color: '#F87171', hint: 'Wild and dense — events, big moments' },
];

const RX: Array<[VizEnergy, RegExp]> = [
  ['chaotic', /explo|detonat|supernova|maelstrom|chaos|glitch|firework|shatter|strobe|riot|frenzy|tornado|kraken|warp|noise storm/],
  ['high', /storm|vortex|tunnel|kinetic|fast|bass|neon|solar|quantum|electric|surge|rave|laser|pulse|drive|fire|blaze|youth|energy|spiral|gravity|tectonic|molten|engine/],
  ['tranquil', /still|quiet|moon|pearl|mist|dawn|lagoon|prayer|sanctuary|meditat|lunar|selah|breath|vellum|hush|rest|candle|snow|silk|soft|luminance|celestial/],
  ['calm', /aurora|nebula|liquid|ripple|tide|kelp|flow|water|cloud|glass|lens|cathedral|calm|slow|ambient|drift|float|reef|lantern|garden|bloom|choir|aria|worship|light|ocean|sky/],
];

const ORDER: VizEnergy[] = ['tranquil', 'calm', 'medium', 'high', 'chaotic'];
const isEnergy = (s: unknown): s is VizEnergy => typeof s === 'string' && (ORDER as string[]).includes(s);

export interface EnergyInput {
  name: string;
  kind?: string;
  mode?: string;
  sub?: string;
  tags?: string[];
  /** Declared by the work itself. */
  energy?: string;
}

export function vizEnergy(item: EnergyInput): VizEnergy {
  if (isEnergy(item.energy)) return item.energy;
  const tags = (item.tags || []).map(t => t.toLowerCase());
  const declared = tags.find(t => t.startsWith('energy:'))?.slice(7);
  if (isEnergy(declared)) return declared;

  const text = `${item.name} ${item.sub || ''} ${tags.join(' ')}`.toLowerCase();
  // family defaults
  let base: VizEnergy =
    tags.includes('milkdrop') ? 'high'
    : tags.includes('typo') ? 'medium'
    : item.sub === 'Atmosphere' ? 'calm'
    : item.sub === 'Energy' ? 'high'
    : item.sub === 'Graphic' ? 'medium'
    : 'medium';
  // explicit tags from the media library
  if (tags.includes('calm') || tags.includes('slow')) base = tags.includes('soft') ? 'tranquil' : 'calm';
  else if (tags.includes('fast')) base = 'high';
  // name keywords win over family defaults (first match in loudest→quietest order of RX)
  for (const [e, rx] of RX) if (rx.test(text)) return milder(e, tags);
  return base;
}

/** Milkdrop presets are never tranquil or calm, however their name reads. */
function milder(e: VizEnergy, tags: string[]): VizEnergy {
  if (tags.includes('milkdrop') && ORDER.indexOf(e) < ORDER.indexOf('medium')) return 'medium';
  return e;
}

export const energyRank = (e: VizEnergy) => ORDER.indexOf(e);
