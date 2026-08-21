// Demo Sanctuary content — injected (never written to Firestore) so the always-on demo
// sanctuary (DEMO_SANCTUARY_ID) showcases the redesigned SanctuaryView at full strength
// instead of empty frames. Served purely in-memory by sanctuaryService's demo short-circuit.

import type { SanctuaryTier, SanctuaryExclusiveContent } from '../types';
import { DEMO_SANCTUARY_ID } from './demoShowcase';

const DAY = 86_400_000;
// Stable-ish timestamps relative to load (fine for a demo; no persistence).
const now = 1_756_000_000_000;

export const DEMO_SANCTUARY_TIERS: SanctuaryTier[] = [
  {
    id: 'demo-tier-supporter', creatorId: DEMO_SANCTUARY_ID,
    name: 'Supporter', description: 'Back the work and get the members-only feed + a badge.',
    price: 5, annualPrice: 50, color: '#D4A017', iconEmoji: '🌱',
    benefits: ['Members-only feed', 'Supporter badge', 'Community lounge access'],
    hasPrivateChat: false, hasMemberBadge: true, memberCount: 128, isActive: true, sortOrder: 0, createdAt: now,
  },
  {
    id: 'demo-tier-insider', creatorId: DEMO_SANCTUARY_ID,
    name: 'Insider', description: 'Everything in Supporter plus early releases and behind-the-scenes.',
    price: 12, annualPrice: 120, color: '#C0392B', iconEmoji: '💎',
    benefits: ['Early access to releases', 'Behind-the-scenes', 'Monthly livestream', 'Private chat'],
    hasPrivateChat: true, hasMemberBadge: true, memberCount: 57, isActive: true, sortOrder: 1, createdAt: now,
  },
  {
    id: 'demo-tier-innercircle', creatorId: DEMO_SANCTUARY_ID,
    name: 'Inner Circle', description: 'The full experience — direct access, credits, and quarterly gifts.',
    price: 30, annualPrice: 300, color: '#6B0099', iconEmoji: '👑',
    benefits: ['Everything in Insider', 'Name in the credits', 'Quarterly gift', 'Direct line to the creator'],
    hasPrivateChat: true, hasMemberBadge: true, memberCount: 14, isActive: true, sortOrder: 2, createdAt: now,
  },
];

const ALL_TIERS = DEMO_SANCTUARY_TIERS.map(t => t.id);
const INSIDER_UP = ['demo-tier-insider', 'demo-tier-innercircle'];

export const DEMO_SANCTUARY_CONTENT: SanctuaryExclusiveContent[] = [
  {
    id: 'demo-content-welcome', creatorId: DEMO_SANCTUARY_ID, sanctuaryId: DEMO_SANCTUARY_ID,
    title: 'Welcome to the Sanctuary', description: 'A hello from me and what to expect inside.',
    type: 'POST', accessType: 'FREE', requiredTierIds: [], isPublicPreview: true,
    publishedAt: now - DAY * 2, likesCount: 96, commentsCount: 12,
  },
  {
    id: 'demo-content-track', creatorId: DEMO_SANCTUARY_ID, sanctuaryId: DEMO_SANCTUARY_ID,
    title: 'Unreleased Track — "Nightfall (demo)"', description: 'An early mix, members hear it first.',
    type: 'AUDIO', accessType: 'TIER', requiredTierIds: ALL_TIERS, isPublicPreview: false,
    publishedAt: now - DAY, likesCount: 210, commentsCount: 34,
  },
  {
    id: 'demo-content-bts', creatorId: DEMO_SANCTUARY_ID, sanctuaryId: DEMO_SANCTUARY_ID,
    title: 'Studio Session — Behind the Scenes', description: 'How the last release came together.',
    type: 'BTS', accessType: 'TIER', requiredTierIds: INSIDER_UP, isPublicPreview: false,
    publishedAt: now - 3_600_000 * 6, likesCount: 77, commentsCount: 9,
  },
  {
    id: 'demo-content-live', creatorId: DEMO_SANCTUARY_ID, sanctuaryId: DEMO_SANCTUARY_ID,
    title: 'Quarterly Q&A — Livestream Replay', description: 'Inner Circle live hangout, replay inside.',
    type: 'LIVESTREAM', accessType: 'TIER', requiredTierIds: ['demo-tier-innercircle'], isPublicPreview: false,
    publishedAt: now - 3_600_000 * 30, likesCount: 41, commentsCount: 18,
  },
];
