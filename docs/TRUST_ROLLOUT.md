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

## Still open

- `organizations` and `businessPages` public docs still carry `ein`, `legalName`, `financeSettings` (with `recurringBills`), `stripeAccountId`, role lists and `staffSeats`. About 20 finance components read these, so moving them is its own change. `stripeAccountId` client writes on `businessPages` should also be blocked.
- Public user docs still carry `fcmTokens`, `masterEmail` and `aliases`, and `isChild` is readable by direct lookup.
- Classroom rosters remain on the public class doc.
- Gated sanctuary files may be reachable if their storage URLs are public. Trashed media stays reachable by URL for 30 days.
- Staff can write or trash a department file by exact id, because rules can't see departments.
- `/api/garage/claim` pre-claim, ticket email and push abuse, no daily Veo quota, evite `venueName` and `Math.random` ids, and client-built licenses in `unlockSovereignListingForChurch`.
- `elevate_mobilize_bundles` has no rule, so cloud saves fail silently and the device holds the only copy.
- Shared browser stores `studio:blob`, `tela-assets` and `plajah.creative.rev.*`.
- A client-reported Tela audit is gone, but notification text is still sender-written.
- Pre-existing failure: `testEduAnnouncementRules` "church staff reads any class" fails on the old rules too.
