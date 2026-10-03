/**
 * services/home/distributedComputeService.ts
 *
 * Distributed Compute & Render Mesh for Plajah Home and Fabula.
 *
 * Pools the computational power of all signed-in devices across the local network
 * (desktops with dedicated GPUs, repurposed Xbox One consoles, laptops, and tablets)
 * to perform:
 *  1. Distributed Video & 3D Network Rendering for Fabula (frame chunking & parallel stitching).
 *  2. Distributed AI Model Generation & Local Inference (tile splitting, batch prompt distribution).
 *
 * Automatically balances workloads based on device hardware tier and thermal headroom.
 */

export interface ComputeWorkerNode {
  id: string;
  name: string;
  deviceType: 'desktop' | 'console' | 'laptop' | 'server';
  hardwareTier: 'ultra' | 'high' | 'medium' | 'low';
  computeDeviceName: string; // e.g., "NVIDIA GeForce RTX 4090", "Xbox One Custom APU (1.31 TFLOPS)"
  computePowerTflops: number;
  availableRamGb: number;
  isAvailable: boolean;
  status: 'idle' | 'rendering' | 'syncing' | 'completed' | 'offline';
  currentJobId?: string;
  currentChunkRange?: [number, number];
  utilizationPercent: number;
  temperatureC: number;
  fpsRenderRate: number;
}

export type DistributedWorkloadType = 'fabula-video-render' | 'fabula-3d-sequence' | 'ai-model-generation';

export interface WorkloadChunk {
  chunkIndex: number;
  startFrame: number;
  endFrame: number;
  assignedWorkerId: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  progressPercent: number;
  resultAssetPath?: string;
}

export interface DistributedJob {
  id: string;
  title: string;
  type: DistributedWorkloadType;
  totalFrames: number;
  completedFrames: number;
  overallProgressPercent: number;
  chunks: WorkloadChunk[];
  activeWorkersCount: number;
  status: 'queued' | 'running' | 'assembling' | 'finished' | 'paused';
  startedAt: number;
  estimatedCompletionSeconds: number;
  outputResolution: string;
  targetFormat: string;
}

// ==========================================
// MOCK COMPUTE NODES & ACTIVE JOBS
// ==========================================

const INITIAL_WORKERS: ComputeWorkerNode[] = [
  {
    id: 'worker-studio-rtx',
    name: "Kenny's Studio Rig",
    deviceType: 'desktop',
    hardwareTier: 'ultra',
    computeDeviceName: 'NVIDIA GeForce RTX 4090 (24GB VRAM)',
    computePowerTflops: 82.6,
    availableRamGb: 64,
    isAvailable: true,
    status: 'rendering',
    currentJobId: 'job-fabula-01',
    currentChunkRange: [1, 180],
    utilizationPercent: 88,
    temperatureC: 64,
    fpsRenderRate: 48.2
  },
  {
    id: 'worker-xbox-rig',
    name: 'Living Room Xbox One Hub',
    deviceType: 'console',
    hardwareTier: 'medium',
    computeDeviceName: 'AMD Custom GCN APU (Repurposed Compute Node)',
    computePowerTflops: 1.31,
    availableRamGb: 8,
    isAvailable: true,
    status: 'rendering',
    currentJobId: 'job-fabula-01',
    currentChunkRange: [181, 240],
    utilizationPercent: 74,
    temperatureC: 58,
    fpsRenderRate: 14.5
  },
  {
    id: 'worker-laptop-rig',
    name: "Kenny's Mobile Laptop",
    deviceType: 'laptop',
    hardwareTier: 'medium',
    computeDeviceName: 'Intel Iris Xe + Neural Accelerator',
    computePowerTflops: 2.1,
    availableRamGb: 16,
    isAvailable: true,
    status: 'rendering',
    currentJobId: 'job-fabula-01',
    currentChunkRange: [241, 300],
    utilizationPercent: 62,
    temperatureC: 52,
    fpsRenderRate: 18.0
  }
];

