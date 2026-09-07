/**
 * BroadcastDestinations — the "Broadcast Out" rack in Settings › Master Control.
 *
 * Manage where an account simulcasts: Restream + per-platform RTMP, side by side (both models). Gated
 * to Plajah+ / Business (resolveBroadcastAccess) — the subscription covers the relay's usage cost, so
 * free accounts see an upsell, not the config. Push is reported honestly (native app today, relay
 * later, off until affordable) via resolvePushStatus; this surface only stores config — it never
 * claims to push where it can't.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Signal, Plus, Trash2, Eye, EyeOff, Loader2, Check, Lock, Sparkles, Info,
} from 'lucide-react';
import type { UserProfile, BroadcastDestination, BroadcastDestinationKind } from '../../types';
import {
  fetchMyBroadcastConfig, saveMyBroadcastConfig, newDestination, presetFor,
  DESTINATION_PRESETS, resolvePushStatus,
} from '../../services/broadcastDestinations';
import { resolveBroadcastAccess, type BroadcastAccess } from '../../services/broadcastEntitlement';
import { fetchMyLinkedStations } from '../../services/linkedStations';
import { fetchBroadcastTelemetry } from '../../services/broadcastTelemetry';
import { buildOutputs, type BroadcastOutput } from '../../services/broadcastOutputs';

const KIND_COLOR: Record<BroadcastDestinationKind, string> = {
  restream: 'linear-gradient(135deg,#6B0099,#D40055)',
  youtube: '#ff0000',
  twitch: '#6441a5',
  facebook: '#1877f2',
  kick: '#53fc18',
  custom: '#3a3a4a',
};

const initials = (label: string) => label.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || 'RT';

const BroadcastDestinations: React.FC<{ profile: UserProfile; onUpgrade?: () => void }> = ({ profile, onUpgrade }) => {
  const [access, setAccess] = useState<BroadcastAccess | null>(null);
  const [dests, setDests] = useState<BroadcastDestination[]>([]);
  const [routes, setRoutes] = useState<Record<string, string[]>>({});
  const [outputs, setOutputs] = useState<BroadcastOutput[]>([]);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const push = resolvePushStatus();

  useEffect(() => {
    let alive = true;
    (async () => {
      const acc = await resolveBroadcastAccess(profile);
      if (!alive) return;
      setAccess(acc);
      if (acc.allowed) {
        const [cfg, linked, tel] = await Promise.all([
          fetchMyBroadcastConfig(),
          fetchMyLinkedStations(profile.uid),
          fetchBroadcastTelemetry(profile.uid),
        ]);
        if (!alive) return;
        setDests(cfg.destinations);
        setRoutes(cfg.routes);
        setOutputs(buildOutputs(profile, linked, tel));
      }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [profile]);

  const patch = useCallback((id: string, p: Partial<BroadcastDestination>) => {
    setDests(prev => prev.map(d => (d.id === id ? { ...d, ...p } : d)));
    setDirty(true);
  }, []);
  const add = useCallback((kind: BroadcastDestinationKind) => {
    setDests(prev => [...prev, newDestination(kind)]);
    setDirty(true);
  }, []);
  const remove = useCallback((id: string) => {
    setDests(prev => prev.filter(d => d.id !== id));
    // Drop this destination from every output's route so the matrix never points at a ghost.
    setRoutes(prev => {
      const next: Record<string, string[]> = {};
      for (const k of Object.keys(prev)) next[k] = (prev[k] || []).filter(x => x !== id);
      return next;
    });
    setDirty(true);
  }, []);

  const toggleRoute = useCallback((outputId: string, destId: string) => {
    setRoutes(prev => {
      const cur = new Set(prev[outputId] || []);
      cur.has(destId) ? cur.delete(destId) : cur.add(destId);
      return { ...prev, [outputId]: Array.from(cur) };
    });
    setDirty(true);
  }, []);
  const toggleReveal = (id: string) => setRevealed(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await saveMyBroadcastConfig({ destinations: dests, routes });
      setDirty(false);
      setSavedAt(Date.now());
    } catch { /* keep dirty so the owner can retry */ } finally {
      setSaving(false);
    }
  }, [dests, routes]);

  // ── Loading / gate ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="w-full p-8 rounded-[2rem] bg-white/5 border border-white/10 flex items-center justify-center">
        <Loader2 size={22} className="animate-spin text-[#00DAF3]" />
      </div>
    );
  }

  if (!access?.allowed) {
    return (
      <div className="w-full p-6 sm:p-8 rounded-[2rem] border border-[#6B0099]/40 space-y-4"
        style={{ background: 'linear-gradient(135deg, rgba(107,0,153,0.25), rgba(212,0,85,0.12))' }}>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
            <Lock size={22} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-black text-white tracking-tight flex items-center gap-2">
              Broadcast Out <Sparkles size={14} className="text-[#FF8C00]" />
            </h3>
            <p className="text-sm text-white/50 mt-0.5">Simulcast every broadcast to Restream, YouTube, Twitch and any RTMP destination at once.</p>
          </div>
        </div>
        <p className="text-[12px] text-white/45 leading-relaxed">
          Broadcast Out is part of <b className="text-white/70">Plajah+ ($14.99/mo)</b> and <b className="text-white/70">Business</b>. Your subscription covers the streaming cost of sending your feed out to every platform.
        </p>
        <button
          onClick={onUpgrade}
          className="px-5 py-3 rounded-full text-[11px] font-black uppercase tracking-widest text-white inline-flex items-center gap-2"
          style={{ background: 'linear-gradient(135deg,#6B0099,#D40055)', boxShadow: '0 6px 22px rgba(212,0,85,0.34)' }}
        >
          <Sparkles size={14} /> Get Plajah+
        </button>
      </div>
    );
  }

  // ── The rack ────────────────────────────────────────────────────────────────
  const enabledCount = dests.filter(d => d.enabled).length;

  return (
    <div className="w-full p-6 sm:p-8 rounded-[2rem] bg-white/5 border border-white/10 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg,#6B0099,#D40055)' }}>
          <Signal size={22} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-black text-white tracking-tight">Broadcast Out</h3>
          <p className="text-sm text-white/40 mt-0.5">
            Simulcast to Restream and any RTMP platform — {enabledCount} destination{enabledCount === 1 ? '' : 's'} on
            <span className="ml-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#00DAF3]/15 text-[#00DAF3] border border-[#00DAF3]/25">
              {access.via === 'business' ? 'Business' : 'Plajah+'}
            </span>
          </p>
        </div>
        {dirty && (
          <button
            onClick={save}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white shrink-0 inline-flex items-center gap-2 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#6B0099,#D40055)', boxShadow: '0 6px 22px rgba(212,0,85,0.34)' }}
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
          </button>
        )}
        {!dirty && savedAt > 0 && (
          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 inline-flex items-center gap-1.5 shrink-0">
            <Check size={13} /> Saved
          </span>
        )}
      </div>

      {/* Push-status banner — honest about where the push runs. */}
      <div className={`flex items-start gap-2.5 p-3.5 rounded-2xl border ${
        push.mode === 'unavailable' ? 'bg-amber-500/10 border-amber-500/25' : 'bg-[#00DAF3]/8 border-[#00DAF3]/20'
      }`}>
        <Info size={14} className={`shrink-0 mt-0.5 ${push.mode === 'unavailable' ? 'text-amber-400' : 'text-[#00DAF3]'}`} />
        <p className={`text-[11px] leading-relaxed ${push.mode === 'unavailable' ? 'text-amber-200/80' : 'text-white/55'}`}>{push.note}</p>
      </div>

      {/* Destination list */}
      {dests.length === 0 ? (
        <p className="text-[11px] text-white/35 px-1">No destinations yet — add one below.</p>
      ) : (
        <div className="space-y-3">
          {dests.map(d => {
            const preset = presetFor(d.kind);
            const show = revealed.has(d.id);
            return (
              <div key={d.id} className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white text-[11px] font-black" style={{ background: KIND_COLOR[d.kind] }}>
                    {initials(preset.label)}
                  </div>
                  <input
                    value={d.label}
                    onChange={e => patch(d.id, { label: e.target.value })}
                    className="flex-1 min-w-0 bg-transparent text-[13px] font-black text-white focus:outline-none"
                    aria-label="Destination name"
                  />
                  <button
                    onClick={() => patch(d.id, { enabled: !d.enabled })}
                    className={`w-[42px] h-[24px] rounded-full relative shrink-0 transition-colors ${d.enabled ? 'bg-emerald-500' : 'bg-white/15'}`}
                    aria-label={d.enabled ? 'Disable destination' : 'Enable destination'}
                  >
                    <span className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white transition-all ${d.enabled ? 'right-[3px]' : 'left-[3px]'}`} />
                  </button>
                  <button onClick={() => remove(d.id)} className="p-2 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0" aria-label="Remove destination">
                    <Trash2 size={15} />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[8px] font-black uppercase tracking-widest text-white/35">RTMP server</label>
                    <input
                      value={d.rtmpUrl}
                      onChange={e => patch(d.id, { rtmpUrl: e.target.value })}
                      placeholder="rtmp://…"
                      className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[11px] font-mono text-white placeholder:text-white/25 focus:outline-none focus:border-[#00DAF3]/50"
                    />
                  </div>
                  <div>
                    <label className="text-[8px] font-black uppercase tracking-widest text-white/35">Stream key</label>
                    <div className="relative mt-1">
                      <input
                        type={show ? 'text' : 'password'}
                        value={d.streamKey}
                        onChange={e => patch(d.id, { streamKey: e.target.value })}
                        placeholder="Paste your stream key"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 pr-9 text-[11px] font-mono text-white placeholder:text-white/25 focus:outline-none focus:border-[#00DAF3]/50"
                      />
                      <button onClick={() => toggleReveal(d.id)} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70" aria-label={show ? 'Hide key' : 'Show key'}>
                        {show ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                </div>
                {preset.hint && <p className="text-[10px] text-white/30">{preset.hint}</p>}
              </div>
            );
          })}
        </div>
      )}

      {/* Routing matrix — which outputs simulcast to which destinations. */}
      {(() => {
        const cols = dests.filter(d => d.enabled);
        if (cols.length === 0 || outputs.length === 0) return null;
        return (
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-white/35 mb-2">Route outputs → destinations</p>
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full border-separate" style={{ borderSpacing: '0 6px' }}>
                <thead>
                  <tr>
                    <th className="text-left" />
                    {cols.map(c => (
                      <th key={c.id} className="px-2 pb-1 text-[8px] font-black uppercase tracking-widest text-white/40 whitespace-nowrap text-center">{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {outputs.map(o => (
                    <tr key={o.id}>
                      <td className="pr-3 py-1">
                        <div className="flex items-center gap-2 min-w-[140px]">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: o.external ? '#00DAF3' : o.live ? '#06D6A0' : 'rgba(255,255,255,0.25)' }} />
                          <span className="text-[11px] font-bold text-white/80 truncate">{o.name}</span>
                        </div>
                      </td>
                      {cols.map(c => {
                        const on = (routes[o.id] || []).includes(c.id);
                        return (
                          <td key={c.id} className="text-center px-2">
                            <button
                              onClick={() => toggleRoute(o.id, c.id)}
                              className={`w-6 h-6 rounded-lg inline-flex items-center justify-center transition-colors ${on ? 'bg-[#00DAF3] text-black' : 'bg-white/5 text-white/20 hover:bg-white/10'}`}
                              aria-label={`${on ? 'Stop routing' : 'Route'} ${o.name} to ${c.label}`}
                              aria-pressed={on}
                            >
                              {on ? <Check size={13} /> : null}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-white/30 mt-1">Pick which of your broadcasts simulcast to each destination. A green dot is on air, cyan is external.</p>
          </div>
        );
      })()}

      {/* Add destination */}
      <div>
        <p className="text-[9px] font-black uppercase tracking-widest text-white/35 mb-2">Add destination</p>
        <div className="flex flex-wrap gap-2">
          {DESTINATION_PRESETS.map(p => (
            <button
              key={p.kind}
              onClick={() => add(p.kind)}
              className="px-3.5 py-2 rounded-full bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/70 hover:text-white hover:bg-white/10 transition-colors inline-flex items-center gap-1.5"
            >
              <Plus size={12} /> {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BroadcastDestinations;
