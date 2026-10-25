/**
 * Critique formats, rubrics and portfolio reviews for the Art College.
 * All prose is original; the formats cite their published originators by name and link, never
 * reproducing their text. Critique is the college's central teaching method, so it is data, not
 * decoration: each unit in the catalog names the format it uses.
 */
import type { CritiqueFormat, CritiqueId, PortfolioReview, Rubric, RubricId, ReviewId } from './types';

export const CRITIQUE_FORMATS: CritiqueFormat[] = [
  {
    id: 'feldman', title: 'Feldman Method (Describe · Analyze · Interpret · Judge)', minutes: 25,
    bestFor: 'Painting, drawing, sculpture — and art history essays — where the group needs to see before it opines.',
    ground: ['Facts before opinions: nobody judges until everyone has described.', 'Speak about the work, not the maker.', 'The artist stays quiet until the Judge step ends.'],
    source: { label: 'Edmund Burke Feldman, Practical Art Criticism (1994) — summary of the method', url: 'https://www.getty.edu/education/teachers/classroom_resources/curricula/art_criticism/' },
    steps: [
      { label: 'Describe', say: 'List only what is visibly there — subjects, materials, size, colours, marks. No "because", no "feels".' },
      { label: 'Analyze', say: 'How are the parts related? Talk about composition, value, scale, rhythm, edges, where the eye goes first.' },
      { label: 'Interpret', say: 'What is it about? Offer readings and the evidence you see for each — "I read this as __ because __".' },
      { label: 'Judge', say: 'Is it working, against what it seems to be trying to do? Name one strength and one thing that would raise it.' },
    ],
  },
  {
    id: 'lerman', title: 'Critical Response Process (Lerman)', minutes: 30,
    bestFor: 'Work in development, mixed or process-heavy work, and any group whose members are vulnerable about showing.',
    ground: ['The maker asks the questions; the responders answer them.', 'Opinions only with permission: "I have an opinion about the colour; would you like to hear it?"', 'No suggestions disguised as questions.'],
    source: { label: 'Liz Lerman Group — Critical Response Process', url: 'https://lizlerman.com/critical-response-process/' },
    steps: [
      { label: 'Statements of meaning', say: 'Responders say what was meaningful, evocative, interesting or compelling in the work.' },
      { label: 'Artist as questioner', say: 'The maker asks 2–3 specific questions about the work; responders answer honestly and briefly.' },
      { label: 'Neutral questions', say: 'Responders ask the maker questions with no opinion hidden in them — "what was the underdrawing?" not "why is it so dark?"' },
      { label: 'Permissioned opinions', say: 'Responders ask "may I give an opinion about __?"; the maker may say no.' },
    ],
  },
  {
    id: 'desk', title: 'Desk Crit (one-to-one, 8 minutes)', minutes: 8,
    bestFor: 'Weekly check-ins during a project, before the work is "done".',
    ground: ['Bring the work, the intention in one sentence, and one question.', 'Leave with three next actions.'],
    steps: [
      { label: 'Intention', say: 'In one sentence, what is this trying to do?' },
      { label: 'Look in silence', say: 'The instructor looks for a full minute before saying anything.' },
      { label: 'What I see', say: 'The instructor says back what is visible and what it seems to do.' },
      { label: 'Gap and next actions', say: 'Name the gap between intention and the evidence. Agree three next actions and a date.' },
    ],
  },
  {
    id: 'wall', title: 'Wall Crit (everyone, everything)', minutes: 45,
    bestFor: 'Comparing a body of work on one wall: studies, thumbnails, series.',
    ground: ['Pin it up; no verbal introduction.', 'Compare across the wall, not one at a time.'],
    steps: [
      { label: 'Walk and look', say: 'Five minutes in silence. Write one note per work: strongest thing, weakest thing.' },
      { label: 'Cluster', say: 'Group works that solve the same problem. Which cluster is the strongest and why?' },
      { label: 'Argue the pick', say: 'Each person defends the single piece they would continue with.' },
      { label: 'Maker responds', say: 'The maker says what they heard and what they will do.' },
    ],
  },
  {
    id: 'design', title: 'Design Critique (I like · I wish · What if)', minutes: 20,
    bestFor: 'Design work with a brief and an audience: identity, layout, interface, packaging.',
    ground: ['Critique against the brief and the audience, not personal taste.', 'Every "I wish" comes with a "what if".'],
    source: { label: 'Nielsen Norman Group — articles on design critique and usability', url: 'https://www.nngroup.com/articles/' },
    steps: [
      { label: 'Restate the brief', say: 'The designer states the audience, the job to be done and the constraint in 30 seconds.' },
      { label: 'I like', say: 'Name what works for the brief — specifically, in design terms (hierarchy, contrast, spacing, type).' },
      { label: 'I wish', say: 'Name what gets in the way of the brief.' },
      { label: 'What if', say: 'Offer one concrete alternative to try. The designer decides what to take.' },
    ],
  },
  {
    id: 'written', title: 'Written Critique', minutes: 40,
    bestFor: 'Practice in giving precise written feedback on a peer\'s work or an object in a collection.',
    ground: ['Evidence for every claim.', 'Same rules as the spoken crit: describe, relate, interpret, evaluate.'],
    steps: [
      { label: 'Describe', say: 'In 100 words, describe what is there as if to someone who cannot see it.' },
      { label: 'Relate', say: 'In 150 words, explain how the parts relate and where the eye goes.' },
      { label: 'Interpret', say: 'In 150 words, say what you think it means, with two pieces of visible evidence.' },
      { label: 'Evaluate', say: 'In 100 words, say what is strongest and name one change that would raise it.' },
    ],
  },
  {
    id: 'seminar', title: 'Object Seminar', minutes: 50,
    bestFor: 'Art history and critical-studies seminars centred on one museum object.',
    ground: ['Everyone has the same object open at full resolution.', 'Claims cite accession data or what is visible.'],
    steps: [
      { label: 'Ten minutes of looking', say: 'Open the object. Write 15 observations before speaking.' },
      { label: 'Round-robin description', say: 'Each person gives one observation; no repeats.' },
      { label: 'Question the record', say: 'What does the museum record say, and what does it leave out (maker, provenance, gaps)?' },
      { label: 'Argue a reading', say: 'Two readings are defended with evidence; the room votes, then tests the winner against one other object.' },
    ],
  },
  {
    id: 'portfolio', title: 'Portfolio Review (panel)', minutes: 20,
    bestFor: 'End-of-year review: foundation, sophomore, junior, senior.',
    ground: ['Work speaks first; the learner presents for no more than five minutes.', 'The panel scores against the rubric and gives written notes.'],
    steps: [
      { label: 'Present', say: 'Five minutes: your through-line, your strongest piece, and what you would change.' },
      { label: 'Panel looks', say: 'Panel views the work without discussion.' },
      { label: 'Questions', say: 'Panel asks about decisions and process, not intentions alone.' },
      { label: 'Score and notes', say: 'Panel scores each rubric criterion and writes two strengths and two edges to push.' },
    ],
  },
];

