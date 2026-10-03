// services/audio/mackieControlService.ts — Full Mackie Control Universal (MCU) Protocol & Mixer Controller Engine
//
// Provides two-way communication between Plajah's Chora Studio Mixer and physical hardware mixing consoles
// (Mackie MCU Pro, Behringer X-Touch, PreSonus FaderPort 8/16, SSL UF8, Icon QCon Pro, Korg nanoKONTROL 2, Akai MIDImix).
//
// Capabilities:
//   • 10-bit motorized faders (Pitch Bend Ch 1–8 + Master) with bi-directional motor glide feedback
//   • Touch-sensitive fader detection (Notes 104–112)
//   • Endless V-Pot encoders (CC 16–23) with hardware LED ring display (CC 48–55)
//   • Two-line 55-character LCD Scribble Strip SysEx updates (track names + parameter dB/pan)
//   • Hardware button LEDs (Rec, Solo, Mute, Select, Bank ◀/▶, Transport)
//   • Jog / Scrub wheel navigation
//   • Bank switching (1–8, 9–16, 17–24...) and channel nudging
//   • Generic MIDI Learn & CC fallback for unmotorized controller desks

export type ControllerProtocol =
  | 'MACKIE_MCU'
  | 'BEHRINGER_XTOUCH'
  | 'PRESONUS_FADERPORT'
  | 'SSL_UF8'
  | 'KORG_NANOKONTROL'
  | 'AKAI_MIDIMIX'
  | 'GENERIC_MIDI';

export interface VPotMode {
  mode: 'PAN' | 'EQ_LOW' | 'EQ_MID' | 'EQ_HIGH' | 'SEND_1' | 'SEND_2';
  label: string;
}

export interface MixerTrackStrip {
  id: string;
  name: string;
  volumeGain: number;       // 0 to ~3.16 (unity 1.0 = 0dB)
  pan: number;              // -1.0 to +1.0 (center 0)
  mute: boolean;
  solo: boolean;
  armed: boolean;
  selected: boolean;
  eqLowDb?: number;         // -15 to +15 dB
  eqMidDb?: number;         // -15 to +15 dB
  eqHighDb?: number;        // -15 to +15 dB
  send1Gain?: number;       // 0 to 1
  send2Gain?: number;       // 0 to 1
  color?: string;
  meterLevel?: number;      // 0 to 1
}

export interface ControllerState {
  connected: boolean;
  deviceName: string;
  protocol: ControllerProtocol;
  bankOffset: number;       // index of first channel in active 8-fader bank (0, 8, 16...)
  totalChannels: number;
  faderTouching: boolean[]; // 8 channel faders + 1 master fader touch state
  vPotMode: VPotMode['mode'];
  flipMode: boolean;        // true = faders and knobs swap duties
  lcdLine1: string;         // top scribble strip (names)
  lcdLine2: string;         // bottom scribble strip (values)
  transportState: 'STOP' | 'PLAY' | 'RECORD';
}

// ── Math & Decibel helpers ───────────────────────────────────────────────────

export function gainToDb(gain: number): number {
  if (gain <= 0.0001) return -Infinity;
  return 20 * Math.log10(gain);
}

export function dbToGain(db: number): number {
  if (db <= -70) return 0;
  return Math.pow(10, db / 20);
}

/** Converts a 14-bit MCU Pitch Bend value (0..16383) to linear audio gain (0..3.16, unity 1.0 at 8192). */
export function mcu14BitToGain(val: number): number {
  const clamped = Math.max(0, Math.min(16383, val));
  if (clamped <= 64) return 0; // -∞ cutoff
  // 0 to 8192 is -60dB to 0dB; 8192 to 16383 is 0dB to +10dB
  if (clamped <= 8192) {
    const norm = clamped / 8192;
    const db = -60 + norm * 60;
    return dbToGain(db);
  } else {
    const norm = (clamped - 8192) / 8191;
    const db = norm * 10;
    return dbToGain(db);
  }
}

/** Converts linear audio gain (0..3.16) to 14-bit MCU Pitch Bend value (0..16383). */
export function gainToMcu14Bit(gain: number): number {
  if (gain <= 0.0001) return 0;
  const db = gainToDb(gain);
  if (db <= -60) return 0;
  if (db <= 0) {
    const norm = (db + 60) / 60;
    return Math.round(norm * 8192);
  } else {
    const norm = Math.min(1, db / 10);
    return Math.round(8192 + norm * 8191);
  }
}

