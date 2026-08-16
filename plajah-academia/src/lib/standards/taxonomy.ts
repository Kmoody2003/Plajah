import type { StandardRef } from "../../types/schema";

/**
 * Standards taxonomy — CCSS + NGSS spine, PISA proficiency overlay.
 * PISA is an assessment framework (15-year-olds), not a curriculum,
 * so it decorates grades 6-10 tasks with competency levels rather
 * than serving as the primary skeleton.
 */

export const PISA_DOMAINS = ["MATH", "READ", "SCI"] as const;

export interface PisaLevel {
  domain: (typeof PISA_DOMAINS)[number];
  level: 1 | 2 | 3 | 4 | 5 | 6;
  descriptor: string;
}

export function pisaRef(domain: PisaLevel["domain"], level: PisaLevel["level"]): StandardRef {
  return { framework: "PISA", code: `PISA.${domain}.L${level}` };
}

/** Parse any supported code into a display object. */
export function parseStandard(ref: StandardRef): { framework: string; display: string } {
  switch (ref.framework) {
    case "CCSS": return { framework: "Common Core", display: ref.code.replace("CCSS.", "") };
    case "NGSS": return { framework: "NGSS", display: ref.code };
    case "PISA": {
      const m = ref.code.match(/PISA\.(\w+)\.L(\d)/);
      const dom = m?.[1] === "MATH" ? "Math" : m?.[1] === "READ" ? "Reading" : "Science";
      return { framework: "PISA", display: `${dom} literacy - Level ${m?.[2]}` };
    }
  }
}

/** Suggested PISA overlay per CCSS math domain + grade band (starter map;
 *  extend from OECD released items during content calibration). */
export const CCSS_TO_PISA_STARTER: Record<string, StandardRef> = {
  "CCSS.MATH.6.RP":  pisaRef("MATH", 2),
  "CCSS.MATH.7.RP":  pisaRef("MATH", 3),
  "CCSS.MATH.8.EE":  pisaRef("MATH", 3),
  "CCSS.MATH.8.F":   pisaRef("MATH", 4),
  "CCSS.MATH.HSA":   pisaRef("MATH", 4),
  "CCSS.MATH.HSF":   pisaRef("MATH", 5),
  "CCSS.ELA.RI.6":   pisaRef("READ", 2),
  "CCSS.ELA.RI.8":   pisaRef("READ", 3),
  "CCSS.ELA.RI.9-10": pisaRef("READ", 4),
};
