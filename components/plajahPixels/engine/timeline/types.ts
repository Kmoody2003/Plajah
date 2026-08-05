// engine/timeline/types.ts — shared schema for markers + parsed instructions.
// This schema is the contract between the parser (rule-based OR on-device LLM)
// and the Timeline. Any parser returning a ParamDiff plugs straight in.

export interface ParamDiff {
  /** absolute param values to set (speed, glow, trail, sens, mirror, ...) */
  set: Record<string, number | boolean>;
  /** multiplicative nudges (reserved for future relative phrasing) */
  mul: Record<string, number>;
  /** scene id to switch to, or null */
  scene: string | null;
  /** palette index to switch to, or null */
  palette: number | null;
  /** the original human text */
  label: string;
}

export interface Marker {
  time: number;       // seconds into the track
  label: string;      // the natural-language instruction
  diff: ParamDiff;    // resolved instruction
}

/** A parser turns text → ParamDiff. Rule-based and LLM both implement this. */
export interface InstructionParser {
  parse(text: string): Promise<ParamDiff> | ParamDiff;
}
