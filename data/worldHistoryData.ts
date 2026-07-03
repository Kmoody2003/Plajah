// ─────────────────────────────────────────────────────────────────────────────
// World History discipline data — the seed for the Plajah Academia World History
// studio. Kept deliberately factual: every figure/civilization carries a real
// Wikipedia slug so portraits + biographies enrich live at runtime, and every
// primary-source entry points at a genuine, free, open archive or API.
// ─────────────────────────────────────────────────────────────────────────────
import type { MuseumFigure, MuseumHallDef } from '../components/MuseumHall';
import type { ArtifactCollection } from '../services/artifactsService';

// ── Figure halls ─────────────────────────────────────────────────────────────
export const HISTORY_FIGURE_HALLS: MuseumHallDef[] = [
  { id: 'rulers', label: 'Rulers & Statecraft', blurb: 'The emperors, queens and lawgivers who built and bound the great states.' },
  { id: 'thinkers', label: 'Thinkers & Scientists', blurb: 'Philosophers, scientists and inventors who reshaped how humanity understands the world.' },
  { id: 'explorers', label: 'Explorers & Travellers', blurb: 'Those who crossed oceans, deserts and continents and connected the world.' },
  { id: 'founders', label: 'Founders & Revolutionaries', blurb: 'Liberators and nation-builders who overturned the old order.' },
  { id: 'faith', label: 'Faith & Culture', blurb: 'Prophets, artists and reformers who shaped belief, learning and the arts.' },
];

