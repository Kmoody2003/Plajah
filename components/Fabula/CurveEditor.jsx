// components/Fabula/CurveEditor.jsx
// ═══════════════════════════════════════════════════════════════════════════
// Tone-curve editor for Fabula color page.
// Adopted from the shared Plajah colorist suite.
// Draws + edits the Catmull-Rom spline curve model (services/color/colorWorkspace).
// ═══════════════════════════════════════════════════════════════════════════

import { memo } from "react";
import { CurveEditorSplines } from "../shared/color/CurveEditorSplines";

function CurveEditor({ curves, onChange, width = 264, height = 264 }) {
  return (
    <CurveEditorSplines
      curves={curves}
      onChange={onChange}
      width={width}
      height={height}
    />
  );
}

export default memo(CurveEditor);
