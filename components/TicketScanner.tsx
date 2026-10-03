import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  QrCode, Check, X, ArrowLeft, Ticket, AlertCircle, RefreshCw,
  Camera, CameraOff, Flashlight, FlipHorizontal, CheckCircle2,
  Users, Volume2, VolumeX, ShieldCheck, Wine, Coffee, Utensils,
  Sparkles, Award, Clock, ChevronRight, Zap, MapPin
} from 'lucide-react';
import { validateTicket, fetchTicket, redeemTicketPackage } from '../services/backendService';
import { TicketPurchasedPackage } from '../types';

interface Props {
  eventId: string;
  eventTitle?: string;
  onBack: () => void;
}

type ScanResult = {
  valid: boolean;
  holderName?: string;
  tierName?: string;
  reason?: string;
  quantity?: number;
  ticketId?: string;
  packages?: TicketPurchasedPackage[];
  eventCoverImage?: string;
} | null;

// Sound synthesizer using Web Audio API
function playBeep(success: boolean) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (success) {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc.start();
      osc.stop(ctx.currentTime + 0.18);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    }
  } catch {}
}

function playPosChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(1046.5, ctx.currentTime);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1318.5, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.12);
    osc2.start(ctx.currentTime + 0.08);
    osc2.stop(ctx.currentTime + 0.35);
  } catch {}
}

const BAR_STATIONS = ['Main Stage Bar', 'Patio Lounge', 'VIP Deck Bar', 'Food Truck Row', 'East Concessions'];
const ITEM_PRESETS = ['Craft Draft Beer', 'Signature Cocktail', 'Wine by Glass', 'Zero-Proof Mocktail', 'Specialty Food Entree'];

