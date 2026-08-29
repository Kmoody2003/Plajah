// The history of botany — the discipline's own exhibit.
//
// A hall full of specimens tells you what plants are. It does not tell you how
// anyone found out, and that story is the more surprising one: that it took
// two thousand years to work out that plants eat air, that the rules of
// inheritance sat unread in a Moravian abbey for thirty-four years, that a
// woman was barred from reading her own mycology paper to the Linnean Society.
//
// EVERY ENTRY HERE IS A DOCUMENTED PERSON, DATE OR PUBLICATION. Nothing is
// composed to round out a narrative or to balance a list. A museum that invents
// a plausible figure has stopped being a museum, and the invention will outlive
// the correction — so where a date is disputed it says so, and where a
// contribution is contested it says that too.

export interface Milestone {
  /** Display year — a string, because "c. 300 BCE" is the honest answer. */
  year: string;
  /** Sort key: negative for BCE. */
  sort: number;
  title: string;
  who: string;
  what: string;
  /** Why a visitor should care — the wall label, not the footnote. */
  why: string;
}

export interface Pioneer {
  id: string;
  name: string;
  life: string;
  place: string;
  /** One line, for the card face. */
  known: string;
  story: string;
}

/**
 * Milestones, oldest first.
 *
 * Chosen for turning points rather than for firsts: the moment an idea became
 * available to everyone who came after, which is not always the moment someone
 * first had it.
 */
