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

const L01 = 'music-theory-college.l01';
const L02 = 'music-theory-college.l02';
const L03 = 'music-theory-college.l03';
const L04 = 'music-theory-college.l04';
const L05 = 'music-theory-college.l05';
const L06 = 'music-theory-college.l06';
const L07 = 'music-theory-college.l07';
const L08 = 'music-theory-college.l08';
const L09 = 'music-theory-college.l09';
const L10 = 'music-theory-college.l10';
const L11 = 'music-theory-college.l11';
const L12 = 'music-theory-college.l12';
const L13 = 'music-theory-college.l13';
const L14 = 'music-theory-college.l14';
const L15 = 'music-theory-college.l15';
const L16 = 'music-theory-college.l16';
const L17 = 'music-theory-college.l17';
const L18 = 'music-theory-college.l18';
const L19 = 'music-theory-college.l19';
const L20 = 'music-theory-college.l20';
const L21 = 'music-theory-college.l21';
const L22 = 'music-theory-college.l22';
const L23 = 'music-theory-college.l23';
const L24 = 'music-theory-college.l24';
const L25 = 'music-theory-college.l25';
const L26 = 'music-theory-college.l26';
const L27 = 'music-theory-college.l27';
const L28 = 'music-theory-college.l28';

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'music-theory-college',
    label: 'Music Theory (College)',
    blurb: 'An undergraduate theory sequence: species counterpoint and fugue, figured bass, common-practice harmony and chromaticism, sonata form, Schenkerian basics, late-Romantic and Impressionist language, set theory and serialism, jazz harmony, and how to analyze and write about music.',
    accent: '#FFD24A',
    framework: 'ncas',
    tracks: [
      {
        id: 'music-theory-college.t1',
        title: 'Counterpoint and Fugue',
        blurb: 'Species counterpoint, Renaissance modal polyphony and the Baroque fugue.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L01,
            title: 'First Species Counterpoint',
            blurb: 'Note against note: the foundation of strict two-voice writing.',
            minutes: 10,
            body: `Species counterpoint is a graded method for learning to write independent melodic lines. It is best known from Johann Joseph Fux's treatise Gradus ad Parnassum, which teaches in five stages, or species, each adding rhythmic complexity. In every exercise you write a new line against a given melody, the cantus firmus (fixed song), which is a slow, smooth line in whole notes.

In first species, each note of the counterpoint sounds against one note of the cantus firmus. Only consonances are allowed: the perfect unison, fifth and octave, plus major and minor thirds and sixths. In strict two-voice writing the perfect fourth is treated as a dissonance.

Strict rules govern how the lines move. Contrary motion, where one voice rises while the other falls, is preferred. Parallel perfect fifths and octaves are forbidden because they destroy the independence of the voices. Moving by similar motion into a perfect interval (a direct or hidden fifth or octave) is avoided. The exercise begins and ends on a perfect consonance, and unisons are normally used only at the start and end.

The cadence is fixed. If the counterpoint is above a cantus firmus in D Dorian that ends E then D, the penultimate note is C-sharp, a major sixth above E, which steps up to D to make an octave. A leading tone approached this way gives the final its sense of arrival.

These limits may seem artificial, but they train the ear to hear each line as a melody and every vertical sonority as a deliberate choice.`,
          },
          {
            id: L02,
            title: 'Species Two to Five',
            blurb: 'Adding rhythm: passing tones, suspensions and florid writing.',
            minutes: 10,
            body: `The remaining species add rhythmic variety while keeping the discipline of the first. Each introduces one new way of treating dissonance.

In second species, two notes in the counterpoint sound against each cantus firmus note. The strong beat, the first of each pair, must be consonant. The weak beat may be dissonant, but only as a passing tone, approached and left by step in the same direction.

Third species uses four notes against one. Passing tones remain the main source of dissonance, and the line gains a pattern called the cambiata or changing-note figure, in which a dissonance is left by a leap of a third. Melodic variety increases, but the strong beats stay consonant.

Fourth species is built on syncopation. A note is tied across the barline so that a dissonance may occur on the strong beat. It must be prepared as a consonance on the previous weak beat, held while the cantus firmus changes beneath it to make a dissonance, and then resolved by step down. Above the cantus firmus the classic suspensions are 7-6 and 4-3 (and 9-8); below it, the 2-3 appears. If the tie would form an unusable dissonance, the line breaks the syncopation and moves on.

Fifth species, or florid counterpoint, combines all four earlier species, plus eighth-note decoration, in a single melody. It is the closest the method comes to real composition, because the line must now balance rhythm, contour and dissonance treatment at once.`,
          },
          {
            id: L03,
            title: 'Renaissance Modal Polyphony',
            blurb: 'Modes, imitation and the smooth dissonance control of the Palestrina style.',
            minutes: 10,
            body: `Renaissance polyphony is organized by modes rather than major and minor keys. A mode is characterized by its final, the note on which it ends, and by its range. On the white keys, Dorian has the final D, Phrygian E, Lydian F and Mixolydian G. Each of these authentic modes has a plagal partner, whose range lies about a fourth lower while keeping the same final. Writers such as Glarean later recognized Aeolian and Ionian as well, bringing the total to twelve.

The style associated with Giovanni Pierluigi da Palestrina, whose Missa Papae Marcelli is a famous example, is the model for later species counterpoint. Several equal voices, often four to six, sing without instruments. Melodies move mostly by step, and a leap is usually followed by a step in the opposite direction. Voices enter in imitation, each taking up a motive in turn, so that the texture is a web of related lines rather than a melody with accompaniment.

Dissonance is carefully controlled. It appears as passing tones on weak beats, as neighbor tones, and as prepared suspensions on the strong beat that resolve down by step. At a cadence, singers customarily raise the note a step below the final to create a leading tone, as in the C-sharp in a Dorian cadence on D, a practice called musica ficta.

The sound is smooth, balanced and calm, because large leaps, abrupt rhythms and unprepared dissonances are rare. Studying this style teaches you to treat harmony as the result of independent, singable melodies.`,
          },
          {
            id: L04,
            title: 'Baroque Counterpoint and Fugue',
            blurb: 'Subject, answer, countersubject and the architecture of a fugue.',
            minutes: 11,
            body: `Baroque counterpoint is tonal: it is shaped by major and minor keys and functional harmony, not modes. Its central form is the fugue, a composition built on a short theme called the subject that is imitated by every voice.

A fugue begins with an exposition. The first voice states the subject alone in the tonic. The second voice enters with the answer, normally a transposition of the subject to the dominant, while the first voice continues with new material called the countersubject. Each remaining voice then enters in turn, alternating between tonic and dominant. An answer that is an exact transposition is a real answer. When the subject emphasizes the dominant, the answer is often adjusted slightly to stay in the home key, producing a tonal answer.

After the exposition come episodes, passages usually built from fragments of the subject or countersubject and often moving through sequences, that modulate. Between them are middle entries of the subject in related keys. Devices of intensification include stretto, in which entries overlap before the subject has finished, as well as augmentation, diminution and inversion. Invertible counterpoint lets the voices swap registers.

Johann Sebastian Bach is the supreme master. His Well-Tempered Clavier consists of two books, each with a prelude and fugue in every major and minor key, 24 pairs per book. His Art of Fugue explores a single subject through many techniques. Analyzing a fugue means mapping its entries, keys and episodes, and following how the subject changes.`,
          },
        ],
      },
      {
        id: 'music-theory-college.t2',
        title: 'Figured Bass and Common-Practice Harmony',
        blurb: 'Reading continuo, careful voice leading, cadences and tonicization.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L05,
            title: 'Figured Bass and Basso Continuo',
            blurb: 'Reading numbers below a bass line as chords.',
            minutes: 10,
            body: `In Baroque music the bass line was often written with numbers beneath the notes, a shorthand called figured bass. The player of a chord instrument, such as a harpsichord, organ or lute, supplied the chords, while a bass instrument such as a cello, viola da gamba or bassoon doubled the bass line. Together they formed the basso continuo, the harmonic foundation of ensemble music from the early 17th century onward. Realizing a figured bass in performance is a skill that mixes theory and improvisation.

The figures describe intervals above the bass note, counted by letter name and interpreted in the key signature. A bass note with no figure normally means a root-position triad, the same as 5/3. A 6 indicates a first-inversion triad (sixth and third above the bass), and 6/4 a second-inversion triad. For seventh chords, 7 means root position, 6/5 first inversion, 4/3 second inversion, and 4/2 (often written 2) third inversion.

Accidentals alter the pitches. A sharp, flat or natural alone beneath a note affects the third above the bass. A slash through a figure, or a plus sign, raises that interval. Dashes extend the figure over several notes.

For example, over a bass C with the figure 6/4, the upper notes are the sixth and fourth above C, which are A and F: an F major triad in second inversion. Realizing figures well means keeping the upper voices smooth, avoiding parallel fifths and octaves, and shaping the texture to fit the musical character. Roman numerals and inversion symbols in modern analysis are direct descendants of this system.`,
          },
          {
            id: L06,
            title: 'Voice Leading in Depth',
            blurb: 'Spacing, doubling, resolution and the rules of four-part writing.',
            minutes: 11,
            body: `Four-part writing, with soprano, alto, tenor and bass, is the standard laboratory for common-practice voice leading. The rules grow from the principle that each voice should be a singable, independent line while the chords stay clear.

Spacing matters. Adjacent upper voices (soprano and alto, alto and tenor) should be within an octave of each other, while the gap between tenor and bass may be larger. Voices should not cross, so that no lower voice rises above a higher one, and should not overlap, so that a voice does not move past the previous pitch of a neighboring voice.

Motion between chords follows several guidelines. Keep common tones in the same voice, and move other voices to the nearest available chord tone. Avoid parallel perfect fifths and octaves. Be wary of direct (hidden) fifths and octaves between the outer voices, which are reached by similar motion. Contrary motion between soprano and bass is the safest solution, and a good outer-voice framework makes the inner voices easier.

Doubling is chosen by function. In a root-position triad, the root is normally doubled. The leading tone is not doubled, because it is a strong tendency tone and doubling it leads to parallel octaves on resolution. Chordal sevenths are not doubled either.

Tendency tones resolve by habit. The leading tone rises to the tonic, and the chordal seventh falls by step, for example F to E in a G7 chord moving to C major. A complete V7 may resolve to an incomplete I with a tripled root, in order to keep the voices moving smoothly. Learning the rules and then understanding why they work is the point.`,
          },
          {
            id: L07,
            title: 'Cadences and Phrase Structure',
            blurb: 'How harmonies close phrases, and how phrases combine.',
            minutes: 10,
            body: `A cadence is a melodic and harmonic formula that closes a phrase. Common-practice theory distinguishes several types by the chords and by the sense of finality they create.

The perfect authentic cadence (PAC) is V or V7 moving to I, both chords in root position, with the tonic note in the soprano of the final chord. It sounds most conclusive. An imperfect authentic cadence (IAC) has the same harmony but weakens the effect through an inversion or a soprano that does not end on the tonic. A half cadence (HC) ends on V and feels like a comma. A deceptive cadence moves V to vi, substituting the submediant for the expected tonic. A plagal cadence is IV moving to I, the Amen cadence. In minor keys, a Phrygian half cadence, iv6 moving to V, has a bass that falls by a half step from the sixth to the fifth scale degree, like A-flat to G in C minor.

Cadences articulate larger structures. A period consists of two phrases: an antecedent that usually ends with a half cadence and a consequent that answers with an authentic cadence. A sentence has a different design: a presentation, in which a basic idea is stated and repeated, followed by a continuation, which fragments the material and drives to a cadence.

A cadence is often prepared by a predominant chord (ii, IV, or ii6) and a cadential 6/4, which is a tonic second inversion chord acting as a decoration of V. Understanding these formulas helps you hear where the music breathes.`,
          },
          {
            id: L08,
            title: 'Tonicization and Secondary Dominants',
            blurb: 'Briefly treating a diatonic chord as a temporary tonic.',
            minutes: 10,
            body: `Tonicization is the brief emphasis of a diatonic chord other than the tonic as if it were a temporary tonic. The usual tool is a secondary (applied) dominant, a dominant-function chord that is not in the home key's own diatonic set. The notation V/V is read "five of five", meaning the dominant of the dominant.

In C major, the dominant of G is D major. So V/V is D-F-sharp-A, and V7/V adds C: D-F-sharp-A-C. The F-sharp is the accidental that signals the tonicization of G. A secondary dominant resolves to its target chord, here V, just as a normal V resolves to I. Other examples in C major are V/ii (A-C-sharp-E, leading to D minor), V/vi (E-G-sharp-B, leading to A minor), V7/IV (C-E-G-B-flat, leading to F) and V7/vi (E-G-sharp-B-D).

A leading-tone chord may also be applied. For example, vii°7/V in C major is F-sharp, A, C and E-flat, resolving to G major. Because the leading-tone and secondary-dominant chords borrow a raised or lowered note, spotting those accidentals is the key to analysis.

Only chords that could stand as a tonic can be tonicized, namely major or minor triads. The diminished triad vii° is not tonicized in the usual sense, as its diminished fifth prevents it from sounding stable.

Tonicization differs from modulation in degree: a tonicization is short, often a chord or two, and the original key stays in force, whereas a modulation establishes a new key through a cadence and sustained harmonic confirmation. The boundary can be debated, so analysts use the length and the strength of the cadence as guides.`,
          },
        ],
      },
      {
        id: 'music-theory-college.t3',
        title: 'Modulation and Chromatic Harmony',
        blurb: 'Moving between keys and borrowing, altering and coloring chords.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L09,
            title: 'Modulation: Pivot, Common-Tone and Chromatic',
            blurb: 'Three principal routes from one key to another.',
            minutes: 11,
            body: `A modulation is a change of key that is confirmed by a cadence in the new key, as distinct from a brief tonicization. The ease of a modulation depends on how closely the two keys are related. Closely related keys differ by at most one accidental in their key signatures. To C major, the closely related keys are G major, F major and the minors A, E and D.

The most common method is pivot-chord modulation. A pivot chord is diatonic in both the old and the new key and is reinterpreted at the point of change. Moving from C major to G major, the A minor chord is vi in C and ii in G. The analyst labels it with two Roman numerals. After the pivot comes a predominant or dominant chord that confirms the new key, followed by a cadence.

In common-tone modulation, a pitch is held or restated between chords from keys that do not share a pivot chord. The shared note links the two sonorities, so that a bold harmonic change is smoothed. This technique is typical of Romantic music.

In chromatic modulation, a chord is altered by a chromatic inflection so that it can belong to the new key. A major triad on the tonic may be turned into a dominant seventh by adding a flat seventh, for example.

An enharmonic modulation reinterprets a chord by respelling its notes. The fully diminished seventh chord is a favorite because its symmetrical structure lets it be respelled to resolve into several different keys. A modulation without any preparation, one phrase ending and the next beginning in the new key, is called a phrase modulation.`,
          },
          {
            id: L10,
            title: 'Mixed-Mode Borrowing',
            blurb: 'Chords borrowed from the parallel minor to color a major key.',
            minutes: 9,
            body: `Modal mixture, or mode mixture, is the use of chords from the parallel mode, which is the key with the same tonic but opposite quality. In C major, the parallel minor is C minor, so the lowered third, sixth and seventh scale degrees (E-flat, A-flat and B-flat) can be borrowed. This is a different relationship from the relative key, which shares a key signature but not a tonic.

Chords from the parallel minor are labeled with accidentals before the Roman numeral. In C major the borrowed chords include the minor tonic, ii° (D-F-A-flat), the minor subdominant iv (F-A-flat-C), the lowered mediant ♭III (E-flat-G-B-flat), the lowered submediant ♭VI (A-flat-C-E-flat) and the lowered seventh ♭VII (B-flat-D-F). Of these, iv and ♭VI are the most common in the Classical and Romantic repertoire, and they darken a phrase just before the cadence.

The effect is one of sudden shadow. A major-key piece may shift to a minor iv chord before returning to the bright tonic, which gives a poignant bittersweet color. The reverse also occurs. A piece in a minor key may end on a major tonic triad, which is the Picardy third, a historical device inherited from modal practice.

Mixture can be heard in many Classical-era and Romantic pieces by Beethoven, Schubert and Brahms. Analytically, a borrowed chord must be distinguished from a secondary dominant: a borrowed chord uses the notes of the parallel minor, while an applied dominant comes from a different key's dominant. Spotting the lowered 6̂ and 3̂ in a major-key passage is an easy first signal of mixture.`,
          },
          {
            id: L11,
            title: 'The Neapolitan Chord',
            blurb: 'The lowered second degree as a colorful predominant.',
            minutes: 9,
            body: `The Neapolitan chord is a major triad built on the lowered second scale degree, written ♭II. In C minor or C major it is D-flat, F and A-flat. It is a chromatic predominant that usually leads to the dominant, and it is characteristic of minor keys, though it appears in major as well.

It is usually found in first inversion, with the third of the chord (F in the example) in the bass, which is why it is written N6, or the "Neapolitan sixth". In this position the bass is the fourth scale degree, which moves by step to the dominant. The root of the chord is the lowered second degree, and in the typical four-part texture the third, which is in the bass, is doubled.

Voice leading is distinctive. The lowered second degree (D-flat) tends to fall to the leading tone (B natural) in a progression such as N6 to V. The melodic interval of a diminished third from D-flat to B, between the chord and the dominant, is acceptable and has a characteristic expressive pull. The chord usually progresses either directly to V or to a cadential 6/4 that then resolves to V7.

A simple progression in C minor runs i, N6, V, i, or i, N6, cadential 6/4, V, i. In A minor, the Neapolitan chord is B-flat, D, F.

The name comes from an association with a group of 18th-century composers working in Naples, though the chord itself had been used earlier, and its use was widespread throughout the common-practice period. Neapolitan chords tend to appear at emotionally intense moments: lamentation, climax or an approach to a final cadence.`,
          },
          {
            id: L12,
            title: 'Augmented Sixth Chords',
            blurb: 'Italian, French and German sixths resolving outward to the dominant.',
            minutes: 11,
            body: `Augmented sixth chords are chromatic predominant chords. Each contains the interval of an augmented sixth between the lowered sixth scale degree in the bass and the raised fourth scale degree above it. In C minor these notes are A-flat and F-sharp. They resolve outward by half step to an octave on the dominant: A-flat falls to G and F-sharp rises to G. The next chord is usually V, often preceded by a cadential 6/4.

The three standard types differ in the extra note or notes they add. The Italian sixth (It+6) is the simplest and has only three distinct pitches: A-flat, C and F-sharp, with the tonic C doubled. The French sixth (Fr+6) adds the second scale degree, giving A-flat, C, D and F-sharp. It sounds like a dominant seventh chord with a lowered fifth. The German sixth (Ger+6) adds the lowered third degree, giving A-flat, C, E-flat and F-sharp.

The German sixth presents a voice-leading problem. When it resolves directly to the root-position dominant, the voice on E-flat moves to D while the bass moves from A-flat to G, which creates parallel perfect fifths between them. Composers avoid the fifths by resolving to a cadential 6/4 first, or tolerate them in some textures.

Enharmonically, A-flat, C, E-flat, F-sharp is enharmonically equivalent to A-flat, C, E-flat, G-flat, a dominant seventh chord: it sounds the same but is spelled differently. This allows a German sixth to serve as a pivot into a distant key by respelling. The chord therefore appears often in Classical and Romantic modulations. The names are traditional labels, not statements of national origin.`,
          },
        ],
      },
      {
        id: 'music-theory-college.t4',
        title: 'Extended Harmony and Form',
        blurb: 'Chromatic mediants, altered dominants, sonata form and Schenkerian reduction.',
        level: 'ADVANCED',
        lessons: [
          {
            id: L13,
            title: 'Chromatic Mediants and Altered Dominants',
            blurb: 'Third-related triads and dominants with added dissonance.',
            minutes: 10,
            body: `Chromatic mediant relationships join two triads whose roots lie a third apart, but which do not belong to the same key. The triads usually have the same quality, and they share exactly one common tone. Taking C major as the reference, the chromatic mediants are E major (sharing the note E), A-flat major (sharing C), E-flat major (sharing G) and A major (sharing E). The lack of functional connection produces a striking, often magical or dramatic effect. Schubert, Liszt and Wagner used these relationships, and later composers made them a staple of colorful harmonic writing.

In common-practice harmony, the dominant is the chord most open to expansion. Stacking further thirds above the dominant seventh yields the dominant ninth. On G, G-B-D-F-A is a dominant ninth chord, and the eleventh and thirteenth can be added to give dominant elevenths and thirteenths. In practice, some tones are omitted.

Altered dominants change one or more chord tones chromatically to intensify the pull to the tonic. A flat ninth adds A-flat above a G7 chord, and a raised fifth replaces D with D-sharp (spelled G, B, D-sharp, F). The altered tones resolve by step: D-sharp to E, and A-flat to G.

These sounds became prominent in the 19th century and are essential to jazz. Recognizing them means identifying the underlying dominant seventh, then labeling the alterations as additions or changes. Analyzing a chromatic mediant passage means noting the common tone and the way the voices glide to it by small steps.`,
          },
          {
            id: L14,
            title: 'Sonata Form: The Exposition',
            blurb: 'Primary theme, transition, secondary theme and closing.',
            minutes: 11,
            body: `Sonata form is the most important structure for first movements of Classical symphonies, sonatas and quartets. It has three main parts: exposition, development and recapitulation, sometimes followed by a coda. Its drama comes from tonal conflict: the exposition moves away from the home key, and the recapitulation resolves that conflict.

The exposition begins with the primary theme (P), stated in the tonic key. Next comes a transition (TR) whose job is to modulate. It often builds energy and ends on a strong dominant of the new key. In many works there is a medial caesura (MC), a short pause or break that divides the transition from the secondary theme.

The secondary theme (S) is stated in the new key. In a major-key movement, this is typically the dominant. In a minor-key movement, it is usually the relative major (III). The theme is often lyrical, contrasting with the primary one. A closing section (C) confirms the new key with a firm cadence, called the essential expositional closure (EEC) in Sonata Theory, and may include closing themes.

The exposition therefore ends in a key other than the tonic. Because of this, the harmonic tension of the exposition is real, and most Classical-era works repeat the exposition so that the listener can absorb it before development starts.

In Mozart's piano sonatas, as in his Sonata in C major, K. 545, the plan is clear: a primary theme in C, a transition, then a secondary theme in G. Beethoven stretched the form with longer transitions, extra themes and more daring keys, but the underlying plan continued to serve him.`,
          },
          {
            id: L15,
            title: 'Sonata Form: Development, Recapitulation, Coda',
            blurb: 'Tension, return and resolution.',
            minutes: 10,
            body: `After the exposition comes the development, the least constrained part of sonata form. It takes material from the exposition, often fragments of the primary theme or the closing theme, and puts it through harmonic and motivic change. Typical techniques include sequence, modulation to remote keys, fragmentation of motives, changes of texture and register, and contrapuntal combination. It does not usually introduce a lot of brand-new themes. The development often ends with a retransition, which prepares the home key by lingering on the dominant of the tonic, building tension before the return.

The recapitulation brings back the material of the exposition. The primary theme returns in the tonic, as expected. The key change is in the secondary theme, which appears now in the tonic as well, rather than in the contrasting key. This is called tonal resolution, and it is the structural point of the whole form. The transition has to be adjusted so that it does not modulate away. In a minor-key movement, the secondary theme often appears in the tonic minor or, in some works, the parallel major.

A coda, literally a tail, follows the recapitulation's closing material. It reinforces the home key with additional cadences and may bring a last reference to the main theme. Beethoven often expanded codas so that they function as a second development before a final affirmation.

To analyze a movement, label each section, give the key of each theme and mark the points where the music pauses or cadences. Compare the exposition and recapitulation bar by bar to see exactly what changed and why.`,
          },
          {
            id: L16,
            title: 'Schenkerian Basics',
            blurb: 'The Ursatz and prolongation as a way to hear tonal structure.',
            minutes: 11,
            body: `Heinrich Schenker developed an approach to tonal music that treats a piece as the elaboration of a simple underlying structure. The core idea is that surface details, the foreground, expand and decorate deeper levels, the middleground and finally the background. Analysts use a special graphic notation, in which note heads of different values show structural weight, to show how one level unfolds from another.

The deepest structure is the Ursatz, or fundamental structure. It has two parts. The first is the Urlinie, the fundamental line, a stepwise descent in the upper voice to the tonic, from the third scale degree (3̂-2̂-1̂), the fifth (5̂-4̂-3̂-2̂-1̂) or, less often, the octave. The second is the bass arpeggiation, or Bassbrechung, which outlines the tonic, the dominant and back to the tonic (I-V-I). Under the second scale degree, the harmony is V.

Some works are built on an interruption: the Urlinie descends to 2̂ over the dominant, stops, and then begins again from the top to complete the descent to 1̂ with the final tonic. Such a design is common in period structures that end the first phrase on a half cadence.

Prolongation is how structural notes and harmonies are made to last. A tone or chord is prolonged when it continues to govern even though other notes intervene. Common means include passing tones, neighbor tones (which step away and return), arpeggiation and unfolding.

Schenkerian reading is not a recipe. It asks you to hear which notes are essential and which are ornamental. Even if you never graph a piece, learning to listen this way helps explain why tonal music feels goal-directed.`,
          },
        ],
      },
      {
        id: 'music-theory-college.t5',
        title: 'Late Romantic Chromaticism and Impressionism',
        blurb: 'Tonality stretched, new scales and the geometry of triads.',
        level: 'ADVANCED',
        lessons: [
          {
            id: L17,
            title: 'Late-Romantic Chromaticism and the Tristan Chord',
            blurb: 'Delayed resolution and extended tonality.',
            minutes: 10,
            body: `By the second half of the 19th century, composers were stretching the limits of tonality. Chromatic voice leading, unusual chord successions, long-delayed resolutions and constant modulation made the tonic harder to pin down. The tonic still organizes a work, but it may be hinted at far more than it is stated. Richard Wagner is the central figure in this development, and his music dramas shaped a generation.

The best-known example is the opening of the Prelude to Wagner's Tristan und Isolde. The prelude begins in the world of A minor. The second bar contains the famous Tristan chord, spelled F, B, D-sharp and G-sharp. In pitch terms it is equivalent to F, A-flat, C-flat and E-flat, a half-diminished seventh chord, but it is spelled the way it is because of how the voices move. In context, the chord leads to a dominant seventh chord on E (E, G-sharp, B, D).

Analysts have offered many interpretations of the chord, including as an altered predominant and as a chord built from appoggiaturas. The enduring quality of the passage is not a single label but the way it is used: the dissonance does not resolve to a stable tonic. Instead, the music passes from one tense chord to the next, and the sense of yearning matches the drama.

Wagner's technique of linking motives to characters, ideas or objects, called the leitmotif, also affects harmony. Later composers such as Mahler and Strauss continued to stretch the language in different ways. These practices set the stage for the abandoning of tonality in the 20th century.`,
          },
          {
            id: L18,
            title: 'Impressionism: Whole-Tone and Pentatonic Scales',
            blurb: 'Color, ambiguity and parallel chords.',
            minutes: 9,
            body: `Claude Debussy and Maurice Ravel are the two composers most closely connected with musical Impressionism, a term borrowed from painting and applied loosely. Rather than driving functional progressions toward a cadence, their music often emphasizes color, atmosphere and static harmony. Chords are valued for sound as much as for function, and dissonances may go unresolved.

The whole-tone scale has six notes, each a whole step from the next: C, D, E, F-sharp, G-sharp, B-flat. Because the scale has no half steps and no perfect fifths, and because every note is equivalent in structure, it has no obvious tonic. There are only two distinct whole-tone collections, since transposing by a whole step gives the same notes. Triads that can be built from the scale are augmented triads. The sound is floating and ambiguous. Debussy's prelude Voiles is built largely on this scale.

The pentatonic scale has five notes and no half steps. The major pentatonic from C is C, D, E, G, A. It has a simple, open sound, and it appears in folk music around the world. In Impressionist writing it supplies a bright, uncomplicated color and often appears along with modal harmonies.

Impressionist composers also used planing, or parallel chord motion: a chord shape moves up and down as a block, with no regard for functional harmony or for the voice-leading rules of earlier periods. Added-note chords, such as ninths and sixths, and modal writing add to the effect. The aim is a palette of timbres and moods rather than the goal-driven logic of the Classical style.`,
          },
          {
            id: L19,
            title: 'The Octatonic Collection',
            blurb: 'Alternating whole and half steps, and what they build.',
            minutes: 9,
            body: `The octatonic scale has eight pitch classes and alternates whole steps and half steps. Starting from C with a whole step first, it reads C, D, E-flat, F, G-flat, A-flat, A, B, then back to C. Starting with a half step instead gives the other ordering of the same type, C, D-flat, E-flat, E, F-sharp, G, A, B-flat. Both are called octatonic, and theorists refer to the whole-half and half-whole forms.

Because the pattern repeats every three semitones, the scale maps onto itself when transposed by a minor third. Only three distinct octatonic collections exist. Messiaen called it the second mode of limited transposition, though the collection was used long before him: Rimsky-Korsakov and other Russian composers favored it, and it entered French and Eastern European music from there.

Its structure is rich. A single collection contains two fully diminished seventh chords, for the whole-half form from C: C, E-flat, G-flat, A and D, F, A-flat, B. It also contains tritones, minor triads, and dominant seventh chords; for instance, D, F-sharp (G-flat), A and C form a D dominant seventh chord, and the same collection includes D, F, A, a D minor triad. The collection can therefore behave like an interplay of major and minor colors, sometimes sounding bluesy or mysterious.

Analysts recognize octatonic passages by finding a stretch of music where all notes belong to one of the three collections, and by noticing the symmetrical, interlocking diminished seventh chords. Because the collection has no single tonic, composers can use it to suspend tonal direction or to alternate with diatonic music.`,
          },
          {
            id: L20,
            title: 'Neo-Riemannian Transformations',
            blurb: 'P, L and R: moving between triads by smooth voice leading.',
            minutes: 10,
            body: `Neo-Riemannian theory, developed in the late 20th century from ideas of the theorist Hugo Riemann, describes relations between major and minor triads through small, efficient voice-leading moves. It is especially helpful for music of the Romantic period in which chords follow each other without functional logic, such as chromatic mediants.

Three basic operations convert a major triad into a minor one, or the reverse, while keeping two common tones. Parallel (P) changes the quality while keeping the root and fifth: C major becomes C minor, as the third, E, moves to E-flat. Leading-tone exchange (L) moves the root down a half step in a major triad: C major becomes E minor, as C moves to B while E and G stay. Relative (R) moves the fifth of a major triad up a whole step: C major becomes A minor, as G moves to A while C and E stay.

Applied to a minor triad, each operation works in the opposite direction. Each is its own inverse, so applying it twice returns you to the starting chord. The transformations can be combined to make paths. Alternating P and L, starting on C major, produces C major, C minor, A-flat major, A-flat minor, E major, E minor, and then returns to C major: a cycle of six triads, called the hexatonic cycle.

The operations are often shown on a geometric grid called the Tonnetz, where triads form adjacent triangles. Neo-Riemannian theory shows that distant chords can be linked by smooth, nearly parallel motion, which explains why certain Romantic progressions sound natural though they have no common key.`,
          },
        ],
      },
      {
        id: 'music-theory-college.t6',
        title: 'Twentieth-Century Techniques',
        blurb: 'Pitch-class sets, twelve-tone serialism and other new approaches.',
        level: 'ADVANCED',
        lessons: [
          {
            id: L21,
            title: 'Pitch-Class Set Theory: Normal Order and Prime Form',
            blurb: 'Numbering the twelve pitch classes and finding a set class.',
            minutes: 11,
            body: `Pitch-class set theory gives tools for analyzing music that is not organized by traditional tonality. A pitch class groups all pitches that are the same note name in any octave, and enharmonic spellings. The standard numbering sets C at 0, C-sharp at 1, and so on up to B at 11. Thus F-sharp is 6, A is 9, and B-flat is 10. A pitch-class set is an unordered collection of these numbers.

To compare sets, we reduce them to a standard form. Normal order is the most compact way of writing the set as an ascending arrangement, with the smallest interval between its first and last numbers. For {0, 4, 7}, the C major triad, the normal order is 0, 4, 7.

Prime form goes a step further. You write the normal order of the set and of its inversion, transpose each to begin on 0, and choose the one that is more tightly packed toward the left. The major triad inverts to {0, 5, 8}, whose most compact arrangement is 5, 8, 0, and transposing to start on 0 yields (0, 3, 7). The original is (0, 4, 7), so the prime form is (0, 3, 7). This shows that major and minor triads belong to the same set class, because inversion and transposition do not change the class.

For example, the pitches D, E-flat and G are {2, 3, 7}. Normal order is 2, 3, 7, which transposes to (0, 1, 5). The inversion has prime form (0, 4, 5), and (0, 1, 5) is the smaller, so the prime form is (0, 1, 5).

Allen Forte's labeling assigns catalogue numbers to set classes; the major and minor triads are 3-11, the diminished triad is 3-10 and the augmented triad 3-12. Prime form lets you recognize the same sound-structure across a piece, whatever the transposition or ordering.`,
          },
          {
            id: L22,
            title: 'Interval-Class Vectors',
            blurb: 'A fingerprint of the intervals in a set.',
            minutes: 10,
            body: `An interval class (ic) groups an interval with its inversion, ignoring direction and octave. There are six of them: ic1 is the semitone or its inversion the major seventh, ic2 the whole tone, ic3 the minor third, ic4 the major third, ic5 the perfect fourth and ic6 the tritone. The distance between two pitch classes, counted the short way around the twelve-note circle, gives the interval class directly.

The interval-class vector is a six-digit summary showing how many times each interval class appears among all pairs of notes in a set. The six digits are written in order from ic1 to ic6 inside angle brackets. For the major triad {0, 4, 7}, the pairs are 0-4 (ic4), 0-7 (ic5) and 4-7 (ic3), so the vector is <001110>. For the diminished triad {0, 3, 6}, the pairs give two minor thirds and a tritone, <002001>. The augmented triad {0, 4, 8} has three major thirds, <000300>. The whole-tone scale has the vector <060603>, and the diatonic collection <254361>.

For a set of n notes, the number of pairs is n(n-1)/2, so the digits of the vector always add up to that number. Triads sum to 3 and tetrachords to 6.

Sets in the same class always have the same vector, but the reverse is not always true. Two sets that share a vector without being related by transposition or inversion are called Z-related. The simplest example is the pair (0, 1, 4, 6) and (0, 1, 3, 7), both with the vector <111111>.

Vectors help to compare the sound of sets: a set with lots of ic5 and ic4 sounds triadic or consonant, while one rich in ic1 and ic6 sounds more dissonant.`,
          },
          {
            id: L23,
            title: 'Twelve-Tone Serialism',
            blurb: 'The row, its four forms and the matrix.',
            minutes: 11,
            body: `Twelve-tone serialism, or dodecaphony, is a method of composition associated with Arnold Schoenberg and his students Anton Webern and Alban Berg. It organizes a piece around a tone row, an ordering of all twelve pitch classes with none repeated. Because every pitch class is equally important, no one note acts as a tonic, and the method avoids a sense of key.

A row can be used in four basic forms. The prime form (P) is the original order. The retrograde (R) reads the prime backward. The inversion (I) turns every interval of the prime upside down, so that a rise becomes an equal fall. The retrograde inversion (RI) reads the inversion backward. Each form can be transposed to begin on any of the twelve pitch classes, so a row has 48 possible forms. The forms are labeled by the starting pitch class, for example P0 or I5.

A twelve-by-twelve matrix lays out all forms. Write P0 across the top row, then write the inversion of P0 down the first column, starting on the same pitch class. Each row is then filled in by transposing the prime to begin on the pitch class in the first column. Reading across from left to right gives prime forms, right to left gives retrogrades, top to bottom gives inversions and bottom to top gives retrograde inversions.

For example, with P0 = 0 2 4 6 8 10 1 3 5 7 9 11, the inversion I0 is 0 10 8 6 4 2 11 9 7 5 3 1, and P5 is 5 7 9 11 1 3 6 8 10 0 2 4.

Composers use the row for melody and for chords, allowing the notes to be distributed in any octave and rhythm. The row supplies the pitch material, but the other musical choices stay free.`,
          },
          {
            id: L24,
            title: 'Minimalism, Aleatory and Spectralism',
            blurb: 'Process, chance and the physics of sound.',
            minutes: 10,
            body: `The second half of the 20th century saw many alternatives to both tonality and serialism. Three approaches that students should recognize are minimalism, aleatory music and spectralism.

Minimalism, developing in the United States from the 1960s, uses a pared-down set of materials, steady pulse, consonant or modal harmony and gradual change. Composers such as Steve Reich, Philip Glass, Terry Riley and La Monte Young are the best-known names. Characteristic techniques include repetition of short patterns, additive process, in which notes are added to or removed from a pattern step by step, and phasing, in which two identical patterns played at slightly different speeds gradually move out of alignment and back. The listener hears the process itself as the music.

Aleatory music, or chance music, leaves some element to chance or to the performer. In indeterminate works, the composer may specify materials but not their order or timing. John Cage used chance operations, such as consulting the I Ching, to determine pitches, durations and dynamics in some pieces. Other composers, such as Witold Lutosławski, used controlled aleatory, in which players follow notated patterns but are free in rhythm so that the overall sound is shaped.

Spectralism arose in France in the 1970s with composers including Gérard Grisey and Tristan Murail. It builds harmony and form from the analysis of the acoustic spectrum of sound, especially the overtone series. Instruments imitate the partials of a sound, often with microtonal tuning, and music may unfold as a slow transformation of a sound's spectrum. Computer analysis frequently supplies the data.

Each approach redefines what material and structure can mean in music.`,
          },
        ],
      },
      {
        id: 'music-theory-college.t7',
        title: 'Jazz Harmony and Analysis',
        blurb: 'Jazz chord language, and how to analyze and write about music.',
        level: 'ADVANCED',
        lessons: [
          {
            id: L25,
            title: 'Jazz Harmony: ii-V-I and Tritone Substitution',
            blurb: 'The central cadence of jazz and its common substitute.',
            minutes: 10,
            body: `The ii-V-I progression is the basic harmonic unit of jazz. In jazz, chords are normally seventh chords. In C major the progression is D minor seventh (D, F, A, C), G dominant seventh (G, B, D, F) and C major seventh (C, E, G, B). The roots follow the circle of fifths, each falling a fifth, which creates strong forward motion.

Voice leading explains its smoothness. The most important notes in each chord are the third and seventh, the guide tones. In the progression, the seventh of D minor (C) falls by a half step to the third of G7 (B), and the seventh of G7 (F) falls by a half step to the third of the C major seventh chord (E). Even with a single chord shape for each, the line created by these notes is smooth and recognizable.

In minor keys, the progression becomes ii half-diminished seventh, V7 and i. In C minor, that is D, F, A-flat, C, followed by G7 and a C minor chord.

The tritone substitution replaces a dominant seventh chord with the dominant seventh chord whose root is a tritone away. For G7, the substitute is D-flat 7. The two chords share the same two important notes: B and F in G7 are the third and seventh, and in D-flat 7 they appear as C-flat (the same pitch as B) and F, with the roles reversed. The substitution turns ii-V-I into D minor seventh, D-flat 7, C major seventh, so the bass descends chromatically: D, D-flat, C.

Learning to hear these progressions in standard tunes is a core skill for jazz improvisers and arrangers.`,
          },
          {
            id: L26,
            title: 'Upper Extensions and Reharmonization',
            blurb: 'Ninths, elevenths, thirteenths, and replacing chords.',
            minutes: 10,
            body: `Jazz chords are built by stacking thirds above the seventh, adding extensions: the ninth, eleventh and thirteenth. The ninth is a step above the octave, the eleventh a fourth, and the thirteenth a sixth. Thus a C9 chord has C, E, G, B-flat and D. A G13 chord has G, B, D, F, A and E, though the fifth and eleventh are often omitted.

Choice of extensions is guided by the chord's function and by avoid notes. On a major chord, the natural eleventh clashes with the major third, so the raised eleventh, which implies the Lydian sound, is usually preferred. On dominant chords, altered extensions are possible: flat ninth, sharp ninth, sharp eleventh and flat thirteenth. These produce the altered dominant sound.

Reharmonization is the practice of replacing the chords of a melody with new ones while keeping the tune. Several tools are standard. Diatonic substitution replaces a chord with another sharing most of its notes: E minor seventh (E, G, B, D) may stand for C major seventh because it shares E, G and B. Tritone substitution replaces a dominant. Secondary ii-V progressions can be inserted before any chord to approach it. Backcycling is the technique of approaching a target chord by its dominant, then approaching that chord by its dominant, and so on around the cycle of fifths.

A good reharmonization respects the melody. Each new chord should contain or support the melody note, and the bass should move in a sensible line. Arrangers use these devices to give a familiar tune a fresh color, and the same ideas help improvisers choose scales.`,
          },
          {
            id: L27,
            title: 'Modal Jazz',
            blurb: 'Static harmony and the character of each mode.',
            minutes: 9,
            body: `Modal jazz arose in the late 1950s as a reaction to the fast-moving chord changes of bebop. Instead of a new chord every beat or two, it builds a piece on a single mode, or a small number of them, for many measures. The musicians improvise melodies from the notes of that mode, which gives the music a stable, open and sometimes meditative character.

A mode is a scale built on a different degree of the major scale, and each has a distinctive sound that comes from one or two characteristic notes. Dorian is the white-key scale on D: D, E, F, G, A, B, C. It is like a natural minor scale, but with a natural sixth instead of a lowered sixth, which gives it a slightly brighter color. Mixolydian is major with a lowered seventh. G Mixolydian, G, A, B, C, D, E, F, has the same notes as C major. Lydian is major with a raised fourth, and it is a common choice for major chords. Phrygian has a lowered second, and Locrian a lowered second and a lowered fifth, which is why it is unstable and rarely used as a tonic.

The same pitch collection can produce different modes depending on the tonic that the bass and chords emphasize. D Dorian and C major use the same notes, but the music sounds different because the note D is the center.

In practice, modal jazz players mix modal thinking with other ideas. They may build chords in fourths instead of thirds, shift the mode by a half step for contrast or add chromatic notes outside the mode. Understanding modes lets you hear the character of a vamp and choose notes with intent.`,
          },
          {
            id: L28,
            title: 'Analysis Methodology and Writing About Music',
            blurb: 'From observation to a clear, supported argument.',
            minutes: 10,
            body: `Analysis is the disciplined study of how a piece of music is built and why it works as it does. A good method moves in steps.
1. First, listen and look: read the score while you hear a recording, and note the form, texture, key, meter and any surprises.
2. Second, label the details: add Roman numerals, mark cadences, identify themes, and map the large-scale sections.
3. Third, look for patterns and relationships, such as recurring motives, harmonic sequences or links between sections.
4. Fourth, interpret: ask what the patterns do and why a composer might have chosen them.

Roman numeral conventions are standard. Uppercase numerals are major triads and lowercase numerals are minor ones. A small circle after a lowercase numeral denotes a diminished triad, and a circle with a slash denotes a half-diminished seventh chord. Figures to the right show inversion and chord members.

Writing about music requires a different discipline from analyzing it. Begin with a thesis, a claim that can be argued, not just a description. "The movement has three sections" is an observation; "the key of the secondary theme unsettles the tonic until the recapitulation resolves it" is an argument. Support the claim with specific evidence from the score, and cite measure numbers so that readers can find each passage, for instance m. 24-32. Quote short musical examples when they help.

Distinguish description from interpretation. Do not narrate the piece bar by bar. Use precise vocabulary, define unusual terms, and consider the historical and stylistic context so that you compare the piece with its genre and period. A good paper leaves readers with a new way of hearing the work.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'music-theory-college',
    questions: [
      // L01
      tf(L01, 1, 2, 'In first species counterpoint, each note of the counterpoint is set against exactly one note of the cantus firmus.', 0, 'The name of the species describes the ratio of notes.', 'First species is note against note, so the ratio is one to one.'),
      mc(L01, 2, 2, 'In strict two-voice species counterpoint, which interval is treated as a dissonance?', ['Perfect fourth', 'Major sixth', 'Minor third', 'Perfect fifth'], 'Consider which of these is traditionally avoided between two voices.', 'Strict two-voice writing treats the perfect fourth as a dissonance, while thirds, sixths, fifths and octaves are consonances.'),
      mc(L01, 3, 3, 'A cantus firmus in D Dorian ends E to D with the counterpoint above. Which penultimate note is standard?', ['C-sharp', 'C natural', 'B', 'F'], 'The penultimate interval above E should be a major sixth.', 'C-sharp is a major sixth above E and steps up to D, forming an octave at the close.'),
      tf(L01, 4, 2, 'Parallel perfect fifths between two voices are permitted in strict first species as long as the notes are consonant.', 1, 'Independence of voices is the aim.', 'Parallel perfect fifths and octaves are forbidden because they reduce the independence of the voices.'),
      mc(L01, 5, 3, 'The cantus firmus moves C to D while the counterpoint above moves G to A. What is the error?', ['Parallel perfect fifths', 'Voice crossing', 'Parallel thirds', 'Hidden octaves'], 'Find the interval at each moment.', 'G over C is a fifth and A over D is also a fifth, so the lines move in parallel perfect fifths.'),
      // L02
      mc(L02, 1, 2, 'Which species is built on syncopation and suspensions?', ['Fourth species', 'Second species', 'Third species', 'First species'], 'Notes are tied across the barline.', 'Fourth species ties notes across the barline so that prepared dissonances appear on the strong beat.'),
      tf(L02, 2, 2, 'In second species, the strong beat may be dissonant as long as the weak beat is consonant.', 1, 'Which beat carries the stability?', 'In second species, the strong beat must be consonant, and dissonance is allowed only on the weak beat as a passing tone.'),
      mc(L02, 3, 3, 'In fourth species, how should a suspended dissonance resolve?', ['Down by step', 'Up by step', 'By a leap down a third', 'It need not resolve'], 'Think of 7-6 and 4-3.', 'The suspended dissonance resolves down by step, as in the 7-6 and 4-3 suspensions.'),
      mc(L02, 4, 2, 'How many counterpoint notes sound against each cantus firmus note in third species?', ['Four', 'Two', 'One', 'Eight'], 'The species number does not equal the ratio here.', 'Third species uses four notes against one.'),
      tf(L02, 5, 2, 'Fifth species combines the techniques of the earlier four species.', 0, 'It is called florid counterpoint.', 'Florid counterpoint mixes note values and techniques from species one through four, with decoration added.'),
      // L03
      mc(L03, 1, 2, 'Which note is the final of the Phrygian mode on the white keys?', ['E', 'D', 'F', 'G'], 'The scale runs E to E.', 'The white-key Phrygian mode runs from E to E and has the final E.'),
      tf(L03, 2, 2, 'In Palestrina-style polyphony, the melodic lines move mostly by step.', 0, 'Think of singable, smooth lines.', 'The style favors stepwise motion with leaps balanced by stepwise motion in the opposite direction.'),
      mc(L03, 3, 2, 'Which white-key mode has the final F?', ['Lydian', 'Mixolydian', 'Dorian', 'Phrygian'], 'Recall the white-key finals D, E, F, G.', 'Lydian runs from F to F on the white keys.'),
      tf(L03, 4, 3, 'A plagal mode has the same final as its authentic partner but a range roughly a fourth lower.', 0, 'Compare Dorian and Hypodorian.', 'Authentic and plagal partners share a final, while the plagal range lies about a fourth lower.'),
      mc(L03, 5, 3, 'At a Dorian cadence on D, singers customarily raise which note?', ['C to C-sharp', 'E to F', 'A to B-flat', 'F to F-sharp'], 'The note a step below the final is raised.', 'Musica ficta raises C to C-sharp, creating a leading tone to the final D.'),
      // L04
      mc(L04, 1, 2, 'In a fugue exposition, the answer normally states the subject at which pitch level?', ['The dominant', 'The mediant', 'The subdominant', 'The submediant'], 'Entries alternate between tonic and one other degree.', 'The answer is typically at the dominant, a fifth above or a fourth below the subject.'),
      tf(L04, 2, 2, 'A countersubject typically accompanies the answer as the first voice continues.', 0, 'The first voice does not stop when the second enters.', 'The first voice continues with the countersubject while the answer is stated.'),
      mc(L04, 3, 3, 'What is stretto in a fugue?', ['Entries of the subject overlapping before it ends', 'A passage with no subject', 'The final cadence', 'A modulation to the relative key'], 'It increases intensity.', 'In stretto, a new entry of the subject begins before the previous one has finished.'),
      tf(L04, 4, 3, 'A tonal answer is always an exact transposition of the subject.', 1, 'The answer may be adjusted to stay in the home key.', 'A tonal answer adjusts some intervals, so it is not an exact transposition; an exact one is a real answer.'),
      mc(L04, 5, 2, 'What does Bach\'s Well-Tempered Clavier contain?', ['Two books of prelude and fugue pairs in all 24 keys', 'One set of twelve fugues only', 'Thirty variations on one theme', 'Preludes only in minor keys'], 'Think of a pair in each major and minor key.', 'Each of the two books has 24 preludes and fugues, one pair in each major and minor key.'),
      // L05
      mc(L05, 1, 2, 'Over a bass note G with the figure 6 and no accidentals in the key signature, which pitches form the chord?', ['G, B, E', 'G, B, D', 'G, C, E', 'G, A, D'], 'A figure 6 means a sixth and a third above the bass.', 'The sixth above G is E and the third is B, giving a first-inversion E minor triad.'),
      mc(L05, 2, 3, 'A bass note C is figured 6/4 with no accidentals. Which chord is it?', ['F major in second inversion', 'C major in root position', 'A minor in first inversion', 'G major in first inversion'], 'Find the fourth and sixth above C.', 'The fourth above C is F and the sixth is A, so the notes C, F, A form an F major triad with C in the bass.'),
      tf(L05, 3, 2, 'A bass note with no figure normally implies a root-position triad.', 0, 'It is the same as 5/3.', 'An absent figure is read as 5/3, a root-position triad.'),
      mc(L05, 4, 3, 'What does the figure 6/5 indicate?', ['A first-inversion seventh chord', 'A root-position seventh chord', 'A second-inversion triad', 'A third-inversion seventh chord'], 'Seventh chords add a 5 in the first inversion.', 'The figure 6/5 stands for a first-inversion seventh chord, with sixth and fifth above the bass.'),
      tf(L05, 5, 2, 'Basso continuo normally involves a bass-line instrument together with a chord-playing instrument.', 0, 'Think of cello and harpsichord.', 'The continuo group pairs a bass instrument with a chordal one, such as a keyboard or lute.'),
      // L06
      mc(L06, 1, 2, 'In a G7 chord moving to C major, how does the chordal seventh F normally resolve?', ['Down by step to E', 'Up by step to G', 'Stays as a common tone', 'Down a fifth to B'], 'Chordal sevenths tend to fall.', 'The seventh of a dominant seventh resolves down by step, F to E here.'),
      tf(L06, 2, 2, 'The leading tone is normally not doubled in four-part writing.', 0, 'Doubling would give parallel octaves on resolution.', 'A doubled leading tone would rise in parallel octaves, so it is avoided.'),
      mc(L06, 3, 2, 'Which spacing guideline applies to the upper three voices in SATB writing?', ['Soprano-alto and alto-tenor within an octave', 'All voices within a fifth', 'Tenor and bass within an octave', 'Soprano and tenor within a third'], 'The bass is the exception.', 'Adjacent upper voices should be within an octave, while a wider gap between tenor and bass is acceptable.'),
      mc(L06, 4, 3, 'What is voice overlap?', ['A voice moving past the previous pitch of a neighboring voice', 'Two voices singing the same note', 'A voice leaping a seventh', 'A voice resolving a seventh up'], 'It is related to, but not the same as, voice crossing.', 'In overlap, a voice moves beyond the earlier note of an adjacent voice, though the voices have not crossed.'),
      tf(L06, 5, 2, 'Contrary motion between the outer voices helps avoid parallel perfect intervals.', 0, 'Opposite directions cannot be parallel.', 'Contrary motion avoids parallel fifths and octaves and keeps the voices independent.'),
      // L07
      mc(L07, 1, 2, 'Which progression is a deceptive cadence?', ['V to vi', 'IV to I', 'V to I', 'I to V'], 'The submediant substitutes for the tonic.', 'A deceptive cadence is V moving to vi.'),
      tf(L07, 2, 2, 'A half cadence ends on the dominant chord.', 0, 'It feels like a comma.', 'A half cadence closes a phrase on V.'),
      mc(L07, 3, 3, 'Which conditions make a perfect authentic cadence?', ['V to I in root position with tonic in the soprano', 'V6 to I with the third in the soprano', 'IV to I', 'V to vi'], 'Both chords are root position.', 'A PAC requires both chords in root position and the tonic note on top of the final chord.'),
      mc(L07, 4, 3, 'In a Phrygian half cadence in C minor, how does the bass move?', ['A-flat falls to G', 'F falls to E', 'G rises to A-flat', 'D falls to C'], 'The progression is iv6 to V.', 'iv6 in C minor has A-flat in the bass, which falls by a half step to G, the root of V.'),
      tf(L07, 5, 3, 'A sentence begins with a presentation in which a basic idea is stated and repeated.', 0, 'It then continues with fragmentation.', 'In a sentence, a basic idea and its repetition form the presentation, followed by a continuation.'),
      // L08
      mc(L08, 1, 2, 'Which notes form V/V in C major?', ['D, F-sharp, A', 'G, B, D', 'E, G-sharp, B', 'D, F, A'], 'It is the dominant of G.', 'The dominant of G is D major, spelled D, F-sharp, A.'),
      mc(L08, 2, 3, 'Which notes form V7/vi in C major?', ['E, G-sharp, B, D', 'A, C-sharp, E, G', 'E, G, B, D', 'D, F-sharp, A, C'], 'The vi chord is A minor, and its dominant is E.', 'The dominant seventh of A minor is E7: E, G-sharp, B, D.'),
      tf(L08, 3, 3, 'The diminished triad vii° is normally not tonicized.', 0, 'A tonicized chord must be able to sound stable.', 'Its diminished fifth makes vii° unable to function as a temporary tonic.'),
      mc(L08, 4, 3, 'Which chord is V7/IV in G major?', ['G, B, D, F', 'G, B, D, F-sharp', 'D, F-sharp, A, C', 'C, E, G, B-flat'], 'The IV chord is C, and its dominant is G.', 'V7/IV is G7, G, B, D and F natural, where the F natural is the sign of the tonicization of C.'),
      tf(L08, 5, 2, 'A tonicization is typically briefer than a modulation and does not establish a new key.', 0, 'Duration and cadence matter.', 'Tonicization emphasizes a chord briefly, while a modulation confirms a new key.'),
      // L09
      mc(L09, 1, 2, 'In a modulation from C major to G major, what function does the A minor chord have in G?', ['ii', 'vi', 'IV', 'iii'], 'A is the second note of G major.', 'A minor is vi in C major and ii in G major, making it a good pivot chord.'),
      mc(L09, 2, 2, 'Which key is closely related to C major?', ['A minor', 'F-sharp major', 'E-flat major', 'B major'], 'Closely related keys differ by at most one accidental.', 'A minor shares the key signature with C major, so it is closely related.'),
      tf(L09, 3, 3, 'The fully diminished seventh chord is often used for enharmonic modulation because it can be respelled to resolve to different keys.', 0, 'Its symmetrical structure is the reason.', 'Its equal minor-third spacing allows several respellings and resolutions.'),
      mc(L09, 4, 3, 'What is a common-tone modulation?', ['One that links chords by a shared pitch', 'One that uses a diatonic pivot chord', 'One that moves to the relative key without any cadence', 'One that changes the mode only'], 'A single pitch is retained.', 'A shared pitch connects the two chords, even when no pivot chord exists.'),
      tf(L09, 5, 2, 'The C major tonic chord functions as IV in G major and can serve as a pivot chord.', 0, 'C is the fourth degree of G major.', 'C major is I in C and IV in G, so it can pivot between the two keys.'),
      // L10
      mc(L10, 1, 2, 'Which chord is the lowered submediant, bVI, in C major?', ['A-flat, C, E-flat', 'A, C, E', 'E-flat, G, B-flat', 'F, A-flat, C'], 'It is built on the lowered sixth degree.', 'The bVI chord in C is A-flat major: A-flat, C and E-flat.'),
      mc(L10, 2, 2, 'Which notes form the borrowed iv chord in C major?', ['F, A-flat, C', 'F, A, C', 'D, F, A-flat', 'B-flat, D, F'], 'It comes from the parallel minor.', 'The iv chord from C minor is F, A-flat, C.'),
      tf(L10, 3, 2, 'A Picardy third is a major tonic chord at the end of a minor-key passage.', 0, 'The third of the final chord is raised.', 'The Picardy third ends a minor piece on a major tonic.'),
      tf(L10, 4, 3, 'Mixture chords are borrowed from the relative minor, not the parallel minor.', 1, 'Mixture uses the same tonic.', 'Mixture chords come from the parallel mode with the same tonic, not the relative one.'),
      mc(L10, 5, 3, 'Which notes form bIII in C major?', ['E-flat, G, B-flat', 'E, G-sharp, B', 'E-flat, G-flat, B-flat', 'A-flat, C, E-flat'], 'It is built on the lowered mediant.', 'bIII is E-flat major: E-flat, G and B-flat.'),
      // L11
      mc(L11, 1, 3, 'Which notes make up the Neapolitan sixth in C minor, from the bass upward?', ['F, A-flat, D-flat', 'D-flat, F, A-flat', 'A-flat, C, F', 'D, F, A-flat'], 'It is the first inversion of bII.', 'N6 in C minor is D-flat major in first inversion, with F in the bass.'),
      tf(L11, 2, 2, 'The Neapolitan chord normally functions as a predominant.', 0, 'It leads to the dominant.', 'N6 normally precedes V or a cadential 6/4, acting as a predominant.'),
      mc(L11, 3, 2, 'Which notes form the Neapolitan chord in A minor?', ['B-flat, D, F', 'B, D, F-sharp', 'B-flat, D-flat, F', 'A-flat, C, E-flat'], 'It is built on the lowered second degree.', 'The lowered second degree in A minor is B-flat, so the chord is B-flat, D and F.'),
      mc(L11, 4, 2, 'The Neapolitan sixth most commonly resolves to which chord?', ['V or cadential 6/4 leading to V', 'iii', 'VII', 'bVI'], 'It is a predominant.', 'It typically goes to the dominant, either directly or by the cadential 6/4.'),
      tf(L11, 5, 2, 'The Neapolitan chord is normally used in root position.', 1, 'The N6 label gives it away.', 'It is usually in first inversion, so it is labeled N6.'),
      // L12
      mc(L12, 1, 3, 'Which notes form the German augmented sixth chord in C minor?', ['A-flat, C, E-flat, F-sharp', 'A-flat, C, D, F-sharp', 'A-flat, C, F-sharp', 'A-flat, C, E-flat, G'], 'It adds the lowered third degree to the Italian sixth.', 'The German sixth in C minor is A-flat, C, E-flat and F-sharp.'),
      mc(L12, 2, 3, 'Which notes form the French augmented sixth chord in C minor?', ['A-flat, C, D, F-sharp', 'A-flat, C, E-flat, F-sharp', 'A-flat, C, F-sharp', 'A-flat, D, F, B'], 'It adds the second scale degree.', 'The French sixth in C minor is A-flat, C, D and F-sharp.'),
      tf(L12, 3, 2, 'The Italian sixth has only three distinct pitch classes.', 0, 'The tonic is doubled.', 'The Italian sixth contains A-flat, C and F-sharp, with C doubled.'),
      mc(L12, 4, 2, 'To which pitch do the outer voices of an augmented sixth resolve in C minor?', ['G', 'C', 'E-flat', 'D'], 'They move outward to the dominant.', 'A-flat falls to G and F-sharp rises to G, forming an octave.'),
      tf(L12, 5, 3, 'A German augmented sixth chord is enharmonically equivalent to a dominant seventh chord.', 0, 'Respell F-sharp as G-flat.', 'A-flat, C, E-flat and F-sharp is enharmonic to A-flat, C, E-flat, G-flat, a dominant seventh chord.'),
      // L13
      mc(L13, 1, 2, 'Which triads are chromatic mediants of C major?', ['E major and A-flat major', 'D minor and G major', 'F major and G major', 'A minor and E minor'], 'The roots lie a third apart, with the same quality.', 'E major and A-flat major are major triads a third away from C major.'),
      mc(L13, 2, 3, 'Which pitch do C major and E major triads share?', ['E', 'C', 'G', 'None'], 'Compare C, E, G with E, G-sharp, B.', 'C, E, G and E, G-sharp, B share only the note E.'),
      mc(L13, 3, 3, 'Which notes make up a dominant ninth chord on G?', ['G, B, D, F, A', 'G, B, D, F-sharp, A', 'G, B, D, A, C', 'G, B-flat, D, F, A'], 'It is a dominant seventh with a ninth.', 'The chord is G, B, D, F and A.'),
      tf(L13, 4, 3, 'A G7 chord with a flat ninth contains A-flat.', 0, 'The ninth is a step above the octave.', 'The ninth above G is A, and lowering it gives A-flat.'),
      mc(L13, 5, 3, 'Which notes form G7 with a raised fifth?', ['G, B, D-sharp, F', 'G, B, D, F-sharp', 'G, B-flat, D-sharp, F', 'G, B, E-flat, F'], 'The fifth of G is D.', 'Raising the fifth D to D-sharp gives G, B, D-sharp and F.'),
      // L14
      mc(L14, 1, 2, 'In a major-key Classical sonata exposition, in which key is the secondary theme usually stated?', ['The dominant', 'The subdominant', 'The tonic', 'The relative minor'], 'The exposition moves away from home.', 'The secondary theme is typically in the dominant in major-key movements.'),
      mc(L14, 2, 2, 'In a minor-key exposition, the secondary theme is usually in which key?', ['The relative major', 'The tonic minor', 'The dominant major', 'The parallel major'], 'It is a key sharing the signature.', 'It is usually in the relative major (III).'),
      tf(L14, 3, 2, 'The transition in an exposition typically modulates toward the key of the secondary theme.', 0, 'This is its main job.', 'The transition leads away from the tonic to prepare the new key.'),
      tf(L14, 4, 2, 'A Classical sonata exposition normally ends in the tonic key.', 1, 'Tonal conflict is the point.', 'It ends in the contrasting key, and the recapitulation resolves the conflict.'),
      mc(L14, 5, 3, 'What is a medial caesura?', ['A break dividing the transition from the secondary theme', 'The end of the recapitulation', 'A theme in the development', 'A key change in the coda'], 'It is a pause in the middle of the exposition.', 'The medial caesura is a break that divides the transition and the secondary theme.'),
      // L15
      mc(L15, 1, 2, 'In a typical recapitulation, in which key does the secondary theme appear?', ['The tonic', 'The dominant', 'The relative minor', 'The subdominant'], 'The tonal conflict is resolved.', 'The secondary theme returns in the tonic, achieving tonal resolution.'),
      tf(L15, 2, 2, 'A development section often fragments and sequences motives from the exposition.', 0, 'It is the least constrained section.', 'Fragmentation, sequence and modulation are typical development techniques.'),
      mc(L15, 3, 3, 'A retransition usually prepares the recapitulation by emphasizing which harmony?', ['The dominant of the home key', 'The Neapolitan chord', 'The relative minor', 'The subdominant of the dominant'], 'It builds tension before the tonic returns.', 'The retransition typically lingers on the dominant of the home key.'),
      tf(L15, 4, 2, 'A coda follows the closing material of the recapitulation.', 0, 'Coda means tail.', 'A coda is an added section after the recapitulation that reinforces the home key.'),
      mc(L15, 5, 2, 'What is the usual order of the three main sections of sonata form?', ['Exposition, development, recapitulation', 'Development, exposition, recapitulation', 'Exposition, recapitulation, development', 'Recapitulation, exposition, development'], 'The tonal story moves from conflict to resolution.', 'The exposition comes first, then the development, then the recapitulation.'),
      // L16
      mc(L16, 1, 2, 'What are the two components of the Ursatz?', ['The Urlinie and the bass arpeggiation', 'The exposition and the recapitulation', 'The foreground and the background', 'The tonic and the subdominant'], 'One is a melodic line and the other is in the bass.', 'The Ursatz combines the fundamental line (Urlinie) with a bass arpeggiation, I-V-I.'),
      mc(L16, 2, 3, 'Which is a possible Urlinie?', ['3-2-1', '1-3-5', '7-5-3', '4-6-1'], 'It is a stepwise descent.', 'The Urlinie descends stepwise to the tonic, as in 3-2-1 or 5-4-3-2-1.'),
      tf(L16, 3, 2, 'A neighbor tone prolongs a note by stepping away and returning.', 0, 'It decorates a stable pitch.', 'A neighbor tone steps away from a note and comes back, prolonging it.'),
      mc(L16, 4, 2, 'Which level of a Schenkerian analysis is the most abstract?', ['Background', 'Foreground', 'Middleground', 'Surface'], 'The Ursatz lives here.', 'The background shows the fundamental structure, the deepest level.'),
      mc(L16, 5, 3, 'In an interruption, on which scale degree does the first descent of the Urlinie stop?', ['2, supported by V', '1, supported by I', '3, supported by I', '5, supported by IV'], 'The first descent ends on the dominant.', 'The line stops on 2 over V, then begins again and completes the descent to 1.'),
      // L17
      mc(L17, 1, 3, 'How is the Tristan chord spelled in the Prelude to Tristan und Isolde?', ['F, B, D-sharp, G-sharp', 'F, A, C, E', 'F, A-flat, C, E-flat', 'F, B-flat, D, G'], 'It contains an augmented fourth above the bass.', 'It is spelled F, B, D-sharp and G-sharp.'),
      tf(L17, 2, 3, 'The pitches of the Tristan chord are enharmonically equivalent to a half-diminished seventh chord.', 0, 'Respell B as C-flat, D-sharp as E-flat and G-sharp as A-flat.', 'F, B, D-sharp and G-sharp equal F, A-flat, C-flat and E-flat, a half-diminished seventh.'),
      mc(L17, 3, 2, 'In which work does the Tristan chord appear?', ['Wagner\'s Tristan und Isolde', 'Bach\'s Art of Fugue', 'Debussy\'s Voiles', 'Beethoven\'s Fifth Symphony'], 'It is named for a character.', 'The chord is named after its use in the Prelude to Wagner\'s opera Tristan und Isolde.'),
      mc(L17, 4, 3, 'To what chord does the Tristan chord resolve in the Prelude?', ['A dominant seventh on E', 'A tonic A minor chord', 'A major seventh on C', 'A diminished triad on G'], 'The context is A minor.', 'It moves to the E dominant seventh chord, E, G-sharp, B and D.'),
      tf(L17, 5, 2, 'Delaying the resolution of dissonant chords is characteristic of late-Romantic harmony.', 0, 'Wagner is the model.', 'Delayed or avoided resolutions weaken tonal clarity and are typical of late-Romantic chromaticism.'),
      // L18
      mc(L18, 1, 3, 'How many distinct whole-tone collections exist?', ['Two', 'Three', 'Six', 'Twelve'], 'Transposing by a whole step gives the same notes.', 'Transposition by a whole step maps the collection onto itself, leaving only two distinct collections.'),
      tf(L18, 2, 2, 'The whole-tone scale contains no half steps.', 0, 'All six steps are equal.', 'Every step in the whole-tone scale is a whole step.'),
      mc(L18, 3, 2, 'Which notes form the C major pentatonic scale?', ['C, D, E, G, A', 'C, D, F, G, B-flat', 'C, E-flat, F, G, B-flat', 'C, D, E, F, G'], 'It has five notes and no half steps.', 'The major pentatonic from C is C, D, E, G, A.'),
      mc(L18, 4, 3, 'What kind of triad can be built from notes of the whole-tone scale?', ['Augmented', 'Major', 'Minor', 'Diminished'], 'Stack thirds within the scale.', 'Thirds within the whole-tone scale are major thirds, so triads are augmented.'),
      tf(L18, 5, 2, 'Planing is the parallel motion of a chord shape as a block.', 0, 'It ignores functional harmony.', 'Planing moves the same chord shape up and down in parallel.'),
      // L19
      mc(L19, 1, 2, 'How many distinct octatonic collections exist?', ['Three', 'Two', 'Four', 'Twelve'], 'It maps onto itself under transposition by a minor third.', 'The pattern repeats every three semitones, so there are three collections.'),
      tf(L19, 2, 2, 'The octatonic scale alternates whole steps and half steps.', 0, 'The name refers to eight notes.', 'The scale strictly alternates whole and half steps.'),
      mc(L19, 3, 3, 'Which chord is contained in the octatonic collection C, D, E-flat, F, G-flat, A-flat, A, B?', ['C, E-flat, G-flat, A', 'C, E, G, B', 'C, E, G, B-flat', 'C, E-flat, G, B-flat'], 'It is a symmetrical chord.', 'C, E-flat, G-flat and A form a fully diminished seventh chord, all drawn from the collection.'),
      mc(L19, 4, 2, 'How many different pitch classes does an octatonic collection contain?', ['Eight', 'Seven', 'Six', 'Ten'], 'Think of the name.', 'Octatonic means eight, so the collection has eight pitch classes.'),
      tf(L19, 5, 3, 'A single octatonic collection can contain both a D major triad and a D minor triad.', 0, 'Check for F and F-sharp.', 'The whole-half collection from C includes D, F, A and D, G-flat (F-sharp), A.'),
      // L20
      mc(L20, 1, 2, 'What does the P transformation do to C major?', ['Produces C minor', 'Produces A minor', 'Produces E minor', 'Produces F major'], 'It keeps the root and the fifth.', 'P changes the quality, so C major becomes C minor.'),
      mc(L20, 2, 3, 'What does the L transformation do to C major?', ['Produces E minor', 'Produces A minor', 'Produces C minor', 'Produces A-flat major'], 'C moves down by a half step.', 'L moves the root down to B, giving E, G, B, an E minor triad.'),
      mc(L20, 3, 3, 'What does the R transformation do to C major?', ['Produces A minor', 'Produces E minor', 'Produces C minor', 'Produces G major'], 'G moves up a whole step.', 'R moves G to A, giving C, E, A, an A minor triad.'),
      tf(L20, 4, 2, 'Each of P, L and R keeps two common tones between the triads it connects.', 0, 'The motion is by a single voice.', 'Only one note moves, so two common tones remain.'),
      mc(L20, 5, 3, 'Alternating P and L from C major produces a cycle of how many distinct triads?', ['Six', 'Four', 'Eight', 'Twelve'], 'It is called the hexatonic cycle.', 'The cycle is C major, C minor, A-flat major, A-flat minor, E major and E minor, six triads.'),
      // L21
      mc(L21, 1, 2, 'What is the prime form of the C major triad?', ['(0, 3, 7)', '(0, 4, 7)', '(0, 5, 8)', '(0, 3, 8)'], 'Prime form is the most compact ordering, starting on 0. Major and minor triads share it.', 'Major and minor triads share the prime form (0, 3, 7), set class 3-11; (0, 4, 7) is the inversion of the same set class.'),
      mc(L21, 2, 2, 'In pitch-class integer notation with C as 0, what number is A?', ['9', '8', '10', '7'], 'Count in semitones up from C.', 'C is 0, D is 2, E is 4, F is 5, G is 7 and A is 9.'),
      mc(L21, 3, 3, 'What is the prime form of the pitch classes D, E-flat and G?', ['(0, 1, 5)', '(0, 4, 5)', '(0, 2, 7)', '(0, 1, 6)'], 'Use 2, 3, 7 and compare with the inversion.', '{2, 3, 7} transposes to (0, 1, 5), and its inversion gives (0, 4, 5); (0, 1, 5) is more compact.'),
      tf(L21, 4, 3, 'Sets related by transposition or inversion belong to the same set class.', 0, 'The prime form is the same.', 'Set classes group sets that are equivalent under transposition and inversion.'),
      tf(L21, 5, 2, 'Normal order is the most compact ascending arrangement of a pitch-class set.', 0, 'It minimizes the span from first to last.', 'Normal order arranges the set in ascending order with the smallest outer interval.'),
      // L22
      mc(L22, 1, 3, 'What is the interval-class vector of a major triad?', ['<001110>', '<002001>', '<000300>', '<010101>'], 'List the pairs: 0-4, 0-7 and 4-7.', 'The pairs give ic4, ic5 and ic3, so the vector is <001110>.'),
      tf(L22, 2, 2, 'For a set of n notes, the digits of its interval-class vector add up to n(n-1)/2.', 0, 'This is the number of pairs.', 'Each pair of notes contributes one interval class, so the sum equals the number of pairs.'),
      mc(L22, 3, 2, 'What do the digits of the vector of any tetrachord add up to?', ['6', '4', '3', '12'], 'Count the pairs.', 'A tetrachord has 4 times 3 divided by 2, which is 6 pairs.'),
      mc(L22, 4, 3, 'What is the interval-class vector of an augmented triad?', ['<000300>', '<001110>', '<002001>', '<060603>'], 'All three intervals are the same.', 'The augmented triad has three major thirds, ic4, so the vector is <000300>.'),
      tf(L22, 5, 3, 'Z-related sets share an interval-class vector but are not related by transposition or inversion.', 0, 'Consider (0, 1, 4, 6) and (0, 1, 3, 7).', 'That is the definition of the Z relation.'),
      // L23
      tf(L23, 1, 2, 'In a twelve-tone row, each of the twelve pitch classes appears exactly once.', 0, 'There are no repeats.', 'A row is an ordering of all twelve pitch classes with no repeated notes.'),
      mc(L23, 2, 2, 'How many forms does a twelve-tone row have, counting P, I, R and RI at all transpositions?', ['48', '12', '24', '36'], 'Four forms times twelve starting notes.', 'Four forms at twelve transpositions give 48.'),
      mc(L23, 3, 3, 'For P0 = 0 2 4 6 8 10 1 3 5 7 9 11, what is the second pitch class of I0?', ['10', '2', '11', '1'], 'Invert each interval from 0.', 'The first step in P0 is up 2, so in I0 it is down 2, which gives 10.'),
      mc(L23, 4, 3, 'For P0 = 0 2 4 6 8 10 1 3 5 7 9 11, what are the first four pitch classes of P5?', ['5 7 9 11', '5 6 8 10', '7 9 11 1', '0 2 4 6'], 'Add 5 to each, modulo 12.', 'Adding 5 gives 5, 7, 9 and 11.'),
      mc(L23, 5, 2, 'In a standard matrix, how is a retrograde form read?', ['Right to left along a row', 'Left to right along a row', 'Top to bottom down a column', 'Along the diagonal'], 'It runs backward through the prime form.', 'Reading a prime row from right to left gives its retrograde.'),
      // L24
      mc(L24, 1, 2, 'What is phasing in minimalism?', ['Identical patterns at slightly different speeds drifting apart and back', 'Gradually adding notes to a pattern', 'Tuning an instrument to the overtone series', 'Choosing notes by coin toss'], 'Two parts begin together.', 'In phasing, two identical patterns move gradually out of alignment and later back.'),
      tf(L24, 2, 2, 'Aleatory music leaves some elements to chance or to the performer.', 0, 'The word comes from a word for dice.', 'In aleatory music, some elements are not fixed by the composer.'),
      mc(L24, 3, 3, 'On what is spectralism chiefly based?', ['The acoustic spectrum and overtones of sound', 'Twelve-tone rows', 'Folk melodies', 'Figured bass'], 'The name refers to the spectrum.', 'Spectral composers derive harmony and form from the analysis of the spectrum of sound.'),
      mc(L24, 4, 2, 'Which feature is typical of minimalism?', ['Repetition of short patterns with gradual change', 'Constant modulation', 'Total serialism', 'Free improvisation only'], 'Process is audible.', 'Minimalism uses repetition and slow, audible change.'),
      tf(L24, 5, 2, 'John Cage used chance operations in the composition of some works.', 0, 'The I Ching was one tool.', 'Cage used chance procedures such as the I Ching to determine musical parameters.'),
      // L25
      mc(L25, 1, 2, 'Which chords form ii-V-I in C major with seventh chords?', ['Dm7, G7, Cmaj7', 'Dm7, G7, Cm7', 'Dm7, G7, C6/4', 'Em7, A7, Dmaj7'], 'The roots are D, G and C.', 'The progression is D minor seventh, G dominant seventh and C major seventh.'),
      mc(L25, 2, 2, 'Which chord is the tritone substitution for G7?', ['D-flat 7', 'D7', 'C-sharp minor 7', 'A-flat 7'], 'The root is a tritone away.', 'The tritone from G is D-flat, so the substitute is D-flat 7.'),
      tf(L25, 3, 3, 'G7 and D-flat 7 share the same tritone, the pitches B and F, with the pitch B spelled C-flat in D-flat 7.', 0, 'Compare thirds and sevenths.', 'The third and seventh of G7 become the seventh and third of D-flat 7.'),
      mc(L25, 4, 3, 'In C minor, which chord quality is the ii chord of a minor ii-V-i?', ['Half-diminished seventh', 'Minor seventh', 'Major seventh', 'Dominant seventh'], 'It is built on D.', 'In C minor the ii chord is D, F, A-flat and C, a half-diminished seventh.'),
      tf(L25, 5, 2, 'In ii-V-I, the seventh of ii resolves down by half step to the third of V.', 0, 'C moves to B.', 'The seventh of Dm7 is C, which falls to B, the third of G7.'),
      // L26
      mc(L26, 1, 2, 'Which note is the ninth of a C9 chord?', ['D', 'E', 'F', 'B-flat'], 'It is a step above the octave.', 'The ninth of C is D.'),
      mc(L26, 2, 2, 'Which note is the thirteenth of a G13 chord?', ['E', 'F', 'C', 'A'], 'The thirteenth is a sixth above the root.', 'The sixth above G is E.'),
      mc(L26, 3, 2, 'Why can E minor seventh substitute for C major seventh?', ['They share E, G and B', 'They share the same root', 'They share C and E only', 'They are enharmonic'], 'Compare the chord tones.', 'E minor seventh contains E, G, B and D, and the first three are shared with C major seventh.'),
      tf(L26, 4, 3, 'The natural eleventh is usually avoided on major chords because it clashes with the major third.', 0, 'The raised eleventh is common instead.', 'The natural eleventh sits a half step above the third, so the raised eleventh is usually preferred.'),
      mc(L26, 5, 3, 'What is backcycling?', ['Approaching a target chord with its dominant, then that chord with its dominant, and so on', 'Playing a progression in reverse', 'Replacing a dominant with a chord a tritone away', 'Repeating the melody an octave lower'], 'It follows the circle of fifths.', 'Backcycling chains dominants backward from a target chord.'),
      // L27
      mc(L27, 1, 2, 'Which notes form D Dorian?', ['D, E, F, G, A, B, C', 'D, E, F-sharp, G, A, B, C', 'D, E-flat, F, G, A, B-flat, C', 'D, E, F, G, A, B-flat, C'], 'It uses the white keys.', 'D Dorian is the white-key scale from D to D.'),
      mc(L27, 2, 2, 'What is the characteristic note of the Lydian mode?', ['The raised fourth', 'The lowered seventh', 'The lowered second', 'The natural sixth'], 'Compare with the major scale.', 'Lydian is a major scale with a raised fourth.'),
      tf(L27, 3, 2, 'Modal jazz often stays on a single mode for long stretches.', 0, 'It contrasts with bebop.', 'Modal jazz uses static harmony, with few chord changes.'),
      mc(L27, 4, 3, 'Which major scale has the same notes as G Mixolydian?', ['C major', 'G major', 'D major', 'F major'], 'Find the parent scale.', 'G Mixolydian, G, A, B, C, D, E, F, uses the notes of C major.'),
      tf(L27, 5, 3, 'Dorian has a natural sixth, while Aeolian has a lowered sixth.', 0, 'Compare D Dorian with D Aeolian.', 'This is the difference that distinguishes the two minor-type modes.'),
      // L28
      mc(L28, 1, 2, 'Which feature best marks a strong analytical paragraph?', ['A claim supported by specific score evidence', 'A bar-by-bar narration', 'A list of facts about the composer', 'A purely personal reaction'], 'It argues something.', 'A good paragraph makes a claim and supports it with specific passages.'),
      tf(L28, 2, 2, 'Citing measure numbers helps readers locate the evidence for a claim.', 0, 'Readers need to find the passage.', 'Measure numbers allow readers to check each example.'),
      mc(L28, 3, 2, 'What does a lowercase Roman numeral with a small circle denote?', ['A diminished triad', 'A major triad', 'An augmented triad', 'A minor seventh chord'], 'The circle marks a quality.', 'A lowercase numeral with ° denotes a diminished triad.'),
      tf(L28, 4, 2, 'Good analysis only describes what happens bar by bar, without interpretation.', 1, 'Analysis asks why.', 'Strong analysis moves from description to an interpretation that can be argued.'),
      mc(L28, 5, 3, 'Which statement is a description rather than an interpretation?', ['The second theme is in G major.', 'The second theme unsettles the tonic until the recapitulation.', 'The harmony expresses longing.', 'The modulation heightens the drama.'], 'A description states what is there.', 'The key of the second theme is a fact in the score, while the other statements argue about effect.'),
    ],
  },
};
