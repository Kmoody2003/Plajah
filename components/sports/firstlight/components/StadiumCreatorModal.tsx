import React from 'react';
import { CameraViewMode, WeatherPreset } from '../types';
import { CloudRain, Moon, Sun, Snowflake, Sparkles, Video, X } from 'lucide-react';

interface StadiumCreatorModalProps {
  currentWeather: WeatherPreset;
  currentCamera: CameraViewMode;
  onSelectWeather: (weather: WeatherPreset) => void;
  onSelectCamera: (cam: CameraViewMode) => void;
  onClose: () => void;
}

export const StadiumCreatorModal: React.FC<StadiumCreatorModalProps> = ({
  currentWeather,
  currentCamera,
  onSelectWeather,
  onSelectCamera,
  onClose,
}) => {
  const weatherOptions: { id: WeatherPreset; name: string; icon: React.ReactNode; desc: string }[] = [
    {
      id: 'AURORA',
      name: 'Aurora Borealis Sunset',
      icon: <Sparkles className="text-purple-400" size={20} />,
      desc: 'Twilight sky with magenta/emerald northern lights (Project Firstlight signature)',
    },
    {
      id: 'NIGHT',
      name: 'Night Lights',
      icon: <Moon className="text-sky-400" size={20} />,
      desc: 'Dark dome stadium atmosphere with high-intensity halogen floodlights',
    },
    {
      id: 'SUNSET',
      name: 'Golden Hour',
      icon: <Sun className="text-amber-400" size={20} />,
      desc: 'Warm sunset lighting casting long shadows across the turf',
    },
    {
      id: 'RAIN',
      name: 'Heavy Rain & Wet Turf',
      icon: <CloudRain className="text-blue-400" size={20} />,
      desc: 'Falling rain streaks, glossy wet turf reflections, damp stadium mist',
    },
    {
      id: 'SNOW',
      name: 'Winter Snow Game',
      icon: <Snowflake className="text-indigo-200" size={20} />,
      desc: 'Falling snowflakes, frosty turf, cold breath atmosphere',
    },
  ];

  const cameraOptions: { id: CameraViewMode; name: string; desc: string }[] = [
    {
      id: 'BEHIND_QB',
      name: '3rd-Person Dynamic QB Cam',
      desc: 'Low-angle action cam behind quarterback with responsive pocket tracking (Default)',
    },
    {
      id: 'BROADCAST',
      name: 'Sideline Broadcast Angle',
      desc: 'Elevated 50-yard line TV camera giving high-contrast broadcast view',
    },
    {
      id: 'FIRST_PERSON',
      name: 'Helmet POV (First Person)',
      desc: 'Eyes of the quarterback inside the pocket making real-time reads',
    },
    {
      id: 'ALL_22',
      name: 'All-22 High End Zone Cam',
      desc: 'Wide tactical film camera showing all 22 players on field simultaneously',
    },
  ];

  return (
    <div id="stadium-creator-modal" className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md select-none font-sans">
      <div className="relative w-full max-w-2xl p-6 sm:p-8 rounded-3xl bg-slate-950/90 backdrop-blur-2xl border border-white/20 shadow-2xl flex flex-col gap-6 text-white max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold font-['Rajdhani'] uppercase tracking-wider text-white">
              Stadium & Atmosphere Creator
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Customize real-time 3D environment lighting, weather physics, and camera angles
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-900 border border-white/15 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Weather & Sky Presets */}
        <div className="flex flex-col gap-3">
          <label className="text-sm font-bold uppercase tracking-wider text-cyan-300 font-['Rajdhani']">
            Atmospheric Weather & Lighting Preset
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {weatherOptions.map((opt) => (
              <button
                key={opt.id}
                onClick={() => onSelectWeather(opt.id)}
                className={`p-3 rounded-2xl text-left border transition cursor-pointer flex items-start gap-3 ${
                  currentWeather === opt.id
                    ? 'bg-purple-950/70 border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.4)] ring-1 ring-cyan-400'
                    : 'bg-slate-900/60 border-white/10 hover:border-white/25'
                }`}
              >
                <div className="p-2 rounded-xl bg-slate-800/80 border border-white/10 shrink-0">
                  {opt.icon}
                </div>
                <div>
                  <div className="text-sm font-bold font-['Rajdhani'] text-white">{opt.name}</div>
                  <div className="text-[11px] text-slate-400 leading-snug mt-0.5">{opt.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Camera Views */}
        <div className="flex flex-col gap-3">
          <label className="text-sm font-bold uppercase tracking-wider text-amber-300 font-['Rajdhani'] flex items-center gap-2">
            <Video size={16} />
            <span>Camera Perspective</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {cameraOptions.map((cam) => (
              <button
                key={cam.id}
                onClick={() => onSelectCamera(cam.id)}
                className={`p-3 rounded-2xl text-left border transition cursor-pointer flex flex-col justify-between ${
                  currentCamera === cam.id
                    ? 'bg-amber-950/60 border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.3)] ring-1 ring-amber-400'
                    : 'bg-slate-900/60 border-white/10 hover:border-white/25'
                }`}
              >
                <div className="text-sm font-bold font-['Rajdhani'] text-white">{cam.name}</div>
                <div className="text-[11px] text-slate-400 leading-snug mt-1">{cam.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Done button */}
        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-extrabold font-['Rajdhani'] uppercase tracking-wider shadow-lg cursor-pointer transition active:scale-95"
        >
          APPLY & RESUME SIMULATION
        </button>
      </div>
    </div>
  );
};
