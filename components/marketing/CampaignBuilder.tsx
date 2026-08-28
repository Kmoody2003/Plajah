// ─── Marketing — Campaign Builder ────────────────────────────────────────────
// The Paid-tab "New Campaign" stepper: Objective → Creative → Local Reach →
// Budget → Review & buy. Wave 1 of docs/MARKETING_LOCAL_REACH_SPEC.md — runs
// entirely on the density-model estimator (services/marketing/reachEstimateService),
// no vendor contract required. Confirming a campaign WRITES a real Campaign doc
// (services/marketing/campaignService) with placements in `status: 'estimated'`;
// it does NOT place a real order with Taradel/Adomni/Lob — that's Wave 2. The
// Review step says so; don't remove that disclosure when wiring up real vendors,
// replace it with the real order confirmation instead.

import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, ArrowLeft, ArrowRight, Target, Image as ImageIcon, MapPin, Wallet,
  Receipt, CheckCircle2, Mail, MonitorPlay, Users, Plus, Trash2, Info,
  ShieldCheck, Loader2, AlertTriangle,
} from 'lucide-react';
import type { UserProfile } from '../../types';
import type { MarketingScope } from '../MarketingKit';
import GeoRadiusPicker from './GeoRadiusPicker';
import {
  CAMPAIGN_OBJECTIVES, LOCAL_REACH_CHANNELS, CHANNEL_LABEL, CHANNEL_MODEL,
  type CampaignObjective, type CampaignCreative, type Placement, type AdChannel,
  type AudienceList,
} from '../../services/marketing/campaignTypes';
import {
  directMailEstimateForList, directMailEstimateForCount,
  type GeoReachEstimate, type ChannelEstimate,
} from '../../services/marketing/reachEstimateService';
import type { MailAddress } from '../../services/marketing/lobVerification';
import { createCampaign } from '../../services/marketing/campaignService';

// Real coordinates (Corktown, Detroit) as the default demo center. A saved
// business address should geocode this automatically once that service
// exists — for now it's fixed so the picker has something real to draw.
const DEFAULT_CENTER = { lat: 42.3316, lng: -83.0716, label: 'your storefront' };

const CHANNEL_ICON: Partial<Record<AdChannel, React.ComponentType<{ size?: number; className?: string }>>> = {
  eddm: Mail,
  billboard_dooh: MonitorPlay,
  direct_mail: Users,
};

// One address per line: "123 Main St, Detroit, MI, 48226". No quoted-comma
// support — a real CSV parser is more than this first pass needs; each
// malformed line is dropped and counted so the user sees what got skipped.
function parseAddressLines(text: string): { addresses: MailAddress[]; skipped: number } {
  const addresses: MailAddress[] = [];
  let skipped = 0;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length < 4) { skipped++; continue; }
    const [address_line1, address_city, address_state, address_zip] = parts;
    addresses.push({ address_line1, address_city, address_state, address_zip });
  }
  return { addresses, skipped };
}

const PLAJAH_FEE_PCT = 0.15; // brokered Model-B fee, see plajah-revenue-model

type StepId = 'objective' | 'creative' | 'reach' | 'budget' | 'review';
const STEPS: { id: StepId; label: string }[] = [
  { id: 'objective', label: 'Objective' },
  { id: 'creative', label: 'Creative' },
  { id: 'reach', label: 'Local Reach' },
  { id: 'budget', label: 'Budget' },
  { id: 'review', label: 'Review & buy' },
];

function cents(n: number) { return Math.round(n); }
function fmtMoney(c: number) { return `$${(c / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`; }
function fmtNum(n: number) { return n.toLocaleString(); }

export interface CampaignBuilderProps {
  scope: MarketingScope;
  currentUser: UserProfile;
  onClose: () => void;
}

