# Arena capabilities — what a given space can host

Vehicles, turrets, power-up pads and melee are not global features. They are
**capabilities a specific arena declares**, gated by what the space and its operator can
safely support. A living room hosts none of them; a surveyed venue with anchors, a
marshal and an e-stop can host all of them. `Arena.capabilities` is where this lives, and
it is read-only to the game — the operator's survey sets it, the session consumes it.

## The capability gate

| Capability | Where it can run | Why gated |
|---|---|---|
| **melee** | Household, venue, institution | Needs the no-contact rule and a soft certified prop (ADR-0009); off by default for the youngest tiers |
| **turrets** | Venue (wired), household (toy-tier) | A `mounted` fixture must be surveyed into the arena |
| **power-ups** | Any | Reuses `Objective`/`Zone`; purely additive, non-violent |
| **vehicles** | **Venue only** | Continuous UWB, operator, marshal, host e-stop, certified governed vehicle (ADR-0010) |

## Turrets — a weapon bound to the arena, not a player

A turret is a **station**: a surveyed fixture at a fixed position hosting the `mounted`
weapon class. A player occupies it — strong cone, no lock delay, but stationary and
exposed. In a venue it can be wired, so overwatch's `door` verb generalises to "toggle a
fixture" (power a turret on for a teammate) — enabling, never firing. A household
toy-tier turret is a lower-fidelity version of the same station concept.

## Vehicles — the Mario-Kart layer, venue only

See ADR-0010. A vehicle is a **platform (a surface)** that supplies continuous
localization and may mount a weapon; the occupant is still resolved server-side.

- **Bumper mode** is the safe default: low-speed, enclosed, collision-designed, tag on
  impact/proximity — the bumper car's own mechanic. Family- and event-friendly.
- **Kart mode** is a higher venue tier behind height/age/marshal gates: governed karts,
  a mounted weapon, and power-up pads.
- **Crewed (Warthog)** is two on-site operatives on one platform — a driver (movement,
  no turret) and a gunner (the `mounted` class). Overwatch may ping for the gunner; it
  never drives and never fires (ADR-0001).
- **Power-up pads** are `Objective`/`Zone` variants: rolling over one grants a temporary
  weapon, boost or shield. Playful, non-violent, and no new system.
- **The host e-stop** halts every vehicle in the arena at once. Required, and tested
  before it is needed.

## Sequencing

Capabilities layer onto the core; they do not gate it. The phone-only pilot and the
household beta ship with **none** of them, because their job is to prove people show up
and that a room scan is worth doing (roadmap.md). Melee and turrets arrive with the
household/retail tiers; vehicles are a venue-and-retail-tier attraction and the
highest-liability surface in the product. Build them in that order, not first.

## What it needs from the schema

`Arena` gains `capabilities` (a small flag set), a `stations` list (surveyed turret
fixtures), and `Zone.role` gains a power-up role. `Session` gains an optional vehicle
occupancy on `Participant` (which platform a player is on, and their crew seat). All
additive; none of it changes how a hit resolves.
