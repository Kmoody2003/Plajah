/**
 * lab-archaeology - "Archaeology" course for the Learn map.
 * Authored from data/archaeologyData.ts (pioneers, field methods, dating methods, sites) so the Learn map and the studio agree.
 */
import type { CourseModule } from '../courseModule';
import type { Question } from '../types';

type QD = [1 | 2 | 3, string, string, string[], number, string, string];

const mk = (lessonId: string, qs: QD[]): Question[] =>
  qs.map((x, i) => {
    const choices = [...x[3]];
    choices.splice(x[4], 0, x[2]);
    return {
      id: `${lessonId}.q${i + 1}`,
      lessonId,
      kind: 'mcq' as const,
      prompt: x[1],
      choices,
      answer: x[4],
      hint: x[5],
      explanation: x[6],
      level: x[0],
    };
  });

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'lab-archaeology',
    label: 'Archaeology',
    blurb: 'How we learn about the human past from what people left behind: the pioneers, the methods, the dating science and the great sites.',
    accent: '#D4A017',
    framework: 'c3',
    tracks: [
      {
        id: 'lab-archaeology.t1',
        title: 'Founders of the Discipline',
        blurb: 'From treasure-hunting to careful, recorded excavation.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: 'lab-archaeology.l01',
            title: 'Winckelmann, Schliemann and the Search for Troy',
            blurb: 'Two pioneers who made the ancient world a subject of study.',
            minutes: 7,
            body: `Johann Joachim Winckelmann, who lived from 1717 to 1768, is called the father of art history and of scientific archaeology. In his History of the Art of Antiquity, published in 1764, he arranged ancient art into periods by style. He also studied finds from Pompeii and Herculaneum. His idea of a stylistic chronology meant that objects could be placed in order by comparing their style, even without written dates.

Heinrich Schliemann, who lived from 1822 to 1890, was a German businessman turned excavator who set out to find the Troy of Homer. He dug at Hisarlik in Turkey, and also at Mycenae and Tiryns, and he did much to make Bronze Age archaeology famous around the world. His account of the work appeared in Ilios in 1880.

Hisarlik turned out to hold nine stratified settlements, labelled Troy I to IX and spanning about three thousand years, with later periods built on top of earlier ones. Schliemann used large-scale trenching, and modern archaeologists note that his rapid digging damaged some layers.

Why it mattered: these two men showed that the ancient past could be studied systematically, while Schliemann's mistakes taught later generations to dig with more care.`,
          },
          {
            id: 'lab-archaeology.l02',
            title: 'Pitt Rivers and Petrie: Recording Everything',
            blurb: 'Why ordinary pottery sherds became as important as gold.',
            minutes: 7,
            body: `Augustus Pitt Rivers, who lived from 1827 to 1900, is called the father of scientific, recorded excavation. Digging at Cranborne Chase in England, he insisted on total recording of ordinary finds, not just spectacular ones, and produced meticulous plans and sections, which are scale drawings of the site from above and from the side. He also arranged objects in typological sequences, ordering them by form, and his collection forms the Pitt Rivers Museum in Oxford.

Flinders Petrie, who lived from 1853 to 1942, is called the father of modern Egyptian archaeology. He worked at Naqada and Amarna, and in 1896 he discovered the Merneptah Stele. He recorded every potsherd and measured precisely. Most importantly, he developed sequence dating, also called seriation, which orders groups of finds by the way styles rise and fall in popularity. His 1904 book Methods and Aims in Archaeology explains his principles.

The lesson is that common objects carry the most information. A single gold mask tells a story, but thousands of pottery fragments, each in a known place, can date a whole site.

Why it mattered: recording everything in context is the foundation of modern fieldwork.`,
          },
          {
            id: 'lab-archaeology.l03',
            title: 'Tutankhamun and Knossos',
            blurb: 'Two famous discoveries and the debates they left behind.',
            minutes: 7,
            body: `In 1922, Howard Carter, who lived from 1874 to 1939, discovered the tomb of Tutankhamun, known as KV62, in the Valley of the Kings. Carter had surveyed the valley for years. Rather than grab the treasures, his team cleared the tomb object by object, with detailed conservation recording, a process that took many seasons. Carter and A. C. Mace published a narrative of the discovery in 1923.

Arthur Evans, who lived from 1851 to 1941, uncovered the Palace of Knossos on Crete, the largest Bronze Age palace on the island and the heart of Minoan civilisation. He studied the Linear A and Linear B tablets and built a ceramic chronology for the Bronze Age. He also undertook large-scale reconstructions of the palace, which remain controversial. Critics argue that rebuilding parts in concrete mixed his own interpretation with the ancient remains, while supporters say it helps visitors imagine the palace.

Both stories raise a question that archaeologists still debate: how can discoveries be shared with the public while protecting the evidence?

Why it mattered: patient recording in a tomb and bold reconstruction in a palace show two very different ways to present the past.`,
          },
        ],
      },
      {
        id: 'lab-archaeology.t2',
        title: 'Digging and Recording',
        blurb: 'How modern fieldwork is controlled, measured and analysed.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: 'lab-archaeology.l04',
            title: 'Stratigraphy and the Harris Matrix',
            blurb: 'Reading the layers of a site like pages in a book.',
            minutes: 7,
            body: `Stratigraphy is the study of the order of layers, or contexts, on a site. It rests on the law of superposition: in undisturbed ground, lower deposits are older than those above them. By working out the sequence of layers, archaeologists can build the order of events on a site, which is the backbone of relative dating.

Excavation is therefore a controlled removal of deposits in the reverse of the order in which they formed, with every context recorded. The most recent layer comes off first, and the oldest last.

Real sites are messy. Pits are dug through older layers, walls are built and demolished, and floors are repaired. To keep track, archaeologists use the Harris Matrix, a diagram that shows how every context relates to the others in time. Edward C. Harris defined the method in Principles of Archaeological Stratigraphy, whose second edition appeared in 1989.

Stratigraphy gives only a relative age. It can tell you that layer C is older than layer B, but not how many years ago either was formed. For a number of years you need another method, such as radiocarbon.

Why it mattered: stratigraphy turned digging from collecting into reasoning about time.`,
          },
          {
            id: 'lab-archaeology.l05',
            title: 'Wheeler, Kenyon and the Grid',
            blurb: 'A system that kept excavations under control.',
            minutes: 7,
            body: `Mortimer Wheeler, who lived from 1890 to 1976, is called the inventor of the modern grid excavation. He worked at Maiden Castle in England, at Arikamedu, and at the great Indus cities of Mohenjo-daro and Harappa, and his book Archaeology from the Earth, published in 1954, became the classic statement of stratigraphic method.

Wheeler's approach divided the site into squares separated by walls of unexcavated earth, called baulks. The baulks preserve vertical sections in which the layers can be read and recorded, while the squares allow precise control of where every find lies.

Kathleen Kenyon, who lived from 1906 to 1978, refined this system at Jericho, also called Tell es-Sultan, and in Jerusalem. Her fine section-based stratigraphy gave the combined technique its name, the Wheeler-Kenyon method. At Jericho she worked on dating the Neolithic tower.

The method has since been modified, and many modern teams prefer open-area excavation recorded digitally. But the idea of rigorous stratigraphic control is still central.

Why it mattered: the grid method made excavations comparable and checkable by other archaeologists, which is essential for any science.`,
          },
          {
            id: 'lab-archaeology.l06',
            title: 'Survey and Remote Sensing',
            blurb: 'Finding and mapping sites without digging.',
            minutes: 7,
            body: `Digging destroys what it studies, so archaeologists often try to learn first without breaking the ground. The simplest method is survey and fieldwalking: walking a landscape in a planned pattern, mapping and recording surface finds and features to locate sites.

Remote sensing goes further. LiDAR uses laser pulses from the air and can see through the canopy of a forest to reveal the shape of the ground. Ground-penetrating radar, or GPR, sends signals into the soil and records the echoes from buried walls and floors. Magnetometry and resistivity measure small differences in the ground's magnetism and electrical resistance, while satellite and aerial imagery show patterns from above.

A famous example is Angkor in Cambodia. LiDAR survey revealed that the temple city of Angkor Wat, the largest religious monument on Earth, sat inside a much wider urban sprawl.

The data from surveys are often combined in a geographic information system, or GIS, such as the open-source QGIS, so that locations and patterns can be analysed together.

Why it mattered: non-invasive methods protect sites, save money, and let teams target limited digging where it will teach the most.`,
          },
          {
            id: 'lab-archaeology.l07',
            title: 'Science in the Lab',
            blurb: 'Seeds, bones, photographs and maps tell the rest of the story.',
            minutes: 7,
            body: `Much of what archaeologists learn comes from small, easily missed things. In flotation, soil is washed through fine mesh so that charred seeds and plant remains float free. Archaeobotany studies these remains to reconstruct diet, farming and environment. Kent Flannery used such methods at Guila Naquitz in Mexico to study early maize.

Osteology and bioarchaeology study human and animal bone. They can reconstruct age, sex, health, diet, disease and even how far people moved during their lives.

Photogrammetry builds accurate three-dimensional models and orthophotos from overlapping photographs, using software such as the open-source Meshroom or the commercial Agisoft Metashape. Because excavation is destructive, such models preserve each phase of a dig after the soil has been removed.

Finally, GIS integrates survey and excavation data so that distributions, viewsheds and site catchments can be analysed.

None of these methods works alone. The charred seeds make sense only when the layer they came from is known, and the bones only when the burial context is recorded.

Why it mattered: the lab turns objects into evidence about ordinary lives, which a pile of treasure never could.`,
          },
        ],
      },
      {
        id: 'lab-archaeology.t3',
        title: 'Telling Time',
        blurb: 'How archaeologists put numbers on the past.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: 'lab-archaeology.l08',
            title: 'Radiocarbon and Tree Rings',
            blurb: 'The two best-known clocks for recent millennia.',
            minutes: 7,
            body: `Radiocarbon dating measures the decay of carbon-14 in once-living tissue. Carbon-14 has a half-life of about 5,730 years, and a laboratory technique called AMS measures the small amount of the isotope that remains. The method works on organic materials such as charcoal, wood, bone, shell, seeds and textiles, and it reaches from about 300 to about 55,000 years before the present.

Dendrochronology dates wood by matching the pattern of annual tree-ring widths to a dated master sequence. Where regional master chronologies exist, they reach back about 12,000 years. Because each ring is a single year, tree-ring dates can be extremely precise, and they are also used to calibrate radiocarbon dates.

Calibration matters because the amount of carbon-14 in the atmosphere has varied. Software such as OxCal and CALIB converts raw radiocarbon results into calendar ages using standard curves. Colin Renfrew, born in 1937, argued that radiocarbon with calibration reshaped European prehistory.

Results are given as a range, not a single year, because every measurement carries uncertainty.

Why it mattered: absolute dating allowed archaeologists to compare sites across continents on a single time scale.`,
          },
          {
            id: 'lab-archaeology.l09',
            title: 'Beyond Radiocarbon',
            blurb: 'Clocks for ceramics, sediments, caves and deep time.',
            minutes: 7,
            body: `Radiocarbon cannot date everything. Archaeologists therefore use a toolkit, choosing a method that suits the material and the age.

Thermoluminescence, or TL, dates fired ceramics, burnt flint and heated stones, from about 300 to 500,000 years, by measuring trapped electrons released as light when the sample is reheated. Optically stimulated luminescence, or OSL, uses light instead of heat and dates the time since sediment grains last saw sunlight, which makes it useful for buried sand and for the burial of tools and features.

Uranium-series dating, over about 1,000 to 500,000 years, uses decay in carbonate minerals, such as cave calcite, coral and teeth. It has been used to date cave art. Potassium-argon dating, effective from about 100,000 years to billions, measures decay in volcanic minerals and is used on volcanic ash and lava that bracket fossils, for example at Olduvai.

Other methods include obsidian hydration, which measures a water-diffusion rim on obsidian, and amino-acid racemization, which tracks the slow change in amino acids in shell, bone and teeth.

Why it mattered: using several independent methods on the same site makes dates far more trustworthy.`,
          },
        ],
      },
      {
        id: 'lab-archaeology.t4',
        title: 'Sites and Stories',
        blurb: 'Great places and the ideas they changed.',
        level: 'ADVANCED',
        lessons: [
          {
            id: 'lab-archaeology.l10',
            title: 'Human Origins at Olduvai and Laetoli',
            blurb: 'Fossils, footprints and the African story of humankind.',
            minutes: 7,
            body: `Olduvai Gorge in Tanzania is a ravine in the East African Rift whose exposed strata record nearly two million years of human evolution. It is the home of the earliest stone tools, the Oldowan industry, and of fossil remains including Zinjanthropus, now classified as Paranthropus, and Homo habilis.

Louis Leakey, who lived from 1903 to 1972, championed the idea that humankind began in Africa. His wife, Mary Leakey, who lived from 1913 to 1996, found the Zinjanthropus skull at Olduvai in 1959 and, in 1978, the hominin footprints at Laetoli, which show upright walking. She excavated fossil beds with great rigour and analysed the Oldowan stone tools in detail.

Dating played a key part. Layers of volcanic ash above and below the fossils could be dated with potassium-argon methods, so that the fossils were bracketed between known ages.

Dorothy Garrod, who lived from 1892 to 1968, did similar pioneering work on earlier prehistory at the Mount Carmel caves, where she defined the Natufian culture; she was also the first woman to hold a Cambridge professorship.

Why it mattered: these discoveries put the origins of our own lineage in Africa and showed how stone tools and fossils can be linked.`,
          },
          {
            id: 'lab-archaeology.l11',
            title: 'The First Monuments and Towns',
            blurb: 'Gobekli Tepe, Catalhoyuk and a rethink of the Neolithic.',
            minutes: 7,
            body: `Gobekli Tepe in Turkey, dated to about 9500 BC, is the oldest known monumental sanctuary. Its carved T-shaped pillars, decorated with animal reliefs and set in circular enclosures, were raised by hunter-gatherers, before farming or pottery. That finding challenged an older idea that monumental building could only follow agriculture, and it rewrote the timeline of monumental construction.

Catalhoyuk, also in Turkey, dates to about 7100 to 5700 BC. It was a large settlement of densely packed mudbrick houses with no streets; people entered their homes through the roof. Wall paintings and plastered skulls were found inside. Ian Hodder, born in 1948, directs the research project there and uses a reflexive method in which interpretation is discussed at the trowel's edge.

V. Gordon Childe, who lived from 1892 to 1957, offered a broader framework in works such as Man Makes Himself. He described the Neolithic Revolution and the Urban Revolution as turning points in human history, and he excavated the Neolithic village of Skara Brae.

Why it mattered: these sites show that ritual, community and settlement were tangled together long before cities.`,
          },
          {
            id: 'lab-archaeology.l12',
            title: 'Ancient Cities: Giza to Pompeii',
            blurb: 'Great urban sites and what each one preserves.',
            minutes: 8,
            body: `The Giza Pyramid Complex in Egypt dates to the Old Kingdom, about 2560 BC. The Great Pyramid of Khufu is the only surviving wonder of the ancient world, and the complex also includes the Great Sphinx and the pyramids of Khafre and Menkaure.

Mohenjo-daro in Pakistan, about 2500 BC, was a major city of the Indus Valley Civilisation. It had a grid street plan, the Great Bath and sophisticated drainage, while its script remains undeciphered.

Petra in Jordan, the capital of the Nabataeans from about 300 BC to AD 100, is famous for temples and tombs carved into sandstone cliffs, such as Al-Khazneh, called the Treasury, and for its water-management channels.

At Xi'an in China, the Terracotta Army of about 210 BC consists of roughly 8,000 life-size clay figures guarding the tomb of Qin Shi Huang, and the emperor's burial mound itself remains unexcavated.

Pompeii in Italy was sealed by the eruption of Vesuvius in AD 79. Because the city was buried quickly, it preserved streets, houses, frescoes and body casts, giving the richest snapshot of everyday Roman life ever excavated.

Why it mattered: each site preserves a different kind of evidence, from monumental to domestic.`,
          },
          {
            id: 'lab-archaeology.l13',
            title: 'Americas, Africa and Southeast Asia',
            blurb: 'Stone cities beyond the Mediterranean and the Near East.',
            minutes: 8,
            body: `Machu Picchu in Peru is a fifteenth-century Inca royal estate, built around AD 1450 with ashlar dry-stone masonry and agricultural terraces. Hiram Bingham, who lived from 1875 to 1956, brought it to world attention through his expeditions beginning in 1911. The phrase deserves care, since local people already knew the place; his role was publicising it internationally.

Chichen Itza in Mexico, active about AD 600 to 1200, is dominated by El Castillo, the Temple of Kukulcan, whose stairways encode the solar year. Teotihuacan, near present-day Mexico City, flourished from about 100 BC to AD 550 and was the largest city of the pre-Columbian Americas, laid out around the Avenue of the Dead and the Pyramids of the Sun and Moon.

Great Zimbabwe, about AD 1100 to 1450, was the capital of a powerful Shona kingdom. Its mortarless granite walls are the largest ancient structures in sub-Saharan Africa, and the Zimbabwe Bird soapstone carvings were found there; Indian Ocean trade connected it to distant markets.

Angkor Wat in Cambodia, built in the early twelfth century by the Khmer, is a five-towered temple-mountain surrounded by a moat.

Why it mattered: these sites show that complex urban and monumental traditions arose on every inhabited continent.`,
          },
          {
            id: 'lab-archaeology.l14',
            title: 'Theory, Ethics and Heritage',
            blurb: 'How ideas about the past and who owns it have changed.',
            minutes: 8,
            body: `Archaeology has changed as much in its ideas as in its tools. Lewis Binford, who lived from 1931 to 2011, founded processual, or New, archaeology. He argued for a scientific, hypothesis-driven approach, using ethnoarchaeology and middle-range theory to link what we find to the behaviour that produced it.

Ian Hodder, born in 1948, founded post-processual archaeology, which stresses that interpretation is always shaped by the interpreter and should be reflexive and contextual. Colin Renfrew combined radiocarbon chronology with cognitive and social archaeology. The two schools disagree, and many archaeologists draw on both.

Ethics is just as important. Peter Ucko, who lived from 1938 to 2007, helped found the World Archaeological Congress and pressed for ethical excavation, repatriation of remains and objects, and a global, decolonised archaeology. Gertrude Bell, who lived from 1868 to 1926, helped write antiquities law and was involved in founding the Baghdad museum in 1926.

Questions such as who owns a find, who may study it, and how descendant communities are consulted are central to modern practice.

Why it mattered: archaeology is both a science and a public trust, and its credibility depends on respecting both roles.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'lab-archaeology',
    questions: [
      ...mk('lab-archaeology.l01', [
        [1, 'In which year was Winckelmann\'s History of the Art of Antiquity published?', '1764', ['1822', '1880', '1922'], 1, 'It is in the eighteenth century.', 'Winckelmann, who lived 1717-1768, published the work in 1764.'],
        [1, 'At which site did Schliemann dig in his search for Homer\'s Troy?', 'Hisarlik', ['Knossos', 'Giza', 'Mohenjo-daro'], 2, 'It is in modern Turkey.', 'Schliemann excavated at Hisarlik, which holds nine stratified settlements.'],
        [2, 'How can a stylistic chronology date a statue with no inscription?', 'By comparing its style with a sequence of known pieces', ['By reading its weight', 'By carbon-14 measurement of stone', 'By asking local residents what they remember about the statue and its carvers'], 0, 'Think of ordering by style.', 'Stylistic chronology orders objects by comparing style with sequences of known works.'],
        [3, 'What does it mean that Hisarlik has nine stratified settlements?', 'Cities were built one on top of another, so deeper layers are older', ['All nine were built at once', 'The mound was a natural hill that formed with no human settlement on it at all', 'Only the top layer matters'], 3, 'Think about layers.', 'Successive cities formed layers on the mound, so digging down reaches older periods, which also means careless trenching can destroy evidence.'],
      ]),
      ...mk('lab-archaeology.l02', [
        [1, 'What did Pitt Rivers insist on recording?', 'Ordinary finds as well as spectacular ones', ['Only gold objects', 'Only inscriptions', 'Only human remains'], 2, 'He wanted total recording.', 'Pitt Rivers practised total recording of ordinary finds with meticulous plans and sections.'],
        [1, 'What is Petrie\'s sequence dating also called?', 'Seriation', ['Dendrochronology', 'Flotation', 'Photogrammetry'], 3, 'It orders groups of finds by style.', 'Petrie\'s sequence dating is known as seriation.'],
        [2, 'Why record ordinary pottery sherds?', 'Their styles change over time, so they can order and date a site', ['They are always valuable', 'They never change', 'They are easy to sell'], 1, 'Think about change in style.', 'Common pottery changes in style over time, so it provides a way to date and compare contexts.'],
        [3, 'How did Pitt Rivers\'s approach differ from treasure-hunting?', 'It valued all finds recorded in context rather than just spectacular objects', ['It ignored where things were found', 'It prioritised selling the most attractive finds to wealthy private collectors abroad', 'It avoided digging entirely'], 0, 'Think about what counts as evidence.', 'Recording all finds with plans and sections turned excavation into evidence-gathering instead of collecting.'],
      ]),
      ...mk('lab-archaeology.l03', [
        [1, 'In which year did Howard Carter discover Tutankhamun\'s tomb?', '1922', ['1896', '1904', '1959'], 3, 'It is in the early 1920s.', 'Carter discovered the tomb of Tutankhamun (KV62) in 1922.'],
        [1, 'Which civilisation did Arthur Evans uncover at Knossos?', 'The Minoan civilisation', ['The Mycenaean-only civilisation of the mainland', 'The Nabataean civilisation', 'The Khmer civilisation'], 2, 'It was on Crete.', 'Evans uncovered the Minoan civilisation at Knossos on Crete.'],
        [2, 'Why was Carter\'s clearance of the tomb so slow?', 'Each object was recorded and conserved in place', ['The tomb was far away', 'He lacked labourers', 'He wanted to hide the finds'], 1, 'Think about careful, object-by-object work.', 'Object-by-object clearance with conservation recording preserved information about each object.'],
        [3, 'Why are Evans\'s reconstructions at Knossos controversial?', 'They mix modern interpretation with ancient remains', ['They were made of gold', 'They were never built', 'They show a different island'], 3, 'Think about the difference between evidence and guesswork.', 'Reconstruction can blend conjecture with original fabric, though supporters argue it helps visitors.'],
      ]),
      ...mk('lab-archaeology.l04', [
        [1, 'What does the law of superposition say?', 'In undisturbed ground, lower deposits are older than those above', ['Upper deposits are always older', 'All layers in one trench formed during a single short episode of deposition', 'Deposits are older in the east'], 0, 'It is about layers in ground.', 'Superposition: lower deposits are older than those above them if undisturbed.'],
        [1, 'What does a Harris Matrix show?', 'The stratigraphic relationships between contexts', ['The weight of finds', 'The price of artefacts', 'The route of the excavators'], 2, 'It is a diagram about layers.', 'The Harris Matrix diagrams how contexts relate to each other in time.'],
        [2, 'In undisturbed ground, layers A (top), B (middle) and C (bottom). What is the order of deposition?', 'C, then B, then A', ['A, then B, then C', 'B, then C, then A', 'All at once'], 3, 'The oldest is at the bottom.', 'The lowest layer formed first, so the order is C, B, A.'],
        [3, 'Why does stratigraphy give only a relative age?', 'It shows sequence but not the number of years', ['It cannot show the order of layers, only their colour and texture', 'It measures leftover carbon and so gives only a rough age', 'It is a guess that archaeologists mostly no longer rely on'], 1, 'Relative means in comparison.', 'Stratigraphy says what is older than what, but not how many years ago, which needs another method.'],
      ]),
      ...mk('lab-archaeology.l05', [
        [1, 'Who is called the inventor of the modern grid excavation?', 'Mortimer Wheeler', ['Howard Carter', 'Arthur Evans', 'Louis Leakey'], 0, 'His name is part of a method.', 'Mortimer Wheeler is credited with the modern grid method.'],
        [1, 'At which site did Kathleen Kenyon refine stratigraphic excavation?', 'Jericho', ['Mohenjo-daro', 'Pompeii', 'Olduvai'], 3, 'Also called Tell es-Sultan.', 'Kenyon worked at Jericho (Tell es-Sultan) and in Jerusalem.'],
        [2, 'What are the walls of unexcavated earth between squares called?', 'Baulks', ['Matrices', 'Sherds', 'Cenotes'], 2, 'They preserve sections.', 'Baulks preserve vertical sections where layers can be read.'],
        [3, 'Why is a grid more rigorous than a single large open trench?', 'It controls where finds lie and keeps sections to check layers', ['It always costs less than a trench and needs far fewer workers on site', 'It lets the team skip detailed recording because the squares do that', 'It removes the need to read layers because the squares are all dug level'], 1, 'Think about control and checking.', 'Squares and baulks give precise control and visible sections, so others can check the interpretation.'],
      ]),
      ...mk('lab-archaeology.l06', [
        [1, 'What does LiDAR use to map the ground?', 'Laser pulses that can see through forest canopy', ['Magnets in the soil', 'Sound waves bounced off the bedrock beneath the ground surface', 'Tree rings'], 2, 'It is a laser-based technique.', 'LiDAR is a canopy-penetrating laser survey method.'],
        [1, 'What is fieldwalking?', 'Walking a landscape to map and record surface finds', ['Digging a deep trench', 'Washing soil in mesh', 'Dating tree rings'], 1, 'It is done on foot.', 'Fieldwalking systematically records surface finds and features to locate sites.'],
        [2, 'Which tool detects buried walls without digging?', 'Ground-penetrating radar', ['Flotation of soil samples in water', 'Seriation', 'Radiocarbon dating'], 3, 'It sends signals into the soil.', 'GPR records echoes from buried features and is non-invasive.'],
        [3, 'Why do archaeologists often survey before excavating?', 'Digging destroys evidence, so non-invasive methods help target it', ['Surveys replace all excavation forever', 'Surveys find only gold', 'Excavation is illegal'], 0, 'Think about what digging does to a site.', 'Excavation is destructive, so prospection helps limit and focus digging.'],
      ]),
      ...mk('lab-archaeology.l07', [
        [1, 'What does flotation recover?', 'Charred seeds and plant remains', ['Pottery decorations', 'Radio signals', 'Tree-ring patterns'], 3, 'Think of things that float.', 'Flotation washes soil in fine mesh so charred plant remains float free.'],
        [1, 'What does photogrammetry build from overlapping photographs?', 'Three-dimensional models', ['Radiocarbon dates for the layers', 'Chemical profiles of ancient soils', 'Bone chemistry and diet records'], 1, 'The output is a model.', 'Photogrammetry produces accurate 3D models and orthophotos.'],
        [2, 'Which method studies diet and health from skeletons?', 'Osteology and bioarchaeology', ['Flotation and archaeobotany of soil samples', 'Photogrammetry and three-dimensional modelling', 'Magnetometry and resistivity surveying'], 0, 'It is about bone.', 'Osteology reconstructs age, sex, health, diet and mobility from bone.'],
        [3, 'Why make a 3D model of each phase of a dig?', 'Excavation removes the layers, so models preserve a record of them', ['Models replace all fieldwork', 'Models are cheaper than people', 'Layers do not matter'], 2, 'Think about what excavation does.', 'Because digging is destructive, models keep a record of context after it is gone.'],
      ]),
      ...mk('lab-archaeology.l08', [
        [1, 'About how long is the half-life of carbon-14?', 'About 5,730 years', ['About 57 years', 'About 500,000 years', 'About 5 days'], 1, 'It is a few thousand years.', 'Carbon-14 has a half-life of about 5,730 years.'],
        [1, 'Radiocarbon dating works on which kind of material?', 'Once-living organic material', ['Any kind of stone, whatever its age', 'Only metal objects such as bronze or iron', 'Only glass and other fired and melted materials'], 3, 'The sample must once have lived.', 'Radiocarbon works on organic material such as charcoal, wood, bone, shell and seeds.'],
        [2, 'Which sample could be radiocarbon dated?', 'Charred seeds from a hearth', ['A flint blade from a workshop floor', 'A granite wall block from a temple', 'A glass bead from a Roman workshop floor'], 0, 'Pick the organic one.', 'Charred seeds are organic and suitable for radiocarbon dating.'],
        [3, 'Why are tree-ring dates used to calibrate radiocarbon?', 'Each ring is a known calendar year, so radiocarbon ages can be checked against them', ['Trees are never alive', 'Rings are random', 'Radiocarbon cannot be calibrated'], 2, 'Think about annual rings.', 'Tree rings give exact calendar years against which raw radiocarbon results are checked.'],
      ]),
      ...mk('lab-archaeology.l09', [
        [1, 'Which method dates fired ceramics by trapped electrons released as light on heating?', 'Thermoluminescence', ['Dendrochronology', 'Obsidian hydration', 'Seriation'], 0, 'It begins with "thermo".', 'Thermoluminescence dates fired ceramics, burnt flint and heated stones.'],
        [1, 'Which method uses volcanic ash to bracket fossils, for instance at Olduvai?', 'Potassium-argon', ['Radiocarbon', 'Amino-acid racemization', 'Fieldwalking'], 2, 'It involves decay of a potassium isotope.', 'Potassium-argon dates volcanic minerals that bracket fossils.'],
        [2, 'Which method dates when buried sand last saw sunlight?', 'Optically stimulated luminescence', ['Thermoluminescence', 'Uranium-series dating of cave calcite', 'Dendrochronology'], 1, 'It uses light, not heat.', 'OSL measures time since sediment grains were last exposed to light.'],
        [3, 'Why do archaeologists use several dating methods?', 'Each works only for certain materials and ages, and agreement strengthens confidence', ['One method works for everything', 'Dates are never checked', 'Methods are interchangeable at no cost'], 3, 'Think about limits of each method.', 'Methods have different material and time ranges, and independent agreement makes dates more trustworthy.'],
      ]),
      ...mk('lab-archaeology.l10', [
        [1, 'Who found the Laetoli hominin footprints in 1978?', 'Mary Leakey', ['Dorothy Garrod', 'Gertrude Bell', 'Kathleen Kenyon'], 0, 'She also found the Zinjanthropus skull.', 'Mary Leakey discovered the Laetoli footprints in 1978.'],
        [1, 'In which country is Olduvai Gorge?', 'Tanzania', ['Kenya only', 'Egypt', 'Peru'], 1, 'It is in the East African Rift.', 'Olduvai Gorge is in Tanzania.'],
        [2, 'Why are volcanic ash layers helpful at Olduvai?', 'They can be dated with potassium-argon, so fossils between them are bracketed', ['They contain the fossils themselves and nothing else, so they are dated directly', 'They cannot be dated because volcanic minerals do not decay at any useful rate', 'They destroyed every fossil by heat, so only layers far below the ash are useful'], 2, 'Think about layers above and below.', 'Dating the ash above and below a fossil gives upper and lower age limits.'],
        [3, 'What does the association of stone tools with hominin fossils suggest?', 'Toolmaking can be linked to early human ancestors', ['Tools were invented in the Industrial Age', 'Fossils and tools are unrelated because they always lie in separate layers', 'Hominins used no technology'], 3, 'Think about behaviour as well as bones.', 'Finding tools with fossils lets archaeologists connect behaviour with particular ancestors.'],
      ]),
      ...mk('lab-archaeology.l11', [
        [1, 'Who built the monumental pillars of Gobekli Tepe?', 'Hunter-gatherers', ['Roman engineers who ruled the region', 'Maya priests and astronomers', 'Khmer kings and their court builders'], 0, 'It was before farming or pottery.', 'Gobekli Tepe was raised by hunter-gatherers about 9500 BC.'],
        [1, 'How did people enter houses at Catalhoyuk?', 'Through the roof', ['Through a street door', 'By boat', 'Through underground tunnels'], 2, 'There were no streets.', 'Catalhoyuk houses were densely packed and entered via the roof.'],
        [2, 'Which is older?', 'Gobekli Tepe (about 9500 BC)', ['Catalhoyuk (about 7100-5700 BC)', 'Stonehenge (about 3000 BC)', 'Great Zimbabwe (AD 1100)'], 1, 'Compare the dates.', 'Gobekli Tepe is older than Catalhoyuk by thousands of years.'],
        [3, 'Why did Gobekli Tepe rewrite the timeline of monumental building?', 'Monumental building appeared before farming, not only after it', ['It was built by farmers with pottery', 'It was built during the Bronze Age by early metal-working city states', 'It was never dated'], 3, 'Think about who built it.', 'It showed that groups without farming could organise large monumental projects.'],
      ]),
      ...mk('lab-archaeology.l12', [
        [1, 'In which year was Pompeii buried by Vesuvius?', 'AD 79', ['AD 476', '44 BC', 'AD 1066'], 2, 'It is in the first century.', 'Pompeii was buried by the eruption of Vesuvius in AD 79.'],
        [1, 'Which feature is found at Mohenjo-daro?', 'The Great Bath', ['The Treasury carved in cliff', 'El Castillo', 'The Siq approach'], 0, 'It is a water structure.', 'Mohenjo-daro has a grid plan, the Great Bath and sophisticated drainage.'],
        [2, 'Which site is the oldest?', 'Giza (about 2560 BC)', ['Pompeii (AD 79)', 'Petra (about 300 BC-AD 100)', 'The Terracotta Army (about 210 BC)'], 3, 'Compare the dates.', 'Giza dates to about 2560 BC, much earlier than the others.'],
        [3, 'Why is Pompeii such a rich snapshot of daily life?', 'It was buried quickly, so houses, streets and frescoes were sealed in place', ['It was abandoned slowly and stripped', 'It was rebuilt in modern times to look like a Roman town centre', 'It had no buildings'], 1, 'Think about sudden burial.', 'Rapid burial preserved everyday objects and buildings instead of letting them be scavenged or rebuilt.'],
      ]),
      ...mk('lab-archaeology.l13', [
        [1, 'Who brought Machu Picchu to world attention through expeditions from 1911?', 'Hiram Bingham', ['Howard Carter', 'Arthur Evans', 'Mortimer Wheeler'], 0, 'He was an American explorer and academic.', 'Hiram Bingham led expeditions beginning in 1911 that brought Machu Picchu to world attention.'],
        [1, 'How were the walls of Great Zimbabwe built?', 'Of granite without mortar', ['Of mudbrick with timber roofs', 'Of poured concrete', 'Of glass'], 3, 'The word is "dry-stone".', 'Great Zimbabwe\'s mortarless granite walls are the largest ancient structures in sub-Saharan Africa.'],
        [2, 'Which site is dominated by El Castillo?', 'Chichen Itza', ['Teotihuacan', 'Angkor Wat', 'Machu Picchu'], 2, 'It is in the Maya region.', 'El Castillo (Temple of Kukulcan) dominates Chichen Itza.'],
        [3, 'Why is "brought to world attention" more careful than "discovered" for Machu Picchu?', 'Local people already knew the site', ['It was never lived in by anyone before the twentieth century', 'It was found only by satellite imagery in recent years', 'Bingham ordered the original terraces to be built in 1911'], 1, 'Think about who already knew.', 'Locals knew of Machu Picchu; Bingham publicised it internationally.'],
      ]),
      ...mk('lab-archaeology.l14', [
        [1, 'Who founded processual, or New, archaeology?', 'Lewis Binford', ['Ian Hodder', 'Heinrich Schliemann', 'Gertrude Bell'], 0, 'He used ethnoarchaeology and middle-range theory.', 'Lewis Binford founded processual archaeology.'],
        [1, 'Which excavation project does Ian Hodder direct?', 'Catalhoyuk', ['The Troy project at Hisarlik', 'The dig at Mohenjo-daro in Pakistan', 'The Olduvai Gorge fossil project'], 2, 'It is in Turkey.', 'Ian Hodder directs the Catalhoyuk research project.'],
        [2, 'Which approach stresses reflexive, contextual interpretation?', 'Post-processual archaeology', ['Processual archaeology', 'Typological seriation of pottery', 'Dendrochronology'], 3, 'Hodder founded it.', 'Post-processual archaeology emphasises reflexive and contextual interpretation.'],
        [3, 'Why did Peter Ucko push for ethics and repatriation?', 'Finds matter to living communities, so who owns and studies them is an ethical question', ['Finds have no meaning', 'Only large museums in wealthy countries should ever hold finds because they alone can protect them', 'Ethics only matters for Egypt'], 1, 'Think about descendants and ownership.', 'Ucko argued for ethical practice and consultation, helping found the World Archaeological Congress.'],
      ]),
    ],
  },
};