export default function CampaignBuilder({ scope, currentUser, onClose }: CampaignBuilderProps) {
  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx].id;

  const [name, setName] = useState(`${scope.name || 'New'} campaign`);
  const [objective, setObjective] = useState<CampaignObjective>('traffic');
  const [creatives, setCreatives] = useState<CampaignCreative[]>([
    { id: 'c1', name: '2-for-1 Fridays', sourceLabel: 'from Pixels' },
  ]);
  const [newCreativeName, setNewCreativeName] = useState('');

  const [channels, setChannels] = useState<AdChannel[]>(['eddm', 'billboard_dooh']);
  const [radiusMi, setRadiusMi] = useState(1.5);
  const [est, setEst] = useState<GeoReachEstimate | null>(null);

  // Targeted (list-based) direct mail — separate from the radius channels
  // above; this is what services/marketing/lobVerification.ts actually wires
  // to. Not toggled through GeoRadiusPicker since it isn't map-driven.
  const [targetedMailOn, setTargetedMailOn] = useState(false);
  const [addressText, setAddressText] = useState('');
  const [mailEstimate, setMailEstimate] = useState<ChannelEstimate | null>(null);
  const [mailSkipped, setMailSkipped] = useState(0);
  const [verifyingMail, setVerifyingMail] = useState(false);
  const [mailError, setMailError] = useState<string | null>(null);

  const parsedMail = useMemo(() => parseAddressLines(addressText), [addressText]);

  async function handleVerifyMailList() {
    setVerifyingMail(true);
    setMailError(null);
    try {
      const result = await directMailEstimateForList(parsedMail.addresses);
      setMailEstimate(result);
      setMailSkipped(parsedMail.skipped);
    } catch (e: any) {
      setMailError(e?.message || 'Could not verify the list — try again');
    } finally {
      setVerifyingMail(false);
    }
  }

  const [budgetDollars, setBudgetDollars] = useState(6500);
  const [flightDays, setFlightDays] = useState(14);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleChannel = (ch: AdChannel) => {
    setChannels(cs => cs.includes(ch) ? cs.filter(c => c !== ch) : [...cs, ch]);
  };

  const placements: Placement[] = channels.map(channel => {
    const chEst = est?.byChannel[channel];
    return {
      channel,
      model: CHANNEL_MODEL[channel],
      vendor: channel === 'eddm' ? 'taradel' : channel === 'billboard_dooh' ? 'adomni' : null,
      status: 'estimated',
      units: chEst?.units,
      spendCents: chEst?.costCents,
    };
  });

  // Targeted mail is list-based, not radius-based, so it isn't part of `channels`/
  // `est` above — fold it in as its own placement once a list has been verified
  // (or at least parsed, if Lob isn't configured / the check hasn't run yet).
  const mailUnverifiedEstimate = parsedMail.addresses.length
    ? directMailEstimateForCount(parsedMail.addresses.length)
    : null;
  const activeMailEstimate = mailEstimate ?? mailUnverifiedEstimate;
  if (targetedMailOn && activeMailEstimate) {
    placements.push({
      channel: 'direct_mail',
      model: CHANNEL_MODEL.direct_mail,
      vendor: 'lob',
      status: 'estimated',
      units: activeMailEstimate.units,
      spendCents: activeMailEstimate.costCents,
    });
  }

  const mediaCents = (est?.costCents ?? 0) + (targetedMailOn ? (activeMailEstimate?.costCents ?? 0) : 0);
  const feeCents = cents(mediaCents * PLAJAH_FEE_PCT);
  const totalCents = mediaCents + feeCents;
  const overBudget = totalCents > budgetDollars * 100;

  const canNext =
    (step === 'objective' && name.trim().length > 0) ||
    (step === 'creative' && creatives.length > 0) ||
    (step === 'reach' && (channels.length > 0 || (targetedMailOn && parsedMail.addresses.length > 0))) ||
    (step === 'budget' && budgetDollars > 0) ||
    step === 'review';

  async function handleConfirm() {
    setSaving(true);
    setError(null);
    try {
      const now = Date.now();
      const list: AudienceList | undefined = targetedMailOn && activeMailEstimate
        ? {
            source: 'uploaded',
            count: activeMailEstimate.units,
          }
        : undefined;
      await createCampaign({
        scope,
        name: name.trim(),
        objective,
        schedule: { start: now, end: now + flightDays * 24 * 60 * 60 * 1000 },
        budget: { totalCents: budgetDollars * 100, currency: 'usd', pacing: 'even' },
        audience: { geo: { center: DEFAULT_CENTER, radiusMi, mode: 'radius' }, list },
        creatives,
        placements,
      });
      setSaved(true);
    } catch (e: any) {
      setError(e?.message || 'Could not save the campaign');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] bg-[#020202] text-white flex flex-col">
      {/* header */}
      <div className="flex items-center gap-3 px-4 sm:px-8 pt-5 pb-4 border-b border-white/8">
        <button
          onClick={onClose}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/10 transition-all"
        >
          <X size={13} /> Close
        </button>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#FF8C00]">New Campaign</p>
          <h1 className="text-lg sm:text-xl font-black tracking-tight truncate">{scope.name || 'Managing you'}</h1>
        </div>
      </div>

      {/* steps */}
      <div className="flex items-center gap-1 px-4 sm:px-8 py-4 overflow-x-auto border-b border-white/8">
        {STEPS.map((s, i) => (
          <React.Fragment key={s.id}>
            <div className={`flex items-center gap-2 text-xs font-bold whitespace-nowrap ${i === stepIdx ? 'text-white' : i < stepIdx ? 'text-white/60' : 'text-white/30'}`}>
              <span
                className="w-6 h-6 rounded-full grid place-items-center text-[11px] font-black"
                style={
                  i === stepIdx
                    ? { background: 'linear-gradient(135deg,#D40055,#FF8C00)', color: '#fff' }
                    : i < stepIdx
                    ? { background: 'rgba(0,218,243,0.14)', color: '#00DAF3' }
                    : { background: 'rgba(255,255,255,0.07)', color: 'inherit' }
                }
              >
                {i < stepIdx ? '✓' : i + 1}
              </span>
              {s.label}
            </div>
            {i < STEPS.length - 1 && <span className="w-5 h-px bg-white/15 mx-1" />}
          </React.Fragment>
        ))}
      </div>

      {/* body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-8 py-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="max-w-2xl mx-auto"
          >
            {step === 'objective' && (
              <div className="space-y-6">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-[#FF8C00]">
                  <Target size={13} /> What's this campaign for?
                </div>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Campaign name"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-[#FF8C00]/60"
                />
                <div className="grid sm:grid-cols-2 gap-3">
                  {CAMPAIGN_OBJECTIVES.map(o => (
                    <button
                      key={o.id}
                      onClick={() => setObjective(o.id)}
                      className={`text-left p-4 rounded-2xl border transition-all ${
                        objective === o.id ? 'border-[#FF8C00] bg-[#FF8C00]/10' : 'border-white/10 bg-white/[0.03] hover:border-white/25'
                      }`}
                    >
                      <p className="font-black text-sm">{o.label}</p>
                      <p className="text-xs text-white/50 mt-1">{o.blurb}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 'creative' && (
              <div className="space-y-6">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-[#FF8C00]">
                  <ImageIcon size={13} /> Creative on this campaign
                </div>
                <p className="text-xs text-white/40 -mt-3">
                  Pulled from your existing content — no re-upload needed. (Deep picker into the
                  Content Asset Manager lands once it exports a shared asset reference; for now,
                  name the piece you're using.)
                </p>
                <div className="space-y-2">
                  {creatives.map(c => (
                    <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/10">
                      <span
                        className="w-10 h-10 rounded-lg shrink-0"
                        style={{ background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)' }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold truncate">{c.name}</p>
                        {c.sourceLabel && <p className="text-[11px] text-[#00DAF3]">↳ {c.sourceLabel}</p>}
                      </div>
                      <button
                        onClick={() => setCreatives(cs => cs.filter(x => x.id !== c.id))}
                        className="text-white/30 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={newCreativeName}
                    onChange={e => setNewCreativeName(e.target.value)}
                    placeholder="Add a creative by name…"
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#FF8C00]/60"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newCreativeName.trim()) {
                        setCreatives(cs => [...cs, { id: `c${cs.length + 1}-${Date.now()}`, name: newCreativeName.trim() }]);
                        setNewCreativeName('');
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      if (!newCreativeName.trim()) return;
                      setCreatives(cs => [...cs, { id: `c${cs.length + 1}-${Date.now()}`, name: newCreativeName.trim() }]);
                      setNewCreativeName('');
                    }}
                    className="px-4 rounded-xl bg-white/10 hover:bg-white/15 transition-colors flex items-center gap-1.5 text-xs font-black uppercase tracking-widest"
                  >
                    <Plus size={14} /> Add
                  </button>
                </div>
              </div>
            )}

            {step === 'reach' && (
              <div className="space-y-6">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-[#FF8C00]">
                  <MapPin size={13} /> Draw your reach
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  {LOCAL_REACH_CHANNELS.map(ch => {
                    const Icon = CHANNEL_ICON[ch] ?? MapPin;
                    const on = channels.includes(ch);
                    return (
                      <button
                        key={ch}
                        onClick={() => toggleChannel(ch)}
                        className={`flex-1 flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all ${
                          on ? 'border-[#FF8C00] bg-[#FF8C00]/10' : 'border-white/10 bg-white/[0.03] hover:border-white/25'
                        }`}
                      >
                        <span className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${on ? 'bg-[#FF8C00] text-black' : 'bg-white/10 text-white/60'}`}>
                          <Icon size={16} />
                        </span>
                        <div>
                          <p className="text-sm font-black">{CHANNEL_LABEL[ch]}</p>
                          <p className="text-[11px] text-white/40">
                            {ch === 'eddm' ? 'No list, no PII — every mailbox on the routes.' : 'Digital screens, sold by impressions.'}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Targeted (list-based) mail — the real Lob adapter. Not map-driven,
                    so it lives outside the two channel buttons above and GeoRadiusPicker. */}
                <button
                  onClick={() => setTargetedMailOn(v => !v)}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all ${
                    targetedMailOn ? 'border-[#00DAF3] bg-[#00DAF3]/10' : 'border-white/10 bg-white/[0.03] hover:border-white/25'
                  }`}
                >
                  <span className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${targetedMailOn ? 'bg-[#00DAF3] text-black' : 'bg-white/10 text-white/60'}`}>
                    <Users size={16} />
                  </span>
                  <div>
                    <p className="text-sm font-black">{CHANNEL_LABEL.direct_mail}</p>
                    <p className="text-[11px] text-white/40">Mail your own list — verified address-by-address via Lob.</p>
                  </div>
                </button>

                {targetedMailOn && (
                  <div className="rounded-2xl border border-[#00DAF3]/25 bg-[#00DAF3]/[0.04] p-4 space-y-3">
                    <p className="text-[11px] text-white/50">
                      One address per line: <span className="text-white/70 font-mono text-[11px]">street, city, state, zip</span>
                    </p>
                    <textarea
                      value={addressText}
                      onChange={e => { setAddressText(e.target.value); setMailEstimate(null); }}
                      placeholder={'1442 Michigan Ave, Detroit, MI, 48216\n210 Trumbull Ave, Detroit, MI, 48216'}
                      rows={4}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs font-mono focus:outline-none focus:border-[#00DAF3]/60 resize-y"
                    />
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleVerifyMailList}
                        disabled={!parsedMail.addresses.length || verifyingMail}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest bg-[#00DAF3] text-black disabled:opacity-40 transition-all"
                      >
                        {verifyingMail ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                        {verifyingMail ? 'Verifying…' : 'Verify list'}
                      </button>
                      <span className="text-[11px] text-white/40">
                        {parsedMail.addresses.length} parsed{parsedMail.skipped > 0 ? `, ${parsedMail.skipped} skipped` : ''}
                      </span>
                    </div>

                    {mailError && (
                      <div className="flex items-start gap-2 text-xs text-red-400">
                        <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {mailError}
                      </div>
                    )}

                    {mailEstimate && (
                      <div className="flex items-center justify-between rounded-xl bg-black/20 px-3.5 py-3">
                        <div className="flex items-center gap-2">
                          {mailEstimate.source === 'live'
                            ? <ShieldCheck size={14} className="text-[#00DAF3]" />
                            : <AlertTriangle size={14} className="text-amber-400" />}
                          <div>
                            <p className="text-sm font-black tabular-nums">
                              {fmtNum(mailEstimate.units)} deliverable
                              {mailEstimate.source === 'model' && <span className="text-white/40 font-normal"> (unverified — set LOB_API_KEY server-side)</span>}
                            </p>
                            {mailEstimate.extra?.undeliverableCount ? (
                              <p className="text-[11px] text-white/40">{mailEstimate.extra.undeliverableCount} address(es) not deliverable, excluded</p>
                            ) : null}
                          </div>
                        </div>
                        <p className="font-black tabular-nums">{fmtMoney(mailEstimate.costCents)}</p>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <div className="flex items-baseline justify-between mb-2">
                    <span className="text-[11px] font-black uppercase tracking-[0.16em] text-white/50">Coverage radius</span>
                    <span className="text-2xl font-black text-[#FF8C00] tabular-nums">{radiusMi.toFixed(1)} <span className="text-sm text-white/40 font-bold">mi</span></span>
                  </div>
                  <input
                    type="range" min={0.5} max={5} step={0.1} value={radiusMi}
                    onChange={e => setRadiusMi(parseFloat(e.target.value))}
                    className="w-full accent-[#FF8C00]"
                  />
                  <GeoRadiusPicker
                    center={DEFAULT_CENTER}
                    radiusMi={radiusMi}
                    channels={channels}
                    flightDays={flightDays}
                    onChange={(_geo, e) => setEst(e)}
                  />
                </div>

                {(est || (targetedMailOn && activeMailEstimate)) && (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Estimated reach — all channels</p>
                      <p className="text-2xl font-black tabular-nums">
                        {fmtNum((est?.reach ?? 0) + (targetedMailOn ? (activeMailEstimate?.units ?? 0) : 0))}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Estimated spend — all channels</p>
                      <p className="text-2xl font-black tabular-nums">{fmtMoney(mediaCents)}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 'budget' && (
              <div className="space-y-6">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-[#FF8C00]">
                  <Wallet size={13} /> Set your cap
                </div>
                <div>
                  <label className="text-[11px] font-black uppercase tracking-widest text-white/50 mb-2 block">Budget cap (USD)</label>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-black text-white/40">$</span>
                    <input
                      type="number" min={0} step={50}
                      value={budgetDollars}
                      onChange={e => setBudgetDollars(Math.max(0, Number(e.target.value)))}
                      className="w-40 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-2xl font-black tabular-nums focus:outline-none focus:border-[#FF8C00]/60"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-black uppercase tracking-widest text-white/50 mb-2 block">Flight length</label>
                  <div className="flex gap-2">
                    {[7, 14, 30].map(d => (
                      <button
                        key={d}
                        onClick={() => setFlightDays(d)}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                          flightDays === d ? 'bg-[#FF8C00] text-black' : 'bg-white/5 text-white/50 hover:bg-white/10'
                        }`}
                      >
                        {d} days
                      </button>
                    ))}
                  </div>
                </div>
                {est && totalCents > budgetDollars * 100 && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
                    <Info size={14} className="shrink-0 mt-0.5" />
                    Current selection (~{fmtMoney(totalCents)} incl. fee) is over this cap — lower the radius or raise the cap on the review step.
                  </div>
                )}
              </div>
            )}

            {step === 'review' && (
              <div className="space-y-5">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-[#FF8C00]">
                  <Receipt size={13} /> Review &amp; buy
                </div>

                <div className="space-y-2">
                  {placements.map(p => {
                    const Icon = CHANNEL_ICON[p.channel] ?? MapPin;
                    return (
                      <div key={p.channel} className="flex items-center gap-3 p-3.5 rounded-2xl border border-white/10 bg-white/[0.03]">
                        <span className="w-10 h-10 rounded-xl grid place-items-center shrink-0 bg-white/10">
                          <Icon size={17} className="text-[#FF8C00]" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-black">{CHANNEL_LABEL[p.channel]}</p>
                          <p className="text-[11px] text-white/40">
                            {p.units
                              ? `${fmtNum(p.units)} ${p.channel === 'eddm' ? 'mailboxes' : p.channel === 'direct_mail' ? 'addresses' : 'est. reach'}`
                              : '—'} · via {p.vendor}
                          </p>
                        </div>
                        <p className="font-black tabular-nums">{fmtMoney(p.spendCents ?? 0)}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 space-y-2 text-sm">
                  <div className="flex justify-between text-white/60">
                    <span>Media &amp; production</span>
                    <span className="tabular-nums">{fmtMoney(mediaCents)}</span>
                  </div>
                  <div className="flex justify-between text-white/60">
                    <span className="flex items-center gap-1.5">
                      Plajah service fee
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-[#D40055]/15 text-[#D40055]">15%</span>
                    </span>
                    <span className="tabular-nums">{fmtMoney(feeCents)}</span>
                  </div>
                  <div className="flex justify-between items-baseline pt-2 mt-1 border-t border-white/10">
                    <span className="font-black">Estimated total</span>
                    <span className="text-2xl font-black tabular-nums" style={{ color: overBudget ? '#EF4444' : '#fff' }}>
                      {fmtMoney(totalCents)}
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-2 p-3 rounded-xl bg-white/[0.03] border border-white/10 text-[11px] text-white/50">
                  <Info size={13} className="shrink-0 mt-0.5 text-[#00DAF3]" />
                  This saves your campaign and locks in the plan. Placing the real order with Taradel
                  (EDDM) and Adomni (billboards) is the next build wave — for now, those two placements
                  are saved as <span className="text-white/70 font-semibold">estimated</span>, not purchased.
                  {targetedMailOn && (
                    <> Targeted mail addresses{mailEstimate?.source === 'live' ? ' were genuinely verified by Lob' : ' are an unverified estimate — set LOB_API_KEY to verify them for real'} before saving, though sending the mailer is still a manual step for now.</>
                  )}
                  {' '}Plajah never holds your funds; you'll pay each vendor directly at booking.
                </div>

                {error && <p className="text-xs text-red-400">{error}</p>}

                {saved ? (
                  <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                    <CheckCircle2 size={20} />
                    <div>
                      <p className="font-black text-sm">Campaign saved as a draft</p>
                      <p className="text-xs text-emerald-300/70">You can find it under Marketing → Paid → Campaigns.</p>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleConfirm}
                    disabled={saving}
                    className="w-full py-3.5 rounded-2xl text-sm font-black uppercase tracking-widest text-black transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                    style={{ background: '#FF8C00' }}
                  >
                    {saving ? 'Saving…' : `Save campaign · ${fmtMoney(totalCents)}`}
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* footer nav */}
      {!saved && (
        <div className="flex items-center justify-between px-4 sm:px-8 py-4 border-t border-white/8">
          <button
            onClick={() => setStepIdx(i => Math.max(0, i - 1))}
            disabled={stepIdx === 0}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-white/5 border border-white/10 text-xs font-black uppercase tracking-widest text-white/60 hover:text-white disabled:opacity-30 transition-all"
          >
            <ArrowLeft size={13} /> Back
          </button>
          {step !== 'review' && (
            <button
              onClick={() => setStepIdx(i => Math.min(STEPS.length - 1, i + 1))}
              disabled={!canNext}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-full text-xs font-black uppercase tracking-widest text-black disabled:opacity-40 transition-all hover:scale-[1.02]"
              style={{ background: '#FF8C00' }}
            >
              Next <ArrowRight size={13} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
