import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Music2, Headphones, BookOpen, ChevronRight, ChevronLeft,
  ArrowLeft, Play, Square, Check, X, Star, Sparkles,
  Volume2, RefreshCw, Award, Lock,
} from 'lucide-react';

interface Props {
  onBack: () => void;
  user: any;
}

type Difficulty = 'NOVICE' | 'INTERMEDIATE' | 'MAESTRO';
type Tab = 'LESSONS' | 'EAR_TRAINING' | 'SCORE_READER';

// ── Music helpers ──────────────────────────────────────────────────────────────
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function playNote(audioCtx: AudioContext, midi: number, duration = 1.2): void {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();

  filter.type = 'lowpass';
  filter.frequency.value = 3000;

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);

  osc.type = 'triangle';
  osc.frequency.value = midiToFreq(midi);

  const now = audioCtx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.4, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.15, now + 0.3);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.start(now);
  osc.stop(now + duration + 0.1);
}

function playChord(audioCtx: AudioContext, midis: number[], duration = 1.5): void {
  midis.forEach((m, i) => {
    setTimeout(() => playNote(audioCtx, m, duration), i * 20);
  });
}

// ── Lesson data ────────────────────────────────────────────────────────────────
interface Lesson {
  id: string;
  title: string;
  subtitle: string;
  difficulty: Difficulty;
  emoji: string;
  duration: string;
  content: LessonSection[];
}

interface LessonSection {
  heading: string;
  body: string;
  visual?: 'staff' | 'keyboard' | 'intervals';
}

