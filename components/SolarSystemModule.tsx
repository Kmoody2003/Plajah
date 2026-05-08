import React, { useState, useRef, Suspense, useMemo } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls, Stars, PerspectiveCamera, Float, Text, Html, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, 
  Info, 
  Maximize2, 
  ChevronRight, 
  ChevronLeft, 
  Newspaper, 
  Telescope, 
  Globe, 
  Zap,
  Camera,
  Layers,
  Sparkles,
  Volume2,
  VolumeX,
  Brain
} from 'lucide-react';
import { generatePlanetInsight } from '../services/geminiService';

// Data for planets
// High quality texture maps from more reliable sources
const PLANET_TEXTURES: Record<string, string> = {
  "Sun": "https://upload.wikimedia.org/wikipedia/commons/9/99/Map_of_the_full_sun.jpg",
  "Mercury": "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/mercury.jpg",
  "Venus": "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/venus_atmosphere.jpg",
  "Earth": "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_atmos_2048.jpg",
  "Mars": "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/mars.jpg",
  "Jupiter": "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/jupiter.jpg",
  "Saturn": "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/saturn.jpg",
  "Uranus": "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/uranus.jpg",
  "Neptune": "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/neptune.jpg"
};

const SECONDARY_TEXTURES: Record<string, string> = {
  "Sun": "https://images.unsplash.com/photo-1541186877-35c7233b3a76?auto=format&fit=crop&q=80&w=2000",
  "Mercury": "https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?auto=format&fit=crop&q=80&w=2000",
  "Venus": "https://images.unsplash.com/photo-1614313913007-2b4ae8ce32d6?auto=format&fit=crop&q=80&w=2000",
  "Earth": "https://images.unsplash.com/photo-1614730321146-b6fa6a46bcb4?auto=format&fit=crop&q=80&w=2000",
  "Mars": "https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?auto=format&fit=crop&q=80&w=2000",
  "Jupiter": "https://images.unsplash.com/photo-1614314107768-6018061b5b3a?auto=format&fit=crop&q=80&w=2000",
  "Saturn": "https://images.unsplash.com/photo-1614732414444-096e3f11a633?auto=format&fit=crop&q=80&w=2000",
  "Uranus": "https://images.unsplash.com/photo-1614730321146-b6fa6a46bcb4?auto=format&fit=crop&q=80&w=2000",
  "Neptune": "https://images.unsplash.com/photo-1614313913007-2b4ae8ce32d6?auto=format&fit=crop&q=80&w=2000"
};

