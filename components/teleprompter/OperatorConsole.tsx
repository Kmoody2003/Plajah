/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { PrompterSettings, PrompterState, SyncMessage, CuePoint } from './types';
import { parseCuePoints, estimateDuration } from './scriptParser';
import { 
  Play, Pause, RotateCcw, Volume2, Type, MoveLeft, Eye, 
  Monitor, Copy, ExternalLink, AlertCircle, ArrowUp, ArrowDown,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, HelpCircle,
  Clock, Flame, CheckCircle, RefreshCw, Layers
} from 'lucide-react';

interface OperatorConsoleProps {
  scriptId: string;
  scriptTitle: string;
  scriptContent: string;
  onBackToDashboard: () => void;
}

export default function OperatorConsole({
  scriptId,
  scriptTitle,
  scriptContent,
  onBackToDashboard
}: OperatorConsoleProps) {
  // Config state
  const [settings, setSettings] = useState<PrompterSettings>({
    speed: 4,
    fontSize: 56,
    alignment: 'center',
    isMirroredH: false,
    isMirroredV: false,
    marginWidth: 20,
    theme: 'dark',
    guideType: 'arrow',
    guidePosition: 40,
    lineHeight: 1.5,
  });

  const [isPlaying, setIsPlaying] = useState(false);
  const [scrollPercent, setScrollPercent] = useState(0);

  // Sync state with Prompter
  const [isPrompterConnected, setIsPrompterConnected] = useState(false);
  const [lastPingTime, setLastPingTime] = useState<number>(0);
  const [copiedLink, setCopiedLink] = useState(false);

  // Timers
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerIntervalRef = useRef<number | null>(null);

  // Refs
  const channelRef = useRef<BroadcastChannel | null>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // Keep state in a ref for stable real-time access from the message listener
  const stateRef = useRef({
    settings,
    isPlaying,
    scrollPercent,
    scriptId,
    scriptTitle,
    scriptContent
  });

  useEffect(() => {
    stateRef.current = {
      settings,
      isPlaying,
      scrollPercent,
      scriptId,
      scriptTitle,
      scriptContent
    };
  }, [settings, isPlaying, scrollPercent, scriptId, scriptTitle, scriptContent]);

  // Parse cue points
  const cuePoints = useMemo(() => parseCuePoints(scriptContent), [scriptContent]);
  const lines = useMemo(() => scriptContent.split('\n'), [scriptContent]);

  // Est duration
  const totalDuration = useMemo(() => {
    // Reading time at average 145 WPM
    return estimateDuration(scriptContent, 145);
  }, [scriptContent]);

  const timeRemaining = useMemo(() => {
    return Math.max(0, totalDuration * (1 - scrollPercent / 100));
  }, [totalDuration, scrollPercent]);

  // Format seconds into MM:SS
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Sync state change helper
  const broadcastState = (overridePlaying?: boolean, newPercent?: number) => {
    if (!channelRef.current) return;
    
    const currentPercent = newPercent !== undefined ? newPercent : stateRef.current.scrollPercent;
    const currentPlaying = overridePlaying !== undefined ? overridePlaying : stateRef.current.isPlaying;

    const state: PrompterState = {
      scriptId: stateRef.current.scriptId,
      isPlaying: currentPlaying,
      scrollPercent: currentPercent,
      lastUpdatedBy: 'operator',
      timestamp: Date.now()
    };

    channelRef.current.postMessage({
      type: 'STATE_UPDATE',
      state,
      settings: stateRef.current.settings,
      scriptContent: stateRef.current.scriptContent,
      title: stateRef.current.scriptTitle
    });
  };

  // Setup BroadcastChannel and PING protocol
  useEffect(() => {
    const channel = new BroadcastChannel('teleprompter_sync');
    channelRef.current = channel;

    // Send initial ping to check if a prompter is already open
    channel.postMessage({ type: 'PING', sender: 'operator' });

    // Periodically ping to maintain status
    const pingInterval = setInterval(() => {
      channel.postMessage({ type: 'PING', sender: 'operator' });
    }, 2000);

    const handleMessage = (e: MessageEvent<SyncMessage>) => {
      const msg = e.data;
      if (msg.type === 'PING') {
        channel.postMessage({ type: 'PONG', sender: 'operator' });
        setIsPrompterConnected(true);
        setLastPingTime(Date.now());
        // Immediately sync the state to the prompter!
        broadcastState();
      } else if (msg.type === 'PONG') {
        setIsPrompterConnected(true);
        setLastPingTime(Date.now());
      } else if (msg.type === 'STATE_UPDATE') {
        setIsPrompterConnected(true);
        setLastPingTime(Date.now());
        
        // If the prompter is scrolling, update the scroll percent
        if (msg.state.lastUpdatedBy === 'prompter') {
          setIsPlaying(msg.state.isPlaying);
          setScrollPercent(msg.state.scrollPercent);
        }
      }
    };

    channel.addEventListener('message', handleMessage);

    return () => {
      clearInterval(pingInterval);
      channel.removeEventListener('message', handleMessage);
      channel.close();
    };
  }, []);

  // Sync-check daemon (disconnects prompter if no ping within 4.5s)
  useEffect(() => {
    const checkInterval = setInterval(() => {
      if (Date.now() - lastPingTime > 4500) {
        setIsPrompterConnected(false);
      }
    }, 2000);

    return () => clearInterval(checkInterval);
  }, [lastPingTime]);

  // Broadcast when settings or play state changes
  useEffect(() => {
    broadcastState();
  }, [settings]);

  // Elapsed timer handler
  useEffect(() => {
    if (isPlaying) {
      timerIntervalRef.current = window.setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000) as unknown as number;
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isPlaying]);

  // Generate Prompter URL for copying
  const prompterUrl = useMemo(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('role', 'prompter');
    return url.toString();
  }, []);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(prompterUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleLaunchPrompter = () => {
    window.open(prompterUrl, '_blank', 'noopener,noreferrer');
  };

  // Manual scrubbing/scrolling via Progress Bar
  const handlePercentChange = (val: number) => {
    setScrollPercent(val);
    broadcastState(isPlaying, val);
  };

  const handlePlayToggle = () => {
    const next = !isPlaying;
    setIsPlaying(next);
    broadcastState(next);
  };

  const handleReset = () => {
    setIsPlaying(false);
    setScrollPercent(0);
    setElapsedTime(0);
    broadcastState(false, 0);
  };

  // Jumping to a Cue Point
  const handleCueJump = (cue: CuePoint) => {
    const totalLines = lines.length;
    if (totalLines === 0) return;

    // Estimate progress based on line index relative to total lines
    // Add minor padding to cue so it lands slightly lower than screen top (under guide)
    const paddingMultiplier = 0.95;
    const rawPercent = (cue.lineIndex / totalLines) * 100 * paddingMultiplier;
    const percent = Math.max(0, Math.min(100, Math.round(rawPercent)));
    
    setScrollPercent(percent);
    broadcastState(isPlaying, percent);
  };

  // Fast adjustments
  const adjustSpeed = (amount: number) => {
    setSettings(prev => ({
      ...prev,
      speed: Math.max(0.5, Math.min(20, Math.round((prev.speed + amount) * 10) / 10))
    }));
  };

  const adjustFontSize = (amount: number) => {
    setSettings(prev => ({
      ...prev,
      fontSize: Math.max(20, Math.min(130, prev.fontSize + amount))
    }));
  };

  // Mini scrolling preview calculations
  const previewScrollTop = useMemo(() => {
    if (!previewContainerRef.current) return 0;
    const container = previewContainerRef.current;
    const maxScroll = container.scrollHeight - container.clientHeight;
    return (scrollPercent / 100) * maxScroll;
  }, [scrollPercent, lines.length]);

  // Synchronize mini preview scroll position
  useEffect(() => {
    if (previewContainerRef.current) {
      previewContainerRef.current.scrollTop = previewScrollTop;
    }
  }, [previewScrollTop]);

  return (
    <div className="flex flex-col h-screen bg-[#050505] text-[#E0E0E0] font-sans overflow-hidden">
      
      {/* Header Bar */}
      <header className="flex items-center justify-between px-6 py-4 bg-[#0A0A0A] border-b border-white/10">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToDashboard}
            className="p-2 hover:bg-white/5 rounded-lg text-white/60 hover:text-white transition-colors border border-white/5 hover:border-white/10"
            title="Back to Dashboard"
          >
            <MoveLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-sm font-bold uppercase tracking-[0.15em] text-white font-display">{scriptTitle}</h1>
            <p className="text-[9px] text-white/40 font-mono tracking-widest uppercase">Operator Control Console</p>
          </div>
        </div>

        {/* Sync / Dual Screen status */}
        <div className="flex items-center gap-3 bg-black px-4 py-2 rounded-xl border border-white/10">
          <div className="flex items-center gap-2">
            <span className={`relative flex h-2 w-2`}>
              {isPrompterConnected ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </>
              ) : (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </>
              )}
            </span>
            <span className="text-[10px] font-mono tracking-wider uppercase">
              {isPrompterConnected ? (
                <span className="text-emerald-400 font-bold">Prompter Online</span>
              ) : (
                <span className="text-red-400 font-bold">Standalone / Offline</span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-1.5 pl-3 border-l border-white/10">
            <button
              onClick={handleLaunchPrompter}
              className="px-3 py-1.5 text-[9px] font-mono font-bold uppercase tracking-wider bg-white/5 hover:bg-white/10 text-white rounded border border-white/10 transition-all flex items-center gap-1"
              title="Open Prompter Display in a new window"
            >
              <ExternalLink className="w-3 h-3 text-white/60" />
              <span>Launch Display</span>
            </button>
            <button
              onClick={handleCopyLink}
              className={`px-3 py-1.5 text-[9px] font-mono font-bold uppercase tracking-wider rounded border transition-all ${
                copiedLink 
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                  : 'bg-white text-black border-white hover:bg-white/90'
              }`}
            >
              <Copy className="w-3 h-3" />
              <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Grid Workspace */}
      <div className="flex-1 grid grid-cols-12 gap-4 p-4 overflow-hidden bg-[#050505]">
        
        {/* Left Side: Cues & Timers (Col Span 3) */}
        <div className="col-span-3 flex flex-col gap-4 overflow-hidden">
          
          {/* Timers Panel */}
          <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-4 flex flex-col gap-3">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/40 font-mono flex items-center gap-1.5 border-b border-white/10 pb-2">
              <Clock className="w-3.5 h-3.5 text-white/60" />
              Session Monitors
            </h3>

            <div className="grid grid-cols-2 gap-3 mt-1">
              <div className="bg-black/60 p-3 rounded-lg border border-white/5">
                <p className="text-[8px] text-white/40 uppercase tracking-wider font-mono">Elapsed</p>
                <p className="text-md font-bold font-mono text-white mt-1">{formatTime(elapsedTime)}</p>
              </div>
              <div className="bg-black/60 p-3 rounded-lg border border-white/5">
                <p className="text-[8px] text-white/40 uppercase tracking-wider font-mono">Est. Remaining</p>
                <p className="text-md font-bold font-mono text-emerald-400 mt-1">{formatTime(timeRemaining)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-black/40 px-3 py-2 rounded-lg border border-white/5 flex items-center justify-between">
                <span className="text-[8px] text-white/40 font-mono uppercase">Est. Speed</span>
                <span className="text-[10px] font-mono font-bold text-white/70">145 WPM</span>
              </div>
              <div className="bg-black/40 px-3 py-2 rounded-lg border border-white/5 flex items-center justify-between">
                <span className="text-[8px] text-white/40 font-mono uppercase">Total Est</span>
                <span className="text-[10px] font-mono font-bold text-white/70">{formatTime(totalDuration)}</span>
              </div>
            </div>
          </div>

          {/* Cue Points Section */}
          <div className="flex-1 bg-[#0A0A0A] border border-white/10 rounded-xl p-4 flex flex-col overflow-hidden">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/40 font-mono flex items-center gap-1.5 border-b border-white/10 pb-2">
              <Layers className="w-3.5 h-3.5 text-white/60" />
              Bookmarks ({cuePoints.length})
            </h3>

            {cuePoints.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                <AlertCircle className="w-8 h-8 text-white/10 mb-2" />
                <p className="text-xs text-white/40 font-mono uppercase">No bookmarks</p>
                <p className="text-[9px] text-white/30 mt-1.5 max-w-[180px] leading-normal font-sans">
                  Begin editing lines with "#" or label like "[Intro]" in script workspace to register dynamic cue lists.
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto divide-y divide-white/5 pr-1 mt-2 no-scrollbar">
                {cuePoints.map((cue) => (
                  <button
                    key={cue.id}
                    onClick={() => handleCueJump(cue)}
                    className="w-full text-left py-2.5 px-3 my-1 rounded-lg text-xs hover:bg-white/5 text-white/60 hover:text-white flex items-center justify-between transition-colors group font-mono border border-transparent hover:border-white/5"
                  >
                    <span className="truncate pr-2 font-medium">{cue.label}</span>
                    <span className="text-[9px] text-white/30 group-hover:text-white transition-colors">
                      Line {cue.lineIndex + 1}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Dual Screen Sync Guide */}
          <div className="bg-[#0A0A0A]/60 border border-white/5 rounded-xl p-3.5 flex flex-col gap-2">
            <h4 className="text-[9px] font-bold uppercase tracking-widest text-white/40 font-mono flex items-center gap-1.5">
              <Monitor className="w-3 h-3 text-white/50" />
              How to Sync Display
            </h4>
            <ol className="text-[10px] text-white/50 space-y-1.5 font-sans leading-relaxed list-decimal list-inside pl-0.5">
              <li>
                Click <span className="text-white font-medium">Launch Display</span> in the top header.
              </li>
              <li>
                Drag that new tab/window to your second monitor.
              </li>
              <li>
                Press <span className="text-white font-semibold">F11</span> for fullscreen.
              </li>
            </ol>
            <p className="text-[8px] text-white/30 font-mono mt-0.5 border-t border-white/5 pt-1.5 leading-normal">
              * Note: Both windows must be in the same browser to sync over local channel.
            </p>
          </div>
        </div>

        {/* Center: Live Scroll Monitor (Col Span 6) */}
        <div className="col-span-6 flex flex-col bg-[#0A0A0A] border border-white/10 rounded-xl overflow-hidden shadow-2xl relative">
          
          {/* Active Settings HUD */}
          <div className="px-4 py-2 bg-black border-b border-white/10 flex items-center justify-between text-[9px] font-mono text-white/40 uppercase tracking-wider">
            <span>Scroll Monitor</span>
            <div className="flex gap-4">
              <span>Font: {settings.fontSize}px</span>
              <span>Align: {settings.alignment}</span>
              <span>Speed: {settings.speed}</span>
            </div>
          </div>

          {/* Mini Interactive Sync Screen (Scrolling text preview) */}
          <div className="flex-1 overflow-hidden relative bg-black flex flex-col">
            
            {/* Visual Guide line corresponding to settings */}
            {settings.guideType !== 'none' && (
              <div 
                className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                style={{ top: `${settings.guidePosition}%` }}
              >
                <div className="w-full border-t border-dashed border-red-500/40 flex justify-between px-2">
                  <span className="text-[8px] text-red-500/70 font-mono -mt-2.5 uppercase tracking-wider bg-black px-1 border border-red-500/10 rounded">Eye-line Guide ({settings.guidePosition}%)</span>
                </div>
              </div>
            )}

            {/* Scroll view mirror */}
            <div
              ref={previewContainerRef}
              className="flex-1 overflow-y-auto no-scrollbar scroll-smooth p-6 text-white/50 select-none text-center"
              style={{ scrollBehavior: 'auto' }}
            >
              <div className="h-[25vh]" />
              
              <div className="space-y-4" style={{ textAlign: settings.alignment }}>
                {lines.map((line, idx) => {
                  const isCue = line.trim().startsWith('#') || (line.trim().startsWith('[') && line.trim().endsWith(']'));
                  if (isCue) {
                    return (
                      <div key={idx} className="text-xs font-bold border-b border-dashed border-white/10 pb-1 pt-3 text-white font-mono tracking-wider">
                        {line.trim().replace(/^#+\s*/, '').replace(/^\[|\]$/g, '')}
                      </div>
                    );
                  }
                  return (
                    <p key={idx} className="text-xs tracking-wide break-words">
                      {line.trim() || '\u00A0'}
                    </p>
                  );
                })}
              </div>

              <div className="h-[30vh]" />
            </div>

            {/* Quick status bar at bottom of monitor */}
            <div className="p-3 bg-black border-t border-white/10 flex items-center justify-between text-[9px] font-mono text-white/30 uppercase tracking-widest">
              <span>Progress: {Math.round(scrollPercent)}%</span>
              <span className="text-white/60 animate-pulse">Dual-Screen Realtime Feed Active</span>
            </div>
          </div>

          {/* Timeline & Deck Controls (Always sticky) */}
          <div className="p-4 bg-black border-t border-white/10 flex flex-col gap-3">
            
            {/* Scroll Scrubbing Slider */}
            <div className="flex items-center gap-3">
              <span className="text-[8px] text-white/40 font-mono w-6 text-right font-bold">0%</span>
              <input
                id="inp-scroll-scrubber"
                type="range"
                min="0"
                max="100"
                value={scrollPercent}
                onChange={(e) => handlePercentChange(Number(e.target.value))}
                className="flex-1 h-1 bg-white/15 rounded-lg appearance-none cursor-pointer accent-white hover:accent-white/80 transition-all"
              />
              <span className="text-[8px] text-white/40 font-mono w-8 text-left font-bold">{Math.round(scrollPercent)}%</span>
            </div>

            {/* Main Action Deck Buttons */}
            <div className="flex items-center justify-between mt-1">
              <div className="flex items-center gap-2">
                <button
                  id="btn-operator-reset"
                  onClick={handleReset}
                  className="p-2.5 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-lg border border-white/10 transition-all"
                  title="Reset to Top"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>

              {/* Big Play Pause */}
              <button
                id="btn-operator-play-pause"
                onClick={handlePlayToggle}
                className={`px-8 py-3 rounded-lg flex items-center gap-2.5 font-bold text-[11px] uppercase tracking-wider transition-all ${
                  isPlaying 
                    ? 'bg-amber-600 hover:bg-amber-500 text-white' 
                    : 'bg-white text-black hover:bg-white/90'
                }`}
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-4 h-4 fill-current" />
                    <span>PAUSE SCROLL</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>START SCROLL</span>
                  </>
                )}
              </button>

              <div className="text-[9px] font-mono text-white/40 uppercase tracking-wider">
                Press <span className="text-white font-bold bg-white/10 px-1.5 py-0.5 rounded border border-white/5">Space</span> to toggle
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Pro Settings Sidebar (Col Span 3) */}
        <div className="col-span-3 flex flex-col gap-4 overflow-y-auto max-h-full pr-1 no-scrollbar bg-[#050505]">
          
          {/* Scrolling Speeds Card */}
          <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex justify-between items-center border-b border-white/10 pb-2">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/40 font-mono flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-white/60" />
                Scroll Speed
              </h3>
              <span className="text-[10px] font-mono font-bold text-white bg-white/10 px-2 py-0.5 rounded border border-white/5">
                {settings.speed}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => adjustSpeed(-0.5)}
                className="w-9 h-9 bg-white/5 hover:bg-white/10 rounded-lg flex items-center justify-center font-mono text-xs border border-white/5 hover:border-white/10 font-bold"
                title="Decrease speed"
              >
                -
              </button>
              <input
                id="inp-speed-slider"
                type="range"
                min="0.5"
                max="20"
                step="0.5"
                value={settings.speed}
                onChange={(e) => setSettings(prev => ({ ...prev, speed: Number(e.target.value) }))}
                className="flex-1 h-1 bg-white/15 rounded-lg appearance-none cursor-pointer accent-white"
              />
              <button
                onClick={() => adjustSpeed(0.5)}
                className="w-9 h-9 bg-white/5 hover:bg-white/10 rounded-lg flex items-center justify-center font-mono text-xs border border-white/5 hover:border-white/10 font-bold"
                title="Increase speed"
              >
                +
              </button>
            </div>
          </div>

          {/* Typography Card */}
          <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-4 flex flex-col gap-3">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/40 font-mono flex items-center gap-1.5 border-b border-white/10 pb-2">
              <Type className="w-3.5 h-3.5 text-white/60" />
              Text Layout
            </h3>

            {/* Font Size */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-[9px] font-mono uppercase tracking-wider text-white/40">
                <span>Font Size</span>
                <span className="text-white font-bold">{settings.fontSize}px</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => adjustFontSize(-4)}
                  className="w-8 h-8 bg-white/5 hover:bg-white/10 rounded-lg flex items-center justify-center font-bold text-[10px] border border-white/5"
                >
                  A-
                </button>
                <input
                  id="inp-font-slider"
                  type="range"
                  min="24"
                  max="120"
                  value={settings.fontSize}
                  onChange={(e) => setSettings(prev => ({ ...prev, fontSize: Number(e.target.value) }))}
                  className="flex-1 h-1 bg-white/15 rounded-lg appearance-none cursor-pointer accent-white"
                />
                <button
                  onClick={() => adjustFontSize(4)}
                  className="w-8 h-8 bg-white/5 hover:bg-white/10 rounded-lg flex items-center justify-center font-bold text-[10px] border border-white/5"
                >
                  A+
                </button>
              </div>
            </div>

            {/* Line Height */}
            <div className="flex flex-col gap-1 mt-1">
              <span className="text-[9px] font-mono uppercase tracking-wider text-white/40">Line Spacing</span>
              <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                {[1.2, 1.5, 2.0].map((spacing) => (
                  <button
                    key={spacing}
                    onClick={() => setSettings(prev => ({ ...prev, lineHeight: spacing }))}
                    className={`py-1.5 text-[10px] font-mono rounded-lg border transition-all ${
                      settings.lineHeight === spacing 
                        ? 'bg-white text-black border-white font-bold' 
                        : 'bg-black border-white/5 text-white/40 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {spacing}x
                  </button>
                ))}
              </div>
            </div>

            {/* Alignments */}
            <div className="flex flex-col gap-1">
              <span className="text-[9px] font-mono uppercase tracking-wider text-white/40">Text Alignment</span>
              <div className="grid grid-cols-4 gap-1.5 mt-1.5">
                {(['left', 'center', 'right', 'justify'] as const).map((align) => {
                  const Icon = align === 'left' ? AlignLeft : align === 'center' ? AlignCenter : align === 'right' ? AlignRight : AlignJustify;
                  return (
                    <button
                      key={align}
                      onClick={() => setSettings(prev => ({ ...prev, alignment: align }))}
                      className={`py-1.5 rounded-lg border flex items-center justify-center transition-all ${
                        settings.alignment === align 
                          ? 'bg-white text-black border-white' 
                          : 'bg-black border-white/5 text-white/40 hover:bg-white/5 hover:text-white'
                      }`}
                      title={`${align.toUpperCase()} Alignment`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Text Width Margins */}
            <div className="flex flex-col gap-1.5 mt-1">
              <div className="flex justify-between text-[9px] font-mono uppercase tracking-wider text-white/40">
                <span>Side Margins</span>
                <span className="text-white font-bold">{settings.marginWidth}%</span>
              </div>
              <input
                id="inp-margin-slider"
                type="range"
                min="0"
                max="40"
                step="5"
                value={settings.marginWidth}
                onChange={(e) => setSettings(prev => ({ ...prev, marginWidth: Number(e.target.value) }))}
                className="h-1 bg-white/15 rounded-lg appearance-none cursor-pointer accent-white"
              />
            </div>
          </div>

          {/* Mirrors & Hardware Rig Toggles */}
          <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-4 flex flex-col gap-3">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/40 font-mono flex items-center gap-1.5 border-b border-white/10 pb-2">
              <Monitor className="w-3.5 h-3.5 text-white/60" />
              Hardware Mirror Rig
            </h3>

            <div className="flex flex-col gap-2">
              <label className="flex items-center justify-between p-2.5 bg-black rounded-lg border border-white/5 cursor-pointer hover:bg-white/[0.02] transition-colors">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold tracking-wide text-white/80">Flip Horizontal</span>
                  <span className="text-[8px] text-white/30 font-mono mt-0.5">Glass Reflect Mode</span>
                </div>
                <input
                  id="chk-mirror-h"
                  type="checkbox"
                  checked={settings.isMirroredH}
                  onChange={(e) => setSettings(prev => ({ ...prev, isMirroredH: e.target.checked }))}
                  className="w-3.5 h-3.5 text-white bg-black border-white/10 rounded focus:ring-0 accent-white"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 bg-black rounded-lg border border-white/5 cursor-pointer hover:bg-white/[0.02] transition-colors">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold tracking-wide text-white/80">Flip Vertical</span>
                  <span className="text-[8px] text-white/30 font-mono mt-0.5">Upside-down scroll</span>
                </div>
                <input
                  id="chk-mirror-v"
                  type="checkbox"
                  checked={settings.isMirroredV}
                  onChange={(e) => setSettings(prev => ({ ...prev, isMirroredV: e.target.checked }))}
                  className="w-3.5 h-3.5 text-white bg-black border-white/10 rounded focus:ring-0 accent-white"
                />
              </label>
            </div>
          </div>

          {/* Reading Guides */}
          <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-4 flex flex-col gap-3">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/40 font-mono flex items-center gap-1.5 border-b border-white/10 pb-2">
              <Eye className="w-3.5 h-3.5 text-white/60" />
              Reading Eye-line Guide
            </h3>

            {/* Guide Type */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[9px] font-mono uppercase tracking-wider text-white/40">Guide overlay</span>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { value: 'arrow', label: 'Side Arrows' },
                  { value: 'line', label: 'Center Line' },
                  { value: 'highlight', label: 'Highlight Band' },
                  { value: 'none', label: 'None' }
                ].map((item) => (
                  <button
                    key={item.value}
                    onClick={() => setSettings(prev => ({ ...prev, guideType: item.value as any }))}
                    className={`py-1.5 text-[10px] font-medium rounded-lg border transition-all ${
                      settings.guideType === item.value 
                        ? 'bg-white text-black border-white font-bold' 
                        : 'bg-black border-white/5 text-white/40 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Guide vertical position */}
            {settings.guideType !== 'none' && (
              <div className="flex flex-col gap-1.5 mt-1">
                <div className="flex justify-between text-[9px] font-mono uppercase tracking-wider text-white/40">
                  <span>Guide Position</span>
                  <span className="text-white font-bold">{settings.guidePosition}%</span>
                </div>
                <input
                  id="inp-guide-position-slider"
                  type="range"
                  min="15"
                  max="85"
                  value={settings.guidePosition}
                  onChange={(e) => setSettings(prev => ({ ...prev, guidePosition: Number(e.target.value) }))}
                  className="h-1 bg-white/15 rounded-lg appearance-none cursor-pointer accent-white"
                />
              </div>
            )}
          </div>

          {/* Theme card */}
          <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-4 flex flex-col gap-3 mb-4">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/40 font-mono flex items-center gap-1.5 border-b border-white/10 pb-2">
              <RefreshCw className="w-3.5 h-3.5 text-white/60" />
              Prompter Colors
            </h3>

            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'dark', name: 'White on Black', color: 'bg-[#050505] text-white border-white/10' },
                { id: 'light', name: 'Black on White', color: 'bg-white text-black border-white/20' },
                { id: 'amber', name: 'CRT Amber', color: 'bg-black text-amber-500 border-amber-500/10' },
                { id: 'cobalt', name: 'Ocean Cobalt', color: 'bg-[#0a1128] text-cyan-400 border-cyan-500/10' }
              ].map((themeItem) => (
                <button
                  key={themeItem.id}
                  onClick={() => setSettings(prev => ({ ...prev, theme: themeItem.id as any }))}
                  className={`p-2 rounded-lg text-left border flex flex-col gap-1 transition-all ${
                    settings.theme === themeItem.id 
                      ? 'border-white bg-white/[0.04]' 
                      : 'bg-black border-white/5 hover:bg-white/[0.02]'
                  }`}
                >
                  <span className="text-[8px] font-mono text-white/40 font-semibold uppercase">{themeItem.name}</span>
                  <div className={`w-full h-4 rounded border text-[8px] font-mono p-0.5 overflow-hidden ${themeItem.color}`}>
                    Abc
                  </div>
                </button>
              ))}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
