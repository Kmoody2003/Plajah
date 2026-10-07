# Henry Ford dossier: research notes

First built 2026-10-06; revised the same day to lead with the automotive legacy in Detroit and the war effort, with the Dearborn Independent moved into a Beliefs and Morals room.
Files: `data/dossier/ford.ts`, `fordAssets.json`, `fordScenes.ts`, `fordTimeline.ts`, `tests/dossierFord.test.ts`.
Counts: 111 claims (45 established, 53 probable, 12 contested, 1 tradition), 55 sources, 27 cleared assets, 8 rooms, 28 nodes, 18 reconstruction scenes, 16 milestones.

## Structure (owner direction)

Three wings, plus a closing room. The wing grouping is exported as `fordWings` / `fordEpilogueRoomId` in `ford.ts`; the `Room` type has no wing field, so the hall component must implement the grouping.

- Motor City: r1 A Farm Boy and a Broken Watch; r2 Detroit and the First Cars (Piquette); r3 The Car for the Great Multitude (Model T, Highland Park, the line, the Five Dollar Day); r4 The Motor City Engine (workforce, the Rouge, institutions, aviation); r5 V-8, Depression and the Union.
- The War Effort: r6 Arsenal of Democracy (First World War production, Willow Run, jeeps/tank engines/gliders, the workforce, Edsel's death and the 1945 handover to Henry Ford II and Henry's death in 1947).
- Beliefs and Morals: r7 (convictions and moral campaigns, the Peace Ship, the Dearborn Independent, what the printed pages show and who was harmed, My Life and Work chapter, Sapiro and the 1927 retraction, the 1938 Berlin medal).
- Epilogue: r8 Legacy.

The entrance tagline now leads with the cars and Detroit. The epigraph and `scoreUrl` are unchanged.

## Method and honest limits

