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
];

export default canopy;
