import React from 'react';
import { CameraViewMode, PlayStyleMode, SkillLevel, WeatherPreset } from '../types';
import { CloudRain, Moon, Sun, Snowflake, Sparkles, Video, X, Box, Flame } from 'lucide-react';

interface StadiumCreatorModalProps {
  currentWeather: WeatherPreset;
  currentCamera: CameraViewMode;
  playerMode?: 'ATHLETE' | 'BLOCK';
  playStyle?: PlayStyleMode;
  skillLevel?: SkillLevel;
  onSelectWeather: (weather: WeatherPreset) => void;
  onSelectCamera: (cam: CameraViewMode) => void;
  onSelectPlayerMode?: (mode: 'ATHLETE' | 'BLOCK') => void;
  onSelectPlayStyle?: (style: PlayStyleMode) => void;
  onSelectSkillLevel?: (skill: SkillLevel) => void;
  onClose: () => void;
}

export const StadiumCreatorModal: React.FC<StadiumCreatorModalProps> = ({
  currentWeather,
  currentCamera,
  playerMode = 'ATHLETE',
  playStyle = 'SIMULATION',
  skillLevel = 'PRO',
  onSelectWeather,
  onSelectCamera,
  onSelectPlayerMode,
  onSelectPlayStyle,
  onSelectSkillLevel,
  onClose,
}) => {
  const weatherOptions: { id: WeatherPreset; name: string; icon: React.ReactNode; desc: string }[] = [
    { id: 'AURORA', name: 'Aurora Prime Time', icon: <Sparkles className="text-purple-400" size={18} />, desc: 'Signature SOL Aurora curtains over Firstlight Citadel' },
    { id: 'DAY', name: 'Bright Sunday Day', icon: <Sun className="text-sky-300" size={18} />, desc: 'Crisp blue skies, bright turf & sharp daylight shadows' },
    { id: 'SUNSET', name: 'Golden Hour', icon: <Sun className="text-amber-400" size={18} />, desc: 'Warm late-afternoon stadium glow across the grass' },
    { id: 'NIGHT', name: 'Night Floodlights', icon: <Moon className="text-sky-400" size={18} />, desc: 'Prime-time dark sky with blazing catwalk light banks' },
    { id: 'RAIN', name: 'Heavy Rain & Slick Turf', icon: <CloudRain className="text-blue-400" size={18} />, desc: 'Falling rain streaks & lowered wet-turf traction' },
    { id: 'SNOW', name: 'Winter Snow Bowl', icon: <Snowflake className="text-indigo-200" size={18} />, desc: 'Blizzard snow flurries & slippery frozen field cuts' },
  ];

  const cameraOptions: { id: CameraViewMode; name: string; desc: string }[] = [
    { id: 'BEHIND_QB', name: 'Pro Action Cam (Behind QB)', desc: 'Dynamic Madden-style action cam tracking QB, carrier & kicks' },
    { id: 'BROADCAST', name: 'TV Broadcast Sideline', desc: 'Authentic 50-yard sideline television broadcast angle' },
    { id: 'ALL_22', name: 'All-22 Coach Sky Cam', desc: 'Wide tactical overhead view showing all 22 players & coverages' },
    { id: 'FIRST_PERSON', name: 'Helmet POV Cam', desc: 'First-person quarterback / user-defender eyes on the turf' },
  ];

  return (
    <div id="stadium-creator-modal" className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md select-none font-sans">
      <div className="relative w-full max-w-2xl p-6 sm:p-7 rounded-3xl bg-slate-950/95 backdrop-blur-2xl border border-white/20 shadow-2xl flex flex-col gap-5 text-white max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div>
            <h2 className="text-2xl font-black font-['Rajdhani'] uppercase tracking-wider text-white">
              Stadium, Camera &amp; Live Tuning
            </h2>
            <p className="text-xs text-slate-400">
              Switch atmosphere, camera, Pro vs Blocky characters, and skill tier live mid-game
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-900 border border-white/15 text-slate-400 hover:text-white cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Live Mode / Character / Skill Switchers */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {onSelectPlayStyle && (
            <div className="p-3 rounded-2xl bg-slate-900/75 border border-white/10 space-y-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-amber-300 flex items-center gap-1">
                <Flame size={12} /> Gameplay Style
              </div>
              <div className="grid grid-cols-2 gap-1">
                {(['SIMULATION', 'ARCADE'] as PlayStyleMode[]).map((st) => (
                  <button
                    key={st}
                    onClick={() => onSelectPlayStyle(st)}
                    className={`py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer ${
                      playStyle === st ? 'bg-orange-500/25 border-orange-400 text-orange-200' : 'bg-slate-950 border-white/10 text-slate-400'
                    }`}
                  >
                    {st === 'SIMULATION' ? 'SOL Sim' : 'Arcade'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {onSelectPlayerMode && (
            <div className="p-3 rounded-2xl bg-slate-900/75 border border-white/10 space-y-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-cyan-300 flex items-center gap-1">
                <Box size={12} /> Character Models
              </div>
              <div className="grid grid-cols-2 gap-1">
                <button
                  onClick={() => onSelectPlayerMode('ATHLETE')}
                  className={`py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer ${
                    playerMode === 'ATHLETE' ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200' : 'bg-slate-950 border-white/10 text-slate-400'
                  }`}
                >
                  Pro Teams
                </button>
                <button
                  onClick={() => onSelectPlayerMode('BLOCK')}
                  className={`py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer ${
                    playerMode === 'BLOCK' ? 'bg-amber-500/25 border-amber-400 text-amber-200' : 'bg-slate-950 border-white/10 text-slate-400'
                  }`}
                >
                  Blocky
                </button>
              </div>
            </div>
          )}

          {onSelectSkillLevel && (
            <div className="p-3 rounded-2xl bg-slate-900/75 border border-white/10 space-y-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-purple-300">Skill Tier</div>
              <select
                value={skillLevel}
                onChange={(e) => onSelectSkillLevel(e.target.value as SkillLevel)}
                className="w-full bg-slate-950 border border-white/15 rounded-lg px-2 py-1.5 text-xs font-bold text-white"
              >
                <option value="ROOKIE">Rookie (Newcomer)</option>
                <option value="PRO">Pro (Balanced)</option>
                <option value="ALL_PRO">All-Pro (Veteran)</option>
                <option value="LEGEND">Elohim Legend</option>
              </select>
            </div>
          )}
        </div>

        {/* Weather */}
        <div className="flex flex-col gap-2.5">
          <label className="text-xs font-black uppercase tracking-wider text-cyan-300 font-['Chakra_Petch']">
            Stadium Atmosphere &amp; Weather Physics
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {weatherOptions.map((opt) => (
              <button
                key={opt.id}
                onClick={() => onSelectWeather(opt.id)}
                className={`p-3 rounded-2xl text-left border transition cursor-pointer flex items-start gap-3 ${
                  currentWeather === opt.id
                    ? 'bg-purple-950/70 border-cyan-400 ring-1 ring-cyan-400'
                    : 'bg-slate-900/60 border-white/10 hover:border-white/25'
                }`}
              >
                <div className="p-2 rounded-xl bg-slate-800/80 border border-white/10 shrink-0">{opt.icon}</div>
                <div>
                  <div className="text-sm font-bold font-['Rajdhani'] text-white">{opt.name}</div>
                  <div className="text-[11px] text-slate-400 leading-snug mt-0.5">{opt.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Camera */}
        <div className="flex flex-col gap-2.5">
          <label className="text-xs font-black uppercase tracking-wider text-amber-300 font-['Chakra_Petch'] flex items-center gap-1.5">
            <Video size={14} /> Broadcast Camera Angle
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {cameraOptions.map((cam) => (
              <button
                key={cam.id}
                onClick={() => onSelectCamera(cam.id)}
                className={`p-3 rounded-2xl text-left border transition cursor-pointer ${
                  currentCamera === cam.id
                    ? 'bg-amber-950/60 border-amber-400 ring-1 ring-amber-400'
                    : 'bg-slate-900/60 border-white/10 hover:border-white/25'
                }`}
              >
                <div className="text-sm font-bold font-['Rajdhani'] text-white">{cam.name}</div>
                <div className="text-[11px] text-slate-400 leading-snug mt-0.5">{cam.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-[#FF8C00] to-[#D40055] text-slate-950 font-black font-['Rajdhani'] uppercase tracking-wider shadow-lg cursor-pointer transition active:scale-95"
        >
          APPLY &amp; RESUME GAME
        </button>
      </div>
    </div>
  );
};
