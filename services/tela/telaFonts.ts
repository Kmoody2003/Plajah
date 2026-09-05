// telaFonts — the typographic palette behind Tela templates.
//
// Every template names fonts by KEY, never by raw family string, so the
// gallery can load exactly the Google Fonts a design needs (once, on demand),
// the canvas measurer gets a concrete stack, and Fabula lower thirds can reuse
// the same pairings. All fonts here are open-licensed (OFL/Apache) so templates
// ship without licensing debt.

export type FontClass = 'serif' | 'sans' | 'display' | 'mono' | 'script' | 'blackletter' | 'slab' | 'cjk' | 'arabic' | 'indic';
export interface FontSpec { family: string; fallback: string; class: FontClass; google?: string; note?: string }

const S = (family: string, fallback: string, cls: FontClass, google?: string, note?: string): FontSpec => ({ family, fallback, class: cls, google, note });

export const FONTS = {
  // ── Workhorse sans ──
  inter: S('Inter', 'system-ui, sans-serif', 'sans', 'Inter:wght@300;400;500;600;700;800;900'),
  dmSans: S('DM Sans', 'system-ui, sans-serif', 'sans', 'DM+Sans:ital,opsz,wght@0,9..40,300..900;1,9..40,300..900'),
  workSans: S('Work Sans', 'system-ui, sans-serif', 'sans', 'Work+Sans:ital,wght@0,300..900;1,300..900'),
  manrope: S('Manrope', 'system-ui, sans-serif', 'sans', 'Manrope:wght@300..800'),
  karla: S('Karla', 'system-ui, sans-serif', 'sans', 'Karla:ital,wght@0,300..800;1,300..800'),
  archivo: S('Archivo', 'system-ui, sans-serif', 'sans', 'Archivo:ital,wdth,wght@0,62..125,100..900;1,62..125,100..900'),
  epilogue: S('Epilogue', 'system-ui, sans-serif', 'sans', 'Epilogue:ital,wght@0,100..900;1,100..900'),
  lexend: S('Lexend', 'system-ui, sans-serif', 'sans', 'Lexend:wght@300..900', 'Reading-optimised — good for children and dyslexic readers'),
  nunito: S('Nunito', 'system-ui, sans-serif', 'sans', 'Nunito:ital,wght@0,300..1000;1,300..1000'),
  raleway: S('Raleway', 'system-ui, sans-serif', 'sans', 'Raleway:ital,wght@0,100..900;1,100..900'),
  josefin: S('Josefin Sans', 'system-ui, sans-serif', 'sans', 'Josefin+Sans:ital,wght@0,100..700;1,100..700', 'Geometric 1920s flavour'),
  spaceGrotesk: S('Space Grotesk', 'system-ui, sans-serif', 'sans', 'Space+Grotesk:wght@300..700'),
  outfit: S('Outfit', 'system-ui, sans-serif', 'sans', 'Outfit:wght@100..900'),
  sora: S('Sora', 'system-ui, sans-serif', 'sans', 'Sora:wght@100..800'),
  bricolage: S('Bricolage Grotesque', 'system-ui, sans-serif', 'sans', 'Bricolage+Grotesque:opsz,wght@12..96,200..800'),
  chakra: S('Chakra Petch', 'system-ui, sans-serif', 'sans', 'Chakra+Petch:ital,wght@0,300..700;1,300..700'),
  exo2: S('Exo 2', 'system-ui, sans-serif', 'sans', 'Exo+2:ital,wght@0,100..900;1,100..900'),
  // ── Editorial serif ──
  playfair: S('Playfair Display', 'Georgia, serif', 'serif', 'Playfair+Display:ital,wght@0,400..900;1,400..900'),
  fraunces: S('Fraunces', 'Georgia, serif', 'serif', 'Fraunces:ital,opsz,wght,SOFT,WONK@0,9..144,100..900,0..100,0..1;1,9..144,100..900,0..100,0..1'),
  dmSerif: S('DM Serif Display', 'Georgia, serif', 'serif', 'DM+Serif+Display:ital@0;1'),
  cormorant: S('Cormorant Garamond', 'Georgia, serif', 'serif', 'Cormorant+Garamond:ital,wght@0,300..700;1,300..700'),
  ebGaramond: S('EB Garamond', 'Georgia, serif', 'serif', 'EB+Garamond:ital,wght@0,400..800;1,400..800'),
  libreBaskerville: S('Libre Baskerville', 'Georgia, serif', 'serif', 'Libre+Baskerville:ital,wght@0,400;0,700;1,400'),
  bodoni: S('Bodoni Moda', 'Georgia, serif', 'serif', 'Bodoni+Moda:ital,opsz,wght@0,6..96,400..900;1,6..96,400..900'),
  lora: S('Lora', 'Georgia, serif', 'serif', 'Lora:ital,wght@0,400..700;1,400..700'),
  crimson: S('Crimson Pro', 'Georgia, serif', 'serif', 'Crimson+Pro:ital,wght@0,200..900;1,200..900'),
  spectral: S('Spectral', 'Georgia, serif', 'serif', 'Spectral:ital,wght@0,200..800;1,200..800'),
  merriweather: S('Merriweather', 'Georgia, serif', 'serif', 'Merriweather:ital,opsz,wght@0,18..144,300..900;1,18..144,300..900'),
  alegreya: S('Alegreya', 'Georgia, serif', 'serif', 'Alegreya:ital,wght@0,400..900;1,400..900'),
  cardo: S('Cardo', 'Georgia, serif', 'serif', 'Cardo:ital,wght@0,400;0,700;1,400', 'Scholarly, humanist'),
  instrumentSerif: S('Instrument Serif', 'Georgia, serif', 'serif', 'Instrument+Serif:ital@0;1'),
  gloock: S('Gloock', 'Georgia, serif', 'serif', 'Gloock'),
  marcellus: S('Marcellus', 'Georgia, serif', 'serif', 'Marcellus', 'Roman inscriptional'),
  cinzel: S('Cinzel', 'Georgia, serif', 'display', 'Cinzel:wght@400..900', 'Trajan-class capitals'),
  tenor: S('Tenor Sans', 'system-ui, sans-serif', 'sans', 'Tenor+Sans'),
  italiana: S('Italiana', 'Georgia, serif', 'display', 'Italiana'),
  forum: S('Forum', 'Georgia, serif', 'display', 'Forum'),
  yeseva: S('Yeseva One', 'Georgia, serif', 'display', 'Yeseva+One'),
  abril: S('Abril Fatface', 'Georgia, serif', 'display', 'Abril+Fatface'),
  // ── Slab ──
  robotoSlab: S('Roboto Slab', 'Georgia, serif', 'slab', 'Roboto+Slab:wght@100..900'),
  zilla: S('Zilla Slab', 'Georgia, serif', 'slab', 'Zilla+Slab:ital,wght@0,300..700;1,300..700'),
  bitter: S('Bitter', 'Georgia, serif', 'slab', 'Bitter:ital,wght@0,100..900;1,100..900'),
  josefinSlab: S('Josefin Slab', 'Georgia, serif', 'slab', 'Josefin+Slab:ital,wght@0,100..700;1,100..700'),
  // ── Display / poster ──
  archivoBlack: S('Archivo Black', 'Impact, sans-serif', 'display', 'Archivo+Black'),
  bebas: S('Bebas Neue', 'Impact, sans-serif', 'display', 'Bebas+Neue'),
  anton: S('Anton', 'Impact, sans-serif', 'display', 'Anton'),
  oswald: S('Oswald', 'Impact, sans-serif', 'display', 'Oswald:wght@200..700'),
  leagueGothic: S('League Gothic', 'Impact, sans-serif', 'display', 'League+Gothic'),
  sixCaps: S('Six Caps', 'Impact, sans-serif', 'display', 'Six+Caps'),
  staatliches: S('Staatliches', 'Impact, sans-serif', 'display', 'Staatliches'),
  bigShoulders: S('Big Shoulders Display', 'Impact, sans-serif', 'display', 'Big+Shoulders+Display:wght@100..900'),
  syne: S('Syne', 'system-ui, sans-serif', 'display', 'Syne:wght@400..800'),
  unbounded: S('Unbounded', 'system-ui, sans-serif', 'display', 'Unbounded:wght@200..900'),
  delaGothic: S('Dela Gothic One', 'Impact, sans-serif', 'display', 'Dela+Gothic+One'),
  righteous: S('Righteous', 'system-ui, sans-serif', 'display', 'Righteous'),
  monoton: S('Monoton', 'Impact, sans-serif', 'display', 'Monoton', 'Inline neon deco'),
  limelight: S('Limelight', 'Georgia, serif', 'display', 'Limelight', 'Art Deco marquee'),
  poiret: S('Poiret One', 'system-ui, sans-serif', 'display', 'Poiret+One', 'Deco thin geometric'),
  bungee: S('Bungee', 'Impact, sans-serif', 'display', 'Bungee'),
  bungeeShade: S('Bungee Shade', 'Impact, sans-serif', 'display', 'Bungee+Shade'),
  rubikMono: S('Rubik Mono One', 'Impact, sans-serif', 'display', 'Rubik+Mono+One'),
  shrikhand: S('Shrikhand', 'Georgia, serif', 'display', 'Shrikhand'),
  bangers: S('Bangers', 'Impact, sans-serif', 'display', 'Bangers', 'Comic impact lettering'),
  orbitron: S('Orbitron', 'system-ui, sans-serif', 'display', 'Orbitron:wght@400..900'),
  audiowide: S('Audiowide', 'system-ui, sans-serif', 'display', 'Audiowide'),
  michroma: S('Michroma', 'system-ui, sans-serif', 'display', 'Michroma'),
  tomorrow: S('Tomorrow', 'system-ui, sans-serif', 'display', 'Tomorrow:ital,wght@0,100..900;1,100..900'),
  majorMono: S('Major Mono Display', 'monospace', 'display', 'Major+Mono+Display'),
  pressStart: S('Press Start 2P', 'monospace', 'display', 'Press+Start+2P'),
  vt323: S('VT323', 'monospace', 'mono', 'VT323'),
  federo: S('Federo', 'Georgia, serif', 'display', 'Federo', 'Secession-era letterforms'),
  philosopher: S('Philosopher', 'system-ui, sans-serif', 'display', 'Philosopher:ital,wght@0,400;0,700;1,400;1,700'),
  // ── Mono ──
  jetbrains: S('JetBrains Mono', 'monospace', 'mono', 'JetBrains+Mono:ital,wght@0,100..800;1,100..800'),
  ibmPlexMono: S('IBM Plex Mono', 'monospace', 'mono', 'IBM+Plex+Mono:ital,wght@0,100..700;1,100..700'),
  spaceMono: S('Space Mono', 'monospace', 'mono', 'Space+Mono:ital,wght@0,400;0,700;1,400;1,700'),
  dmMono: S('DM Mono', 'monospace', 'mono', 'DM+Mono:ital,wght@0,300..500;1,300..500'),
  courierPrime: S('Courier Prime', '"Courier New", monospace', 'mono', 'Courier+Prime:ital,wght@0,400;0,700;1,400;1,700', 'Screenplay standard'),
  specialElite: S('Special Elite', '"Courier New", monospace', 'mono', 'Special+Elite', 'Typewriter with worn ink'),
  // ── Script / hand ──
  pacifico: S('Pacifico', 'cursive', 'script', 'Pacifico'),
  lobster: S('Lobster', 'cursive', 'script', 'Lobster'),
  greatVibes: S('Great Vibes', 'cursive', 'script', 'Great+Vibes'),
  dancing: S('Dancing Script', 'cursive', 'script', 'Dancing+Script:wght@400..700'),
  caveat: S('Caveat', 'cursive', 'script', 'Caveat:wght@400..700'),
  kalam: S('Kalam', 'cursive', 'script', 'Kalam:wght@300;400;700'),
  patrickHand: S('Patrick Hand', 'cursive', 'script', 'Patrick+Hand'),
  permanentMarker: S('Permanent Marker', 'cursive', 'script', 'Permanent+Marker'),
  rockSalt: S('Rock Salt', 'cursive', 'script', 'Rock+Salt'),
  comicNeue: S('Comic Neue', 'system-ui, sans-serif', 'sans', 'Comic+Neue:ital,wght@0,300;0,400;0,700;1,300;1,400;1,700'),
  baloo: S('Baloo 2', 'system-ui, sans-serif', 'display', 'Baloo+2:wght@400..800'),
  fredoka: S('Fredoka', 'system-ui, sans-serif', 'display', 'Fredoka:wght@300..700'),
  quicksand: S('Quicksand', 'system-ui, sans-serif', 'sans', 'Quicksand:wght@300..700'),
  // ── Blackletter / medieval ──
  unifraktur: S('UnifrakturMaguntia', 'Georgia, serif', 'blackletter', 'UnifrakturMaguntia'),
  pirata: S('Pirata One', 'Georgia, serif', 'blackletter', 'Pirata+One'),
  medievalSharp: S('MedievalSharp', 'Georgia, serif', 'blackletter', 'MedievalSharp'),
  uncial: S('Uncial Antiqua', 'Georgia, serif', 'blackletter', 'Uncial+Antiqua', 'Insular half-uncial'),
  metamorphous: S('Metamorphous', 'Georgia, serif', 'blackletter', 'Metamorphous'),
  almendra: S('Almendra', 'Georgia, serif', 'serif', 'Almendra:ital,wght@0,400;0,700;1,400;1,700'),
  // ── World scripts (Latin companions included in each family) ──
  notoSansJp: S('Noto Sans JP', 'sans-serif', 'cjk', 'Noto+Sans+JP:wght@300..900'),
  notoSerifJp: S('Noto Serif JP', 'serif', 'cjk', 'Noto+Serif+JP:wght@300..900'),
  shippori: S('Shippori Mincho', 'serif', 'cjk', 'Shippori+Mincho:wght@400..800'),
  zenKaku: S('Zen Kaku Gothic New', 'sans-serif', 'cjk', 'Zen+Kaku+Gothic+New:wght@300..900'),
  amiri: S('Amiri', 'serif', 'arabic', 'Amiri:ital,wght@0,400;0,700;1,400;1,700', 'Naskh'),
  cairo: S('Cairo', 'sans-serif', 'arabic', 'Cairo:wght@200..1000'),
  reemKufi: S('Reem Kufi', 'sans-serif', 'arabic', 'Reem+Kufi:wght@400..700'),
  tiro: S('Tiro Devanagari Hindi', 'serif', 'indic', 'Tiro+Devanagari+Hindi:ital@0;1'),
  martel: S('Martel', 'serif', 'indic', 'Martel:wght@200..900'),
} as const satisfies Record<string, FontSpec>;

