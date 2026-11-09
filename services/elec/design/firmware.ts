// Firmware from block snippets: ESPHome YAML (ESP32), CircuitPython (Pico), an Arduino sketch
// (Nano) or a Python service (Raspberry Pi). Buses, ADCs, USB MIDI/HID and the display that shows
// every reading are added here; each block contributes its own lines. Generated code is CC0.
import { blockById } from './blocks';
import type { Plan } from './planner';
import type { FwApi } from './types';
import type { Firmware } from '../recipes';

const secrets = `# secrets.yaml: keep this file private, never commit it.
wifi_ssid: ""
wifi_password: ""
fallback_password: ""   # unique per device (no shared default passwords)
api_key: ""             # esphome wizard, or 32 random bytes in base64
ota_password: ""
`;
const ind = (code: string, n: number) => code.split('\n').map(l => (l ? ' '.repeat(n) + l : l)).join('\n');
const uniq = (a: string[]) => [...new Set(a.filter(Boolean))];
const expOf = (pn: string) => { const m = /^EXP:(\d+):GP([AB])(\d)$/.exec(pn ?? ''); return m ? { idx: +m[1], n: (m[2] === 'B' ? 8 : 0) + +m[3] } : null; };
const expAddr = (k: number) => `0x${(0x20 + k).toString(16)}`;

