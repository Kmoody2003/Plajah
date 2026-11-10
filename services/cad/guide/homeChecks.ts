// Home safety and comfort pre-checks for a house plan. Each rule is written in our own words, with
// the section of the 2021 International Residential Code (IRC) it comes from, and a plain version
// a ten-year-old can follow. Like the accessibility checks, this is a design aid that flags likely
// problems early: it is not a code review or a permit, and the local building office decides.

import type { CadModel, CadEntity2D, WallOpening } from '../model';
import { MM_PER_UNIT } from '../model';
import { detectRooms, pointInPoly, type Room } from '../rooms';
import { parseLibraryBlock } from '../schedules';
import type { Finding } from '../codeCheck';

type P = [number, number];
type Wall = Extract<CadEntity2D, { type: 'wall' }>;

export interface HomeRule { id: string; title: string; citation: string; what: string; simple: string }
export const HOME_RULES: HomeRule[] = [
  { id: 'room-area', title: 'Living spaces are big enough', citation: '2021 IRC §R304.1', what: 'Habitable rooms (bedrooms, living, dining, family rooms, offices) have at least 6.5 m² (70 sq ft) of floor area. Kitchens are not held to this.', simple: 'A room you live or sleep in has to be big enough to move around in, at least about the size of a big rug.' },
  { id: 'room-width', title: 'Living spaces are wide enough', citation: '2021 IRC §R304.2', what: 'Habitable rooms are at least 2134 mm (7 ft) across in every direction.', simple: 'A room can\'t be a skinny hallway: it has to be at least as wide as a grown-up lying down with arms stretched.' },
  { id: 'ceiling-height', title: 'Ceilings are high enough', citation: '2021 IRC §R305.1', what: 'Habitable rooms have a ceiling at least 2134 mm (7 ft) high. Walls here carry their height.', simple: 'Tall people need to stand up without bumping their head.' },
  { id: 'bedroom-escape', title: 'Every bedroom has a way out in an emergency', citation: '2021 IRC §R310.1', what: 'Each sleeping room has an emergency escape and rescue opening, usually a window that opens onto the outside. Its clear size (R310.2) is not modelled yet.', simple: 'Every bedroom needs a window you could climb out of if there was a fire, and a firefighter could climb in.' },
  { id: 'smoke-alarm', title: 'Smoke alarms in bedrooms', citation: '2021 IRC §R314.3', what: 'A smoke alarm in each sleeping room (and outside each sleeping area, and on every storey).', simple: 'Every bedroom needs a smoke alarm that wakes you up if there\'s smoke.' },
  { id: 'egress-door', title: 'A big enough front door', citation: '2021 IRC §R311.2', what: 'At least one side-hinged exit door with a clear width of at least 813 mm (32 in), opening to the outside.', simple: 'The house needs a door to the outside wide enough to carry a stretcher or a sofa through.' },
  { id: 'stair-tread', title: 'Stair steps are deep enough', citation: '2021 IRC §R311.7.5.2', what: 'Stair treads at least 254 mm (10 in) deep. Riser height (R311.7.5.1, at most 196 mm / 7¾ in) is not modelled yet.', simple: 'Each step needs room for your whole foot so you don\'t slip.' },
];
export const homeRule = (id: string) => HOME_RULES.find(r => r.id === id)!;

export const HABITABLE = /\b(bed|bedroom|living|lounge|family|dining|den|office|study|great room|bonus|nursery|playroom|guest|studio|master|primary)\b/i;
export const BEDROOM = /\b(bed|bedroom|nursery|guest|master|primary suite|bunk)\b/i;

export interface RoomOpening { wall: Wall; wallIndex: number; opening: WallOpening; centre: P }

/** Doors and windows in the walls that bound a room (opening centre lies on the room's centreline outline). */
export function openingsOfRoom(room: Room, entities: CadEntity2D[]): RoomOpening[] {
  const out: RoomOpening[] = [];
  entities.forEach((e, wallIndex) => {
    if (e.type !== 'wall') return; const L = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) || 1; const u: P = [(e.b[0] - e.a[0]) / L, (e.b[1] - e.a[1]) / L];
    for (const o of e.openings) {
      const centre: P = [e.a[0] + u[0] * (o.at + o.width / 2), e.a[1] + u[1] * (o.at + o.width / 2)];
      if (distToPoly(centre, room.outline) <= e.thickness * 0.25) out.push({ wall: e, wallIndex, opening: o, centre });
    }
  });
  return out;
}

/** True when one side of the wall at this point is inside a room and the other is outside every room. */
export function isExteriorAt(w: Wall, p: P, rooms: Room[]): boolean {
  const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1; const n: P = [-(w.b[1] - w.a[1]) / L, (w.b[0] - w.a[0]) / L]; const d = w.thickness * 1.5;
  const inside = (q: P) => rooms.some(r => pointInPoly(q, r.outline));
  return inside([p[0] + n[0] * d, p[1] + n[1] * d]) !== inside([p[0] - n[0] * d, p[1] - n[1] * d]);
}

function distToPoly(p: P, poly: P[]): number {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; const dx = b[0] - a[0], dy = b[1] - a[1]; const l2 = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)); d = Math.min(d, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)); }
  return d;
}

