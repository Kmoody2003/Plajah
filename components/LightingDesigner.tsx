import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ArrowLeft, Lightbulb, Plus, Settings, Zap, Play, Pause, ChevronRight, Sparkles, Sun, Moon, Monitor, Wifi } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGlobalPlayer } from '../contexts/GlobalPlayerContext';
import { createDefaultShow, hslToCSS, type LightShow, type Scene, type LDColor } from '../services/lightShowEngine';

interface LightingDesignerProps {
  onClose: () => void;
}

export default function LightingDesigner({ onClose }: LightingDesignerProps) {
  const { currentTrack, isPlaying } = useGlobalPlayer();
  const [show, setShow] = useState<LightShow>(createDefaultShow());
  const [activeSceneId, setActiveSceneId] = useState<string>(show.scenes[0]?.id || '');
  const [intensity, setIntensity] = useState<number>(100);
  const [speed, setSpeed] = useState<number>(1.0);
  
  const activeScene = show.scenes.find(s => s.id === activeSceneId) || show.scenes[0];

  // Stage preview gradient based on active scene
  const stageGradient = useMemo(() => {
    if (!activeScene || activeScene.palette.length === 0) return 'radial-gradient(circle at 50% 50%, #111 0%, #000 100%)';
    // Create a beautiful pulsing glow
    return `radial-gradient(circle at 50% 30%, ${hslToCSS(activeScene.palette[0])}33 0%, ${activeScene.palette.length > 1 ? hslToCSS(activeScene.palette[1]) : '#000'}11 50%, #000 100%)`;
  }, [activeScene]);

  const handleSceneSelect = (sceneId: string) => {
    setActiveSceneId(sceneId);
  };

  const togglePartyMode = () => {
    setShow(prev => ({ ...prev, partyMode: !prev.partyMode }));
  };

  return (
    <div className="flex flex-col h-full w-full bg-black text-white overflow-hidden font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-900 bg-black/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-4">
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft size={20} className="text-gray-400" />
          </button>
          
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#FF8C00]/20 rounded-lg">
              <Lightbulb size={24} className="text-[#FF8C00]" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                LD
                <span className="text-xs font-normal text-gray-500 hidden sm:inline-block">Light is the invisible actor.</span>
              </h1>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-900 border border-gray-800">
            <Wifi size={14} className="text-green-500" />
            <span className="text-xs font-medium text-gray-300">0 Connected</span>
          </div>
          <button className="p-2 rounded-full hover:bg-gray-800 transition-colors">
            <Settings size={20} className="text-gray-400" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
        
        {/* Left Panel - Stage (60%) */}
        <div className="flex-1 lg:w-[60%] flex flex-col relative border-r border-gray-900">
          
          {/* Stage Preview */}
          <div className="flex-1 relative overflow-hidden bg-[#050505] flex flex-col items-center justify-center">
            {/* Ambient glow simulation */}
            <motion.div 
              className="absolute inset-0 z-0"
              animate={{ 
                background: stageGradient,
                opacity: intensity / 100
              }}
              transition={{ duration: 1.5, ease: "easeInOut" }}
            />
            
            {/* Stage content */}
            <div className="z-10 text-center flex flex-col items-center">
              <div className="w-64 h-32 border-b-2 border-gray-800/50 mb-8 relative">
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-transparent via-gray-500 to-transparent blur-sm"></div>
              </div>
              <h2 className="text-gray-500 font-light tracking-[0.2em] text-sm uppercase">Stage Preview</h2>
            </div>
          </div>

          {/* Timeline & Player Bar */}
          <div className="h-32 bg-black border-t border-gray-900 p-4 flex flex-col justify-end relative z-10">
            {currentTrack ? (
              <div className="mb-2 flex items-center gap-3">
                <div className="w-10 h-10 rounded-md bg-gray-800 flex items-center justify-center overflow-hidden">
                  {currentTrack.thumbnailUrl ? (
                    <img src={currentTrack.thumbnailUrl} alt="Art" className="w-full h-full object-cover" />
                  ) : (
                    <Play size={16} className="text-gray-400" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{currentTrack.title}</p>
                  <p className="text-xs text-gray-500">{currentTrack.artist}</p>
                </div>
              </div>
            ) : (
              <div className="mb-2">
                <p className="text-xs text-gray-600">No track playing</p>
              </div>
            )}
            
            {/* Waveform placeholder */}
            <div className="w-full h-8 bg-gray-900/50 rounded-md relative flex items-center px-2 border border-gray-800">
              <div className="absolute inset-y-0 left-0 bg-[#FF8C00]/20 rounded-l-md w-1/3"></div>
              <div className="absolute left-1/3 w-[2px] h-full bg-[#FF8C00] shadow-[0_0_10px_#FF8C00]"></div>
              
              {/* Beat markers */}
              <div className="w-full flex justify-between items-center z-10 px-4 opacity-50">
                {[...Array(20)].map((_, i) => (
                  <div key={i} className={`w-1 h-1 rounded-full ${i % 4 === 0 ? 'bg-white' : 'bg-gray-600'}`}></div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel - Board (40%) */}
        <div className="lg:w-[40%] flex flex-col bg-[#0A0A0A] overflow-y-auto">
          
          {/* Party Mode Toggle */}
          <div className="p-6 border-b border-gray-900">
            <button
              onClick={togglePartyMode}
              className={`w-full py-4 rounded-xl flex items-center justify-center gap-3 transition-all duration-300 relative overflow-hidden ${
                show.partyMode 
                  ? 'bg-gradient-to-r from-[#FF8C00]/20 to-[#D40055]/20 border border-[#FF8C00]/50 text-white' 
                  : 'bg-gray-900 border border-gray-800 text-gray-400'
              }`}
            >
              <Zap size={20} className={show.partyMode ? "text-[#FF8C00]" : ""} />
              <span className="font-semibold tracking-wide">Sync My Lights</span>
              
              {show.partyMode && (
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-[#FF8C00]/10 to-[#D40055]/10"
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                />
              )}
            </button>
          </div>

          <div className="p-6 space-y-8 flex-1">
            {/* Fixture Map */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Fixture Map</h3>
                <button className="text-gray-500 hover:text-white transition-colors">
                  <Plus size={16} />
                </button>
              </div>
              <div className="h-32 rounded-xl bg-gray-900/50 border border-gray-800/50 p-4 grid grid-cols-4 gap-2 place-items-center">
                {/* Placeholders */}
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="w-10 h-10 rounded-full border border-dashed border-gray-700 flex items-center justify-center text-gray-700 hover:border-[#FF8C00] hover:text-[#FF8C00] transition-colors cursor-pointer">
                    <Monitor size={14} />
                  </div>
                ))}
              </div>
            </div>

            {/* Master Controls */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Master</h3>
              <div className="space-y-4 p-4 rounded-xl bg-gray-900/30 border border-gray-800/30">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Intensity</span>
                    <span>{intensity}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" max="100" 
                    value={intensity}
                    onChange={(e) => setIntensity(Number(e.target.value))}
                    className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-[#FF8C00]"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Speed</span>
                    <span>{speed.toFixed(1)}x</span>
                  </div>
                  <input 
                    type="range" 
                    min="0.5" max="2.0" step="0.1"
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                    className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-[#D40055]"
                  />
                </div>
              </div>
            </div>

            {/* Color Palette */}
            {activeScene && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Palette</h3>
                <div className="flex h-8 rounded-lg overflow-hidden border border-gray-800">
                  {activeScene.palette.map((color, i) => (
                    <div 
                      key={i} 
                      className="flex-1"
                      style={{ backgroundColor: hslToCSS(color) }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Scene Presets */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Scenes</h3>
              <div className="grid grid-cols-2 gap-3">
                {show.scenes.map(scene => (
                  <motion.button
                    key={scene.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleSceneSelect(scene.id)}
                    className={`p-4 rounded-xl border text-left flex flex-col gap-2 transition-colors ${
                      activeSceneId === scene.id 
                        ? 'bg-gray-800 border-gray-600' 
                        : 'bg-gray-900 border-gray-800 hover:bg-gray-800/80'
                    }`}
                  >
                    <span className="text-sm font-medium text-white">{scene.name}</span>
                    <div className="flex gap-1">
                      {scene.palette.map((c, i) => (
                        <div key={i} className="w-3 h-3 rounded-full" style={{ backgroundColor: hslToCSS(c) }} />
                      ))}
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
          </div>

          {/* AI Suggestion Bar */}
          <div className="p-4 bg-[#FF8C00]/5 border-t border-[#FF8C00]/10 flex items-center gap-3">
            <Sparkles size={16} className="text-[#FF8C00]" />
            <span className="text-xs font-medium text-[#FF8C00]/80">AI: Ready to design your show. Play a track to begin.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
