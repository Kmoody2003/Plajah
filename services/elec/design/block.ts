// The block contract: one function of a product (a knob, a display, a relay) as parts, nets, pin
// needs, power loads and firmware snippets per framework. Released by Plajah as public domain (CC0).
import type { BlockId, DrawApi, FwApi, Inst, Load, Opt, PinNeed } from './types';
import type { McuKind } from './mcus';

export interface BlockDef {
  id: BlockId; label: string; plural: string; about: string; max: number;
  /** Words the prompt reader listens for. */
  words: RegExp;
  /** Options with defaults (shown in the editor). */
  opts?: Array<{ key: string; label: string; choices?: string[]; default: string | number }>;
  /** False when the block works with no controller (a switched lamp). */
  needsMcu: (o: Opt) => boolean;
  /** Boards that cannot run it, with the reason. */
  notOn?: Partial<Record<McuKind, string>>;
  /** Same, depending on options (I²S audio). */
  notOnFor?: (o: Opt) => Partial<Record<McuKind, string>>;
  bus?: 'i2c' | 'spi' | ((o: Opt) => 'i2c' | 'spi' | undefined); addrs?: string[];
  /** How many drawn instances `count` becomes (a lamp of 6 LEDs is one instance). */
  instances?: (count: number, o: Opt) => number[];
  pins: (i: Inst) => PinNeed[];
  loads: (i: Inst) => Load[];
  draw: (i: Inst, d: DrawApi) => void;
  fw: (i: Inst, f: FwApi) => void;
  extras?: (i: Inst) => string[][];
  notes?: (i: Inst) => string[];
}

const E12 = [10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82];
export function e12Up(r: number): number { const dec = Math.pow(10, Math.floor(Math.log10(Math.max(1, r)))); for (const m of [...E12, 100]) if (m / 10 * dec >= r - 1e-9) return m / 10 * dec; return r; }
export const fmtR = (r: number) => (r >= 1e6 ? `${+(r / 1e6).toPrecision(3)}M` : r >= 1e3 ? `${+(r / 1e3).toPrecision(3)}k` : `${+r.toPrecision(3)}`);
export const cap1 = (s: string) => s[0].toUpperCase() + s.slice(1);
/** ESPHome/C identifiers. */
export const sid = (i: Inst, what = '') => `${i.id}${what ? `_${what}` : ''}`;
export const n = (i: Inst) => i.k + 1;
export const busOf = (b: BlockDef, o: Opt) => (typeof b.bus === 'function' ? b.bus(o) : b.bus);
