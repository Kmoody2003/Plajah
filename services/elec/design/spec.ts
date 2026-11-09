// Reading a prompt into a requirement spec (functions and counts, power, connectivity, board,
// market), and deciding whether one of the fixed product recipes covers it or the block engine
// should design it. The on-device model only ever fills the same spec, which is validated here.
// Released by Plajah as public domain (CC0).
import { interpret, fromLlm, RECIPES, type Interpretation } from '../recipes';
import { PI_MODELS } from '../boards';
import { BLOCKS, BLOCK_IDS, blockById } from './blocks';
import type { BlockId, Conn, Need, PowerChoice, Spec } from './types';
import type { McuKind } from './mcus';

export interface SpecReading { spec: Spec; heard: string[]; assumed: string[] }
export type Understanding = { kind: 'recipe'; interp: Interpretation; reading: SpecReading } | { kind: 'design'; reading: SpecReading; interp: Interpretation } | { kind: 'none'; reading: SpecReading; interp: Interpretation };

const WORDNUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, sixteen: 16, twenty: 20, single: 1, dual: 2, double: 2, triple: 3, quad: 4, a: 1, an: 1 };
const NUM = '(\\d+(?:\\.\\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|sixteen|twenty|single|dual|double|triple|quad)';
const numIn = (s: string) => { const n = parseFloat(s); return Number.isFinite(n) ? n : WORDNUM[s.toLowerCase()]; };
const grab = (p: string, unit: string) => { const m = new RegExp(`${NUM}\\s*-?\\s*(?:[a-z-]+\\s+){0,2}?(?:${unit})\\b`, 'i').exec(p); return m ? numIn(m[1]) : undefined; };

/** Count nouns per block (the detection words live on the blocks). */
const COUNT: Partial<Record<BlockId, string>> = { lamp: 'leds?|bulbs?', led: 'leds?|indicators?', neopixel: 'neo ?pixels?|pixels?|leds?', button: 'buttons?|keys?|pads?|switches', encoder: 'encoders?', pot: 'knobs?|pots?|potentiometers?|faders?|sliders?|dials?', soil: 'soil (?:sensors?|probes?)|probes?|plants', servo: 'servos?', motor: 'motors?|wheels?', relay: 'relays?|channels?|outlets?', temp: 'temperature sensors?|sensors?', motion: 'pir sensors?|motion sensors?' };
const DEFAULT_COUNT: Partial<Record<BlockId, number>> = { lamp: 4, neopixel: 8, button: 1, pot: 1, relay: 1, motor: 1, servo: 1, soil: 1, led: 1, encoder: 1 };

