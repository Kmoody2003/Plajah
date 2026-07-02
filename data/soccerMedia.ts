// soccerMedia.ts — curated "Watch & Play" content: free/open documentaries, the
// best soccer films, places to play the game, and matchday playlists. All links
// are keyless (YouTube search / official sites / archive.org) so nothing breaks
// or needs an API key. `free` flags what you can watch right now at no cost.

const yt = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

export interface DocEntry {
  title: string; year?: string; length?: string; blurb: string;
  free: boolean; where: string; url: string; videoId?: string;
}
export const DOCUMENTARIES: DocEntry[] = [
  { title: 'FIFA World Cup Official Film: Mexico 1970', year: '1970', length: '~1h', free: true, where: 'YouTube (FIFA)',
    blurb: 'Pelé\'s masterpiece Brazil side, shot in glorious colour — the tournament many call the greatest ever.', url: yt('1970 World Cup official film FIFA Brazil'), videoId: '4WfyCsxM1sw' },
  { title: 'FIFA World Cup Official Film: Mexico 1986', year: '1986', length: '~1h30', free: true, where: 'YouTube (FIFA)',
    blurb: 'Maradona carries Argentina to glory — the Hand of God and Goal of the Century in one tournament.', url: yt('1986 World Cup official film Hero Maradona'), videoId: '3eDZV-p9DiI' },
  { title: 'FIFA World Cup Official Film: Italia 1990', year: '1990', length: '~1h30', free: true, where: 'YouTube (FIFA)',
    blurb: 'Nessun Dorma, Gazza\'s tears and Roger Milla\'s dance — the tournament that reinvented football\'s image.', url: yt('1990 World Cup official film Italia') },
  { title: 'The Two Escobars', year: '2010', length: '1h40', free: false, where: 'ESPN 30 for 30',
    blurb: 'How Colombian football, Pablo Escobar and the murder of Andrés Escobar became fatally intertwined.', url: yt('The Two Escobars 30 for 30 full documentary') },
  { title: 'Diego Maradona', year: '2019', length: '2h10', free: false, where: 'Streaming / rent',
    blurb: 'Asif Kapadia\'s archive-only portrait of the rise and fall of the most human of geniuses.', url: yt('Diego Maradona 2019 documentary Kapadia trailer'), videoId: 'Pmm7r4ynyIQ' },
  { title: 'Pelé', year: '2021', length: '1h48', free: false, where: 'Netflix',
    blurb: 'The King in his own words — how a 17-year-old changed a nation and a sport forever.', url: yt('Pele Netflix documentary trailer'), videoId: 'KMyUnyxVB9Q' },
  { title: 'All or Nothing / Behind-the-scenes series', year: '—', length: 'Series', free: false, where: 'Prime / streaming',
    blurb: 'Fly-on-the-wall access inside elite national teams and clubs across a full campaign.', url: yt('All or Nothing football documentary series') },
  { title: 'The Game of Their Lives (Korea 1966)', year: '2002', length: '1h20', free: true, where: 'Archive / YouTube',
    blurb: 'North Korea\'s astonishing run to the 1966 quarter-finals, told through the surviving players.', url: yt('The Game of Their Lives 1966 North Korea documentary'), videoId: 'Cga_q9vShFQ' },
];

