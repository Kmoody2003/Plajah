/**
 * Content for the Academia rich-media sections (components/academia/AcademiaShowcase.tsx).
 * Every entry opens a real destination: an AppView, or an app-level event App.tsx listens for
 * (OPEN_LABS_DISCIPLINE → a Labs hall of greats, plajah:openDossier → one Exhibition Hall exhibit).
 * Facts are checked, plain statements; each carries a teaching use, a student way in and a
 * parent conversation starter.
 */
export type ShowcaseRole = 'teacher' | 'student' | 'parent';
export type Target = { view: string } | { event: string; detail: Record<string, unknown> };

export function goTo(onNavigate: (v: string) => void, t: Target) {
  if ('view' in t) { onNavigate(t.view); return; }
  try { window.dispatchEvent(new CustomEvent(t.event, { detail: t.detail })); } catch { /* */ }
}

const labs = (disciplineId: string): Target => ({ event: 'OPEN_LABS_DISCIPLINE', detail: { disciplineId } });
const dossier = (id: string): Target => ({ event: 'plajah:openDossier', detail: { id } });

export interface Fact { id: string; from: string; color: string; img: string; fact: string; teach: string; go: string; ask: string; to: Target }
export const ACADEMIA_FACTS: Fact[] = [
  { id: 'ginkgo', from: 'Science Quest', color: '#06D6A0', img: '/academia/ginkgo.jpg', to: { view: 'SCIENCE_QUEST' },
    fact: 'Ginkgo trees have barely changed in over 200 million years. Several survived the 1945 Hiroshima blast and are still growing.',
    teach: 'Open an adaptations unit with it: what lets a living thing outlast a catastrophe?', go: 'Explore living things in Science Quest',
    ask: '“What makes a living thing tough enough to survive almost anything?”' },
  { id: 'ford-line', from: 'Exhibition Hall · Henry Ford', color: '#FFB266', img: '/dossier/ford/archival/ref-1919-hartsook.jpg', to: dossier('henry-ford'),
    fact: 'Ford’s moving assembly line, started in 1913, cut the time to build a Model T from about 12 hours to about 90 minutes.',
    teach: 'Use it for rates and ratios, or as a history debate: what did faster factories cost workers?', go: 'Walk through the Ford exhibit',
    ask: '“What would you build on an assembly line?”' },
  { id: 'odyssey', from: 'Lorea', color: '#F5C987', img: '/academia/cover-the-odyssey.jpg', to: { view: 'BOOKS' },
    fact: 'The Odyssey runs about 12,000 lines in 24 books. It was performed aloud for generations before anyone wrote it down.',
    teach: 'Pair it with Voca: students retell one scene aloud, then compare versions with a partner.', go: 'Read it on Lorea',
    ask: '“If our family story was told out loud for 100 years, what would change?”' },
  { id: 'pleiades', from: 'The Sky', color: '#93C5FD', img: '/academia/pleiades.jpg', to: { view: 'ACADEMIA_SKY' },
    fact: 'The Pleiades are about 440 light-years away. The starlight you see tonight left them in the late 1500s.',
    teach: 'Use it to show that a light-year measures distance, and that looking far away means looking back in time.', go: 'Find them in The Sky',
    ask: '“What was happening on Earth when that starlight set off?”' },
  { id: 'vitruvius', from: 'Architecture hall', color: '#c4b5fd', img: '/academia/archipelago.jpg', to: labs('architecture'),
    fact: 'The Roman architect Vitruvius wrote that every building needs three things: strength, usefulness and beauty.',
    teach: 'Give it to students as a rubric. They score a building near school on all three.', go: 'Meet the master builders',
    ask: '“Which room in our home is the most useful? The most beautiful?”' },
  { id: 'rule72', from: 'Money School', color: '#F5B83D', img: '/academia/forest.jpg', to: { view: 'MONEY_SCHOOL' },
    fact: 'The Rule of 72: divide 72 by a yearly interest rate to estimate how many years it takes money to double.',
    teach: 'Mental-math warm-up: at 6%, how long until $100 becomes $200?', go: 'Try it in Money School',
    ask: '“If we saved $10 at 8%, when would it be $20?”' },
  { id: 'douglass', from: 'Exhibition Hall · Douglass', color: '#FF9EC4', img: '/dossier/douglass/archival/ref-1847-miller-hero.jpg', to: dossier('frederick-douglass'),
    fact: 'Frederick Douglass escaped slavery in 1838 and became one of the most famous speakers and writers in America.',
    teach: 'Read a passage of his speeches aloud, then ask students what makes words persuasive.', go: 'Visit the Douglass exhibit',
    ask: '“What would you stand up and speak about?”' },
  { id: 'shelley', from: 'Lorea', color: '#F5C987', img: '/academia/cover-frankenstein.jpg', to: { view: 'BOOKS' },
    fact: 'Mary Shelley started writing Frankenstein at 18. It was published in 1818.',
    teach: 'A writing hook: young authors can publish their own books on Lorea this term.', go: 'Write your own book on Lorea',
    ask: '“What story would you write if you knew it would be read 200 years from now?”' },
  { id: 'redwood', from: 'Science Quest', color: '#06D6A0', img: '/academia/sequoia.jpg', to: { view: 'SCIENCE_QUEST' },
    fact: 'Coast redwoods are the tallest trees on Earth. The tallest known one, Hyperion, is about 116 meters high.',
    teach: 'Measurement and scale: how many classrooms stacked up would that be?', go: 'Meet the giants in Science Quest',
    ask: '“How many of us standing on each other’s shoulders would reach the top?”' },
  { id: 'beethoven', from: 'Chora Conservatory', color: '#00DAF3', img: '/academia/lounge.jpg', to: { view: 'CHORA_CONSERVATORY' },
    fact: 'Beethoven wrote his Ninth Symphony while he was almost completely deaf.',
    teach: 'Play the “Ode to Joy” theme and ask how a composer can hear music in their head.', go: 'Listen in the Conservatory',
    ask: '“How do you think he heard the music?”' },
  { id: 'petrie', from: 'Archaeology hall', color: '#FFB266', img: '/academia/kingdoms.jpg', to: labs('archaeology'),
    fact: 'Archaeologist Flinders Petrie dated ancient Egyptian graves by putting their pottery styles in order, a method called sequence dating.',
    teach: 'Sort a pile of everyday objects by age with no labels. That is sequence dating.', go: 'Dig into Archaeology',
    ask: '“What in our kitchen would tell a future archaeologist what year it is?”' },
  { id: 'leonardo', from: 'Art Gallery', color: '#c4b5fd', img: '/academia/cherry.jpg', to: { view: 'ART_GALLERY' },
    fact: 'Leonardo da Vinci wrote many of his notebooks in mirror writing, from right to left.',
    teach: 'Have students try a sentence in mirror writing in Penna, then talk about why he might have done it.', go: 'Visit the masters',
    ask: '“Can you write your name backwards?”' },
];

