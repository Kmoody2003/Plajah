# The Founding Era dossier: research notes

Prepared 2026-10-07 for specialist review. Files: `data/dossier/founding.ts`, `foundingAssets.json`, `foundingScenes.ts`, `foundingTimeline.ts`, `foundingRecon.json` (empty), `components/dossier/experiences/FoundingTimeline.tsx`, `tests/dossierFounding.test.ts`. Registry id `founding-era` (flagged `artPending`). The fifth exhibit: a topic exhibit built on the pattern of the Partition one, structured as a timeline whose spine is the four presidencies.

Totals: 179 claims (97 established, 48 probable, 31 contested, 3 tradition), 79 ledger sources (25 primary, 10 archive, 3 secondary, 41 scholarly), 54 cleared image assets, 18 rooms in six wings, 36 nodes (each at five reading depths, about 24,700 words of node text), 11 planned reconstruction scenes (places and objects only; none painted), 35 timeline pins, and one interactive experience (`founding-timeline`).

## Method and honest limits

- No image was generated and no Magnific or other paid credit was used. All assets are real archive material found through the Wikimedia Commons API (licence, creator, credit and size read from each file record). Every asset URL was requested and loads (see "Verifying the asset URLs" for the two that were rate-limited to curl).
- Texts actually read, in the part that is quoted: the Declaration (Avalon Project transcription, which modernises spelling), Jefferson's rough draft (Library of Congress, Boyd's reconstruction), Jefferson's Autobiography (Avalon), the Constitution (Wikisource), Madison's Convention notes for 25 August 1787 (Avalon), the Northwest Ordinance articles 3 and 6 (Avalon), the Royal Proclamation of 1763 (Avalon), Dunmore's Proclamation (Wikisource), the Treaty of Paris articles 1 and 7 (Avalon), Abigail and John Adams, March and April 1776 (Massachusetts Historical Society), Wheatley to Occom (a teaching edition and a second excerpt), Jefferson to Banneker (Wikisource), Banneker to Jefferson (modernised printings only), Notes on the State of Virginia, Query XVIII (Wikisource, two editions), Federalist 10, 51, 54 (Avalon), the Farewell Address (Avalon), Jefferson's First Inaugural (Avalon), the Sedition Act (Avalon), Washington's will (Wikisource), Madison to Cogswell 1834 (Constitutional Sources Project transcription), the Lewis and Clark Journals for 17 August, 13 October and 24 November 1805 (University of Nebraska edition), Mount Vernon pages (census of 1799, the will, "Changing Views", Oney Judge), Monticello pages (Liberty and Slavery, FAQs, the Brief Account of Jefferson and Hemings), the State Department's Louisiana Purchase page, and the Census Bureau's Population Division Working Paper 56 (table 1).
- **Founders Online** (founders.archives.gov) returned an empty "202" bot-check page to curl and to the page-fetch tool, and the in-app browser refused it. No quotation in the exhibit was taken from it; the ledger says so, and the "How we know" room describes it as the main digital edition. Where Mount Vernon or Monticello print a Founders Online document, the words are quoted from their page, and the recipient and date of the letter come from the page or from memory (flagged in the claim note). The National Archives site (archives.gov) also refused automated access, so the Declaration and Constitution texts come from Avalon and Wikisource.
- Everything else is paraphrase. The 41 scholarly entries (Taylor, Berlin, Wood, Middlekauff, Maier, Calloway, Richter, Rakove, Beeman, Bilder, Elkins and McKitrick, Gordon-Reed, Dunbar, Egerton, Stagg, Hickey and others) were cited from bibliographic knowledge; the books were **not opened** in this session. Claims that rest only on them are graded probable at most and carry notes saying what was not checked.
- The 1790 and 1810 census counts were read from the Census Bureau's table (Gibson and Jung, Working Paper 56, 2002, table 1, a PDF on census.gov). The PDF's text layout is misaligned (the 1790 and the 1800 to 1820 enslaved and free columns run together), so the figures were accepted only where the pairs add up exactly: 697,681 enslaved plus 59,527 free equals 757,208 Black people in 1790, and 1,191,362 plus 186,446 equals 1,377,808 in 1810; the totals (3,929,214 and 7,239,881) match the table. A demographer should re-read the table (a test repeats the arithmetic). The scanned 1790 and 1810 census publications on census.gov are image-only PDFs and were not read.
- Quotations that carry a spelling caveat: the Avalon text of the Declaration modernises spelling ("insurrection" for the engrossed "insurrections"); Wikisource's Washington will modernises "Will & desire"; Banneker's letter was read only in modernised printings (NPS, Brown 1863), so only the phrase "one universal Father hath given being to us all" is quoted; Cornplanter's speech exists in two printings that differ slightly, and only "our women look behind them and turn pale" is quoted; Wheatley's letter was read in a teaching edition and checked against a museum excerpt; Washington's 1786 letter is quoted as Mount Vernon prints it.

