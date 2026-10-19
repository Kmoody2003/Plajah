// musicKnowledge — the grounded knowledge base behind the Music Council (and shared with the Meter
// Bridge "Studio School" + Mix Doctor). Real, typed facts — loudness targets, per-genre tonal/dynamics
// norms, and a technique library keyed to symptoms — so the council's advice cites numbers, not vibes.
// Pure data + query functions; no AI, no network.

export interface LoudnessTarget { platform: string; lufs: number; truePeakDb: number; note: string; group: 'streaming' | 'broadcast' | 'physical' | 'stage'; }

/** Delivery loudness targets (integrated LUFS / true-peak ceiling). */
export const LOUDNESS_TARGETS: LoudnessTarget[] = [
  { platform: 'Spotify', lufs: -14, truePeakDb: -1, note: 'Normalizes to −14; masters hotter than this are turned down.', group: 'streaming' },
  { platform: 'Apple Music', lufs: -16, truePeakDb: -1, note: 'Sound Check target −16; a touch quieter than Spotify.', group: 'streaming' },
  { platform: 'YouTube', lufs: -14, truePeakDb: -1, note: 'Normalizes around −14 LUFS.', group: 'streaming' },
  { platform: 'Tidal', lufs: -14, truePeakDb: -1, note: 'Streaming loudness −14.', group: 'streaming' },
  { platform: 'Amazon Music', lufs: -14, truePeakDb: -2, note: 'Around −14; keep −2 dBTP for lossy safety.', group: 'streaming' },
  { platform: 'Deezer', lufs: -15, truePeakDb: -1, note: 'Slightly quieter reference.', group: 'streaming' },
  { platform: 'SoundCloud', lufs: -14, truePeakDb: -1, note: 'Loudness normalization ~−14.', group: 'streaming' },
  { platform: 'Podcast', lufs: -16, truePeakDb: -1, note: 'Spoken word −16 mono / −19 varies; dialogue-forward.', group: 'streaming' },
  { platform: 'Broadcast R128', lufs: -23, truePeakDb: -1, note: 'EBU R128 / ATSC A/85 (−24) broadcast standard.', group: 'broadcast' },
  { platform: 'Netflix', lufs: -27, truePeakDb: -2, note: 'Dialogue-anchored −27 LKFS.', group: 'broadcast' },
  { platform: 'Cinema', lufs: -27, truePeakDb: -3, note: 'Theatrical reference, wide dynamics.', group: 'broadcast' },
  { platform: 'CD / physical', lufs: -9, truePeakDb: -0.3, note: 'No normalization — loudness is your call.', group: 'physical' },
  { platform: 'Club / DJ', lufs: -7, truePeakDb: -0.5, note: 'Loud, punchy, big low end; system does the rest.', group: 'stage' },
];

export function loudnessTarget(platform: string): LoudnessTarget | undefined {
  return LOUDNESS_TARGETS.find((t) => t.platform.toLowerCase() === platform.toLowerCase());
}

export interface GenreProfile {
  genre: string;
  lufs: [number, number];      // typical integrated LUFS range of released masters
  plr: [number, number];       // peak-to-loudness ratio (dynamics) range
  /** Relative tonal energy by band, 0..1 — a rough target balance to compare a mix against. */
  tone: { sub: number; low: number; lowMid: number; mid: number; highMid: number; high: number };
  feel: string;
}

/** Per-genre norms — a reference to compare the current mix against (not a rule). */
export const GENRE_PROFILES: GenreProfile[] = [
  { genre: 'edm', lufs: [-9, -6], plr: [6, 9], tone: { sub: 0.9, low: 0.85, lowMid: 0.55, mid: 0.6, highMid: 0.7, high: 0.8 }, feel: 'Big low end, bright top, controlled dynamics for the drop.' },
  { genre: 'hiphop', lufs: [-10, -7], plr: [7, 11], tone: { sub: 0.95, low: 0.8, lowMid: 0.5, mid: 0.55, highMid: 0.6, high: 0.7 }, feel: '808-forward low, vocal-forward mids, crisp but not harsh top.' },
  { genre: 'pop', lufs: [-11, -8], plr: [8, 12], tone: { sub: 0.6, low: 0.7, lowMid: 0.55, mid: 0.7, highMid: 0.75, high: 0.8 }, feel: 'Vocal is the star — clear mids, polished, present top.' },
  { genre: 'rock', lufs: [-11, -8], plr: [8, 13], tone: { sub: 0.4, low: 0.7, lowMid: 0.7, mid: 0.7, highMid: 0.65, high: 0.6 }, feel: 'Guitars in the low-mids, punchy drums, natural top.' },
  { genre: 'jazz', lufs: [-16, -12], plr: [12, 18], tone: { sub: 0.4, low: 0.6, lowMid: 0.6, mid: 0.65, highMid: 0.6, high: 0.55 }, feel: 'Wide dynamics, warm, natural — let it breathe.' },
  { genre: 'acoustic', lufs: [-15, -11], plr: [11, 16], tone: { sub: 0.35, low: 0.55, lowMid: 0.6, mid: 0.7, highMid: 0.65, high: 0.6 }, feel: 'Intimate, honest mids, gentle top, room to move.' },
  { genre: 'classical', lufs: [-20, -16], plr: [15, 25], tone: { sub: 0.5, low: 0.6, lowMid: 0.6, mid: 0.65, highMid: 0.6, high: 0.6 }, feel: 'Huge dynamic range — do not squeeze it.' },
];

