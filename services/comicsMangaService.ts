// comicsMangaService — free/open comic + manga sources for Lorea's library & museum.
//
//  • Comics:  Internet Archive hosts vast PUBLIC-DOMAIN Golden/Silver-Age comics
//             (Digital Comic Museum, Comic Book Plus mirrors) — genuinely readable.
//  • Manga:   AniList (GraphQL, no key, CORS-open) provides rich metadata/history —
//             covers, descriptions, years, creators, genres. Manga *content* that's
//             free+legal is scarce (no scanlations), so manga is a metadata/history/
//             discovery experience that links out; only public-domain manga reads inline.
import { cached } from '../src/lib/performanceCache';
import type { ArchiveBook } from './archiveContentService';

const IA_SEARCH = 'https://archive.org/advancedsearch.php';

// ── Public-domain comics (Internet Archive) ────────────────────────────────────
export const COMIC_COLLECTIONS: { label: string; query: string }[] = [
  { label: 'Golden Age', query: 'collection:(comics OR goldenagecomics) AND mediatype:texts' },
  { label: 'Digital Comic Museum', query: 'collection:digitalcomicmuseum' },
  { label: 'Comic Book Plus', query: 'collection:comicbookplus' },
  { label: 'Newspaper Strips', query: 'subject:"comic strips" AND mediatype:texts' },
  { label: 'Sci-Fi & Horror', query: '(subject:"science fiction comics" OR subject:"horror comics") AND mediatype:texts' },
];

export const fetchArchiveComics = async (query = 'collection:comics AND mediatype:texts', limit = 30): Promise<ArchiveBook[]> => {
  return cached(`ia-comics:${query}:${limit}`, 1000 * 60 * 60, async () => {
    const params = new URLSearchParams({
      q: `${query} AND mediatype:texts`,
      fl: 'identifier,title,creator,date,subject,downloads',
      sort: 'downloads desc', rows: String(limit), output: 'json',
    });
    const res = await fetch(`${IA_SEARCH}?${params}`);
    if (!res.ok) throw new Error(`IA ${res.status}`);
    const data = await res.json();
    return (data.response?.docs || []).map((d: any): ArchiveBook => ({
      id: d.identifier,
      title: d.title || d.identifier,
      authors: Array.isArray(d.creator) ? d.creator : [d.creator || 'Unknown'],
      subjects: Array.isArray(d.subject) ? d.subject : (d.subject ? [d.subject] : ['Comics']),
      // IA comics read via their PDF or page images (same path BookTab uses for IA texts).
      formats: { 'application/pdf': `https://archive.org/download/${d.identifier}/${d.identifier}.pdf`, ia: d.identifier },
      download_count: d.downloads || 0,
      coverImage: `https://archive.org/services/img/${d.identifier}`,
      genre: 'Public-Domain Comics',
      year: Array.isArray(d.date) ? d.date[0] : d.date,
    } as ArchiveBook & { year?: string }));
  }).catch(() => []);
};

// archive.org almost never names its PDF exactly `<identifier>.pdf`, so the guessed
// download URL 404s and the reader opens a dead link. Resolve the REAL readable file
// from the item metadata: prefer a content PDF (not the OCR `_text.pdf`), then any PDF.
// Returns a proper download URL (path segments encoded, slashes preserved), or null.
export const resolveArchiveReadableUrl = async (identifier: string): Promise<string | null> => {
  try {
    const res = await fetch(`https://archive.org/metadata/${identifier}`);
    if (!res.ok) return null;
    const data = await res.json();
    const files: Array<{ name: string }> = data?.files || [];
    const pdf =
      files.find(f => /\.pdf$/i.test(f.name) && !/_text\.pdf$/i.test(f.name)) ||
      files.find(f => /\.pdf$/i.test(f.name));
    if (!pdf) return null;
    const encoded = pdf.name.split('/').map(encodeURIComponent).join('/');
    return `https://archive.org/download/${identifier}/${encoded}`;
  } catch {
    return null;
  }
};