export function firmware(p: Plan, name: string): Firmware | undefined {
  const mcu = p.mcu; if (!mcu) return undefined; const fw = p.framework ?? mcu.framework;
  const esp = new Map<string, string[]>(); const earlies: string[] = [], imps: string[] = [], libs: string[] = [], globs: string[] = [], setups: string[] = [], loops: string[] = [];
  const reads: Array<{ label: string; expr: string; unit: string }> = []; const screens: Array<{ kind: 'oled' | 'tft'; id: string; addr: string }> = [];
  const api: FwApi = {
    fw, early: c => earlies.push(c), esp: (s, item) => esp.set(s, [...(esp.get(s) ?? []), item]), imp: (...l) => imps.push(...l), lib: (...l) => libs.push(...l), glob: c => globs.push(c), setup: c => setups.push(c), loop: c => loops.push(c),
    read: (label, expr, unit) => reads.push({ label, expr, unit }), screen: (kind, id, addr) => screens.push({ kind, id, addr }),
    pin: pn => (fw === 'esphome' ? pn.replace(/^IO/, 'GPIO') : fw === 'circuitpython' ? `board.${pn}` : fw === 'python' ? pn.replace('GPIO', '') : pn.replace(/^D/, '')),
    bpin: pn => (fw === 'python' ? `board.D${pn.replace('GPIO', '')}` : `board.${pn}`),
    ads: ch => { const m = /^ADS:(\d+):A(\d)$/.exec(ch ?? ''); return m ? { idx: +m[1], ch: +m[2] } : null; },
    isExp: pn => !!expOf(pn),
    dio: pn => { const e = expOf(pn); return e ? `mcp${e.idx}.get_pin(${e.n})` : `digitalio.DigitalInOut(${api.bpin(pn)})`; },
    espPin: (pn, o = {}) => {
      const e = expOf(pn); const lines = e ? [`mcp23xxx: mcp${e.idx}`, `number: ${e.n}`] : [`number: ${api.pin(pn)}`];
      if (o.input || o.pullup) lines.push('mode:', '  input: true', ...(o.pullup ? ['  pullup: true'] : [])); else if (e) lines.push('mode:', '  output: true');
      if (o.inverted) lines.push('inverted: true');
      return lines.length === 1 ? `  pin: ${api.pin(pn)}` : `  pin:\n${lines.map(l => `    ${l}`).join('\n')}`;
    },
    ard: pn => { const e = expOf(pn); return e ? { mode: m => `mcp${e.idx}.pinMode(${e.n}, ${m});`, read: `mcp${e.idx}.digitalRead(${e.n})`, write: v => `mcp${e.idx}.digitalWrite(${e.n}, ${v});` } : { mode: m => `pinMode(${api.pin(pn)}, ${m});`, read: `digitalRead(${api.pin(pn)})`, write: v => `digitalWrite(${api.pin(pn)}, ${v});` }; },
  };
  for (const i of p.insts) blockById(i.block)!.fw(i, api);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'device';
  const head = (c: string) => `${c} Plajah Build: ${name}. Generated from the design's blocks; public domain (CC0).`;
  const libList = uniq(libs);

  if (fw === 'esphome') {
    const out: string[] = [head('#'), '# esphome run device.yaml   (first flash over USB, then over Wi-Fi)', '', `esphome:\n  name: plajah-${slug}`, '', mcu.kind === 'esp32s3' ? 'esp32:\n  board: esp32-s3-devkitc-1\n  variant: esp32s3' : 'esp32:\n  board: esp32dev', '',
      'wifi:\n  ssid: !secret wifi_ssid\n  password: !secret wifi_password\n  ap:\n    password: !secret fallback_password', '', 'captive_portal:', '', 'api:\n  encryption:\n    key: !secret api_key', '', 'ota:\n  - platform: esphome\n    password: !secret ota_password', '', 'logger:', ''];
    if (p.i2c) out.push(`i2c:\n  sda: ${api.pin(p.i2c[0])}\n  scl: ${api.pin(p.i2c[1])}\n  scan: true`, '');
    if (p.spi) out.push(`spi:\n  clk_pin: ${api.pin(p.spi[0])}\n  mosi_pin: ${api.pin(p.spi[1])}`, '');
    if (p.exp) out.push(`mcp23017:\n${Array.from({ length: p.exp }, (_, k) => `  - id: mcp${k}\n    address: ${expAddr(k)}`).join('\n')}`, '');
    if (p.ads) out.push(`ads1115:\n${Array.from({ length: p.ads }, (_, k) => `  - address: 0x${(0x48 + k).toString(16)}\n    id: ads${k}`).join('\n')}`, '');
    for (const s of screens) {
      const size = s.kind === 'oled' ? 12 : 20; const step = s.kind === 'oled' ? 13 : 26;
      esp.set('font', [...(esp.get('font') ?? []), `- file: "gfonts://Roboto"\n  id: font_${s.id}\n  size: ${size}`]);
      const lines = reads.length ? reads.slice(0, s.kind === 'oled' ? 4 : 8).map((r, k) => `it.printf(0, ${k * step}, id(font_${s.id}), "${r.label}: %.1f ${r.unit}", id(${r.expr}).state);`) : [`it.print(0, 0, id(font_${s.id}), "${name.slice(0, 18)}");`];
      const headS = s.kind === 'oled' ? `- platform: ssd1306_i2c\n  model: "SSD1306 128x64"\n  address: ${s.addr}` : `- platform: ili9xxx\n  model: ST7789V\n  cs_pin: ${api.pin(p.insts.find(i => i.id === s.id)!.pins.cs)}\n  dc_pin: ${api.pin(p.insts.find(i => i.id === s.id)!.pins.dc)}\n  reset_pin: ${api.pin(p.insts.find(i => i.id === s.id)!.pins.rst)}\n  dimensions:\n    height: 240\n    width: 240\n  invert_colors: true`;
      esp.set('display', [...(esp.get('display') ?? []), `${headS}\n  update_interval: 1s\n  lambda: |-\n${ind(lines.join('\n'), 4)}`]);
    }
    for (const [sec, items] of esp) out.push(sec === 'rtttl' ? `rtttl:\n${ind(items[0], 2)}` : `${sec}:\n${items.map(it => ind(it, 2)).join('\n')}`, '');
    return { file: 'device.yaml', lang: 'yaml', code: out.join('\n'), about: 'ESPHome config. Fill in secrets.yaml (Wi-Fi and unique passwords), flash once over USB; Home Assistant finds the device and every sensor, switch and light appears there.', extra: [{ file: 'secrets.yaml', code: secrets }] };
  }

  if (fw === 'arduino') {
    const oled = screens.find(s => s.kind === 'oled'); const atft = screens.find(s => s.kind === 'tft'); const ti = atft ? p.insts.find(i => i.id === atft.id)! : null;
    const inc = uniq([atft ? '#include <Adafruit_ST7789.h>' : '',p.i2c ? '#include <Wire.h>' : '', ...imps.filter(l => l.startsWith('#')), p.ads ? '#include <Adafruit_ADS1X15.h>' : '', p.exp ? '#include <Adafruit_MCP23X17.h>' : '', oled ? '#include <Adafruit_SSD1306.h>' : '']);
    if (p.ads) libList.push('Adafruit ADS1X15'); if (p.exp) libList.push('Adafruit MCP23017'); if (oled) libList.push('Adafruit SSD1306', 'Adafruit GFX'); if (atft) libList.push('Adafruit ST7735 and ST7789', 'Adafruit GFX');
    const g = [...Array.from({ length: p.exp ?? 0 }, (_, k) => `Adafruit_MCP23X17 mcp${k};`), ...(p.ads ? Array.from({ length: p.ads }, (_, k) => `Adafruit_ADS1115 ads${k};`) : []), ...(oled ? ['Adafruit_SSD1306 oled(128, 64, &Wire, -1);'] : []), ...(ti ? [`Adafruit_ST7789 tft(${api.pin(ti.pins.cs)}, ${api.pin(ti.pins.dc)}, ${api.pin(ti.pins.rst)});  // hardware SPI: D13 clock, D11 data`] : []), ...globs, 'unsigned long lastReport = 0;'];
    const st = ['Serial.begin(115200);', ...(p.i2c ? ['Wire.begin();'] : []), ...Array.from({ length: p.exp ?? 0 }, (_, k) => `mcp${k}.begin_I2C(${expAddr(k)});`), ...Array.from({ length: p.ads }, (_, k) => `ads${k}.begin(0x${(0x48 + k).toString(16)});`), ...(oled ? [`oled.begin(SSD1306_SWITCHCAPVCC, ${oled.addr});`, 'oled.setTextColor(SSD1306_WHITE);'] : []), ...(ti ? ['tft.init(240, 240);', 'tft.fillScreen(ST77XX_BLACK);', 'tft.setTextSize(2);', 'tft.setTextColor(ST77XX_WHITE, ST77XX_BLACK);'] : []), ...setups];
    st.splice(1, 0, ...earlies);
    const rep = reads.map(r => `Serial.print("${r.label}: "); Serial.println(${r.expr});`);
    const scr2 = ti ? ['tft.setCursor(0, 8);', ...reads.slice(0, 8).map(r => `tft.print("${r.label}: "); tft.print(${r.expr}); tft.println("   ");`)] : [];
    const scr = oled ? ['oled.clearDisplay(); oled.setCursor(0, 0);', ...reads.slice(0, 6).map(r => `oled.print("${r.label}: "); oled.println(${r.expr});`), 'oled.display();'] : [];
    const code = [`// ${head('').trim()}`, `// Arduino IDE: board "Arduino Nano". Libraries (Library Manager): ${uniq(libList).join(', ') || 'none'}.`, ...inc, '', ...g, '', 'void setup() {', ind(st.join('\n'), 2), '}', '', 'void loop() {', ind(loops.join('\n'), 2), '  if (millis() - lastReport > 1000) {', '    lastReport = millis();', ind([...rep, ...scr, ...scr2].join('\n'), 4), '  }', '}', ''].join('\n');
    return { file: `${slug}.ino`, lang: 'cpp', code, about: `Arduino sketch. Install the libraries named at the top from the Library Manager, then upload to the Nano. Readings print on the serial monitor at 115200 baud.` };
  }

  // CircuitPython (Pico) and Python with Blinka (Raspberry Pi) share most of the shape.
  const py = fw === 'python'; const oled = screens.find(s => s.kind === 'oled'), tft = screens.find(s => s.kind === 'tft');
  const top = uniq(['import time', 'import board', p.i2c || p.spi ? 'import busio' : '', ...imps]);
  const pre: string[] = [];
  if (p.insts[0]?.usbMidi) { top.push('import usb_midi'); pre.push('midi = usb_midi.ports[1]  # USB MIDI out: shows up as "CircuitPython MIDI"'); }
  if (p.insts[0]?.usbHid) { top.push('import usb_hid', 'from adafruit_hid.keyboard import Keyboard', 'from adafruit_hid.keycode import Keycode', 'from adafruit_hid.consumer_control import ConsumerControl', 'from adafruit_hid.consumer_control_code import ConsumerControlCode'); libList.push('adafruit_hid'); pre.push('kbd = Keyboard(usb_hid.devices)\ncc = ConsumerControl(usb_hid.devices)'); }
  const cpWifi = !py && mcu.wifi && !!p.wifi;
  if (cpWifi) {
    top.push('import os, json, wifi, socketpool', 'import adafruit_minimqtt.adafruit_minimqtt as MQTT'); libList.push('adafruit_minimqtt');
    pre.push(`wifi.radio.connect(os.getenv("CIRCUITPY_WIFI_SSID"), os.getenv("CIRCUITPY_WIFI_PASSWORD"))\nmqtt = MQTT.MQTT(broker=os.getenv("MQTT_BROKER"), username=os.getenv("MQTT_USER"), password=os.getenv("MQTT_PASSWORD"), socket_pool=socketpool.SocketPool(wifi.radio))\nmqtt.connect()\nSTATE_TOPIC = "plajah/${slug}/state"  # add an MQTT sensor in Home Assistant on this topic`);
  }
  if (p.i2c) pre.push(py ? 'i2c = busio.I2C(board.SCL, board.SDA)' : `i2c = busio.I2C(${api.bpin(p.i2c[1])}, ${api.bpin(p.i2c[0])})  # SCL, SDA`);
  if (p.spi) pre.push(`spi = busio.SPI(clock=${api.bpin(p.spi[0])}, MOSI=${api.bpin(p.spi[1])})`);
  if (p.exp) { top.push('from adafruit_mcp230xx.mcp23017 import MCP23017'); libList.push('adafruit_mcp230xx'); pre.push(...Array.from({ length: p.exp }, (_, k) => `mcp${k} = MCP23017(i2c, address=${expAddr(k)})`)); }
  if (p.ads) { top.push('import adafruit_ads1x15.ads1115 as ADS'); libList.push('adafruit_ads1x15'); pre.push(...Array.from({ length: p.ads }, (_, k) => `ads${k} = ADS.ADS1115(i2c, address=0x${(0x48 + k).toString(16)})`)); }
  if (oled) { top.push('import adafruit_ssd1306'); libList.push('adafruit_ssd1306', 'adafruit_framebuf'); pre.push(`oled = adafruit_ssd1306.SSD1306_I2C(128, 64, i2c, addr=${oled.addr})`); }
  if (tft && py) {
    const t = p.insts.find(i => i.id === tft.id)!; top.push('import digitalio', 'from PIL import Image, ImageDraw, ImageFont', 'from adafruit_rgb_display import st7789'); libList.push('adafruit_rgb_display');
    pre.push(`tft = st7789.ST7789(board.SPI(), cs=digitalio.DigitalInOut(${api.bpin(t.pins.cs)}), dc=digitalio.DigitalInOut(${api.bpin(t.pins.dc)}), rst=digitalio.DigitalInOut(${api.bpin(t.pins.rst)}), baudrate=24000000, width=240, height=240, y_offset=80)\ncanvas = Image.new("RGB", (240, 240))\npen = ImageDraw.Draw(canvas)\nfont = ImageFont.load_default()`);
  } else if (tft) {
    const t = p.insts.find(i => i.id === tft.id)!; top.push('import displayio, terminalio', 'from adafruit_display_text import label', 'from adafruit_st7789 import ST7789', 'try:\n    from fourwire import FourWire  # CircuitPython 9\nexcept ImportError:\n    from displayio import FourWire');
    libList.push('adafruit_st7789', 'adafruit_display_text');
    pre.push(`displayio.release_displays()\nspi = busio.SPI(clock=${api.bpin(p.spi![0])}, MOSI=${api.bpin(p.spi![1])})\ntft_bus = FourWire(spi, command=${api.bpin(t.pins.dc)}, chip_select=${api.bpin(t.pins.cs)}, reset=${api.bpin(t.pins.rst)})\ntft = ST7789(tft_bus, width=240, height=240, rowstart=80)\ntft_text = label.Label(terminalio.FONT, text="${name.slice(0, 20)}", scale=2, x=8, y=16)\ntft.root_group = tft_text`);
  }
  const readDict = reads.length ? `readings = {${reads.map(r => `"${r.label}": ${r.expr}`).join(', ')}}` : 'readings = {}';
  const show = [...(oled ? ['oled.fill(0)', 'for row, (k, v) in enumerate(readings.items()):', '    oled.text(f"{k}: {v}", 0, row * 10, 1)', 'oled.show()'] : []), ...(tft && !py ? ['tft_text.text = "\\n".join(f"{k}: {v}" for k, v in readings.items()) or tft_text.text'] : []), ...(tft && py ? ['pen.rectangle((0, 0, 240, 240), fill=0)', 'for row, (k, v) in enumerate(readings.items()):', '    pen.text((8, 8 + row * 24), f"{k}: {v}", font=font, fill=(255, 255, 255))', 'tft.image(canvas)'] : [])];
  const code = [`# ${head('').trim()}`, py ? `# Raspberry Pi OS: enable I2C in raspi-config, then: pip install ${uniq(libList).map(l => `adafruit-circuitpython-${l.replace(/^adafruit_/, '').replace(/_/g, '-')}`).join(' ') || 'gpiozero'} --break-system-packages` : `# Copy to the CIRCUITPY drive as code.py. Libraries (circup install): ${uniq(libList).join(' ') || 'none'}`,
    ...top, '', ...pre, ...earlies, ...globs, ...setups, '', 'last_report = 0', 'while True:', ind(loops.join('\n'), 4), '    if time.monotonic() - last_report > 1:', '        last_report = time.monotonic()', ind([readDict, 'print(readings)', ...(cpWifi ? ['mqtt.publish(STATE_TOPIC, json.dumps(readings))'] : []), ...show].join('\n'), 8), `    time.sleep(${py ? '0.05' : '0.005'})`, ''].join('\n');
  return py
    ? { file: 'device.py', lang: 'python', code, about: 'Python service for Raspberry Pi OS (gpiozero + Blinka). Run it with python3; start it at boot with a systemd unit.', extra: [{ file: 'requirements.txt', code: ['gpiozero', 'adafruit-blinka', ...(tft ? ['pillow'] : []), ...uniq(libList).map(l => `adafruit-circuitpython-${l.replace(/^adafruit_/, '').replace(/_/g, '-')}`)].join('\n') + '\n' }] }
    : { file: 'code.py', lang: 'python', code, ...(cpWifi ? { extra: [{ file: 'settings.toml', code: 'CIRCUITPY_WIFI_SSID = ""\nCIRCUITPY_WIFI_PASSWORD = ""\nMQTT_BROKER = ""   # your Home Assistant / Mosquitto host\nMQTT_USER = ""\nMQTT_PASSWORD = ""  # a unique password per device\n' }] } : {}), about: `Install CircuitPython on the ${mcu.kind === 'esp32s3' ? 'ESP32-S3 (circuitpython.org web installer, board ESP32-S3-DevKitC-1)' : `${mcu.label} (hold BOOTSEL, plug in, drop the .uf2)`}, copy the libraries (${uniq(libList).join(', ') || 'none needed'}) into lib/, then save this as code.py.${oled ? ' The OLED text needs font5x8.bin in the root of CIRCUITPY (from the adafruit_framebuf examples).' : ''}` };
}
