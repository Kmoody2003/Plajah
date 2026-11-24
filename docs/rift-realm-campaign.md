# Vesselbound — Campaign mode (design draft)

Status: **structure draft for Kenne's review.** 2026-11-23.
Code: `games/rift-realm/src/campaign/`, menu `games/rift-realm/src/menu/campaignSelect.ts`, mode id `campaign` in `src/modes/index.ts`.

> **Canon rule.** Vesselbound sits in Kenne's *Legend of Elohim* universe. Nothing in this file is canon. Every story
> line, name and beat below is either **[PLACEHOLDER]** (an empty slot waiting for Kenne's text) or **(proposed)** (a
> structural suggestion Kenne can reject). The Void, the three timelines, the Tehom Lance seam and the Void Tournament's
> relation to the Elohim Void are **not** defined here. The game shows placeholder cards as placeholders, in game.

## Questions for Kenne (the story content we need)

1. **Why are the vessels in the Void Tournament?** One shared premise, or one per vessel?
2. **How does the tournament relate to the Void** (*The Church Mouse*) and to the three timelines?
3. **Who is each vessel?** An origin for each of Aegis, Void Stalker, Seraph-9, Lumen, Sylva, Pyre and Nyx (the menu's
   Origin panels are empty too).
4. **Who are the bosses?** Today every boss is the game's generic "champion" archetype. Named rivals, wardens or
   other vessels?
5. **Do the campaigns cross?** For example: separate stories that meet in a shared final chapter, or one story told
   from seven sides.
6. **Tone and length.** About 5 chapters × 10–15 minutes per vessel is the draft. Shorter or longer?
7. **Grovewardens.** Do the twelve wardens of Elderwood have a story role (allies, guardians, judges)?

## 1. Shape

- **One campaign per playable vessel.** Seven are planned. Three have bodies today (Aegis, Void Stalker, Seraph-9);
  Lumen, Sylva, Pyre and Nyx are being built in Antigravity. Each one's campaign shows as **locked: vessel in the
  forge** until its body lands and it joins `VesselId`.
- **Five chapters per campaign (draft).** A chapter is **one map plus a scripted objective list**, bracketed by an
  intro beat and an outro beat. Chapter *n+1* unlocks when chapter *n* is cleared. Cleared chapters can be replayed
  for a better time.
- **Maps:** the existing levels (`elderwood`, `shrine`, `glacial`, `volcanic`, `marsh`, `celestial`, and the hub
  `sanctum`). No new geometry is needed to ship the structure. Because any map hosts any mode
  (`modes/arena.ts` `describeArena()`), objectives are placed from the map's derived anchors, objective spots and
  foe spots, not from hand-placed data.
- **Rhythm is a bonus, never a requirement.** No objective needs on-beat play. On-beat hits only raise the score.

## 2. How chapters are delivered

| Beat | What it is | Built as |
|---|---|---|
| **Intro** | Dialogue or cutscene cards: speaker, lines, optional still or video, chapter title. The player is frozen and the music is at `explore` mood. | `CardBeat` (DOM overlay, Enter / A / click to advance, Esc / B skips the rest) |
| **Objectives** | An ordered list of steps; the HUD line shows the current one, and a banner shows each new step. | `Step[]` run by `CampaignRunner` |
| **Mid beats** | Short cards between steps (a voice line, a reveal). | `card` step |
| **Outro** | Cards, then a chapter-clear panel (time, kills, downs, best time), then unlocks. | `CardBeat` + `showChapterResult` |
| **Fail** | Downed more times than the chapter allows. Choose Retry chapter or Back to menu. | runner `fail()` |

**Step kinds** (each is built on an existing mode or the arena descriptor):

| kind | Goal | Built on |
|---|---|---|
| `reach` | Walk to a spot (`objective` *i*, `anchor` *i*, the `far` spot or `spawnB`); a beacon marks it | `ArenaDescriptor` |
| `clear` | Defeat N foes (archetype mix optional), spawned at foe spots | `EnemyManager.spawnAt` |
| `survive` | Hold out for T seconds against escalating waves | **Wave Survival** (`ModeRunner`, timer override) |
| `trials` | Clear R time-attack rounds | **Trials** (`ModeRunner`, rounds override) |
| `boss` | Hunt the champion and its escort | **Boss Hunt** (`ModeRunner`) |
| `explore` | Free time on the map for S seconds, or until the player reaches a spot | **Free Roam** + `reach` |
| `card` | A mid-chapter dialogue beat | `CardBeat` |

