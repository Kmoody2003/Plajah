/**
 * BroadcastMultiview — the Smart Multiview at the top of Settings › Master Control.
 *
 * The MCR centerpiece: one wall of every output this account broadcasts, with broadcast-style tally
 * borders + a master status bar. Outputs come from the shared model (services/broadcastOutputs), which
 * merges configured outputs with REAL telemetry (services/broadcastTelemetry): live_feeds status drives
 * a video tile's on-air state, and a hosted Live Talk contributes a real listener count.
 *
 * Tally: GREEN on air · CYAN external/linked · GREY off. Audience is shown ONLY where a genuine count
 * exists (never invented) — the status bar says so plainly when there's no per-viewer telemetry.
 */
import React, { useEffect, useState } from 'react';
import { Video, Radio, Tv, Globe, Signal, CircleDot, Mic, RefreshCw } from 'lucide-react';
import type { UserProfile, LinkedRadioStation, Album } from '../../types';
import { fetchMyLinkedStations } from '../../services/linkedStations';
import { fetchBroadcastTelemetry, type BroadcastTelemetry } from '../../services/broadcastTelemetry';
import { buildOutputs, totalAudience, hasAudienceData, type BroadcastOutput, type OutputKind } from '../../services/broadcastOutputs';
import { fetchUserAlbums } from '../../services/backendService';
import { useRadioNowPlaying, useChannelNowPlaying } from '../../hooks/useProfileMarquee';

const KIND_ICON: Record<OutputKind, React.ComponentType<{ size?: number; className?: string }>> = {
  video: Video, radio: Radio, fast: Tv, linked: Globe, talk: Mic,
};
const KIND_LABEL: Record<OutputKind, string> = {
  video: 'video', radio: 'radio', fast: 'fast', linked: 'link', talk: 'talk',
};

const EMPTY_TELEMETRY: BroadcastTelemetry = { liveFeeds: [], liveTalk: null };

const BroadcastMultiview: React.FC<{ profile: UserProfile }> = ({ profile }) => {
  const [linked, setLinked] = useState<LinkedRadioStation[]>([]);
  const [telemetry, setTelemetry] = useState<BroadcastTelemetry>(EMPTY_TELEMETRY);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = React.useCallback(async () => {
    if (!profile.uid) return;
    setRefreshing(true);
    const [rows, tel] = await Promise.all([
      fetchMyLinkedStations(profile.uid),
      fetchBroadcastTelemetry(profile.uid),
    ]);
    setLinked(rows);
    setTelemetry(tel);
    setRefreshing(false);
  }, [profile.uid]);

  useEffect(() => {
    let alive = true;
    load();
    // Live signals move — poll while the panel is open (60s is plenty for a control room).
    const t = setInterval(() => { if (alive) load(); }, 60000);
    return () => { alive = false; clearInterval(t); };
  }, [load]);

  // Albums power the radio now-playing engine; they change rarely, so fetch once per account.
  useEffect(() => {
    let alive = true;
    if (!profile.uid) return;
    fetchUserAlbums(profile.uid).then(a => { if (alive) setAlbums(a || []); }).catch(() => { /* radio tile falls back to its static sub */ });
    return () => { alive = false; };
  }, [profile.uid]);

  // Real now-playing via the same engines the profile marquee and the players use — so the tile and
  // the surface it represents always agree. Both no-op when their feature is off.
  const radioNP = useRadioNowPlaying(profile.uid, profile, albums, !!profile.radioSettings?.enabled);
  const channelNP = useChannelNowPlaying(profile.uid, !!profile.fastChannelEnabled);

  const outputs = buildOutputs(profile, linked, telemetry).map(o => {
    if (o.id === 'plajahfm' && radioNP) {
      return { ...o, sub: `Now · ${radioNP.track.title}` };
    }
    // Only enrich the FAST tile when the channel engine actually resolved the FAST channel (not a
    // live source that happens to be the account's first channel).
    if (o.id === 'fast' && channelNP && channelNP.sourceType === 'FAST') {
      return { ...o, sub: channelNP.offAir ? 'Off air · resumes at midnight' : `Now · ${channelNP.title}` };
    }
    return o;
  });
  const onAir = outputs.filter(o => o.live).length;
  const videoCount = outputs.filter(o => o.kind === 'video' || o.kind === 'fast' || o.kind === 'talk').length;
  const audioCount = outputs.filter(o => o.kind === 'radio' || o.kind === 'linked').length;
  const audienceKnown = hasAudienceData(outputs);
  const audience = totalAudience(outputs);

  return (
    <div className="w-full p-6 sm:p-8 rounded-[2rem] bg-white/5 border border-white/10 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg,#6B0099,#D40055)' }}>
          <Signal size={22} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-black text-white tracking-tight">Smart Multiview</h3>
          <p className="text-sm text-white/40 mt-0.5">Everything this account is broadcasting — video, radio and your FAST channel, on one wall</p>
        </div>
        <button
          onClick={load}
          disabled={refreshing}
          className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors shrink-0"
          aria-label="Refresh telemetry"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Master status bar */}
      <div className="flex items-center gap-6 flex-wrap p-4 rounded-2xl bg-white/[0.03] border border-white/10">
        <Stat value={onAir} label="On air" accent={onAir > 0 ? '#06D6A0' : undefined} dot={onAir > 0} />
        <Stat value={videoCount} label="Video + FAST" />
        <Stat value={audioCount} label="Radio + linked" />
        {audienceKnown ? (
          <Stat value={audience} label="Live audience" accent="#00DAF3" />
        ) : (
          <div className="flex flex-col">
            <span className="font-mono text-2xl font-semibold leading-none text-white/30">—</span>
            <span className="text-[8px] font-black uppercase tracking-[0.14em] text-white/35 mt-1.5">Live audience</span>
          </div>
        )}
        {!audienceKnown && (
          <span className="ml-auto text-[10px] font-mono text-white/30 uppercase tracking-widest hidden sm:inline">
            No per-viewer telemetry on these outputs
          </span>
        )}
      </div>

      {/* The wall */}
      {outputs.length === 0 ? (
        <div className="p-8 rounded-2xl border border-dashed border-white/15 text-center text-white/40">
          <CircleDot size={22} className="mx-auto mb-2 text-white/25" />
          <p className="text-[11px] font-black uppercase tracking-widest">Nothing on air yet</p>
          <p className="text-[10px] text-white/30 mt-1">Go live, enable your FAST channel or Plajah FM, or link an internet station.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {outputs.map(o => <Tile key={o.id} output={o} />)}
        </div>
      )}
    </div>
  );
};

