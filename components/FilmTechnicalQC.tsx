import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Check, AlertTriangle, X, ChevronDown, Info,
  Monitor, Music2, FileText, Film, Globe, Star,
} from 'lucide-react';
import { fetchUserAlbums, auth } from '../services/backendService';
import type { Album } from '../types';

// ── Platform specs ─────────────────────────────────────────────────────────────

interface PlatformSpec {
  id: string;
  name: string;
  color: string;
  specs: {
    resolution: string;
    aspectRatio: string;
    videoCodec: string;
    bitrate: string;
    audioChannels: string;
    audioCodec: string;
    containerFormat: string;
    subtitles: string;
    posterMin: string;
  };
}

const PLATFORMS: PlatformSpec[] = [
  {
    id: 'itunes', name: 'Apple TV / iTunes', color: '#007AFF',
    specs: {
      resolution: '1920×1080 min (4K preferred)',
      aspectRatio: '16:9',
      videoCodec: 'H.264 or ProRes 422 HQ',
      bitrate: '≥ 8 Mbps (1080p)',
      audioChannels: 'Stereo (2.0) + 5.1 surround',
      audioCodec: 'AAC-LC or Dolby AC3',
      containerFormat: '.mov or .mp4',
      subtitles: 'SRT or iTT required',
      posterMin: '3840×2160 JPG/PNG',
    },
  },
  {
    id: 'prime', name: 'Amazon Prime Video', color: '#00A8E0',
    specs: {
      resolution: '1920×1080 min',
      aspectRatio: '16:9 or 1.85:1 or 2.39:1',
      videoCodec: 'H.264 High Profile',
      bitrate: '≥ 15 Mbps',
      audioChannels: 'Stereo (2.0) + 5.1 preferred',
      audioCodec: 'AAC or Dolby Digital',
      containerFormat: '.mp4 or .mov',
      subtitles: 'SRT, TTML or SCC required',
      posterMin: '1200×1600 JPG',
    },
  },
  {
    id: 'tubi', name: 'Tubi / FAST Platforms', color: '#FA4B10',
    specs: {
      resolution: '1920×1080',
      aspectRatio: '16:9',
      videoCodec: 'H.264 Main/High',
      bitrate: '6–15 Mbps',
      audioChannels: 'Stereo 2.0',
      audioCodec: 'AAC-LC',
      containerFormat: '.mp4',
      subtitles: 'SRT or VTT',
      posterMin: '1280×720 JPG',
    },
  },
  {
    id: 'filmhub', name: 'FilmHub / Aggregators', color: '#6B0099',
    specs: {
      resolution: '1920×1080 min',
      aspectRatio: '16:9',
      videoCodec: 'H.264 or ProRes',
      bitrate: '≥ 10 Mbps',
      audioChannels: 'Stereo 2.0',
      audioCodec: 'AAC or PCM',
      containerFormat: '.mp4 or .mov',
      subtitles: 'SRT required',
      posterMin: '1920×1080 JPG',
    },
  },
];

// ── QC field config ────────────────────────────────────────────────────────────

type QCFieldKey =
  | 'resolution' | 'aspectRatio' | 'videoCodec' | 'bitrate'
  | 'audioChannels' | 'audioCodec' | 'containerFormat'
  | 'subtitlesIncluded' | 'posterUploaded' | 'contentRatingSet'
  | 'runtimeMinutes';

interface QCState {
  resolution: string;
  aspectRatio: string;
  videoCodec: string;
  bitrate: string;
  audioChannels: string;
  audioCodec: string;
  containerFormat: string;
  subtitlesIncluded: boolean;
  posterUploaded: boolean;
  contentRatingSet: boolean;
  runtimeMinutes: string;
}

function defaultQC(): QCState {
  return {
    resolution: '',
    aspectRatio: '',
    videoCodec: '',
    bitrate: '',
    audioChannels: '',
    audioCodec: '',
    containerFormat: '',
    subtitlesIncluded: false,
    posterUploaded: false,
    contentRatingSet: false,
    runtimeMinutes: '',
  };
}