**Unlocks:** the next chapter (always). Planned for later: cosmetic vessel trims, codex / lore entries (Kenne's text),
and the next vessel's campaign teaser. Nothing is gated behind rhythm play.

## 3. Save and progress (cloud-synced)

- Key `rift-realm-campaign` in `localStorage`, always written first, so it works offline and for guests.
- Cloud: the Plajah game-save bridge (`services/gameSaves.ts` / `gameSaveCore.ts`, `plajah.save.*` postMessage, game
  id `rift-realm`, Firestore `gameSaves` in plajah-ops). Used when the game runs inside Plajah (`IframeGameFrame`) and
  the player is signed in. On load: local and cloud saves merge. **Merge rule:** for each chapter, cleared if either
  save cleared it; keep the better best time and the higher kill count; `last` comes from the newer save. On a `rev`
  conflict, merge with the cloud copy and store again.
- Shape (v1): `{ v: 1, updatedAt, last: { campaign, chapter }, chapters: { "<campaign>/<n>": { cleared, bestTime, kills, clears } } }`.
  The `rift-realm` save doc is shared with other features later, so campaign data lives under a `campaign` key.

## 4. Menu flow

Start screen → **Campaign** → **Vessel** (campaign list: name, progress *k*/5, locked vessels greyed) → **Chapter
select** (title, map, objective summary, best time; locked chapters greyed) → Loading → intro beat.
Built in `menu/campaignSelect.ts` and wired through `menu/menu.ts`. Keyboard, mouse and controller all work, as on
the other menu screens.
Testing: `?campaign=<id>&chapter=<n>` boots straight into a chapter (works with `?rrdebug` / `?menu=0`).
`?campaign=aegis&chapter=1&rrdebug` exposes `__rr.campaign`.

## 5. The campaigns (structure only)

Chapter names are working titles **(proposed)**. Story beats are **[PLACEHOLDER]**. The maps are chosen for play
variety and load time (Elderwood Wilds takes minutes to load, so it is used sparingly).

### Aegis: The Oathbound Bulwark (Tank · Vanguard) — chapter 1 playable
| # | Working title (proposed) | Map | Objectives | Boss | Story beats |
|---|---|---|---|---|---|
| 1 | First Oath | `shrine` | reach the monolith → clear 4 → survive 45 s → boss | Champion (generic) | [PLACEHOLDER] intro / outro |
| 2 | Hold the Line | `glacial` | reach the battlement → survive 90 s → clear 6 | — | [PLACEHOLDER] |
| 3 | Ember Wall | `volcanic` | trials ×3 → reach the forge hall → boss | Champion | [PLACEHOLDER] |
| 4 | Drowned Vigil | `marsh` | explore → reach the shrine → survive 120 s | — | [PLACEHOLDER] |
| 5 | The Last Bulwark | `celestial` | trials ×5 → boss | [PLACEHOLDER] named rival | [PLACEHOLDER] |

### Void Stalker: Shadow-Beast Frame (Assassin · Rushdown)
| # | Working title (proposed) | Map | Objectives | Boss |
|---|---|---|---|---|
| 1 | Into the Hollow | `elderwood` | explore → reach the Great Oak → clear 5 | — |
| 2 | Night Hunt | `marsh` | trials ×4 | — |
| 3 | Glass and Ice | `glacial` | reach the ice cave → boss | Champion |
| 4 | Ash Run | `volcanic` | survive 90 s → reach the throne hall | — |
| 5 | Edge of the Rift | `celestial` | clear 8 → boss | [PLACEHOLDER] |

### Seraph-9: Fallen-Tech Cherub (Support · Aerial)
| # | Working title (proposed) | Map | Objectives | Boss |
|---|---|---|---|---|
| 1 | Fall | `celestial` | reach the far island → clear 4 | — |
| 2 | Signal | `shrine` | survive 60 s → reach the node | — |
| 3 | Frost Choir | `glacial` | trials ×4 → boss | Champion |
| 4 | Canopy | `elderwood` | explore → reach 3 objective spots | — |
| 5 | Sanctum | `sanctum` | trials ×5 → boss | [PLACEHOLDER] |

### Lumen, Sylva, Pyre, Nyx (vessels in the forge)
Stubbed: five chapters each, every map and step marked **[PLACEHOLDER]**. Each campaign unlocks when its vessel's body
and `VesselId` land (`characters.ts` / `vessels.ts`, owned by the Antigravity lane). Map leanings **(proposed)**, from
the names alone and open to change: Lumen → `celestial` / `shrine`, Sylva → `elderwood` (Grovewardens?), Pyre →
`volcanic`, Nyx → `marsh` / `sanctum`.

## 6. Code map

- `campaign/data.ts`: the campaigns, chapters, steps and card text (placeholders marked `PH`).
- `campaign/runner.ts`: `CampaignRunner` (intro → steps → outro, fail / retry), reuses `ModeRunner` for survive,
  trials and boss steps.
- `campaign/cards.ts`: the dialogue card overlay and the chapter-clear panel.
- `campaign/progress.ts`: local save, the cloud bridge client and the merge.
- `menu/campaignSelect.ts`: the Campaign → Vessel → Chapter screens.
- `modes/index.ts`: `campaign` ModeDef (hidden from the Mode step), plus `ModeRunner.start(id, opts)` overrides
  (timer / rounds) and an `onFinish` hook for nesting.
- `main.ts`: picks the level and vessel from the chapter, runs the campaign in place of a mode, HUD line, and
  `__rr.campaign`.
