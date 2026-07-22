// releaseNotes — the "What's new" changelog shown in the update-ready toast.
//
// Keep the LATEST release at the top of `RELEASES`. When you ship something the
// user should notice, add a short, human bullet here (verbs, no jargon). The
// update toast shows the newest entry's highlights in an expandable section.

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
