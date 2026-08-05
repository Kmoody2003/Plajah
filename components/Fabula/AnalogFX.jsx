// AnalogFX — the reverb + delay aux units on the audio page, styled as VINTAGE ANALOG HARDWARE:
// bakelite/brushed-metal rack panels, chrome rotary knobs you drag to turn, and cream VU needle meters
// that swing with the live master level. Purely presentational over the existing setReverb/setDelay
// engine calls — same params, hardware skin. Fleeting Plajah-logo warmth in the panel + glow.
import { memo, useEffect, useRef } from "react";
import { meterRegistry } from "../../services/fabula/audioGraph";

// Drag-to-turn rotary knob. Vertical drag changes value (DAW convention); double-click resets.
function Knob({ value, min, max, step = 0.01, onChange, reset, label, readout, color = "#f0b429", size = 52 }) {
  const start = useRef(null);
  const norm = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const ang = -135 + norm * 270;
  const onMove = (e) => {
    if (!start.current) return;
    const dy = start.current.y - e.clientY;
    let v = start.current.v + (dy / 150) * (max - min);
    v = Math.max(min, Math.min(max, v));
    if (step) v = Math.round(v / step) * step;
    onChange(v);
  };
  const onUp = () => { start.current = null; window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  const onDown = (e) => { start.current = { y: e.clientY, v: value }; window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp); e.preventDefault(); };
  const ticks = [];
  for (let i = 0; i <= 10; i++) { const a = -135 + (i / 10) * 270; ticks.push(a); }
  return (
    <div className="afx-knobwrap">
      <div className="afx-knob" style={{ width: size, height: size }} onPointerDown={onDown} onDoubleClick={reset} title="Drag to turn · double-click to reset">
        {ticks.map((a, i) => <span key={i} className="afx-tick" style={{ transform: `rotate(${a}deg) translateY(-${size / 2 + 3}px)` }} />)}
        <div className="afx-knobface" style={{ "--kc": color }}>
          <div className="afx-pointer" style={{ transform: `rotate(${ang}deg)` }} />
        </div>
      </div>
      <span className="afx-klabel">{label}</span>
      <span className="afx-kval mono">{readout}</span>
    </div>
  );
}

// Cream VU meter with a swinging needle, driven by a meterRegistry source (defaults to master).
const VU = memo(function VU({ id = "master", label }) {
  const needle = useRef(null);
  useEffect(() => {
    let raf, hold = 0;
    const tick = () => {
      const s = meterRegistry.get(id); const lv = s ? Math.min(1, s() * 1.15) : 0;
      hold = lv > hold ? lv : Math.max(0, hold - 0.018);
      const a = -42 + hold * 84;
      if (needle.current) needle.current.style.transform = `rotate(${a}deg)`;
      raf = requestAnimationFrame(tick);
    };
    tick(); return () => cancelAnimationFrame(raf);
  }, [id]);
  return (
    <div className="afx-vu">
      <div className="afx-vuface">
        <div className="afx-vuarc" />
        <div className="afx-vured" />
        <div className="afx-needle" ref={needle} />
        <div className="afx-pivot" />
        <span className="afx-vumark">VU</span>
      </div>
      {label && <span className="afx-vulabel">{label}</span>}
    </div>
  );
});

const SPACES = ["room", "chamber", "hall", "plate", "cathedral"];

export default function AnalogFX({ rvb, setRvb, dly, setDly }) {
  const spaceIdx = Math.max(0, SPACES.indexOf(rvb.preset));
  return (
    <div className="afx-rack">
      <style>{AFX_CSS}</style>
      {/* REVERB */}
      <div className="afx-unit">
        <div className="afx-plate"><span className="afx-brand">◗ SPRING · PLATE REVERB</span><span className="afx-model">FB-2400</span></div>
        <div className="afx-body">
          <VU id="master" label="OUTPUT" />
          <div className="afx-knobs">
            <Knob label="SPACE" min={0} max={SPACES.length - 1} step={1} value={spaceIdx} color="#e0459b"
              onChange={(v) => setRvb({ preset: SPACES[Math.round(v)] })} reset={() => setRvb({ preset: "hall" })}
              readout={rvb.preset.slice(0, 4).toUpperCase()} />
            <Knob label="MIX" min={0} max={1.5} step={0.02} value={rvb.wet} color="#f0b429"
              onChange={(v) => setRvb({ wet: v })} reset={() => setRvb({ wet: 0.9 })}
              readout={Math.round(rvb.wet * 100)} />
          </div>
        </div>
      </div>
      {/* DELAY */}
      <div className="afx-unit">
        <div className="afx-plate"><span className="afx-brand">◗ TAPE ECHO · DELAY</span><span className="afx-model">RE-330</span></div>
        <div className="afx-body">
          <VU id="master" label="ECHO" />
          <div className="afx-knobs">
            <Knob label="TIME" min={0.02} max={1.2} step={0.01} value={dly.time} color="#7c3aed"
              onChange={(v) => setDly({ time: v })} reset={() => setDly({ time: 0.33 })}
              readout={Math.round(dly.time * 1000) + "ms"} />
            <Knob label="RGEN" min={0} max={0.9} step={0.02} value={dly.feedback} color="#e0459b"
              onChange={(v) => setDly({ feedback: v })} reset={() => setDly({ feedback: 0.35 })}
              readout={Math.round(dly.feedback * 100)} />
            <Knob label="MIX" min={0} max={1.5} step={0.02} value={dly.wet} color="#f0b429"
              onChange={(v) => setDly({ wet: v })} reset={() => setDly({ wet: 0.8 })}
              readout={Math.round(dly.wet * 100)} />
          </div>
        </div>
      </div>
    </div>
  );
}

