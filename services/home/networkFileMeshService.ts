/**
 * services/home/networkFileMeshService.ts
 *
 * Lightweight, zero-configuration peer-to-peer network file explorer & transfer engine
 * for Plajah Home. Inspired by LocalSend, Syncthing, and WebRTC DataChannels.
 *
 * Allows family devices (PCs, laptops, tablets, Xbox consoles) signed into the same
 * Plajah account on the local network to automatically discover each other and share
 * folders seamlessly without manual OS-level SMB/Samba, firewall, or port forwarding.
 *
 * Also includes a streamlined FTP / SFTP / WebDAV client bridge (clean, modern alternative to FileZilla).
 */

export interface NetworkDeviceNode {
  id: string;
  name: string;
  deviceType: 'desktop' | 'laptop' | 'console' | 'tablet' | 'phone' | 'nas';
  os: 'windows' | 'macos' | 'linux' | 'xbox' | 'ios' | 'android';
  ipAddress: string;
  port: number;
  isOnline: boolean;
  lastSeen: number;
  latencyMs: number;
  availableStorageGb: number;
  sharedFolders: SharedFolder[];
}

export interface SharedFolder {
  id: string;
  name: string;
  path: string;
  isWritable: boolean;
  category: 'videos' | 'projects' | 'renders' | 'photos' | 'documents' | 'general';
  itemCount: number;
  sizeBytes: number;
}

export interface FileItem {
  id: string;
  name: string;
  path: string;
  sizeBytes: number;
  modifiedAt: number;
  isDirectory: boolean;
  extension?: string;
  mimeType?: string;
  thumbnailUrl?: string;
  deviceId: string;
}

export type TransferProtocol = 'plajah-p2p' | 'ftp' | 'sftp' | 'webdav';

export interface FtpConnectionConfig {
  id: string;
  label: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  protocol: TransferProtocol;
  remotePath: string;
  isEncrypted: boolean;
}

export interface FileTransferJob {
  id: string;
  filename: string;
  sizeBytes: number;
  transferredBytes: number;
  progressPercent: number;
  speedBytesPerSec: number;
  status: 'queued' | 'transferring' | 'paused' | 'completed' | 'failed';
  sourceDevice: string;
  destinationDevice: string;
  protocol: TransferProtocol;
  startedAt: number;
  etaSeconds: number;
  error?: string;
}

// ==========================================
// MOCK PEER REGISTRY & SHARED DIRECTORIES
// ==========================================

const INITIAL_DEVICES: NetworkDeviceNode[] = [
  {
    id: 'dev-studio-rig',
    name: "Kenny's Studio Rig (RTX 4090)",
    deviceType: 'desktop',
    os: 'windows',
    ipAddress: '192.168.1.104',
    port: 53317,
    isOnline: true,
    lastSeen: Date.now(),
    latencyMs: 1.2,
    availableStorageGb: 3420,
    sharedFolders: [
      { id: 'sf-fabula', name: 'Fabula 4K Renders', path: 'D:/Plajah/Renders', isWritable: true, category: 'renders', itemCount: 142, sizeBytes: 248000000000 },
      { id: 'sf-3d', name: '3D Assets & Textures', path: 'D:/Assets/3D', isWritable: true, category: 'projects', itemCount: 864, sizeBytes: 112000000000 },
      { id: 'sf-family', name: 'Family Archive & Media', path: 'E:/Media/Family', isWritable: false, category: 'photos', itemCount: 3200, sizeBytes: 85000000000 },
    ]
  },
  {
    id: 'dev-xbox-hub',
    name: 'Living Room Xbox One Hub',
    deviceType: 'console',
    os: 'xbox',
    ipAddress: '192.168.1.115',
    port: 53317,
    isOnline: true,
    lastSeen: Date.now() - 12000,
    latencyMs: 3.8,
    availableStorageGb: 480,
    sharedFolders: [
      { id: 'sf-xbox-clips', name: 'Console DVR & Captures', path: '/Content/Captures', isWritable: true, category: 'videos', itemCount: 38, sizeBytes: 42000000000 },
      { id: 'sf-stream-cache', name: 'Chora Audio Cache', path: '/Cache/Audio', isWritable: true, category: 'general', itemCount: 95, sizeBytes: 8500000000 },
    ]
  },
  {
    id: 'dev-laptop-air',
    name: "Kenny's Mobile Laptop",
    deviceType: 'laptop',
    os: 'windows',
    ipAddress: '192.168.1.142',
    port: 53317,
    isOnline: true,
    lastSeen: Date.now() - 4000,
    latencyMs: 2.1,
    availableStorageGb: 195,
    sharedFolders: [
      { id: 'sf-school', name: 'Academia Study Notes', path: 'C:/Users/Kenny/Documents/Academia', isWritable: true, category: 'documents', itemCount: 64, sizeBytes: 1200000000 },
      { id: 'sf-drafts', name: 'Fabula Script Drafts', path: 'C:/Users/Kenny/Projects/Scripts', isWritable: true, category: 'projects', itemCount: 29, sizeBytes: 450000000 },
    ]
  },
  {
    id: 'dev-kitchen-pad',
    name: 'Kitchen Hub Tablet',
    deviceType: 'tablet',
    os: 'android',
    ipAddress: '192.168.1.168',
    port: 53317,
    isOnline: true,
    lastSeen: Date.now() - 30000,
    latencyMs: 6.4,
    availableStorageGb: 58,
    sharedFolders: [
      { id: 'sf-recipes', name: 'Family Recipes & Notes', path: '/storage/emulated/0/Recipes', isWritable: true, category: 'documents', itemCount: 18, sizeBytes: 45000000 },
    ]
  },
  {
    id: 'dev-home-nas',
    name: 'Plajah Vault NAS (TrueNAS)',
    deviceType: 'nas',
    os: 'linux',
    ipAddress: '192.168.1.200',
    port: 21,
    isOnline: true,
    lastSeen: Date.now(),
    latencyMs: 0.9,
    availableStorageGb: 14200,
    sharedFolders: [
      { id: 'sf-vault-backup', name: 'Whole Home Snapshot Backups', path: '/mnt/tank/backups', isWritable: true, category: 'general', itemCount: 1240, sizeBytes: 3400000000000 },
      { id: 'sf-vault-lossless', name: 'Chora Lossless FLAC Master Library', path: '/mnt/tank/music', isWritable: false, category: 'general', itemCount: 8400, sizeBytes: 680000000000 },
    ]
  }
];

