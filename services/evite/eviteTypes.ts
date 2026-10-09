// eviteTypes — the shared shapes for Plajah Evites (templates, invites, RSVPs).
//
// An evite is a Tela document (vector objects + motion) with a small amount of event data bound into it.
// The template catalogue lives in services/tela/eviteTemplateCollection.ts; this file is types only so the
// server, the studio and the guest page can all import it without pulling in the art.

export type EviteCategory = 'kids_boy' | 'kids_girl' | 'adult' | 'anniversary' | 'general' | 'wedding';

export const EVITE_CATEGORIES: Array<{ id: EviteCategory; label: string; blurb: string; count: number }> = [
  { id: 'kids_boy', label: 'Kids · Boys', blurb: 'Playful birthdays with a game inside', count: 12 },
  { id: 'kids_girl', label: 'Kids · Girls', blurb: 'Playful birthdays with a game inside', count: 12 },
  { id: 'adult', label: 'Adult parties', blurb: 'Birthdays, milestones, nights out', count: 24 },
  { id: 'anniversary', label: 'Anniversary', blurb: 'Years together, beautifully marked', count: 12 },
  { id: 'general', label: 'Gatherings', blurb: 'Everything else worth getting together for', count: 12 },
  { id: 'wedding', label: 'Weddings', blurb: 'High-end suites in motion', count: 36 },
];

export type EviteMotif = string;
export type EviteLayout = 'hero-top' | 'hero-bottom' | 'framed' | 'arch' | 'poster' | 'card';
/** How the card enters. Every entrance ends on the complete, readable card. */
export type EviteEntrance = 'rise' | 'pop' | 'unfold' | 'curtain' | 'iris' | 'drift';
/** What the guest does before / while reading it. */
export type EviteGameId = 'pop' | 'catch' | 'memory' | 'hunt' | 'candles';
export type EviteInteraction =
  | { kind: 'none' }
  | { kind: 'scratch'; prompt: string }
  | { kind: 'game'; game: EviteGameId; prompt: string; goal: number };

export interface EvitePalette { bg: string; bg2: string; ink: string; accent: string; accent2: string; glow: string }

export interface EviteTemplateMeta {
  id: string;
  category: EviteCategory;
  name: string;
  tagline: string;
  /** Default headline, e.g. "Leo is turning 6". `{name}` is replaced by the honoree. */
  headline: string;
  motif: EviteMotif;
  layout: EviteLayout;
  entrance: EviteEntrance;
  palette: EvitePalette;
  interaction: EviteInteraction;
  tags: string[];
  /** Art Council note — lead lens, counterpoint, and what the editor kept. */
  council: { lead: string; counterpoint: string; editor: string };
}

export interface EviteQuestion {
  id: string;
  label: string;
  kind: 'text' | 'choice' | 'yesno';
  options?: string[];
  required?: boolean;
}

export interface EviteBringItem { id: string; label: string; claimedBy?: string; claimedName?: string }

export interface EviteFields {
  headline: string;
  subline: string;
  honoree: string;
  hostName: string;
  startsAt: number;           // epoch ms
  endsAt?: number;
  timezone: string;
  venueName: string;
  address: string;
  message: string;
}

export type EviteHostKind = 'user' | 'org' | 'business' | 'school' | 'teacher';
export interface EviteHost { kind: EviteHostKind; id?: string; label?: string }

export interface EviteSettings {
  /** Hide the street address until a guest answers yes (privacy for home parties). */
  revealAddressAfterYes: boolean;
  /** Show guests who else is coming (names only; host can turn off). */
  showGuestList: boolean;
  /** Public wall where guests can leave a note. Host can remove any note. */
  guestWall: boolean;
  allowPlusOnes: boolean;
  maxPartyPerRsvp: number;
  capacity?: number;
  waitlist: boolean;
  rsvpDeadline?: number;
  kidsField: boolean;
  /** For kids' invites: show a "grown-up RSVP" step after the fun part. */
  parentStep: boolean;
  /** Skip the game/scratch step (always available as a button; this makes it the default). */
  skipPlay: boolean;
  reminders: boolean;
}

/**
 * Gifts and donations. Anyone with the link can give, including people who said "can't make it".
 * Stripe goes through Plajah checkout to the host's connected account. Cash App and Zelle are the host's own
 * handles shown as copy/open links; Plajah never touches that money and says so on the page.
 */