export interface Exhibit { id: string; kind: string; name: string; img?: string; bg?: string; color: string; to: Target; isNew?: boolean; teach: string; hook: string; family: string }
export const ACADEMIA_EXHIBITS: Exhibit[] = [
  { id: 'hall', kind: 'Exhibition Hall', name: 'The Exhibition Hall', img: '/dossier/founding/archival/a-declaration-trumbull.jpg', color: '#F5C987', to: { view: 'DOSSIER' }, isNew: true,
    teach: 'Five immersive history exhibits with archival art and films. Each one is a ready-made unit.', hook: 'Walk through history, room by room', family: 'Five history exhibits with films and archival art' },
  { id: 'founding', kind: 'Exhibit', name: 'The Founding Era', img: '/dossier/founding/archival/a-declaration-trumbull.jpg', color: '#93C5FD', to: dossier('founding-era'), isNew: true,
    teach: 'From thirteen colonies to the first presidents. Pairs with Civics Hall.', hook: 'From colonies to a country', family: 'How the United States began' },
  { id: 'douglass', kind: 'Exhibit', name: 'Frederick Douglass', img: '/dossier/douglass/archival/ref-1847-miller-hero.jpg', color: '#FF9EC4', to: dossier('frederick-douglass'), isNew: true,
    teach: 'A biography exhibit for rhetoric, abolition and primary sources.', hook: 'Born enslaved, became the nation’s voice', family: 'A life that changed America' },
  { id: 'ford', kind: 'Exhibit', name: 'Henry Ford · Motor City', img: '/dossier/ford/archival/ref-1919-hartsook.jpg', color: '#FFB266', to: dossier('henry-ford'), isNew: true,
    teach: 'Industry, invention and the moving assembly line, including an exploded Model T.', hook: 'See how a Model T comes apart', family: 'The man who put America on wheels' },
  { id: 'persia', kind: 'Exhibit', name: 'Christianity in Persia', img: '/dossier/persia/archival/a-stele-wdl.jpg', color: '#6EE7B7', to: dossier('christianity-in-persia'), isNew: true,
    teach: 'Two thousand years of faith along the roads of Persia. Strong for world history and geography.', hook: 'An ancient road, 2,000 years long', family: 'Faith and history along ancient roads' },
  { id: 'partition', kind: 'Exhibit', name: 'The Partition of India, 1947', img: '/dossier/partition/maps/punjab-fo-1948.jpg', color: '#F5B83D', to: dossier('partition-1947'), isNew: true,
    teach: 'Maps and testimony on how one border drawn in five weeks changed millions of lives. Best for grades 7 and up.', hook: 'One line, drawn in five weeks', family: 'A border that moved millions' },
  { id: 'physics', kind: 'Historic science', name: 'Pioneers of Physics', img: '/academia/pillars.jpg', color: '#00DAF3', to: labs('physics'),
    teach: 'Galileo to the quantum revolution, hall by hall. Open a figure as a lesson opener.', hook: 'Galileo, Newton, Faraday and more', family: 'The people who explained the universe' },
  { id: 'engineering', kind: 'Engineering', name: 'Pioneers of Engineering', img: '/academia/stargate.jpg', color: '#FF8C00', to: labs('engineering'),
    teach: 'Steam, structures, circuits and computing. Pairs with design challenges.', hook: 'Watt, Carnot, Diesel and the builders', family: 'Inventors who built the modern world' },
  { id: 'archaeology', kind: 'Archaeology', name: 'Masters of the Human Past', img: '/academia/kingdoms.jpg', color: '#FFB266', to: labs('archaeology'),
    teach: 'Egyptology, human origins and field methods, from Schliemann to Petrie.', hook: 'Dig up the ancient world', family: 'Explorers of ancient worlds' },
  { id: 'architecture', kind: 'Architecture', name: 'Masters of the Built World', img: '/academia/archipelago.jpg', color: '#c4b5fd', to: labs('architecture'),
    teach: 'Imhotep to contemporary architects. Strong for geometry and design lessons.', hook: 'From pyramids to skyscrapers', family: 'The world’s great builders' },
  { id: 'history', kind: 'World history', name: 'Figures Who Shaped the World', img: '/academia/earth.jpg', color: '#93C5FD', to: labs('history'),
    teach: 'Rulers, thinkers, explorers and founders, from Hammurabi to the modern era.', hook: 'Rulers, explorers and revolutionaries', family: 'People who changed history' },
  { id: 'art', kind: 'Gallery', name: 'Art & Photography Masters', img: '/academia/cherry.jpg', color: '#c4b5fd', to: { view: 'ART_GALLERY' },
    teach: 'Painters, photographers, architects and sculptors for critique and technique.', hook: 'Leonardo, Vermeer and the greats', family: 'Pick a favorite painting each' },
  { id: 'chora', kind: 'Hall of greats', name: 'Chora Conservatory', img: '/academia/lounge.jpg', color: '#00DAF3', to: { view: 'CHORA_CONSERVATORY' },
    teach: 'Baroque to hip-hop, with listening guides for music lessons.', hook: 'Composers and musicians', family: 'Listen to the greats on a Sunday morning' },
  { id: 'comics', kind: 'Museum', name: 'Comic & Manga Museum', bg: '#2a0f22', color: '#FF6FA8', to: { view: 'COMIC_MUSEUM' },
    teach: 'Visual storytelling: panels, pacing and the history of the form.', hook: 'Panels, heroes and history', family: 'Read comics together' },
  { id: 'sky', kind: 'Explorer', name: 'The Sky', img: '/academia/pleiades.jpg', color: '#93C5FD', to: { view: 'ACADEMIA_SKY' },
    teach: 'Standards as a star map, plus astronomy for Earth and space science.', hook: 'Stars, planets and your skill map', family: 'Find the Pleiades tonight, then look them up' },
];

