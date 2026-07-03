/**
 * Art Masters — seed data for the MuseumHall engine in the Art Gallery.
 *
 * Portraits + biographies auto-load live from Wikipedia via `wikiSlug`
 * (the last path segment of en.wikipedia.org/wiki/<slug>). We supply only
 * curated facts a Wikipedia blurb won't give you. Slugs are accurate as of
 * curation — verify against the live page if a portrait ever fails to load.
 */

import type { MuseumFigure, MuseumHallDef } from '../components/MuseumHall';

export const ART_MASTER_HALLS: MuseumHallDef[] = [
  { id: 'painters',      label: 'Painters',      blurb: 'From the fresco to the abstract field — the great hands of the brush.' },
  { id: 'photographers', label: 'Photographers', blurb: 'Light written directly — the masters who made the camera an instrument of art.' },
  { id: 'architects',    label: 'Architects',    blurb: 'Space as sculpture, structure as statement — architecture treated as art.' },
  { id: 'sculptors',     label: 'Sculptors',     blurb: 'Form pulled from stone, bronze, and steel — the mastery of three dimensions.' },
];

export const ART_MASTER_FIGURES: MuseumFigure[] = [
  // ── Painters ────────────────────────────────────────────────────────────────
  {
    id: 'da-vinci', name: 'Leonardo da Vinci', wikiSlug: 'Leonardo_da_Vinci', hall: 'painters',
    role: 'Painter', era: 'High Renaissance', nationality: 'Italian', years: '1452–1519',
    tagline: 'The archetype of the Renaissance mind.',
    works: ['Mona Lisa', 'The Last Supper', 'Vitruvian Man', 'Lady with an Ermine'],
    techniques: ['Sfumato — smoke-soft transitions with no visible line', 'Anatomical dissection informing form', 'Aerial perspective'],
  },
  {
    id: 'michelangelo', name: 'Michelangelo', wikiSlug: 'Michelangelo', hall: 'painters',
    role: 'Painter · Sculptor', era: 'High Renaissance', nationality: 'Italian', years: '1475–1564',
    tagline: 'He saw the angel in the marble and carved until he set it free.',
    works: ['Sistine Chapel ceiling', 'The Creation of Adam', 'The Last Judgment'],
    techniques: ['Monumental fresco', 'Terribilità — awe and force in the figure', 'Heroic anatomy'],
  },
  {
    id: 'raphael', name: 'Raphael', wikiSlug: 'Raphael', hall: 'painters',
    role: 'Painter', era: 'High Renaissance', nationality: 'Italian', years: '1483–1520',
    tagline: 'Grace, clarity, and perfect balance.',
    works: ['The School of Athens', 'Sistine Madonna', 'The Transfiguration'],
    techniques: ['Harmonious composition', 'Idealised beauty', 'Mastery of perspective in fresco'],
  },
  {
    id: 'rembrandt', name: 'Rembrandt', wikiSlug: 'Rembrandt', hall: 'painters',
    role: 'Painter', era: 'Dutch Golden Age', nationality: 'Dutch', years: '1606–1669',
    tagline: 'The poet of light and shadow — and of the human face.',
    works: ['The Night Watch', 'Self-Portraits', 'The Anatomy Lesson of Dr. Tulp'],
    techniques: ['Chiaroscuro', 'Impasto — thick, sculptural paint', 'Psychological portraiture'],
  },
  {
    id: 'vermeer', name: 'Johannes Vermeer', wikiSlug: 'Johannes_Vermeer', hall: 'painters',
    role: 'Painter', era: 'Dutch Golden Age', nationality: 'Dutch', years: '1632–1675',
    tagline: 'Quiet rooms lit by a window — and turned to eternity.',
    works: ['Girl with a Pearl Earring', 'The Milkmaid', 'View of Delft'],
    techniques: ['Luminous natural light', 'Pointillé highlights', 'Possible use of the camera obscura'],
  },
  {
    id: 'caravaggio', name: 'Caravaggio', wikiSlug: 'Caravaggio', hall: 'painters',
    role: 'Painter', era: 'Baroque', nationality: 'Italian', years: '1571–1610',
    tagline: 'He dragged the sacred into the street and lit it like theatre.',
    works: ['The Calling of St Matthew', 'Judith Beheading Holofernes', 'Bacchus'],
    techniques: ['Tenebrism — violent light against deep dark', 'Radical realism', 'Direct-from-life painting'],
  },
  {
    id: 'goya', name: 'Francisco Goya', wikiSlug: 'Francisco_Goya', hall: 'painters',
    role: 'Painter', era: 'Romanticism', nationality: 'Spanish', years: '1746–1828',
    tagline: 'Court painter turned prophet of the modern nightmare.',
    works: ['The Third of May 1808', 'Saturn Devouring His Son', 'The Black Paintings'],
    techniques: ['Expressive, loose brushwork', 'Aquatint etching', 'Psychological darkness'],
  },
  {
    id: 'monet', name: 'Claude Monet', wikiSlug: 'Claude_Monet', hall: 'painters',
    role: 'Painter', era: 'Impressionism', nationality: 'French', years: '1840–1926',
    tagline: 'He painted the light, and the thing beneath it dissolved.',
    works: ['Impression, Sunrise', 'Water Lilies', 'Rouen Cathedral series', 'Haystacks'],
    techniques: ['Broken colour', 'Plein-air painting', 'Series studying changing light'],
  },
  {
    id: 'van-gogh', name: 'Vincent van Gogh', wikiSlug: 'Vincent_van_Gogh', hall: 'painters',
    role: 'Painter', era: 'Post-Impressionism', nationality: 'Dutch', years: '1853–1890',
    tagline: 'Feeling made visible in each burning stroke.',
    works: ['The Starry Night', 'Sunflowers', 'The Bedroom', 'Wheatfield with Crows'],
    techniques: ['Expressive impasto', 'Complementary colour tension', 'Rhythmic, directional brushwork'],
  },
  {
    id: 'cezanne', name: 'Paul Cézanne', wikiSlug: 'Paul_Cézanne', hall: 'painters',
    role: 'Painter', era: 'Post-Impressionism', nationality: 'French', years: '1839–1906',
    tagline: 'The father of us all — Picasso and Matisse both said so.',
    works: ['The Card Players', 'Mont Sainte-Victoire series', 'The Basket of Apples'],
    techniques: ['Constructive brushstrokes', 'Reducing nature to cylinder, sphere, cone', 'Shifting perspective'],
  },
  {
    id: 'picasso', name: 'Pablo Picasso', wikiSlug: 'Pablo_Picasso', hall: 'painters',
    role: 'Painter', era: 'Modernism', nationality: 'Spanish', years: '1881–1973',
    tagline: 'He shattered the single viewpoint and rebuilt seeing itself.',
    works: ['Les Demoiselles d’Avignon', 'Guernica', 'The Weeping Woman'],
    techniques: ['Cubism (co-founder)', 'Collage', 'Restless reinvention across periods'],
  },
  {
    id: 'matisse', name: 'Henri Matisse', wikiSlug: 'Henri_Matisse', hall: 'painters',
    role: 'Painter', era: 'Modernism', nationality: 'French', years: '1869–1954',
    tagline: 'Colour as pure, singing feeling.',
    works: ['The Dance', 'The Red Studio', 'The cut-outs (Jazz)'],
    techniques: ['Fauvism — wild, non-natural colour', 'Papiers découpés (paper cut-outs)', 'Flattened, decorative space'],
  },
  {
    id: 'okeeffe', name: 'Georgia O’Keeffe', wikiSlug: 'Georgia_O%27Keeffe', hall: 'painters',
    role: 'Painter', era: 'American Modernism', nationality: 'American', years: '1887–1986',
    tagline: 'The mother of American modernism.',
    works: ['Jimson Weed', 'Black Iris', 'Ram’s Head, White Hollyhock'],
    techniques: ['Magnified natural forms', 'Precise, sensuous abstraction', 'The light of New Mexico'],
  },
  {
    id: 'kahlo', name: 'Frida Kahlo', wikiSlug: 'Frida_Kahlo', hall: 'painters',
    role: 'Painter', era: 'Surrealism', nationality: 'Mexican', years: '1907–1954',
    tagline: 'She painted her own reality — pain, identity, and myth.',
    works: ['The Two Fridas', 'Self-Portrait with Thorn Necklace', 'The Broken Column'],
    techniques: ['Symbolic self-portraiture', 'Mexican folk (retablo) traditions', 'Unflinching autobiography'],
  },
  {
    id: 'dali', name: 'Salvador Dalí', wikiSlug: 'Salvador_Dalí', hall: 'painters',
    role: 'Painter', era: 'Surrealism', nationality: 'Spanish', years: '1904–1989',
    tagline: 'The showman of the unconscious.',
    works: ['The Persistence of Memory', 'The Metamorphosis of Narcissus'],
    techniques: ['Hyper-real dream imagery', 'Paranoiac-critical method', 'Double images'],
  },
  {
    id: 'pollock', name: 'Jackson Pollock', wikiSlug: 'Jackson_Pollock', hall: 'painters',
    role: 'Painter', era: 'Abstract Expressionism', nationality: 'American', years: '1912–1956',
    tagline: 'He took the canvas off the easel and onto the floor.',
    works: ['No. 5, 1948', 'Autumn Rhythm', 'Blue Poles'],
    techniques: ['Drip / action painting', 'All-over composition', 'Gesture as subject'],
  },
  {
    id: 'rothko', name: 'Mark Rothko', wikiSlug: 'Mark_Rothko', hall: 'painters',
    role: 'Painter', era: 'Abstract Expressionism', nationality: 'American', years: '1903–1970',
    tagline: 'Colour fields that ask you to stand still and feel.',
    works: ['No. 61 (Rust and Blue)', 'The Seagram Murals', 'Orange, Red, Yellow'],
    techniques: ['Luminous floating rectangles', 'Thin, layered washes', 'The colour-field sublime'],
  },
  {
    id: 'basquiat', name: 'Jean-Michel Basquiat', wikiSlug: 'Jean-Michel_Basquiat', hall: 'painters',
    role: 'Painter', era: 'Neo-Expressionism', nationality: 'American', years: '1960–1988',
    tagline: 'From the subway wall to the museum — raw, coded, electric.',
    works: ['Untitled (Skull)', 'Dustheads', 'Irony of Negro Policeman'],
    techniques: ['Text-and-image collision', 'Street / graffiti roots (SAMO)', 'Neo-expressionist urgency'],
  },
  {
    id: 'hokusai', name: 'Katsushika Hokusai', wikiSlug: 'Hokusai', hall: 'painters',
    role: 'Painter · Printmaker', era: 'Edo period', nationality: 'Japanese', years: '1760–1849',
    tagline: 'The old man mad about drawing.',
    works: ['The Great Wave off Kanagawa', 'Thirty-six Views of Mount Fuji'],
    techniques: ['Ukiyo-e woodblock printing', 'Dynamic composition', 'Prussian-blue landscapes'],
  },

  // ── Photographers ─────────────────────────────────────────────────────────────
  {
    id: 'ansel-adams', name: 'Ansel Adams', wikiSlug: 'Ansel_Adams', hall: 'photographers',
    role: 'Photographer', era: 'Modernism', nationality: 'American', years: '1902–1984',
    tagline: 'He made the American wilderness monumental.',
    works: ['Moonrise, Hernandez', 'The Tetons and the Snake River', 'Clearing Winter Storm'],
    techniques: ['The Zone System (with Fred Archer)', 'Large-format landscape', 'Rich tonal printing'],
  },
  {
    id: 'dorothea-lange', name: 'Dorothea Lange', wikiSlug: 'Dorothea_Lange', hall: 'photographers',
    role: 'Photographer', era: 'Documentary', nationality: 'American', years: '1895–1965',
    tagline: 'She gave the Great Depression a human face.',
    works: ['Migrant Mother', 'White Angel Breadline', 'FSA archive'],
    techniques: ['Social documentary', 'Empathetic portraiture', 'Field captions as testimony'],
  },
  {
    id: 'cartier-bresson', name: 'Henri Cartier-Bresson', wikiSlug: 'Henri_Cartier-Bresson', hall: 'photographers',
    role: 'Photographer', era: 'Street / Photojournalism', nationality: 'French', years: '1908–2004',
    tagline: 'The eye of the century — the decisive moment.',
    works: ['Behind the Gare Saint-Lazare', 'The founding of Magnum Photos'],
    techniques: ['The decisive moment', 'Leica 35mm candor', 'Geometric composition in real time'],
  },
  {
    id: 'vivian-maier', name: 'Vivian Maier', wikiSlug: 'Vivian_Maier', hall: 'photographers',
    role: 'Photographer', era: 'Street', nationality: 'American', years: '1926–2009',
    tagline: 'A nanny by day, a master of the street — discovered only after her death.',
    works: ['Self-Portraits', 'Chicago & New York street work'],
    techniques: ['Rolleiflex waist-level street portraiture', 'Reflected self-portraits', 'Unpublished lifelong archive'],
  },
  {
    id: 'gordon-parks', name: 'Gordon Parks', wikiSlug: 'Gordon_Parks', hall: 'photographers',
    role: 'Photographer · Filmmaker', era: 'Documentary', nationality: 'American', years: '1912–2006',
    tagline: 'He called the camera his weapon of choice against injustice.',
    works: ['American Gothic, Washington, D.C.', 'A Harlem Family', 'Shaft (film)'],
    techniques: ['Photo-essay for Life magazine', 'Portraiture of race and poverty', 'First Black director of a major studio film'],
  },
  {
    id: 'steve-mccurry', name: 'Steve McCurry', wikiSlug: 'Steve_McCurry', hall: 'photographers',
    role: 'Photographer', era: 'Photojournalism', nationality: 'American', years: 'b. 1950',
    tagline: 'Colour, gaze, and the unforgettable face.',
    works: ['Afghan Girl', 'South and Southeast Asia reportage'],
    techniques: ['Saturated Kodachrome colour', 'Environmental portraiture', 'The direct gaze'],
  },
  {
    id: 'annie-leibovitz', name: 'Annie Leibovitz', wikiSlug: 'Annie_Leibovitz', hall: 'photographers',
    role: 'Photographer', era: 'Contemporary', nationality: 'American', years: 'b. 1949',
    tagline: 'The defining portraitist of modern celebrity.',
    works: ['John & Yoko (Rolling Stone cover)', 'Vanity Fair & Vogue portraits'],
    techniques: ['Elaborate staged portraiture', 'Conceptual narrative set-ups', 'Dramatic lighting'],
  },

  // ── Architects ────────────────────────────────────────────────────────────────
  {
    id: 'gaudi', name: 'Antoni Gaudí', wikiSlug: 'Antoni_Gaudí', hall: 'architects',
    role: 'Architect', era: 'Modernisme', nationality: 'Spanish', years: '1852–1926',
    tagline: 'He built as nature builds — in curves and colour.',
    works: ['Sagrada Família', 'Casa Batlló', 'Park Güell', 'Casa Milà'],
    techniques: ['Catenary / hanging-chain structural models', 'Trencadís mosaic', 'Biomimetic organic form'],
  },
  {
    id: 'frank-lloyd-wright', name: 'Frank Lloyd Wright', wikiSlug: 'Frank_Lloyd_Wright', hall: 'architects',
    role: 'Architect', era: 'Organic / Prairie', nationality: 'American', years: '1867–1959',
    tagline: 'Architecture wedded to its landscape.',
    works: ['Fallingwater', 'Guggenheim Museum', 'Robie House', 'Taliesin'],
    techniques: ['Organic architecture', 'Prairie-style horizontality', 'Open, flowing interior space'],
  },
  {
    id: 'le-corbusier', name: 'Le Corbusier', wikiSlug: 'Le_Corbusier', hall: 'architects',
    role: 'Architect', era: 'Modernism', nationality: 'Swiss-French', years: '1887–1965',
    tagline: 'A house is a machine for living in.',
    works: ['Villa Savoye', 'Notre-Dame du Haut, Ronchamp', 'Unité d’Habitation'],
    techniques: ['The Five Points of Architecture', 'Pilotis & free plan', 'The Modulor proportional system'],
  },
  {
    id: 'mies', name: 'Ludwig Mies van der Rohe', wikiSlug: 'Ludwig_Mies_van_der_Rohe', hall: 'architects',
    role: 'Architect', era: 'International Style', nationality: 'German-American', years: '1886–1969',
    tagline: 'Less is more.',
    works: ['Barcelona Pavilion', 'Farnsworth House', 'Seagram Building'],
    techniques: ['Steel-and-glass minimalism', 'Universal, flexible space', '"God is in the details"'],
  },
  {
    id: 'zaha-hadid', name: 'Zaha Hadid', wikiSlug: 'Zaha_Hadid', hall: 'architects',
    role: 'Architect', era: 'Parametricism / Deconstructivism', nationality: 'Iraqi-British', years: '1950–2016',
    tagline: 'She bent the straight line until buildings seemed to move.',
    works: ['Heydar Aliyev Center', 'MAXXI Museum', 'London Aquatics Centre'],
    techniques: ['Parametric / computational design', 'Fluid, sweeping geometry', 'First woman to win the Pritzker Prize'],
  },

  // ── Sculptors ─────────────────────────────────────────────────────────────────
  {
    id: 'rodin', name: 'Auguste Rodin', wikiSlug: 'Auguste_Rodin', hall: 'sculptors',
    role: 'Sculptor', era: 'Modern', nationality: 'French', years: '1840–1917',
    tagline: 'The father of modern sculpture.',
    works: ['The Thinker', 'The Kiss', 'The Gates of Hell', 'The Burghers of Calais'],
    techniques: ['Expressive, unfinished (non finito) surface', 'Emotional realism', 'The fragment as complete work'],
  },
  {
    id: 'brancusi', name: 'Constantin Brâncuși', wikiSlug: 'Constantin_Brâncuși', hall: 'sculptors',
    role: 'Sculptor', era: 'Modernism', nationality: 'Romanian', years: '1876–1957',
    tagline: 'He carved toward the essence — the pure, distilled form.',
    works: ['Bird in Space', 'The Kiss', 'Endless Column'],
    techniques: ['Radical abstraction / distillation', 'Direct carving', 'Polished, reflective bronze'],
  },
  {
    id: 'henry-moore', name: 'Henry Moore', wikiSlug: 'Henry_Moore', hall: 'sculptors',
    role: 'Sculptor', era: 'Modernism', nationality: 'British', years: '1898–1986',
    tagline: 'He made the void as expressive as the mass.',
    works: ['Reclining Figure series', 'Large Two Forms'],
    techniques: ['The pierced form (holes through the body)', 'Biomorphic abstraction', 'Monumental public bronze'],
  },
  {
    id: 'louise-bourgeois', name: 'Louise Bourgeois', wikiSlug: 'Louise_Bourgeois', hall: 'sculptors',
    role: 'Sculptor', era: 'Contemporary', nationality: 'French-American', years: '1911–2010',
    tagline: 'Memory, the body, and the mother — spun into steel and thread.',
    works: ['Maman (the giant spider)', 'Cells', 'Femme Maison'],
    techniques: ['Psychologically charged installation', 'Diverse materials (bronze, fabric, latex)', 'Autobiographical symbolism'],
  },
];
