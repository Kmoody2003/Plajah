// soccerMuseum.ts — curated exhibits for the Soccer Museum: the iconic moments,
// the all-time records, and the "hall of fame" eras. Photos are hydrated from
// Wikipedia (wikiSlug) at render time; highlight links point to YouTube search so
// no API key is needed and nothing goes stale.

export interface IconicMoment {
  id: string;
  title: string;
  year: number;
  who: string;          // player / team
  blurb: string;
  wikiSlug: string;     // Wikipedia page for the photo
  youtube: string;      // search query for the highlight (fallback)
  videoId?: string;     // verified embeddable YouTube id (oEmbed-checked)
  tag: 'Goal' | 'Moment' | 'Save' | 'Upset' | 'Drama';
}

const yt = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

export const ICONIC_MOMENTS: IconicMoment[] = [
  { id: 'hand-of-god', videoId: 'Da_CDPRG2j0', title: 'The Hand of God & Goal of the Century', year: 1986, who: 'Diego Maradona', tag: 'Goal',
    blurb: 'Four minutes, two of the most famous goals ever — one with his fist, one slaloming past half of England.', wikiSlug: 'Argentina_v_England_(1986_FIFA_World_Cup)', youtube: yt('Maradona goal of the century 1986 vs England') },
  { id: 'maracanazo', videoId: 'Fz1o3DbC4To', title: 'The Maracanazo', year: 1950, who: 'Uruguay', tag: 'Upset',
    blurb: 'Uruguay silenced 200,000 fans in the Maracanã to steal the World Cup from host Brazil.', wikiSlug: 'Maracanazo', youtube: yt('Maracanazo 1950 Uruguay Brazil') },
  { id: 'zidane-headbutt', videoId: 'jb16JvUCVQs', title: 'The Headbutt', year: 2006, who: 'Zinedine Zidane', tag: 'Drama',
    blurb: 'Zidane\'s glorious career ended with a red card in the final — a moment of madness that stunned the world.', wikiSlug: 'Zinedine_Zidane_headbutt', youtube: yt('Zidane headbutt Materazzi 2006 final') },
  { id: 'iniesta-2010', videoId: '3pCPQDxZzfY', title: 'Iniesta Wins It for Spain', year: 2010, who: 'Andrés Iniesta', tag: 'Goal',
    blurb: 'Deep in extra time, Iniesta volleyed home Spain\'s first-ever World Cup — "Iniesta de mi vida".', wikiSlug: '2010_FIFA_World_Cup_Final', youtube: yt('Iniesta goal 2010 World Cup final') },
  { id: 'gotze-2014', videoId: 'ffAYByv2pLc', title: 'Götze\'s Golden Touch', year: 2014, who: 'Mario Götze', tag: 'Goal',
    blurb: 'A chest-and-volley in the 113th minute gave Germany the 2014 title against Argentina.', wikiSlug: '2014_FIFA_World_Cup_Final', youtube: yt('Gotze goal 2014 World Cup final') },
  { id: 'mbappe-2022', videoId: 'RgqKdplLIk4', title: 'A Final for the Ages', year: 2022, who: 'Messi & Mbappé', tag: 'Drama',
    blurb: 'Messi\'s crowning glory, Mbappé\'s final hat-trick, and a penalty shootout — the greatest final ever played.', wikiSlug: '2022_FIFA_World_Cup_Final', youtube: yt('2022 World Cup final Argentina France highlights') },
  { id: 'banks-save', videoId: 'HNLam4RAbg8', title: 'The Save of the Century', year: 1970, who: 'Gordon Banks', tag: 'Save',
    blurb: 'Banks somehow clawed away Pelé\'s downward header — still called the greatest save of all time.', wikiSlug: 'Gordon_Banks', youtube: yt('Gordon Banks save Pele 1970') },
  { id: 'carlos-freekick', videoId: 'crKwlbwvr88', title: 'The Impossible Free Kick', year: 1997, who: 'Roberto Carlos', tag: 'Goal',
    blurb: 'A banana free kick that defied physics, bending impossibly around the wall against France.', wikiSlug: 'Roberto_Carlos', youtube: yt('Roberto Carlos free kick 1997 France') },
  { id: 'milla-dance', videoId: 'vrtWQSqD3A0', title: 'Roger Milla\'s Corner-Flag Dance', year: 1990, who: 'Roger Milla', tag: 'Moment',
    blurb: 'At 38, Milla lit up Italia \'90 and gave the world a celebration it never forgot.', wikiSlug: 'Roger_Milla', youtube: yt('Roger Milla dance 1990 World Cup') },
  { id: 'baggio-miss', videoId: '8pdHAGjKt2w', title: 'Baggio\'s Penalty', year: 1994, who: 'Roberto Baggio', tag: 'Drama',
    blurb: 'The tournament\'s best player skied the decisive penalty in the first final settled on spot-kicks.', wikiSlug: '1994_FIFA_World_Cup_Final', youtube: yt('Baggio penalty miss 1994 final') },
  { id: 'korea-2002', videoId: 'Ur5B9_uLW14', title: 'Korea\'s Miracle Run', year: 2002, who: 'South Korea', tag: 'Upset',
    blurb: 'Co-hosts South Korea stunned Italy and Spain to reach an improbable semi-final.', wikiSlug: 'South_Korea_national_football_team', youtube: yt('South Korea 2002 World Cup run semifinal') },
  { id: 'morocco-2022', videoId: 'D7j51Vzfyrg', title: 'Morocco Makes History', year: 2022, who: 'Morocco', tag: 'Upset',
    blurb: 'The Atlas Lions beat Spain and Portugal to become the first African side in a World Cup semi-final.', wikiSlug: 'Morocco_national_football_team', youtube: yt('Morocco 2022 World Cup semifinal run') },
  { id: 'germany-brazil', videoId: 'aE4BdIP6bvc', title: 'The 7–1', year: 2014, who: 'Germany vs Brazil', tag: 'Drama',
    blurb: 'Germany scored four goals in six second-half minutes to humble the hosts in a stunning semi-final.', wikiSlug: 'Brazil_v_Germany_(2014_FIFA_World_Cup)', youtube: yt('Germany 7-1 Brazil 2014 highlights') },
  { id: 'usa-1950', videoId: 'GtipqhXrPYU', title: 'The Miracle on Grass', year: 1950, who: 'United States', tag: 'Upset',
    blurb: 'A part-time USA side beat mighty England 1–0 in one of the greatest upsets in sport.', wikiSlug: 'England_v_United_States_(1950_FIFA_World_Cup)', youtube: yt('USA 1 England 0 1950 World Cup') },
];

