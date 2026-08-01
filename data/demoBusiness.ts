import type { BusinessPage, Organization, OrgMembership, JobPosting, Application } from '../types';
import { getTemplate } from '../services/businessTemplates';

export const DEMO_BUSINESS: BusinessPage = {
  id: 'demo-business-plajah',
  ownerId: 'demo',
  isDemo: true,
  businessName: 'The Plajah Lounge',
  businessType: 'ENTERTAINMENT',
  tagline: 'Where music, culture, and community come alive',
  description:
    'The Plajah Lounge is a premium social space powered entirely by the Plajah platform — from our custom in-store radio station to digital signage, loyalty rewards, and online ordering. This demo page shows you everything your business can do on Plajah.',
  logoUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=200&h=200&fit=crop',
  coverUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1200&h=500&fit=crop',
  address: '1247 Plajah Avenue, Suite 100',
  city: 'Atlanta',
  state: 'GA',
  postalCode: '30301',
  phone: '(404) 555-0182',
  email: 'hello@plajahlounge.com',
  website: 'https://plajah.com',
  socialLinks: {
    instagram: 'plajahlounge',
    twitter: 'plajahlounge',
    facebook: 'plajahlounge',
  },
  priceRange: '$$',
  isPublic: true,
  isVerified: true,
  rating: 4.8,
  reviewCount: 124,
  plajahUserDiscountPct: 15,
  isAcceptingOrders: true,
  radioServiceEnabled: true,
  digitalSignageEnabled: true,
  crmEnabled: true,
  rewardsEnabled: true,
  rewardPointsPerDollar: 10,
  amenities: ['WiFi', 'Parking', 'Music', 'Food', 'Outdoor'],
  tags: ['lounge', 'music', 'events', 'cocktails', 'demo'],
  promoBanner: '🎉 Grand Opening Week — 20% off all drinks Friday–Sunday!',
  hours: {
    monday:    { open: '12:00', close: '22:00' },
    tuesday:   { open: '12:00', close: '22:00' },
    wednesday: { open: '12:00', close: '23:00' },
    thursday:  { open: '12:00', close: '23:00' },
    friday:    { open: '12:00', close: '02:00' },
    saturday:  { open: '11:00', close: '02:00' },
    sunday:    { open: '11:00', close: '21:00' },
  },
  menuItems: [
    // Drinks
    {
      id: 'menu-1', category: 'Drinks', name: 'Plajah Sunset', isFeatured: true,
      description: 'Our signature cocktail — mango, passion fruit, and a splash of citrus over crushed ice.',
      price: 1400, tags: ['signature', 'tropical'],
      imageUrl: 'https://images.unsplash.com/photo-1541658016709-82535e94bc69?w=400&h=300&fit=crop',
    },
    {
      id: 'menu-2', category: 'Drinks', name: 'Midnight Espresso Martini',
      description: 'Cold brew espresso, vanilla vodka, and coffee liqueur. Smooth and electric.',
      price: 1600,
      imageUrl: 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=400&h=300&fit=crop',
    },
    {
      id: 'menu-3', category: 'Drinks', name: 'Fresh Lemonade',
      description: 'House-made lemonade with mint and a tajín rim. Non-alcoholic.',
      price: 700, tags: ['non-alcoholic', 'refreshing'],
    },
    {
      id: 'menu-4', category: 'Drinks', name: 'Hibiscus Fizz',
      description: 'Sparkling hibiscus tea with ginger and lime. Non-alcoholic.',
      price: 800, tags: ['non-alcoholic'],
    },
    // Food
    {
      id: 'menu-5', category: 'Food', name: 'Jerk Chicken Sliders', isFeatured: true,
      description: 'Three mini sliders with slow-cooked jerk chicken, mango slaw, and habanero aioli.',
      price: 1800, tags: ['spicy', 'best seller'],
      imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop',
    },
    {
      id: 'menu-6', category: 'Food', name: 'Truffle Fries',
      description: 'Crispy shoestring fries tossed in truffle oil, parmesan, and fresh herbs.',
      price: 1200,
      imageUrl: 'https://images.unsplash.com/photo-1630431341973-02e1b662ec35?w=400&h=300&fit=crop',
    },
    {
      id: 'menu-7', category: 'Food', name: 'Charcuterie Board',
      description: 'Artisan meats, cheeses, seasonal fruits, and house-made honey mustard. Serves 2–4.',
      price: 2800, tags: ['shareable'],
      imageUrl: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=400&h=300&fit=crop',
    },
    {
      id: 'menu-8', category: 'Food', name: 'Plantain Bites',
      description: 'Sweet fried plantains with crema and chimichurri dipping sauce.',
      price: 1000, tags: ['vegetarian', 'vegan option'],
    },
    // Desserts
    {
      id: 'menu-9', category: 'Desserts', name: 'Banana Pudding Jar', isFeatured: true,
      description: 'Layered vanilla pudding, Nilla wafers, and fresh banana in a mason jar.',
      price: 900, tags: ['best seller'],
      imageUrl: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=400&h=300&fit=crop',
    },
    {
      id: 'menu-10', category: 'Desserts', name: 'Chocolate Lava Cake',
      description: 'Warm chocolate cake with a molten center. Served with vanilla bean ice cream.',
      price: 1100,
    },
    // Merch
    {
      id: 'menu-11', category: 'Merch', name: 'Plajah Lounge Tee',
      description: 'Premium heavyweight cotton tee. Available in Black, Cream, and Forest.',
      price: 3500, tags: ['clothing'],
      imageUrl: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400&h=300&fit=crop',
    },
    {
      id: 'menu-12', category: 'Merch', name: 'Branded Tumbler',
      description: '20oz insulated stainless steel tumbler. Keeps drinks cold for 24 hours.',
      price: 2800, tags: ['drinkware'],
    },
  ],
  galleryImages: [
    'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&h=450&fit=crop',
    'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1429514513361-8fa32282fd5f?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1598653222000-6b7b7a552625?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1453614512568-c4024d13c247?w=600&h=600&fit=crop',
  ],
  events: [
    {
      id: 'evt-1',
      title: 'Friday Night Live',
      description: 'Live music, DJ sets, and special cocktail features every Friday night. 21+ after 10pm.',
      date: (() => { const d = new Date(); d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7)); return d.toISOString().split('T')[0]; })(),
      time: '8:00 PM – 2:00 AM',
      isFree: true,
      imageUrl: 'https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=600&h=300&fit=crop',
    },
    {
      id: 'evt-2',
      title: 'Sunday Jazz Brunch',
      description: 'Live jazz quartet, bottomless mimosas, and a special brunch menu. Reservations recommended.',
      date: (() => { const d = new Date(); d.setDate(d.getDate() + ((0 - d.getDay() + 7) % 7 || 7)); return d.toISOString().split('T')[0]; })(),
      time: '11:00 AM – 3:00 PM',
      isFree: false,
      price: 4500,
      imageUrl: 'https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=600&h=300&fit=crop',
    },
    {
      id: 'evt-3',
      title: 'Creator Night — Plajah Showcase',
      description: 'Independent artists and creators on the Plajah platform take the stage. Performances, art displays, and networking.',
      date: (() => { const d = new Date(); d.setDate(d.getDate() + 14); return d.toISOString().split('T')[0]; })(),
      time: '7:00 PM – 11:00 PM',
      isFree: true,
    },
  ],
  createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
  updatedAt: Date.now(),
};

