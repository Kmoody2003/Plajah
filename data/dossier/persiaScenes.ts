/**
 * Reconstruction scenes for the Christianity in Persia dossier. Each is a labelled reconstruction,
 * never a photograph, and cites the claims it illustrates. This is a topic dossier with no
 * characters: every scene shows places, objects, manuscripts, routes or far-off silhouettes.
 * No scene shows an identifiable face, and none depicts Jesus, the apostles, Muhammad or saints.
 * Details marked "generic" are period-plausible staging, not documented facts.
 */
import type { DossierScene } from './douglassScenes';

const STYLE =
  'museum-quality historical reconstruction painting, restrained naturalistic palette, warm soft period lighting, painterly but accurate period detail, calm and dignified mood, no text, no lettering, no people in the foreground';

export const persiaScenes: DossierScene[] = [
  {
    id: 'recon-syriac-lectern', roomId: 'r1', title: 'A Syriac gospel by lamplight',
    basis: 'The Peshitta, the Syriac Bible of the Church of the East; thirteenth-century Estrangela gospel manuscripts survive (generic staging of a reading desk)',
    claimIds: ['c-peshitta', 'c-addai-doctrine'],
    spec: { style: STYLE, aspect: '16:9', setting: 'a quiet stone chamber in a Mesopotamian monastery, a wooden lectern, an open parchment codex with rows of abstract flowing script that is not legible, a clay oil lamp, a carved wooden cross on the wall, dust in the lamplight',
      action: 'no figures; the page glows in the lamplight with a few pages turned back as if someone just stepped away', cast: [] },
  },
  {
    id: 'recon-ctesiphon-vault', roomId: 'r2', title: 'The great vault at Ctesiphon',
    basis: 'Taq Kasra at Ctesiphon, Sasanian capital region (Library of Congress photograph, 1932); Sasanian rule 224-651',
    claimIds: ['c-sasanian-span', 'c-synod-410'],
    spec: { style: STYLE, aspect: '16:9', setting: 'the monumental brick barrel vault of a Sasanian audience hall on the bank of the Tigris at dusk, tall facade with rows of blind arches, a wide empty plain and slow river, a few distant date palms',
      action: 'no figures; golden evening light fills the open arch and a flock of birds crosses the sky', cast: [] },
  },
  {
    id: 'recon-synod-hall', roomId: 'r3', title: 'A hall prepared for the bishops, 410',
    basis: 'Synodicon Orientale: the synod of 410 at Seleucia-Ctesiphon under Isaac (generic staging; no architectural description survives in the sources consulted)',
    claimIds: ['c-synod-410', 'c-yazdegerd1'],
    spec: { style: STYLE, aspect: '16:9', setting: 'a long plain hall in late Sasanian brick and plaster with a carpeted floor, two rows of empty wooden benches facing a central table covered with scrolls and a pair of oil lamps, tall arched windows letting in morning light, a patterned Persian rug',
      action: 'no figures; the hall is ready and silent just before the bishops arrive', cast: [] },
  },
  {
    id: 'recon-stele-courtyard', roomId: 'r4', title: 'The stele in a Tang monastery court',
    basis: 'Xi\'an Stele (781), Legge 1888 translation; stele on a tortoise base, about 279 cm high, Chinese and Syriac text',
    claimIds: ['c-stele781', 'c-alopen'],
    spec: { style: STYLE, aspect: '16:9', setting: 'a quiet courtyard of a Tang-dynasty monastery in Chang\'an in 781, a tall carved limestone stele on a stone tortoise base with a carved capital above, columns of tiny abstract carved characters that are not legible, grey-tiled roofs with upswept eaves, pine trees, soft morning mist',
      action: 'no figures; autumn light on the freshly carved stone and a single swept path leading to it', cast: [] },
  },
  {
    id: 'recon-silk-road-caravan', roomId: 'r4', title: 'A caravan on the road east',
    basis: 'Church of the East expansion into Transoxania and China (Iranica; Xi\'an Stele); generic Silk Road scene',
    claimIds: ['c-central-asia', 'c-alopen'],
    spec: { style: STYLE, aspect: '16:9', setting: 'a Central Asian steppe track at dawn with snow mountains far away, a small mud-brick church with a cross-topped dome beside a spring in the middle distance, wind-rippled grass',
      action: 'a line of laden camels and a few tiny travelers far away, seen only from behind and at a great distance as silhouettes, walking toward the sunrise', cast: [] },
  },
  {
    id: 'recon-arghun-letter', roomId: 'r5', title: 'A letter for the king of France, 1289',
    basis: 'Letter of Ilkhan Arghun to Philip IV of France, 1289 (Archives nationales): Mongolian script on parchment with red seals',
    claimIds: ['c-arghun-letter', 'c-barsauma'],
    spec: { style: STYLE, aspect: '16:9', setting: 'a low carved table in an Ilkhanate court tent, a long scroll of parchment unrolled, columns of vertical flowing script that is not legible, several large square red ink seals, a brush and ink stone, silk cushions, lamplight on patterned textiles',
      action: 'no figures; the scroll lies open under a lamp, drying', cast: [] },
  },
  {
    id: 'recon-julfa-lane', roomId: 'r6', title: 'A lane in New Julfa',
    basis: 'New Julfa, Isfahan, from 1606; Vank Cathedral begun 1606; Julfan silk trade (secondary sources); generic street staging',
    claimIds: ['c-vank', 'c-silk', 'c-abbas-resettle'],
    spec: { style: STYLE, aspect: '16:9', setting: 'a narrow sun-baked mud-brick lane in the Armenian quarter of Safavid Isfahan in the 1650s, a tall plain wall with an arched wooden door, a low ribbed dome topped with a cross rising behind the wall, bales of silk stacked on a wooden cart, pomegranate trees, warm afternoon light',
      action: 'no figures; a cart of silk bales waits in the shade by the church wall', cast: [] },
  },
  {
    id: 'recon-urmia-press', roomId: 'r7', title: 'The first press at Urmia',
    basis: 'Justin Perkins, A Residence of Eight Years in Persia (1843): press first set to work 21 November 1840; first vernacular proofs 13 March 1841',
    claimIds: ['c-press-urmia', 'c-perkins-arrival'],
    spec: { style: STYLE, aspect: '16:9', setting: 'a plain whitewashed mission room at Urmia in 1840 with a window looking onto an orchard and snow mountains, a hand printing press with a screw or lever, shallow wooden type cases with rows of metal type in an unfamiliar flowing script, damp printed sheets pegged to a line to dry, an oil lamp',
      action: 'no figures; a first printed page lies on the table beside the press, ink still shining', cast: [] },
  },
];
