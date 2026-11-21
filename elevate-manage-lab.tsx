// Elevate Manage lab: the real ElevateOps (Manage) shell with a sample church, signed-in as a fake owner.
//   npx vite --config elevate-manage-lab.vite.config.mjs -> http://127.0.0.1:3311/elevate-manage-lab.html?s=people
// No sign-in: backend reads are denied and come back empty, which is fine for checking layout and navigation.
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { auth } from './services/firebase';
import ElevateOps, { type SectionKey } from './components/elevate/ElevateOps';
import type { Organization } from './types';

const base: Record<string, unknown> = { uid: 'lab-owner', displayName: 'Lab Owner', email: 'owner@example.test', emailVerified: true, providerData: [] };
// Any other User method (getIdToken, getIdTokenResult, _stopProactiveRefresh…) is a harmless async no-op.
const fakeUser = new Proxy(base, {
  get: (t, k: string) => k in t ? t[k] : k === 'then' ? undefined
    : k === 'getIdTokenResult' ? async () => ({ claims: {}, token: '' })
    : () => Promise.resolve(''),
});
Object.defineProperty(auth, 'currentUser', { get: () => fakeUser, set: () => {}, configurable: true });

const org = {
  id: 'lab-church', name: 'Greater Grace Fellowship', handle: 'greatergrace', orgType: 'CHURCH', creatorId: 'lab-owner',
  admins: ['lab-owner'], itAdminUids: ['lab-owner'], followerCount: 412,
  ministries: [
    { id: 'm-music', name: 'Music Ministry', iconEmoji: '🎵', headUids: [] },
    { id: 'm-youth', name: 'Youth', iconEmoji: '🔥', headUids: [] },
    { id: 'm-ced', name: 'Christian Education', iconEmoji: '📖', headUids: [] },
  ],
} as unknown as Organization;

const s = (new URLSearchParams(location.search).get('s') || 'overview') as SectionKey;
createRoot(document.getElementById('root')!).render(<ElevateOps org={org} isOwner onClose={() => {}} initialSection={s} />);
