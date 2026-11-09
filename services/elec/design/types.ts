// Shared shapes for the open-ended designer. Released by Plajah as public domain (CC0).
import type { Framework, McuDef, McuKind } from './mcus';

export type BlockId = 'led' | 'lamp' | 'neopixel' | 'strip12' | 'button' | 'encoder' | 'pot' | 'oled' | 'tft' | 'temp' | 'imu' | 'light' | 'distance' | 'soil' | 'motion' | 'speaker' | 'servo' | 'motor' | 'relay';
export type PowerChoice = 'auto' | 'usb' | 'liion' | 'aa' | 'adapter5' | 'adapter12' | 'mains';
export type Conn = 'wifi' | 'bluetooth' | 'homeassistant' | 'usb-midi' | 'usb-hid';
export type Opt = Record<string, string | number | boolean>;
export interface Need { block: BlockId; count: number; opt?: Opt }
export interface Spec {
  name: string; needs: Need[]; mcu: 'auto' | 'none' | McuKind; power: PowerChoice; conn: Conn[]; market: 'US' | 'EU' | 'both';
  /** Raspberry Pi model when mcu is rpi. */
  piModel?: string;
}

export type Cap = 'adc' | 'pwm' | 'gpio' | 'in';
export interface PinNeed { role: string; cap: Cap; /** Driven high in the simulation (worst-case on). */ high?: boolean; label: string }
export type Rail = 'v5' | 'logic' | 'v12' | 'sys';
export interface Load { rail: Rail; typ: number; peak: number; what: string }
export type Params = Record<string, number | string>;

export interface Inst {
  block: BlockId; id: string; k: number; count: number; opt: Opt; label: string;
  /** Role -> board pin ("IO4") or ADS1115 channel ("ADS:0:A1"). Bus roles: sda, scl, sck, mosi. */
  pins: Record<string, string>; addr?: string;
  mcu: McuDef | null; logicV: number; sysV: number; usbMidi: boolean; usbHid: boolean; ha: boolean;
}
export interface DrawApi { part(kind: string, dx: number, dy: number, rot?: number, params?: Params): string; net(name: string, ...pins: Array<[string, string]>): void }
export interface FwApi {
  fw: Framework;
  /** ESPHome: add a YAML list item (text starting "- ") or singleton mapping to a top-level section. */
  esp(section: string, item: string): void;
  imp(...lines: string[]): void; lib(...names: string[]): void; glob(code: string): void; setup(code: string): void; loop(code: string): void;
  /** A value for the display / serial print: label, expression (ESPHome: sensor id), unit. */
  read(label: string, expr: string, unit: string): void;
  /** Board pin in this framework's syntax (GPIO4, board.GP2, 2 / A0, 17). */
  pin(p: string): string;
  /** Blinka / CircuitPython board object for a pin (board.GP2, board.D17). */
  bpin(p: string): string;
  ads(ch: string): { idx: number; ch: number } | null;
}
