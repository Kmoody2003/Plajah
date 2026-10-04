/**
 * Course catalog — ONE map of everything learnable on Plajah, for any user (school-enrolled or
 * self-learning). Nothing here is gated by account type: every school stays open to everyone, and
 * mastery is saved per learner (cloud when signed in, local for guests).
 *
 * Three kinds of course:
 *  - 'curriculum': a lesson-based school (Civics, Money, Film...) — lessons are skills with practice questions.
 *  - 'math': grade-by-grade skills with generated practice, Grade 1 -> 12.
 *  - 'link': a rich studio/museum/quest that has its own screen (Labs disciplines, History Quest, Museion...).
 */
import type { Curriculum } from './schoolChassis';
import { ROSTER, LAW_ACCENT, INTL_ACCENT, MED_ACCENT, type LadderStage } from '../data/lawMedicineRoster';
import type { ContentStatus } from './contentStatus';
import { LAW_NOTICE, MEDICINE_NOTICE, MACHINES_NOTICE } from '../data/practice/courseKit';

export type CourseKind = 'curriculum' | 'math' | 'context' | 'link';
export interface Course {
  id: string; subject: string; title: string; blurb: string; emoji: string; accent: string; kind: CourseKind;
  /** App view that opens the full course/studio. */
  view: string;
  /** For 'curriculum': Curriculum.id (practice bank + progress key). */
  curriculumId?: string;
  /** For 'link' into a Labs discipline. */
  labsDiscipline?: string;
  /** For 'math': the grade (1-12). */
  grade?: number;
  /** For 'context': which Math-in-the-Real-World band. */
  band?: 'prek2' | 'g35' | 'g68' | 'g912';
  /** Law and Medicine ladders: where this course sits from PreK to professional school. */
  stage?: LadderStage;
  /** Sub-heading inside a stage (e.g. "Law school: first year"). */
  group?: string;
  /** Shown above the lessons (educational-use notice). */
  notice?: string;
  /** Content status; omitted = LIVE. See services/contentStatus.ts and docs/CONTENT_STATUS.md. */
  status?: ContentStatus;
}
export interface Subject { id: string; title: string; blurb: string; emoji: string; accent: string }

export const SUBJECTS: Subject[] = [
  { id: 'connected', title: 'Math in the Real World', blurb: 'Math taught through running a shop, making music and making film, from preschool up.', emoji: '🧩', accent: '#F59E0B' },
  { id: 'math', title: 'Math', blurb: 'Grade 1 through Calculus, with practice that adapts.', emoji: '🔢', accent: '#3B82F6' },
  { id: 'science', title: 'Science & Labs', blurb: 'Twelve disciplines, real simulators, free textbooks.', emoji: '🧪', accent: '#06D6A0' },
  { id: 'humanities', title: 'Civics, History & Ideas', blurb: 'How societies work, how we got here, how to think.', emoji: '🏛️', accent: '#FF8C00' },
  { id: 'economics', title: 'Money, Business & Economics', blurb: 'Personal finance to founding a company.', emoji: '💰', accent: '#F59E0B' },
  { id: 'arts', title: 'Arts & Media', blurb: 'Film, photography, art history and music, with real studios.', emoji: '🎬', accent: '#D40055' },
  { id: 'literacy', title: 'Reading, Writing & Languages', blurb: 'Read aloud, write by hand, learn a language.', emoji: '📖', accent: '#7a2bd6' },
  { id: 'sport', title: 'Sport, Movement & Culture', blurb: 'The history and culture of the world’s games and martial arts.', emoji: '🏟️', accent: '#3FB98E' },
  { id: 'law', title: 'Law', blurb: 'Open law, from "what is fair?" in preschool to a full law school curriculum, with international and comparative law. Kept current from new court rulings.', emoji: '⚖️', accent: LAW_ACCENT },
  { id: 'medicine', title: 'Medicine', blurb: 'Open medicine, from "how does my body work?" to a full medical school curriculum, with ethics, pharmacology and the philosophy of medicine. Kept current from new research.', emoji: '🩺', accent: MED_ACCENT },
  { id: 'machines', title: 'Machines & Trades', blurb: 'How machines work and the trades that fix them, from simple machines to technician-level systems, tied to the 3D Machine Atlas. Brakes first.', emoji: '🔧', accent: '#FF8C00' },
  { id: 'museums', title: 'Museums & Exploration', blurb: 'Walk through living museums and open archives.', emoji: '🗿', accent: '#36c5f0' },
];

const SCIENCE_IDS: Array<[string, string, string]> = [
  ['physics', 'Physics', '⚛️'], ['chemistry', 'Chemistry', '🧫'], ['biology', 'Biology', '🧬'], ['earth', 'Earth Science', '🌍'],
  ['astronomy', 'Astronomy', '🔭'], ['environment', 'Environmental Science', '🌱'], ['neuroscience', 'Neuroscience', '🧠'],
  ['engineering', 'Engineering', '⚙️'], ['cs', 'Computer Science', '💻'], ['data', 'Data Science', '📊'], ['networks', 'Networks', '🌐'], ['mathematics', 'Mathematics (advanced)', '∑'],
];

/** Course modules authored from the Labs / museum data (data/practice/courses). */
const mods: string[] = ['art-masters', 'art-movements-classical', 'art-movements-modern', 'audio-engineering', 'botany-forest', 'color-theory', 'comic-history', 'design-movements', 'entertainment-finance', 'film-business', 'film-directing', 'film-genres', 'film-history', 'film-producing', 'founding-documents', 'graphic-design', 'history-arab-world', 'history-asia', 'history-europe', 'history-north-america', 'history-south-america', 'hq-quest', 'ip-protection', 'lab-archaeology', 'lab-architecture', 'lab-astronomy', 'lab-biology', 'lab-chemistry', 'lab-combat', 'lab-cs', 'lab-data', 'lab-earth', 'lab-engineering', 'lab-environment', 'lab-history', 'lab-mathematics', 'lab-networks', 'lab-neuroscience', 'lab-physics', 'lighting-design', 'lit-studies-early', 'lit-studies-modern', 'music-business', 'music-figures', 'music-genres', 'music-history-eras', 'music-theory', 'music-theory-college', 'music-theory-early', 'music-theory-elementary', 'music-theory-secondary', 'publishing-business', 'sports-history', 'theatre-scripts', 'thinking-methods', 'world-mythology', 'world-religions'];

