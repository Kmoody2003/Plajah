/**
 * architectureData.ts
 * ---------------------------------------------------------------------------
 * Curated, accuracy-first data repository for the Architecture discipline in
 * Plajah Academia. This is the backbone of "the best place to learn and
 * experience architecture online" (see docs/PLAJAH_EXPERIENCE_EXPANSION_BLUEPRINT.md
 * Part 5C).
 *
 * Everything here is designed for live Wikipedia / API enrichment: every figure
 * and style carries a real `wikiSlug` (final path segment of
 * en.wikipedia.org/wiki/<slug>). Formulas are KaTeX-ready and verified.
 * URLs point at real, stable references (specs, publishers, archives, tools).
 * ---------------------------------------------------------------------------
 */

import type { MuseumFigure, MuseumHallDef } from '../components/MuseumHall';

/* ===========================================================================
 * 1. ARCHITECT HALLS  (museum wings)
 * ========================================================================= */

export const ARCHITECT_HALLS: MuseumHallDef[] = [
  {
    id: 'ancient',
    label: 'Ancient & Classical',
    blurb: 'From the first named builder to the theorists of Greece and Rome — mass, proportion, and the post-and-lintel world.',
  },
  {
    id: 'medieval',
    label: 'Medieval',
    blurb: 'Byzantine domes, Romanesque mass, and the soaring Gothic cathedral born of the pointed arch and flying buttress.',
  },
  {
    id: 'renaissance',
    label: 'Renaissance & Baroque',
    blurb: 'Humanist proportion, the rediscovered dome, and the theatrical drama of Baroque space.',
  },
  {
    id: 'modern',
    label: 'Modern',
    blurb: 'Iron, steel and reinforced concrete free the plan and the facade — the machine age of building.',
  },
  {
    id: 'contemporary',
    label: 'Contemporary',
    blurb: 'Computation, sustainability and sculptural form — the digital and global era of architecture.',
  },
];

/* ===========================================================================
 * 2. ARCHITECT FIGURES  (the great architects hall)
 * ========================================================================= */

