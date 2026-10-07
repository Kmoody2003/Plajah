/**
 * Planned reconstruction scenes for the Founding Era dossier. The eleven paintings now exist (foundingRecon.json, Nano Banana Pro via Magnific, reviewed 2026-10-07); the registry entry
 * stays flagged artPending until the film and the rest of the exhibit are finished.
 * Each scene is a labelled reconstruction, never a photograph, and cites the claims it illustrates.
 *
 * This is a topic dossier with no characters, and no photographs exist for this period, so every scene shows a
 * PLACE or an OBJECT. No scene shows a person, a face, a crowd, an enslaved or enslaving figure, a soldier, or
 * any violence against people; the founding era's subject includes slavery and war, so even those scenes show
 * only the empty places (a barn, a field, a wharf, a street of cabins, a burned shell of a building).
 * Details marked "generic" are period-plausible staging, not documented facts; the `basis` of each scene says
 * what it rests on and what is staging. Painters and historians should check the details against museum
 * collections (Independence National Historical Park, Colonial Williamsburg, Monticello, the Architect of the Capitol).
 */
import type { DossierScene } from './douglassScenes';

const STYLE =
  'museum-quality historical reconstruction painting, restrained naturalistic palette, soft period light, painterly but accurate period detail, quiet and dignified mood, no text, no lettering, no signs with legible writing, no people anywhere in the image';

