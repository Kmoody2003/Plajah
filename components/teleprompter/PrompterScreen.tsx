/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { PrompterSettings, PrompterState, SyncMessage } from './types';
import { parseCuePoints } from './scriptParser';
import { ArrowLeft, ArrowRight, Play, Pause, RefreshCw, Maximize, Minimize, X } from 'lucide-react';

interface PrompterScreenProps {
  initialScriptTitle?: string;
  initialScriptContent?: string;
  isStandalone?: boolean;
  onExit?: () => void;
}

export default function PrompterScreen({
  initialScriptTitle = 'Untitled Script',
  initialScriptContent = '',
  isStandalone = false,
  onExit
}: PrompterScreenProps) {
  // Sync state
  const [title, setTitle] = useState(initialScriptTitle);
  const [content, setContent] = useState(initialScriptContent);
  const [settings, setSettings] = useState<PrompterSettings>({
    speed: 4,
    fontSize: 56,
    alignment: 'center',
    isMirroredH: false,
    isMirroredV: false,
    marginWidth: 20, // 20% side padding
    theme: 'dark',
    guideType: 'arrow',
    guidePosition: 40, // 40% from top
    lineHeight: 1.5,
  });

  const [isPlaying, setIsPlaying] = useState(false);
  const [scrollPercent, setScrollPercent] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Sync channel
  const channelRef = useRef<BroadcastChannel | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRequestRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const isInteractingRef = useRef<boolean>(false);
  const scrollTimeoutRef = useRef<number | null>(null);

  // Parse cue points
  const cuePoints = useMemo(() => parseCuePoints(content), [content]);

  // Connect to BroadcastChannel
  useEffect(() => {
    const channel = new BroadcastChannel('teleprompter_sync');
    channelRef.current = channel;

    // Send initial status ping
    channel.postMessage({ type: 'PING', sender: 'prompter' });

    const handleMessage = (e: MessageEvent<SyncMessage>) => {
      const msg = e.data;
      if (msg.type === 'STATE_UPDATE') {
        setTitle(msg.title);
        setContent(msg.scriptContent);
        setSettings(msg.settings);
        setIsPlaying(msg.state.isPlaying);
        
        // Only update scroll position if it came from the operator
        if (msg.state.lastUpdatedBy === 'operator' && containerRef.current) {
          const container = containerRef.current;
          const maxScroll = container.scrollHeight - container.clientHeight;
          if (maxScroll > 0) {
            container.scrollTop = (msg.state.scrollPercent / 100) * maxScroll;
            setScrollPercent(msg.state.scrollPercent);
          }
        }
      } else if (msg.type === 'SCROLL_TO_PERCENT') {
        if (containerRef.current) {
          const container = containerRef.current;
          const maxScroll = container.scrollHeight - container.clientHeight;
          container.scrollTop = (msg.percent / 100) * maxScroll;
          setScrollPercent(msg.percent);
        }
      } else if (msg.type === 'PING') {
        channel.postMessage({ type: 'PONG', sender: 'prompter' });
      }
    };

    channel.addEventListener('message', handleMessage);

    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
    };
  }, []);

  // Sync state back to operator helper
  const broadcastState = (overridePlaying?: boolean, newPercent?: number) => {
    if (!channelRef.current) return;
    
    const currentPercent = newPercent !== undefined ? newPercent : scrollPercent;
    const currentPlaying = overridePlaying !== undefined ? overridePlaying : isPlaying;

    const state: PrompterState = {
      scriptId: 'synced',
      isPlaying: currentPlaying,
      scrollPercent: currentPercent,
      lastUpdatedBy: 'prompter',
      timestamp: Date.now()
    };

    channelRef.current.postMessage({
      type: 'STATE_UPDATE',
      state,
      settings,
      scriptContent: content,
      title: title
    });
  };

  // Smooth scroll logic via RequestAnimationFrame
  useEffect(() => {
    const scrollStep = (timestamp: number) => {
      if (!isPlaying || !containerRef.current || isInteractingRef.current) {
        lastTimeRef.current = null;
        scrollRequestRef.current = requestAnimationFrame(scrollStep);
        return;
      }

      if (lastTimeRef.current === null) {
        lastTimeRef.current = timestamp;
      }

      const elapsed = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;

      // Scroll speed based on settings.speed
      // Speed 1: ~15px per second
      // Speed 10: ~150px per second
      // Speed 20: ~400px per second
      if (settings.speed > 0) {
        const container = containerRef.current;
        const speedMultiplier = settings.speed * 0.15; // px per ms
        const increment = speedMultiplier * elapsed;
        
        const oldScrollTop = container.scrollTop;
        container.scrollTop += increment;

        // Calculate scroll percent
        const maxScroll = container.scrollHeight - container.clientHeight;
        if (maxScroll > 0) {
          const percent = Math.min(100, (container.scrollTop / maxScroll) * 100);
          setScrollPercent(percent);

          // Broadcast progress back to operator at regular intervals
          if (Math.abs(percent - scrollPercent) > 0.5 || container.scrollTop === maxScroll || container.scrollTop === 0) {
            if (channelRef.current) {
              channelRef.current.postMessage({
                type: 'STATE_UPDATE',
                state: {
                  scriptId: 'synced',
                  isPlaying: true,
                  scrollPercent: percent,
                  lastUpdatedBy: 'prompter',
                  timestamp: Date.now()
                },
                settings,
                scriptContent: content,
                title
              });
            }
          }
        }

        // Auto pause at the end of script
        if (container.scrollTop >= maxScroll && oldScrollTop === container.scrollTop) {
          setIsPlaying(false);
          broadcastState(false, 100);
        }
      }

      scrollRequestRef.current = requestAnimationFrame(scrollStep);
    };

    scrollRequestRef.current = requestAnimationFrame(scrollStep);

    return () => {
      if (scrollRequestRef.current) {
        cancelAnimationFrame(scrollRequestRef.current);
      }
    };
  }, [isPlaying, settings.speed, scrollPercent, content, title, settings]);

  // Handle manual scroll in Prompter screen
  const handleScroll = () => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const maxScroll = container.scrollHeight - container.clientHeight;
    if (maxScroll > 0) {
      const percent = (container.scrollTop / maxScroll) * 100;
      setScrollPercent(percent);

      // Only broadcast manual scrolls if the user is actively scrolling
      if (isInteractingRef.current) {
        if (channelRef.current) {
          channelRef.current.postMessage({
            type: 'STATE_UPDATE',
            state: {
              scriptId: 'synced',
              isPlaying,
              scrollPercent: percent,
              lastUpdatedBy: 'prompter',
              timestamp: Date.now()
            },
            settings,
            scriptContent: content,
            title
          });
        }
      }
    }
  };

  const handleInteractionStart = () => {
    isInteractingRef.current = true;
    if (scrollTimeoutRef.current) window.clearTimeout(scrollTimeoutRef.current);
  };

  const handleInteractionEnd = () => {
    scrollTimeoutRef.current = window.setTimeout(() => {
      isInteractingRef.current = false;
    }, 150) as unknown as number;
  };

  // Keyboard Shortcuts (Space, Up/Down, Left/Right, Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) {
        return; // Ignore inside input fields
      }

      switch (e.key) {
        case ' ':
          e.preventDefault();
          setIsPlaying(prev => {
            const next = !prev;
            broadcastState(next);
            return next;
          });
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSettings(prev => {
            const nextSettings = { ...prev, speed: Math.min(20, prev.speed + 0.5) };
            if (channelRef.current) {
              channelRef.current.postMessage({
                type: 'STATE_UPDATE',
                state: { scriptId: 'synced', isPlaying, scrollPercent, lastUpdatedBy: 'prompter', timestamp: Date.now() },
                settings: nextSettings,
                scriptContent: content,
                title
              });
            }
            return nextSettings;
          });
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSettings(prev => {
            const nextSettings = { ...prev, speed: Math.max(0.5, prev.speed - 0.5) };
            if (channelRef.current) {
              channelRef.current.postMessage({
                type: 'STATE_UPDATE',
                state: { scriptId: 'synced', isPlaying, scrollPercent, lastUpdatedBy: 'prompter', timestamp: Date.now() },
                settings: nextSettings,
                scriptContent: content,
                title
              });
            }
            return nextSettings;
          });
          break;
        case 'ArrowLeft':
          e.preventDefault();
          // Jump back 5%
          if (containerRef.current) {
            const container = containerRef.current;
            const maxScroll = container.scrollHeight - container.clientHeight;
            const newPercent = Math.max(0, scrollPercent - 5);
            container.scrollTop = (newPercent / 100) * maxScroll;
            setScrollPercent(newPercent);
            broadcastState(isPlaying, newPercent);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          // Jump forward 5%
          if (containerRef.current) {
            const container = containerRef.current;
            const maxScroll = container.scrollHeight - container.clientHeight;
            const newPercent = Math.min(100, scrollPercent + 5);
            container.scrollTop = (newPercent / 100) * maxScroll;
            setScrollPercent(newPercent);
            broadcastState(isPlaying, newPercent);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setIsPlaying(false);
          if (containerRef.current) {
            containerRef.current.scrollTop = 0;
            setScrollPercent(0);
            broadcastState(false, 0);
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [scrollPercent, isPlaying, settings, content, title]);

  // Handle local fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Theme presets classes
  const themeClasses = {
    dark: {
      bg: 'bg-black text-white',
      card: 'bg-zinc-900 border-zinc-800 text-zinc-300',
      activeText: 'text-white',
      cueColor: 'text-green-400',
      arrowColor: 'text-green-500 fill-green-500',
      highlightBg: 'bg-green-500/10 border-y border-green-500/30'
    },
    light: {
      bg: 'bg-white text-black',
      card: 'bg-zinc-50 border-zinc-200 text-zinc-700',
      activeText: 'text-black',
      cueColor: 'text-blue-600',
      arrowColor: 'text-blue-500 fill-blue-500',
      highlightBg: 'bg-blue-500/10 border-y border-blue-500/30'
    },
    amber: {
      bg: 'bg-black text-[#ffb000]',
      card: 'bg-zinc-900 border-zinc-800 text-amber-500/70',
      activeText: 'text-[#ffb000]',
      cueColor: 'text-amber-400',
      arrowColor: 'text-[#ffb000] fill-[#ffb000]',
      highlightBg: 'bg-[#ffb000]/10 border-y border-[#ffb000]/30'
    },
    cobalt: {
      bg: 'bg-[#0a1128] text-[#e0e1dd]',
      card: 'bg-[#1c2541] border-zinc-800 text-zinc-300',
      activeText: 'text-white',
      cueColor: 'text-cyan-400',
      arrowColor: 'text-cyan-500 fill-cyan-500',
      highlightBg: 'bg-cyan-500/10 border-y border-cyan-500/30'
    }
  };

  const currentTheme = themeClasses[settings.theme] || themeClasses.dark;

  // Split lines and parse them for rendering
  const renderedLines = useMemo(() => {
    return content.split('\n').map((line, idx) => {
      const trimmed = line.trim();
      const isCue = trimmed.startsWith('#') || (trimmed.startsWith('[') && trimmed.endsWith(']'));
      
      let displayLine = line;
      if (isCue) {
        displayLine = trimmed.replace(/^#+\s*/, '').replace(/^\[|\]$/g, '');
      }

      return {
        id: `line-${idx}`,
        text: displayLine,
        isCue,
        original: line
      };
    });
  }, [content]);

  // Mirror transformations
  const mirrorStyle: React.CSSProperties = {
    transform: `
      ${settings.isMirroredH ? 'scaleX(-1)' : ''}
      ${settings.isMirroredV ? 'scaleY(-1)' : ''}
    `.trim() || undefined,
  };

  // Margin spacing calculations
  const sideMarginStyle = {
    paddingLeft: `${settings.marginWidth}%`,
    paddingRight: `${settings.marginWidth}%`,
  };

  // Reset helper
  const handleReset = () => {
    setIsPlaying(false);
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
      setScrollPercent(0);
      broadcastState(false, 0);
    }
  };

  return (
    <div id="prompter-display-root" className={`relative flex flex-col w-full h-screen select-none overflow-hidden transition-colors duration-200 ${currentTheme.bg}`}>
      
      {/* Visual Guide Overlays (Centered horizontally, positioned at guidePosition % of viewport height) */}
      {settings.guideType !== 'none' && (
        <div 
          className="absolute left-0 right-0 z-30 pointer-events-none transition-all duration-300 flex items-center justify-between"
          style={{ top: `${settings.guidePosition}%`, transform: 'translateY(-50%)' }}
        >
          {/* Arrow Guide */}
          {settings.guideType === 'arrow' && (
            <>
              <div className="pl-4 animate-pulse">
                <ArrowRight className={`w-12 h-12 ${currentTheme.arrowColor}`} />
              </div>
              <div className="pr-4 animate-pulse">
                <ArrowLeft className={`w-12 h-12 ${currentTheme.arrowColor}`} />
              </div>
            </>
          )}

          {/* Horizontal Line Guide */}
          {settings.guideType === 'line' && (
            <div className={`w-full border-t-2 border-dashed ${settings.theme === 'amber' ? 'border-[#ffb000]' : 'border-red-500'} opacity-60`} />
          )}

          {/* Highlight Guide (Background band) */}
          {settings.guideType === 'highlight' && (
            <div className={`absolute left-0 right-0 h-20 -z-10 ${currentTheme.highlightBg} pointer-events-none`} />
          )}
        </div>
      )}

      {/* Prompter Text Container (Performant scroll) */}
      <div
        id="prompter-scroll-viewport"
        ref={containerRef}
        onScroll={handleScroll}
        onMouseDown={handleInteractionStart}
        onTouchStart={handleInteractionStart}
        onMouseUp={handleInteractionEnd}
        onTouchEnd={handleInteractionEnd}
        className="flex-1 overflow-y-auto no-scrollbar scroll-smooth"
        style={{ ...mirrorStyle, scrollBehavior: 'auto' }}
      >
        {/* Padding so the text starts below the guide and can scroll off the top entirely */}
        <div className="h-[50vh]" />
        
        <div 
          className="w-full transition-all duration-300"
          style={{ 
            ...sideMarginStyle,
            fontSize: `${settings.fontSize}px`, 
            lineHeight: settings.lineHeight,
            textAlign: settings.alignment,
          }}
        >
          {renderedLines.map((line, idx) => {
            if (line.isCue) {
              return (
                <div 
                  key={line.id} 
                  className={`font-display font-semibold tracking-wide border-b border-dashed border-current/20 mb-8 pb-2 opacity-80 ${currentTheme.cueColor}`}
                  style={{ fontSize: `${settings.fontSize * 0.8}px` }}
                >
                  {line.text}
                </div>
              );
            }

            return (
              <p
                key={line.id}
                className="mb-8 font-sans transition-opacity duration-300"
              >
                {line.text || '\u00A0'}
              </p>
            );
          })}
        </div>

        {/* Bottom spacer so the final lines can scroll up past the eye-line guide */}
        <div className="h-[60vh]" />
      </div>

      {/* Standalone Control Overlay (Visible on hover in prompter mode or for Solo Mode) */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 bg-zinc-900/90 hover:bg-zinc-900 border border-zinc-800 text-white px-4 py-2 rounded-full shadow-2xl flex items-center gap-4 backdrop-blur-md opacity-25 hover:opacity-100 transition-opacity duration-300">
        <button
          id="btn-play-pause-local"
          onClick={() => {
            setIsPlaying(prev => {
              const next = !prev;
              broadcastState(next);
              return next;
            });
          }}
          className="p-1.5 hover:bg-zinc-800 rounded-full transition-colors text-white"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white" />}
        </button>

        <button
          id="btn-reset-local"
          onClick={handleReset}
          className="p-1.5 hover:bg-zinc-800 rounded-full transition-colors text-zinc-300 hover:text-white"
          title="Reset to Top"
        >
          <RefreshCw className="w-5 h-5" />
        </button>

        <span className="text-xs font-mono text-zinc-400 select-none px-1 border-r border-zinc-800">
          {Math.round(scrollPercent)}%
        </span>

        {/* Speed indicator */}
        <span className="text-xs font-mono text-zinc-400 select-none pr-1 border-r border-zinc-800">
          Speed: {settings.speed}
        </span>

        {/* Solo indicator or Sync indicator */}
        {onExit ? (
          <button
            id="btn-exit-solo"
            onClick={onExit}
            className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/20 transition-all cursor-pointer"
            title="Exit Prompter View"
          >
            <X className="w-3 h-3" />
            <span>Exit</span>
          </button>
        ) : (
          <span className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded ${isStandalone ? 'bg-indigo-500/20 text-indigo-400' : 'bg-green-500/20 text-green-400'}`}>
            {isStandalone ? 'Solo' : 'Synced'}
          </span>
        )}

        <button
          id="btn-fs-local"
          onClick={toggleFullscreen}
          className="p-1.5 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400 hover:text-white"
          title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
        >
          {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
