# ADR-0007 — Smart glasses are a render surface, not a tier

**Status:** accepted · **Date:** 2026-08

## Context

Display glasses (Meta Ray-Ban Display, Android XR devices) can put the reticle in the
player's eye line and take the phone out of their hands — the single biggest UX
problem the phone tier has. Meta's Neural Band, which reads wrist EMG, could turn a
trigger into an invisible pinch, which is closer to gear feel than a phone can get.

But first-generation display glasses are monocular, narrow-FOV and not 6DoF, so they
cannot localize; position still comes from the phone or from certified gear.
Developer access to both Android XR and the Neural Band is early and gated, and
household penetration is near zero.

## Decision

Glasses are an optional display and input peripheral attached to an existing tier,
never a fourth tier. A glasses player keeps the lock delay, cone width and fire rate
of whatever tier they are actually in. What they gain is ergonomics.

The client is architected so the render surface is swappable — phone screen, headset,
glasses — while position, hit resolution and balance stay server-side and identical.

## Consequences

- No new balance surface, and no $800 entry point that outperforms the gear we
  actually want people buying.
- The swappable-surface split costs nothing extra now, because the Quest tier already
  requires it.
- Realistically a 2028 input. Designing anything load-bearing around hardware almost
  nobody owns is the Recoil mistake in a new form.
