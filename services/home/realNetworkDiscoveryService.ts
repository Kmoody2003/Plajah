import { parseDeviceLocation, ParsedLocation } from './deviceLocationParser';
import { fingerprintDevice, DetailedDeviceType, DeviceFingerprint } from './deviceFingerprint';

export interface RealDevice extends ParsedLocation {
  id: string;
  rawName: string;
  vendor: string;
  model?: string;
  brand: string;
  brandColor: string;
  typeLabel: string;
  detailedType: DetailedDeviceType;
  protocolBadge: string;
  ip?: string;
  mac?: string;
  uri?: string;
  deviceClass?: 'TV' | 'SPEAKER' | 'CAMERA' | 'LIGHT' | 'HUB' | 'DISPLAY' | 'PRINTER' | 'MOBILE' | 'WORKSTATION' | 'SENSOR' | 'CLIMATE';
  protocol: 'MATTER' | 'UPNP' | 'WIFI_DIRECT' | 'WSD' | 'LAN_IP' | 'BLUETOOTH';
  status: 'ONLINE' | 'STANDBY' | 'AVAILABLE';
  lastSeen: string;
  powerOn: boolean;
  volume?: number;
  inputSource?: string;
  matterNodeId?: string;
  matterClusterState?: {
    onOff?: boolean;
    level?: number;
    colorTemperature?: number;
    locked?: boolean;
  };
}

export interface DiscoveredRoomGroup {
  roomId: string;
  roomName: string;
  floor: 'main' | 'upper' | 'exterior' | 'basement';
  zone: string;
  themeColor: string;
  devices: RealDevice[];
  activeCount: number;
}

type DiscoveryListener = (devices: RealDevice[], isScanning: boolean, rooms: DiscoveredRoomGroup[], networkName: string) => void;