class DistributedComputeService {
  private workers: ComputeWorkerNode[] = INITIAL_WORKERS;
  private currentJob: DistributedJob = {
    id: 'job-fabula-01',
    title: 'Fabula Project: Cyberpunk Neo-Tokyo Intro (4K ProRes 422)',
    type: 'fabula-video-render',
    totalFrames: 300,
    completedFrames: 214,
    overallProgressPercent: 71,
    activeWorkersCount: 3,
    status: 'running',
    startedAt: Date.now() - 32000,
    estimatedCompletionSeconds: 14,
    outputResolution: '3840x2160 (4K UHD)',
    targetFormat: 'Apple ProRes 422 HQ / Lossless Opus Audio',
    chunks: [
      { chunkIndex: 1, startFrame: 1, endFrame: 180, assignedWorkerId: 'worker-studio-rtx', status: 'in-progress', progressPercent: 84 },
      { chunkIndex: 2, startFrame: 181, endFrame: 240, assignedWorkerId: 'worker-xbox-rig', status: 'in-progress', progressPercent: 62 },
      { chunkIndex: 3, startFrame: 241, endFrame: 300, assignedWorkerId: 'worker-laptop-rig', status: 'in-progress', progressPercent: 55 }
    ]
  };

  /**
   * Get all registered compute workers on the local network
   */
  public getWorkers(): ComputeWorkerNode[] {
    return [...this.workers];
  }

  /**
   * Get active distributed job status
   */
  public getActiveJob(): DistributedJob {
    return { ...this.currentJob };
  }

  /**
   * Calculate aggregate cluster compute power
   */
  public getClusterTelemetry(): { totalTflops: number; onlineWorkers: number; totalFps: number } {
    const totalTflops = this.workers.reduce((acc, w) => acc + (w.isAvailable ? w.computePowerTflops : 0), 0);
    const onlineWorkers = this.workers.filter((w) => w.isAvailable).length;
    const totalFps = this.workers.reduce((acc, w) => acc + (w.status === 'rendering' ? w.fpsRenderRate : 0), 0);
    return {
      totalTflops: Math.round(totalTflops * 10) / 10,
      onlineWorkers,
      totalFps: Math.round(totalFps * 10) / 10
    };
  }

  /**
   * Dispatch a new distributed rendering or model generation job
   */
  public dispatchJob(
    title: string,
    type: DistributedWorkloadType,
    totalFrames: number = 300
  ): DistributedJob {
    const activeWorkers = this.workers.filter((w) => w.isAvailable);
    const workerCount = activeWorkers.length || 1;

    // Distribute frame chunks weighted by compute power
    const totalTflops = activeWorkers.reduce((acc, w) => acc + w.computePowerTflops, 1);
    let currentStart = 1;
    const chunks: WorkloadChunk[] = activeWorkers.map((w, index) => {
      const share = w.computePowerTflops / totalTflops;
      const count = Math.max(10, Math.round(totalFrames * share));
      const end = index === activeWorkers.length - 1 ? totalFrames : Math.min(totalFrames, currentStart + count - 1);
      const chunk: WorkloadChunk = {
        chunkIndex: index + 1,
        startFrame: currentStart,
        endFrame: end,
        assignedWorkerId: w.id,
        status: 'in-progress',
        progressPercent: 0
      };
      w.status = 'rendering';
      w.currentChunkRange = [currentStart, end];
      currentStart = end + 1;
      return chunk;
    });

    this.currentJob = {
      id: `job-${Date.now().toString(36)}`,
      title,
      type,
      totalFrames,
      completedFrames: 0,
      overallProgressPercent: 0,
      chunks,
      activeWorkersCount: activeWorkers.length,
      status: 'running',
      startedAt: Date.now(),
      estimatedCompletionSeconds: Math.ceil(totalFrames / (totalTflops > 10 ? 80 : 25)),
      outputResolution: '3840x2160 (4K UHD)',
      targetFormat: type === 'ai-model-generation' ? 'ONNX Latent Tensor Batch' : 'ProRes 422 HQ'
    };

    return { ...this.currentJob };
  }

  /**
   * Pause/Resume current distributed job
   */
  public toggleJobPause(): void {
    if (this.currentJob.status === 'running') {
      this.currentJob.status = 'paused';
      this.workers.forEach((w) => { if (w.status === 'rendering') w.status = 'idle'; });
    } else if (this.currentJob.status === 'paused') {
      this.currentJob.status = 'running';
      this.workers.forEach((w) => { if (w.isAvailable) w.status = 'rendering'; });
    }
  }
}

export const distributedComputeService = new DistributedComputeService();
export default distributedComputeService;