// ── Manga metadata / history (AniList) ─────────────────────────────────────────
export interface MangaEntry {
  id: number;
  title: string;
  nativeTitle?: string;
  description?: string;
  year?: number;
  coverImage?: string;
  bannerImage?: string;
  genres: string[];
  score?: number;
  staff: string[];
  siteUrl?: string;
  country?: string;   // JP (manga) / KR (manhwa) / CN (manhua)
}

const ANILIST = 'https://graphql.anilist.co';
const MANGA_QUERY = `
query ($page:Int,$sort:[MediaSort],$search:String,$year:FuzzyDateInt){
  Page(page:$page, perPage:30){
    media(type:MANGA, sort:$sort, search:$search, startDate_greater:$year, isAdult:false){
      id title{english romaji native} description(asHtml:false)
      startDate{year} coverImage{large} bannerImage genres averageScore
      countryOfOrigin siteUrl staff(perPage:3){edges{node{name{full}}}}
    }
  }
}`;

const mapManga = (m: any): MangaEntry => ({
  id: m.id,
  title: m.title?.english || m.title?.romaji || m.title?.native || 'Untitled',
  nativeTitle: m.title?.native,
  description: (m.description || '').replace(/<[^>]+>/g, '').trim(),
  year: m.startDate?.year || undefined,
  coverImage: m.coverImage?.large,
  bannerImage: m.bannerImage || undefined,
  genres: m.genres || [],
  score: m.averageScore || undefined,
  staff: (m.staff?.edges || []).map((e: any) => e.node?.name?.full).filter(Boolean),
  siteUrl: m.siteUrl,
  country: m.countryOfOrigin,
});

/** Manga discovery/history via AniList. sort: 'POPULARITY_DESC' | 'START_DATE' | 'SCORE_DESC'. */
export const fetchAnilistManga = async (
  opts: { sort?: string; search?: string; sinceYear?: number; limit?: number } = {},
): Promise<MangaEntry[]> => {
  const sort = opts.sort || 'POPULARITY_DESC';
  const key = `anilist:${sort}:${opts.search || ''}:${opts.sinceYear || ''}`;
  return cached(key, 1000 * 60 * 30, async () => {
    const res = await fetch(ANILIST, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: MANGA_QUERY, variables: { page: 1, sort: [sort], search: opts.search || undefined, year: opts.sinceYear ? opts.sinceYear * 10000 : undefined } }),
    });
    if (!res.ok) throw new Error(`AniList ${res.status}`);
    const data = await res.json();
    return (data?.data?.Page?.media || []).map(mapManga);
  }).catch(() => []);
};

// Manga "eras" for the history/museum experience.
export const MANGA_ERAS: { label: string; since: number; note: string }[] = [
  { label: 'Post-war Foundations', since: 1945, note: 'Tezuka & the birth of story manga' },
  { label: 'Shōnen Boom', since: 1968, note: 'Weekly Shōnen Jump era begins' },
  { label: 'Golden 80s–90s', since: 1985, note: 'Global breakout classics' },
  { label: 'Modern', since: 2005, note: 'Digital + worldwide simulpub' },
];

// ── Museum: legendary creators (artists & writers) ─────────────────────────────
// Verified portraits from Wikimedia Commons & AniList, plus Wikipedia slugs and rich biographies.
export interface Legend {
  name: string;
  role: 'Writer' | 'Artist' | 'Writer-Artist' | 'Studio';
  field: 'Comics' | 'Manga';
  era: string;
  years?: string;
  nationality?: string;
  knownFor: string;
  legacy: string;
  bio: string;
  portraitUrl: string;
  wikiSlug: string;
  color: string;
}

