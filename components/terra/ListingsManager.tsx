/**
 * Listings — the Real Estate vertical's core tab.
 *
 * Creates and manages Open Listing Records. Publishing runs the record through
 * validation, fingerprints it, and bumps a revision only when the content
 * actually changed — so the history is real rather than manufactured.
 *
 * Two things this surface is deliberately honest about:
 *  · The fingerprint proves INTEGRITY, not time. Copy says "fingerprinted",
 *    never "blockchain-verified" — there is no chain anchoring behind it.
 *  · Publishing puts the record in Terra's open feed. It does NOT send it to any
 *    consumer portal; no such API exists. The UI says so rather than letting an
 *    agent assume syndication they aren't getting.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus, X, Home, CheckCircle2, AlertTriangle, Fingerprint, Trash2,
  ExternalLink, Rss, Loader2, MapPin,
} from 'lucide-react';
import type { UserProfile } from '../../types';
import type { OpenListingRecord, StandardStatus, PropertyType } from '../../services/terra/olr';
import { validateListingRecord } from '../../services/terra/olr';
import {
  deleteListing, fetchListingsByLister, fetchParcelByNumber, saveListing,
} from '../../services/terra/terraService';

/** The Real Estate vertical's accent — blueprint blue. */
const ACCENT = '#5B8DEF';

const card = 'bg-white/[0.03] border border-white/[0.06] rounded-xl';
const label = 'text-[10px] font-black uppercase tracking-widest text-white/30';
const input =
  'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white '
  + 'placeholder-white/20 focus:outline-none focus:border-[#5B8DEF]/60 transition-colors';

const STATUSES: StandardStatus[] = ['ComingSoon', 'Active', 'ActiveUnderContract', 'Pending', 'Closed', 'Withdrawn'];
const TYPES: PropertyType[] = ['Residential', 'ResidentialLease', 'ResidentialIncome', 'Land', 'CommercialSale', 'CommercialLease'];

const STATUS_STYLE: Record<string, string> = {
  Active: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
  ComingSoon: 'text-sky-400 bg-sky-500/10 border-sky-500/25',
  ActiveUnderContract: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/25',
  Pending: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/25',
  Closed: 'text-white/40 bg-white/5 border-white/10',
  Withdrawn: 'text-white/30 bg-white/5 border-white/10',
};

const money = (n?: number) =>
  typeof n === 'number' && Number.isFinite(n)
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
    : '—';

/** A sample listing so the surface shows the populated experience with zero data
 *  (and for signed-out visitors). Clearly badged "Demo"; never persisted. */
const DEMO_LISTING: OpenListingRecord = {
  OlrVersion: '0.1.0', ListingKey: 'terra-demo-rosedale', SourceSystemKey: 'terra:demo', SourceSystemName: 'Terra demo',
  StandardStatus: 'Active', PropertyType: 'Residential',
  ListPrice: 189000, UnparsedAddress: '4218 Rosedale St', City: 'Detroit', StateOrProvince: 'MI',
  BedroomsTotal: 3, BathroomsTotalInteger: 2, LivingArea: 1410,
  ModificationTimestamp: '2026-03-04T00:00:00.000Z',
  X_Terra_ParcelId: 'detroit:demo-rosedale', X_Terra_ContentHash: '9f2ca417demo0000', X_Terra_Revision: 1,
};

