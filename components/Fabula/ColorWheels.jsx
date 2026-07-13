// ColorWheels — DaVinci Resolve-style primary trackballs for the color page. Three wheels (Lift /
// Gamma / Gain), each a hue disc with a draggable puck that tilts the R/G/B balance, and a master
// luma ring-slider beneath. Drives the existing wheel[key] = [R,G,B] model (def-centred), so grade
// export parity is unchanged. Neutral Resolve palette with fleeting Plajah-logo warmth on the rings.
import { useRef } from "react";

// channel phasors — red up, green lower-left, blue lower-right (Resolve orientation)
const A = { R: 90, G: 210, B: 330 };
const U = Object.fromEntries(Object.entries(A).map(([k, d]) => [k, [Math.cos(d * Math.PI / 180), Math.sin(d * Math.PI / 180)]]));

function Wheel({ label, rgb, def, min, max, onChange, onMaster, master }) {
  const ref = useRef(null);
  const scale = (max - min) * 0.5;                 // full-radius push = half the range
  const d = [rgb[0] - def, rgb[1] - def, rgb[2] - def];
  // puck position from RGB (inverse 3-phasor); screen y is inverted
  let px = (2 / 3) * (d[0] * U.R[0] + d[1] * U.G[0] + d[2] * U.B[0]) / scale;
  let py = (2 / 3) * (d[0] * U.R[1] + d[1] * U.G[1] + d[2] * U.B[1]) / scale;
  const mag = Math.hypot(px, py); if (mag > 1) { px /= mag; py /= mag; }
  const set = (cx, cy) => {
    const r = ref.current.getBoundingClientRect();
    let nx = (cx - (r.left + r.width / 2)) / (r.width / 2);
    let ny = (cy - (r.top + r.height / 2)) / (r.height / 2);
    const m = Math.hypot(nx, ny); if (m > 1) { nx /= m; ny /= m; }
    // project puck onto each channel axis → per-channel offset
    const next = ["R", "G", "B"].map((k) => {
      const off = (nx * U[k][0] + ny * U[k][1]) * scale;
      return Math.max(min, Math.min(max, def + off));
    });
    onChange(next);
  };
  const onDown = (e) => {
    set(e.clientX, e.clientY);
    const mv = (ev) => set(ev.clientX, ev.clientY);
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
    e.preventDefault();
  };
  const avg = (rgb[0] + rgb[1] + rgb[2]) / 3;
  return (
    <div className="cw">
      <div className="cw-disc" ref={ref} onPointerDown={onDown} onDoubleClick={() => onChange([def, def, def])} title="Drag to balance color · double-click resets">
        <div className="cw-cross" /><div className="cw-cross v" />
        <div className="cw-puck" style={{ left: `calc(50% + ${px * 50}% )`, top: `calc(50% + ${py * 50}% )` }} />
      </div>
      <div className="cw-label">{label}</div>
      <input className="cw-master" type="range" min={min} max={max} step="0.005" value={master ?? avg}
        onChange={(e) => onMaster(parseFloat(e.target.value))} onDoubleClick={() => onChange([def, def, def])} title="Master (luma)" />
      <div className="cw-val mono">{avg.toFixed(2)}</div>
    </div>
  );
}

export default function ColorWheels({ wheel, setWheel }) {
  const shift = (key, delta) => setWheel({ [key]: wheel[key].map((v) => v + delta) });
  return (
    <div className="cwrap">
      <style>{CW_CSS}</style>
      <Wheel label="LIFT" rgb={wheel.lift} def={0} min={-0.5} max={0.5} onChange={(v) => setWheel({ lift: v })}
        onMaster={(m) => shift("lift", m - (wheel.lift[0] + wheel.lift[1] + wheel.lift[2]) / 3)} />
      <Wheel label="GAMMA" rgb={wheel.gamma} def={1} min={0.3} max={2.5} onChange={(v) => setWheel({ gamma: v })}
        onMaster={(m) => shift("gamma", m - (wheel.gamma[0] + wheel.gamma[1] + wheel.gamma[2]) / 3)} />
      <Wheel label="GAIN" rgb={wheel.gain} def={1} min={0} max={2.5} onChange={(v) => setWheel({ gain: v })}
        onMaster={(m) => shift("gain", m - (wheel.gain[0] + wheel.gain[1] + wheel.gain[2]) / 3)} />
    </div>
  );
}

const CW_CSS = `
.cwrap{display:flex;gap:12px;justify-content:space-between;padding:6px 2px 2px}
.cw{flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;min-width:0}
.cw-disc{position:relative;width:100%;max-width:96px;aspect-ratio:1;border-radius:50%;cursor:crosshair;touch-action:none;
  background:
    radial-gradient(circle at 50% 50%,#2b2b31 0%,#2b2b31 30%,transparent 62%),
    conic-gradient(from 90deg,#ff5a5a,#ffd84d,#7ee88a,#4dd6ff,#7c6bff,#e04ea0,#ff5a5a);
  border:2px solid #0c0c10;box-shadow:inset 0 0 14px rgba(0,0,0,.7),0 2px 8px rgba(0,0,0,.45)}
.cw-disc::after{content:"";position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 50% 50%,rgba(30,30,36,.9) 0%,rgba(30,30,36,.55) 26%,transparent 55%);pointer-events:none}
.cw-cross{position:absolute;left:8%;right:8%;top:50%;height:1px;background:rgba(255,255,255,.12);pointer-events:none}
.cw-cross.v{left:50%;right:auto;top:8%;bottom:8%;width:1px;height:auto}
.cw-puck{position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;
  background:radial-gradient(circle at 36% 32%,#fff,#d0d0d8 55%,#8a8a94);border:1.5px solid rgba(0,0,0,.8);
  box-shadow:0 1px 4px rgba(0,0,0,.7),0 0 8px rgba(255,255,255,.35);pointer-events:none;z-index:2}
.cw-label{font-size:8.5px;font-weight:900;letter-spacing:.16em;color:#a8a8b2}
.cw-master{width:100%;max-width:96px}
.cw-val{font-size:9px;color:#d8d8e0;background:rgba(0,0,0,.4);border:1px solid var(--line-2);border-radius:3px;padding:0 6px}
`;
