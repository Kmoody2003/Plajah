# Plajah — Master Changelog & Historical Ledger

A dated, timestamped, per-commit record of how the platform is built.

Every entry has **two** descriptions:
- **Technical** — what changed in the code (this file).
- **Plain-English** — what it enables for people, which feeds the public
  What's-New page (Help → What's New) and the in-app update notification.

The plain-English copy and major/minor classification live in
[`data/changelog.ts`](data/changelog.ts) — keep the two in sync. Add a new
entry (newest first) every time the codebase is updated.

Legend: **[MAJOR]** = new capability or big change · **[minor]** = fix/refinement.

---

## 2026-07-01

- **14:19** · `9e2d00e` · **[MAJOR]** · Health — *feat(health): per-user experience health + predictive self-healing*
  - Technical: `healthMonitor.ts` client perf telemetry → 0-100 score; self-heals stale-build/chunk failures (SW update + controlled reload); escalates major degradation to `errorReports`; per-user snapshot to `userHealth/{uid}`. `AdminUserHealth` panel + tab.
  - Plain: Plajah watches how well the app runs for each person, fixes small problems itself, and alerts the team to big ones.

- **14:11** · `3cf15d8` · **[minor]** · Admin — *fix(analytics): missing liveFeed rule made the Analytics page error*
  - Technical: `liveFeed` had no Firestore rule (default-deny) → failed the admin analytics `Promise.all`. Added the rule + `safe()` per-read guard.
  - Plain: The admin analytics dashboard that showed a permissions error now loads.

- **13:41** · `c7eb6eb` · **[MAJOR]** · Support — *feat(support): platform-wide bug reporting with auto-attached 5-min session trace*
  - Technical: `sessionTrace.ts` 5-min ring buffer (privacy-safe) + `reportBug()` → `errorReports`; global `BugReportButton`; `ErrorReportsPanel` renders the session trail.
  - Plain: A "Report a bug" button on every page auto-attaches a private log of the last 5 minutes so the team can reproduce it.

- **13:31** · `b65c632` · **[MAJOR]** · Platform — *feat(changelog): master ledger + public What's New + update notification; seed demo church*
  - Technical: `CHANGELOG.md` + `data/changelog.ts` (technical + plain-English, major/minor); `PlatformChangelog` page; `UpdateNotification` (major/minor columns); Elevate admin seed-demo-church.
  - Plain: A plain-English "What's New" page in Help + a per-release summary of new features and improvements.

- **12:40** · `c2876cc` · **[minor]** · Sharing — *fix(share): shared non-Reello videos open the full-screen PLAYER, not the browse grid*
  - Technical: Boot handler routes non-Reello videos to the `PLAYER` view (`VideoPlayer`) instead of the `VIDEOS` browse grid, which ignores `selectedVideo`.
  - Plain: Shared video links open that exact video full-screen, not the general videos page.

- **12:23** · `97fb17e` · **[MAJOR]** · Elevate — *feat(elevate): Plajah Elevate — directory for faith, cultural & nonprofit institutions*
  - Technical: New `PLAJAH_ELEVATE` view; directory over public Organizations grouped by `orgType` (CHURCH/CULTURAL/NONPROFIT); new `CULTURAL` type; `?elevate=1` deep link; single-equality org query.
  - Plain: A new home for churches, religious organizations, cultural institutions and nonprofits — discover, follow, and give.

- **12:07** · `737c2a9` · **[minor]** · Sharing — *fix(share): video deep links fetch the EXACT video by id (not the recent-50 feed)*
  - Technical: Added `fetchVideoById`; boot + RelloView fetch the exact video by id.
  - Plain: Shared links work for every video ever posted, not just recent ones.

- **11:58** · `dc28f8e` · **[minor]** · Sharing — *fix(share): stop signed-out visitors being bounced off deep links*
  - Technical: `hasDeepLink` guard on the signed-out auth branch so the listener no longer clobbers deep-link views to `LANDING`.
  - Plain: Opening a shared link while logged out no longer bounces you to the home page.

- **11:35** · `db0cb12` · **[minor]** · Sharing — *fix(share): route the last share buttons through the canonical builder + boot*
  - Technical: Remaining share buttons repointed to `buildShareUrl`; boot handlers for the last asset types.
  - Plain: Every share button now produces a correct direct link.

- **11:26** · `c2756a6` · **[MAJOR]** · Sharing — *feat(share): platform-wide direct deep-links*
  - Technical: Boot opens books/articles/games/events/debates/clubs/videos directly via typed `?type/&id` and path routes.
  - Plain: Share any content and the link takes people straight to it.

- **11:09** · `f89eccf` · **[minor]** · Teleprompter — *feat(teleprompter): TV Studio switcher source + Podcast Studio ad-read prompter*
  - Technical: TV Studio Prompter source (`TeleprompterCanvasSource` → `captureStream`); Podcast Studio slim ad-read prompter.
  - Plain: The switcher can show the teleprompter to talent; podcasters get a compact ad-read prompter.

- **10:55** · `2e68f58` · **[MAJOR]** · Teleprompter — *feat(teleprompter): add Teleprompter as a platform app*
  - Technical: Teleprompter engine under `components/teleprompter` + in-app shell + operator/talent BroadcastChannel sync + Apps card.
  - Plain: A full teleprompter is built into Plajah and powers teleprompting across the platform.

- **10:04** · `c5e94c8` · **[minor]** · Church — *feat(church): the four Part-3 finalizers*
- **05:06** · `b753a58` · **[minor]** · Church — *Part 3 Phase 4 — reach & learn (broadcast, Servant Keeper, classes)*
- **04:59** · `f9f5864` · **[MAJOR]** · Church — *Part 3 Phase 5 — multi-site master control (campus program feeds)*
- **04:50** · `79c866c` · **[MAJOR]** · Church — *Part 3 Phase 3 — Aria sermon → article → book pipeline*
- **04:41** · `c738dfe` · **[minor]** · Church — *fix(church): make Phase 2 giving airtight — fund routing + live totals*
- **04:20** · `39a5a3d` · **[MAJOR]** · Church — *Part 3 Phase 2 — native Stripe giving (funds + QR + recurring)*
- **03:49** · `f98fa76` · **[MAJOR]** · Church — *Part 3 Phase 1 — church account, ministries, service times, demo church*
- **03:05** · `42b9577` · **[minor]** · Organizations — *Part 2 slices 3-5 — org management, "operate as", legacy migration*
- **02:45** · `26779ec` · **[minor]** · Organizations — *Part 2 slice 2 — org create flow + profile page*
- **02:36** · `7c9cd5b` · **[MAJOR]** · Organizations — *Part 2 slice 1 — the Organization primitive*
- **02:30** · `9117037` · **[minor]** · Accounts — *Part 1 slice 3 — consolidate duplicated profile fields*
