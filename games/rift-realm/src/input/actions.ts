// Rift Realm's controls as remappable actions (services/input/remap.ts). `canonical` is the input the game's own
// code listens for (player.ts, controls.ts, combat/melee.ts, danger/eat.ts, main.ts); the player's bindings are
// translated onto it, so remapping needs no changes in those files.
//
// Third person plays like Gears of War: right mouse aims (zooms over the shoulder), left fires, F melee, Q swaps
// shoulder, A / D strafe with the camera on the mouse.
// Defaults (Kenne): the specials sit on the number row above WASD, and the mouse's extra side buttons come premapped —
// Mouse 4 (back) = Soul Surge, Mouse 5 (forward) = Guard. Mice whose driver sends number keys for their side buttons
// (many Razer mice) land on the number-row specials as they are.
import { InputRemap, type ActionDef, type Bind } from '../../../../services/input/remap';

const K = (code: string): Bind => ({ t: 'key', code });
const M = (b: number): Bind => ({ t: 'mouse', b });

export const RR_ACTIONS: ActionDef[] = [
  // movement
  { id: 'forward', label: 'Move forward', group: 'Movement', canonical: K('KeyW'), defaults: [K('KeyW'), K('ArrowUp')] },
  { id: 'back', label: 'Move back', group: 'Movement', canonical: K('KeyS'), defaults: [K('KeyS'), K('ArrowDown')] },
  { id: 'left', label: 'Turn / strafe left', group: 'Movement', canonical: K('KeyA'), defaults: [K('KeyA'), K('ArrowLeft')] },
  { id: 'right', label: 'Turn / strafe right', group: 'Movement', canonical: K('KeyD'), defaults: [K('KeyD'), K('ArrowRight')] },
  { id: 'jump', label: 'Jump / glide', group: 'Movement', canonical: K('Space'), defaults: [K('Space')], padCanonical: 0 },
  { id: 'dash', label: 'Dash', group: 'Movement', canonical: K('ShiftLeft'), defaults: [K('ShiftLeft')], padCanonical: 1 },
  { id: 'crouch', label: 'Crouch (toggle)', group: 'Movement', canonical: K('KeyC'), defaults: [K('KeyC')], padCanonical: 13 },
  // combat
  { id: 'fire', label: 'Fire (fists: light attack)', group: 'Combat', canonical: M(0), defaults: [M(0)], padCanonical: 7 },
  { id: 'melee', label: 'Melee strike (fists: heavy)', group: 'Combat', canonical: M(2), defaults: [] },
  { id: 'light', label: 'Light strike / finisher', group: 'Combat', canonical: K('KeyF'), defaults: [K('KeyF'), K('KeyE')], padCanonical: 2 },
  { id: 'heavy', label: 'Heavy strike', group: 'Combat', canonical: K('KeyG'), defaults: [K('KeyG')] },
  { id: 'guard', label: 'Guard / parry (hold)', group: 'Combat', canonical: K('KeyX'), defaults: [K('KeyX'), M(4)], padCanonical: 11 },
  { id: 'aim', label: 'Aim (hold) — zoom over the shoulder', group: 'Combat', canonical: K('KeyZ'), defaults: [M(2), K('KeyZ')], padCanonical: 6 },
  { id: 'shoulder', label: 'Swap shoulder', group: 'Combat', canonical: K('F8'), defaults: [K('KeyQ')] },
  { id: 'lock', label: 'Lock on', group: 'Combat', canonical: K('Tab'), defaults: [K('Tab')] },
  { id: 'reload', label: 'Reload', group: 'Combat', canonical: K('KeyR'), defaults: [K('KeyR')], padCanonical: 14 },
  // specials and weapons (the number row)
  { id: 'vessel1', label: 'Vessel 1 — Aegis · Halo Lance', group: 'Specials & weapons', canonical: K('Digit1'), defaults: [K('Digit1')] },
  { id: 'vessel2', label: 'Vessel 2 — Stalker · Rift Scatter', group: 'Specials & weapons', canonical: K('Digit2'), defaults: [K('Digit2')] },
  { id: 'vessel3', label: 'Vessel 3 — Seraph · Chord Repeater', group: 'Specials & weapons', canonical: K('Digit3'), defaults: [K('Digit3')] },
  { id: 'surge', label: 'Soul Surge (special)', group: 'Specials & weapons', canonical: K('KeyQ'), defaults: [K('Digit4'), M(3)], padCanonical: 3 },
  { id: 'fists', label: 'Gun ⇄ fists', group: 'Specials & weapons', canonical: M(1), defaults: [K('Digit5'), M(1)], padCanonical: 15 },
  // other
  { id: 'eat', label: 'Eat / drink (hold)', group: 'Other', canonical: K('KeyH'), defaults: [K('KeyH')], padCanonical: 12 },
  { id: 'view', label: '1st / 3rd person', group: 'Other', canonical: K('KeyV'), defaults: [K('KeyV')], padCanonical: 8 },
  { id: 'realm', label: 'Switch realm', group: 'Other', canonical: K('KeyB'), defaults: [K('KeyB')] },
  { id: 'skip', label: 'Skip song', group: 'Other', canonical: K('KeyN'), defaults: [K('KeyN')] },
];

let target: () => EventTarget | null = () => null;
let active: () => boolean = () => false;
/** The game's remapper (one per page). main.ts points it at the canvas and tells it when play is live. */
export const remap = new InputRemap('rift-realm-bindings', RR_ACTIONS, () => target(), () => active());
export function wireRemap(o: { target: () => EventTarget | null; active: () => boolean }) { target = o.target; active = o.active; remap.install(); }
