import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Home, Lightbulb, Thermometer, Lock, Unlock, Video, Plus, RefreshCw, Check, AlertTriangle,
  Power, Minus, Trash2, Link2, Cpu, Activity, Radio,
} from 'lucide-react';
import { Button, Input, Surface } from '../ui';
import {
  pingHub, getHubState, sendHubCommand, setHubUrl, getSavedHubUrl, setHubToken, getHubToken,
  getHubAdminToken, discoverCommissionable, networkMatterAdverts, commissionMatter, removeMatterNode,
  parseMatterCode, discoverHue, startHuePairing, huePairingStatus, unlinkHue, addCamera, removeCamera,
  fetchCameraSnapshot, releaseSnapshotUrl, onHubConfigChange,
  type HubState, type HubDevice, type HubAction, type HuePairing, type HubPing,
} from '../../services/home/plajahHubClient';

/**
 * Plajah Home hub panel (desktop / web, mounted in PlajahHomeView).
 *
 * Talks only to the hub running on the user's PC (routes/homeHubRoutes.ts + routes/matterRoutes.ts):
 *  · Devices — every real device with real controls (lights, thermostats, locks, sensors, cameras).
 *  · Add a Matter device — paste a pairing code (or a multi-admin share code from Alexa / Google /
 *    Apple) and the hub commissions it onto its own fabric.
 *  · Connect Hue — press the bridge's link button, then Connect (30s window).
 *  · Add camera — an RTSP URL, stored on the hub PC only.
 * Nothing here shows a state the hub did not report.
 */

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const cToF = (c: number) => Math.round((c * 9) / 5 + 32);
const useF = (() => { try { return /-(US|LR|MM)$/i.test(navigator.language || ''); } catch { return false; } })();
const fmtTemp = (c: number | null | undefined) => (c == null ? '--' : useF ? `${cToF(c)}°F` : `${Math.round(c * 2) / 2}°C`);

const Section: React.FC<{ icon: React.ReactNode; title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode }> = ({ icon, title, sub, right, children }) => (
  <div className="flex flex-col gap-3 rounded-2xl border border-white/10 p-4 bg-black/20">
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg grid place-items-center bg-[#1a0026]/60 border border-[var(--pj-magenta)]/30 flex-shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-white">{title}</div>
        {sub && <div className="text-xs text-white/60 leading-relaxed">{sub}</div>}
      </div>
      {right}
    </div>
    {children}
  </div>
);

const ErrorLine: React.FC<{ msg: string | null }> = ({ msg }) => (msg ? (
  <div role="alert" className="flex items-start gap-2 text-xs text-[var(--pj-danger)] leading-relaxed">
    <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" /><span>{msg}</span>
  </div>
) : null);

// ─── Device rows ──────────────────────────────────────────────────────────────

const CameraThumb: React.FC<{ id: string }> = ({ id }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const urlRef = useRef<string | null>(null);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const u = await fetchCameraSnapshot(id);
      releaseSnapshotUrl(urlRef.current);
      urlRef.current = u; setUrl(u); setErr(null);
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }, [id]);
  useEffect(() => { void load(); return () => releaseSnapshotUrl(urlRef.current); }, [load]);
  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black grid place-items-center">
        {url ? <img src={url} alt="" className="absolute inset-0 w-full h-full object-cover" /> : <span className="text-xs text-white/50 px-3 text-center">{err || 'Loading snapshot…'}</span>}
      </div>
      <Button size="xs" variant="ghost" icon={<RefreshCw />} loading={busy} onClick={load}>Refresh snapshot</Button>
    </div>
  );
};

