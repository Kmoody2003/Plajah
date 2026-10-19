// OrgSecurityShield — Zero-friction, highest-standard Financial & PII Security Shield for Plajah Elevate.
//
// Protects organization financials (Finance Hub, Spending Desk, Accounting, Billing) and private congregation PII
// without ever getting in the way of authorized team members' ease of use:
//   • Instant PrintScreen / OS Snipping / Ctrl+P interception + clipboard scrubbing
//   • Smart focus-loss blur (auto-blurs when an external snipping tool steals focus; auto-restores on mouse/window focus)
//   • 1-Click "Screen-Share / Shoulder-Surf Mask" toggle for meetings & coffee shops
//   • Ultra-subtle forensic watermark (zero readability impact)
//   • OrgSecurityPanel: 1-click Security & Privacy Center for organization leadership in ElevateOps

import React, { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Eye, EyeOff, Lock, AlertTriangle, Check, RefreshCw, KeyRound, FileLock2, UserCheck } from 'lucide-react';
import type { Organization, OrgMembership, OrgSecuritySettings } from '../../types';
import { auth } from '../../services/firebase';
import {
  getEffectiveSecuritySettings,
  saveOrgSecuritySettings,
  logOrgSecurityEvent,
  fetchOrgSecurityEvents,
  type OrgSecurityEvent,
} from '../../services/orgSecurityService';

export interface OrgSecurityShieldProps {
  org: Organization;
  surface: string;
  mode?: 'financial' | 'pii';
  children: React.ReactNode;
}

