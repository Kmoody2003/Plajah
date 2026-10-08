/**
 * Block/mute-aware wrappers around user search. Same signatures as backendService's
 * `searchUsers` / `searchUserProfiles`, but results drop every uid in the viewer's hidden set
 * (blocked ∪ blockedBy ∪ muted — see socialSafetyCore). Signed-out viewers get unfiltered results.
 *
 * CALL SITES TO REWIRE (swap the import; nothing else changes). People-facing search/mention UIs:
 *   components/SearchView.tsx:92, components/SidebarSearch.tsx:167, hooks/useUniversalPlatformSearch.ts:39,
 *   components/ChatSystem.tsx:276,480,631 (DM people picker), components/chat/ChatSpaces.tsx:211,
 *   components/CommentSection.tsx:376, components/FeedView.tsx:2074, components/ProfileFeed.tsx:280,
 *   components/UniversalPostComposer.tsx:373, components/PostCard.tsx:188 (mention autocompletes),
 *   components/CloseFriendsView.tsx:61, components/PartnerPickerModal.tsx:25.
 * Leave admin/business pickers (AdminAdDashboard, PosRegister, OrgHub, Elevate rosters, StoreHub,
 * Early access, CreatorPaymentDashboard, FastChannelManager, ...) on the raw functions: staff tooling
 * must still find blocked accounts.
 */
import { auth } from './firebase';
import { searchUsers, searchUserProfiles } from './backendService';
import { fetchHiddenUids, filterHidden } from './socialSafetyService';
import type { UserProfile } from '../types';

async function hiddenForViewer(): Promise<Set<string>> {
  const uid = auth.currentUser?.uid;
  return uid ? fetchHiddenUids(uid).catch(() => new Set<string>()) : new Set<string>();
}

const dropHidden = (users: UserProfile[], hidden: Set<string>) =>
  hidden.size ? filterHidden(users, u => (u as any).uid ?? (u as any).id, hidden) : users;

export async function searchUsersSafe(searchTerm: string): Promise<UserProfile[]> {
  const [users, hidden] = await Promise.all([searchUsers(searchTerm), hiddenForViewer()]);
  return dropHidden(users, hidden);
}

export async function searchUserProfilesSafe(
  searchTerm: string, max: number = 10, opts: { excludeRestricted?: boolean } = {},
): Promise<UserProfile[]> {
  const [users, hidden] = await Promise.all([searchUserProfiles(searchTerm, max, opts), hiddenForViewer()]);
  return dropHidden(users, hidden);
}