export const ARCHITECT_FIGURES: MuseumFigure[] = [
  {
    id: 'imhotep',
    name: 'Imhotep',
    wikiSlug: 'Imhotep',
    hall: 'ancient',
    role: 'Architect & polymath',
    era: 'Old Kingdom Egypt',
    nationality: 'Egyptian',
    years: 'fl. c. 2650–2600 BC',
    tagline: 'The first architect known by name',
    works: ['Step Pyramid of Djoser, Saqqara'],
    techniques: ['Dressed-stone (ashlar) masonry', 'Stepped mastaba stacking', 'Engaged columns'],
  },
  {
    id: 'ictinus',
    name: 'Ictinus',
    wikiSlug: 'Ictinus',
    hall: 'ancient',
    role: 'Architect',
    era: 'Classical Greece',
    nationality: 'Greek',
    years: 'fl. 5th century BC',
    tagline: 'Architect of the Parthenon',
    works: ['Parthenon (with Callicrates)', 'Temple of Apollo Epicurius at Bassae'],
    techniques: ['Doric order refinement', 'Optical corrections (entasis, curvature)', 'Modular proportion'],
  },
  {
    id: 'callicrates',
    name: 'Callicrates',
    wikiSlug: 'Callicrates',
    hall: 'ancient',
    role: 'Architect',
    era: 'Classical Greece',
    nationality: 'Greek',
    years: 'fl. 5th century BC',
    tagline: 'Builder of the Athenian Acropolis',
    works: ['Parthenon (with Ictinus)', 'Temple of Athena Nike'],
    techniques: ['Ionic and Doric orders', 'Marble post-and-lintel construction'],
  },
  {
    id: 'vitruvius',
    name: 'Vitruvius',
    wikiSlug: 'Vitruvius',
    hall: 'ancient',
    role: 'Architect & theorist',
    era: 'Roman',
    nationality: 'Roman',
    years: 'c. 80–15 BC',
    tagline: 'Firmitas, utilitas, venustas',
    works: ['De architectura (Ten Books on Architecture)', 'Basilica at Fanum Fortunae'],
    techniques: ['Architectural theory & proportion', 'Roman concrete (opus caementicium)', 'Water and machine engineering'],
  },
  {
    id: 'apollodorus',
    name: 'Apollodorus of Damascus',
    wikiSlug: 'Apollodorus_of_Damascus',
    hall: 'ancient',
    role: 'Architect & engineer',
    era: 'Imperial Rome',
    nationality: 'Greek-Syrian (Roman)',
    years: 'c. 50–130 AD',
    tagline: "Trajan's master builder",
    works: ["Trajan's Forum & Column", "Trajan's Bridge over the Danube", 'Baths of Trajan'],
    techniques: ['Roman concrete vaulting', 'Long-span timber arch bridges', 'Monumental urban planning'],
  },
  {
    id: 'anthemius',
    name: 'Anthemius of Tralles',
    wikiSlug: 'Anthemius_of_Tralles',
    hall: 'medieval',
    role: 'Architect & mathematician',
    era: 'Byzantine',
    nationality: 'Byzantine Greek',
    years: 'c. 474–c. 558 AD',
    tagline: 'Geometer of the Hagia Sophia',
    works: ['Hagia Sophia (with Isidore of Miletus)'],
    techniques: ['Pendentive dome', 'Applied geometry', 'Semi-domes & buttressing'],
  },
  {
    id: 'villard',
    name: 'Villard de Honnecourt',
    wikiSlug: 'Villard_de_Honnecourt',
    hall: 'medieval',
    role: 'Master mason',
    era: 'Gothic',
    nationality: 'French',
    years: 'fl. 13th century',
    tagline: 'Portfolio-keeper of the Gothic lodge',
    works: ['Portfolio (sketchbook), Bibliothèque nationale de France'],
    techniques: ['Gothic geometry & tracing', 'Rib-vault layout', 'Mechanical devices'],
  },
  {
    id: 'brunelleschi',
    name: 'Filippo Brunelleschi',
    wikiSlug: 'Filippo_Brunelleschi',
    hall: 'renaissance',
    role: 'Architect & engineer',
    era: 'Early Renaissance',
    nationality: 'Italian',
    years: '1377–1446',
    tagline: 'The dome that reopened antiquity',
    works: ['Dome of Florence Cathedral', 'Ospedale degli Innocenti', 'Basilica of San Lorenzo'],
    techniques: ['Herringbone brick dome (no centering)', 'Linear perspective', 'Machine and hoist design'],
  },
  {
    id: 'alberti',
    name: 'Leon Battista Alberti',
    wikiSlug: 'Leon_Battista_Alberti',
    hall: 'renaissance',
    role: 'Architect & humanist theorist',
    era: 'Renaissance',
    nationality: 'Italian',
    years: '1404–1472',
    tagline: 'Author of De re aedificatoria',
    works: ['Santa Maria Novella facade', "Basilica of Sant'Andrea, Mantua", 'Tempio Malatestiano'],
    techniques: ['Classical proportion theory', 'Triumphal-arch facades', 'Treatise-driven design'],
  },
  {
    id: 'palladio',
    name: 'Andrea Palladio',
    wikiSlug: 'Andrea_Palladio',
    hall: 'renaissance',
    role: 'Architect & theorist',
    era: 'High Renaissance',
    nationality: 'Italian',
    years: '1508–1580',
    tagline: 'The most influential architect in history',
    works: ['Villa Rotonda', 'San Giorgio Maggiore', 'I quattro libri dell’architettura'],
    techniques: ['Symmetrical villa planning', 'Temple-front portico', 'Harmonic room proportions'],
  },
  {
    id: 'wren',
    name: 'Sir Christopher Wren',
    wikiSlug: 'Christopher_Wren',
    hall: 'renaissance',
    role: 'Architect & scientist',
    era: 'English Baroque',
    nationality: 'English',
    years: '1632–1723',
    tagline: 'Rebuilder of London after the Great Fire',
    works: ["St Paul's Cathedral", 'Royal Naval College, Greenwich', 'Sheldonian Theatre'],
    techniques: ['Triple-shell dome', 'Structural mathematics', 'City-scale reconstruction'],
  },
  {
    id: 'sullivan',
    name: 'Louis Sullivan',
    wikiSlug: 'Louis_Sullivan',
    hall: 'modern',
    role: 'Architect',
    era: 'Chicago School',
    nationality: 'American',
    years: '1856–1924',
    tagline: '"Form follows function"',
    works: ['Wainwright Building', 'Guaranty Building', 'Carson, Pirie, Scott Store'],
    techniques: ['Steel-frame skyscraper expression', 'Organic ornament', 'Tripartite tower composition'],
  },
  {
    id: 'gaudi',
    name: 'Antoni Gaudí',
    wikiSlug: 'Antoni_Gaud%C3%AD',
    hall: 'modern',
    role: 'Architect',
    era: 'Catalan Modernisme / Art Nouveau',
    nationality: 'Spanish (Catalan)',
    years: '1852–1926',
    tagline: 'Geometry drawn from nature',
    works: ['Sagrada Família', 'Casa Batlló', 'Park Güell', 'Casa Milà (La Pedrera)'],
    techniques: ['Catenary / hanging-chain form-finding', 'Ruled-surface geometry', 'Trencadís mosaic'],
  },
  {
    id: 'wright',
    name: 'Frank Lloyd Wright',
    wikiSlug: 'Frank_Lloyd_Wright',
    hall: 'modern',
    role: 'Architect',
    era: 'Organic / Prairie School',
    nationality: 'American',
    years: '1867–1959',
    tagline: 'Organic architecture of the American landscape',
    works: ['Fallingwater', 'Guggenheim Museum, New York', 'Robie House', 'Taliesin'],
    techniques: ['Cantilevered reinforced concrete', 'Open flowing plan', 'Integration with site'],
  },
  {
    id: 'gropius',
    name: 'Walter Gropius',
    wikiSlug: 'Walter_Gropius',
    hall: 'modern',
    role: 'Architect & educator',
    era: 'Bauhaus / International Style',
    nationality: 'German-American',
    years: '1883–1969',
    tagline: 'Founder of the Bauhaus',
    works: ['Bauhaus Dessau', 'Fagus Factory', 'Gropius House'],
    techniques: ['Glass curtain wall', 'Industrialised modular design', 'Art–craft–technology synthesis'],
  },
  {
    id: 'mies',
    name: 'Ludwig Mies van der Rohe',
    wikiSlug: 'Ludwig_Mies_van_der_Rohe',
    hall: 'modern',
    role: 'Architect',
    era: 'International Style',
    nationality: 'German-American',
    years: '1886–1969',
    tagline: '"Less is more"',
    works: ['Barcelona Pavilion', 'Farnsworth House', 'Seagram Building', 'Crown Hall (IIT)'],
    techniques: ['Steel-and-glass curtain wall', 'Universal open space', 'Structural clarity (skin-and-bones)'],
  },
  {
    id: 'lecorbusier',
    name: 'Le Corbusier',
    wikiSlug: 'Le_Corbusier',
    hall: 'modern',
    role: 'Architect & theorist',
    era: 'International Style / Brutalism',
    nationality: 'Swiss-French',
    years: '1887–1965',
    tagline: '"A house is a machine for living in"',
    works: ['Villa Savoye', 'Unité d’Habitation, Marseille', 'Notre-Dame du Haut, Ronchamp', 'Chandigarh Capitol'],
    techniques: ['Five Points of Architecture (pilotis, free plan, free facade, ribbon window, roof garden)', 'Modulor proportion', 'Béton brut (raw concrete)'],
  },
  {
    id: 'kahn',
    name: 'Louis Kahn',
    wikiSlug: 'Louis_Kahn',
    hall: 'modern',
    role: 'Architect',
    era: 'Late Modernism',
    nationality: 'American',
    years: '1901–1974',
    tagline: 'Monumental light and served/servant space',
    works: ['Salk Institute', 'Kimbell Art Museum', 'National Assembly Building of Bangladesh', 'Yale Center for British Art'],
    techniques: ['Served & servant spaces', 'Cycloid concrete shell vaults', 'Monumental daylighting'],
  },
  {
    id: 'niemeyer',
    name: 'Oscar Niemeyer',
    wikiSlug: 'Oscar_Niemeyer',
    hall: 'modern',
    role: 'Architect',
    era: 'Modernism',
    nationality: 'Brazilian',
    years: '1907–2012',
    tagline: 'The sensual curve of Brazilian modernism',
    works: ['Cathedral of Brasília', 'Niterói Contemporary Art Museum', 'Palácio da Alvorada', 'UN Headquarters (contributor)'],
    techniques: ['Sculptural reinforced-concrete shells', 'Free-form curves', 'Slender parabolic supports'],
  },
  {
    id: 'pei',
    name: 'I. M. Pei',
    wikiSlug: 'I._M._Pei',
    hall: 'contemporary',
    role: 'Architect',
    era: 'Modernism / Late Modern',
    nationality: 'Chinese-American',
    years: '1917–2019',
    tagline: 'Geometric clarity in glass and stone',
    works: ['Louvre Pyramid', 'Bank of China Tower, Hong Kong', 'National Gallery of Art East Building', 'Museum of Islamic Art, Doha'],
    techniques: ['Space-frame glazing', 'Precise geometric massing', 'Structural glass detailing'],
  },
  {
    id: 'ando',
    name: 'Tadao Ando',
    wikiSlug: 'Tadao_Ando',
    hall: 'contemporary',
    role: 'Architect',
    era: 'Critical Regionalism / Minimalism',
    nationality: 'Japanese',
    years: 'b. 1941',
    tagline: 'Silence, light, and smooth concrete',
    works: ['Church of the Light', 'Chichu Art Museum', 'Row House (Azuma House)', 'Modern Art Museum of Fort Worth'],
    techniques: ['Fair-faced (smooth) concrete', 'Choreographed natural light', 'Geometric spatial sequence'],
  },
  {
    id: 'piano',
    name: 'Renzo Piano',
    wikiSlug: 'Renzo_Piano',
    hall: 'contemporary',
    role: 'Architect',
    era: 'High-tech / Contemporary',
    nationality: 'Italian',
    years: 'b. 1937',
    tagline: 'Lightness, craft and the expressed structure',
    works: ['Centre Pompidou (with Rogers)', 'The Shard, London', 'Menil Collection', 'Kansai International Airport Terminal'],
    techniques: ['Exposed high-tech structure', 'Lightweight roofs & daylight filtering', 'Refined tectonic detailing'],
  },
  {
    id: 'foster',
    name: 'Norman Foster',
    wikiSlug: 'Norman_Foster,_Baron_Foster_of_Thames_Bank',
    hall: 'contemporary',
    role: 'Architect',
    era: 'High-tech',
    nationality: 'British',
    years: 'b. 1935',
    tagline: 'High-tech engineering as architecture',
    works: ['30 St Mary Axe (The Gherkin)', 'Reichstag dome, Berlin', 'HSBC Building, Hong Kong', 'Apple Park'],
    techniques: ['Diagrid structural systems', 'Environmental / passive design', 'Precision engineered facades'],
  },
  {
    id: 'rogers',
    name: 'Richard Rogers',
    wikiSlug: 'Richard_Rogers',
    hall: 'contemporary',
    role: 'Architect',
    era: 'High-tech',
    nationality: 'British-Italian',
    years: '1933–2021',
    tagline: 'Services and structure turned inside-out',
    works: ['Centre Pompidou (with Piano)', 'Lloyd’s of London building', 'Millennium Dome', 'Madrid–Barajas Terminal 4'],
    techniques: ['Externalised services & structure', 'Legible, colour-coded tectonics', 'Flexible open floorplates'],
  },
  {
    id: 'hadid',
    name: 'Zaha Hadid',
    wikiSlug: 'Zaha_Hadid',
    hall: 'contemporary',
    role: 'Architect',
    era: 'Deconstructivism / Parametricism',
    nationality: 'Iraqi-British',
    years: '1950–2016',
    tagline: 'The queen of the curve',
    works: ['Heydar Aliyev Center', 'MAXXI Museum, Rome', 'London Aquatics Centre', 'Guangzhou Opera House'],
    techniques: ['Parametric fluid geometry', 'Continuous surface forms', 'Computational structural design'],
  },
  {
    id: 'gehry',
    name: 'Frank Gehry',
    wikiSlug: 'Frank_Gehry',
    hall: 'contemporary',
    role: 'Architect',
    era: 'Deconstructivism',
    nationality: 'Canadian-American',
    years: 'b. 1929',
    tagline: 'Sculpture at the scale of a building',
    works: ['Guggenheim Museum Bilbao', 'Walt Disney Concert Hall', 'Dancing House, Prague', 'Fondation Louis Vuitton'],
    techniques: ['Titanium/steel cladding of complex surfaces', 'CATIA digital modelling (Gehry Technologies)', 'Deconstructed, tilted forms'],
  },
  {
    id: 'koolhaas',
    name: 'Rem Koolhaas',
    wikiSlug: 'Rem_Koolhaas',
    hall: 'contemporary',
    role: 'Architect & theorist',
    era: 'Contemporary',
    nationality: 'Dutch',
    years: 'b. 1944',
    tagline: 'Program as the raw material of form',
    works: ['CCTV Headquarters, Beijing', 'Seattle Central Library', 'Casa da Música, Porto', 'Delirious New York (book)'],
    techniques: ['Programmatic diagram-driven design', 'Structural cantilever loops', 'Urban research (OMA/AMO)'],
  },
  {
    id: 'sejima',
    name: 'Kazuyo Sejima',
    wikiSlug: 'Kazuyo_Sejima',
    hall: 'contemporary',
    role: 'Architect (SANAA)',
    era: 'Contemporary Minimalism',
    nationality: 'Japanese',
    years: 'b. 1956',
    tagline: 'Weightless transparency (SANAA)',
    works: ['21st Century Museum of Contemporary Art, Kanazawa', 'Rolex Learning Center, EPFL', 'New Museum, New York', 'Grace Farms'],
    techniques: ['Ultra-thin structure', 'Continuous transparent enclosure', 'Fluid, boundary-less plans'],
  },
  {
    id: 'ingels',
    name: 'Bjarke Ingels',
    wikiSlug: 'Bjarke_Ingels',
    hall: 'contemporary',
    role: 'Architect (BIG)',
    era: 'Contemporary',
    nationality: 'Danish',
    years: 'b. 1974',
    tagline: '"Hedonistic sustainability"',
    works: ['8 House, Copenhagen', 'VIA 57 West, New York', 'CopenHill (Amager Bakke)', 'Mountain Dwellings'],
    techniques: ['Hybrid programmatic massing', 'Sustainable + recreational infrastructure', 'Diagrammatic form generation'],
  },
  {
    id: 'adjaye',
    name: 'David Adjaye',
    wikiSlug: 'David_Adjaye',
    hall: 'contemporary',
    role: 'Architect',
    era: 'Contemporary',
    nationality: 'British-Ghanaian',
    years: 'b. 1966',
    tagline: 'Material, memory and cultural identity',
    works: ['National Museum of African American History and Culture', 'Sugar Hill housing, Harlem', 'Idea Stores, London', 'Ruby City, San Antonio'],
    techniques: ['Bronze / textured facade cladding', 'Culturally referential form', 'Light-modulating enclosures'],
  },
];

