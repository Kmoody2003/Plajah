/**
 * AddStationModal — "bring your internet radio station on by link".
 *
 * Paste the public stream URL you already broadcast on; it's verified in place (see
 * services/linkedStations.verifyStreamUrl — an honest browser-side probe, not a fake spinner), then
 * published to the Radio directory and pinned to your profile. Blocked only on a genuinely invalid
 * URL or an empty name — an http-only or HLS stream can still be linked (stored unverified), because
 * it may play fine for the owner's listeners on Safari/iOS even when this browser can't confirm it.
 *
 * Styling follows the LiveRadioBrowser idiom (cyan #00DAF3 accent, glass surfaces, house uppercase
 * tracking); portaled to <body> so it sits above the directory.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Globe, Loader2, CheckCircle2, AlertTriangle, ShieldAlert, X, Radio, Link2,
} from 'lucide-react';
import type { LinkedRadioStation } from '../../types';
import {
  verifyStreamUrl, addLinkedStation, normalizeStreamUrl, type StreamProbe,
} from '../../services/linkedStations';

interface AddStationModalProps {
  ownerUid: string;
  ownerName: string;
  ownerAvatar?: string;
  onClose: () => void;
  onAdded: (station: LinkedRadioStation) => void;
}

type Verify = { state: 'idle' | 'checking' | 'done'; probe?: StreamProbe };

const AddStationModal: React.FC<AddStationModalProps> = ({ ownerUid, ownerName, ownerAvatar, onClose, onAdded }) => {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [genre, setGenre] = useState('');
  const [country, setCountry] = useState('');
  const [homepage, setHomepage] = useState('');
  const [verify, setVerify] = useState<Verify>({ state: 'idle' });
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reqRef = useRef(0);

  // Debounced verification whenever the URL settles.
  useEffect(() => {
    const raw = url.trim();
    if (!raw) { setVerify({ state: 'idle' }); return; }
    if (!normalizeStreamUrl(raw)) { setVerify({ state: 'idle' }); return; }
    setVerify({ state: 'checking' });
    const token = ++reqRef.current;
    const t = setTimeout(async () => {
      const probe = await verifyStreamUrl(raw);
      if (token !== reqRef.current) return; // a newer edit won
      setVerify({ state: 'done', probe });
    }, 500);
    return () => clearTimeout(t);
  }, [url]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const urlValid = !!normalizeStreamUrl(url.trim());
  const canPublish = urlValid && !!name.trim() && !publishing;
  const probe = verify.probe;

  const publish = useCallback(async () => {
    if (!canPublish) return;
    setPublishing(true);
    setError(null);
    try {
      const station = await addLinkedStation({
        name: name.trim(),
        streamUrl: url.trim(),
        genre: genre.trim() || undefined,
        tags: genre.trim() ? [genre.trim().toLowerCase()] : [],
        country: country.trim() || undefined,
        homepage: homepage.trim() || undefined,
        codec: probe?.codec,
        ownerName,
        ownerAvatar,
      });
      onAdded(station);
    } catch (e: any) {
      setError(e?.message || 'Couldn’t publish the station. Try again.');
      setPublishing(false);
    }
  }, [canPublish, name, url, genre, country, homepage, probe, ownerName, ownerAvatar, onAdded]);

  const modal = (
    <div
      className="fixed inset-0 z-[3000] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Link your internet radio station"
    >
      <div
        className="w-full sm:max-w-lg bg-theme-card rounded-t-3xl sm:rounded-3xl border border-white/10 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-white/5 flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-[#00DAF3]/15">
            <Link2 size={18} className="text-[#00DAF3]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black uppercase tracking-tight text-white">Bring your station on</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mt-0.5">
              Link the stream you already broadcast on
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/5 text-white/50 hover:text-white" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar">
          {/* Stream URL */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-white/50">Stream URL</label>
            <div className="relative mt-2">
              <Globe size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://stream.your-station.com/live"
                autoFocus
                className="w-full bg-white/5 border border-white/10 rounded-2xl pl-11 pr-11 py-3 text-sm font-mono placeholder:text-white/25 focus:outline-none focus:border-[#00DAF3]/50 transition-colors"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2">
                {verify.state === 'checking' && <Loader2 size={16} className="animate-spin text-[#00DAF3]" />}
                {verify.state === 'done' && probe?.ok && <CheckCircle2 size={16} className="text-emerald-400" />}
                {verify.state === 'done' && !probe?.ok && <AlertTriangle size={16} className="text-amber-400" />}
              </span>
            </div>

            {/* Probe result */}
            {verify.state === 'done' && probe && (
              <div className="mt-3">
                {probe.ok ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/25"><CheckCircle2 size={10} /> Reachable</Badge>
                    {probe.codec && <Badge className="bg-white/5 text-white/50 border-white/10">{probe.codec}</Badge>}
                    <Badge className="bg-white/5 text-white/50 border-white/10">HTTPS</Badge>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25">
                    <ShieldAlert size={14} className="text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-200/80 leading-relaxed">{probe.reason}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Name */}
          <Field label="Station name" value={name} onChange={setName} placeholder="e.g. KMOD-FM" />

          {/* Genre + Country */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Genre" value={genre} onChange={setGenre} placeholder="Soul, Talk…" />
            <Field label="City / Country" value={country} onChange={setCountry} placeholder="Detroit, US" />
          </div>

          {/* Homepage */}
          <Field label="Homepage (optional)" value={homepage} onChange={setHomepage} placeholder="https://your-station.com" mono />

          <p className="text-[10.5px] text-white/35 leading-relaxed flex items-start gap-2">
            <Radio size={13} className="shrink-0 mt-0.5 text-white/30" />
            Once linked, <b className="text-white/55 font-bold">{name.trim() || 'your station'}</b> appears in the Radio directory under Creator Stations and on your profile — and plays through Plajah’s player like any other station.
          </p>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-2xl bg-red-500/10 border border-red-500/25">
              <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-red-200/80 leading-relaxed">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-white/5 flex items-center gap-3">
          <button
            onClick={onClose}
            className="px-5 py-3 rounded-full text-[11px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={publish}
            disabled={!canPublish}
            className="ml-auto px-6 py-3 rounded-full text-[11px] font-black uppercase tracking-widest transition-all inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed text-white"
            style={{ background: canPublish ? 'linear-gradient(135deg,#6B0099,#D40055)' : 'rgba(255,255,255,0.08)', boxShadow: canPublish ? '0 6px 22px rgba(212,0,85,0.34)' : 'none' }}
          >
            {publishing ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
            {publishing ? 'Publishing…' : 'Publish to directory + profile'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

// ── Small primitives ─────────────────────────────────────────────────────────

const Field: React.FC<{
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean;
}> = ({ label, value, onChange, placeholder, mono }) => (
  <div>
    <label className="text-[10px] font-black uppercase tracking-widest text-white/50">{label}</label>
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`mt-2 w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm placeholder:text-white/25 focus:outline-none focus:border-[#00DAF3]/50 transition-colors ${mono ? 'font-mono' : ''}`}
    />
  </div>
);

const Badge: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <span className={`px-2.5 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest inline-flex items-center gap-1.5 ${className}`}>
    {children}
  </span>
);

export default AddStationModal;
