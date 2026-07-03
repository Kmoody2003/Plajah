/**
 * archaeologyData.ts
 * ---------------------------------------------------------------------------
 * Curated, accuracy-first data repository for the Archaeology discipline in
 * Plajah Academia — a place where people in the field discuss, share research,
 * use the tools & APIs of archaeology, and browse a huge set of freely-
 * available artifacts and data.
 *
 * Everything here is built for live Wikipedia / API enrichment: every figure
 * and site carries a real `wikiSlug` (final path segment of
 * en.wikipedia.org/wiki/<slug>). Dating methods and their ranges are checked
 * against standard references. URLs point at real, stable resources (tools,
 * open-data APIs, archives).
 * ---------------------------------------------------------------------------
 */

import type { MuseumFigure, MuseumHallDef } from '../components/MuseumHall';
import { MET_DEPARTMENTS, type ArtifactCollection } from '../services/artifactsService';

/* ===========================================================================
 * 1. ARCHAEOLOGIST HALLS  (museum wings)
 * ========================================================================= */

export const ARCHAEOLOGIST_HALLS: MuseumHallDef[] = [
  {
    id: 'pioneers',
    label: 'Pioneers',
    blurb: 'The first generation who turned treasure-hunting into a discipline — the excavators of Troy, Mycenae and the classical world.',
  },
  {
    id: 'egyptology',
    label: 'Egyptology',
    blurb: 'From the tomb of Tutankhamun to the seriation of predynastic pottery — the scholars who read the Nile.',
  },
  {
    id: 'origins',
    label: 'Prehistory & Human Origins',
    blurb: 'The hunters of deep time — palaeolithic caves, Neolithic villages, and the fossil beds where humanity began.',
  },
  {
    id: 'fieldrev',
    label: 'Field Revolutionaries',
    blurb: 'Those who invented the grid, the section, the stratigraphic method and the science of how we dig.',
  },
  {
    id: 'modern',
    label: 'Modern',
    blurb: 'The living leaders of world archaeology — heritage, science and public engagement in the present day.',
  },
];

/* ===========================================================================
 * 2. ARCHAEOLOGIST FIGURES  (the hall of greats)
 * ========================================================================= */

