// AmboProPresenter — a ProPresenter-style presenter for Ambo, in the Plajah design
// language. Additive: a new surface (AppView 'AMBO_PRO') that leaves the existing
// AmboPresenter/AmboStage untouched. Built on the canonical showModel (Show/Slide/
// LiveStack/LayerRenderer) so what the operator takes composites for real.
//
// Layout mirrors ProPresenter so their operators feel at home: Library + Playlists
// (left), a grouped slide grid (centre, the hero), audience output + media bin +
// outputs (right). Output placement is a choice (right column default, or a top bar).
// Scripture is reachable from the Library/toolbar. Palette is Plajah brand
// (purple→magenta gradient primary, orange = live wire, cyan = preview, gold =
// scripture), with per-group colour rails.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, MonitorPlay, Plus, Pencil, BookOpen, Video, Tv, Radio,
  RefreshCw, Settings, Check, Wifi, AlertCircle, Sliders, Copy, Trash2,
  Eye, Play, Layers, Ban, Power, VolumeX, EyeOff, Wand2, ChevronDown, Upload,
  Grid, RotateCcw, Repeat, Shuffle, FolderOpen, SkipForward, Film, X,
  Save, FileText, FilePlus, Download, FolderPlus, ExternalLink, Sparkles,
  Zap, Music, Smartphone, Monitor
} from 'lucide-react';
import {
  applySlide, clearLayer, newId, LAYER_ORDER, LAYER_LABEL, type LiveStack, type Show, type Slide,
  type SlideLayer, type LayerContent, type PlaylistItem,
} from '../../services/ambo/showModel';
import {
  pickWatchFolder,
  rescanDirectoryHandle,
  type WatchFolderMediaItem,
} from '../../services/mediaEngine/watchFolderLoopService';
import {
  createWatchFolderShow,
  mergeWatchFolderShow,
  getNextLoopDeckSlide,
} from '../../services/ambo/amboLoopDeckService';
import { LayerRenderer } from '../../services/ambo/layerRenderer';
import { DEMO_LIBRARY, DEMO_PLAYLIST, slideText } from '../../services/ambo/servicePlanDemo';
import {
  publishAmboLiveOutput, detectScreens, autoDetectOutputResolution,
  type DetectedScreenInfo, type AmboOutput, makeOutput, OutputRouter,
  detectSelfDevice, buildOutputsFromDevices, subscribeToDisplayChanges,
  generatePairingInfo, getActivePairing, flashAllDisplayIdentifiers
} from '../../services/ambo/outputRouter';
import {
  listNativeSources, scanNdiStreams, type NativeSourceInfo,
} from '../../services/mediaEngine/bridge';
import { isWindowsApp, openStudioCleanFeed, closeStudioCleanFeed } from '../../services/windowsBridgeService';
import {
  type AmboProject,
  createDefaultProject,
} from '../../services/ambo/amboProjectModel';
import {
  loadProject,
  saveProject,
  saveProjectAs,
  getActiveProjectId,
  setActiveProjectId,
} from '../../services/ambo/amboStorageService';
import { exportProjectJson, exportProjectBundle, downloadFile } from '../../services/ambo/amboBundleService';
import AmboStageDisplay from './AmboStageDisplay';
import AmboSlideEditor from './AmboSlideEditor';
import AmboScriptureDock, { type ScriptureCue } from './AmboScriptureDock';
import AmboInspector from './AmboInspector';
import AmboRouterReceiver from './AmboRouterReceiver';
import AmboMediaBin, { type AmboMediaSourceItem } from './AmboMediaBin';
import AmboHorizontalMultiview from './AmboHorizontalMultiview';
import AmboTabbedLibrary, { type AmboLibraryTab } from './AmboTabbedLibrary';
import { AmboNewShowModal } from './AmboNewShowModal';
import { AmboProjectSwitcherModal } from './AmboProjectSwitcherModal';
import { AmboImportModal } from './AmboImportModal';
import AmboDJTrackPlayer, { type AmboDJTrack } from './AmboDJTrackPlayer';
import AmboAudioBus, { useAudioBus } from './AmboAudioBus';
import AmboLyricsControl from './AmboLyricsControl';
import AmboMixer from './AmboMixer';
import { amboAudio } from '../../services/ambo/amboAudioEngine';
import { stampScripture } from '../../services/ambo/scriptureLook';

/** Stamp the operator's scripture look onto the verse as it goes to the outputs (mesh devices have no shared storage). */
const withScriptureLook = (stack: LiveStack): LiveStack =>
  stack.scripture ? { ...stack, scripture: { ...stack.scripture, content: stampScripture(stack.scripture.content) } } : stack;
import { bus as audioBus, type BusTrack } from '../../services/ambo/audioBus';
import { setProgramVideoAudible } from '../../services/ambo/audioPriority';
import { AmboLedWallCanvas } from './AmboLedWallCanvas';
import { AmboVideoTransportBar } from './AmboVideoTransportBar';
import AmboPartyEventModal from './AmboPartyEventModal';
import {
  type PartyEventSession, type PartyEventDevice, type EventDeviceDutyType,
  listenToPartyEventSession, listenToEventDevices, broadcastMasterSource,
  setMasterSync, assignDeviceDuty, setDeviceSlaved, setDeviceAudioMute,
  pingDevice, applyPlaylistItemDuties, registerEventDevice,
} from '../../services/ambo/amboPartyEventService';
import { useContextMenu } from '../ui/ContextMenu';
import { auth } from '../../services/backendService';

interface AmboProPresenterProps {
  onBack?: () => void;
}

// ── Plajah design language ──
const GROUND = '#0A0711';
const HEADER = 'rgba(10,7,17,0.72)';
const BRAND = 'linear-gradient(135deg,#6B0099,#D40055)';
const ORANGE = '#FF8C00';   // the live wire
const CYAN = '#00DAF3';     // preview / realtime
const GOLD = '#E3C57E';     // scripture
const LILAC = '#D0BCFF';
const glass = 'rgba(255,255,255,0.035)';
const line = 'rgba(255,255,255,0.09)';
const line2 = 'rgba(255,255,255,0.15)';

/** A live canvas driven by the shared renderer — same compositor the outputs run. */
const OutputMonitor = React.memo<{ stack: LiveStack; audio?: boolean; className?: string }>(({ stack, audio, className }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<LayerRenderer | null>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const r = new LayerRenderer(c, { w: 960, h: 540 });
    r.setOptions({ audioEnabled: !!audio });
    r.start();
    rendererRef.current = r;

    // Publish to the platform virtual video bus for the Live Switcher
    try {
      if (typeof (c as any).captureStream === 'function') {
        const stream = (c as any).captureStream(30);
        publishAmboLiveOutput('ambo:audience', stream, 'Ambo Audience Output');
      }
    } catch { /* best-effort capture */ }

    return () => { r.dispose(); rendererRef.current = null; };
  }, [audio]);
  useEffect(() => { rendererRef.current?.setStack(stack); }, [stack]);
  return <canvas ref={ref} className={`w-full block bg-black ${className ?? ''}`} />;
});

const fmt = (s: number) => {
  const m = Math.floor(s / 60), ss = s % 60;
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
};

/** Replace a slide's primary text (its first TEXT layer) — the editor's save path. */
function withText(slide: Slide, text: string): Slide {
  let done = false;
  const layers = slide.layers.map(ly => {
    if (!done && ly.content.kind === 'TEXT') {
      done = true;
      return { ...ly, content: { ...ly.content, blocks: [{ text, role: 'body' as const }] } };
    }
    return ly;
  });
  return { ...slide, layers };
}

