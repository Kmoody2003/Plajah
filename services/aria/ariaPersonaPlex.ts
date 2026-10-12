/**
 * ariaPersonaPlex.ts — State management and bridge integration for NVIDIA PersonaPlex-7B
 * on-device full-duplex conversational voice.
 *
 * Coordinates between:
 *  1. Windows WinUI 3 Native Bridge (GPU telemetry, weight download, daemon lifecycle)
 *  2. Local WebSocket duplex audio stream (ws://127.0.0.1:8765/live-duplex)
 *  3. Fallback simulation for browser development / testing
 */

import {
  isWindowsApp,
  getGpuHardwareProfile,
  queryPersonaPlexStatus,
  startPersonaPlexDownload,
  cancelPersonaPlexDownload,
  launchPersonaPlexDaemon,
  stopPersonaPlexDaemon,
  deletePersonaPlexWeights,
  type GpuHardwareProfile,
  type PersonaPlexPackageStatus,
} from '../windowsBridgeService';

export interface PersonaPlexVoicePreset {
  id: string;
  name: string;
  description: string;
  audioSample?: string;
  tone: 'warm' | 'studio' | 'focused' | 'energetic';
}

export const PERSONAPLEX_PRESETS: PersonaPlexVoicePreset[] = [
  {
    id: 'aria-studio',
    name: 'Aria Studio (Warm & Natural)',
    description: 'Balanced conversational tone with natural breathing, subtle backchanneling, and creative focus.',
    tone: 'warm',
  },
  {
    id: 'aria-producer',
    name: 'Aria Director (Direct & Focused)',
    description: 'Crisp, low-latency audio prompt delivery optimized for rapid canvas & DAW command dispatch.',
    tone: 'focused',
  },
  {
    id: 'aria-companion',
    name: 'Aria Living (Expressive & Fluid)',
    description: 'Maximum conversational inflection with human-like turn-taking, pauses, and expressive overlaps.',
    tone: 'energetic',
  },
];

export interface PersonaPlexState {
  gpu: GpuHardwareProfile | null;
  gpuLoading: boolean;
  packageStatus: PersonaPlexPackageStatus;
  selectedPresetId: string;
  agenticBridgeEnabled: boolean;
  fullDuplexEnabled: boolean;
  isSimulated: boolean;
}

const STORAGE_PRESET_KEY = 'aria_personaplex_preset';
const STORAGE_AGENTIC_KEY = 'aria_personaplex_agentic';
const STORAGE_DUPLEX_KEY = 'aria_personaplex_duplex';
const STORAGE_SIMULATED_KEY = 'aria_personaplex_simulated_installed';

class AriaPersonaPlexManager {
  private state: PersonaPlexState = {
    gpu: null,
    gpuLoading: true,
    packageStatus: {
      installed: false,
      downloadProgress: 0,
      downloadState: 'idle',
      serviceRunning: false,
    },
    selectedPresetId: 'aria-studio',
    agenticBridgeEnabled: true,
    fullDuplexEnabled: true,
    isSimulated: false,
  };

  private listeners = new Set<() => void>();
  private simTimer: any = null;

  constructor() {
    this.loadPersistedPrefs();
    this.refreshHardwareAndStatus();
  }

  getState(): PersonaPlexState {
    return this.state;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.listeners.forEach(l => l());
  }

  private loadPersistedPrefs() {
    try {
      const preset = localStorage.getItem(STORAGE_PRESET_KEY);
      if (preset) this.state.selectedPresetId = preset;

      const agentic = localStorage.getItem(STORAGE_AGENTIC_KEY);
      if (agentic !== null) this.state.agenticBridgeEnabled = agentic === '1';

      const duplex = localStorage.getItem(STORAGE_DUPLEX_KEY);
      if (duplex !== null) this.state.fullDuplexEnabled = duplex === '1';

      const simInstalled = localStorage.getItem(STORAGE_SIMULATED_KEY);
      if (simInstalled === '1' && !isWindowsApp()) {
        this.state.packageStatus.installed = true;
        this.state.packageStatus.downloadState = 'installed';
        this.state.packageStatus.downloadProgress = 100;
      }
    } catch {}
  }

