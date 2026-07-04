// ─── Always-on demo showcases ───────────────────────────────────────────────────
// Static, read-only demos that render for EVERYONE (including guests) with no
// Firestore seeding. They exist so people can explore a fully-built church,
// sanctuary and merch store as a tutorial, then create their own. Every demo is
// marked isDemo / carries a fixed sentinel id so the views can special-case it.

import type {
  Organization, Sanctuary, SanctuaryTier, SanctuaryPost, MerchItem,
} from '../types';

const now = 1_720_000_000_000; // fixed timestamp (no Date.now — keeps this a pure constant)

// ── Demo Church (Plajah Elevate → OrgHub) ───────────────────────────────────────
export const DEMO_CHURCH_ID = 'demo-grace-chapel';

export const DEMO_CHURCH: Organization = {
  id: DEMO_CHURCH_ID,
  orgType: 'CHURCH',
  name: 'Grace Chapel',
  handle: 'gracechapel',
  tagline: 'A place to belong, believe, and become.',
  about:
    'Grace Chapel is a live demo of a Plajah ministry space — showing how a church can run sub-ministries, staff, service times, streaming, online giving and a sacred library, all under one roof. Everything here is sample content so you can see what your own church could look like.',
  logoUrl: 'https://images.unsplash.com/photo-1438032005730-c779502df39b?w=200&h=200&fit=crop',
  coverUrl: 'https://images.unsplash.com/photo-1519491050282-cf00c82424b4?w=1200&h=400&fit=crop',
  accentColor: '#8B5CF6',
  creatorId: 'demo',
  admins: ['demo'],
  category: 'Non-denominational',
  denomination: 'Non-denominational',
  statementOfFaith: 'We believe in the good news of Jesus Christ and the call to love God and neighbor.',
  isDemo: true,
  isPublic: true,
  isVerified: true,
  followerCount: 1280,
  memberCount: 340,
  ministries: [
    { id: 'min-youth',   name: 'Youth Ministry',         description: 'Middle & high school students.', meetingTime: 'Wednesdays 7:00 PM', iconEmoji: '🔥' },
    { id: 'min-worship', name: 'Worship',                description: 'Music & production team.',        meetingTime: 'Thursdays 6:30 PM', iconEmoji: '🎵' },
    { id: 'min-women',   name: "Women's Fellowship",     description: 'Study, prayer & community.',      meetingTime: 'Tuesdays 10:00 AM', iconEmoji: '💐' },
    { id: 'min-kids',    name: 'Kids / Sunday School',   description: 'Nursery through 5th grade.',       meetingTime: 'Sundays 10:00 AM',  iconEmoji: '🧒' },
    { id: 'min-prayer',  name: 'Prayer',                 description: 'Intercessory prayer team.',        meetingTime: 'Daily 6:00 AM',      iconEmoji: '🙏' },
    { id: 'min-missions',name: 'Outreach & Missions',    description: 'Local & global service.',          meetingTime: 'Monthly',            iconEmoji: '🌍' },
  ],
  serviceTimes: [
    { id: 'svc-1', label: 'Sunday Worship',  day: 'Sunday',    time: '10:00 AM', isOnline: true },
    { id: 'svc-2', label: 'Sunday Evening',  day: 'Sunday',    time: '6:00 PM' },
    { id: 'svc-3', label: 'Midweek Service', day: 'Wednesday', time: '7:00 PM', isOnline: true },
  ],
  givingFunds: [
    { id: 'fund-general',  name: 'General',  description: 'Supports the everyday ministry of the church.', goal: 100000, raised: 62500 },
    { id: 'fund-missions', name: 'Missions', description: 'Local & global outreach.',                       goal: 40000,  raised: 18200 },
    { id: 'fund-building', name: 'Building',  description: 'Facilities & expansion.',                        goal: 250000, raised: 91000 },
  ],
  campuses: [
    { id: 'cmp-1', name: 'Downtown Campus', location: 'Main St',   isPrimary: true },
    { id: 'cmp-2', name: 'North Campus',    location: 'Northside' },
    { id: 'cmp-3', name: 'Online Campus',   location: 'Everywhere' },
  ],
  location: { city: 'Anytown, USA' },
  socialLinks: { website: '' },
  createdAt: now,
  updatedAt: now,
};

// ── Demo Sanctuary (self-contained demo view) ───────────────────────────────────
export const DEMO_SANCTUARY_ID = 'demo-sanctuary';

export const DEMO_SANCTUARY: Sanctuary = {
  id: DEMO_SANCTUARY_ID,
  ownerId: DEMO_SANCTUARY_ID,
  ownerType: 'USER',
  ownerName: 'Nova Vaughn',
  ownerPhoto: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop',
  name: "Nova's Sanctuary",
  handle: 'nova',
  tagline: 'Backstage access, unreleased demos, and the stories behind the songs — a demo of what your Sanctuary could be.',
  about: 'A sample creator membership showing tiers, gated posts, à-la-carte unlocks, a live campaign and a members lounge.',
  bannerUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1200&h=400&fit=crop',
  avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop',
  accentColor: '#C9A55C',
  visibility: 'PUBLIC',
  accessModel: 'MIXED',
  welcomeMessage: 'Welcome backstage.',
  campaign: {
    isActive: true,
    title: 'Fund the debut album',
    story: 'Help press the vinyl, book the studio, and shoot the first music video. Every backer gets their name in the liner notes.',
    goalAmount: 20000,
    raisedAmount: 13400,
    backerCount: 412,
    allOrNothing: false,
  },
  memberCount: 1867,
  contentCount: 24,
  isEnabled: true,
  createdAt: now,
  updatedAt: now,
};

