/**
 * Reconstruction scenes for the Founding Era dossier. The eleven place scenes and twelve named-founder scenes (2026-10-07) are painted (foundingRecon.json, Nano Banana Pro via Magnific); the registry entry
 * stays flagged artPending until the film and the rest of the exhibit are finished.
 * Each scene is a labelled reconstruction, never a photograph, and cites the claims it illustrates.
 *
 * The first eleven scenes (empty `cast`) show a PLACE or an OBJECT: no person, face, crowd, enslaved or enslaving figure,
 * soldier, or violence. The last twelve scenes (`cast` names a founder) show ONE named founder with a
 * face, which the owner approved on 2026-10-07 because each has surviving PAINTED portraits (CharacterBible.paintedLikeness:
 * the silhouette rule for people without photographs is bypassed only for them). Every other human in those scenes is
 * from behind, a distant silhouette, or absent; there are no enslaved people, no Native people, no violence, no flags,
 * and no readable text. The likeness is a reconstruction from the portraits (not a photograph, not a documented pose);
 * where the only portraits show the sitter years older, the basis says so.
 * Place-scene rules: the founding era's subject includes slavery and war, so even those scenes show
 * only the empty places (a barn, a field, a wharf, a street of cabins, a burned shell of a building).
 * Details marked "generic" are period-plausible staging, not documented facts; the `basis` of each scene says
 * what it rests on and what is staging. Painters and historians should check the details against museum
 * collections (Independence National Historical Park, Colonial Williamsburg, Monticello, the Architect of the Capitol).
 */
import type { DossierScene } from './douglassScenes';

const STYLE_FOUNDER =
  'museum-quality oil painting in the manner of period American history painting (John Trumbull, John Singleton Copley, Charles Willson Peale), restrained naturalistic palette of umber, ochre, slate and muted red, soft period light, painterly but accurate period detail, quiet and dignified mood, an eighteenth-century history painting and not a photograph, only the one named figure shows a face, no readable text, no lettering, no flags';

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