export const COMIC_LEGENDS: Legend[] = [
  {
    name: 'Jack Kirby',
    role: 'Artist',
    field: 'Comics',
    era: '1940s–1980s',
    years: '1917–1994',
    nationality: 'American',
    knownFor: 'Fantastic Four · X-Men · Captain America · New Gods',
    legacy: '“The King of Comics.” His dynamic, cosmic art built the Marvel Universe and the visual language of the superhero.',
    bio: 'Born Jacob Kurtzberg in Manhattan’s Lower East Side, Jack Kirby invented the grammar of modern action comics. From co-creating Captain America with Joe Simon in 1940 to forging the Marvel Age alongside Stan Lee in the 1960s and his epic Fourth World saga at DC, Kirby’s foreshortened anatomy, “Kirby Krackle” energy fields, and mythic double-page splashes defined sequential art.',
    portraitUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a0/Jack-Kirby_art-of-jack-kirby_wyman-skaar.jpg/330px-Jack-Kirby_art-of-jack-kirby_wyman-skaar.jpg',
    wikiSlug: 'Jack_Kirby',
    color: '#FF8C00',
  },
  {
    name: 'Stan Lee',
    role: 'Writer',
    field: 'Comics',
    era: '1960s–2000s',
    years: '1922–2018',
    nationality: 'American',
    knownFor: 'Spider-Man · X-Men · Hulk · Avengers',
    legacy: 'Co-created Marvel’s pantheon and gave superheroes real, relatable humanity — flawed people behind the masks.',
    bio: 'As editor-in-chief and head writer of Marvel Comics, Stan Lee revolutionized the industry in the 1960s by introducing complex, neurotic, and deeply human protagonists into superhero storytelling. Collaborating with artists Jack Kirby and Steve Ditko via the “Marvel Method,” he built an interconnected fictional universe anchored in real-world New York City.',
    portraitUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6b/Stan_Lee_2007_%28cropped%29.jpg/330px-Stan_Lee_2007_%28cropped%29.jpg',
    wikiSlug: 'Stan_Lee',
    color: '#D40055',
  },
  {
    name: 'Will Eisner',
    role: 'Writer-Artist',
    field: 'Comics',
    era: '1930s–2000s',
    years: '1917–2005',
    nationality: 'American',
    knownFor: 'The Spirit · A Contract with God',
    legacy: 'Pioneered sequential-art storytelling and championed the “graphic novel” as a serious literary form.',
    bio: 'Will Eisner transformed newspaper comic supplements in the 1940s with The Spirit, blending expressionist film noir lighting, architectural title splashes, and urban humanism. In 1978, his tenement anthology A Contract with God popularized the modern graphic novel, and his treatise Comics and Sequential Art became the foundational textbook of the medium. The comics industry’s highest honor, the Eisner Award, bears his name.',
    portraitUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b2/Will_Eisner_%28San_Diego_Comic_Con%2C_2004%29.jpg/330px-Will_Eisner_%28San_Diego_Comic_Con%2C_2004%29.jpg',
    wikiSlug: 'Will_Eisner',
    color: '#6B0099',
  },
  {
    name: 'Alan Moore',
    role: 'Writer',
    field: 'Comics',
    era: '1980s–',
    years: 'b. 1953',
    nationality: 'British',
    knownFor: 'Watchmen · V for Vendetta · From Hell · Swamp Thing',
    legacy: 'Redefined comics as literature with dense, deconstructive masterworks that changed what the medium could say.',
    bio: 'Emerging from British underground and anthology magazines like 2000 AD and Warrior, Alan Moore brought formalist literary structure, political philosophy, and psychological realism to mainstream comics. Watchmen (with Dave Gibbons) remains the only graphic novel on TIME’s list of the 100 best English-language novels.',
    portraitUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2d/Alan_Moore_%282%29.jpg/330px-Alan_Moore_%282%29.jpg',
    wikiSlug: 'Alan_Moore',
    color: '#0070FF',
  },
  {
    name: 'Frank Miller',
    role: 'Writer-Artist',
    field: 'Comics',
    era: '1980s–',
    years: 'b. 1957',
    nationality: 'American',
    knownFor: 'The Dark Knight Returns · Sin City · Daredevil: Born Again · 300',
    legacy: 'Brought noir grit and cinematic edge that reshaped the modern superhero and inspired a generation of film.',
    bio: 'Blending hardboiled crime fiction, Japanese gekiga manga pacing (inspired by Lone Wolf and Cub), and stark chiaroscuro brushwork, Frank Miller reinvented Daredevil and Batman in the 1980s. His 1986 miniseries The Dark Knight Returns and creator-owned noir saga Sin City ushered in the Modern Age of comics.',
    portraitUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/cb/7.14.26FrankMillerByLuigiNovi1a.jpg/330px-7.14.26FrankMillerByLuigiNovi1a.jpg',
    wikiSlug: 'Frank_Miller_(comics)',
    color: '#E2473B',
  },
  {
    name: 'Neil Gaiman',
    role: 'Writer',
    field: 'Comics',
    era: '1989–',
    years: 'b. 1960',
    nationality: 'British',
    knownFor: 'The Sandman · Marvel 1602 · The Books of Magic',
    legacy: 'Wove myth, dream and literary fantasy into comics’ most acclaimed saga — the first comic to win a literary award.',
    bio: 'With The Sandman (1989–1996), Neil Gaiman fused classical mythology, Shakespearean drama, folklore, and gothic horror into a 75-issue meditation on stories and the price of dreaming. Issue #19 (“A Midsummer Night’s Dream”) won the World Fantasy Award for Best Short Fiction, proving sequential art’s parity with prose literature.',
    portraitUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/bc/Kyle-cassidy-neil-gaiman-April-2013.jpg/330px-Kyle-cassidy-neil-gaiman-April-2013.jpg',
    wikiSlug: 'Neil_Gaiman',
    color: '#00C878',
  },
  {
    name: 'Hergé',
    role: 'Writer-Artist',
    field: 'Comics',
    era: '1929–1980s',
    years: '1907–1983',
    nationality: 'Belgian',
    knownFor: 'The Adventures of Tintin',
    legacy: 'Master of the “clear line” style; defined European comics (bande dessinée) for the world.',
    bio: 'Born Georges Prosper Remi in Brussels, Hergé created The Adventures of Tintin in 1929 and pioneered the ligne claire (“clear line”) aesthetic: uniform, unshaded ink contours paired with meticulously researched architectural and mechanical backdrops. His work elevated Franco-Belgian bande dessinée into the “Ninth Art.”',
    portraitUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0c/Herge-Italie-1965-Linus.png/330px-Herge-Italie-1965-Linus.png',
    wikiSlug: 'Herg%C3%A9',
    color: '#E7B24B',
  },
  {
    name: 'Charles Schulz',
    role: 'Writer-Artist',
    field: 'Comics',
    era: '1950–2000',
    years: '1922–2000',
    nationality: 'American',
    knownFor: 'Peanuts',
    legacy: 'Turned a daily strip into a half-century meditation on childhood, failure and the human heart.',
    bio: 'For nearly 50 years, Charles “Sparky” Schulz drew every single line of all 17,897 Peanuts strips by hand without assistants. Through Charlie Brown, Snoopy, Linus, and Lucy, he brought existential philosophy, melancholy, and quiet resilience to 355 million daily readers across 75 countries.',
    portraitUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/ba/Charles_Schulz_NYWTS.jpg/330px-Charles_Schulz_NYWTS.jpg',
    wikiSlug: 'Charles_M._Schulz',
    color: '#8B5CF6',
  },
];

