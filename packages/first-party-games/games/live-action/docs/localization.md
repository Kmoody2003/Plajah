# Localization

How a player's position and bearing are resolved, per tier. Everything here feeds
`PositionFix` in `src/types/arena.ts`, and every hit records which source produced
the fix that authorised it.

## Phone tier — nothing purchased

**Primary: visual relocalization.** ARCore and ARKit relocalize a phone inside a
pre-scanned space to a few centimetres. Niantic's VPS works the same way. The arena
survey is therefore not just polygons but a point cloud. A player walks in cold,
holds up their phone for two or three seconds, and knows precisely where they are and
which way they face — no beacons, no gear, no calibration ritual.

This also solves magnetometer drift, which is the real indoor problem. Compasses go
stupid near steel, HVAC and speakers; visual relocalization gives absolute heading
rather than a guess.

**Between fixes: pedestrian dead reckoning.** Step detection plus IMU, drifting
roughly a metre every ten to twenty seconds. Nobody holds a phone up for fifteen
minutes, so the game is built around the rhythm: raise to aim, fire, re-fix in the
same motion. Lower the phone and your position softens.

That is a mechanic, not a bug. Going dark means moving blind and shooting worse —
`HitEvent.secSinceFix` is what makes it cost something.

**Outdoors:** ARCore Geospatial localizes against Street View imagery with no
pre-scan, which covers most urban parks. Dual-frequency GNSS in phones since roughly
2018 gets under a metre with corrections.

**Peer ranging without infrastructure:** ultrasonic chirps between phone speakers and
microphones give around 10cm time-of-flight, cross-platform, requiring nothing. UWB
is already in iPhone 11+ and Pixel 6 Pro+ for direct sub-metre peer ranging.

## Gear tier

UWB trilateration between blaster, vest and surveyed anchors. Sub-metre and
continuous, so cover actually works and a player can fire while moving because the
gear carries its own tracking.

## Mixed reality

Shared spatial anchors, so a headset player and a phone player occupy one consistent
map. A rendering tier, not a power tier.

## Known failure modes

- **Dark venues break visual relocalization outright.** Below a usable light level
  the phone tier is disabled for that arena (`Arena.lightingOk`), and this belongs in
  the operator's survey checklist rather than in a support ticket.
- **Old midrange Android will not hold ARCore tracking at frame rate.** There needs
  to be a device capability tier that degrades to something coarser and slower rather
  than letting someone pay to be at a disadvantage.
- **Battery and thermals set match length.** Sustained camera plus AR tracking plus
  radio throttles most phones inside fifteen to twenty minutes and burns 25-30% of a
  battery in half an hour. Matches are twelve to fifteen minutes — treat that as a
  spec, not a compromise. It suits the format, and it makes a venue charging bar an
  amenity rather than an apology.
