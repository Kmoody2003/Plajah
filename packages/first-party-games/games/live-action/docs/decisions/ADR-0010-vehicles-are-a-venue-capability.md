# ADR-0010 — Vehicles are a venue-only arena capability with a host kill switch

**Status:** accepted · **Date:** 2026-08

## Context

The product wants vehicles: bumper-car battles, go-kart racing-plus-combat, and
Warthog-style crewed vehicles where one player drives and another works a turret. It is
the "live-action Mario Kart" layer, and it is genuinely fun. It is also the single most
dangerous thing anyone has proposed for this game. A moving vehicle among players is a
different risk class than a kid holding a foam blaster, and it cannot be governed by a
household or a phone.

Two facts decide the shape. First, **localization**: the phone tier relocalizes by
raising the phone and drifts between fixes (localization.md). That model is useless at
kart speed — a vehicle needs continuous sub-metre tracking, which only the surveyed-UWB
gear tier provides. Second, **safety**: speed, mass and collision require an operator, a
marshal, a governed and certified vehicle, and a way to stop everything at once.

## Decision

A vehicle is an **arena capability**, not a tier and not a household feature. It is
available only in a venue arena that declares it, is surveyed with UWB anchors, and is
run by an operator with a marshal present. `Arena.capabilities.vehicles` gates it; there
is no code path that enables a vehicle in a household or a public open space.

- A vehicle is a **platform (a surface)**, consistent with ADR-0007. The occupant is
  still resolved server-side; the vehicle supplies continuous localization and may mount
  a weapon. It is not a power tier — balance stays server-side.
- **Crew maps to existing roles.** A solo kart is one operative. A Warthog is two on-site
  operatives sharing a platform: a **driver** (movement, no turret) and a **gunner**
  (the `mounted` weapon class from ADR-0009). Overwatch may *ping* for the gunner but
  never drives and never fires — the ADR-0001 line holds; a remote player must never
  control a moving object among bodies.
- **Bumper mode is the safe default.** Low-speed, enclosed, collision-designed vehicles
  where a tag resolves on impact/proximity — the bumper car's own mechanic. This is the
  family- and event-friendly form. Governed karts are a higher venue tier behind height,
  age and marshal gates.
- **The host console gains an e-stop.** One control halts every vehicle in the arena
  instantly — the vehicle analog of "pull any participant out." It is a required part of
  the capability, tested before it is needed, exactly like device revocation (ADR-0005).
- **Certification extends.** A vehicle is a certified `DeviceKind` with its own physical
  spec: a speed governor, roll/impact protection, and a hardware e-stop the host triggers.
  Plajah certifies it; a licensee builds, insures and recalls it (ADR-0005). Zero vehicle
  manufacturing on the platform balance sheet.

## Consequences

- Vehicles are a **venue and retail-tier** feature, sequenced late — after the phone-only
  pilot and household beta prove the core. They must not contaminate the pilot, whose
  whole job is measuring whether people show up (roadmap.md).
- The power-up layer (Mario-Kart items — a pad grants a temporary weapon, boost or shield)
  reuses `Objective`/`Zone`, not a new system, and keeps the tone playful and non-violent.
- Insurance, marshalling and height/age gating are now operator obligations in the venue
  certification, not afterthoughts.
- Cost: this is the highest-liability surface in the product. It earns its place only in
  operator-run venues with the e-stop, the marshal and a governed certified vehicle — and
  never anywhere else.

## Rejected alternatives

- **Household karts.** No continuous tracking, no marshal, no e-stop, unbounded space.
  A non-starter, and exactly the ambient-open-world failure the roadmap bans in another form.
- **Remote-driven vehicles.** A remote player moving a real vehicle among on-site players
  breaks ADR-0001 and adds latency to a safety-critical control loop. Never.
