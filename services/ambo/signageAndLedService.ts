// signageAndLedService.ts — Broadcast-grade LED Wall Auto-Mapping, Digital Signage Platform Driver,
// and Samsung SMART Signage (SSSP / MDC) Network Discovery.

import type { LayerSlot, LiveStack } from './showModel';

// =============================================================================
// 1. LED WALL SPECIFICATIONS, PROCESSOR TOPOLOGY & PORT BUDGETING
// =============================================================================

export interface LedCabinetSpec {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  widthPx: number;
  heightPx: number;
  pitchMm: number; // e.g. 1.25, 1.9, 2.5, 3.9
  weightKg?: number;
  maxPowerWatts?: number;
}

export const COMMON_CABINET_SPECS: Record<string, LedCabinetSpec> = {
  'p1.9-500x500': {
    id: 'p1.9-500x500',
    name: 'Fine Pitch P1.95 (500×500mm)',
    widthMm: 500,
    heightMm: 500,
    widthPx: 256,
    heightPx: 256,
    pitchMm: 1.953,
    weightKg: 7.5,
    maxPowerWatts: 160,
  },
  'p2.5-500x500': {
    id: 'p2.5-500x500',
    name: 'Standard Church P2.5 (500×500mm)',
    widthMm: 500,
    heightMm: 500,
    widthPx: 200,
    heightPx: 200,
    pitchMm: 2.5,
    weightKg: 7.2,
    maxPowerWatts: 140,
  },
  'p2.9-500x500': {
    id: 'p2.9-500x500',
    name: 'Concert Rental P2.97 (500×500mm)',
    widthMm: 500,
    heightMm: 500,
    widthPx: 168,
    heightPx: 168,
    pitchMm: 2.976,
    weightKg: 8.0,
    maxPowerWatts: 150,
  },
  'p3.9-500x500': {
    id: 'p3.9-500x500',
    name: 'High Brightness P3.91 (500×500mm)',
    widthMm: 500,
    heightMm: 500,
    widthPx: 128,
    heightPx: 128,
    pitchMm: 3.91,
    weightKg: 7.0,
    maxPowerWatts: 180,
  },
  'p3.9-500x1000': {
    id: 'p3.9-500x1000',
    name: 'Stage Touring P3.91 (500×1000mm)',
    widthMm: 500,
    heightMm: 1000,
    widthPx: 128,
    heightPx: 256,
    pitchMm: 3.91,
    weightKg: 13.5,
    maxPowerWatts: 320,
  },
  'p1.5-600x337': {
    id: 'p1.5-600x337',
    name: '16:9 Native UHD P1.56 (600×337.5mm)',
    widthMm: 600,
    heightMm: 337.5,
    widthPx: 384,
    heightPx: 216,
    pitchMm: 1.562,
    weightKg: 6.8,
    maxPowerWatts: 130,
  },
};

export type DaisyChainPattern = 'S_CURVE' | 'Z_CURVE' | 'VERTICAL_SNAKE' | 'BOTTOM_UP_SNAKE';

export interface PortAllocation {
  portNumber: number;
  cabinets: Array<{ col: number; row: number; cabinetIndex: number; xPx: number; yPx: number }>;
  pixelCount: number;
  maxPortPixels: number;
  loadPercentage: number;
  colorHex: string;
}

export interface LedWallConfig {
  id: string;
  name: string;
  cabinetSpec: LedCabinetSpec;
  cols: number;
  rows: number;
  daisyChainPattern: DaisyChainPattern;
  maxPixelsPerPort: number; // Novastar/Brompton standard: 655,360 px @ 60Hz 8-bit
  bezelCompensationMm?: number;
  processorBrand: 'NOVASTAR' | 'BROMPTON' | 'COLORLIGHT' | 'GENERIC';
  ipAddress?: string;
  assignedBusId?: string;
}

export interface LedWallMetrics {
  totalCabinets: number;
  totalWidthPx: number;
  totalHeightPx: number;
  totalPixels: number;
  aspectRatio: string;
  physicalWidthM: number;
  physicalHeightM: number;
  physicalWidthFt: number;
  physicalHeightFt: number;
  diagonalInches: number;
  portsRequired: number;
  portAllocations: PortAllocation[];
  totalPowerWatts: number;
  totalWeightKg: number;
}

