// Rift Realm's controls as remappable actions (services/input/remap.ts). `canonical` is the input the game's own
// code listens for (player.ts, controls.ts, combat/melee.ts, danger/eat.ts, main.ts); the player's bindings are
// translated onto it, so remapping needs no changes in those files.
//
// Third person plays like Gears of War (over the shoulder, A / D strafe, the mouse turns the camera, Q swaps shoulder),
// with right mouse kept for melee (Kenne) and aiming down sights on Z / LT. First person: Q is a quick 180.
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
  { id: 'jump', label: 'Jump / double jump / swim up / wall-kick', group: 'Movement', canonical: K('Space'), defaults: [K('Space')], padCanonical: 0 },
  { id: 'dash', label: 'Dash / swim surge', group: 'Movement', canonical: K('ShiftLeft'), defaults: [K('ShiftLeft')], padCanonical: 1 },
  { id: 'crouch', label: 'Crouch / dive / drop off cliff', group: 'Movement', canonical: K('KeyC'), defaults: [K('KeyC')], padCanonical: 13 },
  { id: 'grapple', label: 'Grappling hook (Stalker / Sylva)', group: 'Movement', canonical: K('KeyE'), defaults: [K('KeyE')] },
  // combat
  { id: 'fire', label: 'Fire (fists: light attack)', group: 'Combat', canonical: M(0), defaults: [M(0)], padCanonical: 7 },
  { id: 'melee', label: 'Melee strike (fists: heavy)', group: 'Combat', canonical: M(2), defaults: [M(2)] },
  { id: 'light', label: 'Light strike / finisher', group: 'Combat', canonical: K('KeyF'), defaults: [K('KeyF')], padCanonical: 2 },
  { id: 'heavy', label: 'Heavy strike', group: 'Combat', canonical: K('KeyG'), defaults: [K('KeyG')] },
  { id: 'guard', label: 'Guard / parry (hold)', group: 'Combat', canonical: K('KeyX'), defaults: [K('KeyX'), M(4)], padCanonical: 11 },
  { id: 'aim', label: 'Aim (hold) — zoom over the shoulder', group: 'Combat', canonical: K('KeyZ'), defaults: [K('KeyZ')], padCanonical: 6 },
  { id: 'shoulder', label: 'Swap shoulder (1st person: quick 180)', group: 'Combat', canonical: K('F8'), defaults: [K('KeyQ')] },
  { id: 'lock', label: 'Lock on', group: 'Combat', canonical: K('Tab'), defaults: [K('Tab')] },
  { id: 'reload', label: 'Reload', group: 'Combat', canonical: K('KeyR'), defaults: [K('KeyR')], padCanonical: 14 },
  // specials and weapons (the number row)
  { id: 'vessel1', label: 'Vessel 1 — Aegis · Halo Lance', group: 'Specials & weapons', canonical: K('Digit1'), defaults: [K('Digit1')] },
  { id: 'vessel2', label: 'Vessel 2 — Stalker · Rift Scatter', group: 'Specials & weapons', canonical: K('Digit2'), defaults: [K('Digit2')] },
  { id: 'vessel3', label: 'Vessel 3 — Seraph · Chord Repeater', group: 'Specials & weapons', canonical: K('Digit3'), defaults: [K('Digit3')] },
  { id: 'surge', label: 'Soul Surge (special)', group: 'Specials & weapons', canonical: K('KeyQ'), defaults: [K('Digit4'), M(3)], padCanonical: 3 },
  { id: 'fists', label: 'Gun ⇄ fists', group: 'Specials & weapons', canonical: M(1), defaults: [K('Digit5'), M(1)], padCanonical: 15 },
  // other
  { id: 'eat', label: 'Pick up weapon/gear · eat/drink (hold) · gather (tap)', group: 'Other', canonical: K('KeyH'), defaults: [K('KeyH')], padCanonical: 12 },
  { id: 'loadout', label: 'Armory & custom loadouts', group: 'Specials & weapons', canonical: K('KeyL'), defaults: [K('KeyL')] },
  // the living forest (danger/inventory.ts, danger/bonds.ts)
  { id: 'pray', label: 'Pray (hold)', group: 'Forest', canonical: K('KeyT'), defaults: [K('KeyT')], padCanonical: 10 },
  { id: 'bag', label: 'Bag (inventory)', group: 'Forest', canonical: K('KeyI'), defaults: [K('KeyI')] },
  { id: 'warden', label: 'Warden: call (hold) · assist (tap)', group: 'Forest', canonical: K('KeyY'), defaults: [K('KeyY')] },
  { id: 'quick1', label: 'Quick slot 1', group: 'Forest', canonical: K('Digit6'), defaults: [K('Digit6')] },
  { id: 'quick2', label: 'Quick slot 2', group: 'Forest', canonical: K('Digit7'), defaults: [K('Digit7')] },
  { id: 'quick3', label: 'Quick slot 3', group: 'Forest', canonical: K('Digit8'), defaults: [K('Digit8')] },
  { id: 'quick4', label: 'Quick slot 4', group: 'Forest', canonical: K('Digit9'), defaults: [K('Digit9')] },
  { id: 'view', label: '1st / 3rd person', group: 'Other', canonical: K('KeyV'), defaults: [K('KeyV')], padCanonical: 8 },
  { id: 'realm', label: 'Switch realm', group: 'Other', canonical: K('KeyB'), defaults: [K('KeyB')] },
  { id: 'skip', label: 'Skip song', group: 'Other', canonical: K('KeyN'), defaults: [K('KeyN')] },
];

let target: () => EventTarget | null = () => null;
let active: () => boolean = () => false;
/** The game's remapper (one per page). main.ts points it at the canvas and tells it when play is live. */
export const remap = new InputRemap('rift-realm-bindings', RR_ACTIONS, () => target(), () => active());
export function wireRemap(o: { target: () => EventTarget | null; active: () => boolean }) { target = o.target; active = o.active; remap.install(); }
