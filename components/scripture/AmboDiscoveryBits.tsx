// Small shared UI pieces for auto-discovered NDI / OMT / SRT sources (see services/mediaEngine/sourceDiscovery.ts).
import React, { useState } from 'react';
import { useDiscoveredSources } from '../../services/mediaEngine/useDiscoveredSources';
import type { DiscoveryProtocol, ProtocolStatus } from '../../services/mediaEngine/sourceDiscovery';

const PROTO_COLOR: Record<string, string> = { ndi: '#7c9ce8', omt: '#7be0b5', srt: '#ffb84d' };

/** online === undefined means "not tracked by discovery" (capture cards etc.): render no dot. */
export const OnlineDot: React.FC<{ online?: boolean }> = ({ online }) => online === undefined ? null : (
  <span title={online ? 'Online' : 'Offline (not seen recently)'} className="inline-block w-1.5 h-1.5 rounded-full flex-none"
    style={{ background: online ? '#34d399' : '#6b7280', boxShadow: online ? '0 0 6px #34d399' : 'none' }} />
);

export const ProtocolBadge: React.FC<{ kind: string }> = ({ kind }) => {
  const c = PROTO_COLOR[kind];
  return (
    <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase font-mono"
      style={{ background: c ? `${c}33` : 'rgba(255,255,255,0.1)', color: c || 'rgba(255,255,255,0.7)' }}>
      {kind}
    </span>
  );
};

const STATE_LABEL: Record<ProtocolStatus['state'], string> = {
  ok: 'OK', 'not-installed': 'Not installed', 'finder-off': 'Finder off', unsupported: 'Unsupported here',
  'transport-missing': 'No SRT transport in this build', error: 'Error', unknown: 'Checking',
};

/** Per-protocol status with the host's own diagnosis text — never a silent empty list. */
export const DiscoveryStatusStrip: React.FC = () => {
  const { status } = useDiscoveredSources();
  const protos: DiscoveryProtocol[] = ['ndi', 'omt', 'srt'];
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
      {protos.map(p => {
        const s = status[p];
        const good = s.state === 'ok';
        return (
          <div key={p} className="rounded-xl border px-3 py-2 text-[10px] leading-snug"
            style={{ borderColor: good ? 'rgba(52,211,153,0.3)' : 'rgba(255,184,0,0.3)', background: good ? 'rgba(52,211,153,0.05)' : 'rgba(255,184,0,0.06)' }}>
            <div className="flex items-center gap-1.5 font-bold text-white/85"><ProtocolBadge kind={p} /><span>{STATE_LABEL[s.state]}</span></div>
            {s.detail && <div className="mt-0.5 text-white/50">{s.detail}</div>}
          </div>
        );
      })}
    </div>
  );
};

/** SRT is not announced on a network, so this is where addresses are remembered and listeners kept open. */
export const SrtEndpointPanel: React.FC = () => {
  const { manager, sources, status } = useDiscoveredSources();
  const srt = manager.srt;
  const [mode, setMode] = useState<'listener' | 'caller'>('listener');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('9000');
  const [auto, setAuto] = useState(true);
  const endpoints = srt.list();
  const noTransport = status.srt.state === 'transport-missing' || status.srt.state === 'unsupported';
  const field = 'bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white outline-none focus:border-[#ffb84d]/60';
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
      <div className="text-[10px] font-bold text-white/80">SRT endpoints <span className="font-normal text-white/40">SRT senders cannot be discovered; saved addresses reconnect on launch and a kept-open listener shows any encoder that calls in.</span></div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={mode} onChange={e => setMode(e.target.value as any)} className={field}>
          <option value="listener">Listen on port (encoder calls in)</option>
          <option value="caller">Call a remote address</option>
        </select>
        {mode === 'caller' && <input value={host} onChange={e => setHost(e.target.value)} placeholder="host or IP" className={`${field} w-36`} />}
        <input value={port} onChange={e => setPort(e.target.value.replace(/\D/g, ''))} placeholder="port" className={`${field} w-20`} />
        <label className="flex items-center gap-1 text-[10px] text-white/60"><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} />{mode === 'listener' ? 'Keep listening' : 'Reconnect on launch'}</label>
        <button
          disabled={!Number(port) || (mode === 'caller' && !host.trim())}
          onClick={() => { srt.remember({ mode, host: host.trim() || undefined, port: Number(port), autoStart: auto }); if (mode === 'caller') setHost(''); }}
          className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[#ffb84d]/15 border border-[#ffb84d]/40 text-[#ffb84d] disabled:opacity-40">
          Save endpoint
        </button>
      </div>
      {noTransport && <div className="text-[10px] text-[#ffd166]">{status.srt.detail}</div>}
      {endpoints.map(e => {
        const live = sources.find(s => s.id === e.id);
        return (
          <div key={e.id} className="flex items-center gap-2 text-[10px] text-white/70">
            <OnlineDot online={live?.online ?? false} />
            <span className="font-semibold text-white/90">{e.name}</span>
            <span className="text-white/40 truncate flex-1">{live?.status}</span>
            <label className="flex items-center gap-1 text-white/50"><input type="checkbox" checked={e.autoStart} onChange={ev => srt.setAutoStart(e.id, ev.target.checked)} />auto</label>
            <button onClick={() => void srt.startNow(e.id)} className="text-white/60 hover:text-white">Start</button>
            <button onClick={() => void srt.forget(e.id)} className="text-white/40 hover:text-red-300">Forget</button>
          </div>
        );
      })}
    </div>
  );
};