// ── Figures (~30, world-spanning) ────────────────────────────────────────────
export const HISTORY_FIGURES: MuseumFigure[] = [
  // Rulers & Statecraft
  {
    id: 'hammurabi', name: 'Hammurabi', wikiSlug: 'Hammurabi', hall: 'rulers',
    role: 'King of Babylon', era: 'Old Babylonian', nationality: 'Babylonian', years: 'r. c.1792–1750 BCE',
    tagline: 'Author of one of the earliest written law codes.',
    works: ['Code of Hammurabi', 'Unification of Mesopotamia'],
    techniques: ['Codified 282 laws inscribed on a diorite stele', 'Established the principle of written, publicly displayed law', 'Expanded Babylon into the dominant Mesopotamian power'],
  },
  {
    id: 'ashoka', name: 'Ashoka the Great', wikiSlug: 'Ashoka', hall: 'rulers',
    role: 'Mauryan Emperor', era: 'Classical India', nationality: 'Indian', years: 'r. c.268–232 BCE',
    tagline: 'The conqueror who embraced Buddhism and non-violence.',
    works: ['Edicts of Ashoka', 'Pillars of Ashoka'],
    techniques: ['Ruled the largest empire in Indian history to that point', 'Renounced war after the Kalinga campaign', 'Spread Buddhism across Asia and inscribed moral edicts on stone pillars'],
  },
  {
    id: 'qinshihuang', name: 'Qin Shi Huang', wikiSlug: 'Qin_Shi_Huang', hall: 'rulers',
    role: 'First Emperor of China', era: 'Qin Dynasty', nationality: 'Chinese', years: 'r. 221–210 BCE',
    tagline: 'Unifier of China and builder of the Terracotta Army.',
    works: ['Unification of China', 'Great Wall (early sections)', 'Terracotta Army'],
    techniques: ['Standardised writing, currency, weights and measures', 'Built a centralised bureaucratic empire', 'Connected and extended the northern defensive walls'],
  },
  {
    id: 'cleopatra', name: 'Cleopatra VII', wikiSlug: 'Cleopatra', hall: 'rulers',
    role: 'Pharaoh of Egypt', era: 'Ptolemaic Egypt', nationality: 'Egyptian', years: 'r. 51–30 BCE',
    tagline: 'The last active ruler of Ptolemaic Egypt.',
    works: ['Alliances with Rome', 'Restoration of Egyptian prosperity'],
    techniques: ['Reputedly spoke nine languages', 'Navigated Roman civil wars through alliances with Caesar and Antony', 'Her death marked the end of Hellenistic Egypt'],
  },
  {
    id: 'caesar', name: 'Julius Caesar', wikiSlug: 'Julius_Caesar', hall: 'rulers',
    role: 'Roman Dictator', era: 'Roman Republic', nationality: 'Roman', years: '100–44 BCE',
    tagline: 'General whose rise ended the Roman Republic.',
    works: ['Conquest of Gaul', 'Commentarii de Bello Gallico', 'Julian calendar'],
    techniques: ['Conquered Gaul and invaded Britain', 'Crossed the Rubicon to seize power', 'Reformed the calendar into the Julian system'],
  },
  {
    id: 'charlemagne', name: 'Charlemagne', wikiSlug: 'Charlemagne', hall: 'rulers',
    role: 'Holy Roman Emperor', era: 'Early Middle Ages', nationality: 'Frankish', years: 'r. 768–814',
    tagline: 'Father of Europe who revived the Western empire.',
    works: ['Carolingian Empire', 'Carolingian Renaissance'],
    techniques: ['United much of Western Europe under one crown', 'Crowned Emperor by the Pope in 800', 'Sponsored a revival of learning, script and the arts'],
  },
  {
    id: 'genghis', name: 'Genghis Khan', wikiSlug: 'Genghis_Khan', hall: 'rulers',
    role: 'Great Khan', era: 'Mongol Empire', nationality: 'Mongol', years: 'c.1162–1227',
    tagline: 'Founder of the largest contiguous land empire in history.',
    works: ['Mongol Empire', 'Yassa legal code'],
    techniques: ['Unified the Mongol tribes', 'Built a meritocratic, mobile military machine', 'Established the Pax Mongolica that reopened Silk Road trade'],
  },
  {
    id: 'mansamusa', name: 'Mansa Musa', wikiSlug: 'Mansa_Musa', hall: 'rulers',
    role: 'Emperor of Mali', era: 'Mali Empire', nationality: 'Malian', years: 'r. c.1312–1337',
    tagline: 'Possibly the wealthiest individual in history.',
    works: ['Pilgrimage to Mecca', 'University of Sankore, Timbuktu'],
    techniques: ['Expanded the Mali Empire across West Africa', 'His 1324 hajj famously disrupted Mediterranean gold prices', 'Made Timbuktu a centre of Islamic scholarship'],
  },
  {
    id: 'elizabeth1', name: 'Elizabeth I', wikiSlug: 'Elizabeth_I', hall: 'rulers',
    role: 'Queen of England', era: 'Elizabethan Era', nationality: 'English', years: 'r. 1558–1603',
    tagline: 'The Virgin Queen of England’s golden age.',
    works: ['Elizabethan Religious Settlement', 'Defeat of the Spanish Armada'],
    techniques: ['Stabilised a divided realm through religious compromise', 'Presided over an English cultural flowering (Shakespeare, Marlowe)', 'Laid groundwork for English overseas expansion'],
  },
  {
    id: 'suleiman', name: 'Suleiman the Magnificent', wikiSlug: 'Suleiman_the_Magnificent', hall: 'rulers',
    role: 'Ottoman Sultan', era: 'Ottoman Golden Age', nationality: 'Ottoman', years: 'r. 1520–1566',
    tagline: 'The lawgiver who brought the Ottoman Empire to its zenith.',
    works: ['Kanun legal reforms', 'Süleymaniye Mosque'],
    techniques: ['Expanded the empire deep into Europe and the Middle East', 'Overhauled the legal system, earning the name "Kanuni" (Lawgiver)', 'Patronised a golden age of Ottoman art and architecture'],
  },
  {
    id: 'lincoln', name: 'Abraham Lincoln', wikiSlug: 'Abraham_Lincoln', hall: 'rulers',
    role: 'U.S. President', era: 'American Civil War', nationality: 'American', years: '1809–1865',
    tagline: 'Preserved the Union and ended slavery in the United States.',
    works: ['Emancipation Proclamation', 'Gettysburg Address', '13th Amendment'],
    techniques: ['Led the Union through the Civil War', 'Issued the Emancipation Proclamation freeing enslaved people', 'Redefined the war as a struggle for human equality'],
  },

  // Thinkers & Scientists
  {
    id: 'confucius', name: 'Confucius', wikiSlug: 'Confucius', hall: 'thinkers',
    role: 'Philosopher', era: 'Spring and Autumn', nationality: 'Chinese', years: '551–479 BCE',
    tagline: 'The teacher whose ethics shaped East Asian civilisation.',
    works: ['Analects', 'Confucian ethics'],
    techniques: ['Taught ideals of virtue, ritual and filial duty', 'His thought became the backbone of Chinese statecraft and education', 'Influenced Korea, Japan and Vietnam for two millennia'],
  },
  {
    id: 'aristotle', name: 'Aristotle', wikiSlug: 'Aristotle', hall: 'thinkers',
    role: 'Philosopher', era: 'Classical Greece', nationality: 'Greek', years: '384–322 BCE',
    tagline: 'The founder of Western systematic knowledge.',
    works: ['Nicomachean Ethics', 'Politics', 'Metaphysics', 'Organon'],
    techniques: ['Formalised logic and the syllogism', 'Founded fields from biology to poetics', 'Tutored Alexander the Great'],
  },
  {
    id: 'ibnsina', name: 'Ibn Sina (Avicenna)', wikiSlug: 'Avicenna', hall: 'thinkers',
    role: 'Polymath', era: 'Islamic Golden Age', nationality: 'Persian', years: 'c.980–1037',
    tagline: 'The physician-philosopher of the Islamic Golden Age.',
    works: ['The Canon of Medicine', 'The Book of Healing'],
    techniques: ['Wrote the medical encyclopedia used in Europe for centuries', 'Advanced logic, metaphysics and astronomy', 'Synthesised Aristotelian and Islamic thought'],
  },
  {
    id: 'leonardo', name: 'Leonardo da Vinci', wikiSlug: 'Leonardo_da_Vinci', hall: 'thinkers',
    role: 'Polymath', era: 'Renaissance', nationality: 'Italian', years: '1452–1519',
    tagline: 'The archetype of the Renaissance genius.',
    works: ['Mona Lisa', 'The Last Supper', 'Vitruvian Man', 'Codex notebooks'],
    techniques: ['Fused art with rigorous anatomical and engineering study', 'Filled notebooks with inventions centuries ahead of their time', 'Pioneered sfumato and naturalistic painting'],
  },
  {
    id: 'newton', name: 'Isaac Newton', wikiSlug: 'Isaac_Newton', hall: 'thinkers',
    role: 'Physicist & Mathematician', era: 'Scientific Revolution', nationality: 'English', years: '1643–1727',
    tagline: 'Author of the laws of motion and universal gravitation.',
    works: ['Principia Mathematica', 'Opticks', 'Calculus (independently)'],
    techniques: ['Formulated the three laws of motion and gravitation', 'Co-invented calculus', 'Explained the visible spectrum of light'],
  },
  {
    id: 'darwin', name: 'Charles Darwin', wikiSlug: 'Charles_Darwin', hall: 'thinkers',
    role: 'Naturalist', era: 'Victorian Era', nationality: 'British', years: '1809–1882',
    tagline: 'The naturalist who explained the origin of species.',
    works: ['On the Origin of Species', 'The Voyage of the Beagle'],
    techniques: ['Proposed evolution by natural selection', 'Gathered evidence across the HMS Beagle voyage', 'Reshaped biology and humanity’s view of itself'],
  },
  {
    id: 'einstein', name: 'Albert Einstein', wikiSlug: 'Albert_Einstein', hall: 'thinkers',
    role: 'Physicist', era: 'Modern Era', nationality: 'German-American', years: '1879–1955',
    tagline: 'The mind that reimagined space, time and gravity.',
    works: ['Theory of Relativity', 'E = mc²', 'Photoelectric effect'],
    techniques: ['Formulated special and general relativity', 'Explained the photoelectric effect (Nobel Prize)', 'Reshaped physics and modern cosmology'],
  },
  {
    id: 'gutenberg', name: 'Johannes Gutenberg', wikiSlug: 'Johannes_Gutenberg', hall: 'thinkers',
    role: 'Inventor', era: 'Renaissance', nationality: 'German', years: 'c.1400–1468',
    tagline: 'The printer who put knowledge within everyone’s reach.',
    works: ['Movable-type printing press', 'Gutenberg Bible'],
    techniques: ['Invented practical movable-type printing in Europe', 'Enabled mass production of books', 'Sparked the print revolution that fuelled the Reformation and science'],
  },

  // Explorers & Travellers
  {
    id: 'ibnbattuta', name: 'Ibn Battuta', wikiSlug: 'Ibn_Battuta', hall: 'explorers',
    role: 'Traveller & Scholar', era: 'Postclassical', nationality: 'Moroccan', years: '1304–1368',
    tagline: 'The medieval world’s greatest traveller.',
    works: ['The Rihla (travelogue)'],
    techniques: ['Journeyed over 70,000 miles across Africa, Asia and Europe', 'Documented societies from Mali to China', 'Left one of the richest windows into the 14th-century world'],
  },
  {
    id: 'zhenghe', name: 'Zheng He', wikiSlug: 'Zheng_He', hall: 'explorers',
    role: 'Admiral', era: 'Ming Dynasty', nationality: 'Chinese', years: '1371–1433',
    tagline: 'Commander of China’s vast treasure fleets.',
    works: ['Ming treasure voyages'],
    techniques: ['Led seven grand naval expeditions across the Indian Ocean', 'Reached East Africa and Arabia with enormous fleets', 'Projected Ming power and diplomacy across the seas'],
  },
  {
    id: 'columbus', name: 'Christopher Columbus', wikiSlug: 'Christopher_Columbus', hall: 'explorers',
    role: 'Navigator', era: 'Age of Discovery', nationality: 'Genoese', years: '1451–1506',
    tagline: 'Whose 1492 voyage linked the Old and New Worlds.',
    works: ['Transatlantic voyages of 1492–1504'],
    techniques: ['Crossed the Atlantic under the Spanish crown', 'Opened sustained contact between Europe and the Americas', 'Triggered the Columbian Exchange and its vast consequences'],
  },
  {
    id: 'magellan', name: 'Ferdinand Magellan', wikiSlug: 'Ferdinand_Magellan', hall: 'explorers',
    role: 'Explorer', era: 'Age of Discovery', nationality: 'Portuguese', years: 'c.1480–1521',
    tagline: 'Led the first expedition to circumnavigate the globe.',
    works: ['First circumnavigation (1519–1522)'],
    techniques: ['Found the strait linking the Atlantic and Pacific', 'Named the Pacific Ocean', 'His expedition proved the earth could be circled by sea'],
  },

  // Founders & Revolutionaries
  {
    id: 'toussaint', name: 'Toussaint Louverture', wikiSlug: 'Toussaint_Louverture', hall: 'founders',
    role: 'Revolutionary Leader', era: 'Age of Revolutions', nationality: 'Haitian', years: 'c.1743–1803',
    tagline: 'Leader of the only successful slave revolution.',
    works: ['Haitian Revolution', 'Constitution of 1801'],
    techniques: ['Led formerly enslaved people to defeat colonial powers', 'Built the movement that created Haiti, the first Black republic', 'Became a global symbol of liberation'],
  },
  {
    id: 'bolivar', name: 'Simón Bolívar', wikiSlug: 'Sim%C3%B3n_Bol%C3%ADvar', hall: 'founders',
    role: 'Liberator', era: 'Age of Revolutions', nationality: 'Venezuelan', years: '1783–1830',
    tagline: 'El Libertador of South America.',
    works: ['Liberation of Venezuela, Colombia, Ecuador, Peru & Bolivia', 'Gran Colombia'],
    techniques: ['Led independence wars across South America', 'Freed six nations from Spanish rule', 'Bolivia is named in his honour'],
  },
  {
    id: 'gandhi', name: 'Mahatma Gandhi', wikiSlug: 'Mahatma_Gandhi', hall: 'founders',
    role: 'Independence Leader', era: 'Modern Era', nationality: 'Indian', years: '1869–1948',
    tagline: 'Father of nonviolent resistance and Indian independence.',
    works: ['Satyagraha', 'Salt March', 'Indian independence movement'],
    techniques: ['Pioneered mass nonviolent civil disobedience', 'Led India to independence from British rule', 'Inspired civil-rights movements worldwide'],
  },
  {
    id: 'mandela', name: 'Nelson Mandela', wikiSlug: 'Nelson_Mandela', hall: 'founders',
    role: 'President & Activist', era: 'Contemporary', nationality: 'South African', years: '1918–2013',
    tagline: 'Who dismantled apartheid and reconciled a nation.',
    works: ['Anti-apartheid movement', 'Truth and Reconciliation Commission'],
    techniques: ['Endured 27 years imprisonment for resisting apartheid', 'Became South Africa’s first democratically elected president', 'Championed reconciliation over retribution'],
  },
  {
    id: 'washington', name: 'George Washington', wikiSlug: 'George_Washington', hall: 'founders',
    role: 'Founding President', era: 'Age of Revolutions', nationality: 'American', years: '1732–1799',
    tagline: 'Commander of the Revolution and first U.S. president.',
    works: ['American Revolutionary War', 'Precedents of the U.S. presidency'],
    techniques: ['Led the Continental Army to independence', 'Presided over the Constitutional Convention', 'Set the precedent of peaceful transfer of power'],
  },

  // Faith & Culture
  {
    id: 'augustine', name: 'Augustine of Hippo', wikiSlug: 'Augustine_of_Hippo', hall: 'faith',
    role: 'Theologian', era: 'Late Antiquity', nationality: 'Roman African', years: '354–430',
    tagline: 'The theologian who shaped Western Christianity.',
    works: ['Confessions', 'The City of God'],
    techniques: ['Fused Christian doctrine with classical philosophy', 'Wrote the first great spiritual autobiography', 'Shaped Western theology on grace, sin and time'],
  },
  {
    id: 'martinluther', name: 'Martin Luther', wikiSlug: 'Martin_Luther', hall: 'faith',
    role: 'Reformer', era: 'Reformation', nationality: 'German', years: '1483–1546',
    tagline: 'Whose theses launched the Protestant Reformation.',
    works: ['Ninety-five Theses', 'German translation of the Bible'],
    techniques: ['Challenged the sale of indulgences in 1517', 'Split Western Christianity and empowered vernacular scripture', 'Shaped the German language through his Bible translation'],
  },
  {
    id: 'michelangelo', name: 'Michelangelo', wikiSlug: 'Michelangelo', hall: 'faith',
    role: 'Artist & Sculptor', era: 'Renaissance', nationality: 'Italian', years: '1475–1564',
    tagline: 'The sculptor of the High Renaissance.',
    works: ['David', 'Sistine Chapel ceiling', 'Pietà', 'St. Peter’s Basilica dome'],
    techniques: ['Sculpted David and the Pietà from marble', 'Painted the Sistine Chapel ceiling', 'Defined the ideal of the Renaissance artist'],
  },
];

