// NodeGraphEditor — a real node compositor for Fabula (H3). Builds a NodeGraph
// (services engine: plajahPixels/engine/core/nodeGraph) — source → effect → merge →
// output — that the SAME renderer evaluates live (SceneView) and in the export
// (offlineRenderer's type:'nodegraph' path). The engine (the hard, deterministic,
// export-parity half) already exists; this is the editor it was missing.
//
// Nodes carry editor x/y (the engine ignores unknown fields). Wire a node by
// clicking an OUTPUT port then an INPUT port. Add to the pool → a droppable clip
// whose pixels snapshot is one nodegraph layer, so it plays and renders like any comp.

import { useMemo, useRef, useState } from "react";
import SceneView from "../plajahPixels/components/SceneView";

const uid = () => Math.random().toString(36).slice(2, 8);
const GEN_MODES = ["WAVEFORM", "SPECTRUM", "TUNNEL", "VORTEX", "NEBULA", "COSMIC", "RETROGRID", "KALEIDOSCOPE", "STAGE", "LIQUID", "PARTICLES", "STORM", "LUMINANCE"];
const FX_IDS = ["invert", "color", "blur", "glow", "pixelate", "rgbshift", "vignette", "sharpen", "mirror", "shake"];
const BLENDS = ["normal", "screen", "add", "multiply", "overlay", "lighten", "darken", "difference"];
const NODE_W = 128, NODE_H = 54;

function defaultGraph() {
  const src = { id: uid(), type: "source", srcKind: "generator", sceneMode: "NEBULA", x: 40, y: 40 };
  const out = { id: uid(), type: "output", input: src.id, x: 320, y: 60 };
  return { nodes: [src, out], output: out.id };
}

