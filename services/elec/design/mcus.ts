// What each controller board can do, pin by pin, for the planner: analog inputs, PWM, the I²C and
// SPI pins its firmware uses, strapping pins to keep inputs off, power, radios and native USB.
// Pin names match the board symbols in boards.ts (only the pins those symbols expose).
// Released by Plajah as public domain (CC0).

import { BOARD_INFO } from '../boards';

export type McuKind = 'esp32' | 'pico' | 'nano' | 'rpi';
export type Framework = 'esphome' | 'circuitpython' | 'arduino' | 'python';
export interface McuDef {
  kind: McuKind; label: string; logic: number; framework: Framework;
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
  esp32: { kind: 'esp32', label: 'ESP32 dev board', logic: 3.3, framework: 'esphome', gpio: ['IO4', 'IO13', 'IO14', 'IO18', 'IO19', 'IO21', 'IO22', 'IO25', 'IO26', 'IO32', 'IO33', 'IO5', 'IO2'],
    adc: ['IO32', 'IO33'], pwm: ['IO4', 'IO13', 'IO14', 'IO18', 'IO19', 'IO21', 'IO22', 'IO25', 'IO26', 'IO32', 'IO33', 'IO5', 'IO2'], i2c: [['IO21', 'IO22']], spi: [['IO18', 'IO19']], strap: ['IO2', 'IO5'],
    pin5v: '5V', rail3v3: '3V3', wifi: true, ble: true, usbDevice: false, typ: 0.08, peak: 0.25, about: 'Wi-Fi + Bluetooth, runs ESPHome for Home Assistant. Only ADC1 pins (IO32/IO33 here) read analog while Wi-Fi is on.' },
  pico: { kind: 'pico', label: 'Raspberry Pi Pico', logic: 3.3, framework: 'circuitpython', gpio: ['GP2', 'GP3', 'GP4', 'GP5', 'GP14', 'GP15', 'GP16', 'GP17', 'GP26', 'GP27', 'GP28'],
    adc: ['GP26', 'GP27', 'GP28'], pwm: ['GP2', 'GP3', 'GP4', 'GP5', 'GP14', 'GP15', 'GP16', 'GP17', 'GP26', 'GP27', 'GP28'], i2c: [['GP4', 'GP5'], ['GP2', 'GP3'], ['GP16', 'GP17']], spi: [['GP14', 'GP15'], ['GP2', 'GP3']], strap: [],
    pin5v: 'VBUS', pinBattery: 'VSYS', rail3v3: '3V3', wifi: false, ble: false, usbDevice: true, typ: 0.03, peak: 0.05, about: 'Native USB (MIDI, keyboard, mouse), three analog inputs, CircuitPython. Pico W adds Wi-Fi.' },
  nano: { kind: 'nano', label: 'Arduino Nano', logic: 5, framework: 'arduino', gpio: ['D2', 'D3', 'D4', 'D5', 'D6', 'D9', 'D10', 'D11', 'A0', 'A1', 'A4', 'A5'],
    adc: ['A0', 'A1', 'A4', 'A5'], pwm: ['D3', 'D5', 'D6', 'D9', 'D10', 'D11'], i2c: [['A4', 'A5']], spi: [['D10', 'D11']], strap: [],
    pin5v: '5V', wifi: false, ble: false, usbDevice: false, typ: 0.02, peak: 0.04, about: '5 V logic (talks to 5 V modules directly), Arduino IDE. No radio, no native USB.' },
  rpi: { kind: 'rpi', label: 'Raspberry Pi', logic: 3.3, framework: 'python', gpio: ['GPIO4', 'GPIO17', 'GPIO27', 'GPIO22', 'GPIO18', 'GPIO23', 'GPIO24', 'GPIO25', 'GPIO2', 'GPIO3'],
    adc: [], pwm: ['GPIO18', 'GPIO4', 'GPIO17', 'GPIO27', 'GPIO22', 'GPIO23', 'GPIO24', 'GPIO25'], i2c: [['GPIO2', 'GPIO3']], spi: [], strap: [],
    pin5v: '5V', rail3v3: '3V3', wifi: true, ble: true, usbDevice: false, typ: 0.9, peak: 2.5, about: 'A Linux computer: Python, a desktop, cameras, storage. No analog inputs (we add an ADS1115).' },
};
export const railMax = (k: McuKind) => BOARD_INFO[k].rail3v3Max;
export const pinMax = (k: McuKind) => BOARD_INFO[k].pinMax;