/** Twelve named-founder scenes. Faces are painted only for the cast member; see the header and CharacterBible.paintedLikeness. */
const founderScenes: DossierScene[] = [
  {
    id: 'recon-franklin-paris-court-1778', roomId: 'r5', title: 'Franklin in a Paris salon, 1778',
    basis: 'Franklin was the American commissioner in France; the treaties of alliance and commerce with France were signed on 6 February 1778 (c-french-alliance), and he was widely noted for dressing plainly in France, in a brown cloth coat and a fur cap, rather than in court dress (Wood; Schiff). Likeness reconstructed from Duplessis\'s portrait of about 1778 to 1785 (public domain; the exhibit asset a-franklin-duplessis), made when he was in his seventies, so the age matches. The salon, its furniture and the single figure are generic staging, not a documented room, and the fur cap is shown on the table, not worn, so that the face matches the portrait. No other person is shown',
    claimIds: ['c-french-alliance', 'c-peace-1783'],
    spec: { style: STYLE_FOUNDER, aspect: '16:9',
      setting: 'a plain Parisian salon in 1778, tall pale grey-green panelled walls, two tall windows with soft winter daylight, a polished writing table with sheets of paper covered in illegible script, an inkwell and quill, a round table with a plain brown fur cap resting on it, a simple upholstered armchair, a wide gilt-framed mirror reflecting only the empty room, candles in brass sconces, a parquet floor, no other people anywhere',
      action: 'seated in the armchair, turned three-quarters to the viewer, resting one hand on the writing table and looking calmly toward the viewer; he is the only person in the room',
      cast: [{ characterId: 'franklin', age: 72, eraKey: '1778' }] },
  },
  {
    id: 'recon-jefferson-graff-house-1776', roomId: 'r4', title: 'Jefferson drafting at the Graff House, June 1776',
    basis: 'Jefferson drafted the Declaration in about two or three weeks in Philadelphia (c-drafting), asked to by the Committee of Five when he was thirty-three (c-committee); he lodged on the second floor of the new brick house of the bricklayer Jacob Graff Jr. at Seventh and Market Streets and wrote on a portable writing box of his own design (Monticello and Independence National Historical Park record this). No portrait of Jefferson exists from before 1786, when he was 43 (Mather Brown, public domain); the earliest reliable likeness is therefore ten years older. Decision: the figure is shown in a reduced-likeness three-quarter view from behind and above, the face turned away and in shadow, so that no younger face is invented; the later Brown, Trumbull and Peale portraits inform only his hair, build and profile. The room is generic staging after the reconstructed Graff House, and no other person is shown',
    claimIds: ['c-drafting', 'c-committee'],
    spec: { style: STYLE_FOUNDER, aspect: '16:9',
      setting: 'a plain second-floor room at the Graff House, a new brick house at Seventh and Market Streets in Philadelphia, in June 1776, whitewashed plaster walls, a tall sash window with shutters half open onto a brick street in warm early-summer light, a narrow bed with a plain coverlet, a small table, a swivelling plain wooden chair, a small slanted portable wooden writing box on his knees with sheets of paper covered in illegible script, a quill and an inkwell, a candle in a brass stick, no other people anywhere',
      action: 'seated at the window, seen in three-quarter view from behind and slightly above so that his face is turned away toward the window and mostly in shadow, bent over the writing box with a quill in his hand, absorbed in his writing',
      cast: [{ characterId: 'jefferson', age: 33, eraKey: '1776' }] },
  },
  {
    id: 'recon-adams-congress-1776', roomId: 'r3', title: 'Adams rising to speak in the State House, 1776',
    basis: 'Adams argued for independence in the Second Continental Congress at the Pennsylvania State House in Philadelphia; on 7 June 1776 Lee moved the resolution for independence (c-lee-resolution) and on 11 June Adams was named to the Committee of Five (c-committee). No description of a particular speech or its pose survives; the posture and room are generic staging. The earliest portrait of Adams is Blyth\'s pastel of 1766 (when he was 31, public domain) and the exhibit\'s likeness is Stuart\'s, painted when he was about 65; the face is a reconstruction between the two. The other delegates are shown only from behind, in a distant, dim silhouette and without faces, as the painted mass of the room',
    claimIds: ['c-lee-resolution', 'c-committee'],
    spec: { style: STYLE_FOUNDER, aspect: '16:9',
      setting: 'the high-ceilinged Assembly Room of the Pennsylvania State House in Philadelphia in 1776, tall arched windows letting in strong afternoon light, rows of small green-baize-covered tables, a raised dais with a tall carved chair behind him, a number of delegates seated in rows at the tables seen only from behind in dark coats and powdered hair with no faces visible, the far side of the room in soft shadow, no flags',
      action: 'standing at his table in the middle of the room, turned three-quarters to the viewer and looking toward the chair, one hand lightly raised as he begins to speak; he is the only person whose face is visible',
      cast: [{ characterId: 'adams', age: 40, eraKey: '1776' }] },
  },
  {
    id: 'recon-washington-valley-forge-1778', roomId: 'r5', title: 'Washington in winter quarters, Valley Forge, 1778',
    basis: 'The Continental Army spent the winter of 1777-78 at Valley Forge, Pennsylvania, in hunger, cold and disease (c-valley-forge), and Congress had chosen Washington as its commander in 1775 (c-congress2). He lodged in a stone house rather than a hut, so the log-walled room shown is a generic staging of a camp interior, not his quarters; the soldiers are not shown. Likeness reconstructed from Charles Willson Peale\'s portraits of 1772 (the earliest authenticated, at Washington and Lee University) and about 1779 (Washington at Princeton, aged 47, closest in age), both public domain, with Stuart\'s portrait of 1796 (the exhibit asset a-washington-stuart) for the older face; at age 46 the likeness is a reconstruction. No other person is shown',
    claimIds: ['c-valley-forge', 'c-congress2'],
    spec: { style: STYLE_FOUNDER, aspect: '16:9',
      setting: 'a plain winter-quarters room with rough squared log walls chinked with clay at Valley Forge in 1778, a stone and clay fireplace with a low fire, a rough plank campaign table with papers covered in illegible script and a candle in a tin holder, a folding camp stool, a bare plank floor, a single small window with grey snowy light and a bare winter tree outside, a heavy cloak hung on a peg, no other people anywhere',
      action: 'seated at the rough table with his body turned toward the fire, his face in three-quarter view lit by the candle and the window, looking thoughtfully toward the viewer, quill in hand; he is the only person in the room',
      cast: [{ characterId: 'washington', age: 46, eraKey: '1778' }] },
  },
  {
    id: 'recon-madison-convention-1787', roomId: 'r8', title: 'Madison taking notes at the Convention, 1787',
    basis: 'The Constitutional Convention met in the Pennsylvania State House from 25 May to 17 September 1787 (c-convention); the delegates met behind closed doors, and the fullest record is the notes kept by Madison, who sat at the front and wrote throughout (c-secrecy-notes). His seat was at the front near the presiding chair; the angle, the furniture and the dim shapes of the other delegates are generic staging. The earliest reliable likenesses are Charles Willson Peale\'s miniature of 1783, when he was 32, and Stuart\'s portrait of about 1805 (the exhibit asset a-madison-stuart), so the 36-year-old face is a reconstruction between them. The other delegates are shown only from behind, without faces',
    claimIds: ['c-convention', 'c-secrecy-notes'],
    spec: { style: STYLE_FOUNDER, aspect: '16:9',
      setting: 'the Assembly Room of the Pennsylvania State House in Philadelphia in September 1787, tall arched windows with the shutters partly closed and warm bars of light, a green-baize-covered table at the front of the room near a raised dais with a tall carved chair, in the foreground the backs of several delegates in dark coats and powdered hair, seen only from behind and dim with no faces visible, no flags',
      action: 'seated at the front table facing across the room toward the viewer, bent over a notebook writing steadily with a quill, glancing up toward the room; the delegates in the foreground are in dim silhouette from behind, and he is the only person whose face is visible',
      cast: [{ characterId: 'madison', age: 36, eraKey: '1787' }] },
  },
  {
    id: 'recon-hamilton-treasury-1790', roomId: 'r10', title: 'Hamilton at his desk, Treasury, 1790',
    basis: 'Hamilton\'s Report on Public Credit of 14 January 1790 proposed that the federal government pay its war debts and assume the states\' (c-hamilton-plan), and as Secretary of the Treasury he sat in a cabinet that Washington formed (c-precedents). The desk, the ledgers and the room are generic staging of a Treasury office in New York, then the capital; no particular room is documented. Only one reference portrait is in the exhibit (Trumbull\'s of 1806, when Hamilton was 51); Trumbull\'s full-length of 1792 (public domain, he was 37, the closest in age) was also used as a reference, but its face is small, so the 35-year-old face is a reconstruction with less certainty than the others. No other person is shown',
    claimIds: ['c-hamilton-plan', 'c-precedents'],
    spec: { style: STYLE_FOUNDER, aspect: '16:9',
      setting: 'a plain Treasury office in New York in 1790, a large writing desk covered in tall stacks of leather-bound ledgers and bundled reports tied with tape, sheets of paper covered in illegible columns of figures, a brass inkwell and quill, a high-backed chair, a tall window with a view of brick rooftops in clear grey-gold light, a globe on a stand, shelves of bound volumes, a candle in a brass stick, no other people anywhere',
      action: 'seated at the desk turned three-quarters to the viewer, a quill in his hand and a ledger open before him, his head raised as he considers a line of figures; he is the only person in the room',
      cast: [{ characterId: 'hamilton', age: 35, eraKey: '1790' }] },
  },
  {
    id: 'recon-abigail-adams-letter-1776', roomId: 'r4', title: 'Abigail Adams writing to John, Braintree, March 1776',
    basis: 'On 31 March 1776 Abigail Adams wrote from Braintree, Massachusetts, to John in Philadelphia: "I desire you would Remember the Ladies" (c-abigail, from the Massachusetts Historical Society edition), within a legal order in which a married woman had no separate legal identity (c-coverture). The room, the candle and the writing posture are generic staging after the Adams family\'s farmhouse; the letter on the table is shown only as illegible script. Her only portrait from near that time is Benjamin Blyth\'s pastel of about 1766 (public domain, she was about 22, the exhibit asset a-abigail-adams, a black-and-white photograph of the pastel); at 31 she is a reconstruction nine years older than the pastel, painted (regenerated 2026-10-07 to read as a woman of about 30 rather than 40 or older) from the Blyth face structure, with Gilbert Stuart\'s portrait of her at about 55 or older (c. 1800-1815, National Gallery of Art, CC0) used as a second reference for bone structure only and not for age. It is a reconstruction of her likeness, not a documented portrait of her at 31. No other person is shown',
    claimIds: ['c-abigail', 'c-coverture'],
    spec: { style: STYLE_FOUNDER, aspect: '16:9',
      setting: 'a small plain parlour in the Adams farmhouse at Braintree, Massachusetts, in March 1776, wide pine floorboards, a plain wooden writing table with one lit candle in a brass stick, an inkwell and a goose quill, a sheet of paper covered in illegible script, a simple ladder-back chair, a small-paned window dark with late evening, a quiet fire glowing in a small brick hearth, no other people anywhere',
      action: 'seated at the table in the candlelight, the quill raised, her face in three-quarter view looking up from the page toward the viewer with a steady, thoughtful expression; she is the only person in the room',
      cast: [{ characterId: 'abigail-adams', age: 31, eraKey: '1776' }] },
  },
  {
    id: 'recon-washington-federal-hall-1789', roomId: 'r10', title: 'Washington\'s oath on the balcony of Federal Hall, 1789',
    basis: 'Washington was chosen unanimously by the electors and took the oath of office on 30 April 1789 on a balcony of Federal Hall in New York City, then the capital (c-inaug), at the start of the precedents he set (c-precedents). He wore a brown suit of American-made broadcloth (as contemporaries noted); the angle and the crowd are generic staging. The painted crowd below is an anonymous mass seen from high above and behind, with no individual faces (the image is cropped to 2140 by 1204 pixels so that the few small faces at its lower edge are not shown), and none of the officials who stood with him is shown. The raised hand is the painter\'s rendering of the oath gesture and is not a documented pose. Likeness from Stuart\'s portraits of 1796 (the exhibit asset a-washington-stuart) and Peale\'s earlier portraits; at 57 he is seven years younger than Stuart\'s sitter, so the face is a reconstruction',
    claimIds: ['c-inaug', 'c-precedents'],
    spec: { style: STYLE_FOUNDER, aspect: '16:9',
      setting: 'the high stone balcony of Federal Hall on Wall Street in New York in 1789, a plain stone balustrade and tall arched columns of the building behind him, spring daylight, far below at a steep downward angle a vast anonymous crowd shown only as a dense dark mass of tiny hat tops and shoulders seen from high above and from behind, painted loosely with no individual faces, rooftops and a church spire beyond, no flags, no banners',
      action: 'standing alone at the balustrade with his body turned toward the street below and his face in three-quarter view toward the viewer, one hand resting on the stone rail and one raised in the oath, grave and composed; he is the only person whose face is visible, and nobody stands near him on the balcony',
      cast: [{ characterId: 'washington', age: 57, eraKey: '1789' }] },
  },
  {
    id: 'recon-washington-farewell-1796', roomId: 'r10', title: 'Washington drafting the Farewell Address, 1796',
    basis: 'Washington\'s Farewell Address was published in a Philadelphia newspaper on 19 September 1796 (c-farewell); he drafted it from his own earlier draft and an earlier one by Madison, with Hamilton\'s help, so the final form is chiefly in Hamilton\'s phrasing (c-farewell-authorship). The desk, the papers and the room are generic staging of the President\'s House in Philadelphia; the manuscript is shown only as illegible script. The likeness follows Stuart\'s portraits of 1796 (the exhibit asset a-washington-stuart), made the same year at the same age of 64, so this is the best-matched of the twelve. No other person is shown',
    claimIds: ['c-farewell', 'c-farewell-authorship'],
    spec: { style: STYLE_FOUNDER, aspect: '16:9',
      setting: 'a plain study in the President\'s House in Philadelphia in 1796, a large mahogany writing desk with sheets of manuscript covered in illegible script, an inkwell and several quills, a pair of steel spectacles, a tall window with soft grey autumn light, a shelf of bound books, a candle in a brass stick, a plain carpet, no other people anywhere',
      action: 'seated at the desk and writing, his face in three-quarter view turned toward the viewer as he pauses with the quill above a page, grave and weary; he is the only person in the room',
      cast: [{ characterId: 'washington', age: 64, eraKey: '1796' }] },
  },
  {
    id: 'recon-jefferson-louisiana-1803', roomId: 'r13', title: 'Jefferson with a map, Monticello, 1803',
    basis: 'The United States bought Louisiana from France for $15 million in a treaty dated 30 April 1803 (c-louisiana), after Jefferson, who had always argued for a narrow reading of the Constitution, doubted that it gave the President the power to buy territory (c-jeff-doubts). He divided his time between Washington and Monticello; the table, the room and the map are generic staging, the map shown only as abstract unreadable lines with no names and no people on it. The likeness follows Rembrandt Peale\'s portrait of 1800 (the exhibit asset a-jefferson-peale), made three years earlier, so the age is close. No other person is shown',
    claimIds: ['c-louisiana', 'c-jeff-doubts'],
    spec: { style: STYLE_FOUNDER, aspect: '16:9',
      setting: 'a plain high-ceilinged room at Monticello in 1803, a large wooden table covered by a big hand-drawn map of a continent drawn only as abstract unreadable pale lines and washes of colour without any words, a pair of brass dividers, a small brass telescope, a quill, tall windows with a green lawn and a view of blue Virginia hills beyond, a plain polished floor, afternoon light, no other people anywhere',
      action: 'standing at the table and leaning on one hand over the map, his face in three-quarter view turned toward the viewer, a measuring pair of dividers in the other hand, thoughtful and a little doubtful; he is the only person in the room',
      cast: [{ characterId: 'jefferson', age: 60, eraKey: '1803' }] },
  },
  {
    id: 'recon-madison-1814', roomId: 'r15', title: 'Madison after the burning of Washington, 1814',
    basis: 'On 24 August 1814 a British force burned the Capitol, the President\'s House, the Treasury and other public buildings while Madison and the government fled (c-washington-burned); the exhibit grades the story of Dolley Madison saving the Washington portrait as contested (c-portrait). The composition is generic staging: Madison is shown a few days after, in a plain coat, at a table on a rise with the scorched shell of the President\'s House far in the distance. No other person is shown, and no soldiers, civilians, violence or dead. The likeness follows Stuart\'s portrait of about 1805 (the exhibit asset a-madison-stuart), nine years earlier, so the age is close',
    claimIds: ['c-washington-burned', 'c-portrait'],
    spec: { style: STYLE_FOUNDER, aspect: '16:9',
      setting: 'a grassy rise in Washington in late August 1814 after a storm, a plain wooden table holding unrolled papers covered in illegible script and an inkwell, a wet muddy lawn and low heavy grey-yellow clouds, and far in the distance across the grass the pale scorched sandstone shell of the President\'s House with open blackened window openings and no roof, a thin line of smoke rising from it, no people anywhere else, no soldiers, no flags',
      action: 'standing at the table in the foreground with one hand resting on the papers and his face in three-quarter view toward the viewer, sombre and tired, glancing toward the ruined building in the distance; he is the only person in the picture',
      cast: [{ characterId: 'madison', age: 63, eraKey: '1814' }] },
  },
  {
    id: 'recon-adams-quincy-1801', roomId: 'r12', title: 'Adams at his desk, early 1801',
    basis: 'Adams lost the election of 1800 and, on the morning of Jefferson\'s inauguration on 4 March 1801, left Washington before sunrise, after naming judges in his last weeks (c-adams-left); he had won the election of 1796 by 71 electoral votes to 68 (c-adams-elected). The study, a packed trunk and the winter light are generic staging of the unfinished President\'s House in Washington City (his home was at Quincy, Massachusetts, where he returned), and the papers are illegible script. Likeness from Gilbert Stuart\'s portrait of about 1800 to 1815 (the exhibit asset a-adams-stuart), which matches his age of 65. No other person is shown',
    claimIds: ['c-adams-left', 'c-adams-elected'],
    spec: { style: STYLE_FOUNDER, aspect: '16:9',
      setting: 'a bare plain study in the unfinished President\'s House in Washington City in February 1801, a plain writing desk with sheets of paper and an inkwell, bundled papers tied with ribbon, a packed leather travelling trunk and a folded cloak by the door, a small fire in the fireplace, a tall window with pale winter light on a muddy lawn, a candle in a brass stick, no other people anywhere',
      action: 'seated at the desk and writing, his face in three-quarter view toward the viewer as he pauses with the quill, weary and resolute, a cloak and trunk nearby as if about to leave; he is the only person in the room',
      cast: [{ characterId: 'adams', age: 65, eraKey: '1801' }] },
  },
];

foundingScenes.push(...founderScenes);