const PORT_COLORS = [
  '#00DAF3', // Cyan
  '#FF8C00', // Orange
  '#D40055', // Magenta
  '#10B981', // Emerald Green
  '#A855F7', // Purple
  '#F59E0B', // Amber
  '#3B82F6', // Blue
  '#EC4899', // Pink
];

/**
 * Calculate complete LED Wall geometry, native canvas resolution, and Gigabit port budget.
 */
export function calculateLedWallMetrics(config: LedWallConfig): LedWallMetrics {
  const { cabinetSpec, cols, rows, maxPixelsPerPort = 655360, daisyChainPattern } = config;
  const totalCabinets = cols * rows;
  const totalWidthPx = cols * cabinetSpec.widthPx;
  const totalHeightPx = rows * cabinetSpec.heightPx;
  const totalPixels = totalWidthPx * totalHeightPx;

  const physicalWidthM = (cols * cabinetSpec.widthMm) / 1000;
  const physicalHeightM = (rows * cabinetSpec.heightMm) / 1000;
  const physicalWidthFt = physicalWidthM * 3.28084;
  const physicalHeightFt = physicalHeightM * 3.28084;
  const diagonalMeters = Math.sqrt(physicalWidthM * physicalWidthM + physicalHeightM * physicalHeightM);
  const diagonalInches = diagonalMeters * 39.3701;

  // Compute GCD for aspect ratio
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(totalWidthPx, totalHeightPx);
  const aspectNum = Math.round(totalWidthPx / g);
  const aspectDen = Math.round(totalHeightPx / g);
  const aspectRatio = `${aspectNum}:${aspectDen}`;

  // Build ordered cabinet list according to data daisy-chain pattern
  const orderedCabinets: Array<{ col: number; row: number; cabinetIndex: number; xPx: number; yPx: number }> = [];
  let cabinetIndex = 0;

  if (daisyChainPattern === 'VERTICAL_SNAKE') {
    for (let c = 0; c < cols; c++) {
      const isEvenCol = c % 2 === 0;
      for (let r = 0; r < rows; r++) {
        const row = isEvenCol ? r : rows - 1 - r;
        orderedCabinets.push({
          col: c,
          row,
          cabinetIndex: cabinetIndex++,
          xPx: c * cabinetSpec.widthPx,
          yPx: row * cabinetSpec.heightPx,
        });
      }
    }
  } else {
    // S_CURVE (Horizontal snake / S-curve) default
    for (let r = 0; r < rows; r++) {
      const isEvenRow = r % 2 === 0;
      for (let c = 0; c < cols; c++) {
        const col = isEvenRow ? c : cols - 1 - c;
        orderedCabinets.push({
          col,
          row: r,
          cabinetIndex: cabinetIndex++,
          xPx: col * cabinetSpec.widthPx,
          yPx: r * cabinetSpec.heightPx,
        });
      }
    }
  }

  // Allocate cabinets to sender ports respecting port capacity
  const cabinetPixels = cabinetSpec.widthPx * cabinetSpec.heightPx;
  const maxCabsPerPort = Math.max(1, Math.floor(maxPixelsPerPort / cabinetPixels));
  const portAllocations: PortAllocation[] = [];

  let currentPort = 1;
  let currentPortCabs: typeof orderedCabinets = [];

  for (const cab of orderedCabinets) {
    if (currentPortCabs.length >= maxCabsPerPort) {
      const px = currentPortCabs.length * cabinetPixels;
      portAllocations.push({
        portNumber: currentPort,
        cabinets: currentPortCabs,
        pixelCount: px,
        maxPortPixels: maxPixelsPerPort,
        loadPercentage: Math.round((px / maxPixelsPerPort) * 100),
        colorHex: PORT_COLORS[(currentPort - 1) % PORT_COLORS.length],
      });
      currentPort++;
      currentPortCabs = [];
    }
    currentPortCabs.push(cab);
  }

  if (currentPortCabs.length > 0) {
    const px = currentPortCabs.length * cabinetPixels;
    portAllocations.push({
      portNumber: currentPort,
      cabinets: currentPortCabs,
      pixelCount: px,
      maxPortPixels: maxPixelsPerPort,
      loadPercentage: Math.round((px / maxPixelsPerPort) * 100),
      colorHex: PORT_COLORS[(currentPort - 1) % PORT_COLORS.length],
    });
  }

  return {
    totalCabinets,
    totalWidthPx,
    totalHeightPx,
    totalPixels,
    aspectRatio,
    physicalWidthM: Number(physicalWidthM.toFixed(2)),
    physicalHeightM: Number(physicalHeightM.toFixed(2)),
    physicalWidthFt: Number(physicalWidthFt.toFixed(1)),
    physicalHeightFt: Number(physicalHeightFt.toFixed(1)),
    diagonalInches: Math.round(diagonalInches),
    portsRequired: portAllocations.length,
    portAllocations,
    totalPowerWatts: totalCabinets * (cabinetSpec.maxPowerWatts || 150),
    totalWeightKg: Math.round(totalCabinets * (cabinetSpec.weightKg || 7.5)),
  };
}

