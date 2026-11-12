# Era Clash 3D: the castle, the temple, and the witch on the volcano (Acts I → II)

This is Kenne's story direction (2026-11-12). It extends [the forest road plan](era-clash-3d-forest-road.md) and [the city plan](era-clash-3d-city-plan.md). Places land on [the map](era-clash-3d-map.md) as they are built.

## Decisions (Kenne, 2026-11-12)

- **Act II is its own area.** Act I ends at the temple and the castle, which you can reach from the city. Act II loads a new mountain region: the valley road (the ride), the mine at the volcano's foot, the ascent to the snow line, the sacred crystal cave, the lava caverns and the crater oasis. This keeps each area light enough for the iGPU.
- **The witch is a standalone figure.** She is a mountain witch from Sengoku folklore (yamauba-like), made for Era Clash. A hook is left that she may serve something larger. No Void or Elohim canon is written.
- **Names are proposed.** Every name below is marked (proposed) in the game and in these docs, for Kenne to change.
- **Daybreak runs on a real clock.** Night falls when the heroes leave the temple, and the sky lightens as time passes. Riding saves time. Reach the witch before dawn, or she kills the lord; you then retry from the cave mouth. The clock is generous enough to walk, but tight.

## The cast (all proposed)

| Role | Name | Who |
|---|---|---|
| The lord of the city | **Lord Kageyama Tadaoki** | Captured in the raid, and held by the witch at the summit oasis. |
| The soldier guide | **Sōta**, a spearman (yari ashigaru) of the castle guard | The one man the hex didn't take. He knows where the hexed army is kept and the way up the mountain. |
| The witch | **Kurenai, the Ash Witch** | She hexed the guard and the army that protected the city, and she keeps the lord near the summit. |
| Her disciple | **Gōzan** | He keeps the hexed army bound and labouring in the mine. |
| The temple's abbot | **Abbot Ennen** of **Hōrin-ji** | He shelters what is left at the temple and tells the heroes what happened. |

## The story beats

### Act I, end: the temple and the castle

1. **Past the forecourt**, a road climbs north to the castle on its hill (z ≈ 400). Hōrin-ji temple stands on the hill's lower terrace.
2. **The castle is empty.** The gates are open, the guard is gone, and the keep is silent. The heroes learn there that **the lord has been taken** to a sacred cave high on the volcano.
3. **At Hōrin-ji**, raiders hold the temple grounds. Clearing them **frees Sōta**, who was tied up in the bell house. Abbot Ennen and Sōta then explain (a cutscene):
   - a powerful hex was laid on the guard and the army that protected the city;
   - Sōta alone escaped it, because it did not take on him (why is left as a hook);
   - the hexed army is kept in a mine on the mountain, bound and worked by Gōzan;
   - Kurenai holds the lord near the summit and will kill him at daybreak.
4. **The choice:** horses wait at the temple stable. Riding is fast and safer. Walking is possible, but slower and draws more ambushes. **Night falls, and the clock starts.**

### Act II: the mountain

5. **The valley road (about 1.2 km):**
   - ride or walk up the valley toward the volcano;
   - ambushes from raiders and the witch's hexed beasts;
   - Sōta rides with the crew and points the way.
6. **The mine at the volcano's foot:**
   - hexed soldiers labour in a trance; they are not enemies, and striking them does nothing;
   - Gōzan's guards fight;
   - **boss: Gōzan.** Defeating him loosens the hex's hold on the mine (the soldiers stop working and stand waiting), but the hex is not broken. Sōta stays to guard them.
7. **The ascent:** switchback paths up the flank, through the forest, then bare rock, then the snow line. Wind and snow, and a few of the witch's sentinels.
8. **The sacred cave:** a hidden mouth near the snow, opening into caverns full of bioluminescent crystals (blue, violet and green light).
9. **The lava caverns:** deep chambers with lava pits, crossed on narrow rock spans and old rope bridges. Heat shimmer, embers, and falling rock.
10. **The oasis:** a crater hollow walled by volcanic rock and open to the sky. A hot-spring pool, a lush garden, mist and stars. The lord is bound at a stone altar.
11. **Boss: Kurenai, the Ash Witch.**
    - Fight her and keep her from reaching the lord before the sky turns: if her ritual completes at dawn, the lord dies.
    - Phases: hexes, summoned ash wraiths, a fire-and-ash storm.

### Ending (Act III setup)

12. **Kurenai falls and the hex breaks.** Across the mountain, the army wakes.
13. **Back in the city:**
    - the freed army joins the heroes to drive out the raiders still roaming the streets (Act III);
    - Lord Kageyama retakes his seat and leads his city again.

## Systems this needs

- **Chapter loading.** main.ts runs one world (chapter1.ts). Act II needs a chapter switch: unload Act I, build the mountain world, and carry the crew's state (health, blessing, horse) across. This is the first engineering step.
- **The night clock and the sky.** Use the existing look.ts golden hour and raid looks plus a night preset. A time-of-night uniform runs from 23:00 to dawn at about 05:00, compressed into roughly 35 minutes of play (to be tuned). The HUD gets a small moon and sun arc.
- **Horses** (forest road plan, phase 6). They are needed here; the ride is the reason to have them.
- **Non-hostile hexed soldiers:** townsfolk-like crowds that labour (swinging picks, pushing carts) and ignore the hero.
- **Bosses:** Gōzan (a heavy melee brute with a hex shield) and Kurenai (a caster with phases). These go into mobs.ts as boss kinds with their own move sets.
- **Caves:**
  - interior geometry (an SDF-like rock shell built from merged deformed meshes);
  - crystal light: emissive crystals with a few pooled point lights, like the fire-light pool;
  - lava: an emissive flowing surface, damage on contact, an ember VFX.
- **Snow:** snow-line material on the ascent, the weather.ts snowfall, and wind.

## Build phases

1. **Act I end:**
   - a terrain tile north of the forecourt;
   - the castle road;
   - the castle hill rebuilt as a reachable castle (an empty keep you can walk round and into its yard);
   - Hōrin-ji;
   - the temple fight, freeing Sōta, and the cutscene;
   - the stable and the horses waiting (they ride once horses exist).
2. **Chapter loading** and the night clock.
3. **Horses** (also forest road phase 6).
4. **The valley road** and the mine, with the hexed workers and the Gōzan fight.
5. **The ascent** and the snow line.
6. **The crystal cave** and the lava caverns.
7. **The oasis** and the Kurenai fight, then the ending and the hex breaking.
8. **Act III:** retake the city with the freed army; the lord restored.

These run alongside the forest road plan's remaining phases (lush forest, fish market, forest fights, the shrine, wildlife). Recommended order: forest road phases 2–4, then this plan's phase 1, then horses, then Act II.
