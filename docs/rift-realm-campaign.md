# Vesselbound — Campaign mode (design)

Status: **Kenne's premise in (2026-11-23); Void Stalker outline drafted for review.**
Code: `games/rift-realm/src/campaign/`, menu `games/rift-realm/src/menu/campaignSelect.ts`, mode id `campaign` in `src/modes/index.ts`.

> **Canon rule.** Vesselbound sits in Kenne's *Legend of Elohim* universe. Section 0 is **Kenne's canon**, as he gave
> it (close paraphrase, nothing added). Everything else is either **[PLACEHOLDER]** (an empty slot for Kenne's text) or
> **(proposed)** (a structural suggestion he can reject). In game, placeholder cards are tagged PLACEHOLDER.

## 0. Canon (Kenne, 2026-11-23)

**The premise**
- Every vessel either died or had its soul torn from its body by the Void. Each one's reason is different.
- An angel governs the Rift: **the Banished Angel** (the banished archangel). He was cast out of Heaven but stays loyal
  to God, not Lucifer. God gave him permission to grant **one soul a second chance at life**, and left it to him to
  decide how that soul is chosen.
- His answer is an **annual tournament** of combat and survival for the souls stuck in the Rift Realms. It filters for
  who has the will and worthiness to take a second life.
- Some souls train for the moment; some try right away. **Every soul gets three tries.** Fail a third time and you move
  on to your **final judgment**.
- The winner returns with **all their memories, in a newborn baby's body**, and starts life over.

**The three timelines.** The Void's presence in all three timelines can send souls to the Rift. That is how the Rift
connects to them.

**The enemy**
- **Lucifer** is trying to use the Rift to invade and conquer the three timelines, so **demons** are trying to take it
  over. It is the Banished Angel's job to stop them conquering the Rift realms.
- In the campaigns, Lucifer and Hell try to **corrupt the light souls**, so that winners go back into their second life
  as his agents.

**Light and dark.** Light souls can win, and so can dark souls.

**Titans.** Every level ends with a huge **titan** to fight. Some titans are light and good, some are evil, but you
must fight and beat each one to pass: it is a test of will and worthiness. Named titans are not decided yet.

**Grovewardens.** The 12 Grovewardens are **one type of titan**: part fallen angel, infused into actual trees. They
arrived when the banished archangel was sent to govern the Rift Realms. They help protect the realms against demon
hordes and evil titans, and keep titans from escaping into the timelines. Their exact story role is not decided yet.

**Structure.** Each campaign is its own story, with no shared final chapter. Target **60–90 minutes** per campaign.
**Void Stalker's campaign is the first.** His backstory is not known yet.

## Still open (questions for Kenne)

1. **Void Stalker's backstory:** how he died, or how the Void tore his soul out. Is he a light soul or a dark one at the start?
2. **The named titans:** one per Void Stalker level (six, section 5), each light or evil.
3. **The Banished Angel's name.** In-game cards say "The Banished Angel" until then.
4. **The Grovewardens' role:** in Void Stalker's Elderwood chapter, are they the titan he must beat, allies against the
   demon horde, or both?
5. **Three tries:** which proposal in section 2 matches your rule?
6. **Corruption:** is the player's light or dark path a choice the player makes, or the story's call (section 3)?

## 1. Shape

- **One campaign per playable vessel**, each its own story. Seven are planned. Three have bodies today (Void Stalker,
  Aegis, Seraph-9); Lumen, Sylva, Pyre and Nyx are being built in Antigravity. Their campaigns show as **locked: vessel
  in the forge** until each body lands in `VesselId`.
- **Void Stalker comes first** (top of the Campaign screen, the first playable story). Aegis chapter 1 stays as a
  second, working example.
- **Six chapters × 10–15 minutes** (Void Stalker) reaches the 60–90 minute target. A chapter is **one map plus a
  scripted objective list**, bracketed by intro and outro beats, and it **ends with a titan**. Chapter *n+1* unlocks
  when chapter *n* is cleared. Cleared chapters can be replayed for a better time.
- **Maps:** the existing levels (`shrine`, `elderwood`, `marsh`, `glacial`, `volcanic`, `celestial`, plus the hub
  `sanctum`). Objectives are placed from each map's derived anchors, objective spots and foe spots
  (`modes/arena.ts` `describeArena()`).
- **Titans today** use the game's Boss Hunt champion (a large `boss` archetype with an escort). Real titan bodies are
  future work. The Grovewardens (`src/ents`, 46 m walking wardens) are the obvious first titan body.
- **Rhythm is a bonus, never a requirement.**

## 2. Three tries (proposed, Kenne decides)

The tournament gives every soul three tries. Ways to carry that into play:

| Option | How it plays | Fail a third time |
|---|---|---|
| **A. Three lives per chapter** (what the build does today) | Downed 3 times in a chapter = chapter lost; retry freely | Nothing lasting; it is only a fight rule |
| **B. Three tries per chapter** | Each chapter can be lost 3 times. A tries counter shows on chapter select | "Final judgment": the campaign resets to chapter 1 (or a judgment ending plays) |
| **C. Three tries at the tournament** | The whole campaign run gets 3 tries; every lost chapter spends one | Judgment ending; a new run starts over |
| **D. Story only** | The Banished Angel explains the rule in the intro; play uses A | Shown in cutscenes, not enforced |

**Lean (proposed):** A for fights plus B for stakes. It is forgiving minute to minute, but losing a chapter three
times means something, without wiping hours of progress like C. Not built until Kenne picks.

## 3. The corruption thread (proposed)

Lucifer and Hell try to corrupt the light souls so the winners return as his agents. A structure for it:
- **Demon beats:** in most chapters a demon (or a corrupted titan) speaks to the vessel in a mid-chapter card:
  offers, threats, whispers.
- **Light / dark track (proposed):** a hidden value moved by the vessel's choices at those beats (accept / refuse) and
  maybe by how he fights (sparing the light titans' escorts, for example). It colours the final chapter and picks the
  **second-life ending**: returning as himself, or returning as Lucifer's agent. Both are wins, because light and dark
  souls can both win.
- **Needs from Kenne:** whether the choice is the player's or the story's, and what the demons say.
- Not built yet: cards today have no choices. The runner can add a `choice` step when this is decided.

## 4. How chapters are delivered

| Beat | What it is | Built as |
|---|---|---|
| **Intro** | Dialogue / cutscene cards (speaker, lines, optional still), chapter title plate. The player is frozen | `playCards` (Enter / A / click; Esc / B skips) |
| **Objectives** | An ordered list of steps; the HUD line shows the current one, and a banner shows each new step | `Step[]` in `CampaignRunner` |
| **Mid beats** | Short cards between steps (the Banished Angel, a demon voice, a titan's challenge) | `card` step |
| **Titan** | The last step of every chapter | `boss` step (Boss Hunt) |
| **Outro** | Cards, then the chapter-clear panel (time, kills, downs, best time, unlocks) | `playCards` + `showChapterResult` |
| **Fail** | Downed more than the chapter allows. Choose Retry or Campaign | runner `fail()` |

**Step kinds:** `reach` (a spot, beacon) · `clear` (N foes) · `survive` (Wave Survival, timer override) · `trials`
(Trials, rounds override) · `boss` (Boss Hunt = the titan) · `explore` (timed or reach) · `card`.
Enemies are the tournament's bots today. A demon faction (look and archetype mix) is future art and AI work.

## 5. Void Stalker: Shadow-Beast Frame (Assassin · Rushdown), the first campaign

Origin: **[PLACEHOLDER: Kenne]**. Speakers on cards: Void Stalker, **The Banished Angel** (name TBD), **[Demon]**
voices, and the titans. Chapter titles are working titles **(proposed)**.

| # | Working title | Map | Objectives (then the titan) | Titan | Story beats (from the canon; text is Kenne's) |
|---|---|---|---|---|---|
| 1 | **The Torn** (playable) | `shrine` | reach the monolith → clear 4 → survive 45 s → **titan** | [PLACEHOLDER] light or evil | Stalker arrives in the Rift, torn from his body. The Banished Angel tells him about the tournament, the second life and the three tries. His first trial ends with his first titan. |
| 2 | **Wardens of the Hollow** | `elderwood` | explore → reach the Great Oak → clear the demon horde (6) → **titan** | Grovewarden? (open question 4) | First sight of the Grovewardens. Demons press into the forest. |
| 3 | **Drowned Whispers** | `marsh` | trials ×4 → reach the sunken shrine → **titan** | [PLACEHOLDER] | **First corruption beat:** a demon speaks to Stalker (an offer). |
| 4 | **Witness in the Ice** | `glacial` | reach the ice cave → survive 90 s → **titan** | [PLACEHOLDER] light titan? | A test of worthiness; a reminder that losing all three tries means final judgment. |
| 5 | **Ember Pact** | `volcanic` | clear 8 → reach the throne hall → **titan** | [PLACEHOLDER] evil titan | Hell's push at its strongest; **the second corruption beat** (a pact or a threat). |
| 6 | **The Last Rift** | `celestial` | trials ×5 → **final titan** | [PLACEHOLDER] | The final test before the Banished Angel. **Outro:** the second life, returned with every memory in a newborn's body; light or dark ending (section 3). |

Pacing estimate: chapter 1 about 8–10 min, chapters 2–6 about 10–15 min each, so 60–85 min in total.

## 6. The other campaigns (structure only)

**Aegis: The Oathbound Bulwark.** Chapter 1 "First Oath" (`shrine`) is a working example; chapters 2–5 are stubs
(`glacial`, `volcanic`, `marsh`, `celestial`). Each now ends in a titan. Origin: [PLACEHOLDER].
**Seraph-9: Fallen-Tech Cherub.** Five stubbed chapters (`celestial`, `shrine`, `glacial`, `elderwood`, `sanctum`).
**Lumen, Sylva, Pyre, Nyx:** locked until their vessels land. Map leanings are guesses from the names **(proposed)**.
All are to be re-outlined around the canon once Void Stalker's shape is approved.

## 7. Save and progress (cloud-synced)

- `localStorage` key `rift-realm-campaign` is written first, so saves work offline and for guests.
- Cloud: the Plajah game-save bridge (`services/gameSaves.ts` / `gameSaveCore.ts`, `plajah.save.*` postMessage, game id
  `rift-realm`, Firestore `gameSaves` in plajah-ops). It is used inside Plajah's game frame when signed in. The
  campaign lives under the cloud doc's `campaign` key.
- **Merge rule:** a chapter counts as cleared if either save cleared it. Keep the better best time and the higher
  kills; `last` comes from the newer save. On a `rev` conflict, merge with the cloud copy and store again.
- Shape (v1): `{ v: 1, updatedAt, last: { campaign, chapter }, chapters: { "<campaign>/<n>": { cleared, bestTime, kills, clears } } }`.
  A tries counter (section 2, option B) would add `tries` per chapter.

## 8. Menu flow and testing

Start → **Campaign** → **Vessel** (Void Stalker first; progress *k*/*n*; locked vessels greyed) → **Chapter select**
(title, map, objectives, best time; locked chapters greyed) → Loading → intro beat.
- `?campaign=<id>&chapter=<n>` boots straight into a chapter (it skips the menu).
- `?campaignunlock` opens every chapter.
- `?menustart=campaign` opens the menu on the Campaign screen.
- With `?rrdebug`, the runner is at `__rr.campaign`.

## 9. Code map

- `campaign/data.ts`: campaigns, chapters, steps and card text (placeholders via `PH`).
- `campaign/runner.ts`: `CampaignRunner`; nests `ModeRunner` for survive, trials and boss.
- `campaign/cards.ts`: the dialogue cards and the chapter result panel.
- `campaign/progress.ts`: the local save, the cloud bridge client and the merge.
- `menu/campaignSelect.ts`: the Campaign → Vessel → Chapter screens.
- `modes/index.ts`: the hidden `campaign` ModeDef; `ModeRunner.start(id, { timer, rounds })`.
- `main.ts`: the chapter picks the map and vessel; runner hooks, HUD line, `__rr.campaign`.