// ── Civilizations ────────────────────────────────────────────────────────────
export interface Civilization {
  id: string;
  name: string;
  wikiSlug: string;
  region: string;
  span: string;
  hallmarks: string[];
  blurb: string;
}

export const CIVILIZATIONS: Civilization[] = [
  {
    id: 'mesopotamia', name: 'Sumer & Mesopotamia', wikiSlug: 'Sumer', region: 'Fertile Crescent', span: 'c.4500–539 BCE',
    hallmarks: ['Cuneiform writing', 'The wheel', 'City-states', 'Ziggurats', 'Epic of Gilgamesh'],
    blurb: 'The land between the Tigris and Euphrates, where the first cities, writing and law emerged.',
  },
  {
    id: 'egypt', name: 'Ancient Egypt', wikiSlug: 'Ancient_Egypt', region: 'Nile Valley', span: 'c.3100–30 BCE',
    hallmarks: ['Hieroglyphs', 'Pyramids', 'Pharaohs', 'Mummification', 'Solar calendar'],
    blurb: 'A civilisation of extraordinary continuity along the Nile, famed for monumental building and belief in the afterlife.',
  },
  {
    id: 'indus', name: 'Indus Valley Civilisation', wikiSlug: 'Indus_Valley_Civilisation', region: 'South Asia', span: 'c.3300–1300 BCE',
    hallmarks: ['Grid-planned cities', 'Advanced drainage', 'Standardised weights', 'Undeciphered script'],
    blurb: 'One of the earliest urban cultures, with sophisticated city planning at Harappa and Mohenjo-daro.',
  },
  {
    id: 'china', name: 'Ancient China (Shang & Zhou)', wikiSlug: 'Shang_dynasty', region: 'East Asia', span: 'c.1600–256 BCE',
    hallmarks: ['Oracle bone script', 'Bronze casting', 'Mandate of Heaven', 'Hundred Schools of Thought'],
    blurb: 'The foundational Chinese dynasties that gave rise to writing, ancestral ritual and enduring philosophy.',
  },
  {
    id: 'greece', name: 'Ancient Greece', wikiSlug: 'Ancient_Greece', region: 'Mediterranean', span: 'c.800–146 BCE',
    hallmarks: ['Democracy', 'Philosophy', 'Theatre', 'Olympic Games', 'Classical architecture'],
    blurb: 'The city-states that gave the West democracy, philosophy, drama and a lasting artistic ideal.',
  },
  {
    id: 'rome', name: 'Roman Empire', wikiSlug: 'Roman_Empire', region: 'Mediterranean', span: '27 BCE–476 CE (West)',
    hallmarks: ['Roman law', 'Aqueducts & roads', 'Concrete', 'Legions', 'Latin'],
    blurb: 'The empire that unified the Mediterranean world and bequeathed law, language and engineering to Europe.',
  },
  {
    id: 'persia', name: 'Achaemenid Persia', wikiSlug: 'Achaemenid_Empire', region: 'West & Central Asia', span: '550–330 BCE',
    hallmarks: ['Royal Road', 'Satrapies', 'Religious tolerance', 'Persepolis'],
    blurb: 'The first great multinational empire, spanning three continents under Cyrus and Darius.',
  },
  {
    id: 'gupta', name: 'Gupta Empire', wikiSlug: 'Gupta_Empire', region: 'South Asia', span: 'c.320–550 CE',
    hallmarks: ['Decimal & zero', 'Classical Sanskrit literature', 'Ayurveda', 'Temple architecture'],
    blurb: 'India’s classical golden age of mathematics, astronomy, art and literature.',
  },
  {
    id: 'byzantine', name: 'Byzantine Empire', wikiSlug: 'Byzantine_Empire', region: 'Eastern Mediterranean', span: '330–1453 CE',
    hallmarks: ['Hagia Sophia', 'Justinian Code', 'Orthodox Christianity', 'Greek fire'],
    blurb: 'The eastern Roman continuation that preserved classical learning for a thousand years from Constantinople.',
  },
  {
    id: 'maya', name: 'Maya Civilisation', wikiSlug: 'Maya_civilization', region: 'Mesoamerica', span: 'c.2000 BCE–1500s CE',
    hallmarks: ['Hieroglyphic writing', 'Long Count calendar', 'Step pyramids', 'Advanced astronomy'],
    blurb: 'A brilliant Mesoamerican culture renowned for its writing, mathematics and astronomical precision.',
  },
  {
    id: 'aztec', name: 'Aztec Empire', wikiSlug: 'Aztec_Empire', region: 'Mesoamerica', span: 'c.1345–1521 CE',
    hallmarks: ['Tenochtitlan', 'Chinampa farming', 'Tribute network', 'Nahuatl'],
    blurb: 'The Mexica empire centred on the island city of Tenochtitlan, one of the largest cities of its era.',
  },
  {
    id: 'inca', name: 'Inca Empire', wikiSlug: 'Inca_Empire', region: 'Andes', span: 'c.1438–1533 CE',
    hallmarks: ['Machu Picchu', 'Qhapaq Ñan road network', 'Quipu records', 'Terrace agriculture'],
    blurb: 'The largest empire of pre-Columbian America, binding the Andes with roads, terraces and quipu.',
  },
  {
    id: 'mali', name: 'Mali Empire', wikiSlug: 'Mali_Empire', region: 'West Africa', span: 'c.1235–1670 CE',
    hallmarks: ['Timbuktu scholarship', 'Trans-Saharan gold trade', 'Djinguereber Mosque', 'Griot tradition'],
    blurb: 'A vast West African empire of gold and learning, its city Timbuktu a beacon of Islamic scholarship.',
  },
  {
    id: 'greatzimbabwe', name: 'Great Zimbabwe', wikiSlug: 'Great_Zimbabwe', region: 'Southern Africa', span: 'c.1100–1450 CE',
    hallmarks: ['Dry-stone architecture', 'The Great Enclosure', 'Gold & ivory trade', 'Soapstone birds'],
    blurb: 'A medieval trading kingdom whose mortarless stone walls remain among Africa’s greatest monuments.',
  },
  {
    id: 'khmer', name: 'Khmer Empire', wikiSlug: 'Khmer_Empire', region: 'Southeast Asia', span: '802–1431 CE',
    hallmarks: ['Angkor Wat', 'Hydraulic engineering', 'Hindu-Buddhist temples', 'Baray reservoirs'],
    blurb: 'The Southeast Asian empire that built Angkor, the largest religious monument complex in the world.',
  },
  {
    id: 'ottoman', name: 'Ottoman Empire', wikiSlug: 'Ottoman_Empire', region: 'Anatolia & beyond', span: '1299–1922 CE',
    hallmarks: ['Istanbul (Constantinople)', 'Janissaries', 'Millet system', 'Sinan’s mosques'],
    blurb: 'A cosmopolitan empire straddling three continents that shaped Europe, the Middle East and North Africa for six centuries.',
  },
];