export interface School { view: string; name: string; tag: string; blurb: string; color: string; img?: string; emoji?: string; bg: string }
export const ACADEMIA_SCHOOLS: School[] = [
  { view: 'MONEY_SCHOOL', name: 'Money School', tag: 'Financial literacy', blurb: 'Earning, saving, budgeting and giving, with hands-on labs.', color: '#F5B83D', img: '/academia/forest.jpg', bg: '#2a1f08' },
  { view: 'SCIENCE_SCHOOL', name: 'Science School', tag: 'Science', blurb: 'NGSS quests, the Lab Map and real investigations.', color: '#06D6A0', img: '/academia/ginkgo.jpg', bg: '#062a20' },
  { view: 'CIVICS_HALL', name: 'Civics Hall', tag: 'Citizenship', blurb: 'Founding documents with the Telescoping Text reader.', color: '#FF9EC4', img: '/dossier/founding/archival/a-declaration-trumbull.jpg', bg: '#33101f' },
  { view: 'ECON_SCHOOL', name: 'Econ School', tag: 'Economics', blurb: 'Markets, trade and scarcity, told through stories.', color: '#60A5FA', img: '/academia/archipelago.jpg', bg: '#0b1a33' },
  { view: 'PHILOSOPHY_SCHOOL', name: 'Philosophy School', tag: 'Thinking', blurb: 'Big questions, sized for every grade, with structured dialogue.', color: '#c4b5fd', img: '/academia/pillars.jpg', bg: '#1a1033' },
  { view: 'FILM_SCHOOL', name: 'Film School', tag: 'Storytelling', blurb: 'Story, camera and editing under Cinema.', color: '#FF6FA8', img: '/academia/stargate.jpg', bg: '#33101f' },
  { view: 'CHORA_CONSERVATORY', name: 'Chora Conservatory', tag: 'Music', blurb: 'Music theory, ear training and composing.', color: '#00DAF3', img: '/academia/lounge.jpg', bg: '#062a31' },
  { view: 'BUSINESS_SCHOOL', name: 'Business School', tag: 'Entrepreneurship', blurb: 'Profit and loss, go-to-market and the Business Sim.', color: '#FF8C00', emoji: '💼', bg: '#2e1704' },
  { view: 'REAL_ESTATE_SCHOOL', name: 'Real Estate School', tag: 'Property', blurb: 'Labs on Terra parcels: measure, value and build.', color: '#FFB266', emoji: '🏗️', bg: '#2a1a08' },
  { view: 'MATH_SCHOOL', name: 'Math School', tag: 'Mathematics', blurb: 'Practice by grade, Time Attack and problem solving.', color: '#a78bfa', emoji: '📐', bg: '#1a1033' },
];

