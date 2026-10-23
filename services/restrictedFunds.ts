// restrictedFunds — PURE guardrails for donor-restricted money (no Firestore, no React).
//
// Donor-restricted gifts (building, missions, benevolence…) may only be spent on the donor's purpose, and a
// church can't "borrow" them for payroll — in many states that's a breach of fiduciary duty. Board-designated
// funds are different: the board can release them. These checks are what the Finance Hub enforces:
//  • spending coded to a restricted fund can't exceed that fund's balance in the books;
//  • a transfer OUT of a restricted fund is a release, allowed only when the finance user confirms the donor's
//    purpose has been met, and never for more than the fund holds;
//  • a restricted fund that still holds money can't be quietly flipped to unrestricted.
import type { GivingFund } from '../types';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const usd = (n: number) => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type FundBalances = Map<string, number>;

export interface Overdraw { fundId: string; fundName: string; available: number; short: number }

/** Spending `amount` from `fundId` would push a donor-restricted fund below zero → the shortfall; else null.
 *  Unrestricted funds, uncoded spending and unknown balances return null (nothing to protect / no data). */
export function restrictedOverdraw(funds: GivingFund[], balances: FundBalances | undefined, fundId: string | undefined, amount: number): Overdraw | null {
  if (!fundId || !balances) return null;
  const f = funds.find(x => x.id === fundId);
  if (!f?.restricted) return null;
  const available = r2(balances.get(fundId) ?? 0);
  const short = r2(amount - available);
  return short > 0.004 ? { fundId, fundName: f.name, available, short } : null;
}

export const overdrawMessage = (o: Overdraw): string =>
  `${o.fundName} is donor-restricted and only holds ${usd(Math.max(0, o.available))} — this would overspend it by ${usd(o.short)}. ` +
  'Restricted gifts can’t be borrowed for other costs. Code this to an unrestricted fund, or wait until more restricted gifts arrive.';

export interface TransferCheckInput { from: GivingFund; to: GivingFund; amount: number; fromBalance: number; purposeMet: boolean }
/** Error text for a fund transfer that breaks a donor restriction, or null when it's allowed. */
export function checkTransfer(i: TransferCheckInput): string | null {
  if (!i.from.restricted) return null;
  if (!i.purposeMet) return `${i.from.name} is donor-restricted. Moving money out of it is a release — confirm the donor’s purpose has been met (for example, the project it was given for is paid for) before recording it.`;
  if (r2(i.amount) > r2(i.fromBalance) + 0.004) return `${i.from.name} only holds ${usd(Math.max(0, i.fromBalance))}; a release can’t be larger than the fund.`;
  return null;
}

/** Changes to the fund list that would hide restricted money; null when the change is safe. */
export function checkFundListChange(prev: GivingFund[], next: GivingFund[], balanceOf: (fundId: string) => number): string | null {
  const nextById = new Map(next.map(f => [f.id, f]));
  for (const p of prev) {
    if (!p.restricted) continue;
    const bal = r2(balanceOf(p.id));
    if (bal <= 0.004) continue;
    const n = nextById.get(p.id);
    if (!n) return `${p.name} is donor-restricted and still holds ${usd(bal)}, so it can’t be removed. Spend or release it first, or mark it inactive.`;
    if (!n.restricted) return `${p.name} still holds ${usd(bal)} of donor-restricted gifts. A donor restriction can’t be lifted by unticking it — record a release (transfer) once the donor’s purpose is met, then change it.`;
  }
  return null;
}

/** Merge an edited fund list onto the latest saved list: keeps funds someone else added meanwhile
 *  (present in `latest`, absent from the `base` the editor started from), so two editors can't erase each other's funds. */
export function mergeFundLists(base: GivingFund[], edited: GivingFund[], latest: GivingFund[]): GivingFund[] {
  const known = new Set([...base, ...edited].map(f => f.id));
  return [...edited, ...latest.filter(f => !known.has(f.id))];
}
