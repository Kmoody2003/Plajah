import type { TelaVectorObject } from '../types';
import type { TelaCreativeTemplate } from './telaCreativeEngine';
import { composeStyleEraDocument } from './telaStyleEraComposer';
import { ERA_DESIGNS, ERA_OVERRIDES } from './tela/designs/eras';
import { frame } from './tela/templateKit';
import type { EraCtx } from './tela/designs/types';

export type StyleEraCategory = 'ANCIENT & CLASSICAL' | 'MEDIEVAL–18TH C.' | 'INDUSTRIAL & DECORATIVE' | 'MODERNISM' | 'COUNTERCULTURE' | 'DIGITAL & CONTEMPORARY' | 'GLOBAL DESIGN TRADITIONS';
export type StyleLayout = 'MANUSCRIPT' | 'ORNAMENTAL' | 'GEOMETRIC' | 'GRID' | 'COLLAGE' | 'ORGANIC' | 'EDITORIAL';

export interface TelaStyleEra {
  id: string; name: string; category: StyleEraCategory; period: string; region: string;
  description: string; traits: string[]; typography: string; layout: StyleLayout;
  palette: [string,string,string,string]; tone: TelaCreativeTemplate['tone']; museumPath: string;
  culturalNote?: string;
}

const style = (id:string,name:string,category:StyleEraCategory,period:string,region:string,description:string,traits:string[],typography:string,layout:StyleLayout,palette:[string,string,string,string],tone:TelaStyleEra['tone'],museumPath:string,culturalNote?:string):TelaStyleEra => ({ id,name,category,period,region,description,traits,typography,layout,palette,tone,museumPath,culturalNote });