export function genreProfile(genre: string): GenreProfile | undefined {
  return GENRE_PROFILES.find((g) => g.genre === genre.toLowerCase());
}

export interface Technique { symptom: string; move: string; where: string; school?: string; }

/** Technique library — a symptom → a concrete move, with the frequency/where. The Mix Doctor + Council
 *  both draw on this so a recommendation is actionable ("−2 dB around 300 Hz"), never vague. */
export const TECHNIQUES: Technique[] = [
  { symptom: 'muddy / boxy', move: 'Cut a dB or two of the build-up', where: '250–500 Hz', school: 'clarity-first' },
  { symptom: 'boomy / one-note bass', move: 'High-pass non-bass tracks; tighten the sub', where: 'HPF 30–40 Hz + control 60–120 Hz' },
  { symptom: 'harsh / fatiguing', move: 'Dip the harsh band, or de-ess the top', where: '2–4 kHz (harsh) · 6–9 kHz (sibilance)' },
  { symptom: 'dull / no air', move: 'Gentle high shelf for air', where: '10 kHz+ shelf' },
  { symptom: 'thin vocal', move: 'Small low-mid lift + presence', where: '200 Hz warmth · 3–5 kHz presence' },
  { symptom: 'narrow / mono', move: 'Widen sides / pan supporting parts; keep bass mono', where: 'M/S — sides up, low kept centered' },
  { symptom: 'loud but flat', move: 'Back off the limiter; parallel-compress the bus for punch', where: 'master bus · −2 dB less limiting' },
  { symptom: 'no punch / weak transients', move: 'Slower comp attack, add transient snap', where: 'drum bus attack 20–40 ms' },
  { symptom: 'clipping / over true-peak', move: 'Lower the ceiling; catch inter-sample peaks', where: 'true-peak limiter at −1 dBTP' },
  { symptom: 'over-compressed / pumping', move: 'Raise threshold, faster release, or less ratio', where: 'bus comp — 1–2 dB GR max' },
];

export function techniquesFor(query: string): Technique[] {
  const q = query.toLowerCase();
  return TECHNIQUES.filter((t) => t.symptom.includes(q) || t.move.toLowerCase().includes(q) || t.where.toLowerCase().includes(q));
}

/** A compact, model-ready grounding string: targets + the genre norm + technique cues. Fed to the
 *  Council's persona prompts so their advice is anchored to real numbers. */
export function knowledgeGrounding(genre?: string, platform?: string): string {
  const t = platform ? loudnessTarget(platform) : loudnessTarget('Spotify');
  const g = genre ? genreProfile(genre) : undefined;
  const parts: string[] = [];
  if (t) parts.push(`Delivery target (${t.platform}): ${t.lufs} LUFS integrated, true-peak ≤ ${t.truePeakDb} dBTP. ${t.note}`);
  if (g) parts.push(`Genre norm (${g.genre}): masters usually ${g.lufs[0]}…${g.lufs[1]} LUFS, PLR ${g.plr[0]}–${g.plr[1]}. ${g.feel}`);
  parts.push('Technique cues: ' + TECHNIQUES.map((x) => `${x.symptom} → ${x.move} (${x.where})`).join('; '));
  parts.push('Master Composer Scoring School: ' + MASTER_COMPOSER_LINEAGES.map((c) => `${c.composer} (${c.signature}) → Melos Presets: ${c.melosPresets.join(', ')}`).join(' | '));
  return parts.join('\n');
}

export interface MasterComposerLineage {
  id: string;
  composer: string;
  era: string;
  signature: string;
  harmonicLanguage: string;
  orchestrationRules: string[];
  melosPresets: string[];
}

