/**
 * Henry Ford — Dossier (biography). A rigorous account, not a tribute: the engineering and the wages
 * stand beside The Dearborn Independent, the labor violence and the Nazi-era honor.
 *
 * Every sentence in a node's `text` rests on claims in the ledger. Where sources or scholars
 * disagree, the claim is marked contested and carries a note. No direct quotation appears unless the
 * exact words were checked in a fetched text (My Life and Work, Project Gutenberg #7213).
 * Likeness descriptors were written by viewing the actual reference photographs listed in fordAssets.json.
 * No photograph of Ford before his late thirties was found; scenes below age 39 are silhouette/back-view.
 */
import type { Claim, CharacterBible, Dossier, DossierAsset, Room, SourceRef } from '../../services/dossier/dossierTypes';
import rawAssets from './fordAssets.json';

const sources: SourceRef[] = [
  { id: 's-mylife', kind: 'primary', citation: 'Henry Ford, in collaboration with Samuel Crowther, My Life and Work (Garden City, N.Y.: Doubleday, Page, 1922). Text consulted via Project Gutenberg eBook #7213.', url: 'https://www.gutenberg.org/ebooks/7213' },
  { id: 's-watts', kind: 'scholarly', citation: 'Steven Watts, The People\'s Tycoon: Henry Ford and the American Century (New York: Alfred A. Knopf, 2005). Consulted through publisher and review summaries; no page numbers cited.', url: 'https://www.kirkusreviews.com/book-reviews/steven-watts/the-peoples-tycoon' },
  { id: 's-baldwin', kind: 'scholarly', citation: 'Neil Baldwin, Henry Ford and the Jews: The Mass Production of Hate (New York: PublicAffairs, 2001). Consulted through scholarly review (O\'Connell, 2001) and publisher summary; no page numbers cited.', url: 'https://www.hachettebookgroup.com/titles/neil-baldwin/henry-ford-and-the-jews/9781586481636/' },
  { id: 's-oconnell', kind: 'scholarly', citation: 'Review of Neil Baldwin, Henry Ford and the Jews (2001), University of California, Santa Barbara course reading (Marcuse, History 133d).', url: 'https://marcuse.faculty.history.ucsb.edu/classes/133d/essays/Baldwin2001OConnell083.htm' },
  { id: 's-hounshell', kind: 'scholarly', citation: 'David A. Hounshell, From the American System to Mass Production, 1800–1932 (Baltimore: Johns Hopkins University Press, 1984). Consulted through publisher and review summaries; no page numbers cited.', url: 'https://press.jhu.edu/books/title/1631/american-system-mass-production-1800-1932' },
  { id: 's-grandin', kind: 'scholarly', citation: 'Greg Grandin, Fordlandia: The Rise and Fall of Henry Ford\'s Forgotten Jungle City (New York: Metropolitan Books, 2009). Consulted through review summaries; no page numbers cited.', url: 'https://www.kirkusreviews.com/book-reviews/greg-grandin/fordlandia-2/' },
  { id: 's-thf-5day', kind: 'archive', citation: 'The Henry Ford (Benson Ford Research Center), "Ford\'s Five-Dollar Day," collections article.', url: 'https://www.thehenryford.org/collections/explore/articles/fords-five-dollar-day' },
  { id: 's-thf-methods', kind: 'archive', citation: 'The Henry Ford, "Ford Methods and the Ford Shops," collections article (discusses Horace L. Arnold and Fay L. Faurote, Ford Methods and the Ford Shops, 1915).', url: 'https://www.thehenryford.org/collections/explore/articles/ford-methods-and-the-ford-shops' },
  { id: 's-thf-k12', kind: 'archive', citation: 'The Henry Ford, K-12 Research Guide: Assembly Line.', url: 'https://askus.thehenryford.org/K12/faq/433848' },
  { id: 's-thf-edison', kind: 'archive', citation: 'The Henry Ford, "Edison and Ford: A Lasting Friendship," collections set.', url: 'https://www.thehenryford.org/collections/explore/sets/detail/edison-and-ford-a-lasting-friendship' },
  { id: 's-thf-antisem', kind: 'archive', citation: 'The Henry Ford, "Henry Ford and Anti-Semitism," popular research topic.', url: 'https://www.thehenryford.org/collections/explore/popular-research-topics/henry-ford-and-anti-semitism' },
  { id: 's-reuther', kind: 'archive', citation: 'Walter P. Reuther Library, Wayne State University, "The Battle of the Overpass" exhibit.', url: 'https://reuther.wayne.edu/ex/exhibits/battle.html' },
  { id: 's-history-1941', kind: 'secondary', citation: 'History.com, "Ford signs first contract with autoworkers union" (20 June 1941).', url: 'https://www.history.com/this-day-in-history/ford-signs-first-contract-with-autoworkers-union' },
  { id: 's-peace', kind: 'secondary', citation: '"The Ford Peace Expedition of 1915," Dartmouth Alumni Magazine, March 1961.', url: 'https://archive.dartmouthalumnimagazine.com/article/1961/3/1/the-ford-peace-expedition-of-1915' },
  { id: 's-cojs', kind: 'secondary', citation: 'Center for Online Judaic Studies, "1938 Henry Ford Receives the Grand Cross of German Eagle from Nazis."', url: 'https://cojs.org/?p=38673' },
  { id: 's-flood', kind: 'secondary', citation: 'ClickOnDetroit (WDIV), "77 years ago, while Rouge River floods Dearborn, Henry Ford dies at 83" (2024), local-history feature.', url: 'https://clickondetroit.com/features/2024/04/07/77-years-ago-while-rouge-river-floods-dearborn-henry-ford-dies-at-83' },
  { id: 's-wiki-ford', kind: 'secondary', citation: 'Wikipedia, "Henry Ford" (tertiary; used to locate dates, each cross-checked where a primary or archive source is also cited).', url: 'https://en.wikipedia.org/wiki/Henry_Ford' },
  { id: 's-wiki-modelt', kind: 'secondary', citation: 'Wikipedia, "Ford Model T" (tertiary; dates and production figures).', url: 'https://en.wikipedia.org/wiki/Ford_Model_T' },
  { id: 's-wiki-dodge', kind: 'secondary', citation: 'Wikipedia, "Dodge v. Ford Motor Co." (tertiary).', url: 'https://en.wikipedia.org/wiki/Dodge_v._Ford_Motor_Co.' },
  { id: 's-wiki-rouge', kind: 'secondary', citation: 'Wikipedia, "Ford River Rouge Complex" (tertiary).', url: 'https://en.wikipedia.org/wiki/Ford_River_Rouge_Complex' },
  { id: 's-wiki-dearborn', kind: 'secondary', citation: 'Wikipedia, "The Dearborn Independent" (tertiary; discussion of historians\' positions).', url: 'https://en.wikipedia.org/wiki/The_Dearborn_Independent' },
  { id: 's-wiki-intl', kind: 'secondary', citation: 'Wikipedia, "The International Jew" (tertiary).', url: 'https://en.wikipedia.org/wiki/The_International_Jew' },
  { id: 's-wiki-sapiro', kind: 'secondary', citation: 'Wikipedia, "Aaron Sapiro" (tertiary).', url: 'https://en.wikipedia.org/wiki/Aaron_Sapiro' },
  { id: 's-wiki-hunger', kind: 'secondary', citation: 'Wikipedia, "Ford Hunger March" (tertiary).', url: 'https://en.wikipedia.org/wiki/Ford_Hunger_March' },
  { id: 's-wiki-overpass', kind: 'secondary', citation: 'Wikipedia, "Battle of the Overpass" (tertiary).', url: 'https://en.wikipedia.org/wiki/Battle_of_the_Overpass' },
  { id: 's-wiki-willow', kind: 'secondary', citation: 'Wikipedia, "Willow Run" (tertiary; B-24 figures vary across sources).', url: 'https://en.wikipedia.org/wiki/Willow_Run' },
  { id: 's-wiki-edsel', kind: 'secondary', citation: 'Wikipedia, "Edsel Ford" (tertiary).', url: 'https://en.wikipedia.org/wiki/Edsel_Ford' },
  { id: 's-wiki-foundation', kind: 'secondary', citation: 'Wikipedia, "Ford Foundation" (tertiary).', url: 'https://en.wikipedia.org/wiki/Ford_Foundation' },
  { id: 's-wiki-fordlandia', kind: 'secondary', citation: 'Wikipedia, "Fordlândia" (tertiary).', url: 'https://en.wikipedia.org/wiki/Fordl%C3%A2ndia' },
];

