import React, { useCallback, useEffect, useState } from 'react';
import { Car, Plus, Share2, Printer, Loader2, ChevronLeft, ShieldCheck } from 'lucide-react';
import { authedFetch } from '../services/registerService';
import { validateVin, normalizeVin } from '../services/vehicleCore';
import type { PassportEntry } from '../services/passportCore';

/**
 * My Garage - the customer-owned side of the Vehicle Passport (v1). Lists the vehicles in the signed-in user's
 * garage and the SHOP-VERIFIED service entries each shop wrote for them. Customers cannot edit shop entries; they can
 * hand a short-lived code to a new shop or a printable link to a buyer. Server-only data (/api/garage/*).
 * Missing in v1: ownership transfer, owner-added notes, receipts, recall alerts. See docs in the PR notes.
 */
interface GV { key: string; vin: string; plate: string; state: string; year?: number; make: string; model: string; trim?: string; entryCount: number; lastServiceAt?: number; lastOdometer?: number }
const name = (v: Pick<GV, 'year' | 'make' | 'model' | 'trim'>) => [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ') || 'Vehicle';
const inp = 'bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-sm outline-none focus:border-white/30 w-full text-white';

const MyGarageView: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const [list, setList] = useState<GV[] | null>(null);
  const [err, setErr] = useState(''); const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ vin: '', plate: '', state: '', code: '', year: '', make: '', model: '' });
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [entries, setEntries] = useState<PassportEntry[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { try { setList((await authedFetch('/api/garage/list', {})).vehicles); setErr(''); } catch (e: any) { setErr(e?.message || 'Could not load your garage.'); setList([]); } }, []);
  useEffect(() => { load(); }, [load]);

  const open = async (key: string) => {
    setOpenKey(key); setEntries(null); setNote('');
    try { setEntries((await authedFetch('/api/garage/entries', { key })).entries); } catch (e: any) { setErr(e?.message || 'Could not load history.'); setEntries([]); }
  };
  const claim = async () => {
    setBusy(true); setErr(''); setNote('');
    try { await authedFetch('/api/garage/claim', { vin: f.vin, plate: f.plate, state: f.state, code: f.code, year: Number(f.year) || undefined, make: f.make, model: f.model }); setAdding(false); setF({ vin: '', plate: '', state: '', code: '', year: '', make: '', model: '' }); await load(); }
    catch (e: any) { setErr(e?.message || 'Could not add the vehicle.'); } finally { setBusy(false); }
  };
  const share = async (key: string, scope: 'view' | 'shop') => {
    setBusy(true); setErr(''); setNote('');
    try {
      const r = await authedFetch('/api/garage/share', { key, scope });
      const text = scope === 'view' ? r.url : r.token;
      try { await navigator.clipboard?.writeText(text); setNote(scope === 'view' ? 'Link copied. It works for 48 hours.' : 'Code copied. Give it to the shop; it works for 48 hours.'); } catch { setNote(text); }
    } catch (e: any) { setErr(e?.message || 'Could not create the link.'); } finally { setBusy(false); }
  };

  const v = list?.find(x => x.key === openKey) || null;
  const vinCheck = f.vin ? validateVin(f.vin) : null;
  return (
    <div className="max-w-xl mx-auto px-4 pb-16 text-white">
      <div className="flex items-center gap-3 mb-4">
        {onBack && <button onClick={() => (openKey ? setOpenKey(null) : onBack())} aria-label="Back" className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center"><ChevronLeft size={18} /></button>}
        <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2"><Car size={20} className="text-small-orange" /> My Garage</h2>
      </div>
      {err && <div role="alert" className="rounded-xl border border-[#D40055]/50 bg-[#D40055]/10 p-3 text-sm font-bold text-[#ff7aa8] mb-3">{err}</div>}
      {note && <div role="status" className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 p-3 text-sm font-bold text-emerald-200 mb-3 break-all">{note}</div>}
      {!list && <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-white/40" /></div>}

      {list && !openKey && (
        <div className="space-y-3">
          {list.map(g => (
            <button key={g.key} onClick={() => open(g.key)} className="w-full text-left rounded-2xl bg-white/[0.06] border border-white/10 hover:bg-white/10 p-4">
              <div className="font-black text-lg">{name(g)}</div>
              <div className="text-xs text-white/50 mt-0.5">{g.vin ? `VIN ${g.vin}` : `Plate ${g.plate} (${g.state})`}</div>
              <div className="text-xs text-white/60 mt-2">{g.entryCount ? `${g.entryCount} shop-verified service${g.entryCount > 1 ? 's' : ''}${g.lastServiceAt ? ` · last ${new Date(g.lastServiceAt).toLocaleDateString()}` : ''}${g.lastOdometer ? ` · ${g.lastOdometer.toLocaleString()} mi` : ''}` : 'No service history yet'}</div>
            </button>
          ))}
          {!list.length && !adding && <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-white/50 text-sm">Your garage is empty. Add a vehicle to keep its service history in one place.</div>}
          {!adding ? (
            <button onClick={() => setAdding(true)} className="w-full min-h-[52px] rounded-2xl bg-white/10 hover:bg-white/15 font-black uppercase text-sm flex items-center justify-center gap-2"><Plus size={16} /> Add a vehicle</button>
          ) : (
            <div className="rounded-2xl bg-white/[0.05] border border-white/10 p-4 space-y-3">
              <input className={inp + ' font-mono uppercase'} placeholder="VIN (17 characters)" aria-label="VIN" value={f.vin} maxLength={20} onChange={e => setF({ ...f, vin: normalizeVin(e.target.value) })} />
              {vinCheck && !vinCheck.valid && f.vin.length >= 11 && <div className="text-xs text-amber-300">{vinCheck.errors[0]}</div>}
              <div className="text-[11px] text-white/40 text-center">or</div>
              <div className="grid grid-cols-3 gap-2"><input className={inp + ' col-span-2'} placeholder="License plate" aria-label="Plate" value={f.plate} onChange={e => setF({ ...f, plate: e.target.value })} /><input className={inp} placeholder="State" aria-label="State" maxLength={2} value={f.state} onChange={e => setF({ ...f, state: e.target.value })} /></div>
              <div className="grid grid-cols-3 gap-2"><input className={inp} placeholder="Year" inputMode="numeric" aria-label="Year" value={f.year} onChange={e => setF({ ...f, year: e.target.value.replace(/\D/g, '').slice(0, 4) })} /><input className={inp} placeholder="Make" aria-label="Make" value={f.make} onChange={e => setF({ ...f, make: e.target.value })} /><input className={inp} placeholder="Model" aria-label="Model" value={f.model} onChange={e => setF({ ...f, model: e.target.value })} /></div>
              <input className={inp + ' font-mono uppercase'} placeholder="Claim code from your shop (if you have one)" aria-label="Claim code" value={f.code} onChange={e => setF({ ...f, code: e.target.value })} />
              <div className="flex gap-2"><button onClick={() => setAdding(false)} className="flex-1 min-h-[48px] rounded-xl bg-white/10 text-sm font-black uppercase">Cancel</button><button disabled={busy} onClick={claim} className="flex-1 min-h-[48px] rounded-xl text-sm font-black uppercase text-white disabled:opacity-40" style={{ background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)' }}>{busy ? 'Adding...' : 'Add'}</button></div>
            </div>
          )}
          <p className="text-[11px] text-white/35 leading-relaxed">History here is written by the shops that did the work, on Plajah. You cannot edit their entries and other shops cannot see them unless you share a code. It is not a manufacturer or CARFAX-style report and only includes shops that use Plajah.</p>
        </div>
      )}

      {v && (
        <div className="space-y-3">
          <div className="rounded-2xl bg-white/[0.06] border border-white/10 p-4">
            <div className="font-black text-xl">{name(v)}</div>
            <div className="text-xs text-white/50">{v.vin ? `VIN ${v.vin}` : `Plate ${v.plate} (${v.state})`}</div>
            <div className="flex gap-2 mt-3 flex-wrap">
              <button disabled={busy} onClick={() => share(v.key, 'shop')} className="min-h-[44px] px-4 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-black uppercase flex items-center gap-2"><Share2 size={14} /> Share with a shop</button>
              <button disabled={busy} onClick={() => share(v.key, 'view')} className="min-h-[44px] px-4 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-black uppercase flex items-center gap-2"><Printer size={14} /> Link for a buyer</button>
              <button disabled={busy} onClick={async () => { try { const r = await authedFetch('/api/garage/share', { key: v.key, scope: 'view' }); if (r.url) window.open(r.url, '_blank', 'noopener'); } catch (e: any) { setErr(e?.message || 'Could not open.'); } }} className="min-h-[44px] px-4 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-black uppercase">Print / PDF</button>
            </div>
          </div>
          {!entries && <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-white/40" /></div>}
          {entries && !entries.length && <div className="rounded-2xl border border-dashed border-white/15 p-6 text-center text-white/50 text-sm">No shop-verified services yet. Ask your shop to add your visits to your vehicle history{v.entryCount === 0 ? ', and use the claim code they give you if you did not link your account' : ''}.</div>}
          {entries?.map(e => (
            <div key={e.id} className="rounded-2xl bg-white/[0.05] border border-white/10 p-4">
              <div className="flex items-center gap-2 text-xs text-white/50"><ShieldCheck size={14} className="text-emerald-300" /> Verified by {e.shopName} · {new Date(e.at).toLocaleDateString()}{e.odometer !== undefined ? ` · ${e.odometer.toLocaleString()} mi` : ''}</div>
              <ul className="mt-2 space-y-1 text-sm">{e.work.map((w, i) => <li key={i}>• {w.description}</li>)}</ul>
              {e.inspection && <div className="mt-2 text-[11px] text-white/45">Inspection: {e.inspection.fail} needed attention, {e.inspection.watch} to watch, {e.inspection.pass} good</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
export default MyGarageView;
