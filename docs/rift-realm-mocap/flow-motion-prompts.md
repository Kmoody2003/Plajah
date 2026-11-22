# Motion videos to generate in Flow, for the Rift Realm character rig

These clips fill the moves that no character video or CMU take covers well. Each one goes through our pipeline:
capture (MediaPipe) → solve (pose lifter + foot lock) → game clip → retarget onto the Forge rig.

## Rules for every clip (these decide whether the capture works)

The reels we have fail on exactly these points (VFX hide the body, camera cuts, wings over the arms, close-ups).
Put this block at the end of **every** prompt:

> One performer only. Full body visible head to toe for the entire clip, feet always in frame and touching a plain
> floor. Locked-off static camera at chest height, no camera movement, no cuts, no zoom, no slow motion, real-time
> speed. Plain matte grey studio background, even soft lighting, no particles, no glow, no smoke, no magic effects,
> no motion trails. Performer in a form-fitting dark tactical suit with no cape, no wings, no long coat, nothing that
> hides the arms or legs. 8 seconds.

- **Angle:** use *3/4 front* (camera 30–45° off the performer's front) unless the line says *side*. Never shoot
  from behind.
- **Weapons:** a plain matte rifle or pistol prop is fine, as long as it doesn't cover the body. No muzzle flash
  (the game adds it).
- **One move per clip**, repeated 2–3 times if it's short. It can start and end in the same stance.
- **Format:** export the mp4 at 16:9, 24 fps or more. The longer the full body is in view, the better.

## How to hand them back

Drop the mp4s into `D:\plajah game assets deign from promtps\Shooter\` (any subfolder) and tell me the file names.
For each one I run `rrBake.capture(...)` and add a line to `scripts/riftrealm/clips/<character>.json`. The bake and
side-by-side frames do the rest, and `source` in the clip file then names your video.

## Void Stalker (player) — guns

| clip | prompt (add the rules block) |
|---|---|
| rifle_aim | An athletic male soldier stands in a firing stance holding an assault rifle at shoulder height with both hands, aiming straight ahead, feet shoulder-width apart, knees slightly bent. He holds the aim steady, breathing, with small natural sway. 3/4 front view. |
| rifle_fire | The same soldier in a rifle firing stance fires three short bursts at a target ahead; each burst kicks the rifle and shoulders back a little and he brings the sights back on target. 3/4 front view. |
| rifle_reload | A soldier holding an assault rifle at the ready lowers it to chest height, ejects the magazine with his left hand, pulls a fresh magazine from his belt, slaps it in, pulls the charging handle, and returns to the aim. Done twice. 3/4 front view. |
| pistol_aim / pistol_fire | A soldier holds a pistol in a two-handed isosceles grip, arms extended at eye height, aiming ahead; he fires four single shots with small wrist recoil, re-aiming each time. 3/4 front view. |
| pistol_reload | A soldier with a pistol drops the empty magazine, inserts a new one from his belt with his left hand, releases the slide and returns to a two-handed aim. Done twice. 3/4 front view. |
| weapon_swap | A soldier slings his rifle onto his back with one hand and draws a pistol from his thigh holster into a two-handed aim, then holsters the pistol and pulls the rifle back to the ready. 3/4 front view. |
| run_gun | A soldier jogs forward toward the camera holding a rifle at the ready across his chest, upper body steady, eyes forward, for several steady strides. 3/4 front view, the camera static, the performer covering about 4 metres. |

## Void Stalker — movement

| clip | prompt |
|---|---|
| strafe_run_left / right | A soldier faces the camera and runs sideways to his left with quick crossover steps, chest still facing the camera, then stops and runs back to his right. Front view. |
| slide | A soldier sprints from the left side of frame and drops into a feet-first baseball slide along the floor, sliding about two metres on one hip with the lead leg extended, then springs back up to a run. Side view. |
| vault | A soldier runs at a waist-high crate in the middle of the frame, plants one hand on it and swings both legs over to the side in a speed vault, lands and keeps running. Side view. |
| dodge_roll | A soldier in a combat stance dives into a forward shoulder roll and comes up on one knee, then stands; then a sideways roll to his left. 3/4 front view. |
| jump | A soldier jumps straight up from a standing crouch as high as he can, lands softly in a crouch, stands, and repeats. 3/4 front view. |
| crouch_walk | A soldier walks forward in a low tactical crouch, knees deeply bent, rifle at the ready, for several steady steps. Side view. |

## Void Stalker — melee and gun-fu

| clip | prompt |
|---|---|
| light_combo | A martial artist holding two short daggers performs a fast three-hit combo at an imaginary opponent ahead: a jab-slash with the right hand, a backhand slash with the left, and a spinning slash, then returns to guard. Done twice. 3/4 front view. |
| heavy_combo | The same fighter performs three heavy strikes: a lunging overhead stab, a rising uppercut slash, and a jumping spin kick, then returns to guard. 3/4 front view. |
| block / parry | The fighter holds a high guard, blocks three strikes from the front by raising both forearms, then parries one aside and counters with a short slash. 3/4 front view. |
| gunfu_close | A fighter in close combat strikes an imaginary opponent with a pistol-whip, sidesteps, and points the pistol at point-blank range, firing twice, then a knee strike. 3/4 front view. |

## Both characters — reactions and deaths

| clip | prompt |
|---|---|
| hit_front / hit_back | A soldier standing in a ready stance flinches as if hit in the chest from the front, staggering back one step, then recovers; then flinches forward as if hit in the back. Done twice each. 3/4 front view. |
| hit_left / hit_right | A soldier in a ready stance jerks sideways as if hit in the left shoulder, staggers, recovers; then the same from the right. 3/4 front view. |
| knockdown | A soldier is knocked off his feet backwards as if hit by a blast, lands on his back on the floor, rolls to his side and gets back up. 3/4 front view. |
| death_forward | A soldier hit from behind drops to his knees and collapses face down on the floor, and lies still for two seconds. 3/4 front view. |
| death_backward | A soldier hit in the chest staggers back two steps and falls onto his back, arms spread, and lies still for two seconds. 3/4 front view. |

## Robot Paladin (enemy) — his own heavy motion

Use the same rules block, but replace the suit sentence with: *a large armoured knight in smooth matte grey plate
armour with no shield, no cape and no glowing parts; the arms and legs are clearly separate.* The robot's detection
failed in more than half of his reel, mostly because of the shield and the beams.

| clip | prompt |
|---|---|
| paladin_walk | The armoured knight walks forward with heavy, deliberate steps, a long spear held upright in his right hand, for several strides. Side view. |
| paladin_run | The knight runs forward in a heavy charge, spear levelled ahead under his right arm, for several strides. Side view. |
| paladin_thrust | The knight steps forward and thrusts the spear straight ahead, recovers, and repeats with a sweeping side slash. 3/4 front view. |
| paladin_guard | The knight raises his left forearm in a high guard and braces, taking three blows, then lowers it. 3/4 front view. |
| paladin_hit / death | The knight staggers back from a heavy hit, recovers, then on a second hit drops to one knee and falls forward onto the floor. 3/4 front view. |
