// GradePreview — the color page's GPU-accurate monitor. Renders the program video through the
// Pixels Compositor's per-input grade stage (the SAME shader the export uses), so lift/gamma/
// gain, temp/tint, contrast/sat/hue preview exactly as they will render.
// Uses off-main-thread worker acceleration via FabulaWorkerMonitor with graceful inline fallback.

import { memo } from "react";
import FabulaWorkerMonitor from "./engine/FabulaWorkerMonitor";

function GradePreview({ videoRef, grade, grades, outRef }) {
  return <FabulaWorkerMonitor videoRef={videoRef} grade={grade} grades={grades} outRef={outRef} />;
}

export default memo(GradePreview);
