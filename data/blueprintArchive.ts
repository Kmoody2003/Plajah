// ─────────────────────────────────────────────────────────────────────────────
// The Blueprint Archive — curated entries from the Library of Congress
// HABS / HAER / HALS collection.
//
//   HABS · Historic American Buildings Survey      (est. 1933, buildings)
//   HAER · Historic American Engineering Record    (est. 1969, engineering)
//   HALS · Historic American Landscapes Survey     (est. 2000, landscapes)
//
// The surveys' measured drawings, large-format photographs and written
// histories are held by the LoC Prints & Photographs Division and carry no
// known copyright restriction — they are U.S. government works in the public
// domain, downloadable at full resolution.
//
//   Collection: https://www.loc.gov/pictures/collection/hh/
//   Rights:     https://www.loc.gov/pictures/collection/hh/res.html
//
// ── Provenance ───────────────────────────────────────────────────────────────
// Every entry was resolved against a live API — none of the identifiers below
// were constructed by hand. Two routes were used:
//
//   1. The LoC Pictures API, which returns the item page and its own image
//      tiles directly:
//        GET https://www.loc.gov/pictures/search/?q=<name>&co=hh&fo=json&c=40
//      Keep results whose `pk` contains `.sheet.` — those are measured
//      drawings; `.photos.` entries are survey photographs.
//
//   2. The Wikimedia Commons API, which mirrors the same public-domain sheets
//      and records the originating LoC item URL in each file's `Credit`
//      metadata field:
//        GET https://commons.wikimedia.org/w/api.php?action=query
//              &generator=search&gsrsearch=intitle:"sheet 1 of" <name>
//              &gsrnamespace=6&prop=imageinfo&iiprop=url|extmetadata&format=json
//
// Entries sourced via route 2 carry `commonsFile` and render through Commons'
// Special:FilePath endpoint (see `blueprintImage` below).
//
// ── Extending this file ──────────────────────────────────────────────────────
// Do NOT hand-write locUrl values or survey ids. The ids (`il0039`) and sheet
// numbers are not derivable from a building's name, and a guessed id silently
// resolves to a completely different structure — searching by name alone is
// also unsafe (a search for "Monticello" returns an Iowa bridge, "Lincoln
// Memorial" a Tennessee grist mill). Always confirm the resolved record's own
// title names the structure you intend before adding it.
//
// The LoC API is rate limited to roughly 20 requests per minute and will block
// a noisy client for an hour; space requests ~10s apart and cache responses.
// ─────────────────────────────────────────────────────────────────────────────

export type SurveyKind = 'HABS' | 'HAER' | 'HALS';

export const BLUEPRINT_SURVEYS: SurveyKind[] = ['HABS', 'HAER', 'HALS'];

export const HABS_COLLECTION_URL = 'https://www.loc.gov/pictures/collection/hh/';
export const HABS_RIGHTS_URL = 'https://www.loc.gov/pictures/collection/hh/res.html';

export interface Blueprint {
  id: string;
  title: string;
  /** Architect, engineer or builder of the structure itself. */
  architectOrBuilder?: string;
  location: string;
  /** Year the structure was built or completed. */
  year?: string;
  survey: SurveyKind;
  /** Library of Congress item page for the specific sheet. */
  locUrl: string;
  /** LoC 150px thumbnail (entries resolved straight from the LoC API). */
  thumbUrl?: string;
  /** LoC display-resolution JPEG (entries resolved straight from the LoC API). */
  imageUrl?: string;
  /**
   * Wikimedia Commons file name for the same public-domain sheet. When set,
   * images are served through Commons' Special:FilePath endpoint instead —
   * see `blueprintImage()`.
   */
  commonsFile?: string;
  /** LoC call number, e.g. 'HABS ILL,16-CHIG,33-'. */
  callNumber?: string;
  /** Who drew this sheet, where the survey recorded it. */
  delineator?: string;
  /** Year the survey team measured and drew the structure. */
  surveyDate?: string;
  /** What this particular sheet shows. */
  sheetLabel?: string;
  blurb: string;
}

/**
 * Resolve a displayable image URL for a blueprint at the requested width.
 * Commons-sourced sheets go through Special:FilePath, which redirects to a
 * rendered thumbnail of the (often enormous) source scan.
 */
