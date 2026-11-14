# Era Clash 3D — the day: season, hour, weather

Every new game rolls its own day; it then lives while you play. Saving keeps the day as it stands; a new start rolls again.

## What's rolled (core/climate.ts)

| | |
|---|---|
| Season | spring · summer · autumn · winter |
| Hour | any hour; the golden hours a little more often. A full day passes in an hour of play (`DAY_RATE`). |
| Weather | clear · overcast · light rain · heavy rain · snow. Each season weights them (`SEASON_SKIES`); snow only in winter and late autumn. |

The weather turns every 2½–8 minutes, through cloud (`NEXT`): clear → overcast → light rain → heavy rain → back again; in winter heavy rain becomes snow. Cloud, rain and snow ease in over 30–60 s.

The ground keeps a memory: it **wets** in rain and dries over minutes (slower at night and under cloud); **snow lies** while it falls and thaws out of winter.

## Who reads it

| Piece | File | What it does |
|---|---|---|
| Light and sky | look.ts `setClimate` | Sun height and direction from the hour and season (it rises opposite where it sets); golden-hour photo sky → blue day dome → starry night → grey cloud lid; haze by time and weather; the moon lights the night. The raid layers smoke and ember on top of whatever hour it is. |
| Rain and snow | core/precip.ts | GPU streaks and flakes in a box that travels with the camera, leaning with the wind; drops spatter round the player. |
| Ground | ground.ts `groundWeather` | Wet earth darkens; the dirt road goes to mud; water stands in the wheel ruts and hollows (rippled while it rains); snow settles on the flat; autumn turns the meadow to straw. `puddleAt()` is the same sum on the CPU (splashes). |
| Trees | core/forest.ts + core/seasonLook.ts | Cherries blossom in spring, in leaf after; broadleaves turn gold, orange and red in autumn and stand bare in winter; snow on the evergreens. The far impostors follow. |
| Grass and plants | grassField.ts, undergrowth.ts | Straw in autumn, pressed under snow; shrubs flower in spring and stand in leaf after; wildflowers thin through summer and are gone by autumn; ferns brown, then lie down. Petals drift only in spring. |
| Road | chapter1.ts `roadRelief`, roadStones.ts | Worn track, dips, potholes, ruts; pebbles and verge rocks (dark when wet, snow on their tops); a weed here and there. |
| Footfalls | main.ts `footfall` | Running on dry dirt or sand kicks dust; any step in a puddle splashes; running in snow kicks powder. Dimmed at night. |

## Saving

Pause → **Save progress** stores the day (`eraclash3d.day` in localStorage). The story screen then offers **Continue saved day**. **To Battle** always rolls a new one. (Only the day is saved so far; chapter progress isn't yet.)

## Pinning a day (review, captures)

`?season=winter&hour=22&sky=snow` pins the day; `hour` holds the clock and `sky` holds the weather. In the console, `eraclash3d.climate.turn('heavyRain')` turns the weather now and `eraclash3d.dayLabel()` shows the current day.