export const TELA_STYLE_ERAS: TelaStyleEra[] = [
  style('classical','Greco-Roman Classical','ANCIENT & CLASSICAL','c. 800 BCE–500 CE','Mediterranean','Measured proportion, civic clarity, and architectural order.',['symmetry','columns','laurel','proportion'],'Inscriptional capitals with a calm serif text face','GEOMETRIC',['#F3E9D2','#28231D','#A65B36','#C5A66A'],'EDITORIAL','Antiquities · Architecture'),
  style('egyptian-revival','Egyptian Revival','ANCIENT & CLASSICAL','19th–early 20th c. revival','Europe / Americas','Monumental geometry and emphatic framing derived from revived ancient Egyptian forms.',['monumental','sun disc','papyrus rhythm','frontal'],'Wide display capitals and compact sans serif','ORNAMENTAL',['#D7B65B','#172A35','#A13D2D','#F1E3B4'],'BOLD','Ancient Egypt · Architecture'),
  style('roman-mosaic','Roman Mosaic','ANCIENT & CLASSICAL','c. 200 BCE–500 CE','Roman world','Modular tesserae, borders, and image fields translated into a disciplined page system.',['tessellation','border bands','earth pigments'],'Classical serif with small-cap labels','GEOMETRIC',['#E7D2A7','#6D3025','#233D3D','#C48A45'],'EDITORIAL','Antiquities · Decorative Arts'),
  style('byzantine','Byzantine Luminous','MEDIEVAL–18TH C.','c. 330–1453','Eastern Roman world','Luminous fields, centered hierarchy, and jewel-like accents.',['gold field','icons','symmetry','jewel tones'],'Formal serif with generous capitals','MANUSCRIPT',['#C99A2E','#40235A','#173C4A','#F4E8C6'],'BOLD','Medieval Art · Sacred Art'),
  style('insular','Insular Manuscript','MEDIEVAL–18TH C.','c. 600–900','Ireland / Britain','Dense interlace, decorated initials, and patient manuscript rhythm.',['interlace','initial caps','marginal detail'],'Humanist serif with decorated initial','MANUSCRIPT',['#E8D9B6','#243D35','#9A3B2E','#C89432'],'EDITORIAL','Manuscripts · Medieval Art'),
  style('gothic','Gothic Cathedral','MEDIEVAL–18TH C.','c. 1150–1500','Europe','Vertical aspiration, pointed framing, luminous contrast, and intricate structure.',['pointed arch','tracery','verticality','stained glass'],'Blackletter accent with highly readable serif body','MANUSCRIPT',['#14131C','#6E153C','#1C4A68','#D8B55B'],'BOLD','Gothic Art · Architecture'),
  style('renaissance','Renaissance Humanist','MEDIEVAL–18TH C.','c. 1400–1600','Italy / Europe','Human scale, rational perspective, and harmonious classical proportion.',['golden ratio','perspective','humanism','balance'],'Old-style serif with Roman capitals','EDITORIAL',['#EFE3CA','#51352B','#8C3F2B','#6D7651'],'EDITORIAL','Renaissance · Books & Prints'),
  style('baroque','Baroque Dramatic','MEDIEVAL–18TH C.','c. 1600–1750','Europe / Latin America','Theatrical contrast, diagonal energy, depth, and abundant framing.',['chiaroscuro','diagonal','theatrical','ornament'],'High-contrast serif with italic flourishes','ORNAMENTAL',['#160F12','#8C1D2C','#C89B45','#F2E2C4'],'BOLD','Baroque · Painting · Architecture'),
  style('rococo','Rococo Salon','MEDIEVAL–18TH C.','c. 1720–1780','France / Europe','Airy asymmetry, shell-like curves, intimacy, and pastel ornament.',['rocaille','pastel','asymmetry','curves'],'Graceful transitional serif with light italic','ORGANIC',['#F4E3E8','#91B8B1','#D5A85A','#6D536B'],'PLAYFUL','Decorative Arts · Fashion'),
  style('neoclassical','Neoclassical Republic','MEDIEVAL–18TH C.','c. 1750–1850','Europe / Americas','Severe clarity, civic symbolism, and archaeological restraint.',['axis','civic','medallion','restraint'],'Didone display with classical small caps','GEOMETRIC',['#F2EBDD','#1D2935','#A43E35','#B99B62'],'EDITORIAL','Neoclassicism · Civic History'),
  style('victorian','Victorian Broadside','INDUSTRIAL & DECORATIVE','c. 1837–1901','Britain / industrial world','Layered display type, rules, emblems, and information-rich spectacle.',['ornate type','rules','badges','density'],'Mixed slab, serif, and condensed display faces','ORNAMENTAL',['#E8D7B5','#31251E','#8A3034','#C18D32'],'BOLD','Prints · Advertising · Industry'),
  style('arts-crafts','Arts & Crafts','INDUSTRIAL & DECORATIVE','c. 1880–1920','Britain / international','Honest materials, handcraft, botanical structure, and integrated page making.',['handcraft','botanical border','flat pattern'],'Warm humanist serif with hand-cut character','ORGANIC',['#E7DFC4','#345243','#A34E35','#C49A4B'],'EDITORIAL','Decorative Arts · Books'),
  style('art-nouveau','Art Nouveau','INDUSTRIAL & DECORATIVE','c. 1890–1914','Europe / international','Whiplash curves, organic framing, and total-design unity.',['whiplash line','floral','asymmetry','poster'],'Elegant display face with organic terminals','ORGANIC',['#E5DDB9','#315D55','#A76A76','#C49A45'],'PLAYFUL','Posters · Decorative Arts'),
  style('vienna-secession','Vienna Secession','INDUSTRIAL & DECORATIVE','c. 1897–1914','Vienna','Austere geometry meeting gilded, symbolic ornament.',['square grid','gold','symbolism','flatness'],'Geometric capitals with refined serif text','GEOMETRIC',['#F0E8D4','#171717','#B89A45','#6E7A64'],'EDITORIAL','Modern Art · Architecture'),
  style('art-deco','Art Deco','INDUSTRIAL & DECORATIVE','c. 1920–1940','International','Luxurious symmetry, stepped geometry, speed, and machine-age glamour.',['sunburst','stepped form','chrome','symmetry'],'Geometric display capitals with streamlined sans','GEOMETRIC',['#101820','#D4AF37','#F4E8D0','#8C2143'],'BOLD','Decorative Arts · Fashion · Architecture'),
  style('bauhaus','Bauhaus','MODERNISM','1919–1933','Germany','Function-led composition, primary geometry, and workshop clarity.',['primary forms','asymmetry','function','sans serif'],'Geometric sans serif with strong scale contrast','GRID',['#F2EBDD','#171717','#D93A2F','#1E5AA8'],'BOLD','Modern Design · Architecture'),
  style('constructivist','Constructivism','MODERNISM','c. 1915–1935','Russia / USSR','Agitational diagonals, photomontage, and compressed typographic force.',['diagonal','red-black','photomontage','action'],'Heavy condensed sans serif','COLLAGE',['#E8DDC6','#171717','#C9252D','#8B8374'],'BOLD','Posters · Photography'),
  style('de-stijl','De Stijl','MODERNISM','c. 1917–1931','Netherlands','Orthogonal structure and elemental color reduced to relational balance.',['orthogonal','primary color','black rule','asymmetry'],'Neutral geometric sans serif','GRID',['#F6F3E8','#111111','#D72B2B','#1D4E9E'],'MINIMAL','Modern Art · Architecture'),
  style('dada','Dada','COUNTERCULTURE','c. 1916–1924','Europe / New York','Anti-order collage, found typography, chance, and absurd juxtaposition.',['cutout','chance','anti-grid','found type'],'Deliberately clashing type voices','COLLAGE',['#E7DDC8','#191919','#A92C2B','#355E70'],'BOLD','Modern Art · Prints'),
  style('surrealist','Surrealist Editorial','MODERNISM','c. 1924–1950s','International','Dream logic, uncanny scale, and calm spaces interrupted by impossible images.',['dream logic','juxtaposition','uncanny','negative space'],'Elegant serif paired with neutral grotesk','COLLAGE',['#EAE2D1','#252638','#8A3048','#5E7D79'],'EDITORIAL','Modern Art · Photography'),
  style('swiss','International Typographic','MODERNISM','c. 1950–1970','Switzerland / international','Objective hierarchy, modular grids, sans-serif precision, and asymmetric clarity.',['modular grid','flush left','objective','white space'],'Neo-grotesk sans serif','GRID',['#F7F7F3','#161616','#E12D2D','#6B6B66'],'MINIMAL','Graphic Design · Posters'),
  style('midcentury','Mid-century Modern','MODERNISM','c. 1945–1969','International','Optimistic abstraction, warm modern materials, and friendly geometry.',['boomerang','atomic','warm wood','optimism'],'Humanist sans with playful display contrast','GEOMETRIC',['#F2D9A7','#D65A3A','#29726B','#252B35'],'PLAYFUL','Design · Furniture · Architecture'),
  style('space-age','Space Age','MODERNISM','c. 1957–1975','International','Orbital geometry, technological optimism, and streamlined futurity.',['orbit','capsule','star field','chrome'],'Extended geometric sans serif','GEOMETRIC',['#0D1830','#E9EDF2','#EF603B','#55B8C8'],'BOLD','Science · Design · Film'),
  style('psychedelic','Psychedelic Sixties','COUNTERCULTURE','c. 1965–1975','US / UK / international','Optical vibration, liquid lettering, saturation, and altered figure-ground.',['liquid type','op art','saturation','rhythm'],'Warped display lettering with plain body text','ORGANIC',['#351060','#F04B9B','#F7C62F','#27B6A5'],'PLAYFUL','Posters · Music · Counterculture'),
  style('punk','Punk DIY','COUNTERCULTURE','c. 1975–1985','UK / US / international','Urgent photocopy texture, ransom-note disruption, and anti-polish authorship.',['xerox','torn edge','stencil','DIY'],'Cut-and-paste display type with typewriter text','COLLAGE',['#EEE9DB','#111111','#D71920','#74706A'],'BOLD','Music · Zines · Photography'),
  style('new-wave','New Wave Typography','COUNTERCULTURE','c. 1970s–1990s','Europe / US','Elastic grids, layered type, and postmodern typographic expression.',['broken grid','layering','scale shift','color field'],'Experimental sans and serif collisions','COLLAGE',['#F5EAD7','#24203B','#E34877','#1D9CAB'],'PLAYFUL','Graphic Design · Music'),
  style('memphis','Memphis Milano','COUNTERCULTURE','1981–1988','Italy / international','Irreverent pattern, laminate color, and playful anti-good-taste geometry.',['squiggle','laminate','confetti','totem'],'Chunky geometric sans serif','GEOMETRIC',['#F4E36D','#EF5C79','#27A9A1','#32285C'],'PLAYFUL','Design · Furniture'),
  style('grunge','Grunge Editorial','COUNTERCULTURE','c. 1988–1998','US / international','Distressed surfaces, fractured hierarchy, and emotionally charged layering.',['distress','overprint','fracture','noise'],'Weathered display type with sturdy sans body','COLLAGE',['#B7AD91','#171817','#7A2C2A','#445248'],'BOLD','Music · Zines · Photography'),
  style('brutalist','Brutalist Graphic','DIGITAL & CONTEMPORARY','1950s roots / 1990s–present revival','International','Raw structure, exposed systems, oversized type, and deliberate friction.',['raw','monospace','hard border','overscale'],'Grotesk or monospace with extreme scale','GRID',['#F2F0E8','#101010','#0047FF','#FF3B30'],'BOLD','Architecture · Contemporary Design'),
  style('minimalist','Minimalism','MODERNISM','c. 1960–present','International','Reduction, repetition, material presence, and disciplined silence.',['reduction','repetition','space','material'],'Neutral sans or restrained serif','GRID',['#F6F5F0','#171717','#B8B5AE','#9A3E35'],'MINIMAL','Modern & Contemporary Art'),
  style('postmodern','Postmodern Classicism','COUNTERCULTURE','c. 1970–1995','International','Quotation, irony, historical fragments, and plural visual languages.',['quotation','irony','fragment','pluralism'],'Historically referential display with clean body','COLLAGE',['#EBDCC5','#35233D','#C34E62','#3D8791'],'PLAYFUL','Architecture · Design'),
  style('vaporwave','Vaporwave','DIGITAL & CONTEMPORARY','c. 2010s','Internet culture','Nostalgic digital collage, synthetic horizons, and consumer-memory haze.',['gradient','grid horizon','statue','glitch'],'Wide techno sans with spaced capitals','COLLAGE',['#19123A','#F66BC5','#61DCEB','#D8B7FF'],'PLAYFUL','Digital Culture · Music'),
  style('y2k','Y2K Futurism','DIGITAL & CONTEMPORARY','c. 1997–2005','Global popular/digital culture','Chrome optimism, translucent interfaces, bubbles, and compact techno type.',['chrome','bubble','translucent','techno'],'Rounded techno sans serif','GEOMETRIC',['#DDEBFF','#4D68FF','#A7FFEA','#7C3EA5'],'PLAYFUL','Digital Culture · Fashion'),
  style('solarpunk','Solarpunk','DIGITAL & CONTEMPORARY','c. 2010s–present','International speculative culture','Ecological abundance fused with humane technology and civic optimism.',['biophilic','sun','community','clean tech'],'Warm humanist sans with organic serif accent','ORGANIC',['#EFF3D2','#24705A','#F2B84B','#6FAE74'],'PLAYFUL','Science · Architecture · Flora'),
  style('afrofuturist','Afrofuturist Imagination','DIGITAL & CONTEMPORARY','20th c.–present','African diaspora / international','Speculative futures shaped through Black histories, technology, music, and liberation.',['cosmic','ancestral-future','rhythm','technology'],'Expressive display type with precise supporting sans','GEOMETRIC',['#15102B','#6F3CC3','#E6B84A','#18A6A6'],'BOLD','African Diaspora · Music · Science','A diverse intellectual and artistic tradition, not a single ornamental look; ground use in subject and context.'),
  style('harlem','Harlem Renaissance Editorial','GLOBAL DESIGN TRADITIONS','c. 1918–1937','Harlem / African diaspora','Literary modernism, jazz rhythm, portraiture, and New Negro cultural self-definition.',['jazz rhythm','portrait','literary','urban modernity'],'Elegant serif with rhythmic display capitals','EDITORIAL',['#E9D7B0','#2A201D','#9D3A30','#C69C43'],'EDITORIAL','African American History · Literature · Music','Use for historically grounded editorial work; avoid generic “jazz-age” caricature.'),
  style('ukiyoe','Ukiyo-e Print Principles','GLOBAL DESIGN TRADITIONS','Edo period, c. 1603–1868','Japan','Flat color, emphatic contour, cropped viewpoints, and seasonal visual poetry.',['flat color','contour','crop','seasonality'],'Quiet serif or mincho-inspired text rhythm','EDITORIAL',['#E8D8B4','#244C5A','#B94335','#D2A33A'],'EDITORIAL','Asian Art · Prints','Use compositional principles; do not reproduce signatures, actors, sacred symbols, or existing prints.'),
  style('islamic-geometry','Islamic Geometric Design','GLOBAL DESIGN TRADITIONS','8th c.–present','Across diverse Islamic cultures','Generative geometry, repetition, unity, and architectural surface rhythm.',['tessellation','star polygon','repetition','geometry'],'Clear text hierarchy with restrained geometric accents','GEOMETRIC',['#F1E5C8','#155A63','#243B73','#B98A32'],'EDITORIAL','Islamic Art · Architecture','A broad family of traditions. Identify region and period when possible; avoid treating sacred calligraphy as decoration.'),
  style('mughal','Mughal Album Page','GLOBAL DESIGN TRADITIONS','c. 1526–1857','South Asia','Precise borders, intimate image fields, botanical detail, and courtly manuscript refinement.',['border','miniature field','botanical','precision'],'Refined serif with spacious captions','MANUSCRIPT',['#E9D7AE','#315A4B','#9D3A32','#C69A3A'],'EDITORIAL','South Asian Art · Manuscripts','Use page architecture and palette, not copied miniatures or calligraphy.'),
  style('mexican-modern','Mexican Modern Graphic','GLOBAL DESIGN TRADITIONS','c. 1920s–1960s','Mexico','Public-minded modernism joining bold print, mural scale, and vernacular color.',['woodcut force','mural scale','public voice','bold color'],'Strong condensed display with readable serif body','EDITORIAL',['#F0D6A4','#C83A2A','#176B61','#28221F'],'BOLD','Latin American Art · Posters','Ground references in specific artists, workshops, or periods when known.'),
  style('tropical-modern','Tropical Modernism','GLOBAL DESIGN TRADITIONS','c. 1940s–1970s','West Africa / South Asia / Caribbean','Climate-responsive modernism shaped by shade, breeze, civic ambition, and local material intelligence.',['brise-soleil','shade','civic','material'],'Confident modern sans with generous spacing','GRID',['#F0E4C8','#285B55','#D47A32','#273544'],'EDITORIAL','Global Architecture','Treat as multiple regional modernisms, not a single tropical motif.'),
  style('indigenous-contemporary','Indigenous Contemporary Editorial','GLOBAL DESIGN TRADITIONS','Contemporary','Global Indigenous communities','A context-first framework that centers living artists, sovereignty, language, and specific community protocols.',['context','voice','place','continuity'],'Typography selected with community and language needs','EDITORIAL',['#EEE2C9','#2B4038','#A34A32','#54778A'],'EDITORIAL','Indigenous Arts · Living Cultures','Do not use pan-Indigenous motifs. Require a named community, licensed assets, and appropriate cultural permission.'),
];

