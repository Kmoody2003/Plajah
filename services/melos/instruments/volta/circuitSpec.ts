import { OPEN_BUILD_EVENT, PENDING_BUILD_KEY, type BuildLaunch } from '../../../build/launch';
import { netlist, type Circuit } from '../../../elec/circuit';
import { checkCircuit, summarize, type Finding } from '../../../elec/checks';
import { voltaSynthDesign, type Design } from '../../../elec/designs';
import { designEnclosure, PHYSICAL, type Enclosure, type Item } from '../../../elec/enclosure';
import { simulate, type SimResult } from '../../../elec/sim';
import { sourceLines, type SourceLine } from '../../../supply/sourcing';
import { VOLTA } from './params';
import type { VoltaPatch } from './patch';

export const VOLTA_PENDING_CIRCUIT_KEY = 'plajah:voltaPendingCircuit';

export interface VoltaNodeProbe {
  index: number;
  id: string;
  label: string;
  partRef: string;
  pinName: string;
  nominalV: string;
  description: string;
}

export const VOLTA_NODE_PROBES: VoltaNodeProbe[] = [
  {
    index: 0,
    id: 'vco',
    label: 'VCO Core',
    partRef: 'V1',
    pinName: '+',
    nominalV: '±1.0 Vpp AC',
    description: 'Dual PolyBLEP / Super-Analog VCO + Sub + thermal shot noise summing node before nonlinear shaping.',
  },
  {
    index: 1,
    id: 'wavefold',
    label: 'Wavefolder / Q1 Bias',
    partRef: 'Q1',
    pinName: 'C',
    nominalV: '2.5 V DC ± 1.8 V',
    description: 'Class-A 2N3904 differential gain & 2x oversampled Buchla/Serge sine-tanh wavefolder node.',
  },
  {
    index: 2,
    id: 'ladder',
    label: '24dB BJT Ladder',
    partRef: 'C5',
    pinName: '1',
    nominalV: '0–1.6 Vpp',
    description: '4-stage discrete transistor differential-pair ladder filter capacitor node (tanh(v / 2*Vt)).',
  },
  {
    index: 3,
    id: 'svf',
    label: 'Cytomic ZDF SVF',
    partRef: 'RV2',
    pinName: 'W',
    nominalV: '0–1.5 Vpp',
    description: 'Modern zero-delay-feedback state-variable filter wiper/morph node (LP ↔ BP ↔ HP ↔ Notch).',
  },
  {
    index: 4,
    id: 'diode',
    label: 'Shockley Diode / Out',
    partRef: 'D2',
    pinName: 'A',
    nominalV: '±0.68 V Clamp',
    description: 'Asymmetric 1N4148 silicon/germanium BJT soft-clipping output bus feeding the ¼" TRS jack.',
  },
  {
    index: 5,
    id: 'rail',
    label: '12V→5V PSU Rail',
    partRef: 'U1',
    pinName: 'OUT',
    nominalV: '+5.00 V / +12 V',
    description: 'L7805 regulated analog supply bus + simulated reservoir decoupling rail sag under polyphonic draw.',
  },
  {
    index: 6,
    id: 'temp',
    label: 'Thermal Vt Bias',
    partRef: 'RV1',
    pinName: 'W',
    nominalV: '25.85 mV @ 27°C',
    description: 'Transistor thermal voltage Vt & matched-pair OTA capacitor temperature equilibrium.',
  },
];

export function buildVoltaCircuitDesign(patch?: VoltaPatch): Design {
  const ladderPos = patch?.params[VOLTA.LADDER_CUTOFF] ?? 0.62;
  const diodeAmt = patch?.params[VOLTA.DIODE_CLIP] ?? 0.35;
  const wavefoldAmt = patch?.params[VOLTA.WAVEFOLD] ?? 0.15;
  const clipPos = Math.max(0.15, Math.min(0.95, 0.25 + diodeAmt * 0.55 + wavefoldAmt * 0.2));
  const label = patch?.name ? `VOLTA — ${patch.name}` : 'VOLTA Super-Synth Core';
  return voltaSynthDesign({ ladderPos, clipPos, vcoFreqHz: 220, name: label });
}