const claims: Claim[] = [
  // ── Boyhood and apprenticeship ─────────────────────────────────────────
  { id: 'c-born', text: 'Henry Ford was born on 30 July 1863 on a farm in Greenfield Township, near Dearborn, Michigan.', when: '1863-07-30', where: 'Greenfield Township, Michigan', confidence: 'established', sourceIds: ['s-mylife', 's-wiki-ford'] },
  { id: 'c-farm', text: 'Ford wrote later that he disliked farm work and that the labor of farm life pushed him toward machinery and better transportation; he said his toys as a boy were tools.', confidence: 'established', sourceIds: ['s-mylife'], note: undefined },
  { id: 'c-engine-watch', text: 'By his own account he saw a steam road engine at about age twelve, the first vehicle he had seen that was not horse-drawn, and was given a watch the same year; by about fifteen he could do almost any watch repair.', when: '1875-1878', confidence: 'probable', sourceIds: ['s-mylife', 's-wiki-ford'] },
  { id: 'c-mother', text: 'His mother died in 1876, an event that devastated him.', when: '1876', confidence: 'probable', sourceIds: ['s-wiki-ford'] },
  { id: 'c-left-1879', text: 'In 1879, aged sixteen, he left the farm for Detroit and worked as an apprentice machinist.', when: '1879', where: 'Detroit, Michigan', confidence: 'established', sourceIds: ['s-wiki-ford', 's-mylife'] },
  { id: 'c-edison-co', text: 'He went to work for the Edison Illuminating Company of Detroit as an engineer and machinist, rising to chief engineer by 1893, while building gasoline engines in a shed behind his rented house.', when: '1891-1893', where: 'Detroit, Michigan', confidence: 'established', sourceIds: ['s-mylife', 's-wiki-ford'] },

  // ── First cars and the Edison friendship ───────────────────────────────
  { id: 'c-quadricycle', text: 'Ford completed his first gasoline-powered vehicle, the Quadricycle, in 1896 and test-drove it on 4 June.', when: '1896-06-04', where: 'Detroit, Michigan', confidence: 'established', sourceIds: ['s-wiki-ford', 's-thf-edison'] },
  { id: 'c-edison-meet', text: 'Ford met Thomas Edison at a convention of electric-company men and received encouragement for his gasoline carriage; Edison became a lifelong friend.', confidence: 'contested', sourceIds: ['s-mylife', 's-thf-edison'], note: 'The Henry Ford places the meeting at the 1896 Association of Edison Illuminating Companies convention in Brooklyn. In My Life and Work (1922) Ford himself recalled a convention at Atlantic City and wrote that it was "probably about 1887 or thereabouts." The two dates cannot both be right, and the 1887 memory is generally treated as a lapse.' },
  { id: 'c-vagabonds', text: 'From 1916 to 1924 Ford, Edison, the tire maker Harvey Firestone and the naturalist John Burroughs took annual camping trips, calling themselves "the Vagabonds"; President Warren Harding visited the 1921 trip.', when: '1916-1924', confidence: 'established', sourceIds: ['s-thf-edison'] },
  { id: 'c-jubilee', text: 'In 1929 Ford hosted Light\'s Golden Jubilee in Dearborn, marking fifty years of the incandescent lamp and dedicating the Edison Institute; Edison died in 1931.', when: '1929-1931', where: 'Dearborn, Michigan', confidence: 'established', sourceIds: ['s-thf-edison'] },
  { id: 'c-999', text: 'The racing car "999," driven by Barney Oldfield, was built in 1902; Ford later wrote that it advertised the fact that he could build a fast motor car.', when: '1902', confidence: 'probable', sourceIds: ['s-mylife', 's-wiki-ford'] },
  { id: 'c-early-cos', text: 'Ford\'s first car companies did not last: the Detroit Automobile Company (founded 1899) was dissolved in January 1901, and the Henry Ford Company, formed in November 1901, was short-lived.', when: '1899-1902', confidence: 'probable', sourceIds: ['s-wiki-ford'] },
  { id: 'c-fmc', text: 'Ford Motor Company was incorporated on 16 June 1903 with $28,000 in capital; the brothers John and Horace Dodge were among its early investors.', when: '1903-06-16', where: 'Detroit, Michigan', confidence: 'established', sourceIds: ['s-wiki-ford'] },

  // ── The Model T and the moving line ────────────────────────────────────
  { id: 'c-modelt', text: 'Ford introduced the Model T on 1 October 1908; the touring car was priced at about $825.', when: '1908-10-01', confidence: 'established', sourceIds: ['s-wiki-modelt', 's-wiki-ford'] },
  { id: 'c-multitude', text: 'Ford recalled announcing, over the objections of his salesmen, that he would build a single model, a car "for the great multitude," so low in price that a man earning a good salary could own one.', when: '1909', confidence: 'probable', sourceIds: ['s-mylife'], note: undefined },
  { id: 'c-price', text: 'Model T prices fell from the high hundreds of dollars to about $260 by the mid-1920s as volume rose.', when: '1908-1925', confidence: 'probable', sourceIds: ['s-wiki-modelt', 's-thf-k12'], note: 'Sources differ on the starting price ($825 or $850) and the lowest price ($260 or $265 depending on body style and year).' },
  { id: 'c-15m', text: 'About 15 million Model Ts were built; the fifteen-millionth left the line on 26 May 1927, and the Model A followed late that year.', when: '1927', confidence: 'established', sourceIds: ['s-wiki-modelt', 's-thf-k12'] },
  { id: 'c-highland', text: 'Ford moved production to a large new plant at Highland Park, outside Detroit, which opened in 1910.', when: '1910', where: 'Highland Park, Michigan', confidence: 'probable', sourceIds: ['s-mylife', 's-wiki-modelt'] },
  { id: 'c-line-stages', text: 'The moving assembly line came in stages in 1913: flywheel magnetos were moved onto a line around 1 April, and by August the line was extended to complete chassis.', when: '1913', where: 'Highland Park, Michigan', confidence: 'established', sourceIds: ['s-thf-methods', 's-thf-k12'] },
  { id: 'c-93min', text: 'Assembly time for a Model T chassis fell from roughly 12.5 hours to about 93 minutes by early 1914; Ford\'s own book gives the chassis labor time as one hour thirty-three minutes.', when: '1913-1914', confidence: 'established', sourceIds: ['s-thf-methods', 's-mylife'] },
  { id: 'c-line-credit', text: 'The moving line was developed by Ford managers and engineers working together, among them Clarence Avery, Peter Martin, Charles Sorensen and C. Harold Wills.', when: '1913', confidence: 'contested', sourceIds: ['s-wiki-ford', 's-hounshell'], note: 'Individual credit is disputed; Sorensen later claimed a leading role, and Ford\'s own writing presents the line as a company achievement. Hounshell treats mass production as a long technological development in which Ford\'s firm was the decisive actor, not as one man\'s invention.' },

  // ── The Five Dollar Day and the Sociological Department ────────────────
  { id: 'c-5day', text: 'On 5 January 1914 Ford Motor Company announced a minimum of five dollars for an eight-hour day, in place of a nine-hour day paid about $2.30 to $2.34; it was structured as a profit-sharing plan rather than a plain wage rise.', when: '1914-01-05', where: 'Highland Park, Michigan', confidence: 'established', sourceIds: ['s-thf-5day', 's-mylife', 's-wiki-ford'] },
  { id: 'c-turnover', text: 'Before the change, labor turnover at Ford was extremely high, at several hundred percent a year, because workers quit the repetitive line work.', when: '1913', confidence: 'probable', sourceIds: ['s-thf-5day', 's-thf-k12'], note: 'The Henry Ford\'s pages give 370 percent in one place and 380 percent in another.' },
  { id: 'c-crowds', text: 'Within days thousands of job seekers arrived from across the Midwest, rioted at the Highland Park gates, and were turned away with fire hoses in the winter cold; Ford then limited hiring to men who had lived in Detroit for six months.', when: '1914-01', confidence: 'probable', sourceIds: ['s-thf-5day'] },
  { id: 'c-socio', text: 'To qualify for the full bonus workers had to meet standards of home life, such as abstaining from alcohol, keeping a clean home, not taking in boarders and saving; the company\'s Sociological Department sent investigators to check, and the department was largely dissolved by about 1921 amid worker resentment.', when: '1914-1921', confidence: 'established', sourceIds: ['s-thf-5day', 's-wiki-ford'] },
  { id: 'c-socio-view', text: 'Whether the Sociological Department was a sincere effort to lift workers or an invasive system of control over their private lives.', when: '1914-1921', confidence: 'contested', sourceIds: ['s-thf-5day', 's-watts'], note: 'Historians still argue about Ford\'s motives for the Five Dollar Day (retaining workers, building customers, social reform, or publicity) and about how far the home inspections were paternalism. Workers\' own resentment of the intrusions is documented; the weighting of motives is interpretive.' },
  { id: 'c-dodge', text: 'In Dodge v. Ford Motor Co. (1919) the Michigan Supreme Court ordered Ford to pay a special dividend of about $19.3 million rather than spend retained profits on expansion and price cuts.', when: '1919', confidence: 'established', sourceIds: ['s-wiki-dodge'] },
  { id: 'c-rouge', text: 'Construction of the River Rouge complex in Dearborn ran from 1917 to 1928; it brought steelmaking, power and assembly into one vertically integrated site and employed up to about 100,000 people at its peak.', when: '1917-1928', where: 'Dearborn, Michigan', confidence: 'probable', sourceIds: ['s-wiki-rouge', 's-mylife'] },
  { id: 'c-peace-sail', text: 'On 4 December 1915 Ford sailed from Hoboken, New Jersey, aboard the steamship Oscar II with more than a hundred delegates and reporters on a self-financed "Peace Ship" mission to urge an end to World War I; the Hungarian pacifist Rosika Schwimmer helped organize it.', when: '1915-12-04', confidence: 'established', sourceIds: ['s-peace', 's-mylife'] },
  { id: 'c-peace-fail', text: 'Ford left the expedition after reaching Norway, citing illness, and returned to the United States; the mission did not shorten the war and was widely ridiculed, though Ford later said he did not regret trying.', when: '1915-12', confidence: 'established', sourceIds: ['s-peace', 's-mylife'] },

  // ── The Dearborn Independent ───────────────────────────────────────────
  { id: 'c-paper', text: 'Ford\'s secretary Ernest Liebold bought a small Dearborn weekly in 1918, and Ford began publishing The Dearborn Independent in January 1919; it was pushed hard through Ford dealers and reached a very large circulation in the 1920s.', when: '1918-1919', confidence: 'probable', sourceIds: ['s-wiki-dearborn'], note: undefined },
  { id: 'c-series', text: 'On 22 May 1920 The Dearborn Independent began a series titled "The International Jew: The World\'s Problem," which ran for ninety-one weeks.', when: '1920-05-22', confidence: 'established', sourceIds: ['s-thf-antisem', 's-wiki-intl'] },
  { id: 'c-protocols', text: 'The series drew on The Protocols of the Elders of Zion, a notorious forgery first published in Russia in 1903, and presented Jews as responsible for wars, financial manipulation and cultural decline.', when: '1920', confidence: 'established', sourceIds: ['s-thf-antisem', 's-wiki-dearborn'] },
  { id: 'c-volumes', text: 'The articles were reprinted as a four-volume work, The International Jew (1920–1922), distributed in large numbers and translated into many languages, including several German editions.', when: '1920-1922', confidence: 'probable', sourceIds: ['s-wiki-intl'], note: 'Reported print runs and translation counts vary by source (for example 200,000 to 500,000 copies for the first volume; 16 languages).' },
  { id: 'c-halt', text: 'Ford halted the series in January 1922 and resumed within about a year; in 1921 over a hundred prominent Americans, including former President Woodrow Wilson, had publicly condemned the campaign, and Jewish and Christian groups organized protests and boycotts.', when: '1921-1922', confidence: 'probable', sourceIds: ['s-thf-antisem', 's-wiki-dearborn'] },
  { id: 'c-roots', text: 'Historians identify several strands in Ford\'s outlook: populist distrust of bankers, wartime pacifism that blamed war on financiers, and cultural conservatism that saw Jews as agents of modern social decline.', confidence: 'probable', sourceIds: ['s-thf-antisem', 's-watts'] },
  { id: 'c-mylife-jewish', text: 'In My Life and Work (1922), published under Ford\'s name with Samuel Crowther, a chapter defends the campaign under the heading "Studies in the Jewish Question," describing it as exposure of "ideas" rather than of persons, while attributing cultural decline to a single "racial source" and insisting that the nation\'s destiny was to remain Christian.', when: '1922', confidence: 'established', sourceIds: ['s-mylife'], note: undefined },
  { id: 'c-authorship', text: 'William J. Cameron wrote the "Mr. Ford\'s Own Page" editorials and most of the series; Ernest Liebold collected material.', when: '1920-1927', confidence: 'probable', sourceIds: ['s-thf-antisem', 's-wiki-intl'] },
  { id: 'c-ford-role', text: 'How personally involved Ford was in the antisemitic articles.', when: '1920-1927', confidence: 'contested', sourceIds: ['s-wiki-intl', 's-baldwin', 's-oconnell', 's-wiki-dearborn'], note: 'Cameron testified at the Sapiro trial that Ford had nothing to do with the editorials, and Ford and his aides later said Liebold and Cameron acted without his knowledge. Baldwin and other scholars argue that Ford oversaw the paper, gave verbal direction and could not have been unaware; Baldwin describes a "paradoxical" antisemite who may not have grasped his own prejudice. The surviving record does not settle how much Ford wrote, read or approved, but his name, his money, his dealer network and his 1922 book all carried the campaign.' },
  { id: 'c-sapiro', text: 'In April 1924 the Independent attacked the San Francisco lawyer and cooperative organizer Aaron Sapiro; Sapiro sued for libel for $1 million, and the trial opened in March 1927.', when: '1924-1927', confidence: 'established', sourceIds: ['s-thf-antisem', 's-wiki-intl', 's-wiki-sapiro'] },
  { id: 'c-retraction', text: 'Ford closed The Dearborn Independent at the end of 1927 and on 30 June 1927 issued a public retraction and apology, drafted with the help of the lawyer Louis Marshall of the American Jewish Committee, which ended the Sapiro litigation.', when: '1927', confidence: 'established', sourceIds: ['s-thf-antisem', 's-wiki-intl', 's-wiki-sapiro'] },
  { id: 'c-retraction-know', text: 'Whether Ford read, understood or meant the 1927 apology he signed.', when: '1927', confidence: 'contested', sourceIds: ['s-oconnell', 's-wiki-intl'], note: 'Liebold later said Ford never read it or knew what it contained. Some historians treat the apology as a legal and commercial retreat and note that copies of The International Jew kept circulating; others accept that Ford sincerely wanted the campaign to end. Claims that the signature was forged have been made but are not established.' },
  { id: 'c-settlement', text: 'The terms of the Sapiro settlement beyond the apology and an end to Ford\'s attacks, including whether money changed hands and how much.', when: '1927', confidence: 'contested', sourceIds: ['s-thf-antisem', 's-wiki-sapiro'], note: 'The Henry Ford says the settlement included a cash payment to Sapiro; other accounts say the trial ended in a mistrial and the amount, if any, was not disclosed. The figure is not given here because no source consulted states it reliably.' },
  { id: 'c-hitler', text: 'Adolf Hitler admired Ford: Ford is the only American named in Mein Kampf, a portrait of Ford was reported to hang in Hitler\'s Munich office, and the Nazi leader Baldur von Schirach said he read The International Jew and became antisemitic.', when: '1922-1930s', confidence: 'probable', sourceIds: ['s-wiki-intl', 's-oconnell'], note: undefined },
  { id: 'c-eagle', text: 'On 30 July 1938, his seventy-fifth birthday, Ford received the Grand Cross of the German Eagle, a high Nazi honor for foreigners, at a ceremony in Dearborn; it was presented by the German consul from Cleveland, Karl Kapp, and a consular colleague.', when: '1938-07-30', where: 'Dearborn, Michigan', confidence: 'established', sourceIds: ['s-cojs', 's-wiki-ford'] },

  // ── Depression, labor and war ──────────────────────────────────────────
  { id: 'c-fiveday', text: 'In 1926 Ford announced a five-day, forty-hour workweek for his factories, an early move that others later followed.', when: '1926', confidence: 'probable', sourceIds: ['s-wiki-ford'] },
  { id: 'c-model-a', text: 'Ford ended Model T production in May 1927 and introduced the Model A in December 1927; the River Rouge plant then became his main production site.', when: '1927', confidence: 'established', sourceIds: ['s-wiki-modelt', 's-wiki-rouge'] },
  { id: 'c-hunger', text: 'On 7 March 1932 several thousand unemployed workers marched toward the Rouge to present demands; Dearborn police and Ford security guards fired on the marchers, killing four that day, and a fifth died of wounds months later.', when: '1932-03-07', where: 'Dearborn, Michigan', confidence: 'established', sourceIds: ['s-wiki-hunger', 's-wiki-rouge'], note: undefined },
  { id: 'c-bennett', text: 'Harry Bennett headed Ford\'s Service Department, which ran a spy network inside the plants, watched union meetings and hired rough men to intimidate organizers.', when: '1930s', confidence: 'established', sourceIds: ['s-reuther'] },
  { id: 'c-overpass', text: 'On 26 May 1937, at the Rouge overpass, Service Department men beat United Automobile Workers organizers including Walter Reuther and Richard Frankensteen as they prepared to hand out leaflets; the photographer James Kilpatrick saved his pictures, and their publication hurt Ford\'s reputation and helped the union.', when: '1937-05-26', where: 'Dearborn, Michigan', confidence: 'established', sourceIds: ['s-reuther', 's-wiki-overpass'] },
  { id: 'c-1941', text: 'After a walkout at the Rouge began on 1 April 1941, Ford, the last of the major Detroit automakers to hold out, signed a contract with the UAW-CIO on 20 June 1941.', when: '1941-06-20', confidence: 'established', sourceIds: ['s-history-1941', 's-wiki-overpass'] },
  { id: 'c-clara', text: 'Ford\'s wife, Clara, is reported to have urged him to sign, fearing more bloodshed and threatening to leave him.', when: '1941', confidence: 'tradition', sourceIds: ['s-history-1941'], note: 'The story comes from later retellings of family and company memory and is widely repeated; it cannot be checked against a contemporary record.' },
  { id: 'c-fordlandia', text: 'In 1928 Ford began Fordlândia, a rubber plantation town in the Brazilian Amazon on the Tapajós River, to secure rubber for his cars; he imposed American work rules and diet, the trees were struck by blight and pests, and the project was sold back to Brazil in 1945 at a heavy loss. Ford never visited it.', when: '1928-1945', where: 'Pará, Brazil', confidence: 'established', sourceIds: ['s-wiki-fordlandia', 's-grandin'] },
  { id: 'c-fordlandia-labor', text: 'Resentment of the strict rules, the food and the heat of midday work led to a workers\' uprising at Fordlândia in 1930.', when: '1930', confidence: 'probable', sourceIds: ['s-wiki-fordlandia', 's-grandin'] },
  { id: 'c-willow', text: 'At Willow Run, Michigan, Ford built B-24 Liberator bombers from 1942; the plant produced close to half of all B-24s, and by 1944 a bomber was leaving the line about every hour.', when: '1942-1945', where: 'Willow Run, Michigan', confidence: 'probable', sourceIds: ['s-wiki-willow', 's-thf-k12'], note: 'Counts vary: about 6,800 to 7,000 complete aircraft, or about 8,600 when knock-down kits are included, out of roughly 18,000 B-24s overall. Cycle times quoted range from about 59 to 63 minutes.' },
  { id: 'c-willow-labor', text: 'Willow Run struggled with worker shortages, housing and absenteeism; Ford initially resisted hiring women but wartime need brought many women into the plant.', when: '1942-1944', confidence: 'probable', sourceIds: ['s-wiki-willow'] },

  // ── Final years and legacy ─────────────────────────────────────────────
  { id: 'c-foundation', text: 'The Ford Foundation was established on 15 January 1936 by Edsel Ford and Henry Ford; after their deaths, Ford Motor Company stock bequests made it one of the largest philanthropies in the world.', when: '1936', confidence: 'probable', sourceIds: ['s-wiki-foundation'] },
  { id: 'c-edsel', text: 'Edsel Ford, Henry\'s only child, served as president of Ford Motor Company from 1919, often clashed with his father over cars and policy, and died of stomach cancer on 26 May 1943 at age 49.', when: '1943-05-26', confidence: 'established', sourceIds: ['s-wiki-edsel', 's-wiki-ford'] },
  { id: 'c-edsel-stress', text: 'Whether the conflict with his father and with Harry Bennett contributed to Edsel Ford\'s decline and early death.', when: '1943', confidence: 'contested', sourceIds: ['s-wiki-edsel', 's-watts'], note: 'Family members and some biographers say the strain hastened Edsel\'s illness. Stomach cancer is the documented cause of death; the link to the conflicts is an interpretation that cannot be shown from medical evidence.' },
  { id: 'c-1945', text: 'In 1945, after pressure from his wife Clara and Edsel\'s widow Eleanor, Ford gave up the presidency, and his grandson Henry Ford II took over the company.', when: '1945', confidence: 'probable', sourceIds: ['s-wiki-ford', 's-wiki-edsel'] },
  { id: 'c-death', text: 'Henry Ford died on 7 April 1947, aged 83, at his estate, Fair Lane, in Dearborn, of a cerebral hemorrhage, on a night when flooding on the Rouge River had cut power to the house.', when: '1947-04-07', where: 'Dearborn, Michigan', confidence: 'established', sourceIds: ['s-wiki-ford', 's-flood'], note: undefined },
  { id: 'c-hist', text: 'Historians disagree on how to weigh Ford\'s achievements against his antisemitism and his labor record.', confidence: 'contested', sourceIds: ['s-watts', 's-baldwin'], note: 'Watts\'s The People\'s Tycoon is a broad biography that treats Ford\'s bigotry in a separate chapter and describes his ideas as a mishmash of half-digested concepts rather than a system; Baldwin\'s Henry Ford and the Jews centers the campaign and its legacy. Reviewers disagree about which framing best explains the man; this dossier presents both records at full strength.' },
];