const DemoListingCard: React.FC<{ onOpen?: () => void }> = ({ onOpen }) => (
  <div className={`${card} p-4 relative`} style={{ borderColor: `${ACCENT}26` }}>
    <span className="absolute top-3 right-3 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full text-white/40 bg-white/5">Demo</span>
    <div className="flex items-start gap-4">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${ACCENT}20`, color: ACCENT }}><Home size={15} /></div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-black text-white truncate">{DEMO_LISTING.UnparsedAddress}</p>
        <p className="text-[10px] text-white/40">Detroit, MI · 3 bd · 2 ba · 1,410 sqft</p>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border text-emerald-400 bg-emerald-500/10 border-emerald-500/25">Active</span>
          <span className="flex items-center gap-1 text-[9px] font-mono text-white/30" title="A real listing carries a SHA-256 fingerprint here."><Fingerprint size={9} /> 9f2ca417</span>
          <span className="flex items-center gap-1 text-[9px] text-emerald-400/70"><CheckCircle2 size={9} /> linked to parcel</span>
        </div>
      </div>
      <div className="text-right shrink-0 self-center">
        <p className="text-sm font-black text-white tabular-nums">$189,000</p>
        {onOpen && (
          <button onClick={onOpen} className="mt-1 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white/80 transition-colors">
            View passport →
          </button>
        )}
      </div>
    </div>
  </div>
);

const emptyForm = {
  UnparsedAddress: '', City: 'Detroit', StateOrProvince: 'MI', PostalCode: '',
  ListPrice: '', StandardStatus: 'ComingSoon' as StandardStatus, PropertyType: 'Residential' as PropertyType,
  BedroomsTotal: '', BathroomsTotalInteger: '', LivingArea: '', YearBuilt: '',
  ParcelNumber: '', PublicRemarks: '',
};

const num = (v: string): number | undefined => {
  if (!v.trim()) return undefined;
  const n = Number(v.replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : undefined;
};

export const ListingsManager: React.FC<{
  currentUser?: UserProfile | null;
  onNavigate?: (target: string, params?: any) => void;
}> = ({ currentUser, onNavigate }) => {
  const uid = currentUser?.uid || '';
  const [listings, setListings] = useState<OpenListingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  const [parcelHint, setParcelHint] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!uid) { setLoading(false); return; }
    setLoading(true);
    fetchListingsByLister(uid).then(setListings).finally(() => setLoading(false));
  }, [uid]);

  useEffect(() => { load(); }, [load]);

  const set = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }));

  // Live-check the parcel number against the spine so the agent knows the
  // listing will actually join to a public record before they publish.
  useEffect(() => {
    const pin = form.ParcelNumber.trim();
    if (!pin) { setParcelHint(null); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      fetchParcelByNumber('detroit', pin).then(p => {
        if (cancelled) return;
        setParcelHint(p ? `Matched — ${p.address || 'parcel on file'}` : 'No parcel found with that number');
      }).catch(() => { if (!cancelled) setParcelHint(null); });
    }, 450);
    return () => { cancelled = true; clearTimeout(t); };
  }, [form.ParcelNumber]);

  const draft = useMemo((): OpenListingRecord => {
    const now = new Date().toISOString();
    return {
      OlrVersion: '0.1.0',
      ListingKey: `terra-${uid.slice(0, 6)}-${Date.now().toString(36)}`,
      SourceSystemKey: 'terra:detroit',
      SourceSystemName: 'Plajah Terra',
      StandardStatus: form.StandardStatus,
      PropertyType: form.PropertyType,
      ListPrice: num(form.ListPrice),
      UnparsedAddress: form.UnparsedAddress.trim() || undefined,
      City: form.City.trim() || undefined,
      StateOrProvince: form.StateOrProvince.trim() || undefined,
      PostalCode: form.PostalCode.trim() || undefined,
      CountyOrParish: 'Wayne',
      BedroomsTotal: num(form.BedroomsTotal),
      BathroomsTotalInteger: num(form.BathroomsTotalInteger),
      LivingArea: num(form.LivingArea),
      LivingAreaUnits: num(form.LivingArea) ? 'Square Feet' : undefined,
      YearBuilt: num(form.YearBuilt),
      ParcelNumber: form.ParcelNumber.trim() || undefined,
      PublicRemarks: form.PublicRemarks.trim() || undefined,
      ListingContractDate: now.slice(0, 10),
      ModificationTimestamp: now,
      ListAgentFullName: currentUser?.displayName || undefined,
      X_Terra_ParcelId: form.ParcelNumber.trim() ? `detroit:${form.ParcelNumber.trim()}` : undefined,
      X_Terra_ListerUid: uid,
      X_Terra_Sources: [{
        system: 'terra:agent-entry',
        label: currentUser?.displayName ? `Entered by ${currentUser.displayName}` : 'Agent entry',
        retrievedAt: Date.now(),
        observed: 'observed',
      }],
    };
  }, [form, uid, currentUser?.displayName]);

  const check = useMemo(() => validateListingRecord(draft), [draft]);

  const publish = async () => {
    if (!uid) return;
    setSaving(true);
    setNotice(null);
    const result = await saveListing(draft);
    setSaving(false);
    if (!result.ok) {
      setNotice({ tone: 'err', text: result.errors.join(' · ') });
      return;
    }
    setNotice({ tone: 'ok', text: 'Published to the open feed and fingerprinted.' });
    setForm({ ...emptyForm });
    setComposing(false);
    load();
  };

  const remove = async (key: string) => {
    const ok = await deleteListing(key);
    if (ok) load();
    else setNotice({ tone: 'err', text: 'Could not remove that listing.' });
  };

  if (!uid) {
    return (
      <div className="space-y-4">
        <div>
          <p className="text-sm font-black text-white">Listings</p>
          <p className="text-[11px] text-white/40">Publish to Terra's open feed — mirrorable by anyone, owned by you.</p>
        </div>
        <DemoListingCard />
        <div className={`${card} p-4 text-center`}>
          <p className="text-xs text-white/50 font-semibold mb-1">Sign in to create and publish your own</p>
          <p className="text-[11px] text-white/30 leading-relaxed">Each listing gets its own open record, a content fingerprint, and a link to the public parcel.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-black text-white">Listings</p>
          <p className="text-[11px] text-white/40">
            Published to Terra's open feed — mirrorable by anyone, owned by you.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/api/terra/olr" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-white/80 transition-colors">
            <Rss size={11} /> View feed
          </a>
          <button onClick={() => { setComposing(v => !v); setNotice(null); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
            style={{ background: `${ACCENT}22`, border: `1px solid ${ACCENT}55`, color: ACCENT }}>
            {composing ? <><X size={11} /> Cancel</> : <><Plus size={11} /> New listing</>}
          </button>
        </div>
      </div>

      {notice && (
        <div className={`px-4 py-2.5 rounded-xl text-[11px] font-semibold border ${
          notice.tone === 'ok' ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
          : notice.tone === 'warn' ? 'bg-yellow-500/10 border-yellow-500/25 text-yellow-400'
          : 'bg-red-500/10 border-red-500/25 text-red-400'}`}>
          {notice.text}
        </div>
      )}

      {/* Composer */}
      <AnimatePresence>
        {composing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden">
            <div className="p-5 rounded-2xl space-y-3" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${ACCENT}33` }}>
              <input className={input} placeholder="Street address" value={form.UnparsedAddress}
                onChange={e => set({ UnparsedAddress: e.target.value })} />

              <div className="grid grid-cols-3 gap-3">
                <input className={input} placeholder="City" value={form.City} onChange={e => set({ City: e.target.value })} />
                <input className={input} placeholder="State" value={form.StateOrProvince} onChange={e => set({ StateOrProvince: e.target.value })} />
                <input className={input} placeholder="ZIP" value={form.PostalCode} onChange={e => set({ PostalCode: e.target.value })} />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <select className={input} value={form.PropertyType} onChange={e => set({ PropertyType: e.target.value as PropertyType })}>
                  {TYPES.map(t => <option key={t} value={t}>{t.replace(/([A-Z])/g, ' $1').trim()}</option>)}
                </select>
                <select className={input} value={form.StandardStatus} onChange={e => set({ StandardStatus: e.target.value as StandardStatus })}>
                  {STATUSES.map(s => <option key={s} value={s}>{s.replace(/([A-Z])/g, ' $1').trim()}</option>)}
                </select>
                <input className={input} placeholder="List price" value={form.ListPrice} onChange={e => set({ ListPrice: e.target.value })} />
              </div>

              <div className="grid grid-cols-4 gap-3">
                <input className={input} placeholder="Beds" value={form.BedroomsTotal} onChange={e => set({ BedroomsTotal: e.target.value })} />
                <input className={input} placeholder="Baths" value={form.BathroomsTotalInteger} onChange={e => set({ BathroomsTotalInteger: e.target.value })} />
                <input className={input} placeholder="Sq ft" value={form.LivingArea} onChange={e => set({ LivingArea: e.target.value })} />
                <input className={input} placeholder="Year built" value={form.YearBuilt} onChange={e => set({ YearBuilt: e.target.value })} />
              </div>

              <div>
                <input className={input} placeholder="Parcel number (joins to the public record)"
                  value={form.ParcelNumber} onChange={e => set({ ParcelNumber: e.target.value })} />
                {parcelHint && (
                  <p className={`text-[10px] mt-1.5 flex items-center gap-1 ${
                    parcelHint.startsWith('Matched') ? 'text-emerald-400/80' : 'text-yellow-400/70'}`}>
                    <MapPin size={9} /> {parcelHint}
                  </p>
                )}
              </div>

              <textarea rows={3} className={`${input} resize-none`} placeholder="Public remarks"
                value={form.PublicRemarks} onChange={e => set({ PublicRemarks: e.target.value })} />

              {/* Live validation — errors block, warnings inform. */}
              {(check.errors.length > 0 || check.warnings.length > 0) && (
                <div className="space-y-1">
                  {check.errors.map(e => (
                    <p key={e} className="text-[10px] text-red-400 flex items-start gap-1.5">
                      <AlertTriangle size={9} className="mt-0.5 shrink-0" /> {e}
                    </p>
                  ))}
                  {check.warnings.map(w => (
                    <p key={w} className="text-[10px] text-white/35 flex items-start gap-1.5">
                      <AlertTriangle size={9} className="mt-0.5 shrink-0" /> {w}
                    </p>
                  ))}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button onClick={publish} disabled={!check.valid || saving}
                  className="flex-1 py-2.5 rounded-xl text-white text-xs font-black uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{ background: check.valid && !saving ? ACCENT : 'rgba(255,255,255,0.08)' }}>
                  {saving ? <><Loader2 size={13} className="animate-spin" /> Publishing…</> : 'Publish listing'}
                </button>
              </div>

              <p className="text-[10px] text-white/25 leading-relaxed">
                Publishing adds this to Terra's open feed and fingerprints it. It does not send the
                listing to outside portals — they accept inventory only through MLS syndication and
                direct agreements, not a public API.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      {loading ? (
        <div className="flex items-center gap-3 text-white/30 py-8">
          <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
          <span className="text-xs">Loading listings…</span>
        </div>
      ) : listings.length === 0 ? (
        <div className="space-y-3">
          <p className="text-[11px] text-white/35 leading-relaxed">
            No listings yet — here's a sample of how one looks. Hit <span className="text-white/60 font-semibold">New listing</span> to create your own; it publishes to the open feed with its own record and fingerprint.
          </p>
          <DemoListingCard />
        </div>
      ) : (
        <div className="space-y-2">
          {listings.map(l => (
            <div key={l.ListingKey} className={`${card} p-4 hover:border-white/15 transition-all`}>
              <div className="flex items-start gap-4">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                     style={{ background: `${ACCENT}20`, color: ACCENT }}>
                  <Home size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-white truncate">{l.UnparsedAddress || 'Untitled listing'}</p>
                  <p className="text-[10px] text-white/40">
                    {[l.City, l.StateOrProvince].filter(Boolean).join(', ')}
                    {l.BedroomsTotal ? ` · ${l.BedroomsTotal} bd` : ''}
                    {l.BathroomsTotalInteger ? ` · ${l.BathroomsTotalInteger} ba` : ''}
                    {l.LivingArea ? ` · ${l.LivingArea.toLocaleString()} sqft` : ''}
                  </p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                      STATUS_STYLE[l.StandardStatus] || 'text-white/40 bg-white/5 border-white/10'}`}>
                      {l.StandardStatus.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                    {l.X_Terra_ContentHash && (
                      <span className="flex items-center gap-1 text-[9px] font-mono text-white/30"
                            title="SHA-256 fingerprint. Proves the record is unaltered — it is not a timestamp.">
                        <Fingerprint size={9} /> {l.X_Terra_ContentHash.slice(0, 8)}
                        {l.X_Terra_Revision ? ` · rev ${l.X_Terra_Revision}` : ''}
                      </span>
                    )}
                    {l.X_Terra_ParcelId && (
                      <span className="flex items-center gap-1 text-[9px] text-emerald-400/70">
                        <CheckCircle2 size={9} /> linked to parcel
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0 flex flex-col items-end gap-2">
                  <p className="text-sm font-black text-white tabular-nums">{money(l.ListPrice)}</p>
                  <div className="flex items-center gap-1">
                    {onNavigate && (
                      <button onClick={() => onNavigate('TERRA_PASSPORT', { terraTarget: { listingKey: l.ListingKey } })}
                        className="p-1.5 rounded-lg text-white/25 hover:text-white/80 hover:bg-white/5 transition-colors" title="Open property passport">
                        <Home size={12} />
                      </button>
                    )}
                    <a href={`/api/terra/olr/${encodeURIComponent(l.ListingKey)}`} target="_blank" rel="noopener noreferrer"
                      className="p-1.5 rounded-lg text-white/25 hover:text-white/60 hover:bg-white/5 transition-colors" title="View public record (raw)">
                      <ExternalLink size={12} />
                    </a>
                    <button onClick={() => remove(l.ListingKey)}
                      className="p-1.5 rounded-lg text-white/25 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Remove listing">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ListingsManager;