// ─── Organization companion for the demo business ───────────────────────────
// The employee/roles/hiring features run on the Organization backbone, so the
// demo business ALSO has an Organization form (same "Plajah Lounge" identity).
// BusinessDemoView renders a Customer / Employee / Admin tour over this data.
const NOW = 1_720_000_000_000; // fixed constant (no Date.now)
const AV = (id: string) => `https://images.unsplash.com/${id}?w=200&h=200&fit=crop`;

export const DEMO_BUSINESS_ID = 'demo-plajah-lounge';

export const DEMO_BUSINESS_ORG: Organization = {
  id: DEMO_BUSINESS_ID,
  orgType: 'CLUB',
  name: DEMO_BUSINESS.businessName,
  handle: 'plajahlounge',
  tagline: DEMO_BUSINESS.tagline,
  about:
    'A live demo of a Plajah business page — explore it as a customer, as an employee (your own work badge + role), and as the owner running the hiring pipeline and staff. Everything here is sample content.',
  logoUrl: DEMO_BUSINESS.logoUrl,
  coverUrl: DEMO_BUSINESS.coverUrl,
  accentColor: '#0070FF',
  creatorId: 'demo',
  admins: ['demo'],
  category: 'Lounge / Venue',
  templateId: 'club',
  roleDefs: getTemplate('club')?.defaultRoles,
  isBusinessPage: true,
  isDemo: true,
  isPublic: true,
  isVerified: true,
  followerCount: 3120,
  memberCount: 8,
  location: { city: 'Atlanta, GA' },
  socialLinks: { website: 'https://plajah.com', instagram: 'plajahlounge' },
  createdAt: NOW,
  updatedAt: NOW,
};