const INITIAL_MOCK_FILES: Record<string, FileItem[]> = {
  'sf-fabula': [
    { id: 'f-1', name: 'Fabula_Hero_Intro_ProRes422_4K.mov', path: 'D:/Plajah/Renders/Fabula_Hero_Intro_ProRes422_4K.mov', sizeBytes: 14200000000, modifiedAt: Date.now() - 86400000, isDirectory: false, extension: 'mov', mimeType: 'video/quicktime', deviceId: 'dev-studio-rig' },
    { id: 'f-2', name: 'Cyberpunk_Atmosphere_Pass01.exr', path: 'D:/Plajah/Renders/Cyberpunk_Atmosphere_Pass01.exr', sizeBytes: 420000000, modifiedAt: Date.now() - 3600000, isDirectory: false, extension: 'exr', mimeType: 'image/x-exr', deviceId: 'dev-studio-rig' },
    { id: 'f-3', name: 'ColorGrade_Lounge_3DLUT.cube', path: 'D:/Plajah/Renders/ColorGrade_Lounge_3DLUT.cube', sizeBytes: 8500000, modifiedAt: Date.now() - 7200000, isDirectory: false, extension: 'cube', mimeType: 'text/plain', deviceId: 'dev-studio-rig' },
    { id: 'f-4', name: 'Timeline_Audio_Master_Stems', path: 'D:/Plajah/Renders/Timeline_Audio_Master_Stems', sizeBytes: 1850000000, modifiedAt: Date.now() - 14400000, isDirectory: true, deviceId: 'dev-studio-rig' },
  ],
  'sf-3d': [
    { id: 'f-5', name: 'SciFi_Corridor_Model.glb', path: 'D:/Assets/3D/SciFi_Corridor_Model.glb', sizeBytes: 245000000, modifiedAt: Date.now() - 172800000, isDirectory: false, extension: 'glb', mimeType: 'model/gltf-binary', deviceId: 'dev-studio-rig' },
    { id: 'f-6', name: 'Aria_Hologram_Avatar.fbx', path: 'D:/Assets/3D/Aria_Hologram_Avatar.fbx', sizeBytes: 88000000, modifiedAt: Date.now() - 259200000, isDirectory: false, extension: 'fbx', mimeType: 'application/octet-stream', deviceId: 'dev-studio-rig' },
  ],
  'sf-school': [
    { id: 'f-7', name: 'Computer_Architecture_Week4_Notes.pdf', path: 'C:/Users/Kenny/Documents/Academia/Computer_Architecture_Week4_Notes.pdf', sizeBytes: 14500000, modifiedAt: Date.now() - 43200000, isDirectory: false, extension: 'pdf', mimeType: 'application/pdf', deviceId: 'dev-laptop-air' },
    { id: 'f-8', name: 'Socratic_Study_Prompts_ProfVance.md', path: 'C:/Users/Kenny/Documents/Academia/Socratic_Study_Prompts_ProfVance.md', sizeBytes: 42000, modifiedAt: Date.now() - 18000000, isDirectory: false, extension: 'md', mimeType: 'text/markdown', deviceId: 'dev-laptop-air' },
  ]
};

