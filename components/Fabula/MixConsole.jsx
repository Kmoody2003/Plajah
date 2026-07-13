// MixConsole — a DAW-style mixing console for Fabula's AUDIO page. One channel strip per audio
// track (meter · 3-band EQ · comp · pan · fader · mute · solo · MIDI-learn) plus a MASTER strip
// (brickwall limiter · master fader · GR + output meter) and the audio-engine panel (sample rate,
// latency, hardware output device, channel count, MIDI status). Reads the live DSP graph's meters
// and drives the shared AudioContext master. All state persists via setTrackSetting.

import { memo, useEffect, useRef, useState } from "react";
import {
  meterRegistry, setMasterGain, setMasterLimiter, masterReduction,
  audioEngineInfo, listOutputDevices, setOutputDevice, setOutputChannels, resumeAudioCtx,
  setReverb, setDelay, REVERB_PRESETS,
} from "../../services/fabula/audioGraph";

// dB helpers for a musical fader taper (0..1.5 linear gain shown as dB).
const toDb = (g) => (g <= 0.0001 ? -Infinity : 20 * Math.log10(g));
const fmtDb = (g) => { const d = toDb(g); return d === -Infinity ? "-∞" : (d > 0 ? "+" : "") + d.toFixed(1); };

// Vertical meter driven imperatively (no React churn) from the DSP graph's peak sampler.
const Meter = memo(function Meter({ id, tall }) {
  const fill = useRef(null), peak = useRef(0);
  useEffect(() => {
    let raf, hold = 0;
    const tick = () => {
      const s = meterRegistry.get(id); const lv = s ? Math.min(1, s() * 1.1) : 0;
      hold = lv > hold ? lv : Math.max(lv, hold - 0.02);
      if (fill.current) fill.current.style.height = (100 - hold * 100).toFixed(1) + "%";
      raf = requestAnimationFrame(tick);
    };
    tick(); return () => cancelAnimationFrame(raf);
  }, [id]);
  return <div className="mcmeter" style={tall ? { height: 150 } : undefined}><i ref={fill} style={{ height: "100%" }} /></div>;
});

const EQ3 = [{ i: 0, label: "LO" }, { i: 2, label: "MID" }, { i: 4, label: "HI" }];

// Plajah-toned channel tab colors, cycled per strip (Bitwig-style multi-color channels).
const TAB_COLORS = ["#f97316", "#00A3FF", "#22c55e", "#a855f7", "#ffcf33", "#ff6b9d"];

function ChannelStrip({ tr, ts, onPatch, midiLearnId, onMidiLearn, tab }) {
  const vol = ts.vol == null ? 1 : ts.vol, pan = ts.pan || 0;
  const eq = ts.eq || [0, 0, 0, 0, 0];
  const comp = ts.comp || {};
  const setEq = (i, v) => { const n = [...eq]; n[i] = v; onPatch({ eq: n }); };
  return (
    <div className="mcstrip" style={{ "--tab": tab }}>
      <div className="mctop">
        {EQ3.map(({ i, label }) => (
          <div className="mcknob" key={i} title={`${label} EQ ${(eq[i] || 0) > 0 ? "+" : ""}${eq[i] || 0}dB`}>
            <input type="range" min="-12" max="12" step="0.5" value={eq[i] || 0} onChange={(e) => setEq(i, parseFloat(e.target.value))} onDoubleClick={() => setEq(i, 0)} />
            <span>{label}</span>
          </div>
        ))}
      </div>
      <button className={`mcbtn ${comp.on ? "on" : ""}`} title="Compressor" onClick={() => onPatch({ comp: { ...comp, on: !comp.on } })}>COMP</button>
      <div className="mctop" style={{ minHeight: 0 }}>
        <div className="mcknob" title={`Reverb send ${Math.round((ts.sendReverb || 0) * 100)}%`}>
          <input type="range" min="0" max="1" step="0.02" value={ts.sendReverb || 0} onChange={(e) => onPatch({ sendReverb: parseFloat(e.target.value) })} onDoubleClick={() => onPatch({ sendReverb: 0 })} />
          <span>RVB</span>
        </div>
        <div className="mcknob" title={`Delay send ${Math.round((ts.sendDelay || 0) * 100)}%`}>
          <input type="range" min="0" max="1" step="0.02" value={ts.sendDelay || 0} onChange={(e) => onPatch({ sendDelay: parseFloat(e.target.value) })} onDoubleClick={() => onPatch({ sendDelay: 0 })} />
          <span>DLY</span>
        </div>
      </div>
      <div className="mcpan" title={`Pan ${pan === 0 ? "C" : pan < 0 ? "L" + Math.round(-pan * 100) : "R" + Math.round(pan * 100)}`}>
        <input type="range" min="-1" max="1" step="0.02" value={pan} onChange={(e) => onPatch({ pan: parseFloat(e.target.value) })} onDoubleClick={() => onPatch({ pan: 0 })} />
      </div>
      <div className="mcfaderrow">
        <div className="mcfader">
          <input type="range" min="0" max="1.5" step="0.005" value={vol} onChange={(e) => onPatch({ vol: parseFloat(e.target.value) })} onDoubleClick={() => onPatch({ vol: 1 })}
            style={{ writingMode: "vertical-lr", direction: "rtl" }} />
        </div>
        <Meter id={tr.id} tall />
      </div>
      <span className="mcdb">{fmtDb(vol)}</span>
      <div className="mcbtns">
        <button className={`mcms ${ts.mute ? "on mute" : ""}`} onClick={() => onPatch({ mute: !ts.mute })}>M</button>
        <button className={`mcms ${ts.solo ? "on solo" : ""}`} onClick={() => onPatch({ solo: !ts.solo })}>S</button>
        <button className={`mcms ${midiLearnId === tr.id ? "on learn" : ""}`} title="MIDI-learn this fader: click, then move a MIDI control" onClick={() => onMidiLearn(tr.id)}>◎</button>
      </div>
      <span className="mcname">{tr.name}</span>
    </div>
  );
}

