// Hand-drum rhythms for SOMA — the raw material of the hand-drum pattern library. Each rhythm is one
// drum part written as strokes on its own grid (16ths for 4/4, triplet 8ths for 12/8, 16ths for 2/4),
// in the standard form it's usually taught. The performer (handDrumPerformer.ts) plays them like a
// person would — persona, mood, role — rather than looping these strings.
//
// Honesty: `kind` says what a rhythm is. 'traditional' = a documented traditional pattern in its
// common teaching form; 'study' = a teaching/practice pattern built on a documented idea (a bell
// pattern, a polyrhythm); 'studio' = a studio groove in a style, not a traditional part.
//
// Stroke letters: B bass · T open tone · S slap · M muted · H heel · O toe · F fingertip · R rim · . rest
// A lowercase letter is the left hand; uppercase the right. Each part can sit on another drum: drum +1
// is a fourth up (quinto / macho), -1 a fourth down (tumba) — the hand map's octaves.

import type { SomaStroke } from '../../instruments/soma/handMap';
import type { SomaCategory } from '../../instruments/soma/presets';

export type HandTradition = 'Afro-Cuban' | 'West African' | 'Middle Eastern & North African' | 'South Asian' | 'Irish' | 'Studio';
export type HandMeter = '4/4' | '12/8' | '2/4';

export interface HandPart { drum: number; strokes: string }
export interface HandRhythm {
  id: string;
  name: string;
  tradition: HandTradition;
  kind: 'traditional' | 'study' | 'studio';
  meter: HandMeter;
  /** Grid cells per bar: 16 (4/4 16ths), 12 (12/8 triplet 8ths), 8 (2/4 16ths). */
  grid: 16 | 12 | 8;
  /** Bars in one cycle of the written pattern. */
  bars: number;
  parts: HandPart[];
  bpm: number;
  /** SOMA drums it suits, and the preset to load when the current drum isn't a hand drum. */
  suits: SomaCategory[];
  preset: string;
  about: string;
}

export const STROKE_LETTERS: Record<string, SomaStroke> = { b: 'bass', t: 'tone', s: 'slap', m: 'muted', h: 'heel', o: 'toe', f: 'tip', r: 'rim' };

