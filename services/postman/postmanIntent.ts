/**
 * Where The Post Man should open. A notification, a chat line or a calendar
 * item can ask for a room (and a correspondence) before the app is mounted, so
 * the request is parked here and the shell picks it up on mount — and also
 * delivered live via `postman:intent` if the shell is already open.
 */

import type { PostmanRoom } from '../../types';

export interface PostmanIntent {
  room?: PostmanRoom;
  /** A correspondence (chat room id) to open in Letters. */
  roomId?: string;
  /** Open the letter writer, optionally to a person. */
  compose?: boolean;
  toUid?: string;
  toName?: string;
}

let pending: PostmanIntent | null = null;

export function openPostman(intent: PostmanIntent = {}): void {
  pending = intent;
  window.dispatchEvent(new CustomEvent('OPEN_POSTMAN', { detail: intent }));
  window.dispatchEvent(new CustomEvent('postman:intent', { detail: intent }));
}

export function consumePostmanIntent(): PostmanIntent | null {
  const p = pending;
  pending = null;
  return p;
}