// Simple QR code-like pairing display (uses a text-based code + link)
const PairingPanel = React.memo(({ info, onRefresh }: { info: any; onRefresh: () => void }) => {
  if (!info) return null;
  const [copied, setCopied] = useState(false);
  
  const copyLink = () => {
    navigator.clipboard?.writeText(info.pairingUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <div className="p-3 bg-black/60 rounded-xl border border-white/10 space-y-2 max-w-xs">
      <div className="text-[10px] font-extrabold uppercase tracking-wider text-white/50">Pair a Device</div>
      
      {/* Big pairing code */}
      <div className="flex items-center justify-center gap-1 py-2">
        {info.pairingCode.split('').map((ch: string, i: number) => (
          <span key={i} className="w-8 h-10 flex items-center justify-center bg-white/10 rounded-lg text-lg font-mono font-bold text-[#00DAF3] border border-[#00DAF3]/30">
            {ch}
          </span>
        ))}
      </div>
      
      {/* Instructions */}
      <p className="text-[10px] text-white/50 text-center">
        Open Plajah on any device and enter this code, or scan the QR code / use the link below
      </p>
      
      {/* Link */}
      <div className="flex items-center gap-1">
        <input
          readOnly
          value={info.pairingUrl}
          className="flex-1 px-2 py-1 rounded bg-white/5 border border-white/10 text-[9px] text-white/60 font-mono truncate"
          onClick={e => (e.target as HTMLInputElement).select()}
        />
        <button
          onClick={copyLink}
          className="px-2 py-1 rounded bg-[#00DAF3]/15 text-[#00DAF3] text-[9px] font-bold hover:bg-[#00DAF3]/25 transition-all"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      
      {/* Refresh */}
      <button
        onClick={onRefresh}
        className="w-full py-1 rounded bg-white/5 hover:bg-white/10 text-[9px] text-white/40 transition-all"
      >
        Generate New Code
      </button>
      
      {/* Expiry */}
      <div className="text-[8px] text-white/30 text-center">
        Expires in {Math.max(0, Math.round((info.expiresAt - Date.now()) / 60000))} min
      </div>
    </div>
  );
});

const AmboProPresenter: React.FC<AmboProPresenterProps> = ({ onBack }) => {
  const [currentProject, setCurrentProject] = useState<AmboProject>(() => {
    return createDefaultProject('Sunday Gathering', 'USER', 'local-user');
  });
  const [library, setLibrary] = useState<Show[]>(DEMO_LIBRARY);
  const [playlist, setPlaylist] = useState<PlaylistItem[]>(DEMO_PLAYLIST);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'saved' | 'saving' | 'offline' | 'error'>('saved');
  const [isProjectSwitcherOpen, setIsProjectSwitcherOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // File menu & Output settings dropdown state
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [isOutputMenuOpen, setIsOutputMenuOpen] = useState(false);
  const [isSaveAsModalOpen, setIsSaveAsModalOpen] = useState(false);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [saveAsName, setSaveAsName] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectIsBlank, setNewProjectIsBlank] = useState(false);

  // Open on the live item (the sermon) so the presenter reads as mid-service.
  const initial = playlist.find(p => p.live) ?? playlist[playlist.length - 1] ?? { id: 'pi_fallback', title: 'Default', show: DEMO_LIBRARY[0], plannedSec: 300 };
  const [activeShowId, setActiveShowId] = useState<string>(initial.show.id);
  const activeShow: Show = useMemo(
    () => library.find(s => s.id === activeShowId) ?? initial.show,
    [library, activeShowId, initial.show],
  );
  const slides = activeShow.slides;

  const [live, setLive] = useState<LiveStack>({});
  const [liveSlideId, setLiveSlideId] = useState<string | null>(null);
  const [liveSlideObj, setLiveSlideObj] = useState<Slide | null>(null);
  const [selected, setSelected] = useState(2); // preview cursor
  const [placement, setPlacement] = useState<'right' | 'top'>('right');
  const [stageOpen, setStageOpen] = useState(false);
  const [scriptureOpen, setScriptureOpen] = useState(false);
  const [editorIdx, setEditorIdx] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(1 * 3600 + 12 * 44);
  const [cleanFeedOpen, setCleanFeedOpen] = useState(false);

  // Physical Display & Resolution Auto-Detection
  const [screens, setScreens] = useState<DetectedScreenInfo[]>([]);
  const [targetDisplayIndex, setTargetDisplayIndex] = useState<number>(1);
  const [outputs, setOutputs] = useState<AmboOutput[]>([]);

// ── Auto-detect devices & build outputs ──
const [pairingInfo, setPairingInfo] = useState<any>(null);
const [selfDevice, setSelfDevice] = useState<any>(null);

useEffect(() => {
  let cleanup: (() => void)[] = [];
  let mounted = true;
  
  const init = async () => {
    // 1. Detect this device
    const self = await detectSelfDevice();
    if (!mounted) return;
    setSelfDevice(self);
    
    const uid = auth.currentUser?.uid;
    
    if (uid) {
      // 2. Register this device in Firestore (heartbeat)
      const unregister = registerEventDevice();
      cleanup.push(unregister);
      
      // 3. Listen for all devices signed in under this account
      const unsubDevices = listenToEventDevices(uid, (devices) => {
        if (!mounted) return;
        const built = buildOutputsFromDevices(self, devices);
        // Merge with any hardcoded defaults that aren't device-based
        setOutputs(prev => {
          // Keep the built device-based outputs + any manually added outputs
          const manualOutputs = prev.filter(o => !o.deviceTag && !o.id.startsWith('self_') && !o.id.startsWith('mesh_'));
          // Ensure we always have Program, Stage, Stream if not already present
          const hasProgram = built.some(o => o.kind === 'PROGRAM') || manualOutputs.some(o => o.kind === 'PROGRAM');
          const hasStage = built.some(o => o.kind === 'STAGE') || manualOutputs.some(o => o.kind === 'STAGE');
          const hasStream = built.some(o => o.kind === 'STREAM') || manualOutputs.some(o => o.kind === 'STREAM');
          
          const defaults: AmboOutput[] = [];
          if (!hasProgram) defaults.push(makeOutput('PROGRAM', 'Program Out'));
          if (!hasStage) defaults.push(makeOutput('STAGE', 'Stage Display'));
          if (!hasStream) defaults.push(makeOutput('STREAM', 'Stream Bus'));
          
          return [...defaults, ...built, ...manualOutputs];
        });
      });
      cleanup.push(unsubDevices);
      
      // 4. Generate pairing info for QR code
      const pairing = generatePairingInfo(uid);
      setPairingInfo(pairing);
    } else {
      // Not signed in — use hardcoded defaults
      setOutputs([
        makeOutput('PROGRAM', 'Program Out'),
        makeOutput('KEY', 'Broadcast Key', { alpha: true }),
        makeOutput('STAGE', 'Stage Display'),
        makeOutput('AUX', 'Aux / Overflow'),
        makeOutput('STREAM', 'Stream Bus'),
      ]);
    }
    
    // 5. Subscribe to physical display changes
    const unsubDisplays = subscribeToDisplayChanges(async (screens) => {
      if (!mounted) return;
      // Re-detect and rebuild
      const updatedSelf = await detectSelfDevice();
      setSelfDevice(updatedSelf);
    });
    cleanup.push(unsubDisplays);
  };
  
  init();
  
  return () => {
    mounted = false;
    cleanup.forEach(fn => fn());
  };
}, []);

  // ── Master Controls: Blackout, Program Enable & Modals ──
  const [isBlackout, setIsBlackout] = useState<boolean>(false);
  const [isMasterProgramOn, setIsMasterProgramOn] = useState<boolean>(true);
  const [isNewShowModalOpen, setIsNewShowModalOpen] = useState<boolean>(false);
  const [isLedWallModalOpen, setIsLedWallModalOpen] = useState<boolean>(false);
  const [showPairing, setShowPairing] = useState(false);

  // Reusable custom media assets in this project
  const handleAddCustomAsset = (asset: AmboMediaSourceItem) => {
    setCurrentProject(prev => {
      const existing = prev.savedAssets || [];
      const updated = [asset, ...existing.filter(a => a.id !== asset.id)];
      return { ...prev, savedAssets: updated };
    });
  };

  const handleRemoveCustomAsset = (assetId: string) => {
    setCurrentProject(prev => {
      const existing = prev.savedAssets || [];
      const updated = existing.filter(a => a.id !== assetId);
      return { ...prev, savedAssets: updated };
    });
  };

  const handleSetAspectRatio = (ratio: string) => {
    let width = 1920;
    let height = 1080;
    if (ratio === '16:10') { width = 1920; height = 1200; }
    else if (ratio === '4:3') { width = 1440; height = 1080; }
    else if (ratio === '21:9') { width = 2560; height = 1080; }

    setCurrentProject(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        aspectRatio: ratio,
      },
    }));

    setOutputs(prev => prev.map(o => {
      if (o.kind === 'PROGRAM') {
        return { ...o, width, height, aspectRatio: ratio };
      }
      return o;
    }));
  };

  // Restore and select project
  const handleSelectProject = (prj: AmboProject) => {
    setCurrentProject(prj);
    if (prj.shows && prj.shows.length > 0) setLibrary(prj.shows);
    if (prj.playlist && prj.playlist.length > 0) setPlaylist(prj.playlist);
    if (prj.activeShowId) {
      setActiveShowId(prj.activeShowId);
    } else if (prj.shows && prj.shows[0]) {
      setActiveShowId(prj.shows[0].id);
    }
    if (prj.outputs && prj.outputs.length > 0) {
      setOutputs(prj.outputs);
    } else if (prj.settings?.outputs && prj.settings.outputs.length > 0) {
      setOutputs(prj.settings.outputs);
    }
    if (typeof prj.targetDisplayIndex === 'number') {
      setTargetDisplayIndex(prj.targetDisplayIndex);
    } else if (typeof prj.settings?.targetDisplayIndex === 'number') {
      setTargetDisplayIndex(prj.settings.targetDisplayIndex);
    }
    if (prj.settings?.outputPlacement) {
      setPlacement(prj.settings.outputPlacement);
    }
    if (typeof prj.settings?.isBlackout === 'boolean') {
      setIsBlackout(prj.settings.isBlackout);
    }
    if (typeof prj.settings?.isMasterProgramOn === 'boolean') {
      setIsMasterProgramOn(prj.settings.isMasterProgramOn);
    }
    setActiveProjectId(prj.id);
  };

  // Load active project on mount
  useEffect(() => {
    const activeId = getActiveProjectId();
    if (activeId) {
      loadProject(activeId).then(prj => {
        if (prj) {
          handleSelectProject(prj);
        }
      });
    }
  }, []);

  // Debounced auto-save hook
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    setAutoSaveStatus('saving');
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(async () => {
      const updatedProject: AmboProject = {
        ...currentProject,
        shows: library,
        playlist,
        activeShowId,
        outputs,
        targetDisplayIndex,
        savedAssets: currentProject.savedAssets,
        settings: {
          ...currentProject.settings,
          outputs,
          targetDisplayIndex,
          outputPlacement: placement,
          isBlackout,
          isMasterProgramOn,
        },
        updatedAt: Date.now(),
      };
      setCurrentProject(updatedProject);
      const res = await saveProject(updatedProject);
      if (res.success) {
        setAutoSaveStatus(res.cloudSynced ? 'saved' : 'offline');
      } else {
        setAutoSaveStatus('error');
      }
    }, 800);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [library, playlist, activeShowId, outputs, targetDisplayIndex, placement, isBlackout, isMasterProgramOn, currentProject.savedAssets, currentProject.name]);

  // Synchronous manual save
  const handleManualSave = async () => {
    setAutoSaveStatus('saving');
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    const updatedProject: AmboProject = {
      ...currentProject,
      shows: library,
      playlist,
      activeShowId,
      outputs,
      targetDisplayIndex,
      savedAssets: currentProject.savedAssets,
      settings: {
        ...currentProject.settings,
        outputs,
        targetDisplayIndex,
        outputPlacement: placement,
        isBlackout,
        isMasterProgramOn,
      },
      updatedAt: Date.now(),
    };
    setCurrentProject(updatedProject);
    const res = await saveProject(updatedProject);
    if (res.success) {
      setAutoSaveStatus(res.cloudSynced ? 'saved' : 'offline');
      setSaveFeedback('Project & Settings Saved!');
      setTimeout(() => setSaveFeedback(null), 2500);
    } else {
      setAutoSaveStatus('error');
      setSaveFeedback('Save Failed');
      setTimeout(() => setSaveFeedback(null), 2500);
    }
  };

  // Save Project As (Duplicate & Switch)
  const handleSaveProjectAs = async (newName: string) => {
    if (!newName.trim()) return;
    const prjToSave: AmboProject = {
      ...currentProject,
      shows: library,
      playlist,
      activeShowId,
      outputs,
      targetDisplayIndex,
      savedAssets: currentProject.savedAssets,
      settings: {
        ...currentProject.settings,
        outputs,
        targetDisplayIndex,
        outputPlacement: placement,
        isBlackout,
        isMasterProgramOn,
      },
    };
    const copy = await saveProjectAs(prjToSave, newName.trim());
    handleSelectProject(copy);
    setIsSaveAsModalOpen(false);
    setSaveFeedback(`Saved as "${copy.name}"`);
    setTimeout(() => setSaveFeedback(null), 2500);
  };

  // Create New Project
  const handleCreateNewProject = async (name: string, isBlank = false) => {
    const freshName = name.trim() || 'Untitled Presentation';
    const newPrj = createDefaultProject(
      freshName,
      currentProject.scope,
      currentProject.ownerId,
      currentProject.organizationId,
      currentProject.organizationName,
    );
    if (isBlank) {
      const blankShow: Show = {
        id: newId('show'),
        title: 'New Presentation',
        slides: [{
          id: newId('slide'),
          label: 'Slide 1',
          layers: [{
            id: newId('ly'),
            slot: 'slide',
            content: { kind: 'TEXT', blocks: [{ text: 'Presentation Slide', role: 'body' }] },
          }],
        }],
      };
      newPrj.shows = [blankShow];
      newPrj.playlist = [{
        id: newId('pi'),
        title: blankShow.title,
        show: blankShow,
        plannedSec: 300,
      }];
      newPrj.activeShowId = blankShow.id;
    }
    await saveProject(newPrj);
    handleSelectProject(newPrj);
    setIsNewProjectModalOpen(false);
    setSaveFeedback(`Created "${newPrj.name}"`);
    setTimeout(() => setSaveFeedback(null), 2500);
  };

  // Keyboard shortcut Ctrl+S / Cmd+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleManualSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [library, playlist, activeShowId, outputs, targetDisplayIndex, placement, isBlackout, isMasterProgramOn, currentProject]);

  const handleImportShow = (importedShow: Show) => {
    setLibrary(prev => [importedShow, ...prev]);
    const newPlanItem: PlaylistItem = {
      id: newId('pi'),
      title: importedShow.title,
      show: importedShow,
      plannedSec: importedShow.slides.length * 45,
    };
    setPlaylist(prev => [...prev, newPlanItem]);
    setActiveShowId(importedShow.id);
  };

  const handleImportProject = (importedProject: AmboProject) => {
    handleSelectProject(importedProject);
    saveProject(importedProject);
  };

  // ── LoopDeck & Watch Folder Automation ──
  const [isLoopDeckActive, setIsLoopDeckActive] = useState<boolean>(false);
  const [loopDeckCount, setLoopDeckCount] = useState<number>(1);
  const [loopDeckMode, setLoopDeckMode] = useState<'sequential' | 'random'>('sequential');
  const [currentSlideLoops, setCurrentSlideLoops] = useState<number>(1);
  const [watchFolderName, setWatchFolderName] = useState<string | null>(null);
  const [watchFolderHandle, setWatchFolderHandle] = useState<any | null>(null);

  // Live Native Feeds & NDI Discovery
  const [nativeSources, setNativeSources] = useState<NativeSourceInfo[]>([]);
  const [isScanningNdi, setIsScanningNdi] = useState(false);

  // Inspector & Router Receiver UI States
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [routerReceiverOpen, setRouterReceiverOpen] = useState(false);

  // Preview & Live Source Overrides (for single-click preview vs double-click live)
  const [previewBackgroundOverride, setPreviewBackgroundOverride] = useState<LayerContent | null>(null);
  const [previewScriptureOverride, setPreviewScriptureOverride] = useState<ScriptureCue | null>(null);
  const [previewClearingMask, setPreviewClearingMask] = useState<Set<LayerSlot>>(new Set());
  const [activeBusClearingTarget, setActiveBusClearingTarget] = useState<string>('PROGRAM');
  const [cuedPreviewSourceId, setCuedPreviewSourceId] = useState<string | null>(null);

  // Drag over target state for visual drop highlighting
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // DJ Per-Track Audio Player State (horizontal waveform, cue points, FX, EQ, loops)
  // ── Player: compact bar ⇄ expanded DJ deck — two views of ONE song ──
  // The DJ deck is the expanded view of the audio playlist's current song (it
  // takes the song over at the same position; nothing restarts). Compact is
  // the default; the DJ buttons on songs open them straight into the deck.
  const [activeDjTrack, setActiveDjTrackState] = useState<AmboDJTrack | null>(null);
  const [playerMode, setPlayerMode] = useState<'compact' | 'expanded'>('compact');
  const busSnap = useAudioBus();
  const busTrack = busSnap.queue[busSnap.index] ?? null;
  useEffect(() => {
    if (playerMode === 'expanded' && busTrack) {
      setActiveDjTrackState(prev => (prev?.id === busTrack.id && (prev as any).__seq === busSnap.loadSeq ? prev : ({ ...busTrack, __seq: busSnap.loadSeq } as AmboDJTrack)));
    } else {
      setActiveDjTrackState(null);
    }
  }, [playerMode, busTrack?.id, busSnap.loadSeq]);
  /** Open a song in the DJ deck (expanded), or collapse to compact with null. */
  const setActiveDjTrack = (track: AmboDJTrack | null) => {
    if (!track) { setPlayerMode('compact'); return; }
    const bt: BusTrack = {
      id: track.id || `t_${track.title}`, title: track.title, artist: track.artist, url: track.url,
      coverImage: track.coverImage, duration: track.duration, key: track.key, bpm: track.bpm,
      category: track.category, timeCodedLyrics: track.timeCodedLyrics,
      source: (track as any).source ?? (track.category === 'Audius' ? 'audius' : 'chora'),
    };
    const cur = audioBus.state.queue[audioBus.state.index];
    if (!cur || cur.id !== bt.id) {
      audioBus.playNext(bt);
      const idx = audioBus.state.queue.findIndex(t => t.id === bt.id);
      if (idx >= 0 && idx !== audioBus.state.index) audioBus.jumpTo(idx);
    }
    setPlayerMode('expanded');
  };
  const [isDjLiveOnProgram, setIsDjLiveOnProgram] = useState(false);
  const [isDjCuedInPreview, setIsDjCuedInPreview] = useState(false);
  const [djVisualizerEnabled, setDjVisualizerEnabled] = useState(false);
  const [djVisualizerMode, setDjVisualizerMode] = useState<'SPECTRUM' | 'MILKDROP' | 'SHADER' | 'FLUX'>('SPECTRUM');

  // Party / Event Mode Mesh State (Ambo Central Command)
  const [isPartyModalOpen, setIsPartyModalOpen] = useState(false);
  const [partySession, setPartySession] = useState<PartyEventSession | null>(null);
  const [partyDevices, setPartyDevices] = useState<PartyEventDevice[]>([]);

  useEffect(() => {
    const user = auth?.currentUser;
    if (!user) return;
    const uid = user.uid;
    const unsubSession = listenToPartyEventSession(uid, setPartySession);
    const unsubDevices = listenToEventDevices(uid, setPartyDevices);
    return () => {
      unsubSession();
      unsubDevices();
    };
  }, []);

  const probeDisplays = async () => {
    try {
      const detected = await detectScreens();
      if (detected.length) {
        setScreens(detected);
        const secondary = detected.find(d => !d.primary) ?? detected[0];
        setTargetDisplayIndex(secondary.index);
        setOutputs(prev => prev.map((o, idx) => {
          if (!o.autoDetectDisplay) return o;
          const targetScreen = idx === 0 ? secondary : (detected[idx] ?? detected[0]);
          return autoDetectOutputResolution(o, [targetScreen]);
        }));
      }
    } catch { }
  };

  const loadSources = async () => {
    try {
      const list = await listNativeSources();
      setNativeSources(list);
    } catch { }
  };

  const handleScanNdi = async () => {
    setIsScanningNdi(true);
    try {
      const list = await scanNdiStreams();
      setNativeSources(list);
    } catch {
      await loadSources();
    } finally {
      setIsScanningNdi(false);
    }
  };

  useEffect(() => {
    probeDisplays();
    loadSources();
  }, []);

  // Dedicated Physical Output Router
  const routerRef = useRef<OutputRouter | null>(null);
  if (!routerRef.current) {
    routerRef.current = new OutputRouter(outputs);
  }

  const [isProgramWindowOpen, setIsProgramWindowOpen] = useState(false);
  const [isDisplayPickerOpen, setIsDisplayPickerOpen] = useState(false);

  useEffect(() => {
    if (routerRef.current) {
      routerRef.current.outputs = outputs;
    }
  }, [outputs]);

  // Inject DJ Visualizer Background
  useEffect(() => {
    if (activeDjTrack && isDjLiveOnProgram && djVisualizerEnabled) {
      const vizLayer: SlideLayer = { 
        id: 'viz_layer', 
        slot: 'background', 
        content: { 
          kind: 'GENERATOR', 
          mode: djVisualizerMode === 'SPECTRUM' ? 'AUDIO_WAVE_SPECTRUM' : djVisualizerMode 
        } 
      };
      setLive(prev => {
        if (!prev.background) {
          return { ...prev, background: vizLayer };
        }
        return prev;
      });
    } else {
      setLive(prev => {
        if (prev.background?.id === 'viz_layer') {
          return { ...prev, background: undefined };
        }
        return prev;
      });
    }
  }, [activeDjTrack, isDjLiveOnProgram, djVisualizerEnabled, djVisualizerMode]);

  // ── Unified Effective Live Stack (drives both in-app program monitor & physical outputs) ──
  const effectiveLiveStack = useMemo(() => {
    if (isBlackout) return {};
    if (!isMasterProgramOn) {
      return { ...live, slide: undefined, scripture: undefined, lyrics: undefined, prop: undefined };
    }
    return live;
  }, [live, isBlackout, isMasterProgramOn]);

  // Video priority: tell the audio playlist (and, if the operator chose, every
  // other audio source) whether Program carries a video that's making sound.
  useEffect(() => {
    const audible = Object.values(effectiveLiveStack).some((l: any) => {
      const c = l?.content;
      return c?.kind === 'VIDEO' && !c.muted && (c.volume ?? 1) > 0;
    });
    setProgramVideoAudible(audible);
  }, [effectiveLiveStack]);
  // Chora lyric sync — its own slot on Program, driven by AmboLyricsControl.
  const liveLyrics = live.lyrics?.content?.kind === 'LYRICS' ? (live.lyrics.content as Extract<LayerContent, { kind: 'LYRICS' }>) : null;
  const setLyricsLayer = useCallback((c: Extract<LayerContent, { kind: 'LYRICS' }> | null) => {
    setLive(prev => {
      if (!c) {
        if (!prev.lyrics) return prev;
        const { lyrics: _drop, ...rest } = prev;
        return rest;
      }
      return { ...prev, lyrics: { id: 'lyrics_live', slot: 'lyrics', content: c, since: prev.lyrics?.since ?? Date.now() } as any };
    });
  }, []);

  // Build the Ambo mixer up front so every visualizer reads the real mix from
  // the first frame. The playlist must not outlive its controls.
  useEffect(() => { amboAudio.ensure(); return () => { audioBus.release(); setProgramVideoAudible(false); }; }, []);

  // Sync Live Stack & Timers to physical output windows
  useEffect(() => {
    if (!routerRef.current) return;
    routerRef.current.send(withScriptureLook(effectiveLiveStack), { elapsed });
  }, [effectiveLiveStack, elapsed]);

  // Cleanup output windows and stop orphaned audio on window close or unmount
  useEffect(() => {
    const handleBeforeUnload = () => {
      try {
        routerRef.current?.dispose();
        if (isWindowsApp()) closeStudioCleanFeed();
      } catch {}
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      try {
        routerRef.current?.dispose();
        if (isWindowsApp()) closeStudioCleanFeed();
      } catch {}
    };
  }, []);

  // Track physical window open state
  useEffect(() => {
    const timer = setInterval(() => {
      if (routerRef.current) {
        setIsProgramWindowOpen(routerRef.current.openCount() > 0);
      }
    }, 1500);
    return () => clearInterval(timer);
  }, []);

  const handleToggleProgramWindow = (forceScreenIndex?: number) => {
    if (!routerRef.current) return;
    const pgm = outputs.find(o => o.kind === 'PROGRAM') || outputs[0];
    if (!pgm) return;

    if (isProgramWindowOpen && forceScreenIndex == null) {
      routerRef.current.closeWindow(pgm.id);
      setIsProgramWindowOpen(false);
      return;
    }

    const screenTarget = forceScreenIndex != null
      ? forceScreenIndex
      : targetDisplayIndex != null
      ? targetDisplayIndex
      : screens.find(s => !s.primary)?.index ?? 1;

    const screenList = screens.map(s => ({
      left: s.left,
      top: s.top,
      width: s.width,
      height: s.height,
    }));

    const patchedPgm = { ...pgm, screenIndex: screenTarget };
    const success = routerRef.current.openWindow(patchedPgm, screenList);
    if (success) {
      setIsProgramWindowOpen(true);
      // Same stack the program monitor shows — master-off and blackout included.
      routerRef.current.send(withScriptureLook(effectiveLiveStack), { elapsed });
    }
  };

  const toggleOutput = (id: string) => {
    setOutputs(prev => prev.map(o => o.id === id ? { ...o, enabled: !o.enabled } : o));
  };

  const setLiveBackgroundInput = (inputId: string, label: string) => {
    setLive(prev => ({
      ...prev,
      background: {
        id: newId(),
        slot: 'background',
        content: {
          kind: 'LIVE',
          inputId,
          label,
        },
      },
    }));
  };

  const handleUpdateSlide = (updated: Slide) => {
    setLibrary(libs => libs.map(sh => (sh.id !== activeShow.id ? sh : {
      ...sh,
      slides: sh.slides.map(sl => (sl.id !== updated.id ? sl : updated)),
    })));
    if (updated.id === liveSlideId) {
      setLive(prev => applySlide(prev, updated, Date.now()));
      setLiveSlideObj(updated);
    }
  };

  const handleAddSlide = (afterIndex?: number, template?: Partial<Slide>) => {
    const insertAt = afterIndex != null ? afterIndex + 1 : slides.length;
    const prevSlide = afterIndex != null ? slides[afterIndex] : slides[slides.length - 1];
    const newSlide: Slide = {
      id: newId('sl'),
      label: template?.label ?? `Slide ${slides.length + 1}`,
      group: template?.group ?? (prevSlide?.group ?? 'Verse 1'),
      groupColor: template?.groupColor ?? (prevSlide?.groupColor ?? '#6B0099'),
      layers: template?.layers ?? [
        {
          id: newId('ly_bg'),
          slot: 'background',
          content: { kind: 'GENERATOR', mode: 'STUDIO_AURORA' },
        },
        {
          id: newId('ly_txt'),
          slot: 'slide',
          enabled: false,
          visible: false,
          content: {
            kind: 'TEXT',
            blocks: [{ text: template?.notes || 'New Slide Text', role: 'body' }],
            style: { align: 'center', valign: 'middle' },
          },
        },
      ],
      notes: template?.notes,
    };

    setLibrary(libs => libs.map(sh => {
      if (sh.id !== activeShow.id) return sh;
      const nextSlides = [...sh.slides];
      nextSlides.splice(insertAt, 0, newSlide);
      return { ...sh, slides: nextSlides };
    }));
    setSelected(insertAt);
  };

  const handleDuplicateSlide = (index: number) => {
    const src = slides[index];
    if (!src) return;
    const duplicated: Slide = {
      ...src,
      id: newId('sl'),
      label: `${src.label || 'Slide'} (Copy)`,
      layers: src.layers.map(l => ({ ...l, id: newId('ly') })),
    };
    setLibrary(libs => libs.map(sh => {
      if (sh.id !== activeShow.id) return sh;
      const nextSlides = [...sh.slides];
      nextSlides.splice(index + 1, 0, duplicated);
      return { ...sh, slides: nextSlides };
    }));
    setSelected(index + 1);
  };

  const handleDeleteSlide = (index: number) => {
    if (slides.length <= 1) return;
    setLibrary(libs => libs.map(sh => {
      if (sh.id !== activeShow.id) return sh;
      return { ...sh, slides: sh.slides.filter((_, i) => i !== index) };
    }));
    setSelected(prev => Math.max(0, Math.min(prev, slides.length - 2)));
  };

  const handleRouteToSlide = (slideId: string, inputId: string, label: string) => {
    const target = slides.find(s => s.id === slideId);
    if (!target) return;
    const existingBg = target.layers.find(l => l.slot === 'background');
    const newContent: LayerContent = { kind: 'LIVE', inputId, label };
    let newLayers: SlideLayer[];
    if (existingBg) {
      newLayers = target.layers.map(l => l.slot === 'background' ? { ...l, content: newContent } : l);
    } else {
      newLayers = [{ id: newId('ly_bg'), slot: 'background', content: newContent }, ...target.layers];
    }
    handleUpdateSlide({ ...target, layers: newLayers });
  };

  const handlePreviewSource = (item: AmboMediaSourceItem) => {
    setCuedPreviewSourceId(item.inputId || item.mode || item.id);
    if (item.kind === 'LIVE') {
      setPreviewBackgroundOverride({ kind: 'LIVE', inputId: item.inputId || item.id, label: item.name });
    } else if (item.kind === 'GENERATOR') {
      setPreviewBackgroundOverride({ kind: 'GENERATOR', mode: item.mode || 'STUDIO_AURORA' });
    } else if (item.kind === 'SHADER') {
      setPreviewBackgroundOverride({ kind: 'SHADER', src: item.mode || item.src || '' });
    } else if (item.kind === 'IMAGE') {
      setPreviewBackgroundOverride({ kind: 'IMAGE', src: item.src || '' });
    } else if (item.kind === 'VIDEO') {
      setPreviewBackgroundOverride({
        kind: 'VIDEO',
        src: item.src || 'https://assets.mixkit.co/videos/preview/mixkit-clouds-and-blue-sky-2408-large.mp4',
        loop: true,
        muted: false,
        volume: 1.0,
      });
    }
  };

  const handleProgramSource = (item: AmboMediaSourceItem) => {
    if (item.kind === 'LIVE') {
      setLiveBackgroundInput(item.inputId || item.id, item.name);
    } else if (item.kind === 'GENERATOR') {
      setLive(prev => ({
        ...prev,
        background: {
          content: { kind: 'GENERATOR', mode: item.mode || 'STUDIO_AURORA' },
          since: Date.now(),
        },
      }));
    } else if (item.kind === 'SHADER') {
      setLive(prev => ({
        ...prev,
        background: {
          content: { kind: 'SHADER', src: item.mode || item.src || '' },
          since: Date.now(),
        },
      }));
    } else if (item.kind === 'IMAGE') {
      setLive(prev => ({
        ...prev,
        background: {
          content: { kind: 'IMAGE', src: item.src || '' },
          since: Date.now(),
        },
      }));
    } else if (item.kind === 'VIDEO') {
      setLive(prev => ({
        ...prev,
        background: {
          content: {
            kind: 'VIDEO',
            src: item.src || 'https://assets.mixkit.co/videos/preview/mixkit-clouds-and-blue-sky-2408-large.mp4',
            loop: true,
            muted: false,
            volume: 1.0,
          },
          since: Date.now(),
        },
      }));
    }
  };

  // ── Audio Asset Slide Creation & Drag-and-Drop ──
  const handleCreateAudioSlide = (track: AmboDJTrack) => {
    const audioSlide: Slide = {
      id: newId('sl_audio'),
      label: track.title,
      group: 'Audio Assets',
      groupColor: '#D0BCFF',
      layers: [
        {
          id: newId('ly_bg'),
          slot: 'background',
          content: {
            kind: 'GENERATOR',
            mode: 'WAVEFORM',
          },
        },
        {
          id: newId('ly_txt'),
          slot: 'slide',
          content: {
            kind: 'TEXT',
            blocks: [
              { text: track.title, role: 'title' },
              { text: track.artist ? `${track.artist} · Audio Playback` : 'Audio Track Backing', role: 'caption' },
            ],
            style: { align: 'center', valign: 'middle' },
          },
        },
        {
          id: newId('ly_audio'),
          slot: 'overlay',
          content: {
            kind: 'AUDIO',
            src: track.url || '',
            volume: 1.0,
            loop: false,
          },
        },
      ],
      onEnter: [
        { kind: 'AUDIO_PLAY', src: track.url || '', volume: 1.0 },
      ],
      notes: track.key ? `Key: ${track.key} · BPM: ${track.bpm || 128}` : undefined,
    };

    setLibrary(libs => libs.map(sh => {
      if (sh.id !== activeShow.id) return sh;
      return { ...sh, slides: [...sh.slides, audioSlide] };
    }));
    setSelected(slides.length);
    setActiveDjTrack(track);
  };

  const handleInsertMediaSlide = (item: AmboMediaSourceItem) => {
    let bgContent: LayerContent;
    if (item.kind === 'LIVE') {
      bgContent = { kind: 'LIVE', inputId: item.inputId || item.id, label: item.name };
    } else if (item.kind === 'GENERATOR') {
      bgContent = { kind: 'GENERATOR', mode: item.mode || 'STUDIO_AURORA' };
    } else if (item.kind === 'SHADER') {
      bgContent = { kind: 'SHADER', src: item.mode || item.src || '' };
    } else if (item.kind === 'VIDEO') {
      bgContent = {
        kind: 'VIDEO',
        src: item.src || 'https://assets.mixkit.co/videos/preview/mixkit-clouds-and-blue-sky-2408-large.mp4',
        loop: true,
        muted: false,
        volume: 1.0,
      };
    } else if (item.kind === 'IMAGE') {
      bgContent = {
        kind: 'IMAGE',
        src: item.src || '',
      };
    } else {
      bgContent = { kind: 'GENERATOR', mode: 'STUDIO_AURORA' };
    }

    const newSlide: Slide = {
      id: newId('sl_media'),
      label: item.name,
      group: item.kind === 'VIDEO' ? 'Video Media' : item.kind === 'IMAGE' ? 'Photos' : 'Visualizers',
      groupColor: item.kind === 'VIDEO' ? '#00DAF3' : item.kind === 'IMAGE' ? '#10B981' : '#FF8C00',
      layers: [
        {
          id: newId('ly_bg'),
          slot: 'background',
          content: bgContent,
        },
      ],
    };

    setLibrary(libs => libs.map(sh => {
      if (sh.id !== activeShow.id) return sh;
      return { ...sh, slides: [...sh.slides, newSlide] };
    }));
    setSelected(slides.length);
  };

  // Tela slide template (from the Shows-tab gallery): insert after the selected slide.
  const handleInsertTemplateSlide = (newSlide: Slide) => {
    setLibrary(libs => libs.map(sh => {
      if (sh.id !== activeShow.id) return sh;
      const next = [...sh.slides];
      next.splice(selected >= 0 ? Math.min(selected + 1, next.length) : next.length, 0, newSlide);
      return { ...sh, slides: next };
    }));
    setSelected(prev => (prev >= 0 ? prev + 1 : 0));
  };

  const [isDraggingOverDeck, setIsDraggingOverDeck] = useState(false);

  const handleDropOnPresentationDeck = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOverDeck(false);
    try {
      const dataStr = e.dataTransfer.getData('application/json');
      if (dataStr) {
        const parsed = JSON.parse(dataStr);
        if (parsed.type === 'ambo-audio' && parsed.track) {
          handleCreateAudioSlide(parsed.track);
          return;
        }
        if (parsed.type === 'ambo-source' && parsed.source) {
          handleInsertMediaSlide(parsed.source);
          return;
        }
      }

      const files = Array.from(e.dataTransfer.files || []);
      if (files.length > 0) {
        const newSlides: Slide[] = [];

        for (const file of files) {
          const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|webm|mkv|m4v|avi|mpg|mpeg|wmv)$/i.test(file.name);
          const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg|avif|bmp|tiff|tif)$/i.test(file.name);
          const isAudio = file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|flac|ogg|aiff|wma)$/i.test(file.name);
          const blobUrl = URL.createObjectURL(file);
          const cleanName = file.name.replace(/\.[^/.]+$/, '');

          if (isAudio) {
            newSlides.push({
              id: newId('sl_audio'),
              label: cleanName,
              group: 'Audio Assets',
              groupColor: '#D0BCFF',
              layers: [
                {
                  id: newId('ly_bg'),
                  slot: 'background',
                  content: { kind: 'GENERATOR', mode: 'WAVEFORM' },
                },
                {
                  id: newId('ly_txt'),
                  slot: 'slide',
                  content: {
                    kind: 'TEXT',
                    blocks: [
                      { text: cleanName, role: 'title' },
                      { text: 'Local Audio File • Playback', role: 'caption' },
                    ],
                    style: { align: 'center', valign: 'middle' },
                  },
                },
                {
                  id: newId('ly_audio'),
                  slot: 'overlay',
                  content: { kind: 'AUDIO', src: blobUrl, volume: 1.0, loop: false },
                },
              ],
              onEnter: [{ kind: 'AUDIO_PLAY', src: blobUrl, volume: 1.0 }],
            });
          } else if (isVideo) {
            newSlides.push({
              id: newId('sl_video'),
              label: cleanName,
              group: 'Video Media',
              groupColor: '#00DAF3',
              layers: [
                {
                  id: newId('ly_bg'),
                  slot: 'background',
                  content: { kind: 'VIDEO', src: blobUrl, loop: true },
                },
              ],
            });
          } else if (isImage) {
            newSlides.push({
              id: newId('sl_image'),
              label: cleanName,
              group: 'Photos',
              groupColor: '#10B981',
              layers: [
                {
                  id: newId('ly_bg'),
                  slot: 'background',
                  content: { kind: 'IMAGE', src: blobUrl },
                },
              ],
            });
          }
        }

        if (newSlides.length > 0) {
          setLibrary(libs => libs.map(sh => {
            if (sh.id !== activeShow.id) return sh;
            return { ...sh, slides: [...sh.slides, ...newSlides] };
          }));
          setSelected(slides.length);
        }
      }
    } catch { /* ignore drop error */ }
  };

  const handleDropOnSlide = (e: React.DragEvent, slideIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const dataStr = e.dataTransfer.getData('application/json');
      if (dataStr) {
        const parsed = JSON.parse(dataStr);
        if (parsed.type === 'ambo-audio' && parsed.track) {
          const track: AmboDJTrack = parsed.track;
          const targetSlide = slides[slideIndex];
          if (!targetSlide) return;

          const audioLayer: SlideLayer = {
            id: newId('ly_audio'),
            slot: 'overlay',
            content: { kind: 'AUDIO', src: track.url || '', volume: 1.0 },
          };
          const newLayers = [...targetSlide.layers.filter(l => l.content.kind !== 'AUDIO'), audioLayer];
          const newActions = [
            ...(targetSlide.onEnter || []).filter(a => a.kind !== 'AUDIO_PLAY'),
            { kind: 'AUDIO_PLAY' as const, src: track.url || '', volume: 1.0 },
          ];
          handleUpdateSlide({ ...targetSlide, layers: newLayers, onEnter: newActions });
          setActiveDjTrack(track);
          return;
        }
        if (parsed.type === 'ambo-source' && parsed.source) {
          const item: AmboMediaSourceItem = parsed.source;
          const targetSlide = slides[slideIndex];
          if (!targetSlide) return;

          let bgContent: LayerContent;
          if (item.kind === 'LIVE') {
            bgContent = { kind: 'LIVE', inputId: item.inputId || item.id, label: item.name };
          } else if (item.kind === 'GENERATOR') {
            bgContent = { kind: 'GENERATOR', mode: item.mode || 'STUDIO_AURORA' };
          } else if (item.kind === 'SHADER') {
            bgContent = { kind: 'SHADER', src: item.src || item.mode || '' };
          } else if (item.kind === 'VIDEO') {
            bgContent = { kind: 'VIDEO', src: item.src || '', loop: true };
          } else if (item.kind === 'IMAGE') {
            bgContent = { kind: 'IMAGE', src: item.src || '' };
          } else {
            return;
          }

          const existingBg = targetSlide.layers.find(l => l.slot === 'background');
          let newLayers: SlideLayer[];
          if (existingBg) {
            newLayers = targetSlide.layers.map(l => l.slot === 'background' ? { ...l, content: bgContent } : l);
          } else {
            newLayers = [{ id: newId('ly_bg'), slot: 'background', content: bgContent }, ...targetSlide.layers];
          }

          handleUpdateSlide({ ...targetSlide, layers: newLayers });
          return;
        }
      }

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|webm|mkv|m4v|avi|mpg|mpeg|wmv)$/i.test(file.name);
        const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg|avif|bmp|tiff|tif)$/i.test(file.name);
        const isAudio = file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|flac|ogg|aiff|wma)$/i.test(file.name);
        const blobUrl = URL.createObjectURL(file);
        const targetSlide = slides[slideIndex];
        if (!targetSlide) return;

        if (isAudio) {
          const track: AmboDJTrack = {
            id: `audio_${Date.now()}`,
            title: file.name.replace(/\.[^/.]+$/, ''),
            artist: 'Local Audio File',
            url: blobUrl,
            duration: 'Local',
          };
          const audioLayer: SlideLayer = {
            id: newId('ly_audio'),
            slot: 'overlay',
            content: { kind: 'AUDIO', src: blobUrl, volume: 1.0 },
          };
          const newLayers = [...targetSlide.layers.filter(l => l.content.kind !== 'AUDIO'), audioLayer];
          const newActions = [
            ...(targetSlide.onEnter || []).filter(a => a.kind !== 'AUDIO_PLAY'),
            { kind: 'AUDIO_PLAY' as const, src: blobUrl, volume: 1.0 },
          ];
          handleUpdateSlide({ ...targetSlide, layers: newLayers, onEnter: newActions });
          setActiveDjTrack(track);
        } else if (isVideo || isImage) {
          const bgContent: LayerContent = isVideo
            ? { kind: 'VIDEO', src: blobUrl, loop: true }
            : { kind: 'IMAGE', src: blobUrl };

          const existingBg = targetSlide.layers.find(l => l.slot === 'background');
          let newLayers: SlideLayer[];
          if (existingBg) {
            newLayers = targetSlide.layers.map(l => l.slot === 'background' ? { ...l, content: bgContent } : l);
          } else {
            newLayers = [{ id: newId('ly_bg'), slot: 'background', content: bgContent }, ...targetSlide.layers];
          }
          handleUpdateSlide({ ...targetSlide, layers: newLayers });
        }
      }
    } catch { /* ignore parse error */ }
  };

  /** Send a slide immediately to the Preview monitor with full parity */
  const cueSlideToPreview = (s: Slide, idx?: number) => {
    const slideIdx = idx ?? slides.findIndex(item => item.id === s.id);
    if (slideIdx >= 0) setSelected(slideIdx);
    setPreviewClearingMask(new Set()); // fresh cue restores cleared layers
    setPreviewBackgroundOverride(null);
    setPreviewScriptureOverride(null);
    setCuedPreviewSourceId(s.id);

    const audioLayer = s.layers.find(l => l.content.kind === 'AUDIO');
    const audioAction = s.onEnter?.find(a => a.kind === 'AUDIO_PLAY');
    if (audioLayer && audioLayer.content.kind === 'AUDIO') {
      setActiveDjTrack({
        id: `audio_${s.id}`,
        title: s.label || 'Audio Track',
        url: audioLayer.content.src,
      });
      setIsDjCuedInPreview(true);
      setIsDjLiveOnProgram(false);
    } else if (audioAction && audioAction.kind === 'AUDIO_PLAY') {
      setActiveDjTrack({
        id: `audio_${s.id}`,
        title: s.label || 'Audio Track',
        url: audioAction.src,
      });
      setIsDjCuedInPreview(true);
      setIsDjLiveOnProgram(false);
    }
  };

  const selectSlide = (idx: number) => {
    const targetSlide = slides[idx];
    if (targetSlide) {
      cueSlideToPreview(targetSlide, idx);
    } else {
      setSelected(idx);
    }
  };

  const cueScriptureToPreview = (cue: ScriptureCue) => {
    setPreviewScriptureOverride(cue);
    setPreviewClearingMask(prev => {
      const next = new Set(prev);
      next.delete('scripture');
      return next;
    });
  };

  // ── Persistent Layout Sizing & Splitters ──
  const [bottomHeight, setBottomHeight] = useState<number>(() => {
    try {
      const v = localStorage.getItem('ambo_layout_bottom_height');
      return v ? Math.max(160, Math.min(600, Number(v))) : 280;
    } catch {
      return 280;
    }
  });

  const [multiviewHeight, setMultiviewHeight] = useState<number>(() => {
    try {
      const v = localStorage.getItem('ambo_layout_multiview_height');
      return v ? Math.max(110, Math.min(360, Number(v))) : 160;
    } catch {
      return 160;
    }
  });

  const [rightWidth, setRightWidth] = useState<number>(() => {
    try {
      const v = localStorage.getItem('ambo_layout_right_width');
      return v ? Math.max(240, Math.min(560, Number(v))) : 300;
    } catch {
      return 300;
    }
  });

  const [multiviewCollapsed, setMultiviewCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('ambo_layout_multiview_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const [libraryCollapsed, setLibraryCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('ambo_layout_library_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const [activeLibraryTab, setActiveLibraryTab] = useState<AmboLibraryTab>(() => {
    try {
      const v = localStorage.getItem('ambo_layout_active_tab');
      return (v as AmboLibraryTab) || 'scripture';
    } catch {
      return 'scripture';
    }
  });

  // ── Active Transitions & Timing ──

  const [activeTransition, setActiveTransition] = useState<string>(() => {
    try {
      return localStorage.getItem('ambo_active_transition') || 'Cross Dissolve';
    } catch {
      return 'Cross Dissolve';
    }
  });

  const [transitionDurationSec, setTransitionDurationSec] = useState<number>(() => {
    try {
      const v = localStorage.getItem('ambo_transition_duration');
      return v ? Number(v) : 0.8;
    } catch {
      return 0.8;
    }
  });

  const handleSelectTransition = (tx: string) => {
    setActiveTransition(tx);
    try { localStorage.setItem('ambo_active_transition', tx); } catch {}
  };

  const handleChangeTransitionDuration = (sec: number) => {
    setTransitionDurationSec(sec);
    try { localStorage.setItem('ambo_transition_duration', String(sec)); } catch {}
  };

  const updateBottomHeight = (h: number) => {
    const clamped = Math.max(160, Math.min(600, h));
    setBottomHeight(clamped);
    try { localStorage.setItem('ambo_layout_bottom_height', String(clamped)); } catch {}
  };

  const updateMultiviewHeight = (h: number) => {
    const clamped = Math.max(110, Math.min(360, h));
    setMultiviewHeight(clamped);
    try { localStorage.setItem('ambo_layout_multiview_height', String(clamped)); } catch {}
  };

  const updateRightWidth = (w: number) => {
    const clamped = Math.max(240, Math.min(560, w));
    setRightWidth(clamped);
    try { localStorage.setItem('ambo_layout_right_width', String(clamped)); } catch {}
  };

  const toggleMultiviewCollapsed = () => {
    setMultiviewCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('ambo_layout_multiview_collapsed', String(next)); } catch {}
      return next;
    });
  };

  const toggleLibraryCollapsed = () => {
    setLibraryCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('ambo_layout_library_collapsed', String(next)); } catch {}
      return next;
    });
  };

  const handleSelectLibraryTab = (tab: AmboLibraryTab) => {
    setActiveLibraryTab(tab);
    try { localStorage.setItem('ambo_layout_active_tab', tab); } catch {}
  };

  // ── ProPresenter Master Layer Clear Handlers ──
  const clearAll = () => {
    setLive({});
    setLiveSlideId(null);
    setLiveSlideObj(null);
    setActiveDjTrack(null);
    setIsDjLiveOnProgram(false);
    setIsDjCuedInPreview(false);
  };
  const clearSlide = () => {
    setLive(prev => clearLayer(prev, 'slide'));
    setLiveSlideId(null);
    setLiveSlideObj(null);
  };
  const clearBackground = () => setLive(prev => clearLayer(prev, 'background'));
  const clearProps = () => setLive(prev => clearLayer(prev, 'prop'));
  const clearScripture = () => setLive(prev => clearLayer(prev, 'scripture'));
  const clearAudio = () => {
    setActiveDjTrack(null);
    setIsDjLiveOnProgram(false);
    setIsDjCuedInPreview(false);
    setLive(prev => {
      const next = clearLayer(prev, 'overlay');
      return clearLayer(next, 'audio' as any);
    });
  };

  // ── Preview Parity Clear Handlers ──
  const clearPreviewAll = () => {
    setPreviewClearingMask(new Set(LAYER_ORDER));
    setPreviewBackgroundOverride(null);
    setPreviewScriptureOverride(null);
    setIsDjCuedInPreview(false);
  };
  const clearPreviewSlide = () => {
    setPreviewClearingMask(prev => {
      const next = new Set(prev);
      next.add('slide');
      return next;
    });
  };
  const clearPreviewBackground = () => {
    setPreviewBackgroundOverride(null);
    setPreviewClearingMask(prev => {
      const next = new Set(prev);
      next.add('background');
      return next;
    });
  };
  const clearPreviewProps = () => {
    setPreviewClearingMask(prev => {
      const next = new Set(prev);
      next.add('prop');
      return next;
    });
  };
  const clearPreviewScripture = () => {
    setPreviewScriptureOverride(null);
    setPreviewClearingMask(prev => {
      const next = new Set(prev);
      next.add('scripture');
      return next;
    });
  };
  const clearPreviewAudio = () => {
    setIsDjCuedInPreview(false);
  };

  // ── Per-Auxiliary Bus Clearing Handlers ──
  const handleClearBusSlot = (busId: string, slot: LayerSlot) => {
    if (busId === 'PROGRAM') {
      if (slot === 'slide') clearSlide();
      else if (slot === 'background') clearBackground();
      else if (slot === 'prop') clearProps();
      else if (slot === 'scripture') clearScripture();
      else setLive(prev => clearLayer(prev, slot));
    } else if (busId === 'PREVIEW') {
      if (slot === 'slide') clearPreviewSlide();
      else if (slot === 'background') clearPreviewBackground();
      else if (slot === 'prop') clearPreviewProps();
      else if (slot === 'scripture') clearPreviewScripture();
    } else {
      routerRef.current?.clearBusLayer(busId, slot);
      setOutputs(prev => prev.map(o => o.id === busId ? { ...o, clearedSlots: [...(routerRef.current?.getBusClearedSlots(busId) || [])] } : o));
    }
  };

  const handleClearBusAll = (busId: string) => {
    if (busId === 'PROGRAM') {
      clearAll();
    } else if (busId === 'PREVIEW') {
      clearPreviewAll();
    } else {
      routerRef.current?.clearBusAll(busId);
      setOutputs(prev => prev.map(o => o.id === busId ? { ...o, clearedSlots: [...(routerRef.current?.getBusClearedSlots(busId) || [])] } : o));
    }
  };

  const handleResetBus = (busId: string) => {
    if (busId === 'PREVIEW') {
      setPreviewClearingMask(new Set());
    } else if (busId !== 'PROGRAM') {
      routerRef.current?.resetBusClearing(busId);
      setOutputs(prev => prev.map(o => o.id === busId ? { ...o, clearedSlots: [] } : o));
    }
  };

  // ── Presentation & Playlist Creation Handlers ──
  const handleCreateShow = (newShow: Show) => {
    setLibrary(prev => [newShow, ...prev]);
    setActiveShowId(newShow.id);
  };

  const handleCreatePlaylistItem = (item: PlaylistItem) => {
    setPlaylist(prev => [...prev, item]);
    setLibrary(prev => [item.show, ...prev]);
    setActiveShowId(item.show.id);
  };

  // Splitter drag handles
  const isResizingMultiviewRef = useRef(false);
  const isResizingBottomRef = useRef(false);
  const isResizingRightRef = useRef(false);
  const dragStartYRef = useRef(0);
  const dragStartHeightRef = useRef(0);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isResizingMultiviewRef.current) {
        const delta = e.clientY - dragStartYRef.current;
        const dockOffset = libraryCollapsed ? 32 : bottomHeight;
        const maxH = window.innerHeight - 200 - dockOffset;
        const newH = Math.max(110, Math.min(maxH, dragStartHeightRef.current + delta));
        setMultiviewHeight(newH);
      }
      if (isResizingBottomRef.current) {
        const newH = Math.max(160, Math.min(600, window.innerHeight - e.clientY));
        setBottomHeight(newH);
      }
      if (isResizingRightRef.current) {
        const newW = Math.max(260, Math.min(600, window.innerWidth - e.clientX));
        setRightWidth(newW);
      }
    };
    const onMouseUp = () => {
      if (isResizingMultiviewRef.current) {
        isResizingMultiviewRef.current = false;
        try { localStorage.setItem('ambo_layout_multiview_height', String(multiviewHeight)); } catch {}
      }
      if (isResizingBottomRef.current) {
        isResizingBottomRef.current = false;
        try { localStorage.setItem('ambo_layout_bottom_height', String(bottomHeight)); } catch {}
      }
      if (isResizingRightRef.current) {
        isResizingRightRef.current = false;
        try { localStorage.setItem('ambo_layout_right_width', String(rightWidth)); } catch {}
      }
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [bottomHeight, multiviewHeight, rightWidth, libraryCollapsed]);

  const startMultiviewResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingMultiviewRef.current = true;
    dragStartYRef.current = e.clientY;
    dragStartHeightRef.current = multiviewHeight;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  };

  const startBottomResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingBottomRef.current = true;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  };

  const startRightResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRightRef.current = true;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  };

  const handleInsertScriptureSlide = (newSlide: Slide) => {
    setLibrary(libs => libs.map(sh => {
      if (sh.id !== activeShow.id) return sh;
      const next = [...sh.slides];
      const insertAt = selected >= 0 ? selected + 1 : next.length;
      next.splice(insertAt, 0, newSlide);
      return { ...sh, slides: next };
    }));
    setSelected(prev => (prev >= 0 ? prev + 1 : 0));
  };

  useEffect(() => {
    const t = setInterval(() => setElapsed(v => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const previewSlide = slides[Math.min(selected, slides.length - 1)];
  const previewStack = useMemo(() => {
    let base = previewSlide ? applySlide(live, previewSlide, Date.now()) : { ...live };
    if (previewBackgroundOverride) {
      base = {
        ...base,
        background: {
          id: newId('preview_bg'),
          slot: 'background',
          content: previewBackgroundOverride,
          since: Date.now(),
        },
      };
    }
    if (previewScriptureOverride) {
      base = {
        ...base,
        scripture: {
          content: {
            kind: 'SCRIPTURE',
            refId: previewScriptureOverride.refId,
            translation: previewScriptureOverride.translation,
            lines: previewScriptureOverride.lines,
            reference: previewScriptureOverride.reference,
          },
          since: Date.now(),
        },
      };
    }

    if (previewClearingMask.size > 0) {
      const filtered: LiveStack = {};
      for (const slot of LAYER_ORDER) {
        if (!previewClearingMask.has(slot) && base[slot]) {
          filtered[slot] = base[slot];
        }
      }
      return filtered;
    }
    return base;
  }, [live, previewSlide, previewBackgroundOverride, previewScriptureOverride, previewClearingMask]);

  const isVideoLiveOnProgram = effectiveLiveStack.background?.content?.kind === 'VIDEO';
  const isVideoCuedInPreview = previewStack.background?.content?.kind === 'VIDEO';
  const activeVideoContent = (isVideoLiveOnProgram
    ? effectiveLiveStack.background?.content
    : isVideoCuedInPreview
    ? previewStack.background?.content
    : null) as Extract<LayerContent, { kind: 'VIDEO' }> | null;

  const activeVideoLabel = isVideoLiveOnProgram
    ? (liveSlideObj?.label || 'Program Video')
    : (previewSlide?.label || 'Preview Video');

  const take = (s: Slide) => {
    // Ensure PROGRAM output exists and is enabled as the primary target
    const programOut = outputs.find(o => o.kind === 'PROGRAM');
    if (programOut && !programOut.enabled) {
      // Auto-enable PROGRAM output on take
      setOutputs(prev => prev.map(o => o.id === programOut.id ? { ...o, enabled: true } : o));
    }

    setLive(prev => applySlide(prev, s, Date.now()));
    setLiveSlideId(s.id);
    setLiveSlideObj(s);
    setPreviewBackgroundOverride(null);
  };

  // Scripture fires to the scripture LAYER — composites OVER the live slide.
  const fireScripture = (cue: ScriptureCue) => {
    const scriptureSlide: Slide = {
      id: newId('scr'),
      label: cue.reference,
      layers: [{
        id: newId('ly'),
        slot: 'scripture',
        content: { kind: 'SCRIPTURE', refId: cue.refId, translation: cue.translation, lines: cue.lines, reference: cue.reference },
      }],
    };
    setLive(prev => applySlide(prev, scriptureSlide, Date.now()));
  };
  const takeSelected = () => { if (previewSlide) take(previewSlide); };

  // ── LoopDeck Advance & Watch Folder Handlers ──
  const handleLoopDeckAdvance = React.useCallback(() => {
    if (!slides || slides.length === 0) return;
    const nextPick = getNextLoopDeckSlide(slides, liveSlideId, loopDeckMode);
    if (nextPick) {
      take(nextPick.slide);
      setCurrentSlideLoops(1);
    }
  }, [slides, liveSlideId, loopDeckMode]);

  // Video loop event listener from LayerSources & DOM video
  useEffect(() => {
    if (!isLoopDeckActive || !liveSlideId) return;

    const onVideoLoop = () => {
      setCurrentSlideLoops(prev => {
        const next = prev + 1;
        if (next > loopDeckCount) {
          handleLoopDeckAdvance();
          return 1;
        }
        return next;
      });
    };

    window.addEventListener('ambo:video-loop', onVideoLoop);
    return () => window.removeEventListener('ambo:video-loop', onVideoLoop);
  }, [isLoopDeckActive, liveSlideId, loopDeckCount, handleLoopDeckAdvance]);

  // Non-video slide loop duration timer
  useEffect(() => {
    if (!isLoopDeckActive || !liveSlideObj) return;
    const hasVideo = liveSlideObj.layers.some(ly => ly.content.kind === 'VIDEO');
    if (hasVideo) return; // Video uses frame-accurate video loop events

    const secPerLoop = liveSlideObj.advanceAfterSec || 5;
    const timer = setInterval(() => {
      setCurrentSlideLoops(prev => {
        const next = prev + 1;
        if (next > loopDeckCount) {
          handleLoopDeckAdvance();
          return 1;
        }
        return next;
      });
    }, secPerLoop * 1000);

    return () => clearInterval(timer);
  }, [isLoopDeckActive, liveSlideObj, loopDeckCount, handleLoopDeckAdvance]);

  // Reset loop counter on manual slide change
  useEffect(() => {
    setCurrentSlideLoops(1);
  }, [liveSlideId]);

  // Watch Folder Connection Handler
  const handleConnectWatchFolder = async () => {
    try {
      const res = await pickWatchFolder();
      if (!res || res.items.length === 0) return;

      const newShow = createWatchFolderShow(res.folderName, res.items, {
        loopCount: loopDeckCount,
        selectionMode: loopDeckMode,
      });

      setLibrary(prev => {
        const filtered = prev.filter(s => s.tags?.includes('watch-folder') ? s.title !== newShow.title : true);
        return [newShow, ...filtered];
      });

      setActiveShowId(newShow.id);
      setWatchFolderName(res.folderName);
      setWatchFolderHandle(res.handle || null);
      setIsLoopDeckActive(true);

      const firstSlide = loopDeckMode === 'random' && newShow.slides.length > 1
        ? newShow.slides[Math.floor(Math.random() * newShow.slides.length)]
        : newShow.slides[0];

      if (firstSlide) {
        take(firstSlide);
      }
    } catch (e) {
      console.warn('Watch folder connection cancelled or error:', e);
    }
  };

  const handleDisconnectWatchFolder = () => {
    setWatchFolderName(null);
    setWatchFolderHandle(null);
  };

  // Auto-rescan directory handle for newly dropped media
  useEffect(() => {
    if (!watchFolderHandle) return;
    const interval = setInterval(async () => {
      try {
        const targetShow = library.find(s => s.id === activeShowId);
        if (!targetShow) return;
        const { items: updated, addedCount } = await rescanDirectoryHandle(watchFolderHandle);
        if (addedCount > 0) {
          const merged = mergeWatchFolderShow(targetShow, updated);
          setLibrary(libs => libs.map(sh => sh.id === merged.id ? merged : sh));
        }
      } catch {
        /* best-effort background rescan */
      }
    }, 6000);
    return () => clearInterval(interval);
  }, [watchFolderHandle, library, activeShowId]);

  const openEditor = (i: number) => setEditorIdx(i);
  const editorSlide = editorIdx != null ? slides[editorIdx] : null;
  const boundRef = activeShow.kind === 'SCRIPTURE' ? 'Luke 15:11–24 · KJV' : null;

  // Platform-standard context menus (reusing shared design system useContextMenu primitive)
  const slideMenu = useContextMenu<number>((slideIndex) => {
    const s = slides[slideIndex];
    if (!s) return [];
    return [
      {
        kind: 'header',
        label: `Slide ${slideIndex + 1}: ${s.label || 'Slide'}`,
        swatch: s.groupColor,
      },
      {
        id: 'take',
        label: 'Take Live (Program)',
        icon: <Play size={14} className="text-[#FF8C00]" />,
        shortcut: 'Double-Click',
        onSelect: () => take(s),
      },
      {
        id: 'cue',
        label: 'Cue in Preview',
        icon: <Eye size={14} className="text-[#00DAF3]" />,
        shortcut: 'Click',
        onSelect: () => selectSlide(slideIndex),
      },
      {
        id: 'inspect',
        label: 'Inspect Slide & Layers',
        icon: <Sliders size={14} />,
        onSelect: () => {
          setSelected(slideIndex);
          setInspectorOpen(true);
        },
      },
      {
        id: 'tela',
        label: 'Edit in Tela (Alt+Click)',
        icon: <Pencil size={14} />,
        shortcut: 'Alt+Click',
        onSelect: () => openEditor(slideIndex),
      },
      {
        id: 'route',
        label: 'Route NDI / Video...',
        icon: <Radio size={14} className="text-[#7c9ce8]" />,
        onSelect: () => {
          setSelected(slideIndex);
          setRouterReceiverOpen(true);
        },
      },
      { kind: 'separator' },
      {
        id: 'add-below',
        label: 'Add Slide Below',
        icon: <Plus size={14} />,
        onSelect: () => handleAddSlide(slideIndex),
      },
      {
        id: 'add-above',
        label: 'Add Slide Above',
        icon: <Plus size={14} />,
        onSelect: () => handleAddSlide(slideIndex - 1),
      },
      {
        id: 'duplicate',
        label: 'Duplicate Slide',
        icon: <Copy size={14} />,
        shortcut: '⌘D',
        onSelect: () => handleDuplicateSlide(slideIndex),
      },
      { kind: 'separator' },
      {
        id: 'delete',
        label: 'Delete Slide',
        icon: <Trash2 size={14} />,
        danger: true,
        shortcut: '⌫',
        disabled: slides.length <= 1,
        onSelect: () => handleDeleteSlide(slideIndex),
      },
    ];
  });

  const canvasMenu = useContextMenu<void>(() => [
    { kind: 'header', label: 'Presentation Options' },
    {
      id: 'add',
      label: '+ Add New Slide',
      icon: <Plus size={14} />,
      onSelect: () => handleAddSlide(),
    },
    {
      id: 'inspect',
      label: 'Open Slide Inspector',
      icon: <Sliders size={14} />,
      onSelect: () => setInspectorOpen(true),
    },
    {
      id: 'router',
      label: 'Open Router Receiver',
      icon: <Radio size={14} className="text-[#7c9ce8]" />,
      onSelect: () => setRouterReceiverOpen(true),
    },
    { kind: 'separator' },
    {
      id: 'scan-ndi',
      label: 'Scan LAN NDI Streams',
      icon: <RefreshCw size={14} className="text-[#7c9ce8]" />,
      onSelect: () => handleScanNdi(),
    },
  ]);

  const saveSlideText = (text: string) => {
    if (!editorSlide) return;
    const id = editorSlide.id;
    setLibrary(libs => libs.map(sh => (sh.id !== activeShow.id ? sh : {
      ...sh, slides: sh.slides.map(sl => (sl.id !== id ? sl : withText(sl, text))),
    })));
    if (id === liveSlideId) {
      const patched = withText(editorSlide, text);
      setLive(prev => applySlide(prev, patched, Date.now()));
      setLiveSlideObj(patched);
    }
  };

  const liveIdx = slides.findIndex(s => s.id === liveSlideId);
  const nextSlide = liveIdx >= 0 && liveIdx + 1 < slides.length ? slides[liveIdx + 1] : previewSlide;

  // Broadcast Master state to all slaved devices in real-time
  useEffect(() => {
    if (partySession?.isActive) {
      broadcastMasterSource({
        type: 'AMBO_PROGRAM',
        liveStack: isBlackout ? {} : live,
        slide: liveSlideObj,
        nextSlide,
        isPlaying: !isBlackout,
        title: liveSlideObj?.label || 'Program Out Live',
      });
    }
  }, [live, liveSlideObj, nextSlide, isBlackout, partySession?.isActive]);

  const elapsedClock = `${String(Math.floor(elapsed / 3600)).padStart(2, '0')}:${String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;

  // Which layer slots are currently live (for the layer bar).
  const liveSlots = new Set(Object.keys(live));

  const primaryOut = outputs[0];
  const detectedResolutionText = (primaryOut && primaryOut.width && primaryOut.height)
    ? `${primaryOut.width}×${primaryOut.height}${primaryOut.aspectRatio ? ` (${primaryOut.aspectRatio})` : ''}`
    : '1920×1080 (16:9)';

  const renderOutputPreview = (compact?: boolean) => (
    <div className={compact ? '' : 'p-3.5'} style={{ willChange: 'transform', transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: ORANGE }}>● Audience Output</span>
          {cleanFeedOpen && (
            <span className="text-[8px] font-mono px-1 rounded bg-[#FF8C00]/20 text-[#FF8C00]">FEED LIVE</span>
          )}
        </div>
        <span className="font-mono text-[9.5px] text-white/60 bg-white/5 px-1.5 py-0.5 rounded border border-white/10" title="Detected native physical resolution">
          {detectedResolutionText}
        </span>
      </div>
      <div className="rounded-xl overflow-hidden border-2" style={{ borderColor: liveSlideId ? 'rgba(255,140,0,0.75)' : line2, boxShadow: liveSlideId ? '0 0 22px rgba(255,140,0,0.28)' : 'none' }}>
        <OutputMonitor stack={effectiveLiveStack} audio={!isBlackout} />
      </div>
      <div className="flex items-center justify-between mt-3 mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: CYAN }}>Preview · Next</span>
          {previewClearingMask.size > 0 && (
            <span className="text-[8px] font-mono px-1 rounded bg-[#00DAF3]/20 text-[#00DAF3]">
              {previewClearingMask.size} CLR
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearPreviewAll}
            className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#00DAF3]/15 text-[#00DAF3] hover:bg-[#00DAF3]/25 transition-colors"
            title="Clear all preview layers"
          >
            Clr All
          </button>
          <button
            onClick={clearPreviewSlide}
            className="px-1 py-0.5 rounded text-[9px] text-white/50 hover:text-white transition-colors"
            title="Clear preview slide"
          >
            Slide
          </button>
          <button
            onClick={clearPreviewBackground}
            className="px-1 py-0.5 rounded text-[9px] text-white/50 hover:text-white transition-colors"
            title="Clear preview background"
          >
            BG
          </button>
          <button
            onClick={clearPreviewScripture}
            className="px-1 py-0.5 rounded text-[9px] text-[#E3C57E]/70 hover:text-[#E3C57E] transition-colors"
            title="Clear preview scripture"
          >
            Scr
          </button>
          {previewClearingMask.size > 0 && (
            <button
              onClick={() => handleResetBus('PREVIEW')}
              className="px-1 py-0.5 rounded text-[9px] text-white/40 hover:text-white transition-colors"
              title="Reset preview clearing"
            >
              <RotateCcw size={9} />
            </button>
          )}
        </div>
      </div>
      <div className="rounded-lg overflow-hidden border" style={{ borderColor: 'rgba(0,218,243,0.4)' }}>
        <OutputMonitor stack={previewStack} />
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[120] flex flex-col" style={{ background: GROUND }}>
      {/* toolbar — split into 2 rows so controls never collide with native window buttons */}
      <div className="flex-none border-b backdrop-blur-xl" style={{ borderColor: line, background: HEADER }}>
      {/* ── ROW 1: App Bar — identity, menus, project info ── */}
      <header className="flex items-center gap-3 px-4 py-1.5 border-b border-white/[0.04]" style={{ paddingRight: 'calc(max(1rem, 140px))' }}>
        {onBack && (
          <button onClick={onBack} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white/70 hover:text-white hover:bg-white/5 transition-colors">
            <ChevronLeft size={16} /> Exit
          </button>
        )}
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg grid place-items-center text-white font-extrabold text-[15px]" style={{ background: BRAND, boxShadow: '0 6px 22px rgba(212,0,85,0.34)' }}>A</span>
          <div className="leading-tight">
            <div className="font-bold tracking-tight text-[15px]">Ambo</div>
            <div className="text-[9.5px] text-white/40 -mt-0.5">MEDIA SERVER</div>
          </div>
        </div>

        {/* Backdrop for closing dropdown menus on outside click */}
        {(isFileMenuOpen || isOutputMenuOpen) && (
          <div
            className="fixed inset-0 z-30 bg-transparent"
            onClick={() => {
              setIsFileMenuOpen(false);
              setIsOutputMenuOpen(false);
            }}
          />
        )}

        {/* ── FILE MENU ── */}
        <div className="relative z-40">
          <button
            onClick={() => {
              setIsFileMenuOpen(v => !v);
              setIsOutputMenuOpen(false);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
              isFileMenuOpen
                ? 'bg-white/15 text-white border-white/25 shadow-md'
                : 'text-white/80 hover:text-white hover:bg-white/10 border-white/10 bg-white/5'
            }`}
            title="File Menu (Save, Save As, New Project, Import/Export)"
          >
            <FileText size={13} className="text-[#00DAF3]" />
            <span>File</span>
            <ChevronDown size={11} className={`text-white/40 transition-transform ${isFileMenuOpen ? 'rotate-180 text-white' : ''}`} />
          </button>

          {isFileMenuOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-64 bg-[#120d1c] border border-white/15 rounded-xl shadow-2xl p-1.5 z-50 text-white animate-in fade-in duration-100">
              <div className="px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-white/40 border-b border-white/10 mb-1">
                Project File
              </div>
              
              <button
                onClick={() => {
                  setIsFileMenuOpen(false);
                  setNewProjectName(`Sunday Service ${new Date().toLocaleDateString()}`);
                  setIsNewProjectModalOpen(true);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white/90 hover:text-white hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <FolderPlus size={13} className="text-[#00DAF3]" />
                  <span>New Project...</span>
                </div>
              </button>

              <button
                onClick={() => {
                  setIsFileMenuOpen(false);
                  setIsNewShowModalOpen(true);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white/90 hover:text-white hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Plus size={13} className="text-emerald-400" />
                  <span>New Presentation...</span>
                </div>
              </button>

              <div className="w-full h-px bg-white/10 my-1" />

              <button
                onClick={() => {
                  setIsFileMenuOpen(false);
                  handleManualSave();
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white/90 hover:text-white hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Save size={13} className="text-emerald-400" />
                  <span>Save</span>
                </div>
                <span className="font-mono text-[9.5px] text-white/40">Ctrl+S</span>
              </button>

              <button
                onClick={() => {
                  setIsFileMenuOpen(false);
                  setSaveAsName(`${currentProject.name} (Copy)`);
                  setIsSaveAsModalOpen(true);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white/90 hover:text-white hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Copy size={13} className="text-amber-400" />
                  <span>Save As...</span>
                </div>
              </button>

              <div className="w-full h-px bg-white/10 my-1" />

              <button
                onClick={() => {
                  setIsFileMenuOpen(false);
                  setIsProjectSwitcherOpen(true);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white/90 hover:text-white hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <FolderOpen size={13} className="text-[#E3C57E]" />
                  <span>Open / Switch Project...</span>
                </div>
              </button>

              <button
                onClick={() => {
                  setIsFileMenuOpen(false);
                  setIsImportModalOpen(true);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white/90 hover:text-white hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Upload size={13} className="text-[#00DAF3]" />
                  <span>Import Presentation...</span>
                </div>
              </button>

              <div className="w-full h-px bg-white/10 my-1" />

              <button
                onClick={() => {
                  setIsFileMenuOpen(false);
                  exportProjectJson(currentProject);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Download size={13} className="text-white/60" />
                  <span>Export JSON (.amboprj)</span>
                </div>
              </button>

              <button
                onClick={() => {
                  setIsFileMenuOpen(false);
                  exportProjectBundle(currentProject);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Download size={13} className="text-white/60" />
                  <span>Export Bundle (.amboz)</span>
                </div>
              </button>

              <div className="w-full h-px bg-white/10 my-1" />

              <div className="px-2.5 py-1 text-[10px] text-white/50 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Check size={11} className="text-emerald-400" />
                  <span>Auto-Save Enabled</span>
                </span>
                <span className="font-mono text-[9px] text-emerald-400">IndexedDB + Cloud</span>
              </div>
            </div>
          )}
        </div>

        {/* ── OUTPUT SETTINGS MENU ── */}
        <div className="relative z-40">
          <button
            onClick={() => {
              setIsOutputMenuOpen(v => !v);
              setIsFileMenuOpen(false);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
              isOutputMenuOpen
                ? 'bg-[#FF8C00]/25 text-[#FF8C00] border-[#FF8C00]/50 shadow-md ring-1 ring-[#FF8C00]/30'
                : 'text-white/80 hover:text-white hover:bg-white/10 border-white/10 bg-white/5'
            }`}
            title="Output Settings, Multi-screen, Aspect Ratio & LED Wall / Signage Studio"
          >
            <MonitorPlay size={13} className="text-[#FF8C00]" />
            <span>Outputs</span>
            {isProgramWindowOpen && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF8C00] animate-pulse" />
            )}
            <ChevronDown size={11} className={`text-white/40 transition-transform ${isOutputMenuOpen ? 'rotate-180 text-white' : ''}`} />
          </button>

          {isOutputMenuOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-80 bg-[#120d1c] border border-white/15 rounded-xl shadow-2xl p-2 z-50 text-white max-h-[85vh] overflow-y-auto custom-scrollbar animate-in fade-in duration-100 space-y-2">
              {/* PRIMARY PRO FEATURE ENTRY POINT: LED Wall & Digital Signage Studio */}
              <button
                onClick={() => {
                  setIsLedWallModalOpen(true);
                  setIsOutputMenuOpen(false);
                }}
                className="w-full text-left p-2.5 rounded-xl border border-[#FF8C00]/50 bg-gradient-to-r from-[#D40055]/25 via-[#6B0099]/30 to-[#FF8C00]/25 hover:from-[#D40055]/40 hover:to-[#FF8C00]/40 transition-all group flex items-start gap-2.5 shadow-lg"
              >
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#00DAF3] to-[#6B0099] flex items-center justify-center text-white shrink-0 shadow-md group-hover:scale-105 transition-transform">
                  <Grid size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-bold text-white group-hover:text-[#00DAF3] transition-colors">
                      LED Wall &amp; Signage Studio
                    </span>
                    <span className="text-[7.5px] font-black uppercase px-1.5 py-0.5 rounded bg-[#FF8C00] text-black">
                      PRO
                    </span>
                  </div>
                  <p className="text-[10px] text-white/60 leading-tight mt-0.5">
                    Pixel pitch auto-mapping, cabinets, Novastar/Brompton, and Samsung SMART Signage sync
                  </p>
                </div>
              </button>

              <div className="w-full h-px bg-white/10" />

              {/* Physical Screens & Clean Feed */}
              <div>
                <div className="flex items-center justify-between px-1 mb-1">
                  <span className="text-[9px] font-black uppercase tracking-[0.14em] text-white/40">
                    Physical Displays &amp; Clean Feed
                  </span>
                  <button
                    onClick={probeDisplays}
                    className="text-[8.5px] text-[#00DAF3] hover:underline flex items-center gap-1 font-mono"
                    title="Rescan displays"
                  >
                    <RefreshCw size={9} />
                    <span>Probe</span>
                  </button>
                </div>

                {/* Secondary Display Clean Feed Toggle */}
                <button
                  onClick={() => {
                    handleToggleProgramWindow();
                  }}
                  className={`w-full flex items-center justify-between p-2 rounded-lg border text-xs font-semibold transition-all mb-1.5 ${
                    isProgramWindowOpen
                      ? 'bg-[#FF8C00]/20 text-[#FF8C00] border-[#FF8C00]/50'
                      : 'bg-white/5 text-white/80 hover:bg-white/10 border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Tv size={14} className={isProgramWindowOpen ? 'text-[#FF8C00] animate-pulse' : 'text-white/60'} />
                    <span>Program Out Clean Feed</span>
                  </div>
                  <span className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded ${isProgramWindowOpen ? 'bg-[#FF8C00] text-black' : 'bg-white/10 text-white/50'}`}>
                    {isProgramWindowOpen ? 'ACTIVE' : 'OFF'}
                  </span>
                </button>

                {/* Detected Screens */}
                {screens.length > 0 && (
                  <div className="space-y-1 mb-2">
                    {screens.map(scr => (
                      <button
                        key={scr.index}
                        onClick={() => {
                          setTargetDisplayIndex(scr.index);
                          if (isProgramWindowOpen) {
                            handleToggleProgramWindow(scr.index);
                          }
                        }}
                        className={`w-full text-left px-2 py-1.5 rounded-md text-[11px] font-medium flex items-center justify-between transition-colors ${
                          targetDisplayIndex === scr.index
                            ? 'bg-[#FF8C00]/15 text-[#FF8C00] border border-[#FF8C00]/30'
                            : 'text-white/70 hover:bg-white/5 border border-transparent'
                        }`}
                      >
                        <div className="truncate pr-1">
                          <span className="font-semibold">{scr.label || `Display ${scr.index + 1}`}</span>
                          <span className="text-[9px] text-white/40 ml-1.5 font-mono">
                            {scr.width}×{scr.height} {scr.primary ? '(Primary)' : '(Secondary)'}
                          </span>
                        </div>
                        {targetDisplayIndex === scr.index && <Check size={11} className="text-[#FF8C00]" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="w-full h-px bg-white/10" />

              {/* Aspect Ratio Selector */}
              <div>
                <span className="text-[9px] font-black uppercase tracking-[0.14em] text-white/40 block px-1 mb-1">
                  Program Aspect Ratio
                </span>
                <div className="grid grid-cols-4 gap-1">
                  {(['16:9', '16:10', '4:3', '21:9'] as const).map(ratio => {
                    const isSelected = (currentProject.settings?.aspectRatio || '16:9') === ratio;
                    return (
                      <button
                        key={ratio}
                        onClick={() => handleSetAspectRatio(ratio)}
                        className={`py-1 rounded-md text-[10px] font-bold font-mono transition-all border ${
                          isSelected
                            ? 'bg-[#00DAF3]/20 text-[#00DAF3] border-[#00DAF3]/50'
                            : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border-white/10'
                        }`}
                      >
                        {ratio}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="w-full h-px bg-white/10" />

              {/* Output Channels (Quick Toggles) */}
              <div>
                <span className="text-[9px] font-black uppercase tracking-[0.14em] text-white/40 block px-1 mb-1">
                  Output Channels &amp; Destinations
                </span>
                <div className="space-y-1">
                  {outputs.map(out => (
                    <div
                      key={out.id}
                      onClick={() => toggleOutput(out.id)}
                      className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer border border-white/10 transition-colors"
                    >
                      <div className="truncate pr-1 leading-tight">
                        <div className="text-[11px] font-semibold text-white flex items-center gap-1.5">
                          <span className={out.enabled ? 'text-[#FF8C00]' : 'text-white/40'}>●</span>
                          <span>{out.name}</span>
                        </div>
                        <div className="text-[8.5px] font-mono text-white/40">
                          {out.width}×{out.height} ({out.aspectRatio || '16:9'})
                        </div>
                      </div>
                      <span className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded ${out.enabled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/10 text-white/40'}`}>
                        {out.enabled ? 'ENABLED' : 'MUTED'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="w-full h-px bg-white/10" />

              {/* Master Output Control Shortcuts */}
              <div className="flex items-center gap-1.5 pt-0.5">
                <button
                  onClick={() => setIsBlackout(v => !v)}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-1 border ${
                    isBlackout
                      ? 'bg-red-600 text-white border-red-500 shadow-md animate-pulse'
                      : 'bg-white/5 hover:bg-white/10 text-white/80 border-white/15'
                  }`}
                >
                  <EyeOff size={11} />
                  <span>{isBlackout ? 'BLACKOUT ON' : 'Blackout'}</span>
                </button>

                <button
                  onClick={() => setIsMasterProgramOn(v => !v)}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-1 border ${
                    isMasterProgramOn
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                      : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40'
                  }`}
                >
                  <Power size={11} />
                  <span>{isMasterProgramOn ? 'PGM ACTIVE' : 'PGM MUTED'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Project Switcher & Workspace Details */}
        <div className="pl-2 ml-1 border-l flex items-center gap-2.5" style={{ borderColor: line }}>
          <button
            onClick={() => setIsProjectSwitcherOpen(true)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-left transition-colors border border-transparent hover:border-white/10 group cursor-pointer"
            title="Click to switch projects or workspaces"
          >
            <div className="leading-tight">
              <div className="text-[13px] font-bold text-white flex items-center gap-1.5">
                <span className="truncate max-w-[170px]">{currentProject.name}</span>
                <ChevronDown size={12} className="text-white/40 group-hover:text-white transition-colors" />
              </div>
              <div className="text-[10px] text-white/45 flex items-center gap-1">
                {currentProject.scope === 'ORGANIZATION' ? (
                  <span className="text-[#E3C57E] font-medium truncate max-w-[130px]">
                    {currentProject.organizationName || 'Organization'}
                  </span>
                ) : (
                  <span className="text-[#00DAF3] font-medium">Personal Workspace</span>
                )}
                <span>·</span>
                <span>{library.length} shows</span>
              </div>
            </div>
          </button>

          {/* Auto-save Status Indicator */}
          <div
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold border transition-all ${
              autoSaveStatus === 'saving'
                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                : autoSaveStatus === 'saved'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : autoSaveStatus === 'offline'
                ? 'bg-blue-500/10 text-blue-300 border-blue-500/20'
                : 'bg-red-500/10 text-red-300 border-red-500/20'
            }`}
            title={
              autoSaveStatus === 'saving'
                ? 'Auto-saving changes...'
                : autoSaveStatus === 'saved'
                ? 'All changes auto-saved to cloud & local storage'
                : autoSaveStatus === 'offline'
                ? 'Auto-saved locally (offline)'
                : 'Auto-save failed'
            }
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                autoSaveStatus === 'saving'
                  ? 'bg-amber-400 animate-ping'
                  : autoSaveStatus === 'saved'
                  ? 'bg-emerald-400'
                  : autoSaveStatus === 'offline'
                  ? 'bg-blue-400'
                  : 'bg-red-400'
              }`}
            />
            <span>
              {autoSaveStatus === 'saving'
                ? 'Saving'
                : autoSaveStatus === 'saved'
                ? 'Saved'
                : autoSaveStatus === 'offline'
                ? 'Saved Local'
                : 'Error'}
            </span>
          </div>

          {/* Save Flash Feedback */}
          {saveFeedback && (
            <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 animate-in fade-in duration-150">
              <Check size={10} className="text-emerald-400" />
              <span>{saveFeedback}</span>
            </div>
          )}

          {/* Quick Import Button */}
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-white/70 hover:text-white hover:bg-white/10 border border-white/10 transition-colors"
            title="Import PowerPoint, PDF, FreeShow, Keynote"
          >
            <Upload size={11} className="text-[#00DAF3]" />
            <span>Import</span>
          </button>
        </div>
        <div className="flex-1" />
      </header>
      {/* ── ROW 2: Transport Bar — bus clearing, stage, scripture, party, program out, clock, TAKE ── */}
      <div className="flex items-center gap-2 px-4 py-1.5">
        {/* ProPresenter Master Layer Clear & Bus Architecture Controls */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl border border-white/10 bg-black/40">
          <div className="flex items-center gap-1 text-[10px] text-white/50 pr-1 border-r border-white/10">
            <span className="font-bold">BUS:</span>
            <select
              value={activeBusClearingTarget}
              onChange={e => setActiveBusClearingTarget(e.target.value)}
              className="bg-black/60 border border-white/15 rounded px-1.5 py-0.5 text-[10px] font-bold text-white outline-none cursor-pointer"
            >
              <option value="PROGRAM">Program Out</option>
              <option value="PREVIEW">Preview Monitor</option>
              {outputs.filter(o => o.kind !== 'PROGRAM').map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => handleClearBusAll(activeBusClearingTarget)}
            className={`px-2 py-1 rounded-lg text-[10.5px] font-bold transition-all flex items-center gap-1 ${
              activeBusClearingTarget === 'PREVIEW'
                ? 'bg-[#00DAF3]/20 text-[#00DAF3] hover:bg-[#00DAF3]/30 border border-[#00DAF3]/40'
                : Object.keys(live).length > 0
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30'
                : 'text-white/40 hover:text-white/70'
            }`}
            title={`Clear All Layers on ${activeBusClearingTarget}`}
          >
            <Ban size={11} />
            <span>Clear All</span>
          </button>
          <div className="w-px h-4 bg-white/10 mx-0.5" />
          <button
            onClick={() => handleClearBusSlot(activeBusClearingTarget, 'slide')}
            className="px-1.5 py-1 rounded text-[10px] font-semibold text-white/50 hover:text-white transition-all"
            title={`Clear Slide on ${activeBusClearingTarget}`}
          >
            Slide
          </button>
          <button
            onClick={() => handleClearBusSlot(activeBusClearingTarget, 'background')}
            className="px-1.5 py-1 rounded text-[10px] font-semibold text-white/50 hover:text-white transition-all"
            title={`Clear Background on ${activeBusClearingTarget}`}
          >
            BG
          </button>
          <button
            onClick={() => handleClearBusSlot(activeBusClearingTarget, 'prop')}
            className="px-1.5 py-1 rounded text-[10px] font-semibold text-white/50 hover:text-white transition-all"
            title={`Clear Lower Thirds / Props on ${activeBusClearingTarget}`}
          >
            Props
          </button>
          <button
            onClick={() => handleClearBusSlot(activeBusClearingTarget, 'scripture')}
            className="px-1.5 py-1 rounded text-[10px] font-semibold text-[#E3C57E]/70 hover:text-[#E3C57E] transition-all"
            title={`Clear Scripture on ${activeBusClearingTarget}`}
          >
            Scripture
          </button>
          <button
            onClick={activeBusClearingTarget === 'PREVIEW' ? clearPreviewAudio : clearAudio}
            className="px-1.5 py-1 rounded text-[10px] font-semibold text-white/40 hover:text-white/70 transition-all"
            title="Clear / Stop Audio"
          >
            <VolumeX size={11} />
          </button>
          {activeBusClearingTarget !== 'PROGRAM' && (
            <button
              onClick={() => handleResetBus(activeBusClearingTarget)}
              className="px-1.5 py-1 rounded text-[10px] font-bold text-[#00DAF3] hover:bg-[#00DAF3]/10 transition-all flex items-center gap-1"
              title="Reset Cleared Layers on this Bus"
            >
              <RotateCcw size={10} />
              <span>Reset</span>
            </button>
          )}
          <div className="w-px h-4 bg-white/10 mx-0.5" />
          {/* Blackout Toggle */}
          <button
            onClick={() => setIsBlackout(v => !v)}
            className={`px-2.5 py-1 rounded-lg text-[10.5px] font-extrabold transition-all flex items-center gap-1 ${
              isBlackout
                ? 'bg-red-600 text-white shadow-[0_0_15px_rgba(239,68,68,0.6)] animate-pulse'
                : 'bg-white/5 hover:bg-white/10 text-white/70 border border-white/10'
            }`}
            title="Master Blackout (Blank Program Out without unloading layers)"
          >
            <EyeOff size={11} />
            <span>BLK</span>
          </button>
          {/* Master Program ON/OFF */}
          <button
            onClick={() => setIsMasterProgramOn(v => !v)}
            className={`px-2 py-1 rounded-lg text-[10.5px] font-bold transition-all flex items-center gap-1 ${
              isMasterProgramOn
                ? 'text-emerald-400 bg-emerald-500/15 border border-emerald-500/30'
                : 'text-yellow-400 bg-yellow-500/15 border border-yellow-500/30'
            }`}
            title="Master Program Out Feed Switch"
          >
            <Power size={11} />
            <span>{isMasterProgramOn ? 'PGM ON' : 'PGM OFF'}</span>
          </button>
        </div>

        <button onClick={() => setStageOpen(true)} className="flex items-center gap-1.5 px-3 h-9 rounded-lg text-[13px] font-semibold border" style={{ borderColor: line2, background: glass }}>
          <MonitorPlay size={14} style={{ color: CYAN }} /> Stage
        </button>
        <button onClick={() => setScriptureOpen(true)} className="flex items-center gap-1.5 px-3 h-9 rounded-lg text-[13px] font-semibold border" style={{ borderColor: !!live.scripture ? 'rgba(227,197,126,0.5)' : line2, background: !!live.scripture ? 'rgba(227,197,126,0.12)' : glass }}>
          <BookOpen size={14} style={{ color: GOLD }} /> Scripture
        </button>

        {/* Party / Event Mode Mesh Launcher */}
        <button
          onClick={() => setIsPartyModalOpen(true)}
          className={`flex items-center gap-1.5 px-3 h-9 rounded-lg text-[13px] font-bold border transition-all ${
            partySession?.isActive
              ? 'bg-gradient-to-r from-purple-600/30 to-pink-600/30 border-pink-500/50 text-pink-300 shadow-[0_0_15px_rgba(212,0,85,0.3)] animate-pulse'
              : 'border-white/15 bg-white/5 hover:bg-white/10 text-white/80'
          }`}
          title="Open Party / Event Central Command"
        >
          <Sparkles size={14} className={partySession?.isActive ? 'text-pink-400' : 'text-[#00DAF3]'} />
          <span>{partySession?.isActive ? `Event Mode (${partyDevices.filter(d => d.isOnline).length})` : 'Party / Event Mode'}</span>
        </button>

        {partySession?.isActive && (
          <button
            onClick={() => setMasterSync(!partySession?.masterSyncEngaged)}
            className={`flex items-center gap-1 px-2.5 h-9 rounded-lg text-xs font-black uppercase transition-all ${
              partySession?.masterSyncEngaged
                ? 'bg-[#FF8C00] text-black shadow-md shadow-[#FF8C00]/40 ring-1 ring-[#FF8C00]'
                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
            }`}
            title="Toggle Master Sync (Slave all devices to Master vs Mute/Release to independent duties)"
          >
            <Zap size={13} fill={partySession?.masterSyncEngaged ? 'currentColor' : 'none'} />
            <span>{partySession?.masterSyncEngaged ? 'Sync On' : 'Sync Muted'}</span>
          </button>
        )}
        
        {/* Identify Displays Button */}
        <button
          onClick={() => flashAllDisplayIdentifiers(outputs)}
          className="px-2 py-1.5 h-9 rounded-lg text-[10px] font-bold bg-white/5 text-white/60 hover:bg-white/10 hover:text-white border border-white/10 transition-all flex items-center gap-1"
          title="Flash display names on all outputs for 3 seconds"
        >
          <Monitor size={12} />
          <span>Identify</span>
        </button>

        {/* Pair Device Button */}
        <div className="relative">
          <button
            onClick={() => setShowPairing(!showPairing)}
            className={`px-2 py-1.5 h-9 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 ${
              showPairing
                ? 'bg-[#00DAF3]/20 text-[#00DAF3] border border-[#00DAF3]/40'
                : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white border border-white/10'
            }`}
            title="Pair another device as output"
          >
            <Smartphone size={12} />
            <span>Pair</span>
          </button>
          {showPairing && pairingInfo && (
            <div className="absolute top-full mt-1 right-0 z-50">
              <PairingPanel
                info={pairingInfo}
                onRefresh={() => {
                  const uid = auth.currentUser?.uid;
                  if (uid) setPairingInfo(generatePairingInfo(uid));
                }}
              />
            </div>
          )}
        </div>

        {/* Dedicated Physical Program Out Window Control */}
        <div className="relative">
          <button
            onClick={() => handleToggleProgramWindow()}
            className={`flex items-center gap-1.5 px-3 h-9 rounded-lg text-[13px] font-semibold border transition-all ${
              isProgramWindowOpen
                ? 'bg-[#FF8C00]/20 text-[#FF8C00] border-[#FF8C00]/60 shadow-[0_0_15px_rgba(255,140,0,0.3)] ring-1 ring-[#FF8C00]/40'
                : 'bg-white/5 text-white/80 hover:text-white hover:bg-white/10 border-white/15'
            }`}
            title={
              isProgramWindowOpen
                ? 'Program Out Window is Active. Click to close or change display'
                : 'Open dedicated Program Out Window for video wall, projection, or secondary display'
            }
          >
            <Tv size={14} className={isProgramWindowOpen ? 'text-[#FF8C00] animate-pulse' : 'text-white/60'} />
            <span>Program Out</span>
            {isProgramWindowOpen ? (
              <span className="w-2 h-2 rounded-full bg-[#FF8C00] ml-0.5" />
            ) : (
              <span className="text-[10px] text-white/40 font-mono ml-0.5">2nd Disp</span>
            )}
            {screens.length > 1 && (
              <span
                onClick={e => {
                  e.stopPropagation();
                  setIsDisplayPickerOpen(v => !v);
                }}
                className="ml-1 p-0.5 hover:bg-white/10 rounded cursor-pointer"
                title="Select physical screen"
              >
                <ChevronDown size={12} />
              </span>
            )}
          </button>

          {isDisplayPickerOpen && screens.length > 0 && (
            <div className="absolute top-full left-0 mt-1.5 w-64 bg-[#120d1c] border border-white/15 rounded-xl shadow-2xl p-2 z-50">
              <div className="text-[10px] font-bold uppercase tracking-wider text-white/40 px-2 py-1">
                Target Physical Display
              </div>
              {screens.map(scr => (
                <button
                  key={scr.index}
                  onClick={() => {
                    setTargetDisplayIndex(scr.index);
                    setIsDisplayPickerOpen(false);
                    handleToggleProgramWindow(scr.index);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
                    targetDisplayIndex === scr.index ? 'bg-[#FF8C00]/20 text-[#FF8C00]' : 'text-white/70 hover:bg-white/5'
                  }`}
                >
                  <div>
                    <div>{scr.label || `Display ${scr.index + 1}`}</div>
                    <div className="text-[9px] text-white/40">
                      {scr.width}×{scr.height} {scr.primary ? '· Primary' : '· Secondary'}
                    </div>
                  </div>
                  {targetDisplayIndex === scr.index && <Check size={12} />}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1" />
        <span className="inline-flex items-center gap-2 h-[26px] px-3 rounded-full text-[11.5px] font-bold text-white border" style={{ background: 'rgba(255,140,0,0.14)', borderColor: 'rgba(255,140,0,0.5)', boxShadow: '0 0 22px rgba(255,140,0,0.3)' }}>
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: ORANGE }} /> ON AIR
        </span>
        <div className="flex flex-col items-end leading-none">
          <span className="font-mono text-[19px] font-semibold tabular-nums">{elapsedClock}</span>
          <span className="text-[9px] text-white/40 uppercase tracking-widest">Elapsed</span>
        </div>
        <button onClick={takeSelected} className="h-11 px-6 rounded-xl text-white font-extrabold tracking-wide text-[14.5px]" style={{ background: 'linear-gradient(135deg,#D40055,#FF8C00)', boxShadow: '0 0 22px rgba(255,140,0,0.3)' }}>
          TAKE ▸
        </button>
      </div>
      </div>

      {/* ── LOOPDECK & WATCH FOLDER CONTROL STRIP ── */}
      <div
        className="shrink-0 h-10 px-4 border-b flex items-center justify-between text-xs transition-colors"
        style={{
          borderColor: isLoopDeckActive ? 'rgba(255,140,0,0.35)' : line,
          background: isLoopDeckActive ? 'linear-gradient(90deg, rgba(212,0,85,0.12), rgba(255,140,0,0.08), rgba(0,218,243,0.06))' : 'rgba(10,7,17,0.4)',
        }}
      >
        <div className="flex items-center gap-3">
          {/* Toggle LoopDeck */}
          <button
            onClick={() => setIsLoopDeckActive(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider transition-all border ${
              isLoopDeckActive
                ? 'bg-gradient-to-r from-[#D40055] to-[#FF8C00] text-white border-[#FF8C00]/80 shadow-[0_0_15px_rgba(255,140,0,0.3)]'
                : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border-white/10'
            }`}
            title="Toggle LoopDeck Mode (Auto-advances clips/slides after N loops)"
          >
            <Repeat size={13} className={isLoopDeckActive ? 'animate-spin' : ''} style={{ animationDuration: '6s' }} />
            <span>LoopDeck {isLoopDeckActive ? 'ON' : 'OFF'}</span>
          </button>

          {/* Target Loops Count */}
          <div className="flex items-center gap-1.5 bg-black/40 px-2 py-0.5 rounded-lg border border-white/10 text-white/80">
            <span className="text-[10px] uppercase font-bold text-white/40">Loops:</span>
            <button
              onClick={() => setLoopDeckCount(c => Math.max(1, c - 1))}
              disabled={loopDeckCount <= 1}
              className="w-5 h-5 rounded hover:bg-white/10 disabled:opacity-30 font-bold flex items-center justify-center text-white"
            >
              -
            </button>
            <span className="font-mono font-bold text-cyan-300 px-1">{loopDeckCount}x</span>
            <button
              onClick={() => setLoopDeckCount(c => Math.min(50, c + 1))}
              className="w-5 h-5 rounded hover:bg-white/10 font-bold flex items-center justify-center text-white"
            >
              +
            </button>
          </div>

          {/* Mode: Sequential vs Random */}
          <div className="flex items-center rounded-lg bg-black/40 p-0.5 border border-white/10">
            <button
              onClick={() => setLoopDeckMode('sequential')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                loopDeckMode === 'sequential'
                  ? 'bg-white/15 text-white border border-white/20'
                  : 'text-white/40 hover:text-white'
              }`}
              title="Sequential Mode: advances slides in order"
            >
              Sequential
            </button>
            <button
              onClick={() => setLoopDeckMode('random')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                loopDeckMode === 'random'
                  ? 'bg-pink-600/30 text-pink-200 border border-pink-500/40 shadow-sm'
                  : 'text-white/40 hover:text-white'
              }`}
              title="Random Selection Mode: every clip is randomly selected after finishing loops"
            >
              <Shuffle size={11} />
              Random
            </button>
          </div>

          {/* Watch Folder Connection */}
          <div className="flex items-center gap-1.5">
            {watchFolderName ? (
              <div className="flex items-center gap-2 bg-purple-950/40 border border-purple-500/40 px-2.5 py-1 rounded-lg text-purple-200 text-xs">
                <Film size={12} className="text-purple-300" />
                <span className="font-semibold truncate max-w-[150px]">📁 {watchFolderName}</span>
                <span className="text-[9px] bg-purple-500/20 px-1.5 py-0.2 rounded text-purple-300 font-mono">WATCHING</span>
                <button
                  onClick={handleDisconnectWatchFolder}
                  className="hover:text-red-400 ml-0.5"
                  title="Disconnect watch folder"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button
                onClick={handleConnectWatchFolder}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white text-xs font-medium transition-colors"
                title="Connect Presentation to a Watch Folder on your computer"
              >
                <FolderOpen size={12} className="text-amber-400" />
                <span>Connect Watch Folder</span>
              </button>
            )}
          </div>
        </div>

        {/* Live Loop Status HUD */}
        {isLoopDeckActive && (
          <div className="flex items-center gap-3">
            {liveSlideObj && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Current Clip:</span>
                <span className="text-xs font-semibold text-white/90 truncate max-w-[140px] font-mono">
                  {liveSlideObj.label || 'Slide'}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-[11px] font-mono font-bold">
                  Loop {currentSlideLoops} of {loopDeckCount}
                </span>
              </div>
            )}
            <button
              onClick={handleLoopDeckAdvance}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all"
              title="Immediately advance to next slide / random clip"
            >
              <SkipForward size={12} />
              <span>Next</span>
            </button>
          </div>
        )}
      </div>

      {/* ── TOP SECTION (Slide Grid + Left Library + Right Monitors/Inspector) ── */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* LIBRARY + PLAYLISTS */}
        <aside className="w-56 border-r overflow-y-auto min-w-0 flex-none" style={{ borderColor: line, background: 'rgba(0,0,0,0.18)' }}>
          <div className="flex items-center justify-between px-3.5 pt-3.5 pb-2">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-white/40">Library</span>
            <button
              onClick={() => setIsNewShowModalOpen(true)}
              className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors"
              title="Create New Presentation or Playlist (+)"
            >
              <Plus size={13} />
            </button>
          </div>
          <div className="px-2">
            {library.map(sh => (
              <button key={sh.id} onClick={() => setActiveShowId(sh.id)}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[12.5px] text-left transition-colors"
                style={{ background: sh.id === activeShowId ? glass : 'transparent', color: sh.id === activeShowId ? '#fff' : 'rgba(255,255,255,0.7)', fontWeight: sh.id === activeShowId ? 600 : 400 }}>
                <span className="w-4 text-center text-white/40">{sh.kind === 'SONG' ? '♪' : sh.kind === 'SCRIPTURE' ? '✦' : sh.kind === 'MEDIA' ? '◈' : '▤'}</span>
                <span className="truncate">{sh.title}</span>
              </button>
            ))}
          </div>
          <div className="h-px mx-3 my-2.5" style={{ background: line }} />
          <div className="flex items-center justify-between px-3.5 pb-1.5">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-white/40">Playlist · Sunday</span>
            <button
              onClick={() => setIsNewShowModalOpen(true)}
              className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors"
              title="Add to Playlist (+)"
            >
              <Plus size={12} />
            </button>
          </div>
          <div className="px-2 pb-3 ml-3 border-l" style={{ borderColor: line }}>
            {playlist.map(pi => (
              <button key={pi.id} onClick={() => setActiveShowId(pi.show.id)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12px] text-left transition-colors"
                style={{ background: pi.live ? 'linear-gradient(90deg, rgba(255,140,0,0.16), transparent)' : pi.show.id === activeShowId ? glass : 'transparent', color: pi.live ? '#fff' : 'rgba(255,255,255,0.6)', boxShadow: pi.live ? `inset 2px 0 0 ${ORANGE}` : undefined }}>
                <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: pi.live ? ORANGE : 'rgba(255,255,255,0.25)', boxShadow: pi.live ? '0 0 8px rgba(255,140,0,0.6)' : undefined }} />
                <span className="truncate flex-1">{pi.title}</span>
                <span className="font-mono text-[9px] text-white/35">{fmt(pi.plannedSec)}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* SLIDE GRID (the hero) */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ background: 'radial-gradient(120% 80% at 50% -10%, rgba(107,0,153,0.10), transparent 55%)' }}>
          <div className="flex items-center gap-3 px-4.5 py-3 border-b flex-wrap" style={{ borderColor: line, paddingLeft: 18, paddingRight: 18 }}>
            <div className="leading-tight mr-1">
              <div className="font-semibold text-[18px]" style={{ fontFamily: 'Palatino Linotype, Palatino, Georgia, serif' }}>{activeShow.title}</div>
              <div className="text-[11.5px] text-white/45">{activeShow.author ? `${activeShow.author} · ` : ''}{slides.length} slides</div>
            </div>
            {activeShow.arrangement && (
              <span className="font-mono text-[10px] px-2 py-0.5 rounded" style={{ color: LILAC, background: 'rgba(208,188,255,0.1)', border: '1px solid rgba(208,188,255,0.28)' }}>
                {activeShow.arrangement.join(' · ')}
              </span>
            )}
            <div className="flex-1" />

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              {/* + Add Slide button */}
              <button
                onClick={() => handleAddSlide(selected)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white font-bold text-[11px] transition-all hover:brightness-110 shadow-lg"
                style={{ background: BRAND, boxShadow: '0 4px 14px rgba(212,0,85,0.3)' }}
                title="Add a new slide to this presentation"
              >
                <Plus size={13} />
                <span>Add Slide</span>
              </button>

              {/* Router Receiver button */}
              <button
                onClick={() => setRouterReceiverOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-all hover:bg-white/10"
                style={{
                  borderColor: 'rgba(124,156,232,0.4)',
                  background: 'rgba(124,156,232,0.12)',
                  color: '#7c9ce8',
                }}
                title="Open Universal Router Receiver for NDI and Video Feeds"
              >
                <Radio size={13} className="text-[#7c9ce8]" />
                <span>Router Receiver</span>
              </button>

              {/* Slide Inspector Toggle */}
              <button
                onClick={() => setInspectorOpen(prev => !prev)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-all"
                style={{
                  borderColor: inspectorOpen ? CYAN : line,
                  background: inspectorOpen ? 'rgba(0,218,243,0.15)' : glass,
                  color: inspectorOpen ? '#fff' : 'rgba(255,255,255,0.7)',
                }}
                title="Toggle Slide &amp; Layer Inspector"
              >
                <Sliders size={13} className={inspectorOpen ? 'text-[#00DAF3]' : ''} />
                <span>Inspector</span>
              </button>

              {/* Output placement toggle */}
              <span className="inline-flex gap-0.5 p-0.5 rounded-lg border" style={{ borderColor: line, background: glass }} title="Where the audience output shows">
                {(['right', 'top'] as const).map(p => (
                  <button key={p} onClick={() => setPlacement(p)} className="px-2.5 py-1 rounded-md text-[11px] font-semibold capitalize"
                    style={{ background: placement === p ? 'rgba(255,255,255,0.10)' : 'transparent', color: placement === p ? '#fff' : 'rgba(255,255,255,0.5)' }}>
                    {p === 'right' ? '▤ Right' : '▙ Top'}
                  </button>
                ))}
              </span>

              {/* Edit in Tela */}
              <button onClick={() => openEditor(selected)} className="w-8 h-8 grid place-items-center rounded-lg border text-white/60 hover:text-white" style={{ borderColor: line, background: glass }} title="Edit slide in Tela">
                <Pencil size={14} />
              </button>
            </div>
          </div>

          {multiviewCollapsed && placement === 'top' && (
            <div className="grid gap-3.5 px-4.5 pt-4 pb-1 border-b" style={{ gridTemplateColumns: '1.5fr 1fr', borderColor: line, paddingLeft: 18, paddingRight: 18 }}>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: ORANGE }}>● Audience Output</div>
                <div className="rounded-xl overflow-hidden border-2" style={{ borderColor: 'rgba(255,140,0,0.75)', boxShadow: '0 0 22px rgba(255,140,0,0.28)' }}>
                  <OutputMonitor stack={effectiveLiveStack} audio={!isBlackout} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: CYAN }}>Preview · Next</span>
                    {previewClearingMask.size > 0 && (
                      <span className="text-[8px] font-mono px-1 rounded bg-[#00DAF3]/20 text-[#00DAF3]">
                        {previewClearingMask.size} CLR
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={clearPreviewAll}
                      className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#00DAF3]/15 text-[#00DAF3] hover:bg-[#00DAF3]/25 transition-colors"
                      title="Clear all preview layers"
                    >
                      Clr All
                    </button>
                    <button
                      onClick={clearPreviewSlide}
                      className="px-1 py-0.5 rounded text-[9px] text-white/50 hover:text-white transition-colors"
                      title="Clear preview slide"
                    >
                      Slide
                    </button>
                    <button
                      onClick={clearPreviewBackground}
                      className="px-1 py-0.5 rounded text-[9px] text-white/50 hover:text-white transition-colors"
                      title="Clear preview background"
                    >
                      BG
                    </button>
                    <button
                      onClick={clearPreviewScripture}
                      className="px-1 py-0.5 rounded text-[9px] text-[#E3C57E]/70 hover:text-[#E3C57E] transition-colors"
                      title="Clear preview scripture"
                    >
                      Scr
                    </button>
                    {previewClearingMask.size > 0 && (
                      <button
                        onClick={() => handleResetBus('PREVIEW')}
                        className="px-1 py-0.5 rounded text-[9px] text-white/40 hover:text-white transition-colors"
                        title="Reset preview clearing"
                      >
                        <RotateCcw size={9} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'rgba(0,218,243,0.4)' }}>
                  <OutputMonitor stack={previewStack} />
                </div>
              </div>
            </div>
          )}

          <div
            className={`flex-1 overflow-y-auto p-4.5 select-none relative transition-all ${
              isDraggingOverDeck ? 'ring-2 ring-[#00DAF3] bg-[#00DAF3]/5' : ''
            }`}
            style={{ padding: 18 }}
            {...canvasMenu.bind()}
            onDragEnter={e => {
              e.preventDefault();
              setIsDraggingOverDeck(true);
            }}
            onDragOver={e => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
              if (!isDraggingOverDeck) setIsDraggingOverDeck(true);
            }}
            onDragLeave={e => {
              // Only clear if leaving the canvas container itself
              if (e.currentTarget === e.target) {
                setIsDraggingOverDeck(false);
              }
            }}
            onDrop={handleDropOnPresentationDeck}
          >
            {isDraggingOverDeck && (
              <div className="absolute inset-4 rounded-2xl border-2 border-dashed border-[#00DAF3] bg-black/70 backdrop-blur-md z-30 flex flex-col items-center justify-center pointer-events-none gap-2">
                <Video size={36} className="text-[#00DAF3] animate-bounce" />
                <div className="text-white font-bold text-base">Drop Desktop Media to Add Slides</div>
                <div className="text-white/50 text-xs">Supports Videos (.mp4, .mov), Photos (.png, .jpg), and Audio (.mp3, .wav)</div>
              </div>
            )}

            {/* Active Video Transport Bar (Scrubber, Volume, Loop, Restart) */}
            {activeVideoContent && (
              <div className="mb-3 rounded-xl overflow-hidden border border-white/15 shadow-xl flex-none">
                <AmboVideoTransportBar
                  videoContent={activeVideoContent}
                  label={activeVideoLabel}
                  isLive={isVideoLiveOnProgram}
                />
              </div>
            )}

            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
              {slides.map((s, i) => {
                const isLive = s.id === liveSlideId;
                const isSel = i === selected;
                const prevGroup = i > 0 ? slides[i - 1].group : undefined;
                const showHeader = s.group && s.group !== prevGroup;
                const isDragOver = dragOverIndex === i;
                const hasAudio = s.layers.some(l => l.content.kind === 'AUDIO') || s.group === 'Audio Assets' || s.onEnter?.some(a => a.kind === 'AUDIO_PLAY');

                return (
                  <React.Fragment key={s.id}>
                    {showHeader && (
                      <div className="flex items-center gap-2 mt-1.5" style={{ gridColumn: '1 / -1' }}>
                        <span className="inline-block w-4 h-[3px] rounded" style={{ background: s.groupColor ?? '#888' }} />
                        <span className="text-[10px] font-extrabold uppercase tracking-[0.12em]" style={{ color: s.groupColor ?? '#aaa' }}>{s.group}</span>
                      </div>
                    )}
                    <button
                      onClick={(e) => {
                        if (e.altKey) {
                          e.preventDefault();
                          openEditor(i);
                        } else {
                          selectSlide(i);
                        }
                      }}
                      onDoubleClick={() => take(s)}
                      {...slideMenu.bind(i)}
                      onDragOver={e => {
                        e.preventDefault();
                        setDragOverIndex(i);
                      }}
                      onDragLeave={() => {
                        if (dragOverIndex === i) setDragOverIndex(null);
                      }}
                      onDrop={e => {
                        e.preventDefault();
                        setDragOverIndex(null);
                        handleDropOnSlide(e, i);
                      }}
                      className="relative rounded-[10px] overflow-hidden border-2 text-left transition-transform hover:-translate-y-0.5 group"
                      style={{
                        borderColor: isDragOver ? CYAN : isLive ? ORANGE : isSel ? CYAN : line,
                        borderStyle: isDragOver ? 'dashed' : 'solid',
                        boxShadow: isDragOver
                          ? '0 0 24px rgba(0,218,243,0.5)'
                          : isLive
                          ? '0 0 18px rgba(255,140,0,0.3)'
                          : isSel
                          ? '0 0 16px rgba(0,218,243,0.25)'
                          : 'none',
                      }}
                    >
                      {!isLive && !isSel && s.groupColor && <span className="absolute top-0 left-0 right-0 h-[3px] z-[3]" style={{ background: s.groupColor }} />}
                      {isLive && (
                        <span className="absolute top-1 right-1.5 z-[3] text-[8px] font-extrabold px-1.5 rounded flex items-center gap-1" style={{ background: ORANGE, color: '#2a1400' }}>
                          LIVE {isLoopDeckActive && <span className="font-mono">({currentSlideLoops}/{loopDeckCount})</span>}
                        </span>
                      )}
                      {!isLive && isSel && <span className="absolute top-1 right-1.5 z-[3] text-[8px] font-extrabold px-1.5 rounded" style={{ background: CYAN, color: '#04222a' }}>PREVIEW</span>}
                      {hasAudio && (
                        <span className="absolute bottom-1 right-1.5 z-[3] p-1 rounded bg-[#D0BCFF]/20 text-[#D0BCFF]" title="Audio Asset Slide">
                          <Music size={11} />
                        </span>
                      )}
                      <div className="aspect-square grid place-items-center px-2 text-center relative" style={{ background: 'linear-gradient(135deg,#1a0b2e,#06121f)' }}>
                        <span className="text-[12px] font-semibold text-white leading-tight line-clamp-3" style={{ fontFamily: 'Palatino Linotype, Palatino, Georgia, serif', textShadow: '0 1px 8px rgba(0,0,0,0.6)' }}>
                          {slideText(s)}
                        </span>
                        {/* Hover Quick Action Buttons */}
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 z-[5] p-1 pointer-events-none group-hover:pointer-events-auto">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              cueSlideToPreview(s);
                              setSelected(i);
                            }}
                            className="px-2 py-1 rounded bg-[#00DAF3] text-black font-extrabold text-[10px] shadow hover:brightness-110 active:scale-95 transition-all"
                            title="Cue slide to Preview"
                          >
                            CUE
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              take(s);
                            }}
                            className="px-2 py-1 rounded bg-[#FF8C00] text-black font-extrabold text-[10px] shadow hover:brightness-110 active:scale-95 transition-all"
                            title="Take slide live to Program"
                          >
                            TAKE
                          </button>
                        </div>
                      </div>
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* layer bar — the media-server identity, ProPresenter-subtle */}
          <div className="flex items-center gap-2 px-4.5 py-2.5 border-t overflow-x-auto flex-none" style={{ borderColor: line, background: 'rgba(0,0,0,0.22)', paddingLeft: 18, paddingRight: 18 }}>
            <span className="text-[9px] uppercase tracking-[0.12em] text-white/40 flex-none">Layers</span>
            {LAYER_ORDER.map(slot => {
              const on = liveSlots.has(slot);
              return (
                <span key={slot} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] flex-none border" style={{ borderColor: on ? line2 : line, background: on ? glass : 'transparent', color: on ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)' }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: slot === 'scripture' ? GOLD : slot === 'background' ? CYAN : slot === 'prop' ? '#D40055' : on ? LILAC : 'rgba(255,255,255,0.2)' }} />
                  {LAYER_LABEL[slot]}
                </span>
              );
            })}
          </div>
        </div>

        {/* RIGHT: only the audience output preview remains here, and only when
            the multiview is collapsed with placement 'right'. The media bin
            moved into the library (Visualizers / Live Feeds tabs) and the
            output toggles into the multiview. */}
        {multiviewCollapsed && placement === 'right' && (
          <>
            <div
              onMouseDown={startRightResize}
              className="w-1.5 hover:w-2 bg-black/60 hover:bg-[#00DAF3]/40 cursor-ew-resize transition-all border-l border-r flex items-center justify-center group flex-none z-10"
              style={{ borderColor: line }}
              title="Drag to resize right panel"
            >
              <div className="w-1 h-12 rounded-full bg-white/20 group-hover:bg-[#00DAF3] transition-colors" />
            </div>
            <aside
              className="border-l overflow-y-auto flex flex-col min-w-0 flex-none"
              style={{ width: `${rightWidth}px`, borderColor: line, background: 'rgba(0,0,0,0.16)' }}
            >
              {renderOutputPreview()}
            </aside>
          </>
        )}

        {/* 4th Column: Slide & Layer Inspector */}
        {inspectorOpen && (
          <AmboInspector
            slide={slides[selected] ?? null}
            onUpdateSlide={handleUpdateSlide}
            onClose={() => setInspectorOpen(false)}
            nativeSources={nativeSources}
            onScanNdi={handleScanNdi}
            isScanningNdi={isScanningNdi}
            onTakeSlide={take}
          />
        )}
      </div>

      {/* ── AUDIO PLAYLIST BUS — independent of the layer stack ── */}
      <AmboAudioBus
        deckOpen={playerMode === 'expanded'}
        onToggleDeck={() => setPlayerMode(m => (m === 'expanded' ? 'compact' : 'expanded'))}
        controlsSlot={<><AmboMixer /><AmboLyricsControl live={liveLyrics} onSet={setLyricsLayer} /></>} />

      {/* ── BROADCAST PER-TRACK DJ AUDIO PLAYER & HORIZONTAL WAVEFORM ── */}
      {activeDjTrack && (
        <div className="flex-none z-20">
          <AmboDJTrackPlayer
            key={`${activeDjTrack.id || activeDjTrack.title}:${(activeDjTrack as any).__seq ?? 0}`}
            track={activeDjTrack}
            attachedToBus
            onClose={() => {
              setPlayerMode('compact');
              setIsDjLiveOnProgram(false);
              setIsDjCuedInPreview(false);
            }}
            isLiveOnProgram={isDjLiveOnProgram}
            onTakeToProgram={() => {
              setIsDjLiveOnProgram(true);
              setIsDjCuedInPreview(false);
            }}
            isCuedInPreview={isDjCuedInPreview}
            onCueToPreview={() => {
              setIsDjCuedInPreview(true);
            }}
            autoPlay={true}
            visualizerEnabled={djVisualizerEnabled}
            onToggleVisualizer={() => setDjVisualizerEnabled(v => !v)}
            visualizerMode={djVisualizerMode}
            onSetVisualizerMode={setDjVisualizerMode}
          />
        </div>
      )}

      {/* ── DRAGGABLE HORIZONTAL SPLITTER 1 (Resizes Horizontal Multiview) ── */}
      {!multiviewCollapsed && (
        <div
          onMouseDown={startMultiviewResize}
          className="h-1.5 hover:h-2 bg-black/60 hover:bg-[#00DAF3]/40 cursor-ns-resize transition-all border-t border-b flex items-center justify-center group flex-none z-10"
          style={{ borderColor: line }}
          title="Drag to resize Horizontal Multiview"
        >
          <div className="w-12 h-1 rounded-full bg-white/20 group-hover:bg-[#00DAF3] transition-colors" />
        </div>
      )}

      {/* ── INDEPENDENT HORIZONTAL MULTIVIEW PANEL (Resizable on top of media library) ── */}
      <AmboHorizontalMultiview
        liveStack={isBlackout ? {} : live}
        previewStack={previewStack}
        liveSlide={liveSlideObj}
        previewSlide={previewSlide}
        nextSlide={nextSlide}
        elapsedSec={elapsed}
        outputs={outputs}
        onToggleOutput={toggleOutput}
        onProbeDisplays={probeDisplays}
        displaysCount={screens.length}
        isCollapsed={multiviewCollapsed}
        onToggleCollapse={toggleMultiviewCollapsed}
        onTakePreview={takeSelected}
        height={multiviewHeight}
        isBlackout={isBlackout}
        isMasterProgramOn={isMasterProgramOn}
        activeTransition={activeTransition}
        partySession={partySession}
        partyDevices={partyDevices}
        onOpenPartyModal={() => setIsPartyModalOpen(true)}
        onToggleMasterSync={() => setMasterSync(!partySession?.masterSyncEngaged)}
        onAssignDeviceDuty={(devId, dutyType) => {
          const dev = partyDevices.find(d => d.deviceId === devId);
          if (dev) {
            let newDuty: any = { dutyType, title: 'Ambo Output' };
            if (dutyType === 'AMBO_PROGRAM') newDuty = { dutyType, title: 'Ambo Program Out', subtitle: 'Live Audience Feed' };
            else if (dutyType === 'AMBO_STAGE') newDuty = { dutyType, title: 'Stage Confidence', subtitle: 'Speaker Notes & Clock' };
            else if (dutyType === 'CHORA_PLAYLIST') newDuty = { dutyType, title: 'Chora Lounge Mix', subtitle: 'Ambient Music' };
            else if (dutyType === 'REELLO_VIDEO') newDuty = { dutyType, title: 'Reello Highlight Reel', subtitle: 'Video Loop' };
            else if (dutyType === 'AMBIENT_SIGNAGE') newDuty = { dutyType, title: 'Welcome Screen', subtitle: 'Ambient Visualizer' };
            assignDeviceDuty(devId, newDuty);
          }
        }}
        onToggleDeviceSlave={(devId, isSlaved) => setDeviceSlaved(devId, isSlaved)}
        onToggleDeviceMute={(devId, isMuted) => setDeviceAudioMute(devId, isMuted)}
        onPingDevice={(devId) => pingDevice(devId)}
      />

      {/* ── DRAGGABLE HORIZONTAL SPLITTER 2 (Resizes Tabbed Media Library) ── */}
      {!libraryCollapsed && (
        <div
          onMouseDown={startBottomResize}
          className="h-1.5 hover:h-2 bg-black/60 hover:bg-[#00DAF3]/40 cursor-ns-resize transition-all border-t border-b flex items-center justify-center group flex-none z-10"
          style={{ borderColor: line }}
          title="Drag to resize Tabbed Media Library"
        >
          <div className="w-12 h-1 rounded-full bg-white/20 group-hover:bg-[#00DAF3] transition-colors" />
        </div>
      )}

      {/* ── INDEPENDENT TABBED MEDIA LIBRARY PANEL (Docked across the bottom) ── */}
      <div
        className="flex flex-col flex-none min-h-0 overflow-hidden"
        style={{ height: libraryCollapsed ? 'auto' : `${bottomHeight}px` }}
      >
        <AmboTabbedLibrary
          activeTab={activeLibraryTab}
          onSelectTab={handleSelectLibraryTab}
          onPreviewSource={handlePreviewSource}
          onProgramSource={handleProgramSource}
          onFireScripture={fireScripture}
          onCueScripture={cueScriptureToPreview}
          onInsertScriptureSlide={handleInsertScriptureSlide}
          onPlayAudioTrack={track => {
            setActiveDjTrack(track);
            setIsDjLiveOnProgram(false);
            setIsDjCuedInPreview(true);
          }}
          onCueAudioTrack={track => {
            setActiveDjTrack(track);
            setIsDjLiveOnProgram(false);
            setIsDjCuedInPreview(true);
          }}
          onTakeAudioTrack={track => {
            setActiveDjTrack(track);
            setIsDjLiveOnProgram(true);
            setIsDjCuedInPreview(false);
          }}
          onInsertAudioSlide={handleCreateAudioSlide}
          onInsertMediaSlide={handleInsertMediaSlide}
          currentPlayingAudioId={activeDjTrack?.id}
          nativeSources={nativeSources}
          onScanNdi={handleScanNdi}
          isScanningNdi={isScanningNdi}
          currentLiveInputId={live.background?.content?.kind === 'LIVE' ? live.background.content.inputId : (live.background?.content?.kind === 'GENERATOR' ? live.background.content.mode : live.background?.content?.kind === 'SHADER' ? live.background.content.src : null)}
          currentPreviewInputId={cuedPreviewSourceId}
          shows={library}
          activeShowId={activeShowId}
          onSelectShow={setActiveShowId}
          onInsertTemplateSlide={handleInsertTemplateSlide}
          isScriptureLive={!!live.scripture}
          activeTransition={activeTransition}
          transitionDurationSec={transitionDurationSec}
          onSelectTransition={handleSelectTransition}
          onChangeTransitionDuration={handleChangeTransitionDuration}
          isCollapsed={libraryCollapsed}
          onToggleCollapse={toggleLibraryCollapsed}
          className="flex-1 min-h-0"
        />
      </div>

      {/* Universal Router Receiver Modal */}
      <AmboRouterReceiver
        isOpen={routerReceiverOpen}
        onClose={() => setRouterReceiverOpen(false)}
        nativeSources={nativeSources}
        onScanNdi={handleScanNdi}
        isScanningNdi={isScanningNdi}
        selectedSlide={slides[selected] ?? null}
        slides={slides}
        onRouteToSlide={handleRouteToSlide}
        onRouteToLive={(id, label) => setLiveBackgroundInput(id, label)}
        onRouteToPreview={(id, label) => handlePreviewSource({ id, name: label, kind: 'LIVE', inputId: id })}
        currentLiveInputId={live.background?.content?.kind === 'LIVE' ? live.background.content.inputId : null}
        currentPreviewInputId={cuedPreviewSourceId}
      />

      {/* Platform-standard Context Menus */}
      {slideMenu.node}
      {canvasMenu.node}

      {stageOpen && (
        <AmboStageDisplay
          currentSlide={liveSlideObj}
          nextSlide={nextSlide}
          elapsedSec={elapsed}
          live={!!liveSlideId}
          onClose={() => setStageOpen(false)}
        />
      )}

      {editorSlide && (
        <AmboSlideEditor
          slide={editorSlide}
          boundRef={boundRef}
          onSave={saveSlideText}
          onClose={() => setEditorIdx(null)}
        />
      )}

      {scriptureOpen && (
        <AmboScriptureDock
          scriptureLive={!!live.scripture}
          onFire={fireScripture}
          onClear={clearScripture}
          onClose={() => setScriptureOpen(false)}
        />
      )}

      {/* Creation Modal for Presentations & Playlists */}
      <AmboNewShowModal
        isOpen={isNewShowModalOpen}
        onClose={() => setIsNewShowModalOpen(false)}
        onCreateShow={handleCreateShow}
        onCreatePlaylistItem={handleCreatePlaylistItem}
      />

      {/* Universal Presentation & Project Import Modal */}
      <AmboImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportShow={handleImportShow}
        onImportProject={handleImportProject}
      />

      {/* Workspace & Project Switcher Modal */}
      <AmboProjectSwitcherModal
        isOpen={isProjectSwitcherOpen}
        onClose={() => setIsProjectSwitcherOpen(false)}
        activeProject={currentProject}
        onSelectProject={handleSelectProject}
        onOpenImportModal={() => {
          setIsProjectSwitcherOpen(false);
          setIsImportModalOpen(true);
        }}
      />

      {/* Party / Event Mode Central Command Modal */}
      <AmboPartyEventModal
        isOpen={isPartyModalOpen}
        onClose={() => setIsPartyModalOpen(false)}
        session={partySession}
        devices={partyDevices}
        shows={library}
        playlist={playlist}
        onApplyPlaylistDuties={applyPlaylistItemDuties}
      />

      {/* Save Project As Modal */}
      {isSaveAsModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-[#120d1c] border border-white/20 rounded-2xl w-full max-w-md p-6 shadow-2xl text-white space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Copy size={18} className="text-amber-400" />
                <h3 className="text-base font-bold">Save Project As</h3>
              </div>
              <button
                onClick={() => setIsSaveAsModalOpen(false)}
                className="text-white/40 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-white/60">
              Save a complete copy of the current project, including all presentations, slides, outputs, settings, and media assets.
            </p>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-white/70 uppercase tracking-wider">
                New Project Name
              </label>
              <input
                type="text"
                value={saveAsName}
                onChange={e => setSaveAsName(e.target.value)}
                placeholder="Enter project name..."
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter' && saveAsName.trim()) {
                    handleSaveProjectAs(saveAsName);
                  }
                }}
                className="w-full bg-black/60 border border-white/20 focus:border-[#00DAF3] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/30 outline-none transition-colors"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/10">
              <button
                onClick={() => setIsSaveAsModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSaveProjectAs(saveAsName)}
                disabled={!saveAsName.trim()}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-[#00DAF3] text-black hover:bg-[#00DAF3]/90 disabled:opacity-40 transition-all shadow-md"
              >
                Save Copy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Project Modal */}
      {isNewProjectModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-[#120d1c] border border-white/20 rounded-2xl w-full max-w-md p-6 shadow-2xl text-white space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <FolderPlus size={18} className="text-[#00DAF3]" />
                <h3 className="text-base font-bold">Create New Project</h3>
              </div>
              <button
                onClick={() => setIsNewProjectModalOpen(false)}
                className="text-white/40 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-white/70 uppercase tracking-wider">
                Project Name
              </label>
              <input
                type="text"
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                placeholder="e.g. Sunday Worship Service"
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter' && newProjectName.trim()) {
                    handleCreateNewProject(newProjectName, newProjectIsBlank);
                  }
                }}
                className="w-full bg-black/60 border border-white/20 focus:border-[#00DAF3] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/30 outline-none transition-colors"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-white/70 uppercase tracking-wider">
                Starter Content
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setNewProjectIsBlank(false)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    !newProjectIsBlank
                      ? 'bg-[#00DAF3]/15 border-[#00DAF3] text-white ring-1 ring-[#00DAF3]/30'
                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                  }`}
                >
                  <div className="text-xs font-bold text-white">Starter Template</div>
                  <div className="text-[10px] text-white/50 mt-0.5">Worship, Sermon &amp; Announcements shows</div>
                </button>
                <button
                  type="button"
                  onClick={() => setNewProjectIsBlank(true)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    newProjectIsBlank
                      ? 'bg-[#00DAF3]/15 border-[#00DAF3] text-white ring-1 ring-[#00DAF3]/30'
                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                  }`}
                >
                  <div className="text-xs font-bold text-white">Blank Project</div>
                  <div className="text-[10px] text-white/50 mt-0.5">Clean canvas with single empty presentation</div>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/10">
              <button
                onClick={() => setIsNewProjectModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleCreateNewProject(newProjectName, newProjectIsBlank)}
                disabled={!newProjectName.trim()}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-[#00DAF3] text-black hover:bg-[#00DAF3]/90 disabled:opacity-40 transition-all shadow-md"
              >
                Create Project
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LED Wall Mapping, Samsung SSSP MDC & Digital Signage Studio Modal */}
      {isLedWallModalOpen && (
        <AmboLedWallCanvas
          isOpen={isLedWallModalOpen}
          onClose={() => setIsLedWallModalOpen(false)}
          activeBusId={activeBusClearingTarget}
        />
      )}
    </div>
  );
};

export default AmboProPresenter;
