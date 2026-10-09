import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldAlert,
  ShieldCheck,
  Shield,
  Activity,
  AlertTriangle,
  Globe,
  Radio,
  Terminal,
  Send,
  RefreshCw,
  Users,
  CheckCircle2,
  Lock,
  Cpu,
  Mail,
  MessageSquare,
  Flame,
  Zap,
  Crosshair,
  Server,
  Layers,
  ChevronRight,
  Eye,
  Check,
  ExternalLink,
  Filter
} from 'lucide-react';
import { 
  SecurityPlatformStats, 
  SecurityThreatEvent, 
  SecurityGeoPing, 
  CsoAssessment, 
  UserThreatWarning,
  UserProfile 
} from '../../types';
import {
  fetchThreatStats,
  fetchThreatEvents,
  fetchCsoAssessment,
  simulateThreatAttack,
  dispatchThreatAlert,
  warnUserThreat
} from '../../services/backendService';
import { ADMIN_PRIMARY_EMAIL } from '../../services/csoAgentService';
import { SecurityCouncilPanel } from './SecurityCouncilPanel';

// World map SVG projection constants
const MAP_WIDTH = 960;
const MAP_HEIGHT = 500;

// Convert Lat/Lng to 2D Equirectangular coordinates on SVG
function latLngToSvg(lat: number, lng: number): { x: number; y: number } {
  const x = ((lng + 180) / 360) * MAP_WIDTH;
  const y = ((90 - lat) / 180) * MAP_HEIGHT;
  return { x, y };
}

interface AdminThreatProtectionProps {
  currentUser?: UserProfile;
}

