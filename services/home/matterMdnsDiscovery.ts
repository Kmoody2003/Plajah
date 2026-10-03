import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';

export interface DiscoveredMatterNode {
  nodeId: string;
  fabricId: string;
  rawInstance: string;
  ip: string;
  port: number;
  name: string;
  vendorName: string;
  deviceType?: string;
  status: 'ONLINE' | 'STANDBY';
  lastSeen: string;
}

export interface DiscoveredSmartDevice {
  id: string;
  name: string;
  cleanName: string;
  vendor: string;
  model?: string;
  ip: string;
  protocol: 'MATTER' | 'HUE' | 'HAP' | 'AIRPLAY' | 'UPNP' | 'MDNS';
  deviceClass: 'LIGHT' | 'SPEAKER' | 'CAMERA' | 'HUB' | 'DISPLAY' | 'TV' | 'WORKSTATION' | 'SENSOR';
  matterNodeId?: string;
  fabricId?: string;
  status: 'ONLINE';
  lastSeen: string;
}

class MatterMdnsDiscoveryService extends EventEmitter {
  private socket: dgram.Socket | null = null;
  private isScanning = false;
  private discoveredMatterNodes = new Map<string, DiscoveredMatterNode>();
  private discoveredSmartDevices = new Map<string, DiscoveredSmartDevice>();

  constructor() {
    super();
  }

  private buildPtrQuery(serviceName: string): Buffer {
    const parts = serviceName.split('.');
    const buf = Buffer.alloc(256);
    buf.writeUInt16BE(Math.floor(Math.random() * 65535), 0); // Transaction ID
    buf.writeUInt16BE(0x0000, 2); // Standard query
    buf.writeUInt16BE(1, 4);      // 1 question
    let offset = 12;
    for (const part of parts) {
      buf.writeUInt8(part.length, offset++);
      buf.write(part, offset);
      offset += part.length;
    }
    buf.writeUInt8(0, offset++);  // Null terminator
    buf.writeUInt16BE(12, offset); // PTR record
    offset += 2;
    buf.writeUInt16BE(1, offset);  // Class IN
    offset += 2;
    return buf.slice(0, offset);
  }

  private parsePacket(buf: Buffer, rinfo: dgram.RemoteInfo): void {
    const raw = buf.toString('utf8');
    const now = new Date().toISOString();

    // 1. Matter Operational Node Pattern: <16hex_compressed_fabric_id>-<16hex_node_id>
    const matterMatch = raw.match(/([0-9A-Fa-f]{16})-([0-9A-Fa-f]{16})/);
    if (matterMatch) {
      const fabricHex = matterMatch[1].toUpperCase();
      const nodeHex = matterMatch[2].toUpperCase();
      const nodeId = `node-0x${nodeHex}`;
      const fabricId = `0x${fabricHex}`;
      const rawInstance = matterMatch[0];

      // Deduce vendor / friendly name based on IP / mDNS signatures
      let vendorName = 'Matter Certified';
      let name = `Matter Node ${nodeHex.slice(-4)}`;
      let devClass: DiscoveredSmartDevice['deviceClass'] = 'HUB';

      if (rinfo.address === '192.168.4.73') {
        vendorName = 'Nanoleaf';
        name = 'Nanoleaf Shapes Matter Light';
        devClass = 'LIGHT';
      } else if (rinfo.address === '192.168.4.67' || rinfo.address === '192.168.4.72' || raw.includes('amazon') || raw.includes('echo')) {
        vendorName = 'Amazon';
        name = `Echo Matter Hub (${rinfo.address.split('.').pop()})`;
        devClass = 'SPEAKER';
      } else if (rinfo.address === '192.168.4.1') {
        vendorName = 'Lighthouse Gateway';
        name = 'Lighthouse Router Matter Bridge';
        devClass = 'HUB';
      }

      const matterNode: DiscoveredMatterNode = {
        nodeId,
        fabricId,
        rawInstance,
        ip: rinfo.address,
        port: 5540,
        name,
        vendorName,
        status: 'ONLINE',
        lastSeen: now
      };

      this.discoveredMatterNodes.set(nodeId, matterNode);

      const smartDev: DiscoveredSmartDevice = {
        id: `matter-${nodeId}`,
        name,
        cleanName: name,
        vendor: vendorName,
        ip: rinfo.address,
        protocol: 'MATTER',
        deviceClass: devClass,
        matterNodeId: nodeId,
        fabricId,
        status: 'ONLINE',
        lastSeen: now
      };
      this.discoveredSmartDevices.set(smartDev.id, smartDev);
    }

    // 2. Philips Hue Bridge
    const hueMatch = raw.match(/Hue Bridge - ([0-9A-Fa-f]+)/i);
    if (hueMatch) {
      const name = hueMatch[0];
      const id = `hue-${hueMatch[1].toLowerCase()}`;
      this.discoveredSmartDevices.set(id, {
        id,
        name,
        cleanName: name,
        vendor: 'Philips Hue',
        model: 'BSB002 Matter Bridge',
        ip: rinfo.address,
        protocol: 'HUE',
        deviceClass: 'LIGHT',
        status: 'ONLINE',
        lastSeen: now
      });
    }

    // 3. Nanoleaf Shapes / HomeKit
    const hapShapesMatch = raw.match(/Shapes [0-9A-Za-z]+/i);
    if (hapShapesMatch) {
      const name = hapShapesMatch[0];
      const id = `nanoleaf-${rinfo.address.replace(/\./g, '-')}`;
      this.discoveredSmartDevices.set(id, {
        id,
        name,
        cleanName: name,
        vendor: 'Nanoleaf',
        model: 'Shapes Triangles/Hexagons',
        ip: rinfo.address,
        protocol: 'HAP',
        deviceClass: 'LIGHT',
        status: 'ONLINE',
        lastSeen: now
      });
    }

    // 4. Eufy Security Camera
    const camMatch = raw.match(/IndoorCam Pan 2K-[0-9A-Za-z]+/i);
    if (camMatch) {
      const name = camMatch[0];
      const id = `cam-${rinfo.address.replace(/\./g, '-')}`;
      this.discoveredSmartDevices.set(id, {
        id,
        name,
        cleanName: name,
        vendor: 'Eufy Security',
        model: 'IndoorCam Pan 2K',
        ip: rinfo.address,
        protocol: 'HAP',
        deviceClass: 'CAMERA',
        status: 'ONLINE',
        lastSeen: now
      });
    }

    // 5. AirPlay Speakers / Samsung Music Frames / JBL / Apple TV
    const airplayMatch = raw.match(/(Dining speaker|Living Room Frame 1|Master Bedroom speaker|Q-Series Soundbar|Kamille Room)/i);
    if (airplayMatch) {
      const name = airplayMatch[0];
      const id = `airplay-${rinfo.address.replace(/\./g, '-')}`;
      
      let vendor = 'Apple';
      let model = 'AirPlay 2 Speaker';
      let devClass: DiscoveredSmartDevice['deviceClass'] = 'SPEAKER';

      if (name.includes('Frame')) {
        vendor = 'Samsung';
        model = 'HW-LS60D Music Frame';
        devClass = 'DISPLAY'; // Dual role: Frame Canvas + HiFi Speaker
      } else if (name.includes('Soundbar')) {
        vendor = 'Samsung';
        model = 'HW-Q850D Dolby Atmos Soundbar';
        devClass = 'SPEAKER';
      } else if (name.includes('Dining speaker')) {
        vendor = 'Harman JBL';
        model = 'JBL Authentics 200';
        devClass = 'SPEAKER';
      } else if (name.includes('Master Bedroom speaker')) {
        vendor = 'Samsung';
        model = 'HW-LS60D Music Frame';
        devClass = 'DISPLAY';
      } else if (name.includes('Kamille Room')) {
        vendor = 'Apple';
        model = 'Apple TV 4K';
        devClass = 'TV';
      }

      this.discoveredSmartDevices.set(id, {
        id,
        name,
        cleanName: name,
        vendor,
        model,
        ip: rinfo.address,
        protocol: 'AIRPLAY',
        deviceClass: devClass,
        status: 'ONLINE',
        lastSeen: now
      });
    }
  }

