/**
 * Terra Feed — the human face of the Open Listing Record.
 *
 * The OLR endpoint (`/api/terra/olr`) is raw JSON — right for a machine, alarming
 * for a person who just clicked a card. This page fetches that same feed and
 * renders it in plain language: what it is, the listings as listings, and the
 * developer details (raw endpoint, licence, spec) tucked into a drawer for the
 * people who actually want them.
 *
 * Same data, two audiences — nobody lands on a JSON dump they can't read.
 */

import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft, Rss, Layers, Home, Copy, Check, ExternalLink, Code2, ChevronDown, Globe, ShieldCheck,
} from 'lucide-react';
import type { OpenListingRecord } from '../../services/terra/olr';

const CIVIC = '#FF3D80';
const card = 'bg-white/[0.03] border border-white/[0.06] rounded-2xl';
const label = 'text-[10px] font-black uppercase tracking-widest text-white/30';

interface FeedPage {
  olrVersion?: string;
  resoDataDictionary?: string;
  license?: string;
  licenseUrl?: string;
  attribution?: string[];
  generatedAt?: string;
  count?: number;
  value?: OpenListingRecord[];
}

const money = (n?: number) =>
  typeof n === 'number' && Number.isFinite(n)
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
    : '—';

const STATUS_STYLE: Record<string, string> = {
  Active: 'text-emerald-400 bg-emerald-500/10',
  ComingSoon: 'text-sky-400 bg-sky-500/10',
  Pending: 'text-yellow-400 bg-yellow-500/10',
  ActiveUnderContract: 'text-yellow-400 bg-yellow-500/10',
  Closed: 'text-white/40 bg-white/5',
};

export interface TerraFeedProps {
  onBack?: () => void;
  onOpenListing?: (listingKey: string) => void;
}

