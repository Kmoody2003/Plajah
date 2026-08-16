# Live-Action

**Status: design only.** No runtime code yet. Gated on Plajah Business traction —
real venues on the platform, real events transacting. Until then this directory is
documentation and type definitions.

A live-action shooter merging Nerf, laser tag and FPS, played on real floors and in
real homes. Four roles share one match: a player with nothing but a phone, a player
with certified gear, a player in a headset, and a remote player who sees the whole
board and cannot fire a shot.

## The thesis

We are not selling a toy gun. We are selling the map it is played on.

Every previous attempt at this died the same way. Recoil (2017) had good mesh hardware
and real geolocated maps; Nerf Laser Ops Pro (2018) had Hasbro's shelf space. Both
failed on local player density — you could buy the gear and find nobody to play
against. Pokémon GO survived because Niantic already owned a decade-old map of real
places. The location graph was the moat, not the game.

Plajah would not start from zero venues, because Plajah Business already puts real
venues on the platform for ticketing. And households need no venue supply at all.

## Two products, one engine

**Venue play** is a session business. An operator runs it, it sells on ticketing
rails, lobbies are age-tiered, growth is limited by floors.

**Household play** is a hardware business. A parent runs it, it sells gear and an
optional family subscription, lobbies are closed-graph, and it is available everywhere
on day one.

They share the engine, the schema and the survey format. They are different
businesses. See `docs/decisions/ADR-0002-two-products.md`.

## Contents

```
games/live-action/
├── README.md
├── src/types/
│   ├── arena.ts        venue/household spaces, survey geometry, localization
│   ├── session.ts      sessions, participants, roles, tiers
│   ├── events.ts       HitEvent, OverwatchAction — both append-only
│   ├── health.ts       consent scopes and derived vitals bands
│   └── hardware.ts     certified devices, SKUs, attestation
└── docs/
    ├── localization.md         how position is resolved at each tier
    ├── health.md               BLE live path vs HealthKit/Health Connect record path
    ├── certification.md        the hardware licensing programme
    ├── safety.md               the three unrecoverable risks and their answers
    ├── roadmap.md              sequencing, gates, and what not to build
    ├── platform-integration.md how it lands in Plajah Gaming, admin-gated + hidden
    ├── loadout.md              weapons as archetype + cosmetic skin (wands, blades, shields)
    ├── arena-capabilities.md   vehicles, turrets, power-ups — gated by arena type
    ├── balance-fields.md       host-tuned environmental fairness for mixed casual lobbies
    ├── modes/
    │   └── dodge.md            school phys-ed dodgeball mode (no sit-out)
    └── decisions/              ADRs (0001–0011)
```

Weapon form (a wand, a laser sword, a shield) is a cosmetic skin over a server-resolved
archetype — see ADR-0009. Vehicles (bumper/kart/Warthog), turrets and power-up pads are
venue-gated arena capabilities, not new engines — see ADR-0010.

## Status on the platform

Registered as a **first-party** game in Plajah Gaming, gated `adminOnly` through the
existing feature-flag service — visible to staff, invisible and undiscoverable to the
public until the status ladder advances it. See `docs/platform-integration.md`.

## Read the ADRs first

The type definitions encode decisions whose reasoning is not obvious from the code.
`OverwatchAction` has no damage field on purpose. `Session.ageTier` is nullable on
purpose. `VitalsBand` has no path to scoring on purpose. Changing any of these without
reading the corresponding ADR will reintroduce a risk that was deliberately designed
out.

## Non-goals

- **Ambient open-world play in public space.** Permanently off the roadmap.
- **Manufacturing hardware.** Certification only. See ADR-0005.
- **Camera-based player identification.** See ADR-0003.
- **Vitals affecting who wins a match.** See ADR-0006.
