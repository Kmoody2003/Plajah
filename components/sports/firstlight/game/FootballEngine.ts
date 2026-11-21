import { loadStadiumEnvironment } from './PhotographicMaterials';
import { RouteOverlay, orderedTargets } from './RouteOverlay';
import { evaluateFieldGoal, resolveCatch } from './PassRules';
import { movementVelocity, movementHeading } from './Movement';
import * as THREE from 'three';
import { FIELD, PHYSICS } from './constants';
import { FieldBuilder } from './FieldBuilder';
import { PlayerMeshBuilder, PlayerMeshParts } from './PlayerModel';
import {
  preloadRiggedFootballCharacters,
  registerMotionStudioClip,
  loadMotionStudioClipFromUrl,
  type FootballMotionState,
} from './RiggedPlayerLoader';
import type { MotionClip } from '../../../../services/mocap/types';
import { FootballPhysics } from './FootballPhysics';
import { soundManager } from '../audio/SoundManager';
import { cloneTeam, resolveMatchupKits } from './leagueData';
import { getGameplayTuning, GameplayTuning } from './SkillConfig';
import {
  buildDefenseRosterForPlay,
  buildOffenseRosterForPlay,
  chooseCpuDefensePlay,
  chooseCpuOffensePlay,
  getOffensivePlayDef,
} from './playbook';
import {
  applyArcadeEvent,
  createEmptyBoxScore,
  createInitialArcadeState,
  formatDownLabel,
  formatGameClock,
  formatYardSpot,
} from './GameRules';
import {
  ArcadeState,
  CameraViewMode,
  ControlSideMode,
  DefensePlayType,
  DriveState,
  GameMode,
  KickMeterState,
  MatchBoxScore,
  PlayOutcome,
  PlayStyleMode,
  PlayType,
  Player3D,
  PlayerActionMove,
  PlayerMovementInput,
  ReceiverRoute,
  SkillLevel,
  TeamInfo,
  WeatherPreset,
} from '../types';

export interface MatchConfig {
  userTeamId: string;
  cpuTeamId: string;
  playStyle: PlayStyleMode;
  skillLevel: SkillLevel;
  controlSide: ControlSideMode;
  quarterLengthSeconds: number;
  weather?: WeatherPreset;
  playerMode?: 'ATHLETE' | 'BLOCK';
}

interface ReplaySnapshot {
  ballPos: [number, number, number];
  ballVisible: boolean;
  players: Record<string, [number, number, number, number]>;
}

export class FootballEngine {
  public playerMode: 'BLOCK' | 'ATHLETE' = 'ATHLETE';
  private simulationRemainder = 0;
  private hudElapsed = 0;
  private environmentMap?: THREE.WebGLRenderTarget;
  private destroyed = false;
  public showRoutes = true;
  public routes = new RouteOverlay();
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public fieldBuilder: FieldBuilder;
  public footballPhysics!: FootballPhysics;

  // Game & Match State
  public gameMode: GameMode = 'MENU';
  public driveState: DriveState;
  public arcadeState: ArcadeState = createInitialArcadeState();
  public kickMeter: KickMeterState = {
    active: false,
    kind: 'FG',
    phase: 'POWER',
    power: 0,
    accuracy: 0,
    distanceYards: 35,
    windX: 0,
  };
  public boxScore: MatchBoxScore = createEmptyBoxScore();
  public currentPlayType: PlayType = 'PASS_SLANTS';
  public currentDefensePlay: DefensePlayType = 'DEF_COVER_2';
  public cameraMode: CameraViewMode = 'BEHIND_QB';
  public weatherPreset: WeatherPreset = 'AURORA';
  public isGuidedMode: boolean = true;
  public playStyle: PlayStyleMode = 'SIMULATION';
  public skillLevel: SkillLevel = 'PRO';
  public controlSide: ControlSideMode = 'FULL_GAME';
  public tuning: GameplayTuning = getGameplayTuning('PRO', 'SIMULATION');

  // Teams (Persistent across possession flips!)
  public userTeam: TeamInfo = cloneTeam('AURORA');
  public cpuTeam: TeamInfo = cloneTeam('CURRENT');
  private activeOffenseKit: TeamInfo = this.userTeam;
  private activeDefenseKit: TeamInfo = this.cpuTeam;

  // Pocket, Play Execution & Timers
  public pocketTimeRemaining: number = PHYSICS.POCKET_TIME_LIMIT;
  public isBallSnapped: boolean = false;
  public isPassInAir: boolean = false;
  private isKickInAir: boolean = false;
  private kickTargetZ: number = 60;
  private kickAccuracyOffsetX: number = 0;
  private thrownReceiver: Player3D | null = null;
  private passLandingPos: THREE.Vector3 | null = null;
  public targetReceiverIndex: number = 0;
  public selectedTargetReceiver: Player3D | null = null;
  public activeBallCarrier: Player3D | null = null;
  public userControlledDefender: Player3D | null = null;
  public jukeActiveTimer: number = 0;
  private moveCooldown: number = 0;
  private playElapsed: number = 0;
  private handoffTimer: number = 0;
  private handoffDone: boolean = false;
  private cpuThrowTimer: number = 0;
  private cpuAutoSnapTimer: number = 0;
  private clockRunning: boolean = false;
  private kickMeterDir: number = 1;
  private cameraShakeTimer: number = 0;
  private cameraShakeIntensity: number = 0;
  private playFlipped: boolean = false;
  private isTwoPointAttempt: boolean = false;
  private isPatKickAttempt: boolean = false;

  // Instant Replay Buffer
  private replayFrames: ReplaySnapshot[] = [];
  private replayCaptureTimer: number = 0;
  public isReplaying: boolean = false;
  private replayPlaybackIdx: number = 0;
  private replayPlaybackAccum: number = 0;

  // Player Input
  public playerInput: PlayerMovementInput = {
    forward: 0,
    lateral: 0,
    sprint: false,
    juke: false,
    spin: false,
    truck: false,
    dive: false,
  };

  // Players & 3D Meshes
  public offensePlayers: Player3D[] = [];
  public defensePlayers: Player3D[] = [];
  public playerMeshes: Map<string, PlayerMeshParts> = new Map();

  // Internal Animation & Loop
  private animClock: THREE.Clock = new THREE.Clock();
  private animId: number = 0;
  private container: HTMLElement;
  private activeFootballMesh!: THREE.Mesh;
  private dirLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;

  // Callbacks to React UI
  public onStateChange?: (
    state: DriveState,
    gameMode: GameMode,
    pocketTime: number,
    hasBallCarrier: boolean,
    arcade: ArcadeState,
    kickMeter: KickMeterState,
    boxScore: MatchBoxScore
  ) => void;
  public onPlayEnd?: (outcome: PlayOutcome) => void;
  public onReceiverStatusUpdate?: (receivers: ReceiverRoute[]) => void;
  public invertControls: boolean = false;

  constructor(container: HTMLElement) {
    this.container = container;

    this.scene = new THREE.Scene();
    this.scene.add(this.routes.group);
    this.scene.background = new THREE.Color(0x0a0e1a);

    const aspect = container.clientWidth / (container.clientHeight || 1);
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
    this.camera.position.set(0, 5.5, -28);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.fieldBuilder = new FieldBuilder();
    this.fieldBuilder.buildField(this.scene, this.userTeam, this.cpuTeam, this.playStyle);

    this.activeFootballMesh = PlayerMeshBuilder.createFootball();
    this.scene.add(this.activeFootballMesh);
    this.footballPhysics = new FootballPhysics(this.activeFootballMesh);

    this.driveState = {
      down: 1,
      yardsToGo: 10,
      ballYardLine: 25,
      playClock: 25,
      quarter: 1,
      timeRemaining: '3:00',
      gameClockSeconds: 180,
      quarterLengthSeconds: 180,
      offenseTeam: this.userTeam,
      defenseTeam: this.cpuTeam,
      homeTeam: this.userTeam,
      awayTeam: this.cpuTeam,
      possession: 'USER',
      playStyle: this.playStyle,
      skillLevel: this.skillLevel,
      controlSide: this.controlSide,
      isRedZone: false,
      driveYards: 0,
      playsInDrive: 1,
      patPending: false,
    };

    this.setupLighting();
    loadStadiumEnvironment(this.renderer, this.scene)
      .then((map) => {
        if (this.destroyed) map.dispose();
        else this.environmentMap = map;
      })
      .catch(() => {});

    // Preload Plajah Character Forge rigged football GLBs (qb, skill, power, lineman)
    preloadRiggedFootballCharacters()
      .then(() => {
        if (!this.destroyed && this.playerMode === 'ATHLETE' && this.offensePlayers.length > 0) {
          this.setPlayerMode('ATHLETE');
        }
      })
      .catch(() => {});

    window.addEventListener('resize', this.handleResize);
    this.animate();
  }

  /** Binds a Plajah Motion Studio `MotionClip` JSON (or URL) directly onto the 58-joint contract rig. */
  public async loadMotionStudioClip(
    state: FootballMotionState,
    clipOrUrl: MotionClip | string
  ): Promise<boolean> {
    if (typeof clipOrUrl === 'string') {
      return loadMotionStudioClipFromUrl(state, clipOrUrl);
    }
    registerMotionStudioClip(state, clipOrUrl);
    return true;
  }

  public startNewMatch(config: MatchConfig): void {
    this.userTeam = cloneTeam(config.userTeamId);
    this.cpuTeam = cloneTeam(config.cpuTeamId);
    if (this.userTeam.id === this.cpuTeam.id) {
      this.cpuTeam = cloneTeam(this.userTeam.id === 'AURORA' ? 'CURRENT' : 'AURORA');
    }

    this.playStyle = config.playStyle;
    this.skillLevel = config.skillLevel;
    this.controlSide = config.controlSide;
    this.tuning = getGameplayTuning(this.skillLevel, this.playStyle);
    this.isGuidedMode = this.tuning.autoCoachTips;
    if (config.playerMode) this.playerMode = config.playerMode;

    const weather = config.weather || (this.userTeam as { defaultWeather?: WeatherPreset }).defaultWeather || 'AURORA';
    this.setWeather(weather);
    this.fieldBuilder.rebuildFieldForMatchup(this.userTeam, this.cpuTeam, this.playStyle);

    this.arcadeState = createInitialArcadeState();
    this.boxScore = createEmptyBoxScore();
    this.isTwoPointAttempt = false;
    this.isPatKickAttempt = false;
    this.isReplaying = false;
    this.replayFrames = [];

    this.driveState = {
      down: 1,
      yardsToGo: 10,
      ballYardLine: 25,
      playClock: 25,
      quarter: 1,
      timeRemaining: formatGameClock(config.quarterLengthSeconds),
      gameClockSeconds: config.quarterLengthSeconds,
      quarterLengthSeconds: config.quarterLengthSeconds,
      offenseTeam: this.userTeam,
      defenseTeam: this.cpuTeam,
      homeTeam: this.userTeam,
      awayTeam: this.cpuTeam,
      possession: 'USER',
      playStyle: this.playStyle,
      skillLevel: this.skillLevel,
      controlSide: this.controlSide,
      isRedZone: false,
      driveYards: 0,
      playsInDrive: 1,
      patPending: false,
    };

    this.currentPlayType = 'PASS_SLANTS';
    this.currentDefensePlay = 'DEF_COVER_2';
    this.setupPlay(this.currentPlayType, this.currentDefensePlay);
    this.notifyState();
  }

  public setSkillLevel(skill: SkillLevel): void {
    this.skillLevel = skill;
    this.tuning = getGameplayTuning(this.skillLevel, this.playStyle);
    this.driveState.skillLevel = skill;
    this.notifyState();
  }

