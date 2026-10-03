import type { CourseModule } from '../courseModule';
import type { Question } from '../types';

// Write the correct choice FIRST; the helper rotates the choices (keeping their cyclic order) so the
// correct answer lands on a spread-out index.
const mc = (l: string, n: number, level: 1 | 2 | 3, prompt: string, choices: string[], hint: string, explanation: string): Question => {
  const target = (parseInt(l.slice(l.lastIndexOf('.l') + 2), 10) * 3 + n * 5) % 4;
  const shift = target; // correct choice starts at index 0
  const rotated = choices.map((_, i) => choices[(i - shift + 4) % 4]);
  return { id: `${l}.q${n}`, lessonId: l, kind: 'mcq', prompt, choices: rotated, answer: target, hint, explanation, level };
};
const tf = (l: string, n: number, level: 1 | 2 | 3, prompt: string, answer: number, hint: string, explanation: string): Question =>
  ({ id: `${l}.q${n}`, lessonId: l, kind: 'tf', prompt, answer, hint, explanation, level });

const L01 = 'music-theory-secondary.l01';
const L02 = 'music-theory-secondary.l02';
const L03 = 'music-theory-secondary.l03';
const L04 = 'music-theory-secondary.l04';
const L05 = 'music-theory-secondary.l05';
const L06 = 'music-theory-secondary.l06';
const L07 = 'music-theory-secondary.l07';
const L08 = 'music-theory-secondary.l08';
const L09 = 'music-theory-secondary.l09';
const L10 = 'music-theory-secondary.l10';
const L11 = 'music-theory-secondary.l11';
const L12 = 'music-theory-secondary.l12';
const L13 = 'music-theory-secondary.l13';
const L14 = 'music-theory-secondary.l14';
const L15 = 'music-theory-secondary.l15';
const L16 = 'music-theory-secondary.l16';
const L17 = 'music-theory-secondary.l17';
const L18 = 'music-theory-secondary.l18';
const L19 = 'music-theory-secondary.l19';
const L20 = 'music-theory-secondary.l20';
const L21 = 'music-theory-secondary.l21';
const L22 = 'music-theory-secondary.l22';
const L23 = 'music-theory-secondary.l23';
const L24 = 'music-theory-secondary.l24';

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'music-theory-secondary',
    label: 'Music Theory (Grades 6-12)',
    blurb: 'An AP-level path through scales, keys, intervals, chords, harmony, voice leading, form, rhythm and practical skills such as lead sheets and transposition, bridging up to college theory.',
    accent: '#FFD24A',
    framework: 'ncas',
    tracks: [
      {
        id: 'music-theory-secondary.t1',
        title: 'Scales, Keys and Modes',
        blurb: 'Major and minor scales, key signatures, the circle of fifths and the seven modes.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L01,
            title: 'Major Scales and Key Signatures',
            blurb: 'Every major scale follows whole-whole-half-whole-whole-whole-half, and the sharps or flats it needs form its key signature.',
            minutes: 8,
            body: `A major scale is built from the step pattern whole, whole, half, whole, whole, whole, half. Because the pattern is the same from any starting note, each of the twelve major scales needs a particular set of sharps or flats. Writing them once at the start of each staff, instead of beside every note, gives the key signature.

Sharps always appear in the order F, C, G, D, A, E, B. Flats appear in the reverse order: B, E, A, D, G, C, F. The major keys with sharps are G (one sharp), D (two), A (three), E (four), B (five), F-sharp (six) and C-sharp (seven). The major keys with flats are F (one flat), B-flat (two), E-flat (three), A-flat (four), D-flat (five), G-flat (six) and C-flat (seven). C major has no sharps or flats.

Two shortcuts help you read signatures quickly. In a sharp key, the last sharp in the signature is the leading tone, the seventh note of the scale, so the tonic is one half step above it. Four sharps ending on D-sharp therefore means E major. In a flat key with two or more flats, the second-to-last flat names the key. Three flats, B-flat, E-flat and A-flat, put the second-to-last flat on E-flat, so the key is E-flat major. F major, with one flat, is simply memorized.

Scale degrees have names too: tonic, supertonic, mediant, subdominant, dominant, submediant and leading tone.`,
          },
          {
            id: L02,
            title: 'Minor Scales and Their Relatives',
            blurb: 'Natural, harmonic and melodic minor, plus the relative and parallel relationships between major and minor keys.',
            minutes: 8,
            body: `Natural minor is the major scale started on its sixth degree. Starting on A and using only white keys gives A natural minor: A, B, C, D, E, F, G. A minor and C major therefore share a key signature, and are called relative keys. The relative minor of any major key begins a minor third (three semitones) below its tonic, so the relative minor of E-flat major is C minor.

Keys that share a tonic but not a signature are parallel keys. C major and C minor are parallel; C minor has three flats, B-flat, E-flat and A-flat.

The natural minor has a whole step between its seventh degree and the tonic, so it lacks a leading tone. Composers fix this by raising the seventh degree. The result is the harmonic minor scale. In A harmonic minor the notes are A, B, C, D, E, F, G-sharp. This creates an augmented second between F and G-sharp, which can sound awkward in a melody.

The melodic minor avoids that leap. Going up, both the sixth and seventh degrees are raised: A, B, C, D, E, F-sharp, G-sharp, A. Coming down, the usual practice is to return to natural minor: A, G, F, E, D, C, B, A.

The raised seventh degree is not in the key signature, so it appears as an accidental whenever the leading tone is needed, especially in the dominant chord.`,
          },
          {
            id: L03,
            title: 'The Circle of Fifths',
            blurb: 'Keys arranged by perfect fifths show how signatures grow by one sharp or flat at each step and where relative keys sit.',
            minutes: 7,
            body: `The circle of fifths arranges the twelve keys so that each neighbor is a perfect fifth apart. Start at C major at the top. Moving clockwise by a fifth gives G, D, A, E, B and F-sharp, and each step adds one sharp to the key signature. Moving counterclockwise by a fifth, which is the same as up a fourth, gives F, B-flat, E-flat, A-flat and D-flat, each adding one flat.

The circle closes at the bottom, where keys overlap. B major (five sharps) is enharmonic with C-flat major (seven flats), F-sharp major (six sharps) with G-flat major (six flats), and D-flat major (five flats) with C-sharp major (seven sharps). These pairs sound identical on a piano but are spelled differently.

Minor keys sit on an inner ring, each beside its relative major. A minor sits under C, E minor under G with one sharp, and B minor under D with two. Going the other way, D minor has one flat, G minor two flats and C minor three.

The circle also reveals closely related keys. A key and its two neighbors on the circle, plus their relative minors, differ by at most one accidental. Many harmonic progressions follow it too: chords whose roots descend by fifth, such as ii, V, I, are among the most common in tonal music.`,
          },
          {
            id: L04,
            title: 'The Seven Modes',
            blurb: 'Each mode is a scale built on a different degree of the major scale, and each has a characteristic altered note.',
            minutes: 8,
            body: `A mode is a scale that uses the same notes as a major scale but treats a different note as home. Starting the white-key scale on each of its seven notes gives the seven modes: Ionian on C (the major scale), Dorian on D, Phrygian on E, Lydian on F, Mixolydian on G, Aeolian on A (natural minor) and Locrian on B.

The easiest way to hear the differences is to compare each mode with the major or minor scale that shares its tonic. Lydian is major with a raised fourth degree. Mixolydian is major with a lowered seventh degree. Dorian is natural minor with a raised sixth degree. Phrygian is natural minor with a lowered second degree. Locrian is natural minor with a lowered second and lowered fifth, so the chord on its tonic is diminished.

Starting a mode on a different tonic keeps its pattern. C Mixolydian is C, D, E, F, G, A, B-flat, and C Lydian is C, D, E, F-sharp, G, A, B. D Dorian is D, E, F, G, A, B, C, the white keys from D to D.

Modes appear in many repertoires: Dorian and Mixolydian are common in folk, rock and jazz, and Lydian is frequent in film music. Identifying the characteristic note, the one that differs from major or natural minor, is the quickest way to name a mode by ear or by eye.`,
          },
        ],
      },
      {
        id: 'music-theory-secondary.t2',
        title: 'Intervals and Chords',
        blurb: 'Naming distances precisely, then stacking them into triads and seventh chords labeled with Roman numerals and figured bass.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L05,
            title: 'Interval Quality and Inversion',
            blurb: 'An interval has a number from counting letter names and a quality from counting semitones.',
            minutes: 8,
            body: `An interval's number comes from counting letter names, including both the starting and ending notes. C up to E spans C, D, E, so it is some kind of third. The quality then comes from the exact number of semitones.

Unisons, fourths, fifths and octaves are called perfect when they match the major scale above the lower note. Seconds, thirds, sixths and sevenths are major when they match the major scale and minor when they are one semitone smaller. The semitone counts are: minor second 1, major second 2, minor third 3, major third 4, perfect fourth 5, perfect fifth 7, minor sixth 8, major sixth 9, minor seventh 10, major seventh 11 and perfect octave 12.

Qualities can be pushed further. Shrinking a perfect or minor interval by a semitone makes it diminished. Enlarging a perfect or major interval by a semitone makes it augmented. The tritone, six semitones, is spelled as an augmented fourth (C to F-sharp) or a diminished fifth (C to G-flat), and the spelling matters.

To invert an interval, move the lower note up an octave. The two numbers always add to nine, major becomes minor, minor becomes major, perfect stays perfect, and augmented becomes diminished. A major third inverts to a minor sixth, and a perfect fourth inverts to a perfect fifth. Intervals larger than an octave are compound, so a ninth is an octave plus a second.`,
          },
          {
            id: L06,
            title: 'Triads and Their Inversions',
            blurb: 'A triad stacks two thirds above a root; its quality and which note is in the bass define the chord.',
            minutes: 8,
            body: `A triad has three notes: a root, a third above it and a fifth above it. Four qualities exist. A major triad is a major third plus a minor third (C, E, G). A minor triad reverses them (C, E-flat, G). A diminished triad stacks two minor thirds (C, E-flat, G-flat), and an augmented triad stacks two major thirds (C, E, G-sharp).

Building a triad on each degree of the major scale gives a fixed pattern of qualities: I major, ii minor, iii minor, IV major, V major, vi minor and vii diminished. In C major, that is C, Dm, Em, F, G, Am and B diminished. In harmonic minor the pattern is i minor, ii diminished, III augmented, iv minor, V major, VI major and vii diminished.

Inversion describes which chord member is lowest. Root position has the root in the bass, with the third and fifth above it. In first inversion the third is in the bass, so C, E, G becomes E, G, C. In second inversion the fifth is in the bass: G, C, E. The upper notes can be arranged in any order, and only the bass note determines the inversion.

Inversions change the stability of the sound. Root position is the most stable, first inversion is softer, and second inversion, with a fourth above the bass, tends to need resolution.`,
          },
          {
            id: L07,
            title: 'Seventh Chords',
            blurb: 'Adding a third above a triad creates seventh chords, each with a distinct quality and set of inversions.',
            minutes: 8,
            body: `A seventh chord adds another third on top of a triad, so its notes are the root, third, fifth and seventh. Five qualities are standard. A major seventh chord is a major triad plus a major seventh (C, E, G, B). A dominant seventh chord is a major triad plus a minor seventh (C, E, G, B-flat). A minor seventh chord is a minor triad plus a minor seventh (C, E-flat, G, B-flat). A half-diminished seventh chord is a diminished triad plus a minor seventh (C, E-flat, G-flat, B-flat). A fully diminished seventh chord is a diminished triad plus a diminished seventh (C, E-flat, G-flat, B-double-flat, which sounds the same as A).

Built on each degree of a major scale, the sevenths give I major seventh, ii minor seventh, iii minor seventh, IV major seventh, V dominant seventh, vi minor seventh and vii half-diminished seventh. In C major the chord on G is G, B, D, F, and the chord on B is B, D, F, A.

The dominant seventh is the only one to occur on the fifth degree of a major scale, which is why it points so strongly to the tonic. Its third and seventh form a tritone that wants to resolve: the third rises and the seventh falls.

Because there are four notes, there are four positions: root position, first inversion, second inversion and third inversion, with the root, third, fifth or seventh in the bass respectively.`,
          },
          {
            id: L08,
            title: 'Roman Numerals and Figured Bass',
            blurb: 'Two notation systems label chords by function and inversion rather than by absolute pitch.',
            minutes: 8,
            body: `Roman numerals label a chord by the scale degree of its root, so the analysis stays the same in any key. Uppercase numerals mean major triads and lowercase mean minor. A small circle after a numeral means diminished, as in the vii chord, and a plus sign means augmented. In C major, the chord G, B, D is V, and the chord D, F, A is ii. In A minor, E, G-sharp, B is V and the chord A, C, E is i.

Figured bass is a Baroque shorthand: numbers written below a bass note show the intervals above it. No number means a root-position triad. A 6 (short for 6/3) means a first-inversion triad, and 6/4 means a second-inversion triad. For seventh chords, 7 is root position, 6/5 is first inversion, 4/3 is second inversion and 4/2 is third inversion.

Roman numerals use the same figures to show inversion. In C major, V6 is G, B, D with B in the bass, and I6/4 is a C major triad with G in the bass. V4/2 is a dominant seventh with F in the bass, and V7 is G, B, D, F with G in the bass.

The two systems answer different questions. The numeral says what the chord is and what it does in the key. The figure says which note is lowest. Together they give a complete harmonic analysis.`,
          },
        ],
      },
      {
        id: 'music-theory-secondary.t3',
        title: 'Rhythm, Melody and the Ear',
        blurb: 'Meter, syncopation, hemiola, how melodies are organized into phrases, and the core concepts of ear training.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L09,
            title: 'Simple and Compound Meter',
            blurb: 'Meter is classified by how many beats are in a measure and whether each beat divides into two or three.',
            minutes: 7,
            body: `Meter has two parts. The first is the number of beats in a measure: two is duple, three is triple and four is quadruple. The second is how each beat divides. In simple meter each beat divides into two equal parts. In compound meter each beat divides into three.

Common simple meters are 2/4, 3/4 and 4/4. In these the top number is the beat count and the bottom number is the note value that gets the beat. A measure of 3/4 has three quarter-note beats, and each can be split into two eighth notes, so it is simple triple.

Compound meters are usually written with the eighth note as the lower number, but the beat is a dotted note. In 6/8 the beat is a dotted quarter note, which equals three eighth notes, so there are two beats per measure and the meter is compound duple. In 9/8 there are three dotted-quarter beats, which is compound triple. In 12/8 there are four, which is compound quadruple.

This is why 6/8 feels different from 3/4 even though both contain six eighth notes per measure. In 3/4 they group as 2 + 2 + 2, in 6/8 as 3 + 3.

To recognize meter, look at the top number: 2, 3 and 4 signal simple meter with that many beats, while 6, 9 and 12 signal compound meter, with the beat count being a third of the number.`,
          },
          {
            id: L10,
            title: 'Syncopation, Hemiola and Irregular Divisions',
            blurb: 'Composers play against the meter by displacing accents or by regrouping beats.',
            minutes: 7,
            body: `Syncopation places emphasis where the meter does not expect it. A note might begin on a weak beat or on the offbeat, the upbeat half of a beat, and be sustained through the next strong beat, or be tied over a barline. The ear senses a conflict between the pulse that continues and the accent that has moved. Syncopation is a feature of jazz, Latin styles, funk and ragtime, and it also occurs in many classical works.

A hemiola is a regrouping of beats. In its classic form, two measures of 3/4 are felt as three groups of two beats, so the accents fall as if the music were in 3/2 and not 3/4. The same idea works in compound meter, where a measure of 6/8 felt as two groups of three can be heard as three groups of two. Baroque and Classical composers often used a hemiola to slow down just before a cadence.

Beats can also be divided in unusual ways. A triplet fits three notes into the time normally taken by two of the same value in simple meter. A duplet does the opposite in compound meter, fitting two notes into the time of three. A dot after a note lengthens it by half, so a dotted quarter lasts three eighths.

An anacrusis, or pickup, is one or more notes before the first full measure, which is why a piece may begin with a short, unaccented opening.`,
          },
          {
            id: L11,
            title: 'Melody and Phrase Structure: Period and Sentence',
            blurb: 'Melodies are organized into phrases, and two classic designs are the period and the sentence.',
            minutes: 8,
            body: `A melody is shaped by its contour, the rise and fall of pitches, and by how it moves. Motion by step is conjunct, and motion by leap is disjunct. A short musical idea is a motive, and repeating a motive or pattern at a new pitch level is a sequence. Melodies are divided into phrases, which end with a cadence, the way a spoken sentence ends with punctuation. A phrase is often four measures long, though this varies.

A period is a pair of phrases. The first, the antecedent, ends with a weaker cadence, usually a half cadence. The second, the consequent, ends with a stronger one, usually a perfect authentic cadence. If both phrases begin with the same or very similar material, it is a parallel period. If the second phrase begins differently, it is a contrasting period.

A sentence is built differently. It begins with a presentation: a basic idea, then a repeat or close variant of it. The continuation follows, and it usually shortens the material into smaller fragments, speeds up the harmonic rhythm and drives toward a cadence. In a typical eight-measure sentence, the idea takes two measures, its repetition two, and the continuation the last four.

The period feels like a question and answer. The sentence feels like a statement that grows in energy. Recognizing them helps with analysis and with writing your own melodies.`,
          },
          {
            id: L12,
            title: 'Ear Training Concepts',
            blurb: 'Trained listening connects what you hear to scale degrees, intervals, chord qualities and cadences.',
            minutes: 7,
            body: `Ear training turns hearing into understanding. Most skills rest on relative pitch, which identifies notes by their relationship to a tonic or to another note, rather than by absolute pitch.

Solfege gives each scale degree a syllable. In movable-do, the tonic is always do, whatever the key: do, re, mi, fa, sol, la, ti, do. This keeps the focus on function. In fixed-do, the syllables stay tied to the same pitches, so C is always do. Courses and exams generally accept either system, so use the one your teacher uses. Each degree also has a tendency: the leading tone, ti, wants to rise to do, and fa tends to fall to mi.

Interval recognition improves with practice, and it helps to separate melodic intervals, where notes sound one after another, from harmonic intervals, where they sound together. Learners often connect each interval with a familiar melody they know well.

Chords can be identified by quality. Major triads usually sound bright and stable, minor triads darker, diminished triads tense and augmented triads unsettled. Hearing the bass line and the chord functions together gives a strong foundation for harmonic dictation.

Cadences are also heard rather than seen. A phrase ending on the dominant sounds unfinished, an authentic cadence sounds closed, and a deceptive cadence sounds like a surprise.

For dictation, listen first for meter and overall shape, then write rhythm, then pitches, then check against the key.`,
          },
        ],
      },
      {
        id: 'music-theory-secondary.t4',
        title: 'Harmonic Function and Voice Leading',
        blurb: 'How chords behave in a key, how phrases close, non-chord tones and the conventions of four-part writing.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L13,
            title: 'Diatonic Function: Tonic, Predominant, Dominant',
            blurb: 'Chords fall into three functional groups that give tonal music its sense of direction.',
            minutes: 8,
            body: `In tonal music, chords do more than sound pleasant; they play roles. The three main functions are tonic, predominant and dominant, abbreviated T, PD and D.

Tonic function is stability and arrival. The I chord is the clearest example, and vi and iii can substitute for it because each shares two notes with I. Predominant function is movement away from home and preparation for the dominant. The ii and IV chords are the usual predominants. Dominant function creates tension that demands resolution. The V chord, and the leading-tone chord vii with a diminished triad, are dominants because they contain the leading tone.

The central pattern is T, PD, D, T. In C major it could be I, ii, V, I, or I, IV, V, I. A longer chain often passes through vi, as in I, vi, ii, V, I. These progressions move mostly by descending fifths, which is why they sound so natural.

Going backward, such as from V to IV, is called a retrogression and is usually avoided in common-practice style, though it appears in pop and rock.

In V7 to I in C major, G, B, D, F resolves to C, E, G. The tritone B and F resolves by step: B goes up to C and F goes down to E. Knowing function lets you decide what chord should come next, not merely what it is called.`,
          },
          {
            id: L14,
            title: 'Cadences',
            blurb: 'Cadences are the harmonic punctuation marks at the ends of phrases, each with a different strength.',
            minutes: 7,
            body: `A cadence is a harmonic formula that closes a phrase. Five types are commonly taught.

A perfect authentic cadence (PAC) moves from V or V7 to I, with both chords in root position and the tonic note in the highest voice at the end. It is the strongest and most conclusive close. An imperfect authentic cadence (IAC) also moves from V to I but loses one of those conditions: either chord may be inverted, or the soprano may end on a note other than the tonic. A cadence from the leading-tone chord in first inversion to I is also imperfect.

A half cadence (HC) ends on V, whatever came before it. It sounds like a comma or a question and calls for continuation. A common example is I, ii, V in a first phrase. In minor keys, a Phrygian half cadence is the specific progression iv6 to V, in which the bass moves down by a half step from the sixth degree to the fifth.

A plagal cadence (PC) moves from IV to I, the progression often sung as the "Amen" at the end of hymns. It is gentle rather than driving because it lacks a leading tone.

A deceptive cadence (DC) moves from V to vi in a major key. It begins like an authentic cadence, then avoids the expected tonic. The listener hears surprise, and the phrase usually continues to a stronger close.`,
          },
          {
            id: L15,
            title: 'Non-Chord Tones',
            blurb: 'Notes that do not belong to the underlying chord add motion and expression, and each has a standard approach and resolution.',
            minutes: 8,
            body: `Melodies rarely use only chord tones. Non-chord tones (NCTs) are notes that are not in the chord sounding at that moment, and they are classified by how they are approached and left.

A passing tone moves by step between two different chord tones, filling in the gap. Over a G chord, D to C to B uses C as a passing tone. A neighbor tone steps away from a chord tone and returns to the same note; it can be an upper or a lower neighbor.

A suspension is prepared by a chord tone, then held while the harmony changes so it becomes dissonant, and finally resolves down by step. Common types are 4-3, 7-6 and 9-8 above the bass, and 2-3 when the bass is suspended. A retardation is similar, but it resolves upward by step. An anticipation arrives early, sounding a note of the next chord before the harmony changes.

An appoggiatura is approached by leap and resolved by step, usually in the opposite direction, and falls on a strong beat. An escape tone is approached by step and left by leap in the opposite direction. A pedal point is a sustained or repeated note, usually in the bass, that stays while the chords above it change.

Labeling NCTs helps separate melody from harmony when analyzing a score.`,
          },
          {
            id: L16,
            title: 'Four-Part Voice Leading',
            blurb: 'Writing for soprano, alto, tenor and bass follows conventions that keep each line independent and smooth.',
            minutes: 8,
            body: `Four-part writing, called SATB after soprano, alto, tenor and bass, is the model for harmony study. The aim is for each voice to be a good melody on its own while the four together form clear chords.

Spacing matters. Adjacent upper voices (soprano and alto, alto and tenor) should be within an octave of each other. The tenor and bass may be farther apart. Voices should not cross, so the alto should not go above the soprano, and they should not overlap, where a voice moves past the previous position of a neighboring voice.

In a root-position triad, double the root, which is the most stable choice. The leading tone should not be doubled because it has a strong tendency to rise to the tonic. In a seventh chord, the seventh is not doubled.

Voices should move smoothly. Keep common tones when two chords share a note, and move the other voices by the smallest possible step. Contrary motion between the soprano and bass makes the outer voices independent.

Parallel perfect fifths and parallel octaves between any two voices are forbidden, because they make the voices sound as if they merge into one. Hidden fifths and octaves, reached by similar motion to a perfect interval in the outer voices, are generally avoided too.

Tendency tones resolve in predictable ways: the leading tone rises to the tonic, and the seventh of a seventh chord falls by step.`,
          },
        ],
      },
      {
        id: 'music-theory-secondary.t5',
        title: 'Chromatic Harmony and Form',
        blurb: 'Borrowing chords from other keys, changing key, and the large-scale forms that organize whole movements.',
        level: 'ADVANCED',
        lessons: [
          {
            id: L17,
            title: 'Secondary Dominants',
            blurb: 'A secondary dominant is the dominant of a chord other than tonic, adding a brief pull toward that chord.',
            minutes: 8,
            body: `A secondary dominant is a chord that acts as the dominant of a scale degree other than the tonic. It is a major triad or dominant seventh whose root is a perfect fifth above the target chord, so it needs at least one accidental that does not belong to the home key.

The notation shows the relationship: V/V is read "five of five," the dominant of the dominant. In C major, the target is G, so its dominant is D, F-sharp, A, written V/V, or D, F-sharp, A, C as V7/V. The F-sharp is the accidental, and it acts as a temporary leading tone to G. V7/V normally resolves to V, and this move is very common before a half cadence.

Other examples in C major are V7/vi, which is E, G-sharp, B, D resolving to A minor; V7/ii, which is A, C-sharp, E, G resolving to D minor; V7/IV, which is C, E, G, B-flat resolving to F; and V7/iii, which is B, D-sharp, F-sharp, A resolving to E minor. A diminished version also exists: vii-diminished of V in C major is F-sharp, A, C.

Because the target chord is only briefly emphasized, this is called tonicization. The key does not truly change. A tonicization lasts a chord or two, while a modulation establishes a new key through a cadence.

V/vii is not used because the diminished triad on vii is too unstable to be tonicized.`,
          },
          {
            id: L18,
            title: 'Modulation to Closely Related Keys',
            blurb: 'A modulation is a real change of key, usually to one whose signature differs by at most one accidental.',
            minutes: 8,
            body: `Modulation is a change of tonic that is confirmed by a cadence in the new key. It differs from tonicization, which only briefly emphasizes a chord.

Closely related keys have key signatures that differ by no more than one sharp or flat. From a major key, they are the keys on the major scale degrees ii, iii, IV, V and vi: from C major, these are D minor, E minor, F major, G major and A minor. From a minor key, the closely related keys are the relative major (III), the minor dominant (v), the minor subdominant (iv), VI and VII. The most common destinations are V in a major-key piece and the relative major in a minor-key piece.

The most common method is the pivot chord modulation. A pivot chord is a chord that is diatonic in both the old and new keys, and the music reinterprets it. From C major to G major, the A minor triad is vi in C and ii in G. A typical path plays I and vi in C, hears vi as ii in G, and then continues with V7 and I in G. Another method is direct modulation, where the new key simply begins, often after a pause. A third is common-tone modulation, which uses a shared note.

Listeners can notice a modulation when an accidental such as F-sharp appears and keeps returning, and a confirming cadence is heard in the new key.

Learning to find the pivot chord and the first sign of the new key is central to analyzing a modulating passage.`,
          },
          {
            id: L19,
            title: 'Binary, Ternary and Rondo Forms',
            blurb: 'These forms are described by letters showing which sections return and which are new.',
            minutes: 7,
            body: `Musical form is the plan of a piece, and it is traditionally shown with letters. A letter stands for a section, and a repeated letter means returning material.

Binary form has two sections, A and B. Both sections are often repeated. In a Baroque dance in a major key, the A section usually moves away from the tonic and ends in the dominant key, and the B section returns to the tonic. In a minor key, the first section often ends in the relative major. If the opening material comes back near the end of B, the form is rounded binary, which is written A, B, A'.

Ternary form has three sections, A, B, A. The middle section contrasts in key, character or texture, and the last section returns to the opening. Unlike rounded binary, ternary form has a complete, closed first section that can stand on its own. A minuet and trio is a larger example, where the minuet returns after the trio.

Rondo form brings back a main theme, the refrain, between contrasting episodes. The simplest patterns are A, B, A, C, A, called five-part rondo, and A, B, A, C, A, B, A, called seven-part rondo. The refrain is typically in the tonic, and the episodes explore other keys.

Theme and variations is another common form, in which a theme is restated with changes each time.`,
          },
          {
            id: L20,
            title: 'Sonata Form',
            blurb: 'A three-part plan of exposition, development and recapitulation built on key contrast and its resolution.',
            minutes: 8,
            body: `Sonata form is a large-scale design often used for first movements of Classical symphonies, sonatas and string quartets. It has three main sections.

In the exposition, the first theme is stated in the tonic. A transition then leads away from it, usually modulating, and a second theme arrives in a contrasting key. In a major-key movement the second key is normally the dominant, and in a minor-key movement it is normally the relative major. The exposition ends with a closing section that confirms the new key, and it is often repeated.

The development is the middle section. It takes material from the exposition, such as a motive or theme, and treats it freely. It passes through several keys, uses sequences and fragmentation, and typically ends on a dominant chord that prepares the return.

In the recapitulation, the first theme returns in the tonic, as in the exposition. The second theme, which was in a contrasting key before, now also appears in the tonic. This resolves the key conflict that drove the whole movement.

Some movements add a slow introduction at the start or a coda at the end, an extra closing passage after the recapitulation.

The central idea is tension and resolution across the whole piece: the contrasting key is introduced in the exposition and resolved in the recapitulation.`,
          },
        ],
      },
      {
        id: 'music-theory-secondary.t6',
        title: 'Popular Music and Practical Skills',
        blurb: 'Jazz harmony, common pop progressions, lead sheets and writing for orchestral instruments.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L21,
            title: 'Introduction to Jazz Chords',
            blurb: 'Jazz harmony extends seventh chords upward and relies on the ii-V-I progression.',
            minutes: 8,
            body: `Jazz harmony builds on the seventh chords you already know and names them with chord symbols. Cmaj7 is C, E, G, B. C7 is the dominant seventh, C, E, G, B-flat. Cm7 is C, E-flat, G, B-flat. A half-diminished chord is written Cm7(b5) or with a slashed circle, and a fully diminished seventh chord is Cdim7 or a plain circle with a 7. A C6 chord adds the sixth degree, A, to a major triad.

Extensions continue stacking thirds above the seventh: the ninth, eleventh and thirteenth. A C9 chord is C, E, G, B-flat, D. The extra notes color the chord without changing its function, and players often leave out the fifth, or even the root, because they are less important than the third and seventh. These two notes are called guide tones, since they define the chord's quality.

The most important progression is the ii-V-I. In C major it is Dm7, G7, Cmaj7. The roots fall by fifths, and the guide tones move by half step: the seventh of Dm7, C, falls to the third of G7, B, and the seventh of G7, F, falls to the third of Cmaj7, E.

A tritone substitution replaces a dominant seventh with the dominant seventh a tritone away. D-flat 7 replaces G7 because both share the same tritone: G7 has B and F, while D-flat 7 has F and C-flat, which is spelled B enharmonically.`,
          },
          {
            id: L22,
            title: 'Pop Progressions and the 12-Bar Blues',
            blurb: 'A handful of chord patterns underlie a huge amount of popular music.',
            minutes: 7,
            body: `Popular music often relies on short, repeating chord loops. The best known is I, V, vi, IV, which in C major is C, G, Am, F. It is often rotated to start on a different chord: vi, IV, I, V gives Am, F, C, G, and the same four chords appear in many songs in different orders. Another pattern, I, vi, IV, V (C, Am, F, G in C major), is sometimes called the doo-wop or "50s" progression.

These loops use only diatonic triads, so a song can be transposed easily by using Roman numerals. The numeral pattern stays the same, and the letter names change with the key.

The 12-bar blues is a fixed form lasting twelve measures. Its usual layout uses three chords: I for four bars, IV for two bars, I for two bars, V for one bar, IV for one bar, and I for two bars. In C, this is C for bars 1 to 4, F for bars 5 and 6, C for bars 7 and 8, G for bar 9, F for bar 10, and C for bars 11 and 12. In many blues, bar 12 uses V instead of I as a turnaround that leads back to the start. In blues, each chord is often played as a dominant seventh, such as C7, F7 and G7.

The melody uses the blues scale, which is C, E-flat, F, G-flat, G, B-flat in C. The lowered third, fifth and seventh are called blue notes.`,
          },
          {
            id: L23,
            title: 'Reading Lead Sheets',
            blurb: 'A lead sheet gives just the melody, lyrics and chord symbols, leaving players to supply the accompaniment.',
            minutes: 7,
            body: `A lead sheet is a compact score. It shows the melody on a single staff, chord symbols above it, and lyrics underneath if there are any. Unlike a fully notated piano score, it leaves the accompaniment to the performer, who decides how to voice the chords and what rhythm to play. This is how most jazz standards and pop songs are shared.

Chord symbols give a root letter, followed by the quality and any extensions. A plain letter is a major triad. A small m or a minus sign means minor, so Am is A, C, E. The number 7 alone means a dominant seventh, maj7 means a major seventh, and m7 means a minor seventh, so Am7 is A, C, E, G. A plus sign is augmented, and a small circle is diminished. A number such as 9 adds extensions, and alterations like b5 or #9 are written in parentheses.

A slash chord names a bass note after the slash. C/E means a C major chord with E in the bass, which is the same as a first-inversion C major triad. G/B is G major with B in the bass.

Roadmap signs save space. Repeat signs and numbered endings (1st and 2nd endings) direct the player back and onward. D.C. al Fine means return to the beginning and play until the word Fine. D.S. al Coda means go back to the sign, play until the coda instruction, and jump to the coda.

The Nashville number system, which writes chords as numbers, works like Roman numerals and makes transposition easy.`,
          },
          {
            id: L24,
            title: 'Orchestration Basics and Transposing Instruments',
            blurb: 'The orchestra has four families, and some instruments sound at a different pitch than written.',
            minutes: 8,
            body: `The orchestra has four main families. Strings include violin, viola, cello and double bass. Woodwinds include flute, oboe, clarinet and bassoon. Brass includes trumpet, horn, trombone and tuba. Percussion includes timpani and many others. In a full score, the families are normally stacked from top to bottom as woodwinds, brass, percussion and strings. Choosing which instruments play which line, and in which register, is orchestration.

Concert pitch is the actual sounding pitch. Transposing instruments are written at a different pitch from the one they sound, so players of different instruments can use the same fingerings. A B-flat clarinet or B-flat trumpet sounds a major second lower than written, so a written C sounds as B-flat. An A clarinet sounds a minor third lower. A horn in F sounds a perfect fifth lower. An E-flat alto saxophone sounds a major sixth lower, and a B-flat tenor saxophone sounds a major ninth lower.

Some instruments transpose only by octave. The piccolo sounds an octave higher than written, and the double bass and guitar sound an octave lower. Flute, oboe, bassoon, violin, cello and trombone are written at concert pitch, and the viola reads alto clef.

To write a concert-pitch melody for a B-flat instrument, transpose it up a major second, and adjust the key signature. A concert melody in C major becomes D major for a B-flat trumpet.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'music-theory-secondary',
    questions: [
      // L01
      tf(L01, 1, 1, 'The key signature of G major has one sharp, F-sharp.', 0, 'Sharps appear in the order F, C, G, D, A, E, B.', 'G major has one sharp, F-sharp, which makes the step from E to the seventh degree a whole step.'),
      mc(L01, 2, 1, 'How many flats are in the key signature of F major?', ['One (B-flat)', 'Two', 'None', 'Three'], 'F major is the first flat key.', 'F major has one flat, B-flat.'),
      mc(L01, 3, 2, 'Which major key has three sharps (F-sharp, C-sharp, G-sharp)?', ['A major', 'E major', 'D major', 'B major'], 'The last sharp is the leading tone; the key is a half step above it.', 'The last sharp, G-sharp, is the leading tone of A, so the key is A major.'),
      mc(L01, 4, 2, 'What is the key signature of E-flat major?', ['Three flats: B-flat, E-flat, A-flat', 'Two flats: B-flat, E-flat', 'Four flats', 'Three sharps'], 'Flats are added in the order B, E, A, D, G, C, F.', 'E-flat major has three flats, B-flat, E-flat and A-flat; the second-to-last flat names the key.'),
      mc(L01, 5, 3, 'A signature has the sharps F-sharp, C-sharp, G-sharp and D-sharp. Which major key is it?', ['E major', 'D major', 'F-sharp major', 'B major'], 'Find the last sharp, then go up a half step.', 'The last sharp, D-sharp, is the leading tone, so the tonic is E.'),
      // L02
      tf(L02, 1, 1, 'A minor is the relative minor of C major.', 0, 'Relative keys share a key signature.', 'Both keys have no sharps or flats, and A is the sixth degree of C major.'),
      mc(L02, 2, 1, 'Which minor key shares a key signature with E-flat major?', ['C minor', 'E-flat minor', 'G minor', 'F minor'], 'Go down a minor third from the major tonic.', 'C minor is the relative minor of E-flat major; both have three flats.'),
      mc(L02, 3, 2, 'Compared with natural minor, which scale degree is raised in the harmonic minor scale?', ['The seventh', 'The sixth', 'The third', 'The fourth'], 'It creates a leading tone.', 'Raising the seventh degree gives the leading tone needed for a dominant chord.'),
      mc(L02, 4, 2, 'In ascending A melodic minor, which notes are raised compared with natural minor?', ['F-sharp and G-sharp', 'Only G-sharp', 'Only F-sharp', 'B and C'], 'Two degrees change going up.', 'Ascending melodic minor raises the sixth and seventh degrees: F to F-sharp and G to G-sharp.'),
      tf(L02, 5, 3, 'The parallel minor of D major is B minor.', 1, 'Parallel keys share a tonic.', 'The parallel minor is D minor; B minor is the relative minor.'),
      // L03
      tf(L03, 1, 1, 'Moving clockwise on the circle of fifths from C to G to D adds one sharp at each step.', 0, 'Each step is up a perfect fifth.', 'C has none, G has one sharp, and D has two.'),
      mc(L03, 2, 1, 'Which major key is a perfect fifth above C major on the circle of fifths?', ['G major', 'F major', 'D major', 'A major'], 'Count up five letter names from C.', 'G is a perfect fifth above C, and it has one sharp.'),
      mc(L03, 3, 2, 'Which major key sits one step counterclockwise from F major?', ['B-flat major', 'C major', 'E-flat major', 'G major'], 'Counterclockwise adds flats.', 'B-flat major has two flats, one more than F major.'),
      mc(L03, 4, 2, 'Which pair of major keys is enharmonic?', ['B major and C-flat major', 'C major and D major', 'F major and G major', 'A major and A-flat major'], 'They sound the same but are spelled differently.', 'B major has five sharps and C-flat major has seven flats; they sound identical.'),
      mc(L03, 5, 3, 'Which minor key has a key signature of two flats?', ['G minor', 'D minor', 'C minor', 'F minor'], 'Find the relative major first.', 'G minor is the relative minor of B-flat major, which has two flats.'),
      // L04
      mc(L04, 1, 1, 'Which mode uses the white keys from D to D?', ['Dorian', 'Phrygian', 'Lydian', 'Mixolydian'], 'It is the second mode.', 'The white-key scale starting on D is D Dorian.'),
      tf(L04, 2, 1, 'Lydian is a major scale with a raised fourth degree.', 0, 'Compare F Lydian with F major.', 'F Lydian has B natural where F major has B-flat; the fourth degree is raised.'),
      mc(L04, 3, 2, 'Which mode differs from the major scale only by a lowered seventh degree?', ['Mixolydian', 'Dorian', 'Lydian', 'Phrygian'], 'Think of C, D, E, F, G, A, B-flat.', 'Mixolydian is major with a lowered seventh.'),
      mc(L04, 4, 2, 'Which mode uses the white keys from E to E, with the characteristic half step above the tonic?', ['Phrygian', 'Dorian', 'Aeolian', 'Locrian'], 'The second degree is lowered.', 'E Phrygian has F natural, a half step above E.'),
      mc(L04, 5, 3, 'In Locrian mode, what is the interval from the tonic to the fifth degree?', ['A diminished fifth', 'A perfect fifth', 'An augmented fifth', 'A major sixth'], 'Think B to F.', 'B Locrian has F natural, a diminished fifth above B, so the tonic triad is diminished.'),
      // L05
      mc(L05, 1, 1, 'What is the interval from C up to E?', ['A major third', 'A minor third', 'A perfect fourth', 'A major second'], 'It spans four semitones.', 'C to E is four semitones across three letter names, a major third.'),
      mc(L05, 2, 1, 'How many semitones are in a perfect fifth?', ['Seven', 'Six', 'Five', 'Eight'], 'C to G.', 'A perfect fifth contains seven semitones.'),
      tf(L05, 3, 2, 'A minor sixth inverts to a major third.', 0, 'The numbers add to nine, and minor becomes major.', 'Inversion changes minor to major and a sixth to a third.'),
      mc(L05, 4, 2, 'What is the interval from C up to F-sharp?', ['An augmented fourth', 'A diminished fifth', 'A perfect fourth', 'A perfect fifth'], 'Count letter names first: C, D, E, F.', 'The letters span a fourth, and F-sharp is a semitone larger than a perfect fourth, so it is augmented.'),
      mc(L05, 5, 3, 'What is the interval from E up to B-flat?', ['A diminished fifth', 'A perfect fifth', 'An augmented fourth', 'A minor sixth'], 'Letters E to B span a fifth.', 'E to B is a perfect fifth, and B-flat is a semitone smaller, so the interval is a diminished fifth.'),
      // L06
      mc(L06, 1, 1, 'Which notes make a G major triad?', ['G, B, D', 'G, B-flat, D', 'G, B, D-sharp', 'G, C, D'], 'Root, major third, perfect fifth.', 'A G major triad is G, B, D.'),
      tf(L06, 2, 1, 'A diminished triad is made of two stacked minor thirds.', 0, 'Compare C, E-flat, G-flat.', 'C to E-flat and E-flat to G-flat are both minor thirds.'),
      mc(L06, 3, 2, 'Which notes make a D minor triad?', ['D, F, A', 'D, F-sharp, A', 'D, F, A-flat', 'D, E, A'], 'Minor third, then major third.', 'D minor is D, F, A.'),
      mc(L06, 4, 2, 'The notes C, E, G are played with E in the bass. What is the chord position?', ['First inversion', 'Root position', 'Second inversion', 'Third inversion'], 'The third is in the bass.', 'A triad with its third in the bass is in first inversion.'),
      mc(L06, 5, 3, 'Which triad quality is built on the seventh degree of a major scale?', ['Diminished', 'Augmented', 'Minor', 'Major'], 'In C major, the chord is B, D, F.', 'B to D is a minor third and D to F is a minor third, so it is diminished.'),
      // L07
      mc(L07, 1, 1, 'Which notes make a G dominant seventh chord?', ['G, B, D, F', 'G, B, D, F-sharp', 'G, B-flat, D, F', 'G, B, D, A'], 'Major triad plus minor seventh.', 'G7 is G, B, D, F.'),
      tf(L07, 2, 1, 'A dominant seventh chord is a major triad with a minor seventh above the root.', 0, 'Think C, E, G, B-flat.', 'This is the definition of a dominant seventh chord.'),
      mc(L07, 3, 2, 'In C major, the chord D, F, A, C has which quality?', ['Minor seventh', 'Dominant seventh', 'Major seventh', 'Half-diminished seventh'], 'D, F, A is a minor triad.', 'A minor triad plus a minor seventh (D to C) is a minor seventh chord, the ii7.'),
      mc(L07, 4, 2, 'In C major, what quality is the seventh chord B, D, F, A?', ['Half-diminished seventh', 'Fully diminished seventh', 'Minor seventh', 'Major seventh'], 'B, D, F is diminished; A is a minor seventh above B.', 'A diminished triad plus a minor seventh is half-diminished.'),
      mc(L07, 5, 3, 'Which spells a half-diminished seventh chord on C?', ['C, E-flat, G-flat, B-flat', 'C, E-flat, G-flat, A', 'C, E, G, B-flat', 'C, E-flat, G, B-flat'], 'Diminished triad plus minor seventh.', 'C, E-flat, G-flat is diminished, and B-flat is a minor seventh above C.'),
      // L08
      mc(L08, 1, 1, 'Which Roman numeral labels the chord G-B-D-F in C major?', ['V7', 'ii7', 'IV7', 'viiø7'], 'G is the fifth degree.', 'G, B, D, F is a dominant seventh on scale degree five, V7.'),
      tf(L08, 2, 1, 'In Roman numeral analysis, uppercase numerals indicate major triads and lowercase indicate minor triads.', 0, 'Compare IV and iv.', 'This is the standard convention.'),
      mc(L08, 3, 2, 'What does the figured bass 6/5 indicate?', ['A seventh chord in first inversion', 'A triad in second inversion', 'A root-position seventh chord', 'A seventh chord in third inversion'], 'It is a seventh chord figure with the third in the bass.', 'The figures 6/5 mean a seventh chord with its third in the bass.'),
      mc(L08, 4, 2, 'In C major, which label fits the chord G-B-D with B in the bass?', ['V6', 'V6/4', 'V7', 'III6'], 'A first-inversion triad is labeled 6.', 'A dominant triad with its third in the bass is V6.'),
      mc(L08, 5, 3, 'In A minor with a raised leading tone, how is the chord E-G-sharp-B labeled?', ['V', 'v', 'III', 'vii-diminished'], 'It is a major triad on the fifth degree.', 'E, G-sharp, B is a major triad on E, the fifth degree, so it is V.'),
      // L09
      mc(L09, 1, 1, 'Which time signature is a compound meter?', ['6/8', '2/4', '3/4', '4/4'], 'The beat divides into three.', '6/8 has a dotted-quarter beat that divides into three eighths.'),
      tf(L09, 2, 1, 'In 6/8 the beat is normally felt as two dotted-quarter pulses per measure.', 0, 'Group the six eighths in threes.', 'The usual grouping is 3 + 3, giving two beats.'),
      mc(L09, 3, 2, 'How is 12/8 classified?', ['Compound quadruple', 'Simple quadruple', 'Compound triple', 'Simple duple'], 'Four dotted-quarter beats.', '12/8 has four beats, each dividing into three, so it is compound quadruple.'),
      mc(L09, 4, 2, 'Which note value usually gets the beat in 6/8?', ['The dotted quarter', 'The eighth', 'The quarter', 'The dotted half'], 'It equals three eighth notes.', 'In compound meter the beat is a dotted note, here a dotted quarter.'),
      mc(L09, 5, 3, 'How is 3/4 classified?', ['Simple triple', 'Compound duple', 'Simple duple', 'Compound triple'], 'Three beats, each divides into two.', 'It has three beats that each divide into two, so it is simple triple.'),
      // L10
      mc(L10, 1, 1, 'What best describes syncopation?', ['Emphasis on weak beats or offbeats', 'A gradual slowing of tempo', 'A change of key', 'A repeated bass note'], 'It goes against the expected accents.', 'Syncopation places accents where the meter does not normally put them.'),
      tf(L10, 2, 1, 'A hemiola superimposes groups of two beats on a meter normally felt in groups of three.', 0, 'Think of 3/4 felt like 3/2.', 'Two measures of 3/4 can be felt as three groups of two beats.'),
      mc(L10, 3, 2, 'In simple meter, a triplet fits three notes into the time normally taken by how many notes of the same value?', ['Two', 'Four', 'Three', 'Five'], 'Triplets are written with a 3.', 'Triplets compress three notes into the space of two.'),
      mc(L10, 4, 2, 'Two measures of 3/4 are accented as if they were three measures of 2/4. What is this called?', ['Hemiola', 'Anacrusis', 'Duplet', 'Fermata'], 'Baroque composers used it near cadences.', 'This regrouping is a hemiola.'),
      mc(L10, 5, 3, 'Which combination fills exactly one measure of 6/8?', ['Dotted quarter plus dotted quarter', 'Quarter plus dotted quarter', 'Dotted half plus eighth', 'Half note plus eighth note'], 'Count in eighth notes; six are needed.', 'A dotted quarter is three eighths, so two of them make six.'),
      // L11
      mc(L11, 1, 1, 'A period consists of which two phrases?', ['An antecedent and a consequent', 'A presentation and a continuation', 'A motive and a sequence', 'An exposition and a development'], 'One asks, one answers.', 'A period pairs an antecedent phrase with a consequent phrase.'),
      tf(L11, 2, 1, 'In a period, the antecedent phrase typically ends with a weaker cadence, often a half cadence.', 0, 'The consequent gives the stronger close.', 'The antecedent ends open and the consequent closes more strongly.'),
      mc(L11, 3, 2, 'What follows the presentation in a sentence?', ['A continuation that often fragments the material and drives to a cadence', 'A second antecedent', 'A modulation to the parallel key', 'A return of the opening idea unchanged'], 'It increases energy.', 'The continuation typically uses fragmentation and leads to a cadence.'),
      mc(L11, 4, 2, 'Melodic motion by step is called what?', ['Conjunct', 'Disjunct', 'Sequential', 'Syncopated'], 'The opposite of leaping.', 'Stepwise motion is conjunct, and leaping motion is disjunct.'),
      mc(L11, 5, 3, 'What defines a parallel period?', ['Both phrases begin with the same or similar material', 'Both phrases end with half cadences', 'The consequent comes first', 'The phrases are in different meters'], 'Compare the openings of the two phrases.', 'In a parallel period the consequent begins like the antecedent.'),
      // L12
      mc(L12, 1, 1, 'In movable-do solfege, which syllable always names the tonic?', ['Do', 'Sol', 'Re', 'La'], 'It does not change with the key.', 'Movable do assigns do to the tonic of whatever key is in use.'),
      tf(L12, 2, 1, 'The leading tone has a tendency to rise to the tonic.', 0, 'It is a half step below do.', 'The seventh degree resolves upward by half step to the tonic.'),
      mc(L12, 3, 2, 'Which scale degree is called sol in solfege?', ['The fifth', 'The fourth', 'The third', 'The sixth'], 'Do, re, mi, fa, sol.', 'Sol is the fifth degree, the dominant.'),
      mc(L12, 4, 2, 'A phrase ends on the V chord and sounds unfinished. Which cadence is it?', ['A half cadence', 'A perfect authentic cadence', 'A plagal cadence', 'An imperfect authentic cadence'], 'It ends on the dominant.', 'A phrase that ends on V is a half cadence.'),
      mc(L12, 5, 3, 'Two pitches sounded at the same time form which kind of interval?', ['A harmonic interval', 'A melodic interval', 'A chromatic interval', 'An enharmonic interval'], 'Contrast with notes played in succession.', 'Simultaneous notes form a harmonic interval, successive notes a melodic one.'),
      // L13
      mc(L13, 1, 1, 'What is the harmonic function of the V chord?', ['Dominant', 'Tonic', 'Predominant', 'Subdominant substitute'], 'It creates tension.', 'V is the main dominant chord and resolves to tonic.'),
      tf(L13, 2, 1, 'The ii chord normally has predominant function.', 0, 'It leads to V.', 'ii is a standard predominant chord.'),
      mc(L13, 3, 2, 'Which progression follows the T-PD-D-T pattern?', ['I, ii, V, I', 'I, V, ii, I', 'ii, I, V, IV', 'V, I, IV, ii'], 'Predominant comes before dominant.', 'I is tonic, ii predominant, V dominant, and I tonic again.'),
      mc(L13, 4, 2, 'Which chord can substitute for I as a tonic-function chord?', ['vi', 'IV', 'ii', 'V'], 'It shares two notes with I.', 'vi shares two notes with I, so it can have tonic function.'),
      mc(L13, 5, 3, 'In a V7 to I resolution in C major, to which notes do the tritone B and F typically resolve?', ['C and E', 'A and G', 'C and D', 'B and E'], 'The leading tone rises; the seventh falls.', 'B rises to C and F falls to E.'),
      // L14
      mc(L14, 1, 1, 'Which cadence moves from V to I, both in root position, with the tonic in the soprano?', ['Perfect authentic', 'Imperfect authentic', 'Plagal', 'Half'], 'It is the strongest close.', 'This is the definition of a perfect authentic cadence.'),
      tf(L14, 2, 1, 'A half cadence ends on the V chord.', 0, 'Think of a comma.', 'A half cadence ends on V, whatever chord precedes it.'),
      mc(L14, 3, 2, 'Which cadence moves from V to vi?', ['Deceptive', 'Plagal', 'Half', 'Perfect authentic'], 'The listener expects tonic.', 'V to vi is a deceptive cadence.'),
      mc(L14, 4, 2, 'Which cadence moves from IV to I?', ['Plagal', 'Deceptive', 'Half', 'Imperfect authentic'], 'It is the "Amen" cadence.', 'IV to I is a plagal cadence.'),
      mc(L14, 5, 3, 'What distinguishes an imperfect authentic cadence from a perfect one?', ['A chord is inverted or the soprano does not end on the tonic', 'It ends on V', 'It moves from IV to I', 'It moves from V to vi'], 'Both are V to I.', 'An IAC loses root-position chords or the tonic in the soprano.'),
      // L15
      mc(L15, 1, 1, 'Which non-chord tone is defined as moving by step from one chord tone to a different chord tone?', ['Passing tone', 'Neighbor tone', 'Anticipation', 'Escape tone'], 'It passes through.', 'A passing tone connects two different chord tones by step.'),
      tf(L15, 2, 1, 'A neighbor tone steps away from a chord tone and returns to the same note.', 0, 'It returns where it started.', 'This is the definition of a neighbor tone.'),
      mc(L15, 3, 2, 'How does a suspension typically resolve?', ['Down by step', 'Up by step', 'Down by leap', 'It stays on the same note'], 'It is prepared, held, then resolves.', 'A suspension resolves downward by step; one that resolves upward is a retardation.'),
      mc(L15, 4, 2, 'Which non-chord tone sounds a note of the next chord before the harmony changes?', ['Anticipation', 'Suspension', 'Pedal point', 'Appoggiatura'], 'It arrives early.', 'An anticipation arrives early.'),
      mc(L15, 5, 3, 'Over a G major chord, a melody moves D, C, B. How is C labeled?', ['Passing tone', 'Lower neighbor', 'Suspension', 'Anticipation'], 'It sits between D and B.', 'C connects the chord tones D and B by step, so it is a passing tone.'),
      // L16
      tf(L16, 1, 1, 'Parallel perfect fifths between two voices are avoided in common-practice voice leading.', 0, 'They weaken voice independence.', 'Parallel fifths and octaves merge two voices into one.'),
      mc(L16, 2, 1, 'Which chord member is usually doubled in a root-position triad?', ['The root', 'The third', 'The leading tone', 'The seventh'], 'It is the most stable choice.', 'Doubling the root is standard.'),
      mc(L16, 3, 2, 'Adjacent upper voices (soprano-alto and alto-tenor) should be no more than how far apart?', ['An octave', 'A fifth', 'Two octaves', 'A tenth'], 'The tenor and bass can be wider.', 'Close spacing keeps the upper three voices within an octave of each neighbor.'),
      mc(L16, 4, 2, 'How does the seventh of a V7 chord normally resolve?', ['Down by step', 'Up by step', 'Up by leap', 'It always stays'], 'F in G7 goes to E in C.', 'The chordal seventh resolves down by step.'),
      tf(L16, 5, 3, 'Doubling the leading tone is generally avoided.', 0, 'It has a strong tendency.', 'Both doubled leading tones would need to rise to the tonic, producing parallel octaves.'),
      // L17
      mc(L17, 1, 1, 'In C major, which triad is V/V?', ['D major (D, F-sharp, A)', 'D minor', 'G major', 'A major'], 'Find the dominant of G.', 'The dominant of G is D, and a major triad on D is D, F-sharp, A.'),
      tf(L17, 2, 1, 'A secondary dominant is the dominant of a scale degree other than the tonic.', 0, 'The target is not I.', 'This is the definition.'),
      mc(L17, 3, 2, 'Which spells V7/V in C major?', ['D, F-sharp, A, C', 'D, F, A, C', 'D, F-sharp, A, C-sharp', 'G, B, D, F'], 'Dominant seventh on D.', 'A dominant seventh on D is D, F-sharp, A, C.'),
      mc(L17, 4, 2, 'In C major, which chord is V7/vi?', ['E7', 'A7', 'B7', 'D7'], 'vi is A minor.', 'The dominant of A is E, so V7/vi is E, G-sharp, B, D.'),
      mc(L17, 5, 3, 'In G major, which chord is V7/V?', ['A7', 'D7', 'E7', 'C7'], 'The dominant of G is D.', 'The dominant of D is A, so V7/V is A, C-sharp, E, G.'),
      // L18
      mc(L18, 1, 1, 'Which of the following is a closely related key to C major?', ['G major', 'F-sharp major', 'D-flat major', 'E major'], 'Its signature differs by one accidental.', 'G major has one sharp, one more than C major.'),
      tf(L18, 2, 1, 'A pivot chord is diatonic in both the old key and the new key.', 0, 'It has two meanings.', 'The pivot is reinterpreted between the keys.'),
      mc(L18, 3, 2, 'In a modulation from C major to G major, A minor is a pivot chord. What is it in each key?', ['vi in C and ii in G', 'vi in C and iv in G', 'iii in C and I in G', 'ii in C and vi in G'], 'Count scale degrees in each key.', 'In G major, A is the second degree, so A minor is ii.'),
      mc(L18, 4, 2, 'A piece in A minor typically modulates to which key?', ['C major', 'E-flat major', 'F-sharp minor', 'B-flat major'], 'The relative major is common.', 'The relative major, here C major, is the most common destination.'),
      mc(L18, 5, 3, 'Which key is NOT closely related to D major?', ['E-flat major', 'B minor', 'A major', 'G major'], 'Compare the number of accidentals.', 'E-flat major has three flats while D major has two sharps, so the signatures differ by five.'),
      // L19
      mc(L19, 1, 1, 'Which letter pattern describes ternary form?', ['A, B, A', 'A, A, B', 'A, B', 'A, B, C, D'], 'It has three sections.', 'Ternary form returns to A after a contrasting B.'),
      tf(L19, 2, 1, 'A rondo features a refrain that returns between contrasting episodes.', 0, 'The main theme returns.', 'This is the defining trait of rondo form.'),
      mc(L19, 3, 2, 'Which letter pattern is a five-part rondo?', ['A, B, A, C, A', 'A, A, B, B', 'A, B, C, D, E', 'A, B, B, A'], 'The refrain appears three times.', 'The refrain A returns between episodes B and C.'),
      mc(L19, 4, 2, 'What makes a binary form rounded?', ['The opening material returns near the end of the B section', 'It has three unrelated sections', 'Both sections are repeated', 'The A section never returns'], 'It is A, B, A-prime.', 'Rounded binary brings back the opening material within the second section.'),
      mc(L19, 5, 3, 'In a Baroque binary form in a major key, the first section typically ends in which key?', ['The dominant', 'The subdominant', 'The tonic only', 'The parallel minor'], 'It moves away from the home key.', 'The first section usually moves to the dominant key.'),
      // L20
      mc(L20, 1, 1, 'What is the order of the three main sonata form sections?', ['Exposition, development, recapitulation', 'Development, exposition, recapitulation', 'Exposition, recapitulation, development', 'Introduction, rondo, coda'], 'Themes are presented first.', 'The three sections are exposition, development and recapitulation.'),
      tf(L20, 2, 1, 'In a major-key sonata exposition, the second theme is usually in the dominant key.', 0, 'Contrasting key.', 'The second theme normally appears in the dominant key.'),
      mc(L20, 3, 2, 'What happens in the development section?', ['Themes are developed through several keys', 'The first theme is restated in the tonic', 'A new rondo refrain is added', 'Only the tonic key is used'], 'It is the middle of the form.', 'The development takes up exposition material and modulates freely.'),
      mc(L20, 4, 2, 'In which key does the second theme usually appear in the recapitulation?', ['The tonic', 'The dominant', 'The relative minor', 'The subdominant'], 'It resolves the conflict.', 'The second theme returns in the tonic.'),
      mc(L20, 5, 3, 'In a minor-key sonata exposition, which key is usually the second key area?', ['The relative major', 'The parallel major', 'The subdominant minor', 'The leading-tone key'], 'It shares the key signature.', 'The relative major is the usual second key.'),
      // L21
      mc(L21, 1, 1, 'Which notes make a Cmaj7 chord?', ['C, E, G, B', 'C, E, G, B-flat', 'C, E-flat, G, B', 'C, E, G, A'], 'Major triad plus major seventh.', 'Cmaj7 is C, E, G, B.'),
      tf(L21, 2, 1, 'Dm7, G7, Cmaj7 is a ii-V-I progression in C major.', 0, 'Dm7 is on the second degree.', 'The roots are D, G and C, scale degrees 2, 5 and 1.'),
      mc(L21, 3, 2, 'Which notes make a C9 chord?', ['C, E, G, B-flat, D', 'C, E, G, B, D', 'C, E-flat, G, B-flat, D', 'C, E, G, A, D'], 'Dominant seventh plus a ninth.', 'C9 is C7 with a D added.'),
      mc(L21, 4, 2, 'Which chord is the usual tritone substitute for G7?', ['D-flat 7', 'A-flat 7', 'D7', 'F7'], 'A tritone from G is D-flat.', 'D-flat 7 is a tritone away from G7.'),
      mc(L21, 5, 3, 'Why can D-flat 7 replace G7?', ['They share the same tritone, B and F (spelled F and C-flat)', 'Both have the root C', 'Both are minor chords', 'They share all four notes'], 'Compare the third and seventh of each.', 'Both contain the same tritone, with one chord spelling B as C-flat.'),
      // L22
      mc(L22, 1, 1, 'In C major, which chords make up I, V, vi, IV?', ['C, G, Am, F', 'C, F, Am, G', 'C, Em, F, G', 'C, G, Dm, F'], 'Convert each numeral.', 'I is C, V is G, vi is Am and IV is F.'),
      tf(L22, 2, 1, 'The standard 12-bar blues uses the I, IV and V chords.', 0, 'Three chords.', 'The form is built from I, IV and V.'),
      mc(L22, 3, 2, 'In a 12-bar blues in C, which chord is usually played in bar 5?', ['F (IV)', 'G (V)', 'C (I)', 'D minor'], 'The second line begins with IV.', 'Bars 5 and 6 usually move to IV.'),
      mc(L22, 4, 2, 'Which spells the C blues scale?', ['C, E-flat, F, G-flat, G, B-flat', 'C, D, E, G, A', 'C, D, E-flat, F, G, A-flat, B-flat', 'C, E, G, B-flat, D'], 'It contains the lowered third, fifth and seventh.', 'The blues scale is 1, flat 3, 4, flat 5, 5, flat 7.'),
      mc(L22, 5, 3, 'Which chords make up vi, IV, I, V in C major?', ['Am, F, C, G', 'Am, G, C, F', 'Em, C, G, D', 'Dm, B-flat, F, C'], 'Convert each numeral.', 'vi is Am, IV is F, I is C and V is G.'),
      // L23
      mc(L23, 1, 1, 'Which of these appears on a lead sheet?', ['Melody, chord symbols and lyrics', 'Every instrument in the orchestra', 'Only the bass line', 'Only the drum part'], 'It is compact.', 'A lead sheet gives the melody, chord symbols and lyrics.'),
      tf(L23, 2, 1, 'The slash chord C/E means a C major chord with E in the bass.', 0, 'The note after the slash is the bass.', 'C/E is a first-inversion C chord.'),
      mc(L23, 3, 2, 'What does D.C. al Fine instruct a player to do?', ['Return to the beginning and play to the word Fine', 'Jump to the coda', 'Repeat the last measure', 'Skip to the next sign'], 'D.C. means "from the head".', 'It means go back to the beginning and play to Fine.'),
      mc(L23, 4, 2, 'Which notes make an Am7 chord?', ['A, C, E, G', 'A, C-sharp, E, G', 'A, C, E, G-sharp', 'A, C, E-flat, G'], 'Minor triad plus minor seventh.', 'Am7 is A, C, E, G.'),
      mc(L23, 5, 3, 'What does the symbol G/B mean?', ['G major with B in the bass', 'G major with D in the bass', 'B major with G in the bass', 'G minor with B in the bass'], 'It names a bass note.', 'G/B is G major in first inversion.'),
      // L24
      mc(L24, 1, 1, 'Which family includes the oboe, clarinet and bassoon?', ['Woodwinds', 'Brass', 'Strings', 'Percussion'], 'They use reeds.', 'These are woodwind instruments.'),
      tf(L24, 2, 1, 'Concert pitch is the actual sounding pitch.', 0, 'It is not the written pitch.', 'Concert pitch is the real sound produced.'),
      mc(L24, 3, 2, 'An E-flat alto saxophone sounds which interval below its written pitch?', ['A major sixth', 'A major second', 'A perfect fifth', 'A minor third'], 'A written C sounds as E-flat.', 'A written C sounds as the E-flat a major sixth below.'),
      mc(L24, 4, 2, 'Which instrument sounds an octave lower than written?', ['Double bass', 'Violin', 'Flute', 'Oboe'], 'It is the lowest string.', 'The double bass sounds an octave below its written pitch.'),
      mc(L24, 5, 3, 'A B-flat trumpet plays a written D. What concert pitch sounds?', ['C', 'B-flat', 'E', 'D'], 'It sounds a major second lower.', 'A major second below D is C.'),
    ],
  },
};