Web search and page fetches were summarised by a fast model. One full primary text, My Life and Work, was downloaded and grepped directly (https://www.gutenberg.org/cache/epub/7213/pg7213.txt). Consequences:

- Claims marked `established` rest on Ford's own text, a fetched archive page, or a printed page that was viewed.
- The scholarly books (Watts, Baldwin, Hounshell, Grandin) were NOT read. They are cited only for points confirmed through reviews or publisher summaries, with no page numbers. Lacey, Brinkley and Nevins and Hill were not consulted and are not cited.
- Wikipedia pages are listed as `secondary`, labelled tertiary in the citation line, and used only for dates and figures; claims that rest mainly on them are `probable`.

## Sources consulted this round (new)

- My Life and Work, re-read for the war chapter, the tractor chapter, the Piquette and Highland Park passages, and the Model T announcement. Verified exact wording used: "I will build a motor car for the great multitude" and the "God's great open spaces" clause; "If Ford does that he will be out of business in six months"; "not based upon pacifist or non-resistant principles"; "wars do not end wars"; "not a very good use for good corn"; "lift farm drudgery off flesh and blood and lay it on steel and motors"; "simply by applying our production principles to a new product"; "ideas, false ideas, which are sapping the moral stamina of the people"; "prejudice or hatred against persons"; "in 1906" for the Piquette plant. Ford's own war account: every facility put at the Government's disposal; from April 1917 to November 1918 the factory worked practically exclusively for the Government; Liberty motors, aero cylinders, caissons, helmets, ambulances and Eagle boats; Eagle boat contract awarded 15 January 1918, first launch 11 July 1918, plant built in four months at the Rouge; Fordson price cut to $395; 1908-1909 sales above ten thousand; sixty acres at Highland Park.
- The Henry Ford (archive): Henry Ford and Reincarnation (https://www.thehenryford.org/collections/explore/articles/henry-ford-and-reincarnation, San Francisco Examiner, 26 August 1928); Ford Ambulances for the Red Cross (https://www.thehenryford.org/collections/explore/articles/ford-ambulances-for-the-red-cross); African American Workers at Ford Motor Company (https://www.thehenryford.org/collections/explore/articles/african-american-workers-at-ford-motor-company); Sociological Department set incl. the Ford English School (https://www.thehenryford.org/collections/explore/sets/detail/henry-ford-sociological-department); Village Industries set (https://www.thehenryford.org/collections/explore/sets/detail/henry-ford-village-industries); the 1914 brochure "The Case Against the Little White Slaver" (https://www.thehenryford.org/collections/explore/artifact/374491); Trade School research guide (https://askus.thehenryford.org/researchguides/faq/212470) seen through search-result summaries only; Five-Dollar Day article re-fetched.
- Piquette plant museum site https://www.fordpiquetteplant.org/ (states only "birthplace of the Model T" and National Historic Landmark); an older piquetteplant.org history URL returned 404.
- Wikipedia (tertiary), fetched: Ford Piquette Avenue Plant; Ford Model T; Willow Run; Eagle-class patrol craft; Liberty L-12; Henry Ford; Ford Trimotor; Henry Ford Hospital; Fordson; Lincoln Motor Company; Ford flathead engine; Mercury (automobile); Greenfield Village; Highland Park Ford Plant; Ford River Rouge Complex; Detroit; Willys MB (Ford GPW table); Ford GAA engine; Waco CG-4. A Wikipedia page for the Ford Trade School returned 404 and was not used.
- Images were viewed as 960px Commons thumbnails (and LoC medium images) before being cleared.

## Verified vs unverified (this revision)

Verified in a full text or an archive page: the war account above; the 1914 brochure; the 1928 reincarnation interview; the Sociological Department leadership (Rev. Samuel S. Marquis, Episcopal) and the English School figures; Detroit's Black population 1910/1920 and Ford's 1,675 Black workers by 1918; Ford ambulances and Red Cross donation; Village Industries (Northville 1920; Tecumseh soybeans); the three printed Dearborn Independent pages.

Single tertiary source only, so marked `probable`: Piquette construction details, third-floor design room and the 27 September 1908 first production date; Model T specifications; Highland Park size; Lincoln purchase date and price; Henry Ford Hospital dates; Trimotor dates and count; V-8 and Mercury details; Willow Run size, output peak and housing figures; GPW, GAA and glider figures; Detroit's population arc; Greenfield Village dates.

## Contested items (all)

1. `c-edison-meet` (1887 Atlantic City in Ford's memory vs 1896 Brooklyn at The Henry Ford).
2. `c-line-credit` (who devised the moving line).
3. `c-socio-view` (reform or control).
4. `c-ford-role` (how much Ford wrote, read or approved in the Independent).
5. `c-retraction-know` (whether he read or meant the 1927 apology).
6. `c-settlement` (Sapiro terms, no figure given).
7. `c-edsel-stress` (whether conflict hastened Edsel's death).
8. `c-hist` (how historians weigh achievements against antisemitism and the labor record).
9. `c-clara` (tradition).
New this round:
10. `c-first-car-date` (Ford's own 1892-1893 first car vs the 1896 Quadricycle).
11. `c-piquette-plant` (plant built 1904 per Wikipedia vs Ford's "in 1906").
12. `c-black-weigh` (opportunity vs paternalism in Ford's Black employment; wider scholarship not consulted).
13. `c-reincarnation-origin` (Ford said he adopted the idea at 26, about 1889-90; The Henry Ford says the book he credited, Orlando J. Smith's A Short View of Great Questions, was first published in 1899).

## Could NOT verify, and left out

- The exact text of the 1927 retraction; any Sapiro settlement figure; Hitler's Munich portrait (probable only); that Ford was the first American to get the Grand Cross.
- Complete Ford-built Liberty engine counts (a Wikipedia figure of 3,950 appeared in a summary and was not used); whether Ford made "all" Liberty cylinders.
- Ford's wartime workforce figures for Black workers and women (Wikipedia says only that Ford relented on hiring women; no percentage given). Willow Run housing builders and agencies.
- The Willow Run output totals disagree by source (6,972 complete aircraft of 18,482, or about 8,685 with knock-down kits; peak employment 42,331 or 42,500; cycle time 59 to 63 minutes); the ledger keeps the ranges.
- The claim that the Model T "produced more cars than all other automakers combined" in 1914: seen only in a summary, not used. Model T colour policy ("any colour as long as it is black"): still not used.
- Ford's Prohibition-era placard wording ("Henceforth it will cost a man his job..."): seen only on a study-guide site, not used. Only the documented bonus condition (abstaining from alcohol) and the corn remark are used.
- The 20-plant total for Village Industries (reported by a search snippet, not by the fetched archive set): not used.
- Ford's religious affiliation and church life: not sourced; the dossier says nothing beyond his own words and the Marquis appointment.
- Ford Trade School numbers come from search summaries of the archive guide, not from a full fetch.

## Open questions for a historian reviewer

1. Confirm each scholarly attribution (Watts, Baldwin, Hounshell, Grandin) against the books and add page numbers; add the scholarship on Black Detroit and the UAW for `c-black-weigh`.
2. Replace Wikipedia-based claims with primary or monograph citations (the list above).
3. Authoritative text of the 1927 retraction and the Sapiro settlement (Benson Ford Research Center, American Jewish Committee papers).
4. Piquette construction date: Benson Ford records vs the museum vs Ford's "1906".
5. Is "Beliefs and Morals" the right home for the Peace Ship, the Sociological Department's moralism and the Village Industries? The Village Industries claim (`c-village-industries`) is a description; its link to Ford's beliefs is interpretive.
6. Tone check on the Pre-K to Grade 2 text of the Dearborn Independent nodes and the new "What the Pages Show" node. The 1921 front page quotes a hostile headline in full from middle-school depth up; the assets carry `minDepth: 'middle'`.
7. The identification of the 1910s Detroit Publishing Company photograph (`ph-ford-plant-1910s`) as the Highland Park plant is a visual inference; the caption says only "Ford Motor Company, Detroit, Michigan". Not asserted in the title.

## Assets added this round (all viewed before clearing)

- `ph-piquette-1906`: Ford Piquette Avenue Plant, Peninsular Engraving Company, about 1906 (Commons, PD).
- `ph-ford-plant-1910s`: Ford Motor Company factory, Detroit Publishing Company, 1910-1920 (Commons mirror of LoC, PD).
- `ph-woodward-1910`: Woodward Avenue at Grand Circus Park, Detroit Publishing Company, about 1910 (PD).
- `ph-eagle-1919`: NARA War Department card dated 31 March 1919 (Ford's Eagle Boats); shows naval officers, not workers.
- `ph-willow-engines-1943`, `ph-willow-riveting-1943`: Howard R. Hollem, OWI, NARA (PD).
- `ref-1928-edsel`: Henry and Edsel Ford beside a car, 1928 (Pacific and Atlantic via BnF Gallica; Commons says PD). Edsel is identified by the Gallica title; no face reference is attached to the character bible.
- `ph-gaa-engine`: "Ford M4 tank engine" museum photograph by Alf van Beem (CC0, 2013); the engine's identification as a Ford GAA rests on the Commons title.
- `ph-trimotor-1927`: LoC Prints & Photographs, Ford Trimotor in flight, about 1927 (LoC rights text: no known restrictions).
- `doc-modelt-engine-1919`: Ford Motor Company Model T engine diagram, 1919 (Commons, PD).
- `doc-1920-international-jew-titlepage`, `doc-1921-dearborn-independent-cover`, `doc-1927-dearborn-independent-cover`: printed pages, public domain on Commons (pre-1929 US publications), hidden below middle school where they carry the campaign's headlines.
Existing assets `doc-1913-assembly-line`, `doc-highland-park-shift`, `doc-1927-rouge-aerial`, `doc-1943-willow-run` are now typed `photo` (they are photographs) so they can serve in the entrance montage.

## Assets rejected

- Charles Sheeler's 1927 Rouge photographs (Commons PD labels, but commissioned for a Ford advertising campaign and by an artist who died in 1965; provenance not verified).
- Ford Trimotor and jeep photographs from SDASM, enthusiast CC-BY and the LoC "jeep stamping" series: no clear Ford provenance or rights unknown. The McPherson 1929-30 Golden State Airways Trimotor photograph is labelled CC0 by the uploader, but its original photographer is unknown, so the LoC print was used instead.
- Eagle boat launch photographs by tormentor4555 (rights shown as unknown).
- Earlier rejects still stand: "Ford Strikers Riot" 1941 (renewal uncertain), Dutch Spaarnestad "1863-1942" print, Quadricycle replica photos, the Internet Archive Burroughs-on-Quadricycle image with a wrong date, redundant Hoover/Edison group photos.

## Reconstruction scenes

Eighteen scenes. The eight from the first build keep their ids and paintings (`fordRecon.json`); five moved rooms: `recon-fiveday-gate` r3, `recon-ford-peaceship` r7, `recon-independent-press` r7, `recon-willow-run` r6, `recon-ford-highland-line` r3. Ten are NEW and unpainted: `recon-piquette-third-floor` (Ford age 45), `recon-model-t-street`, `recon-rouge-1927`, `recon-ford-trimotor-1927`, `recon-greenfield-1929` (Ford age 66), `recon-v8-test-cell-1932`, `recon-eagle-boat-hall-1918`, `recon-jeep-line-1942`, `recon-willow-village-1943`, `recon-fair-lane-1947`. Only Ford (via the bible) is a depicted person; everyone else is absent or seen from behind or at a distance.

## Likeness notes

Unchanged: lean, narrow-faced man, high forehead, pale deep-set eyes, thin straight brows, prominent ears, thin mouth with a faint wry smile, clean-shaven in every photograph; silver-white and gaunt by 1938; no cleared photograph after 1938. The 1928 Edsel photograph shows Ford in a pinstripe suit with arms folded but was not added to the bible (not needed, and the date range is already covered).

## Exploded Model T (room 3, "Take the Model T Apart")

Procedural teaching model (components/dossier/ModelTExploded.tsx, ModelTScene.tsx; text in data/dossier/modelTParts.ts). No downloaded or AI-generated mesh is used: a generated mesh cannot give accurate separable parts. The on-screen label reads "Simplified reconstruction: a teaching model, not measured CAD".

Verified by reading Wikipedia, "Ford Model T" (fetched 2026-10-06; tertiary, already ledger source `s-wiki-modelt`), new ledger claims `c-modelt-drivetrain`, `c-modelt-magneto`, `c-modelt-chassis`:
- 177 cubic-inch inline four-cylinder engine, 20 hp; introduced 1 October 1908.
- Two-speed planetary transmission; left pedal engages the transmission, centre pedal reverse, right pedal the transmission brake.
- Low-voltage magneto incorporated in the flywheel.
- Transversely mounted semi-elliptical spring for each of the front and rear beam axles.
- Wheelbase 100.0 in; wooden artillery wheels (steel welded-spoke wheels only in 1926-27); fuel tank under the front seat; throttle lever on the steering wheel; single universal joint to a torque tube driving the rear axle; runs on gasoline, kerosene or ethanol.
- A web search also surfaced The Henry Ford's "Diagram of the Ford Model T Magneto and Transmission, Published in Ford Times, October 1910" (thehenryford.org artifact 88714), consistent with the above; its page was listed in search results but not read in full, so it is NOT cited.

Not verified, so not claimed in the panel (shown as "Modelling choice" or kept out of the sentence):
- Separate spark-advance lever on the steering column (widely known, not read in a source here); only the throttle lever is claimed.
- Ladder-style frame construction, number and exact shape of springs leaves, spoke count (12 modelled), wheel and tyre sizes, lamp type (oil, acetylene, electric) and years, radiator and hood shapes, seat arrangement, differential detail, gravity-fed fuel. All proportions other than the 100-inch wheelbase are approximate. The model shows a generic 1909-1926 touring layout and does not model the starter, wiring, carburettor, steering gear internals, top or windshield detail.
- The model is not a specific surviving car and not measured from drawings.
