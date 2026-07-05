# Plajah Elevate — Ministry Platform Blueprint

*July 2026. The plan to turn Elevate church/org spaces into a full ministry
platform that replaces the fragmented church-tech stack.*

## Thesis
Churches run 3–4 disconnected tools: a ChMS (Servant Keeper / Planning Center /
Breeze) **+** an app builder (Subsplash) **+** giving (Tithe.ly) **+** streaming.
No incumbent owns both the **record system** and the **media/community layer**.
Plajah is natively both, and **already ships every engine** the ministry space
needs — so this is mostly assembly, not invention.

## Engine mapping (build = wiring what exists)
| Ministry feature | Plajah engine that powers it |
|---|---|
| Photos gallery + albums (per church & ministry, editable) | **Plajah Photos platform** |
| Per-ministry / sub-ministry feed | **Posts / club-feed engine** |
| Staff roster + roles + 1-tap DM | **Org roster + Plajah DMs** |
| Ministry merch shop | **Store / MerchStore** (seller id = ministry) |
| Livestream + video archive | **Reello + Live / TV Studio** |
| Curated library + Sacred Library link | **Lorea + Sacred Library** |
| Sermon / staff notebook | **account-synced notebookService** |
| Giving funds (designated, recurring, statements) | **Stripe rails (built today)** |
| Prayer request wall | *new* — light layer on the feed model |
| Roles & volunteer permissions | **Org roles** + new granular scopes |
| CRM import (members + contributions) | *new* — CSV/Servant Keeper importer |

Data spine: Organization (orgType CHURCH/…) already has `ministries`,
`serviceTimes`, `givingFunds`, `campuses`, `roster`, `admins`. Extend with a
sub-ministry hierarchy + per-ministry content scoping.

## Pain points solved (from research)
- Four tools / four bills / no integration → one record; giving·serving·media·
  messaging all reference the same member.
- "Archaic" UI + weak apps (the #1 review complaint) → modern app is the baseline.
- Migration dread (the #1 switch blocker) → one-click Servant Keeper / CSV import.
- Different roles, different needs → granular per-ministry permissions.
- Media lives off-platform (YouTube/Spotify/Facebook) → church owns & monetizes it.
- Giving is a disconnected silo → funds on existing Stripe rails, in context.

## Roadmap
**P0 — assemble the ministry space (mostly wiring):** ministry hierarchy + photo
albums; staff roster + DM; per-ministry feed; ministry merch; video archive from
Reello. Ship first on the always-on demo church (Grace Chapel) as the sales tour.

**P1 — switch-unlockers (new, high value):** Servant Keeper/CSV importer; roles &
granular permissions (staff/leader/volunteer); prayer wall; sermon notebook;
curated Lorea library + Sacred Library link.

**P2 — operations depth (become the ChMS):** giving funds + year-end statements;
volunteer scheduling (Planning Center "Services" moat); check-ins/attendance;
groups & events; giving/attendance/engagement dashboards.

**P3 — cross-community re-skins over the same spine:**
- **Synagogues:** yahrzeit memorials, Hebrew-calendar events, b'nai mitzvah
  planning, High Holiday seating/aliyah, Hebrew-school check-ins.
- **Mosques:** prayer times & Jumu'ah, Ramadan/iftar, zakat & sadaqah funds,
  Quran study circles, youth classes.
- **Cultural centers:** exhibits/program calendars, members/patrons, media
  archives, ticketing, donor/grant funds.
- **Nonprofits:** donors + recurring giving, volunteers/roles, programs/events,
  impact feed, campaigns.
Each is the same underlying feature (a fund, a calendar, a roster, a check-in, a
library) with different labels — a real expansion, not a rebuild.

## Competitor cheat-sheet
- **Servant Keeper** — deep records, dated UI, weak app, siloed. CSV export exists
  (members via Group export, contributions via Contribution Manager) → import path.
- **Planning Center** — modular suite; worship **Services** scheduling is the moat;
  no store/media/social; price stacks per module.
- **Subsplash** — app/media shell ($300+/mo); no ChMS depth.
- **Tithe.ly** — giving + app ($119/mo); light ops tooling.
- **Breeze** — simple/cheap; deliberately no app/media/store.

Strategy artifact (full writeup): shared as a Claude artifact, July 2026.
