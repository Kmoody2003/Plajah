// releaseNotes — DEPRECATED, no longer read by anything (as of 2026-08-26).
//
// The update-ready toast and the What's-New page now BOTH read from the single
// changelog ledger at `data/changelog.ts` — that is the one place to append a
// user-facing note when you ship something. This file diverged and went stale
// (it stopped at July while the ledger moved on), which is exactly the confusion
// a single source removes. Kept only so no stray import breaks; safe to delete.

export interface ReleaseNote {
  /** A short label for the release — a date or version. */
  version: string;
  /** 3–6 punchy, user-facing bullets. */
  highlights: string[];
}

export const RELEASES: ReleaseNote[] = [
  {
    version: 'July 2026 — The Living Combat Atlas',
    highlights: [
      'New in Academia: a museum of fifty martial arts from every continent — history, technique, ritual and the people who carried them.',
      'Read the real four-thousand-year-old wrestling wall from an Egyptian tomb, one register at a time.',
      'Watch technique as motion capture in the Motion Lab, not just still photographs.',
      'Every image credits its photographer and licence — and the martial arts we found were invented are documented as such.',
    ],
  },
  {
    version: 'July 2026',
    highlights: [
      'Calls: ring anyone in DMs — 1:1 or group — with fullscreen, in-call chat, and live camera/mic switching.',
      'Miss a call? Leave a voice message that drops right into the conversation.',
      'Uploads now run in the background — publish several at once and track them in the notification tray.',
      'Videos are verified and previewable before publishing, and can\'t post until categorized.',
      'Smoother multi-account hot-switch, plus a chat shortcut in the side rail.',
    ],
  },
];

export const LATEST_RELEASE = RELEASES[0];