export const ARCHAEOLOGIST_FIGURES: MuseumFigure[] = [
  {
    id: 'winckelmann',
    name: 'Johann Joachim Winckelmann',
    wikiSlug: 'Johann_Joachim_Winckelmann',
    hall: 'pioneers',
    role: 'Art historian & antiquarian',
    era: 'Enlightenment',
    nationality: 'German',
    years: '1717–1768',
    tagline: 'Father of art history and of scientific archaeology',
    works: ['History of the Art of Antiquity (1764)', 'Studies of Pompeii & Herculaneum finds'],
    techniques: ['Stylistic chronology', 'Systematic study of classical art', 'Periodisation of ancient styles'],
  },
  {
    id: 'schliemann',
    name: 'Heinrich Schliemann',
    wikiSlug: 'Heinrich_Schliemann',
    hall: 'pioneers',
    role: 'Excavator',
    era: '19th century',
    nationality: 'German',
    years: '1822–1890',
    tagline: 'The man who dug for Homer’s Troy',
    works: ['Hisarlik (Troy)', 'Mycenae (“Mask of Agamemnon”)', 'Tiryns'],
    techniques: ['Large-scale stratigraphic trenching', 'Popularising Bronze Age archaeology'],
  },
  {
    id: 'pitt-rivers',
    name: 'Augustus Pitt Rivers',
    wikiSlug: 'Augustus_Pitt_Rivers',
    hall: 'fieldrev',
    role: 'Excavator & typologist',
    era: 'Victorian',
    nationality: 'British',
    years: '1827–1900',
    tagline: 'Father of scientific, recorded excavation',
    works: ['Cranborne Chase excavations', 'Pitt Rivers Museum, Oxford'],
    techniques: ['Total recording of ordinary finds', 'Typological sequences', 'Meticulous plans & sections'],
  },
  {
    id: 'petrie',
    name: 'Flinders Petrie',
    wikiSlug: 'Flinders_Petrie',
    hall: 'egyptology',
    role: 'Egyptologist',
    era: 'Late 19th–early 20th century',
    nationality: 'British',
    years: '1853–1942',
    tagline: 'The father of modern Egyptian archaeology',
    works: ['Naqada', 'Amarna', 'Merneptah Stele discovery (1896)', 'Methods and Aims in Archaeology (1904)'],
    techniques: ['Sequence dating (seriation)', 'Systematic recording of every potsherd', 'Precise measurement'],
  },
  {
    id: 'carter',
    name: 'Howard Carter',
    wikiSlug: 'Howard_Carter',
    hall: 'egyptology',
    role: 'Egyptologist',
    era: 'Early 20th century',
    nationality: 'British',
    years: '1874–1939',
    tagline: 'Discoverer of the tomb of Tutankhamun',
    works: ['Tomb of Tutankhamun (KV62), 1922', 'Valley of the Kings surveys'],
    techniques: ['Painstaking object-by-object clearance', 'Detailed conservation recording'],
  },
  {
    id: 'evans',
    name: 'Arthur Evans',
    wikiSlug: 'Arthur_Evans',
    hall: 'pioneers',
    role: 'Archaeologist',
    era: 'Early 20th century',
    nationality: 'British',
    years: '1851–1941',
    tagline: 'Uncoverer of the Minoan civilisation',
    works: ['Palace of Knossos, Crete', 'Scripta Minoa (Linear A & B tablets)'],
    techniques: ['Bronze Age ceramic chronology', 'Large-scale (and controversial) reconstruction'],
  },
  {
    id: 'bell',
    name: 'Gertrude Bell',
    wikiSlug: 'Gertrude_Bell',
    hall: 'pioneers',
    role: 'Archaeologist & administrator',
    era: 'Early 20th century',
    nationality: 'British',
    years: '1868–1926',
    tagline: 'Founder of the Iraq Museum',
    works: ['Surveys of Mesopotamian & Byzantine sites', 'Baghdad Archaeological Museum (1926)'],
    techniques: ['Architectural survey & photography', 'Antiquities law & heritage administration'],
  },
  {
    id: 'woolley',
    name: 'Leonard Woolley',
    wikiSlug: 'Leonard_Woolley',
    hall: 'fieldrev',
    role: 'Excavator',
    era: 'Early–mid 20th century',
    nationality: 'British',
    years: '1880–1960',
    tagline: 'Excavator of the Royal Cemetery of Ur',
    works: ['Ur (Royal Tombs)', 'Tell Atchana (Alalakh)', 'Carchemish'],
    techniques: ['Meticulous stratigraphic excavation', 'Plaster-casting of decayed objects'],
  },
  {
    id: 'garrod',
    name: 'Dorothy Garrod',
    wikiSlug: 'Dorothy_Garrod',
    hall: 'origins',
    role: 'Prehistorian',
    era: 'Early–mid 20th century',
    nationality: 'British',
    years: '1892–1968',
    tagline: 'Pioneer of Palaeolithic archaeology; first female Cambridge professor',
    works: ['Mount Carmel caves (Shanidar/Natufian sequence)', 'Devil’s Tower, Gibraltar'],
    techniques: ['Palaeolithic sequence-building', 'Defining the Natufian culture'],
  },
  {
    id: 'wheeler',
    name: 'Mortimer Wheeler',
    wikiSlug: 'Mortimer_Wheeler',
    hall: 'fieldrev',
    role: 'Excavator & methodologist',
    era: 'Mid 20th century',
    nationality: 'British',
    years: '1890–1976',
    tagline: 'Inventor of the modern grid excavation',
    works: ['Maiden Castle', 'Mohenjo-daro & Harappa surveys', 'Arikamedu'],
    techniques: ['Wheeler–Kenyon box-grid method', 'Rigorous stratigraphic control', 'Baulk recording'],
  },
  {
    id: 'kenyon',
    name: 'Kathleen Kenyon',
    wikiSlug: 'Kathleen_Kenyon',
    hall: 'fieldrev',
    role: 'Excavator',
    era: 'Mid 20th century',
    nationality: 'British',
    years: '1906–1978',
    tagline: 'Refiner of stratigraphic excavation at Jericho',
    works: ['Jericho (Tell es-Sultan)', 'Jerusalem excavations'],
    techniques: ['Wheeler–Kenyon method', 'Fine section-based stratigraphy', 'Dating the Neolithic tower of Jericho'],
  },
  {
    id: 'childe',
    name: 'V. Gordon Childe',
    wikiSlug: 'V._Gordon_Childe',
    hall: 'fieldrev',
    role: 'Prehistorian & theorist',
    era: 'Mid 20th century',
    nationality: 'Australian-British',
    years: '1892–1957',
    tagline: 'Theorist of the Neolithic and Urban Revolutions',
    works: ['The Dawn of European Civilisation', 'Man Makes Himself', 'Skara Brae excavations'],
    techniques: ['Culture-history synthesis', 'Concept of the “archaeological culture”'],
  },
  {
    id: 'louis-leakey',
    name: 'Louis Leakey',
    wikiSlug: 'Louis_Leakey',
    hall: 'origins',
    role: 'Palaeoanthropologist',
    era: 'Mid 20th century',
    nationality: 'Kenyan-British',
    years: '1903–1972',
    tagline: 'Champion of an African origin for humankind',
    works: ['Olduvai Gorge', 'Discovery of Zinjanthropus (with Mary Leakey)'],
    techniques: ['Fossil hominin survey', 'Association of stone tools with hominins'],
  },
  {
    id: 'mary-leakey',
    name: 'Mary Leakey',
    wikiSlug: 'Mary_Leakey',
    hall: 'origins',
    role: 'Palaeoanthropologist',
    era: 'Mid–late 20th century',
    nationality: 'British',
    years: '1913–1996',
    tagline: 'Discoverer of the Laetoli footprints',
    works: ['Laetoli hominin footprints (1978)', 'Zinjanthropus skull, Olduvai (1959)', 'Proconsul skull'],
    techniques: ['Rigorous excavation of fossil beds', 'Systematic lithic (Oldowan) analysis'],
  },
  {
    id: 'bingham',
    name: 'Hiram Bingham',
    wikiSlug: 'Hiram_Bingham_III',
    hall: 'pioneers',
    role: 'Explorer & academic',
    era: 'Early 20th century',
    nationality: 'American',
    years: '1875–1956',
    tagline: 'Brought Machu Picchu to world attention',
    works: ['Machu Picchu expeditions (1911–)', 'Vitcos & Vilcabamba surveys'],
    techniques: ['Exploratory survey', 'Photographic documentation of Inca sites'],
  },
  {
    id: 'thompson',
    name: 'J. Eric S. Thompson',
    wikiSlug: 'J._Eric_S._Thompson',
    hall: 'pioneers',
    role: 'Mayanist',
    era: 'Mid 20th century',
    nationality: 'British',
    years: '1898–1975',
    tagline: 'Dominant scholar of the ancient Maya',
    works: ['Maya Hieroglyphic Writing (1950)', 'Excavations across the Maya lowlands'],
    techniques: ['Maya calendrics', 'Glyph cataloguing (Thompson numbers)'],
  },
  {
    id: 'gimbutas',
    name: 'Marija Gimbutas',
    wikiSlug: 'Marija_Gimbutas',
    hall: 'origins',
    role: 'Prehistorian & archaeomythologist',
    era: 'Mid–late 20th century',
    nationality: 'Lithuanian-American',
    years: '1921–1994',
    tagline: 'Author of the Kurgan hypothesis',
    works: ['The Goddesses and Gods of Old Europe', 'Kurgan hypothesis of Indo-European origins'],
    techniques: ['Synthesis of archaeology, linguistics & mythology', 'Neolithic iconographic analysis'],
  },
  {
    id: 'binford',
    name: 'Lewis Binford',
    wikiSlug: 'Lewis_Binford',
    hall: 'fieldrev',
    role: 'Theorist',
    era: 'Late 20th century',
    nationality: 'American',
    years: '1931–2011',
    tagline: 'Founder of processual (“New”) archaeology',
    works: ['Nunamiut ethnoarchaeology', 'In Pursuit of the Past'],
    techniques: ['Middle-range theory', 'Ethnoarchaeology', 'Scientific, hypothesis-driven method'],
  },
  {
    id: 'renfrew',
    name: 'Colin Renfrew',
    wikiSlug: 'Colin_Renfrew',
    hall: 'modern',
    role: 'Theorist & prehistorian',
    era: 'Late 20th–21st century',
    nationality: 'British',
    years: 'b. 1937',
    tagline: 'Reshaper of European prehistory after radiocarbon',
    works: ['Before Civilization', 'Archaeology: Theories, Methods and Practice (with Bahn)'],
    techniques: ['Radiocarbon-calibrated chronology', 'Cognitive & social archaeology'],
  },
  {
    id: 'hodder',
    name: 'Ian Hodder',
    wikiSlug: 'Ian_Hodder',
    hall: 'modern',
    role: 'Theorist & excavator',
    era: 'Late 20th–21st century',
    nationality: 'British',
    years: 'b. 1948',
    tagline: 'Founder of post-processual archaeology; director at Çatalhöyük',
    works: ['Çatalhöyük research project', 'Reading the Past', 'Entangled'],
    techniques: ['Reflexive, contextual method', 'Interpretation at the trowel’s edge'],
  },
  {
    id: 'hawass',
    name: 'Zahi Hawass',
    wikiSlug: 'Zahi_Hawass',
    hall: 'modern',
    role: 'Egyptologist',
    era: '21st century',
    nationality: 'Egyptian',
    years: 'b. 1947',
    tagline: 'Public face of modern Egyptology',
    works: ['Valley of the Golden Mummies', 'Giza plateau projects', 'Egyptian Mummy Project (DNA/CT)'],
    techniques: ['CT scanning & DNA of mummies', 'Large-scale heritage management'],
  },
  {
    id: 'reeves',
    name: 'Nicholas Reeves',
    wikiSlug: 'Nicholas_Reeves',
    hall: 'modern',
    role: 'Egyptologist',
    era: '21st century',
    nationality: 'British',
    years: 'b. 1956',
    tagline: 'Advocate of hidden chambers in KV62',
    works: ['The Complete Tutankhamun', 'Amarna Royal Tombs Project'],
    techniques: ['High-resolution imaging of tombs', 'Radar & wall-surface analysis'],
  },
  {
    id: 'flannery',
    name: 'Kent Flannery',
    wikiSlug: 'Kent_Flannery',
    hall: 'fieldrev',
    role: 'Archaeologist',
    era: 'Late 20th–21st century',
    nationality: 'American',
    years: 'b. 1934',
    tagline: 'Pioneer of the archaeology of early farming & the state',
    works: ['Guilá Naquitz (early maize)', 'The Early Mesoamerican Village'],
    techniques: ['Flotation & archaeobotany', 'Systems theory in archaeology', 'Regional settlement survey'],
  },
  {
    id: 'ucko',
    name: 'Peter Ucko',
    wikiSlug: 'Peter_Ucko',
    hall: 'modern',
    role: 'Archaeologist',
    era: 'Late 20th century',
    nationality: 'British',
    years: '1938–2007',
    tagline: 'Reformer of world archaeology & heritage ethics',
    works: ['Founding the World Archaeological Congress', 'Palaeolithic cave-art studies'],
    techniques: ['Ethics of excavation & repatriation', 'Global, decolonised archaeology'],
  },
];