// ── Eras ─────────────────────────────────────────────────────────────────────
export interface HistoryEra {
  id: string;
  title: string;
  span: string;
  essay: string;
  developments: string[];
  turningPoints: string[];
}

export const HISTORY_ERAS: HistoryEra[] = [
  {
    id: 'prehistory', title: 'Prehistory', span: 'c.3.3 Mya – 3000 BCE',
    essay: 'Before writing, humanity spread out of Africa, mastered fire and stone tools, created art on cave walls, and — in the Neolithic Revolution — learned to farm. Settled agriculture produced surplus, permanent villages, and the first inequalities of wealth and power that would define history.',
    developments: ['Control of fire and stone tool-making', 'Human migration across every continent', 'Neolithic agricultural revolution', 'Domestication of plants and animals', 'Cave and rock art'],
    turningPoints: ['Out-of-Africa migrations', 'Invention of farming (c.10,000 BCE)', 'First permanent settlements (Çatalhöyük, Jericho)'],
  },
  {
    id: 'rivervalleys', title: 'Ancient River-Valley Civilisations', span: 'c.3500–1200 BCE',
    essay: 'Along the Tigris–Euphrates, Nile, Indus and Yellow rivers, farming surpluses gave birth to the first cities, kings and writing systems. Bronze metallurgy, monumental architecture, organised religion and law codes emerged, and long-distance trade began to knit distant regions together.',
    developments: ['Invention of writing (cuneiform, hieroglyphs)', 'Bronze metallurgy', 'Monumental architecture', 'Codified law and centralised states', 'Wheeled transport and the plough'],
    turningPoints: ['Rise of Sumerian city-states', 'Unification of Egypt (c.3100 BCE)', 'Code of Hammurabi'],
  },
  {
    id: 'classical', title: 'The Classical Age', span: 'c.800 BCE – 500 CE',
    essay: 'Great empires and enduring ideas arose across Eurasia: Greek philosophy and democracy, Roman law and engineering, the Persian and Mauryan empires, Han China, and the founding of Buddhism, Confucianism and Christianity. Trade along the Silk Road connected these worlds as never before.',
    developments: ['Greek philosophy, democracy and theatre', 'Roman law, roads and concrete', 'Silk Road trade networks', 'Founding of world religions and philosophies', 'Large multi-ethnic empires'],
    turningPoints: ['Athenian democracy', 'Alexander’s conquests', 'Rise of the Roman Empire', 'Life of Jesus and spread of Christianity'],
  },
  {
    id: 'postclassical', title: 'The Postclassical / Medieval World', span: 'c.500–1500 CE',
    essay: 'As Rome fell in the West, new powers rose: the Islamic caliphates and their golden age of science, Tang and Song China, the Byzantine Empire, feudal Europe, and the empires of Mali and Ghana. The Mongol conquests briefly linked Eurasia, while the Black Death reshaped societies.',
    developments: ['Islamic Golden Age of science and philosophy', 'Chinese inventions: paper, printing, gunpowder, compass', 'Feudalism and the rise of universities in Europe', 'Trans-Saharan and Indian Ocean trade', 'Spread of Islam and Buddhism'],
    turningPoints: ['Rise of Islam (7th century)', 'Mongol Empire and the Pax Mongolica', 'The Black Death (1347–1351)'],
  },
  {
    id: 'earlymodern', title: 'The Early Modern Era', span: 'c.1450–1750 CE',
    essay: 'The Renaissance revived classical learning; Gutenberg’s press spread ideas; European voyages linked the hemispheres and launched the Columbian Exchange and Atlantic slave trade. The Reformation split Christianity, the Scientific Revolution transformed knowledge, and gunpowder empires — Ottoman, Safavid, Mughal — dominated Asia.',
    developments: ['The printing revolution', 'Global maritime exploration and empire', 'The Columbian Exchange', 'Protestant Reformation', 'Scientific Revolution', 'Gunpowder empires'],
    turningPoints: ['Fall of Constantinople (1453)', 'Columbus reaches the Americas (1492)', 'Luther’s Ninety-five Theses (1517)'],
  },
  {
    id: 'revolutions', title: 'The Age of Revolutions', span: 'c.1750–1850 CE',
    essay: 'Enlightenment ideas of liberty, reason and rights ignited political revolutions in America, France, Haiti and Latin America. Monarchies fell, republics and constitutions rose, slavery was challenged, and nationalism began to reshape the map — while the first stirrings of industry transformed economies.',
    developments: ['Enlightenment political philosophy', 'Constitutional government and declarations of rights', 'Abolition movements', 'Rise of nationalism', 'Early industrialisation'],
    turningPoints: ['American Revolution (1776)', 'French Revolution (1789)', 'Haitian Revolution (1791–1804)', 'Latin American independence wars'],
  },
  {
    id: 'industrial', title: 'The Industrial & Imperial Age', span: 'c.1760–1914 CE',
    essay: 'Steam, coal, steel and electricity remade the world. Factories, railways and telegraphs shrank distances and created new urban working classes. Industrial powers carved up Africa and Asia in a wave of imperialism, while mass migration and global markets bound economies ever tighter.',
    developments: ['Steam power and mechanised factories', 'Railways, steamships and telegraphy', 'Urbanisation and new social classes', 'The "Scramble for Africa" and high imperialism', 'Mass production and global trade'],
    turningPoints: ['Watt’s steam engine', 'Opening of the first railways', 'Berlin Conference (1884–85)'],
  },
  {
    id: 'worldwars', title: 'The Age of World Wars', span: '1914–1945 CE',
    essay: 'Two global conflicts and the Great Depression convulsed the 20th century. Empires collapsed, revolutions swept Russia and China, fascism and communism clashed with democracy, and industrialised warfare — culminating in the Holocaust and the atomic bomb — killed on an unprecedented scale.',
    developments: ['Total, industrialised warfare', 'The Russian and Chinese revolutions', 'Rise of fascism and communism', 'The Great Depression', 'Decolonisation begins', 'Nuclear weapons'],
    turningPoints: ['World War I (1914–1918)', 'Russian Revolution (1917)', 'World War II (1939–1945) and the Holocaust', 'Atomic bombings of Hiroshima and Nagasaki'],
  },
  {
    id: 'contemporary', title: 'The Contemporary World', span: '1945 – present',
    essay: 'The postwar era brought the Cold War, the collapse of empires and the birth of dozens of new nations, the civil-rights and anti-apartheid struggles, and a digital and information revolution. Globalisation, human rights, and now climate change and artificial intelligence define an interconnected planet.',
    developments: ['The Cold War and its end', 'Global decolonisation and new nations', 'Civil-rights and human-rights movements', 'The digital and internet revolution', 'Globalisation and climate awareness'],
    turningPoints: ['End of WWII and founding of the UN', 'Decolonisation of Africa and Asia', 'Fall of the Berlin Wall (1989)', 'The rise of the internet'],
  },
];

