import type { Passage, PassageBand } from '../../../services/yearCurriculum/types';
import { PASSAGES_K2 } from './bandK2';
import { PASSAGES_35 } from './band35';
import { PASSAGES_68 } from './band68';

export const PASSAGES: Record<PassageBand, Passage[]> = { k2: PASSAGES_K2, '35': PASSAGES_35, '68': PASSAGES_68 };
export const ALL_PASSAGES: Passage[] = [...PASSAGES_K2, ...PASSAGES_35, ...PASSAGES_68];
export const passageById = (id: string) => ALL_PASSAGES.find(p => p.id === id);
