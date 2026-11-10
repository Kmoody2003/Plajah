// 90-second social spots for Machine Soul, scripted shot by shot and pre-visualized by
// components/exhibits/technoHistory/SpotPreviz.tsx in 16:9 and 9:16.
//
// Music rule: the spots are for sharing on Plajah Social, so they can't use the commercial recordings the
// exhibit embeds. Every spot runs on an ORIGINAL bed (electro/techno, 126–130 BPM, made in Chora) and the
// archival-photo shots are marked for licensing or illustration. VO pace ~2.4 words/sec.

export type TxComp =
  | 'stamp'      // big stencil year/place over noise
  | 'factory'    // assembly-line motion, sparks
  | 'radio'      // tuning dial + call letters
  | 'portrait'   // wheat-pasted poster of a person (placeholder silhouette in previz)
  | 'trio'       // three posters side by side / stacked
  | 'word'       // one huge word slammed onto the wall
  | 'map'        // Detroit ↔ Berlin line across the Atlantic
  | 'wall'       // Berlin Wall crack + date
  | 'vault'      // steel vault door opening
  | 'quote'      // typewriter quote on tape
  | 'records'    // record sleeves sliding in, catalog numbers
  | 'grid'       // step-sequencer grid lighting up
  | 'end';       // end card + CTA

export interface TxShot {
  t0: number;
  t1: number;
  comp: TxComp;
  /** Big on-screen text (stencil). */
  sup: string;
  /** Small secondary line (typewriter). */
  sub?: string;
  vo: string;
  /** What the finished shot shows. */
  visual: string;
  /** Framing for 16:9 and 9:16. */
  wide: string;
  tall: string;
  sound: string;
  ink: string;
  /** Names used by portrait/trio comps. */
  names?: string[];
}

export interface TxSpot {
  id: string;
  title: string;
  logline: string;
  bpm: number;
  bed: string;
  shots: TxShot[];
}

