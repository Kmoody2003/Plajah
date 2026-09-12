// lowerThirdRegistry — every Fabula lower third, in one list.
import type { LowerThirdSpec } from './lowerThirds';
import { LOWER_THIRDS_BROADCAST } from './lowerThirdLibrary';
import { LOWER_THIRDS_BY_ERA } from './lowerThirdsByEra';
import { SHADER_MOTION_TEMPLATES } from './shaderMotionTemplates';

export const LOWER_THIRDS: LowerThirdSpec[] = [...SHADER_MOTION_TEMPLATES, ...LOWER_THIRDS_BROADCAST, ...LOWER_THIRDS_BY_ERA];
export const LOWER_THIRD_GROUPS: string[] = [...new Set(LOWER_THIRDS.map(s => s.group))];
export function findLowerThird(id: string): LowerThirdSpec | undefined { return LOWER_THIRDS.find(s => s.id === id); }
