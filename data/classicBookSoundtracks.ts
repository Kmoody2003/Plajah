import { ChoraGenerativeMusicEngine, type ChoraMusicStem, ROOT_KEY_TO_PC } from '../services/chora/choraGenerativeMusicEngine';
import { promptToScore } from '../services/melos/composition/promptToScore';
import { saveScore } from '../services/loreaScoreService';

export interface ScoreNoteEvent {
  midi: number;
  noteName: string;
  startBeat: number;
  durationBeats: number;
  velocity: number;
  voice: 'lead' | 'harmony' | 'arpeggio' | 'bass';
}

export interface ClassicBookTrackScore {
  id: string;
  trackNumber: number;
  title: string;
  chapterCue: string;
  key: string;
  mode: 'major' | 'minor';
  bpm: number;
  timeSignature: '4/4' | '3/4' | '6/8';
  instrumentation: string;
  leadTimbre: 'piano' | 'strings' | 'harp' | 'flute' | 'organ' | 'celesta' | 'guqin' | 'lyre' | 'fiddle' | 'horn';
  progressionRoman: string[];
  chordDegrees: number[][];
  melodyContour: number[];
  mood: string;
  generativePrompt: string;
}

export interface ClassicBookSoundtrackAlbum {
  bookThemeId: string;
  bookTitle: string;
  author: string;
  albumTitle: string;
  ensembleName: string;
  ensembleDescription: string;
  tracks: ClassicBookTrackScore[];
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiToNoteLabel(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  const oct = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[pc]}${oct}`;
}

export const CLASSIC_BOOK_SOUNDTRACKS: Record<string, ClassicBookSoundtrackAlbum> = {
  'pride-and-prejudice': {
    bookThemeId: 'pride-and-prejudice',
    bookTitle: 'Pride and Prejudice',
    author: 'Jane Austen',
    albumTitle: 'The Pemberley & Longbourn Original Motion Picture Score',
    ensembleName: 'Melos Studio Regency & Symphonic Film Orchestra',
    ensembleDescription: 'Melos AURA (RMI Electra-Piano, Yamaha CS-80, Mellotron Violins & Flute, Harpsichord, Solina), PNEUMA (Pastoral Woodwind & Shakuhachi), VELA (Vitreous Harp, Glass Choir, Celesta), CANTUS (Byzantine & Plainsong Choir), and BAJO (Bowed Contrabass, Cello Menace).',
    tracks: [
      {
        id: 'pp-1',
        trackNumber: 1,
        title: 'Elizabeth Bennet: Wit & Wildflowers on the Oak Path',
        chapterCue: 'Character Theme · Elizabeth Bennet (Chapters I–VI · Longbourn to Netherfield)',
        key: 'F',
        mode: 'major',
        bpm: 108,
        timeSignature: '6/8',
        instrumentation: 'AURA RMI Electra-Piano · PNEUMA Pastoral Woodwind · VELA Vitreous Harp · AURA Mellotron Flute · BAJO Upright Bass',
        leadTimbre: 'piano',
        progressionRoman: ['I', 'V6', 'vi', 'iii6', 'IV', 'I6/4', 'ii7', 'V7'],
        chordDegrees: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [4, 7, 11], [5, 9, 12], [7, 12, 16], [2, 5, 9], [7, 11, 14]],
        melodyContour: [12, 14, 16, 19, 16, 14, 12, 11, 9, 12, 14, 16, 14, 11, 12, 12],
        mood: 'Sparkling, quick-witted, sunlit Regency pastoral overture (Marianelli / Rachel Portman style)',
        generativePrompt: 'Sparkling Regency film score for Elizabeth Bennet in F major 6/8, Broadwood fortepiano lead, pastoral woodwind countermelody, gilded harp arpeggios',
      },
      {
        id: 'pp-2',
        trackNumber: 2,
        title: 'Mr. Darcy & The Reflections of Pemberley Lake',
        chapterCue: 'Character Theme · Fitzwilliam Darcy (Chapter XLIII · Pemberley Woods)',
        key: 'Eb',
        mode: 'major',
        bpm: 68,
        timeSignature: '4/4',
        instrumentation: 'AURA CS-80 Brass/Horn · AURA Mellotron Violins · AURA Rhodes Felt · AURA Solina Strings · BAJO Bowed Contrabass',
        leadTimbre: 'horn',
        progressionRoman: ['I', 'vi', 'IV', 'V7', 'iii', 'vi', 'ii7', 'V7'],
        chordDegrees: [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14], [4, 7, 11], [9, 12, 16], [2, 5, 9], [7, 11, 14]],
        melodyContour: [7, 12, 14, 16, 17, 16, 14, 12, 9, 12, 14, 17, 16, 14, 11, 12],
        mood: 'Noble, stoic, deeply yearning aristocratic adagio (John Williams / Elgar Nimrod style)',
        generativePrompt: 'Noble orchestral film theme for Mr. Darcy at Pemberley Lake in Eb major, warm French horn lead, solo violin countermelody, deep bowed contrabass',
      },
      {
        id: 'pp-3',
        trackNumber: 3,
        title: 'The Netherfield Ball: Contredanse of Eyes & Whispers',
        chapterCue: 'Scene Cue · The Ballroom Duel of Wit (Chapter XVIII · Netherfield Hall)',
        key: 'D',
        mode: 'major',
        bpm: 132,
        timeSignature: '3/4',
        instrumentation: 'AURA Harpsichord · AURA Logan Violin · VELA Bloom Pluck · AURA Elka Rhapsody · BAJO Fretless Pizzicato',
        leadTimbre: 'strings',
        progressionRoman: ['I', 'IV', 'V7', 'I', 'vi', 'ii6', 'V7', 'I'],
        chordDegrees: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7], [9, 12, 16], [2, 5, 9], [7, 11, 14], [0, 4, 7]],
        melodyContour: [12, 16, 14, 12, 9, 12, 14, 17, 16, 12, 14, 11, 9, 7, 12, 12],
        mood: 'Electric, tense, whirling Georgian ballroom contredanse modulating to B minor',
        generativePrompt: 'Georgian ballroom contredanse film score in D major 3/4, crisp harpsichord and solo violin exchanging rapid motifs over pizzicato strings',
      },
      {
        id: 'pp-4',
        trackNumber: 4,
        title: 'The Letter at Hunsford: "You Have Bewitched Me"',
        chapterCue: 'Turning-Point Nocturne · Darcy’s Letter (Chapters XXXIV–XXXV)',
        key: 'D',
        mode: 'minor',
        bpm: 62,
        timeSignature: '4/4',
        instrumentation: 'VELA Glass Choir · PNEUMA Mournful Woodwind · AURA Celesta · VELA Tremolo Strings · ISON Shruti Pedal',
        leadTimbre: 'celesta',
        progressionRoman: ['i', 'VI', 'iv', 'V7', 'i', 'N6', 'V7', 'I'],
        chordDegrees: [[0, 3, 7], [8, 12, 15], [5, 8, 12], [7, 11, 14], [0, 3, 7], [1, 5, 8], [7, 11, 14], [0, 4, 7]],
        melodyContour: [12, 11, 7, 8, 12, 15, 14, 10, 8, 7, 5, 8, 7, 3, 2, 0],
        mood: 'Heart-wrenching, candlelit psychological revelation resolving to Picardy D Major',
        generativePrompt: 'Intimate candlelit film nocturne in D harmonic minor, glass choir and mournful solo woodwind over celesta raindrops and tremolo strings',
      },
      {
        id: 'pp-5',
        trackNumber: 5,
        title: 'Lady Catherine at Rosings & Lydia’s Scandal',
        chapterCue: 'Antagonist & Crisis Cue · Confrontation in the Wilderness (Chapters LII & LVI)',
        key: 'G',
        mode: 'minor',
        bpm: 138,
        timeSignature: '4/4',
        instrumentation: 'AURA Clavinet Continuo · AURA Prophet-5 Brass · AURA Phaedra Pulse · CANTUS Byzantine Choir · BAJO Cello Menace',
        leadTimbre: 'strings',
        progressionRoman: ['i', 'ii°6', 'V7', 'i', 'VI', 'iv', 'V7', 'i'],
        chordDegrees: [[0, 3, 7], [2, 5, 8], [7, 11, 14], [0, 3, 7], [8, 12, 15], [5, 8, 12], [7, 11, 14], [0, 3, 7]],
        melodyContour: [0, 3, 7, 12, 11, 8, 7, 5, 3, 8, 7, 5, 3, 2, 3, 0],
        mood: 'Fierce, imperious, breathless Beethovenian storm',
        generativePrompt: 'Urgent dramatic film cue in G harmonic minor 138 BPM, driving cello menace ostinato, sharp clavinet continuo, imperious brass and choir',
      },
      {
        id: 'pp-6',
        trackNumber: 6,
        title: 'Dawn Across the Derbyshire Moors (Love Theme)',
        chapterCue: 'Grand Finale · Elizabeth & Darcy United (Chapters LVIII–LXI)',
        key: 'C',
        mode: 'major',
        bpm: 84,
        timeSignature: '6/8',
        instrumentation: 'AURA Grand Fortepiano · PNEUMA Pastoral Flute · VELA Aurora Harp · CANTUS Plainsong Choir · BAJO Bowed Contrabass',
        leadTimbre: 'flute',
        progressionRoman: ['I', 'V/vi', 'vi', 'IV', 'I6/4', 'V7', 'I', 'I'],
        chordDegrees: [[0, 4, 7], [4, 8, 11], [9, 12, 16], [5, 9, 12], [7, 12, 16], [7, 11, 14], [0, 4, 7], [0, 7, 12]],
        melodyContour: [7, 12, 16, 19, 17, 16, 14, 12, 16, 14, 12, 9, 11, 14, 12, 12],
        mood: 'Radiant, transcendent sunrise uniting Elizabeth & Darcy’s themes in counterpoint',
        generativePrompt: 'Radiant romantic film finale in C major 6/8, grand fortepiano and pastoral flute uniting in counterpoint over cathedral choir and bowed contrabass',
      },
    ],
  },

  'frankenstein': {
    bookThemeId: 'frankenstein',
    bookTitle: 'Frankenstein; or, The Modern Prometheus',
    author: 'Mary Wollstonecraft Shelley',
    albumTitle: 'Mer de Glace & The Galvanic Prometheus Score',
    ensembleName: 'Chora Gothic & Alchemical Symphony',
    ensembleDescription: 'Romantic pipe organ, crystalline glass armonica, contrabass, and galvanic modular resonators.',
    tracks: [
      {
        id: 'fr-1',
        trackNumber: 1,
        title: 'Letters from the Arctic Ice-Pack',
        chapterCue: 'Letter I · St. Petersburgh to Archangel',
        key: 'D',
        mode: 'minor',
        bpm: 68,
        timeSignature: '4/4',
        instrumentation: 'Glass Armonica, Solo Cello & Glacial Bowed Cymbals',
        leadTimbre: 'celesta',
        progressionRoman: ['i', 'VI', 'iv', 'V7', 'i', 'III', 'VII', 'i'],
        chordDegrees: [[0, 3, 7], [8, 12, 15], [5, 8, 12], [7, 11, 14], [0, 3, 7], [3, 7, 10], [10, 14, 17], [0, 3, 7]],
        melodyContour: [12, 15, 14, 12, 8, 7, 5, 7, 12, 10, 8, 7, 5, 3, 2, 0],
        mood: 'Vast, crystalline, haunting polar solitude',
        generativePrompt: 'Haunting Romantic Gothic score in D minor, crystalline glass armonica, deep solo cello, icy Arctic wind ambience',
      },
      {
        id: 'fr-2',
        trackNumber: 2,
        title: 'The Spark of Being (Ingolstadt November)',
        chapterCue: 'Chapter V · A Dreary Night of November',
        key: 'C',
        mode: 'minor',
        bpm: 114,
        timeSignature: '4/4',
        instrumentation: 'Gothic Pipe Organ, Timpani & Galvanic Pulse',
        leadTimbre: 'organ',
        progressionRoman: ['i', 'ii°', 'V7', 'i', 'VI', 'iv', 'V7', 'i'],
        chordDegrees: [[0, 3, 7], [2, 5, 8], [7, 11, 14], [0, 3, 7], [8, 12, 15], [5, 8, 12], [7, 11, 14], [0, 3, 7]],
        melodyContour: [0, 7, 8, 7, 3, 12, 11, 12, 15, 14, 12, 8, 7, 5, 2, 0],
        mood: 'Electrifying, fateful, alchemical awakening',
        generativePrompt: 'Dramatic Gothic pipe organ and orchestral ostinato in C minor, electric galvanic sparks, rain on laboratory glass',
      },
      {
        id: 'fr-3',
        trackNumber: 3,
        title: 'Solitude on the Mer de Glace Glacier',
        chapterCue: 'Chapter X · Ascent of Montanvert',
        key: 'A',
        mode: 'minor',
        bpm: 76,
        timeSignature: '3/4',
        instrumentation: 'French Horn, Contrabass & Alpine Harp',
        leadTimbre: 'horn',
        progressionRoman: ['i', 'iv', 'VII', 'III', 'VI', 'ii°', 'V7', 'i'],
        chordDegrees: [[0, 3, 7], [5, 8, 12], [10, 14, 17], [3, 7, 10], [8, 12, 15], [2, 5, 8], [7, 11, 14], [0, 3, 7]],
        melodyContour: [7, 12, 15, 14, 12, 10, 7, 5, 8, 7, 5, 3, 2, 5, 3, 0],
        mood: 'Sublime Alpine majesty and tragic confrontation',
        generativePrompt: 'Sublime Romantic orchestral adagio in A minor, echoing French horn across Alpine glaciers, deep double basses',
      },
      {
        id: 'fr-4',
        trackNumber: 4,
        title: 'The De Lacey Cottage Lute Song',
        chapterCue: 'Chapter XII · Spring in the Forest Hovel',
        key: 'F',
        mode: 'major',
        bpm: 82,
        timeSignature: '6/8',
        instrumentation: 'Romantic Lute/Guitar & Wooden Flute',
        leadTimbre: 'harp',
        progressionRoman: ['I', 'vi', 'IV', 'V', 'I', 'iii', 'IV', 'I'],
        chordDegrees: [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14], [0, 4, 7], [4, 7, 11], [5, 9, 12], [0, 4, 7]],
        melodyContour: [12, 14, 16, 12, 9, 12, 14, 11, 12, 16, 17, 16, 14, 12, 11, 12],
        mood: 'Tender, yearning for human warmth and belonging',
        generativePrompt: 'Gentle 19th-century acoustic lute and wooden flute ballad in F major, tender and wistful',
      },
      {
        id: 'fr-5',
        trackNumber: 5,
        title: 'Storm Over Lake Geneva',
        chapterCue: 'Chapter XXIII · Night of the Tempest',
        key: 'G',
        mode: 'minor',
        bpm: 122,
        timeSignature: '4/4',
        instrumentation: 'Full Romantic Strings, Pipe Organ & Thunder Timpani',
        leadTimbre: 'strings',
        progressionRoman: ['i', 'V7', 'i', 'iv', 'VI', 'V7', 'i', 'i'],
        chordDegrees: [[0, 3, 7], [7, 11, 14], [0, 3, 7], [5, 8, 12], [8, 12, 15], [7, 11, 14], [0, 3, 7], [0, 3, 7]],
        melodyContour: [12, 11, 12, 15, 14, 12, 8, 7, 5, 8, 7, 3, 2, 5, 3, 0],
        mood: 'Tempestuous, tragic lightning across dark waters',
        generativePrompt: 'Fierce Romantic storm symphony in G minor, surging string tremolos, pipe organ pedals, lightning crescendo',
      },
      {
        id: 'fr-6',
        trackNumber: 6,
        title: 'lost in Darkness and Distance',
        chapterCue: 'Final Walton Continuation · The Northern Ice',
        key: 'D',
        mode: 'minor',
        bpm: 64,
        timeSignature: '4/4',
        instrumentation: 'Solo Cello, Glass Armonica & Choir Pad',
        leadTimbre: 'strings',
        progressionRoman: ['i', 'iv', 'i', 'VI', 'iv', 'V7', 'i', 'i'],
        chordDegrees: [[0, 3, 7], [5, 8, 12], [0, 3, 7], [8, 12, 15], [5, 8, 12], [7, 11, 14], [0, 3, 7], [0, 7, 12]],
        melodyContour: [12, 10, 8, 7, 5, 3, 5, 7, 8, 7, 5, 3, 2, 3, 0, 0],
        mood: 'Elegiac, solemn, fading into eternal ice',
        generativePrompt: 'Solemn Romantic requiem in D minor, mournful solo cello and glass armonica fading into silence',
      },
    ],
  },

  'alice-in-wonderland': {
    bookThemeId: 'alice-in-wonderland',
    bookTitle: "Alice's Adventures in Wonderland",
    author: 'Lewis Carroll',
    albumTitle: 'Through the Golden Keyhole: Wonderland Suite',
    ensembleName: 'Chora Clockwork & Celesta Ensemble',
    ensembleDescription: 'Victorian music-box celesta, baroque harpsichord, bassoon, clarinet, and pizzicato strings.',
    tracks: [
      {
        id: 'al-1',
        trackNumber: 1,
        title: 'Down the Golden Keyhole',
        chapterCue: 'Chapter I · Down the Rabbit-Hole',
        key: 'C',
        mode: 'major',
        bpm: 112,
        timeSignature: '3/4',
        instrumentation: 'Celesta Music Box, Harp & Pizzicato Strings',
        leadTimbre: 'celesta',
        progressionRoman: ['I', 'iii', 'vi', 'IV', 'I', 'V7', 'I', 'I'],
        chordDegrees: [[0, 4, 7], [4, 7, 11], [9, 12, 16], [5, 9, 12], [0, 4, 7], [7, 11, 14], [0, 4, 7], [0, 7, 12]],
        melodyContour: [19, 16, 12, 14, 16, 12, 9, 11, 12, 16, 14, 12, 11, 9, 7, 12],
        mood: 'Whimsical, curious, tumbling through starlight',
        generativePrompt: 'Enchanting Victorian music-box celesta and harp waltz in C major, whimsical falling arpeggios, Arthur Rackham fairy-tale mood',
      },
      {
        id: 'al-2',
        trackNumber: 2,
        title: 'The White Rabbit’s Pocket-Watch Waltz',
        chapterCue: 'Chapter II · The Pool of Tears',
        key: 'A',
        mode: 'minor',
        bpm: 128,
        timeSignature: '3/4',
        instrumentation: 'Clockwork Harpsichord, Clarinet & Woodblock Tick',
        leadTimbre: 'celesta',
        progressionRoman: ['i', 'iv', 'V7', 'i', 'VI', 'ii°', 'V7', 'i'],
        chordDegrees: [[0, 3, 7], [5, 8, 12], [7, 11, 14], [0, 3, 7], [8, 12, 15], [2, 5, 8], [7, 11, 14], [0, 3, 7]],
        melodyContour: [12, 15, 14, 12, 11, 12, 15, 19, 17, 15, 14, 12, 11, 8, 11, 12],
        mood: 'Hurried, ticking brass gears, eccentric elegance',
        generativePrompt: 'Quirky clockwork waltz in A minor, ticking pocket-watch percussion, harpsichord and playful clarinet',
      },
      {
        id: 'al-3',
        trackNumber: 3,
        title: 'Bioluminescent Mushroom Caterpillars',
        chapterCue: 'Chapter V · Advice from a Caterpillar',
        key: 'E',
        mode: 'minor',
        bpm: 78,
        timeSignature: '4/4',
        instrumentation: 'Bass Clarinet, Vibraphone & Lush Emerald Pad',
        leadTimbre: 'flute',
        progressionRoman: ['i', 'III', 'VII', 'iv', 'i', 'VI', 'V7', 'i'],
        chordDegrees: [[0, 3, 7], [3, 7, 10], [10, 14, 17], [5, 8, 12], [0, 3, 7], [8, 12, 15], [7, 11, 14], [0, 3, 7]],
        melodyContour: [7, 10, 12, 15, 14, 12, 10, 7, 5, 8, 7, 3, 5, 7, 2, 0],
        mood: 'Surreal, glowing cyan and violet twilight garden',
        generativePrompt: 'Dreamy bioluminescent forest score in E minor, shimmering vibraphone, low woodwinds, surreal Wonderland garden',
      },
      {
        id: 'al-4',
        trackNumber: 4,
        title: 'A Mad Tea-Party at Perpetual Six O’Clock',
        chapterCue: 'Chapter VII · A Mad Tea-Party',
        key: 'F',
        mode: 'major',
        bpm: 132,
        timeSignature: '6/8',
        instrumentation: 'Harpsichord, Piccolo, Bassoon & Teacup Chimes',
        leadTimbre: 'celesta',
        progressionRoman: ['I', 'IV', 'V7', 'I', 'vi', 'ii', 'V7', 'I'],
        chordDegrees: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7], [9, 12, 16], [2, 5, 9], [7, 11, 14], [0, 4, 7]],
        melodyContour: [12, 16, 19, 17, 16, 14, 12, 16, 14, 11, 12, 9, 7, 11, 14, 12],
        mood: 'Playful, topsy-turvy Victorian parlor caper',
        generativePrompt: 'Playful topsy-turvy chamber caper in F major, harpsichord, piccolo, bassoon, teacup bell chimes',
      },
      {
        id: 'al-5',
        trackNumber: 5,
        title: 'Painting the White Roses Red',
        chapterCue: 'Chapter VIII · The Queen’s Croquet-Ground',
        key: 'D',
        mode: 'minor',
        bpm: 104,
        timeSignature: '4/4',
        instrumentation: 'Pizzicato Strings, Oboe & Brass Fanfare',
        leadTimbre: 'strings',
        progressionRoman: ['i', 'VI', 'III', 'VII', 'i', 'iv', 'V7', 'i'],
        chordDegrees: [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17], [0, 3, 7], [5, 8, 12], [7, 11, 14], [0, 3, 7]],
        melodyContour: [12, 14, 15, 12, 10, 8, 7, 10, 8, 5, 7, 3, 2, 5, 3, 0],
        mood: 'Theatrical, royal playing-card procession',
        generativePrompt: 'Theatrical baroque march in D minor, pizzicato strings, oboe, regal trumpet flourishes',
      },
      {
        id: 'al-6',
        trackNumber: 6,
        title: 'Golden Afternoon on the Riverbank',
        chapterCue: 'Chapter XII · Alice’s Evidence & Waking',
        key: 'G',
        mode: 'major',
        bpm: 92,
        timeSignature: '3/4',
        instrumentation: 'Warm Strings, Harp & Celesta',
        leadTimbre: 'harp',
        progressionRoman: ['I', 'V', 'vi', 'iii', 'IV', 'I', 'V7', 'I'],
        chordDegrees: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [4, 7, 11], [5, 9, 12], [0, 4, 7], [7, 11, 14], [0, 4, 7]],
        melodyContour: [12, 14, 16, 19, 16, 14, 12, 9, 11, 12, 14, 12, 11, 9, 11, 12],
        mood: 'Nostalgic, warm summer riverbank dream',
        generativePrompt: 'Warm nostalgic storybook finale in G major, gentle harp, celesta, and lush pastoral strings',
      },
    ],
  },

  'dracula': {
    bookThemeId: 'dracula',
    bookTitle: 'Dracula',
    author: 'Bram Stoker',
    albumTitle: 'Symphony of the Carpathian Blood Moon (Original Motion Picture Score)',
    ensembleName: 'Melos Studio Transylvanian & Whitby Gothic Film Orchestra',
    ensembleDescription: 'Melos AURA (CS-80 Brass, Mellotron Violins & Choir, Harpsichord, Celesta, Prophet-5, OB-X), CANTUS (Kargyraa Throat Choir, Crypt Vault Choir, Overtone & Plainsong Choir), VELA (Ferrous Dulcimer, Tremolo Strings, Glass Choir, Reliquary, Cathedral Organ), ISON (Bourdon Organ Pedal), and BAJO (Braam Sub, Cello Menace, Bowed Contrabass, Colossus).',
    tracks: [
      {
        id: 'dr-1',
        trackNumber: 1,
        title: 'Count Dracula: Anthem of the Ancient Voivode',
        chapterCue: 'Character Theme · Count Dracula (Chapters II–III · Castle Dracula)',
        key: 'D',
        mode: 'minor',
        bpm: 76,
        timeSignature: '4/4',
        instrumentation: 'AURA CS-80 Brass/Organ · CANTUS Kargyraa Choir · VELA Ferrous Cimbalom · ISON Bourdon Organ · BAJO Braam Tuba',
        leadTimbre: 'organ',
        progressionRoman: ['i', 'bII', 'V7', 'i', 'VI', 'iv', 'V7', 'i'],
        chordDegrees: [[0, 3, 7], [1, 5, 8], [7, 11, 14], [0, 3, 7], [8, 12, 15], [5, 8, 12], [7, 11, 14], [0, 3, 7]],
        melodyContour: [0, 3, 7, 8, 7, 12, 11, 8, 7, 5, 3, 2, 3, 7, 2, 0],
        mood: 'Monumental, ancient, tragic aristocratic menace (Wojciech Kilar / Howard Shore style)',
        generativePrompt: 'Monumental Gothic film theme for Count Dracula in D harmonic minor 76 BPM, brass and cathedral organ anthem, Kargyraa throat choir, ferrous cimbalom, braam sub',
      },
      {
        id: 'dr-2',
        trackNumber: 2,
        title: 'Jonathan Harker: Coach Through the Borgo Pass',
        chapterCue: 'Character & Scene Cue · Harker’s Midnight Journey (Chapter I · Carpathian Crags)',
        key: 'G',
        mode: 'minor',
        bpm: 128,
        timeSignature: '4/4',
        instrumentation: 'AURA Mellotron Violins · PNEUMA Shakuhachi · AURA Harpsichord · VELA Tremolo Strings · BAJO Cello Menace',
        leadTimbre: 'strings',
        progressionRoman: ['i', 'ii°', 'V7', 'i', 'VI', 'iv', 'V7', 'i'],
        chordDegrees: [[0, 3, 7], [2, 5, 8], [7, 11, 14], [0, 3, 7], [8, 12, 15], [5, 8, 12], [7, 11, 14], [0, 3, 7]],
        melodyContour: [12, 11, 12, 15, 14, 12, 8, 7, 8, 5, 7, 3, 2, 5, 3, 0],
        mood: 'Breathless, galloping Carpathian midnight carriage chase',
        generativePrompt: 'Breathless Gothic film chase through the Borgo Pass in G harmonic minor 128 BPM, virtuosic gypsy violin, harpsichord ostinato, driving cello menace',
      },
      {
        id: 'dr-3',
        trackNumber: 3,
        title: 'The Three Brides: Seduction in the Crypt',
        chapterCue: 'Character Theme · The Weird Sisters of Castle Dracula (Chapter III · The Forbidden Wing)',
        key: 'A',
        mode: 'minor',
        bpm: 96,
        timeSignature: '3/4',
        instrumentation: 'CANTUS Crypt Vault Soprano · VELA Glass Choir · AURA Celesta · VELA Vespers Pad · BAJO Fretless Glass Bass',
        leadTimbre: 'celesta',
        progressionRoman: ['i', 'VI', 'iv', 'V7', 'i', 'bII', 'V7', 'i'],
        chordDegrees: [[0, 3, 7], [8, 12, 15], [5, 8, 12], [7, 11, 14], [0, 3, 7], [1, 5, 8], [7, 11, 14], [0, 3, 7]],
        melodyContour: [7, 12, 14, 15, 14, 12, 11, 7, 8, 5, 7, 3, 2, 5, 2, 0],
        mood: 'Hypnotic, sensual, deadly siren waltz (Danny Elfman / Kilar style)',
        generativePrompt: 'Hypnotic Gothic waltz in A harmonic minor 3/4 for the Three Brides of Dracula, ethereal crypt soprano choir, glass choir, silver celesta arpeggios',
      },
      {
        id: 'dr-4',
        trackNumber: 4,
        title: 'Mina Murray: Oceans of Time (Eternal Love Theme)',
        chapterCue: 'Character Theme · Mina Murray & Whitby Abbey (Chapters VI–VIII · Moonlight Over Whitby)',
        key: 'E',
        mode: 'minor',
        bpm: 64,
        timeSignature: '4/4',
        instrumentation: 'AURA RMI Piano · PNEUMA Pastoral Woodwind · VELA Glass Keys · AURA Solina Strings · BAJO Bowed Contrabass',
        leadTimbre: 'piano',
        progressionRoman: ['i', 'III', 'VII', 'IV', 'i', 'VI', 'V7', 'i'],
        chordDegrees: [[0, 3, 7], [3, 7, 10], [10, 14, 17], [5, 9, 12], [0, 3, 7], [8, 12, 15], [7, 11, 14], [0, 3, 7]],
        melodyContour: [12, 15, 14, 12, 10, 8, 7, 5, 7, 8, 5, 3, 2, 3, 0, 0],
        mood: 'Hauntingly romantic, luminous, tragic love theme across centuries',
        generativePrompt: 'Luminous tragic romantic film score for Mina Murray in E minor 64 BPM, delicate piano lead, lyrical woodwind, shimmering glass harp, warm strings',
      },
      {
        id: 'dr-5',
        trackNumber: 5,
        title: 'The Schooner Demeter & Renfield’s Madness',
        chapterCue: 'Antagonist & Tempest Cue · Arrival of the Plague Ship (Chapters VII & VIII)',
        key: 'C',
        mode: 'minor',
        bpm: 136,
        timeSignature: '6/8',
        instrumentation: 'AURA Prophet-5 Brass · CANTUS Overtone Choir · AURA Sequencer Ostinato · VELA Reliquary · BAJO Colossus Bass',
        leadTimbre: 'horn',
        progressionRoman: ['I', 'bII', 'I', 'iv', 'I', 'bVII', 'bII', 'I'],
        chordDegrees: [[0, 4, 7], [1, 5, 8], [0, 4, 7], [5, 8, 12], [0, 4, 7], [10, 14, 17], [1, 5, 8], [0, 4, 7]],
        melodyContour: [12, 10, 8, 7, 12, 15, 14, 11, 12, 8, 7, 5, 3, 2, 3, 0],
        mood: 'Ferocious, tempestuous maritime terror & asylum delirium in C Phrygian Dominant',
        generativePrompt: 'Ferocious maritime storm film cue in C Phrygian Dominant 6/8 136 BPM, aggressive brass stabs, overtone throat choir, relentless motorik pulse, colossus sub',
      },
      {
        id: 'dr-6',
        trackNumber: 6,
        title: 'Van Helsing’s Crusade & Sunset on the Borgo Pass',
        chapterCue: 'Grand Finale · The Sacred Wafer & Redemption at Dusk (Chapters XXVI–XXVII)',
        key: 'D',
        mode: 'minor',
        bpm: 104,
        timeSignature: '4/4',
        instrumentation: 'AURA OB-X Warm Brass · AURA Mellotron Choir · VELA Cathedral Organ · CANTUS Plainsong Choir · BAJO Bowed Contrabass',
        leadTimbre: 'horn',
        progressionRoman: ['i', 'iv', 'V7', 'i', 'VI', 'ii°', 'V7', 'I'],
        chordDegrees: [[0, 3, 7], [5, 8, 12], [7, 11, 14], [0, 3, 7], [8, 12, 15], [2, 5, 8], [7, 11, 14], [0, 4, 7]],
        melodyContour: [0, 7, 12, 15, 14, 12, 11, 12, 15, 17, 15, 14, 12, 11, 12, 12],
        mood: 'Heroic, sacred, cataclysmic battle resolving into a golden Picardy D Major sunrise',
        generativePrompt: 'Epic film finale for Van Helsing’s crusade in D harmonic minor resolving to Picardy D major 104 BPM, heroic brass, cathedral organ, plainsong choir',
      },
    ],
  },

  'sherlock-holmes': {
    bookThemeId: 'sherlock-holmes',
    bookTitle: 'The Adventures of Sherlock Holmes',
    author: 'Sir Arthur Conan Doyle',
    albumTitle: '221B Baker Street: Violin & Gaslight Deductions',
    ensembleName: 'Chora Baker Street Chamber Players',
    ensembleDescription: 'Holmes’s Stradivarius solo violin, Victorian upright piano, bassoon, and misty cello.',
    tracks: [
      { id: 'sh-1', trackNumber: 1, title: 'Gaslight & Fog on 221B Baker Street', chapterCue: 'A Scandal in Bohemia · Baker Street', key: 'A', mode: 'minor', bpm: 88, timeSignature: '4/4', instrumentation: 'Solo Stradivarius Violin, Piano & Pizzicato Cello', leadTimbre: 'strings', progressionRoman: ['i', 'iv', 'V7', 'i', 'VI', 'ii°', 'V7', 'i'], chordDegrees: [[0, 3, 7], [5, 8, 12], [7, 11, 14], [0, 3, 7], [8, 12, 15], [2, 5, 8], [7, 11, 14], [0, 3, 7]], melodyContour: [12, 15, 14, 11, 12, 7, 8, 12, 14, 12, 10, 8, 7, 11, 12, 12], mood: 'Incisive, atmospheric Victorian mystery', generativePrompt: 'Victorian London mystery theme in A minor, expressive solo violin, upright piano, pizzicato cello' },
      { id: 'sh-2', trackNumber: 2, title: 'Irene Adler’s Photograph', chapterCue: 'A Scandal in Bohemia · Briony Lodge', key: 'E', mode: 'minor', bpm: 76, timeSignature: '3/4', instrumentation: 'Solo Violin & Concert Harp', leadTimbre: 'strings', progressionRoman: ['i', 'VI', 'III', 'VII', 'iv', 'V7', 'i', 'i'], chordDegrees: [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17], [5, 8, 12], [7, 11, 14], [0, 3, 7], [0, 3, 7]], melodyContour: [12, 14, 15, 19, 15, 14, 12, 10, 8, 12, 11, 7, 8, 5, 7, 0], mood: 'Elegant, enigmatic, outwitted admiration', generativePrompt: 'Elegant late-Romantic violin and piano romance in E minor, graceful and enigmatic' },
      { id: 'sh-3', trackNumber: 3, title: 'Hansom Cab Pursuit Through Charing Cross', chapterCue: 'The Red-Headed League · Saxe-Coburg Square', key: 'D', mode: 'minor', bpm: 124, timeSignature: '4/4', instrumentation: 'Staccato Strings, Clarinet & Piano', leadTimbre: 'strings', progressionRoman: ['i', 'iv', 'V7', 'i', 'VI', 'ii°', 'V7', 'i'], chordDegrees: [[0, 3, 7], [5, 8, 12], [7, 11, 14], [0, 3, 7], [8, 12, 15], [2, 5, 8], [7, 11, 14], [0, 3, 7]], melodyContour: [0, 3, 7, 12, 10, 8, 7, 5, 7, 12, 14, 15, 14, 11, 12, 12], mood: 'Brisk cobblestone chase through London fog', generativePrompt: 'Brisk Victorian mystery chase in D minor, staccato strings, driving piano, cobblestone rhythm' },
      { id: 'sh-4', trackNumber: 4, title: 'The Bank Vault at Midnight', chapterCue: 'The Red-Headed League · The Darkened Cellar', key: 'C', mode: 'minor', bpm: 94, timeSignature: '4/4', instrumentation: 'Bassoon, Pizzicato Double Bass & Celesta', leadTimbre: 'piano', progressionRoman: ['i', 'ii°', 'V7', 'i', 'iv', 'V7', 'i', 'i'], chordDegrees: [[0, 3, 7], [2, 5, 8], [7, 11, 14], [0, 3, 7], [5, 8, 12], [7, 11, 14], [0, 3, 7], [0, 3, 7]], melodyContour: [7, 8, 7, 3, 5, 7, 2, 0, 7, 12, 11, 8, 7, 5, 2, 0], mood: 'Stealthy, lantern-lit anticipation', generativePrompt: 'Suspenseful chamber mystery in C minor, sneaky bassoon, pizzicato bass, quiet piano' },
      { id: 'sh-5', trackNumber: 5, title: 'Improvisations on a Stradivarius at 3 A.M.', chapterCue: 'The Five Orange Pips · Deep Thought', key: 'G', mode: 'minor', bpm: 68, timeSignature: '3/4', instrumentation: 'Unaccompanied Solo Violin & Soft Piano', leadTimbre: 'strings', progressionRoman: ['i', 'iv', 'VII', 'III', 'VI', 'V7', 'i', 'i'], chordDegrees: [[0, 3, 7], [5, 8, 12], [10, 14, 17], [3, 7, 10], [8, 12, 15], [7, 11, 14], [0, 3, 7], [0, 3, 7]], melodyContour: [12, 15, 14, 12, 8, 7, 11, 12, 14, 10, 8, 7, 5, 3, 2, 0], mood: 'Contemplative, deductive brilliance', generativePrompt: 'Intimate solo Stradivarius violin meditation in G minor, smoky Victorian study at night' },
      { id: 'sh-6', trackNumber: 6, title: 'Elementary: The Case Resolved', chapterCue: 'The Adventure of the Copper Beeches', key: 'A', mode: 'major', bpm: 96, timeSignature: '4/4', instrumentation: 'Full Chamber Quintet', leadTimbre: 'strings', progressionRoman: ['I', 'IV', 'V7', 'I', 'vi', 'ii', 'V7', 'I'], chordDegrees: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7], [9, 12, 16], [2, 5, 9], [7, 11, 14], [0, 4, 7]], melodyContour: [12, 14, 16, 19, 16, 14, 12, 11, 9, 12, 14, 16, 14, 11, 12, 12], mood: 'Lucid, triumphant, warm fireside conclusion', generativePrompt: 'Warm triumphant Victorian piano quintet in A major, clear and satisfying resolution' },
    ],
  },

  'art-of-war': {
    bookThemeId: 'art-of-war',
    bookTitle: 'The Art of War',
    author: 'Sun Tzu',
    albumTitle: 'Bamboo Slips, Bronze Jian & Weiqi Suite',
    ensembleName: 'Chora Imperial Zhou Court Ensemble',
    ensembleDescription: 'Silk-stringed Guqin zither, bamboo Dizi flute, bronze Bianzhong court bells, and war drums.',
    tracks: [
      { id: 'aw-1', trackNumber: 1, title: 'Mist Over the Eastern Zhou Passes', chapterCue: 'Chapter I · Laying Plans (始計)', key: 'D', mode: 'minor', bpm: 74, timeSignature: '4/4', instrumentation: 'Guqin Zither, Bamboo Xiao Flute & Bronze Bells', leadTimbre: 'guqin', progressionRoman: ['i', 'III', 'iv', 'i', 'VI', 'VII', 'i', 'i'], chordDegrees: [[0, 3, 7], [3, 7, 10], [5, 8, 12], [0, 3, 7], [7, 10, 14], [10, 14, 17], [0, 3, 7], [0, 7, 12]], melodyContour: [12, 15, 12, 10, 7, 10, 12, 7, 5, 7, 10, 7, 5, 3, 0, 0], mood: 'Ancient, meditative strategic stillness', generativePrompt: 'Ancient Chinese court music in D pentatonic, silk-stringed Guqin zither, bamboo xiao flute, bronze bianzhong bells' },
      { id: 'aw-2', trackNumber: 2, title: 'Unrolling the Bamboo Slips', chapterCue: 'Chapter II · Waging War (作戰)', key: 'A', mode: 'minor', bpm: 88, timeSignature: '4/4', instrumentation: 'Guzheng Harp, Pipa & Wood Slats', leadTimbre: 'guqin', progressionRoman: ['i', 'iv', 'VII', 'i', 'III', 'VII', 'i', 'i'], chordDegrees: [[0, 3, 7], [5, 8, 12], [10, 14, 17], [0, 3, 7], [3, 7, 10], [10, 14, 17], [0, 3, 7], [0, 7, 12]], melodyContour: [7, 10, 12, 15, 12, 10, 7, 5, 7, 12, 10, 7, 5, 3, 0, 0], mood: 'Measured, disciplined scholarly precision', generativePrompt: 'Flowing Guzheng zither and pipa duet in A pentatonic, rhythmic bamboo percussion' },
      { id: 'aw-3', trackNumber: 3, title: 'Swift as the Wind, Quiet as the Forest', chapterCue: 'Chapter VII · Maneuvering (軍爭)', key: 'E', mode: 'minor', bpm: 116, timeSignature: '4/4', instrumentation: 'Dizi Flute, Erhu & War Drums', leadTimbre: 'flute', progressionRoman: ['i', 'VII', 'iv', 'i', 'III', 'VII', 'i', 'i'], chordDegrees: [[0, 3, 7], [10, 14, 17], [5, 8, 12], [0, 3, 7], [3, 7, 10], [10, 14, 17], [0, 3, 7], [0, 7, 12]], melodyContour: [12, 15, 19, 15, 12, 10, 12, 15, 12, 10, 7, 10, 7, 5, 3, 0], mood: 'Dynamic, disciplined momentum', generativePrompt: 'Cinematic ancient Chinese orchestral score, soaring dizi flute, erhu strings, driving war drums' },
      { id: 'aw-4', trackNumber: 4, title: 'Stones on the Weiqi Board', chapterCue: 'Chapter III · Attack by Stratagem (謀攻)', key: 'G', mode: 'major', bpm: 84, timeSignature: '4/4', instrumentation: 'Guqin, Jade Chimes & Plucked Strings', leadTimbre: 'guqin', progressionRoman: ['I', 'vi', 'IV', 'V', 'I', 'vi', 'V', 'I'], chordDegrees: [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14], [0, 4, 7], [9, 12, 16], [7, 11, 14], [0, 4, 7]], melodyContour: [12, 14, 16, 19, 16, 14, 12, 9, 7, 9, 12, 14, 12, 9, 7, 12], mood: 'Crystalline, intellectual balance', generativePrompt: 'Meditative Guqin and jade stone chimes in G major pentatonic, calm strategic clarity' },
      { id: 'aw-5', trackNumber: 5, title: 'Crimson Banners Along the Ridge', chapterCue: 'Chapter XI · The Nine Situations (九地)', key: 'D', mode: 'minor', bpm: 126, timeSignature: '4/4', instrumentation: 'Taiko Drums, Bronze Horns & Pipa', leadTimbre: 'guqin', progressionRoman: ['i', 'iv', 'VII', 'i', 'VI', 'VII', 'i', 'i'], chordDegrees: [[0, 3, 7], [5, 8, 12], [10, 14, 17], [0, 3, 7], [8, 12, 15], [10, 14, 17], [0, 3, 7], [0, 7, 12]], melodyContour: [0, 7, 10, 12, 15, 12, 10, 7, 12, 10, 7, 5, 7, 3, 0, 0], mood: 'Commanding, imperial mountain fortress', generativePrompt: 'Epic ancient Eastern Zhou battle march, rapid pipa tremolos, bronze horns, thunderous drums' },
      { id: 'aw-6', trackNumber: 6, title: 'Victory Before the Blade Is Drawn', chapterCue: 'Chapter XIII · Harmony of the State', key: 'C', mode: 'major', bpm: 78, timeSignature: '4/4', instrumentation: 'Bianzhong Bronze Bells, Guqin & Flute', leadTimbre: 'flute', progressionRoman: ['I', 'V', 'vi', 'IV', 'I', 'V', 'I', 'I'], chordDegrees: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12], [0, 4, 7], [7, 11, 14], [0, 4, 7], [0, 7, 12]], melodyContour: [12, 16, 14, 12, 9, 12, 14, 16, 19, 16, 14, 12, 9, 7, 12, 12], mood: 'Serene, supreme philosophical mastery', generativePrompt: 'Serene imperial Chinese court finale, resonant bronze bianzhong bells, bamboo flute, silk strings' },
    ],
  },

  'the-odyssey': {
    bookThemeId: 'the-odyssey',
    bookTitle: 'The Odyssey',
    author: 'Homer',
    albumTitle: 'Hymns of the Wine-Dark Aegean & Ithaca',
    ensembleName: 'Chora Classical Mediterranean Ensemble',
    ensembleDescription: 'Ancient Greek Kithara lyre, double-reed aulos, bronze percussion, and Aegean choral pads.',
    tracks: [
      { id: 'od-1', trackNumber: 1, title: 'Invocation to the Muse & Bronze Trireme', chapterCue: 'Book I · Athena Visits Telemachus', key: 'E', mode: 'minor', bpm: 92, timeSignature: '4/4', instrumentation: 'Kithara Lyre, French Horn & Frame Drum', leadTimbre: 'lyre', progressionRoman: ['i', 'VII', 'VI', 'V', 'i', 'iv', 'V7', 'i'], chordDegrees: [[0, 3, 7], [10, 14, 17], [8, 12, 15], [7, 11, 14], [0, 3, 7], [5, 8, 12], [7, 11, 14], [0, 3, 7]], melodyContour: [12, 14, 15, 12, 10, 8, 7, 10, 12, 15, 14, 12, 10, 8, 7, 12], mood: 'Heroic, mythic Mediterranean sunrise', generativePrompt: 'Epic ancient Mediterranean score in E minor, plucked kithara lyre, bronze horns, rhythmic frame drum' },
      { id: 'od-2', trackNumber: 2, title: 'The Cyclops’ Cavern & Oarsmen’s Escape', chapterCue: 'Book IX · Polyphemus', key: 'D', mode: 'minor', bpm: 108, timeSignature: '4/4', instrumentation: 'Low Brass, Timpani & Plucked Lyre', leadTimbre: 'horn', progressionRoman: ['i', 'iv', 'V7', 'i', 'VI', 'ii°', 'V7', 'i'], chordDegrees: [[0, 3, 7], [5, 8, 12], [7, 11, 14], [0, 3, 7], [8, 12, 15], [2, 5, 8], [7, 11, 14], [0, 3, 7]], melodyContour: [0, 3, 7, 8, 7, 5, 3, 7, 12, 10, 8, 7, 5, 3, 2, 0], mood: 'Tension, cunning, and crashing surf', generativePrompt: 'Dramatic mythic orchestral score in D minor, heavy rowing rhythm, low brass, plucked strings' },
      { id: 'od-3', trackNumber: 3, title: 'Song of the Sirens Across Wine-Dark Seas', chapterCue: 'Book XII · The Sirens’ Island', key: 'A', mode: 'minor', bpm: 76, timeSignature: '6/8', instrumentation: 'Solo Flute, Harp & Ethereal Choir Pad', leadTimbre: 'flute', progressionRoman: ['i', 'III', 'VII', 'iv', 'i', 'VI', 'V7', 'i'], chordDegrees: [[0, 3, 7], [3, 7, 10], [10, 14, 17], [5, 8, 12], [0, 3, 7], [8, 12, 15], [7, 11, 14], [0, 3, 7]], melodyContour: [12, 15, 19, 17, 15, 14, 12, 10, 12, 15, 14, 12, 8, 7, 11, 12], mood: 'Hypnotic, enchanting, perilous beauty', generativePrompt: 'Hypnotic Siren song over Aegean waves in A minor, 6/8 meter, ethereal vocal pad, golden harp and flute' },
      { id: 'od-4', trackNumber: 4, title: 'Between Scylla and Charybdis', chapterCue: 'Book XII · The Whirlpool Strait', key: 'C', mode: 'minor', bpm: 128, timeSignature: '4/4', instrumentation: 'Storm Strings, Brass & Percussion', leadTimbre: 'strings', progressionRoman: ['i', 'V7', 'i', 'iv', 'VI', 'V7', 'i', 'i'], chordDegrees: [[0, 3, 7], [7, 11, 14], [0, 3, 7], [5, 8, 12], [8, 12, 15], [7, 11, 14], [0, 3, 7], [0, 3, 7]], melodyContour: [12, 11, 12, 15, 14, 12, 8, 7, 12, 8, 7, 5, 3, 2, 3, 0], mood: 'Furious maelstrom and heroic endurance', generativePrompt: 'Intense orchestral whirlpool storm in C minor, swirling string arpeggios and brass' },
      { id: 'od-5', trackNumber: 5, title: 'Penelope’s Loom by Torchlight', chapterCue: 'Book XIX · The Hall of Ithaca', key: 'F', mode: 'major', bpm: 72, timeSignature: '3/4', instrumentation: 'Solo Kithara Lyre & Warm Viola', leadTimbre: 'lyre', progressionRoman: ['I', 'vi', 'IV', 'V', 'I', 'iii', 'IV', 'I'], chordDegrees: [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14], [0, 4, 7], [4, 7, 11], [5, 9, 12], [0, 4, 7]], melodyContour: [12, 14, 16, 12, 9, 12, 14, 11, 12, 9, 7, 9, 11, 14, 12, 12], mood: 'Faithful, intimate, weaving in the night', generativePrompt: 'Intimate ancient Greek lyre and viola lullaby in F major, gentle weaving arpeggios' },
      { id: 'od-6', trackNumber: 6, title: 'The Stringing of the Great Bow on Ithaca', chapterCue: 'Book XXI · Homecoming Triumph', key: 'G', mode: 'major', bpm: 112, timeSignature: '4/4', instrumentation: 'Full Mediterranean Orchestra, Lyre & Horns', leadTimbre: 'horn', progressionRoman: ['I', 'IV', 'V', 'I', 'vi', 'IV', 'V7', 'I'], chordDegrees: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14], [0, 4, 7]], melodyContour: [7, 12, 14, 16, 19, 16, 14, 12, 14, 16, 19, 17, 16, 14, 12, 12], mood: 'Triumphant golden sunset over Ithaca', generativePrompt: 'Triumphant classical epic finale in G major, resonant plucked bow-string, horns, and soaring strings' },
    ],
  },

  'tom-sawyer': {
    bookThemeId: 'tom-sawyer',
    bookTitle: 'The Adventures of Tom Sawyer',
    author: 'Mark Twain',
    albumTitle: 'Mississippi Steamboat & Sunlit Riverbank Tunes',
    ensembleName: 'Chora St. Petersburg Riverfront Band',
    ensembleDescription: 'Acoustic parlor guitar, fingerpicked banjo, country fiddle, upright bass, and harmonica.',
    tracks: [
      { id: 'ts-1', trackNumber: 1, title: 'Whitewashing the Fence in St. Petersburg', chapterCue: 'Chapter II · The Glorious Whitewasher', key: 'G', mode: 'major', bpm: 114, timeSignature: '4/4', instrumentation: 'Fingerpicked Banjo, Fiddle & Acoustic Guitar', leadTimbre: 'fiddle', progressionRoman: ['I', 'IV', 'I', 'V', 'I', 'IV', 'V7', 'I'], chordDegrees: [[0, 4, 7], [5, 9, 12], [0, 4, 7], [7, 11, 14], [0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]], melodyContour: [12, 14, 16, 19, 16, 14, 12, 9, 7, 9, 12, 14, 16, 14, 12, 12], mood: 'Sunlit, cheerful, mischievous Americana', generativePrompt: 'Cheerful 19th-century Americana folk tune in G major, acoustic guitar, light banjo, playful fiddle' },
      { id: 'ts-2', trackNumber: 2, title: 'Drifting on the Log Raft at Noon', chapterCue: 'Chapter XIII · The Pirate Crew Sets Sail', key: 'C', mode: 'major', bpm: 84, timeSignature: '4/4', instrumentation: 'Acoustic Guitar, Harmonica & Upright Bass', leadTimbre: 'harp', progressionRoman: ['I', 'V', 'vi', 'IV', 'I', 'V', 'I', 'I'], chordDegrees: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12], [0, 4, 7], [7, 11, 14], [0, 4, 7], [0, 7, 12]], melodyContour: [12, 16, 14, 12, 9, 7, 9, 12, 14, 16, 14, 12, 9, 11, 12, 12], mood: 'Lazy, warm summer afternoon under weeping willows', generativePrompt: 'Lazy summer Mississippi river acoustic guitar and harmonica instrumental in C major' },
      { id: 'ts-3', trackNumber: 3, title: 'Paddlewheel Steamboat Round the Bend', chapterCue: 'Chapter XIV · Camp-Life on the Island', key: 'D', mode: 'major', bpm: 122, timeSignature: '4/4', instrumentation: 'Fiddle, Ragtime Parlor Piano & Calliope Flute', leadTimbre: 'fiddle', progressionRoman: ['I', 'IV', 'V7', 'I', 'vi', 'ii', 'V7', 'I'], chordDegrees: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7], [9, 12, 16], [2, 5, 9], [7, 11, 14], [0, 4, 7]], melodyContour: [7, 12, 14, 16, 19, 16, 14, 12, 9, 12, 14, 16, 14, 11, 12, 12], mood: 'Jubilant riverboat whistle and churning paddlewheel', generativePrompt: 'Upbeat Mississippi riverboat fiddle and parlor piano tune in D major, joyful Americana energy' },
      { id: 'ts-4', trackNumber: 4, title: 'Midnight in the Graveyard', chapterCue: 'Chapter IX · Tragedy in the Graveyard', key: 'A', mode: 'minor', bpm: 78, timeSignature: '4/4', instrumentation: 'Pizzicato Strings, Low Clarinet & Tremolo Guitar', leadTimbre: 'strings', progressionRoman: ['i', 'iv', 'V7', 'i', 'VI', 'V7', 'i', 'i'], chordDegrees: [[0, 3, 7], [5, 8, 12], [7, 11, 14], [0, 3, 7], [8, 12, 15], [7, 11, 14], [0, 3, 7], [0, 3, 7]], melodyContour: [12, 11, 8, 7, 5, 8, 7, 3, 2, 5, 3, 0, 3, 2, 0, 0], mood: 'Spooky, wide-eyed boyhood suspense', generativePrompt: 'Mysterious nocturnal Americana chamber cue in A minor, pizzicato bass, acoustic guitar, eerie clarinet' },
      { id: 'ts-5', trackNumber: 5, title: 'Pirates on Jackson’s Island', chapterCue: 'Chapter XV · Tom’s Stealthy Visit Home', key: 'F', mode: 'major', bpm: 118, timeSignature: '4/4', instrumentation: 'Fiddle, Fife Flute & Snare Brush', leadTimbre: 'flute', progressionRoman: ['I', 'IV', 'I', 'V', 'vi', 'IV', 'V7', 'I'], chordDegrees: [[0, 4, 7], [5, 9, 12], [0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12], [7, 11, 14], [0, 4, 7]], melodyContour: [12, 14, 16, 17, 16, 14, 12, 14, 16, 19, 17, 16, 14, 12, 11, 12], mood: 'Adventurous campfire camaraderie', generativePrompt: 'Adventurous wooden fife flute and acoustic guitar march in F major, spirited boyhood adventure' },
      { id: 'ts-6', trackNumber: 6, title: 'McDougal’s Cave & The Bag of Gold Coins', chapterCue: 'Chapter XXXIII · Twelve Thousand Dollars', key: 'G', mode: 'major', bpm: 98, timeSignature: '4/4', instrumentation: 'Full Americana Ensemble', leadTimbre: 'fiddle', progressionRoman: ['I', 'V', 'vi', 'IV', 'I', 'IV', 'V7', 'I'], chordDegrees: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12], [0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]], melodyContour: [7, 12, 16, 14, 12, 16, 19, 16, 14, 12, 9, 12, 14, 11, 12, 12], mood: 'Warm, nostalgic golden-hour homecoming', generativePrompt: 'Warm nostalgic Americana homecoming finale in G major, fiddle, acoustic guitar, and parlor piano' },
    ],
  },

  'little-women': {
    bookThemeId: 'little-women',
    bookTitle: 'Little Women',
    author: 'Louisa May Alcott',
    albumTitle: 'Orchard House Hearthside & Autumn Parlor Piano',
    ensembleName: 'Chora Concord Chamber Trio',
    ensembleDescription: 'Beth’s New England parlor piano, warm mahogany cello, concert flute, and music box.',
    tracks: [
      { id: 'lw-1', trackNumber: 1, title: 'Christmas Morning at Orchard House', chapterCue: 'Chapter I · Playing Pilgrims', key: 'F', mode: 'major', bpm: 96, timeSignature: '3/4', instrumentation: 'Parlor Piano, Cello & Flute', leadTimbre: 'piano', progressionRoman: ['I', 'IV', 'I', 'V', 'vi', 'IV', 'V7', 'I'], chordDegrees: [[0, 4, 7], [5, 9, 12], [0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12], [7, 11, 14], [0, 4, 7]], melodyContour: [12, 14, 16, 17, 16, 14, 12, 9, 12, 14, 16, 14, 12, 11, 12, 12], mood: 'Cozy, loving hearthside warmth', generativePrompt: 'Warm 1860s New England parlor piano and cello waltz in F major, cozy fireplace warmth' },
      { id: 'lw-2', trackNumber: 2, title: 'Jo’s Garret Quill & Inkwell Polka', chapterCue: 'Chapter XIV · Secrets in the Attic', key: 'C', mode: 'major', bpm: 118, timeSignature: '4/4', instrumentation: 'Spirited Piano, Violin & Clarinet', leadTimbre: 'piano', progressionRoman: ['I', 'V', 'vi', 'IV', 'I', 'ii', 'V7', 'I'], chordDegrees: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12], [0, 4, 7], [2, 5, 9], [7, 11, 14], [0, 4, 7]], melodyContour: [12, 16, 19, 16, 14, 17, 14, 12, 9, 12, 14, 16, 14, 11, 12, 12], mood: 'Playful, ink-stained literary inspiration', generativePrompt: 'Lively Victorian parlor piano and violin polka in C major, spirited and creative' },
      { id: 'lw-3', trackNumber: 3, title: 'Beth’s Twilight Parlor Piano', chapterCue: 'Chapter VI · Beth Finds the Palace Beautiful', key: 'F', mode: 'major', bpm: 72, timeSignature: '3/4', instrumentation: 'Solo Upright Piano & Soft Cello', leadTimbre: 'piano', progressionRoman: ['I', 'iii', 'vi', 'IV', 'I', 'ii7', 'V7', 'I'], chordDegrees: [[0, 4, 7], [4, 7, 11], [9, 12, 16], [5, 9, 12], [0, 4, 7], [2, 5, 9], [7, 11, 14], [0, 4, 7]], melodyContour: [12, 11, 12, 16, 14, 12, 9, 7, 9, 12, 14, 12, 11, 9, 11, 12], mood: 'Tender, angelic, candlelit serenity', generativePrompt: 'Tender solo Victorian upright piano nocturne in F major with gentle cello accompaniment' },
      { id: 'lw-4', trackNumber: 4, title: 'Autumn Oak Leaves Over Concord', chapterCue: 'Chapter X · The P.C. and P.O.', key: 'G', mode: 'major', bpm: 88, timeSignature: '6/8', instrumentation: 'Flute, Harp & Strings', leadTimbre: 'flute', progressionRoman: ['I', 'vi', 'IV', 'V', 'I', 'IV', 'V7', 'I'], chordDegrees: [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14], [0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]], melodyContour: [12, 14, 16, 19, 16, 12, 14, 9, 11, 12, 16, 14, 12, 11, 12, 12], mood: 'Golden-red New England autumn afternoon', generativePrompt: 'Pastoral New England autumn chamber piece in G major, flute, harp, and warm strings' },
      { id: 'lw-5', trackNumber: 5, title: 'Amy’s Sketchbook & Laurie’s Waltz', chapterCue: 'Chapter III · The Laurence Boy', key: 'D', mode: 'major', bpm: 108, timeSignature: '3/4', instrumentation: 'Piano Trio (Piano, Violin, Cello)', leadTimbre: 'strings', progressionRoman: ['I', 'IV', 'V7', 'I', 'vi', 'ii', 'V7', 'I'], chordDegrees: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7], [9, 12, 16], [2, 5, 9], [7, 11, 14], [0, 4, 7]], melodyContour: [7, 12, 16, 14, 12, 11, 9, 12, 14, 17, 16, 14, 12, 11, 12, 12], mood: 'Youthful, whirling Victorian ballroom grace', generativePrompt: 'Graceful 19th-century piano trio waltz in D major, youthful and romantic' },
      { id: 'lw-6', trackNumber: 6, title: 'Four Sisters by the Hearthside', chapterCue: 'Chapter XLVII · Harvest Time', key: 'F', mode: 'major', bpm: 82, timeSignature: '4/4', instrumentation: 'Full Chamber Ensemble', leadTimbre: 'piano', progressionRoman: ['I', 'V', 'vi', 'iii', 'IV', 'I', 'V7', 'I'], chordDegrees: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [4, 7, 11], [5, 9, 12], [0, 4, 7], [7, 11, 14], [0, 4, 7]], melodyContour: [12, 14, 16, 12, 9, 12, 14, 16, 17, 16, 14, 12, 9, 11, 12, 12], mood: 'Heartfelt, enduring sisterhood and home', generativePrompt: 'Heartfelt chamber music finale in F major, warm piano, cello, violin, and flute in harmony' },
    ],
  },

  'moby-dick': {
    bookThemeId: 'moby-dick',
    bookTitle: 'Moby Dick; or, The Whale',
    author: 'Herman Melville',
    albumTitle: 'The Pequod & The Breaching Leviathan Symphony',
    ensembleName: 'Chora Nantucket Maritime Symphony',
    ensembleDescription: 'Low brass horns, stormy contrabasses, solo cello, and Nantucket concertina.',
    tracks: [
      { id: 'md-1', trackNumber: 1, title: 'Call Me Ishmael (Nantucket Wharf)', chapterCue: 'Chapter I · Loomings', key: 'D', mode: 'minor', bpm: 82, timeSignature: '6/8', instrumentation: 'Solo Cello, Concertina & Harbor Bell', leadTimbre: 'strings', progressionRoman: ['i', 'VII', 'VI', 'V', 'i', 'iv', 'V7', 'i'], chordDegrees: [[0, 3, 7], [10, 14, 17], [8, 12, 15], [7, 11, 14], [0, 3, 7], [5, 8, 12], [7, 11, 14], [0, 3, 7]], melodyContour: [7, 12, 14, 15, 12, 10, 8, 7, 5, 7, 10, 8, 7, 5, 3, 0], mood: 'Salt-air mist, ancient call of the ocean', generativePrompt: 'Atmospheric 19th-century maritime score in D minor, solo cello, sea concertina, distant harbor bell' },
      { id: 'md-2', trackNumber: 2, title: 'The Pequod Clears the Harbor', chapterCue: 'Chapter XXII · Merry Christmas', key: 'G', mode: 'minor', bpm: 104, timeSignature: '6/8', instrumentation: 'French Horns, Strings & Sea Shanty Fife', leadTimbre: 'horn', progressionRoman: ['i', 'III', 'VII', 'iv', 'i', 'V7', 'i', 'i'], chordDegrees: [[0, 3, 7], [3, 7, 10], [10, 14, 17], [5, 8, 12], [0, 3, 7], [7, 11, 14], [0, 3, 7], [0, 7, 12]], melodyContour: [0, 3, 7, 12, 10, 7, 8, 5, 7, 10, 12, 14, 12, 8, 7, 0], mood: 'Billowing canvas sails and rolling Atlantic swells', generativePrompt: 'Heroic nautical 6/8 sea symphony in G minor, noble French horns and rolling string waves' },
      { id: 'md-3', trackNumber: 3, title: 'Ahab’s Quarterdeck Pace & The Gold Doubloon', chapterCue: 'Chapter XXXVI · The Quarter-Deck', key: 'C', mode: 'minor', bpm: 88, timeSignature: '4/4', instrumentation: 'Contrabass, Solo Violin & Wooden Footstep Ostinato', leadTimbre: 'strings', progressionRoman: ['i', 'ii°', 'V7', 'i', 'VI', 'iv', 'V7', 'i'], chordDegrees: [[0, 3, 7], [2, 5, 8], [7, 11, 14], [0, 3, 7], [8, 12, 15], [5, 8, 12], [7, 11, 14], [0, 3, 7]], melodyContour: [0, 7, 8, 7, 3, 2, 0, 7, 12, 11, 8, 7, 5, 3, 2, 0], mood: 'Obsessive, monomaniacal, iron resolve', generativePrompt: 'Brooding dramatic score in C minor, steady quarterdeck pacing rhythm, dark double basses and solo violin' },
      { id: 'md-4', trackNumber: 4, title: 'St. Elmo’s Fire on the Yardarms', chapterCue: 'Chapter CXIX · The Candles', key: 'E', mode: 'minor', bpm: 116, timeSignature: '4/4', instrumentation: 'Tremolo Strings, Pipe Organ & Brass', leadTimbre: 'organ', progressionRoman: ['i', 'VI', 'iv', 'V7', 'i', 'ii°', 'V7', 'i'], chordDegrees: [[0, 3, 7], [8, 12, 15], [5, 8, 12], [7, 11, 14], [0, 3, 7], [2, 5, 8], [7, 11, 14], [0, 3, 7]], melodyContour: [12, 15, 14, 12, 11, 12, 15, 19, 15, 14, 12, 8, 7, 5, 2, 0], mood: 'Supernatural corpusants burning in the typhoon', generativePrompt: 'Supernatural maritime storm in E minor, shimmering high string tremolos, brass, and organ' },
      { id: 'md-5', trackNumber: 5, title: 'The Symphony of Sky and Sea', chapterCue: 'Chapter CXXXII · The Symphony', key: 'F', mode: 'major', bpm: 74, timeSignature: '3/4', instrumentation: 'Solo Flute, Harp & Warm Strings', leadTimbre: 'flute', progressionRoman: ['I', 'IV', 'vi', 'V', 'I', 'iii', 'IV', 'I'], chordDegrees: [[0, 4, 7], [5, 9, 12], [9, 12, 16], [7, 11, 14], [0, 4, 7], [4, 7, 11], [5, 9, 12], [0, 4, 7]], melodyContour: [12, 14, 16, 12, 9, 12, 14, 16, 17, 16, 14, 12, 11, 9, 12, 12], mood: 'Brief, aching calm before the final hunt', generativePrompt: 'Serene oceanic adagio in F major, solo flute over gentle harp and strings, calm Pacific horizon' },
      { id: 'md-6', trackNumber: 6, title: 'The Breaching White Leviathan', chapterCue: 'Chapter CXXXV · The Chase — Third Day', key: 'D', mode: 'minor', bpm: 136, timeSignature: '4/4', instrumentation: 'Full Maritime Orchestra, Low Brass & Timpani', leadTimbre: 'horn', progressionRoman: ['i', 'iv', 'V7', 'i', 'VI', 'V7', 'i', 'i'], chordDegrees: [[0, 3, 7], [5, 8, 12], [7, 11, 14], [0, 3, 7], [8, 12, 15], [7, 11, 14], [0, 3, 7], [0, 7, 12]], melodyContour: [0, 7, 12, 15, 14, 12, 8, 7, 12, 15, 17, 15, 14, 12, 7, 0], mood: 'Monumental, colossal ocean climax', generativePrompt: 'Colossal orchestral finale in D minor, thundering timpani, low brass leviathan motif, crashing waves' },
    ],
  },

  'count-of-monte-cristo': {
    bookThemeId: 'count-of-monte-cristo',
    bookTitle: 'The Count of Monte Cristo',
    author: 'Alexandre Dumas',
    albumTitle: 'Château d’If & The Parisian Revenge Suite',
    ensembleName: 'Chora Marseilles & Paris Romantic Orchestra',
    ensembleDescription: 'French Romantic grand piano, harpsichord, solo cello, harp, and orchestral brass.',
    tracks: [
      { id: 'mc-1', trackNumber: 1, title: 'The Pharaon Enters Marseilles', chapterCue: 'Chapter I · Marseilles — The Arrival', key: 'C', mode: 'major', bpm: 102, timeSignature: '4/4', instrumentation: 'French Horns, Strings & Harp', leadTimbre: 'horn', progressionRoman: ['I', 'IV', 'V', 'I', 'vi', 'ii', 'V7', 'I'], chordDegrees: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7], [9, 12, 16], [2, 5, 9], [7, 11, 14], [0, 4, 7]], melodyContour: [7, 12, 14, 16, 19, 16, 14, 12, 9, 12, 14, 16, 14, 11, 12, 12], mood: 'Bright Mediterranean harbor and youthful promise', generativePrompt: 'Bright 19th-century French Romantic orchestral overture in C major, sunlit Marseilles harbor' },
      { id: 'mc-2', trackNumber: 2, title: 'Fourteen Years in the Château d’If', chapterCue: 'Chapter VIII · The Château d’If', key: 'C', mode: 'minor', bpm: 68, timeSignature: '4/4', instrumentation: 'Solo Cello, Deep Piano & Fortress Bell', leadTimbre: 'strings', progressionRoman: ['i', 'iv', 'i', 'V7', 'i', 'VI', 'V7', 'i'], chordDegrees: [[0, 3, 7], [5, 8, 12], [0, 3, 7], [7, 11, 14], [0, 3, 7], [8, 12, 15], [7, 11, 14], [0, 3, 7]], melodyContour: [7, 8, 7, 3, 5, 3, 2, 0, 7, 12, 10, 8, 7, 5, 2, 0], mood: 'Dark stone dungeon beneath crashing sea waves', generativePrompt: 'Somber French Romantic cello and piano elegy in C minor, stone fortress echoes' },
      { id: 'mc-3', trackNumber: 3, title: 'Abbé Faria’s Tunnel & The Cardinal’s Map', chapterCue: 'Chapter XVIII · The Treasure', key: 'G', mode: 'minor', bpm: 94, timeSignature: '4/4', instrumentation: 'Harpsichord, Violin & Cello', leadTimbre: 'piano', progressionRoman: ['i', 'VI', 'III', 'VII', 'iv', 'V7', 'i', 'i'], chordDegrees: [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17], [5, 8, 12], [7, 11, 14], [0, 3, 7], [0, 3, 7]], melodyContour: [0, 3, 7, 10, 12, 14, 15, 12, 10, 8, 7, 5, 7, 3, 2, 0], mood: 'Secretive wisdom, ancient parchment, rising hope', generativePrompt: 'Intriguing chamber score in G minor, harpsichord, solo violin, and cello building in intensity' },
      { id: 'mc-4', trackNumber: 4, title: 'The Cavern of Monte Cristo (Emeralds & Gold)', chapterCue: 'Chapter XXIV · The Secret Cave', key: 'E', mode: 'major', bpm: 112, timeSignature: '3/4', instrumentation: 'Gilded Harp, Celesta, Strings & Horns', leadTimbre: 'harp', progressionRoman: ['I', 'IV', 'I', 'V', 'vi', 'IV', 'V7', 'I'], chordDegrees: [[0, 4, 7], [5, 9, 12], [0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12], [7, 11, 14], [0, 4, 7]], melodyContour: [12, 16, 19, 24, 19, 16, 14, 12, 16, 19, 17, 16, 14, 11, 12, 12], mood: 'Opulent, dazzling treasure under torchlight', generativePrompt: 'Opulent French Romantic waltz in E major, cascading golden harp arpeggios, shimmering celesta and strings' },
      { id: 'mc-5', trackNumber: 5, title: 'Grand Ball in Paris (The Count Enters)', chapterCue: 'Chapter LXI · The Champs-Élysées', key: 'A', mode: 'minor', bpm: 120, timeSignature: '3/4', instrumentation: 'Grand Piano, Full Strings & Harpsichord', leadTimbre: 'strings', progressionRoman: ['i', 'iv', 'V7', 'i', 'VI', 'ii°', 'V7', 'i'], chordDegrees: [[0, 3, 7], [5, 8, 12], [7, 11, 14], [0, 3, 7], [8, 12, 15], [2, 5, 8], [7, 11, 14], [0, 3, 7]], melodyContour: [12, 15, 14, 12, 11, 12, 15, 19, 17, 15, 14, 12, 11, 8, 11, 12], mood: 'Aristocratic, hypnotic, calculated destiny', generativePrompt: 'Sumptuous Parisian ballroom waltz in A minor, sweeping Romantic strings and grand piano' },
      { id: 'mc-6', trackNumber: 6, title: 'Wait and Hope (Sails on the Horizon)', chapterCue: 'Chapter CXVII · The Fifth of October', key: 'C', mode: 'major', bpm: 84, timeSignature: '4/4', instrumentation: 'Full French Romantic Orchestra', leadTimbre: 'piano', progressionRoman: ['I', 'V', 'vi', 'IV', 'I', 'IV', 'V7', 'I'], chordDegrees: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12], [0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]], melodyContour: [12, 14, 16, 19, 16, 14, 12, 9, 11, 12, 16, 14, 12, 11, 12, 12], mood: 'Transcendent forgiveness and Mediterranean dawn', generativePrompt: 'Transcendent French Romantic orchestral finale in C major, piano, harp, and soaring strings' },
    ],
  },

  'jane-eyre': {
    bookThemeId: 'jane-eyre',
    bookTitle: 'Jane Eyre',
    author: 'Charlotte Brontë',
    albumTitle: 'Thornfield Tower & The Yorkshire Heather Moors',
    ensembleName: 'Chora Yorkshire Moorland Quartet',
    ensembleDescription: 'Moorland oboe, English horn, Victorian fortepiano, and expressive string quartet.',
    tracks: [
      { id: 'je-1', trackNumber: 1, title: 'Rain on the Windowpane at Gateshead', chapterCue: 'Chapter I · Behind the Scarlet Curtain', key: 'E', mode: 'minor', bpm: 74, timeSignature: '4/4', instrumentation: 'Solo Fortepiano & English Horn', leadTimbre: 'piano', progressionRoman: ['i', 'VI', 'iv', 'V7', 'i', 'III', 'V7', 'i'], chordDegrees: [[0, 3, 7], [8, 12, 15], [5, 8, 12], [7, 11, 14], [0, 3, 7], [3, 7, 10], [7, 11, 14], [0, 3, 7]], melodyContour: [12, 11, 7, 8, 12, 10, 8, 7, 5, 8, 7, 3, 5, 3, 2, 0], mood: 'Introspective, solitary, fiercely resilient', generativePrompt: 'Melancholic Victorian piano and English horn nocturne in E minor, rain against windowpane' },
      { id: 'je-2', trackNumber: 2, title: 'Footsteps Across the Purple Heather Moors', chapterCue: 'Chapter XII · Hay Lane at Twilight', key: 'A', mode: 'minor', bpm: 88, timeSignature: '6/8', instrumentation: 'Moorland Oboe, Harp & Viola', leadTimbre: 'flute', progressionRoman: ['i', 'III', 'VII', 'iv', 'i', 'VI', 'V7', 'i'], chordDegrees: [[0, 3, 7], [3, 7, 10], [10, 14, 17], [5, 8, 12], [0, 3, 7], [8, 12, 15], [7, 11, 14], [0, 3, 7]], melodyContour: [7, 12, 14, 15, 14, 12, 10, 7, 8, 12, 10, 8, 7, 5, 7, 0], mood: 'Windswept purple heather and twilight sky', generativePrompt: 'Windswept Yorkshire moorland pastoral in A minor, 6/8 meter, expressive oboe, harp, and strings' },
      { id: 'je-3', trackNumber: 3, title: 'Evening Drawing-Room at Thornfield Hall', chapterCue: 'Chapter XIII · Mr. Rochester', key: 'G', mode: 'major', bpm: 94, timeSignature: '3/4', instrumentation: 'Fortepiano, Cello & Violin', leadTimbre: 'piano', progressionRoman: ['I', 'vi', 'IV', 'V', 'I', 'ii', 'V7', 'I'], chordDegrees: [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14], [0, 4, 7], [2, 5, 9], [7, 11, 14], [0, 4, 7]], melodyContour: [12, 14, 16, 12, 9, 12, 14, 16, 19, 16, 14, 12, 11, 9, 12, 12], mood: 'Firelight warmth and spirited intellectual repartee', generativePrompt: 'Warm Victorian drawing-room piano trio in G major, expressive and romantic' },
      { id: 'je-4', trackNumber: 4, title: 'The Flickering Candle in the Third-Story Tower', chapterCue: 'Chapter XV · The Midnight Cry', key: 'C', mode: 'minor', bpm: 80, timeSignature: '4/4', instrumentation: 'Tremolo Strings, Solo Cello & Celesta', leadTimbre: 'strings', progressionRoman: ['i', 'ii°', 'V7', 'i', 'VI', 'iv', 'V7', 'i'], chordDegrees: [[0, 3, 7], [2, 5, 8], [7, 11, 14], [0, 3, 7], [8, 12, 15], [5, 8, 12], [7, 11, 14], [0, 3, 7]], melodyContour: [12, 11, 12, 15, 14, 12, 8, 7, 8, 5, 7, 3, 2, 5, 3, 0], mood: 'Brooding Gothic mystery in the crenellated tower', generativePrompt: 'Gothic suspense chamber cue in C minor, flickering candlelit celesta and dark string quartet' },
      { id: 'je-5', trackNumber: 5, title: 'The Chestnut Tree Split by Lightning', chapterCue: 'Chapter XXIII · Midsummer Eve in the Orchard', key: 'E', mode: 'minor', bpm: 122, timeSignature: '4/4', instrumentation: 'Passionate String Quartet & Fortepiano', leadTimbre: 'strings', progressionRoman: ['i', 'iv', 'V7', 'i', 'VI', 'ii°', 'V7', 'i'], chordDegrees: [[0, 3, 7], [5, 8, 12], [7, 11, 14], [0, 3, 7], [8, 12, 15], [2, 5, 8], [7, 11, 14], [0, 3, 7]], melodyContour: [0, 7, 12, 15, 14, 12, 11, 12, 15, 19, 17, 15, 14, 12, 11, 12], mood: 'Passionate declaration and gathering storm', generativePrompt: 'Passionate Romantic piano quintet in E minor, surging arpeggios and soaring violin' },
      { id: 'je-6', trackNumber: 6, title: 'Reader, I Married Him (Ferndean Dawn)', chapterCue: 'Chapter XXXVIII · Conclusion', key: 'E', mode: 'major', bpm: 84, timeSignature: '4/4', instrumentation: 'Full Chamber Orchestra, Oboe & Piano', leadTimbre: 'piano', progressionRoman: ['I', 'IV', 'V', 'I', 'vi', 'IV', 'V7', 'I'], chordDegrees: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14], [0, 4, 7]], melodyContour: [12, 14, 16, 19, 16, 14, 12, 11, 12, 16, 19, 17, 16, 14, 12, 12], mood: 'Luminous, equal souls united in peace', generativePrompt: 'Luminous Romantic chamber finale in E major, warm piano, oboe, and strings in radiant harmony' },
    ],
  },
};

/**
 * Deterministically composes a complete 4-voice polyphonic musical score (Lead Melody, Harmony/Strings,
 * Arpeggio/Harp/Piano, and Bass/Cello) for any of the 72 classic book tracks.
 */
export function buildPolyphonicTrackScore(track: ClassicBookTrackScore): ScoreNoteEvent[] {
  const rootPc = ROOT_KEY_TO_PC[track.key] ?? 0;
  const baseRootMidi = 60 + rootPc; // C4..B4 area for melody/chords
  const bassRootMidi = 36 + rootPc; // C2..B2 area for bass
  const notes: ScoreNoteEvent[] = [];

  const beatsPerBar = track.timeSignature === '3/4' ? 3 : 4;
  const totalBars = 8;

  for (let bar = 0; bar < totalBars; bar++) {
    const barStart = bar * beatsPerBar;
    const chord = track.chordDegrees[bar % track.chordDegrees.length] || [0, 4, 7];

    // 1. Bass / Cello voice (sustained root + fifth movement)
    const bassMidi = bassRootMidi + chord[0];
    notes.push({
      midi: bassMidi,
      noteName: midiToNoteLabel(bassMidi),
      startBeat: barStart,
      durationBeats: beatsPerBar * 0.92,
      velocity: 88,
      voice: 'bass',
    });

    // 2. Harmony Pad / Chamber Strings voice
    for (const deg of chord) {
      const hMidi = baseRootMidi - 12 + deg;
      notes.push({
        midi: hMidi,
        noteName: midiToNoteLabel(hMidi),
        startBeat: barStart,
        durationBeats: beatsPerBar * 0.88,
        velocity: 64,
        voice: 'harmony',
      });
    }

    // 3. Arpeggio / Harp / Fortepiano accompaniment
    const arpSteps = track.timeSignature === '3/4' ? 6 : 8;
    const stepLen = beatsPerBar / arpSteps;
    for (let s = 0; s < arpSteps; s++) {
      const deg = chord[s % chord.length] + (s >= chord.length ? 12 : 0);
      const aMidi = baseRootMidi - 12 + deg;
      notes.push({
        midi: aMidi,
        noteName: midiToNoteLabel(aMidi),
        startBeat: barStart + s * stepLen,
        durationBeats: stepLen * 0.85,
        velocity: 70,
        voice: 'arpeggio',
      });
    }

    // 4. Expressive Lead Melody (2 phrases per bar from track.melodyContour)
    const mIdx1 = (bar * 2) % track.melodyContour.length;
    const mIdx2 = (bar * 2 + 1) % track.melodyContour.length;
    const mMidi1 = baseRootMidi + track.melodyContour[mIdx1];
    const mMidi2 = baseRootMidi + track.melodyContour[mIdx2];

    const halfBar = beatsPerBar / 2;
    notes.push({
      midi: mMidi1,
      noteName: midiToNoteLabel(mMidi1),
      startBeat: barStart,
      durationBeats: halfBar * 0.9,
      velocity: 102,
      voice: 'lead',
    });
    notes.push({
      midi: mMidi2,
      noteName: midiToNoteLabel(mMidi2),
      startBeat: barStart + halfBar,
      durationBeats: halfBar * 0.9,
      velocity: 96,
      voice: 'lead',
    });
  }

  return notes.sort((a, b) => a.startBeat - b.startBeat);
}

/**
 * Exports a standard MIDI file (.mid, Format 0, 480 TPQN) for any Classic Book Track Score
 * so the user can download it or import it into any DAW / Chora Studio.
 */
export function exportTrackScoreToMidiBlob(track: ClassicBookTrackScore, customNotes?: ScoreNoteEvent[]): Blob {
  const scoreNotes = customNotes && customNotes.length > 0 ? customNotes : buildPolyphonicTrackScore(track);
  const tpqn = 480;
  const usPerQuarter = Math.round(60_000_000 / Math.max(40, track.bpm));

  interface MidiEvt {
    tick: number;
    bytes: number[];
  }
  const evts: MidiEvt[] = [];

  // Tempo meta event at tick 0
  evts.push({
    tick: 0,
    bytes: [0xff, 0x51, 0x03, (usPerQuarter >> 16) & 0xff, (usPerQuarter >> 8) & 0xff, usPerQuarter & 0xff],
  });

  for (const n of scoreNotes) {
    const startTick = Math.max(0, Math.round(n.startBeat * tpqn));
    const endTick = Math.max(startTick + 60, Math.round((n.startBeat + n.durationBeats) * tpqn));
    const ch = n.voice === 'lead' ? 0 : n.voice === 'arpeggio' ? 1 : n.voice === 'harmony' ? 2 : 3;
    const key = Math.max(0, Math.min(127, Math.round(n.midi)));
    const vel = Math.max(1, Math.min(127, Math.round(n.velocity)));
    evts.push({ tick: startTick, bytes: [0x90 | ch, key, vel] });
    evts.push({ tick: endTick, bytes: [0x80 | ch, key, 0] });
  }

  evts.sort((a, b) => a.tick - b.tick);

  const writeVarLen = (val: number): number[] => {
    const buf: number[] = [val & 0x7f];
    let v = val >> 7;
    while (v > 0) {
      buf.unshift((v & 0x7f) | 0x80);
      v >>= 7;
    }
    return buf;
  };

  const trackBytes: number[] = [];
  let lastTick = 0;
  for (const e of evts) {
    const delta = Math.max(0, e.tick - lastTick);
    lastTick = e.tick;
    trackBytes.push(...writeVarLen(delta), ...e.bytes);
  }
  // End of track
  trackBytes.push(0x00, 0xff, 0x2f, 0x00);

  const tLen = trackBytes.length;
  const header = [
    0x4d, 0x54, 0x68, 0x64, // MThd
    0x00, 0x00, 0x00, 0x06, // length 6
    0x00, 0x00,             // format 0
    0x00, 0x01,             // 1 track
    (tpqn >> 8) & 0xff, tpqn & 0xff,
    0x4d, 0x54, 0x72, 0x6b, // MTrk
    (tLen >> 24) & 0xff, (tLen >> 16) & 0xff, (tLen >> 8) & 0xff, tLen & 0xff,
  ];

  return new Blob([new Uint8Array([...header, ...trackBytes])], { type: 'audio/midi' });
}

/**
 * Generates a Chora Studio WAV/MIDI stem using ChoraGenerativeMusicEngine AND optionally invokes
 * Gemini `promptToScore` to compose a brand-new AI variation from scratch!
 */
export async function composeFreshAiScoreForBookTrack(
  track: ClassicBookTrackScore
): Promise<{ notes: ScoreNoteEvent[]; choraStem: ChoraMusicStem }> {
  const choraEngine = ChoraGenerativeMusicEngine.getInstance();
  const choraStem = choraEngine.generateChordProgressionStem({
    progressionId: track.mode === 'minor' ? 'epic-minor' : 'pop-1564',
    rootKey: `${track.key} ${track.mode === 'minor' ? 'Minor' : 'Major'}`,
    bpm: track.bpm,
    seventh: true,
    instrumentPreset: 'piano',
  });

  try {
    const aiRes = await promptToScore(track.generativePrompt, {
      key: track.key,
      mode: track.mode,
      bars: 8,
      progression: track.progressionRoman.join(' - '),
      snap: true,
    });

    if (aiRes.notes && aiRes.notes.length >= 6) {
      const baseScores = buildPolyphonicTrackScore(track).filter(n => n.voice !== 'lead');
      const aiLead: ScoreNoteEvent[] = aiRes.notes.map(n => ({
        midi: n.key,
        noteName: midiToNoteLabel(n.key),
        startBeat: n.startBeats,
        durationBeats: n.lengthBeats,
        velocity: n.vel,
        voice: 'lead' as const,
      }));
      return {
        notes: [...baseScores, ...aiLead].sort((a, b) => a.startBeat - b.startBeat),
        choraStem,
      };
    }
  } catch {
    // Offline or API unavailable: deterministic algorithmic variation
  }

  // Deterministic fresh variation on the track's scale
  const base = buildPolyphonicTrackScore(track).map((n, idx) => {
    if (n.voice !== 'lead') return n;
    const shift = idx % 3 === 0 ? 2 : idx % 3 === 1 ? -1 : 0;
    const nextMidi = n.midi + shift;
    return {
      ...n,
      midi: nextMidi,
      noteName: midiToNoteLabel(nextMidi),
    };
  });

  return { notes: base, choraStem };
}

/**
 * Saves a Classic Book Track Score directly to the user's Lorea Scores library (`loreaScoreService.ts`).
 */
export async function saveClassicBookTrackToLoreaScores(
  album: ClassicBookSoundtrackAlbum,
  track: ClassicBookTrackScore,
  notes: ScoreNoteEvent[]
) {
  const leadNotes = notes.filter(n => n.voice === 'lead');
  const xmlNotes = leadNotes
    .slice(0, 24)
    .map(n => `<note><pitch><step>${n.noteName.replace(/[#\d-]/g, '') || 'C'}</step><octave>${n.noteName.match(/\d+/)?.[0] || '4'}</octave></pitch><duration>${Math.round(n.durationBeats * 4)}</duration><type>quarter</type></note>`)
    .join('');

  const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>${track.title} (${album.bookTitle})</work-title></work>
  <part-list><score-part id="P1"><part-name>${track.instrumentation}</part-name></score-part></part-list>
  <part id="P1"><measure number="1">${xmlNotes}</measure></part>
</score-partwise>`;

  return saveScore({
    title: `${album.bookTitle} — ${track.trackNumber}. ${track.title}`,
    artist: `${album.ensembleName} (after ${album.author})`,
    trackId: track.id,
    theory: {
      key: track.key,
      scale: track.mode,
      tempo: track.bpm,
      timeSignature: track.timeSignature,
    },
    musicXml,
    backend: 'Chora Literary Score Engine',
  });
}

export {
  PLATFORM_MUSIC_MODELS,
  CLASSIC_BOOK_CHORA_RACKS,
  MASTER_BOOK_SCORES,
  getMasterBookScore,
  renderMasterMovementAudio,
  getOrRenderBookMovementAudioUrl,
  hydrateClassicBookGrooveAudioStems,
  seedAdminClassicBookProjects,
  conveneBookScoreCouncil,
  conveneBookScoreCouncilWithAi,
  playScoreWithChoraInstruments,
  generateBookTrackWithPlatformModel,
  buildClassicBookGrooveDoc,
  buildClassicBookMixerStrips,
  launchClassicBookInChoraDaw,
  type PlatformMusicModelId,
  type PlatformMusicModelSpec,
  type ChoraBookVoiceAssignment,
  type ClassicBookChoraInstrumentRack,
  type CouncilMemberNote,
  type ClassicBookCouncilDeliberation,
} from '../services/melos/classicBookChoraProjects';