const DeviceRow: React.FC<{ d: HubDevice; onCommand: (d: HubDevice, a: HubAction, v?: number | string) => Promise<void>; onRemove?: () => void }> = ({ d, onCommand, onRemove }) => {
  const [busy, setBusy] = useState(false);
  const [bri, setBri] = useState<number | null>(d.state.brightness ?? null);
  useEffect(() => { setBri(d.state.brightness ?? null); }, [d.state.brightness]);
  const run = async (a: HubAction, v?: number | string) => { setBusy(true); try { await onCommand(d, a, v); } finally { setBusy(false); } };
  const s = d.state;
  const icon = d.kind === 'thermostat' ? <Thermometer size={16} /> : d.kind === 'lock' ? <Lock size={16} /> : d.kind === 'camera' ? <Video size={16} /> : d.kind === 'sensor' ? <Activity size={16} /> : <Lightbulb size={16} />;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/10 p-3 bg-white/[0.03]">
      <div className="flex items-center gap-2">
        <span className={s.on ? 'text-[var(--pj-orange)]' : 'text-white/50'}>{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-white truncate">{d.name}</div>
          <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-white/40 truncate">
            {d.source}{d.room ? ` · ${d.room}` : ''}{d.detail ? ` · ${d.detail}` : ''}{!d.online ? ' · offline' : ''}
          </div>
        </div>
        {(d.kind === 'light' || d.kind === 'switch') && typeof s.on === 'boolean' && (
          <Button size="xs" variant={s.on ? 'primary' : 'secondary'} icon={<Power />} loading={busy} disabled={!d.online} onClick={() => run('toggle')}>
            {s.on ? 'On' : 'Off'}
          </Button>
        )}
        {d.kind === 'lock' && (
          <Button size="xs" variant="secondary" icon={s.locked ? <Unlock /> : <Lock />} loading={busy} disabled={!d.online || s.locked == null}
            onClick={() => run(s.locked ? 'unlock' : 'lock')}>
            {s.locked == null ? (s.lockState || 'Unknown') : s.locked ? 'Unlock' : 'Lock'}
          </Button>
        )}
        {onRemove && <Button size="xs" variant="ghost" iconOnly aria-label="Remove" onClick={onRemove}><Trash2 /></Button>}
      </div>

      {d.kind === 'light' && bri != null && (
        <label className="flex items-center gap-2 text-xs text-white/60">
          <span className="w-16">Brightness</span>
          <input type="range" min={1} max={100} value={bri} disabled={!d.online || busy} className="flex-1"
            onChange={e => setBri(Number(e.target.value))}
            onPointerUp={() => { if (bri != null) void run('brightness', bri); }}
            onKeyUp={() => { if (bri != null) void run('brightness', bri); }} />
          <span className="w-10 text-right font-mono">{bri}%</span>
        </label>
      )}
      {d.kind === 'light' && s.colorTempK != null && s.ctRangeK && (
        <div className="flex items-center gap-2 text-xs text-white/60">
          <span className="w-16">White</span>
          <Button size="xs" variant="ghost" disabled={!d.online || busy} onClick={() => run('colorTemp', s.ctRangeK![0])}>Warm</Button>
          <Button size="xs" variant="ghost" disabled={!d.online || busy} onClick={() => run('colorTemp', Math.round((s.ctRangeK![0] + s.ctRangeK![1]) / 2))}>Neutral</Button>
          <Button size="xs" variant="ghost" disabled={!d.online || busy} onClick={() => run('colorTemp', s.ctRangeK![1])}>Cool</Button>
          <span className="ml-auto font-mono">{s.colorTempK}K</span>
        </div>
      )}

      {d.kind === 'thermostat' && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
          <span className="font-mono text-base text-white">{fmtTemp(s.temperatureC)}</span>
          <span className="text-white/50">inside{s.action ? ` · ${s.action}` : ''}</span>
          <span className="ml-auto flex items-center gap-1">
            {(() => {
              const target = s.mode === 'cool' ? s.coolSetpointC : (s.heatSetpointC ?? s.coolSetpointC);
              const step = useF ? 5 / 9 : 0.5;
              return (
                <>
                  <Button size="xs" variant="ghost" iconOnly aria-label="Lower" disabled={!d.online || busy || target == null || s.mode === 'off'} onClick={() => run('setpoint', Math.round(((target ?? 0) - step) * 10) / 10)}><Minus /></Button>
                  <span className="font-mono w-14 text-center">{fmtTemp(target)}</span>
                  <Button size="xs" variant="ghost" iconOnly aria-label="Raise" disabled={!d.online || busy || target == null || s.mode === 'off'} onClick={() => run('setpoint', Math.round(((target ?? 0) + step) * 10) / 10)}><Plus /></Button>
                </>
              );
            })()}
          </span>
          <select className="bg-black/40 border border-white/15 rounded-lg px-2 py-1 text-xs text-white" value={s.mode || ''} disabled={!d.online || busy}
            onChange={e => void run('mode', e.target.value)}>
            {(s.modes || []).map(m => <option key={m} value={m}>{m}</option>)}
            {s.mode && !(s.modes || []).includes(s.mode) && <option value={s.mode}>{s.mode}</option>}
          </select>
        </div>
      )}

      {d.kind === 'sensor' && (
        <div className="text-xs text-white/70 font-mono">
          {s.temperatureC !== undefined && <span>{fmtTemp(s.temperatureC)} </span>}
          {s.humidityPct != null && <span>· {Math.round(s.humidityPct)}% RH</span>}
        </div>
      )}

      {d.kind === 'camera' && (d.online ? <CameraThumb id={d.id} /> : <div className="text-xs text-white/50">{s.lastError || 'Camera offline'}</div>)}
    </div>
  );
};

