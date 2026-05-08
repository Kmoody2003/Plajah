import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Leaf, 
  Layers, 
  Sun, 
  Activity, 
  Info, 
  ChevronRight, 
  Sparkles,
  Search,
  Book,
  Wind,
  Droplets,
  Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generatePlantInsight } from '../services/geminiService';

interface PlantBiologyModuleProps {
  onBack: () => void;
}

type Section = 'LEAF_STRUCTURE' | 'PLANT_CELL' | 'PHOTOSYNTHESIS' | 'AI_INSIGHT';

const PlantBiologyModule: React.FC<PlantBiologyModuleProps> = ({ onBack }) => {
  const [activeSection, setActiveSection] = useState<Section>('LEAF_STRUCTURE');
  const [selectedPart, setSelectedPart] = useState<string | null>(null);
  const [insight, setInsight] = useState<{ summary: string; fact: string } | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);

  const leafParts = [
    { id: 'cuticle', name: 'Waxy Cuticle', description: 'A non-cellular protective layer of cutin that reduces water loss via transpiration.', position: { top: '12%', left: '35%' } },
    { id: 'epidermis_upper', name: 'Upper Epidermis', description: 'A single layer of transparent cells that allow light to reach the mesophyll while offering structural protection.', position: { top: '22%', left: '55%' } },
    { id: 'palisade', name: 'Palisade Mesophyll', description: 'Columnar cells packed with chloroplasts; responsible for the majority of solar energy absorption.', position: { top: '38%', left: '48%' } },
    { id: 'spongy', name: 'Spongy Mesophyll', description: 'Irregular cells with large intercellular air spaces facilitating gas diffusion (CO2 and O2).', position: { top: '62%', left: '58%' } },
    { id: 'xylem', name: 'Xylem', description: 'Vascular tissue that transports water and dissolved minerals from roots to leaves.', position: { top: '52%', left: '32%' } },
    { id: 'phloem', name: 'Phloem', description: 'Living vascular tissue that translocates organic nutrients (sucrose) throughout the plant.', position: { top: '58%', left: '38%' } },
    { id: 'stomata', name: 'Stomata & Guard Cells', description: 'Epidermal pores regulated by turgor pressure in guard cells, managing gas exchange.', position: { top: '88%', left: '42%' } },
  ];

  const cellParts = [
    { id: 'chloroplast', name: 'Chloroplast', description: 'Double-membrane organelles containing thylakoids; the site of photosynthesis.', position: { top: '32%', left: '42%' } },
    { id: 'vacuole', name: 'Large Central Vacuole', description: 'Maintains turgor pressure against the cell wall and stores nutrients/waste.', position: { top: '55%', left: '52%' } },
    { id: 'wall', name: 'Cell Wall', description: 'A rigid outer envelope composed of cellulose, hemicellulose, and pectin for support.', position: { top: '8%', left: '15%' } },
    { id: 'nucleus', name: 'Nucleus & Nucleolus', description: 'Coordinates cellular activities and contains genetic material (chromatin).', position: { top: '75%', left: '62%' } },
    { id: 'mitochondria', name: 'Mitochondria', description: 'The powerhouse where oxidative phosphorylation generates ATP for cellular energy.', position: { top: '65%', left: '25%' } },
    { id: 'cytoplasm', name: 'Cytoplasm / Cytosol', description: 'The aqueous matrix where metabolic pathways and organelle transport occur.', position: { top: '45%', left: '20%' } },
  ];

  const photosynthesisSteps = [
    { title: 'Photolysis', icon: Sun, text: 'Light energy splits water molecules (H2O) into oxygen, protons, and electrons in the thylakoid.' },
    { title: 'ATP Synthesis', icon: Droplets, text: 'Energy from electron transport chains drives the production of ATP and NADPH.' },
    { title: 'Carbon Fixation', icon: Wind, text: 'The enzyme RuBisCO facilitates the capture of atmospheric CO2 in the stroma.' },
    { title: 'Calvin Cycle', icon: Activity, text: 'Chemical energy (ATP/NADPH) converts fixed carbon into high-energy G3P (glucose precursor).' },
  ];

  const fetchInsight = async (topic: string) => {
    setLoadingInsight(true);
    const data = await generatePlantInsight(topic);
    setInsight(data);
    setLoadingInsight(false);
  };

  useEffect(() => {
    fetchInsight('Photosynthesis Overview');
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg-color)] text-[var(--text-primary)] font-serif overflow-hidden selection:bg-[#C2D9AD]">
      {/* Background Texture - Paper feel */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'url(https://www.transparenttextures.com/patterns/paper.png)' }} />

      {/* Main Layout */}
      <div className="flex h-screen relative z-10">
        
        {/* Sidebar Navigation */}
        <aside className="w-80 border-r border-[var(--border-color)] p-8 flex flex-col justify-between bg-[var(--card-bg)] backdrop-blur-sm">
          <div>
            <button 
              onClick={onBack}
              className="group flex items-center gap-3 mb-12 text-[10px] font-black uppercase tracking-widest opacity-60 hover:opacity-100 transition-all"
            >
              <div className="w-8 h-8 rounded-full border border-[var(--border-color)] flex items-center justify-center group-hover:scale-110 transition-all">
                <ArrowLeft size={16} />
              </div>
              Botanical Archives
            </button>

            <div className="space-y-2">
              <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">
                Plant <br />Kingdom
              </h1>
              
              {[
                { id: 'LEAF_STRUCTURE', label: 'Leaf Anatomy', icon: Leaf },
                { id: 'PLANT_CELL', label: 'Cellular Engine', icon: Layers },
                { id: 'PHOTOSYNTHESIS', label: 'Photosynthesis', icon: Sun },
                { id: 'AI_INSIGHT', label: 'Nano Banana AI', icon: Sparkles },
              ].map(item => (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id as Section)}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${
                    activeSection === item.id 
                      ? 'bg-[var(--text-secondary)] text-[var(--bg-color)] shadow-xl' 
                      : 'opacity-40 hover:opacity-100 hover:bg-[var(--card-bg)]'
                  }`}
                >
                  <item.icon size={18} />
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-6 bg-[var(--text-secondary)]/10 rounded-3xl border border-[var(--border-color)]">
            <div className="flex items-center gap-2 mb-3">
              <Info size={14} className="text-[var(--text-secondary)]" />
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">Scientific Protocol</span>
            </div>
            <p className="text-[10px] font-bold leading-relaxed opacity-60 uppercase tracking-widest">
              Hover over markers to reveal microscopic data. Use the AI module for real-time botanical synthesis.
            </p>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 relative overflow-hidden p-12">
          <AnimatePresence mode="wait">
            {activeSection === 'LEAF_STRUCTURE' && (
              <motion.div 
                key="leaf"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                className="h-full flex flex-col items-center justify-center"
              >
                <div className="relative w-full max-w-4xl aspect-[4/3] bg-[var(--card-bg)] rounded-[4rem] border border-[var(--border-color)] p-8 shadow-inner overflow-hidden">
                  {/* High accuracy leaf cross section diagram */}
                  <img 
                    src="https://images.unsplash.com/photo-1545161296-d9c2c241f2ad?auto=format&fit=crop&q=80&w=2000" 
                    className="w-full h-full object-cover rounded-[3rem] opacity-40 group-hover:opacity-60 mix-blend-screen"
                    alt="Scientifically accurate plant leaf cross section structure"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-br from-[var(--text-secondary)]/10 to-transparent pointer-events-none" />
                  
                  {/* Schematic Overlay Lines */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20" viewBox="0 0 100 100">
                    <line x1="0" y1="20" x2="100" y2="20" stroke="currentColor" strokeWidth="0.1" />
                    <line x1="0" y1="80" x2="100" y2="80" stroke="currentColor" strokeWidth="0.1" />
                  </svg>
                  
                  {/* Interaction Markers */}
                  {leafParts.map(part => (
                    <button
                      key={part.id}
                      onClick={() => setSelectedPart(part.id)}
                      onMouseEnter={() => setSelectedPart(part.id)}
                      className="absolute group"
                      style={{ top: part.position.top, left: part.position.left }}
                    >
                      <div className="w-6 h-6 rounded-full bg-[var(--text-primary)] text-[var(--bg-color)] border border-[var(--border-color)] flex items-center justify-center shadow-lg group-hover:bg-[var(--text-secondary)] group-hover:text-[var(--bg-color)] transition-all transform group-hover:scale-125">
                        <Plus size={14} />
                      </div>
                      
                      {selectedPart === part.id && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-64 p-4 bg-[var(--card-bg)] rounded-2xl shadow-2xl border border-[var(--border-color)] z-50 pointer-events-none"
                        >
                          <h4 className="text-sm font-black uppercase tracking-widest mb-1 text-[var(--text-primary)]">{part.name}</h4>
                          <p className="text-[10px] leading-relaxed opacity-70 uppercase tracking-widest">{part.description}</p>
                        </motion.div>
                      )}
                    </button>
                  ))}

                  <div className="absolute top-12 left-12">
                    <h2 className="text-6xl font-black uppercase tracking-tightest leading-none text-[var(--text-primary)] font-bebas">
                      Leaf <br />Anatomy
                    </h2>
                    <p className="text-[10px] font-black uppercase tracking-[0.4em] opacity-40 mt-2">Sectional Analysis Rev 2.1</p>
                  </div>
                </div>
              </motion.div>
            )}

            {activeSection === 'PLANT_CELL' && (
              <motion.div 
                key="cell"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                className="h-full flex flex-col items-center justify-center"
              >
                <div className="relative w-full max-w-4xl aspect-[4/3] bg-[var(--card-bg)] rounded-[4rem] border border-[var(--border-color)] p-8 shadow-inner overflow-hidden">
                  <img 
                    src="https://images.unsplash.com/photo-1576086213369-97a306d36557?auto=format&fit=crop&q=80&w=2000" 
                    className="w-full h-full object-cover rounded-[3rem] opacity-30 mix-blend-screen grayscale"
                    alt="Microscopic plant cell structure accurate diagram"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-[var(--text-secondary)]/5 pointer-events-none" />
                  
                  {cellParts.map(part => (
                    <button
                      key={part.id}
                      onClick={() => setSelectedPart(part.id)}
                      onMouseEnter={() => setSelectedPart(part.id)}
                      className="absolute group"
                      style={{ top: part.position.top, left: part.position.left }}
                    >
                      <div className="w-8 h-8 rounded-full bg-[var(--text-primary)] text-[var(--bg-color)] border border-[var(--border-color)] flex items-center justify-center shadow-lg group-hover:bg-[var(--text-secondary)] group-hover:text-[var(--bg-color)] transition-all transform group-hover:scale-125">
                        <Layers size={16} />
                      </div>
                      
                      {selectedPart === part.id && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-64 p-6 bg-[var(--card-bg)] rounded-[2rem] shadow-2xl border border-[var(--border-color)] z-50 pointer-events-none"
                        >
                          <h4 className="text-lg font-black uppercase tracking-tightest mb-2 text-[var(--text-primary)] font-bebas">{part.name}</h4>
                          <p className="text-[10px] leading-relaxed opacity-70 uppercase tracking-widest">{part.description}</p>
                        </motion.div>
                      )}
                    </button>
                  ))}

                  <div className="absolute bottom-12 right-12 text-right">
                    <h2 className="text-6xl font-black uppercase tracking-tightest leading-none text-[var(--text-primary)] font-bebas">
                      Cellular <br />Dynamics
                    </h2>
                    <p className="text-[10px] font-black uppercase tracking-[0.4em] opacity-40 mt-2">Organelle Map v.4.0</p>
                  </div>
                </div>
              </motion.div>
            )}

            {activeSection === 'PHOTOSYNTHESIS' && (
              <motion.div 
                key="photo"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="h-full flex flex-col justify-center max-w-4xl mx-auto"
              >
                <div className="grid grid-cols-2 gap-8">
                  {photosynthesisSteps.map((step, idx) => (
                    <motion.div
                      key={idx}
                      whileHover={{ scale: 1.02 }}
                      className="p-10 bg-[var(--card-bg)] backdrop-blur-md rounded-[3rem] border border-[var(--border-color)] shadow-xl relative overflow-hidden group"
                    >
                      <div className="absolute top-0 right-0 p-8 text-[var(--text-primary)] opacity-5 group-hover:opacity-10 transition-opacity">
                        <step.icon size={80} />
                      </div>
                      <div className="w-12 h-12 rounded-2xl bg-[var(--text-secondary)] text-[var(--bg-color)] flex items-center justify-center mb-8 font-black">
                        {idx + 1}
                      </div>
                      <h3 className="text-3xl font-black uppercase tracking-tightest mb-4 font-bebas text-[var(--text-primary)]">{step.title}</h3>
                      <p className="text-xs uppercase tracking-widest leading-loose opacity-60 font-serif">
                        {step.text}
                      </p>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeSection === 'AI_INSIGHT' && (
              <motion.div 
                key="ai"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="h-full flex flex-col items-center justify-center max-w-3xl mx-auto text-center"
              >
                <div className="w-24 h-24 bg-[var(--text-secondary)]/10 rounded-full flex items-center justify-center mb-12 border border-[var(--border-color)]">
                  <Sparkles size={40} className="text-[var(--text-secondary)]" />
                </div>
                
                <div className="relative mb-12">
                  <input 
                    type="text" 
                    placeholder="Ask about Chloroplasts, Stomata, xylem..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') fetchInsight(e.currentTarget.value);
                    }}
                    className="w-full max-w-xl bg-[var(--card-bg)] rounded-full py-6 px-12 text-lg border border-[var(--border-color)] focus:outline-none focus:ring-4 focus:ring-[var(--text-secondary)]/30 shadow-2xl transition-all text-[var(--text-primary)]"
                  />
                  <Search className="absolute right-6 top-1/2 -translate-y-1/2 text-[var(--text-primary)] opacity-20" />
                </div>

                <AnimatePresence mode="wait">
                  {loadingInsight ? (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-4"
                    >
                      <div className="w-64 h-2 bg-[#3E4A35]/10 rounded-full overflow-hidden mx-auto">
                        <motion.div 
                          animate={{ x: [-100, 300] }}
                          transition={{ repeat: Infinity, duration: 1 }}
                          className="w-20 h-full bg-[#3E4A35]"
                        />
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-[0.4em] animate-pulse">Synthesizing Biological Data...</p>
                    </motion.div>
                  ) : insight && (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-[var(--card-bg)] p-12 rounded-[4rem] border border-[var(--border-color)] shadow-2xl text-left"
                    >
                      <div className="flex items-center gap-3 mb-6">
                        <Book className="text-[var(--text-secondary)]" size={20} />
                        <span className="text-[10px] font-black uppercase tracking-[0.4em]">Botanical Log Entry</span>
                      </div>
                      <h2 className="text-3xl font-black uppercase tracking-tightest mb-6 font-bebas text-[var(--text-primary)]">Synthesis Report</h2>
                      <p className="text-base opacity-70 leading-relaxed mb-10 font-serif italic">
                        "{insight.summary}"
                      </p>
                      
                      <div className="p-8 bg-[var(--text-secondary)]/10 rounded-[2.5rem] border border-[var(--border-color)]">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-2 block">Micro-Fact</span>
                        <p className="text-xs uppercase tracking-widest leading-loose font-bold">{insight.fact}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
};

export default PlantBiologyModule;