export interface MuseumRecord { label: string; value: string; holder: string; note?: string; }

export const WC_RECORDS: MuseumRecord[] = [
  { label: 'Most World Cup titles', value: '5', holder: 'Brazil', note: '1958, 1962, 1970, 1994, 2002' },
  { label: 'Most goals (all-time)', value: '16', holder: 'Miroslav Klose (Germany)', note: 'Across 4 tournaments' },
  { label: 'Most goals, one tournament', value: '13', holder: 'Just Fontaine (France)', note: '1958 — still unbeaten' },
  { label: 'Youngest World Cup winner', value: '17', holder: 'Pelé (Brazil)', note: '1958' },
  { label: 'Most tournaments played', value: '5', holder: 'Several', note: 'incl. Rafael Márquez, Messi, Ronaldo' },
  { label: 'Most final appearances', value: '3', holder: 'Cafú (Brazil)', note: '1994, 1998, 2002' },
  { label: 'Fastest World Cup goal', value: '11 sec', holder: 'Hakan Şükür (Turkey)', note: '2002' },
  { label: 'Biggest final crowd', value: '~174,000', holder: 'Maracanã, 1950', note: 'Brazil vs Uruguay' },
  { label: 'First World Cup', value: '1930', holder: 'Uruguay (hosts & champions)', note: '13 teams' },
  { label: '2026: biggest ever', value: '48 teams', holder: 'USA · Canada · Mexico', note: '104 matches, 3 hosts' },
];

// A default "greatest of all time" shortlist for the Museum landing gallery
// (wikiSlugs match data/soccerLegends.ts).
export const GOAT_SLUGS: string[] = [
  'Pel%C3%A9', 'Diego_Maradona', 'Lionel_Messi', 'Johan_Cruyff', 'Franz_Beckenbauer',
  'Zinedine_Zidane', 'Ronaldo_(Brazilian_footballer)', 'Cristiano_Ronaldo', 'Alfredo_Di_St%C3%A9fano',
  'Michel_Platini', 'Ronaldinho', 'Garrincha', 'Marco_van_Basten', 'Gerd_M%C3%BCller',
  'Paolo_Maldini', 'Andr%C3%A9s_Iniesta',
];
