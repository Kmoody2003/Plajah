# Balance Fields — how a mixed casual lobby is evened

See ADR-0011 for the reasoning. The one-line version: cross-tier fairness comes from the
**environment and the geometry of the shot**, tuned by the host, and it is always
*legible* — a player can see why a shot might miss.

## The base: hit chance is coverage

A shot casts a cone from the shooter's server-known position and bearing. Its half-angle
comes from three things:

```
effectiveSpread = base(deviceTier)  ×  confidenceFactor(fix)  ×  fieldFactor(position)
```

- **deviceTier** — phone starts wide and forgiving, gear starts tight and precise
  (ADR-0003's "wide on phone, narrow on gear", now made explicit).
- **confidenceFactor** — a stale or low-confidence fix widens the cone. Can only widen,
  never tighten (`PositionFix.confidence`, `HitEvent.confidence`).
- **fieldFactor** — any Balance Fields the shooter is standing in.

Whether the shot lands is **how much of the target's angular footprint the cone covers**,
scaled by confidence. Because a nearer target subtends a larger angle, **proximity raises
hit probability for free** — it is geometry, not a die. A perfectly aimed point-blank
shot approaches certainty; a loose shot at range legitimately might not connect.

## The three fields

All are host-placed or host-toggled, **visible in play**, and **casual-only**.

| Field | Applies to | Effect |
|---|---|---|
| **Aim Aura** | phone-only players | Widens their forgiveness cone — a soft assist that closes the tempo gap on offence. |
| **Shear** | precise (gear) shots | Adds scatter to a pinpoint shot, globally or inside a zone. The phone's wide cone barely feels it; the laser does. This is the "wind shear" idea. |
| **Bubble** | phone-only players | A light damage-soak or brief post-hit grace, offsetting the second they stood exposed while locking. A defensive evener rather than an offensive one. |

A field can attach to a **player** (by tier) or cover a **zone** of the arena. Zones let a
host build asymmetry into the map — a shear pocket around a long sightline that blunts
gear's range advantage, an aura in a choke where phones brawl on even terms.

## The host dial

One **Fairness** strength, `0..1`:

- `0` — raw tiers, no compensation. What ranked always uses.
- `~0.5` — the casual default: mixed lobbies stay fun, gear still wins where winning is
  measured.
- `1` — fully evened, for a kids-vs-parents or wildly-mixed room.

Plus per-field toggles and per-zone placement. The dial only has meaning when
`Session.ranked` is false; ranked forces it to `0`.

## The standing rules

- **Downgrade-only.** Every modifier widens forgiveness or reduces precision, up to a
  cap. Nothing here escalates a hit — the resolution stays server-authoritative and the
  `confidence`-never-escalates invariant holds.
- **Legible, not random.** Prefer geometry and visible fields over hidden RNG. If a shot
  misses, the reason should be on the board: range, cone, or a field the player could see.
- **Never invert the tiers.** Fairness compensates the phone and reins in the gear's
  *precision*; it never makes the phone the stronger device, because that erases the
  upgrade incentive (ADR-0004).

## What it needs from the schema

`src/types/balance.ts` (new): `BalanceFieldKind`, `BalanceField`, `FairnessConfig`.
`Arena` gains host-placed `balanceFields`; `Session` gains a `fairness` config (inert
when ranked). `HitEvent` records the `effectiveSpreadRad` and any `fieldModifierId` that
shaped it, so a contested call can be explained and replayed.
