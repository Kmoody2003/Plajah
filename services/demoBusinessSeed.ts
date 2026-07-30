// demoBusinessSeed — one-click "populate the entire stack" for a presentation. Turns the signed-in
// user's business into a complete showcase: a rich public page (hours, menu, amenities, geofence),
// products (→ store + kiosk + POS), deals, team + shifts, signage slides, rewards, and a live
// now-playing track. Everything writes under the owner's own uid / page, so it's fully client-side
// (rules-compatible) and their PUBLIC page becomes a shareable tour anyone can explore.

import type { BusinessPage, BusinessMenuItem, DigitalSignageSlide } from '../types';
import { auth } from './firebase';
import { saveBusinessPage, saveSignageSlide, fetchSignageSlides, fetchMyBusinessPages } from './businessService';
import { seedDemoBusiness } from './businessOpsService';
import { seedDemoOffers } from './offersService';
import { seedDemoTeam } from './staffService';
import { publishNowPlaying } from './storefrontLiveService';

const MENU: BusinessMenuItem[] = [
  // Coffee
  { id: 'm1', name: 'House Drip', description: 'Small-batch medium roast', price: 3.5, category: 'Coffee', isAvailable: true },
  { id: 'm2', name: 'Oat Latte', description: 'House oat milk, double shot', price: 5.25, category: 'Coffee', isAvailable: true, isFeatured: true },
  { id: 'm3', name: 'Cold Brew', description: '16oz, 20-hour steep', price: 4.75, category: 'Coffee', isAvailable: true },
  { id: 'm7', name: 'Cortado', description: 'Equal parts espresso & milk', price: 4.0, category: 'Coffee', isAvailable: true },
  { id: 'm8', name: 'Pour Over — Single Origin', description: 'Ask about this week’s roaster', price: 6.0, category: 'Coffee', isAvailable: true },
  // Tea & Not-Coffee
  { id: 'm9', name: 'Matcha Latte', description: 'Ceremonial grade, oat or whole', price: 5.5, category: 'Tea', isAvailable: true },
  { id: 'm10', name: 'Chai', description: 'House-spiced, lightly sweet', price: 4.75, category: 'Tea', isAvailable: true },
  { id: 'm11', name: 'Hibiscus Fizz', description: 'Housemade, sparkling', price: 4.5, category: 'Tea', isAvailable: true },
  // Kitchen
  { id: 'm4', name: 'Avocado Toast', description: 'Sourdough, chili, lime', price: 9.0, category: 'Kitchen', isAvailable: true, isFeatured: true },
  { id: 'm5', name: 'Breakfast Burrito', description: 'Egg, potato, cheddar, salsa verde', price: 10.5, category: 'Kitchen', isAvailable: true },
  { id: 'm12', name: 'Turkey & Brie Baguette', description: 'Fig jam, arugula', price: 11.0, category: 'Kitchen', isAvailable: true },
  { id: 'm13', name: 'Grain Bowl', description: 'Farro, roasted veg, tahini', price: 12.5, category: 'Kitchen', isAvailable: true },
  // Bakery
  { id: 'm6', name: 'Almond Croissant', description: 'Baked in-house daily', price: 4.25, category: 'Bakery', isAvailable: true },
  { id: 'm14', name: 'Morning Bun', description: 'Cardamom sugar, orange zest', price: 4.5, category: 'Bakery', isAvailable: true },
  { id: 'm15', name: 'Banana Bread', description: 'Brown butter, walnut', price: 3.75, category: 'Bakery', isAvailable: true },
  // Retail (→ store)
  { id: 'm16', name: 'Whole Bean — 12oz', description: 'This week’s house blend', price: 16.0, category: 'Retail', isAvailable: true },
  { id: 'm17', name: 'Corner Café Mug', description: 'Stoneware, 12oz', price: 18.0, category: 'Retail', isAvailable: true },
];