export const DEMO_SANCTUARY_TIERS: SanctuaryTier[] = [
  {
    id: 'tier-fan', creatorId: DEMO_SANCTUARY_ID, name: 'Inner Circle', description: 'The essentials — early tracks + the members feed.',
    price: 5, color: '#83B2A4', iconEmoji: '🎧', benefits: ['Members-only feed', 'Early demos', 'Community lounge'],
    hasPrivateChat: true, hasMemberBadge: true, memberCount: 1240, isActive: true, sortOrder: 0, createdAt: now,
  },
  {
    id: 'tier-studio', creatorId: DEMO_SANCTUARY_ID, name: 'Studio Pass', description: 'Everything in Inner Circle plus BTS + monthly livestreams.',
    price: 15, annualPrice: 150, color: '#C9A55C', iconEmoji: '🎬', benefits: ['Everything in Inner Circle', 'Behind-the-scenes video', 'Monthly livestream', 'Name in liner notes'],
    hasPrivateChat: true, hasMemberBadge: true, memberCount: 520, isActive: true, sortOrder: 1, createdAt: now,
  },
  {
    id: 'tier-exec', creatorId: DEMO_SANCTUARY_ID, name: 'Executive Producer', description: 'Shape the music. Vote on releases, join private calls, get signed vinyl.',
    price: 50, annualPrice: 500, color: '#6E2634', iconEmoji: '👑', benefits: ['Everything in Studio Pass', 'Vote on the setlist', 'Quarterly group call', 'Signed vinyl each release'],
    hasPrivateChat: true, hasMemberBadge: true, memberCount: 107, isActive: true, sortOrder: 2, createdAt: now,
  },
];

export const DEMO_SANCTUARY_POSTS: SanctuaryPost[] = [
  {
    id: 'post-1', sanctuaryId: DEMO_SANCTUARY_ID, authorId: DEMO_SANCTUARY_ID, authorName: 'Nova Vaughn',
    authorPhoto: DEMO_SANCTUARY.avatarUrl, content: 'Thank you for being here 🖤 New demo dropping Friday for Studio Pass members — here\'s a 30-sec teaser for everyone.',
    accessType: 'FREE', isPinned: true, likes: ['a','b','c'], commentCount: 48, timestamp: now,
  },
  {
    id: 'post-2', sanctuaryId: DEMO_SANCTUARY_ID, authorId: DEMO_SANCTUARY_ID, authorName: 'Nova Vaughn',
    authorPhoto: DEMO_SANCTUARY.avatarUrl, content: 'Full unreleased demo — "Golden Hour (rough mix)". Members only.',
    accessType: 'TIER', requiredTierIds: [], likes: ['a','b'], commentCount: 22, timestamp: now - 86400000,
  },
  {
    id: 'post-3', sanctuaryId: DEMO_SANCTUARY_ID, authorId: DEMO_SANCTUARY_ID, authorName: 'Nova Vaughn',
    authorPhoto: DEMO_SANCTUARY.avatarUrl, content: 'The deleted verse from "Golden Hour" + the voice memo where I wrote it. A one-time keepsake.',
    accessType: 'ONE_TIME', oneTimePrice: 4, likes: ['a'], commentCount: 9, timestamp: now - 2 * 86400000,
  },
];

// ── Demo Merch Store (MerchStore accepts a static `merch` prop) ──────────────────
export const DEMO_STORE_ID = 'demo-store';
export const DEMO_STORE_OWNER = 'Nova Vaughn';

export const DEMO_MERCH: MerchItem[] = [
  { id: 'm-tee',    ownerId: DEMO_STORE_ID, title: 'Tour Tee — "Golden Hour"', description: 'Heavyweight cotton, front + back print. Unisex.', price: 32, salePrice: 26, imageUrl: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600&h=600&fit=crop', category: 'APPAREL',     stock: 120, timestamp: now, rating: 4.8, reviewCount: 214 },
  { id: 'm-vinyl',  ownerId: DEMO_STORE_ID, title: 'Debut Album — Vinyl (Gold)', description: 'Limited gold pressing. Signed inserts on the first 100.', price: 34, imageUrl: 'https://images.unsplash.com/photo-1603048588665-791ca8aea617?w=600&h=600&fit=crop', category: 'MUSIC',       stock: 90,  timestamp: now, rating: 5.0, reviewCount: 88 },
  { id: 'm-hoodie', ownerId: DEMO_STORE_ID, title: 'Embroidered Logo Hoodie', description: 'Midweight fleece with tonal embroidery.', price: 68, imageUrl: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=600&h=600&fit=crop', category: 'APPAREL',     stock: 60,  timestamp: now, rating: 4.7, reviewCount: 132 },
  { id: 'm-cap',    ownerId: DEMO_STORE_ID, title: 'Dad Cap', description: 'Washed cotton, adjustable strap.', price: 24, imageUrl: 'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=600&h=600&fit=crop', category: 'ACCESSORY',   stock: 200, timestamp: now, rating: 4.6, reviewCount: 57 },
  { id: 'm-poster', ownerId: DEMO_STORE_ID, title: 'Tour Poster (18×24)', description: 'Numbered screen print of the tour art.', price: 18, imageUrl: 'https://images.unsplash.com/photo-1513519245088-0e12902e35ca?w=600&h=600&fit=crop', category: 'COLLECTIBLES', stock: 150, timestamp: now, rating: 4.9, reviewCount: 41 },
  { id: 'm-digital',ownerId: DEMO_STORE_ID, title: 'Deluxe Album (Digital + Stems)', description: 'Lossless download + producer stems.', price: 12, imageUrl: 'https://images.unsplash.com/photo-1571330735066-03aaa9429d89?w=600&h=600&fit=crop', category: 'DIGITAL',     stock: 9999, timestamp: now, rating: 4.9, reviewCount: 173 },
];