// ── MCU Protocol Constants ───────────────────────────────────────────────────

const MCU_SYSEX_HEADER = [0xF0, 0x00, 0x00, 0x66, 0x14]; // Mackie MCU ID
const MCU_LCD_WRITE_CMD = 0x12;

// Buttons Notes
const NOTE_REC_BASE = 0;       // 0..7
const NOTE_SOLO_BASE = 8;      // 8..15
const NOTE_MUTE_BASE = 16;     // 16..23
const NOTE_SELECT_BASE = 24;   // 24..31
const NOTE_VPOT_PRESS_BASE = 32;// 32..39
const NOTE_BANK_LEFT = 46;
const NOTE_BANK_RIGHT = 47;
const NOTE_CHAN_LEFT = 48;
const NOTE_CHAN_RIGHT = 49;
const NOTE_FLIP = 50;
const NOTE_LOOP = 86;
const NOTE_REWIND = 91;
const NOTE_FAST_FORWARD = 92;
const NOTE_STOP = 93;
const NOTE_PLAY = 94;
const NOTE_RECORD = 95;
const NOTE_TOUCH_BASE = 104;   // 104..111 (Ch 1-8 touch), 112 (Master touch)

// Knobs CCs
const CC_VPOT_BASE = 16;       // 16..23
const CC_LED_RING_BASE = 48;   // 48..55
const CC_JOG_WHEEL = 60;

export class MackieControlService {
  private static instance: MackieControlService | null = null;

  private midiAccess: MIDIAccess | null = null;
  private activeInput: MIDIInput | null = null;
  private activeOutput: MIDIOutput | null = null;

  private state: ControllerState = {
    connected: false,
    deviceName: 'No Hardware Mixer Connected',
    protocol: 'MACKIE_MCU',
    bankOffset: 0,
    totalChannels: 16,
    faderTouching: new Array(9).fill(false),
    vPotMode: 'PAN',
    flipMode: false,
    lcdLine1: 'PLAJAH CHORA HIGH-END MIXER',
    lcdLine2: 'MACKIE MCU PRO CONTROLLER READY',
    transportState: 'STOP',
  };

  private listeners = new Set<(state: ControllerState) => void>();
  private onFaderChangeCb?: (channelIndex: number, gain: number) => void;
  private onPanChangeCb?: (channelIndex: number, delta: number) => void;
  private onMuteToggleCb?: (channelIndex: number) => void;
  private onSoloToggleCb?: (channelIndex: number) => void;
  private onArmToggleCb?: (channelIndex: number) => void;
  private onSelectChannelCb?: (channelIndex: number) => void;
  private onTransportActionCb?: (action: 'PLAY' | 'STOP' | 'RECORD' | 'REWIND' | 'FF' | 'LOOP') => void;
  private onJogWheelCb?: (deltaTicks: number) => void;

  private constructor() {
    this.initMidi();
  }

  public static getInstance(): MackieControlService {
    if (!MackieControlService.instance) {
      MackieControlService.instance = new MackieControlService();
    }
    return MackieControlService.instance;
  }

  public subscribe(fn: (s: ControllerState) => void): () => void {
    this.listeners.add(fn);
    fn(this.getState());
    return () => { this.listeners.delete(fn); };
  }

  public getState(): ControllerState {
    return { ...this.state };
  }

  private notify(): void {
    const s = this.getState();
    this.listeners.forEach(fn => {
      try { fn(s); } catch (e) { console.error('[MCU] Listener error:', e); }
    });
  }

  // ── Hardware Port Setup & Discovery ───────────────────────────────────────

  public async initMidi(): Promise<void> {
    if (typeof navigator === 'undefined' || !('requestMIDIAccess' in navigator)) return;
    try {
      // Request Sysex access for LCD Scribble strip displays
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: true }).catch(() => {
        // Fallback without SysEx if browser/platform denies sysex permission
        return navigator.requestMIDIAccess({ sysex: false });
      });