const rosterEmoji = (r: (typeof ROSTER)[number]): string =>
  r.stage === 'prek2' ? '🧸' : r.stage === 'g35' ? '📘' : r.stage === 'g68' ? '🔎' : r.stage === 'g912' ? '🎓'
  : r.group?.startsWith('International') ? '🌐' : r.subject === 'law' ? (r.stage === 'college' ? '🏛️' : '⚖️') : r.id.includes('ethics') ? '🕊️' : r.id.includes('pharm') ? '💊' : r.id.includes('history') ? '📜' : r.stage === 'college' ? '🧬' : '🩺';
const ROSTER_COURSES: Course[] = ROSTER.map((r): Course => ({
  id: r.id, subject: r.subject, title: r.title, blurb: r.blurb, emoji: rosterEmoji(r),
  accent: r.subject === 'medicine' ? MED_ACCENT : r.group?.startsWith('International') ? INTL_ACCENT : LAW_ACCENT,
  kind: 'curriculum', view: 'LEARN', curriculumId: r.id, stage: r.stage, group: r.group,
  notice: r.subject === 'law' ? LAW_NOTICE : MEDICINE_NOTICE,
  status: 'UNDER_REVIEW',
}));

export const COURSES: Course[] = [
  // Math in the real world: connected subjects, from the first coin
  { id: 'ctx-prek2', subject: 'connected', title: 'Little Shop (PreK-2)', blurb: 'Coins, counting, beats and scoreboards: the first math of a shop, a band and a game.', emoji: '🪙', accent: '#F59E0B', kind: 'context', view: 'MONEY_SCHOOL', band: 'prek2' },
  { id: 'ctx-g35', subject: 'connected', title: 'Market Day (Grades 3-5)', blurb: 'Prices, change, profit, fractions of a beat, film night tickets and sports scoring.', emoji: '🛍️', accent: '#F59E0B', kind: 'context', view: 'MONEY_SCHOOL', band: 'g35' },
  { id: 'ctx-g68', subject: 'connected', title: 'Small Business (Grades 6-8)', blurb: 'Markup, break-even, tempo, ratios, frame rates and sports statistics.', emoji: '📈', accent: '#3FB98E', kind: 'context', view: 'BUSINESS_SCHOOL', band: 'g68' },
  { id: 'ctx-g912', subject: 'connected', title: 'Venture Math (Grades 9-12)', blurb: 'Profit lines, compound growth, margins, budgets, probability and projectile motion.', emoji: '🚀', accent: '#8b5cf6', kind: 'context', view: 'BUSINESS_SCHOOL', band: 'g912' },
  { id: 'young-entrepreneurs', subject: 'connected', title: 'Young Entrepreneurs (PreK-12)', blurb: 'Money and enterprise from the first coin to a real venture, with the math built in.', emoji: '🌱', accent: '#F59E0B', kind: 'curriculum', view: 'BUSINESS_SCHOOL', curriculumId: 'young-entrepreneurs' },
  // Math: one course per grade
  ...Array.from({ length: 12 }, (_, i): Course => ({
    id: `math-g${i + 1}`, subject: 'math',
    title: i < 8 ? `Grade ${i + 1} Math` : ['Algebra I', 'Geometry & Trigonometry', 'Algebra II & Precalculus', 'Calculus'][i - 8],
    blurb: i < 8 ? 'Skills with instant feedback and hints.' : 'Worked-step practice for the high school sequence.',
    emoji: '🔢', accent: '#3B82F6', kind: 'math', view: 'MATH_CLASSROOM', grade: i + 1,
  })),
  // Science
  ...SCIENCE_IDS.map(([id, title, emoji]): Course => ({ id: `sci-${id}`, subject: 'science', title, blurb: 'Lessons and practice, plus simulators, pioneers and a free library in the Labs.', emoji, accent: '#06D6A0', kind: mods.includes(`lab-${id}`) ? 'curriculum' : 'link', view: 'PLAJAH_LABS', labsDiscipline: id, curriculumId: mods.includes(`lab-${id}`) ? `lab-${id}` : undefined })),
  { id: 'sci-quest', subject: 'science', title: 'Science Quest', blurb: 'Lab-map quests that earn points.', emoji: '🗺️', accent: '#36c5f0', kind: 'link', view: 'SCIENCE_QUEST' },
  // Humanities
  { id: 'civics-hall', subject: 'humanities', title: 'Civics Hall', blurb: 'Government, rights, and how to take part.', emoji: '🏛️', accent: '#FF8C00', kind: 'curriculum', view: 'CIVICS_HALL', curriculumId: 'civics-hall' },
  { id: 'philosophy-school', subject: 'humanities', title: 'Philosophy', blurb: 'Reason, ethics and the big questions.', emoji: '🦉', accent: '#8b5cf6', kind: 'curriculum', view: 'PHILOSOPHY_SCHOOL', curriculumId: 'philosophy-school' },
  { id: 'history-quest', subject: 'humanities', title: 'History Quest', blurb: 'Nano-lessons across world history, with practice.', emoji: '📜', accent: '#FF8C00', kind: 'curriculum', view: 'HISTORY_QUEST', curriculumId: 'hq-quest' },
  { id: 'lab-history', subject: 'humanities', title: 'World History', blurb: 'Civilizations, turning points and how we know.', emoji: '🌍', accent: '#E8590C', kind: 'curriculum', view: 'PLAJAH_LABS', labsDiscipline: 'history', curriculumId: 'lab-history' },
  // Economics
  { id: 'money-school', subject: 'economics', title: 'School of Money', blurb: 'Earning, saving, credit, risk and investing.', emoji: '💰', accent: '#F59E0B', kind: 'curriculum', view: 'MONEY_SCHOOL', curriculumId: 'money-school' },
  { id: 'econ-school', subject: 'economics', title: 'Economics', blurb: 'Markets, incentives and the economy.', emoji: '📈', accent: '#3FB98E', kind: 'curriculum', view: 'ECON_SCHOOL', curriculumId: 'econ-school' },
  { id: 'business-school', subject: 'economics', title: 'Business School', blurb: 'Build a venture, books, formation and go-to-market.', emoji: '🚀', accent: '#8b5cf6', kind: 'link', view: 'BUSINESS_SCHOOL' },
  { id: 'real-estate-school', subject: 'economics', title: 'Real Estate', blurb: 'Buying, renting, financing and investing in property.', emoji: '🏠', accent: '#0ea5e9', kind: 'curriculum', view: 'REAL_ESTATE_SCHOOL', curriculumId: 'real-estate-school' },
  // Arts & media
  { id: 'film-school', subject: 'arts', title: 'Film School', blurb: 'From story to screen, then make your own.', emoji: '🎬', accent: '#e23b6d', kind: 'curriculum', view: 'FILM_SCHOOL', curriculumId: 'film-school' },
  { id: 'photo-art-school', subject: 'arts', title: 'Photography & Art', blurb: 'Technique and art history, with real masterworks.', emoji: '📷', accent: '#D40055', kind: 'curriculum', view: 'GLOBAL_PHOTOS', curriculumId: 'photo-art-school' },
  { id: 'chora-history', subject: 'arts', title: 'Music History', blurb: 'The story of recorded sound, in the Chora Vault.', emoji: '🎵', accent: '#FFD24A', kind: 'curriculum', view: 'MUSIC', curriculumId: 'chora-history' },
  { id: 'lab-archaeology', subject: 'humanities', title: 'Archaeology', blurb: 'How we learn about the past from what it left behind.', emoji: '🏺', accent: '#D4A017', kind: 'curriculum', view: 'PLAJAH_LABS', labsDiscipline: 'archaeology', curriculumId: 'lab-archaeology' },
  { id: 'botany-forest', subject: 'science', title: 'Botany: The Living Forest', blurb: 'How plants work, from the canopy down to the seed.', emoji: '🌳', accent: '#8BCE89', kind: 'curriculum', view: 'PLAJAH_LABS', curriculumId: 'botany-forest' },
  { id: 'thinking-methods', subject: 'science', title: 'Thinking Like a Scientist and Engineer', blurb: 'Fair tests, data and graphs, the design process, and other ways of reasoning.', emoji: '🧠', accent: '#06D6A0', kind: 'curriculum', view: 'INQUIRY', curriculumId: 'thinking-methods' },
  { id: 'venture-lab', subject: 'economics', title: 'Venture Lab: Run a Business', blurb: 'A business simulation for every age. Set prices, protect your name, handle surprises, read your books.', emoji: '🚀', accent: '#06D6A0', kind: 'link', view: 'BIZ_SIM' },
  { id: 'music-theory', subject: 'arts', title: 'Music Theory and Instruments', blurb: 'Pitch, rhythm, harmony and how instruments make sound.', emoji: '🎹', accent: '#FFD24A', kind: 'curriculum', view: 'MUSIC', curriculumId: 'music-theory' },
  { id: 'graphic-design', subject: 'arts', title: 'Graphic Design', blurb: 'Typography, layout, identity and the principles behind work that communicates.', emoji: '🖋️', accent: '#7A2BD6', kind: 'curriculum', view: 'LEARN', curriculumId: 'graphic-design' },
  { id: 'audio-engineering', subject: 'arts', title: 'Audio Engineering', blurb: 'Sound, microphones, recording, mixing and mastering, from first principles.', emoji: '🎚️', accent: '#00DAF3', kind: 'curriculum', view: 'LEARN', curriculumId: 'audio-engineering' },
  { id: 'film-directing', subject: 'arts', title: 'Film Directing', blurb: 'Working with script, actors and camera to tell a story on screen.', emoji: '🎬', accent: '#E23B6D', kind: 'curriculum', view: 'LEARN', curriculumId: 'film-directing' },
  { id: 'film-producing', subject: 'arts', title: 'Film Producing', blurb: 'Developing, financing, scheduling and delivering a film.', emoji: '🎥', accent: '#C9871F', kind: 'curriculum', view: 'LEARN', curriculumId: 'film-producing' },
  { id: 'art-movements-classical', subject: 'arts', title: 'Art Movements I: Ancient to Impressionism', blurb: 'Deep dives into the movements and periods from the ancient world to Impressionism.', emoji: '🏺', accent: '#C9871F', kind: 'curriculum', view: 'LEARN', curriculumId: 'art-movements-classical' },
  { id: 'art-movements-modern', subject: 'arts', title: 'Art Movements II: Post-Impressionism to Today', blurb: 'Cubism, Surrealism, Pop Art, street art and the movements that changed what art could be.', emoji: '🖼️', accent: '#D40055', kind: 'curriculum', view: 'LEARN', curriculumId: 'art-movements-modern' },
  { id: 'music-genres', subject: 'arts', title: 'Music Genres: Deep Dives', blurb: 'Blues to hip-hop to Afrobeat: how each genre began, sounds and why it matters.', emoji: '🎷', accent: '#FFD24A', kind: 'curriculum', view: 'LEARN', curriculumId: 'music-genres' },
  { id: 'lit-studies-modern', subject: 'literacy', title: 'Literature Deep Study II: 1800 to Today', blurb: 'Close reading from Romanticism to contemporary global fiction.', emoji: '📚', accent: '#D40055', kind: 'curriculum', view: 'LEARN', curriculumId: 'lit-studies-modern' },
  { id: 'history-north-america', subject: 'humanities', title: 'History of North America', blurb: 'From the first peoples to today: the United States, Canada and Mexico.', emoji: '🗽', accent: '#1D4ED8', kind: 'curriculum', view: 'LEARN', curriculumId: 'history-north-america' },
  { id: 'history-south-america', subject: 'humanities', title: 'History of South America and Latin America', blurb: 'From the Andes and the Amazon to independence and the modern states.', emoji: '🌎', accent: '#06D6A0', kind: 'curriculum', view: 'LEARN', curriculumId: 'history-south-america' },
  { id: 'history-europe', subject: 'humanities', title: 'History of Europe', blurb: 'From ancient Greece to the European Union.', emoji: '🏰', accent: '#3B82F6', kind: 'curriculum', view: 'LEARN', curriculumId: 'history-europe' },
  { id: 'history-asia', subject: 'humanities', title: 'History of Asia', blurb: 'East, South and Southeast Asia from the earliest states to today.', emoji: '🏯', accent: '#E23B6D', kind: 'curriculum', view: 'LEARN', curriculumId: 'history-asia' },
  { id: 'history-arab-world', subject: 'humanities', title: 'History of the Arab World and the Middle East', blurb: 'From ancient Mesopotamia and the rise of Islam to the modern Middle East.', emoji: '🕌', accent: '#C9871F', kind: 'curriculum', view: 'LEARN', curriculumId: 'history-arab-world' },
  { id: 'world-mythology', subject: 'humanities', title: 'Myths and Mythology of the World', blurb: 'How cultures tell stories of creation, heroes and death, and what scholars say about them.', emoji: '🌀', accent: '#7A2BD6', kind: 'curriculum', view: 'LEARN', curriculumId: 'world-mythology' },
  { id: 'color-theory', subject: 'arts', title: 'Color Theory', blurb: 'Light, pigment, harmony, contrast and how color works in painting, design, film and screens.', emoji: '🎨', accent: '#E23B6D', kind: 'curriculum', view: 'LEARN', curriculumId: 'color-theory' },
  { id: 'lighting-design', subject: 'arts', title: 'Lighting Design', blurb: 'How light behaves and how to shape it for stage, film, photography and spaces.', emoji: '💡', accent: '#FFB000', kind: 'curriculum', view: 'LEARN', curriculumId: 'lighting-design' },
  { id: 'design-movements', subject: 'arts', title: 'Design Movements: Arts and Crafts to Postmodernism', blurb: 'Art Nouveau, Bauhaus, Art Deco, Modernism and beyond, and how to recognise each.', emoji: '🏛️', accent: '#FFD24A', kind: 'curriculum', view: 'LEARN', curriculumId: 'design-movements' },
  { id: 'film-genres', subject: 'arts', title: 'Film Genres: Deep Dives', blurb: 'Westerns, noir, horror, musicals, national cinemas and how genres evolve.', emoji: '🎞️', accent: '#E23B6D', kind: 'curriculum', view: 'LEARN', curriculumId: 'film-genres' },
  { id: 'lit-studies-early', subject: 'literacy', title: 'Literature Deep Study I: Antiquity to 1800', blurb: 'Close reading from Gilgamesh and Homer to Shakespeare and the first novels.', emoji: '📜', accent: '#7A2BD6', kind: 'curriculum', view: 'LEARN', curriculumId: 'lit-studies-early' },
  { id: 'entertainment-finance', subject: 'economics', title: 'Entertainment Finance', blurb: 'How film, music and live projects are funded, how money flows back, and how to read the deals.', emoji: '💰', accent: '#06D6A0', kind: 'curriculum', view: 'LEARN', curriculumId: 'entertainment-finance' },
  { id: 'music-theory-early', subject: 'arts', title: 'Music Foundations (PreK-2)', blurb: 'Beat, high and low, loud and soft, singing and playing together.', emoji: '🥁', accent: '#FFD24A', kind: 'curriculum', view: 'MUSIC', curriculumId: 'music-theory-early' },
  { id: 'music-theory-elementary', subject: 'arts', title: 'Music Theory (Grades 3-5)', blurb: 'Reading notes and rhythms, scales, intervals and simple forms.', emoji: '🎼', accent: '#FFD24A', kind: 'curriculum', view: 'MUSIC', curriculumId: 'music-theory-elementary' },
  { id: 'music-theory-secondary', subject: 'arts', title: 'Music Theory (Grades 6-12)', blurb: 'Scales, chords, voice leading, form and the jazz and pop progressions.', emoji: '🎹', accent: '#FFD24A', kind: 'curriculum', view: 'MUSIC', curriculumId: 'music-theory-secondary' },
  { id: 'music-theory-college', subject: 'arts', title: 'Music Theory (College)', blurb: 'Counterpoint, chromatic harmony, form, set theory, serialism and jazz.', emoji: '🎓', accent: '#FFD24A', kind: 'curriculum', view: 'MUSIC', curriculumId: 'music-theory-college' },
  { id: 'music-history-eras', subject: 'arts', title: 'The Story of Music', blurb: 'From ancient song to hip-hop: the composers, instruments and ideas that shaped music.', emoji: '🏛️', accent: '#FFD24A', kind: 'curriculum', view: 'MUSIC', curriculumId: 'music-history-eras' },
  { id: 'theatre-scripts', subject: 'arts', title: 'Theatre and Scripts', blurb: 'How plays work, with great public-domain scripts.', emoji: '🎭', accent: '#e23b6d', kind: 'curriculum', view: 'BOOKS', curriculumId: 'theatre-scripts' },
  { id: 'comic-history', subject: 'arts', title: 'Comics and Manga: A History', blurb: 'Sequential art, from early picture stories to graphic novels.', emoji: '💥', accent: '#FF6FA8', kind: 'curriculum', view: 'COMIC_MUSEUM', curriculumId: 'comic-history' },
  { id: 'world-religions', subject: 'humanities', title: 'World Religions: A Study Guide', blurb: 'What the world\u2019s traditions teach and practise, in their own terms.', emoji: '🕊️', accent: '#7a2bd6', kind: 'curriculum', view: 'SACRED_LIBRARY', curriculumId: 'world-religions' },
  { id: 'founding-documents', subject: 'humanities', title: 'The Founding Documents', blurb: 'The texts that shaped constitutional government, read closely.', emoji: '📜', accent: '#FF8C00', kind: 'curriculum', view: 'CIVICS_HALL', curriculumId: 'founding-documents' },
  { id: 'investigation-studio', subject: 'science', title: 'Investigation Studio', blurb: 'Run a guided investigation: question, test, graph live data, conclude.', emoji: '📈', accent: '#00DAF3', kind: 'link', view: 'INQUIRY' },
  { id: 'lab-architecture', subject: 'arts', title: 'Architecture', blurb: 'The built environment: styles, structures and how buildings stand.', emoji: '🏛️', accent: '#B08968', kind: 'curriculum', view: 'PLAJAH_LABS', labsDiscipline: 'architecture', curriculumId: 'lab-architecture' },
  { id: 'film-history', subject: 'arts', title: 'Film History', blurb: 'Landmark films, directors and movements, from the silent era on.', emoji: '🎞️', accent: '#e23b6d', kind: 'curriculum', view: 'MOVIES_TV', curriculumId: 'film-history' },
  { id: 'music-figures', subject: 'arts', title: 'Music Figures', blurb: 'Composers, performers and innovators across the history of music.', emoji: '🎼', accent: '#FFD24A', kind: 'curriculum', view: 'MUSIC', curriculumId: 'music-figures' },
  { id: 'lab-combat', subject: 'sport', title: 'Combat Atlas: Martial Arts of the World', blurb: 'The history, culture and etiquette of the world’s martial arts.', emoji: '🥋', accent: '#C24D2C', kind: 'curriculum', view: 'PLAJAH_LABS', labsDiscipline: 'combat', curriculumId: 'lab-combat' },
  { id: 'sports-history', subject: 'sport', title: 'Sports History: The World Cup', blurb: 'The history of football and the World Cup.', emoji: '⚽', accent: '#3FB98E', kind: 'curriculum', view: 'PLAJAH_SPORTS', curriculumId: 'sports-history' },
  // Literacy
  { id: 'classic-literature', subject: 'literacy', title: 'Classic Literature', blurb: '42 classics free in Lorea, with study guides, practice and Chora Vault recordings to hear their world.', emoji: '📚', accent: '#D40055', kind: 'curriculum', view: 'LANGUAGE_ARTS_SCHOOL', curriculumId: 'classic-literature' },
  { id: 'history-sentences', subject: 'literacy', title: 'Grammar Through History', blurb: 'Fix, finish and polish sentences about real music, film, art and money history.', emoji: '✍️', accent: '#7a2bd6', kind: 'curriculum', view: 'LANGUAGE_ARTS_SCHOOL', curriculumId: 'history-sentences' },
  { id: 'voca', subject: 'literacy', title: 'Voca', blurb: 'Read aloud with Chora, who listens and coaches.', emoji: '🎙️', accent: '#D40055', kind: 'link', view: 'VOCA' },
  { id: 'reading-quest', subject: 'literacy', title: 'Reading Quest', blurb: 'Phonics to comprehension, gamified.', emoji: '📖', accent: '#2bd67a', kind: 'link', view: 'READING_QUEST' },
  { id: 'language-arts', subject: 'literacy', title: 'Language Arts', blurb: 'Reading, writing, grammar and vocabulary.', emoji: '✏️', accent: '#D40055', kind: 'link', view: 'LANGUAGE_ARTS_SCHOOL' },
  { id: 'penna', subject: 'literacy', title: 'Penna', blurb: 'Handwriting: trace letters, earn the picture.', emoji: '🖋️', accent: '#C9871F', kind: 'link', view: 'HANDWRITING_WORKSHOP' },
  { id: 'languages', subject: 'literacy', title: 'Languages', blurb: 'Spanish, French and Mandarin, ten minutes a day.', emoji: '🗣️', accent: '#7a2bd6', kind: 'link', view: 'LANGUAGE_QUEST' },
  { id: 'kids-library', subject: 'literacy', title: 'Kids Library', blurb: 'Leveled readers, phonics and sight words.', emoji: '📚', accent: '#36c5f0', kind: 'link', view: 'KIDS_LIBRARY' },
  // Museums
  { id: 'museion', subject: 'museums', title: 'Museion', blurb: 'The living museum: arts, history and science across the disciplines.', emoji: '🏺', accent: '#7a2bd6', kind: 'link', view: 'PLAJAH_LABS' },
  { id: 'art-masters', subject: 'museums', title: 'Art Masters', blurb: 'Open-access masterworks, with lessons and practice.', emoji: '🖼️', accent: '#e23b6d', kind: 'curriculum', view: 'ART_GALLERY', curriculumId: 'art-masters' },
  { id: 'comic-museum', subject: 'museums', title: 'Comic & Manga Museum', blurb: 'The history of sequential art.', emoji: '💥', accent: '#FF8C00', kind: 'link', view: 'COMIC_MUSEUM' },
  { id: 'film-museum', subject: 'museums', title: 'Film Museum', blurb: 'Public-domain cinema and film history.', emoji: '🎞️', accent: '#e23b6d', kind: 'link', view: 'MOVIES_TV' },
  // Law and Medicine ladders (data/lawMedicineRoster.ts)
  ...ROSTER_COURSES,
  // Machines & Trades (Machine Atlas): brakes pilot, three stages of one topic
  { id: 'atlas-brakes-g68', subject: 'machines', title: 'How Brakes Work', blurb: 'Friction, pressure, the pedal-to-wheel path, disc and drum brakes, ABS, safe habits and warning signs.', emoji: '🛞', accent: '#FF8C00', kind: 'curriculum', view: 'MACHINE_ATLAS', curriculumId: 'atlas-brakes-g68', stage: 'g68', notice: MACHINES_NOTICE, status: 'UNDER_REVIEW' },
  { id: 'atlas-brakes-hs', subject: 'machines', title: 'Auto Tech: Brakes', blurb: 'Hydraulics, boosters, calipers and drums, fluid, ABS basics, inspection, diagnosis, estimating and customer communication.', emoji: '🔧', accent: '#FF8C00', kind: 'curriculum', view: 'MACHINE_ATLAS', curriculumId: 'atlas-brakes-hs', stage: 'g912', notice: MACHINES_NOTICE, status: 'UNDER_REVIEW' },
  { id: 'atlas-brakes-college', subject: 'machines', title: 'Brake Systems for Technicians', blurb: 'Force and heat calculations, ABS control theory, scan-tool diagnosis, bleeding methods, regenerative braking, documentation and liability.', emoji: '🛠️', accent: '#FF8C00', kind: 'curriculum', view: 'MACHINE_ATLAS', curriculumId: 'atlas-brakes-college', stage: 'college', notice: MACHINES_NOTICE, status: 'UNDER_REVIEW' },
  // Planned Machine Atlas courses: no content yet (COMING_SOON, not navigable)
  { id: 'atlas-engine', subject: 'machines', title: 'Engines', blurb: 'How engines make power, cool and lubricate themselves.', emoji: '⚙️', accent: '#FF8C00', kind: 'link', view: 'MACHINE_ATLAS', status: 'COMING_SOON' },
  { id: 'atlas-drivetrain', subject: 'machines', title: 'Drivetrain and Chassis', blurb: 'Transmissions, axles, steering and suspension.', emoji: '🚙', accent: '#FF8C00', kind: 'link', view: 'MACHINE_ATLAS', status: 'COMING_SOON' },
  { id: 'atlas-other-machines', subject: 'machines', title: 'Diesel, Motorcycles, Rail, Marine and Aviation', blurb: 'The same method applied to other machines.', emoji: '🚂', accent: '#FF8C00', kind: 'link', view: 'MACHINE_ATLAS', status: 'COMING_SOON' },
];

