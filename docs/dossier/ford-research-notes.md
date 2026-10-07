# Henry Ford dossier: research notes

Built 2026-10-06. Files: `data/dossier/ford.ts`, `fordAssets.json`, `fordScenes.ts`, `fordTimeline.ts`, `tests/dossierFord.test.ts`.
Counts: 62 claims (31 established, 22 probable, 8 contested, 1 tradition), 29 sources, 14 cleared assets, 7 rooms, 13 nodes, 8 reconstruction scenes, 16 milestones.

## Method and honest limits

Research was done through web search and page fetches (summarized by a fast model), plus one full primary text downloaded and grepped directly. Consequences:

- Dates and figures marked `established` were checked in at least two independent places, or in Ford's own text plus an archive page.
- The five scholarly books (Watts, Baldwin, Hounshell, Grandin; Lacey and Brinkley were not used) were **not read**. Each is cited only for a point confirmed through a review or publisher summary, with **no page numbers**. A historian should confirm each scholarly attribution against the book itself.
- Wikipedia pages are listed as `secondary` sources and labelled tertiary in their citation lines. They were used to find dates and were cross-checked against an archive or primary source wherever one exists. Claims resting mainly on Wikipedia are marked `probable` where the stakes are high.
- Some archive pages (thehenryford.org) were seen through search-result snippets plus one or two fetches; a few URLs I guessed returned 404 and were not used.

## Sources actually consulted (URLs)

Primary
- Ford and Crowther, *My Life and Work* (Doubleday, Page, 1922): https://gutenberg.org/cache/epub/7213/pg7213-images.html (full text downloaded and searched; every quotation in the dossier was verified here).

Archive and institutional
- The Henry Ford, "Ford's Five-Dollar Day": https://www.thehenryford.org/collections/explore/articles/fords-five-dollar-day
- The Henry Ford, "Ford Methods and the Ford Shops": https://www.thehenryford.org/collections/explore/articles/ford-methods-and-the-ford-shops
- The Henry Ford K-12 guide, Assembly Line: https://askus.thehenryford.org/K12/faq/433848
- The Henry Ford, "Edison and Ford: A Lasting Friendship": https://www.thehenryford.org/collections/explore/sets/detail/edison-and-ford-a-lasting-friendship
- The Henry Ford, "Henry Ford and Anti-Semitism": https://www.thehenryford.org/collections/explore/popular-research-topics/henry-ford-and-anti-semitism
- Walter P. Reuther Library, "The Battle of the Overpass": https://reuther.wayne.edu/ex/exhibits/battle.html

