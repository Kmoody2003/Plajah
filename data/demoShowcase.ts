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

// ── Demo Church — rich ministry-space content (populates ChurchDemoView) ────────
const U = (id: string, w = 600, h = 600) => `https://images.unsplash.com/${id}?w=${w}&h=${h}&fit=crop`;
const AV = (id: string) => U(id, 200, 200);

export interface DemoStaff { id: string; name: string; role: string; photo: string; bio?: string; email?: string; uid?: string; }
export interface DemoPost { id: string; author: string; authorPhoto: string; text: string; when: string; likes: number; comments: number; image?: string; }
export interface DemoEvent { id: string; title: string; date: string; time: string; location: string; price: number | 'FREE'; image: string; blurb: string; }
export interface DemoVideo { id: string; title: string; series: string; date: string; duration: string; thumb: string; }
export interface DemoAlbum { id: string; title: string; cover: string; photos: string[]; }
export interface DemoMerchLite { id: string; title: string; price: number; image: string; }
export interface DemoMinistryDetail {
  leaders: DemoStaff[];
  albums: DemoAlbum[];
  posts: DemoPost[];
  events: DemoEvent[];
  merch: DemoMerchLite[];
}

// Church-level leadership.
export const DEMO_CHURCH_STAFF: DemoStaff[] = [
  { id: 'st-lead',   name: 'Pastor Daniel Reyes', role: 'Lead Pastor',          photo: AV('photo-1507003211169-0a1dd7228f2d'), bio: 'Planted Grace Chapel in 2009. Teaching through the Gospel of John this season.' },
  { id: 'st-exec',   name: 'Angela Brooks',       role: 'Executive Pastor',     photo: AV('photo-1573496359142-b8d87734a5a2'), bio: 'Operations, staff & campuses.' },
  { id: 'st-worship',name: 'Marcus Bell',         role: 'Worship Pastor',       photo: AV('photo-1519085360753-af0119f7cbe7'), bio: 'Leads the worship & production teams.' },
  { id: 'st-youth',  name: 'Priya Nair',          role: 'Youth Director',       photo: AV('photo-1544005313-94ddf0286df2'), bio: 'Middle & high school ministry.' },
  { id: 'st-kids',   name: 'Tanya Okafor',        role: "Kids' Director",       photo: AV('photo-1580489944761-15a19d654956'), bio: 'Nursery through 5th grade.' },
  { id: 'st-care',   name: 'Sam Whitfield',       role: 'Pastoral Care',        photo: AV('photo-1500648767791-00dcc994a43e'), bio: 'Prayer, counseling & visitation.' },
];

export const DEMO_CHURCH_ALBUMS: DemoAlbum[] = [
  { id: 'al-sunday', title: 'Sunday Gatherings', cover: U('photo-1438032005730-c779502df39b'), photos: [U('photo-1438032005730-c779502df39b'), U('photo-1507692049790-de58290a4334'), U('photo-1524230572899-a752b3835840'), U('photo-1543968996-ee822b8176ba'), U('photo-1477281765962-ef34e8bb0967'), U('photo-1516450360452-9312f5e86fc7')] },
  { id: 'al-missions', title: 'Missions & Outreach', cover: U('photo-1469571486292-0ba58a3f068b'), photos: [U('photo-1469571486292-0ba58a3f068b'), U('photo-1488521787991-ed7bbaae773c'), U('photo-1509099836639-18ba1795216d'), U('photo-1593113630400-ea4288922497')] },
  { id: 'al-baptism', title: 'Baptism Sunday', cover: U('photo-1490730141103-6cac27aaab94'), photos: [U('photo-1490730141103-6cac27aaab94'), U('photo-1519834785169-98be25ec3f84'), U('photo-1533928298208-27ff66555d8d')] },
];

export const DEMO_CHURCH_EVENTS: DemoEvent[] = [
  { id: 'ev-conf',   title: 'Grace Conference 2026', date: 'Sat, Sep 12', time: '9:00 AM', location: 'Downtown Campus', price: 25, image: U('photo-1511578314322-379afb476865', 800, 450), blurb: 'A full day of worship, teaching & workshops with guest speakers.' },
  { id: 'ev-concert',title: 'Worship Night',         date: 'Fri, Jul 25', time: '7:00 PM', location: 'Main Auditorium', price: 'FREE', image: U('photo-1501386761578-eac5c94b800a', 800, 450), blurb: 'An evening of live worship — free, all welcome.' },
  { id: 'ev-gala',   title: 'Missions Benefit Gala', date: 'Sat, Oct 4',  time: '6:30 PM', location: 'North Campus', price: 75, image: U('photo-1519671482749-fd09be7ccebf', 800, 450), blurb: 'Dinner & fundraising to support our global outreach partners.' },
];