const AFX_CSS = `
.afx-rack{display:flex;gap:12px;margin-top:12px;flex-wrap:wrap}
.afx-unit{flex:1;min-width:260px;border-radius:12px;overflow:hidden;border:1px solid rgba(0,0,0,.6);
  background:linear-gradient(180deg,#2a2622,#1a1714);
  box-shadow:0 3px 12px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.06),inset 0 0 40px rgba(124,58,237,.05)}
.afx-plate{display:flex;align-items:center;justify-content:space-between;padding:7px 12px;
  background:linear-gradient(180deg,#3a3530,#241f1b);border-bottom:1px solid rgba(0,0,0,.5);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.08)}
.afx-brand{font-size:9.5px;font-weight:900;letter-spacing:.16em;color:#d9c9a8;text-shadow:0 1px 0 rgba(0,0,0,.6)}
.afx-model{font-size:8px;font-weight:800;letter-spacing:.1em;color:#8a7d68;font-family:'JetBrains Mono',monospace}
.afx-body{display:flex;align-items:center;gap:16px;padding:14px 16px;
  background:repeating-linear-gradient(90deg,rgba(255,255,255,.012) 0 1px,transparent 1px 3px)}
/* ── chrome rotary knob ── */
.afx-knobs{display:flex;gap:18px;flex:1;justify-content:flex-end;flex-wrap:wrap}
.afx-knobwrap{display:flex;flex-direction:column;align-items:center;gap:3px}
.afx-knob{position:relative;border-radius:50%;cursor:ns-resize;touch-action:none;display:flex;align-items:center;justify-content:center}
.afx-tick{position:absolute;left:50%;top:50%;width:1.5px;height:4px;margin-left:-.75px;background:rgba(217,201,168,.4);transform-origin:50% 0;border-radius:1px}
.afx-knobface{position:relative;width:80%;height:80%;border-radius:50%;
  background:radial-gradient(circle at 38% 30%,#6a6a72,#33333a 62%,#191920);
  border:1px solid rgba(0,0,0,.7);box-shadow:0 2px 5px rgba(0,0,0,.6),inset 0 2px 3px rgba(255,255,255,.22),inset 0 -3px 5px rgba(0,0,0,.5)}
.afx-knobface::after{content:"";position:absolute;inset:22%;border-radius:50%;background:radial-gradient(circle at 40% 34%,#42424c,#1c1c22);box-shadow:0 0 6px var(--kc,#f0b429)}
.afx-pointer{position:absolute;left:50%;top:8%;width:2.5px;height:36%;margin-left:-1.25px;border-radius:2px;
  background:var(--kc,#f0b429);box-shadow:0 0 5px var(--kc,#f0b429);transform-origin:50% 100%}
.afx-klabel{font-size:8px;font-weight:900;letter-spacing:.12em;color:#b9ad95}
.afx-kval{font-size:9px;color:#f0d9a8;background:rgba(0,0,0,.5);border:1px solid rgba(0,0,0,.5);border-radius:3px;padding:0 5px;min-width:34px;text-align:center}
/* ── cream VU needle meter ── */
.afx-vu{display:flex;flex-direction:column;align-items:center;gap:3px;flex:0 0 auto}
.afx-vuface{position:relative;width:96px;height:56px;border-radius:6px;overflow:hidden;
  background:linear-gradient(180deg,#efe4c4,#d9c79b);border:2px solid #14100c;box-shadow:inset 0 2px 6px rgba(120,90,40,.4),0 1px 0 rgba(255,255,255,.1)}
.afx-vuarc{position:absolute;left:8%;right:8%;top:52%;height:0;border-top:1.5px solid rgba(40,30,10,.55);border-radius:50%;
  transform:translateY(-2px);box-shadow:0 -18px 0 -16px rgba(40,30,10,.35)}
.afx-vuarc{width:84%;height:64px;top:20px;left:8%;border:1.5px solid rgba(40,30,10,.5);border-bottom:none;border-radius:50%/100% 100% 0 0;background:transparent}
.afx-vured{position:absolute;right:14%;top:14px;width:26%;height:20px;border-radius:0 40px 0 0;
  background:linear-gradient(90deg,transparent,rgba(200,40,20,.28));border-top:2px solid rgba(190,30,15,.7);transform:rotate(0deg)}
.afx-needle{position:absolute;left:50%;bottom:6px;width:1.5px;height:42px;margin-left:-.75px;background:#1a1207;transform-origin:50% 100%;box-shadow:0 0 2px rgba(0,0,0,.5)}
.afx-pivot{position:absolute;left:50%;bottom:3px;width:8px;height:8px;margin-left:-4px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#555,#111);border:1px solid #000}
.afx-vumark{position:absolute;left:50%;bottom:11px;transform:translateX(-50%);font-size:7px;font-weight:900;letter-spacing:.2em;color:rgba(40,30,10,.55)}
.afx-vulabel{font-size:7.5px;font-weight:900;letter-spacing:.14em;color:#b9ad95}
`;
