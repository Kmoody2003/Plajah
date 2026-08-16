# Sequencing

## The gate

Nothing user-facing ships before Plajah Business shows traction: real venues on the
platform, real events transacting. This is external and not negotiable by enthusiasm.

## Before the gate — costs nothing extra

Build the shared primitives: session layer, party formation, venue-as-map, live state
sync, progression. Every one is needed by ticketing and Plajah Gaming regardless of
whether a blaster ever ships. Keep this work in the shared layer with public
contracts, not behind a first-party branch.

## After the gate

1. **Phone-only pilot.** One Detroit venue, no hardware, bring your own device.
   Measures the only thing that matters: do people physically show up, and do they
   come back. Costs a weekend, not a mould.
2. **Household beta.** Private arenas, closed rosters, no gear. Tests whether a
   parent will complete a sixty-second room scan and whether small-space modes are
   actually fun.
3. **Publish the spec.** Open certification. Let a partner take tooling risk on the
   first blaster.
4. **Retail and headset tier.** Certified gear on shelves, Quest passthrough,
   institutional health packages for schools, ministries, rec centres and employer
   wellness. This is also where the **loadout layer** lands — wand, blade and shield
   archetypes and their cosmetic skins (ADR-0009) — and where **melee and turrets**
   turn on.
5. **Venue attractions.** The **vehicle layer** — bumper battles, karts, crewed
   Warthogs and power-up pads (ADR-0010) — as an operator-run venue draw. Highest
   liability in the product; it ships last, in venues with a marshal and a host e-stop,
   and never anywhere else.

## What not to build

- Ambient open-world public play. Ever.
- A remote FPS mode where the couch player is a shooter (ADR-0001).
- Plajah-manufactured hardware (ADR-0005).
- Camera-based player identification (ADR-0003).
- Anything load-bearing on smart glasses before penetration exists (ADR-0007).
- Vehicles anywhere but an operator-run venue; a weapon stat on a physical prop or skin
  (ADR-0009, ADR-0010).
- Capabilities in the phone-only pilot or the household beta — they layer on later, and
  their job is to prove people show up first.

## Still open

**The distribution mechanism** — the one only the platform could run — remains
unspecified. It is the load-bearing piece of the whole thesis and the first thing to
answer, because it may change the shape of everything above.
