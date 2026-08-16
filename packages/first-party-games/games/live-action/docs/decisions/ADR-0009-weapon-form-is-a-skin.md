# ADR-0009 — Weapon form is a skin; the archetype is server-side; archetypes are sidegrades

**Status:** accepted · **Date:** 2026-08

## Context

The design so far assumed one weapon: a blaster that casts a ray. The product wants
more — wands that blast, laser swords, energy shields, mounted turrets — and it wants
them without turning a clean, server-authoritative game into a pay-to-win gear ladder,
and without any of them reading as a firearm on a public sidewalk.

Two traps sit here. The first is letting the *physical object* carry the stats, which
makes the expensive prop win and collapses the cross-tier fairness of ADR-0004. The
second is letting variety become a power ladder, where the newest weapon is simply the
best and everyone converges on it.

## Decision

Split a weapon into three layers, exactly as ADR-0007 split the render surface from the
tier:

1. **Class** — how it resolves, server-side. `ranged` (ray + cone + range, the existing
   blaster path), `melee` (resolved by *proximity*, not bearing — you must physically
   close distance), `mounted` (a ranged class bound to an arena fixture, not a player —
   turrets), `defensive` (a shield: blocks incoming hits from a facing arc while raised).
2. **Archetype** — the balance unit, also server-side: blaster, wand, blade, turret,
   shield, and so on. Archetypes are **sidegrades, not upgrades** — a rock-paper-scissors
   spread (blade beats an unshielded ranged player up close; ranged beats a blade at
   distance; a raised shield beats frontal ranged fire but not a flank or a melee closer).
   No archetype is strictly better than another. This is as load-bearing as "vitals never
   score" — an archetype that dominates is a bug, watched like the casual/ranked ratio.
3. **Skin** — the physical or rendered *form*: a gun, a wand, a lightsaber, a glowing
   rune. **Purely cosmetic. A skin never touches a stat.** A "magic wand" is the ranged
   archetype wearing a wand; a "laser sword" is the melee archetype wearing a blade.

The archetype is available on every tier. A phone player can run the melee archetype
(hold the phone out, close distance, swing — accelerometer gesture) or the wand
(aim by facing). A certified prop makes it feel better; it does not make it hit harder.
Fidelity, never advantage — the same rule as the glasses.

## Consequences

- **Optics improve.** Fantasy forms — wands, blades, shields, glowing effects — read as
  make-believe, not weapons. Non-gun skins become the *default* aesthetic; a realistic
  blaster is the constrained, marking-heavy exception, not the norm. This is a safety
  asset, not just flavour (see safety.md).
- **A creator economy falls out.** Skins and weapon effects are cosmetic content — which
  is exactly what Plajah's creators already make. Weapon skins ride the existing content
  and commerce rails; they cannot be pay-to-win because a skin cannot change a stat.
- **Melee needs a no-contact rule.** A blade resolves on *spatial proximity plus a swing
  gesture*, never on an actual strike. Two players never need to physically touch, and
  the certified prop is soft with no rigid core. Contact is a safety failure, not a hit.
- **Loadout becomes real state.** `Participant` gains a loadout (primary archetype + skin,
  optional shield). Ranked may restrict the archetype set; casual mixes and balances.
- Cost: balancing a rock-paper-scissors set across mixed tiers is ongoing work, and
  "sidegrade not upgrade" has to be defended every time a new archetype is proposed.

## Rejected alternatives

- **Stats on the physical weapon.** Reintroduces the pay-to-win the whole tier model
  avoids, and makes every new licensed prop a balance renegotiation.
- **A single weapon with attachments.** Cleaner to balance, but throws away the variety
  and the whimsy that make the fantasy forms worth having.
