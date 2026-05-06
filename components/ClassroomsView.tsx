import React, { useState, useEffect, Suspense } from 'react';
import { 
  BookOpen, 
  Video, 
  FileText, 
  Users, 
  Plus, 
  Search, 
  GraduationCap, 
  Clock, 
  CheckCircle, 
  PlayCircle, 
  MessageSquare,
  ChevronRight,
  ArrowLeft,
  Upload,
  BarChart3,
  Lock,
  Globe,
  Star,
  Layers,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Classroom, Lesson, Assignment, Submission, ProgressReport, ClassroomModule } from '../types';
import { fetchClassrooms, enrollInClassroom, createClassroom, auth, fetchClassroomModules, createClassroomModule, deleteClassroomModule } from '../services/backendService';
import SolarSystemModule from './SolarSystemModule';
import PlantBiologyModule from './PlantBiologyModule';
import ErrorBoundary from './ErrorBoundary';

interface ClassroomsViewProps {
  onBack: () => void;
  user: any;
}

const ClassroomsView: React.FC<ClassroomsViewProps> = ({ onBack, user }) => {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [modules, setModules] = useState<ClassroomModule[]>([]);
  const [selectedClass, setSelectedClass] = useState<Classroom | null>(null);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'EXPLORE' | 'MY_CLASSES' | 'TEACHING' | 'MODULES'>('MODULES');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showModuleModal, setShowModuleModal] = useState(false);
  const [newModule, setNewModule] = useState<Partial<ClassroomModule>>({
    name: '',
    description: '',
    url: '',
    coverArt: ''
  });

  useEffect(() => {
    loadClassrooms();
    loadModules();
  }, []);

  const loadClassrooms = async () => {
    setLoading(true);
    const data = await fetchClassrooms();
    setClassrooms(data);
    setLoading(false);
  };

  const loadModules = async () => {
    const data = await fetchClassroomModules();
    const solarSystemDefault: ClassroomModule = {
      id: 'default_solar_system',
      name: 'The Solar System',
      description: 'Interactive 3D exploration of our cosmic neighborhood. Explore planets, moons, and research probes.',
      url: 'SOLAR_SYSTEM',
      coverArt: 'https://images.unsplash.com/photo-1454789548928-1f63080f5509?q=80&w=1000&auto=format&fit=crop',
      createdAt: 0,
      isActive: true
    };

    const plantBiologyDefault: ClassroomModule = {
      id: 'default_plant_biology',
      name: 'Plant Architecture',
      description: 'Hand-drawn interactive exploration of plant cellular engines and the miracle of photosynthesis.',
      url: 'PLANT_BIOLOGY',
      coverArt: 'https://images.unsplash.com/photo-1599819177626-b50f9dd21c9b?q=80&w=2000&auto=format&fit=crop',
      createdAt: 0,
      isActive: true
    };
    
    // Check if defaults already exist in data to avoid duplicates if admin added it manually
    const finalModules = [...data];
    if (!data.some(m => m.url === 'SOLAR_SYSTEM')) finalModules.unshift(solarSystemDefault);
    if (!data.some(m => m.url === 'PLANT_BIOLOGY')) finalModules.unshift(plantBiologyDefault);
    
    setModules(finalModules);
  };

  const handleCreateModule = async () => {
    if (!newModule.name || !newModule.url) return alert('Please fill in module name and experience URL');
    await createClassroomModule(newModule);
    setShowModuleModal(false);
    setNewModule({ name: '', description: '', url: '', coverArt: '' });
    loadModules();
  };

  const handleDeleteModule = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this module?')) return;
    await deleteClassroomModule(id);
    loadModules();
  };

  const isAdmin = user?.role === 'admin' || user?.email === 'kmoody2003@gmail.com';

  const handleEnroll = async (classId: string) => {
    if (!user) return alert('Please sign in to enroll');
    await enrollInClassroom(classId);
    loadClassrooms();
    alert('Enrolled successfully!');
  };

  const myClasses = classrooms.filter(c => c.enrolledStudents.includes(user?.uid || ''));
  const teachingClasses = classrooms.filter(c => c.ownerId === user?.uid);

  if (selectedClass) {
    return <ClassroomDetail classroom={selectedClass} onBack={() => setSelectedClass(null)} user={user} />;
  }

    if (selectedModule === 'SOLAR_SYSTEM') {
    return (
      <ErrorBoundary>
        <Suspense fallback={
          <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 border-2 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-primary animate-pulse">Syncing Star Maps...</p>
          </div>
        }>
          <SolarSystemModule onBack={() => setSelectedModule(null)} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (selectedModule === 'PLANT_BIOLOGY') {
    return (
      <ErrorBoundary>
        <Suspense fallback={
          <div className="min-h-screen bg-[#FDFCF0] flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 border-2 border-[#3E4A35]/20 border-t-[#3E4A35] rounded-full animate-spin mb-4" />
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-[#3E4A35] animate-pulse">Gathering Botanical Samples...</p>
          </div>
        }>
          <PlantBiologyModule onBack={() => setSelectedModule(null)} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <div className="min-h-screen bg-transparent p-6 lg:p-12 text-[var(--text-primary)]">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-12">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-3 bg-[var(--card-bg)] hover:bg-[var(--card-bg)]/80 rounded-2xl transition-all border border-[var(--border-color)]">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Classrooms</h1>
              <p className="text-[10px] font-bold text-[var(--text-primary)] opacity-40 uppercase tracking-widest">Virtual Learning Sanctuary</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-primary)] opacity-20" size={18} />
              <input 
                type="text" 
                placeholder="Search classes, teachers, topics..."
                className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl py-3 pl-12 pr-6 text-sm focus:outline-none focus:border-[var(--text-secondary)]/30 w-full lg:w-80 text-[var(--text-primary)]"
              />
            </div>
            <button 
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-3 bg-[var(--text-primary)] text-[var(--bg-color)] rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-all"
            >
              <Plus size={16} />
              Create Class
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-10 p-1 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-full w-fit">
          {[
            { id: 'MODULES', label: 'Modules', icon: Sparkles },
            { id: 'EXPLORE', label: 'Explore Classes', icon: Globe },
            { id: 'MY_CLASSES', label: 'My Learning', icon: GraduationCap },
            { id: 'TEACHING', label: 'Teaching', icon: Users }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                activeTab === tab.id 
                  ? 'bg-[var(--text-primary)] text-[var(--bg-color)]' 
                  : 'text-[var(--text-primary)] opacity-40 hover:opacity-100 hover:bg-[var(--card-bg)]/50'
              }`}
            >
              {/* @ts-ignore */}
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {activeTab === 'MODULES' && (
             <>
               {isAdmin && (
                 <motion.button 
                   initial={{ opacity: 0, y: 20 }}
                   animate={{ opacity: 1, y: 0 }}
                   onClick={() => setShowModuleModal(true)}
                   className="group relative aspect-[9/16] bg-[var(--card-bg)] border border-dashed border-[var(--border-color)] rounded-[2.5rem] flex flex-col items-center justify-center gap-4 hover:border-[var(--text-secondary)]/40 transition-all font-bebas text-xl tracking-widest text-[var(--text-primary)] opacity-40 hover:opacity-100"
                 >
                   <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white group-hover:text-black transition-all">
                    <Plus size={32} />
                   </div>
                   Setup Module
                 </motion.button>
               )}
               
               {modules.map((module, idx) => (
                 <motion.div 
                    key={module.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => setSelectedModule(module.url)}
                    className="group relative aspect-[9/16] bg-[var(--bg-color)] border border-[var(--border-color)] rounded-[2.5rem] overflow-hidden hover:border-[var(--text-secondary)]/50 transition-all cursor-pointer shadow-2xl"
                  >
                      <img 
                        src={module.coverArt || "https://images.unsplash.com/photo-1454789548928-1f63080f5509?q=80&w=1000&auto=format&fit=crop"} 
                        className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700"
                        alt={module.name}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-color)] via-[var(--bg-color)]/40 to-transparent" />
                      
                      {isAdmin && module.id !== 'default_solar_system' && module.id !== 'default_plant_biology' && (
                        <button 
                          onClick={(e) => handleDeleteModule(module.id, e)}
                          className="absolute top-6 right-6 p-2 bg-red-500/20 text-red-500 rounded-xl opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white"
                        >
                          <FileText size={16} /> {/* Using FileText as a generic icon or could use Trash if available */}
                        </button>
                      )}

                      <div className="absolute inset-0 p-8 flex flex-col justify-end">
                        <div className="flex items-center gap-2 mb-4">
                          <Star className="text-[var(--text-secondary)] fill-[var(--text-secondary)]" size={12} />
                          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-secondary)]">Classroom Module {String(idx + 1).padStart(2, '0')}</span>
                        </div>
                        <h3 className="text-4xl font-black uppercase tracking-tightest leading-[0.9] mb-4 group-hover:scale-105 transition-transform origin-left">{module.name}</h3>
                        <p className="text-[10px] text-[var(--text-primary)] opacity-40 uppercase tracking-widest leading-loose mb-8 line-clamp-3">
                          {module.description}
                        </p>
                        
                        <div className="flex items-center justify-between pointer-events-none">
                          <span className="text-[10px] font-black uppercase tracking-widest text-[#00FF00]">Free Access</span>
                          <div className="w-12 h-12 rounded-full border border-[var(--border-color)] flex items-center justify-center group-hover:bg-[var(--text-primary)] group-hover:text-[var(--bg-color)] transition-all">
                            <ChevronRight size={20} />
                          </div>
                        </div>
                      </div>
                  </motion.div>
               ))}

               {modules.length === 0 && !isAdmin && (
                 <div className="col-span-full py-32 text-center bg-white/5 rounded-[3rem] border border-white/10">
                   <Sparkles className="mx-auto mb-6 text-white/20" size={48} />
                   <h3 className="text-2xl font-black uppercase tracking-widest mb-2 font-bebas">No Modules Loaded</h3>
                   <p className="text-[10px] text-white/40 uppercase tracking-widest">Check back later for cosmic learning experiences.</p>
                 </div>
               )}
             </>
          )}

          {activeTab !== 'MODULES' && (activeTab === 'EXPLORE' ? classrooms : activeTab === 'MY_CLASSES' ? myClasses : teachingClasses).map(cls => (
            <motion.div 
              key={cls.id}
              layoutId={cls.id}
              onClick={() => setSelectedClass(cls)}
              className="group relative bg-white/5 border border-white/10 rounded-[2.5rem] overflow-hidden hover:border-white/30 transition-all cursor-pointer"
            >
              <div className="aspect-video relative">
                <img src={cls.thumbnailUrl || null} className="w-full h-full object-cover" alt={cls.title} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <div className="absolute top-4 left-4 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-xl border border-white/10 flex items-center gap-2">
                  <span className="text-[8px] font-black uppercase tracking-widest text-white/60">{cls.category}</span>
                </div>
                {cls.price > 0 && (
                  <div className="absolute top-4 right-4 px-3 py-1.5 bg-small-orange rounded-xl flex items-center gap-2 shadow-xl">
                    <span className="text-[10px] font-black text-white">${cls.price}</span>
                  </div>
                )}
              </div>
              
              <div className="p-8">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded-full bg-white/10 border border-white/10 flex items-center justify-center">
                    <Users size={12} className="text-white/40" />
                  </div>
                  <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{cls.ownerName}</span>
                </div>
                
                <h3 className="text-xl font-black uppercase tracking-tightest mb-2 group-hover:text-[var(--text-secondary)] transition-colors">{cls.title}</h3>
                <p className="text-[10px] text-[var(--text-primary)]/40 uppercase tracking-widest leading-relaxed mb-6 line-clamp-2">
                  {cls.description}
                </p>

                <div className="flex items-center justify-between pt-6 border-t border-white/5">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <BookOpen size={14} className="text-white/20" />
                      <span className="text-[10px] font-black text-white/40">{cls.lessons.length} Lessons</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Users size={14} className="text-white/20" />
                      <span className="text-[10px] font-black text-white/40">{cls.enrolledStudents.length} Students</span>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-white/20 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Create Module Modal */}
      <AnimatePresence>
        {showModuleModal && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 text-white">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowModuleModal(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-lg bg-[var(--bg-color)] border border-[var(--border-color)] rounded-[3rem] p-10 overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[var(--text-secondary)] via-[var(--text-primary)] to-[var(--text-secondary)]" />
              
              <h2 className="text-4xl font-black uppercase tracking-tightest mb-8 font-bebas text-[var(--text-primary)]">Setup New Module</h2>
              
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/40 block mb-2">Module Name</label>
                  <input 
                    type="text" 
                    value={newModule.name}
                    onChange={(e) => setNewModule({...newModule, name: e.target.value})}
                    placeholder="e.g. The Quantum Realm"
                    className="w-full bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-4 text-sm focus:outline-none focus:border-[var(--text-secondary)] transition-all text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/40 block mb-2">Experience Route/ID (Internal)</label>
                  <input 
                    type="text" 
                    value={newModule.url}
                    onChange={(e) => setNewModule({...newModule, url: e.target.value})}
                    placeholder="e.g. SOLAR_SYSTEM"
                    className="w-full bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-4 text-sm focus:outline-none focus:border-[var(--text-secondary)] transition-all font-mono text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/40 block mb-2">Description</label>
                  <textarea 
                    value={newModule.description}
                    onChange={(e) => setNewModule({...newModule, description: e.target.value})}
                    placeholder="Briefly describe the learning experience..."
                    rows={3}
                    className="w-full bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-4 text-sm focus:outline-none focus:border-[var(--text-secondary)] transition-all resize-none text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/40 block mb-2">Cover Art URL</label>
                  <input 
                    type="text" 
                    value={newModule.coverArt}
                    onChange={(e) => setNewModule({...newModule, coverArt: e.target.value})}
                    placeholder="https://images.unsplash.com/..."
                    className="w-full bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-4 text-sm focus:outline-none focus:border-[var(--text-secondary)] transition-all text-[var(--text-primary)]"
                  />
                </div>
                
                  <div className="flex gap-4 pt-4">
                    <button 
                      onClick={() => setShowModuleModal(false)}
                      className="flex-1 py-4 bg-[var(--card-bg)] rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-[var(--card-bg)]/80 text-[var(--text-primary)] border border-[var(--border-color)]"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleCreateModule}
                      className="flex-1 py-4 bg-[var(--text-secondary)] text-[var(--bg-color)] rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-2xl hover:scale-105 transition-all"
                    >
                      Confirm Setup
                    </button>
                  </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ClassroomDetail: React.FC<{ classroom: Classroom, onBack: () => void, user: any }> = ({ classroom, onBack, user }) => {
  const [activeTab, setActiveTab] = useState<'SYLLABUS' | 'LESSONS' | 'ASSIGNMENTS' | 'LIVE' | 'GRADES'>('SYLLABUS');
  const [isEnrolled, setIsEnrolled] = useState(classroom.enrolledStudents.includes(user?.uid || ''));
  const [isOwner] = useState(classroom.ownerId === user?.uid);

  return (
    <div className="min-h-screen bg-[var(--bg-color)] text-[var(--text-primary)]">
      {/* Hero Section */}
      <div className="relative h-[40vh] lg:h-[50vh] overflow-hidden">
        <img src={classroom.thumbnailUrl || null} className="w-full h-full object-cover opacity-40" alt="" />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-color)] via-[var(--bg-color)]/40 to-transparent" />
        
        <div className="absolute inset-0 p-6 lg:p-12 flex flex-col justify-end">
          <div className="max-w-7xl mx-auto w-full">
            <button onClick={onBack} className="mb-8 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-40 hover:opacity-100 transition-all">
              <ArrowLeft size={16} />
              Back to Explore
            </button>
            
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
              <div className="max-w-3xl">
                <div className="flex items-center gap-3 mb-4">
                  <span className="px-3 py-1 bg-white/10 backdrop-blur-md rounded-lg text-[8px] font-black uppercase tracking-widest border border-white/10">
                    {classroom.category}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-white text-black flex items-center justify-center">
                      <GraduationCap size={12} />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Taught by {classroom.ownerName}</span>
                  </div>
                </div>
                <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">
                  {classroom.title}
                </h1>
                <p className="text-sm lg:text-base text-white/40 uppercase tracking-widest leading-relaxed">
                  {classroom.description}
                </p>
              </div>

              {!isEnrolled && !isOwner && (
                <button 
                  onClick={() => enrollInClassroom(classroom.id)}
                  className="px-12 py-6 bg-white text-black rounded-[2rem] text-sm font-black uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_50px_rgba(255,255,255,0.2)]"
                >
                  Enroll Now {classroom.price > 0 ? `- $${classroom.price}` : '(Free)'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-6 lg:p-12">
        <div className="flex flex-col lg:flex-row gap-12">
          {/* Left: Navigation */}
          <div className="lg:w-64 flex-shrink-0">
            <div className="sticky top-12 space-y-2">
              {[
                { id: 'SYLLABUS', label: 'Syllabus', icon: FileText },
                { id: 'LESSONS', label: 'Lessons', icon: PlayCircle, locked: !isEnrolled && !isOwner },
                { id: 'ASSIGNMENTS', label: 'Assignments', icon: BookOpen, locked: !isEnrolled && !isOwner },
                { id: 'LIVE', label: 'Live Session', icon: Video, locked: !isEnrolled && !isOwner },
                { id: 'GRADES', label: 'Progress', icon: BarChart3, locked: !isEnrolled && !isOwner }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => !tab.locked && setActiveTab(tab.id as any)}
                  className={`w-full flex items-center justify-between p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    activeTab === tab.id 
                      ? 'bg-white text-black' 
                      : 'text-white/40 hover:text-white hover:bg-white/5'
                  } ${tab.locked ? 'opacity-30 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    {/* @ts-ignore */}
                    <tab.icon size={16} />
                    {tab.label}
                  </div>
                  {tab.locked && <Lock size={12} />}
                </button>
              ))}
            </div>
          </div>

          {/* Right: Tab Content */}
          <div className="flex-1 min-h-[600px]">
            <AnimatePresence mode="wait">
              {activeTab === 'SYLLABUS' && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="bg-white/5 border border-white/10 rounded-[3rem] p-10 lg:p-16"
                >
                  <h2 className="text-3xl font-black uppercase tracking-tightest mb-10">Course Syllabus</h2>
                  <div className="prose prose-invert max-w-none">
                    <p className="text-white/60 leading-loose whitespace-pre-wrap uppercase tracking-widest text-xs">
                      {classroom.syllabus || 'No syllabus provided yet.'}
                    </p>
                  </div>
                </motion.div>
              )}

              {activeTab === 'LESSONS' && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  {classroom.lessons.map((lesson, i) => (
                    <div key={lesson.id} className="group p-6 bg-white/5 border border-white/10 rounded-3xl flex items-center justify-between hover:border-white/30 transition-all">
                      <div className="flex items-center gap-6">
                        <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-white/20 font-black">
                          {i + 1}
                        </div>
                        <div>
                          <h4 className="text-sm font-black uppercase tracking-widest mb-1">{lesson.title}</h4>
                          <p className="text-[10px] text-white/40 uppercase tracking-widest">{lesson.type} • {lesson.description}</p>
                        </div>
                      </div>
                      <button className="p-4 bg-white/5 rounded-2xl text-white/40 group-hover:bg-white group-hover:text-black transition-all">
                        <PlayCircle size={20} />
                      </button>
                    </div>
                  ))}
                </motion.div>
              )}

              {activeTab === 'LIVE' && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center justify-center py-32 bg-white/5 border border-white/10 rounded-[3rem] text-center"
                >
                  <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mb-8 animate-pulse">
                    <Video size={32} className="text-red-500" />
                  </div>
                  <h2 className="text-3xl font-black uppercase tracking-tightest mb-4">Live Session Offline</h2>
                  <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest max-w-xs mx-auto">
                    The teacher is not currently broadcasting. Check the schedule for the next live session.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClassroomsView;
