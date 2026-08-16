# Plajah First Party Games

Games Plajah builds and operates itself, as opposed to third-party titles hosted on
Plajah Gaming. Each game lives in its own directory under `games/` and depends on the
shared session, party, venue and progression primitives rather than re-implementing
them.

```
packages/first-party-games/
├── README.md                 ← you are here
├── docs/
│   ├── shared-primitives.md  what every first-party game may assume exists
│   └── decisions/            ADRs that span more than one game
└── games/
    └── live-action/          the real-world shooter
```

## Why this section exists

First-party games are the only place in Plajah where we are simultaneously the
platform and the customer. That is useful — it forces the shared primitives to be
good enough for a demanding consumer product — and it is dangerous, because it makes
it easy to build a private path that third-party titles cannot use.

**Rule:** if a first-party game needs a capability, it goes into the shared layer with
a public contract, or it does not get built. No `if (isFirstParty)` branches.

## Shared primitives these games assume

Owned by Plajah Gaming, but each also serves another vertical, which is why they are
justified independently of any game shipping:

| Primitive | Also serves |
|---|---|
| Session layer | Ticketing |
| Party formation | Events |
| Venue as map | Business |
| Live state sync | TV Studio |
| Progression | Labs |

See `docs/shared-primitives.md` for contracts.

## Games

- **`games/live-action/`** — Nerf × laser tag × FPS played on real floors and in real
  homes. Phone, certified gear, mixed reality and remote overwatch in one match.
  Status: **design only.** Gated on Plajah Business traction.

## Status conventions

Every game README opens with one of:

- **design only** — no runtime code, docs may change freely
- **prototype** — code exists, contracts unstable, not user-facing
- **pilot** — user-facing in a bounded population
- **live** — generally available

Do not skip a stage to make a deadline. The gate between design and prototype for
live-action specifically is external (Plajah Business traction), not internal.
