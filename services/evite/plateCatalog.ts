// plateCatalog — the 272 production plates (Magnific, council-directed) and where their assets live.
// Assets are public, immutable and versioned in Firebase Storage: evites/<version>/{plates,depth,thumbs}/<collection>/<subject>.jpg
// A plate id is "<collection>/<subject>", and is what an evite stores as its templateId.
import catalog from './plateCatalog.json';

export interface PlateCollection { id: string; label: string; plates: string[] }
export const PLATE_COLLECTIONS: PlateCollection[] = (catalog as any).collections;
export const PLATE_BASE: string = (catalog as any).base;
const LIGHT = new Set<string>((catalog as any).lightBottom || []);
/** True when the lower part of the plate (where live text sits) is light: use dark ink on a paper wash, not a dark scrim. */
export const isLightPlate = (id: string) => LIGHT.has(id);

const FORMAL = new Set(['wedding', 'anniversary', 'faith', 'military']);
const KIDS = new Set(['kids_everyone', 'kids_boy', 'kids_girl', 'kids_kaiju', 'sports_kids']);

export function parsePlateId(id: string | undefined | null): { collection: string; subject: string } | null {
  const m = /^([a-z_]+)\/([a-z0-9-]+)$/.exec(String(id || ''));
  if (!m) return null;
  const col = PLATE_COLLECTIONS.find(c => c.id === m[1]);
  return col && col.plates.includes(m[2]) ? { collection: m[1], subject: m[2] } : null;
}
export const isPlateId = (id: unknown): id is string => typeof id === 'string' && !!parsePlateId(id);

export function plateUrls(id: string) {
  const p = parsePlateId(id); if (!p) return null;
  const tail = `${p.collection}/${p.subject}.jpg`;
  return { plate: `${PLATE_BASE}/plates/${tail}`, depth: `${PLATE_BASE}/depth/${tail}`, thumb: `${PLATE_BASE}/thumbs/${tail}`, ...p };
}

/** Typographic voice for the live text over a plate. Open-licensed faces only (council rule). */
export function plateVoice(collection: string): { tone: 'formal' | 'kids' | 'party'; display: string; displayStyle: string; eyebrow: string } {
  if (FORMAL.has(collection)) return { tone: 'formal', display: '"Cormorant Garamond", Georgia, serif', displayStyle: 'italic 500', eyebrow: collection === 'wedding' ? 'Together with their families' : 'You are invited' };
  if (KIDS.has(collection)) return { tone: 'kids', display: 'Fredoka, Outfit, system-ui, sans-serif', displayStyle: 'normal 700', eyebrow: "You're invited" };
  return { tone: 'party', display: 'Outfit, system-ui, sans-serif', displayStyle: 'italic 900', eyebrow: "You're invited" };
}

export const isAlternate = (subject: string) => /-alt$/.test(subject);
export const prettySubject = (subject: string) => subject.replace(/-alt$/, '').replace(/-/g, ' ');
