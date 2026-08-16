# Safety

Three risks here are unrecoverable: they end the product rather than degrade it.
They belong in the design, not in a register nobody reopens.

## 1. Empty map

Players open the app and nobody is nearby. This killed Recoil (2017) despite good
mesh hardware and real geolocated maps, and Nerf Laser Ops Pro (2018) despite
Hasbro's shelf space and brand.

**Answer:** never launch open-world. Venue-first for public play, households for
everything else. Overwatch means a six-person floor can run a fourteen-person match.

## 2. Public-space optics

Gear that reads as a weapon at fifty yards, carried by a kid. One incident ends the
company, and no disclaimer prevents it.

**Answer:** design past the floor. Federal blaze-orange marking on imitation firearms
is the minimum, not the goal — non-realistic silhouettes, minimum marking-colour
ratio, no black/grey/metallic finishes, silhouette reviewed at distance in poor
light. Default play is geofenced. Block sessions are never public or discoverable.

Parks are run as **permitted events**: scheduled block, city permit, marshal on site,
bounded geofence, neighbours notified. That makes a park a temporary venue with an
operator. Ambient open-world play in public stays permanently off the roadmap.

## 3. Adult-minor contact

Physical proximity between adults and unknown minors is not fixable by moderation
after the fact.

**Answer:** two different lobby types with two different rules.

- **Public play** is age-tiered and enforced structurally. `Session.ageTier` is
  immutable once the session leaves draft. There is no code path — including admin
  tooling — that moves an under-18 participant into an adult lobby. Under-18 sessions
  are never publicly discoverable or matchmade, are restricted to verified venues,
  and have an accountable adult on site.
- **Household play** is closed-graph. Invite-only from a roster, never discoverable,
  no chat outside the invite. Age tiering does not apply because the only adults
  present are the family — a parent playing against their eight-year-old is the
  entire product.

## Host console

For household and block sessions the host draws the boundary and their phone becomes
a live console: every participant on a map, with anyone crossing the line pulled from
the match and the host alerted.

This is a genuinely better supervision tool than parents have today, and it is the
kind of feature that makes a parent want the app. **It is not a legal shield.** Review
with counsel before any block-play pilot.
