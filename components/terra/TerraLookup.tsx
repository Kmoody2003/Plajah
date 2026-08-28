/**
 * Terra Lookup — the two public-record checks a resident or a business actually
 * wants, made answerable in one field.
 *
 *  · RENTAL   — a tenant types their address and learns whether the landlord
 *               holds a current certificate of compliance (not just registration).
 *  · BUSINESS — a name + address is checked against the city's active-licence
 *               register: the verification primitive with no Google dependency.
 *
 * Honesty carried from the rest of Terra: a "no match" is stated as exactly that
 * — "no record found" — never dressed up as a negative judgement about the
 * property or business. Absence of a certificate is a gap; absence of a match is
 * just absence.
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, Store, Search, BadgeCheck, ShieldAlert, Info, Loader2, ArrowRight } from 'lucide-react';
import { fetchRentalByAddress, verifyBusiness } from '../../services/terra/terraService';
import type { TerraRentalCompliance, TerraBusinessLicense } from '../../services/terra/terraTypes';

const ACCENT = '#FF8C00';
const card = 'bg-white/[0.03] border border-white/[0.06] rounded-2xl';

const fmtDate = (v?: string) => {
  if (!v) return '—';
  const t = Date.parse(v);
  return Number.isNaN(t) ? v : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

type Mode = 'rental' | 'business';
type RentalResult = { kind: 'rental'; found: false } | { kind: 'rental'; found: true; data: TerraRentalCompliance };
type BizResult = { kind: 'business'; found: false } | { kind: 'business'; found: true; data: TerraBusinessLicense };
type Result = RentalResult | BizResult;

const field =
  'w-full bg-white/[0.04] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white ' +
  'placeholder-white/25 focus:outline-none focus:border-white/30 transition-colors';

export const TerraLookup: React.FC<{ onOpenParcel?: (parcelId: string) => void }> = ({ onOpenParcel }) => {
  const [mode, setMode] = useState<Mode>('rental');
  const [address, setAddress] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const canRun = mode === 'rental' ? address.trim().length > 3 : name.trim().length > 1;

  const run = async () => {
    if (!canRun || busy) return;
    setBusy(true);
    setResult(null);
    try {
      if (mode === 'rental') {
        const data = await fetchRentalByAddress(address);
        setResult(data ? { kind: 'rental', found: true, data } : { kind: 'rental', found: false });
      } else {
        const data = await verifyBusiness(name, address || undefined);
        setResult(data ? { kind: 'business', found: true, data } : { kind: 'business', found: false });
      }
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (m: Mode) => { setMode(m); setResult(null); };

  return (
    <div className={`${card} p-5`}>
      <div className="flex items-center gap-2 mb-1">
        <Search size={15} style={{ color: ACCENT }} />
        <p className="text-sm font-black text-white">Check the public record</p>
      </div>
      <p className="text-[12px] text-white/45 leading-relaxed mb-4">
        Two answers the city's own data can give you — free, no account.
      </p>

      {/* Mode toggle */}
      <div className="flex gap-1.5 mb-4">
        <button onClick={() => switchMode('rental')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors ${
            mode === 'rental' ? 'text-black' : 'text-white/50 hover:text-white/80 bg-white/[0.04]'}`}
          style={mode === 'rental' ? { background: ACCENT } : {}}>
          <ShieldCheck size={13} /> Is my rental certified?
        </button>
        <button onClick={() => switchMode('business')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors ${
            mode === 'business' ? 'text-black' : 'text-white/50 hover:text-white/80 bg-white/[0.04]'}`}
          style={mode === 'business' ? { background: ACCENT } : {}}>
          <Store size={13} /> Verify a business
        </button>
      </div>

      <form onSubmit={e => { e.preventDefault(); run(); }} className="flex flex-col gap-2.5">
        {mode === 'business' && (
          <input value={name} onChange={e => setName(e.target.value)} className={field}
            placeholder="Business name" autoComplete="off" />
        )}
        <input value={address} onChange={e => setAddress(e.target.value)} className={field}
          placeholder={mode === 'rental' ? 'Property address, e.g. 8156 Normile St' : 'Business address (optional)'}
          autoComplete="off" />
        <button type="submit" disabled={!canRun || busy}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-black text-[11px] font-black uppercase tracking-widest transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: ACCENT }}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
          {mode === 'rental' ? 'Check compliance' : 'Verify'}
        </button>
      </form>

      {result && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
          {result.kind === 'rental' && <RentalResultView result={result} onOpenParcel={onOpenParcel} />}
          {result.kind === 'business' && <BusinessResultView result={result} onOpenParcel={onOpenParcel} />}
        </motion.div>
      )}
    </div>
  );
};

