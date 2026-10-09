# Release announcements

When a creator's scheduled content goes live, Plajah posts to **their** feed and notifies their followers, using wording the creator chose while setting the release up (or the default).

## How it works

- **Visibility is exact and needs no job.** Albums, books, movies, videos and embargoed articles stay where they are; every reader compares the release time to the clock (`releaseDate` / `embargoUntil`). Nothing flips at release.
- **The announcement is the only thing that needs an event.** `POST /api/cron/release-announcements` runs `sweepReleaseAnnouncements` (`services/releases/releaseAnnouncer.ts`). For each item whose time passed inside the look-back window (72h) it, exactly once: posts to the `feed` collection as the creator, writes an in-app notification for each follower, and pushes to their devices.
- **Exactly once, at three levels.** A `releaseAnnouncements/{key}` claim doc is created create-if-absent before anything is sent; the feed post has a deterministic id (`rel_<key>`); and every follower notification has a deterministic id (`rel_<key>_<followerId>`), with push sent only when that create succeeded. Overlapping runs, retries, crashes mid-send and repeated sweeps can never double-post or double-notify anyone.
- **Any audience size.** Followers are read in pages (200) ordered by `followerId`; after every page the claim stores a `cursor` and stays `sending`. A run that reaches its time budget (40s) simply stops and the next run resumes from the cursor, so a 100k-follower creator takes several runs instead of being capped. Transient errors leave the claim `sending` and are retried (safe, see above); after 5 attempts it becomes `failed` and the error is on the claim doc. Needs the composite index `follows(followingId, followerId)` in `firestore.indexes.json` (deploy it before launch); a missing index makes the claim retry and then fail loudly, it never looks like "no followers".
- **Serial books, per chapter.** `SerialScheduler` writes `chapterSchedule` and `nextChapterReleaseAt` (the earliest upcoming drop). Each drop is announced ("The Wreck of Salt"); if several are due at once only the newest is announced; the server then advances `nextChapterReleaseAt` to the next future drop. The creator's wording applies to every drop of that book.
- **Lateness** is at most one scheduler interval (the content itself is visible on time).

## What the creator controls

`ReleaseAnnouncementField` (`components/release/`) appears wherever a release time is set: the album/book/movie creator (under "Set a future release date"), the book submission flow's Details step (when the publication date is in the future), and the article desk (when an embargo is set). Default: **announce, with the platform wording** `"<name> just released a new <type>: <title>"`. They can edit the message (280 chars, `{title}` `{name}` `{type}` placeholders) or switch it off. Stored on the content as `releaseAnnouncement: { enabled, message }`. If switched off, nothing is claimed, posted or sent.

## One-time setup (Cloud Scheduler, same key as the other cron jobs)

```bash
gcloud scheduler jobs create http plajah-release-announcements --location us-west1 \
  --schedule "*/5 * * * *" --http-method POST \
  --uri https://plajah.com/api/cron/release-announcements \
  --headers x-cron-key=<CRON_SECRET value> --project gen-lang-client-0665118474
```

`CRON_SECRET` already exists (email notifications, safety sweep). No new secret.

## Adding a content type

Add one entry to `RELEASE_KINDS` (collection, time field, how to tell it is scheduled and public, owner, title, cover, feed type, link). Covered today: `albums` (music, books, movies), serial `chapter` drops, `videos`, `articles`.

## Known limits

- Standalone videos can now be scheduled ("Release later": a toggle + datetime-local with the announcement wording field) in `VideoTab`, `VideoManager` and the Reello upload in `AlbumCreator`. `uploadVideo` stores `isScheduled` / `releaseDate` / `releaseAnnouncement` and does NOT send the immediate "New Video" follower notification for a scheduled upload: the sweep announces it at release. A scheduled video is hidden from everyone but its owner by `services/releases/visibility.ts` (`isFutureRelease`, `visibleToViewer`), applied in the central fetchers, the Reello/Video/profile/Chora/sound/feed-card readers, direct open by id ("Not available yet") and the server share-card, embed and FAST mRSS routes. The owner sees a "Scheduled for <date>" badge in `VideoManager`/`VideoTab` and can change the date or publish now (`rescheduleVideo`, which sends the follower notification once). Guard test: `npm run test:videoschedule`. Premieres reuse `isScheduled`/`releaseDate` for their start time, are public beforehand and are exempt (`isPremiere`). Videos a scheduled album copies to the gallery inherit the album's schedule and are marked `releaseAnnouncement.enabled: false` so the album's announcement is the only one.
- Premieres are excluded from the sweep (they reuse `isScheduled` + `releaseDate` for their start time and have their own flow).
- Audience size is no longer a limit; only time: roughly 3,000 recipients per 40s run, so a very large audience is reached over several 5-minute runs (the tail gets it later; the feed post and the content itself are on time).
- **The 72h look-back is deliberate.** Nothing older is ever announced automatically, so shipping this (or a long scheduler outage) can never announce a three-week-old release as new. For one deliberate catch-up an admin can call the route once with `?hours=240` (max 720); the claim docs still prevent repeats.
- Followers with notify level `NONE` are skipped; `HIGHLIGHTS` and `ALL` get release notices (a release always counts as a highlight).
- Not run against live Firestore, FCM or Cloud Scheduler: tested with an in-memory fake (`npm run test:releases`).
