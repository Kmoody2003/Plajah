import type { Organization, PlajahPlusSubscription, UserProfile } from '../types';

export type ContentHqPlan = 'FREE' | 'PLAJAH_PLUS_PRO' | 'ORGANIZATION_PRO';

export interface ContentHqEntitlements {
  plan: ContentHqPlan;
  unlimitedProjects: true;
  storageLimitGb: number;
  collaboration: boolean;
  versions: boolean;
  approvals: boolean;
  externalReviewLinks: boolean;
  customBranding: boolean;
  organizationControls: boolean;
  brandSource: 'USER_PROFILE' | 'ORGANIZATION';
}

/**
 * Product contract for Content HQ. Projects are deliberately unlimited on every tier.
 * Business/org identities get Pro by virtue of the identity. A regular user receives
 * Pro collaboration while Plajah+ is active, but keeps that subscription's storage cap,
 * their profile branding, and never receives organization-only controls.
 */
export function resolveContentHqEntitlements(input: {
  profile?: Pick<UserProfile, 'storageLimit' | 'tier'> | null;
  subscription?: Pick<PlajahPlusSubscription, 'status' | 'storageLimitGb'> | null;
  organization?: Pick<Organization, 'id' | 'orgType' | 'isBusinessPage'> | null;
}): ContentHqEntitlements {
  if (input.organization) {
    return {
      plan: 'ORGANIZATION_PRO', unlimitedProjects: true, storageLimitGb: 250,
      collaboration: true, versions: true, approvals: true, externalReviewLinks: true,
      customBranding: false, organizationControls: true, brandSource: 'ORGANIZATION',
    };
  }

  const active = !!input.subscription && ['active', 'trialing', 'past_due'].includes(input.subscription.status);
  if (active) {
    return {
      plan: 'PLAJAH_PLUS_PRO', unlimitedProjects: true,
      storageLimitGb: Math.max(0, Number(input.subscription!.storageLimitGb || 0)),
      collaboration: true, versions: true, approvals: true, externalReviewLinks: true,
      customBranding: false, organizationControls: false, brandSource: 'USER_PROFILE',
    };
  }

  const bytes = Number(input.profile?.storageLimit || 0);
  return {
    plan: 'FREE', unlimitedProjects: true,
    storageLimitGb: bytes > 0 ? bytes / (1024 ** 3) : 5,
    collaboration: false, versions: false, approvals: false, externalReviewLinks: false,
    customBranding: false, organizationControls: false, brandSource: 'USER_PROFILE',
  };
}