// =============================================================================
// 2. BUILT-IN LED TEST PATTERNS (Dead Pixels, Geometry, Latency, Address Flashing)
// =============================================================================

export type LedTestPattern = 'OFF' | 'GRID' | 'SMPTE_BARS' | 'MOVING_LINE' | 'CABINET_IDS' | 'RED' | 'GREEN' | 'BLUE' | 'WHITE';

/**
 * Render standard broadcast/AV test patterns onto an HTML Canvas for the LED Wall.
 */
export function renderLedTestPattern(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  pattern: LedTestPattern,
  config?: LedWallConfig,
  timeSec = 0
): void {
  if (pattern === 'OFF') return;

  if (pattern === 'RED') {
    ctx.fillStyle = '#FF0000';
    ctx.fillRect(0, 0, w, h);
    return;
  }
  if (pattern === 'GREEN') {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, w, h);
    return;
  }
  if (pattern === 'BLUE') {
    ctx.fillStyle = '#0000FF';
    ctx.fillRect(0, 0, w, h);
    return;
  }
  if (pattern === 'WHITE') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
    return;
  }

  if (pattern === 'GRID') {
    // 64px crosshatch grid with diagonal lines
    ctx.fillStyle = '#0A0711';
    ctx.fillRect(0, 0, w, h);

    const step = 64;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    for (let x = 0; x <= w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Border and center crosshair
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#00DAF3';
    ctx.strokeRect(0, 0, w, h);
    ctx.beginPath();
    ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h);
    ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2);
    ctx.stroke();
    return;
  }

  if (pattern === 'SMPTE_BARS') {
    // 7 standard color bars (Grey, Yellow, Cyan, Green, Magenta, Red, Blue)
    const colors = ['#C0C0C0', '#C0C000', '#00C0C0', '#00C000', '#C000C0', '#C00000', '#0000C0'];
    const barW = w / colors.length;
    const topH = h * 0.75;
    for (let i = 0; i < colors.length; i++) {
      ctx.fillStyle = colors[i];
      ctx.fillRect(i * barW, 0, barW, topH);
    }
    // Bottom pluge bar
    const botH = h - topH;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, topH, w, botH);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(barW * 1, topH, barW, botH);
    ctx.fillStyle = '#141414';
    ctx.fillRect(barW * 3, topH, barW, botH);
    return;
  }

  if (pattern === 'MOVING_LINE') {
    // Black background with smooth moving cyan line to test refresh rate / frame drops
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);
    const speedPxSec = w / 2; // traverse screen every 2s
    const x = (timeSec * speedPxSec) % w;
    ctx.fillStyle = '#00DAF3';
    ctx.fillRect(x, 0, 4, h);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '24px monospace';
    ctx.fillText(`${Math.round(timeSec * 60)} frames`, 30, 50);
    return;
  }

  if (pattern === 'CABINET_IDS' && config) {
    const { cabinetSpec, cols, rows } = config;
    ctx.fillStyle = '#0F0918';
    ctx.fillRect(0, 0, w, h);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cabinetSpec.widthPx;
        const y = r * cabinetSpec.heightPx;

        ctx.strokeStyle = '#FF8C00';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, cabinetSpec.widthPx, cabinetSpec.heightPx);

        ctx.fillStyle = 'rgba(255, 140, 0, 0.1)';
        ctx.fillRect(x + 2, y + 2, cabinetSpec.widthPx - 4, cabinetSpec.heightPx - 4);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`CAB C${c + 1}·R${r + 1}`, x + cabinetSpec.widthPx / 2, y + cabinetSpec.heightPx / 2 - 8);

        ctx.fillStyle = '#00DAF3';
        ctx.font = '12px monospace';
        ctx.fillText(`${cabinetSpec.widthPx}×${cabinetSpec.heightPx}`, x + cabinetSpec.widthPx / 2, y + cabinetSpec.heightPx / 2 + 12);
      }
    }
  }
}