const TicketScanner: React.FC<Props> = ({ eventId, eventTitle, onBack }) => {
  const [scannerMode, setScannerMode]     = useState<'DOOR' | 'BAR_POS'>('BAR_POS');
  const [currentStation, setCurrentStation] = useState('Main Stage Bar');
  const [selectedItemName, setSelectedItemName] = useState('Craft Draft Beer');
  const [manualId, setManualId]           = useState('');
  const [result, setResult]               = useState<ScanResult>(null);
  const [checking, setChecking]           = useState(false);
  const [redeeming, setRedeeming]         = useState(false);
  const [overrideCooldown, setOverrideCooldown] = useState(false);
  const [scanCount, setScanCount]         = useState({ valid: 0, invalid: 0, drinksRedeemed: 0 });
  const [history, setHistory]             = useState<Array<{ name: string; tier: string; time: string; valid: boolean; note?: string }>>([]);

  // Camera state
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [facingMode, setFacingMode]       = useState<'environment' | 'user'>('environment');
  const [torchOn, setTorchOn]             = useState(false);
  const [cameraError, setCameraError]     = useState<string | null>(null);

  const videoRef                          = useRef<HTMLVideoElement>(null);
  const inputRef                          = useRef<HTMLInputElement>(null);
  const clearTimer                        = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const streamRef                         = useRef<MediaStream | null>(null);
  const animationFrameId                  = useRef<number | null>(null);
  const isScanningRef                     = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const validate = useCallback(async (ticketId: string) => {
    const cleanId = ticketId.trim();
    if (!cleanId || isScanningRef.current) return;
    isScanningRef.current = true;
    setChecking(true);
    setResult(null);

    try {
      // In Bar POS mode, fetch the ticket directly to check active packages without marking admission USED
      if (scannerMode === 'BAR_POS') {
        const t = await fetchTicket(cleanId);
        if (!t) {
          playBeep(false);
          setResult({ valid: false, reason: 'Ticket not found in database', ticketId: cleanId });
          setScanCount(s => ({ ...s, invalid: s.invalid + 1 }));
          isScanningRef.current = false;
          return;
        }

        playBeep(true);
        const scanRes: ScanResult = {
          valid: true,
          ticketId: cleanId,
          holderName: t.holderName,
          tierName: t.tierName,
          quantity: t.quantity,
          packages: t.packages || [],
          eventCoverImage: t.eventCoverImage,
        };
        setResult(scanRes);
        setScanCount(s => ({ ...s, valid: s.valid + 1 }));

        setHistory(h => [
          {
            name: t.holderName || cleanId,
            tier: t.tierName || 'Guest',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            valid: true,
            note: `${(t.packages || []).length} Packages Attached`,
          },
          ...h.slice(0, 9),
        ]);
        // Leave card open in Bar POS mode so staff can redeem
      } else {
        // Door check-in mode
        const res = await validateTicket(cleanId);
        const isOk = res.valid;
        playBeep(isOk);

        const scanRes: ScanResult = { ...res, ticketId: cleanId };
        setResult(scanRes);
        setScanCount(prev => ({
          ...prev,
          valid: prev.valid + (isOk ? 1 : 0),
          invalid: prev.invalid + (isOk ? 0 : 1),
        }));

        setHistory(h => [
          {
            name: res.holderName || cleanId,
            tier: res.tierName || 'Standard',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            valid: isOk,
            note: 'Door Check-in',
          },
          ...h.slice(0, 9),
        ]);

        // Auto-clear after 3.5s in door mode
        clearTimer.current = setTimeout(() => {
          setResult(null);
          setManualId('');
          isScanningRef.current = false;
          inputRef.current?.focus();
        }, 3500);
      }
    } catch {
      playBeep(false);
      setResult({ valid: false, reason: 'Network error — check connection' });
      clearTimer.current = setTimeout(() => {
        setResult(null);
        isScanningRef.current = false;
      }, 3000);
    } finally {
      setChecking(false);
    }
  }, [scannerMode]);

  // Handle staff 1-tap package redemption
  const handleRedeemPackage = async (pkg: TicketPurchasedPackage) => {
    if (!result?.ticketId) return;
    setRedeeming(true);

    try {
      const res = await redeemTicketPackage({
        ticketId: result.ticketId,
        packageId: pkg.id,
        units: 1,
        itemName: selectedItemName,
        stationName: currentStation,
        staffName: 'Staff POS',
        overrideCooldown,
      });

      if (res.success && res.package) {
        playPosChime();
        setScanCount(s => ({ ...s, drinksRedeemed: s.drinksRedeemed + 1 }));

        // Update package state in result
        setResult(prev => {
          if (!prev) return null;
          const updatedPkgs = (prev.packages || []).map(p =>
            p.id === res.package.id ? res.package : p
          );
          return { ...prev, packages: updatedPkgs };
        });

        // Add to history
        setHistory(h => [
          {
            name: result.holderName || 'Attendee',
            tier: result.tierName || 'Living Pass',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            valid: true,
            note: `Redeemed ${selectedItemName} at ${currentStation}`,
          },
          ...h.slice(0, 9),
        ]);
      } else {
        alert(res.reason || 'Could not redeem package');
      }
    } catch (e: any) {
      alert(e.message || 'Error executing redemption');
    } finally {
      setRedeeming(false);
    }
  };

  const handleNextGuest = () => {
    setResult(null);
    setManualId('');
    isScanningRef.current = false;
    inputRef.current?.focus();
  };

  // WebRTC Camera Stream setup
  useEffect(() => {
    if (!isCameraActive) return;

    let localStream: MediaStream | null = null;
    setCameraError(null);

    navigator.mediaDevices?.getUserMedia({
      video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
    })
      .then(stream => {
        localStream = stream;
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      })
      .catch(err => {
        console.warn('Camera stream error:', err);
        setCameraError('Camera access unavailable. Use barcode gun / manual input.');
      });

    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isCameraActive, facingMode]);

  // BarcodeDetector loop if supported by browser
  useEffect(() => {
    let active = true;
    const barcodeDetector = (window as any).BarcodeDetector
      ? new (window as any).BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39'] })
      : null;

    const scanFrame = async () => {
      if (!active || !videoRef.current || isScanningRef.current || !barcodeDetector) {
        animationFrameId.current = requestAnimationFrame(scanFrame);
        return;
      }

      if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
        try {
          const barcodes = await barcodeDetector.detect(videoRef.current);
          if (barcodes.length > 0 && barcodes[0].rawValue) {
            let code = barcodes[0].rawValue;
            if (code.includes('/ticket/')) code = code.split('/ticket/').pop();
            else if (code.includes('plajah://')) code = code.replace('plajah://', '');
            validate(code);
          }
        } catch {}
      }
      animationFrameId.current = requestAnimationFrame(scanFrame);
    };

    if (barcodeDetector) {
      animationFrameId.current = requestAnimationFrame(scanFrame);
    }

    return () => {
      active = false;
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    };
  }, [validate]);

  // Torch toggle
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track && (track.getCapabilities as any)?.().torch) {
      try {
        await (track as any).applyConstraints({ advanced: [{ torch: !torchOn }] });
        setTorchOn(t => !t);
      } catch {}
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    validate(manualId);
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col text-white font-sans z-[99999]">
      {/* Top Header & Mode Switcher */}
      <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-3 border-b border-white/10 shrink-0 bg-black/85 backdrop-blur-xl gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-white/60 hover:text-white text-xs font-black uppercase tracking-wider transition-colors"
          >
            <ArrowLeft size={16} /> Exit
          </button>
          <div className="h-4 w-px bg-white/15" />
          <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
            <button
              onClick={() => setScannerMode('BAR_POS')}
              className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                scannerMode === 'BAR_POS'
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-md'
                  : 'text-white/50 hover:text-white'
              }`}
            >
              <Wine size={12} /> Bar & F&B POS
            </button>
            <button
              onClick={() => setScannerMode('DOOR')}
              className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                scannerMode === 'DOOR'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-white/50 hover:text-white'
              }`}
            >
              <Ticket size={12} /> Door Admission
            </button>
          </div>
        </div>

        {/* Station Selector */}
        {scannerMode === 'BAR_POS' && (
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-white/40 flex items-center gap-1">
              <MapPin size={10} /> Station:
            </span>
            <select
              value={currentStation}
              onChange={e => setCurrentStation(e.target.value)}
              className="px-2.5 py-1 bg-white/10 border border-white/15 rounded-lg text-xs font-bold text-white outline-none"
            >
              {BAR_STATIONS.map((st, i) => (
                <option key={i} value={st} className="bg-neutral-900 text-white">{st}</option>
              ))}
            </select>
          </div>
        )}

        {/* Live Counters */}
        <div className="flex items-center gap-3 text-xs">
          {scannerMode === 'BAR_POS' && (
            <span className="text-blue-400 font-black flex items-center gap-1">
              🍸 {scanCount.drinksRedeemed} Poured
            </span>
          )}
          <span className="text-emerald-400 font-black flex items-center gap-1">
            <CheckCircle2 size={13} /> {scanCount.valid}
          </span>
          <span className="text-red-400 font-black">
            ✗ {scanCount.invalid}
          </span>
        </div>
      </div>

      {/* Main Scanner Body */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left / Center: Camera Optical Target */}
        <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
          {isCameraActive && !cameraError ? (
            <video
              ref={videoRef}
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="text-center p-8 max-w-sm">
              <CameraOff size={48} className="mx-auto mb-3 text-white/30" />
              <p className="text-xs text-white/50">{cameraError || 'Camera inactive'}</p>
            </div>
          )}

          {/* Scanner Optical Viewfinder Overlay */}
          <div className="absolute inset-0 bg-black/35 backdrop-brightness-95 flex items-center justify-center pointer-events-none">
            <div className="relative w-64 h-64 md:w-80 md:h-80">
              {[['top-0 left-0','border-t-4 border-l-4'],['top-0 right-0','border-t-4 border-r-4'],['bottom-0 left-0','border-b-4 border-l-4'],['bottom-0 right-0','border-b-4 border-r-4']].map(([pos, borders], i) => (
                <div key={i} className={`absolute ${pos} w-10 h-10 ${borders} ${scannerMode === 'BAR_POS' ? 'border-blue-400 shadow-[0_0_15px_rgba(96,165,250,0.5)]' : 'border-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.5)]'} rounded-sm`} />
              ))}

              <motion.div
                animate={{ y: ['0%', '280%', '0%'] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                className={`h-1 bg-gradient-to-r from-transparent ${scannerMode === 'BAR_POS' ? 'via-blue-400 shadow-[0_0_15px_#60a5fa]' : 'via-emerald-400 shadow-[0_0_15px_#34d399]'} to-transparent`}
              />

              <div className="absolute inset-0 flex items-center justify-center opacity-10">
                <QrCode size={120} />
              </div>
            </div>
          </div>

          {/* Camera Controls Floating Bar */}
          <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
            <button
              onClick={() => setFacingMode(f => f === 'environment' ? 'user' : 'environment')}
              className="p-3 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white/80 hover:text-white"
              title="Flip Camera"
            >
              <FlipHorizontal size={16} />
            </button>
            <button
              onClick={toggleTorch}
              className={`p-3 rounded-full backdrop-blur-md border transition-all ${
                torchOn ? 'bg-amber-400 text-black border-amber-400 shadow-lg' : 'bg-black/60 border-white/20 text-white/80 hover:text-white'
              }`}
              title="Toggle Flashlight"
            >
              <Flashlight size={16} />
            </button>
          </div>

          {/* Scanned Result Modal Overlay */}
          <AnimatePresence>
            {result && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="absolute inset-0 z-30 flex items-center justify-center p-6 bg-black/90 backdrop-blur-lg overflow-y-auto"
              >
                {/* BAR POS MODE RESULT CARD */}
                {scannerMode === 'BAR_POS' ? (
                  <div className="bg-[#121216] border border-blue-400/30 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center text-xl font-black text-white shadow-lg">
                          {(result.holderName || 'G')[0]}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-black uppercase tracking-widest text-blue-400">All-Access Guest</span>
                            <span className="px-1.5 py-0.2 bg-blue-500/20 text-blue-300 text-[8px] font-black uppercase rounded">Verified</span>
                          </div>
                          <h3 className="text-base font-black text-white leading-tight">{result.holderName || 'Attendee'}</h3>
                          <p className="text-[10px] text-white/40">{result.tierName || 'General Admission'} · ID #{result.ticketId?.slice(-6).toUpperCase()}</p>
                        </div>
                      </div>
                      <button
                        onClick={handleNextGuest}
                        className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-colors"
                      >
                        Next Guest ✕
                      </button>
                    </div>

                    {/* Quick Item Picker for Bar */}
                    <div className="p-3 bg-white/[0.03] border border-white/8 rounded-2xl space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest text-white/40 block">Item Dispensed</label>
                      <div className="flex flex-wrap gap-1.5">
                        {ITEM_PRESETS.map((item, idx) => (
                          <button
                            key={idx}
                            onClick={() => setSelectedItemName(item)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                              selectedItemName === item
                                ? 'bg-blue-500 text-black shadow-md'
                                : 'bg-white/5 text-white/60 hover:text-white border border-white/5'
                            }`}
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Active Packages List & 1-Tap Pour Buttons */}
                    <div className="space-y-2.5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Active Packages Attached</p>

                      {(!result.packages || result.packages.length === 0) ? (
                        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-center space-y-1">
                          <p className="text-xs font-bold text-amber-300">No Beverage or Food Packages Attached</p>
                          <p className="text-[10px] text-amber-200/60">Standard admission only. Guest pays standard retail at register.</p>
                        </div>
                      ) : (
                        result.packages.map((pkg) => {
                          const isUnlimited = pkg.type === 'UNLIMITED';
                          const isCooldown = pkg.cooldownMinutes && pkg.lastRedeemedAt && (Date.now() - pkg.lastRedeemedAt < pkg.cooldownMinutes * 60 * 1000);
                          const remainingSec = isCooldown ? Math.ceil((pkg.cooldownMinutes! * 60 * 1000 - (Date.now() - pkg.lastRedeemedAt!)) / 1000) : 0;
                          const hasUnits = isUnlimited || pkg.remainingUnits > 0;

                          return (
                            <div
                              key={pkg.id}
                              className="p-4 rounded-2xl bg-gradient-to-r from-white/[0.04] to-white/[0.02] border border-white/10 space-y-3"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h4 className="text-xs font-black text-white">{pkg.name}</h4>
                                    {isUnlimited && (
                                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[8px] font-black uppercase">
                                        Unlimited
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-white/40 line-clamp-1 mt-0.5">{pkg.eligibleItemsDescription}</p>
                                </div>
                                <div className="text-right shrink-0">
                                  {!isUnlimited && (
                                    <span className="text-sm font-black text-amber-300 font-mono">
                                      {pkg.type === 'VALUE_ALLOWANCE' ? `$${(pkg.remainingUnits / 100).toFixed(2)}` : `${pkg.remainingUnits} Left`}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Cooldown Warning if applicable */}
                              {isCooldown && (
                                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between text-[11px] text-amber-300">
                                  <div className="flex items-center gap-1.5">
                                    <Clock size={12} />
                                    <span>Pacing Cooldown: {Math.ceil(remainingSec / 60)}m left</span>
                                  </div>
                                  <label className="flex items-center gap-1 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={overrideCooldown}
                                      onChange={e => setOverrideCooldown(e.target.checked)}
                                      className="accent-amber-400 w-3.5 h-3.5"
                                    />
                                    <span className="text-[9px] uppercase font-black">Staff Override</span>
                                  </label>
                                </div>
                              )}

                              {/* 1-Tap Redeem Button */}
                              <button
                                disabled={(!hasUnits || (isCooldown && !overrideCooldown)) || redeeming}
                                onClick={() => handleRedeemPackage(pkg)}
                                className={`w-full py-3 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg ${
                                  !hasUnits
                                    ? 'bg-white/10 text-white/30 cursor-not-allowed'
                                    : isCooldown && !overrideCooldown
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                    : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:brightness-110 text-white shadow-blue-500/20'
                                }`}
                              >
                                {redeeming ? <RefreshCw size={14} className="animate-spin" /> : <Wine size={14} />}
                                {redeeming ? 'Recording Pour…' : !hasUnits ? 'Allowance Exhausted' : `POUR / REDEEM 1 (${selectedItemName})`}
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : (
                  /* DOOR ADMISSION RESULT CARD */
                  <div className={`p-8 rounded-3xl border-2 text-center max-w-sm w-full shadow-2xl ${
                    result.valid
                      ? 'border-emerald-500 bg-emerald-950/40 shadow-emerald-900/40'
                      : 'border-red-500 bg-red-950/40 shadow-red-900/40'
                  }`}>
                    <div className={`w-24 h-24 mx-auto rounded-full flex items-center justify-center mb-4 ${
                      result.valid ? 'bg-emerald-500/20 text-emerald-400 border-2 border-emerald-400' : 'bg-red-500/20 text-red-400 border-2 border-red-400'
                    }`}>
                      {result.valid ? <Check size={52} /> : <X size={52} />}
                    </div>

                    <p className={`text-4xl font-black uppercase tracking-tight mb-1 ${result.valid ? 'text-emerald-400' : 'text-red-400'}`}>
                      {result.valid ? 'VALID PASS' : 'INVALID'}
                    </p>

                    <p className="text-xl font-black text-white mt-1 truncate">
                      {result.holderName || 'Attendee'}
                    </p>

                    {result.tierName && (
                      <p className="text-xs font-black uppercase tracking-widest text-emerald-300 mt-0.5">
                        {result.tierName} {result.quantity && result.quantity > 1 ? `× ${result.quantity}` : ''}
                      </p>
                    )}

                    {result.reason && (
                      <p className="text-xs text-red-300 mt-2 font-medium">
                        {result.reason}
                      </p>
                    )}

                    {/* Living Pass Perks Notice at the Door */}
                    {result.packages && result.packages.length > 0 && (
                      <div className="mt-4 p-2.5 rounded-xl bg-blue-500/20 border border-blue-400/30 text-xs text-blue-200">
                        <p className="font-black text-[10px] uppercase tracking-wider text-blue-300">
                          🍸 Living Pass Perks Attached ({result.packages.length})
                        </p>
                        <p className="text-[10px] text-white/70">
                          Issue VIP wristband & souvenir cup if included in package.
                        </p>
                      </div>
                    )}

                    <p className="text-[10px] text-white/30 uppercase tracking-widest mt-6 animate-pulse">
                      Ready for next ticket…
                    </p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Panel: Manual Input & Recent Audit Log */}
        <div className="w-full lg:w-96 border-l border-white/10 bg-[#0a0a0a] flex flex-col shrink-0">
          <div className="p-5 border-b border-white/10 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
              Manual / Barcode Scanner Input
            </p>
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                ref={inputRef}
                value={manualId}
                onChange={e => setManualId(e.target.value)}
                placeholder="Scan or enter ticket ID…"
                className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-white/20 outline-none focus:border-blue-400 font-mono"
              />
              <button
                type="submit"
                disabled={checking || !manualId.trim()}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all disabled:opacity-40"
              >
                {checking ? <RefreshCw size={14} className="animate-spin" /> : 'Enter'}
              </button>
            </form>
          </div>

          {/* Recent Audit Log */}
          <div className="flex-1 p-5 overflow-y-auto space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
                Recent Scans & Pours
              </p>
              <span className="text-[10px] font-mono text-white/30">{history.length} events</span>
            </div>

            {history.length === 0 ? (
              <div className="py-12 text-center text-white/25 text-xs">
                <Ticket size={24} className="mx-auto mb-2 opacity-30" />
                <p>No scans recorded yet</p>
                <p className="text-[10px]">Camera or USB gun will auto-populate here</p>
              </div>
            ) : (
              <div className="space-y-2">
                {history.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${item.valid ? 'bg-emerald-400' : 'bg-red-400'}`} />
                        <span className="font-black text-white">{item.name}</span>
                      </div>
                      <p className="text-[10px] text-white/40 pl-4">{item.note || item.tier}</p>
                    </div>
                    <span className="font-mono text-[10px] text-white/30">{item.time}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TicketScanner;
