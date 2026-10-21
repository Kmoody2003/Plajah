import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  STORY_INTEL_VTUBER_CHARACTERS,
  CharacterVTuberRigSpec,
  CharacterVoiceDspPreset,
  CharacterAccessTier,
  ViewerSubscriptionSimulationMode,
  CreatorFilmInteractivePolicy,
  loadCreatorCharacterPolicy,
  saveCreatorCharacterPolicy,
  evaluateCharacterAccess,
  RealtimeCharacterVoiceChanger,
  renderStoryIntelVTuberFrame,
} from '../../services/halloween/storyIntelCharacterRigAndVoiceEngine';
import { AsyncFaceTracker } from '../../services/vtuber/faceTrackerAsync';
import { FaceEyes } from '../../services/vtuber/eyeGeometry';

const CHARACTER_COUNCIL_SHEET_MAP: Record<string, string> = {
  char_1: '/models/halloween/sheets/pumpkin_patch_sheet.jpg',
  char_3: '/models/halloween/sheets/miriam_sheet.jpg',
  char_4: '/models/halloween/sheets/stitch_and_robobones_sheet.jpg',
  char_5: '/models/halloween/sheets/stitch_and_robobones_sheet.jpg',
  char_2: '/models/halloween/sheets/miriam_sheet.jpg',
  char_6: '/models/halloween/sheets/tank_sheet.jpg',
  char_7: '/models/halloween/sheets/stitch_and_robobones_sheet.jpg',
  char_8: '/models/halloween/sheets/pumpkin_patch_sheet.jpg',
};

interface StoryIntelVTuberVoiceStudioProps {
  onSendVTuberMessageToChat?: (payload: {
    character: CharacterVTuberRigSpec;
    text: string;
    snapshotDataUrl?: string;
    voiceChanged: boolean;
  }) => void;
}

