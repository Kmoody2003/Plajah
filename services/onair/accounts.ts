// Virtual persona accounts: the platform profile each host and artist has, so people can follow them,
// comment, and see their posts and releases.
//
// A persona account is an ordinary UserProfile doc (users/{uid}) with a `virtualPersona` block, a
// fixed uid (persona_<id>) and NO sign-in of its own — nobody logs in as a persona. Posts and replies
// are written server-side by the persona runtime under a platform admin's authority, and every one
// passes policy.checkLine first. The disclosure is part of the profile and is always shown.
//
// Owner decision pending (see docs/ONAIR_STAFF.md): which account type hosts use. Artists are ARTIST.

import type { PersonaSheet } from './types';

export const PERSONA_UID_PREFIX = 'persona_';

export const personaUid = (id: string) => `${PERSONA_UID_PREFIX}${id}`;
export const isPersonaUid = (uid: string | undefined | null) => !!uid && uid.startsWith(PERSONA_UID_PREFIX);

export interface VirtualPersonaBlock {
  id: string;
  kind: PersonaSheet['kind'];
  operator: 'plajah';
  disclosure: string;
  /** Schema version of the sheet the account was built from. */
  sheet: string;
}

/** What a persona may do on the platform on its own, and what always needs a person. */
export const PERSONA_CAN = ['post', 'reply-to-comment', 'like', 'publish-track-after-approval', 'go-live-on-stage', 'host-listening-party'] as const;
export const PERSONA_NEVER = [
  'send-direct-messages-first',  // may only answer DMs on a public-style reply rail, never start one
  'message-a-minor',
  'ask-for-or-take-money',       // sales use the normal store/checkout; the persona never asks
  'follow-back-automatically',
  'change-settings',
  'delete-user-content',
] as const;
export type PersonaAction = typeof PERSONA_CAN[number] | typeof PERSONA_NEVER[number];

export function personaMay(action: PersonaAction): boolean {
  return (PERSONA_CAN as readonly string[]).includes(action);
}

/** The users/{uid} doc for a persona. Counts start at zero — they are never seeded with fake numbers. */
export function personaAccountDoc(p: PersonaSheet, now = Date.now()) {
  return {
    uid: personaUid(p.id),
    displayName: p.account.displayName,
    photoURL: p.look.portrait,
    email: '',
    bio: `${p.account.bio}\n\n${p.account.disclosure}`,
    accountType: p.kind === 'artist' ? 'ARTIST' as const : 'BRAND' as const,
    isArtist: p.kind === 'artist',
    followerCount: 0,
    followingCount: 0,
    joinedAt: now,
    hideFromSuggestions: false,
    sayHiOptOut: true,
    virtualPersona: {
      id: p.id,
      kind: p.kind,
      operator: 'plajah',
      disclosure: p.account.disclosure,
      sheet: p.schema,
    } satisfies VirtualPersonaBlock,
    personaHandle: p.account.handle,
    personaPalette: p.look.palette,
  };
}

/** The short badge shown beside a persona's name everywhere (posts, comments, chat, on-air card). */
export function personaBadge(p: Pick<PersonaSheet, 'kind'>): string {
  return p.kind === 'host' ? 'Virtual host' : 'Virtual artist';
}