/* ===========================================================================
 * 3. ARCHITECTURAL STYLES  (movements, for live Wikipedia enrichment)
 * ========================================================================= */

export interface ArchStyle {
  id: string;
  name: string;
  wikiSlug: string;
  era: string;
  region?: string;
  hallmarks: string[];
  blurb: string;
}

export const ARCH_STYLES: ArchStyle[] = [
  {
    id: 'egyptian',
    name: 'Ancient Egyptian',
    wikiSlug: 'Ancient_Egyptian_architecture',
    era: 'c. 3000–300 BC',
    region: 'Nile Valley',
    hallmarks: ['Massive post-and-lintel stone', 'Battered (sloping) walls', 'Hypostyle halls', 'Pyramids & pylons'],
    blurb: 'Monumental masonry expressing permanence and the divine order of the pharaonic state, built from precisely dressed stone.',
  },
  {
    id: 'greek',
    name: 'Classical Greek',
    wikiSlug: 'Ancient_Greek_architecture',
    era: 'c. 900–100 BC',
    region: 'Greece & Aegean',
    hallmarks: ['Doric, Ionic, Corinthian orders', 'Peristyle temples', 'Entasis & optical refinements', 'Modular proportion'],
    blurb: 'The temple canon of columns, entablature and pediment that defined Western architectural proportion for two millennia.',
  },
  {
    id: 'roman',
    name: 'Roman',
    wikiSlug: 'Ancient_Roman_architecture',
    era: 'c. 300 BC–400 AD',
    region: 'Roman Empire',
    hallmarks: ['The arch, vault and dome', 'Roman concrete', 'Aqueducts & basilicas', 'Engineered urban infrastructure'],
    blurb: 'Concrete, the arch and the dome let Rome span vast interior spaces — the Pantheon, aqueducts and basilicas of an empire.',
  },
  {
    id: 'byzantine',
    name: 'Byzantine',
    wikiSlug: 'Byzantine_architecture',
    era: 'c. 330–1450 AD',
    region: 'Eastern Mediterranean',
    hallmarks: ['Pendentive domes', 'Central plan', 'Gold mosaics', 'Massive brick masonry'],
    blurb: 'The pendentive let a round dome rest on a square plan, producing the floating, light-filled interior of the Hagia Sophia.',
  },
  {
    id: 'romanesque',
    name: 'Romanesque',
    wikiSlug: 'Romanesque_architecture',
    era: 'c. 1000–1150 AD',
    region: 'Western Europe',
    hallmarks: ['Rounded arches', 'Thick walls & small windows', 'Barrel & groin vaults', 'Sturdy piers'],
    blurb: 'Heavy, fortress-like churches whose thick walls and rounded arches carried the loads before the Gothic revolution in stone.',
  },
  {
    id: 'gothic',
    name: 'Gothic',
    wikiSlug: 'Gothic_architecture',
    era: 'c. 1140–1500 AD',
    region: 'Western Europe',
    hallmarks: ['Pointed arch', 'Ribbed vault', 'Flying buttress', 'Stained-glass curtain walls'],
    blurb: 'The pointed arch, rib vault and flying buttress redirected loads outward, dissolving walls into glass and soaring height.',
  },
  {
    id: 'renaissance',
    name: 'Renaissance',
    wikiSlug: 'Renaissance_architecture',
    era: 'c. 1400–1600',
    region: 'Italy → Europe',
    hallmarks: ['Revived classical orders', 'Symmetry & harmonic proportion', 'Domes', 'Central-plan churches'],
    blurb: 'A humanist rebirth of Greco-Roman order, symmetry and mathematical proportion, crowned by Brunelleschi’s Florence dome.',
  },
  {
    id: 'baroque',
    name: 'Baroque',
    wikiSlug: 'Baroque_architecture',
    era: 'c. 1600–1750',
    region: 'Europe & colonies',
    hallmarks: ['Dynamic curved forms', 'Dramatic light & shadow', 'Rich ornament', 'Theatrical space'],
    blurb: 'Movement, drama and emotion in stone — undulating facades, grand staircases and illusionistic ceilings of Counter-Reformation Europe.',
  },
  {
    id: 'neoclassical',
    name: 'Neoclassical',
    wikiSlug: 'Neoclassical_architecture',
    era: 'c. 1750–1850',
    region: 'Europe & Americas',
    hallmarks: ['Restrained classical vocabulary', 'Porticoes & domes', 'Symmetry', 'Civic monumentality'],
    blurb: 'A sober return to Greek and Roman purity, shaping the capitols, museums and civic monuments of the Enlightenment age.',
  },
  {
    id: 'beaux-arts',
    name: 'Beaux-Arts',
    wikiSlug: 'Beaux-Arts_architecture',
    era: 'c. 1830–1920',
    region: 'France & USA',
    hallmarks: ['Grand axial planning', 'Classical & Renaissance blend', 'Sculptural ornament', 'Monumental scale'],
    blurb: 'The academic grand manner of the École des Beaux-Arts — axial symmetry and lavish classicism for railway stations and civic palaces.',
  },
  {
    id: 'art-nouveau',
    name: 'Art Nouveau',
    wikiSlug: 'Art_Nouveau',
    era: 'c. 1890–1910',
    region: 'Europe',
    hallmarks: ['Organic whiplash curves', 'Nature-derived ornament', 'Iron & glass', 'Total design (Gesamtkunstwerk)'],
    blurb: 'Sinuous, nature-inspired ornament in wrought iron and glass, uniting building, furniture and detail into one flowing artwork.',
  },
  {
    id: 'art-deco',
    name: 'Art Deco',
    wikiSlug: 'Art_Deco',
    era: 'c. 1920–1940',
    region: 'Worldwide',
    hallmarks: ['Geometric setbacks', 'Streamlined verticality', 'Rich materials & motifs', 'Machine-age glamour'],
    blurb: 'The glamorous, geometric machine-age style of the interwar skyscraper — bold setbacks, chevrons and metallic sheen.',
  },
  {
    id: 'modernism',
    name: 'Modernism / International Style',
    wikiSlug: 'International_Style',
    era: 'c. 1920–1970',
    region: 'Worldwide',
    hallmarks: ['"Form follows function"', 'Glass curtain walls', 'Open plan & pilotis', 'Rejection of ornament'],
    blurb: 'The machine-age International Style stripped ornament away, celebrating steel frames, glass skins and rational open planning.',
  },
  {
    id: 'bauhaus',
    name: 'Bauhaus',
    wikiSlug: 'Bauhaus',
    era: 'c. 1919–1933',
    region: 'Germany',
    hallmarks: ['Unity of art, craft & industry', 'Functional geometric form', 'Industrial materials', 'Rational modularity'],
    blurb: 'The German school that fused art, craft and industrial technology into a functionalist design language that reshaped modern architecture.',
  },
  {
    id: 'brutalism',
    name: 'Brutalism',
    wikiSlug: 'Brutalist_architecture',
    era: 'c. 1950–1980',
    region: 'Worldwide',
    hallmarks: ['Raw exposed concrete (béton brut)', 'Massive sculptural forms', 'Expressed structure', 'Monumental civic scale'],
    blurb: 'Honest, monumental architecture of raw board-marked concrete — muscular civic buildings that wear their structure openly.',
  },
  {
    id: 'postmodern',
    name: 'Postmodern',
    wikiSlug: 'Postmodern_architecture',
    era: 'c. 1970–1990',
    region: 'Worldwide',
    hallmarks: ['Historical quotation & irony', 'Ornament reintroduced', 'Colour & symbolism', 'Contextual eclecticism'],
    blurb: 'A witty revolt against modernist austerity, reintroducing ornament, colour, historical reference and "complexity and contradiction."',
  },
  {
    id: 'deconstructivism',
    name: 'Deconstructivism',
    wikiSlug: 'Deconstructivism',
    era: 'c. 1980–present',
    region: 'Worldwide',
    hallmarks: ['Fragmented, non-rectilinear forms', 'Apparent instability', 'Distorted geometry', 'Rejection of harmony'],
    blurb: 'Fragmentation and controlled chaos — buildings of tilted, colliding planes that appear to defy gravity and orthodox order.',
  },
  {
    id: 'parametric',
    name: 'Parametric / Contemporary',
    wikiSlug: 'Parametricism',
    era: 'c. 2000–present',
    region: 'Worldwide',
    hallmarks: ['Algorithmic / computational design', 'Continuous fluid surfaces', 'Performance-driven form', 'Digital fabrication'],
    blurb: 'Design driven by parameters and code — algorithms generate continuous, optimised forms fabricated by CNC and robotic tools.',
  },
];