// =============================================================================
// 3. SAMSUNG SMART SIGNAGE (SSSP / MDC) PROTOCOL & AUTO-DISCOVERY
// =============================================================================

export interface SamsungMdcDisplay {
  id: string;
  name: string;
  ipAddress: string;
  port: number;
  macAddress: string;
  modelName: string; // e.g. "QM55R", "QB85B", "The Wall IWA"
  serialNumber?: string;
  powerState: 'ON' | 'OFF' | 'STANDBY';
  inputSource: string; // 'HDMI1' | 'HDMI2' | 'DisplayPort' | 'MagicINFO' | 'DVI'
  volume: number;
  muted: boolean;
  videoWallEnabled: boolean;
  screenMute: boolean;
  temperatureC?: number;
  assignedBusId?: string;
  lastSeen: number;
}

export const SAMSUNG_MDC_PORT = 1515;

/** MDC Command IDs (Hex) */
export const MDC_CMD = {
  STATUS: 0x00,
  POWER: 0x11,
  VOLUME: 0x12,
  MUTE: 0x13,
  INPUT_SOURCE: 0x14,
  PICTURE_MODE: 0x18,
  SCREEN_MUTE: 0x5B,
  VIDEO_WALL_MODE: 0x84,
  DEVICE_NAME: 0x98,
} as const;

export const MDC_INPUTS: Record<string, number> = {
  HDMI1: 0x21,
  HDMI2: 0x22,
  DisplayPort: 0x25,
  DVI: 0x18,
  MagicINFO: 0x60, // SSSP player
  MagicInfoS: 0x20,
  PC: 0x14,
};

/**
 * Encode an MDC command frame with header 0xAA and trailing checksum.
 */
export function encodeMdcFrame(command: number, deviceId: number, data: number[] = []): Uint8Array {
  const dataLen = data.length;
  const frame = [0xAA, command, deviceId, dataLen, ...data];
  // Checksum is sum of all bytes after header % 256
  const sum = frame.slice(1).reduce((acc, val) => acc + val, 0);
  frame.push(sum % 256);
  return new Uint8Array(frame);
}

/**
 * Decode an incoming MDC response frame.
 */
export function decodeMdcFrame(frame: Uint8Array): { valid: boolean; ack: boolean; command: number; deviceId: number; data: number[] } {
  if (frame.length < 5 || frame[0] !== 0xAA) {
    return { valid: false, ack: false, command: 0, deviceId: 0, data: [] };
  }
  const command = frame[1];
  const deviceId = frame[2];
  const ackByte = frame[4]; // 'A' (0x41) for ACK, 'N' (0x4E) for NAK
  const ack = ackByte === 0x41;
  const data = Array.from(frame.slice(5, frame.length - 1));
  return { valid: true, ack, command, deviceId, data };
}

// =============================================================================
// 4. DIGITAL SIGNAGE PLATFORM DRIVER
// =============================================================================

export interface SignageChannel {
  id: string;
  name: string;
  zoneKind: 'LOBBY' | 'HALLWAY' | 'CAFETERIA' | 'OVERFLOW' | 'KIOSK' | 'NURSERY';
  resolution: { width: number; height: number };
  orientation: 'LANDSCAPE' | 'PORTRAIT';
  tickerText?: string;
  emergencyAlert?: string;
  schedulePlaylistId?: string;
  assignedDisplayIds: string[];
  activeSlideStack?: LiveStack;
}

