// Display and sensor blocks: I²C OLED, SPI TFT, temperature/humidity (BME280), motion (MPU-6050),
// light (BH1750), distance (VL53L0X or HC-SR04 with a divider), soil moisture, PIR.
// Displays show whatever the sensors report (firmware.ts draws the screen).
// Released by Plajah as public domain (CC0).
import type { BlockDef } from './block';
import { n, sid } from './block';
import type { FwApi, Inst } from './types';

const i2cDraw = (kind: string, vcc = 'VCC') => (i: Inst, d: Parameters<BlockDef['draw']>[1]) => {
  const u = d.part(kind, 0, 0, 0, i.addr ? { addr: i.addr } : {}); d.net('LOGIC', [u, kind === 'sensor' ? 'VIN' : vcc]); d.net('GND', [u, 'GND']); d.net('@sda', [u, 'SDA']); d.net('@scl', [u, 'SCL']);
  if (kind === 'tof' && i.pins.xshut) d.net('@xshut', [u, 'XSHUT']);
};
const addrNote = (i: Inst, deflt: string, how: string) => (i.addr && i.addr !== deflt ? [`${i.label}: set address ${i.addr} by ${how}.`] : []);

export const oled: BlockDef = {
  id: 'oled', label: 'OLED display', plural: 'OLED displays', about: '0.96" 128 × 64 I²C OLED showing the sensor readings.', max: 2, bus: 'i2c', addrs: ['0x3C', '0x3D'],
  words: /\b(oled|screen|display|readout)\b/i, needsMcu: () => true,
  pins: () => [], loads: () => [{ rail: 'logic', typ: 0.02, peak: 0.03, what: 'OLED' }], draw: i2cDraw('oled'),
  fw: (i, f) => f.screen('oled', sid(i), i.addr ?? '0x3C'),
  notes: i => addrNote(i, '0x3C', 'moving the address resistor on the back'),
};
export const tft: BlockDef = {
  id: 'tft', label: 'Colour TFT display', plural: 'TFT displays', about: '1.3" 240 × 240 IPS on SPI (ST7789), 3.3 V.', max: 1, bus: 'spi',
  words: /\b(tft|lcd|colou?r (screen|display)|ips|st7789)\b/i, needsMcu: () => true,
  notOn: { nano: 'the ST7789 is a 3.3 V part and the Nano drives 5 V logic (use the OLED, or an ESP32/Pico)', rpi: 'this Pi symbol does not expose the SPI pins (use the OLED, or HDMI)' },
  pins: () => [{ role: 'cs', cap: 'gpio', label: 'TFT CS' }, { role: 'dc', cap: 'gpio', label: 'TFT DC' }, { role: 'rst', cap: 'gpio', label: 'TFT reset' }],
  loads: () => [{ rail: 'logic', typ: 0.07, peak: 0.08, what: 'TFT + backlight' }],
  draw(i, d) { const u = d.part('tft', 0, 0); d.net('LOGIC', [u, 'VCC'], [u, 'BL']); d.net('GND', [u, 'GND']); d.net('@sck', [u, 'SCK']); d.net('@mosi', [u, 'MOSI']); d.net('@cs', [u, 'CS']); d.net('@dc', [u, 'DC']); d.net('@rst', [u, 'RST']); },
  fw: (i, f) => f.screen('tft', sid(i), ''),
};

