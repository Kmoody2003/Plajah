import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar, MapPin, Globe, Ticket, Printer, Download,
  ArrowLeft, Check, RefreshCw, Package, Camera, Navigation2,
  CheckCircle2, Wine, Utensils, Award, Plus, Sparkles, QrCode
} from 'lucide-react';
import { fetchTicket, printTicket, validateTicket, redeemTicketPackage, addPackageToTicket, DEFAULT_VENUE_PACKAGES } from '../services/backendService';
import { UserProfile, TicketPurchasedPackage } from '../types';
import TelaTicketPass from './tela/TelaTicketPass';
import PackagePerksTracker from './tela/PackagePerksTracker';

interface Props {
  ticketId: string;
  currentUser: UserProfile;
  onBack: () => void;
  onOpenPhotoPool?: (poolId: string) => void;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const TicketView: React.FC<Props> = ({ ticketId, currentUser, onBack, onOpenPhotoPool }) => {
  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [printerId, setPrinterId] = useState('');
  const [showPrintForm, setShowPrintForm] = useState(false);
  const [geofenceNearby, setGeofenceNearby] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkedInSuccess, setCheckedInSuccess] = useState(false);
  const [showBarOrderMode, setShowBarOrderMode] = useState(false);
  const [showAddPackageModal, setShowAddPackageModal] = useState(false);
  const [addingPackage, setAddingPackage] = useState(false);
  const trackerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchTicket(ticketId).then(t => {
      setTicket(t);
      setLoading(false);

      // Check Geofence if event coordinates exist
      if (t && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => {
            const targetLat = t.lat || 42.3314;
            const targetLng = t.lng || -83.0458;
            const dist = haversineMeters(
              pos.coords.latitude,
              pos.coords.longitude,
              targetLat,
              targetLng
            );
            if (dist <= 350) {
              setGeofenceNearby(true);
            }
          },
          () => {},
          { timeout: 8000 }
        );
      }
    });
  }, [ticketId]);

  const handleSelfCheckIn = async () => {
    setCheckingIn(true);
    try {
      const res = await validateTicket(ticketId);
      if (res.valid) {
        setCheckedInSuccess(true);
        setTicket((prev: any) => ({ ...prev, status: 'USED' }));
      } else {
        alert(res.reason || 'Check-in failed');
      }
    } catch (e: any) {
      alert(e.message || 'Error checking in');
    } finally {
      setCheckingIn(false);
    }
  };

  const handleRedeemPackageItem = async (packageId: string, itemName: string, stationName: string): Promise<boolean> => {
    try {
      const res = await redeemTicketPackage({
        ticketId,
        packageId,
        units: 1,
        itemName,
        stationName,
        staffName: 'Self-Order Test',
      });
      if (res.success && res.package) {
        setTicket((prev: any) => {
          const pkgs: TicketPurchasedPackage[] = prev.packages || [];
          const updated = pkgs.map(p => (p.id === res.package.id ? res.package : p));
          return { ...prev, packages: updated };
        });
        return true;
      } else {
        alert(res.reason || 'Redemption unfulfilled');
        return false;
      }
    } catch (e: any) {
      alert(e.message || 'Network error on redemption');
      return false;
    }
  };

  const handleAttachDemoPackage = async (preset: any) => {
    setAddingPackage(true);
    try {
      const res = await addPackageToTicket(ticketId, preset);
      if (res.success && res.package) {
        setTicket((prev: any) => ({
          ...prev,
          packages: [...(prev.packages || []), res.package],
        }));
        setShowAddPackageModal(false);
      }
    } catch (e: any) {
      // Local fallback for offline / mock testing
      const newPkg: TicketPurchasedPackage = {
        id: `tpkg_${Date.now()}`,
        packageAddonId: preset.id,
        name: preset.name,
        category: preset.category,
        type: preset.type,
        totalUnits: preset.totalUnits,
        remainingUnits: preset.totalUnits,
        unitName: preset.unitName,
        eligibleItems: preset.eligibleItems,
        eligibleItemsDescription: preset.eligibleItemsDescription,
        stations: preset.stations,
        cooldownMinutes: preset.cooldownMinutes,
        souvenirCupIncluded: preset.souvenirCupIncluded,
        badgeColor: preset.badgeColor,
        redemptions: [],
      };
      setTicket((prev: any) => ({
        ...prev,
        packages: [...(prev.packages || []), newPkg],
      }));
      setShowAddPackageModal(false);
    } finally {
      setAddingPackage(false);
    }
  };

  const handleBrowserPrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <RefreshCw size={24} className="animate-spin text-white/30" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="text-center py-24 text-white/40">
        <Ticket size={36} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm font-black">Ticket not found</p>
        <button onClick={onBack} className="mt-4 text-xs text-[#c084fc] hover:underline">
          Return to tickets
        </button>
      </div>
    );
  }

  const isUsed = ticket.status === 'USED' || checkedInSuccess;
  const poolId = ticket.photoPoolId || `pool_${ticket.eventId}`;
  const packages: TicketPurchasedPackage[] = ticket.packages || [];

  return (
    <div className="min-h-screen text-white p-4 max-w-md mx-auto font-sans pb-24">
      {/* Header Back Button & Bar Order Mode Toggle */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-white/40 hover:text-white text-xs font-black uppercase tracking-wider transition-colors"
        >
          <ArrowLeft size={16} /> My Passes
        </button>

        <div className="flex items-center gap-2">
          {packages.length > 0 && (
            <button
              onClick={() => setShowBarOrderMode(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-400/30 text-blue-300 hover:text-white text-[10px] font-black uppercase tracking-wider shadow-sm transition-all"
            >
              <Wine size={12} /> Bar Order Mode
            </button>
          )}

          <button
            onClick={handleBrowserPrint}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white text-[10px] font-black uppercase tracking-wider"
          >
            <Printer size={12} /> Print
          </button>
        </div>
      </div>

      {/* Tela Living Ticket Pass */}
      <TelaTicketPass
        eventTitle={ticket.eventTitle || 'Live Event'}
        artistName={ticket.artistName || 'Featured Artist'}
        date={ticket.eventStartDate ? new Date(ticket.eventStartDate).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' }) : 'TBA'}
        time={ticket.eventStartDate ? new Date(ticket.eventStartDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'TBA'}
        venue={ticket.eventVenue || 'Venue'}
        city={ticket.city || ''}
        tierName={ticket.tierName || 'General Admission'}
        priceCents={ticket.totalPriceCents || 0}
        holderName={ticket.holderName || currentUser.displayName}
        ticketNumber={ticket.id || ticketId}
        coverImage={ticket.eventCoverImage}
        design={ticket.ticketDesign}
        interactive={true}
        qrData={`plajah.com/event/${ticket.eventId}/ticket/${ticket.id || ticketId}`}
        isCheckedIn={isUsed}
        geofenceNearby={geofenceNearby}
        packages={packages}
        onOpenPackages={() => {
          trackerRef.current?.scrollIntoView({ behavior: 'smooth' });
        }}
        onJoinPhotoPool={() => {
          if (onOpenPhotoPool) onOpenPhotoPool(poolId);
          else alert('Opening Live Photo Pool…');
        }}
        onAutoCheckIn={handleSelfCheckIn}
      />

      {/* Geofence Proximity Card */}
      {geofenceNearby && !isUsed && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <Navigation2 size={16} className="animate-pulse" />
            </div>
            <div>
              <p className="text-xs font-black text-emerald-300">You Are at the Venue!</p>
              <p className="text-[10px] text-emerald-400/70">Geofence radius detected. Tap to check in at the door.</p>
            </div>
          </div>
          <button
            onClick={handleSelfCheckIn}
            disabled={checkingIn}
            className="px-4 py-2 bg-emerald-500 text-black font-black text-[10px] uppercase tracking-wider rounded-xl hover:brightness-110 disabled:opacity-50 shrink-0 shadow-lg shadow-emerald-500/20"
          >
            {checkingIn ? <RefreshCw size={12} className="animate-spin" /> : 'Check In'}
          </button>
        </motion.div>
      )}

      {/* Beverage & Dining Package Live Tracker Section */}
      <div ref={trackerRef} className="mt-6 space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Award size={16} className="text-blue-400" />
            <h3 className="text-xs font-black uppercase tracking-widest text-white/90">
              Beverage & Dining Packages
            </h3>
          </div>
          <button
            onClick={() => setShowAddPackageModal(true)}
            className="flex items-center gap-1 text-[10px] font-black uppercase text-blue-400 hover:text-blue-300 transition-colors bg-blue-500/10 px-2.5 py-1 rounded-lg border border-blue-500/20"
          >
            <Plus size={11} /> Add Package
          </button>
        </div>

        {packages.length > 0 ? (
          <PackagePerksTracker
            packages={packages}
            ticketId={ticket.id || ticketId}
            holderName={ticket.holderName || currentUser.displayName}
            tierName={ticket.tierName}
            onRedeem={handleRedeemPackageItem}
          />
        ) : (
          /* Empty state prompt to attach package */
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-dashed border-white/10 text-center space-y-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mx-auto">
              <Wine size={18} />
            </div>
            <div>
              <p className="text-xs font-black text-white">No Packages Attached Yet</p>
              <p className="text-[10px] text-white/40 max-w-xs mx-auto mt-0.5">
                Add an Open Bar Drink Package, Zero-Proof Refill Pass, or 3-Course Food Tasting Pass to unlock all-inclusive venue perks.
              </p>
            </div>
            <button
              onClick={() => setShowAddPackageModal(true)}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-black text-xs uppercase tracking-wider rounded-xl hover:brightness-110 shadow-lg shadow-blue-500/20"
            >
              Browse Packages
            </button>
          </div>
        )}
      </div>

      {/* Physical Ticket Fulfillment details if ordered */}
      {ticket.physicalRequested && (
        <div className="mt-5 p-4 rounded-2xl bg-white/[0.03] border border-white/8 text-xs space-y-1">
          <div className="flex items-center gap-2 text-white/70 font-black">
            <Package size={14} className="text-blue-400" />
            <span>Physical Ticket Order</span>
          </div>
          <p className="text-[10px] text-white/40">
            Status: {ticket.mailedAt ? 'Shipped ✓' : ticket.printedAt ? 'Printed' : 'Processing in Queue'}
          </p>
          {ticket.trackingNumber && (
            <p className="text-[10px] font-mono text-blue-400">Tracking: {ticket.trackingNumber}</p>
          )}
        </div>
      )}

      {/* Bar Order Mode Fullscreen Modal (Ultra-high contrast for bartenders) */}
      <AnimatePresence>
        {showBarOrderMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[99999] bg-black flex flex-col p-6 text-white font-sans overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-black uppercase tracking-[0.2em] text-white/60">
                  Plajah Bar Pass Display
                </span>
              </div>
              <button
                onClick={() => setShowBarOrderMode(false)}
                className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center max-w-sm mx-auto text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center text-2xl font-black shadow-xl">
                {(ticket.holderName || currentUser.displayName || 'G')[0]}
              </div>

              <div>
                <h2 className="text-xl font-black text-white">{ticket.holderName || currentUser.displayName}</h2>
                <p className="text-xs text-white/50">{ticket.tierName || 'VIP Pass'} · ID #{ticket.id?.slice(-8).toUpperCase()}</p>
              </div>

              {/* Scannable Barcode & QR code */}
              <div className="p-4 bg-white rounded-3xl shadow-2xl inline-block">
                <div
                  dangerouslySetInnerHTML={{
                    __html: `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 25 25">
                      <rect width="25" height="25" fill="white"/>
                      <rect x="2" y="2" width="7" height="7" fill="black"/>
                      <rect x="16" y="2" width="7" height="7" fill="black"/>
                      <rect x="2" y="16" width="7" height="7" fill="black"/>
                      <rect x="3" y="3" width="5" height="5" fill="white"/>
                      <rect x="17" y="3" width="5" height="5" fill="white"/>
                      <rect x="3" y="17" width="5" height="5" fill="white"/>
                      <rect x="4" y="4" width="3" height="3" fill="black"/>
                      <rect x="18" y="4" width="3" height="3" fill="black"/>
                      <rect x="4" y="18" width="3" height="3" fill="black"/>
                      <rect x="10" y="2" width="1" height="8" fill="black"/>
                      <rect x="12" y="4" width="2" height="4" fill="black"/>
                      <rect x="10" y="12" width="6" height="2" fill="black"/>
                      <rect x="14" y="15" width="4" height="2" fill="black"/>
                      <rect x="11" y="19" width="3" height="4" fill="black"/>
                      <rect x="17" y="18" width="5" height="4" fill="black"/>
                    </svg>`,
                  }}
                  className="w-40 h-40"
                />
              </div>

              {/* Active Packages Quick Bar */}
              <div className="w-full space-y-2 text-left">
                {packages.map((pkg) => (
                  <div
                    key={pkg.id}
                    className="p-3.5 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-between"
                  >
                    <div>
                      <p className="text-xs font-black text-white">{pkg.name}</p>
                      <p className="text-[10px] text-white/60 line-clamp-1">{pkg.eligibleItemsDescription}</p>
                    </div>
                    <div className="text-right">
                      {pkg.type === 'UNLIMITED' ? (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-bold text-[10px] uppercase">
                          Unlimited
                        </span>
                      ) : (
                        <span className="text-sm font-black text-amber-300 font-mono">
                          {pkg.type === 'VALUE_ALLOWANCE' ? `$${(pkg.remainingUnits / 100).toFixed(2)}` : `${pkg.remainingUnits} Left`}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-[10px] text-white/40 uppercase tracking-widest pt-2">
                Present this screen directly to bartender or concession staff
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Package Modal */}
      <AnimatePresence>
        {showAddPackageModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
            onClick={() => setShowAddPackageModal(false)}
          >
            <motion.div
              initial={{ scale: 0.93, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.93, y: 15 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#121215] border border-white/15 rounded-3xl p-6 max-w-sm w-full shadow-2xl max-h-[85vh] overflow-y-auto space-y-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-blue-400">Add-On Experience</span>
                  <h3 className="text-lg font-black text-white">Select a Package</h3>
                </div>
                <button
                  onClick={() => setShowAddPackageModal(false)}
                  className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-2.5">
                {DEFAULT_VENUE_PACKAGES.map((preset: any) => {
                  const isAlreadyAdded = packages.some(p => p.packageAddonId === preset.id);
                  return (
                    <div
                      key={preset.id}
                      className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition-all space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-black text-white">{preset.name}</p>
                          <p className="text-[10px] text-white/50 line-clamp-2 mt-0.5">{preset.description}</p>
                        </div>
                        <span className="text-xs font-black text-white shrink-0">
                          ${(preset.priceCents / 100).toFixed(2)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[9px] font-bold text-white/40 uppercase">
                          {preset.type === 'UNLIMITED' ? 'All-Inclusive Pass' : `${preset.totalUnits} ${preset.unitName}`}
                        </span>

                        <button
                          disabled={isAlreadyAdded || addingPackage}
                          onClick={() => handleAttachDemoPackage(preset)}
                          className="px-3 py-1.5 rounded-xl bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[10px] font-black uppercase tracking-wider hover:bg-blue-500 hover:text-black transition-all disabled:opacity-40"
                        >
                          {isAlreadyAdded ? 'Added ✓' : addingPackage ? 'Attaching…' : '+ Attach'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default TicketView;