// Remove undefined notes so they do not appear as keys.
for (const c of claims) if (c.note === undefined) delete (c as { note?: string }).note;

// ── Assets (real, rights-cleared; pulled from Wikimedia Commons by sourceAdapters) ──
const rawList = rawAssets as Array<{
  id: string; title: string; date?: string; url: string; recordUrl: string;
  rights: { status: DossierAsset['rights']['status']; credit: string; verifiedAt?: string };
}>;

const assetClaims: Record<string, string[]> = {
  'ref-1902-999': ['c-999', 'c-fmc'],
  'ref-1915-peaceship': ['c-peace-sail', 'c-peace-fail'],
  'ref-1915-firestone-group': ['c-edison-meet', 'c-vagabonds'],
  'ref-1919-hartsook': ['c-paper', 'c-series'],
  'ref-1920-fishing': ['c-vagabonds'],
  'ref-1927-whitehouse': ['c-model-a', 'c-15m'],
  'ref-1929-edison': ['c-jubilee'],
  'ref-1938-whitehouse': ['c-eagle', 'c-hitler'],
  'ref-1938-car': ['c-1945', 'c-eagle'],
  'doc-1913-assembly-line': ['c-line-stages', 'c-93min'],
  'doc-highland-park-shift': ['c-highland', 'c-5day'],
  'doc-1920-dearborn-independent': ['c-series', 'c-protocols'],
  'doc-1927-rouge-aerial': ['c-rouge'],
  'doc-1943-willow-run': ['c-willow'],
};