export const MANGA_LEGENDS: Legend[] = [
  {
    name: 'Osamu Tezuka',
    role: 'Writer-Artist',
    field: 'Manga',
    era: '1946–1989',
    years: '1928–1989',
    nationality: 'Japanese',
    knownFor: 'Astro Boy · Black Jack · Phoenix · Buddha · Kimba',
    legacy: 'The “God of Manga.” Invented modern story-manga and its cinematic panel language; father of the industry.',
    bio: 'Trained as a medical doctor in Osaka, Osamu Tezuka revolutionized post-war Japanese comics in 1947 with New Treasure Island, introducing filmic camera angles, decompression, and tragic emotional depth. Across 700+ volumes and 150,000 drawn pages — from Astro Boy to his philosophical lifework Phoenix (Hi no Tori) — he birthed both modern manga and anime.',
    portraitUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/1d/Osamu_Tezuka_1951_Scan10008-2.JPG/330px-Osamu_Tezuka_1951_Scan10008-2.JPG',
    wikiSlug: 'Osamu_Tezuka',
    color: '#D40055',
  },
  {
    name: 'Akira Toriyama',
    role: 'Writer-Artist',
    field: 'Manga',
    era: '1980s–2020s',
    years: '1955–2024',
    nationality: 'Japanese',
    knownFor: 'Dragon Ball · Dr. Slump · Chrono Trigger · Dragon Quest',
    legacy: 'His action and crystalline clarity made shōnen a global phenomenon and defined a genre’s template.',
    bio: 'Beginning with the anarchic slapstick of Dr. Slump and ascending to global immortality with Dragon Ball (1984–1995), Akira Toriyama perfected kinetic martial-arts paneling, effortless eye-flow, and iconic industrial/character design. His work inspired virtually every shōnen creator who followed.',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/en/1/15/Akira_Toriyama_in_1982.jpg',
    wikiSlug: 'Akira_Toriyama',
    color: '#FF8C00',
  },
  {
    name: 'Naoki Urasawa',
    role: 'Writer-Artist',
    field: 'Manga',
    era: '1980s–',
    years: 'b. 1960',
    nationality: 'Japanese',
    knownFor: 'Monster · 20th Century Boys · Pluto · Yawara!',
    legacy: 'Master of the literary thriller in manga form — meticulous, humane, endlessly suspenseful.',
    bio: 'A three-time winner of the Shogakukan Manga Award and two-time winner of the Tezuka Osamu Cultural Prize, Naoki Urasawa crafts sprawling psychological mysteries (Monster, 20th Century Boys, Pluto) that read with the moral weight of European literary fiction and the pacing of Hitchcockian cinema.',
    portraitUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/38/Naoki_Urasawa_in_2012_%28cropped%29.jpg/330px-Naoki_Urasawa_in_2012_%28cropped%29.jpg',
    wikiSlug: 'Naoki_Urasawa',
    color: '#0070FF',
  },
  {
    name: 'Rumiko Takahashi',
    role: 'Writer-Artist',
    field: 'Manga',
    era: '1978–',
    years: 'b. 1957',
    nationality: 'Japanese',
    knownFor: 'Ranma ½ · Inuyasha · Urusei Yatsura · Maison Ikkoku',
    legacy: 'One of the best-selling comic artists in history and the undisputed queen of the romantic comedy.',
    bio: 'With over 230 million copies sold worldwide, Rumiko Takahashi broke barriers as a female mangaka dominating shōnen magazines. Blending Japanese folklore, razor-sharp comedic timing, and heartfelt romance across Urusei Yatsura, Maison Ikkoku, Ranma ½, and Inuyasha, she was inducted into the Will Eisner Hall of Fame and awarded the Grand Prix de la ville d’Angoulême.',
    portraitUrl: 'https://s4.anilist.co/file/anilistcdn/staff/large/n96891-fWkU5wHg50nH.png',
    wikiSlug: 'Rumiko_Takahashi',
    color: '#FF4D8D',
  },
  {
    name: 'Katsuhiro Otomo',
    role: 'Writer-Artist',
    field: 'Manga',
    era: '1980s–',
    years: 'b. 1954',
    nationality: 'Japanese',
    knownFor: 'Akira · Domu: A Child’s Dream',
    legacy: 'His hyper-detailed, kinetic vision brought cyberpunk manga — and anime — to the entire world.',
    bio: 'Breaking away from stylized cartooning in the late 1970s, Katsuhiro Otomo introduced photorealistic architectural destruction, cinematic wide-angle foreshortening, and visceral psychic physics in Domu and his 2,000-page opus Akira (1982–1990), forever changing global science fiction.',
    portraitUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ee/Katsuhiro_Otomo.jpg/330px-Katsuhiro_Otomo.jpg',
    wikiSlug: 'Katsuhiro_Otomo',
    color: '#00C878',
  },
  {
    name: 'Eiichiro Oda',
    role: 'Writer-Artist',
    field: 'Manga',
    era: '1997–',
    years: 'b. 1975',
    nationality: 'Japanese',
    knownFor: 'One Piece',
    legacy: 'Author of the best-selling manga of all time — a decades-long adventure of staggering scale.',
    bio: 'Since July 1997, Eiichiro Oda has serialized One Piece in Weekly Shōnen Jump, surpassing 515 million copies in circulation and earning the Guinness World Record for the most copies published for the same comic book series by a single author. His worldbuilding weaves freedom, history, and myth into a modern Odyssey.',
    portraitUrl: 'https://s4.anilist.co/file/anilistcdn/staff/large/n96881-Cyv6wFJxpDw7.png',
    wikiSlug: 'Eiichiro_Oda',
    color: '#6B0099',
  },
  {
    name: 'Moto Hagio',
    role: 'Writer-Artist',
    field: 'Manga',
    era: '1969–',
    years: 'b. 1949',
    nationality: 'Japanese',
    knownFor: 'The Poe Clan · The Heart of Thomas · They Were Eleven',
    legacy: 'Pioneer of the “Year 24 Group” who turned shōjo manga into rich, literary art.',
    bio: 'Founding figure of the revolutionary Year 24 Group (Nijūyo-nen Gumi) in the 1970s, Moto Hagio liberated girls’ manga (shōjo) from formulaic melodrama, introducing speculative science fiction, Gothic existentialism, interior monologues, and layered montage layouts. She became the first shōjo mangaka awarded Japan’s Person of Cultural Merit.',
    portraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/e9/Hagio_Moto_in_2008.jpg',
    wikiSlug: 'Moto_Hagio',
    color: '#8B5CF6',
  },
  {
    name: 'Go Nagai',
    role: 'Writer-Artist',
    field: 'Manga',
    era: '1967–',
    years: 'b. 1945',
    nationality: 'Japanese',
    knownFor: 'Devilman · Mazinger Z · Cutie Honey · Violence Jack',
    legacy: 'Created the piloted-robot and dark-fantasy genres that shaped decades of manga and anime.',
    bio: 'Fearless and iconoclastic, Go Nagai shattered taboos in Japanese comics while inventing three foundational pillars of pop culture: the cockpit-piloted super robot (Mazinger Z), the transforming magical-girl warrior (Cutie Honey), and apocalyptic dark-fantasy tragedy (Devilman, 1972).',
    portraitUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/de/Go_Nagai_20080704_Japan_Expo_05_%28cropped%29.jpg/330px-Go_Nagai_20080704_Japan_Expo_05_%28cropped%29.jpg',
    wikiSlug: 'Go_Nagai',
    color: '#E2473B',
  },
];