export type ReadingBand = 'K-2' | '3-5' | '6-8' | '9-12';
const cover = (slug: string) => `/academia/cover-${slug}.jpg`;
export const LOREA_BANDS: Record<ReadingBand, { label: string; books: Array<{ title: string; note: string; cover: string }> }> = {
  'K-2': { label: 'Grades K–2', books: [
    { title: 'Alice in Wonderland', note: 'Read-aloud · fantasy', cover: cover('alice-in-wonderland') },
    { title: 'The Adventures of Tom Sawyer', note: 'Read-aloud · adventure', cover: cover('tom-sawyer') },
    { title: 'The Odyssey', note: 'Read-aloud retelling · myth', cover: cover('the-odyssey') },
    { title: 'Little Women', note: 'Read-aloud chapters · family', cover: cover('little-women') },
  ] },
  '3-5': { label: 'Grades 3–5', books: [
    { title: 'Alice in Wonderland', note: 'Fantasy', cover: cover('alice-in-wonderland') },
    { title: 'The Adventures of Tom Sawyer', note: 'Adventure', cover: cover('tom-sawyer') },
    { title: 'Little Women', note: 'Family', cover: cover('little-women') },
    { title: 'The Odyssey', note: 'Myth, retold', cover: cover('the-odyssey') },
    { title: 'Sherlock Holmes', note: 'Mystery, short cases', cover: cover('sherlock-holmes') },
  ] },
  '6-8': { label: 'Grades 6–8', books: [
    { title: 'Sherlock Holmes', note: 'Mystery', cover: cover('sherlock-holmes') },
    { title: 'The Odyssey', note: 'Epic', cover: cover('the-odyssey') },
    { title: 'The Count of Monte Cristo', note: 'Adventure', cover: cover('count-of-monte-cristo') },
    { title: 'Little Women', note: 'Family', cover: cover('little-women') },
    { title: 'The Art of War', note: 'Strategy', cover: cover('art-of-war') },
  ] },
  '9-12': { label: 'Grades 9–12', books: [
    { title: 'Frankenstein', note: 'Gothic', cover: cover('frankenstein') },
    { title: 'Jane Eyre', note: 'Classic', cover: cover('jane-eyre') },
    { title: 'Pride and Prejudice', note: 'Classic', cover: cover('pride-and-prejudice') },
    { title: 'Moby-Dick', note: 'Adventure', cover: cover('moby-dick') },
    { title: 'Dracula', note: 'Gothic', cover: cover('dracula') },
  ] },
};
/** Pick a starting shelf from the age band the rest of Academia already uses. */
export const bandForAge = (age: 'early' | 'middle' | 'senior' | string): ReadingBand => (age === 'early' ? 'K-2' : age === 'senior' ? '9-12' : '3-5');

