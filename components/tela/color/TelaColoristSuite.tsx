// components/tela/color/TelaColoristSuite.tsx
// ═══════════════════════════════════════════════════════════════════════════
// Tela Colorist Grading Suite — Unified with Fabula via PlajahColoristSuite
// ═══════════════════════════════════════════════════════════════════════════

import React from 'react';
import {
  PlajahColoristSuite,
  type PlajahColoristSuiteProps,
  type CmykPlateType,
} from '../../shared/color/PlajahColoristSuite';
import {
  type ColorWheelData,
  DEFAULT_WHEEL_DATA,
} from '../../shared/color/ColorWheelsTrackballs';
import {
  type ColorSpaceId,
  type Curves,
  type CurvePoint,
} from '../../../services/color/colorWorkspace';

export type ColorWheelState = ColorWheelData;
export const DEFAULT_WHEELS: ColorWheelState = DEFAULT_WHEEL_DATA;

export type CurveChannel = 'master' | 'r' | 'g' | 'b';
export type CurvePoints = CurvePoint[];
export type ColorCurvesState = Curves;

export const DEFAULT_CURVES: ColorCurvesState = {
  master: [[0, 0], [1, 1]],
  r: [[0, 0], [1, 1]],
  g: [[0, 0], [1, 1]],
  b: [[0, 0], [1, 1]],
};

export interface TelaColoristSuiteProps {
  sourceImageUrl?: string;
  sourceRef?: React.RefObject<HTMLVideoElement | HTMLCanvasElement | null>;
  canvasWidth: number;
  canvasHeight: number;
  colorSpace: ColorSpaceId;
  onColorSpaceChange: (cs: ColorSpaceId) => void;
  softProofing: boolean;
  onSoftProofingChange: (enabled: boolean) => void;
  cmykPlate: CmykPlateType;
  onCmykPlateChange: (plate: CmykPlateType) => void;
  wheels: ColorWheelState;
  onWheelsChange: (wheels: ColorWheelState) => void;
  curves: ColorCurvesState;
  onCurvesChange: (curves: ColorCurvesState) => void;
  onEyedropperToggle: () => void;
  eyedropperActive: boolean;
  onApplyLook?: (lookId: string) => void;
}

export const TelaColoristSuite: React.FC<TelaColoristSuiteProps> = ({
  sourceImageUrl,
  sourceRef,
  canvasWidth,
  canvasHeight,
  colorSpace,
  onColorSpaceChange,
  softProofing,
  onSoftProofingChange,
  cmykPlate,
  onCmykPlateChange,
  wheels,
  onWheelsChange,
  curves,
  onCurvesChange,
  onEyedropperToggle,
  eyedropperActive,
  onApplyLook,
}) => {
  return (
    <PlajahColoristSuite
      sourceImageUrl={sourceImageUrl}
      sourceRef={sourceRef}
      canvasWidth={canvasWidth}
      canvasHeight={canvasHeight}
      colorSpace={colorSpace}
      onColorSpaceChange={onColorSpaceChange}
      softProofing={softProofing}
      onSoftProofingChange={onSoftProofingChange}
      cmykPlate={cmykPlate}
      onCmykPlateChange={onCmykPlateChange}
      wheels={wheels}
      onWheelsChange={onWheelsChange}
      curves={curves}
      onCurvesChange={(c) => onCurvesChange(c || DEFAULT_CURVES)}
      eyedropperActive={eyedropperActive}
      onEyedropperToggle={onEyedropperToggle}
      onApplyLut={onApplyLook ? (lut) => onApplyLook(lut.id) : undefined}
      scopeMode="tabbed"
    />
  );
};

export default TelaColoristSuite;