export const temp: BlockDef = {
  id: 'temp', label: 'Temperature / humidity sensor', plural: 'temperature sensors', about: 'BME280: temperature, humidity and pressure on I²C.', max: 2, bus: 'i2c', addrs: ['0x76', '0x77'],
  words: /\b(temperature|thermometer|humidity|hygrometer|weather|barometer|pressure|bme280|climate)\b/i, needsMcu: () => true,
  pins: () => [], loads: () => [{ rail: 'logic', typ: 0.001, peak: 0.002, what: 'BME280' }], draw: i2cDraw('sensor'),
  fw(i, f) {
    const v = sid(i); const a = i.addr ?? '0x76';
    if (f.fw === 'esphome') { f.esp('sensor', `- platform: bme280_i2c\n  address: ${a}\n  update_interval: 30s\n  temperature:\n    name: "Temperature${i.k ? ` ${n(i)}` : ''}"\n    id: ${v}_t\n  humidity:\n    name: "Humidity${i.k ? ` ${n(i)}` : ''}"\n    id: ${v}_h\n  pressure:\n    name: "Pressure${i.k ? ` ${n(i)}` : ''}"`); f.read('Temp', `${v}_t`, '°C'); f.read('Hum', `${v}_h`, '%'); return; }
    if (f.fw === 'arduino') { f.imp('#include <Adafruit_BME280.h>'); f.lib('Adafruit BME280'); f.glob(`Adafruit_BME280 ${v};`); f.setup(`${v}.begin(${a});`); f.read('Temp', `${v}.readTemperature()`, 'C'); f.read('Hum', `${v}.readHumidity()`, '%'); return; }
    f.imp('import adafruit_bme280.basic as bme280_lib'); f.lib('adafruit_bme280'); f.setup(`${v} = bme280_lib.Adafruit_BME280_I2C(i2c, address=${a})`); f.read('Temp', `${v}.temperature`, 'C'); f.read('Hum', `${v}.relative_humidity`, '%');
  },
  notes: i => [...addrNote(i, '0x76', 'bridging the SDO pad to 3.3 V'), ...(i.k === 0 ? ['Mount the sensor at a vent, away from the board and regulators: their warmth reads as +1-2 °C.'] : [])],
};
export const imu: BlockDef = {
  id: 'imu', label: 'Motion sensor (IMU)', plural: 'motion sensors', about: 'MPU-6050 accelerometer + gyro on I²C: tilt, shake, steps.', max: 2, bus: 'i2c', addrs: ['0x68', '0x69'],
  words: /\b(imu|accelerometer|gyro(scope)?|tilt (sensor|alarm|switch|detect\w*)|orientation|shake|step counter|pedometer|mpu-?6050)\b/i, needsMcu: () => true,
  pins: () => [], loads: () => [{ rail: 'logic', typ: 0.004, peak: 0.005, what: 'MPU-6050' }], draw: i2cDraw('imu'),
  fw(i, f) {
    const v = sid(i); const a = i.addr ?? '0x68';
    if (f.fw === 'esphome') { f.esp('sensor', `- platform: mpu6050\n  address: ${a}\n  update_interval: 1s\n  accel_x:\n    name: "Accel X"\n    id: ${v}_ax\n  accel_y:\n    name: "Accel Y"\n  accel_z:\n    name: "Accel Z"`); f.read('Ax', `${v}_ax`, 'm/s2'); return; }
    if (f.fw === 'arduino') { f.imp('#include <Adafruit_MPU6050.h>'); f.lib('Adafruit MPU6050'); f.glob(`Adafruit_MPU6050 ${v};\nfloat ${v}_ax() { sensors_event_t a, g, t; ${v}.getEvent(&a, &g, &t); return a.acceleration.x; }`); f.setup(`${v}.begin(${a});`); f.read('Ax', `${v}_ax()`, 'm/s2'); return; }
    f.imp('import adafruit_mpu6050'); f.lib('adafruit_mpu6050'); f.setup(`${v} = adafruit_mpu6050.MPU6050(i2c, address=${a})`); f.read('Ax', `${v}.acceleration[0]`, 'm/s2');
  },
  notes: i => addrNote(i, '0x68', 'tying AD0 to 3.3 V'),
};
export const light: BlockDef = {
  id: 'light', label: 'Light sensor', plural: 'light sensors', about: 'BH1750 ambient light in lux on I²C.', max: 2, bus: 'i2c', addrs: ['0x23', '0x5C'],
  words: /\b(light sensor|lux|ambient light|brightness sensor|daylight|photo ?(cell|resistor)|ldr|dusk|dawn)\b/i, needsMcu: () => true,
  pins: () => [], loads: () => [{ rail: 'logic', typ: 0.001, peak: 0.001, what: 'BH1750' }], draw: i2cDraw('lux'),
  fw(i, f) {
    const v = sid(i); const a = i.addr ?? '0x23';
    if (f.fw === 'esphome') { f.esp('sensor', `- platform: bh1750\n  address: ${a}\n  name: "Light${i.k ? ` ${n(i)}` : ''}"\n  id: ${v}\n  update_interval: 10s`); f.read('Light', v, 'lx'); return; }
    if (f.fw === 'arduino') { f.imp('#include <BH1750.h>'); f.lib('BH1750 (claws)'); f.glob(`BH1750 ${v}(${a});`); f.setup(`${v}.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, ${a}, &Wire);`); f.read('Light', `${v}.readLightLevel()`, 'lx'); return; }
    f.imp('import adafruit_bh1750'); f.lib('adafruit_bh1750'); f.setup(`${v} = adafruit_bh1750.BH1750(i2c, address=${a})`); f.read('Light', `${v}.lux`, 'lx');
  },
  notes: i => addrNote(i, '0x23', 'tying ADDR to 3.3 V'),
};

