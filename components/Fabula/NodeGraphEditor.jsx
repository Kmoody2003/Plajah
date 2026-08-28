// NodeGraphEditor — Fabula's node compositor, laid out to the Comp Room mockup:
// node LIBRARY (grouped sources / effects / composite) | the CANVAS, dominant |
// a right column with the LIVE VIEWER + a real per-node INSPECTOR whose effect
// parameters come straight from the engine's FX_EFFECTS metadata — every slider
// writes fxParams the renderer actually evaluates (live SceneView + export parity
// via the offlineRenderer's type:'nodegraph' path).
//
// Wire by clicking an OUTPUT port ● then an INPUT port ◦ (merge has A + B).
// ADD TO POOL snapshots the graph as a droppable clip.

import { useMemo, useRef, useState } from "react";
import SceneView from "../plajahPixels/components/SceneView";
import { FX_EFFECTS } from "../plajahPixels/engine/fx/effects";

const uid = () => Math.random().toString(36).slice(2, 8);
const GEN_MODES = ["WAVEFORM", "SPECTRUM", "TUNNEL", "VORTEX", "NEBULA", "COSMIC", "RETROGRID", "KALEIDOSCOPE", "STAGE", "LIQUID", "PARTICLES", "STORM", "LUMINANCE"];
const BLENDS = ["normal", "screen", "add", "multiply", "overlay", "lighten", "darken", "difference"];
const NODE_W = 128;

const NODE_TAB = (n) => n.type === "output" ? "var(--org)"
  : n.type === "merge" ? "var(--pl-magenta, #e0459b)"
  : n.type === "effect" ? "var(--org)"
  : n.srcKind === "color" ? "var(--green)"
  : n.srcKind === "shader" ? "#31c6a8"
  : "var(--pur)";
const NODE_ICO = (n) => n.type === "output" ? "◉" : n.type === "merge" ? "＋" : n.type === "effect" ? "E" : n.srcKind === "color" ? "■" : "G";
const NODE_NAME = (n) => n.type === "output" ? "Output"
  : n.type === "merge" ? "Merge"
  : n.type === "effect" ? (FX_EFFECTS.find((f) => f.id === n.fxId)?.name || n.fxId || "Effect")
  : n.srcKind === "color" ? "Color" : (n.sceneMode || "Generator");

function defaultGraph() {
  const src = { id: uid(), type: "source", srcKind: "generator", sceneMode: "NEBULA", x: 30, y: 60 };
  const out = { id: uid(), type: "output", input: src.id, x: 330, y: 80 };
  return { nodes: [src, out], output: out.id };
}

