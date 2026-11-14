import type { CadModel } from '../../../cad/model';
import {
  addSolidMesh,
  boxSolid,
  cylinderZ,
  finish,
  lerpHex,
  merge,
  newInstrumentCad,
  rodBetween,
  rotateZ,
  translate,
  type InstrumentViewSpec,
} from './cadUtils';
import { VOLTA } from '../volta/params';

export interface VoltaCadResult {
  model: CadModel;
  spec: InstrumentViewSpec;
}

const BLACK_PCS = new Set([1, 3, 6, 8, 10]);

export function buildVoltaCadModel(
  params: Record<number, number>,
  cutaway = false,
): VoltaCadResult {
  const morph = Math.max(0, Math.min(1, params[VOLTA.VINTAGE_MORPH] ?? 0.35));
  const fold = Math.max(0, Math.min(1, params[VOLTA.WAVEFOLD] ?? 0.15));
  const drive = Math.max(0, Math.min(1, params[VOLTA.LADDER_DRIVE] ?? 0.32));
  const diode = Math.max(0, Math.min(1, params[VOLTA.DIODE_CLIP] ?? 0.22));
  const temp = Math.max(0, Math.min(1, params[VOLTA.BIAS_TEMP] ?? 0.38));

  const m = newInstrumentCad('VOLTA Super-Synth');

  // Theme blends warm vintage walnut/amber ('74) <-> sleek anodized titanium/cyan ('26)
  const chassisHex = lerpHex('#1e2128', '#151c28', morph);
  const accentHex = lerpHex('#f59e0b', '#06b6d4', morph);
  const tubeHex = lerpHex('#ff7b1c', '#fbbf24', Math.min(1, temp * 0.6 + diode * 0.4));

  // Base floor + walnut wooden end cheeks
  addSolidMesh(m, 'chassis_base', 'Steel Bottom Chassis', boxSolid(0.78, 0.56, 0.024, 0, -0.08, 0), '#111419');
  addSolidMesh(m, 'cheek_left', 'Walnut Cheek Left', boxSolid(0.032, 0.56, 0.105, -0.395, -0.08, 0), '#5b331b');
  addSolidMesh(m, 'cheek_right', 'Walnut Cheek Right', boxSolid(0.032, 0.56, 0.105, 0.395, -0.08, 0), '#5b331b');

  // Keybed frame behind keys
  addSolidMesh(m, 'keybed_rail', 'Keybed Support', boxSolid(0.75, 0.18, 0.032, 0, -0.30, 0), '#161920');

  // Internal Analog Electronics Bay (visible prominently in Cutaway X-Ray mode!)
  addSolidMesh(m, 'pcb_main', 'Main Analog/DSP PCB', boxSolid(0.70, 0.34, 0.008, 0, -0.01, 0.028), '#14532d');
  // Copper Bus Traces
  addSolidMesh(m, 'pcb_traces', 'Copper Ground & Bias Bus', boxSolid(0.64, 0.016, 0.003, 0, 0.02, 0.036), '#d97706');
  // Toroidal PSU Transformer Coil
  const psu = translate(cylinderZ(0.055, 0.055, 0, 0.038, 24), -0.26, 0.06, 0.036);
  addSolidMesh(m, 'psu_coil', 'Toroidal Transformer', psu, '#b45309');
  // Three Decoupling Reservoir Electrolytic Capacitors
  for (let i = 0; i < 3; i++) {
    const cx = -0.15 + i * 0.052;
    const cap = translate(cylinderZ(0.016, 0.016, 0, 0.044, 16), cx, 0.07, 0.036);
    addSolidMesh(m, `psu_cap_${i}`, `PSU Capacitor ${i + 1}`, cap, '#1e3a8a');
    addSolidMesh(m, `psu_cap_top_${i}`, `Cap Vent`, translate(cylinderZ(0.014, 0.014, 0.044, 0.046, 16), cx, 0.07, 0.036), '#cbd5e1');
  }
  // Matched Discrete BJT Transistor Quad (4 ladder rungs)
  for (let i = 0; i < 4; i++) {
    addSolidMesh(
      m,
      `ladder_bjt_${i}`,
      `Matched NPN Quad ${i + 1}`,
      boxSolid(0.018, 0.018, 0.026, -0.01 + i * 0.032, 0.07, 0.036),
      '#27272a',
    );
  }
  // Two Glowing Subminiature Vacuum / BJT Saturation Tubes (`tube_*` animates emissive glow!)
  for (let i = 0; i < 2; i++) {
    const tx = 0.18 + i * 0.068;
    const glass = translate(cylinderZ(0.018, 0.015, 0, 0.055, 16), tx, 0.06, 0.036);
    addSolidMesh(m, `tube_${i}`, `Saturation Tube ${i + 1}`, glass, tubeHex, 0.88);
    const fil = rodBetween([tx, 0.06, 0.042], [tx, 0.06, 0.082], 0.004, 0.004, 8);
    addSolidMesh(m, `filament_${i}`, `Heater Filament`, fil, '#fef08a');
  }

  // Top Control Faceplate (`cutaway` makes it X-Ray translucent so PCB & glowing tubes show through!)
  addSolidMesh(
    m,
    'volta_faceplate',
    'Anodized Control Faceplate',
    boxSolid(0.76, 0.36, 0.012, 0, -0.01, 0.094),
    chassisHex,
    cutaway ? 0.24 : 1.0,
  );
  // Rear panel + 1/4" Brass TRS Audio Output Jack
  addSolidMesh(m, 'rear_panel', 'Rear Jack Apron', boxSolid(0.76, 0.016, 0.082, 0, 0.18, 0.018), '#13161d');
  const jack = translate(rotateZ(rodBetween([0.28, 0.17, 0.06], [0.28, 0.215, 0.06], 0.014, 0.014, 14), 0), 0, 0, 0);
  addSolidMesh(m, 'jack_out', '1/4" Audio Out Jack', jack, '#eab308');

  // Dual-Trace OLED Scope Screen Window
  addSolidMesh(m, 'oled_bezel', 'OLED Scope Bezel', boxSolid(0.18, 0.105, 0.014, -0.22, -0.02, 0.102), '#090b10');
  const scopeGlow = lerpHex('#0891b2', '#f59e0b', 1 - morph);
  addSolidMesh(m, 'oled_screen', 'OLED Scope Display', boxSolid(0.162, 0.086, 0.004, -0.22, -0.02, 0.114), scopeGlow, 0.92);

  // 8 Knurled Aluminum Rotary Knobs with live param pointer angles!
  const knobDefs: Array<[string, number, number, number]> = [
    ['Morph', -0.06, 0.06, morph],
    ['Mix', 0.04, 0.06, params[VOLTA.OSC_MIX] ?? 0.45],
    ['Fold', 0.14, 0.06, fold],
    ['TZ-FM', 0.24, 0.06, params[VOLTA.FM_TZ] ?? 0],
    ['Ladder', -0.06, -0.07, params[VOLTA.LADDER_CUTOFF] ?? 0.62],
    ['L-Res', 0.04, -0.07, params[VOLTA.LADDER_RES] ?? 0.24],
    ['SVF', 0.14, -0.07, params[VOLTA.SVF_CUTOFF] ?? 0.74],
    ['Diode', 0.24, -0.07, Math.max(drive, diode)],
  ];
  knobDefs.forEach(([label, kx, ky, val], idx) => {
    const ang = (0.5 - val) * Math.PI * 1.45;
    const cap = cylinderZ(0.021, 0.019, 0, 0.024, 18);
    const ptr = rotateZ(boxSolid(0.005, 0.016, 0.004, 0, 0.01, 0.024), ang);
    const kSolid = translate(merge(cap, ptr), kx, ky, 0.106);
    addSolidMesh(m, `knob_${idx}`, `${label} Knob`, kSolid, idx === 0 ? accentHex : '#3f4654');
  });

  // 4 Glowing Circuit-Stage Pilot LEDs (`led_*` animates emissive glow)
  for (let i = 0; i < 4; i++) {
    const lx = -0.27 + i * 0.038;
    addSolidMesh(
      m,
      `led_${i}`,
      `Stage LED ${i + 1}`,
      translate(cylinderZ(0.006, 0.006, 0, 0.008, 12), lx, -0.11, 0.106),
      i < 2 ? '#22d3ee' : '#f59e0b',
    );
  }

  // Articulated 14-Key Front Mini-Keybed (`pkey_0..13` aligned to performanceKinematics!)
  for (let i = 0; i < 14; i++) {
    const kx = -0.325 + i * 0.05;
    const pc = i % 12;
    const isBlack = BLACK_PCS.has(pc);
    addSolidMesh(
      m,
      `pkey_${i}`,
      `Key ${i + 1}`,
      boxSolid(isBlack ? 0.028 : 0.044, isBlack ? 0.105 : 0.165, isBlack ? 0.022 : 0.016, kx, isBlack ? -0.27 : -0.30, isBlack ? 0.052 : 0.040),
      isBlack ? '#18181b' : '#f1f5f9',
    );
  }

  finish(m);

  return {
    model: m,
    spec: {
      family: 'volta',
      cameraPos: [0.58, -0.92, 0.68],
      target: [0, -0.10, 0.05],
      accentHex,
      subtitle: cutaway
        ? 'X-Ray Cutaway • PCB, Toroid & BJT Ladder Exposed'
        : 'Hardware Chassis • Discrete Ladder ↔ Cytomic SVF',
    },
  };
}
