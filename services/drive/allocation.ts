// services/drive/allocation.ts — how much space a person or org has, how it is split, and whether
// an upload may go ahead. Pure; the server signs the B2 upload only after `checkUpload` says yes,
// and the signed URL pins Content-Length, so the quota is enforced, not advisory.
//
// Rules (owner direction):
//   • going over never deletes anything — files stay readable and downloadable;
//   • over quota blocks new uploads, after a 14-day grace that allows up to 10% over
//     (so a failed card renewal or a downgrade doesn't stop someone mid-project);
//   • trash counts toward usage for its 30 days;
//   • org admins split a pool with caps per department and per member. Caps are limits, not
//     reservations, so they may add up to more than the pool (warned, not refused).

import { INCLUDED_BYTES, MAX_FILE_BYTES, addOnBySku, POOL_EXTRA_TB_USD, TiB, type DrivePlan } from './plans';

export const WARN_AT = 0.9;
export const GRACE_DAYS = 14;
export const GRACE_OVERAGE = 0.1;
export const TRASH_DAYS = 30;
const DAY = 86_400_000;

export interface PersonalAccount { plan: DrivePlan; addOnSkus: string[] }

export function personalAllowance(a: PersonalAccount): number {
  return INCLUDED_BYTES[a.plan] + a.addOnSkus.reduce((t, s) => {
    const add = addOnBySku(s);
    return t + (add?.scope === 'personal' ? add.bytes : 0);
  }, 0);
}

export interface OrgPool {
  /** Team plan the org is on, if any (its included pool counts). */
  plan?: DrivePlan;
  poolSkus: string[];
  /** Extra TB beyond the largest pool SKU, billed at POOL_EXTRA_TB_USD each. */
  extraTb?: number;
  departmentCaps: Record<string, number>;
  memberCaps: Record<string, number>;
}

export function orgPoolBytes(o: OrgPool): number {
  const base = o.plan ? INCLUDED_BYTES[o.plan] : 0;
  const skus = o.poolSkus.reduce((t, s) => {
    const add = addOnBySku(s);
    return t + (add?.scope === 'org' ? add.bytes : 0);
  }, 0);
  return base + skus + Math.max(0, Math.floor(o.extraTb ?? 0)) * TiB;
}

export const orgExtraCostUsd = (o: OrgPool) => Math.max(0, Math.floor(o.extraTb ?? 0)) * POOL_EXTRA_TB_USD;

export interface AllocationWarning { kind: 'departments_over_pool' | 'member_over_pool' | 'member_over_department'; detail: string }

/** Sanity-check an admin's split. Never refuses — caps may overcommit — only explains. */
export function reviewAllocation(o: OrgPool, memberDept: Record<string, string> = {}): AllocationWarning[] {
  const pool = orgPoolBytes(o);
  const w: AllocationWarning[] = [];
  const deptSum = Object.values(o.departmentCaps).reduce((a, b) => a + b, 0);
  if (deptSum > pool) w.push({ kind: 'departments_over_pool', detail: `department caps total ${fmt(deptSum)} of a ${fmt(pool)} pool` });
  for (const [m, cap] of Object.entries(o.memberCaps)) {
    if (cap > pool) w.push({ kind: 'member_over_pool', detail: `${m}: ${fmt(cap)} > pool ${fmt(pool)}` });
    const d = memberDept[m];
    if (d && o.departmentCaps[d] !== undefined && cap > o.departmentCaps[d]) {
      w.push({ kind: 'member_over_department', detail: `${m}: ${fmt(cap)} > ${d} cap ${fmt(o.departmentCaps[d])}` });
    }
  }
  return w;
}

export type QuotaState = 'ok' | 'warn' | 'grace' | 'blocked';

export interface Usage {
  liveBytes: number;
  trashBytes: number;
  /** When usage first went over the allowance (cleared when back under). */
  overSince?: number;
}

export const usedBytes = (u: Usage) => u.liveBytes + u.trashBytes;

export function quotaState(u: Usage, allowance: number, now: number): QuotaState {
  const used = usedBytes(u);
  if (used <= allowance * WARN_AT) return 'ok';
  if (used <= allowance) return 'warn';
  const inGrace = u.overSince !== undefined && now - u.overSince < GRACE_DAYS * DAY;
  return inGrace && used <= allowance * (1 + GRACE_OVERAGE) ? 'grace' : 'blocked';
}

export type UploadDenial = 'too_large' | 'over_quota' | 'department_cap' | 'member_cap';

export interface UploadCheck {
  size: number;
  plan: DrivePlan;
  /** Usage of the pool the file lands in (personal drive or org pool). */
  usage: Usage;
  allowance: number;
  /** Org uploads: the member's and department's current usage and caps. */
  member?: { used: number; cap?: number };
  department?: { used: number; cap?: number };
  now: number;
}

export function checkUpload(c: UploadCheck): { ok: true; reason?: undefined; state: QuotaState } | { ok: false; reason: UploadDenial; state: QuotaState } {
  const state = quotaState(c.usage, c.allowance, c.now);
  if (c.size <= 0 || c.size > MAX_FILE_BYTES[c.plan]) return { ok: false, reason: 'too_large', state };
  const after: Usage = { ...c.usage, liveBytes: c.usage.liveBytes + c.size, overSince: c.usage.overSince ?? (usedBytes(c.usage) + c.size > c.allowance ? c.now : undefined) };
  const afterState = quotaState(after, c.allowance, c.now);
  if (afterState === 'blocked') return { ok: false, reason: 'over_quota', state };
  if (c.department?.cap !== undefined && c.department.used + c.size > c.department.cap) return { ok: false, reason: 'department_cap', state };
  if (c.member?.cap !== undefined && c.member.used + c.size > c.member.cap) return { ok: false, reason: 'member_cap', state };
  return { ok: true, state: afterState };
}

/** Bytes a trashed file stops counting on (purged by the lifecycle job). */
export const trashPurgeAt = (trashedAt: number) => trashedAt + TRASH_DAYS * DAY;

function fmt(bytes: number): string {
  if (bytes >= TiB) return `${(bytes / TiB).toFixed(1)} TB`;
  return `${Math.round(bytes / 1024 ** 3)} GB`;
}
