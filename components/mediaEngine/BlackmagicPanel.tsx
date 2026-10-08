import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Camera, Radio, PlugZap, Circle, Link2 } from 'lucide-react';
import { getBlackmagicService, type BlackmagicEngine } from '../../services/mediaEngine/blackmagic/blackmagicService';
import type { SurfaceMode } from '../../services/mediaEngine/blackmagic/surfaceSync';
import type { BmDevice } from '../../services/mediaEngine/blackmagic/protocol';

const LINK_LABEL: Record<BmDevice['link'], string> = { discovered: 'Found', connecting: 'Connecting', connected: 'Connected', lost: 'Lost', error: 'Error' };
const LINK_COLOR: Record<BmDevice['link'], string> = { discovered: '#ffd166', connecting: '#ffd166', connected: '#22C55E', lost: '#EF4444', error: '#EF4444' };
const ORIGIN_LABEL = { mdns: 'found on network', manual: 'added by address', ingest: 'pushing a stream' } as const;
const MODES: Array<{ id: SurfaceMode; label: string }> = [
  { id: 'both', label: 'Both ways' }, { id: 'atem-leads', label: 'ATEM leads' }, { id: 'plajah-leads', label: 'Plajah leads' },
];

/** Blackmagic cameras, ATEM switchers and phones: discovery, auto-ingest, and ATEM-as-control-surface. */
export const BlackmagicPanel: React.FC<{ engine: BlackmagicEngine }> = ({ engine }) => {
  const svc = getBlackmagicService();
  const snap = useSyncExternalStore(svc.subscribe, svc.getSnapshot, svc.getSnapshot);
  const [url, setUrl] = useState(snap.config.url);
  const [token, setToken] = useState(snap.config.token);
  const [host, setHost] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => { svc.attachEngine(engine); }, [svc, engine]);
  useEffect(() => { if (snap.client === 'idle' && snap.config.token) svc.connect(); /* eslint-disable-next-line */ }, []);

  const run = (p: Promise<unknown>) => { setErr(''); p.catch((e: Error) => setErr(e.message)); };
  const ready = snap.client === 'ready';
  const atems = snap.devices.filter(d => d.kind === 'atem');
  const cameras = snap.devices.filter(d => d.kind === 'camera' || d.kind === 'phone');
  const others = snap.devices.filter(d => !['atem', 'camera', 'phone'].includes(d.kind));

  return (
    <div className="pt-1 border-t border-white/8 space-y-2">
      <div className="flex items-center gap-2">
        <Camera size={11} className="text-white/50" />
        <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Blackmagic cameras &amp; ATEM</span>
        <span className="ml-auto text-[9px] font-bold" style={{ color: ready ? '#22C55E' : snap.client === 'rejected' ? '#EF4444' : '#ffd166' }}>
          {ready ? 'Bridge connected' : snap.client === 'rejected' ? 'Token rejected' : snap.client === 'idle' ? 'Bridge not connected' : snap.client === 'retrying' ? 'Bridge unreachable' : 'Connecting...'}
        </span>
      </div>

      {!ready && (
        <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/8 space-y-2">
          <p className="text-[9.5px] leading-relaxed text-white/40">
            Cameras and ATEMs speak UDP/HTTP on your local network, which a browser or phone shell cannot open. Run <span className="font-mono text-white/60">Plajah Bridge</span> on the switcher computer
            (<span className="font-mono">packages/blackmagic-bridge</span>), then paste the address and pairing token it prints.
          </p>
          <div className="flex flex-col sm:flex-row gap-1.5">
            <input value={url} onChange={e => setUrl(e.target.value)} aria-label="Bridge address" placeholder="ws://192.168.1.10:8787" className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-black/40 border border-white/10 text-[11px] font-mono text-white" />
            <input value={token} onChange={e => setToken(e.target.value)} aria-label="Pairing token" placeholder="Pairing token" className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-black/40 border border-white/10 text-[11px] font-mono text-white" />
            <button onClick={() => svc.connect({ url: url.trim(), token: token.trim() })} className="px-3 py-1.5 rounded-lg bg-white/10 text-[10px] font-black uppercase tracking-wider text-white flex items-center justify-center gap-1"><PlugZap size={10} /> Pair</button>
          </div>
          {snap.detail && <p className="text-[9.5px]" style={{ color: '#ffd166' }}>{snap.detail}</p>}
          {location.protocol === 'https:' && !/^wss?:\/\/(127\.0\.0\.1|localhost)/.test(url) && (
            <p className="text-[9.5px] text-white/35">A page served over https can only reach a bridge on this same computer (ws://127.0.0.1) or one using wss. Phones need a relay, which is not built yet.</p>
          )}
        </div>
      )}

      {ready && (
        <>
          {[...atems, ...cameras, ...others].length === 0 && (
            <p className="text-[10px] text-white/40">No Blackmagic devices announced yet. Add an ATEM by address below if your network blocks discovery.</p>
          )}

          {atems.map(d => {
            const a = snap.atem[d.id]; const me = a?.me[0];
            const bound = snap.surface.deviceId === d.id;
            return (
              <div key={d.id} className="p-2.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-1.5">
                <DeviceHead d={d} />
                {a && me && (
                  <div className="flex items-center gap-2 text-[10px] font-mono">
                    <span className="px-1.5 py-0.5 rounded font-black" style={{ background: '#EF4444', color: '#fff' }}>● PGM {name(a, me.program)}</span>
                    <span className="px-1.5 py-0.5 rounded font-black border-2 border-dashed" style={{ borderColor: '#22C55E', color: '#22C55E' }}>○ PVW {name(a, me.preview)}</span>
                    <span className="ml-auto text-white/30">{a.model}</span>
                  </div>
                )}
                {a && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button onClick={() => run(svc.atemCut(d.id))} className="px-2.5 py-1 rounded-lg bg-white/10 text-[10px] font-black text-white">CUT</button>
                    <button onClick={() => run(svc.atemAuto(d.id))} className="px-2.5 py-1 rounded-lg bg-white/10 text-[10px] font-black text-white">AUTO</button>
                    <span className="mx-1 w-px h-4 bg-white/10" />
                    <button
                      onClick={() => run(Promise.resolve().then(() => bound ? svc.unbindSurface() : svc.bindSurface(d.id, snap.surface.mode)))}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-black flex items-center gap-1"
                      style={bound ? { background: '#22C55E', color: '#000' } : { background: 'rgba(255,255,255,0.1)', color: '#fff' }}>
                      <Link2 size={10} /> {bound ? 'Control surface ON' : 'Use as control surface'}
                    </button>
                    {bound && (
                      <select value={snap.surface.mode} onChange={e => svc.setSurfaceMode(e.target.value as SurfaceMode)} aria-label="Surface direction" className="px-1.5 py-1 rounded-lg bg-black/40 border border-white/10 text-[10px] text-white">
                        {MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                      </select>
                    )}
                  </div>
                )}
                {bound && <p className="text-[9px] text-white/30">ATEM input N follows switcher input SW N. Black, bars and media players are ignored.</p>}
              </div>
            );
          })}

          {[...cameras, ...others].map(d => {
            const c = snap.camera[d.id];
            return (
              <div key={d.id} className="p-2.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-1.5">
                <DeviceHead d={d} />
                {d.kind === 'camera' && c && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => run(svc.cameraRecord(d.id, !c.recording))} className="px-2.5 py-1 rounded-lg text-[10px] font-black flex items-center gap-1"
                      style={c.recording ? { background: '#EF4444', color: '#fff' } : { background: 'rgba(255,255,255,0.1)', color: '#fff' }}>
                      <Circle size={9} fill="currentColor" /> {c.recording ? 'Stop recording' : 'Record'}
                    </button>
                    <span className="text-[9px] text-white/30">{c.available.length} controls reported by the camera</span>
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex gap-1.5">
            <input value={host} onChange={e => setHost(e.target.value)} aria-label="ATEM address" placeholder="ATEM address, e.g. 192.168.1.50" className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-black/40 border border-white/10 text-[11px] font-mono text-white" />
            <button disabled={!host.trim()} onClick={() => { run(svc.addDevice(host.trim(), 'atem')); setHost(''); }} className="px-3 py-1.5 rounded-lg bg-white/10 text-[10px] font-black text-white disabled:opacity-30">Add ATEM</button>
          </div>

          <div className="p-2 rounded-lg bg-white/[0.02] border border-white/8 space-y-1">
            <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-white/40"><Radio size={10} /> Camera &amp; phone streams</div>
            {snap.ingest.info?.available ? (
              <>
                <p className="text-[9.5px] text-white/40">{snap.ingest.streams.length ? `${snap.ingest.streams.length} live; each is added to the switcher automatically.` : 'Listening. Point a camera or the Blackmagic Camera phone app at:'}</p>
                <p className="text-[9.5px] font-mono text-white/55 break-all">{snap.ingest.info.rtmpUrl}<br />{snap.ingest.info.srtUrl}</p>
              </>
            ) : <p className="text-[9.5px]" style={{ color: '#ffd166' }}>{snap.ingest.info?.reason ?? 'Waiting for the bridge.'}</p>}
            {snap.ingest.streams.map(s => (
              <div key={s.id} className="flex items-center gap-2 text-[10px]">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: snap.registered[s.id] ? '#22C55E' : snap.ingestErrors[s.id] ? '#EF4444' : '#ffd166' }} />
                <span className="text-white/70 truncate">{s.label}</span>
                <span className="ml-auto text-[9px] text-white/30">{snap.registered[s.id] ? 'on the switcher' : snap.ingestErrors[s.id] ?? 'adding...'}</span>
              </div>
            ))}
          </div>
          <button onClick={() => svc.disconnect()} className="text-[9px] text-white/30 underline">Disconnect from bridge</button>
        </>
      )}
      {err && <p className="text-[10.5px] text-[#EF4444] font-bold">{err}</p>}
    </div>
  );
};

const name = (a: { inputs: Array<{ index: number; shortName: string }> }, i: number) => a.inputs.find(x => x.index === i)?.shortName || String(i);

const DeviceHead: React.FC<{ d: BmDevice }> = ({ d }) => (
  <div className="flex items-center gap-2">
    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: LINK_COLOR[d.link] }} />
    <span className="text-[11px] font-bold text-white truncate">{d.name}</span>
    <span className="text-[9px] text-white/30 truncate">{d.host} · {ORIGIN_LABEL[d.origin]}</span>
    <span className="ml-auto text-[9px] font-bold shrink-0" style={{ color: LINK_COLOR[d.link] }} title={d.detail}>{LINK_LABEL[d.link]}</span>
  </div>
);

export default BlackmagicPanel;
