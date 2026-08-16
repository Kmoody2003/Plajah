# Platform integration — how Live-Action lands in Plajah Gaming

How this design becomes a thing that renders in the app, and how it stays **admin-only
and hidden from the public** until it is ready. Written against the codebase as it is
today, not an idealised one.

## The two gaming worlds today

The repo already has a Gaming section — **"Plajah Arcade"** (`components/GamesView.tsx`),
a Firestore `games` collection rendered as iframes through `components/GamePlayerView
.tsx`. The `Game` interface (`types.ts`) is built for that: `id, ownerId, title, url,
thumbnailUrl, tags` — a hosted web game at a URL.

Live-Action is not a hosted web game. It is a real-world session with a native client,
so it cannot be an iframe `url` and it does not belong in the same shape as a
third-party FreeToGame title. It needs a **first-party registry** and a small model
extension — which is also the moment the platform gains a real notion of a Plajah
original, something `types.ts` does not have yet.

## Model extension (additive, public contract)

Per `packages/first-party-games/README.md`: no `if (isFirstParty)` **code branches**.
A first-party *badge as data* is fine and available to any studio — the rule forbids a
privileged code path, not a field. Extend the game model, do not fork it:

```ts
// additive to the runtime game model
kind:       'hosted' | 'first-party';   // hosted = today's iframe games
status:     'design' | 'prototype' | 'pilot' | 'live';   // the package status ladder
surface:    { type: 'iframe'; url: string }              // today's games
          | { type: 'native-view'; view: string };       // a custom React view id
flagName?:  string;   // gate for anything not yet 'live'
```

`GamePlayerView`'s hard-coded "Verified Studio Build" footer becomes driven by `kind` —
a Plajah original reads "Plajah Original", a hosted game reads whatever it should.

## Admin-only, hidden — use the flag service, not an inline check

The repo already has the right tool: `services/featureFlagService.ts`. It supports
exactly this — `adminOnly: true` means "admins only", and `rolloutPercentage` opens it
to a slice of the public later, all toggled live from Firestore `config/featureFlags`
without a deploy. That is strictly better than scattering `role === 'admin'` checks.

1. Add a flag: `FIRST_PARTY_LIVE_ACTION` → `{ enabled: true, adminOnly: true }`.
2. In `GamesView`, the first-party rail filters its entries through
   `isFeatureEnabled(flagName, uid, isAdmin)`. A non-admin's list simply does not
   contain the game — it is absent, not greyed out, so there is nothing to discover.
3. When a data path exists, mirror the gate in `firestore.rules` with the existing
   `isAdmin()` helper, so it is hidden at the data layer too, not just the UI.

The **status ladder drives exposure**, and the flag is how the ladder is enforced:

| status | who sees it | flag setting |
|---|---|---|
| design | admins only | `adminOnly: true` |
| prototype | admins only | `adminOnly: true` |
| pilot | a bounded population | `rolloutPercentage: N` |
| live | everyone | `enabled: true, adminOnly: false` |

Live-Action is **design** today, so it is `adminOnly: true` — visible to the owner and
staff, invisible to everyone else, exactly as asked.

## Where it renders

A new **"Plajah Originals"** rail in `GamesView`, above the hosted grid, populated from
the first-party registry and filtered by the flag. Each entry is a card carrying a
status pill (Design / Prototype / Pilot) and the "Plajah Original" badge. Selecting a
first-party card routes to its `surface.view` — a native React view added next to the
existing `GAME_PLAYER` view in `App.tsx` — rather than the iframe player.

While the game is in **design**, that view is the spec/overview surface (this
document's artifact), not a playable build. That is honest: the status pill says
Design, and the card opens the design, not a game.

## What not to do

- Do not add an `'ADMIN'` account type — admin is the `role` field, and the flag
  service already reads it.
- Do not seed a `games` Firestore doc for Live-Action. It is not an iframe game, and a
  public doc would leak it past the flag.
- Do not build the first-party path as a private branch the Arcade's third-party titles
  cannot use. The registry, the badge and the flag are all general — a third-party
  studio could ship a native-view game through the same contract.
