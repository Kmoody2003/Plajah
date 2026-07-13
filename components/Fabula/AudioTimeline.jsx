// AudioTimeline — a Fairlight-style DAW timeline for Fabula's AUDIO page. Mirrors Resolve's Fairlight
// workflow in concept: tall audio lanes with waveforms + per-track headers (color tab, M/S, mini
// fader/meter) on the left, a time ruler on top, a scrubable playhead, and clip selection — sitting
// above the mixing console. Reuses the project data model (clips/tracks/playhead/trackSettings) and the
// shared Waveform peaks. Read-mostly: click to seek + select; heavy editing still lives on the edit page.
import { memo, useMemo, useRef, useState } from "react";
import { Play, Pause, ZoomIn, ZoomOut, Maximize2, SlidersHorizontal, Scissors, Music } from "lucide-react";
import Waveform from "./Waveform";
import { meterRegistry } from "../../services/fabula/audioGraph";
import { useEffect } from "react";

const TAB = ["#f97316", "#00A3FF", "#22c55e", "#a855f7", "#ffcf33", "#ff6b9d"];
const HEAD_W = 150;
const ROW_H = 74;

const LaneMeter = memo(function LaneMeter({ id }) {
  const fill = useRef(null);
  useEffect(() => {
    let raf, hold = 0;
    const tick = () => {
      const s = meterRegistry.get(id); const lv = s ? Math.min(1, s() * 1.1) : 0;
      hold = lv > hold ? lv : Math.max(lv, hold - 0.03);
      if (fill.current) fill.current.style.width = (hold * 100).toFixed(1) + "%";
      raf = requestAnimationFrame(tick);
    };
    tick(); return () => cancelAnimationFrame(raf);
  }, [id]);
  return <div className="atl-meter"><i ref={fill} /></div>;
});