export const coursesIn = (subjectId: string) => COURSES.filter(c => c.subject === subjectId);

/** Lazy-load the curricula (one dynamic import each) so the map's first paint stays light. */
const CURRICULUM_LOADERS: Record<string, () => Promise<Curriculum>> = {
  'civics-hall': () => import('../data/civicsCurriculum').then(m => m.CIVICS_HALL),
  'econ-school': () => import('../data/econCurriculum').then(m => m.ECON_SCHOOL),
  'money-school': () => import('../data/finlitCurriculum').then(m => m.MONEY_SCHOOL),
  'philosophy-school': () => import('../data/philosophyCurriculum').then(m => m.PHILOSOPHY_SCHOOL),
  'real-estate-school': () => import('../data/realEstateCurriculum').then(m => m.REAL_ESTATE_SCHOOL),
  'film-school': () => import('../data/filmSchoolCurriculum').then(m => m.FILM_SCHOOL),
  'photo-art-school': () => import('../data/photoArtCurriculum').then(m => m.PHOTO_ART_SCHOOL),
  'chora-history': () => import('../data/choraCurriculum').then(m => m.CHORA_CURRICULUM),
  'history-sentences': () => import('../data/historySentencesCurriculum').then(m => m.HISTORY_SENTENCES),
  'young-entrepreneurs': () => import('../data/youngEntrepreneursCurriculum').then(m => m.YOUNG_ENTREPRENEURS),
  'art-masters': () => import('../data/practice/courses/art-masters').then(m => m.COURSE_MODULE.curriculum),
  'film-history': () => import('../data/practice/courses/film-history').then(m => m.COURSE_MODULE.curriculum),
  'hq-quest': () => import('../data/practice/courses/hq-quest').then(m => m.COURSE_MODULE.curriculum),
  'lab-archaeology': () => import('../data/practice/courses/lab-archaeology').then(m => m.COURSE_MODULE.curriculum),
  'lab-architecture': () => import('../data/practice/courses/lab-architecture').then(m => m.COURSE_MODULE.curriculum),
  'lab-astronomy': () => import('../data/practice/courses/lab-astronomy').then(m => m.COURSE_MODULE.curriculum),
  'lab-biology': () => import('../data/practice/courses/lab-biology').then(m => m.COURSE_MODULE.curriculum),
  'lab-chemistry': () => import('../data/practice/courses/lab-chemistry').then(m => m.COURSE_MODULE.curriculum),
  'lab-cs': () => import('../data/practice/courses/lab-cs').then(m => m.COURSE_MODULE.curriculum),
  'lab-data': () => import('../data/practice/courses/lab-data').then(m => m.COURSE_MODULE.curriculum),
  'lab-earth': () => import('../data/practice/courses/lab-earth').then(m => m.COURSE_MODULE.curriculum),
  'lab-engineering': () => import('../data/practice/courses/lab-engineering').then(m => m.COURSE_MODULE.curriculum),
  'lab-environment': () => import('../data/practice/courses/lab-environment').then(m => m.COURSE_MODULE.curriculum),
  'lab-history': () => import('../data/practice/courses/lab-history').then(m => m.COURSE_MODULE.curriculum),
  'lab-mathematics': () => import('../data/practice/courses/lab-mathematics').then(m => m.COURSE_MODULE.curriculum),
  'lab-networks': () => import('../data/practice/courses/lab-networks').then(m => m.COURSE_MODULE.curriculum),
  'lab-neuroscience': () => import('../data/practice/courses/lab-neuroscience').then(m => m.COURSE_MODULE.curriculum),
  'lab-physics': () => import('../data/practice/courses/lab-physics').then(m => m.COURSE_MODULE.curriculum),
  'music-figures': () => import('../data/practice/courses/music-figures').then(m => m.COURSE_MODULE.curriculum),
  'sports-history': () => import('../data/practice/courses/sports-history').then(m => m.COURSE_MODULE.curriculum),
  'lab-combat': () => import('../data/practice/courses/lab-combat').then(m => m.COURSE_MODULE.curriculum),
  'botany-forest': () => import('../data/practice/courses/botany-forest').then(m => m.COURSE_MODULE.curriculum),
  'comic-history': () => import('../data/practice/courses/comic-history').then(m => m.COURSE_MODULE.curriculum),
  'founding-documents': () => import('../data/practice/courses/founding-documents').then(m => m.COURSE_MODULE.curriculum),
  'music-theory': () => import('../data/practice/courses/music-theory').then(m => m.COURSE_MODULE.curriculum),
  'graphic-design': () => import('../data/practice/courses/graphic-design').then(m => m.COURSE_MODULE.curriculum),
  'audio-engineering': () => import('../data/practice/courses/audio-engineering').then(m => m.COURSE_MODULE.curriculum),
  'film-directing': () => import('../data/practice/courses/film-directing').then(m => m.COURSE_MODULE.curriculum),
  'film-producing': () => import('../data/practice/courses/film-producing').then(m => m.COURSE_MODULE.curriculum),
  'art-movements-classical': () => import('../data/practice/courses/art-movements-classical').then(m => m.COURSE_MODULE.curriculum),
  'art-movements-modern': () => import('../data/practice/courses/art-movements-modern').then(m => m.COURSE_MODULE.curriculum),
  'music-genres': () => import('../data/practice/courses/music-genres').then(m => m.COURSE_MODULE.curriculum),
  'lit-studies-modern': () => import('../data/practice/courses/lit-studies-modern').then(m => m.COURSE_MODULE.curriculum),
  'history-north-america': () => import('../data/practice/courses/history-north-america').then(m => m.COURSE_MODULE.curriculum),
  'history-south-america': () => import('../data/practice/courses/history-south-america').then(m => m.COURSE_MODULE.curriculum),
  'history-europe': () => import('../data/practice/courses/history-europe').then(m => m.COURSE_MODULE.curriculum),
  'history-asia': () => import('../data/practice/courses/history-asia').then(m => m.COURSE_MODULE.curriculum),
  'history-arab-world': () => import('../data/practice/courses/history-arab-world').then(m => m.COURSE_MODULE.curriculum),
  'world-mythology': () => import('../data/practice/courses/world-mythology').then(m => m.COURSE_MODULE.curriculum),
  'color-theory': () => import('../data/practice/courses/color-theory').then(m => m.COURSE_MODULE.curriculum),
  'lighting-design': () => import('../data/practice/courses/lighting-design').then(m => m.COURSE_MODULE.curriculum),
  'design-movements': () => import('../data/practice/courses/design-movements').then(m => m.COURSE_MODULE.curriculum),
  'film-genres': () => import('../data/practice/courses/film-genres').then(m => m.COURSE_MODULE.curriculum),
  'lit-studies-early': () => import('../data/practice/courses/lit-studies-early').then(m => m.COURSE_MODULE.curriculum),
  'entertainment-finance': () => import('../data/practice/courses/entertainment-finance').then(m => m.COURSE_MODULE.curriculum),
  'music-theory-early': () => import('../data/practice/courses/music-theory-early').then(m => m.COURSE_MODULE.curriculum),
  'music-theory-elementary': () => import('../data/practice/courses/music-theory-elementary').then(m => m.COURSE_MODULE.curriculum),
  'music-theory-secondary': () => import('../data/practice/courses/music-theory-secondary').then(m => m.COURSE_MODULE.curriculum),
  'music-theory-college': () => import('../data/practice/courses/music-theory-college').then(m => m.COURSE_MODULE.curriculum),
  'music-history-eras': () => import('../data/practice/courses/music-history-eras').then(m => m.COURSE_MODULE.curriculum),
  'theatre-scripts': () => import('../data/practice/courses/theatre-scripts').then(m => m.COURSE_MODULE.curriculum),
  'thinking-methods': () => import('../data/practice/courses/thinking-methods').then(m => m.COURSE_MODULE.curriculum),
  'world-religions': () => import('../data/practice/courses/world-religions').then(m => m.COURSE_MODULE.curriculum),
  'film-business': () => import('../data/practice/courses/film-business').then(m => m.COURSE_MODULE.curriculum),
  'ip-protection': () => import('../data/practice/courses/ip-protection').then(m => m.COURSE_MODULE.curriculum),
  'music-business': () => import('../data/practice/courses/music-business').then(m => m.COURSE_MODULE.curriculum),
  'publishing-business': () => import('../data/practice/courses/publishing-business').then(m => m.COURSE_MODULE.curriculum),
  'classic-literature': () => import('../data/languageArtsClassics').then(m => m.CLASSIC_LITERATURE),
};
// Law and Medicine ladders: explicit imports (a template-literal import would bundle every file in the folder).
CURRICULUM_LOADERS['law-prek2'] = () => import('../data/practice/courses/law-prek2').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['law-g35'] = () => import('../data/practice/courses/law-g35').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['law-g68'] = () => import('../data/practice/courses/law-g68').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['law-g912'] = () => import('../data/practice/courses/law-g912').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['law-college'] = () => import('../data/practice/courses/law-college').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['law-legalwriting'] = () => import('../data/practice/courses/law-legalwriting').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['law-contracts'] = () => import('../data/practice/courses/law-contracts').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['law-torts'] = () => import('../data/practice/courses/law-torts').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['law-civpro'] = () => import('../data/practice/courses/law-civpro').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['law-crimlaw'] = () => import('../data/practice/courses/law-crimlaw').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['law-property'] = () => import('../data/practice/courses/law-property').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['law-conlaw'] = () => import('../data/practice/courses/law-conlaw').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['law-evidence'] = () => import('../data/practice/courses/law-evidence').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['law-crimpro'] = () => import('../data/practice/courses/law-crimpro').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['law-admin'] = () => import('../data/practice/courses/law-admin').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['law-business-orgs'] = () => import('../data/practice/courses/law-business-orgs').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['law-profresp'] = () => import('../data/practice/courses/law-profresp').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['law-jurisprudence'] = () => import('../data/practice/courses/law-jurisprudence').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['law-intl-public'] = () => import('../data/practice/courses/law-intl-public').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['law-intl-human-rights'] = () => import('../data/practice/courses/law-intl-human-rights').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['law-intl-humanitarian-criminal'] = () => import('../data/practice/courses/law-intl-humanitarian-criminal').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['law-intl-trade-business'] = () => import('../data/practice/courses/law-intl-trade-business').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['law-comparative'] = () => import('../data/practice/courses/law-comparative').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['med-prek2'] = () => import('../data/practice/courses/med-prek2').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['med-g35'] = () => import('../data/practice/courses/med-g35').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['med-g68'] = () => import('../data/practice/courses/med-g68').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['med-ethics-young'] = () => import('../data/practice/courses/med-ethics-young').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['med-g912'] = () => import('../data/practice/courses/med-g912').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['med-ethics-hs'] = () => import('../data/practice/courses/med-ethics-hs').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['med-premed-chem'] = () => import('../data/practice/courses/med-premed-chem').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['med-premed-biochem'] = () => import('../data/practice/courses/med-premed-biochem').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['med-premed-behavioral'] = () => import('../data/practice/courses/med-premed-behavioral').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['med-history'] = () => import('../data/practice/courses/med-history').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['med-skills'] = () => import('../data/practice/courses/med-skills').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['med-anatomy'] = () => import('../data/practice/courses/med-anatomy').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['med-physiology'] = () => import('../data/practice/courses/med-physiology').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['med-biochem-genetics'] = () => import('../data/practice/courses/med-biochem-genetics').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['med-histo-embryo'] = () => import('../data/practice/courses/med-histo-embryo').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['med-neuro'] = () => import('../data/practice/courses/med-neuro').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['med-micro'] = () => import('../data/practice/courses/med-micro').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['med-immuno'] = () => import('../data/practice/courses/med-immuno').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['med-path'] = () => import('../data/practice/courses/med-path').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['med-pharm-principles'] = () => import('../data/practice/courses/med-pharm-principles').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['med-pharm-systems'] = () => import('../data/practice/courses/med-pharm-systems').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['med-epi-biostats'] = () => import('../data/practice/courses/med-epi-biostats').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['med-clin-im'] = () => import('../data/practice/courses/med-clin-im').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['med-clin-surgery'] = () => import('../data/practice/courses/med-clin-surgery').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['med-clin-peds'] = () => import('../data/practice/courses/med-clin-peds').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['med-clin-obgyn'] = () => import('../data/practice/courses/med-clin-obgyn').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['med-clin-psych'] = () => import('../data/practice/courses/med-clin-psych').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['med-clin-em'] = () => import('../data/practice/courses/med-clin-em').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['med-clin-fm'] = () => import('../data/practice/courses/med-clin-fm').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['med-ethics-prof'] = () => import('../data/practice/courses/med-ethics-prof').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['med-global-health'] = () => import('../data/practice/courses/med-global-health').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['atlas-brakes-g68'] = () => import('../data/practice/courses/atlas-brakes-g68').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['atlas-brakes-hs'] = () => import('../data/practice/courses/atlas-brakes-hs').then(m => m.COURSE_MODULE.curriculum);
CURRICULUM_LOADERS['atlas-brakes-college'] = () => import('../data/practice/courses/atlas-brakes-college').then(m => m.COURSE_MODULE.curriculum);
export const loadCurriculum = (id: string): Promise<Curriculum | null> =>
  (CURRICULUM_LOADERS[id] ? CURRICULUM_LOADERS[id]() : Promise.resolve(null)).catch(() => null);

