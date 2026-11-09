// The block library: every function the open-ended designer can place. Released by Plajah as public domain (CC0).
import type { BlockDef } from './block';
import type { BlockId } from './types';
import { LIGHTS } from './blkLights';
import { INPUTS } from './blkInputs';
import { SENSORS } from './blkSensors';
import { ACTUATORS } from './blkActuators';
import { keymatrix } from './blkKeys';
import { stepper } from './blkStepper';

export const BLOCKS: BlockDef[] = [...LIGHTS, ...INPUTS, keymatrix, ...SENSORS, ...ACTUATORS, stepper];
export const blockById = (id: string): BlockDef | undefined => BLOCKS.find(b => b.id === id);
export const BLOCK_IDS = BLOCKS.map(b => b.id) as BlockId[];