export const distance: BlockDef = {
  id: 'distance', label: 'Distance sensor', plural: 'distance sensors', about: 'Laser time-of-flight (VL53L0X, I²C) by default; ultrasonic HC-SR04 on request, with a divider on its 5 V echo for 3.3 V boards. Several ToF sensors share the bus via their XSHUT pins.', max: 4, addrs: ['0x29', '0x30', '0x31', '0x32'],
  words: /\b(distance|range ?finder|proximity|ultrasonic|sonar|hc-?sr04|time[- ]of[- ]flight|tof|parking (sensor|assist)|level sensor)\b/i,
  opts: [{ key: 'kind', label: 'Sensor', choices: ['tof', 'ultrasonic'], default: 'tof' }], needsMcu: () => true, bus: o => (o.kind === 'ultrasonic' ? undefined : 'i2c'),
  pins: i => (i.opt.kind === 'ultrasonic' ? [{ role: 'trig', cap: 'gpio', label: `Sonar ${n(i)} trigger` }, { role: 'echo', cap: 'in', label: `Sonar ${n(i)} echo` }] : (i.of ?? 1) > 1 ? [{ role: 'xshut', cap: 'gpio', label: `ToF ${n(i)} XSHUT`, exp: true }] : []),
  loads: i => (i.opt.kind === 'ultrasonic' ? [{ rail: 'v5', typ: 0.015, peak: 0.015, what: 'HC-SR04' }] : [{ rail: 'logic', typ: 0.02, peak: 0.03, what: 'VL53L0X' }]),
  draw(i, d) {
    if (i.opt.kind !== 'ultrasonic') { i2cDraw('tof')(i, d); if (i.pins.xshut) { /* re-addressed at boot */ } return; }
    const u = d.part('sonar', 12, 0); d.net('V5', [u, 'VCC']); d.net('GND', [u, 'GND']); d.net('@trig', [u, 'TRIG']);
    if (i.logicV < 4) { const r1 = d.part('resistor', 2, 2, 0, { R: '1k' }); const r2 = d.part('resistor', -2, 6, 1, { R: '1.8k' }); d.net('echo5', [u, 'ECHO'], [r1, '2']); d.net('@echo', [r1, '1'], [r2, '1']); d.net('GND', [r2, '2']); }
    else d.net('@echo', [u, 'ECHO']);
  },
  fw(i, f) {
    const v = sid(i);
    if (i.opt.kind === 'ultrasonic') {
      const { trig, echo } = i.pins;
      if (f.fw === 'esphome') { f.esp('sensor', `- platform: ultrasonic\n  trigger_pin: ${f.pin(trig)}\n  echo_pin: ${f.pin(echo)}\n  name: "Distance"\n  id: ${v}\n  update_interval: 1s`); f.read('Dist', v, 'm'); return; }
      if (f.fw === 'python') { f.imp('from gpiozero import DistanceSensor'); f.setup(`${v} = DistanceSensor(echo=${f.pin(echo)}, trigger=${f.pin(trig)})`); f.read('Dist', `round(${v}.distance * 100)`, 'cm'); return; }
      if (f.fw === 'arduino') { f.glob(`float ${v}_cm() { digitalWrite(${f.pin(trig)}, HIGH); delayMicroseconds(10); digitalWrite(${f.pin(trig)}, LOW); return pulseIn(${f.pin(echo)}, HIGH, 30000) / 58.0; }`); f.setup(`pinMode(${f.pin(trig)}, OUTPUT);\n  pinMode(${f.pin(echo)}, INPUT);`); f.read('Dist', `${v}_cm()`, 'cm'); return; }
      f.imp('import adafruit_hcsr04'); f.lib('adafruit_hcsr04'); f.setup(`${v} = adafruit_hcsr04.HCSR04(trigger_pin=${f.pin(trig)}, echo_pin=${f.pin(echo)})`); f.glob(`def ${v}_cm():\n    try:\n        return round(${v}.distance)\n    except RuntimeError:  # no echo (nothing in range)\n        return -1`); f.read('Dist', `${v}_cm()`, 'cm'); return;
    }
    const x = i.pins.xshut; const addr = i.addr ?? '0x29'; const lbl = `Dist${i.k ? n(i) : ''}`;
    if (f.fw === 'esphome') { f.esp('sensor', `- platform: vl53l0x\n  address: ${addr}\n${x ? `${f.espPin(x).replace('  pin:', '  enable_pin:')}\n` : ''}  name: "Distance${i.k ? ` ${n(i)}` : ''}"\n  id: ${v}\n  update_interval: 500ms`); f.read(lbl, v, 'm'); return; }
    if (f.fw === 'arduino') {
      f.imp('#include <Adafruit_VL53L0X.h>'); f.lib('Adafruit_VL53L0X'); f.glob(`Adafruit_VL53L0X ${v};\nint ${v}_mm() { VL53L0X_RangingMeasurementData_t m; ${v}.rangingTest(&m, false); return m.RangeStatus != 4 ? m.RangeMilliMeter : -1; }`);
      if (x) { const a = f.ard(x); f.early(`${a.mode('OUTPUT')} ${a.write('LOW')}  // hold ToF ${n(i)} in reset`); f.setup(`${a.write('HIGH')} delay(10);  // wake ToF ${n(i)} alone, then give it ${addr}\n${v}.begin(${addr});`); } else f.setup(`${v}.begin();`);
      f.read(lbl, `${v}_mm()`, 'mm'); return;
    }
    f.imp('import adafruit_vl53l0x'); f.lib('adafruit_vl53l0x');
    if (x) { f.imp('import digitalio'); f.early(`${v}_x =${f.dio(x)}\n${v}_x.switch_to_output(value=False)  # all ToF sensors held in reset first`); f.setup(`${v}_x.value = True  # wake this one alone and move it off 0x29\ntime.sleep(0.01)\n${v} = adafruit_vl53l0x.VL53L0X(i2c)\n${v}.set_address(${addr})`); }
    else f.setup(`${v} = adafruit_vl53l0x.VL53L0X(i2c)`);
    f.read(lbl, `${v}.range`, 'mm');
  },
  notes: i => (i.opt.kind === 'ultrasonic' && i.logicV < 4 ? ['HC-SR04 echo is 5 V: the 1k / 1.8k divider brings it to about 3.2 V for the 3.3 V board.'] : []),
};

