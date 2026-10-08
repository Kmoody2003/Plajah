import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Plus, Copy, Link2, Power, Download, Share2 } from 'lucide-react';
import type { BillingEntityRef, PaymentLink } from '../../types';
import { billingApi, copyText, useBillingLinks, useBillingInvoices } from '../../services/billingService';
import { Busy, Pill, Sheet, SkeletonRows, btnGhost, btnPrimary, card, field, label, money, useToast } from './ui';

const LinkQr: React.FC<{ url: string; size?: number }> = ({ url, size = 160 }) => {
  const [src, setSrc] = useState('');
  useEffect(() => { QRCode.toDataURL(url, { margin: 1, width: size * 2 }).then(setSrc).catch(() => {}); }, [url, size]);
  return src ? <img src={src} alt="QR code for payment link" width={size} height={size} className="rounded-2xl bg-white p-2" /> : <div style={{ width: size, height: size }} className="rounded-2xl bg-white/5 animate-pulse" />;
};

export const PaymentLinksTab: React.FC<{ entity: BillingEntityRef; canManage: boolean }> = ({ entity, canManage }) => {
  const toast = useToast(); const { rows, loading, error } = useBillingLinks(entity);
  const { rows: invs } = useBillingInvoices(entity);   // payments list: invoices are the only server-written payment record we can read
  const [creating, setCreating] = useState(false); const [open, setOpen] = useState<PaymentLink | null>(null);
  const [title, setTitle] = useState(''); const [amount, setAmount] = useState(''); const [custom, setCustom] = useState(false); const [desc, setDesc] = useState(''); const [busy, setBusy] = useState(false);

  const create = async () => {
    const amt = parseFloat(amount);
    if (!title.trim()) { toast('Give it a title', { tone: 'warn' }); return; }
    if (!custom && !(amt > 0)) { toast('Enter an amount, or let people choose their own', { tone: 'warn' }); return; }
    setBusy(true);
    try { const l = await billingApi.createLink(entity, { title: title.trim(), description: desc.trim() || undefined, amount: custom ? undefined : amt, allowCustomAmount: custom, active: true }); setCreating(false); setTitle(''); setAmount(''); setDesc(''); setCustom(false); setOpen(l); toast('Payment link created'); }
    catch (e: any) { toast(e?.message || 'Could not create the link.', { tone: 'bad' }); } finally { setBusy(false); }
  };
  const toggle = async (l: PaymentLink) => {
    try { await billingApi.deactivateLink(entity, l.id, !l.active); toast(l.active ? 'Link turned off' : 'Link turned on', { undo: async () => { await billingApi.deactivateLink(entity, l.id, l.active); } }); }
    catch (e: any) { toast(e?.message || 'Could not update the link.', { tone: 'bad' }); }
  };
  const share = async (l: PaymentLink) => { if (!l.url) return; if ((navigator as any).share) (navigator as any).share({ title: l.title, url: l.url }).catch(() => {}); else toast((await copyText(l.url)) ? 'Link copied' : 'Copy failed', { tone: 'info' }); };
  const downloadQr = async (l: PaymentLink) => { if (!l.url) return; const a = document.createElement('a'); a.href = await QRCode.toDataURL(l.url, { margin: 2, width: 800 }); a.download = `${l.title.replace(/\W+/g, '-')}-qr.png`; a.click(); };

  if (loading) return <SkeletonRows />;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2"><p className="text-xs text-white/50">A pay-me link or QR for tips, deposits and one-off payments.</p>{canManage && <button onClick={() => setCreating(true)} className={btnPrimary}><Plus size={13} /> New link</button>}</div>
      {error && <p className="text-xs text-red-300" role="alert">{error}</p>}
      {rows.length === 0 ? (
        <div className={`${card} p-10 text-center`}><Link2 size={28} className="mx-auto text-white/20" /><p className="text-sm font-black text-white mt-3">Make your first pay link</p><p className="text-xs text-white/40 mt-1 max-w-sm mx-auto">Put it in your bio, print the QR on a flyer or table card — payments go to your Stripe account.</p></div>
      ) : (
        <ul className="grid sm:grid-cols-2 gap-3">{rows.map(l => (
          <li key={l.id} className={`${card} p-4`}>
            <div className="flex items-start justify-between gap-2"><button onClick={() => setOpen(l)} className="text-left min-w-0"><p className="text-sm font-black text-white truncate">{l.title}</p><p className="text-[10px] text-white/40">{l.allowCustomAmount ? 'Customer chooses amount' : money(l.amount || 0)}</p></button><Pill tone={l.active ? 'ok' : 'info'}>{l.active ? '● Active' : '○ Off'}</Pill></div>
            <div className="flex flex-wrap gap-2 mt-3">
              <button onClick={async () => toast((l.url && await copyText(l.url)) ? 'Link copied' : 'Copy failed', { tone: 'info' })} disabled={!l.url} className={btnGhost}><Copy size={12} /> Copy</button>
              <button onClick={() => setOpen(l)} className={btnGhost}>QR</button>
              {canManage && <button onClick={() => toggle(l)} className={btnGhost} aria-label={l.active ? 'Turn link off' : 'Turn link on'}><Power size={12} /> {l.active ? 'Turn off' : 'Turn on'}</button>}
            </div>
          </li>))}</ul>
      )}
      {creating && (
        <Sheet title="New payment link" onClose={() => setCreating(false)}>
          <div className="space-y-3">
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="What is it for? (Tip jar, Deposit…)" aria-label="Title" className={field} />
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} placeholder="Short description (optional)" aria-label="Description" className={field} />
            <label className="flex items-center gap-2 text-xs text-white/70"><input type="checkbox" checked={custom} onChange={e => setCustom(e.target.checked)} /> Let the payer choose the amount</label>
            {!custom && <input type="number" min={0.5} step="0.01" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount ($)" aria-label="Amount" className={field} />}
            <button onClick={create} disabled={busy} className={btnPrimary + ' w-full'}><Busy on={busy}>Create link</Busy></button>
          </div>
        </Sheet>
      )}
      {open && (
        <Sheet title={open.title} onClose={() => setOpen(null)}>
          <div className="text-center space-y-3">
            {open.url ? <><div className="flex justify-center"><LinkQr url={open.url} /></div>
              <input readOnly value={open.url} onFocus={e => e.currentTarget.select()} aria-label="Link" className={field + ' text-center text-xs'} />
              <div className="flex flex-wrap justify-center gap-2"><button onClick={async () => toast((await copyText(open.url!)) ? 'Link copied' : 'Copy failed', { tone: 'info' })} className={btnPrimary}><Copy size={12} /> Copy</button><button onClick={() => share(open)} className={btnGhost}><Share2 size={12} /> Share</button><button onClick={() => downloadQr(open)} className={btnGhost}><Download size={12} /> QR image</button></div></>
              : <p className="text-xs text-white/40">Link is being prepared…</p>}
            <div className="text-left pt-3 border-t border-white/10"><p className={label}>Recent payments</p>
              {(() => { const paid = invs.filter(i => i.status === 'PAID' && i.projectRef === `link:${open.id}`); return paid.length ? paid.slice(0, 6).map(i => <p key={i.id} className="text-xs text-white/70 flex justify-between py-1"><span>{i.customerName}</span><span className="tabular-nums">{money(i.total)}</span></p>) : <p className="text-[11px] text-white/30 mt-1">Payments will show up here, and in your Stripe dashboard.</p>; })()}</div>
          </div>
        </Sheet>
      )}
    </div>
  );
};
export default PaymentLinksTab;