export const DEMO_CHURCH_VIDEOS: DemoVideo[] = [
  { id: 'vd-1', title: 'The Light of the World — John 8', series: 'Gospel of John', date: 'Jul 6, 2026',  duration: '38:12', thumb: U('photo-1485162872809-a4f3d1b06d95', 480, 270) },
  { id: 'vd-2', title: 'Living Water — John 4',           series: 'Gospel of John', date: 'Jun 29, 2026', duration: '41:05', thumb: U('photo-1507692049790-de58290a4334', 480, 270) },
  { id: 'vd-3', title: 'Worship Night — Full Set',        series: 'Worship',        date: 'Jun 27, 2026', duration: '1:12:44', thumb: U('photo-1501386761578-eac5c94b800a', 480, 270) },
  { id: 'vd-4', title: 'Baptism Sunday Highlights',       series: 'Church Life',    date: 'Jun 22, 2026', duration: '6:31',  thumb: U('photo-1490730141103-6cac27aaab94', 480, 270) },
];

export const DEMO_CHURCH_FEED: DemoPost[] = [
  { id: 'cp-1', author: 'Pastor Daniel Reyes', authorPhoto: AV('photo-1507003211169-0a1dd7228f2d'), text: 'What a Sunday 🙌 Thank you to everyone who served and worshiped with us. This week we continue in John 8 — read ahead and come ready.', when: '2d', likes: 214, comments: 37, image: U('photo-1524230572899-a752b3835840', 800, 500) },
  { id: 'cp-2', author: 'Grace Chapel', authorPhoto: 'https://images.unsplash.com/photo-1438032005730-c779502df39b?w=200&h=200&fit=crop', text: 'Grace Conference 2026 tickets are live — early-bird pricing through August. Bring a friend!', when: '4d', likes: 98, comments: 12 },
  { id: 'cp-3', author: 'Marcus Bell', authorPhoto: AV('photo-1519085360753-af0119f7cbe7'), text: 'Setlist for this weekend is up in the Worship team space. Rehearsal Thursday 6:30.', when: '5d', likes: 46, comments: 8 },
];

export interface DemoPrayer { id: string; name: string; request: string; when: string; praying: number; answered?: boolean; }
export const DEMO_CHURCH_PRAYERS: DemoPrayer[] = [
  { id: 'pr-1', name: 'The Alvarez family', request: 'Please pray for my father\'s surgery on Thursday — for the surgeons and for peace over our family.', when: '5h', praying: 47 },
  { id: 'pr-2', name: 'Marcus B.', request: 'Praying over a big career decision this month. Wisdom & open doors.', when: '1d', praying: 22 },
  { id: 'pr-3', name: 'Anonymous', request: 'For my marriage — that God would soften both our hearts.', when: '2d', praying: 68 },
  { id: 'pr-4', name: 'Grace youth group', request: 'Thank you for praying — camp went incredibly and 12 students gave their lives to Christ! 🙌', when: '3d', praying: 133, answered: true },
];

export interface DemoBook { id: string; title: string; author: string; cover: string; note?: string; }
export const DEMO_CHURCH_LIBRARY: DemoBook[] = [
  { id: 'bk-1', title: 'The Gospel of John — Study Guide', author: 'Grace Chapel Teaching Team', cover: U('photo-1544716278-ca5e3f4abd8c', 300, 420), note: 'Companion to the current series' },
  { id: 'bk-2', title: 'Mere Christianity', author: 'C. S. Lewis', cover: U('photo-1541963463532-d68292c34b19', 300, 420) },
  { id: 'bk-3', title: 'Prayer: Experiencing Awe & Intimacy', author: 'Timothy Keller', cover: U('photo-1512820790803-83ca734da794', 300, 420) },
  { id: 'bk-4', title: 'Celebration of Discipline', author: 'Richard Foster', cover: U('photo-1589998059171-988d887df646', 300, 420) },
  { id: 'bk-5', title: 'The Ragamuffin Gospel', author: 'Brennan Manning', cover: U('photo-1543002588-bfa74002ed7e', 300, 420) },
];