// ── Pass / warn / fail logic ───────────────────────────────────────────────────

type Status = 'PASS' | 'WARN' | 'FAIL' | 'EMPTY';

function checkResolution(val: string): Status {
  if (!val) return 'EMPTY';
  const m = val.match(/(\d+)\s*[×xX]\s*(\d+)/);
  if (!m) return 'WARN';
  const w = parseInt(m[1]); const h = parseInt(m[2]);
  if (w >= 3840 && h >= 2160) return 'PASS';
  if (w >= 1920 && h >= 1080) return 'PASS';
  if (w >= 1280 && h >= 720)  return 'WARN';
  return 'FAIL';
}

function checkCodec(val: string): Status {
  if (!val) return 'EMPTY';
  const v = val.toLowerCase();
  if (v.includes('prores') || v.includes('h.264') || v.includes('h264') || v.includes('hevc') || v.includes('h.265')) return 'PASS';
  if (v.includes('h.263') || v.includes('xvid') || v.includes('divx')) return 'FAIL';
  return 'WARN';
}

function checkBitrate(val: string): Status {
  if (!val) return 'EMPTY';
  const n = parseFloat(val);
  if (isNaN(n)) return 'WARN';
  if (n >= 15)  return 'PASS';
  if (n >= 8)   return 'WARN';
  return 'FAIL';
}

function boolStatus(val: boolean): Status { return val ? 'PASS' : 'FAIL'; }