// ==========================================
// SERVICE IMPLEMENTATION
// ==========================================

class NetworkFileMeshService {
  private devices: NetworkDeviceNode[] = INITIAL_DEVICES;
  private transferQueue: FileTransferJob[] = [
    {
      id: 'tx-101',
      filename: 'Fabula_Scene03_Render_Chunk02.exr',
      sizeBytes: 850000000,
      transferredBytes: 595000000,
      progressPercent: 70,
      speedBytesPerSec: 92400000, // ~92.4 MB/s LAN speed
      status: 'transferring',
      sourceDevice: "Kenny's Studio Rig (RTX 4090)",
      destinationDevice: 'Living Room Xbox One Hub',
      protocol: 'plajah-p2p',
      startedAt: Date.now() - 6000,
      etaSeconds: 3
    }
  ];

  private ftpPresets: FtpConnectionConfig[] = [
    {
      id: 'ftp-nas',
      label: 'Home TrueNAS Server (SFTP)',
      host: '192.168.1.200',
      port: 22,
      username: 'kenny',
      protocol: 'sftp',
      remotePath: '/mnt/tank/plajah',
      isEncrypted: true
    },
    {
      id: 'ftp-studio-render',
      label: 'Studio Render Cache (FTP)',
      host: '192.168.1.104',
      port: 21,
      username: 'renderworker',
      protocol: 'ftp',
      remotePath: '/Renders/Fabula',
      isEncrypted: false
    }
  ];

  /**
   * Get all discovered network devices on the family mesh
   */
  public getNetworkDevices(): NetworkDeviceNode[] {
    return [...this.devices];
  }

  /**
   * Scan / Ping local network peers (LocalSend mDNS broadcast simulation)
   */
  public async discoverPeers(): Promise<NetworkDeviceNode[]> {
    // Simulate instantaneous zero-config LAN beacon
    return new Promise((resolve) => {
      setTimeout(() => {
        this.devices.forEach((d) => {
          d.lastSeen = Date.now();
          d.latencyMs = Math.round((Math.random() * 3 + 0.8) * 10) / 10;
        });
        resolve([...this.devices]);
      }, 400);
    });
  }

  /**
   * List files in a shared folder across devices
   */
  public async listFolderContents(folderId: string): Promise<FileItem[]> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const files = INITIAL_MOCK_FILES[folderId] || [
          {
            id: `f-mock-${Date.now()}`,
            name: 'Shared_Media_Batch_01.tar.gz',
            path: '/shared/Shared_Media_Batch_01.tar.gz',
            sizeBytes: 1048576000,
            modifiedAt: Date.now() - 3600000,
            isDirectory: false,
            extension: 'gz',
            mimeType: 'application/gzip',
            deviceId: 'dev-studio-rig'
          }
        ];
        resolve(files);
      }, 150);
    });
  }

  /**
   * Initiate a zero-friction peer-to-peer file transfer
   */
  public initiateTransfer(
    file: FileItem,
    sourceDeviceId: string,
    targetDeviceId: string,
    protocol: TransferProtocol = 'plajah-p2p'
  ): FileTransferJob {
    const source = this.devices.find((d) => d.id === sourceDeviceId)?.name || 'Source Node';
    const dest = this.devices.find((d) => d.id === targetDeviceId)?.name || 'Target Node';

    const job: FileTransferJob = {
      id: `tx-${Date.now().toString(36)}`,
      filename: file.name,
      sizeBytes: file.sizeBytes,
      transferredBytes: 0,
      progressPercent: 0,
      speedBytesPerSec: 88500000, // 88.5 MB/s LAN
      status: 'transferring',
      sourceDevice: source,
      destinationDevice: dest,
      protocol,
      startedAt: Date.now(),
      etaSeconds: Math.ceil(file.sizeBytes / 88500000) || 1
    };

    this.transferQueue.unshift(job);
    return job;
  }

  /**
   * Get active and historical transfer queue
   */
  public getTransferQueue(): FileTransferJob[] {
    return [...this.transferQueue];
  }

  /**
   * Cancel or pause a transfer
   */
  public cancelTransfer(jobId: string): void {
    const job = this.transferQueue.find((j) => j.id === jobId);
    if (job) {
      job.status = 'failed';
      job.error = 'Cancelled by user';
    }
  }

  /**
   * Quick Connect / Saved FTP Bookmarks
   */
  public getFtpBookmarks(): FtpConnectionConfig[] {
    return [...this.ftpPresets];
  }

  public addFtpBookmark(config: Omit<FtpConnectionConfig, 'id'>): FtpConnectionConfig {
    const newConfig: FtpConnectionConfig = {
      ...config,
      id: `ftp-${Date.now().toString(36)}`
    };
    this.ftpPresets.push(newConfig);
    return newConfig;
  }
}

export const networkFileMeshService = new NetworkFileMeshService();
export default networkFileMeshService;