const soilExpr = (f: FwApi, raw: string) => (f.fw === 'arduino' ? `constrain(map(${raw}, 614, 245, 0, 100), 0, 100)` : `max(0, min(100, round((51600 - ${raw}) / 298)))`);
export const soil: BlockDef = {
  id: 'soil', label: 'Soil moisture probe', plural: 'soil probes', about: 'Capacitive soil probe on an analog input (powered from the logic rail so its output stays in range).', max: 8,
  words: /\b(soil|moisture|plant|garden|watering|irrigation)\b/i, needsMcu: () => true,
  pins: i => [{ role: 'adc', cap: 'adc', label: `Soil ${n(i)}` }], loads: () => [{ rail: 'logic', typ: 0.005, peak: 0.006, what: 'soil probe' }],
  draw(i, d) { const u = d.part('soil', 0, 0); d.net('LOGIC', [u, 'VCC']); d.net('GND', [u, 'GND']); d.net('@adc', [u, 'AOUT']); },
  fw(i, f) {
    const v = sid(i); const a = f.ads(i.pins.adc);
    if (f.fw === 'esphome') {
      const src = a ? `- platform: ads1115\n  ads1115_id: ads${a.idx}\n  multiplexer: 'A${a.ch}_GND'\n  gain: 4.096` : `- platform: adc\n  pin: ${f.pin(i.pins.adc)}\n  attenuation: 12db`;
      f.esp('sensor', `${src}\n  name: "Soil moisture${i.k ? ` ${n(i)}` : ''}"\n  id: ${v}\n  unit_of_measurement: "%"\n  update_interval: 60s\n  filters:\n    - calibrate_linear:  # measure your probe dry in air and in a glass of water\n        - 2.6 -> 0\n        - 1.1 -> 100\n    - clamp:\n        min_value: 0\n        max_value: 100`); f.read('Soil', v, '%'); return;
    }
    if (f.fw === 'arduino') { f.read(`Soil${i.k ? n(i) : ''}`, a ? `constrain(map(ads${a.idx}.readADC_SingleEnded(${a.ch}), 20800, 8300, 0, 100), 0, 100)` : soilExpr(f, `analogRead(${f.pin(i.pins.adc)})`), '%'); return; }
    if (a) { f.imp('from adafruit_ads1x15.analog_in import AnalogIn as AdsIn', 'import adafruit_ads1x15.ads1115 as ADS'); f.setup(`${v} = AdsIn(ads${a.idx}, ADS.P${a.ch})`); } else { f.imp('import analogio'); f.setup(`${v} = analogio.AnalogIn(${f.pin(i.pins.adc)})`); }
    f.read(`Soil${i.k ? n(i) : ''}`, soilExpr(f, `${v}.value`), '%');
  },
  notes: i => (i.k === 0 ? ['Calibrate: read the probe dry (in air) and in water, then put those two numbers in the firmware mapping.'] : []),
  extras: () => [['1', '3-core cable + connector', 'soil probe lead']],
};
export const motion: BlockDef = {
  id: 'motion', label: 'Motion detector (PIR)', plural: 'motion detectors', about: 'HC-SR501 PIR on 5 V; its output is 3.3 V, safe for any board.', max: 2,
  words: /\b(pir|motion (sensor|detector|activated|sensing)|occupancy|presence|someone walks|intruder)\b/i, needsMcu: () => true,
  pins: i => [{ role: 'in', cap: 'in', label: `PIR ${n(i)}`, exp: true }], loads: () => [{ rail: 'v5', typ: 0.0001, peak: 0.0002, what: 'PIR' }],
  draw(i, d) { const u = d.part('pir', 0, 0); d.net('V5', [u, 'VCC']); d.net('GND', [u, 'GND']); d.net('@in', [u, 'OUT']); },
  fw(i, f) {
    const v = sid(i); const p = i.pins.in;
    if (f.fw === 'esphome') { f.esp('binary_sensor', `- platform: gpio\n${f.espPin(p, { input: true })}\n  name: "Motion${i.k ? ` ${n(i)}` : ''}"\n  device_class: motion`); return; }
    if (f.fw === 'python' && !f.isExp(p)) { f.imp('from gpiozero import MotionSensor'); f.setup(`${v} = MotionSensor(${f.pin(p)})`); f.read('Motion', `int(${v}.motion_detected)`, ''); return; }
    if (f.fw === 'arduino') { const a = f.ard(p); f.setup(a.mode('INPUT')); f.read('Motion', a.read, ''); return; }
    f.imp('import digitalio'); f.setup(`${v} = ${f.dio(p)}\n${v}.switch_to_input()`); f.read('Motion', `int(${v}.value)`, '');
  },
};

export const SENSORS = [oled, tft, temp, imu, light, distance, soil, motion];
