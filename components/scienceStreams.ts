/**
 * Free public science livestreams — NASA, ESA, USGS, NOAA.
 * All sources are US government agencies or public institutions;
 * content is in the public domain and freely embeddable.
 */

export type ScienceCategory = 'SPACE' | 'EARTH' | 'ATMOSPHERE' | 'VOLCANO' | 'OCEAN';

export interface ScienceStream {
  id: string;
  category: ScienceCategory;
  title: string;
  source: string;        // Agency / organization
  description: string;
  embedUrl: string;      // iframe src (YouTube embed or embeddable web URL)
  directUrl: string;     // Opens in new tab
  isLive: boolean;       // true = 24/7; false = event-based (may be offline)
  isEmbeddable: boolean; // false = show card with external-link button only
  accent: string;
  emoji: string;
  tags: string[];
}

export const SCIENCE_STREAMS: ScienceStream[] = [
  // ── SPACE ────────────────────────────────────────────────────────────────
  {
    id: 'nasa-tv',
    category: 'SPACE',
    title: 'NASA TV — Public Channel',
    source: 'NASA',
    description: '24/7 coverage of missions, spacewalks, launches, and Earth-view cameras from the International Space Station.',
    embedUrl: 'https://www.youtube.com/embed/live_stream?channel=UCLA_DiR1FfKNvjuUpBHmylQ8A&autoplay=1&mute=1',
    directUrl: 'https://www.nasa.gov/nasatv/',
    isLive: true,
    isEmbeddable: true,
    accent: '#0B3D91',
    emoji: '🚀',
    tags: ['nasa', 'space', 'iss', 'missions', 'launches'],
  },
  {
    id: 'nasa-iss-earth',
    category: 'SPACE',
    title: 'ISS HD Earth Viewing',
    source: 'NASA / ISS',
    description: 'Live HD video of Earth from cameras mounted on the International Space Station. When the station is in night orbit the feed goes dark.',
    embedUrl: 'https://www.youtube.com/embed/P9C25Un7xaM?autoplay=1&mute=1',
    directUrl: 'https://www.nasa.gov/international-space-station/expedition/real-time-iss-tracking/',
    isLive: true,
    isEmbeddable: true,
    accent: '#1A73E8',
    emoji: '🌍',
    tags: ['nasa', 'iss', 'earth', 'orbit', 'space station'],
  },
  {
    id: 'nasa-jet-propulsion',
    category: 'SPACE',
    title: 'NASA JPL Live',
    source: 'NASA Jet Propulsion Laboratory',
    description: 'Mission control events, Mars coverage, deep-space mission broadcasts and engineering briefings from JPL in Pasadena.',
    embedUrl: 'https://www.youtube.com/embed/live_stream?channel=UC_x5XG1OV2P6uZZ5FSM9Ttw&autoplay=1&mute=1',
    directUrl: 'https://www.jpl.nasa.gov/',
    isLive: false,
    isEmbeddable: true,
    accent: '#E84B3A',
    emoji: '🛸',
    tags: ['nasa', 'jpl', 'mars', 'deep space', 'missions'],
  },
  {
    id: 'esa-live',
    category: 'SPACE',
    title: 'ESA Live Events',
    source: 'European Space Agency',
    description: 'Ariane & Vega rocket launches, space science briefings, astronaut missions, and European space programme coverage.',
    embedUrl: 'https://www.youtube.com/embed/live_stream?channel=UCSLuDPHBSC-iOdbMKQy7Gmg&autoplay=1&mute=1',
    directUrl: 'https://www.esa.int/Enabling_Support/Operations/ESA_Live',
    isLive: false,
    isEmbeddable: true,
    accent: '#003087',
    emoji: '🛰️',
    tags: ['esa', 'europe', 'launches', 'ariane', 'vega'],
  },
  {
    id: 'spacex-live',
    category: 'SPACE',
    title: 'SpaceX Launch Stream',
    source: 'SpaceX',
    description: 'Falcon 9, Falcon Heavy, and Starship launch webcasts. Event-based — streams go live ~45 minutes before launch.',
    embedUrl: 'https://www.youtube.com/embed/live_stream?channel=UCtI0Hodo5o5dUb67FeUjDeA&autoplay=1&mute=1',
    directUrl: 'https://www.spacex.com/launches/',
    isLive: false,
    isEmbeddable: true,
    accent: '#005288',
    emoji: '🚀',
    tags: ['spacex', 'falcon', 'starship', 'commercial', 'launches'],
  },

  // ── ATMOSPHERE / WEATHER ─────────────────────────────────────────────────
  {
    id: 'noaa-goes-east',
    category: 'ATMOSPHERE',
    title: 'GOES-East Satellite — Full Disk',
    source: 'NOAA / NESDIS',
    description: 'Near-real-time geostationary satellite imagery of the Western Hemisphere from NOAA\'s GOES-16. Updates every 10–15 minutes.',
    embedUrl: 'https://www.star.nesdis.noaa.gov/GOES/CONUS.php?sat=G16',
    directUrl: 'https://www.star.nesdis.noaa.gov/GOES/CONUS.php?sat=G16',
    isLive: true,
    isEmbeddable: true,
    accent: '#00698F',
    emoji: '🌦️',
    tags: ['noaa', 'goes', 'satellite', 'weather', 'atmosphere'],
  },
  {
    id: 'rammb-slider',
    category: 'ATMOSPHERE',
    title: 'RAMMB SLIDER — GOES Satellite Explorer',
    source: 'NOAA / CIRA / Colorado State',
    description: 'Interactive animated loops from GOES-16 and GOES-18 satellites. Browse by band — visible, infrared, water vapor, lightning.',
    embedUrl: 'https://rammb-slider.cira.colostate.edu/?sat=goes-16&z=0&angle=0&im=12&ts=1&st=0',
    directUrl: 'https://rammb-slider.cira.colostate.edu/',
    isLive: true,
    isEmbeddable: true,
    accent: '#2D89EF',
    emoji: '🛰️',
    tags: ['noaa', 'goes', 'satellite', 'infrared', 'atmosphere'],
  },
  {
    id: 'noaa-radar',
    category: 'ATMOSPHERE',
    title: 'NWS National Radar',
    source: 'NOAA / National Weather Service',
    description: 'Composite radar loop from NOAA\'s network of Doppler radar stations. Updates every 2–6 minutes.',
    embedUrl: 'https://radar.weather.gov/',
    directUrl: 'https://radar.weather.gov/',
    isLive: true,
    isEmbeddable: false,  // NWS blocks iframe embeds
    accent: '#00698F',
    emoji: '🌪️',
    tags: ['noaa', 'radar', 'doppler', 'storms', 'weather'],
  },

  // ── VOLCANO ──────────────────────────────────────────────────────────────
  {
    id: 'usgs-hvo-kilauea',
    category: 'VOLCANO',
    title: 'Kīlauea Volcano — HVO Webcams',
    source: 'USGS Hawaiian Volcano Observatory',
    description: 'Real-time webcam network covering the Kīlauea summit and East Rift Zone. Includes thermal and visible-light cameras.',
    embedUrl: 'https://volcanoes.usgs.gov/observatories/hvo/cams.html',
    directUrl: 'https://volcanoes.usgs.gov/observatories/hvo/cams.html',
    isLive: true,
    isEmbeddable: false,  // USGS blocks iframes
    accent: '#FF4500',
    emoji: '🌋',
    tags: ['usgs', 'volcano', 'kilauea', 'hawaii', 'geology'],
  },
  {
    id: 'usgs-avo-alaska',
    category: 'VOLCANO',
    title: 'Alaska Volcanoes — AVO Webcams',
    source: 'USGS Alaska Volcano Observatory',
    description: 'Webcams monitoring Alaskan volcanoes including Pavlof, Shishaldin, and others along the Aleutian arc.',
    embedUrl: 'https://www.avo.alaska.edu/webcam/',
    directUrl: 'https://www.avo.alaska.edu/webcam/',
    isLive: true,
    isEmbeddable: false,
    accent: '#8B4513',
    emoji: '🌋',
    tags: ['usgs', 'volcano', 'alaska', 'aleutian', 'geology'],
  },
  {
    id: 'usgs-yellowstone',
    category: 'VOLCANO',
    title: 'Yellowstone — YVO Seismic & Webcams',
    source: 'USGS Yellowstone Volcano Observatory',
    description: 'Monitoring data, webcams, and thermal features from Yellowstone Caldera. Includes real-time seismograph traces.',
    embedUrl: 'https://volcanoes.usgs.gov/observatories/yvo/',
    directUrl: 'https://volcanoes.usgs.gov/observatories/yvo/',
    isLive: true,
    isEmbeddable: false,
    accent: '#DAA520',
    emoji: '🌋',
    tags: ['usgs', 'yellowstone', 'caldera', 'seismic', 'geology'],
  },

  // ── OCEAN ────────────────────────────────────────────────────────────────
  {
    id: 'noaa-ocean-buoys',
    category: 'OCEAN',
    title: 'NOAA Ocean Buoy Network',
    source: 'NOAA National Data Buoy Center',
    description: 'Real-time wave heights, sea surface temperatures, winds, and atmospheric pressure from thousands of buoys worldwide.',
    embedUrl: 'https://www.ndbc.noaa.gov/',
    directUrl: 'https://www.ndbc.noaa.gov/',
    isLive: true,
    isEmbeddable: false,
    accent: '#006994',
    emoji: '🌊',
    tags: ['noaa', 'ocean', 'buoys', 'waves', 'oceanography'],
  },
  {
    id: 'mbari-deep-sea',
    category: 'OCEAN',
    title: 'MBARI Deep-Sea Live',
    source: 'Monterey Bay Aquarium Research Institute',
    description: 'Occasional live ROV dives from MBARI\'s deep-sea research expeditions. Streams on YouTube when dives are in progress.',
    embedUrl: 'https://www.youtube.com/embed/live_stream?channel=UCFXPHKNEOvMFdAn-k5oo96A&autoplay=1&mute=1',
    directUrl: 'https://www.mbari.org/technology/featured-instruments/video-annotation-and-reference-system/live-from-mbari/',
    isLive: false,
    isEmbeddable: true,
    accent: '#1A6B8A',
    emoji: '🐙',
    tags: ['mbari', 'ocean', 'deep sea', 'rov', 'marine biology'],
  },

  // ── EARTH SCIENCE ────────────────────────────────────────────────────────
  {
    id: 'usgs-earthquake-map',
    category: 'EARTH',
    title: 'USGS Real-Time Earthquake Map',
    source: 'USGS Earthquake Hazards Program',
    description: 'Live map of all seismic events worldwide. Updates continuously — shows all earthquakes M1.0+ in the last 24 hours.',
    embedUrl: 'https://earthquake.usgs.gov/earthquakes/map/',
    directUrl: 'https://earthquake.usgs.gov/earthquakes/map/',
    isLive: true,
    isEmbeddable: true,
    accent: '#8B4513',
    emoji: '🌍',
    tags: ['usgs', 'earthquake', 'seismic', 'geology', 'real-time'],
  },
];

export const SCIENCE_CATEGORIES: { id: ScienceCategory; label: string; emoji: string; accent: string }[] = [
  { id: 'SPACE',      label: 'Space & Astronomy',      emoji: '🚀', accent: '#0B3D91' },
  { id: 'ATMOSPHERE', label: 'Weather & Atmosphere',   emoji: '🌦️', accent: '#00698F' },
  { id: 'VOLCANO',    label: 'Volcanology',            emoji: '🌋', accent: '#FF4500' },
  { id: 'OCEAN',      label: 'Oceanography',           emoji: '🌊', accent: '#006994' },
  { id: 'EARTH',      label: 'Earth Sciences',         emoji: '🌍', accent: '#228B22' },
];

export function getStreamsByCategory(cat: ScienceCategory) {
  return SCIENCE_STREAMS.filter(s => s.category === cat);
}
