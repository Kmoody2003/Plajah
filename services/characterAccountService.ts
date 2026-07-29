// characterAccountService — the foundation for character profile accounts: living digital avatars &
// chatbots, driven by their creators (Plajah AI or BYO-AI). See
// docs/PLAJAH_CHARACTER_AVATARS_BLUEPRINT.md. Phase 0: enable/disable + drive-permission + the
// guardrailed persona-prompt builder that later chat phases will use. Everything is creator-gated.

import type { Character, CharacterAccountConfig } from '../types';
import { updateCharacter, auth } from './backendService';

/** Violet base hue for character profiles — distinct from the human orange/magenta brand. */
export const CHARACTER_VIOLET_HUE = 275;
export const CHARACTER_GRADIENT = 'linear-gradient(135deg,#6B0099 0%,#7C3AED 50%,#A855F7 100%)';

/** Who is allowed to drive/turn on a character: its explicit driver, else its owner/creator. */
export function characterDriverUid(c: Character): string | undefined {
  return c.account?.driverUid || c.ownerUid;
}

/** Can `uid` (default: the signed-in user) drive this character? Only the creator/driver may. */
export function canDriveCharacter(c: Character, uid?: string): boolean {
  const me = uid ?? auth.currentUser?.uid;
  if (!me) return false;
  const driver = characterDriverUid(c);
  // If no owner/driver is recorded yet, only allow when we can't prove someone else owns it.
  return driver ? driver === me : false;
}

/** Is the character's public profile switched on? */
export function isCharacterAccountLive(c: Character): boolean {
  return !!c.account?.enabled;
}

/** Canonical profile URL for a character account. */
export function characterProfileUrl(c: Character, origin = ''): string {
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : 'https://plajah.com');
  return c.account?.handle ? `${base}/c/${encodeURIComponent(c.account.handle)}`
    : `${base}/character/${encodeURIComponent(c.worldId)}/${encodeURIComponent(c.id)}`;
}

/** Turn the character profile ON (creator only). Records the driver + a violet default theme. */
export async function enableCharacterAccount(c: Character, patch?: Partial<CharacterAccountConfig>): Promise<void> {
  if (!canDriveCharacter(c) && c.ownerUid && c.ownerUid !== auth.currentUser?.uid) {
    throw new Error('Only the character creator can enable this account.');
  }
  const account: CharacterAccountConfig = {
    ...(c.account || {}),
    enabled: true,
    driverUid: characterDriverUid(c) || auth.currentUser?.uid,
    themeHue: c.account?.themeHue ?? CHARACTER_VIOLET_HUE,
    enabledAt: c.account?.enabledAt || Date.now(),
    ...patch,
  };
  await updateCharacter(c.id, { worldId: c.worldId, account } as any);
}

/** Turn the character profile OFF (creator only). Keeps the config; just flips it dark. */
export async function disableCharacterAccount(c: Character): Promise<void> {
  if (!canDriveCharacter(c)) throw new Error('Only the character creator can turn this off.');
  await updateCharacter(c.id, { worldId: c.worldId, account: { ...(c.account || {}), enabled: false } } as any);
}

/** Patch the account config (creator only) — persona, greeting, provider, voice, aiEnabled, etc. */
export async function updateCharacterAccount(c: Character, patch: Partial<CharacterAccountConfig>): Promise<void> {
  if (!canDriveCharacter(c)) throw new Error('Only the character creator can change this.');
  await updateCharacter(c.id, { worldId: c.worldId, account: { ...(c.account || {}), ...patch } } as any);
}

/**
 * Build the guardrailed persona system prompt from the character's OWN canon. This is the spine the
 * chatbot phases (Plajah MAI or BYO-AI) run on: identity + lore + relationships, then hard rules the
 * creator's freeform persona can extend but never override. Kept deterministic + client-safe so it
 * can be previewed; the server rebuilds it authoritatively before any model call.
 */
export function buildCharacterSystemPrompt(c: Character, worldName?: string): string {
  const rel = (c.relationships || [])
    .map(r => `- ${r.characterId}${(r as any).type ? ` (${(r as any).type})` : ''}${(r as any).description ? `: ${(r as any).description}` : ''}`)
    .join('\n');
  const stats = c.physicalStats
    ? Object.entries(c.physicalStats).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(', ')
    : '';
  const lines = [
    `You are ${c.name}${c.role ? `, ${c.role}` : ''}, a fictional character${worldName ? ` from the world "${worldName}"` : ''}.`,
    c.bio ? `About you: ${c.bio}` : '',
    c.lore ? `Your lore: ${c.lore}` : '',
    stats ? `Physical details: ${stats}.` : '',
    c.tags?.length ? `Themes: ${c.tags.join(', ')}.` : '',
    rel ? `Your relationships:\n${rel}` : '',
    c.account?.persona ? `Creator's direction: ${c.account.persona}` : '',
    '',
    'Rules you must always follow:',
    '- Stay fully in character as this fictional persona.',
    '- You are an AI persona created for entertainment — if asked, say so honestly; never claim to be a real person or a specific real individual.',
    '- Never provide harmful, explicit-to-minors, hateful, or dangerous content; refuse and redirect in character.',
    '- Keep to what this character would plausibly know from their world; do not break the fourth wall unless the creator explicitly allows it.',
  ].filter(Boolean);
  return lines.join('\n');
}
