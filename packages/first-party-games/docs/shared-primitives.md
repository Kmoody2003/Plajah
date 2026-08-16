# Shared primitives

What every first-party game may assume exists, and where it lives. These are owned by
Plajah Gaming, not by any individual game, and each is independently justified by
another vertical — which is why building them before any game ships costs nothing
extra.

| Primitive | What it does | Also serves |
|---|---|---|
| Session layer | Create, join, settle a bounded multiplayer instance with a price and a payout | Ticketing |
| Party formation | Invites, rosters, codes, closed graphs | Events |
| Venue as map | A Business venue exposed as a playable, surveyed space | Business |
| Live state sync | Authoritative server state pushed to many clients at low latency | TV Studio |
| Progression | XP, streaks, unlocks, per-account history | Labs |

## The rule

If a first-party game needs a capability, it goes into the shared layer with a public
contract, or it does not get built. No `if (isFirstParty)` branches. We are the
platform and the customer simultaneously, which makes a private path easy and fatal —
third-party titles would be competing against an API we did not give them.

## Contract notes

**Session layer** must be indifferent to whether the thing being sold is a concert
ticket or a game match. A live-action session that cannot settle through the same
payout path as a ticketed event is a sign the primitive is too narrow.

**Venue as map** is the one that does not exist yet in any form. It needs: a survey
artefact, versioning, an operator opt-in flag, and a revocation path that takes effect
immediately. Games consume it read-only.

**Live state sync** has the hardest requirement, because a real-world game is
server-authoritative under adversarial conditions — clients propose, the server
disposes. Building it well here makes it good enough for everything else.
