// philosophy.ts — why the Conservatory teaches the way it does.
//
// Every principle here is (1) a finding from music cognition, neuroscience or learning science,
// (2) the source it comes from, and (3) the concrete rule it imposes on the product. Where the
// popular story outruns the evidence (e.g. "music makes you smarter"), the principle says so and
// the product is designed around what the evidence actually supports. Citations are to real,
// published work; nothing is paraphrased beyond what the papers claim.

export interface Citation { authors: string; year: number; title: string; venue: string }

export interface Principle {
  id: string;
  title: string;
  /** One-line version for cards. */
  short: string;
  /** What the research found, in plain words. */
  finding: string;
  sources: Citation[];
  /** What the platform does because of it — each rule should be visible somewhere in the app. */
  rules: string[];
  /** Where the evidence is limited or contested. Honesty is part of the pedagogy. */
  caveat?: string;
}

export const PRINCIPLES: Principle[] = [
  {
    id: 'everyone-musical',
    title: 'Every brain is already musical',
    short: 'You already understand music — we name what you know.',
    finding:
      'Listeners with no training carry rich, implicit knowledge of tonality, expectation and phrase, learned simply by hearing the music around them. Genuine congenital amusia ("tone deafness") is rare, and most adults who say they can\'t sing in tune have a trainable link between hearing and voice, not a broken ear.',
    sources: [
      { authors: 'Bigand, E. & Poulin-Charronnat, B.', year: 2006, title: 'Are we "experienced listeners"? A review of the musical capacities that do not depend on formal musical training', venue: 'Cognition 100(1)' },
      { authors: 'Tillmann, B., Bharucha, J. J. & Bigand, E.', year: 2000, title: 'Implicit learning of tonality: a self-organizing approach', venue: 'Psychological Review 107(4)' },
      { authors: 'Pfordresher, P. Q. & Brown, S.', year: 2007, title: 'Poor-pitch singing in the absence of "tone deafness"', venue: 'Music Perception 25(2)' },
      { authors: 'Peretz, I. & Vuvan, D. T.', year: 2017, title: 'Prevalence of congenital amusia', venue: 'European Journal of Human Genetics 25' },
    ],
    rules: [
      'No placement test gates anyone out — every drill opens at its easiest contrast.',
      'Lessons start from music the learner already knows and name the skill they are already using.',
      'Echo (sing-back) gives live pitch feedback, because singing in tune is trained, not born.',
    ],
  },
  {
    id: 'sound-before-symbol',
    title: 'Sound before symbol',
    short: 'Hear it, sing it, move to it — then see it written.',
    finding:
      'Children learn to speak before they read, and the major music-education traditions agree that musical sound should be internalised before notation. Gordon calls the target "audiation": hearing and understanding music in the mind when it is not physically present. Kodály built literacy on singing with movable-do; Dalcroze on moving the body; Orff on speech and body rhythm before instruments.',
    sources: [
      { authors: 'Gordon, E. E.', year: 2012, title: 'Learning Sequences in Music: A Contemporary Music Learning Theory', venue: 'GIA Publications' },
      { authors: 'Choksy, L.', year: 1999, title: 'The Kodály Method I: Comprehensive Music Education', venue: 'Prentice Hall (3rd ed.)' },
      { authors: 'Phillips-Silver, J. & Trainor, L. J.', year: 2005, title: 'Feeling the beat: movement influences infant rhythm perception', venue: 'Science 308(5727)' },
    ],
    rules: [
      'Every Ear Gym drill plays before it shows anything; notation appears as the answer, not the question.',
      'Staff Sprint plays each note as you name it, so the symbol is always bound to its sound.',
      'Solfège (movable do) is the shared language from Find Home to Melody Detective.',
    ],
  },
  {
    id: 'context-and-expectation',
    title: 'Music is prediction',
    short: 'We hear notes by what we expect next — so we always train in a key.',
    finding:
      'Musical pleasure and understanding are bound up with expectation: the brain predicts what comes next, and dopamine is released both in anticipation of and at peak emotional moments in music. A scale degree is not a frequency; it is a feeling of pull toward home inside a key.',
    sources: [
      { authors: 'Huron, D.', year: 2006, title: 'Sweet Anticipation: Music and the Psychology of Expectation', venue: 'MIT Press' },
      { authors: 'Salimpoor, V. N., Benovoy, M., Larcher, K., Dagher, A. & Zatorre, R. J.', year: 2011, title: 'Anatomically distinct dopamine release during anticipation and experience of peak emotion to music', venue: 'Nature Neuroscience 14' },
    ],
    rules: [
      'Find Home always plays a cadence to set the key before the test note.',
      'After every scale-degree answer the note walks home (ti → do, fa → mi → re → do) so the pull is heard.',
      'Punctuation teaches cadences as expectation fulfilled, delayed or betrayed — the deceptive cadence is a plot twist.',
    ],
  },
  {
    id: 'spacing-retrieval',
    title: 'Spaced retrieval beats cramming',
    short: 'Short daily sessions, recalled from memory, revisited just before you forget.',
    finding:
      'Testing yourself (retrieval) produces more durable learning than re-studying, and practice spread over days outlasts the same practice massed into one sitting.',
    sources: [
      { authors: 'Roediger, H. L. & Karpicke, J. D.', year: 2006, title: 'Test-enhanced learning: taking memory tests improves long-term retention', venue: 'Psychological Science 17(3)' },
      { authors: 'Cepeda, N. J., Pashler, H., Vul, E., Wixted, J. T. & Rohrer, D.', year: 2006, title: 'Distributed practice in verbal recall tasks: a review and quantitative synthesis', venue: 'Psychological Bulletin 132(3)' },
    ],
    rules: [
      'Every Ear Gym item lives in a Leitner box (10 min → 1 day → 3 → 7 → 21 days) and returns when due.',
      'The Daily Mix is about five minutes; the streak rewards showing up, not grinding.',
    ],
  },
  {
    id: 'interleave-contrast',
    title: 'Mix it up, and contrast what you confuse',
    short: 'Learning to tell categories apart needs them side by side.',
    finding:
      'Interleaving different problem types — rather than practising one type in a block — improves the ability to tell which kind of problem you are facing, in mathematics and in learning to discriminate categories such as artists\' styles. Discrimination is exactly what ear training is.',
    sources: [
      { authors: 'Rohrer, D. & Taylor, K.', year: 2007, title: 'The shuffling of mathematics problems improves learning', venue: 'Instructional Science 35' },
      { authors: 'Kornell, N. & Bjork, R. A.', year: 2008, title: 'Learning concepts and categories: is spacing the "enemy of induction"?', venue: 'Psychological Science 19(6)' },
    ],
    rules: [
      'The Daily Mix interleaves drills instead of running one drill at a time.',
      'A miss replays the right answer and your answer back to back ("hear the difference").',
      'Pairs you confuse are remembered and come back more often until you stop confusing them.',
    ],
  },
  {
    id: 'graded-difficulty',
    title: 'Start with the biggest difference',
    short: 'Easy contrasts first; new categories only when the old ones are solid.',
    finding:
      'Perceptual learning proceeds from easy to fine discriminations, and working memory is limited — overload it and nothing sticks. Mastery-based progression keeps each step inside reach.',
    sources: [
      { authors: 'Sweller, J.', year: 1988, title: 'Cognitive load during problem solving: effects on learning', venue: 'Cognitive Science 12(2)' },
      { authors: 'Ahissar, M. & Hochstein, S.', year: 2004, title: 'The reverse hierarchy theory of visual perceptual learning', venue: 'Trends in Cognitive Sciences 8(10)' },
    ],
    rules: [
      'Interval Lab begins with octave vs fifth; chords begin with major vs minor.',
      'A new level unlocks after 16 answers at 85 % — never on a timer.',
      'Staff Sprint teaches a handful of landmark notes first and reads everything else as a step or skip from them; colour-coded noteheads fade out as you improve.',
    ],
  },
  {
    id: 'brain-plasticity',
    title: 'Training changes the brain — over years, not weeks',
    short: 'Sustained music-making reshapes auditory and motor systems.',
    finding:
      'Children who took 15 months of keyboard lessons showed structural brain changes in motor and auditory regions that controls did not. In a community programme, children\'s neural encoding of speech sounds improved after two years of music training — but not after one. Patel\'s OPERA hypothesis explains when music training should sharpen speech processing: precision, emotion, repetition and attention.',
    sources: [
      { authors: 'Hyde, K. L., Lerch, J., Norton, A., Forgeard, M., Winner, E., Evans, A. C. & Schlaug, G.', year: 2009, title: 'Musical training shapes structural brain development', venue: 'Journal of Neuroscience 29(10)' },
      { authors: 'Kraus, N., Slater, J., Thompson, E. C., Hornickel, J., Strait, D. L., Nicol, T. & White-Schwoch, T.', year: 2014, title: 'Music enrichment programs improve the neural encoding of speech in at-risk children', venue: 'Journal of Neuroscience 34(36)' },
      { authors: 'Patel, A. D.', year: 2011, title: 'Why would musical training benefit the neural encoding of speech? The OPERA hypothesis', venue: 'Frontiers in Psychology 2' },
    ],
    rules: [
      'The curriculum is built as a K-12-and-beyond spine, because the benefits come from staying with it.',
      'Drills demand precision (cents, exact rhythms), carry emotion (real musical context), repeat, and require attention — the four OPERA conditions.',
    ],
  },
  {
    id: 'teach-the-bridge',
    title: 'Connections are taught, not assumed',
    short: 'We don\'t promise music makes you smarter; we teach the math and language inside it.',
    finding:
      'Meta-analyses find that the "far transfer" of music lessons to general academic or cognitive skills is small or disappears in well-controlled studies. What does work is explicit teaching: rhythm IS fractions, tuning IS ratios and exponents, songwriting IS writing — when those links are taught on purpose.',
    sources: [
      { authors: 'Sala, G. & Gobet, F.', year: 2017, title: 'When the music\'s over. Does music skill transfer to children\'s and young adolescents\' cognitive and academic skills? A meta-analysis', venue: 'Educational Research Review 20' },
    ],
    rules: [
      'Music Math lives inside the Math Quest and records Common Core math standards, not just music.',
      'Music as Language teaches meter, form and songwriting as reading and writing, and records ELA standards.',
      'The standards crosswalk shows every music skill next to the math or ELA standard it exercises.',
    ],
    caveat: 'Music is worth learning for its own sake. We never market it as an IQ boost.',
  },
  {
    id: 'deliberate-practice',
    title: 'Practice with a purpose',
    short: 'Focused practice with feedback is the engine — and it isn\'t the whole story.',
    finding:
      'Expert musicians accumulate large amounts of deliberate practice: effortful work on specific weaknesses with immediate feedback. Later meta-analysis found practice explains a substantial but partial share of differences in musical skill — which is why we pair it with enjoyment, choice and identity.',
    sources: [
      { authors: 'Ericsson, K. A., Krampe, R. T. & Tesch-Römer, C.', year: 1993, title: 'The role of deliberate practice in the acquisition of expert performance', venue: 'Psychological Review 100(3)' },
      { authors: 'Macnamara, B. N., Hambrick, D. Z. & Oswald, F. L.', year: 2014, title: 'Deliberate practice and performance in music, games, sports, education, and professions: a meta-analysis', venue: 'Psychological Science 25(8)' },
      { authors: 'Hattie, J. & Timperley, H.', year: 2007, title: 'The power of feedback', venue: 'Review of Educational Research 77(1)' },
    ],
    rules: [
      'Feedback is instant, specific and audible — never just "wrong".',
      'Weak items are targeted automatically; learners also see exactly which ones are weak.',
      'Making music (composing, publishing to Chora) sits beside drills, so practice serves something the learner cares about.',
    ],
  },
];

export const principleById = (id: string) => PRINCIPLES.find(p => p.id === id);