const assets: DossierAsset[] = rawList.map(a => ({
  id: a.id,
  kind: a.id.startsWith('doc-') ? 'document' : 'photo',
  title: a.title,
  url: a.url,
  rights: a.rights,
  claimIds: assetClaims[a.id] ?? [],
}));

// ── Character Bible (likeness lock) ───────────────────────────────────────
const characters: CharacterBible[] = [
  {
    id: 'ford',
    name: 'Henry Ford',
    coreDescriptor:
      'white American man of lean, wiry build with a narrow oval face, high forehead, thin straight eyebrows, deep-set pale eyes, prominent ears, a long straight nose and a thin-lipped mouth that is usually closed or held in a faint, wry half-smile; always clean-shaven; an alert, watchful, plain-spoken bearing',
    forbidden: ['beard', 'moustache', 'glasses', 'heavy or stocky build', 'broad grin', 'cartoonish features', 'caricature', 'modern clothing', 'modern hairstyle', 'company logos or lettering on vehicles', 'swastika or any Nazi insignia', 'visible face of a child or youth', 'depicting violence against workers or any people'],
    seed: 18630730,
    birthYear: 1863,
    variants: [
      { id: 'prime', ageRange: [39, 51], descriptor: 'man of about forty, dark hair under a bowler hat or close-cropped, lean narrow face, intent expression; photographs of this period are scarce', referenceAssetIds: ['ref-1902-999'] },
      { id: 'executive', ageRange: [52, 62], descriptor: 'man in his fifties, thinning light-brown to grey hair combed back from a high forehead, lean lined face, prominent ears, pale steady eyes', referenceAssetIds: ['ref-1915-peaceship', 'ref-1915-firestone-group', 'ref-1919-hartsook', 'ref-1920-fishing'] },
      { id: 'elder', ageRange: [63, 83], descriptor: 'elder, thin silver-white hair combed back, increasingly gaunt cheeks and deep lines, spare upright frame in a loose tweed suit; no cleared photograph after 1938 exists, so depictions of the 1940s are extrapolated from the 1938 references and should show a frail old man', referenceAssetIds: ['ref-1927-whitehouse', 'ref-1929-edison', 'ref-1938-whitehouse', 'ref-1938-car'] },
    ],
    wardrobe: {
      '1900s': 'dark wool overcoat, bowler hat, driving goggles pushed up',
      '1910s': 'dark business suit, high white turndown collar, patterned silk tie',
      '1920s': 'light herringbone or tweed suit, narrow necktie, soft felt hat',
      '1930s': 'loose grey tweed suit, white shirt, narrow patterned necktie, fedora held in hand',
    },
  },
];

