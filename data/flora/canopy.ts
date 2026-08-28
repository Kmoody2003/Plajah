// The Canopy — trees. Every specimen here grows procedurally (TreeGrower), so
// the gallery costs parameters rather than megabytes. Stories are written for a
// visitor standing in front of the tree, not scraped.

import type { FloraSpecimen } from './types';
import { TREE_SPECIES } from '../../components/museion/flora/TreeGrower';

const canopy: FloraSpecimen[] = [
  {
    id: 'quercus-rubra',
    commonName: 'Northern Red Oak',
    sciName: 'Quercus rubra',
    family: 'Fagaceae', genus: 'Quercus',
    lineage: 'angiosperm', gallery: 'canopy',
    photos: [],
    model: { kind: 'procedural', params: TREE_SPECIES.oak },
    stats: { height: '20–28 m', lifespan: '300–500 years', range: 'Eastern North America' },
    conservation: 'LC',
    story:
      'An oak spends its first decade building roots, not height — which is why a young one looks like a shrub and an old one looks like architecture. Its acorns take a single season to ripen, and a mature tree can drop several thousand in a good year, of which perhaps one becomes a tree. The wide, open crown you are standing under is the shape of a tree that grew without competition; in a dense forest the same species grows tall and narrow instead.',
  },
  {
    id: 'betula-papyrifera',
    commonName: 'Paper Birch',
    sciName: 'Betula papyrifera',
    family: 'Betulaceae', genus: 'Betula',
    lineage: 'angiosperm', gallery: 'canopy',
    photos: [],
    model: { kind: 'procedural', params: TREE_SPECIES.birch },
    stats: { height: '15–25 m', lifespan: '80–140 years', range: 'Northern North America' },
    conservation: 'LC',
    story:
      'The white bark is sunscreen. Birches colonise open, burnt ground where there is no canopy to hide under, and the reflective outer layer keeps the trunk from overheating and cracking on bright winter days. It peels in horizontal sheets because the bark grows faster in girth than it can stretch. A birch is a pioneer: it arrives first, grows fast, dies young, and shelters the slower trees that replace it.',
  },
  {
    id: 'pinus-sylvestris',
    commonName: 'Scots Pine',
    sciName: 'Pinus sylvestris',
    family: 'Pinaceae', genus: 'Pinus',
    lineage: 'gymnosperm', gallery: 'canopy',
    photos: [],
    model: { kind: 'procedural', params: TREE_SPECIES.pine },
    stats: { height: '25–35 m', lifespan: '150–300 years', range: 'Europe to eastern Siberia' },
    conservation: 'LC',
    story:
      'Look at how the branches leave the trunk in tiers, all at roughly the same height. That is one year of growth per whorl — a pine keeps a visible calendar of its own life. Needles, rather than leaves, are the conifer answer to cold and drought: small surface area, waxy skin, and no need to rebuild the entire canopy each spring. This is a gymnosperm, an older lineage than every flowering tree around it.',
  },
  {
    id: 'salix-babylonica',
    commonName: 'Weeping Willow',
    sciName: 'Salix babylonica',
    family: 'Salicaceae', genus: 'Salix',
    lineage: 'angiosperm', gallery: 'canopy',
    photos: [],
    model: { kind: 'procedural', params: TREE_SPECIES.willow },
    stats: { height: '10–20 m', lifespan: '40–75 years', range: 'Native to northern China; planted worldwide' },
    conservation: 'LC',
    story:
      'The fall of a willow is not sadness but hydraulics: fast, soft, water-hungry growth that outruns the wood needed to hold it up. Willows live at the water\'s edge and drink accordingly. Their bark carries salicin — the compound that became aspirin — and a cut willow branch pushed into wet ground will simply become another willow, which is why a single tree can populate a riverbank.',
  },
  {
    id: 'adansonia-digitata',
    commonName: 'African Baobab',
    sciName: 'Adansonia digitata',
    family: 'Malvaceae', genus: 'Adansonia',
    lineage: 'angiosperm', gallery: 'canopy',
    photos: [],
    model: { kind: 'procedural', params: TREE_SPECIES.baobab },
    stats: { height: '5–25 m', lifespan: '1,000+ years', range: 'Sub-Saharan Africa' },
    conservation: 'LC',
    story:
      'The trunk is a reservoir. A large baobab holds tens of thousands of litres of water in soft, fibrous wood, which is why it swells and shrinks visibly through the seasons and why it has no growth rings to count — dating one takes radiocarbon. It flowers at night, white and enormous, pollinated by fruit bats. Several of the oldest known individuals collapsed in the last two decades, which is how we learned they were over two thousand years old.',
  },
  {
    id: 'acer-saccharum',
    commonName: 'Sugar Maple',
    sciName: 'Acer saccharum',
    family: 'Sapindaceae', genus: 'Acer',
    lineage: 'angiosperm', gallery: 'canopy',
    photos: [],
    model: { kind: 'procedural', params: TREE_SPECIES.maple },
    stats: { height: '25\u201335 m', lifespan: '300\u2013400 years', range: 'Eastern North America' },
    conservation: 'LC',
    story:
      'The scarlet is a side effect of thrift. All summer the leaf is green with chlorophyll; as autumn closes in the tree withdraws that pigment to reuse the nitrogen, and what it makes instead \u2014 anthocyanin \u2014 is red. The sap that becomes syrup runs only in a narrow window in late winter, when nights freeze and days thaw: the pressure swing drives sap up the trunk, and it takes about forty litres to boil down to one.',
  },
  {
    id: 'ginkgo-biloba',
    commonName: 'Ginkgo',
    sciName: 'Ginkgo biloba',
    family: 'Ginkgoaceae', genus: 'Ginkgo',
    lineage: 'gymnosperm', gallery: 'canopy',
    photos: [],
    model: { kind: 'procedural', params: TREE_SPECIES.ginkgo },
    stats: { height: '20\u201335 m', lifespan: '1,000+ years', range: 'Native to China; planted worldwide' },
    conservation: 'EN',
    story:
      'A living fossil with no close relatives anywhere \u2014 the last survivor of an order that was widespread when dinosaurs fed on it. Its fan-shaped leaf has veins that fork in two and never rejoin, a pattern from before the design every other tree here uses. Six ginkgos stood within two kilometres of the Hiroshima hypocentre and regrew the following spring. Wild populations are endangered; the species survives largely because Chinese monks cultivated it in temple grounds for a thousand years.',
  },
  {
    id: 'populus-nigra-italica',
    commonName: 'Lombardy Poplar',
    sciName: 'Populus nigra',
    family: 'Salicaceae', genus: 'Populus',
    lineage: 'angiosperm', gallery: 'canopy',
    photos: [],
    model: { kind: 'procedural', params: TREE_SPECIES.poplar },
    stats: { height: '20\u201330 m', lifespan: '40\u201350 years', range: 'Planted across Europe and beyond' },
    conservation: 'LC',
    story:
      'Every Lombardy poplar in the world is male, and effectively the same tree. The narrow, upswept form is a mutation found near the Po valley in the 1700s and propagated ever since by cuttings \u2014 a clone, planted in rows to break wind across farmland from Italy to Argentina. That is also its weakness: no genetic variation means no defence, and a single canker can take out an entire avenue.',
  },
  {
    id: 'cupressus-sempervirens',
    commonName: 'Italian Cypress',
    sciName: 'Cupressus sempervirens',
    family: 'Cupressaceae', genus: 'Cupressus',
    lineage: 'gymnosperm', gallery: 'canopy',
    photos: [],
    model: { kind: 'procedural', params: TREE_SPECIES.cypress },
    stats: { height: '20\u201330 m', lifespan: '500\u20131,000 years', range: 'Mediterranean basin' },
    conservation: 'LC',
    story:
      'The dark columns on every Tuscan hillside were planted, not born there \u2014 the wild form of this species is a broad, spreading tree, and the narrow one is a selection humans have favoured since antiquity. Its leaves are scales pressed flat against the twig, an adaptation to heat that costs almost no water. Cypress has been the tree of Mediterranean cemeteries for millennia, partly because the timber resists rot for centuries.',
  },
  {
    id: 'sequoia-sempervirens',
    commonName: 'Coast Redwood',
    sciName: 'Sequoia sempervirens',
    family: 'Cupressaceae', genus: 'Sequoia',
    lineage: 'gymnosperm', gallery: 'canopy',
    photos: [],
    model: { kind: 'procedural', params: TREE_SPECIES.redwood },
    stats: { height: '60\u2013115 m', lifespan: '1,200\u20132,200 years', range: 'Coastal fog belt, California and Oregon' },
    conservation: 'EN',
    story:
      'The tallest trees alive, and they run on fog. Water cannot be pulled much above 120 metres \u2014 the column breaks \u2014 so the top third of a redwood drinks directly from the coastal fog that condenses on its needles. The cinnamon bark grows a foot thick and contains almost no resin, which is why these trees survive the fires that clear everything around them. Roughly 5% of the old-growth forest remains.',
  },
  {
    id: 'phoenix-dactylifera',
    commonName: 'Date Palm',
    sciName: 'Phoenix dactylifera',
    family: 'Arecaceae', genus: 'Phoenix',
    lineage: 'angiosperm', gallery: 'canopy',
    photos: [],
    model: { kind: 'procedural', params: TREE_SPECIES.palm },
    stats: { height: '15\u201325 m', lifespan: '100\u2013150 years', range: 'North Africa and the Middle East' },
    conservation: 'LC',
    story:
      'A palm is not a tree in the way an oak is. It has no bark, no annual rings and no branches \u2014 it is a giant herb whose trunk is a bundle of fibres that cannot heal or thicken once formed. It grows from a single point at the crown, so damage there kills the whole plant. Cultivated for at least six thousand years, the date palm may be the oldest crop tree we have; a seed recovered from Masada germinated in 2005 after roughly two thousand years.',
  },
  {
    id: 'prunus-serrulata',
    commonName: 'Japanese Cherry',
    sciName: 'Prunus serrulata',
    family: 'Rosaceae', genus: 'Prunus',
    lineage: 'angiosperm', gallery: 'canopy',
    photos: [],
    model: { kind: 'procedural', params: TREE_SPECIES.cherry },
    stats: { height: '8\u201312 m', lifespan: '30\u201360 years', range: 'Japan, Korea, China; planted worldwide' },
    conservation: 'LC',
    story:
      'The ornamental cherries bloom before they leaf, which is why the effect is total \u2014 a bare tree becomes a cloud in about four days. Most flowering varieties are sterile clones producing no fruit at all; the point was always the blossom. Japan has recorded the flowering date in Kyoto for over 1,200 years, one of the longest phenological records anywhere, and it now arrives earlier than at any point in that record.',
  },
  {
    id: 'eucalyptus-regnans',
    commonName: 'Mountain Ash',
    sciName: 'Eucalyptus regnans',
    family: 'Myrtaceae', genus: 'Eucalyptus',
    lineage: 'angiosperm', gallery: 'canopy',
    photos: [],
    model: { kind: 'procedural', params: TREE_SPECIES.eucalyptus },
    stats: { height: '70\u2013100 m', lifespan: '350\u2013500 years', range: 'Tasmania and Victoria, Australia' },
    conservation: 'LC',
    story:
      'The tallest flowering plant on Earth, and a tree that depends on catastrophe. Mountain ash cannot regenerate in its own shade \u2014 the seed needs bare ash and full light, so a stand of them is usually all one age, germinated after a single fire. The pale trunk sheds its bark in long ribbons rather than growing a thick protective layer, and the leaves hang vertically to present their edge to the midday sun.',
  },
];

export default canopy;
