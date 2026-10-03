import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles, Search, Filter, BookOpen, Heart, Brain, Zap, Shield,
  Activity, ArrowRight, X, ChevronRight, Play, Pause, RotateCcw,
  CheckCircle2, AlertTriangle, ExternalLink, Leaf, Compass,
  Flame, Droplets, Wind, Sun, Moon, Scale, Eye, Award
} from 'lucide-react';
import {
  BOTANICAL_HERBS,
  ESSENTIAL_MINERALS,
  VITAL_ENZYMES,
  FUNCTIONAL_FOODS,
  MIND_BODY_PRACTICES,
  ACUPRESSURE_POINTS,
  HOLISTIC_SYNTHESIS_ESSAYS,
  BotanicalHerb,
  MineralNutrient,
  BioEnzyme,
  FunctionalFoodDrink,
  MindBodyPractice,
  AcupressurePoint,
  TraditionLineage
} from '../../data/holisticHealthData';

type SubSection = 'all' | 'herbs' | 'minerals' | 'enzymes' | 'foods' | 'movement' | 'acupressure' | 'synthesis';
type HealthGoal = 'all' | 'anxiety' | 'inflammation' | 'sleep' | 'cognition' | 'energy' | 'digestion' | 'immunity' | 'cardio';

export const HolisticHealthView: React.FC<{ onBackToFitness?: () => void }> = ({ onBackToFitness }) => {
  const [subSection, setSubSection] = useState<SubSection>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGoal, setSelectedGoal] = useState<HealthGoal>('all');
  const [selectedTradition, setSelectedTradition] = useState<string>('all');
  const [bodyZoneFilter, setBodyZoneFilter] = useState<string>('all');

  // Modal inspection state
  const [selectedHerb, setSelectedHerb] = useState<BotanicalHerb | null>(null);
  const [selectedMineral, setSelectedMineral] = useState<MineralNutrient | null>(null);
  const [selectedEnzyme, setSelectedEnzyme] = useState<BioEnzyme | null>(null);
  const [selectedFood, setSelectedFood] = useState<FunctionalFoodDrink | null>(null);
  const [selectedPractice, setSelectedPractice] = useState<MindBodyPractice | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<AcupressurePoint | null>(null);
  const [activeEssayId, setActiveEssayId] = useState<string | null>(null);

  // Guided Acupressure Timer State
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSecondsLeft, setTimerSecondsLeft] = useState(0);
  const [timerTotal, setTimerTotal] = useState(90);
  const [breathPhase, setBreathPhase] = useState<'Inhale (4s)' | 'Exhale (6s)'>('Inhale (4s)');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stop timer on modal close
  const stopAcupressureTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimerRunning(false);
  }, []);

  const startAcupressureTimer = useCallback((duration: number) => {
    stopAcupressureTimer();
    setTimerTotal(duration);
    setTimerSecondsLeft(duration);
    setTimerRunning(true);
  }, [stopAcupressureTimer]);

  useEffect(() => {
    if (!timerRunning) return;
    timerRef.current = setInterval(() => {
      setTimerSecondsLeft(prev => {
        if (prev <= 1) {
          stopAcupressureTimer();
          return 0;
        }
        // 10 second breath cycle: 4s inhale, 6s exhale
        const elapsed = timerTotal - (prev - 1);
        const cycleSecond = elapsed % 10;
        setBreathPhase(cycleSecond < 4 ? 'Inhale (4s)' : 'Exhale (6s)');
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerRunning, timerTotal, stopAcupressureTimer]);

  // Goal keywords matching
  const matchesGoal = (text: string, goal: HealthGoal): boolean => {
    if (goal === 'all') return true;
    const lower = text.toLowerCase();
    switch (goal) {
      case 'anxiety': return /anxiety|calm|gaba|stress|nervous|worry|relax/i.test(lower);
      case 'inflammation': return /inflammat|pain|cox-2|nf-κb|joint|arthritis|swelling/i.test(lower);
      case 'sleep': return /sleep|insomnia|rest|nocturnal|rem|melatonin/i.test(lower);
      case 'cognition': return /memory|focus|brain|bdnf|ngf|nootropic|dopamine|acetylcholine|synap/i.test(lower);
      case 'energy': return /energy|atp|mitochondri|endurance|stamina|fatigue|vo2/i.test(lower);
      case 'digestion': return /gut|digest|stomach|bowel|microbiome|bile|bloat/i.test(lower);
      case 'immunity': return /immun|t-cell|antiviral|natural killer|cytokine|defense/i.test(lower);
      case 'cardio': return /heart|cardio|blood pressure|arteri|nitric oxide|vascular|endothel/i.test(lower);
      default: return true;
    }
  };

  // Filtered Herbs
  const filteredHerbs = useMemo(() => {
    return BOTANICAL_HERBS.filter(h => {
      const q = searchQuery.toLowerCase();
      const matchSearch = !q || 
        h.name.toLowerCase().includes(q) ||
        h.botanicalName.toLowerCase().includes(q) ||
        h.primaryActions.some(a => a.toLowerCase().includes(q)) ||
        h.bodyBenefits.some(b => b.toLowerCase().includes(q)) ||
        h.mindBenefits.some(m => m.toLowerCase().includes(q)) ||
        h.activePhytochemicals.some(p => p.name.toLowerCase().includes(q));

      const matchTradition = selectedTradition === 'all' || h.traditions.includes(selectedTradition as any);
      const combinedText = `${h.name} ${h.primaryActions.join(' ')} ${h.bodyBenefits.join(' ')} ${h.mindBenefits.join(' ')}`;
      const matchG = matchesGoal(combinedText, selectedGoal);

      return matchSearch && matchTradition && matchG;
    });
  }, [searchQuery, selectedTradition, selectedGoal]);

  // Filtered Minerals
  const filteredMinerals = useMemo(() => {
    return ESSENTIAL_MINERALS.filter(m => {
      const q = searchQuery.toLowerCase();
      const matchSearch = !q || 
        m.name.toLowerCase().includes(q) ||
        m.biologicalRole.toLowerCase().includes(q) ||
        m.bodyBenefits.some(b => b.toLowerCase().includes(q)) ||
        m.mindBenefits.some(mb => mb.toLowerCase().includes(q));
      const combinedText = `${m.name} ${m.biologicalRole} ${m.bodyBenefits.join(' ')} ${m.mindBenefits.join(' ')}`;
      return matchSearch && matchesGoal(combinedText, selectedGoal);
    });
  }, [searchQuery, selectedGoal]);

  // Filtered Enzymes
  const filteredEnzymes = useMemo(() => {
    return VITAL_ENZYMES.filter(e => {
      const q = searchQuery.toLowerCase();
      const matchSearch = !q || 
        e.name.toLowerCase().includes(q) ||
        e.mechanismOfAction.toLowerCase().includes(q) ||
        e.bodyBenefits.some(b => b.toLowerCase().includes(q)) ||
        e.mindBenefits.some(mb => mb.toLowerCase().includes(q));
      const combinedText = `${e.name} ${e.mechanismOfAction} ${e.bodyBenefits.join(' ')} ${e.mindBenefits.join(' ')}`;
      return matchSearch && matchesGoal(combinedText, selectedGoal);
    });
  }, [searchQuery, selectedGoal]);

  // Filtered Foods
  const filteredFoods = useMemo(() => {
    return FUNCTIONAL_FOODS.filter(f => {
      const q = searchQuery.toLowerCase();
      const matchSearch = !q || 
        f.name.toLowerCase().includes(q) ||
        f.subtitle.toLowerCase().includes(q) ||
        f.originTradition.toLowerCase().includes(q) ||
        f.bodyBenefits.some(b => b.toLowerCase().includes(q)) ||
        f.mindBenefits.some(mb => mb.toLowerCase().includes(q));
      const combinedText = `${f.name} ${f.subtitle} ${f.bodyBenefits.join(' ')} ${f.mindBenefits.join(' ')}`;
      return matchSearch && matchesGoal(combinedText, selectedGoal);
    });
  }, [searchQuery, selectedGoal]);

  // Filtered Practices
  const filteredPractices = useMemo(() => {
    return MIND_BODY_PRACTICES.filter(p => {
      const q = searchQuery.toLowerCase();
      const matchSearch = !q || 
        p.name.toLowerCase().includes(q) ||
        p.system.toLowerCase().includes(q) ||
        p.lineage.toLowerCase().includes(q) ||
        p.summary.toLowerCase().includes(q) ||
        p.physicalImpact.some(pi => pi.toLowerCase().includes(q)) ||
        p.neurologicalAndMentalImpact.some(ni => ni.toLowerCase().includes(q));
      const combinedText = `${p.name} ${p.system} ${p.summary} ${p.physicalImpact.join(' ')} ${p.neurologicalAndMentalImpact.join(' ')}`;
      return matchSearch && matchesGoal(combinedText, selectedGoal);
    });
  }, [searchQuery, selectedGoal]);

  // Filtered Acupressure Points
  const filteredPoints = useMemo(() => {
    return ACUPRESSURE_POINTS.filter(pt => {
      const q = searchQuery.toLowerCase();
      const matchSearch = !q || 
        pt.code.toLowerCase().includes(q) ||
        pt.pinyinName.toLowerCase().includes(q) ||
        pt.englishName.toLowerCase().includes(q) ||
        pt.meridian.toLowerCase().includes(q) ||
        pt.traditionalIndication.toLowerCase().includes(q) ||
        pt.scientificMechanism.clinicalEvidence.toLowerCase().includes(q);
      const matchZone = bodyZoneFilter === 'all' || pt.bodyZone === bodyZoneFilter;
      const combinedText = `${pt.code} ${pt.pinyinName} ${pt.englishName} ${pt.traditionalIndication} ${pt.scientificMechanism.clinicalEvidence}`;
      return matchSearch && matchZone && matchesGoal(combinedText, selectedGoal);
    });
  }, [searchQuery, bodyZoneFilter, selectedGoal]);

  const totalTreasuresCount = 
    BOTANICAL_HERBS.length + 
    ESSENTIAL_MINERALS.length + 
    VITAL_ENZYMES.length + 
    FUNCTIONAL_FOODS.length + 
    MIND_BODY_PRACTICES.length + 
    ACUPRESSURE_POINTS.length;

  return (
    <div className="space-y-8 pb-16">
      {/* ── Sacred Hero Header ──────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-[2.5rem] border border-emerald-500/20 bg-gradient-to-br from-emerald-950/40 via-stone-950/80 to-amber-950/30 p-6 sm:p-10 shadow-2xl backdrop-blur-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[9px] font-black uppercase tracking-widest">
            <Leaf size={11} className="text-emerald-400" />
            Holistic Medicine · Ancient Wisdom · Contemporary Science
          </div>

          <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tight text-white leading-tight">
            The Living Herbal & <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 via-teal-200 to-amber-300">
              Mind-Body Sanctum
            </span>
          </h2>

          <p className="text-sm text-stone-300/80 leading-relaxed font-normal">
            Honoring thousands of years of traditional medicine across Ayurveda, Traditional Chinese Medicine, 
            Indigenous wisdom, and Mediterranean herbalism — harmonized with modern double-blind clinical trials, 
            phytochemical pathways, and neuro-fascial biology.
          </p>

          <div className="flex flex-wrap items-center gap-6 pt-2 text-xs font-semibold text-stone-400">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{totalTreasuresCount} Validated Remedies & Practices</span>
            </div>
            <div className="flex items-center gap-2">
              <Award size={13} className="text-amber-400" />
              <span>Double-Blind Clinical Citations</span>
            </div>
            <div className="flex items-center gap-2">
              <Scale size={13} className="text-teal-400" />
              <span>Tradition & Science Parity</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Sub-Section Tabs ────────────────────────────────────────────────── */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 border-b border-white/8">
        {[
          { id: 'all', label: 'All Treasures', icon: Sparkles, count: totalTreasuresCount },
          { id: 'herbs', label: 'Herbs & Botanicals', icon: Leaf, count: BOTANICAL_HERBS.length },
          { id: 'minerals', label: 'Minerals & Elements', icon: Shield, count: ESSENTIAL_MINERALS.length },
          { id: 'enzymes', label: 'Enzymes & Catalysts', icon: Zap, count: VITAL_ENZYMES.length },
          { id: 'foods', label: 'Functional Foods & Elixirs', icon: Droplets, count: FUNCTIONAL_FOODS.length },
          { id: 'movement', label: 'Martial & Mind-Body Flow', icon: Wind, count: MIND_BODY_PRACTICES.length },
          { id: 'acupressure', label: 'Meridians & Pressure Points', icon: Compass, count: ACUPRESSURE_POINTS.length },
          { id: 'synthesis', label: 'Tradition & Science Dialogue', icon: BookOpen, count: HOLISTIC_SYNTHESIS_ESSAYS.length },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = subSection === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setSubSection(tab.id as SubSection)}
              className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all border ${
                isActive 
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-lg shadow-emerald-950/40' 
                  : 'bg-white/[0.03] border-white/8 text-white/50 hover:text-white hover:border-white/18'
              }`}
            >
              <Icon size={12} className={isActive ? 'text-emerald-400' : 'text-white/40'} />
              {tab.label}
              <span className={`text-[8px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-emerald-400/20 text-emerald-200' : 'bg-white/5 text-white/30'}`}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Search & Filter Controls ────────────────────────────────────────── */}
      <div className="space-y-3 bg-white/[0.02] border border-white/6 rounded-2xl p-4">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search bar */}
          <div className="relative flex-1">
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search herbs, minerals, pressure points, active compounds (e.g. ashwagandha, cortisol, magnesium, LI4, digestion)…"
              className="w-full pl-10 pr-4 py-2.5 bg-white/[0.03] border border-white/8 rounded-xl text-xs text-white placeholder:text-white/25 focus:outline-none focus:border-emerald-500/50 transition-colors"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Tradition selector (for Herbs) */}
          {(subSection === 'all' || subSection === 'herbs') && (
            <select
              value={selectedTradition}
              onChange={e => setSelectedTradition(e.target.value)}
              className="px-3 py-2 bg-stone-900 border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest text-emerald-300 focus:outline-none"
            >
              <option value="all">All Traditions</option>
              <option value="Ayurveda">Ayurveda</option>
              <option value="Traditional Chinese Medicine">TCM (Chinese Medicine)</option>
              <option value="Mediterranean & Greco-Arab">Mediterranean & Greco-Arab</option>
              <option value="Indigenous & Folk Herbalism">Indigenous & Folk</option>
              <option value="Integrative Modern Science">Modern Integrative</option>
            </select>
          )}

          {/* Body Zone Selector (for Acupressure) */}
          {subSection === 'acupressure' && (
            <select
              value={bodyZoneFilter}
              onChange={e => setBodyZoneFilter(e.target.value)}
              className="px-3 py-2 bg-stone-900 border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest text-teal-300 focus:outline-none"
            >
              <option value="all">All Body Zones</option>
              <option value="Head & Neck">Head & Neck</option>
              <option value="Wrists & Hands">Wrists & Hands</option>
              <option value="Torso & Core">Torso & Core</option>
              <option value="Legs & Feet">Legs & Feet</option>
            </select>
          )}
        </div>

        {/* Health Goal Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
          <span className="text-[8px] font-black uppercase tracking-widest text-white/30 shrink-0 mr-1 flex items-center gap-1">
            <Filter size={9} /> Target Goal:
          </span>
          {[
            { id: 'all', label: 'All Goals' },
            { id: 'anxiety', label: '😌 Calm & Nervous System' },
            { id: 'sleep', label: '🌙 Rest & Deep Sleep' },
            { id: 'cognition', label: '🧠 Brain, Memory & Focus' },
            { id: 'inflammation', label: '🔥 Anti-Inflammatory & Joints' },
            { id: 'energy', label: '⚡ Energy & Cellular ATP' },
            { id: 'immunity', label: '🛡️ Immune Resilience' },
            { id: 'digestion', label: '🌿 Gut & Microbiome' },
            { id: 'cardio', label: '❤️ Heart & Blood Flow' },
          ].map(g => (
            <button
              key={g.id}
              onClick={() => setSelectedGoal(g.id as HealthGoal)}
              className={`shrink-0 px-2.5 py-1 rounded-full text-[8px] font-bold transition-all border ${
                selectedGoal === g.id
                  ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200'
                  : 'bg-white/[0.02] border-white/5 text-white/40 hover:text-white/80'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── SECTION: HERBS & BOTANICALS ─────────────────────────────────────── */}
      {(subSection === 'all' || subSection === 'herbs') && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Leaf size={14} className="text-emerald-400" />
              <h3 className="text-xs font-black uppercase tracking-[0.3em] text-white">
                Botanical Pharmacopeia & Living Plants
              </h3>
            </div>
            <span className="text-[9px] text-white/40">{filteredHerbs.length} plants found</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredHerbs.map(herb => (
              <motion.div
                key={herb.id}
                whileHover={{ y: -3 }}
                onClick={() => setSelectedHerb(herb)}
                className="group cursor-pointer bg-white/[0.03] border border-white/8 hover:border-emerald-500/40 rounded-[1.8rem] overflow-hidden transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Plant Image */}
                  <div className="relative h-44 w-full overflow-hidden bg-stone-900">
                    <img
                      src={herb.imageUrl}
                      alt={herb.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-90 group-hover:opacity-100"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/20 to-transparent" />
                    
                    {/* Tradition Chips */}
                    <div className="absolute top-3 left-3 flex flex-wrap gap-1">
                      {herb.traditions.map(t => (
                        <span key={t} className="px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-wider bg-black/60 backdrop-blur-md border border-white/10 text-emerald-300">
                          {t}
                        </span>
                      ))}
                    </div>

                    {/* Scientific Badge */}
                    <div className="absolute bottom-2 right-3">
                      <span className="px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-wider bg-emerald-500/20 backdrop-blur-md border border-emerald-500/30 text-emerald-300 flex items-center gap-1">
                        <Award size={9} /> {herb.scientificResearch.evidenceLevel.split(' ')[0]} Clinical
                      </span>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-4 space-y-2">
                    <div>
                      <h4 className="text-sm font-black text-white group-hover:text-emerald-300 transition-colors">
                        {herb.name}
                      </h4>
                      <p className="text-[10px] text-stone-400 italic">
                        {herb.botanicalName} ({herb.plantFamily.split(' ')[0]})
                      </p>
                    </div>

                    <p className="text-[9px] text-white/50 line-clamp-2 leading-relaxed">
                      {herb.plantDescription}
                    </p>

                    {/* Active phytochemicals */}
                    <div className="pt-1 flex flex-wrap gap-1">
                      {herb.activePhytochemicals.slice(0, 2).map(p => (
                        <span key={p.name} className="px-1.5 py-0.5 rounded bg-emerald-950/40 border border-emerald-500/20 text-emerald-300 text-[7px] font-bold">
                          {p.name.split(' ')[0]}
                        </span>
                      ))}
                    </div>

                    {/* Mind & Body Tags */}
                    <div className="pt-2 space-y-1 border-t border-white/5">
                      <div className="flex items-center gap-1.5 text-[8px] text-stone-300">
                        <Brain size={10} className="text-indigo-400 shrink-0" />
                        <span className="line-clamp-1">{herb.mindBenefits[0]}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[8px] text-stone-300">
                        <Heart size={10} className="text-rose-400 shrink-0" />
                        <span className="line-clamp-1">{herb.bodyBenefits[0]}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-4 py-2.5 bg-white/[0.02] border-t border-white/5 flex items-center justify-between text-[8px] font-black uppercase tracking-widest text-emerald-400 group-hover:text-emerald-300">
                  <span>Explore Specimen Deep-Dive</span>
                  <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* ── SECTION: ESSENTIAL MINERALS & ENZYMES ──────────────────────────── */}
      {(subSection === 'all' || subSection === 'minerals') && (
        <div className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield size={14} className="text-amber-400" />
              <h3 className="text-xs font-black uppercase tracking-[0.3em] text-white">
                Essential Minerals & Bio-Electrolytes
              </h3>
            </div>
            <span className="text-[9px] text-white/40">{filteredMinerals.length} minerals</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {filteredMinerals.map(min => (
              <div
                key={min.id}
                onClick={() => setSelectedMineral(min)}
                className="group cursor-pointer bg-white/[0.03] border border-white/8 hover:border-amber-400/40 rounded-[1.8rem] p-4 flex flex-col justify-between transition-all"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center font-black text-amber-300 text-sm">
                      {min.elementSymbol}
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest bg-white/5 text-stone-400">
                      {min.category}
                    </span>
                  </div>

                  <div>
                    <h4 className="text-sm font-black text-white group-hover:text-amber-300 transition-colors">
                      {min.name}
                    </h4>
                    <p className="text-[8px] text-white/50 mt-1 line-clamp-2 leading-relaxed">
                      {min.biologicalRole}
                    </p>
                  </div>

                  <div className="space-y-1.5 border-t border-white/5 pt-2">
                    <p className="text-[7px] font-black uppercase tracking-widest text-amber-400/80">Key Dietary Sources</p>
                    <p className="text-[8px] text-stone-300 line-clamp-1">{min.dietarySources.slice(0, 3).join(', ')}</p>
                  </div>
                </div>

                <div className="mt-4 pt-2 border-t border-white/5 flex items-center justify-between text-[8px] font-black uppercase tracking-widest text-amber-400">
                  <span>View Forms & Dosages</span>
                  <ChevronRight size={11} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SECTION: VITAL BIO-ENZYMES ───────────────────────────────────────── */}
      {(subSection === 'all' || subSection === 'enzymes') && (
        <div className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-teal-400" />
              <h3 className="text-xs font-black uppercase tracking-[0.3em] text-white">
                Systemic & Proteolytic Bio-Enzymes
              </h3>
            </div>
            <span className="text-[9px] text-white/40">{filteredEnzymes.length} enzymes</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {filteredEnzymes.map(enz => (
              <div
                key={enz.id}
                onClick={() => setSelectedEnzyme(enz)}
                className="group cursor-pointer bg-white/[0.03] border border-white/8 hover:border-teal-400/40 rounded-[1.8rem] p-4 flex flex-col justify-between transition-all"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest bg-teal-500/10 text-teal-300 border border-teal-500/20">
                      {enz.type}
                    </span>
                    <Zap size={12} className="text-teal-400" />
                  </div>

                  <div>
                    <h4 className="text-sm font-black text-white group-hover:text-teal-300 transition-colors">
                      {enz.name}
                    </h4>
                    <p className="text-[8px] text-teal-200/70 font-semibold mt-0.5">
                      Source: {enz.naturalSource.split(',')[0]}
                    </p>
                    <p className="text-[8px] text-white/50 mt-1 line-clamp-3 leading-relaxed">
                      {enz.mechanismOfAction}
                    </p>
                  </div>
                </div>

                <div className="mt-4 pt-2 border-t border-white/5 flex items-center justify-between text-[8px] font-black uppercase tracking-widest text-teal-400">
                  <span>Enzymatic Breakdown</span>
                  <ChevronRight size={11} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SECTION: FUNCTIONAL FOODS & TONICS ──────────────────────────────── */}
      {(subSection === 'all' || subSection === 'foods') && (
        <div className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Droplets size={14} className="text-rose-400" />
              <h3 className="text-xs font-black uppercase tracking-[0.3em] text-white">
                Medicinal Elixirs & Therapeutic Foods
              </h3>
            </div>
            <span className="text-[9px] text-white/40">{filteredFoods.length} recipes & tonics</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {filteredFoods.map(food => (
              <div
                key={food.id}
                onClick={() => setSelectedFood(food)}
                className="group cursor-pointer bg-white/[0.03] border border-white/8 hover:border-rose-400/40 rounded-[1.8rem] p-4 flex flex-col justify-between transition-all"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest bg-rose-500/10 text-rose-300 border border-rose-500/20">
                      {food.category}
                    </span>
                    <Droplets size={12} className="text-rose-400" />
                  </div>

                  <div>
                    <h4 className="text-sm font-black text-white group-hover:text-rose-300 transition-colors">
                      {food.name}
                    </h4>
                    <p className="text-[8px] text-rose-200/70 font-semibold mt-0.5">
                      {food.subtitle}
                    </p>
                    <p className="text-[8px] text-white/50 mt-1 line-clamp-2 leading-relaxed">
                      {food.traditionalLore}
                    </p>
                  </div>

                  <div className="space-y-1 border-t border-white/5 pt-2">
                    <p className="text-[7px] font-black uppercase tracking-widest text-rose-400/80">Key Active Bioactives</p>
                    <p className="text-[8px] text-stone-300 line-clamp-1">{food.keyCompounds.slice(0, 3).join(' · ')}</p>
                  </div>
                </div>

                <div className="mt-4 pt-2 border-t border-white/5 flex items-center justify-between text-[8px] font-black uppercase tracking-widest text-rose-400">
                  <span>View Recipe & Ritual</span>
                  <ChevronRight size={11} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SECTION: MIND-BODY, TAI CHI & SOMATIC MOVEMENT ───────────────────── */}
      {(subSection === 'all' || subSection === 'movement') && (
        <div className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wind size={14} className="text-sky-400" />
              <h3 className="text-xs font-black uppercase tracking-[0.3em] text-white">
                Mind-Body, Tai Chi & Breath Science
              </h3>
            </div>
            <span className="text-[9px] text-white/40">{filteredPractices.length} internal arts</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredPractices.map(practice => (
              <div
                key={practice.id}
                onClick={() => setSelectedPractice(practice)}
                className="group cursor-pointer bg-white/[0.03] border border-white/8 hover:border-sky-400/40 rounded-[2rem] p-5 flex flex-col justify-between transition-all space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-sky-500/10 text-sky-300 border border-sky-500/20">
                      {practice.system}
                    </span>
                    <span className="text-[8px] text-stone-400 font-semibold">{practice.idealFrequency}</span>
                  </div>

                  <div>
                    <h4 className="text-base font-black text-white group-hover:text-sky-300 transition-colors">
                      {practice.name}
                    </h4>
                    <p className="text-[9px] text-sky-200/70 font-semibold mt-0.5">
                      Lineage: {practice.lineage}
                    </p>
                    <p className="text-xs text-white/60 mt-2 leading-relaxed">
                      {practice.summary}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                      <p className="text-[7px] font-black uppercase tracking-widest text-sky-400 flex items-center gap-1">
                        <Activity size={9} /> Fascia & Physical Impact
                      </p>
                      <p className="text-[8px] text-stone-300 line-clamp-2 leading-relaxed">
                        {practice.physicalImpact[0]}
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                      <p className="text-[7px] font-black uppercase tracking-widest text-indigo-400 flex items-center gap-1">
                        <Brain size={9} /> Neurological / Vagal
                      </p>
                      <p className="text-[8px] text-stone-300 line-clamp-2 leading-relaxed">
                        {practice.neurologicalAndMentalImpact[0]}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[8px] font-black uppercase tracking-widest text-sky-400">
                  <span>Explore Movements & Breath Synchronization</span>
                  <ChevronRight size={11} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SECTION: MERIDIANS & ACUPRESSURE PRESSURE POINTS ─────────────────── */}
      {(subSection === 'all' || subSection === 'acupressure') && (
        <div className="space-y-4 pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Compass size={14} className="text-teal-400" />
              <h3 className="text-xs font-black uppercase tracking-[0.3em] text-white">
                Meridians & Pressure Points: Science & Tradition
              </h3>
            </div>
            <div className="flex items-center gap-2 text-[9px] text-stone-400">
              <span>{filteredPoints.length} clinical points</span>
              <span className="text-white/20">|</span>
              <span className="text-teal-300">Includes Interactive Point Stimulator</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPoints.map(point => (
              <div
                key={point.id}
                onClick={() => setSelectedPoint(point)}
                className="group cursor-pointer bg-white/[0.03] border border-white/8 hover:border-teal-400/40 rounded-[1.8rem] p-4 flex flex-col justify-between transition-all space-y-3"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center font-black text-teal-300 text-xs">
                        {point.code}
                      </span>
                      <div>
                        <h4 className="text-xs font-black text-white group-hover:text-teal-300 transition-colors">
                          {point.pinyinName} ({point.englishName})
                        </h4>
                        <p className="text-[8px] text-stone-400">{point.meridian.split(' ')[0]} · {point.bodyZone}</p>
                      </div>
                    </div>

                    {point.isContraindicatedInPregnancy && (
                      <span className="px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        Pregnancy Caution
                      </span>
                    )}
                  </div>

                  <p className="text-[8px] text-white/60 line-clamp-2 leading-relaxed">
                    <strong className="text-teal-300 font-bold">Location:</strong> {point.anatomicalLocation}
                  </p>

                  <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                    <p className="text-[7px] font-black uppercase tracking-widest text-teal-400">Scientific Mechanism</p>
                    <p className="text-[8px] text-stone-300 line-clamp-2 leading-relaxed">
                      {point.scientificMechanism.clinicalEvidence}
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[8px] font-black uppercase tracking-widest text-teal-400">
                  <span className="flex items-center gap-1"><Play size={9} /> Start Guided Acupressure</span>
                  <ChevronRight size={11} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SECTION: TRADITION & SCIENCE SYNTHESIS ESSAYS ────────────────────── */}
      {(subSection === 'all' || subSection === 'synthesis') && (
        <div className="space-y-4 pt-6 border-t border-white/8">
          <div className="flex items-center gap-2">
            <BookOpen size={14} className="text-amber-400" />
            <h3 className="text-xs font-black uppercase tracking-[0.3em] text-white">
              The Grand Synthesis: Science Honoring Ancient Lineage
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {HOLISTIC_SYNTHESIS_ESSAYS.map(essay => (
              <div
                key={essay.id}
                onClick={() => setActiveEssayId(essay.id)}
                className="group cursor-pointer bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-white/8 hover:border-amber-400/40 rounded-[2rem] p-6 space-y-3 transition-all"
              >
                <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-widest text-amber-400">
                  <span>{essay.author}</span>
                  <span>{essay.readTimeMinutes} min read</span>
                </div>

                <h4 className="text-base font-black text-white group-hover:text-amber-300 transition-colors">
                  {essay.title}
                </h4>

                <p className="text-xs text-stone-400 leading-relaxed font-normal">
                  {essay.subtitle}
                </p>

                <div className="pt-2 flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-amber-300">
                  <span>Read Full Synthesis Document</span>
                  <ArrowRight size={11} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ── MODALS & DEEP DIVE DRAWERS ───────────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}

      {/* HERB DEEP DIVE MODAL */}
      <AnimatePresence>
        {selectedHerb && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-stone-950 border border-emerald-500/30 rounded-[2.5rem] shadow-2xl p-6 sm:p-8 space-y-6 text-white no-scrollbar"
            >
              <button
                onClick={() => setSelectedHerb(null)}
                className="absolute top-5 right-5 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>

              {/* Header with image */}
              <div className="relative h-56 -mx-6 -mt-6 sm:-mx-8 sm:-mt-8 rounded-t-[2.5rem] overflow-hidden bg-stone-900">
                <img src={selectedHerb.imageUrl} alt={selectedHerb.name} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/40 to-transparent" />
                <div className="absolute bottom-5 left-6 sm:left-8">
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {selectedHerb.traditions.map(t => (
                      <span key={t} className="px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider bg-emerald-500/20 backdrop-blur-md border border-emerald-500/40 text-emerald-300">
                        {t}
                      </span>
                    ))}
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-black">{selectedHerb.name}</h3>
                  <p className="text-xs text-stone-300 italic">{selectedHerb.botanicalName} · {selectedHerb.plantFamily}</p>
                </div>
              </div>

              {/* Plant anatomy & habitat */}
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/6 space-y-2">
                <p className="text-[8px] font-black uppercase tracking-widest text-emerald-400">The Living Plant & Botanical Origin</p>
                <p className="text-xs text-stone-300 leading-relaxed">{selectedHerb.plantDescription}</p>
                <div className="flex flex-wrap gap-4 pt-2 text-[9px] text-stone-400 border-t border-white/5">
                  <span><strong>Native Origin:</strong> {selectedHerb.plantOrigin}</span>
                  <span><strong>Parts Harvested:</strong> {selectedHerb.partsUsed.join(', ')}</span>
                </div>
              </div>

              {/* Mind & Body benefits */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-indigo-950/20 border border-indigo-500/20 space-y-2">
                  <p className="text-[8px] font-black uppercase tracking-widest text-indigo-300 flex items-center gap-1.5">
                    <Brain size={12} /> Mind & Neurochemical Impact
                  </p>
                  <ul className="space-y-1.5 text-xs text-stone-300">
                    {selectedHerb.mindBenefits.map((b, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-indigo-400 mt-1">•</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-500/20 space-y-2">
                  <p className="text-[8px] font-black uppercase tracking-widest text-rose-300 flex items-center gap-1.5">
                    <Heart size={12} /> Body & Physiological Impact
                  </p>
                  <ul className="space-y-1.5 text-xs text-stone-300">
                    {selectedHerb.bodyBenefits.map((b, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-rose-400 mt-1">•</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Phytochemistry & Research */}
              <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/8 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400">
                    Active Phytochemicals & Clinical Research
                  </p>
                  <span className="px-2 py-0.5 rounded-full text-[8px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                    {selectedHerb.scientificResearch.evidenceLevel}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedHerb.activePhytochemicals.map(p => (
                    <div key={p.name} className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
                      <p className="text-[10px] font-bold text-emerald-200">{p.name}</p>
                      <p className="text-[8px] text-stone-400 mt-0.5 leading-relaxed">{p.mechanism}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-stone-300 leading-relaxed pt-2 border-t border-white/5">
                  {selectedHerb.scientificResearch.summary}
                </p>
                <div className="space-y-1 text-[8px] text-stone-400 italic">
                  {selectedHerb.scientificResearch.citations.map((c, i) => (
                    <p key={i}>Ref: {c}</p>
                  ))}
                </div>
              </div>

              {/* Traditional energetics */}
              <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/20 space-y-2">
                <p className="text-[8px] font-black uppercase tracking-widest text-amber-300">Traditional Energetics & Historical Lore</p>
                {selectedHerb.traditionalEnergetics.ayurvedicDosha && (
                  <p className="text-xs text-stone-300"><strong className="text-amber-200">Ayurveda:</strong> {selectedHerb.traditionalEnergetics.ayurvedicDosha}</p>
                )}
                {selectedHerb.traditionalEnergetics.tcmTasteNature && (
                  <p className="text-xs text-stone-300"><strong className="text-amber-200">TCM:</strong> {selectedHerb.traditionalEnergetics.tcmTasteNature}</p>
                )}
                <p className="text-xs text-stone-400 italic leading-relaxed">{selectedHerb.traditionalEnergetics.historicalContext}</p>
              </div>

              {/* Preparations & Dosage */}
              <div className="space-y-2">
                <p className="text-[8px] font-black uppercase tracking-widest text-emerald-400">Preparation Methods & Sacred Rituals</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedHerb.preparationMethods.map(m => (
                    <div key={m.method} className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-1">
                      <p className="text-xs font-bold text-white">{m.method}</p>
                      <p className="text-[9px] text-stone-300 leading-relaxed">{m.description}</p>
                      <p className="text-[8px] text-emerald-400 font-semibold pt-1">Ritual: {m.dosageOrRitual}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Safety & Contraindications */}
              <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-500/20 space-y-2">
                <p className="text-[8px] font-black uppercase tracking-widest text-rose-300 flex items-center gap-1.5">
                  <AlertTriangle size={12} /> Safety, Interactions & Sourcing Integrity
                </p>
                <p className="text-xs text-stone-300"><strong>Contraindications:</strong> {selectedHerb.safetyAndInteractions.contraindications.join('; ')}</p>
                <p className="text-xs text-stone-300"><strong>Medication Interactions:</strong> {selectedHerb.safetyAndInteractions.potentialInteractions.join('; ')}</p>
                <p className="text-[9px] text-stone-400 pt-1 border-t border-white/5">
                  <strong>Sourcing Standard:</strong> {selectedHerb.safetyAndInteractions.sourcingIntegrity}
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ACUPRESSURE & MERIDIAN POINT MODAL WITH INTERACTIVE TIMER */}
      <AnimatePresence>
        {selectedPoint && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-stone-950 border border-teal-500/30 rounded-[2.5rem] shadow-2xl p-6 sm:p-8 space-y-6 text-white no-scrollbar"
            >
              <button
                onClick={() => { stopAcupressureTimer(); setSelectedPoint(null); }}
                className="absolute top-5 right-5 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>

              {/* Header */}
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center font-black text-teal-300 text-xl shrink-0">
                  {selectedPoint.code}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-300 border border-teal-500/20">
                      {selectedPoint.meridian}
                    </span>
                    <span className="text-[9px] text-stone-400">Element: {selectedPoint.elementAssociation}</span>
                  </div>
                  <h3 className="text-2xl font-black mt-1">
                    {selectedPoint.pinyinName} ({selectedPoint.englishName})
                  </h3>
                  <p className="text-xs text-stone-400">{selectedPoint.bodyZone}</p>
                </div>
              </div>

              {/* Pregnancy Warning if applicable */}
              {selectedPoint.isContraindicatedInPregnancy && (
                <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-500/40 flex items-center gap-3 text-rose-200">
                  <AlertTriangle size={18} className="text-rose-400 shrink-0" />
                  <p className="text-xs font-bold leading-relaxed">
                    {selectedPoint.precautions}
                  </p>
                </div>
              )}

              {/* Exact Location & Anatomy */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/8 space-y-2">
                <p className="text-[8px] font-black uppercase tracking-widest text-teal-400">Precise Anatomical Location</p>
                <p className="text-xs text-stone-200 leading-relaxed font-medium">{selectedPoint.anatomicalLocation}</p>
              </div>

              {/* Side-by-Side: Tradition vs Modern Science */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl bg-amber-950/20 border border-amber-500/25 space-y-2">
                  <p className="text-[8px] font-black uppercase tracking-widest text-amber-300 flex items-center gap-1.5">
                    <Sun size={12} /> What Tradition Says (Jingluo & Qi)
                  </p>
                  <p className="text-xs text-stone-300 leading-relaxed">
                    {selectedPoint.traditionalIndication}
                  </p>
                </div>

                <div className="p-5 rounded-2xl bg-teal-950/20 border border-teal-500/25 space-y-2">
                  <p className="text-[8px] font-black uppercase tracking-widest text-teal-300 flex items-center gap-1.5">
                    <Brain size={12} /> What Modern Science Says (Neuro-Fascial)
                  </p>
                  <p className="text-xs text-stone-300 leading-relaxed">
                    {selectedPoint.scientificMechanism.clinicalEvidence}
                  </p>
                  <div className="pt-2 border-t border-white/5 space-y-1">
                    <p className="text-[7px] font-bold uppercase tracking-wider text-teal-400">Validated Biomarkers:</p>
                    <ul className="text-[8px] text-stone-400 space-y-0.5">
                      {selectedPoint.scientificMechanism.activeBiomarkers.map((b, i) => (
                        <li key={i}>• {b}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {/* INTERACTIVE GUIDED ACUPRESSURE TIMER */}
              <div className="p-6 rounded-[2rem] bg-gradient-to-br from-teal-950/40 via-stone-900 to-emerald-950/40 border border-teal-500/30 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity size={14} className="text-teal-400" />
                    <h4 className="text-xs font-black uppercase tracking-widest text-white">
                      Interactive Acupressure Guide
                    </h4>
                  </div>
                  <span className="text-[9px] text-teal-300 font-bold">
                    Depth: {selectedPoint.howToStimulate.pressureDepth.split('.')[0]}
                  </span>
                </div>

                <p className="text-xs text-stone-300 leading-relaxed">
                  <strong>Technique:</strong> {selectedPoint.howToStimulate.technique}
                </p>

                {/* Live Circular Breathing & Pressure Interface */}
                <div className="p-5 rounded-2xl bg-black/40 border border-white/8 flex flex-col sm:flex-row items-center justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div className="relative w-24 h-24 flex items-center justify-center">
                      <div className={`absolute inset-0 rounded-full border-2 border-teal-400/30 ${timerRunning ? 'animate-ping' : ''}`} />
                      <div className="w-20 h-20 rounded-full bg-teal-500/10 border border-teal-400/40 flex flex-col items-center justify-center">
                        <span className="text-2xl font-black tabular-nums text-white">
                          {timerRunning ? timerSecondsLeft : selectedPoint.howToStimulate.durationSeconds}s
                        </span>
                        <span className="text-[7px] font-bold uppercase tracking-widest text-teal-300">
                          {timerRunning ? 'Applying' : 'Duration'}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <p className="text-[9px] font-black uppercase tracking-wider text-teal-300">
                        Rhythmic Breath Synchrony:
                      </p>
                      <p className="text-sm font-bold text-white">
                        {timerRunning ? breathPhase : 'Inhale 4s · Exhale 6s'}
                      </p>
                      <p className="text-[8px] text-stone-400">
                        {selectedPoint.howToStimulate.breathingSync}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {!timerRunning ? (
                      <button
                        onClick={() => startAcupressureTimer(selectedPoint.howToStimulate.durationSeconds)}
                        className="px-5 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-black text-xs font-black uppercase tracking-widest transition-transform hover:scale-105 active:scale-95 flex items-center gap-2"
                      >
                        <Play size={12} /> Start Practice
                      </button>
                    ) : (
                      <button
                        onClick={stopAcupressureTimer}
                        className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2"
                      >
                        <Pause size={12} /> Pause
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MINERAL DEEP DIVE MODAL */}
      <AnimatePresence>
        {selectedMineral && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-stone-950 border border-amber-500/30 rounded-[2.5rem] shadow-2xl p-6 sm:p-8 space-y-6 text-white no-scrollbar"
            >
              <button
                onClick={() => setSelectedMineral(null)}
                className="absolute top-5 right-5 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white"
              >
                <X size={16} />
              </button>

              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center font-black text-amber-300 text-2xl">
                  {selectedMineral.elementSymbol}
                </div>
                <div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-amber-400">{selectedMineral.category}</span>
                  <h3 className="text-2xl font-black">{selectedMineral.name}</h3>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/8 space-y-1">
                <p className="text-[8px] font-black uppercase tracking-widest text-amber-400">Biological Role & ATP Cofactor</p>
                <p className="text-xs text-stone-200 leading-relaxed">{selectedMineral.biologicalRole}</p>
              </div>

              {/* Bioavailability Forms */}
              <div className="space-y-2">
                <p className="text-[8px] font-black uppercase tracking-widest text-amber-400">Bioavailable Forms & Therapeutic Uses</p>
                <div className="space-y-2">
                  {selectedMineral.formsAndBioavailability.map(f => (
                    <div key={f.form} className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-white">{f.form}</p>
                        <span className="text-[8px] font-semibold text-amber-300">{f.bestFor}</span>
                      </div>
                      <p className="text-[8px] text-stone-400">{f.absorptionNotes}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dietary sources & Deficiency signs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-1">
                  <p className="text-[8px] font-black uppercase tracking-widest text-amber-300">Rich Food Sources</p>
                  <p className="text-xs text-stone-300 leading-relaxed">{selectedMineral.dietarySources.join(', ')}</p>
                </div>
                <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-500/20 space-y-1">
                  <p className="text-[8px] font-black uppercase tracking-widest text-rose-300">Deficiency Signs</p>
                  <p className="text-xs text-stone-300 leading-relaxed">{selectedMineral.deficiencySigns.join('; ')}</p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ENZYME DEEP DIVE MODAL */}
      <AnimatePresence>
        {selectedEnzyme && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-stone-950 border border-teal-500/30 rounded-[2.5rem] shadow-2xl p-6 sm:p-8 space-y-6 text-white no-scrollbar"
            >
              <button
                onClick={() => setSelectedEnzyme(null)}
                className="absolute top-5 right-5 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white"
              >
                <X size={16} />
              </button>

              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center font-black text-teal-300 text-2xl">
                  <Zap size={24} />
                </div>
                <div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-teal-400">{selectedEnzyme.type}</span>
                  <h3 className="text-2xl font-black">{selectedEnzyme.name}</h3>
                  <p className="text-xs text-stone-300">Natural Source: {selectedEnzyme.naturalSource}</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/8 space-y-1">
                <p className="text-[8px] font-black uppercase tracking-widest text-teal-400">Mechanism of Action</p>
                <p className="text-xs text-stone-200 leading-relaxed">{selectedEnzyme.mechanismOfAction}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-500/20 space-y-1.5">
                  <p className="text-[8px] font-black uppercase tracking-widest text-rose-300 flex items-center gap-1.5">
                    <Heart size={12} /> Body & Tissue Benefits
                  </p>
                  <ul className="space-y-1 text-xs text-stone-300">
                    {selectedEnzyme.bodyBenefits.map((b, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-rose-400 mt-1">•</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 rounded-2xl bg-indigo-950/20 border border-indigo-500/20 space-y-1.5">
                  <p className="text-[8px] font-black uppercase tracking-widest text-indigo-300 flex items-center gap-1.5">
                    <Brain size={12} /> Cognitive & Brain Benefits
                  </p>
                  <ul className="space-y-1 text-xs text-stone-300">
                    {selectedEnzyme.mindBenefits.map((b, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-indigo-400 mt-1">•</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
                <p className="text-[8px] font-black uppercase tracking-widest text-teal-400">Clinical Research</p>
                <p className="text-xs text-stone-300 leading-relaxed">{selectedEnzyme.clinicalResearch.summary}</p>
                <ul className="space-y-1 text-[9px] text-stone-400 list-disc pl-4">
                  {selectedEnzyme.clinicalResearch.keyFindings.map((k, i) => (
                    <li key={i}>{k}</li>
                  ))}
                </ul>
              </div>

              <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/20 space-y-1">
                <p className="text-[8px] font-black uppercase tracking-widest text-amber-300">Optimal Administration Protocol</p>
                <p className="text-xs text-stone-200 leading-relaxed">{selectedEnzyme.optimalAdministration}</p>
                <p className="text-[8px] text-rose-300 pt-1 font-semibold">{selectedEnzyme.safetyNotes}</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* FOOD & TONIC DEEP DIVE MODAL */}
      <AnimatePresence>
        {selectedFood && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-stone-950 border border-rose-500/30 rounded-[2.5rem] shadow-2xl p-6 sm:p-8 space-y-6 text-white no-scrollbar"
            >
              <button
                onClick={() => setSelectedFood(null)}
                className="absolute top-5 right-5 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white"
              >
                <X size={16} />
              </button>

              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-rose-400">{selectedFood.category} · {selectedFood.originTradition}</span>
                <h3 className="text-2xl font-black mt-1">{selectedFood.name}</h3>
                <p className="text-xs text-stone-300">{selectedFood.subtitle}</p>
              </div>

              <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/20 space-y-1">
                <p className="text-[8px] font-black uppercase tracking-widest text-amber-300">Traditional Lineage & Lore</p>
                <p className="text-xs text-stone-300 leading-relaxed italic">{selectedFood.traditionalLore}</p>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/8 space-y-1">
                <p className="text-[8px] font-black uppercase tracking-widest text-rose-400">Scientific Validation & Bioactive Synergies</p>
                <p className="text-xs text-stone-200 leading-relaxed">{selectedFood.scientificBacking}</p>
                <div className="pt-2 flex flex-wrap gap-1.5">
                  {selectedFood.keyCompounds.map((c, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full text-[8px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/25">
                      {c}
                    </span>
                  ))}
                </div>
              </div>

              {/* Recipe & Ritual */}
              <div className="p-6 rounded-[2rem] bg-gradient-to-br from-rose-950/30 via-stone-900 to-amber-950/30 border border-rose-500/30 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black uppercase tracking-widest text-rose-300 flex items-center gap-2">
                    <Droplets size={14} /> Sacred Preparation Ritual
                  </h4>
                  <span className="text-[8px] text-stone-400">Timing: {selectedFood.recipeOrRitual.optimalTiming}</span>
                </div>

                <div className="space-y-2">
                  <p className="text-[8px] font-black uppercase tracking-widest text-stone-400">Ingredients</p>
                  <ul className="space-y-1 text-xs text-stone-200">
                    {selectedFood.recipeOrRitual.ingredients.map((ing, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-rose-400">✓</span>
                        <span>{ing}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2 pt-2 border-t border-white/5">
                  <p className="text-[8px] font-black uppercase tracking-widest text-stone-400">Step-by-Step Directions</p>
                  <ol className="space-y-2 text-xs text-stone-300 list-decimal pl-4">
                    {selectedFood.recipeOrRitual.steps.map((step, i) => (
                      <li key={i} className="leading-relaxed">{step}</li>
                    ))}
                  </ol>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MIND-BODY & MARTIAL MOVEMENT MODAL */}
      <AnimatePresence>
        {selectedPractice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-stone-950 border border-sky-500/30 rounded-[2.5rem] shadow-2xl p-6 sm:p-8 space-y-6 text-white no-scrollbar"
            >
              <button
                onClick={() => setSelectedPractice(null)}
                className="absolute top-5 right-5 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white"
              >
                <X size={16} />
              </button>

              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-sky-400">{selectedPractice.system} · {selectedPractice.lineage}</span>
                <h3 className="text-2xl font-black mt-1">{selectedPractice.name}</h3>
                <p className="text-xs text-stone-300 mt-2 leading-relaxed">{selectedPractice.summary}</p>
              </div>

              {/* Side by side: Tradition vs Science */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/20 space-y-1.5">
                  <p className="text-[8px] font-black uppercase tracking-widest text-amber-300 flex items-center gap-1.5">
                    <Sun size={12} /> What Tradition Says (Qi & Dantian)
                  </p>
                  <p className="text-xs text-stone-300 leading-relaxed">{selectedPractice.whatTraditionSays}</p>
                </div>

                <div className="p-4 rounded-2xl bg-sky-950/20 border border-sky-500/20 space-y-1.5">
                  <p className="text-[8px] font-black uppercase tracking-widest text-sky-300 flex items-center gap-1.5">
                    <Brain size={12} /> What Modern Science Says (Neuro-Vagal)
                  </p>
                  <p className="text-xs text-stone-300 leading-relaxed">{selectedPractice.whatModernScienceSays}</p>
                </div>
              </div>

              {/* Core movements & breath sync */}
              <div className="space-y-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-sky-400">Core Kinetic Movements & Breath Pacing</p>
                <div className="space-y-3">
                  {selectedPractice.coreMovementsOrTechniques.map((m, i) => (
                    <div key={i} className="p-4 rounded-2xl bg-white/[0.02] border border-white/6 space-y-2">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-bold text-white">{m.name}</h5>
                        <span className="text-[8px] text-sky-300 font-semibold">{m.targetFasciaOrEnergyConduit}</span>
                      </div>
                      <p className="text-xs text-stone-300 leading-relaxed">{m.instruction}</p>
                      <div className="p-2 rounded-xl bg-sky-950/30 border border-sky-500/20 text-[9px] text-sky-200">
                        <strong>Breath Cadence:</strong> {m.breathCoordination}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* SYNTHESIS ESSAY READER MODAL */}
      <AnimatePresence>
        {activeEssayId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-stone-950 border border-amber-500/30 rounded-[2.5rem] shadow-2xl p-6 sm:p-10 space-y-6 text-white no-scrollbar"
            >
              <button
                onClick={() => setActiveEssayId(null)}
                className="absolute top-5 right-5 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white"
              >
                <X size={16} />
              </button>

              {(() => {
                const essay = HOLISTIC_SYNTHESIS_ESSAYS.find(e => e.id === activeEssayId);
                if (!essay) return null;
                return (
                  <div className="space-y-6">
                    <div className="space-y-2 border-b border-white/10 pb-4">
                      <span className="text-[9px] font-black uppercase tracking-widest text-amber-400">
                        {essay.author} · {essay.readTimeMinutes} min read
                      </span>
                      <h2 className="text-2xl sm:text-3xl font-black">{essay.title}</h2>
                      <p className="text-sm text-stone-300/80 italic">{essay.subtitle}</p>
                    </div>

                    <div className="prose prose-invert prose-stone max-w-none text-stone-300 text-sm leading-relaxed space-y-4">
                      {essay.content.split('\n\n').map((paragraph, idx) => (
                        <p key={idx} className="whitespace-pre-line">
                          {paragraph.trim()}
                        </p>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default HolisticHealthView;