/* ===========================================================================
 * 3. ARCHAEOLOGICAL SITES  (live Wikipedia enrichment)
 * ========================================================================= */

export interface ArchSite {
  id: string;
  name: string;
  wikiSlug: string;
  region: string;
  period: string;
  blurb: string;
  highlights: string[];
}

export const ARCH_SITES: ArchSite[] = [
  {
    id: 'giza',
    name: 'Giza Pyramid Complex',
    wikiSlug: 'Giza_pyramid_complex',
    region: 'Egypt',
    period: 'Old Kingdom, c. 2560 BC',
    blurb: 'The Great Pyramid of Khufu and its neighbours — the only surviving wonder of the ancient world and the apex of Egyptian mortuary architecture.',
    highlights: ['Great Pyramid of Khufu', 'Great Sphinx', 'Khafre & Menkaure pyramids', 'Solar boat of Khufu'],
  },
  {
    id: 'pompeii',
    name: 'Pompeii',
    wikiSlug: 'Pompeii',
    region: 'Italy',
    period: 'Roman, buried AD 79',
    blurb: 'A whole Roman city sealed by the eruption of Vesuvius — the richest snapshot of everyday ancient life ever excavated.',
    highlights: ['Body casts of victims', 'Villa of the Mysteries frescoes', 'Forum & amphitheatre', 'Preserved street plan'],
  },
  {
    id: 'troy',
    name: 'Troy (Hisarlik)',
    wikiSlug: 'Troy',
    region: 'Turkey',
    period: 'Bronze Age–Roman',
    blurb: 'The multi-layered mound Schliemann identified as Homer’s Troy — nine superimposed cities spanning three millennia.',
    highlights: ['Nine stratified settlements (Troy I–IX)', '“Priam’s Treasure”', 'Bronze Age fortification walls'],
  },
  {
    id: 'knossos',
    name: 'Knossos',
    wikiSlug: 'Knossos',
    region: 'Crete, Greece',
    period: 'Bronze Age Minoan',
    blurb: 'The largest Bronze Age palace of Crete and the heart of Minoan civilisation, excavated (and reconstructed) by Arthur Evans.',
    highlights: ['Palace complex & “labyrinth” plan', 'Bull-leaping frescoes', 'Linear A & B tablets', 'Throne Room'],
  },
  {
    id: 'gobekli',
    name: 'Göbekli Tepe',
    wikiSlug: 'Göbekli_Tepe',
    region: 'Turkey',
    period: 'Pre-Pottery Neolithic, c. 9500 BC',
    blurb: 'The oldest known monumental sanctuary — carved T-shaped pillars raised by hunter-gatherers before farming or pottery.',
    highlights: ['Megalithic T-pillars', 'Carved animal reliefs', 'Circular enclosures', 'Rewrites the timeline of monumental building'],
  },
  {
    id: 'catalhoyuk',
    name: 'Çatalhöyük',
    wikiSlug: 'Çatalhöyük',
    region: 'Turkey',
    period: 'Neolithic, c. 7100–5700 BC',
    blurb: 'A vast Neolithic proto-city of densely packed mudbrick houses entered through the roof — a landmark in the study of early settled life.',
    highlights: ['Rooftop-access houses', 'Wall paintings & plastered skulls', 'No streets — an “aggregate” town', 'Ian Hodder’s reflexive excavation'],
  },
  {
    id: 'stonehenge',
    name: 'Stonehenge',
    wikiSlug: 'Stonehenge',
    region: 'England, UK',
    period: 'Neolithic–Bronze Age, c. 3000–2000 BC',
    blurb: 'The most famous prehistoric monument in the world — a ring of standing sarsens and bluestones aligned on the solstices.',
    highlights: ['Sarsen trilithons', 'Welsh bluestones transported ~200 km', 'Solstice alignment', 'Surrounding ritual landscape'],
  },
  {
    id: 'mohenjodaro',
    name: 'Mohenjo-daro',
    wikiSlug: 'Mohenjo-daro',
    region: 'Pakistan',
    period: 'Indus Valley, c. 2500 BC',
    blurb: 'One of the great cities of the Indus Valley Civilisation — meticulously planned with a grid of streets and advanced sanitation.',
    highlights: ['Grid street plan', 'Great Bath', 'Sophisticated drainage', 'Undeciphered Indus script'],
  },
  {
    id: 'machupicchu',
    name: 'Machu Picchu',
    wikiSlug: 'Machu_Picchu',
    region: 'Peru',
    period: 'Inca, c. 1450 AD',
    blurb: 'A 15th-century Inca royal estate on an Andean ridge — a masterpiece of dry-stone architecture and terraced landscape.',
    highlights: ['Ashlar dry-stone masonry', 'Intihuatana stone', 'Agricultural terraces', 'Brought to attention by Hiram Bingham'],
  },
  {
    id: 'chichenitza',
    name: 'Chichén Itzá',
    wikiSlug: 'Chichen_Itza',
    region: 'Mexico',
    period: 'Maya, c. 600–1200 AD',
    blurb: 'A major Maya-Toltec city dominated by the stepped pyramid of El Castillo, whose stairways encode the solar year.',
    highlights: ['El Castillo (Temple of Kukulcán)', 'Great Ball Court', 'Equinox serpent-shadow', 'Sacred Cenote'],
  },
  {
    id: 'teotihuacan',
    name: 'Teotihuacan',
    wikiSlug: 'Teotihuacan',
    region: 'Mexico',
    period: 'c. 100 BC–550 AD',
    blurb: 'The largest city of the pre-Columbian Americas, laid out on a monumental axis around the Pyramids of the Sun and Moon.',
    highlights: ['Pyramid of the Sun', 'Avenue of the Dead', 'Temple of the Feathered Serpent', 'Apartment compounds'],
  },
  {
    id: 'petra',
    name: 'Petra',
    wikiSlug: 'Petra',
    region: 'Jordan',
    period: 'Nabataean, c. 300 BC–AD 100',
    blurb: 'The rose-red capital of the Nabataeans, its temples and tombs carved directly into sandstone cliffs.',
    highlights: ['Al-Khazneh (the Treasury)', 'Rock-cut tomb facades', 'Water-management channels', 'The Siq approach'],
  },
  {
    id: 'angkor',
    name: 'Angkor Wat',
    wikiSlug: 'Angkor_Wat',
    region: 'Cambodia',
    period: 'Khmer, early 12th century',
    blurb: 'The largest religious monument on Earth — the temple-mountain of the Khmer Empire, revealed in its full extent by LiDAR survey.',
    highlights: ['Five-towered temple-mountain', 'Bas-relief galleries', 'Moat & causeway', 'LiDAR-mapped urban sprawl'],
  },
  {
    id: 'greatzimbabwe',
    name: 'Great Zimbabwe',
    wikiSlug: 'Great_Zimbabwe',
    region: 'Zimbabwe',
    period: 'c. 1100–1450 AD',
    blurb: 'The stone capital of a powerful Shona kingdom — its mortarless granite walls are the largest ancient structures in sub-Saharan Africa.',
    highlights: ['Great Enclosure & Conical Tower', 'Dry-stone granite walls', 'Zimbabwe Bird soapstone carvings', 'Indian Ocean trade links'],
  },
  {
    id: 'terracotta',
    name: 'Terracotta Army (Xi’an)',
    wikiSlug: 'Terracotta_Army',
    region: 'China',
    period: 'Qin, c. 210 BC',
    blurb: 'The buried guard of China’s first emperor — thousands of individually modelled clay soldiers in the mausoleum of Qin Shi Huang.',
    highlights: ['~8,000 life-size figures', 'No two faces alike', 'Bronze weapons & chariots', 'Unexcavated imperial tomb mound'],
  },
  {
    id: 'olduvai',
    name: 'Olduvai Gorge',
    wikiSlug: 'Olduvai_Gorge',
    region: 'Tanzania',
    period: 'Palaeolithic, c. 1.9 Ma–present',
    blurb: 'A ravine in the East African Rift whose exposed strata document nearly two million years of human evolution and the earliest stone tools.',
    highlights: ['Oldowan stone tools', 'Zinjanthropus (Paranthropus) skull', 'Homo habilis remains', 'Leakey family excavations'],
  },
];