/* ===========================================================================
 * 4. ARCHITECTURAL HISTORY  (eras: prehistory → contemporary)
 * ========================================================================= */

export interface ArchEra {
  id: string;
  title: string;
  span: string;
  essay: string;
  keyBuildings: string[];
  developments: string[];
}

export const ARCH_HISTORY: ArchEra[] = [
  {
    id: 'prehistoric',
    title: 'Prehistoric & Neolithic',
    span: 'c. 10,000–3000 BC',
    essay:
      'The first architecture emerged as humans settled: circular huts, megalithic tombs and stone monuments raised without mortar. Post-and-lintel construction and corbelling appear alongside the earliest known planned settlements.',
    keyBuildings: ['Göbekli Tepe', 'Stonehenge', 'Çatalhöyük', 'Newgrange passage tomb'],
    developments: ['Post-and-lintel (trilithon)', 'Corbelled stone', 'Megalithic construction', 'First planned settlements'],
  },
  {
    id: 'ancient',
    title: 'Ancient Civilizations',
    span: 'c. 3000–500 BC',
    essay:
      'Egypt, Mesopotamia and the early river cultures built monumentally in stone and mud-brick to express power and religion. Precise ashlar masonry, ziggurats and pyramids demanded organised labour, surveying and load-bearing mass.',
    keyBuildings: ['Great Pyramid of Giza', 'Step Pyramid of Djoser', 'Ziggurat of Ur', 'Karnak Temple Complex'],
    developments: ['Dressed-stone (ashlar) masonry', 'Battered walls', 'Hypostyle halls', 'Large-scale surveying'],
  },
  {
    id: 'classical',
    title: 'Classical Antiquity',
    span: 'c. 800 BC–500 AD',
    essay:
      'Greece perfected the column-and-lintel temple and codified the classical orders and proportion. Rome then industrialised construction with concrete, the true arch, the vault and the dome, spanning unprecedented interior space.',
    keyBuildings: ['Parthenon', 'Pantheon, Rome', 'Colosseum', 'Pont du Gard aqueduct'],
    developments: ['Classical orders & proportion', 'The true (semicircular) arch', 'Barrel & groin vaults', 'Roman concrete and the dome'],
  },
  {
    id: 'medieval',
    title: 'Medieval',
    span: 'c. 500–1400',
    essay:
      'Byzantine builders floated domes on pendentives, while the West moved from heavy Romanesque mass to the Gothic. The pointed arch, ribbed vault and flying buttress channelled loads efficiently, dissolving walls into stained glass.',
    keyBuildings: ['Hagia Sophia', 'Chartres Cathedral', 'Notre-Dame de Paris', 'Durham Cathedral'],
    developments: ['Pendentive dome', 'Pointed arch', 'Ribbed vault', 'Flying buttress'],
  },
  {
    id: 'renaissance',
    title: 'Renaissance',
    span: 'c. 1400–1600',
    essay:
      'A humanist rebirth of classical antiquity restored symmetry, the orders and mathematical proportion. Brunelleschi’s Florence dome and the treatises of Alberti and Palladio made architecture a learned, theorised discipline.',
    keyBuildings: ['Florence Cathedral dome', "St Peter's Basilica", 'Villa Rotonda', 'Tempietto, Rome'],
    developments: ['Revived classical orders', 'Linear perspective', 'Self-supporting masonry domes', 'Architectural treatises'],
  },
  {
    id: 'baroque',
    title: 'Baroque & Neoclassical',
    span: 'c. 1600–1850',
    essay:
      'The Baroque dramatised space with curves, light and rich ornament for church and monarchy, before Neoclassicism returned to sober Greco-Roman purity. Advances in geometry and stereotomy enabled ever more complex vaults and domes.',
    keyBuildings: ["St Paul's Cathedral", 'Palace of Versailles', 'Panthéon, Paris', 'US Capitol'],
    developments: ['Complex curved geometry & stereotomy', 'Multi-shell domes', 'Grand axial planning', 'Scientific structural analysis'],
  },
  {
    id: 'industrial',
    title: 'Industrial Revolution',
    span: 'c. 1850–1900',
    essay:
      'Cast iron, wrought iron and plate glass, mass-produced by industry, enabled vast column-free halls, exhibition palaces and the first tall buildings. The steel frame, elevator and reinforced concrete set the stage for the skyscraper.',
    keyBuildings: ['Crystal Palace', 'Eiffel Tower', 'Home Insurance Building (Chicago)', 'Bibliothèque Sainte-Geneviève'],
    developments: ['Iron & steel framing', 'Plate-glass enclosure', 'The safety elevator', 'Early reinforced concrete'],
  },
  {
    id: 'modern',
    title: 'Modernism',
    span: 'c. 1900–1970',
    essay:
      'Reinforced concrete and the steel curtain wall freed the plan and facade, and modernists rejected ornament for function. The Bauhaus, the International Style and Brutalism defined a machine-age architecture for a mass society.',
    keyBuildings: ['Villa Savoye', 'Seagram Building', 'Fallingwater', 'Bauhaus Dessau'],
    developments: ['Reinforced-concrete frame & free plan', 'Glass curtain wall', 'Pilotis / ribbon windows', 'Prefabrication & modularity'],
  },
  {
    id: 'contemporary',
    title: 'Postmodern & Contemporary',
    span: 'c. 1970–present',
    essay:
      'Postmodernism restored ornament and reference, then deconstructivism and parametricism embraced complex, computer-generated form. Computational design, digital fabrication and sustainability now drive fluid, performance-optimised architecture.',
    keyBuildings: ['Guggenheim Museum Bilbao', 'Heydar Aliyev Center', 'CCTV Headquarters', 'Burj Khalifa'],
    developments: ['Computational / parametric design', 'CNC & robotic fabrication', 'High-performance facades', 'Sustainable / net-zero design'],
  },
];

