# Grovewardens × player: co-op combat design (Void Stalker first)

Source: Kenne's reference set `D:\plajah game assets deign from promtps\Shooter\Grovewardens`. The 12 `Hero_*` clips show Void Stalker fighting beside a warden.
Split (Kenne, 2026-11-23):
- The **ents session** builds the wardens: bodies from the turnaround sheets, walks and their own moves (`src/ents/`).
- The **danger session** builds the player ↔ warden side (`src/danger/wardens.ts`).

## How it plays

**Wardens answer the soul.**
- A light soul can call a warden. A neutral soul can call one that is already awake. A dark soul is refused, and the ents session's wardens may turn on it.
- Praying near a warden counts as a call.

**Controls:**
- **Call (hold Y, ~1 s):** the nearest willing warden within 90 m walks to your side and keeps pace with you for 90 s.
- **Assist (tap Y):** a warden at your side performs its signature move on your lock-on target, or 12 m ahead of you. Cooldown is 15 s (10 s for a light soul).

**Synergy windows:**
- When a warden's move lands near you, a window opens for 1.4 s and a prompt names the combined attack and its key.
- Hit the key in time and you get the combo. Miss it and the warden's move still lands on its own.
- The window is timed from the ents session's `'ent-move' {phase: 'hit'}` event.

## The 12 wardens: each one's signature combo

| Warden | Its own move (ents) | Combo (key) | What the player gets | Reference clip |
|---|---|---|---|---|
| Ancient Oak | `root-grapple` | **Grapple Rend** (strike) | foes held in the roots take +60 % and stay held 1.5 s | Oak_knight_fights_titan_monster |
| Banyan | `root-cage` | **Void Burst** (Surge) | Surge inside the cage detonates everything held: 120, purple implosion | Hero_unleashing_void_skills |
| Baobab | `chest-slam` | **Rising Reap** (strike) | you hop and hang; launched foes take ×2.2 with chain arcs between them | Hero_fighting_demons_and_giant |
| Bioluminescent | `lumen-pulse` | **Lumen Charge** (dash) | your dash trails chain lightning through the stalled horde, +30 spirit charge | Hero_charging_and_tree_titan |
| Cherry Blossom | `petal-storm` | **Petal Storm** (heavy) | next heavy becomes a radial petal burst (7 m), each hit heals 4 | Hero_fighting_demons_amid_petals |
| Fungal Spore | `spore-burst` | **Spore Bloom** (passive) | +40 HP; next 3 strikes leave spirit spores | Hero_dodging_demon_attacks |
| Ironwood Thorn | `thorn-field` | **Thornbreak** (strike) | foes on the spikes are impaled: +60 %, held 1.5 s | Hero_fighting_with_ironwood_spikes |
| Pine Sentinel | `sap-wave` | **Ember Rain** (fire) | three burning cones called onto your target | Hero_battling_in_fiery_forest |
| Giant Sequoia | `titan-hammer` | **Hammerfall Leap** (jump) | ride the shock up; the next strike is a dive slam (6 m) | Hero_fighting_titan_and_demons |
| Swamp Mangrove | `bog-drag` | **Mire Reap** (strike) | the dragged horde takes +60 % while stuck | Hero_slashing_demon_enemies |
| Weeping Willow | `vine-lash` | **Willow Lash** (strike) | the strongest foe is yanked to you and staggered 2 s | Hero_parrying_demon_strikes |
| White Birch | `blizzard` | **Frost Lock** (strike) | foes in the gale freeze 3 s; strikes shatter frozen foes under 40 % HP | Hero_combats_demons_with_ice |

Any warden's shared moves open these combos:
- `smash` / `sweep` → Rising Reap
- `root-trap` → Void Burst
- `impale` → Thornbreak
- `shield` → **Bark Ward**: 6 s under its boughs, hits −80 %, +HP, strikes ×1.3 (Hero_striking_demons_with_shield)
- `lift` → **Skyroot Leap**
- `throw` → **Warden Hurl**: the landing becomes a slam
- `bless` → **Grove Blessing**: +20 % damage and +25 HP for a light soul

## Data
- `WARDEN_COMBOS` in `danger/wardens.ts` is plain data: warden kind → move, combo, key, window and numbers. Game Studio can override it through localStorage `rrWardenCombos`.

## Other characters
- Each vessel gets its own way of working with a warden. Void Stalker comes first.
- Kenne will send Void Stalker's fight moves. The combo finishers will then use those clips in place of the current light, heavy and surge clips.

## Lore questions for Kenne
- Are "Grovewardens" the in-world name?
- Who or what are the demons and titans in the clips? I've kept them generic and not tied them to the Void.