/* ===========================================================================
 * 4. DATING METHODS  (accurate ranges & applications)
 * ========================================================================= */

export interface DatingMethod {
  id: string;
  name: string;
  range: string;
  basis: string;
  useFor: string;
}

export const DATING_METHODS: DatingMethod[] = [
  {
    id: 'c14',
    name: 'Radiocarbon (¹⁴C)',
    range: '~ 300 – 55,000 years BP',
    basis: 'Decay of ¹⁴C (half-life ~5,730 yr) in once-living tissue; AMS measures the residual isotope ratio.',
    useFor: 'Charcoal, wood, bone, shell, seeds, textiles — any organic material.',
  },
  {
    id: 'dendro',
    name: 'Dendrochronology',
    range: 'Present back to ~ 12,000 years (regional master chronologies)',
    basis: 'Matching the pattern of annual tree-ring widths to a dated master sequence.',
    useFor: 'Timbers & wooden objects; also calibrates radiocarbon dates.',
  },
  {
    id: 'tl',
    name: 'Thermoluminescence (TL)',
    range: '~ 300 – 500,000 years',
    basis: 'Trapped electrons released as light when a heated sample is re-fired; measures dose since last firing.',
    useFor: 'Fired ceramics, burnt flint, heated stones.',
  },
  {
    id: 'kar',
    name: 'Potassium–Argon (K–Ar / ⁴⁰Ar–³⁹Ar)',
    range: '~ 100,000 years – billions of years',
    basis: 'Decay of ⁴⁰K to ⁴⁰Ar accumulating in volcanic minerals since they crystallised.',
    useFor: 'Volcanic ash & lava bracketing hominin fossils (e.g. Olduvai).',
  },
  {
    id: 'useries',
    name: 'Uranium-series (U–Th)',
    range: '~ 1,000 – 500,000 years',
    basis: 'Radioactive decay of uranium isotopes into daughter products in carbonate minerals.',
    useFor: 'Cave calcite, speleothems, coral, teeth — dating cave art & fossils.',
  },
  {
    id: 'osl',
    name: 'Optically Stimulated Luminescence (OSL)',
    range: '~ 100 – 300,000 years',
    basis: 'Light (not heat) releases trapped electrons; measures time since sediment grains last saw sunlight.',
    useFor: 'Buried sand & sediment — dating burial of tools and features.',
  },
  {
    id: 'obsidian',
    name: 'Obsidian hydration',
    range: '~ 500 – ~ 200,000 years (site-calibrated)',
    basis: 'Water slowly diffuses into a freshly exposed obsidian surface, forming a measurable hydration rim.',
    useFor: 'Obsidian tools & flakes; best used with local calibration.',
  },
  {
    id: 'stratigraphy',
    name: 'Stratigraphy (relative)',
    range: 'Relative only — no absolute age',
    basis: 'Law of superposition: lower deposits are older than those above them.',
    useFor: 'Establishing the sequence of layers, features and finds on any site.',
  },
  {
    id: 'seriation',
    name: 'Seriation',
    range: 'Relative only — orders assemblages in time',
    basis: 'Artefact styles rise and fall in popularity; frequency (or occurrence) curves order the assemblages.',
    useFor: 'Ordering graves, ceramics and typologies where no absolute date exists.',
  },
  {
    id: 'aar',
    name: 'Amino-acid racemization',
    range: '~ 1,000 – ~ 1,000,000+ years',
    basis: 'L-form amino acids slowly convert to D-form after death; the ratio tracks elapsed time (temperature-sensitive).',
    useFor: 'Shell, bone, eggshell and teeth — useful beyond the radiocarbon limit.',
  },
];

