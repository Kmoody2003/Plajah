// Stage → Network outputs: send Program as NDI, OMT or SRT (caller / listener) from the Windows app.
// Logic and status live in services/ambo/networkOutputs.ts; this is only the settings + status UI.
import React, { useState } from 'react';
import { Plus, Trash2, Copy, ChevronDown, Lock } from 'lucide-react';
import { useNetworkOutputs } from '../../services/ambo/networkOutputsRuntime';
import {
  parseSrtUrl, buildSrtUrl, validateSrt, srtReceiverHint, stateWords,
  type NetworkOutputKind, type OutputView, type OutputUiState, type SrtSettings,
} from '../../services/ambo/networkOutputs';
import { ProtocolBadge } from './AmboDiscoveryBits';

const DOT: Record<OutputUiState, string> = {
  live: '#34d399', waiting: '#7c9ce8', starting: '#ffd166', retrying: '#ffb84d', restarting: '#ffb84d',
  error: '#f87171', stopped: '#6b7280', off: '#4b5563', unsupported: '#6b7280', 'needs-passphrase': '#ffd166',
};
const field = 'bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white outline-none focus:border-[#FF8C00]/60 min-w-0';
const SIZES = [[1920, 1080], [1280, 720], [3840, 2160]] as const;
const FPS = [24, 25, 29.97, 30, 50, 59.94, 60];

export const AmboNetworkOutputsPanel: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const mgr = useNetworkOutputs();
  const views = mgr.getViews();
  const fmt = mgr.getFormat();
  const srt = mgr.srtStatus();
  const add = (k: NetworkOutputKind) => mgr.add(k);
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 space-y-2 text-white">
      <div className="flex items-center gap-2">
        <div className="text-[11px] font-bold text-white/85 flex-1">Network outputs <span className="font-normal text-white/40">Program as NDI, OMT or SRT</span></div>
        {(['ndi', 'omt', 'srt'] as const).map(k => (
          <button key={k} onClick={() => add(k)} title={`Add an ${k.toUpperCase()} output`}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase border border-white/15 text-white/70 hover:bg-white/10">
            <Plus size={10} />{k}
          </button>
        ))}
      </div>

      <div className={`flex flex-wrap items-center gap-1.5 text-[10px] text-white/50 ${compact ? '' : 'pb-1'}`}>
        <span>Format</span>
        <select value={`${fmt.width}x${fmt.height}`} onChange={e => { const [w, h] = e.target.value.split('x').map(Number); mgr.setFormat({ width: w, height: h }); }} className={field}>
          {SIZES.map(([w, h]) => <option key={w} value={`${w}x${h}`} className="bg-[#120d1c]">{w}×{h}</option>)}
        </select>
        <select value={fmt.fps} onChange={e => mgr.setFormat({ fps: Number(e.target.value) })} className={field}>
          {FPS.map(f => <option key={f} value={f} className="bg-[#120d1c]">{f} fps</option>)}
        </select>
        <label className="flex items-center gap-1" title="SRT encoder bitrate">
          SRT <Draft value={String(fmt.bitrateKbps)} filter={digits} onCommit={b => mgr.setFormat({ bitrateKbps: Number(b) })} className={`${field} w-16`} /> kbps
        </label>
      </div>
      {srt && !srt.available && views.some(v => v.config.kind === 'srt') && (
        <div className="text-[10px] text-[#ffd166] leading-snug">{srt.reason}</div>
      )}

      {views.length === 0 && <div className="text-[10px] text-white/40">No network outputs yet. Add one above; receivers (vMix, OBS, Resolume, a switcher) then see Stage’s Program.</div>}
      {views.map(v => <OutputRow key={v.config.id} v={v} compact={compact} />)}
    </div>
  );
};

/** Edits locally; commits on blur / Enter, so a running output restarts once, not per keystroke. */
const Draft: React.FC<{ value: string; onCommit: (v: string) => void; className?: string; placeholder?: string; title?: string; filter?: (v: string) => string }> =
  ({ value, onCommit, className, placeholder, title, filter }) => {
    const [d, setD] = useState<string | null>(null);
    const commit = () => { if (d !== null && d !== value) onCommit(d); setD(null); };
    return (
      <input value={d ?? value} placeholder={placeholder} title={title} className={className}
        onChange={e => setD(filter ? filter(e.target.value) : e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setD(null); }} />
    );
  };
const digits = (v: string) => v.replace(/\D/g, '');

