// Every FIFA World Cup final, 1930 → today.
// Public historical record. Trophy eras: Jules Rimet Trophy (1930–1970,
// retired with Brazil's third title), FIFA World Cup Trophy (1974–present).

export interface WCFinal {
  year: number;
  host: string;
  hostFlag: string;
  winner: string;
  winnerFlag: string;
  runnerUp: string;
  runnerUpFlag: string;
  score: string;            // final score, incl. aet / pens
  venue: string;
  city: string;
  trophy: 'rimet' | 'fifa';
  note?: string;            // famous storyline
  cancelled?: boolean;      // WWII gaps
  pending?: boolean;        // tournament not yet decided
}

export const WC_FINALS: WCFinal[] = [
  { year: 1930, host: 'Uruguay', hostFlag: '🇺🇾', winner: 'Uruguay', winnerFlag: '🇺🇾', runnerUp: 'Argentina', runnerUpFlag: '🇦🇷', score: '4–2', venue: 'Estadio Centenario', city: 'Montevideo', trophy: 'rimet', note: 'The first World Cup — hosts win it at home.' },
  { year: 1934, host: 'Italy', hostFlag: '🇮🇹', winner: 'Italy', winnerFlag: '🇮🇹', runnerUp: 'Czechoslovakia', runnerUpFlag: '🇨🇿', score: '2–1 (aet)', venue: 'Stadio Nazionale PNF', city: 'Rome', trophy: 'rimet' },
  { year: 1938, host: 'France', hostFlag: '🇫🇷', winner: 'Italy', winnerFlag: '🇮🇹', runnerUp: 'Hungary', runnerUpFlag: '🇭🇺', score: '4–2', venue: 'Stade Olympique de Colombes', city: 'Paris', trophy: 'rimet', note: 'Italy retain the title — first back-to-back champions.' },
  { year: 1942, host: '—', hostFlag: '🕊️', winner: '', winnerFlag: '', runnerUp: '', runnerUpFlag: '', score: '', venue: '', city: '', trophy: 'rimet', cancelled: true, note: 'Cancelled — World War II.' },
  { year: 1946, host: '—', hostFlag: '🕊️', winner: '', winnerFlag: '', runnerUp: '', runnerUpFlag: '', score: '', venue: '', city: '', trophy: 'rimet', cancelled: true, note: 'Cancelled — World War II.' },
  { year: 1950, host: 'Brazil', hostFlag: '🇧🇷', winner: 'Uruguay', winnerFlag: '🇺🇾', runnerUp: 'Brazil', runnerUpFlag: '🇧🇷', score: '2–1', venue: 'Estádio do Maracanã', city: 'Rio de Janeiro', trophy: 'rimet', note: 'The Maracanazo — Uruguay silence 200,000 in Rio.' },
  { year: 1954, host: 'Switzerland', hostFlag: '🇨🇭', winner: 'West Germany', winnerFlag: '🇩🇪', runnerUp: 'Hungary', runnerUpFlag: '🇭🇺', score: '3–2', venue: 'Wankdorf Stadium', city: 'Bern', trophy: 'rimet', note: 'The Miracle of Bern — Mighty Magyars finally beaten.' },
  { year: 1958, host: 'Sweden', hostFlag: '🇸🇪', winner: 'Brazil', winnerFlag: '🇧🇷', runnerUp: 'Sweden', runnerUpFlag: '🇸🇪', score: '5–2', venue: 'Råsunda Stadium', city: 'Solna', trophy: 'rimet', note: '17-year-old Pelé announces himself with two in the final.' },
  { year: 1962, host: 'Chile', hostFlag: '🇨🇱', winner: 'Brazil', winnerFlag: '🇧🇷', runnerUp: 'Czechoslovakia', runnerUpFlag: '🇨🇿', score: '3–1', venue: 'Estadio Nacional', city: 'Santiago', trophy: 'rimet', note: 'Garrincha carries Brazil to back-to-back titles.' },
  { year: 1966, host: 'England', hostFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', winner: 'England', winnerFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', runnerUp: 'West Germany', runnerUpFlag: '🇩🇪', score: '4–2 (aet)', venue: 'Wembley Stadium', city: 'London', trophy: 'rimet', note: 'Geoff Hurst’s hat-trick — "they think it’s all over…"' },
  { year: 1970, host: 'Mexico', hostFlag: '🇲🇽', winner: 'Brazil', winnerFlag: '🇧🇷', runnerUp: 'Italy', runnerUpFlag: '🇮🇹', score: '4–1', venue: 'Estadio Azteca', city: 'Mexico City', trophy: 'rimet', note: 'Pelé’s third crown — Brazil keep the Jules Rimet forever.' },
  { year: 1974, host: 'West Germany', hostFlag: '🇩🇪', winner: 'West Germany', winnerFlag: '🇩🇪', runnerUp: 'Netherlands', runnerUpFlag: '🇳🇱', score: '2–1', venue: 'Olympiastadion', city: 'Munich', trophy: 'fifa', note: 'Beckenbauer lifts the brand-new FIFA World Cup Trophy.' },
  { year: 1978, host: 'Argentina', hostFlag: '🇦🇷', winner: 'Argentina', winnerFlag: '🇦🇷', runnerUp: 'Netherlands', runnerUpFlag: '🇳🇱', score: '3–1 (aet)', venue: 'Estadio Monumental', city: 'Buenos Aires', trophy: 'fifa', note: 'Kempes leads the hosts through a ticker-tape final.' },
  { year: 1982, host: 'Spain', hostFlag: '🇪🇸', winner: 'Italy', winnerFlag: '🇮🇹', runnerUp: 'West Germany', runnerUpFlag: '🇩🇪', score: '3–1', venue: 'Santiago Bernabéu', city: 'Madrid', trophy: 'fifa', note: 'Rossi’s redemption tournament ends in a third star for Italy.' },
  { year: 1986, host: 'Mexico', hostFlag: '🇲🇽', winner: 'Argentina', winnerFlag: '🇦🇷', runnerUp: 'West Germany', runnerUpFlag: '🇩🇪', score: '3–2', venue: 'Estadio Azteca', city: 'Mexico City', trophy: 'fifa', note: 'Maradona’s World Cup — Hand of God and the Goal of the Century.' },
  { year: 1990, host: 'Italy', hostFlag: '🇮🇹', winner: 'West Germany', winnerFlag: '🇩🇪', runnerUp: 'Argentina', runnerUpFlag: '🇦🇷', score: '1–0', venue: 'Stadio Olimpico', city: 'Rome', trophy: 'fifa', note: 'Brehme’s late penalty settles a rematch of ’86.' },
  { year: 1994, host: 'United States', hostFlag: '🇺🇸', winner: 'Brazil', winnerFlag: '🇧🇷', runnerUp: 'Italy', runnerUpFlag: '🇮🇹', score: '0–0 (3–2 pens)', venue: 'Rose Bowl', city: 'Pasadena', trophy: 'fifa', note: 'First final decided on penalties — Baggio skies the last kick.' },
  { year: 1998, host: 'France', hostFlag: '🇫🇷', winner: 'France', winnerFlag: '🇫🇷', runnerUp: 'Brazil', runnerUpFlag: '🇧🇷', score: '3–0', venue: 'Stade de France', city: 'Saint-Denis', trophy: 'fifa', note: 'Zidane’s two headers crown the hosts.' },
  { year: 2002, host: 'South Korea & Japan', hostFlag: '🇰🇷🇯🇵', winner: 'Brazil', winnerFlag: '🇧🇷', runnerUp: 'Germany', runnerUpFlag: '🇩🇪', score: '2–0', venue: 'International Stadium', city: 'Yokohama', trophy: 'fifa', note: 'Ronaldo’s redemption — both goals in the final, fifth star for Brazil.' },
  { year: 2006, host: 'Germany', hostFlag: '🇩🇪', winner: 'Italy', winnerFlag: '🇮🇹', runnerUp: 'France', runnerUpFlag: '🇫🇷', score: '1–1 (5–3 pens)', venue: 'Olympiastadion', city: 'Berlin', trophy: 'fifa', note: 'Zidane’s headbutt, Grosso’s winning penalty.' },
  { year: 2010, host: 'South Africa', hostFlag: '🇿🇦', winner: 'Spain', winnerFlag: '🇪🇸', runnerUp: 'Netherlands', runnerUpFlag: '🇳🇱', score: '1–0 (aet)', venue: 'Soccer City', city: 'Johannesburg', trophy: 'fifa', note: 'Iniesta in the 116th minute — Spain’s first title.' },
  { year: 2014, host: 'Brazil', hostFlag: '🇧🇷', winner: 'Germany', winnerFlag: '🇩🇪', runnerUp: 'Argentina', runnerUpFlag: '🇦🇷', score: '1–0 (aet)', venue: 'Estádio do Maracanã', city: 'Rio de Janeiro', trophy: 'fifa', note: 'Götze’s extra-time chest-and-volley at the Maracanã.' },
  { year: 2018, host: 'Russia', hostFlag: '🇷🇺', winner: 'France', winnerFlag: '🇫🇷', runnerUp: 'Croatia', runnerUpFlag: '🇭🇷', score: '4–2', venue: 'Luzhniki Stadium', city: 'Moscow', trophy: 'fifa', note: 'Mbappé arrives — France’s second star.' },
  { year: 2022, host: 'Qatar', hostFlag: '🇶🇦', winner: 'Argentina', winnerFlag: '🇦🇷', runnerUp: 'France', runnerUpFlag: '🇫🇷', score: '3–3 (4–2 pens)', venue: 'Lusail Stadium', city: 'Lusail', trophy: 'fifa', note: 'Messi completes football — the greatest final ever played.' },
  { year: 2026, host: 'USA, Canada & Mexico', hostFlag: '🇺🇸🇨🇦🇲🇽', winner: '', winnerFlag: '', runnerUp: '', runnerUpFlag: '', score: '', venue: 'MetLife Stadium', city: 'East Rutherford', trophy: 'fifa', pending: true, note: 'Tournament in progress — final July 19, 2026.' },
];