const PLANET_DATA = [
  {
    name: "Sun",
    color: "#FDB813",
    size: 2,
    distance: 0,
    speed: 0,
    facts: ["Center of the solar system", "Contains 99.86% of the system's mass", "Temperature at core is 15 million °C"],
    description: "The Sun is a yellow dwarf star, a hot ball of glowing gases at the heart of our solar system. Its gravity holds the solar system together, keeping everything from the biggest planets to the smallest particles of debris in its orbit.",
    stats: { temp: "5,500°C", diameter: "1.39M km", type: "Yellow Dwarf" },
    probes: ["Parker Solar Probe", "SOHO"],
    gallery: [
      "https://upload.wikimedia.org/wikipedia/commons/b/b4/The_Sun_by_the_Atmospheric_Imaging_Assembly_of_NASA%27s_Solar_Dynamics_Observatory_-_20100819.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/1/1c/Solar_Orbiter%27s_first_view_of_the_Sun.jpg"
    ]
  },
  {
    name: "Mercury",
    color: "#A5A5A5",
    size: 0.4,
    distance: 4,
    speed: 1.5,
    facts: ["Smallest planet", "No atmosphere", "Extreme temperature swings"],
    description: "Mercury is the smallest planet in our solar system and closest to the Sun—is only slightly larger than Earth's Moon. Mercury is the fastest planet, zipping around the Sun every 88 Earth days.",
    stats: { temp: "430°C to -180°C", diameter: "4,879 km", type: "Terrestrial" },
    probes: ["MESSENGER", "BepiColombo"],
    gallery: [
      "https://upload.wikimedia.org/wikipedia/commons/4/4a/Mercury_in_color_-_Prockter07-centered.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/3/30/Mercury_Ice.jpg"
    ]
  },
  {
    name: "Venus",
    color: "#E3BB76",
    size: 0.9,
    distance: 6,
    speed: 1.2,
    facts: ["Earth's twin", "Hottest planet", "Rotates backwards"],
    description: "Venus is the second planet from the Sun and is Earth's closest planetary neighbor. It's one of the four inner, terrestrial (or rocky) planets, and it's often called Earth's twin because it’s similar in size and density.",
    stats: { temp: "465°C", diameter: "12,104 km", type: "Terrestrial" },
    probes: ["Magellan", "Akatsuki"],
    gallery: [
      "https://upload.wikimedia.org/wikipedia/commons/e/e5/Venus-real_color.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/b/b2/Venus_2_Regolith.jpg"
    ]
  },
  {
    name: "Earth",
    color: "#2271B3",
    size: 1,
    distance: 9,
    speed: 1,
    facts: ["Our home", "Only known life", "Water covers 70%"],
    description: "Earth is our home planet. It is a world of water, with 70% of the surface covered by oceans. It’s the only planet in the solar system known to harbor life.",
    stats: { temp: "15°C", diameter: "12,742 km", type: "Terrestrial" },
    probes: ["DSCOVR", "Terra", "Aqua"],
    gallery: [
      "https://upload.wikimedia.org/wikipedia/commons/9/97/The_Earth_seen_from_Apollo_17.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/b/b4/The_Blue_Marble_%28remastered%29.jpg"
    ]
  },
  {
    name: "Mars",
    color: "#E27B58",
    size: 0.6,
    distance: 12,
    speed: 0.8,
    facts: ["The Red Planet", "Home to Olympus Mons", "Has frozen water"],
    description: "Mars is a dusty, cold, desert world with a very thin atmosphere. There is strong evidence Mars was—billions of years ago—much wetter and warmer, with a thicker atmosphere.",
    stats: { temp: "-63°C", diameter: "6,779 km", type: "Terrestrial" },
    probes: ["Perseverance", "Curiosity", "MRO"],
    gallery: [
      "https://upload.wikimedia.org/wikipedia/commons/0/02/OSIRIS_Mars_true_color.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/5/56/Mars_Valles_Marineris.jpg"
    ]
  },
  {
    name: "Jupiter",
    color: "#D39C7E",
    size: 1.8,
    distance: 16,
    speed: 0.5,
    facts: ["Largest planet", "Two Earths fit in Spot", "Shortcut to gravity"],
    description: "Jupiter is the largest planet in the solar system and is more than twice as massive as the other planets combined. The Great Red Spot is a centuries-old storm bigger than Earth.",
    stats: { temp: "-110°C", diameter: "139,820 km", type: "Gas Giant" },
    probes: ["Juno", "Galileo", "Voyager"],
    gallery: [
      "https://upload.wikimedia.org/wikipedia/commons/2/2b/Jupiter_and_its_shrunken_Great_Red_Spot.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/e/e1/Jupiter_by_Cassini-Huygens.jpg"
    ]
  },
  {
    name: "Saturn",
    color: "#C5AB6E",
    size: 1.5,
    distance: 21,
    speed: 0.3,
    facts: ["Jewel of the Solar System", "Complex ring system", "Density less than water"],
    description: "Saturn is the sixth planet from the Sun and the second-largest planet in our solar system. Adorned with a dazzling, complex system of icy rings, Saturn is unique in our solar system.",
    stats: { temp: "-140°C", diameter: "116,460 km", type: "Gas Giant" },
    probes: ["Cassini", "Huygens"],
    gallery: [
      "https://upload.wikimedia.org/wikipedia/commons/c/c7/Saturn_during_Equinox.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/b/b4/Saturn%27s_rings_dark_side_Mosaic.jpg"
    ]
  },
  {
    name: "Uranus",
    color: "#B5D5D5",
    size: 1.2,
    distance: 25,
    speed: 0.2,
    facts: ["Ice Giant", "Rotates on its side", "First found by telescope"],
    description: "Uranus is the seventh planet from the Sun, and has the third-largest diameter in our solar system. It was the first planet found with the aid of a telescope.",
    stats: { temp: "-195°C", diameter: "50,724 km", type: "Ice Giant" },
    probes: ["Voyager 2"],
    gallery: [
      "https://upload.wikimedia.org/wikipedia/commons/3/3d/Uranus2.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/b/bb/Uranus_rings.jpg"
    ]
  },
  {
    name: "Neptune",
    color: "#4B70DD",
    size: 1.1,
    distance: 30,
    speed: 0.15,
    facts: ["Windy planet", "Supersonic winds", "Dark cold and whipped"],
    description: "Dark, cold, and whipped by supersonic winds, ice giant Neptune is the eighth and most distant major planet in our solar system. More than 30 times as far from the Sun as Earth.",
    stats: { temp: "-201°C", diameter: "49,244 km", type: "Ice Giant" },
    probes: ["Voyager 2"],
    gallery: [
      "https://upload.wikimedia.org/wikipedia/commons/5/56/Neptune_Full.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/0/06/Neptune_Atmosphere.jpg"
    ]
  }
];