export const critiqueFormat = (id: CritiqueId): CritiqueFormat => CRITIQUE_FORMATS.find(f => f.id === id)!;

const LV = (a: string, b: string, c: string, d: string): [string, string, string, string] => [a, b, c, d];

export const RUBRICS: Record<RubricId, Rubric> = {
  studio: {
    id: 'studio', title: 'Studio rubric',
    criteria: [
      { id: 'concept', label: 'Concept & intention', levels: LV('Intention unclear or absent', 'Intention present but not evident in the work', 'Clear intention that organises the work', 'Intention is original, sharpened by research, and carried through every decision') },
      { id: 'craft', label: 'Craft & technique', levels: LV('Technique obstructs the idea', 'Basic competence; inconsistent finish', 'Confident technique serving the idea', 'Technique is exact, inventive and invisible in service of the work') },
      { id: 'process', label: 'Process & iteration', levels: LV('One attempt; no development', 'Some iteration; changes are cosmetic', 'Documented iteration that changed the work', 'Process shows risk, failure and strong editing') },
      { id: 'language', label: 'Visual language', levels: LV('Elements used by default', 'Some deliberate choices', 'Elements and principles used on purpose', 'A distinct, consistent visual language') },
      { id: 'context', label: 'Engagement with context', levels: LV('No reference to other work', 'References named but not used', 'Learns from named artists/objects (with citations)', 'Dialogues with the field; makes an informed contribution') },
      { id: 'crit', label: 'Critique participation', levels: LV('Absent or dismissive', 'Present; mostly passive', 'Gives and uses precise feedback', 'Raises the level of the whole room') },
    ],
  },
  design: {
    id: 'design', title: 'Design rubric',
    criteria: [
      { id: 'brief', label: 'Fit to the brief & audience', levels: LV('Misses the brief', 'Meets the brief literally', 'Solves the brief for the named audience', 'Reframes the problem and solves the better one') },
      { id: 'hierarchy', label: 'Hierarchy & communication', levels: LV('Reader does not know where to start', 'Hierarchy mostly clear', 'Clear, tested hierarchy', 'Effortless reading order, tested with real users') },
      { id: 'type', label: 'Type, grid & colour', levels: LV('Defaults used without thought', 'Some good choices, some conflict', 'Consistent system of type, grid and colour', 'A sophisticated, distinctive system') },
      { id: 'access', label: 'Accessibility', levels: LV('Fails contrast and legibility', 'Partially accessible', 'Meets WCAG AA contrast and legibility', 'Designed inclusively from the start and tested') },
      { id: 'system', label: 'System thinking & production', levels: LV('One-off', 'Some reuse', 'Reusable system with rules', 'Documented system that others could extend; print/production-ready') },
      { id: 'process', label: 'Research & process', levels: LV('No research', 'Research stated, not used', 'Research shaped decisions', 'Research, testing and iteration are visible') },
    ],
  },
  writing: {
    id: 'writing', title: 'Art-writing rubric',
    criteria: [
      { id: 'looking', label: 'Looking & description', levels: LV('Describes generalities', 'Describes some specifics', 'Precise description of the object', 'Description discovers things most viewers miss') },
      { id: 'argument', label: 'Argument', levels: LV('No thesis', 'Thesis present but weak', 'Clear, arguable thesis supported throughout', 'Original thesis that complicates the received view') },
      { id: 'evidence', label: 'Evidence & citation', levels: LV('Unsupported or uncited', 'Some evidence; citations incomplete', 'Evidence from object and sources, cited correctly (accession numbers, links)', 'Primary sources and archives used critically') },
      { id: 'context', label: 'Context & positionality', levels: LV('Ignores history', 'Names context', 'Integrates history, provenance and who is missing', 'Foregrounds power, access and the limits of the record') },
      { id: 'prose', label: 'Prose', levels: LV('Hard to follow', 'Readable but loose', 'Clear, economical prose', 'Prose with voice and precision') },
    ],
  },
  portfolio: {
    id: 'portfolio', title: 'Portfolio rubric',
    criteria: [
      { id: 'quality', label: 'Quality of work', levels: LV('Uneven; weakest work dominates', 'Mixed quality', 'Consistently strong', 'Distinctive, professional-level work throughout') },
      { id: 'voice', label: 'Voice & through-line', levels: LV('No coherence', 'Hints of a direction', 'A recognisable voice', 'A voice that can sustain a body of work') },
      { id: 'range', label: 'Range & development', levels: LV('Little development', 'Some growth shown', 'Clear growth across the year', 'Growth shown through risk and revision') },
      { id: 'documentation', label: 'Documentation & presentation', levels: LV('Poorly photographed', 'Adequate documentation', 'Well shot, edited and sequenced', 'Gallery- or client-ready presentation') },
      { id: 'statement', label: 'Statement & process', levels: LV('Absent', 'Generic statement', 'Specific statement and process notes', 'A statement that sharpens how the work is seen') },
    ],
  },
};