/* ===========================================================================
 * 5. ARCHITECTURAL & STRUCTURAL FORMULAS  (KaTeX; verified)
 * ========================================================================= */

export interface ArchFormula {
  id: string;
  category: string;
  name: string;
  latex: string;
  variables: { sym: string; name: string; unit?: string }[];
  description: string;
  reference?: string;
}

export const ARCH_FORMULAS: ArchFormula[] = [
  /* --- Statics --------------------------------------------------------- */
  {
    id: 'sum-forces',
    category: 'Statics',
    name: 'Static equilibrium (forces)',
    latex: '\\sum F_x = 0,\\quad \\sum F_y = 0',
    variables: [{ sym: 'F', name: 'Force component', unit: 'N or kN' }],
    description: 'A body is in static equilibrium when the vector sum of all forces in each orthogonal direction is zero.',
    reference: "Newton's first law / statics",
  },
  {
    id: 'sum-moments',
    category: 'Statics',
    name: 'Static equilibrium (moments)',
    latex: '\\sum M = 0',
    variables: [{ sym: 'M', name: 'Moment about a point', unit: 'N·m or kN·m' }],
    description: 'For equilibrium, the sum of moments about any point must also be zero; used to solve support reactions.',
    reference: 'Statics — equilibrium of rigid bodies',
  },
  {
    id: 'reaction-udl-simple',
    category: 'Statics',
    name: 'Reactions, simply-supported UDL',
    latex: 'R_A = R_B = \\dfrac{wL}{2}',
    variables: [
      { sym: 'R', name: 'Support reaction', unit: 'kN' },
      { sym: 'w', name: 'Uniform load per length', unit: 'kN/m' },
      { sym: 'L', name: 'Span', unit: 'm' },
    ],
    description: 'For a simply-supported beam under a uniformly distributed load, each end reaction carries half the total load wL.',
    reference: 'Beam statics',
  },
  /* --- Beams (bending & shear) ---------------------------------------- */
  {
    id: 'mmax-udl-simple',
    category: 'Beams',
    name: 'Max moment — simply-supported UDL',
    latex: 'M_{max} = \\dfrac{wL^2}{8}',
    variables: [
      { sym: 'M_{max}', name: 'Maximum bending moment', unit: 'kN·m' },
      { sym: 'w', name: 'Uniform load per length', unit: 'kN/m' },
      { sym: 'L', name: 'Span', unit: 'm' },
    ],
    description: 'Maximum bending moment at midspan of a simply-supported beam under a uniformly distributed load.',
    reference: 'AISC/standard beam tables',
  },
  {
    id: 'mmax-point-center',
    category: 'Beams',
    name: 'Max moment — simply-supported central point load',
    latex: 'M_{max} = \\dfrac{PL}{4}',
    variables: [
      { sym: 'M_{max}', name: 'Maximum bending moment', unit: 'kN·m' },
      { sym: 'P', name: 'Concentrated load', unit: 'kN' },
      { sym: 'L', name: 'Span', unit: 'm' },
    ],
    description: 'Maximum moment at midspan for a simply-supported beam with a single central point load.',
    reference: 'Standard beam formulas',
  },
  {
    id: 'defl-udl-simple',
    category: 'Beams',
    name: 'Max deflection — simply-supported UDL',
    latex: '\\delta_{max} = \\dfrac{5wL^4}{384EI}',
    variables: [
      { sym: '\\delta_{max}', name: 'Maximum deflection', unit: 'mm' },
      { sym: 'w', name: 'Uniform load per length', unit: 'kN/m' },
      { sym: 'L', name: 'Span', unit: 'm' },
      { sym: 'E', name: 'Modulus of elasticity', unit: 'MPa' },
      { sym: 'I', name: 'Second moment of area', unit: 'mm^4' },
    ],
    description: 'Midspan deflection of a simply-supported beam under a uniformly distributed load.',
    reference: 'Elastic beam theory',
  },
  {
    id: 'defl-point-center',
    category: 'Beams',
    name: 'Max deflection — central point load',
    latex: '\\delta_{max} = \\dfrac{PL^3}{48EI}',
    variables: [
      { sym: '\\delta_{max}', name: 'Maximum deflection', unit: 'mm' },
      { sym: 'P', name: 'Concentrated load', unit: 'kN' },
      { sym: 'L', name: 'Span', unit: 'm' },
      { sym: 'E', name: 'Modulus of elasticity', unit: 'MPa' },
      { sym: 'I', name: 'Second moment of area', unit: 'mm^4' },
    ],
    description: 'Midspan deflection of a simply-supported beam with a single central point load.',
    reference: 'Elastic beam theory',
  },
  {
    id: 'cantilever-moment',
    category: 'Beams',
    name: 'Cantilever — max moment (end point load)',
    latex: 'M_{max} = PL',
    variables: [
      { sym: 'M_{max}', name: 'Maximum bending moment (at fixed end)', unit: 'kN·m' },
      { sym: 'P', name: 'End point load', unit: 'kN' },
      { sym: 'L', name: 'Cantilever length', unit: 'm' },
    ],
    description: 'A cantilever with a point load at its free end develops its maximum moment PL at the fixed support.',
    reference: 'Cantilever beam formulas',
  },
  {
    id: 'cantilever-defl',
    category: 'Beams',
    name: 'Cantilever — end deflection (end point load)',
    latex: '\\delta_{max} = \\dfrac{PL^3}{3EI}',
    variables: [
      { sym: '\\delta_{max}', name: 'Free-end deflection', unit: 'mm' },
      { sym: 'P', name: 'End point load', unit: 'kN' },
      { sym: 'L', name: 'Cantilever length', unit: 'm' },
      { sym: 'E', name: 'Modulus of elasticity', unit: 'MPa' },
      { sym: 'I', name: 'Second moment of area', unit: 'mm^4' },
    ],
    description: 'Tip deflection of a cantilever loaded by a point load at its free end.',
    reference: 'Cantilever beam formulas',
  },
  {
    id: 'flexure',
    category: 'Beams',
    name: 'Flexure formula (bending stress)',
    latex: '\\sigma = \\dfrac{Mc}{I} = \\dfrac{M}{S}',
    variables: [
      { sym: '\\sigma', name: 'Bending stress', unit: 'MPa' },
      { sym: 'M', name: 'Bending moment', unit: 'N·mm' },
      { sym: 'c', name: 'Distance to extreme fibre', unit: 'mm' },
      { sym: 'I', name: 'Second moment of area', unit: 'mm^4' },
      { sym: 'S', name: 'Section modulus (I/c)', unit: 'mm^3' },
    ],
    description: 'Elastic bending stress at a fibre a distance c from the neutral axis; peaks at the extreme fibre.',
    reference: 'Euler–Bernoulli beam theory',
  },
  {
    id: 'transverse-shear',
    category: 'Beams',
    name: 'Transverse shear stress',
    latex: '\\tau = \\dfrac{VQ}{Ib}',
    variables: [
      { sym: '\\tau', name: 'Shear stress', unit: 'MPa' },
      { sym: 'V', name: 'Shear force', unit: 'N' },
      { sym: 'Q', name: 'First moment of area above cut', unit: 'mm^3' },
      { sym: 'I', name: 'Second moment of area', unit: 'mm^4' },
      { sym: 'b', name: 'Width at the cut', unit: 'mm' },
    ],
    description: 'Distribution of shear stress across a beam section under a transverse shear force V.',
    reference: 'Jourawski / shear formula',
  },
  /* --- Sections (geometry) -------------------------------------------- */
  {
    id: 'i-rect',
    category: 'Sections',
    name: 'Second moment of area — rectangle',
    latex: 'I = \\dfrac{bh^3}{12}',
    variables: [
      { sym: 'I', name: 'Second moment of area (about centroid)', unit: 'mm^4' },
      { sym: 'b', name: 'Width', unit: 'mm' },
      { sym: 'h', name: 'Height (in bending direction)', unit: 'mm' },
    ],
    description: 'Second moment of area of a solid rectangle about its centroidal horizontal axis.',
    reference: 'Section properties',
  },
  {
    id: 's-rect',
    category: 'Sections',
    name: 'Section modulus — rectangle',
    latex: 'S = \\dfrac{bh^2}{6}',
    variables: [
      { sym: 'S', name: 'Elastic section modulus', unit: 'mm^3' },
      { sym: 'b', name: 'Width', unit: 'mm' },
      { sym: 'h', name: 'Height', unit: 'mm' },
    ],
    description: 'Elastic section modulus S = I/c of a rectangle, used directly with the flexure formula.',
    reference: 'Section properties',
  },
  {
    id: 'i-circle',
    category: 'Sections',
    name: 'Second moment of area — solid circle',
    latex: 'I = \\dfrac{\\pi d^4}{64}',
    variables: [
      { sym: 'I', name: 'Second moment of area', unit: 'mm^4' },
      { sym: 'd', name: 'Diameter', unit: 'mm' },
    ],
    description: 'Second moment of area of a solid circular section about a centroidal diameter.',
    reference: 'Section properties',
  },
  {
    id: 's-circle',
    category: 'Sections',
    name: 'Section modulus — solid circle',
    latex: 'S = \\dfrac{\\pi d^3}{32}',
    variables: [
      { sym: 'S', name: 'Elastic section modulus', unit: 'mm^3' },
      { sym: 'd', name: 'Diameter', unit: 'mm' },
    ],
    description: 'Elastic section modulus of a solid circular section.',
    reference: 'Section properties',
  },
  {
    id: 'i-ibeam',
    category: 'Sections',
    name: 'Second moment of area — I-section',
    latex: 'I = \\dfrac{BH^3 - bh^3}{12}',
    variables: [
      { sym: 'B', name: 'Overall (flange) width', unit: 'mm' },
      { sym: 'H', name: 'Overall depth', unit: 'mm' },
      { sym: 'b', name: 'B minus web thickness', unit: 'mm' },
      { sym: 'h', name: 'Clear height between flanges', unit: 'mm' },
    ],
    description: 'Second moment of area of a symmetric I-section, taken as the full rectangle minus the two removed side rectangles.',
    reference: 'Section properties (parallel-axis / subtraction)',
  },
  /* --- Columns (buckling) --------------------------------------------- */
  {
    id: 'euler-buckling',
    category: 'Columns',
    name: 'Euler critical buckling load',
    latex: 'P_{cr} = \\dfrac{\\pi^2 EI}{(KL)^2}',
    variables: [
      { sym: 'P_{cr}', name: 'Critical buckling load', unit: 'kN' },
      { sym: 'E', name: 'Modulus of elasticity', unit: 'MPa' },
      { sym: 'I', name: 'Least second moment of area', unit: 'mm^4' },
      { sym: 'K', name: 'Effective-length factor', unit: '–' },
      { sym: 'L', name: 'Unbraced length', unit: 'mm' },
    ],
    description: 'Elastic critical load at which a slender ideal column buckles; K accounts for end restraint (0.5–2.0).',
    reference: 'Euler column theory',
  },
  {
    id: 'slenderness',
    category: 'Columns',
    name: 'Slenderness ratio',
    latex: '\\lambda = \\dfrac{KL}{r},\\quad r = \\sqrt{\\dfrac{I}{A}}',
    variables: [
      { sym: '\\lambda', name: 'Slenderness ratio', unit: '–' },
      { sym: 'K', name: 'Effective-length factor', unit: '–' },
      { sym: 'L', name: 'Unbraced length', unit: 'mm' },
      { sym: 'r', name: 'Radius of gyration', unit: 'mm' },
      { sym: 'I', name: 'Second moment of area', unit: 'mm^4' },
      { sym: 'A', name: 'Cross-sectional area', unit: 'mm^2' },
    ],
    description: 'Slenderness governs buckling mode; higher λ means more slender and buckling-prone.',
    reference: 'Column design',
  },
  {
    id: 'euler-stress',
    category: 'Columns',
    name: 'Euler critical (buckling) stress',
    latex: '\\sigma_{cr} = \\dfrac{\\pi^2 E}{\\lambda^2}',
    variables: [
      { sym: '\\sigma_{cr}', name: 'Critical stress', unit: 'MPa' },
      { sym: 'E', name: 'Modulus of elasticity', unit: 'MPa' },
      { sym: '\\lambda', name: 'Slenderness ratio', unit: '–' },
    ],
    description: 'Euler buckling expressed as a critical stress, obtained by dividing P_cr by the cross-sectional area.',
    reference: 'Euler column theory',
  },
  /* --- Materials ------------------------------------------------------ */
  {
    id: 'hookes-law',
    category: 'Materials',
    name: "Hooke's law (axial)",
    latex: '\\sigma = E\\,\\varepsilon',
    variables: [
      { sym: '\\sigma', name: 'Normal stress', unit: 'MPa' },
      { sym: 'E', name: 'Modulus of elasticity (Young’s modulus)', unit: 'MPa' },
      { sym: '\\varepsilon', name: 'Normal strain', unit: '–' },
    ],
    description: 'In the linear-elastic range, stress is proportional to strain, the constant being Young’s modulus.',
    reference: "Hooke's law",
  },
  {
    id: 'axial-stress',
    category: 'Materials',
    name: 'Axial (normal) stress',
    latex: '\\sigma = \\dfrac{P}{A}',
    variables: [
      { sym: '\\sigma', name: 'Axial stress', unit: 'MPa' },
      { sym: 'P', name: 'Axial force', unit: 'N' },
      { sym: 'A', name: 'Cross-sectional area', unit: 'mm^2' },
    ],
    description: 'Uniform normal stress on a section carrying a centric axial load.',
    reference: 'Mechanics of materials',
  },
  {
    id: 'axial-elongation',
    category: 'Materials',
    name: 'Axial elongation',
    latex: '\\delta = \\dfrac{PL}{AE}',
    variables: [
      { sym: '\\delta', name: 'Elongation', unit: 'mm' },
      { sym: 'P', name: 'Axial force', unit: 'N' },
      { sym: 'L', name: 'Member length', unit: 'mm' },
      { sym: 'A', name: 'Cross-sectional area', unit: 'mm^2' },
      { sym: 'E', name: 'Modulus of elasticity', unit: 'MPa' },
    ],
    description: 'Elastic axial deformation of a prismatic bar under a constant axial force.',
    reference: 'Mechanics of materials',
  },
  {
    id: 'allowable-stress',
    category: 'Materials',
    name: 'Allowable stress (ASD)',
    latex: '\\sigma_{allow} = \\dfrac{\\sigma_y}{FS}',
    variables: [
      { sym: '\\sigma_{allow}', name: 'Allowable stress', unit: 'MPa' },
      { sym: '\\sigma_y', name: 'Yield (or limit) stress', unit: 'MPa' },
      { sym: 'FS', name: 'Factor of safety', unit: '–' },
    ],
    description: 'Allowable-stress design limits working stress to the material limit reduced by a factor of safety.',
    reference: 'Allowable Stress Design (ASD)',
  },
  /* --- Loads ---------------------------------------------------------- */
  {
    id: 'lrfd-combo',
    category: 'Loads',
    name: 'Strength load combination (LRFD)',
    latex: 'U = 1.2D + 1.6L',
    variables: [
      { sym: 'U', name: 'Required (factored) strength', unit: 'kN' },
      { sym: 'D', name: 'Dead load', unit: 'kN' },
      { sym: 'L', name: 'Live load', unit: 'kN' },
    ],
    description: 'A primary ASCE 7 / ACI 318 LRFD combination factoring gravity dead and live loads for strength design.',
    reference: 'ASCE 7 §2.3; ACI 318',
  },
  {
    id: 'asd-combo',
    category: 'Loads',
    name: 'Service load combination (ASD)',
    latex: 'W = D + L',
    variables: [
      { sym: 'W', name: 'Service (unfactored) load', unit: 'kN' },
      { sym: 'D', name: 'Dead load', unit: 'kN' },
      { sym: 'L', name: 'Live load', unit: 'kN' },
    ],
    description: 'A basic allowable-stress-design service combination summing unfactored dead and live loads.',
    reference: 'ASCE 7 §2.4 (ASD)',
  },
  {
    id: 'wind-velocity-pressure',
    category: 'Loads',
    name: 'Wind velocity pressure',
    latex: 'q_z = 0.613\\,K_z K_{zt} K_d K_e V^2',
    variables: [
      { sym: 'q_z', name: 'Velocity pressure', unit: 'N/m^2 (Pa)' },
      { sym: 'K_z', name: 'Velocity-pressure exposure coefficient', unit: '–' },
      { sym: 'K_{zt}', name: 'Topographic factor', unit: '–' },
      { sym: 'K_d', name: 'Wind directionality factor', unit: '–' },
      { sym: 'K_e', name: 'Ground-elevation factor', unit: '–' },
      { sym: 'V', name: 'Basic wind speed', unit: 'm/s' },
    ],
    description: 'ASCE 7 velocity pressure in SI (the 0.613 constant is for SI units); the basis for design wind pressures.',
    reference: 'ASCE 7-16/22 §26.10',
  },
  {
    id: 'seismic-base-shear',
    category: 'Loads',
    name: 'Seismic base shear (ELF)',
    latex: 'V = C_s W',
    variables: [
      { sym: 'V', name: 'Seismic base shear', unit: 'kN' },
      { sym: 'C_s', name: 'Seismic response coefficient', unit: '–' },
      { sym: 'W', name: 'Effective seismic weight', unit: 'kN' },
    ],
    description: 'Equivalent-lateral-force base shear; C_s derives from the design spectral acceleration, R and importance factor.',
    reference: 'ASCE 7 §12.8',
  },
  {
    id: 'seismic-cs',
    category: 'Loads',
    name: 'Seismic response coefficient',
    latex: 'C_s = \\dfrac{S_{DS}}{R/I_e}',
    variables: [
      { sym: 'C_s', name: 'Seismic response coefficient', unit: '–' },
      { sym: 'S_{DS}', name: 'Design spectral acceleration (short period)', unit: 'g' },
      { sym: 'R', name: 'Response modification factor', unit: '–' },
      { sym: 'I_e', name: 'Seismic importance factor', unit: '–' },
    ],
    description: 'Base value of the seismic response coefficient (subject to code minima and maxima) in the ELF procedure.',
    reference: 'ASCE 7 §12.8.1.1',
  },
];