const RentalResultView: React.FC<{ result: RentalResult; onOpenParcel?: (id: string) => void }> = ({ result, onOpenParcel }) => {
  if (!result.found) {
    return (
      <div className="rounded-xl p-3.5 flex items-start gap-2.5" style={{ background: '#6F768914', border: '1px solid #6F768933' }}>
        <Info size={15} className="mt-0.5 shrink-0 text-white/40" />
        <p className="text-[12px] text-white/55 leading-relaxed">
          No rental registration is on file for that address. That means it isn't a registered rental in the
          city's records — not a judgement about the property. Check the spelling, or try the parcel on the map.
        </p>
      </div>
    );
  }
  const r = result.data;
  const certified = r.state === 'CERTIFIED';
  const tone = certified ? '#3DD68C' : '#E8B33D';
  const Icon = certified ? BadgeCheck : ShieldAlert;
  return (
    <div className="rounded-xl p-3.5" style={{ background: `${tone}14`, border: `1px solid ${tone}33` }}>
      <div className="flex items-start gap-2.5">
        <Icon size={17} className="mt-0.5 shrink-0" style={{ color: tone }} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-black text-white">{certified ? 'Registered and certified' : 'Registered — not certified'}</p>
          <p className="text-[11px] text-white/55 leading-relaxed mt-1">
            {certified
              ? `The landlord holds a current certificate of compliance${r.cofcIssuedDate ? `, issued ${fmtDate(r.cofcIssuedDate)}` : ''}.`
              : `This building is on the rental registry${r.regIssuedDate ? ` (registered ${fmtDate(r.regIssuedDate)})` : ''} but has no current certificate of compliance on file. City ordinance requires a rental to be certified, not just registered.`}
          </p>
          <p className="text-[10px] text-white/35 mt-1.5">{r.address}</p>
        </div>
      </div>
      {onOpenParcel && (
        <button onClick={() => onOpenParcel(r.id)}
          className="mt-2.5 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white/80 transition-colors">
          Full property record <ArrowRight size={11} />
        </button>
      )}
    </div>
  );
};

const BusinessResultView: React.FC<{ result: BizResult; onOpenParcel?: (id: string) => void }> = ({ result, onOpenParcel }) => {
  if (!result.found) {
    return (
      <div className="rounded-xl p-3.5 flex items-start gap-2.5" style={{ background: '#6F768914', border: '1px solid #6F768933' }}>
        <Info size={15} className="mt-0.5 shrink-0 text-white/40" />
        <p className="text-[12px] text-white/55 leading-relaxed">
          No active city licence matches that name{`${' '}`}
          {/* an address narrows it, so say so when one was given */}
          at that address. The register only lists businesses whose licence type requires one, so many
          legitimate businesses won't appear — try the name alone, or check the spelling.
        </p>
      </div>
    );
  }
  const b = result.data;
  return (
    <div className="rounded-xl p-3.5" style={{ background: '#3DD68C14', border: '1px solid #3DD68C33' }}>
      <div className="flex items-start gap-2.5">
        <BadgeCheck size={17} className="mt-0.5 shrink-0" style={{ color: '#3DD68C' }} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-black text-white leading-tight">{b.businessName}</p>
          <p className="text-[11px] text-white/55 leading-relaxed mt-1">
            Active in the city's licence register{b.licenseType ? ` as a ${b.licenseType.toLowerCase()}` : ''}
            {b.expirationDate ? `, current through ${fmtDate(b.expirationDate)}` : ''}.
          </p>
          {b.address && <p className="text-[10px] text-white/35 mt-1.5">{b.address}</p>}
        </div>
      </div>
      {onOpenParcel && b.parcelNumber && (
        <button onClick={() => onOpenParcel(`detroit:${b.parcelNumber}`)}
          className="mt-2.5 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white/80 transition-colors">
          See the property <ArrowRight size={11} />
        </button>
      )}
    </div>
  );
};

export default TerraLookup;