export function readSpec(prompt: string): SpecReading {
  const p = ` ${prompt.toLowerCase().replace(/[‐-–]/g, '-')} `; const heard: string[] = []; const assumed: string[] = [];
  const has = (re: RegExp) => re.test(p);
  const found = new Set<BlockId>(BLOCKS.filter(b => b.words.test(p)).map(b => b.id));
  // Disambiguation: lamps, pixels and strips are not indicator LEDs; a light *sensor* is not a lamp; "pots" in a plant prompt are flower pots.
  if (found.has('lamp') || found.has('neopixel') || found.has('strip12')) { if (!/\b(status|indicator)\b/.test(p)) found.delete('led'); }
  if (found.has('neopixel') && found.has('lamp') && !/\b(white|warm)\b/.test(p)) found.delete('lamp');
  if (found.has('strip12') && found.has('neopixel')) found.delete('strip12');
  if (/\bscreen|display\b/.test(p) && found.has('tft')) found.delete('oled');
  if (found.has('soil') && /\bpots?\b/.test(p) && !/\b(knob|potentiometer)/.test(p)) found.delete('pot');
  if (found.has('motor') && /\bfan\b/.test(p) && !/\bmotor\b/.test(p) && found.has('relay')) found.delete('motor');
  if (has(/\bmacro ?pad|keypad|stream deck|shortcut keys?\b/) && !found.has('button')) found.add('button');
  if (has(/\b(robot car|rover|line follower)\b/)) found.add('motor');
  const joysticks = /\bjoysticks?\b/.test(p) ? (grab(p, 'joysticks?') ?? 1) : 0; if (joysticks) { found.add('pot'); found.add('button'); }
  if (found.has('encoder') && found.has('pot') && !grab(p, COUNT.pot!) && !joysticks) found.delete('pot');
  const needs: Need[] = [];
  for (const id of BLOCK_IDS) {
    if (!found.has(id)) continue; const b = blockById(id)!; let count = COUNT[id] ? grab(p, COUNT[id]!) : undefined; const opt: Need['opt'] = {};
    if (id === 'relay') { const ch = grab(p, 'channels?|ch\\b|-channel|gang'); if (ch) count = ch; }
    if (id === 'motor' && !count && has(/\b(robot car|rover|line follower|two wheels)\b/)) count = 2;
    if (id === 'button' && !count && has(/\bmacro ?pad|keypad|stream deck\b/)) count = 6;
    if (joysticks && id === 'pot') count = (count ?? 0) + 2 * joysticks; if (joysticks && id === 'button') count = (count ?? 0) + joysticks;
    if (id === 'neopixel') { const m = /\b(ring|matrix)\b/.exec(p); if (!count && m) count = m[1] === 'ring' ? 12 : 64; }
    if (id === 'strip12') { const w = grab(p, 'w|watts?'); if (w) { opt.watts = Math.min(36, w); heard.push(`${w} W strip`); } }
    if (id === 'distance' && has(/\b(ultrasonic|sonar|hc-?sr04)\b/)) { opt.kind = 'ultrasonic'; heard.push('ultrasonic'); }
    if ((id === 'lamp' || id === 'led') ) for (const c of ['red', 'green', 'yellow', 'blue', 'white']) if (p.includes(` ${c}`)) { opt.color = c; heard.push(c); }
    if (id === 'lamp' && has(/\bdimm(able|er|ing)|brightness (knob|control)\b/)) { opt.dim = true; heard.push('dimmable'); }
    if (id === 'neopixel' && has(/\bbright(est)?\b/)) opt.cap = '0.6';
    const n = Math.max(1, Math.min(id === 'lamp' ? 12 : b.instances ? 120 : b.max, Math.round(count ?? DEFAULT_COUNT[id] ?? 1)));
    needs.push({ block: id, count: n, opt });
    if (count) heard.push(`${n} ${n > 1 ? b.plural : b.label.toLowerCase()}`); else { heard.push(b.label.toLowerCase()); if (DEFAULT_COUNT[id] && DEFAULT_COUNT[id]! > 1) assumed.push(`${n} ${b.plural} (say how many)`); }
  }
  const conn: Conn[] = [];
  if (has(/\bmidi\b/)) conn.push('usb-midi');
  if (has(/\b(usb )?(keyboard|hid|macro ?pad|keypad|stream deck|shortcut|gamepad|mouse)\b/) && !conn.includes('usb-midi')) conn.push('usb-hid');
  if (has(/\b(home ?assistant|hass|esphome)\b/)) conn.push('homeassistant');
  if (has(/\b(wi-?fi|wireless|internet|online|phone|app\b|remote(ly)?|cloud|iot|smart|alexa|google home|network|mqtt)/) || conn.includes('homeassistant')) conn.push('wifi');
  if (has(/\b(bluetooth|ble)\b/)) conn.push('bluetooth');
  const inputs = needs.some(n => ['button', 'encoder', 'pot', 'motion', 'temp', 'light', 'distance', 'soil', 'imu'].includes(n.block));
  if (!conn.length && !inputs && needs.some(n => n.block === 'relay' || n.block === 'strip12' || (n.block === 'lamp' && n.opt?.dim))) { conn.push('wifi'); assumed.push('Wi-Fi control from a phone or Home Assistant (no buttons asked for)'); }
  for (const c of conn) heard.push({ wifi: 'Wi-Fi', bluetooth: 'Bluetooth', homeassistant: 'Home Assistant', 'usb-midi': 'USB MIDI', 'usb-hid': 'USB keyboard (HID)' }[c]);
  let power: PowerChoice = 'auto';
  if (has(/\b(li-?ion|lipo|li-?po|lithium|18650|rechargeable|usb-?c charg\w*|charg(es|ing) (over|via|from) usb|built-in battery)\b/)) power = 'liion';
  else if (has(/\b(aa|aaa|alkaline|battery|batteries|battery-powered|portable|cordless)\b/)) { power = has(/\b(aa|aaa|alkaline)\b/) ? 'aa' : 'liion'; }
  else if (has(/\b(mains|wall power|plugs? into the wall|ac[- ]powered|120 ?v|230 ?v|240 ?v)\b/)) power = 'mains';
  else if (has(/\b12 ?v\b/) && !found.has('strip12')) power = 'adapter12';
  else if (has(/\b(5 ?v adapter|barrel jack|dc jack|power adapter)\b/)) power = 'adapter5';
  else if (has(/\busb\b/)) power = 'usb';
  if (power !== 'auto') heard.push({ usb: 'USB power', liion: 'rechargeable Li-ion', aa: 'AA batteries', adapter5: '5 V adapter', adapter12: '12 V adapter', mains: 'mains powered' }[power]);
  else assumed.push('Power: chosen from the loads (USB, or an adapter for big loads); say "battery" for portable');
  let mcu: Spec['mcu'] = 'auto'; let piModel: string | undefined;
  if (has(/\besp-?32\b/)) mcu = 'esp32'; else if (has(/\b(pico|rp2040|rp2350)\b/)) mcu = 'pico'; else if (has(/\b(arduino|nano|atmega)\b/)) mcu = 'nano';
  else if (has(/\b(raspberry ?pi|rpi|pi ?[345]|pi zero)\b/)) { mcu = 'rpi'; piModel = Object.keys(PI_MODELS).find(k => p.includes(k.toLowerCase())) ?? 'Pi 5'; }
  if (mcu !== 'auto') heard.push(mcu === 'rpi' ? `Raspberry ${piModel}` : mcu === 'esp32' ? 'ESP32' : mcu === 'pico' ? 'Pico' : 'Arduino Nano'); else if (needs.some(n => blockById(n.block)!.needsMcu(n.opt ?? {})) || conn.length) assumed.push('Controller: picked to fit (radio, USB, pins)');
  const market: Spec['market'] = /\b(eu|europe|european|uk|britain|germany|france|230 ?v|240 ?v)\b/.test(p) ? 'EU' : /\b(us|usa|america|canada|120 ?v|110 ?v)\b/.test(p) ? 'US' : 'both';
  if (market !== 'both') heard.push(market === 'EU' ? 'EU/UK market' : 'US market'); else assumed.push('Market: US and EU checks');
  const nm = prompt.trim().replace(/^(i want |make |build |design |create )?(me )?(an? |my |the )?/i, '').split(/\s+(with|that|which|for|using|powered|running|,)\s+|[,.;]/i)[0].trim();
  return { spec: { name: nm ? nm[0].toUpperCase() + nm.slice(1, 48) : 'Custom design', needs, mcu, power, conn: [...new Set(conn)], market, piModel }, heard: [...new Set(heard)], assumed };
}

