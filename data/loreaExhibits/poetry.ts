// Lorea Exhibition Hall — Poetry. Hand-authored by the Writers Council in the council's shape.
import type { LoreaExhibit } from '../../services/loreaExhibits/loreaExhibitTypes';

export const POETRY_EXHIBIT: LoreaExhibit = {
  id: 'poetry',
  title: 'The House of Small Lightnings',
  kicker: 'Wing of Poetry',
  tagline: 'A poem is language under pressure. Step inside and feel what a few words can do.',
  epigraph: { text: 'Hope is the thing with feathers / That perches in the soul', cite: 'Emily Dickinson (1891)' },
  materials: { paper: 'washi', ink: 'indigo', wash: ['#f4c6d0', '#c9dfc0'], accent: '#d1495b', hand: 'script', motif: 'lyre' },
  council: {
    source: 'authored',
    art: { lead: 'WORLD_ECLECTIC', counterpoint: 'RADICAL_MINIMAL', note: 'Washi paper and brushed indigo, with petal-pink and moss washes; lots of white space, because white space is part of every poem.' },
    writers: { note: 'Never explain a poem before the reader has heard it: read first, then open the hood together.' },
  },
  academia: { subjects: ['ELA', 'Literature', 'Poetry', 'Creative Writing'], bands: ['early', 'elementary', 'middle', 'high', 'university'] },
  rooms: [
    {
      id: 'image',
      title: 'The Image Room',
      subtitle: 'Say the thing so clearly it appears.',
      nodes: [
        {
          id: 'image-wall',
          title: 'Pictures made of words',
          kind: 'example',
          text: {
            early: 'A poem can make a picture in your head. Close your eyes: fog walking on little cat feet!',
            elementary: 'An image is a word-picture. Carl Sandburg says fog comes “on little cat feet.” Now you can see — and almost hear — how quietly fog arrives.',
            middle: 'Poets build images out of concrete nouns and sensory detail, and often compare one thing to another (metaphor). Sandburg never says “fog is like a cat” — he just gives the fog paws.',
            high: 'Imagism (Pound, H.D., Amy Lowell, c. 1912–1917) demanded “direct treatment of the thing” and no unnecessary words. Pound’s Metro poem is two lines: an image, and a second image laid against it with no verb between them.',
            university: 'Pound’s “A Few Don’ts by an Imagiste” (Poetry, 1913) defined the image as “that which presents an intellectual and emotional complex in an instant of time.” His Metro poem enacts superposition — juxtaposition borrowed from his reading of haiku — leaving the reader to perform the metaphor. Compare T. E. Hulme’s argument for “dry, hard” classical verse.',
          },
          lens: 'simile',
          examples: [
            {
              id: 'sandburg-fog', work: 'Fog (Chicago Poems)', author: 'Carl Sandburg', year: '1916',
              passage: 'The fog comes\non little cat feet.\n\nIt sits looking\nover harbor and city\non silent haunches\nand then moves on.',
              marks: ['on little cat feet', 'on silent haunches'],
              note: 'A metaphor that never announces itself. The fog is a cat for six lines, and then it leaves.',
            },
            {
              id: 'pound-metro', work: 'In a Station of the Metro', author: 'Ezra Pound', year: '1913',
              passage: 'The apparition of these faces in the crowd;\nPetals on a wet, black bough.',
              marks: ['Petals on a wet, black bough'],
              note: 'Two pictures, side by side, with no “like.” Your mind builds the bridge — and that click is the poem.',
            },
          ],
        },
        {
          id: 'daffodil-hunt',
          title: 'Hunt the comparisons',
          kind: 'station',
          minDepth: 'elementary',
          text: {
            early: 'The poet feels lonely like a cloud. Can you find the cloud?',
            elementary: 'Wordsworth compares himself to something in the sky, and the flowers to a big group of people. Tap both comparisons.',
            middle: 'Find the simile (“as a cloud”) and the metaphor hidden in “crowd” and “host.” Flowers become a gathering — the loneliness ends when the crowd appears.',
            high: 'Track the movement from simile to personifying metaphor. “Host” carries a double sense — a multitude and an army of angels — elevating daffodils into something almost sacred.',
            university: 'Wordsworth’s 1807 lyric, revised in 1815, dramatizes the Preface’s theory of “emotion recollected in tranquillity.” The figurative shift from solitary cloud to “crowd” and “host” enacts the Romantic movement from isolated self to communion with nature.',
          },
          station: {
            kind: 'hunt',
            prompt: 'Tap the simile, then the two words that turn flowers into a gathering of people.',
            passage: 'I wandered lonely as a cloud\nThat floats on high o’er vales and hills,\nWhen all at once I saw a crowd,\nA host, of golden daffodils;',
            cite: 'William Wordsworth, I Wandered Lonely as a Cloud (1807)',
            targets: [
              { text: 'lonely as a cloud', label: 'Simile' },
              { text: 'a crowd', label: 'Metaphor: flowers as people' },
              { text: 'A host', label: 'Metaphor: a multitude (even angels)' },
            ],
          },
        },
      ],
    },
    {
      id: 'line',
      title: 'The Line Break',
      subtitle: 'Where a poem breathes, it means.',
      nodes: [
        {
          id: 'wheelbarrow',
          title: 'Same words, different poem',
          kind: 'station',
          text: {
            early: 'A poem goes down the page in short pieces. Flip the card and see the words as a poem!',
            elementary: 'Poets choose where every line ends. Flip between the sentence and the poem: which one makes you look harder at the wheelbarrow?',
            middle: 'The line break is a tool that prose doesn’t have. Williams splits “wheel / barrow” and “rain / water” so each word gets its own moment of attention.',
            high: 'Enjambment (running a sentence across the line break) creates suspense and double readings; each break is a micro-pause that reweights the word before and after it.',
            university: 'Williams’ poem (Spring and All, 1923) is the touchstone for the claim that lineation itself is semantic. John Hollander and others have analyzed the break as a “visual prosody”: the page’s white space becomes a measure, independent of accentual meter.',
          },
          station: {
            kind: 'remix',
            prompt: 'Flip the card. The words never change — only the line breaks.',
            variants: [
              { label: 'As a sentence', text: 'so much depends upon a red wheel barrow glazed with rain water beside the white chickens', note: 'Read as a sentence, it is a plain observation about a farmyard.' },
              { label: 'As Williams wrote it', text: 'so much depends\nupon\n\na red wheel\nbarrow\n\nglazed with rain\nwater\n\nbeside the white\nchickens', note: 'Now each line is a camera shot: wheel… barrow… rain… water. Every pause makes you look again.' },
              { label: 'Your break', text: 'so much\ndepends upon a red\nwheel barrow glazed\nwith rain water beside\nthe white chickens', note: 'A different set of breaks gives a different poem — busier and blurrier. Line breaks are choices.' },
            ],
          },
        },
        {
          id: 'reorder-fog',
          title: 'Put the poem back together',
          kind: 'station',
          text: {
            early: 'Oh no, the poem got mixed up! Put the lines back in order.',
            elementary: 'Drag the lines of Sandburg’s fog poem into an order that makes sense. Hint: the fog arrives, sits, then leaves.',
            middle: 'Rebuild the poem. Notice that the structure is a tiny story: arrival, pause, departure.',
            high: 'Reconstruct the poem and observe its narrative shape in six short lines; the brevity mirrors the subject’s transience.',
            university: 'Reassembly exercise: the poem’s syntax is a single continuous action whose lineation produces the cat’s stillness — the delay across “looking / over harbor and city / on silent haunches” is the haunch-sit itself.',
          },
          station: {
            kind: 'sort',
            prompt: 'Drag the lines into order.',
            shape: 'line',
            items: [
              { id: 'f1', label: 'The fog comes' },
              { id: 'f2', label: 'on little cat feet.' },
              { id: 'f3', label: 'It sits looking' },
              { id: 'f4', label: 'over harbor and city' },
              { id: 'f5', label: 'on silent haunches' },
              { id: 'f6', label: 'and then moves on.' },
            ],
            reveal: 'Carl Sandburg, “Fog” (1916). Six lines, one cat, no rhyme — and you always know exactly where you are.',
          },
        },
      ],
    },
    {
      id: 'sound',
      title: 'The Sound Garden',
      subtitle: 'Poems were songs before they were pages.',
      nodes: [
        {
          id: 'raven-hunt',
          title: 'Hear the echoes',
          kind: 'station',
          lens: 'alliteration',
          text: {
            early: 'Say it out loud: “weak and weary.” Do you hear the two W sounds? That’s a sound pattern!',
            elementary: 'Poe fills his poem with matching sounds. Some words start the same (alliteration) and some rhyme inside the line. Tap them!',
            middle: 'Find the internal rhyme (dreary / weary) and the alliteration. Poe said he built “The Raven” for effect — sound first.',
            high: 'Poe’s trochaic octameter is loaded with internal rhyme and alliteration; in “The Philosophy of Composition” (1846) he claims he chose every sound effect deliberately, including the refrain “Nevermore” for its long o and r.',
            university: 'Poe’s “Philosophy of Composition” is a provocation: a retrospective rationalization of “The Raven” as engineered effect. Read it alongside the poem’s dense acoustic patterning (internal rhyme, alliteration, assonance) and ask whether sound here is ornament or the poem’s actual semantic engine.',
          },
          station: {
            kind: 'hunt',
            prompt: 'Tap the inside-the-line rhyme, the alliteration, and the pair of hard “k” sounds.',
            passage: 'Once upon a midnight dreary, while I pondered, weak and weary,\nOver many a quaint and curious volume of forgotten lore—',
            cite: 'Edgar Allan Poe, The Raven (1845)',
            targets: [
              { text: 'dreary', label: 'Internal rhyme' },
              { text: 'weary', label: 'Internal rhyme' },
              { text: 'weak and weary', label: 'Alliteration (w)' },
              { text: 'quaint and curious', label: 'Alliteration (hard k sound)' },
            ],
          },
          examples: [
            {
              id: 'tyger', work: 'The Tyger (Songs of Experience)', author: 'William Blake', year: '1794',
              passage: 'Tyger Tyger, burning bright,\nIn the forests of the night;\nWhat immortal hand or eye,\nCould frame thy fearful symmetry?',
              marks: ['burning bright', 'fearful symmetry'],
              note: 'Hear the b-b and f-f. The rhythm pounds like a hammer on an anvil — fitting for a poem about who forged the tiger.',
            },
          ],
        },
        {
          id: 'beat',
          title: 'A heartbeat in the line',
          kind: 'station',
          minDepth: 'middle',
          text: {
            early: 'Clap it: TY-ger TY-ger BURN-ing BRIGHT. Some parts are loud, some are soft.',
            elementary: 'Every word has strong and soft parts. When poets line up the strong parts in a pattern, you get a beat.',
            middle: 'Tap the stressed syllables. Blake’s line goes STRONG-soft; Shakespeare’s goes soft-STRONG. These patterns are called meter (there is a whole Rhythm wing about it).',
            high: 'Blake writes trochaic tetrameter with a dropped final syllable (catalexis); Shakespeare’s sonnet line is iambic pentameter. Scansion is a reading, not a law — but these lines scan cleanly.',
            university: 'Scansion follows the accentual-syllabic tradition codified for English by Saintsbury’s History of English Prosody (1906–10). Note the reversed tension: the trochaic line feels incantatory, the iambic line conversational — the meter itself encodes register.',
          },
          station: {
            kind: 'stress',
            prompt: 'Tap the syllables that get the beat. Then check.',
            lines: [
              { syllables: ['Ty', 'ger', 'Ty', 'ger', 'burn', 'ing', 'bright'], stresses: [0, 2, 4, 6], meter: 'Trochaic tetrameter (last soft beat dropped)', cite: 'William Blake, The Tyger' },
              { syllables: ['Shall', 'I', 'com', 'pare', 'thee', 'to', 'a', 'sum', 'mer’s', 'day'], stresses: [1, 3, 5, 7, 9], meter: 'Iambic pentameter', cite: 'William Shakespeare, Sonnet 18' },
            ],
          },
        },
      ],
    },
    {
      id: 'forms',
      title: 'The Gallery of Forms',
      subtitle: 'A shape is a promise; breaking it is a surprise.',
      nodes: [
        {
          id: 'forms-wall',
          title: 'Sonnet, ballad, free verse',
          kind: 'example',
          text: {
            early: 'Poems come in shapes. Some are short, some tell stories, some rhyme, and some don’t!',
            elementary: 'A sonnet has 14 lines. A ballad tells a story in short verses, often with a repeating line. Free verse has no set pattern — the poet invents it each time.',
            middle: 'Forms are rules poets choose. The sonnet (14 lines) usually turns its argument near the end; the ballad uses four-line stanzas made to be sung; free verse trades fixed meter for the rhythm of speech, like Whitman’s long lines.',
            high: 'Form is meaning: the Shakespearean sonnet’s three quatrains and couplet build an argument and a clinching turn; the ballad stanza’s alternating 4- and 3-beat lines come from oral song; Whitman’s free verse draws on the cadences of the King James Bible.',
            university: 'The sonnet migrated from Petrarch’s Italian (octave/sestet with a volta) to Wyatt and Surrey, and Shakespeare’s 4-4-4-2 form. The ballad’s common meter descends from oral tradition (Child Ballads, collected 1882–98). Whitman’s line has been read as parallelism derived from Hebrew poetry (Robert Lowth’s 1753 lectures identified biblical parallelism) — free verse is not formless but differently formed.',
          },
          lens: 'first-person',
          examples: [
            {
              id: 'sonnet18', work: 'Sonnet 18', author: 'William Shakespeare', year: '1609',
              passage: 'Shall I compare thee to a summer’s day?\nThou art more lovely and more temperate:\nRough winds do shake the darling buds of May,\nAnd summer’s lease hath all too short a date;',
              marks: ['Shall I compare thee', 'summer’s lease'],
              note: 'He asks a question and then argues with it: a summer day is not good enough. A sonnet is an argument that rhymes.',
            },
            {
              id: 'ancient-mariner', work: 'The Rime of the Ancient Mariner', author: 'Samuel Taylor Coleridge', year: '1798',
              passage: 'Water, water, every where,\nAnd all the boards did shrink;\nWater, water, every where,\nNor any drop to drink.',
              marks: ['Water, water, every where'],
              note: 'A ballad stanza: four lines, beats of 4-3-4-3, rhyme on lines 2 and 4, and a repetition you can’t forget.',
            },
            {
              id: 'whitman-self', work: 'Song of Myself (Leaves of Grass)', author: 'Walt Whitman', year: '1855', gutenbergId: '1322',
              passage: 'I celebrate myself, and sing myself,\nAnd what I assume you shall assume,\nFor every atom belonging to me as good belongs to you.',
              marks: ['I celebrate myself', 'every atom'],
              note: 'No rhyme, no fixed meter — but listen to the repeats and the lines growing longer. That is free verse’s music.',
            },
          ],
        },
        {
          id: 'form-choice',
          title: 'Name that form',
          kind: 'station',
          text: {
            early: 'Listen to the “Water, water” poem. Does it tell a story or describe a picture?',
            elementary: 'Look at the Coleridge verse: four lines, a repeated line, rhymes on lines 2 and 4. What form is it?',
            middle: 'Use the clues — stanza length, rhyme scheme, repetition — to name the form.',
            high: 'Identify the stanza form by its metrical and rhyme features rather than by subject.',
            university: 'Classify by prosodic evidence: alternating tetrameter and trimeter, x-a-x-a rhyme, narrative refrain.',
          },
          station: {
            kind: 'choice',
            question: '“Water, water, every where, / Nor any drop to drink.” Which form is this stanza from?',
            options: [
              { text: 'A ballad', correct: true, why: 'Right! Four short lines, rhyme on lines 2 and 4, a 4-3-4-3 beat and a repeated line — all built to be sung and remembered.' },
              { text: 'A sonnet', why: 'A sonnet has 14 lines and builds an argument. This is a 4-line verse from a long story-poem.' },
              { text: 'A haiku', why: 'A haiku is three short lines catching one moment. This verse rhymes and is part of a long tale.' },
              { text: 'Free verse', why: 'Free verse avoids a fixed pattern. This stanza has a very regular beat and rhyme.' },
            ],
          },
        },
        {
          id: 'only-poem',
          title: 'What only a poem can do',
          kind: 'wall',
          text: {
            early: 'Poems are short, but they can hold a giant feeling, like hope with feathers!',
            elementary: 'Emily Dickinson calls hope “the thing with feathers.” Hope is now a little bird that sings inside you. A poem can make an idea into something alive.',
            middle: 'Poetry compresses. In two lines Dickinson turns an abstract idea into a creature, gives it a home (the soul) and a song. Prose would need a paragraph — and would lose the music.',
            high: 'Poetry’s compression and patterning let it hold contradictions and multiple meanings at once. Dickinson’s dashes and slant rhymes create pauses and ambiguities prose would smooth away.',
            university: 'Coleridge defined poetry as “the best words in the best order” (Table Talk, 1827); the New Critics later treated the poem as a closed system of tensions and paradox. Roman Jakobson’s “poetic function” — projecting equivalence from selection onto combination — names exactly what the line, the rhyme and the image do that prose rarely attempts.',
          },
        },
      ],
    },
  ],
  nuggets: [
    { id: 'poetry-n1', exhibitId: 'poetry', roomId: 'image', hook: 'Fog has cat feet. A poet proved it in 1916', body: 'Carl Sandburg never says fog is like a cat. He just gives it paws — and you can’t unsee it.', quote: { text: 'The fog comes / on little cat feet.', cite: 'Carl Sandburg' } },
    { id: 'poetry-n2', exhibitId: 'poetry', roomId: 'line', hook: 'Split “wheelbarrow” in half and it becomes a poem', body: 'William Carlos Williams broke one sentence into tiny lines so every word gets its own moment. Flip the card and watch it happen.' },
    { id: 'poetry-n3', exhibitId: 'poetry', roomId: 'sound', hook: 'Poe chose “Nevermore” for how it sounds', body: 'He claimed he wanted a long “o” and a rolling “r” for maximum gloom. Come hear the echoes in The Raven.', quote: { text: 'Once upon a midnight dreary…', cite: 'Edgar Allan Poe' } },
    { id: 'poetry-n4', exhibitId: 'poetry', roomId: 'sound', hook: 'Clap along: TY-ger TY-ger BURN-ing BRIGHT', body: 'Poems have heartbeats. Tap the loud parts and you’ve just done what poets call scansion.', depths: ['early', 'elementary'] },
    { id: 'poetry-n5', exhibitId: 'poetry', roomId: 'forms', hook: 'A sonnet is an argument that rhymes', body: 'Fourteen lines, a question, and a twist at the end. Shakespeare spends one asking if a summer’s day is good enough.', quote: { text: 'Shall I compare thee to a summer’s day?', cite: 'William Shakespeare' } },
    { id: 'poetry-n6', exhibitId: 'poetry', roomId: 'forms', hook: 'Hope is a bird. Emily Dickinson can prove it', body: 'In two lines she turns an idea into a living creature. That trick is what poems do better than anything else.', quote: { text: 'Hope is the thing with feathers', cite: 'Emily Dickinson' }, depths: ['early', 'elementary', 'middle'] },
  ],
};