/* ===========================================================================
 * 5. FIELD METHODS
 * ========================================================================= */

export interface FieldMethod {
  id: string;
  name: string;
  desc: string;
}

export const FIELD_METHODS: FieldMethod[] = [
  {
    id: 'survey',
    name: 'Survey & fieldwalking',
    desc: 'Systematically walking, mapping and recording surface finds and features to locate sites and understand a landscape before (or instead of) digging.',
  },
  {
    id: 'excavation',
    name: 'Excavation & the Harris Matrix',
    desc: 'Controlled removal of deposits in reverse of their formation, recording every context; the Harris Matrix diagrams their stratigraphic relationships.',
  },
  {
    id: 'strat',
    name: 'Stratigraphy',
    desc: 'Reading the sequence and relationships of layers (contexts) to reconstruct the order of events on a site — the backbone of relative dating.',
  },
  {
    id: 'remote',
    name: 'Remote sensing',
    desc: 'Non-invasive prospection — LiDAR (canopy-penetrating laser), ground-penetrating radar (GPR), magnetometry, resistivity and satellite/aerial imagery — to map buried features.',
  },
  {
    id: 'photogrammetry',
    name: 'Photogrammetry & 3D recording',
    desc: 'Building accurate 3D models and orthophotos of trenches, features and artefacts from overlapping photographs, preserving each phase of a dig.',
  },
  {
    id: 'flotation',
    name: 'Flotation & archaeobotany',
    desc: 'Washing soil through fine mesh so charred seeds and plant remains float free — recovering the evidence of diet, agriculture and environment.',
  },
  {
    id: 'osteology',
    name: 'Osteology & bioarchaeology',
    desc: 'Study of human and animal bone to reconstruct age, sex, health, diet, pathology and mobility of past populations.',
  },
  {
    id: 'gis',
    name: 'GIS & spatial analysis',
    desc: 'Geographic Information Systems integrate excavation, survey and remote-sensing data to analyse distributions, viewsheds and site catchments.',
  },
];