  public async scan(timeoutMs = 2500): Promise<{
    matterNodes: DiscoveredMatterNode[];
    smartDevices: DiscoveredSmartDevice[];
  }> {
    if (this.isScanning) {
      return {
        matterNodes: Array.from(this.discoveredMatterNodes.values()),
        smartDevices: Array.from(this.discoveredSmartDevices.values())
      };
    }

    this.isScanning = true;

    return new Promise((resolve) => {
      let isDone = false;
      let socket: dgram.Socket | null = null;

      const finish = () => {
        if (isDone) return;
        isDone = true;
        try { socket?.close(); } catch {}
        this.isScanning = false;
        resolve({
          matterNodes: Array.from(this.discoveredMatterNodes.values()),
          smartDevices: Array.from(this.discoveredSmartDevices.values())
        });
      };

      // Guaranteed timeout
      const timer = setTimeout(finish, timeoutMs);

      try {
        socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      } catch (e) {
        clearTimeout(timer);
        return finish();
      }

      socket.on('error', (err) => {
        console.warn('[MatterMdns] Socket warning:', err.message);
        clearTimeout(timer);
        finish();
      });

      socket.on('message', (msg, rinfo) => {
        this.parsePacket(msg, rinfo);
      });

      const sendQueries = () => {
        try {
          socket?.addMembership('224.0.0.251');
        } catch {}

        const queries = [
          '_matter._tcp.local',
          '_matterc._udp.local',
          '_meshcop._udp.local',
          '_hue._tcp.local',
          '_hap._tcp.local',
          '_airplay._tcp.local',
          '_raop._tcp.local',
          '_services._dns-sd._udp.local'
        ];

        for (const q of queries) {
          try {
            const pkt = this.buildPtrQuery(q);
            socket?.send(pkt, 0, pkt.length, 5353, '224.0.0.251');
          } catch {}
        }
      };

      try {
        socket.bind(5353, sendQueries);
      } catch {
        try {
          socket.bind(0, sendQueries);
        } catch {
          clearTimeout(timer);
          finish();
        }
      }
    });
  }

  public getMatterNodes(): DiscoveredMatterNode[] {
    return Array.from(this.discoveredMatterNodes.values());
  }

  public getSmartDevices(): DiscoveredSmartDevice[] {
    return Array.from(this.discoveredSmartDevices.values());
  }
}

export const matterMdnsDiscovery = new MatterMdnsDiscoveryService();
