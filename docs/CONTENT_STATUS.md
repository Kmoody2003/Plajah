# Content status

Source of truth is the registry; this file is a hand-made snapshot (2026-10-04). Omitted status = LIVE (no badge).
Type: `services/contentStatus.ts`. Badge: `components/ContentStatusBadge.tsx`. To flip an item, edit/remove `status` in the registry, then update this list.

Wording: UNDER_REVIEW = "Under review: this content is being checked for accuracy." COMING_SOON = not clickable, shows "Coming soon".

## Course catalog (`services/courseCatalog.ts`, field `Course.status`)
| Item | Status |
|---|---|
| All Law ladder courses (`law-*`, from `data/lawMedicineRoster.ts`, set in `ROSTER_COURSES`) | UNDER_REVIEW (docs/review/law-*.uncertain.md) |
| All Medicine ladder courses (`med-*`, same mapping) | UNDER_REVIEW (docs/review/med-*.uncertain.md) |
| `atlas-brakes-g68`, `atlas-brakes-hs`, `atlas-brakes-college` | UNDER_REVIEW (docs/review/atlas-brakes.uncertain.md; awaiting ASE master tech) |
| `atlas-engine` (Engines) | COMING_SOON |
| `atlas-drivetrain` (Drivetrain and Chassis) | COMING_SOON |
| `atlas-other-machines` (Diesel, motorcycles, rail, marine, aviation) | COMING_SOON |
| Every other course | LIVE (still carries the existing Draft/Cross-checked AccuracyBadge from `data/practice/verificationData.ts`) |

## Machine Atlas systems (`services/machineAtlas/registry.ts`, `SystemEntry.status`)
| System | Status |
|---|---|
| brakes (car) | UNDER_REVIEW |
| engine (car) | COMING_SOON (not selectable) |
| drivetrain (car) | COMING_SOON (not selectable) |
| Diesel, motorcycle, rail, marine, aviation | not in the registry yet (COMING_SOON via course slot above) |

## Not in the app UI yet (nothing to badge; label when integrated)
- Cell Atlas (RBC page), Brain Atlas: artifacts only; ledger claims still `part`/`pend` => UNDER_REVIEW when ported.
- Trades curriculum beyond brakes (electrical, HVAC, plumbing, welding, construction): not authored => COMING_SOON.
- Open safety standards registry: not built => COMING_SOON.


## Cell Atlas (ported 2026-10-04)
- Red blood cell page and Brain/neuron page now live in `public/human-body/`, opened from the Human Body module (Cell Atlas button) and the Learn map. Status: UNDER_REVIEW (each page carries its own claim ledger; expert sign-off pending). Supersedes the "artifacts only" line above.
