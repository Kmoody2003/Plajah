// eviteHostClient — host-side calls (signed in): save/publish, my invites, replies, moderation, and the
// automatic extras every Plajah event gets: a private event room (club + chat) and a photo pool.
import { authedFetch } from '../registerService';
import { createClub, generateClubInviteToken } from '../backendService';
import type { EviteDoc, EviteRsvp, EviteWallNote } from './eviteTypes';

export interface MineItem { invite: EviteDoc; counts: { yes: number; maybe: number; no: number; waitlist: number; headcount: number; spotsLeft: number | null } }
export interface GuestsResult { rsvps: EviteRsvp[]; wall: EviteWallNote[]; counts: MineItem['counts']; raisedCents: number; csv?: string }

export const saveInvite = async (body: Partial<EviteDoc> & Record<string, any>): Promise<EviteDoc> => (await authedFetch('/api/evite/save', body)).invite;
export const myInvites = async (): Promise<MineItem[]> => (await authedFetch('/api/evite/mine', {})).items || [];
export const inviteGuests = (id: string, csv = false): Promise<GuestsResult> => authedFetch('/api/evite/guests', { id, csv });
export const removeRsvp = (id: string, rsvpId: string) => authedFetch('/api/evite/remove-rsvp', { id, rsvpId });
export const removeNote = (id: string, noteId: string) => authedFetch('/api/evite/remove-note', { id, noteId });

/**
 * Every Plajah event gets a private room (club + chat) and a photo pool. Idempotent: only creates what is missing,
 * then saves the ids onto the invite. Failures are reported but never block publishing.
 */
export async function provisionExtras(inv: EviteDoc, opts: { room: boolean; pool: boolean }): Promise<{ invite: EviteDoc; problems: string[] }> {
  const problems: string[] = []; const patch: Record<string, any> = {};
  if (opts.room && !inv.clubId) {
    try {
      const club = await createClub({ name: inv.fields.headline || 'Event room', description: `The private room for ${inv.fields.headline}. Plans, photos and chat for guests.`, isPrivate: true, joinProcess: 'AUTO', category: 'Events', tags: ['event', 'evite'], hasLiveChat: true, hasExclusiveEvents: false } as any);
      if (club) { patch.clubId = club.id; patch.clubInvite = await generateClubInviteToken(club.id); }
      else problems.push('The event room could not be created.');
    } catch { problems.push('The event room could not be created.'); }
  }
  if (opts.pool && !inv.photoPoolId) {
    try {
      // Server-side create-or-return (photo pool v2); it also writes photoPoolId onto the invite.
      const { poolApi } = await import('../eventPool/poolClient');
      const r = await poolApi.ensure({ eviteId: inv.id });
      if (r?.poolId) patch.photoPoolId = r.poolId; else problems.push('The photo pool could not be created.');
    } catch { problems.push('The photo pool could not be created.'); }
  }
  if (!Object.keys(patch).length) return { invite: inv, problems };
  return { invite: await saveInvite({ id: inv.id, ...patch }), problems };
}

export function downloadCsv(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Render the invite's own link preview (card + live text, 1200×630) in this browser, upload it to the host's Storage
 * folder (users/{uid}/evites/{id}/og.jpg — public read, owner write) and save its URL on the invite. Skipped when the
 * preview already shows the current wording/design (ogSig). Best effort: a failure leaves the design's static preview.
 */
export async function publishOgImage(inv: EviteDoc, art?: { plate: string; preset: string; voice?: string; light?: boolean } | null, accent = '#FF8C00'): Promise<Pick<EviteDoc, 'ogImage' | 'ogSig'> | null> {
  const og = await import('./eviteOg');
  const input = { plateId: inv.templateId, fields: inv.fields, accent: inv.look?.accent || accent, art, showLaw: inv.look?.showLaw };
  const sig = og.ogSignature(input);
  if (inv.ogSig === sig && inv.ogImage) return null;
  const blob = await og.renderInviteOg(input);
  const [{ storage, auth }, st] = await Promise.all([import('../firebase'), import('firebase/storage')]);
  const uid = auth.currentUser?.uid; if (!uid || uid !== inv.ownerUid) return null;
  const ref = st.ref(storage, `users/${uid}/evites/${inv.id}/og.jpg`);
  await st.uploadBytes(ref, blob, { contentType: 'image/jpeg', cacheControl: 'public, max-age=300' });
  const url = await st.getDownloadURL(ref);
  const saved = await saveInvite({ id: inv.id, ogImage: url, ogSig: sig });
  return { ogImage: saved.ogImage, ogSig: saved.ogSig };
}
