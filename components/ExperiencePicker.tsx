import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Music2, BookOpen, Film, Zap, Video, FlaskConical, Shuffle, Star } from 'lucide-react';
import { ExperienceMode } from '../types';

interface ExperienceOption {
  mode: ExperienceMode;
  label: string;
  tagline: string;
  description: string;
  icon: any;
  gradient: string;
  accentColor: string;
  badge?: string;
}

const EXPERIENCES: ExperienceOption[] = [
  {
    mode: 'RAW_DOG',
    label: 'Raw Dog',
    tagline: 'The Full Universe',
    description: "No filters. No limits. Every tool, every section, every experience — all of Plajah at full blast from day one.",
    icon: Shuffle,
    gradient: 'from-[#6B0099] via-[#D40055] to-[#FF8C00]',
    accentColor: '#FF8C00',
    badge: 'Full Experience',
  },
  {
    mode: 'MUSIC_CREATOR',
    label: 'Music Creator',
    tagline: 'Built for the Beat',
    description: "Music tools and discovery front and center. Other sections stay quiet until you're ready to explore them.",
    icon: Music2,
    gradient: 'from-[#1DB954] via-[#148040] to-[#0A3D1F]',
    accentColor: '#1DB954',
  },
  {
    mode: 'WRITER',
    label: 'Writer',
    tagline: 'The Lorea Experience',
    description: "Start at the bookshelf. Latest releases prioritize books, journals, and articles. Your writing studio is ready.",
    icon: BookOpen,
    gradient: 'from-[#8B4513] via-[#A0522D] to-[#D2691E]',
    accentColor: '#D2691E',
  },
  {
    mode: 'SPORTS_FAN',
    label: 'Sports Fan',
    tagline: 'Plajah Sports First',
    description: "Drop straight into your teams, live scores, highlights, and sports news. The arena is already open.",
    icon: Zap,
    gradient: 'from-[#0052CC] via-[#003d99] to-[#001f4d]',
    accentColor: '#4C9BE8',
  },
  {
    mode: 'STORY_TELLER',
    label: 'Story Teller',
    tagline: 'Enter Taleo',
    description: "Film and TV are your home base. Dive into movies, series, and original content from creators worldwide.",
    icon: Film,
    gradient: 'from-[#1a1a2e] via-[#16213e] to-[#0f3460]',
    accentColor: '#e94560',
  },
  {
    mode: 'CONTENT_CREATOR',
    label: 'Content Creator',
    tagline: 'Reelo is Waiting',
    description: "Video-first. Short films, vlogs, and original content — your creator tools are ready and your feed starts rolling.",
    icon: Video,
    gradient: 'from-[#FF0050] via-[#CC0040] to-[#660020]',
    accentColor: '#FF0050',
  },
  {
    mode: 'SCIENCE_ENGINEER',
    label: 'Science & Engineer',
    tagline: 'Welcome to Plajah Labs',
    description: "A dedicated home for the scientific and engineering community. Research tools, academic resources, and STEM connections await.",
    icon: FlaskConical,
    gradient: 'from-[#00B4D8] via-[#0077B6] to-[#03045E]',
    accentColor: '#00B4D8',
    badge: 'New',
  },
];

interface ExperiencePickerProps {
  onPick: (mode: ExperienceMode) => void;
}

const ExperiencePicker: React.FC<ExperiencePickerProps> = ({ onPick }) => {
  const [selected, setSelected] = useState<ExperienceMode | null>(null);

  const handleSelect = (mode: ExperienceMode) => {
    if (selected) return;
    setSelected(mode);
    setTimeout(() => onPick(mode), 480);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[300] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-4 lg:p-8 overflow-y-auto"
      >
        <div className="w-full max-w-6xl py-8">
          {/* Header */}
          <motion.div
            initial={{ y: -24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.08 }}
            className="text-center mb-10"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 mb-5">
              <Star size={10} className="text-small-orange" />
              <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40">Choose Your Experience</span>
            </div>
            <h1 className="text-4xl lg:text-7xl font-black uppercase tracking-tighter text-white leading-[0.9] mb-4">
              How do you want to<br />
              <span className="bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] bg-clip-text text-transparent">
                experience Plajah?
              </span>
            </h1>
            <p className="text-white/35 text-sm max-w-md mx-auto">
              Pick your mode — you can switch it up anytime in your settings.
            </p>
          </motion.div>

          {/* Cards grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {EXPERIENCES.map((exp, i) => {
              const Icon = exp.icon;
              const isSelected = selected === exp.mode;
              const isDimmed = selected !== null && !isSelected;

              return (
                <motion.button
                  key={exp.mode}
                  initial={{ y: 36, opacity: 0 }}
                  animate={{ y: 0, opacity: isDimmed ? 0.3 : 1 }}
                  transition={{ delay: 0.12 + i * 0.055, type: 'spring', damping: 22, stiffness: 260 }}
                  onClick={() => handleSelect(exp.mode)}
                  className={`group relative text-left rounded-[1.5rem] p-5 border overflow-hidden
                    transition-all duration-300 cursor-pointer
                    ${isSelected
                      ? 'border-white/30 scale-[0.97]'
                      : 'border-white/8 hover:border-white/18 hover:scale-[1.02] hover:-translate-y-0.5'
                    }
                    bg-white/[0.04]
                  `}
                >
                  {/* Gradient hover glow */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${exp.gradient} transition-opacity duration-300
                    ${isSelected ? 'opacity-20' : 'opacity-0 group-hover:opacity-8'}`}
                  />

                  {/* Badge */}
                  {exp.badge && (
                    <span className="absolute top-3 right-3 px-2 py-0.5 bg-small-orange text-white text-[7px] font-black uppercase tracking-widest rounded-full">
                      {exp.badge}
                    </span>
                  )}

                  {/* Icon */}
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110 relative z-10"
                    style={{
                      backgroundColor: `${exp.accentColor}18`,
                      border: `1px solid ${exp.accentColor}35`,
                    }}
                  >
                    <Icon size={18} style={{ color: exp.accentColor }} />
                  </div>

                  {/* Text */}
                  <div className="relative z-10">
                    <p
                      className="text-[8px] font-black uppercase tracking-[0.25em] mb-1"
                      style={{ color: exp.accentColor }}
                    >
                      {exp.tagline}
                    </p>
                    <h3 className="text-sm font-black text-white mb-2 leading-tight">{exp.label}</h3>
                    <p className="text-[10px] text-white/35 leading-relaxed">{exp.description}</p>
                  </div>

                  {/* Selected overlay */}
                  {isSelected && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="absolute inset-0 rounded-[1.5rem] flex items-center justify-center"
                      style={{ backgroundColor: `${exp.accentColor}12`, border: `1.5px solid ${exp.accentColor}50` }}
                    >
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', damping: 14, stiffness: 260 }}
                        className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-black shadow-2xl"
                        style={{ backgroundColor: exp.accentColor }}
                      >
                        ✓
                      </motion.div>
                    </motion.div>
                  )}
                </motion.button>
              );
            })}
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-center text-[9px] text-white/15 uppercase tracking-[0.3em] font-bold mt-8"
          >
            You can customize your experience anytime in Settings
          </motion.p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ExperiencePicker;
