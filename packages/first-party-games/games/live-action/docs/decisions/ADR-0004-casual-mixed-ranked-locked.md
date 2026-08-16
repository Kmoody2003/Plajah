# ADR-0004 — Casual lobbies are mixed, ranked lobbies are tier-locked

**Status:** accepted · **Date:** 2026-08

## Context

Two goals are in direct tension. Cross-tier fairness says a kid with a phone should
have a real chance against an adult with gear. The hardware business says gear should
produce visibly better results, or nobody upgrades. At full strength these cannot
both be true.

## Decision

Casual play is mixed and balanced. Ranked play forces a single tier per session
(`Session.ranked`).

Phone-tier disadvantage is expressed as *tempo*, not damage: a lock delay of roughly
600-800ms before a shot resolves, and no firing while sprinting. A gear player pulls
a real trigger with no delay and can fire on the move.

## Consequences

- The upgrade argument is felt, not read. Nobody needs a comparison chart to
  understand why the blaster is better — they spent most of a second exposed.
- Gear wins where winning is measured; mixed lobbies stay good enough that a family
  night works with one blaster and three phones.
- `Participant.lockMs` is therefore the single most consequential tuning value in the
  game. Changing it changes the entire hardware incentive.
- Risk: if ranked becomes the only mode anyone respects, the split collapses into
  pay-to-win by social pressure. Watch the casual/ranked session ratio.