/* ===========================================================================
 * 6. BUILDING CODES & STANDARDS  (specs are licensed → link + summarize)
 * ========================================================================= */

export interface ArchCode {
  name: string;
  org: string;
  scope: string;
  url: string;
  note?: string;
}

export const ARCH_CODES: ArchCode[] = [
  {
    name: 'International Building Code (IBC)',
    org: 'International Code Council (ICC)',
    scope: 'Model code for commercial & multi-family building design, construction and occupancy.',
    url: 'https://codes.iccsafe.org/content/IBC2021P1',
    note: 'Full text is copyrighted; free read-only access on the ICC Digital Codes portal.',
  },
  {
    name: 'International Residential Code (IRC)',
    org: 'International Code Council (ICC)',
    scope: 'Model code for one- and two-family dwellings and townhouses.',
    url: 'https://codes.iccsafe.org/content/IRC2021P1',
    note: 'Free read-only on ICC Digital Codes; purchase for downloadable/commentary editions.',
  },
  {
    name: 'ASCE 7 — Minimum Design Loads',
    org: 'American Society of Civil Engineers (ASCE)',
    scope: 'Dead, live, snow, wind, seismic, flood loads and load combinations for buildings.',
    url: 'https://www.asce.org/standards/asce-7',
    note: 'Standard is licensed; ASCE Hazard Tool (free) supplies mapped wind/seismic/snow values.',
  },
  {
    name: 'ACI 318 — Building Code for Structural Concrete',
    org: 'American Concrete Institute (ACI)',
    scope: 'Design and construction requirements for structural reinforced and prestressed concrete.',
    url: 'https://www.concrete.org/store/productdetail.aspx?ItemID=318U19',
    note: 'Licensed standard; purchase or subscribe via ACI. Cited by the IBC.',
  },
  {
    name: 'AISC 360 — Specification for Structural Steel Buildings',
    org: 'American Institute of Steel Construction (AISC)',
    scope: 'Design of structural steel buildings (ASD & LRFD).',
    url: 'https://www.aisc.org/publications/steel-standards/',
    note: 'Free PDF download of the specification is available from AISC (registration).',
  },
  {
    name: 'NDS — National Design Specification for Wood Construction',
    org: 'American Wood Council (AWC)',
    scope: 'Design of wood members and connections (ASD & LRFD).',
    url: 'https://awc.org/publications/2018-nds/',
    note: 'AWC offers free view-only access to many of its standards online.',
  },
  {
    name: 'Eurocodes (EN 1990–EN 1999)',
    org: 'CEN — European Committee for Standardization',
    scope: 'EN 1990 basis of design; 1991 actions; 1992 concrete; 1993 steel; 1994 composite; 1995 timber; 1996 masonry; 1997 geotech; 1998 seismic; 1999 aluminium.',
    url: 'https://eurocodes.jrc.ec.europa.eu/',
    note: 'Standards are sold by national bodies; the EU JRC Eurocodes site provides free background and guidance.',
  },
  {
    name: 'ADA Standards for Accessible Design',
    org: 'U.S. Department of Justice / U.S. Access Board',
    scope: 'Accessibility requirements for the built environment under the Americans with Disabilities Act.',
    url: 'https://www.ada.gov/law-and-regs/design-standards/2010-stds/',
    note: 'Public and free to read; the 2010 ADA Standards are law in the United States.',
  },
];

