import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, orderBy, limit, addDoc, runTransaction } from 'firebase/firestore';
import { onSnapshot } from './safeSnapshot';
import { db, auth } from './firebase';
import {
  BusinessPage, BusinessOrder, BusinessReward, DigitalSignageSlide,
  SeedRaiserCampaign, SeedRaiserPledge, SeedRaiserReward, CrmContact
} from '../types';

// ── Business Pages ────────────────────────────────────────────────────────────

export async function fetchBusinessPage(id: string): Promise<BusinessPage | null> {
  const snap = await getDoc(doc(db, 'businessPages', id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as BusinessPage) : null;
}

export async function fetchMyBusinessPages(): Promise<BusinessPage[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  const q = query(collection(db, 'businessPages'), where('ownerId', '==', uid), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as BusinessPage));
}

export async function fetchAllBusinessPages(): Promise<BusinessPage[]> {
  const q = query(collection(db, 'businessPages'), orderBy('businessName', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as BusinessPage));
}

export async function saveBusinessPage(page: Partial<BusinessPage>): Promise<BusinessPage> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not authenticated');

  const now = Date.now();

  if (page.id) {
    const ref = doc(db, 'businessPages', page.id);
    const updates = { ...page, ownerId: uid, updatedAt: now };
    delete (updates as any).id;
    await updateDoc(ref, updates);
    return { ...page, ownerId: uid, updatedAt: now } as BusinessPage;
  }

  const ref = doc(collection(db, 'businessPages'));
  const newPage: BusinessPage = {
    id: ref.id,
    ownerId: uid,
    businessName: page.businessName || 'My Business',
    businessType: page.businessType || 'OTHER',
    description: page.description || '',
    isVerified: false,
    isAcceptingOrders: false,
    radioServiceEnabled: false,
    digitalSignageEnabled: false,
    crmEnabled: false,
    rewardsEnabled: false,
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...page,
  };
  await setDoc(ref, newPage);
  return newPage;
}

export async function deleteBusinessPage(id: string): Promise<void> {
  await deleteDoc(doc(db, 'businessPages', id));
}

// ── Orders ────────────────────────────────────────────────────────────────────

export async function fetchBusinessOrders(businessId: string): Promise<BusinessOrder[]> {
  const q = query(
    collection(db, 'businessOrders'),
    where('businessId', '==', businessId),
    orderBy('createdAt', 'desc'),
    limit(100)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as BusinessOrder));
}

export function listenToBusinessOrders(
  businessId: string,
  callback: (orders: BusinessOrder[]) => void
): () => void {
  const q = query(
    collection(db, 'businessOrders'),
    where('businessId', '==', businessId),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as BusinessOrder)));
  });
}

export async function updateOrderStatus(
  orderId: string,
  status: BusinessOrder['status']
): Promise<void> {
  await updateDoc(doc(db, 'businessOrders', orderId), { status, updatedAt: Date.now() });
}

// ── CRM Contacts ──────────────────────────────────────────────────────────────

export async function fetchCrmContacts(businessId: string): Promise<CrmContact[]> {
  const q = query(
    collection(db, 'crmContacts'),
    where('businessId', '==', businessId),
    orderBy('name', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as CrmContact));
}

export async function saveCrmContact(contact: Partial<CrmContact>): Promise<CrmContact> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not authenticated');
  const now = Date.now();

  if (contact.id) {
    const ref = doc(db, 'crmContacts', contact.id);
    await updateDoc(ref, { ...contact, updatedAt: now });
    return contact as CrmContact;
  }

  const ref = doc(collection(db, 'crmContacts'));
  const newContact: CrmContact = {
    id: ref.id,
    businessId: contact.businessId!,
    name: contact.name || 'Contact',
    tags: [],
    notes: '',
    rewardPoints: 0,
    totalSpend: 0,
    visitCount: 0,
    createdAt: now,
    ...contact,
  };
  await setDoc(ref, newContact);
  return newContact;
}

export async function deleteCrmContact(id: string): Promise<void> {
  await deleteDoc(doc(db, 'crmContacts', id));
}

// ── Business Rewards ──────────────────────────────────────────────────────────

