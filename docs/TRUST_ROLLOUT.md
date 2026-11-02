# Trust rollout (branch fix/trust-rules)

Order matters. Rules, server and client go out together, because old clients are denied on queries the new rules no longer allow. All scripts are dry runs until given `--apply`.

## Before anything goes live

Try these on a staging project with real accounts. The rules tests check single requests and can't check whether real queries satisfy the list rules, so this is the largest remaining risk.

- Roster as member, admin and outsider, and a public org page signed out.
- Sign out, sign in as someone else on the same browser.
- Parent resets a child's password, child signs in.
- Class join by code, free course self-enrol, private club, sanctuary.
- Share a Tela doc, revoke it, open its images, then remove the author from the org.
- Content HQ: department file, Finance file, shared with me, org to org.

## Secrets to set on plajah-api first

Missing ones fail closed, so set them before the server ships.

| Variable | If missing |
| --- | --- |
| `HQ_STREAM_SECRET` | HQ streaming returns 503, preview falls back to full download |
| `CAMPAIGN_UNSUB_SECRET` | Campaigns return 503 |
| `KITH_SIGHTING_SECRET` | Sightings off |
| `STORED_VALUE_PEPPER` | New gift cards refused |
| `CRON_SECRET` | Scheduled sweeps return 401 |
| `CAMPAIGN_UNSUB_LEGACY_SECRET` | Optional. Set before rotating the service account so old unsubscribe links keep working |
| `TELA_MEDIA_SECRET` | Optional |
| `CLAMAV_HOST` | Heuristics only, and the app says so. See `deploy/clamav/README.md` |

## Steps

1. Copy data, dry run first and read each list: `migrateUserPrivate --phase=copy`, `migrateVideoPrivacy`, `migrateClassEnrollment`, `migrateClubSanctuaryMarkers`.
2. Deploy indexes and wait for them to finish building.
3. Deploy main, ops and storage rules, the server and the client together.
4. Run the step 1 scripts again to catch writes made in between.
5. `migrateUserPrivate --phase=strip`.
6. `scripts/purgeChildPasswords.ts --apply`.
7. `scripts/migrateHqText.mjs --apply` and `scripts/migrateTelaMedia.mjs`.
8. `scripts/scheduler/setup-hq-retention.sh --apply`, and schedule `POST /api/coedit/sweep`.

Skipping the copy in step 1 breaks guardian access, because the rules read `private/profile`.

## After it ships

Children's passwords were publicly readable, so treat every existing one as exposed. Purging removes the copies but doesn't change the passwords. Each child's password needs resetting, by the parent or teacher.

## What people will notice

- Parents can't view a child's password. They reset it and see the new one once.
- Existing free academic and church classes need a join code unless marked open. Review the list in `migrateClassEnrollment`.
- Children no longer appear in any search, including teacher and mention lookups.
- Non-members lose locked sanctuary teaser cards.
- Private clubs with automatic join now go to pending.
- Staff seats need a verified email on file to self-claim. Finch imports have none, so those people use ID plus last name.
- Paychex needs operator approval per org. Department leaders lose the payroll directory.
- Ordinary members can no longer post as the org.
- Staff lose departments they aren't in. Org admins lose Finance files.
- Signing out reloads the app. Old local work with no owner stays unread, with no recovery path yet.
- Hub pairing needs redoing after the first sign-out.
- Co-teachers get no guardian links, so their assignments may not reach parents.
- Images in shared or org Tela docs may break in letters and album art, because only chat, articles and periodicals grant media access.

## Private org, business and class data (release/trust-next)

Dry run every script first and read its list. Copy phases only add; strip phases skip anything not yet on the private doc.

1. Before the deploy: `migrateOrgFinance --phase=copy`, `migrateBusinessPrivate --phase=copy`, `migrateClassRoster --phase=copy` (rules read its markers), `migrateUserPrivate --phase=copy`, `migrateHqDepartmentWriters`.
2. Deploy main, ops and storage rules, the server and the client together. Run `scripts/probeRuleset.mjs` on the minified main rules first.
3. Run the copy phases again.
4. Let the ops mirror reconcile, so it holds business seats from `private/staff`.
5. Strip: `migrateOrgFinance`, `migrateBusinessPrivate`, `migrateClassRoster`, `migrateUserPrivate` with `--phase=strip`.
6. `migrateSanctuaryGated`. Review the public originals it lists.

New env: `VEO_DAILY_LIMIT` is optional (default 10). Gated sanctuary files use `HQ_STREAM_SECRET`, so they return 503 without it.

## What people will notice from this round

- Org admins and regular pastors lose EIN, legal name and finance settings until finance adds them.
- Department leaders get approval limits from the server, without recurring bills, so their budget forecast leaves those out.
- A free course joins through the server. Teachers can't edit a roster directly.
- Trashing media breaks its URL at once, including anywhere else that URL was pasted. Restore brings it back.
- A vehicle added by hand loses to the shop's customer, or to a claim code, on the first published service.
- Song licences need a live Stripe link. Seeded listings without one no longer unlock.
- Staff outside a department can no longer change its files, and department members now can.

## Still open

- `isChild` is still readable by direct lookup. Safety rules and client checks read it on other people's docs, and 68 files open users docs directly, so hiding it needs a server card route first.
- Org role lists remain on the public org doc. Rules across the main database read them.
- `unlockSovereignListingForChurch` Plajah+ mode is refused: listings are device-local, so the server can't verify a tier. Listings need a server home.
- A new department file has no writer marker until someone lists its folder or the roster syncs.
- A client-reported Tela audit is gone, but notification text is still sender-written.
- Pre-existing failure: `testEduAnnouncementRules` "church staff reads any class" fails on the old rules too.