export const MILESTONES: Milestone[] = [
  {
    year: 'c. 300 BCE', sort: -300,
    title: 'Plants become a subject',
    who: 'Theophrastus, Lesbos and Athens',
    what: 'Enquiry into Plants and On the Causes of Plants — around 500 species described by form, habit and where they grow.',
    why: 'Before this, plants appear in writing as food, medicine or omen. Theophrastus asked what a plant IS: how it is built, how it reproduces, why it grows where it does. He separated the study of plants from the use of them, which is the act that founds a science.',
  },
  {
    year: 'c. 65 CE', sort: 65,
    title: 'The pharmacopoeia that lasted 1,500 years',
    who: 'Pedanius Dioscorides, a Greek physician in the Roman army',
    what: 'De Materia Medica: roughly 600 plants, what they treat, how to prepare them.',
    why: 'It stayed in continuous use across the Greek, Latin, Arabic and Byzantine worlds into the seventeenth century — one of the longest-serving reference works ever written. Its endurance is also a warning: authority outlived accuracy, and copying replaced looking for over a millennium.',
  },
  {
    year: 'c. 1240', sort: 1240,
    title: 'The largest botanical compendium of its age',
    who: 'Ibn al-Baytar, of Málaga',
    what: 'Kitāb al-Jāmiʿ — around 1,400 plants and drugs, gathered on foot from Andalusia to Anatolia, with his own corrections to the Greek authorities.',
    why: 'He did what the copyists had stopped doing: he went and looked. Where Dioscorides was wrong he said so, and named the plants in Arabic, Greek, Latin and Berber so the same species could be recognised across languages — a problem botany would not solve properly for another five centuries.',
  },
  {
    year: '1542', sort: 1542,
    title: 'Illustration good enough to identify by',
    who: 'Leonhart Fuchs, with artists Heinrich Füllmaurer and Albrecht Meyer',
    what: 'De Historia Stirpium — around 500 plants drawn from life, at a fidelity no herbal had reached.',
    why: 'A description can be argued with; a good drawing can be checked against the plant in your hand. Fuchs named his artists in the book, which was close to unheard of, and printed them at work. The fuchsia is named after him.',
  },
  {
    year: '1596', sort: 1596,
    title: 'A pharmacology of 1,892 entries',
    who: 'Li Shizhen, Ming China',
    what: 'Bencao Gangmu (Compendium of Materia Medica), twenty-seven years in the making, published after his death.',
    why: 'It corrected centuries of accumulated error in the Chinese herbal tradition by testing claims against observation, and organised its entries by natural kind rather than by alphabet or by ailment — a classification argument, made independently and two centuries before Linnaeus.',
  },
  {
    year: '1665', sort: 1665,
    title: 'The cell, seen and named',
    who: 'Robert Hooke, London',
    what: 'Micrographia: cork under a microscope shows compartments he calls "cells", after the rooms of a monastery.',
    why: 'The first structure of life anyone had ever seen was plant, not animal — and it was dead cork, so what Hooke saw were the walls of cells that had already gone. The name he chose for empty rooms became the name for the unit of all life.',
  },
  {
    year: '1682', sort: 1682,
    title: 'Plants have anatomy',
    who: 'Nehemiah Grew and Marcello Malpighi, independently',
    what: 'The Anatomy of Plants and Anatome Plantarum — tissues, vessels, and the argument that flowers are sexual organs.',
    why: 'That plants reproduce sexually was genuinely shocking, and was resisted for decades. It also made classification by flower structure possible, which is the door Linnaeus walked through.',
  },
  {
    year: '1753', sort: 1753,
    title: 'Every plant gets two names',
    who: 'Carl Linnaeus, Uppsala',
    what: 'Species Plantarum — consistent binomial names, genus then species, for around 6,000 plants.',
    why: 'It is the formal starting point of botanical nomenclature: names published before it do not count. A shared, stable name is what lets a botanist in Kyoto and one in Kew know they are discussing the same organism — the single most useful thing anyone has done for the field. His system of ranking human "varieties", published in the same career, is part of the record too.',
  },
  {
    year: '1779', sort: 1779,
    title: 'Plants eat air, and only in the light',
    who: 'Jan Ingenhousz, building on Joseph Priestley and Charles Bonnet',
    what: 'Experiments upon Vegetables: green parts purify air in sunlight and foul it in darkness.',
    why: 'Photosynthesis, isolated at last. Two thousand years of assuming plants ate soil ended in a series of experiments with sprigs of greenery in sealed jars. Nicolas-Théodore de Saussure showed in 1804 that water is a raw material too.',
  },
  {
    year: '1831', sort: 1831,
    title: 'The nucleus',
    who: 'Robert Brown, examining orchids',
    what: 'Named the "nucleus" as a structure consistently present in living cells.',
    why: 'Brown found the thing that carries inheritance without any idea that it did. He is better remembered for Brownian motion, which he also first described while watching pollen grains jitter in water.',
  },
  {
    year: '1866', sort: 1866,
    title: 'The rules of inheritance, unread',
    who: 'Gregor Mendel, Brno',
    what: 'Experiments on Plant Hybrids — 28,000 pea plants, and the discovery that traits pass in discrete units.',
    why: 'He published, was cited a handful of times, and was ignored for thirty-four years. Three botanists rediscovered his laws independently in 1900 and found he had got there first. Genetics begins in a monastery garden, with peas.',
  },
  {
    year: '1926', sort: 1926,
    title: 'Crops have homelands',
    who: 'Nikolai Vavilov, Leningrad',
    what: 'Centres of origin: crop diversity clusters in a small number of regions, which is where the wild relatives still live.',
    why: 'It tells you where to look for the genes that will save a harvest. Vavilov built the world\'s first seed bank on the principle, was denounced by Trofim Lysenko, and died of starvation in a Soviet prison in 1943 — while his staff, besieged in Leningrad, starved to death guarding the seed collection rather than eat it.',
  },
  {
    year: '1948', sort: 1948,
    title: 'Genes that move',
    who: 'Barbara McClintock, Cold Spring Harbor',
    what: 'Transposable elements in maize — stretches of DNA that relocate within the genome.',
    why: 'The field could not accept it and largely stopped listening; she stopped publishing on it in 1953. It was vindicated when molecular tools caught up, and in 1983 she received an unshared Nobel Prize — the only woman to have received one in Physiology or Medicine alone.',
  },
  {
    year: '1957', sort: 1957,
    title: 'How carbon is fixed',
    who: 'Melvin Calvin, Andrew Benson and James Bassham, Berkeley',
    what: 'The Calvin–Benson cycle: the path carbon dioxide takes on its way to sugar, traced with radioactive carbon-14.',
    why: 'It completed the chemistry Ingenhousz began. Almost every carbon atom in your body passed through this cycle inside a plant or an alga. Calvin received the 1961 Nobel Prize; Benson\'s central role went unrewarded.',
  },
  {
    year: '1967', sort: 1967,
    title: 'The chloroplast was once a bacterium',
    who: 'Lynn Margulis',
    what: 'Endosymbiotic theory: chloroplasts and mitochondria descend from free-living bacteria absorbed by an ancestral cell.',
    why: 'Rejected by fifteen journals before publication, and now textbook. Every green thing on Earth is a partnership: the chloroplast still carries its own bacterial DNA, a survivor of an event roughly a billion years old.',
  },
  {
    year: '1968', sort: 1968,
    title: 'The Green Revolution',
    who: 'Norman Borlaug, and M. S. Swaminathan in India',
    what: 'Semi-dwarf, disease-resistant wheat that put its energy into grain instead of stalk.',
    why: 'Credited with averting famine for hundreds of millions of people; Borlaug received the 1970 Nobel Peace Prize. Its costs — irrigation demand, fertiliser dependence, the loss of local varieties — are part of the same story, and are why Vavilov\'s seed banks matter more now than when he built them.',
  },
  {
    year: '2000', sort: 2000,
    title: 'The first plant genome',
    who: 'The Arabidopsis Genome Initiative',
    what: 'The complete genome of thale cress, a roadside weed with no economic value whatsoever.',
    why: 'Chosen precisely because it is small, fast-growing and useless — nobody had bred it into complexity. It became the reference against which crop genomes are read. Rice followed in 2002, bread wheat, five times the size of a human genome, not until 2018.',
  },
  {
    year: '2008', sort: 2008,
    title: 'A vault against the future',
    who: 'Svalbard Global Seed Vault, Norway',
    what: 'A backup for the world\'s crop seed collections, cut into permafrost 130 metres inside a mountain.',
    why: 'It has already been used: Syrian researchers withdrew seed in 2015 after the collection at Aleppo became unreachable. Meltwater reached the entrance tunnel in 2016, which is its own argument about what the vault is guarding against.',
  },
];

