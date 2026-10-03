import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Folder, File, HardDrive, Laptop, Monitor, Smartphone,
  Download, Upload, Server, RefreshCw, CheckCircle2,
  ArrowRight, ShieldCheck, Zap, X, Pause, Play, Globe
} from 'lucide-react';
import {
  networkFileMeshService,
  NetworkDeviceNode,
  SharedFolder,
  FileItem,
  FileTransferJob,
  FtpConnectionConfig
} from '../../services/home/networkFileMeshService';

export const NetworkFileExplorer: React.FC = () => {
  const [devices, setDevices] = useState<NetworkDeviceNode[]>(() => networkFileMeshService.getNetworkDevices());
  const [selectedDevice, setSelectedDevice] = useState<NetworkDeviceNode>(devices[0]);
  const [selectedFolder, setSelectedFolder] = useState<SharedFolder>(devices[0]?.sharedFolders[0]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [transfers, setTransfers] = useState<FileTransferJob[]>(() => networkFileMeshService.getTransferQueue());
  const [ftpBookmarks, setFtpBookmarks] = useState<FtpConnectionConfig[]>(() => networkFileMeshService.getFtpBookmarks());
  const [isScanning, setIsScanning] = useState(false);
  const [activeTab, setActiveTab] = useState<'mesh' | 'ftp'>('mesh');

  // Quick Connect state for simple FTP
  const [ftpHost, setFtpHost] = useState('');
  const [ftpUser, setFtpUser] = useState('');
  const [ftpPort, setFtpPort] = useState('21');
  const [ftpProtocol, setFtpProtocol] = useState<'ftp' | 'sftp' | 'webdav'>('sftp');

  // Fetch folder files on selection
  React.useEffect(() => {
    if (selectedFolder) {
      networkFileMeshService.listFolderContents(selectedFolder.id).then(setFiles);
    }
  }, [selectedFolder]);

  const handleScanPeers = async () => {
    setIsScanning(true);
    const updated = await networkFileMeshService.discoverPeers();
    setDevices(updated);
    setIsScanning(false);
  };

  const handleQuickTransfer = (file: FileItem) => {
    const target = devices.find(d => d.id !== selectedDevice.id) || devices[0];
    const job = networkFileMeshService.initiateTransfer(file, selectedDevice.id, target.id);
    setTransfers(networkFileMeshService.getTransferQueue());
  };

  const formatBytes = (bytes: number): string => {
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return bytes + ' B';
  };

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'desktop': return <Monitor className="w-5 h-5 text-[#FF8C00]" />;
      case 'laptop': return <Laptop className="w-5 h-5 text-[#00DAF3]" />;
      case 'console': return <HardDrive className="w-5 h-5 text-[#D40055]" />;
      case 'tablet': return <Smartphone className="w-5 h-5 text-[#D0BCFF]" />;
      default: return <Server className="w-5 h-5 text-[#06D6A0]" />;
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full text-white">
      
      {/* HEADER BAR & TAB SWITCHER */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-3xl bg-[rgba(22,6,36,0.65)] border border-[#D40055]/30 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#6B0099] to-[#FF8C00] flex items-center justify-center text-black font-black shadow-lg">
            <Folder className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono tracking-widest text-[#D0BCFF] uppercase font-bold">Plajah Mesh Storage</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#06D6A0]/20 text-[#06D6A0] border border-[#06D6A0]/40">
                Zero-Config LAN
              </span>
            </div>
            <h2 className="text-xl font-bold font-['Outfit']">Network File Explorer & FTP Bridge</h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center p-1 rounded-2xl bg-white/[0.05] border border-white/10">
            <button
              onClick={() => setActiveTab('mesh')}
              className={`px-4 py-1.5 rounded-xl text-xs font-mono font-bold transition ${
                activeTab === 'mesh' ? 'bg-[#FF8C00] text-[#12080a] shadow-md' : 'text-white/70 hover:text-white'
              }`}
            >
              Family Device Mesh
            </button>
            <button
              onClick={() => setActiveTab('ftp')}
              className={`px-4 py-1.5 rounded-xl text-xs font-mono font-bold transition ${
                activeTab === 'ftp' ? 'bg-[#FF8C00] text-[#12080a] shadow-md' : 'text-white/70 hover:text-white'
              }`}
            >
              FTP / SFTP Bridge
            </button>
          </div>

          <button
            onClick={handleScanPeers}
            disabled={isScanning}
            className="p-2.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 transition active:scale-95 text-[#D0BCFF]"
            title="Rescan Network Peers"
          >
            <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {activeTab === 'mesh' ? (
        /* FAMILY MESH BROWSER */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* LEFT 4 COLS: Connected Devices & Shared Folders */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="p-5 rounded-3xl bg-[rgba(22,6,36,0.65)] border border-[#D40055]/20 backdrop-blur-xl">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-mono font-bold text-white/50 uppercase">Network Devices ({devices.length})</span>
                <span className="text-[10px] font-mono text-[#06D6A0]">● Instant P2P Sync</span>
              </div>

              <div className="flex flex-col gap-2">
                {devices.map((device) => {
                  const isSelected = selectedDevice.id === device.id;
                  return (
                    <div
                      key={device.id}
                      onClick={() => {
                        setSelectedDevice(device);
                        if (device.sharedFolders[0]) setSelectedFolder(device.sharedFolders[0]);
                      }}
                      className={`p-3.5 rounded-2xl cursor-pointer transition border ${
                        isSelected
                          ? 'bg-gradient-to-r from-[#6B0099]/50 to-[#D40055]/40 border-[#FF8C00]/60 shadow-lg'
                          : 'bg-white/[0.03] border-white/5 hover:border-white/20 hover:bg-white/[0.06]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {getDeviceIcon(device.deviceType)}
                          <div>
                            <h4 className="text-sm font-bold text-white font-['Outfit']">{device.name}</h4>
                            <span className="text-[10px] font-mono text-white/50">{device.ipAddress} • {device.latencyMs}ms ping</span>
                          </div>
                        </div>
                        <span className="text-xs font-mono text-white/70">{device.availableStorageGb}GB Free</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* SHARED FOLDERS FOR SELECTED DEVICE */}
              <div className="mt-6 pt-4 border-t border-white/10">
                <span className="text-xs font-mono font-bold text-white/50 uppercase block mb-3">
                  Shared on {selectedDevice.name.split(' ')[0]}
                </span>
                <div className="flex flex-col gap-2">
                  {selectedDevice.sharedFolders.map((folder) => {
                    const isSelected = selectedFolder?.id === folder.id;
                    return (
                      <button
                        key={folder.id}
                        onClick={() => setSelectedFolder(folder)}
                        className={`w-full p-3 rounded-2xl flex items-center justify-between text-left transition border ${
                          isSelected
                            ? 'bg-[#FF8C00] text-[#12080a] font-bold border-[#FF8C00]'
                            : 'bg-white/[0.03] text-white/80 border-white/5 hover:bg-white/[0.08]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Folder className="w-4 h-4" />
                          <span className="text-xs font-medium">{folder.name}</span>
                        </div>
                        <span className="text-[10px] font-mono opacity-80">{folder.itemCount} items</span>
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>

          {/* RIGHT 8 COLS: Files List & Instant One-Click Beam */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            <div className="p-6 rounded-3xl bg-[rgba(22,6,36,0.65)] border border-[#D40055]/20 backdrop-blur-xl flex flex-col justify-between min-h-[440px]">
              
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
                  <div>
                    <span className="text-xs font-mono text-[#D0BCFF]">PATH: {selectedFolder?.path || '/'}</span>
                    <h3 className="text-lg font-bold font-['Outfit'] text-white">{selectedFolder?.name}</h3>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-mono bg-white/[0.06] border border-white/10 text-white/80">
                    {files.length} Files Available
                  </span>
                </div>

                {/* File list items */}
                <div className="flex flex-col gap-2">
                  {files.map((file) => (
                    <div
                      key={file.id}
                      className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-[#D40055]/50 flex items-center justify-between transition group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#6B0099]/20 border border-[#6B0099]/40 flex items-center justify-center text-[#D0BCFF]">
                          {file.isDirectory ? <Folder className="w-5 h-5 text-[#FF8C00]" /> : <File className="w-5 h-5" />}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-white group-hover:text-[#FF8C00] transition">
                            {file.name}
                          </div>
                          <div className="text-xs font-mono text-white/40">
                            {formatBytes(file.sizeBytes)} • Modified {new Date(file.modifiedAt).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleQuickTransfer(file)}
                        className="px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold bg-[#FF8C00] hover:bg-[#FFA133] text-[#12080a] flex items-center gap-1.5 transition active:scale-95 shadow-md"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>Beam to LAN</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* ACTIVE TRANSFER QUEUE AT BOTTOM */}
              {transfers.length > 0 && (
                <div className="mt-6 pt-4 border-t border-white/10">
                  <span className="text-xs font-mono font-bold text-white/50 uppercase block mb-2">Active Transfer Stream</span>
                  {transfers.slice(0, 2).map((t) => (
                    <div key={t.id} className="p-3.5 rounded-2xl bg-black/40 border border-white/10 flex flex-col gap-2">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-white font-semibold">{t.filename}</span>
                        <span className="text-[#06D6A0] font-bold">{(t.speedBytesPerSec / 1048576).toFixed(1)} MB/s ({t.progressPercent}%)</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] transition-all duration-300"
                          style={{ width: `${t.progressPercent}%` }}
                        ></div>
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-mono text-white/50">
                        <span>{t.sourceDevice} ➔ {t.destinationDevice}</span>
                        <span>ETA: {t.etaSeconds}s</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

            </div>
          </div>

        </div>
      ) : (
        /* SIMPLE STRAIGHTFORWARD FTP / SFTP CLIENT (FileZilla alternative) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Quick Connect Bar & Bookmarks */}
          <div className="lg:col-span-12 p-6 rounded-3xl bg-[rgba(22,6,36,0.65)] border border-[#D40055]/20 backdrop-blur-xl flex flex-col gap-4">
            <span className="text-xs font-mono font-bold text-white/50 uppercase">Quick Connect (FileZilla Simplicity)</span>
            
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-3">
                <label className="text-[10px] font-mono text-white/60 uppercase block mb-1">Protocol</label>
                <select
                  value={ftpProtocol}
                  onChange={(e) => setFtpProtocol(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-xs font-mono text-white focus:outline-none focus:border-[#FF8C00]"
                >
                  <option value="sftp">SFTP (SSH File Transfer)</option>
                  <option value="ftp">FTP (Standard)</option>
                  <option value="webdav">WebDAV</option>
                </select>
              </div>

              <div className="sm:col-span-4">
                <label className="text-[10px] font-mono text-white/60 uppercase block mb-1">Host / Server IP</label>
                <input
                  type="text"
                  placeholder="192.168.1.200 or sftp.domain.com"
                  value={ftpHost}
                  onChange={(e) => setFtpHost(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-xs font-mono text-white focus:outline-none focus:border-[#FF8C00]"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="text-[10px] font-mono text-white/60 uppercase block mb-1">Username</label>
                <input
                  type="text"
                  placeholder="kenny or root"
                  value={ftpUser}
                  onChange={(e) => setFtpUser(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-xs font-mono text-white focus:outline-none focus:border-[#FF8C00]"
                />
              </div>

              <div className="sm:col-span-2 flex items-end">
                <button
                  onClick={() => alert(`Connecting to ${ftpProtocol.toUpperCase()}://${ftpHost || '192.168.1.200'}...`)}
                  className="w-full py-2 rounded-xl bg-[#FF8C00] hover:bg-[#FFA133] text-[#12080a] font-mono font-bold text-xs shadow-md transition"
                >
                  Connect
                </button>
              </div>
            </div>

            {/* Bookmarks */}
            <div className="mt-4 pt-4 border-t border-white/10">
              <span className="text-[11px] font-mono text-white/50 uppercase block mb-2">Saved Server Bookmarks</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ftpBookmarks.map((bm) => (
                  <div key={bm.id} className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between">
                    <div>
                      <h5 className="text-xs font-bold text-white font-['Outfit']">{bm.label}</h5>
                      <span className="text-[10px] font-mono text-white/50">{bm.protocol.toUpperCase()} • {bm.host}:{bm.port}</span>
                    </div>
                    <button
                      onClick={() => alert(`Mounted ${bm.label} into Plajah File Mesh`)}
                      className="px-3 py-1 rounded-xl text-xs font-mono font-bold bg-white/[0.08] hover:bg-white/[0.15] text-white border border-white/10"
                    >
                      Mount
                    </button>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>
      )}

    </div>
  );
};

export default NetworkFileExplorer;
