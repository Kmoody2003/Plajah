// demoBusinessSeed — one-click "populate the entire stack" for a presentation. Turns the signed-in
// user's business into a complete showcase: a rich public page (hours, menu, amenities, geofence),
// products (→ store + kiosk + POS), deals, team + shifts, signage slides, rewards, and a live
// now-playing track. Everything writes under the owner's own uid / page, so it's fully client-side
// (rules-compatible) and their PUBLIC page becomes a shareable tour anyone can explore.

import type { BusinessPage, BusinessMenuItem, DigitalSignageSlide } from '../types';
import { auth } from './firebase';
import { saveBusinessPage, saveSignageSlide, fetchSignageSlides } from './businessService';
import { seedDemoBusiness } from './businessOpsService';
import { seedDemoOffers } from './offersService';
import { seedDemoTeam } from './staffService';
import { publishNowPlaying } from './storefrontLiveService';

const MENU: BusinessMenuItem[] = [
  { id: 'm1', name: 'House Drip', description: 'Small-batch medium roast', price: 3.5, category: 'Coffee', isAvailable: true },
  { id: 'm2', name: 'Oat Latte', description: '', price: 5.25, category: 'Coffee', isAvailable: true, isFeatured: true },
  { id: 'm3', name: 'Cold Brew', description: '16oz', price: 4.75, category: 'Coffee', isAvailable: true },
  { id: 'm4', name: 'Avocado Toast', description: 'Sourdough, chili, lime', price: 9.0, category: 'Kitchen', isAvailable: true },
  { id: 'm5', name: 'Breakfast Burrito', description: 'Egg, potato, cheddar', price: 10.5, category: 'Kitchen', isAvailable: true },
  { id: 'm6', name: 'Almond Croissant', description: '', price: 4.25, category: 'Bakery', isAvailable: true },
];

const SLIDES: Partial<DigitalSignageSlide>[] = [
  { type: 'PROMO', headline: 'Members save 10%', subtext: 'Check in on Plajah to earn points', backgroundColor: '#1a0033', durationSeconds: 8, isActive: true, order: 0 },
  { type: 'TEXT', headline: 'Now serving local roasters', subtext: 'Ask about this week’s single origin', backgroundColor: '#33001a', durationSeconds: 8, isActive: true, order: 1 },
  { type: 'PROMO', headline: '$5 off $40+', subtext: 'Today only', backgroundColor: '#000', durationSeconds: 6, isActive: true, order: 2 },
];

/** Populate the entire business stack for the signed-in owner. Idempotent-ish: reuses the existing
 *  page if provided, and each sub-seeder skips work it has already done. Returns the saved page. */
export async function seedFullDemoBusiness(existing?: BusinessPage | null): Promise<BusinessPage> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in first.');
  const name = existing?.businessName || 'Plajah Corner Café';

  const page = await saveBusinessPage({
    id: existing?.id,
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
  });

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
