import React, { useState } from 'react';
import { Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { nativeShellAvailable, switchToNativeShell } from '../services/nativeShell';

// "Switch to Native app" — the web-side entry into the native Jetpack Compose shell
// (the parallel Android front-end; see docs/ANDROID_NATIVE_REBUILD.md). Renders
// nothing unless we're the native Android app on a non-TV device, so it's safe to
// drop anywhere. Mirrors the "Try New Nav" / "Switch back to Classic" toggle idea
// from useShellNext, but crosses the web→native boundary via the PlajahShell plugin.
//
// The reverse switch (Native → Classic) lives in the native shell's own settings,
// so this side only needs the one direction.

const NativeShellSwitch: React.FC<{ className?: string }> = ({ className }) => {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!nativeShellAvailable()) return null;

  const go = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const ok = await switchToNativeShell();
    // On success the activity is already being torn down and relaunched, so this
    // component unmounts; only a failure path needs to reset UI state.
    if (!ok) {
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <div className={className}>
      <button
        onClick={go}
        disabled={busy}
        className="w-full flex items-center gap-4 p-4 rounded-3xl text-left border border-white/10 active:scale-[0.99] transition-transform disabled:opacity-70"
        style={{ backgroundImage: 'linear-gradient(135deg, rgba(107,0,153,0.35), rgba(212,0,85,0.30))' }}
      >
        <span className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#6B0099] to-[#D40055] flex items-center justify-center shrink-0 shadow-lg">
          {busy ? <Loader2 size={20} className="text-white animate-spin" /> : <Sparkles size={20} className="text-white" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-white font-bold text-[15px]">Switch to Native app</span>
            <span className="text-[9px] font-black uppercase tracking-[0.12em] text-[#FF8C00] bg-[#FF8C00]/15 px-1.5 py-0.5 rounded-full">Beta</span>
          </span>
          <span className="block text-white/60 text-[13px] mt-0.5 truncate">
            {failed ? 'Couldn’t switch — try again' : 'A faster, fully-native Android experience'}
          </span>
        </span>
        <ArrowRight size={19} className="text-white/50 shrink-0" />
      </button>
    </div>
  );
};

export default NativeShellSwitch;
