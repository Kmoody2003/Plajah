// Plajah Build launch requests and idea routing, shared by the hub and anything that opens a room
// (Academia lessons fire a 'plajah:openBuild' window event or leave the request in sessionStorage).

export type Room = 'elec' | 'cad' | 'sew' | 'bio' | 'exchange' | 'studio';
export const ROOM_IDS: Room[] = ['elec', 'cad', 'sew', 'bio', 'exchange', 'studio'];
/** A launch request from elsewhere in Plajah (an Academia lesson, a link): which room, and what to open in it. */
export interface BuildLaunch { room: Room; prompt?: string; template?: string; starter?: string; lesson?: string }
export const PENDING_BUILD_KEY = 'plajah:pendingBuild';
export const OPEN_BUILD_EVENT = 'plajah:openBuild';
export function parseLaunch(raw: unknown): BuildLaunch | null {
  const v = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  if (!v || typeof v !== 'object' || !ROOM_IDS.includes((v as BuildLaunch).room)) return null;
  const s = (k: keyof BuildLaunch) => { const x = (v as Record<string, unknown>)[k]; return typeof x === 'string' && x.length <= 2000 ? x : undefined; };
  return { room: (v as BuildLaunch).room, prompt: s('prompt'), template: s('template'), starter: s('starter'), lesson: s('lesson') };
}

/** Which room an idea belongs in. Sewing words pick the pattern; buildings go to CAD. */
export function routeIdea(text: string): { room: Room; template?: string; starter?: string } {
  const t = text.toLowerCase();
  const studio: Array<[RegExp, string]> = [[/key ?chain|key ?ring/, 'keychain'], [/name ?tag|name ?plate/, 'name-tag'], [/phone stand|tablet stand/, 'phone-stand'], [/traffic light/, 'traffic-light'], [/night ?light/, 'nightlight'], [/reaction (game|timer)/, 'reaction-game'], [/servo/, 'servo-sweep'], [/blink/, 'blink'], [/distance (alarm|sensor)|ultrasonic/, 'distance-alarm']];
  for (const [re, starter] of studio) if (re.test(t)) return { room: 'studio', starter };
  const sew: Array<[RegExp, string]> = [[/plush|stuffed|teddy|stuffie|softie|toy animal/, 'plush-pal'], [/\bball\b|sphere/, 'plush-ball'], [/pillow|cushion/, 'pillow-envelope'], [/blanket|throw|quilt/, 'throw'], [/duvet|comforter cover/, 'duvet'], [/fitted sheet|bed sheet|crib sheet|\bsheet\b/, 'fitted-sheet'], [/tote|bag/, 'tote'], [/hoodie|sweatshirt/, 'hoodie'], [/t-?shirt|\btee\b|shirt/, 'tee'], [/skirt/, 'skirt']];
  for (const [re, template] of sew) if (re.test(t)) return { room: 'sew', template };
  if (/house|floor ?plan|building|room layout|kitchen|cabin|shed|church|office layout|\bdwg\b|\bdxf\b|\bifc\b/.test(t)) return { room: 'cad' };
  if (/protein|molecule|enzyme|pathway|sbml|\bpdb\b/.test(t)) return { room: 'bio' };
  return { room: 'elec' };
}
