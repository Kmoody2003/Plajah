// businessTemplates — native business-page templates + their predefined roles.
//
// Each template maps to an OrgType (the Organization backbone) and ships the roles that
// industry actually uses, pre-wired to a base OrgRole (permission tier, see orgPermissions.ts)
// so a business owner can delegate real, scoped roles to employees out of the box.
//
// Pure data (no React) so services and UI can both consume it. `icon` is a lucide icon
// name the picker maps to a component.

import type { OrgType, OrgRole, OrgPermission } from '../types';

export interface OrgRoleDef {
  key: string;            // stable id stored on OrgMembership.roleKey (e.g. "AR", "CHEF")
  label: string;          // human label shown on the badge / roster
  baseRole: OrgRole;      // permission tier this role maps to
  description: string;
  /** Optional explicit permission override; when omitted, baseRole defaults apply. */
  permissions?: OrgPermission[];
}

export interface BusinessTemplate {
  id: string;
  orgType: OrgType;
  label: string;
  icon: string;           // lucide icon name
  blurb: string;
  accentColor: string;    // seeds Organization.accentColor
  defaultRoles: OrgRoleDef[];
  pageSections: string[]; // which public sections the page renders by default
  isCustom?: boolean;
}

const owner = (label: string, description: string): OrgRoleDef =>
  ({ key: 'OWNER', label, baseRole: 'OWNER', description });

