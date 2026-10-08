/**
 * "Go live in 15 minutes" progress. Pure: feed it a snapshot of the business, get the checklist state.
 * Steps are auto-detected from real data wherever possible; the owner can also tick any step by hand
 * (stored in BusinessPage.packManualDone) for things we cannot observe (state age rules, rooms noted ...).
 */
import type { ChecklistStep, DetectorId, VerticalPack, DayHours } from './types';
import { isUsable } from './capabilities';

export interface BusinessSnapshot {
  page: {
    subtype?: string; packId?: string; address?: string; city?: string; phone?: string; logoUrl?: string;
    hours?: Record<string, DayHours>; stripeAccountId?: string; isPublic?: boolean; rewardsEnabled?: boolean;
    packManualDone?: string[];
  };
  productCount: number;
  /** Products carrying isSample/packSampleId. */
  sampleCount: number;
  /** Samples the owner has edited since seeding (updatedAt well after createdAt). */
  editedSampleCount: number;
  activeOfferCount: number;
  orderCount: number;
  contactCount: number;
  staffCount: number;
  slideCount: number;
}

export const emptySnapshot = (page: BusinessSnapshot['page'] = {}): BusinessSnapshot => ({
  page, productCount: 0, sampleCount: 0, editedSampleCount: 0, activeOfferCount: 0, orderCount: 0, contactCount: 0, staffCount: 0, slideCount: 0,
});

const sameHours = (a?: Record<string, DayHours>, b?: Record<string, DayHours>): boolean => {
  if (!a || !b) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const x = a[k], y = b[k];
    if (!x || !y) return false;
    if (!!x.closed !== !!y.closed) return false;
    if (!x.closed && (x.open !== y.open || x.close !== y.close)) return false;
  }
  return true;
};

type Detector = (s: BusinessSnapshot, pack: VerticalPack) => boolean;

export const DETECTORS: Record<DetectorId, Detector> = {
  PACK_APPLIED: (s, p) => s.page.subtype === p.id || s.page.packId === p.id,
  HAS_ADDRESS: s => Boolean(s.page.address?.trim() && s.page.city?.trim() && s.page.phone?.trim()),
  // Pack defaults are a guess; only count hours the owner changed (or confirmed by ticking the step).
  HAS_HOURS: (s, p) => Boolean(s.page.hours && Object.keys(s.page.hours).length) && !sameHours(s.page.hours, p.defaultHours),
  HAS_CONTACT: s => Boolean(s.page.phone?.trim()),
  HAS_LOGO: s => Boolean(s.page.logoUrl),
  CATALOG_REVIEWED: s => s.productCount > 0 && (s.sampleCount === 0 || s.editedSampleCount > 0),
  OWN_ITEM_ADDED: s => s.productCount - s.sampleCount > 0,
  STRIPE_CONNECTED: s => Boolean(s.page.stripeAccountId),
  FIRST_SALE: s => s.orderCount > 0,
  DEAL_ACTIVE: s => s.activeOfferCount > 0,
  LOYALTY_ON: s => Boolean(s.page.rewardsEnabled),
  PAGE_PUBLIC: s => Boolean(s.page.isPublic),
  STAFF_ADDED: s => s.staffCount > 0,
  CUSTOMER_ADDED: s => s.contactCount > 0,
  SIGNAGE_SLIDE: s => s.slideCount > 0,
};

export type StepState = 'done' | 'todo' | 'soon';

export interface StepProgress extends ChecklistStep {
  state: StepState;
  /** 'auto' = observed in data, 'manual' = ticked by the owner, null = not done. */
  source: 'auto' | 'manual' | null;
  /** Counts toward "live". Optional steps and coming-soon steps do not. */
  required: boolean;
}

export interface ChecklistProgress {
  steps: StepProgress[];
  requiredTotal: number;
  requiredDone: number;
  /** 0-100 over required steps. */
  percent: number;
  minutesLeft: number;
  minutesTotal: number;
  /** All required steps done. */
  live: boolean;
  next: StepProgress | null;
}

export function computeChecklist(pack: VerticalPack, snap: BusinessSnapshot): ChecklistProgress {
  const manual = new Set(snap.page.packManualDone ?? []);
  const steps: StepProgress[] = pack.checklist.map(step => {
    if (step.requires && !isUsable(step.requires)) {
      return { ...step, state: 'soon' as const, source: null, required: false };
    }
    const auto = step.detect !== 'MANUAL' && DETECTORS[step.detect](snap, pack);
    const ticked = manual.has(step.id);
    const done = auto || ticked;
    return {
      ...step,
      state: done ? 'done' as const : 'todo' as const,
      source: auto ? 'auto' as const : ticked ? 'manual' as const : null,
      required: !step.optional,
    };
  });
  const req = steps.filter(s => s.required);
  const requiredDone = req.filter(s => s.state === 'done').length;
  const minutesLeft = req.filter(s => s.state !== 'done').reduce((n, s) => n + s.minutes, 0);
  const minutesTotal = req.reduce((n, s) => n + s.minutes, 0);
  return {
    steps,
    requiredTotal: req.length,
    requiredDone,
    percent: req.length ? Math.round((requiredDone / req.length) * 100) : 100,
    minutesLeft,
    minutesTotal,
    live: req.length > 0 && requiredDone === req.length,
    next: steps.find(s => s.required && s.state === 'todo') ?? null,
  };
}
