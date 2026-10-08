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

const L01 = 'music-history-eras.l01';
const L02 = 'music-history-eras.l02';
const L03 = 'music-history-eras.l03';
const L04 = 'music-history-eras.l04';
const L05 = 'music-history-eras.l05';
const L06 = 'music-history-eras.l06';
const L07 = 'music-history-eras.l07';
const L08 = 'music-history-eras.l08';
const L09 = 'music-history-eras.l09';
const L10 = 'music-history-eras.l10';
const L11 = 'music-history-eras.l11';
const L12 = 'music-history-eras.l12';
const L13 = 'music-history-eras.l13';
const L14 = 'music-history-eras.l14';
const L15 = 'music-history-eras.l15';
const L16 = 'music-history-eras.l16';
const L17 = 'music-history-eras.l17';
const L18 = 'music-history-eras.l18';
const L19 = 'music-history-eras.l19';
const L20 = 'music-history-eras.l20';
const L21 = 'music-history-eras.l21';
const L22 = 'music-history-eras.l22';
const L23 = 'music-history-eras.l23';
const L24 = 'music-history-eras.l24';
const L25 = 'music-history-eras.l25';
const L26 = 'music-history-eras.l26';
const L27 = 'music-history-eras.l27';
const L28 = 'music-history-eras.l28';

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'music-history-eras',
    label: 'The Story of Music: Eras and Composers',
    blurb: 'A chronological survey from ancient music and medieval chant to Bach, Beethoven, jazz, film scores and hip-hop production, showing how instruments, notation, patrons and technology shaped what people heard.',
    accent: '#FFD24A',
    framework: 'c3',
    tracks: [
      {
        id: 'music-history-eras.t1',
        title: 'Ancient and Medieval Music',
        blurb: 'From the oldest written-down melodies to chant, the staff, early polyphony, troubadours and Ars Nova.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L01,
            title: 'Music in the Ancient World',
            blurb: 'Ancient peoples made and wrote about music, though only fragments of their actual sound survive.',
            minutes: 9,
            body: `Every known human culture makes music, but for most of history nobody wrote it down, so what we know about the ancient world comes from instruments, pictures, texts and a handful of notated fragments.

In Mesopotamia, a clay tablet from the city of Ugarit, dated to around 1400 BC, carries a Hurrian hymn with signs that scholars read as musical notation. Experts still debate how to interpret it, but it is among the oldest notated music known. Egyptian paintings and tomb finds show harps, flutes and the rattle called the sistrum used in temple ritual and at banquets.

Ancient Greece gave Western music much of its vocabulary. The words music, harmony and melody come from Greek, and thinkers such as the Pythagoreans studied how pitch relates to the length of a vibrating string. Two notated Greek pieces are well known: the Delphic Hymns to Apollo, from around the second century BC, and the Seikilos epitaph, a short song carved on a gravestone, from about the first century AD.

In China, a set of 65 bronze bells found in the tomb of Marquis Yi of Zeng, from around 433 BC, shows how advanced court music was. The guqin, a plucked zither, became a scholar's instrument. In India, the ancient treatise on performing arts called the Natya Shastra discusses melody and rhythm, and Indian music later developed the ideas of raga and tala. Its exact date is debated, so it is usually placed around two thousand years ago.

The lesson to carry forward: music is old and everywhere, but our sound-picture of the ancient world is incomplete.`,
          },
          {
            id: L02,
            title: 'Gregorian Chant and Hildegard of Bingen',
            blurb: 'Medieval church music was a single unaccompanied line, and one of its most original voices was a woman, Hildegard.',
            minutes: 9,
            body: `For much of the early Middle Ages, the main written music of Western Europe was the song of the Christian church. Gregorian chant, also called plainchant, is monophonic: everyone sings one melody, in Latin, without instruments or harmony, and the rhythm follows the flow of the words. The name honors Pope Gregory I, who lived around 600, but historians agree the repertory grew over several centuries and was gathered and standardized later, especially in the Frankish lands by around 900.

Chant is organized in modes, scale patterns that differ from the major and minor scales we know today. Its calm, floating sound shaped Western musical ear-training for a thousand years, and composers still quote its melodies, such as the Dies irae.

Hildegard of Bingen (1098 to 1179) was a German abbess, writer and composer. She is one of the first composers in Western music about whom we know a good deal, and a large body of her music survives. Her chants, collected in a cycle often called the Symphonia, soar over wider ranges and leap more adventurously than most chant. She also wrote Ordo Virtutum, a sung drama about the virtues and the devil, which is notable because the devil's part is spoken rather than sung.

Chant was not only a style but a foundation. Later polyphony, the combining of independent melodic lines, was first built by adding voices around chant melodies.`,
          },
          {
            id: L03,
            title: 'Guido of Arezzo and the Invention of Notation',
            blurb: 'Written lines and syllables let singers learn songs from the page instead of from memory alone.',
            minutes: 8,
            body: `Early chant was passed on by memory. Around the ninth century, singers began adding small marks called neumes above the words to remind them whether the melody went up or down. Neumes showed the shape of a tune but not exact pitches, so you still had to know the song already.

Guido of Arezzo, an Italian monk and teacher who lived around the year 1000, is credited with advancing the idea that fixed the problem. He promoted the use of lines to show pitch, and he taught a staff of lines and spaces on which each note has a definite place. The system developed over time into the five-line staff we use today.

Guido is also associated with a teaching method that gave names to notes. Singers learned syllables, now known as ut, re, mi, fa, sol and la, taken from the opening of a Latin hymn to St. John, where each phrase begins one step higher than the last. Later, do replaced ut, and the system lives on in the do-re-mi of solfege. Treat the precise details of what Guido personally invented with some caution, since the system grew over generations, but his importance as a teacher of notation is well established.

Why does notation matter? It let composers create music that other people, far away or long after, could perform. It also made it possible to write more than one line at a time, which led to complex polyphony and eventually to the whole tradition of Western composition.`,
          },
          {
            id: L04,
            title: 'Notre Dame, Troubadours and Machaut',
            blurb: 'Between about 1100 and 1370 music gained multiple voices, songs of courtly love, and a new rhythmic notation.',
            minutes: 10,
            body: `Polyphony grew from a simple idea: add a second voice to a chant. This is called organum. At the cathedral of Notre Dame in Paris, in the late twelfth and early thirteenth centuries, composers took it much further. Leonin is credited with compiling the Magnus Liber Organi, the Great Book of Organum, for the church year. Perotin, who came slightly later, is known for writing organum in three and four voices, which was extraordinary for the time. Both are known mostly through later writers, so details of their lives are slim.

Meanwhile, outside the church, the troubadours of southern France sang songs of love and chivalry in the language of the region, from around 1100. Guilhem IX, Duke of Aquitaine, is the earliest troubadour whose songs survive. Their northern counterparts, the trouvères, did the same in northern French. Many of these melodies are preserved, though the rhythm and accompaniment are not clearly specified.

In the fourteenth century a new approach to rhythm, in which notes could be divided in flexible ways, gave rise to the label Ars Nova, or new art. Guillaume de Machaut (around 1300 to 1377), a poet and composer, is its most famous figure. His Messe de Nostre Dame is a landmark: it is often described as the earliest complete setting of the Mass ordinary attributed to a single composer. He also wrote many songs, including rondeaux and ballades.`,
          },
        ],
      },
      {
        id: 'music-history-eras.t2',
        title: 'Renaissance and Baroque',
        blurb: 'Printing, opera, patrons and new instruments reshape music from 1450 to 1750.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L05,
            title: 'The Renaissance: Josquin, Palestrina and the Printed Page',
            blurb: 'Smooth, balanced vocal polyphony spread across Europe thanks in part to music printing.',
            minutes: 10,
            body: `The Renaissance in music runs roughly from around 1400 to 1600. Its most characteristic sound is vocal polyphony in which several voices of similar importance weave together, often imitating each other, with a smoother, more consonant sound than earlier styles.

Josquin des Prez (around 1450 to 1521), from the region that is now northern France and Belgium, worked in Italy and France and was widely admired as the leading composer of his time. His motets and masses show a close match between the music and the meaning of the words. Giovanni Pierluigi da Palestrina (around 1525 to 1594) worked mainly in Rome. His church music, including the Pope Marcellus Mass, became a model of clear, balanced counterpoint taught to students for centuries.

Outside the church, the madrigal became popular: a piece for a few voices, usually setting a poem in Italian, in which the music often paints the meaning of individual words. English composers such as Thomas Morley and Thomas Weelkes later wrote their own madrigals.

A key technology changed everything. Johannes Gutenberg's movable type, around 1450, led to printed books, and in 1501 Ottaviano Petrucci in Venice published the Harmonice Musices Odhecaton, a famous early collection of polyphonic songs printed using movable type. Printed music was cheaper and traveled farther than handwritten copies, so styles spread faster and amateurs could buy and sing music at home.`,
          },
          {
            id: L06,
            title: 'The Birth of Opera: Monteverdi, Caccini and Strozzi',
            blurb: 'Around 1600, musicians in Italy invented sung drama and gave solo voices the spotlight.',
            minutes: 10,
            body: `Around 1600, a group of Florentine thinkers and musicians wanted to revive what they imagined ancient Greek drama had sounded like. The result was a new style in which a solo singer, supported by a simple instrumental bass line, declaimed text with expression. This led to opera, drama sung throughout. Jacopo Peri's Euridice, performed in 1600, is one of the earliest operas that survives.

Claudio Monteverdi (1567 to 1643) turned the new form into lasting art. His L'Orfeo, first performed in Mantua in 1607, tells the myth of Orpheus and is regarded as the first great opera. Later he moved to Venice, where he wrote L'incoronazione di Poppea in 1643. By then opera had become a public entertainment: the first public opera house opened in Venice in 1637, so audiences who bought tickets, not only courtiers, could attend.

Women were part of this world. Francesca Caccini (1587 to after 1640), a singer and composer at the Medici court in Florence, wrote La liberazione di Ruggiero dall'isola d'Alcina in 1625, usually described as the earliest surviving opera by a woman. Barbara Strozzi (1619 to 1677), a Venetian singer and composer, published several volumes of her own vocal music, mostly cantatas and arias, which is remarkable for a woman of her time.

The new style of a solo voice over a bass line shaped the Baroque era.`,
          },
          {
            id: L07,
            title: 'The Baroque: Bach, Handel, Vivaldi and Purcell',
            blurb: 'From about 1600 to 1750, music became ornate, dramatic and built on a bass line and harmony.',
            minutes: 10,
            body: `The Baroque era runs roughly from 1600 to 1750. Its music is dramatic and decorated, and it rests on basso continuo: a bass line played by a cello or similar instrument with a harpsichord or organ filling in the chords. Composers also grew more interested in tonality, the sense that music centers on a home key.

Henry Purcell (around 1659 to 1695) was the leading English composer; his opera Dido and Aeneas, composed in the 1680s (scholars still debate the exact year), is a landmark. Antonio Vivaldi (1678 to 1741) taught and composed in Venice and helped to standardize the concerto for a soloist and orchestra. His set of four violin concertos, The Four Seasons, was published in 1725.

Johann Sebastian Bach (1685 to 1750) and George Frideric Handel (1685 to 1759) were born in the same year, a few weeks apart and not far from each other in Germany. Bach spent his career in German churches and courts, becoming music director of Leipzig's main churches in 1723. His Brandenburg Concertos, Well-Tempered Clavier and St. Matthew Passion show mastery of counterpoint. Handel moved to England and wrote operas, then oratorios, English-language works for chorus and orchestra. His Messiah premiered in Dublin in 1742.

For a full picture of these two giants, see the composer profiles in the Music Figures course. Here, remember what the era invented: the concerto, the opera as a business, and harmony organized around a key.`,
          },
          {
            id: L08,
            title: 'Instruments, Patrons and Concert Halls',
            blurb: 'Who paid for music, and what it was played on and in, changed the sound over the centuries.',
            minutes: 10,
            body: `Music does not exist in a vacuum. Who pays, where it is played and what instruments exist all shape what composers write.

In the Middle Ages, the church was the main patron; singers sang in monasteries and cathedrals. In the Renaissance and Baroque, courts and aristocrats employed composers as servants. Bach worked for churches and a prince; Haydn served the Esterhazy family for decades. A patron might demand a certain style, but also gave steady income.

Instruments developed too. The violin family was perfected in northern Italy in the sixteenth and seventeenth centuries, with Cremona famous for its makers. Around 1700, Bartolomeo Cristofori in Italy built the first piano, an instrument that could play both soft and loud, which is why it was named pianoforte. In the early nineteenth century, valves for brass instruments made it easier to play all the notes, and the modern orchestra grew larger and richer.

Public concerts began to replace private courts. Public concerts were being given in London in the later seventeenth century, and in the nineteenth century dedicated halls were built, such as the Musikverein in Vienna in 1870 and Carnegie Hall in New York in 1891. Printing and, later, copyright laws let composers earn from sales instead of relying on one patron.

Each shift, from church to court to public, changed who music was for.`,
          },
        ],
      },
      {
        id: 'music-history-eras.t3',
        title: 'Classical and Romantic Masters',
        blurb: 'The balanced Classical style, Beethoven as a turning point, and the personal voice of the Romantics.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L09,
            title: 'The Classical Era: Haydn and Mozart',
            blurb: 'Around 1750 to 1820, music prized clarity, balance and form, and the symphony and sonata took shape.',
            minutes: 10,
            body: `The Classical era, from about 1750 to the early 1800s, grew alongside the Enlightenment, which valued reason, order and clarity. In music, that meant clear melodies, balanced phrases and well-planned forms.

The most important of these forms is sonata form, used for the first movement of many symphonies, sonatas and string quartets. It has three main parts: an exposition, which presents contrasting themes; a development, which plays with them; and a recapitulation, which brings them back. A symphony usually has four movements, and a string quartet is for two violins, a viola and a cello.

Joseph Haydn (1732 to 1809) worked for the wealthy Esterhazy family in Hungary for decades, and later became famous in London. He wrote more than one hundred symphonies and is often called the father of the symphony and of the string quartet, though he did not invent either alone. Wolfgang Amadeus Mozart (1756 to 1791), born in Salzburg, was a child prodigy who later settled in Vienna. He mastered nearly every genre, from piano concertos to operas such as The Marriage of Figaro (1786) and The Magic Flute (1791). His Requiem was left unfinished at his death at age 35.

Haydn and Mozart knew and admired each other. Together they set the pattern that Beethoven would inherit and break open.`,
          },
          {
            id: L10,
            title: 'Beethoven: From Classical to Romantic',
            blurb: 'Beethoven stretched Classical forms with drama and personal expression, even as he lost his hearing.',
            minutes: 9,
            body: `Ludwig van Beethoven (1770 to 1827), born in Bonn, moved to Vienna as a young man and became famous as a pianist and composer. He studied with Haydn and admired Mozart, and he began in the Classical style. But he steadily made his music larger, more intense and more personal.

In the early 1800s he began to lose his hearing. He grew deeply distressed, but kept composing, and eventually could not hear his own music. His Symphony No. 3, the Eroica, from 1804, was much longer and more dramatic than symphonies before it. His Symphony No. 5 is built from a four-note motif developed through the whole work. His Symphony No. 9, first performed in 1824, adds a chorus and soloists in the last movement, singing words from Friedrich Schiller's poem Ode to Joy.

Beethoven also wrote 32 piano sonatas and 16 string quartets, and the late quartets are among the most searching works in the repertory. Because he made his living by publishing, public concerts and commissions rather than serving a single employer, he is often seen as a model of the independent artist.

He is often described as a bridge: Classical in training, Romantic in spirit. Later composers felt both inspired and intimidated by his example.`,
          },
          {
            id: L11,
            title: 'Romantic Voices: Schubert, Schumann, Chopin and Liszt',
            blurb: 'In the early nineteenth century, music became a vehicle for personal feeling, poetry and piano wizardry.',
            minutes: 10,
            body: `The Romantic era, from about 1820 to 1900, put feeling and imagination first. Composers wrote for the growing middle-class audience, and many linked music to poems, stories and nature.

Franz Schubert (1797 to 1828), who lived in Vienna and died at 31, wrote more than 600 songs, called Lieder, for voice and piano, along with symphonies, chamber music and piano pieces. His song cycles include Winterreise, a set of 24 songs on poems by Wilhelm Muller.

Robert Schumann (1810 to 1856) wrote piano music, songs and symphonies and also worked as a music critic. Clara Wieck Schumann (1819 to 1896) was one of the leading pianists of her century and a composer. They married in 1840. Her story continues in a later lesson.

Frederic Chopin (1810 to 1849), born in Poland, spent most of his adult life in Paris and wrote almost exclusively for the piano: nocturnes, waltzes, etudes, and mazurkas and polonaises that echo Polish dances. Franz Liszt (1811 to 1886), a Hungarian, was a dazzling virtuoso pianist whose recitals drew huge crowds. He also created the symphonic poem, a one-movement orchestral work based on a story or idea.

The piano of this period, with its stronger frame and wider range, helped make these styles possible.`,
          },
          {
            id: L12,
            title: 'Brahms, Verdi and Wagner',
            blurb: 'Late Romantic giants took very different paths: the classical heritage, Italian opera, and the music drama.',
            minutes: 10,
            body: `Three composers born in the 1810s and 1830s show the range of the later nineteenth century.

Johannes Brahms (1833 to 1897), born in Hamburg and later based in Vienna, built on Beethoven's and Bach's example. He wrote four symphonies, concertos, chamber music and A German Requiem, which uses German texts chosen from the Bible rather than the traditional Latin Mass. Admirers saw him as a keeper of classical craft within a Romantic language.

Giuseppe Verdi (1813 to 1901) was the leading Italian opera composer of his century. Rigoletto (1851), La traviata (1853) and Aida (1871) remain staples of opera houses. His melodies are direct and emotionally powerful, and during the movement to unify Italy his name became a symbol of national feeling.

Richard Wagner (1813 to 1883) rethought opera as a total artwork, in which music, poetry and staging merge. He often used leitmotifs, short musical ideas linked to characters, objects or ideas that return and change through a work. His four-opera cycle The Ring of the Nibelung was first performed complete in 1876 in the Festspielhaus at Bayreuth, a theater he had built for the purpose. His harmony pushed tonality to new extremes, influencing generations after him.

Together these composers show that Romantic music did not mean one single style.`,
          },
        ],
      },
      {
        id: 'music-history-eras.t4',
        title: 'Nations, Women and New Colors',
        blurb: 'Nationalist composers, the women whose work was too often overlooked, and Debussy\'s impressionism.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L13,
            title: 'Musical Nationalism: Dvorak, Grieg, Tchaikovsky and Mussorgsky',
            blurb: 'Composers used folk tunes, dances and national stories to give their countries a musical voice.',
            minutes: 9,
            body: `In the nineteenth century, as many European peoples sought national identity, composers drew on folk songs, dances, legends and landscapes of their homelands. This is called musical nationalism.

Antonin Dvorak (1841 to 1904) from Bohemia, now in the Czech Republic, wrote Slavonic Dances inspired by folk dance. In 1892 he moved to New York to lead the National Conservatory of Music, and there he wrote his Symphony No. 9, From the New World, premiered in 1893. He encouraged American composers to draw on their own musical heritage, including African American and Native American melodies.

Edvard Grieg (1843 to 1907) of Norway composed incidental music for Henrik Ibsen's play Peer Gynt, and a famous piano concerto, both colored by Norwegian folk music.

Pyotr Ilyich Tchaikovsky (1840 to 1893) of Russia wrote the ballets Swan Lake, The Sleeping Beauty and The Nutcracker, plus symphonies and the opera Eugene Onegin. His style blends Western European training with Russian melody.

Modest Mussorgsky (1839 to 1881) was one of a group of Russian composers who wanted to create distinctly Russian music. His piano suite Pictures at an Exhibition (1874) was later orchestrated by Maurice Ravel in 1922, and that version is the one most often heard today.

Nationalism meant that classical music was no longer dominated only by German-speaking lands.`,
          },
          {
            id: L14,
            title: 'Women Composers Across the Centuries: Part One',
            blurb: 'From the Middle Ages to the Baroque, women composed despite limited access to training and publication.',
            minutes: 8,
            body: `Women have composed throughout the history of Western music, but for centuries they faced barriers: limited access to formal training, to church posts and to public performance. Many were overlooked because their work was not published or was not preserved. Recovery of this music is an ongoing project.

Hildegard of Bingen (1098 to 1179), who we met earlier, stands among the earliest composers in Western history whose name and music are firmly documented. As an abbess she had the authority to compose and direct sacred music for her community.

In the early seventeenth century, Francesca Caccini (1587 to after 1640) worked at the Medici court in Florence as a singer, teacher and composer. Her opera La liberazione di Ruggiero dall'isola d'Alcina, from 1625, is usually described as the earliest surviving opera by a woman.

Barbara Strozzi (1619 to 1677) lived in Venice, where she was a gifted singer who composed vocal music and published several volumes of cantatas and arias under her own name, a rare thing for a woman then. Her music combines expressive melodies with lively, speech-like phrasing.

These composers worked in different places and centuries, but their stories share a pattern: talent was often supported within religious communities or courts, while the wider musical world made it hard for women to become professional composers.`,
          },
          {
            id: L15,
            title: 'Women Composers Across the Centuries: Part Two',
            blurb: 'Clara Schumann, Fanny Mendelssohn, Amy Beach and Florence Price pushed against limits in the nineteenth and twentieth centuries.',
            minutes: 9,
            body: `In the nineteenth century, more women gained training, but social expectations still limited their careers.

Fanny Mendelssohn Hensel (1805 to 1847) was the older sister of the composer Felix Mendelssohn and as gifted musically. Her family discouraged her from publishing, and many of her works appeared only late or not at all in her lifetime, but she wrote hundreds of pieces, including songs and piano music, and organized a series of home concerts in Berlin.

Clara Wieck Schumann (1819 to 1896) was a child prodigy pianist who toured Europe for decades. She composed a piano concerto, a piano trio and many songs, and after the death of her husband Robert Schumann in 1856, she supported her family through performing and teaching and championed his music, as well as that of Brahms.

Amy Beach (1867 to 1944) of the United States was largely self-taught as a composer. Her Gaelic Symphony, premiered in 1896, is a major symphony by an American woman, and she became a prominent figure in American classical music.

Florence Price (1887 to 1953) was an African American composer who studied in Boston and later lived in Chicago. In 1933 her Symphony No. 1 in E minor was performed by the Chicago Symphony Orchestra, widely cited as the first symphony by a Black woman played by a major American orchestra. Her music blends Romantic style with spirituals and dance rhythms.`,
          },
          {
            id: L16,
            title: 'Impressionism and Debussy',
            blurb: 'Debussy used color, atmosphere and new scales to loosen the grip of traditional harmony.',
            minutes: 9,
            body: `Around the end of the nineteenth century, some French artists painted light and atmosphere rather than sharp detail. The term Impressionism comes from painting, and critics later applied it to music, though Claude Debussy (1862 to 1918) himself disliked labels.

Debussy was born near Paris and studied at the Paris Conservatoire. He wanted music to suggest moods and images rather than follow strict formulas. His orchestral Prelude to the Afternoon of a Faun, from 1894, drifts instead of marching toward a clear goal, and many historians regard it as a turning point toward modern music. His opera Pelleas et Melisande (1902) uses subtle, speech-like singing, and his orchestral work La mer (1905) paints the sea in sound.

Several techniques are tied to his style:
- the whole-tone scale, which divides the octave into six equal steps
- modal scales
- and chords used for their color rather than their pull toward a resolution.

He was impressed by the Javanese gamelan, an ensemble of gongs and metallophones, that he heard at the Paris Exposition of 1889, a reminder that non-Western music was already stirring European composers.

Maurice Ravel (1875 to 1937) is often grouped with him, though Ravel's style is more precise and classical. Both helped open the door to twentieth-century music.`,
          },
        ],
      },
      {
        id: 'music-history-eras.t5',
        title: 'Modernism and American Music',
        blurb: 'Radical experiments in Europe, the African American roots of American popular music, and American concert composers.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L17,
            title: 'Early Modernism: Stravinsky and Schoenberg',
            blurb: 'In the early 1900s, two composers shattered old assumptions about rhythm and harmony.',
            minutes: 9,
            body: `By the early twentieth century, many composers felt that traditional harmony had been stretched as far as it could go. Two of them took very different paths.

Igor Stravinsky (1882 to 1971), Russian-born, first became famous in Paris with ballets for the Ballets Russes company: The Firebird (1910) and Petrushka (1911). Then came The Rite of Spring, premiered in Paris in 1913, with pounding, shifting rhythms and harsh harmonies. Accounts agree that the first performance provoked a noisy reaction from the audience. Later he turned to a cooler, more balanced neoclassical style, and later still he explored other methods. He eventually moved to the United States.

Arnold Schoenberg (1874 to 1951), born in Vienna, moved step by step away from the idea of a home key. In works such as Pierrot lunaire (1912), he used atonality, music without a key center. In the early 1920s he developed the twelve-tone method, in which a fixed ordering of all twelve notes of the chromatic scale organizes a piece. His students Alban Berg and Anton Webern, together with him, are called the Second Viennese School.

Whether or not listeners loved these works, they showed that the old rules were choices, not laws of nature, and opened many roads for later composers.`,
          },
          {
            id: L18,
            title: 'African American Roots: Spirituals, Ragtime and Blues',
            blurb: 'Music created by African Americans became the foundation of American popular music worldwide.',
            minutes: 10,
            body: `African American musical traditions grew out of enslavement, resilience and creativity, and they shaped nearly all later American popular music.

Spirituals were religious songs created by enslaved people in the American South, often with call and response and expressive, bending melodies. After the Civil War, the Fisk Jubilee Singers, a group of students from Fisk University in Nashville formed in 1871, toured the United States and Europe and introduced arranged spirituals to wide audiences, raising money for their school.

Ragtime, a piano style with syncopated, off-beat melodies over a steady bass, flourished around the 1890s and early 1900s. Scott Joplin (1868 to 1917) is its best-known composer; his Maple Leaf Rag was published in 1899 and became a major hit in sheet music.

The blues emerged in the Deep South around the turn of the twentieth century. A typical blues has twelve bars with a repeating harmonic pattern and lyrics about hardship, love and resilience. It uses blue notes, bent pitches that fall between the usual piano notes. W. C. Handy helped bring the blues to wider audiences through published songs such as Memphis Blues in 1912 and St. Louis Blues in 1914, and Bessie Smith became one of its greatest singers on records in the 1920s.

These styles carried rhythm, improvisation and emotional directness that transformed popular music.`,
          },
          {
            id: L19,
            title: 'Jazz and Gospel',
            blurb: 'Jazz and gospel, both rooted in Black communities, turned improvisation and spiritual feeling into new art forms.',
            minutes: 9,
            body: `Jazz took shape in the early twentieth century, with New Orleans as a famous early center. It blends blues, ragtime, brass band music and African-derived rhythm, and it values improvisation, in which players invent melodies on the spot over a harmonic framework. A 1917 recording by the Original Dixieland Jass Band is commonly cited as the first jazz record.

Louis Armstrong (1901 to 1971), a trumpeter and singer from New Orleans, helped make the soloist the star of jazz in recordings of the 1920s. Duke Ellington (1899 to 1974), a pianist and bandleader, composed for his orchestra for decades and treated jazz as a composer's art. Later styles included swing, bebop, cool jazz and many others.

Gospel is Black American religious music that fuses spirituals with blues-influenced feeling and rhythm, usually with powerful vocals, piano or organ and a chorus. Thomas A. Dorsey, a former blues musician, is widely called the father of gospel music for songs such as Precious Lord, Take My Hand, which he wrote in the 1930s. Mahalia Jackson, a singer from New Orleans, carried gospel to national and international audiences.

For detailed profiles of key jazz and gospel figures, see the Music Figures course. The key point here is the chain: spirituals, blues and ragtime fed jazz and gospel, and later fed soul, rock and hip-hop.`,
          },
          {
            id: L20,
            title: 'American Voices: Ives, Copland and Gershwin',
            blurb: 'Three composers created concert music that sounded distinctly American.',
            minutes: 9,
            body: `European composers long dominated concert halls in the United States, but in the twentieth century three composers developed American sounds.

Charles Ives (1874 to 1954) worked in the insurance business and composed on the side. His music layers hymns, marches and folk tunes, sometimes playing different rhythms or keys at the same time, as though two village bands were passing in the street. He was far ahead of his time, and his work was widely recognized only later in his life.

George Gershwin (1898 to 1937), a New York songwriter, brought jazz and popular song into the concert hall. His Rhapsody in Blue premiered in 1924 in a concert led by bandleader Paul Whiteman, with Gershwin at the piano. He also wrote the opera Porgy and Bess, from 1935, set in a Black community in South Carolina.

Aaron Copland (1900 to 1990) studied in Paris and then worked to create an accessible American style. His ballets Rodeo (1942) and Appalachian Spring (1944) use open harmonies and folk melodies, including the Shaker tune Simple Gifts. His Fanfare for the Common Man dates from 1942.

These composers show that American music was not copying Europe alone: it mixed hymns, jazz, folk songs and city life into something new.`,
          },
        ],
      },
      {
        id: 'music-history-eras.t6',
        title: 'Postwar Experiments and Recording',
        blurb: 'Chance, repetition, global influences and the technology that made sound portable.',
        level: 'ADVANCED',
        lessons: [
          {
            id: L21,
            title: 'John Cage and the Question of What Music Is',
            blurb: 'Cage made silence, chance and everyday sound part of music.',
            minutes: 9,
            body: `After World War II, some composers asked a bold question: what counts as music? One of the most influential voices was the American composer John Cage (1912 to 1992).

In the late 1930s and 1940s, Cage developed the prepared piano, in which objects such as screws, bolts or pieces of rubber are placed between the strings, turning the piano into something like a percussion ensemble. He studied Asian philosophy and became interested in letting chance decide some musical choices, using methods such as coin tosses and the Chinese text I Ching to select notes and durations.

His best-known work is 4'33", from 1952. The performer sits at the instrument and plays no notes for four minutes and thirty-three seconds, so the audience hears the sounds of the room. The pianist David Tudor gave the first performance. Cage did not mean it as a joke; he wanted listeners to notice that sounds around us are always part of the music.

At the same time, other composers in Europe such as Pierre Boulez and Karlheinz Stockhausen explored total control through serial methods, an extension of the twelve-tone idea. Cage's approach was the opposite: giving up control.

Whether you love it or not, his thinking shaped experimental music, sound art and performance for decades afterward.`,
          },
          {
            id: L22,
            title: 'Minimalism: Reich and Glass',
            blurb: 'Minimalist composers built music from repeating patterns that change gradually.',
            minutes: 9,
            body: `Minimalism emerged in the United States in the 1960s. Its music uses a few simple elements, steady pulse and repetition, and changes slowly so that the listener hears small shifts in detail.

An early landmark was In C by Terry Riley, from 1964, in which performers play through a set of short melodic patterns at their own pace over a steady pulse.

Steve Reich (born 1936) began with tape pieces such as It's Gonna Rain (1965), in which two identical loops of a recorded voice slowly drift out of sync. This technique, called phasing, he applied to live performers in Piano Phase (1967). His large work Music for 18 Musicians, from 1976, uses pulsing rhythms and slowly changing harmonies. In 1970 Reich traveled to Ghana to study drumming, and rhythmic ideas from African music fed into his work.

Philip Glass (born 1937) writes music made of repeating arpeggios and additive rhythms, in which small units are lengthened or shortened. With director Robert Wilson he created the opera Einstein on the Beach, premiered in 1976. He later composed many film scores.

Minimalism reached beyond concert halls. Its repeating loops and gradual layering influenced ambient music, electronic dance music and film soundtracks, and show how a pattern can be as expressive as a melody.`,
          },
          {
            id: L23,
            title: 'When World and Folk Traditions Met Western Music',
            blurb: 'Composers and performers have long borrowed across cultures, sometimes with care and sometimes with controversy.',
            minutes: 9,
            body: `Western classical music has always borrowed from folk and non-Western traditions, and the exchange goes in both directions.

Hungarian composers Bela Bartok (1881 to 1945) and Zoltan Kodaly collected folk songs in villages in the early twentieth century, using early recording equipment. Bartok worked what he found into his own music, including string quartets and the Concerto for Orchestra, and he saw folk music as a source of renewal rather than decoration.

Claude Debussy heard Javanese gamelan at the Paris Exposition in 1889, and its sound helped shape his ideas about color and texture. Steve Reich, as noted, studied drumming in Ghana. Indian classical music reached a wide Western audience through the sitar player Ravi Shankar, who performed at the Monterey Pop Festival in 1967 after his friendship with George Harrison, who had used a sitar on the Beatles' recording of Norwegian Wood in 1965.

Such exchange raises real questions. Who gets credit? Who is paid? Does borrowing respect a tradition or flatten it? Musicians and scholars still debate these questions, and ethnomusicology, the study of music in its cultural context, was developed partly to approach other traditions on their own terms.

The best collaborations involve learning from tradition bearers, naming sources and sharing benefits, while the weakest treat other cultures as a supply of exotic sounds.`,
          },
          {
            id: L24,
            title: 'Recording Technology Changes Everything',
            blurb: 'From the phonograph to streaming, recording turned music from an event into an object you can own.',
            minutes: 10,
            body: `Until the late nineteenth century, to hear music you had to be in the room with the performers or play it yourself. Recording changed that.

Thomas Edison demonstrated the phonograph in 1877, recording sound on a cylinder. Emile Berliner developed the flat disc and gramophone in the 1880s, which became the standard format. Early recordings were made acoustically, by singing or playing into a horn. Electrical recording with microphones became standard in the mid-1920s, giving a fuller sound and making quiet singing styles, like crooning, possible.

Radio broadcasting grew in the 1920s and brought music into homes. After World War II, magnetic tape allowed recordings to be edited and layered. Multitrack recording let producers record parts separately and mix them later, so an album could be built in the studio, as in many rock and pop records of the 1960s. The long-playing record (LP), introduced by Columbia in 1948, held about twenty minutes a side, and stereo became common in the late 1950s.

The compact disc arrived in 1982, and later digital files and streaming made huge catalogs available instantly.

Recording had deep effects: it let listeners hear performances by artists who lived far away or had died, it created stars known mainly through records, and it made the studio itself an instrument. It also changed performance: musicians began to aim for the polish of recordings in live shows.`,
          },
        ],
      },
      {
        id: 'music-history-eras.t7',
        title: 'Screens, Circuits and the Next Chapter',
        blurb: 'Film scores, electronic instruments, hip-hop production and the long view of how tools shape music.',
        level: 'ADVANCED',
        lessons: [
          {
            id: L25,
            title: 'Film Music',
            blurb: 'Film turned the orchestra into a storytelling machine for mass audiences.',
            minutes: 9,
            body: `Silent films were not silent in theaters. They were usually shown with live music, from a pianist or organist to a full orchestra, which set mood and covered projector noise. Camille Saint-Saens wrote music for the 1908 film The Assassination of the Duke of Guise, often cited as one of the first original film scores.

Sound-on-film arrived with The Jazz Singer in 1927, and the studios soon hired composers. Max Steiner, whose score for King Kong (1933) is a landmark, helped establish the Hollywood style, using lush Romantic orchestration and leitmotifs borrowed from Wagner's practice. Erich Wolfgang Korngold, who had been a child prodigy in Vienna, brought a rich symphonic voice to adventure films.

Later composers extended the range. Bernard Herrmann's shrieking strings in Psycho (1960) showed how a small orchestra could create terror. Ennio Morricone's scores for Italian westerns used unusual instruments and sounds. John Williams revived the big orchestral approach with Star Wars in 1977, using themes for characters and ideas in the Wagnerian manner.

Film music also draws on jazz, pop and, more recently, electronic sounds and sound design. It is arguably the main route by which people today meet orchestral music.

A film score has a job: to support the story. Within that job, composers have found room for real artistry, and many scores are now performed in concert halls.`,
          },
          {
            id: L26,
            title: 'Electronic Music',
            blurb: 'New machines made sounds that no traditional instrument could produce.',
            minutes: 10,
            body: `Electronic music uses electricity to make or shape sound. Its early story shows experimentation in many places.

The theremin, invented by Leon Theremin in Russia around 1920, is played without touching it: the performer's hands move near two antennas to control pitch and volume. In the late 1940s, in Paris, Pierre Schaeffer developed musique concrete, which builds music by recording real-world sounds and manipulating them, for instance by editing and looping tape. In the 1950s, composers in Cologne, including Karlheinz Stockhausen, built music from electronically generated tones.

In the 1960s, Robert Moog and others developed synthesizers that musicians could play. Wendy Carlos's album Switched-On Bach, from 1968, used a Moog synthesizer to perform Bach's music and became a surprise best seller, introducing the instrument to a mass audience. Synthesizers became central to rock, pop, film music and dance music.

In 1983, the MIDI standard let instruments and computers from different makers talk to each other, and over the following decades the digital audio workstation, software that records and edits music on a computer, put a studio into a laptop.

Electronic music raises a new question about what a performer is: a person playing, a person programming, or both. It also shows a pattern in this course: new tools bring new sounds, and new sounds bring new music.`,
          },
          {
            id: L27,
            title: 'Hip-Hop Production: The Next Chapter',
            blurb: 'Hip-hop turned turntables, drum machines and samplers into instruments and made the producer a composer.',
            minutes: 9,
            body: `Hip-hop began in the Bronx, New York, in the 1970s, in neighborhood parties where DJs played records for dancers. Many histories point to a 1973 party hosted by DJ Kool Herc, who used two copies of the same record to extend the instrumental breaks that dancers loved, a method called the breakbeat. Rapping, graffiti and breaking grew up around the DJ's music as parts of one culture.

Early hip-hop DJs such as Grandmaster Flash refined the use of two turntables and a mixer, cutting between records. Rapper's Delight by the Sugarhill Gang, released in 1979, was one of the first hip-hop records to reach a wide audience.

In the 1980s, new machines joined the turntable. Drum machines such as the Roland TR-808, introduced in 1980, supplied a deep bass drum and crisp snare. Samplers, devices that record and replay snippets of sound, let producers build new tracks from pieces of older recordings, and the Akai MPC, which appeared at the end of the 1980s, became a favorite tool for beat making.

Sampling raised legal and artistic questions about copyright and credit, and courts and the industry set up systems of licensing in response.

Seen from the long view of this course, hip-hop production fits a familiar pattern: musicians used the technology at hand, here records, samplers and drum machines, to create a new sound and a new way of composing.`,
          },
          {
            id: L28,
            title: 'The Long View: How Tools, Money and Places Shaped Music',
            blurb: 'A recap of how notation, printing, patronage, venues and technology drove musical change.',
            minutes: 9,
            body: `Looking back over the course, the history of music is partly a history of tools and institutions, as well as of genius.

Notation made it possible to pass music across space and time, from neumes to the staff to printed scores. Printing, starting with Petrucci in 1501, spread styles across Europe. Instruments set the possibilities: the violin family, the piano and valved brass each helped create new music, while electronic instruments and samplers did so in the twentieth century.

Patronage shaped what composers wrote. The church, then courts, then paying public audiences and publishers, and finally record labels, radio and streaming each rewarded different kinds of music. Places mattered too: the cathedral at Notre Dame, the opera houses of Venice, the Esterhazy court, Bayreuth, Carnegie Hall, New Orleans clubs, and the Bronx block party each shaped its own style.

Also notice how often musicians borrowed: from chant to polyphony, from folk songs to symphonies, from spirituals and blues to jazz and rock, and from old records to samples. Innovation and tradition were not opposites but partners.

Finally, notice who was heard and who was overlooked. Women composers and Black musicians created major work, often with fewer opportunities, and recovering that story continues today.

If you remember one idea, let it be this: music changes when new tools, new audiences and new ideas meet, and that is still happening now.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'music-history-eras',
    questions: [
      // L01
      tf(L01, 1, 1, 'Because no recordings exist, we know about ancient music only through instruments, pictures, texts and a few notated fragments.', 0, 'Think about what survives from thousands of years ago.', 'Sound recording is modern, so the ancient world is known through physical remains, writings and a few notated pieces.'),
      mc(L01, 2, 1, 'The Seikilos epitaph is a short notated song from which ancient culture?', ['Greece', 'Ancient Egypt', 'Ancient China', 'Ancient India'], 'It was carved on a gravestone.', 'The Seikilos epitaph is an ancient Greek song with notation, from around the first century AD.'),
      mc(L01, 3, 2, 'A Hurrian hymn on a clay tablet from Ugarit, dated to around 1400 BC, is notable because it is:', ['One of the oldest notated pieces of music known', 'The first piece ever written for a full symphony orchestra', 'The earliest known music ever printed with movable type', 'A proven exact transcription of a modern pop song and lyrics'], 'Think about age and writing.', 'The tablet carries signs read as musical notation, making it among the oldest, though its interpretation is debated.'),
      mc(L01, 4, 2, 'The 65 bronze bells found in the tomb of Marquis Yi of Zeng come from ancient:', ['China', 'Greece', 'Mesopotamia', 'Egypt'], 'Look at the name of the tomb.', 'The bells of Marquis Yi of Zeng, from around 433 BC, are a famous example of Chinese court music.'),
      tf(L01, 5, 3, 'Scholars agree on exactly how the Hurrian hymn should sound.', 1, 'Consider whether the notation is easy to decode.', 'Interpretation of the Hurrian hymn is debated, so there is no single agreed performance.'),
      // L02
      tf(L02, 1, 1, 'Gregorian chant is a single unaccompanied melody sung in Latin.', 0, 'Think about the word monophonic.', 'Chant is monophonic, meaning one melodic line with no harmony or instruments.'),
      mc(L02, 2, 1, 'Hildegard of Bingen was a:', ['German abbess, writer and composer', 'Venetian opera singer and court teacher', 'French troubadour', 'Viennese pianist'], 'She lived from 1098 to 1179.', 'Hildegard led a convent in Germany and composed a large body of sacred music.'),
      mc(L02, 3, 2, 'Why is chant called Gregorian?', ['It is traditionally linked to Pope Gregory I, though the repertory grew over centuries', 'It was invented in a single year by Pope Gregory I', 'It was named for a composer called Gregory in Notre Dame', 'It was first written for the piano'], 'Consider the traditional link and the actual history.', 'The name honors Gregory I, but historians agree the repertory developed over many generations.'),
      mc(L02, 4, 2, 'In her sung drama Ordo Virtutum, what is unusual about the devil\'s part?', ['It is spoken, not sung', 'It is sung by a choir of men', 'It is played only by an organ', 'It is silent'], 'Think about how it sets him apart from the virtues.', 'In Ordo Virtutum the virtues sing but the devil\'s role is spoken.'),
      tf(L02, 5, 3, 'Chant was written in the major and minor scales we know today.', 1, 'What did chant use instead of those scales?', 'Chant uses modes, which differ from modern major and minor scales.'),
      // L03
      tf(L03, 1, 1, 'Neumes were early marks that showed the shape of a melody going up or down.', 0, 'They were added above the words.', 'Neumes indicated melodic direction but not exact pitches.'),
      mc(L03, 2, 1, 'Guido of Arezzo is remembered as a teacher who advanced:', ['The staff and the naming of notes with syllables', 'The printing press', 'The piano', 'The twelve-tone method of ordering all pitches in a row'], 'He lived around the year 1000.', 'Guido is associated with lines for pitch and a syllable method that evolved into solfege.'),
      mc(L03, 3, 2, 'The syllables ut, re, mi, fa, sol, la were taken from:', ['A Latin hymn to St. John', 'A madrigal by Thomas Morley in England', 'A song by a troubadour of southern France', 'A Greek epitaph carved on a gravestone'], 'Each phrase began one step higher.', 'The syllables come from the opening of a Latin hymn to St. John whose lines rise stepwise.'),
      mc(L03, 4, 2, 'Which syllable later replaced ut in the solfege system?', ['do', 'ti', 'sol', 'fa'], 'Think of do-re-mi.', 'Do replaced ut, giving the do-re-mi familiar today.'),
      tf(L03, 5, 3, 'Notation helped make it possible to write more than one melodic line at a time.', 0, 'Consider what writing allows composers to plan.', 'Notation allowed composers to plan multiple lines together, enabling polyphony and composition at a distance.'),
      // L04
      tf(L04, 1, 1, 'Notre Dame cathedral in Paris was a center for early polyphony called organum.', 0, 'Think of Leonin and Perotin.', 'Composers at Notre Dame developed organum in the late twelfth and early thirteenth centuries.'),
      mc(L04, 2, 1, 'Which composer is known for organum in three and four voices?', ['Perotin', 'Palestrina', 'Purcell', 'Peri'], 'He is linked with Notre Dame.', 'Perotin is known for writing three- and four-voice organum.'),
      mc(L04, 3, 2, 'Troubadours were poet-musicians who sang songs of courtly love in:', ['Southern France', 'Northern Germany', 'Venice', 'Hungary'], 'Think of the earliest, Guilhem IX of Aquitaine.', 'Troubadours worked in southern France; their northern counterparts were called trouvères.'),
      mc(L04, 4, 3, 'Guillaume de Machaut is best known as a figure of:', ['Ars Nova, a fourteenth-century style with new rhythmic flexibility', 'Early opera in Florence', 'Romantic nationalism', 'Minimalism'], 'The name means new art.', 'Machaut, around 1300 to 1377, was the leading composer of the Ars Nova.'),
      tf(L04, 5, 3, 'Machaut\'s Messe de Nostre Dame is often described as the earliest complete Mass ordinary attributed to a single composer.', 0, 'Consider why this work is famous.', 'It is commonly described this way, which makes it a landmark of the fourteenth century.'),
      // L05
      tf(L05, 1, 1, 'Ottaviano Petrucci published an early collection of polyphonic songs printed with movable type in Venice in 1501.', 0, 'Think of the Odhecaton.', 'Petrucci\'s Harmonice Musices Odhecaton of 1501 is a famous early printed music collection.'),
      mc(L05, 2, 1, 'Josquin des Prez was admired as a leading composer of the:', ['Renaissance', 'Baroque', 'Romantic era', 'Minimalist era'], 'He lived around 1450 to 1521.', 'Josquin was widely regarded as the leading composer of his time in the Renaissance.'),
      mc(L05, 3, 2, 'A madrigal is best described as:', ['A secular piece for a few voices that often paints the meaning of words', 'A solo for organ', 'A symphony for orchestra', 'A chant sung by monks'], 'It was often a poem set to music.', 'Madrigals set poems for a few voices and often illustrate individual words in the music.'),
      mc(L05, 4, 2, 'Palestrina\'s church music became a model of:', ['Clear, balanced counterpoint', 'Atonal harmony with no key center', 'Jazz improvisation', 'Electronic sound'], 'It was taught to students for centuries.', 'His smooth, balanced polyphony became a teaching model for counterpoint.'),
      tf(L05, 5, 2, 'Printing made music cheaper and helped styles travel faster across Europe.', 0, 'Compare printed copies to hand copying.', 'Printed copies cost less than manuscripts, which spread music and let amateurs buy it.'),
      // L06
      tf(L06, 1, 1, 'Monteverdi\'s L\'Orfeo, first performed in 1607, is regarded as the first great opera.', 0, 'It was staged in Mantua.', 'L\'Orfeo is widely regarded as the first great opera.'),
      mc(L06, 2, 1, 'Opera began around 1600 in which country?', ['Italy', 'England', 'Russia', 'United States'], 'Think of Florence, Mantua and Venice.', 'Opera arose in Italian cities around 1600.'),
      mc(L06, 3, 2, 'What happened in Venice in 1637?', ['The first public opera house opened', 'Printing of music began', 'The piano was invented', 'The first symphony was performed'], 'It meant ticket buyers could attend.', 'Opening of the first public opera house made opera available to paying audiences.'),
      mc(L06, 4, 2, 'Francesca Caccini\'s La liberazione di Ruggiero is usually described as:', ['The earliest surviving opera by a woman', 'The first Mass setting in four voices', 'A ragtime piano piece', 'A symphony for chorus'], 'It dates from 1625.', 'Caccini\'s 1625 work is usually described as the earliest surviving opera by a woman.'),
      tf(L06, 5, 3, 'Barbara Strozzi published volumes of her own vocal music in Venice.', 0, 'This was unusual for a woman at the time.', 'Strozzi published several volumes of cantatas and arias under her own name.'),
      // L07
      tf(L07, 1, 1, 'Bach and Handel were both born in 1685 in Germany.', 0, 'They were born weeks apart.', 'Both were born in 1685 in German towns, Bach in Eisenach and Handel in Halle.'),
      mc(L07, 2, 1, 'Which composer wrote The Four Seasons?', ['Vivaldi', 'Purcell', 'Handel', 'Haydn'], 'He worked in Venice.', 'Vivaldi\'s Four Seasons violin concertos were published in 1725.'),
      mc(L07, 3, 2, 'Basso continuo consists of:', ['A bass line with chords filled in on keyboard or similar instrument', 'A solo flute without accompaniment', 'A group of unaccompanied voices', 'A recorded drum track'], 'It is the Baroque foundation.', 'Continuo pairs a bass instrument with a chord-playing instrument such as harpsichord or organ.'),
      mc(L07, 4, 2, 'Handel\'s Messiah, a work for chorus and orchestra in English, premiered in:', ['Dublin in 1742', 'Vienna in 1786', 'Paris in 1913', 'Leipzig in 1523'], 'It is an oratorio.', 'Messiah first performed in Dublin in 1742.'),
      tf(L07, 5, 2, 'Purcell\'s Dido and Aeneas is a Baroque opera by an English composer.', 0, 'He lived around 1659 to 1695.', 'Dido and Aeneas, from around 1689, is a landmark of English opera.'),
      // L08
      tf(L08, 1, 1, 'The church was the main patron of music in the Middle Ages.', 0, 'Consider where singers worked.', 'Monasteries and cathedrals employed singers and fostered notation and polyphony.'),
      mc(L08, 2, 1, 'Who built the first piano around 1700?', ['Bartolomeo Cristofori', 'Antonio Stradivari of Cremona', 'Johannes Gutenberg of Mainz', 'Thomas Edison of Menlo Park'], 'He worked in Italy.', 'Cristofori\'s instrument could play soft and loud, hence pianoforte.'),
      mc(L08, 3, 2, 'Haydn spent decades in the service of which patron family?', ['Esterhazy', 'Medici', 'Habsburg-Lorraine only', 'Wagner'], 'They were based in Hungary.', 'Haydn was employed by the Esterhazy family for much of his career.'),
      mc(L08, 4, 2, 'Which hall opened in Vienna in 1870?', ['The Musikverein', 'Carnegie Hall', 'The Festspielhaus', 'Teatro San Cassiano'], 'It is named for a music society.', 'The Musikverein opened in 1870; Carnegie Hall opened in New York in 1891.'),
      tf(L08, 5, 3, 'Valves for brass instruments in the early nineteenth century made it easier to play all the notes.', 0, 'Consider the problem of natural horns and trumpets.', 'Valves allowed brass players to play full scales, and the modern orchestra grew richer.'),
      // L09
      tf(L09, 1, 1, 'A symphony usually has four movements.', 0, 'Think of the Classical symphony.', 'The Classical symphony typically has four movements.'),
      mc(L09, 2, 1, 'The three parts of sonata form are:', ['Exposition, development, recapitulation', 'Overture, recitative, aria and final chorus', 'Verse, chorus, bridge', 'Prelude, fugue, coda'], 'The themes are presented, played with, and returned.', 'Sonata form presents themes, develops them, then brings them back.'),
      mc(L09, 3, 2, 'Haydn is often called the father of the:', ['Symphony and string quartet', 'Piano sonata and the pipe organ', 'Opera and ballet', 'Concerto and fugue'], 'He wrote more than one hundred.', 'Haydn is often called this, though he did not invent either alone.'),
      mc(L09, 4, 2, 'Which opera is by Mozart?', ['The Marriage of Figaro', 'Rigoletto', 'Aida', 'Dido and Aeneas'], 'It premiered in 1786.', 'Mozart wrote The Marriage of Figaro (1786) and The Magic Flute (1791).'),
      tf(L09, 5, 2, 'The Classical era grew alongside Enlightenment ideas of reason, order and clarity.', 0, 'Think of the era\'s values.', 'Clarity and balance in Classical music reflected Enlightenment ideals.'),
      // L10
      tf(L10, 1, 1, 'Beethoven continued to compose after he lost his hearing.', 0, 'Think of the late works.', 'He kept composing, including his Ninth Symphony and late quartets, although he could not hear them.'),
      mc(L10, 2, 1, 'Beethoven\'s Symphony No. 9 includes in its last movement:', ['A chorus and soloists', 'A jazz band playing in the pit', 'A synthesizer part for an electronic keyboard', 'A solo theremin accompanied by strings'], 'It sets Schiller\'s poem.', 'The finale adds voices singing words from Schiller\'s Ode to Joy.'),
      mc(L10, 3, 2, 'Beethoven was born in which city?', ['Bonn', 'Salzburg', 'Leipzig', 'Paris'], 'He later moved to Vienna.', 'He was born in Bonn and moved to Vienna.'),
      mc(L10, 4, 2, 'How many piano sonatas did Beethoven write?', ['32', '9', '104', '600'], 'The number is also standard in the repertory.', 'He wrote 32 piano sonatas.'),
      tf(L10, 5, 3, 'Beethoven\'s Eroica Symphony, from 1804, was shorter and simpler than symphonies before it.', 1, 'Consider its scale.', 'The Eroica was much longer and more dramatic than earlier symphonies.'),
      // L11
      tf(L11, 1, 1, 'Franz Schubert wrote more than 600 songs for voice and piano.', 0, 'He is famous for Lieder.', 'Schubert composed more than 600 Lieder in his short life.'),
      mc(L11, 2, 1, 'Chopin wrote almost exclusively for:', ['The piano', 'The organ', 'The symphony orchestra', 'The guitar'], 'He lived in Paris.', 'Chopin\'s music is for piano: nocturnes, etudes, waltzes, mazurkas and polonaises.'),
      mc(L11, 3, 2, 'Liszt created the symphonic poem, which is:', ['A one-movement orchestral work based on a story or idea', 'A cycle of songs for solo voice with piano accompaniment', 'A four-movement symphony', 'An opera with spoken dialogue'], 'It joins music with narrative.', 'The symphonic poem is a single-movement orchestral piece tied to a story or image.'),
      mc(L11, 4, 2, 'Robert Schumann and Clara Wieck married in:', ['1840', '1790', '1920', '1861'], 'It was early in the Romantic period.', 'They married in 1840.'),
      tf(L11, 5, 2, 'Schubert\'s Winterreise is a cycle of 24 songs on poems by Wilhelm Muller.', 0, 'It is a famous song cycle.', 'Winterreise sets 24 poems by Muller.'),
      // L12
      tf(L12, 1, 1, 'Brahms\'s A German Requiem uses German texts rather than the traditional Latin Mass.', 0, 'The title hints at the language.', 'Brahms chose German Biblical texts for his Requiem.'),
      mc(L12, 2, 1, 'Which opera is by Verdi?', ['La traviata', 'The Magic Flute', 'Dido and Aeneas', 'Porgy and Bess'], 'It premiered in 1853.', 'Verdi wrote Rigoletto, La traviata and Aida.'),
      mc(L12, 3, 2, 'A leitmotif is:', ['A short musical idea linked to a character, object or idea', 'A type of piano', 'A syncopated rhythm borrowed from early jazz bands in dance halls', 'A printed edition of a score'], 'Wagner used them extensively.', 'Wagner used leitmotifs that return and change through an opera.'),
      mc(L12, 4, 2, 'Wagner\'s Ring cycle was first performed complete in 1876 at:', ['Bayreuth', 'Carnegie Hall', 'Notre Dame', 'The Musikverein'], 'He had a theater built for it.', 'The Festspielhaus at Bayreuth opened for the first complete Ring in 1876.'),
      tf(L12, 5, 3, 'Verdi and Wagner were both born in 1813.', 0, 'They were exact contemporaries.', 'Verdi and Wagner were both born in 1813.'),
      // L13
      tf(L13, 1, 1, 'Musical nationalism uses folk songs, dances and stories of a composer\'s homeland.', 0, 'It is tied to national identity.', 'Nationalist composers drew on national and folk traditions.'),
      mc(L13, 2, 1, 'Dvorak\'s Symphony No. 9 is nicknamed:', ['From the New World', 'The Eroica Symphony', 'The Pastoral Symphony', 'The Unfinished Symphony'], 'He wrote it while living in New York.', 'It premiered in 1893 during his stay in the United States.'),
      mc(L13, 3, 2, 'Grieg composed incidental music for a play by:', ['Henrik Ibsen', 'William Shakespeare', 'Friedrich Schiller', 'Victor Hugo'], 'The play is Peer Gynt.', 'Grieg wrote music for Ibsen\'s Peer Gynt.'),
      mc(L13, 4, 2, 'Who orchestrated Mussorgsky\'s piano suite Pictures at an Exhibition in 1922?', ['Maurice Ravel', 'Claude Debussy', 'Johannes Brahms', 'Aaron Copland'], 'He was French.', 'Ravel\'s orchestration is the version most often heard.'),
      tf(L13, 5, 2, 'Tchaikovsky composed the ballets Swan Lake and The Nutcracker.', 0, 'He is a Russian composer.', 'Tchaikovsky wrote Swan Lake, The Sleeping Beauty and The Nutcracker.'),
      // L14
      tf(L14, 1, 1, 'Hildegard of Bingen is among the earliest composers in Western history whose name and music are firmly documented.', 0, 'She lived in the twelfth century.', 'Hildegard\'s music survives in large quantity with her name attached.'),
      mc(L14, 2, 1, 'Francesca Caccini worked at the court of which family in Florence?', ['Medici', 'Esterhazy', 'Habsburg', 'Gonzaga'], 'It was a famous banking family.', 'She served at the Medici court as a singer, teacher and composer.'),
      mc(L14, 3, 2, 'Barbara Strozzi is best known for:', ['Cantatas and arias, published under her own name', 'Symphonies', 'Film scores', 'Electronic works'], 'She was Venetian.', 'She published several volumes of vocal music.'),
      mc(L14, 4, 3, 'Which was a common barrier faced by women composers in earlier centuries?', ['Limited access to training, church posts and public performance', 'A ban on writing music for the piano', 'A rule that women could only compose in minor keys', 'A shortage of instruments'], 'Think about institutions.', 'Social and institutional limits made it hard to train and publish as professionals.'),
      tf(L14, 5, 3, 'Hildegard, Caccini and Strozzi all lived in the same century.', 1, 'Check their dates.', 'Hildegard lived in the twelfth century, while Caccini and Strozzi lived in the seventeenth.'),
      // L15
      tf(L15, 1, 1, 'Fanny Mendelssohn Hensel was the older sister of Felix Mendelssohn.', 0, 'Both were gifted musicians.', 'Fanny was born in 1805 and Felix in 1809.'),
      mc(L15, 2, 1, 'Clara Wieck Schumann was famous as a:', ['Concert pianist and composer', 'Opera singer only', 'Organ builder', 'Conductor of film orchestras'], 'She toured Europe for decades.', 'Clara was one of the leading pianists of her century and also composed.'),
      mc(L15, 3, 2, 'Amy Beach\'s Gaelic Symphony premiered in:', ['1896', '1721', '1933', '1976'], 'It is nineteenth century.', 'It premiered in 1896.'),
      mc(L15, 4, 2, 'Florence Price\'s Symphony No. 1 was played in 1933 by the:', ['Chicago Symphony Orchestra', 'Vienna Philharmonic', 'Boston Pops only', 'Paris Opera'], 'It is a Midwestern orchestra.', 'The Chicago Symphony performed it in 1933.'),
      tf(L15, 5, 3, 'Florence Price blended Romantic style with spirituals and dance rhythms.', 0, 'Think about her African American heritage.', 'Her music draws on spirituals and dance rhythms in a Romantic framework.'),
      // L16
      tf(L16, 1, 1, 'The term Impressionism first came from painting.', 0, 'Think of light and atmosphere.', 'It was borrowed from painting and applied to music by critics.'),
      mc(L16, 2, 1, 'Debussy\'s Prelude to the Afternoon of a Faun dates from:', ['1894', '1594', '1794', '1994'], 'It is at the turn of the twentieth century.', 'It premiered in 1894.'),
      mc(L16, 3, 2, 'The whole-tone scale:', ['Divides the octave into six equal steps', 'Has twelve notes in a fixed row', 'Uses only black piano keys', 'Is the major scale'], 'It sounds floating.', 'It is a scale of six notes each a whole step apart.'),
      mc(L16, 4, 2, 'Debussy heard which ensemble at the Paris Exposition of 1889?', ['A Javanese gamelan', 'A jazz band', 'A Gregorian choir', 'A synthesizer ensemble'], 'It involves gongs.', 'Javanese gamelan at the 1889 Exposition influenced his sense of color and texture.'),
      tf(L16, 5, 3, 'Debussy enthusiastically embraced the label Impressionist for his music.', 1, 'Remember his attitude.', 'He disliked such labels.'),
      // L17
      tf(L17, 1, 1, 'The Rite of Spring was first performed in Paris in 1913.', 0, 'It was staged by the Ballets Russes.', 'It premiered in Paris in 1913.'),
      mc(L17, 2, 1, 'Atonality means music:', ['Without a key center', 'Played very quietly', 'Using only the black keys', 'Without any rhythm'], 'Think of the word tonality.', 'Atonal music has no home key.'),
      mc(L17, 3, 2, 'Schoenberg developed the twelve-tone method in the:', ['Early 1920s', 'Early 1720s', 'Late 1950s', '1990s'], 'It followed his atonal works.', 'He formulated the method in the early 1920s.'),
      mc(L17, 4, 2, 'The Second Viennese School consisted of Schoenberg and his students:', ['Berg and Webern', 'Haydn and Mozart', 'Bartok and Kodaly', 'Reich and Glass'], 'They were in Vienna.', 'Alban Berg and Anton Webern were Schoenberg\'s students.'),
      tf(L17, 5, 2, 'Stravinsky wrote The Firebird before The Rite of Spring.', 0, 'Check the dates 1910 and 1913.', 'The Firebird is from 1910, The Rite of Spring from 1913.'),
      // L18
      tf(L18, 1, 1, 'Spirituals were created by enslaved African Americans.', 0, 'They are religious songs.', 'Spirituals arose among enslaved people in the American South.'),
      mc(L18, 2, 1, 'The Fisk Jubilee Singers were formed in:', ['1871', '1771', '1971', '1671'], 'After the Civil War.', 'They formed at Fisk University in Nashville in 1871.'),
      mc(L18, 3, 2, 'Scott Joplin\'s Maple Leaf Rag was published in:', ['1899', '1799', '1999', '1699'], 'It was a major sheet music hit.', 'It was published in 1899.'),
      mc(L18, 4, 2, 'A typical blues form lasts how many bars?', ['Twelve', 'Four', 'Thirty-two', 'Sixty-four'], 'It is called twelve-bar blues.', 'The standard blues has twelve bars.'),
      tf(L18, 5, 3, 'Blue notes are bent pitches between the usual piano notes.', 0, 'They give the blues its sound.', 'Blue notes are pitches bent between standard scale notes.'),
      // L19
      tf(L19, 1, 1, 'Improvisation is a central feature of jazz.', 0, 'Players invent melodies on the spot.', 'Jazz values improvised solos over a harmonic framework.'),
      mc(L19, 2, 1, 'Which city is a famous early center of jazz?', ['New Orleans', 'Vienna in Austria', 'Venice in Italy', 'Leipzig in Germany'], 'It is in Louisiana.', 'New Orleans was an early center of jazz.'),
      mc(L19, 3, 2, 'Duke Ellington was known as a:', ['Pianist, bandleader and composer', 'Opera tenor', 'Theremin player', 'Sitar master'], 'He led an orchestra for decades.', 'Ellington composed for his orchestra and treated jazz as composer\'s art.'),
      mc(L19, 4, 2, 'Thomas A. Dorsey is widely called the father of:', ['Gospel music', 'Grand opera in Europe', 'Bebop jazz in New York', 'Minimalism in America'], 'He wrote Precious Lord, Take My Hand.', 'Dorsey is widely called the father of gospel music.'),
      tf(L19, 5, 3, 'Gospel combines spirituals with blues-influenced feeling and rhythm.', 0, 'It is sacred and expressive.', 'Gospel draws on both spirituals and blues-influenced style.'),
      // L20
      tf(L20, 1, 1, 'Gershwin\'s Rhapsody in Blue premiered in 1924.', 0, 'Paul Whiteman led the concert.', 'The premiere took place in 1924 with Gershwin at the piano.'),
      mc(L20, 2, 1, 'Charles Ives earned his living in:', ['Insurance', 'Opera singing', 'Military bands', 'Film studios'], 'He composed on the side.', 'Ives worked in the insurance business.'),
      mc(L20, 3, 2, 'Copland\'s Appalachian Spring uses which Shaker tune?', ['Simple Gifts', 'Amazing Grace', 'Ode to Joy', 'Maple Leaf Rag'], 'It premiered in 1944.', 'Copland quoted Simple Gifts in Appalachian Spring.'),
      mc(L20, 4, 2, 'Porgy and Bess is an opera by:', ['George Gershwin', 'Aaron Copland of Brooklyn', 'Charles Ives of Connecticut', 'Scott Joplin of Texarkana'], 'It dates from 1935.', 'Gershwin wrote Porgy and Bess in 1935.'),
      tf(L20, 5, 3, 'Ives\'s music sometimes layers different rhythms or keys at the same time.', 0, 'Think of two bands passing.', 'Ives layered hymns, marches and folk tunes in simultaneous rhythms and keys.'),
      // L21
      tf(L21, 1, 1, 'Cage\'s 4\'33\" asks the performer to play no notes for four minutes and thirty-three seconds.', 0, 'Listeners hear the room.', 'The performer plays nothing so that ambient sound becomes the music.'),
      mc(L21, 2, 1, 'A prepared piano has:', ['Objects placed between the strings', 'Extra keys added', 'An electric amplifier only', 'No strings'], 'Screws and rubber are used.', 'Cage placed objects between strings to change the sound.'),
      mc(L21, 3, 2, 'Who gave the first performance of 4\'33\" in 1952?', ['David Tudor', 'Steve Reich', 'Philip Glass', 'Duke Ellington'], 'He was a pianist.', 'David Tudor premiered it.'),
      mc(L21, 4, 3, 'Which Chinese text did Cage use for chance procedures?', ['I Ching', 'Analects', 'Tao Te Ching only', 'The Art of War'], 'It is a book of changes.', 'He used the I Ching to make chance decisions.'),
      tf(L21, 5, 3, 'Cage and the serialists such as Boulez both favored total control of every detail.', 1, 'One group gave up control.', 'Cage embraced chance, the opposite of serial control.'),
      // L22
      tf(L22, 1, 1, 'Minimalism builds music from repeating patterns that change gradually.', 0, 'Think of Reich and Glass.', 'Repetition and slow change define minimalism.'),
      mc(L22, 2, 1, 'Phasing is the technique in which:', ['Two identical patterns slowly drift out of sync', 'A piece is played backward', 'A melody is sung in Latin', 'Instruments are tuned a half step lower'], 'It appears in It\'s Gonna Rain.', 'Phasing makes identical loops shift against each other.'),
      mc(L22, 3, 2, 'Who wrote the opera Einstein on the Beach with Robert Wilson?', ['Philip Glass', 'Steve Reich of New York', 'John Cage of Los Angeles', 'Terry Riley of California'], 'It premiered in 1976.', 'Philip Glass created it with Robert Wilson.'),
      mc(L22, 4, 2, 'Terry Riley\'s In C dates from:', ['1964', '1864', '1764', '1984'], 'It is early minimalism.', 'It was written in 1964.'),
      tf(L22, 5, 3, 'Reich traveled to Ghana in 1970 to study drumming.', 0, 'African rhythm influenced him.', 'He studied drumming in Ghana in 1970.'),
      // L23
      tf(L23, 1, 1, 'Bartok and Kodaly collected folk songs in villages.', 0, 'They were Hungarian composers.', 'They gathered folk songs in the early twentieth century.'),
      mc(L23, 2, 1, 'Ravi Shankar is famous as a player of the:', ['Sitar', 'Theremin', 'Harpsichord', 'Gamelan'], 'He is an Indian classical musician.', 'Shankar was a sitar master.'),
      mc(L23, 3, 2, 'George Harrison used a sitar on the Beatles\' song:', ['Norwegian Wood', 'Yesterday, a string quartet song', 'Hey Jude, the long single', 'Let It Be, the piano ballad'], 'It was recorded in 1965.', 'Harrison played sitar on Norwegian Wood.'),
      mc(L23, 4, 3, 'Ethnomusicology is the study of:', ['Music in its cultural context', 'Only European art music', 'Instrument manufacturing', 'Concert hall acoustics'], 'It involves other traditions.', 'It studies music within its culture.'),
      tf(L23, 5, 3, 'Cross-cultural borrowing in music never raises questions of credit or payment.', 1, 'Think about fairness.', 'Credit, payment and respect are real, debated questions.'),
      // L24
      tf(L24, 1, 1, 'Thomas Edison demonstrated the phonograph in 1877.', 0, 'It recorded on a cylinder.', 'Edison\'s phonograph dates from 1877.'),
      mc(L24, 2, 1, 'Emile Berliner is associated with the:', ['Flat disc and gramophone', 'Magnetic tape and the reel recorder', 'The compact disc and the laser', 'The MP3 and digital downloads'], 'He developed it in the 1880s.', 'Berliner developed the disc and gramophone.'),
      mc(L24, 3, 2, 'Electrical recording with microphones became standard in the:', ['Mid-1920s', 'Mid-1880s', 'Mid-1960s', 'Mid-2000s'], 'It allowed crooning.', 'Microphones became standard in the mid-1920s.'),
      mc(L24, 4, 2, 'The LP was introduced by Columbia in:', ['1948', '1908', '1988', '1868'], 'It held about twenty minutes a side.', 'Columbia introduced the long-playing record in 1948.'),
      tf(L24, 5, 3, 'Multitrack recording let producers record parts separately and mix them later.', 0, 'Think of studio-built albums.', 'Multitrack tape made layered studio production possible.'),
      // L25
      tf(L25, 1, 1, 'Silent films were usually shown with live music.', 0, 'Think of theater pianists.', 'Pianists, organists or orchestras accompanied silent films.'),
      mc(L25, 2, 1, 'Which film from 1927 introduced sound to feature films?', ['The Jazz Singer', 'King Kong, with its giant ape', 'Psycho, the horror film', 'Star Wars, the space epic'], 'It starred Al Jolson.', 'The Jazz Singer led the move to sound.'),
      mc(L25, 3, 2, 'Max Steiner scored which 1933 film?', ['King Kong', 'Psycho', 'Star Wars', 'Citizen Kane'], 'A landmark early score.', 'Steiner scored King Kong in 1933.'),
      mc(L25, 4, 2, 'Bernard Herrmann\'s Psycho score is famous for:', ['Shrieking strings', 'A synthesizer lead', 'A solo guitar', 'A choir only'], 'It dates from 1960.', 'The score uses strings alone for terror.'),
      tf(L25, 5, 3, 'John Williams used themes for characters in Star Wars in the manner of Wagner\'s leitmotifs.', 0, 'He revived the big orchestra.', 'Williams linked themes to characters in 1977.'),
      // L26
      tf(L26, 1, 1, 'The theremin is played without touching the instrument.', 0, 'Hands move near antennas.', 'The performer\'s hands control pitch and volume near two antennas.'),
      mc(L26, 2, 1, 'Musique concrete builds music from:', ['Recorded real-world sounds', 'Only synthesized tones', 'Printed scores alone', 'Folk melodies'], 'Pierre Schaeffer developed it.', 'It manipulates recorded sounds, for example by tape editing.'),
      mc(L26, 3, 2, 'Switched-On Bach (1968) was performed on a:', ['Moog synthesizer', 'Harpsichord', 'Pipe organ', 'Theremin'], 'Wendy Carlos made it.', 'Carlos used a Moog synthesizer.'),
      mc(L26, 4, 2, 'MIDI was standardized in:', ['1983', '1883', '1783', '1993'], 'It lets instruments and computers talk.', 'The MIDI standard dates from 1983.'),
      tf(L26, 5, 3, 'A digital audio workstation is software for recording and editing music on a computer.', 0, 'It put a studio into a laptop.', 'That is the definition of a DAW.'),
      // L27
      tf(L27, 1, 1, 'Hip-hop began in the Bronx, New York, in the 1970s.', 0, 'It started at neighborhood parties.', 'DJs at Bronx parties began the culture.'),
      mc(L27, 2, 1, 'The breakbeat technique involves:', ['Extending instrumental breaks using two copies of a record', 'Slowing a record down to half speed', 'Recording on magnetic tape only', 'Adding a choir to a drum track'], 'DJ Kool Herc used it.', 'Using two copies lets the break repeat for dancers.'),
      mc(L27, 3, 2, 'Rapper\'s Delight, released in 1979, was by:', ['The Sugarhill Gang', 'Grandmaster Flash and the Furious Five', 'Public Enemy of Long Island', 'Run-DMC from Queens'], 'It reached a wide audience.', 'The Sugarhill Gang released it in 1979.'),
      mc(L27, 4, 2, 'The Roland TR-808 is a:', ['Drum machine', 'Sampler', 'Turntable', 'Radio'], 'It was introduced in 1980.', 'It supplied a deep bass drum and snare.'),
      tf(L27, 5, 3, 'A sampler records snippets of sound that producers replay in new tracks.', 0, 'Think of the Akai MPC.', 'Samplers let producers build tracks from pieces of recordings.'),
      // L28
      tf(L28, 1, 1, 'Printing helped spread musical styles across Europe starting with Petrucci in 1501.', 0, 'Printing made music cheaper.', 'Printed music spread widely and quickly.'),
      mc(L28, 2, 1, 'Which sequence matches changing music patrons in Europe?', ['Church, courts, public audiences', 'Public audiences, courts, church', 'Courts, radio, church', 'Radio, church, courts'], 'Think chronologically.', 'Patronage moved from church to court to the paying public.'),
      mc(L28, 3, 2, 'Which pair shows borrowing across traditions in this course?', ['Spirituals and blues feeding jazz', 'Opera replacing chant overnight', 'Printing replacing the piano', 'Silence replacing sound'], 'Think about influence.', 'Spirituals and blues fed jazz, gospel and later styles.'),
      mc(L28, 4, 2, 'Which is the best summary of how music changes?', ['New tools, audiences and ideas meet', 'Only through a single genius', 'Only through government order', 'Only through printing'], 'Look at the pattern of the course.', 'The course shows technology, patrons and ideas shaping music together.'),
      tf(L28, 5, 3, 'Women composers and Black musicians created major work, often with fewer opportunities.', 0, 'Recall earlier lessons.', 'Recovering these stories is still ongoing work.'),
    ],
  },
};
