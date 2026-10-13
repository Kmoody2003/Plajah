// components/Fabula/ColorWheels.jsx
// ═══════════════════════════════════════════════════════════════════════════
// DaVinci Resolve-style primary trackballs for the Fabula color page.
// Adopted from the shared Plajah colorist suite.
// Provides 4 wheels (Lift, Gamma, Gain, Offset) with master luminance rings,
// exact 3-phasor projection math, and 1-click film look presets.
// ═══════════════════════════════════════════════════════════════════════════

import { memo } from "react";
import { ColorWheelsTrackballs, DEFAULT_WHEEL_DATA } from "../shared/color/ColorWheelsTrackballs";

function ColorWheels({ wheel, setWheel }) {
  const currentWheel = {
    ...DEFAULT_WHEEL_DATA,
    ...(wheel || {}),
  };

  return (
    <div style={{ padding: "4px 2px", width: "100%" }}>
      <ColorWheelsTrackballs
        wheel={currentWheel}
        setWheel={setWheel}
        showOffset={true}
        showTempTint={false}
        wheelSize={82}
      />
    </div>
  );
}

export default memo(ColorWheels);
