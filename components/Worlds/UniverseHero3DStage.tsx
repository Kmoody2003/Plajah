import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {
  Compass,
  Sparkles,
  Layers,
  Cpu,
  Gamepad2,
  Eye,
  ChevronRight,
  RotateCcw,
  ArrowLeft,
  Play,
  ExternalLink,
  Users,
  Scroll,
  History,
  Network,
  Film,
  Music2,
} from 'lucide-react';
import {
  Universe3DCoverId,
  UNIVERSE_3D_COVER_PRESETS,
  Universe3DNode,
} from '../../data/worldsShowcaseData';
import {
  GAME_COUNCIL_LIST,
  WORLD_COUNCIL_BLUEPRINTS,
  CouncilRenderLens,
} from '../../services/game/council/gameCouncilService';

export interface UniverseHero3DStageProps {
  activeUniverseId: Universe3DCoverId;
  onSelectUniverse: (id: Universe3DCoverId) => void;
  selectedNodeId?: string | null;
  onSelectNode?: (node: Universe3DNode) => void;
  isWorldDetailCover?: boolean;
  worldTitle?: string;
  worldTagline?: string;
  worldStats?: {
    characters: number;
    lore: number;
    timeline: number;
    albums?: number;
    videos?: number;
  };
  onBackToAllWorlds?: () => void;
  onEnterNodeOrWorld?: (node: Universe3DNode) => void;
  onJumpToWorldTab?: (tab: 'Overview' | 'Characters' | 'Lore' | 'Timeline' | 'Graph' | 'WorldHub') => void;
  onOpenStudio?: (
    studio: 'FABULA' | 'LOREA_BOOK' | 'LOREA_SCRIPT' | 'CHORA' | 'TALEO',
    node?: Universe3DNode
  ) => void;
}

const LENS_MODES: {
  id: CouncilRenderLens;
  label: string;
  badge: string;
  specialist: string;
}[] = [
  {
    id: 'UNREAL_PBR',
    label: 'Hollywood VFX + Blender PBR',
    badge: 'BLENDER 5.0.1 + BLOOM',
    specialist: 'Søren Lindqvist',
  },
  {
    id: 'SATSUEI_ANIME',
    label: 'Satsuei Cel-Bloom',
    badge: 'ANIME COMPOSITING',
    specialist: 'Takumi Sato',
  },
  {
    id: 'HD2D_DIORAMA',
    label: 'HD-2D Tilt-Shift',
    badge: 'OCTOPATH / DIORAMA',
    specialist: 'Kenji "Raster" Vance',
  },
  {
    id: 'CRT_16BIT',
    label: '16-Bit Mode-7 CRT',
    badge: 'SCANLINE / PPU',
    specialist: 'Kenji "Raster" Vance',
  },
];

// Map each node index to a real Plajah Worlds Canon Tab so clicking a 3D landmark connects directly to what's in Worlds
const NODE_CANON_SECTORS: Array<{
  tab: 'Overview' | 'Characters' | 'Lore' | 'Timeline' | 'Graph' | 'WorldHub';
  sectorLabel: string;
}> = [
  { tab: 'Overview', sectorLabel: 'World Source Code & Hub' },
  { tab: 'Characters', sectorLabel: 'Canonical Characters & Crossovers' },
  { tab: 'Lore', sectorLabel: 'Locations, Realms & MacGuffins' },
  { tab: 'Timeline', sectorLabel: 'Temporal Spine & Branching Era' },
  { tab: 'Graph', sectorLabel: 'Neural Topology & Media Links' },
];

