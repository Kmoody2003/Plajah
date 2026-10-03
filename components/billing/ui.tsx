// Shared bits for Plajah Billing — styling tokens re-exported from the Finance Hub so both surfaces match.
import React, { useEffect } from 'react';
import { X, FileText, Send, CheckCircle2, Clock, Ban, AlertTriangle, CircleDot } from 'lucide-react';
import type { InvoiceStatus, Estimate } from '../../types';
export { card, field, fieldSm, btnPrimary, btnGhost, label, heading, Stat, Empty, Busy, Pill } from '../elevate/chms/finance/shared';
export { useToast, ToastProvider, useHotkeys, SkeletonRows, useDo } from '../elevate/chms/finance/SpendingUi';
export { formatMoney as money } from '../../services/billingService';

export const STATUS_META: Record<InvoiceStatus, { text: string; cls: string; Icon: React.ComponentType<{ size?: number }> }> = {
  DRAFT: { text: 'Draft', cls: 'bg-white/5 text-white/60 border-white/15', Icon: FileText },
  OPEN: { text: 'Open', cls: 'bg-sky-500/10 text-sky-300 border-sky-500/30', Icon: Send },
  PARTIAL: { text: 'Partial', cls: 'bg-amber-500/10 text-amber-300 border-amber-500/30', Icon: CircleDot },
  PAID: { text: 'Paid', cls: 'bg-green-500/10 text-green-400 border-green-500/30', Icon: CheckCircle2 },
  OVERDUE: { text: 'Overdue', cls: 'bg-red-500/10 text-red-400 border-red-500/30', Icon: AlertTriangle },
  VOID: { text: 'Void', cls: 'bg-white/5 text-white/40 border-white/10 line-through', Icon: Ban },
  UNCOLLECTIBLE: { text: 'Uncollectible', cls: 'bg-white/5 text-white/40 border-white/10', Icon: Ban },
};
/** Color + icon + text — never color alone. */
export const StatusChip: React.FC<{ status: InvoiceStatus }> = ({ status }) => {
  const m = STATUS_META[status];
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${m.cls}`}><m.Icon size={10} />{m.text}</span>;
};

const EST_META: Record<Estimate['status'], { text: string; cls: string; Icon: React.ComponentType<{ size?: number }> }> = {
  DRAFT: STATUS_META.DRAFT, SENT: { text: 'Sent', cls: STATUS_META.OPEN.cls, Icon: Send },
  ACCEPTED: { text: 'Accepted', cls: STATUS_META.PAID.cls, Icon: CheckCircle2 }, DECLINED: { text: 'Declined', cls: STATUS_META.OVERDUE.cls, Icon: Ban },
  EXPIRED: { text: 'Expired', cls: STATUS_META.VOID.cls, Icon: Clock }, CONVERTED: { text: 'Converted', cls: 'bg-violet-500/10 text-violet-300 border-violet-500/30', Icon: FileText },
};
export const EstimateChip: React.FC<{ status: Estimate['status'] }> = ({ status }) => {
  const m = EST_META[status];
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${m.cls}`}><m.Icon size={10} />{m.text}</span>;
};

/** Full-screen sheet on phones, centered modal on desktop. Esc closes. */
export const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({ title, onClose, children, wide }) => {
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  return (
    <div className="fixed inset-0 z-[250] flex items-end sm:items-center justify-center bg-black/70 sm:p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className={`bg-zinc-950 border border-white/10 w-full ${wide ? 'sm:max-w-5xl' : 'sm:max-w-lg'} max-h-[100dvh] sm:max-h-[92vh] h-[100dvh] sm:h-auto overflow-y-auto sm:rounded-[2rem] p-5 sm:p-7`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4 sticky top-0 bg-zinc-950 py-1 z-10">
          <h3 className="text-sm font-black text-white">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="p-2 -mr-2 text-white/50 hover:text-white"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
};

export const PreviewBadge: React.FC = () => (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border bg-violet-500/10 text-violet-300 border-violet-500/30" title="This feature is OFF for everyone else — you see it because you're an admin.">Admin preview</span>
);
