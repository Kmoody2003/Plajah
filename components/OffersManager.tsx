// OffersManager — a compact editor for in-store deals. Offers auto-apply at the register (best
// eligible one wins) and are readable by the storefront. Kept intentionally small: label, kind,
// value, optional minimum, members-only, active.

import React, { useEffect, useState } from 'react';
import { fetchOffers, saveOffer, deleteOffer, seedDemoOffers, type BusinessOffer, type OfferKind } from '../services/offersService';

const GRAD = 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)';
const blank = { label: '', kind: 'PERCENT' as OfferKind, value: 10, minDollars: 0, membersOnly: false, active: true };

export default function OffersManager({ businessUid }: { businessUid: string }) {
  const [offers, setOffers] = useState<BusinessOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...blank });
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setOffers(await fetchOffers(businessUid));
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [businessUid]);

  function edit(o: BusinessOffer) {
    setEditId(o.id);
    setForm({ label: o.label, kind: o.kind, value: o.value, minDollars: Math.round((o.minSubtotalCents || 0) / 100), membersOnly: !!o.membersOnly, active: o.active });
  }
  function reset() { setEditId(null); setForm({ ...blank }); }

  async function submit() {
    if (!form.label.trim() || saving) return;
    setSaving(true);
    await saveOffer(businessUid, {
      id: editId || undefined,
      label: form.label.trim(),
      kind: form.kind,
      value: Number(form.value) || 0,
      minSubtotalCents: Math.max(0, Math.round((Number(form.minDollars) || 0) * 100)) || undefined,
      membersOnly: form.membersOnly,
      active: form.active,
    });
    setSaving(false); reset(); load();
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-black uppercase tracking-widest">In-store deals</h3>
        {offers.length === 0 && !loading && (
          <button onClick={async () => { await seedDemoOffers(businessUid); load(); }} className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20">Seed demo deals</button>
        )}
      </div>

      {/* Existing offers */}
      <div className="space-y-1.5 mb-4">
        {loading ? <div className="text-white/40 text-xs py-4">Loading…</div>
          : offers.length === 0 ? <div className="text-white/40 text-xs py-2">No deals yet. Auto-apply deals at checkout — add one below.</div>
          : offers.map(o => (
            <div key={o.id} className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold truncate">{o.label} {!o.active && <span className="text-white/30">(off)</span>}</div>
                <div className="text-[10px] text-white/40">
                  {o.kind === 'PERCENT' ? `${o.value}% off` : `$${o.value} off`}
                  {o.minSubtotalCents ? ` · min $${Math.round(o.minSubtotalCents / 100)}` : ''}
                  {o.membersOnly ? ' · members' : ''}
                </div>
              </div>
              <button onClick={() => edit(o)} className="text-[10px] font-bold uppercase text-white/60 hover:text-white">Edit</button>
              <button onClick={async () => { await deleteOffer(businessUid, o.id); load(); }} className="text-[10px] font-bold uppercase text-red-400/70 hover:text-red-400">Del</button>
            </div>
          ))}
      </div>

      {/* Editor */}
      <div className="space-y-2 border-t border-white/10 pt-3">
        <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Deal name (e.g. Members save 10%)"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none focus:border-white/30" />
        <div className="flex gap-2">
          <select value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value as OfferKind }))}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none">
            <option value="PERCENT">% off</option>
            <option value="AMOUNT">$ off</option>
          </select>
          <input type="number" value={form.value} onChange={e => setForm(f => ({ ...f, value: Number(e.target.value) }))} placeholder="Value"
            className="w-20 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none" />
          <input type="number" value={form.minDollars} onChange={e => setForm(f => ({ ...f, minDollars: Number(e.target.value) }))} placeholder="Min $"
            className="w-20 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none" />
        </div>
        <div className="flex items-center gap-4 text-[11px] font-bold">
          <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={form.membersOnly} onChange={e => setForm(f => ({ ...f, membersOnly: e.target.checked }))} className="accent-fuchsia-500" /> Members only</label>
          <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} className="accent-emerald-500" /> Active</label>
        </div>
        <div className="flex gap-2">
          <button onClick={submit} disabled={!form.label.trim() || saving} className="flex-1 py-2 rounded-xl text-white text-[11px] font-black uppercase tracking-widest disabled:opacity-30" style={{ background: GRAD }}>
            {editId ? 'Save deal' : 'Add deal'}
          </button>
          {editId && <button onClick={reset} className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-[11px] font-bold uppercase">Cancel</button>}
        </div>
      </div>
    </div>
  );
}
