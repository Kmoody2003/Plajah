// Validator for Game Projects: a file from disk, the cloud, another person or Aria is checked before the
// Studio or a runtime opens it. Returns readable issues; `errors` block opening, `warnings` don't.

import { GAME_PROJECT_KIND, GAME_PROJECT_VERSION, MARKER_KINDS, type GameProject, type Vec3 } from './schema';

export interface Issue { level: 'error' | 'warning'; path: string; message: string }
export interface Validation { ok: boolean; errors: Issue[]; warnings: Issue[] }

const TEMPLATES = ['arena-shooter', 'racer', 'fighter', 'platformer', 'adventure', 'picture-walk', 'party'];
const ZONE_KINDS = ['hazardBelow', 'trigger'];
const OPS = ['==', '!=', '<', '<=', '>', '>='];
/** World bounds a level may use (metres). Keeps a typo like 4000 instead of 40 from vanishing a spawn. */
export const WORLD_LIMIT = 5000;

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const isVec3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === 'number' && Number.isFinite(n));

export function validateProject(input: unknown): Validation {
  const issues: Issue[] = [];
  const err = (path: string, message: string) => issues.push({ level: 'error', path, message });
  const warn = (path: string, message: string) => issues.push({ level: 'warning', path, message });

  if (!isObj(input)) { err('', 'Not a game project (expected an object).'); return done(issues); }
  const p = input as Partial<GameProject>;
  if (p.kind !== GAME_PROJECT_KIND) err('kind', `Expected kind "${GAME_PROJECT_KIND}".`);
  if (p.version !== GAME_PROJECT_VERSION) err('version', `Unsupported version ${String(p.version)} (this Studio reads ${GAME_PROJECT_VERSION}).`);
  if (typeof p.id !== 'string' || !p.id) err('id', 'Project needs an id.');
  if (typeof p.name !== 'string' || !p.name.trim()) err('name', 'Project needs a name.');
  if (!TEMPLATES.includes(p.template as string)) err('template', `Unknown template "${String(p.template)}".`);
  if (!isObj(p.runtime) || typeof p.runtime.game !== 'string') err('runtime.game', 'Project needs a runtime game.');
  if (!Array.isArray(p.levels) || p.levels.length === 0) { err('levels', 'Project needs at least one level.'); return done(issues); }

  const levelIds = new Set<string>();
  p.levels.forEach((l, i) => {
    const at = `levels[${i}]`;
    if (!isObj(l)) { err(at, 'Level must be an object.'); return; }
    if (typeof l.id !== 'string' || !l.id) err(`${at}.id`, 'Level needs an id.');
    else if (levelIds.has(l.id)) err(`${at}.id`, `Duplicate level id "${l.id}".`);
    else levelIds.add(l.id);
    if (!isObj(l.module) || typeof l.module.id !== 'string' || !l.module.id.includes('.')) err(`${at}.module.id`, 'Level module id must look like "<game>.<level>".');
    for (const key of ['markers', 'zones', 'instances', 'rules'] as const) if (!Array.isArray(l[key])) err(`${at}.${key}`, `${key} must be a list.`);
    if (!isObj(l.look)) err(`${at}.look`, 'look must be an object.');

    const ids = new Set<string>();
    const seen = (path: string, id: unknown) => {
      if (typeof id !== 'string' || !id) { err(path, 'Needs an id.'); return; }
      if (ids.has(id)) err(path, `Duplicate id "${id}" in this level.`);
      ids.add(id);
    };
    const inWorld = (path: string, v: Vec3) => { if (v.some(n => Math.abs(n) > WORLD_LIMIT)) warn(path, `Position is more than ${WORLD_LIMIT} m from the centre.`); };

    (Array.isArray(l.markers) ? l.markers : []).forEach((m, j) => {
      const mp = `${at}.markers[${j}]`;
      seen(`${mp}.id`, m?.id);
      if (!MARKER_KINDS.includes(m?.kind)) err(`${mp}.kind`, `Unknown marker kind "${String(m?.kind)}".`);
      if (!isVec3(m?.pos)) err(`${mp}.pos`, 'Position must be three numbers.'); else inWorld(`${mp}.pos`, m.pos);
      if (m?.yaw !== undefined && !Number.isFinite(m.yaw)) err(`${mp}.yaw`, 'Facing must be a number.');
      if (m?.radius !== undefined && !(Number.isFinite(m.radius) && m.radius > 0)) err(`${mp}.radius`, 'Radius must be above 0.');
      if (m?.kind === 'spawn' && m.team !== 'a' && m.team !== 'b') warn(`${mp}.team`, 'Spawn has no team; it will be used for team A.');
    });
    const spawns = (Array.isArray(l.markers) ? l.markers : []).filter(m => m?.kind === 'spawn');
    if (spawns.length && !spawns.some(m => m.team !== 'b')) warn(`${at}.markers`, 'No spawn for team A: the player will start at the module default.');

    (Array.isArray(l.zones) ? l.zones : []).forEach((z, j) => {
      const zp = `${at}.zones[${j}]`;
      seen(`${zp}.id`, z?.id);
      if (!ZONE_KINDS.includes(z?.kind)) err(`${zp}.kind`, `Unknown zone kind "${String(z?.kind)}".`);
      if (z?.kind === 'hazardBelow' && !Number.isFinite(z.y)) err(`${zp}.y`, 'Hazard height must be a number.');
      if (z?.kind === 'trigger' && !(isVec3(z.box?.center) && isVec3(z.box?.size))) err(`${zp}.box`, 'Trigger needs a box (center and size).');
    });
    (Array.isArray(l.instances) ? l.instances : []).forEach((n, j) => {
      const np = `${at}.instances[${j}]`;
      seen(`${np}.id`, n?.id);
      if (typeof n?.prefab !== 'string' || !n.prefab) err(`${np}.prefab`, 'Instance needs a prefab.');
      for (const k of ['pos', 'rot', 'scale'] as const) if (!isVec3(n?.[k])) err(`${np}.${k}`, `${k} must be three numbers.`);
      if (isVec3(n?.scale) && n.scale.some(s => s === 0)) warn(`${np}.scale`, 'A scale of 0 makes the piece invisible.');
    });
    (Array.isArray(l.rules) ? l.rules : []).forEach((r, j) => checkRule(`${at}.rules[${j}]`, r, err, seen));
    if (isObj(l.look)) {
      if (l.look.exposure !== undefined && !(Number.isFinite(l.look.exposure) && l.look.exposure > 0)) err(`${at}.look.exposure`, 'Exposure must be above 0.');
      if (l.look.far !== undefined && !(Number.isFinite(l.look.far) && l.look.far > 1)) err(`${at}.look.far`, 'View distance must be above 1 m.');
    }
  });
  if (typeof p.startLevel !== 'string' || !levelIds.has(p.startLevel)) err('startLevel', 'startLevel must name one of the levels.');
  if (!Array.isArray(p.assets)) err('assets', 'assets must be a list.');
  else p.assets.forEach((a, i) => { if (!a?.url) err(`assets[${i}].url`, 'Asset needs a url.'); if (!a?.license) warn(`assets[${i}].license`, 'Asset has no licence recorded.'); });
  if (!Array.isArray(p.rules)) err('rules', 'rules must be a list.');
  else { const ids = new Set<string>(); p.rules.forEach((r, i) => checkRule(`rules[${i}]`, r, err, (path, id) => { if (typeof id !== 'string' || !id || ids.has(id)) err(path, 'Rule needs a unique id.'); else ids.add(id as string); })); }
  return done(issues);
}

function checkRule(at: string, r: any, err: (p: string, m: string) => void, seen: (p: string, id: unknown) => void) {
  if (!isObj(r)) { err(at, 'Rule must be an object.'); return; }
  seen(`${at}.id`, r.id);
  if (!isObj(r.when) || typeof r.when.event !== 'string') err(`${at}.when`, 'Rule needs a "when" event.');
  if (!Array.isArray(r.if)) err(`${at}.if`, 'Rule conditions must be a list.');
  else r.if.forEach((c: any, i: number) => { if (typeof c?.var !== 'string' || !OPS.includes(c?.op)) err(`${at}.if[${i}]`, 'Condition needs a variable and a comparison.'); });
  if (!Array.isArray(r.do) || r.do.length === 0) err(`${at}.do`, 'Rule needs at least one action.');
  else r.do.forEach((a: any, i: number) => { if (typeof a?.action !== 'string') err(`${at}.do[${i}]`, 'Action needs a name.'); });
}

function done(issues: Issue[]): Validation {
  const errors = issues.filter(i => i.level === 'error');
  return { ok: errors.length === 0, errors, warnings: issues.filter(i => i.level === 'warning') };
}