// A few featured ministries, fully populated.
export const DEMO_MINISTRY_DETAIL: Record<string, DemoMinistryDetail> = {
  'min-worship': {
    leaders: [DEMO_CHURCH_STAFF[2], { id: 'w2', name: 'Grace Lin', role: 'Vocalist / Team Lead', photo: AV('photo-1534528741775-53994a69daeb') }, { id: 'w3', name: 'Andre Cole', role: 'Production', photo: AV('photo-1506794778202-cad84cf45f1d') }],
    albums: [{ id: 'wa1', title: 'On Stage', cover: U('photo-1501386761578-eac5c94b800a'), photos: [U('photo-1501386761578-eac5c94b800a'), U('photo-1470019693664-1d202d2c0907'), U('photo-1516280440614-37939bbacd81')] }],
    posts: [{ id: 'wp1', author: 'Marcus Bell', authorPhoto: AV('photo-1519085360753-af0119f7cbe7'), text: 'New song this week — "Ever Faithful." Charts + rehearsal track in the library.', when: '1d', likes: 33, comments: 5 }],
    events: [{ id: 'we1', title: 'Worship Night', date: 'Fri, Jul 25', time: '7:00 PM', location: 'Main Auditorium', price: 'FREE', image: U('photo-1501386761578-eac5c94b800a', 800, 450), blurb: 'Open worship night — all welcome.' }],
    merch: [{ id: 'wm1', title: 'Worship Night Tee', price: 24, image: U('photo-1521572163474-6864f9cf17ab') }, { id: 'wm2', title: 'Live Worship (Digital)', price: 9, image: U('photo-1493225457124-a3eb161ffa5f') }],
  },
  'min-youth': {
    leaders: [DEMO_CHURCH_STAFF[3], { id: 'y2', name: 'Josh Adeyemi', role: 'Youth Leader', photo: AV('photo-1500648767791-00dcc994a43e') }],
    albums: [{ id: 'ya1', title: 'Summer Camp', cover: U('photo-1488521787991-ed7bbaae773c'), photos: [U('photo-1488521787991-ed7bbaae773c'), U('photo-1533174072545-7a4b6ad7a6c3'), U('photo-1526976668912-1a811878dd37')] }],
    posts: [{ id: 'yp1', author: 'Priya Nair', authorPhoto: AV('photo-1544005313-94ddf0286df2'), text: 'Wednesday night was 🔥 — 60+ students. Bring a friend next week for pizza night!', when: '3d', likes: 51, comments: 9, image: U('photo-1526976668912-1a811878dd37', 800, 500) }],
    events: [{ id: 'ye1', title: 'Fall Youth Retreat', date: 'Oct 17–19', time: 'All weekend', location: 'Pine Ridge Camp', price: 120, image: U('photo-1533174072545-7a4b6ad7a6c3', 800, 450), blurb: 'A weekend away — worship, teaching, games & s\'mores.' }],
    merch: [{ id: 'ym1', title: 'Youth Hoodie', price: 38, image: U('photo-1556821840-3a63f95609a7') }],
  },
  'min-kids': {
    leaders: [DEMO_CHURCH_STAFF[4]],
    albums: [{ id: 'ka1', title: 'VBS Week', cover: U('photo-1587654780291-39c9404d746b'), photos: [U('photo-1587654780291-39c9404d746b'), U('photo-1503454537195-1dcabb73ffb9')] }],
    posts: [{ id: 'kp1', author: 'Tanya Okafor', authorPhoto: AV('photo-1580489944761-15a19d654956'), text: 'VBS registration is open! Space is limited — sign your kids up early.', when: '6d', likes: 40, comments: 6 }],
    events: [{ id: 'ke1', title: 'Vacation Bible School', date: 'Aug 4–8', time: '9:00 AM', location: 'Kids Wing', price: 15, image: U('photo-1587654780291-39c9404d746b', 800, 450), blurb: 'A week of songs, stories, crafts & fun for K–5th.' }],
    merch: [],
  },
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
