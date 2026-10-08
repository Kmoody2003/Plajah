/** One validated command path for UI, Stream Deck hotkeys, and MIDI surfaces. */
export type ProductionCommand =
  | { action: 'preview' | 'take'; input: number }
  | { action: 'cut' | 'auto' }
  | { action: 'gain'; input: number; value: number };
export interface ProductionControlTarget {
  inputs(): string[];
  preview(id: string): void;
  cut(): void;
  auto(): void;
  gain(id: string, value: number): void;
}
export function executeProductionCommand(target: ProductionControlTarget, command: ProductionCommand): boolean {
  if (command.action === 'cut' || command.action === 'auto') { target[command.action](); return true; }
  if (!('input' in command)) return false;
  if (!Number.isInteger(command.input) || command.input < 1) return false;
  const id = target.inputs()[command.input - 1];
  if (!id) return false;
  if (command.action === 'gain') {
    if (!Number.isFinite(command.value) || command.value < 0 || command.value > 1) return false;
    target.gain(id, command.value);
  } else {
    target.preview(id);
    if (command.action === 'take') target.cut();
  }
  return true;
}
export function productionHotkey(event: Pick<KeyboardEvent, 'ctrlKey' | 'altKey' | 'shiftKey' | 'code' | 'repeat'>): ProductionCommand | null {
  if (!event.ctrlKey || !event.altKey || event.repeat) return null;
  const digit = /^Digit([1-9])$/.exec(event.code);
  if (digit) return { action: event.shiftKey ? 'take' : 'preview', input: Number(digit[1]) };
  if (event.code === 'Enter') return { action: event.shiftKey ? 'auto' : 'cut' };
  return null;
}
/** MIDI notes 36–44 select inputs; 45 CUT; 46 AUTO. CC 0–8 control input faders. */
export function productionMidi(data: ArrayLike<number>): ProductionCommand | null {
  if (data.length < 3) return null;
  const status = data[0] & 0xf0, number = data[1], value = data[2];
  if (status === 0x90 && value > 0) {
    if (number >= 36 && number <= 44) return { action: 'preview', input: number - 35 };
    if (number === 45) return { action: 'cut' };
    if (number === 46) return { action: 'auto' };
  }
  if (status === 0xb0 && number <= 8 && value <= 127) return { action: 'gain', input: number + 1, value: value / 127 };
  return null;
}