export interface EviteGifts {
  enabled: boolean;
  /** Headline over the gift box, e.g. "Leo's birthday fund". */
  title?: string;
  stripe: boolean;
  presetsCents: number[];
  goalCents?: number;
  /** Cash App cashtag including the leading $, e.g. "$leomoody". */
  cashApp?: string;
  /** Zelle has no public link format: this is the email or US phone the host registered with Zelle. */
  zelle?: string;
  venmo?: string;
  paypalMe?: string;
  /** Offer gifting right after a "can't make it" answer. */
  offerOnDecline: boolean;
}

export const DEFAULT_GIFTS: EviteGifts = { enabled: false, stripe: true, presetsCents: [1000, 2500, 5000], offerOnDecline: true };

export const DEFAULT_SETTINGS: EviteSettings = {
  revealAddressAfterYes: false, showGuestList: true, guestWall: true, allowPlusOnes: true, maxPartyPerRsvp: 6,
  waitlist: true, kidsField: false, parentStep: false, skipPlay: false, reminders: true,
};

export interface EviteDoc {
  id: string;
  ownerUid: string;
  coHostUids: string[];
  templateId: string;
  fields: EviteFields;
  /** Theme overrides the host chose (palette tweak, motion off, etc). */
  look: { accent?: string; motion: boolean; sound: boolean; interaction?: 'template' | 'none' | 'scratch' | 'game'; /** Design eras: draw the era's structural law over the art */ showLaw?: boolean };
  settings: EviteSettings;
  questions: EviteQuestion[];
  bringList: EviteBringItem[];
  /** Cover photo (optional) shown inside the card frame. */
  photoUrl?: string;
  /** The invite's own link preview (1200×630, card + live text), rendered by the host's browser; ogSig = what it shows. */
  ogImage?: string;
  ogSig?: string;
  registryUrl?: string;
  /** Link to a Plajah ticketed event — the invite then offers tickets alongside the RSVP. */
  eventId?: string;
  photoPoolId?: string;
  /** Private club + chat created with the invite; guests join from their RSVP. */
  clubId?: string;
  /** club invite token so guests who answered yes/maybe can join the private event room */
  clubInvite?: string;
  chatChannelId?: string;
  /** who is hosting: the signed-in person, or an org/business/school/teacher they manage */
  host?: EviteHost;
  /** host's playbook progress (step ids); never shown to guests */
  planDone?: string[];
  gifts: EviteGifts;
  status: 'draft' | 'live' | 'closed' | 'cancelled';
  createdAt: number;
  updatedAt: number;
  sentCount: number;
  viewCount: number;
}

export type RsvpStatus = 'yes' | 'maybe' | 'no' | 'waitlist';

export interface EviteRsvp {
  id: string;
  inviteId: string;
  name: string;
  status: RsvpStatus;
  adults: number;
  kids: number;
  contact?: string;      // email or phone — optional, only for reminders
  note?: string;
  answers?: Record<string, string>;
  bringing?: string[];
  createdAt: number;
  updatedAt: number;
  /** Which template the guest saw the invite through the share of (for host insights). */
  via?: string;
}

export interface EviteWallNote { id: string; inviteId: string; name: string; text: string; createdAt: number }

/** What a guest is allowed to see about an invite. */
export interface EvitePublicView {
  id: string;
  templateId: string;
  fields: Omit<EviteFields, 'address'> & { address?: string; addressHidden?: boolean };
  look: EviteDoc['look'];
  settings: Pick<EviteSettings, 'allowPlusOnes' | 'maxPartyPerRsvp' | 'kidsField' | 'parentStep' | 'skipPlay' | 'showGuestList' | 'guestWall' | 'waitlist'> & { rsvpDeadline?: number; revealAddressAfterYes: boolean };
  questions: EviteQuestion[];
  bringList: EviteBringItem[];
  photoUrl?: string;
  registryUrl?: string;
  eventId?: string;
  photoPoolId?: string;
  clubId?: string;
  clubInvite?: string;
  gifts?: Pick<EviteGifts, 'enabled' | 'title' | 'stripe' | 'presetsCents' | 'goalCents' | 'cashApp' | 'zelle' | 'venmo' | 'paypalMe' | 'offerOnDecline'> & { raisedCents?: number; stripeReady: boolean };
  status: EviteDoc['status'];
  hostName: string;
  counts: { yes: number; maybe: number; no: number; waitlist: number; headcount: number; spotsLeft: number | null };
  guests?: Array<{ name: string; status: RsvpStatus }>;
  wall?: EviteWallNote[];
  closed: boolean;
  /** art for creator themes (design ids outside the catalogue) */
  art?: { plate: string; depth?: string; thumb?: string; preset: string; foil?: string; voice?: string; light?: boolean } | null;
}
