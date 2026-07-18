// ─────────────────────────────────────────────────────────────────────────────
// Earth Science discipline data for the Plajah Academia science studio.
// Accuracy-first: every figure carries a real Wikipedia slug (final path segment
// of en.wikipedia.org/wiki/<slug>) so portraits + biographies enrich live at
// runtime. Formulas are KaTeX-ready and verified; tool URLs point at real, free,
// stable surveys, archives and APIs.
// ─────────────────────────────────────────────────────────────────────────────
import type { ScienceDisciplineData } from './types';

const DATA: ScienceDisciplineData = {
  id: 'earth',
  label: 'Earth Science',
  icon: 'Globe',
  accent: '#4CAF50',
  accent2: '#2F9E44',
  tagline: 'The story of a living planet — its rocks, oceans, atmosphere and deep time.',
  heroBlurb:
    'Earth science reads the planet as a set of interacting systems: the shifting plates of the solid Earth, the churning oceans and atmosphere, and the vast reach of geologic time. It explains earthquakes and mountains, climate and rivers, and how a 4.5-billion-year-old world came to be.',
  openStaxSubject: 'earth-science',
  arXivCategory: 'physics.geo-ph',
  arXivQuery: 'geology seismic tectonic climate',
  simulators: [],

  figureHalls: [
    { id: 'geology', label: 'Geology & Deep Time', blurb: 'The naturalists who read the rocks, established that Earth is ancient, and founded the study of strata and fossils.' },
    { id: 'tectonics', label: 'Tectonics & Oceans', blurb: 'Those who found that continents drift and the seafloor spreads — the plate-tectonic revolution.' },
    { id: 'seismology', label: 'Seismology & the Interior', blurb: 'The scientists who used earthquake waves to map the planet\'s hidden core, mantle and crust.' },
    { id: 'atmosphere', label: 'Atmosphere & Climate', blurb: 'Pioneers of meteorology, the carbon cycle and the science of a changing climate.' },
  ],

  figures: [
    // Geology & Deep Time
    {
      id: 'steno', name: 'Nicolas Steno', wikiSlug: 'Nicolas_Steno', hall: 'geology',
      role: 'Geologist & anatomist', era: 'Scientific Revolution', nationality: 'Danish', years: '1638–1686',
      tagline: 'Founder of stratigraphy and modern geology.',
      works: ['Prodromus (1669)', 'Law of superposition', 'Principle of original horizontality'],
      techniques: ['Established that lower rock layers are older', 'Showed fossils are remains of living things', 'Founded the principles of reading rock strata'],
    },
    {
      id: 'hutton', name: 'James Hutton', wikiSlug: 'James_Hutton', hall: 'geology',
      role: 'Geologist', era: 'Enlightenment', nationality: 'Scottish', years: '1726–1797',
      tagline: 'Father of modern geology and deep time.',
      works: ['Theory of the Earth (1788)', 'Uniformitarianism'],
      techniques: ['Argued Earth is shaped by slow, ongoing processes', 'Recognized unconformities as vast time gaps', 'Saw "no vestige of a beginning, no prospect of an end"'],
    },
    {
      id: 'smith', name: 'William Smith', wikiSlug: 'William_Smith_(geologist)', hall: 'geology',
      role: 'Surveyor & geologist', era: 'Early 19th century', nationality: 'English', years: '1769–1839',
      tagline: 'Made the first nationwide geological map.',
      works: ['Geological map of Britain (1815)', 'Principle of faunal succession'],
      techniques: ['Used fossils to correlate rock layers across regions', 'Mapped strata systematically while surveying canals', 'Founded biostratigraphy'],
    },
    {
      id: 'lyell', name: 'Charles Lyell', wikiSlug: 'Charles_Lyell', hall: 'geology',
      role: 'Geologist', era: 'Victorian science', nationality: 'British', years: '1797–1875',
      tagline: 'Codified uniformitarianism for a generation.',
      works: ['Principles of Geology (1830–1833)'],
      techniques: ['Popularized gradual geological change', 'Assembled evidence for an immensely old Earth', 'Influenced Darwin\'s thinking on slow change'],
    },
    {
      id: 'anning', name: 'Mary Anning', wikiSlug: 'Mary_Anning', hall: 'geology',
      role: 'Palaeontologist & fossil collector', era: 'Early 19th century', nationality: 'English', years: '1799–1847',
      tagline: 'Unearthed the fossils that revealed prehistoric life.',
      works: ['First complete Ichthyosaurus skeleton', 'First Plesiosaurus', 'Pterosaur discoveries'],
      techniques: ['Expert excavation of Jurassic marine reptiles', 'Recognized coprolites as fossilized dung', 'Supplied specimens that reshaped palaeontology'],
    },

    // Tectonics & Oceans
    {
      id: 'wegener', name: 'Alfred Wegener', wikiSlug: 'Alfred_Wegener', hall: 'tectonics',
      role: 'Meteorologist & geophysicist', era: 'Early 20th century', nationality: 'German', years: '1880–1930',
      tagline: 'Proposed continental drift.',
      works: ['The Origin of Continents and Oceans (1915)', 'Pangaea hypothesis'],
      techniques: ['Matched coastlines, fossils and rock types across oceans', 'Argued continents move over geologic time', 'Laid the groundwork for plate tectonics'],
    },
    {
      id: 'hess', name: 'Harry Hammond Hess', wikiSlug: 'Harry_Hammond_Hess', hall: 'tectonics',
      role: 'Geologist', era: 'Plate-tectonics revolution', nationality: 'American', years: '1906–1969',
      tagline: 'Proposed seafloor spreading.',
      works: ['History of Ocean Basins (1962)', 'Seafloor-spreading hypothesis'],
      techniques: ['Mapped mid-ocean ridges and deep trenches', 'Proposed new crust forms at ridges and sinks at trenches', 'Provided the mechanism behind continental drift'],
    },
    {
      id: 'tharp', name: 'Marie Tharp', wikiSlug: 'Marie_Tharp', hall: 'tectonics',
      role: 'Geologist & oceanographic cartographer', era: 'Mid-20th century', nationality: 'American', years: '1920–2006',
      tagline: 'Mapped the ocean floor and revealed the Mid-Atlantic Ridge.',
      works: ['Physiographic map of the ocean floor (with Bruce Heezen)', 'Discovery of the mid-ocean rift valley'],
      techniques: ['Converted sonar soundings into physiographic maps', 'Identified the great rift valley along the ridge', 'Her maps helped confirm seafloor spreading'],
    },
    {
      id: 'wilson', name: 'J. Tuzo Wilson', wikiSlug: 'J._Tuzo_Wilson', hall: 'tectonics',
      role: 'Geophysicist', era: 'Plate-tectonics revolution', nationality: 'Canadian', years: '1908–1993',
      tagline: 'Defined transform faults and hotspots.',
      works: ['Transform-fault concept', 'Hotspot theory', 'Wilson cycle'],
      techniques: ['Identified transform plate boundaries', 'Explained volcanic island chains via fixed hotspots', 'Described the opening and closing of ocean basins'],
    },

    // Seismology & the Interior
    {
      id: 'mohorovicic', name: 'Andrija Mohorovičić', wikiSlug: 'Andrija_Mohorovičić', hall: 'seismology',
      role: 'Seismologist & meteorologist', era: 'Early 20th century', nationality: 'Croatian', years: '1857–1936',
      tagline: 'Discovered the crust–mantle boundary.',
      works: ['Discovery of the Mohorovičić discontinuity (1909)'],
      techniques: ['Analysed seismic-wave travel times', 'Found the sharp velocity jump marking the base of the crust', 'The "Moho" is named after him'],
    },
    {
      id: 'lehmann', name: 'Inge Lehmann', wikiSlug: 'Inge_Lehmann', hall: 'seismology',
      role: 'Seismologist', era: '20th century', nationality: 'Danish', years: '1888–1993',
      tagline: 'Discovered Earth\'s solid inner core.',
      works: ['P\' (1936) — evidence for the inner core', 'Lehmann discontinuity'],
      techniques: ['Traced seismic waves reflecting inside the core', 'Showed the inner core is solid within a liquid outer core', 'Refined models of the upper mantle'],
    },
    {
      id: 'richter', name: 'Charles Francis Richter', wikiSlug: 'Charles_Francis_Richter', hall: 'seismology',
      role: 'Seismologist', era: 'Mid-20th century', nationality: 'American', years: '1900–1985',
      tagline: 'Created the earthquake magnitude scale.',
      works: ['Richter magnitude scale (1935)', 'Elementary Seismology'],
      techniques: ['Quantified earthquake size from seismogram amplitude', 'Introduced a logarithmic magnitude scale', 'Co-developed local magnitude with Beno Gutenberg'],
    },
    {
      id: 'gutenberg', name: 'Beno Gutenberg', wikiSlug: 'Beno_Gutenberg', hall: 'seismology',
      role: 'Seismologist', era: 'Early–mid 20th century', nationality: 'German-American', years: '1889–1960',
      tagline: 'Measured the depth of Earth\'s core.',
      works: ['Core–mantle boundary depth', 'Gutenberg–Richter law', 'Studies of deep earthquakes'],
      techniques: ['Located the core–mantle boundary from wave shadows', 'Related earthquake frequency to magnitude', 'Mapped the low-velocity zone in the mantle'],
    },

    // Atmosphere & Climate
    {
      id: 'arrhenius', name: 'Svante Arrhenius', wikiSlug: 'Svante_Arrhenius', hall: 'atmosphere',
      role: 'Physical chemist', era: 'Turn of the 20th century', nationality: 'Swedish', years: '1859–1927',
      tagline: 'First quantified the greenhouse effect of CO₂.',
      works: ['On the Influence of Carbonic Acid in the Air (1896)'],
      techniques: ['Calculated how CO₂ changes affect surface temperature', 'Linked fossil-fuel burning to future warming', 'Pioneered the physics of the carbon–climate link'],
    },
    {
      id: 'milankovic', name: 'Milutin Milanković', wikiSlug: 'Milutin_Milanković', hall: 'atmosphere',
      role: 'Geophysicist & climatologist', era: 'Early 20th century', nationality: 'Serbian', years: '1879–1958',
      tagline: 'Explained the ice ages through orbital cycles.',
      works: ['Milankovitch cycles', 'Canon of Insolation and the Ice-Age Problem'],
      techniques: ['Computed how orbit and tilt vary insolation', 'Linked eccentricity, obliquity and precession to glacial cycles', 'Founded quantitative palaeoclimatology'],
    },
    {
      id: 'keeling', name: 'Charles David Keeling', wikiSlug: 'Charles_David_Keeling', hall: 'atmosphere',
      role: 'Geochemist', era: 'Modern climate science', nationality: 'American', years: '1928–2005',
      tagline: 'Measured the relentless rise of atmospheric CO₂.',
      works: ['Keeling Curve', 'Mauna Loa CO₂ record (from 1958)'],
      techniques: ['Built high-precision CO₂ monitoring', 'Documented the annual carbon cycle and long-term rise', 'Provided the definitive evidence of human-driven CO₂ increase'],
    },
    {
      id: 'bjerknes', name: 'Vilhelm Bjerknes', wikiSlug: 'Vilhelm_Bjerknes', hall: 'atmosphere',
      role: 'Physicist & meteorologist', era: 'Early 20th century', nationality: 'Norwegian', years: '1862–1951',
      tagline: 'Founded numerical weather prediction and frontal theory.',
      works: ['Bergen School of Meteorology', 'Polar-front theory', 'Primitive equations of the atmosphere'],
      techniques: ['Framed weather forecasting as a physics problem', 'Developed the warm/cold front model of cyclones', 'Laid the basis for computer weather models'],
    },
  ],

  concepts: [
    { id: 'plate-tectonics', name: 'Plate Tectonics', blurb: 'Earth\'s rigid outer shell is broken into plates that drift on the mantle; their interactions build mountains, open oceans and drive earthquakes and volcanoes.', wikiSlug: 'Plate_tectonics', tags: ['tectonics', 'geophysics'] },
    { id: 'rock-cycle', name: 'The Rock Cycle', blurb: 'Rocks continually transform among igneous, sedimentary and metamorphic forms through melting, weathering, burial and uplift over geologic time.', wikiSlug: 'Rock_cycle', tags: ['geology'] },
    { id: 'seismology', name: 'Seismology', blurb: 'The study of elastic waves from earthquakes and explosions, used both to understand quakes and to X-ray the planet\'s hidden interior.', wikiSlug: 'Seismology', tags: ['geophysics', 'seismology'] },
    { id: 'deep-time', name: 'Geologic Time', blurb: 'The 4.5-billion-year history of Earth, divided into eons, eras and periods and dated by radioactive decay and the succession of rock strata.', wikiSlug: 'Geologic_time_scale', tags: ['geology', 'dating'] },
    { id: 'climate-system', name: 'The Climate System', blurb: 'The coupled interaction of atmosphere, oceans, ice, land and life that sets Earth\'s climate — and responds to greenhouse gases and orbital forcing.', wikiSlug: 'Climate_system', tags: ['climate', 'atmosphere'] },
    { id: 'hydrology', name: 'The Water Cycle', blurb: 'The continuous movement of water through evaporation, precipitation, runoff and groundwater flow that shapes landscapes and sustains life.', wikiSlug: 'Water_cycle', tags: ['hydrology'] },
    { id: 'weathering', name: 'Weathering & Erosion', blurb: 'The breakdown of rock by water, ice, wind and chemistry, and the transport of sediment that sculpts valleys, deltas and coastlines.', wikiSlug: 'Weathering', tags: ['geology', 'surface'] },
    { id: 'volcanism', name: 'Volcanism & Magma', blurb: 'The rise and eruption of molten rock, building volcanoes and new crust and recycling material between the mantle and surface.', wikiSlug: 'Volcano', tags: ['tectonics', 'geology'] },
    { id: 'ocean-circulation', name: 'Ocean Circulation', blurb: 'Wind-driven surface currents and density-driven deep circulation redistribute heat around the globe and regulate climate.', wikiSlug: 'Ocean_current', tags: ['oceanography', 'climate'] },
    { id: 'carbon-cycle', name: 'The Carbon Cycle', blurb: 'The exchange of carbon among atmosphere, oceans, rocks and living things — the master control on greenhouse warming over short and long timescales.', wikiSlug: 'Carbon_cycle', tags: ['climate', 'geochemistry'] },
    { id: 'mineralogy', name: 'Minerals & Crystals', blurb: 'The naturally occurring inorganic solids, defined by composition and crystal structure, that are the building blocks of all rocks.', wikiSlug: 'Mineral', tags: ['geology'] },
    { id: 'radiometric', name: 'Radiometric Dating', blurb: 'Using the steady decay of radioactive isotopes as a clock to date rocks and fossils, from thousands to billions of years.', wikiSlug: 'Radiometric_dating', tags: ['geology', 'dating'] },
  ],

  eras: [
    {
      id: 'classical', title: 'Classical Ideas of the Earth', span: 'Antiquity–1600',
      essay: 'Greek, Roman, Chinese and Islamic scholars speculated on earthquakes, fossils and the shape of the land. Ideas ranged from Aristotle\'s exhalations to early recognition that seashells on mountains hint at a changing surface.',
      developments: ['Early explanations of earthquakes and volcanoes', 'Recognition of marine fossils on land', 'Islamic scholarship on mineralogy and geology'],
      turningPoints: ['Aristotle\'s Meteorologica', 'Avicenna and Shen Kuo on fossils and strata'],
    },
    {
      id: 'foundations', title: 'Foundations of Geology', span: '1600–1800',
      essay: 'Steno established the principles of stratigraphy, and naturalists began to read Earth\'s history in its rock layers. Hutton argued the planet is shaped by slow processes over unimaginable spans of time.',
      developments: ['Law of superposition and original horizontality', 'Recognition of fossils as former life', 'Uniformitarianism and deep time'],
      turningPoints: ['Steno\'s Prodromus (1669)', 'Hutton\'s Theory of the Earth (1788)'],
    },
    {
      id: 'heroic', title: 'The Heroic Age of Geology', span: '1800–1900',
      essay: 'Geological mapping, the naming of the periods, and fierce debate between catastrophists and uniformitarians defined the century. Fossil discoveries revealed prehistoric worlds, and the geologic column took shape.',
      developments: ['National geological surveys and maps', 'Definition of the geologic periods', 'Palaeontology and the fossil record'],
      turningPoints: ['Smith\'s geological map (1815)', 'Lyell\'s Principles of Geology (1830)'],
    },
    {
      id: 'geophysics', title: 'Probing the Interior', span: '1900–1950',
      essay: 'Seismology turned earthquake waves into a probe of the deep Earth, revealing the crust, mantle and core. Radioactivity gave a clock for dating rocks and finally fixed the planet\'s great age.',
      developments: ['Seismic mapping of the crust, mantle and core', 'Radiometric dating of rocks', 'The earthquake magnitude scale'],
      turningPoints: ['The Mohorovičić discontinuity (1909)', 'Lehmann\'s solid inner core (1936)'],
    },
    {
      id: 'plate-revolution', title: 'The Plate-Tectonic Revolution', span: '1950–1970',
      essay: 'Seafloor mapping, magnetic stripes and earthquake patterns converged into the theory of plate tectonics — a unifying framework that explained continents, oceans, mountains and quakes at once.',
      developments: ['Seafloor spreading', 'Magnetic reversal stripes on the ocean floor', 'Transform faults and the plate model'],
      turningPoints: ['Hess\'s seafloor spreading (1962)', 'Global acceptance of plate tectonics (late 1960s)'],
    },
    {
      id: 'earth-systems', title: 'Earth-System & Climate Science', span: '1950–2000',
      essay: 'Continuous CO₂ monitoring, satellite observation and computer modeling reframed Earth as a coupled system. Evidence mounted that human activity was reshaping the atmosphere and climate.',
      developments: ['The Keeling Curve and carbon monitoring', 'Satellite remote sensing of the planet', 'Coupled climate models', 'Ice-core palaeoclimate records'],
      turningPoints: ['Mauna Loa CO₂ record begins (1958)', 'First comprehensive climate assessments (1990s)'],
    },
    {
      id: 'digital-earth', title: 'The Digital & Observed Earth', span: '2000–present',
      essay: 'Dense sensor networks, GPS geodesy, satellite constellations and big-data modeling now watch the whole planet in near real time — tracking quakes, ice loss, sea level and a warming climate.',
      developments: ['GPS measurement of plate motion and deformation', 'Global satellite Earth observation (e.g. Copernicus)', 'High-resolution climate and hazard modeling', 'Open real-time earthquake and weather data'],
      turningPoints: ['Real-time global seismic and climate monitoring', 'Open-data Earth-observation programmes'],
    },
  ],

  laws: [
    {
      id: 'richter', category: 'Seismology', name: 'Richter (Local) Magnitude',
      latex: 'M_L = \\log_{10} A - \\log_{10} A_0(\\delta)',
      variables: [
        { sym: 'M_L', name: 'Local magnitude' },
        { sym: 'A', name: 'Maximum seismogram amplitude', unit: 'mm' },
        { sym: 'A_0', name: 'Reference amplitude vs. distance', unit: 'mm' },
        { sym: '\\delta', name: 'Epicentral distance', unit: 'km' },
      ],
      description: 'A logarithmic measure of earthquake size from the maximum trace amplitude, corrected for distance — each unit is a 10× larger wave.',
      reference: 'https://en.wikipedia.org/wiki/Richter_magnitude_scale',
    },
    {
      id: 'moment-magnitude', category: 'Seismology', name: 'Moment Magnitude',
      latex: 'M_w = \\tfrac{2}{3}\\log_{10} M_0 - 10.7',
      variables: [
        { sym: 'M_w', name: 'Moment magnitude' },
        { sym: 'M_0', name: 'Seismic moment', unit: 'dyn·cm' },
      ],
      description: 'The modern magnitude scale, tied to the energy released (seismic moment); it does not saturate for the largest earthquakes as the Richter scale does.',
      reference: 'https://en.wikipedia.org/wiki/Moment_magnitude_scale',
    },
    {
      id: 'gutenberg-richter', category: 'Seismology', name: 'Gutenberg–Richter Law',
      latex: '\\log_{10} N = a - bM',
      variables: [
        { sym: 'N', name: 'Number of quakes ≥ magnitude M' },
        { sym: 'M', name: 'Magnitude' },
        { sym: 'a', name: 'Regional seismicity rate' },
        { sym: 'b', name: 'b-value (≈1)' },
      ],
      description: 'The frequency of earthquakes falls off exponentially with magnitude — there are roughly ten times fewer quakes for each unit larger.',
      reference: 'https://en.wikipedia.org/wiki/Gutenberg%E2%80%93Richter_law',
    },
    {
      id: 'darcy', category: 'Hydrology', name: 'Darcy\'s Law',
      latex: 'Q = -KA\\dfrac{dh}{dl}',
      variables: [
        { sym: 'Q', name: 'Volumetric flow rate', unit: 'm³/s' },
        { sym: 'K', name: 'Hydraulic conductivity', unit: 'm/s' },
        { sym: 'A', name: 'Cross-sectional area', unit: 'm²' },
        { sym: 'dh/dl', name: 'Hydraulic gradient' },
      ],
      description: 'Groundwater flows through porous rock at a rate set by the permeability and the slope of the water table — the foundation of hydrogeology.',
      reference: 'https://en.wikipedia.org/wiki/Darcy%27s_law',
    },
    {
      id: 'geothermal', category: 'Geophysics', name: 'Geothermal Gradient',
      latex: 'q = k\\dfrac{dT}{dz}',
      variables: [
        { sym: 'q', name: 'Heat flux', unit: 'W/m²' },
        { sym: 'k', name: 'Thermal conductivity', unit: 'W·m⁻¹·K⁻¹' },
        { sym: 'dT/dz', name: 'Temperature gradient with depth', unit: 'K/m' },
      ],
      description: 'Temperature rises with depth (about 25–30 °C per km in the crust); the heat flowing outward drives mantle convection and plate motion.',
      reference: 'https://en.wikipedia.org/wiki/Geothermal_gradient',
    },
    {
      id: 'radio-decay', category: 'Geochronology', name: 'Radioactive Decay',
      latex: 'N(t) = N_0\\,e^{-\\lambda t}',
      variables: [
        { sym: 'N(t)', name: 'Remaining parent atoms' },
        { sym: 'N_0', name: 'Initial atoms' },
        { sym: '\\lambda', name: 'Decay constant', unit: 's⁻¹' },
        { sym: 't', name: 'Time', unit: 's' },
      ],
      description: 'Radioactive isotopes decay at a fixed rate, providing the clock that dates rocks and minerals from thousands to billions of years old.',
      reference: 'https://en.wikipedia.org/wiki/Radioactive_decay',
    },
    {
      id: 'snell-seismic', category: 'Seismology', name: 'Snell\'s Law (Seismic Refraction)',
      latex: '\\dfrac{\\sin\\theta_1}{v_1} = \\dfrac{\\sin\\theta_2}{v_2}',
      variables: [
        { sym: '\\theta_1, \\theta_2', name: 'Incidence and refraction angles' },
        { sym: 'v_1, v_2', name: 'Seismic velocities in each layer', unit: 'm/s' },
      ],
      description: 'Seismic waves bend at layer boundaries according to the velocity change — the principle used to image the crust and locate the Moho.',
      reference: 'https://en.wikipedia.org/wiki/Seismic_refraction',
    },
    {
      id: 'barometric', category: 'Atmosphere', name: 'Barometric (Hypsometric) Formula',
      latex: 'P = P_0\\,e^{-\\frac{Mgh}{RT}}',
      variables: [
        { sym: 'P', name: 'Pressure at height h', unit: 'Pa' },
        { sym: 'P_0', name: 'Sea-level pressure', unit: 'Pa' },
        { sym: 'M', name: 'Molar mass of air', unit: 'kg/mol' },
        { sym: 'h', name: 'Altitude', unit: 'm' },
        { sym: 'T', name: 'Temperature', unit: 'K' },
      ],
      description: 'Atmospheric pressure falls off roughly exponentially with altitude — the basis of altimetry and atmospheric structure.',
      reference: 'https://en.wikipedia.org/wiki/Barometric_formula',
    },
    {
      id: 'lapse-rate', category: 'Atmosphere', name: 'Dry Adiabatic Lapse Rate',
      latex: '\\Gamma_d = \\dfrac{g}{c_p} \\approx 9.8\\ \\text{°C/km}',
      variables: [
        { sym: '\\Gamma_d', name: 'Dry adiabatic lapse rate', unit: '°C/km' },
        { sym: 'g', name: 'Gravitational acceleration', unit: 'm/s²' },
        { sym: 'c_p', name: 'Specific heat at constant pressure', unit: 'J·kg⁻¹·K⁻¹' },
      ],
      description: 'The rate at which a rising, dry air parcel cools as it expands — a key control on cloud formation and atmospheric stability.',
      reference: 'https://en.wikipedia.org/wiki/Lapse_rate',
    },
    {
      id: 'clausius-clapeyron', category: 'Atmosphere', name: 'Clausius–Clapeyron Relation',
      latex: '\\dfrac{dP}{dT} = \\dfrac{L}{T\\,\\Delta v}',
      variables: [
        { sym: 'P', name: 'Saturation vapour pressure', unit: 'Pa' },
        { sym: 'T', name: 'Temperature', unit: 'K' },
        { sym: 'L', name: 'Latent heat', unit: 'J/kg' },
        { sym: '\\Delta v', name: 'Change in specific volume', unit: 'm³/kg' },
      ],
      description: 'How much water vapour the air can hold rises steeply with temperature (~7% per °C) — why a warmer climate carries more moisture and heavier rain.',
      reference: 'https://en.wikipedia.org/wiki/Clausius%E2%80%93Clapeyron_relation',
    },
    {
      id: 'coriolis', category: 'Geophysics', name: 'Coriolis Parameter',
      latex: 'f = 2\\Omega\\sin\\varphi',
      variables: [
        { sym: 'f', name: 'Coriolis parameter', unit: 's⁻¹' },
        { sym: '\\Omega', name: 'Earth\'s rotation rate', unit: 'rad/s' },
        { sym: '\\varphi', name: 'Latitude', unit: '°' },
      ],
      description: 'Earth\'s rotation deflects moving air and water, setting the spin of cyclones and the direction of ocean gyres — strongest at the poles, zero at the equator.',
      reference: 'https://en.wikipedia.org/wiki/Coriolis_frequency',
    },
    {
      id: 'planetary-temp', category: 'Climate', name: 'Planetary Equilibrium Temperature',
      latex: 'T_{eq} = \\left[\\dfrac{S(1-\\alpha)}{4\\sigma}\\right]^{1/4}',
      variables: [
        { sym: 'T_{eq}', name: 'Equilibrium temperature', unit: 'K' },
        { sym: 'S', name: 'Solar flux', unit: 'W/m²' },
        { sym: '\\alpha', name: 'Albedo (reflectivity)' },
        { sym: '\\sigma', name: 'Stefan–Boltzmann constant', unit: 'W·m⁻²·K⁻⁴' },
      ],
      description: 'The temperature a planet would have from sunlight alone; Earth is warmer than this baseline because the greenhouse effect traps outgoing heat.',
      reference: 'https://en.wikipedia.org/wiki/Planetary_equilibrium_temperature',
    },
    {
      id: 'stokes', category: 'Sedimentology', name: 'Stokes\' Law (Settling Velocity)',
      latex: 'v = \\dfrac{2(\\rho_p - \\rho_f)g\\,r^2}{9\\mu}',
      variables: [
        { sym: 'v', name: 'Settling velocity', unit: 'm/s' },
        { sym: '\\rho_p, \\rho_f', name: 'Particle and fluid density', unit: 'kg/m³' },
        { sym: 'r', name: 'Particle radius', unit: 'm' },
        { sym: '\\mu', name: 'Fluid viscosity', unit: 'Pa·s' },
      ],
      description: 'How fast a sediment grain sinks through water — the physics that sorts sediments by size and builds layered deposits.',
      reference: 'https://en.wikipedia.org/wiki/Stokes%27_law',
    },
    {
      id: 'manning', category: 'Hydrology', name: 'Manning\'s Equation',
      latex: 'v = \\dfrac{1}{n}R_h^{2/3}\\,S^{1/2}',
      variables: [
        { sym: 'v', name: 'Flow velocity', unit: 'm/s' },
        { sym: 'n', name: 'Manning roughness coefficient' },
        { sym: 'R_h', name: 'Hydraulic radius', unit: 'm' },
        { sym: 'S', name: 'Channel slope' },
      ],
      description: 'Predicts the speed of water in a river or open channel from its roughness, geometry and slope — a staple of flood and drainage engineering.',
      reference: 'https://en.wikipedia.org/wiki/Manning_formula',
    },
    {
      id: 'wave-speed', category: 'Oceanography', name: 'Shallow-Water Wave Speed',
      latex: 'c = \\sqrt{g\\,d}',
      variables: [
        { sym: 'c', name: 'Wave speed', unit: 'm/s' },
        { sym: 'g', name: 'Gravitational acceleration', unit: 'm/s²' },
        { sym: 'd', name: 'Water depth', unit: 'm' },
      ],
      description: 'In water shallow relative to wavelength, wave speed depends only on depth — why tsunamis race across deep oceans and slow and pile up near shore.',
      reference: 'https://en.wikipedia.org/wiki/Waves_and_shallow_water',
    },
    {
      id: 'steno-superposition', category: 'Stratigraphy', name: 'Law of Superposition',
      latex: '\\text{age}(\\text{lower layer}) > \\text{age}(\\text{upper layer})',
      variables: [
        { sym: '\\text{layer}', name: 'A sedimentary stratum' },
      ],
      description: 'In an undisturbed sequence of sedimentary rocks, each layer is older than the one above it — the founding principle for reading geologic history.',
      reference: 'https://en.wikipedia.org/wiki/Law_of_superposition',
    },
  ],

  tools: [
    { name: 'USGS Earthquake Catalog API', org: 'U.S. Geological Survey', url: 'https://earthquake.usgs.gov/fdsnws/event/1/', desc: 'Real-time and historical earthquake data (magnitude, location, depth) via a free FDSN web service and GeoJSON feeds.', kind: 'api', access: 'Open' },
    { name: 'USGS EarthExplorer', org: 'U.S. Geological Survey', url: 'https://earthexplorer.usgs.gov/', desc: 'Free portal for Landsat and other satellite imagery, aerial photos and elevation data going back decades.', kind: 'dataset', access: 'Free' },
    { name: 'NOAA Climate Data Online', org: 'NOAA', url: 'https://www.ncdc.noaa.gov/cdo-web/', desc: 'Free access to weather and climate records — temperature, precipitation and station data with an API.', kind: 'api', access: 'Free key' },
    { name: 'Copernicus Open Access Hub', org: 'ESA / EU', url: 'https://dataspace.copernicus.eu/', desc: 'Free Sentinel satellite imagery and Earth-observation data for land, ocean, atmosphere and climate.', kind: 'dataset', access: 'Open' },
    { name: 'GeoMapApp', org: 'Lamont-Doherty / Marine Geoscience Data System', url: 'https://www.geomapapp.org/', desc: 'Free map-based tool for exploring global bathymetry, geology, earthquakes and marine geoscience data.', kind: 'software', access: 'Open' },
    { name: 'NASA Worldview', org: 'NASA EOSDIS', url: 'https://worldview.earthdata.nasa.gov/', desc: 'Browse near-real-time full-resolution satellite imagery of the whole Earth, layer by layer and day by day.', kind: 'software', access: 'Open' },
    { name: 'Macrostrat', org: 'University of Wisconsin', url: 'https://macrostrat.org/', desc: 'Open geologic map and stratigraphic database with an API, linking rock units, ages and fossils worldwide.', kind: 'api', access: 'Open' },
    { name: 'Mindat', org: 'Hudson Institute of Mineralogy', url: 'https://www.mindat.org/', desc: 'The largest open mineralogy and locality database, cataloguing minerals, their properties and where they are found.', kind: 'dataset', access: 'Open' },
    { name: 'IRIS / EarthScope Data', org: 'EarthScope Consortium', url: 'https://www.iris.edu/hq/', desc: 'Global seismological data, tools and educational resources including live seismic waveforms and station networks.', kind: 'dataset', access: 'Open' },
    { name: 'NOAA Global Monitoring (CO₂)', org: 'NOAA GML', url: 'https://gml.noaa.gov/ccgg/trends/', desc: 'The Mauna Loa CO₂ record (Keeling Curve) and global greenhouse-gas trends, freely downloadable.', kind: 'dataset', access: 'Open' },
    { name: 'Google Earth Engine', org: 'Google', url: 'https://earthengine.google.com/', desc: 'Cloud platform for planetary-scale analysis of satellite imagery and geospatial datasets; free for research and education.', kind: 'software', access: 'Free' },
    { name: 'PANGAEA Data Repository', org: 'AWI / MARUM', url: 'https://www.pangaea.de/', desc: 'Open archive of earth and environmental science datasets, from ice cores to ocean drilling records.', kind: 'dataset', access: 'Open' },
  ],
};

export default DATA;
