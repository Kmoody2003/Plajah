# Loadout — weapons, skins and shields

See ADR-0009 for the governing split. The one-line version: **class and archetype are
server-side balance; the form is a cosmetic skin.** A wand, a laser sword and a blaster
are the same three-layer model wearing different clothes.

## The three layers

| Layer | What it is | Where it lives |
|---|---|---|
| **Class** | How the hit resolves | server |
| **Archetype** | The balance unit (a sidegrade) | server |
| **Skin** | The physical / rendered form | cosmetic |

### Classes

- **ranged** — a ray from the shooter's server-known position along their bearing, cone
  + range against the arena survey. The original blaster path. A *wand* is this class.
  A wand variant may resolve a small **splash** at the impact point instead of a single
  ray — an area check against the survey, the one genuinely new resolution added here.
- **melee** — resolved on **proximity plus a swing gesture**, not a bearing cone. You
  must physically close distance; spacing is the counterplay. A *laser sword* is this
  class. **No-contact rule:** resolution is spatial — players never need to touch, and
  the certified prop is soft with no rigid core. An actual strike is a safety failure,
  not a hit.
- **mounted** — a ranged class bound to an **arena fixture** (a turret station) instead
  of a player device. Strong cone, no lock delay, but you are stationary and exposed
  while manning it. Overwatch may enable or disable a wired station (the `door` verb
  generalised to a fixture) but never fires it.
- **defensive** — a **shield**. While raised, it blocks incoming hits inside a facing
  arc; it does not block a flank or a melee closer, and raising it slows you and occupies
  a hand. Portable cover you carry, resolved the same way as the survey's fixed cover.

### Archetypes are sidegrades, not upgrades

Blade beats an unshielded ranged player up close; ranged beats a blade at distance; a
raised shield beats frontal ranged fire but not a flank or a closer. No archetype
dominates. A dominant archetype is a bug, watched like the casual/ranked ratio in
ADR-0004. Cosmetic skins **never** change a stat — that is what keeps the creator-made
weapon skins from becoming pay-to-win.

## Every archetype works on every tier

A phone player can run any archetype: the wand aims by facing, the blade closes distance
and swings (accelerometer), the shield raises by orientation. A certified prop makes it
*feel* better — a real blade, a real wand with haptics — it never makes it *hit* better.
Fidelity, never advantage; the same rule as the glasses (ADR-0007).

## Optics: fantasy forms are the default, not the exception

A glowing wand, an energy blade and a light shield read as make-believe. Non-gun skins
become the default aesthetic; a realistic blaster is the constrained, marking-heavy
exception. This is a safety asset — see safety.md — as well as the whole whimsical tone
the brand is reaching for.

## What it needs from the schema

`src/types/loadout.ts` (new): `WeaponClass`, `WeaponArchetype`, `WeaponSkin`, `Loadout`.
`Participant` carries a `loadout`. `HitEvent` records the class and archetype that
resolved it, plus `shieldBlockedBy` alongside the existing `losBlockedBy`. Skins ride
the platform's existing content/commerce rails, not a private path.
