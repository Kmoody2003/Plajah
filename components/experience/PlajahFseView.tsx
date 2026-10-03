import React, { useState, useEffect, useCallback } from 'react';
import { Play, Sparkles, Disc3, Monitor, FolderSearch, ArrowLeft } from 'lucide-react';
import { UserProfile } from '../../types';

interface LocalPcGame {
  id: string;
  title: string;
  platform: 'Xbox Game Pass' | 'Epic Games' | 'Steam' | 'Google Play Games' | 'PC Direct';
  coverUrl: string;
  splashUrl?: string;
  installPath: string;
  executable?: string;
  protocol: string;
  storeId?: string;
  lastPlayed?: string;
  installedDrive?: string;
}

const DEFAULT_PC_GAMES: LocalPcGame[] = [
  {
    id: 'xbox_indiana_jones_and_the_great_circle',
    title: 'Indiana Jones and the Great Circle',
    platform: 'Xbox Game Pass',
    coverUrl: '/api/fse/game-art?path=' + encodeURIComponent('D:\\XboxGames\\Indiana Jones and the Great Circle\\Content\\platform_data\\winstore\\media\\logo_150x150.png'),
    splashUrl: '/api/fse/game-art?path=' + encodeURIComponent('D:\\XboxGames\\Indiana Jones and the Great Circle\\Content\\platform_data\\winstore\\media\\splashscreen.png'),
    installPath: 'D:\\XboxGames\\Indiana Jones and the Great Circle',
    executable: 'D:\\XboxGames\\Indiana Jones and the Great Circle\\Content\\gamelaunchhelper.exe',
    protocol: 'ms-windows-store://pdp/?productid=9N8FQ28Z6QX3',
    storeId: '9N8FQ28Z6QX3',
    lastPlayed: 'Ready on Drive D:',
    installedDrive: 'D:'
  },
  {
    id: 'xbox_starfield',
    title: 'Starfield',
    platform: 'Xbox Game Pass',
    coverUrl: '/api/fse/game-art?path=' + encodeURIComponent('D:\\XboxGames\\Starfield\\Content\\Config\\Images\\Logo480x480.png'),
    splashUrl: '/api/fse/game-art?path=' + encodeURIComponent('D:\\XboxGames\\Starfield\\Content\\Config\\Images\\SplashScreen1920x1080.png'),
    installPath: 'D:\\XboxGames\\Starfield',
    executable: 'D:\\XboxGames\\Starfield\\Content\\gamelaunchhelper.exe',
    protocol: 'ms-windows-store://pdp/?productid=9NCJSXWZTP88',
    storeId: '9NCJSXWZTP88',
    lastPlayed: 'Ready on Drive D:',
    installedDrive: 'D:'
  },
  {
    id: 'xbox_hogwarts_legacy',
    title: 'Hogwarts Legacy',
    platform: 'Xbox Game Pass',
    coverUrl: '/api/fse/game-art?path=' + encodeURIComponent('D:\\XboxGames\\Hogwarts Legacy\\Content\\Resources\\Square480x480Logo.png'),
    splashUrl: '/api/fse/game-art?path=' + encodeURIComponent('D:\\XboxGames\\Hogwarts Legacy\\Content\\Resources\\SplashScreen.png'),
    installPath: 'D:\\XboxGames\\Hogwarts Legacy',
    executable: 'D:\\XboxGames\\Hogwarts Legacy\\Content\\gamelaunchhelper.exe',
    protocol: 'ms-windows-store://pdp/?productid=9MT5NJ5W7B8Z',
    storeId: '9MT5NJ5W7B8Z',
    lastPlayed: 'Ready on Drive D:',
    installedDrive: 'D:'
  },
  {
    id: 'epic_fortnite',
    title: 'Fortnite',
    platform: 'Epic Games',
    coverUrl: 'https://images.unsplash.com/photo-1560253023-3ec5d502959f?w=800&auto=format&fit=crop&q=80',
    splashUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=80',
    installPath: 'D:\\Games\\Fortnite',
    executable: 'D:\\Games\\Fortnite\\FortniteGame\\Binaries\\Win64\\FortniteLauncher.exe',
    protocol: 'com.epicgames.launcher://apps/Fortnite?action=launch&silent=true',
    lastPlayed: 'Ready on Drive D:',
    installedDrive: 'D:'
  },
  {
    id: 'xbox_sea_of_thieves',
    title: 'Sea of Thieves',
    platform: 'Xbox Game Pass',
    coverUrl: '/api/fse/game-art?path=' + encodeURIComponent('D:\\XboxGames\\Sea of Thieves\\Content\\Resources\\Square480x480Logo.png'),
    splashUrl: '/api/fse/game-art?path=' + encodeURIComponent('D:\\XboxGames\\Sea of Thieves\\Content\\Resources\\SplashScreen.png'),
    installPath: 'D:\\XboxGames\\Sea of Thieves',
    executable: 'D:\\XboxGames\\Sea of Thieves\\Content\\gamelaunchhelper.exe',
    protocol: 'ms-windows-store://pdp/?productid=9P2N57MC619K',
    storeId: '9P2N57MC619K',
    lastPlayed: 'Ready on Drive D:',
    installedDrive: 'D:'
  },
  {
    id: 'xbox_grounded',
    title: 'Grounded',
    platform: 'Xbox Game Pass',
    coverUrl: '/api/fse/game-art?path=' + encodeURIComponent('D:\\XboxGames\\Grounded\\Content\\Resources\\Logo.png'),
    splashUrl: '/api/fse/game-art?path=' + encodeURIComponent('D:\\XboxGames\\Grounded\\Content\\Resources\\SplashScreen.png'),
    installPath: 'D:\\XboxGames\\Grounded',
    executable: 'D:\\XboxGames\\Grounded\\Content\\gamelaunchhelper.exe',
    protocol: 'ms-windows-store://pdp/?productid=9PJTHRNVH62H',
    storeId: '9PJTHRNVH62H',
    lastPlayed: 'Ready on Drive D:',
    installedDrive: 'D:'
  },
  {
    id: 'xbox_south_of_midnight',
    title: 'South Of Midnight',
    platform: 'Xbox Game Pass',
    coverUrl: '/api/fse/game-art?path=' + encodeURIComponent('D:\\XboxGames\\South Of Midnight\\Content\\Resources\\Square480x480Logo.png'),
    splashUrl: '/api/fse/game-art?path=' + encodeURIComponent('D:\\XboxGames\\South Of Midnight\\Content\\Resources\\SplashScreen.png'),
    installPath: 'D:\\XboxGames\\South Of Midnight',
    executable: 'D:\\XboxGames\\South Of Midnight\\Content\\gamelaunchhelper.exe',
    protocol: 'ms-windows-store://pdp/?productid=9NJCVGS6T30K',
    storeId: '9NJCVGS6T30K',
    lastPlayed: 'Ready on Drive D:',
    installedDrive: 'D:'
  },
  {
    id: 'gpg_angry_birds_2',
    title: 'Angry Birds 2',
    platform: 'Google Play Games',
    coverUrl: 'https://images.unsplash.com/photo-1579373903781-fd5c0c30c4cd?w=800&auto=format&fit=crop&q=80',
    splashUrl: 'https://images.unsplash.com/photo-1579373903781-fd5c0c30c4cd?w=800&auto=format&fit=crop&q=80',
    installPath: 'Google Play Games for PC',
    protocol: 'googleplaygames://launch/?id=com.rovio.baba&lid=1&pid=1',
    lastPlayed: 'Installed on PC',
    installedDrive: 'C:'
  }
];

