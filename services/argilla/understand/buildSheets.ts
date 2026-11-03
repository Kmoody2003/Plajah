/**
 * buildSheets.ts — what a recognized thing is normally made from, so a blue shirt on an officer is uniform twill and not
 * just a blue surface.
 *
 * This is an expectation, never a fact. The picture can overrule any line of it. Things not listed here go to the
 * on-device model, whose answer has to pass parseSheetAnswer. To add a kind, add it here and re-run
 * scripts/argilla/embedCodexPhrases.ts.
 */

import { MATERIAL_BY_ID, MATERIALS } from './materials';

export interface SheetLine {
  name: string;
  material: string;
  /** Almost always there, so its absence from the picture is worth saying. Otherwise only used if it's seen. */
  usual: boolean;
  /** Where it normally sits on the subject. A piece elsewhere is unlikely to be this. */
  at?: 'top' | 'middle' | 'bottom';
  /** How much of the subject it normally covers: under 1%, about 1 to 6%, or over 5%. */
  size?: 'tiny' | 'small' | 'large';
  /** A strap, cable or antenna: a thin sliver rather than a solid patch. */
  thin?: boolean;
}

export interface KindSheet { kind: string; lines: SheetLine[] }

/** "name:material" is a part usually there; a trailing ? is only sometimes there; @top and ~small say where and how big, ^ means thin. */
const kind = (name: string, lines: string): KindSheet => ({
  kind: name,
  lines: lines.trim().split(/\s*,\s*/).map((line) => {
    const usual = !line.endsWith('?');
    const [part, rest] = line.replace(/\?$/, '').split(':');
    const material = rest.split(/[@~^]/)[0];
    const at = rest.match(/@(top|middle|bottom)/)?.[1] as SheetLine['at'];
    const size = rest.match(/~(tiny|small|large)/)?.[1] as SheetLine['size'];
    return { name: part, material, usual, ...(at && { at }), ...(size && { size }), ...(rest.includes('^') && { thin: true }) };
  }),
});

export const KIND_SHEETS: KindSheet[] = [
  kind('police officer in uniform', 'uniform top:poly-twill@middle~large, uniform trousers:poly-twill@bottom~large, police badge:brass~tiny, medal:brass@middle~tiny?, medal ribbon:silk@middle~tiny?, uniform button:brass@middle~tiny?, chest pocket:poly-twill@middle~small?, collar:poly-twill@middle~small?, duty belt:polished-leather@middle~small?, belt buckle:brass@middle~tiny?, holster:polished-leather@middle~small?, police radio:plastic@middle~small?, handcuff pouch:polished-leather@middle~tiny?, boots:polished-leather@bottom~small?, police helmet:wool@top~small?, peaked cap:poly-twill@top~small?, chin strap:leather@top~tiny^?, necktie:silk@middle~small?, face:skin@top~small, hair:hair@top~small?, hand:skin~small?'),
  kind('soldier in military uniform', 'combat jacket:poly-twill, combat trousers:poly-twill, helmet:painted-metal?, combat boots:leather, tactical vest:nylon?, backpack:nylon?, face:skin, hand:skin'),
  kind('firefighter in protective gear', 'turnout coat:nylon, turnout trousers:nylon, fire helmet:plastic, rubber boots:rubber, gloves:leather?, breathing tank:steel?, face:skin'),
  kind('doctor or nurse in scrubs', 'scrub top:cotton, scrub trousers:cotton, white coat:cotton?, stethoscope:rubber?, shoes:plastic?, face:skin, hand:skin'),
  kind('person in a business suit', 'suit jacket:wool, suit trousers:wool, dress shirt:cotton, necktie:silk?, dress shoes:polished-leather, face:skin, hair:hair?, hand:skin'),
  kind('person in casual clothes', 't-shirt:cotton, jeans:denim, sneakers:rubber, jacket:cotton?, face:skin, hair:hair?, hand:skin'),
  kind('person in a dress', 'dress:silk, shoes:polished-leather?, face:skin, hair:hair?, arm:skin'),
  kind('knight in medieval armor', 'breastplate:steel, helmet:steel, gauntlet:steel, greaves:steel, chain mail:iron?, cape:wool?, sword:steel?, shield:painted-metal?'),
  kind('werewolf', 'fur coat:fur, muzzle:hide, teeth:ceramic, claws:ceramic, eyes:glass, torn trousers:denim?'),
  kind('wolf or dog', 'fur coat:fur, nose:rubber, eyes:glass, teeth:ceramic?, claws:ceramic?, collar:leather?'),
  kind('propeller airplane', 'fuselage:aluminium~large, wing:aluminium~small, propeller:steel~small, engine:iron~small, tail fin:aluminium~small, cockpit window:glass@top~tiny, cabin window:glass~tiny?, landing gear:steel@bottom~small, tire:rubber@bottom~small'),
  kind('jet airliner', 'fuselage:painted-metal, wing:aluminium, jet engine:aluminium, tail fin:painted-metal, cabin window:glass, landing gear:steel?, tire:rubber?'),
  kind('car', 'car body:painted-metal, window:glass, tire:rubber, wheel rim:steel, headlight:glass, bumper:plastic, grille:chrome?, mirror:plastic?'),
  kind('motorcycle', 'fuel tank:painted-metal, engine:aluminium, exhaust pipe:chrome, tire:rubber, wheel rim:steel, seat:leather, handlebar:chrome'),
  kind('bicycle', 'frame:painted-metal, tire:rubber, wheel rim:aluminium, handlebar:steel, seat:leather, chain:steel, pedal:plastic'),
  kind('ship or boat', 'hull:painted-metal, deck:wood, mast:wood?, sail:cotton?, cabin:painted-metal?, railing:steel?'),
  kind('acoustic guitar', 'guitar body:varnished-wood, soundboard:varnished-wood, neck:wood, fretboard:wood, tuning pegs:chrome, strings:steel, bridge:wood'),
  kind('electric guitar', 'guitar body:varnished-wood, neck:wood, fretboard:wood, pickups:chrome, tuning pegs:chrome, strings:steel, pickguard:plastic?'),
  kind('hand drum', 'drum head:hide, drum shell:varnished-wood, metal rim:steel?, lug:chrome?, rope:cotton?'),
  kind('drum kit drum', 'drum head:plastic, drum shell:varnished-wood, metal rim:chrome, lug:chrome'),
  kind('wooden chair', 'seat:wood, backrest:wood, chair leg:wood, cushion:cotton?'),
  kind('leather sofa', 'sofa cushion:leather, armrest:leather, sofa leg:wood?'),
  kind('dining table', 'table top:varnished-wood, table leg:wood'),
  kind('table lamp', 'lamp shade:cotton, lamp base:ceramic, light bulb:glass?, power cord:rubber?'),
  kind('sword', 'blade:steel, hilt:brass, grip:leather, pommel:brass?'),
  kind('treasure chest', 'chest body:wood, iron band:iron, lock:brass, hinge:iron?'),
  kind('pair of boots', 'boot upper:leather, sole:rubber, laces:cotton?, eyelet:brass?'),
  kind('backpack', 'pack body:nylon, shoulder strap:nylon, zipper:steel, buckle:plastic?'),
  kind('ceramic vase', 'vase body:ceramic, glaze pattern:ceramic?'),
  kind('glass bottle', 'bottle:glass, cap:steel?, label:paper?'),
  kind('robot', 'torso plate:painted-metal, arm:steel, joint:rubber?, head:painted-metal, sensor eye:glass?, cable:rubber?'),
  kind('house or building', 'wall:concrete, roof:stone, window:glass, door:wood, chimney:stone?'),
  kind('tree or plant', 'trunk:wood, branch:wood, leaves:foliage'),
];

