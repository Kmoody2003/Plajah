import { platformAudio } from '../mediaEngine/audioRuntime';

export interface AudioDeviceInfo {
  deviceId: string;
  label: string;
  groupId?: string;
  isDefault?: boolean;
}

const MAIN_DEVICE_KEY = 'ambo_audio_main_sink';
const CUE_DEVICE_KEY = 'ambo_audio_cue_sink';

class AmboAudioRoutingService {
  private mainDeviceId: string = '';
  private cueDeviceId: string = '';

  constructor() {
    if (typeof localStorage !== 'undefined') {
      this.mainDeviceId = localStorage.getItem(MAIN_DEVICE_KEY) || '';
      this.cueDeviceId = localStorage.getItem(CUE_DEVICE_KEY) || '';
    }
  }

  /**
   * Enumerate available physical and virtual audio output devices.
   */
  async getOutputDevices(): Promise<AudioDeviceInfo[]> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return [
        { deviceId: 'default', label: 'Default System Output', isDefault: true },
        { deviceId: 'cue-headphones', label: 'Operator Headphones (Virtual Cue)', isDefault: false },
      ];
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices
        .filter(d => d.kind === 'audiooutput')
        .map(d => ({
          deviceId: d.deviceId,
          label: d.label || `Audio Output ${d.deviceId.slice(0, 5)}`,
          groupId: d.groupId,
          isDefault: d.deviceId === 'default',
        }));

      if (outputs.length === 0) {
        return [
          { deviceId: 'default', label: 'Default System Audio Device', isDefault: true },
        ];
      }
      return outputs;
    } catch {
      return [{ deviceId: 'default', label: 'Default System Output', isDefault: true }];
    }
  }

  /**
   * Route Main Audio Bus (Program Out) to a specific output device.
   */
  async setMainDevice(deviceId: string): Promise<boolean> {
    this.mainDeviceId = deviceId;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(MAIN_DEVICE_KEY, deviceId);
    }
    return platformAudio.setMainSinkId(deviceId);
  }

  /**
   * Route CUE Audio Bus (Preview / Headphone Monitoring) to a specific output device.
   * HARD GUARANTEE: The cue bus never touches or leaks into Main Out.
   */
  async setCueDevice(deviceId: string): Promise<boolean> {
    this.cueDeviceId = deviceId;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CUE_DEVICE_KEY, deviceId);
    }
    return platformAudio.setCueSinkId(deviceId);
  }

  getMainDevice(): string {
    return this.mainDeviceId;
  }

  getCueDevice(): string {
    return this.cueDeviceId;
  }

  /**
   * Diagnostic verification that Cue bus is strictly isolated from Main Out.
   */
  isCueIsolated(): boolean {
    return platformAudio.isCueIsolated();
  }
}

export const amboAudioRouting = new AmboAudioRoutingService();