export const HAND_RHYTHMS: HandRhythm[] = [
  // ── Afro-Cuban ──────────────────────────────────────────────────────────────────────────────
  { id: 'tumbao', name: 'Tumbao (one conga)', tradition: 'Afro-Cuban', kind: 'traditional', meter: '4/4', grid: 16, bars: 1, bpm: 96,
    parts: [{ drum: 0, strokes: 'H.o.S.o.H.o.T.T.' }], suits: ['afro-cuban'], preset: 'conga-habana-open',
    about: 'The basic conga marcha of son and salsa: heel–toe in the centre, a slap on 2, open tones on 4 and the "and" of 4. It locks with the clave.' },
  { id: 'tumbao-two', name: 'Tumbao (conga + tumba)', tradition: 'Afro-Cuban', kind: 'traditional', meter: '4/4', grid: 16, bars: 1, bpm: 98,
    parts: [{ drum: 0, strokes: 'H.o.S.o.H.o.....' }, { drum: -1, strokes: '............T.T.' }], suits: ['afro-cuban'], preset: 'conga-habana-open',
    about: 'The two-drum tumbao: the open tones on 4 and the "and" of 4 move to the lower tumba.' },
  { id: 'son-clave-32', name: 'Son clave 3-2', tradition: 'Afro-Cuban', kind: 'traditional', meter: '4/4', grid: 16, bars: 2, bpm: 96,
    parts: [{ drum: 0, strokes: 'R.....R.....R...' + '....R...R.......' }], suits: ['afro-cuban', 'west-african'], preset: 'conga-habana-open',
    about: 'The key pattern: three strokes (1, the "and" of 2, 4), then two (2 and 3). Played here as rim clicks.' },
  { id: 'rumba-clave-32', name: 'Rumba clave 3-2', tradition: 'Afro-Cuban', kind: 'traditional', meter: '4/4', grid: 16, bars: 2, bpm: 104,
    parts: [{ drum: 0, strokes: 'R.....R.......R.' + '....R...R.......' }], suits: ['afro-cuban'], preset: 'quinto-slap-sec',
    about: 'Rumba clave: like son clave, but the third stroke of the three-side is pushed to the "and" of 4.' },
  { id: 'martillo', name: 'Bongó martillo', tradition: 'Afro-Cuban', kind: 'traditional', meter: '4/4', grid: 16, bars: 1, bpm: 100,
    parts: [{ drum: 1, strokes: 'F.h.F.h.F.h.T...' }, { drum: 0, strokes: '..............T.' }], suits: ['afro-cuban'], preset: 'bongo-macho-martillo',
    about: 'The bongosero\'s "hammer" as it\'s commonly first taught: steady eighths on the small macho, open tones at the end of the bar, the last on the larger hembra.' },

  // ── West African ────────────────────────────────────────────────────────────────────────────
  { id: 'bell-128', name: '12/8 standard bell pattern', tradition: 'West African', kind: 'study', meter: '12/8', grid: 12, bars: 1, bpm: 110,
    parts: [{ drum: 0, strokes: 'T.s.TS.t.s.T' }], suits: ['west-african'], preset: 'djembe-lenke-master',
    about: 'The seven-stroke 12/8 bell pattern found across much of West Africa, voiced on the djembe as tones and slaps — a study pattern, not a specific traditional djembe part.' },
  { id: 'djembe-128', name: 'Djembe accompaniment in 12/8', tradition: 'West African', kind: 'study', meter: '12/8', grid: 12, bars: 1, bpm: 116,
    parts: [{ drum: 0, strokes: 'B..Tt.B..Ss.' }], suits: ['west-african'], preset: 'djembe-lenke-master',
    about: 'A common shape for a djembe accompaniment in 12/8 — bass on the beat, tone and slap pairs between. A practice pattern built on the bass/tone/slap idea, not a named rhythm.' },
  { id: 'three-four', name: 'Three against four', tradition: 'West African', kind: 'study', meter: '4/4', grid: 12, bars: 1, bpm: 92,
    parts: [{ drum: 0, strokes: 'B..t..t..t..' }, { drum: 0, strokes: '....T...T...' }], suits: ['west-african', 'afro-cuban'], preset: 'djembe-lenke-master',
    about: 'A polyrhythm study: four even tones against three even strokes in the same bar. The groove lives where the two pulses meet.' },

  // ── Middle Eastern & North African ─────────────────────────────────────────────────────────────
  { id: 'maqsum', name: 'Maqsum', tradition: 'Middle Eastern & North African', kind: 'traditional', meter: '4/4', grid: 16, bars: 1, bpm: 100,
    parts: [{ drum: 0, strokes: 'B.S...S.B...S...' }], suits: ['middle-eastern-india', 'frame-ancient'], preset: 'darbuka-cairo-doum',
    about: 'Dum tek – tek dum – tek –: one of the most common Middle Eastern rhythms (dum = the centre bass, tek = the rim stroke).' },
  { id: 'baladi', name: 'Baladi', tradition: 'Middle Eastern & North African', kind: 'traditional', meter: '4/4', grid: 16, bars: 1, bpm: 96,
    parts: [{ drum: 0, strokes: 'B.B...S.B...S...' }], suits: ['middle-eastern-india', 'frame-ancient'], preset: 'darbuka-cairo-doum',
    about: 'Dum dum – tek dum – tek –: maqsum with a second dum at the start — heavier, earthier.' },
  { id: 'saidi', name: 'Saidi', tradition: 'Middle Eastern & North African', kind: 'traditional', meter: '4/4', grid: 16, bars: 1, bpm: 104,
    parts: [{ drum: 0, strokes: 'B.S...B.B...S...' }], suits: ['middle-eastern-india'], preset: 'darbuka-cairo-doum',
    about: 'Dum tek – dum dum – tek –: the rhythm of Upper Egypt (the Sa\'id), with its two dums in the middle.' },
  { id: 'malfuf', name: 'Malfuf', tradition: 'Middle Eastern & North African', kind: 'traditional', meter: '2/4', grid: 8, bars: 1, bpm: 120,
    parts: [{ drum: 0, strokes: 'B..S..S.' }], suits: ['middle-eastern-india', 'frame-ancient'], preset: 'darbuka-tek-ka',
    about: 'A quick 2/4: dum – – tek – – tek –. Often used for entrances and fast passages.' },
  { id: 'ayoub', name: 'Ayoub', tradition: 'Middle Eastern & North African', kind: 'traditional', meter: '2/4', grid: 8, bars: 1, bpm: 112,
    parts: [{ drum: 0, strokes: 'B..sB.S.' }], suits: ['middle-eastern-india', 'frame-ancient'], preset: 'darbuka-tek-ka',
    about: 'A rolling 2/4 (dum – ka dum tek –), associated with zar trance ceremonies and Sufi music.' },
  { id: 'frame-maqsum', name: 'Maqsum on the frame drum', tradition: 'Middle Eastern & North African', kind: 'traditional', meter: '4/4', grid: 16, bars: 1, bpm: 96,
    parts: [{ drum: 0, strokes: 'B.F...F.B...F...' }], suits: ['frame-ancient'], preset: 'bendir-atlas-gut',
    about: 'Maqsum played on a frame drum (bendir, tar, daf): dum in the centre, tek with the fingers near the rim.' },

  // ── South Asian ─────────────────────────────────────────────────────────────────────────────
  { id: 'teental', name: 'Teental theka (approx.)', tradition: 'South Asian', kind: 'traditional', meter: '4/4', grid: 16, bars: 4, bpm: 80,
    // Dha Dhin Dhin Dha | Dha Dhin Dhin Dha | Dha Tin Tin Ta | Ta Dhin Dhin Dha — one matra per beat.
    parts: [
      { drum: 0, strokes: 'T...F...F...T...' + 'T...F...F...T...' + 'T...F...F...T...' + 'T...F...F...T...' },
      { drum: -1, strokes: 'b...b...b...b...' + 'b...b...b...b...' + 'b...............' + '....b...b...b...' },
    ], suits: ['middle-eastern-india'], preset: 'tabla-dayan-na',
    about: 'The 16-beat theka of teental, approximated on SOMA: the right-hand bols (na/tin) as tones and fingertips, the left-hand bass (ge) on a lower drum where the bol has it (Dha, Dhin) and silent where it doesn\'t (Tin, Ta).' },

  // ── Irish ───────────────────────────────────────────────────────────────────────────────────
  { id: 'reel', name: 'Bodhrán reel', tradition: 'Irish', kind: 'traditional', meter: '4/4', grid: 16, bars: 1, bpm: 108,
    parts: [{ drum: 0, strokes: 'T.t.T.t.T.t.T.t.' }], suits: ['frame-ancient'], preset: 'bodhran-kerry-tipper',
    about: 'Steady eighths under a reel, down and up strokes alternating, the beat carried by the accents.' },
  { id: 'jig', name: 'Bodhrán jig', tradition: 'Irish', kind: 'traditional', meter: '12/8', grid: 12, bars: 1, bpm: 112,
    parts: [{ drum: 0, strokes: 'TttTttTttTtt' }], suits: ['frame-ancient'], preset: 'bodhran-kerry-tipper',
    about: 'A jig\'s triplet flow (6/8, shown two bars to a 12/8 cycle): three strokes to each beat, accented on the beat.' },

  // ── Studio grooves (styles, not traditional parts) ─────────────────────────────────────────
  { id: 'funk-conga', name: 'Funk conga', tradition: 'Studio', kind: 'studio', meter: '4/4', grid: 16, bars: 1, bpm: 102,
    parts: [{ drum: 0, strokes: 'B.f.S.ft.fBS.fT.' }], suits: ['afro-cuban', 'west-african'], preset: 'conga-habana-open',
    about: 'A sixteenth-note conga groove for funk: slaps on the backbeats, fingertip ghost notes between.' },
  { id: 'pop-ballad', name: 'Ballad hand drum', tradition: 'Studio', kind: 'studio', meter: '4/4', grid: 16, bars: 1, bpm: 72,
    parts: [{ drum: 0, strokes: 'B.......M.....t.' }], suits: ['afro-cuban', 'west-african', 'frame-ancient', 'middle-eastern-india'], preset: 'conga-muff-quemado',
    about: 'Sparse and soft for a ballad: a bass on 1, a muted stroke on 3, a pickup tone.' },
  { id: 'one-drop', name: 'One-drop hand drum', tradition: 'Studio', kind: 'studio', meter: '4/4', grid: 16, bars: 1, bpm: 76,
    parts: [{ drum: 0, strokes: '..f...f.B.f...f.' }], suits: ['afro-cuban', 'west-african'], preset: 'bongo-hembra-open',
    about: 'Reggae\'s one drop on a hand drum: beat one left empty, the bass on 3, fingertips on the offbeats.' },
  { id: 'house-perc', name: 'House percussion', tradition: 'Studio', kind: 'studio', meter: '4/4', grid: 16, bars: 1, bpm: 124,
    parts: [{ drum: 0, strokes: '..T...T.S.T...T.' }, { drum: 1, strokes: '.............t..' }], suits: ['afro-cuban', 'west-african'], preset: 'conga-habana-open',
    about: 'Offbeat open tones over a four-on-the-floor kick, a slap on 3 and a high answer before the bar line.' },
  { id: 'hiphop-hand', name: 'Hip-hop hand drum', tradition: 'Studio', kind: 'studio', meter: '4/4', grid: 16, bars: 1, bpm: 88,
    parts: [{ drum: 0, strokes: 'B...S.....B.S...' }], suits: ['afro-cuban', 'west-african', 'middle-eastern-india'], preset: 'djembe-gun-bass',
    about: 'A boom-bap shape on a hand drum: bass where the kick would be, slaps on the backbeat.' },
  { id: 'bossa-hand', name: 'Bossa-style hand percussion', tradition: 'Studio', kind: 'studio', meter: '4/4', grid: 16, bars: 2, bpm: 128,
    parts: [{ drum: 0, strokes: 'B..f..f.B..f..f.' + 'B..f..f.Bf.f..f.' }], suits: ['afro-cuban', 'frame-ancient'], preset: 'bongo-hembra-open',
    about: 'Soft bossa-style hand percussion: a low pulse with fingertip syncopations — a studio texture inspired by bossa nova, not a traditional part.' },
  { id: 'afro-pop', name: 'Afro-pop hand groove', tradition: 'Studio', kind: 'studio', meter: '4/4', grid: 16, bars: 1, bpm: 108,
    parts: [{ drum: 0, strokes: 'B.t.S.tB.tB.S.t.' }], suits: ['west-african', 'afro-cuban'], preset: 'djembe-lenke-master',
    about: 'A rolling sixteenth-note hand groove in a modern Afro-pop style.' },
];

export const handRhythmById = (id: string) => HAND_RHYTHMS.find((r) => r.id === id);