export const SHEET_BY_KIND = new Map(KIND_SHEETS.map((s) => [s.kind, s]));

/** Words that don't describe a part but are worth having to tell one from another. */
export const COMMON_PARTS = [
  'face', 'hair', 'hand', 'arm', 'leg', 'head', 'shirt', 'trousers', 'jacket', 'coat', 'shoe', 'hat', 'belt', 'glasses', 'pocket', 'collar', 'button',
  'badge', 'logo', 'patch', 'wheel', 'handle', 'door', 'window', 'lid', 'base', 'stand', 'screen', 'cable', 'strap', 'buckle', 'zipper', 'knob', 'lens', 'light', 'tail', 'ear', 'eye', 'horn', 'wing', 'body', 'frame', 'panel',
];

/** Every part name the vision model has been taught. */
export const ALL_PART_NAMES = [...new Set([...KIND_SHEETS.flatMap((s) => s.lines.map((l) => l.name)), ...COMMON_PARTS])];

/** The kind typed words mean, if any kind's name shares its main words. */
export function sheetFromWords(words: string): KindSheet | null {
  const typed = new Set(words.toLowerCase().match(/[a-z]+/g) ?? []);
  let best: KindSheet | null = null, bestHits = 0;
  for (const sheet of KIND_SHEETS) {
    const hits = (sheet.kind.match(/[a-z]+/g) ?? []).filter((w) => w.length > 3 && typed.has(w)).length;
    if (hits > bestHits) { best = sheet; bestHits = hits; }
  }
  return best;
}

export function sheetPrompt(what: string) {
  return `You describe how real objects are constructed, for a 3D modeling tool. The user names an object. List the physical parts it is normally made of.
Answer with JSON only: {"parts":[{"name":"part name","material":"id","usual":true}]}
At most 12 parts, each named in one to three lowercase words. "usual" is false for parts it only sometimes has.
"material" must be exactly one of: ${MATERIALS.map((m) => m.id).join(', ')}.
Object: ${what}`;
}

/** The model's answer, with anything that doesn't fit thrown away. Null when nothing usable is left. */
export function parseSheetAnswer(what: string, text: string): KindSheet | null {
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(text.slice(start, end + 1)); } catch { return null; }
  const parts = (parsed as { parts?: unknown })?.parts;
  if (!Array.isArray(parts)) return null;
  const seen = new Set<string>();
  const lines: SheetLine[] = [];
  for (const raw of parts.slice(0, 12)) {
    const name = typeof raw?.name === 'string' ? raw.name.trim().toLowerCase().slice(0, 40) : '';
    if (!name || seen.has(name) || !MATERIAL_BY_ID.has(raw?.material)) continue;
    seen.add(name);
    lines.push({ name, material: raw.material, usual: raw.usual !== false });
  }
  return lines.length ? { kind: what, lines } : null;
}