export default function NodeGraphEditor({ onAddToPool, ping, palette }) {
  const [graph, setGraph] = useState(defaultGraph);
  const [sel, setSel] = useState(null);
  const [linkFrom, setLinkFrom] = useState(null); // armed output node id
  const dragRef = useRef(null);
  const areaRef = useRef(null);

  const nodeById = useMemo(() => Object.fromEntries(graph.nodes.map((n) => [n.id, n])), [graph]);
  const selNode = sel ? nodeById[sel] : null;

  const update = (id, patch) => setGraph((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }));
  const addNode = (partial) => {
    const n = { id: uid(), x: 60 + Math.round(Math.random() * 40), y: 150 + Math.round(Math.random() * 40), ...partial };
    setGraph((g) => ({ ...g, nodes: [...g.nodes, n], output: partial.type === "output" ? n.id : g.output }));
    setSel(n.id);
  };
  const removeNode = (id) => setGraph((g) => {
    const nodes = g.nodes.filter((n) => n.id !== id).map((n) => ({
      ...n,
      input: n.input === id ? undefined : n.input,
      inputA: n.inputA === id ? undefined : n.inputA,
      inputB: n.inputB === id ? undefined : n.inputB,
    }));
    return { ...g, nodes, output: g.output === id ? (nodes.find((n) => n.type === "output")?.id || "") : g.output };
  });

  // Connect: an armed output → a clicked input port (which = input | inputA | inputB).
  const connect = (targetId, port) => {
    if (!linkFrom || linkFrom === targetId) { setLinkFrom(null); return; }
    update(targetId, { [port]: linkFrom });
    setLinkFrom(null);
  };

  const onNodeDown = (e, id) => {
    e.stopPropagation();
    setSel(id);
    const n = nodeById[id];
    const rect = areaRef.current.getBoundingClientRect();
    dragRef.current = { id, dx: e.clientX - rect.left - n.x, dy: e.clientY - rect.top - n.y };
    const mv = (ev) => {
      const d = dragRef.current; if (!d) return;
      const r = areaRef.current.getBoundingClientRect();
      update(d.id, { x: Math.max(0, ev.clientX - r.left - d.dx), y: Math.max(0, ev.clientY - r.top - d.dy) });
    };
    const up = () => { dragRef.current = null; window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
  };

  // Wires: from each node's used input(s) to the upstream node's output.
  const wires = [];
  for (const n of graph.nodes) {
    const links = n.type === "merge" ? [["inputA", n.inputA, 0.35], ["inputB", n.inputB, 0.65]] : [["input", n.input, 0.5]];
    for (const [, from, fy] of links) {
      if (!from || !nodeById[from]) continue;
      const a = nodeById[from], b = n;
      wires.push({ x1: a.x + NODE_W, y1: a.y + NODE_H / 2, x2: b.x, y2: b.y + NODE_H * fy });
    }
  }

  const previewSnap = useMemo(() => ({
    name: "graph",
    layers: [{ id: "v1", blendMode: "normal", opacity: 1, clip: { type: "nodegraph", graph } }],
  }), [graph]);

  const portClass = (nodeId) => `ngport out ${linkFrom === nodeId ? "armed" : ""}`;

  return (
    <div className="ngeditor">
      <div className="ngpalette">
        <span className="cap">ADD</span>
        <button className="tbtn2" onClick={() => addNode({ type: "source", srcKind: "generator", sceneMode: "NEBULA" })}>◈ GENERATOR</button>
        <button className="tbtn2" onClick={() => addNode({ type: "source", srcKind: "color", fillColor: "#1b2b4a" })}>■ COLOR</button>
        <button className="tbtn2" onClick={() => addNode({ type: "effect", fxId: "glow" })}>✦ EFFECT</button>
        <button className="tbtn2" onClick={() => addNode({ type: "merge", blendMode: "screen" })}>⧉ MERGE</button>
        <button className="tbtn2" onClick={() => addNode({ type: "output" })}>▣ OUTPUT</button>
        <span className="tdiv" />
        {linkFrom ? <span className="chip amb">CLICK AN INPUT PORT…</span> : <span className="dim small">Click ● (output) then ◦ (input) to wire.</span>}
        <button className="minibtn on" style={{ marginLeft: "auto" }} onClick={() => {
          if (!graph.output || !nodeById[graph.output]) { ping?.("Add an OUTPUT node and wire it up first."); return; }
          onAddToPool?.(previewSnap, "Node Graph");
        }}>✓ ADD TO POOL</button>
      </div>

      <div className="ngbody">
        <div className="ngcanvas" ref={areaRef} onMouseDown={() => { setSel(null); setLinkFrom(null); }}>
          <svg className="ngwires" aria-hidden="true">
            {wires.map((w, i) => (
              <path key={i} d={`M${w.x1},${w.y1} C${w.x1 + 46},${w.y1} ${w.x2 - 46},${w.y2} ${w.x2},${w.y2}`} fill="none" stroke="url(#nggrad)" strokeWidth="2" />
            ))}
            <defs><linearGradient id="nggrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#7c3aed" /><stop offset="0.5" stopColor="#e0459b" /><stop offset="1" stopColor="#f97316" />
            </linearGradient></defs>
          </svg>
          {graph.nodes.map((n) => (
            <div key={n.id} className={`ngnode ${n.type} ${sel === n.id ? "sel" : ""} ${graph.output === n.id ? "isout" : ""}`}
              style={{ left: n.x, top: n.y, width: NODE_W }} onMouseDown={(e) => onNodeDown(e, n.id)}>
              <div className="ngtitle">
                <span>{n.type === "source" ? (n.srcKind === "color" ? "COLOR" : n.srcKind === "shader" ? "SHADER" : (n.sceneMode || "GEN")) : n.type === "effect" ? (n.fxId || "FX").toUpperCase() : n.type === "merge" ? `MERGE·${(n.blendMode || "screen").slice(0, 4).toUpperCase()}` : "OUTPUT"}</span>
                {graph.output === n.id && <span className="ngbadge">OUT</span>}
              </div>
              <div className="ngtype">{n.type}</div>
              {/* input ports */}
              {n.type === "merge" ? (
                <>
                  <span className="ngport in a" title="Input A (bottom)" onMouseDown={(e) => { e.stopPropagation(); connect(n.id, "inputA"); }} />
                  <span className="ngport in b" title="Input B (top)" onMouseDown={(e) => { e.stopPropagation(); connect(n.id, "inputB"); }} />
                </>
              ) : n.type !== "source" ? (
                <span className="ngport in" title="Input" onMouseDown={(e) => { e.stopPropagation(); connect(n.id, "input"); }} />
              ) : null}
              {/* output port */}
              {n.type !== "output" && (
                <span className={portClass(n.id)} title="Output — click, then click an input" onMouseDown={(e) => { e.stopPropagation(); setLinkFrom(n.id); }} />
              )}
            </div>
          ))}
        </div>

        <aside className="nginsp glass-dark">
          <div className="lbl">NODE</div>
          {!selNode ? <div className="dim small" style={{ lineHeight: 1.6 }}>Select a node to edit it. Wire OUTPUT → the graph renders live below.</div> : (
            <>
              <div className="isec"><span className="chip pur" style={{ flex: 1 }}>{selNode.type.toUpperCase()}</span>
                {graph.output !== selNode.id && selNode.type === "output" && <button className="minibtn" onClick={() => setGraph((g) => ({ ...g, output: selNode.id }))}>SET OUT</button>}
                <button className="minibtn danger" onClick={() => { removeNode(selNode.id); setSel(null); }}>✕</button></div>

              {selNode.type === "source" && (
                <>
                  <div className="param">SOURCE</div>
                  <span className="segx">
                    {["generator", "color"].map((k) => <button key={k} className={selNode.srcKind === k ? "on" : ""} onClick={() => update(selNode.id, { srcKind: k })}>{k.toUpperCase()}</button>)}
                  </span>
                  {selNode.srcKind === "generator" && (
                    <select className="sel xs" value={selNode.sceneMode || "NEBULA"} onChange={(e) => update(selNode.id, { sceneMode: e.target.value })}>
                      {GEN_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  )}
                  {selNode.srcKind === "color" && (
                    <input type="color" value={selNode.fillColor || "#1b2b4a"} onChange={(e) => update(selNode.id, { fillColor: e.target.value })} style={{ width: "100%", height: 26 }} />
                  )}
                </>
              )}
              {selNode.type === "effect" && (
                <>
                  <div className="param">EFFECT</div>
                  <select className="sel xs" value={selNode.fxId || "glow"} onChange={(e) => update(selNode.id, { fxId: e.target.value })}>
                    {FX_IDS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <div className="dim small">Wire its input ◦ to an upstream node.</div>
                </>
              )}
              {selNode.type === "merge" && (
                <>
                  <div className="param">BLEND</div>
                  <select className="sel xs" value={selNode.blendMode || "screen"} onChange={(e) => update(selNode.id, { blendMode: e.target.value })}>
                    {BLENDS.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                  <div className="dim small">Input A = bottom · Input B = top.</div>
                </>
              )}
              {selNode.type === "output" && <div className="dim small">The graph's final image. Wire its input to the last node.</div>}
            </>
          )}

          <div className="lbl" style={{ marginTop: 8 }}>PREVIEW</div>
          <div className="ngpreview">
            <SceneView snapshot={previewSnap} palette={palette} playing />
          </div>
          <div className="dim small" style={{ marginTop: 6 }}>{graph.nodes.length} nodes · live-evaluated by the export renderer.</div>
        </aside>
      </div>
    </div>
  );
}
