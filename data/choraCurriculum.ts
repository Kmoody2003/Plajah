// ─────────────────────────────────────────────────────────────────────────────
// choraCurriculum.ts — Chora's music-history curriculum (Blueprint Part 4.2).
//
// Authored against the SHARED school chassis (services/schoolChassis.ts) and
// rendered by <SchoolView>. Six tracks carry a learner from the first two notes
// sounded together to the sample-cleared, streaming present:
//
//   1. The Development of Harmony
//   2. The Birth of Recorded Sound
//   3. Form & Structure
//   4. Rhythm & Groove
//   5. Sampling and the Law
//   6. A History of Popular Music
//
// Every lesson carries real teaching text, a listening assignment that opens in
// Chora's own player, and resources that point ONLY at genuinely free, legal
// sources: IMSLP, the Internet Archive, the Library of Congress (National
// Jukebox / American Folklife Center), Smithsonian Folkways, the UCSB Cylinder
// Audio Archive, and open-access theory texts.
//
// Standards: National Core Arts Standards (music) anchor codes, so completions
// write LearningRecords into the portable Academic Passport.
// ─────────────────────────────────────────────────────────────────────────────

import type { Curriculum } from '../services/schoolChassis';

const CHORA_ACCENT = '#E0A458';

/** Shorthand for the listening assignment every lesson ends on. */
const listen = (prompt: string) => ({ prompt, tool: 'CHORA' as const, postTag: 'choraschool' });