const LESSONS: Lesson[] = [
  {
    id: 'notes-basics',
    title: 'The Musical Alphabet',
    subtitle: 'Notes, octaves, and the 12-tone system',
    difficulty: 'NOVICE',
    emoji: '🎵',
    duration: '5 min',
    content: [
      {
        heading: 'The Seven Natural Notes',
        body: 'Western music uses just seven natural notes: A, B, C, D, E, F, G. After G, the pattern repeats — but at a higher pitch. This repetition is called an octave. Middle C is the C closest to the middle of a standard piano keyboard.',
        visual: 'keyboard',
      },
      {
        heading: 'Sharps and Flats',
        body: 'Between most natural notes lies a black key. A sharp (♯) raises a note by one semitone (half step); a flat (♭) lowers it. So C♯ and D♭ are the same key — just different names for the same pitch, depending on context. This is called enharmonic equivalence.',
      },
      {
        heading: 'The Staff',
        body: 'Music is written on a staff — five horizontal lines. Notes sit on the lines or in the spaces between them. A clef symbol at the beginning tells us which notes correspond to which lines. The treble clef (𝄞) is used for higher-pitched instruments and voices.',
        visual: 'staff',
      },
    ],
  },
  {
    id: 'rhythm-basics',
    title: 'Rhythm & Time',
    subtitle: 'Note values, beats, and time signatures',
    difficulty: 'NOVICE',
    emoji: '🥁',
    duration: '6 min',
    content: [
      {
        heading: 'Note Values',
        body: 'Every note has a duration. A whole note (𝅝) lasts 4 beats. A half note (𝅗𝅥) lasts 2 beats. A quarter note (♩) lasts 1 beat. An eighth note (♪) lasts half a beat. These values are relative — the tempo (speed) determines the actual seconds.',
      },
      {
        heading: 'Time Signatures',
        body: 'The time signature appears at the start of a piece. 4/4 means four quarter-note beats per measure — the most common in popular music. 3/4 gives three beats — the waltz feel. 6/8 groups beats in two sets of three, creating a lilting compound rhythm.',
      },
      {
        heading: 'Rests',
        body: 'Silence is as important as sound. Every note value has a corresponding rest. A quarter rest means one beat of silence. Learning to feel rests — not just fill them with sound — is one of the first marks of a developing musician.',
      },
    ],
  },
  {
    id: 'major-scales',
    title: 'Major Scales',
    subtitle: 'The foundation of Western tonality',
    difficulty: 'NOVICE',
    emoji: '🎹',
    duration: '7 min',
    content: [
      {
        heading: 'The Major Scale Pattern',
        body: 'A scale is an ordered sequence of notes. The major scale follows a specific pattern of whole steps (W) and half steps (H): W-W-H-W-W-W-H. Starting from C, this gives you: C-D-E-F-G-A-B-C — all the white keys on a piano. This is why C major is the easiest key to learn.',
      },
      {
        heading: 'Other Major Scales',
        body: 'The same W-W-H-W-W-W-H pattern starting from G gives: G-A-B-C-D-E-F#-G. Notice the F# is needed to maintain the pattern. Every major key has its own combination of sharps or flats — collectively its key signature. There are 12 major keys in total.',
      },
      {
        heading: 'Why Scales Matter',
        body: 'Scales are not just exercises — they define the tonal world of a piece of music. When a composer writes "in C major," it means almost all the notes will come from the C major scale. Understanding scales lets you predict what notes will feel stable ("home") versus tense (wanting to move).',
      },
    ],
  },
  {
    id: 'intervals',
    title: 'Intervals',
    subtitle: 'The distance between two notes',
    difficulty: 'INTERMEDIATE',
    emoji: '📐',
    duration: '8 min',
    content: [
      {
        heading: 'What Is an Interval?',
        body: 'An interval is the distance between two pitches. Intervals have a number name (based on how many letter names are spanned) and a quality (perfect, major, minor, augmented, or diminished). From C to G is a fifth — it spans C, D, E, F, G — five letter names.',
        visual: 'intervals',
      },
      {
        heading: 'Perfect, Major, and Minor',
        body: 'Some intervals are "perfect" — unison, 4th, 5th, octave. Others are "major" or "minor" — 2nds, 3rds, 6ths, 7ths. A major 3rd (e.g. C to E) has 4 semitones; a minor 3rd (C to Eb) has 3. The difference between major and minor chords lies in this single semitone.',
      },
      {
        heading: 'Recognizing Intervals by Song',
        body: '"Do-Re-Mi" = major 2nd. "Happy Birthday" opening = major 2nd. "Here Comes the Bride" = perfect 4th. "Twinkle Twinkle" = perfect 5th. "My Bonnie Lies Over" = major 6th. "Somewhere Over the Rainbow" = perfect octave. Ear training is learning to hear these distances instantly.',
      },
    ],
  },
  {
    id: 'chords',
    title: 'Chords & Harmony',
    subtitle: 'Triads, seventh chords, and chord function',
    difficulty: 'INTERMEDIATE',
    emoji: '🎸',
    duration: '10 min',
    content: [
      {
        heading: 'Building a Triad',
        body: 'A triad is three notes stacked in thirds. A major triad: root + major 3rd + perfect 5th (C-E-G). A minor triad: root + minor 3rd + perfect 5th (C-Eb-G). A diminished triad: root + minor 3rd + diminished 5th (C-Eb-Gb). These four chord qualities — major, minor, diminished, augmented — are the building blocks of harmony.',
      },
      {
        heading: 'Chord Function: I, IV, V',
        body: 'In any key, chords built on different scale degrees have different roles. The I chord (tonic) is home and rest. The V chord (dominant) creates tension and wants to resolve back to I. The IV chord (subdominant) provides contrast. These three chords — I, IV, V — underpin the blues, rock, country, gospel, and classical music alike.',
      },
      {
        heading: 'Seventh Chords',
        body: 'Add a fourth note — another third above the fifth — and you get a seventh chord. The dominant seventh chord (V7) is particularly powerful: in C major, G7 (G-B-D-F) creates urgent desire to resolve to C major. Jazz harmony is built on stacked seventh chords — seventh, ninth, eleventh, thirteenth.',
      },
    ],
  },
  {
    id: 'modes',
    title: 'Modes & Modal Music',
    subtitle: 'Beyond major and minor',
    difficulty: 'MAESTRO',
    emoji: '🌙',
    duration: '12 min',
    content: [
      {
        heading: 'The Seven Modes',
        body: 'Medieval church music organized pitch collections into seven modes. Each mode is a rotation of the major scale starting from a different degree. Ionian (1st) = major scale. Dorian (2nd) = minor with raised 6th — used in "So What" by Miles Davis. Phrygian (3rd) = Spanish flamenco character. Lydian (4th) = dreamy, raised 4th. Mixolydian (5th) = major with flattened 7th — the rock scale. Aeolian (6th) = natural minor. Locrian (7th) = diminished, rarely used.',
      },
      {
        heading: 'Modal Color in Practice',
        body: 'Miles Davis\'s Kind of Blue (1959) famously explored Dorian and Mixolydian modes as alternatives to chord-based improvisation — a revolution in jazz. The Beatles frequently used Mixolydian ("Norwegian Wood," "Hey Jude"). John Williams uses Lydian for wonder and fantasy (the ET theme). Knowing modes lets you identify why a piece sounds the way it does.',
      },
      {
        heading: 'Modal Harmony',
        body: 'In modal music, the focus shifts from the pull toward a dominant chord to the color of the mode itself. Instead of I→IV→V→I progressions, modal pieces often sit on a single chord or move between chords that share the same tonal center. This creates the static, meditative quality of Gregorian chant, Coltrane\'s "A Love Supreme," or certain passages of Debussy.',
      },
    ],
  },
  {
    id: 'counterpoint',
    title: 'Counterpoint',
    subtitle: 'The art of combining independent melodic lines',
    difficulty: 'MAESTRO',
    emoji: '🎼',
    duration: '15 min',
    content: [
      {
        heading: 'Species Counterpoint',
        body: 'Counterpoint is the technique of combining two or more independent melodic lines. Johann Joseph Fux codified the rules in Gradus ad Parnassum (1725) — the textbook Bach, Haydn, Mozart, and Beethoven all studied. The first species rule: each note in one voice against each note in another must form a consonant interval (3rd, 5th, 6th, octave). Parallel 5ths and octaves are forbidden because they make the voices merge into one.',
      },
      {
        heading: 'Fugue',
        body: 'The fugue is the supreme form of contrapuntal writing. It begins with a single voice stating the subject (main theme). A second voice answers at the dominant while the first continues in counterpoint. Additional voices enter similarly. The development section explores the subject through inversion (upside-down), augmentation (slower), diminution (faster), and stretto (overlapping entries). Bach\'s The Art of Fugue is the ultimate demonstration.',
      },
      {
        heading: 'Why Study Counterpoint Today?',
        body: 'Counterpoint training teaches composers to hear each voice independently and together simultaneously — the most challenging skill in music. Film composers use it constantly: Hans Zimmer, John Williams, Bernard Herrmann all write contrapuntal passages. Jazz improvisers who understand counterpoint can create inner voices that make solos sound orchestrated. It is the grammar of musical thinking.',
      },
    ],
  },
];