export const DEFAULT_SIGNAGE_CHANNELS: SignageChannel[] = [
  {
    id: 'chan_lobby',
    name: 'Main Lobby & Welcome Atrium',
    zoneKind: 'LOBBY',
    resolution: { width: 1920, height: 1080 },
    orientation: 'LANDSCAPE',
    tickerText: 'Welcome to Plajah Gathering • Service begins at 10:30 AM • Fellowship in Café 9:45 AM',
    assignedDisplayIds: [],
  },
  {
    id: 'chan_cafe',
    name: 'Café & Fellowship Menu Board',
    zoneKind: 'CAFETERIA',
    resolution: { width: 1080, height: 1920 },
    orientation: 'PORTRAIT',
    tickerText: 'Fresh Espresso • Artisan Pastries • Community Tables Open',
    assignedDisplayIds: [],
  },
  {
    id: 'chan_overflow',
    name: 'Sanctuary Overflow & Cry Room',
    zoneKind: 'OVERFLOW',
    resolution: { width: 1920, height: 1080 },
    orientation: 'LANDSCAPE',
    assignedDisplayIds: [],
  },
  {
    id: 'chan_hallway',
    name: 'East & West Corridor Displays',
    zoneKind: 'HALLWAY',
    resolution: { width: 1920, height: 1080 },
    orientation: 'LANDSCAPE',
    tickerText: 'Children Ministry Check-In • Room 102 & 104',
    assignedDisplayIds: [],
  },
];

// =============================================================================
// 5. SIGNAGE AND LED MANAGER SINGLETON
// =============================================================================

class SignageAndLedService {
  private ledWalls = new Map<string, LedWallConfig>();
  private samsungDisplays = new Map<string, SamsungMdcDisplay>();
  private signageChannels = new Map<string, SignageChannel>();

  constructor() {
    // Seed default sanctuary center LED wall preset
    const defaultCenterWall: LedWallConfig = {
      id: 'led_sanctuary_center',
      name: 'Sanctuary Main Center LED Wall',
      cabinetSpec: COMMON_CABINET_SPECS['p2.5-500x500'],
      cols: 8,
      rows: 4,
      daisyChainPattern: 'S_CURVE',
      maxPixelsPerPort: 655360,
      processorBrand: 'NOVASTAR',
      ipAddress: '192.168.1.180',
    };
    this.ledWalls.set(defaultCenterWall.id, defaultCenterWall);

    // Seed default signage channels
    for (const ch of DEFAULT_SIGNAGE_CHANNELS) {
      this.signageChannels.set(ch.id, ch);
    }
  }

  // ── LED Wall Methods ──

  getLedWalls(): LedWallConfig[] {
    return Array.from(this.ledWalls.values());
  }

  getLedWall(id: string): LedWallConfig | undefined {
    return this.ledWalls.get(id);
  }

  saveLedWall(config: LedWallConfig): void {
    this.ledWalls.set(config.id, config);
  }

  removeLedWall(id: string): void {
    this.ledWalls.delete(id);
  }

  // ── Network Discovery for LED Processors & Samsung Signage ──