export const OrgSecurityShield: React.FC<OrgSecurityShieldProps> = ({
  org,
  surface,
  mode = 'financial',
  children,
}) => {
  const settings = useMemo(() => getEffectiveSecuritySettings(org), [org]);
  const [masked, setMasked] = useState<boolean>(settings.defaultMaskMode);
  const [windowBlurred, setWindowBlurred] = useState(false);
  const [captureAlert, setCaptureAlert] = useState<string | null>(null);

  const viewer = auth.currentUser;
  const watermarkText = useMemo(() => {
    const who = viewer?.displayName || viewer?.email?.split('@')[0] || 'Authorized Staff';
    const uidShort = (viewer?.uid || 'anon').slice(0, 6).toUpperCase();
    const day = new Date().toISOString().slice(0, 10);
    return `${org.name.toUpperCase()} · CONFIDENTIAL ${mode === 'financial' ? 'FINANCIAL VAULT' : 'MEMBER DATA'} · ${who} (${uidShort}) · ${day}`;
  }, [org.name, mode, viewer?.displayName, viewer?.email, viewer?.uid]);

  useEffect(() => {
    if (!settings.blockFinancialScreenshots) return;

    const triggerShield = (reason: string, eventType: OrgSecurityEvent['eventType']) => {
      setCaptureAlert(reason);
      try {
        navigator.clipboard?.writeText(
          `[Protected ${org.name} ${mode === 'financial' ? 'Financial Data' : 'Member Record'} — Screen Capture Blocked by Plajah Sanctuary Security]`,
        ).catch(() => {});
      } catch { /* ignore */ }
      logOrgSecurityEvent(org.id, eventType, surface, reason);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // PrintScreen key
      if (e.key === 'PrintScreen' || e.keyCode === 44) {
        e.preventDefault();
        triggerShield('Screenshot shortcut (PrintScreen) was blocked to protect confidential organization financials.', 'SCREENSHOT_ATTEMPT_BLOCKED');
        return;
      }
      // macOS Cmd+Shift+3 / 4 / 5 or Windows Win+Shift+S / Ctrl+Shift+S
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && ['3', '4', '5', 's', 'S'].includes(e.key)) {
        e.preventDefault();
        triggerShield('Screen snipping shortcut was blocked to protect confidential organization data.', 'SCREENSHOT_ATTEMPT_BLOCKED');
        return;
      }
      // Direct browser page print (Ctrl+P / Cmd+P)
      if ((e.metaKey || e.ctrlKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        triggerShield('Direct browser printing is disabled on protected financial views. Use the official audited Report/Statement export instead.', 'PRINT_EXFILTRATION_BLOCKED');
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen' || e.keyCode === 44) {
        triggerShield('Screenshot key detected — financial display was shielded and clipboard scrubbed.', 'SCREENSHOT_ATTEMPT_BLOCKED');
      }
    };

    const onWindowBlur = () => {
      if (mode === 'financial') setWindowBlurred(true);
    };
    const onWindowFocus = () => {
      setWindowBlurred(false);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && mode === 'financial') {
        setWindowBlurred(true);
      } else if (document.visibilityState === 'visible') {
        setWindowBlurred(false);
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('focus', onWindowFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('focus', onWindowFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [settings.blockFinancialScreenshots, org.id, org.name, mode, surface]);

  // Auto-clear capture alert after 4 seconds so legitimate finance team members are never slowed down
  useEffect(() => {
    if (!captureAlert) return;
    const t = setTimeout(() => setCaptureAlert(null), 4000);
    return () => clearTimeout(t);
  }, [captureAlert]);

  return (
    <div
      className="relative"
      onMouseEnter={() => { if (windowBlurred) setWindowBlurred(false); }}
      onContextMenu={e => {
        if (settings.blockFinancialScreenshots && mode === 'financial') {
          e.preventDefault();
        }
      }}
    >
      {/* Print-to-PDF exfiltration block */}
      <style>{`
        @media print {
          .plajah-protected-vault-content { display: none !important; }
          .plajah-protected-print-warning { display: block !important; padding: 48px; text-align: center; font-family: sans-serif; }
        }
        .plajah-mask-numbers input[type="number"],
        .plajah-mask-numbers .font-mono,
        .plajah-mask-numbers [data-financial-figure="true"] {
          filter: blur(7px);
          transition: filter 0.18s ease;
        }
        .plajah-mask-numbers input[type="number"]:hover,
        .plajah-mask-numbers input[type="number"]:focus,
        .plajah-mask-numbers .font-mono:hover,
        .plajah-mask-numbers [data-financial-figure="true"]:hover {
          filter: blur(0px);
        }
      `}</style>

      <div className="hidden plajah-protected-print-warning">
        <h2>🔒 Confidential Organization Financial Vault — Direct Page Printing Blocked</h2>
        <p>To protect {org.name} financial data, direct browser screen-printing is disabled.</p>
      </div>

      {/* Sleek, zero-friction Security Bar */}
      <div className="mb-3 px-3.5 py-2 rounded-2xl bg-emerald-500/[0.07] border border-emerald-400/20 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldCheck size={14} className="text-emerald-300 shrink-0" />
          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-200 truncate">
            {mode === 'financial'
              ? 'Sanctuary Financial Vault · Anti-Screenshot & Audit Shield Active'
              : 'Sanctuary Privacy Vault · Personal Contact & Address Data Never Public'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMasked(m => !m)}
            className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border flex items-center gap-1.5 transition-all ${
              masked
                ? 'bg-amber-400/20 border-amber-300/40 text-amber-200'
                : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
            }`}
            title="Blur sensitive numbers & contact details while screen-sharing or working in public (hover any item to peek)"
          >
            {masked ? <EyeOff size={11} /> : <Eye size={11} />}
            {masked ? 'Screen-Share Mask On (Hover to Peek)' : 'Screen-Share Mask'}
          </button>
        </div>
      </div>

      {/* Screenshot / Snipping Alert Banner */}
      {captureAlert && (
        <div className="mb-3 p-3.5 rounded-2xl bg-red-500/15 border border-red-400/40 flex items-center justify-between gap-3 animate-pulse">
          <div className="flex items-center gap-2.5">
            <AlertTriangle size={16} className="text-red-300 shrink-0" />
            <p className="text-xs font-bold text-red-100">{captureAlert}</p>
          </div>
          <button
            type="button"
            onClick={() => setCaptureAlert(null)}
            className="px-3 py-1 rounded-full bg-white/10 text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/20 shrink-0"
          >
            Resume Work
          </button>
        </div>
      )}

      {/* Protected Content Container */}
      <div
        className={`plajah-protected-vault-content relative transition-all duration-150 ${
          masked ? 'plajah-mask-numbers' : ''
        } ${
          captureAlert
            ? 'blur-2xl pointer-events-none select-none opacity-30'
            : windowBlurred && settings.blockFinancialScreenshots
              ? 'blur-xl select-none opacity-60'
              : ''
        }`}
      >
        {/* Ultra-subtle forensic watermark (never blocks clicks or readability) */}
        {settings.financialWatermark && (
          <div
            aria-hidden="true"
            className="pointer-events-none select-none absolute inset-0 overflow-hidden z-20 flex flex-col justify-around opacity-[0.028]"
          >
            {[0, 1, 2, 3].map(row => (
              <div
                key={row}
                className="whitespace-nowrap text-[11px] font-black tracking-[0.35em] text-white -rotate-12"
              >
                {watermarkText} &nbsp; • &nbsp; {watermarkText}
              </div>
            ))}
          </div>
        )}

        {children}
      </div>
    </div>
  );
};

// ── Security & Privacy Center Panel (Mounted in ElevateOps) ──────────────────

export const OrgSecurityPanel: React.FC<{
  org: Organization;
  myMembership: OrgMembership | null;
  onOrgChange?: (o: Organization) => void;
}> = ({ org, onOrgChange }) => {
  const current = useMemo(() => getEffectiveSecuritySettings(org), [org]);
  const [draft, setDraft] = useState<Required<OrgSecuritySettings>>(current);
  const [events, setEvents] = useState<OrgSecurityEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const loadEvents = async () => {
    setLoadingEvents(true);
    setEvents(await fetchOrgSecurityEvents(org.id));
    setLoadingEvents(false);
  };

  useEffect(() => {
    setDraft(getEffectiveSecuritySettings(org));
  }, [org]);

  useEffect(() => {
    loadEvents();
  }, [org.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async (key: keyof OrgSecuritySettings) => {
    if (key === 'strictPublicPiiFirewall') return; // always enforced
    const nextVal = !draft[key];
    const nextDraft = { ...draft, [key]: nextVal };
    setDraft(nextDraft);
    setSaving(true);
    setSavedMsg('');
    try {
      const saved = await saveOrgSecuritySettings(org.id, nextDraft);
      onOrgChange?.({ ...org, securitySettings: saved });
      setSavedMsg('Security posture updated.');
      setTimeout(() => setSavedMsg(''), 2500);
    } catch { /* ignore */ }
    setSaving(false);
  };

  const card = 'bg-white/[0.03] border border-white/10 rounded-[2rem] p-5 sm:p-6';

  return (
    <div className="space-y-5">
      <div className={`${card} border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.07] via-transparent to-[#8B5CF6]/[0.07]`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-300 flex items-center gap-1.5">
              <ShieldCheck size={14} /> Sanctuary Data &amp; Financial Vault Security
            </p>
            <h3 className="text-xl font-black text-white mt-1">Organization Privacy &amp; Anti-Leak Controls</h3>
            <p className="text-xs text-white/55 mt-1 max-w-2xl leading-relaxed">
              Built to protect {org.name}&apos;s financial team, giving records, and congregation personal data at the highest standard—while keeping daily operations effortless for authorized leaders.
            </p>
          </div>
          {savedMsg && (
            <span className="px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
              <Check size={12} /> {savedMsg}
            </span>
          )}
        </div>

        <div className="grid sm:grid-cols-3 gap-3 mt-5">
          <div className="p-4 rounded-2xl bg-black/35 border border-white/10">
            <div className="flex items-center gap-2 text-emerald-300 text-xs font-black uppercase tracking-wider">
              <Lock size={14} /> Strict PII Firewall
            </div>
            <p className="text-[11px] text-white/55 mt-1.5 leading-relaxed">
              Member phone numbers, home addresses, and emails are <span className="text-white font-bold">never exposed</span> on public profiles, feeds, or rosters.
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-black/35 border border-white/10">
            <div className="flex items-center gap-2 text-[#C4B5FD] text-xs font-black uppercase tracking-wider">
              <FileLock2 size={14} /> Financial Team Shield
            </div>
            <p className="text-[11px] text-white/55 mt-1.5 leading-relaxed">
              PrintScreen, snipping focus-steal, and unauthorized PDF printing are blocked across Finance Hub, Giving, and Books.
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-black/35 border border-white/10">
            <div className="flex items-center gap-2 text-amber-300 text-xs font-black uppercase tracking-wider">
              <KeyRound size={14} /> Auto ID Assignment
            </div>
            <p className="text-[11px] text-white/55 mt-1.5 leading-relaxed">
              Members claim without needing to know their IDs—Member ID &amp; Employment # auto-populate on backend approval.
            </p>
          </div>
        </div>
      </div>

      {/* 1-Click Security Toggles */}
      <div className={`${card} space-y-4`}>
        <h4 className="text-[10px] font-black uppercase tracking-widest text-small-orange">Active Protection Policies</h4>

        {[
          {
            key: 'strictPublicPiiFirewall' as const,
            title: 'Strict Public Personal Data Firewall (Always On)',
            desc: 'Blocks member emails, phone numbers, home addresses, birthdates, and family notes from ever appearing on public pages or world-readable documents.',
            locked: true,
          },
          {
            key: 'blockFinancialScreenshots' as const,
            title: 'Anti-Screenshot & Snipping Shield on Financial Views',
            desc: 'Intercepts PrintScreen, OS snipping shortcuts, window focus-steal, and raw browser printing inside Finance Hub, Spending Desk, and Accounting.',
            locked: false,
          },
          {
            key: 'financialWatermark' as const,
            title: 'Forensic Session Watermark on Financial Ledgers',
            desc: 'Applies an ultra-subtle viewer watermark (name, UID hash, date) over financial tables to deter external camera leaks without affecting readability.',
            locked: false,
          },
          {
            key: 'autoAssignIdsOnApproval' as const,
            title: 'Auto-Populate Member ID & Employment Number on Approval',
            desc: 'Allows congregants and staff to claim or onboard without knowing their ID numbers upfront; automatically generates and links both IDs when approved.',
            locked: false,
          },
          {
            key: 'directoryOptInOnly' as const,
            title: 'Private-by-Default Member Onboarding (Opt-In Directory Only)',
            desc: 'New member onboarding populates your private church ChMS database while keeping directory visibility off unless the member explicitly opts in.',
            locked: false,
          },
          {
            key: 'defaultMaskMode' as const,
            title: 'Start Financial Hub in Screen-Share Mask Mode by Default',
            desc: 'When enabled, dollar amounts open blurred for shoulder-surf safety until hovered or unmasked with 1 click.',
            locked: false,
          },
        ].map(item => {
          const on = !!draft[item.key];
          return (
            <div key={item.key} className="flex items-start justify-between gap-4 p-3.5 rounded-2xl bg-white/[0.02] border border-white/10">
              <div className="min-w-0">
                <p className="text-sm font-bold text-white flex items-center gap-2">
                  {item.title}
                  {item.locked && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 text-[9px] font-black uppercase tracking-widest">
                      Mandatory
                    </span>
                  )}
                </p>
                <p className="text-xs text-white/50 mt-0.5 leading-relaxed">{item.desc}</p>
              </div>
              <button
                type="button"
                disabled={item.locked || saving}
                onClick={() => toggle(item.key)}
                className={`px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border shrink-0 transition-all ${
                  on
                    ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
                    : 'bg-white/5 border-white/10 text-white/45 hover:text-white'
                } ${item.locked ? 'opacity-80 cursor-default' : ''}`}
              >
                {on ? 'Active' : 'Off'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Live Security Event Log */}
      <div className={`${card} space-y-3`}>
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-[10px] font-black uppercase tracking-widest text-small-orange">Security &amp; Anti-Exfiltration Log</h4>
            <p className="text-xs text-white/45 mt-0.5">Immutable record of blocked screenshot attempts, print blocks, and security posture updates.</p>
          </div>
          <button
            type="button"
            onClick={loadEvents}
            className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white flex items-center gap-1.5"
          >
            <RefreshCw size={11} className={loadingEvents ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {loadingEvents ? (
          <p className="text-xs text-white/40 py-4 text-center">Loading security telemetry…</p>
        ) : events.length === 0 ? (
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 text-center">
            <UserCheck size={18} className="text-emerald-300 mx-auto mb-1" />
            <p className="text-xs font-bold text-white/75">Zero security incidents or screenshot attempts recorded.</p>
            <p className="text-[11px] text-white/40 mt-0.5">All financial and member vaults are operating normally.</p>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {events.map(ev => (
              <div key={ev.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-black/30 border border-white/10 text-xs">
                <div className="min-w-0">
                  <p className="font-bold text-white truncate">
                    {ev.eventType.replace(/_/g, ' ')} · <span className="text-small-orange">{ev.surface}</span>
                  </p>
                  <p className="text-[11px] text-white/50 truncate">
                    Actor: {ev.actorName} ({ev.actorUid.slice(0, 6)}) {ev.details ? `— ${ev.details}` : ''}
                  </p>
                </div>
                <span className="text-[10px] text-white/40 shrink-0 font-mono">
                  {new Date(ev.timestamp).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default OrgSecurityShield;