/** The Math-in-the-Real-World course that matches a plain math grade (for the "see it in context" link). */
export const contextCourseForGrade = (grade: number): string => (grade <= 2 ? 'ctx-prek2' : grade <= 5 ? 'ctx-g35' : grade <= 8 ? 'ctx-g68' : 'ctx-g912');

/**
 * Learning threads — curated paths that cut ACROSS subjects, so one real-world goal pulls in math,
 * reading, history, money and making. Each step opens a course (courseId) or a studio (view).
 */
export interface ThreadStep { label: string; why: string; courseId?: string; view?: string }
export interface Thread { id: string; title: string; blurb: string; emoji: string; accent: string; steps: ThreadStep[] }

export const THREADS: Thread[] = [
  { id: 'world-history-ladder', title: 'A world history reading path', emoji: '🌍', accent: '#3B82F6', blurb: 'Six regional histories and the stories peoples told about themselves.', steps: [
    { label: 'History of North America', why: 'Start close to home, from the first peoples forward.', courseId: 'history-north-america' },
    { label: 'History of South America and Latin America', why: 'The other half of the Americas.', courseId: 'history-south-america' },
    { label: 'History of Europe', why: 'Empires, faith, revolutions and union.', courseId: 'history-europe' },
    { label: 'History of Asia', why: 'The largest and most populous continent, across four thousand years.', courseId: 'history-asia' },
    { label: 'History of the Arab World and the Middle East', why: 'Where writing, cities and three faiths began.', courseId: 'history-arab-world' },
    { label: 'Myths and Mythology of the World', why: 'The stories each culture told about where it came from.', courseId: 'world-mythology' } ] },
  { id: 'art-and-design-ladder', title: 'Art, design and craft', emoji: '🎨', accent: '#E23B6D', blurb: 'Color and light, graphic design, then the movements that shaped how we see.', steps: [
    { label: 'Color Theory', why: 'How color works.', courseId: 'color-theory' },
    { label: 'Graphic Design', why: 'Put color and type to work.', courseId: 'graphic-design' },
    { label: 'Lighting Design', why: 'Shape a scene with light.', courseId: 'lighting-design' },
    { label: 'Art Movements I', why: 'From the ancient world to Impressionism.', courseId: 'art-movements-classical' },
    { label: 'Art Movements II', why: 'Post-Impressionism to today.', courseId: 'art-movements-modern' },
    { label: 'Design Movements', why: 'Arts and Crafts, Bauhaus, Art Deco and beyond.', courseId: 'design-movements' } ] },
  { id: 'screen-and-sound-craft', title: 'Make film and sound professionally', emoji: '🎞️', accent: '#C9871F', blurb: 'Direct, produce, finance and record.', steps: [
    { label: 'Film Directing', why: 'Tell the story on screen.', courseId: 'film-directing' },
    { label: 'Film Producing', why: 'Get it made and delivered.', courseId: 'film-producing' },
    { label: 'Entertainment Finance', why: 'Fund it and follow the money.', courseId: 'entertainment-finance' },
    { label: 'Audio Engineering', why: 'Record, mix and master the sound.', courseId: 'audio-engineering' },
    { label: 'Film Genres', why: 'Learn the conventions you will work with.', courseId: 'film-genres' } ] },
  { id: 'music-ladder', title: 'The music ladder', emoji: '🎼', accent: '#FFD24A', blurb: 'From keeping a beat to college harmony, with the history of how music grew.', steps: [
    { label: 'Music Foundations', why: 'Beat, pitch and playing together.', courseId: 'music-theory-early' },
    { label: 'Music Theory, grades 3-5', why: 'Reading notes, rhythms and scales.', courseId: 'music-theory-elementary' },
    { label: 'Music Theory and Instruments', why: 'How instruments make sound, and the forms that organise it.', courseId: 'music-theory' },
    { label: 'Music Theory, grades 6-12', why: 'Chords, voice leading and form.', courseId: 'music-theory-secondary' },
    { label: 'Music Theory, college', why: 'Counterpoint, chromatic harmony, set theory and jazz.', courseId: 'music-theory-college' },
    { label: 'The Story of Music', why: 'The history behind everything you just learned.', courseId: 'music-history-eras' } ] },
  { id: 'music-business', title: 'The business of music', emoji: '🎤', accent: '#FFD24A', blurb: 'From the first recordings to a band that pays its way.', steps: [
    { label: 'Music History', why: 'How recorded sound and the music business began.', courseId: 'chora-history' },
    { label: 'Small Business math', why: 'Tempo, ratios and break-even for a band.', courseId: 'ctx-g68' },
    { label: 'School of Money', why: 'Earning, saving and credit for a working musician.', courseId: 'money-school' },
    { label: 'Make a track in Melos', why: 'Put it into practice.', view: 'MELOS' } ] },
  { id: 'make-a-film', title: 'Make a film', emoji: '🎬', accent: '#e23b6d', blurb: 'Story, craft, budget and an audience.', steps: [
    { label: 'Film School', why: 'Write, shoot and edit with the craft behind it.', courseId: 'film-school' },
    { label: 'Venture Math', why: 'Budgets, aspect ratios and margins for a production.', courseId: 'ctx-g912' },
    { label: 'Film Museum', why: 'Watch where the art form came from.', courseId: 'film-museum' } ] },
  { id: 'sound-and-numbers', title: 'Sound and numbers', emoji: '🎶', accent: '#7a2bd6', blurb: 'Why music is mathematics you can hear.', steps: [
    { label: 'Fractions of a beat', why: 'Rhythm is fractions.', courseId: 'ctx-g35' },
    { label: 'Frequency ratios', why: 'Octaves and fifths are whole-number ratios.', courseId: 'ctx-g68' },
    { label: 'Physics', why: 'Waves, frequency and resonance in the Labs.', courseId: 'sci-physics' } ] },
  { id: 'sports-and-numbers', title: 'Sports and numbers', emoji: '⚽', accent: '#3FB98E', blurb: 'The math behind every score, stat and strategy.', steps: [
    { label: 'Scoring and fractions of a match', why: 'Counting points, laps and parts of a 90-minute game.', courseId: 'ctx-g35' },
    { label: 'Statistics and speed', why: 'Averages, shooting percentage and distance = speed x time.', courseId: 'ctx-g68' },
    { label: 'Probability and projectiles', why: 'Expected value and the parabola of a kicked ball.', courseId: 'ctx-g912' },
    { label: 'Sports History: The World Cup', why: 'The story behind the numbers.', courseId: 'sports-history' },
    { label: 'Plajah Sports', why: 'Follow real teams and tournaments.', view: 'PLAJAH_SPORTS' } ] },
  { id: 'read-the-past', title: 'Read the past', emoji: '📚', accent: '#D40055', blurb: 'Classics, history and the recordings of their age.', steps: [
    { label: 'Classic Literature', why: 'Read free in Lorea, with a guide for each book.', courseId: 'classic-literature' },
    { label: 'History Quest', why: 'The events behind the stories.', courseId: 'history-quest' },
    { label: 'Hear it in the Chora Vault', why: 'Speeches, songs and oral histories from the era.', view: 'MUSIC' } ] },
  { id: 'start-a-business', title: 'Start a business', emoji: '🚀', accent: '#F59E0B', blurb: 'From a pretend shop to a real venture.', steps: [
    { label: 'Young Entrepreneurs', why: 'Money and enterprise from the first coin, with math built in.', courseId: 'young-entrepreneurs' },
    { label: 'Little Shop math', why: 'Coins, counting and selling, from preschool.', courseId: 'ctx-prek2' },
    { label: 'Venture Math', why: 'Profit lines, margins and compound growth.', courseId: 'ctx-g912' },
    { label: 'School of Money', why: 'Money habits that last.', courseId: 'money-school' },
    { label: 'Business School', why: 'Form it, keep books, fund it and grow.', courseId: 'business-school' } ] },
];