const PROBE_DATA = [
  { name: "Voyager 1", launched: "1977", status: "Interstellar Space", desc: "Longest running probe, exploring beyond the heliopause.", path: [0, 9, 16, 21, 50] },
  { name: "Parker", launched: "2018", status: "Solar Orbit", desc: "Touching the Sun's corona to study solar wind.", path: [0, 4, 0.5] },
  { name: "Perseverance", launched: "2020", status: "Mars Surface", desc: "Searching for signs of ancient microbial life on Mars.", path: [9, 12] },
  { name: "Juno", launched: "2011", status: "Jupiter Orbit", desc: "Mapping Jupiter's core and magnetic field.", path: [9, 16] }
];

const SPACE_NEWS = [
  { title: "Europa Clipper Sets Sail", source: "NASA", date: "Oct 2024", excerpt: "Journeying to Jupiter's moon Europa to search for ocean conditions suitable for life." },
  { title: "Starship's Fifth Flight", source: "SpaceX", date: "Oct 2024", excerpt: "Succesful catch of the Super Heavy booster at the launch pad marks a new era in rocketry." },
  { title: "A Giant Planet Around a Dead Star", source: "ESA", date: "Sept 2024", excerpt: "Astronomers discover a Jupiter-sized planet orbiting a white dwarf, challenging our understanding of planetary survival." }
];

const PlanetBody = ({ data, onSelect, isSelected }: { data: typeof PLANET_DATA[0], onSelect: (name: string) => void, isSelected: boolean }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const startTime = useMemo(() => Math.random() * 100, []);
  
  const [textureUrl, setTextureUrl] = useState(PLANET_TEXTURES[data.name]);
  
  // Load texture with useTexture
  const texture = useTexture(textureUrl);

  // Handle cross-origin and potential load failures by falling back to secondary source
  React.useEffect(() => {
    if (texture) {
        texture.anisotropy = 16;
        texture.needsUpdate = true;
    }
  }, [texture]);

  useFrame((state) => {
    if (!meshRef.current) return;
    const time = state.clock.getElapsedTime() + startTime;
    
    // Rotation on axis
    meshRef.current.rotation.y += data.name === "Sun" ? 0.002 : 0.01;
    
    // Orbit
    if (data.distance > 0) {
      const angle = time * data.speed * 0.1;
      meshRef.current.position.x = Math.cos(angle) * data.distance;
      meshRef.current.position.z = Math.sin(angle) * data.distance;
    }

    if (ringRef.current) {
        ringRef.current.rotation.x = Math.PI / 2;
    }
  });

  return (
    <group>
      {/* Orbit Line */}
      {data.distance > 0 && (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[data.distance - 0.02, data.distance + 0.02, 128]} />
          <meshBasicMaterial color="white" opacity={0.1} transparent />
        </mesh>
      )}

      {/* The Planet */}
      <mesh 
        ref={meshRef} 
        onClick={(e) => {
          e.stopPropagation();
          onSelect(data.name);
        }}
        onPointerOver={() => { document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { document.body.style.cursor = 'default' }}
      >
        <sphereGeometry args={[data.size, 64, 64]} />
        <meshStandardMaterial 
          map={texture}
          emissive={data.name === "Sun" ? "#FFFFFF" : "#000000"} 
          emissiveMap={data.name === "Sun" ? texture : null}
          emissiveIntensity={data.name === "Sun" ? 1.5 : 0.05} 
          roughness={0.8}
          metalness={0.1}
        />
        
        {/* Glow for Sun */}
        {data.name === "Sun" && (
            <pointLight intensity={2} color={data.color} />
        )}

        {/* Saturn's Rings */}
        {data.name === "Saturn" && (
            <mesh rotation={[-Math.PI / 2.5, 0, 0]}>
                <ringGeometry args={[data.size * 1.4, data.size * 2.4, 64]} />
                <meshStandardMaterial 
                  map={useTexture("https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/saturn_ring_alpha.png")}
                  color="#D2B48C" 
                  opacity={0.8} 
                  transparent 
                  side={THREE.DoubleSide} 
                />
            </mesh>
        )}

        {/* Selection Indicator */}
        {isSelected && (
           <Html distanceFactor={10}>
             <div className="flex flex-col items-center">
                 <div className="w-4 h-4 rounded-full bg-white animate-ping" />
                 <span className="mt-2 text-[10px] font-black uppercase tracking-widest text-white whitespace-nowrap bg-black/50 px-2 py-1 rounded">
                    Selected
                 </span>
             </div>
           </Html>
        )}
      </mesh>
    </group>
  );
};

