# Era Clash

**Status: live** — generally available. A Plajah Original, built and operated by
Plajah. Playable today at its public URL; listed in the Games library
("Plajah Originals" rail) and the Apps library.

## The game

Six warriors from across history — samurai, Viking, knight, Mexica jaguar
warrior, Shaolin monk, gladiator — in fast, casual arcade combat. Modes:

- Versus CPU (easy / normal / hard)
- Local two-player
- Online peer-to-peer duels (WebRTC invite codes)
- **Tales of the Ages** campaign: six micro-campaigns (prologue, four chapters,
  epilogue) of fiction woven over real history. Read a chapter, then fight it.

Progression: warriors start hand-to-hand, unlock weapons at level 2 and
superpowers at level 4. Wins feed XP into the player profile.

## Platform integration

- **Surface**: hosted web game, played in the `GamePlayerView` iframe from the
  registry URL (`registry.ts`). No native view, no custom player.
- **Points**: the game posts `plajah.xp` events; the parent verifies origin,
  dedupes by `eventId`, and credits 1 XP = 1 Plajah Point via `addPoints`.
  Local 2-player excluded; 500 pts/day cap. See
  `services/iframeGameBridge.ts`.
- **Achievements**: the game posts `plajah.achievement` with an `ERACLASH_*`
  trigger. Unlock goes through the existing achievements endpoint; the bridge
  credits the achievement's `pointsValue` on fresh unlocks only.
- **Registry**: `registry.ts` is the single source of truth for the Games and
  Apps library entries. The bridge config (achievement prefix, daily cap)
  lives there too.

## Rules (from `packages/first-party-games/README.md`)

No `if (isFirstParty)` branches. The "Plajah Original" badge is data on the
registry entry, and the bridge is generic — any iframe game can use the same
`plajah.*` protocol through the same code.
