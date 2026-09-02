// FxLibrary — Fabula's Resolve-style Effects Library + FX-page studios.
//
// Three exports:
//   FxLibraryPanel  — the panel between the media pool and the viewers on the EDIT page:
//                     FILTERS (one-click fx presets w/ live CSS previews), GENERATORS (the
//                     Pixels GPU generators — insert as clips that render live AND export),
//                     and the LOTTIE library (imported animations grouped in sub-sections).
//   LottieBuilder   — novice-friendly Lottie CREATOR (FX page): pick a shape, a motion preset,
//                     colors and timing; live canvas preview; exports REAL Lottie JSON into the
//                     media pool (playable by the existing LottieLayer) or as a .json download.
//   PerformCapture  — VTuber puppeteering for POST (FX page + launchable from the edit page):
//                     the camera-streamer's puppet stack (chatterbox sprite from any character
//                     image, or an uploaded .vrm) driven live by your webcam; record takes
//                     straight into the media pool as editable clips.

import { useEffect, useRef, useState } from "react";
import { FX_EFFECTS } from "../plajahPixels/engine/fx/effects";
import { FORGE_TRANSITIONS } from "../../services/fabula/forgeTransitions";

/* ─────────────── FILTER PRESETS (map to the clip fx model: bri/con/sat/blur/op) ─────────────── */
export const FILTER_PRESETS = [
  { id: "warm", name: "Warm", fx: { bri: 1.06, con: 1.05, sat: 1.18 }, css: "brightness(1.06) contrast(1.05) saturate(1.18)" },
  { id: "cool", name: "Cool", fx: { bri: 1.02, con: 1.08, sat: 0.82 }, css: "brightness(1.02) contrast(1.08) saturate(0.82)" },
  { id: "vivid", name: "Vivid", fx: { con: 1.18, sat: 1.45 }, css: "contrast(1.18) saturate(1.45)" },
  { id: "noir", name: "Noir", fx: { sat: 0, con: 1.25, bri: 0.98 }, css: "saturate(0) contrast(1.25) brightness(0.98)" },
  { id: "faded", name: "Faded Film", fx: { con: 0.85, sat: 0.75, bri: 1.08 }, css: "contrast(0.85) saturate(0.75) brightness(1.08)" },
  { id: "punch", name: "Punch", fx: { con: 1.35, sat: 1.15 }, css: "contrast(1.35) saturate(1.15)" },
  { id: "dream", name: "Dream", fx: { blur: 1.6, bri: 1.12, sat: 1.1 }, css: "blur(1.2px) brightness(1.12) saturate(1.1)" },
  { id: "dusk", name: "Dusk", fx: { bri: 0.85, con: 1.12, sat: 0.9 }, css: "brightness(0.85) contrast(1.12) saturate(0.9)" },
  { id: "bleach", name: "Bleach", fx: { bri: 1.15, con: 1.3, sat: 0.55 }, css: "brightness(1.15) contrast(1.3) saturate(0.55)" },
  { id: "soft", name: "Soft Glow", fx: { blur: 0.8, bri: 1.08, con: 0.92 }, css: "blur(0.6px) brightness(1.08) contrast(0.92)" },
  { id: "reset", name: "Clear Filter", fx: { bri: 1, con: 1, sat: 1, blur: 0 }, css: "none" },
];

/* ─────────────── GENERATORS (Pixels GPU scenes — live in the monitor + in exports) ─────────────── */
export const GENERATOR_LIST = [
  ["COSMIC", "Cosmic"], ["RETROGRID", "Retro Grid"], ["KALEIDOSCOPE", "Kaleidoscope"],
  ["STAGE", "Stage Lights"], ["LIQUID", "Liquid"], ["PARTICLES", "Particles"],
  ["STORM", "Storm"], ["LUMINANCE", "Luminance"], ["STUDIO_AURORA", "Aurora"],
  ["STUDIO_CHROME", "Chrome"], ["STUDIO_BAUHAUS", "Bauhaus"], ["STUDIO_NEBULA", "Nebula"],
  ["STUDIO_GRAVITY", "Gravity"], ["STUDIO_KINETIC", "Kinetic"], ["STUDIO_RIPPLE", "Ripple"],
];
const GEN_TINTS = ["#7b5cff", "#ff8c42", "#31c6a8", "#ff5c8a", "#4ea1ff", "#ffd166", "#9d4edd", "#57cc99"];