/** Does a fixed recipe fully serve this spec? (Otherwise the engine designs it.) */
export function recipeCovers(id: string, s: Spec): boolean {
  const ids = s.needs.map(n => n.block); const only = (...a: BlockId[]) => ids.every(x => a.includes(x)); const cnt = (b: BlockId) => s.needs.find(n => n.block === b)?.count ?? 0;
  const conn = (...a: Conn[]) => s.conn.every(c => a.includes(c)); const power = (...a: PowerChoice[]) => a.includes(s.power); const mcu = (...a: Array<Spec['mcu']>) => a.includes(s.mcu);
  switch (id) {
    case 'guitar': case 'charger': return true;
    case 'lamp': return only('lamp', 'led') && conn() && power('auto', 'usb', 'aa') && mcu('auto', 'none') && !s.needs.some(n => n.opt?.dim);
    case 'smart-lamp': return only('strip12', 'lamp') && conn('wifi', 'homeassistant') && power('auto', 'adapter12') && mcu('auto', 'esp32');
    case 'speaker': return only('speaker') && conn() && power('auto', 'usb', 'aa', 'liion') && mcu('auto', 'none');
    case 'midi': return only('pot', 'button', 'led') && cnt('pot') <= 3 && cnt('button') <= 7 && cnt('led') <= 1 && conn('usb-midi') && power('auto', 'usb') && mcu('auto', 'pico');
    case 'sensor': return only('temp', 'led') && cnt('temp') <= 1 && conn('wifi', 'homeassistant') && power('auto', 'usb') && mcu('auto', 'esp32');
    case 'pi': return s.mcu === 'rpi' && only('temp', 'button', 'led') && cnt('button') <= 1 && cnt('led') <= 1 && power('auto', 'usb');
    default: return false;
  }
}

export function understand(prompt: string): Understanding {
  const interp = interpret(prompt); const reading = readSpec(prompt); return route(interp, reading);
}
function route(interp: Interpretation, reading: SpecReading): Understanding {
  if (interp.recipe && recipeCovers(interp.recipe.id, reading.spec)) return { kind: 'recipe', interp, reading };
  if (reading.spec.needs.length) return { kind: 'design', reading, interp };
  if (interp.recipe) return { kind: 'recipe', interp, reading };
  return { kind: 'none', reading, interp };
}