export type FontKey = keyof typeof FONTS;

/** The CSS font-family string a template writes onto an object. */
export function fontCss(key: FontKey | string): string {
  const spec = (FONTS as Record<string, FontSpec>)[key];
  if (!spec) return key; // already a raw stack
  return `"${spec.family}", ${spec.fallback}`;
}

const familyToKey = new Map<string, FontKey>(Object.entries(FONTS).map(([k, v]) => [v.family.toLowerCase(), k as FontKey]));
/** Reverse lookup — which keys do these CSS stacks reference? */
export function fontKeysInStacks(stacks: Iterable<string | undefined>): FontKey[] {
  const out = new Set<FontKey>();
  for (const stack of stacks) {
    if (!stack) continue;
    for (const part of stack.split(',')) {
      const fam = part.replace(/["']/g, '').trim().toLowerCase();
      const key = familyToKey.get(fam);
      if (key) out.add(key);
    }
  }
  return [...out];
}

const loaded = new Set<string>();
/** Inject one Google Fonts stylesheet for the keys not yet requested. Browser only; no-op in node. */
export function ensureFontsLoaded(keys: Iterable<FontKey | string>): void {
  if (typeof document === 'undefined') return;
  const specs: string[] = [];
  for (const key of keys) {
    const spec = (FONTS as Record<string, FontSpec>)[key];
    if (!spec?.google || loaded.has(key)) continue;
    loaded.add(key); specs.push(spec.google);
  }
  if (!specs.length) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${specs.map(s => `family=${s}`).join('&')}&display=swap`;
  link.setAttribute('data-tela-fonts', '1');
  document.head.appendChild(link);
}

export function ensureFontsForObjects(objects: Array<{ fontFamily?: string }>): void {
  ensureFontsLoaded(fontKeysInStacks(objects.map(o => o.fontFamily)));
}

/** Curated pairings — a display voice, a text voice, and a utility face. */
export interface TypePairing { id: string; label: string; display: FontKey; text: FontKey; utility: FontKey; mood: string }
export const TYPE_PAIRINGS: TypePairing[] = [
  { id: 'editorial-classic', label: 'Playfair + Lora', display: 'playfair', text: 'lora', utility: 'inter', mood: 'Confident magazine feature' },
  { id: 'humanist', label: 'Fraunces + Work Sans', display: 'fraunces', text: 'workSans', utility: 'dmMono', mood: 'Warm, literate, contemporary' },
  { id: 'swiss', label: 'Inter + Inter', display: 'inter', text: 'inter', utility: 'jetbrains', mood: 'Objective, gridded, quiet' },
  { id: 'grotesk', label: 'Space Grotesk + DM Sans', display: 'spaceGrotesk', text: 'dmSans', utility: 'spaceMono', mood: 'Studio, technical, friendly' },
  { id: 'deco', label: 'Limelight + Josefin', display: 'limelight', text: 'josefin', utility: 'poiret', mood: '1920s marquee' },
  { id: 'poster', label: 'Anton + Archivo', display: 'anton', text: 'archivo', utility: 'bebas', mood: 'Loud, compressed, urgent' },
  { id: 'literary', label: 'Cormorant + EB Garamond', display: 'cormorant', text: 'ebGaramond', utility: 'cardo', mood: 'Book, poem, manuscript' },
  { id: 'roman', label: 'Cinzel + Marcellus', display: 'cinzel', text: 'marcellus', utility: 'tenor', mood: 'Inscriptional, civic' },
  { id: 'fashion', label: 'Bodoni + Karla', display: 'bodoni', text: 'karla', utility: 'dmMono', mood: 'High contrast, restrained' },
  { id: 'playful', label: 'Baloo + Nunito', display: 'baloo', text: 'nunito', utility: 'lexend', mood: 'Children, warmth, rhythm' },
  { id: 'sci', label: 'Manrope + IBM Plex Mono', display: 'manrope', text: 'manrope', utility: 'ibmPlexMono', mood: 'Precise, explanatory' },
  { id: 'future', label: 'Unbounded + Sora', display: 'unbounded', text: 'sora', utility: 'jetbrains', mood: 'Wide, synthetic, forward' },
  { id: 'retro-future', label: 'Orbitron + Exo 2', display: 'orbitron', text: 'exo2', utility: 'vt323', mood: 'Space Age, Y2K' },
  { id: 'diy', label: 'Special Elite + Permanent Marker', display: 'permanentMarker', text: 'specialElite', utility: 'courierPrime', mood: 'Zine, punk, photocopy' },
  { id: 'gothic', label: 'UnifrakturMaguntia + Cardo', display: 'unifraktur', text: 'cardo', utility: 'almendra', mood: 'Cathedral, scriptorium' },
  { id: 'japan', label: 'Shippori Mincho + Zen Kaku', display: 'shippori', text: 'zenKaku', utility: 'notoSansJp', mood: 'Print culture, quiet asymmetry' },
  { id: 'arabic', label: 'Amiri + Cairo', display: 'amiri', text: 'cairo', utility: 'reemKufi', mood: 'Geometric and calligraphic' },
  { id: 'comic', label: 'Bangers + Comic Neue', display: 'bangers', text: 'comicNeue', utility: 'patrickHand', mood: 'Panel and balloon' },
];