  setPreset(id: string) {
    this.state.selectedPresetId = id;
    try { localStorage.setItem(STORAGE_PRESET_KEY, id); } catch {}
    this.emit();
  }

  setAgenticBridgeEnabled(enabled: boolean) {
    this.state.agenticBridgeEnabled = enabled;
    try { localStorage.setItem(STORAGE_AGENTIC_KEY, enabled ? '1' : '0'); } catch {}
    this.emit();
  }

  setFullDuplexEnabled(enabled: boolean) {
    this.state.fullDuplexEnabled = enabled;
    try { localStorage.setItem(STORAGE_DUPLEX_KEY, enabled ? '1' : '0'); } catch {}
    this.emit();
  }

  async refreshHardwareAndStatus(): Promise<void> {
    this.state.gpuLoading = true;
    this.emit();

    try {
      const [gpu, pkg] = await Promise.all([
        getGpuHardwareProfile(),
        queryPersonaPlexStatus(),
      ]);

      this.state.gpu = gpu;
      this.state.gpuLoading = false;
      this.state.isSimulated = !isWindowsApp();

      if (isWindowsApp()) {
        this.state.packageStatus = pkg;
      }
    } catch {
      this.state.gpuLoading = false;
    }

    this.emit();
  }

  async startDownload(): Promise<void> {
    if (!isWindowsApp()) {
      // Browser simulation mode for previewing UI
      if (this.simTimer) clearInterval(this.simTimer);
      this.state.packageStatus = {
        installed: false,
        downloadState: 'downloading',
        downloadProgress: 0,
        downloadSpeed: '42.5 MB/s',
        bytesDownloaded: 0,
        totalBytes: 5.8 * 1024 * 1024 * 1024,
        serviceRunning: false,
      };
      this.emit();

      let p = 0;
      this.simTimer = setInterval(() => {
        p += 5;
        const total = 5.8 * 1024 * 1024 * 1024;
        const current = (p / 100) * total;
        if (p >= 100) {
          clearInterval(this.simTimer);
          this.simTimer = null;
          this.state.packageStatus = {
            installed: true,
            downloadState: 'installed',
            downloadProgress: 100,
            downloadSpeed: '0 MB/s',
            bytesDownloaded: total,
            totalBytes: total,
            serviceRunning: false,
          };
          try { localStorage.setItem(STORAGE_SIMULATED_KEY, '1'); } catch {}
        } else {
          this.state.packageStatus = {
            ...this.state.packageStatus,
            downloadProgress: p,
            bytesDownloaded: current,
            downloadSpeed: `${(38 + Math.random() * 8).toFixed(1)} MB/s`,
          };
        }
        this.emit();
      }, 400);
      return;
    }

    // Windows native download
    this.state.packageStatus.downloadState = 'downloading';
    this.emit();
    await startPersonaPlexDownload((status) => {
      this.state.packageStatus = status;
      this.emit();
    });
  }

  async cancelDownload(): Promise<void> {
    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
    }
    await cancelPersonaPlexDownload();
    this.state.packageStatus.downloadState = 'idle';
    this.state.packageStatus.downloadProgress = 0;
    this.emit();
  }

  async toggleDaemon(): Promise<void> {
    if (this.state.packageStatus.serviceRunning) {
      if (isWindowsApp()) {
        await stopPersonaPlexDaemon();
      }
      this.state.packageStatus.serviceRunning = false;
    } else {
      if (isWindowsApp()) {
        const res = await launchPersonaPlexDaemon();
        this.state.packageStatus.serviceRunning = !!res.success;
        this.state.packageStatus.port = res.port;
      } else {
        // Simulated local daemon
        this.state.packageStatus.serviceRunning = true;
        this.state.packageStatus.port = 8765;
      }
    }
    this.emit();
  }

  async deleteWeights(): Promise<void> {
    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
    }
    if (isWindowsApp()) {
      await deletePersonaPlexWeights();
    }
    try { localStorage.removeItem(STORAGE_SIMULATED_KEY); } catch {}
    this.state.packageStatus = {
      installed: false,
      downloadProgress: 0,
      downloadState: 'idle',
      serviceRunning: false,
    };
    this.emit();
  }
}

export const ariaPersonaPlex = new AriaPersonaPlexManager();