// ── Ear Training data ──────────────────────────────────────────────────────────
type EarQuestion =
  | { type: 'note'; midi: number; label: string }
  | { type: 'interval'; midis: [number, number]; label: string }
  | { type: 'chord'; midis: number[]; label: string };

function generateQuestion(difficulty: Difficulty): EarQuestion {
  if (difficulty === 'NOVICE') {
    const noteIndex = Math.floor(Math.random() * 7);
    const noteNames = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const noteMidis = [60, 62, 64, 65, 67, 69, 71];
    return { type: 'note', midi: noteMidis[noteIndex], label: noteNames[noteIndex] };
  }
  if (difficulty === 'INTERMEDIATE') {
    const intervals = [
      { name: 'Major 2nd', semitones: 2 },
      { name: 'Minor 3rd', semitones: 3 },
      { name: 'Major 3rd', semitones: 4 },
      { name: 'Perfect 4th', semitones: 5 },
      { name: 'Perfect 5th', semitones: 7 },
      { name: 'Major 6th', semitones: 9 },
      { name: 'Octave', semitones: 12 },
    ];
    const root = 60 + Math.floor(Math.random() * 7);
    const interval = intervals[Math.floor(Math.random() * intervals.length)];
    return { type: 'interval', midis: [root, root + interval.semitones], label: interval.name };
  }
  const chords = [
    { name: 'Major', intervals: [0, 4, 7] },
    { name: 'Minor', intervals: [0, 3, 7] },
    { name: 'Diminished', intervals: [0, 3, 6] },
    { name: 'Dominant 7th', intervals: [0, 4, 7, 10] },
    { name: 'Major 7th', intervals: [0, 4, 7, 11] },
    { name: 'Minor 7th', intervals: [0, 3, 7, 10] },
  ];
  const root = 60 + Math.floor(Math.random() * 7);
  const chord = chords[Math.floor(Math.random() * chords.length)];
  return { type: 'chord', midis: chord.intervals.map(i => root + i), label: chord.name };
}