export const UniverseHero3DStage: React.FC<UniverseHero3DStageProps> = ({
  activeUniverseId,
  onSelectUniverse,
  selectedNodeId: controlledNodeId,
  onSelectNode,
  isWorldDetailCover = false,
  worldTitle,
  worldTagline,
  worldStats,
  onBackToAllWorlds,
  onEnterNodeOrWorld,
  onJumpToWorldTab,
  onOpenStudio,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const preset = UNIVERSE_3D_COVER_PRESETS[activeUniverseId] || UNIVERSE_3D_COVER_PRESETS.STARGATE_ODYSSEY;
  const blueprint = WORLD_COUNCIL_BLUEPRINTS[activeUniverseId] || WORLD_COUNCIL_BLUEPRINTS.STARGATE_ODYSSEY;

  const [internalNodeId, setInternalNodeId] = useState<string | null>(
    preset.nodes[0]?.id || null
  );
  const effectiveNodeId = controlledNodeId !== undefined ? controlledNodeId : internalNodeId;

  const [renderLens, setRenderLens] = useState<CouncilRenderLens>('UNREAL_PBR');
  const [showCouncilDebate, setShowCouncilDebate] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [screenBeacons, setScreenBeacons] = useState<
    { id: string; x: number; y: number; visible: boolean }[]
  >([]);
  const [glbLoaded, setGlbLoaded] = useState(false);

  useEffect(() => {
    setInternalNodeId(preset.nodes[0]?.id || null);
  }, [activeUniverseId]);

  const activeNode = useMemo(() => {
    return (
      preset.nodes.find((n) => n.id === effectiveNodeId) ||
      preset.nodes[0] ||
      null
    );
  }, [preset, effectiveNodeId]);

  const activeNodeIndex = useMemo(() => {
    if (!activeNode) return 0;
    const idx = preset.nodes.findIndex((n) => n.id === activeNode.id);
    return idx >= 0 ? idx : 0;
  }, [preset, activeNode]);

  const activeSectorMeta = NODE_CANON_SECTORS[activeNodeIndex % NODE_CANON_SECTORS.length];

  const handleSelectNode = (node: Universe3DNode) => {
    setInternalNodeId(node.id);
    onSelectNode?.(node);
  };

  const cameraTargetRef = useRef<{
    pos: THREE.Vector3;
    lookAt: THREE.Vector3;
    vesselTarget: THREE.Vector3;
  }>({
    pos: new THREE.Vector3(0, 1.35, 11.2),
    lookAt: new THREE.Vector3(0, 0.2, 0),
    vesselTarget: new THREE.Vector3(0, 0.35, 1.8),
  });

  const lensRef = useRef<CouncilRenderLens>(renderLens);
  useEffect(() => {
    lensRef.current = renderLens;
  }, [renderLens]);

  const getNodeWorldPos = (node: Universe3DNode, idx: number): THREE.Vector3 => {
    if (node.plateUV) {
      const [u, v] = node.plateUV;
      const wx = (u - 0.5) * 13.5;
      const wy = (0.5 - v) * 5.8;
      const wz = idx === 0 ? 1.4 : 0.4 + (idx % 3) * 0.45;
      return new THREE.Vector3(wx, wy, wz);
    }
    const angle = (idx / Math.max(1, preset.nodes.length)) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(angle) * 4.5, Math.sin(angle) * 2.0, 1.0);
  };

  useEffect(() => {
    if (!activeNode) return;
    const idx = preset.nodes.findIndex((n) => n.id === activeNode.id);
    const wp = getNodeWorldPos(activeNode, Math.max(0, idx));
    cameraTargetRef.current.vesselTarget.copy(wp);
    cameraTargetRef.current.lookAt.set(wp.x * 0.42, wp.y * 0.42, 0);
    cameraTargetRef.current.pos.set(wp.x * 0.52, wp.y * 0.42 + 1.25, 9.6);
  }, [activeNode, activeUniverseId]);

  const resetCamera = () => {
    cameraTargetRef.current.pos.set(0, 1.35, 11.2);
    cameraTargetRef.current.lookAt.set(0, 0.2, 0);
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;
    setGlbLoaded(false);

    const width = Math.max(320, container.clientWidth || 1200);
    const height = Math.max(420, container.clientHeight || 660);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(
      activeUniverseId === 'STARGATE_ODYSSEY'
        ? '#02040d'
        : activeUniverseId === 'KINGDOM_CHRONICLES'
        ? '#0b0704'
        : '#040a18'
    );
    scene.fog = new THREE.FogExp2(
      activeUniverseId === 'STARGATE_ODYSSEY'
        ? '#030716'
        : activeUniverseId === 'KINGDOM_CHRONICLES'
        ? '#120b05'
        : '#071326',
      0.015
    );

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 300);
    camera.position.set(0, 1.35, 11.2);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.28;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Hollywood VFX Post-Processing Pipeline (RenderPass + UnrealBloomPass)
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      activeUniverseId === 'STARGATE_ODYSSEY' ? 0.88 : 0.68,
      0.55,
      0.32
    );
    composer.addPass(bloomPass);

    // Studio & Atmospheric Lighting
    const ambientLight = new THREE.AmbientLight('#ffffff', 1.15);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(
      activeUniverseId === 'STARGATE_ODYSSEY'
        ? '#67e8f9'
        : activeUniverseId === 'KINGDOM_CHRONICLES'
        ? '#fbbf24'
        : '#5eead4',
      2.8
    );
    keyLight.position.set(7, 10, 9);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(
      activeUniverseId === 'STARGATE_ODYSSEY'
        ? '#f59e0b'
        : activeUniverseId === 'KINGDOM_CHRONICLES'
        ? '#ef4444'
        : '#c084fc',
      2.1
    );
    rimLight.position.set(-9, 5, -5);
    scene.add(rimLight);

    const textureLoader = new THREE.TextureLoader();

    // 1. Curved 360° Hollywood VFX Cyclorama Dome (loads vfxBackdropUrl with fallback to masterPlateUrl)
    const domeGeo = new THREE.PlaneGeometry(34, 18.5, 64, 36);
    const domePos = domeGeo.attributes.position;
    for (let i = 0; i < domePos.count; i++) {
      const vx = domePos.getX(i);
      const vy = domePos.getY(i);
      const bend = -Math.pow(vx / 17.0, 2) * 4.2 - Math.pow(vy / 10.0, 2) * 1.1;
      domePos.setZ(i, bend);
    }
    domeGeo.computeVertexNormals();

    const domeMat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      side: THREE.DoubleSide,
    });
    const domeMesh = new THREE.Mesh(domeGeo, domeMat);
    domeMesh.position.set(0, 0.65, -7.8);
    scene.add(domeMesh);

    const primaryBackdropUrl = preset.vfxBackdropUrl || preset.masterPlateUrl;
    textureLoader.load(
      primaryBackdropUrl,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        domeMat.map = tex;
        domeMat.needsUpdate = true;
      },
      undefined,
      () => {
        textureLoader.load(preset.masterPlateUrl, (fallbackTex) => {
          fallbackTex.colorSpace = THREE.SRGBColorSpace;
          domeMat.map = fallbackTex;
          domeMat.needsUpdate = true;
        });
      }
    );

    const worldGroup = new THREE.Group();
    scene.add(worldGroup);

    const shaderUniformsList: Array<{ uTime: { value: number } }> = [];
    const animatedRefs: {
      stargateInner?: THREE.Object3D;
      dysonRings: THREE.Object3D[];
      astrolabeRings: THREE.Object3D[];
      clockworkGears: THREE.Object3D[];
      orreryRings: THREE.Object3D[];
      skyIslands: THREE.Object3D[];
      planets: THREE.Object3D[];
    } = {
      dysonRings: [],
      astrolabeRings: [],
      clockworkGears: [],
      orreryRings: [],
      skyIslands: [],
      planets: [],
    };

    // 2. Load Headless Blender 5.0.1 .GLB Scene (`stargate_odyssey.glb`, `kingdom_chronicles.glb`, `aether_archipelago.glb`)
    const gltfLoader = new GLTFLoader();
    gltfLoader.load(
      preset.blenderGlbUrl,
      (gltf) => {
        const root = gltf.scene;
        root.traverse((child: any) => {
          if (child.isMesh && child.material) {
            child.material.envMapIntensity = 1.5;
            child.material.needsUpdate = true;
          }
          const nm = child.name || '';
          if (nm.includes('Stargate_InnerRing')) animatedRefs.stargateInner = child;
          if (nm.includes('Dyson_Ring')) animatedRefs.dysonRings.push(child);
          if (nm.includes('Astrolabe_Ring') || nm.includes('Clockwork_Astrolabe_Arch')) {
            animatedRefs.astrolabeRings.push(child);
          }
          if (nm.includes('Clockwork_Gear')) animatedRefs.clockworkGears.push(child);
          if (nm.includes('Orrery_Ring')) animatedRefs.orreryRings.push(child);
          if (nm.includes('SkyIsland_')) animatedRefs.skyIslands.push(child);
          if (nm.includes('Planet_Thalassa') || nm.includes('Planet_Pyros')) {
            animatedRefs.planets.push(child);
          }
        });
        worldGroup.add(root);
        setGlbLoaded(true);
      },
      undefined,
      (err) => {
        console.warn('[UniverseHero3DStage] GLB fallback active:', err);
      }
    );

    // 3. Real-Time Volumetric Shaders per Universe (100% WebGL 1.0 / ANGLE compliant: smoothstep(low, high, x) strictly!)
    if (activeUniverseId === 'STARGATE_ODYSSEY') {
      // 3A. Expansive Multi-Octave Domain-Warped Volumetric Nebula Curtain Planes in 3D Space
      const nebulaUni = { uTime: { value: 0 } };
      shaderUniformsList.push(nebulaUni);

      const nebulaMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: nebulaUni,
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec2 vUv;
          uniform float uTime;

          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
          }

          float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
              mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
              u.y
            );
          }

          float fbm(vec2 p) {
            float v = 0.0;
            float a = 0.5;
            mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
            for (int i = 0; i < 6; i++) {
              v += a * noise(p);
              p = rot * p * 2.04 + vec2(1.7, 9.2);
              a *= 0.5;
            }
            return v;
          }

          void main() {
            vec2 uv = vUv * 2.0 - 1.0;
            vec2 q = vec2(
              fbm(uv * 1.6 + vec2(uTime * 0.03, -uTime * 0.02)),
              fbm(uv * 1.6 + vec2(4.2, 1.3))
            );
            vec2 r = vec2(
              fbm(uv * 2.2 + 2.2 * q + vec2(1.7, 9.2) + uTime * 0.04),
              fbm(uv * 2.2 + 2.2 * q + vec2(8.3, 2.8) - uTime * 0.03)
            );
            float f = fbm(uv * 2.0 + 2.5 * r);

            // Edge vignette so nebula planes blend seamlessly into deep space
            float radial = length(uv * vec2(0.75, 1.0));
            float mask = (1.0 - smoothstep(0.25, 0.98, radial)) * smoothstep(0.18, 0.78, f);

            vec3 colSapphire = vec3(0.04, 0.22, 0.68);
            vec3 colCyan     = vec3(0.05, 0.88, 1.00);
            vec3 colMagenta  = vec3(0.68, 0.12, 0.58);
            vec3 colGold     = vec3(1.00, 0.65, 0.16);

            vec3 col = mix(colSapphire, colCyan, clamp(f * f * 2.2, 0.0, 1.0));
            col = mix(col, colMagenta, clamp(length(q) * 0.85, 0.0, 1.0));
            col += colGold * pow(clamp(r.x * f * 1.45, 0.0, 1.0), 3.0) * 1.6;

            gl_FragColor = vec4(col * 0.55, mask * 0.52);
          }
        `,
      });

      const nebulaPlane1 = new THREE.Mesh(new THREE.PlaneGeometry(28, 14), nebulaMat);
      nebulaPlane1.position.set(0, 0.8, -5.2);
      worldGroup.add(nebulaPlane1);

      const nebulaPlane2 = new THREE.Mesh(new THREE.PlaneGeometry(22, 11), nebulaMat);
      nebulaPlane2.position.set(0, 0.3, -2.6);
      nebulaPlane2.rotation.z = 0.12;
      worldGroup.add(nebulaPlane2);

      // 3B. Stargate Quantum Event Horizon "Kawoosh" Vortex Shader inside the Blender Stargate Ring
      const vortexUni = { uTime: { value: 0 } };
      shaderUniformsList.push(vortexUni);
      const vortexMat = new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: vortexUni,
        vertexShader: `
          varying vec2 vUv;
          uniform float uTime;
          void main() {
            vUv = uv;
            vec3 pos = position;
            float r = length(uv - 0.5) * 2.0;
            float kawoosh = sin(r * 14.0 - uTime * 5.2) * (1.0 - smoothstep(0.0, 0.95, r)) * 0.24;
            pos.z += kawoosh;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,
        fragmentShader: `
          varying vec2 vUv;
          uniform float uTime;
          void main() {
            vec2 p = (vUv - 0.5) * 2.0;
            float r = length(p);
            if (r > 1.0) discard;
            float a = atan(p.y, p.x);
            float swirl = sin(r * 20.0 - uTime * 5.5 + a * 4.0) * 0.5 + 0.5;
            float caustic = sin(r * 34.0 + uTime * 3.8 - a * 6.0) * 0.5 + 0.5;
            vec3 deep = vec3(0.03, 0.18, 0.55);
            vec3 cyan = vec3(0.12, 0.95, 1.0);
            vec3 core = vec3(0.95, 0.98, 1.0);
            vec3 col = mix(deep, cyan, swirl * 0.78 + caustic * 0.32);
            col = mix(col, core, (1.0 - smoothstep(0.0, 0.42, r)) * 0.92);
            float alpha = (1.0 - smoothstep(0.86, 1.0, r)) * 0.92;
            gl_FragColor = vec4(col, alpha);
          }
        `,
      });
      const vortexDisc = new THREE.Mesh(new THREE.CircleGeometry(2.22, 64), vortexMat);
      vortexDisc.position.set(0, 0.35, 0.02);
      worldGroup.add(vortexDisc);
    } else if (activeUniverseId === 'KINGDOM_CHRONICLES') {
      // Warm flickering candle point lights & Cathedral Volumetric God-Ray Shafts
      const candleLight1 = new THREE.PointLight('#ff9f1c', 4.5, 18);
      candleLight1.position.set(-6.5, 2.2, 3.2);
      worldGroup.add(candleLight1);

      const candleLight2 = new THREE.PointLight('#ff9f1c', 4.5, 18);
      candleLight2.position.set(6.5, 2.2, 3.2);
      worldGroup.add(candleLight2);

      const magmaLight = new THREE.PointLight('#ff3b00', 5.0, 10);
      magmaLight.position.set(-4.4, 1.2, -2.0);
      worldGroup.add(magmaLight);

      const godRayUni = { uTime: { value: 0 } };
      shaderUniformsList.push(godRayUni);
      const godRayMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: godRayUni,
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec2 vUv;
          uniform float uTime;
          void main() {
            float beam1 = sin((vUv.x * 14.0 + vUv.y * 5.0) + uTime * 0.4) * 0.5 + 0.5;
            float beam2 = sin((vUv.x * 23.0 - vUv.y * 4.0) - uTime * 0.3) * 0.5 + 0.5;
            float rays = pow(beam1 * beam2, 2.2);
            float fadeY = smoothstep(0.0, 0.35, vUv.y) * (1.0 - smoothstep(0.65, 1.0, vUv.y));
            float fadeX = smoothstep(0.0, 0.25, vUv.x) * (1.0 - smoothstep(0.75, 1.0, vUv.x));
            vec3 gold = vec3(1.0, 0.76, 0.28);
            gl_FragColor = vec4(gold, rays * fadeY * fadeX * 0.28);
          }
        `,
      });
      const godRayPlane = new THREE.Mesh(new THREE.PlaneGeometry(22, 11), godRayMat);
      godRayPlane.position.set(0, 2.2, -2.5);
      worldGroup.add(godRayPlane);
    } else {
      // AETHER_ARCHIPELAGO: Satsuei Aurora Borealis Ribbon Shader + Arched 3D Ley-Line Bridges
      const auroraUni = { uTime: { value: 0 } };
      shaderUniformsList.push(auroraUni);
      const auroraMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: auroraUni,
        vertexShader: `
          varying vec2 vUv;
          uniform float uTime;
          void main() {
            vUv = uv;
            vec3 pos = position;
            pos.z += sin(pos.x * 0.65 + uTime * 1.3) * 0.55;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,
        fragmentShader: `
          varying vec2 vUv;
          uniform float uTime;
          void main() {
            float wave = sin(vUv.x * 18.0 + uTime * 1.8) * 0.5 + 0.5;
            float curtain = smoothstep(0.0, 0.35, vUv.y) * (1.0 - smoothstep(0.45, 1.0, vUv.y));
            vec3 emerald = vec3(0.12, 0.96, 0.72);
            vec3 violet  = vec3(0.72, 0.32, 1.00);
            vec3 col = mix(emerald, violet, wave);
            gl_FragColor = vec4(col, curtain * (0.28 + wave * 0.32));
          }
        `,
      });
      const auroraMesh = new THREE.Mesh(new THREE.PlaneGeometry(28, 5.5, 64, 16), auroraMat);
      auroraMesh.position.set(0, 4.2, -4.2);
      worldGroup.add(auroraMesh);

      // Arched 3D Ley-Line Light Bridges connecting Central Sanctuary to Outer Sky-Islands
      const outerPositions = [
        new THREE.Vector3(-5.6, 1.15, -2.0),
        new THREE.Vector3(5.8, 1.35, -2.2),
        new THREE.Vector3(-3.8, -0.85, 2.2),
        new THREE.Vector3(4.2, -0.65, 2.0),
      ];
      const centerPos = new THREE.Vector3(0, 0.25, 0);
      outerPositions.forEach((p) => {
        const mid = centerPos.clone().lerp(p, 0.5);
        mid.y += 1.45;
        const curve = new THREE.QuadraticBezierCurve3(centerPos, mid, p);
        const tubeGeo = new THREE.TubeGeometry(curve, 36, 0.055, 8, false);
        const tubeMat = new THREE.MeshBasicMaterial({
          color: '#2dd4bf',
          transparent: true,
          opacity: 0.85,
        });
        worldGroup.add(new THREE.Mesh(tubeGeo, tubeMat));
      });
    }

    // 4. 3D Node Beacons mapped to Plajah Worlds Canon Sectors
    const beaconEntries: {
      id: string;
      node: Universe3DNode;
      group: THREE.Group;
      ring: THREE.Mesh;
      basePos: THREE.Vector3;
    }[] = [];

    preset.nodes.forEach((node, idx) => {
      const wp = getNodeWorldPos(node, idx);
      const bGroup = new THREE.Group();
      bGroup.position.copy(wp);

      const coreGeo = new THREE.OctahedronGeometry(idx === 0 ? 0.26 : 0.20, 1);
      const coreMat = new THREE.MeshStandardMaterial({
        color: node.primaryColor || preset.accentHex,
        emissive: node.primaryColor || preset.accentHex,
        emissiveIntensity: 2.2,
        roughness: 0.15,
        metalness: 0.85,
      });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.userData = { nodeId: node.id };
      bGroup.add(coreMesh);

      const ringGeo = new THREE.RingGeometry(0.32, 0.42, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: node.secondaryColor || '#ffffff',
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.88,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.userData = { nodeId: node.id };
      bGroup.add(ringMesh);

      worldGroup.add(bGroup);
      beaconEntries.push({
        id: node.id,
        node,
        group: bGroup,
        ring: ringMesh,
        basePos: wp.clone(),
      });
    });

    // 5. Pilotable Overworld Vessel (Star-Skiff / Clockwork Envoy / Sora-Maru)
    const vesselGroup = new THREE.Group();
    const hullGeo = new THREE.ConeGeometry(0.18, 0.68, 6);
    hullGeo.rotateX(Math.PI / 2);
    const hullMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      emissive: preset.accentHex,
      emissiveIntensity: 1.6,
      metalness: 0.9,
      roughness: 0.15,
    });
    vesselGroup.add(new THREE.Mesh(hullGeo, hullMat));
    vesselGroup.position.set(0, 0.35, 1.8);
    worldGroup.add(vesselGroup);

    // 6. 3,200-Star 3D Parallax Starfield / Atmospheric Motes
    const starCount = activeUniverseId === 'STARGATE_ODYSSEY' ? 3600 : 1200;
    const starGeo = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    const palette = [
      new THREE.Color('#67e8f9'),
      new THREE.Color('#ffffff'),
      new THREE.Color('#fde68a'),
      new THREE.Color('#c084fc'),
    ];
    for (let i = 0; i < starCount; i++) {
      starPositions[i * 3] = (Math.random() - 0.5) * 44;
      starPositions[i * 3 + 1] = (Math.random() - 0.5) * 24;
      starPositions[i * 3 + 2] = (Math.random() - 0.5) * 22 - 2.0;
      const c = palette[i % palette.length];
      starColors[i * 3] = c.r;
      starColors[i * 3 + 1] = c.g;
      starColors[i * 3 + 2] = c.b;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    const starMat = new THREE.PointsMaterial({
      size: activeUniverseId === 'STARGATE_ODYSSEY' ? 0.11 : 0.085,
      vertexColors: true,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
    });
    const starField = new THREE.Points(starGeo, starMat);
    scene.add(starField);

    // Mouse Orbit & Raycast Selection
    let isDragging = false;
    let prevX = 0;
    let prevY = 0;
    let orbitYaw = 0;
    let orbitPitch = 0;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerDown = (e: MouseEvent) => {
      isDragging = true;
      prevX = e.clientX;
      prevY = e.clientY;
    };

    const onPointerMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (isDragging) {
        const dx = e.clientX - prevX;
        const dy = e.clientY - prevY;
        prevX = e.clientX;
        prevY = e.clientY;
        orbitYaw = Math.max(-0.58, Math.min(0.58, orbitYaw - dx * 0.0038));
        orbitPitch = Math.max(-0.35, Math.min(0.35, orbitPitch - dy * 0.0028));
      }
    };

    const onPointerUp = (e: MouseEvent) => {
      const moved = Math.hypot(e.clientX - prevX, e.clientY - prevY);
      isDragging = false;
      if (moved < 6) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const meshes: THREE.Object3D[] = [];
        beaconEntries.forEach((b) => b.group.children.forEach((c) => meshes.push(c)));
        const hits = raycaster.intersectObjects(meshes, true);
        if (hits.length > 0) {
          const hitId = hits[0].object.userData?.nodeId;
          const found = preset.nodes.find((n) => n.id === hitId);
          if (found) handleSelectNode(found);
        }
      }
    };

    const domElem = renderer.domElement;
    domElem.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);

    let animId = 0;
    let frameCounter = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      frameCounter++;

      shaderUniformsList.forEach((u) => {
        u.uTime.value = t;
      });

      // Animate Blender 5.0.1 .GLB sub-assemblies
      if (animatedRefs.stargateInner) {
        animatedRefs.stargateInner.rotation.z = t * 0.32;
      }
      animatedRefs.dysonRings.forEach((r, idx) => {
        r.rotation.z = t * (0.28 + idx * 0.12) * (idx % 2 === 0 ? 1 : -1);
        r.rotation.x += 0.002;
      });
      animatedRefs.astrolabeRings.forEach((r, idx) => {
        r.rotation.y = t * 0.18 * (idx % 2 === 0 ? 1 : -1);
      });
      animatedRefs.clockworkGears.forEach((g, idx) => {
        g.rotation.y = t * (idx === 0 ? 0.35 : -0.55);
      });
      animatedRefs.orreryRings.forEach((o, idx) => {
        o.rotation.y = t * (0.35 + idx * 0.14) * (idx % 2 === 0 ? 1 : -1);
        o.rotation.z = Math.sin(t * 0.5 + idx) * 0.35;
      });
      animatedRefs.skyIslands.forEach((isl, idx) => {
        isl.position.y += Math.sin(t * 1.3 + idx * 1.4) * 0.0012;
      });
      animatedRefs.planets.forEach((pl, idx) => {
        pl.rotation.y = t * (0.16 + idx * 0.08);
      });

      // Camera smooth interpolation
      const targetPos = cameraTargetRef.current.pos.clone();
      targetPos.x += Math.sin(orbitYaw) * 4.2;
      targetPos.y += orbitPitch * 3.0;
      camera.position.lerp(targetPos, 0.06);
      camera.lookAt(cameraTargetRef.current.lookAt);

      // Pilotable Vessel flight toward selected node
      const vTarget = cameraTargetRef.current.vesselTarget.clone();
      vTarget.y += 0.38 + Math.sin(t * 3.0) * 0.08;
      vTarget.z += 0.55;
      vesselGroup.position.lerp(vTarget, 0.05);

      starField.rotation.y = t * 0.015;

      // Update beacons & project 2D HUD coordinates
      const nextProj: { id: string; x: number; y: number; visible: boolean }[] = [];
      const curW = container.clientWidth || width;
      const curH = container.clientHeight || height;

      beaconEntries.forEach((b, idx) => {
        b.group.position.y = b.basePos.y + Math.sin(t * 2.2 + idx) * 0.08;
        b.group.children[0].rotation.y = t * 1.4;
        b.ring.scale.setScalar(1.0 + Math.sin(t * 3.2 + idx) * 0.14);

        const worldV = b.group.position.clone();
        worldV.project(camera);
        const sx = (worldV.x * 0.5 + 0.5) * curW;
        const sy = (-worldV.y * 0.5 + 0.5) * curH;
        nextProj.push({
          id: b.id,
          x: sx,
          y: sy,
          visible: worldV.z < 1.0 && sx > 30 && sx < curW - 30 && sy > 30 && sy < curH - 30,
        });
      });

      if (frameCounter % 3 === 0) {
        setScreenBeacons(nextProj);
      }

      // Render through UnrealBloomPass Composer
      composer.render();
    };

    animate();

    const onResize = () => {
      if (!container) return;
      const nw = Math.max(320, container.clientWidth);
      const nh = Math.max(420, container.clientHeight);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
      composer.setSize(nw, nh);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animId);
      domElem.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
    };
  }, [activeUniverseId, preset]);

  const lensFilterStyle = useMemo((): React.CSSProperties => {
    switch (renderLens) {
      case 'SATSUEI_ANIME':
        return { filter: 'saturate(1.42) contrast(1.14) brightness(1.06)' };
      case 'HD2D_DIORAMA':
        return { filter: 'contrast(1.22) saturate(1.28) sepia(0.10)' };
      case 'CRT_16BIT':
        return { filter: 'contrast(1.32) saturate(1.35)' };
      default:
        return { filter: 'contrast(1.08) saturate(1.15)' };
    }
  }, [renderLens]);

  return (
    <div className="relative w-full h-[670px] lg:h-[750px] rounded-3xl overflow-hidden border border-white/15 bg-[#02040a] shadow-[0_30px_100px_rgba(0,0,0,0.9)] select-none">
      {/* 3D WebGL Canvas + UnrealBloomPass */}
      <div
        ref={mountRef}
        style={lensFilterStyle}
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* Optional 16-Bit Mode-7 CRT Scanlines Overlay */}
      {renderLens === 'CRT_16BIT' && (
        <div
          className="pointer-events-none absolute inset-0 z-10 opacity-35"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, rgba(0,0,0,0.65) 0px, rgba(0,0,0,0.65) 1px, transparent 1px, transparent 3px)',
          }}
        />
      )}

      {/* Optional HD-2D Tilt-Shift Depth Blur Vignette */}
      {renderLens === 'HD2D_DIORAMA' && (
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            boxShadow: 'inset 0 0 120px 45px rgba(0,0,0,0.82)',
          }}
        />
      )}

      {/* Projected 3D Interactive Node Beacons */}
      <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
        {screenBeacons.map((b) => {
          if (!b.visible) return null;
          const node = preset.nodes.find((n) => n.id === b.id);
          if (!node) return null;
          const nIdx = preset.nodes.findIndex((n) => n.id === b.id);
          const sectorMeta = NODE_CANON_SECTORS[Math.max(0, nIdx) % NODE_CANON_SECTORS.length];
          const isSelected = activeNode?.id === node.id;
          const isHovered = hoveredNodeId === node.id;
          return (
            <button
              key={node.id}
              type="button"
              onClick={() => handleSelectNode(node)}
              onMouseEnter={() => setHoveredNodeId(node.id)}
              onMouseLeave={() => setHoveredNodeId(null)}
              style={{
                transform: `translate3d(${b.x}px, ${b.y}px, 0) translate(-50%, -100%)`,
              }}
              className={`pointer-events-auto absolute top-0 left-0 group flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md border transition-all duration-200 ${
                isSelected
                  ? 'bg-black/85 border-cyan-400 text-white scale-110 shadow-[0_0_30px_rgba(34,211,238,0.55)]'
                  : isHovered
                  ? 'bg-black/80 border-white/60 text-white scale-105'
                  : 'bg-black/60 border-white/20 text-white/85 hover:border-white/50'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full animate-pulse"
                style={{ backgroundColor: node.primaryColor || preset.accentHex }}
              />
              <div className="text-left">
                <span className="block text-[11px] font-bold tracking-wide whitespace-nowrap leading-tight">
                  {node.name}
                </span>
                <span className="block text-[8px] font-mono uppercase tracking-widest text-cyan-300/80">
                  {sectorMeta.sectorLabel}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Clean Production Top HUD Bar */}
      <div className="relative z-30 flex flex-wrap items-center justify-between gap-3 px-6 pt-5">
        <div>
          {isWorldDetailCover && onBackToAllWorlds && (
            <button
              type="button"
              onClick={onBackToAllWorlds}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-black/75 backdrop-blur-xl border border-white/15 text-white hover:bg-white/20 transition-all flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              All Worlds
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={resetCamera}
            className="px-3.5 py-2 rounded-2xl bg-black/70 hover:bg-black/90 border border-white/15 text-white/80 hover:text-white text-xs font-bold backdrop-blur-xl transition-all flex items-center gap-1.5"
            title="Reset 3D Camera Orbit"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Camera</span>
          </button>
        </div>
      </div>

      {/* Left Bottom World Title & Live Plajah World Canon Counters */}
      <div className="pointer-events-none absolute bottom-6 left-6 z-30 max-w-lg">
        <div className="pointer-events-auto bg-black/75 backdrop-blur-2xl border border-white/15 rounded-2xl p-5 space-y-3 shadow-2xl">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-cyan-300">
            <Sparkles className="w-3.5 h-3.5" />
            <span>INTERACTIVE 3D WORLD OVERWORLD</span>
          </div>
          <h2 className="text-2xl lg:text-3xl font-black text-white tracking-tight leading-tight">
            {worldTitle || preset.name}
          </h2>
          <p className="text-xs text-white/75 leading-relaxed">
            {worldTagline || preset.tagline}
          </p>

          {/* Quick Jump Pills to Real Plajah Worlds Tabs (Overview, Characters, Lore, Timeline, Graph, World Hub) */}
          {onJumpToWorldTab && (
            <div className="pt-2 border-t border-white/10">
              <div className="text-[9px] font-mono uppercase tracking-widest text-white/40 mb-2">
                World Source Code Active · Jump to Canon Sector
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'Overview' as const, label: 'Overview', icon: Layers },
                  {
                    id: 'Characters' as const,
                    label: worldStats ? `Characters (${worldStats.characters})` : 'Characters',
                    icon: Users,
                  },
                  {
                    id: 'Lore' as const,
                    label: worldStats ? `Lore (${worldStats.lore})` : 'Lore & Realms',
                    icon: Scroll,
                  },
                  {
                    id: 'Timeline' as const,
                    label: worldStats ? `Timeline (${worldStats.timeline})` : 'Timeline',
                    icon: History,
                  },
                  { id: 'Graph' as const, label: 'Neural Graph', icon: Network },
                  { id: 'WorldHub' as const, label: 'Story Intel & Hub', icon: Cpu },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onJumpToWorldTab(item.id)}
                    className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-cyan-500/25 border border-white/10 hover:border-cyan-400/40 text-[10px] font-bold text-white/85 hover:text-white transition-all flex items-center gap-1"
                  >
                    <item.icon className="w-3 h-3 text-cyan-300" />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Bottom Selected 3D Node Dossier & Studio Launchers */}
      {activeNode && (
        <div className="pointer-events-none absolute bottom-6 right-6 z-30 w-full max-w-sm">
          <div className="pointer-events-auto bg-black/80 backdrop-blur-2xl border border-white/15 rounded-2xl p-5 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-amber-300">
                {activeNode.regionType} · {activeSectorMeta.sectorLabel}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                Story Intel {activeNode.storyIntelScore}%
              </span>
            </div>

            <div>
              <h3 className="text-lg font-black text-white leading-snug">
                {activeNode.name}
              </h3>
              <p className="text-[11px] text-white/60">{activeNode.subtitle}</p>
            </div>

            <p className="text-xs text-white/80 leading-relaxed line-clamp-3">
              {activeNode.synopsis}
            </p>

            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="bg-white/5 rounded-xl p-2 text-center border border-white/10">
                <div className="text-sm font-black text-white">
                  {activeNode.stats.characters}
                </div>
                <div className="text-[9px] uppercase tracking-wider text-white/50">
                  Characters
                </div>
              </div>
              <div className="bg-white/5 rounded-xl p-2 text-center border border-white/10">
                <div className="text-sm font-black text-white">
                  {activeNode.stats.locations}
                </div>
                <div className="text-[9px] uppercase tracking-wider text-white/50">
                  Locations
                </div>
              </div>
              <div className="bg-white/5 rounded-xl p-2 text-center border border-white/10">
                <div className="text-sm font-black text-white">
                  {activeNode.stats.loreEntries}
                </div>
                <div className="text-[9px] uppercase tracking-wider text-white/50">
                  Lore Rules
                </div>
              </div>
            </div>

            {/* Action Buttons: Jump to World Canon Sector or Open in Studio */}
            <div className="pt-2 flex flex-wrap items-center gap-1.5">
              {onJumpToWorldTab && (
                <button
                  type="button"
                  onClick={() => onJumpToWorldTab(activeSectorMeta.tab)}
                  className="px-3 py-1.5 rounded-lg bg-cyan-500 text-slate-950 hover:bg-cyan-400 text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1"
                >
                  <Play className="w-3 h-3 fill-current" />
                  Open {activeSectorMeta.tab}
                </button>
              )}
              {onEnterNodeOrWorld && (
                <button
                  type="button"
                  onClick={() => onEnterNodeOrWorld(activeNode)}
                  className="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1"
                >
                  Explore World
                  <ChevronRight className="w-3 h-3" />
                </button>
              )}
              {activeNode.linkedStudios.slice(0, 3).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => onOpenStudio?.(st, activeNode)}
                  className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-[9px] font-mono uppercase tracking-wider text-cyan-200 border border-white/10 transition-all flex items-center gap-1"
                >
                  <span>{st.replace('_', ' ')}</span>
                  <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Council Debate & Headless Blender 5.0.1 Pipeline Drawer */}
      {showCouncilDebate && (
        <div className="absolute inset-x-6 top-20 z-40 max-h-[500px] overflow-y-auto bg-black/90 backdrop-blur-2xl border border-amber-400/30 rounded-2xl p-6 text-white shadow-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-amber-300">
                ART COUNCIL × ANIMATOR COUNCIL × GAME DEVELOPER COUNCIL × HEADLESS BLENDER 5.0.1
              </span>
              <h3 className="text-lg font-black">
                {blueprint.title} — Production Pipeline & Specialist Verdict
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setShowCouncilDebate(false)}
              className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {GAME_COUNCIL_LIST.map((sp) => (
              <div
                key={sp.id}
                className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1.5"
              >
                <div className="text-[10px] font-mono uppercase text-cyan-300">
                  {sp.title}
                </div>
                <div className="text-sm font-bold text-white">{sp.name}</div>
                <div className="text-[11px] text-white/65 leading-relaxed">
                  {sp.eraMastery}
                </div>
                <div className="text-[10px] text-amber-300/90 italic pt-1">
                  "{sp.signatureDirective}"
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default UniverseHero3DStage;
