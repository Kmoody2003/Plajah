// Key matrix: many keys on few pins. Keys sit at row/column crossings, each with a 1N4148 so any
// combination of keys reads correctly (no ghosting); anodes face the columns, cathodes the rows.
// 12 keys need 7 pins instead of 12. Released by Plajah as public domain (CC0).
import type { BlockDef } from './block';
import type { Inst } from './types';

const dims = (keys: number) => { const rows = Math.max(2, Math.round(Math.sqrt(keys))); return { rows, cols: Math.ceil(keys / rows) }; };

export const keymatrix: BlockDef = {
  id: 'keymatrix', label: 'Key matrix', plural: 'keys', about: 'Keys wired as a row × column matrix with a diode per key: many keys on few pins, any combination pressed at once.', max: 64,
  words: /\b(key ?matrix|keyboard matrix|button matrix|keypad matrix|mechanical keyboard)\b/i, needsMcu: () => true,
  instances: c => [Math.max(4, Math.min(64, c))],
  pins: i => { const { rows, cols } = dims(i.count); return [...Array.from({ length: rows }, (_, r) => ({ role: `r${r}`, cap: 'gpio' as const, label: `Key row ${r + 1}` })), ...Array.from({ length: cols }, (_, c) => ({ role: `c${c}`, cap: 'in' as const, label: `Key column ${c + 1}` }))]; },
  loads: () => [],
  draw(i, d) {
    const { cols } = dims(i.count);
    for (let k = 0; k < i.count; k++) {
      const r = Math.floor(k / cols), c = k % cols; const x = c * 12, y = r * 6;
      const s = d.part('switch', x, y, 0, { state: 'open', I: '0.05' }); const dd = d.part('diode', x + 6, y, 0, { type: 'signal' });
      d.net(`@c${c}`, [s, '1']); d.net(`k${k}`, [s, '2'], [dd, 'A']); d.net(`@r${r}`, [dd, 'K']);
    }
  },
  fw(i, f) {
    const { rows, cols } = dims(i.count); const R = Array.from({ length: rows }, (_, r) => i.pins[`r${r}`]), C = Array.from({ length: cols }, (_, c) => i.pins[`c${c}`]);
    if (f.fw === 'esphome') {
      const keys = Array.from({ length: i.count }, (_, k) => '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz*#'[k]).join('');
      f.esp('matrix_keypad', `- id: keys\n  rows:\n${R.map(p => `    - pin: ${f.pin(p)}`).join('\n')}\n  columns:\n${C.map(p => `    - pin: ${f.pin(p)}`).join('\n')}\n  keys: "${keys}"\n  has_diodes: true`);
      f.esp('text_sensor', `- platform: template\n  name: "Last key"\n  id: last_key`); f.esp('binary_sensor', Array.from({ length: Math.min(i.count, 16) }, (_, k) => `- platform: matrix_keypad\n  keypad_id: keys\n  key: "${keys[k]}"\n  name: "Key ${k + 1}"`).join('\n')); return;
    }
    if (f.fw === 'arduino') {
      f.imp('#include <Keypad.h>'); f.lib('Keypad (Mark Stanley)');
      f.glob(`const byte KROWS = ${rows}, KCOLS = ${cols};\nchar keymap[KROWS][KCOLS] = {${Array.from({ length: rows }, (_, r) => `{${Array.from({ length: cols }, (_, c) => `${r * cols + c + 1}`).join(', ')}}`).join(', ')}};\nbyte rowPins[KROWS] = {${R.map(f.pin).join(', ')}};\nbyte colPins[KCOLS] = {${C.map(f.pin).join(', ')}};\nKeypad keys = Keypad(makeKeymap(keymap), rowPins, colPins, KROWS, KCOLS);`);
      f.loop('{ char k = keys.getKey(); if (k) { Serial.print("key "); Serial.println((int)k); } }'); return;
    }
    f.imp('import keypad'); f.lib(f.fw === 'python' ? 'keypad' : '');
    f.setup(`keys = keypad.KeyMatrix(row_pins=(${R.map(f.bpin).join(', ')},), column_pins=(${C.map(f.bpin).join(', ')},), columns_to_anodes=True)  # diodes: anode to column`);
    const press = i.usbMidi ? 'midi.write(bytes([0x90 if ev.pressed else 0x80, 36 + ev.key_number, 100 if ev.pressed else 0]))' : i.usbHid ? '(kbd.press if ev.pressed else kbd.release)(KEYS[ev.key_number])' : 'print("key", ev.key_number + 1, "down" if ev.pressed else "up")';
    if (i.usbHid) f.setup(`KEYS = [${Array.from({ length: i.count }, (_, k) => (k < 12 ? `Keycode.F${13 + k}` : `Keycode.${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[(k - 12) % 26]}`)).join(', ')}]  # F13-F24 first, then letters`);
    f.loop(`ev = keys.events.get()\nif ev:\n    ${press}`);
  },
  notes: (i: Inst) => { const { rows, cols } = dims(i.count); return [`${i.count} keys as a ${rows} × ${cols} matrix: ${rows + cols} pins instead of ${i.count}. Each key has a 1N4148 diode (anode to the column) so several keys can be held at once.`]; },
  extras: i => [[String(i.count), 'Key switches (12 mm tactile or MX-style) + caps', '']],
};
