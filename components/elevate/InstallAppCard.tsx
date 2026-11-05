import React, { useEffect, useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { installRoute, onInstallChange, promptInstall, type InstallRoute } from '../../services/pwaInstall';

/**
 * Member Home card: install Plajah as a web app on this device. Hidden once installed (or when
 * running inside the app already); "Not now" hides it on this device for 30 days.
 */
const SNOOZE_KEY = 'plajah.installCard.snoozedUntil';
const readSnoozed = () => { try { return Number(localStorage.getItem(SNOOZE_KEY) || 0) > Date.now(); } catch { return false; } };

const InstallAppCard: React.FC<{ orgName?: string }> = ({ orgName }) => {
  const [route, setRoute] = useState<InstallRoute>(() => installRoute());
  const [snoozed, setSnoozed] = useState(readSnoozed);
  const [showSteps, setShowSteps] = useState(false);
  useEffect(() => onInstallChange(() => setRoute(installRoute())), []);

  if (route === 'installed' || snoozed) return null;

  const snooze = () => {
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + 30 * 86400_000)); } catch { /* */ }
    setSnoozed(true);
  };
  const install = async () => {
    if (route === 'prompt') { await promptInstall(); setRoute(installRoute()); return; }
    setShowSteps(s => !s);
  };

  return (
    <section className="relative rounded-3xl border border-[#7A1FC0]/40 bg-gradient-to-br from-[#1a0b2b]/90 to-black/50 p-4 sm:p-5" aria-label="Install Plajah on this device">
      <button onClick={snooze} className="absolute top-3 right-3 w-8 h-8 rounded-full grid place-items-center text-white/55 hover:text-white hover:bg-white/10" aria-label="Not now"><X size={15} /></button>
      <div className="flex items-start gap-3.5 pr-8">
        <span className="shrink-0 w-11 h-11 rounded-2xl grid place-items-center bg-gradient-to-br from-[#6B0099] via-[#D40055] to-[#FF8C00] text-white"><Smartphone size={20} /></span>
        <div className="min-w-0">
          <h3 className="text-[15px] sm:text-base font-black text-white leading-tight">Put {orgName || 'your community'} on your home screen</h3>
          <p className="text-[12px] sm:text-[13px] text-white/70 leading-snug mt-1">
            Install Plajah as an app on this device. It opens full screen with one tap, like any app on your phone or computer.
          </p>
        </div>
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
        <button onClick={install} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white text-black text-[12px] font-black hover:brightness-95 active:scale-95 transition">
          {route === 'ios' || route === 'mac-safari' ? <Share size={14} /> : <Download size={14} />}
          {route === 'prompt' ? 'Install the app' : 'Show me how'}
        </button>
        <button onClick={snooze} className="px-3 py-2.5 rounded-full text-[12px] font-bold text-white/70 hover:text-white">Not now</button>
      </div>

      {showSteps && route !== 'prompt' && (
        <ol className="mt-3 space-y-1.5 text-[12px] text-white/80 list-decimal pl-5 leading-snug">
          {route === 'ios' ? (
            <>
              <li>Open this page in <strong className="text-white">Safari</strong>.</li>
              <li>Tap the <strong className="text-white">Share</strong> button (the square with an arrow).</li>
              <li>Choose <strong className="text-white">Add to Home Screen</strong>, then <strong className="text-white">Add</strong>.</li>
            </>
          ) : route === 'mac-safari' ? (
            <>
              <li>In Safari’s menu bar, choose <strong className="text-white">File</strong>.</li>
              <li>Choose <strong className="text-white">Add to Dock</strong>, then <strong className="text-white">Add</strong>.</li>
            </>
          ) : (
            <>
              <li>Open your browser’s menu (<strong className="text-white">⋮</strong> or <strong className="text-white">…</strong>).</li>
              <li>Choose <strong className="text-white">Install app</strong> or <strong className="text-white">Add to Home screen</strong>.</li>
              <li>Works best in Chrome or Edge.</li>
            </>
          )}
        </ol>
      )}

      <p className="mt-3.5 pt-3 border-t border-white/10 text-[11px] text-white/60 leading-snug">
        <span className="font-black text-[#C4B5FD]">Coming soon:</span> native Plajah apps are in development. Until then, the web app gives you the same Member Home.
      </p>
    </section>
  );
};

export default InstallAppCard;
