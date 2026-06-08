// FIFA World Cup 2026 — USA, Canada, Mexico
// Group assignments are based on confederation seeding principles.
// Verify against the official FIFA 2026 draw results and update as needed.

export type WC26Confederation = 'UEFA' | 'CONMEBOL' | 'CONCACAF' | 'CAF' | 'AFC' | 'OFC' | 'PLAYOFF';
export type WC26Round = 'GROUP' | 'R32' | 'QF' | 'SF' | '3RD' | 'FINAL';
export type WC26Status = 'SCHEDULED' | 'LIVE' | 'FINISHED';

export interface WC26Team {
  id: string;
  name: string;
  shortName: string;
  flag: string;
  group: string;
  primaryColor: string;
  secondaryColor: string;
  confederation: WC26Confederation;
  popularArtists: string[];
  anthem: string;
  espnSlug?: string;
}

export interface WC26Match {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  kickoffMs: number;
  venue: string;
  city: string;
  round: WC26Round;
  group?: string;
  homeScore?: number;
  awayScore?: number;
  status: WC26Status;
}

// ── Teams ─────────────────────────────────────────────────────────────────────

export const WC26_TEAMS: WC26Team[] = [
  // Group A
  { id: 'mex', name: 'Mexico',         shortName: 'MEX', flag: '🇲🇽', group: 'A', primaryColor: '#006847', secondaryColor: '#CE1126', confederation: 'CONCACAF', anthem: 'Himno Nacional Mexicano',        popularArtists: ['Peso Pluma', 'Grupo Frontera', 'Natanael Cano'] },
  { id: 'ger', name: 'Germany',         shortName: 'GER', flag: '🇩🇪', group: 'A', primaryColor: '#000000', secondaryColor: '#DD0000', confederation: 'UEFA',     anthem: 'Deutschlandlied',               popularArtists: ['Rammstein', 'Apache 207', 'Capital Bra'] },
  { id: 'sen', name: 'Senegal',         shortName: 'SEN', flag: '🇸🇳', group: 'A', primaryColor: '#00853F', secondaryColor: '#FDEF42', confederation: 'CAF',      anthem: 'Pincez Tous vos Koras',         popularArtists: ['Youssou N\'Dour', 'Wally Seck', 'Akon'] },
  { id: 'ecu', name: 'Ecuador',         shortName: 'ECU', flag: '🇪🇨', group: 'A', primaryColor: '#FFD100', secondaryColor: '#003DA5', confederation: 'CONMEBOL', anthem: 'Salve, Oh Patria!',              popularArtists: ['Mirella Cesa', 'Dj Tao', 'La Doble P'] },

  // Group B
  { id: 'usa', name: 'United States',   shortName: 'USA', flag: '🇺🇸', group: 'B', primaryColor: '#002868', secondaryColor: '#BF0A30', confederation: 'CONCACAF', anthem: 'The Star-Spangled Banner',       popularArtists: ['Kendrick Lamar', 'Taylor Swift', 'Beyoncé'] },
  { id: 'fra', name: 'France',          shortName: 'FRA', flag: '🇫🇷', group: 'B', primaryColor: '#002395', secondaryColor: '#ED2939', confederation: 'UEFA',     anthem: 'La Marseillaise',               popularArtists: ['Aya Nakamura', 'Jul', 'Gims'] },
  { id: 'rsa', name: 'South Africa',    shortName: 'RSA', flag: '🇿🇦', group: 'B', primaryColor: '#007A4D', secondaryColor: '#FFB81C', confederation: 'CAF',      anthem: 'Nkosi Sikelel\' iAfrika',       popularArtists: ['Nasty C', 'Black Coffee', 'DJ Maphorisa'] },
  { id: 'ury', name: 'Uruguay',         shortName: 'URU', flag: '🇺🇾', group: 'B', primaryColor: '#5EB6E4', secondaryColor: '#FFFFFF', confederation: 'CONMEBOL', anthem: 'Himno Nacional de Uruguay',     popularArtists: ['Cuarteto de Nos', 'No Te Va Gustar', 'Agustín Casanova'] },

  // Group C
  { id: 'can', name: 'Canada',          shortName: 'CAN', flag: '🇨🇦', group: 'C', primaryColor: '#FF0000', secondaryColor: '#FFFFFF', confederation: 'CONCACAF', anthem: 'O Canada',                      popularArtists: ['Drake', 'The Weeknd', 'Justin Bieber'] },
  { id: 'esp', name: 'Spain',           shortName: 'ESP', flag: '🇪🇸', group: 'C', primaryColor: '#AA151B', secondaryColor: '#F1BF00', confederation: 'UEFA',     anthem: 'Marcha Real',                   popularArtists: ['Rosalía', 'C. Tangana', 'Bad Gyal'] },
  { id: 'nga', name: 'Nigeria',         shortName: 'NGA', flag: '🇳🇬', group: 'C', primaryColor: '#008751', secondaryColor: '#FFFFFF', confederation: 'CAF',      anthem: 'Arise O Compatriots',           popularArtists: ['Burna Boy', 'Wizkid', 'Davido'] },
  { id: 'kor', name: 'South Korea',     shortName: 'KOR', flag: '🇰🇷', group: 'C', primaryColor: '#003478', secondaryColor: '#CD2E3A', confederation: 'AFC',      anthem: 'Aegukka',                       popularArtists: ['BTS', 'BLACKPINK', 'Stray Kids'] },

  // Group D
  { id: 'arg', name: 'Argentina',       shortName: 'ARG', flag: '🇦🇷', group: 'D', primaryColor: '#74ACDF', secondaryColor: '#FFFFFF', confederation: 'CONMEBOL', anthem: 'Himno Nacional Argentino',      popularArtists: ['Bizarrap', 'Paulo Londra', 'Maria Becerra'] },
  { id: 'eng', name: 'England',         shortName: 'ENG', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', group: 'D', primaryColor: '#FFFFFF', secondaryColor: '#003366', confederation: 'UEFA',     anthem: 'God Save the King',             popularArtists: ['Ed Sheeran', 'Harry Styles', 'Coldplay'] },
  { id: 'civ', name: 'Ivory Coast',     shortName: 'CIV', flag: '🇨🇮', group: 'D', primaryColor: '#F77F00', secondaryColor: '#009A44', confederation: 'CAF',      anthem: 'L\'Abidjanaise',                popularArtists: ['Alpha Blondy', 'Magic System', 'Debordo Leekunfa'] },
  { id: 'jpn', name: 'Japan',           shortName: 'JPN', flag: '🇯🇵', group: 'D', primaryColor: '#003087', secondaryColor: '#FFFFFF', confederation: 'AFC',      anthem: 'Kimigayo',                      popularArtists: ['Yoasobi', 'Official HIGE DANdism', 'Ado'] },

  // Group E
  { id: 'bra', name: 'Brazil',          shortName: 'BRA', flag: '🇧🇷', group: 'E', primaryColor: '#009C3B', secondaryColor: '#FFDF00', confederation: 'CONMEBOL', anthem: 'Hino Nacional Brasileiro',      popularArtists: ['Anitta', 'Ludmilla', 'Gusttavo Lima'] },
  { id: 'ned', name: 'Netherlands',     shortName: 'NED', flag: '🇳🇱', group: 'E', primaryColor: '#FF6600', secondaryColor: '#FFFFFF', confederation: 'UEFA',     anthem: 'Het Wilhelmus',                 popularArtists: ['Afrojack', 'Martin Garrix', 'Tiësto'] },
  { id: 'cmr', name: 'Cameroon',        shortName: 'CMR', flag: '🇨🇲', group: 'E', primaryColor: '#007A5E', secondaryColor: '#CE1126', confederation: 'CAF',      anthem: 'Ô Cameroun, Berceau de nos Ancêtres', popularArtists: ['Locko', 'Charlotte Dipanda', 'Tenor'] },
  { id: 'aus', name: 'Australia',       shortName: 'AUS', flag: '🇦🇺', group: 'E', primaryColor: '#00843D', secondaryColor: '#FFD200', confederation: 'AFC',      anthem: 'Advance Australia Fair',        popularArtists: ['Tones and I', 'Sia', 'Troye Sivan'] },

  // Group F
  { id: 'col', name: 'Colombia',        shortName: 'COL', flag: '🇨🇴', group: 'F', primaryColor: '#FCD116', secondaryColor: '#003087', confederation: 'CONMEBOL', anthem: 'Oh Gloria Inmarcesible!',       popularArtists: ['Maluma', 'J Balvin', 'Shakira'] },
  { id: 'por', name: 'Portugal',        shortName: 'POR', flag: '🇵🇹', group: 'F', primaryColor: '#006600', secondaryColor: '#FF0000', confederation: 'UEFA',     anthem: 'A Portuguesa',                  popularArtists: ['Salvador Sobral', 'Agir', 'Dino d\'Santiago'] },
  { id: 'cod', name: 'DR Congo',        shortName: 'COD', flag: '🇨🇩', group: 'F', primaryColor: '#007FFF', secondaryColor: '#F7D518', confederation: 'CAF',      anthem: 'Debout Congolais',              popularArtists: ['Fally Ipupa', 'Koffi Olomidé', 'Innoss\'B'] },
  { id: 'irn', name: 'Iran',            shortName: 'IRN', flag: '🇮🇷', group: 'F', primaryColor: '#239F40', secondaryColor: '#DA0000', confederation: 'AFC',      anthem: 'Ey Iran',                       popularArtists: ['Ebi', 'Dariush', 'Hayedeh'] },

  // Group G
  { id: 'crc', name: 'Costa Rica',      shortName: 'CRC', flag: '🇨🇷', group: 'G', primaryColor: '#002B7F', secondaryColor: '#CE1126', confederation: 'CONCACAF', anthem: 'Noble Patria',                  popularArtists: ['Percance', 'Editus', 'Gandhi'] },
  { id: 'cro', name: 'Croatia',         shortName: 'CRO', flag: '🇭🇷', group: 'G', primaryColor: '#FF0000', secondaryColor: '#FFFFFF', confederation: 'UEFA',     anthem: 'Lijepa naša domovino',          popularArtists: ['Oliver Dragojević', 'Baby Lasagna', '2 Cellos'] },
  { id: 'alg', name: 'Algeria',         shortName: 'ALG', flag: '🇩🇿', group: 'G', primaryColor: '#006233', secondaryColor: '#FFFFFF', confederation: 'CAF',      anthem: 'Kassaman',                      popularArtists: ['Soolking', 'Khaled', 'Djamel Allam'] },
  { id: 'ksa', name: 'Saudi Arabia',    shortName: 'KSA', flag: '🇸🇦', group: 'G', primaryColor: '#006C35', secondaryColor: '#FFFFFF', confederation: 'AFC',      anthem: 'Aash Al Maleek',                popularArtists: ['Rabeh Saqer', 'Mohammed Abdo', 'Hamad Al Sharif'] },

  // Group H
  { id: 'pan', name: 'Panama',          shortName: 'PAN', flag: '🇵🇦', group: 'H', primaryColor: '#003F87', secondaryColor: '#FFFFFF', confederation: 'CONCACAF', anthem: 'Himno Istmeño',                 popularArtists: ['Sech', 'Marko', 'El General'] },
  { id: 'bel', name: 'Belgium',         shortName: 'BEL', flag: '🇧🇪', group: 'H', primaryColor: '#000000', secondaryColor: '#EF3340', confederation: 'UEFA',     anthem: 'La Brabançonne',                popularArtists: ['Stromae', 'Angèle', 'Hamza'] },
  { id: 'egy', name: 'Egypt',           shortName: 'EGY', flag: '🇪🇬', group: 'H', primaryColor: '#CE1126', secondaryColor: '#FFFFFF', confederation: 'CAF',      anthem: 'Bilady Bilady Bilady',          popularArtists: ['Amr Diab', 'Mohamed Ramadan', 'Cairokee'] },
  { id: 'jor', name: 'Jordan',          shortName: 'JOR', flag: '🇯🇴', group: 'H', primaryColor: '#007A3D', secondaryColor: '#CE1126', confederation: 'AFC',      anthem: 'As-salam Al-malaki Al-urdoni',  popularArtists: ['Zade Dirani', 'Aziz Maraka', 'Rum'] },

  // Group I
  { id: 'jam', name: 'Jamaica',         shortName: 'JAM', flag: '🇯🇲', group: 'I', primaryColor: '#000000', secondaryColor: '#FED100', confederation: 'CONCACAF', anthem: 'Jamaica, Land We Love',         popularArtists: ['Bob Marley Legacy', 'Sean Paul', 'Shaggy'] },
  { id: 'sui', name: 'Switzerland',     shortName: 'SUI', flag: '🇨🇭', group: 'I', primaryColor: '#FF0000', secondaryColor: '#FFFFFF', confederation: 'UEFA',     anthem: 'Cantate la psalme',             popularArtists: ['Lo & Leduc', 'Stress', 'Nemo'] },
  { id: 'mar', name: 'Morocco',         shortName: 'MAR', flag: '🇲🇦', group: 'I', primaryColor: '#C1272D', secondaryColor: '#006233', confederation: 'CAF',      anthem: 'Hymne Chérifien',               popularArtists: ['Maâlem Mahmoud Guinia', 'RedOne', 'FNAIRE'] },
  { id: 'irq', name: 'Iraq',            shortName: 'IRQ', flag: '🇮🇶', group: 'I', primaryColor: '#CE1126', secondaryColor: '#007A3D', confederation: 'AFC',      anthem: 'Mawtini',                       popularArtists: ['Kadim Al Sahir', 'Ilham Al-Madfai', 'Najim Al Deen'] },

  // Group J
  { id: 'ven', name: 'Venezuela',       shortName: 'VEN', flag: '🇻🇪', group: 'J', primaryColor: '#CF142B', secondaryColor: '#003893', confederation: 'CONMEBOL', anthem: 'Gloria al Bravo Pueblo',        popularArtists: ['Nacho', 'Guaco', 'Chino y Nacho'] },
  { id: 'tur', name: 'Turkey',          shortName: 'TUR', flag: '🇹🇷', group: 'J', primaryColor: '#E30A17', secondaryColor: '#FFFFFF', confederation: 'UEFA',     anthem: 'İstiklâl Marşı',                popularArtists: ['Sertab Erener', 'MFÖ', 'Duman'] },
  { id: 'pol', name: 'Poland',          shortName: 'POL', flag: '🇵🇱', group: 'J', primaryColor: '#FFFFFF', secondaryColor: '#DC143C', confederation: 'UEFA',     anthem: 'Mazurek Dąbrowskiego',          popularArtists: ['Sanah', 'Brodka', 'Dawid Podsiadło'] },
  { id: 'uzb', name: 'Uzbekistan',      shortName: 'UZB', flag: '🇺🇿', group: 'J', primaryColor: '#1EB53A', secondaryColor: '#FFFFFF', confederation: 'AFC',      anthem: 'O\'zbekiston Respublikasining Davlat Madhiyasi', popularArtists: ['Yulduz Usmonova', 'Otabek Mutalxo\'jayev', 'Shahlo Agzamova'] },

  // Group K
  { id: 'chl', name: 'Chile',           shortName: 'CHI', flag: '🇨🇱', group: 'K', primaryColor: '#D52B1E', secondaryColor: '#FFFFFF', confederation: 'PLAYOFF',  anthem: 'Himno Nacional de Chile',       popularArtists: ['Mon Laferte', 'Paloma Mami', 'Ana Tijoux'] },
  { id: 'aut', name: 'Austria',         shortName: 'AUT', flag: '🇦🇹', group: 'K', primaryColor: '#ED2939', secondaryColor: '#FFFFFF', confederation: 'UEFA',     anthem: 'Bundeshymne',                   popularArtists: ['Falco', 'HVOB', 'Yung Hurn'] },
  { id: 'srb', name: 'Serbia',          shortName: 'SRB', flag: '🇷🇸', group: 'K', primaryColor: '#C6363C', secondaryColor: '#0C4076', confederation: 'UEFA',     anthem: 'Bože pravde',                   popularArtists: ['Ceca', 'Marija Šerifović', 'Zdravko Čolić'] },
  { id: 'nzl', name: 'New Zealand',     shortName: 'NZL', flag: '🇳🇿', group: 'K', primaryColor: '#000000', secondaryColor: '#FFFFFF', confederation: 'OFC',      anthem: 'God Defend New Zealand',        popularArtists: ['Lorde', 'Six60', 'Benee'] },

  // Group L
  { id: 'idn', name: 'Indonesia',       shortName: 'IDN', flag: '🇮🇩', group: 'L', primaryColor: '#CE1126', secondaryColor: '#FFFFFF', confederation: 'PLAYOFF',  anthem: 'Indonesia Raya',                popularArtists: ['Raisa', 'Rizky Febian', 'Tulus'] },
  { id: 'rou', name: 'Romania',         shortName: 'ROU', flag: '🇷🇴', group: 'L', primaryColor: '#002B7F', secondaryColor: '#FCD116', confederation: 'UEFA',     anthem: 'Deşteaptă-te, române!',         popularArtists: ['Inna', 'Alexandra Stan', 'Smiley'] },
  { id: 'sco', name: 'Scotland',        shortName: 'SCO', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', group: 'L', primaryColor: '#003F72', secondaryColor: '#FFFFFF', confederation: 'UEFA',     anthem: 'Flower of Scotland',            popularArtists: ['Gerry Cinnamon', 'Chvrches', 'Lewis Capaldi'] },
  { id: 'den', name: 'Denmark',         shortName: 'DEN', flag: '🇩🇰', group: 'L', primaryColor: '#C60C30', secondaryColor: '#FFFFFF', confederation: 'UEFA',     anthem: 'Kong Christian',                popularArtists: ['MØ', 'Lukas Graham', 'Christopher'] },
];

// ── Match Schedule ─────────────────────────────────────────────────────────────
// Group stage Matchday 1: June 11–15 | MD2: June 16–20 | MD3: June 21–27
// Knockout: R32 June 29–Jul 2 | QF Jul 4–5 | SF Jul 14–15 | Final Jul 19

const d = (dateStr: string, hour = 15) => new Date(`${dateStr}T${String(hour).padStart(2,'0')}:00:00-05:00`).getTime();

export const WC26_MATCHES: WC26Match[] = [
  // ── Group A ──
  { id: 'a1', homeTeamId: 'mex', awayTeamId: 'ecu', kickoffMs: d('2026-06-11',18), venue: 'Estadio Azteca',       city: 'Mexico City',  round: 'GROUP', group: 'A', status: 'SCHEDULED' },
  { id: 'a2', homeTeamId: 'ger', awayTeamId: 'sen', kickoffMs: d('2026-06-12',15), venue: 'AT&T Stadium',         city: 'Dallas',       round: 'GROUP', group: 'A', status: 'SCHEDULED' },
  { id: 'a3', homeTeamId: 'mex', awayTeamId: 'ger', kickoffMs: d('2026-06-17',18), venue: 'Estadio Azteca',       city: 'Mexico City',  round: 'GROUP', group: 'A', status: 'SCHEDULED' },
  { id: 'a4', homeTeamId: 'ecu', awayTeamId: 'sen', kickoffMs: d('2026-06-17',12), venue: 'SoFi Stadium',         city: 'Los Angeles',  round: 'GROUP', group: 'A', status: 'SCHEDULED' },
  { id: 'a5', homeTeamId: 'mex', awayTeamId: 'sen', kickoffMs: d('2026-06-23',12), venue: 'Estadio Azteca',       city: 'Mexico City',  round: 'GROUP', group: 'A', status: 'SCHEDULED' },
  { id: 'a6', homeTeamId: 'ger', awayTeamId: 'ecu', kickoffMs: d('2026-06-23',12), venue: 'AT&T Stadium',         city: 'Dallas',       round: 'GROUP', group: 'A', status: 'SCHEDULED' },
  // ── Group B ──
  { id: 'b1', homeTeamId: 'usa', awayTeamId: 'ury', kickoffMs: d('2026-06-12',18), venue: 'MetLife Stadium',      city: 'New York',     round: 'GROUP', group: 'B', status: 'SCHEDULED' },
  { id: 'b2', homeTeamId: 'fra', awayTeamId: 'rsa', kickoffMs: d('2026-06-13',15), venue: 'SoFi Stadium',         city: 'Los Angeles',  round: 'GROUP', group: 'B', status: 'SCHEDULED' },
  { id: 'b3', homeTeamId: 'usa', awayTeamId: 'fra', kickoffMs: d('2026-06-18',18), venue: 'MetLife Stadium',      city: 'New York',     round: 'GROUP', group: 'B', status: 'SCHEDULED' },
  { id: 'b4', homeTeamId: 'ury', awayTeamId: 'rsa', kickoffMs: d('2026-06-18',12), venue: 'AT&T Stadium',         city: 'Dallas',       round: 'GROUP', group: 'B', status: 'SCHEDULED' },
  { id: 'b5', homeTeamId: 'usa', awayTeamId: 'rsa', kickoffMs: d('2026-06-24',12), venue: 'MetLife Stadium',      city: 'New York',     round: 'GROUP', group: 'B', status: 'SCHEDULED' },
  { id: 'b6', homeTeamId: 'fra', awayTeamId: 'ury', kickoffMs: d('2026-06-24',12), venue: 'SoFi Stadium',         city: 'Los Angeles',  round: 'GROUP', group: 'B', status: 'SCHEDULED' },
  // ── Group C ──
  { id: 'c1', homeTeamId: 'can', awayTeamId: 'kor', kickoffMs: d('2026-06-13',18), venue: 'BC Place',             city: 'Vancouver',    round: 'GROUP', group: 'C', status: 'SCHEDULED' },
  { id: 'c2', homeTeamId: 'esp', awayTeamId: 'nga', kickoffMs: d('2026-06-14',15), venue: 'Rose Bowl',            city: 'Los Angeles',  round: 'GROUP', group: 'C', status: 'SCHEDULED' },
  { id: 'c3', homeTeamId: 'can', awayTeamId: 'esp', kickoffMs: d('2026-06-19',18), venue: 'BC Place',             city: 'Vancouver',    round: 'GROUP', group: 'C', status: 'SCHEDULED' },
  { id: 'c4', homeTeamId: 'nga', awayTeamId: 'kor', kickoffMs: d('2026-06-19',12), venue: 'Mercedes-Benz Stadium',city: 'Atlanta',      round: 'GROUP', group: 'C', status: 'SCHEDULED' },
  { id: 'c5', homeTeamId: 'can', awayTeamId: 'nga', kickoffMs: d('2026-06-25',12), venue: 'BC Place',             city: 'Vancouver',    round: 'GROUP', group: 'C', status: 'SCHEDULED' },
  { id: 'c6', homeTeamId: 'esp', awayTeamId: 'kor', kickoffMs: d('2026-06-25',12), venue: 'Rose Bowl',            city: 'Los Angeles',  round: 'GROUP', group: 'C', status: 'SCHEDULED' },
  // ── Group D ──
  { id: 'd1', homeTeamId: 'arg', awayTeamId: 'jpn', kickoffMs: d('2026-06-14',18), venue: 'MetLife Stadium',      city: 'New York',     round: 'GROUP', group: 'D', status: 'SCHEDULED' },
  { id: 'd2', homeTeamId: 'eng', awayTeamId: 'civ', kickoffMs: d('2026-06-15',15), venue: 'AT&T Stadium',         city: 'Dallas',       round: 'GROUP', group: 'D', status: 'SCHEDULED' },
  { id: 'd3', homeTeamId: 'arg', awayTeamId: 'eng', kickoffMs: d('2026-06-20',18), venue: 'MetLife Stadium',      city: 'New York',     round: 'GROUP', group: 'D', status: 'SCHEDULED' },
  { id: 'd4', homeTeamId: 'jpn', awayTeamId: 'civ', kickoffMs: d('2026-06-20',12), venue: 'SoFi Stadium',         city: 'Los Angeles',  round: 'GROUP', group: 'D', status: 'SCHEDULED' },
  { id: 'd5', homeTeamId: 'arg', awayTeamId: 'civ', kickoffMs: d('2026-06-25',15), venue: 'MetLife Stadium',      city: 'New York',     round: 'GROUP', group: 'D', status: 'SCHEDULED' },
  { id: 'd6', homeTeamId: 'eng', awayTeamId: 'jpn', kickoffMs: d('2026-06-25',15), venue: 'AT&T Stadium',         city: 'Dallas',       round: 'GROUP', group: 'D', status: 'SCHEDULED' },
  // ── Groups E–L abbreviated (same pattern) ──
  { id: 'e1', homeTeamId: 'bra', awayTeamId: 'aus', kickoffMs: d('2026-06-15',18), venue: 'SoFi Stadium',         city: 'Los Angeles',  round: 'GROUP', group: 'E', status: 'SCHEDULED' },
  { id: 'e2', homeTeamId: 'ned', awayTeamId: 'cmr', kickoffMs: d('2026-06-16',15), venue: 'Mercedes-Benz Stadium',city: 'Atlanta',      round: 'GROUP', group: 'E', status: 'SCHEDULED' },
  { id: 'f1', homeTeamId: 'col', awayTeamId: 'irn', kickoffMs: d('2026-06-16',18), venue: 'Hard Rock Stadium',    city: 'Miami',        round: 'GROUP', group: 'F', status: 'SCHEDULED' },
  { id: 'f2', homeTeamId: 'por', awayTeamId: 'cod', kickoffMs: d('2026-06-17',15), venue: 'Levi\'s Stadium',      city: 'San Francisco',round: 'GROUP', group: 'F', status: 'SCHEDULED' },
  { id: 'g1', homeTeamId: 'crc', awayTeamId: 'ksa', kickoffMs: d('2026-06-16',12), venue: 'Estadio BBVA',         city: 'Monterrey',    round: 'GROUP', group: 'G', status: 'SCHEDULED' },
  { id: 'g2', homeTeamId: 'cro', awayTeamId: 'alg', kickoffMs: d('2026-06-17',12), venue: 'Lumen Field',          city: 'Seattle',      round: 'GROUP', group: 'G', status: 'SCHEDULED' },
  { id: 'h1', homeTeamId: 'pan', awayTeamId: 'jor', kickoffMs: d('2026-06-18',15), venue: 'Gillette Stadium',     city: 'Boston',       round: 'GROUP', group: 'H', status: 'SCHEDULED' },
  { id: 'h2', homeTeamId: 'bel', awayTeamId: 'egy', kickoffMs: d('2026-06-19',15), venue: 'Lincoln Financial Field', city: 'Philadelphia', round: 'GROUP', group: 'H', status: 'SCHEDULED' },
  { id: 'i1', homeTeamId: 'jam', awayTeamId: 'irq', kickoffMs: d('2026-06-20',12), venue: 'Arrowhead Stadium',    city: 'Kansas City',  round: 'GROUP', group: 'I', status: 'SCHEDULED' },
  { id: 'i2', homeTeamId: 'sui', awayTeamId: 'mar', kickoffMs: d('2026-06-21',15), venue: 'Levi\'s Stadium',      city: 'San Francisco',round: 'GROUP', group: 'I', status: 'SCHEDULED' },
  { id: 'j1', homeTeamId: 'ven', awayTeamId: 'uzb', kickoffMs: d('2026-06-21',18), venue: 'Allegiant Stadium',    city: 'Las Vegas',    round: 'GROUP', group: 'J', status: 'SCHEDULED' },
  { id: 'j2', homeTeamId: 'tur', awayTeamId: 'pol', kickoffMs: d('2026-06-22',15), venue: 'SoFi Stadium',         city: 'Los Angeles',  round: 'GROUP', group: 'J', status: 'SCHEDULED' },
  { id: 'k1', homeTeamId: 'chl', awayTeamId: 'nzl', kickoffMs: d('2026-06-22',18), venue: 'AT&T Stadium',         city: 'Dallas',       round: 'GROUP', group: 'K', status: 'SCHEDULED' },
  { id: 'k2', homeTeamId: 'aut', awayTeamId: 'srb', kickoffMs: d('2026-06-23',15), venue: 'Empower Field',        city: 'Denver',       round: 'GROUP', group: 'K', status: 'SCHEDULED' },
  { id: 'l1', homeTeamId: 'idn', awayTeamId: 'den', kickoffMs: d('2026-06-23',18), venue: 'Rose Bowl',            city: 'Los Angeles',  round: 'GROUP', group: 'L', status: 'SCHEDULED' },
  { id: 'l2', homeTeamId: 'rou', awayTeamId: 'sco', kickoffMs: d('2026-06-24',15), venue: 'MetLife Stadium',      city: 'New York',     round: 'GROUP', group: 'L', status: 'SCHEDULED' },

  // ── Knockout placeholders ──
  { id: 'r32_1', homeTeamId: 'arg', awayTeamId: 'fra', kickoffMs: d('2026-07-01',15), venue: 'MetLife Stadium',   city: 'New York',     round: 'R32',   status: 'SCHEDULED' },
  { id: 'qf_1',  homeTeamId: 'arg', awayTeamId: 'bra', kickoffMs: d('2026-07-04',15), venue: 'SoFi Stadium',     city: 'Los Angeles',  round: 'QF',    status: 'SCHEDULED' },
  { id: 'sf_1',  homeTeamId: 'arg', awayTeamId: 'usa', kickoffMs: d('2026-07-14',15), venue: 'MetLife Stadium',   city: 'New York',     round: 'SF',    status: 'SCHEDULED' },
  { id: 'final', homeTeamId: 'arg', awayTeamId: 'bra', kickoffMs: d('2026-07-19',15), venue: 'MetLife Stadium',   city: 'New York',     round: 'FINAL', status: 'SCHEDULED' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const _teamMap = new Map(WC26_TEAMS.map(t => [t.id, t]));

export const getTeam = (id: string): WC26Team | undefined => _teamMap.get(id);

export const getTeamsByGroup = (group: string): WC26Team[] =>
  WC26_TEAMS.filter(t => t.group === group);

export const getMatchesForTeam = (teamId: string): WC26Match[] =>
  WC26_MATCHES.filter(m => m.homeTeamId === teamId || m.awayTeamId === teamId);

export const getGroupMatches = (group: string): WC26Match[] =>
  WC26_MATCHES.filter(m => m.group === group);

export const getUpcomingMatches = (count = 10): WC26Match[] => {
  const now = Date.now();
  return WC26_MATCHES
    .filter(m => m.kickoffMs > now - 2 * 60 * 60 * 1000) // include matches from last 2h
    .sort((a, b) => a.kickoffMs - b.kickoffMs)
    .slice(0, count);
};

export const getLiveMatches = (): WC26Match[] => {
  const now = Date.now();
  return WC26_MATCHES.filter(m =>
    m.status === 'LIVE' ||
    (m.kickoffMs <= now && m.kickoffMs > now - 110 * 60 * 1000 && m.status === 'SCHEDULED')
  );
};

export const WC26_GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L'] as const;
export type WC26Group = typeof WC26_GROUPS[number];

export const ROUND_LABELS: Record<WC26Round, string> = {
  GROUP: 'Group Stage', R32: 'Round of 32', QF: 'Quarter-Final',
  SF: 'Semi-Final', '3RD': 'Third Place', FINAL: 'Final',
};

// ── Curated football podcasts for the podcast hub ─────────────────────────────
export interface WC26Podcast {
  title: string;
  description: string;
  coverUrl: string;
  rssUrl: string;
  language: string;
}

export const WC26_PODCASTS: WC26Podcast[] = [
  { title: 'The Athletic Football Podcast', description: 'Deep analysis and reporting from The Athletic\'s football journalists.', coverUrl: 'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=400&q=80', rssUrl: 'https://feeds.megaphone.fm/athleticfc', language: 'EN' },
  { title: 'Men in Blazers', description: 'Roger Bennett and Michael Davies on the beautiful game.', coverUrl: 'https://images.unsplash.com/photo-1508098682722-e99c643e7f0b?w=400&q=80', rssUrl: 'https://feeds.megaphone.fm/meninblazers', language: 'EN' },
  { title: 'ESPN FC', description: 'Daily football news, results and opinions from ESPN\'s global team.', coverUrl: 'https://images.unsplash.com/photo-1606925797300-0b35e9d1794e?w=400&q=80', rssUrl: 'https://www.espn.com/espnradio/podcast/feeds/itunes/podCast.xml?id=3035801', language: 'EN' },
  { title: 'BBC Football Daily', description: 'The BBC Sport football team breaks down the day\'s action.', coverUrl: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=400&q=80', rssUrl: 'https://podcasts.files.bbci.co.uk/p02gsrmh.rss', language: 'EN' },
  { title: 'Total Football Analysis', description: 'In-depth tactical breakdowns of matches and teams worldwide.', coverUrl: 'https://images.unsplash.com/photo-1551958219-acbc608c6377?w=400&q=80', rssUrl: 'https://anchor.fm/s/totalfootballanalysis/podcast/rss', language: 'EN' },
];
