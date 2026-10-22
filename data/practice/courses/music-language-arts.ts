// ─────────────────────────────────────────────────────────────────────────────
// music-language-arts.ts — "Music as Language": writing music taught as a branch of literature
// and language arts, with a bridge to math.
//
// Five tracks carry a learner from chanting their own name (K-2) to equal temperament as an
// exponential function (9-12 / adult):
//
//   1. Rhythm Is Language          — speech rhythm, poetic feet, common meter, prosody
//   2. Melody as Sentence          — phrases, cadences as punctuation, call and response, motif
//   3. Form as Story Structure     — ballads, AABA vs the sonnet, blues, variations, sonata, leitmotif
//   4. The Songwriter's Craft      — a writing workshop: point of view, imagery, hook, rhyme, revision
//   5. Reading Scores Like Texts   — notation as a writing system, score "plot", word painting,
//      & Music Math                  fractions, ratios and the twelfth root of two
//
// Quotations are limited to short lines from public-domain texts (US publication before 1929).
// Resources point only at free, legal sources: IMSLP, the Internet Archive, the Library of
// Congress, Smithsonian Folkways, Open Music Theory, musictheory.net, the Poetry Foundation and
// Project Gutenberg.
//
// Standards: NCAS music anchors + the platform's music nodes, crosswalked to CCSS ELA and Math
// (all ids exist in data/educationStandards.ts).
// ─────────────────────────────────────────────────────────────────────────────

import type { CourseModule } from '../courseModule';
import type { Question } from '../types';
import type { Curriculum } from '../../../services/schoolChassis';

const C = 'music-language-arts';
const AS_OF = '2026-10';
const lid = (t: number, l: number) => `${C}.t${t}.l${l}`;

/** Compose / listen work happens in Chora; writing work happens in Lorea. */
const make = (prompt: string) => ({ prompt, tool: 'CHORA' as const, postTag: 'musiclit' });
const write = (prompt: string) => ({ prompt, tool: 'LOREA' as const, postTag: 'musiclit' });

// ── Free, legal resources (reused across lessons) ──────────────────────────────
const R = {
  omt: { label: 'Open Music Theory — free open-access textbook', url: 'https://openmusictheory.github.io/' },
  mtnLessons: { label: 'musictheory.net — free interactive lessons', url: 'https://www.musictheory.net/lessons' },
  mtnExercises: { label: 'musictheory.net — free ear and rhythm exercises', url: 'https://www.musictheory.net/exercises' },
  pfGlossary: { label: 'Poetry Foundation — glossary of poetic terms', url: 'https://www.poetryfoundation.org/learn/glossary-terms' },
  pfDickinson: { label: 'Poetry Foundation — Emily Dickinson', url: 'https://www.poetryfoundation.org/poets/emily-dickinson' },
  pfSonnet18: { label: 'Poetry Foundation — Shakespeare, Sonnet 18', url: 'https://www.poetryfoundation.org/poems/45087/sonnet-18-shall-i-compare-thee-to-a-summers-day' },
  pfTyger: { label: 'Poetry Foundation — William Blake, "The Tyger"', url: 'https://www.poetryfoundation.org/poems/43687/the-tyger' },
  pfRaven: { label: 'Poetry Foundation — Edgar Allan Poe, "The Raven"', url: 'https://www.poetryfoundation.org/poems/48860/the-raven' },
  pfBurns: { label: 'Poetry Foundation — Robert Burns', url: 'https://www.poetryfoundation.org/poets/robert-burns' },
  gutMotherGoose: { label: 'Project Gutenberg — Mother Goose collections', url: 'https://www.gutenberg.org/ebooks/search/?query=mother+goose' },
  gutChild: { label: 'Project Gutenberg — Child, The English and Scottish Popular Ballads', url: 'https://www.gutenberg.org/ebooks/search/?query=english+and+scottish+popular+ballads' },
  gutDickinson: { label: 'Project Gutenberg — Poems by Emily Dickinson', url: 'https://www.gutenberg.org/ebooks/search/?query=emily+dickinson' },
  gutHymns: { label: 'Project Gutenberg — Olney Hymns (Newton & Cowper, 1779)', url: 'https://www.gutenberg.org/ebooks/search/?query=olney+hymns' },
  gutPoe: { label: 'Project Gutenberg — The Works of Edgar Allan Poe', url: 'https://www.gutenberg.org/ebooks/search/?query=edgar+allan+poe' },
  locFolklife: { label: 'Library of Congress — American Folklife Center', url: 'https://www.loc.gov/folklife/' },
  locWorkSongs: { label: 'Library of Congress — work song recordings', url: 'https://www.loc.gov/audio/?q=work+songs' },
  locSpirituals: { label: 'Library of Congress — spirituals (recordings and sheet music)', url: 'https://www.loc.gov/search/?q=spirituals' },
  locJukebox: { label: 'Library of Congress — National Jukebox (free 78 rpm recordings)', url: 'https://www.loc.gov/collections/national-jukebox/' },
  locBlues: { label: 'Library of Congress — W. C. Handy, "St. Louis Blues" (1914)', url: 'https://www.loc.gov/search/?q=st.+louis+blues+handy' },
  folkways: { label: 'Smithsonian Folkways — recordings, liner notes and lesson plans', url: 'https://folkways.si.edu/' },
  iaAudio: { label: 'Internet Archive — free audio collection', url: 'https://archive.org/details/audio_music' },
  ia78: { label: 'Internet Archive — The Great 78 Project', url: 'https://archive.org/details/georgeblood' },
  imslpChant: { label: 'IMSLP — Gregorian chant scores', url: 'https://imslp.org/wiki/Category:Gregorian_Chant' },
  imslpB5: { label: 'IMSLP — Beethoven, Symphony No. 5 (free score)', url: 'https://imslp.org/wiki/Symphony_No.5,_Op.67_(Beethoven,_Ludwig_van)' },
  imslpB9: { label: 'IMSLP — Beethoven, Symphony No. 9 (free score)', url: 'https://imslp.org/wiki/Symphony_No.9,_Op.125_(Beethoven,_Ludwig_van)' },
  imslpMozart: { label: 'IMSLP — Mozart (free scores)', url: 'https://imslp.org/wiki/Category:Mozart,_Wolfgang_Amadeus' },
  imslpErlkonig: { label: 'IMSLP — Schubert, Erlkönig D.328 (free score)', url: 'https://imslp.org/wiki/Erlk%C3%B6nig,_D.328_(Schubert,_Franz)' },
  imslpWagner: { label: 'IMSLP — Wagner (free scores)', url: 'https://imslp.org/wiki/Category:Wagner,_Richard' },
  imslpBerlioz: { label: 'IMSLP — Berlioz, Symphonie fantastique (free score)', url: 'https://imslp.org/wiki/Symphonie_fantastique,_Op.14_(Berlioz,_Hector)' },
  imslpMessiah: { label: 'IMSLP — Handel, Messiah HWV 56 (free score)', url: 'https://imslp.org/wiki/Messiah,_HWV_56_(Handel,_George_Frideric)' },
  imslpWeelkes: { label: 'IMSLP — Thomas Weelkes (free scores)', url: 'https://imslp.org/wiki/Category:Weelkes,_Thomas' },
  imslpGrieg: { label: 'IMSLP — Grieg, Peer Gynt Suite No. 1 (free score)', url: 'https://imslp.org/wiki/Peer_Gynt_Suite_No.1,_Op.46_(Grieg,_Edvard)' },
};

