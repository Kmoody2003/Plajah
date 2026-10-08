/** Small builders shared by pack manifests. Pure. */
import type { ChecklistStep, DayHours, OrgRoleDef, SignageIdea } from '../types';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type Day = typeof DAYS[number];

/** Build a full week. `overrides` replaces single days; pass {closed:true,...} for closed days. */
export function week(weekday: [string, string], overrides: Partial<Record<Day, DayHours | 'closed'>> = {}): Record<string, DayHours> {
  const out: Record<string, DayHours> = {};
  for (const d of DAYS) {
    const o = overrides[d];
    if (o === 'closed') out[d] = { open: '00:00', close: '00:00', closed: true };
    else out[d] = o ?? { open: weekday[0], close: weekday[1] };
  }
  return out;
}

export const ownerRole = (label = 'Owner'): OrgRoleDef =>
  ({ key: 'OWNER', label, baseRole: 'OWNER', description: 'Full control of the business, payouts and settings.' });

export const managerRole = (label = 'Manager', description = 'Runs the floor, edits the catalog and schedules, sees reports.'): OrgRoleDef =>
  ({ key: 'MANAGER', label, baseRole: 'ADMIN', description });

/** The universal "Go live in 15 minutes" spine. Packs insert their own steps via `extra`. */
export function goLiveSteps(opts: {
  catalogNoun: string;
  extra?: ChecklistStep[];
  /** Where extra steps go: before the payments step by default. */
  testSaleLabel?: string;
}): ChecklistStep[] {
  const { catalogNoun, extra = [], testSaleLabel = 'Ring up a test sale' } = opts;
  return [
    { id: 'apply_pack', label: 'Pick your business type', detail: 'Starter catalog, hours, deals and roles are set up for you.', minutes: 1, detect: 'PACK_APPLIED' },
    { id: 'confirm_address', label: 'Confirm address and phone', detail: 'Customers find you, and receipts show it.', minutes: 2, detect: 'HAS_ADDRESS', tab: 'SETTINGS' },
    { id: 'confirm_hours', label: 'Check your hours', detail: 'We filled in typical hours. Adjust for your door.', minutes: 1, detect: 'HAS_HOURS', tab: 'SETTINGS' },
    { id: 'review_catalog', label: `Review the sample ${catalogNoun.toLowerCase()}`, detail: 'Edit any price or delete what you do not carry. Samples are tagged so you can remove them all at once.', minutes: 3, detect: 'CATALOG_REVIEWED', tab: 'INVENTORY' },
    ...extra,
    { id: 'connect_payments', label: 'Connect payments', detail: 'Stripe Connect, so card sales settle straight to your bank.', minutes: 3, detect: 'STRIPE_CONNECTED', tab: 'SETTINGS' },
    { id: 'test_sale', label: testSaleLabel, detail: 'Use the register once end to end so the first real customer is easy.', minutes: 2, detect: 'FIRST_SALE', tab: 'ORDERS' },
    { id: 'go_public', label: 'Publish your page', detail: 'Turn on your public page so customers can see you on Plajah.', minutes: 1, detect: 'PAGE_PUBLIC', tab: 'SETTINGS' },
    { id: 'add_own_item', label: `Add one of your own ${catalogNoun.toLowerCase()}`, detail: 'Photo-first editor, about a minute.', minutes: 2, detect: 'OWN_ITEM_ADDED', tab: 'INVENTORY', optional: true },
    { id: 'add_staff', label: 'Invite a teammate', detail: 'Give them a role with just the access they need.', minutes: 2, detect: 'STAFF_ADDED', tab: 'TEAM', optional: true },
  ];
}

export const slide = (headline: string, subtext: string, bg = '#1a0033'): SignageIdea => ({ headline, subtext, bg });