/* ===========================================================================
 * 6. TOOLS  (open-source flagged)
 * ========================================================================= */

export interface ArchTool {
  name: string;
  category: string;
  oss: boolean;
  url: string;
  desc: string;
}

export const ARCH_TOOLS: ArchTool[] = [
  {
    name: 'QGIS',
    category: 'GIS & mapping',
    oss: true,
    url: 'https://qgis.org/',
    desc: 'The leading free, open-source desktop GIS — the standard tool for archaeological mapping, spatial analysis and survey.',
  },
  {
    name: 'GRASS GIS',
    category: 'GIS & mapping',
    oss: true,
    url: 'https://grass.osgeo.org/',
    desc: 'Powerful open-source GIS for raster/vector geoprocessing, viewshed and terrain analysis of landscapes.',
  },
  {
    name: 'Open Context',
    category: 'Data publishing',
    oss: true,
    url: 'https://opencontext.org/',
    desc: 'Free, open publishing of primary archaeological field data with a queryable API and stable citations.',
  },
  {
    name: 'tDAR',
    category: 'Data archiving',
    oss: false,
    url: 'https://www.tdar.org/',
    desc: 'The Digital Archaeological Record — a curated repository for preserving and discovering archaeological datasets and reports.',
  },
  {
    name: 'ARIADNE Portal',
    category: 'Data discovery',
    oss: false,
    url: 'https://portal.ariadne-infrastructure.eu/',
    desc: 'A European research infrastructure aggregating and cross-searching archaeological datasets from across the continent.',
  },
  {
    name: 'OxCal',
    category: 'Radiocarbon calibration',
    oss: false,
    url: 'https://c14.arch.ox.ac.uk/oxcal.html',
    desc: 'The de-facto tool for calibrating radiocarbon dates and running Bayesian chronological models (free web & desktop).',
  },
  {
    name: 'CALIB',
    category: 'Radiocarbon calibration',
    oss: false,
    url: 'http://calib.org/calib/',
    desc: 'Long-established free radiocarbon calibration program using the IntCal curves.',
  },
  {
    name: 'Meshroom',
    category: 'Photogrammetry',
    oss: true,
    url: 'https://alicevision.org/#meshroom',
    desc: 'Free, open-source photogrammetry (AliceVision) that builds textured 3D models of artefacts and trenches from photos.',
  },
  {
    name: 'Agisoft Metashape',
    category: 'Photogrammetry',
    oss: false,
    url: 'https://www.agisoft.com/',
    desc: 'Industry-standard proprietary photogrammetry for high-quality 3D reconstruction and orthophotos.',
  },
  {
    name: 'ArchaeoCORE / Archey',
    category: 'Recording',
    oss: true,
    url: 'https://github.com/archaeology',
    desc: 'Open-source field recording and context-database projects for digital excavation records.',
  },
  {
    name: 'Harris Matrix Composer',
    category: 'Stratigraphy',
    oss: false,
    url: 'https://www.harrismatrixcomposer.com/',
    desc: 'Software for building and validating Harris Matrices to visualise stratigraphic sequences.',
  },
  {
    name: 'Recogito',
    category: 'Annotation',
    oss: true,
    url: 'https://recogito.pelagios.org/',
    desc: 'Open annotation tool (Pelagios) for tagging places, people and things in texts, maps and images.',
  },
  {
    name: 'Pleiades',
    category: 'Gazetteer',
    oss: true,
    url: 'https://pleiades.stoa.org/',
    desc: 'Community-built open gazetteer of ancient places, giving every site a stable URI and coordinates.',
  },
  {
    name: 'Perseus Digital Library',
    category: 'Texts',
    oss: true,
    url: 'https://www.perseus.tufts.edu/',
    desc: 'Free digital library of classical texts, lexica and art & archaeology references, openly licensed.',
  },
];