  public setPlayStyle(style: PlayStyleMode): void {
    this.playStyle = style;
    this.tuning = getGameplayTuning(this.skillLevel, this.playStyle);
    this.driveState.playStyle = style;
    this.fieldBuilder.rebuildFieldForMatchup(this.userTeam, this.cpuTeam, style);
    this.notifyState();
  }

  public callTimeout(): void {
    const team = this.userTeam;
    if ((team.timeouts ?? 0) <= 0) return;
    team.timeouts = (team.timeouts ?? 3) - 1;
    this.clockRunning = false;
    this.driveState.playClock = 25;
    soundManager.playWhistle();
    soundManager.announce(`Timeout ${team.city} ${team.name}.`);
    this.notifyState();
  }

  public triggerSkillMove(move: PlayerActionMove): void {
    if (this.gameMode !== 'PLAYING' || !this.isBallSnapped) return;

    // User Defense Action: Hit-Stick / Swat
    if (this.driveState.possession === 'CPU' && this.userControlledDefender) {
      if (this.moveCooldown > 0) return;
      this.moveCooldown = 0.65;
      this.userControlledDefender.moveAction = move === 'DIVE' ? 'SWAT' : 'HIT_STICK';
      this.userControlledDefender.moveTimer = 0.45;
      if (this.activeBallCarrier) {
        const dx = this.activeBallCarrier.x - this.userControlledDefender.x;
        const dz = this.activeBallCarrier.z - this.userControlledDefender.z;
        const dist = Math.hypot(dx, dz) || 1;
        if (dist < 4.5) {
          this.userControlledDefender.vx = (dx / dist) * 14.5;
          this.userControlledDefender.vz = (dz / dist) * 14.5;
        }
      }
      soundManager.playJukeCut();
      return;
    }

    // User Offense Ball Carrier Action: Juke / Spin / Truck / Dive
    const carrier = this.activeBallCarrier;
    if (!carrier || this.moveCooldown > 0) return;

    this.moveCooldown = this.tuning.jukeCooldown;
    this.jukeActiveTimer = this.tuning.jukeDuration;
    carrier.moveAction = move;
    carrier.moveTimer = move === 'DIVE' ? 0.55 : 0.48;

    if (move === 'DIVE') {
      carrier.vz = (carrier.vz ?? 0) + 5.5;
      soundManager.playThrowWhoosh(1.1);
    } else if (move === 'SPIN') {
      soundManager.playThrowWhoosh(1.4);
      if (this.playStyle === 'ARCADE') {
        this.fieldBuilder.triggerShockwave(carrier.x, carrier.z, 0x00daf3);
      }
    } else if (move === 'TRUCK') {
      soundManager.playBigHit(this.playStyle === 'ARCADE');
      if (this.playStyle === 'ARCADE') {
        this.fieldBuilder.triggerShockwave(carrier.x, carrier.z, 0xff8c00);
      }
    } else {
      soundManager.playJukeCut();
      const sideStep = this.playerInput.lateral !== 0 ? Math.sign(this.playerInput.lateral) : Math.random() < 0.5 ? -1 : 1;
      carrier.vx = (carrier.vx ?? 0) + sideStep * 5.2;
    }
  }

  public switchUserDefender(): void {
    if (this.driveState.possession !== 'CPU' || this.defensePlayers.length === 0) return;
    const focus = this.isPassInAir && this.passLandingPos
      ? { x: this.passLandingPos.x, z: this.passLandingPos.z }
      : this.activeBallCarrier
      ? { x: this.activeBallCarrier.x, z: this.activeBallCarrier.z }
      : this.offensePlayers.find((p) => p.role === 'QB') || { x: 0, z: 0 };

    let best: Player3D | null = null;
    let bestDist = Infinity;
    for (const def of this.defensePlayers) {
      if (def.id === this.userControlledDefender?.id) continue;
      const d = Math.hypot(def.x - focus.x, def.z - focus.z);
      if (d < bestDist) {
        bestDist = d;
        best = def;
      }
    }
    if (best) {
      this.defensePlayers.forEach((d) => (d.isUserControlled = false));
      best.isUserControlled = true;
      this.userControlledDefender = best;
      soundManager.playUIClick();
    }
  }

  public setPlayerInput(input: Partial<PlayerMovementInput>): void {
    this.playerInput = { ...this.playerInput, ...input };
    if (input.juke) {
      this.triggerSkillMove('JUKE');
      this.playerInput.juke = false;
    }
    if (input.spin) {
      this.triggerSkillMove('SPIN');
      this.playerInput.spin = false;
    }
    if (input.truck) {
      this.triggerSkillMove('TRUCK');
      this.playerInput.truck = false;
    }
    if (input.dive) {
      this.triggerSkillMove('DIVE');
      this.playerInput.dive = false;
    }
  }

  public flipCurrentPlay(): void {
    if (this.isBallSnapped) return;
    this.playFlipped = !this.playFlipped;
    this.setupPlay(this.currentPlayType, this.currentDefensePlay);
    soundManager.playUIClick();
  }

