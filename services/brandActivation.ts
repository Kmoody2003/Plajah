// brandActivation — one call that provisions a brand/org/school's public presence.
//
// "Activate" a brand account and it spins up, in one flow:
//   • a Business/Brand PAGE  → an Organization (organizations/{id}, the public page)
//   • an optional CLUB       → a community space (createClub, with a merch store)
//   • a MERCH STORE          → StoreSettings.isEnabled (canonical storeProducts)
// and promotes the signed-in user's account type. Works across verticals via orgType:
// brands, businesses, nonprofits, cultural institutions, labels, teams, and schools.

import { createOrganization, updateOrganization } from './organizationService';
import { createClub, updateStoreSettings, updateAccountType } from './backendService';
import { getTemplate } from './businessTemplates';
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

// Which account type a given org vertical maps to. Business-page verticals all map to
// BRAND so their owner unlocks the creator + brand/org tool surfaces.
const BRAND_ORG_TYPES: OrgType[] = ['BRAND', 'BUSINESS', 'LABEL', 'STUDIO', 'PUBLISHER', 'REALTY', 'RESTAURANT', 'CLUB'];
const accountTypeForOrg = (orgType: OrgType): AccountType =>
  BRAND_ORG_TYPES.includes(orgType) ? 'BRAND' : 'ORGANIZATION';

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

// ── Business-page launch ──────────────────────────────────────────────────────
// "Launch a business page" from a native template: provisions the Organization backbone,
// seeds the template's delegated roles, and (optionally) spins up a club + merch store.
// Business capability is OFF by default — nothing here runs until the user launches.

export interface LaunchBusinessOptions {
  name: string;
  about?: string;
  logoUrl?: string;
  coverUrl?: string;
  createClub?: boolean;
  enableStore?: boolean;
  /** For the custom template, roles the owner defined inline. */
  customRoles?: Organization['roleDefs'];
}

export async function launchBusinessPage(
  templateId: string,
  opts: LaunchBusinessOptions,
): Promise<BrandActivationResult & { template: string }> {
  const template = getTemplate(templateId);
  if (!template) return { organization: null, club: null, storeEnabled: false, error: 'Unknown business template', template: templateId };

  const roleDefs = (template.isCustom && opts.customRoles?.length ? opts.customRoles : template.defaultRoles) as Organization['roleDefs'];

  const result = await activateBrand({
    name: opts.name,
    orgType: template.orgType,
    about: opts.about,
    category: template.label,
    logoUrl: opts.logoUrl,
    coverUrl: opts.coverUrl,
    createClub: opts.createClub,
    enableStore: opts.enableStore,
  });

  // Stamp the template identity + delegated roles onto the org so the employee/roster
  // tools know which roles this business delegates.
  if (result.organization) {
    try {
      await updateOrganization(result.organization.id, {
        templateId: template.id,
        roleDefs,
        accentColor: template.accentColor,
        isBusinessPage: true,
      });
      result.organization = { ...result.organization, templateId: template.id, roleDefs, accentColor: template.accentColor, isBusinessPage: true };
    } catch { /* non-fatal — page still provisioned */ }
  }

  return { ...result, template: template.id };
}

/**
 * Turn an existing brand/org (e.g. one created via activateBrand or migrated from a legacy
 * BrandAccount) into a full business page by stamping a template + its delegated roles onto it.
 * Non-destructive — keeps the org's existing identity, community and store.
 */
export async function upgradeBrandToBusiness(orgId: string, templateId: string): Promise<{ ok: boolean; error?: string }> {
  const template = getTemplate(templateId);
  if (!template) return { ok: false, error: 'Unknown business template' };
  try {
    await updateOrganization(orgId, {
      templateId: template.id,
      roleDefs: template.defaultRoles as Organization['roleDefs'],
      accentColor: template.accentColor,
      isBusinessPage: true,
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Upgrade failed' };
  }
}