// ── Museum: history timelines ──────────────────────────────────────────────────
export interface HistoryEra {
  period: string;
  title: string;
  blurb: string;
  keyFigures?: string[];
  milestoneWorks?: string[];
}

export const COMICS_HISTORY: HistoryEra[] = [
  {
    period: '1890s–1930s',
    title: 'The Strip & the Newsstand',
    blurb: 'Newspaper strips (The Yellow Kid, Winsor McCay’s Little Nemo in Slumberland, George Herriman’s Krazy Kat) build a mass readership. In Europe, Hergé debuts Tintin (1929), and in June 1938 Action Comics #1 introduces Superman — giving birth to the modern comic book.',
    keyFigures: ['Hergé', 'Will Eisner'],
    milestoneWorks: ['Little Nemo in Slumberland (1905)', 'Tintin in the Land of the Soviets (1929)', 'Action Comics #1 (1938)'],
  },
  {
    period: '1938–1956',
    title: 'The Golden Age',
    blurb: 'Superheroes explode across newsstands — Superman, Batman, Wonder Woman, and Jack Kirby & Joe Simon’s Captain America — while Will Eisner’s The Spirit transforms Sunday newspapers into noir cinema on paper.',
    keyFigures: ['Jack Kirby', 'Will Eisner', 'Charles Schulz'],
    milestoneWorks: ['Detective Comics #27 (1939)', 'The Spirit (1940)', 'Captain America Comics #1 (1941)', 'Peanuts (1950)'],
  },
  {
    period: '1956–1970',
    title: 'The Silver Age',
    blurb: 'A cosmic, science-fueled renaissance. Stan Lee, Jack Kirby, and Steve Ditko launch the Marvel Revolution — Fantastic Four, Spider-Man, the X-Men, the Avengers — giving gods and heroes human flaws and shared continuity.',
    keyFigures: ['Jack Kirby', 'Stan Lee'],
    milestoneWorks: ['Showcase #4 (1956)', 'Fantastic Four #1 (1961)', 'Amazing Fantasy #15 (1962)', 'The X-Men #1 (1963)'],
  },
  {
    period: '1970–1985',
    title: 'The Bronze Age',
    blurb: 'Comics confront real-world social upheaval, urban grit, and psychological complexity. Will Eisner publishes A Contract with God (1978), cementing the graphic novel as a literary medium.',
    keyFigures: ['Will Eisner', 'Jack Kirby', 'Frank Miller'],
    milestoneWorks: ['New Gods #1 (1971)', 'A Contract with God (1978)', 'Daredevil #168 (1981)'],
  },
  {
    period: '1986–Today',
    title: 'The Modern & Literary Age',
    blurb: 'Alan Moore’s Watchmen, Frank Miller’s The Dark Knight Returns, and Neil Gaiman’s The Sandman elevate comics into acclaimed literature, while creator-owned presses and digital graphic novels expand the canvas worldwide.',
    keyFigures: ['Alan Moore', 'Frank Miller', 'Neil Gaiman'],
    milestoneWorks: ['Watchmen (1986)', 'The Dark Knight Returns (1986)', 'The Sandman (1989)', 'Sin City (1991)'],
  },
];

