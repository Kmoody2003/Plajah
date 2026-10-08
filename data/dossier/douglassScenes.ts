/**
 * Reconstruction scenes for the Douglass dossier. Each is a labelled reconstruction, never a
 * photograph, and cites the claim it illustrates. Only documented persons with a CharacterBible
 * are depicted; other historical figures (e.g. Lincoln) are deliberately not shown.
 * Ages below the earliest documented portrait yield silhouette/back-view compositions.
 */
import type { SceneSpec } from '../../services/dossier/characterGateway';

export interface DossierScene {
  id: string;
  roomId: string;
  title: string;
  basis: string;
  claimIds: string[];
  spec: SceneSpec;
}

const STYLE =
  'museum-quality historical reconstruction painting, restrained naturalistic palette, soft period lighting, painterly but accurate period detail, no text';

export const douglassScenes: DossierScene[] = [
  {
    id: 'recon-shipyard', roomId: 'r1', title: 'Letters on the shipyard timbers',
    basis: 'Narrative of the Life of Frederick Douglass (1845), ch. 7', claimIds: ['c-reading', 'c-baltimore'],
    spec: { style: STYLE, aspect: '16:9', setting: 'a Baltimore shipyard in the 1830s, stacked timber, ropes, harbor light',
      action: 'draws loose chalk strokes and marks onto a timber plank, crouched low, the marks are abstract and not legible as words', cast: [{ characterId: 'douglass', age: 14, eraKey: '1840s' }] },
  },
  {
    id: 'recon-covey-field', roomId: 'r1', title: 'The field at dusk',
    basis: 'Narrative (1845), ch. 10; the struggle with Edward Covey, 1834', claimIds: ['c-covey'],
    spec: { style: STYLE, aspect: '16:9', setting: 'a Maryland farm field at dusk, split-rail fence, long shadows',
      action: 'stands upright and defiant facing away from the viewer, fists clenched, a second figure out of focus ahead; no violence shown', cast: [{ characterId: 'douglass', age: 16 }] },
  },
  {
    id: 'recon-escape', roomId: 'r1', title: 'The train north',
    basis: 'Life and Times (1881): escape of 3 September 1838', claimIds: ['c-escape'],
    spec: { style: STYLE, aspect: '16:9', setting: 'a Baltimore railroad platform in 1838, a tiny early 1830s steam locomotive with a vertical boiler and a tall funnel stack like the Tom Thumb, short wooden stagecoach-style carriages, oil lanterns, open empty sky and open countryside with no poles, no wires, no power lines, early morning',
      action: 'in a sailor\'s red shirt and flat cap, steps up to a railway car, seen from behind', cast: [{ characterId: 'douglass', age: 20 }] },
  },
  {
    id: 'recon-nantucket', roomId: 'r2', title: 'Nantucket, August 1841',
    basis: 'Life and Times (1881): first public address at the Nantucket convention', claimIds: ['c-nantucket'],
    spec: { style: STYLE, aspect: '16:9', setting: 'the Nantucket Atheneum hall in 1841, rows of listeners, lamplight',
      action: 'stands at the speaker\'s lectern in silhouette, addressing an attentive crowd', cast: [{ characterId: 'douglass', age: 23 }] },
  },
  {
    id: 'recon-printing-office', roomId: 'r3', title: 'The North Star office',
    basis: 'My Bondage and My Freedom (1855); founding of The North Star, Rochester, 1847', claimIds: ['c-northstar'],
    spec: { style: STYLE, aspect: '16:9', setting: 'a Rochester, New York printing office in 1847, wooden type cases with metal type, an iron Washington hand press with a lever, sheets of damp newsprint hung to dry, an oil lamp',
      action: 'holds up a freshly printed newspaper proof to read it by oil lamplight, serious and focused', cast: [{ characterId: 'douglass', age: 29, eraKey: '1840s' }] },
  },
  {
    id: 'recon-fourth', roomId: 'r3', title: 'Corinthian Hall, 5 July 1852',
    basis: '"What to the Slave Is the Fourth of July?" (1852)', claimIds: ['c-fourth'],
    spec: { style: STYLE, aspect: '16:9', setting: 'Corinthian Hall in Rochester, New York, 1852, a packed audience, gaslight, flags',
      action: 'addresses the audience from the platform, one hand raised, paper manuscript on the lectern', cast: [{ characterId: 'douglass', age: 34, eraKey: '1840s' }] },
  },
  {
    id: 'recon-anteroom', roomId: 'r4', title: 'Waiting to see the President',
    basis: 'Life and Times (1881): White House meeting with Lincoln, August 1863; Lincoln deliberately not depicted', claimIds: ['c-lincoln'],
    spec: { style: STYLE, aspect: '16:9', setting: 'a White House anteroom in 1863, tall windows, heavy curtains, a closed double door, plain unbroken plaster walls with nothing mounted on them except two brass candle sconces, a continuous floor of wide wooden planks with no grates or openings of any kind',
      action: 'sits upright with his hat on his knee, waiting to be called, composed and resolute', cast: [{ characterId: 'douglass', age: 45, eraKey: '1860s' }] },
  },
  {
    id: 'recon-cedarhill', roomId: 'r5', title: 'The study at Cedar Hill',
    basis: 'National Park Service, Cedar Hill; Life and Times (revised 1892)', claimIds: ['c-cedarhill', 'c-selfmade'],
    spec: { style: STYLE, aspect: '16:9', setting: 'a Victorian study at Cedar Hill in the 1880s, bookshelves, a writing desk, window overlooking Washington',
      action: 'sits at a writing desk, pen in hand, reflecting before writing', cast: [{ characterId: 'douglass', age: 66, eraKey: '1880s' }] },
  },
  // Faceless replacements for the two scenes that showed Douglass's face: the old ids above stay valid.
  {
    id: 'recon-lectern-empty', roomId: 'r2', title: 'The lectern at Nantucket, 1841',
    basis: 'Life and Times (1881): first public address at the Nantucket convention, August 1841; generic staging of an empty meeting hall, no person depicted', claimIds: ['c-nantucket'],
    spec: { style: STYLE, aspect: '16:9', setting: 'the plain meeting hall of the Nantucket Atheneum in August 1841, rows of empty wooden benches, a simple wooden lectern on a low raised platform, whale-oil lamps with a warm glow, tall multi-pane windows, painted plaster walls, a bare wooden floor, completely empty of people, no banners, no signs, no lettering',
      action: 'no figures; the hall stands quiet in lamplight, a folded paper resting on the lectern', cast: [] },
  },
  {
    id: 'recon-study-desk', roomId: 'r5', title: 'The writing desk at Cedar Hill',
    basis: 'National Park Service, Cedar Hill; Life and Times (revised 1892); generic staging of the study of the 1880s, no person depicted', claimIds: ['c-cedarhill', 'c-selfmade'],
    spec: { style: STYLE, aspect: '16:9', setting: 'a Victorian study at Cedar Hill in 1885, wall-to-wall bookshelves, a heavy wooden writing desk with an open book, a steel-nibbed pen in an inkwell, a pair of wire spectacles and loose manuscript pages with no legible writing, a kerosene lamp, an empty leather chair pushed slightly back, a window overlooking the Anacostia hills and the Washington skyline, completely empty of people',
      action: 'no figures; the pen rests across the page as if the writer has just stepped away', cast: [] },
  },
];