/* ===========================================================================
 * 7. ARCHITECTURE / AEC SOFTWARE  (open-source flagged)
 * ========================================================================= */

export interface ArchSoftware {
  name: string;
  category: string;
  oss: boolean;
  url: string;
  desc: string;
}

export const ARCH_SOFTWARE: ArchSoftware[] = [
  {
    name: 'FreeCAD',
    category: 'CAD / BIM',
    oss: true,
    url: 'https://www.freecad.org/',
    desc: 'Open-source parametric 3D CAD modeller with a dedicated BIM (Arch) workbench and IFC support.',
  },
  {
    name: 'Blender',
    category: 'CAD',
    oss: true,
    url: 'https://www.blender.org/',
    desc: 'Open-source 3D modelling, rendering and animation suite; base for the BlenderBIM/Bonsai add-on.',
  },
  {
    name: 'IfcOpenShell',
    category: 'BIM',
    oss: true,
    url: 'https://ifcopenshell.org/',
    desc: 'Open-source toolkit and Python library for reading, writing and processing IFC (openBIM) models.',
  },
  {
    name: 'Speckle',
    category: 'BIM',
    oss: true,
    url: 'https://speckle.systems/',
    desc: 'Open data platform for AEC that connects, versions and streams geometry/data between design tools.',
  },
  {
    name: 'Sverchok',
    category: 'Parametric',
    oss: true,
    url: 'https://github.com/nortikin/sverchok',
    desc: 'Open-source node-based parametric/generative modelling add-on for Blender (a Grasshopper analogue).',
  },
  {
    name: 'Ladybug Tools',
    category: 'Environmental',
    oss: true,
    url: 'https://www.ladybug.tools/',
    desc: 'Open-source environmental design plugins (Ladybug/Honeybee) for daylight, energy and comfort analysis.',
  },
  {
    name: 'Radiance',
    category: 'Environmental',
    oss: true,
    url: 'https://www.radiance-online.org/',
    desc: 'Open-source, validated ray-tracing engine for physically accurate lighting and daylight simulation.',
  },
  {
    name: 'OpenSees',
    category: 'FEA',
    oss: true,
    url: 'https://opensees.berkeley.edu/',
    desc: 'Open-source finite-element framework for nonlinear structural and earthquake engineering simulation.',
  },
  {
    name: 'Code_Aster / Salome-Meca',
    category: 'FEA',
    oss: true,
    url: 'https://www.code-aster.org/',
    desc: 'Open-source general finite-element solver for structural mechanics, packaged with the Salome-Meca platform.',
  },
  {
    name: 'FreeFEM',
    category: 'FEA',
    oss: true,
    url: 'https://freefem.org/',
    desc: 'Open-source PDE solver using the finite-element method with a high-level problem-description language.',
  },
  {
    name: 'Elmer FEM',
    category: 'FEA',
    oss: true,
    url: 'https://www.elmerfem.org/',
    desc: 'Open-source multiphysics finite-element solver (structural, thermal, fluid, electromagnetics).',
  },
  {
    name: 'OpenFOAM',
    category: 'Environmental',
    oss: true,
    url: 'https://www.openfoam.com/',
    desc: 'Open-source CFD toolbox used for wind flow, natural ventilation and pedestrian-comfort studies.',
  },
  {
    name: 'QGIS',
    category: 'GIS',
    oss: true,
    url: 'https://qgis.org/',
    desc: 'Open-source geographic information system for site, terrain and urban-context analysis.',
  },
  {
    name: 'Autodesk Revit',
    category: 'BIM',
    oss: false,
    url: 'https://www.autodesk.com/products/revit/',
    desc: 'Industry-standard proprietary BIM authoring tool for building design, documentation and coordination.',
  },
  {
    name: 'Rhino + Grasshopper',
    category: 'Parametric',
    oss: false,
    url: 'https://www.rhino3d.com/',
    desc: 'Proprietary NURBS modeller with the Grasshopper visual programming environment for parametric design.',
  },
  {
    name: 'SAP2000 / ETABS',
    category: 'FEA',
    oss: false,
    url: 'https://www.csiamerica.com/',
    desc: 'Proprietary CSI structural analysis and design software for general structures and buildings.',
  },
  {
    name: 'Archicad',
    category: 'BIM',
    oss: false,
    url: 'https://graphisoft.com/solutions/archicad',
    desc: 'Proprietary Graphisoft BIM authoring platform, an early and enduring Revit competitor.',
  },
];

