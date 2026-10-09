// "Buy print edition" button for a book detail / purchase screen. Feature-detected: renders nothing unless the author
// has listed a print edition AND the server exposes it (GET /api/pod/editions/:id returns 404 otherwise).
import React, { useEffect, useState } from 'react';
import { podFetch, money } from './podApi';

const F0 = { name: '', street1: '', city: '', stateCode: '', postcode: '', countryCode: 'US', phone: '', email: '' };

export const BuyPrintEdition: React.FC<{ albumId: string }> = ({ albumId }) => {
  const [ed, setEd] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [addr, setAddr] = useState(F0);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { let on = true; podFetch(`/editions/${encodeURIComponent(albumId)}`).then(j => on && j.edition?.printer && setEd(j.edition)).catch(() => {}); return () => { on = false; }; }, [albumId]);
  if (!ed) return null;
  const go = async () => {
    setBusy(true); setError('');
    try { const r = await podFetch('/checkout', { method: 'POST', json: { albumId, quantity: qty, address: addr, shippingLevel: 'MAIL' } }); window.location.href = r.url; }
    catch (e: any) { setError(e.message); setBusy(false); }
  };
  const input = 'rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white';
  return (
    <div className="text-white">
      {!open ? (
        <button onClick={() => setOpen(true)} className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-bold">Buy print edition · {money(ed.listPriceCents)} + shipping</button>
      ) : (
        <div className="text-left space-y-2 max-w-md mx-auto">
          <p className="text-xs text-white/60">Printed on demand and shipped to you. Shipping is charged at the printer's cost and shown before you pay.</p>
          <div className="grid grid-cols-2 gap-2">{(['name', 'street1', 'city', 'stateCode', 'postcode', 'countryCode', 'phone', 'email'] as const).map(k => (
            <input key={k} className={input} placeholder={k} value={(addr as any)[k]} onChange={e => setAddr({ ...addr, [k]: e.target.value })} />))}</div>
          <label className="text-xs text-white/60">Copies <input type="number" min={1} max={10} value={qty} onChange={e => setQty(Math.max(1, Math.min(10, +e.target.value || 1)))} className={`${input} w-20 ml-2`} /></label>
          <button onClick={go} disabled={busy} className="w-full py-2 rounded-xl bg-green-600 font-bold text-sm disabled:opacity-50">{busy ? 'Getting printer quote...' : 'Continue to secure checkout'}</button>
          {error && <p className="text-xs text-red-300" role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
};

export default BuyPrintEdition;