// ── Rooms ─────────────────────────────────────────────────────────────────
const rooms: Room[] = [
  {
    id: 'r1', title: 'A Farm Boy and a Broken Watch', years: '1863–1891',
    nodes: [{
      id: 'n-r1-story', title: 'The Boy Who Took Things Apart', kind: 'story',
      claimIds: ['c-born', 'c-farm', 'c-engine-watch', 'c-mother', 'c-left-1879', 'c-edison-co'],
      assetIds: ['ref-1919-hartsook'],
      text: {
        early: 'Henry Ford was born a long time ago on a farm in Michigan. He did not like farm chores. He liked to take things apart to see how they worked. When he was a boy, someone gave him a watch. He fixed watches for his friends. Later he became a machinist in the city.',
        elementary: 'Henry Ford was born on 30 July 1863 on a farm near Dearborn, Michigan. He found farm work hard and boring, but he loved machines. When he was about twelve, he saw a steam engine rolling down a road, the first vehicle he had ever seen that no horse was pulling. He was also given a watch, and he took it apart again and again until he could fix almost any watch. At sixteen he left the farm for Detroit to work with machines. Later he joined the Edison company, which made electricity for the city.',
        middle: 'Henry Ford grew up on a Michigan farm and later wrote that there was too much hard hand labor on it, which pushed him toward machines. At about twelve he saw a steam road engine, his first vehicle not pulled by horses, and he got a watch the same year; by fifteen he could repair almost any watch. His mother died in 1876. In 1879 he left for Detroit to work as an apprentice machinist, and in the early 1890s he joined the Edison Illuminating Company, rising to chief engineer by 1893 while he tinkered with gasoline engines in a brick shed behind his rented house.',
        high: 'Ford\'s own account in My Life and Work (1922), written with Samuel Crowther, makes the farm the origin of his career: he said the labor of farm life drove him to look for better ways to move people and goods, and that his toys had all been tools. He recalled a steam road engine at age twelve and a watch the same year, and a boyhood habit of repairing watches. After his mother\'s death in 1876 and his move to Detroit in 1879, he worked as an apprentice machinist and then, from 1891, at the Edison Illuminating Company, becoming chief engineer in 1893. Ford wrote that his employer was less than enthusiastic about his gasoline-engine experiments. Because the childhood stories come largely from Ford and his co-author, they are better read as the legend he chose to tell than as neutral record.',
        university: 'The sources for Ford\'s boyhood are overwhelmingly self-generated: My Life and Work (1922), produced with Samuel Crowther, and the tradition built on it, including the Greenfield Village that Ford himself assembled. The ledger therefore marks the road-engine and watch anecdotes as probable rather than established, and treats his remark that his parents were not poor as part of the same managed account. What is solid is the framework: birth on 30 July 1863 in Greenfield Township, departure for Detroit in 1879, and the Edison Illuminating Company years from 1891, where his rise to chief engineer in 1893 is documented. Ford\'s own insistence that the farm drove him to machinery belongs to the genre of the self-made-man memoir.',
      },
    }],
  },
  {
    id: 'r2', title: 'Quadricycle and Company', years: '1891–1908',
    nodes: [
      {
        id: 'n-r2-story', title: 'From Backyard Shed to Ford Motor Company', kind: 'story',
        claimIds: ['c-edison-co', 'c-quadricycle', 'c-early-cos', 'c-999', 'c-fmc', 'c-modelt'],
        assetIds: ['ref-1902-999'],
        text: {
          early: 'Henry Ford built a small car in a shed. It had four bicycle wheels and a little engine. He drove it down the street on a June day in 1896. Later he built a fast race car. Then he started a car company with his friends.',
          elementary: 'In June 1896 Henry Ford finished his first car, which he called the Quadricycle, and drove it through the streets of Detroit. A few years later he built a racing car called the 999, and a famous driver named Barney Oldfield raced it. Ford said the race showed people he could build a fast car. On 16 June 1903 he started the Ford Motor Company with money from investors, including the Dodge brothers. In 1908 the company began building the Model T.',
          middle: 'Ford finished his Quadricycle, a light gasoline-powered carriage, in 1896 and test-drove it on 4 June. After earlier companies failed or were dissolved, he built racing cars, among them the 999, driven by Barney Oldfield in 1902; Ford later said the race advertised that he could build a fast car. Ford Motor Company was incorporated on 16 June 1903 with $28,000 in capital, and the Dodge brothers were among its early backers. In 1908 the firm introduced the Model T, priced at about $825.',
          high: 'Ford\'s path from the Quadricycle (completed and test-driven on 4 June 1896) to a viable company ran through racing. The 999, built in 1902 and driven by Barney Oldfield, was, in Ford\'s own later words in My Life and Work, meant to advertise that he could build a fast motor car. Ford Motor Company was incorporated on 16 June 1903 with $28,000 in capital; John and Horace Dodge, who supplied parts, were among the investors, a relationship that would end in court in 1919. By 1908 the company had moved from expensive early models to the single design that would define it, the Model T, introduced on 1 October 1908.',
          university: 'Ford\'s early career shows the standard sequence for a founder of the period: a prototype (the 1896 Quadricycle), earlier companies that failed or were dissolved (the Detroit Automobile Company, dissolved in 1901, and the Henry Ford Company, formed in 1901), and a publicity vehicle, the 1902 racer 999 driven by Barney Oldfield. Ford\'s own text implies the new company formed almost immediately after a race; the ledger treats that sequencing cautiously because the dates it implies do not line up with the 16 June 1903 incorporation date given in standard histories. The Dodge brothers\' role as suppliers and early shareholders is the seed of Dodge v. Ford (1919), which later constrained Ford\'s control. Contemporary mythology, including Ford\'s retrospective account, compresses a chain of partnerships and failed companies into a single arc of invention.',
        },
      },
      {
        id: 'n-r2-edison', title: 'Two Dates for One Meeting', kind: 'source-reading',
        claimIds: ['c-edison-meet', 'c-vagabonds', 'c-jubilee'],
        assetIds: ['ref-1915-firestone-group', 'ref-1920-fishing', 'ref-1929-edison'],
        text: {
          early: 'Henry Ford had a hero named Thomas Edison. Edison made electric lights. When Ford was young, Edison told him to keep working on his car. The two became good friends. They even went camping together.',
          elementary: 'Henry Ford admired Thomas Edison, the inventor who helped bring electric light to homes. When Ford met him at a meeting of electric company men, Edison encouraged him to keep working on his gasoline car. They became friends for life. From 1916 to 1924 Ford and Edison went on camping trips with the tire maker Harvey Firestone and the nature writer John Burroughs. They called themselves the Vagabonds. Here is a puzzle for a historian: Ford remembered meeting Edison around 1887, but the museum says it happened in 1896.',
          middle: 'A good historian checks a famous story against more than one source. The Henry Ford museum places Ford\'s meeting with Edison at a convention of Edison company employees in Brooklyn in 1896. But in his own 1922 book, Ford remembered a convention in Atlantic City, "probably about 1887." Both cannot be right. Whichever date is correct, the friendship that followed is well documented: Ford, Edison, Harvey Firestone and John Burroughs took camping trips from 1916 to 1924, and in 1929 Ford hosted Light\'s Golden Jubilee in Dearborn, fifty years after the electric lamp. Edison died in 1931.',
          high: 'The meeting between Ford and Edison is a case study in how memory shapes a biography. The Henry Ford places it at the 1896 convention of the Association of Edison Illuminating Companies in Brooklyn, when Edison encouraged Ford\'s gasoline carriage. Ford, however, wrote in My Life and Work that he first met Edison at an Atlantic City convention "probably about 1887 or thereabouts," years before he had a working car to describe. The ledger marks the encounter as contested for that reason. The later friendship is not in doubt: the "Vagabonds" camping trips with Firestone and Burroughs (1916–1924), a visit from President Harding in 1921, and the 1929 Light\'s Golden Jubilee, which dedicated Ford\'s Edison Institute.',
          university: 'Ford\'s own recollection (My Life and Work, 1922) of meeting Edison around 1887 at an Atlantic City convention conflicts with the archive\'s 1896 Brooklyn account, in which Edison encourages Ford\'s gasoline carriage. The discrepancy matters because the 1896 story, in which a hero of the electrical age blesses the gasoline engine, fits the myth of the self-made inventor, while the 1887 memory would predate any car for Edison to praise. The 1896 account is the one the museum gives, and the earlier date is best treated as an error of memory; either way, Ford publicly celebrated the Edison relationship, from the Vagabond camping trips (1916–1924) to the 1929 Light\'s Golden Jubilee. The episode is a useful exercise in source criticism, since both accounts are the product of Ford\'s own mythmaking and an institution built to preserve it.',
        },
      },
    ],
  },
  {
    id: 'r3', title: 'A Car for the Great Multitude', years: '1908–1914',
    nodes: [
      {
        id: 'n-r3-story', title: 'The Model T and the Moving Line', kind: 'story',
        claimIds: ['c-modelt', 'c-highland', 'c-line-stages', 'c-93min', 'c-line-credit', 'c-price', 'c-15m'],
        assetIds: ['doc-1913-assembly-line', 'doc-highland-park-shift', 'ref-1927-whitehouse'],
        text: {
          early: 'Henry Ford made a car called the Model T. He wanted many families to be able to buy one. So he built it on a moving line. Each worker did one small job as the car moved by. Cars were made much faster this way. More families could afford them.',
          elementary: 'In 1908 the Ford Motor Company began selling the Model T. In 1913, at the Highland Park factory near Detroit, Ford\'s engineers put the work on a moving assembly line. Instead of workers walking around one car, the car moved past workers, and each person did one small job. A car chassis that once took about twelve and a half hours to build took about ninety-three minutes by early 1914. Because making cars got cheaper, the price dropped to about $260 by the mid-1920s. About fifteen million Model Ts were built.',
          middle: 'The Model T went on sale on 1 October 1908 at about $825. Ford moved production to the huge Highland Park plant in 1910 and, in stages during 1913, put assembly on moving lines: first flywheel magnetos around April, then whole chassis by August. A chassis that had taken roughly twelve and a half hours took about ninety-three minutes by early 1914. Falling costs let Ford cut the price to about $260 by the mid-1920s, and about fifteen million Model Ts were built by 1927. Many Ford engineers and managers developed the line together; people still argue about who deserves credit.',
          high: 'The Model T (introduced 1 October 1908) was priced at about $825 and later fell to about $260 as volume rose. The moving assembly line that made that possible was introduced in stages at Highland Park in 1913, beginning with flywheel magnetos around 1 April and extended to chassis by August. The result, chassis labor time cut from roughly 12.5 hours to 93 minutes by early 1914, is confirmed by The Henry Ford and by Ford\'s own book. Individual credit is contested: Avery, Martin, Sorensen and Wills are all named in the literature, and the line is better understood as a collective engineering achievement. The cost was human: the repetitive pace drove extremely high worker turnover, which prepared the ground for the Five Dollar Day. By 1927 some 15 million Model Ts had been built.',
          university: 'David Hounshell\'s From the American System to Mass Production (1984) is the standard scholarly framing: mass production at Highland Park was the end of a long technological development, from interchangeable parts to continuous-flow layout, in which Ford\'s firm was the decisive actor, not the product of a single invention. The ledger therefore marks individual credit (Avery, Martin, Sorensen, Wills; Sorensen\'s later claims) as contested. The staged introduction of the line (magnetos in about April 1913, chassis by August 1913) and the reduction of chassis time from roughly 12.5 hours to 93 minutes are documented by contemporary observers, and the 1915 Arnold and Faurote study of the Ford shops, summarized by The Henry Ford, records them. The line\'s social consequence, extremely high turnover among workers who found the pace intolerable, is part of the explanation for the 1914 wage reform and for later labor conflict.',
        },
      },
      {
        id: 'n-r3-multitude', title: 'Ford\'s Own Words on the Model T', kind: 'source-reading',
        claimIds: ['c-multitude', 'c-modelt'],
        assetIds: ['ref-1927-whitehouse'],
        text: {
          early: 'Henry Ford said he would make a car for lots and lots of people. He wanted it to be simple and not too expensive. Many families could buy one. Reading what he wrote helps us know what he wanted.',
          elementary: 'Years later, Henry Ford wrote a book about his life. In it he remembered telling people that he would build one kind of car for the great many ordinary families. It would be big enough for a family, simple to run, made of good materials, and low in price. His salesmen did not like this plan. They thought it would fail. A good reader asks: did he really say it, and what happened next? The Model T sold millions of cars.',
          middle: 'In My Life and Work (1922), Ford recalled announcing his plan for one model: "I will build a motor car for the great multitude." He promised it would be large enough for a family but small enough for one person to run, made of the best materials, built from the simplest designs, and so low in price that no one earning a good salary would be unable to own one. He admitted that his sales staff objected. Remember that Ford wrote this years later, with a co-author, to explain his own success. That does not make it false, but it makes it his own account.',
          high: 'The passage in My Life and Work (1922) is Ford\'s retrospective statement of the Model T idea: a single model, "for the great multitude," family-sized but easy for an individual to run, made of the best materials and designs, and priced so that a good salary could buy it. Ford also notes the objections of his sales force, who thought a single model would fail within months. Reading it as a primary source means attending to its purpose: written in 1922, at the height of his fame and with Samuel Crowther, it presents the strategy as foresight, whereas the company\'s actual path included pricing experiments and continuous cost-cutting. The passage is best compared with what actually happened to prices and sales.',
          university: 'The "great multitude" passage in My Life and Work (1922), which dates Ford\'s decision to the single-model policy of 1909, is a retrospective manifesto written in collaboration with Samuel Crowther. It deserves both close reading and critical distance. Its rhetoric of a democratic product ("a motor car for the great multitude," so low in price that a good salary could buy one) shaped the Ford legend, and Watts presents Ford as embodying both the promise and the pitfalls of American democracy, including its devotion to opportunity and its faith in material goods. Yet the passage also performs foresight, since Ford presents as a settled plan what the commercial record shows to be an iterative cost-reduction strategy, and it appears in a book whose later chapters defend The Dearborn Independent\'s antisemitic campaign. Read in context, the same text carries both Ford\'s account of the Model T and his account of that campaign.',
        },
      },
    ],
  },
  {
    id: 'r4', title: 'Five Dollars a Day, and the Strings Attached', years: '1914–1919',
    nodes: [
      {
        id: 'n-r4-story', title: 'Higher Wages and Home Inspections', kind: 'story',
        claimIds: ['c-turnover', 'c-5day', 'c-crowds', 'c-socio', 'c-socio-view', 'c-dodge', 'c-rouge'],
        assetIds: ['doc-highland-park-shift', 'doc-1927-rouge-aerial'],
        text: {
          early: 'In 1914 Henry Ford said his workers would get five dollars a day. That was a lot more money. Many people wanted to work for him. But there were rules. Workers had to keep a clean home and save money. Some workers did not like having the company look at their homes.',
          elementary: 'On 5 January 1914 the Ford company announced it would pay workers at least five dollars a day for an eight-hour day. Before this, many workers got about $2.30 for nine hours. The news was so exciting that thousands of job seekers rushed to the factory gate. There was a catch. To get the full pay, workers had to follow rules about how they lived, such as keeping a clean home and saving money, and company investigators checked. Many workers resented this. The investigators were part of a group called the Sociological Department.',
          middle: 'Ford\'s assembly line had a problem: workers hated the repetitive work and quit in huge numbers. On 5 January 1914 the company announced a minimum of five dollars for an eight-hour day, framed as profit sharing, roughly double the old pay. Thousands of men rushed to Highland Park; some rioted and were driven away with fire hoses. But the money came with conditions. The Sociological Department sent investigators into workers\' homes to check on drinking, cleanliness, boarders and saving. Many workers resented it, and the department was largely dissolved by about 1921. Historians still disagree about Ford\'s motives.',
          high: 'The Five Dollar Day (announced 5 January 1914) is usually presented as a milestone in labor history, and it did raise wages and push competitors to follow. It was also a response to turnover so high, several hundred percent a year, that the new line could not keep its workers. Ford\'s own book presents it as a voluntary act of social justice. The raise was structured as a profit-sharing bonus conditional on investigators from the Sociological Department judging a worker\'s home life: no heavy drinking, a clean home, no boarders, regular savings. The ledger marks the department\'s purpose as contested: reform, control, or recruitment. In the same years, the 1919 decision in Dodge v. Ford forced Ford to pay a special dividend of about $19.3 million instead of reinvesting it, and the River Rouge complex, begun in 1917, became his answer to the problem of vertical control.',
          university: 'The Five Dollar Day invites competing interpretations that the ledger deliberately preserves. Efficiency readings stress turnover (several hundred percent, with sources quoting 370 and 380) and the wage as a device for stabilizing the line. Consumption readings say that well-paid workers would buy Model Ts. Moral readings, advanced by the company and by Ford\'s own book, treat it as social justice. Critical readings emphasize the Sociological Department\'s inspections and the conditions attached to the bonus, which the Henry Ford Museum notes provoked worker resentment and led to the department\'s dissolution by about 1921. Dodge v. Ford (1919), where the Michigan Supreme Court ordered a special dividend of about $19.3 million, shows the legal limit of Ford\'s paternalism in a corporation that owed duties to shareholders. The River Rouge complex (1917–1928) is the spatial expression of the same impulse to control inputs.',
        },
      },
      {
        id: 'n-r4-peace', title: 'The Peace Ship', kind: 'story',
        claimIds: ['c-peace-sail', 'c-peace-fail'],
        assetIds: ['ref-1915-peaceship'],
        text: {
          early: 'In 1915 there was a big war far away. Henry Ford did not like war. He rented a big ship to sail across the ocean and try to help end the war. Many people laughed at the plan. Ford got sick and went home early. The war went on.',
          elementary: 'In December 1915 World War I was raging in Europe. Henry Ford believed war was terrible and wanted to help end it. He paid for a ship called the Oscar II to carry peace delegates and reporters from New York to Norway. Many newspapers made fun of the trip. When the ship reached Norway, Ford said he was ill and went home, and the war continued for three more years. Later he said he did not regret trying.',
          middle: 'On 4 December 1915 Ford sailed from Hoboken, New Jersey, on the steamship Oscar II with more than a hundred delegates and reporters, hoping to push European nations toward peace. The Hungarian pacifist Rosika Schwimmer helped organize the trip. The press mocked it. After arriving in Norway Ford left, saying he was ill, and returned to the United States. The expedition did not shorten the war. In My Life and Work, Ford wrote that he did not regret trying and that failures can teach more than successes.',
          high: 'The Peace Ship expedition of December 1915 (the Oscar II sailing from Hoboken with delegates and reporters) was Ford\'s attempt to turn his fortune and fame into diplomacy at a moment when the United States was still neutral. Rosika Schwimmer, a Hungarian pacifist, helped organize it. It was ridiculed in the press, and after reaching Norway Ford left, citing illness. The expedition did not shorten the war. In My Life and Work he defended it. Historians connect it to the strands in Ford\'s thinking, pacifism and suspicion of financiers, that later fed the Dearborn Independent campaign.',
          university: 'The Peace Ship (4 December 1915) belongs to the early history of American "citizen diplomacy" and to the intellectual lineage of Ford\'s later campaign. The Henry Ford\'s account of the sources of his antisemitism identifies a pacifist strand in his outlook, the belief that financiers profited from war, which this expedition shows him acting on. The expedition\'s collapse, with Ford leaving the party in Norway citing illness while the press mocked the venture, is a case study in the limits of celebrity as policy. Ford\'s own 1922 defense ("I do not regret the attempt") fits a pattern in My Life and Work of reframing failures as lessons.',
        },
      },
    ],
  },
  {
    id: 'r5', title: 'The Dearborn Independent', years: '1918–1927',
    nodes: [
      {
        id: 'n-r5-story', title: 'A Newspaper Used to Spread Hate', kind: 'story',
        claimIds: ['c-paper', 'c-series', 'c-protocols', 'c-volumes', 'c-halt', 'c-roots', 'c-authorship'],
        assetIds: ['doc-1920-dearborn-independent', 'ref-1919-hartsook'],
        text: {
          early: 'Henry Ford owned a newspaper. For many weeks it printed unkind and untrue things about Jewish people. This was wrong and it hurt many people. Many Americans said so right away. Learning about this helps us remember to check if things we read are true.',
          elementary: 'Henry Ford owned a newspaper called The Dearborn Independent. In May 1920 it began printing a long series of articles that blamed Jewish people for many of the world\'s problems. These ideas were false and hateful. The articles used a fake document, called the Protocols, that had been made up in Russia. The articles were collected into books, and many people read them. Many Americans spoke out against them, including a former president.',
          middle: 'Ford\'s secretary bought a small Dearborn weekly in 1918, and Ford began publishing The Dearborn Independent in 1919; Ford dealers were pressed to sell it. On 22 May 1920 it began a series called "The International Jew" that ran for ninety-one weeks. It spread antisemitic conspiracy theories, including material from The Protocols of the Elders of Zion, a forgery. The articles were collected into four volumes and translated into many languages. In 1921 over a hundred prominent Americans, including former President Woodrow Wilson, condemned the campaign. William Cameron is credited with writing most of the material, and Ernest Liebold with helping to gather it.',
          high: 'The Dearborn Independent (published from January 1919) became, from 22 May 1920, the vehicle for a ninety-one-week antisemitic series, "The International Jew: The World\'s Problem." It relied on The Protocols of the Elders of Zion, a forgery first published in Russia in 1903, and accused Jews of responsibility for wars, financial manipulation and cultural decline. The series was reprinted as a four-volume book (1920–1922) and translated into many languages. Cameron is credited with writing most of the content and Liebold with collecting material, but the paper\'s reach depended on Ford\'s money and dealer network. In 1921 more than a hundred prominent Americans condemned the campaign. Historians trace the sources of Ford\'s outlook to distrust of bankers, wartime pacifism and cultural conservatism, but those explanations do not excuse the hate.',
          university: 'The Dearborn Independent campaign (22 May 1920 onward) fused an inherited antisemitic imaginary, notably the forged Protocols, with Ford\'s populist suspicion of finance and his wartime pacifism, strands that The Henry Ford\'s own research summary identifies. Its production was divided: Cameron wrote most of the articles and the "Own Page" editorials, Liebold gathered material, and the paper was driven through the Ford dealer network. Ford\'s personal authorship is the contested point, and the ledger deliberately separates (a) the established facts of the campaign, (b) the probable division of labor between Cameron and Liebold, and (c) the contested question of Ford\'s own role. The campaign was condemned in 1921 by a broad group of prominent Americans, including Woodrow Wilson, and met organized boycotts; Ford halted the series in January 1922 and resumed within a year. The International Jew then took on an afterlife of its own in Germany.',
        },
      },
      {
        id: 'n-r5-mylife', title: 'Ford\'s Chapter on "The Jewish Question"', kind: 'source-reading',
        claimIds: ['c-mylife-jewish', 'c-series', 'c-ford-role'],
        assetIds: [],
        text: {
          early: 'In 1922 Henry Ford put his name on a book about his life. A part of the book talked about the newspaper articles. Ford said the articles were fair. But they were not true or kind. Reading what he wrote helps us see that he stood by the articles.',
          elementary: 'In 1922 a book called My Life and Work came out under Henry Ford\'s name. One chapter talks about the newspaper\'s articles about Jewish people. In it Ford says the articles were only about "ideas," not people, and that they told the truth. But the articles were full of false and hurtful claims. Readers should notice that in 1922 Ford still defended the campaign in print, and that the book was written with a co-author, Samuel Crowther.',
          middle: 'My Life and Work (1922) was published under Ford\'s name with the writer Samuel Crowther. In a chapter titled "Things in General," a section on what Ford\'s newspaper called "Studies in the Jewish Question" defends the campaign. It claims that the articles attacked only "ideas," not people, and that cultural decline came from "one racial source." It also says the country\'s destiny was to remain Christian. For a student of history, the point is that in 1922, after protests from many Americans, Ford\'s book still defended the campaign. The claim that it was only about ideas does not match the articles\' attacks on a whole people.',
          high: 'In the chapter "Things in General" of My Life and Work (1922), a passage titled "Studies in the Jewish Question" offers the campaign\'s official self-justification. The text calls the articles a contribution to a question "racial at its source," that concerns "influences and ideals rather than persons"; it speaks of deterioration in literature, amusements and social conduct traceable to "one racial source"; and it insists the nation\'s destiny is to remain Christian. It denies "prejudice or hatred against persons." The contradiction is the lesson: a text that disclaims hatred while assigning a nation\'s decline to a single racial group. It is also evidence in the dispute about Ford\'s role, because it is published under his name two years after the series began and while it was still running.',
          university: 'The passage "The work which we describe as Studies in the Jewish Question" in the chapter "Things in General" of My Life and Work (Doubleday, Page, 1922) is the clearest first-person defense of the Dearborn Independent campaign that appeared under Ford\'s name, though the book was written with Samuel Crowther. Its rhetorical structure rewards close reading. It reframes a campaign against a people as an inquiry into "influences and ideals rather than persons"; it attributes a diffuse cultural malaise to "one racial source"; it lays responsibility on that group ("the question is wholly in the Jews\' hands"); and it disclaims "prejudice or hatred against persons." Baldwin\'s account of Ford as a paradoxical antisemite, who may not have grasped the hatred in his own words, is one way to read that doubleness, and the passage is exhibit A for those who argue that Ford cannot have been a bystander. Historians have to weigh a text that cuts against the later claim that his subordinates acted without his knowledge, but a co-authored memoir cannot settle the question of personal authorship by itself.',
        },
      },
      {
        id: 'n-r5-sapiro', title: 'The Sapiro Suit and the Retraction', kind: 'story',
        claimIds: ['c-sapiro', 'c-retraction', 'c-retraction-know', 'c-settlement', 'c-ford-role', 'c-hitler'],
        assetIds: ['doc-1920-dearborn-independent'],
        text: {
          early: 'A lawyer named Aaron Sapiro was treated unfairly by the newspaper. He took Henry Ford to court. Ford stopped the newspaper. He said he was sorry. But the old articles were still read, even in another country. Some people think Ford never really understood what he had done.',
          elementary: 'In 1924 Ford\'s newspaper attacked a lawyer named Aaron Sapiro, who helped farmers work together. Sapiro sued Ford. The trial began in March 1927. Ford stopped the newspaper at the end of that year and signed a public apology, written with help from a Jewish leader named Louis Marshall. Historians still ask whether Ford had read the apology or meant it. The old articles did not disappear. In Germany, leaders of the Nazi party admired them.',
          middle: 'In April 1924 the Independent attacked the lawyer Aaron Sapiro, who organized farmers\' cooperatives. Sapiro sued for libel, asking $1 million, and the trial opened in March 1927. Ford closed the paper at the end of 1927 and on 30 June 1927 issued a public retraction and apology, drafted with Louis Marshall of the American Jewish Committee. But the apology raised questions. Ernest Liebold later said Ford never read it. Whether Ford was personally responsible for the articles is also debated. Meanwhile The International Jew kept circulating, and Adolf Hitler admired Ford. Ford is the only American named in Mein Kampf.',
          high: 'Sapiro\'s $1 million libel suit (filed after the April 1924 attacks, tried from March 1927) forced a reckoning. Ford ended the Independent at the close of 1927 and issued a retraction on 30 June 1927 that Louis Marshall had helped draft. Three questions remain open and are marked contested in the ledger: how involved Ford was (Cameron testified he had nothing to do with the editorials; Baldwin and others disagree), whether Ford read or understood the apology (Liebold said he never read it), and what the settlement contained, since sources disagree on whether money changed hands. The retraction did not stop The International Jew. Hitler admired Ford, and Baldur von Schirach said he read the book and became antisemitic.',
          university: 'Three questions about the Sapiro affair should be kept separate, as the ledger does. First, personal responsibility: Cameron\'s testimony that Ford had nothing to do with the editorials is contradicted, in Baldwin\'s account and in other testimony cited in the literature, by evidence that Ford oversaw the paper and knew its direction. Second, the apology: Liebold\'s later statement that Ford never read it, noted in reviews of Baldwin, fits both a narrative of negligence and one of strategic distance, and claims of forgery are asserted but not established. Third, the settlement: The Henry Ford reports a cash payment, other accounts a mistrial and an undisclosed outcome, and this dossier declines to give a figure. Afterward the book circulated in Germany, and Hitler\'s admiration (Ford is named in Mein Kampf, a portrait was reported in Hitler\'s Munich office, and Schirach said the book made him an antisemite) shows the campaign\'s lasting effect. Reports of the portrait come from contemporaries and are marked probable.',
        },
      },
    ],
  },
  {
    id: 'r6', title: 'Depression, Labor and War', years: '1927–1945',
    nodes: [
      {
        id: 'n-r6-labor', title: 'The Rouge, the Hunger March and the Overpass', kind: 'story',
        claimIds: ['c-fiveday', 'c-model-a', 'c-hunger', 'c-bennett', 'c-overpass', 'c-1941', 'c-clara'],
        assetIds: ['doc-1927-rouge-aerial', 'ref-1927-whitehouse'],
        text: {
          early: 'After many years, the Ford company had a huge factory called the Rouge. Workers wanted to join a union to speak up together. Ford did not want a union. Some people were hurt in fights outside his factory. At last, in 1941, Ford agreed to a union contract.',
          elementary: 'By the 1930s the River Rouge factory in Dearborn was one of the largest in the world. During the Great Depression, thousands of people lost jobs. In 1932 unemployed workers marched to the Rouge to ask for help, and guards and police shot at them. Four people died that day. In 1937, men from Ford\'s Service Department beat union organizers on a bridge, and newspaper photos showed the world. Ford held out against the union until 1941, when he finally signed a contract.',
          middle: 'In 1926 Ford had announced a five-day, forty-hour week, but in the Depression his company became known for resisting unions. On 7 March 1932 several thousand unemployed marchers walked toward the Rouge; Dearborn police and Ford guards fired, killing four that day, and a fifth died later. Harry Bennett\'s Service Department ran spies and used rough men to threaten organizers. On 26 May 1937 they beat UAW organizers, including Walter Reuther, on an overpass near Gate 4, and photographs published across the country hurt Ford\'s image. After a strike began in April 1941, Ford signed a union contract on 20 June 1941, the last major Detroit automaker to do so.',
          high: 'Ford\'s labor record has two sides. In 1926 he moved to a five-day, forty-hour week; the Model T gave way to the Model A in 1927; and the Rouge became his main production site. Yet in the Depression the company\'s Service Department under Harry Bennett kept a spy network, watched union meetings and hired thugs. The Hunger March of 7 March 1932 ended with police and Ford guards firing on marchers, killing four that day and a fifth later. On 26 May 1937, at the Rouge overpass, Service Department men beat UAW organizers including Walter Reuther and Richard Frankensteen; James Kilpatrick saved his photographs, and their publication swung opinion toward the union. After a strike that began on 1 April 1941 Ford signed a UAW contract on 20 June 1941. A widely repeated story credits Clara Ford with persuading him; the ledger marks it as tradition.',
          university: 'Ford\'s labor history complicates the Five Dollar Day narrative. The 1926 five-day week and high wages coexisted with a Service Department under Bennett that, as the Reuther Library summarizes, ran a spy network, surveilled union meetings and recruited men with violent records. The Hunger March (7 March 1932; four killed that day, a fifth later, by Dearborn police and Ford security) and the Battle of the Overpass (26 May 1937, preserved by Kilpatrick\'s photographs) are the two events that most damaged Ford\'s reputation among workers. The NLRB cases that followed exposed violations of federal labor law. The 1941 strike (from 1 April) and the 20 June contract show that outside pressure, not Ford\'s own conversion, ended the resistance. The Clara Ford anecdote persists in retellings but cannot be verified from a contemporary record, so the ledger labels it tradition.',
        },
      },
      {
        id: 'n-r6-eagle', title: 'A Medal from Berlin and a Bomber Plant', kind: 'story',
        claimIds: ['c-eagle', 'c-hitler', 'c-willow', 'c-willow-labor', 'c-fordlandia', 'c-fordlandia-labor'],
        assetIds: ['ref-1938-whitehouse', 'doc-1943-willow-run'],
        text: {
          early: 'When Ford turned seventy-five, a German official gave him a medal. People were upset because the leaders of Germany were treating Jewish people very cruelly. Later, when America joined a war, Ford\'s factories made airplanes. Thousands of workers built them.',
          elementary: 'On Ford\'s seventy-fifth birthday, 30 July 1938, a German official gave him a medal called the Grand Cross of the German Eagle. At that time Germany\'s leader was Adolf Hitler, who treated Jewish people very cruelly. Many Americans were shocked that Ford accepted it. When the United States entered World War II, Ford\'s company built bomber planes at a huge plant in Michigan called Willow Run. Ford also had a rubber plantation in Brazil, called Fordlandia, which did not work.',
          middle: 'On 30 July 1938, Ford\'s seventy-fifth birthday, the German consul in Cleveland presented him in Dearborn with the Grand Cross of the German Eagle, a high Nazi honor for foreigners. The award came from a regime whose leader admired Ford. Meanwhile, Ford\'s company was moving into other fields. In 1928 Ford began Fordlândia, a rubber plantation in the Brazilian Amazon, which failed because of blight, pests and clashes over Ford\'s strict rules, and it was sold in 1945. During World War II Ford\'s Willow Run plant built B-24 bombers, close to half of all that were made, but struggled with housing and absenteeism.',
          high: 'The Grand Cross of the German Eagle, presented on 30 July 1938 by the German consul from Cleveland, Karl Kapp, is the best-known sign of Ford\'s place in Nazi regard, coming from a regime whose leader had admired Ford for years. In the same period Ford\'s overseas ventures showed limits: Fordlândia (begun 1928) was meant to supply rubber but failed from blight, pests and worker resistance, including an 1930 uprising, and Ford never visited. In 1942 the Willow Run plant began building B-24 Liberators, producing close to half of the roughly 18,000 made; by 1944 a bomber left the line about every hour, though shortages, housing and absenteeism plagued it. Ford initially resisted hiring women, and wartime need changed his mind.',
          university: 'The 1938 Grand Cross is documented (the presentation by Karl Kapp and a consular colleague in Dearborn), but its interpretation is not. The honor is usually read alongside the Dearborn Independent, the Nazi use of The International Jew and Hitler\'s admiration, evidence the ledger marks as probable; the dossier makes no claim about what Ford himself intended by accepting it. Fordlândia (1928–1945), the subject of Grandin\'s standard account, ended with the settlement sold back to Brazil at a heavy loss. Willow Run is the counter-narrative of productive success, but even there the counts vary (about 6,800 to 7,000 complete B-24s, about 8,600 with kits, out of roughly 18,000) and the plant was beset by labor and housing problems, so the ledger marks the figures as probable and keeps the range visible.',
        },
      },
    ],
  },
  {
    id: 'r7', title: 'The Last Years', years: '1943–1947',
    nodes: [{
      id: 'n-r7-story', title: 'Edsel, Fair Lane and a Contested Legacy', kind: 'story',
      claimIds: ['c-edsel', 'c-edsel-stress', 'c-1945', 'c-death', 'c-foundation', 'c-hist'],
      assetIds: ['ref-1938-car', 'ref-1929-edison'],
      text: {
        early: 'Henry Ford\'s son Edsel got very sick and died in 1943. Henry was old and sad. His grandson Henry Ford II took over the company. Henry Ford died in 1947 at his home. People still talk about the good and the bad he did.',
        elementary: 'Henry Ford\'s only son, Edsel, ran the company for many years and often disagreed with his father. Edsel died of cancer in 1943, at age 49. Henry Ford was almost eighty and had to lead again. In 1945 his wife and Edsel\'s widow pushed him to step down, and his grandson Henry Ford II took over. Henry Ford died on 7 April 1947 at his home, Fair Lane, at age 83. People still argue about how to weigh the good he did against the harm.',
        middle: 'Edsel Ford, president of the company from 1919, clashed with his father and with Harry Bennett, and died of stomach cancer on 26 May 1943, aged 49. Some family members said the strain hurt his health, but that is an opinion, not a proven cause. After pressure from his wife Clara and Edsel\'s widow Eleanor, Henry Ford gave up control in 1945 to his grandson Henry Ford II. Ford died of a cerebral hemorrhage on 7 April 1947, aged 83, at Fair Lane, on a night when the flooded Rouge River had cut the power. The Ford Foundation, established in 1936, became one of the largest philanthropies in the world after the deaths of Edsel and Henry.',
        high: 'Edsel Ford (president from 1919) pressed his father toward the Model A and other changes and died of stomach cancer on 26 May 1943. Whether the conflict with his father and with Harry Bennett hastened his decline is asserted by relatives and some biographers but unproven. In 1945, Clara Ford and Eleanor Ford pressed Henry to give up the presidency, and Henry Ford II took over. Henry Ford died of a cerebral hemorrhage on 7 April 1947 at Fair Lane, aged 83. The Ford Foundation, set up in 1936 by Edsel and Henry, was transformed by stock bequests after their deaths. Historians still struggle to hold together the man who raised wages, built mass production, spread antisemitism and fought unions; the ledger marks the weighing of that record as contested.',
        university: 'The final years replay the contradictions of the whole career. Edsel Ford\'s presidency (1919 to his death on 26 May 1943) was marked by repeated conflicts with his father, notably over the Model A and in the Bennett era, but the causal link between those conflicts and his stomach cancer, asserted in some family and biographical accounts, remains an interpretation. Henry Ford\'s 1945 surrender of the presidency to Henry Ford II followed pressure from Clara and Eleanor Ford. His death on 7 April 1947, aged 83, during a flood that cut power to Fair Lane, is documented; so is the Ford Foundation\'s transformation, after 1947, into one of the world\'s largest philanthropies, although Henry Ford did not direct it. Steven Watts\'s The People\'s Tycoon and Neil Baldwin\'s Henry Ford and the Jews exemplify two scholarly framings, the first a broad biography in which the bigotry is one chapter among several, the second a study in which the campaign and its legacy are the center. A rigorous reading needs both: the engineer and employer whose methods reshaped the century, and the publisher whose newspaper and book gave antisemitism a mass audience.',
      },
    }],
  },
];

