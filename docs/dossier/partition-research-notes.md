# Partition of India 1947 dossier: research notes

Prepared 2026-10-06 for specialist review. Files: `data/dossier/partition.ts`, `partitionAssets.json`, `partitionScenes.ts`, `partitionTimeline.ts`, `partitionRecon.json` (empty), `tests/dossierPartition.test.ts`. Registry id `partition-1947` (flagged `artPending`).

Totals: 108 claims (36 established, 48 probable, 22 contested, 2 tradition), 57 ledger sources, 37 cleared image assets, 12 rooms, 22 nodes (each at 5 reading depths), 8 planned reconstruction scenes (no cast, no people, none painted), 13 timeline milestones.

## Method and honest limits

- No image was generated and no paid API or Magnific/MCP credit was used. All assets are real archive material found through the Wikimedia Commons API (licence, creator, credit and size read from each file record; every asset URL returned HTTP 200).
- Web tools return summaries, not always full text. Texts actually read, in the part that is quoted: the Radcliffe reports (Wikisource transcription of the Gazette of India Extraordinary, 17 Aug 1947: Punjab report paragraphs 1-12, the Sylhet closing paragraphs 13-14), the Indian Independence Act 1947 (legislation.gov.uk: sections 1, 2 and 7 and the Royal Assent date, via a fetched summary), the operative paragraph of the Lahore Resolution (indiaofthepast.org), Jinnah's 11 Aug 1947 address (Pritchett's transcription, three passages), and Nehru's "Tryst with Destiny" (Wikisource, full text). These are the only direct quotations in the exhibit, plus one short phrase from a survivor as printed in an NEH article.
- Everything else is paraphrase. Many dates and figures come from encyclopaedia (Wikipedia, Banglapedia) or press excerpts returned by search, and from standard scholarship cited from bibliographic knowledge (Khan, Talbot and Singh, Butalia, Menon and Bhasin, Jalal, Chester, Pandey, Zamindar, Guha, Hajari and others). The books themselves were NOT opened in this session. Claims resting only on those are graded probable at most and carry notes saying what was not checked.
- Fetch failures: the Talbot PDF on perspectivia.net returned a bot wall; Wikipedia's "Evacuee property (India)" returned 404; the Lahore Resolution on Wikisource returned 404 (the text came from indiaofthepast.org instead); the Wikipedia Partition article came back only in part; the Wikipedia Mountbatten Plan fetch cut off before the provisions.
- Texts by Faiz, Manto, Amrita Pritam, Khushwant Singh, Sahni and the films of Ghatak are in copyright in most jurisdictions and none could be read in a public-domain edition here. They are cited by title and theme only. A test fails if the opening lines of the Faiz or Pritam poems appear.
- Survivor testimony: a single short phrase (Hardeep Singh, "It can happen here also.") as given in Bhalla's NEH article (Summer 2022). It reached this exhibit through a fetched summary and must be checked against the printed article and the 1947 Partition Archive. No other testimony is reproduced; the Archive's own interviews should be linked and licensed with its permission.

## Sources actually consulted (URLs)

- Radcliffe reports: https://en.wikisource.org/wiki/Radcliffe_Award (index) and the page transcriptions of https://commons.wikimedia.org/wiki/File:Report_of_the_Bengal_Boundary_Commission_(Radcliffe_Award).pdf (pages 7-12 read)
- Indian Independence Act 1947: https://www.legislation.gov.uk/ukpga/Geo6/10-11/30/enacted
- Lahore Resolution: https://indiaofthepast.org/node/186
- Jinnah, 11 Aug 1947: https://franpritchett.com/00islamlinks/txt_jinnah_assembly_1947.html
- Nehru, Tryst with Destiny: https://en.wikisource.org/wiki/A_Tryst_With_Destiny
- NEH, Bhalla 2022: https://www.neh.gov/article/story-1947-partition-told-people-who-were-there
- National Army Museum: https://www.nam.ac.uk/explore/independence-and-partition-1947
- Wikipedia: Partition of India; Mountbatten Plan; Assassination of Mahatma Gandhi (fetched, partial); Direct Action Day, Noakhali riots, 1946 Bihar riots, 1947 NWFP referendum, 1947 Sylhet referendum, Instrument of Accession (Jammu and Kashmir), 1948 Junagadh referendum, Indian annexation of Hyderabad, Demographics of Karachi, Samjhauta Express, Indus Waters Treaty, Gurdwara Darbar Sahib Kartarpur, The 1947 Partition Archive (search excerpts).
- Banglapedia: Cabinet Mission, Sylhet Referendum 1947 (search excerpts); Radcliffe Award (appeared in results, not fetched).
- The Wire on Delhi's post-Partition demography (search excerpt; journalism, flagged in the ledger).
- Wikimedia Commons file records for all 37 assets (API metadata).