class RealNetworkDiscoveryService {
  private devices: RealDevice[] = [];
  private networkName: string = 'Moody Lighthouse';
  private isScanning = false;
  private listeners = new Set<DiscoveryListener>();
  private initialized = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.scanNow();
    }
  }

  public subscribe(listener: DiscoveryListener): () => void {
    this.listeners.add(listener);
    listener(this.devices, this.isScanning, this.groupDevicesByRoom(), this.networkName);
    if (!this.initialized) {
      this.initialized = true;
      this.scanNow();
    }
    return () => this.listeners.delete(listener);
  }

  public getDevices(): RealDevice[] {
    return this.devices;
  }

  public getRooms(): DiscoveredRoomGroup[] {
    return this.groupDevicesByRoom();
  }

  public getNetworkName(): string {
    return this.networkName;
  }

  public async scanNow(): Promise<RealDevice[]> {
    this.isScanning = true;
    this.notify();

    const mergedDevices: RealDevice[] = [];

    // 1. Discover physical/ARP/Bluetooth/mDNS devices on current network
    try {
      const res = await fetch('/api/home/discover');
      if (res.ok) {
        const data = await res.json();
        if (data.networkInterface) {
          this.networkName = String(data.networkInterface).replace(/^Wi-Fi \((.*)\)$/, '$1');
        }
        if (data.success && Array.isArray(data.devices)) {
          const lanDevices = data.devices.map((raw: any) => {
            const fp = fingerprintDevice({
              rawName: raw.rawName || raw.cleanName,
              cleanName: raw.cleanName,
              vendor: raw.vendor,
              model: raw.model,
              ip: raw.ip,
              mac: raw.mac,
              protocol: raw.protocol,
              deviceClass: raw.deviceClass
            });

            const parsed = parseDeviceLocation(fp.friendlyName, fp.deviceType);
            if (fp.suggestedRoom && (!raw.rawName || !raw.rawName.toLowerCase().includes('room'))) {
              parsed.roomName = fp.suggestedRoom;
              parsed.roomId = fp.suggestedRoom.toLowerCase().replace(/[^a-z0-9]/g, '_');
            }

            return {
              ...parsed,
              id: raw.id || `dev-${Math.random().toString(36).substring(2, 9)}`,
              rawName: raw.rawName,
              cleanName: fp.friendlyName,
              vendor: fp.brand,
              brand: fp.brand,
              brandColor: fp.brandColor,
              model: fp.model,
              typeLabel: fp.typeLabel,
              detailedType: fp.deviceType,
              protocolBadge: fp.protocolBadge,
              ip: raw.ip,
              mac: raw.mac,
              uri: raw.uri || (fp.deviceType === 'CAMERA' && raw.ip ? `rtsp://${raw.ip}:554/live0` : raw.uri),
              deviceClass: (fp.deviceType as any) || raw.deviceClass || parsed.category,
              protocol: raw.protocol || 'WIFI_DIRECT',
              status: raw.status || 'ONLINE',
              lastSeen: raw.lastSeen || new Date().toISOString(),
              powerOn: raw.status === 'ONLINE' || raw.status === 'AVAILABLE',
              volume: 42,
              inputSource: 'Plajah AURA Cast'
            } as RealDevice;
          });
          mergedDevices.push(...lanDevices);
        }
      }
    } catch (err) {
      console.warn('[RealNetworkDiscovery] Home discover probe error:', err);
    }

    // 2. Discover / Fetch commissioned Matter devices
    try {
      const mRes = await fetch('/api/matter/nodes');
      if (mRes.ok) {
        const mData = await mRes.json();
        if (mData.success && Array.isArray(mData.nodes)) {
          for (const node of mData.nodes) {
            const ep = node.endpoints?.[1] || node.endpoints?.[0];
            const fp = fingerprintDevice({
              rawName: node.name || 'Matter Device',
              vendor: node.vendorName,
              ip: node.ip,
              protocol: 'MATTER',
              deviceClass: 'LIGHT'
            });

            const parsed = parseDeviceLocation(fp.friendlyName, fp.deviceType);
            if (node.roomName) {
              parsed.roomName = node.roomName;
              parsed.roomId = node.roomName.toLowerCase().replace(/[^a-z0-9]/g, '_');
            } else if (fp.suggestedRoom) {
              parsed.roomName = fp.suggestedRoom;
              parsed.roomId = fp.suggestedRoom.toLowerCase().replace(/[^a-z0-9]/g, '_');
            }

            mergedDevices.push({
              ...parsed,
              id: `matter-${node.nodeId}`,
              rawName: node.name,
              cleanName: fp.friendlyName,
              vendor: fp.brand,
              brand: fp.brand,
              brandColor: fp.brandColor,
              model: fp.model,
              typeLabel: fp.typeLabel,
              detailedType: fp.deviceType,
              protocolBadge: fp.protocolBadge,
              ip: node.ip,
              deviceClass: (fp.deviceType as any) || parsed.category,
              protocol: 'MATTER',
              status: node.status === 'ONLINE' ? 'ONLINE' : 'STANDBY',
              lastSeen: node.lastSeen || new Date().toISOString(),
              powerOn: ep?.clusterState?.onOff ?? true,
              matterNodeId: node.nodeId,
              matterClusterState: ep?.clusterState,
              volume: ep?.clusterState?.level ? Math.round((ep.clusterState.level / 254) * 100) : undefined
            });
          }
        }
      }
    } catch (err) {
      console.warn('[RealNetworkDiscovery] Matter nodes query error:', err);
    }

    if (mergedDevices.length > 0) {
      this.devices = mergedDevices;
    }

    this.isScanning = false;
    this.notify();
    return this.devices;
  }

  public async toggleDevicePower(id: string): Promise<void> {
    const dev = this.devices.find(d => d.id === id);
    if (!dev) return;

    if (dev.protocol === 'MATTER' && dev.matterNodeId) {
      try {
        const nextState = !dev.powerOn;
        dev.powerOn = nextState;
        dev.status = nextState ? 'ONLINE' : 'STANDBY';
        this.notify();

        await fetch('/api/matter/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nodeId: dev.matterNodeId,
            cluster: 'OnOff',
            command: 'toggle'
          })
        });
      } catch (err) {
        console.error('[RealNetworkDiscovery] Failed to toggle Matter device:', err);
      }
    } else {
      dev.powerOn = !dev.powerOn;
      dev.status = dev.powerOn ? 'ONLINE' : 'STANDBY';
      this.notify();
    }
  }

  public async pairMatterDevice(params: {
    code?: string;
    ip?: string;
    passcode?: number;
    discriminator?: number;
    name?: string;
    roomName?: string;
  }): Promise<{ success: boolean; node?: any; error?: string }> {
    try {
      const res = await fetch('/api/matter/commission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      const data = await res.json();
      if (data.success) {
        await this.scanNow();
      }
      return data;
    } catch (err: any) {
      return { success: false, error: err.message || 'Pairing failed' };
    }
  }

  public async controlMatterCluster(params: {
    nodeId: string;
    cluster: 'OnOff' | 'LevelControl' | 'ColorControl' | 'DoorLock';
    command: 'toggle' | 'on' | 'off' | 'setLevel' | 'setColor' | 'lock' | 'unlock';
    value?: any;
  }): Promise<boolean> {
    try {
      const res = await fetch('/api/matter/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      const data = await res.json();
      if (data.success) {
        const dev = this.devices.find(d => d.matterNodeId === params.nodeId);
        if (dev && data.clusterState) {
          dev.matterClusterState = data.clusterState;
          if (typeof data.clusterState.onOff === 'boolean') {
            dev.powerOn = data.clusterState.onOff;
          }
          this.notify();
        }
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  public async unpairMatterDevice(nodeId: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/matter/nodes/${encodeURIComponent(nodeId)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        await this.scanNow();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  private groupDevicesByRoom(): DiscoveredRoomGroup[] {
    const roomMap = new Map<string, DiscoveredRoomGroup>();

    for (const dev of this.devices) {
      if (!roomMap.has(dev.roomId)) {
        roomMap.set(dev.roomId, {
          roomId: dev.roomId,
          roomName: dev.roomName,
          floor: dev.floor,
          zone: dev.zone,
          themeColor: dev.themeColor,
          devices: [],
          activeCount: 0
        });
      }
      const group = roomMap.get(dev.roomId)!;
      group.devices.push(dev);
      if (dev.powerOn) group.activeCount++;
    }

    return Array.from(roomMap.values());
  }

  private notify() {
    const rooms = this.groupDevicesByRoom();
    this.listeners.forEach(fn => fn(this.devices, this.isScanning, rooms, this.networkName));
  }
}

export const realNetworkDiscoveryService = new RealNetworkDiscoveryService();
export default realNetworkDiscoveryService;