// ---------------------------------------------------------------- on-device model (desktop app first)
export function designLlmPrompt(prompt: string): Array<{ role: 'system' | 'user'; content: string }> {
  const blocks = BLOCKS.map(b => `- ${b.id}: ${b.label} (max ${b.instances ? 'see about' : b.max})${b.opts ? `; opt ${b.opts.map(o => `${o.key}${o.choices ? `=${o.choices.join('|')}` : ''}`).join(', ')}` : ''}`).join('\n');
  const recipes = RECIPES.map(r => `- ${r.id}: ${r.title}`).join('\n');
  return [{ role: 'system', content: `You turn a maker's product request into a requirement spec. Never invent circuits or parts: only choose from these blocks.\nBlocks:\n${blocks}\nFixed product recipes (use one only when it fits exactly):\n${recipes}\nReply with JSON only: {"recipe": "<recipe id or null>", "spec": {"name": "...", "needs": [{"block": "<id>", "count": 1, "opt": {}}], "mcu": "auto|none|esp32|pico|nano|rpi", "power": "auto|usb|liion|aa|adapter5|adapter12|mains", "conn": ["wifi"|"bluetooth"|"homeassistant"|"usb-midi"|"usb-hid"], "market": "US|EU|both"}}` }, { role: 'user', content: prompt }];
}
/** Validate the model's reply: unknown blocks, options, counts out of range fall back to the rules. */
export function specFromLlm(reply: string, prompt: string): SpecReading {
  const base = readSpec(prompt);
  try {
    const j = JSON.parse(reply.slice(reply.indexOf('{'), reply.lastIndexOf('}') + 1)); const s = j.spec ?? j; if (!Array.isArray(s.needs)) return base;
    const needs: Need[] = [];
    for (const n of s.needs) {
      const b = blockById(String(n?.block)); if (!b || needs.some(x => x.block === b.id)) continue;
      const count = Math.max(1, Math.min(b.id === 'lamp' ? 12 : b.instances ? 120 : b.max, Math.round(Number(n.count) || 1))); const opt: Need['opt'] = {};
      for (const o of b.opts ?? []) { const v = n.opt?.[o.key]; if (v === undefined) continue; if (o.choices ? o.choices.includes(String(v)) : Number.isFinite(Number(v))) opt[o.key] = o.choices ? String(v) : Number(v); }
      if (b.id === 'lamp' && n.opt?.dim === true) opt.dim = true;
      needs.push({ block: b.id, count, opt });
    }
    if (!needs.length) return base;
    const mcu = ['auto', 'none', 'esp32', 'pico', 'nano', 'rpi'].includes(s.mcu) ? s.mcu as Spec['mcu'] : base.spec.mcu;
    const power = ['auto', 'usb', 'liion', 'aa', 'adapter5', 'adapter12', 'mains'].includes(s.power) ? s.power as PowerChoice : base.spec.power;
    const conn = Array.isArray(s.conn) ? s.conn.filter((c: string) => ['wifi', 'bluetooth', 'homeassistant', 'usb-midi', 'usb-hid'].includes(c)) as Conn[] : base.spec.conn;
    const market = s.market === 'US' || s.market === 'EU' ? s.market : base.spec.market;
    const name = typeof s.name === 'string' && s.name.trim() ? s.name.trim().slice(0, 48) : base.spec.name;
    return { spec: { name, needs, mcu: mcu as McuKind | 'auto' | 'none', power, conn, market, piModel: base.spec.piModel }, heard: ['read by the on-device model', ...needs.map(n => `${n.count} × ${blockById(n.block)!.label}`)], assumed: base.assumed.filter(a => a.startsWith('Market') || a.startsWith('Controller')) };
  } catch { return base; }
}
export function understandFromLlm(reply: string, prompt: string): Understanding {
  const reading = specFromLlm(reply, prompt); let interp = interpret(prompt);
  try { const j = JSON.parse(reply.slice(reply.indexOf('{'), reply.lastIndexOf('}') + 1)); if (j.recipe) interp = fromLlm(JSON.stringify({ recipe: j.recipe, values: j.values ?? {}, market: j.spec?.market }), prompt); } catch { /* rules */ }
  return route(interp, reading);
}