  private setupLighting(): void {
    this.hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x1e2e18, 0.78);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xfff7ed, 1.35);
    this.dirLight.position.set(28, 52, 14);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 170;
    this.dirLight.shadow.normalBias = 0.035;
    const d = 78;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.scene.add(this.dirLight);

    this.fieldBuilder.applyWeather(this.weatherPreset, this.scene);
  }

  public setWeather(preset: WeatherPreset): void {
    this.weatherPreset = preset;
    this.fieldBuilder.applyWeather(preset, this.scene);
    if (this.dirLight && this.hemiLight) {
      if (preset === 'DAY') {
        this.dirLight.color.setHex(0xffffff);
        this.dirLight.intensity = 1.65;
        this.hemiLight.intensity = 1.05;
      } else if (preset === 'SUNSET') {
        this.dirLight.color.setHex(0xfdba74);
        this.dirLight.intensity = 1.45;
        this.hemiLight.intensity = 0.8;
      } else {
        this.dirLight.color.setHex(0xfff7ed);
        this.dirLight.intensity = 1.25;
        this.hemiLight.intensity = 0.72;
      }
    }
  }

  public setPlayerMode(mode: 'BLOCK' | 'ATHLETE'): void {
    this.playerMode = mode;
    [...this.offensePlayers, ...this.defensePlayers].forEach((p) => {
      const old = this.playerMeshes.get(p.id);
      if (old) {
        this.scene.remove(old.root);
        PlayerMeshBuilder.disposePlayer(old.root);
      }
      const kit = p.team === 'OFFENSE' ? this.activeOffenseKit : this.activeDefenseKit;
      const parts = PlayerMeshBuilder.createPlayerGroup(p, kit, mode);
      this.playerMeshes.set(p.id, parts);
      this.scene.add(parts.root);
    });
  }

  public setCameraMode(mode: CameraViewMode): void {
    this.cameraMode = mode;
  }

  public yardLineToZ(yardLine: number): number {
    return yardLine - 50;
  }

  public setupPlay(playType: PlayType = this.currentPlayType, defPlay?: DefensePlayType): void {
    this.currentPlayType = playType;
    this.currentDefensePlay = defPlay || chooseCpuDefensePlay(this.driveState);
    this.isBallSnapped = false;
    this.isPassInAir = false;
    this.isKickInAir = false;
    this.passLandingPos = null;
    this.pocketTimeRemaining = this.tuning.pocketTime;
    this.activeBallCarrier = null;
    this.selectedTargetReceiver = null;
    this.userControlledDefender = null;
    this.playElapsed = 0;
    this.handoffTimer = 0;
    this.handoffDone = false;
    this.moveCooldown = 0;
    this.jukeActiveTimer = 0;
    this.cpuThrowTimer = 1.4 + Math.random() * 1.4;
    this.cpuAutoSnapTimer = this.driveState.possession === 'CPU' ? 1.3 : 0;
    this.isReplaying = false;
    this.replayFrames = [];
    this.footballPhysics.hide();
    this.fieldBuilder.updateBallLandingMarker(null, false);

    // Dispose previous meshes cleanly
    this.playerMeshes.forEach((parts) => {
      this.scene.remove(parts.root);
      PlayerMeshBuilder.disposePlayer(parts.root);
    });
    this.playerMeshes.clear();
    this.offensePlayers = [];
    this.defensePlayers = [];

    const losZ = this.yardLineToZ(this.driveState.ballYardLine);
    const fdZ = this.yardLineToZ(Math.min(100, this.driveState.ballYardLine + this.driveState.yardsToGo));

    this.fieldBuilder.updateLines(losZ, fdZ, this.driveState.down);
    this.fieldBuilder.setPocketIntegrity(1.0);
    const playDef = getOffensivePlayDef(playType);
    this.fieldBuilder.setPocketVisible(playDef.category === 'PASS' || playDef.category === 'PLAY_ACTION');

    // Resolve contrasting Home vs Away kits
    const { homeKit, awayKit } = resolveMatchupKits(this.userTeam, this.cpuTeam);
    const userOnOffense = this.driveState.possession !== 'CPU';
    this.activeOffenseKit = userOnOffense ? homeKit : awayKit;
    this.activeDefenseKit = userOnOffense ? awayKit : homeKit;
    this.driveState.offenseTeam = userOnOffense ? this.userTeam : this.cpuTeam;
    this.driveState.defenseTeam = userOnOffense ? this.cpuTeam : this.userTeam;

    const speedScale = this.tuning.speedMultiplier;
    const builtOff = buildOffenseRosterForPlay(playType, losZ, this.driveState.offenseTeam, speedScale);
    this.offensePlayers = builtOff.players;

    // Mirror X coordinates if play is flipped
    if (this.playFlipped) {
      this.offensePlayers.forEach((p) => {
        p.x = -p.x;
        p.targetX = -p.targetX;
        p.route?.waypoints.forEach((wp) => {
          wp.x = -wp.x;
        });
      });
    }

    this.defensePlayers = buildDefenseRosterForPlay(
      this.currentDefensePlay,
      losZ,
      this.offensePlayers,
      this.driveState.defenseTeam,
      speedScale * this.tuning.defenderSpeedScale
    );

    // Highlight user-controlled player
    const qb = this.offensePlayers.find((p) => p.role === 'QB' || p.role === 'K');
    if (userOnOffense && qb) {
      qb.isUserControlled = true;
      qb.isOnFire = this.playStyle === 'ARCADE' && this.arcadeState.heatLevel === 2;
    } else if (!userOnOffense) {
      const mlb = this.defensePlayers.find((d) => d.id === 'LB_1') || this.defensePlayers[0];
      if (mlb) {
        mlb.isUserControlled = true;
        this.userControlledDefender = mlb;
      }
    }

    // Build 3D Player Meshes
    this.offensePlayers.forEach((p) => {
      const parts = PlayerMeshBuilder.createPlayerGroup(p, this.activeOffenseKit, this.playerMode);
      this.playerMeshes.set(p.id, parts);
      this.scene.add(parts.root);
    });
    this.defensePlayers.forEach((p) => {
      const parts = PlayerMeshBuilder.createPlayerGroup(p, this.activeDefenseKit, this.playerMode);
      this.playerMeshes.set(p.id, parts);
      this.scene.add(parts.root);
    });

    orderedTargets(this.offensePlayers).forEach((p) => {
      p.route!.label = `Pass ${p.route!.targetKey} · ${p.name}`;
    });
    this.routes.build(this.offensePlayers);
    this.selectTargetReceiver(0);

    // Initialize Kick Meter if Special Teams play
    if (playType === 'ST_FIELD_GOAL' || playType === 'ST_PUNT') {
      const distYards = Math.round(100 - this.driveState.ballYardLine + 17);
      this.kickMeter = {
        active: userOnOffense,
        kind: this.isPatKickAttempt ? 'PAT' : playType === 'ST_PUNT' ? 'PUNT' : 'FG',
        phase: 'POWER',
        power: 0.2,
        accuracy: 0,
        distanceYards: distYards,
        windX: (Math.random() - 0.5) * 2.4,
      };
      this.kickMeterDir = 1;
      if (userOnOffense && this.gameMode === 'PLAYING') {
        this.gameMode = 'KICKING';
      }
    } else {
      this.kickMeter = { ...this.kickMeter, active: false };
    }

    this.updateJumbotron();
    this.notifyState();
  }

  public advanceKickMeter(): void {
    if (!this.kickMeter.active) return;
    if (this.kickMeter.phase === 'POWER') {
      this.kickMeter.phase = 'ACCURACY';
      this.kickMeter.accuracy = -0.85;
      this.kickMeterDir = 1;
      soundManager.playUIClick();
    } else if (this.kickMeter.phase === 'ACCURACY') {
      this.kickMeter.phase = 'LAUNCHED';
      this.kickMeter.active = false;
      this.executeKick(this.kickMeter.power, this.kickMeter.accuracy);
    }
    this.notifyState();
  }

  private executeKick(power: number, accuracy: number): void {
    this.gameMode = 'PLAYING';
    this.isBallSnapped = true;
    this.isKickInAir = true;

    const kicker = this.offensePlayers.find((p) => p.role === 'K' || p.role === 'QB');
    if (kicker) {
      kicker.state = 'KICKING';
      kicker.hasBall = false;
    }
    soundManager.playKickThump();
    soundManager.playCrowdRoar('HYPE');

    const losZ = this.yardLineToZ(this.driveState.ballYardLine);
    const startZ = losZ - (this.kickMeter.kind === 'PUNT' ? 12 : 7.5);
    const from = new THREE.Vector3(0, 0.5, startZ);

    if (this.kickMeter.kind === 'PUNT') {
      const puntDist = 28 + power * 28;
      this.kickTargetZ = Math.min(54, losZ + puntDist);
      this.kickAccuracyOffsetX = accuracy * 10 + this.kickMeter.windX;
      this.footballPhysics.launchKick(from, this.kickAccuracyOffsetX, this.kickTargetZ, 0.4, 2.4);
    } else {
      const maxRangeYards = 34 + power * 36; // full power reaches ~70 yd FG!
      const reqDistance = 60 - startZ;
      const heightAtPosts = maxRangeYards >= reqDistance ? 3.8 + (maxRangeYards - reqDistance) * 0.35 : 1.5;
      this.kickTargetZ = 60;
      this.kickAccuracyOffsetX = accuracy * 6.5 + this.kickMeter.windX * 0.55;
      this.footballPhysics.launchKick(from, this.kickAccuracyOffsetX, 60, heightAtPosts, 1.85);
    }
    this.notifyState();
  }

  public snapBall(): void {
    if (this.isBallSnapped || (this.gameMode !== 'PLAYING' && this.gameMode !== 'KICKING')) return;

    if (this.currentPlayType === 'ST_FIELD_GOAL' || this.currentPlayType === 'ST_PUNT') {
      if (this.driveState.possession === 'USER') {
        this.advanceKickMeter();
      } else {
        // CPU automatic kick
        const cpuAcc = (Math.random() - 0.5) * (1.2 - this.tuning.cpuOffenseAccuracy);
        this.executeKick(0.82 + Math.random() * 0.16, cpuAcc);
      }
      return;
    }

    this.isBallSnapped = true;
    this.clockRunning = true;
    this.playElapsed = 0;
    this.driveState.playClock = 25;
    soundManager.ensureStarted();

    if (this.driveState.down === 3) {
      soundManager.playDefenseDrumCadence();
    } else {
      soundManager.playSnapHut();
    }

    const playDef = getOffensivePlayDef(this.currentPlayType);
    const isRun = playDef.category === 'RUN';
    this.handoffTimer = isRun ? 0.32 : 0;
    this.handoffDone = false;

    this.offensePlayers.forEach((p) => {
      if (p.role === 'OL') {
        p.state = 'BLOCKING';
      } else if (p.role === 'WR' || p.role === 'TE' || p.role === 'RB') {
        p.state = 'RUNNING';
      } else if (p.role === 'QB') {
        p.state = isRun ? 'RUNNING' : 'DROPBACK';
      }
    });

    this.defensePlayers.forEach((p) => {
      if (p.role === 'DL' || p.isBlitzer) {
        p.state = 'PASS_RUSH';
      } else {
        p.state = 'RUNNING';
      }
    });

    this.notifyState();
  }

  public moveQB(direction: 'LEFT' | 'RIGHT'): void {
    const qb = this.offensePlayers.find((p) => p.role === 'QB');
    if (!qb) return;
    const effectiveDir = this.invertControls ? (direction === 'LEFT' ? 'RIGHT' : 'LEFT') : direction;
    const deltaX = effectiveDir === 'LEFT' ? -1.8 : 1.8;
    qb.targetX = Math.max(-10, Math.min(10, qb.x + deltaX));
  }

  public selectTargetReceiver(index: number): void {
    const targets = orderedTargets(this.offensePlayers);
    if (index >= 0 && index < targets.length) {
      this.targetReceiverIndex = index;
      this.selectedTargetReceiver = targets[index];
    }
  }

  public throwPass(isBullet: boolean = true): void {
    if (this.gameMode !== 'PLAYING' || !this.isBallSnapped || this.isPassInAir || this.activeBallCarrier) return;

    const qb = this.offensePlayers.find((p) => p.role === 'QB');
    if (!qb || !qb.hasBall || qb.z > this.yardLineToZ(this.driveState.ballYardLine) + 0.5) return;

    const targets = orderedTargets(this.offensePlayers);
    const receiver = this.selectedTargetReceiver || targets[0];
    if (!receiver) return;

    this.isPassInAir = true;
    this.thrownReceiver = receiver;
    qb.state = 'THROWING';
    qb.hasBall = false;

    const isUserOff = this.driveState.possession !== 'CPU';
    const statBucket = isUserOff ? this.boxScore.user : this.boxScore.cpu;
    statBucket.attempts++;

    const onFireThrow = this.playStyle === 'ARCADE' && isUserOff && this.arcadeState.heatLevel === 2;
    this.footballPhysics.setFlameTrail(onFireThrow || (this.playStyle === 'ARCADE' && isBullet));
    soundManager.playThrowWhoosh(isBullet ? 1.35 : 0.85);

    const from = new THREE.Vector3(qb.x, 1.85, qb.z);
    const velScale = this.tuning.throwVelocityScale * (onFireThrow ? 1.18 : 1.0);
    const passSpeed = (isBullet ? PHYSICS.BULLET_PASS_SPEED : PHYSICS.LOB_PASS_SPEED) * velScale;
    let travel = Math.max(0.45, Math.hypot(receiver.x - qb.x, receiver.z - qb.z) / passSpeed);
    let targetX = receiver.x;
    let targetZ = receiver.z;
    for (let i = 0; i < 4; i++) {
      targetX = Math.max(-FIELD.WIDTH / 2 + 0.8, Math.min(FIELD.WIDTH / 2 - 0.8, receiver.x + (receiver.vx ?? 0) * travel));
      targetZ = Math.min(58.5, receiver.z + (receiver.vz ?? 0) * travel);
      travel = Math.max(0.45, Math.hypot(targetX - qb.x, targetZ - qb.z) / passSpeed);
    }

    const to = new THREE.Vector3(targetX, 1.7, targetZ);
    this.passLandingPos = to.clone();
    this.fieldBuilder.updateBallLandingMarker(to, true, !isUserOff);
    this.footballPhysics.launchPass(from, to, isBullet, velScale);
  }

  public startInstantReplay(): void {
    if (this.replayFrames.length < 6) return;
    this.isReplaying = true;
    this.replayPlaybackIdx = 0;
    this.replayPlaybackAccum = 0;
    soundManager.playUIClick();
    this.notifyState();
  }

  public stopInstantReplay(): void {
    this.isReplaying = false;
    this.notifyState();
  }

  private captureReplayFrame(): void {
    const players: Record<string, [number, number, number, number]> = {};
    [...this.offensePlayers, ...this.defensePlayers].forEach((p) => {
      players[p.id] = [p.x, p.y, p.z, p.heading];
    });
    this.replayFrames.push({
      ballPos: [this.activeFootballMesh.position.x, this.activeFootballMesh.position.y, this.activeFootballMesh.position.z],
      ballVisible: this.activeFootballMesh.visible,
      players,
    });
    if (this.replayFrames.length > 260) {
      this.replayFrames.shift();
    }
  }

  private updateRunHandoff(delta: number): void {
    const playDef = getOffensivePlayDef(this.currentPlayType);
    if (playDef.category !== 'RUN' || this.handoffDone || !this.isBallSnapped) return;

    this.handoffTimer -= delta;
    if (this.handoffTimer <= 0) {
      this.handoffDone = true;
      const qb = this.offensePlayers.find((p) => p.role === 'QB');
      const runner =
        playDef.handoffType === 'OPTION_READ'
          ? qb
          : playDef.handoffType === 'JET_SWEEP'
          ? this.offensePlayers.find((p) => p.id === 'WR_1')
          : this.offensePlayers.find((p) => p.role === 'RB');

      if (runner) {
        if (qb && qb !== runner) {
          qb.hasBall = false;
          qb.isUserControlled = false;
          qb.state = 'STANCE';
        }
        runner.hasBall = true;
        runner.state = 'RUNNING';
        runner.isUserControlled = this.driveState.possession !== 'CPU';
        runner.isOnFire = this.playStyle === 'ARCADE' && this.driveState.possession !== 'CPU' && this.arcadeState.heatLevel === 2;
        this.activeBallCarrier = runner;

        const statBucket = this.driveState.possession !== 'CPU' ? this.boxScore.user : this.boxScore.cpu;
        statBucket.rushAttempts++;

        soundManager.playCatch();
        this.notifyState();
      }
    }
  }

  private updateReceiversAndCoverage(delta: number): void {
    const targets = orderedTargets(this.offensePlayers);
    const cbs = this.defensePlayers.filter((p) => p.role === 'CB');
    const lbs = this.defensePlayers.filter((p) => p.role === 'LB');
    const safeties = this.defensePlayers.filter((p) => p.role === 'S');
    const playDef = getOffensivePlayDef(this.currentPlayType);
    const isPAFreeze = playDef.isPlayAction && this.playElapsed < 0.85;

    const receiverInfoList: ReceiverRoute[] = [];

    targets.forEach((wr, idx) => {
      if (!wr.route) return;
      if (this.isBallSnapped && !this.activeBallCarrier) {
        const waypoints = wr.route.waypoints;
        const currentIdx = wr.route.currentWaypointIdx;
        if (currentIdx < waypoints.length) {
          const wp = waypoints[currentIdx];
          const dx = wp.x - wr.x;
          const dz = wp.z - wr.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 0.85) {
            wr.route.currentWaypointIdx++;
          } else {
            Object.assign(wr, movementVelocity(wr.vx ?? 0, wr.vz ?? 0, dx / dist, dz / dist, wr.speed, delta));
            wr.x += wr.vx! * delta;
            wr.z += wr.vz! * delta;
            wr.heading = movementHeading(wr.heading, wr.vx!, wr.vz!, delta);
          }
        } else {
          wr.vz = wr.speed * 0.85;
          wr.z = Math.min(58.5, wr.z + wr.vz * delta);
          wr.heading = 0;
        }

        // CB Coverage (Man or Zone)
        const cb = cbs[idx];
        if (cb && !cb.isUserControlled) {
          let goalX = wr.x;
          let goalZ = wr.z + 1.15;
          if (cb.assignmentType === 'ZONE_DEEP' && cb.zoneAnchor) {
            const losZ = this.yardLineToZ(this.driveState.ballYardLine);
            goalX = THREE.MathUtils.lerp(cb.zoneAnchor.x, wr.x, 0.55);
            goalZ = Math.max(losZ + cb.zoneAnchor.zOffset, wr.z + 2.0);
          } else if (cb.assignmentType === 'ZONE_FLAT' && cb.zoneAnchor) {
            const losZ = this.yardLineToZ(this.driveState.ballYardLine);
            goalX = THREE.MathUtils.lerp(cb.zoneAnchor.x, wr.x, 0.65);
            goalZ = Math.min(losZ + 11.5, wr.z + 1.0);
          }

          if (this.isPassInAir && this.passLandingPos) {
            goalX = this.passLandingPos.x;
            goalZ = this.passLandingPos.z;
          }

          const cbDx = goalX - cb.x;
          const cbDz = goalZ - cb.z;
          const cbDist = Math.hypot(cbDx, cbDz);
          if (cbDist > 0.35) {
            Object.assign(
              cb,
              movementVelocity(cb.vx ?? 0, cb.vz ?? 0, cbDx / cbDist, cbDz / cbDist, cb.speed * this.tuning.dbReactionScale, delta)
            );
            cb.x += cb.vx! * delta;
            cb.z += cb.vz! * delta;
            cb.heading = movementHeading(cb.heading, cb.vx!, cb.vz!, delta);
          }
        }

        // Evaluate closest defender separation across ALL defenders
        let minSep = Infinity;
        for (const d of this.defensePlayers) {
          const sep = Math.hypot(wr.x - d.x, wr.z - d.z);
          if (sep < minSep) minSep = sep;
        }
        wr.route.separation = Math.min(1.0, minSep / 3.4);
        wr.route.isOpen = minSep >= this.tuning.openSeparationYards;
        wr.route.isCovered = !wr.route.isOpen;
        wr.route.contestedChance = wr.route.isOpen ? 0.12 : 0.62;
      }

      receiverInfoList.push(wr.route);
    });

    // Linebackers & Safeties Zone / Blitz Logic
    if (this.isBallSnapped && !this.activeBallCarrier) {
      const losZ = this.yardLineToZ(this.driveState.ballYardLine);
      const qb = this.offensePlayers.find((p) => p.role === 'QB');

      lbs.forEach((lb) => {
        if (lb.isUserControlled || lb.isBlitzer) return;
        const anchor = lb.zoneAnchor || { x: 0, zOffset: 5.5 };
        const goalX = this.isPassInAir && this.passLandingPos ? this.passLandingPos.x : anchor.x + (qb ? qb.x * 0.35 : 0);
        const goalZ = this.isPassInAir && this.passLandingPos
          ? this.passLandingPos.z
          : losZ + (isPAFreeze ? 2.2 : anchor.zOffset);
        const dx = goalX - lb.x;
        const dz = goalZ - lb.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.4) {
          Object.assign(lb, movementVelocity(lb.vx ?? 0, lb.vz ?? 0, dx / dist, dz / dist, lb.speed * 0.9, delta));
          lb.x += lb.vx! * delta;
          lb.z += lb.vz! * delta;
          lb.heading = movementHeading(lb.heading, lb.vx!, lb.vz!, delta);
        }
      });

      safeties.forEach((s) => {
        if (s.isUserControlled) return;
        const anchor = s.zoneAnchor || { x: 0, zOffset: 18 };
        let goalX = anchor.x + (qb ? qb.x * 0.3 : 0);
        let goalZ = losZ + anchor.zOffset;

        if (this.isPassInAir && this.passLandingPos) {
          goalX = this.passLandingPos.x;
          goalZ = this.passLandingPos.z;
        } else if (s.assignmentType === 'MAN' && s.assignedDefenderId) {
          const target = this.offensePlayers.find((p) => p.id === s.assignedDefenderId);
          if (target) {
            goalX = target.x;
            goalZ = target.z + 1.0;
          }
        }
        const dx = goalX - s.x;
        const dz = goalZ - s.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.4) {
          Object.assign(s, movementVelocity(s.vx ?? 0, s.vz ?? 0, dx / dist, dz / dist, s.speed, delta));
          s.x += s.vx! * delta;
          s.z += s.vz! * delta;
          s.heading = movementHeading(s.heading, s.vx!, s.vz!, delta);
        }
      });
    }

    this.hudElapsed += delta;
    if (this.hudElapsed >= 0.1) {
      this.hudElapsed %= 0.1;
      this.onReceiverStatusUpdate?.(receiverInfoList);
      this.notifyState();
    }
  }

  private updatePocketAndRushers(delta: number): void {
    if (!this.isBallSnapped || this.isPassInAir || this.activeBallCarrier || this.isKickInAir) return;

    this.pocketTimeRemaining -= delta * this.tuning.passRushShedScale;
    const ratio = Math.max(0, this.pocketTimeRemaining / this.tuning.pocketTime);
    this.fieldBuilder.setPocketIntegrity(ratio);

    const qb = this.offensePlayers.find((p) => p.role === 'QB');
    if (!qb) return;

    const losZ = this.yardLineToZ(this.driveState.ballYardLine);
    const oLinemen = this.offensePlayers.filter((p) => p.role === 'OL');
    const rushers = this.defensePlayers.filter((p) => (p.role === 'DL' || p.isBlitzer) && !p.isUserControlled);

    rushers.forEach((dl, idx) => {
      const assignedOl = oLinemen[idx % oLinemen.length];
      const isUnblockedBlitzer = dl.role === 'LB' && dl.isBlitzer;

      if (!isUnblockedBlitzer && this.pocketTimeRemaining > 0.7 && Math.abs(qb.x) < 5.2) {
        if (assignedOl) {
          assignedOl.state = 'BLOCKING';
          assignedOl.z = THREE.MathUtils.lerp(assignedOl.z, losZ - 0.9, 0.1);
          assignedOl.x = THREE.MathUtils.lerp(assignedOl.x, dl.x, 0.14);
        }
        dl.state = 'PASS_RUSH';
        dl.z = THREE.MathUtils.lerp(dl.z, losZ + 0.35, 0.08);
      } else {
        const dx = qb.x - dl.x;
        const dz = qb.z - dl.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.35) {
          const rushSpeed = dl.speed * (isUnblockedBlitzer ? 1.05 : 1.15);
          dl.vx = (dx / dist) * rushSpeed;
          dl.vz = (dz / dist) * rushSpeed;
          dl.x += dl.vx * delta;
          dl.z += dl.vz * delta;
          dl.heading = Math.atan2(dx, dz);
        }
        if (dist < 1.05 && !this.isPassInAir && qb.hasBall && !this.activeBallCarrier) {
          this.handleSack(qb, dl);
        }
      }
    });

    // CPU QB Dropback & AI Throw Read when CPU is on Offense!
    if (this.driveState.possession === 'CPU' && qb.hasBall) {
      qb.z = THREE.MathUtils.lerp(qb.z, losZ - 6.5, delta * 2.4);
      this.cpuThrowTimer -= delta;
      if (this.cpuThrowTimer <= 0) {
        const targets = orderedTargets(this.offensePlayers);
        const best = targets.slice().sort((a, b) => (b.route?.separation ?? 0) - (a.route?.separation ?? 0))[0];
        if (best) {
          this.selectedTargetReceiver = best;
          this.throwPass(Math.random() < 0.72);
        }
      }
    }
  }

  private updatePlayerControlsAndCarrier(delta: number): void {
    if (this.jukeActiveTimer > 0) this.jukeActiveTimer -= delta;
    if (this.moveCooldown > 0) this.moveCooldown -= delta;

    // Tick down player move & stun timers
    [...this.offensePlayers, ...this.defensePlayers].forEach((p) => {
      if ((p.moveTimer ?? 0) > 0) {
        p.moveTimer = Math.max(0, (p.moveTimer ?? 0) - delta);
        if (p.moveTimer === 0) p.moveAction = 'NONE';
      }
      if ((p.stunTimer ?? 0) > 0) {
        p.stunTimer = Math.max(0, (p.stunTimer ?? 0) - delta);
        if (p.stunTimer === 0 && p.state === 'TACKLED') p.state = 'RUNNING';
      }
    });

    // Arcade Turbo Recharge / Drain
    if (this.playStyle === 'ARCADE') {
      if (this.playerInput.sprint && this.isBallSnapped) {
        this.arcadeState.turbo = Math.max(0, this.arcadeState.turbo - delta * 28);
      } else {
        this.arcadeState.turbo = Math.min(100, this.arcadeState.turbo + delta * 16);
      }
      if (this.arcadeState.fireTimeRemaining > 0) {
        this.arcadeState.fireTimeRemaining = Math.max(0, this.arcadeState.fireTimeRemaining - delta);
        if (this.arcadeState.fireTimeRemaining === 0) {
          this.arcadeState.heatLevel = 0;
          this.arcadeState.streakCount = 0;
        }
      }
    }

    const losZ = this.yardLineToZ(this.driveState.ballYardLine);
    const qb = this.offensePlayers.find((p) => p.role === 'QB');
    const userOnOffense = this.driveState.possession !== 'CPU';
    const traction = this.weatherPreset === 'RAIN' ? 0.85 : this.weatherPreset === 'SNOW' ? 0.72 : 1.0;

    // USER DEFENSE MOVEMENT
    if (!userOnOffense && this.userControlledDefender && this.isBallSnapped && this.gameMode === 'PLAYING') {
      const def = this.userControlledDefender;
      const lateralInput = this.invertControls ? -this.playerInput.lateral : this.playerInput.lateral;
      const canTurbo = this.playStyle !== 'ARCADE' || this.arcadeState.turbo > 2;
      const sprintMult = this.playerInput.sprint && canTurbo ? 1.24 : 1.0;
      const moveSpeed = def.speed * sprintMult;

      // Invert Z input when viewing from defense? Keep intuitive W = upfield (+Z), S = downfield (-Z)
      Object.assign(
        def,
        movementVelocity(def.vx ?? 0, def.vz ?? 0, lateralInput, this.playerInput.forward, moveSpeed, delta, traction)
      );
      def.x = Math.max(-FIELD.WIDTH / 2 + 0.6, Math.min(FIELD.WIDTH / 2 - 0.6, def.x + def.vx! * delta));
      def.z = Math.max(-59, Math.min(59, def.z + def.vz! * delta));
      const spd = Math.hypot(def.vx!, def.vz!);
      if (spd > 0.35) {
        def.heading = movementHeading(def.heading, def.vx!, def.vz!, delta);
        def.state = 'RUNNING';
      } else {
        def.state = 'STANCE';
      }

      // User Defender Sack Check!
      if (qb && qb.hasBall && !this.activeBallCarrier && !this.isPassInAir) {
        const distQb = Math.hypot(qb.x - def.x, qb.z - def.z);
        if (distQb < 1.25) {
          this.handleSack(qb, def);
          return;
        }
      }
    }

    // CASE 1: User QB in Pocket
    if (userOnOffense && !this.isPassInAir && !this.activeBallCarrier && qb && qb.hasBall && this.isBallSnapped) {
      const canTurbo = this.playStyle !== 'ARCADE' || this.arcadeState.turbo > 2;
      const speedMultiplier = this.playerInput.sprint && canTurbo ? 1.42 : 1.0;
      const fireBoost = this.playStyle === 'ARCADE' && this.arcadeState.heatLevel === 2 ? 1.15 : 1.0;
      const moveSpeed = qb.speed * speedMultiplier * fireBoost;
      const lateralInput = this.invertControls ? -this.playerInput.lateral : this.playerInput.lateral;

      Object.assign(
        qb,
        movementVelocity(qb.vx ?? 0, qb.vz ?? 0, lateralInput, this.playerInput.forward, moveSpeed, delta, traction)
      );
      qb.x = Math.max(-FIELD.WIDTH / 2 + 2.5, Math.min(FIELD.WIDTH / 2 - 2.5, qb.x + qb.vx! * delta));
      qb.z += qb.vz! * delta;

      const curSpeed = Math.hypot(qb.vx!, qb.vz!);
      if (curSpeed > 0.5) {
        qb.heading = movementHeading(qb.heading, qb.vx!, qb.vz!, delta);
        qb.state = 'RUNNING';
      } else {
        qb.state = 'STANCE';
      }

      if (qb.z > losZ) {
        this.activeBallCarrier = qb;
        qb.state = 'RUNNING';
        this.boxScore.user.rushAttempts++;
        soundManager.playCrowdRoar('CHEER');
        return;
      }
    }

    // CASE 2: Active Ball Carrier (Run Play, Scramble, or Run-After-Catch!)
    if (this.activeBallCarrier && this.gameMode === 'PLAYING') {
      const carrier = this.activeBallCarrier;
      const carrierIsUser = userOnOffense;

      if (carrierIsUser) {
        const canTurbo = this.playStyle !== 'ARCADE' || this.arcadeState.turbo > 2;
        const isSprinting = this.playerInput.sprint && canTurbo;
        const fireBoost = this.playStyle === 'ARCADE' && this.arcadeState.heatLevel === 2 ? 1.18 : 1.0;
        const moveBoost = this.jukeActiveTimer > 0 ? 1.18 : 1.0;
        const currentSpeed = carrier.speed * (isSprinting ? 1.16 : 1.0) * fireBoost * moveBoost;
        const lateralInput = this.invertControls ? -this.playerInput.lateral : this.playerInput.lateral;

        Object.assign(
          carrier,
          movementVelocity(carrier.vx ?? 0, carrier.vz ?? 0, lateralInput, this.playerInput.forward, currentSpeed, delta, traction)
        );
      } else {
        // CPU Ball Carrier AI (Runs toward open space downfield, evades closest defender!)
        let desiredX = 0;
        let desiredZ = 1.0;
        const nearestDef = this.defensePlayers
          .slice()
          .sort((a, b) => Math.hypot(a.x - carrier.x, a.z - carrier.z) - Math.hypot(b.x - carrier.x, b.z - carrier.z))[0];
        if (nearestDef && Math.hypot(nearestDef.x - carrier.x, nearestDef.z - carrier.z) < 6.5) {
          desiredX = carrier.x >= nearestDef.x ? 0.75 : -0.75;
        }
        Object.assign(
          carrier,
          movementVelocity(carrier.vx ?? 0, carrier.vz ?? 0, desiredX, desiredZ, carrier.speed * 0.96, delta, traction)
        );
      }

      carrier.x += carrier.vx! * delta;
      carrier.z += carrier.vz! * delta;
      const spd = Math.hypot(carrier.vx!, carrier.vz!);
      if (spd > 0.3) {
        carrier.heading = movementHeading(carrier.heading, carrier.vx!, carrier.vz!, delta);
        carrier.state = 'RUNNING';
      } else {
        carrier.state = 'STANCE';
      }

      const parts = this.playerMeshes.get(carrier.id);
      if (parts?.ballMesh) parts.ballMesh.visible = true;
      this.activeFootballMesh.visible = false;

      // O-Line Run Blocking Assistance (pushes nearby DL away from carrier!)
      this.offensePlayers
        .filter((p) => p.role === 'OL')
        .forEach((ol) => {
          const targetDef = this.defensePlayers.find(
            (d) => (d.role === 'DL' || d.role === 'LB') && Math.hypot(d.x - ol.x, d.z - ol.z) < 3.2
          );
          if (targetDef && !targetDef.isUserControlled) {
            ol.state = 'BLOCKING';
            const pushX = targetDef.x >= carrier.x ? 1 : -1;
            targetDef.x += pushX * delta * 2.2;
          }
        });

      // 1. Out of Bounds Check
      if (Math.abs(carrier.x) > FIELD.WIDTH / 2) {
        this.clockRunning = false;
        soundManager.playWhistle();
        const yardsGained = Math.round(carrier.z - losZ);
        const newYardLine = Math.min(99, Math.max(1, this.driveState.ballYardLine + yardsGained));
        this.completePlay(
          {
            result: yardsGained >= 0 ? 'RUSH_GAIN' : 'SACK',
            yardsGained,
            headline: 'OUT OF BOUNDS',
            description: `${carrier.name} stepped out at the ${formatYardSpot(newYardLine)} (${yardsGained >= 0 ? '+' : ''}${yardsGained} yds). Clock stops.`,
            isBigPlay: yardsGained >= 15,
            hasReplay: this.replayFrames.length >= 10,
          },
          newYardLine
        );
        return;
      }

      // 2. Safety Check (Tackled / pushed into own end zone)
      if (carrier.z <= -50) {
        soundManager.playWhistle();
        this.completePlay(
          {
            result: 'SAFETY',
            yardsGained: Math.round(carrier.z - losZ),
            headline: 'SAFETY! (+2 PTS)',
            description: `${carrier.name} brought down in their own end zone! 2 points to the defense!`,
            pointsScored: 2,
            turnover: true,
            hasReplay: true,
          },
          1
        );
        return;
      }

      // 3. Touchdown Check!
      if (carrier.z >= 50) {
        carrier.state = 'CELEBRATING';
        const yardsGained = Math.round(50 - losZ);
        if (this.isTwoPointAttempt) {
          this.completePlay(
            {
              result: 'TWO_PT_GOOD',
              yardsGained,
              headline: '2-PT CONVERSION GOOD!',
              description: `${carrier.name} powers into the end zone for 2 extra points!`,
              pointsScored: 2,
              isBigPlay: true,
              hasReplay: true,
            },
            100
          );
          return;
        }
        this.completePlay(
          {
            result: 'TOUCHDOWN',
            yardsGained,
            headline: this.playStyle === 'ARCADE' ? 'BOOM-SHAKA-LAKA! TOUCHDOWN!' : 'TOUCHDOWN!',
            description: `${carrier.name} takes it to the house for ${yardsGained} yards!`,
            pointsScored: 6,
            isBigPlay: true,
            hasReplay: true,
          },
          100
        );
        return;
      }

      // 4. Defensive Pursuit, Skill-Move Broken Tackles & Hit-Stick Tackling
      for (const def of this.defensePlayers) {
        if ((def.stunTimer ?? 0) > 0) continue;

        const dx = carrier.x - def.x;
        const dz = carrier.z - def.z;
        const dist = Math.hypot(dx, dz);

        if (!def.isUserControlled && dist > 0.3) {
          const pursuitSpeed = def.speed * (def.role === 'CB' || def.role === 'S' ? 1.06 : 0.96);
          Object.assign(def, movementVelocity(def.vx ?? 0, def.vz ?? 0, dx / dist, dz / dist, pursuitSpeed, delta, traction));
          def.x += def.vx! * delta;
          def.z += def.vz! * delta;
          def.heading = movementHeading(def.heading, def.vx!, def.vz!, delta);
          def.state = 'RUNNING';
        }

        const tackleDist = this.tuning.tackleRadius + (def.moveAction === 'HIT_STICK' && (def.moveTimer ?? 0) > 0 ? 0.45 : 0);
        if (dist < tackleDist && this.gameMode === 'PLAYING') {
          const isHitStick = def.moveAction === 'HIT_STICK' && (def.moveTimer ?? 0) > 0;
          const onFireBreak = carrierIsUser && this.playStyle === 'ARCADE' && this.arcadeState.heatLevel === 2;
          const activeMove = carrier.moveAction !== 'NONE' && (carrier.moveTimer ?? 0) > 0;

          const breakChance =
            (activeMove ? 0.72 : this.tuning.tackleBreakBase) +
            (onFireBreak ? 0.35 : 0) -
            (isHitStick ? 0.4 : 0);

          if (Math.random() < breakChance && !isHitStick) {
            // Broken Tackle!
            def.stunTimer = 1.15;
            def.state = 'TACKLED';
            def.x -= (dx / Math.max(dist, 0.01)) * 1.9;
            soundManager.playCrowdRoar('CHEER');
            this.triggerCameraShake(0.18, 0.22);
            this.fieldBuilder.triggerShockwave(carrier.x, carrier.z, 0x00daf3);
            if (this.playStyle === 'ARCADE' && carrierIsUser) {
              this.applyArcadeFeedback('BROKEN_TACKLE');
            }
          } else {
            // Tackle / Big Hit!
            const bigHit = isHitStick || this.playStyle === 'ARCADE';
            soundManager.playBigHit(bigHit);
            soundManager.playWhistle();
            this.triggerCameraShake(bigHit ? 0.35 : 0.16, bigHit ? 0.45 : 0.18);
            if (bigHit) {
              this.fieldBuilder.triggerShockwave(carrier.x, carrier.z, 0xff5500);
              const defStats = userOnOffense ? this.boxScore.cpu : this.boxScore.user;
              defStats.bigHits++;
              if (!userOnOffense && this.playStyle === 'ARCADE') {
                this.applyArcadeFeedback('BIG_HIT');
              }
            }

            carrier.state = 'TACKLED';
            def.state = 'TACKLED';

            // Fumble check on massive hit-stick / Arcade collision!
            const fumbleChance = isHitStick ? this.tuning.bigHitFumbleChance * 2.1 : this.tuning.bigHitFumbleChance * 0.4;
            if (!this.isTwoPointAttempt && Math.random() < fumbleChance) {
              const offStats = userOnOffense ? this.boxScore.user : this.boxScore.cpu;
              offStats.fumblesLost++;
              const yardsGained = Math.round(carrier.z - losZ);
              const spot = Math.min(99, Math.max(1, this.driveState.ballYardLine + yardsGained));
              this.completePlay(
                {
                  result: 'FUMBLE',
                  yardsGained,
                  headline: 'FUMBLE! BALL LOOSE!',
                  description: `CRUSHING HIT by ${def.name}! Ball pops free and defense recovers!`,
                  turnover: true,
                  isBigPlay: true,
                  hasReplay: true,
                },
                spot
              );
              return;
            }

            const yardsGained = Math.round(carrier.z - losZ);
            const newYardLine = Math.min(99, Math.max(1, this.driveState.ballYardLine + yardsGained));

            if (this.isTwoPointAttempt) {
              this.completePlay(
                {
                  result: 'TWO_PT_FAIL',
                  yardsGained,
                  headline: '2-PT STOPPED!',
                  description: `${def.name} denies ${carrier.name} short of the goal line!`,
                  hasReplay: true,
                },
                newYardLine
              );
              return;
            }

            this.completePlay(
              {
                result: yardsGained >= 0 ? 'RUSH_GAIN' : 'SACK',
                yardsGained,
                headline: yardsGained >= 15 ? 'EXPLOSIVE GAIN!' : yardsGained > 0 ? `+${yardsGained} YARDS` : 'STUFFED!',
                description: `${carrier.name} tackled by ${def.name} (${yardsGained >= 0 ? '+' : ''}${yardsGained} yds).`,
                isBigPlay: yardsGained >= 15,
                hasReplay: this.replayFrames.length >= 10,
              },
              newYardLine
            );
            return;
          }
        }
      }
    }
  }

  private handleSack(qb: Player3D, sacker: Player3D): void {
    soundManager.playBigHit(this.playStyle === 'ARCADE');
    soundManager.playWhistle();
    this.triggerCameraShake(0.32, 0.4);
    this.fieldBuilder.triggerShockwave(qb.x, qb.z, 0xef4444);

    qb.state = 'TACKLED';
    sacker.state = 'CELEBRATING';

    const userOnOff = this.driveState.possession !== 'CPU';
    const defStats = userOnOff ? this.boxScore.cpu : this.boxScore.user;
    defStats.sacks++;

    if (!userOnOff && this.playStyle === 'ARCADE') {
      this.applyArcadeFeedback('BIG_HIT');
    } else if (userOnOff && this.playStyle === 'ARCADE') {
      this.applyArcadeFeedback('COOL_DOWN');
    }

    const losZ = this.yardLineToZ(this.driveState.ballYardLine);
    const lossYards = Math.max(2, Math.round(Math.abs(qb.z - losZ)));
    const newYardLine = Math.max(1, this.driveState.ballYardLine - lossYards);

    if (qb.z <= -50) {
      this.completePlay(
        {
          result: 'SAFETY',
          yardsGained: -lossYards,
          headline: 'SACK FOR A SAFETY! (+2)',
          description: `${sacker.name} buries ${qb.name} in the end zone for a 2-point Safety!`,
          pointsScored: 2,
          turnover: true,
          hasReplay: true,
        },
        1
      );
      return;
    }

    this.completePlay(
      {
        result: 'SACK',
        yardsGained: -lossYards,
        headline: `SACKED BY ${sacker.name.toUpperCase()}!`,
        description: `${sacker.name} brings down ${qb.name} for a loss of ${lossYards} yards!`,
        isBigPlay: true,
        hasReplay: true,
      },
      newYardLine
    );
  }

  private handleKickResolution(): void {
    this.isKickInAir = false;
    const pos = this.activeFootballMesh.position;
    this.footballPhysics.hide();

    if (this.kickMeter.kind === 'PUNT') {
      const landingYard = Math.min(99, Math.max(10, Math.round(pos.z + 50)));
      const isTouchback = pos.z >= 50;
      const opponentSpot = isTouchback ? 20 : Math.max(1, 100 - landingYard);
      soundManager.playWhistle();
      this.completePlay(
        {
          result: 'PUNT',
          yardsGained: landingYard - this.driveState.ballYardLine,
          headline: isTouchback ? 'PUNT · TOUCHBACK' : `PINNED AT THE ${opponentSpot}!`,
          description: isTouchback
            ? 'Booming punt sails into the end zone for a touchback.'
            : `Punt pins the opponent deep at their own ${opponentSpot}-yard line!`,
          turnover: true,
        },
        opponentSpot
      );
      return;
    }

    const evalRes = evaluateFieldGoal({ x: pos.x, y: pos.y });
    const userOnOff = this.driveState.possession !== 'CPU';
    const stats = userOnOff ? this.boxScore.user : this.boxScore.cpu;
    if (!this.isPatKickAttempt) stats.fgAttempts++;

    if (evalRes === 'GOOD') {
      if (!this.isPatKickAttempt) stats.fgMade++;
      soundManager.playCrowdRoar('TOUCHDOWN');
      soundManager.playOrganFanfare();
      this.fieldBuilder.triggerTouchdownFireworks(this.scene);

      if (this.isPatKickAttempt) {
        this.completePlay(
          {
            result: 'PAT_GOOD',
            yardsGained: 0,
            headline: 'EXTRA POINT IS GOOD! (+1)',
            description: 'Clean kick right down the middle through the SOL uprights.',
            pointsScored: 1,
          },
          this.driveState.ballYardLine
        );
      } else {
        this.completePlay(
          {
            result: 'FIELD_GOAL_GOOD',
            yardsGained: 0,
            headline: `FIELD GOAL GOOD! (${this.kickMeter.distanceYards} YDS)`,
            description: `Split the uprights from ${this.kickMeter.distanceYards} yards out for +3 points!`,
            pointsScored: 3,
            isBigPlay: true,
          },
          this.driveState.ballYardLine
        );
      }
    } else {
      if (evalRes === 'DOINK_MISS') soundManager.playDoink();
      soundManager.playCrowdRoar('GROAN');
      soundManager.playWhistle();

      const missLabel =
        evalRes === 'DOINK_MISS'
          ? 'OFF THE UPRIGHT! NO GOOD!'
          : evalRes === 'SHORT'
          ? 'KICK IS SHORT!'
          : evalRes === 'WIDE_LEFT'
          ? 'NO GOOD — WIDE LEFT!'
          : 'NO GOOD — WIDE RIGHT!';

      this.completePlay(
        {
          result: this.isPatKickAttempt ? 'PAT_MISS' : 'FIELD_GOAL_MISS',
          yardsGained: 0,
          headline: missLabel,
          description: this.isPatKickAttempt
            ? 'Extra point attempt fails.'
            : `${this.kickMeter.distanceYards}-yard Field Goal misses — possession turns over.`,
          turnover: !this.isPatKickAttempt,
        },
        this.driveState.ballYardLine
      );
    }
  }

  private handlePassResolution(hitGround: boolean): void {
    this.fieldBuilder.updateBallLandingMarker(null, false);
    const receiver = this.thrownReceiver;
    this.thrownReceiver = null;
    this.passLandingPos = null;
    this.footballPhysics.setFlameTrail(false);

    const userOnOff = this.driveState.possession !== 'CPU';
    const isArcadeFire = this.playStyle === 'ARCADE' && userOnOff && this.arcadeState.heatLevel === 2;

    // User defender Swat bonus when pressing E near catch point!
    const userSwatting =
      !userOnOff &&
      this.userControlledDefender &&
      this.userControlledDefender.moveAction === 'SWAT' &&
      (this.userControlledDefender.moveTimer ?? 0) > 0 &&
      Math.hypot(
        this.activeFootballMesh.position.x - this.userControlledDefender.x,
        this.activeFootballMesh.position.z - this.userControlledDefender.z
      ) < 2.3;

    const result =
      hitGround || !receiver
        ? 'INCOMPLETE'
        : userSwatting
        ? 'INTERCEPTION'
        : resolveCatch(this.activeFootballMesh.position, receiver, this.defensePlayers, FIELD.WIDTH, {
            catchRadius: this.tuning.catchRadius,
            interceptRadius: this.tuning.interceptRadius,
            isArcadeFire,
          });

    if (result !== 'COMPLETE' || !receiver) {
      this.clockRunning = false;
      soundManager.playWhistle();
      if (result === 'INTERCEPTION') {
        const offStats = userOnOff ? this.boxScore.user : this.boxScore.cpu;
        offStats.interceptions++;
        soundManager.playCrowdRoar('HYPE');
        soundManager.playBigHit(true);
        if (!userOnOff && this.playStyle === 'ARCADE') {
          this.applyArcadeFeedback('DEF_TAKEAWAY');
        } else if (userOnOff && this.playStyle === 'ARCADE') {
          this.applyArcadeFeedback('COOL_DOWN');
        }
      } else if (userOnOff && this.playStyle === 'ARCADE') {
        this.applyArcadeFeedback('COOL_DOWN');
      }

      const spot = Math.min(99, Math.max(1, Math.round(this.activeFootballMesh.position.z + 50)));
      this.completePlay(
        {
          result: this.isTwoPointAttempt ? 'TWO_PT_FAIL' : result,
          yardsGained: 0,
          headline: result === 'INTERCEPTION' ? 'INTERCEPTED!!' : 'INCOMPLETE PASS',
          description:
            result === 'INTERCEPTION'
              ? 'Picked off at the catch point! Possession changes immediately.'
              : 'Pass falls incomplete — defender disrupted the catch window.',
          turnover: result === 'INTERCEPTION',
          isBigPlay: result === 'INTERCEPTION',
          hasReplay: result === 'INTERCEPTION',
        },
        result === 'INTERCEPTION' ? spot : this.driveState.ballYardLine
      );
      return;
    }

    // Complete Catch! Transition seamlessly into Run After Catch!
    const offStats = userOnOff ? this.boxScore.user : this.boxScore.cpu;
    offStats.completions++;

    receiver.hasBall = true;
    receiver.state = 'CATCHING';
    receiver.isUserControlled = userOnOff;
    receiver.isOnFire = isArcadeFire;
    this.offensePlayers.forEach((p) => {
      if (p.id !== receiver.id) p.isUserControlled = false;
    });
    this.activeBallCarrier = receiver;
    this.activeFootballMesh.visible = false;
    const parts = this.playerMeshes.get(receiver.id);
    if (parts?.ballMesh) parts.ballMesh.visible = true;

    soundManager.playCatch();
    soundManager.playCrowdRoar('CHEER');
    if (userOnOff && this.playStyle === 'ARCADE') {
      const airYards = Math.round(receiver.z - this.yardLineToZ(this.driveState.ballYardLine));
      this.applyArcadeFeedback(airYards >= 20 ? 'BIG_PLAY' : 'COMPLETION');
    }

    // Immediate End-Zone Catch Touchdown!
    if (receiver.z >= 50) {
      const yards = 100 - this.driveState.ballYardLine;
      if (this.isTwoPointAttempt) {
        this.completePlay(
          {
            result: 'TWO_PT_GOOD',
            yardsGained: yards,
            headline: '2-PT CATCH GOOD!',
            description: `${receiver.name} hauls it in for 2 points!`,
            pointsScored: 2,
            isBigPlay: true,
            hasReplay: true,
          },
          100
        );
        return;
      }
      this.completePlay(
        {
          result: 'TOUCHDOWN',
          yardsGained: yards,
          headline: this.playStyle === 'ARCADE' ? 'FROM DOWNTOWN! TOUCHDOWN!' : 'TOUCHDOWN CATCH!',
          description: `${receiver.name} secures the ${yards}-yard touchdown grab in the end zone!`,
          pointsScored: 6,
          isBigPlay: true,
          hasReplay: true,
        },
        100
      );
      return;
    }

    this.notifyState();
  }

  private applyArcadeFeedback(event: Parameters<typeof applyArcadeEvent>[1]): void {
    const { next, ignitedFire } = applyArcadeEvent(this.arcadeState, event);
    this.arcadeState = next;
    if (ignitedFire) {
      soundManager.playFireIgnition();
      soundManager.announce("HE'S ON FIRE!", true);
    } else if (next.calloutText && event !== 'COMPLETION') {
      soundManager.announce(next.calloutText, true);
    }
  }

  private triggerCameraShake(duration: number, intensity: number): void {
    this.cameraShakeTimer = Math.max(this.cameraShakeTimer, duration);
    this.cameraShakeIntensity = Math.max(this.cameraShakeIntensity, intensity);
  }

  public completePlay(outcome: PlayOutcome, newYardLine: number): void {
    const previousBallLine = this.driveState.ballYardLine;
    const gained =
      outcome.result === 'PUNT' || outcome.result === 'FIELD_GOAL_GOOD' || outcome.result === 'PAT_GOOD' || outcome.result === 'PAT_MISS'
        ? outcome.yardsGained
        : newYardLine - previousBallLine;

    const userOnOff = this.driveState.possession !== 'CPU';
    const offStats = userOnOff ? this.boxScore.user : this.boxScore.cpu;
    const playDef = getOffensivePlayDef(this.currentPlayType);

    // Record Yardage & TD Stats
    if (outcome.result === 'TOUCHDOWN' || outcome.result === 'COMPLETE' || outcome.result === 'RUSH_GAIN') {
      if (playDef.category === 'RUN' || this.activeBallCarrier?.role === 'QB') {
        offStats.rushingYards += gained;
        if (outcome.result === 'TOUCHDOWN') offStats.rushingTDs++;
      } else {
        offStats.passingYards += gained;
        if (outcome.result === 'TOUCHDOWN') offStats.passingTDs++;
      }
    }

    this.driveState.driveYards += gained;
    this.driveState.playsInDrive++;
    this.driveState.lastPlayResult = outcome.description;

    // 1. PAT / 2-Pt Resolution -> Kickoff / Flip Possession
    if (
      outcome.result === 'PAT_GOOD' ||
      outcome.result === 'PAT_MISS' ||
      outcome.result === 'TWO_PT_GOOD' ||
      outcome.result === 'TWO_PT_FAIL'
    ) {
      this.isPatKickAttempt = false;
      this.isTwoPointAttempt = false;
      this.driveState.patPending = false;
      if (outcome.pointsScored) {
        this.driveState.offenseTeam.score += outcome.pointsScored;
      }
      this.gameMode = 'PLAY_OVER';
      this.flipPossession(25);
      this.finalizeOutcome(outcome);
      return;
    }

    // 2. Touchdown (+6 pts -> PAT Choice for User, auto-PAT for CPU!)
    if (outcome.result === 'TOUCHDOWN') {
      this.driveState.offenseTeam.score += 6;
      this.fieldBuilder.triggerTouchdownFireworks(this.scene);
      soundManager.playStadiumHorn();
      soundManager.playFireworksExplosion();
      soundManager.playCrowdRoar('TOUCHDOWN');
      soundManager.playOrganFanfare();
      if (userOnOff && this.playStyle === 'ARCADE') {
        this.applyArcadeFeedback('TOUCHDOWN');
      }
      soundManager.announce(
        `TOUCHDOWN ${this.driveState.offenseTeam.city} ${this.driveState.offenseTeam.name}!`,
        this.playStyle === 'ARCADE'
      );

      if (userOnOff) {
        this.driveState.patPending = true;
        this.gameMode = 'PAT_CHOICE';
      } else {
        // CPU automatically kicks XP (90% make rate)
        if (Math.random() < 0.9) this.driveState.offenseTeam.score += 1;
        this.gameMode = 'TOUCHDOWN';
        this.flipPossession(25);
      }
      this.finalizeOutcome(outcome);
      return;
    }

    // 3. Field Goal Good (+3 pts -> Flip Possession)
    if (outcome.result === 'FIELD_GOAL_GOOD') {
      this.driveState.offenseTeam.score += 3;
      this.gameMode = 'PLAY_OVER';
      this.flipPossession(25);
      this.finalizeOutcome(outcome);
      return;
    }

    // 4. Safety (+2 pts to Defense -> Flip Possession at 35)
    if (outcome.result === 'SAFETY') {
      this.driveState.defenseTeam.score += 2;
      this.gameMode = 'TURNOVER';
      this.flipPossession(35);
      this.finalizeOutcome(outcome);
      return;
    }

    // 5. Turnovers (Interception, Fumble, Punt, Missed FG)
    if (
      outcome.result === 'INTERCEPTION' ||
      outcome.result === 'FUMBLE' ||
      outcome.result === 'PUNT' ||
      outcome.result === 'FIELD_GOAL_MISS'
    ) {
      this.gameMode = outcome.result === 'PUNT' ? 'PLAY_OVER' : 'TURNOVER';
      const nextSpot =
        outcome.result === 'PUNT'
          ? newYardLine
          : Math.min(80, Math.max(20, 100 - newYardLine));
      this.flipPossession(nextSpot);
      this.finalizeOutcome(outcome);
      return;
    }

    // 6. Standard Down & Distance Progression
    this.driveState.ballYardLine = newYardLine;
    if (newYardLine >= previousBallLine + this.driveState.yardsToGo) {
      // FIRST DOWN!
      offStats.firstDowns++;
      this.driveState.down = 1;
      this.driveState.yardsToGo = Math.min(10, 100 - newYardLine);
      this.gameMode = 'PLAY_OVER';
      soundManager.playCrowdRoar('CHEER');
      soundManager.playOrganFanfare();
      if (userOnOff && this.playStyle === 'ARCADE') {
        this.applyArcadeFeedback('FIRST_DOWN');
      }
      if (!outcome.headline || outcome.headline.startsWith('+')) {
        outcome.headline = 'FIRST DOWN!';
      }
      soundManager.announce(`First down ${this.driveState.offenseTeam.name}!`);
    } else if (this.driveState.down < 4) {
      this.driveState.down = (this.driveState.down + 1) as 1 | 2 | 3 | 4;
      this.driveState.yardsToGo = Math.max(1, this.driveState.yardsToGo - gained);
      this.gameMode = 'PLAY_OVER';
      if (this.driveState.down === 3) {
        soundManager.playDefenseDrumCadence();
      }
    } else {
      // TURNOVER ON DOWNS!
      this.gameMode = 'TURNOVER';
      outcome.result = 'TURNOVER_DOWNS';
      outcome.headline = 'TURNOVER ON DOWNS!';
      outcome.turnover = true;
      soundManager.playCrowdRoar('GROAN');
      soundManager.announce('Turnover on downs! Defense holds!');
      this.flipPossession(Math.max(1, 100 - newYardLine));
    }

    this.driveState.isRedZone = this.driveState.ballYardLine >= 80;
    this.finalizeOutcome(outcome);
  }

  private flipPossession(nextBallYardLine: number): void {
    this.clockRunning = false;
    this.driveState.down = 1;
    this.driveState.yardsToGo = 10;
    this.driveState.ballYardLine = Math.max(1, Math.min(99, nextBallYardLine));
    this.driveState.driveYards = 0;
    this.driveState.playsInDrive = 1;

    if (this.controlSide === 'OFFENSE_ONLY') {
      // In Offense-Only mode, simulate a quick CPU drive score chance and hand ball back to user!
      if (this.driveState.possession === 'USER') {
        const cpuRoll = Math.random();
        const cpuOff = this.cpuTeam.ratings?.off ?? 86;
        const scoreProb = (cpuOff - 60) / 100;
        if (cpuRoll < scoreProb * 0.65) {
          this.cpuTeam.score += 7;
          this.driveState.lastPlayResult = `${this.cpuTeam.name} answered with a simulated TD drive (+7). Your ball at the 25!`;
        } else if (cpuRoll < scoreProb * 1.15) {
          this.cpuTeam.score += 3;
          this.driveState.lastPlayResult = `${this.cpuTeam.name} kicked a simulated Field Goal (+3). Your ball at the 25!`;
        } else {
          this.driveState.lastPlayResult = `Your defense forced a stop! ${this.userTeam.name} takes over at the 25.`;
        }
        // Advance clock slightly for simulated CPU drive
        this.advanceClock(32);
        this.driveState.ballYardLine = 25;
      }
      this.driveState.possession = 'USER';
    } else {
      this.driveState.possession = this.driveState.possession === 'USER' ? 'CPU' : 'USER';
    }

    const userOnOff = this.driveState.possession === 'USER';
    this.driveState.offenseTeam = userOnOff ? this.userTeam : this.cpuTeam;
    this.driveState.defenseTeam = userOnOff ? this.cpuTeam : this.userTeam;
    this.driveState.isRedZone = this.driveState.ballYardLine >= 80;
  }

  public choosePatOption(kind: 'KICK' | 'TWO_PT'): void {
    this.driveState.patPending = false;
    this.driveState.down = 1;
    if (kind === 'KICK') {
      this.isPatKickAttempt = true;
      this.isTwoPointAttempt = false;
      this.driveState.ballYardLine = 85; // 33-yard PAT kick
      this.driveState.yardsToGo = 15;
      this.gameMode = 'KICKING';
      this.setupPlay('ST_FIELD_GOAL', 'DEF_GOAL_LINE');
    } else {
      this.isPatKickAttempt = false;
      this.isTwoPointAttempt = true;
      this.driveState.ballYardLine = 98; // 2-yard line!
      this.driveState.yardsToGo = 2;
      this.gameMode = 'PLAYCALL';
      this.notifyState();
    }
  }

  private finalizeOutcome(outcome: PlayOutcome): void {
    this.updateJumbotron();
    this.onPlayEnd?.(outcome);
    this.notifyState();
  }

  public nextDown(openPlaycall: boolean = true): void {
    this.isReplaying = false;

    // Check for Quarter End / Halftime / Final Score
    if ((this.driveState.gameClockSeconds ?? 180) <= 0) {
      const qLen = this.driveState.quarterLengthSeconds ?? 180;
      if (this.driveState.quarter === 2) {
        this.driveState.quarter = 3;
        this.driveState.gameClockSeconds = qLen;
        this.driveState.timeRemaining = formatGameClock(qLen);
        this.userTeam.timeouts = 3;
        this.cpuTeam.timeouts = 3;
        this.gameMode = 'HALFTIME';
        this.notifyState();
        return;
      } else if (this.driveState.quarter >= 4 && this.userTeam.score !== this.cpuTeam.score) {
        this.gameMode = 'GAME_OVER';
        soundManager.playStadiumHorn();
        this.notifyState();
        return;
      } else {
        this.driveState.quarter += 1;
        this.driveState.gameClockSeconds = qLen;
        this.driveState.timeRemaining = formatGameClock(qLen);
      }
    }

    if (openPlaycall) {
      this.gameMode = 'PLAYCALL';
      this.notifyState();
    } else {
      this.launchSelectedPlay(this.currentPlayType, this.currentDefensePlay);
    }
  }

  public launchSelectedPlay(offPlay: PlayType, defPlay?: DefensePlayType): void {
    const userOnOff = this.driveState.possession !== 'CPU';
    const finalOff = userOnOff ? offPlay : chooseCpuOffensePlay(this.driveState);
    const finalDef = userOnOff ? (defPlay || chooseCpuDefensePlay(this.driveState)) : (defPlay || 'DEF_COVER_2');

    this.gameMode =
      userOnOff && (finalOff === 'ST_FIELD_GOAL' || finalOff === 'ST_PUNT') ? 'KICKING' : 'PLAYING';
    this.setupPlay(finalOff, finalDef);
  }

  private advanceClock(delta: number): void {
    const cur = this.driveState.gameClockSeconds ?? 180;
    const next = Math.max(0, cur - delta);
    this.driveState.gameClockSeconds = next;
    this.driveState.timeRemaining = formatGameClock(next);
  }

  private updateJumbotron(): void {
    const downDist = formatDownLabel(this.driveState.down, this.driveState.yardsToGo, this.driveState.ballYardLine);
    const ballLoc = `BALL ON ${formatYardSpot(
      this.driveState.ballYardLine,
      this.driveState.offenseTeam.abbr || 'OWN',
      this.driveState.defenseTeam.abbr || 'OPP'
    )}`;
    const score = `${(this.userTeam.abbr || this.userTeam.name).toUpperCase()} ${this.userTeam.score}  -  ${(
      this.cpuTeam.abbr || this.cpuTeam.name
    ).toUpperCase()} ${this.cpuTeam.score}   ·   Q${this.driveState.quarter} ${this.driveState.timeRemaining}`;
    const venue =
      this.playStyle === 'ARCADE'
        ? '🔥 FIRSTLIGHT FEVER JAM · ARCADE GRIDIRON 🔥'
        : `${(this.userTeam.stadiumName || 'FIRSTLIGHT CITADEL').toUpperCase()} · SOL LEAGUE`;

    this.fieldBuilder.renderJumbotron(0, downDist, ballLoc, score, venue);
    this.fieldBuilder.renderJumbotron(1, downDist, ballLoc, score, venue);
  }

  private notifyState(): void {
    this.onStateChange?.(
      { ...this.driveState },
      this.gameMode,
      Math.max(0, this.pocketTimeRemaining),
      Boolean(this.activeBallCarrier),
      { ...this.arcadeState },
      { ...this.kickMeter },
      {
        user: { ...this.boxScore.user },
        cpu: { ...this.boxScore.cpu },
      }
    );
  }

  private animate = (): void => {
    this.animId = requestAnimationFrame(this.animate);

    const delta = Math.min(this.animClock.getDelta(), 0.1);
    const animTime = this.animClock.getElapsedTime();

    this.fieldBuilder.updatePrecipitation(delta);

    let excitement = 1.0;
    if (this.gameMode === 'TOUCHDOWN' || this.gameMode === 'PAT_CHOICE') excitement = 3.0;
    else if (this.arcadeState.heatLevel === 2) excitement = 2.4;
    else if (this.activeBallCarrier || this.isPassInAir || this.isKickInAir) excitement = 1.85;
    else if (this.driveState.down === 3 || this.driveState.isRedZone) excitement = 1.5;

    this.fieldBuilder.updateStadiumEffects(animTime, delta, this.scene, excitement);

    // Kick Meter Oscillation
    if (this.gameMode === 'KICKING' && this.kickMeter.active) {
      const rate = this.tuning.kickNeedleSpeed * delta;
      if (this.kickMeter.phase === 'POWER') {
        this.kickMeter.power += this.kickMeterDir * rate;
        if (this.kickMeter.power >= 1) {
          this.kickMeter.power = 1;
          this.kickMeterDir = -1;
        } else if (this.kickMeter.power <= 0.1) {
          this.kickMeter.power = 0.1;
          this.kickMeterDir = 1;
        }
      } else if (this.kickMeter.phase === 'ACCURACY') {
        this.kickMeter.accuracy += this.kickMeterDir * rate * 1.45;
        if (this.kickMeter.accuracy >= 1) {
          this.kickMeter.accuracy = 1;
          this.kickMeterDir = -1;
        } else if (this.kickMeter.accuracy <= -1) {
          this.kickMeter.accuracy = -1;
          this.kickMeterDir = 1;
        }
      }
      this.hudElapsed += delta;
      if (this.hudElapsed >= 0.04) {
        this.hudElapsed = 0;
        this.notifyState();
      }
    }

    // Instant Replay Playback
    if (this.isReplaying && this.replayFrames.length > 0) {
      this.replayPlaybackAccum += delta * 24;
      this.replayPlaybackIdx = Math.floor(this.replayPlaybackAccum) % this.replayFrames.length;
      const frame = this.replayFrames[this.replayPlaybackIdx];
      this.activeFootballMesh.position.set(...frame.ballPos);
      this.activeFootballMesh.visible = frame.ballVisible;
      for (const [id, [x, y, z, h]] of Object.entries(frame.players)) {
        const parts = this.playerMeshes.get(id);
        if (parts) {
          parts.root.position.set(x, y, z);
          parts.root.rotation.y = h;
        }
      }
      this.updateCamera(delta);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // Fixed-step Simulation (120Hz)
    this.simulationRemainder += delta;
    while (this.simulationRemainder >= 1 / 120) {
      this.simulationRemainder -= 1 / 120;
      const step = 1 / 120;
      if (this.gameMode !== 'PLAYING') continue;

      if (!this.isBallSnapped && this.driveState.possession === 'CPU') {
        this.cpuAutoSnapTimer -= step;
        if (this.cpuAutoSnapTimer <= 0) {
          this.snapBall();
        }
      }

      if (this.isBallSnapped) {
        this.playElapsed += step;
        if (this.clockRunning) this.advanceClock(step);
        this.replayCaptureTimer += step;
        if (this.replayCaptureTimer >= 1 / 24) {
          this.replayCaptureTimer = 0;
          this.captureReplayFrame();
        }
      }

      this.updateRunHandoff(step);
      this.updatePocketAndRushers(step);
      this.updateReceiversAndCoverage(step);
      this.updatePlayerControlsAndCarrier(step);

      if (this.isPassInAir) {
        const physicsResult = this.footballPhysics.update(step);
        if (physicsResult.arrived || physicsResult.hitGround) {
          this.isPassInAir = false;
          this.handlePassResolution(physicsResult.hitGround);
        }
      } else if (this.isKickInAir) {
        const kickResult = this.footballPhysics.update(step);
        if (kickResult.arrived || kickResult.hitGround) {
          this.handleKickResolution();
        }
      }
    }

    // Sync 3D Player Meshes & Animations
    const allPlayers = [...this.offensePlayers, ...this.defensePlayers];
    const showBadges =
      this.driveState.possession !== 'CPU' &&
      !this.activeBallCarrier &&
      getOffensivePlayDef(this.currentPlayType).category !== 'RUN' &&
      getOffensivePlayDef(this.currentPlayType).category !== 'SPECIAL';

    allPlayers.forEach((player) => {
      const parts = this.playerMeshes.get(player.id);
      if (parts) {
        parts.root.position.set(player.x, player.y, player.z);
        // 360 Spin move visual flourish!
        const spinSpin =
          player.moveAction === 'SPIN' && (player.moveTimer ?? 0) > 0
            ? (0.48 - (player.moveTimer ?? 0)) * Math.PI * 4.5
            : 0;
        parts.root.rotation.y = player.heading + spinSpin;

        const isOpen = player.route ? player.route.isOpen : false;
        PlayerMeshBuilder.animatePlayer(
          parts,
          player,
          animTime,
          isOpen,
          this.tuning.showSeparationRings && showBadges
        );
        if (parts.badgeSprite && player.route) {
          const size =
            (this.camera.position.distanceTo(parts.root.position) *
              2 *
              Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) *
              42) /
            Math.max(1, this.container.clientHeight);
          parts.badgeSprite.scale.setScalar(size);
          parts.badgeSprite.visible = showBadges && (this.gameMode === 'PLAYING' || this.gameMode === 'PLAYCALL');
          parts.badgeSprite.material.opacity = player.id === this.selectedTargetReceiver?.id ? 1 : 0.82;
        }
      }
    });

    this.routes.update(
      this.selectedTargetReceiver?.id,
      this.showRoutes &&
        showBadges &&
        (this.gameMode === 'PLAYING' || this.gameMode === 'PLAYCALL') &&
        !this.activeBallCarrier &&
        !this.isPassInAir
    );

    this.updateCamera(delta);

    // Guided Catch-Point Chevron
    if (
      this.isBallSnapped &&
      this.isGuidedMode &&
      this.selectedTargetReceiver &&
      this.gameMode === 'PLAYING' &&
      !this.activeBallCarrier &&
      showBadges
    ) {
      this.fieldBuilder.catchPointChevron.visible = true;
      this.fieldBuilder.catchPointChevron.position.set(
        this.selectedTargetReceiver.x,
        3.25 + Math.sin(animTime * 4) * 0.2,
        this.selectedTargetReceiver.z
      );
    } else {
      this.fieldBuilder.catchPointChevron.visible = false;
    }

    this.renderer.render(this.scene, this.camera);
  };

  private updateCamera(delta: number): void {
    if (this.gameMode === 'MENU' || this.gameMode === 'PRE_DRIVE') {
      const animTime = this.animClock.getElapsedTime();
      const t = animTime * 0.08;
      this.camera.position.set(Math.sin(t) * 28, 13.5 + Math.sin(t * 0.5) * 3.0, -24 + Math.cos(t) * 16);
      this.camera.lookAt(0, 4.5, 16);
      return;
    }

    if (this.isReplaying) {
      const focus = this.activeFootballMesh.visible
        ? this.activeFootballMesh.position
        : new THREE.Vector3(0, 2, this.yardLineToZ(this.driveState.ballYardLine) + 6);
      this.camera.position.lerp(new THREE.Vector3(-22, 11, focus.z - 8), 1 - Math.exp(-6 * delta));
      this.camera.lookAt(focus.x * 0.4, 2.0, focus.z + 2);
      return;
    }

    const qb = this.offensePlayers.find((p) => p.role === 'QB' || p.role === 'K');
    const carrier = this.activeBallCarrier || qb;
    const losZ = this.yardLineToZ(this.driveState.ballYardLine);

    // Dynamic Arcade Speed FOV Boost
    const targetFov =
      this.playStyle === 'ARCADE' && (this.arcadeState.heatLevel === 2 || (this.playerInput.sprint && this.activeBallCarrier))
        ? 57
        : 50;
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, delta * 6);
      this.camera.updateProjectionMatrix();
    }

    if (this.cameraMode === 'BEHIND_QB') {
      if (carrier) {
        let targetCamX = carrier.x * 0.58;
        let targetCamY = 7.4;
        let targetCamZ = carrier.z - 12.5;
        let lookTargetX = carrier.x * 0.3;
        let lookTargetY = 1.8;
        let lookTargetZ = carrier.z + 15;

        if (!this.isBallSnapped && this.gameMode !== 'KICKING') {
          targetCamX = 0;
          targetCamY = 17.5;
          targetCamZ = losZ - 24;
          lookTargetX = 0;
          lookTargetY = 0.5;
          lookTargetZ = losZ + 10;
        } else if (this.gameMode === 'KICKING' || this.isKickInAir) {
          targetCamX = 0;
          targetCamY = 4.2;
          targetCamZ = (this.isKickInAir ? this.activeFootballMesh.position.z : losZ - 8) - 11;
          lookTargetX = 0;
          lookTargetY = 6.5;
          lookTargetZ = 60;
        } else if (this.isPassInAir && this.activeFootballMesh.visible) {
          targetCamZ = this.activeFootballMesh.position.z - 10.5;
          targetCamY = 6.5;
          lookTargetX = this.activeFootballMesh.position.x * 0.5;
          lookTargetY = 2.0;
          lookTargetZ = this.activeFootballMesh.position.z + 6.5;
        }

        this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, targetCamX, 1 - Math.exp(-10 * delta));
        this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, targetCamY, 1 - Math.exp(-10 * delta));
        this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, targetCamZ, 1 - Math.exp(-10 * delta));
        this.camera.lookAt(lookTargetX, lookTargetY, lookTargetZ);
      }
    } else if (this.cameraMode === 'BROADCAST') {
      const focusZ = this.isPassInAir ? this.activeFootballMesh.position.z : carrier ? carrier.z : losZ;
      this.camera.position.lerp(new THREE.Vector3(-FIELD.WIDTH / 2 - 11, 15.5, focusZ - 2), 1 - Math.exp(-8 * delta));
      this.camera.lookAt(carrier ? carrier.x * 0.45 : 0, 1.5, focusZ + 4);
    } else if (this.cameraMode === 'ALL_22') {
      const focusZ = carrier ? carrier.z : losZ;
      this.camera.position.lerp(new THREE.Vector3(0, 27, focusZ - 29), 1 - Math.exp(-8 * delta));
      this.camera.lookAt(0, 0, focusZ + 16);
    } else if (this.cameraMode === 'FIRST_PERSON') {
      const pov = this.driveState.possession === 'CPU' ? this.userControlledDefender : carrier;
      if (pov) {
        this.camera.position.set(pov.x, 2.05, pov.z + 0.15);
        this.camera.lookAt(pov.x, 2.0, pov.z + (pov.team === 'OFFENSE' ? 22 : -22));
      }
    }

    // Impact Camera Micro-Shake (Big Hits / Sacks / Arcade Boom)
    if (this.cameraShakeTimer > 0) {
      this.cameraShakeTimer = Math.max(0, this.cameraShakeTimer - delta);
      const amp = this.cameraShakeIntensity * (this.cameraShakeTimer / 0.35);
      this.camera.position.x += (Math.random() - 0.5) * amp;
      this.camera.position.y += (Math.random() - 0.5) * amp;
    }
  }

  private handleResize = (): void => {
    if (!this.container) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / (height || 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  public destroy(): void {
    this.destroyed = true;
    this.environmentMap?.dispose();
    cancelAnimationFrame(this.animId);
    window.removeEventListener('resize', this.handleResize);
    this.renderer.dispose();
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
