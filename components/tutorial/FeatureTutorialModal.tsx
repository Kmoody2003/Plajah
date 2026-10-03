import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, ChevronRight, ChevronLeft, Play, Sparkles, CheckCircle2,
  MousePointer, Keyboard, Eye, ExternalLink, ArrowUp, ArrowDown,
  ArrowLeft, ArrowRight, Layers
} from 'lucide-react';
import { FeatureTutorial, TutorialStep, TutorialMarkup } from '../../services/tutorial/tutorialRegistry';

interface FeatureTutorialModalProps {
  tutorial: FeatureTutorial | null;
  onClose: () => void;
  onLaunchFeature?: (featureId: string) => void;
}

export const FeatureTutorialModal: React.FC<FeatureTutorialModalProps> = ({
  tutorial,
  onClose,
  onLaunchFeature
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  useEffect(() => {
    setCurrentStepIndex(0);
  }, [tutorial]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!tutorial) return;
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
        if (currentStepIndex < tutorial.steps.length - 1) {
          setCurrentStepIndex(prev => prev + 1);
        }
      } else if (e.key === 'ArrowLeft') {
        if (currentStepIndex > 0) {
          setCurrentStepIndex(prev => prev - 1);
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tutorial, currentStepIndex, onClose]);

  if (!tutorial) return null;

  const currentStep: TutorialStep = tutorial.steps[currentStepIndex];
  const isLastStep = currentStepIndex === tutorial.steps.length - 1;

  const renderArrow = (markup: TutorialMarkup) => {
    const dir = markup.arrowDirection || 'down';
    return (
      <div
        key={markup.id}
        className="absolute z-30 flex items-center gap-2 pointer-events-none transform -translate-x-1/2 -translate-y-1/2"
        style={{ left: `${markup.x}%`, top: `${markup.y}%` }}
      >
        <div className="relative flex flex-col items-center">
          <div className="bg-[#ff8c00] text-black font-black text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-full shadow-[0_0_20px_rgba(255,140,0,0.6)] flex items-center gap-1.5 whitespace-nowrap border border-white/40">
            <MousePointer size={12} className="animate-bounce" />
            {markup.label || 'Click here'}
          </div>
          <div className="text-[#ff8c00] mt-1 filter drop-shadow-[0_0_8px_rgba(255,140,0,0.8)]">
            {dir === 'down' && <ArrowDown size={22} strokeWidth={3} className="animate-pulse" />}
            {dir === 'up' && <ArrowUp size={22} strokeWidth={3} className="animate-pulse" />}
            {dir === 'left' && <ArrowLeft size={22} strokeWidth={3} className="animate-pulse" />}
            {dir === 'right' && <ArrowRight size={22} strokeWidth={3} className="animate-pulse" />}
          </div>
        </div>
      </div>
    );
  };

  const renderSpotlight = (markup: TutorialMarkup) => {
    const isCircle = markup.shape === 'spotlight-circle';
    const color = markup.color || '#ff8c00';
    return (
      <div
        key={markup.id}
        className="absolute z-20 pointer-events-none transition-all duration-500"
        style={{
          left: `${markup.x}%`,
          top: `${markup.y}%`,
          width: `${markup.width || 30}%`,
          height: `${markup.height || 30}%`,
        }}
      >
        <div
          className={`w-full h-full border-2 ${isCircle ? 'rounded-full' : 'rounded-2xl'} animate-pulse shadow-2xl relative`}
          style={{
            borderColor: color,
            boxShadow: `0 0 30px ${color}66, inset 0 0 20px ${color}33`,
            backgroundColor: `${color}11`
          }}
        >
          {markup.label && (
            <span
              className="absolute -top-3 left-4 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-black rounded-md shadow-md"
              style={{ backgroundColor: color }}
            >
              {markup.label}
            </span>
          )}
        </div>
      </div>
    );
  };

  const renderPulseBadge = (markup: TutorialMarkup) => {
    const color = markup.color || '#10b981';
    return (
      <div
        key={markup.id}
        className="absolute z-30 pointer-events-none transform -translate-x-1/2 -translate-y-1/2 flex items-center gap-2"
        style={{ left: `${markup.x}%`, top: `${markup.y}%` }}
      >
        <div className="relative flex items-center justify-center">
          <span
            className="absolute w-8 h-8 rounded-full opacity-75 animate-ping"
            style={{ backgroundColor: color }}
          />
          <span
            className="relative w-4 h-4 rounded-full border-2 border-white shadow-lg"
            style={{ backgroundColor: color }}
          />
        </div>
        {markup.label && (
          <div
            className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider text-white backdrop-blur-md border border-white/20 shadow-xl"
            style={{ backgroundColor: `${color}cc` }}
          >
            {markup.label}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-8 bg-black/85 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="relative w-full max-w-5xl bg-[#0e0a19] border border-white/15 rounded-[2.5rem] shadow-[0_25px_80px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col max-h-[92vh]">
        {/* Glow ambient effects */}
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-[#ff8c00]/15 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-[#8b5cf6]/15 rounded-full blur-[100px] pointer-events-none" />

        {/* Modal Header */}
        <div className="relative z-10 flex items-center justify-between px-8 py-5 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#ff8c00] to-[#ff4500] flex items-center justify-center text-white shadow-lg shadow-orange-500/30">
              <Play size={18} fill="currentColor" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#ff8c00]">Interactive Feature Walkthrough</span>
                <span className="text-[10px] text-white/30">•</span>
                <span className="text-[10px] font-bold text-white/50">{tutorial.moduleName}</span>
              </div>
              <h2 className="text-xl font-black uppercase tracking-tight text-white">{tutorial.featureName}</h2>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-mono text-white/50">
              <Keyboard size={12} />
              <span>[←] [→] to step • [Esc] close</span>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Interactive Step Canvas */}
        <div className="relative flex-1 p-6 md:p-8 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
          {/* Visual Simulation Screen */}
          <div className="relative w-full h-[360px] md:h-[420px] rounded-2xl bg-[#07050d] border border-white/10 overflow-hidden shadow-2xl flex items-center justify-center group select-none">
            {/* Background grid texture */}
            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />

            {/* Feature Mockup Scene / Schematic */}
            <div className="absolute inset-0 flex flex-col p-6 pointer-events-none opacity-40">
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80" />
                  <span className="ml-3 text-[11px] font-mono text-white/40">{tutorial.featureId} // workspace active</span>
                </div>
                <div className="flex gap-2">
                  <div className="w-20 h-5 bg-white/10 rounded-md" />
                  <div className="w-12 h-5 bg-white/10 rounded-md" />
                </div>
              </div>
              <div className="flex-1 grid grid-cols-12 gap-4 pt-4">
                <div className="col-span-3 bg-white/5 rounded-xl border border-white/5 p-3 flex flex-col gap-2">
                  <div className="w-full h-4 bg-white/10 rounded" />
                  <div className="w-3/4 h-3 bg-white/5 rounded" />
                  <div className="w-5/6 h-3 bg-white/5 rounded" />
                  <div className="mt-auto w-full h-8 bg-[#ff8c00]/20 rounded border border-[#ff8c00]/30" />
                </div>
                <div className="col-span-6 bg-white/[0.03] rounded-xl border border-white/5 flex flex-col items-center justify-center p-6 relative">
                  <div className="w-24 h-24 rounded-full border border-white/10 flex items-center justify-center text-white/20">
                    <Layers size={36} />
                  </div>
                  <div className="mt-4 text-[11px] font-mono text-white/30 uppercase tracking-widest">{tutorial.moduleName} Viewport</div>
                </div>
                <div className="col-span-3 bg-white/5 rounded-xl border border-white/5 p-3 flex flex-col gap-3">
                  <div className="w-full h-4 bg-white/10 rounded" />
                  <div className="w-full h-20 bg-white/5 rounded-lg border border-white/5" />
                  <div className="w-full h-12 bg-white/5 rounded-lg" />
                </div>
              </div>
            </div>

            {/* Render Step-Specific Vector Markups */}
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="absolute inset-0"
              >
                {currentStep.markups.map(markup => {
                  if (markup.shape === 'arrow') return renderArrow(markup);
                  if (markup.shape === 'spotlight-rect' || markup.shape === 'spotlight-circle') return renderSpotlight(markup);
                  if (markup.shape === 'pulse-badge') return renderPulseBadge(markup);
                  return null;
                })}
              </motion.div>
            </AnimatePresence>

            {/* Center HUD Step Banner */}
            <div className="absolute top-4 right-4 z-40 flex items-center gap-2">
              {currentStep.badges?.map((badge, bIdx) => (
                <span key={bIdx} className="px-3 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/20 text-[9px] font-black uppercase tracking-widest text-[#ff8c00]">
                  {badge}
                </span>
              ))}
              {currentStep.hotkey && (
                <span className="px-3 py-1 rounded-full bg-purple-500/20 backdrop-blur-md border border-purple-500/40 text-[9px] font-mono font-bold text-purple-300">
                  Hotkey: {currentStep.hotkey}
                </span>
              )}
            </div>
          </div>

          {/* Step Detail and Instructions Card */}
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 relative">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-[#ff8c00] text-black font-black text-xs flex items-center justify-center">
                  {currentStep.stepNumber}
                </span>
                <h3 className="text-lg font-black uppercase tracking-wide text-white">
                  {currentStep.title}
                </h3>
              </div>
              <div className="text-[10px] font-black uppercase tracking-widest text-white/40">
                Step {currentStepIndex + 1} of {tutorial.steps.length}
              </div>
            </div>

            <p className="text-white/70 text-sm font-medium leading-relaxed max-w-3xl">
              {currentStep.instruction}
            </p>
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="relative z-10 px-8 py-5 border-t border-white/10 bg-white/[0.02] flex items-center justify-between">
          <div className="flex items-center gap-2">
            {tutorial.steps.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentStepIndex(idx)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  idx === currentStepIndex
                    ? 'w-8 bg-[#ff8c00]'
                    : 'w-2 bg-white/20 hover:bg-white/40'
                }`}
                title={`Jump to step ${idx + 1}`}
              />
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentStepIndex(prev => Math.max(0, prev - 1))}
              disabled={currentStepIndex === 0}
              className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                currentStepIndex === 0
                  ? 'opacity-30 cursor-not-allowed text-white/40'
                  : 'bg-white/5 hover:bg-white/10 text-white'
              }`}
            >
              <ChevronLeft size={16} /> Back
            </button>

            {isLastStep ? (
              <button
                onClick={() => {
                  if (onLaunchFeature) {
                    onLaunchFeature(tutorial.featureId);
                  }
                  onClose();
                }}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all hover:scale-105"
              >
                <CheckCircle2 size={16} /> Finish &amp; Try Feature
              </button>
            ) : (
              <button
                onClick={() => setCurrentStepIndex(prev => Math.min(tutorial.steps.length - 1, prev + 1))}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#ff8c00] to-[#ff4500] hover:from-[#ff991a] hover:to-[#ff551a] text-black font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-orange-500/20 transition-all hover:scale-105"
              >
                Next Step <ChevronRight size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FeatureTutorialModal;
