import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Cpu, Zap, Play, Pause, RefreshCw, Layers, CheckCircle2,
  AlertTriangle, HardDrive, Monitor, Laptop, Sparkles, Film
} from 'lucide-react';
import {
  distributedComputeService,
  ComputeWorkerNode,
  DistributedJob
} from '../../services/home/distributedComputeService';

export const DistributedRenderCluster: React.FC = () => {
  const [workers, setWorkers] = useState<ComputeWorkerNode[]>(() => distributedComputeService.getWorkers());
  const [activeJob, setActiveJob] = useState<DistributedJob>(() => distributedComputeService.getActiveJob());
  const [telemetry, setTelemetry] = useState(() => distributedComputeService.getClusterTelemetry());

  const handleTogglePause = () => {
    distributedComputeService.toggleJobPause();
    setActiveJob(distributedComputeService.getActiveJob());
    setWorkers(distributedComputeService.getWorkers());
    setTelemetry(distributedComputeService.getClusterTelemetry());
  };

  const handleDispatchNewJob = (type: 'fabula-video-render' | 'ai-model-generation') => {
    const title = type === 'fabula-video-render'
      ? 'Fabula Project: Ep 4 Visual FX Pass (4K HDR)'
      : 'Fabula AI: Diffusion Concept Batch (64 Images)';
    const newJob = distributedComputeService.dispatchJob(title, type, 300);
    setActiveJob(newJob);
    setWorkers(distributedComputeService.getWorkers());
    setTelemetry(distributedComputeService.getClusterTelemetry());
  };

  return (
    <div className="flex flex-col gap-6 w-full text-white">
      
      {/* CLUSTER TELEMETRY BANNER */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        
        <div className="p-5 rounded-3xl bg-[rgba(22,6,36,0.65)] border border-[#D40055]/30 backdrop-blur-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono uppercase text-[#D0BCFF] font-bold">Pooled Mesh Compute</span>
            <div className="text-2xl font-black font-['Outfit'] text-white mt-0.5">
              {telemetry.totalTflops} <span className="text-sm font-bold text-[#FF8C00]">TFLOPS</span>
            </div>
            <span className="text-[11px] font-mono text-white/50">{telemetry.onlineWorkers} Connected Devices</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#FF8C00]/20 border border-[#FF8C00]/40 flex items-center justify-center text-[#FF8C00]">
            <Cpu className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-3xl bg-[rgba(22,6,36,0.65)] border border-[#D40055]/30 backdrop-blur-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono uppercase text-[#D0BCFF] font-bold">Fabula Render Speed</span>
            <div className="text-2xl font-black font-['Outfit'] text-white mt-0.5">
              {telemetry.totalFps} <span className="text-sm font-bold text-[#06D6A0]">FPS (4K)</span>
            </div>
            <span className="text-[11px] font-mono text-white/50">3x Parallel Pipeline</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#06D6A0]/20 border border-[#06D6A0]/40 flex items-center justify-center text-[#06D6A0]">
            <Zap className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-3xl bg-[rgba(22,6,36,0.65)] border border-[#D40055]/30 backdrop-blur-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono uppercase text-[#D0BCFF] font-bold">Dynamic Failover</span>
            <div className="text-2xl font-black font-['Outfit'] text-white mt-0.5">
              Zero <span className="text-sm font-bold text-[#00DAF3]">Lost Frames</span>
            </div>
            <span className="text-[11px] font-mono text-white/50">Auto-Chunk Reassignment</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#00DAF3]/20 border border-[#00DAF3]/40 flex items-center justify-center text-[#00DAF3]">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

      </div>

      {/* ACTIVE FABULA JOB STATUS & CHUNK MAP */}
      <div className="p-6 rounded-3xl bg-[rgba(22,6,36,0.65)] border border-[#D40055]/20 backdrop-blur-xl flex flex-col gap-5">
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#6B0099] text-white">
                {activeJob.type === 'fabula-video-render' ? 'FABULA VIDEO PIPELINE' : 'AI MODEL BATCH'}
              </span>
              <span className="text-xs font-mono text-[#06D6A0]">● {activeJob.status.toUpperCase()}</span>
            </div>
            <h3 className="text-lg font-bold font-['Outfit'] text-white mt-1">{activeJob.title}</h3>
            <span className="text-xs font-mono text-white/50">
              {activeJob.outputResolution} • {activeJob.targetFormat}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleTogglePause}
              className="px-4 py-2 rounded-2xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/10 text-xs font-mono font-bold text-white flex items-center gap-2 transition"
            >
              {activeJob.status === 'running' ? <Pause className="w-4 h-4 text-[#FF8C00]" /> : <Play className="w-4 h-4 text-[#06D6A0]" />}
              <span>{activeJob.status === 'running' ? 'Pause Cluster' : 'Resume'}</span>
            </button>

            <button
              onClick={() => handleDispatchNewJob('fabula-video-render')}
              className="px-4 py-2 rounded-2xl bg-[#FF8C00] hover:bg-[#FFA133] text-[#12080a] text-xs font-mono font-bold shadow-lg transition flex items-center gap-2"
            >
              <Film className="w-4 h-4" />
              <span>Queue Fabula 4K Job</span>
            </button>
          </div>
        </div>

        {/* Global Progress Bar */}
        <div>
          <div className="flex justify-between items-center text-xs font-mono mb-2">
            <span className="text-white/70">Aggregate Frame Assembly</span>
            <span className="text-white font-bold">{activeJob.completedFrames} / {activeJob.totalFrames} Frames ({activeJob.overallProgressPercent}%)</span>
          </div>
          <div className="w-full h-3 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] transition-all duration-500"
              style={{ width: `${activeJob.overallProgressPercent}%` }}
            ></div>
          </div>
        </div>

        {/* Distributed Chunks Visualization */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          {activeJob.chunks.map((chunk) => {
            const worker = workers.find((w) => w.id === chunk.assignedWorkerId);
            return (
              <div key={chunk.chunkIndex} className="p-3.5 rounded-2xl bg-black/40 border border-white/10 flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="font-bold text-[#D0BCFF]">Chunk #{chunk.chunkIndex}</span>
                  <span className="text-white/60">Frames {chunk.startFrame}–{chunk.endFrame}</span>
                </div>
                <div className="text-[11px] font-mono text-white/70 truncate">
                  Worker: <strong className="text-white">{worker?.name || 'Local'}</strong>
                </div>
                <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-[#FF8C00] transition-all duration-300"
                    style={{ width: `${chunk.progressPercent}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-[10px] font-mono text-white/50">
                  <span>{chunk.status}</span>
                  <span>{chunk.progressPercent}%</span>
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {/* COMPUTE WORKER NODES GRID */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-mono font-bold text-white/50 uppercase">Active Compute Nodes ({workers.length})</span>
          <button
            onClick={() => handleDispatchNewJob('ai-model-generation')}
            className="text-xs font-mono text-[#00DAF3] hover:underline flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Test AI Model Batch Distribution ➔</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {workers.map((worker) => (
            <div
              key={worker.id}
              className="p-5 rounded-3xl bg-[rgba(22,6,36,0.65)] border border-[#D40055]/20 backdrop-blur-xl flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {worker.deviceType === 'desktop' && <Monitor className="w-4 h-4 text-[#FF8C00]" />}
                    {worker.deviceType === 'console' && <HardDrive className="w-4 h-4 text-[#D40055]" />}
                    {worker.deviceType === 'laptop' && <Laptop className="w-4 h-4 text-[#00DAF3]" />}
                    <span className="text-xs font-bold text-white font-['Outfit']">{worker.name}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#06D6A0]/20 text-[#06D6A0]">
                    {worker.fpsRenderRate} FPS
                  </span>
                </div>
                <div className="text-[11px] font-mono text-[#D0BCFF] truncate">{worker.computeDeviceName}</div>
                <div className="text-[10px] font-mono text-white/50 mt-1">
                  Power: {worker.computePowerTflops} TFLOPS • {worker.availableRamGb}GB RAM
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-black/40 border border-white/5 font-mono text-xs flex justify-between items-center">
                <span>Load: <strong className="text-white">{worker.utilizationPercent}%</strong></span>
                <span>Temp: <strong className={worker.temperatureC > 70 ? 'text-[#EF4444]' : 'text-[#06D6A0]'}>{worker.temperatureC}°C</strong></span>
                <span>Tier: <strong className="text-[#FF8C00] uppercase text-[10px]">{worker.hardwareTier}</strong></span>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

export default DistributedRenderCluster;