## Sources actually consulted (URLs)

- Avalon Project: https://avalon.law.yale.edu/18th_century/declare.asp, proc1763.asp, paris.asp, nworder.asp, debates_825.asp, fed10.asp, fed51.asp, fed54.asp, washing.asp, sedact.asp; https://avalon.law.yale.edu/19th_century/jeffauto.asp and jefinau1.asp
- https://www.loc.gov/exhibits/declara/ruffdrft.html
- Wikisource: Constitution_of_the_United_States_of_America; Dunmore%27s_Proclamation; Last_Will_and_Testament_of_George_Washington; Letter_to_Benjamin_Banneker_-_August_30,_1791; Notes_on_the_State_of_Virginia_(1853)/Query_18 and the 1802 edition; The_Black_Man_(Brown)/Benjamin_Banneker
- https://www.masshist.org/digitaladams/archive/doc?id=L17760331aa and ?id=L17760414ja
- https://viva.pressbooks.pub/amlit1/?p=439 and the American Revolution Museum press release on Wheatley's 1774 letter
- https://lewisandclarkjournals.unl.edu/item/lc.jrn.1805-08-17, 1805-10-13 and 1805-11-24
- Mount Vernon: the 1786 and 1799 census page, Oney Judge, the 1799 will page, Washington's Changing Views on Slavery
- Monticello: slavery/paradox-of-liberty, slavery/slavery-faqs/property, slavery/jefferson-and-sally-hemings/a-brief-account
- https://history.state.gov/milestones/1801-1829/louisiana-purchase
- https://www.consource.org/document/james-madison-to-william-cogswell-1834-3-10/
- https://sullivanclinton.com/texts/period/archives/senecas-truth-power/
- https://www2.census.gov/library/working-papers/2002/demo/pop-twps0056/pop-twps0056.pdf
- Wikipedia (secondary pointers, accessed 2026-10-07): "Town Destroyer", "Paul Jennings (slave)", "James Madison"
- Wikimedia Commons file records for all 54 assets (API metadata)

## Verifying the asset URLs

Forty-two assets use a Wikimedia thumbnail at a standard width (960 or 1280 pixels); twelve whose originals are narrower than 1280 pixels use the original file (the hall requests its own 500 and 1280 pixel versions through `commonsThumb`, and Wikimedia serves them). Wikimedia only serves thumbnails at its standard "steps" (20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840), so non-standard widths return HTTP 400; an earlier draft had some and they were corrected. Wikimedia also rate-limits repeated requests (HTTP 429). Result of the final check: 52 of 54 URLs returned HTTP 200 to curl from this machine; the two that kept returning 429 to curl (the Wheatley frontispiece and the 1761 runaway advertisement, both originals) loaded without error in the browser pane, as did all 54 when loaded as images in the hall's own page. The asset search agent also recorded HTTP 200 for each URL when it built the file.

## Assets (54): licence and strength of provenance

