/**
 * Welcome Package ("Boarding Plajah") content — the data behind the WELCOME_PACKAGE view.
 *
 * Ported verbatim from the approved "Boarding Plajah" boarding-pass artifact
 * (design: a night-departures board; letter signed "Love, Plajah"). Kept as a data
 * file — mirroring data/changelog.ts — so the copy is editable without touching the
 * presentational component, and so a future A/B or seasonal variant is a data swap.
 *
 * `nav` on a stop/gate is an AppView id (types.ts) the tile routes to when tapped;
 * omit it for a display-only line (e.g. Aria, which is an always-on assistant, not a view).
 */

export type WpStatusKind = 'now' | 'soon';

export interface WpStop {
  code: string;          // the 3-letter "flight code" on the ticket
  name: string;
  desc: string;
  status: string;        // e.g. "Boarding", "Always on", "Live"
  statusKind: WpStatusKind;
  color: string;         // dot / code-chip colour (hex, from the boarding-pass palette)
  nav?: string;          // AppView id to open, or undefined for display-only
}

export interface WpPromise { big: string; t: string; }

export interface WpRole { key: string; label: string; title: string; body: string; }

export interface WpGate { gno: string; title: string; desc: string; color: string; nav: string; }

// Boarding-pass palette (self-contained so the data reads without the component's tokens).
const C = {
  purple: '#8a1fc0', magenta: '#ff2d7e', orange: '#ff9b1f', cyan: '#22e0f5', lilac: '#d0bcff',
};

/** Your itinerary — the ten places this ticket already takes you (the brand explainer). */
export const WP_ITINERARY: WpStop[] = [
  { code: 'CHO', name: 'Chora', desc: 'Music — make it, master it, release it.', status: 'Boarding', statusKind: 'now', color: C.purple, nav: 'MUSIC' },
  { code: 'REL', name: 'Reello', desc: 'Video — your channel, no gatekeeper.', status: 'Boarding', statusKind: 'now', color: C.magenta, nav: 'VIDEOS' },
  { code: 'TAL', name: 'Taleo', desc: 'Film & TV — own it forever, DRM-free.', status: 'Boarding', statusKind: 'now', color: C.orange, nav: 'MOVIES_TV' },
  { code: 'LOR', name: 'Lorea', desc: 'Books & comics — write, draw, be read.', status: 'Boarding', statusKind: 'now', color: C.cyan, nav: 'BOOKS' },
  { code: 'LAB', name: 'Plajah Labs', desc: 'Science you can play with.', status: 'Boarding', statusKind: 'now', color: C.lilac, nav: 'PLAJAH_LABS' },
  { code: 'ACA', name: 'Academia', desc: 'Classrooms for teachers, students, families.', status: 'Boarding', statusKind: 'now', color: C.purple, nav: 'CLASSROOMS' },
  { code: 'BIZ', name: 'Business', desc: 'Shop, team, payments — your money, direct to you.', status: 'Boarding', statusKind: 'now', color: C.magenta, nav: 'PLAJAH_BUSINESS' },
  { code: 'SAN', name: 'Sanctuary', desc: 'Your inner circle — keep it free, or charge for access.', status: 'Boarding', statusKind: 'now', color: C.orange, nav: 'SANCTUARY' },
  { code: 'LIV', name: 'Live & Rooms', desc: 'Go live in a click. Watch-alongs, talk rooms.', status: 'Boarding', statusKind: 'now', color: C.cyan, nav: 'LIVE_HUB' },
  { code: 'ARI', name: 'Aria', desc: 'One AI companion across all of it.', status: 'Always on', statusKind: 'soon', color: C.lilac },
];

/** Fine print, but the good kind. */
export const WP_PROMISES: WpPromise[] = [
  { big: '0%', t: 'Keep 100% of your sales with Plajah+ — no commerce fee.' },
  { big: 'Direct', t: 'Every sale settles to your own account — we never hold your money.' },
  { big: 'Yours', t: 'Your work & audience — portable, DRM-free.' },
  { big: 'Free', t: 'Start free, and give freely — 0% on donations.' },
];

