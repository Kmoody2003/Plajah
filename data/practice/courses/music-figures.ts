import type { CourseModule } from '../courseModule';
import type { Question } from '../types';

const mcq = (lessonId: string, n: number, level: 1 | 2 | 3, prompt: string, choices: string[], answer: number, hint: string, explanation: string): Question => ({
  id: `${lessonId}.q${n}`, lessonId, kind: 'mcq', prompt, choices, answer, hint, explanation, level,
});
const tf = (lessonId: string, n: number, level: 1 | 2 | 3, prompt: string, answer: 0 | 1, hint: string, explanation: string): Question => ({
  id: `${lessonId}.q${n}`, lessonId, kind: 'tf', prompt, answer, hint, explanation, level,
});

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'music-figures',
    label: 'Music Figures',
    blurb: 'Composers, performers and innovators across the history of music, from Monteverdi to Kendrick Lamar.',
    accent: '#FFD24A',
    framework: 'c3',
    tracks: [
      {
        id: 'music-figures.t1',
        title: 'Baroque and Classical Foundations',
        blurb: 'From the first lasting operas to the symphony and the heroic composer, c. 1567 to 1827.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: 'music-figures.l01',
            title: 'Monteverdi: The Bridge to Opera',
            blurb: 'The composer who carried Renaissance polyphony into the age of opera.',
            minutes: 6,
            body: `Claudio Monteverdi (1567-1643) was an Italian composer working at the start of the Baroque era, a period that runs from about 1600 to 1750 and is marked by counterpoint, the basso continuo and the birth of tonal harmony. He is often described as the bridge from Renaissance polyphony to opera itself.

His most important achievement was composing the first enduring opera, L'Orfeo. Opera existed before him, but his work showed how music could carry drama on a grand scale. His other major works include the Vespers of 1610 and L'incoronazione di Poppea.

Monteverdi also pioneered what he called the seconda pratica, a second practice in which dissonance was freed to serve the meaning of the words. Earlier rules had treated dissonance strictly; Monteverdi argued that a composer could break them if the text called for strong emotion. He also developed the stile concitato, an agitated style that used rapid repeated notes to depict anger and conflict.

Why it matters: the idea that music should follow the drama and emotion of words became one of the central ideas of Western music. Later Baroque composers, including Handel, built on the operatic world he helped establish.`,
          },
          {
            id: 'music-figures.l02',
            title: 'Bach: The Summit of Counterpoint',
            blurb: 'The composer other composers study, and the rules of harmony he helped fix.',
            minutes: 7,
            body: `Johann Sebastian Bach (1685-1750) was a German composer of the Baroque era, often described as the summit of counterpoint. Counterpoint is the art of weaving several independent melodies together so that they make sense both separately and as a whole.

Bach perfected the fugue, in which a short theme is introduced and then imitated by other voices, and invertible counterpoint, in which melodic lines can swap positions and still work. He also codified functional harmony, the system of chords and keys that underpins Western music, so that his works became textbooks for later generations.

His landmark works include The Well-Tempered Clavier, the Mass in B minor, the St Matthew Passion and the Goldberg Variations. The Well-Tempered Clavier contains preludes and fugues in every key, and the museum notes that his forty-eight preludes and fugues championed an equal-ish temperament, a tuning approach that lets a keyboard play in any key.

Bach's music was not always fashionable in his own century, but composers from Mozart to Brahms studied it closely. When musicians say that a piece has strong inner voices, or that a harmony makes logical sense, they are using ideas that Bach made concrete.`,
          },
          {
            id: 'music-figures.l03',
            title: 'Vivaldi and Handel: Concerto and Oratorio',
            blurb: 'Two Baroque masters who shaped the concerto and the public choral work.',
            minutes: 7,
            body: `Antonio Vivaldi (1678-1741) and George Frideric Handel (1685-1759) show two different sides of the Baroque.

Vivaldi was an Italian composer and violinist, known as the red-haired priest who taught the concerto to sing. He standardised the three-movement solo concerto form, a structure of fast, slow, fast that remains familiar today. He also pioneered programmatic, pictorial writing, in which music paints scenes; the most famous example is The Four Seasons. His other works include L'estro armonico and Gloria in D. He directly influenced Bach's concerto style.

Handel was German-British and became the grand public voice of the Baroque. He elevated the English oratorio, a large-scale work for chorus, soloists and orchestra, to a national form. His best-known pieces include Messiah, Water Music, Music for the Royal Fireworks and Zadok the Priest. He mastered choral grandeur and the da capo aria, and he fused Italian, German and English idioms into one style.

Comparing them is useful: Vivaldi's innovation lay in instrumental form and vivid imagery, while Handel's lay in public, choral drama. Both pieces of work helped make music a shared experience for large audiences.`,
          },
          {
            id: 'music-figures.l04',
            title: 'Haydn and Mozart: The Classical Balance',
            blurb: 'Clarity, wit and dramatic truth in the age of the symphony.',
            minutes: 7,
            body: `The Classical period, roughly 1730 to 1820, valued clarity, balance and form. Two Austrian composers define it.

Joseph Haydn (1732-1809) is called the father of the symphony and the string quartet. He established the four-movement templates for both, mastered thematic development, the art of growing a whole movement from a small idea, and wrote music full of wit. His works include The Creation, the Symphony No. 94, nicknamed the Surprise, The Seven Last Words and the Emperor Quartet. He mentored Beethoven and taught the generation that included Mozart.

Wolfgang Amadeus Mozart (1756-1791) combined effortless melody with dramatic truth in perfect proportion. He perfected Classical operatic characterisation in works such as The Marriage of Figaro and Don Giovanni, where each character has a distinct musical voice. He balanced formal clarity with chromatic depth, as in the Symphony No. 41, nicknamed the Jupiter, and the Requiem. He also elevated the piano concerto to a symphonic scale.

Between them, Haydn supplied the structural frameworks and Mozart showed how much feeling they could hold. Their techniques became the standard against which later composers, from Beethoven onward, measured themselves.`,
          },
          {
            id: 'music-figures.l05',
            title: 'Beethoven: The Hinge of Music History',
            blurb: 'A composer who made the artist a hero and the symphony a vast drama.',
            minutes: 7,
            body: `Ludwig van Beethoven (1770-1827) is described as the hinge of music history. He stands between the Classical order of Haydn and Mozart and the emotional freedom of the Romantic era, and he made the composer a hero.

He expanded symphonic form and duration dramatically, so that a symphony could become an epic statement rather than an elegant entertainment. In the Symphony No. 9 he introduced the chorus into the symphony, an idea that surprised audiences and has been imitated ever since. His other landmark works include the Symphony No. 5, the Moonlight Sonata and the late string quartets.

Beethoven achieved this while going deaf. The loss of hearing deepened his inwardness; the late quartets are some of the most profound and demanding works in the repertoire, written when he could no longer hear ordinary conversation.

He studied with Haydn, whose four-movement structures he inherited and stretched. From Beethoven onward, composers felt free, and perhaps obliged, to express individual vision. Schubert, Brahms and Wagner all lived in his shadow, and the idea of music as personal struggle and triumph remains a central picture of what a composer is.`,
          },
        ],
      },
      {
        id: 'music-figures.t2',
        title: 'Romantic Voices and Modern Revolutions',
        blurb: 'From songs and nocturnes to impressionism, rhythm and the end of the key.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: 'music-figures.l06',
            title: 'Schubert and Chopin: Song and Piano Poetry',
            blurb: 'Two young Romantics who found the voice of the song and the piano.',
            minutes: 7,
            body: `Franz Schubert (1797-1828) and Frederic Chopin (1810-1849) both died young but changed the scope of what intimate music could be.

Schubert was Austrian and is called the supreme songwriter. He perfected the German Lied, or art song, in which a poem is set to music with a piano partner that paints the scene. He wrote over 600 songs in a life of only 31 years. His works include Winterreise, Ave Maria, the Symphony No. 8, known as the Unfinished, and the Trout Quintet. His harmonic colour pointed toward Romanticism.

Chopin was Polish-French, and the museum calls him the poet of the piano. He redefined idiomatic piano writing and pedalling. He used rubato, an expressive freedom of tempo over a steady pulse. He also elevated national dances such as the mazurka and the polonaise into art. His works include the Nocturnes, Ballade No. 1 in G minor, the Etudes Op. 10 and the Heroic Polonaise.

Both composers show Romanticism's turn toward the personal. Schubert made poetry sing, while Chopin made the piano speak. Their music remains central to recitals because it asks performers for individual expression instead of just precision.`,
          },
          {
            id: 'music-figures.l07',
            title: 'Wagner and Brahms: Two Roads for the Romantic',
            blurb: 'Total art and the leitmotif versus classical rigour in warm colours.',
            minutes: 7,
            body: `In the nineteenth century, two German composers took very different routes.

Richard Wagner (1813-1883) dissolved the edges of tonality and rebuilt opera as total art. He introduced the leitmotif, recurring themes that track character and idea so that the orchestra tells the audience what a figure is thinking or remembering. His chromatic harmony opened the door to modernism. He also pursued the Gesamtkunstwerk, a unified work in which music, drama and staging combine. His works include Der Ring des Nibelungen, Tristan und Isolde, Die Meistersinger and Parsifal.

Johannes Brahms (1833-1897) poured classical rigour into Romantic warmth. He used developing variation, growing whole movements from tiny cells. He kept the Classical forms alive against the so-called music of the future, and his music shows rich cross-rhythm and metric ambiguity. His works include A German Requiem, Symphony No. 4, Hungarian Dances and the Violin Concerto in D.

Pyotr Ilyich Tchaikovsky (1840-1893) offers a third path: long-breathed melody, as in Swan Lake and The Nutcracker, that elevated ballet music to symphonic status.

The contrast matters. Wagner pushed harmony toward breakdown of the key; Brahms showed that older forms could still be fresh.`,
          },
          {
            id: 'music-figures.l08',
            title: 'Debussy and Ravel: Colour and Precision',
            blurb: 'French composers who painted with timbre and orchestrated with watch-like exactness.',
            minutes: 6,
            body: `Claude Debussy (1862-1918) and Maurice Ravel (1875-1937) are the two great French voices of the turn into the twentieth century.

Debussy is associated with Impressionism. He painted with sound and loosened tonality's grip. He used whole-tone and modal scales that blurred the sense of key, treated timbre and colour as structure, and freed rhythm and form from Germanic development. His works include Prelude a l'apres-midi d'un faune, Clair de Lune, La Mer and the Preludes for piano.

Ravel, in the museum's phrase, combined a Swiss watchmaker's precision with a sensualist's ear. His orchestration was dazzling and exact. In the 1920s his harmony took on a jazz tinge, and in Bolero he used ostinato and a gradual crescendo as the form of the whole piece. His works also include Daphnis et Chloe, Pavane pour une infante defunte and the Piano Concerto in G.

Both composers show that after Wagner, music could move away from German-style development without falling into chaos. Colour, atmosphere and exact craft became organising principles. The way film composers use shimmering orchestral colour today owes much to their example.`,
          },
          {
            id: 'music-figures.l09',
            title: 'Stravinsky and Schoenberg: Rebuilding the Language',
            blurb: 'Rhythm that caused a riot and a method that abandoned the key.',
            minutes: 7,
            body: `Two composers rebuilt the language of music in the early twentieth century, in opposite directions.

Igor Stravinsky (1882-1971) was Russian. He is called the riot-starter who rewrote rhythm for the twentieth century. His explosive, irregular rhythm and driving ostinato are heard in The Rite of Spring, and his other works include The Firebird, Petrushka and Symphony of Psalms. He used bitonality and dissonant harmonic blocks, and he reinvented himself across primitivism, neoclassicism and serialism.

Arnold Schoenberg (1874-1951) was Austrian-American. The museum says he set music free from the key. He emancipated dissonance in atonality, invented the twelve-tone method (also called serialism), in which all twelve pitches are ordered into a row, and used Sprechstimme, a speech-song style of vocal delivery. His works include Pierrot Lunaire, Verklarte Nacht and A Survivor from Warsaw.

Stravinsky changed how music moves; Schoenberg changed what notes mean. Their approaches define the major debates of twentieth-century concert music: whether to organise sound through rhythm and ostinato or through systems of pitch.

Aaron Copland (1900-1990) offers another lesson from the same era: an accessible modernism, with open Americana harmony in Appalachian Spring, that reached a broad public.`,
          },
        ],
      },
      {
        id: 'music-figures.t3',
        title: 'Jazz, Blues and Soul',
        blurb: 'The American roots tradition: the improvised solo, the Delta and the church.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: 'music-figures.l10',
            title: 'Jazz: Armstrong and Ellington',
            blurb: 'The soloist who made jazz swing and the composer who made it concert-length.',
            minutes: 7,
            body: `Jazz is described as America's classical music, a world of swing, bebop and the improvised line as composition. Two early giants set its direction.

Louis Armstrong (1901-1971) was a trumpeter and vocalist from the early jazz and swing era. He made the improvised solo the heart of jazz, popularised scat singing, and gave the music its rhythmic swing phrasing. Among his works are West End Blues, the Hot Fives and Hot Sevens recordings and What a Wonderful World. The museum sums him up as the man who taught jazz to swing and the soloist to sing.

Duke Ellington (1899-1974) was a composer and bandleader. The museum calls him the greatest composer American music has produced. He wrote for individual players' voices, not just instruments, extended jazz into suites and concert-length works such as Black, Brown and Beige, and achieved peerless orchestral colour within the big band. His famous pieces include Take the A Train and Mood Indigo.

Between them they show two complementary ideas: Armstrong placed the individual voice at the centre, while Ellington built larger structures around many individual voices. Later musicians such as Miles Davis, Coltrane and Monk worked in the space they opened.`,
          },
          {
            id: 'music-figures.l11',
            title: 'Blues and Gospel: From the Delta to the Electric Guitar',
            blurb: 'How the twelve-bar root of nearly everything after found its voice.',
            minutes: 7,
            body: `The blues and gospel tradition sits at the root of nearly everything in popular music that followed. It grew out of the Delta and the church, and it often used a twelve-bar structure.

Robert Johnson (1911-1938) is the crossroads legend at the root of the blues family tree. His intricate Delta fingerpicking and slide guitar are heard in Cross Road Blues and Hellhound on My Trail, and his songbook seeded rock and roll. He directly influenced Clapton, the Rolling Stones and Led Zeppelin.

Muddy Waters (1913-1983) plugged the Delta blues in. He electrified the country blues into Chicago blues and created a full-band template later borrowed by rock. His song Rollin' Stone gave the Rolling Stones their name.

B.B. King (1925-2015) made blues guitar a lead melodic voice with singing, sustained vibrato and a call-and-response between voice and guitar.

In gospel, Mahalia Jackson (1911-1972), the Queen of Gospel, brought the form to concert halls and sang at the March on Washington before the I Have a Dream speech. Sister Rosetta Tharpe (1915-1973), the godmother of rock and roll, played distorted, driving electric-guitar gospel and fused sacred song with secular showmanship, a direct forerunner of Chuck Berry.`,
          },
          {
            id: 'music-figures.l12',
            title: 'Soul: Ray Charles, Aretha Franklin and James Brown',
            blurb: 'Gospel fervour meets the secular groove, and the invention of funk.',
            minutes: 7,
            body: `Soul and R&B bring gospel fervour into secular music, combining rhythm, blues and the human cry.

Ray Charles (1930-2004) was the Genius who fused gospel and blues into soul itself. He merged sacred gospel fervour with secular R&B, crossed genres from soul to country, and treated voice and piano as a single expressive instrument. His works include What'd I Say, Georgia on My Mind and Hit the Road Jack.

Aretha Franklin (1942-2018) was the Queen of Soul. Her church-rooted melisma and improvisation, plus her dynamic and emotional range, turned Respect into a civil-rights and feminist anthem. Her works include Chain of Fools and Amazing Grace.

James Brown (1933-2006), the Godfather of Soul, invented funk. He shifted the emphasis to the One, the downbeat groove, and treated the whole band as rhythm. He became the most-sampled artist in hip-hop history. His works include Papa's Got a Brand New Bag and I Got You (I Feel Good).

Later soul artists extended the form: Stevie Wonder pioneered the synthesizer in soul and funk and wrote, played and produced entire albums himself, while Marvin Gaye's What's Going On made the socially conscious concept album part of soul.

The lesson to take away is how a sacred musical language, gospel, supplied the techniques of a secular revolution.`,
          },
        ],
      },
      {
        id: 'music-figures.t4',
        title: 'Rock and Hip-Hop',
        blurb: 'Studio-as-instrument and the new music built from records themselves.',
        level: 'ADVANCED',
        lessons: [
          {
            id: 'music-figures.l13',
            title: 'Rock: Berry, The Beatles, Hendrix and Dylan',
            blurb: 'From the guitar riff to the album as an art form and the song as literature.',
            minutes: 7,
            body: `Rock grew from electrified blues into a music where the studio became an instrument and the album became an art form.

Chuck Berry (1926-2017) was the architect of rock and roll guitar and its storytelling. He defined the rock guitar riff and double-stop lick, wrote teen-life lyrics that set the template for the genre, and gave the Beatles and the Stones a blueprint. Johnny B. Goode and Maybellene are among his best-known songs.

The Beatles (1960-1970) turned the pop song into a limitless art form. They made the recording studio a compositional instrument, expanded harmony and form within the pop song, and redefined the album as a unified artistic statement, as in Sgt. Pepper's Lonely Hearts Club Band, Revolver and Abbey Road.

Jimi Hendrix (1942-1970) reimagined what an electric guitar could be, using feedback, wah and distortion as an expressive palette and pushing blues vocabulary into new sonic territory.

Bob Dylan (born 1941) proved that a song could carry the weight of literature, writing poetic, allusive lyrics and bridging folk protest and electric rock. He won the Nobel Prize in Literature in 2016. Joni Mitchell (born 1943), meanwhile, invented dozens of open guitar tunings and brought jazz-influenced harmony to confessional song.`,
          },
          {
            id: 'music-figures.l14',
            title: 'Hip-Hop: The Break, the Sample and the Voice',
            blurb: 'A new music built from records themselves, from the DJ to the Pulitzer.',
            minutes: 7,
            body: `Hip-hop is described as a new music built from records themselves: the break, the sample and the voice.

Grandmaster Flash (born 1958) is the turntable pioneer who made the DJ an instrumentalist. He developed the backspin, punch-phrasing and the Quick Mix Theory, and he turned two turntables into a single instrument. The Message, with the Furious Five, is among his best-known works.

Rakim (born 1968) turned rap into internal-rhyme poetry. He introduced complex internal rhyme and enjambment, and he delivered a cool, jazz-influenced flow off the beat. Paid in Full is one of his key albums.

Public Enemy (1985-present) made hip-hop a weapon of social conscience. Their dense, layered sample collage, produced by the Bomb Squad, and their politically charged lyricism produced Fight the Power and It Takes a Nation of Millions to Hold Us Back.

J Dilla (1974-2006) taught machines to breathe, using deliberately off-grid drum programming and lush, unquantised sampling.

Kendrick Lamar (born 1987) is the first rapper to win the Pulitzer Prize for Music, which he won in 2018. His concept-driven albums, such as To Pimp a Butterfly, draw on jazz and funk and use shifting vocal personas.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'music-figures',
    questions: [
      // l01
      mcq('music-figures.l01', 1, 1, 'Which opera is described as the first enduring opera?', ['Don Giovanni', 'L\'Orfeo', 'Le nozze di Figaro', 'The Creation'], 1, 'It was written by Monteverdi.', 'Monteverdi composed L\'Orfeo, the first enduring opera.'),
      mcq('music-figures.l01', 2, 1, 'What was Monteverdi\'s "seconda pratica"?', ['A strict rule requiring dissonance to resolve by step', 'A kind of keyboard tuning', 'A type of dance suite', 'A practice freeing dissonance to serve the text'], 3, 'It concerns how words and harmony relate.', 'The seconda pratica freed dissonance so music could serve the meaning of the words.'),
      mcq('music-figures.l01', 3, 2, 'A composer wants rapid repeated notes to depict anger in a dramatic scene. Which Monteverdi device would they use?', ['Basso continuo bass', 'Twelve-tone serial row', 'Stile concitato', 'Sprechstimme vocal style'], 2, 'The name means an agitated style.', 'Monteverdi developed the stile concitato for dramatic effect.'),
      mcq('music-figures.l01', 4, 3, 'Why is Monteverdi described as a "bridge"?', ['He linked Renaissance polyphony to the opera of the Baroque', 'He linked Baroque to jazz', 'He linked Romantic to modern music', 'He linked folk songs to hip-hop'], 0, 'Think about which eras surround him.', 'He stood between Renaissance polyphony and the Baroque world of opera and dramatic music.'),
      // l02
      mcq('music-figures.l02', 1, 1, 'Which musical form did Bach perfect?', ['Fugue', 'Scat singing', 'Rap verse form', 'Sonata only'], 0, 'A theme is imitated by other voices.', 'Bach perfected fugue and invertible counterpoint.'),
      mcq('music-figures.l02', 2, 1, 'Which work is by Bach?', ['The Four Seasons', 'Messiah', 'The Well-Tempered Clavier', 'Symphony No. 9'], 2, 'Preludes and fugues in all keys.', 'The Well-Tempered Clavier is one of Bach\'s landmark works.'),
      tf('music-figures.l02', 3, 2, 'Bach\'s forty-eight preludes and fugues championed an equal-ish temperament.', 0, 'Check the museum\'s description.', 'The museum notes the 48 preludes and fugues championed an equal-ish temperament.'),
      mcq('music-figures.l02', 4, 3, 'Why do later composers study Bach\'s counterpoint and harmony?', ['It banned all improvisation', 'It created the symphony orchestra and the modern concert hall tradition', 'It replaced the concerto', 'It codified functional harmony underpinning Western music'], 3, 'Think about the foundation he provided.', 'Bach codified functional harmony, so his works serve as models for how chords and keys work.'),
      // l03
      mcq('music-figures.l03', 1, 1, 'Which work is by Vivaldi?', ['Messiah', 'Water Music', 'Zadok the Priest', 'The Four Seasons'], 3, 'It paints scenes of the year.', 'The Four Seasons is Vivaldi\'s most famous work.'),
      mcq('music-figures.l03', 2, 1, 'Which form did Handel elevate to a national form in England?', ['String quartet', 'Oratorio', 'Piano concerto', 'Art song cycle'], 1, 'Messiah belongs to it.', 'Handel elevated the English oratorio to a national form.'),
      mcq('music-figures.l03', 3, 2, 'A composer writes a solo concerto in the standard three-movement shape. Whose standard are they following?', ['Vivaldi', 'Joseph Haydn', 'Frederic Chopin', 'Schoenberg'], 0, 'He standardised the form.', 'Vivaldi standardised the three-movement solo concerto form.'),
      mcq('music-figures.l03', 4, 3, 'How do Vivaldi and Handel mainly differ in their contribution?', ['Vivaldi invented opera and the symphony; Handel invented the string quartet and piano sonata', 'Both wrote only solo piano music', 'Vivaldi shaped the instrumental concerto and picture-painting; Handel shaped public choral works', 'Handel invented programme music; Vivaldi wrote oratorios'], 2, 'One is instrumental, one is choral.', 'Vivaldi\'s legacy is the concerto and programmatic writing; Handel\'s is choral grandeur and oratorio.'),
      // l04
      mcq('music-figures.l04', 1, 1, 'Who is called the father of the symphony and the string quartet?', ['Mozart', 'Schubert', 'Haydn', 'J.S. Bach'], 2, 'He mentored Beethoven.', 'Haydn established the four-movement symphony and quartet templates.'),
      mcq('music-figures.l04', 2, 1, 'Which opera is by Mozart?', ['The Marriage of Figaro', 'Der Ring des Nibelungen', 'L\'Orfeo', 'Parsifal'], 0, 'A Classical comic opera.', 'The Marriage of Figaro is one of Mozart\'s major operas.'),
      mcq('music-figures.l04', 3, 2, 'A composer grows an entire movement from a small musical idea and adds wit. Whose strength is this?', ['Wagner', 'Stravinsky', 'Monteverdi', 'Haydn'], 3, 'Thematic development and humour.', 'Haydn was a master of thematic development and wit.'),
      mcq('music-figures.l04', 4, 3, 'What is the relationship between Haydn and Beethoven?', ['Beethoven taught Haydn', 'Haydn mentored Beethoven', 'They were rivals who never met', 'Beethoven was Haydn\'s librettist'], 1, 'One taught the other.', 'Haydn mentored Beethoven, who inherited and stretched Haydn\'s forms.'),
      // l05
      mcq('music-figures.l05', 1, 1, 'Which Beethoven symphony introduced a chorus?', ['No. 5', 'No. 9', 'No. 1', 'No. 4'], 1, 'Its finale includes voices.', 'Beethoven introduced the chorus into the symphony in Symphony No. 9.'),
      tf('music-figures.l05', 2, 1, 'Beethoven was going deaf while writing some of his greatest works.', 0, 'See the museum summary.', 'The museum notes he bridged Classical order and Romantic expression while going deaf.'),
      mcq('music-figures.l05', 3, 2, 'Which work is NOT by Beethoven?', ['Moonlight Sonata', 'Symphony No. 5', 'The Creation', 'Late String Quartets'], 2, 'The Creation is an oratorio by another composer.', 'The Creation is by Haydn.'),
      mcq('music-figures.l05', 4, 3, 'Why is Beethoven called the "hinge" of music history?', ['He connected Classical order with Romantic expression', 'He invented opera', 'He abolished harmony', 'He wrote only for piano'], 0, 'A hinge joins two parts.', 'He bridged Classical forms and Romantic expression, making the composer a hero.'),
      // l06
      mcq('music-figures.l06', 1, 1, 'What is a Lied?', ['A German art song', 'A fast dance', 'A type of fugue', 'A jazz solo'], 0, 'Schubert perfected it.', 'The Lied is the German art song that Schubert perfected.'),
      mcq('music-figures.l06', 2, 1, 'Roughly how many songs did Schubert write?', ['Roughly 60 songs', 'Roughly six songs', 'Over 600', 'Exactly 100'], 2, 'He lived only 31 years.', 'The museum notes over 600 songs in a life of 31 years.'),
      mcq('music-figures.l06', 3, 2, 'A pianist plays with flexible tempo over a steady pulse. Which composer\'s technique is this?', ['J.S. Bach', 'Chopin', 'G.F. Handel', 'Monteverdi'], 1, 'Rubato.', 'Chopin used rubato as expressive freedom over a steady pulse.'),
      mcq('music-figures.l06', 4, 3, 'What do the mazurka and polonaise show about Chopin?', ['He wrote exclusively for full orchestra and chorus', 'He rejected folk traditions in favour of abstract forms', 'He composed almost nothing except large-scale operas', 'He elevated national dances to art'], 3, 'They are national dances.', 'Chopin raised the Polish mazurka and polonaise to the level of concert art.'),
      // l07
      mcq('music-figures.l07', 1, 1, 'What is a leitmotif?', ['A type of drum', 'A twelve-tone row', 'A stage cue', 'A recurring theme tied to a character or idea'], 3, 'Wagner used them.', 'Wagner\'s leitmotifs are recurring themes tracking character and idea.'),
      mcq('music-figures.l07', 2, 1, 'Which work is by Brahms?', ['Tristan und Isolde', 'A German Requiem', 'Swan Lake', 'Boléro'], 1, 'It is a choral work.', 'A German Requiem is by Brahms; Tristan is Wagner\'s and Swan Lake is Tchaikovsky\'s.'),
      mcq('music-figures.l07', 3, 2, 'A composer unites music, drama and staging into a single work. Which concept is this?', ['Gesamtkunstwerk', 'Developing variation', 'Rubato', 'Scat'], 0, 'Literally "total artwork".', 'The Gesamtkunstwerk is Wagner\'s unified music, drama and staging.'),
      mcq('music-figures.l07', 4, 3, 'How do Brahms and Wagner differ?', ['Brahms invented the symphony orchestra and opera; Wagner wrote only string quartets and keyboard sonatas', 'Both abandoned harmony', 'Brahms kept Classical forms alive; Wagner pushed chromatic harmony toward modernism', 'Wagner avoided drama; Brahms avoided melody'], 2, 'One looked back, one looked ahead.', 'Brahms kept Classical forms alive against the music of the future; Wagner\'s chromatic harmony opened the door to modernism.'),
      // l08
      mcq('music-figures.l08', 1, 1, 'Which composer is associated with Impressionism?', ['Verdi', 'Copland', 'Debussy', 'Bach'], 2, 'He wrote Clair de Lune.', 'Debussy is the Impressionist composer of Clair de Lune and La Mer.'),
      mcq('music-figures.l08', 2, 1, 'Which piece uses ostinato and gradual crescendo as form?', ['Boléro', 'La Mer', 'Parsifal', 'Winterreise'], 0, 'By Ravel.', 'Ravel\'s Boléro uses ostinato and gradual crescendo as its form.'),
      tf('music-figures.l08', 3, 2, 'Debussy used whole-tone and modal scales that blurred the sense of key.', 0, 'See his techniques.', 'Whole-tone and modal scales were central to Debussy\'s blurred tonality.'),
      mcq('music-figures.l08', 4, 3, 'How does Ravel\'s approach differ from Debussy\'s emphasis?', ['Ravel wrote only songs for voice and piano; Debussy wrote only string quartets', 'Ravel stressed exact orchestration; Debussy stressed colour and loosened key', 'Debussy wrote only fugues', 'Both avoided orchestration'], 1, 'Precision versus atmosphere.', 'Ravel is known for dazzling, exact orchestration, while Debussy treated timbre and colour as structure and loosened tonality.'),
      // l09
      mcq('music-figures.l09', 1, 1, 'Which work by Stravinsky provoked a famous riot?', ['Pierrot Lunaire', 'The Rite of Spring', 'Boléro', 'Appalachian Spring'], 1, 'The museum calls him the riot-starter.', 'The Rite of Spring is Stravinsky\'s explosive, irregular-rhythm work.'),
      mcq('music-figures.l09', 2, 1, 'What did Schoenberg invent?', ['The leitmotif', 'The scat solo', 'The fugue', 'The twelve-tone method'], 3, 'It orders all twelve pitches.', 'Schoenberg invented the twelve-tone (serial) method.'),
      mcq('music-figures.l09', 3, 2, 'A vocalist delivers music halfway between speech and song. Which technique?', ['Melisma', 'Scat', 'Sprechstimme', 'Bel canto'], 2, 'German for "speech-voice".', 'Sprechstimme is Schoenberg\'s speech-song vocal delivery.'),
      mcq('music-figures.l09', 4, 3, 'Which contrast best describes Stravinsky and Schoenberg?', ['Stravinsky changed rhythm; Schoenberg changed the role of the key', 'Stravinsky invented the symphony; Schoenberg invented the modern jazz big band', 'Both wrote only film music', 'Stravinsky used no rhythm'], 0, 'Time versus pitch.', 'Stravinsky rewrote rhythm, while Schoenberg freed music from the key through atonality and serialism.'),
      // l10
      mcq('music-figures.l10', 1, 1, 'Who made the improvised solo the heart of jazz?', ['Louis Armstrong', 'Duke Ellington', 'Bach', 'Monk'], 0, 'A trumpeter and singer.', 'Armstrong made the improvised solo central to jazz and popularised scat.'),
      mcq('music-figures.l10', 2, 1, 'Which work is by Duke Ellington?', ['West End Blues', 'Kind of Blue', 'Take the "A" Train', 'A Love Supreme'], 2, 'A big-band standard.', 'Take the "A" Train is by Ellington; West End Blues is Armstrong\'s.'),
      mcq('music-figures.l10', 3, 2, 'A bandleader writes music that suits each soloist\'s individual sound. Which jazz figure is known for this?', ['Armstrong', 'Ellington', 'Hendrix', 'Berry'], 1, 'He wrote for players, not just instruments.', 'Ellington wrote for individual players\' voices.'),
      mcq('music-figures.l10', 4, 3, 'How do Armstrong and Ellington complement each other?', ['Armstrong composed only for symphony orchestra; Ellington played only solo trumpet and sang scat', 'Armstrong avoided improvisation', 'Ellington avoided composition', 'Armstrong centred the individual voice; Ellington built larger works around many voices'], 3, 'One soloist, one composer.', 'Armstrong placed the soloist at the centre, while Ellington extended jazz into suites and concert-length works.'),
      // l11
      mcq('music-figures.l11', 1, 1, 'Whose song gave the Rolling Stones their name?', ['B.B. King', 'Robert Johnson', 'Chuck Berry', 'Muddy Waters'], 3, 'Rollin\' Stone.', 'Muddy Waters\' song Rollin\' Stone inspired the band\'s name.'),
      mcq('music-figures.l11', 2, 1, 'Who is called the godmother of rock and roll?', ['Mahalia Jackson', 'Sister Rosetta Tharpe', 'Aretha Franklin', 'Ella Fitzgerald'], 1, 'She played electric guitar.', 'Sister Rosetta Tharpe brought distorted electric guitar to gospel.'),
      mcq('music-figures.l11', 3, 2, 'A musician electrifies the country blues into a full-band sound. Whose achievement is this?', ['Muddy Waters', 'Robert Johnson', 'B.B. King', 'Mahalia Jackson'], 0, 'Chicago blues.', 'Muddy Waters electrified country blues into Chicago blues.'),
      mcq('music-figures.l11', 4, 3, 'What was notable about Mahalia Jackson\'s role at the March on Washington?', ['She gave the speech', 'She delivered the keynote address and led the closing prayer', 'She sang before the I Have a Dream speech', 'She played electric guitar'], 2, 'She is the Queen of Gospel.', 'Jackson sang at the March on Washington before the I Have a Dream speech.'),
      // l12
      mcq('music-figures.l12', 1, 1, 'Who is known as the Queen of Soul?', ['Billie Holiday', 'Ella Fitzgerald', 'Aretha Franklin', 'Mahalia Jackson'], 2, 'Respect.', 'Aretha Franklin is the Queen of Soul.'),
      mcq('music-figures.l12', 2, 1, 'Whose emphasis on "the One" helped invent funk?', ['James Brown', 'Ray Charles', 'Marvin Gaye', 'Stevie Wonder'], 0, 'The Godfather of Soul.', 'James Brown shifted emphasis to the One, the downbeat groove.'),
      mcq('music-figures.l12', 3, 2, 'A musician merges gospel intensity with secular R&B. Who is credited?', ['Duke Ellington', 'Robert Johnson', 'Rakim', 'Ray Charles'], 3, 'The Genius.', 'Ray Charles fused gospel and blues into soul.'),
      mcq('music-figures.l12', 4, 3, 'Why is James Brown important to hip-hop?', ['He invented the DJ backspin', 'He is the most-sampled artist in hip-hop history', 'He won a Pulitzer Prize', 'He founded Public Enemy'], 1, 'Think of samples.', 'The museum notes Brown is the most-sampled artist in hip-hop history.'),
      // l13
      mcq('music-figures.l13', 1, 1, 'Who won the Nobel Prize in Literature in 2016?', ['Chuck Berry', 'Bob Dylan', 'Jimi Hendrix', 'Joni Mitchell'], 1, 'A folk-rock songwriter.', 'Bob Dylan won the 2016 Nobel Prize in Literature.'),
      mcq('music-figures.l13', 2, 1, 'What did the Beatles make a compositional instrument?', ['The full symphony orchestra pit', 'The nineteenth-century salon piano', 'The portable electric organ amplifier', 'The recording studio'], 3, 'It is not a handheld instrument.', 'The museum credits them with making the recording studio a compositional instrument.'),
      mcq('music-figures.l13', 3, 2, 'A guitarist uses feedback, wah and distortion as an expressive palette. Who is this?', ['B.B. King', 'Chuck Berry', 'Jimi Hendrix', 'Joni Mitchell'], 2, 'Purple Haze.', 'Jimi Hendrix used feedback, wah and distortion expressively.'),
      mcq('music-figures.l13', 4, 3, 'How did Chuck Berry\'s work influence later rock bands?', ['His riffs and teen-life lyrics became a blueprint for the Beatles and Stones', 'He banned the guitar solo and urged all later bands to avoid blues scales and riffs', 'He wrote only symphonies', 'He taught Bach'], 0, 'Think of template and blueprint.', 'Berry defined the rock riff and teen-life lyrics, the blueprint later followed by the Beatles and Stones.'),
      // l14
      mcq('music-figures.l14', 1, 1, 'Who made the DJ an instrumentalist by turning two turntables into one instrument?', ['Grandmaster Flash', 'Rakim', 'J Dilla', 'Kendrick Lamar'], 0, 'The Message.', 'Grandmaster Flash developed the backspin and Quick Mix Theory.'),
      mcq('music-figures.l14', 2, 1, 'What did Kendrick Lamar win in 2018?', ['The Nobel Prize', 'The Booker Prize', 'The Pulitzer Prize for Music', 'The Oscar for Best Score'], 2, 'He was the first rapper to do so.', 'Kendrick Lamar won the 2018 Pulitzer Prize for Music.'),
      mcq('music-figures.l14', 3, 2, 'An MC introduces complex internal rhyme and enjambment. Who is credited with this?', ['Public Enemy', 'Rakim', 'Grandmaster Flash', 'J Dilla'], 1, 'Paid in Full.', 'Rakim introduced complex internal rhyme and enjambment.'),
      mcq('music-figures.l14', 4, 3, 'How do J Dilla and Public Enemy differ in approach?', ['Dilla wrote chamber opera and film scores; Public Enemy wrote gospel hymns for church choirs', 'Both avoided samples', 'Dilla invented the backspin; Public Enemy invented scat', 'Dilla used off-grid drum feel; Public Enemy used dense sample collage for protest'], 3, 'Groove versus message.', 'J Dilla reshaped rhythmic feel with off-grid programming; Public Enemy made layered sample collage a vehicle for protest.'),
    ],
  },
};
