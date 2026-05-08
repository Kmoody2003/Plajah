import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, ChevronRight, ChevronLeft, Sparkles, 
  Layout, Database, Settings, ShieldCheck, 
  User, HelpCircle, SkipForward
} from 'lucide-react';

interface TourStep {
  title: string;
  description: string;
  icon: any;
  target?: string; // CSS selector for highlighting
}

const tourSteps: TourStep[] = [
  {
    title: "Welcome to the Studio",
    description: "Your ultimate platform for discovering, creating, and connecting with artists worldwide. Let's take a quick tour of your new creative space.",
    icon: Sparkles
  },
  {
    title: "The Navigation Hub",
    description: "Use the sidebar to jump between the Global Archive, your Creator Studio, the Live Hub, and more. Everything is just a click away.",
    icon: Layout
  },
  {
    title: "Global Archive",
    description: "This is where the magic happens. Browse music, videos, and books curated from our global community of artists.",
    icon: Database
  },
  {
    title: "Your Creator Studio",
    description: "Ready to share your work? The Creator Studio is where you upload tracks, manage videos, and build your artistic legacy.",
    icon: Settings
  },
  {
    title: "The Sanctuary",
    description: "Connect deeply with your favorite artists. Join their Sanctuary for exclusive content, early releases, and direct interaction.",
    icon: ShieldCheck
  },
  {
    title: "Profile & Settings",
    description: "Customize your presence, manage your memberships, and toggle help features like tooltips right from your profile.",
    icon: User
  },
  {
    title: "Always Here to Help",
    description: "Need more info? The Help Center is always available in the sidebar. You can revisit this tour anytime from your settings.",
    icon: HelpCircle
  }
];

interface OnboardingTourProps {
  onComplete: () => void;
  onSkip: () => void;
}

const OnboardingTour: React.FC<OnboardingTourProps> = ({ onComplete, onSkip }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  const handleNext = () => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const step = tourSteps[currentStep];

  return (
    <AnimatePresence>
      {isVisible && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-2xl bg-white text-black rounded-[3rem] overflow-hidden shadow-[0_0_100px_rgba(255,255,255,0.1)]"
          >
            {/* Progress Bar */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-black/5 flex">
              {tourSteps.map((_, idx) => (
                <div 
                  key={idx}
                  className={`h-full transition-all duration-500 ${
                    idx <= currentStep ? 'bg-small-orange' : 'bg-transparent'
                  }`}
                  style={{ width: `${100 / tourSteps.length}%` }}
                />
              ))}
            </div>

            <div className="p-12 lg:p-16">
              <div className="flex justify-between items-start mb-12">
                <div className="w-20 h-20 rounded-3xl bg-small-orange/10 flex items-center justify-center text-small-orange">
                  <step.icon size={40} />
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={onSkip}
                    className="flex items-center gap-2 px-4 py-2 hover:bg-black/5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all"
                  >
                    <SkipForward size={14} /> Skip Tour
                  </button>
                  <button 
                    onClick={onSkip}
                    className="p-2 hover:bg-black/5 rounded-full transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              <motion.div
                key={currentStep}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <h2 className="text-4xl lg:text-5xl font-display font-black tracking-tightest uppercase leading-none">
                  {step.title}
                </h2>
                <p className="text-lg font-bold text-black/60 leading-relaxed max-w-lg">
                  {step.description}
                </p>
              </motion.div>

              <div className="mt-16 flex items-center justify-between">
                <div className="flex gap-4">
                  <button
                    onClick={handleBack}
                    disabled={currentStep === 0}
                    className="p-4 rounded-2xl border border-black/10 hover:bg-black/5 transition-all disabled:opacity-20"
                  >
                    <ChevronLeft size={24} />
                  </button>
                  <button
                    onClick={handleNext}
                    className="flex items-center gap-3 px-8 py-4 bg-black text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-small-orange transition-all group"
                  >
                    {currentStep === tourSteps.length - 1 ? "Get Started" : "Next Step"}
                    <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-black/20">
                  Step {currentStep + 1} of {tourSteps.length}
                </span>
              </div>
            </div>

            {/* Visual Asset Illustration (Abstract) */}
            <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-small-orange/5 rounded-full blur-3xl" />
            <div className="absolute -top-20 -left-20 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl" />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default OnboardingTour;