/** Baggage claim — how you get paid (five ways, all payment-accurate). */
export const WP_PAYWAYS: WpStop[] = [
  { code: '01', name: 'Sell your work', desc: 'Tracks, films, books, tickets — keep 100% with Plajah+, or a flat 5% without. Nothing hidden.', status: 'Live', statusKind: 'now', color: C.cyan },
  { code: '02', name: 'Your fans fund you', desc: 'Anyone who joins Plajah+ on your page points the majority of their membership straight to you. Recruit a fan, earn recurring.', status: 'Live', statusKind: 'now', color: C.magenta },
  { code: '03', name: 'Get backed', desc: 'Tips and Sanctuary pledges flow the same way — to you, immediately, not through us.', status: 'Live', statusKind: 'now', color: C.orange },
  { code: '04', name: 'Charge for your Sanctuary', desc: 'Want a paid inner circle? Set an access fee if you like — you keep it all with Plajah+ (5% without).', status: 'Live', statusKind: 'now', color: C.lilac },
  { code: '05', name: 'Run a shop', desc: 'Orders land in your own connected account — 0% rake on your store with Business Pro.', status: 'Live', statusKind: 'now', color: C.purple },
];

/** Choose your cabin — role-tailored copy. */
export const WP_ROLES: WpRole[] = [
  { key: 'creator', label: 'Creator', title: 'Creator cabin', body: "Keep 100% of your sales with Plajah+ — 0% commerce fee — and get paid the moment a buyer pays, straight to your own account. Open a Sanctuary for your inner circle: keep it free, or charge an access fee if you choose — you keep all of that too with Plajah+. Best part: every fan who joins Plajah+ on your page sends the majority of their membership straight to you. Recruit a fan, earn recurring. Make it in Chora, Melos, or Pixels; release through Reello, Taleo, and Lorea; post like it's social, because it is." },
  { key: 'member', label: 'Member', title: 'Member cabin', body: 'Your Plajah+ works differently here: most of your membership goes to the creators you choose — not to us. Bind it all to one, or split it across the people you back. Support a creator just by joining Plajah+ on their page, and unlock their Sanctuary, their behind-the-scenes, and the whole platform while you\'re at it.' },
  { key: 'business', label: 'Business', title: 'Business cabin', body: 'Open a shop, build a team, take payments that settle straight into your own account — Plajah never holds your money, and Business Pro takes 0% rake on your own store. Storefront, POS, orders, and a marketing kit that treats your community like people, not a funnel — plus reach the whole Plajah audience, not just a checkout page.' },
  { key: 'teacher', label: 'Teacher', title: 'Teacher cabin', body: 'Free — always. A classroom that respects your time: assignments, a wall you control, open-education templates with licensing already sorted, and an integrity layer that has your back. Bring one class; add the rest once it\'s earned your trust.' },
  { key: 'student', label: 'Student', title: 'Student cabin', body: 'Free, forever. Learn by making, not memorising. Your work becomes a record you own — a portable transcript that follows you, not the school. Roam the studios and labs at your own pace; curiosity counts as much as grades here.' },
  { key: 'parent', label: 'Parent', title: 'Family cabin', body: 'Free for your whole family. See what your kid is building, safely: kids-mode, real transparency, and a family layer that keeps you in the loop without hovering. Know what they\'re learning and making — and grow into it alongside them.' },
];

/** Final call — which gate? (The direction pick.) */
export const WP_GATES: WpGate[] = [
  { gno: 'Gate A · Studios', title: 'Make something', desc: 'Music, video, film, writing, art.', color: C.purple, nav: 'CREATOR_HUB' },
  { gno: 'Gate B · Commerce', title: 'Start a business', desc: 'Shop, team, payments — your money, direct.', color: C.magenta, nav: 'PLAJAH_BUSINESS' },
  { gno: 'Gate C · Academia', title: 'Learn & teach', desc: 'Classrooms, labs, courses.', color: C.cyan, nav: 'CLASSROOMS' },
  { gno: 'Gate D · Open sky', title: 'Just explore', desc: 'No plan. Follow your curiosity.', color: C.orange, nav: 'DASHBOARD' },
];