const OutputRow: React.FC<{ v: OutputView; compact?: boolean }> = ({ v, compact }) => {
  const mgr = useNetworkOutputs();
  const o = v.config;
  const [open, setOpen] = useState(!compact && o.kind === 'srt');
  const [pass, setPass] = useState('');
  const [paste, setPaste] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const s = o.srt;
  const setSrt = (patch: Partial<SrtSettings>) => void mgr.update(o.id, { srt: { ...s!, ...patch } });
  const toggle = async () => {
    setErr(null);
    const r = await mgr.setEnabled(o.id, !o.enabled, pass || undefined);
    if (!r.ok) { setErr(r.error ?? 'Could not start'); if (o.kind === 'srt') setOpen(true); }
  };
  const issues = o.kind === 'srt' && s ? validateSrt(s, pass || undefined) : [];
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-2.5 py-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full flex-none" title={stateWords(v.state)}
          style={{ background: DOT[v.state], boxShadow: v.state === 'live' ? `0 0 6px ${DOT.live}` : 'none' }} />
        <ProtocolBadge kind={o.kind} />
        <Draft value={o.name} onCommit={name => void mgr.update(o.id, { name })} className={`${field} flex-1`}
          title={o.kind === 'srt' ? 'Label' : 'Source name receivers see'} />
        {o.kind === 'srt' && s?.encrypted && <Lock size={11} className="text-white/50 flex-none" />}
        <button onClick={toggle} role="switch" aria-checked={o.enabled}
          className={`flex-none px-2 py-0.5 rounded-md text-[10px] font-bold border ${o.enabled ? 'text-[#FF8C00] border-[#FF8C00]/50 bg-[#FF8C00]/15' : 'text-white/60 border-white/15 hover:bg-white/10'}`}>
          {o.enabled ? 'On' : 'Off'}
        </button>
        <button onClick={() => setOpen(x => !x)} className="flex-none text-white/40 hover:text-white" title="Settings">
          <ChevronDown size={12} className={open ? 'rotate-180' : ''} />
        </button>
      </div>
      <div className="text-[10px] leading-snug text-white/50 flex items-center gap-1.5">
        <span className="truncate flex-1">{v.detail}{v.bitrateKbps > 0 ? ` · ${(v.bitrateKbps / 1000).toFixed(1)} Mbps` : ''}</span>
        {v.url && (
          <button onClick={() => void navigator.clipboard?.writeText(v.url!).catch(() => {})} className="flex items-center gap-0.5 text-white/40 hover:text-white flex-none" title={v.url}>
            <Copy size={10} />address
          </button>
        )}
      </div>
      {(err || (v.error && v.state !== 'live')) && <div className="text-[10px] text-[#fca5a5] leading-snug">{err || v.error}</div>}

      {open && o.kind === 'srt' && s && (
        <div className="space-y-1.5 pt-1 border-t border-white/10">
          <div className="flex flex-wrap items-center gap-1.5">
            <select value={s.mode} onChange={e => setSrt({ mode: e.target.value as SrtSettings['mode'] })} className={field}>
              <option value="listener" className="bg-[#120d1c]">Listener (receiver calls Stage)</option>
              <option value="caller" className="bg-[#120d1c]">Caller (Stage calls receiver)</option>
            </select>
            {s.mode === 'caller' && <Draft value={s.host ?? ''} onCommit={h => setSrt({ host: h.trim() })} placeholder="receiver host / IP" className={`${field} w-32`} />}
            <Draft value={String(s.port)} filter={digits} onCommit={p => setSrt({ port: Number(p) || 0 })} placeholder="port" className={`${field} w-16`} title="Port" />
            <label className="flex items-center gap-1 text-[10px] text-white/50">latency
              <Draft value={String(s.latencyMs)} filter={digits} onCommit={l => setSrt({ latencyMs: Number(l) || 0 })} className={`${field} w-14`} />ms
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <input type="password" value={pass} onChange={e => setPass(e.target.value)} autoComplete="new-password"
              placeholder={s.encrypted ? (mgr.hasPassphrase(o.id) ? 'passphrase set (type to change)' : 'passphrase needed') : 'passphrase (optional, 10–79)'}
              className={`${field} flex-1`} />
            <button disabled={!pass || pass.length < 10} onClick={() => { void mgr.update(o.id, {}, pass); setPass(''); }}
              className="px-2 py-1 rounded-md text-[10px] font-bold border border-white/15 text-white/70 disabled:opacity-40">Set</button>
            {s.encrypted && <button onClick={() => void mgr.update(o.id, {}, null)} className="px-2 py-1 rounded-md text-[10px] border border-white/15 text-white/50">No encryption</button>}
            <Draft value={s.streamId ?? ''} onCommit={id => setSrt({ streamId: id || undefined })} placeholder="stream ID (optional)" className={`${field} w-28`} />
          </div>
          <div className="flex items-center gap-1.5">
            <input value={paste} onChange={e => setPaste(e.target.value)} placeholder="or paste srt://host:port?mode=…&latency=…" className={`${field} flex-1`} />
            <button disabled={!paste.trim()} onClick={() => {
              const r = parseSrtUrl(paste);
              if ('error' in r) { setErr(r.error); return; }
              setErr(null); setPaste('');
              void mgr.update(o.id, { srt: r.settings }, r.passphrase);
            }} className="px-2 py-1 rounded-md text-[10px] font-bold border border-white/15 text-white/70 disabled:opacity-40">Use URL</button>
          </div>
          <div className="text-[10px] text-white/40 leading-snug">
            {srtReceiverHint(s)} · <span className="font-mono select-all">{buildSrtUrl(s)}</span>
          </div>
          {issues.length > 0 && <div className="text-[10px] text-[#ffd166]">{issues.join(' ')}</div>}
        </div>
      )}
      {open && (
        <div className="flex justify-end">
          <button onClick={() => void mgr.remove(o.id)} className="flex items-center gap-1 text-[10px] text-white/40 hover:text-red-300"><Trash2 size={10} />Remove</button>
        </div>
      )}
    </div>
  );
};

export default AmboNetworkOutputsPanel;