export const MUSIC_LANGUAGE_CURRICULUM: Curriculum = {
  id: C,
  label: 'Music as Language',
  blurb:
    'Writing music is writing. Five tracks treat songs and scores as literature: rhythm as the meter of speech, melody as the sentence, form as story structure, songwriting as a writing workshop, and notation as a writing system with real math underneath. Every lesson ends with something to compose or write, and every score, poem and recording linked is free and legal.',
  accent: '#E0A458',
  framework: 'ncas',
  tracks: [
    // ═══════════════════════════════════════════════════════════════════════
    // 1. RHYTHM IS LANGUAGE
    // ═══════════════════════════════════════════════════════════════════════
    {
      id: `${C}.t1`,
      title: 'Rhythm Is Language',
      blurb: 'Every sentence you speak already has a rhythm. Starting from your own name, learn to hear the beat in words, name the feet poets count, and set words so their stresses land where the music is strong.',
      level: 'FOUNDATION',
      lessons: [
        {
          id: lid(1, 1),
          title: 'Chant Your Name: Beat and Rhythm',
          blurb: 'Your name is your first song. Clap it, count it, and learn the difference between the beat and the rhythm.',
          minutes: 10,
          standardIds: ['MUSIC.RHY.K2', 'MUSIC.COMP.K2', 'CCSS.ELA-LITERACY.RL.2.4', 'MU:Pr4.2'],
          body: `Say your name out loud and clap once for every part you hear. "Sam" gets one clap. "Ma-ya" gets two. "Al-ex-an-der" gets four. Those parts are called syllables, and every word in every language is built from them. When you clap the syllables of a word, you are clapping its rhythm.

Now pat your knees slowly and steadily, like a heartbeat or a clock: pat, pat, pat, pat. That steady pulse is the beat. The beat never changes speed and never stops. The rhythm is what the words do on top of it. Some words fit one syllable on one beat. Others squeeze two quick syllables into a single beat. Chant "Ma-ya, Ma-ya, Sam, Sam" while you pat, and you will feel both at once: the beat underneath, the rhythm on top.

Many music classrooms give these sounds names so we can talk about them. A sound that lasts one whole beat is called "ta." Two even, quicker sounds that share one beat are called "ti-ti." These rhythm syllables, used in Kodály-method classrooms around the world, come from a teaching system invented in 19th-century France. "Sam, Sam" is ta, ta. "Ma-ya Ma-ya" can be ti-ti, ti-ti. Musicians write ta as a quarter note and ti-ti as two eighth notes joined by a beam, but you do not need the symbols yet. Your voice and your hands already know the pattern.

This is the first big idea of the whole course: music did not invent rhythm. Language did. Long before anyone wrote a note, people chanted names, counted, called to each other across fields and sang to babies. When you make a name chant you are doing what poets and composers do every day: noticing the music that is already hiding inside words.`,
          assignment: make('Make a name chant for four people you know (or four pets, or four favourite foods). Say each name twice while you pat a steady beat, then record yourself in Chora. Underneath, write the chant in ta and ti-ti, for example: "Sam Sam | Ma-ya Ma-ya" = ta ta | ti-ti ti-ti.'),
          resources: [R.mtnExercises, R.gutMotherGoose],
          anchors: [{ kind: 'concept', ref: "Kodály rhythm syllables (ta, ti-ti)", note: "rhythm-syllable teaching practice" }],
          asOf: AS_OF,
        },
        {
          id: lid(1, 2),
          title: 'Nursery Rhymes and Jump-Rope Chants: Our First Literature',
          blurb: 'Clapping games and playground chants are poems with a beat, passed from child to child for centuries without ever needing a book.',
          minutes: 12,
          standardIds: ['MUSIC.RHY.K2', 'CCSS.ELA-LITERACY.RL.2.4', 'MU:Cn11.0'],
          body: `Before most of us can read, we already know dozens of poems by heart. "Pease porridge hot, / Pease porridge cold" is a poem. So is "Hickory, dickory, dock." So are the chants you hear on any playground while a rope turns or two friends clap hands. These are some of the oldest kinds of literature there is, and they were made to be performed with the body, not read silently on a page.

Look at what makes them easy to remember. They repeat lines ("Pease porridge hot" comes back again and again). They rhyme ("dock" and "clock"). They use alliteration, starting several words with the same sound, like "Peter Piper picked a peck." And above all, they have a strong, steady beat. A jump-rope chant has to: if the words and the rope disagree, someone trips. The beat is not decoration. It is the reason the poem works.

Grown-up scholars have studied these chants seriously. Printers in 18th-century London were already publishing little books of nursery rhymes, and in the 1950s the British folklorists Iona and Peter Opie collected thousands of rhymes straight from schoolchildren, showing how the same chant changes a little as it travels from one town to the next. That is called oral tradition: literature carried by voices instead of paper, the same way ancient epics and folk songs were carried.

When you notice the rhyme, the repetition and the beat in a playground chant, you are reading closely, the same skill you will use later on Shakespeare. Writers call these tools "sound devices." Composers call them rhythm and form. They are the same thing, seen from two doors.`,
          assignment: make('Pick a nursery rhyme or playground chant you know. Perform it while you clap or pat a steady beat and record it in Chora. Then write two new lines for it that keep the same beat and rhyme, and perform the whole thing again.'),
          resources: [R.gutMotherGoose, R.locFolklife, R.pfGlossary],
          anchors: [{ kind: 'concept', ref: "Children's oral tradition and nursery rhymes", note: "folklore scholarship on playground rhymes" }],
          asOf: AS_OF,
        },
        {
          id: lid(1, 3),
          title: 'Strong and Weak: Iambs, Trochees and Their Cousins',
          blurb: 'Every English word has a stressed syllable. Poets group stresses into patterns called feet, and the two you hear most are the iamb and the trochee.',
          minutes: 15,
          standardIds: ['MUSIC.RHY.35', 'CCSS.ELA-LITERACY.RL.4.5', 'MU:Re7.2'],
          body: `Say the word "apple." You lean harder on the first part: AP-ple. Now say "around": a-ROUND. That lean is called stress, and every English word with more than one syllable has a stressed syllable. Dictionaries mark it, and sometimes it changes the meaning: you can "PRE-sent" someone with a "pre-SENT," and a farmer can "pro-DUCE" fresh "PRO-duce." English rhythm is built from stressed and unstressed syllables taking turns.

Poets call a small group of stressed and unstressed syllables a foot. The iamb is one unstressed then one stressed syllable, da-DUM, like "a-BOVE" or "to-DAY." It is the most common foot in English poetry because ordinary English speech falls into it so easily. Shakespeare's Sonnet 18 opens in five iambs in a row, a line called iambic pentameter: "Shall I compare thee to a summer's day?" Read it with a little bounce and you will hear da-DUM five times.

The trochee is the mirror image: stressed then unstressed, DUM-da, like "TI-ger" or "AP-ple." Trochees feel like they lean forward, which is why chants and spells love them. William Blake's "The Tyger" (1794) begins "Tyger Tyger, burning bright," which pounds out TY-ger TY-ger BURN-ing BRIGHT. Henry Wadsworth Longfellow wrote all of The Song of Hiawatha (1855) in trochees, and it has the steady march of a drum.

Two more feet are worth knowing. The anapest goes da-da-DUM ("in-ter-VENE"), and the dactyl goes DUM-da-da ("MER-ri-ly," "HIG-gle-dy"). Anapests gallop, which is why "'Twas the night before Christmas" feels like it is hurrying somewhere. The trick to hearing feet is the same trick as finding the beat: say the line aloud, exaggerate it a little, and tap on the syllables that feel heavy. Meter is not something poets invented to make English harder. It is the rhythm already in our mouths, written down.`,
          assignment: write('Write four lines about something you can see right now: two lines made only of iambs (da-DUM) and two made only of trochees (DUM-da). Mark the stressed syllables in CAPITALS. Then read all four aloud and write one sentence about how the two patterns feel different.'),
          resources: [R.pfGlossary, R.pfSonnet18, R.pfTyger],
          anchors: [{ kind: 'concept', ref: "Accentual-syllabic meter (iamb, trochee, anapest, dactyl)", note: "definitions of metrical feet" }],
          asOf: AS_OF,
        },
        {
          id: lid(1, 4),
          title: 'Common Meter: Hymns, Ballads and Emily Dickinson',
          blurb: 'Eight syllables, then six, then eight, then six. One of the most useful patterns in English links church hymns, old ballads and some of the greatest poems in the language.',
          minutes: 16,
          standardIds: ['MUSIC.RHY.35', 'CCSS.ELA-LITERACY.RL.4.5', 'CCSS.ELA-LITERACY.RL.5.5', 'MU:Cn10.0'],
          body: `Count the syllables in these two lines from "Amazing Grace," written by John Newton and published in 1779: "Amazing grace! how sweet the sound / That saved a wretch like me!" The first line has eight syllables. The second has six. Keep going through the hymn and the pattern repeats: 8, 6, 8, 6. Each eight-syllable line is four iambs (iambic tetrameter), and each six-syllable line is three (iambic trimeter). This stanza has a name. Hymn books call it common meter and print "C.M." or "8.6.8.6" above the hymns written in it.

Why does that matter to a songwriter? Because any text in common meter can be sung to any tune in common meter. Hymnals were organised this way so a congregation that knew one melody could sing hundreds of poems to it. "Amazing Grace" itself was not paired with the tune most people know today ("New Britain") until 1835, more than fifty years after the words were published. The words and the music were separate pieces that clicked together because they shared a meter.

The old ballads of England and Scotland use a close cousin called ballad meter: the same alternating four-beat and three-beat lines, usually rhyming only lines two and four. Emily Dickinson grew up in Amherst, Massachusetts, singing the hymns of Isaac Watts, and most of her poems are built on these hymn stanzas. Count this opening, first published in 1890: "Because I could not stop for Death – / He kindly stopped for me –" Eight, then six. You can sing the whole poem to the tune of "Amazing Grace," and many teachers do exactly that to show how much music is hidden in it.

Notice what Dickinson does with the familiar form. The steady, comforting hymn rhythm carries a poem about riding in a carriage with Death. The meter makes us expect a church song; the words take us somewhere strange. That tension between a form and what is put inside it is one of the most powerful tools a writer has, and a songwriter has it too. Hymn meters are also labelled for other line patterns, such as long meter (8.8.8.8) and short meter (6.6.8.6), and once you start counting, you will find them everywhere.`,
          assignment: make('Count the syllables of one stanza of a Dickinson poem (Project Gutenberg has her poems free). If it is 8.6.8.6, sing it to the tune of "Amazing Grace" and record it in Chora. Then write your own four-line stanza in common meter about something ordinary, and sing it to the same tune.'),
          resources: [R.gutDickinson, R.pfDickinson, R.gutHymns],
          anchors: [{ kind: 'concept', ref: "Common meter (8.6.8.6) and Dickinson's hymn stanzas", note: "hymnal meter conventions; Amazing Grace text/tune history" }],
          asOf: AS_OF,
        },
        {
          id: lid(1, 5),
          title: 'Meter in Music: Bar Lines, Downbeats and Time Signatures',
          blurb: 'Music groups beats into measures the way poetry groups syllables into feet. Learn to feel 2, 3 and 4, and match a poem to the meter that fits it.',
          minutes: 15,
          standardIds: ['MUSIC.RHY.35', 'MUSIC.NOT.35', 'CCSS.ELA-LITERACY.RL.4.5', 'MU:Pr4.2'],
          body: `In music, beats come in groups. Count "ONE two, ONE two" and march: that is duple meter, two beats per group. Count "ONE two three, ONE two three" and sway: that is triple meter, the feel of a waltz. Count "ONE two three four" and you have the most common meter in popular music, where beat one is strongest and beat three is a little strong too. Each group is called a measure (or a bar), and composers draw a bar line between measures so the reader can see the groups.

The first beat of each measure is called the downbeat, because a conductor's hand moves down on it. The downbeat is the musical version of a stressed syllable. The time signature at the start of a piece tells you how the beats are grouped. The top number says how many beats are in each measure; the bottom number says which kind of note gets one beat. In 3/4, there are three beats per measure and a quarter note gets the beat. In 2/4 there are two, in 4/4 there are four.

Now put a poem next to a time signature. Trochees (DUM-da) fit naturally into 2/4 or 4/4 with each stressed syllable on a strong beat: "TWIN-kle TWIN-kle LIT-tle STAR." Dactyls (DUM-da-da) fit triple meter, one foot per bar: "HIG-gle-dy PIG-gle-dy" swings in 3/4 or 6/8. Iambs (da-DUM) start with a weak syllable, so in music the first word usually comes just before the first bar line, on an upbeat. Musicians call that early note a pickup or anacrusis.

This is why a poem can sound "right" or "wrong" to a melody before you have changed a single note. A song is two rhythms locked together: the rhythm of the language and the meter of the music. When their strong points line up, the words feel natural and easy to sing. When they fight, singers stumble and listeners mishear. The next lesson is about making them agree on purpose.`,
          assignment: make('Choose three short lines: one trochaic, one dactylic and one iambic (you can use lines from earlier lessons). In Chora, set each to a simple beat in the meter that fits it (2/4 or 4/4, 3/4, and 4/4 with a pickup). Post the three clips with the time signature you chose for each and why.'),
          resources: [R.mtnLessons, R.omt, R.mtnExercises],
          anchors: [{ kind: 'concept', ref: "Time signatures and metric accent", note: "notation conventions for meter" }],
          asOf: AS_OF,
        },
        {
          id: lid(1, 6),
          title: 'Prosody: Setting Words So They Sound Spoken',
          blurb: 'Good songwriters put stressed syllables on strong beats and long notes on words that can hold them. That craft is called prosody, and you can learn it in an afternoon.',
          minutes: 18,
          standardIds: ['MUSIC.COMP.35', 'MUSIC.RHY.35', 'MU:Cr2.1', 'MU:Cr3.1', 'CCSS.ELA-LITERACY.RL.2.4'],
          body: `Prosody is the fit between words and music. When it is good, you never notice it: the song sounds like a person talking, only more so. When it is bad, you notice immediately. Try singing the word "about" with the "a" on a big downbeat and the "bout" on a weak beat: "A-bout." It sounds like a different word, or like a robot. The fix is simple: move "a" to a pickup so that "BOUT" lands on the strong beat.

The first rule of prosody follows from the last two lessons: stressed syllables go on strong beats, unstressed syllables go on weak beats. Look at the opening of "The Star-Spangled Banner" (words by Francis Scott Key, 1814). The song is in triple meter, and "O" is a pickup so that "SAY" lands on the downbeat and "SEE" lands on the next one: "O | SAY can you | SEE." The music tells you which words matter. Compare "Twinkle, Twinkle, Little Star" (words by Jane Taylor, 1806), where every trochee starts on a beat, so there is no pickup at all.

The second rule is about length and vowels. Long notes want open vowels and important words: "day," "home," "free," "me." They do not want small function words like "the," "of" or "and," and they hate hard consonant clusters at the end, like "-ngths" in "strengths." The third rule is about contour: the highest note of a phrase draws attention, so put an important word there. Composers have followed these rules for centuries, and songwriting teachers still check every line for them.

Prosody is also about meaning, not only stress. If a lyric says "rising," a melody that climbs is helping. If a line says "I can't go on" and the rhythm suddenly stops, the music has acted out the words. Later in this course you will see composers do this in great detail (it is called word painting). For now, the habit to build is simple and powerful: speak your lyric out loud, mark the stresses, and check that the music agrees with your mouth.`,
          assignment: make('Write two lines of your own lyric. Speak them aloud and mark the stressed syllables in CAPITALS. In Chora, set them to a melody so every stressed syllable lands on a strong beat and the most important word gets the longest or highest note. Post the lyric with stresses marked, the recording, and one line you had to fix.'),
          resources: [R.omt, R.mtnLessons, R.locJukebox],
          anchors: [{ kind: 'concept', ref: "Text setting and prosody", note: "songwriting practice for stress alignment" }],
          asOf: AS_OF,
        },
      ],
    },
    // ═══════════════════════════════════════════════════════════════════════
    // 2. MELODY AS SENTENCE
    // ═══════════════════════════════════════════════════════════════════════
    {
      id: `${C}.t2`,
      title: 'Melody as Sentence',
      blurb: 'A phrase is a musical sentence, and cadences are its punctuation. Learn to hear commas and periods in music, write questions and answers, and use a motif the way a writer uses a recurring image.',
      level: 'FOUNDATION',
      lessons: [
        {
          id: lid(2, 1),
          title: 'The Phrase Is a Sentence',
          blurb: 'Melodies are made of phrases about as long as a breath, and each one rises, peaks and settles like a spoken sentence.',
          minutes: 12,
          standardIds: ['MUSIC.EAR.35', 'MUSIC.COMP.35', 'CCSS.ELA-LITERACY.RL.2.4', 'MU:Re7.2'],
          body: `Sing "Twinkle, Twinkle, Little Star" and notice where you naturally breathe. You take a breath after "star," and again after "what you are." Each of those stretches of melody is a phrase: a complete musical thought, about as long as a comfortable breath. In songs, a phrase very often matches a line of the lyric, and a line of lyric is very often a sentence or a clause. Melody and grammar grow up together.

Phrases have shapes, and the shapes come from speech. When you say a statement in English ("I'm going home."), your voice usually falls at the end. When you ask a yes-or-no question ("Are you going home?"), your voice usually rises. Melodies borrow these tunes of speech, which linguists call intonation. A phrase that rises and then falls to a low, long note sounds finished. A phrase that ends high, or on an unsettled note, sounds like it is asking something.

Most phrases have a direction and a peak. Many climb to a high point somewhere past the middle and then settle, the way a well-built sentence often saves its most important word for near the end. Composers mark phrases in written music with long curved lines called phrase marks or slurs, the musical cousins of the punctuation and line breaks a poet uses to show you how to read.

When you listen for phrases, you are doing what a reader does with sentences: chunking a stream into units of meaning. Musicians call this "phrasing," and it is one of the first things a teacher listens for. A performer who breathes in the middle of a phrase sounds like a reader who pauses in the middle of a word. A writer of melodies needs the same instinct a writer of sentences has: know where each thought begins, where it is going, and where it ends.`,
          assignment: make('Pick a song you know well. Sing or hum it into Chora and mark every place you breathe. Count how many phrases there are and post the lyric with a slash at the end of each phrase, plus one note about whether each phrase sounds like a statement or a question.'),
          resources: [R.mtnLessons, R.omt],
          anchors: [{ kind: 'concept', ref: "Musical phrase and speech intonation", note: "phrase/intonation analogy" }],
          asOf: AS_OF,
        },
        {
          id: lid(2, 2),
          title: 'Cadences Are Punctuation',
          blurb: 'Half cadence as comma, authentic cadence as period, deceptive cadence as a surprise twist. The chords at the end of a phrase tell you how finished it is.',
          minutes: 15,
          standardIds: ['MUSIC.HAR.35', 'MUSIC.EAR.35', 'MU:Re7.2', 'MU:Re8.1'],
          body: `A cadence is the end of a phrase, the moment the music comes to a stop for a moment or for good. The word comes from the Latin for "falling," because so many phrases fall to their final note. In music built on keys, cadences are made from chords, and each kind of cadence works like a punctuation mark.

The authentic cadence moves from the dominant chord (V, built on the fifth note of the scale) to the tonic chord (I, built on home). In C major that is G major to C major. It sounds like a period: complete, resolved, done. When both chords are in their plainest position and the melody lands on the home note, it is called a perfect authentic cadence, the strongest full stop music has. A weaker version, where the melody lands on a different note of the home chord, is called an imperfect authentic cadence and feels more like a semicolon.

The half cadence ends on the V chord instead of leaving it. The phrase stops, but on the most unstable chord in the key, so you know more is coming. That is a comma. Two other cadences are worth knowing. The plagal cadence goes from IV to I (F to C in C major); it is the "A-men" sung at the end of many hymns, softer than an authentic cadence, like a gentle closing sigh. The deceptive cadence sets up an authentic cadence and then swerves: V goes to vi (G to A minor) instead of home. It is the musical equivalent of a sentence that ends with a dash and a surprise.

You can hear cadences without knowing a single chord name. Listen to a hymn or a folk song and ask, at each pause: could the song end here? If the answer is "yes," you probably heard an authentic cadence. If it is "no, it is waiting," you probably heard a half cadence. If it is "wait, that is not where I thought it was going," you heard a deceptive one. Once you can hear them, you can use them on purpose, which is exactly what a writer does with punctuation.`,
          assignment: make('In Chora, play or program the chords C – F – G – C (an authentic cadence) and C – F – C – G (a half cadence), then G – A minor (a deceptive cadence). Write one short sentence of your own for each, using a period, a comma and a dash to match. Post the three clips with your three sentences.'),
          resources: [R.omt, R.mtnLessons, R.mtnExercises],
          anchors: [{ kind: 'concept', ref: "Cadence types (authentic, half, plagal, deceptive)", note: "standard cadence taxonomy" }],
          asOf: AS_OF,
        },
        {
          id: lid(2, 3),
          title: 'Question and Answer: Antecedent and Consequent',
          blurb: 'Two phrases that start alike but end differently, the first with a comma, the second with a period. This pairing, called a period, is one of music\'s most satisfying shapes.',
          minutes: 15,
          standardIds: ['MUSIC.COMP.35', 'MUSIC.HAR.35', 'MU:Cr1.1', 'MU:Re7.2'],
          body: `Here is the most famous tune in Beethoven's Ninth Symphony (1824), the melody he set to Friedrich Schiller's poem "An die Freude" ("Ode to Joy"). In C major it begins: E E F G, G F E D, C C D E, E D D. Sing it. The last note is D, the second note of the scale, sitting over the V chord. It stops, but it does not feel finished. That first phrase is a question. Musicians call it the antecedent.

Now the second phrase: E E F G, G F E D, C C D E, D C C. It begins exactly like the first, and that is the point: we recognise it as a reply. But at the end it turns down to C, the home note, over the I chord. Question, answer. Half cadence, then authentic cadence. Comma, then period. The answering phrase is called the consequent, and the pair together is called a period. (Yes, the same word as the punctuation mark, and for the same reason.)

The period is everywhere in music written in the last three hundred years: folk songs, Mozart sonatas, children's songs, film themes. It works because it plays on expectation. The first phrase makes a promise ("something will happen"), and the second phrase keeps it. When the consequent starts the same way as the antecedent, as in "Ode to Joy," it is called a parallel period. When the second phrase starts with different material, it is a contrasting period.

Writers will recognise the shape. It is the setup and payoff of a joke, the problem and solution of a paragraph, the "if" and "then" of a sentence. In poetry, it is a couplet whose second line completes the first. When you write a melody, try writing in pairs: let the first phrase end up in the air on the second, fifth or seventh note of the scale, and let the second phrase come home.`,
          assignment: make('Sing or play "Ode to Joy" in Chora and mark the half cadence and the authentic cadence. Then write your own 8-bar period: a 4-bar question that ends on D, G or B (in C major) and a 4-bar answer that starts the same way and ends on C. Post it with a two-line lyric where line one asks and line two answers.'),
          resources: [R.imslpB9, R.omt, R.mtnLessons],
          anchors: [{ kind: 'concept', ref: "Musical period (antecedent and consequent)", note: "Ode to Joy as parallel period" }],
          asOf: AS_OF,
        },
        {
          id: lid(2, 4),
          title: 'Call and Response: Music as Dialogue',
          blurb: 'A leader sings, a group answers. From work songs and spirituals to gospel and the blues, call and response turns a song into a conversation.',
          minutes: 16,
          standardIds: ['MU:Cn11.0', 'MU:Re7.2', 'MUSIC.EAR.35', 'CCSS.ELA-LITERACY.RL.4.2'],
          body: `In call and response, one voice sings a line and others answer it. It is one of the oldest and most widespread musical forms on earth, central to music across West and Central Africa, and it came to the Americas with enslaved Africans, where it shaped work songs, spirituals, gospel, the blues, jazz and much of the popular music that followed. Wherever you hear a leader and a group trading lines, you are hearing a conversation set to music.

Work songs show why it matters. When a crew had to swing hammers, pull ropes or row together, a leader would sing a line and the crew would answer on the stroke. The song kept the work in time and kept spirits up, and the leader could improvise new calls about the work, the boss or home, while the response stayed the same. Folklorists John and Alan Lomax recorded many work songs for the Library of Congress beginning in the 1930s, and those recordings are free to hear today.

Spirituals often use the same structure. "Swing low, sweet chariot" is the call; "Coming for to carry me home" is the response. The Fisk Jubilee Singers, students at Fisk University in Nashville, brought spirituals to concert audiences across the United States and Europe starting in 1871, and their tours helped preserve songs that had been passed down orally. Many spirituals carry two layers of meaning: a religious image on the surface and, for the people who first sang them, hopes of freedom underneath.

As literature, call and response is dialogue. It has speakers and turns, and the meaning lives in how the answer relates to the call: agreeing, repeating, arguing, completing. It also teaches a central idea in reading literature, the theme: a song's repeated response is often where its theme lives, the thing everyone agrees to say together. In the blues, the call and response moves into a single performer: a sung line is answered by the guitar or piano. Listen for it, and you will start hearing conversations inside songs everywhere.`,
          assignment: make('Write a call-and-response song about a task you do with other people (cleaning up, walking to school, practising a sport). Write four different calls and one response that stays the same. Record it in Chora, singing the calls yourself and the response with friends or family if you can. Post the lyric and one sentence on what the response says the song is really about.'),
          resources: [R.locWorkSongs, R.locSpirituals, R.folkways],
          anchors: [{ kind: 'concept', ref: "Call and response in African American music", note: "work songs, spirituals, Fisk Jubilee Singers history" }],
          asOf: AS_OF,
        },
        {
          id: lid(2, 5),
          title: 'Motif: The Recurring Image',
          blurb: 'A motif is a short musical idea that keeps coming back, changing as it goes. Writers do the same thing with a recurring image or word.',
          minutes: 15,
          standardIds: ['MUSIC.COMP.68', 'MU:Re7.2', 'MU:Re8.1', 'CCSS.ELA-LITERACY.RL.4.2'],
          body: `Four notes: short, short, short, long. G G G E-flat. That is the opening of Beethoven's Fifth Symphony (first performed in 1808), and it may be the most recognisable motif in Western music. A motif is the smallest idea in a piece that is still recognisable: a few notes with a distinct rhythm or shape. Beethoven repeats it straight away one step lower (F F F D), and then builds the entire first movement out of it. The short-short-short-long rhythm returns in later movements too, so the whole symphony feels like one argument about one idea.

Composers keep a motif alive by changing it while keeping it recognisable. They can repeat it at a different pitch (a sequence), turn it upside down so that rising becomes falling (inversion), stretch it into longer notes (augmentation) or squeeze it into shorter ones (diminution), or break off just a piece of it (fragmentation). Each change is like seeing a familiar face in a new light. The listener's pleasure comes from recognising the old idea in its new form.

Writers use motifs too. In literature a motif is a recurring image, word, object or idea that gathers meaning each time it returns. In Edgar Allan Poe's "The Raven" (1845), the word "Nevermore" returns at the end of stanza after stanza. At first it is just a strange word from a strange bird. By the end, the same word carries all of the narrator's grief. The word does not change; its meaning grows because of everything that has happened around it.

That is the lesson for anyone writing music or words: you do not need many ideas, you need a strong one and the patience to develop it. A good motif is short enough to remember, distinctive enough to recognise, and simple enough to change. When you hear a piece that feels unified, look for the motif. When you write, choose one, and let it come back changed.`,
          assignment: make('In Chora, write a motif of three to five notes. Then write four transformations of it: a sequence (same shape, higher or lower), an inversion, an augmentation, and a fragment. String them together into a 16-bar piece. Post it with a short note naming the poem, story or film you know that uses a recurring image the same way.'),
          resources: [R.imslpB5, R.pfRaven, R.omt],
          anchors: [{ kind: 'concept', ref: "Motivic development; literary motif", note: "Beethoven Fifth motif; \"Nevermore\"" }],
          asOf: AS_OF,
        },
        {
          id: lid(2, 6),
          title: 'Write a Musical Paragraph',
          blurb: 'Put it together: a lyric, a pair of phrases, cadences in the right places, and a motif that ties it all up.',
          minutes: 20,
          standardIds: ['MUSIC.COMP.35', 'MU:Cr1.1', 'MU:Cr2.1', 'MU:Cr3.1', 'CCSS.ELA-LITERACY.L.5.5'],
          body: `A paragraph has a topic sentence, sentences that develop it, and a closing sentence. A short song section can be built the same way, and you now know every tool you need. This lesson is a workshop: you will write an eight-bar melody with a two-line lyric and make every choice on purpose.

Start with the words. Write two lines that belong together, the first opening a thought and the second closing it. Read them aloud and mark every stressed syllable. Count the syllables in each line; lines of similar length (for example, 8 and 8, or 8 and 6) are easier to set. Decide what the single most important word is. That word will get a strong beat and probably the highest or longest note.

Next, the music. Choose a meter that fits your stresses (Track 1) and a key (C major is fine). Write the first four bars so that your stressed syllables land on downbeats, and end the phrase on the second, fifth or seventh note of the scale, a half cadence, the musical comma. Then write the second four bars. Start them the way the first phrase started, so the listener hears a reply, and end on the home note, the authentic cadence, the musical period.

Finally, revise like a writer. Sing it through. Does any word sound mispronounced? Move it. Does the high point land on the important word? If not, move the peak. Is there one rhythm or interval that appears at least twice, a motif that makes the tune memorable? If not, find one and repeat it. Then play it for someone and ask them to sing back the first phrase. If they can, your musical paragraph has done its job: it is clear enough to remember.`,
          assignment: make('Compose your 8-bar period in Chora with your own two-line lyric. Label the half cadence, the authentic cadence, your motif, and the most important word. Post the recording and the labelled lyric.'),
          resources: [R.omt, R.mtnLessons],
          anchors: [{ kind: 'concept', ref: "Composing a parallel period", note: "workshop method" }],
          asOf: AS_OF,
        },
      ],
    },
    // ═══════════════════════════════════════════════════════════════════════
    // 3. FORM AS STORY STRUCTURE
    // ═══════════════════════════════════════════════════════════════════════
    {
      id: `${C}.t3`,
      title: 'Form as Story Structure',
      blurb: 'Repetition and contrast are to music what plot is to a story. Compare story ballads to through-composed drama, AABA song form to the sonnet, the blues to the couplet, variations to retellings, sonata form to conflict and resolution, and leitmotif to character.',
      level: 'INTERMEDIATE',
      lessons: [
        {
          id: lid(3, 1),
          title: 'Story Songs: Strophic Ballads and Through-Composed Drama',
          blurb: 'A ballad tells a whole story to the same tune, verse after verse. Schubert\'s "Erlkönig" gives every moment new music. Two ways to tell a story in song.',
          minutes: 18,
          standardIds: ['MUSIC.COMP.68', 'CCSS.ELA-LITERACY.RL.5.5', 'MU:Re7.2', 'MU:Cn11.0'],
          body: `Every musical form is a balance between repetition and contrast. Repeat too much and the listener drifts off; change too much and they get lost. The simplest balance is strophic form: the same melody for every stanza (or strophe) of the poem, while the words change. Most hymns, folk songs and nursery songs are strophic. The repetition is a gift to the listener: once you know the tune, all your attention can go to the story.

The traditional ballads of England and Scotland are strophic story songs. Between 1882 and 1898 the American scholar Francis James Child published 305 of them, which is why folk singers still refer to "Child ballads" by number. "Barbara Allen" (Child 84) was already popular in the 1660s; the diarist Samuel Pepys wrote in 1666 that he had heard it sung. Ballads have a recognisable literary style: they are usually told in the third person, they jump from scene to scene without explanation, they let characters speak in dialogue, and they use incremental repetition, repeating a line with one small change each time so the tension rises.

The opposite approach is through-composed form, in which the music keeps changing to follow the story. Franz Schubert's song "Erlkönig" (1815), a setting of Goethe's poem, is the classic example. One singer plays four characters: a narrator, a father riding through the night, his frightened son, and the supernatural Erl-King who lures the boy. Schubert gives each a different musical voice (the Erl-King sweet and coaxing, the son rising in pitch each time he cries out), while the piano's pounding triplets never stop galloping. At the end the music stops, and the narrator speaks the last line almost without melody: the child was dead.

For a writer, the two forms answer a real question: should the structure stay steady while the story moves, or should the structure move with the story? A strophic ballad is like a chapter book with a consistent voice. A through-composed song is like a scene in a film where the score follows every cut. Both are valid; the choice depends on what you want the listener to notice.`,
          assignment: make('Listen to a recording of a Child ballad (search the Library of Congress or Smithsonian Folkways for "Barbara Allen") and then to Schubert\'s "Erlkönig." In Chora, post a short voice memo or written comparison: what does the repeated tune let you focus on in the ballad, and what does the changing music do for the story in "Erlkönig"?'),
          resources: [R.gutChild, R.imslpErlkonig, R.folkways],
          anchors: [{ kind: 'concept', ref: "Strophic vs through-composed song; Child ballads", note: "Child ballad numbering; Erlkönig" }],
          asOf: AS_OF,
        },
        {
          id: lid(3, 2),
          title: 'AABA and the Sonnet: The Turn',
          blurb: 'The 32-bar popular song and the 14-line sonnet both set up an idea, repeat it, and then turn. The bridge in a song does what the volta does in a poem.',
          minutes: 18,
          standardIds: ['MUSIC.COMP.68', 'CCSS.ELA-LITERACY.RL.11-12.5', 'CCSS.ELA-LITERACY.RL.5.5', 'MU:Re7.2'],
          body: `From the 1920s through the 1950s, the songwriters of Tin Pan Alley and Broadway wrote thousands of songs in a single shape: four sections of eight bars each, labelled AABA. The first A states the main melody and title. The second A repeats the melody with new words. The B section, called the bridge (or the "middle eight"), brings in a contrasting melody, often in a new key, with a new angle on the subject. Then the final A returns, and the familiar tune feels like coming home. "Over the Rainbow" (1939) is a well-known example; its bridge begins after the second A, at bar 17.

Now look at a sonnet. The Italian (Petrarchan) sonnet has fourteen lines divided into an octave of eight lines and a sestet of six. The octave sets up a situation or problem; at line 9 comes the volta, Italian for "turn," where the poem changes direction: answers the question, shifts the mood, or looks at the subject from a new side. Shakespeare's sonnets use three quatrains and a closing couplet, but many of them also turn at line 9. In Sonnet 18, the first eight lines list the ways a summer's day falls short, and line 9 turns: "But thy eternal summer shall not fade."

The parallel is close. Both forms establish an idea and confirm it (AA in the song, the octave in the sonnet), then turn just past the halfway point (the bridge at bar 17 of 32, the volta at line 9 of 14), then resolve. The song's bridge works for the same reason the volta does: after hearing an idea twice, the listener is ready for a change, and the change makes the return of the main idea feel earned.

This is a useful test for your own writing in any form. Have you stated the idea clearly? Have you confirmed it? Where is your turn, and does something genuinely change there? A bridge that just repeats the verse with different notes is as weak as a volta that does not turn. A strong bridge gives the song a second thought.`,
          assignment: write('Write a 14-line sonnet OR a 32-bar AABA lyric (four 4-line sections) on the same subject. Mark the turn (volta or bridge) and write two sentences on what changes there. If you write the song, sketch the bridge melody in Chora and link it.'),
          resources: [R.pfSonnet18, R.pfGlossary, R.omt],
          anchors: [{ kind: 'concept', ref: "32-bar AABA form and the sonnet volta", note: "form comparison" }],
          asOf: AS_OF,
        },
        {
          id: lid(3, 3),
          title: 'Refrains, Choruses and the 12-Bar Blues',
          blurb: 'The chorus is a refrain with a hook. The blues stanza states a line, repeats it, and answers it, a three-line poem built on twelve bars of music.',
          minutes: 18,
          standardIds: ['MUSIC.COMP.68', 'MUSIC.HAR.68', 'CCSS.ELA-LITERACY.RL.5.5', 'MU:Cn11.0'],
          body: `A refrain is a line or group of lines that returns after each stanza of a poem or song. Ballads have used refrains for centuries, sometimes as nonsense syllables that let a group join in. In verse–chorus form, the most common shape in popular song since the 1960s, the refrain grows into a full chorus. The verses change their words and move the story or argument along; the chorus keeps the same words and melody every time and holds the song's central idea and title. Many songs add a bridge, a third section that appears once, near the end.

The blues has its own form, and it is both a musical and a poetic structure. The 12-bar blues is twelve measures long with a standard chord pattern: four bars on the I chord, two bars on IV, two back on I, then one bar on V, one on IV, and two on I (often with a V in the last bar to set up the next verse). In C, that is C C C C, F F C C, G F C C. Generations of musicians have improvised on these twelve bars, and once you know the pattern you will hear it in blues, early rock and roll, jazz and country.

The lyric of a blues stanza has an AAB shape: a line is stated, repeated (often with a small change), and then answered by a rhyming line that completes the thought. Each line fills four bars. Here is a made-up example: "I left my coat out in the rain last night / Yes, I left my coat out in the rain last night / Now every pocket's full of water, and the buttons won't sit right." The repetition gives the singer time to think of the answer, gives the listener time to feel the problem, and makes the punchline land harder.

W. C. Handy's "St. Louis Blues," published in 1914, helped make the blues a national music, and the earliest blues recordings from the 1920s are now in the public domain and free to hear through the Library of Congress and the Internet Archive. As a form, the blues stanza is a tiny essay: claim, emphasis, consequence. It rewards concrete, specific images and a final line with a twist.`,
          assignment: make('Write two blues stanzas in AAB form about a small, real annoyance. Make the B line rhyme with the A line and land a twist. In Chora, play or program the 12-bar chord pattern in C (C C C C | F F C C | G F C C) and sing or speak your stanzas over it. Post the recording and the lyric.'),
          resources: [R.locBlues, R.ia78, R.locJukebox],
          anchors: [{ kind: 'concept', ref: "12-bar blues form and AAB lyric", note: "standard blues progression; St. Louis Blues 1914" }],
          asOf: AS_OF,
        },
        {
          id: lid(3, 4),
          title: 'Theme and Variations: Music\'s Retellings',
          blurb: 'A theme and variations tells the same tune again and again in new ways, just as storytellers have retold Cinderella in dozens of cultures.',
          minutes: 16,
          standardIds: ['MUSIC.COMP.68', 'MU:Re7.2', 'MU:Re8.1', 'CCSS.ELA-LITERACY.RL.5.5'],
          body: `In a theme and variations, a composer presents a melody (the theme) and then repeats it several times, each time changed: faster or slower, major or minor, decorated with extra notes, given a new rhythm, moved into the bass. The theme stays recognisable underneath, so the listener's job is to find the familiar thing in its new costume. It is one of the oldest instrumental forms and one of the easiest to follow.

The tune many English speakers know as "Twinkle, Twinkle, Little Star" is a French song, "Ah! vous dirai-je, maman." Around 1781–82 Mozart wrote twelve variations on it for piano (K. 265). In one variation the melody is buried under fast running notes; in another the left hand takes over the busy part; one variation moves into C minor and suddenly the nursery tune sounds serious; near the end comes a slow, ornamented variation before a brilliant finish. It is a masterclass in how many ways one idea can be told.

Literature does the same thing with stories. Folklorists have found Cinderella-type tales in many cultures. A version about a girl named Ye Xian was written down in China in the 9th century. Charles Perrault's French version (1697) gave us the fairy godmother and the glass slipper; the Brothers Grimm's German "Aschenputtel" (1812) has no godmother but a magic tree and helpful birds. Each retelling keeps the theme (a mistreated girl, a transformation, a recognition) and changes the details to fit a new teller and audience.

When you analyse a variation, or a retelling, ask the same two questions: what stays the same, and what changes? What stays is the identity of the work. What changes is the interpretation. A strong variation, like a strong retelling, does not just decorate the original. It reveals something in it you had not noticed.`,
          assignment: make('Take a simple tune everyone knows (a nursery song or folk song). In Chora, write three variations: one that changes the rhythm, one that moves it to minor, and one that decorates the melody with extra notes. Post them with a sentence on what each variation reveals about the tune, as if you were comparing three retellings of a fairy tale.'),
          resources: [R.imslpMozart, R.omt, R.gutMotherGoose],
          anchors: [{ kind: 'concept', ref: "Theme and variations; tale-type retellings", note: "Mozart K. 265; Cinderella versions" }],
          asOf: AS_OF,
        },
        {
          id: lid(3, 5),
          title: 'Sonata Form: Exposition, Conflict, Resolution',
          blurb: 'The great instrumental form of the Classical era works like a plot: two themes in conflict, a development full of complications, and a recapitulation that resolves them.',
          minutes: 20,
          standardIds: ['MUSIC.HAR.68', 'MU:Re7.2', 'MU:Re8.1', 'CCSS.ELA-LITERACY.RL.11-12.5'],
          body: `Sonata form is the structure of most first movements of symphonies, sonatas and string quartets from Haydn and Mozart onward. The name is confusing, because "sonata" is also the name of a whole multi-movement piece. Here it means a single movement built in three large parts: exposition, development and recapitulation. Each has a job, and together they work remarkably like a plot.

The exposition introduces the characters and the conflict. The first theme is stated in the home key. A transition then moves the music to a new key, and a second theme arrives there, usually contrasting in character. In a major-key movement, the second key is usually the dominant; in a minor-key movement it is usually the relative major. The exposition ends in the new key, which means the piece has left home. In the score, the exposition is often marked to be repeated, so the listener hears the characters twice.

The development is the complication. The composer takes fragments of the themes and puts them under pressure: moving quickly through distant keys, breaking motifs into pieces, combining them, building tension. It is the part of the story where everything gets tangled. Near its end the music usually prepares a return to home, often with a long passage on the dominant that makes the listener hungry for the tonic.

The recapitulation is the resolution. The first theme returns in the home key, and then, crucially, the second theme returns in the home key too. The material that once lived in the "other" key has been brought home; the tension of the exposition is resolved. A coda may follow to close the story. Listen to the first movement of Mozart's Eine kleine Nachtmusik (K. 525, 1787) in G major: its second theme appears in D major in the exposition and comes back in G in the recapitulation. Once you hear the form as a plot, a ten-minute movement stops being a wall of notes and becomes a story you can follow.`,
          assignment: write('Listen to the first movement of Mozart\'s Eine kleine Nachtmusik (or another sonata-form movement). Write a one-page "plot summary" of it as if the themes were characters: who they are, where the conflict starts, what goes wrong in the development, and how the recapitulation resolves it. Include at least three timestamps as evidence.'),
          resources: [R.imslpMozart, R.omt, R.iaAudio],
          anchors: [{ kind: 'concept', ref: "Sonata form", note: "Classical sonata-form conventions; K. 525" }],
          asOf: AS_OF,
        },
        {
          id: lid(3, 6),
          title: 'Leitmotif: Music as Character',
          blurb: 'A musical idea tied to a person, object or idea, from Berlioz and Wagner to Prokofiev and today\'s film scores.',
          minutes: 18,
          standardIds: ['MUSIC.COMP.HS', 'MU:Re8.1', 'MU:Cn11.0', 'CCSS.ELA-LITERACY.RL.11-12.5'],
          body: `A leitmotif (German for "leading motif") is a short musical idea attached to a character, place, object or idea, which returns whenever that thing appears or is thought about. It is the motif from Track 2 given a job in a story. Leitmotifs let music tell the audience things the words do not say: a character's theme played quietly while someone else is speaking can reveal who they are thinking about.

The idea grew through the 19th century. In his Symphonie fantastique (1830), Hector Berlioz used a recurring melody he called the idée fixe ("fixed idea") to represent the beloved woman who obsesses the symphony's hero; it reappears in every movement, transformed by the hero's changing moods. Richard Wagner built his four-opera cycle Der Ring des Nibelungen (first performed complete in 1876) on a web of dozens of motifs for characters, objects like the ring and the sword, and ideas like fate. The term "leitmotif" was popularised by Wagner's admirers, especially Hans von Wolzogen, rather than by Wagner himself.

For younger listeners, the clearest example is Sergei Prokofiev's Peter and the Wolf (1936), in which every character is an instrument with its own theme: the bird is a flute, the duck an oboe, the cat a clarinet, the grandfather a bassoon, the wolf three French horns, and Peter the string section. Film composers use the same technique constantly; once a theme has been tied to a hero or a villain, the score can announce them before they appear on screen.

In literary terms, a leitmotif is characterisation and foreshadowing at once. It works because of memory: the first time we hear the theme, we learn its meaning; every later appearance draws on that meaning and adds to it. A leitmotif that changes (from major to minor, from full orchestra to a lone instrument) shows a character changing. Analysing leitmotifs is analysing how a work's parts build its whole, which is exactly what high-school literary study asks of a novel or play.`,
          assignment: make('Write a short story scene with two characters (150–300 words, in Lorea or in your post). Then, in Chora, compose a 2–4 bar leitmotif for each character and a 30-second cue that plays under the scene, bringing in each motif when that character acts or is mentioned, and changing one motif to show a character changing. Post the scene, the cue, and a sentence explaining each motif.'),
          resources: [R.imslpBerlioz, R.imslpWagner, R.iaAudio],
          anchors: [{ kind: 'concept', ref: "Leitmotif and idée fixe", note: "Berlioz, Wagner, Prokofiev usage" }],
          asOf: AS_OF,
        },
      ],
    },
    // ═══════════════════════════════════════════════════════════════════════
    // 4. THE SONGWRITER'S CRAFT (WRITING WORKSHOP)
    // ═══════════════════════════════════════════════════════════════════════
    {
      id: `${C}.t4`,
      title: 'The Songwriter\'s Craft',
      blurb: 'A writing workshop for lyrics. Choose a point of view, build a scene from concrete images and figurative language, make the hook your thesis, rhyme on purpose, revise in rounds, and defend your finished song in a programme note.',
      level: 'INTERMEDIATE',
      lessons: [
        {
          id: lid(4, 1),
          title: 'Who Is Singing? Point of View and Narrative',
          blurb: 'Every song is told by someone, to someone. Choosing the narrator is the first and biggest decision in a story song.',
          minutes: 16,
          standardIds: ['CCSS.ELA-LITERACY.W.5.3', 'CCSS.ELA-LITERACY.W.8.3', 'MUSIC.COMP.68', 'MU:Cr1.1'],
          body: `Before you write a single line, decide who is singing. In a first-person song ("I"), the singer is a character, and the listener hears their feelings directly; most love songs and many protest songs work this way. In a second-person song ("you"), the singer speaks to someone, and the listener overhears, as if reading a letter. In a third-person song ("she," "he," "they"), the singer is a narrator telling someone else's story, the way the old ballads do. Each choice changes what the song can show and what it has to leave out.

A story song needs the same parts as any narrative: a situation and a character the listener can picture, a complication, a turning point, and a resolution or a meaningful lack of one. Writing standards for upper elementary and middle school ask for exactly these tools: establishing a situation and narrator, using dialogue and description, pacing, transitions that show shifts in time and place, and a conclusion that follows from what came before. A song has to do all of that in about three minutes, so every line must earn its place.

Songs have a special tool for pacing: the verse and the chorus. The verses move time forward (morning, then evening; this year, then ten years later), while the chorus stays the same. Clever songwriters let the chorus words stay identical while the story around them changes, so the same line means something new each time it comes back. That is the motif idea from Track 2, applied to words.

Try the same event from three points of view and you will see how much the choice matters. A missed bus told by the person running for it is a comedy. Told by the driver who sees them in the mirror, it is a small moral choice. Told by a narrator who knows the runner was on the way to a job interview, it becomes a story about luck. Same facts, three different songs. Choose the narrator who has the most at stake.`,
          assignment: write('Pick one small real event (a missed bus, a lost pet, a first day). Write the opening verse of a song about it three times: in first person, second person and third person. Then choose the version you want to finish, and write one paragraph explaining why that narrator has the most at stake.'),
          resources: [R.gutChild, R.pfGlossary, R.folkways],
          anchors: [{ kind: 'concept', ref: "Narrative point of view in song lyrics", note: "CCSS W.5.3 / W.8.3 narrative techniques" }],
          asOf: AS_OF,
        },
        {
          id: lid(4, 2),
          title: 'Show, Don\'t Tell: Imagery and Figurative Language',
          blurb: 'Concrete images make a listener feel; abstractions only tell them what to feel. Similes, metaphors and personification let a lyric say more in fewer words.',
          minutes: 18,
          standardIds: ['CCSS.ELA-LITERACY.L.5.5', 'CCSS.ELA-LITERACY.W.8.3', 'MUSIC.COMP.68', 'MU:Cr2.1'],
          body: `"I was so sad" tells the listener a feeling. "I left your coffee cup in the sink for a week" shows them one, and lets them feel it themselves. Concrete images, things you can see, hear, touch, taste or smell, are the strongest material a lyricist has. Abstract words like "love," "pain," "freedom" and "forever" are important, but they work best when they arrive after the listener has been given something to picture. A good rule for a first draft: every verse needs at least one object you could photograph.

Figurative language says one thing in terms of another. A simile makes a comparison with "like" or "as": Robert Burns wrote in 1794, "O my Luve is like a red, red rose." A metaphor makes the comparison directly, without "like": Emily Dickinson's "'Hope' is the thing with feathers" (published 1891) turns an emotion into a small bird that sings inside us. Personification gives human qualities to something non-human, the wind that "whispers," the city that "never sleeps." Hyperbole exaggerates on purpose ("I've told you a million times"). Idioms are phrases whose meaning is not the sum of their words ("break a leg").

Songs are full of figurative language because it compresses. "Swing low, sweet chariot" uses the image of a chariot (recalling the biblical story of the prophet Elijah carried to heaven in a chariot of fire) to say, in four words, something about rescue, death and home that a plain sentence would need far more words for. A good metaphor gives the listener a picture and a meaning at the same time.

The craft is in choosing fresh images and following them through. A cliché is a figure of speech used so often it no longer makes a picture ("heart of gold," "cold as ice"). Try replacing each cliché in a draft with an image only you could have written. And once you choose a metaphor, stay inside it for a while: if love is a garden in verse one, let something grow, wilt or get weeded in verse two. An extended metaphor carried through a whole song is called a conceit, and it is one of the most satisfying things a lyric can do.`,
          assignment: write('Write a verse about a feeling WITHOUT naming the feeling. Use at least three concrete images, one simile, one metaphor, and one example of personification, and underline each. Then find one cliché in something you have written before and rewrite it as a fresh image.'),
          resources: [R.pfBurns, R.pfDickinson, R.pfGlossary],
          anchors: [{ kind: 'concept', ref: "Imagery and figurative language", note: "CCSS L.5.5 figurative language" }],
          asOf: AS_OF,
        },
        {
          id: lid(4, 3),
          title: 'The Hook Is Your Thesis',
          blurb: 'The hook is the line everyone remembers, usually the title. Like the thesis of an essay, it states what the song is about, and every verse should support it.',
          minutes: 15,
          standardIds: ['MUSIC.COMP.68', 'MU:Cr1.1', 'MU:Cr3.1', 'CCSS.ELA-LITERACY.W.8.3'],
          body: `In songwriting, the hook is the catchiest, most memorable part of a song, usually a short line in the chorus that contains the title and is set to the most singable melody. When someone hums a song in the grocery store, they are humming the hook. It is the line the song was built to deliver.

An essay has a similar centre: the thesis, the single claim that every paragraph supports. Thinking of a hook as a thesis is one of the most useful habits a songwriter can build. If the hook is the claim, the verses are the evidence. Each verse should give the listener a new reason, scene or angle that makes the hook truer or more surprising when it comes back. A verse that has nothing to do with the hook is like an essay paragraph that wanders off-topic: it may be pretty, but it weakens the whole.

Traditional songs show this clearly. In "Amazing Grace," the title phrase opens the hymn, and every stanza after that gives evidence for the claim: what grace did, when it appeared, what it promises. In a call-and-response spiritual, the repeated response is the hook, the line everyone sings together, and the calls supply the details. The same structure holds in the newest pop song: a memorable title phrase, placed at the start or end of the chorus, sung on the strongest melody, supported by verses that make it land.

A practical method: before writing verses, write ten possible hooks. Make them short (two to six words), concrete and singable, with open vowels on the long notes. Read each one aloud and ask: what would the verses have to prove for this line to feel true by the last chorus? Choose the hook that gives you the most interesting answer. Then test the finished song by reading each verse and asking, "Does this make the hook stronger?" Cut or rewrite anything that does not.`,
          assignment: write('Write ten possible hooks for a song about a place that matters to you. Choose one, and write it as a thesis sentence ("This song argues that..."). Then outline two verses as two pieces of evidence for it. Bonus: sing the hook in Chora on the most singable melody you can find.'),
          resources: [R.gutHymns, R.locSpirituals, R.omt],
          anchors: [{ kind: 'concept', ref: "Song hook as thesis", note: "songwriting craft" }],
          asOf: AS_OF,
        },
        {
          id: lid(4, 4),
          title: 'The Rhyme Toolbox: Perfect, Slant and Internal',
          blurb: 'Rhyme is a choice, not a requirement. Learn the kinds of rhyme, the common rhyme schemes, and how to avoid twisting a sentence just to make it rhyme.',
          minutes: 16,
          standardIds: ['CCSS.ELA-LITERACY.L.5.5', 'CCSS.ELA-LITERACY.RL.4.5', 'MUSIC.COMP.68', 'MU:Cr2.1'],
          body: `A perfect rhyme matches the stressed vowel sound and everything after it, while the sounds before differ: "cat" and "hat," "sound" and "found," "station" and "nation." Perfect rhymes feel solid and closed, which makes them good for endings and punchlines. Rhymes of more than one syllable, like "dreary" and "weary," feel especially rich; in song they let a melody linger on a matching pair of sounds.

A slant rhyme (also called a near rhyme or half rhyme) matches only part of the sound: "soul" and "all," "home" and "alone," "heart" and "hard." Emily Dickinson used slant rhyme constantly, and readers in her time found it strange; now it sounds modern and honest, because it avoids the sing-song click of perfect rhyme. Songwriters use slant rhyme all the time because it gives them many more word choices. When a singer holds the vowel, a slant rhyme often sounds nearly perfect anyway.

An internal rhyme happens inside a line instead of only at the end. Poe's "The Raven" (1845) opens "Once upon a midnight dreary, while I pondered, weak and weary," rhyming in the middle and at the end of the same line, and it gives the poem its hypnotic music. Internal rhymes speed a line up and make it fun to say, which is why they are central to rap and patter songs.

Rhyme schemes are written with letters: AABB (couplets), ABAB (alternating), and ABCB, the ballad pattern where only lines two and four rhyme. The biggest mistake beginners make is bending a sentence out of shape to reach a rhyme, as in "To the store went I." Nobody talks like that, and listeners hear the strain instantly. If the rhyme forces bad grammar or a word you would never say, change the rhyme, use a slant rhyme, or rewrite the line so a different word lands at the end. Rhyme should sound like it happened naturally, even when it took an hour.`,
          assignment: write('Write an eight-line lyric with the rhyme scheme ABCB ABCB. Use at least one perfect rhyme, one slant rhyme and one internal rhyme, and label each. Then find one line where you bent the grammar to reach a rhyme (or invent one) and rewrite it so it sounds like real speech.'),
          resources: [R.pfRaven, R.gutPoe, R.pfGlossary],
          anchors: [{ kind: 'concept', ref: "Rhyme types and rhyme schemes", note: "perfect, slant and internal rhyme definitions" }],
          asOf: AS_OF,
        },
        {
          id: lid(4, 5),
          title: 'Revision: Writing Is Rewriting',
          blurb: 'Great songs and poems are rarely written in one go. Dickinson kept lists of alternative words; Beethoven filled sketchbooks. Here is a revision cycle you can use.',
          minutes: 18,
          standardIds: ['MU:Cr3.1', 'MU:Cr3.2', 'MUSIC.COMP.68', 'CCSS.ELA-LITERACY.W.8.3'],
          body: `The finished version of a song or poem hides the work that went into it. Emily Dickinson's manuscripts often show small crosses in the text leading to alternative words written at the bottom of the page, choices she was still weighing. Beethoven kept sketchbooks throughout his life, and scholars can follow a theme through version after version as he reshaped it. Revision is not a sign that the first draft failed. It is how good work is made.

Revise in rounds, each with one job, instead of trying to fix everything at once. Round one is about the big picture: is the point of view right, does the hook state what the song is about, does each verse add something new? Round two is about language: replace abstractions with images, cut clichés, check that every metaphor holds together. Round three is about sound: sing every line and check prosody (stresses on strong beats, open vowels on long notes) and rhyme. Round four is about cutting: remove any line you would not miss.

Get feedback, and learn to give it well. A useful pattern is "praise, question, suggest": name something specific that works, ask a real question about something unclear, and offer one concrete idea. "I loved the coffee cup image. Who is the 'you' in verse two? What if the chorus came in earlier?" is far more helpful than "It's good" or "I didn't like it." When you receive feedback, listen for what confused the listener even if you reject their fix; confusion is information.

Keep your drafts. Chora and Lorea both keep version history, so you can always go back to an earlier version if a revision makes things worse. Writers often discover that the best line in the final version was rescued from a draft they had abandoned. Revision is also where you learn the most: comparing draft one with draft four is the clearest picture you will ever get of your own growth as a writer.`,
          assignment: write('Take a lyric you wrote earlier in this course. Revise it in four labelled rounds (big picture, language, sound, cutting), saving each version. Trade with a partner and give "praise, question, suggest" feedback. Post draft one and the final draft side by side with three sentences about the most important change.'),
          resources: [R.gutDickinson, R.imslpB5, R.pfGlossary],
          anchors: [{ kind: 'concept', ref: "Revision process in writing and composition", note: "Dickinson variants; Beethoven sketchbooks" }],
          asOf: AS_OF,
        },
        {
          id: lid(4, 6),
          title: 'The Programme Note: Arguing for Your Work',
          blurb: 'A programme note or artist statement is argument writing: a clear claim about your piece, supported by evidence from the music and words.',
          minutes: 20,
          standardIds: ['MUSIC.COMP.HS', 'MU:Cr3.2', 'MU:Re9.1', 'CCSS.ELA-LITERACY.RL.11-12.5'],
          body: `At a concert, the short essay printed for the audience about each piece is called a programme note (or program note). An artist statement does a similar job in a gallery or portfolio. Both are often written badly: a cloud of adjectives ("a vibrant, emotional journey") with nothing a reader could check. A strong programme note is something else entirely. It is an argument: it makes a claim about what the piece does and how, and it supports that claim with evidence the listener can hear.

Structure it like any argument. Start with a claim: one or two sentences saying what the piece is about and the main way it achieves its effect. "This song tells the story of a missed bus from the driver's point of view, and its chorus returns three times with the same words but a different meaning each time." Then give evidence: point to specific moments, by bar number, timestamp or lyric line. "In the last chorus (2:41), the melody drops an octave on 'I kept driving,' so the line sounds like a confession instead of an excuse." Then explain the reasoning: why that choice produces that effect.

Know your reader. A programme note is read in a few minutes by people who are about to listen, so it should help them hear something they would otherwise miss, not summarise every bar. Give them two or three things to listen for. Short context helps (what inspired the piece, what form it uses), but the core is the guided listening. Aim for about 150 to 300 words for a short piece.

Writing a programme note also makes you a better composer. If you cannot state what your piece is doing, or cannot find evidence for your claim in the music, that is a sign the piece needs one more revision. And reading the programme notes of others, alongside the free scores on IMSLP, teaches you to hear structure: you start listening for the evidence, the same way a strong reader of literature reads for how parts build the whole.`,
          assignment: write('Write a 150–300 word programme note for a song or piece you made in this course. Open with a one-sentence claim, support it with at least three pieces of evidence (bar numbers, timestamps or lyric lines), and tell the audience two things to listen for. Post it with a link to the recording in Chora.'),
          resources: [R.imslpMozart, R.omt, R.iaAudio],
          anchors: [{ kind: 'concept', ref: "Program note as argument writing", note: "claim-evidence-reasoning structure" }],
          asOf: AS_OF,
        },
      ],
    },
    // ═══════════════════════════════════════════════════════════════════════
    // 5. READING SCORES LIKE TEXTS & MUSIC MATH
    // ═══════════════════════════════════════════════════════════════════════
    {
      id: `${C}.t5`,
      title: 'Reading Scores Like Texts & Music Math',
      blurb: 'Notation is a writing system with a history. Read a score for its plot and for how it paints words, then open the math underneath: rhythm as fractions, harmony as ratios, and tuning as an exponential function.',
      level: 'ADVANCED',
      lessons: [
        {
          id: lid(5, 1),
          title: 'Notation Is a Writing System',
          blurb: 'From neumes over chant texts to Guido\'s staff, rhythmic note shapes and the printing press: how people learned to write sound down.',
          minutes: 18,
          standardIds: ['MUSIC.NOT.68', 'MU:Cn11.0', 'MU:Pr4.2', 'CCSS.ELA-LITERACY.RL.11-12.5'],
          body: `Writing systems were invented to record speech so that words could outlast the speaker. Music notation was invented for the same reason, and its history looks a lot like the history of alphabets: a slow move from memory aids to a precise code anyone trained could read cold. For most of history, music was learned by ear. Notation began when ear-learning stopped being enough.

In the 9th century, as church leaders tried to make chant sung the same way across a large empire, scribes began writing neumes: small marks above the Latin words showing whether the melody went up or down. Neumes were reminders for singers who already knew the tune; they did not tell you exact pitches. Around 1025, the Italian monk Guido of Arezzo described a system of lines spaced a third apart, with letters (the ancestors of our clefs) fixing what pitch each line meant. Now a singer could read a melody they had never heard. Guido also taught singers to remember the steps of the scale using the hymn "Ut queant laxis," whose phrases begin on successively higher notes with the syllables ut, re, mi, fa, sol, la. "Ut" later became "do," and that is where do-re-mi comes from.

Pitch came first; time came later. In the 13th century, theorists such as Franco of Cologne set out rules by which the shape of a note showed its duration. That idea, note shapes as lengths, is still the basis of our whole notes, half notes and quarter notes. In 1501, the Venetian printer Ottaviano Petrucci published the Harmonice Musices Odhecaton, the first book of polyphonic music printed from movable type, and printed music began to spread the way printed books did.

Modern notation is a remarkably efficient graph: pitch on the vertical axis, time on the horizontal, with symbols for loudness, articulation and character layered on top. Like any writing system, it leaves things out (the exact swing of a groove, the timbre of a voice), which is why performers interpret it, the way an actor interprets a script. Learning to read it is literacy in the full sense: the ability to receive ideas from someone you will never hear in person.`,
          assignment: write('Find a page of Gregorian chant on IMSLP and a page of a modern score. Write a 250-word comparison as if you were a historian of writing systems: what each notation records, what it leaves to the reader\'s memory or judgment, and what had to be invented to get from one to the other.'),
          resources: [R.imslpChant, R.omt, R.mtnLessons],
          anchors: [{ kind: 'concept', ref: "History of Western music notation", note: "neumes, Guido of Arezzo, Franco of Cologne, Petrucci 1501" }],
          asOf: AS_OF,
        },
        {
          id: lid(5, 2),
          title: 'Reading a Score for Plot: Tension and Release',
          blurb: 'A score shows you its story before you hear it: watch the dynamics, register, density and speed to find the rising action and the climax.',
          minutes: 18,
          standardIds: ['MUSIC.NOT.68', 'MU:Re7.2', 'MU:Re8.1', 'MU:Pr4.3', 'CCSS.ELA-LITERACY.RL.11-12.5'],
          body: `Readers learn to map a story's plot: exposition, rising action, climax, falling action, resolution. Music has a plot too, built from tension and release, and much of it is visible on the page before you play a note. Learning to read a score this way is like skimming a novel's chapter lengths and dialogue density: you can see where things speed up, thicken and explode.

Look for five signals. Dynamics: markings from pp (very soft) to ff (very loud), and the long wedge-shaped hairpins for crescendo and diminuendo, show where energy rises and falls. Register: notes climbing high on the staff, or spreading wide between bass and treble, usually build tension. Density: count how many instruments or voices are playing; a page that fills up is a scene getting crowded. Rhythmic activity: shorter note values and faster tempo markings raise the pulse. Harmony: chords far from the home key, or long stretches on the dominant, create the "not yet" feeling that makes the return home satisfying.

A perfect piece to practise on is "In the Hall of the Mountain King," from Edvard Grieg's music for Henrik Ibsen's play Peer Gynt (1876). In the play, Peer is trapped in the hall of the troll king. The score shows the plot clearly: a short theme begins very softly and slowly in the low instruments, then repeats again and again while the music gets louder, higher, thicker and faster, until the whole orchestra is crashing. Rising action, written as one long crescendo and accelerando. You can see it on the page before you hear it.

When you read a score for plot, mark the climax and ask why it is there. In many pieces the highest point of tension comes about two-thirds to three-quarters of the way through, the same place many stories put their climax. Then compare your reading with a performance: performers make interpretive choices about how much tension to build and where, which is why two recordings of the same score can tell the story differently. That comparison, the text and its interpretations, is the heart of literary analysis.`,
          assignment: make('Open the free score of Grieg\'s "In the Hall of the Mountain King" on IMSLP (Peer Gynt Suite No. 1) and listen to a recording. Draw a tension graph (time across, tension up) and mark where each of the five signals changes. Post the graph with three bar numbers as evidence. Then, in Chora, write 16 bars of your own that build the same way from one short repeated idea.'),
          resources: [R.imslpGrieg, R.iaAudio, R.omt],
          anchors: [{ kind: 'concept', ref: "Tension and release in score analysis", note: "Grieg, In the Hall of the Mountain King" }],
          asOf: AS_OF,
        },
        {
          id: lid(5, 3),
          title: 'Word Painting: When the Music Acts Out the Text',
          blurb: 'Rising lines on "ascending," a solo voice on "all alone," a zigzag on "crooked." Composers have long illustrated individual words, and reading for it is close reading.',
          minutes: 16,
          standardIds: ['MU:Re7.2', 'MU:Re8.1', 'MUSIC.COMP.HS', 'CCSS.ELA-LITERACY.L.5.5', 'CCSS.ELA-LITERACY.RL.11-12.5'],
          body: `Word painting (also called text painting) is the technique of making the music literally depict the words being sung. It was a favourite game of the English madrigal composers around 1600. Thomas Weelkes's madrigal "As Vesta was from Latmos hill descending" (published in 1601) is full of it: on "descending," the voices run down the scale; on "ascending," they climb; on "two by two," two voices sing together; on "three by three," three; and on "all alone," a single voice sings by itself. Reading the score is like reading a picture book where the pictures are made of notes.

Handel's Messiah (1741) shows the technique in a more serious setting. In the tenor aria "Every valley shall be exalted," setting words from Isaiah, the word "exalted" is sung on a long, rising run of quick notes, lifted high. "Every mountain and hill made low" drops to a low note on "low." In "the crooked straight," the melody zigzags on "crooked" and then holds a single steady note on "straight." The music does not just accompany the meaning; it performs it.

Word painting connects directly to the figurative language of Track 4. A melodic line that rises on "rising" is a kind of musical onomatopoeia; a long, unresolved dissonance on "longing" works like a metaphor, giving the listener a physical sensation that stands for the emotion. It also connects to prosody: placing a word on the right beat and pitch is the minimal level of fitting music to text, and word painting is the maximal one.

Used too heavily, word painting can feel like a gimmick, and later composers often preferred to paint the mood of a whole poem rather than each individual word. But reading a vocal score for it is excellent training in close reading: you have to know what each word means, find where the composer chose to illustrate it, and judge whether the choice deepens the text or merely decorates it. That judgement is exactly what an essay on a poem asks you to make.`,
          assignment: make('Follow "Every valley shall be exalted" in the free Messiah score on IMSLP while listening. List four examples of word painting with bar numbers. Then write one line of lyric of your own containing a word of motion or shape (rising, falling, spinning, broken) and set it in Chora so the music paints the word. Post both.'),
          resources: [R.imslpMessiah, R.imslpWeelkes, R.iaAudio],
          anchors: [{ kind: 'concept', ref: "Word painting (text painting)", note: "Weelkes 1601; Handel Messiah" }],
          asOf: AS_OF,
        },
        {
          id: lid(5, 4),
          title: 'Music Math I: Rhythm Is Fractions',
          blurb: 'A half note is half of a whole note. A measure of 3/4 holds three quarters. Writing rhythm is adding fractions, and reading it builds number sense.',
          minutes: 16,
          standardIds: ['MUSIC.RHY.35', 'MUSIC.NOT.35', 'CCSS.MATH.3.NF', 'CCSS.MATH.4.NF', 'MU:Pr4.2'],
          body: `In American English, note values are named as fractions. Start with a whole note. A half note lasts half as long, so two half notes equal one whole. A quarter note lasts a quarter as long: four quarters make a whole. Eighth notes are an eighth, sixteenth notes a sixteenth. Each value is exactly half of the one before it, which makes the system a neat lesson in unit fractions: 1 = 1/2 + 1/2 = 1/4 + 1/4 + 1/4 + 1/4, and so on.

The time signature tells you how much each measure holds. In 4/4, a measure holds four quarter notes, a total of 4/4 = 1 whole note. In 3/4 it holds three quarter notes, a total of 3/4 of a whole note. In 6/8 it holds six eighth notes, which also adds up to 3/4 of a whole note, but grouped as two sets of three, so it feels different (more on that below). Strictly speaking, a time signature is not a fraction; the top number counts beats and the bottom number names the note value that gets one. But the total length of each measure really is that fraction of a whole note, and every measure has to add up exactly.

So writing rhythm is adding fractions with a fixed sum. A measure of 4/4 might be 1/4 + 1/8 + 1/8 + 1/2: does it add to 1? Rewrite everything in eighths: 2/8 + 1/8 + 1/8 + 4/8 = 8/8. Yes. Dots and ties add fractions too. A dot adds half the note's own value, so a dotted half note is 1/2 + 1/4 = 3/4 of a whole, which is why one dotted half fills a whole measure of 3/4. A dotted quarter is 1/4 + 1/8 = 3/8.

The 3/4 and 6/8 puzzle shows that equal fractions can feel different. Both measures last 3/4 of a whole note, but 3/4 is felt as three beats (ONE two three) and 6/8 as two beats each divided in three (ONE-and-a TWO-and-a). In fraction terms, 3/4 = 6/8, but grouping changes meaning, the way the same words with different punctuation can mean different things. This is where math, music and language meet: the numbers are equal, the stories they tell are not.`,
          assignment: make('Write four measures of 4/4 and four measures of 3/4 in Chora, using at least one dotted note and one pair of eighth notes. Under each measure, write the fraction addition that proves it is full (for example, 1/4 + 1/8 + 1/8 + 1/2 = 1). Then rewrite one 3/4 measure as 6/8 and post a sentence about how it feels different.'),
          resources: [R.mtnLessons, R.mtnExercises, R.omt],
          anchors: [{ kind: 'concept', ref: "Note values as fractions", note: "CCSS 3.NF / 4.NF connection" }],
          asOf: AS_OF,
        },
        {
          id: lid(5, 5),
          title: 'Music Math II: Harmony Is Ratios',
          blurb: 'Halve a string and it sounds an octave higher. The ancient Greeks discovered that the most consonant intervals are the simplest whole-number ratios.',
          minutes: 18,
          standardIds: ['MUSIC.HAR.68', 'CCSS.MATH.6.RP', 'MU:Cn11.0', 'MU:Re7.2'],
          body: `A monochord is a single string stretched over a sound box, with a movable bridge that divides the string into two parts. Ancient Greek thinkers, in a tradition later credited to Pythagoras and his followers (c. 6th century BCE), used it to discover something remarkable: the intervals that sound most consonant correspond to the simplest ratios of string length. Stop the string at its middle, so the vibrating part is 1/2 as long, and it sounds an octave higher: a ratio of 2:1. Stop it at 2/3 of its length and it sounds a perfect fifth higher: 3:2. At 3/4 of its length, a perfect fourth: 4:3.

(You may hear the story that Pythagoras discovered this by listening to blacksmiths whose hammers weighed 6, 8, 9 and 12 pounds. It is an ancient legend, but it does not work physically: hammer pitch does not scale with weight that way. The monochord measurement does work, and you can test it with any guitar string. Pressing a guitar string at the 12th fret halves its vibrating length and raises it an octave.)

Today we usually describe pitch by frequency, the number of vibrations per second, measured in hertz (Hz). For a string at the same tension, frequency is inversely proportional to length: halve the length and the frequency doubles. The standard tuning pitch A above middle C is 440 Hz; an octave up is 880 Hz (2:1); a pure fifth above 440 Hz is 660 Hz (3:2); a pure fourth above 440 Hz is about 586.67 Hz (4:3). Ratios also combine by multiplying: a fifth (3/2) plus a fourth (4/3) gives 3/2 × 4/3 = 2, exactly an octave. That is why a fifth and a fourth stacked together fill an octave.

Why do simple ratios sound smooth? A musical tone is not one frequency but a stack of overtones at whole-number multiples of the lowest one. When two tones are in a simple ratio, many of their overtones coincide, so the combination sounds fused and stable. More complex ratios produce overtones that clash and "beat" against each other, which we hear as rougher or more tense. Consonance and dissonance, the tension and release you read for in a score's plot, have a mathematical root.`,
          assignment: make('Use a ruler and a guitar, ukulele or any string (or the tuner in Chora). Measure the full string length, then find and mark the half, two-thirds and three-quarters points. Play each and name the interval you hear. Post a table of length fraction, ratio, interval name and frequency starting from 440 Hz, and check that 3/2 × 4/3 = 2.'),
          resources: [R.omt, R.mtnLessons, R.mtnExercises],
          anchors: [{ kind: 'concept', ref: "Pythagorean ratios and the monochord", note: "interval frequency ratios" }],
          asOf: AS_OF,
        },
        {
          id: lid(5, 6),
          title: 'Music Math III: The Twelfth Root of Two',
          blurb: 'Pure ratios do not close the circle of twelve keys. Equal temperament fixes it by making every semitone the same ratio, 2^(1/12), which makes pitch an exponential function.',
          minutes: 20,
          standardIds: ['MUSIC.HAR.68', 'CCSS.MATH.8.EE', 'CCSS.MATH.HSF-LE', 'MU:Cn11.0'],
          body: `If the perfect fifth is the ratio 3:2, you might expect to build all twelve notes by stacking fifths: C, G, D, A, E and so on, twelve times, until you come back around to C seven octaves higher. Try the arithmetic. Twelve fifths multiply to (3/2)^12 ≈ 129.75. Seven octaves multiply to 2^7 = 128. They do not match. The leftover ratio, 531441/524288 ≈ 1.0136, is called the Pythagorean comma, about a quarter of a semitone. Pure fifths do not close the circle, and every tuning system in history is a way of deciding where to hide that gap.

Equal temperament hides it everywhere at once, in equal small shares. It divides the octave (ratio 2) into twelve equal steps, so each semitone must be a number that, multiplied by itself twelve times, gives 2. That number is the twelfth root of two: 2^(1/12) ≈ 1.05946. Each semitone raises the frequency by about 5.9%. Using exponent rules, n semitones above a note multiply its frequency by 2^(n/12), and twelve semitones give 2^(12/12) = 2, an octave, exactly. Mathematicians in China (Zhu Zaiyu, 1584) and Europe (Simon Stevin, around 1600) worked out this calculation independently.

This makes pitch an exponential function. Measured from A at 440 Hz, the frequency n semitones away is f(n) = 440 × 2^(n/12). The A's are 110, 220, 440 and 880 Hz: equal steps up in pitch are equal ratios in frequency, not equal differences. That is the difference between linear and exponential growth, and your ear is an exponential instrument. Middle C, nine semitones below A440, is 440 × 2^(-9/12) ≈ 261.63 Hz.

The cost of equality is purity. An equal-tempered fifth is 2^(7/12) ≈ 1.4983, very slightly smaller than the pure 1.5; musicians measure the difference in cents (100 cents per equal semitone), and it is about 2 cents, too small for most listeners to notice. Major thirds are about 14 cents wider than the pure 5:4, which many trained ears can hear. Every piano is a compromise: it gives up perfect consonance so that every key works equally well. For more practice, the Music Math quest in the Math classroom works through these functions step by step.`,
          assignment: write('Make a table of the twelve equal-tempered notes from A440 to A880 using f(n) = 440 × 2^(n/12), rounded to two decimals. Mark where the pure fifth (660 Hz) and pure major third (550 Hz) would fall and how far off the tempered notes are. Write a paragraph explaining, as if to a younger student, why equal temperament is an exponential function and what it trades away. Then continue in the Music Math quest in the Math classroom.'),
          resources: [R.omt, R.mtnLessons],
          anchors: [{ kind: 'concept', ref: "Equal temperament and the twelfth root of two", note: "Pythagorean comma; Zhu Zaiyu and Stevin" }],
          asOf: AS_OF,
        },
      ],
    },
  ],
};