export const PORTFOLIO_REVIEWS: PortfolioReview[] = [
  {
    id: 'foundation', title: 'Foundation Review', when: 'End of Year 1 — gate to a major',
    submit: ['8–12 works from FND 101–106 (at least 3 drawings, 2 design, 2 colour, 2 three-dimensional)', 'Sketchbook (60+ pages)', 'One-page statement: which major and why', 'One AHI object study'],
    panelAsks: ['What have you learned to see?', 'Which of these would you re-make, and how?', 'Which major tests you most?'],
    bar: 'Average 2.0 or higher (Developing) on the portfolio rubric and every criterion at least 1.5; below that the panel prescribes a revision plan before major declaration.',
  },
  {
    id: 'sophomore', title: 'Sophomore Review', when: 'End of Year 2',
    submit: ['10–15 works from your major\'s 200-level courses', 'A process page for 2 works showing iteration', 'A short research note on 3 artists/objects from museum collections who shaped your work', 'Draft statement'],
    panelAsks: ['What is the question you keep returning to?', 'Which influence is showing and which is hiding?', 'What is the next risk?'],
    bar: 'Average 2.5 or higher on the portfolio rubric (between Developing and Proficient), with a voice that can be named in one sentence.',
  },
  {
    id: 'junior', title: 'Junior Review', when: 'End of Year 3 — gate to the thesis year',
    submit: ['A coherent body of 8–12 works toward a thesis', 'Thesis proposal (500–800 words) with reading and viewing list', 'CV and artist statement', 'Documentation of one external presentation (show, pitch, client, or online publication)'],
    panelAsks: ['What is the thesis, and what would make it fail?', 'Who is your audience?', 'What will you stop doing?'],
    bar: 'Average 3.0 (Proficient) with an approved thesis proposal; a conditional pass requires a revision memo within four weeks.',
  },
  {
    id: 'senior', title: 'Senior Thesis Defense & Exhibition', when: 'Final term',
    submit: ['Thesis body of work or collection, installed or published', 'Thesis paper (3,000+ words; 5,000+ for art history)', 'Portfolio site / PDF with documentation, statement and CV', 'Public presentation (15 minutes + questions)'],
    panelAsks: ['What does the work claim, and what does it risk?', 'What do you owe the people and objects you drew on?', 'What is next?'],
    bar: 'Average 3.0 or higher with no criterion below 2.5; distinction at 3.6+.',
  },
];

export const reviewFor = (id: ReviewId) => PORTFOLIO_REVIEWS.find(r => r.id === id)!;