const PlanetFallback = ({ data, onSelect, isSelected }: { data: typeof PLANET_DATA[0], onSelect: (name: string) => void, isSelected: boolean }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    const startTime = useMemo(() => Math.random() * 100, []);
    
    useFrame((state) => {
      if (!meshRef.current) return;
      const time = state.clock.getElapsedTime() + startTime;
      meshRef.current.rotation.y += data.name === "Sun" ? 0.002 : 0.01;
      if (data.distance > 0) {
        const angle = time * data.speed * 0.1;
        meshRef.current.position.x = Math.cos(angle) * data.distance;
        meshRef.current.position.z = Math.sin(angle) * data.distance;
      }
    });
  
    return (
      <group>
        {data.distance > 0 && (
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[data.distance - 0.02, data.distance + 0.02, 128]} />
            <meshBasicMaterial color="white" opacity={0.1} transparent />
          </mesh>
        )}
        <mesh ref={meshRef} onClick={() => onSelect(data.name)}>
          <sphereGeometry args={[data.size, 32, 32]} />
          <meshStandardMaterial 
            color={data.color} 
            emissive={data.name === "Sun" ? data.color : "#000000"} 
            emissiveIntensity={data.name === "Sun" ? 1.5 : 0.1} 
          />
        </mesh>
      </group>
    );
  };

class PlanetErrorBoundary extends React.Component<{ children: React.ReactNode, fallback: React.ReactNode }, { hasError: boolean }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

const Planet = (props: { data: typeof PLANET_DATA[0], onSelect: (name: string) => void, isSelected: boolean }) => {
    return (
        <PlanetErrorBoundary fallback={<PlanetFallback {...props} />}>
            <Suspense fallback={<PlanetFallback {...props} />}>
                <PlanetBody {...props} />
            </Suspense>
        </PlanetErrorBoundary>
    );
};

