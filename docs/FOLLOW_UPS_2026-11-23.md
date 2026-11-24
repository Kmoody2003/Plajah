# Follow-ups: work of 2026-11-21 → 2026-11-23

Integration branch: `feat/apex-elohim`. Everything below is committed on it; **nothing here is on `master` (= production) until the branch is merged and pushed.** Written from the commit log, git status and project notes; items are *not* re-verified against running code unless marked.

## 0. Before production

- [ ] Run the full build and the test suites (`npm run build`, plus admin-platform, group-join, playkit and studio tests) on the merged branch. Read the exit line, not just the output.
- [ ] The commit `chore: shared wiring …` holds `App.tsx`, `server.ts`, `types.ts`, `services/backendService.ts` hunks for the admin, groups and profile commits. Those three commits only build **together**; do not cherry-pick one alone.
- [ ] `master` held two commits that duplicate local work (`cf1c4e21` org-scoped home, `308a71ad` Resend signup email). Merged in; confirm no double-applied hunks.
- [ ] Firestore rules have ~zero headroom (see rules size limit note). Groups / join requests / ad metrics were written to avoid new client rules. Confirm before deploying rules.
- [ ] A new desktop package is needed for the C# `/api` proxy (latest built: 1.0.112.0, next 113).

## 1. Plajah ID (`docs/plajah-id.md`)

- [ ] Phase 1 committed (`2954078d`, `b2126a46`); **never deployed.**
- [ ] `scripts/plajahIdBackfill.ts` has **not been run** (dry run is the default; `--apply` needs `GOOGLE_SERVICE_ACCOUNT_JSON`).
- [ ] Phase 2: passkeys (`@simplewebauthn/server`) + two-sided login linking.
- [ ] Phase 3: 2-of-N org controllers + KMS-signed history. Phase 4 per the doc.
- [ ] Open decisions in section 9 of the doc.

## 2. Admin platform (System Admin refresh)

- [ ] Still unmeasured, shown honestly as "—" in Overview: storage/bandwidth, DAU, non-ad revenue.
- [ ] `adminAuditLog` is written only by the ad routes. Add `recordAdminAudit` to the other admin mutations.
- [ ] Ad events (`/api/ads/event` → `adMetrics`) are wired in the App left ad panel and `AdBreakBumper` only. Other ad surfaces record nothing.
- [ ] Not deployed; verify the new routes (`/api/admin/platform/*`, ad platform routes) need the admin gate in production.
- [ ] `admin-lab.*` is a local lab harness; decide whether to keep it in the repo.

## 3. Elevate / groups / profile

- [ ] Scoped experience: top-bar `barPages` and shell-next nav are **not scoped yet**; new sidebar ids must be added to `STARTER_NAV` / `ELEVATE_DISCOVER_NAV`.
- [ ] Group membership + join requests (`routes/elevateGroups.ts`, `services/groupMembership.ts`, `ClubJoinRequests`): committed with tests, not exercised in production; check notification and approval flows end to end.
- [ ] Prayer Call: a LiveKit room can outlive its 60-minute `endsAt` if no instance/client is around. Fix: handle `pc.*` rooms in the meetings webhook.
- [ ] Prayer Call needs `MEETINGS_SFU` + `LIVEKIT_*` set in the target environment.

## 4. Plajah Phone / SMS (Android)

- [ ] Play release needs the Permissions Declaration Form (SMS + Call Log) before upload.
- [ ] Phase 2: incoming MMS download, group MMS send, self-managed ConnectionService for Plajah calls, blocking, opt-in encrypted sync.
- [ ] Plajah-as-default-SMS and the RCS notification bridge are either/or; decide the default.

## 5. Media / creative

- [ ] Fabula: captions workbench, MPEG-2 conform, Deliver page and render queue are committed; no known open items recorded. Smoke-test delivery presets on real footage.
- [ ] On-air staff voices are blocked on the ElevenLabs invoice.

## 6. Game work (committed in `feat(playkit)` and `feat(games)` commits)

- [ ] `playkit/` (engine, render, physics, platform bridge) and the Game Studio compiler / pipelines / Aria agent landed with tests but have not been run in a full app build; run `tsconfig.playkit.json` type-check and the playkit/studio tests.
- [ ] `components/liveGames/ParlorStage3D.tsx` + `PartyPlay.tsx`: party-game 3D stage needs an in-browser check.
- [ ] Rift Realm (Elderwood, kit, places, terrain) and Forth Horizon (civic, bridges, forest): working-tree edits committed as one batch; check the Elderwood/Wilds scenes still load.
- [ ] `scripts/riftrealm/colab/` Hunyuan batch notebook committed as-is; generated output stays out of git (`/tmp/` ignored).
- [ ] Game memory notes list their own open items (Rift Realm, Apex, Era Clash, Vesselbound); this file does not duplicate them.

## 7. Housekeeping

- [ ] Stale local branches older than ~3 weeks, **not merged and not in scope** here: `backup/academia-before-secret-strip`, `claude/festive-swartz-f69147`, `claude/frosty-leavitt-b59549`, `feat/show-mode`, `feat/vehicle-model-templates`, `fix/privacy-rules`, `fix/trust-rules`, `worktree-agent-*`. Review or delete.
- [ ] Many extra worktrees under `D:/plajah-worktrees`, `D:/*-ship` and `.claude/worktrees`; prune the finished ones.
- [ ] Project memory notes still say "uncommitted" for Phone/SMS, Prayer Call, scoped experience and admin refresh; update them to "committed on feat/apex-elohim".