/* ===========================================================================
 * 7. DATA APIs  (real, mostly keyless)
 * ========================================================================= */

export interface ArchApi {
  name: string;
  url: string;
  desc: string;
  auth: 'None' | 'Free key' | 'OAuth' | 'Paid';
}

export const ARCH_DATA_APIS: ArchApi[] = [
  {
    name: 'Open Context API',
    url: 'https://opencontext.org/about/services',
    desc: 'Query and download primary archaeological field data as JSON/GeoJSON, with faceted search across excavations.',
    auth: 'None',
  },
  {
    name: 'Portable Antiquities Scheme (finds.org.uk)',
    url: 'https://finds.org.uk/database/api',
    desc: 'Over a million small finds recorded by the public in England & Wales, available as JSON/GeoJSON.',
    auth: 'None',
  },
  {
    name: 'Pleiades',
    url: 'https://pleiades.stoa.org/help/pleiades-json-api',
    desc: 'Open gazetteer of ancient places — names, locations and connections downloadable as JSON and CSV.',
    auth: 'None',
  },
  {
    name: 'Nomisma.org',
    url: 'https://nomisma.org/',
    desc: 'Linked-open-data for numismatics — stable IDs and SPARQL for ancient coins, mints and hoards.',
    auth: 'None',
  },
  {
    name: 'iDAI.world / Arachne',
    url: 'https://arachne.dainst.org/',
    desc: 'The German Archaeological Institute’s object database of classical antiquities, images and 3D, with an API.',
    auth: 'None',
  },
  {
    name: 'ARIADNE Portal API',
    url: 'https://portal.ariadne-infrastructure.eu/',
    desc: 'Programmatic cross-search of aggregated European archaeological datasets and metadata.',
    auth: 'Free key',
  },
  {
    name: 'The Met Open Access API',
    url: 'https://metmuseum.github.io/',
    desc: 'Keyless REST API for hundreds of thousands of Met objects, including antiquities departments, many CC0.',
    auth: 'None',
  },
  {
    name: 'Smithsonian Open Access API',
    url: 'https://www.si.edu/openaccess/devtools',
    desc: 'Millions of CC0 records and media across the Smithsonian, including archaeology & anthropology; 3D models too.',
    auth: 'Free key',
  },
  {
    name: 'OxCal web services',
    url: 'https://c14.arch.ox.ac.uk/oxcalhelp/hlp_analysis_web.html',
    desc: 'Programmatic radiocarbon calibration and Bayesian modelling via OxCal’s scriptable interface.',
    auth: 'None',
  },
  {
    name: 'Wikidata / SPARQL',
    url: 'https://query.wikidata.org/',
    desc: 'Query archaeological sites, cultures, artefacts and people as linked open data via the public SPARQL endpoint.',
    auth: 'None',
  },
];

/* ===========================================================================
 * 8. BOOKS  (free/public-domain flagged where genuinely free)
 * ========================================================================= */

export interface ArchBook {
  id: string;
  title: string;
  authors: string[];
  year?: string;
  free: boolean;
  url: string;
  desc: string;
}