/**
 * The people. Weighted toward those whose work is used daily and whose names
 * are not — and, where the record is ugly, saying so rather than smoothing it.
 */
export const PIONEERS: Pioneer[] = [
  {
    id: 'theophrastus', name: 'Theophrastus', life: 'c. 371 – c. 287 BCE', place: 'Lesbos and Athens',
    known: 'Founded botany as a subject of study',
    story: 'Aristotle\'s student and successor, who inherited his library and his garden. He described around 500 plants, distinguished flowering from non-flowering, and understood that seeds and spores are different propositions. He also recorded which plants grow where and in what soil — the beginning of plant ecology, roughly two thousand years before it had a name.',
  },
  {
    id: 'ibn-al-baytar', name: 'Ibn al-Baytar', life: 'c. 1197 – 1248', place: 'Málaga, Cairo, Damascus',
    known: 'The medieval world\'s greatest botanical compiler',
    story: 'He walked the length of the Mediterranean collecting plants, then wrote them up with cross-referenced names in four languages and open corrections to Dioscorides where observation disagreed with authority. His compendium covered around 1,400 substances, several hundred of them new to the literature. European botany rediscovered much of it centuries later.',
  },
  {
    id: 'linnaeus', name: 'Carl Linnaeus', life: '1707 – 1778', place: 'Uppsala, Sweden',
    known: 'Binomial nomenclature — the naming system still in use',
    story: 'He gave every organism a two-part name and made the practice stick, which is why a species has one label instead of a paragraph. His students sailed on voyages across the world and many died on them. He also applied his ranking instinct to human beings, producing a hierarchy of "varieties" that later racial science drew on directly — the same appetite for order, turned on people, and worth naming in the same breath as the achievement.',
  },
  {
    id: 'ingenhousz', name: 'Jan Ingenhousz', life: '1730 – 1799', place: 'Breda and London',
    known: 'Discovered that photosynthesis requires light',
    story: 'A physician who had already made his name inoculating the Habsburg court against smallpox, he spent a summer in England putting sprigs of plants in water under glass. He found that green parts release oxygen in sunlight and consume it in darkness, and that only the green parts do it. Every calorie you have ever eaten traces back to the process he isolated in that borrowed garden.',
  },
  {
    id: 'mendel', name: 'Gregor Mendel', life: '1822 – 1884', place: 'Brno, Moravia',
    known: 'The laws of inheritance',
    story: 'An Augustinian friar who failed his teaching examinations twice — in biology, both times. He grew and counted 28,000 pea plants over eight years and extracted from them the rules by which traits are inherited. He presented his results to a local natural history society, published in its proceedings, and died an abbot, unaware that he had founded genetics.',
  },
  {
    id: 'beatrix-potter', name: 'Beatrix Potter', life: '1866 – 1943', place: 'London and the Lake District',
    known: 'Mycologist, before the books',
    story: 'Before Peter Rabbit she was a serious mycologist, drawing fungi at a standard still consulted, germinating spores at home, and arguing for the then-contested view that lichens are a partnership between a fungus and an alga. Her 1897 paper went to the Linnean Society, which did not admit women; it was read out by a man on her behalf and she was not present. The Society issued a formal apology in 1997.',
  },
  {
    id: 'bose', name: 'Jagadish Chandra Bose', life: '1858 – 1937', place: 'Calcutta',
    known: 'Measured how plants respond to stimulus',
    story: 'A physicist who turned his instrument-making on plants, inventing the crescograph to magnify growth ten thousand times and record it. He demonstrated that plants respond electrically to touch, wounding, heat and drugs — treated as eccentric in his lifetime, and now ordinary plant electrophysiology. He refused to patent his inventions.',
  },
  {
    id: 'carver', name: 'George Washington Carver', life: 'c. 1864 – 1943', place: 'Tuskegee, Alabama',
    known: 'Soil restoration and crop rotation for farmers who had neither',
    story: 'Born into slavery, he became the first Black student and then a faculty member at Iowa State, and spent his career at Tuskegee working on a problem nobody with resources cared about: cotton had exhausted Southern soil and the farmers on it were poor and mostly Black. He taught rotation with nitrogen-fixing peanuts and legumes, then developed uses for the surplus so rotation would pay. He took his teaching out on a mule-drawn wagon to people who could not come to him.',
  },
  {
    id: 'mexia', name: 'Ynés Mexía', life: '1870 – 1938', place: 'Mexico, the United States and South America',
    known: 'One of the most prolific plant collectors on record',
    story: 'She took her first botany class at fifty-one and made her first collecting trip at fifty-five. In thirteen years she gathered around 145,000 specimens across the Americas, frequently alone, including a two-year traverse of the Amazon by canoe. Around 500 of her specimens were new to science; some fifty species and two genera bear her name. She was still collecting the year she died.',
  },
  {
    id: 'arber', name: 'Agnes Arber', life: '1879 – 1960', place: 'Cambridge',
    known: 'Plant morphology, and its philosophy',
    story: 'She worked mostly alone in a home laboratory after being shut out of institutional space, producing Water Plants and The Gramineae — studies of form that treated a leaf as a problem in reasoning rather than a thing to be catalogued. In 1946 she was the third woman, and the first woman botanist, elected to the Royal Society. Her later books turn on the philosophy of biology itself.',
  },
  {
    id: 'esau', name: 'Katherine Esau', life: '1898 – 1997', place: 'Ukraine, Germany and California',
    known: 'Rewrote plant anatomy',
    story: 'She fled the Russian Revolution, then Germany, and arrived in California to work on sugar beet disease — which led her to the phloem, the tissue plants use to move sugar and viruses use to move themselves. Her Plant Anatomy (1953) taught the subject to generations and is still cited. She received the National Medal of Science at eighty-nine.',
  },
  {
    id: 'janaki-ammal', name: 'Janaki Ammal', life: '1897 – 1984', place: 'Kerala, London and Delhi',
    known: 'Cytogenetics of crops, and the Chromosome Atlas',
    story: 'She worked on sugarcane at a time when India imported its varieties, and on the chromosome numbers of cultivated plants worldwide, co-authoring the Chromosome Atlas of Cultivated Plants. Returning to India at Nehru\'s invitation to reorganise the Botanical Survey, she spent her later years campaigning against the flooding of the Silent Valley rainforest — a campaign that succeeded.',
  },
  {
    id: 'margulis', name: 'Lynn Margulis', life: '1938 – 2011', place: 'Boston and Amherst',
    known: 'Endosymbiosis — where the chloroplast came from',
    story: 'Her paper arguing that chloroplasts and mitochondria are descended from captured bacteria was turned down by around fifteen journals before it appeared in 1967. It is now in every introductory textbook. She held that cooperation, not only competition, is a principal engine of evolutionary novelty, and pressed the argument well past where most colleagues would follow.',
  },
  {
    id: 'maathai', name: 'Wangari Maathai', life: '1940 – 2011', place: 'Kenya',
    known: 'The Green Belt Movement',
    story: 'The first woman in East and Central Africa to earn a doctorate. She founded a movement that paid rural Kenyan women to plant and tend trees, which has since put tens of millions of them in the ground — restoring watersheds while giving the planters an income and a claim on public decisions. She was jailed and beaten for opposing land seizures, and in 2004 became the first African woman to receive the Nobel Peace Prize.',
  },
  {
    id: 'simard', name: 'Suzanne Simard', life: 'b. 1960', place: 'British Columbia',
    known: 'Mycorrhizal networks between trees',
    story: 'Her 1997 work traced carbon moving between birch and fir through shared fungal networks, using isotope labelling — evidence that trees are connected below ground and that resources pass between them. The popular framing as a "wood wide web" runs ahead of the evidence, and the extent and purpose of that transfer is actively contested among ecologists. The connections themselves are not in doubt.',
  },
];

/** Milestones grouped into eras, for a timeline that reads as a shape. */
export const ERAS: { id: string; label: string; range: string; blurb: string }[] = [
  { id: 'ancient', label: 'Naming the World', range: 'c. 300 BCE – 1240 CE', blurb: 'Plants become a subject of study, then a pharmacopoeia — and authority begins to outlive accuracy.' },
  { id: 'looking', label: 'Looking Again', range: '1542 – 1682', blurb: 'Printing, then lenses. Illustration good enough to identify by, and the discovery that plants have anatomy and sex.' },
  { id: 'order', label: 'Order and Air', range: '1753 – 1831', blurb: 'Every plant gets two names, and it turns out plants are built out of the atmosphere.' },
  { id: 'inheritance', label: 'What Is Passed On', range: '1866 – 1948', blurb: 'Peas in an abbey garden, crop homelands, and genes that refuse to stay put.' },
  { id: 'molecular', label: 'Down to the Molecule', range: '1957 – 2008', blurb: 'The carbon path, the bacterium inside every leaf, a genome, and a vault in the permafrost.' },
];