export const TELA_STYLE_CATEGORIES: StyleEraCategory[] = ['ANCIENT & CLASSICAL','MEDIEVAL–18TH C.','INDUSTRIAL & DECORATIVE','MODERNISM','COUNTERCULTURE','DIGITAL & CONTEMPORARY','GLOBAL DESIGN TRADITIONS'];

export function styleEraAsTemplate(entry: TelaStyleEra): TelaCreativeTemplate {
  return { id:`era_${entry.id}`, name:entry.name, category:'DOCUMENT', width:816, height:1056, palette:[entry.palette[0],entry.palette[1],entry.palette[2]], tone:entry.tone };
}

/** Era metadata with any designer refinements (palette, typography) applied. */
export function resolveStyleEra(entry: TelaStyleEra): TelaStyleEra {
  const o = ERA_OVERRIDES[entry.id];
  return o ? { ...entry, ...o } : entry;
}

function eraCtx(entry: TelaStyleEra): EraCtx {
  const e = resolveStyleEra(entry);
  const [paper, ink, accent, secondary] = e.palette;
  return { entry: e, W: 816, H: 1056, fr: frame(816, 1056, 64), paper, ink, accent, secondary, seed: [...e.id].reduce((a, c) => a + c.charCodeAt(0), 7) };
}

/** Every page of the era document — hand-designed when a designer exists, else the generic composer. */
export function instantiateStyleEraPages(entry: TelaStyleEra): TelaVectorObject[][] {
  const designer = ERA_DESIGNS[entry.id];
  if (designer) {
    const resolved = resolveStyleEra(entry);
    const pages = designer(eraCtx(entry));
    const firstPage = pages[0];
    if (firstPage) {
      const copy = firstPage.filter(object => object.kind === 'TEXT');
      const historical = copy.find(object => object.text?.toLowerCase().includes(resolved.period.toLowerCase())) || copy[0];
      const museum = copy.find(object => object !== historical && object.text?.toLowerCase().includes(resolved.museumPath.toLowerCase()))
        || copy.find(object => object !== historical);
      if (historical) historical.objectLabel = 'Historical context';
      if (museum) museum.objectLabel = 'Museum path';
    }
    return pages;
  }
  return [composeStyleEraDocument(resolveStyleEra(entry))];
}

/** First page only (legacy callers). */
export function instantiateStyleEraDocument(entry: TelaStyleEra): TelaVectorObject[] {
  return instantiateStyleEraPages(entry)[0];
}