export const ARCH_BOOKS: ArchBook[] = [
  {
    id: 'petrie-methods',
    title: 'Methods and Aims in Archaeology',
    authors: ['W. M. Flinders Petrie'],
    year: '1904',
    free: true,
    url: 'https://archive.org/details/methodsaimsinarc00petruoft',
    desc: 'Petrie’s classic manifesto on excavation, recording and the ethics of digging — public domain on the Internet Archive.',
  },
  {
    id: 'schliemann-ilios',
    title: 'Ilios: The City and Country of the Trojans',
    authors: ['Heinrich Schliemann'],
    year: '1880',
    free: true,
    url: 'https://archive.org/details/ilioscitycountry00schluoft',
    desc: 'Schliemann’s own account of the excavation of Troy, richly illustrated — public domain.',
  },
  {
    id: 'carter-tut',
    title: 'The Tomb of Tut-Ankh-Amen',
    authors: ['Howard Carter', 'A. C. Mace'],
    year: '1923',
    free: true,
    url: 'https://archive.org/details/tomboftutankhame01cart',
    desc: 'Carter’s day-by-day narrative of the discovery and clearance of KV62 — public domain.',
  },
  {
    id: 'lubbock-prehistoric',
    title: 'Pre-historic Times',
    authors: ['John Lubbock'],
    year: '1865',
    free: true,
    url: 'https://archive.org/details/prehistorictimes00lubb',
    desc: 'The book that coined “Palaeolithic” and “Neolithic” and founded prehistoric archaeology — public domain.',
  },
  {
    id: 'wheeler-earth',
    title: 'Archaeology from the Earth',
    authors: ['Mortimer Wheeler'],
    year: '1954',
    free: false,
    url: 'https://global.oup.com/',
    desc: 'The enduring statement of stratigraphic excavation method by the inventor of the modern grid dig.',
  },
  {
    id: 'renfrew-bahn',
    title: 'Archaeology: Theories, Methods and Practice',
    authors: ['Colin Renfrew', 'Paul Bahn'],
    year: '2020 (8th ed.)',
    free: false,
    url: 'https://www.thamesandhudson.com/',
    desc: 'The standard university textbook covering the full sweep of archaeological theory, method and science.',
  },
  {
    id: 'harris-strat',
    title: 'Principles of Archaeological Stratigraphy',
    authors: ['Edward C. Harris'],
    year: '1989 (2nd ed.)',
    free: true,
    url: 'https://www.harrismatrix.com/',
    desc: 'The book that defined the Harris Matrix — made freely available as a PDF by the author.',
  },
  {
    id: 'trigger-history',
    title: 'A History of Archaeological Thought',
    authors: ['Bruce G. Trigger'],
    year: '2006 (2nd ed.)',
    free: false,
    url: 'https://www.cambridge.org/',
    desc: 'The definitive intellectual history of the discipline, from antiquarianism to post-processual theory.',
  },
];

/* ===========================================================================
 * 9. ARTIFACT COLLECTIONS  (drive the live ArtifactBrowser centrepiece)
 * ========================================================================= */

export const ARTIFACT_COLLECTIONS: ArtifactCollection[] = [
  {
    id: 'egyptian',
    label: 'Ancient Egypt',
    query: 'Egyptian',
    metDepartmentId: MET_DEPARTMENTS.egyptian,
    blurb: 'Amulets, sarcophagi, reliefs and everyday objects from the Nile — live from The Met’s Egyptian department.',
  },
  {
    id: 'greekroman',
    label: 'Greek & Roman',
    query: 'vase',
    metDepartmentId: MET_DEPARTMENTS.greekRoman,
    blurb: 'Classical sculpture, painted vases, bronzes and glass from the Mediterranean world.',
  },
  {
    id: 'neareast',
    label: 'Ancient Near East',
    query: 'Mesopotamia',
    metDepartmentId: MET_DEPARTMENTS.ancientNearEast,
    blurb: 'Cylinder seals, cuneiform, and the art of Sumer, Assyria and Babylon.',
  },
  {
    id: 'mesoamerica',
    label: 'Mesoamerica',
    query: 'Maya Aztec',
    metDepartmentId: MET_DEPARTMENTS.artsOfAfricaOceaniaAmericas,
    blurb: 'Maya, Aztec and Olmec sculpture, jade and ceramics from the ancient Americas.',
  },
  {
    id: 'bronze',
    label: 'Bronze & Metalwork',
    query: 'bronze',
    blurb: 'Cast and hammered metalwork across cultures — tools, weapons, figurines and vessels.',
  },
  {
    id: 'ceramics',
    label: 'Ceramics & Pottery',
    query: 'pottery vessel',
    blurb: 'The most abundant find on any dig — painted, incised and glazed vessels across millennia.',
  },
  {
    id: 'africa-oceania',
    label: 'Africa, Oceania & the Americas',
    query: 'sculpture',
    metDepartmentId: MET_DEPARTMENTS.artsOfAfricaOceaniaAmericas,
    blurb: 'Sculpture, masks and material culture from Africa, Oceania and the indigenous Americas.',
  },
  {
    id: 'asian',
    label: 'Asian Antiquities',
    query: 'ancient',
    metDepartmentId: MET_DEPARTMENTS.asian,
    blurb: 'Bronzes, jades and ceramics from ancient China, South and Southeast Asia — includes Open Context field records.',
  },
];
