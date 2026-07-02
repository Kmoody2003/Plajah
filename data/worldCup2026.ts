// FIFA World Cup 2026 — USA, Canada, Mexico
// Group assignments are based on confederation seeding principles.
// Verify against the official FIFA 2026 draw results and update as needed.

export type WC26Confederation = 'UEFA' | 'CONMEBOL' | 'CONCACAF' | 'CAF' | 'AFC' | 'OFC' | 'PLAYOFF';
export type WC26Round = 'GROUP' | 'R32' | 'R16' | 'QF' | 'SF' | '3RD' | 'FINAL';
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

// Real 2026 field + group draw, reconciled from ESPN's live fifa.world standings
// (2026-07). Cultural data (flag/colours/anthem/artists) is curated.
export const WC26_TEAMS: WC26Team[] = [
  // Group A
  { id: 'mex', name: 'Mexico',         shortName: 'MEX', flag: '🇲🇽', group: 'A', primaryColor: '#006847', secondaryColor: '#CE1126', confederation: 'CONCACAF', anthem: 'Himno Nacional Mexicano',        popularArtists: ['Peso Pluma', 'Grupo Frontera', 'Natanael Cano'] },
  { id: 'cze', name: 'Czechia',         shortName: 'CZE', flag: '🇨🇿', group: 'A', primaryColor: '#D7141A', secondaryColor: '#11457E', confederation: 'UEFA',     anthem: 'Kde domov můj',                 popularArtists: ['Ewa Farna', 'Calin', 'Marpo'] },
  { id: 'kor', name: 'South Korea',     shortName: 'KOR', flag: '🇰🇷', group: 'A', primaryColor: '#003478', secondaryColor: '#CD2E3A', confederation: 'AFC',      anthem: 'Aegukka',                       popularArtists: ['BTS', 'BLACKPINK', 'Stray Kids'] },
  { id: 'rsa', name: 'South Africa',    shortName: 'RSA', flag: '🇿🇦', group: 'A', primaryColor: '#007A4D', secondaryColor: '#FFB81C', confederation: 'CAF',      anthem: 'Nkosi Sikelel\' iAfrika',       popularArtists: ['Nasty C', 'Black Coffee', 'DJ Maphorisa'] },

  // Group B
  { id: 'can', name: 'Canada',          shortName: 'CAN', flag: '🇨🇦', group: 'B', primaryColor: '#FF0000', secondaryColor: '#FFFFFF', confederation: 'CONCACAF', anthem: 'O Canada',                      popularArtists: ['Drake', 'The Weeknd', 'Justin Bieber'] },
  { id: 'bih', name: 'Bosnia-Herzegovina', shortName: 'BIH', flag: '🇧🇦', group: 'B', primaryColor: '#002395', secondaryColor: '#FFCD00', confederation: 'UEFA', anthem: 'Državna himna',                 popularArtists: ['Dino Merlin', 'Goran Bregović', 'Halid Bešlić'] },
  { id: 'sui', name: 'Switzerland',     shortName: 'SUI', flag: '🇨🇭', group: 'B', primaryColor: '#FF0000', secondaryColor: '#FFFFFF', confederation: 'UEFA',     anthem: 'Swiss Psalm',                   popularArtists: ['Nemo', 'Lo & Leduc', 'Stress'] },
  { id: 'qat', name: 'Qatar',           shortName: 'QAT', flag: '🇶🇦', group: 'B', primaryColor: '#8A1538', secondaryColor: '#FFFFFF', confederation: 'AFC',      anthem: 'As Salam al Amiri',             popularArtists: ['Fahad Al Kubaisi', 'Dana', 'Ali Abdul Sattar'] },

  // Group C
  { id: 'bra', name: 'Brazil',          shortName: 'BRA', flag: '🇧🇷', group: 'C', primaryColor: '#009C3B', secondaryColor: '#FFDF00', confederation: 'CONMEBOL', anthem: 'Hino Nacional Brasileiro',      popularArtists: ['Anitta', 'Ludmilla', 'Gusttavo Lima'] },
  { id: 'sco', name: 'Scotland',        shortName: 'SCO', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', group: 'C', primaryColor: '#003F72', secondaryColor: '#FFFFFF', confederation: 'UEFA',     anthem: 'Flower of Scotland',            popularArtists: ['Gerry Cinnamon', 'Chvrches', 'Lewis Capaldi'] },
  { id: 'hai', name: 'Haiti',           shortName: 'HAI', flag: '🇭🇹', group: 'C', primaryColor: '#00209F', secondaryColor: '#D21034', confederation: 'CONCACAF', anthem: 'La Dessalinienne',              popularArtists: ['Wyclef Jean', 'Michael Brun', 'Boukman Eksperyans'] },
  { id: 'mar', name: 'Morocco',         shortName: 'MAR', flag: '🇲🇦', group: 'C', primaryColor: '#C1272D', secondaryColor: '#006233', confederation: 'CAF',      anthem: 'Hymne Chérifien',               popularArtists: ['RedOne', 'FNAIRE', 'Saad Lamjarred'] },

  // Group D
  { id: 'par', name: 'Paraguay',        shortName: 'PAR', flag: '🇵🇾', group: 'D', primaryColor: '#D52B1E', secondaryColor: '#0038A8', confederation: 'CONMEBOL', anthem: 'Himno Nacional Paraguayo',      popularArtists: ['Berta Rojas', 'Purahéi Soul', 'Los 3 Sudamericanos'] },
  { id: 'tur', name: 'Türkiye',         shortName: 'TUR', flag: '🇹🇷', group: 'D', primaryColor: '#E30A17', secondaryColor: '#FFFFFF', confederation: 'UEFA',     anthem: 'İstiklâl Marşı',                popularArtists: ['Sertab Erener', 'Tarkan', 'Duman'] },
  { id: 'aus', name: 'Australia',       shortName: 'AUS', flag: '🇦🇺', group: 'D', primaryColor: '#00843D', secondaryColor: '#FFD200', confederation: 'AFC',      anthem: 'Advance Australia Fair',        popularArtists: ['Tones and I', 'Sia', 'Troye Sivan'] },
  { id: 'usa', name: 'United States',   shortName: 'USA', flag: '🇺🇸', group: 'D', primaryColor: '#002868', secondaryColor: '#BF0A30', confederation: 'CONCACAF', anthem: 'The Star-Spangled Banner',       popularArtists: ['Kendrick Lamar', 'Taylor Swift', 'Beyoncé'] },

  // Group E
  { id: 'ecu', name: 'Ecuador',         shortName: 'ECU', flag: '🇪🇨', group: 'E', primaryColor: '#FFD100', secondaryColor: '#003DA5', confederation: 'CONMEBOL', anthem: 'Salve, Oh Patria!',              popularArtists: ['Mirella Cesa', 'Dj Tao', 'La Doble P'] },
  { id: 'ger', name: 'Germany',         shortName: 'GER', flag: '🇩🇪', group: 'E', primaryColor: '#000000', secondaryColor: '#DD0000', confederation: 'UEFA',     anthem: 'Deutschlandlied',               popularArtists: ['Rammstein', 'Apache 207', 'Capital Bra'] },
  { id: 'civ', name: 'Ivory Coast',     shortName: 'CIV', flag: '🇨🇮', group: 'E', primaryColor: '#F77F00', secondaryColor: '#009A44', confederation: 'CAF',      anthem: 'L\'Abidjanaise',                popularArtists: ['Alpha Blondy', 'Magic System', 'Josey'] },
  { id: 'cuw', name: 'Curaçao',         shortName: 'CUW', flag: '🇨🇼', group: 'E', primaryColor: '#002B7F', secondaryColor: '#F9E814', confederation: 'CONCACAF', anthem: 'Himno di Kòrsou',               popularArtists: ['Izaline Calister', 'Nfuzion', 'Doble R'] },

  // Group F
  { id: 'ned', name: 'Netherlands',     shortName: 'NED', flag: '🇳🇱', group: 'F', primaryColor: '#FF6600', secondaryColor: '#FFFFFF', confederation: 'UEFA',     anthem: 'Het Wilhelmus',                 popularArtists: ['Martin Garrix', 'Tiësto', 'Afrojack'] },
  { id: 'swe', name: 'Sweden',          shortName: 'SWE', flag: '🇸🇪', group: 'F', primaryColor: '#006AA7', secondaryColor: '#FECC00', confederation: 'UEFA',     anthem: 'Du gamla, Du fria',             popularArtists: ['ABBA', 'Avicii', 'Zara Larsson'] },
  { id: 'jpn', name: 'Japan',           shortName: 'JPN', flag: '🇯🇵', group: 'F', primaryColor: '#003087', secondaryColor: '#FFFFFF', confederation: 'AFC',      anthem: 'Kimigayo',                      popularArtists: ['Yoasobi', 'Official HIGE DANdism', 'Ado'] },
  { id: 'tun', name: 'Tunisia',         shortName: 'TUN', flag: '🇹🇳', group: 'F', primaryColor: '#E70013', secondaryColor: '#FFFFFF', confederation: 'CAF',      anthem: 'Humat al-Hima',                 popularArtists: ['Balti', 'Saber Rebaï', 'Latifa'] },

  // Group G
  { id: 'bel', name: 'Belgium',         shortName: 'BEL', flag: '🇧🇪', group: 'G', primaryColor: '#000000', secondaryColor: '#EF3340', confederation: 'UEFA',     anthem: 'La Brabançonne',                popularArtists: ['Stromae', 'Angèle', 'Hamza'] },
  { id: 'irn', name: 'Iran',            shortName: 'IRN', flag: '🇮🇷', group: 'G', primaryColor: '#239F40', secondaryColor: '#DA0000', confederation: 'AFC',      anthem: 'Ey Iran',                       popularArtists: ['Ebi', 'Dariush', 'Googoosh'] },
  { id: 'egy', name: 'Egypt',           shortName: 'EGY', flag: '🇪🇬', group: 'G', primaryColor: '#CE1126', secondaryColor: '#FFFFFF', confederation: 'CAF',      anthem: 'Bilady, Bilady, Bilady',        popularArtists: ['Amr Diab', 'Mohamed Ramadan', 'Cairokee'] },
  { id: 'nzl', name: 'New Zealand',     shortName: 'NZL', flag: '🇳🇿', group: 'G', primaryColor: '#000000', secondaryColor: '#FFFFFF', confederation: 'OFC',      anthem: 'God Defend New Zealand',        popularArtists: ['Lorde', 'Six60', 'Benee'] },

  // Group H
  { id: 'esp', name: 'Spain',           shortName: 'ESP', flag: '🇪🇸', group: 'H', primaryColor: '#AA151B', secondaryColor: '#F1BF00', confederation: 'UEFA',     anthem: 'Marcha Real',                   popularArtists: ['Rosalía', 'Quevedo', 'Aitana'] },
  { id: 'ury', name: 'Uruguay',         shortName: 'URU', flag: '🇺🇾', group: 'H', primaryColor: '#5EB6E4', secondaryColor: '#FFFFFF', confederation: 'CONMEBOL', anthem: 'Himno Nacional de Uruguay',     popularArtists: ['No Te Va Gustar', 'Cuarteto de Nos', 'Jaime Roos'] },
  { id: 'ksa', name: 'Saudi Arabia',    shortName: 'KSA', flag: '🇸🇦', group: 'H', primaryColor: '#006C35', secondaryColor: '#FFFFFF', confederation: 'AFC',      anthem: 'Aash Al Maleek',                popularArtists: ['Mohammed Abdo', 'Rabeh Saqer', 'Rashed Al-Majed'] },
  { id: 'cpv', name: 'Cape Verde',      shortName: 'CPV', flag: '🇨🇻', group: 'H', primaryColor: '#003893', secondaryColor: '#CF2027', confederation: 'CAF',      anthem: 'Cântico da Liberdade',          popularArtists: ['Cesária Évora', 'Mayra Andrade', 'Sara Tavares'] },

  // Group I
  { id: 'nor', name: 'Norway',          shortName: 'NOR', flag: '🇳🇴', group: 'I', primaryColor: '#BA0C2F', secondaryColor: '#00205B', confederation: 'UEFA',     anthem: 'Ja, vi elsker dette landet',    popularArtists: ['a-ha', 'Kygo', 'Aurora'] },
  { id: 'fra', name: 'France',          shortName: 'FRA', flag: '🇫🇷', group: 'I', primaryColor: '#002395', secondaryColor: '#ED2939', confederation: 'UEFA',     anthem: 'La Marseillaise',               popularArtists: ['Aya Nakamura', 'Jul', 'Gims'] },
  { id: 'sen', name: 'Senegal',         shortName: 'SEN', flag: '🇸🇳', group: 'I', primaryColor: '#00853F', secondaryColor: '#FDEF42', confederation: 'CAF',      anthem: 'Pincez Tous vos Koras',         popularArtists: ['Youssou N\'Dour', 'Wally Seck', 'Akon'] },
  { id: 'irq', name: 'Iraq',            shortName: 'IRQ', flag: '🇮🇶', group: 'I', primaryColor: '#CE1126', secondaryColor: '#007A3D', confederation: 'AFC',      anthem: 'Mawtini',                       popularArtists: ['Kadim Al Sahir', 'Ilham Al-Madfai', 'Rahma Riad'] },

  // Group J
  { id: 'arg', name: 'Argentina',       shortName: 'ARG', flag: '🇦🇷', group: 'J', primaryColor: '#74ACDF', secondaryColor: '#FFFFFF', confederation: 'CONMEBOL', anthem: 'Himno Nacional Argentino',      popularArtists: ['Bizarrap', 'María Becerra', 'Duki'] },
  { id: 'aut', name: 'Austria',         shortName: 'AUT', flag: '🇦🇹', group: 'J', primaryColor: '#ED2939', secondaryColor: '#FFFFFF', confederation: 'UEFA',     anthem: 'Bundeshymne',                   popularArtists: ['Falco', 'Wanda', 'Yung Hurn'] },
  { id: 'alg', name: 'Algeria',         shortName: 'ALG', flag: '🇩🇿', group: 'J', primaryColor: '#006233', secondaryColor: '#FFFFFF', confederation: 'CAF',      anthem: 'Kassaman',                      popularArtists: ['Soolking', 'Khaled', 'Cheb Mami'] },
  { id: 'jor', name: 'Jordan',          shortName: 'JOR', flag: '🇯🇴', group: 'J', primaryColor: '#007A3D', secondaryColor: '#CE1126', confederation: 'AFC',      anthem: 'As-salam Al-malaki Al-urdoni',  popularArtists: ['Zade Dirani', 'Aziz Maraka', 'Rum'] },

  // Group K
  { id: 'col', name: 'Colombia',        shortName: 'COL', flag: '🇨🇴', group: 'K', primaryColor: '#FCD116', secondaryColor: '#003087', confederation: 'CONMEBOL', anthem: 'Oh Gloria Inmarcesible!',       popularArtists: ['Shakira', 'Karol G', 'J Balvin'] },
  { id: 'por', name: 'Portugal',        shortName: 'POR', flag: '🇵🇹', group: 'K', primaryColor: '#006600', secondaryColor: '#FF0000', confederation: 'UEFA',     anthem: 'A Portuguesa',                  popularArtists: ['Salvador Sobral', 'Dino d\'Santiago', 'Agir'] },
  { id: 'uzb', name: 'Uzbekistan',      shortName: 'UZB', flag: '🇺🇿', group: 'K', primaryColor: '#1EB53A', secondaryColor: '#FFFFFF', confederation: 'AFC',      anthem: 'Davlat Madhiyasi',              popularArtists: ['Yulduz Usmonova', 'Shahzoda', 'Konsta'] },
  { id: 'cod', name: 'Congo DR',        shortName: 'COD', flag: '🇨🇩', group: 'K', primaryColor: '#007FFF', secondaryColor: '#F7D518', confederation: 'CAF',      anthem: 'Debout Congolais',              popularArtists: ['Fally Ipupa', 'Koffi Olomidé', 'Innoss\'B'] },

  // Group L
  { id: 'eng', name: 'England',         shortName: 'ENG', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', group: 'L', primaryColor: '#FFFFFF', secondaryColor: '#003366', confederation: 'UEFA',     anthem: 'God Save the King',             popularArtists: ['Ed Sheeran', 'Harry Styles', 'Central Cee'] },
  { id: 'cro', name: 'Croatia',         shortName: 'CRO', flag: '🇭🇷', group: 'L', primaryColor: '#FF0000', secondaryColor: '#FFFFFF', confederation: 'UEFA',     anthem: 'Lijepa naša domovino',          popularArtists: ['Baby Lasagna', 'Oliver Dragojević', '2Cellos'] },
  { id: 'pan', name: 'Panama',          shortName: 'PAN', flag: '🇵🇦', group: 'L', primaryColor: '#003F87', secondaryColor: '#FFFFFF', confederation: 'CONCACAF', anthem: 'Himno Istmeño',                 popularArtists: ['Sech', 'Boza', 'El General'] },
  { id: 'gha', name: 'Ghana',           shortName: 'GHA', flag: '🇬🇭', group: 'L', primaryColor: '#006B3F', secondaryColor: '#FCD116', confederation: 'CAF',      anthem: 'God Bless Our Homeland Ghana',  popularArtists: ['Sarkodie', 'Stonebwoy', 'Black Sherif'] },
];

// ── Match Schedule ─────────────────────────────────────────────────────────────
// Group stage Matchday 1: June 11–15 | MD2: June 16–20 | MD3: June 21–27
// Knockout: R32 June 29–Jul 2 | QF Jul 4–5 | SF Jul 14–15 | Final Jul 19

const d = (dateStr: string, hour = 15) => new Date(`${dateStr}T${String(hour).padStart(2,'0')}:00:00-05:00`).getTime();

export const WC26_MATCHES: WC26Match[] = [
  // Real 2026 fixtures + results, generated from ESPN's fifa.world scoreboard:
  // 72 group matches + decided knockout ties. Undecided knockout slots render
  // live via the bracket/schedule (services/worldCupLive.ts).
  { id: 'm760415', homeTeamId: 'mex', awayTeamId: 'rsa', kickoffMs: 1781204400000, venue: 'Estadio Banorte', city: 'Mexico City', round: 'GROUP', homeScore: 2, awayScore: 0, status: 'FINISHED' },
  { id: 'm760414', homeTeamId: 'kor', awayTeamId: 'cze', kickoffMs: 1781229600000, venue: 'Estadio Akron', city: 'Guadalajara', round: 'GROUP', homeScore: 2, awayScore: 1, status: 'FINISHED' },
  { id: 'm760416', homeTeamId: 'can', awayTeamId: 'bih', kickoffMs: 1781290800000, venue: 'BMO Field', city: 'Toronto', round: 'GROUP', homeScore: 1, awayScore: 1, status: 'FINISHED' },
  { id: 'm760417', homeTeamId: 'usa', awayTeamId: 'par', kickoffMs: 1781312400000, venue: 'SoFi Stadium', city: 'Inglewood, California', round: 'GROUP', homeScore: 4, awayScore: 1, status: 'FINISHED' },
  { id: 'm760420', homeTeamId: 'qat', awayTeamId: 'sui', kickoffMs: 1781377200000, venue: 'Levi\'s Stadium', city: 'Santa Clara, California', round: 'GROUP', homeScore: 1, awayScore: 1, status: 'FINISHED' },
  { id: 'm760419', homeTeamId: 'bra', awayTeamId: 'mar', kickoffMs: 1781388000000, venue: 'MetLife Stadium', city: 'East Rutherford, New Jersey', round: 'GROUP', homeScore: 1, awayScore: 1, status: 'FINISHED' },
  { id: 'm760418', homeTeamId: 'hai', awayTeamId: 'sco', kickoffMs: 1781398800000, venue: 'Gillette Stadium', city: 'Foxborough, Massachusetts', round: 'GROUP', homeScore: 0, awayScore: 1, status: 'FINISHED' },
  { id: 'm760421', homeTeamId: 'aus', awayTeamId: 'tur', kickoffMs: 1781409600000, venue: 'BC Place', city: 'Vancouver', round: 'GROUP', homeScore: 2, awayScore: 0, status: 'FINISHED' },
  { id: 'm760422', homeTeamId: 'ger', awayTeamId: 'cuw', kickoffMs: 1781456400000, venue: 'NRG Stadium', city: 'Houston, Texas', round: 'GROUP', homeScore: 7, awayScore: 1, status: 'FINISHED' },
  { id: 'm760425', homeTeamId: 'ned', awayTeamId: 'jpn', kickoffMs: 1781467200000, venue: 'AT&T Stadium', city: 'Arlington, Texas', round: 'GROUP', homeScore: 2, awayScore: 2, status: 'FINISHED' },
  { id: 'm760423', homeTeamId: 'civ', awayTeamId: 'ecu', kickoffMs: 1781478000000, venue: 'Lincoln Financial Field', city: 'Philadelphia, Pennsylvania', round: 'GROUP', homeScore: 1, awayScore: 0, status: 'FINISHED' },
  { id: 'm760424', homeTeamId: 'swe', awayTeamId: 'tun', kickoffMs: 1781488800000, venue: 'Estadio BBVA', city: 'Guadalupe', round: 'GROUP', homeScore: 5, awayScore: 1, status: 'FINISHED' },
  { id: 'm760428', homeTeamId: 'esp', awayTeamId: 'cpv', kickoffMs: 1781539200000, venue: 'Mercedes-Benz Stadium', city: 'Atlanta, Georgia', round: 'GROUP', homeScore: 0, awayScore: 0, status: 'FINISHED' },
  { id: 'm760426', homeTeamId: 'bel', awayTeamId: 'egy', kickoffMs: 1781550000000, venue: 'Lumen Field', city: 'Seattle, Washington', round: 'GROUP', homeScore: 1, awayScore: 1, status: 'FINISHED' },
  { id: 'm760429', homeTeamId: 'ksa', awayTeamId: 'ury', kickoffMs: 1781560800000, venue: 'Hard Rock Stadium', city: 'Miami Gardens, Florida', round: 'GROUP', homeScore: 1, awayScore: 1, status: 'FINISHED' },
  { id: 'm760427', homeTeamId: 'irn', awayTeamId: 'nzl', kickoffMs: 1781571600000, venue: 'SoFi Stadium', city: 'Inglewood, California', round: 'GROUP', homeScore: 2, awayScore: 2, status: 'FINISHED' },
  { id: 'm760432', homeTeamId: 'fra', awayTeamId: 'sen', kickoffMs: 1781636400000, venue: 'MetLife Stadium', city: 'East Rutherford, New Jersey', round: 'GROUP', homeScore: 3, awayScore: 1, status: 'FINISHED' },
  { id: 'm760430', homeTeamId: 'irq', awayTeamId: 'nor', kickoffMs: 1781647200000, venue: 'Gillette Stadium', city: 'Foxborough, Massachusetts', round: 'GROUP', homeScore: 1, awayScore: 4, status: 'FINISHED' },
  { id: 'm760433', homeTeamId: 'arg', awayTeamId: 'alg', kickoffMs: 1781658000000, venue: 'GEHA Field at Arrowhead Stadium', city: 'Kansas City, Missouri', round: 'GROUP', homeScore: 3, awayScore: 0, status: 'FINISHED' },
  { id: 'm760431', homeTeamId: 'aut', awayTeamId: 'jor', kickoffMs: 1781668800000, venue: 'Levi\'s Stadium', city: 'Santa Clara, California', round: 'GROUP', homeScore: 3, awayScore: 1, status: 'FINISHED' },
  { id: 'm760435', homeTeamId: 'por', awayTeamId: 'cod', kickoffMs: 1781715600000, venue: 'NRG Stadium', city: 'Houston, Texas', round: 'GROUP', homeScore: 1, awayScore: 1, status: 'FINISHED' },
  { id: 'm760437', homeTeamId: 'eng', awayTeamId: 'cro', kickoffMs: 1781726400000, venue: 'AT&T Stadium', city: 'Arlington, Texas', round: 'GROUP', homeScore: 4, awayScore: 2, status: 'FINISHED' },
  { id: 'm760434', homeTeamId: 'gha', awayTeamId: 'pan', kickoffMs: 1781737200000, venue: 'BMO Field', city: 'Toronto', round: 'GROUP', homeScore: 1, awayScore: 0, status: 'FINISHED' },
  { id: 'm760436', homeTeamId: 'uzb', awayTeamId: 'col', kickoffMs: 1781748000000, venue: 'Estadio Banorte', city: 'Mexico City', round: 'GROUP', homeScore: 1, awayScore: 3, status: 'FINISHED' },
  { id: 'm760438', homeTeamId: 'cze', awayTeamId: 'rsa', kickoffMs: 1781798400000, venue: 'Mercedes-Benz Stadium', city: 'Atlanta, Georgia', round: 'GROUP', homeScore: 1, awayScore: 1, status: 'FINISHED' },
  { id: 'm760439', homeTeamId: 'sui', awayTeamId: 'bih', kickoffMs: 1781809200000, venue: 'SoFi Stadium', city: 'Inglewood, California', round: 'GROUP', homeScore: 4, awayScore: 1, status: 'FINISHED' },
  { id: 'm760440', homeTeamId: 'can', awayTeamId: 'qat', kickoffMs: 1781820000000, venue: 'BC Place', city: 'Vancouver', round: 'GROUP', homeScore: 6, awayScore: 0, status: 'FINISHED' },
  { id: 'm760441', homeTeamId: 'mex', awayTeamId: 'kor', kickoffMs: 1781830800000, venue: 'Estadio Akron', city: 'Guadalajara', round: 'GROUP', homeScore: 1, awayScore: 0, status: 'FINISHED' },
  { id: 'm760442', homeTeamId: 'usa', awayTeamId: 'aus', kickoffMs: 1781895600000, venue: 'Lumen Field', city: 'Seattle, Washington', round: 'GROUP', homeScore: 2, awayScore: 0, status: 'FINISHED' },
  { id: 'm760445', homeTeamId: 'sco', awayTeamId: 'mar', kickoffMs: 1781906400000, venue: 'Gillette Stadium', city: 'Foxborough, Massachusetts', round: 'GROUP', homeScore: 0, awayScore: 1, status: 'FINISHED' },
  { id: 'm760444', homeTeamId: 'bra', awayTeamId: 'hai', kickoffMs: 1781915400000, venue: 'Lincoln Financial Field', city: 'Philadelphia, Pennsylvania', round: 'GROUP', homeScore: 3, awayScore: 0, status: 'FINISHED' },
  { id: 'm760443', homeTeamId: 'tur', awayTeamId: 'par', kickoffMs: 1781924400000, venue: 'Levi\'s Stadium', city: 'Santa Clara, California', round: 'GROUP', homeScore: 0, awayScore: 1, status: 'FINISHED' },
  { id: 'm760447', homeTeamId: 'ned', awayTeamId: 'swe', kickoffMs: 1781974800000, venue: 'NRG Stadium', city: 'Houston, Texas', round: 'GROUP', homeScore: 5, awayScore: 1, status: 'FINISHED' },
  { id: 'm760448', homeTeamId: 'ger', awayTeamId: 'civ', kickoffMs: 1781985600000, venue: 'BMO Field', city: 'Toronto', round: 'GROUP', homeScore: 2, awayScore: 1, status: 'FINISHED' },
  { id: 'm760446', homeTeamId: 'ecu', awayTeamId: 'cuw', kickoffMs: 1782000000000, venue: 'GEHA Field at Arrowhead Stadium', city: 'Kansas City, Missouri', round: 'GROUP', homeScore: 0, awayScore: 0, status: 'FINISHED' },
  { id: 'm760449', homeTeamId: 'tun', awayTeamId: 'jpn', kickoffMs: 1782014400000, venue: 'Estadio BBVA', city: 'Guadalupe', round: 'GROUP', homeScore: 0, awayScore: 4, status: 'FINISHED' },
  { id: 'm760453', homeTeamId: 'esp', awayTeamId: 'ksa', kickoffMs: 1782057600000, venue: 'Mercedes-Benz Stadium', city: 'Atlanta, Georgia', round: 'GROUP', homeScore: 4, awayScore: 0, status: 'FINISHED' },
  { id: 'm760451', homeTeamId: 'bel', awayTeamId: 'irn', kickoffMs: 1782068400000, venue: 'SoFi Stadium', city: 'Inglewood, California', round: 'GROUP', homeScore: 0, awayScore: 0, status: 'FINISHED' },
  { id: 'm760450', homeTeamId: 'ury', awayTeamId: 'cpv', kickoffMs: 1782079200000, venue: 'Hard Rock Stadium', city: 'Miami Gardens, Florida', round: 'GROUP', homeScore: 2, awayScore: 2, status: 'FINISHED' },
  { id: 'm760452', homeTeamId: 'nzl', awayTeamId: 'egy', kickoffMs: 1782090000000, venue: 'BC Place', city: 'Vancouver', round: 'GROUP', homeScore: 1, awayScore: 3, status: 'FINISHED' },
  { id: 'm760456', homeTeamId: 'arg', awayTeamId: 'aut', kickoffMs: 1782147600000, venue: 'AT&T Stadium', city: 'Arlington, Texas', round: 'GROUP', homeScore: 2, awayScore: 0, status: 'FINISHED' },
  { id: 'm760457', homeTeamId: 'fra', awayTeamId: 'irq', kickoffMs: 1782162000000, venue: 'Lincoln Financial Field', city: 'Philadelphia, Pennsylvania', round: 'GROUP', homeScore: 3, awayScore: 0, status: 'FINISHED' },
  { id: 'm760454', homeTeamId: 'nor', awayTeamId: 'sen', kickoffMs: 1782172800000, venue: 'MetLife Stadium', city: 'East Rutherford, New Jersey', round: 'GROUP', homeScore: 3, awayScore: 2, status: 'FINISHED' },
  { id: 'm760455', homeTeamId: 'jor', awayTeamId: 'alg', kickoffMs: 1782183600000, venue: 'Levi\'s Stadium', city: 'Santa Clara, California', round: 'GROUP', homeScore: 1, awayScore: 2, status: 'FINISHED' },
  { id: 'm760461', homeTeamId: 'por', awayTeamId: 'uzb', kickoffMs: 1782234000000, venue: 'NRG Stadium', city: 'Houston, Texas', round: 'GROUP', homeScore: 5, awayScore: 0, status: 'FINISHED' },
  { id: 'm760458', homeTeamId: 'eng', awayTeamId: 'gha', kickoffMs: 1782244800000, venue: 'Gillette Stadium', city: 'Foxborough, Massachusetts', round: 'GROUP', homeScore: 0, awayScore: 0, status: 'FINISHED' },
  { id: 'm760460', homeTeamId: 'pan', awayTeamId: 'cro', kickoffMs: 1782255600000, venue: 'BMO Field', city: 'Toronto', round: 'GROUP', homeScore: 0, awayScore: 1, status: 'FINISHED' },
  { id: 'm760459', homeTeamId: 'col', awayTeamId: 'cod', kickoffMs: 1782266400000, venue: 'Estadio Akron', city: 'Guadalajara', round: 'GROUP', homeScore: 1, awayScore: 0, status: 'FINISHED' },
  { id: 'm760462', homeTeamId: 'bih', awayTeamId: 'qat', kickoffMs: 1782327600000, venue: 'Lumen Field', city: 'Seattle, Washington', round: 'GROUP', homeScore: 3, awayScore: 1, status: 'FINISHED' },
  { id: 'm760463', homeTeamId: 'sui', awayTeamId: 'can', kickoffMs: 1782327600000, venue: 'BC Place', city: 'Vancouver', round: 'GROUP', homeScore: 2, awayScore: 1, status: 'FINISHED' },
  { id: 'm760464', homeTeamId: 'mar', awayTeamId: 'hai', kickoffMs: 1782338400000, venue: 'Mercedes-Benz Stadium', city: 'Atlanta, Georgia', round: 'GROUP', homeScore: 4, awayScore: 2, status: 'FINISHED' },
  { id: 'm760465', homeTeamId: 'sco', awayTeamId: 'bra', kickoffMs: 1782338400000, venue: 'Hard Rock Stadium', city: 'Miami Gardens, Florida', round: 'GROUP', homeScore: 0, awayScore: 3, status: 'FINISHED' },
  { id: 'm760467', homeTeamId: 'cze', awayTeamId: 'mex', kickoffMs: 1782349200000, venue: 'Estadio Banorte', city: 'Mexico City', round: 'GROUP', homeScore: 0, awayScore: 3, status: 'FINISHED' },
  { id: 'm760466', homeTeamId: 'rsa', awayTeamId: 'kor', kickoffMs: 1782349200000, venue: 'Estadio BBVA', city: 'Guadalupe', round: 'GROUP', homeScore: 1, awayScore: 0, status: 'FINISHED' },
  { id: 'm760473', homeTeamId: 'cuw', awayTeamId: 'civ', kickoffMs: 1782417600000, venue: 'Lincoln Financial Field', city: 'Philadelphia, Pennsylvania', round: 'GROUP', homeScore: 0, awayScore: 2, status: 'FINISHED' },
  { id: 'm760468', homeTeamId: 'ecu', awayTeamId: 'ger', kickoffMs: 1782417600000, venue: 'MetLife Stadium', city: 'East Rutherford, New Jersey', round: 'GROUP', homeScore: 2, awayScore: 1, status: 'FINISHED' },
  { id: 'm760471', homeTeamId: 'jpn', awayTeamId: 'swe', kickoffMs: 1782428400000, venue: 'AT&T Stadium', city: 'Arlington, Texas', round: 'GROUP', homeScore: 1, awayScore: 1, status: 'FINISHED' },
  { id: 'm760472', homeTeamId: 'tun', awayTeamId: 'ned', kickoffMs: 1782428400000, venue: 'GEHA Field at Arrowhead Stadium', city: 'Kansas City, Missouri', round: 'GROUP', homeScore: 1, awayScore: 3, status: 'FINISHED' },
  { id: 'm760469', homeTeamId: 'par', awayTeamId: 'aus', kickoffMs: 1782439200000, venue: 'Levi\'s Stadium', city: 'Santa Clara, California', round: 'GROUP', homeScore: 0, awayScore: 0, status: 'FINISHED' },
  { id: 'm760470', homeTeamId: 'tur', awayTeamId: 'usa', kickoffMs: 1782439200000, venue: 'SoFi Stadium', city: 'Inglewood, California', round: 'GROUP', homeScore: 3, awayScore: 2, status: 'FINISHED' },
  { id: 'm760475', homeTeamId: 'nor', awayTeamId: 'fra', kickoffMs: 1782500400000, venue: 'Gillette Stadium', city: 'Foxborough, Massachusetts', round: 'GROUP', homeScore: 1, awayScore: 4, status: 'FINISHED' },
  { id: 'm760474', homeTeamId: 'sen', awayTeamId: 'irq', kickoffMs: 1782500400000, venue: 'BMO Field', city: 'Toronto', round: 'GROUP', homeScore: 5, awayScore: 0, status: 'FINISHED' },
  { id: 'm760478', homeTeamId: 'cpv', awayTeamId: 'ksa', kickoffMs: 1782518400000, venue: 'NRG Stadium', city: 'Houston, Texas', round: 'GROUP', homeScore: 0, awayScore: 0, status: 'FINISHED' },
  { id: 'm760479', homeTeamId: 'ury', awayTeamId: 'esp', kickoffMs: 1782518400000, venue: 'Estadio Akron', city: 'Guadalajara', round: 'GROUP', homeScore: 0, awayScore: 1, status: 'FINISHED' },
  { id: 'm760476', homeTeamId: 'egy', awayTeamId: 'irn', kickoffMs: 1782529200000, venue: 'Lumen Field', city: 'Seattle, Washington', round: 'GROUP', homeScore: 1, awayScore: 1, status: 'FINISHED' },
  { id: 'm760477', homeTeamId: 'nzl', awayTeamId: 'bel', kickoffMs: 1782529200000, venue: 'BC Place', city: 'Vancouver', round: 'GROUP', homeScore: 1, awayScore: 5, status: 'FINISHED' },
  { id: 'm760480', homeTeamId: 'cro', awayTeamId: 'gha', kickoffMs: 1782594000000, venue: 'Lincoln Financial Field', city: 'Philadelphia, Pennsylvania', round: 'GROUP', homeScore: 2, awayScore: 1, status: 'FINISHED' },
  { id: 'm760485', homeTeamId: 'pan', awayTeamId: 'eng', kickoffMs: 1782594000000, venue: 'MetLife Stadium', city: 'East Rutherford, New Jersey', round: 'GROUP', homeScore: 0, awayScore: 2, status: 'FINISHED' },
  { id: 'm760481', homeTeamId: 'col', awayTeamId: 'por', kickoffMs: 1782603000000, venue: 'Hard Rock Stadium', city: 'Miami Gardens, Florida', round: 'GROUP', homeScore: 0, awayScore: 0, status: 'FINISHED' },
  { id: 'm760482', homeTeamId: 'cod', awayTeamId: 'uzb', kickoffMs: 1782603000000, venue: 'Mercedes-Benz Stadium', city: 'Atlanta, Georgia', round: 'GROUP', homeScore: 3, awayScore: 1, status: 'FINISHED' },
  { id: 'm760484', homeTeamId: 'alg', awayTeamId: 'aut', kickoffMs: 1782612000000, venue: 'GEHA Field at Arrowhead Stadium', city: 'Kansas City, Missouri', round: 'GROUP', homeScore: 3, awayScore: 3, status: 'FINISHED' },
  { id: 'm760483', homeTeamId: 'jor', awayTeamId: 'arg', kickoffMs: 1782612000000, venue: 'AT&T Stadium', city: 'Arlington, Texas', round: 'GROUP', homeScore: 1, awayScore: 3, status: 'FINISHED' },
  { id: 'm760486', homeTeamId: 'rsa', awayTeamId: 'can', kickoffMs: 1782673200000, venue: 'SoFi Stadium', city: 'Inglewood, California', round: 'R32', homeScore: 0, awayScore: 1, status: 'FINISHED' },
  { id: 'm760487', homeTeamId: 'bra', awayTeamId: 'jpn', kickoffMs: 1782752400000, venue: 'NRG Stadium', city: 'Houston, Texas', round: 'R32', homeScore: 2, awayScore: 1, status: 'FINISHED' },
  { id: 'm760489', homeTeamId: 'ger', awayTeamId: 'par', kickoffMs: 1782765000000, venue: 'Gillette Stadium', city: 'Foxborough, Massachusetts', round: 'R32', homeScore: 1, awayScore: 1, status: 'FINISHED' },
  { id: 'm760488', homeTeamId: 'ned', awayTeamId: 'mar', kickoffMs: 1782781200000, venue: 'Estadio BBVA', city: 'Guadalupe', round: 'R32', homeScore: 1, awayScore: 1, status: 'FINISHED' },
  { id: 'm760490', homeTeamId: 'civ', awayTeamId: 'nor', kickoffMs: 1782838800000, venue: 'AT&T Stadium', city: 'Arlington, Texas', round: 'R32', homeScore: 1, awayScore: 2, status: 'FINISHED' },
  { id: 'm760492', homeTeamId: 'fra', awayTeamId: 'swe', kickoffMs: 1782853200000, venue: 'MetLife Stadium', city: 'East Rutherford, New Jersey', round: 'R32', homeScore: 3, awayScore: 0, status: 'FINISHED' },
  { id: 'm760491', homeTeamId: 'mex', awayTeamId: 'ecu', kickoffMs: 1782871200000, venue: 'Estadio Banorte', city: 'Mexico City', round: 'R32', homeScore: 2, awayScore: 0, status: 'FINISHED' },
  { id: 'm760495', homeTeamId: 'eng', awayTeamId: 'cod', kickoffMs: 1782921600000, venue: 'Mercedes-Benz Stadium', city: 'Atlanta, Georgia', round: 'R32', homeScore: 2, awayScore: 1, status: 'FINISHED' },
  { id: 'm760493', homeTeamId: 'bel', awayTeamId: 'sen', kickoffMs: 1782936000000, venue: 'Lumen Field', city: 'Seattle, Washington', round: 'R32', homeScore: 3, awayScore: 2, status: 'FINISHED' },
  { id: 'm760494', homeTeamId: 'usa', awayTeamId: 'bih', kickoffMs: 1782950400000, venue: 'Levi\'s Stadium', city: 'Santa Clara, California', round: 'R32', homeScore: 2, awayScore: 0, status: 'FINISHED' },
  { id: 'm760497', homeTeamId: 'esp', awayTeamId: 'aut', kickoffMs: 1783018800000, venue: 'SoFi Stadium', city: 'Inglewood, California', round: 'R32', status: 'LIVE' },
  { id: 'm760496', homeTeamId: 'por', awayTeamId: 'cro', kickoffMs: 1783033200000, venue: 'BMO Field', city: 'Toronto', round: 'R32', status: 'SCHEDULED' },
  { id: 'm760498', homeTeamId: 'sui', awayTeamId: 'alg', kickoffMs: 1783047600000, venue: 'BC Place', city: 'Vancouver', round: 'R32', status: 'SCHEDULED' },
  { id: 'm760499', homeTeamId: 'aus', awayTeamId: 'egy', kickoffMs: 1783101600000, venue: 'AT&T Stadium', city: 'Arlington, Texas', round: 'R32', status: 'SCHEDULED' },
  { id: 'm760500', homeTeamId: 'arg', awayTeamId: 'cpv', kickoffMs: 1783116000000, venue: 'Hard Rock Stadium', city: 'Miami Gardens, Florida', round: 'R32', status: 'SCHEDULED' },
  { id: 'm760501', homeTeamId: 'col', awayTeamId: 'gha', kickoffMs: 1783128600000, venue: 'GEHA Field at Arrowhead Stadium', city: 'Kansas City, Missouri', round: 'R32', status: 'SCHEDULED' },
  { id: 'm760502', homeTeamId: 'can', awayTeamId: 'mar', kickoffMs: 1783184400000, venue: 'NRG Stadium', city: 'Houston, Texas', round: 'R16', status: 'SCHEDULED' },
  { id: 'm760503', homeTeamId: 'par', awayTeamId: 'fra', kickoffMs: 1783198800000, venue: 'Lincoln Financial Field', city: 'Philadelphia, Pennsylvania', round: 'R16', status: 'SCHEDULED' },
  { id: 'm760504', homeTeamId: 'bra', awayTeamId: 'nor', kickoffMs: 1783281600000, venue: 'MetLife Stadium', city: 'East Rutherford, New Jersey', round: 'R16', status: 'SCHEDULED' },
  { id: 'm760505', homeTeamId: 'mex', awayTeamId: 'eng', kickoffMs: 1783296000000, venue: 'Estadio Banorte', city: 'Mexico City', round: 'R16', status: 'SCHEDULED' },
  { id: 'm760507', homeTeamId: 'usa', awayTeamId: 'bel', kickoffMs: 1783382400000, venue: 'Lumen Field', city: 'Seattle, Washington', round: 'R16', status: 'SCHEDULED' },
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
  GROUP: 'Group Stage', R32: 'Round of 32', R16: 'Round of 16',
  QF: 'Quarter-Final', SF: 'Semi-Final', '3RD': 'Third Place', FINAL: 'Final',
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
  {
    title: 'The Athletic FC Podcast',
    description: 'In-depth football analysis, news and debate from The Athletic\'s global team of football journalists.',
    coverUrl: 'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=400&q=80',
    rssUrl: 'https://feeds.acast.com/public/shows/the-athletic-fc-podcast',
    language: 'EN',
  },
  {
    title: 'Men in Blazers',
    description: 'Roger Bennett and Michael Davies celebrate the beautiful game with wit, passion, and GLORIOUS football conversation.',
    coverUrl: 'https://images.unsplash.com/photo-1508098682722-e99c643e7f0b?w=400&q=80',
    rssUrl: 'https://rss.art19.com/men-in-blazers',
    language: 'EN',
  },
  {
    title: 'Guardian Football Weekly',
    description: 'The Guardian\'s award-winning football podcast — match analysis, interviews, and the week\'s biggest stories.',
    coverUrl: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=400&q=80',
    rssUrl: 'https://www.theguardian.com/football/series/footballweekly/podcast.xml',
    language: 'EN',
  },
  {
    title: 'Tifo Football Podcast',
    description: 'Tactical breakdowns, big ideas, and the culture of the game from the team behind Tifo Football on YouTube.',
    coverUrl: 'https://images.unsplash.com/photo-1551958219-acbc608c6377?w=400&q=80',
    rssUrl: 'https://feeds.acast.com/public/shows/tifo-football-podcast',
    language: 'EN',
  },
  {
    title: 'American Soccer Analysis',
    description: 'Data-driven analysis of MLS, the USMNT, USWNT, and world football from America\'s leading soccer analytics outlet.',
    coverUrl: 'https://images.unsplash.com/photo-1606925797300-0b35e9d1794e?w=400&q=80',
    rssUrl: 'https://feeds.acast.com/public/shows/american-soccer-analysis',
    language: 'EN',
  },
];