export interface MovieEntry { title: string; year: string; blurb: string; url: string; }
export const MOVIES: MovieEntry[] = [
  { title: 'Escape to Victory', year: '1981', blurb: 'POWs (and Pelé, Bobby Moore & Ardiles) take on the Nazis in a match for freedom. A camp classic.', url: yt('Escape to Victory 1981 film') },
  { title: 'The Damned United', year: '2009', blurb: 'Michael Sheen as Brian Clough in his doomed 44 days at Leeds — sharp, funny, brilliant.', url: yt('The Damned United film trailer') },
  { title: 'Bend It Like Beckham', year: '2002', blurb: 'A joyful story of a girl, her family and the game she refuses to give up.', url: yt('Bend It Like Beckham trailer') },
  { title: 'Goal! The Dream Begins', year: '2005', blurb: 'A Mexican-American kid chases the dream from Los Angeles to Newcastle United.', url: yt('Goal The Dream Begins trailer') },
  { title: 'Zidane: A 21st Century Portrait', year: '2006', blurb: '17 cameras follow Zidane for one whole match — hypnotic art-house football.', url: yt('Zidane a 21st century portrait') },
  { title: 'Next Goal Wins', year: '2023', blurb: 'The true story of American Samoa — once beaten 31–0 — chasing a single win. Heart over trophies.', url: yt('Next Goal Wins trailer') },
  { title: 'The Miracle of Bern', year: '2003', blurb: 'West Germany\'s stunning 1954 World Cup win, seen through a boy and his returning father.', url: yt('The Miracle of Bern trailer') },
  { title: 'Maradona by Kusturica', year: '2008', blurb: 'Emir Kusturica\'s wild, personal ride through the myth of Diego.', url: yt('Maradona by Kusturica trailer') },
];

export interface GameEntry { title: string; kind: string; blurb: string; free: boolean; url: string; }
export const GAMES: GameEntry[] = [
  { title: 'EA Sports FC', kind: 'Console / PC', free: false, blurb: 'The blockbuster simulation (formerly FIFA) — play the World Cup nations and legends.', url: 'https://www.ea.com/games/ea-sports-fc' },
  { title: 'Football Manager', kind: 'PC / mobile', free: false, blurb: 'The deepest management sim — take a nation to World Cup glory from the dugout.', url: 'https://www.footballmanager.com/' },
  { title: 'Score! Hero', kind: 'Mobile', free: true, blurb: 'Bite-size, gorgeous "be the hero" moments — free on iOS & Android.', url: yt('Score Hero game') },
  { title: 'Retro Bowl-style browser kickabouts', kind: 'Browser', free: true, blurb: 'Free instant-play penalty shootouts and mini soccer games right in your browser.', url: 'https://www.crazygames.com/t/soccer' },
  { title: 'Head Ball 2', kind: 'Mobile', free: true, blurb: 'Fast, funny 1v1 online matches — easy to pick up, free to play.', url: yt('Head Ball 2 game') },
  { title: 'Google "World Cup" mini-games', kind: 'Browser', free: true, blurb: 'Search-engine easter-egg kickabouts and penalty games — free, no install.', url: 'https://www.google.com/search?q=play+soccer+game' },
];

export interface Playlist { title: string; blurb: string; url: string; playlistId?: string; }
// Timeless football-atmosphere playlists — embeddable YouTube playlist IDs
// (oEmbed-verified) so they play inline; `url` is the open-on-YouTube fallback.
export const ANTHEM_PLAYLISTS: Playlist[] = [
  { title: 'Greatest Stadium Anthems', blurb: 'You\'ll Never Walk Alone, Seven Nation Army, Freed from Desire — the songs terraces sing.', playlistId: 'PLplnxyMWBRx39dv_BrGAMqiJClFOMhVfQ', url: yt('greatest football stadium anthems playlist') },
  { title: 'Official World Cup Songs', blurb: 'Waka Waka, La Copa de la Vida, Wavin\' Flag — every tournament\'s anthem in one place.', playlistId: 'PLxA687tYuMWiyXAnp3Q6h3danVtI66l0C', url: yt('official World Cup songs playlist all years') },
  { title: 'Walkout & Warm-up Bangers', blurb: 'The tunnel playlist — what players hear before they take the pitch.', playlistId: 'PLyiAq87WKZqUQs10jbWcrorbgupt3rRn3', url: yt('football warm up walkout songs playlist') },
  { title: 'Samba & Terrace Drums', blurb: 'Brazilian batucada and the percussion that powers the world\'s great ends.', playlistId: 'PLZfvs4SCZV87HJjFKXWETxddNtvhmzXZA', url: yt('samba football terrace drums batucada') },
];