const SolarSystemModule: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [selectedPlanetName, setSelectedPlanetName] = useState<string>("Earth");
  const [sidebarTab, setSidebarTab] = useState<'OVERVIEW' | 'STATS' | 'GALLERY' | 'PROBES' | 'AI_INSIGHT'>('OVERVIEW');
  const [showNews, setShowNews] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [aiInsight, setAiInsight] = useState<{ summary: string; fact: string } | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const ambientMusicRef = useRef<HTMLAudioElement | null>(null);

  const selectedPlanet = useMemo(() => 
    PLANET_DATA.find(p => p.name === selectedPlanetName) || PLANET_DATA[3]
  , [selectedPlanetName]);

  React.useEffect(() => {
    const fetchInsight = async () => {
      setIsAiLoading(true);
      const insight = await generatePlanetInsight(selectedPlanetName);
      setAiInsight(insight);
      setIsAiLoading(false);
    };
    fetchInsight();
  }, [selectedPlanetName]);

  return (
    <div className="fixed inset-0 z-[1000] bg-[var(--bg-color)] text-[var(--text-primary)] flex flex-col font-sans overflow-hidden">
      {/* Ambient Space Music */}
      <audio 
        ref={ambientMusicRef}
        src="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-17.mp3" 
        autoPlay 
        loop 
        muted={isMuted}
      />

      {/* 3D Scene Container */}
      <div className="absolute inset-0 z-0">
        <Canvas shadows gl={{ antialias: true }}>
          <Suspense fallback={null}>
            <Stars radius={300} depth={60} count={20000} factor={7} saturation={0} fade speed={1} />
            <ambientLight intensity={0.2} />
            <PerspectiveCamera makeDefault position={[0, 20, 50]} fov={45} />
            
            <group position={[0, 0, 0]}>
              {PLANET_DATA.map(planet => (
                <Planet 
                  key={planet.name} 
                  data={planet} 
                  onSelect={setSelectedPlanetName}
                  isSelected={selectedPlanetName === planet.name}
                />
              ))}
            </group>
            
            <OrbitControls 
              enablePan={false} 
              maxDistance={100} 
              minDistance={5} 
              autoRotate={!selectedPlanetName}
              autoRotateSpeed={0.5}
            />
          </Suspense>
        </Canvas>
      </div>

      {/* UI Overlay */}
      <header className="relative z-10 p-8 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-6 pointer-events-auto">
            <button 
              onClick={onBack}
              className="w-12 h-12 rounded-2xl bg-[var(--card-bg)] border border-[var(--border-color)] flex items-center justify-center hover:bg-[var(--card-bg)]/80 transition-all text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]"
            >
              <ArrowLeft size={24} />
            </button>
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tightest leading-none">Classroom Modules</h1>
              <p className="text-[10px] font-bold text-[var(--text-primary)]/40 uppercase tracking-widest mt-1">Exploration 01: The Solar System</p>
            </div>
        </div>

        <div className="flex items-center gap-4 pointer-events-auto">
            <button 
                onClick={() => setShowNews(true)}
                className="flex items-center gap-3 px-6 py-3 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/60 hover:text-[var(--text-primary)] transition-all"
            >
                <Newspaper size={16} /> Latest News
            </button>
            <div className="px-4 py-2 border border-[var(--border-color)] rounded-xl bg-[var(--card-bg)] backdrop-blur-md">
                <span className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-[0.2em]">Live Data Connection</span>
            </div>
            <button 
              onClick={() => setIsMuted(!isMuted)}
              className="w-12 h-12 rounded-2xl bg-[var(--card-bg)] border border-[var(--border-color)] flex items-center justify-center hover:bg-[var(--card-bg)]/80 transition-all text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]"
            >
              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
        </div>
      </header>

      {/* Main UI layout */}
      <div className="flex-1 relative z-10 flex pointer-events-none">
        {/* Left Planet Info Panel */}
        <motion.div 
            initial={{ x: -100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="w-full max-w-md p-10 flex flex-col pointer-events-auto"
        >
            <div className="bg-[var(--bg-color)]/60 backdrop-blur-3xl border border-[var(--border-color)] rounded-[3rem] p-10 flex-1 overflow-y-auto custom-scrollbar flex flex-col">
                <div className="mb-10">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-1.5 h-12 bg-[var(--text-secondary)] rounded-full" />
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-[0.5em] opacity-20 text-[var(--text-primary)]">Solar Object</span>
                            <h2 className="text-6xl font-black uppercase tracking-tighter leading-none text-[var(--text-primary)]">{selectedPlanet.name}</h2>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-2 mb-8 p-1 bg-[var(--card-bg)] rounded-2xl border border-[var(--border-color)]">
                    {[
                        { id: 'OVERVIEW', icon: Info },
                        { id: 'AI_INSIGHT', icon: Brain },
                        { id: 'STATS', icon: Layers },
                        { id: 'GALLERY', icon: Camera },
                        { id: 'PROBES', icon: Zap }
                    ].map(tab => (
                        <button 
                            key={tab.id}
                            onClick={() => setSidebarTab(tab.id as any)}
                            className={`flex-1 py-3 rounded-xl flex items-center justify-center transition-all ${sidebarTab === tab.id ? 'bg-[var(--text-primary)] text-[var(--bg-color)]' : 'opacity-20 hover:opacity-100 hover:bg-[var(--card-bg)]'}`}
                        >
                            <tab.icon size={18} />
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <AnimatePresence mode="wait">
                        {sidebarTab === 'AI_INSIGHT' && (
                            <motion.div 
                                key="ai_insight"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="space-y-6"
                            >
                                <div className="p-8 rounded-[2rem] bg-gradient-to-br from-[var(--text-secondary)]/10 via-[var(--text-secondary)]/5 to-transparent border border-[var(--border-color)] relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-100 transition-opacity">
                                        <Brain className="text-[var(--text-secondary)]" size={40} />
                                    </div>
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-6 flex items-center gap-2">
                                        <Sparkles size={12} /> Nano Banna 2 Scientific Rendering
                                    </h4>
                                    
                                    {isAiLoading ? (
                                        <div className="space-y-4">
                                            <div className="h-4 w-full bg-[var(--card-bg)] rounded" />
                                            <div className="h-4 w-3/4 bg-white/5 rounded" />
                                            <div className="h-4 w-5/6 bg-white/5 rounded" />
                                        </div>
                                    ) : (
                                        <div className="space-y-8">
                                            <p className="text-xl font-bebas text-[var(--text-primary)] leading-relaxed">
                                                {aiInsight?.summary}
                                            </p>
                                            <div className="p-4 bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)]">
                                                <span className="text-[8px] font-black uppercase tracking-widest opacity-40 block mb-2 text-[var(--text-primary)]">Micro-Discovery</span>
                                                <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">{aiInsight?.fact}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <p className="text-[9px] font-bold opacity-20 uppercase tracking-widest text-center px-8">
                                    AI-rendered scientific data and insights generated in real-time through the Ethereal Core.
                                </p>
                            </motion.div>
                        )}
                        {sidebarTab === 'OVERVIEW' && (
                            <motion.div 
                                key="overview"
                                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                                className="space-y-8"
                            >
                                <p className="text-lg font-medium leading-relaxed opacity-50 italic">
                                    {selectedPlanet.description}
                                </p>
                                <div className="space-y-4">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">Key Insights</h4>
                                    {selectedPlanet.facts.map((fact, i) => (
                                        <div key={i} className="flex gap-4 items-start p-4 bg-[var(--card-bg)] rounded-2xl border border-[var(--border-color)] group hover:border-[var(--text-secondary)]/30 transition-all">
                                            <Sparkles size={14} className="opacity-20 mt-1" />
                                            <p className="text-xs font-bold uppercase tracking-widest leading-loose opacity-60">{fact}</p>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        )}

                        {sidebarTab === 'STATS' && (
                            <motion.div 
                                key="stats"
                                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                                className="space-y-4"
                            >
                                <div className="p-8 bg-[var(--card-bg)] rounded-3xl border border-[var(--border-color)]">
                                    <span className="text-[10px] font-black uppercase tracking-widest opacity-20 block mb-2">Surface Temp</span>
                                    <p className="text-4xl font-black">{selectedPlanet.stats.temp}</p>
                                </div>
                                <div className="p-8 bg-[var(--card-bg)] rounded-3xl border border-[var(--border-color)]">
                                    <span className="text-[10px] font-black uppercase tracking-widest opacity-20 block mb-2">Diameter</span>
                                    <p className="text-4xl font-black">{selectedPlanet.stats.diameter}</p>
                                </div>
                                <div className="p-8 bg-[var(--card-bg)] rounded-3xl border border-[var(--border-color)]">
                                    <span className="text-[10px] font-black uppercase tracking-widest opacity-20 block mb-2">Classification</span>
                                    <p className="text-4xl font-black">{selectedPlanet.stats.type}</p>
                                </div>
                            </motion.div>
                        )}

                        {sidebarTab === 'GALLERY' && (
                            <motion.div 
                                key="gallery"
                                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                                className="grid grid-cols-1 gap-4"
                            >
                                {selectedPlanet.gallery.map((img, i) => (
                                    <div key={i} className="aspect-video rounded-3xl overflow-hidden border border-[var(--border-color)] group cursor-pointer">
                                        <img src={img || null} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all" alt="" />
                                    </div>
                                ))}
                            </motion.div>
                        )}

                        {sidebarTab === 'PROBES' && (
                            <motion.div 
                                key="probes"
                                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                                className="space-y-4"
                            >
                                {selectedPlanet.probes.map((p, i) => {
                                    const probe = PROBE_DATA.find(pd => pd.name === p) || { name: p, launched: 'Unknown', status: 'In Transit', desc: 'Exploring the depths of the object.' };
                                    return (
                                        <div key={i} className="p-6 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl hover:border-[var(--text-secondary)]/30 transition-all group">
                                            <div className="flex justify-between items-start mb-4">
                                                <div>
                                                    <h4 className="text-sm font-black uppercase tracking-widest">{probe.name}</h4>
                                                    <span className="text-[9px] font-bold opacity-20 uppercase tracking-[0.2em]">{probe.launched} Launch</span>
                                                </div>
                                                <span className="text-[8px] font-black text-[var(--text-secondary)] uppercase tracking-widest bg-[var(--text-secondary)]/10 px-2 py-1 rounded">{probe.status}</span>
                                            </div>
                                            <p className="text-[10px] opacity-40 uppercase tracking-widest leading-loose">
                                                {probe.desc}
                                            </p>
                                        </div>
                                    )
                                })}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </motion.div>

        {/* Right Nav / News */}
        <div className="flex-1 flex flex-col items-end p-10 gap-10">
            {/* News Panel */}
            <AnimatePresence>
                {showNews && (
                    <motion.div 
                        initial={{ x: 400, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 400, opacity: 0 }}
                        className="w-full max-w-sm bg-[var(--bg-color)]/80 backdrop-blur-3xl border border-[var(--border-color)] rounded-[3rem] p-10 pointer-events-auto shadow-2xl"
                    >
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-xl font-black uppercase tracking-tightest">Archive News</h3>
                            <button onClick={() => setShowNews(false)}><ArrowLeft className="rotate-180 opacity-40 hover:opacity-100" /></button>
                        </div>
                        <div className="space-y-6">
                            {SPACE_NEWS.map((news, i) => (
                                <div key={i} className="group cursor-pointer">
                                    <span className="text-[8px] font-black text-[var(--text-secondary)] uppercase tracking-[0.4em] mb-2 block">{news.date} • {news.source}</span>
                                    <h4 className="text-sm font-black uppercase tracking-widest group-hover:text-[var(--text-secondary)] transition-colors mb-2 leading-relaxed">{news.title}</h4>
                                    <p className="text-[10px] opacity-30 uppercase tracking-widest leading-loose line-clamp-2">{news.excerpt}</p>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Planet Selection Bar */}
            <div className="mt-auto flex flex-wrap justify-end gap-3 pointer-events-auto">
                {PLANET_DATA.map(p => (
                    <button 
                        key={p.name}
                        onClick={() => setSelectedPlanetName(p.name)}
                        className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${selectedPlanetName === p.name ? 'bg-[var(--text-primary)] text-[var(--bg-color)] border-[var(--text-primary)] scale-110 shadow-xl' : 'bg-[var(--bg-color)]/60 border-[var(--border-color)] opacity-40 hover:opacity-100 hover:bg-[var(--card-bg)]'}`}
                    >
                        {p.name}
                    </button>
                ))}
            </div>
        </div>
      </div>

      <footer className="relative z-10 p-10 flex items-center justify-between pointer-events-none opacity-40">
          <div className="flex gap-10 text-[9px] font-black uppercase tracking-[0.4em]">
              <span>Classroom Module 01</span>
              <span>Propulsion Index High</span>
          </div>
          <p className="text-[9px] font-black uppercase tracking-[0.4em]">Solar Exploration Terminal v1.0</p>
      </footer>
    </div>
  );
};

export default SolarSystemModule;
