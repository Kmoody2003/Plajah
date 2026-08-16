# ADR-0002 — Venue play and household play are two products

**Status:** accepted · **Date:** 2026-08

## Context

The original design assumed venue play only, with the venue graph from Plajah
Business as the moat. Families then surfaced as a first-class audience: playing in
the house, the yard, and the neighbourhood block.

These are not the same product. Venue play needs an operator, sells sessions, is
age-tiered, and is limited by floor supply. Household play needs a parent, sells
gear, is closed-graph, and has no geographic constraint at all.

## Decision

Model `Household` as a sibling of `Venue`: same position in the graph, no payout
path. `Arena.owner` is polymorphic over both. `Session.visibility` gains
`"household"`, which bypasses age tiering entirely because the roster is the tier.

## Consequences

- Household play is where gear actually gets bought — nobody buys a blaster to rent
  time at a venue. Venue play becomes the demonstration that sells it.
- The revenue model's sensitivity moves: units and subscriptions can outrun the
  entire venue business without a single new floor. That points the company somewhere
  different, and it should be chosen deliberately rather than discovered.
- Do not make household play the free tier and venue play the paid one — that
  cannibalises the business with margin. Different wallets, different occasions.
- Household surveys are private by construction: geometry stays on device.

## Open

Block play (outside the property, still not a venue) is handled by host-declared
boundaries and a live host console. That is a better supervision tool than parents
have today, but it is not a legal shield, and it should be reviewed with counsel
before any pilot.
