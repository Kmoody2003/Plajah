# Ravencrest: The Liberation Campaign (design draft v0.2)

Status: second draft, 2026-11-10. Nothing here is built yet.
Names marked **(proposed)** are placeholders until checked against the Legend of
Elohim canon and *Psalm of the Unbroken*.

## 0. Two Ravencrests

| | **Ravencrest: Horror Classics slice** | **Ravencrest (the campaign)** |
|---|---|---|
| What it is | The film-collection experience in Plajah Cinema | A full original Plajah IP game |
| Status | Built, stays exactly as it is | This document |
| Cast | Jack, Elise, plus the Pumpkin Patch film cast (Melvin, Lil' Boo, Miriam and the flying monkeys, Stitch, Katrina and Crane/Robobones, the war-rig tank) | Jack, Elise and an original cast only; **no Pumpkin Patch characters** |
| Films | Cinema Mile billboards and Grand Hall paintings open films | No film browsing; billboards become in-world posters and story props |
| Length | ~20 min night | ~60 min campaign |

Both run on the same engine (`games/ravencrest/src`). The campaign is a second
entry point, and code shared by both stays shared, so the slice keeps getting engine
fixes. Film-collection content (cinema.ts, encounters.ts scene cards, the tank horde,
the Pumpkin Patch voice barks) is loaded only by the slice.

---

## 1. The setting

**The world.** Legend of Elohim, the same era as *Psalm of the Unbroken*. A quantum
weapon, **the Tehom Lance (proposed)**, was fired once and cut a seam between realms.
Since then Hell sometimes spills through in **realm fissures**, and where one opens,
reality catches the curse: rain falls upward, sound dies, clocks loop, mirrors
look back.

**The Church's answer.** A quiet Vatican office hunts these infestations, **the
Lantern Office (proposed)**, formally the Office of the Unbroken Seal. Armies turn
inside a fissure zone, so it **deputizes** a few people who have already survived one.

**The province.** **Ravencrest**, in **Forth America**. A fissure tore open under the
old fortress decades ago. Inside it slept **Dracula**, bitten a thousand years ago by
one of the fallen angels and laid in a sleep the Church thought permanent. He woke a
few decades ago and took the province. A **Hex** now covers the region: endless night,
storms, monsters on the roads, towns that stopped asking for help.

**Our heroes.** **Jack Thorne** and **Elise**, survivors of an earlier outbreak,
deputized by the Lantern Office, armed with relics, and sent in to **investigate the
Hex and begin the liberation of the province**.

---

## 2. The story in one paragraph

Jack and Elise's aircraft is brought down by the Hex at the border. Separated, low on
everything, they fight inland and learn from the dead and the few living that the Hex
is pinned in place by **Hexstones**, one per region; break one and morning returns to
that ground. Their only line out is a crackling radio to their handler in Rome. They
break their way to the fortress, cross the drawbridge, take the Grand Hall and bring
Dracula to his knees, and then he is **pulled away**: chains of hex light drag him into
the storm and a woman's voice says he isn't finished yet. Only the castle gets its
morning. Under the fortress they find her laboratory and her name: **Vesper Calloway
(proposed), the Hexmother**, once a scientist on the Tehom Lance project, who learned to
read the fissure, woke the Count as her weapon, and wove the Hex to feed the seam until
it opens all the way. Jack and Elise free the remaining regions stone by stone and
climb her cathedral on the lip of the fissure. The province sees its first full sunrise
in decades, and in the last shot something with wings looks up from the other side of
the closing seam.

---

## 3. The three ways it plays

The campaign braids three kinds of play, and every level leans on one or two of them.
This is the main change from the slice, which is almost all open combat.

### A. Survival horror
Tension from scarcity, isolation and the unknown.
- **Scarce resources.** Bolts, holy water, blessed rounds, healing tinctures are
  limited. You can't fight everything; sometimes you run, hide, or go around.
- **Grid inventory.** A satchel with limited slots; key items, combine items
  (tincture + herb = stronger tincture, flask + oil = firebomb). Upgrading the satchel
  is a reward.
- **Sanctuaries.** Chapels and shrines with a candle: the only places to save, store
  items in a reliquary chest (shared between every sanctuary), and swap heroes. The
  music changes there; nothing follows you in.
- **Locks, keys and backtracking.** Interconnected spaces (a mansion, a mission, a town)
  with crests, keys and puzzles that make you learn the layout, and shortcuts that open
  as you go.
- **Enemies that don't stay down.** Some dead get back up unless burned or blessed; a
  stalker enemy hunts you through one level and can only be driven off, not killed.
- **Documents.** Letters, lab notes, field reports: the story of the province and of
  Vesper, found in the world.
- **Camera.** Tighter over-the-shoulder, darker, the lantern as the light source.

### B. Action adventure
Exploring, climbing and solving ancient spaces.
- **Traversal.** Climb ledges, shimmy, wall-run short gaps, balance beams, swing on
  the Rosary Chain (grapple), rappel down shafts, swim the flooded Undercroft.
- **Tombs and crypts.** Optional and story chambers built around one environmental
  puzzle each: light beams and mirrors, water levels, counterweights, rotating rooms.
- **Set-piece escapes.** Collapsing bridges, a crashing aircraft, a flooding crypt,
  a tower falling into the fissure.
- **Relic-gated paths.** Each Vatican relic opens new routes in old areas, so a
  return trip pays.
- **Hunting for secrets.** Hidden relic fragments upgrade gear; journal pages fill
  in the lore.

### C. Hack and slash (refined from the slice)
Fast, deep, readable melee when the fight comes.
- **Jack's blade** (katana, already built) gains a proper move list: light/heavy
  strings, launchers, air combos, a ground slam, a charged draw-cut.
- **Perfect dodge** (a slow-time window on a late dodge) and **parry** (a timed block
  that staggers), with clear enemy tells; every enemy telegraphs readably.
- **Style rank.** Varied, unhit combos fill a rank meter (D → S → "Unbroken"),
  which scales relic-fragment drops. The combo comic strip from the slice becomes the
  S-rank flourish.
- **Weapon switching** mid-combo: blade, Rosary Chain, and Elise's crossbow/flasks.
- **Lock-on with target switching**, and a camera that frames the fight without
  turning while you steer (canon rule).
- **Executions.** Staggered enemies can be finished with a contextual kill that
  refunds a little health or holy water, which ties the action back into the
  survival economy.
- **Bosses with phases**, readable patterns, and a weak point that the level's curse
  or relic exposes.

**The rhythm.** Exploration and dread build pressure (A + B), fights release it (C),
sanctuaries reset it. Resources earned by fighting well (executions, style rank) feed
the survival side, so skill at the action makes the horror easier but never safe.

---

## 4. Campaign shape

Four acts, 13 levels, ~60 minutes on a first run. **Built** = reused from the
engine; **Extend** = reworked; **New** = to build. Mix: H = survival horror,
A = adventure, S = hack and slash.

| # | Act | Level | Min | Mix | Status | Ends at |
|---|---|---|---|---|---|---|
| 0 | I | Prologue: The Lantern Office | 2 | A | New | 0:02 |
| 1 | I | The Downing at Hollow Pines | 5 | A, H | New | 0:07 |
| 2 | I | Ashmoor Crossing | 6 | H | New | 0:13 |
| 3 | I | Saint Brennan's Mission (first Hexstone) | 5 | H, A | New | 0:18 |
| 4 | II | The Dead Road (the old Cinema Mile) | 4 | S | Extend | 0:22 |
| 5 | II | The Drawbridge: troll and kraken | 4 | S, A | Built (extend) | 0:26 |
| 6 | II | Courtyard, Grand Hall, Upper Wing | 4 | H, S | Built (extend) | 0:30 |
| 7 | II | The Count's Night (Dracula escapes) | 3 | S | Built (new ending) | 0:33 |
| 8 | III | The Undercroft (her laboratory) | 6 | A, H | New | 0:39 |
| 9 | III | Hollowmere, the Mirror Town | 6 | H, S | New | 0:45 |
| 10 | III | Tehom Station, the weapon ruin | 6 | A, S | New | 0:51 |
| 11 | IV | The Thorn Cathedral | 5 | A, S | New | 0:56 |
| 12 | IV | The Hexmother, and the first sunrise | 4 | S | New | 1:00 |

The built sequence runs from 0:18 to 0:33; Dracula's escape is the act turn just past
halfway. Survival-horror levels run slower than this estimate on a first play, so
in practice the escape lands closer to the 40% mark.

---

## 5. The province map

```
                         N
                 ┌───────────────────────────────────────────┐
                 │        THE FISSURE (Hell-lit sky)         │
                 │              ▲ 11 Thorn Cathedral          │
                 │              │   12 Hexmother             │
                 │   10 Tehom ──┘                             │
                 │   Station                                  │
                 │   (weapon ruin)        9 Hollowmere        │
                 │        ╲               (mirror town)       │
                 │         ╲             ╱                    │
                 │   6-8 RAVENCREST FORTRESS ─ 8 Undercroft   │
                 │        ║  drawbridge (5)                   │
                 │        ║                                   │
                 │   4 The Dead Road                          │
                 │        │                                   │
                 │   3 St Brennan's ── 2 Ashmoor Crossing     │
                 │      Mission            (border town)      │
                 │                            │               │
                 │                    1 Hollow Pines (crash)  │
                 └────────────────────────────┼──────────────┘
                                  S    province border
```

A **liberation map**: each region starts in Hex night and turns to dawn when its
Hexstone falls (reusing `daybreak.ts`, `grass.ts`, `flowers.ts`, `birds.ts`). Freed
regions keep their morning when you pass back through. The first run is linear north;
after the credits the map opens for free travel, NG+ and collectibles. Backtracking
into freed regions with new relics opens secrets (section 3B).

---

## 6. Core systems

**Liberation.** Every region has a Hexstone guarded by a Hex-warden. Break it and a
local daybreak plays: the storm stops over that ground, the monsters there burn away,
grass and flowers grow out from the stone, and its sanctuary becomes permanent.

**Reality curses.** Each region's Hex bends one rule of reality, and the level is built
around it.

| Region | Curse | What it does to play |
|---|---|---|
| Hollow Pines | **Falling sky** | wreckage falls in slow motion near the fissure scar; climb it while it hangs |
| Ashmoor Crossing | **Stutter** | the town loops the last 10 seconds when the bell rings; use the loop to solve, then break it |
| St Brennan's | **Silence** | no sound inside the walls; enemies hunt by sound you make; the lantern shows sound as light |
| The Dead Road | **The storm** (built) | rain, lightning, the dead walking the road |
| Fortress | **The nightmare** (built) | the bell, the dimming, the stalk |
| Undercroft | **Upward rain** | water flows to the ceiling; flooded rooms drain upward and open climbs |
| Hollowmere | **Mirrors** | reflections act a beat late and step out to fight; cross the mirror town to reach the real one |
| Tehom Station | **Unpinned gravity** | gravity flips room by room around the weapon's core |
| Thorn Cathedral | **Hell spill** | the floor gives way to the red under-realm for seconds at a time |

**Two heroes.** Both deputies are in every level. You play one; the other is an AI
partner, or separated from you for stretches (the horror is sharper alone). Swap at
sanctuaries.
- **Jack**: the blade fighter; the hack-and-slash depth lives here.
- **Elise** **(proposed)**: blessed crossbow, holy-water flasks and the lantern; strong
  at range and at puzzles (reads Hexstones and relic inscriptions), weaker up close.
- Some stretches are written for one of them alone (Elise through the silent mission,
  Jack through the mirror duel).

**Vatican relics.** One per act from Hex-wardens; each is a combat tool and a key:
| Relic | Combat | Opens |
|---|---|---|
| Lantern of Brennan (Act I) | stuns the dead, reveals invisible foes | dark and silent spaces, hidden writing |
| St. Michael's Edge (Act II) | blade upgrade: holy damage, charged draw-cut | blessed seals on doors |
| Rosary Chain (Act III) | pull, whip, swing enemies | grapple points, swinging, pulling down walls |
| Unbroken Seal (Act IV) | closes small fissures mid-fight | fissure-sealed passages |

**Allies (new, original).** No resistance army: the deputies are mostly alone.
- **The handler:** the Lantern Office voice on the radio, **Cardinal Oriel Sante
  (proposed)**: briefs, warns, and goes quiet at the worst moments.
- **The angels:** a host of angels rescues the deputies at the drawbridge (Act II)
  and returns for the final fight. Between those moments, one **guardian angel**
  (already built) stays with them through the orbs and angelic intervention, now a
  limited power you charge, not a constant helper.
- **Survivors:** a few named locals per region (a bell-ringer's daughter in Ashmoor, a
  mute monk at St Brennan's, a lighthouse keeper at Hollowmere) who give keys, lore and
  the occasional rescue. Not everyone makes it.

---

## 7. Level by level

### Act I: The Fissure Line (0:00–0:18)

**0. Prologue: The Lantern Office** (2 min, A)
A candlelit archive under the Vatican. Cardinal Sante shows them footage from
Ravencrest and swears them in. A small playable space: take the relics, a climbing and
combat drill in the Office's training hall, choose who you start as. Ends on the
aircraft over Forth America.

**1. The Downing at Hollow Pines** (5 min, A + H)
The Hex reaches up and takes the aircraft: a playable escape through the breaking
fuselage. Cold open in a burning pine forest, wreckage hanging in slow motion near the
fissure scar; climb the hanging debris to reach the ridge. Jack and Elise are
separated; you start with a handful of items. First dead, first ghost, first
sanctuary in a hunter's chapel. Reunite at the road.

**2. Ashmoor Crossing** (6 min, H)
A border town stuck in a ten-second loop whenever its bell rings, the townsfolk still
repeating the moment the Hex fell. A classic interconnected survival-horror space:
the inn, the general store, the sheriff's office, the church, locked by crests you
find around town. Use the loop (a door that's open in one cycle, a falling lantern
you can catch) to solve your way to the bell tower, then ring it yourself to break it.
The bell-ringer's daughter is the one living person here.
**Hex-warden:** the Bellwright, a giant built from the town's clockwork.

**3. Saint Brennan's Mission** (5 min, H + A)
A ruined mission in the snow inside a dome of total silence. Played as **Elise alone**:
the dead hunt by sound, so every step, door and dropped bolt matters. The Lantern of
Brennan shows sound as light. A crypt under the chapel holds a light-and-mirror puzzle
that leads to the first Hexstone.
**Hex-warden:** the Abbot Hollow, the mission's last abbot, wearing the silence like a
shroud (new).
**Reward:** the first liberation daybreak, small, over just the mission.

### Act II: The Count's Road (0:18–0:33), the sequence we built

**4. The Dead Road** (4 min, S; was the Cinema Mile)
The arrival road from the slice, with the film billboards replaced by the province's
own decaying signs and posters (story props, not films). Storm, dead on the road, the
bus wreck as a set piece. The hordes stay, but there's no tank rescue: you survive them
with the blade, the terrain and the angel. First real test of the refined combat.

**5. The Drawbridge** (4 min, S + A)
The troll and the kraken from the slice. Always on the first crossing in the campaign
(no 50% roll). The kraken cutscene keeps its beats (troll knocked down, "what is
that", the tentacles, "I could really use some backup"), but the answer is
**heaven, not Miriam**: the storm clouds part, a column of light falls on the bridge,
and **a host of angels** dives in where the flying monkeys used to. They strafe the
kraken arms with light, lift Jack and Elise clear when the deck buckles, and pull back
into the clouds as the troll falls. Title card in place of "The West Hallow comes to
assist": **"Heaven answers."** It's the first sign the deputies aren't alone, and it
sets up the guardian angel's power for the rest of the game.

Reuse: the slice's Miriam squad flies 12 instanced monkeys on strafing paths
(`bridgeBattle.ts`); the campaign swaps them for the built angel model and wing rig
(`angel.ts`: closed, spread and swept poses), with light beams in place of the
monkeys' attacks.

**6. Courtyard, Grand Hall, Upper Wing** (4 min, H + S)
The existing levels, made slower and stranger: fewer monsters, more dread, locked
wings opened by crests, documents in the upper wing that hint at a second presence in
the castle (a woman's portrait with its face burned out). A Hexstone in the Grand Hall
pulses with the bell; Dracula draws power from it. The paintings become portraits and
story art, not films.

**7. The Count's Night** (3 min, S, new ending)
The bell, the dimming, the stalk, the reveal, the boss, the blast into the courtyard,
the flyout: all as built, with the refined combat (parry his strikes, dodge his
teleports). **New ending at about 15% HP:**
1. Dracula drops to one knee in the rain. Jack raises the blade.
2. The sky splits violet. Chains of hex light wrap Dracula, and a woman's voice,
   calm and amused: "Not yet, Count. You still owe me a province."
3. He breaks into bats and is dragged up into the storm toward the north. The Hexstone
   in the hall shatters behind them.
4. Daybreak plays, but only over the fortress. From the battlements the camera pulls
   out: the rest of the province is still under the storm, and a sigil burns in the
   clouds over the fissure.
5. Title card: **"Ravencrest is not free."**

### Act III: The Hexmother's Reach (0:33–0:51)

**8. The Undercroft** (6 min, A + H; uses the fortress floor plan's unbuilt levels)
Down through the five fortress levels the floor plan already defines: crypts,
Dracula's thousand-year coffin, and under it a laboratory that should not exist in a
castle: quantum apparatus, notebooks, a photograph of a woman in a lab coat beside the
Tehom Lance. Water rains **upward** through the lower floors: rooms drain toward the
ceiling and you climb, swim and rappel through them. **A stalker** walks the Undercroft,
the Drowned Choir, which you can drive off but not kill until the end.
**Story beat:** her name is Vesper Calloway; she was on the Lance project; she found
Dracula in the fissure and woke him. The Hex is hers, not his.
**Relic:** the Rosary Chain.

**9. Hollowmere, the Mirror Town** (6 min, H + S)
A lake town where every reflection runs a beat behind and then climbs out. Cross the
mirror version of the town to find the real one, with the lighthouse keeper guiding you
by lamp signals. **Dracula returns**, hunted by Vesper's mirror-selves himself: a short,
tense standoff, and he vanishes, leaving a warning: "She doesn't want me to rule it.
She wants it to open."
**Hex-warden:** your own reflection (Jack's if you play Jack), a duel against your own
move list, the purest test of the action system.

**10. Tehom Station** (6 min, A + S)
The ruin where the Lance was fired, now the anchor of the whole Hex. Gravity flips room
by room around the weapon's core; Hell's light leaks from the cracks. A traversal
level of shifting floors and swinging, broken by arena fights.
**Hex-warden:** the Lance itself, reactivated by Vesper and defended by her shades;
disable it in three stages while the room turns.
**Reward:** the biggest liberation so far: the Hex over the south of the province
breaks, and from the station roof you watch morning moving north.

### Act IV: The Unbroken (0:51–1:00)

**11. The Thorn Cathedral** (5 min, A + S)
Vesper's seat on the edge of the fissure, a cathedral grown from black thorn over an
old church. The floor drops into the red under-realm for seconds at a time; a long
climb up the outside of the spire while Hell leaks in. The survivors you saved along the
way hold the doors (each one you saved makes this easier).
**Relic:** the Unbroken Seal.

**12. The Hexmother, and the first sunrise** (4 min, S)
Three phases:
1. **The Weaver:** Vesper casts every region's curse back at you (stutter, silence,
   mirrors, gravity, upward rain), a recap of the whole campaign in one fight.
2. **The Spill:** she opens the fissure under the cathedral; the fight drops into the
   red realm; the host of angels from the drawbridge returns and holds the seam open
   long enough for you to follow her.
3. **The Seal:** Dracula returns. **(Recommended)** he turns on her for chaining him,
   holds her for one beat, and Jack and Elise close the fissure on her with the
   Unbroken Seal. Dracula escapes again in the confusion: alive, free, a sequel thread.

**Ending:** a full daybreak across the province, the map turning gold region by region.
Epilogue in the Lantern Office: the deputies' report, the cardinal closing a file marked
Ravencrest and opening another. Last shot: behind the closed seam, a fallen angel lifts
its head. Ties forward to *Psalm of the Unbroken*.

---

## 8. Cast

| Character | Role | Asset status |
|---|---|---|
| Jack Thorne | Deputy, blade fighter | Built |
| Elise | Deputy, crossbow, flasks, lantern (proposed) | Model built; needs her moveset |
| Dracula | Act II boss, returns in III and IV | Built |
| Vesper Calloway, the Hexmother (proposed) | The real villain, final boss | New |
| Cardinal Oriel Sante (proposed) | Radio handler | New (prologue + voice) |
| The guardian angel | Limited intervention power | Built |
| The host of angels | Drawbridge rescue, return in the finale | Built model + wing rig; needs a flight squad (replaces Miriam's monkeys) |
| Survivors (bell-ringer's daughter, mute monk, lighthouse keeper) | Keys, lore, rescues | New |
| Troll, kraken | Drawbridge bosses | Built |
| Zombie, werewolf, wolf, ghost, vampire, Unknown | Common enemies | Built |
| Bellwright, Abbot Hollow, Drowned Choir (stalker), mirror-self, Lance shades | Hex-wardens | New |

**Not in the campaign** (slice only): Melvin, Lil' Boo, Miriam and the flying monkeys,
Stitch, Katrina, Crane/Robobones, the Pumpkin Patch war rig, their voice barks and film
scene cards.

---

## 9. Reuse and build size

**Reuse from the engine:** movement, camera and the combat base; Jack, Elise, Dracula,
troll, kraken, the angel and common monsters; the road, drawbridge, courtyard, Grand
Hall and upper wing; storm, nightmare, bats, wolves; daybreak, grass, flowers, birds;
the sound bank, score system, achievements, and the iGPU performance tiers.

**New work, roughly in order:**
1. **Campaign entry and slice split:** a second entry point, film-collection systems
   loaded only by the slice, level sequencer, checkpoints and saves.
2. **Survival layer:** grid inventory, item combining, reliquary chest, sanctuaries,
   resource economy, documents, keys and crests.
3. **Traversal layer:** climb, ledge shimmy, beam balance, swim, rappel, Rosary Chain
   grapple and swing. The biggest engine addition (animation and collision).
4. **Combat refinement:** move list, perfect dodge and parry, style rank, weapon
   switching, executions, phase bosses with clear tells.
5. **Elise's moveset** and partner AI.
6. **Seven new levels** plus the Lantern Office set, each with its reality-curse
   mechanic; the floor plan already covers the Undercroft.
7. **New characters:** Vesper, the cardinal, survivors, five Hex-wardens (local
   pipeline first; no credit spend without approval).
8. **Story delivery:** cutscenes, documents, voice, a score per act.

Performance rule holds: every level at 60 fps on the Arc iGPU in the browser at the
baseline tier.

---

## 10. Open questions for Kenne

1. **Canon names:** the weapon, the Vatican office, the fallen angel, the sorceress.
2. **Psalm of the Unbroken:** any crossover (a character, location, the same angel)?
3. **Dracula's end:** escapes again (recommended) or a final rematch?
4. **Partner:** AI partner with swaps at sanctuaries (recommended), or local co-op too?
5. **Horror weight:** how scarce should resources be on normal difficulty, and do you
   want a harder "Survivor" mode with limited saves?
6. **Title:** keep "Ravencrest" for the IP and rename the slice (e.g. "Ravencrest:
   Horror Classics Night"), or give the campaign a subtitle?
7. **Music:** a score per act from your folder, as with the current rules? New pieces
   planned for Acts I, III and IV?