export const MANGA_HISTORY: HistoryEra[] = [
  {
    period: 'Edo–1930s',
    title: 'Scrolls, Ukiyo-e & Kamishibai',
    blurb: 'From 12th-century Chōjū-giga picture scrolls and Katsushika Hokusai’s Edo sketchbooks (Hokusai Manga, 1814) to early 20th-century newspaper strips and kamishibai street paper-theatre, Japan cultivates a deep visual-narrative heritage.',
    keyFigures: ['Osamu Tezuka'],
    milestoneWorks: ['Chōjū-jinbutsu-giga', 'Hokusai Manga (1814)'],
  },
  {
    period: '1945–1960s',
    title: 'Story Manga is Born',
    blurb: 'Osamu Tezuka’s New Treasure Island (1947) and Astro Boy (1952) invent modern story manga (sutōrī manga) — hundreds of pages of cinematic pacing, expressive motion lines, and tragic heroism.',
    keyFigures: ['Osamu Tezuka', 'Go Nagai'],
    milestoneWorks: ['New Treasure Island (1947)', 'Astro Boy (1952)', 'Phoenix (1954)'],
  },
  {
    period: '1968–1980s',
    title: 'The Shōnen Boom & Mecha Revolution',
    blurb: 'Weekly Shōnen Jump launches in 1968. Go Nagai’s Devilman and Mazinger Z, Rumiko Takahashi’s Urusei Yatsura, and Akira Toriyama’s Dr. Slump and Dragon Ball ignite a weekly circulation phenomenon.',
    keyFigures: ['Go Nagai', 'Rumiko Takahashi', 'Akira Toriyama'],
    milestoneWorks: ['Devilman (1972)', 'Mazinger Z (1972)', 'Urusei Yatsura (1978)', 'Dragon Ball (1984)'],
  },
  {
    period: '1970s–1980s',
    title: 'The Shōjo & Cyberpunk Revolutions',
    blurb: 'Moto Hagio and the Year 24 Group transform shōjo manga into psychological literature, while Katsuhiro Otomo’s Akira (1982) redefines global science fiction with hyper-detailed architectural realism.',
    keyFigures: ['Moto Hagio', 'Katsuhiro Otomo'],
    milestoneWorks: ['The Poe Clan (1972)', 'They Were Eleven (1975)', 'Akira (1982)', 'Ranma ½ (1987)'],
  },
  {
    period: '1990s–Today',
    title: 'The Global Literary & Adventure Era',
    blurb: 'Naoki Urasawa’s Monster and 20th Century Boys push psychological suspense, while Eiichiro Oda’s One Piece (1997–) becomes the best-selling comic series in human history as manga becomes a universal medium.',
    keyFigures: ['Naoki Urasawa', 'Eiichiro Oda', 'Rumiko Takahashi'],
    milestoneWorks: ['Monster (1994)', 'Inuyasha (1996)', 'One Piece (1997)', '20th Century Boys (1999)'],
  },
];