export function FxLibraryPanel({ prod, selClipId, onApplyFilter, onAddForge, onAddTransition, onInsertGenerator, onInsertLottie, onImportLottie, onOpenFxPage, onClose }) {
  const [tab, setTab] = useState("forge");
  const [forgeCat, setForgeCat] = useState("all");
  const [forgeQuery, setForgeQuery] = useState("");
  const FORGE_CATS = [["all", "ALL"], ["light", "LIGHT"], ["blur", "BLUR"], ["color", "COLOR"], ["utility", "KEY"], ["stylize", "STYLIZE"], ["distort", "WARP"], ["time", "TIME"], ["generator", "GENERATE"]];
  const forgeMatches = (effect) => {
    if (forgeCat !== "all" && (effect.category || "utility") !== forgeCat) return false;
    const q = forgeQuery.trim().toLowerCase();
    if (!q) return true;
    return effect.name.toLowerCase().includes(q) || (effect.summary || "").toLowerCase().includes(q) || (effect.presets || []).some((p) => p.name.toLowerCase().includes(q));
  };
  const lotties = (prod?.mediaPool || []).filter((a) => a.type === "lottie");
  const lottieBins = Array.from(new Set(lotties.map((a) => a.bin || "imports")));
  return (
    <aside className="fxlib glass-dark">
      <div className="paneltitle">⚡ EFFECTS LIBRARY
        <button className="minibtn" style={{ marginLeft: "auto", fontSize: 8 }} onClick={onClose} title="Close">✕</button>
      </div>
      <div className="fxtabs">
        {[["forge", "FORGE"], ["transitions", "TRANSITIONS"], ["filters", "FILTERS"], ["generators", "GENERATORS"], ["lottie", "LOTTIE"]].map(([id, lbl]) => (
          <button key={id} className={`fxtab ${tab === id ? "on" : ""}`} onClick={() => setTab(id)}>{lbl}</button>
        ))}
      </div>
      <div className="fxbody">
        {tab === "forge" && (
          <>
            <div className="dim small" style={{ padding: "2px 2px 8px" }}>{selClipId ? "Add a premium native effect or begin with a curated look. The stack stays editable in the Inspector." : "Select a video clip, then choose an effect or curated look."}</div>
            <div className="btnrow" style={{ gap: 4, flexWrap: "wrap", padding: "0 2px 6px" }}>
              {FORGE_CATS.map(([id, lbl]) => <button key={id} className={`minibtn ${forgeCat === id ? "on" : ""}`} onClick={() => setForgeCat(id)}>{lbl}</button>)}
              <input className="in" style={{ flex: "1 1 120px", minWidth: 100 }} placeholder="Search effects…" value={forgeQuery} onChange={(e) => setForgeQuery(e.target.value)} />
              <span className="dim small mono">{FX_EFFECTS.filter((e) => e.category && forgeMatches(e)).length}/{FX_EFFECTS.length}</span>
            </div>
            {FX_EFFECTS.filter((effect) => effect.category && forgeMatches(effect)).map((effect) => (
              <div key={effect.id} style={{ marginBottom: 10 }}>
                <button className="fxrowbtn" disabled={!selClipId} onClick={() => onAddForge(effect.id)} title={effect.summary || `Add ${effect.name}`}>
                  <span className="fxdot">✦</span><span className="fxrowname">{effect.name}</span><span className="dim small">ADD</span>
                </button>
                {!!effect.presets?.length && (
                  <div className="fxgrid" style={{ marginTop: 5 }}>
                    {effect.presets.map((preset) => (
                      <button key={preset.id} className="fxcard" disabled={!selClipId} onClick={() => onAddForge(effect.id, preset.id)} title={preset.description}>
                        <span className="fxthumb gen" style={{ background: "radial-gradient(circle at 36% 32%, rgba(255,190,112,.82), rgba(93,54,132,.46) 42%, #0a0a12 78%)" }}>✦</span>
                        <span className="fxname">{preset.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </>
        )}
        {tab === "transitions" && (
          <>
            <div className="dim small" style={{ padding: "2px 2px 8px" }}>{selClipId ? "Apply to the selected incoming clip. Forge blends it with the previous shot using both source frames." : "Select the incoming clip at a cut, then choose a transition look."}</div>
            {FORGE_TRANSITIONS.map((transition) => (
              <div key={transition.id} style={{ marginBottom: 10 }}>
                <div className="fxrowbtn" style={{ cursor: "default" }}><span className="fxdot">⇄</span><span className="fxrowname">{transition.name}</span><span className="dim small">{transition.family}</span></div>
                <div className="fxgrid" style={{ marginTop: 5 }}>
                  {transition.presets.map((preset) => (
                    <button key={preset.id} className="fxcard" disabled={!selClipId} onClick={() => onAddTransition(transition.id, preset.id)} title={transition.description}>
                      <span className="fxthumb gen" style={{ background: "linear-gradient(120deg,#24174b 0 46%,#ff8c42 54% 100%)" }}>⇄</span>
                      <span className="fxname">{preset.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
        {tab === "filters" && (
          <>
            <div className="dim small" style={{ padding: "2px 2px 6px" }}>{selClipId ? "Click a preset to apply it to the selected clip. Fine-tune in the inspector." : "Select a clip in the timeline, then click a preset."}</div>
            <div className="fxgrid">
              {FILTER_PRESETS.map((p) => (
                <button key={p.id} className="fxcard" onClick={() => onApplyFilter(p)} title={`Apply ${p.name}`}>
                  <span className="fxthumb" style={{ filter: p.css === "none" ? undefined : p.css }} />
                  <span className="fxname">{p.name}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {tab === "generators" && (
          <>
            <div className="dim small" style={{ padding: "2px 2px 6px" }}>GPU-rendered animated backgrounds. Click to insert at the playhead — they play live and render into exports.</div>
            <div className="fxgrid">
              {GENERATOR_LIST.map(([mode, name], i) => (
                <button key={mode} className="fxcard" onClick={() => onInsertGenerator(mode, name)} title={`Insert ${name} generator`}>
                  <span className="fxthumb gen" style={{ background: `radial-gradient(circle at 30% 30%, ${GEN_TINTS[i % GEN_TINTS.length]}, #0a0a12 75%)` }}>▶</span>
                  <span className="fxname">{name}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {tab === "lottie" && (
          <>
            <div className="btnrow" style={{ gap: 5, marginBottom: 6 }}>
              <button className="minibtn grow" onClick={onImportLottie} title="Import .lottie / Lottie .json files">＋ IMPORT</button>
              <button className="minibtn blue grow" onClick={onOpenFxPage} title="Open the Lottie Builder on the FX page">🛠 BUILD NEW</button>
            </div>
            {!lotties.length && <div className="dim small" style={{ padding: 6 }}>No Lottie animations yet. Import .lottie/.json files (thousands of free ones at lottiefiles.com), or build your own on the FX page.</div>}
            {lottieBins.map((bin) => (
              <div key={bin}>
                <div className="lbl" style={{ margin: "8px 2px 4px" }}>{bin.toUpperCase()}</div>
                <div className="fxlist">
                  {lotties.filter((a) => (a.bin || "imports") === bin).map((a) => (
                    <button key={a.id} className="fxrowbtn" onClick={() => onInsertLottie(a)} title="Insert at the playhead">
                      <span className="fxdot">◈</span><span className="fxrowname">{a.name}</span><span className="dim small">insert</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </aside>
  );
}

/* ═══════════════ LOTTIE BUILDER — novice keyframe animator that exports real Lottie JSON ═══════════════ */
const MOTIONS = [
  { id: "slideL", name: "Slide in ←", from: { x: -240, y: 0, s: 100, r: 0, o: 0 }, to: { x: 0, y: 0, s: 100, r: 0, o: 100 } },
  { id: "slideR", name: "Slide in →", from: { x: 240, y: 0, s: 100, r: 0, o: 0 }, to: { x: 0, y: 0, s: 100, r: 0, o: 100 } },
  { id: "rise", name: "Rise up", from: { x: 0, y: 200, s: 100, r: 0, o: 0 }, to: { x: 0, y: 0, s: 100, r: 0, o: 100 } },
  { id: "pop", name: "Pop", from: { x: 0, y: 0, s: 0, r: 0, o: 0 }, to: { x: 0, y: 0, s: 100, r: 0, o: 100 } },
  { id: "spin", name: "Spin in", from: { x: 0, y: 0, s: 20, r: -360, o: 0 }, to: { x: 0, y: 0, s: 100, r: 0, o: 100 } },
  { id: "fade", name: "Fade", from: { x: 0, y: 0, s: 100, r: 0, o: 0 }, to: { x: 0, y: 0, s: 100, r: 0, o: 100 } },
  { id: "drift", name: "Drift across", from: { x: -180, y: 40, s: 90, r: -12, o: 100 }, to: { x: 180, y: -40, s: 110, r: 12, o: 100 } },
  { id: "pulse", name: "Pulse", from: { x: 0, y: 0, s: 80, r: 0, o: 100 }, to: { x: 0, y: 0, s: 120, r: 0, o: 100 } },
];
const hex2rgb = (h) => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };

function buildLottieJson(layers, durationSec, fps, size) {
  const op = Math.round(durationSec * fps);
  const EASE = { i: { x: [0.35], y: [1] }, o: { x: [0.65], y: [0] } };
  const kf = (v0, v1, dims) => ({ a: 1, k: [{ t: 0, s: dims ? v0 : [v0], ...EASE }, { t: op, s: dims ? v1 : [v1] }] });
  return {
    v: "5.7.4", fr: fps, ip: 0, op, w: size, h: size, nm: "Fabula Motion", ddd: 0, assets: [],
    layers: layers.map((L, i) => {
      const cx = size / 2, cy = size / 2;
      const shape = L.shape === "ellipse"
        ? { ty: "el", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [L.size, L.size] } }
        : L.shape === "star"
          ? { ty: "sr", sy: 1, p: { a: 0, k: [0, 0] }, pt: { a: 0, k: 5 }, r: { a: 0, k: 0 }, ir: { a: 0, k: L.size * 0.24 }, or: { a: 0, k: L.size * 0.5 }, is: { a: 0, k: 0 }, os: { a: 0, k: 0 } }
          : { ty: "rc", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [L.size, L.size] }, r: { a: 0, k: L.shape === "pill" ? L.size / 2 : 10 } };
      return {
        ddd: 0, ind: i + 1, ty: 4, nm: `${L.shape}-${i + 1}`, sr: 1,
        ks: {
          o: kf(L.from.o, L.to.o),
          r: kf(L.from.r, L.to.r),
          p: kf([cx + L.from.x, cy + L.from.y, 0], [cx + L.to.x, cy + L.to.y, 0], true),
          a: { a: 0, k: [0, 0, 0] },
          s: kf([L.from.s, L.from.s, 100], [L.to.s, L.to.s, 100], true),
        },
        shapes: [{ ty: "gr", nm: "g", it: [shape, { ty: "fl", c: { a: 0, k: [...hex2rgb(L.color), 1] }, o: { a: 0, k: 100 } }, { ty: "tr", p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } }] }],
        ip: 0, op, st: 0, bm: 0,
      };
    }),
  };
}

export function LottieBuilder({ onAddToPool }) {
  const SIZE = 512;
  const canvasRef = useRef(null);
  const [layers, setLayers] = useState([{ id: 1, shape: "star", color: "#FF8C00", size: 180, from: { ...MOTIONS[3].from }, to: { ...MOTIONS[3].to }, motion: "pop" }]);
  const [sel, setSel] = useState(1);
  const [dur, setDur] = useState(2);
  const [name, setName] = useState("My Motion");
  const layersRef = useRef(layers); layersRef.current = layers;
  const durRef = useRef(dur); durRef.current = dur;

  // Live preview — direct canvas interpolation matching the exported keyframes (ease-in-out).
  useEffect(() => {
    let raf; const t0 = performance.now();
    const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
    const draw = (now) => {
      const c = canvasRef.current;
      if (c) {
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#101016"; ctx.fillRect(0, 0, SIZE, SIZE);
        const u = ease(((now - t0) / 1000 % Math.max(0.2, durRef.current)) / Math.max(0.2, durRef.current));
        for (const L of layersRef.current) {
          const lerp = (a, b) => a + (b - a) * u;
          const x = SIZE / 2 + lerp(L.from.x, L.to.x), y = SIZE / 2 + lerp(L.from.y, L.to.y);
          const s = lerp(L.from.s, L.to.s) / 100, r = (lerp(L.from.r, L.to.r) * Math.PI) / 180, o = lerp(L.from.o, L.to.o) / 100;
          ctx.save(); ctx.translate(x, y); ctx.rotate(r); ctx.scale(s, s); ctx.globalAlpha = Math.max(0, Math.min(1, o));
          ctx.fillStyle = L.color;
          const h = L.size / 2;
          if (L.shape === "ellipse") { ctx.beginPath(); ctx.arc(0, 0, h, 0, Math.PI * 2); ctx.fill(); }
          else if (L.shape === "star") {
            ctx.beginPath();
            for (let i = 0; i < 10; i++) { const ang = (i * Math.PI) / 5 - Math.PI / 2; const rad = i % 2 === 0 ? h : h * 0.48; ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad); }
            ctx.closePath(); ctx.fill();
          } else { const rr = L.shape === "pill" ? h : 10; ctx.beginPath(); ctx.roundRect(-h, -h, L.size, L.size, rr); ctx.fill(); }
          ctx.restore();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const L = layers.find((x) => x.id === sel) || layers[0];
  const patch = (p) => setLayers((cur) => cur.map((x) => (x.id === sel ? { ...x, ...p } : x)));
  const addLayer = () => { const id = Math.max(0, ...layers.map((x) => x.id)) + 1; setLayers((c) => [...c, { id, shape: "ellipse", color: "#4ea1ff", size: 140, from: { ...MOTIONS[5].from }, to: { ...MOTIONS[5].to }, motion: "fade" }]); setSel(id); };
  const exportJson = () => new Blob([JSON.stringify(buildLottieJson(layers, dur, 30, SIZE))], { type: "application/json" });

  return (
    <div className="fxstudio glass-dark">
      <div className="paneltitle">🛠 LOTTIE BUILDER <span className="dim small" style={{ marginLeft: 8, letterSpacing: 0 }}>shape → motion → export. Real Lottie JSON, ready for the timeline.</span></div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <canvas ref={canvasRef} width={SIZE} height={SIZE} style={{ width: 240, height: 240, borderRadius: 10, background: "#101016", flex: "0 0 auto" }} />
        <div style={{ flex: 1, minWidth: 240 }}>
          <div className="btnrow" style={{ gap: 4, flexWrap: "wrap" }}>
            {layers.map((x) => <button key={x.id} className={`minibtn ${x.id === sel ? "blue" : ""}`} onClick={() => setSel(x.id)}>L{x.id}</button>)}
            <button className="minibtn" onClick={addLayer}>＋ LAYER</button>
            {layers.length > 1 && <button className="minibtn" onClick={() => { setLayers((c) => c.filter((x) => x.id !== sel)); setSel(layers.find((x) => x.id !== sel)?.id); }}>− REMOVE</button>}
          </div>
          <div className="lbl" style={{ marginTop: 8 }}>SHAPE</div>
          <div className="btnrow" style={{ gap: 4 }}>
            {[["rect", "▢"], ["pill", "▢̥"], ["ellipse", "◯"], ["star", "★"]].map(([s, g]) => (
              <button key={s} className={`minibtn ${L?.shape === s ? "blue" : ""}`} onClick={() => patch({ shape: s })}>{g} {s.toUpperCase()}</button>
            ))}
          </div>
          <div className="insp-row" style={{ marginTop: 6 }}><span className="lbl">COLOR</span>
            <input type="color" value={L?.color || "#FF8C00"} onChange={(e) => patch({ color: e.target.value })} style={{ width: 34, height: 22, border: "none", background: "none", cursor: "pointer" }} />
            <span className="lbl" style={{ marginLeft: 10 }}>SIZE</span>
            <input type="range" min="30" max="420" value={L?.size || 180} onChange={(e) => patch({ size: parseInt(e.target.value, 10) })} />
          </div>
          <div className="lbl" style={{ marginTop: 6 }}>MOTION</div>
          <div className="btnrow" style={{ gap: 4, flexWrap: "wrap" }}>
            {MOTIONS.map((m) => (
              <button key={m.id} className={`minibtn ${L?.motion === m.id ? "blue" : ""}`} onClick={() => patch({ motion: m.id, from: { ...m.from }, to: { ...m.to } })}>{m.name}</button>
            ))}
          </div>
          <div className="insp-row" style={{ marginTop: 6 }}><span className="lbl">LENGTH</span>
            <input type="range" min="0.5" max="8" step="0.25" value={dur} onChange={(e) => setDur(parseFloat(e.target.value))} />
            <span className="insp-val mono">{dur.toFixed(2)}s</span>
          </div>
          <div className="btnrow" style={{ gap: 5, marginTop: 10 }}>
            <input className="in tiny grow" value={name} onChange={(e) => setName(e.target.value)} placeholder="Animation name…" />
            <button className="cta sm" onClick={() => onAddToPool(exportJson(), name.trim() || "motion", dur)}>➕ ADD TO MEDIA POOL</button>
            <button className="minibtn" onClick={() => { const u = URL.createObjectURL(exportJson()); const a = document.createElement("a"); a.href = u; a.download = (name.trim() || "motion") + ".json"; a.click(); setTimeout(() => URL.revokeObjectURL(u), 5000); }}>⬇ .JSON</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════ COMP BUILDER — layer compositing with a conversational co-pilot ═══════════════
   Comps are Pixels scene snapshots: a LAYER STACK of generator / GLSL shader / color / text /
   media layers with blend modes + opacity, rendered by the same GPU engine live in the monitor
   AND in MP4 exports. The DESCRIBE box asks the AI to write (or rewrite) the whole stack —
   including custom GLSL — so a novice types "smoky purple nebula with light rays over my clip"
   and gets a working comp; power users then tweak every layer by hand. */
const BLEND_MODES = ["normal", "add", "screen", "multiply", "overlay", "lighten", "darken"];
export function CompBuilder({ prod, askAI, onAddToPool, ping }) {
  const [name, setName] = useState("My Comp");
  const [layers, setLayers] = useState([
    { id: 1, blendMode: "normal", opacity: 1, clip: { type: "generator", sceneMode: "STUDIO_NEBULA", opacity: 1 } },
  ]);
  const [sel, setSel] = useState(1);
  const [prompt, setPrompt] = useState("");
  const [thinking, setThinking] = useState(false);
  const mediaAssets = (prod?.mediaPool || []).filter((a) => a.url && (a.type === "video" || a.type === "image"));

  const L = layers.find((x) => x.id === sel);
  const patchL = (p) => setLayers((cur) => cur.map((x) => (x.id === sel ? { ...x, ...p } : x)));
  const patchClip = (p) => setLayers((cur) => cur.map((x) => (x.id === sel ? { ...x, clip: { ...x.clip, ...p } } : x)));
  const addLayer = (clip) => { const id = Math.max(0, ...layers.map((x) => x.id)) + 1; setLayers((c) => [...c, { id, blendMode: "screen", opacity: 1, clip }]); setSel(id); };
  const move = (dir) => setLayers((cur) => {
    const i = cur.findIndex((x) => x.id === sel); const j = i + dir;
    if (i < 0 || j < 0 || j >= cur.length) return cur;
    const n = [...cur]; [n[i], n[j]] = [n[j], n[i]]; return n;
  });
  const describe = async () => {
    if (!prompt.trim() || thinking) return;
    setThinking(true);
    try {
      const r = await askAI(
        `You are a motion-graphics compositor building a LAYER STACK for a GPU engine. Layers render bottom→top.
Layer clip types you can use:
- {"type":"generator","sceneMode":ONE OF ${GENERATOR_LIST.map(([m]) => m).join("|")},"params":[0..1 x4 optional]}
- {"type":"shader","shaderSrc":"WebGL2 GLSL fragment shader. MUST define: void main(){...} writing to 'o' (vec4 out). Available uniforms: float uT (seconds), vec2 uRes, sampler2D uAudio (x=freq). Use 'in vec2 vUv;'. Keep under 60 lines."}
- {"type":"color","fillColor":"#rrggbb"}
- {"type":"text","text":"..."}
- {"type":"media","mediaName":"EXACT name of a user asset from the list, or omit media layers if none fit"}
Respond with VALID JSON ONLY (no fences): {"name":"comp name","layers":[{"blendMode":"normal|add|screen|multiply|overlay|lighten|darken","opacity":0..1,"clip":{...}}]}
2-5 layers. Put backgrounds first, accents on top with screen/add blends.`,
        `USER ASSETS AVAILABLE: ${mediaAssets.map((a) => a.name).join(", ") || "(none)"}\n\nCURRENT STACK (rewrite or extend as asked): ${JSON.stringify(layers.map(({ id, ...rest }) => rest))}\n\nBUILD THIS: ${prompt}`
      );
      if (Array.isArray(r?.layers) && r.layers.length) {
        const next = r.layers.slice(0, 6).map((ly, i) => {
          const clip = { ...(ly.clip || {}) };
          if (clip.type === "media") {
            const m = mediaAssets.find((a) => a.name === clip.mediaName) || mediaAssets[0];
            if (m) { clip.mediaUrl = m.url; clip.mediaType = m.type === "image" ? "image" : "video"; }
            delete clip.mediaName;
          }
          return { id: i + 1, blendMode: BLEND_MODES.includes(ly.blendMode) ? ly.blendMode : "normal", opacity: Math.max(0, Math.min(1, ly.opacity ?? 1)), clip };
        });
        setLayers(next); setSel(next[next.length - 1].id);
        if (r.name) setName(r.name);
        ping?.("🎇 Comp built — tweak any layer, then add it to the pool");
      } else ping?.("The AI didn't return a usable stack — try rephrasing.");
    } catch (e) { ping?.("Comp build failed — " + (e?.message || "AI unavailable")); }
    setThinking(false);
  };
  const addToPool = () => {
    const snapshot = { name: name.trim() || "Comp", layers: layers.map((ly, i) => ({ id: "c" + (i + 1), blendMode: ly.blendMode, opacity: ly.opacity, clip: ly.clip })) };
    onAddToPool(snapshot, name.trim() || "Comp");
  };

  return (
    <div className="fxstudio glass-dark">
      <div className="paneltitle">🎇 COMP BUILDER <span className="dim small" style={{ marginLeft: 8, letterSpacing: 0 }}>layer compositing — describe it and the AI builds the stack (GLSL included); renders live + in exports</span></div>
      <div className="btnrow" style={{ gap: 5 }}>
        <input className="in grow" placeholder='Describe the comp… e.g. "smoky purple nebula, gold particles drifting up, my clip on top with a soft screen glow"'
          value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") describe(); }} />
        <button className="cta sm" disabled={thinking || !prompt.trim()} onClick={describe}>{thinking ? "COMPOSING…" : "✨ BUILD IT"}</button>
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
        <div style={{ flex: "0 0 240px" }}>
          <div className="lbl">LAYERS (bottom → top)</div>
          <div className="fxlist">
            {layers.map((ly) => (
              <button key={ly.id} className="fxrowbtn" style={ly.id === sel ? { borderColor: "rgba(255,140,0,0.6)" } : undefined} onClick={() => setSel(ly.id)}>
                <span className="fxdot">{{ generator: "⚡", shader: "ƒ", color: "■", text: "T", media: "🎞" }[ly.clip.type] || "•"}</span>
                <span className="fxrowname">{ly.clip.sceneMode || ly.clip.text || ly.clip.fillColor || (ly.clip.mediaUrl ? "media" : ly.clip.type)}</span>
                <span className="dim small">{ly.blendMode}</span>
              </button>
            ))}
          </div>
          <div className="btnrow" style={{ gap: 4, marginTop: 6, flexWrap: "wrap" }}>
            <button className="minibtn" onClick={() => addLayer({ type: "generator", sceneMode: "PARTICLES", opacity: 1 })}>＋GEN</button>
            <button className="minibtn" onClick={() => addLayer({ type: "color", fillColor: "#12081f", opacity: 1 })}>＋COLOR</button>
            <button className="minibtn" onClick={() => addLayer({ type: "text", text: "TITLE", opacity: 1 })}>＋TEXT</button>
            {mediaAssets.length > 0 && <button className="minibtn" onClick={() => addLayer({ type: "media", mediaUrl: mediaAssets[0].url, mediaType: mediaAssets[0].type === "image" ? "image" : "video", opacity: 1 })}>＋MEDIA</button>}
            <button className="minibtn" onClick={() => move(-1)}>▲</button>
            <button className="minibtn" onClick={() => move(1)}>▼</button>
            {layers.length > 1 && <button className="minibtn" onClick={() => { setLayers((c) => c.filter((x) => x.id !== sel)); setSel(layers.find((x) => x.id !== sel)?.id); }}>✕</button>}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          {L && (
            <>
              <div className="lbl">LAYER {layers.findIndex((x) => x.id === sel) + 1} — {L.clip.type.toUpperCase()}</div>
              <div className="insp-row"><span className="lbl">BLEND</span>
                <select className="sel xs grow" value={L.blendMode} onChange={(e) => patchL({ blendMode: e.target.value })}>
                  {BLEND_MODES.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className="insp-row"><span className="lbl">OPACITY</span>
                <input type="range" min="0" max="1" step="0.02" value={L.opacity} onChange={(e) => patchL({ opacity: parseFloat(e.target.value) })} />
                <span className="insp-val mono">{Math.round(L.opacity * 100)}%</span>
              </div>
              {L.clip.type === "generator" && (
                <div className="insp-row"><span className="lbl">SCENE</span>
                  <select className="sel xs grow" value={L.clip.sceneMode} onChange={(e) => patchClip({ sceneMode: e.target.value })}>
                    {GENERATOR_LIST.map(([m, n]) => <option key={m} value={m}>{n}</option>)}
                  </select>
                </div>
              )}
              {L.clip.type === "color" && (
                <div className="insp-row"><span className="lbl">COLOR</span>
                  <input type="color" value={L.clip.fillColor || "#12081f"} onChange={(e) => patchClip({ fillColor: e.target.value })} style={{ width: 34, height: 22, border: "none", background: "none", cursor: "pointer" }} />
                </div>
              )}
              {L.clip.type === "text" && (
                <input className="in" value={L.clip.text || ""} onChange={(e) => patchClip({ text: e.target.value })} placeholder="Text…" />
              )}
              {L.clip.type === "media" && (
                <select className="sel grow" value={L.clip.mediaUrl || ""} onChange={(e) => { const m = mediaAssets.find((a) => a.url === e.target.value); patchClip({ mediaUrl: e.target.value, mediaType: m?.type === "image" ? "image" : "video" }); }}>
                  {mediaAssets.map((a) => <option key={a.id} value={a.url}>{a.name}</option>)}
                </select>
              )}
              {L.clip.type === "shader" && (
                <>
                  <div className="lbl" style={{ marginTop: 4 }}>GLSL (AI-written — editable)</div>
                  <textarea className="ta mono" rows={6} value={L.clip.shaderSrc || ""} onChange={(e) => patchClip({ shaderSrc: e.target.value })} />
                </>
              )}
            </>
          )}
          <div className="btnrow" style={{ gap: 5, marginTop: 10 }}>
            <input className="in tiny grow" value={name} onChange={(e) => setName(e.target.value)} placeholder="Comp name…" />
            <button className="cta sm" onClick={addToPool}>➕ ADD TO MEDIA POOL</button>
          </div>
          <div className="dim small" style={{ marginTop: 6 }}>The comp becomes a pool asset — drop it on the timeline like a clip. It plays live in the monitor and renders on the GPU in exports.</div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════ PERFORM CAPTURE — VTuber puppeteering for post-production ═══════════════ */
export function PerformCapture({ onTake, ping }) {
  const stageRef = useRef(null);
  const handleRef = useRef(null);
  const camRef = useRef(null);
  const recRef = useRef(null);
  const [status, setStatus] = useState("Pick a character, then start the camera.");
  const [live, setLive] = useState(false);
  const [rec, setRec] = useState(false);
  const [takeN, setTakeN] = useState(1);
  const [green, setGreen] = useState(false);
  const avatarRef = useRef(null); // { avatar } or { avatarUrl }
  const sheetRef = useRef(null);
  const vrmRef = useRef(null);

  const stopAll = () => {
    try { recRef.current?.state !== "inactive" && recRef.current?.stop(); } catch { /* */ }
    try { handleRef.current?.dispose(); } catch { /* */ }
    try { camRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* */ }
    handleRef.current = null; camRef.current = null; setLive(false); setRec(false);
    if (stageRef.current) stageRef.current.innerHTML = "";
  };
  useEffect(() => () => stopAll(), []);

  const loadSheet = async (f) => {
    if (!f) return;
    setStatus("Building your puppet from the artwork…");
    try {
      const { buildVTuberFromSheet } = await import("../../services/vtuber/avatarFactory");
      const avatar = await buildVTuberFromSheet(f, { path: "PUPPET2D" });
      avatarRef.current = { avatar };
      setStatus(`Puppet ready from "${f.name}" — start the camera.`);
    } catch (e) { setStatus("Puppet build failed — " + (e?.message || e)); }
  };
  const loadVrm = (f) => { if (!f) return; avatarRef.current = { avatarUrl: URL.createObjectURL(f) }; setStatus(`VRM "${f.name}" loaded — start the camera.`); };

  const start = async () => {
    if (!avatarRef.current) { setStatus("Load a character image or .vrm first."); return; }
    try {
      setStatus("Starting camera…");
      const cam = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true });
      camRef.current = cam;
      const { createVTuberStream } = await import("../../services/vtuber/vtuberEngine");
      const handle = await createVTuberStream(cam, {
        ...avatarRef.current, mode: "AVATAR_ONLY", width: 960, height: 540,
        background: { type: "color", value: green ? "#00b140" : "#101016" },
        onStatus: (s) => setStatus(s),
      });
      handleRef.current = handle;
      if (stageRef.current) { stageRef.current.innerHTML = ""; handle.canvas.style.width = "100%"; handle.canvas.style.borderRadius = "10px"; stageRef.current.appendChild(handle.canvas); }
      setLive(true);
      setStatus("Live — your face drives the character. Record a take when ready.");
    } catch (e) { setStatus("Camera failed — " + (e?.message || e)); stopAll(); }
  };

  const record = () => {
    const handle = handleRef.current; if (!handle) return;
    if (rec) { try { recRef.current?.stop(); } catch { /* */ } return; }
    try {
      // performance video + your mic in one take
      const tracks = [...handle.stream.getVideoTracks(), ...(camRef.current?.getAudioTracks() || [])];
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm";
      const mr = new MediaRecorder(new MediaStream(tracks), { mimeType: mime, videoBitsPerSecond: 8_000_000 });
      const chunks = [];
      mr.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
      mr.onstop = () => {
        setRec(false);
        const blob = new Blob(chunks, { type: "video/webm" });
        if (blob.size > 2048) { onTake(blob, `Take ${takeN}${green ? " (greenscreen)" : ""}`); setTakeN((n) => n + 1); ping?.("🎬 Take saved to the media pool"); }
      };
      mr.start(250); recRef.current = mr; setRec(true);
      setStatus("● RECORDING — press again to stop.");
    } catch (e) { setStatus("Recorder failed — " + (e?.message || e)); }
  };

  return (
    <div className="fxstudio glass-dark">
      <div className="paneltitle">🎭 PERFORM — VTUBER PUPPETEERING <span className="dim small" style={{ marginLeft: 8, letterSpacing: 0 }}>drive a character with your webcam, record takes into the pool</span></div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div ref={stageRef} style={{ width: 300, minHeight: 170, borderRadius: 10, background: "#101016", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.25)", fontSize: 34, flex: "0 0 auto" }}>{!live && "🎭"}</div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div className="lbl">CHARACTER</div>
          <div className="btnrow" style={{ gap: 5, flexWrap: "wrap" }}>
            <button className="minibtn" onClick={() => sheetRef.current?.click()} title="Any character artwork — a chatterbox puppet is built from it (no rigging needed)">🖼 FROM IMAGE</button>
            <button className="minibtn" onClick={() => vrmRef.current?.click()} title="A rigged 3D avatar (.vrm)">🧊 .VRM</button>
            <button className={`minibtn ${green ? "blue" : ""}`} onClick={() => setGreen((g) => !g)} title="Record on chroma green for keying">GREENSCREEN {green ? "ON" : "OFF"}</button>
          </div>
          <input ref={sheetRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { loadSheet(e.target.files?.[0]); e.target.value = ""; }} />
          <input ref={vrmRef} type="file" accept=".vrm" style={{ display: "none" }} onChange={(e) => { loadVrm(e.target.files?.[0]); e.target.value = ""; }} />
          <div className="btnrow" style={{ gap: 5, marginTop: 10 }}>
            {!live ? <button className="cta sm" onClick={start}>▶ START CAMERA</button>
              : <>
                <button className={`cta sm ${rec ? "" : ""}`} style={rec ? { background: "#e5484d" } : undefined} onClick={record}>{rec ? "■ STOP TAKE" : "● RECORD TAKE"}</button>
                <button className="minibtn" onClick={stopAll}>END SESSION</button>
              </>}
          </div>
          <div className="dim small" style={{ marginTop: 8 }}>{status}</div>
          <div className="dim small" style={{ marginTop: 4 }}>Takes land in the media pool (“performances” bin) as normal video clips — cut, trim, grade and mix them like any footage. Your mic records with the take.</div>
        </div>
      </div>
    </div>
  );
}
