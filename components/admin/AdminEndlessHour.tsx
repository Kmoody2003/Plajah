// Admin · The Endless Hour (channel 8.1).
//
// Two halves. The VIEWER is a live, read-only monitor of the deterministic channel — what's on
// air right now, whether a song is crossfading in, and which Inflection Point is currently bending
// the procedural sound. Because the schedule is a pure function of the clock + the pool, this is a
// true single source of truth: it shows exactly what every viewer in the world is hearing.
//
// The CONTROLS edit the song pool and the policy. Admins never hand-trigger the live stream (that
// would desync everyone); they shape the pool + policy, and the clock runs it. Saving also mirrors
// the enabled pool into the global, platform-curated "Inflection Points" Chora playlist.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Radio, Trash2, Save, Check, Music2, Loader2, Eye, EyeOff, Info, FolderOpen, FileAudio, Link2 } from 'lucide-react';
import {
  fetchEndlessHourConfig, updateEndlessHourConfig, syncInflectionPlaylist, INFLECTION_PLAYLIST_ID, uploadFile,
} from '../../services/backendService';
import {
  EMPTY_ENDLESS_HOUR_CONFIG, DEFAULT_INFLECTION_POLICY,
  sharedSongAt, sharedInflectionAt, songTimelineForDay,
  type EndlessHourConfig, type InflectionSong,
} from '../../services/fast/inflection';
import { programmeAt, arcPositionAt } from '../../services/fast/generativeChannel';
import EndlessHourPlayer from '../tv/EndlessHourPlayer';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MODES: InflectionSong['mode'][] = ['major', 'minor', 'dorian', 'phrygian', 'aeolian', 'lydian', 'mixolydian'];
const fmtMin = (sec: number) => `${Math.round(sec / 60)}m`;
const fmtClock = (secOfDay: number) => {
  const h = Math.floor(secOfDay / 3600) % 24;
  const m = Math.floor((secOfDay % 3600) / 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} UTC`;
};

const blankSong = (): InflectionSong => ({
  id: `song_${Date.now().toString(36)}`,
  title: '', artist: '', audioUrl: '', coverUrl: '', durationSec: 180,
  key: 0, mode: 'aeolian', brightness: 0.5, energy: 0.5, enabled: true, weight: 1,
});

const AUDIO_RE = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|aif|aiff|webm|weba|wma)$/i;
const isAudio = (f: File) => f.type.startsWith('audio/') || AUDIO_RE.test(f.name);
const titleFromName = (name: string) => name.replace(/\.[^/.]+$/, '').replace(/[_]+/g, ' ').trim();

/** Read a file's duration client-side, before upload, via a throwaway <audio> element. */
const readDuration = (file: File): Promise<number> =>
  new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const a = document.createElement('audio');
      a.preload = 'metadata';
      const done = (d: number) => { URL.revokeObjectURL(url); resolve(Number.isFinite(d) && d > 1 ? Math.round(d) : 180); };
      a.onloadedmetadata = () => done(a.duration);
      a.onerror = () => done(180);
      a.src = url;
    } catch { resolve(180); }
  });

const Field: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({ label, children, hint }) => (
  <label className="flex flex-col gap-1">
    <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{label}</span>
    {children}
    {hint && <span className="text-[10px] text-white/25">{hint}</span>}
  </label>
);

const inputCls = 'bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#FF8C00] outline-none';

const AdminEndlessHour: React.FC = () => {
  const [config, setConfig] = useState<EndlessHourConfig>(EMPTY_ENDLESS_HOUR_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  /** Files mid-upload, shown with a progress bar; each becomes a pool entry when it finishes. */
  const [uploading, setUploading] = useState<Array<{ id: string; name: string; progress: number; error?: string }>>([]);
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    fetchEndlessHourConfig().then((c) => { if (alive) { setConfig(c); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  // The live viewer ticks once a second — enough for a channel that moves over minutes.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const patchPolicy = (patch: Partial<EndlessHourConfig['policy']>) =>
    setConfig((c) => ({ ...c, policy: { ...c.policy, ...patch } }));
  const patchSong = (i: number, patch: Partial<InflectionSong>) =>
    setConfig((c) => ({ ...c, pool: c.pool.map((s, k) => (k === i ? { ...s, ...patch } : s)) }));
  const addSong = () => setConfig((c) => ({ ...c, pool: [...c.pool, blankSong()] }));
  const removeSong = (i: number) => setConfig((c) => ({ ...c, pool: c.pool.filter((_, k) => k !== i) }));

  /**
   * Bulk-add: take a folder or a multi-file selection, upload every audio file, and drop each into
   * the pool with sensible defaults (title from the filename, duration read from the file). The
   * inflection fields land on defaults so you can edit them in place afterwards, then Save.
   */
  const handleFiles = useCallback(async (list: FileList | null) => {
    if (!list) return;
    const files = Array.from(list).filter(isAudio);
    if (!files.length) return;
    for (const file of files) {
      const id = `song_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
      setUploading((u) => [...u, { id, name: file.name, progress: 0 }]);
      try {
        const [url, durationSec] = await Promise.all([
          // Upload under `uploads/` — the app's standard, already-permitted Storage path (any
          // signed-in user, public read). The dedicated `endlessHour/` path matches no deployed
          // Storage rule and falls through to an admin-only fallback that always denies here, so it
          // gave "permission denied" even when signed in. uploadFile reports 0..100; bar is 0..1.
          uploadFile(`uploads/inflection/${id}_${file.name}`, file, (p) =>
            setUploading((u) => u.map((x) => (x.id === id ? { ...x, progress: Math.max(0, Math.min(1, p / 100)) } : x)))),
          readDuration(file),
        ]);
        setConfig((c) => ({
          ...c,
          pool: [...c.pool, { ...blankSong(), id, title: titleFromName(file.name), audioUrl: url, durationSec }],
        }));
        setUploading((u) => u.filter((x) => x.id !== id));
      } catch (e) {
        setUploading((u) => u.map((x) => (x.id === id ? { ...x, error: String((e as Error)?.message || e) } : x)));
      }
    }
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await updateEndlessHourConfig(config);
      await syncInflectionPlaylist(config.pool);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  // ── Live deterministic state (what's on air this second) ──
  const live = useMemo(() => {
    const prog = programmeAt(now);
    const pos = arcPositionAt(now);
    const song = sharedSongAt(now, config);
    const inflection = sharedInflectionAt(now, config);
    const secOfDay = (now - Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate())) / 1000;
    const upcoming = songTimelineForDay(now, config).filter((s) => s.startSec > secOfDay).slice(0, 5);
    return { prog, pos, song, inflection, upcoming };
  }, [now, config]);

  const enabledCount = config.pool.filter((s) => s.enabled && s.audioUrl).length;

  if (loading) {
    return <div className="grid place-items-center h-64 text-white/40"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <div className="max-w-5xl mx-auto pb-16 text-white">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-2xl grid place-items-center" style={{ background: 'linear-gradient(135deg,#C9B6FF,#9C86E0)' }}>
          <Radio size={20} className="text-black" />
        </div>
        <div>
          <h2 className="text-2xl font-black">The Endless Hour</h2>
          <p className="text-white/40 text-sm">Channel 8.1 · generative meditation broadcast + Inflection Points</p>
        </div>
      </div>

      {/* ── LIVE VIEWER ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">On air now</span>
          <button onClick={() => setPreview((p) => !p)} className="flex items-center gap-1.5 text-[11px] font-bold text-white/50 hover:text-white">
            {preview ? <EyeOff size={13} /> : <Eye size={13} />} {preview ? 'Stop preview' : 'Preview channel'}
          </button>
        </div>

        {preview && (
          <div className="relative h-56 rounded-xl overflow-hidden mb-4 border border-white/10">
            <EndlessHourPlayer muted={false} noticesEnabled={false} />
          </div>
        )}

        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/30 mb-1">Programme</p>
            <p className="text-lg font-black leading-tight">{live.prog.title}</p>
            <p className="text-[11px] text-white/40">{live.prog.form.daypart} · arc #{live.pos.arcIndex} · {Math.floor(live.pos.offsetSec / 60)}m in</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/30 mb-1">Sound now</p>
            {live.song ? (
              <>
                <p className="text-lg font-black leading-tight text-[#C9B6FF]">♪ {live.song.song.title}</p>
                <p className="text-[11px] text-white/40">{Math.floor(live.song.offsetSec)}s in · bed {(live.song.bedGain * 100).toFixed(0)}% / song {(live.song.songGain * 100).toFixed(0)}%</p>
              </>
            ) : (
              <p className="text-lg font-light text-white/60">Generative bed</p>
            )}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/30 mb-1">Inflection</p>
            {live.inflection ? (
              <>
                <p className="text-lg font-black leading-tight">{live.inflection.song.title}</p>
                <p className="text-[11px] text-white/40">
                  strength {(live.inflection.strength * 100).toFixed(0)}% · {live.inflection.transpose >= 0 ? '+' : ''}{live.inflection.transpose} st
                </p>
              </>
            ) : (
              <p className="text-lg font-light text-white/60">None</p>
            )}
          </div>
        </div>

        {live.upcoming.length > 0 && (
          <div className="mt-4 pt-4 border-t border-white/5">
            <p className="text-[10px] uppercase tracking-widest text-white/30 mb-2">Next Inflection Points today</p>
            <div className="flex flex-wrap gap-2">
              {live.upcoming.map((s, i) => (
                <span key={i} className="text-[11px] px-2.5 py-1 rounded-lg bg-white/5 text-white/60">
                  <span className="font-mono text-white/40">{fmtClock(s.startSec)}</span> · {s.song.title || s.song.id}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── POLICY ──────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Policy</span>
          <button
            onClick={() => patchPolicy({ enabled: !config.policy.enabled })}
            className={`text-[11px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full ${config.policy.enabled ? 'bg-[#FF8C00] text-black' : 'bg-white/10 text-white/50'}`}
          >
            {config.policy.enabled ? 'Songs ON' : 'Songs OFF (purely generative)'}
          </button>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Min gap (min)"><input type="number" className={inputCls} value={Math.round(config.policy.minGapSec / 60)} onChange={(e) => patchPolicy({ minGapSec: Math.max(60, Number(e.target.value) * 60) })} /></Field>
          <Field label="Max gap (min)"><input type="number" className={inputCls} value={Math.round(config.policy.maxGapSec / 60)} onChange={(e) => patchPolicy({ maxGapSec: Math.max(60, Number(e.target.value) * 60) })} /></Field>
          <Field label="Crossfade (sec)"><input type="number" className={inputCls} value={config.policy.crossfadeSec} onChange={(e) => patchPolicy({ crossfadeSec: Math.max(1, Number(e.target.value)) })} /></Field>
          <Field label="Inflection decay (min)" hint="how long the sound carries a song afterward"><input type="number" className={inputCls} value={Math.round(config.policy.inflectionDecaySec / 60)} onChange={(e) => patchPolicy({ inflectionDecaySec: Math.max(60, Number(e.target.value) * 60) })} /></Field>
          <Field label={`Inflection strength · ${(config.policy.inflectionStrength * 100).toFixed(0)}%`} hint="how far a song bends the engine"><input type="range" min={0} max={1} step={0.05} value={config.policy.inflectionStrength} onChange={(e) => patchPolicy({ inflectionStrength: Number(e.target.value) })} /></Field>
          <Field label={`Sola song chance · ${(config.policy.solaSongChance * 100).toFixed(0)}%`} hint="odds a private burst gets a song"><input type="range" min={0} max={1} step={0.05} value={config.policy.solaSongChance} onChange={(e) => patchPolicy({ solaSongChance: Number(e.target.value) })} /></Field>
        </div>
      </div>

      {/* ── POOL ────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 mb-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Song pool · {enabledCount} live of {config.pool.length}</span>
          <div className="flex items-center gap-2">
            {/* Hidden inputs: one for a folder, one for a multi-file selection. */}
            <input
              ref={folderInput} type="file" hidden accept="audio/*" multiple
              // webkitdirectory / directory make this a folder picker (not typed by React).
              {...({ webkitdirectory: '', directory: '' } as any)}
              onChange={(e) => { void handleFiles(e.target.files); e.currentTarget.value = ''; }}
            />
            <input
              ref={filesInput} type="file" hidden accept="audio/*" multiple
              onChange={(e) => { void handleFiles(e.target.files); e.currentTarget.value = ''; }}
            />
            <button onClick={() => folderInput.current?.click()} className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full bg-[#FF8C00] text-black hover:brightness-110"><FolderOpen size={13} /> Add folder</button>
            <button onClick={() => filesInput.current?.click()} className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15"><FileAudio size={13} /> Add files</button>
            <button onClick={addSong} className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15"><Link2 size={13} /> By URL</button>
          </div>
        </div>

        {/* Uploads in flight — each becomes a pool entry below when it finishes. */}
        {uploading.length > 0 && (
          <div className="flex flex-col gap-2 mb-4">
            {uploading.map((u) => (
              <div key={u.id} className="flex items-center gap-3 text-[12px]">
                {u.error ? <Trash2 size={13} className="text-red-400 shrink-0" /> : <Loader2 size={13} className="animate-spin text-white/50 shrink-0" />}
                <span className="text-white/60 truncate flex-1">{u.name}</span>
                {u.error
                  ? <span className="text-red-400 text-[10px]">{u.error}</span>
                  : <div className="w-28 h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-[#FF8C00]" style={{ width: `${Math.round(u.progress * 100)}%` }} /></div>}
              </div>
            ))}
          </div>
        )}

        {config.pool.length === 0 && uploading.length === 0 && (
          <p className="text-white/40 text-sm py-6 text-center">No songs yet. <b className="text-white/60">Add a folder</b> or a set of files to upload several at once — then edit each one's key, mode, brightness and energy below (that's what decides how it bends the soundscape), and Save.</p>
        )}

        <div className="flex flex-col gap-4">
          {config.pool.map((s, i) => (
            <div key={s.id} className={`rounded-xl border p-4 ${s.enabled ? 'border-white/10 bg-white/[0.02]' : 'border-white/5 bg-transparent opacity-60'}`}>
              <div className="flex items-center gap-3 mb-3">
                <button onClick={() => patchSong(i, { enabled: !s.enabled })} className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded ${s.enabled ? 'bg-green-500/20 text-green-300' : 'bg-white/10 text-white/40'}`}>{s.enabled ? 'Enabled' : 'Off'}</button>
                <Music2 size={14} className="text-white/30" />
                <span className="text-[11px] text-white/30 font-mono">{s.id}</span>
                <button onClick={() => removeSong(i)} className="ml-auto text-white/30 hover:text-red-400"><Trash2 size={15} /></button>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Title"><input className={inputCls} value={s.title} onChange={(e) => patchSong(i, { title: e.target.value })} /></Field>
                <Field label="Artist"><input className={inputCls} value={s.artist} onChange={(e) => patchSong(i, { artist: e.target.value })} /></Field>
                <Field label="Audio URL"><input className={inputCls} value={s.audioUrl} onChange={(e) => patchSong(i, { audioUrl: e.target.value })} placeholder="https://…" /></Field>
                <Field label="Cover URL"><input className={inputCls} value={s.coverUrl || ''} onChange={(e) => patchSong(i, { coverUrl: e.target.value })} placeholder="https://…" /></Field>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mt-3">
                <Field label="Duration (s)"><input type="number" className={inputCls} value={s.durationSec} onChange={(e) => patchSong(i, { durationSec: Math.max(1, Number(e.target.value)) })} /></Field>
                <Field label="Key"><select className={inputCls} value={s.key} onChange={(e) => patchSong(i, { key: Number(e.target.value) })}>{NOTE_NAMES.map((n, k) => <option key={k} value={k}>{n}</option>)}</select></Field>
                <Field label="Mode"><select className={inputCls} value={s.mode} onChange={(e) => patchSong(i, { mode: e.target.value as InflectionSong['mode'] })}>{MODES.map((m) => <option key={m} value={m}>{m}</option>)}</select></Field>
                <Field label={`Bright ${(s.brightness * 100).toFixed(0)}%`}><input type="range" min={0} max={1} step={0.05} value={s.brightness} onChange={(e) => patchSong(i, { brightness: Number(e.target.value) })} /></Field>
                <Field label={`Energy ${(s.energy * 100).toFixed(0)}%`}><input type="range" min={0} max={1} step={0.05} value={s.energy} onChange={(e) => patchSong(i, { energy: Number(e.target.value) })} /></Field>
                <Field label="Weight"><input type="number" className={inputCls} value={s.weight ?? 1} step={0.5} onChange={(e) => patchSong(i, { weight: Math.max(0.1, Number(e.target.value)) })} /></Field>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Playlist note + Save */}
      <div className="flex items-start gap-2 text-[11px] text-white/40 mb-4">
        <Info size={14} className="shrink-0 mt-0.5" />
        <p>Saving mirrors the enabled songs into the global, platform-curated <b className="text-white/70">Inflection Points</b> Chora playlist (<span className="font-mono">{INFLECTION_PLAYLIST_ID}</span>) — visible to everyone under Staff Picks — and updates the live channel schedule.</p>
      </div>
      <button
        onClick={save}
        disabled={saving}
        className={`flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all ${saved ? 'bg-green-500 text-white' : 'bg-[#FF8C00] text-black hover:brightness-110'}`}
      >
        {saved ? <><Check size={15} /> Saved & synced</> : saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><Save size={15} /> Save pool, policy & sync playlist</>}
      </button>
    </div>
  );
};

export default AdminEndlessHour;