// ── Practice questions ─────────────────────────────────────────────────────────
// Write the correct choice FIRST; mc() rotates the choices (keeping their cyclic order) so the
// correct answer lands on a spread-out index derived from the question id.
const spot = (id: string) => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return h % 4; };
const mc = (l: string, n: number, level: 1 | 2 | 3, prompt: string, choices: string[], hint: string, explanation: string): Question => {
  const id = `${l}.q${n}`;
  const target = spot(id);
  const rotated = choices.map((_, i) => choices[(i - target + 4) % 4]);
  return { id, lessonId: l, kind: 'mcq', prompt, choices: rotated, answer: target, hint, explanation, level };
};
const tf = (l: string, n: number, level: 1 | 2 | 3, prompt: string, answer: 0 | 1, hint: string, explanation: string): Question =>
  ({ id: `${l}.q${n}`, lessonId: l, kind: 'tf', prompt, answer, hint, explanation, level });

const T1 = [lid(1, 1), lid(1, 2), lid(1, 3), lid(1, 4), lid(1, 5), lid(1, 6)];
const T2 = [lid(2, 1), lid(2, 2), lid(2, 3), lid(2, 4), lid(2, 5), lid(2, 6)];
const T3 = [lid(3, 1), lid(3, 2), lid(3, 3), lid(3, 4), lid(3, 5), lid(3, 6)];
const T4 = [lid(4, 1), lid(4, 2), lid(4, 3), lid(4, 4), lid(4, 5), lid(4, 6)];
const T5 = [lid(5, 1), lid(5, 2), lid(5, 3), lid(5, 4), lid(5, 5), lid(5, 6)];

