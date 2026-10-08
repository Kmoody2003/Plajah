import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Home, Settings, Sun, Cloud, Thermometer,
  Lock, Speaker, Lightbulb, Monitor, Mic, Volume2,
  Plus, Cast, Play, Pause, SkipForward, ChevronRight,
  Image as ImageIcon, Camera, MicOff, Folder, Cpu, Network,
  Music, Sparkles, Video, Users, MapPin, RefreshCw, X, Check, ShieldCheck,
  Gamepad2, Mouse, Tv, Printer, Sliders, Smartphone, Laptop, Search, Filter
} from 'lucide-react';
import {
  Button, IconButton, Surface, Eyebrow, Chip, ChipRail,
  BUTTON_ICON_SIZE, TYPE, MOTION, Container, AdaptiveGrid
} from './ui';
import NetworkFileExplorer from './home/NetworkFileExplorer';
import DistributedRenderCluster from './home/DistributedRenderCluster';
import AtmosphericLoungeCenterpiece from './home/AtmosphericLoungeCenterpiece';
import ChoraVisualizerStage from './home/ChoraVisualizerStage';
import LdLightingController from './home/LdLightingController';
import VideoMeetDashboard from './home/VideoMeetDashboard';
import CreatorSpotlight from './home/CreatorSpotlight';
import HomeLayoutView from './home/HomeLayoutView';
import HomeHubPanel from './home/HomeHubPanel';
import realNetworkDiscoveryService, { RealDevice, DiscoveredRoomGroup } from '../services/home/realNetworkDiscoveryService';
import { DetailedDeviceType } from '../services/home/deviceFingerprint';

// ==========================================
// SCENES PRESETS
// ==========================================

interface PlajahHomeViewProps {
  currentUser?: any;
  onBack?: () => void;
}

const SCENE_PRESETS = [
  { id: 'morning', label: 'Good Morning', icon: Sun },
  { id: 'work', label: 'Work Mode', icon: Monitor },
  { id: 'movie', label: 'Movie Night', icon: Play },
  { id: 'dinner', label: 'Dinner Party', icon: Volume2 },
  { id: 'bedtime', label: 'Bedtime', icon: Cloud },
  { id: 'away', label: 'Away', icon: Lock },
];

// ==========================================
// PAIR MATTER DEVICE MODAL
// ==========================================

interface PairMatterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPaired: () => void;
  availableRooms: string[];
}