interface PlajahFseViewProps {
  userProfile?: UserProfile | null;
  onExit: () => void;
  onNavigateToService?: (service: string) => void;
}

export const PlajahFseView: React.FC<PlajahFseViewProps> = ({
  onExit,
  onNavigateToService
}) => {
  // State
  const [activeTab, setActiveTab] = useState<'GAMES' | 'THEATRE' | 'CHORA' | 'SIGNAGE' | 'SETTINGS'>('GAMES');
  const [pcGames, setPcGames] = useState<LocalPcGame[]>(() => {
    try {
      const saved = localStorage.getItem('plajah_fse_scanned_games');
      return saved ? JSON.parse(saved) : DEFAULT_PC_GAMES;
    } catch {
      return DEFAULT_PC_GAMES;
    }
  });
  const [selectedGameIndex, setSelectedGameIndex] = useState(0);
  const [isDockOpen, setIsDockOpen] = useState(false);
  const [isCouchMode, setIsCouchMode] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [statusToast, setStatusToast] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(true);
  const [currentTrack, setCurrentTrack] = useState({ title: 'Neon Echoes', artist: 'Astra Nova' });
  const [showCommandSplit, setShowCommandSplit] = useState(false);
  const [currentTime, setCurrentTime] = useState('');

  // Clock ticker
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setCurrentTime(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const showToast = useCallback((msg: string) => {
    setStatusToast(msg);
    setTimeout(() => setStatusToast(null), 4000);
  }, []);

  // Fetch real games dynamically from server on load
  const refreshGamesFromServer = useCallback(async (isManual = false) => {
    try {
      setIsScanning(true);
      const res = await fetch('/api/fse/games');
      if (res.ok) {
        const data = await res.json();
        if (data && data.success && Array.isArray(data.games) && data.games.length > 0) {
          setPcGames(data.games);
          try {
            localStorage.setItem('plajah_fse_scanned_games', JSON.stringify(data.games));
          } catch {}
          if (isManual) {
            showToast(`✅ Found ${data.games.length} installed PC games!`);
          }
          return;
        }
      }
    } catch {
      if (isManual) {
        showToast('ℹ️ Server scan unavailable. Showing cached installed games.');
      }
    } finally {
      setIsScanning(false);
    }
  }, [showToast]);

  useEffect(() => {
    refreshGamesFromServer(false);
  }, [refreshGamesFromServer]);

  // Launch Game Handler (Natively on Windows via server or client protocol)
  const handleLaunchGame = useCallback(async (game: LocalPcGame) => {
    showToast(`🚀 Starting ${game.title}...`);
    try {
      // 1. Try server-side native Windows execution (launches executable or protocol cleanly)
      const res = await fetch('/api/fse/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: game.title,
          protocol: game.protocol,
          executable: game.executable,
          installPath: game.installPath,
          storeId: game.storeId
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.success) {
          showToast(`🎮 ${data.message || `Launched ${game.title}!`}`);
          return;
        }
      }
    } catch {
      // fallback to browser
    }

    // 2. Direct browser protocol fallback
    try {
      window.location.href = game.protocol;
    } catch {
      window.open(game.protocol, '_blank');
    }
  }, [showToast]);

  // Scan PC Library Directory
  const handleScanLocalPc = useCallback(async () => {
    showToast('🔍 Scanning PC drives for installed games...');
    await refreshGamesFromServer(true);
  }, [refreshGamesFromServer, showToast]);

  // Gamepad Loop
  useEffect(() => {
    let animId: number;
    let lastPoll = 0;

    const poll = () => {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = gamepads[0];
      const now = Date.now();

      if (gp && now - lastPoll > 220) {
        if (gp.axes[0] > 0.5 || (gp.buttons[15] && gp.buttons[15].pressed)) {
          setSelectedGameIndex(prev => Math.min(prev + 1, pcGames.length - 1));
          lastPoll = now;
        } else if (gp.axes[0] < -0.5 || (gp.buttons[14] && gp.buttons[14].pressed)) {
          setSelectedGameIndex(prev => Math.max(prev - 1, 0));
          lastPoll = now;
        } else if (gp.buttons[0] && gp.buttons[0].pressed) {
          if (activeTab === 'GAMES' && pcGames[selectedGameIndex]) {
            handleLaunchGame(pcGames[selectedGameIndex]);
          }
          lastPoll = now;
        } else if (gp.buttons[1] && gp.buttons[1].pressed) {
          if (isDockOpen) setIsDockOpen(false);
          else if (showCommandSplit) setShowCommandSplit(false);
          else onExit();
          lastPoll = now;
        } else if (gp.buttons[2] && gp.buttons[2].pressed) {
          handleScanLocalPc();
          lastPoll = now;
        } else if (gp.buttons[3] && gp.buttons[3].pressed) {
          setIsDockOpen(prev => !prev);
          lastPoll = now;
        } else if (gp.buttons[4] && gp.buttons[4].pressed) {
          setActiveTab('GAMES');
          lastPoll = now;
        } else if (gp.buttons[5] && gp.buttons[5].pressed) {
          setActiveTab('THEATRE');
          lastPoll = now;
        } else if (gp.buttons[9] && gp.buttons[9].pressed) {
          setShowCommandSplit(prev => !prev);
          lastPoll = now;
        }
      }
      animId = requestAnimationFrame(poll);
    };

    animId = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(animId);
  }, [pcGames, selectedGameIndex, activeTab, isDockOpen, showCommandSplit, handleLaunchGame, handleScanLocalPc, onExit]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showCommandSplit) setShowCommandSplit(false);
        else if (isDockOpen) setIsDockOpen(false);
        else onExit();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandSplit(prev => !prev);
      } else if (e.key === 'ArrowRight') {
        setSelectedGameIndex(prev => Math.min(prev + 1, pcGames.length - 1));
      } else if (e.key === 'ArrowLeft') {
        setSelectedGameIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' || e.key === 'a' || e.key === 'A') {
        if (activeTab === 'GAMES' && pcGames[selectedGameIndex]) {
          handleLaunchGame(pcGames[selectedGameIndex]);
        }
      } else if (e.key === 'y' || e.key === 'Y') {
        setIsDockOpen(prev => !prev);
      } else if (e.key === 'v' || e.key === 'V') {
        setIsCouchMode(prev => !prev);
      } else if (e.key === 'x' || e.key === 'X') {
        handleScanLocalPc();
      } else if (e.key === '1') setActiveTab('GAMES');
      else if (e.key === '2') setActiveTab('THEATRE');
      else if (e.key === '3') setActiveTab('CHORA');
      else if (e.key === '4') setActiveTab('SIGNAGE');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pcGames, selectedGameIndex, activeTab, isDockOpen, showCommandSplit, handleLaunchGame, handleScanLocalPc, onExit]);

  const activeHeroGame = pcGames[selectedGameIndex] || pcGames[0];

  return (
    <div className={`min-h-screen flex flex-col bg-[#0b0112] text-white p-4 md:p-6 select-none selection:bg-pink-500 overflow-x-hidden ${isCouchMode ? 'text-[17px]' : 'text-[14px]'}`}>
      
      {/* ================= PERMANENT FULL-BLEED TOP AD SLITHER ================= */}
      <aside className="w-full bg-gradient-to-r from-pink-950/80 via-black/90 to-purple-950/80 border-2 border-orange-500/50 rounded-2xl px-5 py-3 mb-4 flex items-center justify-between shadow-2xl backdrop-blur-2xl relative overflow-hidden">
        <div className="flex items-center gap-3.5 min-w-0">
          <span className="px-3.5 py-1 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-black text-xs sm:text-sm font-black uppercase tracking-widest flex-shrink-0 shadow-md">
            Featured Creator Drop • Sponsored
          </span>
          <div className="flex items-center gap-3 min-w-0">
            <img src="https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=120&auto=format&fit=crop&q=80" className="w-10 h-10 rounded-xl object-cover border-2 border-orange-500/50 flex-shrink-0 shadow-lg" alt="" />
            <span className="text-sm sm:text-lg font-black text-white truncate">Neon Echoes <span className="text-orange-300 font-normal">by Astra Nova</span></span>
            <span className="hidden xl:inline text-xs sm:text-sm text-gray-200 truncate">— Premiering exclusively on Chora & Taleo. Keep up to 100% creator royalties.</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <button onClick={() => setActiveTab('CHORA')} className="px-5 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-pink-600 hover:scale-105 text-white text-sm sm:text-base font-black transition-all shadow-lg flex items-center gap-2">
            <span>Listen Now</span>
            <kbd className="px-2 py-0.5 rounded bg-black/50 text-xs font-mono text-orange-200 font-black">X</kbd>
          </button>
        </div>
      </aside>

      {/* ================= TOP SYSTEM STATUS BAR ================= */}
      <header className="flex flex-wrap items-center justify-between gap-3.5 pb-4 border-b border-pink-900/40">
        <div className="flex items-center flex-wrap gap-3">
          
          {/* Brand Logo & Mode Title */}
          <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-pink-950/60 border border-pink-500/40 shadow-lg">
            <span className="w-3 h-3 rounded-full bg-orange-500 animate-pulse"></span>
            <span className="text-sm font-black tracking-widest text-orange-400 uppercase">The Plajah FSE</span>
          </div>

          {/* 10-Foot Distance Mode Switcher */}
          <button
            onClick={() => setIsCouchMode(prev => !prev)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-950/60 border-2 border-orange-500/60 text-orange-200 hover:text-white transition-all shadow-lg hover:scale-105"
            title="Toggle 10-Foot Couch Scale vs Desk Scale (Hotkey: V)"
          >
            <span className="text-base">{isCouchMode ? '🛋️' : '🖥️'}</span>
            <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-orange-300">
              {isCouchMode ? '10-Foot Couch (Large)' : 'Desk View (Standard)'}
            </span>
            <kbd className="px-2 py-0.5 rounded bg-black/50 text-xs font-mono text-orange-200 font-black">V</kbd>
          </button>

          {/* Command Split Button */}
          <button
            onClick={() => setShowCommandSplit(prev => !prev)}
            className="flex items-center gap-2 text-sm font-black px-4 py-2 rounded-xl bg-purple-900/70 border border-purple-500/50 hover:border-pink-400 text-purple-200 hover:text-white transition-all shadow-md"
          >
            <Sparkles className="w-4 h-4 text-pink-400" />
            <span>All Services</span>
            <kbd className="ml-1 px-2 py-0.5 rounded bg-black/50 text-xs font-mono text-pink-300 font-black">⌘K</kbd>
          </button>

          {/* Plajah Dock Toggle Button */}
          <button
            onClick={() => setIsDockOpen(prev => !prev)}
            className="flex items-center gap-2 text-sm font-black px-4 py-2 rounded-xl bg-pink-950/60 border border-pink-500/50 hover:bg-pink-900/70 text-pink-200 transition-all shadow-md"
          >
            <Monitor className="w-4 h-4 text-orange-400" />
            <span>Plajah Dock: {isDockOpen ? 'On (25%)' : 'Off'}</span>
            <kbd className="ml-1 px-2 py-0.5 rounded bg-black/50 text-xs font-mono text-orange-300 font-black">Y</kbd>
          </button>
        </div>

        {/* Mode Navigation Tabs Ribbon */}
        <nav className="flex items-center flex-wrap gap-1.5 bg-black/50 backdrop-blur-2xl p-2 rounded-2xl border border-pink-500/30 shadow-xl">
          <button
            onClick={() => setActiveTab('GAMES')}
            className={`px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl text-sm sm:text-base font-black transition-all ${
              activeTab === 'GAMES'
                ? 'bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-lg shadow-pink-600/40'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            🎮 Game Hub
          </button>
          <button
            onClick={() => setActiveTab('THEATRE')}
            className={`px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl text-sm sm:text-base font-black transition-all ${
              activeTab === 'THEATRE'
                ? 'bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-lg shadow-pink-600/40'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            🍿 Home Theatre
          </button>
          <button
            onClick={() => setActiveTab('CHORA')}
            className={`px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl text-sm sm:text-base font-black transition-all flex items-center gap-2 ${
              activeTab === 'CHORA'
                ? 'bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-lg shadow-pink-600/40'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-[#22D3AA]"></span>
            <span>🎵 Chora Music</span>
          </button>
          <button
            onClick={() => setActiveTab('SIGNAGE')}
            className={`px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl text-sm sm:text-base font-black transition-all ${
              activeTab === 'SIGNAGE'
                ? 'bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-lg shadow-pink-600/40'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            📺 Signage
          </button>
          <button
            onClick={() => setActiveTab('SETTINGS')}
            className={`px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl text-sm sm:text-base font-black transition-all ${
              activeTab === 'SETTINGS'
                ? 'bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-lg shadow-pink-600/40'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            ⚙️ Settings
          </button>
        </nav>

        {/* Right Info: Exit FSE & Clock */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={onExit}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-purple-950/60 border border-purple-500/40 text-xs sm:text-sm font-black text-pink-300 hover:text-white hover:border-pink-400 transition-all shadow-md"
            title="Exit The Plajah FSE to Web Platform"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Exit FSE</span>
            <kbd className="px-1.5 py-0.5 rounded bg-black/50 text-[10px] font-mono text-gray-300 font-bold">Esc</kbd>
          </button>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/50 border border-pink-500/30 text-xs sm:text-sm font-mono font-black">
            <span className="text-white">{currentTime}</span>
          </div>
        </div>
      </header>

      {/* ================= MAIN SPLIT STAGE ================= */}
      <div className="flex-1 mt-5 flex gap-5 relative overflow-hidden">
        
        {/* Primary Stage */}
        <main className="flex-1 flex flex-col transition-all duration-500 min-w-0">

          {/* TAB 1: GAME HUB */}
          {activeTab === 'GAMES' && (
            <div className="flex flex-col gap-6">
              
              {/* Hero Stage with real game splash backdrop */}
              <div className="relative overflow-hidden rounded-3xl border-2 border-pink-500/40 bg-gradient-to-r from-purple-950/90 via-black/90 to-purple-950/70 p-6 md:p-10 shadow-2xl backdrop-blur-2xl">
                {activeHeroGame.splashUrl && (
                  <div
                    className="absolute inset-0 bg-cover bg-center opacity-30 mix-blend-screen scale-105 transition-all duration-700 pointer-events-none"
                    style={{ backgroundImage: `url(${activeHeroGame.splashUrl})` }}
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent pointer-events-none" />

                <div className="max-w-3xl flex flex-col gap-4 relative z-10">
                  <div className="flex items-center gap-3">
                    <span className="px-3.5 py-1 rounded-lg text-xs sm:text-sm font-black uppercase tracking-widest bg-orange-500 text-black shadow-md">
                      The Plajah FSE Game Hub
                    </span>
                    <span className="px-3.5 py-1 rounded-lg text-xs sm:text-sm font-bold text-pink-300 bg-pink-950/70 border border-pink-500/40 flex items-center gap-1.5">
                      <span>{activeHeroGame.platform === 'Xbox Game Pass' ? '💚' : activeHeroGame.platform === 'Epic Games' ? '⚡' : '🎮'}</span>
                      <span>{activeHeroGame.platform}</span>
                    </span>
                    {activeHeroGame.installedDrive && (
                      <span className="px-3 py-1 rounded-lg text-xs sm:text-sm font-mono font-bold text-emerald-400 bg-emerald-950/70 border border-emerald-500/40">
                        {activeHeroGame.installedDrive}
                      </span>
                    )}
                  </div>
                  <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-pink-100 to-orange-200 drop-shadow-xl leading-none">
                    {activeHeroGame.title}
                  </h1>
                  <p className="text-sm sm:text-base lg:text-xl text-gray-200 leading-relaxed font-medium">
                    Installed at <span className="text-orange-400 font-mono font-bold">{activeHeroGame.installPath}</span>. {activeHeroGame.lastPlayed || 'Ready to launch'}.
                  </p>
                  <div className="flex flex-wrap items-center gap-4 mt-2">
                    <button
                      onClick={() => handleLaunchGame(activeHeroGame)}
                      className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-gradient-to-r from-pink-600 via-rose-600 to-orange-500 text-white font-black text-base sm:text-xl shadow-2xl shadow-pink-600/40 hover:scale-105 active:scale-95 transition-all cursor-pointer"
                    >
                      <Play className="w-6 h-6 fill-current" />
                      <span>Play Game</span>
                      <kbd className="ml-1.5 px-2.5 py-1 rounded-lg bg-black/50 text-sm font-mono text-orange-200 font-black">A</kbd>
                    </button>
                    <button
                      onClick={() => setIsDockOpen(prev => !prev)}
                      className="flex items-center gap-3 px-6 py-4 rounded-2xl bg-purple-950/70 hover:bg-purple-900/80 border-2 border-pink-500/40 text-pink-200 font-black text-sm sm:text-lg backdrop-blur-xl shadow-xl cursor-pointer"
                    >
                      <span>Dock Front Row / Chora</span>
                      <kbd className="ml-1.5 px-2.5 py-1 rounded-lg bg-black/50 text-sm font-mono text-pink-200 font-black">Y</kbd>
                    </button>
                    <button
                      onClick={handleScanLocalPc}
                      disabled={isScanning}
                      className="flex items-center gap-2 px-5 py-4 rounded-2xl bg-black/60 hover:bg-purple-950/60 border border-white/20 text-gray-200 font-bold text-sm sm:text-base cursor-pointer"
                    >
                      <FolderSearch className="w-5 h-5 text-orange-400" />
                      <span>{isScanning ? 'Scanning...' : 'Rescan PC'}</span>
                      <kbd className="ml-1 px-2 py-0.5 rounded bg-black/50 text-xs font-mono text-gray-300 font-bold">X</kbd>
                    </button>
                    {statusToast && (
                      <div className="text-sm sm:text-base font-mono font-bold text-emerald-300 bg-emerald-950/80 px-4 py-2.5 rounded-2xl border border-emerald-500/50 shadow-lg animate-fade-in">
                        {statusToast}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Shelf 1: Installed PC Library */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-white flex items-center gap-3">
                    <span>Installed PC Library</span>
                    <span className="text-xs sm:text-sm px-3 py-1 rounded-full bg-pink-500/20 text-pink-300 font-mono font-black border border-pink-500/30">
                      {pcGames.length} Detected
                    </span>
                  </h2>
                  <span className="text-xs sm:text-sm text-gray-300 font-mono font-bold">D-Pad / Thumbstick Select</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {pcGames.map((game, idx) => (
                    <div
                      key={game.id}
                      tabIndex={0}
                      onClick={() => setSelectedGameIndex(idx)}
                      onDoubleClick={() => handleLaunchGame(game)}
                      className={`group relative rounded-2xl overflow-hidden border-2 cursor-pointer transition-all duration-300 shadow-xl ${
                        selectedGameIndex === idx
                          ? 'border-[#FF8C00] scale-105 shadow-orange-500/40 ring-4 ring-orange-500/30 -translate-y-2'
                          : 'border-purple-800/50 bg-purple-950/40 hover:border-pink-500/60'
                      }`}
                    >
                      <div className="aspect-[3/4] w-full relative bg-purple-950/60 overflow-hidden">
                        <img
                          src={game.coverUrl}
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=700&auto=format&fit=crop&q=80';
                          }}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          alt={game.title}
                        />
                        <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md border border-white/20 text-xs font-black text-white uppercase shadow-md flex items-center gap-1.5">
                          <span>{game.platform === 'Xbox Game Pass' ? '💚' : game.platform === 'Epic Games' ? '⚡' : '🎮'}</span>
                          <span className="truncate max-w-[90px]">{game.platform}</span>
                        </div>
                        {game.installedDrive && (
                          <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded bg-black/70 backdrop-blur-md text-[10px] font-mono font-bold text-orange-300 border border-orange-500/30">
                            {game.installedDrive}
                          </div>
                        )}
                        <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black via-black/80 to-transparent">
                          <span className="font-black text-sm sm:text-base md:text-lg text-white drop-shadow-lg block truncate">
                            {game.title}
                          </span>
                          <span className="text-[11px] font-mono text-gray-300 block truncate">
                            {game.lastPlayed}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Shelf 2: Front Row Platform Carryover */}
              <div className="rounded-3xl border-2 border-pink-500/40 bg-purple-950/40 p-6 backdrop-blur-xl shadow-2xl">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5 pb-4 border-b border-pink-500/30">
                  <div>
                    <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black uppercase tracking-tighter text-white italic select-none">
                      Plajah <span className="text-orange-400 inline-block pr-[0.1em]">Front Row</span>
                    </h2>
                    <p className="mt-2 text-xs sm:text-sm md:text-base font-black uppercase tracking-[0.25em] text-white/60 flex flex-wrap items-center gap-x-3">
                      <span>EVENING</span><span aria-hidden="true">·</span>
                      <span>SEPTEMBER 17</span><span aria-hidden="true">·</span>
                      <span className="text-orange-400 font-black">42 FRESH DROPS TODAY</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="w-3 h-3 rounded-full bg-red-500 animate-ping"></span>
                    <span className="text-xs sm:text-sm font-black text-pink-300">Live Stadium Feeds & Panorama Active</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="rounded-2xl overflow-hidden border-2 border-pink-500/40 bg-black/70 p-3 flex flex-col gap-2.5 hover:border-orange-400 transition-all cursor-pointer group shadow-xl">
                    <div className="aspect-[3/4] rounded-xl bg-zinc-900 overflow-hidden relative">
                      <img src="https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=400&auto=format&fit=crop&q=80" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="" />
                      <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-red-600 text-xs font-black uppercase text-white shadow-md">Live Broadcast</div>
                      <div className="absolute bottom-3 left-3 right-3">
                        <span className="text-sm sm:text-base font-black text-white drop-shadow-md block leading-snug">FC Barcelona 2 - 1 Real Madrid</span>
                        <span className="text-xs sm:text-sm text-orange-300 font-mono font-black block mt-0.5">85' • 94% Energy</span>
                      </div>
                    </div>
                    <span className="text-xs sm:text-sm font-bold text-gray-200 text-center">Front Row VIP Stadium</span>
                  </div>

                  <div className="rounded-2xl overflow-hidden border-2 border-pink-500/40 bg-black/70 p-3 flex flex-col gap-2.5 hover:border-orange-400 transition-all cursor-pointer group shadow-xl">
                    <div className="aspect-[3/4] rounded-xl bg-zinc-900 overflow-hidden relative">
                      <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="" />
                      <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-purple-600 text-xs font-black uppercase text-white shadow-md">Creator Spotlight</div>
                      <div className="absolute bottom-3 left-3 right-3">
                        <span className="text-sm sm:text-base font-black text-white drop-shadow-md block leading-snug">Elena Vance</span>
                        <span className="text-xs sm:text-sm text-pink-300 font-mono font-black block mt-0.5">Synthesizer Odyssey</span>
                      </div>
                    </div>
                    <span className="text-xs sm:text-sm font-bold text-gray-200 text-center">Featured Artist</span>
                  </div>

                  <div className="rounded-2xl overflow-hidden border-2 border-pink-500/40 bg-black/70 p-3 flex flex-col gap-2.5 hover:border-orange-400 transition-all cursor-pointer group shadow-xl">
                    <div className="aspect-[3/4] rounded-xl bg-zinc-900 overflow-hidden relative">
                      <img src="https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400&auto=format&fit=crop&q=80" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="" />
                      <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-amber-600 text-xs font-black uppercase text-white shadow-md">Esports Final</div>
                      <div className="absolute bottom-3 left-3 right-3">
                        <span className="text-sm sm:text-base font-black text-white drop-shadow-md block leading-snug">Sentinels vs Fnatic</span>
                        <span className="text-xs sm:text-sm text-amber-300 font-mono font-black block mt-0.5">Map 3 • Multi-Cam</span>
                      </div>
                    </div>
                    <span className="text-xs sm:text-sm font-bold text-gray-200 text-center">Live Arena Feed</span>
                  </div>

                  <div className="rounded-2xl overflow-hidden border-2 border-pink-500/40 bg-black/70 p-3 flex flex-col gap-2.5 hover:border-orange-400 transition-all cursor-pointer group shadow-xl">
                    <div className="aspect-[3/4] rounded-xl bg-zinc-900 overflow-hidden relative">
                      <img src="https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&auto=format&fit=crop&q=80" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="" />
                      <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-pink-600 text-xs font-black uppercase text-white shadow-md">Fabula Stage 3D</div>
                      <div className="absolute bottom-3 left-3 right-3">
                        <span className="text-sm sm:text-base font-black text-white drop-shadow-md block leading-snug">Neon Night Tour</span>
                        <span className="text-xs sm:text-sm text-pink-300 font-mono font-black block mt-0.5">Dolby Atmos • 3.4K Fans</span>
                      </div>
                    </div>
                    <span className="text-xs sm:text-sm font-bold text-gray-200 text-center">Live Interactive Concert</span>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: HOME THEATRE */}
          {activeTab === 'THEATRE' && (
            <div className="flex flex-col gap-6">
              <div className="rounded-3xl border-2 border-pink-500/40 bg-purple-950/40 p-6 md:p-8 backdrop-blur-2xl shadow-2xl">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-pink-500/30">
                  <div>
                    <span className="px-3 py-1 rounded-lg text-xs font-black uppercase bg-red-600 text-white">Tier 1 Living Room</span>
                    <h2 className="text-3xl sm:text-4xl font-black text-white mt-1">Plajah Home Theatre: Front Row & Taleo IMAX</h2>
                  </div>
                  <span className="text-xs sm:text-sm font-mono font-bold text-orange-400">4K HDR Spatial Master</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="aspect-video rounded-2xl overflow-hidden relative border-2 border-pink-500/40 group cursor-pointer shadow-xl">
                    <img src="https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&auto=format&fit=crop&q=80" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent"></div>
                    <div className="absolute bottom-4 left-4 right-4">
                      <span className="px-2.5 py-0.5 rounded bg-pink-600 text-xs font-black uppercase text-white">Taleo Premiere</span>
                      <h3 className="text-xl sm:text-2xl font-black text-white mt-1">Neon Horizon: Episode 1</h3>
                      <p className="text-xs sm:text-sm text-gray-200 mt-0.5">Stream exclusively on Plajah Theatre in Dolby Atmos.</p>
                    </div>
                  </div>
                  <div className="aspect-video rounded-2xl overflow-hidden relative border-2 border-pink-500/40 group cursor-pointer shadow-xl">
                    <img src="https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=800&auto=format&fit=crop&q=80" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent"></div>
                    <div className="absolute bottom-4 left-4 right-4">
                      <span className="px-2.5 py-0.5 rounded bg-orange-600 text-xs font-black uppercase text-white">Reello Cinema</span>
                      <h3 className="text-xl sm:text-2xl font-black text-white mt-1">Cyberpunk Ascension (Short Film)</h3>
                      <p className="text-xs sm:text-sm text-gray-200 mt-0.5">Direct from Fabula Studio creators. 4K 60FPS.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CHORA MUSIC */}
          {activeTab === 'CHORA' && (
            <div className="flex flex-col gap-5">
              <div className="rounded-3xl border-2 border-[#22D3AA]/40 bg-black/90 backdrop-blur-2xl p-6 flex flex-col gap-5 shadow-2xl relative">
                <div className="flex items-center justify-between pb-4 border-b border-[#22D3AA]/30">
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-2xl bg-[#22D3AA]/20 border-2 border-[#22D3AA]/50 flex items-center justify-center text-[#22D3AA] shadow-lg">
                      <Disc3 className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-2xl sm:text-3xl font-black text-white flex items-center gap-3">
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#22D3AA] via-teal-200 to-emerald-400">Chora</span>
                        <span className="text-xs sm:text-sm font-mono font-black px-3 py-1 rounded-full bg-[#22D3AA]/20 text-[#22D3AA] border border-[#22D3AA]/40 shadow-sm">Music Service</span>
                      </h2>
                      <p className="text-xs sm:text-sm text-gray-300 font-medium">10-Foot Spatial Audio • Audius Web3 & Lossless FLAC 96kHz</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs sm:text-sm font-mono font-bold text-gray-300">
                    <kbd className="px-2 py-1 rounded-lg bg-black/60 border border-white/20 text-[#FF8C00]">D-Pad Left</kbd>
                    <span>Spine Navigation</span>
                  </div>
                </div>

                <div className="flex gap-6 min-h-[460px]">
                  <aside className="w-48 sm:w-56 flex flex-col gap-1.5 pr-4 border-r border-white/10 flex-shrink-0 text-sm sm:text-base">
                    {['✨ New', '🎵 For You', '📻 Radio', '📚 My Library', '🌊 Audius', '👥 Artists', '💿 Albums', '🎼 Genres', '🏛️ The Vault', '🎙️ Podcasts', '📖 Audiobooks', '🎓 Conservatory'].map((sec, i) => (
                      <button
                        key={sec}
                        className={`w-full text-left px-4 py-2.5 rounded-xl font-bold flex items-center gap-2.5 transition-colors ${
                          i === 0
                            ? 'bg-[#22D3AA]/20 border-2 border-[#22D3AA]/50 text-[#22D3AA] font-black shadow-md'
                            : 'text-gray-300 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <span>{sec}</span>
                      </button>
                    ))}
                  </aside>

                  <div className="flex-1 flex flex-col gap-5 overflow-hidden min-w-0">
                    <div>
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="text-base sm:text-lg font-black uppercase text-white tracking-wider">Spotlight Releases</span>
                        <span className="text-xs sm:text-sm font-mono font-bold text-[#22D3AA]">Lossless Spatial FLAC 96kHz</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {[
                          { title: 'Neon Echoes', artist: 'Astra Nova', img: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&auto=format&fit=crop&q=80' },
                          { title: 'Midnight Cyberwave', artist: 'Kaelen Vance', img: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&auto=format&fit=crop&q=80' },
                          { title: 'Subterranean Soul', artist: 'The Collective', img: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&auto=format&fit=crop&q=80' },
                          { title: 'Eclipsa Score', artist: 'Fabula Soundworks', img: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=400&auto=format&fit=crop&q=80' }
                        ].map((alb) => (
                          <div
                            key={alb.title}
                            onClick={() => {
                              setCurrentTrack({ title: alb.title, artist: alb.artist });
                              setIsPlayingAudio(true);
                              showToast(`🎵 Playing ${alb.title} by ${alb.artist}`);
                            }}
                            className="rounded-2xl bg-zinc-950/80 border-2 border-white/10 hover:border-[#FF8C00] p-3 cursor-pointer group transition-all shadow-xl"
                          >
                            <div className="aspect-square rounded-xl bg-purple-950 overflow-hidden relative mb-2.5 shadow-md">
                              <img src={alb.img} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="" />
                              <div className="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-black/90 border border-white/40 flex items-center justify-center text-xs shadow-md">💿</div>
                            </div>
                            <span className="text-sm sm:text-base font-black text-white block truncate">{alb.title}</span>
                            <span className="text-xs sm:text-sm text-gray-300 block truncate font-medium mt-0.5">{alb.artist}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-2 p-3.5 rounded-2xl bg-black/90 border-2 border-[#22D3AA]/50 flex items-center justify-between shadow-2xl">
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-xl bg-[#22D3AA]/20 border-2 border-[#22D3AA]/50 flex items-center justify-center text-[#22D3AA] text-sm font-bold animate-spin shadow-md" style={{ animationDuration: '8s' }}>💿</div>
                    <div>
                      <span className="text-sm sm:text-base font-black text-white block">{currentTrack.title}</span>
                      <span className="text-xs sm:text-sm text-[#22D3AA] font-mono font-bold">{currentTrack.artist} • Lossless FLAC 96kHz</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setIsPlayingAudio(prev => !prev)}
                      className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center text-sm font-black hover:scale-105 shadow-lg"
                    >
                      <span>{isPlayingAudio ? '⏸' : '▶'}</span>
                    </button>
                    <div className="text-xs sm:text-sm font-mono font-bold text-gray-300 hidden sm:inline">
                      Press <kbd className="px-2 py-0.5 rounded bg-zinc-800 text-[#FF8C00]">X</kbd> for Audio Controls
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SIGNAGE */}
          {activeTab === 'SIGNAGE' && (
            <div className="rounded-3xl border-2 border-orange-500/50 bg-black/90 p-6 flex flex-col gap-4 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-orange-500/30">
                <div className="flex items-center gap-2.5">
                  <span className="w-3.5 h-3.5 rounded-full bg-orange-500 animate-ping"></span>
                  <span className="text-sm sm:text-base font-black tracking-widest text-orange-400 uppercase">The Plajah FSE Signage Receiver Active • Sync Node #04</span>
                </div>
                <div className="text-xs sm:text-sm font-mono text-pink-300 font-bold">4K Arena Output</div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="md:col-span-2 rounded-2xl overflow-hidden border-2 border-pink-500/40 relative aspect-video bg-zinc-950 shadow-xl">
                  <img src="https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=80" className="w-full h-full object-cover" alt="" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent"></div>
                  <div className="absolute bottom-4 left-4 right-4">
                    <span className="px-2.5 py-0.5 rounded bg-pink-600 text-xs font-black uppercase text-white">Live Looping Feed</span>
                    <h3 className="text-2xl font-black text-white mt-1">Taleo: Cyberpunk Ascension (Official Trailer)</h3>
                    <p className="text-sm text-gray-200">Exclusive streaming premiering Friday on The Plajah FSE</p>
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="p-4 rounded-2xl bg-purple-950/50 border-2 border-pink-500/40 flex flex-col gap-2 shadow-lg">
                    <span className="text-xs font-black uppercase text-pink-300">Front Row Live Scores</span>
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/60 border border-white/10 text-sm">
                      <span className="font-bold text-white">Man City vs Arsenal</span>
                      <span className="text-emerald-400 font-mono font-bold">3 - 2 (85')</span>
                    </div>
                  </div>
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-pink-950/60 to-orange-950/60 border-2 border-orange-500/40 flex items-center gap-3 shadow-lg">
                    <div className="w-20 h-20 bg-white rounded-xl p-1.5 flex items-center justify-center flex-shrink-0">
                      <div className="w-full h-full bg-black rounded flex items-center justify-center text-white text-[10px] font-mono text-center font-black">
                        QR: CHORA
                      </div>
                    </div>
                    <div>
                      <span className="text-sm font-black text-white block">Scan to Join On Phone</span>
                      <span className="text-xs text-gray-300 block mt-0.5">Live crowd voting, voice circles & reaction emojis.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: SETTINGS */}
          {activeTab === 'SETTINGS' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="rounded-3xl border-2 border-pink-500/40 bg-purple-950/50 p-6 flex flex-col gap-3.5 shadow-2xl">
                <h3 className="font-black text-lg text-white">Windows PC Boot-to-Console</h3>
                <p className="text-sm text-gray-300">Turns your Windows PC into a dedicated living room console on system startup.</p>
                <div className="p-4 rounded-2xl bg-black/60 text-sm font-mono text-pink-200 space-y-2 border border-pink-500/30">
                  <div>Registry Autostart: <span className="text-orange-400 font-bold">HKCU\...\Run\ThePlajahFSE</span></div>
                  <div>Shell Kiosk Mode: <span className="text-emerald-400 font-bold">Ready</span></div>
                </div>
              </div>
              <div className="rounded-3xl border-2 border-pink-500/40 bg-purple-950/50 p-6 flex flex-col gap-3.5 shadow-2xl">
                <h3 className="font-black text-lg text-white">Android TV / Handheld Launcher</h3>
                <p className="text-sm text-gray-300">Default Home Launcher on Android handheld consoles & TVs.</p>
                <div className="p-4 rounded-2xl bg-black/60 text-sm font-mono text-pink-200 space-y-2 border border-pink-500/30">
                  <div>Intent Filter: <span className="text-emerald-400 font-bold">CATEGORY_HOME / LEANBACK</span></div>
                  <div>Controller Mappings: <span className="text-orange-400 font-bold">Active</span></div>
                </div>
              </div>
            </div>
          )}

        </main>

        {/* ================= PLAJAH DOCK (25% MULTITASK SIDECAR) ================= */}
        {isDockOpen && (
          <aside className="w-96 md:w-[440px] flex flex-col gap-4 bg-black/85 backdrop-blur-2xl border-l-2 border-pink-500/50 p-5 rounded-3xl shadow-2xl transition-all duration-500 flex-shrink-0">
            <div className="flex items-center justify-between pb-3 border-b border-pink-500/30">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-pink-500 animate-pulse"></span>
                <span className="text-sm sm:text-base font-black uppercase text-pink-200 tracking-wider">Plajah Dock</span>
              </div>
              <button
                onClick={() => setIsDockOpen(false)}
                className="px-2.5 py-1 rounded-lg bg-white/10 text-gray-200 hover:text-white text-xs sm:text-sm font-bold"
              >
                ✕ Close Dock
              </button>
            </div>

            <div className="rounded-2xl bg-purple-950/60 border border-pink-500/40 p-3.5 flex flex-col gap-2.5 shadow-lg">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-0.5 rounded bg-red-600 text-xs font-black uppercase text-white shadow-md">Front Row Live</span>
                <span className="text-xs sm:text-sm font-mono font-bold text-orange-400">85' Live</span>
              </div>
              <div className="aspect-video rounded-xl bg-black overflow-hidden relative shadow-inner">
                <img src="https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=400&auto=format&fit=crop&q=80" className="w-full h-full object-cover" alt="" />
                <div className="absolute bottom-1.5 right-1.5 flex gap-1.5">
                  <span className="text-sm">🔥</span><span className="text-sm">⚽</span><span className="text-sm">🎉</span>
                </div>
              </div>
              <div className="text-sm sm:text-base font-black text-white flex justify-between">
                <span>Man City 3 - 2 Arsenal</span>
                <span className="text-emerald-400 font-mono">92% Energy</span>
              </div>
            </div>

            <div className="flex-1 rounded-2xl bg-purple-950/60 border border-pink-500/40 p-3.5 flex flex-col gap-2.5 overflow-y-auto shadow-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm sm:text-base font-black text-pink-200">Chora Match Circle</span>
                <span className="text-xs sm:text-sm text-gray-300 font-mono font-bold">28 active</span>
              </div>
              <div className="space-y-2.5 text-xs sm:text-sm">
                <div className="flex items-center gap-2.5 p-2 rounded-xl bg-black/50">
                  <div className="w-7 h-7 rounded-full bg-pink-600 flex items-center justify-center text-xs font-bold shadow-md">AG</div>
                  <span className="font-black text-pink-300">@AnyaG:</span>
                  <span className="text-gray-200 truncate font-medium">What a save in the 84th!</span>
                </div>
                <div className="flex items-center gap-2.5 p-2 rounded-xl bg-black/50">
                  <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold shadow-md">BS</div>
                  <span className="font-black text-cyan-300">@BenS:</span>
                  <span className="text-gray-200 truncate font-medium">Tactics totally shifted now</span>
                </div>
                <div className="flex items-center gap-2.5 p-2 rounded-xl bg-black/50">
                  <div className="w-7 h-7 rounded-full bg-amber-600 flex items-center justify-center text-xs font-bold shadow-md">CH</div>
                  <span className="font-black text-amber-300">@ChoraHost:</span>
                  <span className="text-gray-200 truncate font-medium">Mic is open, press Y to speak</span>
                </div>
              </div>
              <div className="mt-auto pt-2.5 border-t border-white/10 flex items-center gap-2">
                <input type="text" placeholder="Type or speak..." className="flex-1 bg-black/60 border border-pink-500/40 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-orange-400" />
                <button className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-xs sm:text-sm font-black text-white shadow-md">Send</button>
              </div>
            </div>
          </aside>
        )}

      </div>

      {/* ================= MULTITASKING QUICK GUIDE RIBBON ================= */}
      <div className="mt-4 p-2.5 rounded-2xl bg-black/70 backdrop-blur-2xl border-2 border-pink-500/40 flex items-center justify-between text-xs sm:text-sm shadow-xl">
        <div className="flex items-center flex-wrap gap-2.5">
          <span className="text-orange-400 font-black px-3 py-1 rounded-xl bg-orange-950/60 border border-orange-500/40 uppercase tracking-wider">Quick Guide</span>
          <button onClick={() => setActiveTab('GAMES')} className="px-4 py-1.5 rounded-xl bg-purple-900/60 hover:bg-pink-600 text-white font-extrabold transition-all shadow-md">🎮 Games</button>
          <button onClick={() => setActiveTab('THEATRE')} className="px-4 py-1.5 rounded-xl bg-purple-900/60 hover:bg-pink-600 text-white font-extrabold transition-all shadow-md">🍿 Theatre</button>
          <button onClick={() => setActiveTab('CHORA')} className="px-4 py-1.5 rounded-xl bg-purple-900/60 hover:bg-pink-600 text-white font-extrabold transition-all shadow-md">🎙️ Chora</button>
          <button onClick={() => setActiveTab('SIGNAGE')} className="px-4 py-1.5 rounded-xl bg-orange-900/60 text-orange-300 hover:bg-orange-600 hover:text-black font-extrabold transition-all shadow-md">📺 Signage</button>
        </div>
        <div className="flex items-center gap-3 font-mono text-gray-300 font-bold text-xs sm:text-sm">
          <span>Gamepad: <kbd className="px-2 py-0.5 rounded bg-black border border-white/20 text-orange-300 font-black">Y</kbd> Plajah Dock</span>
          <span>•</span>
          <span><kbd className="px-2 py-0.5 rounded bg-black border border-white/20 text-pink-300 font-black">LB/RB</kbd> Switch Tab</span>
        </div>
      </div>

      {/* ================= CONTROLLER PROMPTS FOOTER ================= */}
      <footer className="mt-4 pt-3.5 border-t border-pink-900/40 flex flex-wrap items-center justify-between gap-4 text-xs sm:text-sm md:text-base font-mono text-gray-300">
        <div className="flex items-center flex-wrap gap-4 sm:gap-6">
          <span className="flex items-center gap-2"><kbd className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-black">A</kbd> <span className="font-bold">Play / Select</span></span>
          <span className="flex items-center gap-2"><kbd className="px-2.5 py-1 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 font-black">B</kbd> <span className="font-bold">Back</span></span>
          <span className="flex items-center gap-2"><kbd className="px-2.5 py-1 rounded-lg bg-sky-500/20 border border-sky-500/40 text-sky-300 font-black">X</kbd> <span className="font-bold">Rescan PC</span></span>
          <span className="flex items-center gap-2"><kbd className="px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 font-black">Y</kbd> <span className="font-bold">Plajah Dock</span></span>
          <span className="flex items-center gap-2"><kbd className="px-2.5 py-1 rounded-lg bg-purple-500/20 border border-purple-500/40 text-purple-300 font-black">V</kbd> <span className="font-bold">Couch/Desk</span></span>
        </div>
        <div className="text-sm sm:text-base font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-orange-300">
          The Plajah FSE • 10-Foot Living Room Console
        </div>
      </footer>

      {/* ================= COMMAND SPLIT SERVICES QUICK LAUNCHER MODAL ================= */}
      {showCommandSplit && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-2xl p-6 flex items-center justify-center">
          <div className="w-full max-w-5xl rounded-3xl border-2 border-pink-500/50 bg-zinc-950/95 p-6 flex flex-col gap-5 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500 flex items-center justify-center font-black text-white text-base">P</div>
                <div>
                  <h3 className="text-xl sm:text-2xl font-black text-white">The Plajah FSE — Command Split Navigator</h3>
                  <p className="text-xs sm:text-sm text-gray-400">Jump directly to any platform destination</p>
                </div>
              </div>
              <button
                onClick={() => setShowCommandSplit(false)}
                className="px-3.5 py-1.5 rounded-xl bg-white/10 text-xs sm:text-sm font-bold text-gray-200 hover:text-white"
              >
                ✕ Close <kbd className="ml-1 px-1.5 py-0.5 rounded bg-black text-[10px] font-mono text-pink-300">Esc</kbd>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs sm:text-sm">
              <div className="rounded-2xl bg-purple-950/30 border border-purple-800/40 p-4 flex flex-col gap-2">
                <span className="text-xs sm:text-sm font-black uppercase text-pink-400 tracking-wider">🧭 Discover</span>
                <div className="space-y-1">
                  {['Front Row Stadium', 'Plajah Feed', 'Global Worlds'].map(s => (
                    <button key={s} onClick={() => { setShowCommandSplit(false); onNavigateToService?.(s); }} className="w-full text-left p-2 rounded-lg hover:bg-pink-600/20 text-gray-200 font-semibold">{s}</button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl bg-purple-950/30 border border-purple-800/40 p-4 flex flex-col gap-2">
                <span className="text-xs sm:text-sm font-black uppercase text-orange-400 tracking-wider">🎬 Entertainment</span>
                <div className="space-y-1">
                  <button onClick={() => { setShowCommandSplit(false); setActiveTab('CHORA'); }} className="w-full text-left p-2 rounded-lg hover:bg-orange-600/20 text-gray-200 font-semibold">Chora Music</button>
                  <button onClick={() => { setShowCommandSplit(false); setActiveTab('THEATRE'); }} className="w-full text-left p-2 rounded-lg hover:bg-orange-600/20 text-gray-200 font-semibold">Taleo Movies</button>
                  <button onClick={() => { setShowCommandSplit(false); setActiveTab('GAMES'); }} className="w-full text-left p-2 rounded-lg hover:bg-orange-600/20 text-gray-200 font-semibold">Game Hub</button>
                </div>
              </div>

              <div className="rounded-2xl bg-purple-950/30 border border-purple-800/40 p-4 flex flex-col gap-2">
                <span className="text-xs sm:text-sm font-black uppercase text-emerald-400 tracking-wider">⚽ Sports & News</span>
                <div className="space-y-1">
                  {['Plajah Sports Arena', 'Sports Newsstand', 'Fitness HQ'].map(s => (
                    <button key={s} onClick={() => { setShowCommandSplit(false); onNavigateToService?.(s); }} className="w-full text-left p-2 rounded-lg hover:bg-emerald-600/20 text-gray-200 font-semibold">{s}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default PlajahFseView;