export default function NodeGraphEditor({ onAddToPool, ping, palette }) {
  const [graph, setGraph] = useState(defaultGraph);
  const [sel, setSel] = useState(null);
  const [linkFrom, setLinkFrom] = useState(null);
  const dragRef = useRef(null);
  const areaRef = useRef(null);

  const nodeById = useMemo(() => Object.fromEntries(graph.nodes.map((n) => [n.id, n])), [graph]);
  const selNode = sel ? nodeById[sel] : null;

  const update = (id, patch) => setGraph((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }));
  const addNode = (partial) => {
    const n = { id: uid(), x: 40 + Math.round(Math.random() * 60), y: 180 + Math.round(Math.random() * 60), ...partial };
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

  const wires = [];
  for (const n of graph.nodes) {
    const links = n.type === "merge" ? [["inputA", n.inputA, 0.35], ["inputB", n.inputB, 0.65]] : [["input", n.input, 0.5]];
    for (const [, from, fy] of links) {
      if (!from || !nodeById[from]) continue;
      const a = nodeById[from], b = n;
      wires.push({ x1: a.x + NODE_W, y1: a.y + 27, x2: b.x, y2: b.y + 54 * fy });
    }
  }

  const previewSnap = useMemo(() => ({
    name: "graph",
    layers: [{ id: "v1", blendMode: "normal", opacity: 1, clip: { type: "nodegraph", graph } }],
  }), [graph]);

  const setFxParam = (idx, v) => {
    if (!selNode) return;
    const fx = FX_EFFECTS.find((f) => f.id === selNode.fxId);
    const base = fx ? fx.params.map((p, i) => (selNode.fxParams?.[i] ?? p.default)) : [...(selNode.fxParams || [])];
    base[idx] = v;
    update(selNode.id, { fxParams: base });
  };

  const LIB = [
    { cap: "SOURCES", items: [
      { lab: "Generator", ico: "G", hue: "var(--pur)", add: () => addNode({ type: "source", srcKind: "generator", sceneMode: "NEBULA" }) },
      { lab: "Color", ico: "■", hue: "var(--green)", add: () => addNode({ type: "source", srcKind: "color", fillColor: "#1b2b4a" }) },
    ] },
    { cap: `EFFECTS · ${FX_EFFECTS.length}`, items: FX_EFFECTS.map((f) => (
      { lab: f.name, ico: "E", hue: "var(--org)", add: () => addNode({ type: "effect", fxId: f.id }) }
    )) },
    { cap: "COMPOSITE", items: [
      { lab: "Merge", ico: "＋", hue: "var(--pl-magenta, #e0459b)", add: () => addNode({ type: "merge", blendMode: "screen" }) },
      { lab: "Output", ico: "◉", hue: "var(--org)", add: () => addNode({ type: "output" }) },
    ] },
  ];

  return (
    <div className="ngeditor">
      <div className="ngbody">
        {/* ── node LIBRARY (Mockup B #2) ── */}
        <aside className="nglib glass-dark">
          <div className="paneltitle">NODES</div>
          <div className="nglibscroll">
            {LIB.map((grp) => (
              <div key={grp.cap} className="nglibgrp">
                <span className="cap">{grp.cap}</span>
                {grp.items.map((it) => (
                  <button key={it.lab} className="nglibitem" onClick={it.add} title={`Add ${it.lab}`}>
                    <i style={{ background: it.hue }}>{it.ico}</i>{it.lab}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </aside>

        {/* ── the CANVAS, dominant (Mockup B #1) ── */}
        <div className="ngcanvas" ref={areaRef} onMouseDown={() => { setSel(null); setLinkFrom(null); }}>
          <svg className="ngwires" aria-hidden="true">
            {wires.map((w, i) => (
              <path key={i} d={`M${w.x1},${w.y1} C${w.x1 + 46},${w.y1} ${w.x2 - 46},${w.y2} ${w.x2},${w.y2}`} fill="none" stroke="url(#nggrad)" strokeWidth="2" />
            ))}
            <defs><linearGradient id="nggrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#7c3aed" /><stop offset="0.5" stopColor="#e0459b" /><stop offset="1" stopColor="#f97316" />
            </linearGradient></defs>
          </svg>
          <div className="ngtools">
            {linkFrom ? <span className="chip amb">CLICK AN INPUT PORT ◦</span>
              : <span className="dim small">Drag nodes · ● output → ◦ input wires them</span>}
          </div>
          {graph.nodes.map((n) => (
            <div key={n.id} className={`ngnode ${sel === n.id ? "sel" : ""} ${graph.output === n.id ? "isout" : ""}`}
              style={{ left: n.x, top: n.y, width: NODE_W, "--tab": NODE_TAB(n) }} onMouseDown={(e) => onNodeDown(e, n.id)}>
              <div className="ngtitle">
                <i className="ngico" style={{ background: NODE_TAB(n) }}>{NODE_ICO(n)}</i>
                <span>{NODE_NAME(n)}</span>
                {graph.output === n.id && <span className="ngbadge">OUT</span>}
              </div>
              <div className="ngfoot">
                <span>{n.type === "merge" ? `${(n.blendMode || "screen").toUpperCase()}` : n.type.toUpperCase()}</span>
              </div>
              {n.type === "merge" ? (
                <>
                  <span className="ngport in a" title="Input A (bottom)" onMouseDown={(e) => { e.stopPropagation(); connect(n.id, "inputA"); }} />
                  <span className="ngport in b" title="Input B (top)" onMouseDown={(e) => { e.stopPropagation(); connect(n.id, "inputB"); }} />
                </>
              ) : n.type !== "source" ? (
                <span className="ngport in" title="Input" onMouseDown={(e) => { e.stopPropagation(); connect(n.id, "input"); }} />
              ) : null}
              {n.type !== "output" && (
                <span className={`ngport out ${linkFrom === n.id ? "armed" : ""}`} title="Output — click, then click an input"
                  onMouseDown={(e) => { e.stopPropagation(); setLinkFrom(n.id); }} />
              )}
            </div>
          ))}
          <div className="ngzoom">
            <span className="chip dimchip">{graph.nodes.length} NODES</span>
            <button className="minibtn on" onClick={() => {
              if (!graph.output || !nodeById[graph.output]) { ping?.("Add an OUTPUT node and wire it up first."); return; }
              onAddToPool?.(previewSnap, "Node Graph");
            }}>✓ ADD TO POOL</button>
          </div>
        </div>

        {/* ── right column: live viewer + real inspector (Mockup B #4/#5) ── */}
        <div className="ngright">
          <div className="ngviewer glass-dark">
            <div className="ngpreview"><SceneView snapshot={previewSnap} palette={palette} playing /></div>
            <div className="ngviewbar">
              <span className="cap">VIEWING · OUTPUT</span>
              <span className="chip green" style={{ marginLeft: "auto" }}>LIVE · EXPORT-EXACT</span>
            </div>
          </div>
          <aside className="nginsp glass-dark">
            <div className="isec"><span className="paneltitle" style={{ flex: 1 }}>{selNode ? `NODE · ${NODE_NAME(selNode)}` : "NODE"}</span>
              {selNode && <span className="chip amb">{selNode.type.toUpperCase()}</span>}</div>
            {!selNode ? <div className="dim small" style={{ lineHeight: 1.6 }}>Select a node. Effect parameters here are the renderer's own — every slider changes the export.</div> : (
              <>
                {selNode.type === "source" && (
                  <>
                    <span className="lbl">SOURCE</span>
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
                {selNode.type === "effect" && (() => {
                  const fx = FX_EFFECTS.find((f) => f.id === selNode.fxId);
                  return (
                    <>
                      <span className="lbl">EFFECT</span>
                      <select className="sel xs" value={selNode.fxId || "glow"} onChange={(e) => update(selNode.id, { fxId: e.target.value, fxParams: undefined })}>
                        {FX_EFFECTS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                      {fx && fx.params.map((p, i) => {
                        const v = selNode.fxParams?.[i] ?? p.default;
                        return (
                          <div className="fxrow" key={p.key}>
                            <span className="fxlbl">{p.label}</span>
                            <input type="range" min={p.min} max={p.max} step={(p.max - p.min) / 200} value={v}
                              onChange={(e) => setFxParam(i, parseFloat(e.target.value))}
                              onDoubleClick={() => setFxParam(i, p.default)} />
                            <span className="fxval">{Number(v).toFixed(2)}</span>
                          </div>
                        );
                      })}
                      <div className="dim small">Wire its input ◦ from an upstream node.</div>
                    </>
                  );
                })()}
                {selNode.type === "merge" && (
                  <>
                    <span className="lbl">BLEND</span>
                    <select className="sel xs" value={selNode.blendMode || "screen"} onChange={(e) => update(selNode.id, { blendMode: e.target.value })}>
                      {BLENDS.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                    <div className="dim small">Input A = bottom · Input B = top.</div>
                  </>
                )}
                {selNode.type === "output" && (
                  <>
                    <div className="dim small">The graph's final image — wire its input to the last node.</div>
                    {graph.output !== selNode.id && <button className="minibtn" onClick={() => setGraph((g) => ({ ...g, output: selNode.id }))}>SET AS OUT</button>}
                  </>
                )}
                <button className="minibtn danger" style={{ marginTop: "auto", alignSelf: "flex-start" }} onClick={() => { removeNode(selNode.id); setSel(null); }}>✕ DELETE NODE</button>
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
