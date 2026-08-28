// CurveEditor — the color room's tone-curve editor. Draws + edits the SAME curve
// model (services/fabula/gradeCurves) that the GL compositor samples, so what you
// draw is exactly what previews in the grade monitor and bakes into the export.
//
// Channels: Y (master, applied after the per-channel curves), R, G, B. Points are
// [x, y] in 0..1. Click empty space to add a point; drag to move; double-click to
// remove (endpoints stay, they just slide vertically). Identity == empty list.

import { memo, useRef, useState, useCallback, useEffect } from "react";
import { evalCurve } from "../../services/fabula/gradeCurves";

const CH = [
  { id: "master", lab: "Y", color: "#f2f2f5" },
  { id: "r", lab: "R", color: "#ff7a7a" },
  { id: "g", lab: "G", color: "#7ee2a8" },
  { id: "b", lab: "B", color: "#7ab8ff" },
];
const PAD = 10;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Editable points for a channel, always including the two endpoints. */
function withEnds(pts) {
  const list = (pts || []).map((p) => [clamp01(p[0]), clamp01(p[1])]);
  if (!list.some((p) => p[0] <= 0.0001)) list.unshift([0, 0]);
  if (!list.some((p) => p[0] >= 0.9999)) list.push([1, 1]);
  list.sort((a, b) => a[0] - b[0]);
  return list;
}
/** Strip a channel back to identity when it's a straight diagonal (keeps state clean). */
function cleanup(pts) {
  const p = withEnds(pts);
  if (p.length === 2 && p[0][1] < 1e-4 && Math.abs(p[1][1] - 1) < 1e-4) return undefined;
  return p;
}

function CurveEditor({ curves, onChange, width = 300, height = 300 }) {
  const canvasRef = useRef(null);
  const dragRef = useRef(null); // index of the point being dragged
  const [ch, setCh] = useState("master");
  const [, force] = useState(0);

  const pts = withEnds(curves?.[ch]);

  const px = (x) => PAD + x * (width - 2 * PAD);
  const py = (y) => height - PAD - y * (height - 2 * PAD);
  const ux = (X) => clamp01((X - PAD) / (width - 2 * PAD));
  const uy = (Y) => clamp01((height - PAD - Y) / (height - 2 * PAD));

  const draw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== width * dpr) { c.width = width * dpr; c.height = height * dpr; }
    const x = c.getContext("2d");
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, width, height);
    // grid
    x.strokeStyle = "rgba(255,255,255,.06)"; x.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const gx = Math.round(px(i / 4)) + 0.5, gy = Math.round(py(i / 4)) + 0.5;
      x.beginPath(); x.moveTo(gx, PAD); x.lineTo(gx, height - PAD); x.stroke();
      x.beginPath(); x.moveTo(PAD, gy); x.lineTo(width - PAD, gy); x.stroke();
    }
    x.strokeStyle = "rgba(255,255,255,.12)"; x.strokeRect(PAD + 0.5, PAD + 0.5, width - 2 * PAD - 1, height - 2 * PAD - 1);
    x.strokeStyle = "rgba(255,255,255,.1)"; x.setLineDash([4, 4]);
    x.beginPath(); x.moveTo(PAD, height - PAD); x.lineTo(width - PAD, PAD); x.stroke(); x.setLineDash([]);
    // curve
    const col = CH.find((k) => k.id === ch).color;
    x.beginPath();
    for (let s = 0; s <= 128; s++) {
      const u = s / 128, v = evalCurve(pts, u);
      if (s === 0) x.moveTo(px(u), py(v)); else x.lineTo(px(u), py(v));
    }
    x.strokeStyle = col; x.lineWidth = 1.8; x.stroke();
    // points
    pts.forEach((p) => {
      x.beginPath(); x.arc(px(p[0]), py(p[1]), 4, 0, Math.PI * 2);
      x.fillStyle = col; x.fill();
      x.strokeStyle = "rgba(0,0,0,.6)"; x.lineWidth = 1; x.stroke();
    });
  }, [ch, pts, width, height]);

  // redraw after every render (curve edits / channel switch)
  useEffect(() => { draw(); });

  const commit = (nextPts) => {
    const next = { ...(curves || {}), [ch]: cleanup(nextPts) };
    if (next[ch] === undefined) delete next[ch];
    onChange(Object.keys(next).length ? next : undefined);
  };

  const hitTest = (X, Y) => {
    for (let i = 0; i < pts.length; i++) {
      if (Math.hypot(px(pts[i][0]) - X, py(pts[i][1]) - Y) < 9) return i;
    }
    return -1;
  };

  const onDown = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const X = e.clientX - r.left, Y = e.clientY - r.top;
    let i = hitTest(X, Y);
    if (i < 0) {
      // add a new interior point at this x
      const nx = ux(X), ny = uy(Y);
      const np = pts.filter((p) => p[0] > 0.0001 && p[0] < 0.9999).concat([[nx, ny]]);
      const full = withEnds(np);
      i = full.findIndex((p) => p[0] === nx && p[1] === ny);
      dragRef.current = i;
      commit(full);
    } else {
      dragRef.current = i;
    }
    force((n) => n + 1);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
  const onMove = (e) => {
    const idx = dragRef.current;
    if (idx == null) return;
    const r = canvasRef.current.getBoundingClientRect();
    const cur = withEnds(curves?.[ch]);
    const isEnd = idx === 0 || idx === cur.length - 1;
    const nx = isEnd ? cur[idx][0] : clamp01((e.clientX - r.left - PAD) / (width - 2 * PAD));
    const ny = clamp01((height - PAD - (e.clientY - r.top)) / (height - 2 * PAD));
    const np = cur.map((p, i) => (i === idx ? [nx, ny] : p));
    commit(np);
  };
  const onUp = () => {
    dragRef.current = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };
  const onDbl = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const i = hitTest(e.clientX - r.left, e.clientY - r.top);
    if (i > 0 && i < pts.length - 1) commit(pts.filter((_, k) => k !== i));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 4 }}>
        {CH.map((k) => (
          <button key={k.id} className="tbtn2" style={ch === k.id ? { background: k.color, color: "#0b0b0e", borderColor: k.color } : { color: k.color }}
            onClick={() => setCh(k.id)}>{k.lab}</button>
        ))}
        <button className="tbtn2 ghost" style={{ marginLeft: "auto" }} title="Reset this channel"
          onClick={() => commit([[0, 0], [1, 1]])}>RESET {CH.find((k) => k.id === ch).lab}</button>
      </div>
      <canvas ref={canvasRef} style={{ width, height, borderRadius: 8, background: "rgba(0,0,0,.5)", border: "1px solid var(--line-2)", cursor: "crosshair", touchAction: "none" }}
        onPointerDown={onDown} onDoubleClick={onDbl} />
    </div>
  );
}

export default memo(CurveEditor);