/** What each creative studio means to each role. Keys match MEDIA_TOOLS ids. */
export const STUDIO_COPY: Record<string, Record<ShowcaseRole, string>> = {
  tela: { teacher: 'History maps, posters and infographics on a real design canvas.', student: 'Turn your map or report into a poster or slides.', parent: 'Make a family poster or a birthday card.' },
  lorea: { teacher: 'Personal narratives become real books the whole class can read.', student: 'Write your own book and publish it to the class shelf.', parent: 'Write a bedtime story together.' },
  fabula: { teacher: 'Students edit a newscast or a short documentary as the final product.', student: 'Edit your own film, newscast or documentary.', parent: 'Edit a video of your weekend.' },
  melos: { teacher: 'Set a poem to a beat to teach rhythm, stress and repetition.', student: 'Put your poem to music and find the beat.', parent: 'Make a song together.' },
  pixels: { teacher: 'Coordinate grids and fractions, drawn one square at a time.', student: 'Make pixel art and animations.', parent: 'Draw your pet in pixel art.' },
  podcast: { teacher: 'A 3-minute science explainer counts as speaking and listening practice too.', student: 'Explain something you learned like a radio host.', parent: 'Interview a grandparent for a family podcast.' },
  photo: { teacher: 'A photo essay for a field journal, a nature walk or art history.', student: 'Shoot and edit a photo essay.', parent: 'Take a nature walk and make a photo album.' },
  comic: { teacher: 'A book report as a 6-panel comic shows plot order at a glance.', student: 'Draw a chapter of your book in six panels.', parent: 'Make a comic about your day.' },
};