export const TerraFeed: React.FC<TerraFeedProps> = ({ onBack, onOpenListing }) => {
  const [feed, setFeed] = useState<FeedPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [devOpen, setDevOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/terra/olr')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => { if (!cancelled) setFeed(d); })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const endpoint = `${(typeof window !== 'undefined' ? window.location.origin : '')}/api/terra/olr`;
  const listings = feed?.value ?? [];
  const count = feed?.count ?? listings.length;

  const copyEndpoint = async () => {
    try { await navigator.clipboard.writeText(endpoint); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* blocked */ }
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-transparent text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#0a0a0a]/90 backdrop-blur-2xl border-b border-white/[0.06] px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="p-2 rounded-xl bg-white/5 border border-white/10 text-white/50 hover:text-white/90 transition-colors shrink-0" title="Back to Terra">
              <ArrowLeft size={14} />
            </button>
          )}
          <div className="w-9 h-9 rounded-xl flex items-center justify-center border" style={{ background: `${CIVIC}20`, borderColor: `${CIVIC}40` }}>
            <Rss size={16} style={{ color: CIVIC }} />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-black uppercase tracking-widest text-white">Open Listing Record</h1>
            <p className="text-[10px] font-bold" style={{ color: CIVIC }}>Terra's open data feed</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {/* Plain-language explainer */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-6 flex items-start gap-4" style={{ background: `${CIVIC}10`, border: `1px solid ${CIVIC}30` }}>
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${CIVIC}22`, color: CIVIC }}>
            <Globe size={18} />
          </div>
          <div>
            <p className="text-base font-black text-white">Every Terra listing, out in the open</p>
            <p className="mt-1.5 text-[13px] text-white/55 leading-relaxed">
              This is Terra's promise to set property data free: every listing published here is also
              available as an <span className="text-white/80 font-semibold">open feed any website or app can mirror</span> —
              in a shared industry format, with no login and no wall. It's the opposite of a listing
              locked inside one portal. Below is what's in the feed right now.
            </p>
          </div>
        </motion.div>

        {/* Listings */}
        {loading ? (
          <div className="flex items-center gap-3 text-white/30 py-10 justify-center">
            <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            <span className="text-xs">Loading the feed…</span>
          </div>
        ) : failed ? (
          <div className={`${card} p-8 text-center`}>
            <p className="text-sm font-black text-white/50 mb-1">Couldn't reach the feed</p>
            <p className="text-xs text-white/30">The open feed is served by Terra's API — try again in a moment.</p>
          </div>
        ) : count === 0 ? (
          <div className={`${card} p-10 text-center`}>
            <div className="w-16 h-16 rounded-3xl border border-dashed border-white/15 flex items-center justify-center text-white/20 mx-auto mb-4">
              <Home size={22} />
            </div>
            <p className="text-sm font-black uppercase tracking-widest text-white/40 mb-2">No listings published yet</p>
            <p className="text-xs text-white/30 leading-relaxed max-w-sm mx-auto">
              When agents publish listings on Terra, they appear here — and from this moment anyone can
              mirror them. The feed is live and empty, not broken; it fills as Detroit comes online.
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className={label}>{count} listing{count !== 1 ? 's' : ''} in the feed</p>
              {feed?.generatedAt && <p className="text-[10px] text-white/25">as of {new Date(feed.generatedAt).toLocaleString()}</p>}
            </div>
            <div className="space-y-2">
              {listings.map(l => (
                <button key={l.ListingKey}
                  onClick={() => onOpenListing?.(l.ListingKey)}
                  className={`${card} p-4 w-full text-left flex items-center gap-4 hover:border-white/20 transition-all`}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${CIVIC}18`, color: CIVIC }}>
                    <Home size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-white truncate">{l.UnparsedAddress || 'Listing'}</p>
                    <p className="text-[10px] text-white/40">
                      {[l.City, l.StateOrProvince].filter(Boolean).join(', ')}
                      {l.BedroomsTotal ? ` · ${l.BedroomsTotal} bd` : ''}
                      {l.BathroomsTotalInteger ? ` · ${l.BathroomsTotalInteger} ba` : ''}
                      {l.LivingArea ? ` · ${l.LivingArea.toLocaleString()} sqft` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black text-white tabular-nums">{money(l.ListPrice)}</p>
                    <span className={`inline-block mt-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${STATUS_STYLE[l.StandardStatus] || 'text-white/40 bg-white/5'}`}>
                      {String(l.StandardStatus).replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Developer drawer — the raw feed, tucked away */}
        <div className={`${card} overflow-hidden`}>
          <button onClick={() => setDevOpen(o => !o)}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-white/[0.02] transition-colors">
            <Code2 size={15} className="text-white/40" />
            <div className="text-left flex-1">
              <p className="text-xs font-black text-white">For developers</p>
              <p className="text-[10px] text-white/35">The raw feed, licence, and how to mirror it</p>
            </div>
            <ChevronDown size={15} className={`text-white/40 transition-transform ${devOpen ? 'rotate-180' : ''}`} />
          </button>
          {devOpen && (
            <div className="px-5 pb-5 space-y-3 border-t border-white/[0.06] pt-4">
              <div>
                <p className={`${label} mb-1.5`}>Endpoint</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-[11px] font-mono text-white/70 bg-white/5 border border-white/10 rounded-lg px-3 py-2 truncate">{endpoint}</code>
                  <button onClick={copyEndpoint} className="p-2 rounded-lg bg-white/5 border border-white/10 text-white/50 hover:text-white/90 transition-colors shrink-0" title="Copy">
                    {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  </button>
                </div>
                <p className="text-[10px] text-white/30 mt-1.5">Page with <code className="text-white/50">?since=&lt;timestamp&gt;</code> · RESO Data Dictionary {feed?.resoDataDictionary || '1.7'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href="/api/terra/olr" target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/60 text-[10px] font-black uppercase tracking-widest hover:text-white/90 transition-colors">
                  <ExternalLink size={11} /> Raw JSON
                </a>
                <a href="/api/terra/olr-schema" target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/60 text-[10px] font-black uppercase tracking-widest hover:text-white/90 transition-colors">
                  <Code2 size={11} /> Schema
                </a>
                {feed?.licenseUrl && (
                  <a href={feed.licenseUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/60 text-[10px] font-black uppercase tracking-widest hover:text-white/90 transition-colors">
                    <ShieldCheck size={11} /> {feed.license || 'Licence'}
                  </a>
                )}
              </div>
              {feed?.attribution?.length ? (
                <div>
                  <p className={`${label} mb-1`}>Attribution (required when you mirror)</p>
                  {feed.attribution.map((a, i) => <p key={i} className="text-[10px] text-white/40 leading-relaxed">{a}</p>)}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 justify-center">
          <Layers size={11} className="text-white/25" />
          <p className="text-[10px] text-white/25">Open, mirrorable, RESO-aligned. Set free on purpose.</p>
        </div>
      </div>
    </div>
  );
};

export default TerraFeed;
