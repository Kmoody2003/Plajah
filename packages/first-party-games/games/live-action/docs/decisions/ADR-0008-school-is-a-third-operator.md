# ADR-0008 — A school is a third operator, not a venue and not a household

**Status:** accepted · **Date:** 2026-08

## Context

ADR-0002 modelled two operators: a **venue** (operator-run, sells sessions on
ticketing rails, age-tiered, floor-limited) and a **household** (parent-run,
closed-graph, sells gear, no payout path). A phys-ed class fits neither.

A school gym is operator-run like a venue — there is an accountable adult (the
teacher) drawing the boundary and running a host console — but it does **not** sell
sessions to the public, is **not** discoverable or matchmade, and its roster is a
class list, not a ticket queue. It is closed-graph like a household, but the
accountable adults are staff rather than family, and it sits on the Organization
backbone (a school is an org, the same one Academia already models) rather than on a
consumer account.

The temptation is to force it into `venue` and lean on age tiering. That is wrong:
age tiering exists to keep *unknown* adults away from minors in *public* play. In a
class, every adult is verified staff and every minor is on a known roster. The control
is the roster and the institution, exactly as in a household — not a public age gate.

## Decision

Add **institution** as a third operator, a sibling of venue and household.

- `ArenaOwner` gains `{ kind: "institution"; orgId }`. A gym is an institution-owned
  arena; it is `private` by construction, the same as a household arena.
- `SessionVisibility` gains `"institution"`. Like `"household"` it is closed-graph,
  never discoverable, never matchmade, and its roster is the tier — so
  `Session.ageTier` is `null` for institution sessions. The invariant becomes:
  **`ageTier` is null if and only if visibility is closed-graph (`household` or
  `institution`); it is non-null exactly when the session is age-tiered public play.**
- The host role is the **teacher**, unchanged in mechanics from the parent host: draws
  the boundary, sees every participant live, pulls anyone instantly. It is a
  supervision tool a teacher would want even if the game were boring — the same claim
  ADR-0002 makes for the parent, and equally not a legal shield.

Roster comes from the class list the school already maintains in Academia. No new
identity graph, no public discovery surface, no chat outside the roster.

## Consequences

- The school becomes an **institutional buyer** — a class set of certified gear plus a
  teacher console — which the roadmap already anticipated ("institutional health
  packages for schools, ministries, rec centres"). This is a stronger hardware channel
  than the household, because a school buys thirty units at once, not one.
- Under-18 rules from ADR-0006 apply in full and then some: health ingest is off, and
  in a school FERPA sits on top of COPPA. See the movement-telemetry note in
  `docs/modes/dodge.md` — activity feedback in class is derived from the game's own
  localization, never from a health API, and is never a per-child public leaderboard.
- Billing is institutional (a licence or a kit), never per-session ticketing. An
  institution arena has no payout path, the same as a household.
- Cost: a third operator is a third set of edge cases in the session layer, the host
  console and the admin tooling. It is justified only because the school channel is
  large and the closed-graph safety story is *stronger* here than in public venue play,
  not weaker.

## Rejected alternatives

- **School-as-venue with an age gate.** Puts minors on the public age-tiering code
  path for no benefit and invites the failure mode ADR-0003/safety.md designs out.
- **School-as-household.** The naming lies (a class is not a family) and it hides the
  institutional-buyer economics that make the channel worth the edge cases.