export default function AudioTimeline({
  audioTracks, clips, prod, vfmt, fmtTc, playhead, setPlayhead, playing, setPlaying,
  selClipId, setSelClipId, trackSettings, setTrackSetting, onOpenEditor, onSplit,
}) {
  const [pps, setPps] = useState(48); // px per second (zoom)
  const scrollRef = useRef(null);

  const seqEnd = useMemo(() => clips.reduce((m, c) => Math.max(m, (c.start || 0) + (c.duration || 0)), 0), [clips]);
  const totalDur = Math.max(seqEnd + 4, 20);
  const laneW = totalDur * pps;

  const ticks = useMemo(() => {
    const stepSec = pps > 90 ? 1 : pps > 45 ? 2 : pps > 22 ? 5 : 10;
    const out = [];
    for (let t = 0; t <= totalDur; t += stepSec) out.push(t);
    return out;
  }, [totalDur, pps]);

  const fit = () => {
    const w = (scrollRef.current?.clientWidth || 800) - HEAD_W - 24;
    setPps(Math.max(8, Math.min(200, w / totalDur)));
  };
  const seek = (e, laneEl) => {
    const r = laneEl.getBoundingClientRect();
    const t = Math.max(0, (e.clientX - r.left + laneEl.scrollLeft) / pps);
    setPlayhead(Math.round(t * (vfmt.fps || 24)) / (vfmt.fps || 24));
  };

  return (
    <div className="atl glass-card">
      <style>{ATL_CSS}</style>
      <div className="atl-bar">
        <div className="lbl" style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}><Music size={12} /> AUDIO TIMELINE
          <span className="dim small" style={{ letterSpacing: 0 }}>Fairlight-style · scrub to seek, click a clip to select</span></div>
        <div style={{ flex: 1 }} />
        <button className="minibtn" onClick={() => setPlaying((p) => !p)} style={{ width: 44 }}>{playing ? <Pause size={12} /> : <Play size={12} />}</button>
        <span className="atl-tc mono">{fmtTc(playhead, vfmt)}</span>
        <button className="minibtn" onClick={() => setPps((z) => Math.max(8, z / 1.4))} title="Zoom out"><ZoomOut size={12} /></button>
        <button className="minibtn" onClick={() => setPps((z) => Math.min(200, z * 1.4))} title="Zoom in"><ZoomIn size={12} /></button>
        <button className="minibtn" onClick={fit} title="Zoom to fit"><Maximize2 size={12} /></button>
      </div>

      <div className="atl-scroll" ref={scrollRef}>
        <div className="atl-inner" style={{ width: HEAD_W + laneW }}>
          {/* ruler */}
          <div className="atl-rulerrow">
            <div className="atl-corner" />
            <div className="atl-ruler" style={{ width: laneW }} onMouseDown={(e) => seek(e, e.currentTarget)}>
              {ticks.map((t) => (
                <span key={t} className="atl-tick" style={{ left: t * pps }}>{fmtTc(t, vfmt).slice(0, 8)}</span>
              ))}
            </div>
          </div>
          {/* lanes */}
          {audioTracks.map((tr, i) => {
            const ts = trackSettings?.[tr.id] || {};
            const tab = TAB[i % TAB.length];
            const laneClips = clips.filter((c) => c.trackId === tr.id).sort((a, b) => a.start - b.start);
            return (
              <div className="atl-row" key={tr.id} style={{ height: ROW_H }}>
                <div className="atl-head" style={{ "--tab": tab }}>
                  <div className="atl-hname">{tr.name}</div>
                  <div className="atl-hctl">
                    <button className={`atl-ms ${ts.mute ? "on mute" : ""}`} onClick={() => setTrackSetting(tr.id, { mute: !ts.mute })}>M</button>
                    <button className={`atl-ms ${ts.solo ? "on solo" : ""}`} onClick={() => setTrackSetting(tr.id, { solo: !ts.solo })}>S</button>
                    <input className="atl-fader" type="range" min="0" max="1.5" step="0.01" value={ts.vol == null ? 1 : ts.vol}
                      onChange={(e) => setTrackSetting(tr.id, { vol: parseFloat(e.target.value) })} onDoubleClick={() => setTrackSetting(tr.id, { vol: 1 })} />
                  </div>
                  <LaneMeter id={tr.id} />
                </div>
                <div className="atl-lane" style={{ width: laneW }} onMouseDown={(e) => { if (e.target.classList.contains("atl-lane")) seek(e, e.currentTarget); }}>
                  {laneClips.map((c) => {
                    const asset = c.assetId ? prod?.mediaPool?.find((a) => a.id === c.assetId) : null;
                    const url = asset?.url;
                    const sel = c.id === selClipId;
                    return (
                      <div key={c.id} className={`atl-clip ${sel ? "sel" : ""}`} style={{ left: (c.start || 0) * pps, width: Math.max(8, (c.duration || 0) * pps), "--tab": tab }}
                        onMouseDown={(e) => { e.stopPropagation(); setSelClipId(c.id); setPlayhead(c.start); }}
                        onDoubleClick={() => onOpenEditor && onOpenEditor(c)} title={`${c.label || "clip"} — double-click to edit`}>
                        <div className="atl-cliphdr">
                          <span className="atl-cliplabel">{c.label || asset?.name || "clip"}</span>
                          {url && <span className="atl-clipacts">
                            <button title="Audio editor" onMouseDown={(e) => { e.stopPropagation(); onOpenEditor && onOpenEditor(c); }}><SlidersHorizontal size={9} /></button>
                            <button title="Isolate vocals + music" onMouseDown={(e) => { e.stopPropagation(); onSplit && onSplit(c); }}><Scissors size={9} /></button>
                          </span>}
                        </div>
                        {url && <div className="atl-clipwave"><Waveform url={url} srcIn={c.srcIn || 0} duration={c.duration} bars={Math.max(24, Math.floor((c.duration || 1) * pps / 3))} /></div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {!audioTracks.length && <div className="dim small" style={{ padding: 16 }}>No audio tracks yet.</div>}
          {/* playhead across all lanes */}
          <div className="atl-ph" style={{ left: HEAD_W + playhead * pps }} />
        </div>
      </div>
    </div>
  );
}

const ATL_CSS = `
.atl{padding:10px}
.atl-bar{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.atl-tc{font-size:11px;color:#e8e8ee;background:rgba(0,0,0,.4);border:1px solid var(--line-2);border-radius:5px;padding:3px 8px;letter-spacing:.02em}
.atl-scroll{overflow:auto;max-height:340px;border:1px solid var(--line);border-radius:10px;background:linear-gradient(180deg,rgba(0,0,0,.28),rgba(0,0,0,.16))}
.atl-scroll::-webkit-scrollbar{width:11px;height:11px}
.atl-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,.2);border-radius:6px;border:3px solid transparent;background-clip:padding-box}
.atl-inner{position:relative;min-width:100%}
.atl-rulerrow{display:flex;position:sticky;top:0;z-index:6;height:22px}
.atl-corner{width:${HEAD_W}px;min-width:${HEAD_W}px;position:sticky;left:0;z-index:7;background:rgba(20,20,26,.96);border-right:1px solid var(--line);border-bottom:1px solid var(--line)}
.atl-ruler{position:relative;height:22px;background:rgba(18,18,24,.85);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);cursor:crosshair}
.atl-tick{position:absolute;bottom:2px;font-family:'JetBrains Mono',monospace;font-size:8px;color:rgba(255,255,255,.4);border-left:1px solid var(--line);padding-left:3px;height:12px}
.atl-row{display:flex;border-bottom:1px solid var(--line-2)}
.atl-head{width:${HEAD_W}px;min-width:${HEAD_W}px;position:sticky;left:0;z-index:5;background:linear-gradient(180deg,rgba(38,38,48,.95),rgba(22,22,28,.96));
  border-right:1px solid var(--line);padding:7px 9px 7px 12px;display:flex;flex-direction:column;gap:6px;justify-content:center;position:relative;overflow:hidden}
.atl-head::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--tab)}
.atl-hname{font-size:10px;font-weight:900;letter-spacing:.05em;text-transform:uppercase;color:#dcdce4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.atl-hctl{display:flex;align-items:center;gap:5px}
.atl-ms{width:20px;height:18px;font-size:9px;font-weight:900;border-radius:5px;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--w40);cursor:pointer;padding:0;flex:0 0 auto}
.atl-ms.on.mute{background:linear-gradient(180deg,#ff6b6b,#ef4444);color:#fff;border-color:#ef4444}
.atl-ms.on.solo{background:linear-gradient(180deg,#ffe066,#ffcf33);color:#000;border-color:#ffcf33}
.atl-fader{flex:1;min-width:0;height:6px;accent-color:var(--tab);cursor:pointer}
.atl-meter{height:5px;border-radius:3px;overflow:hidden;background:rgba(0,0,0,.5);border:1px solid var(--line-2);position:relative}
.atl-meter i{position:absolute;left:0;top:0;bottom:0;width:0;background:linear-gradient(90deg,#25c26a 0%,#25c26a 60%,#e6d84f 82%,#ff5252 100%)}
.atl-lane{position:relative;flex:1;background-image:linear-gradient(to right,var(--line-2) 1px,transparent 1px);background-size:${48}px 100%;cursor:crosshair}
/* frosted color clip — translucent tinted glass over the lane, color kept via the channel tab */
.atl-clip{position:absolute;top:5px;bottom:5px;border-radius:8px;overflow:hidden;cursor:pointer;
  border:1px solid color-mix(in srgb,var(--tab) 55%,rgba(255,255,255,.25));
  background:linear-gradient(180deg,color-mix(in srgb,var(--tab) 34%,transparent),color-mix(in srgb,var(--tab) 18%,transparent));
  backdrop-filter:blur(9px) saturate(1.3);-webkit-backdrop-filter:blur(9px) saturate(1.3);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.16),0 2px 6px rgba(0,0,0,.3);display:flex;flex-direction:column}
.atl-clip.sel{box-shadow:0 0 0 1.5px #fff,0 0 16px color-mix(in srgb,var(--tab) 55%,transparent),inset 0 1px 0 rgba(255,255,255,.2);z-index:4}
.atl-cliphdr{display:flex;align-items:center;justify-content:space-between;gap:4px;padding:2px 6px;background:rgba(0,0,0,.28)}
.atl-cliplabel{font-size:9.5px;font-weight:800;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,.5)}
.atl-clipacts{display:flex;gap:2px;flex:0 0 auto}
.atl-clipacts button{display:inline-flex;align-items:center;justify-content:center;width:16px;height:15px;border-radius:3px;border:1px solid var(--line);background:rgba(0,0,0,.35);color:#eee;cursor:pointer;padding:0}
.atl-clipacts button:hover{background:rgba(255,255,255,.18)}
.atl-clipwave{flex:1;min-height:0;padding:0 3px;display:flex;align-items:center}
.atl-clipwave .wave{width:100%;height:70%}
.atl-ph{position:absolute;top:0;bottom:0;width:2px;background:#ff5252;box-shadow:0 0 8px rgba(255,82,82,.7);z-index:8;pointer-events:none}
`;