// ─── Panel ────────────────────────────────────────────────────────────────────

const HomeHubPanel: React.FC = () => {
  const [hub, setHub] = useState<HubPing | null>(null);
  const [hubErr, setHubErr] = useState<string | null>(null);
  const [state, setState] = useState<HubState | null>(null);
  const [loading, setLoading] = useState(true);
  const [cmdErr, setCmdErr] = useState<string | null>(null);
  const [hubUrlInput, setHubUrlInput] = useState(getSavedHubUrl() || '');
  const [tokenInput, setTokenInput] = useState(getHubToken() || '');
  const [adminToken, setAdminToken] = useState<string | null>(null);

  const refresh = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const p = await pingHub(force);
      setHub(p); setHubErr(null);
      const st = await getHubState();
      setState(st);
    } catch (e) {
      setHub(null); setState(null); setHubErr(errMsg(e));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); return onHubConfigChange(() => { void refresh(true); }); }, [refresh]);
  useEffect(() => {
    if (!hub) return;
    const t = setInterval(() => { getHubState().then(setState).catch(() => {}); }, 15_000);
    return () => clearInterval(t);
  }, [hub]);

  const onCommand = useCallback(async (d: HubDevice, a: HubAction, v?: number | string) => {
    setCmdErr(null);
    try {
      const r = await sendHubCommand(d.id, a, v);
      if (r.device) setState(s => (s ? { ...s, devices: s.devices.map(x => (x.id === r.device!.id ? r.device! : x)) } : s));
    } catch (e) { setCmdErr(`${d.name}: ${errMsg(e)}`); }
  }, []);

  // ── Matter pairing ──
  const [code, setCode] = useState('');
  const [codeInfo, setCodeInfo] = useState<string | null>(null);
  const [knownIp, setKnownIp] = useState('');
  const [pairing, setPairing] = useState(false);
  const [pairMsg, setPairMsg] = useState<string | null>(null);
  const [pairErr, setPairErr] = useState<string | null>(null);
  const [scan, setScan] = useState<{ busy: boolean; commissionable?: number; adverts?: { total: number; fabrics: number; own: number }; list?: string[] }>({ busy: false });

  useEffect(() => {
    const c = code.trim();
    setCodeInfo(null);
    if (!hub || !(c.toUpperCase().startsWith('MT:') || c.replace(/\D/g, '').length === 11 || c.replace(/\D/g, '').length === 21)) return;
    const t = setTimeout(() => {
      parseMatterCode(c).then(r => {
        const p = r.payload as any;
        setCodeInfo(p.kind === 'qr' ? `QR code · discriminator ${p.discriminator}${p.vendorId ? ` · vendor 0x${Number(p.vendorId).toString(16)}` : ''}` : `Manual code · short discriminator ${p.shortDiscriminator}`);
      }).catch(e => setCodeInfo(errMsg(e)));
    }, 300);
    return () => clearTimeout(t);
  }, [code, hub]);

  const doScan = async () => {
    setScan({ busy: true });
    try {
      const [c, n] = await Promise.all([discoverCommissionable(6), networkMatterAdverts(4)]);
      const fabrics = new Set(n.adverts.map(a => a.compressedFabricId));
      setScan({
        busy: false,
        commissionable: c.devices.length,
        list: c.devices.map(d => `${d.name || d.id} · D=${d.discriminator} · ${d.commissioningMode === 2 ? 'share window open' : d.commissioningMode === 1 ? 'pairing mode' : 'not open'} · ${d.addresses[0] || ''}`),
        adverts: { total: n.adverts.length, fabrics: fabrics.size, own: n.adverts.filter(a => a.ownFabric).length },
      });
    } catch (e) { setScan({ busy: false }); setPairErr(errMsg(e)); }
  };

  const doPair = async () => {
    setPairing(true); setPairErr(null);
    setPairMsg('Looking for the device and commissioning it onto the Plajah Home fabric. This can take up to a minute…');
    try {
      const r = await commissionMatter(code.trim(), knownIp.trim() || undefined);
      setPairMsg(`Paired: ${r.node.name} (node ${r.node.nodeId}).`);
      setCode(''); setKnownIp('');
      await refresh();
    } catch (e) { setPairMsg(null); setPairErr(errMsg(e)); } finally { setPairing(false); }
  };

  const matterNodes = [...new Set((state?.devices || []).filter(d => d.source === 'matter').map(d => d.id.split(':')[1]))];
  const removeNode = async (nodeId: string) => {
    if (!window.confirm('Remove this device from Plajah Home? Its other assistants (e.g. Alexa) keep it.')) return;
    try { const r = await removeMatterNode(nodeId); if (!r.decommissioned && r.error) setCmdErr(`Removed locally; the device did not confirm: ${r.error}`); await refresh(); }
    catch (e) { setCmdErr(errMsg(e)); }
  };

  // ── Hue ──
  const [hueBridges, setHueBridges] = useState<{ id: string; ip: string; name?: string; model?: string }[] | null>(null);
  const [huePair, setHuePair] = useState<HuePairing | null>(null);
  const [hueErr, setHueErr] = useState<string | null>(null);
  const huePoll = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  useEffect(() => () => { if (huePoll.current) clearInterval(huePoll.current); }, []);
  const findHue = async () => {
    setHueErr(null);
    try { const r = await discoverHue(); setHueBridges(r.bridges); } catch (e) { setHueErr(errMsg(e)); }
  };
  const connectHue = async (ip?: string) => {
    setHueErr(null);
    try {
      const r = await startHuePairing(ip);
      setHuePair(r.pairing);
      if (huePoll.current) clearInterval(huePoll.current);
      if (r.pairing.state === 'waiting-for-button') {
        huePoll.current = setInterval(async () => {
          try {
            const s = (await huePairingStatus()).pairing;
            setHuePair(s);
            if (s.state !== 'waiting-for-button') { clearInterval(huePoll.current); huePoll.current = undefined; if (s.state === 'paired') void refresh(); }
          } catch { /* keep polling */ }
        }, 2000);
      } else if (r.pairing.state === 'paired') void refresh();
    } catch (e) { setHueErr(errMsg(e)); }
  };

  // ── Cameras ──
  const [camName, setCamName] = useState('');
  const [camUrl, setCamUrl] = useState('');
  const [camErr, setCamErr] = useState<string | null>(null);
  const [camBusy, setCamBusy] = useState(false);
  const doAddCam = async () => {
    setCamBusy(true); setCamErr(null);
    try { await addCamera({ name: camName.trim(), url: camUrl.trim() }); setCamName(''); setCamUrl(''); await refresh(); }
    catch (e) { setCamErr(errMsg(e)); } finally { setCamBusy(false); }
  };

  const devices = state?.devices || [];
  const admin = !!hub?.admin;

  return (
    <Surface className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl grid place-items-center bg-[#1a0026]/60 border border-[var(--pj-magenta)]/30 flex-shrink-0">
          <Home size={20} className="text-[var(--pj-orange)]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-white">Plajah Home hub</div>
          <div className="text-xs text-white/60 leading-relaxed">
            Runs on your PC and talks to your devices directly: Matter (its own fabric), Philips Hue (local bridge) and RTSP cameras. The TV ambient dash reads it over your network.
          </div>
        </div>
        {hub ? (
          <span className="flex items-center gap-1 text-[11px] font-mono font-bold text-[var(--pj-success)] flex-shrink-0"><Check size={12} /> CONNECTED</span>
        ) : null}
        <Button size="xs" variant="ghost" iconOnly aria-label="Refresh" loading={loading} onClick={() => refresh(true)}><RefreshCw /></Button>
      </div>

      {hub && (
        <div className="text-xs text-white/60 font-mono break-all">
          {hub.name} · {hub.base}{hub.beacon ? ' · advertising on the LAN' : ''}{admin ? '' : ' · view + lights/thermostat only (enter the hub token to pair or use locks)'}
        </div>
      )}
      {!hub && !loading && (
        <div className="flex flex-col gap-2">
          <ErrorLine msg={hubErr} />
          <div className="text-xs text-white/60 leading-relaxed">
            Start Plajah on your PC (<span className="font-mono">npm run dev</span>), then open Plajah there, or enter the PC's address below (for example <span className="font-mono">192.168.4.60:3000</span>).
          </div>
        </div>
      )}
      <details className="text-xs text-white/70">
        <summary className="cursor-pointer select-none">Hub address & access</summary>
        <div className="flex flex-col gap-2 mt-2">
          <Input label="Hub address (leave empty to find it automatically)" placeholder="192.168.4.60:3000" value={hubUrlInput} onChange={e => setHubUrlInput(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          <Input label="Hub token (only needed on other devices, for pairing and locks)" type="password" value={tokenInput} onChange={e => setTokenInput(e.target.value)} autoComplete="off" />
          <div className="flex flex-wrap gap-2">
            <Button size="xs" variant="secondary" icon={<Link2 />} onClick={() => { try { setHubUrl(hubUrlInput.trim() || null); setHubToken(tokenInput.trim() || null); } catch (e) { setHubErr(errMsg(e)); } }}>Save</Button>
            {admin && hub && /localhost|127\.0\.0\.1/.test(hub.base) && (
              <Button size="xs" variant="ghost" onClick={async () => { try { setAdminToken((await getHubAdminToken()).token); } catch (e) { setHubErr(errMsg(e)); } }}>Show hub token</Button>
            )}
          </div>
          {adminToken && <div className="font-mono break-all text-white/80">Hub token: {adminToken}</div>}
        </div>
      </details>

      {hub && state && (
        <>
          <div className="flex flex-wrap gap-2 text-[10px] font-mono uppercase tracking-[0.16em]">
            <span className={state.sources.matter.running ? 'text-[var(--pj-success)]' : 'text-[var(--pj-danger)]'}>Matter: {state.sources.matter.running ? `${state.sources.matter.paired} paired` : 'not running'}</span>
            <span className={state.sources.hue.linked ? 'text-[var(--pj-success)]' : 'text-white/40'}>Hue: {state.sources.hue.linked ? `linked ${state.sources.hue.ip}` : 'not connected'}</span>
            <span className={state.sources.cameras.ffmpeg ? 'text-white/60' : 'text-[var(--pj-warning,#f5a524)]'}>Cameras: {state.sources.cameras.count}{state.sources.cameras.ffmpeg ? '' : ' · ffmpeg missing'}</span>
          </div>
          {state.sources.matter.error && <ErrorLine msg={`Matter: ${state.sources.matter.error}`} />}
          {state.sources.hue.error && <ErrorLine msg={`Hue: ${state.sources.hue.error}`} />}
          <ErrorLine msg={cmdErr} />

          <Section icon={<Cpu size={16} className="text-[var(--pj-orange)]" />} title={`Devices (${devices.length})`} sub={devices.length ? undefined : 'Nothing yet. Add a device below.'}>
            {devices.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {devices.map(d => (
                  <DeviceRow key={d.id} d={d} onCommand={onCommand}
                    onRemove={d.source === 'camera' && admin ? async () => { if (window.confirm(`Remove camera ${d.name}?`)) { await removeCamera(d.id).catch(e => setCmdErr(errMsg(e))); void refresh(); } } : undefined} />
                ))}
              </div>
            )}
            {matterNodes.length > 0 && admin && (
              <div className="flex flex-wrap gap-2 text-xs text-white/60">
                {matterNodes.map(n => <Button key={n} size="xs" variant="ghost" icon={<Trash2 />} onClick={() => removeNode(n)}>Remove Matter node {n}</Button>)}
              </div>
            )}
          </Section>

          <Section icon={<Radio size={16} className="text-[var(--pj-orange)]" />} title="Add a Matter device"
            sub="Already set up in Alexa? Alexa app → Devices → pick the device → Settings → Other Assistants and Apps → Add Another → it shows a code. Paste it here within a few minutes. (Google Home: device → Settings → Linked Matter apps & services → Link apps & services. Apple Home: device → Settings → Turn On Pairing Mode.) A brand-new device: paste the code printed on it, after adding it to your Wi-Fi/Thread network with its maker's app; Bluetooth setup is not available on a PC.">
            <Input label="Pairing code or QR text" placeholder="1234-567-8901 or MT:Y.K9042C00KA0648G00" value={code} onChange={e => setCode(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} hint={codeInfo || undefined} />
            <Input label="Device IP (optional, only if discovery fails)" placeholder="192.168.4.73" value={knownIp} onChange={e => setKnownIp(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="primary" icon={<Plus />} loading={pairing} disabled={!code.trim() || !admin} onClick={doPair}>Pair</Button>
              <Button size="sm" variant="secondary" icon={<RefreshCw />} loading={scan.busy} onClick={doScan}>Scan network</Button>
            </div>
            {!admin && <div className="text-xs text-white/50">Pairing is only available on the hub PC (or with the hub token).</div>}
            {pairMsg && <div className="text-xs text-[var(--pj-success)]">{pairMsg}</div>}
            <ErrorLine msg={pairErr} />
            {scan.commissionable !== undefined && (
              <div className="text-xs text-white/70 flex flex-col gap-1">
                <div>{scan.commissionable === 0 ? 'No device has a pairing window open right now.' : `${scan.commissionable} device(s) ready to pair:`}</div>
                {scan.list?.map(l => <div key={l} className="font-mono text-white/60">{l}</div>)}
                {scan.adverts && <div className="text-white/50">{scan.adverts.total} Matter devices are running on {scan.adverts.fabrics} other controller fabric(s) (for example Alexa){scan.adverts.own ? `, ${scan.adverts.own} on Plajah Home` : ''}. Use a share code to add them.</div>}
              </div>
            )}
          </Section>

          <Section icon={<Lightbulb size={16} className="text-[var(--pj-orange)]" />} title="Philips Hue"
            sub={state.sources.hue.linked ? `Connected to the bridge at ${state.sources.hue.ip}.` : 'Press the round link button on top of the Hue bridge, then click Connect within 30 seconds.'}
            right={state.sources.hue.linked && admin ? <Button size="xs" variant="ghost" onClick={async () => { await unlinkHue().catch(e => setHueErr(errMsg(e))); void refresh(); }}>Disconnect</Button> : undefined}>
            {!state.sources.hue.linked && (
              <>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={findHue}>Find bridge</Button>
                  <Button size="sm" variant="primary" disabled={!admin || huePair?.state === 'waiting-for-button'} loading={huePair?.state === 'waiting-for-button'} onClick={() => connectHue(hueBridges?.[0]?.ip)}>Connect</Button>
                </div>
                {hueBridges && <div className="text-xs text-white/60 font-mono">{hueBridges.length ? hueBridges.map(b => `${b.name || b.id} · ${b.ip}${b.model ? ` · ${b.model}` : ''}`).join(' / ') : 'No bridge found on this network.'}</div>}
                {huePair?.state === 'waiting-for-button' && <div className="text-xs text-[var(--pj-orange)]">Waiting for the link button… {Math.max(0, Math.round((huePair.expiresAt - Date.now()) / 1000))}s{huePair.lastError ? ` · ${huePair.lastError}` : ''}</div>}
                {huePair?.state === 'failed' && <ErrorLine msg={huePair.error} />}
                {huePair?.state === 'paired' && <div className="text-xs text-[var(--pj-success)]">Connected.</div>}
                <ErrorLine msg={hueErr} />
              </>
            )}
          </Section>

          <Section icon={<Video size={16} className="text-[var(--pj-orange)]" />} title="Add camera (RTSP)"
            sub="eufy IndoorCam: eufy Security app → the camera → Settings → Storage → NAS (RTSP) → turn on, set a username and password; the stream is rtsp://USER:PASS@CAMERA-IP:554/live0. The address and password stay on the hub PC.">
            {!state.sources.cameras.ffmpeg && <div className="text-xs text-[var(--pj-warning,#f5a524)]">ffmpeg is not installed on the hub PC, so RTSP snapshots will fail. Install it (for example <span className="font-mono">winget install Gyan.FFmpeg</span>) and restart Plajah.</div>}
            <Input label="Name" placeholder="Living room camera" value={camName} onChange={e => setCamName(e.target.value)} />
            <Input label="RTSP URL" type="password" placeholder="rtsp://user:pass@192.168.7.250:554/live0" value={camUrl} onChange={e => setCamUrl(e.target.value)} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
            <div className="flex gap-2">
              <Button size="sm" variant="primary" icon={<Plus />} loading={camBusy} disabled={!camUrl.trim() || !admin} onClick={doAddCam}>Add camera</Button>
            </div>
            <ErrorLine msg={camErr} />
          </Section>
        </>
      )}
    </Surface>
  );
};

export default HomeHubPanel;