// ── Staff (work badges) — delegated roles from the club template ───────────────
export const DEMO_EMPLOYEES: OrgMembership[] = [
  { id: 'e-owner', orgId: DEMO_BUSINESS_ID, userId: 'demo', role: 'OWNER', status: 'ACTIVE', displayName: 'Nova Vaughn', photoUrl: AV('photo-1544005313-94ddf0286df2'), roleKey: 'OWNER', isEmployee: true, joinedAt: NOW - 900 * 86400000 },
  { id: 'e-mgr', orgId: DEMO_BUSINESS_ID, userId: 'demo-mgr', role: 'ADMIN', status: 'ACTIVE', displayName: 'Marcus Lee', photoUrl: AV('photo-1506794778202-cad84cf45f1d'), roleKey: 'MANAGER', isEmployee: true, joinedAt: NOW - 500 * 86400000 },
  { id: 'e-promo', orgId: DEMO_BUSINESS_ID, userId: 'demo-promo', role: 'STAFF', status: 'ACTIVE', displayName: 'Aisha Bell', photoUrl: AV('photo-1487412720507-e7ab37603c6f'), roleKey: 'PROMOTER', isEmployee: true, joinedAt: NOW - 300 * 86400000 },
  { id: 'e-host', orgId: DEMO_BUSINESS_ID, userId: 'demo-host', role: 'STAFF', status: 'ACTIVE', displayName: 'Priya Anand', photoUrl: AV('photo-1534528741775-53994a69daeb'), roleKey: 'HOST', isEmployee: true, joinedAt: NOW - 210 * 86400000 },
  { id: 'e-sec', orgId: DEMO_BUSINESS_ID, userId: 'demo-sec', role: 'STAFF', status: 'ACTIVE', displayName: 'Diego Ramos', photoUrl: AV('photo-1500648767791-00dcc994a43e'), roleKey: 'SECURITY', isEmployee: true, joinedAt: NOW - 150 * 86400000 },
  { id: 'e-dj', orgId: DEMO_BUSINESS_ID, userId: 'demo-dj', role: 'MEMBER', status: 'ACTIVE', displayName: 'Otis Grand', photoUrl: AV('photo-1492562080023-ab3db95bfbce'), roleKey: 'DJ', isEmployee: true, joinedAt: NOW - 90 * 86400000 },
];

// The employee whose badge the "Employee" tab showcases (Priya, the Host).
export const DEMO_ACTIVE_EMPLOYEE = DEMO_EMPLOYEES[3];

