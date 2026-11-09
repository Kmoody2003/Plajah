// What each controller board can do, pin by pin, for the planner: analog inputs, PWM, the I²C and
// SPI pins its firmware uses, strapping pins to keep inputs off, power, radios and native USB.
// Pin names match the board symbols in boards.ts (only the pins those symbols expose).
// Released by Plajah as public domain (CC0).

import { BOARD_INFO } from '../boards';

export type McuKind = 'esp32' | 'esp32s3' | 'pico' | 'picow' | 'nano' | 'rpi';
export type Framework = 'esphome' | 'circuitpython' | 'arduino' | 'python';
export interface McuDef {
  kind: McuKind; /** Component kind of the board symbol, and its variant parameter. */ part: string; variant?: string; label: string; logic: number; framework: Framework;
  /** Pins in the order the planner hands them out. */
  gpio: string[]; adc: string[]; pwm: string[];
  /** I²C [SDA, SCL] options, SPI [SCK, MOSI] options (first free one wins). */
  i2c: Array<[string, string]>; spi: Array<[string, string]>;
  /** Pins that change boot mode: fine for outputs, avoided for inputs. */
  strap: string[];
  /** Power-in pin from a 5 V rail, and from a raw 1.8-5.5 V battery rail (Pico VSYS) if it has one. */
  pin5v: string; pinBattery?: string; rail3v3?: string;
  wifi: boolean; ble: boolean; usbDevice: boolean;
  /** Typical and peak current from its power pin (A). */
  typ: number; peak: number; about: string;
}

