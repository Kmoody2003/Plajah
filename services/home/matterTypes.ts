/**
 * Shared shapes for the Plajah Home Matter controller (matterWorker.ts runs matter.js, the
 * matterControllerService.ts proxy talks to it over IPC). Types only.
 */
export type MatterEndpointKind = 'light' | 'switch' | 'thermostat' | 'lock' | 'sensor' | 'other';

export interface MatterEndpointState {
  endpointId: number;
  kind: MatterEndpointKind;
  deviceTypes: { code: number; name: string }[];
  clusters: string[];
  /** Bridged device label (aggregators) */
  label?: string;
  onOff?: boolean;
  /** LevelControl currentLevel, 0..254 */
  level?: number | null;
  minLevel?: number;
  maxLevel?: number;
  colorTempMireds?: number | null;
  colorTempMinMireds?: number;
  colorTempMaxMireds?: number;
  thermostat?: {
    localTemperatureC: number | null;
    heatSetpointC: number | null;
    coolSetpointC: number | null;
    systemMode: string;
    runningState?: string | null;
    minHeatC?: number | null; maxHeatC?: number | null;
    minCoolC?: number | null; maxCoolC?: number | null;
    canHeat: boolean; canCool: boolean;
  };
  lock?: { state: 'locked' | 'unlocked' | 'not-fully-locked' | 'unlatched' | 'unknown' };
  temperatureC?: number | null;
  humidityPct?: number | null;
}

export interface MatterNodeInfo {
  nodeId: string;
  connection: 'connected' | 'disconnected' | 'reconnecting' | 'waiting-for-discovery';
  initialized: boolean;
  name: string;
  vendorName?: string;
  productName?: string;
  nodeLabel?: string;
  vendorId?: number;
  productId?: number;
  serialNumber?: string;
  softwareVersion?: string;
  endpoints: MatterEndpointState[];
}

export interface CommissionableDeviceInfo {
  id: string;
  name?: string;
  discriminator: number;
  commissioningMode: number;
  vendorId?: number;
  productId?: number;
  deviceType?: number;
  addresses: string[];
}

export interface OperationalAdvert {
  compressedFabricId: string;
  nodeId: string;
  host?: string;
  port?: number;
  ipv4: string[];
  ipv6: string[];
  ownFabric: boolean;
}

export interface MatterCommand {
  nodeId: string;
  endpointId?: number;
  command: 'on' | 'off' | 'toggle' | 'level' | 'colorTemp' | 'heatSetpoint' | 'coolSetpoint' | 'setpointRaiseLower' | 'systemMode' | 'lock' | 'unlock';
  /** level: 0..254 · colorTemp: mireds · heat/coolSetpoint: °C · setpointRaiseLower: °C delta · systemMode: off|auto|cool|heat */
  value?: number | string;
  /** Optional PIN for locks that require one for remote operation */
  pin?: string;
  transitionTenths?: number;
}
