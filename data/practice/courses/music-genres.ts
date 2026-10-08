import type { CourseModule } from '../courseModule';
import type { Question } from '../types';

// Write the correct choice FIRST; the helper rotates the choices (keeping their cyclic order) so the
// correct answer lands on a spread-out index.
const mc = (l: string, n: number, level: 1 | 2 | 3, prompt: string, choices: string[], hint: string, explanation: string): Question => {
  const target = (parseInt(l.slice(l.lastIndexOf('.l') + 2), 10) * 3 + n * 5) % 4;
  const shift = target;
  const rotated = choices.map((_, i) => choices[(i - shift + 4) % 4]);
  return { id: `${l}.q${n}`, lessonId: l, kind: 'mcq', prompt, choices: rotated, answer: target, hint, explanation, level };
};
const tf = (l: string, n: number, level: 1 | 2 | 3, prompt: string, answer: number, hint: string, explanation: string): Question =>
  ({ id: `${l}.q${n}`, lessonId: l, kind: 'tf', prompt, answer, hint, explanation, level });

const L = (n: number) => `music-genres.l${String(n).padStart(2, '0')}`;

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'music-genres',
    label: 'Music Genres: Deep Dives',
    blurb: 'From blues and jazz to hip-hop, house, salsa, Afrobeat and K-pop: where each genre came from, what defines its sound, which technology and people shaped it, and how to listen closely.',
    accent: '#FFD24A',
    framework: 'ncas',
    tracks: [
      {
        id: 'music-genres.t1',
        title: 'Roots of American Music',
        blurb: 'What a genre is, then the spirituals, blues, jazz and country traditions that much later music grew from.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L(1),
            title: 'What Is a Genre, and How Do You Listen to One?',
            blurb: 'A genre is a family of music sharing sound, habits and community, and its edges are always blurry.',
            minutes: 6,
            body: `A genre is a group of pieces of music that share enough features that listeners, performers and sellers treat them as belonging together. The shared features can be sound (instruments, rhythm, scales and chords), performance habits (improvising, dancing, singing along), the place and community where the music grew, and even how it is sold. No one definition fits every case, and genres overlap, split and merge constantly.

Labels are partly a business tool. In the 1920s American record companies marketed records by Black artists to Black listeners under the label "race records." In 1949 the trade magazine Billboard began using the term "rhythm and blues" instead. The music did not change overnight, but the name did, and names shape how music is shelved, advertised and remembered.

A practical way to listen to any genre is to ask five questions. What is the rhythm doing: is there a steady pulse you could tap, a swing, an offbeat? Which instruments lead, and which keep time? How is the voice used: spoken, sung, shouted, layered? How is the song built: does a short pattern repeat, or does it move through verses and a chorus? And what does the music seem to be for: dancing, worship, protest, storytelling, relaxing?

Try it on two songs you know that sound very different. Tap the pulse of each, name the lead instrument, and decide what each is for. You will already be doing what a music scholar does. Throughout this course, each lesson gives you these same questions with the genre's own answers.`,
          },
          {
            id: L(2),
            title: 'Spirituals and Gospel',
            blurb: 'Sacred songs of enslaved African Americans grew into the church music that shaped soul and rock.',
            minutes: 7,
            body: `Spirituals are religious songs created by enslaved African Americans in the United States. They were passed down by ear and have no single known composer. Typical features include call-and-response, in which a leader sings a line and the group answers, strong rhythmic clapping or stomping, and melodies that often use a pentatonic (five-note) scale. Many carried more than one meaning, expressing faith while also speaking of sorrow and the hope of freedom; scholars debate how often particular songs were used as coded messages, so be cautious of claims about specific secret codes.

In 1871 the Fisk Jubilee Singers, a student choir from Fisk University in Nashville, began touring to raise money for their school. They performed spirituals in concert arrangements for audiences in the United States and Europe, and helped make the songs known worldwide.

Gospel music, in the sense of the twentieth-century style, grew from these roots plus blues and jazz influences, mainly in Black churches in the 1920s and 1930s. Thomas A. Dorsey, a former blues pianist, is widely called the father of gospel music; he wrote "Take My Hand, Precious Lord" in 1932 after a deep personal loss. Mahalia Jackson became its most famous voice. Sister Rosetta Tharpe sang gospel with electric guitar playing that foreshadowed rock and roll.

Listen for the choir answering a lead singer, handclaps landing on beats two and four, and the organ and piano pushing the rhythm. When you later hear soul singers shout and ad-lib, you are hearing the church.`,
          },
          {
            id: L(3),
            title: 'The Blues',
            blurb: 'A form built on a repeating chord pattern and expressive "blue" notes became the bedrock of popular music.',
            minutes: 8,
            body: `The blues emerged among Black communities in the southern United States, especially in and around the Mississippi Delta, in the decades around 1900. It drew on work songs, field hollers, spirituals and other African American traditions. Its power comes from a simple, flexible structure combined with very personal expression.

The classic blues form is twelve measures long, usually in four-beat bars, and uses three chords built on the first, fourth and fifth notes of a scale. A common layout is four bars of the first chord, two of the fourth, two of the first, then one bar each of the fifth, fourth and first (variations are common). Lyrics often follow an AAB pattern: a line is sung, repeated, and then answered with a rhyming line. Singers and guitarists bend notes, especially the third, fifth and seventh steps of the scale, which are called blue notes.

Recorded blues began in the early 1920s. Mamie Smith's "Crazy Blues" (1920) is generally cited as the first blues hit record by a Black vocalist. W. C. Handy published "Memphis Blues" in 1912 and "St. Louis Blues" in 1914, bringing the form to sheet music. Bessie Smith became one of the great singers of the 1920s. Robert Johnson recorded in 1936 and 1937. After the Great Migration, Black musicians carried the music to cities; in Chicago, Muddy Waters and Howlin' Wolf plugged in electric guitars, recording for Chess Records.

To listen: count twelve bars, notice the repeated line, and hear how the guitar answers the voice.`,
          },
          {
            id: L(4),
            title: 'Jazz',
            blurb: 'A music of improvisation, swing and constant reinvention, from New Orleans to bebop and beyond.',
            minutes: 8,
            body: `Jazz grew in the early twentieth century, with New Orleans widely regarded as a central birthplace, drawing on blues, ragtime, marching band music and African American and Creole traditions. Its defining traits are improvisation, in which players invent melodies on the spot over a chord progression, swing (a rhythmic feel that lilts rather than ticking evenly), syncopation, and the interplay of the whole band. Early figures such as the cornetist Buddy Bolden are legendary, but no recordings of him survive, so claims about his sound are guesswork. The Original Dixieland Jass Band made what is commonly cited as the first jazz record in 1917.

Louis Armstrong's Hot Five and Hot Seven recordings of 1925 to 1928 made the improvised solo the center of the music. In the 1930s big bands led by Duke Ellington, Count Basie and others dominated the swing era, when jazz was dance music. In the 1940s Charlie Parker and Dizzy Gillespie helped develop bebop: faster, harmonically complex, and played for listening rather than dancing. Miles Davis's album Kind of Blue (1959) became a landmark of modal jazz, where players improvise over a few scales rather than rapidly changing chords. John Coltrane explored still freer territory.

How to listen:
- follow the "head," the written melody at the start
- hear each soloist take a turn
- notice how the drummer and bass respond
- and notice that no two performances of the same tune are the same.`,
          },
          {
            id: L(5),
            title: 'Country and Bluegrass',
            blurb: 'Rural Southern string-band and storytelling traditions became country, and bluegrass sharpened them into a virtuoso style.',
            minutes: 7,
            body: `Country music grew from the folk songs, ballads, hymns and dance tunes of rural white and Black Southerners, with strong African American contributions that were long underrecognized; the banjo itself has African roots. Recording and radio turned regional music into an industry. WSM radio in Nashville launched what became the Grand Ole Opry in the mid-1920s. In 1927 the producer Ralph Peer held recording sessions in Bristol, on the Tennessee-Virginia border, where Jimmie Rodgers and the Carter Family made early recordings; the sessions are often called the big bang of commercial country music.

Typical country features are a storytelling vocal, simple chords, and instruments such as acoustic guitar, fiddle and later pedal steel guitar. Hank Williams, who rose in the late 1940s, wrote songs of heartbreak and hardship in plain language. Later styles included the polished Nashville sound of the late 1950s and 1960s and the harder honky-tonk and outlaw country movements.

Bluegrass was developed in the mid-1940s by the mandolinist Bill Monroe and his band, the Blue Grass Boys. When the banjoist Earl Scruggs, with his three-finger picking style, joined with the guitarist Lester Flatt, the sound crystallized: fast tempos, acoustic instruments only (guitar, banjo, mandolin, fiddle, upright bass), tight harmony singing, and breakneck solos passed around the group.

Listen for the fiddle and banjo trading lines, and notice that in bluegrass there are no drums; the bass and the offbeat chop of the mandolin keep time.`,
          },
        ],
      },
      {
        id: 'music-genres.t2',
        title: 'Soul, Rock, Funk and Beyond',
        blurb: 'Rhythm and blues, rock and roll, funk, punk and metal: how electric guitars, backbeats and attitude took over popular music.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L(6),
            title: 'Rhythm and Blues and Soul',
            blurb: 'Gospel intensity met blues and dance rhythms, and soul became the sound of a generation.',
            minutes: 7,
            body: `In the 1940s, Black dance bands in American cities played punchy, blues-based music with a strong backbeat, the emphasis on beats two and four. Louis Jordan's small group, with its jump blues, was hugely popular, and the sound was marketed as rhythm and blues, the name Billboard adopted in 1949.

Soul music emerged in the 1950s and 1960s by blending R&B with gospel's vocal power and church-style call-and-response. Ray Charles is often credited as a pioneer; his 1954 recording "I Got a Woman" brought gospel feeling to secular lyrics, which some church audiences found controversial. Sam Cooke, who began in gospel, became a star in pop and soul. Aretha Franklin's 1967 recording of "Respect," a song Otis Redding had written and recorded in 1965, became an anthem, partly because of how she changed the arrangement and delivery.

Two record companies became synonymous with different soul sounds. Motown, founded in Detroit in 1959 by Berry Gordy, used polished arrangements, a house band, and a pop-friendly sound, with artists such as the Supremes, the Temptations and Marvin Gaye. Stax Records in Memphis favored a rawer, horn-driven sound, with Otis Redding, among others. The Atlantic label, working with studios in Muscle Shoals, Alabama, recorded many major soul sessions.

To listen:
- find the bass line, which often drives the song
- note the tambourine and snare locking on the backbeat
- and listen to how the singer bends and extends a phrase, a technique called melisma.`,
          },
          {
            id: L(7),
            title: 'Rock and Roll',
            blurb: 'Blues, R&B, country and gospel blended into a loud, youthful sound built around electric guitar and a hard backbeat.',
            minutes: 7,
            body: `Rock and roll took shape in the United States in the early to mid-1950s, fusing rhythm and blues, country, gospel and pop. The phrase itself had been used in earlier songs, so it did not come from nowhere, and historians argue about which record was first. Sister Rosetta Tharpe's electric guitar gospel recordings of the 1940s are an important precursor.

The core sound is a band of electric guitar, bass and drums, a strong backbeat, and short, direct songs, often about love, cars, school and freedom. Chuck Berry combined guitar riffs with sharp storytelling in songs such as "Maybelline" (1955). Little Richard's "Tutti Frutti" (1955) delivered a pounding piano and a wild vocal. In Memphis, Sam Phillips of Sun Records recorded Elvis Presley's "That's All Right" in 1954. Bill Haley and His Comets' "Rock Around the Clock," recorded in 1954, became a major hit in 1955.

The story is also about race and money. In a segregated music industry, many Black pioneers were overshadowed when white artists recorded softer versions of their songs; Pat Boone's 1956 cover of "Tutti Frutti" is a well-known example. Rock and roll also helped create a youth culture with its own identity.

In the 1960s British bands such as the Beatles and the Rolling Stones, inspired by American blues and rock and roll, returned the music to the United States in what was called the British Invasion. To listen: the electric guitar riff is the hook, and the backbeat tells you to move.`,
          },
          {
            id: L(8),
            title: 'Funk',
            blurb: 'Funk makes rhythm the main event, with interlocking parts that all land on and around "the one."',
            minutes: 7,
            body: `Funk developed in the mid-1960s out of soul, R&B and jazz, and its central idea is groove. Instead of emphasizing chord changes and melody, funk builds tension from short, repeating patterns in which each instrument has a rhythmic role: a syncopated bass line, a choppy rhythm guitar, a tight drum pattern, and punchy horn stabs. The first beat of the measure, called "the one," receives special weight.

James Brown is the central figure. His 1965 hit "Papa's Got a Brand New Bag" and especially 1967's "Cold Sweat" are often cited as turning points, with the band playing short, percussive lines and Brown's voice working as another rhythm instrument. His drummers, including Clyde Stubblefield, whose break on "Funky Drummer" (recorded in 1969) was later sampled in countless hip-hop tracks, are among the most influential in popular music.

Sly and the Family Stone mixed funk with psychedelic rock and a message of unity. The Meters in New Orleans developed a distinctive, loose funk. In the 1970s George Clinton's Parliament and Funkadelic built an elaborate science-fiction world around heavy basslines, with the bassist Bootsy Collins and the keyboardist Bernie Worrell among their key players. Later, artists such as Prince fused funk with rock and pop.

To listen: ignore the singer for a minute and tap along with the bass. Notice how the guitar and drums leave gaps and how the groove stays locked in even while little else changes.`,
          },
          {
            id: L(9),
            title: 'Punk and New Wave',
            blurb: 'Fast, short, do-it-yourself rock reacted against excess, and new wave opened it to synthesizers and art.',
            minutes: 7,
            body: `Punk rock emerged in the mid-1970s in New York and London. It rejected what many young musicians saw as bloated, technically showy rock, and it valued speed, short songs, loud guitars, raw vocals and a do-it-yourself attitude: you did not need virtuosity to start a band, make a record or print a fanzine.

In New York, Patti Smith's Horses (1975) and the Ramones' debut album (1976) came out of the scene around the club CBGB. The Ramones played songs of around two minutes built on simple, fast chords. In London, the Sex Pistols released "Anarchy in the U.K." in 1976 and the Clash blended punk with reggae and other styles on their 1979 album London Calling. Punk was also political and confrontational, and it was often met with hostility from authorities and the press.

New wave was a broad term for related but often more polished and experimental music from roughly 1977 onward. Bands such as Talking Heads, Blondie, Elvis Costello and the Attractions, and the Cars used catchy melodies, quirky lyrics and increasingly synthesizers. Post-punk bands such as Joy Division went darker and more atmospheric.

The legacy is huge: independent record labels, underground touring circuits, and later styles such as hardcore, alternative rock and pop punk. To listen: count how short the songs are, hear how few chords are used, and notice that energy matters more than polish.`,
          },
          {
            id: L(10),
            title: 'Heavy Metal',
            blurb: 'Distorted power chords, thunderous drums and virtuoso solos created a loud genre with many branches.',
            minutes: 7,
            body: `Heavy metal arose in Britain and the United States in the late 1960s and early 1970s, growing out of blues rock, with louder, heavier and more distorted guitars. Black Sabbath, from Birmingham, England, released their debut album in 1970; the title song builds on an ominous, tritone-based riff and helped define the dark atmosphere of the genre. Led Zeppelin and Deep Purple were also major hard rock influences.

The signature sound is the power chord, a simple two-note chord played with heavy distortion, together with a thick bass, double kick drums, and loud, dramatic vocals. Guitar solos often show off speed and technical skill. Judas Priest refined the look and sound in the late 1970s, while the New Wave of British Heavy Metal, which included Iron Maiden, brought fast tempos and twin guitar harmonies around 1980.

In the early 1980s, thrash metal appeared in the United States, led by bands such as Metallica, Slayer, Megadeth and Anthrax, combining punk speed with metal complexity. Extreme branches followed: death metal, with growled vocals, and black metal, which emerged strongly in Norway in the early 1990s. Doom metal slows everything down; power metal adds fantasy themes and soaring vocals.

Metal communities are famously loyal, with distinctive fashion and live culture. Critics have often attacked its lyrics, though many fans see its dark themes as storytelling or catharsis. To listen: pick out the riff, the pattern the guitar repeats, and notice how the drums lock to it.`,
          },
        ],
      },
      {
        id: 'music-genres.t3',
        title: 'Reggae, Dub and Hip-Hop',
        blurb: 'Caribbean sound-system culture and Bronx block parties, and the shared tools that turned DJs and producers into composers.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L(11),
            title: 'Ska, Rocksteady and Reggae',
            blurb: 'Jamaica slowed and reshaped the beat in three steps, then sent reggae around the world.',
            minutes: 7,
            body: `Jamaican popular music grew from local folk traditions, American R&B heard on radio, and the island's own studios and sound systems. Ska arrived in the late 1950s and early 1960s: a fast, bright style with the guitar or piano playing short chords on the offbeats. Around 1966 the tempo dropped into rocksteady, with a stronger bass line and smooth vocal harmonies. By the late 1960s reggae had emerged. The name is usually linked to the Toots and the Maytals song "Do the Reggay" (1968).

The sound of reggae has several fingerprints. The guitar or keyboard plays a short chop on the offbeats, called the skank. The bass is melodic and prominent, often the lead instrument. The drums frequently use a pattern called one drop, in which the emphasis falls on the third beat of the measure, leaving the first beat quiet. The tempo is relaxed, which gives the bass room to breathe.

Many reggae lyrics address social justice, poverty and spirituality. Rastafari, a religious movement that began in Jamaica in the 1930s, shaped the outlook of many artists. Bob Marley and the Wailers became its global ambassadors after Chris Blackwell's Island Records released Catch a Fire in 1973. Jimmy Cliff starred in the 1972 film The Harder They Come, whose soundtrack introduced reggae to many listeners abroad.

To listen: find the quiet first beat, follow the bass line, and notice the skank chopping on the "and" between beats.`,
          },
          {
            id: L(12),
            title: 'Sound Systems, Toasting and Dub',
            blurb: 'Jamaican DJs and engineers treated the studio itself as an instrument, a method that reshaped modern production.',
            minutes: 8,
            body: `In Kingston, Jamaica, from the 1950s, outdoor dances were powered by sound systems: mobile rigs of turntables, amplifiers and huge speakers run by figures such as Duke Reid and Clement "Coxsone" Dodd. Competition between systems drove them to find exclusive records, and then to produce their own. A DJ on the microphone would talk over the music, a style known as toasting. U-Roy became one of its most celebrated practitioners in the late 1960s.

Dub grew from a practical habit. Producers pressed the B-side of a single as a "version," the track without the lead vocal, so DJs could talk over it. Engineers such as King Tubby and Lee "Scratch" Perry then began remixing these versions live on the mixing console. They dropped instruments in and out, boosted the bass and drums, and added echo and reverb to others, turning the song into a sculpted soundscape. The mixing desk became an instrument.

These ideas traveled. Clive Campbell, known as DJ Kool Herc, was born in Kingston and moved to the Bronx, New York, as a boy; he brought sound-system culture there, and it fed into the beginnings of hip-hop. Later, dub's techniques of remixing, echo and bass emphasis influenced UK dub, jungle, dubstep and electronic music in general.

To listen: pick a dub track and notice the vocal appear and disappear, the echo trailing off, and the snare drum thrown into space. You are hearing the engineer perform.`,
          },
          {
            id: L(13),
            title: 'Hip-Hop: Origins and the Four Elements',
            blurb: 'Block parties in the Bronx produced a culture with four arts: DJing, MCing, breaking and graffiti.',
            minutes: 8,
            body: `Hip-hop began in the early 1970s in the South Bronx in New York City, in a community of Black, Caribbean and Latino young people facing poverty and disinvestment. A party held by DJ Kool Herc at 1520 Sedgwick Avenue on August 11, 1973 is widely cited as a founding moment, and the date is celebrated by many as hip-hop's birthday.

Hip-hop is a culture with four classic elements. DJing is playing and manipulating records. MCing, or rapping, is rhythmic speech over a beat. Breaking, or breakdancing, is the acrobatic dance style. Graffiti writing is visual art. Some also add knowledge and others add further elements.

A key technique was the breakbeat. Kool Herc noticed that dancers loved the short drum-only sections, or breaks, of funk and soul records. Using two copies of the same record on two turntables, he could switch back and forth to extend the break indefinitely. Grandmaster Flash refined this with precision cutting, and Afrika Bambaataa drew on a wider range of records, including electronic music.

Early MCs started by hyping the crowd and became lyricists. The Sugarhill Gang's "Rapper's Delight" (1979) was the first rap single to become a widespread commercial hit. Grandmaster Flash and the Furious Five's "The Message" (1982) showed rap could describe the hardship of city life.

To listen: hear how the beat loops, notice the rhythm of the words against it (called flow), and think about how the turntable became a musical instrument.`,
          },
          {
            id: L(14),
            title: 'Hip-Hop Eras and Production',
            blurb: 'Samplers, drum machines and regional scenes shaped hip-hop from the old school to the streaming era.',
            minutes: 8,
            body: `Hip-hop is often described in eras, though the boundaries are loose. The old school of the late 1970s and early 1980s featured party rhymes and DJs. The golden age of the late 1980s and early 1990s brought creative variety: Run-DMC's hard beats (and their 1986 collaboration with Aerosmith on "Walk This Way"), Public Enemy's dense, politically charged production, Rakim's intricate flow, and A Tribe Called Quest's jazz-influenced sound. In the early 1990s regional styles flourished, including Dr. Dre's G-funk on The Chronic (1992) on the West Coast. From the 2000s, the American South, especially Atlanta, became a center of trap, with fast hi-hats, heavy 808 bass and dark synthesizers. In the streaming era, artists can reach audiences worldwide without major-label support.

Production tools define the sound. The Roland TR-808 drum machine, released in 1980, supplied booming bass drums and crisp claps. Samplers let producers record a snippet of an existing record, such as a drum break, and loop or rearrange it; the Akai MPC, introduced in 1988, became a standard instrument. Producers chop samples, layer drums, and add bass and effects.

Sampling raised legal and ethical questions. In 1991 a U.S. court ruled against rapper Biz Markie in a case about an uncleared sample, and the industry shifted to licensing samples and paying the original artists.

To listen: separate the drums from the bass, identify what is looped, and ask whether the producer made the sound or found it.`,
          },
        ],
      },
      {
        id: 'music-genres.t4',
        title: 'Disco, House, Techno and Pop',
        blurb: 'Dance floors and synthesizers: how club music was built, and how pop kept absorbing everything.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L(15),
            title: 'Disco',
            blurb: 'Born in underground clubs, disco turned the dance floor and the 12-inch single into an art form.',
            minutes: 7,
            body: `Disco took shape in the early 1970s in New York City clubs frequented by Black, Latino and gay communities, where DJs kept the music going for hours. David Mancuso's private parties at the Loft, which began in 1970, were an early model. The DJ, not the live band, became the star, and the aim was uninterrupted dancing.

The core sound is a steady four-on-the-floor kick drum on every beat, hi-hats opening on the offbeat, a prominent melodic bass line, rhythmic guitar, and lush orchestral strings and horns, often topped by powerful vocals. Tempos around 110 to 130 beats per minute suited dancing. The extended 12-inch single, with long instrumental sections, let DJs mix one record into the next.

Donna Summer's "I Feel Love" (1977), produced by Giorgio Moroder and Pete Bellotte, used synthesizers for the entire backing track and pointed toward electronic dance music. Chic, led by Nile Rodgers and Bernard Edwards, made "Good Times" (1979), whose bass line was widely sampled later. The 1977 film Saturday Night Fever brought disco to mass audiences.

A backlash followed. On July 12, 1979, a "Disco Demolition Night" promotion at Chicago's Comiskey Park ended in a riot. Many have argued that the backlash had racist and homophobic undertones, though motives varied. Disco did not disappear: its techniques fed house music, and its influence continues in pop.

To listen: feel the kick on every beat, then the hi-hat answering in between, and notice the bass line's melody.`,
          },
          {
            id: L(16),
            title: 'House Music',
            blurb: 'Chicago DJs and drum machines rebuilt disco as a stripped-down, repeating dance music.',
            minutes: 7,
            body: `House music emerged in Chicago in the early 1980s. The name is commonly traced to the Warehouse, the Chicago club where DJ Frankie Knuckles played from 1977. After disco's mainstream collapse, DJs in Black and gay club communities kept dance music alive. They extended and edited records, then began making their own tracks, often with inexpensive drum machines and synthesizers, such as the Roland TR-808 and TR-909.

The core is a four-on-the-floor kick drum, typically around 118 to 130 beats per minute, with hi-hats, claps, a repeating bass line and sampled or synthesized elements. Vocals, soulful in many tracks, may be sparse. Tracks are built for DJs: long intros and outros so that one record can be blended into the next.

Variants quickly multiplied. Acid house is built around the squelchy, twisting sound of the Roland TB-303 bass synthesizer; the Phuture track "Acid Tracks" (1987) is a landmark. Marshall Jefferson was another key Chicago producer. New York's garage tradition, linked with the Paradise Garage club, brought gospel-influenced vocals. House crossed to Britain by the late 1980s, fueling the rave scene and the so-called Second Summer of Love in 1988, and it became a global genre that influenced pop.

To listen: count the steady kick, find the bass loop that never stops, and notice how the track changes by adding and subtracting layers rather than by changing chords.`,
          },
          {
            id: L(17),
            title: 'Techno',
            blurb: 'Detroit producers imagined a machine-made, futuristic music that went on to fill clubs worldwide.',
            minutes: 7,
            body: `Techno originated in Detroit, Michigan, in the mid-1980s. Three friends from the suburb of Belleville, Juan Atkins, Derrick May and Kevin Saunderson, are often called its pioneers. They were shaped by funk and electro, by European synthesizer music such as Kraftwerk, and by the experience of living in a city whose auto industry was in decline, which gave their futuristic sound a particular urgency.

Techno is built from electronic instruments: drum machines, synthesizers and sequencers that play patterns automatically. It is typically instrumental, with a steady four-on-the-floor kick, tempos often between 120 and 150 beats per minute, and repeating, evolving patterns that develop slowly. Derrick May's "Strings of Life" (1987) is a landmark that used string sounds in a driving rhythm. A 1988 compilation called Techno! The New Dance Sound of Detroit introduced the genre, and the name, to the British public.

Techno found an especially enthusiastic home in Germany after the fall of the Berlin Wall in 1989; the Berlin club Tresor, which opened in 1991, became a center. Underground Resistance, a Detroit collective formed in the late 1980s, mixed the music with political messages about technology and anonymity. Later styles ranged from minimal techno to harder, faster forms.

To listen: notice how little changes from moment to moment, and how small shifts in filter, rhythm or texture become exciting. The track is a machine you hear evolve.`,
          },
          {
            id: L(18),
            title: 'Ambient and the Wider World of Electronic Dance',
            blurb: 'Music designed to fill a space rather than demand attention, and the rave-era styles that raced to the other extreme.',
            minutes: 7,
            body: `Ambient music treats sound as atmosphere. Brian Eno popularized the term in the late 1970s, releasing Ambient 1: Music for Airports in 1978, with a wider release in 1979. It uses slowly shifting textures, long tones, little or no rhythm, and no strong melody, so that it can be background or deep listening. Forerunners include the French composer Erik Satie's idea of furniture music, minimalist composers, and German electronic groups such as Tangerine Dream and Kraftwerk. Aphex Twin's Selected Ambient Works 85-92 (released in 1992) showed ambient could come from the dance-music world. Many clubs added a "chill-out" room where dancers could rest to ambient sounds.

Electronic dance music splintered in the 1990s. In Britain, rave culture produced jungle and then drum and bass, with very fast breakbeats, around 160 to 175 beats per minute, and heavy sub-bass. Trance used long melodic builds and tempos around 130 to 140. Dubstep, from London in the early 2000s, slowed to around 140 with deep, wobbling bass, owing much to dub. In the 2010s a commercial wave, called EDM in the United States, brought large festivals and mainstream pop crossovers.

All of these rely on common tools: synthesizers, samplers, drum machines, sequencers and increasingly software on a laptop. Tempo is a handy way to tell them apart: slower for ambient and dubstep, mid for house and techno, fast for drum and bass.

To listen: guess the tempo by tapping, then notice what holds your attention when there is no song structure to follow.`,
          },
          {
            id: L(19),
            title: 'Pop Through the Eras',
            blurb: 'Pop is not one sound but whatever is most broadly popular, constantly borrowing from every genre in this course.',
            minutes: 7,
            body: `Popular music means music made to reach a wide audience, and pop describes a style defined by catchy melodies, memorable hooks, clear structures and production polished to fit the moment. Because it follows the audience, pop keeps borrowing from other genres.

Before recordings, the sheet-music publishers of New York's Tin Pan Alley sold songs to a mass market. In the early 1960s, writers working in the Brill Building and artists signed to Motown crafted short, polished hits. The Beatles and the British Invasion moved pop toward self-written songs. Billboard's Hot 100 chart launched in 1958 and became a main scoreboard.

The music video changed the game when MTV launched on August 1, 1981. Michael Jackson's Thriller (1982) and Madonna became global stars in the video era. Dance and synthesizer pop dominated the 1980s. In the late 1990s, Swedish writer-producer Max Martin helped shape a very hook-driven sound used by boy bands and pop stars. Pitch-correction software, introduced as Auto-Tune in 1997, was noticed by the public when used as a vocal effect on Cher's "Believe" (1998), and it became both a corrective tool and a style.

Digital downloads and then streaming reshaped how songs are made: short intros, quick hooks, and global collaboration. Hip-hop and Latin influences dominate many modern charts.

To listen: identify the hook, how soon it arrives, and which older genre the production secretly borrows from.`,
          },
        ],
      },
      {
        id: 'music-genres.t5',
        title: 'Latin Traditions',
        blurb: 'Rhythms and forms from Cuba, Brazil, the Río de la Plata, Colombia and Puerto Rico, and how they traveled.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L(20),
            title: 'Salsa',
            blurb: 'Cuban son, Puerto Rican traditions and New York energy combined in a rhythm-driven dance music.',
            minutes: 7,
            body: `Salsa took shape in New York City in the 1960s and 1970s, among Puerto Rican and other Caribbean and Latin American musicians. Its foundation is Cuban son, a form that combined Spanish song traditions with African-derived percussion, along with other Cuban dance styles and Puerto Rican forms such as plena and bomba, plus the harmonies and brass arrangements of jazz.

Its backbone is the clave, a two-bar rhythmic pattern of five notes that organizes the rest of the music; it can be played "3-2" or "2-3," and the other parts have to fit it. The rhythm section includes congas, bongos, timbales and a bass line that avoids the first beat, with a piano playing a repeating pattern called a montuno. The brass, usually trombones and trumpets, play punchy figures. The structure often moves from a verse to a call-and-response section, in which the lead singer improvises against a chorus, and instrumental solos.

Fania Records, founded in 1964 by Johnny Pacheco and Jerry Masucci, became the label most associated with the movement, and the Fania All-Stars featured stars including Celia Cruz, Willie Colón, Héctor Lavoe and Rubén Blades, whose lyrics often told stories of city life and social issues.

The word salsa itself is debated: some Cuban musicians argue it is a commercial label for music they simply called son. Both views are part of the history.

To listen: find the clave pattern, then notice how congas, bass and piano all lock to it.`,
          },
          {
            id: L(21),
            title: 'Bossa Nova',
            blurb: 'A hushed, harmonically subtle Brazilian style turned samba into chamber music for guitar and voice.',
            minutes: 7,
            body: `Bossa nova appeared in Rio de Janeiro in the late 1950s. The name roughly means "new trend" or "new wave." It grew from samba, Brazil's central popular music, but slowed and softened it, borrowing harmonic ideas from cool jazz while remaining distinctly Brazilian.

João Gilberto is considered its key figure. His guitar playing used a syncopated pattern in which the thumb keeps a steady bass while the fingers play chords against it, creating a gentle sway that suggests the samba beat in miniature. His singing was quiet and conversational, almost spoken. His recording of "Chega de Saudade," released in 1958 and followed by an album in 1959, is widely seen as the starting point. The composer Antonio Carlos Jobim and the poet and lyricist Vinicius de Moraes wrote many classics, in Portuguese, with sophisticated, jazz-flavored chords.

Bossa nova reached the United States in the early 1960s. The 1962 album Jazz Samba by Stan Getz and Charlie Byrd helped start a craze, and the 1964 album Getz/Gilberto, featuring João Gilberto, Jobim and, on vocals, Astrud Gilberto, included "The Girl from Ipanema," which became an international hit. Brazilian music continued to evolve afterward, for example with Tropicalia in the late 1960s.

To listen: concentrate on the guitar's off-kilter pattern, the unforced voice, and the unusual chords that seem to resolve in unexpected places.`,
          },
          {
            id: L(22),
            title: 'Tango',
            blurb: 'A music and dance of the Río de la Plata ports, from dance halls to concert hall.',
            minutes: 7,
            body: `Tango grew in the late nineteenth century in the port cities of Buenos Aires, Argentina, and Montevideo, Uruguay, along the Río de la Plata. These cities were growing quickly, receiving large numbers of European immigrants alongside people of African and local descent, and tango blended elements from several of these traditions, including the Cuban habanera and the Afro-Uruguayan and Afro-Argentine candombe. Its early venues were working-class neighborhoods, and its reputation was at first disreputable.

The instrumental centerpiece is the bandoneón, a type of button accordion developed in Germany and brought to Argentina, whose breathy, wistful tone is the sound of tango. A classic ensemble includes bandoneón, violin, piano and double bass. The music is rhythmically marked, with a strong, steady pulse and dramatic pauses, and often has a melancholy tone; lyrics are about love, loss and city life.

Carlos Gardel became tango's most famous singer in the 1920s and 1930s. In the 1950s and 1960s, the bandoneón player and composer Astor Piazzolla created "nuevo tango," blending the tradition with jazz and classical music, which was controversial among traditional tango dancers and ultimately widely respected. Tango is also a partner dance, danced in close embrace with improvised steps. UNESCO inscribed the tango of Argentina and Uruguay on its list of intangible cultural heritage in 2009.

To listen: find the bandoneón's sigh, notice the stop-and-start phrasing, and picture the dancers improvising to the pauses.`,
          },
          {
            id: L(23),
            title: 'Cumbia',
            blurb: 'A Colombian coastal blend of Indigenous, African and Spanish traditions became a pan-Latin-American music with many local versions.',
            minutes: 7,
            body: `Cumbia is rooted in the Caribbean coast of Colombia. Its traditional form is generally described as a combination of three heritages: Indigenous, African and Spanish. Indigenous flutes, such as the gaita, supplied melody; African-derived drums supplied the rhythm; and Spanish influences appear in the language and some melodic elements. Historians debate the details of its origin, and different communities have their own versions.

In the mid-twentieth century, Colombian bandleaders and record labels, such as Discos Fuentes, adapted cumbia to dance orchestras with horns, guitars and accordions, and made it a popular commercial music. Its rhythm has a gently rocking, repeating pattern that is easy to dance to, with a steady beat marked by percussion.

From Colombia it spread across Latin America and was reinvented in each place. In Peru, it blended with electric guitars and surf-like sounds to create chicha, also called Peruvian cumbia, from around the late 1960s. In Mexico, cumbia became a staple of popular dance music and was played by accordion-driven groups. In Argentina in the late 1990s, a harsher, working-class style called cumbia villera arose. Later fusions with electronic production produced digital cumbia.

The lesson is that a genre can be a family tree, not a single trunk. To listen: find the rocking rhythm, note which instrument carries the tune in each version (flute, accordion or electric guitar), and notice how the same pulse supports very different sounds.`,
          },
          {
            id: L(24),
            title: 'Reggaeton',
            blurb: 'A Caribbean beat that moved from Panama and Puerto Rico to the top of global charts.',
            minutes: 7,
            body: `Reggaeton developed mainly in Puerto Rico in the 1990s, with important roots in Panama and Jamaica. Panamanian artists such as El General rapped in Spanish over reggae rhythms in the late 1980s, in a style often called Spanish reggae. Puerto Rican producers and rappers combined those ideas with hip-hop and Caribbean dance music, performing in an underground scene before it reached the mainstream.

Its signature is the dembow rhythm. The name comes from the 1990 Jamaican track "Dem Bow" by Shabba Ranks, whose drum pattern was reused in countless reggaeton tracks. The beat is built from a steady kick drum on every beat, and a snare-like pattern of accents grouped in a 3+3+2 arrangement within each measure, giving a lilting, forward-leaning feel. Reggaeton typically uses drum machines, synthesizers and rapped or sung vocals in Spanish, often with a catchy, repeated hook.

Daddy Yankee's "Gasolina" (2004) was a breakthrough hit worldwide. Artists such as Don Omar and Tego Calderón extended the genre. In the 2010s and 2020s it merged with pop, trap and Latin pop; Luis Fonsi and Daddy Yankee's "Despacito" (2017) became one of the most-streamed songs ever, and Bad Bunny, from Puerto Rico, became one of the world's top artists.

Critics have debated lyrics about sex and gender in some reggaeton, while supporters point to its role in expressing Afro-Caribbean and Latino identity.

To listen: tap the kick on every beat and the 3+3+2 accents above it.`,
          },
        ],
      },
      {
        id: 'music-genres.t6',
        title: 'Africa, East Asia and Folk Worlds',
        blurb: 'Afrobeat and African popular styles, K-pop as an industry system, and the folk traditions beneath everything else.',
        level: 'ADVANCED',
        lessons: [
          {
            id: L(25),
            title: 'Afrobeat',
            blurb: 'Fela Kuti and Tony Allen fused highlife, jazz, funk and Yoruba music into political music for dancing.',
            minutes: 8,
            body: `Afrobeat was created in Nigeria in the late 1960s and 1970s, chiefly by the bandleader, saxophonist and singer Fela Kuti, together with the drummer Tony Allen. Fela, born in 1938, trained in London, and later spent time in the United States, where contact with Black American politics and the music of James Brown helped shape his ideas. In Lagos he blended West African highlife, jazz, funk and Yoruba musical traditions into a new sound.

The music is layered. A large band, such as Africa 70 and later Egypt 80, includes horns, electric guitars, bass, keyboards, several percussionists and a female chorus. Tony Allen's drumming, intricate yet relaxed, is the foundation. Songs are long, often ten minutes or more, building slowly from instrumental grooves, with call-and-response between Fela and the chorus, before the vocal enters. Lyrics, in English and Nigerian Pidgin, address corruption, military rule and social injustice.

Fela's political stance brought retaliation. In 1977 soldiers attacked his compound, which he called the Kalakuta Republic, and he was repeatedly arrested. He performed at his club, the Shrine, in Lagos, and died in 1997; his funeral drew huge crowds. His sons Femi and Seun Kuti continue the tradition.

Do not confuse Afrobeat with Afrobeats, with an s, the broad modern pop umbrella from Nigeria, Ghana and elsewhere that borrows from many styles including hip-hop and dancehall. To listen: let the groove establish itself, then notice how each instrument has its own repeated figure.`,
          },
          {
            id: L(26),
            title: 'African Popular Music: Highlife, Soukous and More',
            blurb: 'Guitars, horns and drums took many local forms across the continent, and "Afropop" is an outsider label for all of them.',
            minutes: 8,
            body: `Africa is not a single musical culture, and "Afropop" is a label that outsiders, mostly in Europe and North America, created for a diverse range of popular music. It helps to know the distinct regional styles.

Highlife developed in Ghana and Nigeria in the early twentieth century, blending local melodies and rhythms with brass band and dance-band instruments and guitar styles; E. T. Mensah of Ghana was a prominent figure. In Nigeria, juju developed among Yoruba musicians with talking drums and layered guitars; King Sunny Adé brought it international attention in the 1980s.

Congolese rumba grew from Cuban records that were popular in Central Africa, mixed with local music, and led to soukous, characterized by bright, interlocking, high-register guitars and a lively, danceable rhythm. Franco and Tabu Ley Rochereau were among its stars. In Senegal, Youssou N'Dour developed mbalax, built around the rhythms of sabar drums, with powerful vocals. From South Africa, singers Miriam Makeba and trumpeter Hugh Masekela became known internationally, and the vocal group Ladysmith Black Mambazo gained global fame.

Cultural exchange has been contested: Paul Simon's 1986 album Graceland, recorded with South African musicians, was praised by many but criticized by others because it was made during the cultural boycott of apartheid South Africa.

To listen: pay attention to the guitars, which often play several interlocking patterns, and to the drums, which may be talking drums or sabar rather than a drum kit.`,
          },
          {
            id: L(27),
            title: 'K-pop at Overview',
            blurb: 'South Korean pop is an industry system as much as a sound: training, choreography and global fan communities.',
            minutes: 8,
            body: `K-pop is South Korean popular music, but the term often refers to a specific production model that took shape in the 1990s. Seo Taiji and Boys, who debuted in 1992, are often seen as a turning point because they blended rap, rock and dance with new production in a market previously dominated by older styles. Entertainment companies such as SM Entertainment, founded in 1989 by Lee Soo-man, JYP and YG then developed the "idol" system, in which young people audition, join a company as trainees, and receive years of training in singing, dancing and often languages before debuting in a group.

Musically, K-pop is a blend rather than one genre. A single song may switch among pop, hip-hop, R&B and electronic dance music, with a rap verse, a big chorus and a dance break. Visual presentation is central: carefully synchronized choreography, high-quality music videos, and styled looks. Songs usually mix Korean with English phrases, and groups are marketed worldwide through social media.

Hallyu, the "Korean Wave," refers to the global spread of Korean pop culture. PSY's "Gangnam Style" (2012) was the first YouTube video to pass one billion views. BTS, who debuted in 2013, became one of the best-selling acts in the world. Passionate fan communities drive streaming, voting and merchandise.

Critics note the pressures of the trainee system on young performers and the demanding contracts of the early industry. To listen: separate the layers within one song, and notice how often the style changes.`,
          },
          {
            id: L(28),
            title: 'Folk Traditions',
            blurb: 'Songs carried by communities across generations, and the revivals that brought them to new audiences.',
            minutes: 8,
            body: `Folk music is the music of a community, passed along by memory and practice rather than by written scores, and changed a little by each singer. Typical features are simple melodies, acoustic instruments, local language and subjects such as work, love, history and everyday life. Every region has such traditions, from Irish dance tunes to Appalachian ballads to Andean pan-pipe music, and they are the soil from which many other genres in this course grew.

Collectors have played a major role in preserving them. Francis James Child collected English and Scottish ballads in the late nineteenth century, producing the Child ballads, over three hundred texts. In the United States, Alan Lomax made field recordings for the Library of Congress from the 1930s onward, documenting performers from many communities. Harry Smith's Anthology of American Folk Music (1952), compiled from commercial records of the 1920s and 1930s, inspired later revivalists.

In the 1950s and 1960s a folk revival drew new young audiences. Woody Guthrie, who wrote "This Land Is Your Land" in 1940, and Pete Seeger carried forward a tradition of songs about labor and justice, and Seeger helped popularize "We Shall Overcome." The Newport Folk Festival began in 1959. Bob Dylan, celebrated as a folk songwriter, performed with an electric band at Newport in 1965, a moment fans argued about for decades.

Questions of authenticity are central: who owns a traditional song? To listen: ask whether you can hear the singer's accent and place in the voice, and what story the song carries.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'music-genres',
    questions: [
      // L01
      tf(L(1), 1, 1, "Genres overlap and their boundaries are often blurry.", 0, "Think about whether music ever fits only one box.", "Genres are groupings made by listeners, performers and sellers, so they overlap and shift."),
      mc(L(1), 2, 1, "Which is NOT one of the five listening questions in the lesson?", ["What year was the song's composer born?","What is the rhythm doing, and is there a pulse to tap?","How is the voice used?","What does the music seem to be for?"], "The questions are about what you can hear and sense.", "The five questions cover rhythm, instruments, voice, structure and purpose, not biographical dates."),
      mc(L(1), 3, 2, "In 1949 Billboard began using which term in place of an earlier label for records by Black artists?", ["Rhythm and blues","Rock and roll revival","Contemporary soul music","Easy listening standards"], "The lesson names the replaced term 'race records'.", "Billboard adopted 'rhythm and blues' in 1949, an example of how labels change while music evolves."),
      mc(L(1), 4, 2, "Why does the lesson say genre labels are partly a business tool?", ["They shape how music is shelved, advertised and remembered","They are required by copyright law for every recording released","They fix a song's tempo","They decide who may perform a song"], "Think about record stores and marketing.", "Labels guide how music is sold and presented, not only how it sounds."),
      mc(L(1), 5, 3, "A listener taps the pulse, names the lead instrument and decides the music is for dancing. What are they doing?", ["Using the listening questions to analyze a genre", "Measuring a song's copyright term", "Transcribing it into notation", "Ranking it against pop hits"], "Match the actions to the five questions.", "Pulse, instrument and purpose are three of the five listening questions."),
      // L02
      tf(L(2), 1, 1, "Spirituals have a single known composer who wrote them all.", 1, "Consider how the songs were passed down.", "Spirituals were created and passed on by enslaved African Americans, mostly without known composers."),
      mc(L(2), 2, 1, "What is call-and-response?", ["A leader sings a line and the group answers","A choir sings in unison with no leader at any point","Two instruments play the same melody at once, one after the other","A silent pause left between each verse of the song"], "Think about a conversation in song.", "In call-and-response a leader's line is answered by the group."),
      mc(L(2), 3, 2, "Which group began touring in 1871 to raise money for their university?", ["The Fisk Jubilee Singers","The Carter Family","The Blue Grass Boys","The Mount Zion Gospel Choir"], "The university was in Nashville.", "The Fisk Jubilee Singers toured to fund Fisk University and spread spirituals worldwide."),
      mc(L(2), 4, 2, "Who is widely called the father of gospel music?", ["Thomas A. Dorsey","Ray Charles","Sister Rosetta Tharpe","Louis Jordan"], "He was a former blues pianist who wrote 'Take My Hand, Precious Lord'.", "Dorsey combined blues and jazz influences with church music and is widely called the father of gospel."),
      tf(L(2), 5, 3, "Scholars agree that every spiritual contained a specific secret code about escape routes.", 1, "The lesson advises caution about particular claims.", "Scholars debate how often particular songs were coded messages, so such claims should be treated cautiously."),
      // L03
      tf(L(3), 1, 1, "The classic blues form is twelve measures long.", 0, "The number is in the lesson title of the form.", "The twelve-bar blues is the classic structure."),
      mc(L(3), 2, 1, "What does an AAB lyric pattern mean?", ["A line is sung, repeated, then answered by a rhyming line","Three different lines in a row with no repetition at all, each rhyming","The chorus comes before every verse","Two singers alternate every word"], "Think about repetition then a response.", "In AAB, the first line repeats and the third line answers it."),
      mc(L(3), 3, 2, "What are 'blue notes'?", ["Bent notes, especially the third, fifth and seventh steps of the scale", "Notes only played on a piano", "The first note of every song", "Notes printed in blue ink"], "They involve bending pitch.", "Blue notes are expressive pitch bends on certain scale steps."),
      mc(L(3), 4, 2, "Which record is generally cited as the first blues hit record by a Black vocalist?", ["'Crazy Blues' by Mamie Smith (1920)","'Rapper's Delight' by the Sugarhill Gang (1979)","'I Feel Love' by Donna Summer (1977), a disco hit","'That's All Right' by Elvis Presley (1954)"], "It dates from the early 1920s.", "Mamie Smith's 'Crazy Blues' of 1920 is generally cited as the first."),
      mc(L(3), 5, 3, "Why did Muddy Waters and Howlin' Wolf matter to the blues in Chicago?", ["They helped bring electric guitars and amplified bands to the style", "They invented the twelve-bar form", "They wrote the first sheet music for it", "They stopped recording the blues"], "Think about technology and the move to cities.", "In Chicago they plugged in and recorded electric blues for Chess Records."),
      // L04
      tf(L(4), 1, 1, "Improvisation is a defining trait of jazz.", 0, "Players invent melodies on the spot.", "Improvised solos over a chord progression are central to jazz."),
      mc(L(4), 2, 2, "Which recordings made the improvised solo the center of jazz in the late 1920s?", ["Louis Armstrong's Hot Five and Hot Seven","Duke Ellington's Cotton Club radio broadcasts of the early 1930s","Miles Davis's Kind of Blue","John Coltrane's late works"], "They are named for the size of the band and date from 1925 to 1928.", "Armstrong's Hot Five and Hot Seven records focused on the soloist."),
      mc(L(4), 3, 2, "Which style, developed in the 1940s by Charlie Parker and Dizzy Gillespie, was fast and meant for listening?", ["Bebop","Swing-era dance band jazz","Early ragtime piano music","New Orleans Dixieland jazz"], "It came after the big-band swing era.", "Bebop was a fast, harmonically complex style played more for listening than dancing."),
      mc(L(4), 4, 3, "What does 'modal' jazz, as on Kind of Blue, emphasize?", ["Improvising over a few scales instead of rapidly changing chords", "Playing only on the drums", "Avoiding any improvisation", "Using only written melodies"], "Compare it with bebop's complicated chord changes.", "Modal jazz lets players improvise over a limited set of scales."),
      tf(L(4), 5, 3, "Recordings of the early cornetist Buddy Bolden survive and show exactly how he sounded.", 1, "The lesson says claims about his sound are guesswork.", "No recordings of Bolden survive, so descriptions of his sound are speculation."),
      // L05
      tf(L(5), 1, 1, "The banjo has African roots.", 0, "Country music had strong African American contributions.", "The banjo derives from African instruments, one reason the lesson stresses Black contributions."),
      mc(L(5), 2, 2, "Where did producer Ralph Peer hold the 1927 sessions where Jimmie Rodgers and the Carter Family recorded?", ["Bristol, on the Tennessee-Virginia border","Nashville, home of the Grand Ole Opry radio show","Memphis, on the Mississippi River in western Tennessee","New Orleans, at the mouth of the Mississippi River"], "It is a border town named in the lesson.", "The 1927 Bristol sessions are often called the big bang of commercial country music."),
      mc(L(5), 3, 2, "Who developed bluegrass in the mid-1940s with his band the Blue Grass Boys?", ["Bill Monroe","Hank Williams","Jimmie Rodgers","Earl Scruggs alone"], "He played the mandolin.", "Bill Monroe is credited with developing bluegrass; Scruggs joined his band."),
      mc(L(5), 4, 2, "Which instrument set is typical of a bluegrass band?", ["Guitar, banjo, mandolin, fiddle and upright bass","Electric guitar, synthesizer and drum machine","Electric guitar, piano, drums and a horn section","Bandoneon and violin"], "Bluegrass is acoustic and has no drums.", "Bluegrass uses acoustic string instruments and no drum kit."),
      mc(L(5), 5, 3, "What did Earl Scruggs contribute to bluegrass?", ["A three-finger banjo picking style","The first electric guitar built for country music","The Grand Ole Opry radio show on WSM","The pedal steel guitar and its slide technique"], "It involves how he plucked the banjo.", "Scruggs's three-finger style helped crystallize the bluegrass sound."),
      // L06
      tf(L(6), 1, 1, "In R&B the backbeat emphasizes beats two and four.", 0, "The lesson describes a punchy, strong backbeat.", "A strong backbeat on beats two and four is central to rhythm and blues."),
      mc(L(6), 2, 2, "Which musician's 1954 recording 'I Got a Woman' brought gospel feeling to secular lyrics?", ["Ray Charles","Otis Redding","Louis Jordan","Berry Gordy Jr."], "He is credited as a soul pioneer.", "Ray Charles blended gospel and R&B, which some church audiences found controversial."),
      mc(L(6), 3, 2, "Who wrote and first recorded 'Respect' before Aretha Franklin's 1967 version?", ["Otis Redding","Sam Cooke","Smokey Robinson","Ray Charles"], "He recorded it in 1965.", "Otis Redding wrote and recorded 'Respect' in 1965; Franklin's 1967 version transformed it."),
      mc(L(6), 4, 2, "Which label, founded in Detroit in 1959, was known for polished, pop-friendly arrangements?", ["Motown","Stax Records","Chess Records","Sun Records"], "Berry Gordy founded it.", "Motown, founded by Berry Gordy, used a house band and a polished sound."),
      mc(L(6), 5, 3, "How did Stax in Memphis differ from Motown, as described in the lesson?", ["It favored a rawer, horn-driven sound","It recorded only classical and opera music for concert halls","It never used horns","It sold only sheet music"], "Compare 'polished' with the opposite.", "Stax became known for raw, horn-driven soul."),
      // L07
      tf(L(7), 1, 1, "Historians agree on exactly which record was the first rock and roll song.", 1, "The lesson says historians argue about this.", "Because earlier records used similar sounds and the phrase, there is no agreed first record."),
      mc(L(7), 2, 2, "Which Memphis producer at Sun Records recorded Elvis Presley's 'That's All Right' in 1954?", ["Sam Phillips", "Berry Gordy", "Ralph Peer", "Chris Blackwell"], "He founded Sun Records.", "Sam Phillips recorded Elvis at Sun Records."),
      mc(L(7), 3, 2, "What core line-up defines the rock and roll sound?", ["Electric guitar, bass and drums with a strong backbeat", "String quartet and harpsichord", "Turntables and a drum machine", "Banjo and fiddle only"], "Think about the band format.", "A guitar, bass and drums band with a hard backbeat is the core."),
      mc(L(7), 4, 3, "What does Pat Boone's 1956 cover of 'Tutti Frutti' illustrate?", ["How white artists often overshadowed Black pioneers with softer versions","How rock and roll banned covers","That Little Richard never recorded the song and that Boone wrote it himself for radio","That the song was written by Boone"], "The lesson says the story is also about race and money.", "Cover versions by white artists often earned more than the Black originators."),
      tf(L(7), 5, 2, "The British Invasion bands were inspired by American blues and rock and roll.", 0, "Think of the Beatles and the Rolling Stones.", "British bands drew on American records and returned the music to the U.S. in the 1960s."),
      // L08
      tf(L(8), 1, 1, "Funk focuses more on rhythmic groove than on chord changes.", 0, "Groove is the central idea.", "Funk builds from short repeating patterns rather than moving harmony."),
      mc(L(8), 2, 1, "What does 'the one' refer to in funk?", ["The first beat of the measure, given special weight","The lead singer who counts the band in at the start of songs","A drum solo","The final chord"], "It is a beat position.", "Funk gives extra emphasis to the first beat of each measure."),
      mc(L(8), 3, 2, "Which James Brown record of 1967 is often cited as a turning point toward funk?", ["Cold Sweat","Respect Yourself","Rapper's Delight","I Feel Love"], "It is mentioned along with 'Papa's Got a Brand New Bag'.", "'Cold Sweat' is often cited as a key moment in the birth of funk."),
      mc(L(8), 4, 2, "Whose drum break on 'Funky Drummer' became widely sampled in hip-hop?", ["Clyde Stubblefield","Tony Allen","Nile Rodgers, the Chic guitarist","Bootsy Collins"], "He played in James Brown's band.", "Stubblefield's break from the 1969 recording was sampled countless times."),
      mc(L(8), 5, 3, "Which pair is correctly matched?", ["George Clinton - Parliament and Funkadelic", "Sly Stone - the Meters", "Bootsy Collins - Motown", "James Brown - bluegrass"], "Clinton led two linked groups.", "George Clinton led Parliament and Funkadelic; the Meters were a separate New Orleans band."),
      // L09
      tf(L(9), 1, 1, "Punk valued speed, short songs and a do-it-yourself attitude.", 0, "Think about not needing virtuosity.", "Punk rejected showy rock and encouraged anyone to start a band."),
      mc(L(9), 2, 2, "Which New York club is linked to the Ramones and Patti Smith scene?", ["CBGB", "Tresor", "The Warehouse", "The Loft"], "Its initials are in the lesson.", "CBGB was the center of New York's 1970s punk scene."),
      mc(L(9), 3, 2, "Which British band blended punk with reggae on London Calling (1979)?", ["The Clash", "The Ramones", "Talking Heads", "Blondie"], "The album name is a clue.", "The Clash's London Calling mixed punk with reggae and other styles."),
      mc(L(9), 4, 2, "What best describes new wave compared with early punk?", ["More polished and experimental, often with synthesizers", "Slower and entirely acoustic", "Made only by orchestras", "Banned from clubs"], "Think of Talking Heads and the Cars.", "New wave bands used catchy melodies, quirks and increasingly synthesizers."),
      mc(L(9), 5, 3, "Which is a lasting legacy of punk named in the lesson?", ["Independent labels and underground touring circuits", "The invention of the twelve-bar blues", "The creation of the sound system", "The 12-inch single"], "Consider the do-it-yourself ethic.", "Punk's DIY approach fed independent labels and touring networks."),
      // L10
      tf(L(10), 1, 1, "Black Sabbath released their debut album in 1970.", 0, "They are from Birmingham, England.", "Black Sabbath's debut appeared in 1970 and helped define metal."),
      mc(L(10), 2, 1, "What is a power chord?", ["A simple two-note chord played with heavy distortion", "A chord played only on a piano", "A chord with ten notes", "A chord played without any amplification"], "It is the signature guitar sound.", "Power chords with distortion are central to metal."),
      mc(L(10), 3, 2, "Which metal style combined punk speed with metal complexity in the early 1980s United States?", ["Thrash metal","Doom metal","Progressive metal","Acid house"], "Metallica and Slayer belong to it.", "Thrash metal fused punk speed with metal heaviness."),
      mc(L(10), 4, 2, "Which movement of around 1980 featured Iron Maiden and twin guitar harmonies?", ["The New Wave of British Heavy Metal","The two-tone ska revival in Coventry and London","The Motown sound out of Detroit studios","The Bristol sessions of 1927 in Tennessee"], "It is a British movement.", "Iron Maiden was part of the New Wave of British Heavy Metal."),
      mc(L(10), 5, 3, "What does doom metal do differently from thrash?", ["It slows everything down", "It removes all guitars", "It uses only acoustic instruments", "It plays only in major keys"], "Compare it with thrash's speed.", "Doom metal is defined by slow, heavy tempos."),
      // L11
      tf(L(11), 1, 1, "Ska came before rocksteady and reggae.", 0, "The lesson lists three steps in order.", "The order was ska, rocksteady, then reggae."),
      mc(L(11), 2, 2, "What is the 'skank' in reggae?", ["A short chop on the offbeats played by guitar or keyboard", "A drum solo", "A type of dance only", "The singer's shout"], "It is an instrument pattern.", "The skank is the offbeat chop that gives reggae its rhythmic feel."),
      mc(L(11), 3, 2, "In the one drop pattern, where does the drum emphasis fall?", ["On the third beat, leaving the first beat quiet","On every beat of the measure, equally, in steady quarter notes","Only on the first beat","Only on the offbeats between beats"], "The first beat is left quiet.", "One drop emphasizes the third beat of the measure."),
      mc(L(11), 4, 2, "Which song is usually linked to the name 'reggae'?", ["'Do the Reggay' by Toots and the Maytals","'Catch a Fire' by Bob Marley and the Wailers","'Respect' by Aretha Franklin, a 1967 soul anthem","'Gasolina' by Daddy Yankee, a 2004 reggaeton hit"], "It was released in 1968.", "'Do the Reggay' is usually linked to the origin of the word."),
      mc(L(11), 5, 3, "What helped introduce reggae to many listeners abroad around 1972 to 1973?", ["The film The Harder They Come and Island Records' Catch a Fire", "The first MTV broadcast", "The invention of the sampler", "The Bristol sessions"], "One is a film starring Jimmy Cliff.", "The 1972 film and the 1973 Island Records release helped globalize reggae."),
      // L12
      tf(L(12), 1, 1, "A sound system is a mobile rig of turntables, amplifiers and large speakers.", 0, "Kingston outdoor dances used them.", "Sound systems powered Jamaican dances from the 1950s."),
      mc(L(12), 2, 2, "What is toasting?", ["A DJ talking rhythmically over the music","Singing in tight harmony over a steady rhythm section","Playing a drum solo","Remixing a track on a desk"], "It happens on the microphone.", "Toasting is DJs talking over instrumental records, a forerunner of rapping."),
      mc(L(12), 3, 2, "What was a 'version' in Jamaican records?", ["The B-side without the lead vocal","A cover recorded by an artist from another country","A live recording of the sound system at a dance","A printed score handed out to the band"], "DJs used it to talk over.", "A version was the instrumental B-side, which engineers then remixed into dub."),
      mc(L(12), 4, 3, "Who are two engineers associated with dub's remixing on the console?", ["King Tubby and Lee 'Scratch' Perry","Berry Gordy and Sam Phillips","Juan Atkins, Derrick May and Kevin Saunderson","Duke Ellington and Count Basie"], "Both worked in Jamaica.", "King Tubby and Lee Perry treated the mixing desk as an instrument."),
      mc(L(12), 5, 3, "How did Jamaican sound-system culture reach hip-hop?", ["DJ Kool Herc, born in Kingston, brought it to the Bronx", "Through the invention of the 808", "Through disco clubs in Chicago", "Through the Fisk Jubilee Singers"], "Think of who moved from Kingston.", "Kool Herc's Jamaican background shaped Bronx party culture."),
      // L13
      tf(L(13), 1, 1, "Hip-hop began in the early 1970s in the South Bronx.", 0, "The place is in New York City.", "Hip-hop emerged in the South Bronx in the early 1970s."),
      mc(L(13), 2, 1, "Which is NOT one of the four classic elements of hip-hop?", ["Songwriting for orchestra","Disc jockeying with two turntables","Rhyming on the microphone as an MC","Breaking, the acrobatic street dance style"], "Think of DJ, MC, dancer and visual artist.", "The four elements are DJing, MCing, breaking and graffiti writing."),
      mc(L(13), 3, 2, "What is a breakbeat?", ["A short drum-only section of a record that is looped","A rest between two verses where all the instruments stop","A slow ballad","A guitar solo"], "Kool Herc used two copies of the same record.", "A break is a short percussion section that DJs extend by looping."),
      mc(L(13), 4, 2, "Which 1979 single was the first rap record to become a widespread commercial hit?", ["'Rapper's Delight'","'The Message'","'Walk This Way' by Run-DMC and Aerosmith","'Gasolina'"], "It is by the Sugarhill Gang.", "'Rapper's Delight' brought rap to a wide commercial audience."),
      mc(L(13), 5, 3, "Why was 'The Message' (1982) significant?", ["It showed rap could describe the hardship of city life", "It was the first drum machine record", "It introduced the 12-inch single", "It was a reggae song"], "Look at its lyrical subject.", "Grandmaster Flash and the Furious Five used rap for social observation."),
      // L14
      tf(L(14), 1, 1, "The Roland TR-808 drum machine was released in 1980.", 0, "It supplied booming bass drums.", "The 808 appeared in 1980 and became central to hip-hop and trap."),
      mc(L(14), 2, 2, "What does a sampler allow a producer to do?", ["Record a snippet of existing sound and loop or rearrange it","Print out sheet music for a whole orchestra from a recording","Remove all the bass","Tune a guitar automatically"], "Think about drum breaks.", "Samplers capture and rework recorded sound."),
      mc(L(14), 3, 2, "Which Dr. Dre album (1992) is linked to West Coast G-funk?", ["The Chronic", "Horses", "Thriller", "London Calling"], "The title refers to a plant slang word.", "The Chronic defined G-funk."),
      mc(L(14), 4, 3, "What did the 1991 court case involving Biz Markie contribute to?", ["A shift toward licensing samples and paying original artists", "The banning of rap", "The invention of the MPC", "The end of vinyl"], "It concerned an uncleared sample.", "The ruling pushed the industry toward sample clearance."),
      mc(L(14), 5, 3, "Which sound is typical of trap production from Atlanta?", ["Fast hi-hats, heavy 808 bass and dark synthesizers","Acoustic banjo and fiddle","Brass band marches played with sousaphones and snare drums","Bandoneon melodies"], "Think of the 2000s onward.", "Trap relies on rapid hi-hats, 808s and dark synths."),
      // L15
      tf(L(15), 1, 1, "Disco began in the early 1970s in New York clubs.", 0, "The Loft opened in 1970.", "Disco grew in New York clubs frequented by Black, Latino and gay communities."),
      mc(L(15), 2, 2, "What is 'four-on-the-floor'?", ["A kick drum on every beat","Four singers in close harmony at the front of the stage","A four-chord progression","A dance with four steps"], "It is a drum pattern.", "Four-on-the-floor places the kick on each beat."),
      mc(L(15), 3, 2, "Which 1977 track by Donna Summer used synthesizers for the whole backing?", ["'I Feel Love'", "'Good Times'", "'Respect'", "'Rapper's Delight'"], "Giorgio Moroder produced it.", "'I Feel Love' pointed toward electronic dance music."),
      mc(L(15), 4, 2, "What advantage did the 12-inch single give DJs?", ["Long instrumental sections for mixing into the next record", "Lower prices only", "No need for turntables", "Built-in vocals"], "Think about extended tracks.", "Longer versions made blending records easier."),
      mc(L(15), 5, 3, "What happened on July 12, 1979 at Comiskey Park?", ["Disco Demolition Night ended in a riot","The first house record was played","Saturday Night Fever premiered","Chic recorded Good Times at a New York studio"], "It was an anti-disco promotion.", "The event symbolized the disco backlash."),
      // L16
      tf(L(16), 1, 1, "The name 'house' is commonly traced to the Warehouse club in Chicago.", 0, "Frankie Knuckles played there.", "The Warehouse is the commonly cited origin of the name."),
      mc(L(16), 2, 2, "Which instrument is central to acid house?", ["The Roland TB-303 bass synthesizer","The bandoneon, a German button accordion","The pedal steel guitar and its slide bar","The talking drum of West Africa played under the arm"], "It makes a squelchy, twisting sound.", "The TB-303 defines acid house's sound."),
      mc(L(16), 3, 2, "Which typical tempo range fits house music?", ["Around 118 to 130 beats per minute","Around 60 beats per minute","Around 200 beats per minute or faster, at all times","No steady tempo"], "Compare with disco's 110 to 130.", "House commonly runs from about 118 to 130 BPM."),
      mc(L(16), 4, 3, "Why do house tracks have long intros and outros?", ["So DJs can blend one record into the next","To fill the time between radio news bulletins","Because the early tracks had no beat at all","To include long spoken stories about club nights"], "Think about DJing.", "They are designed for mixing."),
      mc(L(16), 5, 3, "What fueled the British rave scene's Second Summer of Love in 1988?", ["The arrival of house and acid house","The arrival of bluegrass","The release of Kind of Blue by Miles Davis","The Fisk Jubilee Singers"], "It followed house's move to Britain.", "House and acid house spread to Britain in the late 1980s."),
      // L17
      tf(L(17), 1, 1, "Techno originated in Detroit in the mid-1980s.", 0, "Think of the Belleville Three.", "Atkins, May and Saunderson helped create techno in Detroit."),
      mc(L(17), 2, 2, "Which European group influenced the Detroit pioneers?", ["Kraftwerk", "The Carter Family", "The Fisk Jubilee Singers", "The Sex Pistols"], "It is a German synthesizer band.", "Kraftwerk's electronic music influenced techno."),
      mc(L(17), 3, 2, "Which 1988 compilation introduced techno's name to Britain?", ["Techno! The New Dance Sound of Detroit","House Sound of Chicago: The Warehouse Sessions","The Harder They Come: Songs From the Original Film","Rave Anthems Vol. 2: The Second Summer of Love"], "The title names the city.", "The 1988 compilation presented Detroit techno to British audiences."),
      mc(L(17), 4, 3, "Why did Berlin become important to techno?", ["After the fall of the Berlin Wall in 1989 the city embraced it, and Tresor opened in 1991", "Because Detroit banned it", "Because it was invented there in 1950", "Because Kraftwerk was founded there in 1991"], "Consider the date 1989.", "Berlin's post-Wall scene and the Tresor club made it a hub."),
      mc(L(17), 5, 3, "What excites listeners in techno, according to the lesson?", ["Small shifts in filter, rhythm or texture","Large key changes between each section of the track","Spoken-word verses telling a story about city life","Guitar solos that build to a loud climax in each song"], "The pattern is repeated.", "Techno develops slowly through subtle changes."),
      // L18
      tf(L(18), 1, 1, "Brian Eno released Ambient 1: Music for Airports in the late 1970s.", 0, "He popularized the term ambient.", "Eno released it in 1978."),
      mc(L(18), 2, 2, "Which description fits ambient music?", ["Slowly shifting textures with little or no rhythm","Fast breakbeats at 170 beats per minute with heavy sub-bass","A strong verse-chorus structure","A solo singer with banjo"], "Think about atmosphere.", "Ambient uses long tones and slow change."),
      mc(L(18), 3, 2, "Which style features very fast breakbeats and heavy sub-bass, around 160 to 175 BPM?", ["Drum and bass","Dubstep","Ambient","Progressive trance"], "It grew from jungle.", "Drum and bass is much faster than house or dubstep."),
      mc(L(18), 4, 3, "Why is dubstep said to owe much to dub?", ["It emphasizes deep bass and echo-like space in the mix", "It uses the same drum kit", "It was made in Kingston in 1960", "It has no electronics"], "Think about bass and studio effects.", "Dubstep inherited dub's heavy bass and sound-shaping."),
      mc(L(18), 5, 3, "Which tool is a handy way to tell electronic styles apart?", ["Tempo", "Album cover color", "Length of the artist's name", "Number of band members"], "Think about speed.", "Different styles cluster in different tempo ranges."),
      // L19
      tf(L(19), 1, 1, "Pop is defined by a single fixed sound.", 1, "Pop follows the audience.", "Pop keeps borrowing from other genres, so no single sound defines it."),
      mc(L(19), 2, 2, "What launched on August 1, 1981 and changed pop?", ["MTV", "The Billboard Hot 100", "Auto-Tune", "The Motown label"], "It was a music video channel.", "MTV's launch elevated the music video."),
      mc(L(19), 3, 2, "Which chart launched in 1958?", ["Billboard Hot 100", "Grammy list", "MTV Top 20", "UK Singles Chart of 1958 only"], "It became a main scoreboard.", "The Hot 100 began in 1958."),
      mc(L(19), 4, 3, "Which 1998 song brought wide public attention to Auto-Tune as a vocal effect?", ["Cher's 'Believe'","Thriller","Gangnam Style by PSY","Despacito"], "The software was introduced in 1997.", "Cher's 'Believe' is a landmark in audible pitch correction."),
      mc(L(19), 5, 3, "How has streaming changed pop songwriting, according to the lesson?", ["Shorter intros and quicker hooks","Longer instrumental introductions before the first verse","No more choruses, only verses that never repeat","Only live performance, with no studio recordings at all"], "Think about attention.", "Quick hooks suit streaming listeners."),
      // L20
      tf(L(20), 1, 1, "Salsa took shape in New York City in the 1960s and 1970s.", 0, "Fania was founded in 1964.", "Salsa grew among Puerto Rican and Latin American musicians in New York."),
      mc(L(20), 2, 2, "What is the clave?", ["A two-bar five-note rhythmic pattern that organizes the music", "A brass instrument", "A kind of dance step", "A record label"], "Other parts must fit it.", "The clave is the rhythmic backbone."),
      mc(L(20), 3, 2, "Which Cuban form is the foundation of salsa?", ["Son", "Tango", "Bossa nova", "Reggae"], "It combined Spanish song and African percussion.", "Cuban son is salsa's foundation."),
      mc(L(20), 4, 2, "Which label, founded in 1964 by Johnny Pacheco and Jerry Masucci, is most associated with salsa?", ["Fania Records","Motown","Stax Records in Memphis","Chess"], "Its All-Stars included Celia Cruz.", "Fania became the label most linked to the salsa movement."),
      mc(L(20), 5, 3, "Why is the word salsa debated?", ["Some Cubans say it is a commercial label for what they called son", "It means a kind of rock", "It was invented in Brazil", "It has no meaning at all"], "The lesson mentions Cuban musicians.", "Some argue salsa is a marketing term for son."),
      // L21
      tf(L(21), 1, 1, "Bossa nova means roughly 'new trend' or 'new wave'.", 0, "Look at the first paragraph.", "The name roughly means new trend."),
      mc(L(21), 2, 2, "Who is considered the key figure of bossa nova guitar and singing?", ["João Gilberto", "Astor Piazzolla", "Carlos Gardel", "Celia Cruz"], "He recorded 'Chega de Saudade'.", "João Gilberto's guitar pattern and quiet voice defined the style."),
      mc(L(21), 3, 2, "Which form did bossa nova grow from?", ["Samba","Argentine tango","Colombian cumbia","Reggaeton"], "It is Brazil's central popular music.", "Bossa nova slowed and softened samba."),
      mc(L(21), 4, 3, "Which 1964 album included 'The Girl from Ipanema'?", ["Getz/Gilberto","Jazz Samba","The Chronic","Kind of Blue by Miles Davis"], "It features Astrud Gilberto.", "Getz/Gilberto included the international hit."),
      mc(L(21), 5, 3, "Which pair wrote many bossa nova classics?", ["Antonio Carlos Jobim and Vinicius de Moraes", "Fela Kuti and Tony Allen", "Bill Monroe and Earl Scruggs", "Chic's Rodgers and Edwards"], "One was a composer and one a poet.", "Jobim and de Moraes wrote many classics."),
      // L22
      tf(L(22), 1, 1, "Tango developed in the late nineteenth century along the Río de la Plata.", 0, "Think of Buenos Aires and Montevideo.", "Tango grew in these port cities."),
      mc(L(22), 2, 2, "Which instrument is tango's signature sound?", ["The bandoneón", "The sitar", "The banjo", "The steel pan"], "It is a button accordion from Germany.", "The bandoneón's breathy tone defines tango."),
      mc(L(22), 3, 2, "Who became tango's most famous singer in the 1920s and 1930s?", ["Carlos Gardel", "Astor Piazzolla", "Mamie Smith", "Louis Armstrong"], "He is a singer rather than an instrumentalist.", "Gardel was tango's biggest star."),
      mc(L(22), 4, 3, "What did Astor Piazzolla create?", ["Nuevo tango blending tradition with jazz and classical music", "The first rap record", "The clave pattern", "Bluegrass"], "He was a bandoneón player.", "Piazzolla's nuevo tango was controversial but later respected."),
      tf(L(22), 5, 2, "UNESCO inscribed the tango of Argentina and Uruguay on its intangible heritage list in 2009.", 0, "It was a joint recognition.", "UNESCO recognized the tango in 2009."),
      // L23
      tf(L(23), 1, 1, "Cumbia originates on the Caribbean coast of Colombia.", 0, "Think of three heritages.", "Cumbia's traditional roots are in coastal Colombia."),
      mc(L(23), 2, 2, "Which three heritages are traditionally said to combine in cumbia?", ["Indigenous, African and Spanish","Chinese, Arabic, Persian and Greek","Irish, Scottish and Welsh","Japanese, Korean and Thai"], "The lesson lists them first.", "Cumbia blends Indigenous, African and Spanish elements."),
      mc(L(23), 3, 2, "What is chicha?", ["Peruvian cumbia with electric guitars", "A Colombian flute", "A Mexican dance only", "A Cuban rhythm"], "It arose in Peru.", "Chicha blended cumbia with electric guitar sounds."),
      mc(L(23), 4, 3, "What does the lesson mean by 'a genre can be a family tree'?", ["The same pulse supports many local versions","Cumbia has only one version","It has to be sung in one language across all countries","It stopped changing in 1950"], "Think about variation across countries.", "Cumbia branched into many local styles."),
      mc(L(23), 5, 3, "Which Argentine style from the late 1990s is a harsher working-class form?", ["Cumbia villera","Chicha from Peru","Bossa nova","Salsa"], "It begins with the same word as the genre.", "Cumbia villera arose in Argentina."),
      // L24
      tf(L(24), 1, 1, "Reggaeton developed mainly in Puerto Rico in the 1990s with roots in Panama and Jamaica.", 0, "Spanish reggae mattered.", "Panamanian Spanish reggae and Jamaican sounds were key influences."),
      mc(L(24), 2, 2, "What is the dembow rhythm named after?", ["A 1990 Jamaican track by Shabba Ranks", "A Cuban dance", "A drum machine", "A Puerto Rican city"], "The title is 'Dem Bow'.", "Shabba Ranks's track supplied the pattern."),
      mc(L(24), 3, 2, "Which accent grouping is described for the dembow snare pattern?", ["3+3+2", "4+4", "2+2+2+2", "5+5"], "Count the beats in a measure.", "The pattern is 3+3+2 within the measure."),
      mc(L(24), 4, 2, "Which 2004 hit by Daddy Yankee was a worldwide breakthrough?", ["'Gasolina'", "'Despacito'", "'Believe'", "'Cold Sweat'"], "The title is a fuel.", "'Gasolina' brought reggaeton to the world."),
      mc(L(24), 5, 3, "Which 2017 song became one of the most-streamed ever?", ["'Despacito'", "'Gasolina'", "'Rapper's Delight'", "'Good Times'"], "It features Luis Fonsi and Daddy Yankee.", "'Despacito' was a streaming giant."),
      // L25
      tf(L(25), 1, 1, "Afrobeat was created chiefly by Fela Kuti and Tony Allen.", 0, "Fela led the band; Allen drummed.", "Fela Kuti and drummer Tony Allen are its key creators."),
      mc(L(25), 2, 2, "Which genres did Fela blend into Afrobeat?", ["Highlife, jazz, funk and Yoruba music","Bluegrass and tango from Argentina","Punk, heavy metal and early rock and roll","Ambient, techno and drum and bass from Britain"], "He heard James Brown and Nigerian styles.", "Afrobeat is a blend of West African and African American music."),
      mc(L(25), 3, 2, "What happened in 1977 to Fela's compound, the Kalakuta Republic?", ["Soldiers attacked it", "It became a record label", "It hosted Live Aid", "It was moved to London"], "It reflects his political conflict.", "The 1977 attack was a response to his political stance."),
      mc(L(25), 4, 3, "How do Afrobeat and Afrobeats differ?", ["Afrobeats is a broad modern pop umbrella, while Afrobeat is Fela's style", "They are the same", "Afrobeat is newer", "Afrobeats is only instrumental"], "Notice the s.", "Afrobeats with an s is a modern pop umbrella."),
      mc(L(25), 5, 3, "How are Afrobeat songs typically structured?", ["Long, building from instrumental grooves before the vocal enters", "Three-minute verse-chorus songs", "A single note held throughout", "A cappella only"], "They often last ten minutes or more.", "Songs are long and slow-building."),
      // L26
      tf(L(26), 1, 1, "'Afropop' was largely a label created by outsiders for diverse styles.", 0, "Africa is not one musical culture.", "The label covers many distinct regional styles."),
      mc(L(26), 2, 2, "Which style developed in Ghana and Nigeria in the early twentieth century, blending local music with brass and guitar?", ["Highlife", "Mbalax", "Soukous", "Bossa nova"], "E. T. Mensah is linked to it.", "Highlife blended local and imported instruments."),
      mc(L(26), 3, 2, "Which Senegalese artist developed mbalax?", ["Youssou N'Dour", "King Sunny Adé", "Franco", "Hugh Masekela"], "It is built around sabar drums.", "Youssou N'Dour is mbalax's most famous figure."),
      mc(L(26), 4, 3, "Soukous grew from which earlier influence?", ["Cuban records mixed with local music, as in Congolese rumba","Gregorian chant as sung in medieval European monasteries and cathedrals","Delta blues recorded in the Mississippi region of the United States","German brass bands brought by colonial administrators and missionaries"], "Cuban records were popular in Central Africa.", "Congolese rumba led to soukous."),
      mc(L(26), 5, 3, "Why was Paul Simon's Graceland (1986) controversial?", ["It was made during the cultural boycott of apartheid South Africa", "It used no African musicians", "It was never released", "It was a classical work"], "It involved South Africa.", "Critics argued it broke the boycott."),
      // L27
      tf(L(27), 1, 1, "K-pop is a single musical genre.", 1, "A song may switch among styles.", "K-pop mixes pop, hip-hop, R&B and electronic dance music."),
      mc(L(27), 2, 2, "Which group's 1992 debut is often seen as a turning point?", ["Seo Taiji and Boys","BTS","PSY","Girls' Generation, formed in 2007"], "They blended rap, rock and dance.", "Seo Taiji and Boys changed Korean pop."),
      mc(L(27), 3, 2, "What is the 'idol' system?", ["Trainees train for years before debuting in groups","Fans write and record all of the group's songs at home","Only solo artists perform, and they are never trained","A weekly radio chart ranking the most played songs in Korea"], "Think about training.", "Companies train young performers before debut."),
      mc(L(27), 4, 3, "What milestone did 'Gangnam Style' reach in 2012?", ["First YouTube video to pass one billion views","First Grammy for a K-pop group","First number one on Billboard in 1992","First K-pop album ever sold on vinyl in the United States"], "It concerns YouTube.", "It was the first to pass one billion views."),
      mc(L(27), 5, 3, "What does Hallyu mean?", ["The Korean Wave, the global spread of Korean pop culture", "A Korean drum", "A style of dance", "A record company"], "It describes a wave.", "Hallyu is the global spread of Korean pop culture."),
      // L28
      tf(L(28), 1, 1, "Folk music is typically passed on by memory and practice rather than written scores.", 0, "Think of oral transmission.", "Folk music is communal and orally transmitted."),
      mc(L(28), 2, 2, "Who collected English and Scottish ballads in the late nineteenth century?", ["Francis James Child","Alan Lomax","Harry Smith, the Anthology compiler","Pete Seeger"], "The ballads bear his name.", "The Child ballads are named for him."),
      mc(L(28), 3, 2, "What did Alan Lomax do for the Library of Congress from the 1930s?", ["Made field recordings of performers in many communities", "Wrote symphonies", "Invented the banjo", "Founded Motown"], "He worked in the field.", "Lomax documented traditional performers."),
      mc(L(28), 4, 2, "Which song did Woody Guthrie write in 1940?", ["'This Land Is Your Land'","'We Shall Overcome'","'Respect'","'Crazy Blues' by Mamie Smith"], "It is about the American land.", "Guthrie wrote 'This Land Is Your Land' in 1940."),
      mc(L(28), 5, 3, "What happened at Newport in 1965?", ["Bob Dylan performed with an electric band","The festival held its very first edition that year","Pete Seeger retired from performing at the festival","Harry Smith's Anthology of American Folk Music was released"], "Fans argued about it.", "Dylan's electric set was a famous controversy."),
    ],
  },
};