/**
 * Grounded Film & Classical Master Composer Knowledge Base used by the Composer Council
 * when writing, orchestrating, and building multi-track scores in Melos / Chora Studio.
 */
export const MASTER_COMPOSER_LINEAGES: MasterComposerLineage[] = [
  {
    id: 'john-williams',
    composer: 'John Williams',
    era: 'Neo-Romantic Symphonic Cinema',
    signature: 'Leitmotif transformation, intervallic heroism (rising 5ths/6ths), contrapuntal horn counter-lines & celesta/woodwind filigree',
    harmonicLanguage: 'Chromatic mediant planing, Lydian wonder, half-diminished dramatic suspensions, and Wagnerian thematic metamorphosis.',
    orchestrationRules: [
      'State the primary leitmotif with a clear intervallic silhouette (leap of a 5th or 6th followed by stepwise resolution).',
      'Weave a lyrical French horn or oboe/flute obligato counter-melody during sustained melody notes.',
      'Double upper-register magical/intimate motifs with Celesta (aura-celesta-bell-69) and Concert Harp arpeggios (aura-harpsichord-68).',
    ],
    melosPresets: ['f_aura-celesta-bell-69', 'f_aura-mellotron-flute', 'f_aura-mellotron-violins', 'f_pneuma-ney'],
  },
  {
    id: 'hans-zimmer',
    composer: 'Hans Zimmer',
    era: 'Modern Hybrid Symphonic & Ostinato Architecture',
    signature: 'Relentless 16th-note spiccato/synth ostinatos over slow cathedral pedal points, ticking clockwork pulse, bowed cello menace & sub-bass braaams',
    harmonicLanguage: 'Dorian and Aeolian harmonic gravity (i – VI – III – VII or i – iv – V7), sustained tonic/dominant drones under building dynamic walls.',
    orchestrationRules: [
      'Anchor tension with a continuous 16th-note ostinato that shifts chord voicings every 2 to 4 bars.',
      'Drive low-end weight with physical Bowed Cello Menace (bajo: f_cello-menace), Braam impacts (bajo: f_braam), and Clockwork Timpani (aura: f_aura-clockwork-timpani).',
      'Layer analog CS-80 brass swells (aura: f_aura-cs80-bladerunner) with deep cathedral pipe organ pedals (ison: f_ison-bourdon).',
    ],
    melosPresets: ['f_cello-menace', 'f_braam', 'f_dune-drone', 'f_aura-cs80-bladerunner', 'f_aura-clockwork-timpani', 'f_ison-bourdon'],
  },
  {
    id: 'howard-shore',
    composer: 'Howard Shore',
    era: 'Mythic & Gothic Wagnerian Worldbuilding',
    signature: 'Ancient modal worldbuilding, dark low brass, monastic stone-crypt choirs & chromatic third-related tragedy',
    harmonicLanguage: 'Phrygian, Dorian, and Aeolian modes; minor-third chromatic mediants (Dm → Fm → C#m → A7); pedal-point fatalism.',
    orchestrationRules: [
      'Ground mythic and Gothic darkness in immovable 32ft organ bourdon drones (ison: f_ison-bourdon) and monastic voices (cantus: f_cantus-vault, f_cantus-byzantine).',
      'Transform character leitmotifs through modal darkening (Ionian → Dorian → Phrygian) as narrative stakes escalate.',
    ],
    melosPresets: ['f_cantus-vault', 'f_cantus-byzantine', 'f_cantus-plainsong', 'f_ison-bourdon', 'f_reliquary'],
  },
  {
    id: 'don-davis',
    composer: 'Don Davis',
    era: 'Avant-Garde & Minimalist Action Symphonism',
    signature: 'Polytonal brass cluster swells, mirror-canon counterpoint & kinetic minimalist ostinatos',
    harmonicLanguage: 'Bitonal triad superimpositions (e.g., Eb minor over D minor), interlocking rhythmic cells, and pyramid brass entries.',
    orchestrationRules: [
      'Superimpose interlocking rhythmic ostinatos in contrasting registers to create kinetic forward momentum.',
      'Use mirror-inversion counterpoint between high strings/woodwinds and low brass/basses.',
    ],
    melosPresets: ['f_aura-modular-brass-69', 'f_aura-clockwork-timpani', 'f_tremolo-strings', 'f_ferrous'],
  },
  {
    id: 'danny-elfman',
    composer: 'Danny Elfman',
    era: 'Gothic Waltz Macabre & Storybook Chiaroscuro',
    signature: '3/4 and 6/8 Gothic waltzes, crystalline Celesta & Music Box over pizzicato bass, wordless soprano choir & #4 Lydian-minor twists',
    harmonicLanguage: 'Harmonic minor with raised 4th (Hungarian minor), alternating i – V7/iv – iv – V7b9 waltz cadences, tritone bell inflections.',
    orchestrationRules: [
      'Lead intimate or uncanny openings with fragile Celesta/Music Box (aura: f_aura-celesta-bell-69, vela: f_vitreous) over plucked upright contrabass (bajo: f_upright-jazz).',
      'Float wordless Gothic choir (aura: f_aura-mellotron-choir, cantus: f_cantus-vault) over waltz-time string counter-lines.',
    ],
    melosPresets: ['f_aura-celesta-bell-69', 'f_vitreous', 'f_aura-mellotron-choir', 'f_upright-jazz'],
  },
  {
    id: 'ludwig-goransson',
    composer: 'Ludwig Göransson',
    era: 'Organic Solo Woodwind, Bowed Bass Pulse & Analog Hybrid (Mandalorian / Oppenheimer)',
    signature: 'Stark breath-forward solo woodwind call in open space, physical bowed bass guitar/contrabass pulse & vintage analog synth brass',
    harmonicLanguage: 'Stark Dorian/Aeolian open fifths, metric modulation, and visceral acoustic-electronic timbral fusion.',
    orchestrationRules: [
      'Open with an exposed, breath-heavy solo reed/flute call (pneuma: f_pneuma-ney or f_pneuma-shakuhachi) drenched in chamber/spring space.',
      'Answer the solo woodwind with a physical bowed contrabass/cello pulse (bajo: f_bowed-contrabass, f_cello-menace) and vintage analog brass/tape echo (aura: f_aura-cs80-bladerunner, f_aura-bbc-radiophonic).',
    ],
    melosPresets: ['f_pneuma-ney', 'f_pneuma-shakuhachi', 'f_bowed-contrabass', 'f_cello-menace', 'f_aura-cs80-bladerunner', 'f_aura-bbc-radiophonic'],
  },
  {
    id: 'marianelli-classical-regency',
    composer: 'Dario Marianelli, Beethoven, Schubert & Chopin',
    era: 'Classical & Regency Chamber Virtuosity (Pride & Prejudice)',
    signature: 'Flowing 3-octave fortepiano broken-chord waves, cantabile right-hand melody with Regency turns, pastoral woodwinds & divisi string quartet',
    harmonicLanguage: 'Luminous Classical-Romantic diatonicism (G major, D major, F major, E minor) with 4–3 and 9–8 voice-led suspensions and first-inversion bass walks.',
    orchestrationRules: [
      'Write continuous left-hand 16th/triplet broken-chord waves spanning a 10th (root–fifth–tenth–octave–third) underneath a lyrical right-hand cantabile melody.',
      'Dialog the fortepiano with pastoral flute/oboe (pneuma: f_pneuma-ney, aura: f_aura-mellotron-flute) and warm 4-voice divisi strings (aura: f_aura-mellotron-violins, f_aura-solina-74) over bowed cello continuo (bajo: f_bowed-contrabass).',
    ],
    melosPresets: ['f_aura-celesta-bell-69', 'f_aura-harpsichord-68', 'f_pneuma-ney', 'f_aura-mellotron-violins', 'f_bowed-contrabass'],
  },
  {
    id: 'kilar-liszt-gothic',
    composer: 'Wojciech Kilar, Franz Liszt, Berlioz & Bartók',
    era: 'Carpathian Gothic Romanticism (Bram Stoker’s Dracula)',
    signature: 'Hypnotic unison low cello/contrabass ostinatos, soaring tragic violin cantilena in D harmonic minor, Dies Irae brass/organ & Sanctus choir',
    harmonicLanguage: 'D Harmonic Minor & Phrygian Dominant (D–Eb–F#–G–A–Bb–C#), chromatic appoggiaturas, and Dies Irae plainsong cells.',
    orchestrationRules: [
      'Build hypnotic forward dread with unison bowed cellos and contrabasses (bajo: f_cello-menace, f_bowed-contrabass) repeating a tight minor-second / fifth ostinato.',
      'Soar above the ostinato with an aching, octave-doubled solo violin & string melody (aura: f_aura-mellotron-violins, vela: f_tremolo-strings) supported by stone-vault choir (cantus: f_cantus-vault) and 32ft organ pedal (ison: f_ison-bourdon).',
    ],
    melosPresets: ['f_aura-mellotron-violins', 'f_tremolo-strings', 'f_cantus-vault', 'f_cello-menace', 'f_ison-bourdon', 'f_braam'],
  },
];

