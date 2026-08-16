# Mode — Dodge (school phys-ed)

**Working name.** "Dodge" is a placeholder until brand tokens are resolved.

A dodgeball-shaped mode for a phys-ed class, running in a gym on the institution
operator from ADR-0008. It reuses the whole engine — server-authoritative hit
resolution, the arena survey, zones, the host console — and changes only the verbs a
player uses and the rules the teacher picks.

## Why it fits the existing design

Nothing here is a new game. A thrown ball is a `HitEvent` with a flight time; a gym is
a private, institution-owned `Arena`; the teacher is the `host` role unchanged; the
sideline is a `Zone`. The only genuinely new mechanic is that **the counterplay to a
throw is your body**, and that falls out of ADR-0003 (hits resolve from geometry) for
free: if the server resolves a throw against where you are *at impact*, then stepping
out of the way is a real dodge, not an animation.

## The core loop — throw and dodge

- **Throw** is charged, not instant. Hold to wind up, release to throw — the same
  gesture and the same field as `Participant.lockMs`, reused: on the phone tier a
  throw takes most of a second to build, and you are exposed while it builds. A longer
  charge throws faster, further and in a tighter cone. This is the ADR-0004 tempo
  disadvantage wearing a gym uniform.
- **Dodge** is physical. The throw is a projectile with a short flight time, and the
  server resolves it against the target's position at the moment of impact, not at
  release. Move during the flight and the throw misses. `HitEvent.secSinceFix` still
  costs you: a player who has gone dark is easier to hit because their position is
  stale, which quietly rewards staying oriented.
- **Catch** is optional and tier-gated. A phone-tier catch is a timed contest — raise
  and hold as the ball arrives — and is off by default because a phone cannot feel a
  catch. A real catch (the thing that makes dodgeball dodgeball) needs a soft foam
  ball with an embedded tag on the gear tier; certify it, do not build it (ADR-0005).

## The rule that makes a teacher adopt it — no sit-out

Traditional dodgeball is banned in many districts for one reason: it eliminates, and
the first kids out are the ones who most need to keep moving. Because hits resolve
server-side, the teacher chooses what a hit *does*, and the default is not
elimination:

- **Freeze (default).** A hit freezes you for ~10s, then you are back in. Nobody sits.
- **Revive.** A hit sends you to a revival `Zone`; a teammate reaching you (or a caught
  ball) brings you back. Keeps the least-active kids moving toward a goal.
- **Classic.** Elimination, for an older class that asked for it. Opt-in, never default.

Teams are auto-balanced from the class roster. Rounds are short by construction — the
12–15 minute match length from `localization.md` is a gym period, not a compromise.

## Movement feedback without health ingest

A teacher wants to see the class move; COPPA and FERPA and ADR-0006 say under-18 health
ingest is off. Both hold at once because the feedback here is **not health data**:
distance and active minutes are derived from the game's own localization and IMU — the
same signal that already places the player — never from a heart-rate sensor or a
platform health API. It is reported as **class aggregate and personal-best only**,
never a per-child public leaderboard. `VitalsBand.affectsScoring` stays `false`;
movement never decides who wins the round, it just tells the class it moved.

## Equipment — and a real safety constraint

- **Do not make the throw an arm motion with a phone in the hand.** A child will let
  go of the phone. The phone-tier throw is a tap-and-charge on the held device, aimed
  by facing; the throwing *motion* only exists on the gear tier, where the object in
  the hand is a certified foam ball, not a $600 phone.
- **The school buys a kit, not thirty phones.** A class set of certified bands or foam
  balls plus a teacher tablet as the host console. This is the institutional-buyer
  economics ADR-0008 is built around, and it sidesteps the "not every ten-year-old has
  a phone" problem entirely.
- Bright space is mandatory (`Arena.lightingOk`), the boundary is the gym wall, and the
  host pulls anyone across a line instantly. Metre-scale accuracy (ADR-0003) makes this
  objective-paced, not a sprinting twitch game — which is also what keeps bodies from
  colliding.

## What this mode needs from the schema

Additive only:

- `Zone.role` gains `"revival"` (and the freeze state needs no geometry at all).
- `Session.mode` carries `"dodge"`; the hit-does-what rule is a mode setting, not a new
  table.
- A throw's flight time is a field on the resolution, not a new event type — a landed
  throw is still a `HitEvent`.

No new scoring path, no new balance surface, no health sensor. If a future edit tries
to make catches or movement decide the round, it is reintroducing the risk ADR-0006
designed out — read it first.
