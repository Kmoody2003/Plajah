// BillingHub — the whole Plajah Billing surface for one entity (USER / ORG / BUSINESS / PRODUCTION).
// Every tab is wrapped in its own BillingGate; tabs for OFF features stay visible as locked "Coming soon".
import React, { useState } from 'react';
import { Lock, X, LayoutDashboard, FileText, ClipboardList, Link2, Users, BookOpen, Landmark, Settings, ArrowLeft } from 'lucide-react';
import type { BillingEntityRef, BillingFlagKey } from '../../types';
import { useBillingFlags } from '../../services/billingFlags';
import { useBillingSummary } from '../../services/billingService';
import { BillingGate } from './BillingGate';
import { BillingSettingsTab } from './BillingSettingsTab';
import { BalanceTab } from './BalanceTab';
import { CustomersTab } from './CustomersTab';
import { EstimatesTab } from './EstimatesTab';
import { InvoicesTab } from './InvoicesTab';
import { PaymentLinksTab } from './PaymentLinksTab';
import { PriceBookTab } from './PriceBookTab';
import { InvoiceQuickCreate } from './InvoiceQuickCreate';
import { Stat, ToastProvider, card, label, money } from './ui';

type TabId = 'overview' | 'invoices' | 'estimates' | 'links' | 'customers' | 'pricebook' | 'balance' | 'settings';
const TABS: { id: TabId; label: string; flag?: BillingFlagKey; Icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { id: 'invoices', label: 'Invoices', flag: 'INVOICES', Icon: FileText },
  { id: 'estimates', label: 'Estimates', flag: 'ESTIMATES', Icon: ClipboardList },
  { id: 'links', label: 'Pay links', flag: 'PAYMENT_LINKS', Icon: Link2 },
  { id: 'customers', label: 'Customers', flag: 'CUSTOMERS', Icon: Users },
  { id: 'pricebook', label: 'Price book', flag: 'PRICE_BOOK', Icon: BookOpen },
  { id: 'balance', label: 'Balance', flag: 'BALANCE_DASHBOARD', Icon: Landmark },
  { id: 'settings', label: 'Settings', Icon: Settings },
];

const Overview: React.FC<{ entity: BillingEntityRef; canManage: boolean; go: (t: TabId) => void }> = ({ entity, canManage, go }) => {
  const { summary: s } = useBillingSummary(entity);
  return (
    <div className="space-y-5">
      <BillingGate entity={entity} flag="INVOICES" feature="Invoices" canManage={canManage} compact>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Outstanding" value={money(s.outstanding)} sub={`${s.openCount} open invoice${s.openCount === 1 ? '' : 's'}`} />
          <Stat label="Overdue" value={`${s.overdue > 0 ? '⚠ ' : ''}${money(s.overdue)}`} tone={s.overdue > 0 ? 'bad' : undefined} sub={s.overdueCount ? `${s.overdueCount} late — send a reminder` : 'Nothing late'} />
          <Stat label="Paid this month" value={money(s.paidThisMonth)} />
          <button onClick={() => go('invoices')} className="text-left"><Stat label="Drafts" value={String(s.draftCount)} sub={s.draftCount ? 'Finish and send →' : 'All caught up'} /></button>
        </div>
      </BillingGate>
      <div><p className={label + ' mb-2'}>Balance</p>
        <BillingGate entity={entity} flag="BALANCE_DASHBOARD" feature="Balance & payouts" canManage={canManage} compact><BalanceTab entity={entity} compact /></BillingGate></div>
    </div>
  );
};

export const BillingHub: React.FC<{ entity: BillingEntityRef; entityName: string; canManage: boolean; accounting?: boolean; logoUrl?: string; onClose?: () => void }> = ({ entity, entityName, canManage, accounting, logoUrl, onClose }) => {
  const flags = useBillingFlags();
  const [tab, setTab] = useState<TabId>('overview');
  const [cust, setCust] = useState<string | undefined>();
  const locked = (f?: BillingFlagKey) => !!f && !flags.enabled(f) && !flags.preview(f);
  const g = (flag: BillingFlagKey, node: React.ReactNode, needsStripe = true, feature?: string) => <BillingGate entity={entity} flag={flag} feature={feature} needsStripe={needsStripe} canManage={canManage}>{node}</BillingGate>;
  const sync = flags.enabled('ACCOUNTING_SYNC') || flags.preview('ACCOUNTING_SYNC');

  return (
    <ToastProvider>
      <div className="space-y-4" data-billing-hub>
        <header className="flex items-center gap-3">
          {onClose && <button onClick={onClose} aria-label="Back" className="p-2 -ml-2 text-white/50 hover:text-white"><ArrowLeft size={16} /></button>}
          <div className="flex-1 min-w-0"><p className="text-[10px] font-black uppercase tracking-widest text-small-orange">Plajah Billing</p><h2 className="text-lg font-black text-white truncate">{entityName}</h2></div>
          <InvoiceQuickCreate entity={entity} entityName={entityName} logoUrl={logoUrl} canManage={canManage} />
          {onClose && <button onClick={onClose} aria-label="Close" className="p-2 text-white/40 hover:text-white hidden sm:block"><X size={16} /></button>}
        </header>
        {!canManage && <p className={`${card} px-4 py-2.5 text-[11px] text-white/50`}>You have view-only access to billing for this account.</p>}
        <nav className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label="Billing sections">
          {TABS.map(t => { const lk = locked(t.flag); const active = tab === t.id; return (
            <button key={t.id} role="tab" aria-selected={active} onClick={() => setTab(t.id)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${active ? 'bg-small-orange text-black border-small-orange' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'} ${lk && !active ? 'opacity-60' : ''}`}>
              {lk ? <Lock size={11} aria-label="Coming soon" /> : <t.Icon size={12} />}{t.label}{lk && <span className="sr-only"> (coming soon)</span>}
            </button>); })}
        </nav>
        <div role="tabpanel">
          {tab === 'overview' && <Overview entity={entity} canManage={canManage} go={setTab} />}
          {tab === 'invoices' && g('INVOICES', <InvoicesTab key={cust || 'all'} entity={entity} entityName={entityName} logoUrl={logoUrl} canManage={canManage} presetCustomerId={cust} />)}
          {tab === 'estimates' && g('ESTIMATES', <EstimatesTab entity={entity} entityName={entityName} logoUrl={logoUrl} canManage={canManage} onConverted={() => setTab('invoices')} />)}
          {tab === 'links' && g('PAYMENT_LINKS', <PaymentLinksTab entity={entity} canManage={canManage} />)}
          {tab === 'customers' && g('CUSTOMERS', <CustomersTab entity={entity} canManage={canManage} onInvoice={id => { setCust(id); setTab('invoices'); }} />, false)}
          {tab === 'pricebook' && g('PRICE_BOOK', <PriceBookTab entity={entity} canManage={canManage} />, false)}
          {tab === 'balance' && g('BALANCE_DASHBOARD', <BalanceTab entity={entity} />)}
          {tab === 'settings' && <div className="space-y-4">
            {accounting && sync && <p className={`${card} px-4 py-3 text-[11px] text-white/60`}>Books sync is on — invoices and payments post to your Elevate books automatically.</p>}
            <BillingSettingsTab entity={entity} entityName={entityName} canManage={canManage} /></div>}
        </div>
      </div>
    </ToastProvider>
  );
};
export default BillingHub;
