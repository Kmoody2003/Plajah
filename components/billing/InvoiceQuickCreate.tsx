import React, { useState } from 'react';
import { FilePlus2 } from 'lucide-react';
import type { BillingEntityRef } from '../../types';
import { useBillingFlags } from '../../services/billingFlags';
import { useBillingConnection } from '../../services/billingService';
import { InvoiceComposer } from './InvoiceComposer';
import { ConnectStripeCard } from './ConnectStripeCard';
import { Sheet, ToastProvider, btnPrimary } from './ui';

/**
 * Embeddable "New invoice" button. Hidden while INVOICES is OFF (unless admin preview); if Stripe isn't ready,
 * tapping it opens the one-tap Connect card instead of the composer.
 */
export const InvoiceQuickCreate: React.FC<{
  entity: BillingEntityRef; entityName: string; logoUrl?: string; canManage?: boolean; presetCustomerId?: string;
  label?: string; className?: string; mode?: 'invoice' | 'estimate';
}> = ({ entity, entityName, logoUrl, canManage = true, presetCustomerId, label = 'New invoice', className, mode = 'invoice' }) => {
  const flags = useBillingFlags(); const flag = mode === 'estimate' ? 'ESTIMATES' : 'INVOICES';
  const visible = flags.enabled(flag) || flags.preview(flag);
  const c = useBillingConnection(entity, { enabled: visible && canManage });
  const [open, setOpen] = useState(false);
  if (!visible || !canManage) return null;
  return (
    <ToastProvider>
      <button onClick={() => setOpen(true)} className={className || btnPrimary}><FilePlus2 size={13} /> {label}</button>
      {open && (c.ready
        ? <InvoiceComposer mode={mode} entity={entity} entityName={entityName} logoUrl={logoUrl} presetCustomerId={presetCustomerId} onDone={() => setOpen(false)} onCancel={() => setOpen(false)} />
        : <Sheet title="Set up payments" onClose={() => setOpen(false)}><ConnectStripeCard feature={mode === 'estimate' ? 'estimates' : 'invoices'} conn={c.conn} error={c.error} onConnect={c.connect} onRecheck={() => c.refresh(true)} /></Sheet>)}
    </ToastProvider>
  );
};
export default InvoiceQuickCreate;