All are Wikimedia Commons records; each asset's `rights.verifiedAt` is its Commons page and `rightsNote` in `foundingAssets.json` explains the assessment. "Strength" is the cataloguer's judgement of how safe the Commons tag is. Most are 18th and early 19th century works whose copyright expired long ago, reproduced from the Library of Congress, the National Archives or museum scans; the weaker entries are weak on the provenance of the scan, not on copyright. There are no photographs from this era: the five "photo" assets are modern photographs of buildings or objects (HABS photographs of the 1930s, a 2015 photograph of Mulberry Row, which is the one CC BY-SA asset), and each says so in its title. One asset (John Adams by Gilbert Stuart, National Gallery of Art) is CC0.

| Asset id | Commons file | Status | Strength |
|---|---|---|---|
| a-join-or-die | Join or Die LCCN2002695523.jpg | public-domain | STRONG |
| a-mitchell-map-1755 | A map of the British and French dominions in North America - with the roads... | public-domain | STRONG |
| a-proclamation-1763 | A new map of the Province of Quebec, according to the Royal Proclamation, o... | public-domain | STRONG |
| a-stamp-act | New Hampshire Gazette announcement of the Stamp Act, October 31, 1765.jpg | public-domain | MODERATE |
| a-boston-tea-party | Destruction of tea at Boston Harbor LCCN91795889.jpg | public-domain | STRONG |
| a-revere-massacre | The bloody massacre perpetrated in King Street Boston on March 5th 1770 by ... | public-domain | STRONG |
| a-lexington-map | A plan of the town and harbour of Boston and the country adjacent with the ... | public-domain | STRONG |
| a-declaration-trumbull | Declaration of Independence (1819), by John Trumbull.jpg | public-domain | STRONG |
| a-declaration-engrossed | Engrossed Declaration of Independence, front.jpg | public-domain | STRONG |
| a-jefferson-rough-draft | US Declaration of Independence draft 1.jpg | public-domain | STRONG |
| a-dunmore-proclamation | DunmoresProclamation.jpg | public-domain | MODERATE |
| a-wheatley-frontispiece | Houghton AC85.Aℓ245.Zy773w - Wheatley, frontispiece - cropped.jpg | public-domain | STRONG |
| a-abigail-adams | Portrait of Abigail Adams by Benjamin Blyth LOC hec.13515.jpg | public-domain | MODERATE |
| a-franklin-duplessis | Benjamin Franklin by Joseph Duplessis 1778.jpg | public-domain | STRONG |
| a-washington-stuart | Gilbert Stuart - George Washington (Lansdowne Portrait) - Google Art Projec... | public-domain | STRONG |
| a-adams-stuart | Gilbert Stuart, John Adams, c. 1800-1815, NGA 42933.jpg | cc0 | STRONG |
| a-jefferson-peale | Official Presidential portrait of Thomas Jefferson (by Rembrandt Peale, 180... | public-domain | STRONG |
| a-madison-stuart | James Madison by Gilbert Stuart.jpg | public-domain | MODERATE |
| a-hamilton-trumbull | John Trumbull - Alexander Hamilton - Google Art Project.jpg | public-domain | STRONG |
| a-surrender-yorktown | Surrender of Lord Cornwallis.jpg | public-domain | STRONG |
| a-treaty-paris-1783 | TreatyOfParisDraftLastPage.jpg | public-domain | MODERATE |
| a-articles-confederation | Articles page1.jpg | public-domain | MODERATE |
| a-shays | Proclamation by the State of Pennsylvania offering reward for Daniel Shays ... | public-domain | STRONG |
| a-constitution-p1 | Constitution of the United States, page 1.jpg | public-domain | STRONG |
| a-federalist-1788 | The Federalist (1st ed, 1788, vol I, title page).jpg | public-domain | STRONG |
| a-bill-of-rights | Bill of Rights Pg1of1 AC.png | public-domain | STRONG |
| a-philadelphia-1787 | State-House Birch's Views Plate 21.jpg | public-domain | STRONG |
| a-farewell-address | Washington Farewell Broadside.jpg | public-domain | STRONG |
| a-washington-taxable-property-1788 | List of George Washington's taxable property including slaves in Fairfax Pa... | public-domain | MODERATE |
| a-mount-vernon | Mount Vernon, Mount Vernon Memorial Highway, Mount Vernon, Fairfax County, ... | public-domain | STRONG |
| a-brant | Joseph Brant by Gilbert Stuart 1786.jpg | public-domain | MODERATE |
| a-peace-medal | Indian Peace Medal 1792 Obverse.jpg | public-domain | MODERATE |
| a-treaty-fort-stanwix-1784 | Broadside of the Treaty Between the United States and the Six Nations Signe... | public-domain | STRONG |
| a-treaty-greenville-1795 | Treaty of Greenville page1.jpg | public-domain | STRONG |
| a-whiskey-rebellion | WhiskeyRebellion.jpg | public-domain | STRONG |
| a-jay-treaty | John Jay (Gilbert Stuart portrait).jpg | public-domain | STRONG |
| a-alien-sedition | Sedition Act (1798).png | public-domain | STRONG |
| a-xyz | Property protected-à la Françoise LCCN93509853.jpg | public-domain | MODERATE |
| a-capitol-thornton | United States Capitol. Tortola scheme. Competition rendering of façade. Ele... | public-domain | STRONG |
| a-washington-city-1800 | Plan of the city of Washington in the territory of Columbia - ceded by the ... | public-domain | MODERATE |
| a-louisiana-treaty | Louisiana Purchase Treaty, Page 1 (5553723360).jpg | public-domain | STRONG |
| a-lewis-clark-map | Map of Lewis and Clark's Track, Across the Western Portion of North America... | public-domain | MODERATE |
| a-monticello | Monticello, State Route 53 vicinity, Charlottesville, Charlottesville, VA H... | public-domain | STRONG |
| a-mulberry-row | Mulberry Row.jpg | cc-by-sa | STRONG |
| a-banneker-almanac | BannekerAlmanac.jpg | public-domain | STRONG |
| a-embargo-ograbme | Ograbme.jpg | public-domain | MODERATE |
| a-slave-trade-act-1807 | Orig 7873517 22484 - An Act to Prohibit the Importation of Slaves into Any ... | public-domain | STRONG |
| a-census-1790 | Heads of families at the first census of the United States taken in the yea... | public-domain | MODERATE |
| a-runaway-ad | Maryland Gazette Runaway Slave Advertisement by George Washington, 1761.jpg | public-domain | STRONG |
| a-slave-ship-brookes | Stowage of the British slave ship Brookes under the regulated slave trade a... | public-domain | MODERATE |
| a-burning-washington | Washington. (A) representation of the capture of the city of Washington, by... | public-domain | STRONG |
| a-treaty-ghent | Signatures, Treaty of Ghent, December 24, 1814 LCCN2016870852.jpg | public-domain | MODERATE |
| a-hartford-convention | Old State House, Hartford, Connecticut.jpg | public-domain | STRONG |
| a-rice-or-tobacco | GENERAL INTERIOR VIEW, LOOKING EAST, SHOWING STRUCTURAL SYSTEM FOR HANGING ... | public-domain | MODERATE |

Commons "public domain" tags are the primary evidence; for scans of Library of Congress and National Archives items the holding institution's own rights statement should be checked before any commercial use. The entries marked MODERATE: the Stamp Act newspaper scan (provenance of the scan), Dunmore's broadside (a colour-adjusted derivative), the Abigail Adams pastel (a Harris & Ewing photograph of the pastel), the Madison portrait (the photographer is not named), the Treaty of Paris page (Commons calls it a "draft" but the page shows signatures and seals; the exhibit calls it the final signed page, and a specialist should check it against NARA ARC 299805), the Articles page (taken from a GPO page), the Washington taxable-property list (used in place of Washington's will, which has no clean Commons image), the Brant portrait (the current holder is blank on Commons), the peace medal photograph (extracted from a State Department poster), the XYZ cartoon, the Washington city plan (a Library of Congress map whose Commons date is a catalogue date), the Lewis and Clark map (the attribution comes from its title), the "Ograbme" cartoon (Commons dates it 1807; it is usually dated 1808), the 1790 census page (a 1908 printed transcription of North Carolina, not the manuscript), the Brookes diagram, the Treaty of Ghent signature page (a Harris & Ewing photograph) and the tobacco barn (a 20th-century barn, used as a generic image).

Not used on purpose: any painting of Sacagawea (no authentic likeness exists, and the well-known pictures are 20th-century inventions); any depiction of a dead or wounded person. Revere's engraving is the single image of a shooting and is gated at high-school level; the Brookes diagram and the XYZ satire are also gated at high-school level. The opening montage uses ungated images only.

## Claims I am least sure of (the weakest)

1. Numbers from books not opened (all graded contested or probable): 450,000 to 500,000 people of African descent in 1770 (c-enslaved-1770); American war dead, 25,000 to somewhat over 30,000 (c-war-dead); Loyalists at about 15 to 20 per cent (c-loyalists); Black soldiers for the Patriots, 5,000 to well above 9,000 (c-black-patriots); people reaching British lines, about 20,000 to far higher (c-dunmore-effect, from Pybus and Jefferson's 30,000); about 3,000 in the Book of Negroes (c-black-loyalists); Sedition Act prosecutions and convictions (c-sedition-count, about 14 to 25 and 10 to 15); the embargo's export figures (c-embargo-effect); about a million forcibly moved 1790 to 1860 (c-domestic-trade); 3,000 to 5,000 who left the Chesapeake in 1814 (c-black-1812); about 25 of 55 delegates held enslaved people (c-delegates-enslavers).
2. Facts stated from memory of the literature, with a note saying so: the ratification margins (c-ratif-margins), the war vote counts of 18 June 1812 (c-war-declared), the 23 million acres of Fort Jackson and three million of Fort Wayne (c-fort-jackson, c-tecumseh), the $1.2 million compensation after Ghent (c-ghent), the Pinckney slogan's origin in Harper's toast (c-xyz-slogan, graded tradition), Gabriel's execution count (c-gabriel), Washington's 1786 letter being to John Francis Mercer on 9 September (c-wash-views), the Hartford Convention's list of amendments, and the cotton gin's patent date.
3. Native-nation claims (c-sullivan "over 40 villages", c-canandaigua's annual cloth, c-nw-war, c-greenville, the Haudenosaunee split, c-iroquois-influence): taken from Calloway, Richter and Wikipedia summaries and not from the nations' own words; a historian of the Haudenosaunee, one of the Ohio nations and one of the Creek should review them. The exhibit has no scene and no image made by or about a specific Native community beyond the Brant portrait, the peace medal and the treaty documents, which is a gap.
4. Hemings (c-hemings-paternity, c-hemings-nature, c-hemings-dissent): the main summary is the Thomas Jefferson Foundation's, an interested party; the Heritage Society report was not read; the claim that the sexual relationship began in Paris is inferred, not recorded. The exhibit labels the paternity probable, the dissent contested, and the question of the relationship contested, with the plain statement that she was enslaved.
5. Sacagawea and York (c-sacagawea-legend, c-york): the journal quotations are exact; that she and York were not paid, how York's later life went, and the dispute over her death date rest on the editors' notes and on Ronda, not on the books.
6. Details in node text that go beyond the ledger claims (a reviewer should check or cut): Samuel Johnson noticing the contradiction of colonists calling taxation slavery; Revere's debt to Pelham's print; the Cochrane proclamation and the Colonial Marines (c-black-1812 covers them); British resettlement in Trinidad; the Hartford Convention's two-thirds votes; Jefferson's sales of enslaved people to meet debts; Madison's later support of colonisation; details of the Brookes diagram; the story of the "midnight judges".
7. Pre-K to Grade 2 and Grade 3 to 5 texts on slavery, Boston, the war and Gabriel are deliberately gentle and truthful but have not been tested with children.

## Needs a human specialist before release

- Historians of early America (political and constitutional): the whole ledger, in particular the three-fifths and electoral-college claims, the Convention and ratification dates, the Hamilton programme, the Whiskey Rebellion and Sedition Act counts, and the framing of the Federalist authorship result.
- Historians of slavery and of the Atlantic world: the enslaved population numbers; Black Patriots, Black Loyalists, Dunmore and the Colonial Marines; Washington's and Jefferson's records; the domestic slave trade; Gabriel; the Mulberry Row and Mount Vernon archaeology.
- Historians of Native nations (Haudenosaunee, the Ohio Valley nations, Shawnee, Creek, Lakota and Osage) and, where possible, tribal historians: every Native claim and the wording of the Cornplanter and Canandaigua passages.
- Historians of women and gender: Abigail Adams, coverture, New Jersey voting; the treatment of Wheatley.
- Monticello (the Thomas Jefferson Foundation and independent scholars such as Gordon-Reed), Mount Vernon (the Washington Library) and Montpelier: the Hemings claims, the 610 figure, the 1799 census (123 or 124), Madison's enslaved community, Paul Jennings.
- A rights specialist for the MODERATE asset notes above and for the CC BY-SA photograph.

## Planned reconstruction scenes (none painted; places and objects only, no people)

At about 75 credits per image at 2k, eleven scenes cost about 825 credits. IDs, with their rooms: `recon-tobacco-barn` (r1), `recon-rice-field` (r1), `recon-printing-shop` (r2), `recon-tea-wharf` (r2), `recon-survey-table` (r7), `recon-assembly-room` (r8), `recon-philadelphia-street` (r8), `recon-capitol-construction` (r12), `recon-keelboat-journal` (r13), `recon-mulberry-row` (r14), `recon-burned-presidents-house` (r15). The Assembly Room scene is the ground-floor room of the Pennsylvania State House where Congress and the Convention met; the upper-floor "Long Room" (suggested in the brief) was not where the delegates voted, so it was not used. The barn, rice-field and Mulberry Row scenes are shown without the people whose labour made the place, and their captions must say whose labour it was. When paintings exist, add them to `foundingRecon.json` (files at `/dossier/founding/recon/<id>.jpg`), set `artPending` to false, and add a Fabula film and the generated Tela timeline (`foundingBoardMilestones` and `foundingPortraits` in `foundingTimeline.ts` already define the two boards; the `.tela.json` has not been generated). A separate demonstration film for this exhibit exists (`foundingBattleDemo.ts`, written by another agent for the film engine); it is not part of this ledger and is not registered.

## The timeline experience

`components/dossier/experiences/FoundingTimeline.tsx` (lazy-loaded; wired to node `n-r1-timeline` in room 1 through the new `DossierExperience` value `founding-timeline`). A horizontal track from 1754 to 1818 with five bands (grey before 1789, then Washington, Adams, Jefferson and Madison, each with its name written), tick years, a persistent amber strip across the whole line reading "Enslaved people lived here, throughout", census markers at 1790 and 1810 taken from the Census Bureau figures, and 35 pins from `foundingMilestones`. Each pin carries a year, a short label and confidence glyph chips computed from the ledger claims behind it, and opens its room (DossierHall's `goRoom`) on click or Enter. A readout shows the selected event with full-word chips and an "Open room" button; Earlier and Later buttons and a slider step through events and years; hovering or focusing a pin selects it; Left and Right arrows on a focused pin move to its neighbour. A legend above the track explains the chips, and a note under the track, always visible, says that enslaved people lived in every presidency. Reduced motion: smooth scrolling is replaced by a jump and all transitions are off. Cards sit in at most three rows and, when years are close, are moved to the right of their year with an elbow line, so a card can sit up to about 150 pixels from its year; the year is written on the card.

## Changes outside the new files

- `services/dossier/dossierTypes.ts`: one new union member, `'founding-timeline'`.
- `components/dossier/DossierHall.tsx`: one lazy import and one render block for the experience.
- `components/dossier/DossierLobby.tsx`: five-panel layout (five columns on wide screens, three over two on a laptop, the fifth card spanning the row on a tablet) and a heading that counts the exhibits.
- `services/dossier/dossierTheme.ts`: one line, a `glyphEm` entry for Libre Caslon, so the lobby title fits its card.
- `data/dossier/registry.ts`: one theme and one entry (`founding-era`).
- `tests/dossierRegistry.test.ts`: the id list now names five exhibits.
