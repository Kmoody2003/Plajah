// Starter programs: the list of rooms a home needs (what architects call the "program" or "brief").
// Typical sizes are common ranges for a comfortable home, not code minimums (those live in homeChecks).

export interface ProgramRoom { name: string; kind: RoomKind; count?: number }
export type RoomKind = 'bedroom' | 'bath' | 'kitchen' | 'living' | 'dining' | 'office' | 'laundry' | 'hall' | 'garage' | 'studio';
export interface Program { id: string; name: string; simple: string; rooms: ProgramRoom[]; footprint: [number, number] /* suggested outside size, mm */ }

export const ROOM_KINDS: Record<RoomKind, { label: string; typical: [number, number]; simple: string; pro: string; needs: string[] }> = {
  bedroom: { label: 'Bedroom', typical: [9, 16], simple: 'Where you sleep. It needs a bed, room to walk around it, a closet, and a window you could climb out of.', pro: 'Habitable sleeping room: R304 area/width minimums, R310 emergency escape opening, R314 smoke alarm.', needs: ['bed', 'wardrobe'] },
  bath: { label: 'Bathroom', typical: [4, 8], simple: 'Toilet, sink and a bath or shower. Water pipes are easier and cheaper when bathrooms sit near the kitchen.', pro: 'Group plumbing walls with the kitchen to share stacks; check fixture clearances (R307) and accessibility if required.', needs: ['wc', 'basin', 'bathtub|shower'] },
  kitchen: { label: 'Kitchen', typical: [8, 16], simple: 'Sink, stove and fridge. Cooks like these three in a triangle so they don\'t walk too far.', pro: 'Work triangle sink–range–fridge, 4–8 m legs; counter run and landing space each side of the range.', needs: ['sink-kitchen', 'range', 'fridge'] },
  living: { label: 'Living room', typical: [14, 28], simple: 'Where everyone hangs out. Put it on the sunny side if you can.', pro: 'Primary habitable space; orient for daylight (south in the northern hemisphere), R303 natural light and ventilation.', needs: ['sofa'] },
  dining: { label: 'Dining', typical: [9, 16], simple: 'A table with room to pull out the chairs, close to the kitchen.', pro: 'Allow ~900 mm behind chairs for circulation; adjacency to kitchen.', needs: ['table-dining|table-round'] },
  office: { label: 'Office', typical: [7, 12], simple: 'A quiet room for working or homework.', pro: 'Habitable room; acoustic separation from living spaces.', needs: ['desk'] },
  laundry: { label: 'Laundry', typical: [3, 6], simple: 'Washer and dryer. Near the bedrooms is handy, because that\'s where the clothes are.', pro: 'Dryer exhaust to outside (M1502); share a wet wall where possible.', needs: [] },
  hall: { label: 'Hall', typical: [3, 12], simple: 'The path that connects rooms. Keep it short so space goes to rooms instead.', pro: 'Hallways at least 914 mm (36 in) wide (R311.6); minimise circulation area.', needs: [] },
  garage: { label: 'Garage', typical: [18, 40], simple: 'Room for a car. It needs a wall that stops fire getting into the house.', pro: 'Separation from dwelling per R302.6; door to house solid or 20-minute rated.', needs: ['car'] },
  studio: { label: 'Studio room', typical: [18, 35], simple: 'One room for living, sleeping and cooking.', pro: 'Combined habitable space; still needs an escape opening and a smoke alarm where people sleep.', needs: ['sink-kitchen', 'range', 'fridge', 'bed'] },
};

export const PROGRAMS: Program[] = [
  { id: 'tiny', name: 'Tiny house', simple: 'One open room to live, cook and sleep in, plus a bathroom. Small and cosy.', footprint: [7200, 3600], rooms: [{ name: 'Studio', kind: 'studio' }, { name: 'Bathroom', kind: 'bath' }] },
  { id: 'cottage', name: 'Two-bedroom cottage', simple: 'Two bedrooms, one bathroom, and a living room with the kitchen.', footprint: [10000, 8000], rooms: [{ name: 'Living room', kind: 'living' }, { name: 'Kitchen', kind: 'kitchen' }, { name: 'Bathroom', kind: 'bath' }, { name: 'Bedroom', kind: 'bedroom', count: 2 }] },
  { id: 'family', name: 'Family home', simple: 'Three bedrooms, two bathrooms, and room for everyone to eat together.', footprint: [14000, 10000], rooms: [{ name: 'Living room', kind: 'living' }, { name: 'Kitchen', kind: 'kitchen' }, { name: 'Dining', kind: 'dining' }, { name: 'Bathroom', kind: 'bath', count: 2 }, { name: 'Bedroom', kind: 'bedroom', count: 3 }, { name: 'Laundry', kind: 'laundry' }] },
  { id: 'own', name: 'My own plan', simple: 'No list. Draw whatever you like and name rooms as you go.', footprint: [10000, 8000], rooms: [] },
  { id: 'adu', name: 'Backyard cottage (ADU)', simple: 'A small second home behind a house, for a grandparent or a guest.', footprint: [9000, 6000], rooms: [{ name: 'Living room', kind: 'living' }, { name: 'Kitchen', kind: 'kitchen' }, { name: 'Bathroom', kind: 'bath' }, { name: 'Bedroom', kind: 'bedroom' }] },
];

/** The rooms of a program, numbered when there are several of a kind ("Bedroom 1", "Bedroom 2"). */
export function programRooms(p: Program): Array<{ name: string; kind: RoomKind }> {
  return p.rooms.flatMap(r => (r.count && r.count > 1 ? Array.from({ length: r.count }, (_, i) => ({ name: `${r.name} ${i + 1}`, kind: r.kind })) : [{ name: r.name, kind: r.kind }]));
}

/** Every kind a typed room name covers: "Living / Kitchen" is both a living room and a kitchen. */
export function kindsOf(name: string): RoomKind[] {
  const n = name.toLowerCase(); const out: RoomKind[] = [];
  const bath = /\b(bath|bathroom|wc|toilet|restroom|powder|ensuite|en-suite|shower)\b/.test(n); if (bath) out.push('bath');
  if (/\b(kitchen|kitchenette)\b/.test(n)) out.push('kitchen');
  if (/\bstudio\b/.test(n)) out.push('studio');
  if (!bath && /\b(bed|bedroom|nursery|guest|bunk|master|primary)\b/.test(n)) out.push('bedroom');
  if (/\b(living|lounge|family|great room|den)\b/.test(n)) out.push('living');
  if (/\bdining\b/.test(n)) out.push('dining');
  if (/\b(office|study)\b/.test(n)) out.push('office');
  if (/\b(laundry|utility)\b/.test(n)) out.push('laundry');
  if (/\b(hall|hallway|corridor|entry|foyer)\b/.test(n)) out.push('hall');
  if (/\bgarage\b/.test(n)) out.push('garage');
  return out;
}
export const kindOf = (name: string): RoomKind | null => kindsOf(name)[0] ?? null;