export function blueprintImage(bp: Blueprint, width: 420 | 1280): string | undefined {
  if (bp.commonsFile) {
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(bp.commonsFile)}?width=${width}`;
  }
  return width <= 420 ? (bp.thumbUrl || bp.imageUrl) : (bp.imageUrl || bp.thumbUrl);
}

export const BLUEPRINTS: Blueprint[] = [
  // ── HABS · buildings ───────────────────────────────────────────────────────
  {
    id: 'independence-hall',
    title: 'Independence Hall',
    architectOrBuilder: 'Andrew Hamilton and Edmund Woolley',
    location: '500 Chestnut Street, Philadelphia, Philadelphia County, Pennsylvania',
    year: '1753',
    survey: 'HABS',
    locUrl: 'https://www.loc.gov/pictures/item/pa0939.sheet.00001a/',
    commonsFile: 'Independence Hall Complex, Independence Hall, 500 Chestnut Street, Philadelphia, Philadelphia County, PA HABS PA,51-PHILA,6- (sheet 1 of 45).png',
    callNumber: 'HABS PA,51-PHILA,6-',
    sheetLabel: 'Title sheet, from a forty-five-sheet survey set',
    blurb: 'A Georgian statehouse that became the room where the Declaration of Independence and the Constitution were debated. The survey ran to forty-five sheets — an unusually complete record that has since guided every restoration of the building.',
  },
  {
    id: 'robie-house',
    title: 'Frederick C. Robie House',
    architectOrBuilder: 'Frank Lloyd Wright',
    location: '5757 Woodlawn Avenue, Chicago, Cook County, Illinois',
    year: '1910',
    survey: 'HABS',
    locUrl: 'https://www.loc.gov/pictures/collection/hh/item/il0039.sheet.00016a/',
    thumbUrl: 'https://tile.loc.gov/storage-services/service/pnp/habshaer/il/il0000/il0039/sheet/00016_150px.jpg',
    imageUrl: 'https://tile.loc.gov/storage-services/service/pnp/habshaer/il/il0000/il0039/sheet/00016r.jpg',
    callNumber: 'HABS ILL,16-CHIG,33-',
    delineator: 'R. Goldman',
    surveyDate: '1962',
    sheetLabel: 'First floor plan',
    blurb: 'The definitive Prairie School house. In plan you can read Wright\'s whole argument at once — the hearth as the fixed core, the living and dining rooms flowing around it as one continuous space, and the long cantilevered roofs reaching past the walls to bind the house to the horizontal Midwestern ground.',
  },
  {
    id: 'gamble-house',
    title: 'Gamble House',
    architectOrBuilder: 'Greene & Greene',
    location: '4 Westmoreland Place, Pasadena, Los Angeles County, California',
    year: '1908',
    survey: 'HABS',
    locUrl: 'https://www.loc.gov/pictures/collection/hh/item/ca0279.sheet.00001a/',
    thumbUrl: 'https://tile.loc.gov/storage-services/service/pnp/habshaer/ca/ca0200/ca0279/sheet/00001_150px.jpg',
    imageUrl: 'https://tile.loc.gov/storage-services/service/pnp/habshaer/ca/ca0200/ca0279/sheet/00001r.jpg',
    callNumber: 'HABS CAL,19-PASA,5-',
    sheetLabel: 'Title sheet, from the eleven-sheet survey set',
    blurb: 'The high point of the American Arts and Crafts bungalow. Charles and Henry Greene detailed the house like cabinetry — exposed rafter tails, pegged scarf joints, hand-shaped teak — and the survey drawings record joinery most measured sets would never bother to draw.',
  },
  {
    id: 'unity-temple',
    title: 'Unity Temple',
    architectOrBuilder: 'Frank Lloyd Wright',
    location: '875 Lake Street, Oak Park, Cook County, Illinois',
    year: '1908',
    survey: 'HABS',
    locUrl: 'https://www.loc.gov/pictures/collection/hh/item/il0318.sheet.00001a/',
    thumbUrl: 'https://tile.loc.gov/storage-services/service/pnp/habshaer/il/il0300/il0318/sheet/00001_150px.jpg',
    imageUrl: 'https://tile.loc.gov/storage-services/service/pnp/habshaer/il/il0300/il0318/sheet/00001r.jpg',
    callNumber: 'HABS ILL,16-OAKPA,3-',
    sheetLabel: 'Title sheet, from the seven-sheet survey set',
    blurb: 'One of the first monumental buildings in the world made of exposed reinforced concrete, cast in place because the congregation could not afford stone. Wright turned the constraint into a doctrine: a windowless cube lit entirely from above, with the street noise of Lake Street shut out and the sky let in.',
  },
  {
    id: 'reliance-building',
    title: 'Reliance Building',
    architectOrBuilder: 'Burnham & Root; Charles B. Atwood',
    location: '32 North State Street, Chicago, Cook County, Illinois',
    year: '1895',
    survey: 'HABS',
    locUrl: 'https://www.loc.gov/pictures/collection/hh/item/il0041.sheet.00001a/',
    thumbUrl: 'https://tile.loc.gov/storage-services/service/pnp/habshaer/il/il0000/il0041/sheet/00001_150px.jpg',
    imageUrl: 'https://tile.loc.gov/storage-services/service/pnp/habshaer/il/il0000/il0041/sheet/00001r.jpg',
    callNumber: 'HABS ILL,16-CHIG,30-',
    delineator: 'J. William Rudd',
    surveyDate: '1965',
    sheetLabel: 'Title sheet with site location map',
    blurb: 'The building that predicted the twentieth century. Its steel frame carries everything, so the terracotta-and-glass skin could dissolve into continuous Chicago windows — a curtain wall in all but name, sixty years before the phrase existed.',
  },
  {
    id: 'auditorium-building',
    title: 'Auditorium Building',
    architectOrBuilder: 'Adler & Sullivan',
    location: '430 South Michigan Avenue, Chicago, Cook County, Illinois',
    year: '1889',
    survey: 'HABS',
    locUrl: 'https://www.loc.gov/pictures/item/il0091.sheet.00061a/',
    commonsFile: 'Auditorium Building, 430 South Michigan Avenue, Chicago, Cook County, IL HABS ILL,16-CHIG,39- (sheet 1 of 1).png',
    callNumber: 'HABS ILL,16-CHIG,39-',
    blurb: 'Hotel, office block and a 4,200-seat theatre in one massive masonry pile — the commission that made Louis Sullivan\'s name and employed the young Frank Lloyd Wright. Dankmar Adler\'s acoustics were so precise that the hall still needs no amplification.',
  },
  {
    id: 'glessner-house',
    title: 'John J. Glessner House',
    architectOrBuilder: 'Henry Hobson Richardson',
    location: '1800 South Prairie Avenue, Chicago, Cook County, Illinois',
    year: '1887',
    survey: 'HABS',
    locUrl: 'https://www.loc.gov/pictures/item/il0118.sheet.00001a/',
    commonsFile: 'John J. Glessner House, 1800 South Prairie Avenue, Chicago, Cook County, IL HABS ILL,16-CHIG,17- (sheet 1 of 6).png',
    callNumber: 'HABS ILL,16-CHIG,17-',
    blurb: 'Richardson\'s last house turns a fortress of rough granite to the street and opens completely onto a private south courtyard — a plan so unlike its Prairie Avenue neighbours that it scandalised them. Wright called it the most significant house in America.',
  },
  {
    id: 'taliesin',
    title: 'Taliesin',
    architectOrBuilder: 'Frank Lloyd Wright',
    location: 'Spring Green, Sauk County, Wisconsin',
    year: '1911, rebuilt 1914 and 1925',
    survey: 'HABS',
    locUrl: 'https://www.loc.gov/pictures/collection/hh/item/wi0376.sheet.00002a/',
    thumbUrl: 'https://tile.loc.gov/storage-services/service/pnp/habshaer/wi/wi0300/wi0376/sheet/00002_150px.jpg',
    imageUrl: 'https://tile.loc.gov/storage-services/service/pnp/habshaer/wi/wi0300/wi0376/sheet/00002r.jpg',
    callNumber: 'HABS WIS,56-SPGR,1-',
    delineator: 'John Krupka',
    surveyDate: '1995',
    sheetLabel: 'Location map, Taliesin master plan and site plan',
    blurb: 'Wright\'s own house, studio and farm, built into the brow of a Wisconsin hill rather than on top of it — the clearest statement of what he meant by organic architecture. Twice destroyed by fire and twice rebuilt, it was a working laboratory for nearly fifty years.',
  },
  {
    id: 'touro-synagogue',
    title: 'Touro Synagogue · Congregation Jeshuat Israel',
    architectOrBuilder: 'Peter Harrison',
    location: '85 Touro Street, Newport, Newport County, Rhode Island',
    year: '1763',
    survey: 'HABS',
    locUrl: 'https://www.loc.gov/pictures/collection/hh/item/ri0083.sheet.00001a/',
    thumbUrl: 'https://tile.loc.gov/storage-services/service/pnp/habshaer/ri/ri0000/ri0083/sheet/00001_150px.jpg',
    imageUrl: 'https://tile.loc.gov/storage-services/service/pnp/habshaer/ri/ri0000/ri0083/sheet/00001r.jpg',
    callNumber: 'HABS RI,3-NEWP,29-',
    delineator: 'J. Nagle',
    surveyDate: '1960',
    sheetLabel: 'Title sheet, from the twenty-seven-sheet survey set',
    blurb: 'The oldest surviving synagogue building in the United States, designed by the colonies\' first significant architect in restrained Georgian brick. Its congregation received George Washington\'s 1790 letter promising a government that gives "to bigotry no sanction, to persecution no assistance."',
  },
  {
    id: 'drayton-hall',
    title: 'Drayton Hall',
    location: '3380 Ashley River Road, Charleston, Charleston County, South Carolina',
    year: 'c. 1742',
    survey: 'HABS',
    locUrl: 'https://www.loc.gov/pictures/collection/hh/item/sc0132.sheet.00012a/',
    thumbUrl: 'https://tile.loc.gov/storage-services/service/pnp/habshaer/sc/sc0100/sc0132/sheet/00012_150px.jpg',
    imageUrl: 'https://tile.loc.gov/storage-services/service/pnp/habshaer/sc/sc0100/sc0132/sheet/00012r.jpg',
    callNumber: 'HABS SC,10-CHAR.V,8-',
    delineator: 'R. Belmont Freeman Jr.',
    surveyDate: '1974',
    sheetLabel: 'Stair hall details',
    blurb: 'The earliest surviving Palladian house in America, built on the Ashley River by enslaved craftsmen whose work the drawings record in extraordinary detail. Never wired for electricity or plumbed, it survives almost unaltered — the reason its measured drawings read as an eighteenth-century document rather than a reconstruction.',
  },
  {
    id: 'faneuil-hall',
    title: 'Faneuil Hall',
    architectOrBuilder: 'John Smibert; enlarged by Charles Bulfinch',
    location: 'Dock Square, Boston, Suffolk County, Massachusetts',
    year: '1742, enlarged 1806',
    survey: 'HABS',
    locUrl: 'https://www.loc.gov/pictures/collection/hh/item/ma0902.sheet.00000a/',
    thumbUrl: 'https://tile.loc.gov/storage-services/service/pnp/habshaer/ma/ma0900/ma0902/sheet/00000_150px.jpg',
    imageUrl: 'https://tile.loc.gov/storage-services/service/pnp/habshaer/ma/ma0900/ma0902/sheet/00000r.jpg',
    callNumber: 'HABS MASS,13-BOST,2-',
    sheetLabel: 'Title sheet, from the survey set',
    blurb: 'A market house with a meeting hall stacked above it — the building type that gave the American town its civic room. The debates held upstairs earned it the name "the Cradle of Liberty"; Bulfinch later doubled its width and added a third floor without losing the original Georgian discipline.',
  },
  {
    id: 'san-xavier-del-bac',
    title: 'Mission San Xavier del Bac',
    location: 'Mission Road, Tucson, Pima County, Arizona',
    year: '1797',
    survey: 'HABS',
    locUrl: 'https://www.loc.gov/pictures/item/az0061.sheet.00001a/',
    commonsFile: 'San Xavier del Bac Mission, Mission Road, Tucson, Pima County, AZ HABS ARIZ,10-TUCSO.V,3- (sheet 1 of 41).png',
    callNumber: 'HABS ARIZ,10-TUCSO.V,3-',
    sheetLabel: 'Title sheet, from a forty-one-sheet survey set',
    blurb: 'The finest Spanish colonial church in the United States, built of fired brick and lime plaster on the Tohono O\'odham Nation and still an active parish. Its domes and vaults were raised without a single structural drawing — the survey supplied the first.',
  },
  {
    id: 'taos-pueblo',
    title: 'Pueblo of Taos · Central Portion',
    location: 'Taos Pueblo, Taos County, New Mexico',
    year: 'c. 1000–1450, continuously maintained',
    survey: 'HABS',
    locUrl: 'https://www.loc.gov/pictures/item/nm0099.sheet.00007a/',
    commonsFile: 'Distant Elements of South Apartment and Partial Elevation of South Apartment - Pueblo of Taos Central Portion, Taos Pueblo, Taos County, NM HABS NM,28-TAOP,2- (sheet 7 of 8).png',
    callNumber: 'HABS NM,28-TAOP,2-',
    sheetLabel: 'Distant elements and partial elevation of the south apartment block',
    blurb: 'The oldest continuously inhabited community in the United States: multi-storey adobe apartment blocks stepped back to catch the winter sun, re-plastered by hand each year. Measuring a living, annually reshaped building is a genuinely hard survey problem, and the sheets show how it was solved.',
  },
  {
    id: 'larkin-house-monterey',
    title: 'Larkin House',
    architectOrBuilder: 'Thomas Oliver Larkin',
    location: '464 Calle Principal, Monterey, Monterey County, California',
    year: '1835',
    survey: 'HABS',
    locUrl: 'https://www.loc.gov/pictures/item/ca0394.sheet.00004a/',
    commonsFile: 'Larkin House, 464 Calle Principal, Monterey, Monterey County, CA HABS CAL,27-MONT,9- (sheet 4 of 15).png',
    callNumber: 'HABS CAL,27-MONT,9-',
    sheetLabel: 'Sheet 4 of a fifteen-sheet set',
    blurb: 'The house that invented the Monterey Colonial style — New England timber framing and a two-storey verandah grafted onto Mexican adobe walls. A hybrid born of one merchant\'s homesickness that went on to shape California building for a century.',
  },
  {
    id: 'washington-monument',
    title: 'Washington Monument',
    architectOrBuilder: 'Robert Mills; completed by Thomas Lincoln Casey',
    location: 'National Mall, Washington, District of Columbia',
    year: '1884',
    survey: 'HABS',
    locUrl: 'https://www.loc.gov/pictures/item/dc0261.sheet.00001a/',
    commonsFile: 'Cover sheer - Washington Monument, High ground West of Fifteenth Street, Northwest, between Independence and Constitution Avenues, Washington, District of Columbia, DC HABS DC,WASH,2- (sheet 1 of 37).png',
    callNumber: 'HABS DC,WASH,2-',
    surveyDate: '1994',
    sheetLabel: 'Cover sheet, from a thirty-seven-sheet set',
    blurb: 'A 555-foot obelisk of load-bearing masonry — still the tallest such structure in the world. Construction halted for over twenty years mid-shaft, and the change in marble quarries left a visible seam about a third of the way up.',
  },
  {
    id: 'cape-hatteras-light',
    title: 'Cape Hatteras Lighthouse',
    architectOrBuilder: 'Dexter Stetson, construction superintendent',
    location: 'Buxton, Dare County, North Carolina',
    year: '1870',
    survey: 'HABS',
    locUrl: 'https://www.loc.gov/pictures/item/nc0432.sheet.00001a/',
    commonsFile: 'Cape Hatteras Lighthouse, Point of Cape Hatteras, access road from Route 12, Buxton, Dare County, NC HABS NC,28-BUXT,1- (sheet 1 of 13).png',
    callNumber: 'HABS NC,28-BUXT,1-',
    sheetLabel: 'Title sheet, from a thirteen-sheet set',
    blurb: 'The tallest brick lighthouse in America, marking the Diamond Shoals off the Graveyard of the Atlantic. In 1999 the entire 4,800-tonne tower was jacked up and rolled half a mile inland to escape the eroding shoreline — a move planned directly from drawings like these.',
  },
  {
    id: 'bodie-island-light',
    title: 'Bodie Island Light Station',
    location: 'Off Highway 12, Nags Head, Dare County, North Carolina',
    year: '1872',
    survey: 'HABS',
    locUrl: 'https://www.loc.gov/pictures/item/nc0497.sheet.00001a/',
    commonsFile: 'Bodie Island Light Station, Off Highway 12, Nags Head, Dare County, NC HABS NC-395 (sheet 1 of 36).png',
    callNumber: 'HABS NC-395',
    sheetLabel: 'Title sheet, from a thirty-six-sheet set',
    blurb: 'The third light to stand on this stretch of the Outer Banks — the first sank into unstable sand, the second was destroyed by retreating Confederate troops. Its black-and-white horizontal bands are a daymark: a pattern read by daylight, when the lamp is useless.',
  },
  {
    id: 'point-reyes-light',
    title: 'Point Reyes Lighthouse',
    location: 'Point Reyes Station, Marin County, California',
    year: '1870',
    survey: 'HABS',
    locUrl: 'https://www.loc.gov/pictures/item/ca1357.sheet.00001a/',
    commonsFile: 'Point Reyes Lighthouse, Point Reyes Station, Marin County, CA HABS CAL,21-POREY,1- (sheet 1 of 5).png',
    callNumber: 'HABS CAL,21-POREY,1-',
    sheetLabel: 'Title sheet, from a five-sheet set',
    blurb: 'Bolted to a cliff on one of the foggiest, windiest headlands in North America, and reached by more than three hundred steps. The tower was deliberately built low on the rock face so its first-order Fresnel lens would sit beneath the fog rather than above it.',
  },
  {
    id: 'mispillion-light',
    title: 'Mispillion Lighthouse',
    location: 'Mispillion River at the Delaware River, near Milford, Delaware',
    year: '1873',
    survey: 'HAER',
    locUrl: 'https://www.loc.gov/pictures/item/de0330.sheet.00001a/',
    commonsFile: 'Mispillion Lighthouse, South bank of Mispillion River at its confluence with Delaware River at northeast end of County Road 203, 7 miles east of Milford, Milford HAER DEL,3-MILF.V,2- (sheet 1 of 4).png',
    callNumber: 'HAER DEL,3-MILF.V,2-',
    sheetLabel: 'Title sheet, from a four-sheet set',
    blurb: 'A timber-framed keeper\'s dwelling with the light rising through its roof — the modest, domestic end of American lighthouse design. The original structure was destroyed by fire in 2002, which makes this survey the primary record of what stood here.',
  },

  // ── HAER · engineering ─────────────────────────────────────────────────────
  {
    id: 'bollman-bridge-harpers-ferry',
    title: 'Baltimore & Ohio Railroad · Bollman Bridge',
    architectOrBuilder: 'Wendel Bollman',
    location: 'Spanning the Potomac River at Harpers Ferry, Jefferson County, West Virginia',
    year: '1850s',
    survey: 'HAER',
    locUrl: 'https://www.loc.gov/pictures/item/wv0291.sheet.00001a/',
    commonsFile: 'Baltimore and Ohio Railroad, Bollman Bridge, Spanning Potomac River at Harpers Ferry, Harpers Ferry, Jefferson County, WV HAER WVA,19-HARF,28- (sheet 1 of 6).png',
    callNumber: 'HAER WVA,19-HARF,28-',
    sheetLabel: 'Title sheet, from a six-sheet set',
    blurb: 'The Bollman truss was the first bridge design to use iron for every structural member, patented by a self-taught B&O foreman. Each panel point is suspended independently by its own pair of diagonals, so a single failed member cannot take the span down — redundancy, drawn a century before the word entered engineering practice.',
  },
  {
    id: 'martinsburg-roundhouse',
    title: 'Baltimore & Ohio Railroad · Martinsburg West Roundhouse',
    location: 'Race and Martin Streets, Martinsburg, Berkeley County, West Virginia',
    year: '1866',
    survey: 'HAER',
    locUrl: 'https://www.loc.gov/pictures/item/wv0255.sheet.00003a/',
    commonsFile: 'Baltimore and Ohio Railroad, Martinsburg West Roundhouse, East End of Race and Martin Streets, Martinsburg, Berkeley County, WV HAER WVA,2-MART,1A- (sheet 3 of 5).png',
    callNumber: 'HAER WVA,2-MART,1A-',
    sheetLabel: 'Sheet 3 of a five-sheet set',
    blurb: 'A cast-iron-framed roundhouse rebuilt after Stonewall Jackson\'s raids — the only surviving example of its type, and the site where the Great Railroad Strike of 1877 began. A radial plan of stalls around a central turntable: pure programme made into geometry.',
  },
  {
    id: 'sloss-viaduct',
    title: 'Sloss-Sheffield Steel & Iron · First Avenue North Viaduct',
    location: 'Thirty-second Street, Birmingham, Jefferson County, Alabama',
    year: '1881 works; viaduct later',
    survey: 'HAER',
    locUrl: 'https://www.loc.gov/pictures/item/al0249.sheet.00011a/',
    commonsFile: 'Sloss-Sheffield Steel and Iron, First Avenue North Viaduct at Thirty-second Street, Birmingham, Jefferson County, AL HAER ALA,37-BIRM,4- (sheet 11 of 20).png',
    callNumber: 'HAER ALA,37-BIRM,4-',
    sheetLabel: 'Sheet 11 of a twenty-sheet set',
    blurb: 'Part of the record of the Sloss furnaces, the blast-furnace complex that built industrial Birmingham and is now a National Historic Landmark museum. HAER documents infrastructure most surveys ignore — the viaducts, charging systems and rail spurs that made the furnaces work.',
  },
  {
    id: 'monadnock-mills',
    title: 'Monadnock Mills · Mill No. 1',
    location: '13–17 Water Street, Claremont, Sullivan County, New Hampshire',
    year: '19th century',
    survey: 'HAER',
    locUrl: 'https://www.loc.gov/pictures/item/nh0126.sheet.00001a/',
    commonsFile: 'Monadnock Mills, Mill No. 1, 13-17 Water Street, Claremont, Sullivan County, NH HAER NH,10-CLAR,6A (sheet 1 of 5).png',
    callNumber: 'HAER NH,10-CLAR,6A',
    sheetLabel: 'Title sheet, from a five-sheet set',
    blurb: 'A New England water-powered textile mill on the Sugar River — the building type that carried the American Industrial Revolution. Heavy slow-burning timber framing, wide unobstructed floors and a wall of windows: a daylight factory, a century before electric light.',
  },
  {
    id: 'brown-covered-bridge',
    title: 'Brown Bridge · Covered Bridge Trusses',
    location: 'Spanning Cold River, Upper Cold River Road, Shrewsbury, Rutland County, Vermont',
    year: '1880',
    survey: 'HAER',
    locUrl: 'https://www.loc.gov/pictures/item/vt0123.sheet.00002a/',
    commonsFile: 'Covered Bridge Trusses - Brown Bridge, Spanning Cold River, Upper Cold River Road, Shrewsbury, Rutland County, VT HAER VT-28 (sheet 2 of 7).png',
    callNumber: 'HAER VT-28',
    sheetLabel: 'Covered bridge trusses',
    blurb: 'The roof of a covered bridge is not for the traveller — it is there to keep rain off the timber trusses, which would otherwise rot within a decade. This sheet draws the truss itself, the reason the shelter exists.',
  },
  {
    id: 'alamo-madre-acequia',
    title: 'Alamo Madre Acequia',
    location: 'East of Alamo Street, San Antonio, Bexar County, Texas',
    year: 'begun 1719',
    survey: 'HAER',
    locUrl: 'https://www.loc.gov/pictures/item/tx0215.sheet.00001a/',
    commonsFile: 'Alamo Madre Acequia, East of Alamo Street, North of Durango Boulevard, San Antonio, Bexar County, TX HAER TEX,15-SANT.V,4C- (sheet 1 of 1).png',
    callNumber: 'HAER TEX,15-SANT.V,4C-',
    sheetLabel: 'Single-sheet record',
    blurb: 'The gravity-fed irrigation ditch dug by Spanish colonists and Indigenous labourers to water the fields around Mission San Antonio de Valero — the mission the world now knows as the Alamo. The acequia system, not the chapel, is what actually made the settlement possible.',
  },
  {
    id: 'statue-of-liberty-admin',
    title: 'Statue of Liberty · Administration Building',
    location: 'Liberty Island, Manhattan, New York County, New York',
    year: '1930s',
    survey: 'HAER',
    locUrl: 'https://www.loc.gov/pictures/item/ny2026.sheet.00001a/',
    commonsFile: 'Administration Building Roof Plan - Statue of Liberty, Administration Building, Liberty Island, Manhattan, New York, New York County, NY HAER NY-138-A (sheet 1 of 6).png',
    callNumber: 'HAER NY-138-A',
    surveyDate: '2006',
    sheetLabel: 'Administration building roof plan',
    blurb: 'The unglamorous half of a monument: the service building that keeps Liberty Island running. HAER records the whole site, not only the statue — a reminder that every landmark rests on infrastructure nobody photographs.',
  },
  {
    id: 'gw-memorial-parkway',
    title: 'George Washington Memorial Parkway',
    location: 'Along the Potomac from McLean to Mount Vernon, Fairfax County, Virginia',
    year: '1932 onward',
    survey: 'HAER',
    locUrl: 'https://www.loc.gov/pictures/item/va1677.sheet.00001a/',
    commonsFile: 'George Washington Memorial Parkway, Along Potomac River from McLean to Mount Vernon, VA, Mount Vernon, Fairfax County, VA HAER VA,30- ,8- (sheet 1 of 21).png',
    callNumber: 'HAER VA,30-,8-',
    sheetLabel: 'Title sheet, from a twenty-one-sheet set',
    blurb: 'One of the first American parkways — a road designed as landscape, with curves eased to the terrain, sightlines composed like a garden walk and commercial traffic banned outright. Twenty-one sheets of drawings for a piece of infrastructure most people experience at 45 mph.',
  },

  // ── HALS · landscapes ──────────────────────────────────────────────────────
  {
    id: 'marsh-billings-rockefeller',
    title: 'Marsh-Billings-Rockefeller National Historical Park',
    location: '54 Elm Street, Woodstock, Windsor County, Vermont',
    year: 'landscape from the 1870s',
    survey: 'HALS',
    locUrl: 'https://www.loc.gov/pictures/item/vt0131.sheet.00001a/',
    commonsFile: 'Cover Sheet - Marsh-Billings-Rockefeller National Historical Park, 54 Elm Street, Woodstock, Windsor County, VT HALS VT-1 (sheet 1 of 19).png',
    callNumber: 'HALS VT-1',
    sheetLabel: 'Cover sheet, from a nineteen-sheet set',
    blurb: 'HALS VT-1 — the first landscape recorded under the survey. The birthplace of American conservation thinking, where George Perkins Marsh watched Vermont\'s deforested hills erode and wrote Man and Nature, and where Frederick Billings then replanted the forest to prove recovery possible.',
  },
  {
    id: 'rohwer-memorial-cemetery',
    title: 'Rohwer Relocation Center Memorial Cemetery',
    location: 'Arkansas Highway 1, Rohwer, Desha County, Arkansas',
    year: '1944 memorials',
    survey: 'HALS',
    locUrl: 'https://www.loc.gov/pictures/item/ar1148.sheet.00003a/',
    commonsFile: 'Hardscape Plan - Rohwer Relocation Center Memorial Cemetery, Arkansas Highway -1, Rohwer, Desha County, AR HALS AR-4 (sheet 3 of 6).png',
    callNumber: 'HALS AR-4',
    sheetLabel: 'Hardscape plan',
    blurb: 'All that remains of a camp where more than 8,000 Japanese Americans were incarcerated during the Second World War: a cemetery and the concrete monuments the internees cast themselves. The survey measures a landscape whose significance is entirely in what was removed.',
  },
  {
    id: 'carnton-franklin-landscape',
    title: 'Carnton Plantation · The Landscapes of the Battlefield of Franklin',
    location: '1345 Carnton Lane, Franklin, Williamson County, Tennessee',
    year: 'house 1826; battle 1864',
    survey: 'HALS',
    locUrl: 'https://www.loc.gov/pictures/item/tn0445.sheet.00002a/',
    commonsFile: 'Carnton Plantation, House and Garden - The Landscapes of the Battlefield of Franklin, Tennessee, Carnton Plantation, 1345 Carnton Lane, Franklin, Williamson County, TN HALS TN-7-A (sheet 2 of 2).png',
    callNumber: 'HALS TN-7-A',
    sheetLabel: 'House and garden',
    blurb: 'A plantation house that became a field hospital during the Battle of Franklin, its garden turned into one of the largest private Confederate cemeteries. Reading the drawing means reading three landscapes at once — agricultural, military and commemorative — laid over the same ground.',
  },
  {
    id: 'dumbarton-oaks-park',
    title: 'Dumbarton Oaks Park',
    architectOrBuilder: 'Beatrix Farrand',
    location: 'Thirty-second and R Streets NW, Washington, District of Columbia',
    year: '1920s–1930s',
    survey: 'HABS',
    locUrl: 'https://www.loc.gov/pictures/item/dc0640.sheet.00001a/',
    commonsFile: 'Dumbarton Oaks Park, Thirty-second and R Streets Northwest, Washington, District of Columbia, DC HABS DC,GEO,175- (sheet 1 of 28).png',
    callNumber: 'HABS DC,GEO,175-',
    sheetLabel: 'Title sheet, from a twenty-eight-sheet set',
    blurb: 'Beatrix Farrand\'s masterwork and the finest surviving example of her practice — a sequence of terraced garden rooms that dissolves, as it descends, into an apparently wild stream valley. The only woman among the eleven founders of the American Society of Landscape Architects, and arguably the best designer of the group.',
  },
];

/** Convenience: entries grouped by survey. */
export function blueprintsBySurvey(): Record<SurveyKind, Blueprint[]> {
  const out: Record<SurveyKind, Blueprint[]> = { HABS: [], HAER: [], HALS: [] };
  for (const b of BLUEPRINTS) out[b.survey].push(b);
  return out;
}