export const fordDossier: Dossier = {
  id: 'henry-ford',
  subject: 'Henry Ford',
  kind: 'biography',
  rooms,
  ledger: { subjectId: 'henry-ford', sources, claims },
  assets,
  characters,
  entrance: {
    tagline: 'He put America on wheels. He also put hatred in print.',
    dates: '1863 — 1947',
    epigraph: {
      text: 'I will build a motor car for the great multitude.',
      cite: 'Henry Ford with Samuel Crowther, My Life and Work, 1922',
    },
    montage: [
      { assetId: 'ref-1902-999', label: '1902', focus: { x: 0.83, y: 0.17, scale: 330 } },
      { assetId: 'ref-1915-peaceship', label: '1915', focus: { x: 0.83, y: 0.24, scale: 170 } },
      { assetId: 'ref-1919-hartsook', label: '1919', focus: { x: 0.51, y: 0.27, scale: 190 } },
      { assetId: 'ref-1927-whitehouse', label: '1927', focus: { x: 0.51, y: 0.24, scale: 450 } },
      { assetId: 'ref-1929-edison', label: '1929', focus: { x: 0.43, y: 0.37, scale: 420 } },
      { assetId: 'ref-1938-car', label: '1938', focus: { x: 0.62, y: 0.22, scale: 220 } },
    ],
    scoreUrl: '/dossier/ford/score.mp3',
  },
};
