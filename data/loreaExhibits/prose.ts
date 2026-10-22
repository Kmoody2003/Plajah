// Lorea Exhibition Hall — Prose. Hand-authored by the Writers Council in the council's shape.
import type { LoreaExhibit } from '../../services/loreaExhibits/loreaExhibitTypes';

export const PROSE_EXHIBIT: LoreaExhibit = {
  id: 'prose',
  title: 'The Workshop of Sentences',
  kicker: 'Wing of Prose',
  tagline: 'Every story you love is made of sentences. Come see how they are built, tuned and set loose.',
  epigraph: { text: 'It was the best of times, it was the worst of times…', cite: 'Charles Dickens, A Tale of Two Cities (1859)' },
  materials: { paper: 'laid', ink: 'iron-gall', wash: ['#e8c9a0', '#b9cfd9'], accent: '#c2410c', hand: 'type', motif: 'quill' },
  council: {
    source: 'authored',
    art: { lead: 'CLASSICAL', counterpoint: 'RADICAL_MINIMAL', note: 'Laid paper and iron-gall ink like a writer’s desk in 1850; one rust-orange pencil for every mark the reader should see.' },
    writers: { note: 'Treat the reader as an apprentice at the bench: pick up the tool, try it, then see how the masters held it.' },
  },
  academia: { subjects: ['ELA', 'Literature', 'Creative Writing', 'Composition'], bands: ['early', 'elementary', 'middle', 'high', 'university'] },
  rooms: [
    {
      id: 'sentence',
      title: 'The Sentence Bench',
      subtitle: 'Someone does something. Everything else is how.',
      nodes: [
        {
          id: 'sentence-core',
          title: 'The bones of a sentence',
          kind: 'wall',
          text: {
            early: 'A sentence tells who and what. “The dog ran.” That is a whole sentence!',
            elementary: 'Every sentence needs a someone (the subject) and a doing (the verb). “The dog ran” is complete. Add words to tell where, how and when: “The muddy dog ran across the kitchen.”',
            middle: 'A sentence is built on a core: subject + verb (and often an object). Everything else — adjectives, adverbs, phrases, clauses — hangs on that frame. Strong writers make the core do the work, choosing a precise verb (“slunk,” “bolted”) instead of piling adverbs onto a weak one (“walked very quickly”).',
            high: 'Syntax is meaning. The core clause carries the claim; modifiers add texture, and their placement controls emphasis. English puts its stress at the end of a clause, so writers save the heavy word for last (“end focus”). Learn to see the core first, then ask what each modifier earns.',
            university: 'Classical rhetoric distinguished the periodic sentence (suspending the main clause to the end) from the loose or cumulative sentence (main clause first, modifiers accruing after). Francis Christensen’s “generative rhetoric” of the sentence (1963) argued that the cumulative sentence, a base clause trailed by free modifiers, is the signature of modern prose. Read syntax as a theory of attention: what the sentence makes you hold, and for how long.',
          },
          examples: [
            {
              id: 'austen-truth', work: 'Pride and Prejudice', author: 'Jane Austen', year: '1813', gutenbergId: '1342',
              passage: 'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.',
              marks: ['must be in want of a wife'],
              note: 'Austen saves the punchline for the end of the sentence. The grand opening sounds like philosophy; the last six words turn it into gossip.',
            },
          ],
        },
        {
          id: 'sentence-build',
          title: 'Build one yourself',
          kind: 'station',
          text: {
            early: 'Pick a who, a did-what and a what. Make a sentence!',
            elementary: 'Drag the word cards into the slots. Who? Did what? To what? Then add how and where.',
            middle: 'Assemble subject, verb, object, then two modifiers. Notice how the sentence works with only the first three slots filled — the rest is colour.',
            high: 'Build the core, then add the adverbial and prepositional phrases. Try reading it with the modifiers moved to the front: how does emphasis shift?',
            university: 'A demonstration of clause structure: S-V-O core with adjunct phrases. Observe that adjuncts are syntactically optional yet often carry the rhetorical payload — the “on purpose” is the joke.',
          },
          station: {
            kind: 'sentence',
            prompt: 'Fill each slot with the right card. One card in each pile is a decoy.',
            slots: [
              { role: 'subject', hint: 'Who?' },
              { role: 'verb', hint: 'Did what?' },
              { role: 'object', hint: 'To what?' },
              { role: 'place', hint: 'Where?' },
              { role: 'manner', hint: 'How?' },
            ],
            tiles: [
              { text: 'The cat', role: 'subject' },
              { text: 'knocked', role: 'verb' },
              { text: 'the teacup', role: 'object' },
              { text: 'off the shelf', role: 'place' },
              { text: 'on purpose', role: 'manner' },
              { text: 'sleepily', role: 'manner' },
              { text: 'under the stairs', role: 'place' },
            ],
            reveal: '“The cat knocked the teacup off the shelf on purpose.” The first three cards make the sentence; the last two make it funny. Modifiers are where voice lives.',
          },
        },
      ],
    },
    {
      id: 'voice',
      title: 'The Voice Booth',
      subtitle: 'Same world, different throat.',
      nodes: [
        {
          id: 'voice-wall',
          title: 'Who is talking?',
          kind: 'example',
          text: {
            early: 'Every story has a voice, like a person talking to you. Some voices are silly, some are fancy.',
            elementary: 'Voice is how a writer sounds — the words they pick and how they put them together. Huck Finn talks the way a boy on the river talks. Pip talks like a grown man remembering being small.',
            middle: 'Voice comes from diction (word choice), syntax (sentence shape) and attitude. A first-person narrator’s voice tells you about the narrator before the plot does. Read both openings aloud and listen for who is speaking.',
            high: 'Voice is the illusion of a person in the prose. Twain builds it from dialect and double negatives; Dickens from a grown man’s amused precision about his younger self. Notice how voice establishes reliability, class and distance before a single event happens.',
            university: 'Mikhail Bakhtin called the novel “heteroglossic”: it orchestrates many social voices, and even a narrator’s voice carries the accents of a class, region and history. Twain’s “Explanatory” note to Huckleberry Finn insists his dialects were done “painstakingly” — a claim about voice as ethical and documentary work, not decoration.',
          },
          lens: 'first-person',
          examples: [
            {
              id: 'huck-open', work: 'Adventures of Huckleberry Finn', author: 'Mark Twain', year: '1884', gutenbergId: '76',
              passage: 'You don’t know about me without you have read a book by the name of The Adventures of Tom Sawyer; but that ain’t no matter.',
              marks: ['without you have read', 'ain’t no matter'],
              note: 'Grammar that a teacher would correct is exactly what makes Huck real. The voice is the character.',
            },
            {
              id: 'pip-open', work: 'Great Expectations', author: 'Charles Dickens', year: '1861', gutenbergId: '1400',
              passage: 'My father’s family name being Pirrip, and my Christian name Philip, my infant tongue could make of both names nothing longer or more explicit than Pip. So, I called myself Pip, and came to be called Pip.',
              marks: ['my infant tongue', 'came to be called Pip'],
              note: 'An adult voice smiling at a child: long, careful syntax, then the plain little name repeated three times.',
            },
          ],
        },
        {
          id: 'voice-remix',
          title: 'One moment, four voices',
          kind: 'station',
          text: {
            early: 'Tap the cards. The same rainy day sounds different each time!',
            elementary: 'Flip through four ways of telling the same small moment. Which one sounds most like a friend talking to you?',
            middle: 'Each version keeps the event and changes the voice. Track what changes: word choice, sentence length, person (I / you / she).',
            high: 'Compare point of view and psychic distance. First person gives intimacy and limits knowledge; close third borrows a character’s words; distant third can judge.',
            university: 'Gérard Genette separated “who sees” (focalization) from “who speaks” (narration). Use the variants to locate each on both axes: the free-indirect version speaks in the narrator’s grammar with the character’s vocabulary.',
          },
          station: {
            kind: 'remix',
            prompt: 'Flip the cards. The event never changes: a girl misses the bus in the rain.',
            variants: [
              { label: 'First person', text: 'I ran. I actually ran, in the rain, in my good shoes, and the bus pulled away anyway, like it had been waiting all morning just to do that.', note: 'Intimate and a bit dramatic: we only know what she knows, and she is clearly furious.' },
              { label: 'Close third', text: 'Mara ran, ruining her good shoes, and the bus pulled away anyway. Of course it did. It had probably been waiting all morning for exactly this.', note: 'Third person, but the “Of course it did” is Mara’s thought slipping into the narration — free indirect style.' },
              { label: 'Distant third', text: 'At 7:42 a girl in a blue coat ran for the number 9 bus. It left without her. The rain continued.', note: 'A camera’s-eye view. No feelings stated, so the reader supplies them.' },
              { label: 'Second person', text: 'You run. You run in your good shoes, and you watch the bus pull away, and you know — you just know — it saw you coming.', note: 'Rare and strange: “you” pulls the reader inside the moment.' },
            ],
          },
        },
      ],
    },
    {
      id: 'lantern',
      title: 'The Lantern Room',
      subtitle: 'Don’t say the room was cold. Let the breath show.',
      nodes: [
        {
          id: 'show-tell',
          title: 'Showing and telling',
          kind: 'station',
          text: {
            early: 'Telling: “Sam was scared.” Showing: “Sam pulled the blanket over his head.” Which one can you see?',
            elementary: 'Telling names a feeling. Showing gives the clues so you can figure out the feeling yourself — and that feels like magic.',
            middle: 'Showing uses action, sensory detail and dialogue to let readers infer emotion. Telling summarises. Good writers use both: tell to move quickly, show where it matters.',
            high: 'The opposition is older than workshops: Henry James and Percy Lubbock championed “scene” over “summary.” But summary is not a failure — it controls pace. Ask where the story deserves a slowed, dramatized moment.',
            university: 'Percy Lubbock’s The Craft of Fiction (1921) made “showing” a critical virtue; Wayne Booth later argued that all fiction is rhetoric and that telling is an indispensable authorial tool. Plato’s distinction between diegesis (narrating) and mimesis (imitating) in Republic III is the ancestor of the debate.',
          },
          station: {
            kind: 'remix',
            prompt: 'Flip from telling to showing. What did the writer have to invent?',
            variants: [
              { label: 'Tell', text: 'Grandpa was very old and very tired.', note: 'True, quick, and forgettable.' },
              { label: 'Show: body', text: 'Grandpa lowered himself into the chair in three stages, and rested between each one.', note: 'A single action lets us see age and tiredness without naming either.' },
              { label: 'Show: object', text: 'Grandpa’s watch still kept perfect time, though he no longer remembered to wind it; it was Nan who wound it now, every morning, without a word.', note: 'An object and a habit tell a whole story about time and care.' },
              { label: 'Show: dialogue', text: '“Five minutes,” Grandpa said, closing his eyes. “Wake me when it’s Tuesday.”', note: 'Dialogue reveals tiredness and humour at once — and makes us like him.' },
            ],
          },
        },
        {
          id: 'scrooge-hunt',
          title: 'Hunt the description',
          kind: 'station',
          minDepth: 'elementary',
          lens: 'simile',
          text: {
            early: 'Dickens describes a grumpy man named Scrooge. Find the words that make him sound grumpy!',
            elementary: 'Dickens uses a whole pile of “-ing” words and two comparisons to paint Scrooge. Tap them.',
            middle: 'Find the list of participles and the two similes. Notice how the list sounds like a machine grinding — sound reinforcing sense.',
            high: 'Dickens stacks seven participles and adjectives (asyndeton, no “and” between them), then turns to simile. Hunt both techniques and consider why the list has no conjunctions.',
            university: 'A set piece of Victorian characterization through accumulation (congeries) and simile. The flint image is extended into conceit — no steel “struck out generous fire” — making Scrooge’s miserliness a failure of warmth, not just of money.',
          },
          station: {
            kind: 'hunt',
            prompt: 'Tap the pile-up of grasping words, then the two comparisons.',
            passage: 'Oh! But he was a tight-fisted hand at the grindstone, Scrooge! a squeezing, wrenching, grasping, scraping, clutching, covetous, old sinner! Hard and sharp as flint, from which no steel had ever struck out generous fire; secret, and self-contained, and solitary as an oyster.',
            cite: 'Charles Dickens, A Christmas Carol (1843)',
            targets: [
              { text: 'squeezing, wrenching, grasping, scraping, clutching, covetous', label: 'Pile-up list (no “and”)' },
              { text: 'Hard and sharp as flint', label: 'Simile' },
              { text: 'solitary as an oyster', label: 'Simile' },
            ],
          },
        },
        {
          id: 'fog',
          title: 'Description that moves',
          kind: 'example',
          text: {
            early: 'In one book, fog is everywhere — up the river, down the river. Can you picture it?',
            elementary: 'Dickens repeats the word “fog” over and over so the fog seems to creep into every corner of London.',
            middle: 'Repetition (anaphora) turns description into motion: the fog spreads sentence by sentence. Description is strongest when it does something.',
            high: 'Bleak House opens with verbless fragments and anaphora; the fog becomes a symbol of the Court of Chancery’s murk before the plot names it. Description here is argument.',
            university: 'The opening of Bleak House is a famous instance of symbolic setting and of the verbless “nominal” sentence in English prose; its fog is at once naturalistic, satirical and allegorical. Compare Ruskin’s “pathetic fallacy” (1856): Dickens deliberately lends the weather a moral character.',
          },
          examples: [
            {
              id: 'bleak-fog', work: 'Bleak House', author: 'Charles Dickens', year: '1853',
              passage: 'Fog everywhere. Fog up the river, where it flows among green aits and meadows; fog down the river, where it rolls defiled among the tiers of shipping and the waterside pollutions of a great (and dirty) city.',
              marks: ['Fog everywhere.', 'Fog up the river', 'fog down the river', '(and dirty)'],
              note: 'No verb in the first sentence at all. And look at that sly “(and dirty)” — the narrator rolls his eyes in brackets.',
            },
          ],
        },
      ],
    },
    {
      id: 'music',
      title: 'The Music Room',
      subtitle: 'Prose has a heartbeat. Read it with your ears.',
      nodes: [
        {
          id: 'cadence',
          title: 'See the rhythm of sentences',
          kind: 'station',
          lens: 'short-sentence',
          text: {
            early: 'Some sentences are short. Some are long and go on and on. Look at the bars!',
            elementary: 'Each bar is one sentence. Tall bars are long sentences, short bars are short ones. Great writers mix them like music.',
            middle: 'Varying sentence length creates rhythm. A short sentence after a long one hits hard. Compare the patterns: Dickens’ Christmas Carol opens with a punch; Melville rolls out like the sea.',
            high: 'Cadence is structural: short sentences mark claims and turns, long ones carry accumulation and qualification. Map the bars and connect length to function.',
            university: 'Prose rhythm was studied systematically by George Saintsbury (A History of English Prose Rhythm, 1912), who scanned prose in feet. Later stylistics measures sentence-length variance; the visual here is a crude but honest proxy for what Saintsbury heard.',
          },
          station: {
            kind: 'cadence',
            prompt: 'Each bar is a sentence. Pick a passage and watch its heartbeat.',
            passages: [
              { label: 'Dickens: Marley', text: 'Marley was dead: to begin with. There is no doubt whatever about that. The register of his burial was signed by the clergyman, the clerk, the undertaker, and the chief mourner. Scrooge signed it: and Scrooge’s name was good upon ’Change, for anything he chose to put his hand to. Old Marley was as dead as a door-nail.', cite: 'A Christmas Carol (1843)' },
              { label: 'Melville: Ishmael', text: 'Call me Ishmael. Some years ago—never mind how long precisely—having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world. It is a way I have of driving off the spleen and regulating the circulation.', cite: 'Moby-Dick (1851)' },
              { label: 'Dickens: London', text: 'London. Michaelmas term lately over, and the Lord Chancellor sitting in Lincoln’s Inn Hall. Implacable November weather.', cite: 'Bleak House (1853)' },
            ],
          },
        },
        {
          id: 'openings',
          title: 'First lines',
          kind: 'station',
          lens: 'opening-line',
          text: {
            early: 'The first sentence of a book is like a door. Which door would you open?',
            elementary: 'A first line has one job: make you read the second line. Some do it with a question, some with a surprise.',
            middle: 'Famous openings set voice, tone and a question in one sentence. Read the choices and decide which job each opening is doing.',
            high: 'An opening line is a contract with the reader about genre, voice and irony. Tolstoy’s line is an aphorism the novel then tests on two families.',
            university: 'Edward Said’s Beginnings (1975) distinguishes an origin (given) from a beginning (made, intentional). An opening sentence is the novel’s first act of authority — and frequently, as with Austen and Tolstoy, an ironic one.',
          },
          examples: [
            {
              id: 'anna-open', work: 'Anna Karenina', author: 'Leo Tolstoy (tr. Constance Garnett)', year: '1877', gutenbergId: '1399',
              passage: 'Happy families are all alike; every unhappy family is unhappy in its own way.',
              marks: ['every unhappy family is unhappy in its own way'],
              note: 'A whole philosophy in thirteen words, built on balance: a short half and a longer half that tips the scale.',
            },
            {
              id: 'eyre-open', work: 'Jane Eyre', author: 'Charlotte Brontë', year: '1847', gutenbergId: '1260',
              passage: 'There was no possibility of taking a walk that day.',
              note: 'A tiny, flat sentence — and already a girl trapped indoors. Small openings can carry big weather.',
            },
          ],
          station: {
            kind: 'choice',
            question: '“Marley was dead: to begin with.” What is this first line doing?',
            options: [
              { text: 'Setting up a ghost story by insisting someone is definitely dead', correct: true, why: 'Yes. Dickens hammers home that Marley is dead so that when Marley’s ghost appears, it is a shock. The narrator even says so a few lines later.' },
              { text: 'Describing the setting', why: 'Not quite — there is no place, weather or time in it. It is about a fact the story needs us to believe.' },
              { text: 'Introducing the main character', why: 'Marley is important, but Scrooge is the main character. This line is about the ghost to come.' },
            ],
          },
        },
        {
          id: 'paragraph',
          title: 'The paragraph is a breath',
          kind: 'wall',
          text: {
            early: 'When a new part of the story starts, the writer starts a new line. That is a paragraph.',
            elementary: 'A paragraph is a group of sentences about one thing. When the speaker, place or idea changes, start a new paragraph — it gives the reader a breath.',
            middle: 'Paragraphs control pace. Long paragraphs slow the reader into description or thought; a one-line paragraph lands like a drumbeat. In dialogue, every new speaker gets a new paragraph.',
            high: 'Treat the paragraph as a unit of attention. Alexander Bain codified the “topic sentence” paragraph in 1866 for essays; fiction breaks that rule constantly, using white space as rhythm and emphasis.',
            university: 'The modern paragraph rules taught in schools largely descend from Alexander Bain’s English Composition and Rhetoric (1866). Narrative prose uses paragraphing as a temporal device — a paragraph break can elide hours or stretch a second — and typographic white space itself becomes meaningful.',
          },
        },
      ],
    },
  ],
  nuggets: [
    { id: 'prose-n1', exhibitId: 'prose', roomId: 'sentence', hook: 'The funniest word in Austen’s first line is the last one', body: 'She dresses gossip up as philosophy, then lets the final words — “in want of a wife” — give the joke away. English saves its punch for the end of a sentence.', quote: { text: 'It is a truth universally acknowledged…', cite: 'Jane Austen' } },
    { id: 'prose-n2', exhibitId: 'prose', roomId: 'voice', hook: 'Huck Finn’s “bad grammar” is a masterpiece', body: 'Twain wrote Huck’s voice so carefully that every “ain’t” is on purpose. The way a narrator talks is the first thing you learn about them.', quote: { text: 'but that ain’t no matter.', cite: 'Mark Twain' } },
    { id: 'prose-n3', exhibitId: 'prose', roomId: 'lantern', hook: 'Grandpa is tired. How do you show it without saying it?', body: 'Try one action, one object or one line of dialogue. Writers call it showing — and it makes readers feel clever.', depths: ['early', 'elementary', 'middle'] },
    { id: 'prose-n4', exhibitId: 'prose', roomId: 'lantern', hook: 'Dickens described a miser with seven words and no “and”', body: 'Squeezing, wrenching, grasping, scraping… The list grinds like a machine. Come hunt the rest.' },
    { id: 'prose-n5', exhibitId: 'prose', roomId: 'music', hook: 'Your sentences have a heartbeat. Want to see it?', body: 'Short, long, short. The Music Room turns famous paragraphs into bars so you can see their rhythm.', depths: ['elementary', 'middle', 'high'] },
    { id: 'prose-n6', exhibitId: 'prose', roomId: 'music', hook: 'Why Dickens insisted Marley was “dead as a door-nail”', body: 'A ghost story only works if you believe the ghost is dead. The first line is a promise the plot keeps.', quote: { text: 'Marley was dead: to begin with.', cite: 'Charles Dickens' } },
  ],
};
