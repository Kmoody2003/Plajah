# ADR-0011 — Cross-tier fairness is environmental and host-tuned, not stat inversion

**Status:** accepted · **Date:** 2026-08

## Context

ADR-0004 says casual lobbies are mixed and balanced, and expresses the phone's
disadvantage as *tempo* (a lock delay) rather than damage. It does not say *how* a
mixed lobby is actually balanced shot-to-shot. The open question: when a phone player
and a gear player are in the same casual match, what makes the outcome fair without
either erasing the gear's upgrade value or making the phone feel hopeless.

A tempting answer is to hand the phone a raw stat buff, or to slap a delay on the gear
so both tiers feel the same. Both are wrong. A flat delay on gear clones the phone's
weakness and deletes the exact thing a buyer paid for — gear that pulls and it's gone.
A raw stat buff on the phone inverts the tiers and removes the reason to ever upgrade,
which is the certification business's whole engine.

There is also a feel trap: a hidden probability that overrides a well-aimed shot reads
as the game cheating. Metre-scale accuracy already makes this objective play, not a
twitch shooter (ADR-0003) — a target is a blob, not a pixel — so the fairness layer
should lean into that legibly, not bolt invisible dice onto it.

## Decision

Balance a mixed casual lobby through the **environment and the hit resolution**,
expressed as legible, mostly-geometric modifiers that a host tunes — never by inverting
which device is stronger, and never as opaque RNG.

1. **Hit chance is coverage, not a coin flip.** A shot resolves against a cone whose
   half-angle comes from the shooter's device tier, fix confidence, and any fields in
   play. Whether it lands is how much of the target's *angular footprint* the cone
   covers, scaled by confidence. **Proximity raising hit probability falls out of
   geometry** — a nearer target subtends more of the cone. Aim well and close the
   distance and you hit; aim loose at range and you might not.

2. **The gear handicap is added spread, never a delay.** Gear keeps its no-lock,
   fire-on-the-move feel. What the environment touches is its *precision*: a `shear`
   field scatters a pinpoint shot, while the phone's already-wide forgiveness cone barely
   notices. The strong tier is reined in without being made to feel like the weak one.

3. **Balance Fields are diegetic and host-placed.** `aim-aura` widens a phone-only
   player's forgiveness; `shear` adds scatter to precise shots globally or in a zone;
   `bubble` gives phone players a light damage-soak, offsetting the seconds they stood
   exposed while locking. Fields are visible, so an opponent understands the outcome.

4. **Downgrade-only, preserved.** Every modifier can only *widen forgiveness* or *reduce
   precision*, up to a cap. It never escalates a hit — the same invariant `events.ts`
   already states for `confidence`. The resolution stays server-authoritative.

5. **A single Fairness dial, off in ranked.** The host sets one 0..1 strength (0 = raw
   tiers, 1 = fully evened) plus per-field toggles and placement. Ranked is single-tier,
   so fairness is forced to 0 — there is nothing to compensate.

## Consequences

- The phone tier becomes genuinely viable in casual without the gear losing its identity
  — the upgrade argument survives, and a family night with one blaster and three phones
  works because the room, not a stat sheet, evens it.
- Fields are an operator/host expression surface — the same console that draws the
  boundary tunes the fairness of the floor. A host can dial a kids-vs-parents match soft
  and a teen scrim hard.
- Cost: fields are new state to author, render and resolve against, and "legible not
  random" is a standing constraint every future modifier has to satisfy.

## Rejected alternatives

- **A flat delay on gear.** Erases the feature the gear buyer paid for; makes both tiers
  mediocre. This is the request's literal form, redirected for that reason.
- **A raw phone stat buff.** Inverts the tiers and removes the upgrade incentive — the
  ADR-0004 failure mode, and the thing that would quietly kill the hardware business.
- **Invisible hit RNG.** A dice roll that overrides a good shot feels like cheating;
  coverage + visible fields keep the same probabilistic outcome legible.
