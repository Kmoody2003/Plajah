import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Home, Tv, Speaker, Camera, Lightbulb, Printer,
  Smartphone, Monitor, RefreshCw, Power, Volume2,
  ChevronRight, Shield, Zap, Sparkles, MapPin, Maximize2,
  Sliders, Radio, CheckCircle2, AlertCircle,
  Image as ImageIcon, Gamepad2, Network, Cpu, Mouse
} from 'lucide-react';
import { Button, IconButton } from '../ui';
import realNetworkDiscoveryService, { RealDevice, DiscoveredRoomGroup } from '../../services/home/realNetworkDiscoveryService';

interface HomeLayoutViewProps {
  onSelectDevice?: (device: RealDevice) => void;
}

export const HomeLayoutView: React.FC<HomeLayoutViewProps> = ({ onSelectDevice }) => {
  const [floor, setFloor] = useState<'main' | 'upper' | 'exterior'>('main');
  const [devices, setDevices] = useState<RealDevice[]>([]);
  const [rooms, setRooms] = useState<DiscoveredRoomGroup[]>([]);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<RealDevice | null>(null);

  useEffect(() => {
    const unsub = realNetworkDiscoveryService.subscribe((devs, scanning, rmGroups) => {
      setDevices(devs);
      setIsScanning(scanning);
      setRooms(rmGroups);
    });
    return unsub;
  }, []);

  const handleRefresh = async () => {
    await realNetworkDiscoveryService.scanNow();
  };

  const handleTogglePower = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    realNetworkDiscoveryService.toggleDevicePower(id);
  };

  // Filter devices by current floor view
  const floorDevices = devices.filter(d => {
    if (floor === 'main') return d.floor === 'main' || d.roomId === 'roaming';
    if (floor === 'upper') return d.floor === 'upper';
    if (floor === 'exterior') return d.floor === 'exterior';
    return true;
  });

  const selectedRoom = rooms.find(r => r.roomId === selectedRoomId);

  // Architectural room definitions for the selected floor
  const floorLayoutRooms: Record<string, { id: string; name: string; zone: string; rect: string; color: string }[]> = {
    main: [
      { id: 'living_room', name: 'Living Lounge', zone: 'Main Lounge', rect: 'col-span-4 row-span-3', color: 'rgba(0, 218, 243, 0.14)' },
      { id: 'dining_room', name: 'Dining Room', zone: 'Dining & Gathering', rect: 'col-span-4 row-span-2', color: 'rgba(255, 184, 0, 0.14)' },
      { id: 'kitchen', name: 'Kitchen', zone: 'Culinary Area', rect: 'col-span-4 row-span-2', color: 'rgba(255, 184, 0, 0.12)' },
      { id: 'studio', name: 'Creative Studio Lab', zone: 'Creative Workshop', rect: 'col-span-6 row-span-2', color: 'rgba(212, 0, 85, 0.14)' },
      { id: 'office', name: 'Home Office & Tech Rig', zone: 'Workstation', rect: 'col-span-3 row-span-2', color: 'rgba(0, 218, 243, 0.12)' },
      { id: 'network_core', name: 'Network Hub & Gateway', zone: 'Core Infrastructure', rect: 'col-span-3 row-span-2', color: 'rgba(0, 218, 243, 0.16)' }
    ],
    upper: [
      { id: 'master_bedroom', name: 'Master Bedroom Suite', zone: 'Master Suite', rect: 'col-span-6 row-span-4', color: 'rgba(208, 188, 255, 0.16)' },
      { id: 'kamille_room', name: "Kamille's Room", zone: 'Bedroom Suite', rect: 'col-span-6 row-span-2', color: 'rgba(212, 0, 85, 0.14)' },
      { id: 'guest_bedroom', name: 'Guest Bedroom', zone: 'Guest Suite', rect: 'col-span-6 row-span-2', color: 'rgba(208, 188, 255, 0.10)' },
      { id: 'bathroom', name: 'Bath & Wellness Suite', zone: 'Sanitary', rect: 'col-span-6 row-span-2', color: 'rgba(0, 218, 243, 0.12)' }
    ],
    exterior: [
      { id: 'front_porch', name: 'Front Porch & Entry', zone: 'Perimeter', rect: 'col-span-6 row-span-2', color: 'rgba(6, 214, 160, 0.14)' },
      { id: 'backyard', name: 'Patio & Backyard Grounds', zone: 'Outdoor Lounge', rect: 'col-span-8 row-span-3', color: 'rgba(6, 214, 160, 0.12)' },
      { id: 'garage', name: 'Garage & Workshop', zone: 'Utility', rect: 'col-span-4 row-span-3', color: 'rgba(160, 160, 176, 0.12)' }
    ]
  };

  const getDeviceIcon = (category?: string, detailedType?: string) => {
    const key = (detailedType || category || 'NETWORK').toUpperCase();
    switch (key) {
      case 'DISPLAY': return <ImageIcon size={15} />;
      case 'TV': return <Tv size={15} />;
      case 'SPEAKER': return <Speaker size={15} />;
      case 'CAMERA': return <Camera size={15} />;
      case 'LIGHT': return <Lightbulb size={15} />;
      case 'PRINTER': return <Printer size={15} />;
      case 'PHONE':
      case 'MOBILE': return <Smartphone size={15} />;
      case 'CONTROLLER': return <Gamepad2 size={15} />;
      case 'AUDIO_INTERFACE': return <Sliders size={15} />;
      case 'HUB':
      case 'NETWORK': return <Network size={15} />;
      case 'PERIPHERAL': return <Mouse size={15} />;
      default: return <Monitor size={15} />;
    }
  };

  return (
    <div className="flex flex-col gap-6 text-white">
      
      {/* REAL DISCOVERY TELEMETRY HEADER */}
      <div className="p-5 rounded-3xl bg-[rgba(22,6,36,0.75)] border border-[#D40055]/30 backdrop-blur-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#6B0099] via-[#D40055] to-[#FF8C00] p-0.5 shadow-lg flex items-center justify-center">
            <div className="w-full h-full bg-[#100B17] rounded-[14px] flex items-center justify-center">
              <MapPin size={18} className="text-[#FF8C00]" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-['Space_Grotesk'] text-lg font-black text-white">
                Interactive Home Blueprint
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#06D6A0]/20 border border-[#06D6A0]/40 text-[#06D6A0]">
                ● REAL NETWORK DISCOVERY ACTIVE
              </span>
            </div>
            <p className="text-xs font-mono text-white/50">
              Auto-scanned LAN via Windows DAF, UPnP, mDNS & Wi-Fi Direct • Found {devices.length} verified devices
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Floor Toggles */}
          <div className="flex items-center p-1 rounded-2xl bg-black/40 border border-white/10">
            <button
              onClick={() => setFloor('main')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition ${
                floor === 'main'
                  ? 'bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white shadow-md'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              Main Level
            </button>
            <button
              onClick={() => setFloor('upper')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition ${
                floor === 'upper'
                  ? 'bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white shadow-md'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              Upper Suites
            </button>
            <button
              onClick={() => setFloor('exterior')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition ${
                floor === 'exterior'
                  ? 'bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white shadow-md'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              Perimeter
            </button>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            icon={<RefreshCw size={14} className={isScanning ? 'animate-spin text-[#00DAF3]' : ''} />}
          >
            {isScanning ? 'Scanning...' : 'Rescan LAN'}
          </Button>
        </div>
      </div>

      {/* ARCHITECTURAL FLOOR PLAN BLUEPRINT CANVAS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT 8 COLS: 2D Architectural Layout Map */}
        <div className="lg:col-span-8 rounded-[32px] p-6 bg-[#0c0814]/90 border border-[#D40055]/30 backdrop-blur-2xl shadow-2xl relative min-h-[540px] flex flex-col justify-between overflow-hidden">
          
          {/* Blueprint Grid Watermark & Compass */}
          <div className="absolute inset-0 bg-[radial-gradient(#ffffff08_1px,transparent_1px)] [background-size:20px_20px] pointer-events-none" />
          <div className="absolute top-4 right-4 flex items-center gap-1.5 text-[10px] font-mono text-white/30 pointer-events-none">
            <span>PLAJAH ARCHITECTURAL MATRIX // SCALE 1:50</span>
          </div>

          {/* Architectural Room Zones Grid */}
          <div className="grid grid-cols-12 gap-3 min-h-[440px] z-10 my-4">
            {floorLayoutRooms[floor].map(room => {
              const isSelected = selectedRoomId === room.id;
              const roomDevs = devices.filter(d => d.roomId === room.id);
              const activeCount = roomDevs.filter(d => d.powerOn).length;

              return (
                <div
                  key={room.id}
                  onClick={() => setSelectedRoomId(isSelected ? null : room.id)}
                  style={{ backgroundColor: room.color }}
                  className={`${room.rect} rounded-2xl border ${
                    isSelected ? 'border-[#00DAF3] shadow-lg shadow-[#00DAF3]/20 ring-2 ring-[#00DAF3]/40' : 'border-white/10 hover:border-white/20'
                  } p-4 transition-all duration-300 cursor-pointer flex flex-col justify-between relative group backdrop-blur-sm`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[9px] font-mono uppercase tracking-wider text-white/40 block">
                        {room.zone}
                      </span>
                      <h4 className="font-['Space_Grotesk'] text-sm font-bold text-white group-hover:text-[#00DAF3] transition">
                        {room.name}
                      </h4>
                    </div>
                    {roomDevs.length > 0 && (
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold ${
                        activeCount > 0 ? 'bg-[#06D6A0]/20 text-[#06D6A0] border border-[#06D6A0]/40' : 'bg-white/10 text-white/40'
                      }`}>
                        {activeCount}/{roomDevs.length} ON
                      </span>
                    )}
                  </div>

                  {/* Devices pinned inside this room */}
                  {/* Devices pinned inside this room */}
                  <div className="flex flex-wrap gap-2 pt-3">
                    {roomDevs.map(dev => (
                      <div
                        key={dev.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDevice(dev);
                          if (onSelectDevice) onSelectDevice(dev);
                        }}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-mono transition shadow-md cursor-pointer ${
                          dev.powerOn
                            ? 'bg-[#100B17] border border-[#FF8C00] text-white hover:scale-105'
                            : 'bg-black/40 border border-white/10 text-white/50 hover:text-white'
                        }`}
                      >
                        <span className={dev.powerOn ? 'text-[#FF8C00]' : 'text-white/40'}>
                          {getDeviceIcon(dev.category, dev.detailedType)}
                        </span>
                        <span className="truncate max-w-[120px] font-bold">{dev.cleanName}</span>
                        {dev.brand && (
                          <span className="text-[8px] font-mono uppercase px-1 py-0.2 rounded bg-white/10 text-white/70">
                            {dev.brand}
                          </span>
                        )}
                        <div
                          onClick={(e) => handleTogglePower(dev.id, e)}
                          className={`w-2 h-2 rounded-full ${dev.powerOn ? 'bg-[#06D6A0] shadow-[0_0_8px_#06D6A0]' : 'bg-white/20'}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Blueprint Footer */}
          <div className="flex items-center justify-between text-[11px] font-mono text-white/40 border-t border-white/10 pt-3 z-10">
            <span>● Click room to view environmental controls</span>
            <span>Subnet: 192.168.4.0/24 (Wi-Fi Moody Lighthouse)</span>
          </div>

        </div>

        {/* RIGHT 4 COLS: Room Inspector & Device Controls */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          
          {/* SELECTED ROOM OR OVERVIEW PANEL */}
          <div className="p-6 rounded-[28px] bg-[rgba(22,6,36,0.72)] border border-[#D40055]/30 backdrop-blur-xl shadow-xl flex flex-col gap-4">
            
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#FF8C00] font-bold">
                  ROOM INSPECTOR
                </span>
                <h4 className="text-xl font-black font-['Space_Grotesk'] text-white">
                  {selectedRoom ? selectedRoom.roomName : 'All House Overview'}
                </h4>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-mono bg-[#00DAF3]/15 border border-[#00DAF3]/30 text-[#00DAF3] font-bold">
                {selectedRoom ? `${selectedRoom.devices.length} Nodes` : `${devices.length} Total`}
              </span>
            </div>

            {/* Device list in selected room */}
            <div className="flex flex-col gap-3">
              {(selectedRoom ? selectedRoom.devices : devices.slice(0, 8)).map(dev => (
                <div
                  key={dev.id}
                  onClick={() => setSelectedDevice(dev)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    selectedDevice?.id === dev.id
                      ? 'bg-gradient-to-r from-[#6B0099]/40 to-[#D40055]/40 border-[#FF8C00] shadow-md'
                      : 'bg-white/[0.03] border-white/10 hover:border-[#00DAF3]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-[#100B17] border border-white/10 flex items-center justify-center text-[#FF8C00] flex-shrink-0 shadow-inner">
                      {getDeviceIcon(dev.category, dev.detailedType)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white truncate">{dev.cleanName}</span>
                        <span className="px-1.5 py-0.2 rounded text-[8px] font-mono font-bold uppercase bg-white/10 text-white/80 border border-white/15">
                          {dev.brand || dev.vendor}
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-[var(--pj-orange)] truncate mt-0.5">
                        {dev.model ? `${dev.model} · ` : ''}{dev.typeLabel || dev.deviceClass}
                      </div>
                      <div className="text-[9px] font-mono text-white/40 truncate">
                        {dev.protocolBadge || dev.protocol} {dev.ip ? `• ${dev.ip}` : ''}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={(e) => handleTogglePower(dev.id, e)}
                    className={`p-2 rounded-xl transition ${
                      dev.powerOn
                        ? 'bg-[#06D6A0]/20 text-[#06D6A0] hover:bg-[#06D6A0]/30'
                        : 'bg-white/5 text-white/40 hover:text-white'
                    }`}
                  >
                    <Power size={14} />
                  </button>
                </div>
              ))}
            </div>

            {/* Quick Actions */}
            {selectedDevice && (
              <div className="mt-2 p-4 rounded-2xl bg-black/40 border border-[#00DAF3]/40 flex flex-col gap-3">
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="text-[#00DAF3] font-bold">ACTIVE CONTROLLER:</span>
                  <span className="text-white/60">{selectedDevice.cleanName}</span>
                </div>
                {selectedDevice.category === 'TV' && (
                  <div className="flex gap-2">
                    <Button variant="accent" size="sm" className="flex-1 text-xs">
                      Beam Chora
                    </Button>
                    <Button variant="secondary" size="sm" className="flex-1 text-xs">
                      Input HDMI 1
                    </Button>
                  </div>
                )}
                {selectedDevice.uri && (
                  <div className="text-[10px] font-mono text-white/40 truncate">
                    Endpoint: {selectedDevice.uri}
                  </div>
                )}
              </div>
            )}

          </div>

        </div>

      </div>

    </div>
  );
};

export default HomeLayoutView;