export async function fetchCustomerReward(
  businessId: string,
  customerId: string
): Promise<BusinessReward | null> {
  const q = query(
    collection(db, 'businessRewards'),
    where('businessId', '==', businessId),
    where('customerId', '==', customerId),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as BusinessReward;
}

export async function addRewardPoints(
  businessId: string,
  customerId: string,
  points: number
): Promise<void> {
  const q = query(
    collection(db, 'businessRewards'),
    where('businessId', '==', businessId),
    where('customerId', '==', customerId),
    limit(1)
  );
  const snap = await getDocs(q);
  const now = Date.now();

  if (snap.empty) {
    await addDoc(collection(db, 'businessRewards'), {
      businessId,
      customerId,
      points,
      lifetimePoints: points,
      createdAt: now,
      updatedAt: now,
    });
    return;
  }

  const ref = snap.docs[0].ref;
  const data = snap.docs[0].data();
  await updateDoc(ref, {
    points: (data.points || 0) + points,
    lifetimePoints: (data.lifetimePoints || 0) + points,
    updatedAt: now,
  });
}

// ── Digital Signage ───────────────────────────────────────────────────────────

export async function fetchSignageSlides(businessId: string): Promise<DigitalSignageSlide[]> {
  const q = query(
    collection(db, 'signageSlides'),
    where('businessId', '==', businessId),
    orderBy('order', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as DigitalSignageSlide));
}

export async function saveSignageSlide(slide: Partial<DigitalSignageSlide>): Promise<DigitalSignageSlide> {
  const now = Date.now();
  if (slide.id) {
    const ref = doc(db, 'signageSlides', slide.id);
    await updateDoc(ref, { ...slide, updatedAt: now });
    return slide as DigitalSignageSlide;
  }
  const ref = doc(collection(db, 'signageSlides'));
  const newSlide: DigitalSignageSlide = {
    id: ref.id,
    businessId: slide.businessId!,
    type: slide.type || 'TEXT',
    durationSeconds: slide.durationSeconds || 10,
    isActive: true,
    order: slide.order || 0,
    ...slide,
  };
  await setDoc(ref, newSlide);
  return newSlide;
}

export async function deleteSignageSlide(id: string): Promise<void> {
  await deleteDoc(doc(db, 'signageSlides', id));
}

// ── SeedRaiser Campaigns ──────────────────────────────────────────────────────

export async function fetchSeedRaiserCampaign(id: string): Promise<SeedRaiserCampaign | null> {
  const snap = await getDoc(doc(db, 'seedRaiserCampaigns', id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as SeedRaiserCampaign) : null;
}

export async function fetchActiveSeedRaiserCampaigns(limitN = 20): Promise<SeedRaiserCampaign[]> {
  const q = query(
    collection(db, 'seedRaiserCampaigns'),
    where('status', '==', 'ACTIVE'),
    where('endDate', '>=', Date.now()),
    orderBy('endDate', 'asc'),
    limit(limitN)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as SeedRaiserCampaign));
}

export async function fetchMySeedRaiserCampaigns(): Promise<SeedRaiserCampaign[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  const q = query(
    collection(db, 'seedRaiserCampaigns'),
    where('creatorId', '==', uid),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as SeedRaiserCampaign));
}

export async function saveSeedRaiserCampaign(
  campaign: Partial<SeedRaiserCampaign>
): Promise<SeedRaiserCampaign> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not authenticated');
  const user = auth.currentUser;
  const now = Date.now();

  if (campaign.id) {
    const ref = doc(db, 'seedRaiserCampaigns', campaign.id);
    await updateDoc(ref, { ...campaign, updatedAt: now });
    return campaign as SeedRaiserCampaign;
  }

  const ref = doc(collection(db, 'seedRaiserCampaigns'));
  const newCampaign: SeedRaiserCampaign = {
    id: ref.id,
    creatorId: uid,
    creatorName: user?.displayName || 'Creator',
    creatorPhoto: user?.photoURL || undefined,
    title: campaign.title || 'My Campaign',
    description: campaign.description || '',
    category: campaign.category || 'OTHER',
    goalAmount: campaign.goalAmount || 1000,
    currentAmount: 0,
    backerCount: 0,
    endDate: campaign.endDate || Date.now() + 30 * 86_400_000,
    rewards: campaign.rewards || [],
    status: 'DRAFT',
    updates: [],
    platformFeePct: 5,
    createdAt: now,
    ...campaign,
  };
  await setDoc(ref, newCampaign);
  return newCampaign;
}

export async function publishSeedRaiserCampaign(id: string): Promise<void> {
  await updateDoc(doc(db, 'seedRaiserCampaigns', id), { status: 'ACTIVE', updatedAt: Date.now() });
}

export async function addCampaignUpdate(
  campaignId: string,
  title: string,
  text: string
): Promise<void> {
  const ref = doc(db, 'seedRaiserCampaigns', campaignId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const updates = snap.data().updates || [];
  updates.push({ id: `${Date.now()}`, title, text, timestamp: Date.now() });
  await updateDoc(ref, { updates, updatedAt: Date.now() });
}

export async function fetchCampaignPledges(campaignId: string): Promise<SeedRaiserPledge[]> {
  const q = query(
    collection(db, 'seedRaiserPledges'),
    where('campaignId', '==', campaignId),
    where('status', '==', 'COMPLETED'),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as SeedRaiserPledge));
}