export interface VoltaCircuitAnalysis {
  design: Design;
  simDc: SimResult;
  simTran: SimResult;
  findings: Finding[];
  summary: { errors: number; warnings: number; passes: number; nets: number };
  bom: SourceLine[];
  enclosure: Enclosure;
  nodeDcVoltages: Record<string, number>;
  nodeTranPeaks: Record<string, number>;
}

export function analyzeVoltaCircuit(patch?: VoltaPatch): VoltaCircuitAnalysis {
  const design = buildVoltaCircuitDesign(patch);
  const simDc = simulate(design.circuit, { mode: 'dc' });
  const simTran = simulate(design.circuit, design.sim);
  const findings = checkCircuit(design.circuit, simTran);
  const nl = netlist(design.circuit);
  const bom = sourceLines(design.circuit);

  // Build real enclosure from every physical BOM component (pots, jack, caps, L7805, PCB, LED)
  const items: Item[] = design.circuit.parts
    .map((p): Item | null => {
      const fn = PHYSICAL[p.kind];
      return fn ? { ...fn(p.params ?? {}), name: p.value || p.kind, ref: p.ref } : null;
    })
    .filter((x): x is Item => !!x);
  const enclosure = designEnclosure(items, {
    name: 'volta-super-synth-enclosure',
    minInterior: [165, 115, 38],
  });

  const nodeDcVoltages: Record<string, number> = {};
  const nodeTranPeaks: Record<string, number> = {};
  for (const pr of VOLTA_NODE_PROBES) {
    const part = design.circuit.parts.find((p) => p.ref === pr.partRef);
    const netIdx = part ? nl.pinNet[part.id]?.[pr.pinName] : undefined;
    if (netIdx !== undefined && netIdx > 0) {
      const dcArr = simDc.nets[netIdx];
      const trArr = simTran.nets[netIdx];
      nodeDcVoltages[pr.id] = dcArr && dcArr.length ? dcArr[dcArr.length - 1] : 0;
      nodeTranPeaks[pr.id] = trArr && trArr.length
        ? trArr.reduce((m, x) => Math.max(m, Math.abs(x)), 0)
        : 0;
    } else {
      nodeDcVoltages[pr.id] = 0;
      nodeTranPeaks[pr.id] = 0;
    }
  }

  return {
    design,
    simDc,
    simTran,
    findings,
    summary: { ...summarize(findings), nets: nl.netCount },
    bom,
    enclosure,
    nodeDcVoltages,
    nodeTranPeaks,
  };
}

export interface VoltaBuilderLaunchResult {
  launch: BuildLaunch;
  circuit: Circuit;
}

/**
 * Hand off the active VOLTA Super-Synth circuit + preset tuning straight into Plajah Builder
 * (Electronics Lab) with BOM sourcing, DRC/ERC safety checks, PCB auto-router & 3D enclosure.
 */
export function launchVoltaInPlajahBuilder(patch?: VoltaPatch): VoltaBuilderLaunchResult {
  const design = buildVoltaCircuitDesign(patch);
  const detail: BuildLaunch = {
    room: 'elec',
    starter: 'volta-super-synth',
    prompt: patch
      ? `Build physical hardware for VOLTA patch "${patch.name}" (Ladder cutoff ${Math.round((patch.params[VOLTA.LADDER_CUTOFF] ?? 0.62) * 100)}%, Diode drive ${Math.round((patch.params[VOLTA.DIODE_CLIP] ?? 0.22) * 100)}%).`
      : 'Build VOLTA Super-Synth analog hardware core (12V->5V regulator, Class-A 2N3904 preamp, tunable ladder filter, 1N4148 Shockley diode clipper, 1/4" jack).',
  };
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(VOLTA_PENDING_CIRCUIT_KEY, JSON.stringify(design.circuit));
      sessionStorage.setItem(PENDING_BUILD_KEY, JSON.stringify(detail));
    } catch {
      /* ignore private-mode quota error; custom event still carries launch */
    }
    window.dispatchEvent(new CustomEvent(OPEN_BUILD_EVENT, { detail }));
  }
  return { launch: detail, circuit: design.circuit };
}
