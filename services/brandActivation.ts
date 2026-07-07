// brandActivation — one call that provisions a brand/org/school's public presence.
//
// "Activate" a brand account and it spins up, in one flow:
//   • a Business/Brand PAGE  → an Organization (organizations/{id}, the public page)
//   • an optional CLUB       → a community space (createClub, with a merch store)
//   • a MERCH STORE          → StoreSettings.isEnabled (canonical storeProducts)
// and promotes the signed-in user's account type. Works across verticals via orgType:
// brands, businesses, nonprofits, cultural institutions, labels, teams, and schools.

import { createOrganization } from './organizationService';
import { createClub, updateStoreSettings, updateAccountType } from './backendService';
import type { Organization, Club, OrgType, AccountType } from '../types';

export interface BrandActivationOptions {
  name: string;
  orgType?: OrgType;          // 'BRAND' (default) | 'BUSINESS' | 'NONPROFIT' | 'CULTURAL' | 'LABEL' | 'TEAM' | 'OTHER' (schools)
  about?: string;
  category?: string;
  logoUrl?: string;
  coverUrl?: string;
  createClub?: boolean;       // spin up a community club too
  enableStore?: boolean;      // turn on the merch store
  legacyBrandId?: string;     // link a migrated legacy BrandAccount
  accountType?: AccountType;  // override the promoted account type
}

export interface BrandActivationResult {
  organization: Organization | null;
  club: Club | null;
  storeEnabled: boolean;
  error?: string;
}

// Which account type a given org vertical maps to.
const accountTypeForOrg = (orgType: OrgType): AccountType =>
  orgType === 'BRAND' || orgType === 'BUSINESS' || orgType === 'LABEL' ? 'BRAND' : 'ORGANIZATION';

export async function activateBrand(opts: BrandActivationOptions): Promise<BrandActivationResult> {
  const orgType = opts.orgType || 'BRAND';
  const result: BrandActivationResult = { organization: null, club: null, storeEnabled: false };

  // 1. The public page — an Organization (this IS the business/brand page).
  try {
    result.organization = await createOrganization({
      orgType,
      name: opts.name,
      about: opts.about || '',
      category: opts.category,
      logoUrl: opts.logoUrl,
      coverUrl: opts.coverUrl,
      isPublic: true,
      legacyBrandId: opts.legacyBrandId,
    });
  } catch (e: any) {
    return { ...result, error: e?.message || 'Could not create the organization page' };
  }
  if (!result.organization) return { ...result, error: 'Sign in to activate a brand' };

  // 2. Optional community club (carries a merch store flag).
  if (opts.createClub) {
    try {
      result.club = await createClub({
        name: `${opts.name} Club`,
        description: `The community space for ${opts.name}.`,
        category: opts.category || 'Brand',
        type: 'CLUB',
        hasMerchStore: !!opts.enableStore,
        coverImage: opts.coverUrl,
      });
    } catch { /* club is optional — page still provisioned */ }
  }

  // 3. Turn on the merch store (canonical storeProducts; products added later).
  if (opts.enableStore) {
    try { await updateStoreSettings({ isEnabled: true }); result.storeEnabled = true; }
    catch { /* non-fatal */ }
  }

  // 4. Promote the account so brand/org tools unlock.
  try { await updateAccountType(opts.accountType || accountTypeForOrg(orgType)); } catch { /* non-fatal */ }

  return result;
}
