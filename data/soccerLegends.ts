// soccerLegends.ts — curated all-time national-team greats for the World Cup nations.
// Used to populate the FIFA-tab "Legends" section (national teams aren't in the
// TheSportsDB club catalog, so ESPN/TSDB give nothing here) and seeds the Museum.
// Photos + bios are hydrated at render time from Wikipedia (wikiSlug), so this file
// stays small and never goes stale on imagery.

export interface LegendSeed {
  name: string;
  position: 'Goalkeeper' | 'Defender' | 'Midfielder' | 'Forward' | 'Winger' | 'Striker';
  born: number;        // birth year — rendered tz-safe as `${born}-07-01`
  wikiSlug: string;    // Wikipedia page title (underscored) for photo + bio
  honors: string;      // one-line résumé
}

const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z]/g, '');

export const SOCCER_LEGENDS: Record<string, LegendSeed[]> = {
  argentina: [
    { name: 'Diego Maradona', position: 'Forward', born: 1960, wikiSlug: 'Diego_Maradona', honors: '1986 World Cup winner & Golden Ball; the "Hand of God" and Goal of the Century.' },
    { name: 'Lionel Messi', position: 'Forward', born: 1987, wikiSlug: 'Lionel_Messi', honors: '2022 World Cup winner, 8× Ballon d\'Or, Argentina\'s all-time top scorer.' },
    { name: 'Alfredo Di Stéfano', position: 'Forward', born: 1926, wikiSlug: 'Alfredo_Di_St%C3%A9fano', honors: 'Total-football pioneer, five European Cups with Real Madrid.' },
    { name: 'Gabriel Batistuta', position: 'Striker', born: 1969, wikiSlug: 'Gabriel_Batistuta', honors: 'Prolific striker; long-time record World Cup scorer for Argentina.' },
    { name: 'Mario Kempes', position: 'Forward', born: 1954, wikiSlug: 'Mario_Kempes', honors: '1978 World Cup winner & Golden Boot on home soil.' },
    { name: 'Daniel Passarella', position: 'Defender', born: 1953, wikiSlug: 'Daniel_Passarella', honors: 'Captain and goalscoring centre-back, 1978 World Cup winner.' },
    { name: 'Juan Román Riquelme', position: 'Midfielder', born: 1978, wikiSlug: 'Juan_Rom%C3%A1n_Riquelme', honors: 'Elegant playmaker, icon of Boca Juniors and the No. 10 art.' },
  ],
  brazil: [
    { name: 'Pelé', position: 'Forward', born: 1940, wikiSlug: 'Pel%C3%A9', honors: 'Only three-time World Cup winner (1958, 1962, 1970); 1000+ career goals.' },
    { name: 'Ronaldo', position: 'Striker', born: 1976, wikiSlug: 'Ronaldo_(Brazilian_footballer)', honors: '2002 World Cup winner & Golden Boot, 2× Ballon d\'Or "O Fenômeno".' },
    { name: 'Ronaldinho', position: 'Forward', born: 1980, wikiSlug: 'Ronaldinho', honors: '2002 World Cup winner, 2005 Ballon d\'Or, joy-of-football icon.' },
    { name: 'Romário', position: 'Striker', born: 1966, wikiSlug: 'Rom%C3%A1rio', honors: '1994 World Cup winner & Golden Ball; over 700 goals.' },
    { name: 'Garrincha', position: 'Winger', born: 1933, wikiSlug: 'Garrincha', honors: 'Dazzling dribbler, 1958 & 1962 World Cup winner.' },
    { name: 'Zico', position: 'Midfielder', born: 1953, wikiSlug: 'Zico', honors: '"The White Pelé", heart of the beloved 1982 side.' },
    { name: 'Cafu', position: 'Defender', born: 1970, wikiSlug: 'Cafu', honors: 'Only man to play three straight World Cup finals; 2× winner.' },
    { name: 'Roberto Carlos', position: 'Defender', born: 1973, wikiSlug: 'Roberto_Carlos', honors: 'Thunderbolt left-back, 2002 World Cup winner.' },
  ],
  france: [
    { name: 'Zinedine Zidane', position: 'Midfielder', born: 1972, wikiSlug: 'Zinedine_Zidane', honors: '1998 World Cup winner & 2× final scorer; 2000 Euros; Ballon d\'Or.' },
    { name: 'Michel Platini', position: 'Midfielder', born: 1955, wikiSlug: 'Michel_Platini', honors: '3× Ballon d\'Or, Euro 1984 talisman.' },
    { name: 'Thierry Henry', position: 'Striker', born: 1977, wikiSlug: 'Thierry_Henry', honors: 'France\'s all-time top scorer (long-held), 1998 World Cup winner.' },
    { name: 'Kylian Mbappé', position: 'Forward', born: 1998, wikiSlug: 'Kylian_Mbapp%C3%A9', honors: '2018 World Cup winner; hat-trick in the 2022 final.' },
    { name: 'Just Fontaine', position: 'Striker', born: 1933, wikiSlug: 'Just_Fontaine', honors: 'Record 13 goals at a single World Cup (1958).' },
    { name: 'Marcel Desailly', position: 'Defender', born: 1968, wikiSlug: 'Marcel_Desailly', honors: 'Commanding defender, 1998 World Cup & 2000 Euro winner.' },
  ],
  germany: [
    { name: 'Franz Beckenbauer', position: 'Defender', born: 1945, wikiSlug: 'Franz_Beckenbauer', honors: 'Invented the modern sweeper; won the World Cup as player (1974) and manager (1990).' },
    { name: 'Gerd Müller', position: 'Striker', born: 1945, wikiSlug: 'Gerd_M%C3%BCller', honors: '1974 World Cup winner; legendary goal poacher "Der Bomber".' },
    { name: 'Miroslav Klose', position: 'Striker', born: 1978, wikiSlug: 'Miroslav_Klose', honors: 'All-time World Cup top scorer (16); 2014 winner.' },
    { name: 'Lothar Matthäus', position: 'Midfielder', born: 1961, wikiSlug: 'Lothar_Matth%C3%A4us', honors: 'Record World Cup appearances; 1990 winner & Ballon d\'Or.' },
    { name: 'Oliver Kahn', position: 'Goalkeeper', born: 1969, wikiSlug: 'Oliver_Kahn', honors: 'Only keeper to win the World Cup Golden Ball (2002).' },
    { name: 'Manuel Neuer', position: 'Goalkeeper', born: 1986, wikiSlug: 'Manuel_Neuer', honors: '2014 World Cup winner & Golden Glove; sweeper-keeper pioneer.' },
  ],
  spain: [
    { name: 'Andrés Iniesta', position: 'Midfielder', born: 1984, wikiSlug: 'Andr%C3%A9s_Iniesta', honors: 'Scored the winning goal in the 2010 World Cup final.' },
    { name: 'Xavi', position: 'Midfielder', born: 1980, wikiSlug: 'Xavi', honors: 'Metronome of the 2008–2012 golden era (2× Euro, 1 World Cup).' },
    { name: 'Iker Casillas', position: 'Goalkeeper', born: 1981, wikiSlug: 'Iker_Casillas', honors: 'Captain and keeper of Spain\'s 2010 World Cup triumph.' },
    { name: 'Raúl', position: 'Forward', born: 1977, wikiSlug: 'Ra%C3%BAl_(footballer)', honors: 'Iconic Real Madrid and Spain forward of his generation.' },
    { name: 'Carles Puyol', position: 'Defender', born: 1978, wikiSlug: 'Carles_Puyol', honors: 'Warrior captain; headed the semi-final winner in 2010.' },
    { name: 'Sergio Ramos', position: 'Defender', born: 1986, wikiSlug: 'Sergio_Ramos', honors: 'World Cup & 2× Euro winner; record Spain caps.' },
  ],
  italy: [
    { name: 'Paolo Maldini', position: 'Defender', born: 1968, wikiSlug: 'Paolo_Maldini', honors: 'Defensive icon; 4 World Cups, Milan one-club legend.' },
    { name: 'Roberto Baggio', position: 'Forward', born: 1967, wikiSlug: 'Roberto_Baggio', honors: '1993 Ballon d\'Or; carried Italy to the 1994 final.' },
    { name: 'Gianluigi Buffon', position: 'Goalkeeper', born: 1978, wikiSlug: 'Gianluigi_Buffon', honors: '2006 World Cup winner; one of the greatest keepers ever.' },
    { name: 'Andrea Pirlo', position: 'Midfielder', born: 1979, wikiSlug: 'Andrea_Pirlo', honors: '2006 World Cup winner; deep-lying playmaker maestro.' },
    { name: 'Paolo Rossi', position: 'Striker', born: 1956, wikiSlug: 'Paolo_Rossi', honors: '1982 World Cup Golden Boot, Golden Ball & Ballon d\'Or.' },
    { name: 'Fabio Cannavaro', position: 'Defender', born: 1973, wikiSlug: 'Fabio_Cannavaro', honors: '2006 World Cup-winning captain & Ballon d\'Or.' },
  ],
  england: [
    { name: 'Bobby Moore', position: 'Defender', born: 1941, wikiSlug: 'Bobby_Moore', honors: 'Captain of England\'s only World Cup win (1966).' },
    { name: 'Bobby Charlton', position: 'Midfielder', born: 1937, wikiSlug: 'Bobby_Charlton', honors: '1966 World Cup winner & 1966 Ballon d\'Or; Munich survivor.' },
    { name: 'Gary Lineker', position: 'Striker', born: 1960, wikiSlug: 'Gary_Lineker', honors: '1986 World Cup Golden Boot.' },
    { name: 'David Beckham', position: 'Midfielder', born: 1975, wikiSlug: 'David_Beckham', honors: 'Set-piece master and global icon; 115 caps.' },
    { name: 'Wayne Rooney', position: 'Forward', born: 1985, wikiSlug: 'Wayne_Rooney', honors: 'England\'s record scorer for years; teenage prodigy.' },
    { name: 'Harry Kane', position: 'Striker', born: 1993, wikiSlug: 'Harry_Kane', honors: 'England\'s all-time top scorer; 2018 World Cup Golden Boot.' },
  ],
  netherlands: [
    { name: 'Johan Cruyff', position: 'Forward', born: 1947, wikiSlug: 'Johan_Cruyff', honors: '3× Ballon d\'Or, father of Total Football, 1974 runner-up.' },
    { name: 'Marco van Basten', position: 'Striker', born: 1964, wikiSlug: 'Marco_van_Basten', honors: '3× Ballon d\'Or; volley in the Euro 1988 final.' },
    { name: 'Ruud Gullit', position: 'Midfielder', born: 1962, wikiSlug: 'Ruud_Gullit', honors: '1987 Ballon d\'Or; Euro 1988-winning captain.' },
    { name: 'Dennis Bergkamp', position: 'Forward', born: 1969, wikiSlug: 'Dennis_Bergkamp', honors: 'Sublime technician; iconic 1998 World Cup goal vs Argentina.' },
    { name: 'Arjen Robben', position: 'Winger', born: 1984, wikiSlug: 'Arjen_Robben', honors: 'Unstoppable cut-inside winger; 2010 World Cup finalist.' },
  ],
  portugal: [
    { name: 'Cristiano Ronaldo', position: 'Forward', born: 1985, wikiSlug: 'Cristiano_Ronaldo', honors: '5× Ballon d\'Or; men\'s all-time top international scorer; Euro 2016.' },
    { name: 'Eusébio', position: 'Forward', born: 1942, wikiSlug: 'Eus%C3%A9bio', honors: '1966 World Cup Golden Boot; 1965 Ballon d\'Or.' },
    { name: 'Luís Figo', position: 'Winger', born: 1972, wikiSlug: 'Lu%C3%ADs_Figo', honors: '2000 Ballon d\'Or; golden-generation talisman.' },
    { name: 'Rui Costa', position: 'Midfielder', born: 1972, wikiSlug: 'Rui_Costa', honors: 'Elegant playmaker of Portugal\'s golden generation.' },
  ],
  uruguay: [
    { name: 'Luis Suárez', position: 'Striker', born: 1987, wikiSlug: 'Luis_Su%C3%A1rez', honors: 'Uruguay\'s all-time top scorer; 2010 World Cup hero.' },
    { name: 'Diego Forlán', position: 'Forward', born: 1979, wikiSlug: 'Diego_Forl%C3%A1n', honors: '2010 World Cup Golden Ball.' },
    { name: 'Enzo Francescoli', position: 'Midfielder', born: 1961, wikiSlug: 'Enzo_Francescoli', honors: '"El Príncipe", 3× Copa América.' },
    { name: 'Juan Alberto Schiaffino', position: 'Forward', born: 1925, wikiSlug: 'Juan_Alberto_Schiaffino', honors: 'Star of the 1950 "Maracanazo" World Cup win.' },
  ],
  'united states': [
    { name: 'Landon Donovan', position: 'Forward', born: 1982, wikiSlug: 'Landon_Donovan', honors: 'USMNT all-time great; iconic 2010 stoppage-time winner vs Algeria.' },
    { name: 'Clint Dempsey', position: 'Forward', born: 1983, wikiSlug: 'Clint_Dempsey', honors: 'Co-record USMNT scorer; scored at three World Cups.' },
    { name: 'Tim Howard', position: 'Goalkeeper', born: 1979, wikiSlug: 'Tim_Howard', honors: 'Record 15 saves vs Belgium at the 2014 World Cup.' },
    { name: 'Cobi Jones', position: 'Winger', born: 1970, wikiSlug: 'Cobi_Jones', honors: 'Most-capped USMNT outfield icon of the 1990s–2000s.' },
    { name: 'Claudio Reyna', position: 'Midfielder', born: 1973, wikiSlug: 'Claudio_Reyna', honors: 'Captain "Captain America"; 2002 World Cup Best XI.' },
    { name: 'Christian Pulisic', position: 'Forward', born: 1998, wikiSlug: 'Christian_Pulisic', honors: 'Face of the modern USMNT golden generation.' },
  ],
  mexico: [
    { name: 'Hugo Sánchez', position: 'Striker', born: 1958, wikiSlug: 'Hugo_S%C3%A1nchez', honors: 'Overhead-kick legend; five-time La Liga top scorer.' },
    { name: 'Rafael Márquez', position: 'Defender', born: 1979, wikiSlug: 'Rafael_M%C3%A1rquez', honors: 'Captained Mexico at five World Cups; Champions League winner.' },
    { name: 'Cuauhtémoc Blanco', position: 'Forward', born: 1973, wikiSlug: 'Cuauht%C3%A9moc_Blanco', honors: 'Inventor of the "Blanco Bounce"; three World Cups.' },
    { name: 'Guillermo Ochoa', position: 'Goalkeeper', born: 1985, wikiSlug: 'Guillermo_Ochoa', honors: 'Iconic World Cup goalkeeping displays across five tournaments.' },
    { name: 'Jorge Campos', position: 'Goalkeeper', born: 1966, wikiSlug: 'Jorge_Campos', honors: 'Flamboyant keeper who also played as a forward.' },
  ],
  canada: [
    { name: 'Alphonso Davies', position: 'Defender', born: 2000, wikiSlug: 'Alphonso_Davies', honors: 'Champions League winner; face of Canada\'s resurgence.' },
    { name: 'Dwayne De Rosario', position: 'Forward', born: 1978, wikiSlug: 'Dwayne_De_Rosario', honors: 'Canada\'s all-time leading scorer for years; MLS icon.' },
    { name: 'Atiba Hutchinson', position: 'Midfielder', born: 1983, wikiSlug: 'Atiba_Hutchinson', honors: 'Canada\'s most-capped player and long-time captain.' },
  ],
  croatia: [
    { name: 'Luka Modrić', position: 'Midfielder', born: 1985, wikiSlug: 'Luka_Modri%C4%87', honors: '2018 World Cup Golden Ball & Ballon d\'Or.' },
    { name: 'Davor Šuker', position: 'Striker', born: 1968, wikiSlug: 'Davor_%C5%A0uker', honors: '1998 World Cup Golden Boot; third place.' },
    { name: 'Zvonimir Boban', position: 'Midfielder', born: 1968, wikiSlug: 'Zvonimir_Boban', honors: 'Captain of the 1998 bronze-medal generation.' },
  ],
  belgium: [
    { name: 'Eden Hazard', position: 'Forward', born: 1991, wikiSlug: 'Eden_Hazard', honors: 'Golden-generation talisman; 2018 World Cup Silver Ball.' },
    { name: 'Kevin De Bruyne', position: 'Midfielder', born: 1991, wikiSlug: 'Kevin_De_Bruyne', honors: 'One of the finest playmakers of his era.' },
    { name: 'Jan Ceulemans', position: 'Forward', born: 1957, wikiSlug: 'Jan_Ceulemans', honors: 'Captain of Belgium\'s 1986 World Cup semi-finalists.' },
  ],
  colombia: [
    { name: 'Carlos Valderrama', position: 'Midfielder', born: 1961, wikiSlug: 'Carlos_Valderrama', honors: 'Iconic playmaker "El Pibe"; three World Cups.' },
    { name: 'James Rodríguez', position: 'Midfielder', born: 1991, wikiSlug: 'James_Rodr%C3%ADguez', honors: '2014 World Cup Golden Boot.' },
    { name: 'Radamel Falcao', position: 'Striker', born: 1986, wikiSlug: 'Radamel_Falcao', honors: 'Prolific "El Tigre"; Colombia great.' },
  ],
  ghana: [
    { name: 'Abedi Pele', position: 'Midfielder', born: 1964, wikiSlug: 'Abedi_Pele', honors: '3× African Footballer of the Year.' },
    { name: 'Michael Essien', position: 'Midfielder', born: 1982, wikiSlug: 'Michael_Essien', honors: 'Powerhouse "The Bison"; Champions League winner.' },
    { name: 'Asamoah Gyan', position: 'Striker', born: 1985, wikiSlug: 'Asamoah_Gyan', honors: 'Africa\'s all-time top World Cup scorer.' },
  ],
  nigeria: [
    { name: 'Jay-Jay Okocha', position: 'Midfielder', born: 1973, wikiSlug: 'Jay-Jay_Okocha', honors: 'Mesmerising dribbler; 1996 Olympic gold.' },
    { name: 'Nwankwo Kanu', position: 'Forward', born: 1976, wikiSlug: 'Nwankwo_Kanu', honors: '2× African Footballer of the Year; Olympic gold.' },
    { name: 'Rashidi Yekini', position: 'Striker', born: 1963, wikiSlug: 'Rashidi_Yekini', honors: 'Scored Nigeria\'s first-ever World Cup goal (1994).' },
  ],
  cameroon: [
    { name: 'Roger Milla', position: 'Striker', born: 1952, wikiSlug: 'Roger_Milla', honors: 'Corner-flag dance; lit up Italia \'90 at 38.' },
    { name: 'Samuel Eto\'o', position: 'Striker', born: 1981, wikiSlug: 'Samuel_Eto%27o', honors: '4× African Footballer of the Year; treble winner.' },
  ],
  japan: [
    { name: 'Hidetoshi Nakata', position: 'Midfielder', born: 1977, wikiSlug: 'Hidetoshi_Nakata', honors: 'Trailblazer who took Japanese football global.' },
    { name: 'Keisuke Honda', position: 'Midfielder', born: 1986, wikiSlug: 'Keisuke_Honda', honors: 'Scored at three straight World Cups.' },
  ],
  'south korea': [
    { name: 'Park Ji-sung', position: 'Midfielder', born: 1981, wikiSlug: 'Park_Ji-sung', honors: 'Manchester United great; 2002 World Cup semi-finalist.' },
    { name: 'Son Heung-min', position: 'Forward', born: 1992, wikiSlug: 'Son_Heung-min', honors: 'Premier League Golden Boot; Asia\'s modern icon.' },
    { name: 'Cha Bum-kun', position: 'Forward', born: 1953, wikiSlug: 'Cha_Bum-kun', honors: 'Bundesliga pioneer "Cha Boom".' },
  ],
  denmark: [
    { name: 'Michael Laudrup', position: 'Midfielder', born: 1964, wikiSlug: 'Michael_Laudrup', honors: 'Among the most gifted playmakers of his era.' },
    { name: 'Peter Schmeichel', position: 'Goalkeeper', born: 1963, wikiSlug: 'Peter_Schmeichel', honors: 'Euro 1992 winner; treble-winning keeper.' },
  ],
  sweden: [
    { name: 'Zlatan Ibrahimović', position: 'Striker', born: 1981, wikiSlug: 'Zlatan_Ibrahimovi%C4%87', honors: 'Sweden\'s all-time top scorer; audacious showman.' },
    { name: 'Henrik Larsson', position: 'Striker', born: 1971, wikiSlug: 'Henrik_Larsson', honors: 'Celtic legend; three World Cups.' },
  ],
  poland: [
    { name: 'Robert Lewandowski', position: 'Striker', born: 1988, wikiSlug: 'Robert_Lewandowski', honors: 'Poland\'s all-time top scorer; FIFA Best winner.' },
    { name: 'Zbigniew Boniek', position: 'Forward', born: 1956, wikiSlug: 'Zbigniew_Boniek', honors: 'Star of Poland\'s 1982 World Cup third place.' },
  ],
  'ivory coast': [
    { name: 'Didier Drogba', position: 'Striker', born: 1978, wikiSlug: 'Didier_Drogba', honors: 'Talisman who helped unite a nation; Champions League winner.' },
    { name: 'Yaya Touré', position: 'Midfielder', born: 1983, wikiSlug: 'Yaya_Tour%C3%A9', honors: '4× African Footballer of the Year.' },
  ],
  senegal: [
    { name: 'Sadio Mané', position: 'Forward', born: 1992, wikiSlug: 'Sadio_Man%C3%A9', honors: 'African Footballer of the Year; 2021 AFCON winner.' },
    { name: 'El Hadji Diouf', position: 'Forward', born: 1981, wikiSlug: 'El_Hadji_Diouf', honors: '2× African Footballer of the Year; 2002 quarter-finalist.' },
  ],
  morocco: [
    { name: 'Achraf Hakimi', position: 'Defender', born: 1998, wikiSlug: 'Achraf_Hakimi', honors: 'Star of Morocco\'s historic 2022 World Cup semi-final run.' },
    { name: 'Mustapha Hadji', position: 'Midfielder', born: 1971, wikiSlug: 'Mustapha_Hadji', honors: '1998 African Footballer of the Year.' },
  ],
};

/** Curated legends for a nation by (flexible) name match. */
export function legendsForNation(name: string): LegendSeed[] {
  const n = norm(name);
  if (!n) return [];
  // exact normalized key
  for (const [k, v] of Object.entries(SOCCER_LEGENDS)) if (norm(k) === n) return v;
  // fuzzy contains (handles "USA" vs "United States", "Korea Republic" vs "South Korea")
  for (const [k, v] of Object.entries(SOCCER_LEGENDS)) {
    const nk = norm(k);
    if (nk.length > 3 && (nk.includes(n) || n.includes(nk))) return v;
  }
  const alias: Record<string, string> = {
    usa: 'united states', unitedstatesofamerica: 'united states', usmnt: 'united states',
    korearepublic: 'south korea', republicofkorea: 'south korea', koreasouth: 'south korea',
    cotedivoire: 'ivory coast', holland: 'netherlands',
  };
  const a = alias[n];
  return a ? (SOCCER_LEGENDS[a] ?? []) : [];
}