export default function MixConsole({ audioTracks, trackSettings, setTrackSetting }) {
  const [info, setInfo] = useState(() => audioEngineInfo());
  const [devices, setDevices] = useState([]);
  const [sink, setSink] = useState("default");
  const [limiterOn, setLimiterOn] = useState(true);
  const [masterVol, setMasterVol] = useState(() => (trackSettings?.master?.vol == null ? 1 : trackSettings.master.vol));
  const [midiStatus, setMidiStatus] = useState("MIDI: not connected");
  const [midiLearnId, setMidiLearnId] = useState(null);
  const grRef = useRef(null);
  const midiMap = useRef({});      // CC number → trackId
  const learnRef = useRef(null);

  const masterCfg = trackSettings?.master || {};
  const rvb = { preset: "hall", wet: 0.9, ...(masterCfg.reverb || {}) };
  const dly = { time: 0.33, feedback: 0.35, wet: 0.8, ...(masterCfg.delay || {}) };
  const setRvb = (p) => { const n = { ...rvb, ...p }; setTrackSetting("master", { reverb: n }); setReverb(n); };
  const setDly = (p) => { const n = { ...dly, ...p }; setTrackSetting("master", { delay: n }); setDelay(n); };
  useEffect(() => { setMasterGain(masterVol); setTrackSetting("master", { vol: masterVol }); /* eslint-disable-next-line */ }, [masterVol]);
  useEffect(() => { setMasterLimiter(limiterOn); }, [limiterOn]);
  useEffect(() => { setReverb(rvb); setDelay(dly); /* eslint-disable-next-line */ }, []); // push saved FX to the engine on mount

  // Engine telemetry + master GR meter refresh.
  useEffect(() => {
    resumeAudioCtx();
    const t = setInterval(() => setInfo(audioEngineInfo()), 1000);
    let raf; const gr = () => { if (grRef.current) { const r = Math.min(1, -masterReduction() / 24); grRef.current.style.width = (r * 100).toFixed(0) + "%"; } raf = requestAnimationFrame(gr); };
    gr();
    listOutputDevices().then(setDevices);
    return () => { clearInterval(t); cancelAnimationFrame(raf); };
  }, []);

  // Web MIDI: map CC → the learned fader (0..127 → 0..1.5), or the fader whose CC is bound.
  useEffect(() => {
    if (!navigator.requestMIDIAccess) { setMidiStatus("MIDI: unsupported browser"); return undefined; }
    let access;
    navigator.requestMIDIAccess({ sysex: false }).then((a) => {
      access = a;
      const names = [...a.inputs.values()].map((i) => i.name).join(", ");
      setMidiStatus(a.inputs.size ? `MIDI: ${names}` : "MIDI: no devices");
      const onMsg = (e) => {
        const [status, cc, val] = e.data;
        if ((status & 0xf0) !== 0xb0) return; // control-change only
        if (learnRef.current != null) { midiMap.current[cc] = learnRef.current; learnRef.current = null; setMidiLearnId(null); return; }
        const tid = midiMap.current[cc];
        if (tid) { const v = (val / 127) * 1.5; if (tid === "master") setMasterVol(v); else setTrackSetting(tid, { vol: v }); }
      };
      a.inputs.forEach((inp) => { inp.onmidimessage = onMsg; });
      a.onstatechange = () => { const nm = [...a.inputs.values()].map((i) => i.name).join(", "); setMidiStatus(a.inputs.size ? `MIDI: ${nm}` : "MIDI: no devices"); a.inputs.forEach((inp) => { inp.onmidimessage = onMsg; }); };
    }).catch(() => setMidiStatus("MIDI: permission denied"));
    return () => { try { access?.inputs.forEach((i) => (i.onmidimessage = null)); } catch { /* */ } };
    // eslint-disable-next-line
  }, []);
  const learn = (id) => { learnRef.current = id; setMidiLearnId(id); };

  const chooseSink = async (id) => { setSink(id); const ok = await setOutputDevice(id); if (!ok) console.warn("Output routing needs Chromium (setSinkId)."); };

  return (
    <div className="mixconsole glass-dark">
      <div className="paneltitle">🎚 MIXING CONSOLE
        <span className="dim small" style={{ marginLeft: 8, letterSpacing: 0 }}>
          {info.sampleRate ? `${(info.sampleRate / 1000).toFixed(1)}kHz · ${info.outputLatencyMs || info.baseLatencyMs}ms out · ${info.maxChannels}ch max · ${midiStatus}` : "engine idle — press play"}
        </span>
      </div>
      <div className="mcrow">
        {audioTracks.map((tr, i) => (
          <ChannelStrip key={tr.id} tr={tr} ts={trackSettings?.[tr.id] || {}} tab={TAB_COLORS[i % TAB_COLORS.length]}
            onPatch={(p) => setTrackSetting(tr.id, p)} midiLearnId={midiLearnId} onMidiLearn={learn} />
        ))}
        {!audioTracks.length && <div className="dim small" style={{ padding: 12 }}>No audio tracks. Add one from the timeline (+ AUDIO), or drop music/dialogue on A1/A2.</div>}
        {/* MASTER */}
        <div className="mcstrip master">
          <div className="mctop"><div className="dim small" style={{ textAlign: "center", width: "100%", fontWeight: 900, letterSpacing: ".1em" }}>MASTER</div></div>
          <button className={`mcbtn ${limiterOn ? "on" : ""}`} title="Brickwall limiter — clip-proof output" onClick={() => setLimiterOn((v) => !v)}>LIMIT</button>
          <div className="mcgr" title="Limiter gain reduction"><i ref={grRef} style={{ width: "0%" }} /></div>
          <div className="mcfaderrow">
            <div className="mcfader">
              <input type="range" min="0" max="1.5" step="0.005" value={masterVol} onChange={(e) => setMasterVol(parseFloat(e.target.value))} onDoubleClick={() => setMasterVol(1)}
                style={{ writingMode: "vertical-lr", direction: "rtl" }} />
            </div>
            <Meter id="master" tall />
          </div>
          <span className="mcdb">{fmtDb(masterVol)}</span>
          <button className={`mcms ${midiLearnId === "master" ? "on learn" : ""}`} title="MIDI-learn the master fader" onClick={() => learn("master")}>◎</button>
          <span className="mcname">MAIN</span>
        </div>
      </div>
      {/* hardware output routing */}
      <div className="btnrow" style={{ gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span className="lbl">OUTPUT</span>
        <select className="sel" value={sink} onChange={(e) => chooseSink(e.target.value)} title="Route the engine to a hardware output (Chromium)">
          <option value="default">System default</option>
          {devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
        </select>
        {info.maxChannels > 2 && (
          <>
            <span className="lbl">CH</span>
            <select className="sel" defaultValue="2" onChange={(e) => setOutputChannels(parseInt(e.target.value, 10))} title="Multi-channel output (surround interfaces)">
              {[2, 4, 6, 8].filter((n) => n <= info.maxChannels).map((n) => <option key={n} value={n}>{n}ch</option>)}
            </select>
          </>
        )}
        <button className="minibtn" onClick={() => listOutputDevices().then(setDevices)}>↻ DEVICES</button>
        <span className="dim small">Faders/pan/EQ/comp/sends are live and bake into the export. Solo mutes the rest. MIDI-learn (◎) maps a controller to any fader.</span>
      </div>
      {/* FX rack — shared aux buses the channel RVB/DLY sends feed */}
      <div className="fxrack">
        <div className="fxunit">
          <div className="lbl">◗ REVERB <span className="dim small" style={{ letterSpacing: 0 }}>convolution</span></div>
          <div className="insp-row"><span className="lbl">SPACE</span>
            <select className="sel xs grow" value={rvb.preset} onChange={(e) => setRvb({ preset: e.target.value })}>
              {REVERB_PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="insp-row"><span className="lbl">MIX</span>
            <input type="range" min="0" max="1.5" step="0.02" value={rvb.wet} onChange={(e) => setRvb({ wet: parseFloat(e.target.value) })} />
            <span className="insp-val mono">{Math.round(rvb.wet * 100)}</span>
          </div>
        </div>
        <div className="fxunit">
          <div className="lbl">◗ DELAY <span className="dim small" style={{ letterSpacing: 0 }}>feedback</span></div>
          <div className="insp-row"><span className="lbl">TIME</span>
            <input type="range" min="0.02" max="1.2" step="0.01" value={dly.time} onChange={(e) => setDly({ time: parseFloat(e.target.value) })} />
            <span className="insp-val mono">{Math.round(dly.time * 1000)}ms</span>
          </div>
          <div className="insp-row"><span className="lbl">FBK</span>
            <input type="range" min="0" max="0.9" step="0.02" value={dly.feedback} onChange={(e) => setDly({ feedback: parseFloat(e.target.value) })} />
            <span className="insp-val mono">{Math.round(dly.feedback * 100)}</span>
          </div>
          <div className="insp-row"><span className="lbl">MIX</span>
            <input type="range" min="0" max="1.5" step="0.02" value={dly.wet} onChange={(e) => setDly({ wet: parseFloat(e.target.value) })} />
            <span className="insp-val mono">{Math.round(dly.wet * 100)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
