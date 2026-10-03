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

const L01 = 'music-theory-elementary.l01';
const L02 = 'music-theory-elementary.l02';
const L03 = 'music-theory-elementary.l03';
const L04 = 'music-theory-elementary.l04';
const L05 = 'music-theory-elementary.l05';
const L06 = 'music-theory-elementary.l06';
const L07 = 'music-theory-elementary.l07';
const L08 = 'music-theory-elementary.l08';
const L09 = 'music-theory-elementary.l09';
const L10 = 'music-theory-elementary.l10';
const L11 = 'music-theory-elementary.l11';
const L12 = 'music-theory-elementary.l12';
const L13 = 'music-theory-elementary.l13';
const L14 = 'music-theory-elementary.l14';
const L15 = 'music-theory-elementary.l15';
const L16 = 'music-theory-elementary.l16';
const L17 = 'music-theory-elementary.l17';
const L18 = 'music-theory-elementary.l18';
const L19 = 'music-theory-elementary.l19';
const L20 = 'music-theory-elementary.l20';

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'music-theory-elementary',
    label: 'Music Theory (Grades 3-5)',
    blurb: 'Read and write music: the staff, clefs, note names, rhythm and time signatures, simple scales and keys, intervals, Italian terms, the orchestra, simple forms, and six great composers.',
    accent: '#FFD24A',
    framework: 'ncas',
    tracks: [
      {
        id: 'music-theory-elementary.t1',
        title: 'Reading Music: Staff, Clefs and Notes',
        blurb: 'Where notes live on the staff, how clefs name them, and how long each note lasts.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L01,
            title: 'The Staff and the Clefs',
            blurb: 'Music is written on five lines, and a clef tells you which pitch each line means.',
            minutes: 6,
            body: `Imagine a ladder lying on its side. Music is written on something like that: the staff. A staff has five lines and four spaces between them. A note can sit on a line or in a space. The higher the note sits on the staff, the higher it sounds.

A staff by itself does not say which pitches the lines stand for. A clef does. A clef is the fancy symbol at the very beginning of each staff.

The treble clef is used for higher sounds. Flutes, violins, trumpets and the right hand of a piano often read it. It is also called the G clef, because its curl circles the line where the note G sits.

The bass clef is used for lower sounds. Cellos, tubas, bassoons and the left hand of a piano often read it. It is also called the F clef.

When a tune goes too high or too low for the five lines, we add short extra lines called ledger lines.

Try this: hum a low note, then a high note. Now draw two dots on a staff, a low one and a high one, and say which belongs higher up. The staff is just a picture of high and low sounds, with a clef acting as the key that unlocks the names.`,
          },
          {
            id: L02,
            title: 'Note Names in the Treble Clef',
            blurb: 'Learn the line and space names of the treble staff with two easy memory tricks.',
            minutes: 7,
            body: `Music uses only seven letter names: A, B, C, D, E, F and G. After G, the alphabet starts over at A, but higher.

On the treble staff, count the lines from the bottom: line one, line two, and so on up to line five. The notes on the lines are E, G, B, D and F. A popular memory sentence is Every Good Boy Does Fine. You can invent your own, such as Every Green Bus Drives Fast.

The notes in the four spaces, from bottom to top, are F, A, C and E. They spell the word FACE, which is easy to remember.

Notice the pattern. Moving from a line to the next space above, or from a space to the next line above, takes you to the next letter of the musical alphabet. So the bottom line is E, the first space is F, the second line is G, and so on.

Middle C is special. In treble clef it sits on a little ledger line just below the staff. It is called middle C because on a piano it is near the middle of the keyboard.

Practise by pointing at each line and saying its letter, bottom to top, then doing the same for the spaces.`,
          },
          {
            id: L03,
            title: 'The Bass Clef and the Grand Staff',
            blurb: 'The bass clef names lower notes, and the piano joins two staves into a grand staff.',
            minutes: 7,
            body: `The bass clef has different note names from the treble clef. On the bass staff, the notes on the lines, from bottom to top, are G, B, D, F and A. A memory sentence is Good Boys Do Fine Always.

The notes in the spaces, from bottom to top, are A, C, E and G. One sentence for these is All Cows Eat Grass.

Piano music uses two staves joined by a brace. This is called the grand staff. The treble staff is on top and is usually played by the right hand. The bass staff is on the bottom and is usually played by the left hand.

Where is middle C? It sits on its own little ledger line between the two staves. Looking from the treble side, it is just below the treble staff. Looking from the bass side, it is just above the bass staff. It is the same note, written in two ways.

Because the letters repeat in order, you can step from one staff to the other by counting letters. The top line of the bass staff is A. The next note up is B, and the one after that is middle C on its ledger line.

Try saying the line names of both staves out loud to feel the difference.`,
          },
          {
            id: L04,
            title: 'Note Values and Rests',
            blurb: 'Notes last for different numbers of beats, and every note has a matching rest for silence.',
            minutes: 7,
            body: `The beat is the steady pulse you tap your foot to. Notes are written in different shapes to show how many beats they last.

A whole note lasts four beats. It is an open oval with no stem. A half note lasts two beats: an open oval with a stem. A quarter note lasts one beat: a filled-in oval with a stem. An eighth note lasts half a beat: it is filled in, has a stem, and has a flag. Two eighth notes are often joined by a beam, and together they make one beat. A sixteenth note lasts a quarter of a beat.

Each size is half as long as the one before it. Two half notes equal one whole note. Two quarter notes equal one half note. Two eighth notes equal one quarter note.

Silence is part of music too. A rest is a symbol for silence, and each note value has its own rest. A quarter rest means one beat of silence. A half rest means two beats of silence, and a whole rest means a full measure of silence in most simple time signatures.

Clap four beats and count aloud: one, two, three, four. Then try clapping only on beats one and three, and resting on two and four.`,
          },
        ],
      },
      {
        id: 'music-theory-elementary.t2',
        title: 'Rhythm and Meter',
        blurb: 'Counting in groups, lengthening notes with dots and ties, and reading and writing rhythms.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L05,
            title: 'Time Signatures: 2/4, 3/4 and 4/4',
            blurb: 'The two numbers at the start tell you how many beats are in each measure and which note gets the beat.',
            minutes: 7,
            body: `Beats are grouped into measures, which are separated by vertical lines called bar lines. A time signature at the start of the music tells you how the beats are grouped. It looks like a fraction but has no line.

The top number tells you how many beats are in each measure. The bottom number tells you which kind of note counts as one beat. When the bottom number is 4, a quarter note gets the beat.

In 2/4 there are two quarter-note beats in each measure. You count: one, two, one, two. It feels like marching, left, right.

In 3/4 there are three beats in each measure. You count: one, two, three, one, two, three. This is the swaying feel of a waltz.

In 4/4 there are four beats in each measure. You count: one, two, three, four. It is the most common time signature, and it is sometimes shown with a letter C and called common time.

The first beat of every measure is usually the strongest. Try this: say the words "ONE two three" over and over for 3/4, putting a little extra push on ONE.

The time signature does not change how fast the music goes. It only tells you how the beats are grouped.`,
          },
          {
            id: L06,
            title: 'Dotted Notes and Ties',
            blurb: 'A dot adds half the note value, and a tie joins two notes of the same pitch into one long sound.',
            minutes: 7,
            body: `Sometimes a note needs to last longer than a basic note value. There are two simple tools for that.

The first is a dot. A dot placed after a note adds half of that note value. A half note is two beats, and half of two is one, so a dotted half note lasts 2 + 1 = 3 beats. A quarter note is one beat, so a dotted quarter note lasts 1 + one half = one and a half beats. A dotted whole note would last 4 + 2 = 6 beats.

A dotted half note fills a whole measure of 3/4. In 4/4, a dotted half note and one quarter note fill the measure, because 3 + 1 = 4.

The second tool is a tie. A tie is a curved line that joins two notes of the same pitch. You play the first note and hold it for the length of both notes, without playing the second one again. A half note tied to a quarter note lasts 2 + 1 = 3 beats, the same as a dotted half note.

Ties are useful because they can connect notes across a bar line, so a long sound can start in one measure and finish in the next.

Practise by adding: write the beats for a dotted quarter and an eighth. They make exactly two beats.`,
          },
          {
            id: L07,
            title: 'Reading and Writing Rhythms',
            blurb: 'Count every beat carefully, fill each measure exactly, and use rests as part of the rhythm.',
            minutes: 8,
            body: `Reading a rhythm is like solving a small puzzle: every measure must add up to the right number of beats.

Start by looking at the time signature. In 4/4, each measure must contain four quarter-note beats. That might be four quarter notes, or two half notes, or a half note and two quarter notes, or a whole note.

To count eighth notes, say the beat numbers and say "and" between them: one-and, two-and, three-and, four-and. Each number and each "and" is one eighth note, so a measure of 4/4 holds eight eighth notes. A measure of 2/4 holds four.

Rests count too. If a measure of 4/4 has a quarter note, a quarter rest and a half note, you play on beat one, stay silent on beat two, and play the half note on beat three and hold it through beat four.

When you write your own rhythm, follow three steps.
1. First, pick a time signature.
2. Second, write notes and rests until the beats add up exactly.
3. Third, draw a bar line, and begin the next measure.

Try this: tap a four-beat pattern using quarter notes and one pair of eighth notes. Then write it down and add it up to check.`,
          },
        ],
      },
      {
        id: 'music-theory-elementary.t3',
        title: 'Scales, Keys and Intervals',
        blurb: 'Major scales, the sharps and flats that define a key, the distance between notes, and home and away chords.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L08,
            title: 'Whole Steps, Half Steps and the C Major Scale',
            blurb: 'A major scale follows a pattern of whole and half steps; C major uses only the white keys.',
            minutes: 7,
            body: `A scale is a ladder of notes going up or down in order. The distance between two neighbouring piano keys, black or white, is a half step. Two half steps make a whole step.

A major scale has eight notes, counting the starting note again at the top. It always follows the same pattern of steps: whole, whole, half, whole, whole, whole, half. You can remember it as W W H W W W H.

Start on C and use only white keys. C to D is a whole step, because there is a black key between them. D to E is a whole step too. E to F is a half step, because there is no black key between E and F. Then F to G, G to A and A to B are all whole steps, and B to C is a half step.

So the C major scale is C, D, E, F, G, A, B, C. It has no sharps or flats.

The notes of a scale are numbered from one to eight, and these numbers are called scale degrees. In C major, C is degree one, D is degree two, and so on.

The sound of the major scale is the familiar do-re-mi sound. Try singing it up and down, listening for the two half steps, between degrees three and four, and seven and eight.`,
          },
          {
            id: L09,
            title: 'Major Scales with One or Two Sharps or Flats',
            blurb: 'Keep the same W W H W W W H pattern, and the scales on G, D, F and B flat need sharps or flats.',
            minutes: 8,
            body: `If you start a major scale on a different note, the step pattern stays the same, but some notes must be changed with sharps or flats to keep the pattern right.

G major is G, A, B, C, D, E, F-sharp, G. The pattern needs the seventh note to be a half step below the top G, so F must be raised to F-sharp. G major has one sharp.

D major is D, E, F-sharp, G, A, B, C-sharp, D. It needs two sharps: F-sharp and C-sharp.

Now flats. F major is F, G, A, B-flat, C, D, E, F. A flat lowers a note by a half step. F major has one flat: B-flat. Without it, the half step would land in the wrong place.

B-flat major is B-flat, C, D, E-flat, F, G, A, B-flat. It has two flats: B-flat and E-flat.

A handy summary: C major has none, G has one sharp, D has two sharps, F has one flat, and B-flat has two flats.

You can check any scale by counting its steps. Write the notes, then test for whole, whole, half, whole, whole, whole, half. If a step is the wrong size, a sharp or flat is needed.

Try playing G major on a piano and listen for the black key F-sharp near the end.`,
          },
          {
            id: L10,
            title: 'Key Signatures',
            blurb: 'A key signature collects the sharps or flats of a scale at the start of the music.',
            minutes: 7,
            body: `Writing a sharp or flat beside every note would be tiring. Instead, music uses a key signature: the sharps or flats are written once, right after the clef at the start of each staff. They then apply to every note with that letter name, in every octave, for the whole piece.

The key signature tells you the key, which is the home scale of the music. A tune in the key of G major uses the notes of the G major scale.

Here are the ones for this level. No sharps or flats means C major. One sharp, F-sharp, means G major. Two sharps, F-sharp and C-sharp, means D major. One flat, B-flat, means F major. Two flats, B-flat and E-flat, means B-flat major.

Sharps and flats always appear in a fixed order. The order of sharps starts with F, then C, then G. That is why the first sharp in any key signature is F-sharp and the second is C-sharp. The order of flats starts with B, then E, then A.

If a note appears with a sharp, flat, or natural sign that is not part of the key signature, it is called an accidental, and it lasts only until the end of that measure.

Try this: look at a piece with one sharp on the top line and check that every F is played as F-sharp.`,
          },
          {
            id: L11,
            title: 'Intervals by Number',
            blurb: 'An interval is the distance between two notes, named by counting letter names from 1 to 8.',
            minutes: 7,
            body: `An interval is the distance between two notes. At this level, we name intervals by number. To find the number, count the letter names from the lower note to the upper note, including both of them.

Start on C. The same note, C to C, is a unison, or a 1st. C to D is a 2nd, because you count C, D. C to E is a 3rd: C, D, E. C to F is a 4th. C to G is a 5th. C to A is a 6th. C to B is a 7th. C up to the next C is an octave, or an 8th.

On the staff, there is a quick trick. Notes on neighbouring positions, such as a line and the space just above it, make a 2nd. Notes that skip one position, such as one line and the next line up, or one space and the next space up, make a 3rd.

The same counting works from any starting note. D up to A is D, E, F, G, A, so it is a 5th.

Intervals can be played one after the other, which is a melodic interval, or at the same time, which is a harmonic interval.

Try this: sing the first two notes of any tune you know, and work out which interval they make by counting their letter names.`,
          },
          {
            id: L12,
            title: 'Tonic and Dominant',
            blurb: 'The first degree of a scale feels like home, and the fifth degree pulls toward it.',
            minutes: 6,
            body: `Each degree of a scale has a job and a name. Two of the most important are the tonic and the dominant.

The tonic is the first note of the scale. It is the home note. In C major, the tonic is C; in G major, it is G. A song in a major key often ends on the tonic, and that is why it feels finished, like walking back through your front door.

The dominant is the fifth note of the scale. It is the note a 5th above the tonic. In C major, count C, D, E, F, G: the dominant is G. In G major, count G, A, B, C, D: the dominant is D. In F major, the dominant is C.

The tonic and dominant are strongly linked. Chords built on these two notes are used again and again in music, and moving from the dominant back to the tonic gives a strong sense of arriving home.

You can try this on a piano. Play the C major scale, stop on G and listen. The sound feels unfinished. Then play C, and the music settles.

When you name the key of a piece, look at the last note of the melody. Very often it is the tonic.`,
          },
        ],
      },
      {
        id: 'music-theory-elementary.t4',
        title: 'Expression: Dynamics and Tempo',
        blurb: 'Italian words that tell musicians how loud and how fast to play.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L13,
            title: 'Dynamics: Loud and Soft',
            blurb: 'Italian words and letters show how loudly or softly to play.',
            minutes: 6,
            body: `Dynamics tell the performer how loud or soft to play. Many of the words we use are Italian, because Italian became the common language for musical directions long ago.

Piano means soft. Forte means loud. The keyboard instrument we call the piano got its name from the older name pianoforte, soft-loud, because it could play both softly and loudly depending on how hard the keys were pressed.

Dynamics are usually written with letters. The letter p stands for piano, and pp means pianissimo, very soft. The letter f stands for forte, and ff means fortissimo, very loud. The word mezzo means medium, so mp is mezzo piano, medium soft, and mf is mezzo forte, medium loud.

From softest to loudest, the common order is pp, p, mp, mf, f, ff.

Music can also change gradually. A crescendo means gradually getting louder. A diminuendo, also called a decrescendo, means gradually getting softer. On the page, these are often drawn as long hairpin shapes opening or closing.

Dynamics give music feeling. A soft lullaby and a thundering march might use exactly the same notes, but the dynamics change the story.

Try singing a short song three ways: pp, mf, and ff. Notice how the mood changes.`,
          },
          {
            id: L14,
            title: 'Tempo Terms in Italian',
            blurb: 'Tempo is the speed of the beat, and Italian words describe it from slow to very fast.',
            minutes: 6,
            body: `Tempo means the speed of the beat. It can be written as a number of beats per minute, or with an Italian word at the start of the music.

Here are common words, from slow to fast. Largo means slow and broad. Adagio means slow. Andante means at a walking pace. Moderato means at a moderate speed. Allegro means fast and lively. Presto means very fast.

There are also words for changing speed. Ritardando, often shortened to rit., means gradually slowing down. Accelerando means gradually speeding up. A tempo means to go back to the original speed after a change.

A fermata is a curved symbol with a dot, placed over a note or rest. It means to hold that note or rest longer than its written length.

Tempo in beats per minute gives an exact number. If a piece is at 60 beats per minute, each beat takes one second. At 120 beats per minute, there are two beats every second, so each beat lasts half a second.

Metronomes are devices that click at a steady tempo, and they help musicians practise.

Try tapping a steady beat, then walk to it. That is about andante. Then try jogging to the beat, and you are moving closer to allegro.`,
          },
        ],
      },
      {
        id: 'music-theory-elementary.t5',
        title: 'The Orchestra, Forms and Composers',
        blurb: 'Instrument families, how an orchestra sits, simple musical shapes, six composers, and your own composing.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L15,
            title: 'The Four Instrument Families',
            blurb: 'Orchestra instruments are grouped by how they make sound: strings, woodwinds, brass and percussion.',
            minutes: 7,
            body: `Instruments in the orchestra are sorted into four families, based on how they make their sound.

The strings make sound when strings vibrate, usually by drawing a bow across them. The main orchestral strings are the violin, viola, cello and double bass. The violin is the smallest and highest, and the double bass is the largest and lowest. The harp is also a stringed instrument, but its strings are plucked.

The woodwinds make sound when air is blown across an opening or against a reed. The flute and piccolo are woodwinds, and so are the oboe, clarinet and bassoon. The flute is a woodwind even though it is usually made of metal, because it is grouped by how it makes sound, not by its material.

The brass family has players buzz their lips into a metal mouthpiece. It includes the trumpet, French horn, trombone and tuba. The tuba is the lowest of these.

The percussion family is played by striking, shaking or scraping. It includes timpani, snare drum, cymbals, triangle and xylophone.

Listen to a piece and try to pick out the families: a singing violin is a string sound, a bright trumpet is brass, and a booming timpani is percussion.`,
          },
          {
            id: L16,
            title: 'Orchestra Seating',
            blurb: 'The orchestra sits in a fan shape around the conductor, with families grouped together.',
            minutes: 6,
            body: `An orchestra is arranged so that the players can see the conductor and hear each other. The conductor stands at the front, on a small platform called a podium, and the players sit in a half-circle fan facing them.

The strings sit nearest the front, in a curve around the conductor. In a common arrangement, the first violins usually sit on the audience left side of the conductor. The second violins sit next to them, then the violas and cellos, and the double basses sit toward the back of the string section.

The woodwinds sit in the middle of the stage, behind the strings. You will usually find flutes and oboes in one row, with clarinets and bassoons behind or beside them.

The brass sit further back, behind the woodwinds, because their sound is so powerful. Trumpets, trombones and tubas are often found here, and the French horns sit nearby.

The percussion sit at the very back. This is where you will find the timpani, which are large kettledrums, along with the other drums and cymbals.

The exact arrangement can vary between orchestras and pieces, but the idea stays the same: families sit together, the quieter ones are close to the front, and the loudest are further back.

Try drawing the stage with the conductor at the bottom and label each family.`,
          },
          {
            id: L17,
            title: 'Simple Forms: AB, ABA, Rondo and Variations',
            blurb: 'Composers organise music into sections, and letters show which sections repeat or contrast.',
            minutes: 7,
            body: `Form is the plan or shape of a piece. We use letters to show the plan. A letter stands for a section of music. When a section comes back, it gets the same letter.

AB form, sometimes called binary form, has two different sections. The first is A and the second is B, which contrasts with it, for example by sounding higher, softer or in a different mood.

ABA form, called ternary form, has three sections. It begins with A, moves to a contrasting B, then returns to A. It is like a sandwich: the same bread on both sides. A good example of the feeling is going away from home and coming back.

A rondo brings the main tune A back again and again, with different music between. A simple rondo pattern is ABACA: the A section appears three times, and B and C are the contrasting sections.

In theme and variations, a composer begins with a theme, which is a short, memorable tune. Then the tune is played again and again, but each time it is changed. The changes might be a different speed, a new rhythm, higher or lower notes, or a different mood.

Listen to a favourite short piece and try to label it with letters. Each time something new arrives, give it a new letter.`,
          },
          {
            id: L18,
            title: 'Composer Profiles: Bach, Mozart and Beethoven',
            blurb: 'Three famous German-speaking composers from the 1600s to the 1800s.',
            minutes: 7,
            body: `Johann Sebastian Bach was a German composer who lived from 1685 to 1750. He worked in the Baroque period. He was a skilled organist, and he wrote many pieces for the organ, as well as pieces for orchestra, such as the Brandenburg Concertos.

Wolfgang Amadeus Mozart was born in 1756 in Salzburg, which is now in Austria. He was a child prodigy, which means he showed amazing musical ability very young, and he travelled around Europe performing as a child. He worked in the Classical period and wrote symphonies, piano music and operas, including The Magic Flute. He died in Vienna in 1791, at the age of 35.

Ludwig van Beethoven was born in 1770 in Bonn, in Germany, and died in 1827. He is known for bridging the Classical period and the Romantic period. He wrote nine symphonies, and his ninth symphony includes singers as well as the orchestra. As an adult, Beethoven gradually lost his hearing, yet he kept composing.

All three composers wrote music that people still play today. They show how different musical periods have their own styles, but each of them used the same musical tools you are learning now: scales, keys, rhythm and form.

Try finding a short recording of each composer and notice the differences.`,
          },
          {
            id: L19,
            title: 'Composer Profiles: Clara Schumann, Joplin and Tchaikovsky',
            blurb: 'A pianist-composer, the king of ragtime, and the Russian master of ballet music.',
            minutes: 7,
            body: `Clara Schumann lived from 1819 to 1896. She was a brilliant pianist who started performing as a young girl and kept giving concerts across Europe for many years. She was also a composer, and she wrote songs and piano music. She married the composer Robert Schumann, and she played and promoted his music as well as her own.

Scott Joplin was an American composer and pianist who died in 1917. He is best known for ragtime, a lively piano style that uses syncopation, which means placing accents on weak beats or between the beats. Two of his well-known pieces are Maple Leaf Rag and The Entertainer. Ragtime influenced later American music, including jazz.

Pyotr Ilyich Tchaikovsky was a Russian composer who lived from 1840 to 1893. He is famous for his ballets, including Swan Lake, The Sleeping Beauty and The Nutcracker. His music has memorable melodies and bright orchestral colours, and his Nutcracker music is often played at holiday time.

These three composers lived in different places and wrote in different styles, but they all show how a composer can have a distinct voice.

Try clapping a syncopated rhythm: tap lightly on the beat, then add an accent between two beats. That off-beat push is the heart of ragtime.`,
          },
          {
            id: L20,
            title: 'Composing Your Own Music',
            blurb: 'Use everything you have learned to plan and write a short melody with a clear shape.',
            minutes: 8,
            body: `Composing means making up your own music. You already have the tools; now you can put them to use.

Step one: choose a key and a time signature. For example, pick C major and 4/4. This gives you the notes to use and the number of beats in each measure.

Step two: write a rhythm first. A four-bar rhythm in 4/4 has 16 beats in total. Fill each measure exactly, with a mix of quarter notes, half notes and perhaps one pair of eighth notes. Include a rest if you like.

Step three: add pitches. Give each rhythm note a letter name from your scale. Move mostly by steps, with a few small jumps, because this is easy to sing.

Step four: end well. Finish on the tonic, the first note of your key, on a long note. Your listeners will feel that the tune has come home.

Step five: add expression. Choose a tempo word such as andante or allegro, and write dynamics such as mp or f.

For a bigger project, try an ABA form. Write a four-bar A section, a contrasting four-bar B section that starts on a higher note, and then repeat A.

Always play your tune and listen. Change anything that does not sound the way you want.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'music-theory-elementary',
    questions: [
      // L01
      tf(L01, 1, 1, 'A music staff has five lines.', 0, 'Count the lines in a staff.', 'A staff has five lines and four spaces.'),
      mc(L01, 2, 1, 'Which clef is also called the G clef and is used for higher sounds?', ['Treble clef', 'Bass clef', 'Dotted clef', 'Octave clef'], 'Violins and flutes read this clef.', 'The treble clef circles the line where G sits and is used for higher pitches.'),
      tf(L01, 3, 1, 'The higher a note sits on the staff, the lower it sounds.', 1, 'Think of a ladder: higher means higher.', 'Notes placed higher on the staff sound higher in pitch.'),
      mc(L01, 4, 2, 'How many spaces are there between the lines of a staff?', ['4', '5', '3', '6'], 'There is one fewer space than lines.', 'Five lines leave four spaces between them.'),
      mc(L01, 5, 2, 'Which instrument usually reads the bass clef?', ['Cello', 'Flute', 'Violin', 'Piccolo'], 'It is a low string instrument.', 'The cello plays low notes and reads bass clef; the others normally read treble clef.'),
      // L02
      mc(L02, 1, 1, 'Which letters name the lines of the treble staff, from bottom to top?', ['E G B D F', 'F A C E', 'G B D F A', 'A C E G'], 'Every Good Boy Does Fine.', 'The treble-clef lines are E, G, B, D and F from bottom to top.'),
      mc(L02, 2, 1, 'Which word do the treble-clef space notes spell, from bottom to top?', ['FACE', 'EGBDF', 'CAFE', 'BEAD'], 'It is a word you can see in a mirror.', 'The four spaces are F, A, C and E, spelling FACE.'),
      mc(L02, 3, 2, 'What is the name of the note on the bottom line of the treble staff?', ['E', 'F', 'G', 'D'], 'It is the first of EGBDF.', 'The bottom line of the treble staff is E.'),
      mc(L02, 4, 2, 'What is the note in the second space from the bottom of the treble staff?', ['A', 'C', 'F', 'E'], 'The spaces are F, A, C, E.', 'The spaces from bottom to top are F, A, C, E, so the second is A.'),
      tf(L02, 5, 2, 'Middle C is written on a short ledger line just below the treble staff.', 0, 'Think of the ledger line.', 'In treble clef, middle C sits on a ledger line directly under the staff.'),
      // L03
      mc(L03, 1, 1, 'Which letters name the lines of the bass staff, from bottom to top?', ['G B D F A', 'E G B D F', 'A C E G', 'F A C E'], 'Good Boys Do Fine Always.', 'The bass-clef lines are G, B, D, F and A from bottom to top.'),
      mc(L03, 2, 2, 'What is the note in the bottom space of the bass staff?', ['A', 'G', 'C', 'E'], 'The bass spaces are A, C, E, G.', 'The spaces from bottom to top are A, C, E, G, so the bottom space is A.'),
      mc(L03, 3, 2, 'What is the note in the top space of the bass staff?', ['G', 'A', 'F', 'B'], 'The last of A C E G.', 'The top space of the bass staff is G.'),
      tf(L03, 4, 1, 'Piano music uses a grand staff made of a treble staff and a bass staff joined together.', 0, 'The piano plays both high and low notes.', 'The grand staff joins treble and bass staves, usually for the right and left hands.'),
      mc(L03, 5, 3, 'Where is middle C written on the grand staff?', ['On a short ledger line between the treble and bass staves', 'On the top line of the bass staff', 'On the bottom line of the treble staff', 'In the top space of the treble staff'], 'It sits between the two staves.', 'Middle C sits on its own ledger line between the staves, below the treble and above the bass.'),
      // L04
      mc(L04, 1, 1, 'How many beats does a whole note get?', ['4', '2', '1', '3'], 'It is the longest of the basic notes.', 'A whole note lasts four beats.'),
      tf(L04, 2, 1, 'A quarter rest means one beat of silence in 4/4.', 0, 'A rest matches the note of the same name.', 'A quarter rest is silent for the length of a quarter note, one beat.'),
      mc(L04, 3, 2, 'How many eighth notes equal one half note?', ['4', '2', '8', '3'], 'A half note is two beats; an eighth is half a beat.', 'A half note is two beats, and each eighth is half a beat, so four eighths fit.'),
      mc(L04, 4, 2, 'Which pair of notes together lasts 3 beats?', ['A half note and a quarter note', 'Two quarter notes', 'A whole note', 'Four eighth notes'], 'Add 2 + 1.', 'A half note is 2 beats and a quarter is 1 beat, giving 3; the others total 2 or 4.'),
      tf(L04, 5, 2, 'A sixteenth note lasts longer than an eighth note.', 1, 'Each smaller note is half as long.', 'A sixteenth lasts a quarter of a beat, shorter than an eighth at half a beat.'),
      // L05
      mc(L05, 1, 1, 'How many beats are in each measure of 3/4?', ['3', '4', '2', '6'], 'Look at the top number.', 'The top number 3 means three beats per measure.'),
      mc(L05, 2, 1, 'In 4/4, what does the bottom number 4 tell you?', ['A quarter note gets one beat', 'There are four measures', 'The music is very fast', 'A whole note gets one beat'], 'The bottom number names the beat note.', 'A bottom number of 4 means the quarter note is the beat.'),
      tf(L05, 3, 1, 'In 2/4 there are two quarter-note beats in each measure.', 0, 'Read the fraction.', 'The 2 on top means two beats, and the 4 on the bottom means quarter-note beats.'),
      mc(L05, 4, 2, 'Which time signature has the swaying feel of a waltz?', ['3/4', '2/4', '4/4', '1/4'], 'ONE two three, ONE two three.', 'A waltz is in three beats per measure, so 3/4.'),
      mc(L05, 5, 2, 'A 4/4 measure contains a half note and one quarter note. How many beats are still needed to fill it?', ['1', '2', '3', '0'], '2 + 1 = 3, so how many are left of 4?', 'The half and quarter total 3 beats, so one more beat is needed to reach 4.'),
      // L06
      mc(L06, 1, 1, 'What does a dot after a note do?', ['Adds half the note value', 'Doubles the note value', 'Makes the note silent', 'Subtracts half the note value'], 'It adds a bit more length.', 'A dot lengthens a note by half of its original value.'),
      mc(L06, 2, 2, 'How many beats does a dotted half note get in 4/4?', ['3', '2', '4', '1'], 'Half note is 2, plus half of 2.', 'A half note is 2 beats and the dot adds 1, so 3 beats.'),
      mc(L06, 3, 2, 'How many beats does a dotted quarter note get?', ['1 1/2', '2', '1', '3'], 'Quarter is 1, plus half of 1.', 'A quarter note is 1 beat, and the dot adds half a beat, giving 1 1/2 beats.'),
      tf(L06, 4, 2, 'A tie joins two notes of the same pitch into one longer sound.', 0, 'It is a curved line.', 'A tie connects same-pitch notes so the sound is held for their combined length.'),
      mc(L06, 5, 3, 'A quarter note tied to a half note lasts how many beats?', ['3', '2', '4', '1'], 'Add the two lengths.', 'A quarter is 1 beat and a half is 2 beats, so the tied note lasts 3 beats.'),
      // L07
      mc(L07, 1, 2, 'A measure of 3/4 has a half note. Which note fills the rest of the measure?', ['A quarter note', 'A half note', 'A whole note', 'An eighth note'], 'Three beats total, two used.', 'A half note is 2 beats, so one quarter note makes up the remaining beat of 3.'),
      tf(L07, 2, 1, 'Eighth notes are often counted as "1 and 2 and".', 0, 'The word "and" falls between the numbers.', 'Each number and each "and" is one eighth note.'),
      mc(L07, 3, 2, 'How many eighth notes fit in one measure of 2/4?', ['4', '2', '8', '6'], 'Two beats, two eighths per beat.', 'Each quarter-note beat holds two eighths, so two beats hold four.'),
      mc(L07, 4, 3, 'A 4/4 measure has a quarter note, a quarter rest, then a half note. On which beats do you start playing a note?', ['1 and 3', '1 and 2', '2 and 3', '1, 2 and 3'], 'The rest is on beat 2.', 'You play on beat 1, rest on beat 2, then start the half note on beat 3 and hold it through beat 4.'),
      tf(L07, 5, 3, 'A whole note fits inside one measure of 3/4.', 1, 'Compare 4 beats with 3 beats.', 'A whole note lasts 4 beats, which is more than the 3 beats in a 3/4 measure.'),
      // L08
      mc(L08, 1, 1, 'What is the pattern of steps in a major scale?', ['Whole, whole, half, whole, whole, whole, half', 'Half, half, whole, half, half, half, whole', 'Whole, half, whole, half, whole, half, whole', 'Whole, whole, whole, half, whole, whole, half'], 'W W H W W W H.', 'Every major scale follows whole, whole, half, whole, whole, whole, half.'),
      mc(L08, 2, 1, 'Which notes make up the C major scale?', ['C D E F G A B C', 'C D E F# G A B C', 'C D Eb F G A Bb C', 'C E G C E G C E'], 'Only the white keys.', 'C major uses all the white-key notes from C to C.'),
      tf(L08, 3, 1, 'A major scale has eight notes if you count the starting note again at the top.', 0, 'Count C to the next C.', 'The scale runs from one note up to its octave, giving eight notes counting both ends.'),
      mc(L08, 4, 2, 'Between which pairs of notes in C major are the half steps?', ['E to F and B to C', 'C to D and D to E', 'F to G and G to A', 'A to B and B to C'], 'No black key sits between them.', 'There is no black key between E and F or between B and C, so those are half steps.'),
      mc(L08, 5, 2, 'Which note is a whole step above C?', ['D', 'C-sharp', 'E', 'D-flat'], 'Two half steps up.', 'C to D is two half steps, or one whole step.'),
      // L09
      mc(L09, 1, 2, 'Which sharp does the G major scale have?', ['F-sharp', 'C-sharp', 'G-sharp', 'B-sharp'], 'It affects the seventh note.', 'G major has one sharp, F-sharp.'),
      mc(L09, 2, 2, 'Which sharps does D major have?', ['F-sharp and C-sharp', 'F-sharp only', 'C-sharp and G-sharp', 'B-flat and E-flat'], 'It has two sharps.', 'D major has F-sharp and C-sharp.'),
      mc(L09, 3, 2, 'Which flat does the F major scale have?', ['B-flat', 'E-flat', 'A-flat', 'F-flat'], 'It has one flat.', 'F major has one flat, B-flat.'),
      tf(L09, 4, 2, 'B-flat major has two flats, B-flat and E-flat.', 0, 'Think of the two flats in the scale.', 'The B-flat major scale is B-flat, C, D, E-flat, F, G, A, which uses B-flat and E-flat.'),
      mc(L09, 5, 3, 'What is the third note of the D major scale?', ['F-sharp', 'F', 'G', 'E'], 'D, E, then...', 'D major is D, E, F-sharp, so the third note is F-sharp.'),
      // L10
      tf(L10, 1, 1, 'A key signature is written at the start of the staff, right after the clef.', 0, 'It is written once.', 'The key signature appears after the clef at the beginning of each staff.'),
      mc(L10, 2, 2, 'A key signature with one sharp (F-sharp) means which major key?', ['G major', 'D major', 'F major', 'C major'], 'The first key with a sharp.', 'One sharp, F-sharp, is the key signature of G major.'),
      mc(L10, 3, 2, 'A key signature with one flat (B-flat) means which major key?', ['F major', 'B-flat major', 'G major', 'D major'], 'The first key with a flat.', 'One flat, B-flat, is the key signature of F major.'),
      mc(L10, 4, 2, 'A key signature with two flats (B-flat and E-flat) means which major key?', ['B-flat major', 'F major', 'D major', 'E-flat major'], 'The key is named after the first flat.', 'Two flats, B-flat and E-flat, belong to B-flat major.'),
      tf(L10, 5, 3, 'In a key signature, the first sharp is F-sharp and the second is C-sharp.', 0, 'Order of sharps: F, C, G...', 'Sharps always appear in the order F, C, G, D, A, E, B.'),
      // L11
      mc(L11, 1, 1, 'What interval is C up to E?', ['A 3rd', 'A 2nd', 'A 4th', 'A 5th'], 'Count C, D, E.', 'Counting C, D, E gives three letters, so it is a 3rd.'),
      mc(L11, 2, 1, 'What interval is C up to G?', ['A 5th', 'A 4th', 'A 6th', 'A 3rd'], 'Count C, D, E, F, G.', 'C, D, E, F, G is five letters, so it is a 5th.'),
      mc(L11, 3, 2, 'What is the interval from C up to the next C?', ['An octave', 'A 7th', 'A unison', 'A 6th'], 'Eight letter names.', 'The interval from a note to the next note of the same name is an octave, an 8th.'),
      tf(L11, 4, 2, 'C up to D is a 2nd.', 0, 'Count both notes.', 'Counting C and D gives two letter names, so the interval is a 2nd.'),
      mc(L11, 5, 2, 'What interval is D up to A?', ['A 5th', 'A 4th', 'A 6th', 'A 3rd'], 'Count D, E, F, G, A.', 'D, E, F, G, A is five letters, so it is a 5th.'),
      // L12
      mc(L12, 1, 1, 'Which scale degree is the tonic?', ['The first', 'The second', 'The fifth', 'The seventh'], 'The home note.', 'The tonic is the first note of the scale.'),
      mc(L12, 2, 1, 'Which scale degree is the dominant?', ['The fifth', 'The first', 'The fourth', 'The third'], 'A 5th above the tonic.', 'The dominant is the fifth degree of the scale.'),
      mc(L12, 3, 2, 'What is the dominant note in C major?', ['G', 'F', 'E', 'D'], 'Count C, D, E, F, G.', 'Counting up five notes from C reaches G.'),
      mc(L12, 4, 2, 'What is the dominant note in G major?', ['D', 'C', 'E', 'A'], 'Count G, A, B, C, D.', 'Counting up five notes from G reaches D.'),
      tf(L12, 5, 2, 'Many tunes in a major key end on the tonic, which gives a feeling of rest.', 0, 'Think of coming home.', 'Ending on the tonic gives a sense of arrival, so many tunes finish there.'),
      // L13
      mc(L13, 1, 1, 'What does forte mean?', ['Loud', 'Soft', 'Fast', 'Slow'], 'It looks like the letter f.', 'Forte means loud.'),
      mc(L13, 2, 1, 'What does piano mean as a dynamic?', ['Soft', 'Loud', 'Fast', 'Detached'], 'It looks like the letter p.', 'As a dynamic marking, piano means soft.'),
      tf(L13, 3, 1, 'A crescendo means gradually getting louder.', 0, 'It grows.', 'Crescendo means to get gradually louder.'),
      mc(L13, 4, 2, 'Which list is in order from softest to loudest?', ['pp, p, mf, ff', 'ff, f, mf, p', 'mf, pp, ff, p', 'p, pp, f, ff'], 'Double letters are the extremes.', 'Pianissimo is softest and fortissimo is loudest, with p and mf in between.'),
      mc(L13, 5, 2, 'What does diminuendo mean?', ['Gradually getting softer', 'Gradually getting louder', 'Suddenly very loud', 'Gradually slowing down'], 'It is the opposite of crescendo.', 'Diminuendo, or decrescendo, means gradually getting softer.'),
      // L14
      mc(L14, 1, 1, 'What does allegro mean?', ['Fast and lively', 'Slow', 'Very soft', 'Walking pace'], 'Think of a lively, quick pace.', 'Allegro means fast and lively.'),
      mc(L14, 2, 1, 'What does adagio mean?', ['Slow', 'Very fast', 'Loud', 'Gradually faster'], 'It is not fast.', 'Adagio means slow.'),
      mc(L14, 3, 2, 'Which word means very fast?', ['Presto', 'Largo', 'Andante', 'Moderato'], 'It is faster than allegro.', 'Presto means very fast.'),
      mc(L14, 4, 2, 'What does ritardando (rit.) mean?', ['Gradually slowing down', 'Gradually speeding up', 'Return to the original speed', 'Hold the note longer'], 'It slows down.', 'Ritardando means to gradually slow down.'),
      tf(L14, 5, 2, 'At 60 beats per minute, each beat lasts one second.', 0, 'There are 60 seconds in a minute.', 'Sixty beats in sixty seconds means one beat per second.'),
      // L15
      mc(L15, 1, 1, 'Which instrument family does the trumpet belong to?', ['Brass', 'Woodwinds', 'Strings', 'Percussion'], 'Its sound comes from buzzing lips.', 'The trumpet is a brass instrument.'),
      mc(L15, 2, 1, 'Which of these is a woodwind instrument?', ['Oboe', 'Trumpet', 'Cello', 'Timpani'], 'It uses a reed.', 'The oboe is a woodwind; the others are brass, string and percussion.'),
      tf(L15, 3, 1, 'The violin, viola, cello and double bass are all in the string family.', 0, 'They are played with a bow.', 'These four instruments are the main orchestral strings.'),
      mc(L15, 4, 2, 'Which is the largest and lowest of the bowed string instruments?', ['Double bass', 'Violin', 'Viola', 'Cello'], 'It is taller than the cello.', 'The double bass is the largest and lowest bowed string instrument.'),
      tf(L15, 5, 2, 'The flute is a brass instrument because it is made of metal.', 1, 'Families depend on how sound is made.', 'The flute is a woodwind; instruments are grouped by how they make sound, not by their material.'),
      // L16
      mc(L16, 1, 1, 'Which family sits nearest the front of the orchestra?', ['Strings', 'Brass', 'Percussion', 'Woodwinds'], 'They curve around the conductor.', 'The strings sit in front, closest to the conductor.'),
      tf(L16, 2, 2, 'The percussion section usually sits at the back of the orchestra.', 0, 'The timpani are large.', 'Percussion instruments are normally placed at the back.'),
      mc(L16, 3, 2, 'Who stands at the front of the orchestra to lead the players?', ['The conductor', 'The timpanist', 'The tuba player', 'The harpist'], 'They use a baton or hands.', 'The conductor stands at the front facing the players.'),
      mc(L16, 4, 2, 'Where do the woodwinds usually sit?', ['In the middle, behind the strings', 'At the very front', 'At the very back', 'Beside the conductor on the podium'], 'Between strings and brass.', 'Woodwinds sit in the middle of the stage, behind the strings and in front of the brass.'),
      mc(L16, 5, 3, 'Which instrument would you most likely find at the very back of an orchestra?', ['Timpani', 'Violin', 'Flute', 'Viola'], 'It is a large kettledrum.', 'Timpani are percussion instruments and sit at the back.'),
      // L17
      mc(L17, 1, 1, 'Which letters show the form of a song that begins with a section, changes, and then repeats the first section?', ['ABA', 'AAB', 'ABB', 'ABC'], 'The first section comes back.', 'ABA means a first section, a contrast, then the first section again.'),
      tf(L17, 2, 1, 'AB form has two different, contrasting sections.', 0, 'A and B are different letters.', 'AB form has one section A followed by a contrasting section B.'),
      mc(L17, 3, 2, 'Which pattern is a simple rondo?', ['ABACA', 'ABAB', 'AABB', 'ABCD'], 'The A tune keeps coming back.', 'A rondo returns to A between contrasting sections: ABACA.'),
      mc(L17, 4, 2, 'What happens in theme and variations?', ['A tune is repeated, changed each time', 'Two unrelated tunes are mixed', 'Each section is played louder', 'The tune is played once only'], 'The theme comes back in disguise.', 'A theme is played and then repeated with changes such as speed, rhythm or mood.'),
      mc(L17, 5, 2, 'A piece has the form ABA. Counting the first and last, how many times do we hear the A section in all?', ['2', '1', '3', '0'], 'It appears at the beginning and the end.', 'The pattern A, B, A has two A sections.'),
      // L18
      mc(L18, 1, 1, 'Which composer was born in Salzburg?', ['Mozart', 'Bach', 'Beethoven', 'Tchaikovsky'], 'He was a child prodigy.', 'Mozart was born in Salzburg in 1756.'),
      mc(L18, 2, 1, 'Which composer wrote nine symphonies and gradually lost his hearing?', ['Beethoven', 'Bach', 'Mozart', 'Joplin'], 'He was born in Bonn.', 'Beethoven wrote nine symphonies and lost his hearing as an adult.'),
      tf(L18, 3, 1, 'Bach was a German composer from the Baroque period.', 0, 'He lived from 1685 to 1750.', 'Johann Sebastian Bach was a German Baroque composer.'),
      mc(L18, 4, 2, 'Who composed the Brandenburg Concertos?', ['Bach', 'Mozart', 'Beethoven', 'Clara Schumann'], 'He was also a famous organist.', 'The Brandenburg Concertos were written by Johann Sebastian Bach.'),
      tf(L18, 5, 2, 'Mozart lived to be over 80 years old.', 1, 'He lived from 1756 to 1791.', 'Mozart died in 1791 at the age of 35.'),
      // L19
      mc(L19, 1, 1, 'Which composer is famous for ragtime pieces such as Maple Leaf Rag?', ['Scott Joplin', 'Tchaikovsky', 'Bach', 'Mozart'], 'He was an American pianist.', 'Scott Joplin wrote Maple Leaf Rag and is known for ragtime.'),
      mc(L19, 2, 1, 'Which Russian composer wrote the ballet The Nutcracker?', ['Tchaikovsky', 'Beethoven', 'Joplin', 'Clara Schumann'], 'He also wrote Swan Lake.', 'Pyotr Ilyich Tchaikovsky composed The Nutcracker.'),
      tf(L19, 3, 2, 'Clara Schumann was both a pianist and a composer.', 0, 'She performed concerts across Europe.', 'Clara Schumann was a celebrated pianist who also composed songs and piano music.'),
      mc(L19, 4, 2, 'Which composer was Clara Schumann married to?', ['Robert Schumann', 'Johannes Brahms', 'Ludwig van Beethoven', 'Franz Liszt'], 'They shared a last name.', 'Clara married the composer Robert Schumann.'),
      mc(L19, 5, 2, 'Which feature is a hallmark of ragtime?', ['Syncopation', 'Only slow tempos', 'No melody', 'Only soft dynamics'], 'Accents fall between the beats.', 'Ragtime is known for syncopated rhythms.'),
      // L20
      mc(L20, 1, 1, 'What is a good first step when composing a short melody?', ['Choose a key and a time signature', 'Write the last note only', 'Choose the dynamics only', 'Play as fast as possible'], 'Set up the rules first.', 'Choosing a key and time signature gives you the notes and beat grouping to work with.'),
      tf(L20, 2, 1, 'A four-measure melody in 4/4 contains 16 quarter-note beats.', 0, 'Multiply 4 beats by 4 measures.', 'Four measures of four beats each make 16 beats.'),
      mc(L20, 3, 2, 'You write 2 measures in 4/4. How many quarter-note beats must you fill?', ['8', '4', '6', '16'], 'Two measures of four.', 'Two measures with four beats each need 8 beats.'),
      mc(L20, 4, 2, 'Which ending note most strongly makes a tune in C major sound finished?', ['C, the tonic', 'A note outside the key', 'B, the seventh note', 'A long rest before the end'], 'The home note.', 'Ending on the tonic gives the strongest sense of arrival.'),
      mc(L20, 5, 3, 'A 3/4 measure contains a dotted half note. How many more beats are needed to fill it?', ['0', '1', '2', '3'], 'A dotted half is 3 beats.', 'A dotted half note lasts 3 beats, which fills the 3/4 measure completely.'),
    ],
  },
};