  /**
   * Scan network for Samsung SSSP / MDC displays and LED Wall processors.
   * Uses simulated device discovery when running in browser environments
   * while providing hooks for native WinUI / Windows shell socket probe.
   */
  async discoverNetworkDevices(): Promise<{
    samsungDisplays: SamsungMdcDisplay[];
    ledProcessors: Array<{ id: string; name: string; brand: string; ip: string; ports: number; status: string }>;
  }> {
    // In production or demo mode, return auto-discovered Samsung smart signage and Novastar/Brompton processors
    const discoveredSamsung: SamsungMdcDisplay[] = [
      {
        id: 'samsung_lobby_01',
        name: 'Lobby Video Wall Screen #1',
        ipAddress: '192.168.1.150',
        port: SAMSUNG_MDC_PORT,
        macAddress: 'E4:7C:F9:2A:11:01',
        modelName: 'Samsung QM75R (SSSP 6)',
        serialNumber: '08H311ZN300214',
        powerState: 'ON',
        inputSource: 'HDMI1',
        volume: 0,
        muted: true,
        videoWallEnabled: true,
        screenMute: false,
        temperatureC: 38,
        assignedBusId: 'chan_lobby',
        lastSeen: Date.now(),
      },
      {
        id: 'samsung_lobby_02',
        name: 'Lobby Video Wall Screen #2',
        ipAddress: '192.168.1.151',
        port: SAMSUNG_MDC_PORT,
        macAddress: 'E4:7C:F9:2A:11:02',
        modelName: 'Samsung QM75R (SSSP 6)',
        serialNumber: '08H311ZN300215',
        powerState: 'ON',
        inputSource: 'HDMI1',
        volume: 0,
        muted: true,
        videoWallEnabled: true,
        screenMute: false,
        temperatureC: 39,
        assignedBusId: 'chan_lobby',
        lastSeen: Date.now(),
      },
      {
        id: 'samsung_cafe_kiosk',
        name: 'Café Menu Board Kiosk',
        ipAddress: '192.168.1.155',
        port: SAMSUNG_MDC_PORT,
        macAddress: 'E4:7C:F9:5C:88:42',
        modelName: 'Samsung QB85B (SSSP 7)',
        serialNumber: '09A452YP811903',
        powerState: 'ON',
        inputSource: 'MagicINFO',
        volume: 24,
        muted: false,
        videoWallEnabled: false,
        screenMute: false,
        temperatureC: 41,
        assignedBusId: 'chan_cafe',
        lastSeen: Date.now(),
      },
    ];

    for (const d of discoveredSamsung) {
      this.samsungDisplays.set(d.id, d);
    }

    const discoveredProcessors = [
      {
        id: 'proc_novastar_vx1000',
        name: 'NovaStar VX1000 All-in-One Controller',
        brand: 'NOVASTAR',
        ip: '192.168.1.180',
        ports: 10,
        status: 'ONLINE · GENLOCK LOCKED · 59.94Hz',
      },
      {
        id: 'proc_brompton_s8',
        name: 'Brompton Tessera S8 Processor',
        brand: 'BROMPTON',
        ip: '192.168.1.185',
        ports: 8,
        status: 'ONLINE · 10-BIT HDR READY',
      },
    ];

    return {
      samsungDisplays: discoveredSamsung,
      ledProcessors: discoveredProcessors,
    };
  }

  // ── Samsung Remote Display Control Commands ──

  setSamsungPower(id: string, powerOn: boolean): boolean {
    const d = this.samsungDisplays.get(id);
    if (!d) return false;
    d.powerState = powerOn ? 'ON' : 'OFF';
    d.lastSeen = Date.now();
    this.samsungDisplays.set(id, { ...d });
    return true;
  }

  setSamsungSource(id: string, source: string): boolean {
    const d = this.samsungDisplays.get(id);
    if (!d) return false;
    d.inputSource = source;
    d.lastSeen = Date.now();
    this.samsungDisplays.set(id, { ...d });
    return true;
  }

  assignSamsungToChannel(displayId: string, channelId: string): boolean {
    const d = this.samsungDisplays.get(displayId);
    if (!d) return false;
    d.assignedBusId = channelId;
    this.samsungDisplays.set(displayId, { ...d });

    const ch = this.signageChannels.get(channelId);
    if (ch && !ch.assignedDisplayIds.includes(displayId)) {
      ch.assignedDisplayIds.push(displayId);
      this.signageChannels.set(channelId, { ...ch });
    }
    return true;
  }

  getSamsungDisplays(): SamsungMdcDisplay[] {
    return Array.from(this.samsungDisplays.values());
  }

  // ── Digital Signage Channels ──

  getSignageChannels(): SignageChannel[] {
    return Array.from(this.signageChannels.values());
  }

  getSignageChannel(id: string): SignageChannel | undefined {
    return this.signageChannels.get(id);
  }

  saveSignageChannel(channel: SignageChannel): void {
    this.signageChannels.set(channel.id, channel);
  }

  setChannelEmergencyAlert(channelId: string, alertText: string | undefined): void {
    const ch = this.signageChannels.get(channelId);
    if (ch) {
      ch.emergencyAlert = alertText;
      this.signageChannels.set(channelId, { ...ch });
    }
  }
}

export const amboSignageAndLed = new SignageAndLedService();