function calcScore(qc: QCState): number {
  const checks: Status[] = [
    checkResolution(qc.resolution),
    checkCodec(qc.videoCodec),
    checkBitrate(qc.bitrate),
    boolStatus(qc.subtitlesIncluded),
    boolStatus(qc.posterUploaded),
    boolStatus(qc.contentRatingSet),
    qc.audioChannels ? 'PASS' : 'EMPTY',
    qc.audioCodec    ? 'PASS' : 'EMPTY',
    qc.containerFormat ? 'PASS' : 'EMPTY',
    qc.runtimeMinutes  ? 'PASS' : 'EMPTY',
  ];
  const passes = checks.filter(s => s === 'PASS').length;
  return Math.round((passes / checks.length) * 100);
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Status }) {
  const cfg = {
    PASS:  { bg: 'bg-green-500/12',  text: 'text-green-400',  icon: <Check size={10} />,         label: 'Pass'    },
    WARN:  { bg: 'bg-yellow-500/12', text: 'text-yellow-400', icon: <AlertTriangle size={10} />, label: 'Check'   },
    FAIL:  { bg: 'bg-red-500/12',    text: 'text-red-400',    icon: <X size={10} />,             label: 'Fix'     },
    EMPTY: { bg: 'bg-white/5',       text: 'text-white/20',   icon: <Info size={10} />,          label: 'Missing' },
  }[status];
  return (
    <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${cfg.bg} ${cfg.text}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function FilmTechnicalQC() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [qc, setQC] = useState<QCState>(defaultQC());
  const [activePlatform, setActivePlatform] = useState<string>('itunes');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.currentUser) return;
    fetchUserAlbums(auth.currentUser.uid).then(a => {
      const films = a.filter(x => x.type === 'VIDEO');
      setAlbums(films);
      if (films.length > 0) setSelectedId(films[0].id);
      setLoading(false);
    });
  }, []);

  const score = calcScore(qc);
  const platform = PLATFORMS.find(p => p.id === activePlatform)!;

  const inputCls = 'w-full bg-white/5 border border-white/8 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/20 transition-all';
  const labelCls = 'block text-[9px] font-black uppercase tracking-[0.3em] text-white/25 mb-1.5';

  const FIELDS: { key: keyof QCState; label: string; placeholder: string; status: Status; hint: string }[] = [
    { key: 'resolution',      label: 'Resolution',         placeholder: 'e.g. 1920×1080',         status: checkResolution(qc.resolution),  hint: '1920×1080 minimum; 3840×2160 preferred' },
    { key: 'aspectRatio',     label: 'Aspect Ratio',       placeholder: 'e.g. 16:9 or 2.39:1',    status: qc.aspectRatio ? 'PASS' : 'EMPTY', hint: '16:9 standard; 1.85:1 or 2.39:1 for cinema' },
    { key: 'videoCodec',      label: 'Video Codec',        placeholder: 'e.g. H.264 or ProRes',   status: checkCodec(qc.videoCodec),       hint: 'H.264 High Profile or ProRes 422 HQ' },
    { key: 'bitrate',         label: 'Bitrate (Mbps)',     placeholder: 'e.g. 15',                status: checkBitrate(qc.bitrate),        hint: '≥ 15 Mbps for 1080p; ≥ 50 Mbps for ProRes' },
    { key: 'audioChannels',   label: 'Audio Channels',     placeholder: 'e.g. Stereo 2.0 + 5.1', status: qc.audioChannels ? 'PASS' : 'EMPTY', hint: 'Stereo 2.0 required; 5.1 surround preferred' },
    { key: 'audioCodec',      label: 'Audio Codec',        placeholder: 'e.g. AAC-LC',            status: qc.audioCodec ? 'PASS' : 'EMPTY',    hint: 'AAC-LC or Dolby AC3/E-AC3' },
    { key: 'containerFormat', label: 'Container Format',   placeholder: 'e.g. .mp4 or .mov',     status: qc.containerFormat ? 'PASS' : 'EMPTY', hint: '.mp4 or .mov accepted by most platforms' },
    { key: 'runtimeMinutes',  label: 'Runtime (minutes)',  placeholder: 'e.g. 94',                status: qc.runtimeMinutes ? 'PASS' : 'EMPTY',  hint: 'Exact runtime required for metadata' },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <div>
        <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none text-white">Technical<br />QC</h1>
        <p className="text-white/30 text-sm font-bold uppercase tracking-widest mt-2">Deliverables checker — verify your file meets platform specs</p>
      </div>

      {/* Film selector */}
      {albums.length > 0 && (
        <div className="relative w-full max-w-sm">
          <select value={selectedId} onChange={e => { setSelectedId(e.target.value); setQC(defaultQC()); }}
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 text-sm text-white appearance-none outline-none pr-10">
            {albums.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
        </div>
      )}

      {/* Score + platform selector row */}
      <div className="flex items-start gap-6 flex-wrap">
        {/* QC Score */}
        <div className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-6 flex items-center gap-5 flex-shrink-0">
          <div className="relative w-16 h-16">
            <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.9" fill="none"
                stroke={score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444'}
                strokeWidth="3" strokeLinecap="round"
                strokeDasharray={`${score} ${100 - score}`} />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-black text-white">{score}%</span>
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-white/25">QC Score</p>
            <p className={`text-lg font-black uppercase tracking-tight ${score >= 80 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
              {score >= 80 ? 'Delivery Ready' : score >= 50 ? 'Needs Work' : 'Not Ready'}
            </p>
          </div>
        </div>

        {/* Platform tabs */}
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map(p => (
            <button key={p.id} onClick={() => setActivePlatform(p.id)}
              className="px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
              style={{
                background: activePlatform === p.id ? `${p.color}20` : 'rgba(255,255,255,0.04)',
                color:      activePlatform === p.id ? p.color : 'rgba(255,255,255,0.3)',
                border:     `1px solid ${activePlatform === p.id ? `${p.color}40` : 'rgba(255,255,255,0.07)'}`,
              }}>
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Platform spec reference */}
      <div className="p-5 rounded-2xl border" style={{ borderColor: `${platform.color}25`, background: `${platform.color}08` }}>
        <p className="text-[9px] font-black uppercase tracking-[0.3em] mb-3" style={{ color: platform.color }}>{platform.name} — Required Specs</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1.5">
          {Object.entries(platform.specs).map(([k, v]) => (
            <div key={k}>
              <span className="text-[8px] text-white/20 uppercase tracking-widest">{k.replace(/([A-Z])/g, ' $1').trim()}: </span>
              <span className="text-[9px] text-white/50">{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* QC input fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {FIELDS.map(field => (
          <div key={field.key}>
            <div className="flex items-center justify-between mb-1.5">
              <label className={labelCls}>{field.label}</label>
              <StatusBadge status={field.status} />
            </div>
            <input
              value={String(qc[field.key])}
              onChange={e => setQC(prev => ({ ...prev, [field.key]: e.target.value }))}
              placeholder={field.placeholder}
              className={inputCls}
            />
            <p className="text-[8px] text-white/18 mt-1">{field.hint}</p>
          </div>
        ))}
      </div>

      {/* Boolean checks */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { key: 'subtitlesIncluded', label: 'Subtitle / SRT file included', icon: <FileText size={14} /> },
          { key: 'posterUploaded',    label: 'High-res poster uploaded',     icon: <Film size={14} /> },
          { key: 'contentRatingSet',  label: 'Content rating declared',      icon: <Star size={14} /> },
        ].map(item => {
          const val = qc[item.key as keyof QCState] as boolean;
          return (
            <button key={item.key} onClick={() => setQC(prev => ({ ...prev, [item.key]: !prev[item.key as keyof QCState] }))}
              className="flex items-center gap-3 p-4 rounded-2xl border transition-all text-left"
              style={{
                background: val ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.02)',
                borderColor: val ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.07)',
              }}>
              <span className={val ? 'text-green-400' : 'text-white/20'}>{item.icon}</span>
              <p className={`text-xs font-black uppercase tracking-widest flex-1 ${val ? 'text-white' : 'text-white/35'}`}>{item.label}</p>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${val ? 'border-green-400 bg-green-400' : 'border-white/15'}`}>
                {val && <Check size={9} className="text-black" />}
              </div>
            </button>
          );
        })}
      </div>

      {/* Issues summary */}
      {score < 100 && (
        <div className="p-5 rounded-2xl border border-yellow-400/15 bg-yellow-400/5">
          <p className="text-[9px] font-black uppercase tracking-widest text-yellow-400 mb-3">Issues to resolve before delivery</p>
          <ul className="space-y-1.5">
            {FIELDS.filter(f => f.status === 'FAIL' || f.status === 'EMPTY').map(f => (
              <li key={f.key} className="flex items-center gap-2 text-[9px] text-white/40">
                <X size={10} className="text-red-400 flex-shrink-0" />
                {f.status === 'EMPTY' ? `${f.label} not entered` : `${f.label} does not meet spec`}
              </li>
            ))}
            {!qc.subtitlesIncluded && <li className="flex items-center gap-2 text-[9px] text-white/40"><X size={10} className="text-red-400 flex-shrink-0" />Subtitle file missing</li>}
            {!qc.posterUploaded    && <li className="flex items-center gap-2 text-[9px] text-white/40"><X size={10} className="text-red-400 flex-shrink-0" />High-res poster not confirmed</li>}
            {!qc.contentRatingSet  && <li className="flex items-center gap-2 text-[9px] text-white/40"><X size={10} className="text-red-400 flex-shrink-0" />Content rating not declared</li>}
          </ul>
        </div>
      )}
      {score === 100 && (
        <div className="p-5 rounded-2xl bg-green-500/8 border border-green-500/20 flex items-center gap-3">
          <Check size={18} className="text-green-400 flex-shrink-0" />
          <p className="text-[10px] font-black uppercase tracking-widest text-green-400">All technical checks passed — file is delivery-ready</p>
        </div>
      )}
    </motion.div>
  );
}