## Assets (37): licence and strength of provenance

All are Wikimedia Commons records; each asset's `rights.verifiedAt` is its Commons page and `rightsNote` in `partitionAssets.json` explains the assessment. "Strength" is my judgement of how safe the Commons tag is. Commons "public domain" tags for South Asian photographs of the 1940s often rest on claims (expiry of the Indian or Pakistani term, or "unknown author") that do not settle US law (URAA restoration). A rights specialist must review every entry marked MODERATE or WEAK before public release.

| Asset id | Commons file | Status | Strength |
|---|---|---|---|
| a-radcliffe-punjab-map | Map of the partition boundaries in the Punjab, Research Dept., F.O., September, 1948.jpg | public-domain | moderate-strong |
| a-radcliffe-bengal-map | Map of the partition boundaries in Bengal and Assam, Research Dept., F.O., September, 1948.jpg | public-domain | moderate-strong |
| a-radcliffe-award-report | Report of the Bengal Boundary Commission (Radcliffe Award).pdf (page 1 of the scan) | public-domain (Commons tag EdictGov-India) | strong |
| a-punjab-gsgs-map-1947 | Partition map of Punjab ... Geographical Section, General Staff, 1947 (with markups ...).jpg | public-domain | moderate |
| a-independence-act-p1 | First-page of Indian Independence Act, 1947 (10 & 11 Geo. 6. Ch. 30.).jpg | public-domain | strong |
| a-bengal-1905-map | BengalPartition1905 Map.png (XrysD) | cc-by-sa 4.0 | strong |
| a-muslim-league-1906 | All India Muslim League Dhaka 1906.jpg | public-domain | strong |
| a-congress-1885 | 1st INC1885.jpg | public-domain | strong |
| a-siege-delhi-1857 | Siege of Delhi during the Mutiny.jpg (Innes, 1885) | public-domain | strong |
| a-bahadur-shah-1858 | Bahadur Shah Zafar.jpg (British Library) | public-domain | strong |
| a-lahore-1940-committee | All India Muslim League Lahore Resolution Working Group March 1940.jpg | public-domain | WEAK provenance (unknown photographer, family-history scan) |
| a-cripps-gandhi-1942 | Stafford Cripps and Mahatma Gandhi in 1942.jpg (Photo Division, Govt of India) | public-domain | MODERATE |
| a-quit-india-1942 | Nehru Gandhi 1942.jpg | public-domain | WEAK provenance |
| a-cabinet-mission-jinnah | Cabinet mission to india1946.jpg (British government photograph) | public-domain | MODERATE |
| a-cabinet-mission-muslim-leaders | British Cabinet Mission To India, 1946 IND5092.jpg (IWM) | public-domain | MODERATE |
| a-jinnah-gandhi-1944 | Jinnah and Gandhi.jpg (Kulwant Roy, 1945 Lahore book) | public-domain | MODERATE |
| a-jinnah-1945 | Jinnah1945c.jpg | public-domain | MODERATE |
| a-mountbatten-jinnah-1947 | Mountbatten Jinnah.jpg (IWM IND 5302) | public-domain | MODERATE |
| a-radcliffe-portrait | Cyril-John-Radcliffe-1st-Viscount-Radcliffe.jpg (Elliott & Fry, NPG) | cc-by 3.0 | MODERATE |
| a-nehru-gandhi-patel-1946 | Nehru, Gandhi and Patel AICC 1946.jpg (Kulwant Roy; LIFE archive) | public-domain | WEAK-MODERATE |
| a-direct-action-rally | Muslim League rally on Direct Action Day.jpg | public-domain | WEAK provenance (gated at high) |
| a-junagadh-instrument | Instrument of Accession of Junagadh to Dominion of Pakistan.pdf (page 1) | public-domain | MODERATE |
| a-white-paper-states | White Paper on Indian States (1948).pdf (page 1) | public-domain | MODERATE |
| a-hari-singh-1944 | Sir Hari Singh Bahadur ... 1944.jpg (Bassano, NPG) | public-domain | MODERATE |
| a-nizam-1911 | Usman Ali Khan.jpg (Bourne & Shepherd, 1911) | public-domain | strong |
| a-delhi-station-1947 | Refugees taken to camps from Delhi Station.jpg (Photo Division, 27 Sep 1947) | public-domain | MODERATE (gated at middle) |
| a-independence-illuminations | Illuminations in Delhi on Independence Day in 1947.jpg | public-domain | MODERATE |
| a-jinnah-14aug-1947 | Jinnah speaking on 14 August 1947.jpg (National Archives of Pakistan) | public-domain | MODERATE |
| a-ashti-special-1948 | Ashti Special carrying Mahatma Gandhi's ashes ... .jpg | public-domain | MODERATE (gated at middle) |
| a-birla-house | Birla HouseGandhi Smriti, New Delhi.jpg (Gaurav Vaidya) | cc-by 3.0 | strong |
| a-partition-museum | Partition Museum, Amritsar, India.jpg (Nalbarian) | cc-by-sa 4.0 | strong |
| a-wagah | Attari - Wagah border.jpg (Eclicks by Bunny) | cc-by-sa 4.0 | strong |
| a-kartarpur-view | The Kartarpur Corridor view from Indian side.jpg (Harvinder Chandigarh) | cc-by-sa 4.0 | strong |
| a-1971-surrender | Pakistani Instrument of Surrender ... Dhaka.jpg (Niasoh) | public-domain dedication | MODERATE (the document's own status) |
| a-manto | Saadat Hasan Manto.jpg | public-domain | WEAK-MODERATE |
| a-faiz | Faiz Ahmed Faiz (cropped).jpg (Titodutta) | cc-by-sa 3.0 | strong |
| a-overview-map | Partition of India 1947 en.svg | cc-by-sa 4.0 | strong |

Not used on purpose: Henri Cartier-Bresson "Dancing Refugees at Kurukshetra" (tagged PD on Commons but almost certainly in copyright through Magnum); photographs of the Calcutta 1946 killings (graphic); refugee-train photographs (unclear provenance and distressing); the Gandhi-in-Noakhali 1946 photograph (no source recorded on Commons); the Patel "own work" portrait (provenance doubtful); Khushwant Singh, Amrita Pritam and Ritwik Ghatak photographs (rights unclear); the Life Magazine Operation Polo photograph (copyright likely). No image that shows a corpse, an injury or a massacre is included. The only crowd, refugee or mourning images are gated: `a-direct-action-rally` (a rally, not violence) at `high`; `a-delhi-station-1947` (buses taking refugees to camps) and `a-ashti-special-1948` (people waiting for Gandhi's ashes) at `middle`. The opening montage uses ungated maps, a meeting photograph, the Delhi illuminations and the Kartarpur view only.

The historical maps of the line are `a-radcliffe-punjab-map` and `a-radcliffe-bengal-map` (UK Foreign Office, September 1948, printed at the end of Mansergh vol. 12; the Commons description says they show both the notional boundaries of the First Schedule of the Act and the boundaries as finally demarcated), `a-punjab-gsgs-map-1947` (War Office), and `a-radcliffe-award-report` (page 1 of the gazette scan, which opens with the Bengal report). The map annexed to each award is marked "Not published" in the gazette as transcribed, so the Foreign Office maps are the closest verified real cartographic record found.

## Claims I am least sure of

1. Death toll, displacement and abducted women (c-deaths, c-displaced, c-women, c-missing, c-census-migrants): ranges are given, but the individual attributions (Moon about 200,000; Khosla about 500,000; Butalia about a million; Talbot and Singh 14-16 million; about 75,000 abducted; Bharadwaj et al. 1.26 and 0.84 million missing) come from search excerpts, not the books. The note on "official counts" of recovered women is vague on purpose because the official figures were not verified.
2. Direct Action Day, Noakhali and Bihar tolls (c-dad, c-noakhali, c-bihar): from Wikipedia excerpts; the Bihar figures (2,000 / 5,000 / 30,000) and the Noakhali figures (hundreds / about 5,000) need checking against Khan, Chatterji and the original reports.
3. c-bengal-line (Calcutta to India; Chittagong Hill Tracts to East Pakistan; Murshidabad to India and Khulna to Pakistan) is standard but was not read in the gazette; check against the schedule and a map.
4. c-radcliffe-india (arrival 8 July 1947; never in India before) and c-radcliffe-papers (burned papers; graded tradition).
5. c-date-tradition (15 August as the anniversary of Japan's surrender) graded tradition; the 4 June press conference date is standard but taken from secondary summaries.
6. Hyderabad (c-hyderabad-deaths): the Sundarlal 27,000 to 40,000 figure was seen only in an encyclopaedia excerpt; "other writers give much higher" and "far lower" official figures are stated generally. This is the weakest figure in the exhibit; a specialist on Hyderabad should check it.
7. Kashmir (c-kashmir-ioa, c-kashmir-status, c-war-1948): the dates are widely repeated, but the sequence questions (signature versus troop landing) are contested and not resolved here. The Karachi Agreement date (July 1949) was not checked.
8. Delhi and Karachi demography (c-delhi, c-karachi): journalism and an encyclopaedia citing census data; check against the 1941 and 1951 tables.
9. c-1937 (Congress "five of eleven" provinces), c-1945-46 (30 of 30 Muslim central seats), c-assembly-votes, c-punjab-politics, c-talks-1944, c-gandhi-calcutta (dates of the Calcutta fast), c-museum (Amritsar museum opened 2017), c-pritam (date of the poem), c-sahni (1988 television version), c-states-number (565 states, about two-fifths of the land).
10. Tone for the youngest readers: the Pre-K-2 and Grade 3-5 texts for rooms 3, 7 and 8 are deliberately gentle and truthful but have not been tested with children.

## Needs a human specialist before release

- A South Asian historian (Punjab and Bengal, plus one for Kashmir and Hyderabad) to check every figure above against the books and to review the even-handedness of the framing: Congress, the League, the British, the princely rulers, and Hindu, Muslim and Sikh communities. The statement "Hindus, Muslims and Sikhs were all both victims and perpetrators" is defended in the ledger note but should be reviewed by readers from each community.
- Partition survivors' communities and the 1947 Partition Archive: review of the "Voices" and "Women, abduction and the recovery operations" nodes; permission and licence terms for any testimony; whether and how to present the material on families killing their own women.
- Under-covered: Dalit and Scheduled Caste communities (Ambedkar appears only in a Commons search, not in the text), tribal and Adivasi communities, Sindh, Assam, Baluchistan and the Frontier, Pashtun and Baloch voices, Anglo-Indians, Ahmadis, Christians and Parsis; the eastern partition is thinner than the western.
- A rights specialist for the MODERATE and WEAK image provenance noted above.
- Terminology: "Partition", "independence", "taqsim", "batwara" are handled in c-terminology; check spelling and usage with native readers of Urdu, Hindi, Punjabi and Bengali.

## Planned reconstruction scenes (none painted; places and objects only, no people)

At about 75 credits per image at 2k, eight scenes cost about 600 credits. IDs: `recon-census-office` (r1), `recon-simla-table` (r5), `recon-radcliffe-desk` (r5), `recon-empty-platform` (r7), `recon-camp-tents` (r8), `recon-vacant-house` (r8), `recon-boundary-pillar` (r9), `recon-kartarpur-dawn` (r9). The two displacement scenes (platform, vacant house) show only an empty place and the things left behind, with no passengers, no incident and no violence. When paintings exist, add them to `partitionRecon.json` (files at `/dossier/partition/recon/<id>.jpg`), set `artPending` to false, and add a Fabula film and a generated Tela timeline (the milestones and key-document board are already defined in `partitionTimeline.ts`; the `.tela.json` has not been generated).

## Changes outside the new files

- `data/dossier/registry.ts`: one new entry and one optional interface field, `artPending?: boolean`. No `telaTimeline` or `fabulaFilm` is registered because neither file exists yet.
- `tests/dossierRegistry.test.ts`: the exhibit-list assertion now names four ids and its title says "four exhibits"; the per-exhibit checks for 8 or more paintings and for a Fabula film are skipped when `artPending` is set (validation and the other checks still run on the Partition exhibit).