export const BUSINESS_TEMPLATES: BusinessTemplate[] = [
  {
    id: 'record_label',
    orgType: 'LABEL',
    label: 'Record Label',
    icon: 'Disc3',
    blurb: 'Sign artists, coordinate releases, and run your label as a business.',
    accentColor: '#7C3AED',
    pageSections: ['roster', 'releases', 'about', 'contact'],
    defaultRoles: [
      owner('Label Owner', 'Full control of the label.'),
      { key: 'AR', label: 'A&R', baseRole: 'ADMIN', description: 'Scouts and signs artists; manages the roster.' },
      { key: 'DISTRO', label: 'Distribution Manager', baseRole: 'ADMIN', description: 'Manages releases and distribution.' },
      { key: 'PRODUCER', label: 'Producer', baseRole: 'STAFF', description: 'Produces records for the label.' },
      { key: 'MARKETING', label: 'Marketing / Promo', baseRole: 'STAFF', description: 'Runs campaigns and promo.' },
      { key: 'PUBLICIST', label: 'Publicist', baseRole: 'STAFF', description: 'Press and public relations.' },
      { key: 'ARTIST', label: 'Signed Artist', baseRole: 'MEMBER', description: 'An artist on the label.' },
    ],
  },
  {
    id: 'film_studio',
    orgType: 'STUDIO',
    label: 'Film Studio',
    icon: 'Clapperboard',
    blurb: 'Develop, produce, and distribute film & series with a full crew.',
    accentColor: '#DC2626',
    pageSections: ['productions', 'crew', 'about', 'contact'],
    defaultRoles: [
      owner('Studio Head', 'Full control of the studio.'),
      { key: 'PRODUCER', label: 'Producer', baseRole: 'ADMIN', description: 'Greenlights and oversees productions.' },
      { key: 'DIRECTOR', label: 'Director', baseRole: 'STAFF', description: 'Directs a production.' },
      { key: 'EDITOR', label: 'Editor', baseRole: 'STAFF', description: 'Cuts and finishes projects.' },
      { key: 'DP', label: 'Cinematographer', baseRole: 'STAFF', description: 'Director of photography.' },
      { key: 'COORD', label: 'Production Coordinator', baseRole: 'STAFF', description: 'Coordinates schedules and logistics.' },
      { key: 'CAST', label: 'Cast', baseRole: 'MEMBER', description: 'Talent attached to a production.' },
    ],
  },
  {
    id: 'publisher',
    orgType: 'PUBLISHER',
    label: 'Publisher',
    icon: 'BookOpen',
    blurb: 'Acquire, edit, and publish books with your editorial team.',
    accentColor: '#0891B2',
    pageSections: ['catalog', 'authors', 'about', 'contact'],
    defaultRoles: [
      owner('Publisher', 'Full control of the imprint.'),
      { key: 'ACQ', label: 'Acquisitions Editor', baseRole: 'ADMIN', description: 'Acquires new titles and authors.' },
      { key: 'RIGHTS', label: 'Rights Manager', baseRole: 'ADMIN', description: 'Handles licensing and rights.' },
      { key: 'EDITOR', label: 'Editor', baseRole: 'STAFF', description: 'Edits manuscripts.' },
      { key: 'MARKETING', label: 'Marketing', baseRole: 'STAFF', description: 'Promotes the catalog.' },
      { key: 'AUTHOR', label: 'Author', baseRole: 'MEMBER', description: 'A published author.' },
    ],
  },
  {
    id: 'real_estate',
    orgType: 'REALTY',
    label: 'Real Estate',
    icon: 'Building2',
    blurb: 'Run a brokerage — list properties and manage your agents.',
    accentColor: '#059669',
    pageSections: ['listings', 'agents', 'about', 'contact'],
    defaultRoles: [
      owner('Broker', 'Full control of the brokerage.'),
      { key: 'MANAGING', label: 'Managing Agent', baseRole: 'ADMIN', description: 'Oversees agents and deals.' },
      { key: 'AGENT', label: 'Agent', baseRole: 'STAFF', description: 'Lists and sells properties.' },
      { key: 'TC', label: 'Transaction Coordinator', baseRole: 'STAFF', description: 'Manages paperwork and closings.' },
      { key: 'MARKETING', label: 'Marketing', baseRole: 'STAFF', description: 'Markets listings.' },
    ],
  },
  {
    id: 'restaurant',
    orgType: 'RESTAURANT',
    label: 'Restaurant',
    icon: 'UtensilsCrossed',
    blurb: 'Menu, orders, and staff — run your restaurant end to end.',
    accentColor: '#EA580C',
    pageSections: ['menu', 'hours', 'gallery', 'contact'],
    defaultRoles: [
      owner('Owner', 'Full control of the restaurant.'),
      { key: 'GM', label: 'General Manager', baseRole: 'ADMIN', description: 'Runs day-to-day operations.' },
      { key: 'CHEF', label: 'Chef', baseRole: 'STAFF', description: 'Runs the kitchen and menu.' },
      { key: 'SERVER', label: 'Server', baseRole: 'STAFF', description: 'Front-of-house service.' },
      { key: 'HOST', label: 'Host', baseRole: 'STAFF', description: 'Seating and reservations.' },
      { key: 'CASHIER', label: 'Cashier', baseRole: 'STAFF', description: 'Handles orders and payments.' },
    ],
  },
  {
    id: 'club',
    orgType: 'CLUB',
    label: 'Club / Venue',
    icon: 'Music',
    blurb: 'Events, promotion, and staff for a club or venue.',
    accentColor: '#DB2777',
    pageSections: ['events', 'gallery', 'about', 'contact'],
    defaultRoles: [
      owner('Owner', 'Full control of the venue.'),
      { key: 'MANAGER', label: 'Manager', baseRole: 'ADMIN', description: 'Runs venue operations.' },
      { key: 'PROMOTER', label: 'Promoter', baseRole: 'STAFF', description: 'Books and promotes events.' },
      { key: 'SECURITY', label: 'Security', baseRole: 'STAFF', description: 'Door and floor security.' },
      { key: 'HOST', label: 'Host', baseRole: 'STAFF', description: 'Guest list and hospitality.' },
      { key: 'DJ', label: 'Resident DJ', baseRole: 'MEMBER', description: 'Performs at the venue.' },
    ],
  },
  {
    id: 'custom',
    orgType: 'OTHER',
    label: 'Custom Business',
    icon: 'Sparkles',
    blurb: 'Start from scratch and define your own roles.',
    accentColor: '#2563EB',
    isCustom: true,
    pageSections: ['about', 'contact'],
    defaultRoles: [
      owner('Owner', 'Full control of the business.'),
      { key: 'MANAGER', label: 'Manager', baseRole: 'ADMIN', description: 'Manages the business and staff.' },
      { key: 'STAFF', label: 'Staff', baseRole: 'STAFF', description: 'A team member.' },
    ],
  },
];

export const getTemplate = (id: string): BusinessTemplate | undefined =>
  BUSINESS_TEMPLATES.find(t => t.id === id);

/** The role definition for a stored roleKey within a template (falls back gracefully). */
export const getRoleDef = (templateId: string | undefined, roleKey: string | undefined): OrgRoleDef | undefined => {
  const t = getTemplate(templateId || '');
  return t?.defaultRoles.find(r => r.key === roleKey);
};