export const MCUS: Record<McuKind, McuDef> = {
  esp32: { kind: 'esp32', part: 'esp32', label: 'ESP32 dev board', logic: 3.3, framework: 'esphome', gpio: ['IO4', 'IO13', 'IO14', 'IO18', 'IO19', 'IO21', 'IO22', 'IO23', 'IO25', 'IO26', 'IO27', 'IO32', 'IO33', 'IO5', 'IO2'],
    adc: ['IO32', 'IO33'], pwm: ['IO4', 'IO13', 'IO14', 'IO18', 'IO19', 'IO21', 'IO22', 'IO23', 'IO25', 'IO26', 'IO27', 'IO32', 'IO33', 'IO5', 'IO2'], i2c: [['IO21', 'IO22']], spi: [['IO18', 'IO23']], strap: ['IO2', 'IO5'],
    pin5v: '5V', rail3v3: '3V3', wifi: true, ble: true, usbDevice: false, typ: 0.08, peak: 0.25, about: 'Wi-Fi + Bluetooth, runs ESPHome for Home Assistant. Only ADC1 pins (IO32/IO33 here) read analog while Wi-Fi is on.' },
  pico: { kind: 'pico', part: 'pico', variant: 'Pico', label: 'Raspberry Pi Pico', logic: 3.3, framework: 'circuitpython', gpio: ['GP2', 'GP3', 'GP4', 'GP5', 'GP14', 'GP15', 'GP16', 'GP17', 'GP22', 'GP26', 'GP27', 'GP28'],
    adc: ['GP26', 'GP27', 'GP28'], pwm: ['GP2', 'GP3', 'GP4', 'GP5', 'GP14', 'GP15', 'GP16', 'GP17', 'GP22', 'GP26', 'GP27', 'GP28'], i2c: [['GP4', 'GP5'], ['GP2', 'GP3'], ['GP16', 'GP17']], spi: [['GP14', 'GP15'], ['GP2', 'GP3']], strap: [],
    pin5v: 'VBUS', pinBattery: 'VSYS', rail3v3: '3V3', wifi: false, ble: false, usbDevice: true, typ: 0.03, peak: 0.05, about: 'Native USB (MIDI, keyboard, mouse), three analog inputs, CircuitPython. Pico W adds Wi-Fi.' },
  nano: { kind: 'nano', part: 'nano', label: 'Arduino Nano', logic: 5, framework: 'arduino', gpio: ['D2', 'D3', 'D4', 'D5', 'D6', 'D9', 'D10', 'D11', 'D12', 'D13', 'A0', 'A1', 'A4', 'A5'],
    adc: ['A0', 'A1', 'A4', 'A5'], pwm: ['D3', 'D5', 'D6', 'D9', 'D10', 'D11'], i2c: [['A4', 'A5']], spi: [['D13', 'D11']], strap: [],
    pin5v: '5V', wifi: false, ble: false, usbDevice: false, typ: 0.02, peak: 0.04, about: '5 V logic (talks to 5 V modules directly), Arduino IDE. No radio, no native USB.' },
  rpi: { kind: 'rpi', part: 'rpi', label: 'Raspberry Pi', logic: 3.3, framework: 'python', gpio: ['GPIO4', 'GPIO17', 'GPIO27', 'GPIO22', 'GPIO18', 'GPIO23', 'GPIO24', 'GPIO25', 'GPIO8', 'GPIO2', 'GPIO3', 'GPIO11', 'GPIO10'],
    adc: [], pwm: ['GPIO18', 'GPIO4', 'GPIO17', 'GPIO27', 'GPIO22', 'GPIO23', 'GPIO24', 'GPIO25'], i2c: [['GPIO2', 'GPIO3']], spi: [['GPIO11', 'GPIO10']], strap: [],
    pin5v: '5V', rail3v3: '3V3', wifi: true, ble: true, usbDevice: false, typ: 0.9, peak: 2.5, about: 'A Linux computer: Python, a desktop, cameras, storage. No analog inputs (we add an ADS1115).' },
  esp32s3: { kind: 'esp32s3', part: 'esp32s3', label: 'ESP32-S3 dev board', logic: 3.3, framework: 'esphome', gpio: ['IO4', 'IO5', 'IO6', 'IO7', 'IO15', 'IO16', 'IO17', 'IO18', 'IO21', 'IO38', 'IO39', 'IO40', 'IO41', 'IO42', 'IO1', 'IO2', 'IO10', 'IO11', 'IO12', 'IO13', 'IO14', 'IO8', 'IO9'],
    adc: ['IO1', 'IO2', 'IO4', 'IO5', 'IO6', 'IO7', 'IO10'], pwm: ['IO4', 'IO5', 'IO6', 'IO7', 'IO15', 'IO16', 'IO17', 'IO18', 'IO21', 'IO38', 'IO39', 'IO40', 'IO41', 'IO42', 'IO1', 'IO2', 'IO10', 'IO11', 'IO12', 'IO13', 'IO14', 'IO8', 'IO9'], i2c: [['IO8', 'IO9']], spi: [['IO12', 'IO11']], strap: [],
    pin5v: '5V', rail3v3: '3V3', wifi: true, ble: true, usbDevice: true, typ: 0.1, peak: 0.3, about: 'Wi-Fi + native USB in one chip, many pins: ESPHome for Home Assistant, or CircuitPython when it must be a USB MIDI/keyboard device.' },
  picow: { kind: 'picow', part: 'pico', variant: 'Pico W', label: 'Raspberry Pi Pico W', logic: 3.3, framework: 'circuitpython', gpio: ['GP2', 'GP3', 'GP4', 'GP5', 'GP14', 'GP15', 'GP16', 'GP17', 'GP22', 'GP26', 'GP27', 'GP28'],
    adc: ['GP26', 'GP27', 'GP28'], pwm: ['GP2', 'GP3', 'GP4', 'GP5', 'GP14', 'GP15', 'GP16', 'GP17', 'GP22', 'GP26', 'GP27', 'GP28'], i2c: [['GP4', 'GP5'], ['GP2', 'GP3'], ['GP16', 'GP17']], spi: [['GP14', 'GP15'], ['GP2', 'GP3']], strap: [],
    pin5v: 'VBUS', pinBattery: 'VSYS', rail3v3: '3V3', wifi: true, ble: false, usbDevice: true, typ: 0.05, peak: 0.3, about: "Pico with Wi-Fi: CircuitPython reports over MQTT (Home Assistant's MQTT integration) and can still be a USB MIDI/keyboard device." },
};
/** ESP32-S3 runs CircuitPython when it has to be a USB device; ESPHome otherwise. */
export const frameworkFor = (m: McuDef, conn: string[]): Framework => (m.kind === 'esp32s3' && conn.some(c => c === 'usb-midi' || c === 'usb-hid') ? 'circuitpython' : m.framework);
export const railMax = (k: McuKind) => BOARD_INFO[MCUS[k].part].rail3v3Max;
export const pinMax = (k: McuKind) => BOARD_INFO[MCUS[k].part].pinMax;