const SLIDES: Partial<DigitalSignageSlide>[] = [
  { type: 'PROMO', headline: 'Members save 10%', subtext: 'Check in on Plajah to earn points', backgroundColor: '#1a0033', durationSeconds: 8, isActive: true, order: 0 },
  { type: 'TEXT', headline: 'Now serving local roasters', subtext: 'Ask about this week’s single origin', backgroundColor: '#33001a', durationSeconds: 8, isActive: true, order: 1 },
  { type: 'PROMO', headline: '$5 off $40+', subtext: 'Today only', backgroundColor: '#000', durationSeconds: 6, isActive: true, order: 2 },
  { type: 'TEXT', headline: 'Live music Fridays', subtext: 'Local artists 6–9pm · tip from your phone', backgroundColor: '#001a33', durationSeconds: 8, isActive: true, order: 3 },
  { type: 'PROMO', headline: 'Double points weekends', subtext: 'Every Sat & Sun', backgroundColor: '#0d0d0d', durationSeconds: 6, isActive: true, order: 4 },
];

/** Populate the entire business stack for the signed-in owner. Idempotent-ish: reuses the existing
 *  page if provided, and each sub-seeder skips work it has already done. Returns the saved page. */
export async function seedFullDemoBusiness(existing?: BusinessPage | null): Promise<BusinessPage> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in first.');

  // Persistent & universal: always upgrade the owner's ONE demo page rather than mint a new one.
  // If the caller didn't hand us the active page, find the owner's existing page so repeat
  // "Populate full demo" clicks enrich the same business instead of duplicating it.
  let target = existing;
  if (!target?.id) {
    try { target = (await fetchMyBusinessPages())[0] || null; } catch { /* first-time owner */ }
  }
  const name = target?.businessName || 'Plajah Corner Café';

  // Only send `id` when we actually have one — a stray `id: undefined` makes Firestore's
  // setDoc reject the whole write ("Unsupported field value: undefined in field id").
  const pageInput: Partial<BusinessPage> = {
    businessName: name,
    businessType: 'RESTAURANT',
    tagline: 'Coffee, vinyl & good company',
    description: 'A neighborhood café showcasing the full Plajah in-store stack — order at the kiosk or register, earn loyalty, hear local artists on our in-store radio, and tip them right from your phone.',
    address: '123 Market Street', city: 'San Francisco', state: 'CA', postalCode: '94103',
    phone: '(415) 555-0142', website: 'https://plajah.com',
    hours: {
      monday: { open: '07:00', close: '19:00' }, tuesday: { open: '07:00', close: '19:00' },
      wednesday: { open: '07:00', close: '19:00' }, thursday: { open: '07:00', close: '19:00' },
      friday: { open: '07:00', close: '21:00' }, saturday: { open: '08:00', close: '21:00' },
      sunday: { open: '08:00', close: '17:00' },
    },
    amenities: ['wifi', 'coffee', 'food', 'music', 'outdoor'],
    priceRange: '$$',
    menuItems: MENU,
    geoLat: 37.7793, geoLng: -122.4193, geoRadiusM: 150,
    isPublic: true, isAcceptingOrders: true,
    radioServiceEnabled: true, digitalSignageEnabled: true, crmEnabled: true,
    rewardsEnabled: true, rewardPointsPerDollar: 1,
  };
  if (target?.id) pageInput.id = target.id;

  const page = await saveBusinessPage(pageInput);

  // Products (store + kiosk + POS), deals, team + shifts — each skips if already seeded.
  await Promise.all([
    seedDemoBusiness(uid, name).catch(() => {}),
    seedDemoOffers(uid).catch(() => {}),
    seedDemoTeam(uid).catch(() => {}),
  ]);

  // Signage slides (keyed by page id, matching the dashboard). Seed only if none yet.
  const existingSlides = await fetchSignageSlides(page.id).catch(() => []);
  if (existingSlides.length === 0) {
    for (const s of SLIDES) await saveSignageSlide({ ...s, businessId: page.id }).catch(() => {});
  }

  // A live now-playing track so the in-store card + Now Playing display have content immediately.
  await publishNowPlaying(uid, {
    title: 'Golden Hour', artist: 'The Neighborhood Sessions',
    artwork: 'https://picsum.photos/seed/plajah-nowplaying/600/600',
    startedAt: Date.now(),
  }).catch(() => {});

  return page;
}
