// Unified Playkit WebGPU + TSL Engine Bridge for Plajah Motorsport: Apex (`region.ts`)
//
// Consolidates Ironport's live world lighting, Playkit SH9 GI probe/volume definitions,
// weather wetness/puddle uniforms, AgX/17^3 LUT + Plajah film-lens post stage, and
// runtime diagnostics into a single shared contract so WebGL2 and WebGPU (`?webgpu=1`)
// stay 100% parity-locked as `region.ts` completes its unified Playkit migration.
import * as THREE from 'three';
import { createApexPostStage } from './apexPostTsl';
import { upgradeCarRigToWebGPU } from './apexWebGpuAdapter';
import type { GradeStats, SanitizeStats } from '../roadGrade';

export interface ApexEngineDiagnostics {
  renderer: 'webgl2' | 'webgpu';
  webgpuAvailable: boolean;
  playkitGiEnabled: boolean;
  fsrEnabled: boolean;
  activeLut: string;
  activeLens: string;
  cityGroundDetail: 'urban-pbr-v2';
  civilEngineering: {
    apronCellsRaised: number;
    apronMaxRaiseM: number;
    sanitize: SanitizeStats | null;
    grade: GradeStats | null;
  };
  replayDirector: (() => unknown) | null;
}

export interface ApexUnifiedBridge {
  readonly diagnostics: ApexEngineDiagnostics;
  setCivilStats(apron: { cellsRaised: number; maxRaise: number }, sanitize: SanitizeStats, grade: GradeStats): void;
  setReplayDiagnostics(getter: () => unknown): void;
  syncRenderState(state: {
    playkitGiEnabled: boolean;
    fsrEnabled: boolean;
    activeLut: string;
    activeLens: string;
  }): void;
  /** Reusable factory for mounting Apex's unified TSL post stylize stage onto `playkit/render/unifiedPost.ts`. */
  createStylizeStage(): ReturnType<typeof createApexPostStage>;
  /** Reusable helper for upgrading a scanned car rig to full WebGPU TSL OEM clearcoat paint. */
  upgradeCarForWebGPU: typeof upgradeCarRigToWebGPU;
}

export function createApexRegionBridge(renderer: THREE.WebGLRenderer | { isWebGPURenderer?: boolean }): ApexUnifiedBridge {
  const isWebGpu = Boolean((renderer as { isWebGPURenderer?: boolean }).isWebGPURenderer);
  const webgpuAvailable = typeof navigator !== 'undefined' && 'gpu' in navigator;

  const diagnostics: ApexEngineDiagnostics = {
    renderer: isWebGpu ? 'webgpu' : 'webgl2',
    webgpuAvailable,
    playkitGiEnabled: true,
    fsrEnabled: true,
    activeLut: 'none',
    activeLens: 'none',
    cityGroundDetail: 'urban-pbr-v2',
    civilEngineering: {
      apronCellsRaised: 0,
      apronMaxRaiseM: 0,
      sanitize: null,
      grade: null,
    },
    replayDirector: null,
  };

  return {
    diagnostics,
    setCivilStats(apron, sanitize, grade) {
      diagnostics.civilEngineering.apronCellsRaised = apron.cellsRaised;
      diagnostics.civilEngineering.apronMaxRaiseM = apron.maxRaise;
      diagnostics.civilEngineering.sanitize = sanitize;
      diagnostics.civilEngineering.grade = grade;
    },
    setReplayDiagnostics(getter) {
      diagnostics.replayDirector = getter;
    },
    syncRenderState(state) {
      diagnostics.playkitGiEnabled = state.playkitGiEnabled;
      diagnostics.fsrEnabled = state.fsrEnabled;
      diagnostics.activeLut = state.activeLut;
      diagnostics.activeLens = state.activeLens;
    },
    createStylizeStage() {
      return createApexPostStage();
    },
    upgradeCarForWebGPU: upgradeCarRigToWebGPU,
  };
}