const QUESTIONS: Question[] = [
  // ── Track 1: Rhythm Is Language ──
  mc(T1[0], 1, 1, 'You pat a steady pulse on your knees while chanting a name. What is the steady pulse called?', ['The beat', 'The rhythm', 'The syllable', 'The rhyme'], 'It never speeds up or stops, like a clock.', 'The beat is the steady pulse underneath; the rhythm is the pattern the words make on top of it.'),
  mc(T1[0], 2, 1, 'How many claps does the name "Al-ex-an-der" get if you clap each syllable?', ['Four', 'Two', 'Three', 'Five'], 'Say it slowly and count the parts.', 'Al-ex-an-der has four syllables, so it gets four claps.'),
  mc(T1[0], 3, 2, 'In rhythm syllables, what does "ti-ti" stand for?', ['Two even sounds that share one beat', 'One sound that lasts a whole beat', 'One long sound held across two full beats', 'A beat of silence'], 'Ti-ti is quicker than ta.', 'Ti-ti is two even sounds in one beat, written as two eighth notes; ta is one sound on one beat, a quarter note.'),
  tf(T1[0], 4, 2, 'The beat changes speed to match how many syllables a word has.', 1, 'Think about a clock or a heartbeat.', 'False. The beat stays steady; it is the rhythm of the words that changes, fitting one or more syllables into each beat.'),

  mc(T1[1], 1, 1, 'Which sound device do "dock" and "clock" in "Hickory, dickory, dock" show?', ['Rhyme', 'Alliteration', 'Meter', 'Dialogue'], 'Listen to the ends of the words.', 'Words that end with the same sounds rhyme; alliteration repeats the starting sounds instead.'),
  mc(T1[1], 2, 1, '"Peter Piper picked a peck" repeats the same starting sound. What is that device called?', ['Alliteration', 'Rhyme', 'Refrain', 'Personification'], 'Look at the first letter of each word.', 'Alliteration is the repetition of the same starting consonant sound in nearby words.'),
  mc(T1[1], 3, 2, 'Why does a jump-rope chant need an especially steady beat?', ['The words have to stay in time with the turning rope', 'So it can be printed in a book', 'Because chants never rhyme', 'So that several jumpers can sing it in harmony'], 'What happens if the words and the rope disagree?', 'The chant coordinates the jumper and the rope; if the words lose the beat, someone trips.'),
  mc(T1[1], 4, 2, 'Playground rhymes passed from child to child, changing a little in each town, are an example of what?', ['Oral tradition', 'Through-composed form', 'Equal temperament', 'Programme notes'], 'They travel by voice, not paper.', 'Oral tradition is literature carried by voices and memory; folklorists such as Iona and Peter Opie documented how school rhymes vary from place to place.'),

  mc(T1[2], 1, 1, 'Which word is an iamb (unstressed, then stressed)?', ['a-BOVE', 'AP-ple', 'TI-ger', 'MER-ri-ly'], 'Iambs go da-DUM.', 'An iamb is unstressed then stressed, like a-BOVE; AP-ple and TI-ger are trochees, MER-ri-ly is a dactyl.'),
  mc(T1[2], 2, 2, 'Blake\'s line "Tyger Tyger, burning bright" is built mainly from which foot?', ['Trochee', 'Iamb', 'Anapest', 'Spondee'], 'Where does the stress fall in "Tyger"?', 'TY-ger TY-ger BURN-ing BRIGHT is stressed-unstressed, the trochee, with the last unstressed syllable dropped.'),
  mc(T1[2], 3, 2, 'What is the meter of "Shall I compare thee to a summer\'s day?"', ['Iambic pentameter', 'Trochaic tetrameter', 'Dactylic trimeter', 'Anapestic tetrameter'], 'Count the da-DUMs.', 'The line has five iambs (da-DUM × 5), which is iambic pentameter.'),
  mc(T1[2], 4, 3, 'The noun "PRO-duce" and the verb "pro-DUCE" are spelled the same. What tells them apart when spoken?', ['Which syllable is stressed', 'How many syllables they have', 'Whether they rhyme', 'How many letters they have'], 'Say both aloud and notice where you lean.', 'The two words differ only in stress placement, which shows that stress carries meaning in English.'),

  mc(T1[3], 1, 1, 'What syllable pattern defines common meter?', ['8.6.8.6', '8.8.8.8', '6.6.8.6', '10.10.10.10'], 'Count "Amazing grace! how sweet the sound."', 'Common meter alternates lines of eight and six syllables: 8.6.8.6. Long meter is 8.8.8.8 and short meter 6.6.8.6.'),
  mc(T1[3], 2, 2, 'Why can a common-meter poem be sung to the tune of "Amazing Grace"?', ['They share the same syllable and stress pattern', 'Newton wrote the words of both, so they always match', 'All poems fit every tune', 'The tune has no fixed rhythm'], 'Hymnals print a code like "C.M." above each hymn.', 'Any text in common meter fits any common-meter tune because the lines have the same number of syllables and stresses.'),
  tf(T1[3], 3, 2, 'The words of "Amazing Grace" and the tune most people sing today were published together for the first time in 1779.', 1, 'The words came first.', 'False. Newton\'s words were published in 1779; they were paired with the tune "New Britain" in 1835.'),
  mc(T1[3], 4, 3, 'Dickinson sets a poem about riding with Death in a steady hymn meter. What effect does that choice create?', ['A tension between a comforting form and an unsettling subject', 'It makes the poem impossible to sing', 'It shows that the poem was meant for children to chant at play', 'It hides the rhyme scheme'], 'What does a hymn rhythm lead you to expect?', 'The familiar hymn meter leads readers to expect a church song, so the strange subject matter feels more striking.'),

  mc(T1[4], 1, 1, 'In the time signature 3/4, what does the top number tell you?', ['There are three beats in each measure', 'The piece has three sections', 'Each note in the measure lasts three seconds', 'The song uses three instruments'], 'Top number counts; bottom number names a note.', 'The top number gives the beats per measure; the bottom number shows that a quarter note gets one beat.'),
  mc(T1[4], 2, 1, 'What is the first, strongest beat of a measure called?', ['The downbeat', 'The pickup', 'The cadence', 'The bar line'], 'A conductor\'s hand moves down on it.', 'The downbeat is beat one, the musical equivalent of a stressed syllable.'),
  mc(T1[4], 3, 2, 'A line of dactyls (DUM-da-da) fits most naturally into which meter?', ['A triple meter such as 3/4', '2/4', 'A meter with no strong beats', 'Any meter except triple'], 'Count the syllables in one foot.', 'Each dactyl has one strong and two weak syllables, matching a triple grouping like 3/4 (or the beat groups of 6/8).'),
  mc(T1[4], 4, 3, 'A lyric starts with an iamb ("a-WAKE"). How would a composer usually set it?', ['Put "a" on a pickup before the bar line', 'Put "a" on the downbeat', 'Hold "a" on the downbeat for a whole measure', 'Leave the first syllable out'], 'The stressed syllable wants the strong beat.', 'Placing the unstressed first syllable on a pickup (anacrusis) lets the stressed syllable land on the downbeat.'),

  mc(T1[5], 1, 1, 'What is prosody in songwriting?', ['The fit between the words and the music', 'The number of verses and choruses in a song', 'The loudness of the singer', 'The key a song is written in'], 'It is about words and notes agreeing.', 'Prosody is how well the music matches the natural stresses, sounds and meaning of the words.'),
  mc(T1[5], 2, 2, 'Which word would be the weakest choice to hold a long, high note?', ['"the"', '"home"', '"free"', '"day"'], 'Long notes want important words with open vowels.', 'Small function words like "the" carry little meaning and should not be stretched; open-vowel content words like "home" can be held.'),
  mc(T1[5], 3, 2, 'In "The Star-Spangled Banner," why is "O" sung as a pickup?', ['So that the stressed word "SAY" lands on the downbeat', 'Because "O" is the most important word in the anthem', 'To make the song faster', 'Because the song has no meter'], 'Which word gets the strong beat?', 'The pickup puts "O" before the bar line so that "SAY," the stressed syllable, falls on beat one.'),
  mc(T1[5], 4, 3, 'A singer keeps hearing "A-bout" instead of "a-BOUT" in a new song. What is the best fix?', ['Shift the word so "bout" lands on the strong beat', 'Sing the whole line louder', 'Change the song\'s key', 'Add a rhyme for "about" at the end of the next line'], 'Check which syllable is on the downbeat.', 'The stressed syllable "BOUT" is on a weak beat; shifting the word so "bout" lands on a strong beat restores natural speech stress.'),
  // ── Track 2: Melody as Sentence ──
  mc(T2[0], 1, 1, 'What is a musical phrase most like in language?', ['A sentence or clause', 'A single letter of the alphabet', 'A whole book', 'A page number'], 'It is a complete thought, about one breath long.', 'A phrase is a complete musical thought, much like a sentence or clause, often matching one line of lyric.'),
  mc(T2[0], 2, 2, 'In English, a yes-or-no question usually ends with the voice doing what?', ['Rising', 'Falling', 'Staying perfectly flat', 'Whispering'], 'Say "Are you coming?" aloud.', 'English yes-or-no questions usually end with a rise in pitch, and melodies that end high or unsettled can sound like questions.'),
  mc(T2[0], 3, 2, 'What do phrase marks (long curved lines over notes) do in written music?', ['Group notes into one musical thought', 'Tell the player to stop', 'Mark the key signature', 'Show the time signature'], 'They work like punctuation and line breaks.', 'Phrase marks group notes into a single musical thought, guiding how the performer shapes and breathes.'),
  tf(T2[0], 4, 2, 'A performer who breathes in the middle of a phrase is like a reader who pauses in the middle of a word.', 0, 'Think about where natural pauses belong.', 'True. Breaking a phrase interrupts a complete musical thought, just as pausing mid-word breaks a spoken one.'),

  mc(T2[1], 1, 1, 'Which cadence works like a period at the end of a sentence?', ['Authentic cadence (V to I)', 'Half cadence (ending on V)', 'Deceptive cadence (V to vi)', 'A phrase with no cadence'], 'Which one returns home?', 'The authentic cadence moves from the dominant to the tonic and sounds complete, like a period.'),
  mc(T2[1], 2, 1, 'Which cadence works like a comma?', ['Half cadence', 'Perfect authentic cadence', 'Plagal cadence', 'Final cadence'], 'It stops on the most unstable chord.', 'A half cadence ends on the V chord, so the music pauses but clearly has more to say.'),
  mc(T2[1], 3, 2, 'In C major, which chord progression is a deceptive cadence?', ['G major to A minor', 'G major to C major', 'F major to C major', 'C major to G major'], 'It sets up home, then swerves.', 'A deceptive cadence goes V to vi; in C major that is G major to A minor instead of to C.'),
  mc(T2[1], 4, 3, 'The "A-men" at the end of many hymns is usually which cadence?', ['Plagal (IV to I)', 'Half (ending on V)', 'Deceptive (V to vi)', 'Authentic (V to I)'], 'Its first chord is built on the fourth note of the scale.', 'The plagal cadence moves from IV to I, the gentle "Amen" sound used to close many hymns.'),

  mc(T2[2], 1, 1, 'In "Ode to Joy" (in C major), the first phrase ends on D. What kind of ending is that?', ['A half cadence that sounds like a question', 'An authentic cadence that sounds complete and final', 'A deceptive cadence', 'The end of the piece'], 'D is the second note of the scale, over V.', 'Ending on the second scale degree over the V chord makes a half cadence: the phrase pauses unresolved, like a question.'),
  mc(T2[2], 2, 2, 'What is the answering second phrase of a period called?', ['The consequent', 'The antecedent', 'The bridge', 'The coda'], 'It comes as a consequence of the first.', 'The antecedent asks; the consequent answers, usually ending with an authentic cadence.'),
  mc(T2[2], 3, 2, 'Both phrases of "Ode to Joy" begin with the same notes. What kind of period is that?', ['A parallel period', 'A contrasting period', 'A through-composed period', 'A deceptive period'], 'The beginnings run side by side.', 'When the consequent begins like the antecedent, the pair is a parallel period.'),
  mc(T2[2], 4, 3, 'You want the first four bars of your C-major melody to sound like a question. Which final note works best?', ['G', 'C', 'A rest with no note', 'Middle C held for two bars'], 'Avoid the home note.', 'Ending on G (or D or B) over the dominant leaves the phrase unresolved; ending on C would sound like a full stop.'),

  mc(T2[3], 1, 1, 'In call and response, what happens?', ['A leader sings a line and others answer it', 'Everyone sings the same line at the same time', 'Instruments play with no singing', 'A singer repeats one note'], 'Think of a conversation.', 'Call and response is a musical dialogue: a call from a leader, a response from the group.'),
  mc(T2[3], 2, 2, 'What practical job did call and response do in work songs?', ['It kept a crew working together in time', 'It replaced the need for tools', 'It was used only in concert halls', 'It slowed the work so that crews would not tire out'], 'Picture a crew swinging hammers together.', 'The leader\'s call and the crew\'s response landed on the strokes, coordinating the work and lifting spirits.'),
  mc(T2[3], 3, 2, 'In "Swing Low, Sweet Chariot," which line is the response?', ['"Coming for to carry me home"', '"Swing low, sweet chariot"', 'The title only', 'There is no response'], 'The group answers the leader.', '"Swing low, sweet chariot" is the call and "Coming for to carry me home" is the response sung back.'),
  mc(T2[3], 4, 3, 'In a call-and-response song with improvised calls and a fixed response, where does the song\'s theme most often live?', ['In the repeated response everyone sings', 'In the first call, which introduces the whole song', 'In the instrumental introduction', 'In the title page'], 'Which part does the whole group agree to say?', 'The fixed response returns every time and is sung by everyone, so it usually carries the central idea.'),

  mc(T2[4], 1, 1, 'What rhythm makes up the opening motif of Beethoven\'s Fifth Symphony?', ['Short-short-short-long', 'Long-long-short', 'Short-long-short-long-long', 'Eight even notes'], 'Hum the famous opening.', 'The motif is three short notes and a long one (G G G E-flat), and its rhythm returns throughout the symphony.'),
  mc(T2[4], 2, 2, 'Repeating a motif at a different pitch level, keeping its shape, is called what?', ['A sequence', 'An inversion', 'A cadence', 'A refrain'], 'Beethoven goes from G G G E-flat to F F F D.', 'A sequence restates the same shape starting on a different pitch.'),
  mc(T2[4], 3, 2, 'Turning a motif upside down so rising intervals fall is called what?', ['Inversion', 'Augmentation', 'Diminution', 'Fragmentation'], 'Picture flipping it vertically.', 'Inversion mirrors the melodic direction; augmentation and diminution change note lengths instead.'),
  mc(T2[4], 4, 3, 'In "The Raven," "Nevermore" returns stanza after stanza. Why is it like a musical motif?', ['It recurs and gathers meaning each time', 'It is the only perfect rhyme in the whole poem', 'It appears only once', 'It is a type of cadence'], 'Does the word change, or does its meaning?', 'The word stays the same, but each return carries more of the narrator\'s grief, just as a motif deepens through recurrence.'),

  mc(T2[5], 1, 1, 'In an 8-bar period, where should the authentic cadence go?', ['At the end of the second phrase', 'At the end of the first phrase, after bar four', 'On the very first note', 'In the middle of bar 3'], 'The period is the final full stop.', 'The consequent phrase ends the period with an authentic cadence, the musical full stop.'),
  mc(T2[5], 2, 2, 'You have chosen the most important word in your lyric. Where should it usually go in the melody?', ['On a strong beat with a high or long note', 'On the shortest note', 'On a pickup before the bar line, with a low note', 'Wherever it falls by chance'], 'Think back to prosody.', 'Strong beats and high or long notes draw attention, so they suit the most important word.'),
  mc(T2[5], 3, 2, 'Why start the second phrase the same way as the first?', ['So the listener hears it as a reply', 'Because cadences require it', 'To make the song shorter', 'To move the melody into a brand new key'], 'Think of "Ode to Joy."', 'Repeating the opening signals an answer to the first phrase, creating a parallel period.'),
  tf(T2[5], 4, 2, 'Asking someone to sing back your first phrase is a useful test of whether a melody is memorable.', 0, 'Clear ideas are easy to repeat.', 'True. If a listener can sing it back after hearing it, the phrase is clear and memorable.'),
  // ── Track 3: Form as Story Structure ──
  mc(T3[0], 1, 1, 'A song uses the same melody for every stanza while the words change. What form is it?', ['Strophic', 'Through-composed', 'Sonata form', 'Rondo'], 'Strophe is another word for stanza.', 'Strophic form repeats the same music for every stanza.'),
  mc(T3[0], 2, 2, 'Which feature is typical of the traditional Child ballads?', ['Incremental repetition', 'A different melody for every line', 'No characters or dialogue', 'Always told in second person'], 'Ballads build tension by repeating with a twist.', 'Ballads often use third-person narration, dialogue, jumps between scenes and incremental repetition (repeating a line with one small change).'),
  mc(T3[0], 3, 2, 'How many characters does the single singer portray in Schubert\'s "Erlkönig"?', ['Four', 'One', 'Two', 'Six'], 'Narrator, father, son and one more.', 'The singer voices the narrator, the father, the son and the Erl-King, each with distinct music.'),
  mc(T3[0], 4, 3, 'Why does a through-composed setting suit "Erlkönig" better than a strophic one?', ['The music must change as the story moves toward its tragic end', 'The poem has only one stanza', 'Strophic songs cannot have piano', 'A through-composed song is easier for audiences to memorise'], 'Would the same tune work for the first and last stanza?', 'The story escalates from calm to terror to death, so new music for each moment follows the drama in a way a repeated tune cannot.'),

  mc(T3[1], 1, 1, 'In 32-bar AABA song form, what is the B section usually called?', ['The bridge', 'The coda', 'The pickup', 'The refrain'], 'It connects and contrasts.', 'The B section, also called the middle eight, is the bridge, a contrasting section before the final A.'),
  mc(T3[1], 2, 1, 'In a Petrarchan sonnet, at which line does the volta (turn) usually come?', ['Line 9', 'Line 1', 'Line 14', 'Line 4'], 'It follows the octave.', 'The octave (lines 1–8) sets up the problem, and the volta comes at line 9 where the sestet begins.'),
  mc(T3[1], 3, 2, 'In a 32-bar AABA song, on which bar does the bridge begin?', ['Bar 17', 'Bar 1', 'Bar 9', 'Bar 25'], 'Two 8-bar A sections come first.', 'A (1–8) + A (9–16) puts the bridge at bars 17–24, followed by the final A at bar 25.'),
  mc(T3[1], 4, 3, 'What do the AABA bridge and the sonnet volta have in common?', ['Each is a turn after an idea is stated and confirmed', 'Each is the very first section', 'Each repeats the opening section exactly, with no change at all', 'Each must be in a minor key'], 'Think about where each falls and what it does.', 'Both arrive just past the midpoint after the main idea has been established, offering a new angle before the resolution.'),

  mc(T3[2], 1, 1, 'What lyric pattern does a typical 12-bar blues stanza use?', ['AAB', 'ABAB', 'AABB', 'ABCB'], 'A line, again, then the answer.', 'A blues stanza states a line, repeats it, and answers it with a rhyming line: AAB.'),
  mc(T3[2], 2, 2, 'In the key of C, what are the chords of the last four bars of a standard 12-bar blues?', ['G, F, C, C', 'C, C, C, C', 'F, F, C, C', 'C, G, C, G'], 'Bars 9–12 use V, IV, I, I.', 'The standard pattern ends V–IV–I–I, which in C is G, F, C, C (often with a G in the last bar to lead back).'),
  mc(T3[2], 3, 2, 'In verse–chorus form, what usually stays the same each time it returns?', ['The chorus words and melody', 'The verse words', 'Every line of the song', 'Only the drum and bass parts underneath'], 'It is a refrain that grew up.', 'The chorus repeats its words and melody, holding the central idea, while verses change to move the story.'),
  tf(T3[2], 4, 1, 'W. C. Handy\'s "St. Louis Blues" was published in 1914.', 0, 'It came out before the first blues recordings of the 1920s.', 'True. "St. Louis Blues" was published in 1914 and helped make the blues a national music.'),

  mc(T3[3], 1, 1, 'On which tune did Mozart write twelve piano variations, K. 265?', ['"Ah! vous dirai-je, maman"', '"Ode to Joy"', '"Amazing Grace"', '"Barbara Allen"'], 'English speakers know it as a star song.', 'K. 265 is a set of twelve variations on "Ah! vous dirai-je, maman," the tune of "Twinkle, Twinkle, Little Star."'),
  mc(T3[3], 2, 2, 'In a theme and variations, what must stay recognisable?', ['The underlying theme', 'The exact rhythm of every note', 'The tempo', 'The original key'], 'The listener hunts for the familiar thing.', 'Rhythm, tempo, mode and decoration can change, but the theme itself remains recognisable underneath.'),
  mc(T3[3], 3, 2, 'Which Cinderella version introduced the fairy godmother and glass slipper?', ['Charles Perrault\'s (1697)', 'The Brothers Grimm\'s (1812)', 'The 9th-century Chinese story of Ye Xian', 'A Child ballad'], 'The Grimm version has a magic tree instead.', 'Perrault\'s French version of 1697 gave us the fairy godmother and the glass slipper.'),
  mc(T3[3], 4, 3, 'What makes a variation or a retelling strong rather than merely decorative?', ['It reveals something new in the original', 'It adds as many notes as possible', 'It changes the theme so much that nobody can recognise it', 'It copies the original exactly'], 'Ask what stays and what changes, and why.', 'The best variations and retellings interpret the original, showing a new side of it rather than just ornamenting it.'),

  mc(T3[4], 1, 1, 'What are the three main sections of sonata form, in order?', ['Exposition, development, recapitulation', 'Verse, chorus, bridge', 'Development, exposition, coda', 'Introduction, refrain, finale'], 'Introduce, complicate, resolve.', 'Sonata form presents themes (exposition), works them over (development) and brings them back (recapitulation).'),
  mc(T3[4], 2, 2, 'In a major-key sonata-form exposition, the second theme usually appears in which key?', ['The dominant', 'The tonic', 'A random distant key', 'The parallel minor only'], 'Built on the fifth scale degree.', 'In major-key movements the second theme usually arrives in the dominant; in minor keys it is usually the relative major.'),
  mc(T3[4], 3, 2, 'Which section of sonata form is most like the rising complications of a plot?', ['The development', 'The exposition', 'The coda', 'The repeat sign'], 'Themes get fragmented and moved through distant keys.', 'The development breaks themes apart and moves restlessly through keys, building tension like a plot\'s complications.'),
  mc(T3[4], 4, 3, 'Why does the second theme returning in the home key feel like a resolution?', ['Material from a different key has been brought home', 'It is played louder and faster than the first time', 'It uses new melodies', 'The piece changes meter'], 'Compare where the theme was in the exposition.', 'In the exposition the second theme sat away from home; restating it in the tonic resolves that tension, like a conflict settled.'),

  mc(T3[5], 1, 1, 'What is a leitmotif?', ['A musical idea tied to a character, object or idea', 'The last chord of a piece', 'A type of time signature', 'A song with no words'], 'German for "leading motif."', 'A leitmotif is a recurring musical idea associated with a character, place, object or idea.'),
  mc(T3[5], 2, 2, 'In Peter and the Wolf, which instruments play the wolf?', ['Three French horns', 'A flute', 'A bassoon', 'The string section'], 'The flute is the bird; strings are Peter.', 'Prokofiev gives the wolf three French horns; the bird is the flute, the grandfather the bassoon, and Peter the strings.'),
  mc(T3[5], 3, 2, 'What did Berlioz call the recurring melody for the beloved in his Symphonie fantastique (1830)?', ['The idée fixe', 'The leitmotif', 'The ritornello', 'The cantus firmus'], 'French for "fixed idea."', 'Berlioz called it the idée fixe; it returns, transformed, in every movement.'),
  mc(T3[5], 4, 3, 'A hero\'s theme returns in minor, played softly by one instrument. What is the composer most likely showing?', ['The character has changed or is suffering', 'The orchestra is tired', 'A new character has just appeared on stage', 'The piece is about to start'], 'The motif\'s identity is the same; its colour has changed.', 'Transforming a leitmotif reflects change in the character it represents, the musical version of character development.'),
  // ── Track 4: The Songwriter's Craft ──
  mc(T4[0], 1, 1, 'A song that tells someone else\'s story using "she" and "they" is in which point of view?', ['Third person', 'First person', 'Second person', 'No point of view'], 'The singer is a narrator, not a character.', 'Third-person narration describes others; first person uses "I," second person addresses "you."'),
  mc(T4[0], 2, 2, 'In a story song, what usually moves time forward?', ['The verses', 'The chorus', 'The title', 'The instrumental tag'], 'The chorus stays the same.', 'Verses change their words to advance the story, while the chorus repeats.'),
  mc(T4[0], 3, 2, 'Which narrative techniques do writing standards for grades 5–8 ask writers to use?', ['Dialogue, description and pacing', 'Bar numbers and time signatures', 'Only rhyming couplets', 'A thesis statement in every line'], 'Think about story-writing tools.', 'Narrative writing standards emphasise establishing a narrator and situation, dialogue, description, pacing, transitions and a fitting conclusion.'),
  mc(T4[0], 4, 3, 'A songwriter has a story about a missed bus. Which advice from the lesson best guides the choice of narrator?', ['Choose the narrator with the most at stake', 'Always use first person, because it feels most honest', 'Always use third person', 'Avoid having a narrator'], 'The same facts make different songs.', 'The narrator determines what the song can show; the one with the most at stake usually gives the strongest story.'),

  mc(T4[1], 1, 1, '"O my Luve is like a red, red rose" is an example of which figure of speech?', ['Simile', 'Metaphor', 'Personification', 'Hyperbole'], 'Look for "like" or "as."', 'Burns compares love to a rose using "like," which makes it a simile.'),
  mc(T4[1], 2, 2, 'Dickinson calls hope "the thing with feathers." What figure of speech is that?', ['Metaphor', 'Simile', 'Onomatopoeia', 'Alliteration'], 'There is no "like" or "as."', 'Dickinson states directly that hope is a feathered thing, a metaphor.'),
  mc(T4[1], 3, 2, 'Which line is the strongest concrete image of sadness?', ['"Your cup sat in the sink all week"', '"I felt so very sad and blue"', '"My heart was full of pain"', '"Sorrow was everywhere I went"'], 'Which one could you photograph?', 'The cup in the sink is a specific, visible detail that lets the listener feel the sadness instead of being told about it.'),
  mc(T4[1], 4, 3, 'Your first verse says love is a garden. What does extending the metaphor (a conceit) mean for verse two?', ['Keep developing the garden image', 'Switch to a new metaphor, such as love as an ocean', 'Drop all figurative language', 'Repeat verse one word for word'], 'Stay inside the image.', 'A conceit carries one metaphor through the work (something grows, wilts or is weeded), rather than mixing in unrelated images.'),

  mc(T4[2], 1, 1, 'In songwriting, what is the hook?', ['The most memorable line, often the title', 'The first chord progression of the song', 'A long instrumental solo', 'The last verse only'], 'It is what people hum later.', 'The hook is the catchiest part of a song, usually a short title phrase in the chorus.'),
  mc(T4[2], 2, 2, 'If the hook is like an essay\'s thesis, what are the verses like?', ['The supporting evidence', 'The bibliography', 'The title page', 'Unrelated asides'], 'What supports a claim?', 'Verses should provide the scenes, reasons or angles that make the hook truer each time it returns.'),
  mc(T4[2], 3, 2, 'Where is the title phrase usually placed in a chorus for the biggest impact?', ['At the start or end of the chorus', 'Buried in the middle of verse two', 'Only in the song\'s introduction', 'Nowhere in the lyric'], 'Positions of emphasis.', 'Placing the title at the beginning or end of the chorus gives it the strongest emphasis.'),
  mc(T4[2], 4, 3, 'A verse is beautiful but has nothing to do with the hook. What does the lesson recommend?', ['Cut it or rewrite it to support the hook', 'Keep it, because a beautiful verse is always enough', 'Move it into the chorus', 'Sing it twice to make it fit'], 'Think of an off-topic paragraph.', 'Like an off-topic essay paragraph, an unrelated verse weakens the whole; rewrite it to support the hook or cut it.'),

  mc(T4[3], 1, 1, 'Which pair is a perfect rhyme?', ['sound / found', 'soul / all', 'home / alone', 'heart / hard'], 'The stressed vowel and everything after must match.', '"Sound" and "found" match the vowel and ending exactly; the others are slant rhymes.'),
  mc(T4[3], 2, 2, '"Once upon a midnight dreary, while I pondered, weak and weary" rhymes "dreary" and "weary" inside one line. What is that called?', ['Internal rhyme', 'Slant rhyme', 'Eye rhyme', 'Free verse'], 'The rhyme is not only at the line ending.', 'Rhyme within a single line is internal rhyme, which Poe uses throughout "The Raven."'),
  mc(T4[3], 3, 2, 'In the rhyme scheme ABCB, which lines rhyme?', ['Lines 2 and 4', 'Lines 1 and 3', 'All four lines', 'Lines 1 and 2'], 'Match the repeated letters.', 'In ABCB only the B lines, the second and fourth, rhyme; this is the common ballad pattern.'),
  mc(T4[3], 4, 3, 'A draft says "To the store went I" to rhyme with "sky." What is the best revision strategy?', ['Rewrite it as natural speech, even if the rhyme changes', 'Keep it, because in songs the rhyme matters more than grammar', 'Add more inverted lines to match', 'Remove every rhyme from the song'], 'Listeners hear forced grammar instantly.', 'Bending syntax to reach a rhyme sounds unnatural; rewrite the line or use a slant rhyme instead.'),

  mc(T4[4], 1, 1, 'What do Emily Dickinson\'s manuscripts often include?', ['Alternative words she was still weighing', 'Musical notation for every poem', 'Neatly typed final copies with no changes', 'Drawings of each scene'], 'Small crosses led to words at the bottom of the page.', 'Her manuscripts show variant words marked with crosses, evidence of an ongoing revision process.'),
  mc(T4[4], 2, 2, 'In the four-round revision method, what is round three about?', ['Sound: prosody and rhyme', 'The big picture', 'Cutting lines', 'Choosing the title'], 'This round is done by singing every line.', 'Round three checks sound: stresses on strong beats, open vowels on long notes, and rhyme.'),
  mc(T4[4], 3, 2, 'Which is the best example of "praise, question, suggest" feedback?', ['"The cup image works. Who is \'you\'? Try the chorus earlier."', '"It\'s good, I liked it a lot."', '"I didn\'t like it at all."', '"Just make it better somehow."'], 'It names something specific in all three parts.', 'Useful feedback names a specific strength, asks a real question and offers one concrete idea.'),
  tf(T4[4], 4, 2, 'Keeping old drafts is a waste because the newest version is always the best.', 1, 'Writers sometimes rescue lines from abandoned drafts.', 'False. Revisions can make things worse, and saved drafts let you recover lines and see your own growth.'),

  mc(T4[5], 1, 1, 'What kind of writing is a strong programme note?', ['An argument with a claim and evidence', 'A list of adjectives', 'A full transcription of the score, bar by bar', 'A biography of the performers only'], 'It makes a case the listener can check.', 'A good programme note makes a claim about the piece and supports it with evidence from the music.'),
  mc(T4[5], 2, 2, 'Which is the best evidence to support a claim in a programme note?', ['"At 2:41 the melody drops an octave"', '"The song is really emotional"', '"Everyone will love this piece"', '"It took a long time to write"'], 'Can the listener hear and check it?', 'Specific timestamps, bar numbers or lyric lines are evidence a listener can verify.'),
  mc(T4[5], 3, 2, 'About how long should a programme note for a short piece be?', ['150 to 300 words', 'One word', '5,000 words', 'Exactly one page of the score'], 'It is read in a few minutes before listening.', 'A short note of roughly 150–300 words gives context and two or three things to listen for.'),
  mc(T4[5], 4, 3, 'You cannot find evidence in your own piece for the claim in your programme note. What does that suggest?', ['The piece or the claim needs revising', 'The audience will not notice', 'Programme notes never need evidence', 'You should add more adjectives'], 'Writing the note tests the music.', 'If the music does not support the claim, either the piece needs another revision or the claim must change.'),

  // ── Track 5: Reading Scores Like Texts & Music Math ──
  mc(T5[0], 1, 1, 'What did early neumes show singers?', ['The rough up-and-down shape of a melody', 'The exact pitches and rhythms of every note', 'Chord symbols', 'The tempo in beats per minute'], 'They were memory aids.', 'Neumes marked whether the melody rose or fell, reminding singers of tunes they already knew.'),
  mc(T5[0], 2, 1, 'Which monk described a staff of lines around 1025, letting singers read unfamiliar melodies?', ['Guido of Arezzo', 'Franco of Cologne', 'Ottaviano Petrucci', 'Johann Joseph Fux'], 'He also taught ut, re, mi.', 'Guido of Arezzo described a staff with pitch-fixing letters and taught solmization syllables.'),
  mc(T5[0], 3, 2, 'Where do the syllables ut, re, mi, fa, sol, la come from?', ['Phrase openings of the hymn "Ut queant laxis"', 'The names of six composers', 'Greek letters for numbers', 'Abbreviations of the Latin names for note lengths'], 'Each phrase begins a step higher.', 'Guido used the hymn "Ut queant laxis," whose phrases start on rising notes with those syllables; "ut" later became "do."'),
  mc(T5[0], 4, 3, 'What did Petrucci\'s Odhecaton (1501) achieve?', ['First polyphonic music printed from movable type', 'It invented the staff', 'It introduced equal temperament', 'It was the first opera'], 'Think printing press.', 'Petrucci printed polyphonic music from movable type in 1501, letting music spread like printed books.'),

  mc(T5[1], 1, 1, 'What does a crescendo marking tell a performer?', ['Gradually get louder', 'Gradually get softer', 'Stop suddenly', 'Play faster'], 'It is a widening hairpin.', 'A crescendo is a gradual increase in loudness, a common signal of rising tension.'),
  mc(T5[1], 2, 2, 'In "In the Hall of the Mountain King," how does Grieg build tension?', ['One short theme repeats, growing louder and faster', 'Each section brings in a completely new melody for a new troll', 'The music gets steadily softer and slower', 'It stays at one dynamic throughout'], 'Peer is trapped among the trolls.', 'One theme repeats with a long crescendo and accelerando, getting higher and thicker too: a written-out rising action.'),
  mc(T5[1], 3, 2, 'Which score signal usually suggests rising tension?', ['More instruments and shorter note values', 'A long rest for everyone', 'A diminuendo to pp', 'A return to the home key'], 'Density and activity.', 'Increasing density and rhythmic activity raise energy; diminuendo and a return home usually release it.'),
  mc(T5[1], 4, 3, 'Two recordings of the same score build to the climax differently. What does this show?', ['Performers interpret a score as actors interpret a script', 'One recording must be wrong', 'The score has no plot', 'Scores fix every detail, so one recording must be wrong'], 'Notation leaves things to the performer.', 'A score is a text that performers interpret, so different performances can tell its story differently.'),

  mc(T5[2], 1, 1, 'What is word painting?', ['Music that depicts the meaning of the words', 'Writing lyrics in colour', 'A painting or drawing inspired by a song', 'Singing without words'], 'Think "descending" sung on a falling line.', 'Word painting makes the music act out the text, such as a rising line on "ascending."'),
  mc(T5[2], 2, 2, 'In Weelkes\'s "As Vesta was from Latmos hill descending," what happens on "all alone"?', ['A single voice sings by itself', 'The whole choir shouts', 'The music modulates to a new key', 'Everyone rests'], 'The music does what the words say.', 'On "all alone," Weelkes gives the line to one voice, literally illustrating the words.'),
  mc(T5[2], 3, 2, 'In Messiah\'s "Every valley shall be exalted," how is "crooked" set?', ['With a zigzagging melody', 'On one long steady note', 'With silence', 'On a single repeated chord'], 'The next word, "straight," gets a steady note.', 'Handel zigzags on "crooked" and then holds a single steady note on "straight."'),
  mc(T5[2], 4, 3, 'Why can heavy word painting feel like a gimmick?', ['Illustrating every word can distract from the whole', 'It is impossible to sing', 'It only works in instrumental music', 'It always puts stressed syllables on weak beats'], 'Later composers often painted the mood of a whole poem instead.', 'Overusing literal illustration can decorate words without deepening the text, which is why judgement matters.'),

  mc(T5[3], 1, 1, 'How many quarter notes equal one whole note?', ['4', '2', '8', '3'], 'Each quarter is 1/4.', '1/4 + 1/4 + 1/4 + 1/4 = 1, so four quarter notes equal a whole note.'),
  mc(T5[3], 2, 2, 'What fraction of a whole note is a dotted half note?', ['3/4', '1/2', '2/3', '1'], 'A dot adds half the note\'s own value.', 'A dotted half is 1/2 + 1/4 = 3/4, which is why it fills a measure of 3/4.'),
  mc(T5[3], 3, 2, 'Does 1/4 + 1/8 + 1/8 + 1/2 fill one measure of 4/4?', ['Yes, it adds to 8/8 = 1', 'No, it adds to 3/4', 'No, it adds to 5/4', 'Yes, but only in 3/4'], 'Rewrite everything in eighths.', '2/8 + 1/8 + 1/8 + 4/8 = 8/8 = 1 whole note, exactly one measure of 4/4.'),
  mc(T5[3], 4, 3, 'A 3/4 measure and a 6/8 measure last the same total time. Why do they feel different?', ['Three beats versus two beats of three', 'They are different lengths', '6/8 has no strong beat', '3/4 cannot use eighth notes'], 'Count ONE-two-three vs ONE-and-a TWO-and-a.', 'Both equal 3/4 of a whole note, but 3/4 groups into three beats and 6/8 into two, so the same total length feels different.'),

  mc(T5[4], 1, 1, 'What ratio of frequencies gives an octave?', ['2:1', '3:2', '4:3', '5:4'], 'Halve the string.', 'Doubling the frequency (halving a string\'s length) sounds an octave higher: 2:1.'),
  mc(T5[4], 2, 2, 'If A is 440 Hz, what is the frequency of a pure perfect fifth above it?', ['660 Hz', '880 Hz', '586.67 Hz', '550 Hz'], 'Multiply by 3/2.', '440 × 3/2 = 660 Hz; 880 Hz is the octave and about 586.67 Hz the pure fourth.'),
  mc(T5[4], 3, 2, 'Pressing a guitar string at its 12th fret halves its vibrating length. What happens to the pitch?', ['It rises an octave', 'It falls an octave', 'It rises a fifth', 'It stays the same'], 'Frequency is inversely proportional to length.', 'Half the length means double the frequency, which is one octave higher.'),
  mc(T5[4], 4, 3, 'Why do a perfect fifth and a perfect fourth stacked together make an octave?', ['Because 3/2 × 4/3 = 2', 'Because 3/2 + 4/3 = 2', 'Because 5 + 4 = 9', 'Because both intervals are equal'], 'Intervals combine by multiplying ratios.', 'Stacking intervals multiplies their ratios: 3/2 × 4/3 = 12/6 = 2, the octave.'),

  mc(T5[5], 1, 1, 'In equal temperament, what number multiplies the frequency for each semitone?', ['2^(1/12), about 1.0595', '1/12', '3/2', '2'], 'Twelve equal steps must multiply to 2.', 'Each semitone multiplies the frequency by the twelfth root of two, so twelve of them multiply to exactly 2.'),
  mc(T5[5], 2, 2, 'Using f(n) = 440 × 2^(n/12), what is f(12)?', ['880 Hz', '452 Hz', '660 Hz', '5280 Hz'], '2^(12/12) is a whole number.', '2^(12/12) = 2, so f(12) = 440 × 2 = 880 Hz, one octave above A440.'),
  mc(T5[5], 3, 3, 'Why is pitch in equal temperament an exponential function rather than a linear one?', ['Equal steps multiply frequency by the same ratio', 'Equal steps in pitch add the same number of hertz each time', 'Frequencies never change', 'Each octave has a different number of notes'], 'Compare 110, 220, 440, 880.', 'Each octave doubles the frequency, so equal steps are equal ratios: the hallmark of exponential growth.'),
  mc(T5[5], 4, 3, 'What is the Pythagorean comma?', ['The gap between twelve pure fifths and seven octaves', 'A comma used in programme notes', 'The difference between a major scale and a minor scale', 'A rest that lasts one beat'], 'Compare (3/2)^12 with 2^7.', '(3/2)^12 ≈ 129.75 but 2^7 = 128; the leftover ratio of about 1.0136 is the Pythagorean comma.'),
];

export const COURSE_MODULE: CourseModule = {
  curriculum: MUSIC_LANGUAGE_CURRICULUM,
  bank: { curriculumId: C, questions: QUESTIONS },
};