// ── Primary sources (real, free open archives & APIs) ────────────────────────
export interface PrimarySource {
  name: string;
  org: string;
  url: string;
  desc: string;
  access: 'Open' | 'Free API' | 'Free key';
}

export const PRIMARY_SOURCES: PrimarySource[] = [
  {
    name: 'Library of Congress', org: 'U.S. Library of Congress', url: 'https://www.loc.gov/',
    desc: 'The largest library in the world — millions of digitised manuscripts, maps, photographs and recordings, with a public JSON API (append ?fo=json to any search).',
    access: 'Free API',
  },
  {
    name: 'Chronicling America', org: 'Library of Congress / NEH', url: 'https://chroniclingamerica.loc.gov/',
    desc: 'Digitised historic American newspapers (1770–1963), fully searchable with an open JSON/OpenSearch API.',
    access: 'Free API',
  },
  {
    name: 'Internet Archive', org: 'Internet Archive', url: 'https://archive.org/',
    desc: 'A universal library of tens of millions of books, texts, audio, film and web pages, all with an open Advanced Search and Metadata API.',
    access: 'Free API',
  },
  {
    name: 'DPLA', org: 'Digital Public Library of America', url: 'https://dp.la/',
    desc: 'Aggregates millions of items from U.S. libraries, archives and museums behind a single open metadata API.',
    access: 'Free key',
  },
  {
    name: 'Europeana', org: 'European Union', url: 'https://www.europeana.eu/',
    desc: 'Europe’s digital cultural heritage — over 50 million artworks, books, films and artefacts, exposed via a free REST API.',
    access: 'Free key',
  },
  {
    name: 'Wikisource', org: 'Wikimedia Foundation', url: 'https://wikisource.org/',
    desc: 'A free library of source texts — treaties, speeches, constitutions and historical documents — all in the public domain or freely licensed.',
    access: 'Open',
  },
  {
    name: 'Project Gutenberg', org: 'Project Gutenberg', url: 'https://www.gutenberg.org/',
    desc: 'Over 70,000 free public-domain ebooks, including foundational historical and primary texts.',
    access: 'Open',
  },
  {
    name: 'HathiTrust Digital Library', org: 'HathiTrust', url: 'https://www.hathitrust.org/',
    desc: 'A shared digital repository of over 17 million volumes from major research libraries, with millions in the public domain.',
    access: 'Open',
  },
  {
    name: 'Perseus Digital Library', org: 'Tufts University', url: 'https://www.perseus.tufts.edu/hopper/',
    desc: 'The definitive open collection of Greek and Latin classical texts with linked translations, commentaries and lexica.',
    access: 'Open',
  },
  {
    name: 'World Digital Library', org: 'Library of Congress / UNESCO', url: 'https://www.loc.gov/collections/world-digital-library/',
    desc: 'A curated collection of primary materials from cultures worldwide, now hosted within the Library of Congress.',
    access: 'Open',
  },
];