const PairMatterModal: React.FC<PairMatterModalProps> = ({ isOpen, onClose, onPaired, availableRooms }) => {
  const [code, setCode] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [roomName, setRoomName] = useState('Living Room');
  const [ip, setIp] = useState('');
  const [passcode, setPasscode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<'input' | 'pairing' | 'success' | 'error'>('input');
  const [progressMsg, setProgressMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [detectedVendor, setDetectedVendor] = useState<string | null>(null);

  // Auto-validate setup code as user types
  useEffect(() => {
    if (!code) {
      setDetectedVendor(null);
      return;
    }
    const clean = code.trim();
    if (clean.length >= 11 || clean.startsWith('MT:')) {
      fetch('/api/matter/parse-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: clean })
      })
        .then(res => res.json())
        .then(data => {
          if (data.success && data.payload?.vendorName) {
            setDetectedVendor(data.payload.vendorName);
          } else {
            setDetectedVendor(null);
          }
        })
        .catch(() => setDetectedVendor(null));
    }
  }, [code]);

  if (!isOpen) return null;

  const handlePair = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code && !ip) {
      setErrorMsg('Please enter a Matter Manual Code, QR string, or IP address.');
      setStep('error');
      return;
    }

    setIsSubmitting(true);
    setStep('pairing');
    setProgressMsg('Looking for the device and commissioning it onto the Plajah Home fabric. This can take up to a minute...');

    const res = await realNetworkDiscoveryService.pairMatterDevice({
      code: code.trim() || undefined,
      name: deviceName.trim() || undefined,
      roomName: roomName.trim() || undefined,
      ip: ip.trim() || undefined,
      passcode: passcode ? parseInt(passcode, 10) : undefined
    });

    if (res.success) {
      setProgressMsg(`Paired: ${res.node?.name || 'Matter device'}.`);
      setStep('success');
      onPaired();
      setTimeout(() => {
        onClose();
        setStep('input');
        setCode('');
        setDeviceName('');
      }, 1400);
    } else {
      setErrorMsg(res.error || 'Pairing failed. Make sure the Matter device is in pairing mode.');
      setStep('error');
    }
    setIsSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-lg rounded-3xl bg-[#12081d] border border-[var(--pj-magenta)]/40 p-6 shadow-2xl relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[var(--pj-purple)] via-[var(--pj-magenta)] to-[var(--pj-orange)]" />

        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#6B0099] via-[#D40055] to-[#FF8C00] p-0.5 shadow-md flex items-center justify-center">
              <div className="w-full h-full bg-[#100B17] rounded-[14px] flex items-center justify-center">
                <Plus size={20} className="text-[var(--pj-orange)]" />
              </div>
            </div>
            <div>
              <h3 className="font-['Space_Grotesk'] text-lg font-black text-white">Pair Matter Device</h3>
              <p className="text-xs font-mono text-white/50">Matter 1.3 Certified Pairing Engine</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition">
            <X size={18} />
          </button>
        </div>

        {step === 'input' && (
          <form onSubmit={handlePair} className="mt-5 flex flex-col gap-4">
            <div>
              <label className="block text-xs font-mono font-bold text-[var(--pj-orange)] uppercase tracking-wider mb-1.5">
                Matter Setup Code or QR String
              </label>
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="e.g. 34970112332 or MT:Y.K9042C00KA0648G00"
                className="w-full px-4 py-2.5 rounded-xl bg-black/60 border border-white/20 font-mono text-sm text-white placeholder-white/30 focus:outline-none focus:border-[var(--pj-magenta)]"
              />
              {detectedVendor && (
                <div className="mt-2 flex items-center gap-1.5 text-xs font-mono text-[var(--pj-success)]">
                  <ShieldCheck size={14} />
                  <span>Detected: <strong>{detectedVendor}</strong></span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-mono text-white/70 mb-1">Friendly Name</label>
                <input
                  type="text"
                  value={deviceName}
                  onChange={e => setDeviceName(e.target.value)}
                  placeholder="Living Room Light"
                  className="w-full px-3.5 py-2 rounded-xl bg-black/60 border border-white/20 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[var(--pj-magenta)]"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-white/70 mb-1">Assign to Room</label>
                <select
                  value={roomName}
                  onChange={e => setRoomName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-[#1a0026] border border-white/20 text-xs text-white focus:outline-none focus:border-[var(--pj-magenta)]"
                >
                  <option value="Living Room">Living Room</option>
                  <option value="Office Studio">Office Studio</option>
                  <option value="Kitchen">Kitchen</option>
                  <option value="Master Bedroom">Master Bedroom</option>
                  <option value="Front Porch">Front Porch</option>
                  {availableRooms.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs text-white/40 font-mono">
              <span>Automatic LAN mDNS discovery enabled</span>
              <span className="text-[var(--pj-cyan)]">Fabric 1: Ready</span>
            </div>

            <div className="mt-2 flex items-center justify-end gap-3">
              <Button type="button" variant="secondary" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={isSubmitting}
                className="font-bold bg-gradient-to-r from-[var(--pj-orange)] to-[var(--pj-magenta)] text-white shadow-lg shadow-[var(--pj-orange)]/20"
              >
                Start Commissioning
              </Button>
            </div>
          </form>
        )}

        {step === 'pairing' && (
          <div className="py-12 flex flex-col items-center justify-center text-center gap-4">
            <div className="w-14 h-14 rounded-full border-3 border-[var(--pj-magenta)]/30 border-t-[var(--pj-orange)] animate-spin" />
            <div className="font-['Space_Grotesk'] text-base font-bold text-white">Commissioning Matter Device...</div>
            <p className="text-xs font-mono text-[var(--pj-cyan)] max-w-sm">{progressMsg}</p>
          </div>
        )}

        {step === 'success' && (
          <div className="py-10 flex flex-col items-center justify-center text-center gap-3">
            <div className="w-14 h-14 rounded-full bg-[var(--pj-success)]/20 border border-[var(--pj-success)] text-[var(--pj-success)] flex items-center justify-center shadow-lg">
              <Check size={28} />
            </div>
            <div className="font-['Space_Grotesk'] text-lg font-bold text-white">Device Commissioned!</div>
            <p className="text-xs font-mono text-white/70">{progressMsg}</p>
          </div>
        )}

        {step === 'error' && (
          <div className="py-8 flex flex-col items-center justify-center text-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[var(--pj-danger)]/20 border border-[var(--pj-danger)] text-[var(--pj-danger)] flex items-center justify-center">
              <X size={24} />
            </div>
            <div className="font-['Space_Grotesk'] text-base font-bold text-white">Pairing Failed</div>
            <p className="text-xs font-mono text-[var(--pj-danger)] max-w-sm">{errorMsg}</p>
            <Button variant="secondary" size="xs" onClick={() => setStep('input')}>
              Try Again
            </Button>
          </div>
        )}
      </motion.div>
    </div>
  );
};

// ==========================================
// SUBCOMPONENTS
// ==========================================

const RoomCard: React.FC<{
  room: DiscoveredRoomGroup;
  onClick: () => void;
  isSelected: boolean;
}> = ({ room, onClick, isSelected }) => {
  const total = room.devices.length;
  const lights = room.devices.filter(d => d.deviceClass === 'LIGHT' || d.rawName.toLowerCase().includes('light')).length;
  const speakers = room.devices.filter(d => d.deviceClass === 'SPEAKER' || d.rawName.toLowerCase().includes('audio') || d.rawName.toLowerCase().includes('headphone')).length;
  const workstations = room.devices.filter(d => d.deviceClass === 'WORKSTATION').length;
  const cameras = room.devices.filter(d => d.deviceClass === 'CAMERA').length;
  const matterCount = room.devices.filter(d => d.protocol === 'MATTER').length;

  return (
    <motion.div
      whileHover={{ y: -6, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="cursor-pointer"
    >
      <div
        className={`relative h-full overflow-hidden rounded-[24px] p-6 transition-all duration-300 backdrop-blur-xl ${
          isSelected 
            ? 'ring-2 ring-[var(--pj-magenta)] bg-[#1a0026]/80 shadow-xl shadow-[var(--pj-purple)]/40 border border-[var(--pj-magenta)]' 
            : 'bg-[#1a0026]/40 border border-[var(--pj-magenta)]/25 hover:border-[var(--pj-magenta)]/60 hover:bg-[#1a0026]/60'
        }`}
      >
        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
          <Home size={90} strokeWidth={1} />
        </div>
        
        {/* Plajah Accent Laser Line on Card Top Edge */}
        <div className="absolute top-0 left-6 right-6 h-[1.5px] bg-gradient-to-r from-transparent via-[var(--pj-magenta)] to-transparent opacity-60" />

        <div className="relative z-10 flex flex-col h-full gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-[#100B17] flex items-center justify-center border border-[var(--pj-magenta)]/40 shadow-inner">
                <Home size={20} className="text-[var(--pj-orange)]" />
              </div>
              <div>
                <div className="font-['Space_Grotesk'] font-bold text-lg text-white tracking-wide">{room.roomName}</div>
                <div className="text-[11px] font-mono text-[var(--pj-lilac)]/70 uppercase tracking-widest">{total} {total === 1 ? 'device' : 'devices'}</div>
              </div>
            </div>
            {matterCount > 0 ? (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--pj-cyan)]/15 border border-[var(--pj-cyan)]/30 text-[9px] font-mono text-[var(--pj-cyan)] font-bold">
                MATTER {matterCount}
              </span>
            ) : speakers > 0 ? (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--pj-cyan)]/15 border border-[var(--pj-cyan)]/30 text-[9px] font-mono text-[var(--pj-cyan)]">
                CHORA ACTIVE
              </span>
            ) : null}
          </div>

          <div className="mt-auto pt-4 flex flex-col gap-2.5 border-t border-white/5">
            <div className="flex items-center gap-3">
              {lights > 0 && (
                <div className="flex items-center gap-1 text-[var(--pj-orange)]">
                  <Lightbulb size={15} />
                  <span className="text-[10px] font-mono font-bold">{lights}</span>
                </div>
              )}
              {speakers > 0 && (
                <div className="flex items-center gap-1 text-[var(--pj-cyan)]">
                  <Speaker size={15} />
                  <span className="text-[10px] font-mono font-bold">{speakers}</span>
                </div>
              )}
              {workstations > 0 && (
                <div className="flex items-center gap-1 text-[var(--pj-lilac)]">
                  <Monitor size={15} />
                  <span className="text-[10px] font-mono font-bold">{workstations}</span>
                </div>
              )}
              {cameras > 0 && (
                <div className="flex items-center gap-1 text-[var(--pj-success)]">
                  <Camera size={15} />
                  <span className="text-[10px] font-mono uppercase">CAM</span>
                </div>
              )}
            </div>
            <div className="text-xs font-mono text-white/70 line-clamp-1">
              {room.activeCount} active · Zone: {room.zone}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export const DeviceCategoryIcon: React.FC<{
  type?: string;
  detailedType?: DetailedDeviceType;
  powerOn?: boolean;
  size?: number;
}> = ({ type, detailedType, powerOn = true, size = 18 }) => {
  const key = (detailedType || type || 'NETWORK').toUpperCase();
  switch (key) {
    case 'DISPLAY':
      return <ImageIcon size={size} className={powerOn ? 'text-[var(--pj-magenta)]' : 'text-white/30'} />;
    case 'TV':
      return <Tv size={size} className={powerOn ? 'text-[var(--pj-purple)]' : 'text-white/30'} />;
    case 'LIGHT':
      return <Lightbulb size={size} className={powerOn ? 'text-[var(--pj-orange)]' : 'text-white/30'} />;
    case 'SPEAKER':
      return <Speaker size={size} className={powerOn ? 'text-[var(--pj-cyan)]' : 'text-white/30'} />;
    case 'CAMERA':
      return <Camera size={size} className={powerOn ? 'text-[var(--pj-success)]' : 'text-white/30'} />;
    case 'HUB':
    case 'NETWORK':
      return <Network size={size} className={powerOn ? 'text-[var(--pj-cyan)]' : 'text-white/30'} />;
    case 'PHONE':
      return <Smartphone size={size} className={powerOn ? 'text-[var(--pj-lilac)]' : 'text-white/30'} />;
    case 'WORKSTATION':
      return <Monitor size={size} className={powerOn ? 'text-[var(--pj-cyan)]' : 'text-white/30'} />;
    case 'CONTROLLER':
      return <Gamepad2 size={size} className={powerOn ? 'text-[var(--pj-success)]' : 'text-white/30'} />;
    case 'PRINTER':
      return <Printer size={size} className={powerOn ? 'text-white/80' : 'text-white/30'} />;
    case 'AUDIO_INTERFACE':
      return <Sliders size={size} className={powerOn ? 'text-[var(--pj-orange)]' : 'text-white/30'} />;
    case 'MIC':
      return <Mic size={size} className={powerOn ? 'text-[var(--pj-magenta)]' : 'text-white/30'} />;
    case 'PERIPHERAL':
      return <Mouse size={size} className={powerOn ? 'text-[var(--pj-success)]' : 'text-white/30'} />;
    default:
      return <Cpu size={size} className={powerOn ? 'text-[var(--pj-cyan)]' : 'text-white/30'} />;
  }
};

const RemoteWorkstationTile: React.FC<{ hostDevice?: RealDevice }> = ({ hostDevice }) => {
  const hostName = hostDevice?.cleanName || hostDevice?.rawName || "Kenny's Galaxy Book4 Ultra";
  const hostIp = hostDevice?.ip || '192.168.4.96';

  return (
    <div className="rounded-[24px] p-6 bg-[#1a0026]/50 border border-[var(--pj-magenta)]/30 backdrop-blur-xl relative overflow-hidden flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#100B17] border border-[var(--pj-cyan)]/40 flex items-center justify-center">
            <Monitor size={20} className="text-[var(--pj-cyan)]" />
          </div>
          <div>
            <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-[var(--pj-cyan)] font-bold">REPURPOSED WORKSTATION // P2P</span>
            <h3 className="font-['Space_Grotesk'] font-bold text-white text-base truncate max-w-[200px]">{hostName}</h3>
          </div>
        </div>
        <span className="px-2.5 py-1 rounded-full bg-[var(--pj-success)]/15 border border-[var(--pj-success)]/40 text-[10px] font-mono text-[var(--pj-success)] font-bold">
          LIVE // {hostIp}
        </span>
      </div>

      {/* Interactive Screen Preview */}
      <div className="relative aspect-video rounded-xl overflow-hidden border border-white/10 bg-black/80 flex items-center justify-center group cursor-pointer shadow-lg">
        <div className="absolute inset-0 bg-gradient-to-tr from-[#020202] via-[#100B17] to-[#1a0026] opacity-90" />
        <div className="relative z-10 flex flex-col items-center gap-2 text-center p-4">
          <Monitor size={32} className="text-[var(--pj-cyan)] group-hover:scale-110 transition-transform" />
          <span className="text-xs font-mono text-white/80">{hostName} Streaming over WebRTC</span>
          <Button variant="accent" size="xs" className="mt-1 font-bold">CONNECT NOW</Button>
        </div>
      </div>
    </div>
  );
};

const DeviceRow: React.FC<{
  device: RealDevice;
  onTogglePower?: () => void;
}> = ({ device, onTogglePower }) => {
  const brand = device.brand || device.vendor || 'Generic';
  const model = device.model || '';
  const typeLabel = device.typeLabel || device.deviceClass || 'Connected Device';
  const badge = device.protocolBadge || device.protocol;

  return (
    <div className="p-4 rounded-[22px] bg-[#1a0026]/40 border border-[var(--pj-magenta)]/25 backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 group hover:bg-[#1a0026]/70 hover:border-[var(--pj-magenta)]/50 transition-all shadow-md">
      <div className="flex items-center gap-3.5 min-w-0">
        <div className={`w-12 h-12 rounded-2xl bg-[#100B17] flex items-center justify-center border shadow-inner flex-shrink-0 transition-colors ${
          device.powerOn ? 'border-[var(--pj-magenta)]/40 shadow-sm shadow-[var(--pj-purple)]/20' : 'border-white/10 opacity-60'
        }`}>
          <DeviceCategoryIcon
            type={device.deviceClass}
            detailedType={device.detailedType}
            powerOn={device.powerOn}
            size={22}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-['Space_Grotesk'] font-bold text-white text-sm sm:text-base truncate">
              {device.cleanName || device.rawName}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider bg-white/10 text-white/90 border border-white/15">
              {brand}
            </span>
          </div>
          <div className="text-[11px] font-mono text-[var(--pj-lilac)]/80 flex items-center gap-2 mt-0.5 truncate">
            {model && <span className="text-white/70 font-semibold">{model}</span>}
            {model && <span className="text-white/20">·</span>}
            <span className="text-[var(--pj-orange)]">{typeLabel}</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono text-white/40 mt-0.5 flex-wrap">
            <span className="px-1.5 py-0.2 rounded bg-[var(--pj-cyan)]/15 text-[var(--pj-cyan)] font-bold border border-[var(--pj-cyan)]/25">
              {badge}
            </span>
            {device.ip && <span>{device.ip}</span>}
            <span>·</span>
            <span>{device.roomName}</span>
          </div>
        </div>
      </div>

      <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 pt-2 sm:pt-0 border-t border-white/5 sm:border-t-0 flex-shrink-0">
        <button
          onClick={onTogglePower}
          className={`px-3 py-1.5 rounded-xl font-mono text-xs font-bold transition flex items-center gap-2 shadow-sm ${
            device.powerOn 
              ? 'bg-[var(--pj-success)]/20 text-[var(--pj-success)] border border-[var(--pj-success)]/40 hover:bg-[var(--pj-success)]/30' 
              : 'bg-white/5 text-white/40 border border-white/10 hover:text-white'
          }`}
          title="Toggle power"
        >
          <div className={`w-2 h-2 rounded-full ${device.powerOn ? 'bg-[var(--pj-success)] animate-pulse shadow-[0_0_8px_#06D6A0]' : 'bg-white/30'}`} />
          <span>{device.powerOn ? 'ON' : 'STANDBY'}</span>
        </button>
      </div>
    </div>
  );
};

const IntercomNode: React.FC<{ device: RealDevice }> = ({ device }) => (
  <div className="p-4 rounded-[20px] bg-[#1a0026]/40 border border-[var(--pj-magenta)]/20 backdrop-blur-md flex flex-col gap-3">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-2xl bg-[#100B17] border border-[var(--pj-orange)]/30 flex items-center justify-center">
        <Mic size={18} className="text-[var(--pj-orange)]" />
      </div>
      <div className="min-w-0">
        <div className="font-['Space_Grotesk'] font-bold text-white text-sm truncate">{device.cleanName || device.rawName}</div>
        <div className="text-[10px] font-mono text-white/50">{device.roomName}</div>
      </div>
    </div>
    <div className="flex items-center gap-2 mt-auto">
      <Button variant="secondary" size="xs" className="flex-1 font-bold">Call</Button>
      <Button variant="accent" size="xs" className="flex-1 font-bold">Listen</Button>
    </div>
  </div>
);

const DigitalFrameCard: React.FC<{ device: RealDevice }> = ({ device }) => (
  <div className="relative h-48 rounded-[24px] overflow-hidden group border border-[var(--pj-magenta)]/25 bg-[#1a0026]/30 backdrop-blur-md shadow-lg">
    <div className="absolute inset-0 bg-gradient-to-br from-[var(--pj-purple)] to-[var(--pj-magenta)] opacity-30 transition-opacity group-hover:opacity-50" />
    <div className="absolute inset-0 bg-gradient-to-t from-[#100B17] via-[#100B17]/40 to-transparent" />
    <div className="relative z-10 p-5 flex flex-col h-full justify-between">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2 bg-[#100B17]/80 backdrop-blur-md px-3 py-1 rounded-full border border-[var(--pj-magenta)]/30">
          <ImageIcon size={13} className="text-[var(--pj-orange)]" />
          <span className="font-['Space_Grotesk'] text-xs font-bold text-white truncate max-w-[150px]">{device.cleanName || device.rawName}</span>
        </div>
        <div className="w-7 h-7 rounded-full bg-[var(--pj-cyan)]/20 text-[var(--pj-cyan)] flex items-center justify-center backdrop-blur-md border border-[var(--pj-cyan)]/40">
          <Play size={12} fill="currentColor" />
        </div>
      </div>
      <div>
        <div className="text-[10px] font-mono text-[var(--pj-orange)] mb-0.5 uppercase tracking-wider font-bold">DLNA AMBIENT CANVAS</div>
        <div className="font-['Space_Grotesk'] font-bold text-white text-base truncate">{device.roomName} Display</div>
      </div>
    </div>
  </div>
);

const MatterCameraCard: React.FC<{ camera: RealDevice }> = ({ camera }) => {
  const [micActive, setMicActive] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const brand = camera.brand || camera.vendor || 'Security';
  const model = camera.model || 'Smart IP Camera';
  const isRTSP = camera.uri?.startsWith('rtsp') || camera.ip === '192.168.7.250';
  const streamEndpoint = camera.uri || (camera.ip ? `rtsp://${camera.ip}:554/live0` : 'Local HAP Stream');

  return (
    <div className="rounded-[24px] overflow-hidden bg-[#1a0026]/40 border border-[var(--pj-magenta)]/30 backdrop-blur-xl relative flex flex-col group shadow-lg">
      <div className="relative aspect-video w-full overflow-hidden bg-black/90">
        <div 
          className="absolute inset-0 bg-cover bg-center transition-transform hover:scale-105 duration-700 opacity-80"
          style={{
            backgroundImage: `url(${camera.uri && !camera.uri.startsWith('rtsp') ? camera.uri : 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80'})`
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#100B17] via-transparent to-black/60 pointer-events-none" />

        {/* Top Badges */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/10">
            <span className="w-2 h-2 rounded-full bg-[var(--pj-success)] animate-pulse shadow-[0_0_8px_#06D6A0]" />
            <span className="text-[10px] font-mono font-bold text-white uppercase tracking-wider">
              {isRTSP ? 'RTSP 554 LIVE' : 'LIVE FEED'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/20 text-[9px] font-mono text-white/90 font-bold uppercase">
              2K QHD
            </span>
            <div className="px-2.5 py-1 rounded-full bg-[var(--pj-orange)]/20 border border-[var(--pj-orange)]/40 text-[9px] font-mono text-[var(--pj-orange)] font-bold">
              {camera.roomName}
            </div>
          </div>
        </div>

        {/* Stream Telemetry Overlay */}
        <div className="absolute top-12 left-3 z-10 pointer-events-none">
          <span className="text-[9px] font-mono text-white/60 bg-black/60 px-2 py-0.5 rounded border border-white/10 backdrop-blur-sm">
            {camera.ip ? `${camera.ip}:554 // RTSP` : 'HAP P2P'}
          </span>
        </div>

        {/* Bottom Video Action Bar */}
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between z-10">
          <button 
            onClick={() => setMicActive(!micActive)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono font-bold transition-all backdrop-blur-md border ${
              micActive 
                ? 'bg-[var(--pj-danger)] border-[var(--pj-danger)] text-white shadow-lg shadow-[var(--pj-danger)]/40' 
                : 'bg-black/60 border-white/20 text-white hover:bg-black/80'
            }`}
          >
            <Mic size={13} />
            <span>{micActive ? 'MIC LIVE' : '2-WAY AUDIO MIC'}</span>
          </button>

          <button 
            onClick={() => setUnlocked(!unlocked)}
            className={`px-3 py-1.5 rounded-full text-xs font-mono font-bold transition-all shadow-md ${
              unlocked 
                ? 'bg-[var(--pj-success)] text-[#12080a]' 
                : 'bg-white text-black hover:bg-white/90'
            }`}
          >
            {unlocked ? 'UNLOCKED' : 'SECURE'}
          </button>
        </div>
      </div>

      <div className="p-3.5 flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h4 className="font-['Space_Grotesk'] font-bold text-white text-sm">{camera.cleanName || camera.rawName}</h4>
            <span className="px-2 py-0.2 rounded-full text-[9px] font-mono font-bold uppercase bg-white/10 text-white/90 border border-white/15">
              {brand}
            </span>
          </div>
          <span className="text-[9px] font-mono text-[var(--pj-cyan)] font-bold px-2 py-0.5 rounded bg-[var(--pj-cyan)]/10 border border-[var(--pj-cyan)]/25">
            {camera.protocolBadge || camera.protocol}
          </span>
        </div>
        <div className="text-[10px] font-mono text-white/50 flex items-center justify-between">
          <span>{model} · {camera.roomName}</span>
          <span className="text-[var(--pj-orange)] font-semibold truncate max-w-[180px]" title={streamEndpoint}>
            {streamEndpoint}
          </span>
        </div>
      </div>
    </div>
  );
};

const UserAccountInsightBar: React.FC<{ user?: any; networkName?: string }> = ({ user, networkName }) => (
  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-[24px] bg-[#100B17]/90 border border-[var(--pj-magenta)]/30 backdrop-blur-xl shadow-lg">
    <div className="flex items-center gap-3">
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#6B0099] via-[#D40055] to-[#FF8C00] p-0.5 shadow-md">
        <div className="w-full h-full bg-[#100B17] rounded-[14px] flex items-center justify-center overflow-hidden">
          <img src="/home/kmoody_avatar.png" alt="Kenny" className="w-full h-full object-cover" />
        </div>
      </div>
      <div>
        <div className="flex items-center gap-2">
          <span className="font-['Space_Grotesk'] font-bold text-white text-base">{user?.displayName || 'Kenny'}</span>
          <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-gradient-to-r from-[var(--pj-purple)] to-[var(--pj-magenta)] text-white shadow-sm">
            PLAJAH+ CREATOR
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono text-white/50 mt-0.5">
          <span>{(networkName || 'Moody Lighthouse').toUpperCase()} NETWORK</span>
          <span>·</span>
          <span className="text-[var(--pj-orange)] font-bold">STUDIO ACTIVE</span>
        </div>
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs font-mono text-white/80">
        <span className="w-2 h-2 rounded-full bg-[var(--pj-orange)]" />
        <span>MATTER 1.3 CERTIFIED</span>
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs font-mono text-white/80">
        <span className="w-2 h-2 rounded-full bg-[var(--pj-cyan)]" />
        <span>CHORA: LOSSLESS MULTI-ROOM</span>
      </div>
    </div>
  </div>
);

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function PlajahHomeView({ currentUser, onBack }: PlajahHomeViewProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'layout' | 'chora' | 'ld' | 'meet' | 'creators' | 'files' | 'compute'>('overview');
  const [activeScene, setActiveScene] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [realDevices, setRealDevices] = useState<RealDevice[]>([]);
  const [realRooms, setRealRooms] = useState<DiscoveredRoomGroup[]>([]);
  const [networkName, setNetworkName] = useState<string>('Moody Lighthouse');
  const [isScanning, setIsScanning] = useState(false);
  const [isPairingOpen, setIsPairingOpen] = useState(false);

  useEffect(() => {
    const unsub = realNetworkDiscoveryService.subscribe((devs, scanning, rooms, net) => {
      setRealDevices(devs);
      setIsScanning(scanning);
      setRealRooms(rooms);
      if (net) setNetworkName(net);
    });
    return unsub;
  }, []);

  const handleScanNow = async () => {
    await realNetworkDiscoveryService.scanNow();
  };

  const handleTogglePower = (id: string) => {
    realNetworkDiscoveryService.toggleDevicePower(id);
  };

  const [deviceFilter, setDeviceFilter] = useState<'ALL' | 'MATTER' | 'AUDIO' | 'LIGHTS' | 'RIGS' | 'CAMERAS'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Derive dynamic entities from live hardware
  const workstations = realDevices.filter(d => d.detailedType === 'WORKSTATION' || d.deviceClass === 'WORKSTATION');
  const mobileDevices = realDevices.filter(d => d.detailedType === 'PHONE' || d.deviceClass === 'MOBILE');
  const hubs = realDevices.filter(d => d.detailedType === 'HUB' || d.deviceClass === 'HUB');
  const cameras = realDevices.filter(d => d.detailedType === 'CAMERA' || d.deviceClass === 'CAMERA');
  const speakers = realDevices.filter(d => d.detailedType === 'SPEAKER' || d.deviceClass === 'SPEAKER');
  const lights = realDevices.filter(d => d.detailedType === 'LIGHT' || d.deviceClass === 'LIGHT');
  const displays = realDevices.filter(d => d.detailedType === 'DISPLAY' || d.detailedType === 'TV' || d.deviceClass === 'DISPLAY' || d.deviceClass === 'TV');
  const controllers = realDevices.filter(d => d.detailedType === 'CONTROLLER');
  const audioPro = realDevices.filter(d => d.detailedType === 'AUDIO_INTERFACE' || d.detailedType === 'MIC');
  const repurposedDevices = [...workstations, ...mobileDevices, ...hubs];
  const matterDevices = realDevices.filter(d => d.protocol === 'MATTER' || d.protocolBadge?.includes('MATTER'));

  const filteredHardware = realDevices.filter(device => {
    if (selectedRoom && device.roomId !== selectedRoom) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match = (
        device.cleanName?.toLowerCase().includes(q) ||
        device.rawName?.toLowerCase().includes(q) ||
        device.vendor?.toLowerCase().includes(q) ||
        device.brand?.toLowerCase().includes(q) ||
        device.model?.toLowerCase().includes(q) ||
        device.typeLabel?.toLowerCase().includes(q) ||
        device.roomName?.toLowerCase().includes(q) ||
        device.ip?.toLowerCase().includes(q)
      );
      if (!match) return false;
    }
    switch (deviceFilter) {
      case 'MATTER':
        return device.protocol === 'MATTER' || device.protocolBadge?.includes('MATTER');
      case 'AUDIO':
        return (
          device.detailedType === 'SPEAKER' ||
          device.deviceClass === 'SPEAKER' ||
          (device.detailedType === 'DISPLAY' && device.model?.toLowerCase().includes('music frame'))
        );
      case 'LIGHTS':
        return device.detailedType === 'LIGHT' || device.deviceClass === 'LIGHT';
      case 'RIGS':
        return (
          device.detailedType === 'WORKSTATION' ||
          device.deviceClass === 'WORKSTATION' ||
          device.detailedType === 'PHONE' ||
          device.deviceClass === 'MOBILE' ||
          device.detailedType === 'CONTROLLER' ||
          device.detailedType === 'AUDIO_INTERFACE' ||
          device.detailedType === 'MIC' ||
          device.detailedType === 'PERIPHERAL'
        );
      case 'CAMERAS':
        return (
          device.detailedType === 'CAMERA' ||
          device.deviceClass === 'CAMERA' ||
          device.detailedType === 'HUB' ||
          device.deviceClass === 'HUB'
        );
      default:
        return true;
    }
  });

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.05, delayChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: MOTION.springSoft }
  };

  return (
    <div
      className="min-h-screen text-[var(--text-primary)] relative overflow-hidden pb-40 selection:bg-[var(--pj-magenta)] selection:text-white"
      style={{
        backgroundColor: '#0d0015',
        backgroundImage: `
          radial-gradient(ellipse 90% 70% at 15% 10%, rgba(107, 0, 153, 0.75) 0%, transparent 60%),
          radial-gradient(ellipse 70% 60% at 85% 85%, rgba(212, 0, 85, 0.60) 0%, transparent 60%),
          radial-gradient(ellipse 55% 45% at 55% 45%, rgba(255, 140, 0, 0.18) 0%, transparent 65%)
        `
      }}
    >
      {/* Fading Atmospheric Artwork Slideshow Layer */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <motion.div
          animate={{ opacity: [0.22, 0.12, 0.22] }}
          transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute inset-0 bg-cover bg-center filter blur-[2px] brightness-75"
          style={{ backgroundImage: `url('/home/art_nebula.png')` }}
        />
        {/* Dark cosmic vignette */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0d0015]/90 via-[#0d0015]/75 to-[#0d0015]/95" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,#0d0015_85%)]" />
      </div>

      <Container className="relative z-10 pt-10 pb-24 flex flex-col gap-8">
        
        {/* TOP HEADER: Plajah Kinetic Style */}
        <motion.header 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={MOTION.spring}
          className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-[var(--pj-magenta)]/20"
        >
          <div className="flex items-center gap-4">
            {/* Plajah Double Chevron Badge */}
            <div className="px-4 py-2 rounded-full bg-[#100B17] border border-[var(--pj-magenta)]/60 flex items-center gap-2.5 shadow-lg shadow-[var(--pj-purple)]/30">
              <svg width="22" height="20" viewBox="0 0 60 70" fill="none" stroke="var(--pj-orange)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 16 L40 35 L16 54" />
                <path d="M28 16 L52 35 L28 54" opacity="0.6" />
              </svg>
              <span className="font-['Space_Grotesk'] font-bold tracking-wider text-xs text-white">PLAJAH</span>
              <span className="font-['Space_Grotesk'] font-black italic tracking-wide text-xs text-[var(--pj-orange)]">HOME</span>
            </div>

            <div className="flex flex-col">
              <span className="text-[10px] font-mono uppercase tracking-[0.28em] text-[var(--pj-orange)] font-bold">
                HOME CONDUCTOR // MATTER MASTER
              </span>
              <h1 className="text-2xl md:text-3xl font-black font-['Space_Grotesk'] tracking-tight text-white flex items-center gap-2">
                HEARTH <span className="text-white/40 font-light font-mono text-sm">// {realDevices.length} LIVE NODES</span>
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="hidden sm:flex items-center gap-3 px-3.5 py-1.5 rounded-full bg-[#100B17]/80 border border-white/10 font-mono text-xs text-white/70">
              <span className="w-2 h-2 rounded-full bg-[var(--pj-success)] animate-pulse" />
              <span className="text-white font-bold">{realDevices.length} LAN & MATTER NODES</span>
              <span className="text-white/30">|</span>
              <span className="text-[var(--pj-cyan)]">{networkName}</span>
            </div>

            <Button
              variant="secondary"
              size="xs"
              onClick={handleScanNow}
              disabled={isScanning}
              className="gap-1.5 font-bold"
            >
              <RefreshCw size={13} className={isScanning ? 'animate-spin' : ''} />
              <span>{isScanning ? 'SCANNING...' : 'SCAN LAN'}</span>
            </Button>

            <Button
              variant="primary"
              size="xs"
              onClick={() => setIsPairingOpen(true)}
              className="gap-1.5 font-bold bg-gradient-to-r from-[var(--pj-orange)] to-[var(--pj-magenta)] text-white shadow-md shadow-[var(--pj-orange)]/30"
            >
              <Plus size={14} />
              <span>PAIR MATTER</span>
            </Button>
          </div>
        </motion.header>

        {/* AUTHENTIC USER ACCOUNT INSIGHT BAR */}
        <UserAccountInsightBar user={currentUser} networkName={networkName} />

        {/* NAVIGATION TABS */}
        <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-[#100B17]/60 border border-[var(--pj-magenta)]/25 backdrop-blur-md">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition ${
              activeTab === 'overview'
                ? 'bg-[var(--pj-orange)] text-[#12080a] shadow-lg shadow-[var(--pj-orange)]/30'
                : 'text-white/70 hover:text-white'
            }`}
          >
            <Home size={13} />
            <span>OVERVIEW</span>
          </button>

          <button
            onClick={() => setActiveTab('layout')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition ${
              activeTab === 'layout'
                ? 'bg-[var(--pj-orange)] text-[#12080a] shadow-lg shadow-[var(--pj-orange)]/30'
                : 'text-white/70 hover:text-white'
            }`}
          >
            <MapPin size={13} />
            <span>HOME BLUEPRINT</span>
          </button>

          <button
            onClick={() => setActiveTab('chora')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition ${
              activeTab === 'chora'
                ? 'bg-[var(--pj-orange)] text-[#12080a] shadow-lg shadow-[var(--pj-orange)]/30'
                : 'text-white/70 hover:text-white'
            }`}
          >
            <Music size={13} />
            <span>CHORA STAGE</span>
          </button>

          <button
            onClick={() => setActiveTab('ld')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition ${
              activeTab === 'ld'
                ? 'bg-[var(--pj-orange)] text-[#12080a] shadow-lg shadow-[var(--pj-orange)]/30'
                : 'text-white/70 hover:text-white'
            }`}
          >
            <Lightbulb size={13} />
            <span>LD LIGHTING</span>
          </button>

          <button
            onClick={() => setActiveTab('meet')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition ${
              activeTab === 'meet'
                ? 'bg-[var(--pj-orange)] text-[#12080a] shadow-lg shadow-[var(--pj-orange)]/30'
                : 'text-white/70 hover:text-white'
            }`}
          >
            <Video size={13} />
            <span>VIDEO MEET</span>
          </button>

          <button
            onClick={() => setActiveTab('creators')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition ${
              activeTab === 'creators'
                ? 'bg-[var(--pj-orange)] text-[#12080a] shadow-lg shadow-[var(--pj-orange)]/30'
                : 'text-white/70 hover:text-white'
            }`}
          >
            <Sparkles size={13} />
            <span>CREATORS</span>
          </button>

          <button
            onClick={() => setActiveTab('files')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition ${
              activeTab === 'files'
                ? 'bg-[var(--pj-orange)] text-[#12080a] shadow-lg shadow-[var(--pj-orange)]/30'
                : 'text-white/70 hover:text-white'
            }`}
          >
            <Folder size={13} />
            <span>FILES & FTP</span>
          </button>

          <button
            onClick={() => setActiveTab('compute')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition ${
              activeTab === 'compute'
                ? 'bg-[var(--pj-orange)] text-[#12080a] shadow-lg shadow-[var(--pj-orange)]/30'
                : 'text-white/70 hover:text-white'
            }`}
          >
            <Cpu size={13} />
            <span>COMPUTE (FABULA)</span>
          </button>
        </div>

        {activeTab === 'overview' && (
          <>
            {/* ATMOSPHERIC LOUNGE COMMAND CENTERPIECE */}
            <AtmosphericLoungeCenterpiece />

            {/* QUICK SCENES RIBBON */}
            <motion.section
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...MOTION.spring, delay: 0.1 }}
              className="flex flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-[0.24em] text-[var(--pj-orange)] font-bold">
                  SCENE SELECTOR // ONE-TOUCH ATMOSPHERE
                </span>
                <span className="text-[10px] font-mono text-white/40">ARIA AUTO-ADAPT: ACTIVE</span>
              </div>
              <div className="overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
                <div className="flex gap-3 min-w-max">
                  {SCENE_PRESETS.map(scene => {
                    const Icon = scene.icon;
                    const isActive = activeScene === scene.id;
                    return (
                      <Chip
                        key={scene.id}
                        interactive
                        selected={isActive}
                        onClick={() => setActiveScene(isActive ? null : scene.id)}
                        className={isActive ? 'bg-gradient-to-r from-[var(--pj-purple)] to-[var(--pj-magenta)] text-white border-transparent shadow-md shadow-[var(--pj-magenta)]/30' : 'bg-[#1a0026]/40 border-[var(--pj-magenta)]/30 text-white/80'}
                      >
                        <Icon size={16} className={isActive ? 'text-white' : 'text-[var(--pj-orange)]'} />
                        {scene.label}
                      </Chip>
                    );
                  })}
                </div>
              </div>
            </motion.section>

            {/* PLAJAH HOME HUB: real Matter / Hue / camera devices, pairing, and the TV ambient feed */}
            <HomeHubPanel />

            {/* 3-COLUMN COMMAND BRIDGE LAYOUT */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* COLUMN 1: LIVE CAMERAS (4 cols) */}
              <div className="lg:col-span-4 flex flex-col gap-5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--pj-orange)] font-bold">
                    LIVE CAMERAS // PERIMETER
                  </span>
                  <span className="text-[9px] font-mono text-[var(--pj-success)] font-bold">{cameras.length > 0 ? `${cameras.length} ONLINE` : 'LIVE FEED'}</span>
                </div>
                
                {cameras.length > 0 ? (
                  cameras.slice(0, 2).map(cam => (
                    <MatterCameraCard key={cam.id} camera={cam} />
                  ))
                ) : (
                  <div className="p-6 rounded-[24px] bg-[#1a0026]/40 border border-[var(--pj-magenta)]/30 text-center flex flex-col items-center gap-3">
                    <Camera size={32} className="text-white/40" />
                    <span className="text-xs font-mono text-white/60">No dedicated IP cameras on {networkName}</span>
                    <Button variant="secondary" size="xs" onClick={() => setIsPairingOpen(true)}>
                      Pair Matter Camera
                    </Button>
                  </div>
                )}
              </div>

              {/* COLUMN 2: REAL ROOMS & ATMOSPHERE MATRIX (4 cols) */}
              <div className="lg:col-span-4 flex flex-col gap-5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--pj-orange)] font-bold">
                    ROOMS & ATMOSPHERE MATRIX
                  </span>
                  <span className="text-[9px] font-mono text-white/50">{realRooms.length} ROOMS</span>
                </div>

                <div className="flex flex-col gap-4">
                  {realRooms.length > 0 ? (
                    realRooms.slice(0, 4).map(room => (
                      <RoomCard 
                        key={room.roomId}
                        room={room} 
                        isSelected={selectedRoom === room.roomId}
                        onClick={() => setSelectedRoom(room.roomId === selectedRoom ? null : room.roomId)}
                      />
                    ))
                  ) : (
                    <div className="p-6 rounded-[24px] bg-[#1a0026]/40 border border-white/10 text-center text-xs font-mono text-white/50">
                      Scanning LAN rooms...
                    </div>
                  )}
                </div>
              </div>

              {/* COLUMN 3: REPURPOSED HARDWARE & WEBRTC (4 cols) */}
              <div className="lg:col-span-4 flex flex-col gap-5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--pj-orange)] font-bold">
                    REPURPOSED HARDWARE & WEBRTC
                  </span>
                  <span className="text-[9px] font-mono text-[var(--pj-cyan)] font-bold">{repurposedDevices.length} CONNECTED</span>
                </div>

                <RemoteWorkstationTile hostDevice={workstations[0]} />

                <div className="flex flex-col gap-3">
                  {repurposedDevices.slice(0, 3).map(device => (
                    <DeviceRow
                      key={device.id}
                      device={device}
                      onTogglePower={() => handleTogglePower(device.id)}
                    />
                  ))}
                </div>

                {realDevices.length > 0 && (
                  <div className="pt-2">
                    <DigitalFrameCard device={realDevices[0]} />
                  </div>
                )}
              </div>

            </div>

            {/* MASTER HARDWARE REGISTRY // COMPLETE FLEET INVENTORY */}
            <motion.section
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="flex flex-col gap-5 p-6 rounded-[28px] bg-[#100B17]/85 border border-[var(--pj-magenta)]/30 backdrop-blur-2xl shadow-2xl"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-white/10">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-[0.24em] text-[var(--pj-orange)] font-bold">
                      MASTER HARDWARE REGISTRY // FLEET INVENTORY
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-[var(--pj-cyan)]/15 border border-[var(--pj-cyan)]/30 text-[9px] font-mono text-[var(--pj-cyan)] font-bold">
                      {filteredHardware.length} OF {realDevices.length} DEVICES
                    </span>
                  </div>
                  <h2 className="font-['Space_Grotesk'] font-bold text-xl text-white tracking-wide mt-0.5">
                    Verified LAN & Matter Hardware Matrix
                  </h2>
                </div>

                {/* Search Input */}
                <div className="relative w-full md:w-72">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                  <input
                    type="text"
                    placeholder="Search OEM, model, IP or room..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-8 py-2 rounded-xl bg-black/40 border border-white/10 text-xs font-mono text-white placeholder-white/40 focus:outline-none focus:border-[var(--pj-magenta)] transition shadow-inner"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* Category Filter Chips & Active Room Filter */}
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { id: 'ALL', label: `ALL (${realDevices.length})` },
                  { id: 'MATTER', label: `MATTER (${matterDevices.length})` },
                  { id: 'AUDIO', label: `AUDIO & FRAMES (${speakers.length + displays.length})` },
                  { id: 'LIGHTS', label: `LIGHTING (${lights.length})` },
                  { id: 'RIGS', label: `RIGS & TECH (${workstations.length + mobileDevices.length + controllers.length + audioPro.length})` },
                  { id: 'CAMERAS', label: `CAMERAS & HUBS (${cameras.length + hubs.length})` }
                ].map(chip => (
                  <button
                    key={chip.id}
                    onClick={() => setDeviceFilter(chip.id as any)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition flex items-center gap-1.5 ${
                      deviceFilter === chip.id
                        ? 'bg-[var(--pj-orange)] text-[#12080a] shadow-md shadow-[var(--pj-orange)]/30'
                        : 'bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}

                {selectedRoom && (
                  <div className="flex items-center gap-2 ml-auto px-3 py-1.5 rounded-xl bg-[var(--pj-magenta)]/20 border border-[var(--pj-magenta)]/40 text-xs font-mono text-white">
                    <span>Room: <strong className="text-[var(--pj-orange)]">{realRooms.find(r => r.roomId === selectedRoom)?.roomName || selectedRoom}</strong></span>
                    <button
                      onClick={() => setSelectedRoom(null)}
                      className="text-white/60 hover:text-white ml-1 p-0.5 rounded hover:bg-white/10"
                      title="Clear room filter"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
              </div>

              {/* Responsive 2-Column Device Matrix */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 max-h-[580px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10">
                {filteredHardware.length > 0 ? (
                  filteredHardware.map(device => (
                    <DeviceRow
                      key={device.id}
                      device={device}
                      onTogglePower={() => handleTogglePower(device.id)}
                    />
                  ))
                ) : (
                  <div className="col-span-1 lg:col-span-2 py-12 text-center flex flex-col items-center gap-3 bg-black/20 rounded-2xl border border-white/5">
                    <Search size={32} className="text-white/20" />
                    <span className="text-xs font-mono text-white/50">No devices matching current filter or search criteria</span>
                    <button
                      onClick={() => { setDeviceFilter('ALL'); setSearchQuery(''); setSelectedRoom(null); }}
                      className="text-xs font-mono text-[var(--pj-cyan)] hover:underline"
                    >
                      Reset all filters
                    </button>
                  </div>
                )}
              </div>
            </motion.section>

            {/* TWO COLUMN LOWER SECTION */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8">
              
              {/* INTERCOM */}
              <motion.section
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="flex flex-col gap-6"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-[0.24em] text-[var(--pj-orange)] font-bold">
                    INTERCOM // HOME BROADCAST NETWORK
                  </span>
                  <Button variant="accent" size="xs" className="font-bold gap-1.5">
                    <Mic size={14} className="text-[#12080a]" /> Broadcast All
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {speakers.length > 0 ? (
                    speakers.slice(0, 4).map(node => (
                      <motion.div key={node.id} variants={itemVariants}>
                        <IntercomNode device={node} />
                      </motion.div>
                    ))
                  ) : (
                    <div className="col-span-2 p-6 rounded-2xl bg-[#1a0026]/30 text-center text-xs font-mono text-white/50">
                      No active intercom speaker nodes detected.
                    </div>
                  )}
                </div>
              </motion.section>

              {/* DIGITAL FRAMES */}
              <motion.section
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="flex flex-col gap-6"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-[0.24em] text-[var(--pj-orange)] font-bold">
                    DIGITAL FRAMES // DLNA AMBIENT CANVAS
                  </span>
                  <span className="text-[10px] font-mono text-[var(--pj-cyan)]">ACTIVE SCREENS</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {workstations.concat(mobileDevices).slice(0, 2).map(frame => (
                    <motion.div key={frame.id} variants={itemVariants}>
                      <DigitalFrameCard device={frame} />
                    </motion.div>
                  ))}
                </div>
              </motion.section>

            </div>
          </>
        )}

        {/* INTERACTIVE HOME BLUEPRINT & FLOOR PLAN LAYOUT */}
        {activeTab === 'layout' && <HomeLayoutView />}

        {/* NETWORK FILE EXPLORER TAB */}
        {activeTab === 'files' && <NetworkFileExplorer />}

        {/* DISTRIBUTED COMPUTE TAB */}
        {activeTab === 'compute' && <DistributedRenderCluster />}

        {/* CHORA VISUALIZER TAB */}
        {activeTab === 'chora' && <ChoraVisualizerStage />}

        {/* LD SMART LIGHTING TAB */}
        {activeTab === 'ld' && <LdLightingController />}

        {/* VIDEO MEET TAB */}
        {activeTab === 'meet' && <VideoMeetDashboard />}

        {/* CREATOR PROMO TAB */}
        {activeTab === 'creators' && <CreatorSpotlight />}

        {/* DOCKED CHORA PLAYER BAR — Authentic Multi-Room Lossless Audio */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={MOTION.springSoft}
          className="mt-8 w-full max-w-4xl mx-auto"
        >
          <div className="relative rounded-[28px] overflow-hidden flex flex-col sm:flex-row items-center gap-4 p-3 pr-6 bg-[#0c0814]/90 border border-[var(--pj-magenta)]/30 shadow-2xl shadow-black/80 backdrop-blur-2xl">
            {/* Progress Bar Top */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-white/5">
              <div className="h-full w-2/5 bg-gradient-to-r from-[var(--pj-purple)] via-[var(--pj-magenta)] to-[var(--pj-orange)]" />
            </div>

            <div className="flex items-center gap-4 w-full sm:w-auto flex-1 min-w-0">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#6B0099] via-[#D40055] to-[#FF8C00] p-0.5 shadow-lg flex-shrink-0">
                <div className="w-full h-full bg-[#100B17] rounded-[14px] flex items-center justify-center">
                  <Speaker size={22} className="text-[var(--pj-orange)]" />
                </div>
              </div>
              <div className="flex flex-col flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-['Space_Grotesk'] font-bold text-white text-base truncate">Midnight City</span>
                  <span className="px-1.5 py-0.5 rounded bg-[var(--pj-cyan)]/15 border border-[var(--pj-cyan)]/30 text-[9px] font-mono text-[var(--pj-cyan)] font-bold">
                    24-BIT/192kHz
                  </span>
                </div>
                <div className="text-xs font-mono text-white/50 truncate flex items-center gap-2">
                  M83 <span className="text-[var(--pj-orange)]">·</span> LIVING ROOM FRAME & ALL SPEAKERS
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-center sm:justify-end border-t border-white/5 sm:border-t-0 pt-3 sm:pt-0">
              <IconButton variant="secondary" aria-label="Cast Target">
                <Cast size={18} />
              </IconButton>
              <IconButton variant="secondary" aria-label="Previous">
                <SkipForward size={18} className="rotate-180" />
              </IconButton>
              <div 
                className="w-12 h-12 rounded-full bg-[var(--pj-orange)] text-[#12080a] flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition-transform shadow-lg shadow-[var(--pj-orange)]/30 font-black" 
                onClick={() => setIsPlaying(!isPlaying)}
              >
                {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" className="ml-0.5" />}
              </div>
              <IconButton variant="secondary" aria-label="Next">
                <SkipForward size={18} />
              </IconButton>
            </div>
          </div>
        </motion.div>

      </Container>

      {/* PAIR MATTER DEVICE MODAL */}
      <PairMatterModal
        isOpen={isPairingOpen}
        onClose={() => setIsPairingOpen(false)}
        onPaired={() => realNetworkDiscoveryService.scanNow()}
        availableRooms={realRooms.map(r => r.roomName)}
      />

    </div>
  );
}
