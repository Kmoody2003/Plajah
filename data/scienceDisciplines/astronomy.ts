// ─────────────────────────────────────────────────────────────────────────────
// Astronomy discipline data for the Plajah Academia science studio.
// Accuracy-first: every figure carries a real Wikipedia slug (final path segment
// of en.wikipedia.org/wiki/<slug>) so portraits + biographies enrich live at
// runtime. Formulas are KaTeX-ready and verified; tool URLs point at real, free,
// stable observatories, archives and APIs.
// ─────────────────────────────────────────────────────────────────────────────
import type { ScienceDisciplineData } from './types';

const DATA: ScienceDisciplineData = {
  id: 'astronomy',
  label: 'Astronomy',
  icon: 'Telescope',
  accent: '#9775FA',
  accent2: '#6741D9',
  tagline: 'Reading the light of the universe — from planets to the cosmic dawn.',
  heroBlurb:
    'Astronomy is humanity\'s oldest science and its largest laboratory. By decoding the light and gravity of distant worlds, stars and galaxies, it has revealed a universe billions of years old and billions of light-years wide — and placed Earth within it.',
  openStaxSubject: 'astronomy',
  arXivCategory: 'astro-ph',
  arXivQuery: 'astrophysics cosmology telescope',
  simulators: ['orbit'],

  figureHalls: [
    { id: 'classical', label: 'Classical & Observational', blurb: 'From naked-eye mapping to the first telescopes — the astronomers who overturned the Earth-centred cosmos.' },
    { id: 'stellar', label: 'Stars & Galaxies', blurb: 'Those who decoded what stars are made of, how they live and die, and how galaxies are built.' },
    { id: 'cosmology', label: 'Cosmology & Relativity', blurb: 'The theorists and observers who found an expanding universe governed by gravity and dark matter.' },
    { id: 'modern', label: 'Instruments & Discovery', blurb: 'Radio, space and survey astronomers who opened new windows on the sky and found what was hidden.' },
  ],

  figures: [
    // Classical & Observational
    {
      id: 'copernicus', name: 'Nicolaus Copernicus', wikiSlug: 'Nicolaus_Copernicus', hall: 'classical',
      role: 'Astronomer', era: 'Renaissance', nationality: 'Polish', years: '1473–1543',
      tagline: 'Placed the Sun, not the Earth, at the centre.',
      works: ['De revolutionibus orbium coelestium (1543)'],
      techniques: ['Heliocentric model of the solar system', 'Explained retrograde motion geometrically', 'Ordered the planets by orbital period'],
    },
    {
      id: 'tycho', name: 'Tycho Brahe', wikiSlug: 'Tycho_Brahe', hall: 'classical',
      role: 'Astronomer', era: 'Late Renaissance', nationality: 'Danish', years: '1546–1601',
      tagline: 'The greatest naked-eye observer in history.',
      works: ['Uraniborg observatory', 'Star catalogue of 1,000+ stars', 'Observations of the 1572 supernova'],
      techniques: ['Instrument precision approaching one arcminute', 'Decades of systematic positional data', 'Showed comets lie beyond the Moon'],
    },
    {
      id: 'kepler', name: 'Johannes Kepler', wikiSlug: 'Johannes_Kepler', hall: 'classical',
      role: 'Astronomer & mathematician', era: 'Scientific Revolution', nationality: 'German', years: '1571–1630',
      tagline: 'Found that planets move in ellipses.',
      works: ['Astronomia nova (1609)', 'Harmonices Mundi (1619)', 'Rudolphine Tables'],
      techniques: ['Three laws of planetary motion', 'Ellipse-shaped orbits with the Sun at a focus', 'Analysed Tycho\'s Mars data to break the circle'],
    },
    {
      id: 'galileo', name: 'Galileo Galilei', wikiSlug: 'Galileo_Galilei', hall: 'classical',
      role: 'Astronomer & physicist', era: 'Scientific Revolution', nationality: 'Italian', years: '1564–1642',
      tagline: 'First to turn the telescope on the heavens.',
      works: ['Sidereus Nuncius (1610)', 'Dialogue Concerning the Two Chief World Systems'],
      techniques: ['Discovered Jupiter\'s four large moons', 'Observed the phases of Venus', 'Resolved the Milky Way into stars and mapped sunspots'],
    },
    {
      id: 'herschel-w', name: 'William Herschel', wikiSlug: 'William_Herschel', hall: 'classical',
      role: 'Astronomer', era: 'Enlightenment', nationality: 'German-British', years: '1738–1822',
      tagline: 'Discovered Uranus and mapped the Milky Way.',
      works: ['Discovery of Uranus (1781)', 'Catalogue of nebulae and star clusters', 'Discovery of infrared radiation'],
      techniques: ['Built the largest reflecting telescopes of his day', 'Systematic surveys of double stars and nebulae', 'Star-gauging to infer the Galaxy\'s shape'],
    },
    {
      id: 'herschel-c', name: 'Caroline Herschel', wikiSlug: 'Caroline_Herschel', hall: 'classical',
      role: 'Astronomer', era: 'Enlightenment', nationality: 'German-British', years: '1750–1848',
      tagline: 'First woman to discover a comet and be paid for science.',
      works: ['Discovery of eight comets', 'Index to Flamsteed\'s Observations', 'Catalogue of nebulae'],
      techniques: ['Systematic comet sweeping', 'Corrected and extended stellar catalogues', 'Recorded and reduced observational data'],
    },

    // Stars & Galaxies
    {
      id: 'leavitt', name: 'Henrietta Swan Leavitt', wikiSlug: 'Henrietta_Swan_Leavitt', hall: 'stellar',
      role: 'Astronomer', era: 'Harvard Computers', nationality: 'American', years: '1868–1921',
      tagline: 'Her period–luminosity law made the cosmic distance ladder possible.',
      works: ['Cepheid period–luminosity relation', 'Studies of variable stars in the Magellanic Clouds'],
      techniques: ['Measured brightness of thousands of variable stars', 'Found period predicts luminosity for Cepheids', 'Gave astronomy a "standard candle" for distance'],
    },
    {
      id: 'cannon', name: 'Annie Jump Cannon', wikiSlug: 'Annie_Jump_Cannon', hall: 'stellar',
      role: 'Astronomer', era: 'Harvard Computers', nationality: 'American', years: '1863–1941',
      tagline: 'Created the stellar classification system still in use.',
      works: ['Henry Draper Catalogue', 'OBAFGKM spectral sequence'],
      techniques: ['Classified over 350,000 stars by spectrum', 'Ordered spectral types by temperature', 'Standardized stellar classification worldwide'],
    },
    {
      id: 'payne', name: 'Cecilia Payne-Gaposchkin', wikiSlug: 'Cecilia_Payne-Gaposchkin', hall: 'stellar',
      role: 'Astronomer', era: 'Astrophysics revolution', nationality: 'British-American', years: '1900–1979',
      tagline: 'Showed the stars — and the universe — are made mostly of hydrogen.',
      works: ['Stellar Atmospheres (1925)', 'Studies of variable stars'],
      techniques: ['Applied ionization theory to stellar spectra', 'Determined the chemical composition of stars', 'Revealed hydrogen and helium\'s cosmic dominance'],
    },
    {
      id: 'chandra', name: 'Subrahmanyan Chandrasekhar', wikiSlug: 'Subrahmanyan_Chandrasekhar', hall: 'stellar',
      role: 'Astrophysicist', era: 'Modern astrophysics', nationality: 'Indian-American', years: '1910–1995',
      tagline: 'Found the mass limit that decides a star\'s fate.',
      works: ['Chandrasekhar limit', 'An Introduction to the Study of Stellar Structure'],
      techniques: ['Relativistic theory of white-dwarf structure', 'Showed massive cores must collapse further', 'Foundational work on stellar dynamics and black holes'],
    },
    {
      id: 'eddington', name: 'Arthur Eddington', wikiSlug: 'Arthur_Eddington', hall: 'stellar',
      role: 'Astrophysicist', era: 'Early 20th century', nationality: 'British', years: '1882–1944',
      tagline: 'Explained how stars shine and tested relativity.',
      works: ['The Internal Constitution of the Stars', '1919 eclipse expedition'],
      techniques: ['Radiative equilibrium model of stellar interiors', 'Mass–luminosity relation for stars', 'Measured light-bending by the Sun, confirming general relativity'],
    },

    // Cosmology & Relativity
    {
      id: 'hubble', name: 'Edwin Hubble', wikiSlug: 'Edwin_Hubble', hall: 'cosmology',
      role: 'Astronomer', era: 'Expanding-universe era', nationality: 'American', years: '1889–1953',
      tagline: 'Discovered galaxies beyond the Milky Way and cosmic expansion.',
      works: ['Hubble\'s law', 'Galaxy morphological classification', 'Distance to the Andromeda Nebula'],
      techniques: ['Used Cepheids to prove galaxies are external', 'Found redshift rises with distance', 'Established the expanding universe observationally'],
    },
    {
      id: 'lemaitre', name: 'Georges Lemaître', wikiSlug: 'Georges_Lemaître', hall: 'cosmology',
      role: 'Physicist & priest', era: 'Birth of cosmology', nationality: 'Belgian', years: '1894–1966',
      tagline: 'Proposed the expanding universe and the "primeval atom".',
      works: ['Expanding-universe solution (1927)', 'Primeval-atom hypothesis (Big Bang)'],
      techniques: ['Derived cosmic expansion from general relativity', 'Predicted the velocity–distance relation before Hubble published', 'First model of a universe with a beginning'],
    },
    {
      id: 'rubin', name: 'Vera Rubin', wikiSlug: 'Vera_Rubin', hall: 'cosmology',
      role: 'Astronomer', era: 'Dark-matter era', nationality: 'American', years: '1928–2016',
      tagline: 'Her galaxy rotation curves revealed dark matter.',
      works: ['Galaxy rotation-curve measurements', 'Studies of galaxy dynamics'],
      techniques: ['Precise spectroscopy of spiral-galaxy rotation', 'Found stars orbit too fast for visible mass', 'Provided strong evidence for unseen dark matter'],
    },
    {
      id: 'zwicky', name: 'Fritz Zwicky', wikiSlug: 'Fritz_Zwicky', hall: 'cosmology',
      role: 'Astrophysicist', era: 'Mid-20th century', nationality: 'Swiss-American', years: '1898–1974',
      tagline: 'Coined "dark matter" and predicted neutron stars.',
      works: ['Dark-matter inference in the Coma Cluster', 'Supernova and neutron-star hypothesis', 'Catalogue of galaxies and clusters'],
      techniques: ['Applied the virial theorem to galaxy clusters', 'Proposed supernovae form neutron stars', 'Predicted gravitational lensing by galaxies'],
    },

    // Instruments & Discovery
    {
      id: 'jansky', name: 'Karl Jansky', wikiSlug: 'Karl_Jansky', hall: 'modern',
      role: 'Radio engineer', era: 'Birth of radio astronomy', nationality: 'American', years: '1905–1950',
      tagline: 'Detected the first radio waves from space.',
      works: ['Discovery of galactic radio emission (1933)', 'Jansky\'s "merry-go-round" antenna'],
      techniques: ['Traced radio static to the Milky Way\'s centre', 'Founded the field of radio astronomy', 'His name became the unit of radio flux density'],
    },
    {
      id: 'bell', name: 'Jocelyn Bell Burnell', wikiSlug: 'Jocelyn_Bell_Burnell', hall: 'modern',
      role: 'Astrophysicist', era: 'Radio astronomy', nationality: 'British', years: 'b. 1943',
      tagline: 'Discovered the first pulsars.',
      works: ['Discovery of pulsars (1967)', 'Interplanetary Scintillation Array observations'],
      techniques: ['Spotted precise repeating radio pulses in chart data', 'Distinguished a real signal from interference', 'Identified rapidly spinning neutron stars'],
    },
    {
      id: 'sagan', name: 'Carl Sagan', wikiSlug: 'Carl_Sagan', hall: 'modern',
      role: 'Astronomer & communicator', era: 'Space age', nationality: 'American', years: '1934–1996',
      tagline: 'Brought planetary science and the cosmos to the public.',
      works: ['Cosmos (series)', 'Pale Blue Dot', 'Pioneer and Voyager messages'],
      techniques: ['Modeled Venus\'s runaway greenhouse and Mars\'s seasons', 'Advanced the search for extraterrestrial intelligence', 'Championed planetary exploration and science literacy'],
    },
    {
      id: 'mayor', name: 'Michel Mayor', wikiSlug: 'Michel_Mayor', hall: 'modern',
      role: 'Astrophysicist', era: 'Exoplanet era', nationality: 'Swiss', years: 'b. 1942',
      tagline: 'Co-discovered the first exoplanet around a Sun-like star.',
      works: ['Discovery of 51 Pegasi b (1995)', 'HARPS spectrograph programme'],
      techniques: ['High-precision radial-velocity spectroscopy', 'Detected stellar wobble from an orbiting planet', 'Launched the field of exoplanet detection'],
    },
  ],

  concepts: [
    { id: 'stellar-evo', name: 'Stellar Evolution', blurb: 'The life cycle of a star — birth in a gas cloud, hydrogen fusion on the main sequence, and death as a white dwarf, neutron star or black hole — set mostly by its mass.', wikiSlug: 'Stellar_evolution', tags: ['stars', 'astrophysics'] },
    { id: 'redshift', name: 'Redshift & Doppler', blurb: 'Motion and cosmic expansion stretch a source\'s light to longer wavelengths; measuring the shift yields velocities and distances across the universe.', wikiSlug: 'Redshift', tags: ['cosmology', 'spectroscopy'] },
    { id: 'blackhole', name: 'Black Holes', blurb: 'Regions where gravity is so strong that nothing, not even light, escapes past the event horizon — the endpoints of the most massive stars.', wikiSlug: 'Black_hole', tags: ['relativity', 'astrophysics'] },
    { id: 'distance-ladder', name: 'Cosmic Distance Ladder', blurb: 'A chain of overlapping methods — parallax, Cepheids, Type Ia supernovae — each calibrating the next to measure ever greater cosmic distances.', wikiSlug: 'Cosmic_distance_ladder', tags: ['cosmology', 'measurement'] },
    { id: 'exoplanets', name: 'Exoplanets', blurb: 'Planets orbiting other stars, found by the tiny wobbles and dimming they cause; thousands are now known, some potentially habitable.', wikiSlug: 'Exoplanet', tags: ['planets', 'detection'] },
    { id: 'spectroscopy', name: 'Spectroscopy', blurb: 'Splitting light into its spectrum reveals a source\'s composition, temperature, motion and density — astronomy\'s single most powerful tool.', wikiSlug: 'Astronomical_spectroscopy', tags: ['spectroscopy', 'measurement'] },
    { id: 'dark-matter', name: 'Dark Matter & Dark Energy', blurb: 'Most of the universe is invisible: unseen matter binds galaxies, while a mysterious dark energy accelerates cosmic expansion.', wikiSlug: 'Dark_matter', tags: ['cosmology'] },
    { id: 'cmb', name: 'Cosmic Microwave Background', blurb: 'The faint afterglow of the Big Bang, released when the universe first became transparent — a snapshot of the cosmos at 380,000 years old.', wikiSlug: 'Cosmic_microwave_background', tags: ['cosmology'] },
    { id: 'nucleosynthesis', name: 'Nucleosynthesis', blurb: 'How the elements are forged — hydrogen and helium in the Big Bang, heavier elements in stellar cores and supernovae. "We are made of star stuff."', wikiSlug: 'Nucleosynthesis', tags: ['astrophysics', 'stars'] },
    { id: 'gravity-waves', name: 'Gravitational Waves', blurb: 'Ripples in spacetime from accelerating masses like merging black holes, detected by measuring sub-atomic changes in kilometre-long laser arms.', wikiSlug: 'Gravitational_wave', tags: ['relativity'] },
    { id: 'hr-diagram', name: 'Hertzsprung–Russell Diagram', blurb: 'Plotting stars by luminosity against temperature reveals the main sequence, giants and dwarfs — the single most useful diagram in astrophysics.', wikiSlug: 'Hertzsprung%E2%80%93Russell_diagram', tags: ['stars'] },
    { id: 'orbital-mechanics', name: 'Orbital Mechanics', blurb: 'Kepler\'s and Newton\'s laws govern how planets, moons and spacecraft move — the mathematics of orbits, transfers and gravitational slingshots.', wikiSlug: 'Orbital_mechanics', tags: ['dynamics', 'planets'] },
  ],

  eras: [
    {
      id: 'ancient', title: 'Ancient Sky-Watching', span: 'Antiquity–500 CE',
      essay: 'Babylonian, Egyptian, Greek, Mayan and Chinese astronomers tracked the Sun, Moon and planets for calendars, agriculture and omens. Greek thinkers built the first geometric models and measured the Earth\'s size.',
      developments: ['Babylonian mathematical planetary tables', 'Eratosthenes measures Earth\'s circumference', 'Ptolemy\'s geocentric Almagest'],
      turningPoints: ['Hipparchus catalogues the stars and precession', 'Ptolemy systematizes the Earth-centred cosmos'],
    },
    {
      id: 'medieval', title: 'Medieval & Islamic Astronomy', span: '500–1400',
      essay: 'Islamic astronomers preserved and advanced Greek work, building great observatories, refining star catalogues and instruments like the astrolabe, and naming many stars still known by Arabic names.',
      developments: ['Observatories at Baghdad, Maragheh and Samarkand', 'Refined star catalogues and trigonometric tables', 'The astrolabe and improved sighting instruments'],
      turningPoints: ['Al-Sufi\'s Book of Fixed Stars', 'Ulugh Beg\'s Samarkand star catalogue'],
    },
    {
      id: 'revolution', title: 'The Copernican Revolution', span: '1400–1700',
      essay: 'Copernicus moved the Sun to the centre, Tycho gathered unmatched data, Kepler found elliptical orbits, and Galileo\'s telescope revealed moons, phases and mountains — dismantling the ancient cosmos.',
      developments: ['Heliocentric model', 'Elliptical planetary orbits', 'The astronomical telescope'],
      turningPoints: ['Kepler\'s laws of planetary motion (1609–1619)', 'Galileo\'s telescopic discoveries (1610)'],
    },
    {
      id: 'newtonian', title: 'The Age of Gravitation', span: '1687–1850',
      essay: 'Newton\'s universal gravitation explained the orbits Kepler described and unified terrestrial and celestial physics. Bigger telescopes discovered new planets, and Herschel began mapping the Milky Way.',
      developments: ['Universal gravitation and celestial mechanics', 'Discovery of Uranus (1781) and Neptune (1846)', 'Systematic surveys of nebulae and double stars'],
      turningPoints: ['Newton\'s Principia (1687)', 'Neptune found from gravitational prediction (1846)'],
    },
    {
      id: 'astrophysics', title: 'The Birth of Astrophysics', span: '1850–1920',
      essay: 'Spectroscopy and photography turned astronomy into physics: astronomers could now read what stars are made of and how they move. The Harvard Computers classified hundreds of thousands of spectra.',
      developments: ['Stellar spectroscopy and chemical analysis', 'Photographic sky surveys', 'The spectral classification sequence'],
      turningPoints: ['Leavitt\'s period–luminosity law (1908)', 'Payne shows stars are mostly hydrogen (1925)'],
    },
    {
      id: 'expanding', title: 'The Expanding Universe', span: '1920–1965',
      essay: 'Hubble proved galaxies lie far beyond the Milky Way and that the universe is expanding, while general relativity and the Big Bang model reframed cosmology. The scale of the cosmos exploded.',
      developments: ['Galaxies as "island universes"', 'Hubble\'s velocity–distance law', 'The Big Bang model of an evolving cosmos'],
      turningPoints: ['Hubble\'s expansion discovery (1929)', 'Discovery of the cosmic microwave background (1965)'],
    },
    {
      id: 'new-astronomy', title: 'New Windows on the Sky', span: '1930–2000',
      essay: 'Radio, infrared, X-ray and space telescopes revealed a violent, invisible universe: pulsars, quasars, the CMB and black holes. Dark matter emerged from galaxy dynamics.',
      developments: ['Radio, X-ray and space-based astronomy', 'Pulsars, quasars and active galaxies', 'Evidence for dark matter'],
      turningPoints: ['Discovery of pulsars (1967)', 'Hubble Space Telescope launched (1990)'],
    },
    {
      id: 'precision', title: 'Precision & Multi-Messenger Astronomy', span: '2000–present',
      essay: 'Thousands of exoplanets, precise cosmological parameters, gravitational-wave detections and the first black-hole image mark a golden age. Astronomy now combines light, gravity and particles from the same event.',
      developments: ['Exoplanet surveys (Kepler, TESS)', 'Gravitational-wave detection (LIGO/Virgo)', 'Event Horizon Telescope black-hole imaging', 'JWST and precision cosmology'],
      turningPoints: ['First exoplanet around a Sun-like star (1995)', 'First gravitational-wave detection (2015)'],
    },
  ],

  laws: [
    {
      id: 'kepler-3', category: 'Orbital Mechanics', name: 'Kepler\'s Third Law',
      latex: 'T^2 = \\dfrac{4\\pi^2}{GM}\\,a^3',
      variables: [
        { sym: 'T', name: 'Orbital period', unit: 's' },
        { sym: 'a', name: 'Semi-major axis', unit: 'm' },
        { sym: 'G', name: 'Gravitational constant', unit: 'm³·kg⁻¹·s⁻²' },
        { sym: 'M', name: 'Central mass', unit: 'kg' },
      ],
      description: 'The square of an orbit\'s period is proportional to the cube of its semi-major axis — and reveals the mass of the body being orbited.',
      reference: 'https://en.wikipedia.org/wiki/Kepler%27s_laws_of_planetary_motion',
    },
    {
      id: 'gravitation', category: 'Gravity', name: 'Newton\'s Law of Universal Gravitation',
      latex: 'F = G\\dfrac{m_1 m_2}{r^2}',
      variables: [
        { sym: 'F', name: 'Gravitational force', unit: 'N' },
        { sym: 'G', name: 'Gravitational constant', unit: 'm³·kg⁻¹·s⁻²' },
        { sym: 'm_1, m_2', name: 'The two masses', unit: 'kg' },
        { sym: 'r', name: 'Separation', unit: 'm' },
      ],
      description: 'Every mass attracts every other with a force proportional to the masses and inversely proportional to the square of their separation.',
      reference: 'https://en.wikipedia.org/wiki/Newton%27s_law_of_universal_gravitation',
    },
    {
      id: 'hubble', category: 'Cosmology', name: 'Hubble–Lemaître Law',
      latex: 'v = H_0\\,d',
      variables: [
        { sym: 'v', name: 'Recession velocity', unit: 'km/s' },
        { sym: 'H_0', name: 'Hubble constant', unit: 'km·s⁻¹·Mpc⁻¹' },
        { sym: 'd', name: 'Distance', unit: 'Mpc' },
      ],
      description: 'Galaxies recede at speeds proportional to their distance — the observational signature of cosmic expansion.',
      reference: 'https://en.wikipedia.org/wiki/Hubble%27s_law',
    },
    {
      id: 'schwarzschild', category: 'Relativity', name: 'Schwarzschild Radius',
      latex: 'r_s = \\dfrac{2GM}{c^2}',
      variables: [
        { sym: 'r_s', name: 'Event-horizon radius', unit: 'm' },
        { sym: 'G', name: 'Gravitational constant', unit: 'm³·kg⁻¹·s⁻²' },
        { sym: 'M', name: 'Mass', unit: 'kg' },
        { sym: 'c', name: 'Speed of light', unit: 'm/s' },
      ],
      description: 'The radius at which an object\'s escape velocity equals the speed of light — compress a mass within it and it becomes a black hole.',
      reference: 'https://en.wikipedia.org/wiki/Schwarzschild_radius',
    },
    {
      id: 'stefan-boltzmann', category: 'Radiation', name: 'Stefan–Boltzmann Law',
      latex: 'L = 4\\pi R^2 \\sigma T^4',
      variables: [
        { sym: 'L', name: 'Luminosity', unit: 'W' },
        { sym: 'R', name: 'Stellar radius', unit: 'm' },
        { sym: '\\sigma', name: 'Stefan–Boltzmann constant', unit: 'W·m⁻²·K⁻⁴' },
        { sym: 'T', name: 'Surface temperature', unit: 'K' },
      ],
      description: 'A star\'s total power output scales with its surface area and the fourth power of its temperature — hotter, bigger stars shine vastly brighter.',
      reference: 'https://en.wikipedia.org/wiki/Stefan%E2%80%93Boltzmann_law',
    },
    {
      id: 'wien', category: 'Radiation', name: 'Wien\'s Displacement Law',
      latex: '\\lambda_{max} = \\dfrac{b}{T}',
      variables: [
        { sym: '\\lambda_{max}', name: 'Peak wavelength', unit: 'm' },
        { sym: 'b', name: 'Wien constant', unit: 'm·K' },
        { sym: 'T', name: 'Temperature', unit: 'K' },
      ],
      description: 'The wavelength at which a body radiates most strongly shifts inversely with temperature — why hot stars look blue and cool ones red.',
      reference: 'https://en.wikipedia.org/wiki/Wien%27s_displacement_law',
    },
    {
      id: 'distance-modulus', category: 'Measurement', name: 'Distance Modulus',
      latex: 'm - M = 5\\log_{10}(d) - 5',
      variables: [
        { sym: 'm', name: 'Apparent magnitude' },
        { sym: 'M', name: 'Absolute magnitude' },
        { sym: 'd', name: 'Distance', unit: 'pc' },
      ],
      description: 'The gap between how bright a star looks and how bright it truly is encodes its distance — the key to standard-candle measurements.',
      reference: 'https://en.wikipedia.org/wiki/Distance_modulus',
    },
    {
      id: 'parallax', category: 'Measurement', name: 'Stellar Parallax',
      latex: 'd = \\dfrac{1}{p}',
      variables: [
        { sym: 'd', name: 'Distance', unit: 'pc' },
        { sym: 'p', name: 'Parallax angle', unit: 'arcsec' },
      ],
      description: 'The apparent shift of a nearby star against distant ones as Earth orbits gives its distance directly — the first rung of the distance ladder.',
      reference: 'https://en.wikipedia.org/wiki/Stellar_parallax',
    },
    {
      id: 'redshift', category: 'Spectroscopy', name: 'Redshift',
      latex: 'z = \\dfrac{\\lambda_{obs} - \\lambda_{emit}}{\\lambda_{emit}}',
      variables: [
        { sym: 'z', name: 'Redshift' },
        { sym: '\\lambda_{obs}', name: 'Observed wavelength', unit: 'm' },
        { sym: '\\lambda_{emit}', name: 'Emitted wavelength', unit: 'm' },
      ],
      description: 'The fractional stretching of a spectral line, measuring recession velocity for nearby objects and cosmic expansion for distant ones.',
      reference: 'https://en.wikipedia.org/wiki/Redshift',
    },
    {
      id: 'escape-velocity', category: 'Orbital Mechanics', name: 'Escape Velocity',
      latex: 'v_{esc} = \\sqrt{\\dfrac{2GM}{r}}',
      variables: [
        { sym: 'v_{esc}', name: 'Escape velocity', unit: 'm/s' },
        { sym: 'G', name: 'Gravitational constant', unit: 'm³·kg⁻¹·s⁻²' },
        { sym: 'M', name: 'Body mass', unit: 'kg' },
        { sym: 'r', name: 'Distance from centre', unit: 'm' },
      ],
      description: 'The minimum speed needed to break free of a body\'s gravity without further propulsion — 11.2 km/s from Earth\'s surface.',
      reference: 'https://en.wikipedia.org/wiki/Escape_velocity',
    },
    {
      id: 'chandrasekhar', category: 'Astrophysics', name: 'Chandrasekhar Limit',
      latex: 'M_{ch} \\approx 1.44\\,M_\\odot',
      variables: [
        { sym: 'M_{ch}', name: 'Maximum white-dwarf mass' },
        { sym: 'M_\\odot', name: 'Solar mass', unit: 'kg' },
      ],
      description: 'A white dwarf heavier than about 1.44 solar masses cannot support itself against gravity and collapses — the trigger for Type Ia supernovae.',
      reference: 'https://en.wikipedia.org/wiki/Chandrasekhar_limit',
    },
    {
      id: 'rayleigh', category: 'Instrumentation', name: 'Angular Resolution (Rayleigh Criterion)',
      latex: '\\theta = 1.22\\,\\dfrac{\\lambda}{D}',
      variables: [
        { sym: '\\theta', name: 'Minimum resolvable angle', unit: 'rad' },
        { sym: '\\lambda', name: 'Wavelength', unit: 'm' },
        { sym: 'D', name: 'Aperture diameter', unit: 'm' },
      ],
      description: 'The finest detail a telescope can resolve is set by its aperture and the observing wavelength — larger mirrors see sharper.',
      reference: 'https://en.wikipedia.org/wiki/Angular_resolution',
    },
    {
      id: 'planck', category: 'Radiation', name: 'Planck\'s Radiation Law',
      latex: 'B_\\lambda(T) = \\dfrac{2hc^2}{\\lambda^5}\\dfrac{1}{e^{hc/\\lambda k_B T} - 1}',
      variables: [
        { sym: 'B_\\lambda', name: 'Spectral radiance' },
        { sym: 'T', name: 'Temperature', unit: 'K' },
        { sym: '\\lambda', name: 'Wavelength', unit: 'm' },
        { sym: 'h', name: 'Planck constant', unit: 'J·s' },
        { sym: 'k_B', name: 'Boltzmann constant', unit: 'J/K' },
      ],
      description: 'The exact spectrum of thermal radiation from a blackbody at temperature T — the model for stellar and cosmic-background emission.',
      reference: 'https://en.wikipedia.org/wiki/Planck%27s_law',
    },
    {
      id: 'jeans', category: 'Astrophysics', name: 'Jeans Mass',
      latex: 'M_J \\approx \\left(\\dfrac{5 k_B T}{G \\mu m_H}\\right)^{3/2}\\!\\left(\\dfrac{3}{4\\pi\\rho}\\right)^{1/2}',
      variables: [
        { sym: 'M_J', name: 'Jeans mass', unit: 'kg' },
        { sym: 'T', name: 'Cloud temperature', unit: 'K' },
        { sym: '\\rho', name: 'Cloud density', unit: 'kg/m³' },
        { sym: '\\mu', name: 'Mean molecular weight' },
      ],
      description: 'The critical mass above which a cold gas cloud\'s gravity overcomes its pressure and it collapses to form stars.',
      reference: 'https://en.wikipedia.org/wiki/Jeans_instability',
    },
    {
      id: 'friedmann', category: 'Cosmology', name: 'Friedmann Equation',
      latex: '\\left(\\dfrac{\\dot{a}}{a}\\right)^2 = \\dfrac{8\\pi G}{3}\\rho - \\dfrac{k c^2}{a^2}',
      variables: [
        { sym: 'a', name: 'Scale factor' },
        { sym: '\\dot{a}', name: 'Expansion rate' },
        { sym: '\\rho', name: 'Energy density', unit: 'kg/m³' },
        { sym: 'k', name: 'Spatial curvature' },
      ],
      description: 'The equation governing how the universe expands, linking its growth rate to its density and geometry — the backbone of modern cosmology.',
      reference: 'https://en.wikipedia.org/wiki/Friedmann_equations',
    },
    {
      id: 'drake', category: 'Astrobiology', name: 'Drake Equation',
      latex: 'N = R_* \\cdot f_p \\cdot n_e \\cdot f_l \\cdot f_i \\cdot f_c \\cdot L',
      variables: [
        { sym: 'N', name: 'Detectable civilizations' },
        { sym: 'R_*', name: 'Star-formation rate' },
        { sym: 'f_p', name: 'Fraction with planets' },
        { sym: 'n_e', name: 'Habitable planets per system' },
        { sym: 'L', name: 'Signalling lifetime', unit: 'yr' },
      ],
      description: 'A framework for estimating how many communicating civilizations might exist in the galaxy — as much a way to organize the unknowns as a firm number.',
      reference: 'https://en.wikipedia.org/wiki/Drake_equation',
    },
  ],

  tools: [
    { name: 'Stellarium', org: 'Stellarium', url: 'https://stellarium.org/', desc: 'Free open-source planetarium that renders a photorealistic sky for any time and place, with deep-sky objects and telescope control.', kind: 'software', access: 'Open' },
    { name: 'Aladin Sky Atlas', org: 'CDS Strasbourg', url: 'https://aladin.cds.unistra.fr/', desc: 'Interactive sky atlas overlaying survey images and catalogues; available in-browser (Aladin Lite) and as a desktop app.', kind: 'software', access: 'Open' },
    { name: 'SIMBAD Astronomical Database', org: 'CDS Strasbourg', url: 'https://simbad.cds.unistra.fr/simbad/', desc: 'Reference database of identifications, coordinates and bibliography for millions of astronomical objects.', kind: 'dataset', access: 'Open' },
    { name: 'NASA Open APIs (APOD, exoplanets)', org: 'NASA', url: 'https://api.nasa.gov/', desc: 'Free API portal including the Astronomy Picture of the Day, imagery and mission data with a free key.', kind: 'api', access: 'Free key' },
    { name: 'NASA Exoplanet Archive', org: 'NASA / Caltech', url: 'https://exoplanetarchive.ipac.caltech.edu/', desc: 'Authoritative catalogue of confirmed exoplanets and their properties, with a queryable API (TAP).', kind: 'dataset', access: 'Open' },
    { name: 'JPL Horizons', org: 'NASA JPL', url: 'https://ssd.jpl.nasa.gov/horizons/', desc: 'High-precision ephemeris system for positions and orbits of solar-system bodies, with a web and API interface.', kind: 'api', access: 'Open' },
    { name: 'SDSS SkyServer', org: 'Sloan Digital Sky Survey', url: 'https://skyserver.sdss.org/', desc: 'Explore and query one of the largest digital sky surveys — images, spectra and catalogues via SQL.', kind: 'dataset', access: 'Open' },
    { name: 'ESA/ESO/NASA Gaia Archive', org: 'ESA', url: 'https://gea.esac.esa.int/archive/', desc: 'Precise positions, distances and motions for nearly two billion stars from the Gaia mission.', kind: 'dataset', access: 'Open' },
    { name: 'Astropy', org: 'Astropy Project', url: 'https://www.astropy.org/', desc: 'Core open-source Python library for astronomy: coordinates, units, time, FITS files and cosmology calculations.', kind: 'software', access: 'Open' },
    { name: 'WorldWide Telescope', org: 'American Astronomical Society', url: 'https://worldwidetelescope.org/', desc: 'Free virtual telescope and universe explorer combining multi-wavelength imagery into a guided 3D sky.', kind: 'software', access: 'Open' },
    { name: 'MAST Archive', org: 'STScI', url: 'https://mast.stsci.edu/', desc: 'The Mikulski Archive for Space Telescopes — Hubble, JWST, TESS and Kepler data, freely downloadable.', kind: 'dataset', access: 'Open' },
    { name: 'SkyView Virtual Observatory', org: 'NASA HEASARC', url: 'https://skyview.gsfc.nasa.gov/', desc: 'Generate images of any part of the sky across the whole electromagnetic spectrum from archival surveys.', kind: 'api', access: 'Open' },
    { name: 'Zooniverse', org: 'Zooniverse', url: 'https://www.zooniverse.org/', desc: 'Citizen-science platform where anyone can classify galaxies, hunt exoplanets and help real research.', kind: 'community', access: 'Free' },
    { name: 'Celestia', org: 'Celestia Project', url: 'https://celestiaproject.space/', desc: 'Free real-time 3D space simulator that lets you fly through an accurately modeled universe.', kind: 'software', access: 'Open' },
  ],
};

export default DATA;