// ── Open positions (Careers view) — a paid role + a volunteer event crew ───────
export const DEMO_POSTINGS: JobPosting[] = [
  { id: 'jp1', orgId: DEMO_BUSINESS_ID, postingType: 'JOB', title: 'Bartender', roleKey: 'HOST', description: 'Craft our signature cocktails, run the bar during peak hours, and keep the energy up. Experience preferred.', location: 'Atlanta, GA', employmentType: 'PART_TIME', compRange: '$18/hr + tips', status: 'OPEN', createdBy: 'demo', createdAt: NOW - 18 * 86400000, questions: [{ id: 'q1', prompt: 'What’s your go-to signature cocktail?', type: 'TEXT', required: true }] },
  { id: 'jp2', orgId: DEMO_BUSINESS_ID, postingType: 'JOB', title: 'Event Promoter', roleKey: 'PROMOTER', description: 'Book and promote weekly events — Friday Night Live, Sunday Jazz Brunch, and Creator Nights.', employmentType: 'CONTRACT', compRange: 'Per event', status: 'OPEN', createdBy: 'demo', createdAt: NOW - 9 * 86400000 },
  { id: 'jp3', orgId: DEMO_BUSINESS_ID, postingType: 'VOLUNTEER', title: 'Event Crew', roleKey: 'DJ', description: 'Help set up and run Creator Nights — sound, setup, guest list. Perks: free entry + merch.', employmentType: 'VOLUNTEER', shiftNeeds: 'Evenings, ~4 hrs', status: 'OPEN', createdBy: 'demo', createdAt: NOW - 4 * 86400000 },
];

// ── Applicants across the pipeline (Admin hiring board) ────────────────────────
export const DEMO_APPLICATIONS: Application[] = [
  { id: 'ap1', jobId: 'jp1', orgId: DEMO_BUSINESS_ID, applicantName: 'Jordan Pike', applicantPhoto: AV('photo-1507003211169-0a1dd7228f2d'), stage: 'APPLIED', rating: 0, answers: { q1: 'A smoked-rosemary paloma — always a crowd-pleaser.' }, createdAt: NOW - 3 * 86400000 },
  { id: 'ap2', jobId: 'jp1', orgId: DEMO_BUSINESS_ID, applicantName: 'Sam Okoye', applicantPhoto: AV('photo-1519085360753-af0119f7cbe7'), stage: 'SCREENING', rating: 4, answers: { q1: 'Espresso martini, but I batch the cold brew in-house.' }, createdAt: NOW - 6 * 86400000 },
  { id: 'ap3', jobId: 'jp1', orgId: DEMO_BUSINESS_ID, applicantName: 'Riley Chen', applicantPhoto: AV('photo-1531123897727-8f129e1688ce'), stage: 'INTERVIEW', rating: 5, createdAt: NOW - 9 * 86400000 },
  { id: 'ap4', jobId: 'jp2', orgId: DEMO_BUSINESS_ID, applicantName: 'Bex Fontaine', applicantPhoto: AV('photo-1544723795-3fb6469f5b39'), stage: 'OFFER', rating: 5, createdAt: NOW - 11 * 86400000 },
  { id: 'ap5', jobId: 'jp3', orgId: DEMO_BUSINESS_ID, applicantName: 'Marcus Webb', applicantPhoto: AV('photo-1502767089025-6572583495c9'), stage: 'APPLIED', createdAt: NOW - 1 * 86400000 },
];

// ── Audit trail sample (Admin view) ────────────────────────────────────────────
export interface DemoAudit { id: string; actor: string; action: string; target: string; when: string; }
export const DEMO_AUDIT: DemoAudit[] = [
  { id: 'au1', actor: 'Nova Vaughn', action: 'Hired', target: 'Otis Grand as Resident DJ', when: '3 mo ago' },
  { id: 'au2', actor: 'Nova Vaughn', action: 'Changed role', target: 'Marcus Lee → Manager', when: '5 mo ago' },
  { id: 'au3', actor: 'Marcus Lee', action: 'Moved applicant', target: 'Riley Chen → Interview', when: '2 wk ago' },
  { id: 'au4', actor: 'Nova Vaughn', action: 'Posted opening', target: 'Bartender', when: '3 wk ago' },
];
