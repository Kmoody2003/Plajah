// W4 Deliverables — loudness QC targets + evaluator.
// ---------------------------------------------------------------------------
// The MEASUREMENT engine already exists: a spec-compliant ITU-R BS.1770 / EBU R128
// integrated-LUFS + true-peak meter in the Master Suite AudioWorklet
// (services/melos/beats/engine/loudnessProcessor.worklet.js). This module adds the
// FILM delivery TARGETS and a pass/fail evaluator on top — the part that was missing.
// v1 takes measured values (from that meter, or manual entry); auto-normalise-to-target
// is a later step.

export interface LoudnessPreset {
  id: string;
  label: string;
  targetLUFS: number;   // integrated target
  tolLUFS: number;      // ± tolerance
  maxTP: number;        // true-peak ceiling, dBTP
}

export const LOUDNESS_PRESETS: LoudnessPreset[] = [
  { id: 'atsc_a85',    label: 'ATSC A/85 — US broadcast',     targetLUFS: -24, tolLUFS: 2, maxTP: -2 },
  { id: 'ebu_r128',    label: 'EBU R128 — EU / festival',     targetLUFS: -23, tolLUFS: 1, maxTP: -1 },
  { id: 'streaming',   label: 'Streaming / VOD',              targetLUFS: -16, tolLUFS: 2, maxTP: -1 },
  { id: 'theatrical',  label: 'Theatrical (reference, no LUFS gate)', targetLUFS: -27, tolLUFS: 4, maxTP: -3 },
];

export interface LoudnessVerdict {
  preset: LoudnessPreset;
  lufsDelta: number;   // measured − target
  lufsPass: boolean;
  tpPass: boolean;
  pass: boolean;
  advice: string;
}

/** Evaluate a measured integrated LUFS + true peak against a delivery preset. */
export function evaluateLoudness(integratedLUFS: number, truePeakDBTP: number, presetId: string): LoudnessVerdict {
  const preset = LOUDNESS_PRESETS.find(p => p.id === presetId) || LOUDNESS_PRESETS[1];
  const lufsDelta = Math.round((integratedLUFS - preset.targetLUFS) * 10) / 10;
  const lufsPass = Math.abs(lufsDelta) <= preset.tolLUFS;
  const tpPass = truePeakDBTP <= preset.maxTP;
  const advice = !lufsPass
    ? `Integrated is ${lufsDelta > 0 ? `${lufsDelta} LU hot` : `${Math.abs(lufsDelta)} LU quiet`} — trim/raise the mix ${Math.abs(lufsDelta)} LU toward ${preset.targetLUFS} LUFS.`
    : !tpPass
    ? `True peak ${truePeakDBTP} dBTP exceeds the ${preset.maxTP} dBTP ceiling — add a true-peak limiter.`
    : `Meets ${preset.label}.`;
  return { preset, lufsDelta, lufsPass, tpPass, pass: lufsPass && tpPass, advice };
}