export const AdminThreatProtection: React.FC<AdminThreatProtectionProps> = ({ currentUser }) => {
  const [stats, setStats] = useState<SecurityPlatformStats | null>(null);
  const [events, setEvents] = useState<SecurityThreatEvent[]>([]);
  const [assessment, setAssessment] = useState<CsoAssessment | null>(null);
  const [selectedPing, setSelectedPing] = useState<SecurityGeoPing | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dispatchingEmail, setDispatchingEmail] = useState(false);
  const [dispatchingChat, setDispatchingChat] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState<'ALL' | 'SUSPECTED' | 'MALICIOUS_RED'>('ALL');
  
  // User warning modal state
  const [showWarnModal, setShowWarnModal] = useState(false);
  const [warnUid, setWarnUid] = useState('');
  const [warnDetails, setWarnDetails] = useState('');
  const [warningSuccess, setWarningSuccess] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [s, evts, ass] = await Promise.all([
        fetchThreatStats(),
        fetchThreatEvents(),
        fetchCsoAssessment(isRefresh)
      ]);
      if (s) setStats(s);
      if (evts) setEvents(evts);
      if (ass) setAssessment(ass);
    } catch (err) {
      console.error('Failed to load threat protection data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      loadData(false);
    }, 60000); // stats now come from Firestore-backed council queries; once a minute is plenty
    return () => clearInterval(interval);
  }, []);

  // Handle email dispatch to kmoody2003@gmail.com
  const handleDispatchEmail = async () => {
    setDispatchingEmail(true);
    try {
      if (!events[0]) { showToast('No event to dispatch.'); return; }
      const res = await dispatchThreatAlert(events[0].id, ADMIN_PRIMARY_EMAIL);
      // Report what actually happened — the old toast claimed delivery even on failure.
      showToast(res.emailSent
        ? `${res.simulated ? '[SIMULATION] ' : ''}Incident email sent to ${ADMIN_PRIMARY_EMAIL}`
        : `Email NOT sent: ${res.emailError || res.error || 'unknown error'}`);
    } catch (e: any) {
      showToast(`Email NOT sent: ${e?.message || 'request failed'}`);
    } finally {
      setDispatchingEmail(false);
    }
  };

  // Handle security assessment dispatch to Admin Chat
  const handleDispatchChat = async () => {
    setDispatchingChat(true);
    try {
      if (!events[0]) { showToast('No event to post.'); return; }
      const res = await dispatchThreatAlert(events[0].id);
      showToast(res.chatDelivered ? 'Posted to Admin Chat.' : 'Admin Chat NOT updated (no server-side chat delivery is configured).');
    } catch (e: any) {
      showToast(`Admin Chat NOT updated: ${e?.message || 'request failed'}`);
    } finally {
      setDispatchingChat(false);
    }
  };

  // Simulate an attack (either suspected bot or confirmed malicious red alert)
  const handleSimulate = async (isMalicious: boolean) => {
    setSimulating(true);
    try {
      const newEvent = await simulateThreatAttack(isMalicious);
      if (newEvent) {
        setEvents(prev => [newEvent, ...prev]);
        await loadData(false);
        showToast(isMalicious
          ? 'SIMULATION: fake malicious event added (labelled; nothing was blocked).'
          : 'SIMULATION: fake bot event added (labelled).');
      } else {
        showToast('Simulation failed.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSimulating(false);
    }
  };

  // Warn targeted user account
  const handleSendUserWarning = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!warnUid.trim()) return;
    try {
      const res = await warnUserThreat(warnUid.trim(), 'CREDENTIAL_STUFFING', warnDetails.trim());
      if (res) {
        setWarningSuccess(`Security Warning successfully sent to user ${warnUid}`);
        setTimeout(() => {
          setShowWarnModal(false);
          setWarnUid('');
          setWarnDetails('');
          setWarningSuccess(null);
        }, 2000);
      } else {
        showToast('Warning NOT sent (request failed).');
      }
    } catch {
      showToast('Warning NOT sent (request failed).');
    }
  };

  // Filtered threat events
  const filteredEvents = useMemo(() => {
    if (filterSeverity === 'ALL') return events;
    return events.filter(e => e.severity === filterSeverity);
  }, [events, filterSeverity]);

  // Is platform currently in Red Alert?
  const isRedAlert = stats?.threatLevel === 'CRITICAL_RED';

  if (loading && !stats) {
    return (
      <div className="min-h-[500px] flex flex-col items-center justify-center p-12">
        <div className="w-14 h-14 border-4 border-red-500/20 border-t-red-500 rounded-full animate-spin mb-4" />
        <p className="text-xs font-black uppercase tracking-widest text-white/50">
          Syncing with Chief Security Officer (CSO) Sentinel...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-24 text-white">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-8 right-8 z-50 bg-black/90 border border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.3)] backdrop-blur-xl px-6 py-4 rounded-2xl flex items-center gap-3"
          >
            <ShieldAlert size={20} className="text-red-400 shrink-0" />
            <span className="text-xs font-bold text-white tracking-wide">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header & Posture Bar */}
      <div className={`p-8 rounded-[2.5rem] border backdrop-blur-2xl transition-all relative overflow-hidden ${
        isRedAlert
          ? 'bg-red-950/30 border-red-600/40 shadow-[0_0_60px_rgba(220,38,38,0.2)]'
          : 'bg-white/5 border-white/10'
      }`}>
        {isRedAlert && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-600 via-orange-500 to-red-600 animate-pulse" />
        )}

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg transition-transform ${
              isRedAlert 
                ? 'bg-red-600 text-white animate-bounce shadow-red-600/50' 
                : 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
            }`}>
              <ShieldAlert size={32} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-black uppercase tracking-tight text-white">
                  Advance Threat Protection
                </h1>
                <span className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase border ${
                  isRedAlert 
                    ? 'bg-red-600/20 text-red-400 border-red-500/50 animate-pulse' 
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                }`}>
                  {isRedAlert ? 'CRITICAL RED ALERT' : 'STATUS: NORMAL DEFCON 5'}
                </span>
              </div>
              <p className="text-white/40 text-xs font-semibold mt-1">
                Autonomous Chief Security Officer (CSO) Sentinel · Monitoring Platform & User Accounts
              </p>
            </div>
          </div>

          {/* Action Hub */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => loadData(true)}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold uppercase tracking-wider text-white/70 hover:text-white transition-all disabled:opacity-50"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              Refresh Telemetry
            </button>

            <button
              onClick={handleDispatchEmail}
              disabled={dispatchingEmail}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-xs font-bold uppercase tracking-wider text-red-300 hover:text-white transition-all shadow-[0_0_15px_rgba(220,38,38,0.2)]"
            >
              <Mail size={14} className="text-red-400" />
              {dispatchingEmail ? 'Dispatching...' : `Alert ${ADMIN_PRIMARY_EMAIL}`}
            </button>

            <button
              onClick={handleDispatchChat}
              disabled={dispatchingChat}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-xs font-bold uppercase tracking-wider text-blue-300 hover:text-white transition-all shadow-[0_0_15px_rgba(59,130,246,0.2)]"
            >
              <MessageSquare size={14} className="text-blue-400" />
              {dispatchingChat ? 'Posting...' : 'Brief Admin Chat'}
            </button>

            <button
              onClick={() => setShowWarnModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-xs font-bold uppercase tracking-wider text-amber-300 hover:text-white transition-all"
            >
              <Users size={14} className="text-amber-400" />
              Warn User Account
            </button>
          </div>
        </div>

        {/* High-Level Posture Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-8 pt-8 border-t border-white/5">
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
            <span className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">
              Platform Health
            </span>
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-black ${stats && stats.healthScore > 85 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {stats ? stats.healthScore : '—'}
              </span>
              <span className="text-xs font-bold text-white/40">/ 100</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
            <span className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">
              Active Threats (Red)
            </span>
            <span className={`text-2xl font-black ${isRedAlert ? 'text-red-500 animate-pulse' : 'text-white'}`}>
              {stats?.activeThreatCount ?? 0}
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
            <span className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">
              {stats?.dataSource === 'COUNCIL' ? 'Active Mitigations' : 'Mitigated (24h)'}
            </span>
            <span className="text-2xl font-black text-emerald-400" title={stats?.metricNotes?.blockedAttacks24h}>
              {stats ? stats.blockedAttacks24h : '—'}
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
            <span className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">
              Bot Ingress Ratio
            </span>
            <span className="text-2xl font-black text-purple-400">
              {!stats || stats.unavailableMetrics?.includes('botTrafficPercent') ? 'n/a' : `${stats.botTrafficPercent}%`}
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
            <span className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">
              CSO Engine Mode
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-xs font-black uppercase tracking-wider text-emerald-300">
                {stats?.csoMode || 'UNAVAILABLE'}
              </span>
            </div>
            <span className="text-[9px] text-white/30 font-medium block mt-0.5">
              Data: {stats?.dataSource === 'COUNCIL' ? 'Security Council (live)' : stats?.dataSource === 'SIMULATION' ? 'SIMULATION only' : 'none'}
            </span>
          </div>
        </div>
      </div>

      {!stats && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
          Threat stats could not be loaded from the server. Nothing below is a live reading.
        </div>
      )}
      {stats?.dataSource === 'SIMULATION' && (
        <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-xs text-purple-200 font-bold">
          SIMULATION — the numbers in the header come only from the test buttons below, not from real traffic.
        </div>
      )}

      {/* Real monitoring: Security & IT Council (findings, daily brief, reversible mitigations) */}
      <SecurityCouncilPanel />

      {/* Interactive Global Threat Map */}
      <div className="p-8 rounded-[2.5rem] bg-white/5 border border-white/10 backdrop-blur-2xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <Globe size={20} className="text-blue-400" />
              <h2 className="text-lg font-black uppercase tracking-tight text-white">
                Global Threat Geolocation Map
              </h2>
            </div>
            <p className="text-xs text-white/40 font-medium mt-0.5">
              SIMULATION ONLY: plots events created by the test buttons. Real security events store salted IP hashes and have no geolocation, so they never appear on this map.
            </p>
          </div>

          {/* Map Legend */}
          <div className="flex items-center gap-4 text-xs font-bold">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-purple-500/80 border border-purple-400 animate-pulse" />
              <span className="text-white/60">Suspected Recon / Crawler</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-600 border border-red-400 animate-ping" />
              <span className="text-red-400 font-extrabold">🚨 Active Malicious Red Alert</span>
            </div>
          </div>
        </div>

        {/* Tactical Dark World Map SVG */}
        <div className="w-full aspect-[16/8] bg-black/60 rounded-2xl border border-white/5 relative overflow-hidden flex items-center justify-center">
          {/* Subtle Grid Lines */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.06)_0,transparent_100%)] pointer-events-none" />
          <svg
            viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
            className="w-full h-full object-contain select-none"
          >
            {/* World Continents Rough Silhouette (Stylized Tactical Path) */}
            <g fill="rgba(255, 255, 255, 0.04)" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="0.8">
              {/* North America */}
              <path d="M 120 80 Q 200 60 280 100 Q 320 160 260 220 Q 200 240 180 200 Q 140 160 120 80 Z" />
              {/* South America */}
              <path d="M 260 260 Q 340 280 320 380 Q 280 460 260 440 Q 240 360 260 260 Z" />
              {/* Europe */}
              <path d="M 460 80 Q 560 60 560 140 Q 500 180 460 140 Z" />
              {/* Africa */}
              <path d="M 470 190 Q 580 180 570 300 Q 530 380 480 340 Q 450 260 470 190 Z" />
              {/* Asia */}
              <path d="M 580 80 Q 820 60 840 180 Q 760 260 680 220 Q 600 160 580 80 Z" />
              {/* Australia */}
              <path d="M 760 320 Q 860 310 850 400 Q 770 410 760 320 Z" />
            </g>

            {/* Latitude / Longitude Subtle Ticks */}
            {[100, 200, 300, 400].map(y => (
              <line key={`lat-${y}`} x1="0" y1={y} x2={MAP_WIDTH} y2={y} stroke="rgba(255,255,255,0.02)" strokeDasharray="3 6" />
            ))}
            {[192, 384, 576, 768].map(x => (
              <line key={`lng-${x}`} x1={x} y1="0" x2={x} y2={MAP_HEIGHT} stroke="rgba(255,255,255,0.02)" strokeDasharray="3 6" />
            ))}

            {/* Geolocation Pings */}
            {(stats?.recentPings || []).map(ping => {
              const { x, y } = latLngToSvg(ping.lat, ping.lng);
              const isMalicious = ping.severity === 'MALICIOUS_RED';

              return (
                <g 
                  key={ping.id} 
                  className="cursor-pointer transition-transform hover:scale-125"
                  onClick={() => setSelectedPing(ping)}
                >
                  {isMalicious ? (
                    // Glowing Malicious Red Alert Marker
                    <>
                      <circle cx={x} cy={y} r="18" fill="none" stroke="#ef4444" strokeWidth="1.5" opacity="0.6">
                        <animate attributeName="r" values="6;22;6" dur="2s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.8;0.1;0.8" dur="2s" repeatCount="indefinite" />
                      </circle>
                      <circle cx={x} cy={y} r="7" fill="#ef4444" className="shadow-[0_0_20px_#ef4444]" />
                      <circle cx={x} cy={y} r="2.5" fill="#ffffff" />
                    </>
                  ) : (
                    // Suspected Activity Marker (Purple / Amber)
                    <>
                      <circle cx={x} cy={y} r="12" fill="none" stroke="#a855f7" strokeWidth="1" opacity="0.4">
                        <animate attributeName="r" values="4;14;4" dur="3s" repeatCount="indefinite" />
                      </circle>
                      <circle cx={x} cy={y} r="5" fill="#a855f7" />
                      <circle cx={x} cy={y} r="1.5" fill="#ffffff" />
                    </>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Interactive Selected Ping Tooltip */}
          {selectedPing && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute bottom-6 left-6 z-20 max-w-sm bg-black/90 border border-white/20 p-5 rounded-2xl shadow-2xl backdrop-blur-xl"
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                  selectedPing.severity === 'MALICIOUS_RED' ? 'bg-red-600 text-white' : 'bg-purple-600 text-white'
                }`}>
                  {selectedPing.severity === 'MALICIOUS_RED' ? 'Confirmed Malicious' : 'Suspected Activity'}
                </span>
                <button
                  onClick={() => setSelectedPing(null)}
                  className="text-white/40 hover:text-white text-xs font-bold"
                >
                  ✕
                </button>
              </div>

              <h4 className="text-sm font-black text-white">{selectedPing.vector}</h4>
              <p className="text-xs text-white/70 mt-1">{selectedPing.summary}</p>

              <div className="mt-3 pt-3 border-t border-white/10 text-[11px] grid grid-cols-2 gap-2 text-white/50">
                <div>IP: <span className="font-mono text-white/90">{selectedPing.ip}</span></div>
                <div>Location: <span className="text-white/90">{selectedPing.city}, {selectedPing.country}</span></div>
                <div>Target: <span className="font-mono text-blue-400">{selectedPing.targetEndpoint}</span></div>
                <div>Time: <span className="text-white/90">{new Date(selectedPing.timestamp).toLocaleTimeString()}</span></div>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* CSO Agent Executive Briefing & Simulation Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* CSO Assessment & Reasoning Terminal */}
        <div className="lg:col-span-2 p-8 rounded-[2.5rem] bg-white/5 border border-white/10 backdrop-blur-2xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Terminal size={20} className="text-emerald-400" />
                <h3 className="text-base font-black uppercase tracking-tight text-white">
                  Chief Security Officer (CSO) Assessment
                </h3>
              </div>
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                Engine: {assessment?.engineUsed || '—'}
              </span>
            </div>

            {/* Assessment Box */}
            <div className="p-6 rounded-2xl bg-black/40 border border-white/5 text-sm text-white/80 leading-relaxed font-mono">
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold mb-3">
                <Cpu size={14} />
                <span>{assessment?.csoAgentName || 'ASSESSMENT'} · {assessment?.timestamp ? new Date(assessment.timestamp).toLocaleString() : 'none yet'}</span>
              </div>
              <p className="whitespace-pre-line text-white/90">
                {assessment?.executiveSummary || 'No assessment available.'}
              </p>
            </div>

            {/* Indicators of Compromise & Recommendations */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                <span className="text-[10px] font-black uppercase tracking-wider text-red-400 block mb-2">
                  Key Indicators of Compromise (IOC)
                </span>
                <ul className="space-y-1.5 text-xs text-white/60">
                  {!assessment?.indicatorsOfCompromise?.length && <li className="text-white/30">None reported.</li>}
                  {(assessment?.indicatorsOfCompromise || []).map((ioc, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-red-500 font-bold">•</span>
                      <span>{ioc}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 block mb-2">
                  Active Containments & Recommendations
                </span>
                <ul className="space-y-1.5 text-xs text-white/60">
                  {!assessment?.recommendedActions?.length && <li className="text-white/30">None reported.</li>}
                  {(assessment?.recommendedActions || []).map((rec, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-white/5 flex items-center justify-between text-xs text-white/40">
            <span>Primary Incident Dispatch Target: <strong className="text-white font-mono">{ADMIN_PRIMARY_EMAIL}</strong></span>
            <span>Email requires RESEND_API_KEY on the server; failures are reported, not hidden.</span>
          </div>
        </div>

        {/* Live Attack Simulator & Safeguard Controls */}
        <div className="p-8 rounded-[2.5rem] bg-white/5 border border-white/10 backdrop-blur-2xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Zap size={20} className="text-amber-400" />
              <h3 className="text-base font-black uppercase tracking-tight text-white">
                Attack Simulator (test only)
              </h3>
            </div>
            <p className="text-xs text-white/40 font-medium mb-6">
              Creates clearly labelled SIMULATION events in this server process (documentation-range IPs) to test the UI and alert email. Nothing is blocked and no user is warned.
            </p>

            <div className="space-y-4">
              <button
                onClick={() => handleSimulate(false)}
                disabled={simulating}
                className="w-full text-left p-4 rounded-2xl bg-purple-600/10 hover:bg-purple-600/20 border border-purple-500/30 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-purple-300">
                    Simulate Bot Crawler
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 font-bold">
                    SUSPECTED (AMBER)
                  </span>
                </div>
                <p className="text-[11px] text-white/50 mt-1">
                  High-frequency scraper hitting public endpoints. Stays in monitored surveillance state without red alerts.
                </p>
              </button>

              <button
                onClick={() => handleSimulate(true)}
                disabled={simulating}
                className="w-full text-left p-4 rounded-2xl bg-red-600/10 hover:bg-red-600/20 border border-red-500/40 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-red-300">
                    Simulate Exploit Attack
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-400 font-bold animate-pulse">
                    CRITICAL (RED ALERT)
                  </span>
                </div>
                <p className="text-[11px] text-white/50 mt-1">
                  Fake exploit event marked SIMULATION. Sends a "[SIMULATION]" alert email if RESEND_API_KEY is configured.
                </p>
              </button>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-white/5">
            <div className="flex items-center gap-2 text-xs font-bold text-white/60 mb-2">
              <Lock size={14} className="text-emerald-400" />
              <span>What is actually enforced</span>
            </div>
            <p className="text-[11px] text-white/40 leading-relaxed">
              Express rate limits in server.ts (global per-IP limit on /api plus tighter auth/AI limits) and SSRF-safe outbound fetch. There is no WAF in front of Cloud Run; Council auto-mitigation only tightens limits when SECURITY_COUNCIL_AUTO_MITIGATE=true.
            </p>
          </div>
        </div>
      </div>

      {/* Real-Time Threat Events Feed */}
      <div className="p-8 rounded-[2.5rem] bg-white/5 border border-white/10 backdrop-blur-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-base font-black uppercase tracking-tight text-white flex items-center gap-2">
              <Activity size={18} className="text-blue-400" />
              Live Security Activity Feed
            </h3>
            <p className="text-xs text-white/40 font-medium">
              Real security_events (last 24h) plus any labelled simulations.
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-2">
            {(['ALL', 'SUSPECTED', 'MALICIOUS_RED'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilterSeverity(f)}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  filterSeverity === f
                    ? 'bg-white text-black'
                    : 'bg-white/5 text-white/40 hover:text-white'
                }`}
              >
                {f === 'ALL' ? 'All Activity' : f === 'SUSPECTED' ? 'Suspected Only' : '🚨 Red Alerts Only'}
              </button>
            ))}
          </div>
        </div>

        {/* Events Table / List */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 text-white/40 text-[10px] uppercase font-black tracking-wider">
                <th className="pb-3">Timestamp</th>
                <th className="pb-3">Severity</th>
                <th className="pb-3">Vector</th>
                <th className="pb-3">Origin IP / Geo</th>
                <th className="pb-3">Target Endpoint</th>
                <th className="pb-3">Risk Score</th>
                <th className="pb-3">Mitigation Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredEvents.slice(0, 12).map(evt => {
                const isMalicious = evt.severity === 'MALICIOUS_RED';
                return (
                  <tr key={evt.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 font-mono text-white/50">
                      {new Date(evt.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                        isMalicious 
                          ? 'bg-red-600/30 text-red-400 border border-red-500/40' 
                          : 'bg-purple-600/20 text-purple-300 border border-purple-500/30'
                      }`}>
                        {isMalicious ? '🚨 Red Alert' : 'Suspected'}
                      </span>
                    </td>
                    <td className="py-3 font-bold text-white">
                      {evt.simulated && <span className="mr-2 px-1.5 py-0.5 rounded bg-purple-500/30 text-purple-200 text-[9px] font-black">SIMULATION</span>}
                      {evt.vector}
                    </td>
                    <td className="py-3">
                      <div className="font-mono text-white/80">{evt.ip}</div>
                      <div className="text-[10px] text-white/40">{evt.geo.city}, {evt.geo.country}</div>
                    </td>
                    <td className="py-3 font-mono text-blue-400">
                      {evt.targetEndpoint}
                    </td>
                    <td className="py-3">
                      <span className={`font-black ${evt.riskScore > 80 ? 'text-red-400' : 'text-amber-400'}`}>
                        {evt.riskScore}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className="text-emerald-400 font-bold text-[10px] uppercase tracking-wider">
                        {evt.mitigationAction || 'LOGGED_MONITOR'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Warn Targeted User Account Modal */}
      <AnimatePresence>
        {showWarnModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg bg-[#0f1117] border border-white/10 rounded-[2.5rem] p-8 shadow-2xl relative"
            >
              <button
                onClick={() => setShowWarnModal(false)}
                className="absolute top-6 right-6 text-white/40 hover:text-white text-sm font-bold"
              >
                ✕
              </button>

              <div className="flex items-center gap-3 mb-2">
                <ShieldAlert size={24} className="text-amber-400" />
                <h3 className="text-lg font-black uppercase tracking-tight text-white">
                  Issue User Account Threat Warning
                </h3>
              </div>
              <p className="text-xs text-white/40 font-medium mb-6">
                Directly alerts a user that suspicious activity or unauthorized login attempts have targeted their account.
              </p>

              {warningSuccess ? (
                <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold text-center">
                  {warningSuccess}
                </div>
              ) : (
                <form onSubmit={handleSendUserWarning} className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/60 block mb-1.5">
                      Target User UID or Email
                    </label>
                    <input
                      type="text"
                      required
                      value={warnUid}
                      onChange={e => setWarnUid(e.target.value)}
                      placeholder="e.g. firebaseUid or user@example.com"
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-amber-400 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/60 block mb-1.5">
                      Security Alert Details (Optional)
                    </label>
                    <textarea
                      rows={3}
                      value={warnDetails}
                      onChange={e => setWarnDetails(e.target.value)}
                      placeholder="e.g. Suspicious login attempted from Frankfurt, Germany with abnormal token credentials."
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-medium focus:outline-none focus:border-amber-400 transition-colors"
                    />
                  </div>

                  <div className="pt-2 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setShowWarnModal(false)}
                      className="px-5 py-2.5 rounded-xl bg-white/5 text-white/60 hover:text-white text-xs font-bold uppercase tracking-wider"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(245,158,11,0.3)]"
                    >
                      Dispatch Warning
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminThreatProtection;