// ── Pieces ─────────────────────────────────────────────────────────────────────

const Stat: React.FC<{ value: number; label: string; accent?: string; dot?: boolean }> = ({ value, label, accent, dot }) => (
  <div className="flex flex-col">
    <span className="flex items-center gap-2 font-mono text-2xl font-semibold leading-none" style={{ color: accent || '#F6F3FB' }}>
      {dot && <span className="w-2.5 h-2.5 rounded-full" style={{ background: accent, boxShadow: `0 0 10px ${accent}` }} />}
      {value.toLocaleString()}
    </span>
    <span className="text-[8px] font-black uppercase tracking-[0.14em] text-white/35 mt-1.5">{label}</span>
  </div>
);

type TileState = 'on' | 'off' | 'external';
const STATE_META: Record<TileState, { ring: string; chip: string; bg: string; label: string }> = {
  on:       { ring: '#06D6A0', chip: 'bg-emerald-500/85 text-[#04130d]', bg: 'linear-gradient(135deg,#241a3a,#0e0b18)', label: '● ON AIR' },
  external: { ring: 'rgba(0,218,243,0.65)', chip: 'bg-[#00DAF3]/85 text-[#04222a]', bg: 'linear-gradient(135deg,#0a2730,#0e0b18)', label: '● EXTERNAL' },
  off:      { ring: 'rgba(255,255,255,0.10)', chip: 'bg-white/15 text-white/60', bg: 'linear-gradient(135deg,#16121f,#0e0b18)', label: '○ OFF' },
};

const Tile: React.FC<{ output: BroadcastOutput }> = ({ output }) => {
  const state: TileState = output.external ? 'external' : output.live ? 'on' : 'off';
  const meta = STATE_META[state];
  const Icon = KIND_ICON[output.kind];
  const audio = output.kind === 'radio' || output.kind === 'linked';
  return (
    <div className="rounded-2xl overflow-hidden bg-black" style={{ boxShadow: `inset 0 0 0 2px ${meta.ring}` }}>
      {/* Top row */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <Icon size={13} className="text-white/80" />
        </span>
        <span className="text-[11.5px] font-black text-white truncate flex-1">{output.name}</span>
        <span className="text-[8.5px] font-black uppercase tracking-widest text-white/35 shrink-0">{KIND_LABEL[output.kind]}</span>
      </div>

      {/* Screen */}
      <div className="relative" style={{ aspectRatio: '16 / 7', background: meta.bg }}>
        <span className={`absolute top-2 left-2 px-1.5 py-0.5 rounded text-[8px] font-mono font-semibold tracking-wider ${meta.chip}`}>{meta.label}</span>
        {typeof output.audience === 'number' && (
          <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[8px] font-mono font-semibold bg-black/50 text-white">
            {output.audience.toLocaleString()} live
          </span>
        )}
        {audio ? (
          <span className="absolute inset-0 flex items-end justify-center gap-[3px] pb-3" aria-hidden="true">
            {[10, 20, 14, 24, 16, 22, 12].map((h, i) => (
              <span key={i} className="w-1 rounded-full" style={{ height: state === 'off' ? 4 : h, background: state === 'external' ? '#00DAF3' : '#06D6A0', opacity: state === 'off' ? 0.3 : 0.85 }} />
            ))}
          </span>
        ) : (
          <span className="absolute inset-0" style={{ background: 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(255,255,255,0.03) 4px)' }} />
        )}
      </div>

      {/* Foot */}
      <div className="px-3 py-2">
        <span className="text-[9.5px] font-mono text-white/45 truncate block">{output.sub}</span>
      </div>
    </div>
  );
};

export default BroadcastMultiview;