export const TX_SPOTS: TxSpot[] = [
  {
    id: 'machine-soul', title: 'Machine Soul: Detroit → Berlin', bpm: 128,
    logline: 'How a broken Motor City built techno, and how a broken Berlin turned it up.',
    bed: 'Original electro bed in Chora: 808-style kit, vocoder pad, square-wave bass. Bar 1 is full volume (no filtered intro). Drop out to a single kick at 0:56 for the Wall, slam back at 1:04 with a 909-style kit for Berlin.',
    shots: [
      { t0: 0, t1: 4, comp: 'stamp', sup: 'DETROIT. 1981.', vo: 'Detroit. Nineteen eighty-one.', ink: '#ff5a1f',
        visual: 'Black frame, xerox noise. Stencil type sprays on letter by letter on the first kick.', wide: 'Type centred, 60% width.', tall: 'Type stacked DETROIT / 1981, fills top two thirds.', sound: 'Kick + vocoder "Detroit" chop on beat 1.' },
      { t0: 4, t1: 12, comp: 'factory', sup: 'THE LINE GOES QUIET', sub: 'Population: 1.85M (1950) → 1.2M (1980)', vo: 'The assembly lines are going quiet. Robots took the jobs. Motown already left for L.A.', ink: '#ff5a1f',
        visual: 'Archival auto-plant footage (license: Detroit Public Library / Reuther Library), halftone-processed, sparks overlaid. Population counter ticks down.', wide: 'Footage full-frame, counter lower-left.', tall: 'Footage cropped to a single welder, counter top.', sound: 'Bed + metal hits on the snare.' },
      { t0: 12, t1: 20, comp: 'radio', sup: 'THE ELECTRIFYING MOJO', sub: 'Kraftwerk ▸ Parliament ▸ Prince', vo: 'But at midnight, one DJ, the Electrifying Mojo, plays Kraftwerk next to Parliament. And the kids are listening.', ink: '#ffd400',
        visual: 'Radio dial sweeps; needle lands; band names flicker past like station IDs.', wide: 'Dial across the frame.', tall: 'Dial vertical, names scroll up.', sound: 'Tuning-static riser into bar 5.' },
      { t0: 20, t1: 30, comp: 'portrait', sup: 'CYBOTRON', sub: 'Juan Atkins + Rick Davis · 1981', names: ['JUAN ATKINS', 'RICK DAVIS'], vo: 'In a community college, Juan Atkins and Rick Davis build Cybotron: funk, made by machines.', ink: '#00e5ff',
        visual: 'Two wheat-pasted posters slap onto a brick wall. "Alleys of Your Mind" sleeve slides in. (Photos: license, or commission illustrated portraits.)', wide: 'Posters left/right, sleeve centre.', tall: 'Posters stacked, sleeve bottom.', sound: 'Vocoder phrase from the bed (original, not Cybotron).' },
      { t0: 30, t1: 40, comp: 'trio', sup: 'THE BELLEVILLE THREE', sub: 'Metroplex · Transmat · KMS', names: ['ATKINS', 'MAY', 'SAUNDERSON'], vo: 'Atkins teaches two friends from Belleville: Derrick May and Kevin Saunderson. Three friends. Three labels.', ink: '#ff2d55',
        visual: 'Three posters drop in on beats 1, 2, 3; label names stencilled under each.', wide: 'Three across.', tall: 'Three stacked, each a third of the height.', sound: 'Three snare hits land with the posters.' },
      { t0: 40, t1: 48, comp: 'word', sup: 'TECHNO', sub: 'UK compilation · 1988', vo: 'In 1988, a British compilation puts a name on the sound. Techno.', ink: '#ffffff',
        visual: 'The word slams onto the wall in spray, drips run.', wide: 'Word fills 80% width.', tall: 'Word rotated 90° up the frame.', sound: 'Big crash, everything stops for half a beat on "Techno."' },
      { t0: 48, t1: 56, comp: 'records', sup: 'UNDERGROUND RESISTANCE', sub: 'Banks · Mills · Hood', vo: 'A second wave pulls on masks. Underground Resistance. No faces. No compromise.', ink: '#b8ff00',
        visual: 'Black sleeves with catalog numbers slide past fast; masked silhouettes.', wide: 'Sleeves conveyor left→right.', tall: 'Sleeves fall top→bottom.', sound: 'Bed gets harder, distorted bass.' },
      { t0: 56, t1: 64, comp: 'wall', sup: '9 NOV 1989', sub: 'Berlin', vo: 'Then, four thousand miles away, the Berlin Wall falls.', ink: '#ffffff',
        visual: 'A concrete wall cracks down the middle; daylight through the gap. (Archive: licensed Wall-fall footage.)', wide: 'Crack vertical centre.', tall: 'Crack vertical centre, date top.', sound: 'Music drops to one kick and crowd noise.' },
      { t0: 64, t1: 74, comp: 'vault', sup: 'TRESOR', sub: 'Tresor 001: X-101 (Detroit)', vo: 'East Berlin is full of empty buildings. A bank vault becomes a club called Tresor. Its first record? Detroit.', ink: '#ffffff',
        visual: 'Steel vault door swings open onto strobes. Tresor 001 sleeve.', wide: 'Door fills frame, swings toward camera.', tall: 'Door cropped to the wheel, opens into strobe.', sound: 'Slam back in with a 909-style kit.' },
      { t0: 74, t1: 82, comp: 'map', sup: 'DETROIT ⟷ BERLIN', vo: 'Two broken cities. One sound. Detroit built the machine. Berlin turned it up.', ink: '#00e5ff',
        visual: 'Spray-painted line arcs from Detroit to Berlin over a xeroxed map.', wide: 'Map with Atlantic in centre.', tall: 'Map rotated: Detroit bottom, Berlin top.', sound: 'Full bed, riser.' },
      { t0: 82, t1: 90, comp: 'end', sup: 'MACHINE SOUL', sub: 'The exhibition · on Plajah', vo: 'Machine Soul. Step inside, on Plajah.', ink: '#a63be6',
        visual: 'Title in the Plajah gradient over the brick wall; CTA; ~2 s quiet end card.', wide: 'Title centre, CTA under.', tall: 'Title top half, CTA lower third, safe of the UI chrome.', sound: 'Last bar, then ring-out and 2 s quiet.' },
    ],
  },
  {
    id: 'belleville-three', title: 'The Belleville Three', bpm: 126,
    logline: 'Three friends from a small town outside Detroit, and the labels that built techno.',
    bed: 'Original bed in Chora: strings-and-piano riff over a 909-style groove (in the spirit of the era, no interpolation of any real record). Each pioneer gets a change in the bed: electro for Atkins, strings for May, deep bass for Saunderson.',
    shots: [
      { t0: 0, t1: 5, comp: 'stamp', sup: 'BELLEVILLE, MI', sub: 'pop. small. dreams: not.', vo: 'Thirty miles from Detroit, in a small town called Belleville…', ink: '#ff2d55',
        visual: 'Road sign stencilled over a farm road.', wide: 'Sign right third.', tall: 'Sign centre.', sound: 'Bed in full from frame 1.' },
      { t0: 5, t1: 12, comp: 'trio', sup: 'THREE KIDS', names: ['JUAN', 'DERRICK', 'KEVIN'], vo: '…three kids became friends over records, drum machines and the Electrifying Mojo.', ink: '#ff2d55',
        visual: 'Three blank posters, first names sprayed on.', wide: 'Three across.', tall: 'Stacked.', sound: 'Three hits.' },
      { t0: 12, t1: 30, comp: 'portrait', sup: 'JUAN ATKINS', sub: 'The Originator · Cybotron · Model 500 · Metroplex', names: ['JUAN ATKINS'], vo: 'Juan Atkins was the oldest, and he went first. Cybotron in 1981. Then alone, as Model 500, on his own label, Metroplex. He called it techno.', ink: '#00e5ff',
        visual: 'Atkins poster fills the wall; Metroplex 001 sleeve; the word TECHNO tagged beside him.', wide: 'Poster left, sleeve right.', tall: 'Poster top, sleeve bottom.', sound: 'Bed shifts to electro.' },
      { t0: 30, t1: 48, comp: 'portrait', sup: 'DERRICK MAY', sub: 'The Innovator · Rhythim Is Rhythim · Transmat', names: ['DERRICK MAY'], vo: 'Derrick May learned the machines from Juan. Then he made "Strings of Life", a record with no kick drum in its opening, that broke Detroit wide open in Europe.', ink: '#ff2d55',
        visual: 'May poster; Transmat sleeve; strings drawn as scratched lines.', wide: 'Poster right, sleeve left.', tall: 'Poster top.', sound: 'Bed shifts to strings + piano.' },
      { t0: 48, t1: 66, comp: 'portrait', sup: 'KEVIN SAUNDERSON', sub: 'The Elevator · Inner City · Reese · KMS', names: ['KEVIN SAUNDERSON'], vo: 'Kevin Saunderson took it to the charts with Inner City, and as Reese wrote a bassline drum and bass still runs on.', ink: '#ff8c00',
        visual: 'Saunderson poster; KMS sleeve; a chart graph sprayed climbing.', wide: 'Poster left.', tall: 'Poster top.', sound: 'Bed shifts to deep detuned bass.' },
      { t0: 66, t1: 76, comp: 'quote', sup: 'GEORGE CLINTON + KRAFTWERK', sub: '"…stuck in an elevator…" Derrick May on techno', vo: 'May once described techno as George Clinton and Kraftwerk, stuck in an elevator together.', ink: '#ffd400',
        visual: 'Typewritten quote on tape strips across the wall.', wide: 'Quote across centre.', tall: 'Quote wrapped in four lines.', sound: 'Bed strips to drums.' },
      { t0: 76, t1: 84, comp: 'records', sup: 'METROPLEX · TRANSMAT · KMS', vo: 'Three labels. One city. A sound the whole world still dances to.', ink: '#ffffff',
        visual: 'The three label logos-as-stencils stamp in.', wide: 'Three across.', tall: 'Stacked.', sound: 'Everything back in.' },
      { t0: 84, t1: 90, comp: 'end', sup: 'THE BELLEVILLE THREE', sub: 'Machine Soul · on Plajah', vo: 'Meet them in Machine Soul, on Plajah.', ink: '#a63be6',
        visual: 'Plajah gradient title, CTA, ~2 s quiet.', wide: 'Centre.', tall: 'Title top, CTA lower third.', sound: 'Ring-out + 2 s quiet.' },
    ],
  },
  {
    id: 'originator', title: 'The Originator: A Tribute to Juan Atkins', bpm: 130,
    logline: 'Before it had a name, Juan Atkins was already making it.',
    bed: 'Original bed in Chora at 130 BPM: an electro pattern built in the exhibit\'s own "Machine Funk" sequencer (808-style kit, square bass, vocoder pad). The sequencer grid itself is the visual motif.',
    shots: [
      { t0: 0, t1: 6, comp: 'grid', sup: 'BEFORE IT HAD A NAME', vo: 'Before it had a name…', ink: '#00e5ff',
        visual: 'A 16-step grid lights up step by step in time with the bed.', wide: 'Grid across the frame.', tall: 'Grid as 4×4 square.', sound: 'Bed starts on the grid\'s first step.' },
      { t0: 6, t1: 14, comp: 'portrait', sup: 'JUAN ATKINS', sub: 'b. 1962 · Detroit', names: ['JUAN ATKINS'], vo: '…Juan Atkins was already making it. Detroit-born, Belleville-raised, with a synthesizer and a science-fiction imagination.', ink: '#00e5ff',
        visual: 'Wheat-paste portrait (commissioned illustration or licensed photo).', wide: 'Portrait right, name left.', tall: 'Portrait fills, name over shoulder.', sound: 'Vocoder pad swells.' },
      { t0: 14, t1: 24, comp: 'records', sup: 'CYBOTRON', sub: 'Alleys of Your Mind · Cosmic Cars · Clear', vo: 'With Cybotron he made "Alleys of Your Mind", "Cosmic Cars", and "Clear", records that hip-hop has rebuilt ever since.', ink: '#00e5ff',
        visual: 'The three sleeves (as typographic stand-ins) slide in.', wide: 'Three across.', tall: 'Cascade.', sound: 'Bed adds square bass.' },
      { t0: 24, t1: 34, comp: 'word', sup: 'TECHNO', sub: 'from Toffler\'s "techno rebels"', vo: 'He read about the "techno rebels" of a coming information age, and took the word to the dance floor.', ink: '#ffffff',
        visual: 'TECHNO slams onto the wall; book-page texture behind.', wide: 'Full width.', tall: 'Vertical.', sound: 'Crash.' },
      { t0: 34, t1: 44, comp: 'records', sup: 'METROPLEX 001', sub: "Model 500 · No UFO's · 1985", vo: 'In 1985 he started his own label, Metroplex, and released "No UFO\'s" as Model 500. Faster. Colder. Brand new.', ink: '#00e5ff',
        visual: 'Metroplex 001 catalog number stamped big.', wide: 'Centre.', tall: 'Centre.', sound: 'Bed speeds feel: hats double.' },
      { t0: 44, t1: 54, comp: 'trio', sup: 'HE TAUGHT THEM', names: ['DERRICK MAY', 'KEVIN SAUNDERSON', 'THE WORLD'], vo: 'He showed his younger friends Derrick May and Kevin Saunderson how the machines worked. Then the world caught on.', ink: '#ff2d55',
        visual: 'Two posters plus a third that is a mirror: the viewer.', wide: 'Three across.', tall: 'Stacked.', sound: 'Three hits.' },
      { t0: 54, t1: 66, comp: 'map', sup: 'DETROIT ⟷ BERLIN', sub: '3MB feat. Juan Atkins · Tresor · 1992', vo: 'When Berlin opened its vaults, Atkins was there, recording with Moritz von Oswald in 1992, and again as Borderland twenty years later.', ink: '#ffffff',
        visual: 'Spray line Detroit→Berlin, two dates on it: 1992, 2013.', wide: 'Map.', tall: 'Map rotated.', sound: '909 swaps in for the Berlin half.' },
      { t0: 66, t1: 78, comp: 'quote', sup: 'THE ORIGINATOR', sub: 'Cybotron · Model 500 · Infiniti · Metroplex', vo: 'Forty-five years of records, and still pointed at the future. They call him the Originator, because before him, there wasn\'t a name for this.', ink: '#00e5ff',
        visual: 'Every alias sprayed in a ring around the portrait.', wide: 'Ring around centre.', tall: 'Ring around centre.', sound: 'Full bed, last build.' },
      { t0: 78, t1: 84, comp: 'grid', sup: 'THANK YOU, JUAN', vo: 'Thank you, Juan.', ink: '#00e5ff',
        visual: 'Grid freezes on a pattern that spells J-A in lit steps.', wide: 'Grid.', tall: 'Grid.', sound: 'Bed cuts to vocoder pad alone.' },
      { t0: 84, t1: 90, comp: 'end', sup: 'THE ORIGINATOR', sub: 'A tribute in Machine Soul · on Plajah', vo: 'Visit the tribute, in Machine Soul on Plajah.', ink: '#a63be6',
        visual: 'Plajah gradient title, CTA, ~2 s quiet.', wide: 'Centre.', tall: 'Title top, CTA lower third.', sound: 'Ring-out + 2 s quiet.' },
    ],
  },
];

export const spotDuration = (s: TxSpot) => s.shots[s.shots.length - 1].t1;
export const spotWordCount = (s: TxSpot) => s.shots.reduce((n, sh) => n + sh.vo.split(/\s+/).filter(Boolean).length, 0);
