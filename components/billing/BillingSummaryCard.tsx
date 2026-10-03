import React from 'react';
import type { BillingEntityRef } from '../../types';
import { useBillingSummary } from '../../services/billingService';
import { BillingGate } from './BillingGate';
import { SkeletonRows, label, money, card } from './ui';

const Inner: React.FC<{ entity: BillingEntityRef; onOpen?: () => void }> = ({ entity, onOpen }) => {
  const { summary: s, loading } = useBillingSummary(entity);
  if (loading) return <SkeletonRows rows={1} />;
  return (
    <div className={`${card} p-5`}>
      <div className="flex items-center justify-between mb-3"><p className="text-[10px] font-black uppercase tracking-widest text-small-orange">Invoices</p>{onOpen && <button onClick={onOpen} className="text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white">Open billing →</button>}</div>
      <dl className="grid grid-cols-3 gap-3">
        <div><dt className={label}>Outstanding</dt><dd className="text-lg font-black text-white tabular-nums">{money(s.outstanding)}</dd></div>
        <div><dt className={label}>Overdue</dt><dd className={`text-lg font-black tabular-nums ${s.overdue > 0 ? 'text-red-400' : 'text-white'}`}>{s.overdue > 0 ? '⚠ ' : ''}{money(s.overdue)}</dd></div>
        <div><dt className={label}>Paid this month</dt><dd className="text-lg font-black text-green-400 tabular-nums">{money(s.paidThisMonth)}</dd></div>
      </dl>
    </div>
  );
};

/** Embeddable: outstanding / overdue / paid-this-month. Gated (Coming soon / Connect Stripe / real numbers). */
export const BillingSummaryCard: React.FC<{ entity: BillingEntityRef; canManage?: boolean; onOpen?: () => void }> = ({ entity, canManage, onOpen }) => (
  <BillingGate entity={entity} flag="INVOICES" feature="Invoices" canManage={canManage} compact><Inner entity={entity} onOpen={onOpen} /></BillingGate>
);
export default BillingSummaryCard;
