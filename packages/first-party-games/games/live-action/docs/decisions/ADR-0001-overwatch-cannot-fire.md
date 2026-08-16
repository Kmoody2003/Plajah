# ADR-0001 — Overwatch cannot fire

**Status:** accepted · **Date:** 2026-08

## Context

Phone-only players need a genuine way in, and remote players solve a real density
problem: a six-person floor can run a fourteen-person match. But an FPS view mode
where a remote player is simply a shooter-from-the-couch destroys the product. If
sitting down is easier and wins more, most people will sit down, and we will have
built a mediocre mobile shooter that happens to require a warehouse.

## Decision

Remote participants take the `overwatch` role, which is a different job rather than a
weaker version of the same one. Overwatch sees the whole board, pings enemies, opens
doors, calls objectives and jams the other team's feed. It cannot fire, cannot score
a hit, and cannot win a round without on-site teammates.

This is enforced structurally: `OverwatchAction` has no damage field and no foreign
key into scoring, and a compile-time guard in `events.ts` fails the build if one is
added. It is not a balance number in config.

## Consequences

- Overwatch depends on bodies in the room, which is what keeps the room important.
- The verb set stays small (four verbs, all on cooldowns, pings decay) so a remote
  player directs rather than narrates.
- A natural funnel appears: remote today, on-site next Saturday, gear by Christmas.
- Cost: overwatch needs its own progression and its own reasons to be fun, which is
  real design work rather than a free mode.
