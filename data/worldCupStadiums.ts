// FIFA World Cup 2026 — the 16 host stadiums across the USA, Canada & Mexico.
// Capacities are the World-Cup configuration (approximate); wikiSlug drives the live
// Wikipedia photo + history lookup, lat/lng drives the OpenStreetMap embed.

export interface WCStadium {
  id: string;
  name: string;              // World Cup branding name where FIFA renamed it
  officialName?: string;     // permanent/sponsor name
  city: string;
  country: 'USA' | 'Canada' | 'Mexico';
  countryFlag: string;
  capacity: number;          // WC configuration (approx)
  opened: number;
  roof: 'Open' | 'Retractable' | 'Fixed' | 'Canopy';
  surface: 'Grass' | 'Natural (temporary for WC)';
  lat: number;
  lng: number;
  wikiSlug: string;          // Wikipedia REST summary slug (photo + history)
  homeTeams: string[];       // resident clubs
  role?: string;             // notable WC role (Final, Opening Match, etc.)
  accent: string;
  blurb: string;
}

export const WC_STADIUMS: WCStadium[] = [
  {
    id: 'metlife', name: 'MetLife Stadium', city: 'New York / New Jersey', country: 'USA', countryFlag: '🇺🇸',
    capacity: 82500, opened: 2010, roof: 'Open', surface: 'Natural (temporary for WC)', lat: 40.8135, lng: -74.0745,
    wikiSlug: 'MetLife_Stadium', homeTeams: ['New York Giants', 'New York Jets'], role: 'Final · July 19, 2026', accent: '#0B2265',
    blurb: 'Host of the 2026 World Cup Final — the biggest match on earth returns to the New York metro.',
  },
  {
    id: 'azteca', name: 'Estadio Azteca', officialName: 'Estadio Banorte', city: 'Mexico City', country: 'Mexico', countryFlag: '🇲🇽',
    capacity: 87000, opened: 1966, roof: 'Open', surface: 'Grass', lat: 19.3029, lng: -99.1505,
    wikiSlug: 'Estadio_Azteca', homeTeams: ['Club América', 'Cruz Azul', 'Mexico NT'], role: 'Opening Match · June 11, 2026', accent: '#006847',
    blurb: 'The only stadium to host three World Cups (1970, 1986, 2026) — a cathedral of the game.',
  },
  {
    id: 'att', name: 'AT&T Stadium', city: 'Dallas', country: 'USA', countryFlag: '🇺🇸',
    capacity: 92000, opened: 2009, roof: 'Retractable', surface: 'Natural (temporary for WC)', lat: 32.7473, lng: -97.0945,
    wikiSlug: 'AT%26T_Stadium', homeTeams: ['Dallas Cowboys'], role: 'Semi-final', accent: '#041E42',
    blurb: 'Jerry\'s World — a retractable-roof colossus with the largest column-free interior in the world.',
  },
  {
    id: 'sofi', name: 'SoFi Stadium', city: 'Los Angeles', country: 'USA', countryFlag: '🇺🇸',
    capacity: 70000, opened: 2020, roof: 'Canopy', surface: 'Natural (temporary for WC)', lat: 33.9535, lng: -118.3392,
    wikiSlug: 'SoFi_Stadium', homeTeams: ['Los Angeles Rams', 'Los Angeles Chargers'], accent: '#003087',
    blurb: 'A $5B architectural marvel under a translucent ETFE canopy — the most expensive stadium ever built.',
  },
  {
    id: 'mercedes', name: 'Mercedes-Benz Stadium', city: 'Atlanta', country: 'USA', countryFlag: '🇺🇸',
    capacity: 71000, opened: 2017, roof: 'Retractable', surface: 'Natural (temporary for WC)', lat: 33.7554, lng: -84.4009,
    wikiSlug: 'Mercedes-Benz_Stadium', homeTeams: ['Atlanta Falcons', 'Atlanta United'], role: 'Semi-final', accent: '#A71930',
    blurb: 'Its eight-petal camera-aperture retractable roof is one of the most striking in world sport.',
  },
  {
    id: 'hardrock', name: 'Hard Rock Stadium', city: 'Miami', country: 'USA', countryFlag: '🇺🇸',
    capacity: 65000, opened: 1987, roof: 'Canopy', surface: 'Natural (temporary for WC)', lat: 25.9580, lng: -80.2389,
    wikiSlug: 'Hard_Rock_Stadium', homeTeams: ['Miami Dolphins', 'Miami Hurricanes'], role: 'Third-place play-off', accent: '#F58220',
    blurb: 'A canopy-shaded South Florida landmark that also hosts F1 and the Miami Open.',
  },
  {
    id: 'nrg', name: 'NRG Stadium', city: 'Houston', country: 'USA', countryFlag: '🇺🇸',
    capacity: 72000, opened: 2002, roof: 'Retractable', surface: 'Natural (temporary for WC)', lat: 29.6847, lng: -95.4107,
    wikiSlug: 'NRG_Stadium', homeTeams: ['Houston Texans'], accent: '#00143F',
    blurb: 'The first NFL stadium with a retractable roof — climate-controlled football in the Texas heat.',
  },
  {
    id: 'arrowhead', name: 'Arrowhead Stadium', officialName: 'GEHA Field at Arrowhead', city: 'Kansas City', country: 'USA', countryFlag: '🇺🇸',
    capacity: 76000, opened: 1972, roof: 'Open', surface: 'Grass', lat: 39.0489, lng: -94.4839,
    wikiSlug: 'Arrowhead_Stadium', homeTeams: ['Kansas City Chiefs'], accent: '#E31837',
    blurb: 'Holder of the Guinness record for the loudest outdoor stadium — a wall of sound.',
  },
  {
    id: 'lumen', name: 'Lumen Field', city: 'Seattle', country: 'USA', countryFlag: '🇺🇸',
    capacity: 69000, opened: 2002, roof: 'Canopy', surface: 'Natural (temporary for WC)', lat: 47.5952, lng: -122.3316,
    wikiSlug: 'Lumen_Field', homeTeams: ['Seattle Seahawks', 'Seattle Sounders FC'], accent: '#69BE28',
    blurb: 'Home of one of North America\'s great soccer atmospheres — the Sounders\' cauldron.',
  },
  {
    id: 'levis', name: "Levi's Stadium", city: 'San Francisco Bay Area', country: 'USA', countryFlag: '🇺🇸',
    capacity: 68500, opened: 2014, roof: 'Open', surface: 'Grass', lat: 37.4030, lng: -121.9698,
    wikiSlug: "Levi%27s_Stadium", homeTeams: ['San Francisco 49ers'], accent: '#AA0000',
    blurb: 'A Silicon-Valley stadium famed for its sustainability — a living roof and solar arrays.',
  },
  {
    id: 'gillette', name: 'Gillette Stadium', city: 'Boston', country: 'USA', countryFlag: '🇺🇸',
    capacity: 65000, opened: 2002, roof: 'Open', surface: 'Natural (temporary for WC)', lat: 42.0909, lng: -71.2643,
    wikiSlug: 'Gillette_Stadium', homeTeams: ['New England Patriots', 'New England Revolution'], accent: '#002244',
    blurb: 'The Patriots\' fortress, marked by its signature lighthouse and bridge.',
  },
  {
    id: 'linc', name: 'Lincoln Financial Field', city: 'Philadelphia', country: 'USA', countryFlag: '🇺🇸',
    capacity: 69000, opened: 2003, roof: 'Open', surface: 'Grass', lat: 39.9008, lng: -75.1675,
    wikiSlug: 'Lincoln_Financial_Field', homeTeams: ['Philadelphia Eagles'], accent: '#004C54',
    blurb: 'The Linc — a green-powered stadium in one of America\'s most passionate sports cities.',
  },
  {
    id: 'bmo', name: 'BMO Field', city: 'Toronto', country: 'Canada', countryFlag: '🇨🇦',
    capacity: 45000, opened: 2007, roof: 'Open', surface: 'Grass', lat: 43.6332, lng: -79.4185,
    wikiSlug: 'BMO_Field', homeTeams: ['Toronto FC', 'Toronto Argonauts'], accent: '#B81137',
    blurb: 'Canada\'s national soccer stadium, temporarily expanded to host the World Cup.',
  },
  {
    id: 'bcplace', name: 'BC Place', city: 'Vancouver', country: 'Canada', countryFlag: '🇨🇦',
    capacity: 54500, opened: 1983, roof: 'Retractable', surface: 'Grass', lat: 49.2767, lng: -123.1119,
    wikiSlug: 'BC_Place', homeTeams: ['Vancouver Whitecaps FC', 'BC Lions'], accent: '#003087',
    blurb: 'Its cable-supported retractable roof is the largest of its kind in the world.',
  },
  {
    id: 'akron', name: 'Estadio Akron', city: 'Guadalajara', country: 'Mexico', countryFlag: '🇲🇽',
    capacity: 48000, opened: 2010, roof: 'Open', surface: 'Grass', lat: 20.6819, lng: -103.4625,
    wikiSlug: 'Estadio_Akron', homeTeams: ['C.D. Guadalajara (Chivas)'], accent: '#B4131C',
    blurb: 'A volcano-inspired bowl set into the landscape — home of Chivas.',
  },
  {
    id: 'bbva', name: 'Estadio BBVA', officialName: 'Estadio BBVA', city: 'Monterrey', country: 'Mexico', countryFlag: '🇲🇽',
    capacity: 53500, opened: 2015, roof: 'Open', surface: 'Grass', lat: 25.6693, lng: -100.2444,
    wikiSlug: 'Estadio_BBVA', homeTeams: ['C.F. Monterrey'], accent: '#00337F',
    blurb: 'El Gigante de Acero — "The Steel Giant" — framed by the Cerro de la Silla mountain.',
  },
];

export const getStadium = (id: string) => WC_STADIUMS.find(s => s.id === id);

/** Match a free-text venue string (e.g. from a fixture) to a stadium. */
export function stadiumForVenue(venue: string, city?: string): WCStadium | undefined {
  const n = (venue || '').toLowerCase();
  const c = (city || '').toLowerCase();
  return WC_STADIUMS.find(s =>
    s.name.toLowerCase().includes(n) || n.includes(s.name.toLowerCase().split(' ')[0]) ||
    (c && s.city.toLowerCase().includes(c)));
}