export const CHORA_CURRICULUM: Curriculum = {
  id: 'chora-history',
  label: 'The Chora Curriculum',
  blurb:
    'A history of music you can hear. Six tracks — harmony, recording, form, rhythm, sampling law and popular music — each lesson pairing a real explanation with something to go and listen to. Every score, recording and document linked here is free and legal.',
  accent: CHORA_ACCENT,
  framework: 'NCAS-Music',

  tracks: [
    // ═══════════════════════════════════════════════════════════════════════
    // 1. THE DEVELOPMENT OF HARMONY
    // ═══════════════════════════════════════════════════════════════════════
    {
      id: 'harmony',
      title: 'The Development of Harmony',
      blurb: 'From a single chanted line to the extended chords of jazz and the modal drift of modern pop — how music learned to sound more than one thing at a time.',
      level: 'FOUNDATION',
      lessons: [
        {
          id: 'harm-01',
          title: 'One Line, No Harmony: Plainchant',
          blurb: 'For most of recorded Western music history there was exactly one note at a time — and that was a deliberate aesthetic, not a limitation.',
          minutes: 14,
          standardIds: ['MU:Re7.2', 'MU:Cn11.0'],
          body: `Before harmony there was monophony: one melodic line, sung by everyone, unaccompanied. Gregorian chant — the liturgical repertory consolidated across the Frankish church in the 8th and 9th centuries — is the largest surviving body of it. A chant has no chords, no bar lines, no fixed tempo. Its rhythm follows the Latin text; its shape follows the meaning of the words.

What chant does have is mode. Rather than our two flavours (major and minor), the medieval church recognised eight modes, each defined not just by its scale but by its final (the note it comes to rest on) and its reciting tone (the note it hovers around). Dorian on D, Phrygian on E, Lydian on F, Mixolydian on G, plus a "plagal" partner for each that sits lower in the voice. When you hear a modern film composer reach for Phrygian to signal menace or Lydian to signal wonder, they are borrowing this vocabulary.

Notation appears in this repertory too, and it appears because of scale. When one church in Aachen had to sing what another church in Rome sang, oral transmission failed. Neumes — small marks above the text showing the shape of the melody — were the fix. By the 11th century Guido of Arezzo had added a staff with a coloured line fixing a pitch, and for the first time in history you could learn a melody you had never heard from a page.`,
          watchAlong: {
            title: 'Chant recordings in the public domain',
            url: 'https://archive.org/details/audio_music',
            note: 'Search the Internet Archive audio collection for "Gregorian chant" — the Solesmes-era 78s and many later public-domain recordings are streamable in full.',
          },
          assignment: listen('Find any Gregorian chant recording and listen twice. First time, just follow the line. Second time, try to identify the one note the melody keeps returning to — that is the reciting tone. Post which note you heard as home and what mood the mode gave the chant.'),
          resources: [
            { label: 'Internet Archive — free audio collection', url: 'https://archive.org/details/audio_music' },
            { label: 'Open Music Theory — modes (open access)', url: 'https://viva.pressbooks.pub/openmusictheory/' },
            { label: 'IMSLP — Gregorian chant scores', url: 'https://imslp.org/wiki/Category:Gregorian_Chant' },
          ],
        },
        {
          id: 'harm-02',
          title: 'Organum: The First Second Voice',
          blurb: 'Around the 9th century somebody sang a chant in parallel a fourth below. Western harmony starts there.',
          minutes: 15,
          standardIds: ['MU:Re7.2', 'MU:Cn11.0'],
          body: `The earliest surviving description of two-part singing is in the Musica enchiriadis, a treatise from the late 9th century. Its instruction is startlingly simple: take a chant, and have a second voice sing it in parallel at the interval of a fourth or a fifth below. That is parallel organum, and it is the beginning of Western polyphony.

Why fourths and fifths? Because of physics, not taste. Two pitches whose frequencies stand in a simple whole-number ratio — 2:1 for an octave, 3:2 for a fifth, 4:3 for a fourth — reinforce each other's overtones and sound fused rather than clashing. Medieval ears heard thirds (a messier 5:4) as mild dissonance. The consonance hierarchy we take for granted is a cultural settlement on top of an acoustic fact.

Over the next three centuries the second voice gained independence. By the Notre-Dame school in Paris around 1200 — Léonin and Pérotin — the lower voice was holding single chant notes for enormously long durations while two, three, even four upper voices ran florid melismas above them. This is the sound of Pérotin's Viderunt omnes: the chant is still there, stretched to the point of becoming a drone, and something entirely new is happening on top of it. Harmony has stopped decorating melody and started to become an event in its own right.`,
          assignment: listen('Listen to Pérotin\'s "Viderunt omnes" and to the plainchant version of the same text. Post the moment where you stop being able to hear the original chant as a melody and start hearing it as a bass note.'),
          resources: [
            { label: 'IMSLP — Pérotin scores', url: 'https://imslp.org/wiki/Category:P%C3%A9rotin' },
            { label: 'Wikipedia — Organum', url: 'https://en.wikipedia.org/wiki/Organum' },
            { label: 'Internet Archive — medieval music recordings', url: 'https://archive.org/details/audio_music' },
          ],
        },
        {
          id: 'harm-03',
          title: 'Counterpoint and the Renaissance Ideal',
          blurb: 'Josquin, Palestrina, and the century in which independent melodic lines became the highest art in Europe.',
          minutes: 16,
          standardIds: ['MU:Re7.2', 'MU:Re8.1'],
          body: `Counterpoint is the craft of writing two or more melodies that are individually satisfying and simultaneously coherent. In the 15th and 16th centuries this became the central discipline of European composition, and the imitative point — one voice states a phrase, the others enter with the same phrase at staggered intervals — became its signature gesture.

Josquin des Prez (c. 1450–1521) is the figure who made this expressive rather than merely clever. He matched musical gestures to text with a directness that startled his contemporaries; Martin Luther said other composers did what the notes wanted, but Josquin made the notes do what he wanted. Listen to "Ave Maria… virgo serena" and you can hear each phrase of text get its own imitative point, entries cascading through the voices like a wave.

Palestrina (c. 1525–1594) then codified the style so thoroughly that his practice became, and remains, the way counterpoint is taught. The famous rules — dissonance only on weak beats or properly prepared as a suspension, contrary motion preferred, no parallel fifths or octaves — are reverse-engineered descriptions of what Palestrina actually did, formalised by Johann Joseph Fux in Gradus ad Parnassum (1725). Haydn, Mozart and Beethoven all learned from Fux. Every counterpoint class since is downstream of one 16th-century Italian's habits.`,
          assignment: listen('Listen to Palestrina\'s "Sicut cervus" and follow ONE voice only for the whole piece — pick the tenor if you can find it. Post what you noticed about how that single line behaves when you stop hearing the piece as a block of chords.'),
          resources: [
            { label: 'IMSLP — Josquin des Prez (free scores)', url: 'https://imslp.org/wiki/Category:Josquin_Desprez' },
            { label: 'IMSLP — Palestrina (free scores)', url: 'https://imslp.org/wiki/Category:Palestrina,_Giovanni_Pierluigi_da' },
            { label: 'IMSLP — Fux, Gradus ad Parnassum', url: 'https://imslp.org/wiki/Gradus_ad_Parnassum_(Fux,_Johann_Joseph)' },
          ],
        },
        {
          id: 'harm-04',
          title: 'Tonality Arrives: Functional Harmony',
          blurb: 'How eight modes collapsed into two keys, and why the dominant chord wanting to resolve is the engine of 300 years of music.',
          minutes: 18,
          standardIds: ['MU:Re7.2', 'MU:Re8.1', 'MU:Cr1.1'],
          body: `Somewhere between 1600 and 1700 the modal system narrowed into the major/minor system, and a new idea took hold: chords have functions. In a key, the tonic (I) is home, the dominant (V) is the chord that most wants to return there, and the subdominant (IV) is the chord that sets up the dominant. The leading tone — the seventh degree, a semitone below the tonic — pulls upward so strongly that the V chord containing it feels physically unstable. Resolution is a real sensation, and functional harmony is the machine for producing it on demand.

The basso continuo made this practical. Baroque scores gave a bass line with figures under it — numbers telling a keyboard player which intervals to stack above each note. Harmony had become a shorthand, something you could specify without writing out. That is a conceptual leap: chords are now objects with names, not accidental byproducts of independent lines.

Rameau's Traité de l'harmonie (1722) supplied the theory. He argued that a chord retains its identity through inversion — that a C-E-G and an E-G-C are the same harmonic object — and that a bass line of chord roots (the fundamental bass) governs a piece's structure. This is why we can say "I–V–vi–IV" and everyone knows what we mean. It is also why the twelve-bar blues, a Nashville number chart and a jazz lead sheet all work: they are all Rameau's insight, three hundred years later.`,
          assignment: listen('Play any piece of Baroque or Classical music and try to feel the moment before the final chord — the tension of the dominant. Then play a modern pop song built on I–V–vi–IV. Post whether the pop song ever produces the same sense of arrival, and why you think that is.'),
          resources: [
            { label: 'IMSLP — Rameau, Traité de l\'harmonie (1722)', url: 'https://imslp.org/wiki/Trait%C3%A9_de_l%27harmonie_(Rameau,_Jean-Philippe)' },
            { label: 'Open Music Theory — harmonic function', url: 'https://viva.pressbooks.pub/openmusictheory/' },
            { label: 'IMSLP — J.S. Bach chorales', url: 'https://imslp.org/wiki/Category:Bach,_Johann_Sebastian' },
          ],
        },
        {
          id: 'harm-05',
          title: 'Bach, Temperament, and the Twelve Keys',
          blurb: 'Why you can modulate to any key at all — and why that required a compromise every note on a piano still carries.',
          minutes: 16,
          standardIds: ['MU:Re7.2', 'MU:Cn11.0'],
          body: `Pure intervals do not fit into an octave. Stack twelve perfect fifths (3:2) and you land very slightly higher than seven octaves — a discrepancy of about a quarter of a semitone called the Pythagorean comma. Something has to give. Every tuning system in history is a different answer to the question of where to hide that error.

Meantone temperament, standard through the Renaissance, hid it by narrowing most fifths so that thirds came out beautifully pure — but it left one horrifically out-of-tune "wolf" fifth, which meant remote keys were unusable. Well temperament, the 18th-century family of solutions, spread the error unevenly so that every key was playable but each key had its own distinct colour. Equal temperament, now universal on pianos, spreads the error perfectly evenly: every semitone is exactly the twelfth root of two. Every key becomes usable and every key becomes identical in character.

Bach's The Well-Tempered Clavier (Book I, 1722; Book II, 1742) is a prelude and fugue in every one of the twenty-four major and minor keys — twice. It is a demonstration, an encyclopaedia, and a teaching manual simultaneously. Note what it is not: proof that Bach used equal temperament. "Well-tempered" almost certainly meant an unequal well temperament in which E major genuinely sounded different from E-flat major. Something was lost when we standardised. We gained the freedom to modulate anywhere and we traded away the idea that keys have personalities.`,
          assignment: listen('Listen to the C major prelude from The Well-Tempered Clavier Book I, then the C-sharp minor fugue. Post what changes for you between the two keys — and whether you think key colour is real or learned.'),
          resources: [
            { label: 'IMSLP — The Well-Tempered Clavier, Book I (free score)', url: 'https://imslp.org/wiki/Das_wohltemperierte_Klavier_I,_BWV_846-869_(Bach,_Johann_Sebastian)' },
            { label: 'Wikipedia — Musical temperament', url: 'https://en.wikipedia.org/wiki/Musical_temperament' },
            { label: 'IMSLP — J.S. Bach complete works', url: 'https://imslp.org/wiki/Category:Bach,_Johann_Sebastian' },
          ],
        },
        {
          id: 'harm-06',
          title: 'Chromaticism and the Breaking of the Key',
          blurb: 'Wagner\'s Tristan chord, and the century in which harmony stopped resolving.',
          minutes: 17,
          standardIds: ['MU:Re7.2', 'MU:Re8.1'],
          body: `Romantic composers pushed functional harmony as far as it would go by exploiting its own logic. If the dominant seventh creates tension by containing a tritone, then chords that contain more ambiguous dissonances create more tension — and if you keep deferring the resolution, you keep the listener suspended.

Wagner's Tristan und Isolde (1859) opens with the most-analysed four notes in music. The Tristan chord — F, B, D-sharp, G-sharp — resolves not to a tonic but to another dominant-function chord, which itself does not resolve. The opera then spends four hours declining to settle. Because the chord can be read several ways at once (a half-diminished seventh, an altered French sixth, an appoggiatura cluster), no single analysis wins, and that ambiguity is the point: the music is about longing that cannot be satisfied, and its harmony literally cannot come to rest.

From there the road is short. Debussy dissolved function by treating chords as colours to be moved in parallel rather than progressions to be resolved. Schoenberg, having reached what he called "the emancipation of the dissonance", concluded around 1908 that if no chord requires resolution then the key itself has no work left to do, and by 1921 had built the twelve-tone method to organise music without one. Harmony's 900-year expansion had reached its own edge.`,
          assignment: listen('Listen to the Prelude to Tristan und Isolde, then Debussy\'s "Voiles". Post which one feels more unresolved to you and why — Wagner refuses to resolve, Debussy stops needing to. Are those the same experience?'),
          resources: [
            { label: 'IMSLP — Wagner, Tristan und Isolde (full score)', url: 'https://imslp.org/wiki/Tristan_und_Isolde,_WWV_90_(Wagner,_Richard)' },
            { label: 'IMSLP — Debussy, Préludes Book I', url: 'https://imslp.org/wiki/Pr%C3%A9ludes_(Book_1)_(Debussy,_Claude)' },
            { label: 'Wikipedia — Tristan chord', url: 'https://en.wikipedia.org/wiki/Tristan_chord' },
          ],
        },
        {
          id: 'harm-07',
          title: 'Blue Notes and the Other Harmonic Tradition',
          blurb: 'A parallel system that never asked permission from Rameau: bent thirds, dominant chords that are home, and harmony as friction.',
          minutes: 16,
          standardIds: ['MU:Re7.2', 'MU:Cn11.0'],
          body: `The blues broke a rule that European harmony treats as structural: in a twelve-bar blues, the I chord is often a dominant seventh. In functional harmony a dominant seventh must resolve. In the blues it is home. Three chords that all "want" to move somewhere sit still, and the tension never discharges — it becomes the texture.

The blue notes make this deeper. West African vocal traditions carried into the American South a practice of pitch inflection — bending the third, seventh and fifth degrees to microtonal positions between what a piano can play. On a guitar or a voice these are continuous slides; on a keyboard they are approximated by playing the flat and natural third together, which is why blues piano sounds like a crushed grace note. The scale is not "minor over a major chord" — that is a European rationalisation of something that was never built from a European scale in the first place.

Jazz then extended the chord upward. If a dominant seventh is stable, you can stack a ninth, an eleventh and a thirteenth on it and it is still stable; alter those extensions (flat nine, sharp eleven) and you get colour without collapse. By the time you reach Coltrane's "Giant Steps" (1960), harmony is moving through three tonal centres a major third apart at a tempo that leaves no time to hear any of them as home. Two traditions — European functional harmony and the African-American blues — had fused into something neither could have produced alone.`,
          assignment: listen('Listen to a slow blues, then to "Giant Steps". Post what stays constant between them. (Hint: it is not the chords — it is the relationship between the improviser and the harmony.)'),
          resources: [
            { label: 'Library of Congress — John & Ruby Lomax 1939 recordings', url: 'https://www.loc.gov/collections/john-and-ruby-lomax/' },
            { label: 'Smithsonian Folkways — blues collection', url: 'https://folkways.si.edu/explore' },
            { label: 'Wikipedia — Blue note', url: 'https://en.wikipedia.org/wiki/Blue_note' },
          ],
        },
        {
          id: 'harm-08',
          title: 'Modern Pop Harmony: Loops, Modes and the Four Chords',
          blurb: 'Why so much contemporary music circles rather than resolves — and why that is a choice, not a failure.',
          minutes: 15,
          standardIds: ['MU:Re7.2', 'MU:Re9.1', 'MU:Cr1.1'],
          body: `The dominant harmonic device of the last thirty years is the loop: a short chord cycle repeated without alteration for the length of the song. I–V–vi–IV is the famous one, but vi–IV–I–V, i–VI–III–VII and the "Axis" family all behave the same way. Crucially, a loop has no cadence. There is no arrival, because the end of the cycle is also its beginning. Music that loops is not weak tonal music; it is doing something tonal music cannot, which is to establish a stable environment inside which other things — rhythm, timbre, lyric, production — carry the drama.

Modal borrowing is the second big device. Mixolydian (a major scale with a flat seventh) removes the leading tone and therefore the pull to the tonic, which is why so much rock feels grounded rather than yearning. Aeolian and Dorian loops do the same in minor; Dorian's raised sixth gives it the bittersweet lift you hear across house, UK garage and much of Radiohead. None of this is new — it is medieval modality returning after tonality's three-century occupation.

The third device is that harmony has partly been replaced. In a lot of trap, drill and modern R&B the harmonic content is a single sustained minor pad or a two-chord oscillation, and the actual musical argument happens in the drum programming, the vocal arrangement and the low end. This is not harmonic poverty. It is a reallocation of where a listener's attention is asked to go — and understanding that reallocation is the whole point of studying harmony historically rather than as a set of rules.`,
          assignment: listen('Pick a song you love from the last five years. Work out how many distinct chords it contains, then count how many distinct rhythmic or textural events happen. Post both numbers and what the ratio tells you about where the song puts its interest.'),
          resources: [
            { label: 'Open Music Theory — popular music analysis (open access)', url: 'https://viva.pressbooks.pub/openmusictheory/' },
            { label: 'Toby Rush — Music Theory for Musicians and Normal People (free)', url: 'https://tobyrush.com/theorypages/' },
            { label: 'Wikipedia — Mixolydian mode', url: 'https://en.wikipedia.org/wiki/Mixolydian_mode' },
          ],
        },
      ],
    },

    // ═══════════════════════════════════════════════════════════════════════
    // 2. THE BIRTH OF RECORDED SOUND
    // ═══════════════════════════════════════════════════════════════════════
    {
      id: 'recorded-sound',
      title: 'The Birth of Recorded Sound',
      blurb: 'The 150 years in which music stopped being an event you attended and became an object you owned — and then a service you rent.',
      level: 'FOUNDATION',
      lessons: [
        {
          id: 'rec-01',
          title: 'Before the Microphone: Scott, Edison, Berliner',
          blurb: 'Sound was first written down as a picture, then played back as a groove, then stamped as a disc.',
          minutes: 16,
          standardIds: ['MU:Cn11.0', 'MU:Re7.1'],
          body: `Édouard-Léon Scott de Martinville built the phonautograph in 1857. It inscribed sound waves as a wavy line on smoke-blackened paper — a visual record with no way to play it back, because playback was not the goal. He was trying to make sound legible, not audible. In 2008 researchers at Lawrence Berkeley National Laboratory optically scanned his phonautograms and reconstructed the audio: a fragment of "Au clair de la lune" from 1860, seventeen years before Edison, is the oldest recognisable recording of a human voice.

Edison's tinfoil phonograph (1877) added the reversal: the same stylus that cut the groove could ride it again and vibrate a diaphragm. It recorded onto cylinders — later wax, then celluloid — which had the acoustic advantage of constant linear velocity from start to end, and the crushing commercial disadvantage that each one had to be recorded individually or copied slowly.

Emile Berliner's gramophone (1887) put the groove on a flat disc, laterally rather than vertically modulated, and a disc could be mass-pressed from a master. That single manufacturing fact decided the format war. By about 1912 discs had won, and the record industry — pressing plants, catalogues, distribution, royalties — became structurally possible. The 78 rpm shellac disc held roughly three minutes per side, and that arbitrary physical constraint quietly defined the length of a popular song for the next hundred years.`,
          assignment: listen('Play something from the UCSB Cylinder Audio Archive recorded before 1910, then the same song in a modern recording if one exists. Post what the old recording still communicates despite everything it cannot capture.'),
          resources: [
            { label: 'UCSB Cylinder Audio Archive — thousands of free cylinders', url: 'https://cylinders.library.ucsb.edu/' },
            { label: 'Library of Congress — National Jukebox', url: 'https://www.loc.gov/collections/national-jukebox/' },
            { label: 'Internet Archive — 78 RPM & cylinder collection', url: 'https://archive.org/details/78rpm' },
          ],
        },
        {
          id: 'rec-02',
          title: 'The Acoustic Era: Playing Into the Horn',
          blurb: 'For nearly fifty years, recording meant shouting into a cone — and it reshaped how musicians played.',
          minutes: 14,
          standardIds: ['MU:Re7.1', 'MU:Re8.1'],
          body: `Until 1925 there was no electricity in the recording chain. Performers played into a large horn; the sound pressure alone drove a diaphragm and a cutting stylus. That meant loud instruments got recorded and quiet ones did not. Violins were routinely replaced by Stroh violins — instruments with a metal horn instead of a body. String basses were swapped for tubas because the tuba's fundamental could actually move the diaphragm. Drummers were often reduced to woodblocks, because a bass drum could throw the stylus out of the groove entirely.

Singers had to modulate their distance from the horn in real time, backing away on loud notes and leaning in on soft ones — a physical performance technique that nobody needed before and nobody needs now. Enrico Caruso's voice happened to sit perfectly in the frequency range the acoustic process captured well, which is a large part of why he became the first recording superstar rather than merely a famous tenor.

So the earliest recorded repertory is not a neutral window onto how music sounded in 1905. It is a portrait of what the technology could hear. That is worth carrying forward: every recording you will ever study is a document of a capture system as much as a performance, and the system always has opinions.`,
          watchAlong: {
            title: 'National Jukebox — acoustic-era Victor recordings',
            url: 'https://www.loc.gov/collections/national-jukebox/',
            note: 'The Library of Congress hosts thousands of pre-1925 Victor masters, free to stream. Listen for the missing bass and the absent drums.',
          },
          assignment: listen('Find an acoustic-era recording with a band on it and list which instruments you can and cannot hear. Post what you think was substituted or left out, and what that did to the arrangement.'),
          resources: [
            { label: 'Library of Congress — National Jukebox', url: 'https://www.loc.gov/collections/national-jukebox/' },
            { label: 'Internet Archive — Great 78 Project', url: 'https://archive.org/details/georgeblood' },
            { label: 'Wikipedia — Acoustic recording', url: 'https://en.wikipedia.org/wiki/Sound_recording_and_reproduction' },
          ],
        },
        {
          id: 'rec-03',
          title: '1925: Electrical Recording and the Invention of Intimacy',
          blurb: 'The microphone did not just improve fidelity. It created a new kind of singing.',
          minutes: 15,
          standardIds: ['MU:Re7.1', 'MU:Re9.1'],
          body: `In 1925 Western Electric's electrical system — a condenser microphone, a vacuum-tube amplifier, an electromagnetic cutter — replaced the horn. Frequency response roughly doubled in range. Bass became audible. Drums became recordable. Ensembles could sit in a room in a natural balance instead of crowding a cone.

The artistic consequence was larger than the technical one. If a microphone can amplify a whisper, a singer no longer needs to project to fill a hall — and a quiet voice, close to a mic, sounds like a person speaking directly into your ear. Bing Crosby built a career on exactly this, and crooning is the first vocal style in history that is impossible without electronics. Billie Holiday, Frank Sinatra, and eventually every pop vocalist you have ever heard are working in the space the microphone opened.

Radio arrived alongside it and changed the economics. A song could now reach millions simultaneously at no marginal cost, which made the hit — a single recording that everyone in a country knows — a coherent concept for the first time. It also triggered the first great fight over performance royalties, because broadcasters were using recordings commercially and the people on them were not being paid. That argument is still running, in different clothes, over streaming.`,
          assignment: listen('Listen to a Caruso recording and then a Bing Crosby recording from around 1932. Post the single biggest difference you hear — and consider that it is a difference in how close the singer is standing to a piece of equipment.'),
          resources: [
            { label: 'Internet Archive — Great 78 Project', url: 'https://archive.org/details/georgeblood' },
            { label: 'Library of Congress — National Recording Registry', url: 'https://www.loc.gov/programs/national-recording-preservation-board/recording-registry/complete-national-recording-registry-listing/' },
            { label: 'Wikipedia — Crooner', url: 'https://en.wikipedia.org/wiki/Crooner' },
          ],
        },
        {
          id: 'rec-04',
          title: 'Magnetic Tape: Editing, Overdubbing, and the End of the Take',
          blurb: 'Captured German technology reaches America in 1945 and the recording stops having to be a single continuous performance.',
          minutes: 17,
          standardIds: ['MU:Cr1.1', 'MU:Re7.1'],
          body: `The Magnetophon, developed in Germany through the 1930s with AC bias giving it startling fidelity, was brought to the United States after the war by the signals engineer Jack Mullin. Bing Crosby — who hated live radio and wanted to pre-record — funded Ampex to build American machines. By 1948 tape was the professional standard.

Tape changed what a recording is. You could cut it with a razor blade and splice takes together, so a released performance need not have happened in one continuous stretch. You could record over part of it, so a mistake need not mean starting again. And, as Les Paul demonstrated with sound-on-sound and then the eight-track machine he commissioned from Ampex, you could layer one performer over themselves indefinitely. The record stopped documenting an event and became an artefact assembled from parts.

Everything downstream follows from that. Multitrack recording makes the mix a creative act. Tape delay and flanging make the studio an instrument. By the mid-1960s Phil Spector, Brian Wilson and George Martin are building records that could not be performed at all, and the album becomes a composed object rather than a collection of singles. When we later talk about sampling, remember it started here: the moment sound became a physical thing you could cut, it became a material.`,
          assignment: listen('Listen to "Good Vibrations" or "Strawberry Fields Forever" and try to hear the seams — the moments where two separately recorded sections have been joined. Post the timestamps where you think an edit happens.'),
          resources: [
            { label: 'Internet Archive — audio & recording history texts', url: 'https://archive.org/details/texts' },
            { label: 'Wikipedia — Multitrack recording', url: 'https://en.wikipedia.org/wiki/Multitrack_recording' },
            { label: 'Library of Congress — National Recording Registry', url: 'https://www.loc.gov/programs/national-recording-preservation-board/recording-registry/complete-national-recording-registry-listing/' },
          ],
        },
        {
          id: 'rec-05',
          title: 'The LP, the 45, and the Format Wars',
          blurb: 'Columbia and RCA fought over rpm, and in doing so invented both the album and the single as artistic categories.',
          minutes: 14,
          standardIds: ['MU:Cn11.0', 'MU:Re9.1'],
          body: `Columbia introduced the 33⅓ rpm twelve-inch microgroove LP in 1948, offering more than twenty minutes a side on vinyl instead of shellac. RCA Victor responded in 1949 with the seven-inch 45 rpm disc: one song per side, cheap, durable, designed for jukeboxes and teenagers. Neither killed the other, and the truce shaped the industry — the 45 for pop singles, the LP for classical, jazz and, eventually, rock as a serious form.

Format is never neutral. Twenty-two minutes a side is why a classic album has two halves with distinct arcs and why side one track one is a recognised job. It is why Sgt. Pepper, Kind of Blue and What's Going On are conceived as continuous experiences. The 45's three minutes, inherited from the 78, is why a pop song has that length and why the "radio edit" exists as a category.

The pattern repeats every time. The cassette gave music portability and the mixtape, and made home copying an industry panic. The CD's seventy-four minutes led directly to the bloated seventy-minute album of the 1990s. The MP3 unbundled the album back into songs. Streaming's royalty threshold — a play counts after about thirty seconds — is measurably shortening intros and shrinking song lengths right now. If you want to predict what music will sound like, look at what the delivery format rewards.`,
          assignment: listen('Listen to one full side of a classic LP without skipping. Post whether the sequence felt designed, and what the running order did that a shuffled playlist could not.'),
          resources: [
            { label: 'Internet Archive — LP & audio collections', url: 'https://archive.org/details/audio_music' },
            { label: 'Wikipedia — LP record', url: 'https://en.wikipedia.org/wiki/LP_record' },
            { label: 'Library of Congress — National Recording Registry', url: 'https://www.loc.gov/programs/national-recording-preservation-board/recording-registry/complete-national-recording-registry-listing/' },
          ],
        },
        {
          id: 'rec-06',
          title: 'Field Recording: The Lomaxes and Folkways',
          blurb: 'Some of the most important recordings of the century were made on portable disc cutters in prison yards and front porches.',
          minutes: 16,
          standardIds: ['MU:Cn11.0', 'MU:Re7.2'],
          body: `John A. Lomax and his son Alan carried a 315-pound disc-cutting machine into the American South for the Library of Congress from 1933 onward, recording work songs, ballads, hollers, and blues from people the commercial industry had never approached — including Huddie Ledbetter ("Lead Belly") at Angola and, in 1941, Muddy Waters at Stovall Plantation before he had recorded commercially at all. Their 1939 Southern States trip alone is hundreds of hours, and it is free to stream from the Library of Congress today.

Field recording carries an unresolved ethical weight and you should hold both halves of it. It preserved music that would otherwise have vanished entirely, and it gave a generation of musicians access to their own inheritance. It also involved outsiders taking recordings from communities with unequal power, sometimes claiming arrangement copyrights, and framing living traditions as artefacts. Alan Lomax's later work — and his eventual efforts to return royalties and recordings to source communities — is part of that reckoning.

Moses Asch's Folkways Records, founded in 1948, made a different commitment: record everything, and never delete anything. Folkways kept its entire catalogue permanently in print, however few copies sold. When the Smithsonian acquired it in 1987 it did so on the explicit condition that the promise be kept. Smithsonian Folkways still presses every one of those titles on demand — an archive run as a public duty rather than a back catalogue.`,
          watchAlong: {
            title: 'Anthology of American Folk Music (Harry Smith, 1952)',
            url: 'https://folkways.si.edu/',
            note: 'Assembled from Smith\'s personal 78 collection, this compilation is the single most influential document behind the 1960s folk revival.',
          },
          assignment: listen('Play a Lomax field recording from the Library of Congress collection. Post what you notice about the room, the interruptions and the imperfections — and whether they add or subtract from the music.'),
          resources: [
            { label: 'Library of Congress — John & Ruby Lomax 1939 Southern trip', url: 'https://www.loc.gov/collections/john-and-ruby-lomax/' },
            { label: 'Smithsonian Folkways — full catalogue', url: 'https://folkways.si.edu/' },
            { label: 'Library of Congress — American Folklife Center collections', url: 'https://www.loc.gov/collections/?fa=partof:american+folklife+center' },
          ],
        },
        {
          id: 'rec-07',
          title: 'Digital: Sampling Rates, the CD, and the Loudness War',
          blurb: 'Nyquist, 44.1 kHz, and how a technology built for fidelity ended up being used to destroy dynamic range.',
          minutes: 16,
          standardIds: ['MU:Re7.1', 'MU:Re8.1'],
          body: `Digital audio rests on the Nyquist–Shannon sampling theorem: a signal containing no frequencies above f can be perfectly reconstructed from samples taken at a rate above 2f. Human hearing tops out around 20 kHz, so a rate somewhat above 40 kHz suffices. The CD's 44.1 kHz comes from the fact that early digital masters were stored on video tape, and 44.1 kHz fit the line and frame structure of existing video equipment. The most widely used number in audio history is an accident of a different format.

Bit depth governs dynamic range: roughly 6 dB per bit, so 16 bits gives about 96 dB — more than adequate for playback, tighter than you want for recording, which is why studios work at 24 bits. Compare that to vinyl at around 70 dB and you can see why the CD was sold on silence as much as on clarity.

Then the industry used all that headroom backwards. Because loud recordings command attention on radio and in shuffle, mastering engineers were pushed to compress and limit ever harder, raising average level while flattening peaks. Between the early 1990s and the late 2000s the dynamic range of mainstream releases collapsed; some records clip continuously by design. Loudness normalisation on streaming platforms has removed the commercial incentive — everything is played back at a matched level now — but a generation of masters is permanently squashed. Technology gave musicians 96 dB of range and the market spent twenty years throwing most of it away.`,
          assignment: listen('Compare an original 1980s CD master of an album to its 2000s remaster if both are available. Post which one you would rather listen to for an hour, not which one sounds more impressive for ten seconds.'),
          resources: [
            { label: 'Wikipedia — Nyquist–Shannon sampling theorem', url: 'https://en.wikipedia.org/wiki/Nyquist%E2%80%93Shannon_sampling_theorem' },
            { label: 'Wikipedia — Loudness war', url: 'https://en.wikipedia.org/wiki/Loudness_war' },
            { label: 'Internet Archive — audio engineering texts', url: 'https://archive.org/details/texts' },
          ],
        },
        {
          id: 'rec-08',
          title: 'Streaming: Music as a Service',
          blurb: 'What changes when nobody owns a copy — for discovery, for archives, and for the people who made the record.',
          minutes: 15,
          standardIds: ['MU:Cn11.0', 'MU:Re9.1'],
          body: `Streaming completes a 150-year arc. Music went from an event you had to attend, to an object you could own, to access you rent. Every constraint that shaped the previous eras — three minutes a side, twenty-two minutes a side, seventy-four minutes a disc — is gone. What replaces them is not freedom but a new set of incentives.

Those incentives are legible. Royalties accrue per qualifying play, typically after about thirty seconds, so intros have shortened and hooks arrive earlier. Playlists are a primary discovery surface, so tracks are increasingly written to survive being heard once, out of context, among strangers. The catalogue's near-infinite size means attention, not availability, is the scarce resource. And because pro-rata payout models divide a subscription pool by total plays platform-wide, your subscription does not primarily pay the artists you actually listen to.

The archival question is the one most people miss. A streaming catalogue is not a library — it is a licensing arrangement, and titles disappear when deals lapse. Nothing you stream is preserved by you. This is precisely why the Internet Archive, the Library of Congress's National Recording Registry, the UCSB cylinder archive and Smithsonian Folkways' never-delete promise matter more now than they did when everyone had shelves. The long-term memory of recorded music is held by institutions that treat it as a duty rather than a catalogue.`,
          assignment: listen('Look through your listening history and find one thing you loved that is no longer available on the service you use. Post what it was, and where a permanent copy could legally live instead.'),
          resources: [
            { label: 'Library of Congress — National Recording Registry', url: 'https://www.loc.gov/programs/national-recording-preservation-board/recording-registry/complete-national-recording-registry-listing/' },
            { label: 'Internet Archive — Live Music Archive (artist-authorised)', url: 'https://archive.org/details/etree' },
            { label: 'Smithsonian Folkways — the never-out-of-print archive', url: 'https://folkways.si.edu/' },
          ],
        },
      ],
    },

    // ═══════════════════════════════════════════════════════════════════════
    // 3. FORM & STRUCTURE
    // ═══════════════════════════════════════════════════════════════════════
    {
      id: 'form',
      title: 'Form & Structure',
      blurb: 'How music organises time — the shapes composers and songwriters use to make several minutes feel like one idea.',
      level: 'INTERMEDIATE',
      lessons: [
        {
          id: 'form-01',
          title: 'Phrase, Period, and the Musical Sentence',
          blurb: 'Before you can hear a form you have to hear its bricks. Music breathes in units, and they are surprisingly regular.',
          minutes: 14,
          standardIds: ['MU:Re7.2', 'MU:Re8.1'],
          body: `A phrase is the smallest stretch of music that feels complete enough to end — typically four bars, ending in a cadence. Two phrases in a question-and-answer relationship make a period: the first (antecedent) ends on an inconclusive cadence, the second (consequent) restates the material and closes properly. That is the grammar of nearly all Classical melody and most folk and pop melody too.

The sentence is the other basic shape, and it is more dynamic. A short idea is stated, immediately repeated (often transposed), and then the material fragments and accelerates into a cadence. Beethoven's Fifth opens with a textbook one: statement, repetition a step lower, then continuous development. Where a period balances, a sentence builds.

Learning to hear these is the single highest-leverage listening skill there is, because larger forms are made from them. Sonata form is a drama of themes that are themselves periods and sentences. A pop verse is usually two periods. Once you can feel four-bar units without counting, you can hear a composer stretch one to five or compress one to three — and those irregularities are almost always where the expressive weight of a piece lives.`,
          assignment: listen('Play any song and count bars until you can feel the four-bar unit without counting. Then find a place where the phrase is NOT four bars. Post the song and the timestamp.'),
          resources: [
            { label: 'Open Music Theory — phrase & form (open access)', url: 'https://viva.pressbooks.pub/openmusictheory/' },
            { label: 'IMSLP — Beethoven Symphony No. 5 (free score)', url: 'https://imslp.org/wiki/Symphony_No.5,_Op.67_(Beethoven,_Ludwig_van)' },
            { label: 'Toby Rush — free theory sheets', url: 'https://tobyrush.com/theorypages/' },
          ],
        },
        {
          id: 'form-02',
          title: 'Binary, Ternary, and the Dance Suite',
          blurb: 'The two simplest forms in music, and the Baroque suite that strings them together.',
          minutes: 13,
          standardIds: ['MU:Re7.2'],
          body: `Binary form is AB: two sections, each usually repeated, with the first moving away from the tonic (to the dominant in major, the relative major in minor) and the second travelling back. Almost every Baroque dance movement is in binary. Because the two halves are proportional and both repeat, the form feels like a room you walk through and then walk back across.

Ternary form is ABA: a statement, a contrasting middle, and a return. That return is psychologically enormous — you have heard the material, then been taken elsewhere, and now you hear it again knowing what it is. The da capo aria built an entire operatic century on it, with the singer expected to ornament the returning A section, which turned repetition into a display of invention.

The Baroque suite assembles these into a whole: allemande, courante, sarabande, gigue, plus optional galanteries — each a stylised dance with its own metre and character, all in the same key, all in binary. Bach's cello suites and keyboard partitas are the summit. Listen to a whole suite in order and you will feel a logic of tempo and weight that no single movement carries alone. That is the earliest large-scale form in Western music that works by contrast between movements rather than development inside one.`,
          assignment: listen('Listen to one full Bach cello suite. Post which movement felt like the emotional centre and where in the sequence it fell.'),
          resources: [
            { label: 'IMSLP — Bach, Cello Suites BWV 1007–1012 (free score)', url: 'https://imslp.org/wiki/6_Cello_Suites,_BWV_1007-1012_(Bach,_Johann_Sebastian)' },
            { label: 'IMSLP — Bach complete works', url: 'https://imslp.org/wiki/Category:Bach,_Johann_Sebastian' },
            { label: 'Open Music Theory — binary & ternary forms', url: 'https://viva.pressbooks.pub/openmusictheory/' },
          ],
        },
        {
          id: 'form-03',
          title: 'Sonata Form: Argument in Three Acts',
          blurb: 'The most consequential formal idea in European music — and it is fundamentally about key, not about tunes.',
          minutes: 18,
          standardIds: ['MU:Re7.2', 'MU:Re8.1', 'MU:Cn11.0'],
          body: `Sonata form has three parts. The exposition states a first theme in the tonic, modulates through a transition, and states a second theme in a new key — the dominant in major, the relative major in minor. The development takes that material somewhere unstable, fragmenting and sequencing it through remote keys. The recapitulation returns the first theme in the tonic and, crucially, restates the second theme in the tonic too, resolving the tonal conflict the exposition opened.

That last detail is the whole point, and it is why textbook descriptions built around "first subject, second subject" mislead. The drama is not two tunes meeting; it is a key relationship being established as a problem and then solved. A recapitulation that repeats the same themes in the same keys would be a repeat sign. A recapitulation that repeats them all in the tonic is a resolution.

Haydn established it, Mozart perfected its proportions, and Beethoven stretched it until it strained — enormously extended developments, codas that function as second developments, and in the Eroica a first movement longer than some complete earlier symphonies. Then it became a burden. For the whole 19th century, writing a symphony meant answering to this form, and composers from Brahms to Mahler defined themselves by how they handled it. Few structural ideas in any art form have dominated for so long.`,
          assignment: listen('Listen to the first movement of any Mozart or Haydn symphony and mark three timestamps: where the second theme arrives, where the development begins, and where the recapitulation starts. Post them and say how you knew.'),
          resources: [
            { label: 'IMSLP — Mozart Symphony No. 40 (free score)', url: 'https://imslp.org/wiki/Symphony_No.40,_K.550_(Mozart,_Wolfgang_Amadeus)' },
            { label: 'IMSLP — Beethoven, Symphony No. 3 "Eroica"', url: 'https://imslp.org/wiki/Symphony_No.3,_Op.55_(Beethoven,_Ludwig_van)' },
            { label: 'Open Music Theory — sonata form', url: 'https://viva.pressbooks.pub/openmusictheory/' },
          ],
        },
        {
          id: 'form-04',
          title: 'Theme and Variations, Rondo, Fugue',
          blurb: 'Three other ways to fill several minutes: transform one idea, keep returning to one idea, or grow everything from one idea.',
          minutes: 16,
          standardIds: ['MU:Re7.2', 'MU:Cr1.1'],
          body: `Variation form states a theme and then transforms it repeatedly — changing rhythm, harmony, mode, texture, register — while some skeleton persists. Bach's Goldberg Variations keep the bass and harmonic plan constant while everything above changes utterly, including a canon at every third variation, at successively wider intervals. Beethoven's Diabelli Variations take a deliberately banal waltz and extract thirty-three worlds from it. The form's whole argument is that the identity of a musical idea does not live in its surface.

Rondo alternates a recurring refrain with contrasting episodes: ABACA, or ABACABA. The refrain's return is reliable and satisfying, which is why rondo is so often a finale — after a weighty sonata-form first movement, an audience wants something whose logic they can follow in real time. This is also the structure of a pop song with a strong chorus, arrived at independently for the same psychological reason.

Fugue is not a form at all but a texture and a procedure. A subject is announced alone, answered in another voice at the fifth while the first continues in counterpoint, and once all voices have entered the piece proceeds through episodes and further entries in related keys, possibly with the subject inverted, augmented, or stacked against itself in stretto. No two fugues have the same shape, because the shape is whatever the subject's own properties permit. It is the purest example in music of a structure derived entirely from its material.`,
          assignment: listen('Listen to the Goldberg Variations aria, then variation 25, then the aria again at the end. Post what the returning aria feels like after everything in between.'),
          resources: [
            { label: 'IMSLP — Bach, Goldberg Variations BWV 988', url: 'https://imslp.org/wiki/Goldberg_Variations,_BWV_988_(Bach,_Johann_Sebastian)' },
            { label: 'IMSLP — Beethoven, Diabelli Variations Op. 120', url: 'https://imslp.org/wiki/33_Variations_on_a_Waltz_by_Diabelli,_Op.120_(Beethoven,_Ludwig_van)' },
            { label: 'IMSLP — The Art of Fugue, BWV 1080', url: 'https://imslp.org/wiki/Die_Kunst_der_Fuge,_BWV_1080_(Bach,_Johann_Sebastian)' },
          ],
        },
        {
          id: 'form-05',
          title: 'The 32-Bar Standard and the 12-Bar Blues',
          blurb: 'Two American forms so efficient that they became the shared language of an entire century of improvisers.',
          minutes: 15,
          standardIds: ['MU:Re7.2', 'MU:Pr4.2'],
          body: `The 32-bar AABA song form dominated American popular music from roughly 1920 to 1955. Eight bars of A, repeated, then a contrasting eight-bar bridge (the "release" or "middle eight") that usually moves to a new key area, then A returns. It is ternary form compressed to fit a 78 rpm side, and it produced "Over the Rainbow", "Body and Soul" and several thousand other standards.

The twelve-bar blues is shorter and even more consequential: four bars of I, two of IV, two of I, one of V, one of IV, two of I — with a lyric form of a line, the same line repeated, and an answering line. That AAB lyric structure gives the singer time to invent the third line while repeating the second, which is a compositional method disguised as a song form.

What makes both forms historically enormous is that they are shared. If a form is known by every musician in a scene, players who have never met can perform together at length — which is exactly what jazz needed. The head is played, then everyone improvises over the same repeating structure, then the head returns. "Rhythm changes" — the chord progression of Gershwin's "I Got Rhythm" — became a standard vehicle in its own right, spawning hundreds of new melodies over the same 32 bars. A form became public infrastructure.`,
          assignment: listen('Find a jazz recording over rhythm changes and count the choruses. Post how many there are, and describe how the soloists change strategy as the choruses accumulate.'),
          resources: [
            { label: 'Library of Congress — National Jukebox (early standards)', url: 'https://www.loc.gov/collections/national-jukebox/' },
            { label: 'Internet Archive — Great 78 Project', url: 'https://archive.org/details/georgeblood' },
            { label: 'Wikipedia — Thirty-two-bar form', url: 'https://en.wikipedia.org/wiki/Thirty-two-bar_form' },
          ],
        },
        {
          id: 'form-06',
          title: 'Verse–Chorus and the Modern Pop Architecture',
          blurb: 'Intro, verse, pre-chorus, chorus, post-chorus, bridge, drop — the modular grammar of the last sixty years.',
          minutes: 15,
          standardIds: ['MU:Re7.2', 'MU:Cr1.1', 'MU:Re9.1'],
          body: `Around the mid-1950s the AABA standard gave way to verse–chorus form, where the chorus — same lyric every time, higher energy, containing the title — is the destination and the verse is the approach. The reason is partly commercial (a repeated hook is memorable and therefore sells) and partly technical: rock and R&B are built on repeating riffs and grooves rather than on the harmonic through-composition standards relied on.

The modules multiplied. The pre-chorus emerged as a device to build tension and delay arrival, usually by removing the drums or rising in pitch. The post-chorus — a hook after the chorus, often wordless — became near-universal in the 2010s. The bridge does the job the old middle eight did: go somewhere different so the final chorus lands harder. In dance-derived music the drop replaces the chorus entirely, with the build performing the pre-chorus function and the release being rhythmic and timbral rather than melodic or harmonic.

The useful skill is hearing modules as decisions about tension and time. Every good pop record is a curve of expectation: something is withheld, something arrives, something is withheld again so it can arrive bigger. Map the sections of a song against how much energy each carries and you have its architecture. Do it for ten songs and you will never listen passively again.`,
          assignment: listen('Take one song and write out its section map with timestamps, plus an energy rating from 1 to 10 for each section. Post the map. Look at where the lowest number sits — that is the songwriter\'s most deliberate choice.'),
          resources: [
            { label: 'Open Music Theory — form in popular music', url: 'https://viva.pressbooks.pub/openmusictheory/' },
            { label: 'Wikipedia — Song structure', url: 'https://en.wikipedia.org/wiki/Song_structure' },
            { label: 'Library of Congress — National Recording Registry', url: 'https://www.loc.gov/programs/national-recording-preservation-board/recording-registry/complete-national-recording-registry-listing/' },
          ],
        },
        {
          id: 'form-07',
          title: 'Process, Loop, and Form Without Sections',
          blurb: 'Minimalism, ambient and club music organise time by gradual change rather than by contrast.',
          minutes: 16,
          standardIds: ['MU:Re7.2', 'MU:Re9.1'],
          body: `In 1964 Terry Riley's In C gave an ensemble fifty-three short melodic fragments and one instruction: play them in order, repeating each as many times as you like, and move on when you want. There are no sections. The form is emergent — it is whatever the players' independent decisions produce that night. Steve Reich's phase pieces do something related with precision: two identical loops start together and one drifts fractionally faster, so the entire structure of the piece is the audible consequence of one process running to completion.

That is a genuinely different theory of form. Rather than statement, contrast and return, you get a process set in motion and allowed to unfold. The listener's attention shifts from "what happens next" to "what is happening now, and how is it different from a minute ago". Brian Eno's ambient work pushes further, designing music that rewards attention without demanding it.

Club music inherited all of this through the twelve-inch and the DJ. A house or techno track is often a stack of loops introduced and removed one at a time; the arrangement is a set of instructions for mixing, and the real form is the DJ set, hours long, of which the track is a single component. Once you see it that way, dance music stops looking repetitive and starts looking like the most functionally sophisticated approach to large-scale musical time anyone has built since the symphony.`,
          assignment: listen('Listen to twenty minutes of Terry Riley\'s "In C" or a long-form techno set. Post what you started noticing in the second ten minutes that you were deaf to in the first.'),
          resources: [
            { label: 'Internet Archive — free experimental & electronic audio', url: 'https://archive.org/details/audio_music' },
            { label: 'Wikipedia — In C (Terry Riley)', url: 'https://en.wikipedia.org/wiki/In_C' },
            { label: 'Internet Archive — Live Music Archive', url: 'https://archive.org/details/etree' },
          ],
        },
      ],
    },

    // ═══════════════════════════════════════════════════════════════════════
    // 4. RHYTHM & GROOVE
    // ═══════════════════════════════════════════════════════════════════════
    {
      id: 'rhythm',
      title: 'Rhythm & Groove',
      blurb: 'Metre, syncopation, clave, swing and microtiming — why some music makes you move and notation cannot quite explain it.',
      level: 'INTERMEDIATE',
      lessons: [
        {
          id: 'rhy-01',
          title: 'Pulse, Metre, and the Feel of Two Against Three',
          blurb: 'The difference between counting and feeling — and why 6/8 is not just fast 3/4.',
          minutes: 14,
          standardIds: ['MU:Re7.2', 'MU:Pr4.2'],
          body: `Pulse is the steady beat you tap. Metre is the pattern of strong and weak beats grouped around it — duple (strong-weak), triple (strong-weak-weak) — and it is a perceptual construction, not a property of the sound. Play a completely even click track and most listeners will impose a grouping on it involuntarily. Metre is something your brain does to music.

Compound metres group beats in threes at the subdivision level: 6/8 is two beats each divided into three, which is why it lilts. That is genuinely different from 3/4, which is three beats each divided in two, even though both contain six eighth notes. The distinction is where the strong points fall, and it is why a Bach gigue and a Viennese waltz feel nothing alike.

Hemiola — two groups of three reinterpreted as three groups of two — is the oldest rhythmic trick in Western music and it is everywhere, from Renaissance dances to Bernstein's "America" to Radiohead. The genuinely important insight is that rhythmic interest almost always comes from ambiguity: two plausible groupings competing for the same span of time. Once you can hear a passage two ways at once, you have the ear you need for everything in this track.`,
          assignment: listen('Find a song in 6/8 and one in 3/4 and play them back to back. Post which is which and describe the difference in physical terms — what your body wanted to do.'),
          resources: [
            { label: 'Open Music Theory — metre & rhythm (open access)', url: 'https://viva.pressbooks.pub/openmusictheory/' },
            { label: 'Toby Rush — free theory sheets', url: 'https://tobyrush.com/theorypages/' },
            { label: 'Wikipedia — Hemiola', url: 'https://en.wikipedia.org/wiki/Hemiola' },
          ],
        },
        {
          id: 'rhy-02',
          title: 'Syncopation: Accenting What Should Be Weak',
          blurb: 'Ragtime, the backbeat, and how displacement became the engine of American music.',
          minutes: 15,
          standardIds: ['MU:Re7.2', 'MU:Cn11.0'],
          body: `Syncopation places accents where the metre does not expect them — on offbeats, on weak beats, or by tying across a strong beat so an expected downbeat never arrives. It only works because metre is a prediction: you cannot violate an expectation the listener does not hold. This is why syncopation feels physical. Your body has committed to a grouping and the music has landed somewhere else.

Ragtime made syncopation the whole point. In Scott Joplin's rags the left hand keeps a strict march bass while the right hand plays melodies whose accents fall persistently between the beats. The tension between an unyielding pulse and a displaced melody is exactly the mechanism, and Joplin's own published tempo warnings — that it is never right to play ragtime fast — indicate how much he wanted that friction heard rather than blurred.

The backbeat is syncopation industrialised. In common time the strong beats are 1 and 3; putting the snare hard on 2 and 4 permanently accents the weak beats, and after 1955 essentially all popular music does it. Combine that with a bass line that anticipates the downbeat and you have the fundamental rhythmic architecture of rock, soul, funk, reggae and hip-hop — a fixed pulse being continuously contradicted, forever.`,
          assignment: listen('Play a Scott Joplin rag and clap the left hand while listening to the right. Post how long you could keep it up, and where the melody most successfully knocked you off.'),
          resources: [
            { label: 'IMSLP — Scott Joplin (free public-domain scores)', url: 'https://imslp.org/wiki/Category:Joplin,_Scott' },
            { label: 'Library of Congress — National Jukebox (ragtime era)', url: 'https://www.loc.gov/collections/national-jukebox/' },
            { label: 'Internet Archive — Great 78 Project', url: 'https://archive.org/details/georgeblood' },
          ],
        },
        {
          id: 'rhy-03',
          title: 'Clave: The West African Timeline in the Americas',
          blurb: 'A two-bar asymmetric pattern that organises the rhythm of most of the Western hemisphere.',
          minutes: 17,
          standardIds: ['MU:Re7.2', 'MU:Cn11.0'],
          body: `Across West and Central African musical traditions, ensembles are organised around a timeline: a short, asymmetric, endlessly repeated pattern — often struck on a bell — against which every other part is positioned. It is not a metre and it is not an accompaniment. It is a reference grid, and it is asymmetric on purpose, because an asymmetric pattern tells you unambiguously where you are in the cycle.

Carried to the Americas through the transatlantic slave trade, these timelines became clave in Cuba, and clave organises son, rumba, mambo and salsa. The son clave in its 3-2 form places strokes on beats 1, the "and" of 2, and 4 of the first bar, then 2 and 3 of the second. Every part in the ensemble must agree with clave direction; a horn line written "against clave" is simply wrong, and experienced players hear the error instantly. The pattern is not decoration, it is the law.

Its relatives are everywhere. The Brazilian partido alto, the tresillo underlying habanera and the "Spanish tinge" Jelly Roll Morton said was essential to jazz, the second-line rhythms of New Orleans, the bo-diddley beat, and the syncopated hi-hat and 808 patterns of trap all descend from the same family. Studying clave is not studying a Latin speciality — it is studying the rhythmic substrate of nearly all popular music made in the Americas.`,
          assignment: listen('Learn to clap the 3-2 son clave, then play three songs from different genres and find the clave or a clave relative in each. Post the three songs.'),
          resources: [
            { label: 'Smithsonian Folkways — Caribbean & Latin collections', url: 'https://folkways.si.edu/explore' },
            { label: 'Library of Congress — American Folklife Center collections', url: 'https://www.loc.gov/collections/?fa=partof:american+folklife+center' },
            { label: 'Wikipedia — Clave (rhythm)', url: 'https://en.wikipedia.org/wiki/Clave_(rhythm)' },
          ],
        },
        {
          id: 'rhy-04',
          title: 'Swing and Microtiming',
          blurb: 'The ratio that is not a ratio — what "swing" actually measures, and why it changes with tempo.',
          minutes: 16,
          standardIds: ['MU:Re7.2', 'MU:Pr4.2'],
          body: `Swing is usually described as playing eighth notes as a triplet quarter plus a triplet eighth — a 2:1 ratio. Measure real recordings and that is not what players do. The swing ratio varies with tempo (approaching 3:1 or higher at slow tempos, flattening toward 1:1 at very fast ones), varies between players, and varies within a single performance. It is a continuously negotiated feel, not a rhythmic value.

Microtiming is the general phenomenon: systematic deviations from the grid, on the order of a few milliseconds to a few tens of milliseconds, that carry musical meaning. A drummer playing the snare slightly late relative to the hi-hat produces the sensation of a groove "laying back"; playing slightly ahead produces urgency. In a great rhythm section these offsets are consistent and intentional, and the space between the instruments is precisely what listeners mean by feel.

This is the exact thing notation cannot represent and quantisation destroys. When early sequencers snapped everything to a rigid grid, the resulting music sounded mechanical — and rather than fix it, producers made that an aesthetic, then reintroduced feel through swing settings and humanise functions. J Dilla's drum programming is the most influential example of the reverse: deliberately unquantised, with the snare and hi-hat sitting in relationships no metronome would allow, producing a drunken elasticity that a generation of producers has chased ever since.`,
          assignment: listen('Listen to a Count Basie recording and then to a J Dilla-produced track. Post what the two have in common. (They are separated by fifty years and they are doing the same thing.)'),
          resources: [
            { label: 'Internet Archive — Great 78 Project (swing era)', url: 'https://archive.org/details/georgeblood' },
            { label: 'Library of Congress — National Recording Registry', url: 'https://www.loc.gov/programs/national-recording-preservation-board/recording-registry/complete-national-recording-registry-listing/' },
            { label: 'Wikipedia — Swung note', url: 'https://en.wikipedia.org/wiki/Swung_note' },
          ],
        },
        {
          id: 'rhy-05',
          title: 'Funk: The One, and Rhythm as Composition',
          blurb: 'James Brown reorganised an entire band around the downbeat and invented a genre by subtraction.',
          minutes: 15,
          standardIds: ['MU:Re7.2', 'MU:Cr1.1'],
          body: `Around 1965, with "Papa's Got a Brand New Bag" and then "Cold Sweat", James Brown stopped writing songs that moved through chords and started writing songs that stayed on one. What replaced harmonic motion was rhythmic interlock: each instrument playing a short, specific, repeating figure that fits into the others like gear teeth. The guitar plays a scratchy sixteenth-note pattern on the upper strings, the bass plays a line that lands hard on beat one and then vacates, the drums keep a pattern with more space than fill, and the horns punctuate.

"The One" is the doctrine. Where rock emphasises the backbeat, Brown insisted every part converge emphatically on beat one of each bar, then diverge for the rest of it. That produces a cycle with an unmistakable landmark and maximum freedom in between — and it means the ensemble can sustain a single groove for eight minutes without the listener losing their place.

Funk's deeper lesson is that arrangement is composition. There is often no chord change and barely a melody; the entire musical argument is which instruments are playing, what tiny figure each has, and when parts drop out and return. Everything after — Sly, Parliament, disco, hip-hop's break, house, Afrobeat's parallel development under Fela Kuti — inherits this. Learn to hear a funk record as a stack of independent rhythmic lines and you have learned to hear most modern production.`,
          assignment: listen('Play a James Brown track and isolate each instrument by ear in turn — guitar, bass, drums, horns. Post the one-bar pattern each one plays, however roughly. Then listen again to how they interlock.'),
          resources: [
            { label: 'Library of Congress — National Recording Registry', url: 'https://www.loc.gov/programs/national-recording-preservation-board/recording-registry/complete-national-recording-registry-listing/' },
            { label: 'Smithsonian Folkways — African & diaspora collections', url: 'https://folkways.si.edu/explore' },
            { label: 'Wikipedia — Funk', url: 'https://en.wikipedia.org/wiki/Funk' },
          ],
        },
        {
          id: 'rhy-06',
          title: 'The Drum Machine: 808, 909, and Programmed Time',
          blurb: 'Commercial failures that became the sound of three decades of music.',
          minutes: 15,
          standardIds: ['MU:Re7.1', 'MU:Cr1.1'],
          body: `The Roland TR-808 (1980) was designed to give musicians realistic drum sounds and did not achieve it. Its analogue circuits produce a kick with an extraordinarily long decaying sine sweep, a thin snappy snare, and a cowbell that sounds like nothing on earth. It sold poorly and was discontinued in 1983. Because it then turned up cheap secondhand, it was adopted by exactly the people the industry was not selling to — Afrika Bambaataa, Marvin Gaye's "Sexual Healing", the entire Miami bass and Southern hip-hop lineage — and its kick drum, tuned low and left to ring, became the foundation of trap.

The TR-909 (1983) went the same way into Chicago house and Detroit techno, its kick and open hi-hat becoming the definitive four-to-the-floor sound. The TB-303 bass synthesiser, an outright commercial disaster intended to replace a bass guitarist, was misused into acid house. In each case the technology's failure to be realistic is exactly what made it musically distinctive.

Programming also changed rhythm itself. A step sequencer presents time as a grid of sixteen boxes, and that representation encourages patterns that are hard to play and easy to draw — perfectly even hi-hat rolls, impossible triplet subdivisions, patterns that are identical every bar for six minutes. Human rhythm and grid rhythm are different musical materials, and most music since 1985 is some negotiated blend of the two.`,
          assignment: listen('Find one hip-hop track and one house track and identify the drum machine. Post which one you think it is and what gave it away — the kick, the hi-hat or the clap.'),
          resources: [
            { label: 'Wikipedia — Roland TR-808', url: 'https://en.wikipedia.org/wiki/Roland_TR-808' },
            { label: 'Internet Archive — electronic music collections', url: 'https://archive.org/details/audio_music' },
            { label: 'Library of Congress — National Recording Registry', url: 'https://www.loc.gov/programs/national-recording-preservation-board/recording-registry/complete-national-recording-registry-listing/' },
          ],
        },
        {
          id: 'rhy-07',
          title: 'Polyrhythm, Odd Metre, and Rhythm as the Frontier',
          blurb: 'Where contemporary music is actually getting more complex — and it is not in the harmony.',
          minutes: 16,
          standardIds: ['MU:Re7.2', 'MU:Re8.1'],
          body: `A polyrhythm is two conflicting subdivisions of the same span — three against four being the canonical case, where one part divides a bar into three and another into four, coinciding only at the start. West and Central African ensemble traditions are built on layered polyrhythm as a norm rather than a special effect, and the interlocking parts produce composite patterns that no single player is performing.

Odd metres — 5, 7, 11, 13 — are standard in Balkan folk music, in Indian classical tala, and in Turkish aksak. In Carnatic music, rhythmic cycles run to hundreds of beats with a mathematically rigorous system of subdivision and cadential formulae (korvai) whose sophistication has no European parallel. Western music's persistent 4/4 is not a universal default; it is a local habit.

The frontier claim is testable. Take mainstream releases from 1970 and from today and compare their harmonic vocabulary — today's is generally simpler. Compare their rhythmic content — polymetric hi-hat patterns, triplet flows over duple beats, half-time feel changes, aggressive microtiming, metric modulation in metal and math rock — and today's is markedly more complex. The centre of musical innovation moved from pitch to time, and if you want to hear where music is going, that is where to point your attention.`,
          assignment: listen('Find a track that switches between duple and triplet feel without changing tempo, or a song in 7. Post the track and the timestamp of the switch, and how you counted it.'),
          resources: [
            { label: 'Smithsonian Folkways — world music collections', url: 'https://folkways.si.edu/explore' },
            { label: 'Internet Archive — global traditional music', url: 'https://archive.org/details/audio_music' },
            { label: 'Wikipedia — Polyrhythm', url: 'https://en.wikipedia.org/wiki/Polyrhythm' },
          ],
        },
      ],
    },

    // ═══════════════════════════════════════════════════════════════════════
    // 5. SAMPLING AND THE LAW
    // ═══════════════════════════════════════════════════════════════════════
    {
      id: 'sampling-law',
      title: 'Sampling and the Law',
      blurb: 'What a sample is, what two copyrights it touches, which court decisions govern it, and how clearance actually works.',
      level: 'ADVANCED',
      lessons: [
        {
          id: 'law-01',
          title: 'What a Sample Is: Musique Concrète to the Break',
          blurb: 'Recorded sound became a compositional material long before hip-hop — but hip-hop made it a music.',
          minutes: 15,
          standardIds: ['MU:Cn11.0', 'MU:Cr1.1'],
          body: `In 1948 Pierre Schaeffer, working at French radio, began composing with recorded sound itself — train noises, struck objects, voices — cut and looped on disc and later tape. Musique concrète proposed that the material of music need not be notes at all. Stockhausen, Varèse, and the BBC Radiophonic Workshop developed the idea; the Beatles' "Tomorrow Never Knows" and "Revolution 9" carried tape-loop technique into popular music.

Hip-hop arrived at the same material from an entirely different direction: the dance floor. In the early 1970s in the Bronx, DJ Kool Herc noticed that dancers responded most to the percussion break — the few bars where the band drops out and the drums play alone. Using two copies of the same record and two turntables, he extended that break indefinitely, cutting back to the start of the break on one deck while the other played. Grandmaster Flash refined the technique into precise cutting and Grand Wizzard Theodore added the scratch.

The key point is conceptual. The break is not a quotation and not a cover. It is a piece of a recording being used as an instrument — the sonic material repurposed, not the composition performed. Everything in this track's legal difficulty follows from the fact that copyright law was built for compositions and performances and had no clean category for that.`,
          assignment: listen('Find an original record and a hip-hop track that used its break. Post both, and describe what the producer heard in the original that the original artist may not have been foregrounding.'),
          resources: [
            { label: 'Internet Archive — free audio & experimental music', url: 'https://archive.org/details/audio_music' },
            { label: 'Wikipedia — Musique concrète', url: 'https://en.wikipedia.org/wiki/Musique_concr%C3%A8te' },
            { label: 'Library of Congress — National Recording Registry', url: 'https://www.loc.gov/programs/national-recording-preservation-board/recording-registry/complete-national-recording-registry-listing/' },
          ],
        },
        {
          id: 'law-02',
          title: 'Two Copyrights: The Song and the Master',
          blurb: 'Every recording contains two separate legal works owned by different people. Clear one and you have cleared nothing.',
          minutes: 16,
          standardIds: ['MU:Cn11.0'],
          body: `A recording embodies two distinct copyrighted works. The musical composition — melody, harmony, lyrics — is typically owned or administered by the songwriters and their publisher. The sound recording, called the master, is the particular fixed performance, and it is typically owned by the label or whoever financed the session. In the United States, sound recordings became federally protected only for recordings fixed on or after 15 February 1972; older recordings were governed by a patchwork of state law until the Music Modernization Act of 2018 brought them into a federal scheme with a staged public-domain schedule.

If you sample a recording, you have used both works, and you need permission from both. Publishing clearance typically yields a share of the new song's writing credit plus possibly an advance. Master clearance typically yields a flat fee, or a royalty, or both. The two negotiations are separate, with different counterparties, and either can refuse.

If instead you re-record the part yourself — an interpolation or replay — you no longer touch the master at all, and you need only composition clearance. This is why replays are so common in commercial releases: it removes an entire negotiation and often costs far less. It also explains the credit lists on modern hits, which sometimes run to a dozen names: every cleared composition contributes writers, and those writers are legally credited on the new work.`,
          assignment: listen('Pick a song with a famous sample and look up its full writing credits. Post how many writers are listed and how many of them had anything to do with the new record.'),
          resources: [
            { label: 'U.S. Copyright Office — Circular 56A: sound recordings', url: 'https://www.copyright.gov/circs/circ56a.pdf' },
            { label: 'U.S. Copyright Office — official site', url: 'https://www.copyright.gov/' },
            { label: 'Wikipedia — Music Modernization Act', url: 'https://en.wikipedia.org/wiki/Music_Modernization_Act' },
          ],
        },
        {
          id: 'law-03',
          title: 'Grand Upright (1991): The Year Sampling Got Expensive',
          blurb: 'A judge opened his opinion with "Thou shalt not steal" and the golden age of dense sampling ended.',
          minutes: 15,
          standardIds: ['MU:Cn11.0'],
          body: `Between roughly 1986 and 1991 producers built records from dozens of uncleared samples. Public Enemy's It Takes a Nation of Millions and the Beastie Boys' Paul's Boutique are layered collages of a density that would be economically impossible today. Clearance was informal, inconsistent, and frequently skipped, and the industry had not yet decided how seriously to take it.

Grand Upright Music, Ltd. v. Warner Bros. Records, decided in the Southern District of New York in 1991, settled it. Biz Markie had sampled Gilbert O'Sullivan's "Alone Again (Naturally)"; his team had sought permission and not obtained it, and released anyway. Judge Kevin Duffy granted an injunction, opened his opinion by quoting the commandment against stealing, and referred the matter for criminal prosecution. The album was pulled.

The commercial effect was immediate and permanent. Labels instituted mandatory clearance before release, sample-clearance specialists became a profession, and budgets for sample-heavy records became prohibitive. Producers responded by using fewer and shorter samples, by replaying parts instead, and eventually by moving toward original composition in software. An entire aesthetic was priced out of existence by one ruling — and the ruling did essentially no legal analysis of fair use, which is why scholars still criticise it while acknowledging that it reshaped the industry more than almost any other music case.`,
          assignment: listen('Listen to "Paul\'s Boutique" or "Fear of a Black Planet" and try to count distinct sampled sources in a single track. Post your count and consider what clearing all of them would cost today.'),
          resources: [
            { label: 'Wikipedia — Grand Upright Music, Ltd. v. Warner Bros.', url: 'https://en.wikipedia.org/wiki/Grand_Upright_Music,_Ltd._v._Warner_Bros._Records_Inc.' },
            { label: 'U.S. Copyright Office — official site', url: 'https://www.copyright.gov/' },
            { label: 'WhoSampled — sample genealogy database', url: 'https://www.whosampled.com/' },
          ],
        },
        {
          id: 'law-04',
          title: 'Campbell v. Acuff-Rose (1994): Parody and Transformative Use',
          blurb: 'The Supreme Court decision that made "transformative" the central word in fair use.',
          minutes: 16,
          standardIds: ['MU:Cn11.0'],
          body: `2 Live Crew recorded a rap version of Roy Orbison's "Oh, Pretty Woman" after being refused a licence. The publisher sued. In Campbell v. Acuff-Rose Music, Inc., 510 U.S. 569 (1994), a unanimous Supreme Court held that the commercial nature of a use does not create a presumption against fair use, and that parody can qualify.

The decisive concept, drawn by Justice Souter from Judge Pierre Leval's scholarship, is transformative use: the question of whether the new work adds something new, with a further purpose or different character, altering the original with new expression, meaning or message. The more transformative the use, the less the other statutory factors — including commerciality — weigh against it. That framing now dominates fair-use analysis in every medium, from documentary film to search engines to the current arguments about AI training data.

Two caveats matter for musicians. First, the Court distinguished parody, which comments on the original itself and therefore needs to borrow from it, from satire, which uses a work to comment on something else and has a weaker claim to borrowing. Second, the case concerned a re-performance of a composition, not a digital copy of a master recording, so it does not directly license sampling. Fair use in sampling remains fact-specific, expensive to litigate, and a poor thing to rely on for a commercial release.`,
          assignment: listen('Find a parody song and a satire that uses an existing song. Post both and argue which one has the stronger fair-use claim under Campbell.'),
          resources: [
            { label: 'Justia — Campbell v. Acuff-Rose Music, 510 U.S. 569 (1994)', url: 'https://supreme.justia.com/cases/federal/us/510/569/' },
            { label: 'U.S. Copyright Office — Fair Use Index', url: 'https://www.copyright.gov/fair-use/' },
            { label: 'Wikipedia — Transformative use', url: 'https://en.wikipedia.org/wiki/Transformativeness' },
          ],
        },
        {
          id: 'law-05',
          title: 'Bridgeport vs. VMG: The De Minimis Split',
          blurb: 'Two federal circuits disagree about whether a two-second sample can ever be too small to matter.',
          minutes: 16,
          standardIds: ['MU:Cn11.0'],
          body: `In Bridgeport Music, Inc. v. Dimension Films (6th Cir. 2005), concerning a two-second, pitch-shifted guitar chord from Funkadelic's "Get Off Your Ass and Jam", the Sixth Circuit held that the de minimis defence does not apply to sound recordings at all. Its instruction was blunt: get a licence or do not sample. The reasoning rested on the statutory text giving a sound-recording owner the exclusive right to reproduce the actual sounds fixed in the recording.

In VMG Salsoul, LLC v. Ciccone (9th Cir. 2016), concerning a 0.23-second horn hit in Madonna's "Vogue", the Ninth Circuit expressly disagreed, holding that the ordinary de minimis rule applies to sound recordings as to everything else, and that a use too trivial for an average listener to recognise is not infringement. The court acknowledged it was creating a circuit split.

So the law depends on where you are sued, and the Supreme Court has not resolved it. In practice the split changes very little for working musicians, because the risk-averse answer dominates commercial reality: labels, distributors and streaming services require documented clearance regardless of circuit, and the cost of litigating a defence exceeds the cost of a licence for anyone without a major behind them. The honest lesson is that the practical rule is set by the industry's risk tolerance rather than by the case law — clear it, replay it, or use a source that is genuinely free.`,
          assignment: listen('Find the Funkadelic and Madonna recordings at issue in these two cases and listen for the disputed fragments. Post whether you could identify either one without being told where to look.'),
          resources: [
            { label: 'Wikipedia — Bridgeport Music, Inc. v. Dimension Films', url: 'https://en.wikipedia.org/wiki/Bridgeport_Music,_Inc._v._Dimension_Films' },
            { label: 'Wikipedia — VMG Salsoul, LLC v. Ciccone', url: 'https://en.wikipedia.org/wiki/VMG_Salsoul,_LLC_v._Ciccone' },
            { label: 'U.S. Copyright Office — Fair Use Index', url: 'https://www.copyright.gov/fair-use/' },
          ],
        },
        {
          id: 'law-06',
          title: 'Clearing a Sample: The Practical Process',
          blurb: 'Who you contact, in what order, what they ask for, and what it costs.',
          minutes: 15,
          standardIds: ['MU:Cn11.0', 'MU:Pr4.2'],
          body: `Start by identifying both rights holders. For the composition, search the public repertoire databases of the performing rights organisations — ASCAP, BMI and SESAC in the US, PRS in the UK — and the publisher will be listed. For the master, the label is normally printed on the release and the current owner can be traced through catalogue acquisitions. Sample-identification databases are useful for finding what a record itself sampled.

Then approach both, before you release anything. A clearance request typically includes the source track and precise timecodes, a rough of the new track, a description of how the sample is used and how prominently, the expected commercial scale, and the formats and territories. Publishers commonly respond by asking for a percentage of the new composition — anywhere from a token share to a majority for a prominent hook — plus sometimes an advance. Masters owners typically want a flat buyout, a royalty per unit, or both. Either side may simply say no, and estates and certain catalogues are known for refusing.

Three practical alternatives exist and professionals use all of them. Replay the part with session musicians, which eliminates the master negotiation entirely. Use a licensed sample library, where the licence is granted at purchase — read it, since some prohibit use in competing sample packs. Or use genuinely free sources: works whose copyright has expired, Creative Commons material with attribution as required, and community libraries like Freesound. Never assume that a recording being old, obscure, or freely downloadable makes it free to use — check the actual licence every time.`,
          assignment: listen('Pick a sample you would want to use and do the research: find the publisher and the master owner, and write down who you would have to email. Post what you found and how hard it was.'),
          resources: [
            { label: 'U.S. Copyright Office — public catalogue search', url: 'https://www.copyright.gov/public-records/' },
            { label: 'Creative Commons — licence chooser & explainer', url: 'https://creativecommons.org/share-your-work/' },
            { label: 'Freesound — CC-licensed sample library', url: 'https://freesound.org/' },
          ],
        },
        {
          id: 'law-07',
          title: 'The Public Domain, Creative Commons, and AI',
          blurb: 'What is genuinely free to use, and the unresolved question now sitting on top of all of it.',
          minutes: 16,
          standardIds: ['MU:Cn11.0', 'MU:Re9.1'],
          body: `The public domain is real and enormous. In the United States, works published before 1930 are in the public domain, with the window advancing every January. Under the Music Modernization Act, pre-1972 sound recordings enter the public domain on a schedule — recordings first published before 1923 are already free, with later years following in defined increments. This is exactly why IMSLP can host hundreds of thousands of scores, why the Internet Archive's 78 collections stream in full, and why the Library of Congress's National Jukebox exists. Note the recurring trap: a public-domain composition can still be under a live recording copyright, so a 2019 recording of a Beethoven symphony is not free even though the symphony is.

Creative Commons licences let creators grant permission in advance. CC0 waives rights entirely; CC BY requires attribution; CC BY-SA additionally requires derivatives to carry the same licence; the NC and ND variants exclude commercial and derivative use respectively and are therefore unusable for most released music. Read which one applies before you build on anything.

Generative AI is the open question. Models are trained on enormous corpora of recordings whose licensing status was rarely negotiated, and litigation over whether that training is fair use is active in multiple jurisdictions. Separately, voice cloning raises rights of publicity and, in some states, specific likeness statutes that are distinct from copyright altogether. Where this lands will be as consequential as Grand Upright was, and the honest position today is that nobody knows yet. What you can do is document your sources, prefer material whose licence you can point to, and be transparent about what a release contains.`,
          assignment: listen('Build a short piece using only public-domain or CC0 material, and keep a source list with a licence link for every element. Post the piece and the source list.'),
          resources: [
            { label: 'IMSLP — public-domain score library', url: 'https://imslp.org/wiki/Main_Page' },
            { label: 'Internet Archive — Great 78 Project (public-domain recordings)', url: 'https://archive.org/details/georgeblood' },
            { label: 'Creative Commons — about the licences', url: 'https://creativecommons.org/share-your-work/cclicenses/' },
          ],
        },
      ],
    },

    // ═══════════════════════════════════════════════════════════════════════
    // 6. A HISTORY OF POPULAR MUSIC
    // ═══════════════════════════════════════════════════════════════════════
    {
      id: 'popular',
      title: 'A History of Popular Music',
      blurb: 'Blues to jazz to gospel to soul to rock to hip-hop to the algorithm — one continuous story, mostly African-American, told as a chain of causes.',
      level: 'FOUNDATION',
      lessons: [
        {
          id: 'pop-01',
          title: 'Roots: Work Songs, Spirituals and the Delta',
          blurb: 'The music that everything after is downstream of, and the conditions that produced it.',
          minutes: 16,
          standardIds: ['MU:Cn11.0', 'MU:Re7.2'],
          body: `The blues emerged in the Mississippi Delta and across the American South in the decades after emancipation, out of field hollers, work songs, spirituals and West African musical practice carried through slavery. Its central technique is call and response — a leader states, a group answers — which structures work songs, gospel services, jazz solos, funk arrangements and rap ad-libs alike. Its tonality uses inflected, bent pitches that no European scale contains. Its lyric form, AAB, gives a singer thinking time and lets repetition build weight.

W. C. Handy published "Memphis Blues" in 1912 and Mamie Smith's "Crazy Blues" in 1920 sold in enough quantity to prove a Black audience existed for recordings, which created the "race records" market. Bessie Smith became the biggest-selling artist of the classic blues era. Meanwhile country blues players in the Delta — Charley Patton, Son House, Robert Johnson — developed a guitar style in which the instrument answers the voice and holds the rhythm at once.

Two things are essential to carry. First, the blues is not simply sad music; it is a form for confronting hardship publicly, with humour and defiance as often as grief. Second, the Great Migration moved millions of Black Americans north between 1916 and 1970, carrying this music to Chicago, Detroit and New York, where electrification and urban audiences transformed it. Almost every subsequent chapter in this track happens because of that movement of people.`,
          assignment: listen('Listen to a Lomax field recording of a work song and then to a Bessie Smith record. Post what survives between them and what the recording studio changed.'),
          resources: [
            { label: 'Library of Congress — John & Ruby Lomax 1939 Southern trip', url: 'https://www.loc.gov/collections/john-and-ruby-lomax/' },
            { label: 'Internet Archive — Great 78 Project (classic blues)', url: 'https://archive.org/details/georgeblood' },
            { label: 'Smithsonian Folkways — blues & folk catalogue', url: 'https://folkways.si.edu/' },
          ],
        },
        {
          id: 'pop-02',
          title: 'New Orleans to Swing: Jazz Becomes Popular Music',
          blurb: 'Collective improvisation, then Armstrong\'s soloist, then a dance craze that ran a decade.',
          minutes: 16,
          standardIds: ['MU:Re7.2', 'MU:Cn11.0'],
          body: `New Orleans at the turn of the 20th century had brass bands, Caribbean rhythm, ragtime, blues, opera and a Creole musical tradition in the same square mile. Early jazz came out of that collision: a front line of cornet, clarinet and trombone improvising simultaneously around a melody over a rhythm section. Jelly Roll Morton, who claimed to have invented it, at least demonstrated it could be composed as well as improvised.

Louis Armstrong changed the music's centre of gravity. In the Hot Five and Hot Seven recordings of 1925–28 he moved the emphasis from collective polyphony to the individual soloist, and his rhythmic conception — phrasing across the beat rather than on it — is essentially where swing comes from. "West End Blues" opens with an unaccompanied cadenza that musicians were still studying decades later. He also popularised scat and, as important, established the idea that a jazz performance is an act of personal expression.

By the mid-1930s the big bands made this the mainstream popular music of the United States. Count Basie's Kansas City band ran on riffs and an unrivalled rhythm section; Duke Ellington wrote for the specific players in his orchestra, treating the band as an instrument and producing a body of composition that stands with any American music of the century; Benny Goodman's success as a white bandleader playing Fletcher Henderson's arrangements is an early, explicit case of a pattern that repeats throughout this track.`,
          assignment: listen('Listen to "West End Blues" and pay attention only to the opening cadenza. Post what makes it sound like a statement of intent rather than an introduction.'),
          resources: [
            { label: 'Library of Congress — National Jukebox', url: 'https://www.loc.gov/collections/national-jukebox/' },
            { label: 'Internet Archive — Great 78 Project (jazz era)', url: 'https://archive.org/details/georgeblood' },
            { label: 'Library of Congress — National Recording Registry', url: 'https://www.loc.gov/programs/national-recording-preservation-board/recording-registry/complete-national-recording-registry-listing/' },
          ],
        },
        {
          id: 'pop-03',
          title: 'Bebop and the Break with Entertainment',
          blurb: 'A small group of musicians deliberately made jazz difficult, and turned popular music into art music in about five years.',
          minutes: 15,
          standardIds: ['MU:Re7.2', 'MU:Re8.1'],
          body: `In the early 1940s, at Minton's Playhouse in Harlem and elsewhere, Charlie Parker, Dizzy Gillespie, Thelonious Monk, Kenny Clarke and Bud Powell built something the swing bands could not absorb. Tempos went beyond dancing speed. Harmony grew dense with substitutions and extended chords. Melodies were angular and asymmetric. The drummer moved timekeeping to the ride cymbal and used bass drum and snare for irregular accents — "dropping bombs" — so the pulse became implied rather than pounded.

Some of this was aesthetic and some of it was economic and political. A wartime recording ban, the collapse of the big-band economy, and a refusal to be entertainers for white audiences all fed into a music that demanded to be listened to. Parker's improvised lines are among the most studied melodic material of the century; his 1945–48 recordings remain a curriculum in themselves.

The consequence was a permanent split. Jazz moved into concert halls and away from the popular mainstream, and the space it vacated was filled by rhythm and blues, and then rock and roll. Everything the rest of this track describes happens partly because jazz chose complexity — a reminder that popular music history is driven by economics and audiences at least as much as by aesthetics.`,
          assignment: listen('Listen to a Charlie Parker recording and try to clap along. Post where you lost it, and what the rhythm section is doing that makes the pulse hard to hold.'),
          resources: [
            { label: 'Library of Congress — National Recording Registry', url: 'https://www.loc.gov/programs/national-recording-preservation-board/recording-registry/complete-national-recording-registry-listing/' },
            { label: 'Internet Archive — Great 78 Project', url: 'https://archive.org/details/georgeblood' },
            { label: 'Wikipedia — Bebop', url: 'https://en.wikipedia.org/wiki/Bebop' },
          ],
        },
        {
          id: 'pop-04',
          title: 'Gospel, R&B, and the Birth of Rock and Roll',
          blurb: 'Electrified blues plus gospel fervour plus a teenage market — and a distribution system built on covering Black records.',
          minutes: 16,
          standardIds: ['MU:Cn11.0', 'MU:Re9.1'],
          body: `Gospel professionalised in the 1930s and 40s around Thomas A. Dorsey's compositions and singers like Mahalia Jackson and Sister Rosetta Tharpe — whose distorted electric guitar in the 1940s is, by any reasonable listening, rock guitar before rock existed. Gospel supplied the vocal technique that everything after would use: melisma, the shout, dynamic escalation to a climax, and the call-and-response between soloist and choir.

Rhythm and blues in the late 1940s was small-combo blues with a heavy backbeat, jump rhythm and honking tenor sax, sold to Black audiences by independent labels. When white teenagers began buying it — and when radio, television and disposable income created a teenage market for the first time — the music was renamed rock and roll and its audience broadened enormously.

The industry's mechanism for that broadening was the cover version. Pat Boone's sanitised recordings of Little Richard and Fats Domino outsold the originals on pop charts, and the songwriters got paid while the recording artists often did not. Chuck Berry's storytelling and guitar vocabulary, Little Richard's screamed intensity, and Elvis Presley's synthesis of blues, gospel and country all belong to the same moment. Understanding rock and roll requires holding both facts at once: it was a genuine musical fusion, and it was distributed through a system that systematically transferred value from Black artists to white ones.`,
          assignment: listen('Find an original R&B recording and its 1950s pop cover. Post both, and describe what specifically was removed in the cover — usually it is rhythmic and vocal, not harmonic.'),
          resources: [
            { label: 'Library of Congress — National Recording Registry', url: 'https://www.loc.gov/programs/national-recording-preservation-board/recording-registry/complete-national-recording-registry-listing/' },
            { label: 'Smithsonian Folkways — gospel & sacred music', url: 'https://folkways.si.edu/explore' },
            { label: 'Internet Archive — Great 78 Project', url: 'https://archive.org/details/georgeblood' },
          ],
        },
        {
          id: 'pop-05',
          title: 'Soul: Motown, Stax, and the Sound of the Sixties',
          blurb: 'Gospel technique applied to secular songs, produced by two houses with opposite philosophies.',
          minutes: 16,
          standardIds: ['MU:Re7.2', 'MU:Re9.1'],
          body: `Soul is what happens when gospel singing is turned on secular subject matter. Ray Charles did it explicitly and controversially in the mid-1950s, rewriting gospel songs with romantic lyrics; Sam Cooke crossed from the Soul Stirrers to pop and became the model for the soul singer as a complete artist. Aretha Franklin, floundering at Columbia as a jazz-pop vocalist, went to Atlantic and to Muscle Shoals in 1967 and made records that are simply the standard against which the genre is measured.

Two production houses defined the sound in opposite ways. Motown in Detroit, under Berry Gordy, ran on a factory model: staff writers such as Holland–Dozier–Holland, an in-house band (the Funk Brothers) on nearly everything, quality-control meetings, and a deliberate aim at a crossover pop audience — records mixed to sound good on a car radio, arrangements tight and bright. Stax in Memphis was the mirror image: an integrated house band in Booker T. and the M.G.'s, recording largely live in a converted cinema, with a rawer, drier, more rhythm-forward sound.

By the end of the decade soul had become a vehicle for something larger. Marvin Gaye's What's Going On (1971), made against Gordy's objections, is a suite about war, poverty and ecology; Curtis Mayfield and Stevie Wonder — the latter having won unprecedented creative control at 21 — made albums that treat popular music as a serious authorial medium. This is the point at which soul and rock converge on the same ambition from different directions.`,
          assignment: listen('Play a Motown single and a Stax single back to back at the same volume. Post three specific production differences you can hear — think about drums, reverb and where the vocal sits.'),
          resources: [
            { label: 'Library of Congress — National Recording Registry', url: 'https://www.loc.gov/programs/national-recording-preservation-board/recording-registry/complete-national-recording-registry-listing/' },
            { label: 'Smithsonian Folkways — African-American music collections', url: 'https://folkways.si.edu/explore' },
            { label: 'Wikipedia — Soul music', url: 'https://en.wikipedia.org/wiki/Soul_music' },
          ],
        },
        {
          id: 'pop-06',
          title: 'Rock: The Album, the Studio, and the Split',
          blurb: 'From three-minute singles to the LP as a statement, and then into a dozen mutually hostile subgenres.',
          minutes: 16,
          standardIds: ['MU:Re9.1', 'MU:Cr1.1'],
          body: `The mid-1960s turned rock from a singles business into an album art form in about three years. The Beatles, Brian Wilson, Dylan going electric, and the general availability of multitrack recording combined so that a record could be a composed object with no live equivalent. Rubber Soul and Pet Sounds explicitly pushed each other; Sgt. Pepper is the point at which the album's status as a unified statement became the mainstream assumption.

The studio became an instrument. Producers and engineers — George Martin, Phil Spector, Glyn Johns, Eddie Kramer — were now co-authors, and techniques such as varispeed, tape loops, artificial double tracking, close-miked drums and deliberate distortion became compositional choices. Simultaneously the electric guitar's vocabulary expanded past recognition through Hendrix, whose feedback and controlled distortion treated amplifier behaviour as musical material.

Then it fragmented. Hard rock and metal pursued weight and volume; progressive rock pursued form and virtuosity; punk in 1976 rejected both in favour of speed, brevity and access; post-punk immediately reintroduced complexity from a different angle. Each split was as much sociological as musical — about who was allowed to make music, and what counted as competence. That argument never resolved, and it recurs identically in every genre that follows.`,
          assignment: listen('Listen to a 1965 rock single and a 1972 album track by artists in the same lineage. Post what became possible in seven years, and what was lost.'),
          resources: [
            { label: 'Internet Archive — Live Music Archive (artist-authorised)', url: 'https://archive.org/details/etree' },
            { label: 'Library of Congress — National Recording Registry', url: 'https://www.loc.gov/programs/national-recording-preservation-board/recording-registry/complete-national-recording-registry-listing/' },
            { label: 'Wikipedia — Album era', url: 'https://en.wikipedia.org/wiki/Album_era' },
          ],
        },
        {
          id: 'pop-07',
          title: 'Disco, Dub, and the Twelve-Inch',
          blurb: 'Two parallel revolutions that gave the DJ the tools to become the author.',
          minutes: 15,
          standardIds: ['MU:Re7.1', 'MU:Cn11.0'],
          body: `Disco emerged from Black, Latino and gay club culture in early-1970s New York — at David Mancuso's Loft and then the clubs that followed — and its innovations were structural. The four-on-the-floor kick gave a continuous pulse that made beatmatching possible. The twelve-inch single, first cut as a promotional necessity, allowed longer tracks with more level and better bass response, and produced the extended mix: a version arranged for the dance floor rather than the radio, with long intros and outros designed to be mixed.

In Jamaica, dub developed the same decade from a different root. Engineers such as King Tubby and Lee "Scratch" Perry took existing reggae multitracks and remixed them radically — dropping the vocal, foregrounding the drum and bass, and drenching elements in tape echo and spring reverb as a live performance at the mixing desk. The B-side version became standard, and with it the idea that a recording is raw material for further authorship. Every remix culture since descends from this.

Both threads converge in the hands of DJs. Once you have long dance-floor edits, isolated instrumental versions, and two turntables, the person selecting and mixing records is making music. Disco's abrupt commercial backlash in 1979 — a demolition night at a baseball stadium, an industry retreat with unmistakable racial and homophobic subtext — did not kill it. It went underground and reappeared as house in Chicago and techno in Detroit within five years.`,
          assignment: listen('Find a reggae track and its dub version. Post what was removed, what was pushed forward, and whether the dub is a lesser or a different work.'),
          resources: [
            { label: 'Internet Archive — free audio collections', url: 'https://archive.org/details/audio_music' },
            { label: 'Smithsonian Folkways — Caribbean collections', url: 'https://folkways.si.edu/explore' },
            { label: 'Wikipedia — Dub (music)', url: 'https://en.wikipedia.org/wiki/Dub_music' },
          ],
        },
        {
          id: 'pop-08',
          title: 'Hip-Hop: From the Break to the Dominant Form',
          blurb: 'A party technique in the Bronx becomes the most commercially and culturally significant music on earth.',
          minutes: 17,
          standardIds: ['MU:Cn11.0', 'MU:Cr1.1', 'MU:Re9.1'],
          body: `Hip-hop begins as a set of practices rather than a genre: DJ Kool Herc extending breaks on two turntables from 1973, Afrika Bambaataa building an eclectic record-selection philosophy and an organisation around it, Grandmaster Flash developing precise cutting and the crossfader techniques still used today, and MCs who began as hype men for the DJ and grew into the focal point. "Rapper's Delight" (1979) put it on record; Grandmaster Flash and the Furious Five's "The Message" (1982) proved it could carry serious social subject matter.

The sampler industrialised it. Once an E-mu SP-1200 or an Akai MPC could store, chop and sequence recorded sound, the DJ's technique became a production method, and the mid-to-late 1980s produced records of extraordinary collage density — Marley Marl, the Bomb Squad, Prince Paul, Pete Rock, DJ Premier. Grand Upright then ended that economy, and the music adapted by sampling less and building more.

Regionalisation drove the next thirty years: the West Coast's G-funk, the South's bass and then the Atlanta trap sound that now defines the global rhythmic mainstream, Houston's chopped-and-screwed, drill in Chicago and then London. By the late 2010s hip-hop was the most-consumed genre in the United States and its production language — 808 sub-bass, triplet hi-hats, sung-rapped vocal melody — had become the default grammar of international pop. Note the historical shape: it is exactly the arc the blues, jazz, and rock and roll each took, compressed and repeated.`,
          assignment: listen('Trace one sample across three generations — an original record, a hip-hop track that sampled it, and a later track that sampled that. Post the chain.'),
          resources: [
            { label: 'Library of Congress — National Recording Registry', url: 'https://www.loc.gov/programs/national-recording-preservation-board/recording-registry/complete-national-recording-registry-listing/' },
            { label: 'WhoSampled — sample genealogy database', url: 'https://www.whosampled.com/' },
            { label: 'Wikipedia — History of hip-hop', url: 'https://en.wikipedia.org/wiki/Roots_of_hip_hop' },
          ],
        },
        {
          id: 'pop-09',
          title: 'House, Techno, and the Global Electronic Diaspora',
          blurb: 'Chicago, Detroit, and how two American cities exported a music the American mainstream ignored.',
          minutes: 15,
          standardIds: ['MU:Re7.2', 'MU:Cn11.0'],
          body: `House takes its name from Chicago's Warehouse, where Frankie Knuckles played disco to a largely Black and gay crowd after disco's commercial collapse, extending and reworking records with a drum machine to keep the floor moving. Producers including Jesse Saunders, Marshall Jefferson and Larry Heard began making original tracks on cheap Roland gear; the TR-909's kick and the TB-303's misused filter sweep became acid house.

Techno developed in parallel in Detroit through Juan Atkins, Derrick May and Kevin Saunderson — three suburban school friends whose music married European electronic influence (Kraftwerk especially) to a specifically Detroit, post-industrial futurism. It is worth being precise about this: techno is Black American music with an explicitly Afrofuturist conception, and the widespread European framing of it as a European genre is a historical error.

Both travelled to the UK and continental Europe and detonated. Acid house and the 1988–89 rave period, then the rapid speciation into jungle and drum and bass, UK garage, grime, dubstep, and every subsequent branch; in Berlin, techno became civic infrastructure. Meanwhile the American mainstream largely ignored all of it until the 2010s EDM boom re-imported a commercialised version. The pattern of Black American innovation, foreign adoption, and delayed domestic recognition is by this point the single most reliable structure in this entire track.`,
          assignment: listen('Listen to an early Detroit techno record and a mainstream EDM track. Post what survived the journey and what was replaced.'),
          resources: [
            { label: 'Internet Archive — electronic music & DJ sets', url: 'https://archive.org/details/audio_music' },
            { label: 'Wikipedia — Detroit techno', url: 'https://en.wikipedia.org/wiki/Detroit_techno' },
            { label: 'Library of Congress — National Recording Registry', url: 'https://www.loc.gov/programs/national-recording-preservation-board/recording-registry/complete-national-recording-registry-listing/' },
          ],
        },
        {
          id: 'pop-10',
          title: 'The Present: Genre Collapse and the Algorithm',
          blurb: 'What happens to popular music when distribution is free, genre stops signifying, and a recommender decides what you hear.',
          minutes: 16,
          standardIds: ['MU:Re9.1', 'MU:Cn11.0'],
          body: `Three changes define the current period. Production tools became free or nearly so, meaning a bedroom laptop can produce a commercially competitive record and the label's historical monopoly on studio access is gone. Distribution became free, meaning anyone can put a track on every major service for a small annual fee. And discovery became algorithmic, meaning the gatekeeping function moved from A&R and radio programmers to recommender systems trained on aggregate listening behaviour.

Genre has consequently stopped functioning as an identity and started functioning as a set of production signifiers to be combined. An artist can make a country-trap record, a hyperpop record and a folk record in one year, and the audience — which no longer inherits a record collection from a scene — largely does not object. The playlist has replaced the genre as the organising unit, and playlists are organised by mood and activity rather than by musical lineage.

The consequences are genuinely mixed and worth holding without resolving. More people can make and release music than at any point in history, which is unambiguously good. Recorded-music income concentrates severely at the top and touring has become the primary revenue for almost everyone else. Recommenders optimise for engagement and tend to narrow rather than broaden exposure. And the material we have been studying — the sample, the break, the field recording, the master tape — now sits inside training corpora whose legal status is unresolved. The 150-year arc of this curriculum is still running, and you are inside the part that has not been written yet.`,
          assignment: listen('Make a playlist of ten tracks released in the last two years that you cannot assign to a single genre. Post it with one sentence per track naming the two traditions it is drawing from.'),
          resources: [
            { label: 'Library of Congress — National Recording Registry', url: 'https://www.loc.gov/programs/national-recording-preservation-board/recording-registry/complete-national-recording-registry-listing/' },
            { label: 'Internet Archive — Live Music Archive', url: 'https://archive.org/details/etree' },
            { label: 'Smithsonian Folkways — the permanent archive model', url: 'https://folkways.si.edu/' },
          ],
        },
      ],
    },
  ],
};

export default CHORA_CURRICULUM;