export const StoryIntelVTuberVoiceStudio: React.FC<StoryIntelVTuberVoiceStudioProps> = ({
  onSendVTuberMessageToChat,
}) => {
  const [policy, setPolicy] = useState<CreatorFilmInteractivePolicy>(() =>
    loadCreatorCharacterPolicy()
  );
  const [viewerSimMode, setViewerSimMode] =
    useState<ViewerSubscriptionSimulationMode>('ACTIVE_CREATOR_SUBSCRIBER');
  const [activeTab, setActiveTab] = useState<'VTUBER_STUDIO' | 'CREATOR_LICENSING'>(
    'VTUBER_STUDIO'
  );

  const [selectedCharId, setSelectedCharId] = useState<string>('char_1');
  const selectedCharacter = useMemo(
    () =>
      STORY_INTEL_VTUBER_CHARACTERS.find(c => c.id === selectedCharId) ||
      STORY_INTEL_VTUBER_CHARACTERS[0],
    [selectedCharId]
  );

  const [customPreset, setCustomPreset] = useState<CharacterVoiceDspPreset>(
    () => STORY_INTEL_VTUBER_CHARACTERS[0].voicePreset
  );

  useEffect(() => {
    setCustomPreset(selectedCharacter.voicePreset);
    if (voiceChangerRef.current) {
      voiceChangerRef.current.applyPresetParameters(
        selectedCharacter.voicePreset,
        selectedCharacter
      );
    }
  }, [selectedCharacter]);

  // Default to the 3D Blender Rig Stage as requested!
  const [renderMode, setRenderMode] = useState<
    'BLENDER_3D_RIG' | 'COUNCIL_SHEET' | 'VTUBER_STAGE' | 'AR_WEBCAM_SWAP'
  >('BLENDER_3D_RIG');
  const [dimLights, setDimLights] = useState<boolean>(false);
  const [webcamActive, setWebcamActive] = useState<boolean>(false);
  const [micActive, setMicActive] = useState<boolean>(false);
  const [monitorSpeakers, setMonitorSpeakers] = useState<boolean>(true);
  const [voiceSpeaking, setVoiceSpeaking] = useState<boolean>(false);
  const [chatLineInput, setChatLineInput] = useState<string>('');
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [glbReady, setGlbReady] = useState<boolean>(false);

  // Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const threeMountRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const faceTrackerRef = useRef<AsyncFaceTracker | null>(null);
  const voiceChangerRef = useRef<RealtimeCharacterVoiceChanger | null>(null);
  const portraitCacheRef = useRef<Record<string, HTMLImageElement>>({});
  const trackedEyesRef = useRef<FaceEyes | null>(null);
  const selectedCharRef = useRef<CharacterVTuberRigSpec>(selectedCharacter);
  selectedCharRef.current = selectedCharacter;
  const dimLightsRef = useRef<boolean>(dimLights);
  dimLightsRef.current = dimLights;

  // Preload character portraits
  useEffect(() => {
    STORY_INTEL_VTUBER_CHARACTERS.forEach(char => {
      if (!portraitCacheRef.current[char.id]) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = char.portraitUrl;
        portraitCacheRef.current[char.id] = img;
      }
    });
  }, []);

  // Initialize voice changer instance
  useEffect(() => {
    voiceChangerRef.current = new RealtimeCharacterVoiceChanger();
    return () => {
      voiceChangerRef.current?.stop();
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // Three.js 3D Blender Rigged Character Stage (`pumpkin_patch_cast.glb` & `pumpkin_patch_tank.glb`)
  const active3DGroupRef = useRef<THREE.Group | null>(null);
  const loadedNodesRef = useRef<Record<string, THREE.Object3D>>({});

  useEffect(() => {
    const mount = threeMountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || 640;
    const height = mount.clientHeight || 480;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07040d);
    scene.fog = new THREE.FogExp2(0x07040d, 0.08);

    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 60);
    camera.position.set(0, 1.48, 2.75);
    camera.lookAt(0, 1.32, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    mount.innerHTML = '';
    mount.appendChild(renderer.domElement);

    // Grindhouse studio lighting
    const ambient = new THREE.AmbientLight(0x281c3d, 1.45);
    scene.add(ambient);

    const keyLight = new THREE.SpotLight(0xffedd5, 4.2, 18, Math.PI / 4, 0.45, 1);
    keyLight.position.set(1.6, 2.9, 3.2);
    keyLight.target.position.set(0, 1.3, 0);
    scene.add(keyLight);
    scene.add(keyLight.target);

    const rimLight = new THREE.PointLight(0xf97316, 3.6, 10);
    rimLight.position.set(-1.8, 2.1, -1.5);
    scene.add(rimLight);

    const fillLight = new THREE.PointLight(0x38bdf8, 1.8, 10);
    fillLight.position.set(1.8, 1.1, 1.5);
    scene.add(fillLight);

    // Pedestal floor ring
    const pedGeo = new THREE.CylinderGeometry(1.15, 1.3, 0.08, 32);
    const pedMat = new THREE.MeshStandardMaterial({
      color: 0x140d1f,
      roughness: 0.4,
      metalness: 0.6,
    });
    const pedestal = new THREE.Mesh(pedGeo, pedMat);
    pedestal.position.y = -0.04;
    scene.add(pedestal);

    const charStageGroup = new THREE.Group();
    scene.add(charStageGroup);
    active3DGroupRef.current = charStageGroup;

    // Load the Blender 5.0 Sheet-Accurate Volumetric 3D Character Cast Rigs (Draco=False)
    const loader = new GLTFLoader();
    Promise.all([
      loader.loadAsync('/models/halloween/pumpkin_patch_cast_rigs.glb'),
      loader.loadAsync('/models/halloween/survivor_combat_rigs.glb'),
      loader.loadAsync('/models/halloween/monsters_enemy_rigs.glb'),
    ])
      .then(([castGltf, survGltf, monGltf]) => {
        const nodes: Record<string, THREE.Object3D> = {};
        const mapping: Record<string, { scene: THREE.Group; nodeName: string }> = {
          Char_PumpkinPatch: { scene: castGltf.scene, nodeName: 'PumpkinPatch_Rig' },
          Char_Miriam: { scene: castGltf.scene, nodeName: 'Miriam_Rig' },
          Char_Stitch: { scene: castGltf.scene, nodeName: 'Stitch_Rig' },
          Char_RoboBones: { scene: castGltf.scene, nodeName: 'RoboBones_Rig' },
          Char_Katrina: { scene: survGltf.scene, nodeName: 'FemaleSurvivor_Rig' },
          Char_Ichabod: { scene: survGltf.scene, nodeName: 'MaleSurvivor_Rig' },
          Char_Marv: { scene: monGltf.scene, nodeName: 'Werewolf_Rig' },
          Turret_LilBoo: { scene: monGltf.scene, nodeName: 'Ghost_Rig' },
        };

        Object.entries(mapping).forEach(([key, spec]) => {
          const found = spec.scene.getObjectByName(spec.nodeName);
          if (found) {
            const clone = SkeletonUtils.clone(found);
            clone.position.set(0, 0, 0);
            clone.rotation.set(0, 0, 0);
            nodes[key] = clone;
          }
        });
        loadedNodesRef.current = nodes;
        setGlbReady(true);
      })
      .catch(() => {
        // ignore load errors
      });

    let animFrame = 0;
    const startMs = performance.now();

    const animate3D = () => {
      animFrame = requestAnimationFrame(animate3D);
      const nowMs = performance.now();
      const t = (nowMs - startMs) / 1000;

      const telemetry = voiceChangerRef.current?.getVoiceTelemetry() || {
        amplitude: 0,
        spectrum: [],
        isSpeaking: false,
      };
      const amp = telemetry.amplitude;
      const char = selectedCharRef.current;

      // Update rim light color to match active character's signature aura
      rimLight.color.set(char.accentColor);
      rimLight.intensity = 2.8 + amp * 5.5;
      keyLight.intensity = dimLightsRef.current ? 1.8 : 4.2;
      ambient.intensity = dimLightsRef.current ? 0.35 : 1.45;

      // Animate 3D Blender Skinned Character Rig (head pose tracking + speaking jaw/head nod + arm/weapon sway)
      if (charStageGroup.children.length > 0) {
        const model = charStageGroup.children[0];
        const eyes = trackedEyesRef.current;

        let targetYaw = Math.sin(t * 0.85) * 0.22;
        let targetRoll = Math.sin(t * 1.3) * 0.04;
        let targetPitch = Math.cos(t * 1.6) * 0.03 + amp * 0.14;

        if (eyes) {
          const midX = (eyes.left.cx + eyes.right.cx) * 0.5;
          const midY = (eyes.left.cy + eyes.right.cy) * 0.5;
          targetYaw = -(midX - 0.5) * 1.15;
          targetPitch = (midY - 0.45) * 0.75 + amp * 0.16;
          targetRoll = Math.max(-0.35, Math.min(0.35, eyes.roll || 0));
        }

        model.rotation.y += (targetYaw - model.rotation.y) * 0.14;
        model.rotation.z += (targetRoll - model.rotation.z) * 0.14;
        model.rotation.x += (targetPitch * 0.35 - model.rotation.x) * 0.14;

        // Breathing & speaking bounce
        model.position.y = Math.sin(t * 2.4) * 0.018 + amp * 0.045;

        // Animate Blender Armature Bones & sub-parts
        model.traverse(child => {
          const n = child.name;
          if (n === 'Head' || n.endsWith('_Head')) {
            child.rotation.x = Math.sin(t * 20) * amp * 0.24 + targetPitch * 0.65;
            child.rotation.y = targetYaw * 0.48;
            const jawPulse = 1 + amp * 0.14 * Math.abs(Math.sin(t * 22));
            child.scale.set(1, jawPulse, 1);
          } else if (n === 'Chest' || n === 'Spine') {
            child.rotation.y = Math.sin(t * 1.6) * 0.06;
            child.rotation.x = amp * 0.12;
          } else if (n === 'UpperArm_L' || n.endsWith('_Arm_L')) {
            child.rotation.x = -0.35 + Math.sin(t * 2.1) * 0.12 - amp * 0.38;
          } else if (n === 'UpperArm_R' || n.endsWith('_Arm_R')) {
            child.rotation.x = -0.45 - Math.sin(t * 2.1) * 0.12 - amp * 0.45;
          } else if (n === 'LowerArm_L' || n === 'LowerArm_R') {
            child.rotation.x = -0.42 - amp * 0.25;
          }
        });
      }

      renderer.render(scene, camera);
    };

    animate3D();

    const handleResize = () => {
      if (!mount) return;
      const w = mount.clientWidth || 640;
      const h = mount.clientHeight || 480;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animFrame);
      renderer.dispose();
    };
  }, []);

  // Swap the active 3D Blender character rig whenever `selectedCharacter` or `glbReady` changes
  useEffect(() => {
    const group = active3DGroupRef.current;
    if (!group || !glbReady) return;

    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }

    const template =
      loadedNodesRef.current[selectedCharacter.glbNodeName] ||
      loadedNodesRef.current['Char_PumpkinPatch'];
    if (template) {
      const instance = SkeletonUtils.clone(template);
      instance.position.set(0, 0, 0);
      group.add(instance);
    }
  }, [selectedCharacter, glbReady]);

  // Toggle Webcam for head-pose & AR face-swap tracking
  const toggleWebcam = useCallback(async () => {
    if (webcamActive) {
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach(t => t.stop());
        webcamStreamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      trackedEyesRef.current = null;
      setWebcamActive(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 360 }, facingMode: 'user' },
        audio: false,
      });
      webcamStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      if (!faceTrackerRef.current) {
        faceTrackerRef.current = new AsyncFaceTracker();
      }
      setWebcamActive(true);
      setStatusNotice('📷 Live webcam head-pose & 3D character rig tracking active.');
    } catch {
      setStatusNotice('⚠️ Webcam unavailable — running autonomous 3D Blender character rig.');
    }
  }, [webcamActive]);

  // Toggle Live Microphone Realtime Voice Changer
  const toggleLiveMicVoiceChanger = useCallback(async () => {
    if (!voiceChangerRef.current) return;
    if (micActive) {
      voiceChangerRef.current.stop();
      setMicActive(false);
      setStatusNotice('🎙️ Realtime microphone voice changer stopped.');
      return;
    }

    try {
      await voiceChangerRef.current.startMicrophone(
        customPreset,
        monitorSpeakers,
        selectedCharacter
      );
      setMicActive(true);
      setStatusNotice(
        `🎙️ LIVE LEARNED VOICE CHANGER ACTIVE: Speaking as ${selectedCharacter.name} (256-tap Vocal-Tract IR + F1=${Math.round(
          selectedCharacter.learnedFormants.f1Hz
        )}Hz / F2=${Math.round(selectedCharacter.learnedFormants.f2Hz)}Hz)`
      );
    } catch {
      setStatusNotice(
        '⚠️ Microphone unavailable — click "🎬 Play Movie Voice Clip" or "🎙️ Hear Learned Voice Morph" to hear the learned character voice!'
      );
    }
  }, [customPreset, micActive, monitorSpeakers, selectedCharacter]);

  // Play real extracted movie dialogue voice clip (`*_movie_sample.wav`)
  const handlePlayMovieVoiceClip = useCallback(async () => {
    if (!voiceChangerRef.current) return;
    await voiceChangerRef.current.playCharacterVoiceDemo({
      ...selectedCharacter,
      voicePreset: customPreset,
    });
    setStatusNotice(
      `🎬 Playing ${selectedCharacter.name}'s actual extracted movie dialogue from Pumpkin Patch (${selectedCharacter.learnedFormants.voicedFramesAnalyzed} voiced frames learned)...`
    );
  }, [customPreset, selectedCharacter]);

  // Preview learned vocal-tract convolution transfer on a reference human voice
  const handlePreviewVoiceMorphTransfer = useCallback(async () => {
    if (!voiceChangerRef.current) return;
    await voiceChangerRef.current.playMorphedVoiceTransferDemo({
      ...selectedCharacter,
      voicePreset: customPreset,
    });
    setStatusNotice(
      `🎙️ Morphing reference voice through ${selectedCharacter.shortName}'s learned 256-tap Vocal-Tract FIR Convolver + F1–F4 Formant Envelope...`
    );
  }, [customPreset, selectedCharacter]);

  // Update a single DSP parameter in real time
  const updateDspParam = <K extends keyof CharacterVoiceDspPreset>(
    key: K,
    val: CharacterVoiceDspPreset[K]
  ) => {
    const next = { ...customPreset, [key]: val };
    setCustomPreset(next);
    voiceChangerRef.current?.applyPresetParameters(next, selectedCharacter);
  };

  // Main 60fps VTuber Face-Mapping & Voice Lip-Sync Loop
  useEffect(() => {
    let animId = 0;
    const startMs = performance.now();

    const renderLoop = () => {
      animId = requestAnimationFrame(renderLoop);
      const nowMs = performance.now();
      const timeSec = (nowMs - startMs) / 1000;

      // Track face eyes if webcam is active
      let trackedEyes: FaceEyes | null = null;
      if (webcamActive && videoRef.current && faceTrackerRef.current) {
        const faces = faceTrackerRef.current.Read(videoRef.current, nowMs);
        if (faces && faces.length > 0) {
          trackedEyes = faces[0];
        }
      }
      trackedEyesRef.current = trackedEyes;

      const telemetry = voiceChangerRef.current?.getVoiceTelemetry() || {
        amplitude: 0,
        spectrum: new Array(16).fill(0),
        isSpeaking: false,
      };
      setVoiceSpeaking(telemetry.isSpeaking);

      const canvas = canvasRef.current;
      if (!canvas || renderMode === 'BLENDER_3D_RIG' || renderMode === 'COUNCIL_SHEET') return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const portraitImg = portraitCacheRef.current[selectedCharacter.id] || null;

      renderStoryIntelVTuberFrame({
        ctx,
        width: canvas.width,
        height: canvas.height,
        character: selectedCharacter,
        portraitImg,
        webcamVideo: webcamActive ? videoRef.current : null,
        faceEyes: trackedEyes,
        voiceAmplitude: telemetry.amplitude,
        voiceSpectrum: telemetry.spectrum,
        mode: renderMode,
        dimLightsFoundFootage: dimLights,
        timeSec,
      });
    };

    renderLoop();
    return () => cancelAnimationFrame(animId);
  }, [dimLights, renderMode, selectedCharacter, webcamActive]);

  // Post VTuber snapshot + voice-changed line to the Halloween Vault Chat Room
  const handlePostToVaultChat = () => {
    let snapshotDataUrl: string | undefined;
    if (renderMode === 'BLENDER_3D_RIG' && threeMountRef.current) {
      const glCanvas = threeMountRef.current.querySelector('canvas');
      if (glCanvas) {
        snapshotDataUrl = glCanvas.toDataURL('image/jpeg', 0.85);
      }
    } else if (canvasRef.current) {
      snapshotDataUrl = canvasRef.current.toDataURL('image/jpeg', 0.84);
    }

    const text =
      chatLineInput.trim() ||
      `${selectedCharacter.emoji} [3D Rig + Learned Voice: ${selectedCharacter.shortName}] ${selectedCharacter.sampleQuote}`;

    onSendVTuberMessageToChat?.({
      character: selectedCharacter,
      text,
      snapshotDataUrl,
      voiceChanged: true,
    });
    setChatLineInput('');
    setStatusNotice(`✅ Posted 3D VTuber message as ${selectedCharacter.name} to the Vault Chat!`);
  };

  // Update creator licensing policy for a character
  const updateCharacterPermission = (
    charId: string,
    patch: Partial<CreatorFilmInteractivePolicy['characters'][string]>
  ) => {
    const existing = policy.characters[charId];
    if (!existing) return;
    const updated: CreatorFilmInteractivePolicy = {
      ...policy,
      characters: {
        ...policy.characters,
        [charId]: {
          ...existing,
          ...patch,
          updatedAt: Date.now(),
        },
      },
    };
    setPolicy(updated);
    saveCreatorCharacterPolicy(updated);
  };

  const currentCharAccess = evaluateCharacterAccess(
    policy.characters[selectedCharacter.id],
    policy.enableInteractiveCharactersMaster,
    viewerSimMode
  );

  return (
    <div className="rounded-3xl border-2 border-purple-500/35 bg-gradient-to-b from-[#11081d] via-[#0c0714] to-[#09050e] p-5 sm:p-6 shadow-[0_0_55px_rgba(168,85,247,0.15)] space-y-5">
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* Top Header & Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-800 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-purple-500/20 border border-purple-400/40 text-purple-300 text-[10px] font-black uppercase tracking-widest">
              🧊 Blender 5.0 Skinned Cast • Art Council Turnaround Sheets • Learned Movie Voice
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-orange-500/20 border border-orange-400/40 text-orange-300 text-[10px] font-mono">
              Learned from 8,057 Voiced Movie Frames · Zero Robot Noise
            </span>
          </div>
          <h3 className="text-xl sm:text-2xl font-black text-white mt-1">
            3D Rigged Movie Character Studio &amp; Learned Vocal-Tract Voice Changer
          </h3>
          <p className="text-xs text-stone-400 mt-0.5">
            Built with Council-guided turnaround sheets, Blender 5.0 skinned armature rigs textured from actual <em>Pumpkin Patch</em> movie frames, and 256-tap vocal-tract impulse responses learned directly from the film’s dialogue track.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-stone-950 p-1.5 rounded-2xl border border-stone-800">
          <button
            onClick={() => setActiveTab('VTUBER_STUDIO')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
              activeTab === 'VTUBER_STUDIO'
                ? 'bg-gradient-to-r from-orange-600 to-purple-600 text-white shadow-lg'
                : 'text-stone-400 hover:text-white'
            }`}
          >
            🧊🎙️ 3D Character Rig &amp; Learned Voice Changer
          </button>
          <button
            onClick={() => setActiveTab('CREATOR_LICENSING')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
              activeTab === 'CREATOR_LICENSING'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg'
                : 'text-stone-400 hover:text-white'
            }`}
          >
            👑 Creator Upload &amp; Subscriber Licensing ({STORY_INTEL_VTUBER_CHARACTERS.length})
          </button>
        </div>
      </div>

      {/* Viewer Entitlement Simulator Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 rounded-2xl bg-stone-900/90 border border-stone-800 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
            🔑 Test Subscriber / Sanctuary Unlock State:
          </span>
          <span className="text-[11px] text-stone-400 hidden sm:inline">
            See how creator character permissions unlock for Sanctuary members &amp; active subscribers:
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: 'PUBLIC_VIEWER', label: '👤 Free Public Viewer' },
              { id: 'ACTIVE_CREATOR_SUBSCRIBER', label: '💎 Active Creator Subscriber' },
              { id: 'IN_CREATOR_SANCTUARY', label: "🏰 Inside Creator's Sanctuary" },
              { id: 'CREATOR_OWNER', label: '👑 Creator (Brian James Gage)' },
            ] as const
          ).map(mode => (
            <button
              key={mode.id}
              onClick={() => setViewerSimMode(mode.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                viewerSimMode === mode.id
                  ? 'bg-amber-500 text-black font-black shadow'
                  : 'bg-stone-950 text-stone-400 hover:text-white border border-stone-800'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {statusNotice && (
        <div className="px-4 py-2 rounded-xl bg-orange-950/50 border border-orange-500/40 text-xs text-orange-200 flex items-center justify-between">
          <span>{statusNotice}</span>
          <button
            onClick={() => setStatusNotice(null)}
            className="text-stone-400 hover:text-white ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {activeTab === 'VTUBER_STUDIO' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT 4 COLS: CHARACTER ROSTER */}
          <div className="lg:col-span-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-orange-400">
                🎃 Select 3D Rig &amp; Learned Movie Voice ({STORY_INTEL_VTUBER_CHARACTERS.length})
              </span>
              <span className="text-[10px] font-mono text-stone-400">
                Blender GLB + WAV IR
              </span>
            </div>

            <div className="space-y-2 max-h-[530px] overflow-y-auto pr-1 custom-scrollbar">
              {STORY_INTEL_VTUBER_CHARACTERS.map(char => {
                const isSelected = char.id === selectedCharacter.id;
                const access = evaluateCharacterAccess(
                  policy.characters[char.id],
                  policy.enableInteractiveCharactersMaster,
                  viewerSimMode
                );

                return (
                  <button
                    key={char.id}
                    onClick={() => setSelectedCharId(char.id)}
                    className={`w-full text-left p-2.5 rounded-2xl border transition flex items-center gap-3 cursor-pointer ${
                      isSelected
                        ? 'bg-gradient-to-r from-orange-950/90 via-purple-950/60 to-stone-900 border-orange-500 shadow-lg'
                        : 'bg-stone-900/70 hover:bg-stone-900 border-stone-800/90'
                    } ${!access.unlocked ? 'opacity-65' : ''}`}
                  >
                    <div className="relative w-12 h-14 rounded-xl overflow-hidden shrink-0 border border-stone-700 bg-black">
                      <img
                        src={char.portraitUrl}
                        alt={char.name}
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute bottom-0 right-0 px-1 bg-black/80 text-[10px]">
                        {char.emoji}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-black text-white truncate">
                          {char.name}
                        </span>
                      </div>
                      <div className="text-[10px] text-stone-400 truncate">
                        {char.alias}
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                            access.unlocked
                              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-950/80 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {access.badgeText}
                        </span>
                        <span className="text-[9px] font-mono text-orange-300">
                          F1:{Math.round(char.learnedFormants.f1Hz)}Hz · {char.learnedFormants.voicedFramesAnalyzed}f
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* CENTER 5 COLS: 3D BLENDER RIG VIEWPORT + COUNCIL SHEET + 2.5D/AR STAGE */}
          <div className="lg:col-span-5 flex flex-col space-y-3">
            <div className="relative rounded-2xl overflow-hidden border-2 border-orange-500/45 bg-black aspect-[4/3] shadow-2xl">
              {/* 3D Blender Rig WebGL Viewport */}
              <div
                ref={threeMountRef}
                className={`w-full h-full ${renderMode === 'BLENDER_3D_RIG' ? 'block' : 'hidden'}`}
              />
              {/* Council 3D Turnaround Sheet View */}
              {renderMode === 'COUNCIL_SHEET' && (
                <div className="w-full h-full bg-stone-950 flex flex-col items-center justify-center relative">
                  <img
                    src={
                      CHARACTER_COUNCIL_SHEET_MAP[selectedCharacter.id] ||
                      '/models/halloween/sheets/pumpkin_patch_sheet.jpg'
                    }
                    alt={`${selectedCharacter.name} Council 3D Turnaround Sheet`}
                    className="w-full h-full object-contain"
                  />
                  <span className="absolute bottom-3 left-3 right-3 px-3 py-1.5 rounded-xl bg-black/85 border border-amber-500/40 text-[10px] font-mono text-amber-200 text-center">
                    🎨 Art Council Orthographic Turnaround Sheet &amp; UV Texture Atlas for {selectedCharacter.name}
                  </span>
                </div>
              )}
              {/* 2.5D / AR Face-Swap Canvas */}
              <canvas
                ref={canvasRef}
                width={640}
                height={480}
                className={`w-full h-full object-cover ${
                  renderMode === 'BLENDER_3D_RIG' || renderMode === 'COUNCIL_SHEET'
                    ? 'hidden'
                    : 'block'
                }`}
              />

              {/* Top Overlay Badges */}
              <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
                <div className="flex items-center gap-1.5">
                  <span className="px-2.5 py-1 rounded-full bg-black/80 border border-orange-500/50 text-[10px] font-black text-orange-300 flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        voiceSpeaking ? 'bg-emerald-400 animate-ping' : 'bg-orange-400'
                      }`}
                    />
                    {selectedCharacter.emoji} {selectedCharacter.shortName}{' '}
                    {renderMode === 'BLENDER_3D_RIG'
                      ? '3D Skinned Rig'
                      : renderMode === 'COUNCIL_SHEET'
                      ? 'Council 3D Sheet'
                      : 'VTuber Rig'}
                  </span>
                  {micActive && (
                    <span className="px-2 py-0.5 rounded-full bg-red-600/90 text-[9px] font-black text-white uppercase">
                      🎙️ LIVE LEARNED VOICE
                    </span>
                  )}
                </div>

                <span className="px-2 py-0.5 rounded bg-black/75 border border-stone-700 text-[9px] font-mono text-stone-300">
                  {selectedCharacter.glbNodeName}
                </span>
              </div>

              {/* Lock Overlay if Viewer Sim Mode does not have access */}
              {!currentCharAccess.unlocked && (
                <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center space-y-3">
                  <div className="text-3xl">🔒</div>
                  <h4 className="text-base font-black text-white">
                    {selectedCharacter.name} — Subscriber / Sanctuary Exclusive
                  </h4>
                  <p className="text-xs text-stone-300 max-w-sm">
                    {currentCharAccess.reasonLabel}
                  </p>
                  <div className="flex flex-wrap justify-center gap-2 pt-1">
                    <button
                      onClick={() => setViewerSimMode('ACTIVE_CREATOR_SUBSCRIBER')}
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-wider cursor-pointer"
                    >
                      💎 Subscribe to {selectedCharacter.creatorName} ($4.99/mo) to Unlock
                    </button>
                    <button
                      onClick={() => setViewerSimMode('IN_CREATOR_SANCTUARY')}
                      className="px-3.5 py-2 rounded-xl bg-purple-900/80 hover:bg-purple-800 border border-purple-400/50 text-purple-100 font-bold text-xs cursor-pointer"
                    >
                      🏰 Enter Creator Sanctuary
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Stage Mode Controls Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-stone-900/90 p-2.5 rounded-2xl border border-stone-800">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setRenderMode('BLENDER_3D_RIG')}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition cursor-pointer ${
                    renderMode === 'BLENDER_3D_RIG'
                      ? 'bg-orange-600 text-white'
                      : 'bg-stone-950 text-stone-400 hover:text-white'
                  }`}
                >
                  🧊 3D Blender Rig
                </button>
                <button
                  onClick={() => setRenderMode('COUNCIL_SHEET')}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition cursor-pointer ${
                    renderMode === 'COUNCIL_SHEET'
                      ? 'bg-amber-600 text-white'
                      : 'bg-stone-950 text-stone-400 hover:text-white'
                  }`}
                >
                  🎨 Council 3D Sheet
                </button>
                <button
                  onClick={() => setRenderMode('VTUBER_STAGE')}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition cursor-pointer ${
                    renderMode === 'VTUBER_STAGE'
                      ? 'bg-orange-600 text-white'
                      : 'bg-stone-950 text-stone-400 hover:text-white'
                  }`}
                >
                  🎭 2.5D Jaw Portrait
                </button>
                <button
                  onClick={() => setRenderMode('AR_WEBCAM_SWAP')}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition cursor-pointer ${
                    renderMode === 'AR_WEBCAM_SWAP'
                      ? 'bg-orange-600 text-white'
                      : 'bg-stone-950 text-stone-400 hover:text-white'
                  }`}
                >
                  📷 AR Face-Swap
                </button>
                <button
                  onClick={() => setDimLights(v => !v)}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition cursor-pointer ${
                    dimLights
                      ? 'bg-amber-500 text-black'
                      : 'bg-stone-950 text-stone-400 hover:text-white'
                  }`}
                >
                  🔦 Night Beam
                </button>
              </div>

              <button
                onClick={toggleWebcam}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition cursor-pointer ${
                  webcamActive
                    ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-300'
                    : 'bg-stone-950 border-stone-700 text-stone-300 hover:text-white'
                }`}
              >
                {webcamActive ? '📷 Head Tracking: ON' : '📷 Track My Head via Webcam'}
              </button>
            </div>

            {/* Send VTuber Performance to Chat Room */}
            <div className="flex gap-2">
              <input
                type="text"
                value={chatLineInput}
                onChange={e => setChatLineInput(e.target.value)}
                placeholder={`Speak or type as ${selectedCharacter.shortName}...`}
                className="flex-1 px-3.5 py-2 rounded-xl bg-stone-950 border border-stone-800 text-xs text-white focus:border-orange-500 outline-none"
              />
              <button
                onClick={handlePostToVaultChat}
                disabled={!currentCharAccess.unlocked}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 disabled:opacity-40 text-white font-black text-xs uppercase tracking-wider shrink-0 cursor-pointer"
              >
                📸 Post as {selectedCharacter.shortName}
              </button>
            </div>
          </div>

          {/* RIGHT 3 COLS: LEARNED MOVIE VOICE CHANGER RACK */}
          <div className="lg:col-span-3 bg-stone-950/90 border border-stone-800 rounded-2xl p-4 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-purple-400">
                  🎛️ Learned Movie Voice Engine
                </span>
                <span className="text-[10px] font-mono text-emerald-400">
                  256-Tap FIR Convolver
                </span>
              </div>

              <div className="p-3 rounded-xl bg-stone-900/90 border border-stone-800 space-y-1.5">
                <div className="text-xs font-black text-white flex items-center justify-between">
                  <span>
                    {selectedCharacter.emoji} {selectedCharacter.name}
                  </span>
                </div>
                <p className="text-[10px] text-stone-400 leading-snug">
                  {selectedCharacter.voiceDescription}
                </p>
                <div className="grid grid-cols-2 gap-1 pt-1 text-[9px] font-mono text-stone-300">
                  <div className="px-2 py-1 rounded bg-black/50 border border-stone-800">
                    F1: <span className="text-orange-300">{Math.round(selectedCharacter.learnedFormants.f1Hz)}Hz</span> ({selectedCharacter.learnedFormants.f1GainDb > 0 ? '+' : ''}{selectedCharacter.learnedFormants.f1GainDb.toFixed(1)}dB)
                  </div>
                  <div className="px-2 py-1 rounded bg-black/50 border border-stone-800">
                    F2: <span className="text-orange-300">{Math.round(selectedCharacter.learnedFormants.f2Hz)}Hz</span> ({selectedCharacter.learnedFormants.f2GainDb > 0 ? '+' : ''}{selectedCharacter.learnedFormants.f2GainDb.toFixed(1)}dB)
                  </div>
                  <div className="px-2 py-1 rounded bg-black/50 border border-stone-800">
                    F3: <span className="text-purple-300">{Math.round(selectedCharacter.learnedFormants.f3Hz)}Hz</span>
                  </div>
                  <div className="px-2 py-1 rounded bg-black/50 border border-stone-800">
                    Frames: <span className="text-emerald-300">{selectedCharacter.learnedFormants.voicedFramesAnalyzed}</span>
                  </div>
                </div>
                <p className="text-[11px] italic text-amber-300/90 pt-1">
                  {selectedCharacter.sampleQuote}
                </p>
              </div>

              {/* Primary Mic + Real Movie Clip + Learned Morph Transfer Buttons */}
              <div className="space-y-2">
                <button
                  onClick={toggleLiveMicVoiceChanger}
                  disabled={!currentCharAccess.unlocked}
                  className={`w-full py-2.5 px-3 rounded-xl font-black text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 cursor-pointer ${
                    micActive
                      ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-950/50'
                      : 'bg-orange-600 hover:bg-orange-500 text-white shadow-lg'
                  } disabled:opacity-40`}
                >
                  <span>{micActive ? '⏹️' : '🎙️'}</span>
                  {micActive
                    ? `Stop Live ${selectedCharacter.shortName} Mic`
                    : `Start Live Mic (${selectedCharacter.shortName})`}
                </button>

                <button
                  onClick={handlePlayMovieVoiceClip}
                  disabled={!currentCharAccess.unlocked}
                  className="w-full py-2 px-3 rounded-xl bg-emerald-950/90 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-200 font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
                >
                  <span>🎬</span> Play Real Movie Voice ({selectedCharacter.shortName})
                </button>

                <button
                  onClick={handlePreviewVoiceMorphTransfer}
                  disabled={!currentCharAccess.unlocked}
                  className="w-full py-2 px-3 rounded-xl bg-purple-950/90 hover:bg-purple-900 border border-purple-500/40 text-purple-200 font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
                >
                  <span>🔊</span> Preview Learned Voice-Morph Transfer
                </button>
              </div>

              {/* Learned Voice DSP Sliders */}
              <div className="space-y-2.5 pt-2 border-t border-stone-800 text-[11px]">
                <div>
                  <div className="flex justify-between text-stone-300 font-mono">
                    <span>Learned Vocal-Tract IR Mix</span>
                    <span className="text-emerald-400">
                      {Math.round((customPreset.vocalTractIrMix ?? 0.8) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={customPreset.vocalTractIrMix ?? 0.8}
                    onChange={e => updateDspParam('vocalTractIrMix', parseFloat(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-stone-300 font-mono">
                    <span>Pitch Shift</span>
                    <span className="text-orange-400">
                      {customPreset.pitchSemitones > 0 ? '+' : ''}
                      {customPreset.pitchSemitones.toFixed(1)} semitones
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-8}
                    max={8}
                    step={0.5}
                    value={customPreset.pitchSemitones}
                    onChange={e => updateDspParam('pitchSemitones', parseFloat(e.target.value))}
                    className="w-full accent-orange-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-stone-300 font-mono">
                    <span>Formant Envelope Shift</span>
                    <span className="text-orange-400">
                      {customPreset.formantShiftHz > 0 ? '+' : ''}
                      {customPreset.formantShiftHz} Hz
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-300}
                    max={350}
                    step={10}
                    value={customPreset.formantShiftHz}
                    onChange={e => updateDspParam('formantShiftHz', parseInt(e.target.value, 10))}
                    className="w-full accent-orange-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-stone-300 font-mono">
                    <span>Warm Tube Saturation</span>
                    <span className="text-orange-400">
                      {Math.round(customPreset.gritDrive * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={0.6}
                    step={0.03}
                    value={customPreset.gritDrive}
                    onChange={e => updateDspParam('gritDrive', parseFloat(e.target.value))}
                    className="w-full accent-orange-500"
                  />
                </div>
              </div>
            </div>

            <label className="flex items-center justify-between pt-2 border-t border-stone-800 text-xs text-stone-300 cursor-pointer">
              <span>🎧 Hear My Morphed Voice</span>
              <input
                type="checkbox"
                checked={monitorSpeakers}
                onChange={e => {
                  setMonitorSpeakers(e.target.checked);
                  voiceChangerRef.current?.setMonitorEnabled(e.target.checked);
                }}
                className="accent-orange-500"
              />
            </label>
          </div>
        </div>
      ) : (
        /* CREATOR UPLOAD & CHARACTER INTERACTIVE LICENSING GOVERNANCE CONSOLE */
        <div className="space-y-5">
          <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/50 via-stone-900 to-purple-950/50 border border-emerald-500/35 flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-2xl">
              <div className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
                🎬 Creator Upload &amp; Story Intelligence Character Governance
              </div>
              <h4 className="text-base font-black text-white mt-0.5">
                {policy.filmTitle} — Creator: {policy.creatorName}
              </h4>
              <p className="text-xs text-stone-300 mt-1">
                When creators upload a film to Cinema, Story Intelligence extracts its characters, 3D rigs, and vocal-tract profiles. Creators control which characters can appear in live interactive experiences and whether they are <span className="text-amber-300 font-semibold">restricted to their Worlds &amp; Sanctuary</span>, <span className="text-emerald-300 font-semibold">shared with the platform</span>, or <span className="text-purple-300 font-semibold">unlocked by Sanctuary members &amp; active subscribers for platform-wide use while subscribed</span>.
              </p>
            </div>

            <label className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-stone-950 border border-emerald-500/40 cursor-pointer">
              <input
                type="checkbox"
                checked={policy.enableInteractiveCharactersMaster}
                onChange={e => {
                  const next = {
                    ...policy,
                    enableInteractiveCharactersMaster: e.target.checked,
                    interactiveCharactersEnabled: e.target.checked,
                  };
                  setPolicy(next);
                  saveCreatorCharacterPolicy(next);
                }}
                className="w-4 h-4 accent-emerald-500"
              />
              <div>
                <div className="text-xs font-black text-white">
                  Allow Film Characters in Interactive Experiences
                </div>
                <div className="text-[10px] text-stone-400">
                  Master switch set during Creator Upload
                </div>
              </div>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {STORY_INTEL_VTUBER_CHARACTERS.map(char => {
              const perm = policy.characters[char.id];
              if (!perm) return null;
              return (
                <div
                  key={char.id}
                  className="p-4 rounded-2xl bg-stone-950/90 border border-stone-800 flex flex-col justify-between space-y-3"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={char.portraitUrl}
                      alt={char.name}
                      className="w-12 h-14 rounded-xl object-cover border border-orange-500/40 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-black text-white truncate">
                        {char.emoji} {char.name}
                      </div>
                      <div className="text-[10px] text-stone-400 truncate">
                        {char.roleLabel} • {char.alias}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                      Interactive Access &amp; Subscriber Tier
                    </label>
                    <select
                      value={perm.accessTier}
                      onChange={e =>
                        updateCharacterPermission(char.id, {
                          accessTier: e.target.value as CharacterAccessTier,
                        })
                      }
                      className="w-full px-2.5 py-2 rounded-xl bg-stone-900 border border-stone-700 text-xs text-white font-semibold outline-none focus:border-orange-500"
                    >
                      <option value="PLATFORM_PUBLIC">
                        🌐 Share with Entire Platform (Public)
                      </option>
                      <option value="SANCTUARY_SUBSCRIBER_UNLOCK">
                        💎 Sanctuary &amp; Subscribers Unlock Across Platform (While Subscribed)
                      </option>
                      <option value="WORLD_SANCTUARY_ONLY">
                        🏰 Restrict to Creator’s Worlds &amp; Sanctuary Only
                      </option>
                      <option value="DISABLED">
                        🔒 Disabled (Do Not Allow in Interactive Experiences)
                      </option>
                    </select>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 pt-1 text-[10px]">
                    <label className="flex items-center gap-1.5 p-1.5 rounded-lg bg-stone-900 border border-stone-800 text-stone-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={perm.allowIn3DExhibitions}
                        onChange={e =>
                          updateCharacterPermission(char.id, {
                            allowIn3DExhibitions: e.target.checked,
                            enabledFor3DExhibit: e.target.checked,
                          })
                        }
                        className="accent-orange-500"
                      />
                      <span>3D Exhibits</span>
                    </label>
                    <label className="flex items-center gap-1.5 p-1.5 rounded-lg bg-stone-900 border border-stone-800 text-stone-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={perm.allowVTuberFaceMapping}
                        onChange={e =>
                          updateCharacterPermission(char.id, {
                            allowVTuberFaceMapping: e.target.checked,
                            enabledForVTuber: e.target.checked,
                          })
                        }
                        className="accent-orange-500"
                      />
                      <span>VTuber Face</span>
                    </label>
                    <label className="flex items-center gap-1.5 p-1.5 rounded-lg bg-stone-900 border border-stone-800 text-stone-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={perm.allowRealtimeVoiceChanger}
                        onChange={e =>
                          updateCharacterPermission(char.id, {
                            allowRealtimeVoiceChanger: e.target.checked,
                            enabledForVoiceChanger: e.target.checked,
                          })
                        }
                        className="accent-orange-500"
                      />
                      <span>Voice Morph</span>
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default StoryIntelVTuberVoiceStudio;