Secondary and scholarly summaries
- Review of Baldwin, *Henry Ford and the Jews* (O'Connell): https://marcuse.faculty.history.ucsb.edu/classes/133d/essays/Baldwin2001OConnell083.htm
- Publisher / review pages for Baldwin, Watts, Hounshell and Grandin (listed in the ledger).
- Dartmouth Alumni Magazine, "The Ford Peace Expedition of 1915" (1961): https://archive.dartmouthalumnimagazine.com/article/1961/3/1/the-ford-peace-expedition-of-1915 (seen via search result only)
- History.com, "Ford signs first contract with autoworkers union": https://www.history.com/this-day-in-history/ford-signs-first-contract-with-autoworkers-union (seen via search result only)
- Center for Online Judaic Studies, 1938 Grand Cross: https://cojs.org/?p=38673 (seen via search result only)
- ClickOnDetroit, Ford's death: https://clickondetroit.com/features/2024/04/07/77-years-ago-while-rouge-river-floods-dearborn-henry-ford-dies-at-83 (seen via search result only)
- Wikipedia: Henry Ford, Ford Model T, Dodge v. Ford, Ford River Rouge Complex, The Dearborn Independent, The International Jew, Aaron Sapiro, Ford Hunger March, Battle of the Overpass, Willow Run, Edsel Ford, Ford Foundation, Fordlândia.

## What was verified (highlights)

- Ford's own words, exact: "I will build a motor car for the great multitude. It will be large enough for the family..." (My Life and Work; used as the entrance epigraph). Birth date and farm; road engine at twelve; watch; Edison Illuminating Company salary and chief-engineer rise; the 1914 profit-sharing plan "in which the minimum wage ... was five dollars a day"; the "one hour thirty-three minutes" chassis time; the Peace Ship defense; and the full "Studies in the Jewish Question" passage at the end of chapter XVII, "Things in General." The wording in room 5 quotes only short fragments confirmed there ("racial at its source," "influences and ideals rather than persons," "one racial source," "prejudice or hatred against persons," "the question is wholly in the Jews' hands").
- Ford's own text puts his first meeting with Edison "probably about 1887" at Atlantic City, against The Henry Ford's 1896 Brooklyn account. Modelled as a contested claim and a source-reading node.
- Moving line staged in 1913 (magnetos about 1 April, chassis August); 12.5 hours to 93 minutes (The Henry Ford and Ford's own book agree).
- Five Dollar Day announced 5 January 1914; conditions; riots and fire hoses; Sociological Department largely dissolved by about 1921.
- Dearborn Independent series from 22 May 1920 ("The International Jew: The World's Problem"), 91 weeks, Protocols forgery; Sapiro libel suit; trial from March 1927; retraction 30 June 1927; paper closed end of 1927.
- Hunger March 7 March 1932 (four killed that day, fifth later); Overpass 26 May 1937 (Kilpatrick photographs); UAW contract 20 June 1941 after strike from 1 April.
- 1938 Grand Cross, 30 July 1938.

## Contested items and how they are modelled

1. `c-edison-meet`: 1887 (Ford) vs 1896 (The Henry Ford).
2. `c-line-credit`: who devised the moving line (Avery, Martin, Sorensen, Wills; Sorensen's later claims; Hounshell's collective-development frame).
3. `c-socio-view`: reform or control; motives for the Five Dollar Day.
4. `c-ford-role`: how much Ford wrote, read or approved in the Independent (Cameron's testimony vs Baldwin and others). Cameron and Liebold's roles are stated separately as `probable` (`c-authorship`).
5. `c-retraction-know`: whether Ford read or meant the 1927 apology (Liebold: never read it; forgery claims noted as not established).
6. `c-settlement`: Sapiro settlement terms. Sources disagree on whether money was paid; no figure is stated.
7. `c-edsel-stress`: whether the conflicts hastened Edsel's death (documented cause: stomach cancer).
8. `c-hist`: how scholars weigh achievements against antisemitism and labor record (Watts vs Baldwin framing).
9. `c-clara` (tradition): Clara Ford urging the 1941 contract.

## Could NOT verify, and left out or softened

- The exact text of Ford's 1927 retraction: The Henry Ford and BJPA copies were image-only PDFs I could not read. Only the date, the Louis Marshall drafting and the result are stated; no quotation.
- Any reliable cash figure for the Sapiro settlement.
- Hitler's portrait of Ford in Munich: widely reported, traced only to secondary summaries; marked `probable`. Mein Kampf naming Ford and Schirach's statement are from secondary summaries as well.
- That Ford was the first American to receive the Grand Cross: widely repeated, not independently confirmed; the dossier does not assert "first."
- Pool and Pool (1978) and other claims that Bennett forged the apology signature, and a reported 1940 remark by Ford about republishing the book, appeared only in a Wikipedia summary; not used as claims beyond a note that forgery claims are not established.
- The "any color so long as it is black" quotation: not used (timeline of black-only paint was seen only in Wikipedia; no verified source for the sentence).
- Rural electrification, soybean work, Greenfield Village details beyond the Jubilee and the Ford Foundation's role: not sourced well enough to include.
- Ford's personal pre-1902 photographs: none cleared. No photograph of Ford as a child or young man was found, so the variants start at age 39.
- Lacey, *Ford: The Men and the Machine*, and Brinkley, *Wheels for the World*: not consulted; not cited.
- Fordlândia and Willow Run figures: counts vary by source (Willow Run complete B-24s about 6,800 to 7,000, about 8,600 with kits; cycle time 59 to 63 minutes). The ledger keeps ranges and a note.
- Turnover rate before 1914: sources give 370 and 380 percent; noted.

## Open questions for a historian reviewer

1. Confirm each scholarly attribution (Watts, Baldwin, Hounshell, Grandin) against the books and add page numbers.
2. Replace Wikipedia-based claims with primary or monograph citations: 1903 incorporation details, Dodge v. Ford dividend, Rouge workforce, Willow Run numbers, Hunger March counts.
3. Provide an authoritative text and archive record of the 1927 retraction and the Sapiro settlement (Benson Ford Research Center, American Jewish Committee papers).
4. Is the 1938 award rightly characterized as "a high Nazi honor"? Check the American and German press of 31 July 1938 and Ford's own statements.
5. Tone check on the Pre-K to Grade 2 text for the antisemitism room: it states plainly that the articles were untrue and unkind and does not describe violence or the Holocaust. Is that the right level?
6. Should the dossier add a room or node on Ford's Jewish critics and defenders at the time (Louis Marshall, Sapiro, the 1921 condemnation signers) and on the later fate of *The International Jew*?
7. Fabula/Magnific scenes are only specified, not generated.

## Assets: used

All pulled through `searchCommons` from Wikimedia Commons, each recording its licence, credit line and record URL; all are `public-domain` on Commons (US pre-1929 publication or US federal government work). Ford is the standing man in the 1902 photograph per the Commons caption; I could not independently confirm which figure is Ford versus Barney Oldfield beyond that caption and the descriptor.

Portraits: 1902 (with Oldfield and the 999), 1915 Peace Ship montage, 1915 group with Edison and Firestone, 1919 Hartsook, c.1920 fishing trip (LoC), 1927 White House (National Photo Co., LoC), 1929 with Edison (Edison NHP), 1938 leaving the White House and 1938 in a car (Harris and Ewing, LoC).
Documents: 1913 assembly line, Highland Park shift change (Detroit Publishing Co.), The Dearborn Independent 22 May 1920, Rouge aerial (Detroit Publishing Co.), Willow Run (Howard Hollem, OWI/LoC).

## Assets: rejected

- "Ford Strikers Riot" (3 April 1941, Milton Brooks): labelled public domain on Commons, but it is a Detroit News photograph from 1941; the label is plausible only if the copyright was not renewed. Rejected as unverified.
- Dutch Spaarnestad image titled "Henry Ford 1863-1942": date in title is wrong, rights claim doubtful.
- Photographs of the 1896 Quadricycle replica labelled public domain, and the 1932 and 1939 Ford cars and museum interiors (CC BY-SA): not needed; replica photos carry unclear rights.
- John Burroughs and Henry Ford on the Quadricycle (Internet Archive book image, Commons date "1825" is wrong; actual date unknown): rejected for dating.
- Commons "Henry Ford 1919" and its crops: same photograph as Hartsook; the LoC-derived Hartsook scan used instead.
- Photos with Hoover, Edison and others (1929, various): only the Ford-and-Edison one kept; others redundant.
- LoC Prints and Photographs search via the repo adapter did not return usable candidates within the timeout; all assets came through Commons mirrors of LoC and NPS holdings.

## Likeness notes (from viewing the images)

Lean, narrow-faced man, high forehead, pale deep-set eyes, thin straight brows, prominent ears, thin mouth with a faint wry smile, clean-shaven in every photograph. Hair light and thinning by the late fifties; silver-white and sparse by the late sixties; face increasingly gaunt by 1938. There is no cleared photograph after 1938, so scenes for the 1940s should extrapolate from the 1938 references. The 1902 reference is small and shows him in a bowler and dark overcoat, so the "prime" variant (ages 39 to 51) is thinly supported.