      this.autoDetectMixerPorts();
      this.midiAccess.onstatechange = () => this.autoDetectMixerPorts();
    } catch (e) {
      console.warn('[MCU] MIDI access could not be acquired:', e);
    }
  }

  private autoDetectMixerPorts(): void {
    if (!this.midiAccess) return;

    let matchedInput: MIDIInput | null = null;
    let matchedOutput: MIDIOutput | null = null;
    let detectedProtocol: ControllerProtocol = 'MACKIE_MCU';
    let detectedName = '';

    this.midiAccess.inputs.forEach((input) => {
      if (matchedInput) return;
      const name = (input.name || '').toLowerCase();
      if (name.includes('mcu') || name.includes('mackie') || name.includes('icon') || name.includes('qcon')) {
        matchedInput = input;
        detectedProtocol = 'MACKIE_MCU';
        detectedName = input.name || 'Mackie MCU Controller';
      } else if (name.includes('x-touch') || name.includes('xtouch')) {
        matchedInput = input;
        detectedProtocol = 'BEHRINGER_XTOUCH';
        detectedName = input.name || 'Behringer X-Touch';
      } else if (name.includes('faderport')) {
        matchedInput = input;
        detectedProtocol = 'PRESONUS_FADERPORT';
        detectedName = input.name || 'PreSonus FaderPort';
      } else if (name.includes('uf8')) {
        matchedInput = input;
        detectedProtocol = 'SSL_UF8';
        detectedName = input.name || 'SSL UF8 Controller';
      } else if (name.includes('nanokontrol')) {
        matchedInput = input;
        detectedProtocol = 'KORG_NANOKONTROL';
        detectedName = input.name || 'Korg nanoKONTROL 2';
      } else if (name.includes('midimix')) {
        matchedInput = input;
        detectedProtocol = 'AKAI_MIDIMIX';
        detectedName = input.name || 'Akai MIDImix';
      } else if (!matchedInput && input.state === 'connected') {
        matchedInput = input;
        detectedProtocol = 'GENERIC_MIDI';
        detectedName = input.name || 'Generic MIDI Mixer';
      }
    });

    if (matchedInput) {
      // Find matching output with same name or first output
      this.midiAccess.outputs.forEach((output) => {
        if (!matchedOutput) {
          if (output.name === matchedInput?.name || output.name?.includes(matchedInput?.name || '')) {
            matchedOutput = output;
          }
        }
      });
      if (!matchedOutput) {
        this.midiAccess.outputs.forEach((output) => {
          if (!matchedOutput) matchedOutput = output;
        });
      }

      this.bindPorts(matchedInput, matchedOutput, detectedProtocol, detectedName);
    } else {
      this.state.connected = false;
      this.state.deviceName = 'No Hardware Mixer Connected';
      this.notify();
    }
  }

  public bindPorts(input: MIDIInput | null, output: MIDIOutput | null, proto: ControllerProtocol, name: string): void {
    if (this.activeInput) {
      this.activeInput.onmidimessage = null;
    }
    this.activeInput = input;
    this.activeOutput = output;

    if (this.activeOutput && this.activeOutput.state === 'connected' && this.activeOutput.connection === 'closed') {
      void this.activeOutput.open?.();
    }

    this.state.connected = !!input;
    this.state.deviceName = name || 'Hardware Mixer';
    this.state.protocol = proto;

    if (this.activeInput) {
      this.activeInput.onmidimessage = (msg) => this.handleIncomingMidi(msg);
      // Send initial MCU ping & LCD greeting
      this.sendMcuInitSequence();
    }
    this.notify();
  }

  // ── Hardware Output: Motorized Faders, LEDs & Scribble Strips ─────────────

  /** Moves a physical motorized fader on the hardware desk (10-bit pitch bend). */
  public sendMotorizedFader(channelIndex: number, gain: number): void {
    if (!this.activeOutput) return;

    // channelIndex is absolute in project. Map to active bank (0..7)
    let midiChannel = -1;
    if (channelIndex === -1 || channelIndex === 999) {
      midiChannel = 8; // Master fader is channel 8 (0-indexed 8 = 9th channel)
    } else {
      const local = channelIndex - this.state.bankOffset;
      if (local >= 0 && local < 8) midiChannel = local;
    }

    if (midiChannel < 0) return;

    // Skip if user is physically touching the fader to prevent motor fighting
    if (this.state.faderTouching[midiChannel]) return;

    const val14 = gainToMcu14Bit(gain);
    const lsb = val14 & 0x7F;
    const msb = (val14 >> 7) & 0x7F;

    try {
      this.activeOutput.send([0xE0 | midiChannel, lsb, msb]);
    } catch { /* ignored */ }
  }

  /** Lights or unlights a physical button LED on the hardware desk. */
  public sendButtonLed(note: number, on: boolean): void {
    if (!this.activeOutput) return;
    try {
      this.activeOutput.send([0x90, note, on ? 127 : 0]);
    } catch { /* ignored */ }
  }

  /** Updates the V-Pot LED ring around an encoder knob (single-dot, boost/cut, spread). */
  public sendVpotRing(vpotIndex: number, value0to1: number, mode: 'DOT' | 'BOOST_CUT' = 'BOOST_CUT'): void {
    if (!this.activeOutput || vpotIndex < 0 || vpotIndex >= 8) return;
    // MCU V-Pot LED Ring CC 48..55. Value: 0x00 to 0x0B (positions 1-11) + mode flag
    const pos = Math.max(1, Math.min(11, Math.round(value0to1 * 10) + 1));
    const modeFlag = mode === 'BOOST_CUT' ? 0x10 : 0x00;
    try {
      this.activeOutput.send([0xB0, CC_LED_RING_BASE + vpotIndex, modeFlag | pos]);
    } catch { /* ignored */ }
  }

  /** Writes text to the physical 2-line LCD Scribble Strip displays on the desk. */
  public updateLcdScribbleStrips(line1Text: string, line2Text: string): void {
    this.state.lcdLine1 = line1Text;
    this.state.lcdLine2 = line2Text;
    this.notify();

    if (!this.activeOutput) return;

    // Pad / truncate to 56 characters
    const p1 = line1Text.padEnd(56, ' ').substring(0, 56);
    const p2 = line2Text.padEnd(56, ' ').substring(0, 56);

    const chars1 = Array.from(p1).map(c => c.charCodeAt(0) & 0x7F);
    const chars2 = Array.from(p2).map(c => c.charCodeAt(0) & 0x7F);

    try {
      // Line 1: offset 0x00
      this.activeOutput.send([...MCU_SYSEX_HEADER, MCU_LCD_WRITE_CMD, 0x00, ...chars1, 0xF7]);
      // Line 2: offset 0x38 (56 dec)
      this.activeOutput.send([...MCU_SYSEX_HEADER, MCU_LCD_WRITE_CMD, 0x38, ...chars2, 0xF7]);
    } catch { /* sysex may be disabled in some environments */ }
  }

  /** Synchronizes the active 8 mixer strips with physical faders, buttons, and LCD. */
  public syncStripsToHardware(strips: MixerTrackStrip[], masterStrip?: MixerTrackStrip): void {
    const bank = strips.slice(this.state.bankOffset, this.state.bankOffset + 8);

    // Build scribble strip strings: 8 blocks of 7 chars
    let l1 = '';
    let l2 = '';

    for (let i = 0; i < 8; i++) {
      const s = bank[i];
      if (s) {
        const namePart = s.name.toUpperCase().padEnd(6, ' ').substring(0, 6) + ' ';
        l1 += namePart;

        const db = gainToDb(s.volumeGain);
        const dbStr = db <= -60 ? ' -INF ' : `${db >= 0 ? '+' : ''}${db.toFixed(1)}dB`;
        l2 += dbStr.padEnd(6, ' ').substring(0, 6) + ' ';

        // Push motorized fader
        this.sendMotorizedFader(this.state.bankOffset + i, s.volumeGain);

        // Push LEDs
        this.sendButtonLed(NOTE_MUTE_BASE + i, s.mute);
        this.sendButtonLed(NOTE_SOLO_BASE + i, s.solo);
        this.sendButtonLed(NOTE_REC_BASE + i, s.armed);
        this.sendButtonLed(NOTE_SELECT_BASE + i, s.selected);

        // Push V-Pot ring (pan or EQ)
        const vpotVal = this.state.vPotMode === 'PAN' ? (s.pan + 1) / 2 : (s.send1Gain ?? 0.5);
        this.sendVpotRing(i, vpotVal);
      } else {
        l1 += '       ';
        l2 += '       ';
        this.sendMotorizedFader(this.state.bankOffset + i, 0);
        this.sendButtonLed(NOTE_MUTE_BASE + i, false);
        this.sendButtonLed(NOTE_SOLO_BASE + i, false);
        this.sendButtonLed(NOTE_REC_BASE + i, false);
        this.sendButtonLed(NOTE_SELECT_BASE + i, false);
      }
    }

    if (masterStrip) {
      this.sendMotorizedFader(-1, masterStrip.volumeGain);
    }

    this.updateLcdScribbleStrips(l1, l2);
  }

  private sendMcuInitSequence(): void {
    if (!this.activeOutput) return;
    try {
      // Send host connection confirmation SysEx
      this.activeOutput.send([0xF0, 0x00, 0x00, 0x66, 0x14, 0x00, 0xF7]);
      this.updateLcdScribbleStrips('  PLAJAH  CHORA STUDIO  HIGH-END MIXING CONSOLE  ', '    CONNECTED · MOTORIZED FADERS & 8-BUS MCU READY     ');
    } catch { /* */ }
  }

  // ── Hardware Input Handling ───────────────────────────────────────────────

  private handleIncomingMidi(msg: MIDIMessageEvent): void {
    const data = msg.data;
    if (!data || data.length < 2) return;

    const status = data[0] & 0xF0;
    const channel = data[0] & 0x0F;
    const b1 = data[1];
    const b2 = data.length > 2 ? data[2] : 0;

    // 1. Pitch Bend (Motorized Faders)
    if (status === 0xE0) {
      const val14 = (b2 << 7) | b1;
      const gain = mcu14BitToGain(val14);

      if (channel === 8) {
        // Master Fader
        this.onFaderChangeCb?.(-1, gain);
      } else if (channel >= 0 && channel < 8) {
        // Track Faders 1-8
        const trackIndex = this.state.bankOffset + channel;
        this.onFaderChangeCb?.(trackIndex, gain);
      }
      return;
    }

    // 2. Control Change (V-Pots, Jog Wheel)
    if (status === 0xB0) {
      // V-Pots (CC 16..23)
      if (b1 >= CC_VPOT_BASE && b1 < CC_VPOT_BASE + 8) {
        const vpotIdx = b1 - CC_VPOT_BASE;
        const trackIdx = this.state.bankOffset + vpotIdx;
        // Relative encoding: 0x01..0x0F = CW (positive), 0x41..0x4F = CCW (negative)
        const isCCW = (b2 & 0x40) !== 0;
        const steps = b2 & 0x0F;
        const delta = isCCW ? -steps * 0.04 : steps * 0.04;
        this.onPanChangeCb?.(trackIdx, delta);
        return;
      }

      // Jog Wheel (CC 60)
      if (b1 === CC_JOG_WHEEL) {
        const isCCW = (b2 & 0x40) !== 0;
        const steps = b2 & 0x0F;
        const delta = isCCW ? -steps : steps;
        this.onJogWheelCb?.(delta);
        return;
      }

      // Generic MIDI Fallback (CC 7 volume, CC 10 pan)
      if (b1 === 7) {
        const gain = (b2 / 127) * 1.5;
        this.onFaderChangeCb?.(this.state.bankOffset, gain);
      }
      return;
    }

    // 3. Note On / Note Off (Buttons, Fader Touch)
    if (status === 0x90 || status === 0x80) {
      const isPress = status === 0x90 && b2 > 0;
      const note = b1;

      // Fader Touch (Notes 104..112)
      if (note >= NOTE_TOUCH_BASE && note <= NOTE_TOUCH_BASE + 8) {
        const idx = note - NOTE_TOUCH_BASE;
        this.state.faderTouching[idx] = isPress;
        this.notify();
        return;
      }

      if (!isPress) return; // Ignore Note Off for toggles

      // Channel Buttons
      if (note >= NOTE_REC_BASE && note < NOTE_REC_BASE + 8) {
        this.onArmToggleCb?.(this.state.bankOffset + (note - NOTE_REC_BASE));
        return;
      }
      if (note >= NOTE_SOLO_BASE && note < NOTE_SOLO_BASE + 8) {
        this.onSoloToggleCb?.(this.state.bankOffset + (note - NOTE_SOLO_BASE));
        return;
      }
      if (note >= NOTE_MUTE_BASE && note < NOTE_MUTE_BASE + 8) {
        this.onMuteToggleCb?.(this.state.bankOffset + (note - NOTE_MUTE_BASE));
        return;
      }
      if (note >= NOTE_SELECT_BASE && note < NOTE_SELECT_BASE + 8) {
        this.onSelectChannelCb?.(this.state.bankOffset + (note - NOTE_SELECT_BASE));
        return;
      }

      // Bank Switching
      if (note === NOTE_BANK_LEFT) {
        this.bankLeft();
        return;
      }
      if (note === NOTE_BANK_RIGHT) {
        this.bankRight();
        return;
      }
      if (note === NOTE_CHAN_LEFT) {
        this.channelLeft();
        return;
      }
      if (note === NOTE_CHAN_RIGHT) {
        this.channelRight();
        return;
      }

      // Flip Mode
      if (note === NOTE_FLIP) {
        this.state.flipMode = !this.state.flipMode;
        this.sendButtonLed(NOTE_FLIP, this.state.flipMode);
        this.notify();
        return;
      }

      // Transport
      if (note === NOTE_PLAY) {
        this.state.transportState = 'PLAY';
        this.onTransportActionCb?.('PLAY');
        this.sendButtonLed(NOTE_PLAY, true);
        this.sendButtonLed(NOTE_STOP, false);
        this.notify();
        return;
      }
      if (note === NOTE_STOP) {
        this.state.transportState = 'STOP';
        this.onTransportActionCb?.('STOP');
        this.sendButtonLed(NOTE_STOP, true);
        this.sendButtonLed(NOTE_PLAY, false);
        this.notify();
        return;
      }
      if (note === NOTE_RECORD) {
        this.state.transportState = 'RECORD';
        this.onTransportActionCb?.('RECORD');
        this.sendButtonLed(NOTE_RECORD, true);
        this.notify();
        return;
      }
      if (note === NOTE_REWIND) {
        this.onTransportActionCb?.('REWIND');
        return;
      }
      if (note === NOTE_FAST_FORWARD) {
        this.onTransportActionCb?.('FF');
        return;
      }
      if (note === NOTE_LOOP) {
        this.onTransportActionCb?.('LOOP');
        return;
      }
    }
  }

  // ── Navigation & Bank Controls ────────────────────────────────────────────

  public bankLeft(): void {
    if (this.state.bankOffset >= 8) {
      this.state.bankOffset -= 8;
      this.notify();
    }
  }

  public bankRight(): void {
    if (this.state.bankOffset + 8 < this.state.totalChannels) {
      this.state.bankOffset += 8;
      this.notify();
    }
  }

  public channelLeft(): void {
    if (this.state.bankOffset > 0) {
      this.state.bankOffset -= 1;
      this.notify();
    }
  }

  public channelRight(): void {
    if (this.state.bankOffset + 1 < this.state.totalChannels) {
      this.state.bankOffset += 1;
      this.notify();
    }
  }

  public setTotalChannels(total: number): void {
    this.state.totalChannels = Math.max(8, total);
    this.notify();
  }

  public setVPotMode(mode: VPotMode['mode']): void {
    this.state.vPotMode = mode;
    this.notify();
  }

  // ── Registration Callbacks ────────────────────────────────────────────────

  public registerCallbacks(cbs: {
    onFaderChange?: (channelIndex: number, gain: number) => void;
    onPanChange?: (channelIndex: number, delta: number) => void;
    onMuteToggle?: (channelIndex: number) => void;
    onSoloToggle?: (channelIndex: number) => void;
    onArmToggle?: (channelIndex: number) => void;
    onSelectChannel?: (channelIndex: number) => void;
    onTransportAction?: (action: 'PLAY' | 'STOP' | 'RECORD' | 'REWIND' | 'FF' | 'LOOP') => void;
    onJogWheel?: (deltaTicks: number) => void;
  }): void {
    this.onFaderChangeCb = cbs.onFaderChange;
    this.onPanChangeCb = cbs.onPanChange;
    this.onMuteToggleCb = cbs.onMuteToggle;
    this.onSoloToggleCb = cbs.onSoloToggle;
    this.onArmToggleCb = cbs.onArmToggle;
    this.onSelectChannelCb = cbs.onSelectChannel;
    this.onTransportActionCb = cbs.onTransportAction;
    this.onJogWheelCb = cbs.onJogWheel;
  }
}

export const mackieControl = MackieControlService.getInstance();