/** Smallest width of a polygon across all edge directions (rotating calipers on the vertices). */
export function minWidth(poly: P[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-9) continue;
    const n: P = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L]; let lo = Infinity, hi = -Infinity;
    for (const q of poly) { const s = q[0] * n[0] + q[1] * n[1]; lo = Math.min(lo, s); hi = Math.max(hi, s); }
    best = Math.min(best, hi - lo);
  }
  return best;
}

export function runHomeChecks(m: CadModel, rooms: Room[] = detectRooms(m.entities)): Finding[] {
  const k = MM_PER_UNIT[m.units] || 1; const mm = (v: number) => v * k; const out: Finding[] = [];
  const imp = m.units === 'in' || m.units === 'ft';
  const len = (v: number) => (imp ? `${(v / 304.8).toFixed(1)} ft` : `${(v / 1000).toFixed(2)} m`);
  const area = (a: number) => (imp ? `${Math.round(a / 92903)} sq ft` : `${(a / 1e6).toFixed(1)} m²`);
  const push = (id: string, status: Finding['status'], detail: string, at: P, entityIndex?: number) => { const r = homeRule(id); out.push({ rule: r.id, status, title: r.title, detail, at, citation: r.citation, entityIndex }); };

  for (const r of rooms) {
    if (!r.name || !HABITABLE.test(r.name)) continue; // a kitchen on its own is not held to the size rules
    const a = r.area * k * k; push('room-area', a >= 6.5e6 ? 'pass' : 'fail', `${r.name}: ${area(a)} (needs at least ${area(6.5e6)}).`, r.centroid, r.tagIndex);
    const w = mm(minWidth(r.net)); push('room-width', w >= 2134 ? 'pass' : 'fail', `${r.name}: ${len(w)} at its narrowest (needs ${len(2134)}).`, r.centroid, r.tagIndex);
  }

  const walls = m.entities.map((e, i) => ({ e, i })).filter((x): x is { e: Wall; i: number } => x.e.type === 'wall');
  const low = walls.filter(({ e }) => mm(e.height) < 2134);
  if (low.length) push('ceiling-height', 'fail', `${low.length} wall${low.length > 1 ? 's are' : ' is'} lower than ${len(2134)}.`, [low[0].e.a[0], low[0].e.a[1]], low[0].i);

  const smokes = m.entities.filter((e): e is Extract<CadEntity2D, { type: 'insert' }> => e.type === 'insert' && parseLibraryBlock(e.block)?.item.id === 'smoke');
  for (const r of rooms) {
    if (!r.name || !BEDROOM.test(r.name)) continue;
    const ops = openingsOfRoom(r, m.entities);
    const escape = ops.find(o => o.opening.kind === 'window' && isExteriorAt(o.wall, o.centre, rooms));
    push('bedroom-escape', escape ? 'pass' : 'fail', escape ? `${r.name} has a window to the outside.` : `${r.name} has no window in an outside wall.`, escape?.centre ?? r.centroid, escape?.wallIndex ?? r.tagIndex);
    const alarm = smokes.some(s => pointInPoly([s.at[0], s.at[1]], r.outline));
    push('smoke-alarm', alarm ? 'pass' : 'warn', alarm ? `${r.name} has a smoke alarm.` : `No smoke alarm placed in ${r.name}.`, r.centroid, r.tagIndex);
  }

  if (rooms.length) {
    let best = 0; let at: P = rooms[0].centroid; let idx: number | undefined;
    for (const { e, i } of walls) {
      const L = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) || 1; const u: P = [(e.b[0] - e.a[0]) / L, (e.b[1] - e.a[1]) / L];
      for (const o of e.openings) {
        if (o.kind !== 'door') continue; const c: P = [e.a[0] + u[0] * (o.at + o.width / 2), e.a[1] + u[1] * (o.at + o.width / 2)];
        if (!isExteriorAt(e, c, rooms)) continue; const hinged = !o.item || o.item === 'door-single' || o.item === 'door-double';
        if (!hinged) continue; const clear = mm(o.width) / (o.item === 'door-double' ? 2 : 1) - 50;
        if (clear > best) { best = clear; at = c; idx = i; }
      }
    }
    push('egress-door', best >= 813 ? 'pass' : 'fail', best ? `Widest outside door clears about ${imp ? `${(best / 25.4).toFixed(0)} in` : `${Math.round(best)} mm`} (needs ${imp ? '32 in' : '813 mm'}).` : 'No hinged door in an outside wall yet.', at, idx);
  }

  m.entities.forEach((e, i) => {
    if (e.type !== 'insert') return; const lib = parseLibraryBlock(e.block); if (!lib || !/^stair-/.test(lib.item.id)) return;
    const going = Number(lib.params.going); if (!Number.isFinite(going)) return;
    push('stair-tread', going >= 254 ? 'pass' : 'fail', `Treads ${imp ? `${(going / 25.4).toFixed(1)} in` : `${Math.round(going)} mm`} deep (needs at least ${imp ? '10 in' : '254 mm'}).`, [e.at[0], e.at[1]], i);
  });
  return out;
}

export const HOME_DISCLAIMER = 'Pre-check only: flags likely issues against the 2021 International Residential Code as you draw. It is not a plan review or a permit; your local building office decides, and many places amend the code.';