export const foundingScenes: DossierScene[] = [
  {
    id: 'recon-printing-shop', roomId: 'r2', title: 'A colonial printing shop, 1765',
    basis: 'The Stamp Act of 1765 taxed newspapers and legal documents, and Franklin printed "Join, or Die" in the Pennsylvania Gazette in 1754 (Middlekauff; Taylor); generic staging of a printer\'s shop with a wooden hand press and type cases, with no particular shop described in the sources',
    claimIds: ['c-stamp-act', 'c-albany-1754'],
    spec: { style: STYLE, aspect: '16:9', setting: 'a Philadelphia printing shop in 1765, a heavy oak hand press with its screw and platen, slanted wooden type cases with tiny abstract metal type, a rack of newsprint sheets hung to dry on a line with abstract smudged marks that are not legible, an ink ball and a pewter lamp, evening light through small-paned windows',
      action: 'no figures; a freshly pulled sheet lies on the press bed as if the printer has just stepped away', cast: [] },
  },
  {
    id: 'recon-tea-wharf', roomId: 'r2', title: 'Griffin\'s Wharf at dusk, December 1773',
    basis: 'The Boston Tea Party of 16 December 1773, at Griffin\'s Wharf, where about 340 chests of tea were thrown into the harbour (Middlekauff; Taylor); generic staging, shown empty on the evening before or after, with no protest, no crowd and no people',
    claimIds: ['c-tea-party', 'c-coercive'],
    spec: { style: STYLE, aspect: '16:9', setting: 'a Boston wharf in December 1773 at dusk, two tall merchant ships moored with furled sails and bare rigging, wooden crates and chests stacked in a neat pile on the planks (the crates carry faint illegible stencil marks), a rope coil, a lantern on a post, cold grey-blue harbour water with small floating ice and a dusting of snow on the planks, the brick and shingle roofs of the town behind',
      action: 'no figures; a stack of chests stands at the wharf edge in the last light and the water is still', cast: [] },
  },
  {
    id: 'recon-tobacco-barn', roomId: 'r1', title: 'A tobacco barn in the Chesapeake, 1760s',
    basis: 'Tobacco was the basis of the Chesapeake economy and its labour was enslaved (Berlin; Taylor); generic staging of a hanging-barn landscape with no figure shown. The empty scene is deliberate: the people whose labour made it are not painted, and the caption must say whose labour it was',
    claimIds: ['c-slavery-everywhere', 'c-1619'],
    spec: { style: STYLE, aspect: '16:9', setting: 'a Virginia tobacco farm in late summer in the 1760s, a tall weathered wooden drying barn with open slats and rows of tobacco leaves hanging from poles inside, a field of broad-leaved tobacco plants beyond a split-rail fence, a wooden hogshead (barrel) on a sled, a dirt road running to a tidal river with a distant wharf, hazy gold light',
      action: 'no figures; the barn stands open and still in the afternoon light', cast: [] },
  },
  {
    id: 'recon-rice-field', roomId: 'r1', title: 'A flooded rice field in the Carolina lowcountry, 1770s',
    basis: 'South Carolina and Georgia rice and indigo cultivation relied on enslaved labour and, in the Lowcountry, on West African knowledge of rice growing (Berlin; Taylor); generic staging of a tidal rice field with trunk gates and dikes, shown empty',
    claimIds: ['c-slavery-everywhere', 'c-enslaved-1770'],
    spec: { style: STYLE, aspect: '16:9', setting: 'a coastal South Carolina tidal rice plantation in the 1770s, flooded rectangular fields divided by narrow earth dikes, a wooden trunk gate (a sluice) in a dike, young green rice shoots standing in shallow water, bald cypress and live oaks hung with Spanish moss at the edge, a distant raised plantation house above the marsh, early morning mist',
      action: 'no figures; light moves across the still, flooded fields', cast: [] },
  },
  {
    id: 'recon-assembly-room', roomId: 'r8', title: 'The Assembly Room of the Pennsylvania State House, September 1787',
    basis: 'The Constitutional Convention met from 25 May to 17 September 1787, mostly in the Pennsylvania State House (Independence Hall), with doors closed (Beeman; Madison\'s notes); generic staging of the ground-floor Assembly Room with its green-covered tables and a tall presiding chair. The upper-floor "Long Room" was not where the delegates voted. Details of the furnishings are as restored by the National Park Service and should be checked against museum records',
    claimIds: ['c-convention', 'c-secrecy-notes'],
    spec: { style: STYLE, aspect: '16:9', setting: 'the large high-ceilinged Assembly Room of the Pennsylvania State House in Philadelphia in September 1787, tall arched windows with their shutters partly closed, rows of small wooden tables covered in green baize, each with a quill, an inkwell and loose papers, a raised dais with a tall chair carved with a sun on its back, empty wooden chairs pushed back at angles, warm late-summer light in long bars across the floor',
      action: 'no figures; the room is empty at the end of a long session, chairs pushed back and papers left on the tables', cast: [] },
  },
  {
    id: 'recon-philadelphia-street', roomId: 'r8', title: 'A Philadelphia street, summer 1787',
    basis: 'Philadelphia in 1787 was the largest city in the United States, a brick city on a grid, hot and crowded during the Convention (Beeman); generic staging after Birch\'s Views of Philadelphia (1798, shown in the exhibit) of a street of brick row houses, with the State House steeple in the distance; no people, carriages or animals',
    claimIds: ['c-convention'],
    spec: { style: STYLE, aspect: '16:9', setting: 'a Philadelphia street in July 1787, rows of red brick three-storey houses with white marble steps, cellar hatches and green wooden shutters, a cobbled roadway with a drainage gutter down the middle, a brick footpath lined with trees on both sides, a street pump and a lamp on a post, the State House tower far down the street (painted with the white wooden steeple of the 1828 restoration; the tower in 1787 carried a low hipped roof, so this is a known anachronism), dry heat haze and shade under the trees',
      action: 'no figures; shutters are closed against the heat and the street is empty and quiet', cast: [] },
  },
  {
    id: 'recon-survey-table', roomId: 'r7', title: 'A surveyor\'s table and chain, 1785',
    basis: 'The Land Ordinance of 1785 laid out the lands north of the Ohio River in square townships by survey, and the Northwest Ordinance followed in 1787 (Wood; the Avalon Project text); generic staging with a Gunter\'s chain and compass and a blank, abstract plat, with no map detail that could be read as Native or American claims',
    claimIds: ['c-land-ord', 'c-nw-art3'],
    spec: { style: STYLE, aspect: '16:9', setting: 'a rough wooden table in a log survey office in 1785, a long measuring chain of iron and brass links partly coiled on the table and trailing over its edge, a brass pocket compass and a wooden sighting rule lying on a large paper plat with abstract grid squares and soft watercolour wash that is not legible, a quill and an inkwell, two candles, red-and-white marking poles leaning against the log walls, low light through a small window',
      action: 'no figures; the measuring chain lies half uncoiled across the unfinished plat', cast: [] },
  },
  {
    id: 'recon-capitol-construction', roomId: 'r12', title: 'The Capitol under construction, about 1800',
    basis: 'The federal city on the Potomac was built over a decade from 1791, with the north wing of the Capitol ready for Congress in 1800, and its workforce included many enslaved people hired from their owners (Architect of the Capitol; White House Historical Association; the exhibit grades this probable); generic staging of an unfinished stone building with scaffolding and a muddy lane, shown empty',
    claimIds: ['c-federal-city'],
    spec: { style: STYLE, aspect: '16:9', setting: 'the unfinished United States Capitol on its hill in 1800, a single completed pale sandstone wing with tall windows beside an unbuilt site of stacked cut stone blocks, wooden scaffolding and timber derricks with ropes, a muddy unpaved lane with wheel ruts, piles of bricks and timber, a few stumps of cleared trees, wide open ground and the Potomac marshes beyond, low morning light',
      action: 'no figures; the tools are laid down for the night and the site is silent', cast: [] },
  },
  {
    id: 'recon-keelboat-journal', roomId: 'r13', title: 'A keelboat and a field journal on the Missouri, 1804',
    basis: 'The Corps of Discovery ascended the Missouri in a keelboat and pirogues from May 1804, and the captains kept journals, among them an elkskin-bound journal (the Lewis and Clark Journals, ed. Moulton); generic staging of the boat and a writing desk, shown empty, with no member of the expedition and no Native person depicted',
    claimIds: ['c-lewis-clark', 'c-louisiana'],
    spec: { style: STYLE, aspect: '16:9', setting: 'the muddy bank of the Missouri River at dawn in May 1804, a long keelboat with a raised plank deck, a small cabin at the stern, a single mast with a furled square sail and long oars laid along the deck, moored by a rope to a cottonwood in fresh spring leaf, one small wooden pirogue drawn up on the gravel, a rough wooden field table on the bank holding an open leather-bound journal whose faint ink lines are not legible, a quill, a brass compass and a brass sextant, green willows and prairie grass beside the broad brown river, pale morning mist',
      action: 'no figures; the journal lies open on the field desk with the quill beside it and the river runs on', cast: [] },
  },
  {
    id: 'recon-mulberry-row', roomId: 'r14', title: 'Mulberry Row and the mountaintop house, Monticello, about 1800',
    basis: 'Monticello\'s house sat above Mulberry Row, the street of workshops and cabins where enslaved people lived and worked, and more than 610 people were enslaved by Jefferson in his lifetime, about 130 at a time at Monticello (Thomas Jefferson Foundation); generic staging after the Foundation\'s published reconstructions, which should be checked against the archaeological record; shown with no people, so the foreground is the street of cabins and the house is the distant crown of the hill',
    claimIds: ['c-monticello-enslaved', 'c-archaeology'],
    spec: { style: STYLE, aspect: '16:9', setting: 'a Virginia mountaintop in 1800, a long dirt street in the foreground lined with small log and plank cabins with stone chimneys and low workshops with open doors, tools hung on the walls, a split-rail fence, and above the street at the top of the hill a red brick house with a white portico and a low dome (Monticello), in a clearing of mown lawn and trees, the blue Virginia hills receding behind, gold evening light',
      action: 'no figures; smoke rises from one cabin chimney and the cabins stand open and quiet in the foreground while the house sits above', cast: [] },
  },
  {
    id: 'recon-burned-presidents-house', roomId: 'r15', title: 'The burned President\'s House, August 1814',
    basis: 'On 24 and 25 August 1814 the British burned the Capitol, the President\'s House and other public buildings in Washington (Hickey; Stagg); the walls of the President\'s House survived and were rebuilt; generic staging of the scorched sandstone shell, shown empty after the raid with no soldiers, no civilians and no violence',
    claimIds: ['c-washington-burned', 'c-portrait'],
    spec: { style: STYLE, aspect: '16:9', setting: 'the pale sandstone shell of the President\'s House in Washington in late August 1814, the walls blackened with soot, the window openings empty and open to the sky, the roof gone and charred beams hanging inside, a wet muddy lawn after a storm with fallen branches and scattered shards of glass, heavy grey clouds clearing to a thin yellow light low over the Potomac',
      action: 'no figures; the scorched shell stands silent on the wet lawn after the storm', cast: [] },
  },
];