/* ===========================================================================
 * 8. DATA / DESIGN APIs  (to power the models)
 * ========================================================================= */

export interface ArchApi {
  name: string;
  url: string;
  desc: string;
  auth: 'None' | 'Free key' | 'OAuth' | 'Paid';
}

export const ARCH_APIS: ArchApi[] = [
  {
    name: 'OpenStreetMap Overpass API',
    url: 'https://overpass-api.de/',
    desc: 'Query building footprints, heights and urban context from OpenStreetMap data.',
    auth: 'None',
  },
  {
    name: 'USGS Seismic Design Web Services',
    url: 'https://earthquake.usgs.gov/ws/designmaps/',
    desc: 'Site-specific ASCE 7 seismic design parameters (S_S, S_1, S_DS, S_D1) by coordinates.',
    auth: 'None',
  },
  {
    name: 'NREL NSRDB (Solar Radiation Data)',
    url: 'https://developer.nrel.gov/docs/solar/nsrdb/',
    desc: 'National Solar Radiation Database — irradiance/weather data for daylighting and energy models.',
    auth: 'Free key',
  },
  {
    name: 'Open-Meteo',
    url: 'https://open-meteo.com/',
    desc: 'Free weather and historical climate API for wind, temperature and solar inputs to environmental models.',
    auth: 'None',
  },
  {
    name: 'Speckle API',
    url: 'https://speckle.guide/dev/',
    desc: 'REST/GraphQL API to send, receive and version AEC geometry and BIM data programmatically.',
    auth: 'OAuth',
  },
  {
    name: 'compute.rhino3d',
    url: 'https://developer.rhino3d.com/guides/compute/',
    desc: 'Cloud geometry engine exposing Rhino/Grasshopper computation and RhinoCommon over HTTP.',
    auth: 'Free key',
  },
  {
    name: 'Autodesk Platform Services (APS/Forge)',
    url: 'https://aps.autodesk.com/',
    desc: 'Cloud APIs for viewing, translating and querying Revit/IFC/CAD models (Model Derivative, Viewer).',
    auth: 'OAuth',
  },
  {
    name: 'buildingSMART IFC / bSDD',
    url: 'https://technical.buildingsmart.org/',
    desc: 'Open IFC schema and the buildingSMART Data Dictionary API for standardized openBIM classification.',
    auth: 'None',
  },
  {
    name: 'Wikidata / Wikipedia REST API',
    url: 'https://www.mediawiki.org/wiki/API:REST_API',
    desc: 'Structured facts, summaries and images for architects, buildings and movements (drives enrichment).',
    auth: 'None',
  },
  {
    name: 'Overture Maps',
    url: 'https://docs.overturemaps.org/',
    desc: 'Open, downloadable global map data including a buildings theme with heights and footprints.',
    auth: 'None',
  },
];

/* ===========================================================================
 * 9. TEXTBOOKS & PRIMARY SOURCES  (free flagged only when a real free URL exists)
 * ========================================================================= */

export interface ArchBook {
  id: string;
  title: string;
  authors: string[];
  year?: string;
  free: boolean;
  url: string;
  desc: string;
  cover?: string;
}

export const ARCH_TEXTBOOKS: ArchBook[] = [
  {
    id: 'vitruvius',
    title: 'The Ten Books on Architecture (De architectura)',
    authors: ['Vitruvius'],
    year: 'c. 15 BC (Morgan tr. 1914)',
    free: true,
    url: 'https://www.gutenberg.org/ebooks/20239',
    desc: 'The only surviving architectural treatise from antiquity; the source of "firmitas, utilitas, venustas." Project Gutenberg, public domain.',
  },
  {
    id: 'alberti',
    title: 'The Ten Books of Architecture (De re aedificatoria)',
    authors: ['Leon Battista Alberti'],
    year: '1452 (Leoni tr.)',
    free: true,
    url: 'https://archive.org/details/tenbooksonarchit00albe',
    desc: 'The first great Renaissance architectural treatise, reviving Vitruvian theory for the humanist age. archive.org, public domain.',
  },
  {
    id: 'palladio',
    title: 'The Four Books of Architecture (I quattro libri dell’architettura)',
    authors: ['Andrea Palladio'],
    year: '1570 (Ware tr. 1738)',
    free: true,
    url: 'https://archive.org/details/fourbooksofarchi00pall',
    desc: 'Palladio’s enormously influential treatise on orders, villas and public buildings. archive.org, public domain.',
  },
  {
    id: 'fletcher',
    title: 'A History of Architecture on the Comparative Method',
    authors: ['Banister Fletcher'],
    year: '1905 (early ed.)',
    free: true,
    url: 'https://archive.org/details/historyofarchite00flet',
    desc: 'The classic comparative survey of world architecture; early editions are public domain on archive.org.',
  },
  {
    id: 'viollet-le-duc',
    title: 'Discourses on Architecture (Entretiens sur l’architecture)',
    authors: ['Eugène Viollet-le-Duc'],
    year: '1863–72 (Bucknall tr.)',
    free: true,
    url: 'https://archive.org/details/discoursesonarch01viol',
    desc: 'The rationalist theory of Gothic structure that shaped modern structural expression. archive.org, public domain.',
  },
  {
    id: 'ruskin',
    title: 'The Seven Lamps of Architecture',
    authors: ['John Ruskin'],
    year: '1849',
    free: true,
    url: 'https://www.gutenberg.org/ebooks/35898',
    desc: 'Ruskin’s influential moral and aesthetic principles for architecture. Project Gutenberg, public domain.',
  },
  {
    id: 'le-corbusier',
    title: 'Toward an Architecture (Vers une architecture)',
    authors: ['Le Corbusier'],
    year: '1923',
    free: false,
    url: 'https://www.getty.edu/publications/virtuallibrary/9780892368228.html',
    desc: 'The manifesto of modern architecture ("a house is a machine for living in"). Getty reissue; publisher link.',
  },
  {
    id: 'venturi',
    title: 'Complexity and Contradiction in Architecture',
    authors: ['Robert Venturi'],
    year: '1966',
    free: false,
    url: 'https://www.moma.org/calendar/exhibitions/history/publication/8',
    desc: 'The founding text of postmodernism ("less is a bore"). MoMA publication; reference link.',
  },
  {
    id: 'ching',
    title: 'Architecture: Form, Space, and Order',
    authors: ['Francis D. K. Ching'],
    year: '1979 (rev. eds.)',
    free: false,
    url: 'https://search.worldcat.org/title/56617386',
    desc: 'The standard illustrated primer on architectural design principles. WorldCat catalogue record.',
  },
  {
    id: 'hibbeler-mechanics',
    title: 'Mechanics of Materials',
    authors: ['R. C. Hibbeler'],
    year: 'multiple eds.',
    free: false,
    url: 'https://search.worldcat.org/title/1015215407',
    desc: 'A widely used engineering text underpinning the structural formulas in this repository. WorldCat record.',
  },
];
