// components/Fabula/ColorScopes.jsx
// ═══════════════════════════════════════════════════════════════════════════
// Resolve-style video scopes for the Fabula color page.
// Adopted from the shared Plajah colorist suite.
// Samples the program monitor's active video element ~10×/sec and renders:
//   WAVEFORM (luma with IRE lines), RGB PARADE, VECTORSCOPE (with 33° skin line & targets), HISTOGRAM.
// ═══════════════════════════════════════════════════════════════════════════

import { memo } from "react";
import { LiveScopesEngine } from "../shared/color/LiveScopesEngine";

function ColorScopes({ sourceRef }) {
  return (
    <LiveScopesEngine
      sourceRef={sourceRef}
      mode="grid"
      height={130}
    />
  );
}

export default memo(ColorScopes);