// ── Artifact collections (mapped to Met departments for the ArtifactBrowser) ──
export const ARTIFACT_COLLECTIONS: ArtifactCollection[] = [
  { id: 'egypt', label: 'Ancient Egypt', query: 'Egypt', metDepartmentId: 10, blurb: 'Statuary, sarcophagi and treasures from the Nile.' },
  { id: 'greekroman', label: 'Greek & Roman', query: 'Greek Roman', metDepartmentId: 13, blurb: 'Sculpture, pottery and coins of the classical world.' },
  { id: 'neareast', label: 'Ancient Near East', query: 'Mesopotamia Assyria', metDepartmentId: 3, blurb: 'Reliefs, cylinder seals and cuneiform from the first cities.' },
  { id: 'africa', label: 'Africa, Oceania & the Americas', query: 'Africa Mali kingdom', metDepartmentId: 5, blurb: 'Masks, regalia and sculpture from across the global south.' },
  { id: 'asian', label: 'Asian Art', query: 'China India dynasty', metDepartmentId: 6, blurb: 'Bronzes, scrolls and ceramics of Asia’s great dynasties.' },
  { id: 'islamic', label: 'Islamic World', query: 'Islamic manuscript', metDepartmentId: 14, blurb: 'Calligraphy, tilework and metalwork of the Islamic empires.' },
  { id: 'medieval', label: 'Medieval Europe', query: 'medieval', metDepartmentId: 17, blurb: 'Reliquaries, arms and devotional art of the Middle Ages.' },
  { id: 'mesoamerica', label: 'Maya & Mesoamerica', query: 'Maya Aztec Mesoamerica', blurb: 'Jade, stelae and ritual objects of the ancient Americas.' },
];