function getChoices(q: EarQuestion, difficulty: Difficulty): string[] {
  if (q.type === 'note') {
    const all = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const others = all.filter(n => n !== q.label);
    return shuffle([q.label, others[0], others[1], others[2]]);
  }
  if (q.type === 'interval') {
    const all = ['Minor 2nd', 'Major 2nd', 'Minor 3rd', 'Major 3rd', 'Perfect 4th', 'Tritone', 'Perfect 5th', 'Minor 6th', 'Major 6th', 'Minor 7th', 'Major 7th', 'Octave'];
    const others = all.filter(n => n !== q.label);
    return shuffle([q.label, others[0], others[1], others[2]]);
  }
  const all = ['Major', 'Minor', 'Diminished', 'Augmented', 'Dominant 7th', 'Major 7th', 'Minor 7th', 'Half-diminished 7th'];
  const others = all.filter(n => n !== q.label);
  return shuffle([q.label, others[0], others[1], others[2]]);
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

// ── Simple SVG Staff ───────────────────────────────────────────────────────────
const SimpleStaff: React.FC<{ notes?: number[] }> = ({ notes = [60, 62, 64, 65, 67] }) => {
  const lineY = [40, 52, 64, 76, 88];
  const notePositions: Record<number, number> = {
    60: 88, 62: 82, 64: 76, 65: 70, 67: 64, 69: 58, 71: 52, 72: 46, 74: 40, 76: 34,
  };

  return (
    <svg width="100%" viewBox="0 0 400 130" className="w-full">
      <rect width="400" height="130" fill="transparent" />
      {/* Staff lines */}
      {lineY.map((y, i) => (
        <line key={i} x1="30" y1={y} x2="370" y2={y} stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
      ))}
      {/* Treble clef placeholder */}
      <text x="35" y="95" fontSize="70" fill="rgba(255,255,255,0.5)" fontFamily="serif">𝄞</text>
      {/* Notes */}
      {notes.map((midi, i) => {
        const y = notePositions[midi] ?? 64;
        const x = 100 + i * 55;
        return (
          <g key={i}>
            <ellipse cx={x} cy={y} rx={9} ry={6.5} fill="white" transform={`rotate(-15, ${x}, ${y})`} />
            <line x1={x + 8} y1={y} x2={x + 8} y2={y - 32} stroke="white" strokeWidth="2" />
          </g>
        );
      })}
    </svg>
  );
};

// ── Virtual Keyboard ───────────────────────────────────────────────────────────
const MiniKeyboard: React.FC<{ highlightMidis?: number[]; onPress?: (midi: number) => void }> = ({ highlightMidis = [], onPress }) => {
  const whites = [60, 62, 64, 65, 67, 69, 71, 72]; // C4 to C5
  const blackMap: Record<number, number> = { 61: 1, 63: 2, 66: 4, 68: 5, 70: 6 };
  const isHighlighted = (midi: number) => highlightMidis.includes(midi);

  return (
    <div className="relative h-20 flex select-none">
      {whites.map((midi, i) => (
        <button
          key={midi}
          onClick={() => onPress?.(midi)}
          className={`relative flex-1 border border-white/20 rounded-b-lg transition-all ${isHighlighted(midi) ? 'bg-purple-500' : 'bg-white hover:bg-purple-100'}`}
          style={{ minWidth: 0 }}
        />
      ))}
      {/* Black keys */}
      {Object.entries(blackMap).map(([midiStr, pos]) => {
        const midi = parseInt(midiStr);
        const left = `calc(${(pos / whites.length) * 100}% - 2%)`;
        return (
          <button
            key={midi}
            onClick={() => onPress?.(midi)}
            className={`absolute top-0 w-[6%] h-[60%] z-10 rounded-b-md transition-all ${isHighlighted(midi) ? 'bg-purple-500' : 'bg-[#1a1a2e] hover:bg-purple-900'}`}
            style={{ left }}
          />
        );
      })}
    </div>
  );
};

// ── Lesson Detail ──────────────────────────────────────────────────────────────
const LessonDetail: React.FC<{ lesson: Lesson; onClose: () => void }> = ({ lesson, onClose }) => {
  const [sectionIndex, setSectionIndex] = useState(0);
  const section = lesson.content[sectionIndex];
  const isLast = sectionIndex === lesson.content.length - 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 30 }}
      className="fixed inset-0 z-[100] bg-[#0a0812]/95 backdrop-blur-xl overflow-y-auto p-4 flex items-center justify-center"
    >
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{lesson.emoji}</span>
            <div>
              <h2 className="text-xl font-black text-white">{lesson.title}</h2>
              <p className="text-xs text-white/40">{lesson.subtitle}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center"><X size={16} /></button>
        </div>

        {/* Progress */}
        <div className="flex gap-1 mb-6">
          {lesson.content.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= sectionIndex ? 'bg-purple-500' : 'bg-white/10'}`} />
          ))}
        </div>

        {/* Section */}
        <AnimatePresence mode="wait">
          <motion.div
            key={sectionIndex}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            className="bg-white/[0.04] border border-white/[0.08] rounded-[1.5rem] p-6"
          >
            <h3 className="text-lg font-black text-white mb-3">{section.heading}</h3>
            <p className="text-white/70 text-sm leading-relaxed mb-6">{section.body}</p>

            {section.visual === 'staff' && (
              <div className="bg-black/30 rounded-xl p-4 mb-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">The Staff — C major scale</p>
                <SimpleStaff />
              </div>
            )}
            {section.visual === 'keyboard' && (
              <div className="bg-black/30 rounded-xl p-4 mb-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">One octave of C major — white keys</p>
                <MiniKeyboard highlightMidis={[60, 62, 64, 65, 67, 69, 71]} />
              </div>
            )}
            {section.visual === 'intervals' && (
              <div className="bg-black/30 rounded-xl p-4 mb-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Perfect 5th: C → G</p>
                <MiniKeyboard highlightMidis={[60, 67]} />
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Nav */}
        <div className="flex gap-3 mt-4">
          <button
            disabled={sectionIndex === 0}
            onClick={() => setSectionIndex(s => s - 1)}
            className="flex items-center gap-2 px-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-xs font-black disabled:opacity-30 transition-all"
          >
            <ChevronLeft size={14} /> Back
          </button>
          {isLast ? (
            <button onClick={onClose} className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-600 hover:bg-green-500 rounded-2xl text-xs font-black uppercase tracking-widest transition-all">
              <Check size={14} /> Complete Lesson
            </button>
          ) : (
            <button onClick={() => setSectionIndex(s => s + 1)} className="flex-1 flex items-center justify-center gap-2 py-3 bg-purple-600 hover:bg-purple-500 rounded-2xl text-xs font-black uppercase tracking-widest transition-all">
              Next <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// ── Ear Training module ────────────────────────────────────────────────────────
const EarTraining: React.FC<{ difficulty: Difficulty }> = ({ difficulty }) => {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [question, setQuestion] = useState<EarQuestion | null>(null);
  const [choices, setChoices] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [score, setScore] = useState(0);
  const [total, setTotal] = useState(0);
  const [playing, setPlaying] = useState(false);

  const getCtx = () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  };

  const newQuestion = useCallback(() => {
    setSelected(null);
    const q = generateQuestion(difficulty);
    setQuestion(q);
    setChoices(getChoices(q, difficulty));
  }, [difficulty]);

  useEffect(() => { newQuestion(); }, [newQuestion]);

  const playQuestion = async () => {
    if (!question || playing) return;
    setPlaying(true);
    const ctx = getCtx();
    if (ctx.state === 'suspended') await ctx.resume();
    if (question.type === 'note') playNote(ctx, question.midi, 2);
    else if (question.type === 'interval') {
      playNote(ctx, question.midis[0], 1.2);
      setTimeout(() => playNote(ctx, question.midis[1], 1.2), 700);
    } else {
      playChord(ctx, question.midis, 2);
    }
    setTimeout(() => setPlaying(false), 2200);
  };

  const handleAnswer = (choice: string) => {
    if (selected || !question) return;
    setSelected(choice);
    setTotal(t => t + 1);
    if (choice === question.label) {
      setScore(s => s + 1);
      setStreak(s => s + 1);
    } else {
      setStreak(0);
    }
  };

  const typeLabel = question?.type === 'note' ? 'What note is this?' : question?.type === 'interval' ? 'What interval is this?' : 'What chord quality is this?';

  return (
    <div className="flex flex-col gap-6">
      {/* Score */}
      <div className="flex items-center gap-4">
        <div className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4 text-center">
          <p className="text-2xl font-black text-white">{score}/{total}</p>
          <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Score</p>
        </div>
        <div className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4 text-center">
          <p className="text-2xl font-black text-amber-400">{streak}</p>
          <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Streak</p>
        </div>
      </div>

      {/* Question area */}
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-[1.5rem] p-6 flex flex-col items-center gap-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-white/40">{typeLabel}</p>

        <button
          onClick={playQuestion}
          disabled={playing}
          className={`w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-lg ${playing ? 'bg-purple-600 scale-95' : 'bg-purple-600 hover:bg-purple-500 hover:scale-105'}`}
        >
          {playing ? <Volume2 size={28} className="animate-pulse" /> : <Play size={28} fill="white" />}
        </button>
        <p className="text-xs text-white/40">{playing ? 'Playing…' : 'Tap to listen'}</p>

        {question?.type === 'note' && selected && (
          <MiniKeyboard highlightMidis={question.type === 'note' ? [question.midi] : []} />
        )}
      </div>

      {/* Choices */}
      <div className="grid grid-cols-2 gap-3">
        {choices.map(choice => {
          const isCorrect = question?.label === choice;
          const isSelected = selected === choice;
          let style = 'bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08]';
          if (isSelected && isCorrect) style = 'bg-green-600/30 border border-green-500/60';
          else if (isSelected && !isCorrect) style = 'bg-red-600/30 border border-red-500/60';
          else if (selected && isCorrect) style = 'bg-green-600/20 border border-green-500/40';
          return (
            <button
              key={choice}
              onClick={() => handleAnswer(choice)}
              disabled={!!selected}
              className={`${style} rounded-2xl px-4 py-4 text-sm font-bold text-white transition-all`}
            >
              {choice}
              {selected && isCorrect && <Check size={14} className="inline ml-2 text-green-400" />}
              {isSelected && !isCorrect && <X size={14} className="inline ml-2 text-red-400" />}
            </button>
          );
        })}
      </div>

      {selected && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={newQuestion}
          className="flex items-center justify-center gap-2 py-3 bg-purple-600 hover:bg-purple-500 rounded-2xl text-xs font-black uppercase tracking-widest transition-all"
        >
          <RefreshCw size={13} /> Next Question
        </motion.button>
      )}
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────
const DIFF_CONFIG: Record<Difficulty, { label: string; color: string; description: string }> = {
  NOVICE: { label: 'Novice', color: 'from-green-600 to-emerald-500', description: 'Notes, rhythm, and major scales' },
  INTERMEDIATE: { label: 'Intermediate', color: 'from-blue-600 to-cyan-500', description: 'Intervals, chords, and keys' },
  MAESTRO: { label: 'Maestro', color: 'from-purple-700 to-violet-500', description: 'Modes, counterpoint, and analysis' },
};

const MusicTheoryStudio: React.FC<Props> = ({ onBack, user }) => {
  const [tab, setTab] = useState<Tab>('LESSONS');
  const [difficulty, setDifficulty] = useState<Difficulty>('NOVICE');
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('plajah_theory_completed') || '[]')); }
    catch { return new Set(); }
  });

  const markComplete = (id: string) => {
    setCompletedIds(prev => {
      const next = new Set(prev).add(id);
      localStorage.setItem('plajah_theory_completed', JSON.stringify([...next]));
      return next;
    });
    // Record it on the Learner Ledger too (signed-in only). The standards live in
    // data/educationStandards.ts under NCAS_MUSIC, keyed THEORY.<lesson id>.
    const uid = user?.uid;
    if (uid) {
      void (async () => {
        try {
          const { appendRecord, loadProficiency } = await import('../services/learningLedgerService');
          const standardId = `THEORY.${id}`;
          const prof = await loadProficiency(uid);
          const before = prof?.byStandard?.[standardId] ?? 0;
          const after = Math.round(Math.min(100, before + (82 - before) * 0.6) * 100) / 100;
          if (after <= before) return;
          await appendRecord({
            studentId: uid, standardId, framework: 'NCAS_MUSIC', source: 'school-lesson',
            masteryBefore: before, masteryAfter: after, byUid: uid,
            evidence: 'Music Theory Studio — completed the lesson',
          });
        } catch { /* the ledger is additive; never block the lesson */ }
      })();
    }
  };

  const lessons = LESSONS.filter(l => l.difficulty === difficulty);
  const diff = DIFF_CONFIG[difficulty];

  const tabs = [
    { id: 'LESSONS' as Tab, label: 'Lessons', icon: BookOpen },
    { id: 'EAR_TRAINING' as Tab, label: 'Ear Training', icon: Headphones },
    { id: 'SCORE_READER' as Tab, label: 'Score Reader', icon: Music2 },
  ];

  return (
    <div className="min-h-screen bg-black/60 backdrop-blur-sm text-white">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-black/60 backdrop-blur-xl border-b border-white/5 px-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onBack} className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-all">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-base font-black text-white">Music Theory Studio</h1>
            <p className="text-[9px] text-white/40 font-black uppercase tracking-widest">Chora — Learn Music</p>
          </div>
        </div>

        {/* Difficulty selector */}
        <div className="flex gap-2 mb-3 overflow-x-auto custom-scrollbar pb-1">
          {(Object.keys(DIFF_CONFIG) as Difficulty[]).map(d => (
            <button
              key={d}
              onClick={() => setDifficulty(d)}
              className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${difficulty === d ? `bg-gradient-to-r ${DIFF_CONFIG[d].color} text-white shadow-lg` : 'bg-white/5 text-white/50 hover:bg-white/10'}`}
            >
              {d === 'MAESTRO' && <Star size={10} />}
              {DIFF_CONFIG[d].label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-white/40 pl-1">{diff.description}</p>

        {/* Tab bar */}
        <div className="flex gap-1 mt-3 border-b border-white/5 pb-1">
          {tabs.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-[9px] font-black uppercase tracking-widest rounded-t-lg transition-all ${tab === t.id ? 'text-purple-400 border-b-2 border-purple-400' : 'text-white/40 hover:text-white/70'}`}
              >
                <Icon size={12} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4">
        {tab === 'LESSONS' && (
          <div className="flex flex-col gap-4 pt-2">
            {lessons.length === 0 ? (
              <div className="text-center py-20 text-white/30">
                <Music2 size={40} className="mx-auto mb-4 opacity-30" />
                <p className="text-sm font-black uppercase tracking-widest">More lessons coming soon</p>
              </div>
            ) : lessons.map(lesson => {
              const done = completedIds.has(lesson.id);
              return (
                <motion.button
                  key={lesson.id}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => setSelectedLesson(lesson)}
                  className="w-full text-left flex items-center gap-4 p-5 bg-white/[0.04] border border-white/[0.08] rounded-[1.5rem] hover:border-purple-500/40 transition-all"
                >
                  <span className="text-3xl shrink-0">{lesson.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-black text-white truncate">{lesson.title}</h3>
                      {done && <div className="shrink-0 w-5 h-5 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center"><Check size={10} className="text-green-400" /></div>}
                    </div>
                    <p className="text-xs text-white/50">{lesson.subtitle}</p>
                    <p className="text-[9px] text-white/30 mt-1 font-black uppercase tracking-widest">{lesson.duration} · {lesson.content.length} sections</p>
                  </div>
                  <ChevronRight size={16} className="text-white/30 shrink-0" />
                </motion.button>
              );
            })}
          </div>
        )}

        {tab === 'EAR_TRAINING' && (
          <div className="pt-2">
            <div className="bg-purple-900/20 border border-purple-500/20 rounded-2xl p-4 mb-4">
              <p className="text-xs text-purple-300 font-bold">
                {difficulty === 'NOVICE' && 'Identify individual notes played on a simulated piano.'}
                {difficulty === 'INTERMEDIATE' && 'Identify melodic intervals — two notes played in sequence.'}
                {difficulty === 'MAESTRO' && 'Identify chord qualities — multiple notes played simultaneously.'}
              </p>
            </div>
            <EarTraining difficulty={difficulty} />
          </div>
        )}

        {tab === 'SCORE_READER' && (
          <div className="pt-2 flex flex-col gap-6">
            <div className="bg-white/[0.04] border border-white/[0.08] rounded-[1.5rem] p-6">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-1">Reading the Staff</p>
              <h3 className="text-lg font-black text-white mb-4">C Major Scale — Treble Clef</h3>
              <SimpleStaff notes={[60, 62, 64, 65, 67, 69, 71]} />
              <div className="flex justify-between px-2 mt-2">
                {['C', 'D', 'E', 'F', 'G', 'A', 'B'].map(n => (
                  <span key={n} className="text-[10px] font-black text-white/40">{n}</span>
                ))}
              </div>
            </div>

            <div className="bg-white/[0.04] border border-white/[0.08] rounded-[1.5rem] p-6">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-4">Interactive Keyboard — tap a key to hear it</p>
              <MiniKeyboard onPress={(midi) => {
                const ctx = new AudioContext();
                playNote(ctx, midi, 1.5);
              }} />
              <p className="text-center text-[9px] text-white/20 mt-3">C4 — C5</p>
            </div>

            {difficulty !== 'NOVICE' && (
              <div className="bg-white/[0.04] border border-white/[0.08] rounded-[1.5rem] p-6">
                <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-1">Common chord shapes</p>
                <h3 className="font-black text-white mb-4">C Major vs. C Minor</h3>
                <div className="grid grid-cols-2 gap-4">
                  {[{ label: 'C Major', midis: [60, 64, 67] }, { label: 'C Minor', midis: [60, 63, 67] }].map(c => (
                    <div key={c.label} className="bg-black/20 rounded-xl p-3">
                      <p className="text-xs font-black text-white/60 mb-2">{c.label}</p>
                      <MiniKeyboard
                        highlightMidis={c.midis}
                        onPress={() => {
                          const ctx = new AudioContext();
                          playChord(ctx, c.midis, 1.5);
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lesson detail overlay */}
      <AnimatePresence>
        {selectedLesson && (
          <LessonDetail
            lesson={selectedLesson}
            onClose={() => {
              markComplete(selectedLesson.id);
              setSelectedLesson(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default MusicTheoryStudio;
