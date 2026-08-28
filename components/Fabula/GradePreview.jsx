// GradePreview — the color page's GPU-accurate monitor. Renders the program video through the
// Pixels Compositor's per-input grade stage (the SAME shader the export uses), so lift/gamma/
// gain, temp/tint, contrast/sat/hue preview exactly as they will render. The scopes read THIS
// canvas → post-grade scopes, like a real grading suite.

import { memo, useEffect, useRef } from "react";
import { Compositor } from "../plajahPixels/engine/core/compositor";

function GradePreview({ videoRef, grade, grades, outRef }) {
  const canvasRef = useRef(null);
  const gradeRef = useRef(grade);
  gradeRef.current = grade;
  const gradesRef = useRef(grades);
  gradesRef.current = grades;
  useEffect(() => {
    let raf; let comp = null;
    try {
      comp = new Compositor(canvasRef.current);
      comp.resize(640, 360);
    } catch (e) { console.warn("[GradePreview] WebGL2 unavailable:", e?.message || e); return undefined; }
    if (outRef) outRef.current = canvasRef.current;
    let last = 0;
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 40) return; // ~24fps preview
      last = now;
      const v = videoRef?.current;
      if (!v || (v.readyState != null && v.readyState < 2)) return;
      try {
        const st = gradesRef.current;
        comp.render([{ element: v, opacity: 1, blendMode: "normal",
          ...(st && st.length ? { grades: st } : { grade: gradeRef.current || undefined }) }]);
      } catch { /* frame not ready */ }
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); try { comp?.dispose(); } catch { /* */ } if (outRef) outRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <canvas ref={canvasRef} style={{ width: "100%", borderRadius: 10, background: "#000", display: "block", border: "1px solid rgba(255,255,255,0.08)" }} />;
}

export default memo(GradePreview);
